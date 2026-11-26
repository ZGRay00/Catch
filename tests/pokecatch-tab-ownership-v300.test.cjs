const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t){
    const before={document:global.document,now:Date.now};let clock=new Date(2026,10,17,12).getTime();Date.now=()=>clock;
    global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{Date.now=before.now;if(before.document===undefined)delete global.document;else global.document=before.document;});
    const s={trainer:{id:'tab-ownership'},mons:[{uid:'a',id:6,level:50}],team:['a'],road:['a'],dex:{},money:1000,stats:{},items:{},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const key='pokecatch-helper:v1:tab-ownership',leaseKey='pokecatch-helper:v1:lease:tab-ownership',writes=[];
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','tab-a']]);
    const storage={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push(['set',key]);data.set(key,String(value));},removeItem:key=>{writes.push(['remove',key]);data.delete(key);}};
    const make=()=>{const engine=new H.Engine(storage,{mode:'money',autoPrepare:false,autoTeam:false,raids:false,moneyBuff:false});engine.loadAccount(s);engine.read();engine.schedule=()=>{};return engine;};
    const e=make();e.running=true;e.started=clock;e.tabToken='tab-a';e.automation.begin(s);assert.equal(e.acquire(clock),true);e.persist();writes.length=0;
    function otherOwner(native=true){
        clock+=10001;if(native)storage.setItem('pokecatch-tab','tab-b');
        const other=make();other.settings.mode='progress';other.tabToken=storage.getItem('pokecatch-tab');other.running=true;other.started=clock;other.budget.spent=321;other.budget.used=4;
        other.queue=H.normalizeJobs([{settings:other.settings,status:'running',title:'new owner'}]);other.queueRunning=true;assert.equal(other.acquire(clock),true);other.persist();writes.length=0;
        return{other,record:storage.getItem(key),lease:storage.getItem(leaseKey)};
    }
    return{e,s,data,storage,writes,key,leaseKey,make,otherOwner,now:()=>clock};
}

test('an interrupted tab can edit a running queue across reloads without changing the owner checkpoint',t=>{
    const {e,s,storage,key,leaseKey,otherOwner,make}=fixture(t);
    const {other}=otherOwner();other.loadAccount(s);
    const current=other.queue[0],second={...current,id:'second',title:'second',status:'pending',progress:undefined};
    other.queue.push(second);other.persist();e.running=false;e.loadAccount(s);
    const record=storage.getItem(key),lease=storage.getItem(leaseKey);
    const added={...second,id:'added',title:'added'};
    e.updateQueue([],{kind:'add',id:added.id,job:added});
    e.updateQueue([],{kind:'move',id:added.id,anchor:current.id,after:false});
    e.updateQueue([],{kind:'remove',id:second.id});
    assert.deepEqual(make().editableQueue().map(job=>job.id),[added.id,current.id]);
    assert.equal(storage.getItem(key),record);assert.equal(storage.getItem(leaseKey),lease);
    other.completeTask('finished original');
    assert.equal(other.queue[other.queueIndex].id,added.id);
    assert.equal(other.queue.find(job=>job.id===current.id).status,'done');
    const reloaded=make();assert.deepEqual(reloaded.editableQueue().map(job=>job.id),[added.id,current.id]);
    assert.equal(reloaded.queueEdits.length,0);
});

test('refresh resumes an edited active row with the latest budget and a skipped row yields to the next task',t=>{
    const {e,s,make}=fixture(t);
    const job={id:'current',settings:{...e.settings,mode:'money',moneyTarget:3000},status:'running'};
    e.queue=H.normalizeJobs([job,{...job,id:'next',status:'pending'}]);e.queueRunning=true;
    e.budget.used=3;e.persist();const editor=make();
    editor.updateQueue([],{kind:'edit',id:job.id,job:{...job,settings:{...job.settings,moneyTarget:9000}},keepProgress:true,wasPending:true});
    e.budget.used=7;e.persist();e.release();
    const fresh=make();fresh.tryResume();
    assert.ok(fresh.running,fresh.status);assert.equal(fresh.queue[fresh.queueIndex].id,job.id);
    assert.equal(fresh.settings.moneyTarget,9000);assert.equal(fresh.budget.used,7);
    fresh.suspend();const foreign=make();foreign.updateQueue([],{kind:'skip',id:job.id});
    fresh.resumeSuspended(true);
    assert.ok(fresh.running,fresh.status);assert.equal(fresh.queue[fresh.queueIndex].id,'next');
    assert.equal(fresh.queue[0].status,'skipped');fresh.stop();fresh.loadAccount(s);
    assert.equal(fresh.queueEdits.length,0);
});

test('a loaded account can save queue changes with an unavailable game save and cannot write them into a different account',t=>{
    const {e,s,storage,key,make}=fixture(t),record=storage.getItem(key);
    const job={id:'offline',status:'pending',settings:{mode:'money'}};
    storage.removeItem('gachamon-save-v1');
    e.updateQueue([],{kind:'add',id:job.id,job});
    assert.equal(storage.getItem(key),record);
    storage.setItem('gachamon-save-v1',JSON.stringify({...s,trainer:{id:'another-account'}}));
    assert.throws(()=>e.updateQueue([],{kind:'remove',id:job.id}),/账号/);
    storage.setItem('gachamon-save-v1',JSON.stringify(s));
    assert.deepEqual(make().editableQueue().map(job=>job.id),['offline']);
});

function nativeDocument(engine,{rendered=false,prerendering=false,foreignModal=false,ordinaryModal=false,clockAt=null,publicLock=null}={}){
    const listeners=new Map(),win=new EventTarget(),life=new AbortController();
    const src='https://pokecatch-online.pages.dev/bundle/app.65ffd40d41.js',origin='https://pokecatch-online.app';
    win.TabLock=publicLock;
    win.performance={timeOrigin:Date.now()-1000,getEntriesByType:()=>clockAt===null?[]:[
        {name:src,responseEnd:800,initiatorType:'link'},
        {name:'https://pokecatch-online.pages.dev/boot.js?clock=probe',startTime:clockAt,initiatorType:'fetch'}]};
    const doc={location:{hostname:'pokecatch-online.app',origin,pathname:'/'},baseURI:origin+'/',defaultView:win,prerendering,
        querySelector:selector=>selector.includes('.side-chap-top')?rendered:selector.includes('.tab-modal')?foreignModal:
            selector.startsWith('#modal-root.open')?ordinaryModal:selector.includes('/bundle/app.')?{src}:null,
        addEventListener:(name,fn)=>listeners.set(name,fn)};
    engine.observeGameTab(doc,life.signal);
    return {
        load(path='bundle/app.65ffd40d41.js'){listeners.get('load')({target:{tagName:'SCRIPT',src:'https://pokecatch-online.pages.dev/'+path}});},
        activate(){doc.prerendering=false;listeners.get('prerenderingchange')();},
        foreignWrite(token){engine.storage.setItem('pokecatch-tab',token);win.dispatchEvent(Object.assign(new Event('storage'),{key:'pokecatch-tab',newValue:token,storageArea:engine.storage}));},
        close(){life.abort();}
    };
}

test('reload leaves the checkpoint and lease alone until the native app in this document has claimed its token',async t=>{
    const {e,storage,key,leaseKey,make}=fixture(t);e.release();
    const record=storage.getItem(key),fresh=make(),page=nativeDocument(fresh);t.after(()=>page.close());
    page.load('bundle/vendor.123.js');
    fresh.tryResume();assert.equal(fresh.running,false);assert.equal(fresh.tabToken,undefined);
    assert.equal(storage.getItem(leaseKey),null);assert.equal(storage.getItem(key),record);
    assert.equal(fresh.ownsGameTab(),false);assert.equal(fresh.mayPersist(),false);
    storage.setItem('pokecatch-tab','same-document-fresh');page.load();fresh.tryResume();
    assert.equal(fresh.running,true,fresh.status);assert.equal(fresh.tabToken,'same-document-fresh');
    assert.equal(fresh.ownsGameTab(),true);
    page.foreignWrite('actual-other-document');await fresh.step();
    assert.equal(fresh.running,false);assert.equal(fresh.lastStop.signals.tabControl.tokenMatches,false);
    assert.equal(fresh.lastStop.signals.tabControl.lease,'own');fresh.start();
    assert.equal(fresh.running,false);assert.equal(fresh.acquire(Date.now()),false);
});

test('late injection uses rendered native DOM and a native takeover dialog blocks acquisition',t=>{
    const {e,make,leaseKey,storage}=fixture(t);e.release();
    const token=(Date.now()-100).toString(36)+'aaa111';storage.setItem('pokecatch-tab',token);
    const ready=make(),viewer=nativeDocument(ready,{rendered:true,clockAt:901});t.after(()=>viewer.close());
    assert.equal(ready.ownsGameTab(),true);assert.equal(ready.tabToken,token);
    const stale=make(),other=nativeDocument(stale,{rendered:true,foreignModal:true});t.after(()=>other.close());
    assert.equal(stale.ownsGameTab(),false);stale.tryResume();assert.equal(stale.running,false);
    assert.equal(storage.getItem(leaseKey),null);
});

test('late injection cannot bind a younger foreign token or assume ownership from an occupied modal queue',t=>{
    const {e,storage,make}=fixture(t);e.release();
    storage.setItem('pokecatch-tab',Date.now().toString(36)+'aaa111');
    for(const ordinaryModal of [false,true]){
        const stale=make(),page=nativeDocument(stale,{rendered:true,clockAt:901,ordinaryModal});t.after(()=>page.close());
        stale.tryResume();assert.equal(stale.running,false);assert.equal(stale.tabToken,undefined);
        assert.equal(stale.acquire(Date.now()),false);assert.equal(stale.mayPersist(),false);
    }
    const opaque=make(),opaquePage=nativeDocument(opaque,{rendered:true});t.after(()=>opaquePage.close());
    opaque.tryResume();assert.match(opaque.status,/刷新本页/);assert(opaque.checkpoint?.wanted);
    const legacy=make(),legacyPage=nativeDocument(legacy,{rendered:true,publicLock:{mine:()=>true}});t.after(()=>legacyPage.close());
    assert.equal(legacy.ownsGameTab(),true);
});

test('prerender activation waits for the native listener before binding the document',async t=>{
    const {e,storage,make}=fixture(t);e.release();
    const fresh=make(),page=nativeDocument(fresh,{prerendering:true});t.after(()=>page.close());
    page.load();page.activate();assert.equal(fresh.ownsGameTab(),false);
    storage.setItem('pokecatch-tab','activated');await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(fresh.ownsGameTab(),true);assert.equal(fresh.tabToken,'activated');
});

test('losing the helper lease stops local work without overwriting the active owner checkpoint',async t=>{
    const {e,storage,key,leaseKey,writes,otherOwner,now}=fixture(t),owner=otherOwner(false);
    await e.step(now());assert.equal(e.running,false);assert.match(e.status,/另一个标签页/);
    assert.deepEqual(e.lastStop.signals.tabControl,{native:'owner',tokenMatches:true,lease:'other'});
    assert.equal(storage.getItem(key),owner.record);assert.equal(storage.getItem(leaseKey),owner.lease);assert.deepEqual(writes,[]);
});

test('a different native tab token is checked before claiming an otherwise vacant lease',async t=>{
    const {e,storage,key,leaseKey,writes,otherOwner,now}=fixture(t),owner=otherOwner();storage.removeItem(leaseKey);writes.length=0;
    await e.step(now());assert.equal(e.running,false);assert.equal(storage.getItem(key),owner.record);assert.equal(storage.getItem(leaseKey),null);assert.deepEqual(writes,[]);
});

test('Stop from a stale tab preserves the new owner settings, queue and reserved budget',t=>{
    const {e,storage,key,leaseKey,writes,otherOwner}=fixture(t),owner=otherOwner();e.budget.spent=999;e.stop('old tab stop');
    assert.equal(e.running,false);assert.equal(storage.getItem(key),owner.record);assert.equal(storage.getItem(leaseKey),owner.lease);assert.deepEqual(writes,[]);
    const current=JSON.parse(storage.getItem(key));assert.equal(current.resume.budget.spent,321);assert.equal(current.queue[0].title,'new owner');
});

test('pagehide from a stale tab cancels only its local session',t=>{
    const {e,storage,key,leaseKey,writes,otherOwner}=fixture(t),owner=otherOwner();e.suspend();
    assert.equal(e.running,false);assert.equal(e.suspended,null);assert.equal(storage.getItem(key),owner.record);assert.equal(storage.getItem(leaseKey),owner.lease);assert.deepEqual(writes,[]);
});

test('a fresh tab refused at Start cannot erase another tab resume checkpoint',t=>{
    const {e,make,storage,key,leaseKey,writes,otherOwner}=fixture(t),owner=otherOwner(),fresh=make();fresh.start();
    assert.equal(fresh.running,false);assert.match(fresh.status,/另一个标签页/);assert.equal(storage.getItem(key),owner.record);assert.equal(storage.getItem(leaseKey),owner.lease);assert.deepEqual(writes,[]);e.running=false;
});

test('BFCache recovery after a native takeover cannot overwrite the new owner record',t=>{
    const {e,storage,key,leaseKey,writes,otherOwner}=fixture(t);e.suspend();const owner=otherOwner();assert.equal(e.resumeSuspended(),false);
    assert.equal(e.suspended,null);assert.equal(storage.getItem(key),owner.record);assert.equal(storage.getItem(leaseKey),owner.lease);assert.deepEqual(writes,[]);
});

test('discarding an incompatible old resume record leaves the live owner checkpoint intact',t=>{
    const {e,make,storage,key,leaseKey,writes,otherOwner}=fixture(t),owner=otherOwner(false),fresh=make();
    fresh.checkpoint={...fresh.checkpoint,layout:-1};fresh.tryResume();assert.equal(fresh.checkpoint,null);
    assert.equal(storage.getItem(key),owner.record);assert.equal(storage.getItem(leaseKey),owner.lease);assert.deepEqual(writes,[]);e.running=false;
});

test('the controlling tab still saves current queue progress and budget on an ordinary Stop',t=>{
    const {e,storage,key,leaseKey}=fixture(t);e.queue=H.normalizeJobs([{settings:e.settings,status:'running'}]);e.queueRunning=true;e.budget.spent=432;e.budget.used=5;e.stop('user stop');
    const saved=JSON.parse(storage.getItem(key));assert.equal(saved.resume,null);assert.equal(saved.queue[0].status,'paused');assert.equal(saved.queue[0].progress.budget.spent,432);assert.equal(saved.queue[0].progress.budget.used,5);
    assert.equal(storage.getItem(leaseKey),null);assert.equal(e.running,false);assert.equal(e.queueRunning,false);
});

test('an explicit local-only Stop never writes a checkpoint even when its lease is still owned',t=>{
    const {e,storage,key,writes}=fixture(t),record=storage.getItem(key);e.stop('control lost',{persist:false});
    assert.equal(storage.getItem(key),record);assert.equal(writes.some(([,writtenKey])=>writtenKey===key),false);assert.equal(e.running,false);
});

test('queue edits follow the job ID across a move and roll back if settings cannot be saved',t=>{
    const {e,storage,key}=fixture(t);
    e.stop();e.queue=H.normalizeJobs([{id:'a',settings:{mode:'money'}},{id:'b',settings:{mode:'train'}}]);
    e.queueIndex=1;e.queueDraftBase={...e.settings};e.settings.mode='resource';
    e.updateQueue([e.queue[1],e.queue[0]]);
    assert.equal(e.queueIndex,0);
    assert.deepEqual(JSON.parse(storage.getItem(key)).queue.map(job=>job.id),['b','a']);
    assert.equal(JSON.parse(storage.getItem(key)).settings.mode,'money');
    const prior=e.queue,write=storage.setItem;
    storage.setItem=(name,value)=>{if(name===key)throw Error('storage full');write(name,value);};
    assert.throws(()=>e.updateQueue([e.queue[1]]),/storage full/);
    assert.equal(e.queue,prior);assert.equal(e.queueIndex,0);
});

test('reloaded queue checkpoints find the intended job by ID even when its old index changed',t=>{
    const {e,storage,key,make}=fixture(t);
    e.queue=H.normalizeJobs([{id:'a',settings:e.settings,status:'running'},{id:'b',settings:e.settings}]);
    e.queueRunning=true;e.budget.used=4;e.persist();e.release();
    const record=JSON.parse(storage.getItem(key));
    assert.equal(record.resume.queueJobId,'a');
    record.queue.reverse();
    storage.setItem(key,JSON.stringify(record));
    const resumed=make();resumed.start(true);
    assert.equal(resumed.running,true,resumed.status);
    assert.equal(resumed.queue[resumed.queueIndex].id,'a');assert.equal(resumed.budget.used,4);
    resumed.stop();
});

test('storage failures during ownership checks still allow Stop to clear its local scheduler',t=>{
    const {e,storage}=fixture(t);storage.getItem=()=>{throw new Error('storage unavailable');};e.timer=setTimeout(()=>{},60000);
    assert.doesNotThrow(()=>e.stop('storage unavailable'));assert.equal(e.running,false);assert.equal(e.timer,null);
});

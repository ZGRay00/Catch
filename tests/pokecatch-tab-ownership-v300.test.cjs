const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t){
    const before={document:global.document,now:Date.now};let clock=new Date(2026,10,17,12).getTime();Date.now=()=>clock;
    global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{Date.now=before.now;if(before.document===undefined)delete global.document;else global.document=before.document;});
    const s={trainer:{id:'tab-ownership'},mons:[{uid:'a',id:6,level:50}],team:['a'],road:['a'],dex:{},money:1000,stats:{},items:{},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const key='pokecatch-helper:v1:tab-ownership',leaseKey='pokecatch-helper:v1:lease:tab-ownership',writes=[];
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','tab-a']]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push(['set',key]);data.set(key,String(value));},removeItem:key=>{writes.push(['remove',key]);data.delete(key);}};
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

test('losing the helper lease stops local work without overwriting the active owner checkpoint',async t=>{
    const {e,storage,key,leaseKey,writes,otherOwner,now}=fixture(t),owner=otherOwner(false);
    await e.step(now());assert.equal(e.running,false);assert.match(e.status,/另一个标签页/);
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

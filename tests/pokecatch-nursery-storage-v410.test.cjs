const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
function fixture(){
    const s={trainer:{id:'nursery-store',since:123},mons:[],team:[],dex:{},stats:{hatched:100},pension:{eggs:[],mons:[],laid:0},adv:{layout:H.DATA.layout,chapter:0,unlocked:0,loops:[]}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','nursery-tab']]),writes=[];
    const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{writes.push(k);data.set(k,String(v));},removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage);e.loadAccount(s);e.tabToken='nursery-tab';const commit=()=>{data.set('gachamon-save-v1',JSON.stringify(s));e.read();};
    return{s,data,writes,storage,e,commit,key:H.NURSERY_STORE_PREFIX+encodeURIComponent(s.trainer.id)};
}
test('nursery observations persist while stopped without rewriting the game, task profile or queue',()=>{
    const f=fixture(),originalProfile=JSON.stringify({settings:{mode:'money'},queue:[{id:'keep'}],resume:{wanted:true}});f.data.set('pokecatch-helper:v1:nursery-store',originalProfile);
    f.s.pension.eggs=[{uid:'flash',id:25,shiny:true,hatchAt:1}];f.commit();
    assert.equal(f.e.running,false);assert.equal(f.e.nurseryMonitor.ledger.stats.shinyObserved,1);
    f.s.pension.eggs=[];f.s.stats.hatched++;f.commit();
    assert.equal(f.e.nurseryMonitor.ledger.stats.shinyHatched,1);assert.equal(f.data.get('pokecatch-helper:v1:nursery-store'),originalProfile);
    assert.ok(f.writes.every(key=>key===f.key));assert.equal(JSON.parse(f.data.get('gachamon-save-v1')).stats.hatched,101);
});
test('reload and repeated unchanged reads never duplicate observations or hatch confirmations',()=>{
    const f=fixture();f.s.pension.eggs=[{uid:'a',id:25,shiny:true,hatchAt:1}];f.commit();
    const e=new H.Engine(f.storage);e.loadAccount(f.s);e.tabToken='nursery-tab';e.read();
    assert.equal(e.nurseryMonitor.ledger.stats.shinyObserved,1);f.s.pension.eggs=[];f.s.stats.hatched++;f.data.set('gachamon-save-v1',JSON.stringify(f.s));e.read();
    for(let i=0;i<4;i++){e.read();e.nurseryMonitor.observe(f.s);}
    assert.equal(e.nurseryMonitor.ledger.stats.hatched,1);assert.equal(e.nurseryMonitor.ledger.stats.shinyHatched,1);
});
test('nursery reset rebaselines local observations and preserves native history, eggs and task checkpoint',()=>{
    const f=fixture();f.s.pension.eggs=[{uid:'a',id:25,shiny:true}];f.commit();const native=f.data.get('gachamon-save-v1');f.data.set('pokecatch-helper:v1:nursery-store','{"resume":{"wanted":true}}');
    f.e.nurseryMonitor.reset(f.s);assert.equal(f.e.nurseryMonitor.ledger.stats.eggsObserved,0);assert.equal(f.e.nurseryMonitor.ledger.nativeHatched,100);
    assert.equal(f.data.get('gachamon-save-v1'),native);assert.equal(f.data.get('pokecatch-helper:v1:nursery-store'),'{"resume":{"wanted":true}}');
});
test('quota failures preserve in-memory observations and never interrupt the automation state',()=>{
    const f=fixture();f.storage.setItem=()=>{throw Error('quota');};f.s.pension.eggs=[{uid:'a',id:25,shiny:true}];
    assert.doesNotThrow(()=>f.commit());assert.equal(f.e.nurseryMonitor.ledger.stats.shinyObserved,1);assert.match(f.e.nurseryMonitor.error,/quota/);assert.equal(f.e.running,false);
    assert.throws(()=>f.e.nurseryMonitor.reset(f.s),/quota/);assert.equal(f.e.nurseryMonitor.ledger.stats.shinyObserved,1);
});
test('another tab lease prevents nursery writes without blocking a valid save read',()=>{
    const f=fixture(),before=f.data.get(f.key);f.data.set('pokecatch-helper:v1:lease:nursery-store',JSON.stringify({token:'other',expires:Date.now()+60000}));
    f.s.pension.eggs=[{uid:'a',id:25,shiny:true}];assert.doesNotThrow(()=>f.commit());assert.equal(f.data.get(f.key),before);assert.throws(()=>f.e.nurseryMonitor.reset(f.s),/账号/);
});
test('a native account switch cannot write the old ledger and new accounts start with a clean baseline',()=>{
    const f=fixture(),before=f.data.get(f.key);f.s.trainer.id='different';f.commit();assert.equal(f.data.get(f.key),before);
    f.e.loadAccount(f.s);assert.equal(f.e.nurseryMonitor.account,'different');assert.equal(f.e.nurseryMonitor.ledger.stats.hatched,0);assert.notEqual(f.e.nurseryMonitor.key,f.key);
});
test('new nursery keys cannot collide with legacy task-profile keys',()=>{
    const f=fixture();assert.notEqual(f.key,'pokecatch-helper:v1:nursery:nursery-store');assert.ok(f.key.startsWith(H.NURSERY_STORE_PREFIX));
});

test('wallet-only saves skip hatch reconciliation and deep ledger copies; new eggs still persist',t=>{
    const f=fixture();f.commit();
    const ledger=f.e.nurseryMonitor.ledger,observe=t.mock.method(ledger,'observe'),snapshot=t.mock.method(ledger,'snapshot');
    for(let i=0;i<20;i++){f.s.money=i;f.commit();}
    assert.equal(observe.mock.callCount(),0);assert.equal(snapshot.mock.callCount(),0);
    f.s.pension.eggs=[{uid:'fresh',id:25,shiny:true}];f.commit();
    assert.equal(observe.mock.callCount(),1);assert.equal(ledger.stats.shinyObserved,1);
    assert.equal(JSON.parse(f.data.get(f.key)).stats.shinyObserved,1);
});

test('unobserved offline hatches leave no PC scans on unrelated battle saves',t=>{
    const f=fixture();f.s.stats.hatched+=7;f.commit();
    const ledger=f.e.nurseryMonitor.ledger,observe=t.mock.method(ledger,'observe'),backfill=t.mock.method(ledger,'reconcileHatchlings');
    for(let i=0;i<20;i++){f.s.money=i;f.commit();}
    assert.equal(ledger.stats.unknownHatched,7);
    assert.equal(observe.mock.callCount(),0);assert.equal(backfill.mock.callCount(),0);
});

test('an unchanged save still expires a pending disappearance after the matching window',()=>{
    const f=fixture();f.s.pension.eggs=[{id:25,uid:'removed',shiny:false}];f.commit();
    f.s.pension.eggs=[];f.commit();
    const ledger=f.e.nurseryMonitor.ledger,at=ledger.pending[0].at;
    f.e.nurseryMonitor.observe(f.e.state,at+120000,false);assert.equal(ledger.pending.length,1);
    f.e.nurseryMonitor.observe(f.e.state,at+120001,false);assert.equal(ledger.pending.length,0);
    assert.equal(JSON.parse(f.data.get(f.key)).stats.unconfirmedDisappearances,1);
});

test('history backfill uses hatchling evidence from the current decoded save and persists it exactly once',()=>{
    const f=fixture(),source=new H.NurseryLedger(),at=Date.now(),unknown={build:'unknown-test-build'};
    const egg={uid:'observed-egg',id:25,k:17,sp:2};
    source.observe(f.s,at,unknown);
    f.s.pension.eggs=[egg];source.observe(f.s,at+10,unknown);
    f.s.pension.eggs=[];f.s.stats.hatched++;source.observe(f.s,at+20,unknown);
    assert.equal(source.stats.unknownHatched,1);
    f.data.set(f.key,JSON.stringify(source.serialize()));f.commit();
    const hatchling={uid:egg.uid,id:25,ek:17,egg:true,shiny:true};
    // A stale UI caller has an equally recent nursery but a different PC. Only the game save may prove the hatch.
    f.e.nurseryMonitor.observe({...f.e.state,mons:[hatchling]});
    assert.equal(f.e.nurseryMonitor.ledger.stats.unknownHatched,1);
    f.s.mons=[hatchling];f.commit();
    const persisted=JSON.parse(f.data.get(f.key));assert.equal(persisted.stats.unknownHatched,0);assert.equal(persisted.stats.shinyHatched,1);
    assert.equal(persisted.stats.shinyObserved,1);assert.equal(persisted.segment.startedAt,at);
    const again=new H.Engine(f.storage);again.loadAccount(f.s);again.read();assert.equal(again.nurseryMonitor.ledger.stats.shinyHatched,1);
});

test('an old game snapshot cannot roll a newer persisted nursery ledger back',()=>{
    const f=fixture();f.s.pension.eggs=[{uid:'flash',id:25,shiny:true}];f.commit();const old=f.e.state;
    f.s.pension.eggs=[];f.s.stats.hatched++;f.commit();const saved=f.data.get(f.key);
    f.e.nurseryMonitor.observe(old);assert.equal(f.data.get(f.key),saved);assert.equal(f.e.nurseryMonitor.ledger.stats.shinyHatched,1);
    assert.throws(()=>f.e.nurseryMonitor.reset(old),/最新状态/);
    // Another tab advances both native save and ledger while this tab still holds the prior state.
    const stale=f.e.state,second=new H.Engine(f.storage);second.loadAccount(f.s);second.read();f.s.stats.hatched++;f.data.set('gachamon-save-v1',JSON.stringify(f.s));second.read();
    const newer=f.data.get(f.key);f.e.nurseryMonitor.observe(stale);assert.equal(f.data.get(f.key),newer);assert.notEqual(f.e.nurseryMonitor.ledger.segment.reason,'counter-rollback');
});

test('browser prediction requires a recognized game build while saved legacy flags remain readable',()=>{
    const previousDocument=global.document,previousWindow=global.window;let srcs=[];
    global.document={querySelectorAll:()=>srcs.map(src=>({getAttribute:()=>src}))};global.window={};
    try{
        for(const value of [[],['/boot.js'],['/bundle/app.abc123.js']]){srcs=value;const options=H.nurseryRuntimeOptions();assert.equal(options.build,'unverified:missing');assert.equal(H.eggOutcome({trainer:{id:1,since:2}},{uid:'x',k:1},options).known,false);}
        srcs=['/bundle/app.84beed0145.js'];assert.equal(H.nurseryRuntimeOptions().build,'c9b850cf68');
        srcs=['/bundle/app.ac708615ae.js'];assert.equal(H.nurseryRuntimeOptions().build,'a5299b1690');
        srcs=['/bundle/app.c742526349.js'];assert.equal(H.nurseryRuntimeOptions().build,'c8fb8b2e96');
        srcs=['https://pokecatch-online.pages.dev/bundle/app.0a7dcb2280.js'];assert.equal(H.nurseryRuntimeOptions().build,H.NURSERY_RULES.build);
        global.window.BUILD='1234567abc';
        assert.deepEqual(H.nurseryRuntimeOptions(),{build:H.NURSERY_RULES.build,bundle:'0a7dcb2280',launcherBuild:'1234567abc'});
        srcs=['/bundle/app.0123456789.js'];assert.equal(H.nurseryRuntimeOptions().build,'unverified:0123456789');
        assert.equal(H.eggOutcome({}, {shiny:true},H.nurseryRuntimeOptions()).shiny,true);
        global.window.BUILD=H.NURSERY_RULES.build;
        assert.equal(H.nurseryRuntimeOptions().build,'unverified:0123456789');
        srcs=['/bundle/app.ac708615ae.js'];assert.equal(H.nurseryRuntimeOptions().build,'unverified:ac708615ae');
        srcs=['/bundle/app.0a7dcb2280.js'];assert.equal(H.nurseryRuntimeOptions().build,H.NURSERY_RULES.build);
        srcs.push('/bundle/app.84beed0145.js');assert.equal(H.nurseryRuntimeOptions().build,'unverified:mixed-bundles');
        srcs=[];assert.equal(H.nurseryRuntimeOptions().build,H.NURSERY_RULES.build);
        global.window.BUILD='7d13a92510';
        assert.equal(H.nurseryRuntimeOptions().build,'unverified:missing-bundle');
        for(const bundle of ['023c732f7b','c8584bf7ba']){
            srcs=['/bundle/app.'+bundle+'.js'];
            assert.equal(H.nurseryRuntimeOptions().build,'7d13a92510');
        }
        global.window.BUILD='d0ed6b793f';srcs=[];
        assert.equal(H.nurseryRuntimeOptions().build,'unverified:missing-bundle');
        for(const bundle of ['3b7bf428b6','0e9662f5f8','2d46018b96','23e94ddbef','4ca78e3d27','fb58ae58aa','0a5492aada']){
            srcs=[`/bundle/app.${bundle}.js`];
            assert.equal(H.nurseryRuntimeOptions().build,'d0ed6b793f');
        }
        srcs=['/bundle/app.fffffffffe.js'];
        assert.equal(H.nurseryRuntimeOptions().build,'unverified:fffffffffe');
        global.window.BUILD='824f567ed3';
        const s={trainer:{id:'nov25',since:1234},pension:{laid:148,bx:4,mons:[{mon:{id:132}},{mon:{id:248,shiny:true}}]}};
        srcs=['/bundle/app.f3a9382a50.js'];
        assert.equal(H.nurseryRuntimeOptions().build,'824f567ed3');
        assert.equal(H.nurseryForecast(s,{...H.nurseryRuntimeOptions(),limit:5}).nextUncoveredEgg.k,152);
        srcs=[];
        assert.deepEqual(H.nurseryRuntimeOptions(),{build:'unverified:missing-bundle',eggRollVerified:true});
        assert.equal(H.nurseryForecast(s,H.nurseryRuntimeOptions()).active,false);
        assert.equal(H.eggOutcome(s,{id:246,k:147},H.nurseryRuntimeOptions()).known,true);
        srcs=['/bundle/app.fffffffffe.js'];
        assert.deepEqual(H.nurseryRuntimeOptions(),{build:'unverified:fffffffffe'});
        assert.equal(H.eggOutcome(s,{id:246,k:147},H.nurseryRuntimeOptions()).known,false);
        srcs.push('/bundle/app.f3a9382a50.js');
        assert.deepEqual(H.nurseryRuntimeOptions(),{build:'unverified:mixed-bundles'});
    }finally{if(previousDocument===undefined)delete global.document;else global.document=previousDocument;if(previousWindow===undefined)delete global.window;else global.window=previousWindow;}
});

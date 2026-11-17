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
        srcs=['/bundle/app.84beed0145.js'];assert.equal(H.nurseryRuntimeOptions().build,H.NURSERY_RULES.build);
        srcs=['/bundle/app.0123456789.js'];assert.equal(H.nurseryRuntimeOptions().build,'unverified:0123456789');
        assert.equal(H.eggOutcome({}, {shiny:true},H.nurseryRuntimeOptions()).shiny,true);
        global.window.BUILD=H.NURSERY_RULES.build;assert.equal(H.nurseryRuntimeOptions().build,H.NURSERY_RULES.build);
    }finally{if(previousDocument===undefined)delete global.document;else global.document=previousDocument;if(previousWindow===undefined)delete global.window;else global.window=previousWindow;}
});

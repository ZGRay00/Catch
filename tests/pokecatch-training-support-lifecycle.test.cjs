const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
function fixture(t){
    const before=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
    const s={trainer:{id:'support-lifecycle'},mons:[{uid:'a',id:6,level:40}],team:['a'],road:['a'],buddy:{uid:'a',ko:7},dex:{},money:1000,travel:{to:[]},stats:{},adv:{layout:6,chapter:0,unlocked:8,speed:4,loops:[],badges:[],gifts:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage);e.loadAccount(s);e.running=true;e.started=Date.now();e.schedule=()=>{};e.read();return{s,e};
}
test('background return freezes Buddy and berry UI confirmation deadlines',t=>{
    const {e}=fixture(t),now=Date.now();e.hiddenAt=now;e.automation.buddyTask={started:now-1000,clickedAt:now-500};e.automation.buffUI={started:now-200};e.automation.state.autoBuffTx={at:now-100};e.automation.state.resourceBuffTx={at:now-50};
    e.resumeUIClock(now+180000);assert.equal(e.automation.buddyTask.started,now+179000);assert.equal(e.automation.buddyTask.clickedAt,now+179500);assert.equal(e.automation.buffUI.started,now+179800);assert.equal(e.automation.state.autoBuffTx.at,now+179900);assert.equal(e.automation.state.resourceBuffTx.at,now+179950);e.stop();
});
test('manual control cancels pending support UI without rewriting the native Buddy or save',t=>{
    const {s,e}=fixture(t),save=e.storage.getItem('gachamon-save-v1');e.automation.buddyTask={uid:'a',started:Date.now()};e.automation.buffUI={started:Date.now()};e.automation.owner={kind:'buddy',uid:'a'};
    e.manualInput();assert.equal(e.automation.buddyTask,null);assert.equal(e.automation.buffUI,null);assert.equal(e.automation.owner,null);assert.deepEqual(s.buddy,{uid:'a',ko:7});assert.equal(e.storage.getItem('gachamon-save-v1'),save);e.stop();
});
test('starting a new workflow clears old support UI backoff and wakes active transactions promptly',t=>{
    const {s,e}=fixture(t);e.automation.buddyRetryAt=Date.now()+60000;e.automation.buffRetry={xp:Date.now()+60000};e.automation.buffUI={};e.automation.begin(s);
    assert.equal(e.automation.buddyRetryAt,0);assert.deepEqual(e.automation.buffRetry,{});assert.equal(e.automation.buffUI,null);
    e.farmWait={mode:e.settings.mode};assert.equal(e.nextDelay(),6000);e.automation.buddyTask={};assert.equal(e.nextDelay(),1200);e.stop();
});

test('refresh retains failed buddy and berry retry deadlines rather than immediately repeating them',t=>{
    const {s,e}=fixture(t),now=Date.now();e.automation.buddyRetryAt=now+60000;e.automation.buffRetry={xp:now+45000,money:now+30000};e.suspend();
    const saved=JSON.parse(e.storage.getItem('pokecatch-helper:v1:support-lifecycle'));assert.equal(saved.resume.flow.buddyRetryAt,now+60000);
    const next=new H.Engine(e.storage);next.loadAccount(s);next.schedule=()=>{};next.start(true);
    assert.equal(next.running,true,next.status);assert.equal(next.automation.buddyRetryAt,now+60000);assert.deepEqual(next.automation.buffRetry,{xp:now+45000,money:now+30000});next.stop();
});

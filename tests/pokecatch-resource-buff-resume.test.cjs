const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t){
    const before={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};let clock=Date.UTC(2026,10,16,12),confirm=false;
    Date.now=()=>clock;t.after(()=>{Date.now=before.now;for(const key of ['document','getComputedStyle'])if(before[key]===undefined)delete global[key];else global[key]=before[key];});
    const button={isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}]};
    global.document={hidden:false,querySelector:sel=>sel==='#bag-panel .bag-cell[data-k="lansat-berry"]'?button:null,querySelectorAll:()=>[]};global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const s={trainer:{id:'resource-buff-resume'},money:1000,mons:[{uid:'a',id:6,level:40}],team:['a'],road:['a'],dex:{},items:{'lansat-berry':10},buffs:{},stats:{itemOut:{}},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{}}};
    const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)},save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    const e=new H.Engine(storage,{mode:'resource',resourceItem:'lansat-berry',resourceAction:'use',resourceQuantity:3,useBudget:10});e.loadAccount(s);e.running=true;e.started=clock;e.schedule=()=>{};e.automation.begin(s);e.queue=H.normalizeJobs([{settings:e.settings,status:'running'}]);e.queueRunning=true;e.queueIndex=0;
    const actions=[];
    const nativeUse=()=>{s.items['lansat-berry']--;s.stats.itemOut['lansat-berry']=(s.stats.itemOut['lansat-berry']||0)+1;s.buffs.money={key:'lansat-berry',until:(s.buffs.money?.until||clock)+3600000};save();};
    function driver(engine){engine.schedule=()=>{};engine.driver.nav=()=>true;engine.driver.lastClick=0;engine.driver.click=()=>{actions.push('berry');engine.driver.lastClick=clock;if(confirm)nativeUse();return true;};}
    driver(e);
    const tick=engine=>{engine.driver.lastClick=0;engine.automation.resource(s,clock);};
    return{s,e,storage,actions,driver,nativeUse,tick,advance:ms=>{clock+=ms;},enableConfirmation:()=>{confirm=true;}};
}

test('a timed-out resource berry remains pending when its queue task is paused and resumed',t=>{
    const {e,actions,tick,advance}=fixture(t);tick(e);advance(10001);tick(e);
    assert.equal(e.running,false);assert.equal(actions.length,1);assert.equal(e.budget.used,1);assert.ok(e.queue[0].progress.flow.resourceBuffTx);
    e.startQueue();tick(e);assert.equal(e.running,false);assert.equal(actions.length,1);assert.equal(e.budget.used,1);assert.match(e.status,/使用未确认/);
});

test('reloading a paused resource queue preserves an ambiguous berry action instead of consuming another serving',t=>{
    const {s,e,storage,actions,driver,tick,advance}=fixture(t);tick(e);advance(10001);tick(e);
    const resumed=new H.Engine(storage);resumed.loadAccount(s);driver(resumed);resumed.startQueue();tick(resumed);
    assert.equal(resumed.running,false);assert.equal(actions.length,1);assert.equal(resumed.budget.used,1);assert.ok(resumed.queue[0].progress.flow.resourceBuffTx);
});

test('a delayed berry confirmation reconciles the reserved serving before continuing to the exact queue goal',t=>{
    const {s,e,actions,tick,advance,nativeUse,enableConfirmation}=fixture(t);tick(e);advance(10001);tick(e);nativeUse();enableConfirmation();e.startQueue();
    for(let i=0;i<3;i++){advance(1200);tick(e);}
    assert.equal(e.running,false);assert.equal(actions.length,3);assert.equal(e.budget.used,3);assert.equal(s.stats.itemOut['lansat-berry'],3);assert.equal(s.items['lansat-berry'],7);assert.equal(e.queue[0].status,'done');assert.equal(e.queue[0].progress,undefined);
});

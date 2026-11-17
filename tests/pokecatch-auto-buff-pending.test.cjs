const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t){
    const before={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};let clock=Date.UTC(2026,10,16,12);
    Date.now=()=>clock;t.after(()=>{Date.now=before.now;for(const key of ['document','getComputedStyle'])if(before[key]===undefined)delete global[key];else global[key]=before[key];});
    const node=id=>({id,isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}]}),buttons=new Map(['lansat-berry','pinap-berry'].map(id=>[id,node(id)]));
    global.document={hidden:false,querySelector:sel=>buttons.get(/data-k="([^"]+)"/.exec(sel)?.[1])||null,querySelectorAll:()=>[]};global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const s={trainer:{id:'auto-buff-pending'},money:10000,mons:[{uid:'a',id:6,level:40}],team:['a'],road:['a'],dex:{},items:{'lansat-berry':10,'pinap-berry':10},buffs:{},stats:{itemOut:{}},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{}}};
    const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)},save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    const e=new H.Engine(storage,{mode:'money',trainUid:'a',trainLevel:60,useBudget:10,autoPrepare:false,autoTeam:false,raids:false});e.loadAccount(s);e.running=true;e.started=clock;e.automation.begin(s);
    const actions=[];function driver(engine){engine.schedule=()=>{};engine.driver.nav=()=>true;engine.driver.lastClick=0;engine.driver.click=button=>{actions.push(button.id);return true;};}driver(e);
    const act=(engine=e,mode='money')=>{engine.driver.lastClick=0;return engine.automation.autoBuff(s,clock,mode);};
    return{s,e,storage,actions,driver,save,act,now:()=>clock,advance:ms=>{clock+=ms;}};
}

test('stale automatic berry saves do not cause repeated clicks after the old one-minute retry deadline',t=>{
    const {e,actions,act,advance}=fixture(t);assert.equal(act(),true);advance(10001);assert.equal(act(),false);
    for(let i=0;i<10;i++){advance(60001);assert.equal(act(e,i%2?'train':'money'),false);}
    assert.deepEqual(actions,['lansat-berry']);assert.equal(e.budget.used,1);assert.equal(e.running,true);assert.ok(e.automation.state.autoBuffTx);
    assert.equal(e.logs.filter(row=>row.text.includes('使用未确认')).length,1);e.stop();
});

test('refresh continuation preserves a pending automatic serving and its single warning',t=>{
    const {s,e,storage,actions,driver,act,advance}=fixture(t);act();advance(10001);act();e.suspend();
    const resumed=new H.Engine(storage);resumed.loadAccount(s);driver(resumed);resumed.start(true);advance(60001);assert.equal(act(resumed),false);
    assert.equal(resumed.running,true);assert.equal(resumed.budget.used,1);assert.equal(resumed.automation.state.autoBuffTx.warned,true);assert.deepEqual(actions,['lansat-berry']);assert.equal(resumed.logs.filter(row=>row.text.includes('使用未确认')).length,0);resumed.stop();
});

test('pending consumption is reconciled even after its automatic support toggle is disabled',t=>{
    const {s,e,actions,act,advance}=fixture(t);act();e.settings.moneyBuff=false;s.items['lansat-berry']--;s.stats.itemOut['lansat-berry']=1;advance(1200);
    assert.equal(act(),false);assert.equal(e.automation.state.autoBuffTx,undefined);assert.deepEqual(actions,['lansat-berry']);e.stop();
});

test('a different active berry cannot confirm an unrelated pending serving',t=>{
    const {s,e,actions,act,now,advance}=fixture(t);s.items['razz-berry']=3;s.buffs.capture={key:'golden-razz-berry',until:now()+3600000};
    e.automation.state.autoBuffTx={id:'razz-berry',family:'capture',stock:3,out:0,at:now()};advance(10001);assert.equal(act(),false);
    assert.equal(e.automation.state.autoBuffTx.id,'razz-berry');assert.deepEqual(actions,[]);assert.equal(e.budget.used,0);e.stop();
});

test('a delayed exact-key active effect confirms an automatic serving and permits normal later replenishment',t=>{
    const {s,e,actions,act,now,advance}=fixture(t);act();advance(10001);act();s.buffs.money={key:'lansat-berry',until:now()+3600000};
    assert.equal(act(),false);assert.equal(e.automation.state.autoBuffTx,undefined);assert.equal(e.budget.used,1);advance(3600001);assert.equal(act(),true);
    assert.deepEqual(actions,['lansat-berry','lansat-berry']);assert.equal(e.budget.used,2);e.stop();
});

test('switching to another buff family during confirmation continues the task without opening a second serving',t=>{
    const {e,actions,act,advance}=fixture(t);act();advance(1200);assert.equal(act(e,'train'),false);
    assert.equal(e.automation.state.autoBuffTx.family,'money');assert.deepEqual(actions,['lansat-berry']);assert.equal(e.budget.used,1);e.stop();
});

const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
function fixture(t,settings={},confirm=true){
    const before={document:global.document,getComputedStyle:global.getComputedStyle};
    t.after(()=>{for(const [key,value]of Object.entries(before))if(value===undefined)delete global[key];else global[key]=value;});
    const s={trainer:{id:'berries'},money:10000,mons:[{uid:'a',id:6,level:40}],team:['a'],road:['a'],dex:{},items:{'pinap-berry':3,'lansat-berry':3},buffs:{},stats:{itemOut:{}},travel:{to:[]},
        adv:{layout:6,chapter:0,unlocked:8,speed:4,node:0,runs:0,badges:[],gifts:{},loops:[]}};
    const buttons=new Map(Object.keys(H.DATA.automation.buffs).map(id=>[id,{id,isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}]}]));
    global.document={hidden:false,querySelector:selector=>buttons.get(/data-k="([^"]+)"/.exec(selector)?.[1])||null,querySelectorAll:()=>[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'train',trainLevel:60,trainBuddy:false,...settings});e.loadAccount(s);e.running=true;e.started=Date.now();e.trainProtected=['a'];
    const clicked=[];e.driver.lastClick=0;e.driver.nav=()=>true;e.driver.click=(button,label)=>{clicked.push({id:button.id,label});if(confirm){s.items[button.id]--;s.stats.itemOut[button.id]=(s.stats.itemOut[button.id]||0)+1;const family=H.DATA.automation.buffs[button.id].family;s.buffs[family]={key:button.id,until:Date.now()+3600000};}return true;};
    const act=(mode='train',now=Date.now())=>{e.driver.lastClick=0;return e.automation.autoBuff(s,now,mode);};return{s,e,act,clicked};
}
test('training buddy, XP berries and money berries default on and have independent opt-outs',()=>{
    const cfg=H.normalizeSettings({trainBuddy:false,trainBuff:false,moneyBuff:false});
    for(const key of ['trainBuddy','trainBuff','moneyBuff']){assert.equal(H.DEFAULTS[key],true);assert.equal(cfg[key],false);}
});
test('training consumes one owned XP berry while a live buff prevents stacking',t=>{
    const {s,e,act,clicked}=fixture(t);assert.equal(act(),true);assert.equal(s.items['pinap-berry'],2);assert.equal(e.budget.used,1);assert.equal(e.budget.spent,0);
    assert.equal(act(),false);assert.equal(act(),false);assert.equal(clicked.length,1);assert.equal(s.items['lansat-berry'],3);assert.equal(e.running,true);
});
test('money farming consumes money berries independently of the legacy generic buff switch',t=>{
    const {s,e,act,clicked}=fixture(t,{mode:'money',autoBuff:false});assert.equal(act('money'),true);
    assert.equal(clicked[0].id,'lansat-berry');assert.equal(s.items['pinap-berry'],3);assert.equal(e.budget.used,1);assert.equal(act('money'),false);
});
test('an inactive origin-side money buff is replaced for the current destination wallet',t=>{
    const {s,act,clicked}=fixture(t,{mode:'money'});s.link={from:'kanto',to:'johto',side:'to'};
    s.buffs.money={key:'lansat-berry',until:Date.now()+3600000,side:'from'};assert.equal(act('money'),true);assert.equal(clicked.length,1);
});
test('empty berry stock never triggers an automatic purchase',t=>{
    const {s,e,act,clicked}=fixture(t,{mode:'money',spendBudget:1000000});s.items={};assert.equal(act('money'),false);
    assert.equal(e.running,true);assert.equal(e.budget.used,0);assert.equal(e.budget.spent,0);assert.equal(clicked.length,0);
});
test('zero use budget and per-task opt-outs keep the underlying task running',t=>{
    const {e,act,clicked}=fixture(t,{useBudget:0});assert.equal(act(),false);assert.equal(e.running,true);assert.equal(e.budget.used,0);
    e.settings.useBudget=10;e.settings.trainBuff=false;assert.equal(act(),false);e.settings.moneyBuff=false;assert.equal(act('money'),false);assert.equal(clicked.length,0);
});
test('an unconfirmed berry click holds further berry use until its consumption can be reconciled',t=>{
    const {s,e,act,clicked}=fixture(t,{},false);assert.equal(act('money',1000),true);assert.equal(act('money',5000),true);assert.equal(clicked.length,1);
    assert.equal(act('money',12000),false);assert.equal(e.running,true);assert.equal(e.budget.used,1);
    assert.equal(act('train',12000),false);assert.deepEqual(clicked.map(x=>x.id),['lansat-berry']);assert.equal(e.budget.used,1);
    s.items['lansat-berry']--;s.stats.itemOut['lansat-berry']=1;
    assert.equal(act('train',13000),true);assert.deepEqual(clicked.map(x=>x.id),['lansat-berry','pinap-berry']);assert.equal(e.budget.used,2);
});
test('training berries wait for the actual road party and skip capped or finished targets',t=>{
    const {s,act,clicked}=fixture(t);s.road=['someone-else'];assert.equal(act(),false);s.road=['a'];s.mons[0].level=60;assert.equal(act(),false);
    s.mons[0].level=40;s.adv.unlocked=0;assert.equal(act(),false);assert.equal(clicked.length,0);
});
test('automatic preparation uses XP berries even when the main task is progression',t=>{
    const {e,act,clicked}=fixture(t,{mode:'progress'});e.preparation={targets:[{uid:'a',goal:50}]};
    assert.equal(act(),true);assert.equal(clicked[0].id,'pinap-berry');assert.equal(e.settings.mode,'progress');
});

test('an externally activated buff clears an obsolete support UI transaction',t=>{
    const {s,e,act,clicked}=fixture(t,{mode:'money'});e.automation.buffUI={family:'money',started:Date.now()};
    s.buffs.money={key:'lansat-berry',until:Date.now()+3600000};assert.equal(act('money'),false);assert.equal(e.automation.buffUI,null);assert.equal(clicked.length,0);
});

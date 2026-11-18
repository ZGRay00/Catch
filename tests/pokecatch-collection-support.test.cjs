const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t,settings={}){
    const before=global.document,previousNow=Date.now,clock=new Date(2026,10,16,12).getTime();Date.now=()=>clock;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{Date.now=previousNow;if(before===undefined)delete global.document;else global.document=before;});
    const s={trainer:{id:'collection-support'},money:1000,mons:[{uid:'a',id:6,level:100}],team:['a'],road:['a'],dex:{},items:{'enigma-berry':1,'starf-berry':1},stats:{},travel:{to:[]},
        adv:{layout:6,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['pokecatch-tab','tab']]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'shiny',shinyId:16,autoBuff:true,autoPrepare:false,autoTeam:false,raids:false,legends:false,progress:false,...settings});e.loadAccount(s);e.running=true;e.started=Date.now();e.tabToken='tab';e.nextRaid=Infinity;
    e.driver={animations:()=>false,dismissInformation:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false,nav:()=>true};
    const calls={buff:0,money:0};e.automation.autoBuff=()=>{calls.buff++;return true;};e.money=()=>{calls.money++;};
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    return{s,e,calls,save};
}
function catchAll(s){s.dex=Object.fromEntries(H.ROOTS.map(m=>[m.id,{caught:1}]));}

test('a shiny task with no local wild source stops before consuming its shiny berry',async t=>{
    const {e,calls}=fixture(t,{shinyId:504});await e.step();assert.equal(e.running,false);assert.match(e.status,/没有该物种的野生来源/);assert.equal(calls.buff,0);
});
test('shiny map backoff does not consume a boost while no eligible route can run',async t=>{
    const {s,e,calls}=fixture(t),now=Date.now();for(const row of H.shinyRanking(s,e.settings,{},now))e.cooldowns[row.key]=now+900000;
    await e.step(now);assert.equal(e.running,true);assert.match(e.status,/退避/);assert.equal(calls.buff,0);e.stop();
});
test('a shiny task waiting for night keeps its boost in inventory',async t=>{
    const {s,e,calls,save}=fixture(t,{shinyId:163}),day=new Date(2026,10,16,12).getTime();Object.assign(s.adv,{chapter:14,unlocked:14});s.travel.to=['johto'];save();
    await e.step(day);assert.equal(e.running,true);assert.match(e.status,/出没时段/);assert.equal(calls.buff,0);e.stop();
});
test('an available shiny route still applies its owned boost at a safe boundary',async t=>{
    const {e,calls}=fixture(t);await e.step();assert.equal(calls.buff,1);assert.equal(e.driver.pendingMap,undefined);e.stop();
});
test('completed dex collection switches to money without consuming a dex boost',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'});catchAll(s);save();await e.step();assert.equal(calls.buff,0);assert.equal(calls.money,1);e.stop();
});
test('a missing gift-only evolution chain does not trigger a wild encounter boost',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'});catchAll(s);delete s.dex[106];s.adv.chapter=5;save();await e.step();
    assert.equal(calls.buff,0);assert.equal(e.driver.pendingMap.row.id,5);e.stop();
});
test('dex route backoff falls back without activating the dex berry',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'}),now=Date.now();catchAll(s);delete s.dex[16];save();for(const row of H.dexRanking(s,e.settings,{},now))e.cooldowns[row.key]=now+900000;
    await e.step(now);assert.equal(calls.buff,0);assert.equal(calls.money,1);e.stop();
});
test('an available wild dex route still applies its boost before travelling',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'});catchAll(s);delete s.dex[16];save();await e.step();assert.equal(calls.buff,1);assert.equal(e.driver.pendingMap,undefined);e.stop();
});
test('an ongoing dex route refills boosts only between native battles',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'}),now=Date.now();catchAll(s);delete s.dex[16];e.target=H.dexRanking(s,e.settings,{},now).find(row=>row.id===0);assert.ok(e.target);e.visit={started:now};
    s.adv.battle={steps:0};save();await e.step(now);assert.equal(calls.buff,0);s.adv.battle=null;save();await e.step(now+1200);assert.equal(calls.buff,1);e.stop();
});
test('daily raid preparation takes precedence without consuming a wild collection boost',async t=>{
    const {s,e,calls,save}=fixture(t,{raids:true});s.adv.badges=['Maître'];e.nextRaid=0;save();await e.step();assert.equal(e.raidProbe,true);assert.equal(calls.buff,0);e.stop();
});
test('dex cancels a pending departure when a target ripple appears on the active route',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'});catchAll(s);delete s.dex[594];
    Object.assign(s.adv,{chapter:74,unlocked:83,nodes:[{name:'Route 8',type:'wild',phenom:'ripple',bg:'lake'}]});
    s.travel.to=['unova'];e.driver.pendingMap={row:{id:83},options:{},started:Date.now()};save();
    await e.step();assert.equal(e.driver.pendingMap,null);assert.match(e.status,/保姆曼波/);assert.equal(calls.buff,0);e.stop();
});
test('dex waits for a Larvesta egg and finishes only after the hatch is registered',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex',autoEggs:false,afterDex:'stop'});catchAll(s);delete s.dex[636];
    s.travel.to=['unova'];Object.assign(s.adv,{chapter:69,unlocked:83,badges:['Maître Unys']});
    s.pension={eggs:[{id:636,hatchAt:Date.now()+600000}],open:{eggs:1}};save();
    await e.step();assert.equal(e.running,true);assert.match(e.status,/培育屋领取/);assert.equal(calls.money,0);
    s.pension.eggs=[];s.dex[636]={caught:1};save();await e.step();assert.equal(e.running,false);assert.match(e.status,/已全部捕获/);
});
test('dex keeps a generated sunny desert item roll for Larvesta and resumes travel for fixed loot',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'});catchAll(s);delete s.dex[636];s.travel.to=['unova'];
    const node={name:'Désert Délassant',type:'item',weather:'sun',loot:{'egg:636':.2}};
    Object.assign(s.adv,{chapter:69,unlocked:83,badges:['Maître Unys'],nodes:[node]});
    let mapCalls=0;e.driver.map=()=>{mapCalls++;return false;};
    const pending=()=>({row:{id:83},options:{},started:Date.now()});
    e.driver.pendingMap=pending();save();await e.step();
    assert.equal(mapCalls,0);assert.equal(e.driver.pendingMap,null);assert.match(e.status,/道具节点.*获得蛋.*燃烧虫/);assert.equal(calls.buff,0);
    node.find='star-piece';e.driver.pendingMap=pending();save();await e.step();
    assert.equal(mapCalls,1);e.stop();
});

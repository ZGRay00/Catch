const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
function fixture(t,settings={}){
    const before=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
    const s={trainer:{id:'support-readiness'},money:1000,mons:[{uid:'a',id:6,level:5}],team:['a'],road:['a'],buddy:{uid:'a',ko:4},dex:{},items:{'pinap-berry':1,'lansat-berry':1},stats:{},travel:{to:[]},
        adv:{layout:6,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'train',trainUid:'a',trainLevel:10,autoTeam:false,autoPrepare:false,raids:false,...settings});e.loadAccount(s);e.running=true;e.started=Date.now();e.read();
    const calls={buddy:0,berry:0,progress:0};e.automation.autoBuddy=()=>{calls.buddy++;return true;};e.automation.autoBuff=()=>{calls.berry++;e.budget.charge(0,1);return true;};e.progress=()=>{calls.progress++;};
    return{s,e,calls};
}
test('training without a replayable route stops before opening Buddy UI or consuming a berry',t=>{
    const {s,e,calls}=fixture(t);e.rankedYieldRoutes=()=>[];e.farm(s,Date.now(),'train');
    assert.equal(e.running,false);assert.match(e.status,/暂无可重打的练级地图/);assert.deepEqual(calls,{buddy:0,berry:0,progress:0});assert.equal(e.budget.used,0);
});
test('training map backoff waits without support operations or item charges',t=>{
    const {s,e,calls}=fixture(t),now=Date.now();for(const row of H.xpRanking(s,e.settings))e.cooldowns[row.key]=now+900000;
    e.farm(s,now,'train');assert.equal(e.running,true);assert.match(e.status,/退避/);assert.deepEqual(calls,{buddy:0,berry:0,progress:0});assert.equal(e.budget.used,0);e.stop();
});
test('money map backoff does not waste the owned money berry',t=>{
    const {s,e,calls}=fixture(t,{mode:'money'}),now=Date.now();for(const row of H.moneyRanking(s,e.settings))e.cooldowns[row.key]=now+900000;
    e.money(s,now);assert.equal(e.running,true);assert.match(e.status,/退避/);assert.equal(calls.berry,0);assert.equal(e.budget.used,0);assert.equal(s.items['lansat-berry'],1);e.stop();
});
test('money fallback to the first story chapter does not activate a farming buff prematurely',t=>{
    const {s,e,calls}=fixture(t,{mode:'money'});s.adv.unlocked=0;e.money(s,Date.now());
    assert.equal(calls.progress,1);assert.equal(calls.berry,0);assert.equal(e.budget.used,0);e.stop();
});
test('available training still performs Buddy and berry support in separate steps',t=>{
    const {s,e,calls}=fixture(t);e.farm(s,Date.now(),'train');assert.deepEqual(calls,{buddy:1,berry:0,progress:0});
    e.automation.autoBuddy=()=>false;e.farm(s,Date.now()+1200,'train');assert.equal(calls.berry,1);assert.equal(e.budget.used,1);e.stop();
});
test('available money farming still uses its money berry before selecting the map',t=>{
    const {s,e,calls}=fixture(t,{mode:'money'});e.money(s,Date.now());
    assert.equal(calls.berry,1);assert.equal(calls.buddy,0);assert.equal(e.budget.used,1);assert.equal(e.driver.pendingMap,null);e.stop();
});
function resourceBuff(t,side){
    const data=fixture(t,{mode:'resource',resourceItem:'lansat-berry',resourceAction:'use'}),{s,e,calls}=data;
    const beforeStyle=global.getComputedStyle;t.after(()=>{if(beforeStyle===undefined)delete global.getComputedStyle;else global.getComputedStyle=beforeStyle;});
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const button={isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}]};
    global.document.querySelector=selector=>selector==='#bag-panel .bag-cell[data-k="lansat-berry"]'?button:null;
    e.driver.nav=()=>true;e.automation.spentClick=()=>{calls.berry++;return true;};
    s.link={from:'kanto',to:'johto',side};s.buffs={money:{key:'lansat-berry',until:Date.now()+3600000,side:'from'}};return data;
}
test('an ineffective origin-side buff does not block an explicit destination resource use',t=>{
    const {s,e,calls}=resourceBuff(t,'to');e.automation.buff(s,'lansat-berry');assert.equal(e.running,true);assert.equal(calls.berry,1);e.stop();
});
test('an explicit same-key resource use can append time to its currently effective buff',t=>{
    const {s,e,calls}=resourceBuff(t,'from');e.automation.buff(s,'lansat-berry');assert.equal(e.running,true);assert.equal(calls.berry,1);e.stop();
});

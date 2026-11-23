'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const H=require('../../Pokecatch自动助手.user.js');
const now=Date.UTC(2026,10,20,12);
function save(){
    return {trainer:{id:'daily-fixture'},money:50000,team:['a'],mons:[{uid:'a',id:6,level:70}],dex:{},items:{},
        adv:{layout:6,chapter:8,unlocked:14,badges:['Maître'],loops:[],gifts:{}},travel:{to:[]}};
}
function engine(s){
    const records=new Map([['gachamon-save-v1',JSON.stringify(s)]]);
    const storage={getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};
    const e=new H.Engine(storage,{mode:'item'});e.loadAccount(s);e.running=true;e.started=now;
    e.beginTask(s,null,now);e.daily={base:{...e.settings},job:null};return e;
}
test('routine respects daily factory evidence, Paris reset and optional facility switches',()=>{
    const s=save(),cfg=H.normalizeSettings({dailyWorld:true}),end=H.nextParisReset(now);
    assert.equal(H.dailyFacility(s,cfg,{},now).kind,'candy');
    s.candy={played:H.parisDay(now)};assert.equal(H.dailyFacility(s,cfg,{},now).kind,'world');
    assert.equal(H.dailyFacility(s,cfg,{world:end},now),null);
    assert.equal(H.dailyFacility(s,cfg,{world:end},end).kind,'candy');
    s.candy.run={};assert.equal(H.dailyFacility(s,cfg,{},now).kind,'candy');
    delete s.candy.run;s.wb={ed:'x',caught:'x'};assert.equal(H.dailyFacility(s,cfg,{},now),null);
    assert.equal(H.dailyCaptureWindow(s,cfg,now),null);
});
test('multiple legend goals respect map order, closed entrances and per-target completion',()=>{
    const s=save(),e=engine(s);
    e.settings=H.normalizeSettings({mode:'legend',legendIds:[385,144,145,145,999999]});
    assert.deepEqual(e.settings.legendIds,[145,144,385]);
    assert.deepEqual(H.normalizeSettings({legendId:385}).legendIds,[]);
    e.cooldowns['legend:145']=now+60000;
    assert.ok(e.selectLegendTarget(s,now));assert.equal(e.settings.legendId,144);
    s.dex[144]={caught:1};assert.equal(e.selectLegendTarget(s,now),false);
    assert.ok(e.selectLegendTarget(s,now+60000));assert.equal(e.settings.legendId,145);
    s.dex[145]={caught:1};s.travel.to.push('hoenn');
    assert.ok(e.selectLegendTarget(s,now+60001));assert.equal(e.settings.legendId,385);
    let finished=false;e.completeTask=()=>{finished=true;};
    s.dex[385]={caught:1};assert.equal(e.selectLegendTarget(s,now+60002),false);assert.ok(finished);
});
test('multi-legend elite goals require ordinary capture and the selected tier individually',()=>{
    const s=save(),e=engine(s);
    e.settings=H.normalizeSettings({mode:'legend',legendIds:[145,144],legendTier:2});
    s.dex[144]={caught:1};s.elite={144:{t:1}};
    assert.ok(e.selectLegendTarget(s,now));assert.equal(e.settings.legendId,144);
    s.elite[144].t=2;
    assert.equal(e.selectLegendTarget(s,now),false);
    s.dex[145]={caught:1};
    assert.ok(e.selectLegendTarget(s,now));assert.equal(e.settings.legendId,145);
});
test('daily tower uses the weekly record and always schedules a single attempt',()=>{
    const s=save(),cfg=H.normalizeSettings({dailyCandy:false,dailyTower:true,towerFloor:20,towerRuns:5});
    assert.equal(H.dailyFacility(s,cfg,{},now).settings.towerRuns,1);
    s.tower={best:{week:H.towerWeek(now),floor:20}};assert.equal(H.dailyFacility(s,cfg,{},now),null);
});
test('ordinary legend yields only to an available facility; elite and world captures keep their session',()=>{
    const s=save(),e=engine(s);
    e.daily.base.raids=false;
    e.daily.checking=true;e.driver.map=()=>{throw Error('unexpected departure');};
    for(const zone of [{id:493},{id:150,elite:1}]){
        s.adv.zone=zone;e.zoneId=zone.id;assert.equal(e.yieldLegendToDaily(s,now),false);
    }
    s.adv.zone={id:150,back:8};e.zoneId=150;s.candy={played:H.parisDay(now)};
    assert.equal(e.yieldLegendToDaily(s,now),false);
    delete s.candy.played;s.adv.battle={enemies:[{id:35,shiny:true}]};e.driver.nav=()=>true;
    assert.equal(e.yieldLegendToDaily(s,now+30001),true);
    assert.match(e.status,/糖果工厂已排队/);
});
test('a factory that finished during a protected encounter no longer triggers departure',()=>{
    const s=save(),e=engine(s);
    Object.assign(e.daily.base,{raids:false,dailyCandy:true,dailyTower:false,dailyWorld:false,dailyElite:false});
    e.daily.checking=false;e.zoneId=150;s.adv.zone={id:150,back:8};
    s.adv.battle={enemies:[{id:150}]};
    e.driver.nav=()=>true;e.driver.map=()=>assert.fail('stale factory reservation left the map');
    assert.ok(e.yieldLegendToDaily(s,now));assert.equal(e.dailyZoneExit.kind,'candy');
    delete s.adv.battle;s.candy={played:H.parisDay(now)};
    assert.equal(e.yieldLegendToDaily(s,now+1000),false);
    assert.equal(e.dailyZoneExit,null);assert.equal(e.daily.checking,false);
});
test('a due daily shiny raid can leave an ordinary legend zone safely; cooldowns, cleared draws and protected battles are respected',()=>{
    const s=save(),e=engine(s);
    Object.assign(e.daily.base,{mode:'legend',dailyMain:'legend',raids:true,dailyCandy:false,dailyTower:false,dailyWorld:false,dailyElite:false});
    e.settings=e.daily.base;e.zoneId=145;s.adv.zone={id:145,back:8};
    e.raidEntryBlock=()=>null;
    let exits=0;e.driver.map=(row,state,options)=>{assert.equal(row.id,8);assert.equal(options.leaveZone,true);exits++;return true;};
    e.driver.nav=()=>true;
    const end=H.nextParisReset(now),day=H.parisDay(now);
    s.raids={seen:day,done:{['kanto|'+day]:1}};
    assert.equal(e.yieldLegendToDaily(s,now),false);
    e.nextRaid=end+60000;assert.equal(e.yieldLegendToDaily(s,end+1),false);
    s.adv.battle={enemies:[{id:145}]};assert.ok(e.yieldLegendToDaily(s,end+61000));assert.equal(exits,0);
    s.adv.battle={enemies:[{id:25,shiny:true}]};assert.ok(e.yieldLegendToDaily(s,end+62000));assert.equal(exits,0);
    delete s.adv.battle;assert.ok(e.yieldLegendToDaily(s,end+63000));assert.equal(exits,1);
    assert.ok(e.yieldLegendToDaily(s,end+64000));assert.equal(exits,1);
    delete s.adv.zone;assert.equal(e.yieldLegendToDaily(s,end+65000),false);
    assert.ok(e.priorityRaid(s,end+65000));assert.equal(e.daily.base.mode,'legend');
});
test('an expiring wild source inserts only an explicitly selected, still missing target',()=>{
    const s=save(),at=new Date(2026,10,20,8).getTime();
    // Use the actual tables and find a local boundary, including on hosts in other time zones.
    const ids=H.DATA.mons.filter(m=>m.id<=151).map(m=>m.id);
    const cfg=H.normalizeSettings({mode:'money',dexSpecies:ids});
    let plan;
    for(let i=0;i<24&&!plan;i++)plan=H.dailyCaptureWindow(s,cfg,at+i*3600000);
    assert.ok(plan);const id=plan.settings.dexSpecies[0];
    const fixed={...cfg,dexSpecies:[id]};
    assert.equal(H.dailyCaptureWindow(s,fixed,plan.until-1)?.settings.dexSpecies[0],id);
    s.dex[id]={caught:1};assert.equal(H.dailyCaptureWindow(s,fixed,plan.until-1),null);
});
test('interruption preserves base progress, original settings and shared expenditure through reload',()=>{
    const s=save(),e=engine(s);e.budget.used=3;e.budget.spent=800;e.startItems=42;
    s.adv.pending={type:'gift'};assert.equal(e.dailyStep(s,now,false),false);delete s.adv.pending;
    e.automation.owner={kind:'confirm'};assert.equal(e.dailyStep(s,now,false),false);e.automation.owner=null;
    assert.ok(e.dailyStep(s,now,false));assert.equal(e.settings.mode,'candy');
    assert.equal(e.dailyStep(s,now+1000,false),false);
    e.budget.used++;e.budget.spent+=200;e.persist();
    const reload=new H.Engine(e.storage);reload.loadAccount(s);const cp=reload.checkpoint;
    assert.equal(reload.settings.mode,'item');assert.equal(cp.settings.mode,'candy');
    reload.settings=reload.taskSettings(cp.settings);reload.daily=cp.daily;reload.beginTask(s,cp,now+5000);
    reload.returnFromDaily('免费场已完成',H.nextParisReset(now),now+5000);
    assert.equal(reload.settings.mode,'item');assert.equal(reload.startItems,42);
    assert.deepEqual([reload.budget.spent,reload.budget.used],[1000,4]);
    assert.equal(reload.daily.job,null);assert.equal(reload.dailyStep(s,now+6000,false),false);
});
test('unavailable entrance yields to the base and has a bounded retry',()=>{
    const s=save(),e=engine(s);e.dailyStep(s,now,false);
    assert.ok(e.dailyStep(s,now+91000,true));assert.equal(e.settings.mode,'item');
    assert.ok(e.dailyMarks.candy>now+91000);assert.equal(e.dailyStep(s,now+92000,false),false);
});
test('opening pass reserves a facility across reload and rechecks the next chore before farming',()=>{
    const s=save(),e=engine(s);
    e.daily.base.dailyWorld=true;e.daily.checking=true;
    s.adv.battle={kind:'trainer',enemies:[{id:25,hp:8}]};
    s.adv.pending={type:'gift'};assert.equal(e.dailyStep(s,now,false),false);
    delete s.adv.pending;
    assert.ok(e.dailyStep(s,now,false));assert.equal(e.daily.job.waitingForBattle,true);
    e.persist();const reload=new H.Engine(e.storage);reload.loadAccount(s);
    assert.equal(reload.checkpoint.daily.job.waitingForBattle,true);
    delete s.adv.battle;
    e.returnFromDaily('模拟结算',H.nextParisReset(now),now+1000);
    assert.equal(e.daily.checking,true);
    assert.ok(e.dailyStep(s,now+2000,false));assert.equal(e.daily.job.kind,'world');
    e.returnFromDaily('模拟结算',H.nextParisReset(now),now+3000);
    assert.equal(e.dailyStep(s,now+4000,false),false);
});
test('legacy and imported daily settings keep the ordinary task when no valid independent main is specified',()=>{
    for(const dailyMain of [undefined,'tower','invalid']){
        const cfg=H.normalizeSettings({mode:'train',dailyMain});
        assert.equal(cfg.dailyMain,'current');assert.equal(cfg.mode,'train');
    }
    for(const dailyMain of ['money','dex','shiny'])assert.equal(H.normalizeSettings({dailyMain}).dailyMain,dailyMain);
});
test('a weekly tower checkpoint restores the selected shiny targets, budget and original menu independently',()=>{
    const s=save(),e=engine(s);
    e.settings=H.normalizeSettings({...e.settings,mode:'shiny',dailyMain:'shiny',shinySpecies:[25,41],shinyWeather:['rain'],
        dailyCandy:false,dailyTower:true});
    e.daily={base:{...e.settings},menuMode:'progress',job:null};
    e.budget.used=4;assert.ok(e.dailyStep(s,now,false));assert.equal(e.settings.mode,'tower');e.persist();
    const reload=new H.Engine(e.storage);reload.loadAccount(s);const cp=reload.checkpoint;
    assert.equal(reload.settings.mode,'progress');assert.equal(reload.settings.dailyMain,'shiny');
    reload.daily=cp.daily;reload.settings=reload.taskSettings(cp.settings);reload.beginTask(s,cp,now+5000);
    reload.returnFromDaily('本周楼层达标',H.nextParisReset(now),now+5000);
    assert.deepEqual(reload.settings.shinySpecies,[25,41]);assert.deepEqual(reload.settings.shinyWeather,['rain']);
    assert.equal(reload.settings.mode,'shiny');assert.equal(reload.idleTaskSettings().mode,'progress');
    assert.equal(reload.budget.used,4);assert.equal(reload.dailyStep(s,now+6000,false),false);
});

test('daily training keeps individual PC and party UIDs across a facility interruption and reload',()=>{
    const s=save(),e=engine(s);
    s.mons.push({uid:'b',id:9,level:82},{uid:'c',id:25,level:20});
    const cfg=H.normalizeSettings({mode:'train',dailyMain:'train',trainUid:'selected',trainUids:['b','a','b'],trainGems:true});
    e.settings=cfg;e.beginTask(s,null,now);e.daily={base:cfg,menuMode:'money',job:null};
    assert.deepEqual(e.trainProtected,['b','a']);
    assert.equal(H.trainingStatus(s,cfg).missing,false);
    assert.equal(H.trainingStatus(s,{...cfg,autoTeam:false}).missing,true);
    assert.ok(e.dailyStep(s,now,false));e.persist();
    const restored=new H.Engine(e.storage);restored.loadAccount(s);
    const cp=restored.checkpoint;restored.settings=restored.taskSettings(cp.settings);
    restored.daily=cp.daily;restored.beginTask(s,cp,now+1000);
    restored.returnFromDaily('结束',H.nextParisReset(now),now+2000);
    assert.deepEqual(restored.trainProtected,['b','a']);assert.equal(restored.settings.trainGems,true);
    assert.equal(restored.idleTaskSettings().mode,'money');
    s.team=['a','b','c'];assert.equal(H.selectTrainingBuddy(s,cfg), 'a');
    s.mons[1].level=s.mons[0].level=100;assert.equal(H.trainingStatus(s,cfg).complete,true);
    s.mons[1].id=s.mons[0].id;assert.equal(H.trainingStatus(s,cfg).conflict,true);
});

test('rank-up is opt-in, explicit, final-form only and bounded by a single gem stack, rank and use allowance',()=>{
    const s=save(),e=engine(s);s.mons[0].level=100;s.under={gems:{'fire:2':1,'flying:2':1}};
    const cfg=H.normalizeSettings({mode:'train',trainUid:'selected',trainUids:['a'],trainGems:true,trainRank:2});
    e.settings=cfg;
    const pick=(extra={},skipped={})=>H.trainingGemTarget(s,{...cfg,...extra},null,e.budget,skipped);
    const first=pick();assert.equal(first.next,1);assert.equal(first.uid,'a');
    assert.equal(pick({},{a:first.key}),null);
    for(const extra of [{trainGems:false},{mode:'money'},{trainUid:'team'},{trainLevel:95},{trainUids:[]}])assert.equal(pick(extra),null);
    assert.equal(H.normalizeSettings({}).trainGems,false);
    s.mons[0].id=5;assert.equal(pick(),null);s.mons[0].id=6;
    s.mons[0].rank=1;assert.equal(pick(),null);
    s.under.gems['fire:2']=2;assert.equal(pick().next,2);
    e.budget.used=cfg.useBudget-1;assert.equal(pick(),null);e.budget.used=0;
    assert.equal(pick({trainRank:1}),null);
    s.mons[0].level=99;assert.equal(pick(),null);
});

test('native rank confirmation reserves exactly once and reconciles the saved result after reload',t=>{
    const s=save(),e=engine(s),a=e.automation;
    e.settings=H.normalizeSettings({mode:'train',trainUid:'selected',trainUids:['a'],trainGems:true});
    s.mons[0].level=100;s.under={gems:{'fire:2':1}};
    const target=H.trainingGemTarget(s,e.settings,null,e.budget);
    const node=()=>({isConnected:true,closest:()=>null,getClientRects:()=>[{}],getAttribute:()=>null});
    const gold=node(),modal={...node(),matches:sel=>sel.includes('.rk-modal'),querySelector:sel=>({'.rk-q':{},'.dc-fact b':{textContent:'1 颗宝石'},'.modal-actions .gold':gold})[sel]};
    const oldDoc=global.document,oldStyle=global.getComputedStyle;
    global.document={hidden:false,querySelector:sel=>sel==='#modal-root.open .modal'?modal:null};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:1});
    t.after(()=>{if(oldDoc===undefined)delete global.document;else global.document=oldDoc;if(oldStyle===undefined)delete global.getComputedStyle;else global.getComputedStyle=oldStyle;});
    e.mayPersist=()=>true;let saved,clicks=0;e.persist=()=>{saved=structuredClone(a.state);return true;};
    e.driver.click=el=>{assert.equal(el,gold);assert.ok(saved.rankReceipt);assert.equal(e.budget.used,1);clicks++;return true;};
    a.rankUI={...target,stage:'confirm',at:now};
    assert.ok(a.advanceTrainingRank(s,now));assert.equal(clicks,1);
    a.rankUI=null;a.state=saved;assert.ok(a.advanceTrainingRank(s,now+1000));assert.equal(clicks,1);
    Object.assign(s.mons[0],{level:5,rank:1,xp:0});assert.ok(a.advanceTrainingRank(s,now+2000));
    assert.equal(a.state.rankReceipt,undefined);assert.equal(clicks,1);assert.equal(e.budget.used,1);
    assert.equal(H.trainingStatus(s,e.settings).complete,false);
});

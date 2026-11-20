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
test('tower uses the weekly record, respects the configured limit and caps it at two',()=>{
    const s=save(),cfg=H.normalizeSettings({dailyCandy:false,dailyTower:true,towerFloor:20,towerRuns:5});
    assert.equal(H.dailyFacility(s,cfg,{},now).settings.towerRuns,2);
    s.tower={best:{week:H.towerWeek(now),floor:20}};assert.equal(H.dailyFacility(s,cfg,{},now),null);
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

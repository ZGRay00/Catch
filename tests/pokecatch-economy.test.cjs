const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const state=()=>({trainer:{id:'economy-test'},money:5000,mons:[{uid:'a',id:6,level:40,reg:'kanto',xp:123}],team:['a'],dex:{},
    travel:{to:['johto','hoenn','sinnoh']},stats:{},pension:{eggs:[]},adv:{layout:6,chapter:0,unlocked:65,node:0,runs:0,speed:4,loops:[],badges:['Maître','Maître Johto','Maître Hoenn','Maître Sinnoh']}});

test('economic region follows the opened frontier and departure wallet, independently of the replay map',()=>{
    const s=state();assert.equal(H.economicRegion(s),'sinnoh');
    s.link={from:'hoenn',to:'sinnoh',side:'from'};assert.equal(H.economicRegion(s),'hoenn');
    s.link.side='to';assert.equal(H.economicRegion(s),'sinnoh');
    delete s.link;s.travel.to=['johto'];assert.equal(H.economicRegion(s),'johto');
    s.adv.unlocked=8;assert.equal(H.economicRegion(s),'kanto','unreached regions cannot raise the wallet region');
});

test('replaying older regions applies native 75%, 60%, 50% money multipliers',()=>{
    const s=state();assert.deepEqual(H.DATA.regions.map(r=>H.moneyFactor(s,{reg:r.key})),[.5,.6,.75,1,1]);
    s.link={from:'johto',to:'sinnoh',side:'from'};assert.deepEqual(H.DATA.regions.map(r=>H.moneyFactor(s,{reg:r.key})),[.75,1,1,1,1]);
    const settings={...H.DEFAULTS,region:'all'},row=H.moneyRanking(s,settings).find(r=>r.id===8);
    assert.equal(row.rate,H.estimateRate(row)*.75*row.battleFit.factor*(row.battleFit.coverage??1));
});

test('XP thresholds use the economic region rather than the member origin',()=>{
    const s=state(),mon=s.mons[0];
    assert.equal(H.DATA.economy.xpThresholdSchema,2);
    assert.deepEqual(H.DATA.regions.map(r=>H.DATA.xpThresholds[r.key][0][40]),[48759,60949,60949,65825,48759]);
    assert.equal(H.candyXpGap(s,mon,41),65825-123);
    const total=H.experienceTotal(s);mon.reg='johto';assert.equal(H.experienceTotal(s),total);assert.equal(H.candyXpGap(s,mon,41),65825-123);
    s.link={from:'kanto',to:'sinnoh',side:'from'};assert.equal(H.candyXpGap(s,mon,41),48759-123);
});

test('a regional level-up yields exactly the granted XP even when the trainee comes from Kanto',()=>{
    const s=state(),mon=s.mons[0],before=H.experienceTotal(s),grant=H.DATA.xpThresholds.sinnoh[0][40]-mon.xp+250;
    mon.level++;mon.xp=250;assert.equal(H.experienceTotal(s)-before,grant);
});

test('wallet switches invalidate old money and XP samples instead of recording a fictitious gain',()=>{
    const s=state(),settings={...H.DEFAULTS,region:'all'},row=H.candidates(s,settings,true)[0],t=new H.Telemetry();
    const key=H.metricsKey(s,row,settings);t.begin(s,row,settings,1000);t.sample.full=true;t.sample.advanced=true;
    s.link={from:'kanto',to:'sinnoh',side:'from'};s.adv.runs++;
    assert.notEqual(H.metricsKey(s,row,settings),key);assert.equal(t.observe(s,row,settings,61000),null);assert.deepEqual(t.metrics,{});
});

test('session money follows both wallets across departure, side changes, reload, spending and merge',t=>{
    const previous=global.document;global.document={hidden:false,querySelector:()=>null};
    t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const s=state(),entries=new Map(),storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
    function save(){storage.setItem('gachamon-save-v1',JSON.stringify(s));}
    function open(){const e=new H.Engine(storage,{mode:'money'});e.schedule=()=>{};e.loadAccount(s);return e;}
    s.money=100000;save();
    let e=open();e.start();assert.equal(e.running,true,e.status);
    s.link={from:'hoenn',to:'sinnoh',side:'to',stash:{money:s.money}};s.money=0;
    assert.equal(e.sessionMoneyNet(s),0);
    s.money=3000;assert.equal(e.sessionMoneyNet(s),3000);
    s.link.side='from';s.link.stash.money=3000;s.money=100000;
    save();e.persist();e.release();e=open();e.start(true);
    assert.equal(e.running,true,e.status);assert.equal(e.sessionMoneyNet(s),3000);
    s.money-=750;assert.equal(e.sessionMoneyNet(s),2250);
    s.money+=s.link.stash.money;delete s.link;assert.equal(e.sessionMoneyNet(s),2250);
    e.stop();
});

test('legacy single-wallet checkpoints rebase only once a complete balance is readable',t=>{
    const previous=global.document;global.document={hidden:false,querySelector:()=>null};
    t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const s=state(),entries=new Map(),storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
    const e=new H.Engine(storage,{mode:'money'});e.schedule=()=>{};s.link={from:'hoenn',to:'sinnoh',side:'to'};
    storage.setItem('gachamon-save-v1',JSON.stringify(s));e.loadAccount(s);
    e.checkpoint={wanted:true,settings:e.settings,session:{started:1,startMoney:100000}};
    e.start(true);assert.equal(e.running,true,e.status);assert.equal(e.sessionMoneyNet(e.read()),null);
    s.link.stash={money:100000};storage.setItem('gachamon-save-v1',JSON.stringify(s));
    assert.equal(e.sessionMoneyNet(e.read()),0);assert.equal(e.walletScope,'rebased');
    s.money+=120;storage.setItem('gachamon-save-v1',JSON.stringify(s));
    assert.equal(e.sessionMoneyNet(e.read()),120);e.stop();
});

test('corrected regional XP data still accounts for rank and the current per-member XP balance',()=>{
    const s=state(),mon=s.mons[0];mon.rank=3;mon.level=20;mon.xp=99;
    const table=H.DATA.xpThresholds.sinnoh[3];assert.equal(H.candyXpGap(s,mon,22),table[20]+table[21]-99);
    s.link={from:'hoenn',to:'sinnoh',side:'from'};const next=H.DATA.xpThresholds.hoenn[3];assert.equal(H.candyXpGap(s,mon,22),next[20]+next[21]-99);
});

for(const eggs of [[],[{uid:'future',id:1,hatchAt:Date.now()+3600000}]])test(`incidental hatching preserves a full map sample with ${eggs.length?'only unready eggs':'no eggs'}`,async t=>{
    const previous=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const s=state();s.travel.to=[];s.adv.unlocked=8;s.pension.eggs=eggs;
    const entries=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','t']]),storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k)};
    const e=new H.Engine(storage,{mode:'money',pensionService:true,autoTeam:false,autoPrepare:false,raids:false});e.loadAccount(s);e.running=true;e.started=Date.now();e.tabToken='t';
    e.driver={animations:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false,nav:()=>true};
    const row=H.candidates(s,e.settings,true)[0];e.target=row;e.visit={started:Date.now(),deaths:0};
    e.telemetry.begin(s,row,e.settings,Date.now()-90000);e.telemetry.sample.full=true;const sample=e.telemetry.sample;
    let services=0;e.automation.breed=()=>services++;
    await e.step();assert.equal(e.running,true,e.status);assert.equal(services,0);assert.equal(e.telemetry.sample,sample);assert.equal(e.services.lastStarted.eggs,undefined);e.stop();
});

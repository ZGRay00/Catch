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
    assert.deepEqual(H.DATA.regions.map(r=>H.DATA.xpThresholds[r.key][0][40]),[48759,60949,60949,65825,65825]);
    assert.equal(H.candyXpGap(s,mon,41),65825-123);
    const total=H.experienceTotal(s);mon.reg='johto';assert.equal(H.experienceTotal(s),total);assert.equal(H.candyXpGap(s,mon,41),65825-123);
    s.link={from:'kanto',to:'sinnoh',side:'from'};assert.equal(H.candyXpGap(s,mon,41),48759-123);
});

test('a regional level-up yields exactly the granted XP even when the trainee comes from Kanto',()=>{
    const s=state(),mon=s.mons[0],before=H.experienceTotal(s),grant=H.DATA.xpThresholds.sinnoh[0][40]-mon.xp+250;
    mon.level++;mon.xp=250;assert.equal(H.experienceTotal(s)-before,grant);
});

for(const origin of ['unova','sinnoh'])test('a pre-update '+origin+' training checkpoint preserves queue, time and money across two reloads',t=>{
    const previous=global.document;global.document={hidden:false,querySelector:()=>null};
    t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const s=state(),mon=s.mons[0];s.adv.chapter=s.adv.unlocked=origin==='unova'?73:55;
    if(origin==='unova')s.travel.to.push('unova');
    const oldTable=H.DATA.xpThresholds[origin==='unova'?'kanto':'sinnoh'][0];
    const priorXp=oldTable.slice(1,mon.level).reduce((sum,x)=>sum+x,mon.xp)-300;
    const cfg=H.normalizeSettings({...H.DEFAULTS,mode:'train',trainUid:mon.uid,trainLevel:50}),started=Date.now()-45000;
    const session={started,startMoney:3000,walletScope:'all',startTrainingXp:priorXp,trainingSelection:mon.uid,trainProtected:[mon.uid]};
    const progress={session,budget:{spent:10,used:1}};
    const queue=[{id:'first',status:'done',settings:{mode:'money'}},{id:'second',status:'running',settings:cfg,progress}];
    const profile={settings:cfg,queue,queueIndex:1,resume:{...progress,account:H.accountId(s),build:H.DATA.build,layout:H.DATA.layout,wanted:true,queueIndex:1,queueRunning:true,settings:cfg}};
    const profileKey='pokecatch-helper:v1:'+H.accountId(s);
    const data=new Map([[profileKey,JSON.stringify(profile)],['gachamon-save-v1',JSON.stringify(s)]]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    function reload(){const e=new H.Engine(storage);e.schedule=()=>{};e.loadAccount(s);e.tryResume();assert.equal(e.running,true,e.status);return e;}
    const first=reload(),base=origin==='unova'?H.experienceTotal(s):priorXp;
    assert.equal(first.startTrainingXp,base);assert.equal(first.trainingXpRebased,origin==='unova');
    assert.equal(first.started,started);assert.equal(first.sessionMoneyNet(s),2000);
    assert.deepEqual(first.queue.map(job=>job.status),['done','running']);assert.equal(first.queueIndex,1);
    assert.equal(first.budget.spent,10);assert.equal(first.budget.used,1);
    first.persist();first.release();mon.xp+=85;data.set('gachamon-save-v1',JSON.stringify(s));
    const second=reload();assert.equal(second.startTrainingXp,base);
    assert.equal(H.experienceTotal(s)-second.startTrainingXp,origin==='unova'?85:385);
    assert.equal(second.queue[1].progress.session.startTrainingXp,base);
    second.stop();
});

test('resuming a pending Unova candy use requires a native receipt when its XP baseline used the old curve',()=>{
    const s=state(),now=1e6;s.travel.to.push('unova');s.adv.chapter=s.adv.unlocked=73;
    const mon=s.mons[0],id='exp-candy-m';s.items={[id]:1};
    const e=new H.Engine({}),p={candyTx:{uid:mon.uid,id,kind:'use',stock:1,counter:0,xp:1,at:now}};
    assert.equal(e.coach.candyPending(s,p,now),true);
    s.items[id]=0;assert.equal(e.coach.candyPending(s,p,now+100),false);
    assert.equal(p.candyTx,undefined);assert.equal(p.candyDisabled,true);
});

test('Unova badge and castle frontiers use their native caps and all four Unova candies',()=>{
    const s=state(),mon=s.mons[0];
    s.travel.to.push('unova');mon.reg='unova';s.adv.chapter=s.adv.unlocked=73;
    for(const link of [undefined,{from:'sinnoh',to:'unova',side:'to'}]){
        s.link=link;s.adv.chapter=s.adv.unlocked=73;mon.level=53;
        assert.equal(H.trainingCap(s,mon),55);
        assert.equal(H.trainingStatus(s,{trainUid:mon.uid,trainLevel:55}).available.length,1);
        s.adv.chapter=s.adv.unlocked=81;mon.level=95;
        assert.equal(H.trainingCap(s,mon),100);
        assert.ok(H.candyXpGap(s,mon,96)>0);
    }
    for(const [id,xp] of Object.entries({'exp-candy-s':810,'exp-candy-m':12150,'exp-candy-xl':202500,'exp-candy-big':810000})){
        s.items={[id]:1};assert.equal(H.candyChoice(s,mon,99).xp,xp);
    }
    mon.level=40;mon.rank=2.9;mon.xp=10;
    const need=H.candyXpGap(s,mon,41),total=H.experienceTotal(s);
    assert.equal(need,H.DATA.xpThresholds.unova[2][40]-10);
    mon.level++;mon.xp=0;assert.equal(H.experienceTotal(s)-total,need);
});

test('reloading old Unova route history retains money and items and refreshes incompatible XP only',()=>{
    const s=state(),settings=H.DEFAULTS,now=1e6;
    s.travel.to.push('unova');s.adv.chapter=s.adv.unlocked=73;
    const row=H.candidates(s,settings,true)[0],key=H.metricsKey(s,row,settings,now);
    const originKey=key.replace('|unova|','|sinnoh|'),old={net:70,seconds:60,runs:1,xp:90,xpSeconds:60,xpRuns:1,itemCounts:{potion:2},itemRuns:1,itemSeconds:60};
    let saved={metrics:{[key]:old,[originKey]:old}};
    const store={getItem:()=>JSON.stringify(saved)};
    const e=new H.Engine(store);e.loadAccount(s);
    assert.equal(e.metrics[key].xpSeconds,undefined);
    assert.equal(e.metrics[key].net,70);assert.equal(e.metrics[key].itemSeconds,60);
    assert.equal(e.metrics[originKey].xp,90);
    s.adv.chapter=row.id;s.adv.speed=settings.speed;e.telemetry.begin(s,row,settings,now);
    e.telemetry.sample.full=e.telemetry.sample.advanced=true;s.adv.runs++;s.mons[0].xp+=125;
    assert.equal(e.telemetry.observe(s,row,settings,now+60000).xp,125);
    const freshKey=H.metricsKey(s,row,settings,now);
    saved={metrics:e.metrics};e.loadAccount(s);
    assert.equal(e.metrics[freshKey].xp,125);assert.equal(e.metrics[freshKey].xpRuns,1);
});

test('wallet switches invalidate old money and XP samples instead of recording a fictitious gain',()=>{
    const s=state(),settings={...H.DEFAULTS,region:'all'},row=H.candidates(s,settings,true)[0],t=new H.Telemetry();
    const key=H.metricsKey(s,row,settings);t.begin(s,row,settings,1000);t.sample.full=true;t.sample.advanced=true;
    s.link={from:'kanto',to:'sinnoh',side:'from'};s.adv.runs++;
    assert.notEqual(H.metricsKey(s,row,settings),key);assert.equal(t.observe(s,row,settings,61000),null);assert.deepEqual(t.metrics,{});
});

test('regional money comparisons use the native away team, wallet bonuses and matching measurements in either direction',()=>{
    const s=state(),now=1e6,settings={...H.DEFAULTS,mode:'money',region:'all',moneyTarget:0};
    s.mons=[{uid:'new',id:52,level:5,reg:'sinnoh'},{uid:'old',id:143,level:90,reg:'hoenn'}];
    s.team=['new'];s.link={to:'sinnoh',from:'hoenn',side:'to',stash:{team:['old'],money:100000}};
    s.buffs={money:{key:'lansat-berry',side:'from',until:now+60000}};
    s.adv.chapter=48;s.adv.unlocked=49;
    const oldSide={...s,team:['old'],link:{...s.link,side:'from',stash:{team:['new'],money:s.money}}};
    const find=(save,id,cfg=settings,metrics={})=>H.moneyRanking(save,cfg,metrics,{},now).find(row=>row.id===id);
    for(const [here,there,id]of [[s,oldSide,30],[oldSide,s,48]]){
        const actual=find(there,id),away=find(here,id);
        assert.deepEqual(away,actual);
        assert.ok(away.battleFit.turns>0);
        const metrics={[H.metricsKey(here,away,settings,now)]:{net:999999,runs:4,seconds:60}};
        assert.equal(find(here,id,settings,metrics).measured,false);
        metrics[H.metricsKey(there,actual,settings,now)]={net:202,runs:2,seconds:120};
        const measured=find(here,id,settings,metrics);
        assert.equal(measured.measured,true);assert.equal(measured.rate,101);
        assert.equal(find(here,id,{...settings,moneyTarget:50000}),undefined,'a wallet-specific target never sends the player to the other balance');
    }
    const before=find(s,30).battleFit.turns;s.mons[1].level=5;
    assert.notEqual(find(s,30).battleFit.turns,before,'changes in the stored away team invalidate route rankings');
    s.link.stash.team=['removed'];
    assert.equal(find(s,30),undefined,'the native switch would leave the other team empty');
    delete s.link;
    assert.ok(find(s,30,{...settings,moneyTarget:50000}),'merged wallets can accrue the goal from earlier regions');
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

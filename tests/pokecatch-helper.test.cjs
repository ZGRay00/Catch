const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');
const preparationTick=require('./fixtures/pokecatch-preparation-tick.cjs');

test('target metadata has readable conditions, finite sources and complete XP thresholds', () => {
    assert.equal(H.DATA.zones.length, 57);
    assert.ok(H.DATA.zones.every(z => typeof z.condition === 'string' && z.condition.length > 0));
    assert.ok(H.DATA.items.length >= 30);
    assert.ok(H.DATA.chapters.every(c => c.xpEstimate > 0));
    for (const reg of H.DATA.regions) assert.ok(H.DATA.xpThresholds[reg.key][0][99] > 0);
});

test('new settings accept targets and clamp goals while rejecting unknown item/zone IDs', () => {
    const settings = H.normalizeSettings({mode:'legend',legendId:150,legendTier:2.9,legendMinutes:-5,itemId:'not-a-game-item',trainLevel:500,itemQuantity:0});
    assert.equal(settings.mode,'legend'); assert.equal(settings.legendId,150); assert.equal(settings.legendTier,2);
    assert.equal(settings.legendMinutes,5); assert.equal(settings.trainLevel,100); assert.equal(settings.itemQuantity,1);
    assert.equal(settings.itemId,H.DEFAULTS.itemId); assert.equal(H.normalizeSettings({legendId:99999}).legendId,H.DEFAULTS.legendId);
});

test('item planner removes claimed one-time finds and regional stones, respects ownership and tide', () => {
    const s=state(); s.travel.to=['johto','hoenn','sinnoh']; s.adv.unlocked=65;
    const settings={...H.DEFAULTS,region:'all',itemId:'old-amber'};
    assert.ok(H.itemRanking(s,settings).length); s.adv.gifts['old-amber']=true;
    assert.equal(H.itemRanking(s,settings).length,0);
    const stone={...settings,region:'current',itemId:'fire-stone'}; assert.ok(H.itemRanking(s,stone).length);
    s.stonesFound={'r:kanto':['fire-stone']}; assert.equal(H.itemRanking(s,stone).length,0);
    assert.equal(H.sourceAvailable(s,{ch:39,tide:'low'},'prism-scale',0),true);
    assert.equal(H.sourceAvailable(s,{ch:39,tide:'low'},'prism-scale',H.DATA.tideMs),false);
    assert.equal(H.sourceAvailable(s,{ch:50,owns:[483]},'adamant-orb'),false);
    s.mons.push({uid:'dialga',id:483,level:100}); assert.equal(H.sourceAvailable(s,{ch:50,owns:[483]},'adamant-orb'),true);
});

test('item sampling smooths rare zero drops and acquisition counters survive item spending', () => {
    const s=state(),settings={...H.DEFAULTS,itemId:'berry-oran'},rows=H.itemRanking(s,settings),metrics={};
    const row=rows[0]; metrics[H.metricsKey(s,row,settings)]={itemSeconds:200,itemRuns:2,itemCounts:{}};
    const result=H.itemRanking(s,settings,metrics).find(r=>r.key===row.key);
    assert.ok(result.rate>0); assert.equal(result.actualRate,0); assert.equal(result.measured,true);
    s.items={'berry-oran':1};s.stats.itemIn={'berry-oran':8};assert.equal(H.itemCounter(s,'berry-oran'),8);
    delete s.stats.itemIn;s.link={stash:{items:{'berry-oran':2}}};assert.equal(H.itemCounter(s,'berry-oran'),3);
});

test('training resolves party targets, regional caps, XP across level ups and ranking history', () => {
    const s=state();s.adv.unlocked=0;s.mons[0].level=19;s.mons[0].xp=4;
    const settings={...H.DEFAULTS,mode:'train',trainLevel:30}; assert.equal(H.trainingStatus(s,settings).cap,20);
    s.mons[0].level=20;assert.equal(H.trainingStatus(s,settings).capped,true);
    assert.equal(H.trainingStatus(s,{...settings,trainUid:'missing'}).missing,true);
    s.adv.unlocked=8;s.mons[0].level=20;s.mons[0].xp=0;const before=H.experienceTotal(s);
    s.mons[0].level++;s.mons[0].xp=7;assert.equal(H.experienceTotal(s)-before,H.DATA.xpThresholds.kanto[0][20]+7);
    const row=H.xpRanking(s,settings)[0],metrics={[H.metricsKey(s,row,settings)]:{xp:9000,xpSeconds:60,xpRuns:2}};
    assert.equal(H.xpRanking(s,settings,metrics).find(r=>r.key===row.key).rate,9000);
    s.link={};s.mons[0].reg='sinnoh';s.adv.unlocked=0;assert.equal(H.trainingCap(s,s.mons[0]),H.DATA.caps[0].sinnoh);
    s.mons[0].reg='kanto2';assert.equal(H.trainingCap(s,s.mons[0]),H.DATA.caps[0].johto);assert.ok(H.experienceTotal(s)>0);
    delete s.mons[0].reg;s.adv.chapter=14;assert.equal(H.trainingCap(s,s.mons[0]),H.DATA.caps[0].kanto);
});

test('global training cap follows unlocked Johto progress after wallets are merged', () => {
    const s=state();s.adv.unlocked=21;s.adv.chapter=20;s.travel.to=['johto'];delete s.link;
    assert.equal(H.trainingCap(s,s.mons[0]),62,'unlinked travel must not use the static 100 main-cap snapshot');
});

test('returning to an old Kanto map does not raise the global training cap above the Johto frontier', () => {
    const s=state();s.adv.unlocked=21;s.adv.chapter=0;s.travel.to=['johto'];delete s.link;
    assert.equal(H.trainingCap(s,s.mons[0]),62,'the active farming map must not replace the open-region frontier');
});

test('locked future regions cannot lower training caps to their initial level', () => {
    const s=state();s.adv.unlocked=8;s.adv.chapter=0;s.travel.to=[];delete s.link;
    assert.equal(H.trainingCap(s,s.mons[0]),H.DATA.caps[8].kanto);
    s.adv.unlocked=21;s.adv.chapter=20;s.travel.to=['johto'];
    assert.equal(H.trainingCap(s,s.mons[0]),62,'unopened Hoenn and Sinnoh caps must be ignored');
});

test('regional champion badges retain a level-100 cap without admitting unopened future regions', () => {
    for(const region of H.DATA.regions){
        const champion=H.DATA.chapters.find(c=>c.reg===region.key&&c.league&&c.badges?.length);
        assert.ok(champion,`${region.key} champion metadata exists`);
        const s=state();s.adv.unlocked=champion.id;s.adv.chapter=champion.id;s.adv.badges=[...champion.badges];
        s.travel.to=H.DATA.regions.filter(r=>r.start<=region.start&&r.key!=='kanto').map(r=>r.key);delete s.link;
        s.mons[0].reg=region.key;assert.equal(H.trainingCap(s,s.mons[0]),100,`${region.key} merged wallet cap`);
        s.link={to:region.key,side:'to'};assert.equal(H.trainingCap(s,s.mons[0]),100,`${region.key} regional cap`);
    }
});

test('telemetry records realized XP and item intake only after a complete warm-up cycle', () => {
    const s=state();s.mons[0].xp=0;s.stats.itemIn={};const row=H.candidates(s,H.DEFAULTS)[0],t=new H.Telemetry();
    t.begin(s,row,H.DEFAULTS,0);s.adv.node=1;t.observe(s,row,H.DEFAULTS,10000);s.adv.runs++;t.observe(s,row,H.DEFAULTS,20000);
    s.adv.node=2;t.observe(s,row,H.DEFAULTS,30000);s.mons[0].xp+=345;s.stats.itemIn['berry-oran']=2;s.adv.runs++;
    const result=t.observe(s,row,H.DEFAULTS,50000),m=t.metrics[H.metricsKey(s,row,H.DEFAULTS,50000)];
    assert.equal(result.valid,true);assert.equal(result.xp,345);assert.equal(m.xp,345);assert.equal(m.itemCounts['berry-oran'],2);assert.equal(m.itemSeconds,30);
});

test('legend goals distinguish ordinary captures, rotating forms and monotonic elite tiers', () => {
    const s=state(),settings={...H.DEFAULTS,mode:'legend',legendId:145};assert.equal(H.legendProgress(s,settings).done,false);
    s.dex[145]={caught:1};assert.equal(H.legendProgress(s,settings).done,true);
    s.elite={145:{t:2}};assert.equal(H.legendProgress(s,{...settings,legendTier:3}).nextTier,3);assert.equal(H.legendProgress(s,{...settings,legendTier:2}).done,true);
    const zone=H.DATA.zones.find(z=>z.forms?.length);assert.ok(zone);s.dex[zone.forms[0]]={caught:1};
    assert.equal(H.legendProgress(s,{...settings,legendId:zone.id}).done,false);
    zone.forms.forEach(id=>s.dex[id]={caught:1});assert.equal(H.legendProgress(s,{...settings,legendId:zone.id}).done,true);
});

test('requested legend bypasses daily raids and selects only the next elite tier', async t => {
    const s=state();s.dex[145]={caught:1};s.elite={145:{t:1}};s.adv.badges=['Maître'];
    const {e,actions}=runtime(t,s,{mode:'legend',legendId:145,legendTier:3,raids:true});e.nextRaid=0;
    await e.step();assert.equal(e.driver.pendingMap.row.id,145);assert.equal(e.driver.pendingMap.options.tier,2);assert.equal(e.raidProbe,false);
    assert.ok(!actions.includes('raid'));
});

test('item goal stops on new acquisitions even if native conversion emptied the bag', async t => {
    const s=state();s.stats.itemIn={'old-amber':3};s.items={};const {e,actions}=runtime(t,s,{mode:'item',itemId:'old-amber',itemQuantity:2});e.startItems=1;
    await e.step();assert.equal(e.running,false);assert.match(e.status,/已获得/);assert.equal(actions.length,0);
});

test('training goal and cap stop before map navigation; missing item sources never fall back to money', async t => {
    const s=state();const {e,actions}=runtime(t,s,{mode:'train',trainLevel:70});await e.step();assert.equal(e.running,false);assert.match(e.status,/达到/);assert.equal(actions.length,0);
    e.settings={...H.DEFAULTS,mode:'item',itemId:'old-amber'};e.running=true;e.raw=null;s.adv.gifts['old-amber']=true;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    await e.step();assert.equal(e.running,false);assert.match(e.status,/无可刷/);assert.equal(e.driver.pendingMap,null);
});
function state(overrides = {}) {
    return { trainer: { id: 'fixture' }, money: 3000, mons: [{ uid: 'a', id: 6, level: 70 }], team: ['a'], dex: {},
        stats: { battles: 0, wins: 0, caught: 0 }, travel: { to: [] }, pension: { mons: [] },
        adv: { layout: 6, chapter: 0, unlocked: 8, speed: 4, runs: 0, node: 0, loops: [], badges: [], gifts: { starter: true }, deaths: {} }, ...overrides };
}
function storage(s) {
    const data = new Map([['gachamon-save-v1', JSON.stringify(s)], ['pokecatch-tab', 'tab1']]);
    return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), data };
}
function runtime(t, s, settings = {}) {
    const before = global.document;
    global.document = { hidden: false, querySelector: () => null, querySelectorAll: () => [] };
    t.after(() => { if (before === undefined) delete global.document; else global.document = before; });
    const e = new H.Engine(storage(s), {autoTeam:false,autoPrepare:false,trainBuddy:false,trainBuff:false,moneyBuff:false,...settings}); e.loadAccount(s); e.running = true; e.started = Date.now();
    e.account = 'fixture'; e.tabToken = 'tab1'; e.startMoney = s.money; e.nextRaid = Infinity;
    const actions = [];
    e.driver = { receipt: () => false, dialog: () => false, gift: () => false, animations: () => false, nav: () => { actions.push('nav'); return true; },
        click: () => { actions.push('click'); return true; }, map: () => { actions.push('map'); return true; }, raidStep: () => actions.push('raid') };
    return { e, actions };
}

test('preparation settings clamp margins and preserve the opt-out',()=>{
    assert.equal(H.DEFAULTS.autoPrepare,true);const cfg=H.normalizeSettings({autoPrepare:false,prepareMargin:99,prepareGap:-3,prepareIdleMinutes:0});
    assert.equal(cfg.autoPrepare,false);assert.equal(cfg.prepareMargin,15);assert.equal(cfg.prepareGap,0);assert.equal(cfg.prepareIdleMinutes,2);
});

test('mainline candy settings default on and remain independently configurable',()=>{
    assert.equal(H.DEFAULTS.progressCandy,true);assert.equal(H.normalizeSettings({progressCandy:false}).progressCandy,false);
    for(const info of Object.values(H.DATA.automation.candies))for(const reg of H.DATA.regions)assert.ok(info.xp[reg.key]>0);
});

test('candy planning uses native wallet region and exact XP gap with regional caps',()=>{
    const s=johtoScreenshot(),mon={...s.mons[0],level:44,xp:50};
    assert.equal(H.candyRegion(s),'johto');assert.equal(H.candyXpGap(s,mon,99),H.DATA.xpThresholds.johto[0][44]+H.DATA.xpThresholds.johto[0][45]-50);
    s.link={side:'from',from:'kanto',to:'johto'};assert.equal(H.candyRegion(s),'kanto');s.items={'exp-candy-s':1};assert.equal(H.candyChoice(s,mon,46).xp,600);
});

test('candy selection prioritizes owned EXP candy and leaves rare candy untouched',()=>{
    const s=state(),mon={uid:'a',id:6,level:1,xp:0};s.items={'rare-candy':10,'exp-candy-s':1,'exp-candy-big':1};
    assert.equal(H.candyChoice(s,mon,2).id,'exp-candy-s');s.items={'rare-candy':10};assert.equal(H.candyChoice(s,mon,2),null);
});

test('candy purchases select the highest offered tier independently of the short-term goal',()=>{
    const s=state(),mon={uid:'a',id:6,level:1,xp:0},offers=[{id:'exp-candy-s',cost:1200},{id:'exp-candy-big',cost:96000}];
    assert.equal(H.candyChoice(s,mon,2,offers).id,'exp-candy-big');
    assert.equal(H.candyChoice(s,mon,2,[offers[0],{id:'exp-candy-big',cost:null}]),null);
    s.adv.unlocked=65;assert.equal(H.candyChoice(s,{...mon,level:99},100,offers).id,'exp-candy-big');s.adv.unlocked=8;
    assert.equal(H.candyChoice(s,{...mon,level:75},100,offers),null,'current regional cap prevents further candy consumption');
});

test('zero candy purchase budget falls back to training without stopping or resetting the goal',async t=>{
    const s=state();s.mons[0].level=5;const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,autoTeam:false,progressCandy:true,spendBudget:0});e.read();e.progress(s,Date.now());
    await preparationTick(e,()=>e.coach.step(s,Date.now()));assert.equal(e.running,true);assert.equal(e.preparation.candyDisabled,true);assert.equal(e.preparation.phase,'train');assert.equal(e.budget.spent,0);assert.equal(e.settings.mode,'progress');e.stop();
});

test('unconfirmed candy action times out without repeating the transaction',t=>{
    const s=state(),{e}=runtime(t,s);const now=Date.now(),p={candyTx:{uid:'a',id:'exp-candy-m',kind:'buy',stock:0,counter:0,at:now}};
    assert.equal(e.coach.candyPending(s,p,now+1000),true);assert.ok(p.candyTx);assert.equal(e.coach.candyPending(s,p,now+11000),false);assert.equal(p.candyDisabled,true);assert.equal(p.candyTx,undefined);assert.equal(e.budget.spent,0);
});

test('candy use confirmation requires growth of the intended member',t=>{
    const s=state(),{e}=runtime(t,s);const now=Date.now(),xp=H.experienceTotal(s,['a']),p={candyTx:{uid:'a',id:'exp-candy-m',kind:'use',stock:1,counter:0,xp,at:now}};
    s.items={'exp-candy-m':0};s.stats.itemOut={'exp-candy-m':1};s.mons[0].xp=10;assert.equal(e.coach.candyPending(s,p,now+1000),false);assert.equal(p.candyDisabled,undefined);
    p.candyTx={uid:'a',id:'exp-candy-m',kind:'use',stock:1,counter:1,xp:H.experienceTotal(s,['a']),at:now};assert.equal(e.coach.candyPending(s,p,now+1000),false);assert.equal(p.candyDisabled,true);
});

test('candy preparation checkpoints restore card ownership and usage budgets',t=>{
    const s=state();s.mons[0].level=5;const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,autoTeam:false,progressCandy:true});e.read();const now=Date.now();e.progress(s,now);
    e.preparation.candy={uid:'a',goal:75};e.preparation.candyTx={uid:'a',id:'exp-candy-m',kind:'use',stock:1,counter:0,xp:0,at:now};e.automation.own('coachCandy','.mon-modal',{uid:'a'});e.budget.spent=50;e.budget.used=1;e.suspend();
    const next=new H.Engine(e.storage);next.loadAccount(s);next.schedule=()=>{};next.start(true);assert.equal(next.preparation.candyTx.id,'exp-candy-m');assert.equal(next.automation.owner.kind,'coachCandy');assert.equal(next.budget.spent,50);assert.equal(next.budget.used,1);next.stop();
});

test('preparation projects suitable low-level counters instead of only checking the existing party',()=>{
    const s=state();s.adv.unlocked=8;s.mons=[{uid:'fire',id:4,level:40},{uid:'electric',id:25,level:5},{uid:'rock',id:74,level:5}];s.team=['fire'];
    const context={...H.battleContext(s,'raid',{id:130,reg:'kanto',level:40}),size:1},plan=H.preparationPlan(s,{...H.DEFAULTS,prepareMargin:0,prepareGap:3},context);
    assert.equal(plan.members[0].uid,'electric');assert.equal(plan.needed,true);assert.equal(plan.targets[0].goal,40);assert.equal(plan.uids[0],'fire');assert.ok(plan.uids.includes('electric'));
    s.eventTeams={'raid:kanto':['fire']};const fixed=H.preparationPlan(s,{...H.DEFAULTS,autoTeam:false,optimizeRaid:false,prepareMargin:0},context);assert.equal(fixed.needed,false);assert.equal(fixed.members[0].uid,'fire');
});

test('fixed special squads are evaluated independently of the adventure auto-team toggle',()=>{
    const s=state();s.adv.unlocked=65;s.mons=[{uid:'adventure',id:6,level:100},{uid:'fixed',id:43,level:20},{uid:'counter',id:145,level:100}];s.team=['adventure'];s.eventTeams={'raid:kanto':['fixed']};
    const p=H.preparationPlan(s,{...H.DEFAULTS,autoTeam:true,optimizeRaid:false},H.battleContext(s,'raid',{id:130,reg:'kanto'}));
    assert.deepEqual(p.members.map(m=>m.uid),['fixed']);assert.equal(p.needed,true);assert.equal(p.targets[0].goal,100);
});

test('native recommended status members are the special-battle trainees, rather than an unrelated damage lineup',()=>{
    const s=state();s.adv.unlocked=65;s.mons=[{uid:'status',id:43,level:20},{uid:'counter',id:145,level:100}];s.team=['counter'];s.eventTeams={'raid:kanto':['status']};
    assert.deepEqual(H.preparationPlan(s,H.DEFAULTS,H.battleContext(s,'raid',{id:130,reg:'kanto'})).targets.map(m=>m.uid),['status']);
});

test('a manually configured raid with no members does not borrow and train the adventure party',()=>{
    const s=state();s.mons[0].level=5;s.eventTeams={'raid:kanto':[]};
    const p=H.preparationPlan(s,{...H.DEFAULTS,autoTeam:true,optimizeRaid:false},H.battleContext(s,'raid',{id:35,reg:'kanto'}));assert.equal(p.needed,false);assert.deepEqual(p.members,[]);
});

test('active rotated legendary forms resolve the configured base-zone team',()=>{
    const s=state();s.adv.unlocked=65;s.adv.zone={id:487,foe:48701};s.mons.push({uid:'zone',id:94,level:30});s.eventTeams={'zone:487':['zone']};
    const p=H.preparationPlan(s,{...H.DEFAULTS,optimizeRaid:false},H.battleContext(s,'zone',{id:48701,reg:'sinnoh'}));assert.deepEqual(p.members.map(m=>m.uid),['zone']);
});

test('elite training follows native species uniqueness while ordinary teams can keep normal and shiny copies',()=>{
    const s=state();s.adv.unlocked=65;s.team=[];s.mons=[{uid:'normal',id:6,level:90},{uid:'shiny',id:6,level:90,shiny:true},{uid:'water',id:9,level:90}];
    const elite=H.preparationPlan(s,H.DEFAULTS,H.battleContext(s,'elite',{reg:'kanto',tier:1}));assert.equal(elite.members.filter(m=>m.id===6).length,1);
    const ordinary=H.planAdventureTeam(s,H.DEFAULTS,[],{force:true});assert.ok(ordinary.uids.includes('normal')&&ordinary.uids.includes('shiny'));
});

test('explicit two-member limits apply even without the force flag',()=>{
    const s=state();s.mons=[6,9,3,65,94,149].map((id,i)=>({uid:'p'+i,id,level:100}));s.team=s.mons.map(m=>m.uid);
    const p=H.planAdventureTeam(s,H.DEFAULTS,[],{size:2});assert.equal(p.uids.length,2);assert.equal(p.changed,true);
});

test('manual edits to a special team invalidate the previous readiness cache',t=>{
    const s=state();s.adv.unlocked=65;s.mons[0].level=100;s.mons.push({uid:'weak',id:43,level:5});s.eventTeams={'raid:kanto':['a']};
    const {e}=runtime(t,s,{autoPrepare:true,optimizeRaid:false,autoTeam:true});const c=H.battleContext(s,'raid',{id:35,reg:'kanto'});assert.equal(e.ensurePrepared(s,c),false);
    s.eventTeams['raid:kanto']=['weak'];assert.equal(e.ensurePrepared(s,c),true);assert.equal(e.preparation.targets[0].uid,'weak');e.stop();
});

test('a ready squad is kept instead of training a new candidate for a marginal projected gain',()=>{
    const s=state();s.adv.unlocked=65;s.mons=[6,9,3,65,94,149].map((id,i)=>({uid:'a'+i,id,level:100}));s.team=s.mons.map(m=>m.uid);s.mons.push({uid:'bench',id:151,level:5});
    const p=H.preparationPlan(s,H.DEFAULTS,H.battleContext(s,'raid',{id:6,reg:'kanto'}));assert.equal(p.needed,false);assert.ok(!p.members.some(m=>m.uid==='bench'));assert.deepEqual(p.targets,[]);
});

function johtoScreenshot(){
    const s=state(),levels=[46,46,44,42,32,30],ids=[157,176,156,43,56,203];
    s.adv.chapter=18;s.adv.unlocked=18;s.travel.to=['johto'];s.link={to:'johto',side:'to'};
    s.mons=levels.map((level,i)=>({uid:'j'+i,id:ids[i],level,reg:'johto'}));s.team=s.mons.map(m=>m.uid);s.road=[...s.team];return s;
}

test('screenshot party trains its weak members despite two members already being at the regional cap',async t=>{
    const s=johtoScreenshot(),{e}=runtime(t,s,{mode:'progress',progressUntil:65,autoTeam:true,autoPrepare:true});
    e.driver.teamTask={chapter:18,members:[18],uids:[...s.team].reverse(),started:Date.now()};s.adv.battle={steps:1};e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    await e.step();assert.ok(e.preparation,'level preflight runs before pending PC edits and mainline combat');assert.equal(e.driver.teamTask,null);
    assert.equal(e.preparation.context.id,18);assert.equal(e.preparation.capLimited,true);
    assert.deepEqual(e.preparation.targets.filter(m=>m.level<=32).map(m=>m.goal),[46,46]);
    const rows=H.preparationRoutes(s,e.settings,e.preparation);assert.ok(rows.length);assert.ok(rows.every(row=>row.reg==='johto'&&row.id<=18));
    for(const row of rows.filter(row=>row.id===18)){assert.ok(row.battleFit.coverage>=.9);assert.ok(row.battleFit.turns<=3);}e.stop();
});

test('ongoing money map rechecks levels before its minimum sampling time expires',async t=>{
    const s=johtoScreenshot(),{e}=runtime(t,s,{mode:'money',autoPrepare:true,autoTeam:true,autoEvolve:false});
    e.target={...H.DATA.chapters[17],key:'17',members:[17]};e.visit={started:Date.now(),deaths:0};
    await e.step();assert.equal(e.preparation?.context.id,17);assert.equal(e.preparation.resume.row.id,17);assert.ok(e.preparation.targets.some(m=>m.level===30));e.stop();
});

test('an observed defeat overrides the small level-gap tolerance without inventing a higher cap',async t=>{
    const s=johtoScreenshot();s.mons=s.mons.slice(0,1);s.mons[0].level=45;s.team=['j0'];s.road=['j0'];
    const {e}=runtime(t,s,{mode:'progress',progressUntil:65,autoPrepare:true,autoTeam:false});const now=Date.now();await e.step(now);assert.equal(e.preparation,null);
    s.adv.deaths[18]=1;s.money-=500;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));await e.step(now+1200);
    assert.equal(e.preparation.targets[0].goal,46);assert.match(e.status,/战败后/);e.stop();
});

test('training defeats lower the route difficulty and keep that ceiling for the remaining detour',async t=>{
    const s=johtoScreenshot();s.mons=s.mons.slice(0,1);s.mons[0].level=40;s.team=['j0'];s.road=['j0'];
    const {e}=runtime(t,s,{mode:'progress',progressUntil:65,autoPrepare:true,autoTeam:false});e.read();const now=Date.now();e.progress(s,now);const p=e.preparation;
    Object.assign(p,{phase:'train',route:{...H.DATA.chapters[17],key:'17',members:[17]},visit:{at:now,deaths:0},routeCheck:now});s.adv.chapter=17;s.adv.deaths[17]=2;
    await preparationTick(e,()=>e.coach.step(s,now+1000));assert.equal(p.phase,'travel');assert.equal(p.routeCeiling,37);
    const rows=H.preparationRoutes(s,e.settings,p,e.metrics,now+1000);assert.ok(rows.length);assert.ok(rows.every(row=>row.members.every(id=>H.DATA.chapters[id].ace<=37)));
    await preparationTick(e,()=>e.coach.step(s,now+2000));assert.equal(p.phase,'train');assert.ok(p.route.id<17);e.stop();
});

test('completed mainline and resource goals are never delayed by an unnecessary live-map preflight',t=>{
    const s=johtoScreenshot(),{e}=runtime(t,s,{mode:'progress',autoPrepare:true,progressUntil:17});e.read();assert.equal(e.coach.adventure(s),null);
    e.settings={...e.settings,mode:'item',itemQuantity:1};e.startItems=0;s.stats.itemIn={[e.settings.itemId]:1};e.target={...H.DATA.chapters[18],key:'18',members:[18]};assert.equal(e.coach.adventure(s),null);e.stop();
});

test('preparation respects regional caps and a configurable trigger gap',()=>{
    const s=state();s.adv.unlocked=0;s.mons[0].level=5;const context=H.battleContext(s,'zone',{id:145}),cfg={...H.DEFAULTS,autoTeam:false,optimizeRaid:false};
    let p=H.preparationPlan(s,cfg,context);assert.equal(p.targets[0].goal,20);assert.equal(p.capLimited,true);assert.equal(p.needed,true);
    s.mons[0].level=20;assert.equal(H.preparationPlan(s,cfg,context).needed,false);
    s.adv.unlocked=65;s.mons[0].level=98;assert.equal(H.preparationPlan(s,cfg,context).needed,false);assert.equal(H.preparationPlan(s,{...cfg,prepareGap:0},context).needed,true);
});

test('preparation selects stable training routes, supports the first frontier and honors region restrictions',()=>{
    const s=state();s.mons[0].level=30;s.adv.unlocked=8;const prep={uids:['a'],context:{reg:'kanto'},avoid:{}};let rows=H.preparationRoutes(s,H.DEFAULTS,prep);
    assert.ok(rows.length);assert.ok(rows.every(row=>row.members.every(id=>H.DATA.chapters[id].ace<=30)));assert.ok(rows.every(row=>row.reg==='kanto'));
    s.adv.unlocked=0;s.mons[0].level=5;rows=H.preparationRoutes(s,H.DEFAULTS,prep);assert.equal(rows[0].id,0);assert.equal(rows[0].fallback,true);
    s.adv.chapter=14;s.adv.unlocked=14;s.travel.to=['johto'];s.link={to:'johto',side:'to'};s.mons.push({uid:'native',id:158,level:5,reg:'johto'});s.team=['native'];const context=H.battleContext(s,'progress',{row:{...H.DATA.chapters[14],members:[14]}});
    const plan=H.preparationPlan(s,H.DEFAULTS,context);assert.ok(plan.members.every(m=>m.uid==='native'));assert.ok(!plan.uids.includes('a'));
    const tower=H.battleContext(s,'tower',{floor:20});assert.equal(tower.reg,'kanto');assert.equal(tower.level,81);
});

test('preparation detours a mainline goal without changing its queue item or resource budget',t=>{
    const s=state();s.mons[0].level=5;s.adv.unlocked=1;const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,autoTeam:false});e.read();e.queue=H.normalizeJobs([{settings:e.settings}]);e.queueRunning=true;e.queue[0].status='running';e.budget.spent=100;e.budget.used=2;e.progress(s,Date.now());
    assert.ok(e.preparation);assert.equal(e.settings.mode,'progress');assert.equal(e.queueIndex,0);assert.equal(e.queue[0].status,'running');assert.equal(e.driver.pendingMap,null);assert.equal(e.budget.spent,100);assert.equal(e.budget.used,2);assert.equal(e.preparation.context.id,1);
});

test('preparation resumes after reload and finishes at the saved achievable level',t=>{
    const s=state();s.mons[0].level=5;s.adv.unlocked=1;const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,autoTeam:false});e.read();e.progress(s,Date.now());const goal=e.preparation.targets[0].goal;e.budget.used=3;e.suspend();
    const next=new H.Engine(e.storage);next.loadAccount(s);next.schedule=()=>{};next.start(true);assert.equal(next.preparation.targets[0].goal,goal);assert.equal(next.settings.mode,'progress');assert.equal(next.budget.used,3);
    s.mons[0].level=goal;next.coach.step(s,Date.now());assert.equal(next.preparation,null);assert.equal(next.settings.mode,'progress');assert.equal(next.running,true);next.stop();
});

test('manual training waits for a removed learner without re-seating it or hitting the no-XP timeout',t=>{
    const s=state();s.mons=[{uid:'target',id:6,level:10},{uid:'carrier',id:9,level:70}];s.team=['target'];s.adv.unlocked=1;
    const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,autoTeam:false,progressCandy:false});e.read();const now=Date.now();e.progress(s,now);const p=e.preparation;
    Object.assign(p,{phase:'train',route:{...H.DATA.chapters[0],key:'0',members:[0]},lastGrowth:now-6*60000,lastTick:now});s.team=['carrier'];s.road=['carrier'];
    e.coach.step(s,now);assert.equal(e.running,true);assert.equal(p.phase,'train');assert.equal(e.driver.teamTask,null);assert.deepEqual(s.team,['carrier']);assert.match(e.status,/手动.*加入/);assert.ok(p.lastGrowth>=now);e.stop();
});

test('automatic evolution conflict repair trains outstanding targets in legal batches',t=>{
    const s=state();s.adv.unlocked=3;s.mons=[{uid:'first',id:6,level:5},{uid:'second',id:9,level:5}];s.team=['first','second'];
    const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,autoTeam:true,progressCandy:false});e.read();const now=Date.now();e.progress(s,now);const p=e.preparation;
    Object.assign(p,{phase:'train',route:{...H.DATA.chapters[0],key:'0',members:[0]},routeCheck:now});s.mons[0].id=386;s.mons[1].id=38601;s.team=['first'];s.road=['first'];
    e.coach.reconcile(s,p,now);assert.deepEqual(p.uids,['first']);assert.equal(p.targets.length,2);
    s.mons[0].level=p.targets[0].goal;e.coach.reconcile(s,p,now+1000);assert.ok(p.uids.includes('second'));assert.ok(!p.uids.includes('first'));e.stop();
});

function graduatedMainline(t){
    const s=state();s.adv.unlocked=3;s.mons=[20,18,22,24,28,40].map((id,i)=>({uid:'m'+i,id,level:5}));s.team=s.mons.map(m=>m.uid);
    const {e}=runtime(t,s,{mode:'progress',progressUntil:65,autoPrepare:true,autoTeam:true,progressCandy:false});e.read();const now=Date.now();e.progress(s,now);const p=e.preparation;
    for(const target of p.targets)s.mons.find(m=>m.uid===target.uid).level=target.goal;s.team=[...p.uids];s.road=[...p.uids];s.mons.push({uid:'new',id:65,level:5});e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    return{s,e,p,now};
}

test('a new candidate caught during preparation cannot start another detour before the frontier is attempted',async t=>{
    const {s,e,p,now}=graduatedMainline(t);assert.equal(H.preparationPlan(s,e.settings,H.battleContext(s,'progress',{row:{...H.DATA.chapters[3],members:[3]}})).needed,false,'a marginal new low-level candidate no longer forces rebuilding an already trained party');
    e.coach.step(s,now+1000);assert.equal(e.preparation,null);assert.equal(e.coach.ready.key,p.context.key);e.driver.clearLoops=()=>true;await e.step(now+2000);
    assert.equal(e.preparation,null);assert.equal(e.target.id,3,'the next action resumes the actual frontier');e.stop();
});

test('a fresh frontier defeat revokes the preparation pass and permits a new counter plan',t=>{
    const {s,e,p,now}=graduatedMainline(t);e.coach.step(s,now+1000);s.adv.deaths[3]=1;
    assert.equal(e.ensurePrepared(s,H.battleContext(s,'progress',{row:{...H.DATA.chapters[3],members:[3]}}),{},now+2000),true);assert.ok(e.preparation.targets.some(m=>m.uid==='new'));e.stop();
});

test('graduation pass survives reload, and explicit manual control invalidates it',t=>{
    const {s,e,now}=graduatedMainline(t);e.coach.step(s,now+1000);e.suspend();
    const next=new H.Engine(e.storage);next.loadAccount(s);next.schedule=()=>{};next.start(true);assert.ok(next.coach.ready);next.manualInput(now+2000);assert.equal(next.coach.ready,null);next.stop();
});

test('old checkpoints with an unreachable shared-wallet goal release at the live regional cap',t=>{
    const s=state();s.adv.unlocked=21;s.adv.chapter=20;s.travel.to=['johto'];s.mons[0].level=62;s.mons[0].reg='johto';
    const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,autoTeam:false});e.read();e.preparation={mode:'progress',context:H.battleContext(s,'progress',{row:{...H.DATA.chapters[21],members:[21]}}),resume:{},targets:[{uid:'a',id:6,goal:100}],uids:['a'],originalTeam:['a'],phase:'train',phaseAt:Date.now(),lastGrowth:Date.now()-6*60000};
    e.coach.step(s,Date.now());assert.equal(e.preparation,null);assert.equal(e.running,true);assert.equal(e.coach.ready.targets[0].goal,62);e.stop();
});

test('native frontier advancement during training returns to mainline instead of completing the stale plan',t=>{
    const s=state();s.mons[0].level=5;s.adv.unlocked=1;const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,autoTeam:false});e.read();e.progress(s,Date.now());const p=e.preparation;
    p.phase='train';s.adv.unlocked=2;e.coach.step(s,Date.now());assert.equal(e.preparation,null);assert.match(e.status,/原关卡已通过/);e.stop();
});

test('preparation stops when trainees gain no XP, and explicit training cannot recursively prepare itself',t=>{
    const s=state();s.mons[0].level=5;s.adv.unlocked=0;const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,autoTeam:false,prepareIdleMinutes:2});e.read();const now=Date.now();e.progress(s,now);
    Object.assign(e.preparation,{phase:'train',route:H.candidates(s,e.settings)[0],visit:{at:now,deaths:0},routeCheck:now});for(let i=0;i<6&&e.running;i++)e.coach.step(s,now+i*30000);
    assert.equal(e.running,false);assert.match(e.status,/没有目标经验增长/);
    e.running=true;e.preparation=null;e.settings={...e.settings,mode:'train'};assert.equal(e.ensurePrepared(s,H.battleContext(s,'progress',{row:{...H.DATA.chapters[0],members:[0]}})),false);
});

function pendingRoad(t){
    const s=state();s.adv.unlocked=3;s.mons=[{uid:'target',id:6,level:10},{uid:'carrier',id:9,level:70}];s.team=['target'];
    const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,autoTeam:false,progressCandy:false,prepareIdleMinutes:2});e.read();const now=Date.now();e.progress(s,now);const p=e.preparation;
    s.team=[...p.uids];s.road=['carrier'];s.adv.chapter=2;Object.assign(p,{phase:'train',route:{...H.DATA.chapters[2],key:'2',members:[2]},routeCheck:now,lastTick:now,roadWait:{key:JSON.stringify([s.team,s.road]),at:now-121000}});return{s,e,p,now};
}

test('a stalled native road party triggers a bounded map change instead of resetting its wait forever',async t=>{
    const {s,e,p,now}=pendingRoad(t);await preparationTick(e,()=>e.coach.step(s,now));assert.equal(e.running,true);assert.equal(p.phase,'travel');assert.equal(p.roadRepairs,1);assert.ok(p.avoid['2']>now);e.stop();
});

test('repeated native road failure pauses clearly after the recovery limit',t=>{
    const {s,e,p,now}=pendingRoad(t);p.roadRepairs=2;e.coach.step(s,now);assert.equal(e.running,false);assert.match(e.status,/治疗点应用超时/);
});

test('successful native party application clears the road recovery state',t=>{
    const {s,e,p,now}=pendingRoad(t);s.road=[...s.team];p.roadRepairs=2;e.coach.step(s,now);assert.equal(e.running,true);assert.equal(p.roadWait,null);assert.equal(p.roadRepairs,0);e.stop();
});

test('preparation checkpoints preserve a special-battle return action',t=>{
    const s=state();s.mons[0].level=5;s.eventTeams={'raid:kanto':['a']};const {e}=runtime(t,s,{mode:'money',autoPrepare:true,autoTeam:false,optimizeRaid:false});e.read();const now=Date.now();
    assert.equal(e.ensurePrepared(s,H.battleContext(s,'raid',{id:35,reg:'kanto'}),{type:'raid'},now),true);const p=e.preparation;s.mons[0].level=p.targets[0].goal;
    e.coach.step(s,now+1000);assert.equal(e.preparation,null);assert.equal(e.raidProbe,true);assert.equal(e.raidProbeStarted,now+1000);assert.equal(e.settings.mode,'money');
});

test('prepared raids return even with daily priority disabled, survive manual input and enter only once',async t=>{
    const s=state();s.mons[0].level=5;s.eventTeams={'raid:kanto':['a']};const {e,actions}=runtime(t,s,{mode:'legend',autoPrepare:true,autoTeam:false,optimizeRaid:false,raids:false});e.read();const now=Date.now();
    e.ensurePrepared(s,H.battleContext(s,'raid',{id:35,reg:'kanto'}),{type:'raid'},now);const p=e.preparation;s.mons[0].level=p.targets[0].goal;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));e.coach.step(s,now+1000);
    assert.equal(e.raidReturn.boss,35);assert.equal(e.settings.raids,false);
    e.manualInput(now+1000);assert.equal(e.raidProbe,false);e.manual.until=now;e.manualStep(s,now+2000);assert.equal(e.raidProbe,true);
    await e.step(now+3000);assert.equal(actions.filter(a=>a==='raid').length,1,'explicit return runs before the ordinary legend workflow');
    s.adv.event={raid:true,id:35,reg:'kanto',loops:23};e.driver.raid={boss:35,reg:'kanto',started:now};e.storage.setItem('gachamon-save-v1',JSON.stringify(s));await e.step(now+4000);
    assert.equal(actions.filter(a=>a==='raid').length,1,'active raid is observed rather than re-entered');assert.equal(e.raidReturn,null);assert.match(e.status,/23\/150/);e.stop();
});

test('automation metadata covers shop, eggs and wild shiny targets without legendary encounters',()=>{
    assert.ok(H.DATA.automation.shop.length>=28);assert.equal(H.DATA.automation.breed[3].egg,1);assert.equal(H.DATA.automation.breed[132].can,false);
    assert.equal(H.DATA.automation.breed[150].can,false);assert.ok(H.DATA.automation.breed[490].can);
    for(const c of H.DATA.chapters)for(const pool of Object.values(c.shinyPools))for(const[id,best,clear]of pool){assert.ok(!H.MONS.get(id).legend);assert.ok(best>0&&clear>=0&&best>=clear);}
    const s=state(),settings={...H.DEFAULTS,shinyId:25};assert.ok(H.shinyRanking(s,settings).length);s.dex[25]={caught:1};assert.equal(H.shinyOwned(s,25),false);s.dex[25].shiny=1;assert.equal(H.shinyOwned(s,25),true);
});

test('pension plan protects current and queued road parties and prefers shiny eligible parents',()=>{
    const s=state();s.mons.push({uid:'d',id:132,level:20},{uid:'p',id:1,level:80},{uid:'sp',id:3,level:50,shiny:true});
    let p=H.pensionPlan(s,1);assert.equal(p.ditto.uid,'d');assert.equal(p.parents[0].uid,'sp');
    assert.deepEqual(H.pensionPlan(s,1,true).desired.map(mon=>mon.uid),['d','sp']);
    s.road=['d'];assert.match(H.pensionPlan(s,1).missing,/百变怪/);s.road=[];s.pension.mons=[{mon:s.mons.pop()}];assert.equal(H.pensionPlan(s,1).parents[0].uid,'sp');
    s.pension.mons[0].mon.noEgg=true;assert.equal(H.pensionPlan(s,1).parents[0].uid,'p');s.mons.find(m=>m.uid==='p').noEgg=true;assert.equal(H.pensionPlan(s,1).parents.length,0);
    assert.equal(H.pensionPlan(s,150).desired.length,0);
});

test('native displayed prices parse grouped integers, abbreviated prices and reject absent values',()=>{
    for(const[text,value]of [['100,000 ₽',100000],['1\u202f234\u00a0567 ₽',1234567],['1.5M ₽',1500000],['2万',20000],['500k',500000],['2.000 ₽',2000]])assert.equal(H.parsePrice(text),value,text);
    assert.equal(H.parsePrice('购买'),null);assert.equal(H.parsePrice(''),null);
});

test('budget enforces zero-spend, reserve, global item count and shared daily spending',t=>{
    const {e}=runtime(t,state({money:200000}),{spendBudget:150000,dailySpendBudget:120000,moneyReserve:50000,useBudget:2});
    assert.equal(e.budget.check({money:200000},100000),null);e.budget.charge(100000,1);
    assert.match(e.budget.check({money:200000},30000),/每日/);assert.match(e.budget.check({money:60000},20000),/保留/);assert.match(e.budget.check({money:200000},0,2),/道具/);
    const budget=new H.Budget(e);assert.match(budget.check({money:200000},30000),/每日/);e.settings.spendBudget=0;assert.match(budget.check({money:200000},1),/预算/);assert.match(budget.check({money:200000},null),/价格/);
});

test('queue advances finite tasks while retaining spending and failure pauses the queue',t=>{
    const {e}=runtime(t,state(),{mode:'money'});e.read();e.queue=H.normalizeJobs([{settings:{mode:'money',moneyTarget:3000}},{settings:{mode:'breed',breedId:1}},{settings:{mode:'tower'}}]);e.queueRunning=true;e.queue[0].status='running';e.budget.spent=17;
    e.completeTask('金币达标');assert.equal(e.queue[0].status,'done');assert.equal(e.queueIndex,1);assert.equal(e.settings.mode,'breed');assert.equal(e.budget.spent,17);assert.equal(e.running,true);
    e.failTask('缺少百变怪');assert.equal(e.queue[1].status,'failed');assert.equal(e.queue[2].status,'pending');assert.equal(e.running,false);assert.equal(JSON.parse(e.storage.getItem('pokecatch-helper:v1:fixture')).resume,null);
});

test('a second roaming job starts its own search clock and does not inherit a previous weather window',t=>{
    const s=state(),{e}=runtime(t,s,{mode:'roam',roamId:243});
    e.queue=H.normalizeJobs([{settings:e.settings},{settings:{mode:'roam',roamId:244,roamMinutes:5}}]);
    e.queueRunning=true;e.queueIndex=0;
    e.roamStarted=Date.now()-600000;e.roamRestartAt=Date.now();e.weatherWindow={at:Date.now()+900000};
    e.action='上一目标的地图操作';e.completeTask('首个游荡目标已捕获');
    assert.equal(e.settings.roamId,244);assert.equal(e.running,true);
    assert.equal(e.roamStarted,null);assert.equal(e.roamRestartAt,0);
    assert.equal(e.weatherWindow,null);assert.equal(e.action,'');e.stop();
});

test('restoring a later job keeps the live queue baseline and restores its item counter',t=>{
    const s=state(),{e}=runtime(t,s,{mode:'money'});
    const runStarted=e.started;e.oldLoops=['L'];e.budget.spent=75;
    e.queue=H.normalizeJobs([{settings:e.settings},{settings:{mode:'item'},progress:{
        session:{started:100,startMoney:5,oldLoops:[4],startItems:12},budget:{spent:50}
    }}]);
    e.queueRunning=true;e.completeTask('金币已达标');
    assert.equal(e.started,runStarted);assert.equal(e.startMoney,s.money);assert.deepEqual(e.oldLoops,['L']);
    assert.equal(e.startItems,12);assert.equal(e.budget.spent,75);e.stop();
});

test('a confirmed goal settles before the inactivity timeout and emits one completion log',async t=>{
    const s=state(),{e}=runtime(t,s,{mode:'money',moneyTarget:s.money});
    e.progressSignature=JSON.stringify([0,0,0,0,0,0,null,null,null]);
    e.lastProgress=Date.now()-240000;
    await e.step();
    assert.equal(e.running,false);assert.equal(e.status,'达到目标金币');
    assert.equal(e.logs.filter(row=>row.text===e.status).length,1);
});

test('refresh checkpoint resumes goal counters and budget; explicit stop cancels restoration',t=>{
    const {e}=runtime(t,state(),{mode:'breed'});e.read();e.oldLoops=[0];e.startItems=7;e.automation.begin(e.state);e.automation.state.hatched=2;e.budget.spent=250;e.budget.used=1;e.suspend();
    const next=new H.Engine(e.storage);next.loadAccount(e.state);next.schedule=()=>{};next.start(true);
    assert.equal(next.running,true);assert.equal(next.settings.mode,'breed');assert.equal(next.automation.state.hatched,2);assert.equal(next.budget.spent,250);assert.equal(next.budget.used,1);assert.deepEqual(next.oldLoops,[0]);assert.equal(next.startItems,7);
    const save=e.storage.getItem('gachamon-save-v1');next.stop();const third=new H.Engine(e.storage);third.loadAccount(e.state);assert.equal(third.checkpoint,null);assert.equal(e.storage.getItem('gachamon-save-v1'),save);
});

test('independent workflows do not treat long egg/dispatch waits as stalled adventure',async t=>{
    const s=state(),{e}=runtime(t,s,{mode:'breed'});e.automation.step=()=>e.automation.wait('等待产蛋');e.lastProgress=Date.now()-7200000;
    await e.step();assert.equal(e.running,true);assert.match(e.status,/产蛋/);assert.equal(e.driver.pendingMap,undefined);
});

test('world attack goal survives day rollover and does not equate daily count with edition',t=>{
    const s=state({wb:{ed:5,day:0,n:1,caught:1}}),{e}=runtime(t,s,{mode:'world',worldActions:3,worldCapture:false});e.automation.begin(s);
    e.automation.world(s,Date.now());assert.equal(e.running,true);s.wb.n=2;e.automation.world(s,Date.now());assert.equal(e.automation.state.worldDone,1);
    s.wb.day=1;s.wb.n=1;e.automation.world(s,Date.now());assert.equal(e.automation.state.worldDone,2);s.wb.n=2;e.automation.world(s,Date.now());assert.equal(e.running,false);assert.match(e.status,/攻击次数/);
});

test('ordinary shiny already owned finishes and unrelated money goals do not stop resource jobs',async t=>{
    const s=state({dex:{25:{shiny:1}}}),{e}=runtime(t,s,{mode:'shiny',shinyId:25,raids:false});await e.step();assert.equal(e.running,false);assert.match(e.status,/异色/);
    e.settings={...H.DEFAULTS,mode:'resource',moneyTarget:1};e.running=true;e.automation.step=()=>{e.status='资源流程';};await e.step();assert.equal(e.running,true);assert.equal(e.status,'资源流程');
});

test('progress queue goal completes at a cleared chapter and does not depart after finishing',t=>{
    const s=state(),{e,actions}=runtime(t,s,{mode:'progress',progressUntil:0,autoTravel:true});e.progress(s,Date.now());assert.equal(e.running,false);assert.match(e.status,/主线目标/);assert.equal(actions.length,0);
});

test('failed queue item resumes its original acquisition baseline and charged budget',t=>{
    const s=state(),{e}=runtime(t,s,{mode:'resource',resourceQuantity:3,spendBudget:100});e.read();e.queue=H.normalizeJobs([{settings:e.settings},{settings:{mode:'money'}}]);e.queueRunning=true;e.queue[0].status='running';e.automation.begin(s);e.automation.state.resourceIn=7;e.budget.spent=100;e.failTask('预算不足');
    const next=new H.Engine(e.storage);next.loadAccount(s);next.schedule=()=>{};next.queue[0].settings.spendBudget=150;next.startQueue();
    assert.equal(next.queueIndex,0);assert.equal(next.settings.mode,'resource');assert.equal(next.automation.state.resourceIn,7);assert.equal(next.budget.spent,100);assert.equal(next.settings.spendBudget,150);assert.equal(next.queue[1].status,'pending');next.stop();
    delete next.queue[0].progress;next.persist(false);assert.equal(JSON.parse(next.storage.getItem('pokecatch-helper:v1:fixture')).queue[0].progress,undefined);
});

test('tower checks this week rather than an expired high score',t=>{
    const s=state({tower:{best:{week:'2000-01-03',floor:100}}}),{e}=runtime(t,s,{mode:'tower',towerFloor:50});const now=Date.parse('2026-11-13T12:00:00Z');e.automation.tower(s,now);assert.equal(e.running,true);
    s.tower.best.week='2026-11-09';e.automation.tower(s,now);assert.equal(e.running,false);assert.match(e.status,/楼层/);
});

test('audit: underground cache follows daily used members and excludes candy factory participants',()=>{
    const now=Date.parse('2026-11-13T12:00:00Z'),s=state();s.under={day:H.parisDay(now),used:{}};s.mons.push({uid:'b',id:9,level:70},{uid:'c',id:3,level:70});
    const key=H.undergroundTeamKey(s,0,now);assert.equal(H.undergroundMembers(s,now).length,3);s.under.used.a=1;assert.notEqual(H.undergroundTeamKey(s,0,now),key);assert.equal(H.undergroundMembers(s,now).length,2);
    s.candy={run:{mons:[{src:'b'}]}};assert.deepEqual(H.undergroundMembers(s,now).map(m=>m.uid),['c']);assert.equal(H.undergroundMembers(s,now+86400000).length,2);
});

test('audit: malformed daily ledgers cannot crash budget checks and decimal comma prices work',t=>{
    const {e}=runtime(t,state({money:10000000}),{spendBudget:10000000,dailySpendBudget:200});const key='pokecatch-helper:v1:budget:fixture:'+H.parisDay();
    e.storage.setItem(key,'null');assert.match(e.budget.check({money:10000000},100),/消费记录/);assert.throws(()=>e.budget.charge(100),/消费记录/);e.storage.setItem(key,'{"spent":"150"}');assert.match(e.budget.check({money:10000000},100),/每日/);
    e.storage.setItem(key,'{"spent":-200}');assert.equal(e.budget.day().invalid,true);assert.equal(H.parsePrice('1,5M ₽'),1500000);assert.equal(H.parsePrice('1,500k ₽'),1500000);
});

test('audit: stopping a resource queue preserves the owned member card for an explicit retry',t=>{
    const s=state(),{e}=runtime(t,s,{mode:'resource'});e.read();e.queue=H.normalizeJobs([{settings:e.settings}]);e.queueRunning=true;e.queue[0].status='running';e.automation.own('mon','.mon-modal',{uid:'a'});e.budget.used=2;e.stop();
    const saved=JSON.parse(e.storage.getItem('pokecatch-helper:v1:fixture'));assert.equal(saved.resume,null);assert.equal(saved.queue[0].progress.flowOwner.kind,'mon');
    const next=new H.Engine(e.storage);next.loadAccount(s);next.schedule=()=>{};next.startQueue();assert.equal(next.automation.owner.kind,'mon');assert.equal(next.automation.owner.uid,'a');assert.equal(next.budget.used,2);next.stop();
});

test('audit: automatic queue advancement restores a reordered paused resource owner and budget',t=>{
    const s=state(),{e}=runtime(t,s,{mode:'money'});e.read();
    const progress={session:{startItems:7},flow:{resourceOut:3},budget:{spent:50,used:2},flowOwner:{kind:'mon',selector:'.mon-modal',uid:'a'}};
    e.queue=H.normalizeJobs([{settings:e.settings,status:'running'},{settings:{mode:'resource'},progress,status:'pending'}]);e.queueRunning=true;e.queueIndex=0;e.budget.spent=75;e.budget.used=4;
    e.completeTask('first complete');assert.equal(e.queueIndex,1);assert.equal(e.automation.owner.kind,'mon');assert.equal(e.automation.owner.uid,'a');assert.equal(e.automation.state.resourceOut,3);assert.equal(e.budget.spent,75);assert.equal(e.budget.used,4);
    e.stop();
});

test('audit: automatic queue advancement restores a paused raid return and preparation readiness',t=>{
    const s=state(),{e}=runtime(t,s,{mode:'money'});e.read();
    const progress={preparationReady:{key:'map:kanto:0',deaths:0,targets:[{uid:'a',goal:70}]},raidProbe:true,raidReturn:{reg:'kanto',boss:35,date:H.parisDay()},activity:{raid:{reg:'kanto',boss:35,date:H.parisDay(),started:Date.now()}}};
    e.queue=H.normalizeJobs([{settings:e.settings,status:'running'},{settings:e.settings,progress}]);e.queueRunning=true;e.completeTask('first complete');
    assert.equal(e.raidProbe,true);assert.equal(e.raidReturn.boss,35);assert.equal(e.driver.raid.boss,35);assert.ok(e.raidProbeStarted>0);assert.equal(e.coach.ready.targets[0].uid,'a');e.stop();
});

test('audit: automatic queue advancement restores an owned special-team picker',t=>{
    const s=state(),{e}=runtime(t,s,{mode:'money'});e.read();e.queue=H.normalizeJobs([{settings:e.settings,status:'running'},{settings:{mode:'underground'},progress:{specialDialog:{type:'team',key:'under:paused',optimized:true}}}]);e.queueRunning=true;
    e.completeTask('first complete');assert.equal(e.driver.ownedDialog.type,'team');assert.equal(e.driver.ownedDialog.key,'under:paused');assert.equal(e.driver.ownedDialog.optimized,true);assert.ok(e.driver.ownedDialog.started>0);e.stop();
});

test('audit: mainline chooses its region before using a shared league selector',t=>{
    const s=state();s.adv.chapter=25;s.adv.unlocked=25;s.adv.loops=['0'];s.travel.to=['johto'];
    const {e}=runtime(t,s,{mode:'progress',progressUntil:29,autoPrepare:false});const actions=[];
    const reg={classList:{contains:()=>false}},wrongLeague={classList:{contains:()=>true}},go={};
    global.document.querySelector=selector=>selector.includes('.rg.open')?reg:selector.includes('.mp-row')?wrongLeague:selector.includes('.mp-go')?go:null;
    e.driver.clearLoops=()=>true;e.driver.click=(el)=>{actions.push(el);return true;};e.progress(s,Date.now());
    assert.deepEqual(actions,[reg],'the other region league must never be selected or launched');e.stop();
});

test('audit: a paused special-team picker retains its owned dialog and manual edits invalidate recommendations',t=>{
    const s=state(),{e}=runtime(t,s,{mode:'underground'});e.read();e.queue=H.normalizeJobs([{settings:e.settings}]);e.queueRunning=true;e.queue[0].status='running';e.driver.ownedDialog={type:'team',key:'under:test',optimized:false};e.stop();
    const next=new H.Engine(e.storage);next.loadAccount(s);next.schedule=()=>{};next.startQueue();assert.equal(next.driver.ownedDialog.type,'team');assert.equal(next.driver.ownedDialog.key,'under:test');next.driver.recent.set('old-team',Date.now());next.manualInput();assert.equal(next.driver.recent.size,0);next.stop();
});

test('audit: refreshing during loop restoration cannot restart a task that the user stopped',t=>{
    const {e}=runtime(t,state());e.read();e.restoring=true;e.suspend();assert.equal(JSON.parse(e.storage.getItem('pokecatch-helper:v1:fixture')).resume,null);
});

test('audit: a dialog closed while backgrounded clears ownership instead of failing on stale timeout',t=>{
    const s=state(),{e}=runtime(t,s),driver=new H.DOMDriver(e);driver.ownedDialog={type:'team',started:Date.now()-300000};assert.equal(driver.dialog(s),false);assert.equal(e.running,true);assert.equal(driver.ownedDialog,null);
});

test('audit: refresh preserves an activity timer independently of a much older task session',t=>{
    const now=Date.now(),s=state();s.adv.event={raid:true,reg:'kanto',id:35,loops:3,date:H.parisDay()};
    const {e}=runtime(t,s,{mode:'money'});e.read();e.started=now-3*3600000;e.driver.raid={reg:'kanto',boss:35,date:H.parisDay(),started:now-60000};e.suspend();
    const next=new H.Engine(e.storage);next.loadAccount(s);next.schedule=()=>{};next.start(true);assert.equal(next.driver.raid.started,now-60000);assert.equal(next.started,now-3*3600000);next.stop();
    s.adv.event=null;s.adv.zone={id:145,foe:145};e.storage.setItem('gachamon-save-v1',JSON.stringify(s));e.settings={...e.settings,mode:'legend',legendId:145};e.running=true;e.zoneId=145;e.zoneStarted=now-120000;e.suspend();
    const zone=new H.Engine(e.storage);zone.loadAccount(s);zone.schedule=()=>{};zone.start(true);assert.equal(zone.zoneStarted,now-120000);zone.stop();
});

test('audit: active fights and manual control receive periodic refresh checkpoints',async t=>{
    const s=state();s.adv.event={raid:true,reg:'kanto',id:35,loops:3};const {e}=runtime(t,s,{mode:'money'});const now=Date.now();e.driver.raid={reg:'kanto',boss:35,started:now};await e.step(now);
    let saved=JSON.parse(e.storage.getItem('pokecatch-helper:v1:fixture'));assert.equal(saved.resume.activity.raid.boss,35);
    e.manualInput(now);await e.step(now+6000);saved=JSON.parse(e.storage.getItem('pokecatch-helper:v1:fixture'));assert.ok(saved.resume.manual);assert.equal(saved.resume.manual.until,e.manual.until);
});

test('audit: money goal cannot block the receipt of an active raid before switching queue items',async t=>{
    const s=state();s.adv.event={raid:true,reg:'kanto',id:35};const {e}=runtime(t,s,{mode:'money',moneyTarget:100});e.read();e.queue=H.normalizeJobs([{settings:e.settings},{settings:{mode:'breed'}}]);e.queueRunning=true;e.queue[0].status='running';e.driver.raid={reg:'kanto',boss:35,started:Date.now()};let receipts=0;e.driver.receipt=()=>{receipts++;return true;};
    await e.step();assert.equal(receipts,1);assert.equal(e.settings.mode,'money');e.driver.receipt=()=>false;s.adv.event=null;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));await e.step();assert.equal(e.queueIndex,1);assert.equal(e.settings.mode,'breed');
});

test('audit: an already owned shiny finishes before daily raids or team optimization',async t=>{
    const s=state({dex:{25:{shiny:1}}});s.adv.badges=['Maître'];const {e,actions}=runtime(t,s,{mode:'shiny',shinyId:25,raids:true,autoTeam:true});e.nextRaid=0;await e.step();assert.equal(e.running,false);assert.equal(e.raidProbe,false);assert.equal(actions.length,0);
});

test('audit: replacing a full-team trainee cannot turn a partial training task into success',async t=>{
    const s=state();s.mons[0].level=10;s.mons.push({uid:'new',id:9,level:100});s.team=['new'];const {e}=runtime(t,s,{mode:'train',trainUid:'team',trainLevel:90});e.trainProtected=['a'];await e.step();assert.equal(e.running,false);assert.match(e.status,/不在冒险队伍/);
    const status=H.trainingStatus(s,e.settings,['a']);assert.equal(status.missing,true);assert.equal(status.complete,false);
});

test('audit: another chapter loop cannot satisfy the interrupted frontier goal',t=>{
    const s=state();s.adv.unlocked=65;s.adv.chapter=0;s.adv.runs=11;const {e}=runtime(t,s,{mode:'progress',progressUntil:65});e.progress(s,Date.now());assert.equal(e.running,true);
    s.adv.chapter=65;e.progress(s,Date.now());assert.equal(e.running,true);s.adv.runs=12;e.progress(s,Date.now());assert.equal(e.running,true);s.adv.unlocked=66;e.progress(s,Date.now());assert.equal(e.running,false);assert.match(e.status,/主线目标章节已完成/);
});

test('audit: background battle updates cannot keep an unknown dialog waiting forever',async t=>{
    const {e}=runtime(t,state(),{mode:'money'}),modal={isConnected:true,hidden:false,closest:()=>null,getClientRects:()=>[{}]};const now=Date.now();
    const before=global.getComputedStyle;global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});t.after(()=>{if(before===undefined)delete global.getComputedStyle;else global.getComputedStyle=before;});global.document.querySelector=selector=>selector==='#modal-root.open'?modal:null;
    await e.step(now);e.progressSignature='force native progress';await e.step(now+121000);assert.equal(e.running,false);assert.match(e.status,/弹窗等待超时/);
});

test('audit: a failed view render cannot silently cancel the engine scheduler',async t=>{
    const {e}=runtime(t,state()),callbacks=[];t.mock.method(global,'setTimeout',fn=>{callbacks.push(fn);return 1;});t.mock.method(global,'clearTimeout',()=>{});e.step=async()=>{};e.onChange=()=>{throw Error('fixture render');};e.schedule(1);await callbacks.shift()();assert.equal(e.running,true);assert.equal(callbacks.length,1);assert.match(e.logs[0].text,/面板刷新失败/);e.stop();
});

test('manual handoff keeps session goals and yields until the most recent input becomes idle', async t => {
    const s=state(),{e,actions}=runtime(t,s,{mode:'money',raids:false,resumeSeconds:15}),now=Date.now();
    e.read();e.oldLoops=[0,3];e.startItems=12;e.startXp=321;e.target=H.candidates(s,e.settings)[0];e.visit={started:now};
    e.driver.pendingMap={row:e.target};e.driver.ownedDialog={type:'team'};e.telemetry.sample={old:true};const began=e.started;
    const originalSave=e.storage.getItem('gachamon-save-v1');
    e.manualInput(now);assert.ok(e.manual);assert.equal(e.running,true);assert.equal(e.target,null);assert.equal(e.driver.pendingMap,null);assert.equal(e.driver.ownedDialog,null);assert.equal(e.telemetry.sample,null);
    e.manualInput(now+10000);await e.step(now+16000);assert.ok(e.manual);assert.equal(actions.length,0);
    await e.step(now+26000);assert.equal(e.manual,null);assert.equal(e.running,true);assert.ok(e.driver.pendingMap);
    assert.equal(e.started,began);assert.equal(e.startItems,12);assert.equal(e.startXp,321);assert.deepEqual(e.oldLoops,[0,3]);
    assert.equal(e.storage.getItem('gachamon-save-v1'),originalSave);
});

test('manual activity and focused input keep control even after a long idle period', async t => {
    const s=state(),{e,actions}=runtime(t,s,{mode:'money',raids:false}),now=Date.now();e.read();e.manualInput(now);
    s.adv.tower={floor:1};e.storage.setItem('gachamon-save-v1',JSON.stringify(s));await e.step(now+600000);
    assert.ok(e.manual);assert.equal(e.running,true);assert.match(e.status,/手动活动/);assert.equal(actions.length,0);
    s.adv.tower=null;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));e.gameInputFocused=()=>true;await e.step(now+601000);
    assert.ok(e.manual);assert.match(e.status,/输入框/);assert.equal(actions.length,0);
    e.gameInputFocused=()=>false;await e.step(now+602000);assert.equal(e.manual,null);assert.ok(e.driver.pendingMap);
});

test('a manually opened raid waits for completion rather than adopting or leaving it', async t => {
    const s=state(),{e,actions}=runtime(t,s,{mode:'money',raids:false}),now=Date.now();e.read();e.manualInput(now);
    s.adv.event={raid:true,reg:'kanto',id:35,date:'2026-11-13'};e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    await e.step(now+16000);assert.ok(e.manual);assert.match(e.status,/手动活动/);assert.equal(actions.length,0);
    s.adv.event=null;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));await e.step(now+17000);
    assert.equal(e.manual,null);assert.equal(e.running,true);assert.equal(e.driver.raid,null);
});

test('manual interruption resumes an already owned raid without resetting its attempt count', async t => {
    const s=state();s.adv.event={raid:true,reg:'kanto',id:35,date:'2026-11-13',loops:23};
    const {e,actions}=runtime(t,s,{mode:'money',raids:false}),now=Date.now();e.read();
    const raid={reg:'kanto',boss:35,started:now};e.driver.raid=raid;e.manualInput(now);await e.step(now+16000);
    assert.equal(e.manual,null);assert.equal(e.driver.raid,raid);assert.match(e.status,/23\/150/);assert.equal(s.adv.event.loops,23);assert.deepEqual(actions,['nav']);
});

test('explicit Resume adopts a raid opened during manual control and returns to the original money goal',async t=>{
    const s=state(),{e,actions}=runtime(t,s,{mode:'money',raids:false}),now=Date.now();
    e.schedule=()=>{};e.read();e.manualInput(now);e.budget.spent=75;e.budget.used=2;
    s.adv.event={raid:true,reg:'kanto',id:14,date:H.parisDay(),loops:23};e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    await e.step(now+16000);assert.ok(e.manual);assert.equal(actions.length,0,'idle resume still yields to a manually opened activity');
    const original=e.storage.getItem('gachamon-save-v1'),began=e.started;
    e.resumeManual(now+17000);await e.step(now+18000);
    assert.equal(e.manual,null);assert.equal(e.driver.raid.boss,14);assert.equal(e.driver.raid.started,now+17000);
    assert.match(e.status,/团体战进行中.*23\/150/);assert.deepEqual(actions,['nav']);
    assert.equal(e.storage.getItem('gachamon-save-v1'),original);assert.equal(e.budget.spent,75);assert.equal(e.budget.used,2);assert.equal(e.started,began);
    s.adv.event=null;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));await e.step(now+19000);
    assert.equal(e.running,true);assert.equal(e.settings.mode,'money');assert.equal(e.driver.raid,null);assert.ok(e.driver.pendingMap);e.stop();
});

test('explicit raid resume clears stale held input and preserves the owned raid time limit',async t=>{
    const s=state();s.adv.event={raid:true,reg:'kanto',id:35,loops:23};
    const {e}=runtime(t,s,{raids:false}),now=Date.now();e.read();e.schedule=()=>{};
    e.driver.raid={reg:'kanto',boss:35,date:H.parisDay(),started:now-60000};e.manualInput(now);e.inputHeld=true;
    e.resumeManual(now+1000);assert.equal(e.manual,null);assert.equal(e.inputHeld,false);assert.equal(e.driver.raid.started,now-60000);
    await e.step(now+2000);assert.equal(e.manual,null);assert.match(e.status,/团体战进行中.*23\/150/);
    assert.equal(e.driver.raid.started,now-60000);e.stop();
});

test('manual raid identity tolerates legacy missing date or region while detecting a new target',async t=>{
    const s=state();s.adv.event={raid:true,id:35,loops:23};const {e}=runtime(t,s,{raids:false}),now=Date.now();
    e.read();e.driver.raid={reg:'kanto',boss:35,started:now};e.manualInput(now);
    e.manual.raid=JSON.stringify([null,35,null]);s.adv.event.date=H.parisDay();s.adv.event.reg='kanto';e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    await e.step(now+16000);assert.equal(e.manual,null);assert.match(e.status,/23\/150/);
    e.manualInput(now+17000);s.adv.event.id=14;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));await e.step(now+33000);
    assert.ok(e.manual);assert.match(e.status,/手动活动/);e.stop();
});

test('raid adoption suspends mainline preparation, survives reload and restores it without stale UI deadlines',async t=>{
    const s=state();s.mons[0].level=5;s.adv.unlocked=3;
    const {e}=runtime(t,s,{mode:'progress',autoPrepare:true,progressCandy:false,raids:false}),now=Date.now();e.read();e.schedule=()=>{};
    e.progress(s,now);const prep=e.preparation;assert.ok(prep);prep.candyAt=now;prep.candyTx={kind:'use',at:now};prep.roadWait={key:'a',at:now};
    e.manualInput(now);s.adv.event={raid:true,reg:'kanto',id:14,date:H.parisDay(),loops:23};e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    e.resumeManual(now+1000);assert.equal(e.preparation,null);assert.equal(e.raidPreparation,prep);
    e.budget.used=2;e.suspend();
    const next=new H.Engine(e.storage);next.loadAccount(s);next.schedule=()=>{};next.start(true);
    assert.equal(next.running,true,next.status);assert.equal(next.preparation,null);assert.deepEqual(next.raidPreparation.targets,prep.targets);assert.equal(next.budget.used,2);
    s.adv.event=null;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    let restored;next.ensurePrepared=()=>false;next.coach.step=()=>{restored=next.preparation;};await next.step(now+400000);
    assert.ok(restored);assert.equal(restored.context.kind,'progress');assert.equal(restored.phaseAt,now+400000);assert.equal(restored.lastGrowth,now+400000);
    assert.equal(restored.candyAt,now+400000);assert.equal(restored.candyTx.at,now+400000);assert.equal(restored.roadWait.at,now+400000);
    assert.equal(next.raidPreparation,null);assert.equal(next.settings.mode,'progress');assert.equal(next.budget.used,2);assert.equal(next.driver.raid,null);next.stop();
});

test('adopted raids take precedence over an independent workflow and resume that workflow after completion',async t=>{
    const s=state(),{e,actions}=runtime(t,s,{mode:'breed',raids:false}),now=Date.now();e.read();e.schedule=()=>{};e.manualInput(now);
    s.adv.event={raid:true,id:14,loops:23};e.storage.setItem('gachamon-save-v1',JSON.stringify(s));e.resumeManual(now+1000);
    let flow=0;e.automation.step=()=>{flow++;};await e.step(now+2000);
    assert.equal(flow,0);assert.match(e.status,/团体战进行中/);assert.deepEqual(actions,['nav']);
    s.adv.event=null;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    e.progressSignature=JSON.stringify([s.adv.chapter,s.adv.node,s.adv.runs,s.stats.battles,s.stats.wins,s.stats.caught,null,null,null]);
    e.lastProgress=now-200000;await e.step(now+4000);assert.equal(e.running,true);assert.equal(flow,1,'legitimate long independent waits must bypass the adventure watchdog');e.stop();
});

test('refresh preserves a previously adopted raid during an independent task but rejects an unrelated raid',t=>{
    const s=state(),{e}=runtime(t,s,{mode:'breed',raids:false}),now=Date.now();e.read();e.schedule=()=>{};e.manualInput(now);
    s.adv.event={raid:true,reg:'kanto',id:14,date:H.parisDay(),loops:23};e.storage.setItem('gachamon-save-v1',JSON.stringify(s));e.resumeManual(now+1000);e.suspend();
    const next=new H.Engine(e.storage);next.loadAccount(s);next.schedule=()=>{};next.start(true);
    assert.equal(next.running,true,next.status);assert.equal(next.driver.raid.boss,14);assert.equal(next.settings.mode,'breed');assert.equal(next.manual,null);
    next.suspend();s.adv.event.id=35;e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    const other=new H.Engine(e.storage);other.loadAccount(s);other.schedule=()=>{};other.start(true);assert.equal(other.running,false);assert.match(other.status,/结束当前战斗/);other.stop();
});

test('explicit stop cancels auto resume; stop-only and disabled handoff preferences are respected', async t => {
    const s=state(),{e,actions}=runtime(t,s,{mode:'money',raids:false}),now=Date.now();e.read();e.manualInput(now);e.stop();
    await e.step(now+60000);e.resumeManual(now+60000);assert.equal(e.running,false);assert.equal(e.manual,null);assert.equal(actions.length,0);
    e.running=true;e.settings.manualResume=false;e.manualInput();assert.equal(e.running,false);assert.equal(e.manual,null);
    e.running=true;e.settings.manualPause=false;e.manualInput();assert.equal(e.running,true);assert.equal(e.manual,null);
});

test('held controls, popup and tab ownership prevent automatic resumption', async t => {
    const s=state(),{e,actions}=runtime(t,s,{mode:'money',raids:false}),now=Date.now();e.read();e.manualInput(now);e.inputHeld=true;
    await e.step(now+20000);assert.ok(e.manual);assert.equal(actions.length,0);e.inputHeld=false;
    e.storage.setItem('pokecatch-tab','other-tab');await e.step(now+21000);assert.equal(e.running,false);assert.equal(e.manual,null);
});

test('manual grace period is normalized for old and malformed saved settings', () => {
    assert.equal(H.normalizeSettings({manualPause:true}).manualResume,true);
    assert.equal(H.normalizeSettings({resumeSeconds:-1}).resumeSeconds,3);
    assert.equal(H.normalizeSettings({resumeSeconds:9999}).resumeSeconds,300);
    assert.equal(H.normalizeSettings({resumeSeconds:'bad'}).resumeSeconds,15);
});

test('team metadata covers chapter enemies, learned attacks and native form uniqueness', () => {
    assert.ok(H.DATA.chapters.every(c=>c.foes?.length));
    assert.ok(Object.keys(H.DATA.combat.moves).length>=300);
    assert.ok(H.MONS.get(6).learn.some(([,key])=>H.DATA.combat.moves[key]?.type==='fire'));
    assert.ok(H.DATA.combat.singles[38601]);
    assert.equal(H.normalizeSettings({teamMinutes:0}).teamMinutes,1);
    assert.equal(H.normalizeSettings({teamMinutes:999}).teamMinutes,60);
});

test('team score rows are reused across repeated plans and XP-only changes without altering the result',()=>{
    H.clearTeamCache();const s=state();s.mons.push({uid:'water',id:9,level:70});const a=H.planAdventureTeam(s,H.DEFAULTS),first=H.teamCacheStats();s.mons[0].xp=123;
    const b=H.planAdventureTeam(s,H.DEFAULTS),second=H.teamCacheStats();assert.deepEqual(b,a);assert.equal(second.misses,first.misses);assert.ok(second.hits>first.hits);
    b.uids.length=0;assert.deepEqual(H.planAdventureTeam(s,H.DEFAULTS).uids,a.uids,'returned plans cannot mutate cached rows');
});

test('a level or stat modifier change only recomputes the affected member profile',()=>{
    H.clearTeamCache();const s=state();s.mons.push({uid:'water',id:9,level:70});H.planAdventureTeam(s,H.DEFAULTS);let misses=H.teamCacheStats().misses;
    s.mons[0].level++;H.planAdventureTeam(s,H.DEFAULTS);assert.equal(H.teamCacheStats().misses,misses+1);misses++;
    s.mons[0].statMult=1.15;H.planAdventureTeam(s,H.DEFAULTS);assert.equal(H.teamCacheStats().misses,misses+1);
});

test('cached combat rows respect new opponent weights and match a fresh calculation',()=>{
    H.clearTeamCache();const s=state();s.mons.push({uid:'water',id:9,level:70});const foes=[{id:3,level:70,weight:10},{id:9,level:70,weight:1}],ctx={foes,force:true};
    H.planAdventureTeam(s,H.DEFAULTS,[],ctx);const misses=H.teamCacheStats().misses;foes[0].weight=1;foes[1].weight=10;const cached=H.planAdventureTeam(s,H.DEFAULTS,[],ctx);assert.equal(H.teamCacheStats().misses,misses);
    H.clearTeamCache();assert.deepEqual(H.planAdventureTeam(s,H.DEFAULTS,[],ctx),cached);
});

test('team caches bound opponent contexts and member rows',()=>{
    H.clearTeamCache();const s=state();for(let id=1;id<=6;id++)H.planAdventureTeam(s,H.DEFAULTS,[],{foes:[{id,level:50,weight:1}]});assert.ok(H.teamCacheStats().contexts<=4);
    H.clearTeamCache();s.mons=Array.from({length:1030},(_,i)=>({uid:'m'+i,id:6,level:70,statMult:1+i*.001}));s.team=[];H.planAdventureTeam(s,H.DEFAULTS,[],{foes:[{id:3,level:50,weight:1}]});assert.ok(H.teamCacheStats().rows<=1024);H.clearTeamCache();
});

test('adaptive scheduling slows only known idle waits and retains fast active controls',t=>{
    const {e}=runtime(t,state(),{mode:'breed'}),now=Date.now();e.nextWake=now+3600000;assert.equal(e.nextDelay(now),6000);
    e.nextWake=now+2000;assert.equal(e.nextDelay(now),2000);e.driver.teamTask={};assert.equal(e.nextDelay(now),1200);e.driver.teamTask=null;
    e.settings.mode='money';assert.equal(e.nextDelay(now),1200);global.document.hidden=true;assert.equal(e.nextDelay(now),6000);
});

test('returning from background extends UI deadlines without extending raid or total run limits',t=>{
    const {e}=runtime(t,state()),now=Date.now();e.hiddenAt=now;e.driver.pendingMap={started:now-1000};e.driver.ownedDialog={started:now-2000};e.automation.owner={started:now-3000};e.modalWaitSince=now-1000;
    e.preparation={phaseAt:now,lastGrowth:now,candyAt:now,candyTx:{at:now},roadWait:{at:now}};e.driver.raid={started:now-10000};e.zoneStarted=now-10000;const start=e.started;
    e.resumeUIClock(now+180000);assert.equal(e.driver.pendingMap.started,now+179000);assert.equal(e.automation.owner.started,now+177000);assert.equal(e.preparation.roadWait.at,now+180000);assert.equal(e.hiddenAt,null);
    assert.equal(e.driver.raid.started,now-10000);assert.equal(e.zoneStarted,now-10000);assert.equal(e.started,start);e.stop();
});

test('background checkpoints are throttled while progress is still saved periodically',async t=>{
    const {e}=runtime(t,state()),now=Date.now();global.document.hidden=true;e.lastCheckpoint=now;let writes=0;e.persist=()=>writes++;
    await e.step(now+6000);await e.step(now+12000);assert.equal(writes,0);await e.step(now+16000);assert.equal(writes,1);e.stop();
});

test('manual input wakes an idle scheduler immediately',t=>{
    const {e}=runtime(t,state());e.read();e.sleepDelay=6000;let delay=null;e.schedule=ms=>delay=ms;e.manualInput(Date.now());assert.equal(delay,50);assert.ok(e.manual);e.stop();
});

test('adventure planning replaces weak members with stronger eligible counters and preserves trainees', () => {
    const s=state();s.mons=[10,13,16,19,21,23].map((id,i)=>({uid:'weak'+i,id,level:5}));s.team=s.mons.map(m=>m.uid);
    s.mons.push(...[6,9,3,65,94,149,150].map((id,i)=>({uid:'strong'+i,id,level:90})));
    const plan=H.planAdventureTeam(s,H.DEFAULTS);assert.equal(plan.changed,true);assert.equal(plan.uids.length,6);
    assert.ok(plan.uids.every(uid=>uid.startsWith('strong')));assert.ok(plan.score>plan.currentScore);
    const pinned=H.planAdventureTeam(s,H.DEFAULTS,['weak0']);assert.ok(pinned.uids.includes('weak0'));
    const allPinned=H.planAdventureTeam(s,H.DEFAULTS,s.team);assert.deepEqual(allPinned.uids,s.team);assert.equal(allPinned.changed,false);
});

test('new-region restrictions exclude old-region powerhouses from adventure team plans', () => {
    const s=state();s.adv.chapter=14;s.adv.unlocked=16;s.link={to:'johto',side:'to'};
    s.mons=[{uid:'old',id:150,reg:'kanto',level:100},{uid:'new',id:155,reg:'johto',level:10},{uid:'new2',id:158,reg:'johto',level:10}];s.team=['new'];
    assert.equal(H.teamEligible(s,s.mons[0]),false);assert.equal(H.teamEligible(s,s.mons[1]),true);
    const plan=H.planAdventureTeam(s,H.DEFAULTS);assert.ok(!plan.uids.includes('old'));assert.ok(plan.uids.includes('new2'));
    s.adv.chapter=0;assert.equal(H.teamEligible(s,s.mons[0]),true);assert.equal(H.teamEligible(s,s.mons[1]),false);
});

test('form uniqueness follows native rules; a normal and shiny ordinary species can coexist', () => {
    const s=state();s.team=[];s.mons=[{uid:'base',id:386,level:100},{uid:'form',id:38601,level:100},{uid:'shiny',id:386,level:100,shiny:true},
        {uid:'normal6',id:6,level:100},{uid:'shiny6',id:6,level:100,shiny:true}];
    const plan=H.planAdventureTeam(s,H.DEFAULTS);assert.equal(plan.uids.filter(uid=>['base','form','shiny'].includes(uid)).length,1);
    assert.ok(plan.uids.includes('normal6')&&plan.uids.includes('shiny6'));
});

test('learned move scoring accounts for type matchups, level and rank instead of base stats alone', () => {
    const mon={id:6,level:80},grass={id:3,level:80},water={id:9,level:80};
    const versusGrass=H.expectedDamage(mon,grass,H.effectiveStats(mon),H.effectiveStats(grass));
    const versusWater=H.expectedDamage(mon,water,H.effectiveStats(mon),H.effectiveStats(water));assert.ok(versusGrass>versusWater);
    assert.ok(H.effectiveStats({...mon,rank:2}).atk>H.effectiveStats(mon).atk);
    assert.ok(H.effectiveStats({...mon,shiny:true}).hp>H.effectiveStats(mon).hp);
    assert.ok(H.effectiveStats({...mon,level:5}).atk<H.effectiveStats(mon).atk);
});

test('Ditto evaluates the transformed attacking stats while retaining its own level and rank',()=>{
    const ditto={id:132,level:70,rank:2,shiny:true},foe={id:150,level:70},copy={...ditto,id:150};
    const actual=H.expectedDamage(ditto,foe,H.effectiveStats(ditto),H.effectiveStats(foe));
    assert.equal(actual,H.expectedDamage(copy,foe,H.effectiveStats(copy),H.effectiveStats(foe)));
});

test('damage estimates use native immune fallback and cap overkill for team scoring',()=>{
    const rat={id:19,level:1},ghost={id:92,level:1};assert.ok(H.expectedDamage(rat,ghost,H.effectiveStats(rat),H.effectiveStats(ghost))>0,'typeless Struggle remains usable');
    const mon={id:150,level:100},weak={id:10,level:1},a=H.effectiveStats(mon),b=H.effectiveStats(weak);
    assert.ok(H.expectedDamage(mon,weak,a,b)>b.hp);assert.ok(H.expectedDamage(mon,weak,a,b,{capDamage:true})<=b.hp);
    assert.ok(H.matchupScore(mon,weak)<=1.8+1e-8,'exponential overkill cannot dominate the whole map');
});

test('current wild opponents have limited weight and never contaminate another map plan',()=>{
    const s=state(),before=H.chapterThreats(s,1);s.adv.battle={enemies:[{id:150,level:100}]};
    assert.deepEqual(H.chapterThreats(s,1),before);assert.equal(H.chapterThreats(s).at(-1).weight,.25);
});

test('a weak lead is reordered without changing the roster, then the party remains stable',()=>{
    const s=state();s.autoSwitch=false;s.mons=[{uid:'weak',id:10,level:5},{uid:'strong',id:6,level:90}];s.team=['weak','strong'];
    const plan=H.planAdventureTeam(s,H.DEFAULTS);assert.equal(plan.changed,true);assert.deepEqual(plan.uids,['strong','weak']);assert.match(plan.reason,/出场顺序/);
    s.team=plan.uids;assert.equal(H.planAdventureTeam(s,H.DEFAULTS).changed,false);
});

test('explicit trainees enter a full strong party even when their addition lowers coverage score',()=>{
    const s=state();s.mons=[6,9,3,65,94,149].map((id,i)=>({uid:'strong'+i,id,level:90}));s.team=s.mons.map(m=>m.uid);s.mons.push({uid:'trainee',id:10,level:5});
    const plan=H.planAdventureTeam(s,H.DEFAULTS,['trainee'],{objective:'coverage'});assert.equal(plan.changed,true);assert.ok(plan.uids.includes('trainee'));assert.notEqual(plan.uids[0],'trainee');
    assert.equal(plan.uids.length,6);assert.ok(plan.score<plan.currentScore);
});

test('single-level and stat modifier changes invalidate team recommendations immediately',t=>{
    const s=state(),{e}=runtime(t,s,{autoTeam:true,mode:'money'}),now=Date.now();e.fitTeam(s,now);let key=H.rosterFingerprint(s);
    s.mons[0].level++;assert.notEqual(H.rosterFingerprint(s),key);e.fitTeam(s,now+1000);assert.equal(e.teamCheck.at,now+1000);
    key=H.rosterFingerprint(s);s.mons[0].statMult=1.2;assert.notEqual(H.rosterFingerprint(s),key);e.fitTeam(s,now+2000);assert.equal(e.teamCheck.at,now+2000);
});

test('team recommendation waits for the queued road party to apply before starting another swap',t=>{
    const s=state(),{e}=runtime(t,s,{autoTeam:true,mode:'money'});s.mons.push({uid:'counter',id:150,level:100});s.road=['old'];
    assert.equal(e.fitTeam(s,Date.now()),false);assert.equal(e.driver.teamTask,undefined);s.road=[...s.team];assert.equal(e.fitTeam(s,Date.now()),true);
});

test('replacement refinement improves a concrete team missed by the initial greedy fill',()=>{
    const s=state();s.mons=[441,334,37,13,378,214,72,168,209].map((id,i)=>({uid:'p'+i,id,level:50}));s.team=[];
    const foes=[122,390,202,396].map(id=>({id,level:50,weight:1}));
    const score=team=>foes.reduce((sum,foe)=>sum+Math.log1p(team.map(m=>H.matchupScore(m,foe)).sort((a,b)=>b-a).reduce((v,x,i)=>v+x*[1,.35,.15][i],0)),0)/foes.length;
    const greedy=[214,378,168].map(id=>s.mons.find(m=>m.id===id)),plan=H.planAdventureTeam(s,H.DEFAULTS,[],{foes,size:3,force:true});
    assert.ok(plan.score>score(greedy)+.001);assert.equal(plan.uids.length,3);
});

test('explicit candidate pools still enforce region and six-member limits',()=>{
    const s=state();s.link={to:'johto',side:'to'};s.adv.chapter=14;s.mons=[{uid:'old',id:150,level:100,reg:'kanto'},...Array.from({length:8},(_,i)=>({uid:'j'+i,id:i+1,level:50,reg:'johto'}))];s.team=[];
    const plan=H.planAdventureTeam(s,H.DEFAULTS,s.mons.map(m=>m.uid),{pool:s.mons,size:20,force:true});assert.equal(plan.uids.length,6);assert.ok(!plan.uids.includes('old'));
});

test('raid ally estimates account for available moves, level and rank',()=>{
    assert.ok(H.allyStrength([{id:125,level:100}],130)>H.allyStrength([{id:126,level:100}],130));
    assert.ok(H.allyStrength([{id:125,level:100,rank:2}],130)>=H.allyStrength([{id:125,level:100}],130));
    assert.equal(H.allyStrength([{id:99999,level:100}],130),0);
});

test('league threat model covers all five members and stays stable across the league', () => {
    const s=state();s.adv.chapter=9;const before=H.chapterThreats(s);s.adv.chapter=13;
    assert.deepEqual(H.chapterThreats(s),before);assert.ok(before.length>H.DATA.chapters[9].foes.length);
});

test('team reevaluation is throttled but a new map and a failure trigger another check', t => {
    // Keep these four ticks in the same weather slot; a weather change also triggers a review.
    const s=state(),{e}=runtime(t,s,{autoTeam:true,raids:false,mode:'money'}),now=new Date(2026,10,18,14,12).getTime();
    assert.equal(e.fitTeam(s,now),false);assert.equal(e.fitTeam(s,now+1000),false);assert.equal(e.teamCheck.at,now);
    s.adv.chapter=1;e.fitTeam(s,now+2000);assert.equal(e.teamCheck.at,now+2000);
    s.adv.deaths[1]=1;e.fitTeam(s,now+3000);assert.equal(e.teamCheck.at,now+3000);
});

test('team transaction cancels on manual handoff and backs off without stopping the main task on UI failure', t => {
    const s=state(),{e}=runtime(t,s,{autoTeam:true,raids:false,mode:'money'}),now=Date.now();e.read();
    e.driver.teamTask={uids:['a']};e.manualInput(now);assert.equal(e.driver.teamTask,null);assert.equal(e.running,true);e.manual=null;
    s.mons.push({uid:'bench',id:150,level:100});e.driver=new H.DOMDriver(e);e.driver.nav=()=>true;
    e.driver.teamTask={chapter:0,members:[0],uids:['bench'],started:now,attempts:0};
    e.driver.adventureTeam(s,now);assert.equal(e.driver.teamTask,null);assert.ok(e.teamRetryAt>now);assert.equal(e.running,true);
});

test('pending road changes do not contaminate measurements with the previous active party', async t => {
    const s=state();s.road=['previous'];const {e}=runtime(t,s,{autoTeam:false,raids:false,mode:'money'});
    e.target=H.candidates(s,e.settings,true)[0];e.visit={started:Date.now()};e.telemetry.sample={old:true};await e.step();
    assert.equal(e.telemetry.sample,null);
});
test('basic capture completes all branches, surviving evolution; evolved-only capture does not', () => {
    const s = state(); s.dex[133] = { caught: 1 }; s.dex[4] = { caught: 1 };
    const status = H.dexStatus(s, H.DEFAULTS);
    assert.ok(!status.ids.has(133));
    assert.ok(!status.ids.has(4));
    assert.ok(!H.ROOTS.some(m => [134, 135, 136, 196, 197, 470, 471].includes(m.id)));
    assert.equal(H.MONS.get(474).root, 137);
    assert.equal(H.MONS.get(25).root, 25);
    assert.equal(H.MONS.get(172).root, 25);
    assert.equal(H.captured(s, 6), true);
    assert.equal(H.captured(state(), 4), false);
});
test('scope includes only opened regions and excludes locked maps', () => {
    const s = state(); const settings = { ...H.DEFAULTS, region: 'all' };
    assert.ok(H.dexStatus(s, settings).roots.every(m => m.id <= 151));
    assert.ok(H.candidates(s, settings).every(c => c.id <= 8));
    s.travel.to.push('johto'); s.adv.unlocked = 19;
    assert.ok(H.dexStatus(s, settings).roots.some(m => m.id > 151));
    assert.ok(!H.candidates(s, settings).some(c => c.reg === 'hoenn'));
});
test('league is one atomic loop; partial unlocked league cannot be selected for farming', () => {
    const s = state(); s.adv.unlocked = 12;
    assert.ok(!H.candidates(s, H.DEFAULTS, true).some(c => c.league));
    s.adv.unlocked = 14;
    const league = H.candidates(s, H.DEFAULTS, true).find(c => c.league);
    assert.deepEqual(league.members, [9, 10, 11, 12, 13]);
    assert.equal(league.key, 'L');
});
test('planner removes captured basics, handles gifted choices and route cooldowns', () => {
    const s = state();
    const rows = H.dexRanking(s, H.DEFAULTS);
    assert.ok(rows.length);
    const c = rows[0];
    assert.ok(!H.dexRanking(s, H.DEFAULTS, { [c.key]: Date.now() + 10000 }).some(row => row.key === c.key));
    for (const m of H.ROOTS) s.dex[m.id] = { caught: 1 };
    assert.deepEqual(H.dexRanking(s, H.DEFAULTS), []);
});
test('money ranking learns actual net per minute; party change invalidates observations', () => {
    const s = state(), rows = H.candidates(s, H.DEFAULTS, true), metrics = {};
    metrics[H.metricsKey(s, rows[0], H.DEFAULTS)] = { runs: 2, seconds: 120, net: 200000 };
    const ranked = H.moneyRanking(s, H.DEFAULTS, metrics);
    assert.equal(ranked[0].key, rows[0].key); assert.equal(ranked[0].rate, 100000); assert.equal(ranked[0].measured, true);
    s.mons[0].id = 3;
    assert.ok(H.moneyRanking(s, H.DEFAULTS, metrics).every(c => !c.measured));
});
test('telemetry discards partial entry and measures complete loops including losses', () => {
    const s = state(), row = H.candidates(s, H.DEFAULTS)[0], t = new H.Telemetry();
    t.begin(s, row, H.DEFAULTS, 0); s.adv.node = 2;
    assert.equal(t.observe(s, row, H.DEFAULTS, 10000), null);
    s.adv.runs++; s.adv.node = 0; s.money += 900;
    assert.equal(t.observe(s, row, H.DEFAULTS, 30000).valid, false);
    s.adv.node = 3; t.observe(s, row, H.DEFAULTS, 40000);
    s.adv.runs++; s.adv.node = 0; s.money += 600; s.adv.deaths[0] = 1;
    const result = t.observe(s, row, H.DEFAULTS, 90000);
    assert.equal(result.valid, true); assert.equal(result.net, 600); assert.equal(result.seconds, 60); assert.equal(result.deaths, 1);
    assert.equal(t.metrics[H.metricsKey(s, row, H.DEFAULTS, 90000)].net, 600);
    s.adv.event = { raid: true }; assert.equal(t.observe(s, row, H.DEFAULTS, 100000), null); assert.equal(t.sample, null);
});
test('league accounting waits through every council member', () => {
    const s = state(); s.adv.unlocked = 14; s.adv.chapter = 9;
    const row = H.candidates(s, H.DEFAULTS).find(c => c.league), t = new H.Telemetry();
    t.begin(s, row, H.DEFAULTS, 0); s.adv.node = 1; t.observe(s, row, H.DEFAULTS, 10000);
    s.adv.runs++; s.adv.chapter = 10;
    assert.equal(t.observe(s, row, H.DEFAULTS, 60000), null);
    s.adv.runs += 4; s.adv.chapter = 9;
    assert.equal(t.observe(s, row, H.DEFAULTS, 300000).valid, false);
});
test('Paris raid day obeys timezone rather than browser or UTC calendar', () => {
    assert.equal(H.parisDay(Date.parse('2026-11-12T23:30:00Z')), '2026-11-13');
    assert.equal(H.parisDay(Date.parse('2026-07-12T22:30:00Z')), '2026-07-13');
});
test('stopped engine never schedules an action; background clears partial measurements', async t => {
    const { e, actions } = runtime(t, state()); e.running = false; await e.step(); assert.equal(actions.length, 0);
    e.running = true; global.document.hidden = true; e.telemetry.sample = {};
    await e.step(); assert.equal(actions.length, 0); assert.equal(e.telemetry.sample, null);
});
test('another tab and account change stop the worker before navigation', async t => {
    const { e, actions } = runtime(t, state()); e.storage.setItem('pokecatch-tab', 'tab2');
    await e.step(); assert.equal(e.running, false); assert.equal(actions.length, 0);
});
test('lease refuses a second helper until its expiry', () => {
    const s = state(), store = storage(s), a = new H.Engine(store), b = new H.Engine(store);
    a.account = b.account = 'fixture'; assert.equal(a.acquire(1000), true); assert.equal(b.acquire(1001), false);
    a.release(); assert.equal(b.acquire(1002), true);
});
test('money target stops before any action', async t => {
    const { e, actions } = runtime(t, state(), { mode:'money',moneyTarget: 2000 });
    await e.step(); assert.equal(e.running, false); assert.equal(actions.length, 0);
});
test('empty money candidates plus frontier cooldown cannot recurse into progress', async t => {
    const s = state(); s.adv.unlocked = 0;
    const { e } = runtime(t, s, { mode: 'money' }); e.cooldowns['0'] = Date.now() + 100000;
    await e.step(); assert.match(e.status, /等待/);
});
test('settings reject malformed numbers and unknown modes', () => {
    const settings = H.normalizeSettings({ mode: 'bad', speed: 999, raidMinutes: -1, moneyTarget: 'NaN', raids: 'false' });
    assert.equal(settings.mode, 'dex'); assert.equal(settings.speed, 4); assert.equal(settings.raidMinutes, 5);
    assert.equal(settings.moneyTarget, 0); assert.equal(settings.raids, true);
});

test('wild encounter data contains real targets in every phase, including after one-time gifts', () => {
    for (const phase of ['morning', 'day', 'night']) {
        const first = H.DATA.chapters[0].pools[phase];
        assert.ok(first.length > 0, `chapter 0 ${phase} must contain wild encounters`);
        assert.ok(first.some(([id, best]) => id === 19 && best > 0), 'Route 1 Rattata remains a catchable basic');
    }
    const s = state(); s.adv.unlocked = 0;
    const row = H.dexRanking(s, H.DEFAULTS)[0];
    assert.ok(row?.targets.some(t => t.id === 19), 'wild planner must work when starter has already been taken');
    for (const c of H.DATA.chapters.filter(c => c.wild > 0)) {
        for (const phase of ['morning', 'day', 'night']) assert.ok(c.pools[phase].length, `${c.id}/${phase}`);
    }
});

test('Start adopts an ongoing raid without editing the game save or replacing its party', async t => {
    const s = state(); s.adv.event = { raid: true, id: 35, reg: 'kanto', date: '2026-11-12', loops: 23, back: 0 };
    s.eventTeams = { 'raid:kanto': ['a'] };
    const { e } = runtime(t, s); e.running = false; e.schedule = () => {};
    const original = e.storage.getItem('gachamon-save-v1');
    e.start();
    assert.equal(e.running, true, e.status);
    assert.equal(e.driver.raid?.boss, 35);
    assert.equal(e.driver.raid?.reg, 'kanto');
    assert.equal(e.raidProbe, false);
    await e.step();
    assert.equal(e.running, true);
    assert.match(e.status, /团体战进行中.*23\/150/);
    assert.equal(e.storage.getItem('gachamon-save-v1'), original);
    e.stop(); e.start();
    assert.equal(e.running, true, 'stopping and restarting during the raid should resume it');
    e.stop();
});

test('adopted raid works with an empty adventure party and exits cleanly at completion', async t => {
    const s = state({ team: [] }); s.adv.event = { raid: true, id: 35, reg: 'kanto', loops: 23 };
    const { e } = runtime(t, s, { raids: false }); e.running = false; e.schedule = () => {};
    e.start(); assert.equal(e.running, true, e.status);
    await e.step(); assert.equal(e.running, true);
    s.adv.event = null; e.storage.setItem('gachamon-save-v1', JSON.stringify(s));
    await e.step(); assert.equal(e.running, false); assert.match(e.status, /队伍为空/);
});

test('unsupported tower runs still stop before navigation and keep the save intact', t => {
    const s = state(); s.adv.tower = { kind: 'tower' };
    const { e, actions } = runtime(t, s); e.running = false; e.schedule = () => {};
    const original = e.storage.getItem('gachamon-save-v1'); e.start();
    assert.equal(e.running, false); assert.equal(actions.length, 0);
    assert.equal(e.storage.getItem('gachamon-save-v1'), original);
});

test('data validation catches an empty export instead of silently excluding wild targets', () => {
    assert.deepEqual(H.encounterDataErrors(), []);
    const broken = { ...H.DATA.chapters[0], pools: { morning: [], day: [], night: [] } };
    assert.equal(H.encounterDataErrors({ ...H.DATA, chapters: [broken] }).length, 3);
});

test('raid completion returns control to the configured money task without starting a new raid', async t => {
    const s = state(); s.adv.event = { raid: true, id: 35, reg: 'kanto', loops: 23 };
    const { e } = runtime(t, s, { mode: 'money', raids: false }); e.running = false; e.schedule = () => {};
    e.start(); await e.step();
    s.adv.event = null; e.storage.setItem('gachamon-save-v1', JSON.stringify(s));
    await e.step();
    assert.equal(e.running, true); assert.equal(e.driver.raid, null); assert.equal(e.raidProbe, false);
    assert.ok(e.driver.pendingMap?.row, 'should select the money map after completing adopted raid');
    e.stop();
});

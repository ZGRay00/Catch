const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function state(){return{trainer:{id:'manual-team-v312'},money:3000,mons:[{uid:'first',id:9,level:8,reg:'kanto'},{uid:'second',id:6,level:5,reg:'kanto'},{uid:'bench',id:150,level:100,reg:'kanto'}],team:['first','second'],road:['first','second'],dex:{},stats:{},items:{},travel:{to:['johto','hoenn','sinnoh']},adv:{layout:H.DATA.layout,chapter:8,unlocked:65,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};}
function context(){return{kind:'progress',id:8,key:'manual-frontier',reg:'kanto',level:80,size:6,foes:[{id:68,level:80,weight:1}],label:'Manual frontier'};}
function engine(s,settings={}){const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','manual-tab']]),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)},e=new H.Engine(storage,{mode:'progress',autoTeam:false,optimizeRaid:false,autoEvolve:false,autoPrepare:true,raids:false,...settings});e.loadAccount(s);e.read();e.running=true;e.started=Date.now();e.tabToken='manual-tab';e.schedule=()=>{};e.automation.begin(s);return e;}

for(const kind of ['map','progress'])test(`manual ${kind} preparation keeps exact selected members and order without bench fillers`,()=>{
    const s=state(),before=JSON.stringify(s),plan=H.preparationPlan(s,{...H.DEFAULTS,autoTeam:false,autoEvolve:false},{...context(),kind});
    assert.deepEqual(plan.members.map(mon=>mon.uid),['first','second']);assert.deepEqual(plan.targets.map(mon=>mon.uid),['first','second']);
    assert.deepEqual(plan.uids,['first','second']);assert.equal(plan.needed,true);assert.equal(plan.selection,null);assert.equal(JSON.stringify(s),before);
});

test('automatic preparation can still assign an available carrier instead of inheriting the manual restriction',()=>{
    const s=state(),plan=H.preparationPlan(s,{...H.DEFAULTS,autoTeam:true,autoEvolve:false},context());
    assert.ok(plan.uids.includes('bench'));assert.ok(plan.selection);
});

test('manual ordinary preparation never reorders a valid party after unrelated Box growth',()=>{
    const s=state(),e=engine(s),p={context:context(),uids:['first','second'],targets:[{uid:'first',goal:80},{uid:'second',goal:80}],route:{...H.DATA.chapters[8],key:'8',members:[8]}};
    s.mons[2].rank=5;s.mons[2].level=100;const before=[...p.uids];e.coach.reconcile(s,p,Date.now());
    assert.deepEqual(p.uids,before);assert.equal(e.driver.teamTask,null);assert.equal(e.running,true);e.stop();
});

test('manual party repair reports a removed member without searching Box for a substitute',()=>{
    const s=state(),e=engine(s),p={context:context(),uids:['first','second'],targets:[{uid:'first',goal:80}],route:{...H.DATA.chapters[8],key:'8',members:[8]}};
    s.mons=s.mons.filter(mon=>mon.uid!=='second');e.coach.reconcile(s,p,Date.now());
    assert.deepEqual(p.uids,['first','second']);assert.equal(e.driver.teamTask,null);assert.equal(e.running,false);assert.match(e.status,/手动队伍/);
});

test('manual party repair reports a new same-species conflict instead of silently replacing one member',()=>{
    const s=state(),e=engine(s),p={context:context(),uids:['first','second'],targets:[{uid:'first',goal:80}],route:{...H.DATA.chapters[8],key:'8',members:[8]}};
    s.mons[1].id=s.mons[0].id;e.coach.reconcile(s,p,Date.now());
    assert.deepEqual(p.uids,['first','second']);assert.equal(e.driver.teamTask,null);assert.equal(e.running,false);assert.match(e.status,/手动队伍/);
});

function dom(t){const old=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{if(old===undefined)delete global.document;else global.document=old;});}
test('manual adventure mode does not evolve a non-selected Box candidate merely because it scores well',t=>{
    dom(t);const s=state();s.mons.push({uid:'free-bench',id:2,level:60,reg:'kanto'});const e=engine(s,{autoEvolve:true,autoPrepare:false});let navigations=0;e.driver.nav=()=>{navigations++;return false;};
    assert.equal(e.automation.evolution(s,Date.now()),false);assert.equal(e.automation.state.evolution,undefined);assert.equal(navigations,0);assert.equal(s.mons.at(-1).id,2);e.stop();
});

test('manual adventure mode can still perform an explicitly enabled free evolution of its selected member',t=>{
    dom(t);const s=state();s.mons[0]={uid:'first',id:2,level:60,reg:'kanto'};const e=engine(s,{autoEvolve:true,autoPrepare:false});e.driver.nav=()=>false;
    assert.equal(e.automation.evolution(s,Date.now()),true);assert.equal(e.automation.state.evolution.uid,'first');assert.equal(e.automation.state.evolution.toId,3);assert.equal(s.mons[0].id,2);e.stop();
});

test('manual adventure mode may evolve an explicit selected preparation target without optimizing the Box',t=>{
    dom(t);const s=state();s.mons.push({uid:'selected-learner',id:2,level:60,reg:'kanto'});const e=engine(s,{autoEvolve:true,autoPrepare:false});e.preparation={context:context(),targets:[{uid:'selected-learner',goal:80}]};e.driver.nav=()=>false;
    assert.equal(e.automation.evolution(s,Date.now()),true);assert.equal(e.automation.state.evolution.uid,'selected-learner');assert.equal(e.automation.state.evolution.toId,3);e.stop();
});

function preparation(s){return{mode:'progress',context:context(),resume:{},targets:[{uid:'first',id:9,level:8,goal:82},{uid:'second',id:6,level:5,goal:82}],uids:['first','second'],originalTeam:['first','second'],originalLocation:{...H.DATA.chapters[8],key:'8',members:[8]},phase:'train',phaseAt:Date.now(),lastGrowth:Date.now(),lastTick:Date.now(),frontier:s.adv.unlocked,avoid:{}};}
test('manual handoff adopts a replacement party for preparation instead of re-seating removed members',t=>{
    dom(t);const s=state(),e=engine(s),p=preparation(s),now=Date.now();e.preparation=p;e.budget.spent=123;e.budget.used=3;e.manualInput(now);
    s.team=['second','bench'];s.road=[...s.team];e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    assert.equal(e.manualStep(e.read(),now+16000),false);assert.equal(e.manual,null);assert.deepEqual(p.uids,['second','bench']);assert.deepEqual(p.originalTeam,['second','bench']);
    assert.deepEqual(p.targets.map(mon=>mon.uid),['second']);assert.equal(p.phase,'team');assert.equal(e.driver.teamTask,null);assert.equal(e.budget.spent,123);assert.equal(e.budget.used,3);assert.equal(e.settings.mode,'progress');e.stop();
});

test('manual handoff keeps the user reordered party as the new restore order',t=>{
    dom(t);const s=state(),e=engine(s),p=preparation(s),now=Date.now();e.preparation=p;e.manualInput(now);s.team=['second','first'];s.road=[...s.team];e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    e.manualStep(e.read(),now+16000);assert.deepEqual(p.uids,['second','first']);assert.deepEqual(p.originalTeam,['second','first']);assert.deepEqual(p.targets.map(mon=>mon.uid),['second','first']);e.stop();
});

test('manual handoff to an empty party stops rather than restoring the old roster automatically',t=>{
    dom(t);const s=state(),e=engine(s),p=preparation(s),now=Date.now();e.preparation=p;e.manualInput(now);s.team=[];s.road=[];e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    assert.equal(e.manualStep(e.read(),now+16000),true);assert.equal(e.running,false);assert.equal(e.driver.teamTask,null);assert.match(e.status,/手动队伍为空/);
});

test('a manually selected already-trained replacement no longer re-adds the old low-level trainees',t=>{
    dom(t);const s=state(),e=engine(s),p=preparation(s),now=Date.now();e.preparation=p;e.manualInput(now);s.team=['bench'];s.road=['bench'];e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    e.manualStep(e.read(),now+16000);assert.deepEqual(p.uids,['bench']);assert.deepEqual(p.originalTeam,['bench']);assert.deepEqual(p.targets,[]);assert.equal(p.phase,'restore');e.stop();
});

test('automatic adventure mode retains its existing protected preparation goals during a handoff',t=>{
    dom(t);const s=state(),e=engine(s,{autoTeam:true}),p=preparation(s),now=Date.now();e.preparation=p;e.manualInput(now);s.team=['bench'];s.road=['bench'];e.storage.setItem('gachamon-save-v1',JSON.stringify(s));
    e.manualStep(e.read(),now+16000);assert.deepEqual(p.uids,['first','second']);assert.deepEqual(p.targets.map(mon=>mon.uid),['first','second']);assert.equal(e.running,true);e.stop();
});

for(const optimizeRaid of [false,true])test(`special preparation preserves manual adventure order while special optimization is ${optimizeRaid?'on':'off'}`,()=>{
    const s=state();s.mons[2].level=10;s.eventTeams={'raid:kanto':['bench','first']};
    const ctx=H.battleContext(s,'raid',{id:130,reg:'kanto'}),cfg={...H.DEFAULTS,autoTeam:false,optimizeRaid,autoEvolve:false},plan=H.preparationPlan(s,cfg,ctx);
    assert.deepEqual(plan.members.map(mon=>mon.uid),['bench','first']);assert.deepEqual(plan.targets.map(mon=>mon.uid),['bench','first']);assert.deepEqual(plan.uids,['first','second']);assert.equal(plan.needed,true);
});

test('tower training keeps the manual adventure roster while retaining native battle trainees',()=>{
    const s=state();s.mons[0].level=40;s.mons[1].level=41;s.mons[2].level=50;
    const ctx=H.battleContext(s,'tower',{floor:100}),plan=H.preparationPlan(s,{...H.DEFAULTS,autoTeam:false,autoEvolve:false},ctx);
    assert.ok(plan.members.some(mon=>mon.uid==='bench'));assert.ok(plan.targets.some(mon=>mon.uid==='bench'));assert.deepEqual(plan.uids,['first','second']);
});

test('special preparation waits for missing trainees without adding them to a manual adventure team',()=>{
    const s=state();s.mons[2].level=10;s.eventTeams={'raid:kanto':['bench','first']};const e=engine(s),ctx=H.battleContext(s,'raid',{id:130,reg:'kanto'}),now=Date.now();e.budget.spent=123;e.budget.used=3;
    assert.equal(e.coach.ensure(s,ctx,{},now),true);assert.equal(e.preparation,null);assert.equal(e.driver.teamTask,null);assert.match(e.status,/请手动将.*加入冒险队伍以补练/);assert.equal(e.running,true);
    s.team=['second','bench','first'];s.road=[...s.team];assert.equal(e.coach.ensure(s,ctx,{},now+1200),true);
    assert.ok(e.preparation);assert.deepEqual(e.preparation.uids,['second','bench','first']);assert.deepEqual(e.preparation.targets.map(mon=>mon.uid),['bench','first']);assert.equal(e.driver.teamTask,null);assert.equal(e.budget.spent,123);assert.equal(e.budget.used,3);e.stop();
});

test('waiting for a manually added special trainee does not accumulate a false no-XP timeout',()=>{
    const s=state();s.mons[2].level=10;s.eventTeams={'raid:kanto':['bench']};const e=engine(s),ctx=H.battleContext(s,'raid',{id:130,reg:'kanto'}),now=Date.now(),p={...preparation(s),context:ctx,targets:[{uid:'bench',id:150,level:10,goal:100}],lastGrowth:now-600000,phaseAt:now-600000};e.preparation=p;
    e.coach.step(s,now);assert.equal(e.running,true);assert.equal(e.preparation,p);assert.equal(p.lastGrowth,now);assert.equal(p.phaseAt,now);assert.equal(e.driver.teamTask,null);assert.deepEqual(s.team,['first','second']);assert.match(e.status,/请手动将.*加入冒险队伍以补练/);e.stop();
});

test('manual reconciliation of special training does not search for replacements or carriers',()=>{
    const s=state(),e=engine(s),p={context:{...context(),kind:'raid'},uids:['second','first'],targets:[{uid:'bench',goal:100}]};
    e.coach.reconcile(s,p,Date.now());assert.deepEqual(p.uids,['second','first']);assert.equal(e.driver.teamTask,null);assert.equal(e.running,true);e.stop();
});

test('queued manual preparation adopts the current selection instead of its old automatic roster',t=>{
    dom(t);const s=state(),e=engine(s),p=preparation(s);e.preparation=p;e.budget.spent=123;e.budget.used=3;
    e.queue=H.normalizeJobs([{id:'manual-resume',settings:e.settings,status:'running'}]);e.queueRunning=true;e.queueIndex=0;e.stop('pause fixture');
    s.team=['second','bench'];s.road=[...s.team];e.storage.setItem('gachamon-save-v1',JSON.stringify(s));e.startQueue();
    assert.equal(e.running,true);assert.deepEqual(e.preparation.uids,['second','bench']);assert.deepEqual(e.preparation.originalTeam,['second','bench']);assert.equal(e.budget.spent,123);assert.equal(e.budget.used,3);e.stop();
});

test('manual special selection cannot replay an old checkpoint automatic team optimizer',t=>{
    dom(t);const s=state(),e=engine(s);let clicks=0;e.driver.click=()=>{clicks++;return true;};e.driver.ownedDialog={type:'team',key:'old-auto',optimized:false};
    assert.equal(e.driver.dialog(s),false);assert.equal(clicks,0);assert.equal(e.driver.ownedDialog,null);assert.match(e.status,/手动配队/);e.stop();
});

test('manual special selection leaves unselected free-evolution Box candidates alone',t=>{
    dom(t);const s=state();s.mons.push({uid:'free-bench',id:2,level:60,reg:'kanto'});const e=engine(s,{mode:'candy',autoTeam:true,optimizeRaid:false,autoEvolve:true,autoPrepare:false});
    assert.equal(e.automation.evolution(s,Date.now()),false);assert.equal(e.automation.state.evolution,undefined);assert.equal(s.mons.at(-1).id,2);e.stop();
});

test('breeding waits for manual daycare setup even with adventure team automation enabled',t=>{
    dom(t);const s=state();s.mons=[{uid:'parent',id:1,level:30,reg:'kanto'},{uid:'ditto',id:132,level:30,reg:'kanto'}];s.team=['parent'];s.road=['parent'];s.pension={mons:[],eggs:[],open:{slots:2}};
    const e=engine(s,{mode:'breed',breedId:1,autoTeam:true});e.driver.nav=()=>true;
    e.driver.click=()=>assert.fail('breeding must not change the saved party or deposit a parent');
    e.automation.breed(s,Date.now());
    assert.deepEqual(s.team,['parent']);assert.deepEqual(s.pension.mons,[]);assert.equal(e.driver.teamTask,null);assert.match(e.status,/手动寄养.*亲本/);assert.equal(e.running,true);e.stop();
});

test('manual preparation also adopts a changed selection when manual pause is disabled',t=>{
    dom(t);const s=state(),e=engine(s,{manualPause:false}),p=preparation(s);e.preparation=p;s.team=['bench'];s.road=['bench'];
    assert.equal(e.adoptManualPreparation(s,Date.now()),true);assert.deepEqual(p.uids,['bench']);assert.deepEqual(p.originalTeam,['bench']);assert.deepEqual(p.targets,[]);e.stop();
});

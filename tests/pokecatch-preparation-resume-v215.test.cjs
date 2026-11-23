const test=require('node:test'),assert=require('node:assert/strict'),H=require(process.env.POKECATCH_AUDIT_SOURCE||'../Pokecatch自动助手.user.js');
const species=[289,282,257,319,310,365];
function fixture(t,levels=species.map(()=>92),settings={}){
    const before=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
    const now=Date.now(),s={trainer:{id:'preparation-resume-v215'},money:100000,mons:species.map((id,i)=>({uid:'m'+i,id,level:levels[i],reg:'hoenn',xp:0})),team:[],road:[],dex:{},items:{},stats:{},
        travel:{to:['johto','hoenn']},link:{from:'kanto',to:'hoenn',side:'to'},adv:{layout:H.DATA.layout,chapter:42,unlocked:46,node:0,runs:0,speed:4,loops:[42],badges:[],gifts:{},deaths:{}}};
    s.team=s.mons.map(mon=>mon.uid);s.road=[...s.team];
    const data=new Map([['pokecatch-tab','prep-resume-tab']]),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    const e=new H.Engine(storage,{mode:'progress',progressUntil:65,autoTeam:true,autoPrepare:true,progressCandy:false,raids:false,trainBuddy:false,trainBuff:false,...settings});
    e.loadAccount(s);e.running=true;e.started=now;e.tabToken='prep-resume-tab';e.schedule=()=>{};e.read();e.budget.spent=123;e.budget.used=2;
    const route={...H.DATA.chapters[42],key:'42',members:[42]},context=H.battleContext(s,'progress',{row:{...H.DATA.chapters[46],members:[43,44,45,46,47]}});
    const p={mode:'progress',context:{...context},resume:{},targets:s.mons.map(mon=>({uid:mon.uid,id:mon.id,level:mon.level,goal:95})),uids:[...s.team],originalTeam:[...s.team],originalLocation:route,
        phase:'train',phaseAt:now,started:now,lastTick:now,lastGrowth:now,frontier:46,avoid:{},route,visit:{at:now,deaths:0},routeCheck:now,routeProfile:'old'};
    delete p.context.foes;e.preparation=p;
    const actions=[];e.driver.nav=screen=>{actions.push(screen);return true;};e.driver.map=()=>false;
    t.after(()=>e.stop());return{s,e,p,context,now,save,storage,actions};
}

test('a capable below-cap party ends ordinary preparation without levelling every member to 95',t=>{
    const {s,e,p,context,now}=fixture(t),started=e.started;e.coach.step(s,now);
    assert.equal(e.preparation,null);assert.equal(e.coach.ready.trial,true);assert.ok(e.coach.ready.targets.every(target=>target.goal===92));
    assert.equal(e.budget.spent,123);assert.equal(e.budget.used,2);assert.equal(e.started,started);assert.equal(e.settings.progressUntil,65);assert.equal(p.targets.at(-1).goal,95);
    assert.ok(s.mons.every(mon=>mon.level===92));assert.equal(e.ensurePrepared(s,context,{},now+1200),false);assert.equal(e.preparation,null);
});

test('winning training keeps the full plan while growth still checks early readiness and a defeat reopens it',t=>{
    const {s,e,p,now}=fixture(t,species.map(()=>60));
    const calls=[];
    e.coach.comparePreparation=function*(_s,_p,_ctx,_grew,_sliced,readinessOnly){
        calls.push(readinessOnly);
        const assessment={ready:false,reason:'fixture'};
        return readinessOnly?{assessment}:{assessment,plan:{uids:p.uids},same:true};
    };
    assert.equal(e.coach.reviewPreparation(s,p,now),false);assert.deepEqual(calls,[false]);
    assert.equal(e.coach.reviewPreparation(s,p,now+31000),false);assert.deepEqual(calls,[false]);
    s.stats.wins=2;s.buddy={uid:'m0'};s.mons.push({uid:'new',id:384,level:100,reg:'hoenn'});
    const later=now+12*3600000;
    assert.equal(e.coach.reviewPreparation(s,p,later),false);assert.deepEqual(calls,[false]);
    s.mons[0].level++;
    assert.equal(e.coach.reviewPreparation(s,p,later+1000),false);assert.deepEqual(calls,[false,true]);
    s.adv.deaths[42]=1;
    assert.equal(e.coach.reviewPreparation(s,p,later+2000),false);assert.deepEqual(calls,[false,true,false]);
});

test('reaching every training target bypasses another roster search before returning',t=>{
    const {s,e,p,now}=fixture(t,species.map(()=>95));
    e.coach.reviewPreparation=()=>assert.fail('all training goals are already met');
    e.coach.step(s,now);
    assert.equal(e.preparation,null);assert.equal(p.phase,'restore');
});

test('the applied training route avoids another comparison through wins and growth until a defeat',t=>{
    const {s,e,p,now}=fixture(t,species.map(()=>60),{autoTeam:false});
    let comparisons=0;e.coach.routes=()=>{comparisons++;return [p.route];};
    e.coach.step(s,now);assert.equal(comparisons,1);
    const rows=e.coach.heldTrainingRoutes(s,p);assert.deepEqual(rows,[p.route]);
    s.stats.wins=1;s.adv.runs++;s.mons[0].level++;
    e.coach.step(s,now+31000);assert.equal(comparisons,1);assert.equal(e.coach.heldTrainingRoutes(s,p),rows);
    s.adv.deaths[42]=1;
    assert.equal(e.coach.heldTrainingRoutes(s,p),null);
    e.coach.step(s,now+32000);assert.equal(comparisons,2);
});

test('growth after a win in the original encounter keeps a trial valid, but a switching change revokes it',t=>{
    const {s,e,context,now}=fixture(t);
    e.coach.step(s,now);const ready=e.coach.ready;
    s.adv.chapter=46;s.stats.wins=1;s.mons[0].level++;
    assert.equal(e.ensurePrepared(s,context,{},now+1200),false);assert.equal(e.coach.ready,ready);
    s.autoSwitch=false;
    e.ensurePrepared(s,context,{},now+2400);
    assert.notEqual(e.coach.ready,ready);
});

test('a money goal reached in a training detour cancels pending PC swaps and avoids restarting the farm',async t=>{
    const {s,e,p,now}=fixture(t,[61,60,61,62,60,61],{mode:'money',moneyTarget:100000});
    p.mode='money';p.context.kind='map';p.resume={row:p.route};
    e.driver.teamTask={started:now,uids:[...s.team].reverse(),members:[42]};
    e.driver.adventureTeam=()=>assert.fail('a completed farm must not issue another PC drag');
    e.driver.switchInBattle=()=>assert.fail('a completed farm must not switch battlers');
    e.settings.activeSwitch=true;
    await e.step(now+1200);
    assert.equal(e.running,false);assert.match(e.status,/达到目标金币/);assert.equal(e.preparation,null);
    assert.equal(e.driver.pendingMap,null);assert.equal(e.budget.used,2);
});

test('a completed detour waits for issued candy before restoring an original special party and advancing the queue',async t=>{
    const {s,e,p,now,save}=fixture(t,[61,60,61,62,60,61],{mode:'item',itemId:'rare-candy',itemQuantity:1});
    e.queueRunning=true;e.queueIndex=0;e.queue=[{settings:{...e.settings},status:'running'},{title:'刷钱',settings:{...e.settings,mode:'money',moneyTarget:0},status:'pending'}];
    e.startItems=0;s.stats.itemIn={'rare-candy':1};s.items={'rare-candy':1};save();
    p.mode='item';p.context.kind='raid';p.resume={type:'raid'};p.originalTeam=s.team.slice(0,-1);
    p.candyTx={uid:s.team[0],id:'exp-candy-s',kind:'buy',stock:0,counter:0,at:now};
    await e.step(now+1200);assert.equal(e.queueIndex,0);assert.ok(p.candyTx);assert.equal(e.driver.teamTask,null);
    s.items['exp-candy-s']=1;save();await e.step(now+2400);
    assert.equal(p.candyTx,undefined);assert.deepEqual(e.driver.teamTask.uids,p.originalTeam);
    s.team=[...p.originalTeam];s.road=[...s.team];save();await e.step(now+3600);await e.step(now+4800);
    assert.equal(e.queueIndex,1);assert.equal(e.queue[0].status,'done');assert.equal(e.raidProbe,false);assert.equal(e.driver.pendingMap,null);
});

for(const blocker of ['battle','choice','road','candy','owner','buddy','buff'])test(`early return waits for the native ${blocker} boundary`,t=>{
    const {s,e,p,now}=fixture(t);
    if(blocker==='battle')s.adv.battle={steps:1};if(blocker==='choice')s.adv.pending={type:'gift'};if(blocker==='road')s.road=['m0'];
    if(blocker==='candy')p.candyTx={kind:'use',uid:'m0',id:'exp-candy-m',at:now};if(blocker==='owner')e.automation.owner={kind:'buddy'};
    if(blocker==='buddy')e.automation.buddyTask={uid:'m0',started:now};if(blocker==='buff')e.automation.state.autoBuffTx={id:'pinap-berry',at:now};
    e.coach.step(s,now);assert.equal(e.preparation,p);assert.notEqual(p.phase,'restore');assert.equal(e.coach.ready,null);
});

test('a failed early attempt restores training and needs real growth before another early return',t=>{
    const {s,e,context,now}=fixture(t);e.coach.step(s,now);assert.equal(e.coach.ready.trial,true);
    s.adv.deaths[46]=1;assert.equal(e.ensurePrepared(s,context,{},now+1200),true);const p=e.preparation;
    assert.ok(p?.targets.length);assert.ok(p.trialFailure);Object.assign(p,{phase:'train',route:{...H.DATA.chapters[42],key:'42',members:[42]}});
    s.team=[...p.uids];s.road=[...s.team];e.coach.step(s,now+2400);assert.equal(e.preparation,p,'same losing roster cannot immediately retry');
    for(const mon of s.mons)mon.xp=10000;e.coach.step(s,now+3600);assert.equal(e.preparation,p,'XP ticks without a level change do not unlock a retry');
    for(const mon of s.mons)mon.level=93;e.coach.step(s,now+4800);assert.equal(e.preparation,p,'a single level is below the retry improvement floor');
    for(const mon of s.mons)mon.level=94;e.coach.step(s,now+6000);assert.equal(e.preparation,null);assert.equal(e.coach.ready.trial,true);
});

test('a ready roster in the PC is configured and actually applied before skipping preparation',t=>{
    const {s,e,context,now}=fixture(t,species.map(()=>5));
    e.preparation=null;
    s.mons.push(...species.map((id,i)=>({uid:'ready'+i,id,level:95,reg:'hoenn'})));
    assert.equal(e.ensurePrepared(s,context,{},now),true);const task=e.driver.teamTask;assert.ok(task?.preparationReady);assert.equal(e.coach.ready,null);
    assert.equal(e.ensurePrepared(s,context,{},now+1200),false,'queued ready-team edit must reach the native PC driver');
    s.team=[...task.uids];e.driver.teamTask=null;assert.equal(e.ensurePrepared(s,context,{},now+2400),true);assert.equal(e.coach.ready,null,'road still contains the weak roster');
    s.road=[...s.team];assert.equal(e.ensurePrepared(s,context,{},now+3600),false);assert.equal(e.coach.ready.trial,true);assert.equal(e.preparation,null);
});

test('strict readiness skips levelling without queuing an uncertified immediate PC swap',t=>{
    const {s,e,context,now}=fixture(t,species.map(()=>5));
    e.preparation=null;e.strictPlanning=true;
    s.mons.push(...species.map((id,i)=>({uid:'ready'+i,id,level:95,reg:'hoenn'})));
    assert.equal(e.ensurePrepared(s,context,{},now),false);
    assert.ok(e.coach.planReview.plan.uids.every(uid=>uid.startsWith('ready')));
    assert.equal(e.driver.teamTask,null);
    assert.equal(e.preparation,null);
    assert.equal(e.ensurePrepared(s,context,{},now+1200),false);
    assert.equal(e.driver.teamTask,null);
});

test('legacy all-pinned preparation can switch to a ready new roster without resetting its original task or budget',t=>{
    const {s,e,p,now}=fixture(t,[91,88,93,83,83,73]),targets=p.targets,resume=p.resume,original=p.originalTeam;
    s.mons.push(...species.map((id,i)=>({uid:'ready'+i,id,level:95,reg:'hoenn'})));
    e.coach.step(s,now);assert.equal(e.preparation,p);assert.notEqual(p.targets,targets);assert.equal(p.targets.length,0);assert.equal(p.resumeReady,true);
    assert.equal(p.resume,resume);assert.equal(p.originalTeam,original);assert.equal(e.budget.spent,123);assert.equal(e.budget.used,2);assert.equal(e.coach.ready,null);
    e.coach.step(s,now+1200);assert.ok(e.driver.teamTask);assert.equal(e.preparation,p);
    s.team=[...p.uids];e.driver.teamTask=null;e.coach.step(s,now+2400);assert.equal(e.preparation,p,'native road application remains mandatory');
    s.road=[...s.team];e.coach.step(s,now+3600);assert.equal(e.preparation,null);assert.equal(e.coach.ready.trial,true);
});

test('ordinary manual teams and special activity preparation retain their explicit level targets',t=>{
    const {s,e,p,now}=fixture(t,undefined,{autoTeam:false});e.coach.step(s,now);assert.equal(e.preparation,p);assert.ok(p.targets.every(target=>target.goal===95));
    e.settings.autoTeam=true;p.context.kind='raid';p.context.id=68;e.coach.step(s,now+1200);assert.equal(e.preparation,p);assert.ok(!p.earlyReady);
});

test('trial readiness survives a refresh checkpoint and validates its actual roster profile',t=>{
    const {s,e,context,now,storage,save}=fixture(t);e.coach.step(s,now);save();e.suspend();
    const next=new H.Engine(storage);next.loadAccount(s);next.schedule=()=>{};next.start(true);t.after(()=>next.stop());
    assert.equal(next.coach.ready?.trial,true);assert.equal(next.ensurePrepared(s,context,{},now+1200),false);assert.equal(next.preparation,null);
    s.autoSwitch=false;assert.notEqual(next.coach.ready.profile,next.coach.partyProfile(s));
});
test('a graduated manual party cannot leave its preparation pass with a replacement level-five squad',t=>{
    const {s,e,context,now}=fixture(t,species.map(()=>95),{autoTeam:false});
    e.coach.step(s,now);assert.equal(e.preparation,null);assert.ok(e.coach.ready);
    const replacements=species.map((id,i)=>({uid:'low'+i,id,level:5,reg:'hoenn'}));
    s.mons.push(...replacements);s.team=replacements.map(mon=>mon.uid);s.road=[...s.team];
    assert.equal(e.ensurePrepared(s,context,{},now+1200),true);
    assert.deepEqual(e.preparation.uids,s.team);assert.equal(e.coach.ready,null);
});
test('a ready squad waits for its actual road roster even with automatic evolution disabled',t=>{
    const {s,e,context,now}=fixture(t,undefined,{autoEvolve:false});e.coach.step(s,now);
    assert.equal(e.ensurePrepared(s,context,{},now+1200),false);
    s.road=[s.team[0]];
    assert.equal(e.ensurePrepared(s,context,{},now+2400),true);assert.match(e.status,/等待治疗点|准备队伍上阵/);
});

test('a pending candy purchase is acknowledged before completed preparation can disappear',t=>{
    const {s,e,p,now}=fixture(t,species.map(()=>95));p.candyTx={kind:'buy',uid:'m0',id:'exp-candy-m',at:now,stock:0,counter:0,xp:0};
    e.coach.step(s,now);assert.equal(e.preparation,p);assert.ok(p.candyTx);
    s.items['exp-candy-m']=1;e.coach.step(s,now+1200);assert.equal(p.candyTx,undefined);assert.equal(e.preparation,null);assert.equal(e.budget.spent,123);
});

test('a zero-XP replacement after a failed trial cannot skip native roster application',t=>{
    const {s,e,context,now}=fixture(t);e.coach.step(s,now);s.adv.deaths[46]=1;e.ensurePrepared(s,context,{},now+1200);const p=e.preparation;
    assert.ok(p?.trialFailure);Object.assign(p,{phase:'train',route:{...H.DATA.chapters[42],key:'42',members:[42]}});s.team=[...p.uids];s.road=[...s.team];
    s.mons.push(...species.map((id,i)=>({uid:'replacement'+i,id,level:95,reg:'hoenn'})));e.coach.step(s,now+2400);
    assert.equal(e.preparation,p);assert.equal(p.targets.length,0);assert.equal(p.resumeReady,true);
    e.coach.step(s,now+3600);assert.ok(e.driver.teamTask);assert.equal(e.preparation,p);
    s.team=[...p.uids];e.driver.teamTask=null;e.coach.step(s,now+4800);assert.equal(e.preparation,p);
    s.road=[...s.team];e.coach.step(s,now+6000);assert.equal(e.preparation,null);assert.equal(e.coach.ready.trial,true);
});

for(const unavailable of ['removed','locked-region'])test(`an ${unavailable} member does not freeze a pending ready roster`,t=>{
    const {s,e,p,now}=fixture(t,[91,88,93,83,83,73]);
    s.mons.push(...species.map((id,i)=>({uid:'ready'+i,id,level:95,reg:'hoenn'})));e.coach.step(s,now);
    assert.equal(p.resumeReady,true);const uid=p.uids[0];
    if(unavailable==='removed')s.mons=s.mons.filter(mon=>mon.uid!==uid);else s.mons.find(mon=>mon.uid===uid).reg='kanto';
    e.coach.step(s,now+1200);assert.equal(e.preparation,p);assert.ok(!p.uids.includes(uid));
    assert.ok(p.uids.every(id=>{const mon=s.mons.find(mon=>mon.uid===id);return mon&&H.teamEligible(s,mon,'hoenn');}));
});

test('waiting for a ready PC roster to apply does not recompute the whole candidate pool every tick',t=>{
    const {s,e,context,now}=fixture(t,species.map(()=>20));e.preparation=null;
    s.mons.push(...species.map((id,i)=>({uid:'ready'+i,id,level:95,reg:'hoenn'})));
    assert.equal(e.ensurePrepared(s,context,{},now),true);const task=e.driver.teamTask;assert.ok(task?.preparationReady);
    s.team=[...task.uids];e.driver.teamTask=null;
    assert.equal(e.ensurePrepared(s,context,{},now+1200),true);const cached=e.coach.planReview,hits=H.teamCacheStats().hits;
    assert.equal(e.ensurePrepared(s,context,{},now+2400),true);assert.equal(e.coach.planReview,cached);assert.equal(H.teamCacheStats().hits,hits);
    s.road=[...s.team];assert.equal(e.ensurePrepared(s,context,{},now+3600),false);assert.equal(e.coach.ready.trial,true);
});

test('a failed trial growth floor survives a reload checkpoint instead of reviving its old readiness',t=>{
    const {s,e,context,now,storage,save}=fixture(t);e.coach.step(s,now);s.adv.deaths[46]=1;e.ensurePrepared(s,context,{},now+1200);const p=e.preparation;
    Object.assign(p,{phase:'train',route:{...H.DATA.chapters[42],key:'42',members:[42]}});s.team=[...p.uids];s.road=[...s.team];save();const floor=structuredClone(p.trialFailure.floor);e.suspend();
    const next=new H.Engine(storage);next.loadAccount(s);next.schedule=()=>{};next.start(true);t.after(()=>next.stop());
    assert.ok(next.preparation);assert.deepEqual(next.preparation.trialFailure.floor,floor);assert.equal(next.coach.ready,null);assert.equal(next.budget.spent,123);
    next.driver.nav=()=>true;next.coach.step(s,now+2400);assert.ok(next.preparation,'reloading does not grant a fresh model-only trial');
    assert.match(next.preparation.assessment.reason,/上次试打战败/);assert.equal(next.preparation.assessment.ready,false);
    for(const mon of s.mons)mon.level=94;next.coach.step(s,now+3600);assert.equal(next.preparation,null);assert.equal(next.coach.ready.trial,true);
});

test('queue Stop and Resume preserve a failed trial floor and its existing budget',t=>{
    const {s,e,context,now,save}=fixture(t);e.coach.step(s,now);s.adv.deaths[46]=1;e.ensurePrepared(s,context,{},now+1200);const p=e.preparation;
    Object.assign(p,{phase:'train',route:{...H.DATA.chapters[42],key:'42',members:[42]}});s.team=[...p.uids];s.road=[...s.team];save();
    e.queue=H.normalizeJobs([{id:'trial-floor',title:'Continue story',settings:e.settings,status:'running'}]);e.queueRunning=true;e.queueIndex=0;
    const floor=structuredClone(p.trialFailure.floor);e.stop('fixture pause');assert.deepEqual(e.queue[0].progress.preparation.trialFailure.floor,floor);
    e.startQueue();assert.equal(e.running,true,e.status);assert.deepEqual(e.preparation.trialFailure.floor,floor);assert.equal(e.coach.ready,null);assert.equal(e.budget.spent,123);assert.equal(e.budget.used,2);
    e.coach.step(s,now+2400);assert.ok(e.preparation);assert.equal(e.preparation.assessment.ready,false);
});

async function finishReview(job){
    assert.ok(job,'a cooperative review was scheduled');
    const delay=require('node:timers/promises').setTimeout;
    for(let i=0;i<600&&!job.result&&!job.error;i++)await delay(5);
    if(job.error)throw job.error;
    assert.ok(job.result,'finished within the test deadline');
}

function largeBox(s){
    for(let i=0;i<26;i++)s.mons.push({uid:'reserve'+i,id:129,level:3,reg:'hoenn',xp:0});
}

test('active training discards a finished review after a new capture and adopts a ready party only at a safe boundary',async t=>{
    const {s,e,p,now,save}=fixture(t,species.map(()=>5));largeBox(s);save();
    await e.step(now);const obsolete=e.teamSearch;
    assert.ok(obsolete?.signature.startsWith('review:'));
    await e.step(now+1);assert.equal(e.teamSearch,obsolete);
    assert.equal(e.driver.teamTask,null);assert.equal(p.resumeReady,undefined);
    await finishReview(obsolete);
    s.mons.push(...species.map((id,i)=>({uid:'ready'+i,id,level:95,reg:'hoenn'})));save();
    await e.step(now+100);const fresh=e.teamSearch;assert.notEqual(fresh,obsolete);
    assert.ok(fresh?.signature.startsWith('review:'));
    await finishReview(fresh);
    s.adv.battle={kind:'wild',steps:1};save();
    await e.step(now+200);assert.equal(p.resumeReady,undefined);assert.equal(e.driver.teamTask,null);
    s.adv.battle=null;save();await e.step(now+300);
    assert.ok(p.resumeReady);assert.deepEqual(p.uids,fresh.result.plan.uids);
    assert.equal(e.budget.spent,123);assert.equal(e.preparation,p);assert.equal(e.teamSearch,null);
});

test('the training carrier review completes on ordinary engine ticks while preserving the pinned learner',async t=>{
    const {s,e,p,now,save,context}=fixture(t,species.map(()=>15));largeBox(s);
    p.context={...context,kind:'raid'};p.targets=p.targets.slice(0,1);
    s.mons.push({uid:'carrier',id:384,level:100,reg:'hoenn'});save();
    const expected=H.planAdventureTeam({...s,team:p.uids},e.settings,[p.targets[0].uid],{row:p.route,reg:p.context.reg,objective:'train',force:false,now});
    await e.step(now);const job=e.teamSearch;
    assert.ok(job?.signature.startsWith('trainees:'));assert.equal(e.driver.teamTask,null);
    await e.step(now+1);assert.equal(e.teamSearch,job);
    await finishReview(job);await e.step(now+100);
    assert.equal(e.teamSearch,null);assert.deepEqual(p.uids,expected.uids);assert.ok(p.uids.includes('carrier'));assert.ok(p.uids.includes(p.targets[0].uid));
});

test('off-roster evolution changes invalidate the review and manual control cancels it before any changes',async t=>{
    const {s,e,p,now,save}=fixture(t,species.map(()=>5));largeBox(s);save();
    await e.step(now);const old=e.teamSearch,goals=p.targets,uids=p.uids;assert.ok(old);
    s.pension={mons:[{mon:{uid:'daycare',id:130,level:20,reg:'hoenn'}}]};save();
    await e.step(now+1);const fresh=e.teamSearch;assert.ok(fresh);assert.notEqual(fresh,old);
    e.manualInput(now+2);
    await require('node:timers/promises').setTimeout(15);
    assert.equal(e.teamSearch,null);assert.equal(fresh.result,undefined);
    assert.equal(e.driver.teamTask,null);assert.equal(p.targets,goals);assert.equal(p.uids,uids);assert.equal(e.budget.spent,123);
});

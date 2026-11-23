const test=require('node:test'),assert=require('node:assert/strict'),H=require(process.env.POKECATCH_AUDIT_SOURCE||'../Pokecatch自动助手.user.js');

const now=new Date(2026,10,19,12,15).getTime();
function fixture(t,settings={}){
    const before=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
    const s={trainer:{id:'map-fixture'},mons:[{uid:'a',id:6,level:30,xp:0},{uid:'b',id:9,level:22,xp:0}],team:['a','b'],road:['a','b'],dex:{},money:3000,
        adv:{layout:H.DATA.layout,chapter:0,unlocked:24,node:5,runs:4,speed:4,loops:['0'],badges:[],gifts:{}},travel:{to:['johto']}};
    const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'money',region:'all',autoPrepare:false,autoTeam:false,raids:false,autoUnderDispatch:false,autoUnderCollect:false, ...settings});
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();e.loadAccount(s);e.running=true;e.started=now;e.tabToken=storage.getItem('pokecatch-tab');e.schedule=()=>{};e.read();
    e.driver.nav=()=>true;
    t.after(()=>e.stop());
    return{s,e,save};
}
const row=id=>{const c=H.DATA.chapters.find(c=>c.id===id);return {...c,key:String(c.loop),members:c.league?H.DATA.chapters.filter(entry=>entry.loop===c.loop).map(entry=>entry.id):[id]};};

test('chapter, regional league and weather identity agree with the local catalog',()=>{
    const ids=new Set(),loops=new Map();
    for(const c of H.DATA.chapters){
        assert.ok(!ids.has(c.id));ids.add(c.id);
        assert.ok(H.DATA.regions.some(r=>r.key===c.reg&&r.start<=c.id&&c.id<=r.end));
        assert.ok(H.WEATHER_DATA.chapters[c.id]);
        const key=String(c.loop);assert.ok(!loops.has(key)||loops.get(key)===c.reg);loops.set(key,c.reg);
    }
    assert.notEqual(H.routeIdentity(row(9)),H.routeIdentity(row(25)));
    assert.notEqual(H.routeIdentity(row(9),{zone:true,tier:1}),H.routeIdentity(row(9),{zone:true,tier:2}));
});

test('a delayed map save never resends the accepted action or starts a sample early',async t=>{
    const {s,e,save}=fixture(t),prior=row(0),next=row(1);let sent=0;
    e.target=prior;e.driver.map=()=>{sent++;return true;};e.travel(next,now);
    await e.step(now);await e.step(now+1200);
    assert.equal(sent,1);assert.equal(e.target,prior);assert.equal(e.telemetry.sample,null);
    s.adv.chapter=next.id;save();await e.step(now+2400);
    assert.equal(e.target,prior,'chapter alone does not prove loop confirmation');
    s.adv.loops=[next.key];save();await e.step(now+3600);
    assert.equal(e.target,next);assert.equal(e.driver.pendingMap,null);assert.equal(sent,1);
});

test('wrong-map and timed-out receipts cannot confirm or duplicate a map operation',async t=>{
    const {s,e,save}=fixture(t);let sent=0;e.driver.map=()=>{sent++;return true;};e.travel(row(1),now);
    await e.step(now);s.adv.chapter=14;s.adv.loops=['1'];save();await e.step(now+1200);
    assert.equal(e.target,null);
    await e.step(now+16000);assert.equal(e.target,null);assert.equal(e.driver.pendingMap,null);assert.equal(sent,1);assert.ok(e.cooldowns['1']>now+16000);
});

test('a same-map restart waits for an actual reset, and a league can confirm after advancing one room',async t=>{
    const {s,e,save}=fixture(t);const check=(r,options,previous)=>({row:r,options,arrival:{at:now,side:null,...previous}});
    e.observeMapArrival(s,check(row(0),{restart:true},{node:5}),now+1000);assert.equal(e.target,null);
    s.adv.node=0;e.observeMapArrival(s,check(row(0),{restart:true},{node:5}),now+1200);assert.equal(e.target.key,'0');
    Object.assign(s.adv,{chapter:10,unlocked:13,loops:['L']});save();
    e.observeMapArrival(s,check(row(9),{},{chapter:8,node:2}),now+2200);assert.equal(e.target.key,'L');
});

test('linked travel confirms the destination wallet only after the native side changes',t=>{
    const {s,e}=fixture(t),target=row(14);
    s.link={from:'kanto',to:'johto',side:'from',stash:{team:['b']}};
    const pending={row:target,options:{},arrival:{at:now,chapter:0,node:5,side:'to'}};
    Object.assign(s.adv,{chapter:14,loops:[target.key]});
    e.observeMapArrival(s,pending,now+1200);assert.equal(e.target,null);
    s.link.side='to';s.mons[1].reg='johto';s.team=['b'];s.road=['b'];
    e.observeMapArrival(s,pending,now+2400);assert.equal(e.target,target);
});

function verifiedMoneyTrip(t){
    const {s,e,save}=fixture(t,{autoPrepare:true,autoTeam:true,autoEvolve:false,moneyBuff:false});
    const roster=[[370,97],[277,100],[465,100],[10,99],[289,100],[13,75],[635,100],[612,100],[534,100],[609,100],[598,100],[530,100],[637,100]];
    s.mons=roster.map(([id,level],i)=>({id,level,uid:'m'+i,reg:'unova'}));
    s.team=s.mons.slice(0,6).map(mon=>mon.uid);s.road=[...s.team];s.travel.to=['unova'];
    Object.assign(s.adv,{chapter:75,unlocked:83,loops:['75'],deaths:{}});
    save();e.strictPlanning=true;
    const state=e.read(),projection=H.moneyRanking(state,e.settings,{}, {},now).find(candidate=>candidate.id===83);
    assert.ok(projection?.routePlan,'synthetic box has an independently scored destination party');
    const evaluate=e.evaluateTeamSearch;
    // Drain the real proof synchronously to isolate native map and team receipts.
    e.evaluateTeamSearch=(_signature,search)=>{let step=search.next();while(!step.done)step=search.next();return step.value;};
    let verified;
    try{verified=e.moneyRouteProof(state,projection,now);}finally{e.evaluateTeamSearch=evaluate;}
    assert.ok(verified?.routePlan.verified);
    assert.equal(e.routeRequestValid(state,{row:verified,routePlan:verified.routePlan},now),true);
    return {s,e,save,verified};
}

test('a verified money trip takes precedence over training through native arrival and team application',async t=>{
    const {s,e,save,verified}=verifiedMoneyTrip(t),specialist=verified.routePlan.party;
    const readiness=H.preparationReadiness(e.read(),e.settings,H.battleContext(e.read(),'map',{row:verified,now}));
    assert.equal(readiness.ready,false,'the departing party does not satisfy the destination training preflight');
    let navigation=0,swaps=0;
    e.driver.map=()=>{navigation++;return true;};
    e.driver.adventureTeam=()=>{
        assert.deepEqual(e.driver.teamTask.uids,specialist);
        s.team=[...specialist];save();e.driver.teamTask=null;swaps++;return true;
    };
    e.money=()=>{};
    e.travel(verified,now,{orderedRoutePlan:true});
    assert.equal(e.coach.adventure(e.read(),null,now),null,'pending verified departure skips the second preflight');
    await e.step(now);
    assert.equal(navigation,1);assert.equal(e.preparation,null);
    Object.assign(s.adv,{chapter:verified.id,loops:[verified.key],node:0});save();
    await e.step(now+1200);
    assert.equal(e.target,verified);assert.equal(e.visit.routePlan.plan,verified.routePlan);
    await e.step(now+2400);
    assert.equal(swaps,1);assert.equal(e.preparation,null);
    await e.step(now+3600);
    assert.match(e.status,/等待治疗点/);
    s.road=[...specialist];save();
    await e.step(now+4800);
    assert.equal(e.visit.activeRoutePlan,verified.routePlan);assert.equal(e.preparation,null);
    const later=now+2*3600000;
    s.mons.push({uid:'unused-new-member',id:149,level:100,reg:'unova'});save();
    assert.equal(e.verifiedFarmHeld(e.read(),later),true,'an arriving reserve and new weather slot do not invalidate the applied party');
    e.evaluateRouteRanking=()=>assert.fail('the confirmed visit must not open a new comparison');
    assert.equal(e.rankedYieldRoutes(e.read(),'money',{},later,true)[0].key,e.target.key);
    e.driver.raid={reg:'kanto'};
    e.finishRaidReturn(later,e.read());
    assert.equal(e.target,verified,'a raid that returns to the same route does not displace the running plan');
    e.updateHeldFarmSample(e.read(),{seconds:60,net:12000},later);
    assert.equal(e.heldFarm(e.read(),'money',later).row.rate,12000,'live income changes without starting another route calculation');
    assert.equal(e.coach.adventure(e.read(),null,now+4800),null,'an applied proof must not immediately be routed through the same preflight');
    s.adv.deaths[verified.id]=1;save();
    assert.equal(e.verifiedFarmHeld(e.read(),later),false);
    assert.equal(e.heldFarm(e.read(),'money',later),null);
    assert.equal(e.coach.adventure(e.read(),null,now+6000)?.context.id,verified.id,'fresh defeat releases the optimistic proof');
});

test('a completed practice route is retained through growth and resume until defeat or a new goal',t=>{
    const {s,e,save}=fixture(t,{mode:'train',trainUid:'a',trainLevel:45});
    const chosen={...row(0),rate:1000,trainingSafe:true},alternative={...row(1),rate:950,trainingSafe:true};
    const ranked=e.rankedYieldRoutes;
    let reranks=0;
    e.rankedYieldRoutes=()=>{reranks++;return [chosen,alternative];};
    e.confirmMapArrival(e.read(),{row:chosen},now);
    e.automation.autoBuddy=()=>false;e.automation.autoBuff=()=>false;
    e.farm(e.read(),now,'train');
    assert.equal(reranks,1);
    s.mons[0].level++;s.mons.push({uid:'bench',id:150,level:100});save();
    e.manualInput(now+2000);e.resumeManual(now+4000);
    e.farm(e.read(),now+2*3600000,'train');
    assert.equal(reranks,1,'neither growth, steps, elapsed time nor resuming starts another ranking');
    assert.equal(ranked.call(e,e.read(),'xp',{},now+2*3600000,true)[0].key,chosen.key);
    e.settings.trainLevel++;
    assert.equal(e.heldFarm(e.read(),'xp',now+2*3600000),null);
    e.farm(e.read(),now+2*3600000,'train');
    assert.equal(reranks,2,'an explicitly different goal gets a new plan');
    s.adv.deaths={0:1};save();
    e.farm(e.read(),now+2*3600000+1000,'train');
    assert.equal(reranks,3,'a new defeat triggers a fresh comparison immediately');
});

test('money finishes its first choice before locking a newly adopted loop',t=>{
    const {e}=fixture(t),current={...row(0),rate:1000},faster={...row(1),rate:2000};
    e.rankedYieldRoutes=()=>[faster,current];
    e.automation.autoBuff=()=>false;e.canStartRoute=()=>true;
    e.money(e.read(),now);
    assert.equal(e.target.key,current.key);
    assert.equal(e.driver.pendingMap,null);
    assert.equal(e.heldFarm(e.read(),'money',now),null);
    e.money(e.read(),now+16000);
    assert.equal(e.driver.pendingMap.row.key,faster.key);
});

test('an ordinary money swap finishes its remaining drag before readiness can wait for healing or change maps',async t=>{
    const {s,e,save}=fixture(t,{autoPrepare:true,autoTeam:true,autoEvolve:false,moneyBuff:false});
    const current={...row(56),rate:9000},next={...row(75),rate:17000};
    s.mons=[464,392,94,248,484,145].map((id,i)=>({uid:`fit-${i}`,id,level:100,reg:'sinnoh'}));
    s.team=s.mons.map(mon=>mon.uid);s.travel.to=['sinnoh','unova'];
    Object.assign(s.adv,{chapter:current.id,unlocked:76,loops:[current.key],deaths:{}});
    const context={...H.battleContext(s,'map',{row:current}),now};
    const middle=H.preparationPlan(s,e.settings,context).uids;
    assert.equal(middle.length,6);assert.equal(H.preparationReadiness(s,e.settings,context,middle).ready,true);
    const [lead,first,second,third,...tail]=middle;
    const original=[third,first,second,lead,...tail],planned=[lead,second,first,third,...tail];
    s.team=original.slice();s.road=original.slice();save();
    e.strictPlanning=true;e.target=current;e.visit={started:now-20000,deaths:0};
    e.rankedYieldRoutes=()=>[next,current];
    e.automation.autoBuff=()=>false;
    const evaluate=e.evaluateTeamSearch;
    // Start an ordinary, verified fitting task with a fixed test result from the solver.
    e.evaluateTeamSearch=()=>({uids:planned,changed:true,reason:'fixture',gain:.1,opponents:6,verification:{status:'verified',uids:planned}});
    assert.equal(e.fitTeam(e.read(),now-1200),true);
    e.evaluateTeamSearch=evaluate;
    const task=e.driver.teamTask,drags=[],maps=[];
    const slots=s.team.map((_,slot)=>({slot}));
    global.document.querySelector=selector=>selector==='#team-slots'?{children:slots}:null;
    e.driver.drag=(from,to)=>{
        drags.push([from.slot,to.slot]);
        [s.team[from.slot],s.team[to.slot]]=[s.team[to.slot],s.team[from.slot]];save();return true;
    };
    e.driver.map=target=>{maps.push(target.id);return true;};
    assert.equal(e.driver.adventureTeam(e.read(),now-1200),true);
    assert.deepEqual(s.team,middle);assert.deepEqual(s.road,original);
    assert.deepEqual(H.preparationPlan(e.read(),e.settings,context).uids,middle,'readiness would otherwise wait on this legal intermediate order');

    await e.step(now);
    assert.deepEqual(drags,[[3,0],[2,1]],'the owned PC transaction must get a tick even while the native road roster is stale');
    assert.equal(e.driver.teamTask,task);
    assert.deepEqual(s.team,planned);assert.deepEqual(s.road,original);
    await e.step(now+1200);assert.equal(e.driver.teamTask,null);assert.deepEqual(maps,[]);

    await e.step(now+20000);assert.equal(e.driver.pendingMap?.row.id,next.id);
    assert.deepEqual(s.road,original,'waiting for an old-map healing point must not obstruct a ready destination');
    assert.equal(e.telemetry.sample,null,'the stale road party must not start a yield sample');
    await e.step(now+21200);assert.deepEqual(maps,[next.id]);
    assert.deepEqual(s.road,original,'the native save still owns road-party confirmation');
    assert.equal(e.telemetry.sample,null);
    s.road=planned.slice();
    Object.assign(s.adv,{chapter:next.id,loops:[next.key],node:0});save();
    await e.step(now+22400);assert.equal(e.target.id,next.id);assert.equal(e.driver.pendingMap,null);
    assert.deepEqual(drags,[[3,0],[2,1]]);
});

test('a money swap timeout does not postpone the destination roster review',t=>{
    const {s,e,save}=fixture(t,{autoTeam:true});
    const current=row(56),destination=row(75);
    e.strictPlanning=true;e.teamRetryAt=now+300000;e.teamRetryLoop=current.key;
    s.travel.to=['sinnoh','unova'];
    Object.assign(s.adv,{chapter:current.id,unlocked:83,loops:[current.key]});save();
    e.confirmMapArrival(e.read(),{row:current},now);
    let reviews=0;
    e.evaluateTeamSearch=()=>{reviews++;};
    assert.equal(e.fitTeam(e.read(),now+1000),false);
    assert.equal(reviews,0);
    assert.match(e.teamValidationNote,/配队暂缓/);

    Object.assign(s.adv,{chapter:destination.id,loops:[destination.key]});save();
    e.confirmMapArrival(e.read(),{row:destination},now+2000);
    assert.equal(e.teamRetryAt,0);
    e.fitTeam(e.read(),now+2000);
    assert.equal(reviews,1,'the new map can begin its own review immediately');
});

test('a changed eligible box cancels an unexecuted money proof before considering preparation again',async t=>{
    const {s,e,save,verified}=verifiedMoneyTrip(t);
    e.target=row(75);
    e.travel(verified,now,{orderedRoutePlan:true});
    s.mons=s.mons.filter(mon=>mon.uid!==verified.routePlan.party.find(uid=>!s.team.includes(uid)));save();
    assert.equal(e.routeRequestValid(e.read(),e.driver.pendingMap,now+1200),false);
    e.driver.map=()=>assert.fail('a stale proof must not initiate the map change');
    await e.step(now+1200);
    assert.equal(e.driver.pendingMap,null);assert.equal(e.preparation,null);
    assert.equal(e.coach.adventure(e.read(),null,now+2400)?.context.id,75);
});

test('a money route waits for its started legal swap through Box growth and retires the stale proof on road receipt',t=>{
    const {s,e,save,verified}=verifiedMoneyTrip(t),plan=verified.routePlan;
    Object.assign(s.adv,{chapter:verified.id,loops:[verified.key],node:0});save();
    e.confirmMapArrival(e.read(),{row:verified,routePlan:plan},now);
    assert.equal(e.applyArrivalTeam(e.read(),now+1000),true);
    const task=e.driver.teamTask;
    task.hasDragged=true;
    task.pending={before:s.team.join('|'),after:plan.party.join('|'),at:now+1000};
    s.mons.push({uid:'changed-box',id:1,level:70,reg:'unova'});s.team=[...plan.party];save();
    assert.equal(e.routeRequestValid(e.read(),{row:verified,routePlan:plan},now+2000,true),false);
    assert.equal(e.applyArrivalTeam(e.read(),now+2000),true);
    assert.equal(e.driver.teamTask,task);
    assert.equal(e.driver.adventureTeam(e.read(),now+2000),true);
    assert.equal(e.driver.teamTask,null);assert.equal(e.visit.routePlan.applied,true);
    assert.equal(e.applyArrivalTeam(e.read(),now+3000),true);
    s.road=[...plan.party];save();
    assert.equal(e.applyArrivalTeam(e.read(),now+4000),false);
    assert.equal(e.visit.routePlan,null);assert.equal(e.visit.activeRoutePlan,undefined);
});

test('learners use goal-truncated UID observations, separate from historical party XP',t=>{
    const {s,e}=fixture(t,{mode:'train',trainUid:'selected',trainUids:['a'],trainLevel:31});
    const target=row(0),key=H.metricsKey(s,target,e.settings,now),samples=e.metrics;
    samples[key]={xp:1e9,xpSeconds:60,xpRuns:3};
    assert.equal(H.xpRanking(s,e.settings,samples,{},now).find(r=>r.key===target.key).measured,false);
    const suffix=H.trainingXpSuffix(H.trainingXpTargets(s,e.settings));
    const remaining=H.trainingXpTargets(s,e.settings)[0].remaining;assert.ok(remaining>1);
    e.telemetry.begin(s,target,e.settings,now);e.telemetry.sample.full=true;
    s.adv.node++;s.adv.runs++;s.mons[0].xp=remaining+50;s.mons[1].xp=1e6;
    const result=e.telemetry.observe(s,target,e.settings,now+15000);
    assert.equal(result.valid,true);assert.equal(result.xp,remaining);assert.equal(samples[key+suffix].xp,remaining);assert.equal(samples[key].xp,1e9);
    s.stats={spent:{shop:100}};s.adv.runs++;s.adv.node++;
    assert.equal(e.telemetry.observe(s,target,e.settings,now+30000),null);
});

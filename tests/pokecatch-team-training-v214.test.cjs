const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(options={}){
    const mons=[129,19,16,21,23,10].map((id,i)=>({uid:'m'+i,id,level:i?20:5,reg:'kanto'}));
    const s={mons,team:mons.map(m=>m.uid),road:mons.map(m=>m.uid),autoSwitch:false,travel:{to:[]},adv:{chapter:8,unlocked:8,battle:null,pending:null}};
    const logs=[],e={settings:{...H.DEFAULTS,autoTeam:true,...options},telemetry:{sample:{}},log:message=>logs.push(message)},coach=new H.LevelCoach(e);
    const targets=[{uid:'m0',id:129,goal:30}],resume={row:{id:8,key:'8'}},originalTeam=[...s.team];
    const p={context:{kind:'progress',id:8,reg:'kanto'},targets,uids:[...s.team],resume,originalTeam,route:{...H.DATA.chapters[8],key:'8',members:[8]},routeCheck:1000,routeProfile:'old'};
    const carrier=(level=100)=>s.mons.push({uid:'carrier',id:150,level,reg:'kanto'});
    return{s,e,p,coach,logs,targets,resume,originalTeam,carrier};
}

test('preparation re-evaluates a newly caught carrier while retaining the unfinished learner and task',()=>{
    const {s,e,p,coach,targets,resume,originalTeam,carrier}=fixture();carrier();coach.reconcile(s,p,1000);
    assert.ok(p.uids.includes('carrier'));assert.ok(p.uids.includes('m0'));assert.equal(p.uids.length,6);
    assert.equal(p.targets,targets);assert.equal(p.targets[0].goal,30);assert.equal(p.resume,resume);assert.equal(p.originalTeam,originalTeam);
    assert.equal(e.telemetry.sample,null);assert.equal(p.routeCheck,0);
});

test('a battle defers carrier re-evaluation until the first safe tick without consuming the roster change',()=>{
    const {s,p,coach,carrier}=fixture();carrier();s.adv.battle={steps:1};const before=[...p.uids];
    coach.reconcile(s,p,1000);assert.deepEqual(p.uids,before);
    s.adv.battle=null;coach.reconcile(s,p,2200);assert.ok(p.uids.includes('carrier'));assert.ok(p.uids.includes('m0'));
});

test('a pending choice also defers optional training-party improvements',()=>{
    const {s,p,coach,carrier}=fixture();carrier();s.adv.pending={type:'gift'};const before=[...p.uids];
    coach.reconcile(s,p,1000);assert.deepEqual(p.uids,before);
    s.adv.pending=null;coach.reconcile(s,p,2200);assert.ok(p.uids.includes('carrier'));
});

test('native road-party application must finish before a new carrier is selected',()=>{
    const {s,p,coach,carrier}=fixture();carrier();s.road=['m0'];const before=[...p.uids];
    coach.reconcile(s,p,1000);assert.deepEqual(p.uids,before);
    s.road=[...s.team];coach.reconcile(s,p,2200);assert.ok(p.uids.includes('carrier'));
});

test('disabling adventure auto-team preserves a valid manually selected training party',()=>{
    const {s,p,coach,carrier}=fixture({autoTeam:false});carrier();const before=[...p.uids];coach.reconcile(s,p,1000);
    assert.deepEqual(p.uids,before);assert.equal(p.targets[0].goal,30);
});

test('a strong carrier on the locked regional side cannot replace the destination training party',()=>{
    const {s,p,coach,carrier}=fixture();s.link={to:'johto',side:'from'};carrier();s.mons.at(-1).reg='johto';coach.reconcile(s,p,1000);
    assert.ok(!p.uids.includes('carrier'));assert.ok(p.uids.includes('m0'));
});

test('equal-strength duplicate PC members do not cause repeated training-party replacements',()=>{
    const {s,p,coach,logs}=fixture();s.mons.push({...s.mons[1],uid:'equivalent'});coach.reconcile(s,p,1000);const before=[...p.uids],count=logs.length;
    coach.reconcile(s,p,2200);coach.reconcile(s,p,35000);assert.deepEqual(p.uids,before);assert.ok(!p.uids.includes('equivalent'));assert.equal(logs.length,count);
});

test('a carrier level gain causes an immediate safe review rather than waiting for its periodic deadline',()=>{
    const {s,p,coach,carrier}=fixture();carrier(1);coach.reconcile(s,p,1000);const before=coach.teamReview.profile;
    s.mons.at(-1).level=100;coach.reconcile(s,p,2200);assert.ok(p.uids.includes('carrier'));assert.notEqual(coach.teamReview.profile,before);assert.equal(p.targets[0].goal,30);
});

test('changing the training route evaluates its own enemies and can select a different lead',()=>{
    const {s,p,coach}=fixture();s.mons.push({uid:'water',id:9,level:80,reg:'kanto'},{uid:'fire',id:6,level:80,reg:'kanto'});
    p.route={id:9000,key:'fire-route',reg:'kanto',foes:[[6,75,1]]};coach.reconcile(s,p,1000);assert.equal(p.uids[0],'water');
    p.route={id:9001,key:'grass-route',reg:'kanto',foes:[[3,75,1]]};coach.reconcile(s,p,2200);assert.equal(p.uids[0],'fire');assert.ok(p.uids.includes('m0'));
});

test('a native auto-switch setting change invalidates a still-young training-party review',()=>{
    const {s,p,coach}=fixture();coach.reconcile(s,p,1000);const before=coach.teamReview.profile;
    s.autoSwitch=true;coach.reconcile(s,p,2200);assert.notEqual(coach.teamReview.profile,before);assert.equal(coach.teamReview.at,2200);
});

test('evolved mutually exclusive learners finish in batches without losing the remaining UID or its level goal',()=>{
    const {s,p,coach}=fixture();s.mons[0]={uid:'m0',id:3,level:25,reg:'kanto'};s.mons.push({uid:'sibling',id:3,level:15,reg:'kanto'});
    p.targets=[{uid:'m0',id:3,goal:30},{uid:'sibling',id:3,goal:30}];coach.reconcile(s,p,1000);
    assert.ok(p.uids.includes('m0'));assert.ok(!p.uids.includes('sibling'));assert.equal(p.targets.length,2);
    s.mons[0].level=30;coach.reconcile(s,p,2200);assert.ok(p.uids.includes('sibling'));assert.ok(!p.uids.includes('m0'));assert.equal(p.targets[1].goal,30);
});

test('temporary preparation ordering uses actual combat ability while retaining all selected learners',()=>{
    const s={mons:[{uid:'weak-lead',id:129,level:100,reg:'kanto'},{uid:'fighter',id:150,level:80,reg:'kanto'}],team:['weak-lead','fighter'],autoSwitch:false,travel:{to:[]},adv:{chapter:8,unlocked:8}};
    const context={...H.battleContext(s,'progress',{id:8}),size:2},plan=H.preparationPlan(s,{...H.DEFAULTS,autoTeam:true},context);
    assert.equal(plan.uids[0],'fighter');assert.deepEqual(new Set(plan.uids),new Set(['weak-lead','fighter']));
    const manual=H.preparationPlan(s,{...H.DEFAULTS,autoTeam:false},context);assert.deepEqual(manual.uids,s.team);
});

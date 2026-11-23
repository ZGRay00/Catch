const test=require('node:test');
const assert=require('node:assert/strict');
const {setTimeout:delay}=require('node:timers/promises');
const H=require('../Pokecatch自动助手.user.js');

const now=new Date(2026,10,18,12,15).getTime();
function fixture() {
    const mons=H.DATA.mons.slice(0,36).map((m,i)=>({uid:'m'+i,id:m.id,level:10+i,reg:'kanto'}));
    return {mons,team:mons.slice(0,6).map(m=>m.uid),adv:{chapter:3,unlocked:3,gifts:{},deaths:{}}};
}
function engine(){
    const e=new H.Engine({getItem:()=>null,setItem(){},removeItem(){}},{mode:'progress'});
    e.running=true;
    return e;
}
async function finish(job){
    for(let i=0;i<500&&!job.result&&!job.error;i++)await delay(4);
    if(job.error)throw job.error;
    assert.ok(job.result,'sliced search completed');
}
for(const autoSwitch of [true,false]){
    test('deferred adventure search preserves full solver result with native switching '+autoSwitch,async()=>{
        const s=fixture(),e=engine();s.autoSwitch=autoSwitch;
        const context={now,objective:'train',row:H.DATA.chapters[3]};
        e.settings.mode='train';e.settings.trainUid=s.team[1];
        const pinned=[s.team[1]],expected=H.planAdventureTeam(s,e.settings,pinned,context);
        H.clearTeamCache();
        assert.equal(e.fitTeam(s,now),true);
        const job=e.teamSearch;await finish(job);
        assert.deepEqual(job.result,expected);
        e.fitTeam(s,now+1);
        assert.equal(e.teamSearch,null);
    });
}
test('normal adventure ticks discard stale results before applying a team change',async()=>{
    const s=fixture(),e=engine();
    assert.equal(e.fitTeam(s,now),true);
    const obsolete=e.teamSearch;await finish(obsolete);
    assert.equal(e.driver.teamTask,null);
    s.mons.at(-1).level=100;
    e.fitTeam(s,now+100);
    assert.notEqual(e.teamSearch,obsolete);
    assert.equal(e.teamCheck,null);
    const fresh=e.teamSearch;await finish(fresh);
    e.fitTeam(s,now+200);
    assert.ok(e.teamCheck);
    assert.deepEqual(e.driver.teamTask?.uids||s.team,fresh.result.uids);
});

test('adventure fills a slot after dispatch even while the road still names the absent member',async()=>{
    const s=fixture(),e=engine();e.settings.mode='money';
    const dispatched=s.team.pop();s.mons=s.mons.filter(mon=>mon.uid!==dispatched);s.road=[...s.team,dispatched];
    s.adv.battle={id:'active'};assert.equal(e.fitTeam(s,now),false);
    delete s.adv.battle;assert.equal(e.fitTeam(s,now),true);await finish(e.teamSearch);
    e.fitTeam(s,now+1);
    assert.equal(e.driver.teamTask.uids.length,6);
    assert.ok(!e.driver.teamTask.uids.includes(dispatched));
    e.driver.teamTask=null;
    s.road=[s.mons.at(-1).uid,...s.team];
    assert.equal(e.fitTeam(s,now+2),false,'a live road member in a genuinely pending swap still waits');
});

test('combat boosts and raid-only profiles invalidate pending party work and yield history',async()=>{
    const s=fixture(),e=engine(),row={...H.DATA.chapters[3],key:'3',members:[3]};
    const member=s.mons[0],key=H.metricsKey(s,row,e.settings,now);
    e.fitTeam(s,now);const old=e.teamSearch;await finish(old);
    member.damageMult=1.2;
    assert.notEqual(H.metricsKey(s,row,e.settings,now),key);
    e.fitTeam(s,now+1);const revised=e.teamSearch;assert.notEqual(revised,old);await finish(revised);
    const boosted=H.rosterFingerprint(s);member.rageMax=3;
    assert.notEqual(H.rosterFingerprint(s),boosted);
    e.fitTeam(s,now+2);const raidProfile=e.teamSearch;assert.notEqual(raidProfile,revised);await finish(raidProfile);
    e.fitTeam(s,now+3);assert.ok(e.teamCheck);
});
test('preparation compares mature and projected squads in slices and rechecks the roster before consuming the result',async()=>{
    const s=fixture(),e=engine();
    const context=H.battleContext(s,'progress',{row:H.DATA.chapters[3]});
    s.mons.forEach((mon,i)=>mon.level=1+i%4);
    const ensure=()=>e.coach.ensure(s,context,{},now);
    assert.equal(ensure(),true);
    const obsolete=e.teamSearch;await finish(obsolete);
    assert.ok(obsolete.result.needed);assert.equal(e.preparation,null);
    s.mons.at(-1).level=80;
    ensure();assert.notEqual(e.teamSearch,obsolete);
    const fresh=e.teamSearch;await finish(fresh);
    assert.deepEqual(fresh.result,H.preparationPlan(s,e.settings,{...context,now}));
    e.persist=()=>{};ensure();
    assert.deepEqual(e.coach.planReview.plan,fresh.result);
});
test('manual control cancels pending evaluation before a game action',async()=>{
    const e=engine();e.fitTeam(fixture(),now);const job=e.teamSearch;
    e.manual={since:now};await delay(15);
    assert.equal(e.teamSearch,null);assert.equal(job.result,undefined);assert.equal(e.driver.teamTask,null);
});

test('world preflight invalidates a completed projection when a fighter is spent',async()=>{
    const s=fixture(),e=engine();
    s.wb={used:{}};e.settings.mode='world';e.persist=()=>{};
    const context=H.battleContext(s,'worldAttack'),ensure=()=>e.coach.ensure(s,context,{},now);
    assert.equal(ensure(),true);const first=e.teamSearch;await finish(first);
    const spent=first.result.members[0].uid;s.wb.used[spent]=1;
    ensure();const fresh=e.teamSearch;assert.notEqual(fresh,first);await finish(fresh);
    assert.deepEqual(fresh.result,H.preparationPlan(s,e.settings,{...context,now}));
    assert.deepEqual(fresh.result.members.map(mon=>mon.uid),H.worldAttackParty(s).map(mon=>mon.uid));
    assert.ok(fresh.result.members.every(mon=>mon.uid!==spent));
    assert.equal(e.driver.teamTask,null);
});

test('budget expiry returns the legal checkpoint and resumes the same iterator only for an unchanged signature',async()=>{
    const e=engine();let starts=0;
    function* search(){
        starts++;
        yield {uids:['owned'],changed:false,checkpointScore:1};
        yield {uids:['better'],changed:true,checkpointScore:2};
        return {uids:['best'],changed:true,score:3};
    }
    e.evaluateTeamSearch('one',search());const first=e.teamSearch;first.limit=0;
    for(let i=0;i<12;i++){e.evaluateTeamSearch('one',search());assert.equal(e.teamSearch,first);}
    await finish(first);
    assert.deepEqual(e.evaluateTeamSearch('one',search()).uids,['owned']);
    assert.equal(e.teamContinuation,first);
    e.evaluateTeamSearch('one',search());assert.equal(e.teamSearch,first);await finish(first);
    assert.deepEqual(e.evaluateTeamSearch('one',search()).uids,['better']);assert.equal(starts,1);
    e.evaluateTeamSearch('two',search());assert.notEqual(e.teamSearch,first);await finish(e.teamSearch);
    assert.deepEqual(e.evaluateTeamSearch('two',search()).uids,['best']);assert.equal(starts,2);
    assert.equal(e.teamContinuation,null);
});

test('strict jobs share the compute queue and expose only a completed result for deployment',async()=>{
    const e=engine(),trace=[];
    function* review(label){
        trace.push(label);yield {uids:['untested'],checkpointScore:100,verification:{status:'checking',checked:1,total:2}};
        for(let i=0;i<1200;i++)yield;
        return {uids:['checked'],score:1,changed:true,verification:{status:'verified',uids:['checked']}};
    }
    e.evaluateTeamSearch('live',review('live'),'teamSearch',true);
    e.evaluateTeamSearch('cancelled',review('cancelled'),'evolutionSearch');
    assert.equal(e.computePending.size,2);e.cancelTeamSearch('evolutionSearch');
    const job=e.teamSearch;job.limit=0;
    await finish(job);
    assert.deepEqual(trace,['live']);assert.deepEqual(job.result.uids,['checked']);assert.equal(job.result.limited,undefined);
    assert.deepEqual(e.evaluateTeamSearch('live',review('unused'),'teamSearch',true).uids,['checked']);
    assert.equal(e.computePending.size,0);assert.equal(e.computeTimer,null);
});

test('changes to a training lock replace pending work; a switch setting change cancels queued PC work',async()=>{
    const e=engine(),s=fixture();s.autoSwitch=false;e.settings.mode='train';e.settings.trainUid=s.team[0];
    e.fitTeam(s,now);const old=e.teamSearch;
    e.settings.trainUid=s.mons.at(-1).uid;e.fitTeam(s,now+1);
    assert.notEqual(e.teamSearch,old);await finish(e.teamSearch);e.fitTeam(s,now+2);
    assert.ok(e.driver.teamTask.uids.includes(e.settings.trainUid));
    e.settings.activeSwitch=!e.settings.activeSwitch;
    assert.equal(e.driver.adventureTeam(s,now+3),false);assert.equal(e.driver.teamTask,null);
    assert.equal(old.result,undefined);
});

test('manual rescue estimates apply only to provable single wild encounters with native switching off',()=>{
    const s=fixture(),foes=[{id:9,level:65,weight:1,singleWild:true}];
    s.mons=[{id:6,level:60,uid:'lead'},{id:145,level:70,uid:'backup'}];s.team=['lead','backup'];
    const score=(native,active,singleWild)=>{
        s.autoSwitch=native;
        return H.planAdventureTeam(s,{...H.DEFAULTS,autoTeam:true,activeSwitch:active},[],{objective:'money',foes:[{...foes[0],singleWild}]}).currentScore;
    };
    assert.ok(score(false,true,true)>score(false,false,true));
    assert.equal(score(false,true,false),score(false,false,false));
    assert.equal(score(true,true,true),score(true,false,true));
});

test('large synthetic Victory Road box retains coverage and improves its long-tail duel in both search budgets',()=>{
    const bench=require('../pokecatch-helper/tools/benchmark-team.cjs');
    const s=bench.fixture(300),row=H.DATA.chapters[76];
    for(const lowBudget of [true,false]){
        const plan=H.planAdventureTeam(s,H.DEFAULTS,[],{row,now:bench.clock,objective:'progress',lowBudget});
        const reference=bench.quality(s,plan.uids);
        assert.equal(new Set(plan.uids).size,6);
        assert.ok(reference.turns<=1.222&&reference.worst<5.727&&reference.deaths<=.000694);
        assert.ok(reference.keyTurns<1.21,'the three marked leader opponents remain covered');
        assert.match(plan.backup,/移除后模型分/);
    }
    s.team=[273,20,270,286,17,219].map(i=>'m'+i);
    const reordered=H.planAdventureTeam(s,H.DEFAULTS,[],{row,now:bench.clock,objective:'progress',lowBudget:true});
    assert.deepEqual(new Set(reordered.uids),new Set(s.team));assert.ok(reordered.changed);
    assert.ok(bench.quality(s,reordered.uids).turns<bench.quality(s,s.team).turns*.92);
});

test('irrelevant wallet and XP progress keep completed plans while old matchup contexts are evicted',async()=>{
    const e=engine(),s=fixture();s.team=s.mons.slice(-6).map(m=>m.uid);
    e.fitTeam(s,now);await finish(e.teamSearch);e.fitTeam(s,now+1);
    if(e.driver.teamTask){s.team=e.driver.teamTask.uids;e.driver.teamTask=null;e.fitTeam(s,now+2);await finish(e.teamSearch);e.fitTeam(s,now+3);}
    const check=e.teamCheck;s.money=12345;s.mons[0].xp=123;
    e.fitTeam(s,now+4);assert.equal(e.teamCheck,check);assert.equal(e.teamSearch,null);
    H.clearTeamCache();
    for(let id=1;id<=8;id++)H.planAdventureTeam(s,H.DEFAULTS,[],{foes:[{id,level:50,weight:1}],now});
    assert.equal(H.teamCacheStats().contexts,4);
});

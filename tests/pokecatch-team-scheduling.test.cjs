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
    assert.ok(fresh.result.members.every(mon=>mon.uid!==spent));
    assert.equal(e.driver.teamTask,null);
});

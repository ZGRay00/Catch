const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const species=[289,282,257,319,310,365],screenshot=[91,88,93,83,83,73];
function fixture(levels=screenshot){
    const mons=species.map((id,i)=>({uid:'m'+i,id,level:levels[i],reg:'hoenn'}));
    const s={mons,team:mons.map(m=>m.uid),road:mons.map(m=>m.uid),travel:{to:['johto','hoenn']},
        link:{from:'kanto',to:'hoenn',side:'to'},adv:{chapter:42,unlocked:46,speed:4,loops:[],badges:[]}};
    const row={...H.DATA.chapters[46],members:[43,44,45,46,47]};
    return{s,context:H.battleContext(s,'progress',{row}),settings:{...H.DEFAULTS,mode:'progress'}};
}
function check(s,settings,context,uids=s.team){return H.preparationReadiness(s,settings,context,uids);}

test('the screenshot party is not released just because average unguarded turn cost looks acceptable',()=>{
    const {s,settings,context}=fixture(),normal=H.battleRouteFit(s,{reg:'hoenn',foes:context.foes});
    assert.ok(normal.turns<4,'the old mean-only shortcut would appear attractive');
    const assessment=check(s,settings,context);assert.equal(assessment.ready,false);assert.equal(typeof assessment.reason,'string');
});

test('a capable level-92 party may try the level-95 league before every learner reaches the nominal cap',()=>{
    const {s,settings,context}=fixture(species.map(()=>92)),assessment=check(s,settings,context);
    assert.equal(assessment.ready,true,assessment.reason);assert.ok(s.mons.every(m=>m.level<95));assert.ok(assessment.fit);
});

test('a fully trained party is recognized as capable by the guarded ordinary-map model',()=>{
    const {s,settings,context}=fixture(species.map(()=>95)),assessment=check(s,settings,context);
    assert.equal(assessment.ready,true,assessment.reason);
});

test('one low-level reserve cannot force all the other ready members to keep grinding',()=>{
    const {s,settings,context}=fixture([95,95,95,95,95,73]),assessment=check(s,settings,context);
    assert.equal(assessment.ready,true,assessment.reason);assert.equal(s.mons.at(-1).level,73);
});

test('tail matchups that lose several members block early return even when every enemy is individually covered',()=>{
    const {s,settings,context}=fixture(species.map(()=>90)),normal=H.battleRouteFit(s,{reg:'hoenn',foes:context.foes});
    assert.equal(normal.coverage,1);assert.ok(normal.turns<4);
    assert.equal(check(s,settings,context).ready,false,'bad tail matchups and repeated knockouts still require preparation');
});

test('a tiny encounter weight cannot hide an opponent that defeats the entire team',()=>{
    const {s,settings,context}=fixture(species.map(()=>30));
    const rare={...context,foes:[{id:10,level:1,weight:100000},{id:150,level:100,weight:.00001}]};
    assert.ok(H.battleRouteFit(s,{reg:'hoenn',foes:rare.foes}).turns<2);
    assert.equal(check(s,settings,rare).ready,false);
});

test('manual adventure-team settings keep level-based preparation rather than silently invoking smart early return',()=>{
    const {s,settings,context}=fixture(species.map(()=>95));
    assert.equal(check(s,{...settings,autoTeam:false},context).ready,false);
});

test('special activities do not inherit ordinary-route readiness and their stricter battle rules',()=>{
    const {s,settings,context}=fixture(species.map(()=>95));
    for(const kind of ['raid','zone','elite','tower','under','worldAttack','worldCapture'])assert.equal(check(s,settings,{...context,kind}).ready,false,kind);
});

test('a locked origin-side member cannot supply destination battle readiness',()=>{
    const {s,settings,context}=fixture(species.map(()=>95));for(const mon of s.mons)mon.reg='kanto';
    assert.equal(check(s,settings,context).ready,false);
});

test('a strong PC reserve does not contribute unless its UID is part of the assessed party',()=>{
    const {s,settings,context}=fixture(species.map(()=>30));
    const before=check(s,settings,context).ready;s.mons.push(...species.map((id,i)=>({uid:'pc'+i,id,level:100,reg:'hoenn'})));
    assert.equal(check(s,settings,context).ready,before);assert.equal(before,false);
    assert.equal(check(s,settings,context,s.mons.slice(6).map(m=>m.uid)).ready,true);
});

test('an empty or incomplete UID assessment cannot fall back to a different strong party',()=>{
    const {s,settings,context}=fixture(species.map(()=>95));
    assert.equal(check(s,settings,context,[]).ready,false);assert.equal(check(s,settings,context,['not-in-pc']).ready,false);
    assert.equal(check(s,settings,context,['m0','m0','m0','m0','m0','m0']).ready,false,'one member cannot masquerade as six healthy slots');
});

test('temporary event copies cannot be counted as ordinary adventure members',()=>{
    for(const prefix of ['t:','c:']){
        const {s,settings,context}=fixture(species.map(()=>95));s.mons[0].uid=prefix+'copy';s.team[0]=s.mons[0].uid;
        assert.equal(check(s,settings,context).ready,false,prefix);
    }
});

test('money preflight keeps a capable live Giant Chasm party ahead of box projections',()=>{
    const now=Date.parse('2026-11-23T12:00:00+08:00');
    const ids=[609,464,145,484,392,282,32,65,68,103,248,289,369,402,464,476,483,487,448,638,647,645,646,377,382,384,529,637,598];
    const mons=ids.map((id,i)=>({uid:'candidate'+i,id,level:i<6?100:35+i*2,reg:'unova'})),team=mons.slice(0,6).map(mon=>mon.uid);
    const s={mons,team,road:[...team],autoSwitch:true,travel:{to:['unova']},adv:{chapter:75,unlocked:83,loops:['75'],badges:[],gifts:{}}};
    const row=H.DATA.chapters.find(chapter=>chapter.id===83),context=H.battleContext(s,'map',{row,now});
    const settings={...H.DEFAULTS,mode:'money',autoTeam:true,autoEvolve:false};
    assert.equal(check(s,settings,context).ready,true,'the actual six satisfy conservative destination readiness');
    const plan=H.preparationPlan(s,settings,context);
    assert.deepEqual(plan.uids,team,'preflight can approve the existing party before shopping for replacement trainees');
    assert.equal(plan.needed,false);assert.deepEqual(plan.targets,[]);
});

const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(mons,foe={id:9,level:95,weight:1},extra={}){
    const s={mons:mons.map(mon=>({reg:'kanto',xp:0,...mon})),team:mons.slice(0,1).map(mon=>mon.uid),road:mons.slice(0,1).map(mon=>mon.uid),
        adv:{chapter:8,unlocked:65},travel:{to:['johto','hoenn','sinnoh']},...extra};
    const context={kind:'progress',key:'progress:kanto:cost',id:8,reg:'kanto',level:foe.level,size:1,foes:[foe],label:'Cost comparison'};
    return{s,context,settings:{...H.DEFAULTS,mode:'progress',prepareMargin:0}};
}

test('equal future species prefer the member with much less real experience to train',()=>{
    const {s,context,settings}=fixture([{uid:'long-project',id:6,level:5},{uid:'near-ready',id:6,level:91}]);
    const plan=H.preparationPlan(s,settings,context);
    assert.equal(plan.members[0].uid,'near-ready');assert.equal(plan.targets[0].uid,'near-ready');
    assert.equal(plan.targets[0].goal,95);assert.equal(plan.selection.xp,H.candyXpGap(s,s.mons[1],95));assert.ok(plan.selection.cost>0);
});

test('the current XP balance breaks equal-level and equal-potential training-cost ties',()=>{
    const {s,context,settings}=fixture([{uid:'empty-xp',id:6,level:90},{uid:'earned-xp',id:6,level:90}]);
    s.mons[1].xp=H.DATA.xpThresholds.sinnoh[0][90]-1;
    const plan=H.preparationPlan(s,settings,context);assert.equal(plan.members[0].uid,'earned-xp');
    assert.equal(plan.selection.xp,H.candyXpGap(s,s.mons[1],95));assert.ok(plan.selection.xp<H.candyXpGap(s,s.mons[0],95));
});

test('a low-level counter with a major required coverage gain is not rejected by a level cutoff',()=>{
    const {s,context,settings}=fixture([{uid:'weak-ready',id:370,level:94},{uid:'electric-project',id:25,level:20}],{id:130,level:100,weight:1});
    const plan=H.preparationPlan(s,settings,context);assert.equal(plan.members[0].uid,'electric-project');
    assert.equal(plan.needed,true);assert.equal(plan.targets[0].goal,100);
});

test('manual adventure teams retain their chosen low-level member and original preparation target',()=>{
    const {s,context,settings}=fixture([{uid:'manual',id:6,level:5},{uid:'bench',id:150,level:95}]);
    const plan=H.preparationPlan(s,{...settings,autoTeam:false},context);
    assert.deepEqual(plan.members.map(mon=>mon.uid),['manual']);assert.equal(plan.targets[0].goal,95);assert.equal(plan.selection,null);
});

test('configured special squads keep their own intended trainee despite expensive training',()=>{
    const {s,settings}=fixture([{uid:'fixed-status',id:43,level:5},{uid:'ready-electric',id:145,level:100}]);
    s.eventTeams={'raid:kanto':['fixed-status']};const context={...H.battleContext(s,'raid',{id:130,reg:'kanto'}),size:1};
    const plan=H.preparationPlan(s,settings,context);assert.deepEqual(plan.members.map(mon=>mon.uid),['fixed-status']);
    assert.equal(plan.targets[0].uid,'fixed-status');assert.equal(plan.targets[0].goal,100);
});

test('cost savings never bring a linked origin member into a destination squad',()=>{
    const {s,context,settings}=fixture([{uid:'origin-ready',id:150,level:100},{uid:'native-project',id:4,level:5,reg:'hoenn'}],undefined,
        {link:{to:'hoenn',side:'to'},adv:{chapter:42,unlocked:42},travel:{to:['hoenn']}});
    context.reg='hoenn';const plan=H.preparationPlan(s,settings,context);
    assert.deepEqual(plan.members.map(mon=>mon.uid),['native-project']);assert.ok(!plan.uids.includes('origin-ready'));
});

test('regional level caps bound real training costs and targets',()=>{
    const {s,context,settings}=fixture([{uid:'far',id:6,level:5},{uid:'at-cap',id:6,level:20}],undefined,
        {adv:{chapter:0,unlocked:0},travel:{to:[]}});
    const plan=H.preparationPlan(s,settings,context);assert.equal(plan.members[0].uid,'at-cap');
    assert.equal(plan.members[0].goal,20);assert.equal(plan.needed,false);assert.equal(plan.selection.xp,0);assert.equal(plan.capLimited,true);
});

test('one unrelated XP tick does not cause a different ordinary training project to be selected',()=>{
    const {s,context,settings}=fixture([{uid:'near-ready',id:6,level:91},{uid:'long-project',id:9,level:5}]);
    const before=H.preparationPlan(s,settings,context);s.mons[1].xp++;
    const after=H.preparationPlan(s,settings,context);assert.deepEqual(after.members.map(mon=>mon.uid),before.members.map(mon=>mon.uid));
});

test('candidate evaluation does not mutate the real member levels or current party',()=>{
    const {s,context,settings}=fixture([{uid:'low',id:6,level:5},{uid:'high',id:9,level:90}]),before=JSON.stringify(s);
    H.preparationPlan(s,settings,context);assert.equal(JSON.stringify(s),before);
});

test('a screenshot-style league party can reuse already trained coverage instead of rebuilding six projects',()=>{
    const pairs=[[289,91],[282,88],[257,93],[319,83],[310,83],[365,73],[330,95],[260,94]],mons=pairs.map(([id,level],i)=>({uid:'m'+i,id,level,reg:'hoenn',xp:0}));
    const s={mons,team:mons.slice(0,6).map(mon=>mon.uid),road:mons.slice(0,6).map(mon=>mon.uid),travel:{to:['johto','hoenn']},
        link:{from:'johto',to:'hoenn',side:'to'},adv:{chapter:42,unlocked:46}};
    const row={...H.DATA.chapters[46],members:H.DATA.chapters.filter(c=>c.loop==='L:hoenn').map(c=>c.id)},context=H.battleContext(s,'progress',{row});
    const oldXp=mons.slice(0,6).reduce((total,mon)=>total+H.candyXpGap(s,mon,95),0),plan=H.preparationPlan(s,{...H.DEFAULTS,mode:'progress'},context);
    assert.ok(plan.members.some(mon=>mon.id===330));assert.ok(plan.members.some(mon=>mon.id===260));assert.ok(!plan.members.some(mon=>mon.id===365));
    assert.ok(plan.selection.xp<oldXp*.7);assert.ok(plan.members.every(mon=>mon.goal<=95));
});

test('actual-ready squads retain their evaluated order and expose no extra training targets or fillers',()=>{
    const ids=[289,282,257,319,310,365],mons=ids.map((id,i)=>({uid:'m'+i,id,level:92,reg:'hoenn',xp:0}));
    const s={mons,team:mons.map(mon=>mon.uid),road:mons.map(mon=>mon.uid),travel:{to:['hoenn']},link:{to:'hoenn',side:'to'},adv:{chapter:42,unlocked:46}};
    const row={...H.DATA.chapters[46],members:[43,44,45,46,47]},context=H.battleContext(s,'progress',{row}),settings={...H.DEFAULTS,mode:'progress'};
    const selected=H.planAdventureTeam(s,settings,[],{reg:'hoenn',pool:mons,foes:context.foes,size:context.size,force:true}).uids;
    const plan=H.preparationPlan(s,settings,context);assert.equal(plan.selection.ready,true);assert.equal(plan.needed,false);
    assert.deepEqual(plan.targets,[]);assert.ok(plan.members.every(mon=>mon.goal===mon.level));assert.deepEqual(plan.uids,selected);
    assert.deepEqual(new Set(plan.uids),new Set(plan.members.map(mon=>mon.uid)));
    const forced=H.preparationPlan(s,settings,{...context,forcePreparation:true});assert.equal(forced.selection.ready,false);assert.ok(forced.targets.length>0);
    assert.ok(forced.targets.every(mon=>mon.goal===95));
});

test('a defeated capped squad may train a materially better counter despite the zero-cost retry option',()=>{
    const mons=[20,18,22,24,28,40].map((id,i)=>({uid:'m'+i,id,level:38,reg:'kanto',xp:0}));mons.push({uid:'new-counter',id:65,level:5,reg:'kanto',xp:0});
    const s={mons,team:mons.slice(0,6).map(mon=>mon.uid),road:mons.slice(0,6).map(mon=>mon.uid),adv:{chapter:0,unlocked:3},travel:{to:[]}};
    const context=H.battleContext(s,'progress',{row:{...H.DATA.chapters[3],members:[3]}}),settings={...H.DEFAULTS,mode:'progress'};
    const routine=H.preparationPlan(s,settings,context);assert.equal(routine.needed,false);
    const recovery=H.preparationPlan(s,settings,{...context,forcePreparation:true});assert.equal(recovery.needed,true);
    assert.ok(recovery.targets.some(mon=>mon.uid==='new-counter'));assert.equal(recovery.selection.recovery,true);
});

test('a ready two-member assessment does not silently add a third unevaluated low-level filler',()=>{
    const s={mons:[{uid:'psychic',id:150,level:100},{uid:'fire',id:6,level:100},{uid:'reserve',id:129,level:5}],team:['psychic','fire'],road:['psychic','fire'],
        adv:{chapter:0,unlocked:65},travel:{to:['johto','hoenn','sinnoh']}};
    const context={kind:'progress',key:'two-ready',id:0,reg:'kanto',level:1,size:2,foes:[{id:10,level:1,weight:1}]};
    const plan=H.preparationPlan(s,{...H.DEFAULTS,mode:'progress'},context);assert.equal(plan.selection.ready,true);assert.equal(plan.uids.length,2);
    assert.ok(!plan.uids.includes('reserve'));assert.deepEqual(new Set(plan.uids),new Set(plan.members.map(mon=>mon.uid)));
});

const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function fixture(mon={uid:'learner',id:129,level:19,reg:'kanto'},options={}){
    const s={mons:[{xp:0,...mon}],team:[mon.uid],road:[mon.uid],dex:{},money:1000,stats:{},items:{},
        travel:{to:['johto','hoenn','sinnoh']},adv:{layout:H.DATA.layout,chapter:8,unlocked:65,badges:['Maître','Maître Johto','Maître Hoenn','Maître Sinnoh'],gifts:{},deaths:{}},...options};
    const settings={...H.DEFAULTS,mode:'progress',autoTeam:true,autoEvolve:true,prepareMargin:0};
    const context={kind:'progress',key:'evolution-test',id:8,reg:mon.reg||'kanto',level:30,size:1,
        foes:[{id:59,level:30,weight:1}],label:'Evolution-aware training',forcePreparation:true};
    return{s,settings,context};
}

test('an already evolved saved species is scored immediately and invalidates old roster context',()=>{
    const {s,settings}=fixture({uid:'bird',id:396,level:22,reg:'sinnoh'}),foes=[{id:43,level:22,weight:1}];
    const fingerprint=H.rosterFingerprint(s),before=H.planAdventureTeam(s,settings,[],{reg:'sinnoh',foes,size:1,force:true});
    s.mons[0].id=397;
    const after=H.planAdventureTeam(s,settings,[],{reg:'sinnoh',foes,size:1,force:true});
    assert.notEqual(H.rosterFingerprint(s),fingerprint);assert.ok(after.score>before.score);assert.deepEqual(after.uids,['bird']);
});

test('training potential uses reachable evolved stats while preserving the real learner identity',()=>{
    const {s,settings,context}=fixture(),before=JSON.stringify(s),plan=H.preparationPlan(s,settings,context);
    const projected=H.projectEvolution(s,s.mons[0],30),expected=H.planAdventureTeam({...s,mons:[projected]},settings,['learner'],{...context,pool:[projected],force:true});
    assert.equal(projected.id,130);assert.equal(plan.members[0].potentialId,130);
    assert.equal(plan.members[0].id,129);assert.equal(plan.members[0].level,19);assert.equal(plan.targets[0].uid,'learner');assert.equal(plan.targets[0].goal,30);
    assert.ok(Math.abs(plan.selection.quality-expected.score)<1e-10);assert.equal(JSON.stringify(s),before);
});

test('disabling automatic evolution keeps preparation scores on the un-evolved training form',()=>{
    const {s,settings,context}=fixture(),disabled={...settings,autoEvolve:false},plan=H.preparationPlan(s,disabled,context);
    const projected={...s.mons[0],level:30},expected=H.planAdventureTeam({...s,mons:[projected]},disabled,['learner'],{...context,pool:[projected],force:true});
    assert.equal(plan.members[0].potentialId,undefined);assert.equal(plan.members[0].id,129);
    assert.ok(Math.abs(plan.selection.quality-expected.score)<1e-10);
    assert.ok(H.preparationPlan(s,settings,context).selection.quality>plan.selection.quality);
});

test('evolution potential cannot release a currently weak party as if the evolution had happened',()=>{
    const {s,settings,context}=fixture(),plan=H.preparationPlan(s,settings,context);
    const assessment=H.preparationReadiness(s,settings,{...context,forcePreparation:false},s.team);
    assert.equal(plan.needed,true);assert.equal(assessment.ready,false);assert.equal(s.mons[0].id,129);assert.equal(s.mons[0].level,19);
});

test('multistage level evolution is projected without changing the current training species or UID',()=>{
    const {s,settings,context}=fixture({uid:'penguin',id:393,level:8,reg:'sinnoh'});context.level=40;context.foes=[{id:59,level:40,weight:1}];
    const plan=H.preparationPlan(s,settings,context);assert.equal(plan.members[0].potentialId,395);
    assert.equal(plan.members[0].id,393);assert.equal(plan.targets[0].uid,'penguin');assert.equal(plan.targets[0].goal,40);
    assert.equal(s.mons[0].id,393);assert.equal(s.mons[0].level,8);
});

test('regional level limits still cap evolution-aware training instead of assuming maximum evolution level',()=>{
    const {s,settings,context}=fixture();s.adv.chapter=0;s.adv.unlocked=0;s.adv.badges=[];s.travel.to=[];
    const plan=H.preparationPlan(s,settings,context);assert.equal(plan.members[0].goal,20);assert.equal(plan.targets[0].goal,20);
    assert.equal(plan.members[0].potentialId,130);assert.equal(plan.capLimited,true);
});

test('ranked members are not credited with evolution potential unavailable in the native game',()=>{
    const {s,settings,context}=fixture({uid:'ranked',id:129,level:19,rank:1,reg:'kanto'}),plan=H.preparationPlan(s,settings,context);
    assert.equal(plan.members[0].id,129);assert.equal(plan.members[0].potentialId,undefined);assert.equal(plan.targets[0].uid,'ranked');
});

test('forest route alone stays stable, but the grass gym replaces two quadruple weaknesses',()=>{
    // Approximation only: a screenshot does not contain the player's map, rank or full save.
    const ids=[397,400,396,42,74,95,427,459,299,92,433,456,307,433,27,422,417,433,453,403,118,399,63,129,403,393,54];
    const levels=[22,22,22,22,22,22,17,21,22,20,20,19,18,17,19,20,17,17,21,16,16,15,9,10,18,8,16];
    const mons=ids.map((id,i)=>({uid:'m'+i,id,level:levels[i],reg:'sinnoh'}));
    const s={mons,team:mons.slice(0,6).map(mon=>mon.uid),road:mons.slice(0,6).map(mon=>mon.uid),dex:{},stats:{},travel:{to:['johto','hoenn','sinnoh']},adv:{chapter:49,unlocked:49,badges:[],gifts:{},deaths:{}}};
    const settings={...H.DEFAULTS,mode:'progress'},now=1732000000000;
    const foes=H.chapterCombatFoes(s,H.DATA.chapters[49]);
    const route=H.planAdventureTeam(s,settings,[],{now,foes:foes.map(foe=>({...foe,gymCount:0}))});
    assert.equal(route.changed,false);assert.deepEqual(route.uids,s.team);
    const plan=H.planAdventureTeam(s,settings,[],{now});
    assert.equal(plan.changed,true);
    assert.ok(!plan.uids.includes('m4')&&!plan.uids.includes('m5'));
});

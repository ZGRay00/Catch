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

function metalCoatFixture(){
    const onix={uid:'a-onix',id:95,level:16,reg:'johto'};
    const {s,settings,context}=fixture(onix,{team:[],road:[],travel:{to:['johto']}});
    s.mons.push({uid:'z-butterfree',id:12,level:16,reg:'johto',xp:0});
    Object.assign(s.adv,{chapter:14,unlocked:14,badges:[]});
    Object.assign(context,{id:14,level:18,foes:[{id:19,level:15,weight:1}]});
    return {s,settings:{...settings,prepareGap:0},context};
}

test('a locked Metal Coat breaks a training tie until the player owns it or unlocks its shop entry',()=>{
    const {s,settings,context}=metalCoatFixture();
    const plan=(save=s)=>H.preparationPlan(save,settings,context);
    const [onix,butterfree]=s.mons.map(mon=>plan({...s,mons:[mon]}).selection);
    assert.equal(onix.quality,butterfree.quality);
    assert.equal(onix.xp,butterfree.xp);
    assert.equal(plan().targets[0].uid,'z-butterfree');

    const verifyOnix=()=>{
        const before=JSON.stringify(s),learner=plan().targets[0];
        assert.equal(learner.uid,'a-onix');
        assert.equal(learner.id,95);
        assert.equal(learner.potentialId,undefined);
        assert.equal(H.levelEvolution(s,s.mons[0]),null);
        assert.equal(JSON.stringify(s),before);
    };
    s.items['metal-coat']=1;
    verifyOnix();
    s.items['metal-coat']=0;
    s.adv.unlocked=19;
    assert.equal(plan().targets[0].uid,'z-butterfree');
    s.adv.gifts['metal-coat']=true;
    verifyOnix();
});

test('a stronger current form still wins training selection while its evolution item is locked',()=>{
    const {s,settings,context}=metalCoatFixture();
    context.foes=[{id:21,level:15,weight:1}];
    const learner=H.preparationPlan(s,settings,context).targets[0];
    assert.equal(learner.uid,'a-onix');
    assert.equal(learner.id,95);
    assert.equal(learner.potentialId,undefined);
});

test('training projects Golbat at level 22 while the next evolution still requires a Soothe Bell',()=>{
    const {s,settings,context}=fixture({uid:'bat',id:41,level:20,reg:'johto'},{travel:{to:['johto']}});
    Object.assign(s.adv,{chapter:15,unlocked:15,badges:[]});
    Object.assign(context,{id:15,level:24});
    const learner=H.preparationPlan(s,settings,context).targets[0];
    assert.equal(learner.id,41);
    assert.equal(learner.potentialId,42);
    assert.equal(learner.goal,24);
    assert.equal(s.mons[0].id,41);
});

test('the training label distinguishes a locked Metal Coat, an unlocked shop entry and an owned item',()=>{
    const {s,settings,context}=metalCoatFixture();
    const onix=s.mons[0],target={uid:onix.uid,id:onix.id,level:onix.level,goal:context.level};
    const label=()=>H.preparationEvolutionLabel(s,target,{settings});
    assert.match(label(),/金属膜/);
    assert.match(label(),/未解锁/);
    s.adv.unlocked=19;
    assert.match(label(),/未解锁/);
    s.adv.gifts['metal-coat']=true;
    assert.match(label(),/已解锁/);
    s.items['metal-coat']=1;
    assert.match(label(),/持有|背包已有/);
});

test('Electirizer in the other regional bag cannot unlock or satisfy Electabuzz evolution',()=>{
    const mon={uid:'buzz',id:125,level:40,reg:'sinnoh'};
    const {s,settings}=fixture(mon,{link:{from:'hoenn',to:'sinnoh',side:'to',stash:{items:{electirizer:1}}}});
    s.adv.chapter=49;
    const target={uid:mon.uid,goal:42};
    const label=()=>H.preparationEvolutionLabel(s,target,{settings});
    const dex=()=>H.acquisitionSources(s,466).find(row=>row.kind==='evolution'&&row.fromId===125);
    assert.match(label(),/电力增幅器/);
    assert.match(label(),/未解锁/);
    assert.equal(dex().available,false);
    assert.match(dex().detail,/未解锁/);
    s.adv.gifts.electirizer=true;
    assert.match(label(),/已解锁/);
    assert.equal(dex().available,false);
    s.items.electirizer=1;
    assert.match(label(),/持有|背包已有/);
    assert.equal(dex().available,true);
    assert.equal(H.levelEvolution(s,mon),null);
    assert.equal(H.projectEvolution(s,mon,42).id,125);
});

test('Shiny Stone shop access requires both travel to Sinnoh and its opening chapter',()=>{
    const mon={uid:'togetic',id:176,level:40,reg:'johto'};
    const {s,settings}=fixture(mon,{travel:{to:['johto','hoenn']}});
    const target={uid:mon.uid,goal:42};
    const label=()=>H.preparationEvolutionLabel(s,target,{settings});
    s.adv.unlocked=48;
    assert.match(label(),/光之石.*未解锁/);
    s.travel.to.push('sinnoh');
    s.adv.unlocked=47;
    assert.match(label(),/光之石.*未解锁/);
    s.adv.unlocked=48;
    assert.match(label(),/光之石.*已解锁/);
    assert.equal(H.levelEvolution(s,mon),null);
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

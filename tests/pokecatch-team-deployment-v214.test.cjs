const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const foe={id:19,level:50,weight:1};
function training(autoSwitch=true){
    return{mons:[{uid:'carrier',id:65,level:70},{uid:'learner',id:66,level:20}],team:['carrier','learner'],autoSwitch,
        adv:{chapter:3,unlocked:8},travel:{to:[]}};
}
const route={reg:'kanto',foes:[foe]};

test('the current native learning levels prevent crediting an unlearned high-power move',()=>{
    assert.equal(H.DATA.combat.build,'1125894b9a');
    assert.equal(H.MONS.get(6).learn.find(([,key])=>key==='fire-blast')[0],74);
    assert.ok(!H.MONS.get(6).learn.some(([level,key])=>key==='fire-blast'&&level<=70));
});

test('native deployment favors a low-level type counter over a stronger neutral carrier',()=>{
    const s=training();assert.equal(H.deploymentScore(s.mons[0],foe),0);assert.equal(H.deploymentScore(s.mons[1],foe),3.01);
    const actual=H.battleRouteFit(s,route),ordered=H.battleRouteFit({...s,autoSwitch:false},route);
    assert.ok(actual.turns>ordered.turns*2);assert.equal(actual.deaths,1);assert.equal(ordered.deaths,0);
});

test('a wholly pinned training party can put its carrier first when native auto-switch is off',()=>{
    const s=training(false);s.team=['learner','carrier'];
    const plan=H.planAdventureTeam(s,{...H.DEFAULTS,mode:'train'},s.team,{foes:[foe],size:2});
    assert.deepEqual(plan.uids,['carrier','learner']);assert.equal(plan.changed,true);assert.ok(plan.score>plan.currentScore);
    s.team=plan.uids;assert.equal(H.planAdventureTeam(s,{...H.DEFAULTS,mode:'train'},s.team,{foes:[foe],size:2}).changed,false);
});

test('party order alone is left stable when native type selection would choose the same fighter',()=>{
    const s=training();s.team=['learner','carrier'];
    const plan=H.planAdventureTeam(s,{...H.DEFAULTS,mode:'train'},s.team,{foes:[foe],size:2});
    assert.deepEqual(plan.uids,s.team);assert.equal(plan.changed,false);
});

test('native deployment ties use whole-party order on real routes at trainee level and at level 100',()=>{
    const now=1732000000000;
    for(const [chapter,ids,levels] of [[50,[430,402],[26,32]],[65,[197,132],[100,100]]]){
        const mons=ids.map((id,i)=>({id,uid:'m'+i,level:levels[i],reg:'sinnoh'}));
        const s={mons,team:['m0','m1'],autoSwitch:true,adv:{chapter,unlocked:65,badges:['Maître Sinnoh']},travel:{to:['sinnoh']}};
        const row={...H.DATA.chapters[chapter],members:[chapter]},context={row,size:2,objective:'train',now};
        const plan=H.planAdventureTeam(s,H.DEFAULTS,s.team,context);
        assert.deepEqual(plan.uids,['m1','m0'],'keep both protected trainees and improve the actual deployment order');
        assert.ok(plan.score>plan.currentScore);
        assert.ok(H.battleRouteFit(s,row,plan.uids,now).turns<H.battleRouteFit(s,row,s.team,now).turns);
        s.team=plan.uids;
        assert.equal(H.planAdventureTeam(s,H.DEFAULTS,s.team,context).changed,false,'stable on the next tick');
    }
});

test('interchangeable copies preserve party preference, training cost, explicit UIDs and the normal/shiny slot rule',()=>{
    const mons=['a','b','z'].map(uid=>({id:65,uid,level:100}));
    mons.push({...mons[0],uid:'shiny',shiny:true});
    const s={mons,team:['z'],adv:{chapter:3,unlocked:8}},context={foes:[foe],objective:'train',size:2,force:true};
    assert.deepEqual(new Set(H.planAdventureTeam(s,H.DEFAULTS,[],context).uids),new Set(['z','shiny']));
    assert.deepEqual(new Set(H.planAdventureTeam(s,H.DEFAULTS,['b'],context).uids),new Set(['b','shiny']));
    const cheap=H.planAdventureTeam(s,H.DEFAULTS,[],{...context,pool:mons.slice(0,3),size:1,trainingPenalty:1,trainingCosts:{a:1,b:0,z:2}});
    assert.deepEqual(cheap.uids,['b']);
});

test('a full level-100 final-form team can keep all six training UIDs and clear Stark Mountain faster by reordering',()=>{
    const mons=[553,235,579,359,365,510].map((id,i)=>({uid:'m'+i,id,level:100,reg:'sinnoh'}));
    const s={mons,team:mons.map(m=>m.uid),autoSwitch:true,adv:{chapter:65,unlocked:83,badges:['Maître Sinnoh']},travel:{to:['sinnoh']}};
    const now=1732000000000,row={...H.DATA.chapters[65],members:[65]};
    const p=H.planAdventureTeam(s,H.DEFAULTS,s.team,{row,objective:'train',now});
    const before=H.battleRouteFit(s,row,s.team,now),after=H.battleRouteFit(s,row,p.uids,now);
    assert.deepEqual(new Set(p.uids),new Set(s.team));
    assert.ok(after.turns<before.turns*.8);
    assert.equal(after.deaths,0);
});

test('overkill capping retains the native selected move rather than inventing a more accurate one',()=>{
    const mon=training().mons[0],a=H.effectiveStats(mon),b=H.effectiveStats(foe);
    const selected=H.expectedDamage(mon,foe,a,b,{details:true}),capped=H.expectedDamage(mon,foe,a,b,{capDamage:true});
    assert.equal(selected.type,'psychic');assert.ok(Math.abs(selected.accuracy-0.8545454545454545)<1e-10);
    assert.ok(selected.hit>b.hp);assert.ok(Math.abs(capped-b.hp*selected.accuracy)<1e-9);
    assert.ok(capped<b.hp*.9,'the lower-power 98% accuracy move is not silently substituted');
});

test('current status stat penalties affect both outgoing damage and the defending category',()=>{
    const physical={id:68,level:80},target={id:113,level:80},a=H.effectiveStats(physical),b=H.effectiveStats(target);
    const plain=H.expectedDamage(physical,target,a,b),burn=H.expectedDamage({...physical,status:'burn'},target,a,b);
    assert.ok(burn<plain*.8&&burn>plain*.7);
    assert.ok(H.expectedDamage(physical,{...target,status:'sleep'},a,b)>plain*1.2);
    const special={id:65,level:80},enemy={id:68,level:80},stats=H.effectiveStats(special),defense=H.effectiveStats(enemy);
    assert.ok(H.expectedDamage({...special,status:'poison'},enemy,stats,defense)<H.expectedDamage(special,enemy,stats,defense));
});

test('a slow fighter that is knocked out before attacking is not treated as an ideal counter',()=>{
    const s={mons:[{uid:'slow',id:10,level:5}],team:['slow'],adv:{chapter:0,unlocked:8}},hard={reg:'kanto',foes:[{id:150,level:100,weight:1}]};
    const fit=H.battleRouteFit(s,hard);assert.ok(fit.coverage<.001,'only the tiny chance of an enemy miss can give the weak member a turn');assert.equal(fit.factor,.02);assert.ok(Number.isFinite(fit.turns));
});

test('no damaging moves on either side produce a finite conservative route estimate',()=>{
    const s={mons:[{uid:'idle',id:63,level:1}],team:['idle'],adv:{chapter:0,unlocked:0}};
    const fit=H.battleRouteFit(s,{reg:'kanto',foes:[{id:63,level:1,weight:1}]});
    assert.equal(fit.coverage,0);assert.equal(fit.factor,.02);assert.ok(Number.isFinite(fit.turns));
});

test('route cache results cannot be corrupted by a consumer changing the returned estimate',()=>{
    H.clearTeamCache();const s=training(),before=H.battleRouteFit(s,route),expected={...before};before.turns=0;before.coverage=0;
    assert.deepEqual(H.battleRouteFit(s,route),expected);
});

test('route estimates follow real level and auto-switch changes while ignoring unrelated XP ticks',()=>{
    const s=training(),initial=H.battleRouteFit(s,route);s.mons[1].xp=123;assert.deepEqual(H.battleRouteFit(s,route),initial);
    s.autoSwitch=false;const ordered=H.battleRouteFit(s,route);assert.ok(ordered.turns<initial.turns);
    s.mons[0].level=5;assert.ok(H.battleRouteFit(s,route).turns>ordered.turns);
});

test('candidate refinement leaves no improving same-slot replacement under fixed deployment order',()=>{
    const s={mons:[6,9,65,68,94,143,149].map((id,i)=>({uid:'m'+i,id,level:50})),team:[],autoSwitch:false,adv:{chapter:3,unlocked:8}};
    const context={foes:[{id:9,level:50,weight:1},{id:68,level:50,weight:1}],size:2,objective:'money',force:true};
    const plan=H.planAdventureTeam(s,H.DEFAULTS,[],context),members=plan.uids.map(uid=>s.mons.find(m=>m.uid===uid));
    for(let slot=0;slot<members.length;slot++)for(const candidate of s.mons){
        if(members.some((m,i)=>i!==slot&&m.uid===candidate.uid))continue;
        const trial=members.map((m,i)=>i===slot?candidate:m),value=H.planAdventureTeam({...s,mons:trial,team:trial.map(m=>m.uid)},H.DEFAULTS,trial.map(m=>m.uid),context);
        assert.ok(plan.score>=value.currentScore-1e-8,`${slot}: ${candidate.id}`);
    }
});

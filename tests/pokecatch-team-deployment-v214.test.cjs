const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const foe={id:19,level:50,weight:1};
function training(autoSwitch=true){
    return{mons:[{uid:'carrier',id:65,level:70},{uid:'learner',id:66,level:20}],team:['carrier','learner'],autoSwitch,
        adv:{chapter:3,unlocked:8},travel:{to:[]}};
}
const route={reg:'kanto',foes:[foe]};

test('the current native learning levels prevent crediting an unlearned high-power move',()=>{
    assert.equal(H.DATA.combat.build,'1a16948eef');
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

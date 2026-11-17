const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const NOW=Date.parse('2026-11-17T12:00:00Z'),WEEK='2026-11-16';
function fixture(t){
    const old=Date.now;Date.now=()=>NOW;t.after(()=>{Date.now=old;});
    return{mons:[],team:[],road:[],money:1000,dex:{},stats:{},travel:{to:['johto','hoenn','sinnoh']},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:65,badges:[],deaths:{},loops:[]},tower:{},under:{slots:[]}};
}
const mon=(uid,id,level=100,extra={})=>({uid,id,level,reg:'kanto',...extra});
const settings=()=>({...H.DEFAULTS,mode:'tower',autoPrepare:true,optimizeRaid:true,prepareMargin:2,prepareGap:3});
function coach(s){
    const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const e=new H.Engine(storage,settings());e.persist=()=>{};return e;
}

test('tower progress uses UTC Monday, next-floor run state and this-week records',t=>{
    const s=fixture(t);s.tower={best:{week:WEEK,floor:20},run:{week:WEEK,floor:24,mons:[]}};
    const info=H.towerProgress(s,NOW);assert.equal(info.week,WEEK);assert.equal(info.floor,24);assert.equal(info.cleared,23);assert.equal(info.best,20);assert.equal(info.paused,true);assert.equal(info.expired,false);
    s.adv.tower={back:0};assert.equal(H.towerProgress(s,NOW).paused,false);
    assert.equal(H.towerWeek(Date.parse('2026-11-22T23:59:59Z')),WEEK);assert.equal(H.towerWeek(Date.parse('2026-11-23T00:00:00Z')),'2026-11-23');
});

test('expired runs and previous-week high scores do not supply current tower progress',t=>{
    const s=fixture(t);s.tower={best:{week:'2026-11-09',floor:150},run:{week:'2026-11-09',floor:151,mons:[]}};
    const info=H.towerProgress(s,NOW);assert.equal(info.run,null);assert.equal(info.best,0);assert.equal(info.cleared,0);assert.equal(info.expired,true);assert.deepEqual(H.towerParty(s,{snapshot:true}),[]);
});

test('tower launch order uses raw native HP rather than battle HP multipliers',t=>{
    const s=fixture(t);s.mons=[mon('jigglypuff',39,50),mon('bulbasaur',1,50)];
    assert.deepEqual(H.towerParty(s).map(m=>m.uid),['bulbasaur','jigglypuff']);
    assert.ok(Object.values(H.effectiveStats(s.mons[0])).reduce((a,b)=>a+b,0)>Object.values(H.effectiveStats(s.mons[1])).reduce((a,b)=>a+b,0),'battle-HP-based totals would incorrectly reverse this pair');
});

test('fresh tower snapshots copy rank, shiny and taste but do not copy source damage or boosted-stat fields',t=>{
    const s=fixture(t);s.mons=[mon('normal',6,80,{hp:0,statMult:99,hpMult:99}),mon('shiny',6,80,{shiny:true}),mon('ranked',9,80,{rank:3,taste:{h:'atk',up:{spa:25}}})];
    const party=H.towerParty(s);assert.equal(party[0].uid,'ranked');assert.equal(party.find(m=>m.id===6).uid,'shiny');assert.equal(party.length,2);
    const fresh=party[0];assert.equal(fresh.rank,3);assert.equal(fresh.taste.up.spa,25);assert.equal(fresh.hp,undefined);assert.equal(fresh.statMult,undefined);assert.equal(fresh.hpMult,undefined);
});

test('tower deduplicates normal, shiny and special forms by the native species identity',t=>{
    const s=fixture(t);s.mons=[mon('base',386,90),mon('form',38601,90),mon('pikachu',25,90),mon('shiny-pikachu',25,90,{shiny:true})];
    const party=H.towerParty(s);assert.equal(party.filter(m=>H.DATA.combat.singles[m.id]===386).length,1);assert.equal(party.filter(m=>m.id===25).length,1);assert.equal(party.length,2);
});

test('tower includes underground members, excludes daycare parents and excludes the disconnected destination side',t=>{
    const s=fixture(t);s.link={from:'hoenn',to:'unova',side:'to'};
    s.mons=[mon('main',6,80),mon('destination',643,100,{reg:'unova'})];s.under.slots=[{mons:[mon('underground',150,100,{reg:'sinnoh'})]}];s.pension={mons:[{mon:mon('parent',493,100)}]};
    assert.deepEqual(H.towerParty(s).map(m=>m.uid),['underground','main']);
});

test('tower resting threshold uses base floor level minus ten, including on boss floors',t=>{
    const s=fixture(t);s.mons=[mon('boundary',6,53),mon('rested',150,52)];
    assert.deepEqual(H.towerParty(s,{floor:10}).map(m=>m.uid),['boundary']);
    const context=H.battleContext(s,'tower',{floor:10});assert.equal(context.level,66);assert.equal(context.size,6);
});

test('tower snapshots retain native order, attrition and source identity instead of sorting their live PC replacements',t=>{
    const s=fixture(t);s.mons=[mon('a',150),mon('b',6)];
    s.tower.run={week:WEEK,floor:1,mons:[mon('t:b',6,80,{src:'b',hp:200}),mon('t:a',150,100,{src:'a',hp:0}),mon('t:rest',9,39,{src:'rest',hp:100})]};
    const party=H.towerParty(s,{snapshot:true});assert.deepEqual(party.map(m=>m.uid),['b']);assert.equal(party[0].towerUid,'t:b');assert.equal(party[0].hp,200);
});

test('tower preparation targets the native leading six, leaving hypothetical low-level counters alone',t=>{
    const s=fixture(t);s.mons=[143,248,149,9,6,3].map((id,i)=>mon('ready-'+i,id));s.mons.push(mon('unused-low-level',150,10));s.team=s.mons.slice(0,6).map(m=>m.uid);
    const context=H.battleContext(s,'tower',{floor:100}),plan=H.preparationPlan(s,settings(),context),actual=H.towerParty(s);
    assert.deepEqual(plan.members.map(m=>m.uid),actual.map(m=>m.uid));assert.deepEqual(plan.targets,[]);assert.equal(plan.needed,false);assert.equal(plan.selection.source,'native-tower');
});

test('an unrelated improved bench member cannot interrupt the current surviving tower snapshot',t=>{
    const s=fixture(t);s.mons=[143,248,149,9,6,3,150].map((id,i)=>mon('member-'+i,id));s.team=s.mons.slice(0,6).map(m=>m.uid);s.adv.tower={back:0};
    s.tower.run={week:WEEK,floor:1,mons:s.mons.map((m,i)=>({...m,uid:'t:'+m.uid,src:m.uid,level:i===6?50:100,hp:200}))};
    const e=coach(s),context=H.battleContext(s,'tower',{floor:100});assert.equal(e.coach.ensure(s,context,{},NOW),false);assert.equal(e.preparation,null);
});

test('a stale actual tower starter is refreshed after its live source has already reached the desired level',t=>{
    const s=fixture(t);s.mons=[143,248,149,9,6,3].map((id,i)=>mon('member-'+i,id));s.team=s.mons.map(m=>m.uid);s.adv.tower={back:0};
    s.tower.run={week:WEEK,floor:1,mons:s.mons.map((m,i)=>({...m,uid:'t:'+m.uid,src:m.uid,level:i===0?90:100,hp:200}))};
    const e=coach(s),context=H.battleContext(s,'tower',{floor:100});assert.equal(e.coach.ensure(s,context,{},NOW),true);assert.equal(e.preparation.restartTower,true);assert.deepEqual(e.preparation.targets,[]);
});

test('tower preparation reevaluates when attrition brings a previously unused low-level reserve into the native first six',t=>{
    const s=fixture(t);s.mons=[143,248,149,9,6,3,150].map((id,i)=>mon('member-'+i,id,i===6?60:100));s.team=s.mons.slice(0,6).map(m=>m.uid);s.adv.tower={back:0};
    s.tower.run={week:WEEK,floor:1,mons:s.mons.map(m=>({...m,uid:'t:'+m.uid,src:m.uid,hp:200}))};
    const e=coach(s),context=H.battleContext(s,'tower',{floor:100});assert.equal(e.coach.ensure(s,context,{},NOW),false);
    s.tower.run.mons[0].hp=0;
    assert.equal(e.coach.ensure(s,context,{},NOW+1200),true);assert.ok(e.preparation.targets.some(mon=>mon.uid==='member-6'));
});

test('tower preparation uses the connected origin region even when the adventure currently visits the isolated destination',t=>{
    const s=fixture(t);s.link={from:'hoenn',to:'unova',side:'to'};s.adv.chapter=66;
    const context=H.battleContext(s,'tower',{floor:100});assert.equal(context.reg,'hoenn');
});

test('LevelCoach ignores an expired active tower snapshot while the facility state machine settles it',t=>{
    const s=fixture(t);s.adv.tower={back:0};s.tower.run={week:'2026-11-09',floor:100,mons:[]};assert.equal(coach(s).coach.activity(s),null);
});

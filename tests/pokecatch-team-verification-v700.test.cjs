'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../pokecatch-helper/src/models/combat-team.js'),'utf8');

function fixture(){
    const stats=value=>({hp:value,atk:value,def:value,spa:value,spd:value,spe:value});
    const mons=Array.from({length:65},(_,i)=>({uid:`u${i+1}`,id:i+1,level:50,reg:'kanto',...(i===64?{damageMult:1.5}:{})}));
    const enemy={id:100,level:50,weight:1};
    const MONS=new Map(mons.map(mon=>[mon.id,{id:mon.id,name:mon.uid,types:['normal'],learn:[[1,'tackle']],stats:stats(mon.id===65?90:100)}]));
    MONS.set(100,{id:100,name:'fixture enemy',types:['normal'],learn:[[1,'tackle']],stats:{hp:100,atk:20,def:100,spa:20,spd:100,spe:1}});
    const state={mons,team:['u1'],autoSwitch:true,adv:{chapter:0}},settings={mode:'money',autoTeam:true,activeSwitch:false};
    const ctx={foes:[enemy],size:1,objective:'money',force:true,now:0};
    const scope={
        MONS,DATA:{build:'fixture',types:{normal:{fr:'一般'}},chart:{normal:{}},combat:{rankStat:1.2,hpMax:3,hpScale:1,hpBoost:1,
            levelGap:1.02,moves:{tackle:{cat:'phys',type:'normal',power:80,acc:100}},singles:{}}},
        CHAPTERS:new Map(),WEATHER_DATA:{chapters:[],slotMs:3600000},
        clamp:(value,min,max,defaultValue)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):defaultValue,
        tasteMultiplier:()=>1,tasteProfile:()=>'',partyMons:s=>s.team.map(uid=>s.mons.find(mon=>mon.uid===uid)).filter(Boolean),
        currentRegion:()=> 'kanto',teamEligible:(_s,mon,reg)=>MONS.has(mon.id)&&mon.reg===reg,trainingCap:()=>100,
        eligibleRoster:(s,reg)=>s.mons.filter(mon=>MONS.has(mon.id)&&mon.reg===reg),
        rosterIndex:()=>({duplicates:new Set()}),
        weatherDamageContext:()=>({}),chapterWeather:()=>({}),phaseAt:()=> 'day',
    };
    return{model:vm.runInNewContext(source+'\n;({planAdventureTeam,adventureTeamSearch})',scope),state,settings,ctx,MONS};
}

test('certification recovers a low-screening candidate and binds the exact UID and score',()=>{
    const {model,state,settings,ctx}=fixture();
    // This is the lower-panel candidate from the damage-multiplier counterexample.
    const reference=model.planAdventureTeam(state,settings,['u65'],ctx);
    const best=model.planAdventureTeam(state,settings,[],{...ctx,verifyAll:true});
    assert.deepEqual([...best.uids],['u65']);
    assert.equal(best.verification.status,'verified');assert.equal(best.verification.total,65);
    assert.deepEqual([...best.verification.uids],[...best.uids]);
    assert.equal(best.verification.score,reference.score);assert.equal(best.selectedScore,reference.score);
    assert.equal(best.verification.members[0].uid,'u65');
});

test('full-pool verification recovers a fast candidate beyond the shortlist',()=>{
    const {model,state,settings,ctx,MONS}=fixture();
    delete state.mons[64].damageMult;
    MONS.get(65).stats.spe=250;
    for(const id of [3,4,5,6])Object.assign(MONS.get(id).stats,{spe:300,atk:1});
    Object.assign(MONS.get(100).stats,{hp:1,def:35,spd:35,spe:120,atk:10000});
    const initial=model.planAdventureTeam(state,settings,[],ctx);
    assert.notEqual(initial.uids[0],'u65');
    const verified=model.planAdventureTeam(state,settings,[],{...ctx,verifyAll:true});
    assert.deepEqual([...verified.uids],['u65']);
    assert.equal(verified.verification.status,'verified');
    assert.ok(verified.verification.passes>=2,'rechecks every candidate after the improvement');
    assert.ok(verified.score>initial.score);
});

test('sliced certification distinguishes pending work from final verification',()=>{
    const {model,state,settings,ctx}=fixture();
    const search=model.adventureTeamSearch(state,settings,[],{...ctx,verifyAll:true,progressive:true},true);
    let result,checking=false;
    while(!(result=search.next()).done){
        assert.notEqual(result.value?.verification?.status,'verified');
        if(result.value?.verification?.status==='checking'){
            checking=true;assert.ok(result.value.verification.checked<result.value.verification.total);
        }
    }
    assert.ok(checking);assert.equal(result.value.verification.status,'verified');
    assert.deepEqual([...result.value.verification.uids],['u65']);
});

test('strict planning preserves pins and refuses ambiguous UIDs or uncovered opponents',()=>{
    const {model,state,settings,ctx}=fixture(),strict={...ctx,verifyAll:true};
    const pinned=model.planAdventureTeam(state,settings,['u4'],strict);
    assert.deepEqual([...pinned.uids],['u4']);assert.equal(pinned.verification.members[0].role,'pinned');
    const ambiguous={...state,mons:[...state.mons,{...state.mons[0],id:2}]};
    assert.equal(model.planAdventureTeam(ambiguous,settings,[],strict).verification.status,'unavailable');
    assert.equal(model.planAdventureTeam(state,settings,[],{...strict,foes:[{id:9999,level:50,weight:1}]}).verification.status,'unavailable');
});

test('bounded pair search escapes a full single-challenge local optimum',()=>{
    const H=require('../Pokecatch自动助手.user.js');
    const members=[[524,70],[573,97],[226,85],[382,68],[44,72],[506,88],[429,73],[463,81],[358,74],[98,83]];
    const encounters=[[98,87,6,1,0],[506,89,2,1,1],[344,82,4,1,0],[253,83,1,1,1],[358,71,1,0,0],[92,90,4,0,1]];
    const s={adv:{chapter:6,unlocked:8},dex:{},items:{},travel:{to:[]},team:['m0','m1'],autoSwitch:true,
        mons:members.map(([id,level],i)=>({uid:'m'+i,id,level,reg:'kanto'}))};
    const foes=encounters.map(([id,level,weight,gymCount,chapter])=>({id,level,weight,gymCount,chapter}));
    const context={foes,now:Date.UTC(2026,10,23,4),objective:'train',force:true,size:2,verifyAll:true};
    const settings={...H.DEFAULTS,mode:'train',autoTeam:true,activeSwitch:false};
    // Training scoring is identical here. The elite context enables the
    // bounded pair search in addition to the same full single challenge.
    const onlySingles=H.planAdventureTeam(s,settings,[],{...context,kind:'map'});
    const pair=H.planAdventureTeam(s,settings,[],{...context,kind:'elite'});
    assert.equal(onlySingles.verification.status,'verified');assert.equal(pair.verification.status,'verified');
    assert.ok(pair.selectedScore>onlySingles.selectedScore*1.1);
    assert.ok(pair.uids.every(uid=>!onlySingles.uids.includes(uid)));
});

test('small eligible expedition enumerates every legal trio and rejects incomplete groups',()=>{
    const H=require('../Pokecatch自动助手.user.js');
    const mons=[150,382,483,248,530].map((id,i)=>({uid:'m'+i,id,level:100,reg:'sinnoh'}));
    const s={mons,team:[],adv:{chapter:65,unlocked:65,badges:[]},under:{next:['crystal']}};
    const cfg={...H.DEFAULTS,underGoal:'depth'};
    const compute=pool=>H.planAdventureTeam(s,cfg,[],{...H.undergroundTeamContext(s,cfg,0,100,pool),verifyAll:true});
    const full=compute(mons),short=compute(mons.slice(0,2));
    assert.equal(full.verification.status,'exhaustive');assert.equal(full.verification.attempts,10);
    assert.equal(full.verification.uids.length,3);
    assert.equal(short.verification.status,'unavailable');assert.equal(short.uids.length,0);
});

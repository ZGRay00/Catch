'use strict';
// Optional: node tests/pokecatch-nursery-wire-native-v410.cjs PUBLIC_APP_JS
// Exercises only a downloaded public bundle in a synthetic VM. No personal save or network access.
const assert=require('node:assert/strict'),path=require('node:path');
const H=require('../Pokecatch自动助手.user.js'),nativeRuntime=require('../tools/pokecatch-native-vm.cjs');
assert.ok(process.argv[2],'Pass a downloaded public bundle');
const runtime=nativeRuntime(process.argv[2]);
const sample=JSON.parse(runtime.run(`JSON.stringify((()=>{
    const N=__pcResearch,G=N.Game;G.load();N.Adventure.ensure();G.stopSaving();
    const initial={own:Object.hasOwn(G.S.stats||{},'hatched'),value:G.S.stats?.hatched??null};
    const state=structuredClone(G.S);state.trainer={...state.trainer,id:'synthetic-wire-nursery',since:1700000000000};
    state.mons=[];state.team=[];state.road=[];state.dex={};state.seenShiny={};
    state.adv={...state.adv,chapter:66,unlocked:83};state.travel={to:['johto','hoenn','sinnoh','unova']};
    state.stats={...state.stats,hatched:0};
    state.pension={laid:333,bx:1,egg:123456,eggGoal:14400000,tick:1700000000000,
        open:{eggs:4,slots:4},mons:[
            {mon:{uid:'wire-fire',id:6,level:80,shiny:false},candy:2},
            {mon:{uid:'wire-ditto',id:132,level:80,shiny:true},candy:3},
            {mon:{uid:'wire-water',id:9,level:80,shiny:true},candy:4}],
        eggs:[
            {uid:'wire-new-sp2',id:25,k:330,sp:2,bx:1,reg:'kanto',laidAt:1700000000000,hatchAt:1700014400000},
            {uid:'wire-new-plain',id:4,k:331,reg:'kanto',laidAt:1700000000001,hatchAt:1700014400001},
            {uid:'wire-old-sp1',id:7,sp:1,bx:1,reg:'kanto',laidAt:1700000000002,hatchAt:1700014400002},
            {uid:'wire-saved',id:1,shiny:false,laidAt:1700000000003,hatchAt:1700014400003}]};
    if(N.SaveWire.FMT!==2)throw Error('Review changed native wire format');
    const original=structuredClone(state),packed=N.SaveWire.pack(state),native=N.SaveWire.unpack(structuredClone(packed));
    return{initial,state:original,packed,native};
})())`));
assert.deepEqual(sample.initial,{own:true,value:0},'Fresh native saves must initialize the hatch counter to zero');
assert.equal(sample.packed.fmt,2,'Fixture must actually exercise the compact save decoder');
const before=JSON.stringify(sample.packed),decoded=H.decodeSave(sample.packed);
assert.equal(JSON.stringify(sample.packed),before,'Decoding must not alter the native packed payload');
assert.deepEqual(decoded.pension,sample.state.pension,'Counters, berry state, parent slots and all egg flags survive native packing');
assert.deepEqual(decoded.pension,sample.native.pension,'Pension fields match native unpack');
assert.deepEqual(decoded.trainer,sample.state.trainer,'Trainer seed survives compact save transport');
assert.equal(decoded.stats.hatched,0);
const outcomes=state=>state.pension.eggs.map(egg=>H.eggOutcome(state,egg,{build:H.NURSERY_RULES.build}));
assert.deepEqual(outcomes(decoded),outcomes(sample.state),'Saved, sequence and legacy outcomes stay identical across wire transport');
assert.ok(outcomes(decoded).every(row=>row.known),'All four outcome branches in this verified-build fixture are deterministic');
const forecast=state=>H.nurseryForecast(state,{build:H.NURSERY_RULES.build,limit:1024,count:3});
assert.deepEqual(forecast(decoded),forecast(sample.state),'Current mixed-parent forecast remains identical after FMT2 decoding');
assert.deepEqual(forecast(decoded),forecast(sample.native),'Forecast agrees with native-unpacked state');
assert.equal(forecast(decoded).known,true);

// A real save read takes the same JSON path as a player's compact autosave.
const memory=new Map([['gachamon-save-v1',before]]);
const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const engine=new H.Engine(storage);
assert.deepEqual(engine.read().pension,sample.native.pension);
assert.equal(storage.getItem('gachamon-save-v1'),before);

// Compare regularly ticking the nursery with one catch-up tick after 24 hours.
// Use the native clocks, egg generator, maturity check, claim and SaveWire codec.
const ticks=JSON.parse(runtime.run(`JSON.stringify((()=>{
    const N=__pcResearch,G=N.Game,baseTime=1700000000000,hour=3600000;
    let now=baseTime;
    N.Clock={now:()=>now,sure:true};
    function simulate(interval){
        const state=structuredClone(G.S);
        state.trainer={...state.trainer,id:'synthetic-catchup',since:baseTime};
        state.adv={...state.adv,chapter:66,unlocked:83,badges:['Cascade']};
        state.travel={to:['johto','hoenn','sinnoh','unova']};
        state.mons=[];state.team=[];state.road=[];state.dex={};state.seenShiny={};
        state.stats={...state.stats,hatched:0};
        state.pension={laid:57,bx:1,egg:0,tick:baseTime,open:{eggs:4,slots:4},
            mons:[{mon:{uid:'parent',id:6,shiny:true,reg:'kanto',level:80},candy:0},{mon:{uid:'ditto',id:132,reg:'kanto',level:80},candy:0}],eggs:[]};
        return G.sandbox(state,()=>{
            now=baseTime;
            let candies=0;
            for(let elapsed=interval;elapsed<=24*hour;elapsed+=interval){
                now=baseTime+elapsed;
                for(const reward of G.pensionTick(now))if(reward.type==='candy')candies+=reward.n;
            }
            const eggs=state.pension.eggs.map(egg=>({id:egg.id,k:egg.k,sp:egg.sp,bx:!!egg.bx,laidAt:egg.laidAt,hatchAt:egg.hatchAt}));
            const beforeClaim=N.SaveWire.pack(structuredClone(state)),first=state.pension.eggs[0];
            const boundary=[G.eggReady(first,first.hatchAt-1),G.eggReady(first,first.hatchAt)];
            const claim=G.hatchEgg(first.uid);now+=1000;G.pensionTick(now);
            return {eggs,candies,beforeClaim,boundary,claimed:!!claim&&!claim.error,afterClaim:N.SaveWire.pack(structuredClone(state))};
        });
    }
    return {online:simulate(hour),offline:simulate(24*hour)};
})())`));
assert.deepEqual(ticks.offline.eggs,ticks.online.eggs,'Hitting the nursery every hour or catching up at once lays the same four numbered eggs at the same times');
assert.deepEqual(ticks.offline.eggs.map(egg=>egg.k),[57,58,59,60]);
assert.deepEqual(ticks.offline.eggs.map(egg=>egg.sp),[2,2,2,2]);
assert.deepEqual(ticks.offline.eggs.map(egg=>egg.bx),[true,false,false,false]);
assert.equal(ticks.online.candies,3*ticks.offline.candies,'Only parent candy is capped at eight hours per catch-up');
for(const run of [ticks.online,ticks.offline]){
    assert.deepEqual(run.boundary,[false,true]);assert.equal(run.claimed,true);
    memory.set('gachamon-save-v1',JSON.stringify(run.beforeClaim));
    const full=engine.read();
    assert.equal(full.stats.hatched,0,'Reaching maturity alone does not count a hatch');
    assert.equal(full.pension.egg,4*3600000,'A full incubator banks at most one next egg');
    memory.set('gachamon-save-v1',JSON.stringify(run.afterClaim));
    const collected=engine.read();
    assert.equal(collected.stats.hatched,1);
    assert.deepEqual(collected.pension.eggs.map(egg=>egg.k),[58,59,60,61],'First free slot consumes the banked progress');
    const mon=collected.mons.find(member=>member.uid===full.pension.eggs[0].uid);
    assert.ok(mon);assert.equal(mon.ek,57);assert.equal(mon.esp,2);assert.equal(mon.ebx,1);
    assert.equal(mon.egg,true);assert.equal(typeof mon.shiny,'boolean','Native hatch outcome survives compact PC transport');
}
const receipts=JSON.parse(runtime.run(`JSON.stringify([false,true].map(wanted=>{
    const N=__pcResearch,G=N.Game,state=structuredClone(G.S);
    state.trainer={id:'synthetic-compact-receipt',since:1700000000000};
    state.mons=[];state.team=[];state.road=[];state.dex={};state.seenShiny={};
    state.stats={...state.stats,hatched:0};state.pension={eggs:[],mons:[]};
    return G.sandbox(state,()=>{
        const egg={uid:'compact-hatched-'+wanted,k:0,id:4,sp:2,bx:1,reg:'kanto',laidAt:1700000000000,hatchAt:1700014400000};
        while(egg.k<10000&&(G.fixedRoll('egg',egg.k)<G.eggRate(egg))!==wanted)egg.k++;
        state.pension.eggs=[egg];
        const result=G.hatchEgg(egg.uid);if(!result?.mon)throw Error('Expected a new PC member');
        return {uid:egg.uid,k:egg.k,packed:N.SaveWire.pack(structuredClone(state))};
    });
}))`));
for(const [index,receipt] of receipts.entries()){
    memory.set('gachamon-save-v1',JSON.stringify(receipt.packed));
    const mon=engine.read().mons.find(member=>member.uid===receipt.uid);
    assert.ok(receipt.k<10000);assert.ok(mon);assert.equal(mon.egg,true);assert.equal(mon.ek,receipt.k);
    assert.equal(mon.esp,2);assert.equal(mon.ebx,1);assert.equal(mon.shiny,Boolean(index));
}
console.log(JSON.stringify({pass:true,wireFormat:2,eggs:decoded.pension.eggs.length,mixedParents:decoded.pension.mons.length,freshNativeHatched:sample.initial.value,
    ordinaryAndShinyReceipts:receipts.length,offlineElapsedHours:24,source:path.basename(process.argv[2])}));

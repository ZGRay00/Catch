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
console.log(JSON.stringify({pass:true,wireFormat:2,eggs:decoded.pension.eggs.length,mixedParents:decoded.pension.mons.length,freshNativeHatched:sample.initial.value,source:path.basename(process.argv[2])}));

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {wildShinyForecast}=require('../../Pokecatch自动助手.user.js');
const latest='6e904dfeb4';
const save=()=>({trainer:{id:'wild-test',since:123},dex:{},adv:{chapter:0,speed:1,nodes:[{type:'wild'},{type:'heal'},{type:'trainer',size:2},{type:'wild'}]}});

// Reference indices from Game.fixedRoll('wild', i) in the audited game bundle.
test('verified builds agree with native rolls, including overlaps, advancement and rewind',()=>{
    for(const bundle of [latest,'f467030697','a736e7726c']){
        const s=save(),cache={};
        for(const [counter,natural,berry,berryOnly] of [[0,3328,283,283],[282,3046,1,1],[3327,1,1,678],[3328,784,677,677],[0,3328,283,283]]){
            s.wildN=counter;
            const f=wildShinyForecast(s,bundle,0,cache);
            assert.deepEqual([f.natural,f.berry,f.berryOnly],[natural,berry,berryOnly]);
            assert.equal(s.wildN,counter);
        }
        s.wildN=0;s.dex=Object.fromEntries(Array.from({length:151},(_,i)=>[i+1,{}]));
        assert.equal(wildShinyForecast(s,bundle,0,cache).natural,283);
        s.adv.chapter=14;assert.equal(wildShinyForecast(s,bundle,0,cache).natural,3328);
        s.trainer.id='another';
        assert.deepEqual(wildShinyForecast(s,bundle,0,cache),wildShinyForecast(s,bundle,0));
    }
});

test('legacy initialization, active berry expiry and route speed are independent',()=>{
    const s=save();
    s.stats={battles:282};s.buffs={shiny:{key:'starf-berry',until:60000}};
    const slow=wildShinyForecast(s,latest,10000);
    assert.equal(slow.berry,1);assert.equal(slow.remainingMs,50000);
    assert.equal(slow.seconds,9*2.8/2);
    s.adv.speed=4;
    const fast=wildShinyForecast(s,latest,60000);
    assert.ok(Math.abs(fast.seconds-slow.seconds/2.5)<1e-10);assert.equal(fast.remainingMs,0);
    assert.equal(fast.berry,slow.berry);assert.equal(s.wildN,undefined);
    s.adv.badges=['Maître Johto'];s.adv.nodes=[{type:'wild',roamer:243},{type:'static'}];
    assert.equal(wildShinyForecast(s,latest).seconds,null);
    s.wildN=0;assert.equal(wildShinyForecast(s,latest).berry,283);
});

test('map ETA stops at spawning the target, skipping a generated battle and wrapping full laps',()=>{
    const s=save();
    s.wildN=282;
    const forecast=()=>wildShinyForecast(s,latest);
    assert.equal(forecast().wildPerLap,2);
    assert.equal(forecast().times.berry,2.8);
    s.adv.node=0;s.adv.battle={enemies:[{hp:5}]};
    assert.equal(forecast().times.berry,6*2.8);
    s.adv.node=3;
    assert.equal(forecast().times.berry,3*2.8);
    s.adv.node=4;delete s.adv.battle;
    assert.equal(forecast().times.berry,2*2.8);
    s.wildN=280;s.adv.node=0;
    assert.equal(forecast().times.berry,10*2.8);
    s.adv.speed=4;assert.ok(Math.abs(forecast().times.berry-10*2.8/2.5)<1e-10);
});

test('only eligible wild nodes count, and unknown rules still yield labelled reference predictions',()=>{
    const s=save();s.wildN=282;
    s.adv.nodes=[{type:'gym'},{type:'static'},{type:'trainer'},{type:'wild',roamer:243},{type:'wild',phenom:true}];
    const cache={};
    const forecast=b=>wildShinyForecast(s,b,0,cache);
    assert.equal(forecast(latest).wildPerLap,2);
    s.adv.badges=['Maître Johto'];assert.equal(forecast(latest).wildPerLap,1);
    s.roam={caught:[243]};assert.equal(forecast(latest).wildPerLap,2);
    for(const bundle of ['abcdefabcd',null]){
        const f=forecast(bundle);assert.equal(f.verified,false);assert.equal(f.berry,1);
        assert.equal(f.times.berry,forecast(latest).times.berry);
    }
    delete s.wildN;s.stats={battles:282};
    assert.equal(forecast(null).legacyCounter,true);assert.equal(forecast(null).berry,1);
    assert.equal(forecast('a736e7726c').verified,true);
});

test('rejects special battles, missing identity, invalid counters and pre-counter builds',()=>{
    const s=save();
    for(const key of ['event','zone','tower','league'])assert.ok(wildShinyForecast({...s,adv:{...s.adv,[key]:{}}},latest).error);
    assert.ok(wildShinyForecast(s,'e2eb68ec8c').error);
    assert.ok(wildShinyForecast({...s,trainer:{}},latest).error);
    for(const wildN of [-1,2.5,Number.MAX_SAFE_INTEGER])assert.ok(wildShinyForecast({...s,wildN},latest).error);
});

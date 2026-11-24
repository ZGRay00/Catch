'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const H=require(process.env.POKECATCH_AUDIT_SOURCE||'../../Pokecatch自动助手.user.js');
const {fixture,clock}=require('../tools/benchmark-box.cjs');

function setup(size){
    const wire=fixture(H,size),save='gachamon-save-v1',data=new Map();
    const reads=[],writes=[];
    const engine=new H.Engine({
        getItem(key){reads.push(key);return data.get(key)??null;},
        setItem(key,value){writes.push(key);data.set(key,value);},
        removeItem(key){data.delete(key);}
    },{mode:'progress'});
    const publish=()=>{data.set(save,JSON.stringify(wire));return engine.read();};
    const state=publish();
    engine.loadAccount(state);
    return {engine,wire,save,publish,reads,writes};
}

test('pending adventure reviews have compact keys and recheck exact roster changes',()=>{
    const {engine,wire,publish}=setup(5000);
    engine.running=true;engine.strictPlanning=true;
    engine.queueCompute=()=>{}; // Leave the first review queued while the main loop polls.
    engine.fitTeam(engine.read(),clock);
    const prior=engine.teamSearch;
    assert.ok(prior&&prior.signature.length<1000,'a search key does not embed the PC');
    wire.money++;
    engine.fitTeam(publish(),clock+1200);
    assert.equal(engine.teamSearch,prior,'a wallet save preserves the in-flight review');
    wire.mz.m[0][7].ban=['surf'];
    engine.fitTeam(publish(),clock+2400);
    assert.ok(engine.teamSearch);
    assert.notEqual(engine.teamSearch.signature,prior.signature,'a changed move ban invalidates the review');
    engine.cancelTeamSearch();
});

test('ordinary hidden ticks keep ownership without reading the game save, and a stopped engine is idle',async t=>{
    const {engine,reads,writes,save}=setup(100);
    const previous=global.document;
    global.document={hidden:true};
    t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const now=Date.now();
    engine.running=true;engine.tabToken=null;
    reads.length=writes.length=0;
    for(let i=0;i<10;i++)await engine.step(now+i*6000);
    assert.equal(engine.nextDelay(),6000);
    assert.ok(writes.some(key=>key.includes('lease:')));
    assert.ok(!reads.includes(save));
    global.document.hidden=false;engine.running=false;
    reads.length=writes.length=0;
    for(let i=0;i<24;i++){await engine.step(now+i*2500);engine.nurseryAssist.idleStep(now+i*2500);}
    assert.equal(reads.length,0);
    assert.equal(writes.length,0);
});

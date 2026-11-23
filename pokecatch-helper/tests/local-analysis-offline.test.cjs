'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {defaultFile,bench,loadModel,fixture,take,clock}=require('../tools/benchmark-box.cjs');

test('packed-save reading, a changed local snapshot and sliced recommendations use no network or cloud entry point',()=>{
    const report=bench(defaultFile,1,[80],['money']);
    assert.equal(report.rows.length,1);
    const row=report.rows[0];
    assert.equal(row.quality.party.length,6);
    assert.ok(row.quality.coverage>0);
    assert.ok(row.counts.cold.matchups>0);
    for(const [entry,attempts] of Object.entries(report.networkAttempts))assert.equal(attempts,0,entry);
});

test('verified recommendations and bad-local-save recovery make zero network, cloud or original storage writes',()=>{
    const {model:H,counts}=loadModel(defaultFile);
    const wire=fixture(H,80),money=H.normalizeSettings({mode:'money',autoTeam:true});
    let raw=JSON.stringify(wire);
    const forbidden=()=>assert.fail('analysis cannot write to game storage');
    const engine=new H.Engine({getItem:name=>name==='gachamon-save-v1'?raw:null,setItem:forbidden,removeItem:forbidden},money);
    const s=engine.read(),original=engine.getSnapshot();
    raw=JSON.stringify({...wire,money:27000,stats:{logNonce:5}});
    const changed=engine.read(),refreshed=engine.getSnapshot();
    assert.ok(changed!==s);
    assert.equal(refreshed.combatRevision,original.combatRevision);
    assert.equal(refreshed.rebuiltProfiles,0);
    const context={reg:'unova',objective:'money',verifyAll:true,now:clock,foes:[{id:25,chapter:83,level:65,weight:1}]};
    const plan=take(H.adventureTeamSearch(changed,money,[],context,true)).result;
    const verification=plan.verification||plan.suggestion?.verification;
    assert.equal(verification.status,'verified');
    assert.equal(verification.checked,verification.total);
    const clean=raw;
    raw='{"broken":';
    assert.throws(()=>engine.read());assert.equal(engine.getSnapshot().status,'error');
    raw=clean;assert.equal(engine.read(),changed);assert.equal(engine.getSnapshot().status,'ready');
    assert.equal(Object.values(counts).reduce((sum,n)=>sum+n,0),0);
});

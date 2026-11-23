'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const H=require('../../Pokecatch自动助手.user.js');

for(const autoSwitch of [true,false])test(`strict money reuses only exact unchanged solo outcomes (native switch=${autoSwitch})`,()=>{
    const mons=[149,6,9,3,65,134,248,68,289,145].map((id,i)=>({id,level:i<2?100:i<6?50:90,uid:`m${i}`}));
    const s={mons,team:mons.slice(0,6).map(m=>m.uid),adv:{chapter:3,unlocked:8},autoSwitch};
    const foes=[{id:19,level:5,weight:1},{id:16,level:10,weight:3},{id:94,level:12,weight:1}];
    const settings={...H.DEFAULTS,mode:'money'};
    const context={foes,objective:'money',verifyAll:true,now:1732000000000};
    const plan=H.planAdventureTeam(s,settings,[],context);
    // A zero training burden preserves the exact score but disables solo reuse.
    const direct=H.planAdventureTeam(s,settings,[],{...context,trainingCosts:{},trainingPenalty:1});
    assert.ok(plan.verification.soloReused>0);
    assert.equal(direct.verification.soloReused,0);
    assert.equal(plan.verification.checked,mons.length);
    assert.equal(plan.verification.attempts,direct.verification.attempts);
    assert.deepEqual(plan.uids,direct.uids);
    assert.equal(plan.selectedScore,direct.selectedScore);
    assert.deepEqual(plan.verification.safety,direct.verification.safety);
});

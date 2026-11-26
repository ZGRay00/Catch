const test=require('node:test'),assert=require('node:assert/strict');
const {DATA,trainingCompletionTime}=require('../../Pokecatch自动助手.user.js');
const state={adv:{chapter:0,unlocked:83},team:['a','b','carry'],buddy:{uid:'a'}};
const route={members:[0],modelMemberRate:100};
const goal=(uid,level,xp,target,rank=0)=>({mon:{uid,id:635,level,xp,rank},level:target});

test('parallel learners use the longest individual gap with buddy, partial XP and distinct goals',()=>{
    const goals=[goal('a',5,14,7),goal('b',6,54,7)];
    const eta=trainingCompletionTime(state,goals,route);
    assert.equal(eta.minutes,Math.max((144+204-14)/1.3,204-54)/100);
    const measured={...route,measured:true,actualRate:460,xpShares:2.3};
    assert.equal(trainingCompletionTime(state,goals,measured).minutes,eta.minutes*100/(460/2.3));
    assert.equal(trainingCompletionTime(state,[goals[0],goal('b',6,0,8)],route).minutes,(204+285)/100);
});

test('regional rank curves include only missing XP and each requested reset from level five',()=>{
    const s={...state,travel:{to:['unova']}},tables=DATA.xpThresholds.unova;
    const eta=trainingCompletionTime(s,[goal('b',99,1234,100,1)],route,3);
    const gap=tables[1][99]-1234,sum=table=>table.slice(5,100).reduce((a,b)=>a+b,0);
    assert.equal(eta.minutes,gap/100);
    assert.equal(eta.rankMinutes,(gap+sum(tables[2])+sum(tables[3]))/100);
    assert.equal(trainingCompletionTime(s,[goal('b',99,1234,100,1)],route).rankMinutes,null);
});

test('respects the current level cap, ignores finished learners and waits for an active route and usable pace',()=>{
    const s={...state,adv:{chapter:0,unlocked:0}},goals=[goal('b',19,5,30)];
    const eta=trainingCompletionTime(s,goals,route,2);
    assert.equal(eta.capped,true);assert.equal(eta.minutes,(DATA.xpThresholds.kanto[0][19]-5)/100);assert.equal(eta.rankMinutes,null);
    assert.deepEqual(trainingCompletionTime(s,[goal('b',20,0,30)],null),{minutes:0,capped:true});
    assert.equal(trainingCompletionTime(s,goals,{...route,members:[1]}),null);
    assert.equal(trainingCompletionTime(s,goals,{...route,measured:true,actualRate:0,xpShares:1}),null);
    assert.equal(trainingCompletionTime({...s,road:['a']},goals,route),null);
});

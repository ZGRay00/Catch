'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const {compileProject}=require('../tools/build.cjs');
const compiled=new Module('gameplay-insights-user-script');
compiled._compile(compileProject().script,'gameplay-insights-user-script.js');
const H=compiled.exports;
const now=Date.UTC(2026,10,24,12);
const party=[{uid:'bud',id:1,level:60},{uid:'shiny-bud',id:1,shiny:true,level:60}];
const save={trainer:{id:'fixture'},mons:party,adv:{chapter:0,unlocked:8}};

test('route comparison uses individual stats, real opposition and native disabled moves without touching the save',()=>{
    const before=JSON.stringify(save);
    const first=H.routeMemberComparison(save,party,0,now);
    assert.ok(first.foes>1);
    const [plain,shiny]=first.members;
    assert.ok(shiny.damage>plain.damage&&shiny.stats.hp>plain.stats.hp);
    const best=plain.moves[0].key;
    const banned=H.routeMemberComparison(save,[{...party[0],ban:[best]}],0,now).members[0];
    assert.ok(!banned.moves.some(move=>move.key===best));
    assert.ok(plain.moves.every(move=>move.accuracy>0&&move.accuracy<=1));
    assert.ok(Math.abs(plain.moves.reduce((n,m)=>n+m.weight,0)-1)<1e-6);
    assert.notEqual(H.routeMemberComparison(save,party,4,now).members[0].damage,plain.damage);
    assert.equal(H.routeMemberComparison(save,party,999,now),null);
    assert.equal(JSON.stringify(save),before);
});

test('read-only advice protects learned status moves, effective route coverage and level requirements',()=>{
    const mon={...party[0],ban:['tackle']},before=JSON.stringify(mon);
    const summary=H.routeMemberComparison(save,[mon],0,now).members[0];
    const advice=H.moveAdvice(mon,summary);
    assert.ok(advice.some(row=>row.key==='sleep-powder'&&row.action==='keep'&&row.status));
    assert.ok(advice.some(row=>row.key==='sludge-bomb'&&row.action==='keep'&&row.effect));
    assert.match(advice.find(row=>row.key==='tackle'&&row.banned).reason,/已在游戏中禁用/);
    assert.ok(!advice.some(row=>row.level>60));
    assert.ok(summary.moves.every(move=>advice.find(row=>row.key===move.key)?.action==='keep'));
    assert.ok(advice.filter(row=>row.status).every(row=>row.accuracy===null&&row.effect.chance===null));
    assert.ok(H.moveAdvice(mon,null).every(row=>row.action==='keep'));
    assert.equal(JSON.stringify(mon),before);
});

test('family links return all branching forms but never unrelated species',()=>{
    const family=H.familyMembers(134).map(mon=>mon.id);
    assert.ok([133,134,135,136,196,197].every(id=>family.includes(id)));
    assert.ok(!family.includes(25));
    assert.deepEqual(H.familyMembers(-1),[]);
});

test('when the native game ignores a full ban list, the preview distinguishes recorded and effective bans',()=>{
    const learner={uid:'bud',id:1,level:1,ban:['tackle']};
    const summary=H.routeMemberComparison(save,[learner],0,now).members[0];
    const row=H.moveAdvice(learner,summary).find(move=>move.key==='tackle');
    assert.ok(row.recorded&&!row.banned);
    assert.equal(row.action,'keep');assert.match(row.reason,/自动恢复/);
    assert.ok(summary.moves.some(move=>move.key==='tackle'));
});

test('special counters and burst moves remain protected regardless of route matchups',()=>{
    const mon={...party[0],level:100,counter:'tackle',burst:'vine-whip'};
    const rows=H.moveAdvice(mon,{moves:[]});
    for(const key of [mon.counter,mon.burst]){
        const move=rows.find(row=>row.key===key);assert.equal(move.action,'keep');assert.match(move.reason,/反击或爆发/);
    }
});

test('a reliable knockout takes precedence over overkill, preserving equal-priority finishers and the normal attack',()=>{
    const mon={uid:'finisher',id:1,level:60},before=JSON.stringify([mon,save]);
    const foe={id:16,level:3},stats=H.effectiveStats(mon),enemy=H.effectiveStats(foe);
    const floor=H.expectedDamage(mon,foe,stats,enemy,{move:'tackle',details:true,knockoutFloor:true});
    assert.ok(floor.knockoutFloor>=enemy.hp);
    assert.equal(floor.accuracy,1);
    assert.notEqual(H.expectedDamage(mon,foe,stats,enemy,{details:true}).key,'tackle');
    const member=H.routeMemberComparison(save,[mon],0,now).members[0];
    assert.equal(member.moves[0].key,'tackle');
    assert.ok(Math.abs(member.moves[0].weight-1)<1e-6);
    assert.equal(member.moves[0].accuracy,1);
    assert.ok(member.finishingMoves.includes('acid-spray'),'equal base power and accuracy remains a protected choice');
    const advice=H.moveAdvice(mon,member);
    for(const key of ['tackle','acid-spray',...member.ordinaryMoves]){
        assert.equal(advice.find(row=>row.key===key).action,'keep',key);
    }
    const banned={...mon,ban:['tackle']};
    const next=H.routeMemberComparison(save,[banned],0,now).members[0];
    assert.equal(next.moves[0].key,'acid-spray');
    assert.ok(!next.finishingMoves.includes('tackle'));
    assert.equal(JSON.stringify([mon,save]),before);
});

test('a weaker attack can still be suggested after checking finishers, with cautious fallback for special actions',()=>{
    const mon={uid:'candidate',id:52,level:60},summary=H.routeMemberComparison(save,[mon],0,now).members[0];
    const find=m=>H.moveAdvice(m,summary).find(row=>row.key==='feint');
    const candidate=find(mon);
    assert.equal(candidate.action,'consider');
    assert.match(candidate.reason,/本路线未选用.*同属性同类别/);
    assert.equal(find({...mon,rageMax:6}).action,'keep');
    assert.equal(H.moveAdvice(mon,{moves:[]}).find(row=>row.key==='feint').action,'keep');
});

test('optional knockout floor matches native minimum-power checks for fixed, escalating and random multi-hit moves',()=>{
    const mon={id:1,level:45},foe={id:151,level:45},stats=H.effectiveStats(mon),defense=H.effectiveStats(foe);
    for(const [key,power] of [['double-kick',60],['triple-kick',60],['bullet-seed',50]]){
        const move=H.DATA.combat.moves[key],type=H.MONS.get(foe.id).types.reduce((value,t)=>value*(H.DATA.chart[move.type]?.[t]??1),1);
        const stab=H.MONS.get(mon.id).types.includes(move.type)?1.5:1;
        const low=Math.max(1,Math.floor(((2*mon.level/5+2)*power*stats.atk/defense.def/50+2)*stab*type*.85));
        const original=H.expectedDamage(mon,foe,stats,defense,{move:key,details:true});
        const {knockoutFloor,...unchanged}=H.expectedDamage(mon,foe,stats,defense,{move:key,details:true,knockoutFloor:true});
        assert.equal(knockoutFloor,low,key);
        assert.deepEqual(unchanged,original,key);
    }
});

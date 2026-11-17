const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js'),native=require('./fixtures/pokecatch-combat-v400.json');

test('native multi-hit patterns are used separately from aggregate move selection power',()=>{
    assert.deepEqual(H.MULTI_HIT_DATA,native.multi);
    for(const [key,pattern]of Object.entries(native.multi.moves)){
        if(!(native.multiBase[key]>0))continue; // Native config also lists future, absent moves.
        const base=native.multiBase[key],expected=Array.isArray(pattern)?pattern.reduce((sum,power)=>sum+power,0):base*(pattern==='2-5'?native.multi.odds.reduce((sum,p,i)=>sum+p*(i+2),0):pattern);
        assert.ok(Math.abs(H.DATA.combat.moves[key].power-expected)<1e-10,key);
    }
});

test('per-strike native rounding and random hit counts reproduce isolated browser evidence',()=>{
    for(const duel of native.duels){
        const actual=H.expectedDamage(duel.mon,duel.foe,H.effectiveStats(duel.mon),H.effectiveStats(duel.foe),{details:true,weather:duel.weather});
        assert.equal(actual.key,duel.move.key);
        assert.ok(Math.abs(actual.hit-duel.hit)<.012,`${duel.move.key}: ${actual.hit} vs native ${duel.hit}`);
        assert.equal(actual.accuracy,duel.move.acc/100,'Native first-roll accuracy remains unchanged');
        assert.ok(actual.minHit<=actual.hit&&actual.hit<=actual.maxHit);
    }
    const lowLevel=native.duels.find(duel=>duel.mon.id===106&&duel.mon.level===5);
    assert.ok(lowLevel.hit>lowLevel.rawCombined*1.15,'A low-level double kick must retain its second base-damage term');
    const random=native.duels.find(duel=>duel.mon.id===214&&duel.mon.level===10);
    assert.ok(random.hit>random.rawCombined*1.2,'Random 2–5 hit damage is averaged after each strike is rounded');
});

test('damage mean integrates native floors and the one-damage minimum at low power',()=>{
    assert.equal(H.damageRollMean(0),1);
    assert.equal(H.damageRollMean(.5),1);
    assert.equal(H.damageRollMean(2),1);
    assert.ok(Math.abs(H.damageRollMean(10)-26/3)<1e-12);
    assert.equal(H.damageRollMean(100),92);
});

test('a missed attack guarantees the next attempt instead of permitting consecutive misses',()=>{
    assert.deepEqual(native.misses,[true,false,true,false]);
    const hit={hit:100,minHit:100,maxHit:100,accuracy:.8};
    assert.equal(H.attackTurns(hit,100),1.2);
    assert.ok(Math.abs(H.attackTurns(hit,300)-3.6)<1e-12);
    assert.ok(H.attackTurns(hit,300)<3/.8);
    assert.equal(H.attackTurns({...hit,accuracy:1},300),3);
    assert.equal(H.attackTurns({...hit,accuracy:0},300),Infinity);
});

test('partial deployment damage uses the same recovered-miss cadence as KO estimates',()=>{
    const details=[{attack:{hit:100,damage:50,sustainedDamage:100/1.5,minHit:100,maxHit:100,accuracy:.5},incoming:{hit:100,damage:100,minHit:100,maxHit:100,accuracy:1},hp:100,foeHp:200,first:1,deployment:0}];
    const battle=H.deployedBattle(details);
    assert.ok(Math.abs(battle.coverage-1/6)<1e-12,'One available attack contributes the miss-recovered sustained damage');
});

test('optional weather factors affect actual selected moves and typeless fallback stays unaffected',()=>{
    const mon={id:6,level:50},foe={id:9,level:50},stats=H.effectiveStats(mon),defense=H.effectiveStats(foe);
    const zero=H.expectedDamage(mon,foe,stats,defense,{details:true,weather:()=>0});
    assert.equal(zero.key,'struggle');assert.ok(zero.hit>0);
    const rat={id:19,level:1},ghost={id:92,level:1};
    const base=H.expectedDamage(rat,ghost,H.effectiveStats(rat),H.effectiveStats(ghost),{details:true});
    const weather=H.expectedDamage(rat,ghost,H.effectiveStats(rat),H.effectiveStats(ghost),{details:true,weather:{normal:1.5}});
    assert.equal(weather.key,'struggle');assert.equal(weather.hit,base.hit);
});

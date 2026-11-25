'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/models/combat-team.js'),'utf8');
const {deployedBattle,battleWithReserves,reserveInsertionOrder}=vm.runInNewContext(source+'\n;({deployedBattle,battleWithReserves,reserveInsertionOrder})');

function member(hit,deployment){
    return {foeHp:100,first:1,survives:1,deployment,attack:{hit,accuracy:1,sustainedDamage:hit}};
}

test('inserting a candidate reproduces native stable order and combat at every slot',()=>{
    const scratch=[],lastVictory=[];
    for(const priorities of [[],[1],[1,2,1,0,2],[0,0,0,0,0]]){
        const rest=priorities.map((p,i)=>member(11+i,p));
        const order=rest.map((_,i)=>i).sort((a,b)=>rest[b].deployment-rest[a].deployment);
        for(const priority of [-1,0,1,2,3])for(const hit of [1,41,150])for(let slot=0;slot<=rest.length;slot++){
            const inserted=member(hit,priority),party=[...rest.slice(0,slot),inserted,...rest.slice(slot)];
            const result=reserveInsertionOrder(rest,order,inserted,slot,scratch);
            const reference=party.slice().sort((a,b)=>b.deployment-a.deployment);
            assert.deepEqual(result,reference);
            assert.deepEqual(battleWithReserves(result,false,lastVictory,0),deployedBattle(party,true));
        }
    }
});

for(const autoSwitch of [true,false])test(`reserve reuse matches full simulation through priority ties, swaps and wipes (native switch=${autoSwitch})`,()=>{
    const [lead,winner,weak,fast,alternate]=[member(20,1),member(90,1),member(4,0),member(45,2),member(19,1)];
    const lastVictory=[];
    const battle=(party,foe=0)=>{
        const expected=deployedBattle(party,autoSwitch);
        const result=battleWithReserves([...party],autoSwitch,lastVictory,foe);
        assert.deepEqual(result,expected);
        return result;
    };
    const first=battle([lead,winner,weak]);
    assert.equal(first.coverage,1);
    assert.equal(first.deaths,1);
    assert.strictEqual(battle([lead,winner,alternate]),first);
    assert.notStrictEqual(battle([lead,winner],1),first);
    assert.ok(battle([lead,weak]).coverage<1);
    assert.ok(battle([alternate,weak,fast]).coverage<1);
    function permutations(party,remaining){
        if(party.length)battle(party);
        for(const member of remaining)permutations([...party,member],remaining.filter(next=>next!==member));
    }
    permutations([],[lead,winner,weak,fast,alternate]);
});

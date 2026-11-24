'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/models/combat-team.js'),'utf8');
const {deployedBattle,battleWithReserves}=vm.runInNewContext(source+'\n;({deployedBattle,battleWithReserves})');

function member(hit,deployment){
    return {foeHp:100,first:1,survives:1,deployment,attack:{hit,accuracy:1,sustainedDamage:hit}};
}

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

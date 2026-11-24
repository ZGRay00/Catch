const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

test('planning accepts the reviewed launcher and keeps unknown builds gated',()=>{
    assert.equal(H.localRulesKnown('bd1d674523'),true);
    assert.equal(H.localRulesKnown('0000000000'),false);
    assert.equal(H.DATA.combat.build,'bd1d674523');
    assert.equal(H.DATA.economy.build,'bd1d674523');
    assert.equal(H.WEATHER_DATA.build,'bd1d674523');
    assert.equal(H.DATA.layout,6);
});

test('ordinary encounter snapshots no longer list Deerling in the three changed Unova chapters',()=>{
    for(const id of [72,73,74]){
        const chapter=H.DATA.chapters[id];
        for(const phase of ['morning','day','night']){
            assert.ok(chapter.pools[phase].length);
            assert.equal(chapter.pools[phase].some(([species])=>species===585),false);
        }
    }
});

test('tower floor profiles match native boss-level, rank and overflow breakpoints',()=>{
    for(const [floor,baseLevel,level,ranks,statMult] of [
        [10,63,66,[0,0,0],1],[40,100,100,[1,1,0],1],[80,100,100,[3,2,2],1],
        [150,100,100,[5,5,5],1],[160,100,100,[5,5,5],1.2],[200,100,100,[5,5,5],1.6]
    ])assert.deepEqual(H.towerFloorProfile(floor),{baseLevel,level,ranks,statMult});
    assert.deepEqual(H.TOWER_RULES.eggFloors,[80,150,200]);
});

test('raid preparation uses the revised boss HP and damage independently of the ally estimate',()=>{
    const boss=31,bst=Object.values(H.MONS.get(boss).stats).reduce((sum,value)=>sum+value,0);
    const {hp,power}=H.raidBossFactors(boss);
    assert.equal(hp,3.3*(500/bst)**1.8*.77);
    assert.equal(power,.7*(500/bst)*.77);
    assert.equal(H.raidParalysisTurns(),1.5);
    const context=H.battleContext({adv:{chapter:0}},'raid',{id:boss});
    assert.equal(context.size,2);
    assert.equal(context.foes[0].hpMult,hp*4.5);
    assert.equal(context.foes[0].damageMult,power);
});

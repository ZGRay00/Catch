'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {speciesRankings,DATA}=require('../../Pokecatch自动助手.user.js');
const round=value=>Math.round(value*10)/10;

test('both ranking sheets reproduce every exported row including tie order and form names',()=>{
    const power=[],overall=[];
    for(const [key,{fr}] of Object.entries(DATA.types)){
        const type=key==='psychic'?'超能':fr;
        for(const row of speciesRankings(key)){
            const {id,name,rarity,move,category,attack,accuracy}=row;
            const common=[id,name,rarity,move,category==='phys'?'物理':'特殊'];
            const output=round(row.expected/1000),bulk=round(row.bulk/1000);
            const os=round(row.outputScore),bs=round(row.bulkScore),cs=round(row.overallScore);
            overall.push([type,row.overallRank,...common,cs,os,bs,bulk,row.powerRank,output,row.power,accuracy]);
        }
        for(const row of [...speciesRankings(key)].sort((a,b)=>a.powerRank-b.powerRank)){
            power.push([type,row.powerRank,row.id,row.name,row.rarity,row.move,row.category==='phys'?'物理':'特殊',
                row.power,row.accuracy,row.attack,round(row.expected/1000),round(row.outputScore),round(row.bulk/1000),
                round(row.bulkScore),round(row.overallScore),row.overallRank]);
        }
    }
    assert.equal(new Set(power.map(row=>row[2])).size,689);
    assert.equal(power.length,1015);
    // SHA-256 of JSON.stringify on the original v1.113 worksheets' data rows.
    const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    assert.equal(digest(power),'f17866ed3ce85dd803a1fa370a61e2c2bc505a6e0889e4266f2c04b32d13feb2');
    assert.equal(digest(overall),'6f719f1fd368192a14c1debb937d7dec7ababe5ac940d6aab969152cdc46ffe5');
});

test('default game moves recalculate both rankings on the same population',()=>{
    let differences=0;
    for(const type of Object.keys(DATA.types)){
        const sheet=new Map(speciesRankings(type).map(row=>[row.id,row]));
        const game=speciesRankings(type,'game');
        assert.equal(game.length,sheet.size);
        assert.equal(game[0].overallScore,100);
        assert.equal(game.find(row=>row.powerRank===1).outputScore,100);
        for(const row of game)if(row.expected!==sheet.get(row.id).expected)differences++;
    }
    assert.equal(differences,15);
    const pick=(type,id,source)=>speciesRankings(type,source).find(row=>row.id===id);
    assert.equal(pick('fire',244,'game').power,160);
    assert.equal(pick('fire',244,'sheet').power,120);
    assert.equal(pick('water',42301,'game').move,'水炮');
    assert.equal(pick('water',42301,'sheet').move,'浊流');
});

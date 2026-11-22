const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

const fixture=(ids,zoneId=145)=>({
    adv:{chapter:41},team:['adventure'],eventTeams:{['zone:'+zoneId]:[]},
    mons:ids.map((id,index)=>({id,uid:'m'+index,reg:'kanto',level:100})),
});
const time=Date.UTC(2026,10,16,12);

test('elite context uses the actual stage and retains the spawned Deoxys form across weeks',()=>{
    const s=fixture([],386);
    const first=H.legendEliteContext(s,386,1,time);
    const second=H.legendEliteContext(s,386,4,time+7*86400000);
    assert.notEqual(first.foes[0].id,second.foes[0].id);
    assert.equal(second.foes[0].rank,4);
    assert.equal(second.foes[0].hpMult,H.LEGEND_ELITE.zones[386].foes[second.foes[0].id][3][0]*H.LEGEND_ELITE.enemyHp);
    s.adv.zone={id:386,elite:1,foe:first.foes[0].id};
    assert.equal(H.legendEliteContext(s,386,1,time+7*86400000).foes[0].id,first.foes[0].id);
    assert.equal(H.legendEliteContext(s,386,6,time),null);
});

test('plans are legal, preserve the adventure team, and use actual levels and roster availability',()=>{
    const s=fixture([150,145,384,76,112,450,473,445,6,89,169,289,130,526,76,64601,64602]);
    s.mons[3].level=8;s.mons[14].shiny=true;s.mons[14].rank=4;s.mons[5].reg='unova';
    s.link={from:'kanto',to:'unova',side:'to'};
    const before=structuredClone(s),context=H.legendEliteContext(s,145,5,time);
    const result=H.legendEliteTeamSearch(s,context,false).next().value;
    assert.equal(result.uids.length,6);
    const selected=result.uids.map(uid=>s.mons.find(mon=>mon.uid===uid));
    assert.ok(selected.filter(mon=>H.MONS.get(mon.id).legend).length<=1);
    assert.equal(new Set(selected.map(mon=>H.DATA.combat.singles[mon.id]||mon.id)).size,6);
    assert.ok(!result.uids.includes('m3')&&!result.uids.includes('m5'),'the low-level copy and out-of-region member are excluded');
    assert.ok(result.uids.includes('m14'),'held stronger eligible copy can replace the weak duplicate');
    assert.ok(result.estimate.damage>0);
    assert.deepEqual(s,before);
    assert.equal(H.legendEliteCompatible({id:64602},[{id:643}]),false);
    assert.equal(H.legendEliteCompatible({id:6},[{id:6,shiny:true}]),false);
});

test('large boxes yield during scouting and comparisons and keep an already optimal saved team',()=>{
    const s=fixture(Array.from({length:1200},(_,i)=>H.DATA.mons[i%H.DATA.mons.length].id),150);
    const context=H.legendEliteContext(s,150,5,time),search=H.legendEliteTeamSearch(s,context,true);
    let result,yields=0;
    do{result=search.next();if(!result.done)yields++;}while(!result.done);
    assert.ok(yields>=s.mons.length);
    const original=result.value.uids;
    assert.equal(original.length,6);
    s.eventTeams['zone:150']=[...original];
    assert.deepEqual(H.legendEliteTeamSearch(s,context,false).next().value.uids,original);
});

const nativeFile=process.env.POKECATCH_NATIVE_APP;
test('route and stage multipliers match the isolated native bundle for each recorded form',{skip:!nativeFile},()=>{
    const vm=require('../tools/pokecatch-native-vm.cjs')(nativeFile);
    const native=JSON.parse(vm.run(`JSON.stringify((()=> {
        const game=__pcResearch,output={};
        for(const id of ${JSON.stringify(H.DATA.zones.map(zone=>zone.id))}){
            const zone=game.LegendZones.get(id);
            output[id]={foes:Object.fromEntries((zone.forms||[zone.id]).map(foe=>[foe,game.CONFIG.ELITE.TIERS.map(tier=>{
                const {hp,power}=game.LegendZones.eliteKnobs(id,foe,tier);
                return [Number(hp.toFixed(8)),Number(power.toFixed(8))];
            })])),...zone.counter?{counter:zone.counter}:{},...zone.burst?{burst:zone.burst}:{}};
        }
        return {output,limit:game.CONFIG.ELITE.LEGENDS,apart:game.CONFIG.TEAM_APART};
    })())`));
    assert.deepEqual(native.output,H.LEGEND_ELITE.zones);
    assert.equal(native.limit,H.LEGEND_ELITE.legendLimit);
    assert.deepEqual(native.apart,H.LEGEND_ELITE.apart);
});

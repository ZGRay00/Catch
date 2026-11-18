const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const now=new Date(2026,10,18,12).getTime();
function save(){return {dex:{},mons:[],items:{},team:[],travel:{to:['johto','hoenn','sinnoh','unova']},adv:{chapter:74,unlocked:83,badges:[],gifts:{}}};}

test('custom dex species use exact capture history independently of search geography',()=>{
    const s=save(),cfg=H.normalizeSettings({mode:'dex',dexSpecies:[25,26,26],dexRegions:['hoenn','sinnoh','invalid']});
    s.dex[25]={caught:1};
    assert.deepEqual(H.dexStatus(s,cfg).missing.map(m=>m.id),[26]);
    assert.deepEqual(H.dexStatus(s,cfg).roots.map(m=>m.id),[25,26]);
    assert.deepEqual(new Set(H.candidates(s,cfg).map(r=>r.reg)),new Set(['hoenn','sinnoh']));
    const locked=H.normalizeSettings({...cfg,dexSpecies:[],dexRegions:['unova']});
    s.travel.to=[];s.adv.chapter=0;s.adv.unlocked=8;
    assert.ok(H.dexStatus(s,locked).missing.length);assert.deepEqual(H.candidates(s,locked),[]);
});

test('multi-shiny yield sums remaining targets only, then applies region and weather together',()=>{
    const s=save(),cfg=H.normalizeSettings({mode:'shiny',shinySpecies:[25,19],shinyRegions:['kanto','johto']});
    const rank=options=>H.shinyRanking(s,{...cfg,...options},{},now);
    const singles=[19,25].map(id=>new Map(rank({shinySpecies:[id]}).map(row=>[row.key,row.expected])));
    const multi=rank({});assert.ok(multi.length);
    for(const row of multi)assert.ok(Math.abs(row.expected-singles.reduce((n,map)=>n+(map.get(row.key)||0),0))<1e-8);
    const first=multi[0],sky=H.chapterWeather(s,first.id,now).key||'clear';
    const filtered=rank({shinyWeather:[sky]});assert.ok(filtered.length);
    for(const row of filtered)assert.ok(row.members.every(id=>(H.chapterWeather(s,id,now).key||'clear')===sky));
    s.dex[19]={shiny:1};assert.deepEqual(rank({}),rank({shinySpecies:[25]}));
    s.dex[25]={shiny:1};assert.deepEqual(rank({}),[]);
});

test('legacy shiny target survives normalization and separate queue jobs retain their filters',()=>{
    const legacy=H.normalizeSettings({mode:'shiny',shinyId:594});
    assert.equal(legacy.shinyId,594);assert.deepEqual(legacy.shinySpecies,[]);
    const settings=H.normalizeSettings({...legacy,dexSpecies:[566],dexWeather:['rain'],shinyWeather:['rain','storm','bad','storm'],shinySpecies:[594,25]});
    const [job]=H.normalizeJobs([{id:'hunt',settings}]);
    assert.deepEqual(job.settings.shinyWeather,['rain','storm']);assert.deepEqual(job.settings.dexSpecies,[566]);
    assert.deepEqual(job.settings.shinySpecies,[25,594]);
});

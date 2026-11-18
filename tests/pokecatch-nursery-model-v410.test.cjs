const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const H=require('../Pokecatch自动助手.user.js');
const scope=vm.createContext({DATA:H.DATA,MONS:H.MONS});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../pokecatch-helper/src/models/nursery-model.js'),'utf8')+';globalThis.N={NURSERY_RULES,nurseryHash,nurserySeed,nurseryFixedRoll,nurseryEggRate,nurseryOffspringId,nurseryEggKey,eggOutcome,nurseryParentPool,nurseryForecast,nurserySnapshot};',scope);
const N=scope.N,plain=value=>JSON.parse(JSON.stringify(value));
const state=()=>({trainer:{id:'nursery-audit',since:1700000000000},mons:[],dex:{},stats:{hatched:10},adv:{chapter:0,unlocked:8},pension:{laid:30,bx:1,mons:[{mon:{id:6,uid:'fire',shiny:false}},{mon:{id:132,uid:'ditto',shiny:true}},{mon:{id:9,uid:'water',shiny:true}}],eggs:[],open:{eggs:4},egg:0}});

test('nursery current outcomes distinguish explicit old flags, counter rolls and old UID hashes',()=>{
 const s=state();assert.equal(N.eggOutcome(s,{uid:'a',shiny:true}).shiny,true);assert.equal(N.eggOutcome(s,{uid:'a',shiny:false}).shiny,false);
 const newer=N.eggOutcome(s,{uid:'a',k:32,sp:2,bx:1});assert.equal(newer.known,true);assert.equal(newer.source,'counter');assert.equal(newer.rate,1/8);assert.equal(newer.shiny,N.nurseryFixedRoll(s,32)<1/8);
 const legacy=N.eggOutcome({}, {uid:'old-egg',sp:1});assert.equal(legacy.source,'legacy');assert.equal(legacy.shiny,N.nurseryHash('old-egg')<.1);
 assert.equal(N.eggOutcome(s,{laidAt:123}).shiny,N.nurseryHash('123')<1/512);assert.equal(N.eggOutcome(s,{k:1.5,uid:'old-fraction'}).source,'legacy');
});
test('incomplete seeds, unsafe counter values and unsupported builds never produce fake certainty',()=>{
 const s=state();delete s.trainer.since;assert.equal(N.eggOutcome(s,{k:5,uid:'a'}).known,false);assert.equal(N.eggOutcome(s,{k:5,uid:'a'}).shiny,null);
 assert.equal(N.eggOutcome(s,{shiny:true}).known,true);assert.equal(N.eggOutcome(s,{uid:'legacy'}).known,true);
 for(const bad of [-1,Number.MAX_SAFE_INTEGER+1])assert.equal(N.eggOutcome(state(),{k:bad}).known,false);
 assert.equal(N.eggOutcome(state(),{k:1},{build:'unverified'}).known,false);assert.equal(N.eggOutcome(state(),{shiny:false},{build:'unverified'}).known,true);
 assert.equal(N.eggOutcome(s,{}).known,false);
});
test('egg 49 has a labelled projection on a future build without confirming incubator colours',()=>{
 const s=state();s.pension.laid=49;
 const options={build:'future',estimateUnverified:true}, projected=N.nurseryForecast(s,options),current=N.nurseryForecast(s);
 assert.equal(projected.estimated,true);assert.equal(projected.known,false);assert.equal(projected.nextEgg.k,49);
 assert.deepEqual(projected.nextShiny,current.nextShiny);assert.equal(N.eggOutcome(s,{k:49},options).known,false);
 delete s.trainer.since;assert.equal(N.nurseryForecast(s,options).nextEgg,null);
});
test('native parent order, true slots, noEgg and special legendary breeders are preserved',()=>{
 const s=state();s.pension.mons.push({mon:{id:490,uid:'manaphy',shiny:false}},{mon:{id:479,uid:'rotom'}},{mon:{id:4,uid:'blocked',noEgg:true}});
 const pool=N.nurseryParentPool(s);assert.equal(pool.known,true);assert.equal(pool.hasDitto,true);assert.deepEqual(plain(pool.parents.map(p=>[p.id,p.slot])),[[6,1],[9,3],[490,4]]);
 s.pension.mons[1].mon.shiny=false;assert.deepEqual(plain(N.nurseryParentPool(s).parents),plain(pool.parents),'Ditto shiny status is not a parent-rate bonus');
 s.pension.mons.push({mon:{id:999999}});assert.equal(N.nurseryParentPool(s).known,false);
});
test('offspring follow native open-region ancestry, special Phione births and Burmy forms',()=>{
 const s=state();assert.equal(N.nurseryOffspringId(s,6),4);assert.equal(N.nurseryOffspringId(s,25),25);assert.equal(N.nurseryOffspringId(s,113),113);
 s.travel={to:['johto']};assert.equal(N.nurseryOffspringId(s,25),172);assert.equal(N.nurseryOffspringId(s,106),236);assert.equal(N.nurseryOffspringId(s,113),113);
 s.travel.to.push('sinnoh');assert.equal(N.nurseryOffspringId(s,113),440);assert.equal(N.nurseryOffspringId(s,490),489);assert.equal(N.nurseryOffspringId(s,41302),41202);
 const f=N.nurseryForecast(s);assert.equal(f.nextEgg.eggId,f.nextEgg.parent.eggId);assert.equal(f.nextShiny.eggId,f.nextShiny.parent.eggId);
});
test('forecast uses the actual mixed parent pool and the first pending berry only',()=>{
 const s=state(),before=JSON.stringify(s),forecast=N.nurseryForecast(s,{limit:10000,count:4});assert.equal(forecast.known,true);assert.equal(forecast.counter,30);assert.equal(forecast.nextEgg.k,30);assert.equal(forecast.nextEgg.offset,0);assert.equal(forecast.nextEgg.position,1);
 for(const row of forecast.hits){const parent=forecast.pool[Math.floor(N.nurseryFixedRoll(s,row.k,1)*forecast.pool.length)];assert.equal(row.parent.uid,parent.uid);assert.equal(row.bx,row.offset===0);assert.equal(row.rate,N.nurseryEggRate({sp:parent.shiny?2:0,bx:row.offset===0}));assert.ok(row.roll<row.rate);}
 assert.equal(forecast.nextShiny.offset,forecast.nextShiny.k-30);assert.equal(forecast.nextShiny.position,forecast.nextShiny.offset+1);
 for(let k=30;k<forecast.nextShiny.k;k++){const p=forecast.pool[Math.floor(N.nurseryFixedRoll(s,k,1)*forecast.pool.length)];assert.ok(N.nurseryFixedRoll(s,k)>=N.nurseryEggRate({sp:p.shiny?2:0,bx:k===30}));}
 assert.equal(JSON.stringify(s),before);assert.ok(Object.values(forecast.scenarios).every(row=>row.hypothetical));
});
test('ordinary and shiny-parent hypotheses remain separate from actual prediction',()=>{
 const s=state();s.pension.bx=0;const f=N.nurseryForecast(s,{limit:20000});assert.ok(f.scenarios.shinyParents.nextShiny);
 assert.equal(f.scenarios.shinyParents.nextShiny.hypothetical,true);assert.equal(f.nextShiny.hypothetical,undefined);
 assert.equal(f.scenarios.plainParents.nextShiny.rate,1/512);assert.equal(f.scenarios.shinyParents.nextShiny.rate,1/16);
 const bx=f.scenarios.berryNext.nextShiny;assert.equal(bx.rate,N.nurseryEggRate({sp:bx.parent.shiny?2:0,bx:bx.offset===0}));
});
test('future counters are never guessed from hatch counts or array length',()=>{
 const s=state();delete s.pension.laid;s.stats.hatched=999;s.pension.eggs=[{uid:'x'}];const f=N.nurseryForecast(s);assert.equal(f.known,false);assert.equal(f.counter,null);assert.equal(f.nextShiny,null);
 for(const modify of [s=>delete s.trainer,s=>s.pension.mons=[],s=>s.pension.mons=[{mon:{id:132,uid:'ditto'}}],s=>s.pension.mons=[{mon:{id:6,uid:'fire'}}]]){const s=state();modify(s);assert.equal(N.nurseryForecast(s).known,false);}
});
test('forecast limits bound computation and an empty search is not a no-shiny promise',()=>{
 const s=state(),f=N.nurseryForecast(s,{limit:1});assert.equal(f.scanned,1);if(!f.nextEgg.shiny){assert.equal(f.nextShiny,null);assert.equal(f.truncated,true);assert.match(f.reason,/不代表/);}
 const huge=N.nurseryForecast(s,{limit:Infinity});assert.equal(huge.limit,20000);assert.equal(N.nurseryForecast(s,{limit:60000,count:1}).limit,50000);
 s.pension.laid=Number.MAX_SAFE_INTEGER;assert.equal(N.nurseryForecast(s).known,false);
});
test('snapshot counts known shiny eggs without inventing unknown outcomes or readiness',()=>{
 const s=state();s.pension.eggs=[{uid:'old',shiny:true,hatchAt:1000},{uid:'plain',shiny:false,hatchAt:3000},{k:33,hatchAt:2000},{}];const before=JSON.stringify(s),snap=N.nurserySnapshot(s,{now:2000,forecast:false});
 assert.equal(snap.counts.total,4);assert.equal(snap.counts.known,3);assert.equal(snap.counts.unknown,1);assert.equal(snap.counts.ready,2);assert.equal(snap.capacity,4);assert.equal(snap.hatched,10);assert.equal(snap.counter,30);assert.equal(snap.forecast,null);
 assert.equal(snap.eggRows[3].shiny,null);assert.equal(snap.eggRows[3].readyKnown,false);assert.equal(JSON.stringify(s),before);
});

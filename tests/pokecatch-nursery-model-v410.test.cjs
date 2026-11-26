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
test('unknown builds can estimate existing eggs without treating the estimates as confirmed',()=>{
 const s=state(),options={build:'future',estimateUnverifiedEggs:true,forecast:false};
 const flags=[{sp:2,bx:1},{sp:0,bx:0}];
 const [hit,miss]=flags.map((flag,index)=>{
  let k=0;while(N.eggOutcome(s,{k,...flag}).shiny!==!index)k++;
  return{k,...flag};
 });
 for(const [egg,shiny] of [[hit,true],[miss,false]]){
  const outcome=N.eggOutcome(s,egg,options);
  assert.equal(outcome.certainty,'reference');assert.equal(outcome.estimatedShiny,shiny);
  assert.equal(outcome.known,false);assert.equal(outcome.shiny,null);assert.equal(outcome.rateVerified,false);
 }
 assert.equal(N.eggOutcome(s,{...hit,shiny:false},options).shiny,false);
 assert.equal(N.eggOutcome(s,{...hit,shiny:'bad'},options).estimatedShiny,undefined);
 assert.equal(N.eggOutcome(s,{...hit,bx:'bad'},options).estimatedShiny,undefined);
 assert.equal(N.eggOutcome({},hit,options).estimatedShiny,undefined);
 assert.equal(N.eggOutcome(s,{k:-1,uid:'still-invalid'},options).estimatedShiny,undefined);
 s.pension.eggs=[hit,miss,{...hit,shiny:true},{}];
 const estimate=N.nurserySnapshot(s,options),strict=N.nurserySnapshot(s,{...options,estimateUnverifiedEggs:false});
 assert.equal(estimate.counts.estimated,2);assert.equal(estimate.counts.estimatedShiny,1);
 assert.equal(estimate.counts.shiny,1);assert.equal(strict.counts.shiny,1);assert.equal(strict.counts.estimated,0);
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
test('four saved berries cover four successive natural lays without changing incubating eggs',()=>{
 const s=state(),build='adf601dce2';
 s.pension.laid=148;
 s.pension.mons=[{mon:{id:132}},{mon:{id:248,shiny:true}}];
 s.pension.eggs=[{id:246,uid:'older',k:147,bx:1}];
 // The first two consecutive eggs require a berry, followed by an ordinary egg.
 const roll=k=>N.nurseryFixedRoll(s,k);
 while(!(roll(148)>=1/16&&roll(148)<1/8&&roll(149)>=1/16&&roll(149)<1/8&&roll(150)>=1/8))s.trainer.since++;
 for(let count=0;count<=4;count++){
  s.pension.bx=count;
  const snap=N.nurserySnapshot(s,{build,limit:5,count:5}),f=snap.forecast;
  assert.equal(snap.eggRows[0].berryApplied,true);
  assert.equal(f.known,true);assert.equal(f.pendingBerries,count);assert.equal(f.pendingBerry,count>0);
  assert.equal(f.nextEgg.k,148);assert.equal(f.nextEgg.bx,count>0);
  const target=f.nextUncoveredEgg;
  assert.equal(target.k,148+count);assert.equal(target.bx,false);
  assert.equal(target.withBerryShiny,roll(target.k)<1/8);assert.equal(target.withoutBerryShiny,roll(target.k)<1/16);
  for(let i=0;i<5;i++){
   const hit=f.hits.find(row=>row.k===148+i);
   assert.equal(Boolean(hit),roll(148+i)<(i<count?1/8:1/16));
   if(hit)assert.equal(hit.bx,i<count);
  }
 }
 s.pension.bx=2;
 assert.equal(N.nurseryForecast(s,{build:N.NURSERY_RULES.build}).active,false,'a legacy one-berry build cannot certify a four-berry save');
 assert.equal(N.nurseryForecast(s,{build:'future',limit:4,estimateUnverified:true}).certainty,'reference');
 assert.equal(N.eggOutcome(s,{id:246,k:147,bx:2},{build}).known,false,'an existing egg still stores a binary applied marker');
});
test('ordinary and shiny-parent hypotheses remain separate from actual prediction',()=>{
 const s=state();s.pension.bx=0;const f=N.nurseryForecast(s,{limit:20000});assert.ok(f.scenarios.shinyParents.nextShiny);
 assert.equal(f.scenarios.shinyParents.nextShiny.hypothetical,true);assert.equal(f.nextShiny.hypothetical,undefined);
 assert.equal(f.scenarios.plainParents.nextShiny.rate,1/512);assert.equal(f.scenarios.shinyParents.nextShiny.rate,1/16);
 const bx=f.scenarios.berryNext.nextShiny;assert.equal(bx.rate,N.nurseryEggRate({sp:bx.parent.shiny?2:0,bx:bx.offset===0}));
});
test('mixed parent groups follow the parent drawn and only list newly shiny berry-only eggs',()=>{
 const s=state(),before=JSON.stringify(s),actual=N.nurseryForecast(s),f=N.nurseryForecast(s,{compare:true});
 assert.deepEqual(f.nextEgg,actual.nextEgg);assert.deepEqual(f.hits,actual.hits);assert.deepEqual(plain(actual.comparisons),[]);
 assert.deepEqual(plain(f.comparisons.map(rule=>[rule.key,rule.rate])),[['plain',1/512],['plain-berry',1/256],['shiny',1/16],['shiny-berry',1/8]]);
 for(const rule of f.comparisons){
  const expected=[];
  for(let k=s.pension.laid;k<s.pension.laid+f.limit&&expected.length<3;k++){
   const roll=N.nurseryFixedRoll(s,k);
   const parent=f.pool[Math.floor(N.nurseryFixedRoll(s,k,1)*f.pool.length)];
   const min=rule.berry?rule.baseRate:0;
   if(parent.shiny!==rule.shiny||roll<min||roll>=rule.rate)continue;
   expected.push([k,k-s.pension.laid+1,parent.slot,parent.eggId]);
  }
  assert.equal(expected.length,3);
  assert.deepEqual(plain(rule.hits.map(hit=>[hit.k,hit.position,hit.parent.slot,hit.eggId])),expected);
 }
 const keys=f.comparisons.flatMap(rule=>rule.hits.map(hit=>hit.k));assert.equal(keys.length,new Set(keys).size);
 assert.equal(Math.min(...f.comparisons.filter(rule=>rule.berry).map(rule=>rule.hits[0].k)),f.firstBerryOnly.k);
 const brief=N.nurseryForecast(s,{compare:true,limit:1});assert.equal(brief.scanned,1);assert.ok(brief.comparisons.every(rule=>rule.hits.length<=1));
 const reference=N.nurseryForecast(s,{compare:true,build:'future',estimateUnverified:true});
 assert.equal(reference.certainty,'reference');assert.equal(reference.known,false);assert.deepEqual(reference.comparisons,f.comparisons);
 assert.equal(JSON.stringify(s),before);
});
test('single-colour groups exclude ineligible residents and never use Ditto to assign a group',()=>{
 const s=state();s.pension.mons[2].mon.noEgg=true;
 const groups=()=>plain(N.nurseryForecast(s,{compare:true}).comparisons.map(rule=>rule.key));
 assert.deepEqual(groups(),['plain','plain-berry']);
 s.pension.mons[0].mon.shiny=true;s.pension.mons[1].mon.shiny=false;
 assert.deepEqual(groups(),['shiny','shiny-berry']);
 s.pension.mons[0].mon.noEgg=true;
 assert.deepEqual(groups(),[]);
});
test('legacy initialization follows the native counter rule only with both operands on an audited build',()=>{
 const s=state();delete s.pension.laid;s.stats.hatched=999;s.pension.eggs=[{uid:'x'}];const f=N.nurseryForecast(s,{build:N.NURSERY_RULES.build});assert.equal(f.known,true);assert.equal(f.counter,1000);assert.equal(f.counterSource,'native-initializer');
 assert.equal(N.nurseryForecast(s,{build:'unverified',estimateUnverified:true}).counter,null);
 const copy=structuredClone(s);delete copy.stats.hatched;assert.equal(N.nurseryForecast(copy).counter,null);
 delete s.pension.eggs;assert.equal(N.nurseryForecast(s).counter,null);
 for(const modify of [s=>delete s.trainer,s=>s.pension.mons=[],s=>s.pension.mons=[{mon:{id:132,uid:'ditto'}}],s=>s.pension.mons=[{mon:{id:6,uid:'fire'}}]]){const s=state();modify(s);assert.equal(N.nurseryForecast(s).known,false);}
});
test('forecast limits bound computation and an empty search is not a no-shiny promise',()=>{
 const s=state(),f=N.nurseryForecast(s,{limit:1});assert.equal(f.scanned,1);if(!f.nextEgg.shiny){assert.equal(f.nextShiny,null);assert.equal(f.truncated,true);assert.match(f.reason,/不代表/);}
 const huge=N.nurseryForecast(s,{limit:Infinity});assert.equal(huge.limit,20000);assert.equal(N.nurseryForecast(s,{limit:60000,count:1}).limit,50000);
 s.pension.laid=Number.MAX_SAFE_INTEGER;assert.equal(N.nurseryForecast(s).known,false);
});
test('snapshot counts known shiny eggs without inventing unknown outcomes or readiness',()=>{
 const s=state();s.pension.eggs=[{uid:'old',shiny:true,hatchAt:1000},{uid:'plain',shiny:false,hatchAt:3000,laidAt:1000,pa:{id:6}},{k:33,hatchAt:2000},{}];const before=JSON.stringify(s),snap=N.nurserySnapshot(s,{now:2000,forecast:false});
 assert.equal(snap.counts.total,4);assert.equal(snap.counts.known,3);assert.equal(snap.counts.unknown,1);assert.equal(snap.counts.ready,2);assert.equal(snap.capacity,4);assert.equal(snap.hatched,10);assert.equal(snap.counter,30);assert.equal(snap.forecast,null);
 assert.equal(snap.eggRows[1].parentId,6);assert.equal(snap.eggRows[1].remainingMs,1000);
 assert.equal(snap.eggRows[3].shiny,null);assert.equal(snap.eggRows[3].readyKnown,false);assert.equal(JSON.stringify(s),before);
});

test('malformed colour and bonus fields cannot silently classify eggs or forecast the parent pool',()=>{
 const s=state();
 for(const value of [null,'false',{},[],7]){
  for(const flag of ['shiny','sp','bx']){
   const result=N.eggOutcome(s,{k:13,[flag]:value});
   assert.equal(result.known,false,flag);assert.equal(result.shiny,null);
   if(flag!=='shiny')assert.equal(result.rate,null);
  }
  s.pension.bx=value;assert.equal(N.nurseryForecast(s).nextRate,null);assert.equal(N.nurseryForecast(s).known,false);
  s.pension.bx=0;s.pension.mons[0].mon.shiny=value;
  assert.equal(N.nurseryForecast(s).nextRate,null);assert.equal(N.nurseryForecast(s).nextEgg,null);
  s.pension.mons[0].mon.shiny=false;
 }
 assert.equal(N.eggOutcome(s,{shiny:1,bx:'broken'}).shiny,true);
 assert.equal(N.eggOutcome(s,{shiny:0,sp:'broken'}).shiny,false);
 assert.equal(N.nurseryEggRate({sp:true,bx:1}),.2);
 assert.equal(N.nurseryEggRate({sp:2}),1/16);
 assert.equal(N.nurseryEggRate({sp:'1'}),.1);
 assert.equal(N.nurseryEggRate({sp:'2',bx:true}),1/8);
});

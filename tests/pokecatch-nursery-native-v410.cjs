// Optional differential: node tests/pokecatch-nursery-native-v410.cjs PUBLIC_APP_JS
// Native code runs only in a synthetic VM with inert timers and memory-only saves.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const H=require('../Pokecatch自动助手.user.js'),nativeRuntime=require('../tools/pokecatch-native-vm.cjs');
const scope=vm.createContext({DATA:H.DATA,MONS:H.MONS});vm.runInContext(fs.readFileSync(path.join(__dirname,'../pokecatch-helper/src/models/nursery-model.js'),'utf8')+';globalThis.M={NURSERY_RULES,nurseryFixedRoll,nurseryEggRate,nurseryOffspringId,eggOutcome,nurseryParentPool,nurseryForecast};',scope);const M=scope.M;
assert.ok(process.argv[2],'Pass a downloaded public bundle');const R=nativeRuntime(process.argv[2]);
R.run('const N=__pcResearch,G=N.Game;G.load();N.Adventure.ensure();G.stopSaving();const BASE=structuredClone(G.S);let AUDIT_TIME=1000000000000;N.Clock={now:()=>AUDIT_TIME,sure:true};');
let comparisons=0;
const trainers=[{id:'synthetic-a',since:1700000000000},{id:'trainer:with|symbols',since:0},{id:'训练家✦',since:'2026-11-18T00:00:00Z'}];
const vectors=[];for(const trainer of trainers)for(const k of [0,1,7,30,127,1023,65535,9007199254740000])for(const draw of [0,1,2,3,10])vectors.push({trainer,k,draw});
const rolls=JSON.parse(R.run(`JSON.stringify(${JSON.stringify(vectors)}.map(v=>G.sandbox({...structuredClone(BASE),trainer:v.trainer},()=>G.fixedRoll('egg',v.k,v.draw))))`));
for(let i=0;i<vectors.length;i++){const v=vectors[i];assert.equal(M.nurseryFixedRoll({trainer:v.trainer},v.k,v.draw),rolls[i]);comparisons++;}
const eggs=[];for(const trainer of trainers)for(const k of [0,1,18,512,2048])for(const flags of [{},{sp:2},{sp:1},{sp:2,bx:1},{bx:1}])eggs.push({trainer,egg:{uid:'test-egg-'+k,k,id:25,laidAt:0,hatchAt:0,...flags}});
for(const egg of [{uid:'old',id:25,shiny:true},{uid:'old',id:25,shiny:false},{uid:'legacy-egg-1',id:25,sp:1},{uid:'legacy-egg-2',id:25,bx:1},{uid:'legacy-fraction',k:1.5,id:25},{id:25,laidAt:123}])eggs.push({trainer:trainers[0],egg:{hatchAt:0,...egg}});
const hatched=JSON.parse(R.run(`JSON.stringify(${JSON.stringify(eggs)}.map(v=>{const s={...structuredClone(BASE),trainer:v.trainer,mons:[],team:[],road:[],dex:{},seenShiny:{},pension:{mons:[],eggs:[v.egg]},stats:{...BASE.stats,hatched:0}};return G.sandbox(s,()=>{const rate=G.eggRate(v.egg),result=G.hatchEgg(v.egg.uid);return{rate,shiny:result?.mon?.shiny,ok:!!result?.mon};});}))`));
for(let i=0;i<eggs.length;i++){const e=eggs[i],actual=hatched[i];assert.ok(actual.ok,`native hatch ${i}`);const prediction=M.eggOutcome({trainer:e.trainer},e.egg);assert.equal(prediction.known,true);assert.equal(prediction.shiny,actual.shiny,`egg ${i}`);assert.equal(M.nurseryEggRate(e.egg),actual.rate);comparisons+=2;}
const eligibility=JSON.parse(R.run(`JSON.stringify(${JSON.stringify(H.DATA.mons.map(mon=>mon.id))}.map(id=>G.sandbox({...structuredClone(BASE),pension:{mons:[{mon:{id,uid:'candidate'}}],eggs:[]}},()=>G.pensionLayers().length>0)))`));
for(let i=0;i<H.DATA.mons.length;i++){const id=H.DATA.mons[i].id,s={pension:{mons:[{mon:{id,uid:'candidate'}}]}};assert.equal(M.nurseryParentPool(s).parents.length>0,eligibility[i],`parent ${id}`);comparisons++;}
const states=[];for(const trainer of trainers)for(const laid of [0,1,30,512])for(const bx of [0,1])states.push({trainer,mons:[],team:[],road:[],dex:{},stats:{hatched:0},pension:{laid,bx,tick:1000000000000-14400000,egg:0,mons:[{mon:{id:6,uid:'fire',shiny:false},candy:0},{mon:{id:132,uid:'ditto',shiny:true},candy:0},{mon:{id:9,uid:'water',shiny:true},candy:0},{mon:{id:490,uid:'manaphy',shiny:false},candy:0}],eggs:[],open:{eggs:4,slots:4}}});
const actualSequences=JSON.parse(R.run(`JSON.stringify(${JSON.stringify(states)}.map(input=>{const s={...structuredClone(BASE),...input},out=[];return G.sandbox(s,()=>{for(let i=0;i<12;i++){AUDIT_TIME=1000000000000+i*14400000;const k=s.pension.laid,parents=G.pensionLayers(),parent=parents[Math.floor(G.fixedRoll('egg',k,1)*parents.length)].mon;s.pension.eggs=[];G.pensionTick(AUDIT_TIME);const egg=s.pension.eggs[0];if(!egg)throw Error('Missing native synthetic egg');out.push({k:egg.k,id:egg.id,parent:parent.uid,sp:egg.sp||0,bx:!!egg.bx,rate:G.eggRate(egg),shiny:G.fixedRoll('egg',egg.k)<G.eggRate(egg)});}return out;});}))`));
for(let i=0;i<states.length;i++){const s=states[i],f=M.nurseryForecast(s,{limit:12,count:20}),pool=f.pool;for(let j=0;j<12;j++){const actual=actualSequences[i][j],k=s.pension.laid+j,parent=pool[Math.floor(M.nurseryFixedRoll(s,k,1)*pool.length)],bx=j===0&&!!s.pension.bx;assert.equal(actual.k,k);assert.equal(actual.id,parent.eggId);assert.equal(actual.parent,parent.uid);assert.equal(actual.sp,parent.shiny?2:0);assert.equal(actual.bx,bx);assert.equal(actual.rate,M.nurseryEggRate({sp:parent.shiny?2:0,bx}));assert.equal(actual.shiny,f.hits.some(row=>row.k===k));comparisons+=7;}}
const gifts=JSON.parse(R.run(`JSON.stringify(G.sandbox({...structuredClone(BASE),pension:{laid:10,bx:1,mons:[],eggs:[],open:{eggs:4}}},()=>{const egg=G.giftEgg(175,1000);return{counter:G.S.pension.laid,bx:G.S.pension.bx,k:egg.k,eggBx:!!egg.bx};}))`));
assert.deepEqual(gifts,{counter:11,bx:1,k:10,eggBx:false});comparisons+=4;
// First natural lay in an old save. Exercise the native initializer through the
// production tick, including already incubating eggs and a pending berry.
const legacyState=structuredClone(states[0]);
delete legacyState.pension.laid;
legacyState.stats.hatched=47;
legacyState.pension.eggs=[{uid:'incubating',id:1,hatchAt:1000000040000}];
legacyState.pension.bx=1;
const firstLay=JSON.parse(R.run(`JSON.stringify((()=>{const s={...structuredClone(BASE),...${JSON.stringify(legacyState)}};return G.sandbox(s,()=>{AUDIT_TIME=1000000000000;G.pensionTick(AUDIT_TIME);const egg=s.pension.eggs[1];return{k:egg.k,id:egg.id,bx:!!egg.bx,shiny:G.fixedRoll('egg',egg.k)<G.eggRate(egg)};});})())`));
const firstPrediction=M.nurseryForecast(legacyState,{build:M.NURSERY_RULES.build}).nextEgg;
assert.ok(firstPrediction,'Old save with complete initializer inputs should give a conditional forecast');
assert.deepEqual({k:firstPrediction.k,id:firstPrediction.eggId,bx:firstPrediction.bx,shiny:firstPrediction.shiny},firstLay);
comparisons+=4;
// Keep one native save through a gift, a parent reorder, a berry-boosted lay
// and a real hatch. A save that changes between these steps needs a new forecast.
const interrupted=JSON.parse(R.run(`JSON.stringify((()=>{
    const s={...structuredClone(BASE),...${JSON.stringify(states.at(-1))}};
    return G.sandbox(s,()=>{
        AUDIT_TIME=1000000000000;
        const before=structuredClone(s),gift=G.giftEgg(175,AUDIT_TIME);
        s.pension.mons.reverse();
        const afterGift=structuredClone(s);G.pensionTick(AUDIT_TIME);
        const egg=s.pension.eggs.find(row=>row.uid!==gift.uid);
        AUDIT_TIME=egg.hatchAt+1;
        const hatched=G.hatchEgg(egg.uid);
        return{before,afterGift,gift,egg,actual:hatched.mon.shiny,pendingBerry:!!s.pension.bx};
    });
})())`));
const beforeGift=M.nurseryForecast(interrupted.before).nextEgg,afterGift=M.nurseryForecast(interrupted.afterGift).nextEgg;
assert.equal(beforeGift.k,interrupted.gift.k);
assert.equal(afterGift.k,beforeGift.k+1);
assert.equal(afterGift.k,interrupted.egg.k);
assert.equal(afterGift.eggId,interrupted.egg.id);
assert.equal(afterGift.bx,true);assert.equal(interrupted.pendingBerry,false);
assert.equal(afterGift.shiny,interrupted.actual);
assert.equal(M.eggOutcome(interrupted.afterGift,interrupted.egg).shiny,interrupted.actual);
comparisons+=8;
const offspringCases=[];for(let region=0;region<H.DATA.regions.length;region++)for(const id of [25,26,35,36,39,40,106,107,113,122,124,125,126,143,176,183,185,202,315,358,448,489,490,41201,41302,6])offspringCases.push({id,open:H.DATA.regions.slice(0,region+1).map(r=>r.key),chapter:H.DATA.regions[region].start});
const offspring=JSON.parse(R.run(`JSON.stringify(${JSON.stringify(offspringCases)}.map(v=>{for(const region of N.STORY.REGIONS)region.open=v.open.includes(region.key);AUDIT_TIME=1000000000000;const s={...structuredClone(BASE),mons:[],team:[],road:[],dex:{},travel:{to:v.open.slice(1)},adv:{...BASE.adv,chapter:v.chapter,unlocked:v.chapter+1},pension:{laid:0,tick:AUDIT_TIME-14400000,egg:0,mons:[{mon:{id:132,uid:'d'},candy:0},{mon:{id:v.id,uid:'p'},candy:0}],eggs:[],open:{eggs:4}}};return G.sandbox(s,()=>{G.pensionTick(AUDIT_TIME);return s.pension.eggs[0]?.id;});}))`));
for(let i=0;i<offspringCases.length;i++){const c=offspringCases[i];assert.equal(M.nurseryOffspringId({travel:{to:c.open.slice(1)},adv:{chapter:c.chapter}},c.id),offspring[i],`offspring ${c.id} in ${c.open}`);comparisons++;}
console.log(JSON.stringify({pass:true,comparisons,fixedRolls:vectors.length,actualHatches:eggs.length,eligibleSpecies:eligibility.length,naturalSequences:states.length*12,offspringCases:offspringCases.length,giftCounter:true,source:path.basename(process.argv[2])}));

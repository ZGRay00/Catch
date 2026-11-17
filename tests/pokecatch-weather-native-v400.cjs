// Optional differential against the public bundle, in an isolated synthetic VM.
const assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js'),nativeRuntime=require('../tools/pokecatch-native-vm.cjs');
try{
 const runtime=nativeRuntime(process.argv[2]);runtime.run('const N=__pcResearch;N.Game.load();N.Adventure.ensure();N.Game.stopSaving();N.Game.S.adv.unlocked=N.STORY.CHAPTERS.length-1;N.DAYTIME.force(null);N.DAYTIME.forceSeason(null);N.WEATHER.force(null);');
 const base=new Date(2026,10,17,0).getTime(),cases=[];
 for(const chapter of H.DATA.chapters)for(let i=0;i<24;i+=3)cases.push({ch:chapter.id,at:base+i*3600000});
 const result=runtime.run(`JSON.parse(JSON.stringify(${JSON.stringify(cases)}.map(({ch,at})=>{N.Clock={now:()=>at};N.Game.S.adv.chapter=ch;const chapter=N.STORY.CHAPTERS[ch],routes=chapter.steps.filter(r=>r.kind==='route'),weights=${JSON.stringify(H.WEATHER_DATA.chapters.map(c=>c.weights))}[ch],sums=new Map();const key=N.WEATHER.current({ch,name:'synthetic-weather-probe',bg:'prairie',indoor:false,climate:weights||{}});
 routes.forEach((r,i)=>{if(!r.wild)return;const node={...r,ch,lv:r.lv||N.STORY.routeBand(ch,i,routes.length)};for(const row of N.Adventure.zonePool(node,ch,true,null,true))if(row.on!==false&&row.pct>0)sums.set(row.id,(sums.get(row.id)||0)+r.wild*row.pct);});return{key,pool:[...sums]};})))`);
 for(let i=0;i<cases.length;i++){const{ch,at}=cases[i],s={adv:{chapter:ch,unlocked:83},roam:{at:{},caught:[]}};assert.equal(H.chapterWeather(s,ch,at).key,result[i].key,`chapter ${ch} sky ${new Date(at)}`);const expected=new Map(result[i].pool),actual=H.weatherEncounterPool(s,ch,at);assert.deepEqual([...actual.keys()],[...expected.keys()].sort((a,b)=>a-b),`chapter ${ch} at ${new Date(at)} sky ${result[i].key} species`);for(const[id,n]of expected)assert.ok(Math.abs(actual.get(id)-n)<.000002,`chapter ${ch} mon ${id}: ${actual.get(id)} vs ${n}`);}
 console.log(`PASS: ${cases.length} native sky and complete encounter-pool comparisons`);
}catch(error){console.error(error.message);process.exitCode=1;}



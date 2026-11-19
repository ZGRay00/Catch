// Rebuild weather metadata from a downloaded public native bundle using synthetic state.
// The VM has isolated memory storage, inert timers, and no external network access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),nativeRuntime=require('./pokecatch-native-vm.cjs'),{validateData}=require('./build.cjs');
const {createHash}=require('node:crypto');
function main(){
 const out=process.argv[3]||path.resolve(__dirname,'../data/weather.json');assert.ok(process.argv[2],'Usage: node tools/extract-pokecatch-weather.cjs bundle.js [output.json]');
 const runtime=nativeRuntime(process.argv[2]);
 const build=process.env.POKECATCH_BUILD?.trim()||'sha256:'+createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex');
 const result=runtime.run(`(()=>{
   const N=__pcResearch,G=N.Game,A=N.Adventure,S=N.STORY,D=N.DAYTIME,W=N.WEATHER,C=N.CONFIG.WEATHER;G.load();A.ensure();G.stopSaving();G.S.adv.unlocked=S.CHAPTERS.length-1;
   const tables=[],refs=new Map(),intern=pool=>{const text=JSON.stringify(pool);if(!refs.has(text)){refs.set(text,tables.length);tables.push(pool);}return refs.get(text);};
   const keys=['clear',...Object.keys(C.TYPES)],chapters=[],dailySpots=N.CONFIG.DAILY_SPOTS;
   for(let id=0;id<S.CHAPTERS.length;id++){
    const chapter=S.CHAPTERS[id],routes=chapter.steps.filter(r=>r.kind==='route'),weights={};G.S.adv.chapter=id;
    const nodes=routes.map((r,i)=>{const node={...r,ch:id,lv:r.lv||S.routeBand(id,i,routes.length)},climate=W.climateOf(node),indoor=D.indoorNode(node);if(!r.indoor)for(const[k,v]of Object.entries(climate||{}))weights[k]=(weights[k]||0)+v;return{node,climate,indoor};});
    const collect=spots=>{N.CONFIG.DAILY_SPOTS=spots;const pools={},direct={};
    for(const season of ['spring','summer','autumn','winter']){D.forceSeason(season);pools[season]={};direct[season]={};
     for(const phase of ['morning','day','night']){D.force(phase);pools[season][phase]={};direct[season][phase]={};
      for(const sky of keys)for(const forced of [false,true]){
       const sums=new Map();
       for(const{node,climate,indoor}of nodes){if(!node.wild)continue;let actual=sky==='clear'?null:sky;
        if(!forced&&!chapter.weather&&node.weather===undefined){const ok=k=>climate?.[k]&&!(phase==='night'&&C.TYPES[k]?.daylight);actual=actual&&ok(actual)?actual:(C.TRANSLATE[actual]||[]).find(ok)||null;}
        if(indoor)actual=null;W.force(actual||'clear');
        for(const row of A.zonePool(node,id,true,null,true))if(row.on!==false&&row.pct>0)sums.set(row.id,(sums.get(row.id)||0)+node.wild*row.pct);
       }
       (forced?direct:pools)[season][phase][sky]=intern([...sums].sort((a,b)=>a[0]-b[0]).map(([id,n])=>[id,+n.toFixed(6)]));
      }
     }
    }
    return{pools,direct};};
    const fixed=dailySpots.filter(spot=>spot.zones.length===1&&!spot.rare),variants={};
    for(const[spotIndex,spot]of dailySpots.entries())if(!fixed.includes(spot))for(const zone of spot.zones){
     if(!routes.some(route=>{const key=A.habitatKey(route);return key===zone||key?.startsWith(zone+'|');}))continue;
     variants[spotIndex+':'+zone]=collect([...fixed,{...spot,zones:[zone],rare:undefined}]);
    }
    const metadata=chapter.steps.map(step=>({kind:step.kind,name:step.name,bg:step.bg,...step.id?{id:step.id}:{},...step.once?{once:step.once}:{},indoor:D.indoorNode({...step,ch:id}),climate:W.climateOf({...step,ch:id}),...step.weather!==undefined?{weather:step.weather}:{},...step.weatherDamage?{weatherDamage:step.weatherDamage}:{}}));
    chapters.push({id,weights:Object.keys(weights).length?weights:null,fixed:chapter.weather||null,...collect(fixed),variants,nodes:metadata});
   }
   N.CONFIG.DAILY_SPOTS=dailySpots;D.force(null);D.forceSeason(null);W.force(null);
   return{schema:2,build:${JSON.stringify(build)},slotMs:C.SLOT_MS,chance:C.CHANCE,types:C.TYPES,translate:C.TRANSLATE,nightDamage:N.CONFIG.NIGHT_DAMAGE,roamingWeather:N.CONFIG.ROAMING.WEATHER,dailySpots,chapters,tables};
  })()`);
 assert.equal(result.chapters.length,84);assert.equal(result.chance,.54);assert.ok(result.tables.length>100);
 validateData('WEATHER_DATA',result);fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(`Extracted ${result.chapters.length} chapters / ${result.tables.length} unique tables to ${out}`);
}
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={main};

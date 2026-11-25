// Extract the six event-unlocked wild sources from the public game in an isolated save.
const fs=require('node:fs'),path=require('node:path');
const nativeRuntime=require('./pokecatch-native-vm.cjs');
const data=nativeRuntime(process.argv[2]).run(`(()=>{
    const {Game:G,Adventure:A,STORY:S,DAYTIME:D,WEATHER:W,CONFIG:C}=__pcResearch;
    G.load(); A.ensure(); G.stopSaving(); G.S.adv.unlocked=S.CHAPTERS.length-1;
    G.S.adv.gifts||={}; G.S.dex[479]={caught:1};
    const spots=C.DAILY_SPOTS,fixed=spots.filter(spot=>spot.zones.length===1&&!spot.rare);
    const tables=[],sources=[];
    for(const chapter of [49,52,55,65]){
        G.S.adv.chapter=chapter;
        const steps=S.CHAPTERS[chapter].steps,routes=steps.filter(step=>step.kind==='route');
        for(const spec of steps.filter(step=>step.once?.startsWith('rotom-'))){
            G.S.adv.gifts[spec.once]=true;
            const name=spec.id===479?'Vieux Château':spec.name,index=routes.findIndex(route=>route.name===name);
            const r=routes[index],node={...r,ch:chapter,lv:r.lv||S.routeBand(chapter,index,routes.length)};
            const source={id:spec.id,chapter,once:spec.once,name,variants:{}};
            const variants=[['base',fixed]];
            for(const [i,spot] of spots.entries())if(!fixed.includes(spot)&&spot.zones.includes(name)){
                variants.push([i,[...fixed,{...spot,zones:[name],rare:undefined}]]);
            }
            for(const [key,active] of variants){
                C.DAILY_SPOTS=active;
                const refs=[];
                for(const season of ['spring','summer','autumn','winter']){
                    D.forceSeason(season);
                    for(const phase of ['morning','day','night']){
                        D.force(phase);
                        const weights={};
                        for(const sky of ['clear',...Object.keys(C.WEATHER.TYPES)]){
                            W.force(sky);
                            const hit=A.zonePool(node,chapter,true,null,true).find(row=>row.id===spec.id&&row.on!==false);
                            if(hit?.pct>0)weights[sky]=+(node.wild*hit.pct).toFixed(8);
                        }
                        const serial=JSON.stringify(weights);
                        let table=tables.indexOf(serial);
                        if(table===-1){table=tables.length;tables.push(serial);}
                        refs.push(table);
                    }
                }
                source.variants[key]=refs;
            }
            sources.push(source);
        }
    }
    return {sources,tables:tables.map(t=>JSON.parse(t))};
})()`);
if(data.sources.length!==6||data.sources.some(s=>!s.variants.base.some(i=>Object.keys(data.tables[i]).length)))throw Error('Incomplete Rotom encounter rules');
fs.writeFileSync(path.resolve(__dirname,'../data/rotom.json'),JSON.stringify(data)+'\n');

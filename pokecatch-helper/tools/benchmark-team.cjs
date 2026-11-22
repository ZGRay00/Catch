// node --expose-gc benchmark-team.cjs [userscript] [repetitions]
const path=require('node:path'),assert=require('node:assert/strict');
const H=require(path.resolve(require.main===module&&process.argv[2]||path.join(__dirname,'../../Pokecatch自动助手.user.js')));
const repeats=Number(process.argv[3]||11),clock=Date.UTC(2026,10,19,4),ids=[609,534,567,503,625,525];
const mode=process.env.POKECATCH_BENCH_MODE||'progress';
function fixture(size){
    const mons=Array.from({length:size},(_,i)=>({uid:'m'+i,id:ids[i]||1+(i*137%649),level:i===2?69:70,reg:'unova'}));
    return {mons,team:mons.slice(0,6).map(m=>m.uid),autoSwitch:true,adv:{chapter:76,unlocked:76,badges:[],gifts:{},deaths:{}}};
}
function simulation(s,objective){
    const state=structuredClone(s);
    if(objective==='train')state.adv.badges.push('Maître Unys');
    return{state,settings:objective==='train'?{mode:'train',trainUid:'selected',trainUids:['m2'],trainLevel:100}:{mode:objective}};
}
function quality(s,uids){
    const foes=H.chapterCombatFoes(s,H.DATA.chapters[76]),team=uids.map(uid=>s.mons.find(m=>m.uid===uid));
    const fights=foes.map(f=>team.map(m=>H.matchupDetails(m,f,H.effectiveStats(m),H.effectiveStats(f),H.combatWeather(s,f,{},clock))));
    function evaluate(omit){
        let turns=0,deaths=0,worst=0,weight=0,keyTurns=0,keyCount=0;
        fights.forEach((row,i)=>{const b=H.deployedBattle(row.filter((_,j)=>j!==omit),true),w=foes[i].weight;
            turns+=w*b.turns;deaths+=w*b.deaths;weight+=w;worst=Math.max(worst,b.turns);
            keyCount+=foes[i].gymCount||0;keyTurns+=(foes[i].gymCount||0)*b.turns;});
        return {turns:turns/weight,deaths:deaths/weight,worst,keyTurns:keyTurns/Math.max(1,keyCount)};
    }
    const full=evaluate(-1);
    return {...full,ids:team.map(m=>m.id),omitTurnDelta:team.map((_,i)=>+(evaluate(i).turns-full.turns).toFixed(3))};
}
async function run(s){
    const {state,settings}=simulation(s,mode);s=state;
    const e=new H.Engine({getItem:()=>null},settings);e.running=true;
    const timers=[],slices=[],native=global.setTimeout,start=performance.now(),cache=H.teamCacheStats();
    const timed=fn=>{const t=performance.now();fn();slices.push(performance.now()-t);};
    try{
        global.setTimeout=fn=>{timers.push(fn);return 0;};
        let now=clock,windows=0,first;
        do{
            timed(()=>e.fitTeam(s,now));
            while(timers.length){await new Promise(r=>native(r,1));timed(timers.shift());}
            if(e.teamSearch)timed(()=>e.fitTeam(s,now));
            assert.ok(e.teamCheck);
            first??=e.driver.teamTask?.uids||s.team;
            if(e.teamCheck.limited&&e.driver.teamTask){s.team=e.driver.teamTask.uids;s.road=s.team.slice();e.driver.teamTask=null;}
            assert.ok(++windows<60);now+=5001;
        }while(e.teamCheck.limited);
        const end=performance.now(),hits=H.teamCacheStats().hits-cache.hits;
        timed(()=>e.fitTeam(s,now-5000));assert.equal(timers.length,0);
        return {wall:end-start,max:Math.max(...slices),hits,windows,first,uids:e.driver.teamTask?.uids||s.team};
    }finally{global.setTimeout=native;}
}
module.exports={fixture,clock,quality,simulation};
if(require.main===module)(async()=>{
    for(const size of [18,90,300]){
        const s=fixture(size),cold=[],hot=[],heap=[];
        for(let i=0;i<repeats;i++){
            H.clearTeamCache();global.gc?.();const before=process.memoryUsage().heapUsed;
            cold.push(await run(s));hot.push(await run(s));global.gc?.();heap.push((process.memoryUsage().heapUsed-before)/1048576);
        }
        const quant=(arr,q)=>+arr.slice().sort((a,b)=>a-b)[Math.ceil(q*arr.length)-1].toFixed(2);
        const stats=a=>({p50:quant(a.map(r=>r.wall),.5),p95:quant(a.map(r=>r.wall),.95),maxSlice:quant(a.map(r=>r.max),1),hits:a.at(-1).hits,windows:Math.max(...a.map(r=>r.windows))});
        console.log(JSON.stringify({mode,size,repeats,cold:stats(cold),hot:stats(hot),heapMiB:quant(heap,.5),quality:quality(s,cold.at(-1).uids),initial:size===18?quality(s,s.team):undefined}));
    }
})().catch(e=>{console.error(e);process.exitCode=1});

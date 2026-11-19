// Optional differential against a downloaded public bundle, using only synthetic state.
const assert = require('node:assert/strict');
const helper = require('../Pokecatch自动助手.user.js');
const nativeRuntime = require('../tools/pokecatch-native-vm.cjs');

function main() {
    const runtime = nativeRuntime(process.argv[2]);
    runtime.run(`const N=__pcResearch; N.Game.load(); N.Adventure.ensure(); N.Game.stopSaving();
        N.Game.S.adv.unlocked=N.STORY.CHAPTERS.length-1;
        N.DAYTIME.force(null); N.DAYTIME.forceSeason(null); N.WEATHER.force(null);`);
    const dates = Array.from({length:40}, (_,i)=>new Date(2026,9,23+i,12,12).getTime());
    const boundaries = runtime.run(`JSON.parse(JSON.stringify(${JSON.stringify(dates)}.map(at=>[N.DAYTIME.season(at).key,N.DAYTIME.seasonUntil(at)])))`);
    dates.forEach((at,i)=>{
        const period=helper.seasonWindow(at);
        assert.equal(period.key,boundaries[i][0]);
        assert.equal(period.endsAt,boundaries[i][1]);
        assert.equal(helper.seasonWindow(period.startsAt-1).endsAt,period.startsAt);
    });
    const cases = [];
    for (const month of [1, 4, 7, 10]) {
        for (const chapter of helper.DATA.chapters) {
            for (let hour = 0; hour < 24; hour += 3) {
                cases.push({ ch: chapter.id, at: new Date(2026, month, 17, hour).getTime() });
            }
        }
    }
    const result = runtime.run(`JSON.parse(JSON.stringify(${JSON.stringify(cases)}.map(({ch,at})=>{
        N.Clock={now:()=>at};
        N.Game.S.adv.chapter=ch;
        const chapter=N.STORY.CHAPTERS[ch], routes=chapter.steps.filter(r=>r.kind==='route');
        const weights={}, sums=new Map();
        routes.forEach((route,i)=>{
            const node={...route,ch,lv:route.lv||N.STORY.routeBand(ch,i,routes.length)};
            if(!route.indoor) for(const [sky,weight] of Object.entries(N.WEATHER.climateOf(node)||{})) {
                weights[sky]=(weights[sky]||0)+weight;
            }
            if(!route.wild)return;
            for(const row of N.Adventure.zonePool(node,ch,true,null,true)) {
                if(row.on!==false&&row.pct>0) sums.set(row.id,(sums.get(row.id)||0)+route.wild*row.pct);
            }
        });
        const key=N.WEATHER.current({ch,name:'synthetic-weather-probe',bg:'prairie',indoor:false,climate:weights});
        return {key,pool:[...sums]};
    })))`);
    for (const [i, {ch, at}] of cases.entries()) {
        const s = {adv:{chapter:ch,unlocked:helper.DATA.chapters.at(-1).id},roam:{at:{},caught:[]}};
        const expected = new Map(result[i].pool), actual = helper.weatherEncounterPool(s,ch,at);
        const where = `chapter ${ch} at ${new Date(at).toISOString()}`;
        assert.equal(helper.chapterWeather(s,ch,at).key,result[i].key,where+' sky');
        assert.deepEqual([...actual.keys()],[...expected.keys()].sort((a,b)=>a-b),where+' species');
        for(const [id,weight] of expected) {
            assert.ok(Math.abs(actual.get(id)-weight)<.000002,`${where} mon ${id}: ${actual.get(id)} vs ${weight}`);
        }
    }
    console.log(`PASS: ${dates.length} native season windows and ${cases.length} native sky and complete encounter-pool comparisons`);
}

try { main(); }
catch (error) { console.error(error.message); process.exitCode=1; }

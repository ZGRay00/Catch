// Optional targeted weather-damage differential. Synthetic native VM only.
// node tests/pokecatch-weather-combat-native-v400.cjs PATH_TO_PUBLIC_APP_JS
const assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js'),runtime=require('../tools/pokecatch-native-vm.cjs')(process.argv[2]);
runtime.run('const N=__pcResearch;N.Game.load();N.Adventure.ensure();N.Game.stopSaving();N.Game.S.adv.unlocked=83;N.DAYTIME.force(null);N.DAYTIME.forceSeason(null);N.WEATHER.force(null);');
const nodes=[[35,H.WEATHER_DATA.chapters[35].nodes[0]],[6,H.WEATHER_DATA.chapters[6].nodes.find(node=>node.kind==='route'&&node.indoor)]];
let checks=0;
for(const [ch,base]of nodes)for(const hour of [12,22])for(const override of [{},{weather:'rain'},{weather:'rain',weatherDamage:{electric:1.25}}]){
    const at=new Date(2026,10,17,hour).getTime(),node={name:base.name,bg:base.bg,ch,type:'wild',...override};
    const native=JSON.parse(runtime.run(`JSON.stringify((()=>{N.Clock={now:()=>${at}};N.Game.S.adv.chapter=${ch};const node=${JSON.stringify({...base,...node})};return Object.fromEntries(${JSON.stringify(Object.keys(H.DATA.types))}.map(type=>[type,N.WEATHER.damageMult(node,type)]));})())`));
    const s={adv:{chapter:ch,unlocked:83,node:0,nodes:[node]},roam:{at:{},caught:[]}},actual=H.combatWeather(s,{chapter:ch,liveNode:true},{},at).weather;
    assert.deepEqual(actual,native,JSON.stringify({ch,hour,override}));checks+=Object.keys(actual).length;
}
console.log(`PASS: ${checks} production-context/native weather damage comparisons (outdoor, indoor, night and whole-table overrides).`);

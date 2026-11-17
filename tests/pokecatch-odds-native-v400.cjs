// Optional differential check against a downloaded public game build.
// Synthetic VM only: no reference extension, browser account, timers or network.
// node tests/pokecatch-odds-native-v400.cjs PATH_TO_PUBLIC_APP_JS
const path=require('node:path'),assert=require('node:assert/strict');
const runtime=require('../tools/pokecatch-native-vm.cjs'),H=require('../Pokecatch自动助手.user.js');
assert.ok(process.argv[2],'Pass the downloaded public app bundle path');
const native=runtime(process.argv[2]);
const result=JSON.parse(native.run(`JSON.stringify((()=>{
    const N=__pcResearch,G=N.Game;G.load();G.stopSaving?.();N.Adventure.ensure();
    const S=G.S;S.mons=[];S.team=[];S.road=[];S.dex={};S.buffs={};S.items={};
    const out={base:G.shinyRate('kanto'),eggs:[{},{sp:2},{sp:1},{bx:1},{sp:2,bx:1},{sp:1,bx:1}].map(e=>G.eggRate({...e,reg:'kanto'}))};
    for(const id of G.regionDexIds(N.STORY.REGIONS.find(r=>r.key==='kanto')))G.registerDex(id,false,'kanto');
    out.full=G.shinyRate('kanto');out.other=G.shinyRate('johto');
    S.items['starf-berry']=1;G.useBuffBerry('starf-berry');out.wildBuff=G.shinyRate('kanto')*G.buffMult('shiny');
    out.state=JSON.parse(JSON.stringify(S));
    out.regions=N.STORY.REGIONS.filter(reg=>reg.key&&reg.dex).map(reg=>({key:reg.key,ids:G.regionDexIds(reg)}));return out;
})())`));
let checks=0;const same=(a,b)=>{assert.equal(a,b);checks++;};
same(H.shinyOdds({dex:{},adv:{chapter:0}}).rate,result.base);
same(H.shinyOdds(result.state,{region:'kanto'}).rate,result.wildBuff);
same(H.shinyOdds(result.state,{kind:'underground',region:'kanto'}).rate,result.full);
same(H.shinyOdds(result.state,{region:'johto'}).rate,result.other*2);
for(const [i,egg]of [{},{sp:2},{sp:1},{bx:1},{sp:2,bx:1},{sp:1,bx:1}].entries())same(H.shinyOdds(result.state,{kind:'egg',egg}).rate,result.eggs[i]);
for(const region of result.regions){
    const model=H.DATA.regions.find(row=>row.key===region.key);assert.ok(model);
    const ids=H.DATA.mons.filter(mon=>mon.id>=model.dexRange[0]&&mon.id<=model.dexRange[1]).map(mon=>mon.id);
    assert.deepEqual(ids,region.ids);checks++;
    const s={dex:Object.fromEntries(region.ids.map(id=>[id,{}])),adv:{chapter:0}};
    same(H.shinyOdds(s,{region:region.key}).rate,1/1024);delete s.dex[region.ids.at(-1)];same(H.shinyOdds(s,{region:region.key}).rate,1/2048);
}
console.log(JSON.stringify({pass:true,checks,bundle:path.basename(process.argv[2]),isolation:'synthetic VM, memory-only storage, stopped timers and no network'}));

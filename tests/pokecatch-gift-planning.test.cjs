const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
function state(){return{mons:[],team:[],dex:Object.fromEntries(H.DATA.mons.map(m=>[m.id,{caught:1}])),items:{},travel:{to:['johto','hoenn','sinnoh','unova']},
    adv:{chapter:5,unlocked:83,badges:['Maître','Maître Hoenn'],gifts:{}}};}
const cfg={...H.DEFAULTS,region:'current'};
test('disabled gift automation does not advertise a gift-only dex destination',()=>{
    const s=state();delete s.dex[106];const rows=H.dexRanking(s,{...cfg,gifts:false});assert.deepEqual(rows,[]);
});
test('enabled gift automation still plans the missing dojo choice',()=>{
    const s=state();delete s.dex[106];const row=H.dexRanking(s,{...cfg,gifts:true}).find(r=>r.id===5);
    assert.ok(row);assert.ok(row.targets.some(m=>m.id===106&&m.gift));
});
test('disabling gift choices preserves wild goals in the same chapter',()=>{
    const s=state(),chapter=H.DATA.chapters[5],phase=H.phaseAt(s),id=chapter.pools[phase][0][0];delete s.dex[106];delete s.dex[id];
    const row=H.dexRanking(s,{...cfg,gifts:false}).find(r=>r.id===5);assert.ok(row);assert.ok(row.targets.some(m=>m.id===id));assert.ok(!row.targets.some(m=>m.gift));
});
test('claimed gifts stay excluded even when automated gift choices are enabled',()=>{
    const s=state();delete s.dex[106];s.adv.gifts.dojo=true;assert.ok(!H.dexRanking(s,{...cfg,gifts:true}).some(r=>r.targets.some(m=>m.id===106&&m.gift)));
});

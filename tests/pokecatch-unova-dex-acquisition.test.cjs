const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const cfg={...H.DEFAULTS,region:'current'};
const noon=new Date(2026,10,18,12).getTime();
function state(missing){
    const dex=Object.fromEntries(H.ROOTS.filter(m=>m.id!==missing).map(m=>[m.id,{caught:1}]));
    return {mons:[],team:[],dex,items:{},travel:{to:['johto','hoenn','sinnoh','unova']},pension:{eggs:[],open:{eggs:1}},
        adv:{chapter:74,unlocked:83,badges:['Maître Unys'],gifts:{},nodes:[],node:0}};
}
test('Alomomola is offered in ripple chapters; no common wild or gift outcome is implied',()=>{
    const s=state(594),sources=H.acquisitionSources(s,594,noon);
    assert.deepEqual([...new Set(sources.filter(row=>row.kind==='phenomenon').map(row=>row.chapter))],[74,83]);
    assert.ok(!sources.some(row=>row.kind==='wild'));
    const rows=H.dexRanking(s,cfg,{},noon);
    assert.ok(rows.length&&rows.every(row=>row.targets.some(hit=>hit.id===594&&hit.kind==='phenomenon')));
    s.adv.unlocked=73;s.adv.chapter=72;
    assert.equal(H.dexRanking(s,cfg,{},noon).length,0);
    assert.ok(H.acquisitionSources(s,594,noon).every(row=>!row.available));
});
test('an existing wild ripple wins over route cooldown; an item ripple does not',()=>{
    const s=state(594),until=noon+600000,cooldowns={74:until,83:until};
    s.adv.nodes=[{name:'Route 8',type:'wild',phenom:'ripple',bg:'lake'}];
    assert.equal(H.dexRanking(s,cfg,cooldowns,noon)[0]?.id,74);
    s.adv.nodes[0].type='item';assert.equal(H.dexRanking(s,cfg,cooldowns,noon).length,0);
    s.adv.nodes[0].type='wild';s.adv.node=1;assert.equal(H.dexRanking(s,cfg,cooldowns,noon).length,0);
});
test('Ducklett retains its ordinary encounter source on a map that also has bridge shadows',()=>{
    const s=state(580);
    const row=H.dexRanking(s,cfg,{},noon).find(chapter=>chapter.id===71);
    assert.ok(row?.targets.some(hit=>hit.id===580&&hit.kind==='phenomenon'));
    assert.equal(row.hasWild,true);
});
test('Larvesta is collected as a base form only after hatch; Volcarona has an explicit level 59 evolution',()=>{
    const s=state(636);s.adv.chapter=69;
    const route=H.acquisitionSources(s,636,noon).find(row=>row.kind==='lootEgg');assert.equal(route.chapter,69);
    s.pension.eggs=[{id:636,hatchAt:noon+600000}];
    assert.ok(H.dexStatus(s,cfg).ids.has(636));
    assert.equal(H.dexRanking(s,cfg,{},noon).length,0);
    assert.ok(H.acquisitionSources(s,636,noon).some(row=>row.kind==='incubating'&&!row.available));
    s.mons.push({uid:'in-party',id:636,reg:'unova',level:58});s.pension.eggs=[];s.team=['in-party'];
    assert.ok(!H.dexStatus(s,cfg).ids.has(636));
    const evo=()=>H.acquisitionSources(s,637,noon).find(row=>row.kind==='evolution'&&row.fromId===636);
    assert.match(evo().detail,/59/);assert.equal(evo().available,false);
    s.mons[0].level=59;assert.equal(evo().available,true);assert.ok(!H.captured(s,637));
});
test('a spent fossil and a claimed gift remain distinguishable from usable sources',()=>{
    const s=state(564);s.items['cover-fossil']=1;
    assert.ok(H.acquisitionSources(s,564,noon).some(row=>row.kind==='trade'&&row.chapter===67&&row.available));
    s.items['cover-fossil']=0;assert.ok(H.acquisitionSources(s,564,noon).some(row=>row.kind==='trade'&&!row.available));
    s.adv.gifts['starter-unova']=495;
    assert.ok(H.acquisitionSources(s,495,noon).some(row=>row.kind==='gift'&&!row.available&&row.detail.includes('已领取')));
});
test('owning only Volcarona enables a breeding alternative while the Larvesta chain remains missing',()=>{
    const s=state(636);s.adv.gifts['egg:636']=true;
    s.mons=[{uid:'v',id:637,reg:'unova',level:80},{uid:'d',id:132,reg:'unova',level:50}];
    assert.ok(H.dexStatus(s,cfg).ids.has(636));
    assert.ok(H.acquisitionSources(s,636,noon).some(row=>row.kind==='breed'&&row.available&&row.detail.includes('火神蛾')));
    s.team=['v'];assert.ok(!H.acquisitionSources(s,636,noon).some(row=>row.kind==='breed'&&row.available));
});

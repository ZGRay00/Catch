const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const state=()=>({mons:[{uid:'a',id:495,reg:'unova',level:10}],team:['a'],dex:{},money:1000,travel:{to:['johto','hoenn','sinnoh','unova']},
    adv:{chapter:66,unlocked:68,badges:[],gifts:{'starter-unova':495},loops:[]}});

test('the current snapshot covers Unova and keeps all structural references usable',()=>{
    assert.equal(H.DATA.build,'b05c8cc201');assert.equal(H.DATA.dexMax,649);assert.equal(H.DATA.mons.length,722);assert.equal(H.DATA.chapters.length,84);
    const unova=H.DATA.regions.find(r=>r.key==='unova');assert.deepEqual(unova.dexRange,[494,649]);assert.equal(unova.start,66);assert.equal(unova.end,83);
    assert.deepEqual(H.encounterDataErrors(),[]);assert.ok(H.DATA.mons.every(m=>H.MONS.has(m.root)));
    assert.ok(H.DATA.chapters.every(c=>c.units>0&&Number.isFinite(c.reward)&&c.foes.length>0));
});
test('mainline settings support the full current story and preserve an explicitly saved older goal',()=>{
    assert.equal(H.DEFAULTS.progressUntil,83);assert.equal(H.normalizeSettings({progressUntil:999}).progressUntil,83);assert.equal(H.normalizeSettings({progressUntil:65}).progressUntil,65);
});
test('Unova planning includes the expanded routes, the new gym member and the actual first league room',()=>{
    const basic=H.DATA.chapters[67],electric=H.DATA.chapters[70],league=H.DATA.chapters[77];
    assert.deepEqual([basic.wild,basic.trainers,basic.reward,basic.xpEstimate],[10,14,7398,3493]);
    assert.ok(electric.gymFoes.some(([id,level])=>id===596&&level===36));
    const trainers=[[510,74],[20,74],[505,75],[531,75],[553,76],[167,76],[518,76],[168,77],[609,77],[552,77]];
    const expected=[...league.gymFoes.map(([id,level])=>[id,level,3]),...trainers.map(([id,level])=>[id,level,1])];
    assert.deepEqual(league.foes,expected);
    assert.equal(league.xpEstimate,126517);
});
test('Unova dex completion uses basic forms and current-region map planning',()=>{
    const s=state(),cfg={...H.DEFAULTS,region:'current'};let dex=H.dexStatus(s,cfg);
    assert.ok(dex.roots.some(m=>m.id===495));assert.ok(!dex.roots.some(m=>m.id===497));assert.ok(dex.roots.every(m=>m.id>=494&&m.id<=649));
    assert.ok(!dex.ids.has(495),'a captured basic completes the Snivy chain');assert.ok(dex.ids.has(498));
    const rows=H.candidates(s,cfg);assert.ok(rows.length);assert.ok(rows.every(r=>r.reg==='unova'));assert.ok(H.dexRanking(s,cfg).length);
    assert.equal(H.normalizeSettings({shinyId:495}).shinyId,495);assert.ok(H.shinyRanking(s,{...cfg,shinyId:504}).length);
});
test('the Unova monkey gift follows the chosen starter rather than advertising all branches',()=>{
    const s=state(),gift=H.DATA.chapters[66].gifts.find(g=>g.key==='ogoesse-monkey');assert.ok(gift?.byStarter);
    assert.deepEqual(H.giftChoices(s,gift),[515]);s.adv.gifts['starter-unova']=498;assert.deepEqual(H.giftChoices(s,gift),[511]);
    s.adv.gifts['starter-unova']=501;assert.deepEqual(H.giftChoices(s,gift),[513]);
    s.adv.gifts['starter-unova']=true;s.mons[0].id=496;assert.deepEqual(H.giftChoices(s,gift),[515],'legacy starter flags can recover the choice after evolution');
});
test('mainline team and training threats follow the actual Unova gym branch',()=>{
    const s=state(),chapter=H.DATA.chapters[66],context=()=>H.battleContext(s,'progress',{row:{...chapter,members:[66]}});
    const fire=context();assert.ok(fire.foes.some(m=>m.id===513&&m.level===16));
    assert.ok(!fire.foes.some(m=>m.id===511&&m.level===16));
    s.adv.gifts['starter-unova']=498;const water=context();assert.ok(water.foes.some(m=>m.id===515&&m.level===16));
    assert.notDeepEqual(H.chapterThreats(s,66),H.chapterFoes({...s,adv:{...s.adv,gifts:{'starter-unova':501}}},chapter));
});

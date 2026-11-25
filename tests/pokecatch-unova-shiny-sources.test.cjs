const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

function state(chapter) {
    return {mons:[], dex:{}, items:{}, travel:{to:['unova']}, adv:{chapter, unlocked:83, node:0, nodes:[], gifts:{}, badges:[]}};
}

test('all four Unova phenomena can drive both capture and shiny hunts',()=>{
    const examples=[['grass',66,'Route 1',531],['dust',67,'Veine Souterraine',529],
        ['shadow',71,'Pont Yoneuve',580],['ripple',74,'Route 8',594]];
    const now=new Date(2026,10,22,12).getTime();
    for(const [phenom,chapter,name,id] of examples){
        const s=state(chapter);s.adv.nodes=[{type:'wild',phenom,name}];
        const dex=H.normalizeSettings({mode:'dex',dexSpecies:[id]}),shiny=H.normalizeSettings({mode:'shiny',shinyId:id});
        const capture=H.dexRanking(s,dex,{},now).find(row=>row.id===chapter);
        assert.ok(capture?.marked&&capture.targets.some(hit=>hit.id===id&&hit.kind==='phenomenon'),phenom);
        assert.equal(H.shinyRanking(s,shiny,{},now)[0]?.id,chapter,phenom);
        assert.ok(H.shinyRanking(s,shiny,{},now)[0]?.marked,phenom);
    }
});

test('wild dust survives map backoff for both hunts, and a rolled non-shiny or item loses shiny priority',()=>{
    const s=state(67),now=Date.now(),cooldowns={'67':now+60000};
    const shiny=H.normalizeSettings({mode:'shiny',shinyId:529}),dex=H.normalizeSettings({mode:'dex',dexSpecies:[529]});
    s.adv.nodes=[{type:'wild',phenom:'dust',name:'Veine Souterraine'}];
    const ranked=()=>H.shinyRanking(s,shiny,cooldowns,now);
    assert.equal(ranked()[0].id,67);
    assert.ok(H.dexRanking(s,dex,cooldowns,now).some(row=>row.id===67&&row.hasWild&&row.marked));
    s.adv.battle={kind:'wild',enemies:[{id:529,shiny:false}]};
    assert.ok(!ranked().some(row=>row.id===67));
    s.adv.battle.enemies[0].shiny=true;assert.equal(ranked()[0].id,67);
    s.adv.battle.enemies[0].id=504;assert.ok(!ranked().some(row=>row.id===67));
    delete s.adv.battle;s.adv.nodes[0].type='item';assert.ok(!ranked().some(row=>row.id===67));
});

test('wild shiny selection admits Alomomola and ranks eligible route blocks on the same units as regular spawns', () => {
    const s = state(74);
    const settings = H.normalizeSettings({mode:'shiny', shinyId:594});
    assert.equal(settings.shinyId, 594);
    const encounters = new Map(H.shinyRanking(s,settings).map(row => [row.id,row.expected]));
    assert.deepEqual([...encounters.keys()].sort(), [74,83]);
    assert.ok(Math.abs(encounters.get(74) - 2 * .075 * .8 * .05) < 1e-9);
    assert.ok(Math.abs(encounters.get(83) - 3 * .075 * .8 * .05) < 1e-9);
    s.adv.chapter = 72;
    s.adv.unlocked = 73;
    assert.deepEqual(H.shinyRanking(s,settings), []);
});

test('a weather-specific monkey uses the weather pool of the generated Dreamyard node', () => {
    const s = state(66);
    const node = {type:'wild', phenom:'grass', name:'Vestiges du Rêve', weather:'sun', phenomW:{sun:{513:5}, rain:{515:5}}};
    s.adv.nodes.push(node);
    const source = id => H.unovaAcquisitionSources(s,id).find(row => row.originalName === node.name);
    assert.equal(source(513).marked, true);
    assert.equal(source(513).chance, 5 / 105);
    assert.equal(source(515).marked, false);
    node.weather = 'rain';
    assert.equal(source(515).marked, true);
    delete node.phenomW;
    assert.equal(source(515).marked, false);
});

test('two Victory Road blocks share one dex entry and a single visible dust cloud counts once', () => {
    const s = state(76);
    const sources = () => H.unovaAcquisitionSources(s,529).filter(row => row.chapter === 76 && row.originalName === 'Route Victoire');
    assert.equal(sources().length, 1);
    assert.ok(Math.abs(sources()[0].weight - 2 * .075 * .8 * .05) < 1e-9);
    const cloud = {name:'Route Victoire', type:'wild', phenom:'dust'};
    s.adv.nodes = [cloud];
    assert.equal(sources()[0].weight, .05);
    s.adv.nodes = [cloud,cloud];
    assert.equal(sources()[0].weight, .1);
    s.adv.node = 1;
    assert.equal(sources()[0].weight, .05);
});

test('White Forest day restriction applies to map generation; already generated grass can still be visited at night', () => {
    const s = state(83), night = new Date(2026,10,18,23).getTime();
    const find = () => H.unovaAcquisitionSources(s,531,night).find(row => row.originalName === 'Forêt Blanche');
    assert.equal(find().available, false);
    s.adv.nodes.push({name:'Forêt Blanche',type:'wild',phenom:'grass'});
    assert.equal(find().marked, true);
    s.adv.event = {raid:true};
    assert.equal(find().available, false);
});

test('Axew fang collection stops when the bag contains ten or the nest has been visited', () => {
    const s = state(72), source = H.ITEMS.get('axew-fang').sources.find(row => row.ch === 72);
    assert.equal(source.kind,'quest');
    assert.equal(source.expected,.10);
    s.items['axew-fang'] = 9;
    assert.equal(H.sourceAvailable(s,source,'axew-fang'),true);
    s.items['axew-fang'] = 10;
    assert.equal(H.sourceAvailable(s,source,'axew-fang'),false);
    s.items['axew-fang'] = 0;
    s.adv.gifts['axew-nest'] = true;
    assert.equal(H.sourceAvailable(s,source,'axew-fang'),false);
});

test('Axew fang farming goes directly to the quest route and repairs a leftover league loop', () => {
    const league=H.DATA.chapters.find(c=>c.reg==='unova'&&c.league),s=state(league.id),now=Date.now();
    Object.assign(s,{team:['a'],road:['a'],mons:[{uid:'a',id:7,level:5}]});
    s.adv.loops=[league.loop];s.items['axew-fang']=9;
    const engine=new H.Engine({}, {mode:'item',itemId:'axew-fang',autoPrepare:true});
    engine.read=()=>s;engine.driver.nav=()=>true;
    engine.farm(s,now,'item');
    assert.equal(engine.preparation,null);
    const pending=engine.driver.pendingMap;
    assert.equal(pending?.row.id,72);
    s.adv.chapter=72;s.adv.loops=[72];
    engine.confirmMapArrival(s,pending,now);
    let fits=0;engine.fitTeam=()=>{fits++;return false;};
    engine.farm(s,now+1000,'item');
    assert.equal(engine.driver.pendingMap,null);assert.equal(fits,1);
    s.adv.loops.push(league.loop);s.adv.pending={type:'choice'};
    engine.farm(s,now+2000,'item');
    assert.equal(engine.driver.pendingMap,null);assert.equal(fits,1);
    delete s.adv.pending;
    engine.farm(s,now+3000,'item');
    assert.equal(engine.driver.pendingMap?.row.id,72);assert.equal(fits,1);
});

test('resuming a fang hunt drops old map training even if it was suspended for a raid',()=>{
    const s=state(72),now=Date.now(),engine=new H.Engine({},{mode:'item',itemId:'axew-fang',autoPrepare:true});
    s.team=['a'];s.mons=[{uid:'a',id:7,level:5}];
    const prep={mode:'item',context:{kind:'map',id:72},targets:[{uid:'a',goal:50}],uids:['a']};
    engine.beginTask(s,{preparation:prep,session:{raidPreparation:prep,startItems:3}},now);
    assert.equal(engine.preparation,null);assert.equal(engine.raidPreparation,null);assert.equal(engine.startItems,3);
});

test('towns can yield a first regional stone, and roaming berries enter their pool after a roaming group unlocks', () => {
    const s=state(0);
    const rank=id=>H.itemRanking(s,H.normalizeSettings({mode:'item',itemId:id}));
    assert.deepEqual(rank('rowap-berry'),[]);
    const find=()=>rank('fire-stone').find(row=>row.id===0);
    assert.ok(find().sources.some(source=>source.kind==='town'&&source.stone));
    s.stonesFound={'r:kanto':['fire-stone']};
    assert.equal(find(),undefined);
    s.adv.badges=['Maître Johto'];
    assert.ok(rank('rowap-berry').some(row=>row.id===0&&row.expected>0));
});

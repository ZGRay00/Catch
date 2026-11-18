const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

function state(chapter) {
    return {mons:[], dex:{}, items:{}, travel:{to:['unova']}, adv:{chapter, unlocked:83, node:0, nodes:[], gifts:{}, badges:[]}};
}

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
    s.items['axew-fang'] = 9;
    assert.equal(H.sourceAvailable(s,source,'axew-fang'),true);
    s.items['axew-fang'] = 10;
    assert.equal(H.sourceAvailable(s,source,'axew-fang'),false);
    s.items['axew-fang'] = 0;
    s.adv.gifts['axew-nest'] = true;
    assert.equal(H.sourceAvailable(s,source,'axew-fang'),false);
});

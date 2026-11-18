// Optional differential: node tests/pokecatch-unova-native.cjs PUBLIC_APP_JS
const assert = require('node:assert/strict');
const nativeRuntime = require('../tools/pokecatch-native-vm.cjs');
const helper = require('../Pokecatch自动助手.user.js');

assert.ok(process.argv[2], 'Pass the downloaded public game bundle');
const vm = nativeRuntime(process.argv[2]);
const native = JSON.parse(vm.run(`JSON.stringify((() => {
    const game = __pcResearch;
    const config = game.CONFIG.PHENOMENA;
    const routes = [];
    let axew, fang;
    for (const [chapter, map] of game.STORY.CHAPTERS.entries()) {
        if (!config.REGIONS.includes(map.reg) || map.league) continue;
        for (const step of map.steps) {
            if (step.kind === 'static' && step.id === 610) {
                axew = {chapter, once: step.once, needs: step.needs, count: step.needN};
            }
            if (step.loot?.['axew-fang']) fang = {chapter, ...step.loot['axew-fang']};
            if (step.kind !== 'route' || !step.wild) continue;
            const effect = Object.entries(config.KINDS).find(([,rule]) => rule.bg.includes(step.bg));
            if (!effect) continue;
            const row = {chapter, name:step.name, phenomenon:effect[0]};
            if (step.day) row.day = true;
            if (step.night) row.night = true;
            if (step.phenom) row.weatherWeights = step.phenom;
            for (const [key,loot] of Object.entries(step.loot || {})) {
                if (key.startsWith('egg:')) row.egg = {id:Number(key.slice(4)), chance:loot.p, badge:loot.badge, skies:loot.skies};
            }
            routes.push(row);
        }
    }
    return {
        routes, axew, fang, evolution:game.EVOLUTIONS[636],
        chance:config.CHANCE, itemFraction:config.ITEM, itemNodeChance:game.CONFIG.ITEM_EVENT_CHANCE,
        weights:Object.fromEntries(Object.entries(config.KINDS).map(([kind,rule]) => [kind,rule.pool]))
    };
})())`));

const catalog = helper.UNOVA_ENCOUNTERS;
assert.ok(catalog, 'Build the userscript before testing');
for (const field of ['routes','chance','itemFraction','itemNodeChance','weights']) {
    assert.deepEqual(catalog[field], native[field], 'Unova ' + field);
}
assert.deepEqual(helper.EVOLUTION_DATA.rules[636], native.evolution, 'Larvesta evolution');
const state = {adv:{chapter:74,unlocked:83,node:0,nodes:[]},travel:{to:['unova']}};
const ripples = helper.unovaAcquisitionSources(state,594);
const waterRoutes = native.routes.filter(row => row.phenomenon === 'ripple');
assert.deepEqual(ripples.map(row => [row.chapter,row.originalName]),waterRoutes.map(row => [row.chapter,row.name]));
const waterPool = native.weights.ripple;
const waterShare = waterPool[594] / Object.values(waterPool).reduce((a,b) => a+b,0);
const meanChance = (native.chance[0] + native.chance[1]) / 2;
assert.ok(ripples.length && ripples.every(row => row.available && row.weight === meanChance*(1-native.itemFraction)*waterShare));

assert.ok(native.axew && native.fang, 'Review the native Axew quest');
const encounter = helper.DATA.chapters[native.axew.chapter].special.find(row => row.id === 610);
assert.equal(encounter.needs,native.axew.needs);
assert.equal(encounter.needN,native.axew.count);
assert.equal(encounter.once,native.axew.once);
const source = helper.ITEMS.get(native.axew.needs).sources.find(row => row.ch === native.fang.chapter);
assert.equal(source.upTo,native.fang.upTo);
assert.equal(source.until,native.fang.until);
const expectedFangs = (native.itemNodeChance + meanChance*native.itemFraction)*native.fang.p;
assert.ok(Math.abs(source.expected - expectedFangs) < 1e-10);

console.log('Passed native Unova comparison for %d routes, %d ripple habitats, phenomenon weights, Larvesta egg/evolution and Axew quest.', native.routes.length, ripples.length);

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

function state() {
    const parent = (id, shiny = false) => ({mon: {id, uid: 'p' + id, shiny}});
    return {
        trainer: {since: 12345, id: 'test-eggs'},
        pension: {laid: 5, mons: [parent(132, true), parent(4, true), parent(7)], eggs: [], bx: 0},
        stats: {hatched: 3},
        adv: {chapter: 0}
    };
}

test('assigned eggs report saved, calculated or indeterminate outcomes independently of future eggs', () => {
    const s = state(), future = {build: 'unknown', estimateUnverified: true};
    assert.equal(H.eggOutcome(s, {shiny: false}, future).certainty, 'saved');
    assert.equal(H.eggOutcome(s, {k: 2}, future).certainty, 'unknown');
    assert.equal(H.eggOutcome(s, {uid: 'legacy'}).certainty, 'deterministic');
    assert.equal(H.eggOutcome(s, {k: 2}).certainty, 'deterministic');
    assert.equal(H.nurseryForecast(s, future).certainty, 'reference');
    delete s.trainer;
    assert.equal(H.eggOutcome(s, {k: 2}).certainty, 'unknown');
    assert.equal(H.eggOutcome(s, {k: 2}).shiny, null);
    assert.equal(H.eggOutcome(s, {k: 2}, future).rateVerified, false);
});

test('unreadable egg flags stay unknown across a ledger reload and a confirmed hatch', () => {
    const options = {build: H.NURSERY_RULES.build};
    for (const flag of ['shiny', 'sp', 'bx']) {
        const s = state();
        s.stats.hatched = 0;
        const ledger = new H.NurseryLedger();
        ledger.observe(s, 1000, options);
        s.pension.eggs = [{uid: 'invalid-' + flag, id: 4, k: 1, [flag]: {bad: 1}}];
        ledger.observe(s, 2000, options);
        const restored = new H.NurseryLedger(JSON.parse(JSON.stringify(ledger.serialize())));
        s.pension.eggs = [];
        s.stats.hatched = 1;
        const {stats} = restored.observe(s, 3000, options);
        assert.equal(stats.unknownObserved, 1, flag);
        assert.equal(stats.unknownHatched, 1, flag);
    }
});

test('missing seed leaves only weighted next-egg odds for eligible parent slots', () => {
    const s = state();
    delete s.trainer;
    for (const bx of [0, 1]) {
        s.pension.bx = bx;
        const f = H.nurseryForecast(s);
        assert.equal(f.certainty, 'unavailable');
        assert.equal(f.nextEgg, null);
        assert.equal(f.nextRate, (1 / 16 + 1 / 512) / 2 * (bx ? 2 : 1));
    }
    s.pension.mons.shift();
    assert.equal(H.nurseryForecast(s).nextRate, null);
});

test('stored counter takes precedence over initialization and bad counters never allocate eggs', () => {
    const s = state();
    const f = H.nurseryForecast(s);
    assert.equal(f.nextEgg.k, 5);
    assert.equal(f.counterSource, 'saved');
    for (const invalid of ['5', -1, 4.5, Number.MAX_SAFE_INTEGER + 1]) {
        s.pension.laid = invalid;
        assert.equal(H.nurseryForecast(s).counter, null);
    }
    delete s.pension.laid;
    const before = JSON.stringify(s);
    assert.equal(H.nurseryForecast(s).nextEgg.k, 3);
    assert.equal(H.nurserySnapshot(s).counter, null);
    assert.equal(JSON.stringify(s), before);
});

test('when the counter and berry are fixed parent sensitivity agrees with both native thresholds', () => {
    const s = state();
    for (const bx of [0, 1]) {
        s.pension.bx = bx;
        const seen = new Set();
        for (let k = 0; k < 10000 && seen.size < 3; k++) {
            const roll = H.nurseryFixedRoll(s, k);
            const effect = roll < (bx ? 2 : 1) / 512 ? 'always-shiny' : roll < (bx ? 2 : 1) / 16 ? 'depends' : 'always-plain';
            if (seen.has(effect)) continue;
            s.pension.laid = k;
            assert.equal(H.nurseryForecast(s, {limit: 1}).nextEgg.parentEffect, effect);
            seen.add(effect);
        }
        assert.equal(seen.size, 3);
    }
});

test('bounded scan matches the full draw sequence including sparse hits and hypothetical flags', () => {
    const s = state(), plainRate = 1 / 512, parentRate = 1 / 16;
    for (const bx of [0, 1]) {
        s.pension.bx = bx;
        const limit = 6000, f = H.nurseryForecast(s, {limit, count: 20});
        const expected = [], first = {};
        for (let offset = 0; offset < limit; offset++) {
            const k = s.pension.laid + offset, roll = H.nurseryFixedRoll(s, k);
            const shinyParent = H.nurseryFixedRoll(s, k, 1) < .5;
            const berry = !!bx && offset === 0;
            const rate = shinyParent ? parentRate : plainRate;
            if (roll < rate * (berry ? 2 : 1) && expected.length < 20) expected.push(k);
            for (const [key, threshold] of Object.entries({
                plainParents: plainRate * (berry ? 2 : 1),
                shinyParents: parentRate * (berry ? 2 : 1),
                berryNext: rate * (offset === 0 ? 2 : 1)
            })) if (first[key] == null && roll < threshold) first[key] = k;
        }
        assert.deepEqual(f.hits.map(row => row.k), expected);
        for (const [key, k] of Object.entries(first)) {
            const row = f.scenarios[key].nextShiny;
            assert.equal(row.k, k);
            assert.equal(row.rate, H.nurseryEggRate({sp: row.parent.shiny ? 2 : 0, bx: row.bx}));
            assert.equal(row.bx, key === 'berryNext' ? row.offset === 0 : !!bx && row.offset === 0);
        }
    }
});

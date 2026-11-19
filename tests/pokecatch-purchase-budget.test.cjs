const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

function buyer() {
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value))
    };
    const settings = H.normalizeSettings({spendBudget: 10000000, dailySpendBudget: 0, moneyReserve: 10000, useBudget: 20});
    const e = new H.Engine(storage, settings);
    e.account = 'test-budget';
    e.running = true;
    e.persist = () => true;
    return e;
}

function button(t) {
    const original = global.getComputedStyle;
    global.getComputedStyle = () => ({display: 'block', visibility: 'visible', opacity: '1'});
    t.after(() => {
        if (original) global.getComputedStyle = original;
        else delete global.getComputedStyle;
    });
    return {isConnected: true, closest: () => null, getAttribute: () => null, getClientRects: () => [{}]};
}

test('legacy purchase permissions keep their budgets and an explicit invalid switch fails closed', () => {
    assert.equal(H.normalizeSettings({}).spendBudget, 0);
    const legacy = H.normalizeSettings({spendBudget: 300});
    assert.equal(legacy.autoPurchase, true);
    assert.equal(legacy.spendBudget, 300);
    for (const value of [false, null, 'true', 'false', 1]) {
        assert.equal(H.normalizeSettings({autoPurchase:value, spendBudget:300}).autoPurchase, false);
    }
    const off = {...legacy, autoPurchase:false};
    assert.equal(H.normalizeSettings({spendBudget:400}, off).autoPurchase, false);
});

test('the purchase switch protects both planning and reservation while allowing inventory servings', () => {
    const e = buyer(), b = e.budget;
    e.settings.autoPurchase = false;
    assert.match(b.check({money:20000}, 10), /自动购买已关闭/);
    assert.throws(() => b.charge(10), /自动购买已关闭/);
    assert.equal(b.check({money:0}, 0, 1), null);
    b.charge(0, 1);
    assert.equal(b.used, 1);
    assert.equal(b.spent, 0);
    assert.equal(b.day().spent, 0);
});

test('screenshot budget allows an exact-reserve purchase while only inventory use consumes a serving', () => {
    const e = buyer(), b = e.budget;
    b.charge(0, 1);
    assert.equal(b.spent, 0);
    assert.equal(b.used, 1);
    assert.equal(b.check({money: 10200}, 200), null);
    assert.match(b.check({money: 10199, link: {stash: {money: 1000000}}}, 200), /保留/);
    b.charge(200);
    assert.equal(b.day().spent, 200);
    assert.equal(b.used, 1);
    assert.match(b.check({money: 11000000}, 10000000), /当前任务采购/);
    assert.match(b.check({}, 0, 20), /道具使用/);
    e.settings.dailySpendBudget = 399;
    assert.match(b.check({money: 20000}, 200), /每日/);
    assert.equal(b.check({money: 20000}, 199), null);
    e.settings.spendBudget = 0;
    assert.match(b.check({money: 20000}, 1), /当前任务采购/);
});

test('prices prefer the stated coin amount and reject unintended numbers or ambiguous prices', () => {
    for (const [text, amount] of [
        ['×8 · 15 000 ₽ l’unité', 15000], ['解锁 · １００，０００ ₽', 100000], ['2.000 ₽', 2000],
        ['1.234M', 1234000], ['500k', 500000], ['1,5M ₽', 1500000], ['2万', 20000]
    ]) assert.equal(H.parsePrice(text), amount, text);
    for (const text of ['×10', '200 BP', '100 ₽ / 200 ₽', '100 ₽ / 2', '-200 ₽', '1,2,3 ₽', '', '—']) {
        assert.equal(H.parsePrice(text), null, text);
    }
});

test('malformed balances and daily records cannot release a spending limit', () => {
    const e = buyer(), b = e.budget;
    for (const money of [Infinity, NaN, null, true, [], -3]) assert.match(b.check({money}, 200), /余额/);
    assert.equal(b.check({money: '10200'}, 200), null);
    for (const spent of [null, false, '', ' ', [], -1, 1.3]) {
        e.storage.setItem(b.dayKey(), JSON.stringify({spent}));
        assert.match(b.check({money: 20000}, 100), /每日消费记录/);
        assert.throws(() => b.charge(100), /每日消费记录/);
    }
});

test('undispatched actions release only their own reservation on the original Paris day', t => {
    const e = buyer(), b = e.budget;
    let now = Date.parse('2026-11-19T22:59:59Z');
    t.mock.method(Date, 'now', () => now);
    const oldKey = b.dayKey();
    b.charge(75, 1);
    e.driver.click = () => {
        assert.equal(b.spent, 275);
        now += 2000;
        assert.notEqual(b.dayKey(), oldKey);
        return false;
    };
    const el = button(t);
    assert.equal(e.automation.spentClick(el, {money: 10200}, 200, 1, '模拟采购'), false);
    assert.equal(b.spent, 75); assert.equal(b.used, 1);
    assert.equal(b.day(oldKey).spent, 75); assert.equal(b.day().spent, 0);
});

test('a denied or failed checkpoint prevents clicking, but an uncertain dispatch retains the reservation', t => {
    const e = buyer(), el = button(t), s = {money: 10200};
    let clicks = 0;
    e.driver.click = () => {clicks++; throw Error('dispatch uncertain');};
    e.persist = () => false;
    assert.equal(e.automation.spentClick(el, s, 200, 0, '模拟采购'), false);
    e.persist = () => {throw Error('storage full');};
    assert.equal(e.automation.spentClick(el, s, 200, 0, '模拟采购'), false);
    assert.match(e.status, /storage full/);
    assert.equal(clicks, 0); assert.equal(e.budget.spent, 0); assert.equal(e.budget.day().spent, 0);
    e.persist = () => true;
    assert.throws(() => e.automation.spentClick(el, s, 200, 0, '模拟采购'), /dispatch uncertain/);
    assert.equal(clicks, 1); assert.equal(e.budget.spent, 200); assert.equal(e.budget.day().spent, 200);
});

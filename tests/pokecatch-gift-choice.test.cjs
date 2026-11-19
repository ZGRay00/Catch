'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { compileProject } = require('../pokecatch-helper/tools/build.cjs');

const context = { module: { exports: {} } };
vm.runInNewContext(compileProject().script, context);
const { DOMDriver } = context.module.exports;
const fossils = ['dome-fossil', 'helix-fossil'];

function element(classes) {
    const tokens = new Set(classes.split(' '));
    return {
        classList: { contains: name => tokens.has(name), add: name => tokens.add(name) },
        matches: selector => selector.split(',').some(part => part.split('.').slice(1).every(name => tokens.has(name))),
        isConnected: true,
        closest: () => null,
        getClientRects: () => [{}],
        getAttribute: () => null,
    };
}

function fossilGift({ shown = fossils, key = 'fossil', claimed = false, pending = null } = {}) {
    const gift = { key, items: fossils };
    const state = { adv: { chapter: 1, node: 1, nodes: [{ type: 'heal' }, { type: 'gift', gift }], gifts: { [key]: claimed }, pending } };
    const actions = [];
    const confirm = element('ic-go');
    confirm.disabled = true;
    confirm.click = () => actions.push('confirm');
    const slots = shown.map(id => {
        const slot = element('ic-item');
        slot.querySelector = selector => selector === 'img' ? { getAttribute: attr => attr === 'src' ? 'assets/items/' + id + '.png' : null } : null;
        slot.click = () => { actions.push(id); slot.classList.add('on'); confirm.disabled = false; };
        return slot;
    });
    const overlay = element('berry-fx item-choice ready');
    overlay.querySelectorAll = selector => selector === '.ic-item' ? slots : [];
    overlay.querySelector = selector => selector === '.ic-go' ? confirm : null;
    context.document = {
        querySelectorAll: selector => selector.split(',').includes('#arena .berry-fx.item-choice') ? [overlay] : [],
        querySelector: () => null,
    };
    context.getComputedStyle = () => ({ opacity: '1', visibility: 'visible', display: 'block' });
    const driver = new DOMDriver({ settings: { gifts: true, mode: 'progress' }, running: true });
    function tick() { driver.lastClick = 0; return driver.gift(state); }
    return { actions, tick };
}

test('selects and confirms a native fossil gift while the current node is saved but pending is still null', () => {
    const { actions, tick } = fossilGift();
    assert.equal(tick(), true);
    assert.deepEqual(actions, ['dome-fossil']);
    assert.equal(tick(), true);
    assert.deepEqual(actions, ['dome-fossil', 'confirm']);
});

for (const [label, options] of [
    ['already claimed gift', { claimed: true }],
    ['demo gift', { key: 'demo' }],
    ['unrelated pending riddle over the saved gift node', { pending: { type: 'riddle' } }],
    ['equal number of different options', { shown: ['root-fossil', 'claw-fossil'] }],
    ['matching items in a different order', { shown: [...fossils].reverse() }],
]) {
    test('does not act on ' + label, () => {
        const { actions, tick } = fossilGift(options);
        tick();
        tick();
        assert.deepEqual(actions, []);
    });
}

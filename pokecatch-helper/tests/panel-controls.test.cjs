const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function panelHelpers(globals = {}) {
    const sources = ['panel-style.js', 'panel-controls.js'].map(file =>
        fs.readFileSync(path.join(__dirname, '../src/ui', file), 'utf8'));
    return vm.runInNewContext(sources.join('\n') +
        '\n({mountPanelAppearance, updateMiniActions, logStopText, renderTaskExplanation})', globals);
}

test('appearance follows system changes, preserves an explicit preference and restores focus after Escape', () => {
    let mediaChange, focus, saves = 0;
    const media = {matches: true, addEventListener(type, fn) { mediaChange = fn; }};
    const helpers = panelHelpers({window: {matchMedia: () => media}});
    function control() {
        const handlers = {};
        return {handlers, attrs: {}, addEventListener(type, fn) { handlers[type] = fn; },
            setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; }, focus() { focus = this; }};
    }
    const theme = control(), expand = control(), panel = control(), style = {}, root = control();
    root.querySelector = selector => ({'#panel-theme': theme, '#panel-expand': expand, '.panel': panel, style})[selector];
    const host = {dataset: {}, classList: {toggle(name, value) { host.full = value; }}};
    const ui = {};
    const apply = helpers.mountPanelAppearance(root, host, ui, () => { saves++; });
    assert.equal(host.dataset.scheme, 'light');
    assert.match(style.textContent, /color-scheme:light/);
    media.matches = false; mediaChange();
    assert.equal(host.dataset.scheme, 'dark');
    theme.value = 'light'; theme.handlers.change();
    mediaChange(); assert.equal(host.dataset.scheme, 'light');
    expand.handlers.click(); assert.equal(host.full, true);
    assert.equal(panel.attrs['aria-modal'], 'true');
    for (const field of [expand,theme]) Object.assign(field,{tabIndex:0, getClientRects:()=>[{}], closest:()=>null});
    panel.querySelectorAll=()=>[expand,theme];
    root.activeElement=theme;
    root.handlers.keydown({key:'Tab',shiftKey:false,preventDefault(){}});
    assert.equal(focus,expand);
    ui.folded = true; apply(); assert.equal(host.full, false);
    ui.folded = false; apply(); assert.equal(host.full, true);
    const escape = editable => root.handlers.keydown({key: 'Escape', target: {matches: () => editable},
        preventDefault() {}, stopPropagation() {}});
    escape(true); assert.equal(host.full, true);
    escape(false); assert.equal(host.full, false); assert.equal(focus, expand);
    assert.equal(panel.attrs['aria-modal'],undefined);
    assert.equal(expand.attrs['aria-pressed'], 'false');
    assert.equal(saves, 3);
});

test('compact actions identify each due task and the earliest future event without counting a stopped task timer', () => {
    const now = 1000;
    const helpers = panelHelpers({
        readyBackgroundEggs: s => s.pension.eggs.filter(egg => egg.hatchAt <= now),
        undergroundStatus: s => s.under, localCalendarTime: String
    });
    const buttons = Object.fromEntries(['logs','eggs','underground','queue','next','gain'].map(key =>
        [key, {dataset: {miniLink: key}, textContent: ''}]));
    const root = {querySelectorAll: () => Object.values(buttons)};
    const engine = {queue: [{status: 'failed'}], started: true, running: false, nextWake: now + 1,
        lastStop: {reason: '手动停止'}, sessionMoneyNet: () => -15};
    const save = {pension: {eggs: [{hatchAt: now}, {hatchAt: now + 20}]},
        under: {slots: [{}], ready: [{}], running: [{end: String(now + 10)}]}};
    helpers.updateMiniActions(root, engine, save, now, '');
    assert.equal(buttons.eggs.textContent, '蛋可领 1');
    assert.equal(buttons.underground.textContent, '地下归队 1');
    assert.equal(buttons.next.dataset.nextTarget, 'underground');
    assert.equal(buttons.queue.textContent, '队列需处理 1');
    assert.equal(buttons.logs.hidden, false);
    assert.equal(buttons.gain.textContent, '净收益 -15 ₽');
    engine.running = true;
    helpers.updateMiniActions(root, engine, save, now, '道具 2/6');
    assert.equal(buttons.next.dataset.nextTarget, 'activity');
    assert.equal(buttons.gain.textContent, '道具 2/6');
    assert.equal(buttons.logs.hidden, true);
});

test('stop transcript preserves chronological messages, repeated counts and missing evidence', () => {
    const helpers = panelHelpers({MODE_NAMES: {money: '刷钱'}});
    const text = helpers.logStopText({ts: 1000, mode: 'money', reason: '等待存档', action: '检查地图',
        signals: {saveChangedAt: null, progressAt: null},
        logs: [{ts: 900, level: 'warn', text: '没有进展', count: 2}, {ts: 10, text: '进入地图'}]});
    assert.match(text, /等待存档/); assert.match(text, /刷钱/);
    assert.match(text, /最后存档变化　未记录/);
    assert.ok(text.indexOf('进入地图') < text.indexOf('没有进展'));
    assert.match(text, /没有进展 · ×2/);
    assert.equal(helpers.logStopText(null), '');
});

test('task explanation keeps an estimated rate distinct from an observed one and surfaces a manual blocker', () => {
    const helpers = panelHelpers();
    const cells = Array.from({length:6}, () => ({textContent: ''}));
    const engine = {running: true, settings: {mode: 'item'}, driver: {}, target: {name: '第一章', rate: 0.5}};
    const display = {goalLabel: '道具', goalValue: '2/10', activeLabel: '刷道具', actionText: '等待下个节点'};
    helpers.renderTaskExplanation({children: cells}, engine, display);
    assert.match(cells[1].textContent, /第一章/);
    assert.match(cells[3].textContent, /估算每分钟 0.5 个/);
    engine.target.measured = true; display.wait = {detail: '等候手动选择'};
    helpers.renderTaskExplanation({children: cells}, engine, display);
    assert.match(cells[3].textContent, /含实测/);
    assert.equal(cells[5].textContent, '等候手动选择');
});

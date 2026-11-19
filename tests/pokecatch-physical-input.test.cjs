const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../pokecatch-helper/src/ui/manual-input.js'), 'utf8');

function fixture() {
    function eventTarget() {
        const listeners = new Map();
        return {
            addEventListener(type, listener) {
                if (!listeners.has(type)) listeners.set(type, []);
                listeners.get(type).push(listener);
            },
            dispatch(event) {
                for (const listener of listeners.get(event.type) || []) listener(event);
            },
        };
    }
    let now = 1000;
    const window = eventTarget(), document = eventTarget(), game = {};
    document.documentElement = { matches: () => false };
    const engine = {
        running: true, manual: null, inputHeld: false,
        settings: { manualPause: true, resumeSeconds: 3 },
        manualInput() { this.manual = { until: now + this.settings.resumeSeconds * 1000 }; },
    };
    const context = { engine, window, document, Date: { now: () => now }, pageHidden: () => false };
    vm.runInNewContext(source + '\nbindManualInput(engine, {}, () => {}, () => {});', context);
    function send(type, fields = {}) {
        const event = { type, target: game, isTrusted: true, composedPath: () => [game, document, window], ...fields };
        window.dispatch(event);
        document.dispatch(event);
    }
    function advance(ms) { now += ms; engine.reconcileHeldInput(now); }
    return { document, engine, send, advance };
}

test('native visibility releases physical input even with background automation enabled', () => {
    const { engine, document, send, advance } = fixture();
    send('keydown', { key: 'Shift', code: 'ShiftLeft' });
    send('pointerdown', { pointerType: 'mouse', pointerId: 1, button: 0 });
    advance(2000);
    document.hidden = false;
    send('visibilitychange');
    assert.equal(engine.inputHeld, true);
    document.hidden = true;
    send('visibilitychange');
    assert.equal(engine.inputHeld, false);
    assert.equal(engine.manual.until, 6000, 'release starts the configured idle period');
});

test('mouse compatibility events, pen releases and touch endings respect the device and remaining fingers', () => {
    const { engine, send } = fixture();
    const down = (pointerType, pointerId) => send('pointerdown', { pointerType, pointerId, button: 0 });
    down('mouse', 1); down('pen', 3); down('touch', 10); down('touch', 11);
    send('mouseup', { buttons: 0 });
    send('pointerup', { pointerType: 'pen', pointerId: 3, buttons: 0 });
    send('touchend', { touches: [11] });
    assert.equal(engine.inputHeld, true, 'first raised finger cannot release a second finger');
    send('touchcancel', { touches: [] });
    assert.equal(engine.inputHeld, false);

    down('mouse', 1); down('touch', 10);
    send('touchend', { touches: [] });
    send('mouseup', { buttons: 0, sourceCapabilities: { firesTouchEvents: true } });
    assert.equal(engine.inputHeld, true, 'a touch-generated mouseup cannot release a real mouse');
    send('mouseup', { buttons: 0 });
    assert.equal(engine.inputHeld, false);
});

test('repeating keys renew their hold and a missing ordinary keyup recovers after silence', () => {
    const { engine, send, advance } = fixture();
    const key = { code: 'KeyQ', key: 'q' };
    send('keydown', key);
    advance(8000);
    send('keydown', { ...key, repeat: true });
    advance(8000);
    assert.equal(engine.inputHeld, true);
    advance(2500);
    assert.equal(engine.inputHeld, false);
});

test('modifiers have a longer grace period and only trusted modifier snapshots renew or clear them', () => {
    const { engine, send, advance } = fixture();
    const key = { code: 'ControlLeft', key: 'Control' };
    send('keydown', key);
    advance(55000);
    assert.equal(engine.inputHeld, true);
    send('pointermove', { getModifierState: name => name === 'Control' });
    advance(55000);
    send('pointermove', { isTrusted: false, getModifierState: () => false });
    assert.equal(engine.inputHeld, true);
    advance(5000);
    assert.equal(engine.inputHeld, false);

    send('keydown', key);
    send('pointermove', { getModifierState: () => false });
    assert.equal(engine.inputHeld, false);
});

test('composition remains active through silent periods until the matching editor ends it', () => {
    const { engine, send, advance } = fixture();
    const editor = {};
    send('compositionstart', { target: editor });
    advance(300000);
    send('compositionend', { target: {} });
    assert.equal(engine.inputComposing, true);
    assert.equal(engine.inputHeld, true);
    send('compositionend', { target: editor, isTrusted: false });
    assert.equal(engine.inputComposing, false);
    assert.equal(engine.inputHeld, false);
});

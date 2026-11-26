const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

// Native-shaped DOM stubs keep these state/transaction tests independent of Chrome.
// The full browser fixture separately covers navigation and real pointer events.
function node(extra = {}) {
    const classes = new Set(extra.classes || []);
    return {
        isConnected: true, hidden: false, disabled: false, dataset: {},
        classList: { contains: name => classes.has(name) },
        closest: () => null, getAttribute: () => null,
        getClientRects: () => [{}], querySelector: () => null,
        querySelectorAll: () => [], matches: () => false,
        ...extra,
    };
}

function fixture(t, settings = {}, options = {}) {
    const before = { document: global.document, getComputedStyle: global.getComputedStyle, now: Date.now };
    let clock = new Date(2026, 10, 17, 12).getTime();
    Date.now = () => clock;
    const s = {
        trainer: { id: 'auto-eggs-v300' }, money: 3000, mons: [{ uid: 'a', id: 6, level: 70 }],
        team: ['a'], road: ['a'], dex: {}, items: {}, stats: { battles: 0, wins: 0, caught: 0, hatched: 0 },
        travel: { to: [] }, pension: { mons: [], eggs: [{ uid: 'egg-a', id: 1, hatchAt: clock - 1000 }] },
        adv: { layout: H.DATA.layout, chapter: 0, unlocked: 8, speed: 4, runs: 0, node: 0, loops: [], badges: [], gifts: {}, deaths: {} },
    };
    const data = new Map([['gachamon-save-v1', JSON.stringify(s)], ['pokecatch-tab', 'egg-tab']]);
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
    const save = () => storage.setItem('gachamon-save-v1', JSON.stringify(s));
    const ui = { screen: 'adventure', fx: [], modal: null, card: null, evt: null, ready: options.ready !== false };
    const actions = [], tabs = new Map(['adventure', 'map', 'raid', 'team', 'pension', 'shop'].map(name => [name, node({ dataset: { screen: name } })]));
    const eggTab = node({ classes: ['on'] });
    const commit = uid => {
        s.pension.eggs = s.pension.eggs.filter(egg => String(egg.uid) !== String(uid));
        s.stats.hatched++;
        save();
    };
    function readyButtons() {
        if (ui.screen !== 'pension') return [];
        return s.pension.eggs.filter(egg => egg.hatchAt <= clock || options.forceReady).map(egg => node({
            dataset: { egg: String(egg.uid) }, disabled: !ui.ready,
            perform: () => { if (!options.deferCommit) commit(egg.uid); },
        }));
    }
    global.document = {
        hidden: false,
        querySelector(selector) {
            const tab = /^#tabs \[data-screen="([^"]+)"\]$/.exec(selector);
            if (tab) return tabs.get(tab[1]) || null;
            if (selector === '.screen.active[id^="screen-"]') return node({ id: 'screen-' + ui.screen });
            if (selector === '#pen-tabs [data-pen-tab="egg"]') return ui.screen === 'pension' ? eggTab : null;
            if (selector === '#modal-root.open') return ui.modal;
            if (selector === '#modal-root.open .modal.dexcard-modal') return ui.card;
            if (selector === '#evt-pick') return ui.evt;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === '#pen-eggs .pen-egg.ready[data-egg]') return readyButtons();
            if (selector === '.rc-fx,.lk-fx,.hatch-fx,.gift') return ui.fx;
            if (selector === '.lk-fx.lk-hatch,.hatch-fx:not(.gift)') return ui.fx;
            return [];
        },
    };
    global.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
    t.after(() => {
        Date.now = before.now;
        for (const key of ['document', 'getComputedStyle']) if (before[key] === undefined) delete global[key]; else global[key] = before[key];
    });
    function installDriver(e) {
        e.driver.nav = screen => { actions.push({ type: 'nav', screen }); ui.screen = screen; return true; };
        e.driver.click = (el, label, pointer = false) => {
            if (!el || !el.isConnected || el.disabled || el.hidden) return false;
            actions.push({ type: 'click', label, uid: el.dataset?.egg, pointer });
            el.perform?.();
            return true;
        };
        e.driver.animations = e.driver.dismissInformation = e.driver.receipt = e.driver.dialog = e.driver.gift = () => false;
        e.schedule = () => {};
    }
    const e = new H.Engine(storage, { mode: 'money', raids: false, autoTeam: true, autoPrepare: false, moneyBuff: false, ...settings });
    e.loadAccount(s); e.read(); e.running = true; e.started = clock; e.tabToken = 'egg-tab'; e.nextRaid = Infinity;
    e.automation.begin(s); installDriver(e);
    return { s, e, storage, save, ui, actions, tabs, commit, installDriver,
        now: () => clock, advance: ms => { clock += ms; },
        clicks: () => actions.filter(action => action.type === 'click' && action.uid),
        service: (engine = e) => engine.automation.serviceEggs(s, clock),
    };
}

test('v3 auto-egg default migrates old settings while preserving the explicit opt-out', () => {
    assert.equal(H.DEFAULTS.autoEggs, true);
    assert.equal(H.normalizeSettings({}).autoEggs, true);
    assert.equal(H.normalizeSettings({ pensionService: false }).autoEggs, true);
    assert.equal(H.normalizeSettings({ pensionService: true }).autoEggs, true);
    assert.equal(H.normalizeSettings({ autoEggs: false, pensionService: true }).autoEggs, false);
    assert.equal(Object.hasOwn(H.DEFAULTS, 'pensionService'), false);
});

test('explicit opt-out never navigates or hatches a ready egg', t => {
    const f = fixture(t, { autoEggs: false });
    assert.equal(f.service(), false);
    assert.deepEqual(f.actions, []);
    assert.equal(f.s.pension.eggs.length, 1);
});

test('a full shiny family stays in the incubator, logs once, then hatches when a slot opens',t=>{
    const f=fixture(t),s=f.s;
    s.pension.eggs[0].shiny=true;
    s.mons=[{id:1,shiny:true},{id:3,shiny:true},{id:3,shiny:false}];
    s.pension.mons=[{mon:{id:2,shiny:true}}];s.under={slots:[{mons:[{id:1,shiny:true}]}]};
    const notes=[];f.e.log=text=>notes.push(text);
    assert.equal(f.service(),false);assert.equal(f.service(),false);
    assert.deepEqual(f.actions,[]);assert.equal(notes.length,1);assert.match(notes[0],/妙蛙种子.*4\/4/);
    const plan=H.parallelPlan(s,f.e,f.now());assert.ok(!plan.ready.includes('eggs'));assert.match(plan.blocked.eggs,/4\/4/);
    s.under.slots=[];assert.equal(f.service(),true);
    assert.deepEqual(f.clicks().map(c=>c.uid),['egg-a']);
});

test('an eligible ordinary egg is collected ahead of a blocked shiny egg in background, idle and breed modes',t=>{
    const f=fixture(t,{},{deferCommit:true}),s=f.s,a=f.e.automation;
    s.mons=Array.from({length:4},()=>({id:3,shiny:true}));
    s.pension.eggs=[{id:1,uid:'full',shiny:1,hatchAt:f.now()},{id:1,uid:'plain',shiny:0,hatchAt:f.now()}];
    f.service();assert.deepEqual(f.clicks().map(c=>c.uid),['plain']);
    delete a.state.eggService;f.e.nurseryAssist.idleAccess=true;
    a.serviceEggs(s,f.now(),true,true);assert.equal(f.clicks().at(-1).uid,'plain');
    f.e.settings.mode='breed';f.e.settings.breedId=1;f.e.settings.breedShiny=false;
    a.breed(s,f.now());assert.equal(f.clicks().length,3);assert.equal(a.state.hatch.uid,'plain');
});

test('branch limits expand with open regions and trade escrow counts in the egg’s region group',t=>{
    const f=fixture(t),s=f.s,a=f.e.automation;
    const egg={id:133,reg:'kanto',shiny:true,uid:'eevee'};
    s.link={to:'johto'};s.mons=[133,134,135,136].map(id=>({id,reg:'kanto',shiny:true}));
    s.tradeOut={mon:{id:133,reg:'johto',shiny:true}};
    const check=()=>a.hatchChoices(s,[egg],f.now());
    assert.ok(check().eligible.length);s.tradeOut.mon.reg='kanto';
    assert.match(check().blocked.get(egg),/5\/5/);s.travel.to.push('johto');
    assert.ok(check().eligible.length);
});

test('enough incubating target eggs leave the current page alone and wake for the earliest egg', t => {
    const f = fixture(t, { mode: 'breed', breedId: 1, breedGoal: 1, breedShiny: false });
    const due = f.now() + 15000;
    f.s.pension.eggs = [{ uid: 'other', id: 4, hatchAt: due }, { uid: 'target', id: 1, hatchAt: due + 60000 }];
    f.e.automation.breed(f.s, f.now());
    f.advance(6000);
    f.e.automation.breed(f.s, f.now());
    assert.equal(f.actions.length, 0);
    assert.equal(f.e.nextWake, due);
    f.advance(9000);
    f.e.automation.breed(f.s, f.now());
    assert.equal(f.ui.screen, 'pension');
    assert.deepEqual(f.clicks().map(click => click.uid), ['other']);
});

test('the visible native hatch signal precedes the predicted clock during a breeding wait', t => {
    const f = fixture(t, { mode: 'breed', breedId: 1, breedGoal: 1, breedShiny: false }, { forceReady: true });
    f.s.pension.eggs[0].hatchAt = f.now() + 60000;
    f.ui.screen = 'pension';
    f.e.automation.breed(f.s, f.now());
    assert.deepEqual(f.clicks().map(click => click.uid), ['egg-a']);
});

test('a confirmed target shiny egg preserves the parent setup and is first to hatch when ready',t=>{
    const f=fixture(t,{mode:'breed',breedId:1,breedShiny:true}),at=f.now()+10000;
    f.s.pension.eggs=[{id:1,uid:'plain',shiny:false,hatchAt:at},{id:1,uid:'shiny',shiny:true,hatchAt:at}];
    f.e.automation.breed(f.s,f.now());
    assert.deepEqual(f.actions,[]);assert.equal(f.e.nextWake,at);assert.match(f.e.status,/已确认目标闪蛋/);
    f.advance(10000);f.e.automation.breed(f.s,f.now());assert.deepEqual(f.clicks().map(c=>c.uid),['shiny']);
});

test('background collection prioritizes only confirmed shiny, mature eggs, then keeps native order',t=>{
    const f=fixture(t),now=f.now();
    f.s.pension.eggs=[{id:1,uid:'unknown',k:3,hatchAt:now},{id:4,uid:'ordinary',shiny:false,hatchAt:now},
        {id:7,uid:'ready-shiny',shiny:true,hatchAt:now},{id:25,uid:'future-shiny',shiny:true,hatchAt:now+60000}];
    for(let i=0;i<4;i++){f.service();f.advance(1200);}
    assert.deepEqual(f.clicks().map(c=>c.uid),['ready-shiny','unknown','ordinary']);
    assert.equal(f.e.automation.state.autoHatched,3);
});

test('a late counter for a non-target hatch cannot finish the following target',t=>{
    const f=fixture(t,{mode:'breed',breedId:1,breedGoal:1,breedShiny:false},{deferCommit:true});
    const tick=()=>{f.e.automation.breed(f.s,f.now());f.advance(1200);};
    f.s.pension.eggs[0].hatchAt=f.now()+1200;
    f.s.pension.eggs.unshift({id:4,uid:'other',hatchAt:f.now()});
    tick();f.s.pension.eggs.shift();tick();tick();
    assert.deepEqual(f.clicks().map(c=>c.uid),['other']);
    f.s.stats.hatched++;tick();
    assert.deepEqual(f.clicks().map(c=>c.uid),['other','egg-a']);
    f.s.pension.eggs=[];tick();
    assert.equal(f.e.automation.state.hatched||0,0);
    f.s.stats.hatched++;tick();
    assert.equal(f.e.automation.state.hatched,1);assert.match(f.e.status,/目标已完成/);
});

test('a manually chosen incomplete party does not start native auto-fill through egg collection', t => {
    const f = fixture(t, { autoTeam: false }), before = [...f.s.team];
    assert.equal(f.service(), false);
    assert.deepEqual(f.actions, []);
    assert.deepEqual(f.s.team, before);
    assert.equal(f.s.pension.eggs.length, 1);
    assert.equal(f.e.automation.state.eggService, undefined);
});

test('a full manual party can collect an egg while preserving its original selected order', t => {
    const f = fixture(t, { autoTeam: false });
    f.s.mons.push(...[9,3,65,68,149].map((id,index)=>({uid:'manual-'+index,id,level:70})));
    f.s.team=f.s.mons.map(mon=>mon.uid);f.s.road=[...f.s.team];const before=[...f.s.team];
    assert.equal(f.service(), true);f.advance(1200);f.service();
    assert.equal(f.e.automation.state.autoHatched, 1);
    assert.deepEqual(f.s.team, before);assert.deepEqual(f.s.road, before);
    assert.equal(f.ui.screen, 'adventure');
});

test('pending egg UID waits for native save confirmation without repeated hatch clicks', t => {
    const f = fixture(t, {}, { deferCommit: true });
    assert.equal(f.service(), true);
    for (const delay of [1200, 1200, 5000]) { f.advance(delay); assert.equal(f.service(), true); }
    assert.equal(f.clicks().length, 1);
    assert.equal(f.e.automation.state.autoHatched || 0, 0);
    const saved = JSON.parse(f.storage.getItem('pokecatch-helper:v1:auto-eggs-v300'));
    assert.equal(saved.resume.flow.eggService.tx.uid, 'egg-a');
    f.commit('egg-a'); f.advance(1200); f.service();
    assert.equal(f.e.automation.state.autoHatched, 1);
    assert.equal(f.e.automation.state.eggService, undefined);
    assert.equal(f.ui.screen, 'adventure');
    f.service(); assert.equal(f.e.automation.state.autoHatched, 1);
});

test('unconfirmed hatch leaves the egg intact, returns and backs off instead of double clicking', t => {
    const f = fixture(t, {}, { deferCommit: true });
    f.service(); f.advance(16000); f.service();
    assert.equal(f.clicks().length, 1);
    assert.equal(f.s.pension.eggs.length, 1);
    assert.equal(f.e.automation.state.eggService, undefined);
    assert.equal(f.ui.screen, 'adventure');
    f.advance(1000); assert.equal(f.service(), false); assert.equal(f.clicks().length, 1);
});

test('disappearance without native hatch-count growth does not invent a completed hatch', t => {
    const f = fixture(t, {}, { deferCommit: true });
    f.service(); f.s.pension.eggs = []; f.save(); f.advance(1200); f.service();
    assert.equal(f.e.automation.state.autoHatched || 0, 0);
    f.advance(15000);f.service();
    assert.equal(f.e.automation.state.eggService, undefined);
    assert.equal(f.ui.screen, 'adventure');
});

test('background hatching waits for a split counter save before taking the next egg', t => {
    const f=fixture(t,{}, {deferCommit:true});
    f.s.pension.eggs.push({uid:'egg-b',id:4,hatchAt:f.now()-1000});
    f.service();
    f.s.pension.eggs.shift();f.save();f.advance(1200);f.service();
    assert.deepEqual(f.clicks().map(click=>click.uid),['egg-a']);
    f.s.stats.hatched++;f.save();f.advance(1200);f.service();
    assert.equal(f.e.automation.state.autoHatched,1);
    assert.deepEqual(f.clicks().map(click=>click.uid),['egg-a','egg-b']);
    f.commit('egg-b');f.advance(1200);f.service();
    assert.equal(f.e.automation.state.autoHatched,2);assert.equal(f.ui.screen,'adventure');
});

test('a breeding task finishes its incubating target even without either parent', t => {
    const f=fixture(t,{mode:'breed',breedId:1,breedGoal:1,breedShiny:false});
    const future=f.now()+12000;
    f.s.pension.eggs[0].hatchAt=future;
    f.e.automation.breed(f.s,f.now());
    assert.ok(f.e.running,f.e.status);assert.equal(f.e.nextWake,future);
    assert.equal(f.e.driver.teamTask,null);assert.equal(f.clicks().length,0);
    f.advance(12000);
    f.s.pension.eggs.unshift({uid:'other',id:4,hatchAt:f.now()});
    f.e.automation.breed(f.s,f.now());
    assert.deepEqual(f.clicks().map(click=>click.uid),['egg-a']);
    f.e.automation.breed(f.s,f.now()+1200);
    assert.equal(f.e.automation.state.hatched,1);assert.match(f.e.status,/目标已完成/);
    assert.deepEqual(f.s.pension.eggs.map(egg=>egg.uid),['other']);
});

test('duplicate hatch without a receipt continues and a batch counts each UID exactly once', t => {
    const f = fixture(t);
    f.s.pension.eggs.push({ uid: 'egg-b', id: 4, hatchAt: f.now() - 1000 });
    f.service(); f.advance(1200); f.service(); f.advance(1200); f.service();
    assert.deepEqual(f.clicks().map(click => click.uid), ['egg-a', 'egg-b']);
    assert.equal(f.e.automation.state.autoHatched, 2);
    assert.equal(f.e.automation.state.eggService, undefined);
    assert.equal(f.ui.screen, 'adventure');
});

test('a mature egg plus a future egg returns immediately after the mature hatch', t => {
    const f = fixture(t);
    f.s.pension.eggs.push({ uid: 'future', id: 4, hatchAt: f.now() + 3600000 });
    f.service(); f.advance(1200); f.service();
    assert.equal(f.clicks().length, 1);
    assert.deepEqual(f.s.pension.eggs.map(egg => egg.uid), ['future']);
    assert.equal(f.e.automation.state.eggService, undefined);
    assert.equal(f.ui.screen, 'adventure');
    assert.equal(f.service(), false);
});

test('native-disabled readiness after local deadline backs off and returns without consuming', t => {
    const f = fixture(t, {}, { ready: false });
    f.service();
    assert.equal(f.clicks().length, 0);
    assert.equal(f.e.automation.state.eggService, undefined);
    assert.equal(f.ui.screen, 'adventure');
    f.advance(1200); assert.equal(f.service(), false);
    assert.equal(f.actions.filter(action => action.type === 'nav').length, 2);
});

test('native-ready eggs can be collected when native and wall clocks disagree', t => {
    const f = fixture(t, {}, { forceReady: true });
    f.s.pension.eggs[0].hatchAt = f.now() + 60000; f.ui.screen = 'pension';
    assert.equal(f.service(), true);
    assert.equal(f.clicks().length, 1);
});

test('switching off during a pending hatch confirms it and returns without a second collection', t => {
    const f = fixture(t, {}, { deferCommit: true });
    f.s.pension.eggs.push({ uid: 'egg-b', id: 4, hatchAt: f.now() - 1000 });
    f.service(); f.e.settings.autoEggs = false; f.commit('egg-a'); f.advance(1200); f.service();
    assert.equal(f.e.automation.state.autoHatched, 1);
    assert.equal(f.clicks().length, 1);
    assert.equal(f.e.automation.state.eggService, undefined);
});

test('refresh restores the pending UID, original screen, count and shared budget', t => {
    const f = fixture(t, {}, { deferCommit: true });
    f.ui.screen = 'map'; f.e.budget.spent = 45; f.e.budget.used = 2; f.e.automation.state.autoHatched = 3;
    f.service(); f.e.suspend();
    const next = new H.Engine(f.storage); next.loadAccount(f.e.state); f.installDriver(next); next.start(true);
    assert.equal(next.running, true, next.status);
    assert.equal(next.automation.state.eggService.tx.uid, 'egg-a');
    assert.equal(next.automation.state.eggService.returnScreen, 'map');
    assert.equal(next.budget.spent, 45); assert.equal(next.budget.used, 2);
    f.advance(1200); f.service(next); assert.equal(f.clicks().length, 1);
    f.commit('egg-a'); f.advance(1200); f.service(next);
    assert.equal(next.automation.state.autoHatched, 4);
    assert.equal(f.ui.screen, 'map');
    next.stop();
});

test('auto eggs preserve the preparation task, targets, original route and its UI deadlines', t => {
    const f = fixture(t, { mode: 'progress' });
    const p = { phase: 'train', phaseAt: f.now(), lastGrowth: f.now(), lastTick: f.now(),
        targets: [{ uid: 'a', goal: 75 }], uids: ['a'], resume: { row: { id: 8 } } };
    f.e.preparation = p; f.e.budget.spent = 75; f.e.budget.used = 1;
    f.service(); f.advance(3000); f.service();
    assert.equal(f.e.preparation, p);
    assert.deepEqual(p.targets, [{ uid: 'a', goal: 75 }]);
    assert.deepEqual(p.resume, { row: { id: 8 } });
    assert.equal(p.phase, 'train'); assert.equal(p.phaseAt, f.now()); assert.equal(p.lastGrowth, f.now());
    assert.equal(f.e.settings.mode, 'progress'); assert.equal(f.e.budget.spent, 75); assert.equal(f.e.budget.used, 1);
});

test('mature eggs hatch during an ordinary battle without resetting the training route or battle',t=>{
    const f=fixture(t,{mode:'progress'}),battle={steps:3,enemies:[{id:19,hp:10}]};f.s.adv.battle=battle;
    const prep=f.e.preparation={phase:'train',phaseAt:f.now(),lastGrowth:f.now(),lastTick:f.now(),targets:[{uid:'a',goal:75}],uids:['a'],resume:{row:{id:8}}};
    f.e.budget.spent=75;f.e.budget.used=1;
    assert.equal(f.service(),true);assert.equal(f.clicks().length,1);assert.equal(f.s.adv.battle,battle);
    battle.steps++;battle.enemies[0].hp=5;f.advance(1200);f.service();
    assert.equal(f.e.automation.state.autoHatched,1);assert.equal(f.e.automation.state.eggService,undefined);assert.equal(f.ui.screen,'adventure');
    assert.equal(f.s.adv.battle,battle);assert.equal(battle.steps,4);assert.equal(battle.enemies[0].hp,5);
    assert.equal(f.e.preparation,prep);assert.equal(prep.phase,'train');assert.deepEqual(prep.targets,[{uid:'a',goal:75}]);assert.deepEqual(prep.resume,{row:{id:8}});
    assert.equal(f.e.budget.spent,75);assert.equal(f.e.budget.used,1);
});

test('a new native choice during egg navigation returns to adventure without clicking another egg',t=>{
    const f=fixture(t);f.e.automation.state.eggService={started:f.now(),returnScreen:'map'};f.ui.screen='pension';f.s.adv.pending={type:'gift',gift:{choices:[1,4,7]}};
    assert.equal(f.service(),true);assert.equal(f.clicks().length,0);assert.equal(f.ui.screen,'adventure');assert.equal(f.e.automation.state.eggService,undefined);
    assert.deepEqual(f.s.adv.pending.gift.choices,[1,4,7]);assert.equal(f.s.pension.eggs.length,1);
});

const gates = {
    'native pending choice': f => { f.s.adv.pending = {}; },
    'raid event': f => { f.s.adv.event = { raid: true }; },
    'legend entrance riddle': f => { f.s.adv.zone = { id: 150, riddle:'door' }; },
    'world boss capture': f => { f.s.adv.zone = { id: 493 }; },
    'tower battle': f => { f.s.adv.tower = {}; },
    'elite league': f => { f.s.adv.league = {}; },
    'raid probe': f => { f.e.raidProbe = true; },
    'raid return': f => { f.e.raidReturn = {}; },
    'map launch': f => { f.e.driver.pendingMap = {}; },
    'party adjustment': f => { f.e.driver.teamTask = {}; },
    'special party dialog': f => { f.e.driver.ownedDialog = {}; },
    'owned member card': f => { f.e.automation.owner = {}; },
    'buddy change': f => { f.e.automation.buddyTask = {}; },
    'buff UI': f => { f.e.automation.buffUI = {}; },
    'preparation candy transaction': f => { f.e.preparation = { candyTx: {} }; },
    'resource transaction': f => { f.e.automation.state.resourceTx = {}; },
    'automatic berry transaction': f => { f.e.automation.state.autoBuffTx = {}; },
    'resource berry transaction': f => { f.e.automation.state.resourceBuffTx = {}; },
    'tower launch confirmation': f => { f.e.automation.state.towerLaunch = { at: f.now() }; },
    'factory launch confirmation': f => { f.e.automation.state.candyLaunch = { at: f.now() }; },
    'factory settlement confirmation': f => { f.e.automation.state.candyRun = { day: H.parisDay(f.now()), at: f.now() }; },
    'native settlement wait': f => { f.e.automation.state.waitUntil = f.now() + 5000; },
    'dedicated breeding workflow': f => { f.e.settings.mode = 'breed'; },
    'other visible native FX': f => { f.ui.fx = [node()]; },
};
for (const [name, gate] of Object.entries(gates)) test('auto-egg side service yields to ' + name, t => {
    const f = fixture(t); gate(f);
    assert.equal(f.service(), false);
    assert.deepEqual(f.actions, []);
    assert.equal(f.e.automation.state.eggService, undefined);
});

test('owned slow hatch FX remain actionable after 15 seconds without spending an extra egg', t => {
    const f = fixture(t, {}, { deferCommit: true }); f.service();
    const tap = node({ disabled: true }), fx = node({ querySelectorAll: () => [tap] });
    f.ui.fx = [fx]; assert.equal(f.e.automation.eggUI(f.s, f.now()), true);
    f.advance(20000); tap.disabled = false;
    assert.equal(f.e.automation.eggUI(f.s, f.now()), true);
    const click = f.actions.at(-1); assert.equal(click.label, '领取孵蛋结果'); assert.equal(click.pointer, true);
    assert.equal(f.clicks().length, 1);
    assert.equal(f.e.running, true);
});

test('a replacement hatch FX node cannot inherit ownership from the bound animation', t => {
    const f = fixture(t, {}, { deferCommit: true }); f.service();
    const first = node({ querySelectorAll: () => [node({ disabled: true })] });
    f.ui.fx = [first]; f.e.automation.eggUI(f.s, f.now());
    first.isConnected = false;
    f.ui.fx = [node({ querySelectorAll: () => [node()] })]; f.advance(1200);
    const before = f.actions.length;
    f.e.automation.eggUI(f.s, f.now());
    assert.equal(f.actions.length, before);
    assert.equal(f.e.running, false);
    assert.match(f.e.status, /界面发生变化/);
});

test('an unknown modal in front of an owned hatch FX is never clicked through', t => {
    const f = fixture(t, {}, { deferCommit: true }); f.service();
    f.ui.fx = [node({ querySelectorAll: () => [node()] })]; f.ui.modal = node();
    const before = f.actions.length;
    assert.equal(f.e.automation.eggUI(f.s, f.now()), true);
    assert.equal(f.actions.length, before);
    assert.match(f.e.status, /前方弹窗/);
});

test('FX completion grants a brief single-action receipt acknowledgement and then releases it', t => {
    const f = fixture(t, {}, { deferCommit: true }); f.service();
    const fx = node({ querySelectorAll: () => [node({ disabled: true })] });
    f.ui.fx = [fx]; f.e.automation.eggUI(f.s, f.now()); f.advance(20000);
    fx.isConnected = false; f.ui.fx = [];
    const button = node({ matches: selector => selector === '.gold,.primary' });
    f.ui.card = node({ querySelector: key=>key==='.dexcard'?{}:key==='.dc-head .dc-sum b'?{textContent:'1'}:null,querySelectorAll: () => [button] });
    assert.equal(f.e.automation.eggUI(f.s, f.now()), true);
    assert.equal(f.actions.at(-1).label, '确认自动收蛋结果');
    const before = f.actions.length;
    assert.equal(f.e.automation.eggUI(f.s, f.now()), false);
    assert.equal(f.actions.length, before);
});

test('a delayed receipt must match the last clicked egg and may only be acknowledged once',t=>{
    const f=fixture(t);f.service();f.service();f.advance(30000);
    let species='6';const button=node({matches:sel=>sel==='.gold,.primary'});
    f.ui.card=node({querySelector:key=>key==='.dexcard'?{}:key==='.dc-head .dc-sum b'?{textContent:species}:null,querySelectorAll:()=>[button]});
    const confirm=()=>f.e.automation.eggUI(f.s,f.now());
    assert.equal(confirm(),false);species='1';f.ui.evt=node();assert.equal(confirm(),false);
    f.ui.evt=null;assert.equal(confirm(),true);assert.equal(confirm(),false);
});

test('a choice after opening the nursery keeps the task and resumes the same egg after two minutes',async t=>{
    const f=fixture(t),{e,s,ui}=f;
    e.automation.state.eggService={started:f.now(),returnScreen:'adventure'};
    ui.screen='pension';ui.modal=node({id:'fixture-choice',querySelector:()=>({textContent:'选择道具'}),querySelectorAll:()=>[node({textContent:'保留'})]});
    await e.step(f.now());f.advance(125000);await e.step(f.now());
    assert.ok(e.running);assert.equal(f.clicks().length,0);assert.match(e.status,/选择道具.*保留/);
    assert.equal(e.logs.filter(row=>row.text.includes('fixture-choice')).length,1);
    ui.modal=null;f.advance(1000);await e.step(f.now());f.advance(1200);await e.step(f.now());
    assert.equal(f.clicks().length,1);assert.equal(s.stats.hatched,1);assert.equal(e.automation.state.eggService,undefined);
});

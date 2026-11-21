const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

// Synthetic fixtures. No connection to the game or player storage.
const now = new Date(2026, 10, 21, 12).getTime();
const mon = (id, level = 100) => ({ id, level, uid: 'm' + id });
function save() {
    return { mons: [mon(6)], team: ['m6'], dex: {}, items: {}, stats: {},
        travel: { to: ['johto', 'hoenn', 'sinnoh', 'unova'] },
        adv: { chapter: 50, unlocked: 83, badges: ['Maître', 'Forêt', 'Maître Sinnoh'], gifts: {}, loops: [], node: 0 } };
}
const settings = id => H.normalizeSettings({ mode: 'dex', dexSpecies: [id], region: 'current' });

test('Mew counts 150 exact Kanto entries including evolved species and other legendaries', () => {
    const s = save();
    for (let id = 1; id <= 150; id++) s.dex[id] = { caught: 1 };
    delete s.dex[3];
    assert.deepEqual(H.legendRequirements(s, [151]).lines[0].missing, [3]);
    assert.equal(H.legendRequirements(s, [151]).lines[0].have, 149);
    delete s.dex[150];
    const p = H.legendRequirements(s, [151, 151]);
    assert.deepEqual([...p.zones], [150]);
    assert.deepEqual([...p.wild], [3]);
    assert.deepEqual(p.goals, [151]);
    s.dex[3] = s.dex[150] = { caught: 1 };
    assert.deepEqual([...H.legendRequirements(s, [151]).zones], [151]);
});

test('Giratina plans the lake trio, local wins, the shared orb maps and then both bosses', () => {
    const s = save(), cfg = settings(487);
    let p = H.legendRequirements(s, [487]);
    assert.ok(p.trainers.has('sinnoh') && p.roam.has(481) && p.wild.size > 75);
    assert.equal(p.items.size, 0);
    const count = H.DATA.zones.find(z => z.id === 480).gate;
    for (const id of count.ids.slice(0, 75)) s.dex[id] = { caught: 1 };
    s.stats.byReg = { sinnoh: { trainers: 999 } };
    p = H.legendRequirements(s, [487]);
    assert.ok(p.zones.has(480) && !p.zones.has(482));
    assert.ok(H.prerequisiteRoutes(s, cfg, p, now).every(r => r.reg === 'sinnoh'));
    s.stats.byReg.sinnoh.trainers++;
    assert.ok(H.legendRequirements(s, [487]).zones.has(482));
    s.mons.push(mon(481));
    s.pension = { mons: [{ mon: mon(480) }] };
    s.under = { slots: [{ mons: [mon(482)] }] };
    const maps = H.dexRanking(s, cfg, {}, now);
    assert.deepEqual(maps.map(r => r.id).sort(), [50, 57]);
    assert.ok(maps.every(r => r.gateRoute && /金刚宝珠、白玉宝珠/.test(r.prepNote)));
    s.items['adamant-orb'] = 1;
    s.link = { to: 'unova', side: 'from', stash: { items: { 'lustrous-orb': 1 } } };
    assert.deepEqual([...H.legendRequirements(s, [487]).zones], [483, 484]);
    s.mons.push(mon(483));
    s.dex[484] = { caught: 1 };
    p = H.legendRequirements(s, [487]);
    assert.deepEqual(p.lines[0].missing, [484]);
    assert.ok(!p.zones.has(487) && p.notes.some(n => n.includes('重新持有')));
    s.mons.push(mon(484));
    assert.deepEqual([...H.legendRequirements(s, [487]).zones], [487]);
});

test('origin form tracks the elite reward and returns to the requested form when acquired', () => {
    const s = save(); s.mons.push(mon(487));
    const p = H.legendRequirements(s, [48701]);
    assert.equal(p.elites.get(487), 1);
    const e = new H.Engine({}, settings(48701));
    let trip;
    e.travel = (row, at, opts) => { trip = [row.id, opts.tier]; };
    assert.equal(e.advanceRequirements(s, e.settings, p, [], now), true);
    assert.deepEqual(trip, [487, 1]);
    s.items['griseous-orb'] = 1;
    assert.deepEqual([...H.legendRequirements(s, [48701]).zones], [48701]);
});

test('the selected Giratina task advances through Mesprit, each orb and each live parent independently', () => {
    const s=save(),e=new H.Engine({}, {mode:'legend',legendId:487,legendTier:0,legends:true});
    s.roam={caught:[],at:{481:{ch:50,until:now+60000}}};
    let action;
    e.roaming=(state,at,cfg,sub)=>action=['roam',cfg.roamId,sub];
    e.findLegend=(state,status)=>{action=['zones',...status.ids];return true;};
    e.travel=(row,at,opt)=>action=[opt?.zone?'zone':'route',row.id];
    e.legend(s,now);assert.deepEqual(action,['roam',481,true]);
    s.mons.push(mon(480),mon(481),mon(482));s.roam.caught.push(481);
    s.items['lustrous-orb']=1;e.legend(s,now);assert.deepEqual(action,['zones',484]);
    s.mons.push(mon(484));e.legend(s,now);assert.equal(action[0],'route');
    assert.ok([50,57].includes(action[1]));assert.equal(e.settings.legendId,487);
    s.items['adamant-orb']=1;e.legend(s,now);assert.deepEqual(action,['zones',483]);
    s.mons.push(mon(483));e.legend(s,now);assert.deepEqual(action,['zone',487]);
});

test('subgoals obey the master-ball permission and return to the outer task', () => {
    const s = save(), cfg = settings(487); s.items['master-ball'] = 1;
    s.roam = { at: { 481: { ch: 50, until: now + 10000 } } };
    const p = H.legendRequirements(s, [487]);
    const e = new H.Engine({}, cfg);
    let pursued;
    e.roaming = (state, at, sub, prerequisite) => { pursued = [sub.roamId, prerequisite]; };
    assert.equal(e.advanceRequirements(s, cfg, p, [{ key: '50' }], now), false);
    assert.equal(pursued, undefined);
    assert.equal(e.advanceRequirements(s, { ...cfg, roamAllowMasterBall: true }, p, [], now), true);
    assert.deepEqual(pursued, [481, true]);
    assert.deepEqual(e.settings.dexSpecies, [487]);
});

test('sealed temples require their badge and party, then return to the normal boss after opening', () => {
    const s = save(), cfg = settings(378), e = new H.Engine({}, cfg);
    let trip;
    e.travel = (row, at, opts) => { trip = [row.id, opts.riddle]; };
    assert.ok(!H.legendRequirements(s,[378]).doors.size);
    s.adv.badges.push('Poing');
    e.advanceRequirements(s,cfg,H.legendRequirements(s,[378]),[],now);
    assert.deepEqual(trip,[378,true]);
    s.zoneDoors = {regice:1};
    assert.deepEqual([...H.legendRequirements(s,[378]).zones],[378]);
    s.adv.badges.push('Balance');
    assert.ok(H.legendRequirements(s,[377]).wild.has(66));
    s.mons.push(mon(66)); e.teamRetryAt=0;
    e.advanceRequirements(s,{...cfg,autoTeam:true},H.legendRequirements(s,[377]),[],now);
    assert.ok(e.driver.teamTask.uids.includes('m66'));
    assert.deepEqual(H.legendRequirements(s,[486]).lines.find(r=>r.id===486).missing,[377,378,379]);
});

test('Mew can train an owned pre-evolution, preserving manual party and evolution settings', () => {
    const s = save(), cfg = settings(151);
    for (let id = 1; id <= 150; id++) s.dex[id] = { caught: 1 };
    delete s.dex[3]; s.mons.push(mon(2, 24));
    const p = H.legendRequirements(s, [151]);
    const e = new H.Engine({}, cfg);
    e.driver.nav = () => true; e.teamRetryAt = 0;
    e.advanceRequirements(s, { ...cfg, autoTeam: false }, p, [], now);
    assert.ok(!e.driver.teamTask);
    e.advanceRequirements(s, { ...cfg, autoEvolve: false }, p, [], now);
    assert.ok(!e.driver.teamTask);
    e.advanceRequirements(s, { ...cfg, autoTeam: true, autoEvolve: true }, p, [], now);
    assert.ok(e.driver.teamTask.uids.includes('m2'));
    assert.match(e.status, /妙蛙草.*妙蛙花/);
});

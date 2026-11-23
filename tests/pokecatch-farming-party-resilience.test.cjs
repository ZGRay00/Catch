'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const H = require('../Pokecatch自动助手.user.js');

const now = Date.parse('2026-11-23T22:12:00+08:00');
const chapter = H.DATA.chapters.find(row => row.id === 75);
const route = { ...chapter, key: String(chapter.loop), members: [chapter.id] };

function member(id, level, shiny = false) {
    return { uid: `mon-${id}`, id, level, shiny, reg: 'unova' };
}

function farmingFixture() {
    // Reconstruct the two teams from species and levels only. No save data,
    // account info, individual modifiers or live encounters enter the fixture.
    const original = [
        member(609, 100), member(464, 100), member(145, 100),
        member(484, 100), member(392, 100, true), member(282, 100),
    ];
    const recommended = [
        member(465, 100), member(531, 95), member(370, 99),
        member(10, 99), member(115, 96), member(289, 100),
    ];
    const trainee = member(374, 44);
    const lowHeadroom = new Set(recommended.slice(1, 5).map(mon => mon.uid));
    const state = {
        mons: [...original, ...recommended, trainee],
        team: recommended.map(mon => mon.uid),
        autoSwitch: true,
        adv: { chapter: route.id, unlocked: 83, badges: [], gifts: {} },
    };
    return { state, trainee, lowHeadroom };
}

function assertSaferParty(state, plan, lowHeadroom, settings, referenceParty = state.team, turnBudget = 1.12) {
    assert.equal(plan.uids.length, 6);
    assert.ok(plan.uids.every(uid => state.mons.some(mon => mon.uid === uid)));
    assert.ok(plan.uids.filter(uid => lowHeadroom.has(uid)).length <= 2,
        'a small ordinary-route speed edge should not fill most combat slots with fragile specialists');

    const before = H.battleRouteFit(state, route, referenceParty, now, settings);
    const after = H.battleRouteFit(state, route, plan.uids, now, settings);
    assert.equal(after.minCoverage, 1);
    assert.ok(after.worstDeaths <= before.worstDeaths);
    assert.ok(after.turns <= before.turns * turnBudget, 'the lineup still needs comparable ordinary route speed');
}

test('money uses stronger backups when shallow-route accuracy provides only a small speed advantage', () => {
    const { state, lowHeadroom } = farmingFixture();
    const settings = { ...H.DEFAULTS, mode: 'money', autoTeam: true, activeSwitch: false };
    for (const verifyAll of [false, true]) {
        const plan = H.planAdventureTeam(state, settings, [], { row: route, now, verifyAll });
        assertSaferParty(state, plan, lowHeadroom, settings);
        assert.equal(plan.changed, true);
        if (verifyAll) assert.equal(plan.verification.status, 'verified');
    }
});

test('the steady farming lineup can handle a stronger encounter outside the ordinary payout model', () => {
    const { state } = farmingFixture();
    const settings = { ...H.DEFAULTS, mode: 'money', autoTeam: true };
    const plan = H.planAdventureTeam(state, settings, [], { row: route, now, verifyAll: true });
    const roamer = H.roamingCombatFoe(641, route.id);
    const survival = uids => H.roamingBattle(
        H.partyMons(state, uids).map(mon => H.matchupDetails(mon, roamer)), roamer,
    );
    assert.ok(survival(state.team).coverage < 1);
    assert.equal(survival(plan.uids).coverage, 1);
});

test('experience planning preserves the pinned learner while strengthening their escort', () => {
    const { state, trainee, lowHeadroom } = farmingFixture();
    const settings = { ...H.DEFAULTS, mode: 'train', trainLevel: 100, autoTeam: true, activeSwitch: false };
    const plan = H.planAdventureTeam(state, settings, [trainee.uid], { row: route, now, verifyAll: true });
    // Compare with the prior solver's eligible party carrying the same learner.
    const previous = [trainee.uid, 'mon-465', 'mon-370', 'mon-10', 'mon-115', 'mon-289'];
    assertSaferParty(state, plan, lowHeadroom, settings, previous, 1.06);
    assert.ok(plan.uids.includes(trainee.uid));
    assert.equal(plan.verification.members.find(mon => mon.uid === trainee.uid)?.role, 'pinned');
});

test('a fragile specialist remains when it is needed to clear a key matchup', () => {
    const mons = [member(51, 72), member(130, 72), member(131, 72)];
    const state = {
        mons,
        team: [mons[1].uid],
        autoSwitch: true,
        adv: { chapter: route.id, unlocked: 83, badges: [] },
    };
    const foes = [{ id: 466, level: 68, weight: 1, gymCount: 1 }];
    const settings = { ...H.DEFAULTS, mode: 'money', autoTeam: true, activeSwitch: false };
    const plan = H.planAdventureTeam(state, settings, [], { foes, size: 1, now, verifyAll: true });
    assert.deepEqual(plan.uids, [mons[0].uid]);
    assert.equal(plan.verification.safety.keyWipeWeight, 0);
});

test('manual money mode ranks the selected team without projecting PC recruits', () => {
    const { state } = farmingFixture();
    const settings = { ...H.DEFAULTS, mode: 'money', autoTeam: false };
    const estimate = save => H.moneyRanking(save, settings, {}, {}, now).find(row => row.id === route.id);
    const full = estimate(state);
    const stockedPartyOnly = estimate({ ...state, mons: state.mons.filter(mon => state.team.includes(mon.uid)) });
    assert.equal(full.projectedMoneyRate, undefined);
    assert.equal(full.routePlan, undefined);
    assert.equal(full.rate, stockedPartyOnly.rate);
});

test('verified money planning avoids a same-speed reserve swap for a negligible improvement', () => {
    const lead = member(289, 100);
    const reserve = member(484, 100);
    const alternate = { ...reserve, uid: 'alternate', statMult: 1.03 };
    const state = {
        mons: [lead, reserve, alternate],
        team: [lead.uid, reserve.uid],
        autoSwitch: false,
        adv: { chapter: route.id, unlocked: 83 },
    };
    const foes = [{ id: 19, level: 30, weight: 4 }, { id: 20, level: 30, weight: 1, gymCount: 1 }];
    const settings = { ...H.DEFAULTS, mode: 'money', autoTeam: true, activeSwitch: false };
    const plan = H.planAdventureTeam(state, settings, [], { foes, size: 2, now, verifyAll: true });
    assert.ok(plan.gain > 0 && plan.gain < 0.0075);
    assert.deepEqual(plan.suggestion.uids, [lead.uid, alternate.uid]);
    assert.deepEqual(plan.uids, state.team);
    assert.equal(plan.changed, false);
});

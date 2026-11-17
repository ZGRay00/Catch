const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js'),native=require('./fixtures/pokecatch-team-native.json');
// Native samples from the isolated public build b05c8cc201, not an implementation mirror.
const state=()=>({mons:[{uid:'a',id:65,level:50}],team:['a'],adv:{chapter:3,unlocked:8},travel:{to:[]}});
const context=()=>({force:true,size:1,foes:[{id:68,level:50,weight:1}]});

test('team scoring metadata matches the current native HP and taste rules',()=>{
    assert.equal(H.DATA.combat.hpBoost,native.hpBoost);
    for(const key of ['MAX','CAP','LIN','DIS0'])assert.equal(H.DATA.combat.tastes[key],native.tastes[key]);
});

test('effective battle stats match 32 native species, level, rank, shiny and taste combinations',()=>{
    for(const {mon,stats}of native.samples)assert.deepEqual(H.effectiveStats(mon),stats,JSON.stringify(mon));
});

test('taste modifies the five non-HP stats while retaining the native boosted HP',()=>{
    const plain={id:6,level:100},modified={...plain,taste:{h:'def',up:{atk:25},n:25}};
    const a=H.effectiveStats(plain),b=H.effectiveStats(modified);
    assert.equal(a.hp,b.hp);assert.ok(b.atk>a.atk);assert.ok(b.def<a.def);assert.equal(a.spa,b.spa);
});

test('changing a team member taste invalidates the roster and matchup cache',()=>{
    const s=state(),c=context();H.clearTeamCache();
    const before=H.planAdventureTeam(s,H.DEFAULTS,[],c),fingerprint=H.rosterFingerprint(s),misses=H.teamCacheStats().misses;
    H.planAdventureTeam(s,H.DEFAULTS,[],c);assert.equal(H.teamCacheStats().misses,misses);
    s.mons[0].taste={h:'atk',up:{spa:25},n:25};
    const after=H.planAdventureTeam(s,H.DEFAULTS,[],c);
    assert.notEqual(H.rosterFingerprint(s),fingerprint);assert.ok(H.teamCacheStats().misses>misses);assert.ok(after.score>before.score);
});

test('taste bookkeeping that leaves stats unchanged does not trigger redundant team reevaluation',()=>{
    const s=state(),c=context();s.mons[0].taste={h:'atk',up:{spa:25},n:25,sw:{}};H.clearTeamCache();
    const plan=H.planAdventureTeam(s,H.DEFAULTS,[],c),fingerprint=H.rosterFingerprint(s),misses=H.teamCacheStats().misses;
    s.mons[0].taste.n=26;s.mons[0].taste.sw={spa:{i:1,n:2,e0:.2}};
    const again=H.planAdventureTeam(s,H.DEFAULTS,[],c);
    assert.equal(H.rosterFingerprint(s),fingerprint);assert.equal(H.teamCacheStats().misses,misses);assert.equal(again.score,plan.score);
});

test('opponent taste changes do not reuse a stale matchup row',()=>{
    const s=state(),c=context();H.clearTeamCache();const before=H.planAdventureTeam(s,H.DEFAULTS,[],c),misses=H.teamCacheStats().misses;
    c.foes[0].taste={h:'spd',up:{atk:25}};
    const after=H.planAdventureTeam(s,H.DEFAULTS,[],c);
    assert.ok(H.teamCacheStats().misses>misses);assert.notEqual(after.score,before.score);
});

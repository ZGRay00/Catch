const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../Pokecatch自动助手.user.js');

function fixture(id) {
    return {trainer:{id}, mons:[], team:[], road:[], dex:{}, travel:{to:[]}, adv:{chapter:0, layout:H.DATA.layout}};
}
function storage() {
    const data = new Map();
    return {getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value), removeItem:key => data.delete(key)};
}
test('loading profiles keeps usable measures from partially damaged route histories', () => {
    const store = storage(), engine = new H.Engine(store);
    store.setItem('pokecatch-helper:v1:A', JSON.stringify({metrics:{
        legacy:{net:-12, seconds:60, runs:8.5, itemSeconds:600, itemRuns:8},
        xpOnly:{xp:300, xpSeconds:60, xpRuns:2}, broken:{runs:'8',seconds:'60',net:'bad'}, empty:null
    }}));
    engine.loadAccount(fixture('A'));
    assert.deepEqual(Object.keys(engine.metrics).sort(),['legacy','xpOnly']);
    assert.equal(engine.metrics.legacy.net,-12);
    assert.equal(engine.metrics.legacy.runs,8.5);
    assert.equal(engine.metrics.legacy.itemSeconds,undefined);
    assert.equal(engine.metrics.xpOnly.xp,300);
    assert.equal(engine.metrics.xpOnly.runs,0);
    assert.equal(engine.telemetry.metrics,engine.metrics);
});
test('idle account changes isolate queue, budget, run metrics and loop restoration', () => {
    const store = storage(), engine = new H.Engine(store,{mode:'money'});
    engine.loadAccount(fixture('A'));
    engine.queue=[{settings:{mode:'money'},id:'previous'}]; engine.oldLoops=[1]; engine.started=1;
    engine.budget.spent=200; engine.metrics.first={runs:1,seconds:60,net:42}; engine.persist(false);
    const original=store.getItem('pokecatch-helper:v1:A');
    engine.running=true;
    assert.throws(()=>engine.loadAccount(fixture('B')));
    engine.running=false; engine.loadAccount(fixture('B'));
    assert.equal(engine.settings.mode,H.DEFAULTS.mode); assert.equal(engine.oldLoops,undefined);
    assert.equal(engine.started,undefined); assert.equal(engine.budget.spent,0);
    assert.deepEqual(engine.queue,[]); assert.deepEqual(engine.metrics,{});
    engine.persist(false); assert.equal(store.getItem('pokecatch-helper:v1:A'),original);
    engine.loadAccount(fixture('A')); assert.equal(engine.queue[0].id,'previous');assert.equal(engine.metrics.first.net,42);
});
test('breeding and nursery prediction use the same region-dependent offspring', () => {
    const s=fixture('A'), parent={id:26,uid:'raichu',level:30}, ditto={id:132,uid:'ditto',level:15};
    s.mons=[parent,ditto];s.pension={mons:[{mon:parent},{mon:ditto}]};
    for (const [regions,id] of [[[],25],[['johto'],172]]) {
        s.travel.to=regions;
        assert.equal(H.nurseryParentPool(s).parents[0].eggId,id);
        assert.equal(H.pensionPlan(s,id).parents[0].uid,parent.uid);
        assert.equal(H.pensionPlan(s,id===25?172:25).parents.length,0);
    }
});
test('queue imports keep duplicate job IDs independently addressable and reject unknown modes', () => {
    const input=[{id:'x',settings:{mode:'money'}},{id:'x',settings:{mode:'train'}},{settings:{mode:'constructor'}}];
    const jobs=H.normalizeJobs(input);
    assert.deepEqual(jobs.map(row=>row.settings.mode),['money','train']);
    assert.equal(new Set(jobs.map(row=>row.id)).size,2);
    assert.deepEqual(H.normalizeJobs(jobs),jobs);
    assert.throws(()=>H.parseConfigurationProfile({schema:1,format:'pokecatch-helper-profile',settings:{mode:'money'},queue:input}));
});
test('a breeding task waits for a delayed native hatch counter and completes exactly once', () => {
    const s=fixture('A'), e=new H.Engine(storage(),{mode:'breed',breedGoal:1});
    e.loadAccount(s);s.pension={eggs:[]};s.stats={hatched:30};
    const flow=e.automation;flow.state.hatch={uid:'departed',before:30,target:true,at:100};
    flow.breed(s,200);assert.ok(flow.state.hatch);assert.equal(flow.state.hatched,undefined);
    s.stats.hatched++;let done=0;flow.done=()=>done++;flow.breed(s,300);
    assert.equal(flow.state.hatched,1);assert.equal(done,1);assert.equal(flow.state.hatch,null);
});

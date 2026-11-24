'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ItemRoundTracker,expeditionPreview,geodePreview,RaidRerollLedger,parisDay}=require('../../Pokecatch自动助手.user.js');

test('item observations deduplicate saves, isolate purchases and restart on chapter rollover',()=>{
    const tracker=new ItemRoundTracker(),engine={running:true,account:'P',runId:1,settings:{mode:'item',itemId:'deep-sea-tooth'}};
    const s={trainer:{id:'P'},adv:{chapter:33,node:0,runs:0,badges:[],gifts:{},nodes:[
        {type:'item',loot:{'deep-sea-tooth':0.05}},{type:'wild'},{type:'item',loot:{'deep-sea-tooth':0.05}}]},
        stats:{itemIn:{'deep-sea-tooth':4},spent:{shop:0}},mons:[]};
    tracker.observe(s,engine);assert.equal(tracker.round.points.length,2);
    s.adv.node++;s.stats.itemIn['deep-sea-tooth']++;tracker.observe(s,engine);tracker.observe(s,engine);
    assert.equal(tracker.round.points[0].gained,1);assert.equal(tracker.round.observed,1);
    s.adv.node++;s.stats.itemIn['deep-sea-tooth']++;s.stats.spent.shop=150;tracker.observe(s,engine);
    assert.equal(tracker.round.observed,1);
    s.adv.runs++;s.adv.node=0;tracker.observe(s,engine);assert.equal(tracker.round.observed,0);
    engine.manual={};tracker.observe(s,engine);assert.equal(tracker.round,null);
});

test('underground separates rewards in reached floors, upcoming rewards and recalled runs',()=>{
    const slot={start:1000,end:40000,from:2,res:{floors:3,at:[0,2,4],loot:[[],[{k:'shards',n:5}],[{k:'item',id:'berry-oran'}]]}};
    const view=expeditionPreview(slot,7000);
    assert.equal(view.current,2);assert.deepEqual(view.earned,[['碎片',5]]);assert.equal(view.planned.length,2);
    assert.equal(view.rows[1].reached,false);assert.equal(expeditionPreview({...slot,recalled:7000},50000).rows.length,1);
    assert.equal(expeditionPreview(slot,40000).current,3);
    assert.match(expeditionPreview({...slot,res:{at:[]}}).error,/缺少/);
    assert.match(expeditionPreview({...slot,res:{...slot.res,at:[0,4,2]}}).error,/格式/);
});

test('geode preview matches fixed native openings and rejects unknown builds or invalid counters',()=>{
    const s={trainer:{id:'31415',since:98765432100},adv:{unlocked:2,badges:[]},mons:[{id:49303}],under:{slots:[],opened:[0,5,1,12]}};
    const actual=['ghost:0','steel:0','normal:0','ground:0','electric:0','normal:1','ground:0','fire:0','poison:0','ghost:0','rock:0','fairy:0'];
    const model=geodePreview(s,0,12,'f1ef0dd44e');
    assert.deepEqual(model.rows.map(r=>r.key),actual);assert.equal(model.rows[5].upgraded,1);assert.equal(s.under.opened[0],0);
    assert.ok(geodePreview(s,0,12,'different-build').error);
    s.under.opened[0]=-1;assert.ok(geodePreview(s,0,12,'bd1d674523').error);
});

test('raid history retains pre-draw evidence through reload and excludes retrospective records from its hit rate',()=>{
    const map=new Map(),store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
    const t=Date.UTC(2026,10,25,12),day=parisDay(t),yesterday=parisDay(t-86400000);
    const s={trainer:{id:'A'},adv:{unlocked:35,badges:[]},raids:{seen:yesterday,reroll:{day:yesterday,from:'johto',to:'kanto'}}};
    const tracker=new RaidRerollLedger(store);
    const prior=tracker.observe(s,null,t-86400000);assert.equal(prior.history.length,1);assert.equal(prior.attempts,0);
    s.raids={seen:day};
    const forecast=tracker.observe(s,{day,reg:'kanto'},t);
    assert.deepEqual(forecast.candidates,['johto']);assert.equal(forecast.row.predicted,'johto');
    const restart=new RaidRerollLedger(store);assert.deepEqual(restart.observe(s,null,t).candidates,['johto']);
    s.raids.reroll={day,from:'kanto',to:'johto'};
    const settled=restart.observe(s,null,t+100);assert.equal(settled.hits,1);assert.equal(settled.attempts,1);
    assert.equal(restart.observe(s,null,t+200).history.length,2);
    s.trainer.id='B';s.raids={};assert.equal(restart.observe(s,null,t).history.length,0);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function fixture(t,mode){
    const now=Date.UTC(2026,10,18,12,15);
    const mons=[6,160,282,445,468,609].map((id,i)=>({id,uid:'p'+i,level:78+i,xp:0}));
    const s={trainer:{id:'yield-slices-'+mode},mons,team:mons.map(m=>m.uid),dex:{},items:{},travel:{to:H.DATA.regions.map(r=>r.key)},
        adv:{chapter:55,unlocked:H.DATA.chapters.at(-1).id,gifts:{},badges:[],deaths:{}}};
    const engine=new H.Engine({getItem:()=>null,setItem(){},removeItem(){}},{mode,region:'all',autoPrepare:false,moneyBuff:false,trainBuddy:false,trainBuff:false});
    const timers=new Map();let id=0;
    t.mock.method(global,'setTimeout',fn=>{timers.set(++id,fn);return id;});
    t.mock.method(global,'clearTimeout',key=>timers.delete(key));
    const next=()=>{const entry=timers.entries().next().value;if(!entry)return false;timers.delete(entry[0]);entry[1]();return true;};
    const drain=()=>{let steps=0;while(next())assert.ok(++steps<10000);return steps;};
    return {s,engine,now,timers,next,drain};
}

for(const [mode,kind,rank] of [['money','money',H.moneyRanking],['train','xp',H.xpRanking]]){
    test(mode+' compares every region before navigating and honors cooldowns when results are consumed',t=>{
        const {s,engine,now,timers,drain}=fixture(t,mode);engine.running=true;
        let destination;engine.travel=row=>{destination=row;};
        const row=H.candidates(s,engine.settings,true).find(row=>row.id===3);
        engine.metrics[H.metricsKey(s,row,engine.settings,now)]={net:1e12,seconds:60,runs:3,xp:1e12,xpSeconds:60,xpRuns:3};
        const step=()=>mode==='money'?engine.money(s,now):engine.farm(s,now,'train');
        step();
        assert.equal(destination,undefined);
        assert.equal(engine.rankedYieldRoutes(s,kind,{},now,true),null);
        assert.equal(timers.size,1);
        engine.releaseRankingView();
        assert.equal(timers.size,1,'closing the panel preserves the active task');
        assert.ok(drain()>0);
        assert.equal(destination,undefined,'the worker never touches game controls');
        engine.cooldowns[row.key]=now+1;
        const result=engine.rankedYieldRoutes(s,kind,engine.cooldowns,now);
        assert.ok(!result.some(r=>r.key===row.key));
        assert.equal(engine.rankedYieldRoutes(s,kind,{},now+1)[0].key,row.key);
        step();assert.equal(destination.key,result[0].key);
        assert.deepEqual(result,rank({...s,trainer:{id:'sync-reference'}},engine.settings,engine.metrics,engine.cooldowns,now));
    });
}

test('idle and manually paused map views can finish, release, or supersede read-only searches',t=>{
    const {s,engine,now,timers,next,drain}=fixture(t,'idle');
    let notifications=0;engine.onChange=()=>{notifications++;};
    assert.equal(engine.rankedYieldRoutes(s,'money',{},now,true),null);
    const oldTimer=[...timers.values()][0];engine.releaseRankingView();
    oldTimer();assert.equal(timers.size,0);assert.equal(notifications,0);
    engine.manual={since:now};
    assert.equal(engine.rankedYieldRoutes(s,'xp',{},now,true),null);
    next();
    s.mons[2].level++;
    assert.equal(engine.rankedYieldRoutes(s,'xp',{},now,true),null);
    drain();const result=engine.rankedYieldRoutes(s,'xp',{},now,true);
    assert.ok(result.length);
    assert.ok(notifications>0);
    assert.equal(engine.driver.pendingMap,null);
    assert.deepEqual(result,H.xpRanking({...s,trainer:{id:'sync-paused'}},engine.settings,engine.metrics,{},now));
});

test('changes to a measured route replace a completed search before the first map is chosen',t=>{
    const {s,engine,now,drain}=fixture(t,'replace');engine.running=true;
    engine.money(s,now);drain();
    const row=H.candidates(s,engine.settings,true).find(row=>row.id===42);
    engine.metrics[H.metricsKey(s,row,engine.settings,now)]={net:1e12,seconds:60,runs:2};
    assert.equal(engine.rankedYieldRoutes(s,'money',{},now),null);
    drain();
    const updated=engine.rankedYieldRoutes(s,'money',{},now);
    assert.equal(updated[0].key,row.key);assert.equal(updated[0].rate,1e12);
});

test('large single-region league rankings yield and stopping discards their outstanding timer',t=>{
    const {s,engine,now,timers,drain}=fixture(t,'regional');
    engine.settings.region='current';engine.running=true;
    assert.equal(engine.rankedYieldRoutes(s,'xp',{},now),null);
    const late=[...timers.values()][0];
    engine.stop('stop',{persist:false});late();
    assert.equal(timers.size,0);assert.equal(engine.rankingJobs.size,0);
    assert.equal(engine.rankedYieldRoutes(s,'xp',{},now,true),null);
    drain();assert.ok(engine.rankedYieldRoutes(s,'xp',{},now,true).every(row=>row.reg==='sinnoh'));
});

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

test('changes to a measured route update a completed search before the first map is chosen',t=>{
    const {s,engine,now,drain,timers}=fixture(t,'replace');engine.running=true;
    engine.money(s,now);drain();
    const row=H.candidates(s,engine.settings,true).find(row=>row.id===42);
    engine.metrics[H.metricsKey(s,row,engine.settings,now)]={net:1e12,seconds:60,runs:2};
    const updated=engine.rankedYieldRoutes(s,'money',{},now);
    assert.equal(updated[0].key,row.key);assert.equal(updated[0].rate,1e12);
    assert.equal(timers.size,0,'measurements do not start another combat search');
});

test('money combat search survives measurements, bench XP and league room changes',t=>{
    const {s,engine,now,drain,next}=fixture(t,'live-money');engine.running=true;
    engine.settings.mode='money';
    let clock=0;
    t.mock.method(global.performance,'now',()=>clock+=5);
    const reserve={id:289,uid:'reserve',level:90};
    s.mons.push(reserve);
    const row=H.candidates(s,engine.settings,true).find(row=>row.id===42);
    const league=H.candidates(s,engine.settings,true).find(row=>row.reg==='unova'&&row.league);
    s.adv.chapter=league.members[0];
    const sample={net:1e7,seconds:60,runs:1};
    assert.equal(engine.rankedYieldRoutes(s,'money',{},now),null);
    const search=engine.rankingJobs.get('money');
    for(let i=0;i<5;i++){
        assert.ok(next());
        sample.net+=1e7;sample.runs++;
        engine.metrics[H.metricsKey(s,row,engine.settings,now)]=sample;
        reserve.level++;
        s.adv.chapter=league.members[i%league.members.length];
        engine.rankedYieldRoutes(s,'money',{},now);
        assert.equal(engine.rankingJobs.get('money'),search);
    }
    drain();
    const result=engine.rankedYieldRoutes(s,'money',{},now);
    assert.equal(result[0].key,row.key);
    assert.equal(result[0].rate,sample.net);
    assert.equal(result[0].samples,sample.runs);
    assert.ok(engine.rankingJobs.get('money/projections'),'live results are available while specialist suggestions are pending');
});

test('money scouts stream completed maps, survive the refresh interval, and retain completed hints during refresh',t=>{
    const {s,engine,now,drain,next}=fixture(t,'long-scout');
    engine.running=true;engine.settings.mode='money';
    s.mons.push({id:289,uid:'scout-reserve',level:100});
    let clock=0;
    t.mock.method(global.performance,'now',()=>clock+=5);
    engine.rankedYieldRoutes(s,'money',{},now);drain();
    assert.ok(engine.rankedYieldRoutes(s,'money',{},now).length);
    const original=engine.rankingJobs.get('money/projections');assert.ok(original);
    const later=now+125000;
    const read=at=>engine.rankedYieldRoutes(s,'money',{},at);
    assert.ok(read(later).length);
    assert.equal(engine.rankingJobs.get('money/projections'),original,'elapsed wall time cannot restart an unfinished scout');
    let partial;
    for(let i=0;i<10000&&next();i++){
        const hint=read(later)[0]?.planCoverage;
        if(hint){partial=hint;break;}
    }
    assert.equal(partial?.evaluated,1,'the first completed map is visible before every scout finishes');
    assert.equal(engine.rankingJobs.get('money/projections'),original);
    drain();
    const completed=read(later)[0].planCoverage;
    assert.ok(completed.evaluated>partial.evaluated);
    assert.equal(engine.rankingJobs.has('money/projections'),false);
    const refreshing=read(later+125000)[0].planCoverage;
    assert.ok(engine.rankingJobs.get('money/projections'),'refresh starts after completed evidence ages out');
    assert.deepEqual(refreshing,completed,'the usable rows remain visible while refreshing');
});

test('a queued roaming opponent invalidates only its route fit and does not add money',t=>{
    const {s,engine,now}=fixture(t,'roam-money');
    s.mons.forEach((mon,i)=>{mon.id=[10,13,129,132,349,90][i];mon.level=60;});
    s.adv.chapter=75;s.adv.node=0;
    s.adv.badges=['Maître Unys'];
    s.roam={at:{},caught:[]};
    engine.settings.autoTeam=false;
    const rates=()=>H.moneyRanking(s,engine.settings,{}, {},now);
    const before=rates();
    const lookup=(rows,id)=>rows.find(r=>r.id===id);
    s.adv.nodes=[{roamer:641}];
    const current=rates();
    const threatened=lookup(current,75);
    assert.equal(threatened.battleFit.roamingRisk?.id,641);
    assert.ok(threatened.rate<lookup(before,75).rate);
    assert.equal(threatened.estimatedReward,lookup(before,75).estimatedReward);
    assert.deepEqual(lookup(current,76).battleFit,lookup(before,76).battleFit);
    s.adv.node=1;
    assert.deepEqual(lookup(rates(),75).battleFit,lookup(before,75).battleFit);
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

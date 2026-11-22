const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function fixture(t,{hidden=false}={}){
    const state={trainer:{id:'long-session'},mons:[{id:1,uid:'a',level:20}],team:['a'],dex:{},adv:{layout:H.DATA.layout,chapter:0,unlocked:1,loops:[]}};
    const native='gachamon-save-v1',profile='pokecatch-helper:v1:long-session',lease='pokecatch-helper:v1:lease:long-session';
    const records=new Map([[native,JSON.stringify(state)],['pokecatch-tab','fixture']]);
    const writes=new Map(),reads=new Map();
    const storage={
        getItem(key){reads.set(key,(reads.get(key)||0)+1);return records.get(key)??null;},
        setItem(key,value){writes.set(key,(writes.get(key)||0)+1);records.set(key,String(value));},
        removeItem(key){records.delete(key);},
    };
    const previous=global.document;
    global.document={hidden,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{global.document=previous;});
    const e=new H.Engine(storage);
    e.loadAccount(state);e.read();e.running=true;e.tabToken='fixture';e.started=Date.UTC(2026,10,22);
    return {e,state,native,profile,lease,records,writes,reads,storage};
}

test('12 simulated hours in a hidden tab hold the lease without rereading the PC or rewriting idle progress every cycle',async t=>{
    const {e,state,native,profile,lease,writes,reads}=fixture(t,{hidden:true});
    const start=e.started;
    e.cooldowns.expired=start+1000;
    e.raidCooldown['2026-11-21|kanto']=start+1000;
    const count=reads.get(native);
    for(let elapsed=0;elapsed<12*3600000;elapsed+=6000)await e.step(start+elapsed);
    assert.equal(e.running,true);
    assert.equal(reads.get(native),count);
    assert.equal(writes.get(lease),7200);
    assert.ok(writes.get(profile)>0&&writes.get(profile)<=145,'checkpoint needs at most one write per five minutes while stable');
    assert.deepEqual(e.cooldowns,{});assert.deepEqual(e.raidCooldown,{});
    assert.equal(e.logs.length,0);
    e.stop();
});

test('lease renewal checks ownership on every pass and avoids writing during the first half of its lifetime',t=>{
    const {e,records,lease,writes}=fixture(t);
    const start=e.started;
    assert.equal(e.acquire(start),true);
    for(let elapsed=1200;elapsed<6000;elapsed+=1200)assert.equal(e.acquire(start+elapsed),true);
    assert.equal(writes.get(lease),1);
    assert.equal(e.acquire(start+6000),true);assert.equal(writes.get(lease),2);
    records.set(lease,JSON.stringify({token:'other',expires:start+18000}));
    assert.equal(e.acquire(start+7200),false);assert.equal(writes.get(lease),2);
});

test('temporary save gaps and malformed JSON hold actions, then recover without losing the queue or budget',async t=>{
    const {e,state,native,records}=fixture(t);
    const start=e.started;let actions=0;
    e.driver.receipt=()=>{actions++;return true;};
    e.settings.stopMinutes=0;e.queueRunning=true;
    e.queue=H.normalizeJobs([{settings:e.settings,status:'running'}]);e.budget.used=7;
    records.delete(native);await e.step(start+1000);
    assert.match(e.status,/等待游戏存档恢复/);assert.equal(e.running,true);assert.equal(actions,0);
    records.set(native,'{"partial"');await e.step(start+4000);
    assert.equal(e.running,true);assert.equal(actions,0);assert.equal(e.nextDelay(start+4000),3000);
    records.set(native,JSON.stringify({...state,money:100}));await e.step(start+7000);
    assert.equal(e.saveUnavailableAt,null);assert.equal(e.running,true);assert.equal(actions,1);
    assert.equal(e.queue[0].status,'running');assert.equal(e.budget.used,7);
    records.set(native,JSON.stringify({...state,fmt:999}));await e.step(start+8000);
    assert.equal(e.running,false);assert.match(e.status,/不支持的游戏存档格式/);
});

test('a periodic checkpoint quota failure is logged once, backed off and recovered without stopping',async t=>{
    const {e,storage,profile,writes,records}=fixture(t,{hidden:true});
    const original=storage.setItem;let failed=0,available=false;
    storage.setItem=(key,value)=>{
        if(key===profile&&!available){failed++;throw Error('quota');}
        original(key,value);
    };
    const start=e.started;
    for(let i=0;i<=10;i++)await e.step(start+i*6000);
    assert.equal(failed,2);assert.equal(e.running,true);assert.equal(e.checkpointError,'quota');
    assert.equal(e.logs.filter(entry=>entry.text.includes('quota')).length,1);
    available=true;
    for(let i=11;i<=15;i++)await e.step(start+i*6000);
    assert.equal(e.checkpointError,null);assert.equal(writes.get(profile),1);
    assert.equal(JSON.parse(records.get(profile)).resume.wanted,true);
    e.stop();
});

test('a tick wake-up cannot overlap an unfinished tick or apply its error to a restarted task',async t=>{
    const {e}=fixture(t);
    let calls=0,reject;
    e.step=()=>{calls++;return new Promise((_,fail)=>{reject=fail;});};
    const pending=[];
    t.mock.method(global,'setTimeout',fn=>{pending.push(fn);return pending.length;});
    t.mock.method(global,'clearTimeout',()=>{});
    e.schedule(1200);e.schedule(50);
    await pending.shift()();assert.equal(calls,0,'superseded callbacks are ignored');
    const firing=pending.shift()();assert.equal(calls,1);
    e.schedule(10);e.schedule(5);assert.equal(pending.length,0);
    e.stop();e.running=true;e.schedule(50);e.errors=0;
    reject(Error('obsolete callback'));await firing;
    assert.equal(e.running,true);assert.equal(e.errors,0);assert.equal(pending.length,1);
    assert.ok(!e.logs.some(entry=>entry.text.includes('obsolete callback')));
    e.stop();
});

test('yield previews cannot cancel a planner that serves a task with a different input signature',t=>{
    const {e}=fixture(t),now=e.started;
    const request=signature=>({kind:'money',signature,needsSlices:true,*search(){return [];}});
    assert.equal(e.evaluateRouteRanking(request('task'),{},now),null);
    const task=e.rankingJobs.get('money');
    assert.equal(e.evaluateRouteRanking(request('preview'),{},now,true),null);
    assert.equal(e.rankingJobs.get('money'),task);
    e.stop();
});

test('special-team history caps both entry count and retained roster fingerprint text',t=>{
    const {e}=fixture(t);
    for(let i=0;i<300;i++)e.driver.rememberTeam('small:'+i,true);
    assert.equal(e.driver.recent.size,80);
    for(let i=0;i<80;i++)e.driver.rememberTeam('large:'+i+':'+'.'.repeat(60000),true);
    assert.ok([...e.driver.recent.keys()].reduce((size,key)=>size+key.length,0)<=250000);
    assert.ok(e.driver.recent.has('large:79:'+ '.'.repeat(60000)));
});

test('a page restored before the current lease expires records a retry and resumes after release',t=>{
    const {e,records,lease}=fixture(t);
    const now=Date.now();
    e.acquire(now);e.suspend();
    e.schedule=()=>{};
    records.set(lease,JSON.stringify({token:'other',expires:now+10000}));
    assert.equal(e.resumeSuspended(false,now+1000),false);
    assert.equal(e.suspended.retryAt,now+6000);assert.match(e.status,/等待其他标签页/);
    records.delete(lease);
    assert.equal(e.resumeSuspended(false,now+6000),true);assert.equal(e.running,true);
    e.stop();
});

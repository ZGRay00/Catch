const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t,settings={}){
    const before={document:global.document,now:Date.now};let clock=new Date(2026,10,16,12).getTime();Date.now=()=>clock;
    global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{Date.now=before.now;if(before.document===undefined)delete global.document;else global.document=before.document;});
    const s={trainer:{id:'bfcache-resume'},mons:[{uid:'a',id:6,level:40}],team:['a'],road:['a'],dex:{},money:1000,stats:{},items:{},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','bfcache-tab']]),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const e=new H.Engine(storage,{mode:'money',autoPrepare:false,autoTeam:false,raids:false,moneyBuff:false,...settings});e.loadAccount(s);e.running=true;e.started=clock;e.tabToken='bfcache-tab';e.read();e.automation.begin(s);
    const scheduled=[];e.schedule=delay=>scheduled.push(delay);return{s,e,storage,scheduled,now:()=>clock,advance:ms=>{clock+=ms;},save:()=>storage.setItem('gachamon-save-v1',JSON.stringify(s))};
}

test('minute-throttled callbacks charge only the scheduled UI interval, preserving wall-clock limits',t=>{
    const {e,now,advance}=fixture(t),start=now();
    const p=e.preparation={phase:'travel',phaseAt:start,lastTick:start,lastGrowth:start};
    e.lastProgress=start;e.driver.navigation={started:start,nextAt:start};
    for(let n=0;n<4;n++){
        const due=now()+1200;advance(60000);e.accountTimerDelay(due,now());
    }
    assert.equal(now()-p.phaseAt,4800);assert.equal(now()-e.driver.navigation.started,4800);
    assert.equal(now()-e.lastProgress,4800);assert.equal(now()-e.started,240000);
    // A real visibility notification during a delayed tick must not double-credit it.
    const due=now()+1200;e.hiddenAt=due+100;advance(60000);e.accountTimerDelay(due,now());e.resumeUIClock(now());
    assert.equal(now()-p.phaseAt,6000);
});

test('a live heartbeat with suspended animation frames waits and resumes on the next real frame',t=>{
    const {e,now,advance}=fixture(t);
    const orig=global.requestAnimationFrame;let frame,calls=0;
    global.document.documentElement={getAttribute:()=>String(now())};
    global.requestAnimationFrame=fn=>{frame=fn;calls++;};
    t.after(()=>{if(orig===undefined)delete global.requestAnimationFrame;else global.requestAnimationFrame=orig;});
    assert.equal(e.backgroundFramesStalled(now()),false);advance(9000);
    assert.equal(e.backgroundFramesStalled(now()),true);assert.equal(calls,1);
    frame();assert.equal(e.backgroundFramesStalled(now()),false);
});

test('BFCache return continues the same manual session, queue, preparation and reserved item action',t=>{
    const {e,now,advance,scheduled}=fixture(t);e.manualInput(now());const manual=e.manual,started=e.started;
    const prep={phase:'train',targets:[{uid:'a',goal:50}],phaseAt:now(),lastGrowth:now(),lastTick:now()};e.preparation=prep;
    const pending={kind:'use',id:'exp-candy-m',at:now(),stock:1,out:0};e.automation.state.resourceTx=pending;e.budget.used=3;e.budget.spent=200;
    e.queue=H.normalizeJobs([{settings:e.settings,status:'running'}]);e.queueRunning=true;e.queueIndex=0;scheduled.length=0;e.suspend();assert.equal(e.running,false);assert.ok(e.suspended);advance(20000);
    assert.equal(e.resumeSuspended(),true);assert.equal(e.running,true);assert.equal(e.suspended,null);assert.equal(e.manual,manual);assert.equal(e.started,started);assert.equal(e.preparation,prep);
    assert.equal(e.automation.state.resourceTx,pending);assert.equal(e.budget.used,3);assert.equal(e.budget.spent,200);assert.equal(e.queueRunning,true);assert.equal(e.queueIndex,0);assert.deepEqual(scheduled,[50]);e.stop();
});

test('disabled reload resume preserves a suspended session until the explicit Continue button is used',t=>{
    const {e,storage,now,advance}=fixture(t,{resumeOnReload:false});e.manualInput(now());e.inputHeld=true;e.budget.used=4;const started=e.started;e.suspend();advance(20000);
    assert.equal(JSON.parse(storage.getItem('pokecatch-helper:v1:bfcache-resume')).resume,null);assert.equal(e.resumeSuspended(),false);assert.equal(e.running,false);assert.ok(e.suspended);assert.ok(e.manual);
    e.resumeManual();assert.equal(e.running,true);assert.equal(e.suspended,null);assert.equal(e.manual,null);assert.equal(e.inputHeld,false);assert.equal(e.started,started);assert.equal(e.budget.used,4);e.stop();
});

test('explicit Continue also resumes a suspended task with no manual handoff without resetting its counters',t=>{
    const {e,advance}=fixture(t,{resumeOnReload:false});e.budget.spent=150;e.startItems=7;const started=e.started;e.suspend();advance(20000);e.resumeManual();
    assert.equal(e.running,true);assert.equal(e.manual,null);assert.equal(e.started,started);assert.equal(e.startItems,7);assert.equal(e.budget.spent,150);e.stop();
});

test('Stop cancels the suspended session so a later pageshow cannot resurrect it',t=>{
    const {e,advance,scheduled}=fixture(t);e.suspend();e.stop('user cancelled');advance(20000);assert.equal(e.resumeSuspended(),false);assert.equal(e.running,false);assert.equal(e.suspended,null);assert.deepEqual(scheduled,[]);
});

test('a live foreign lease keeps the original session suspended and retries without creating a new task',t=>{
    const {e,storage,now,advance,scheduled}=fixture(t);const started=e.started;e.budget.used=2;e.suspend();
    storage.setItem('pokecatch-helper:v1:lease:bfcache-resume',JSON.stringify({token:'other',expires:now()+60000}));assert.equal(e.resumeSuspended(),false);assert.equal(e.running,false);assert.ok(e.suspended);assert.deepEqual(scheduled,[]);
    advance(60001);assert.equal(e.resumeSuspended(),true);assert.equal(e.started,started);assert.equal(e.budget.used,2);e.stop();
});

test('a different native tab token prevents BFCache recovery before the first helper action',t=>{
    const {e,storage,scheduled}=fixture(t);e.suspend();storage.setItem('pokecatch-tab','different-tab');assert.equal(e.resumeSuspended(),false);
    assert.equal(e.running,false);assert.equal(e.suspended,null);assert.match(e.status,/另一个标签页/);assert.deepEqual(scheduled,[]);
});

test('suspended time is excluded from pending UI deadlines without changing the total session start',t=>{
    const {e,now,advance}=fixture(t),start=now(),started=e.started;e.driver.pendingMap={started:start};e.automation.state.resourceTx={at:start};
    e.preparation={phase:'train',targets:[],phaseAt:start,lastGrowth:start,lastTick:start,candyTx:{at:start},roadWait:{at:start}};e.suspend();advance(120000);assert.equal(e.resumeSuspended(),true);
    e.resumeUIClock(now());assert.equal(e.driver.pendingMap.started,start+120000);assert.equal(e.preparation.phaseAt,start+120000);assert.equal(e.preparation.candyTx.at,start+120000);assert.equal(e.automation.state.resourceTx.at,start+120000);assert.equal(e.started,started);e.stop();
});

test('interrupted loop restoration is not restarted by BFCache pageshow',t=>{
    const {e,scheduled}=fixture(t);e.restoring=true;e.suspend();assert.equal(e.running,false);assert.equal(e.suspended,null);assert.equal(e.restoring,false);assert.equal(e.resumeSuspended(),false);assert.deepEqual(scheduled,[]);
});

test('starting a different explicit task discards the suspended-instance marker',t=>{
    const {e}=fixture(t);e.suspend();e.settings.mode='train';e.start();assert.equal(e.running,true,e.status);assert.equal(e.suspended,null);e.stop();
});

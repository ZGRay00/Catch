const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t,settings={}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,PointerEvent:global.PointerEvent,now:Date.now};let clock=Date.now(),sleeping=true,withOverlay=true,wakeWorks=true;
    Date.now=()=>clock;t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle','PointerEvent'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const actions=[],overlay={isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],
        dispatchEvent:event=>{actions.push(event.type);if(event.type==='pointerdown'&&wakeWorks){sleeping=false;overlay.hidden=true;}return true;},click:()=>actions.push('overlay-click')};
    global.document={hidden:false,documentElement:{classList:{contains:name=>name==='sleeping'&&sleeping}},querySelector:selector=>selector==='.sleep-fx'&&withOverlay?overlay:null,querySelectorAll:()=>[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});global.PointerEvent=class{constructor(type,options){this.type=type;Object.assign(this,options);}};
    const s={trainer:{id:'native-sleep'},money:1000,mons:[{uid:'a',id:6,level:50}],team:['a'],road:['a'],dex:{},items:{'lansat-berry':5},stats:{},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['pokecatch-tab','tab']]),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)},save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    const e=new H.Engine(storage,{mode:'money',autoPrepare:false,autoTeam:false,raids:false,moneyBuff:false,...settings});e.loadAccount(s);e.running=true;e.started=clock;e.tabToken='tab';e.nextRaid=Infinity;e.schedule=()=>{};e.read();
    Object.assign(e.driver,{animations:()=>{actions.push('animations');return false;},dismissInformation:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false,nav:()=>{actions.push('nav');return true;}});
    e.money=()=>actions.push('money');
    return{s,e,actions,overlay,save,now:()=>clock,advance:ms=>{clock+=ms;},noOverlay:()=>{withOverlay=false;},blockedWake:()=>{wakeWorks=false;},awake:()=>{sleeping=false;overlay.hidden=true;},asleep:()=>sleeping,tick:()=>e.step(clock)};
}

test('native sleep is woken through its pointer handler before any planner, animation or item action',async t=>{
    const {s,e,actions,tick,advance,asleep}=fixture(t);e.telemetry.sample={active:true};await tick();
    assert.equal(asleep(),false);assert.deepEqual(actions,['pointerdown','overlay-click']);assert.equal(e.telemetry.sample,null);assert.equal(e.budget.used,0);assert.equal(s.items['lansat-berry'],5);
    advance(1200);await tick();assert.deepEqual(actions,['pointerdown','overlay-click','animations','money']);assert.equal(e.running,true);e.stop();
});

test('sleep without a usable overlay freezes UI clocks and does not trip the progress watchdog',async t=>{
    const {e,actions,noOverlay,tick,now,advance,awake}=fixture(t);noOverlay();const start=now();
    e.preparation={phase:'train',phaseAt:start,lastGrowth:start,lastTick:start,candyAt:start,candyTx:{at:start},roadWait:{at:start}};
    const prep=e.preparation;e.coach.step=()=>actions.push('coach');e.driver.pendingMap={started:start};
    await tick();advance(420000);await tick();assert.equal(e.running,true);assert.deepEqual(actions,[]);assert.equal(e.hiddenAt,start);
    awake();advance(1200);await tick();assert.equal(prep.phaseAt,start+421200);assert.equal(prep.candyTx.at,start+421200);assert.equal(prep.roadWait.at,start+421200);assert.equal(e.driver.pendingMap.started,start+421200);
    assert.equal(e.hiddenAt,null);assert.deepEqual(actions,['animations','coach']);e.stop();
});

test('sleep wake does not take control while the user is still holding input or inside the handoff grace period',async t=>{
    const {e,actions,tick,now,advance}=fixture(t);e.manualInput(now());e.inputHeld=true;await tick();advance(16000);await tick();
    assert.deepEqual(actions,[]);assert.ok(e.manual);assert.match(e.status,/等待松开/);e.inputHeld=false;await tick();assert.equal(e.manual,null);assert.deepEqual(actions,['pointerdown','overlay-click']);e.stop();
});

test('a hidden tab stays idle and excludes overlapping background and sleep time exactly once',async t=>{
    const {e,actions,tick,now,advance}=fixture(t),start=now();e.preparation={phase:'train',phaseAt:start,lastGrowth:start,lastTick:start};e.coach.step=()=>actions.push('coach');
    global.document.hidden=true;await tick();advance(60000);assert.deepEqual(actions,[]);global.document.hidden=false;await tick();assert.deepEqual(actions,['pointerdown','overlay-click']);
    advance(1200);await tick();assert.equal(e.preparation.phaseAt,start+61200);assert.equal(e.hiddenAt,null);assert.deepEqual(actions,['pointerdown','overlay-click','animations','coach']);e.stop();
});

test('an explicitly paused game is not woken or consumed until its pause ends',async t=>{
    const {s,e,actions,tick,advance,save}=fixture(t);s.adv.paused=true;save();await tick();advance(120000);await tick();assert.deepEqual(actions,[]);assert.match(e.status,/游戏已暂停/);
    s.adv.paused=false;save();await tick();assert.deepEqual(actions,['pointerdown','overlay-click']);assert.equal(e.running,true);e.stop();
});

test('the task-wide stop limit remains effective while the game is asleep',async t=>{
    const {e,actions,tick,advance,noOverlay}=fixture(t,{stopMinutes:1});noOverlay();await tick();advance(60001);await tick();
    assert.equal(e.running,false);assert.match(e.status,/定时运行上限/);assert.deepEqual(actions,[]);
});

test('a failed native wake attempt never falls through into another UI action or item consumption',async t=>{
    const {e,actions,tick,advance,blockedWake,asleep}=fixture(t);blockedWake();await tick();advance(1200);await tick();
    assert.equal(asleep(),true);assert.deepEqual(actions,['pointerdown','overlay-click','pointerdown','overlay-click']);assert.equal(e.budget.used,0);assert.equal(e.running,true);e.stop();
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../../Pokecatch自动助手.user.js');

function memory(){
    const entries=new Map();
    return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
}
function game(id='first'){
    return {trainer:{id},team:['a'],mons:[{uid:'a',id:1,level:12}],dex:{},stats:{},adv:{layout:H.DATA.layout,chapter:1,unlocked:2}};
}
function install(t,key,value){
    const previous=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else delete globalThis[key];});
}
function session(s=game(),storage=memory()){
    storage.setItem('gachamon-save-v1',JSON.stringify(s));storage.setItem('pokecatch-tab','A');
    const e=new H.Engine(storage,{mode:'money'});e.loadAccount(s);e.read();e.tabToken='A';
    return {e,s,storage};
}

test('a game update can interrupt a daily wait and retains its checkpoint through a failed navigation',async t=>{
    const {e,s,storage}=session(),now=Date.now(),tab=memory();let clicks=0;
    install(t,'document',{hidden:false,querySelector:()=>null,querySelectorAll:()=>[]});
    install(t,'sessionStorage',tab);install(t,'window',{BUILD:'current-game'});
    e.running=true;e.started=now-30000;e.nextWake=now+360000;
    e.daily={base:{...e.settings,mode:'money'},menuMode:'money',checking:true};
    e.driver.gameUpdatePrompt=()=>({click(){
        const cp=JSON.parse(storage.getItem('pokecatch-helper:v1:first')).resume;
        assert.ok(cp.wanted);assert.equal(cp.daily.base.mode,'money');assert.equal(cp.session.started,e.started);
        assert.ok(tab.getItem('pokecatch-helper:v1:game-update'));clicks++;
    }});
    await e.step(now);assert.equal(clicks,1);assert.equal(e.settings.autoRecover,false);
    await e.step(now+20000);assert.equal(clicks,1);assert.ok(e.running);assert.match(e.status,/手动刷新/);
    e.suspend();
    const resumed=new H.Engine(storage);resumed.schedule=()=>{};resumed.loadAccount(s);resumed.tryResume();
    assert.ok(resumed.running,resumed.status);assert.ok(resumed.daily);assert.equal(resumed.started,e.started);
    resumed.driver.gameUpdatePrompt=e.driver.gameUpdatePrompt;
    await resumed.step(now+3600000);assert.equal(clicks,1);assert.match(resumed.status,/再次提示/);
});

test('native update stays pending while manual control, shiny encounter or durable storage prevents a safe reload',t=>{
    const {e,s}=session(),now=Date.now(),tab=memory();let clicks=0;
    install(t,'sessionStorage',tab);install(t,'window',{BUILD:'current-game'});
    e.running=true;e.started=now;e.driver.gameUpdatePrompt=()=>({click:()=>clicks++});
    e.settings.resumeOnReload=false;assert.ok(e.handleGameUpdate(s,now));assert.equal(clicks,0);
    e.settings.resumeOnReload=true;e.manual={until:now+3000};e.handleGameUpdate(s,now);assert.equal(clicks,0);
    e.manual=null;s.adv.battle={kind:'wild',enemies:[{id:25,shiny:true,hp:2}]};
    e.handleGameUpdate(s,now);assert.equal(clicks,0);delete s.adv.battle;
    const persist=e.persist;e.persist=()=>false;e.handleGameUpdate(s,now);assert.equal(clicks,0);
    e.persist=persist;tab.setItem=()=>{};e.handleGameUpdate(s,now);assert.equal(clicks,0);
    e.driver.gameUpdatePrompt=()=>null;assert.equal(e.handleGameUpdate(s,now),false);
});

test('a different app bundle behind the same launcher can update after the cooldown',t=>{
    const {e,s}=session(),now=Date.now(),tab=memory();let bundle='aaaaaaaaaa',clicks=0;
    install(t,'sessionStorage',tab);install(t,'window',{BUILD:'same-launcher'});
    install(t,'document',{querySelector:()=>({getAttribute:()=>'bundle/app.'+bundle+'.js'})});
    e.running=true;e.started=now-2000;e.driver.gameUpdatePrompt=()=>({click:()=>clicks++});
    e.handleGameUpdate(s,now);assert.equal(clicks,1);
    bundle='bbbbbbbbbb';
    e.handleGameUpdate(s,now+1000);assert.equal(clicks,1);
    e.handleGameUpdate(s,now+600001);assert.equal(clicks,2);
});
test('critical journal preserves bounded context and counts per account across reload',()=>{
    const {e,s,storage}=session();
    e.log('换图','info','路线',1000);e.log('暂缓','warn','连接',2000);e.log('暂缓','warn','连接',3000);
    assert.deepEqual(e.logs.map(row=>row.count),[2,1]);
    e.action='切换地图';e.captureStop('读取失败 Bearer private-token','error',4000);
    assert.doesNotMatch(storage.getItem('pokecatch-helper:v1:journal:first'),/private-token/);
    const next=new H.Engine(storage);next.loadAccount(s);
    assert.equal(next.lastStop.action,'切换地图');assert.equal(next.lastStop.logs[0].count,2);
    assert.equal(next.logs.length,0);assert.equal(next.logHistory()[0].level,'error');
    next.loadAccount(game('second'));assert.equal(next.logs.length,0);assert.equal(next.lastStop,null);
    next.log('第二个账号的故障','error','运行');next.loadAccount(s);
    assert.ok(next.logHistory().every(row=>!row.text.includes('第二个账号')));
    storage.setItem('pokecatch-tab','new-owner');
    const prior=storage.getItem('pokecatch-helper:v1:journal:first');e.log('旧页故障','error','运行');
    assert.equal(storage.getItem('pokecatch-helper:v1:journal:first'),prior);
});

test('only visible HTTP outcomes of relevant native service requests contribute, without recording URLs or secrets',()=>{
    const {e}=session(),entry={initiatorType:'fetch',name:'https://game.supabase.co/rest/v1/rpc/raid_days?apikey=private',responseStatus:503};
    for(const patch of [{responseStatus:0},{initiatorType:'img'},{name:'https://game.supabase.co.invalid/rest/v1/rpc/raid_days'},
        {name:'https://game.supabase.co/auth/v1/token'},{name:'https://raw.githubusercontent.com/test'}])e.observeGameResponse({...entry,...patch},1000);
    assert.equal(e.healthReport().networkAt,null);
    e.observeGameResponse(entry,1100);e.observeGameResponse(entry,2000);
    assert.equal(e.healthReport().networkFailures,2);
    assert.doesNotMatch(JSON.stringify(e.health),/supabase|private|apikey/);
    e.observeGameResponse({...entry,responseStatus:200},2500);
    assert.equal(e.healthReport().networkFailures,0);assert.equal(e.healthReport().networkStatus,200);
});

test('recovery uses verified checkpoint, recent server errors, foreground ownership and a shared session quota',t=>{
    const {e,s,storage}=session(),tab=memory(),now=Date.now(),seen=[];
    const doc={hidden:false,hasFocus:()=>true,querySelector:sel=>['#screen-adventure','#tabs [data-screen="adventure"]'].includes(sel)?{}:null,
        documentElement:{classList:{contains:()=>false},getAttribute:()=>null}};
    install(t,'document',doc);install(t,'window',{BUILD:H.DATA.build});install(t,'navigator',{onLine:true});
    install(t,'sessionStorage',tab);install(t,'location',{reload:()=>{
        assert.equal(JSON.parse(storage.getItem('pokecatch-helper:v1:first')).resume.wanted,true);
        assert.ok(tab.getItem('pokecatch-helper:v1:recovery-window'));seen.push('reload');
    }});
    e.running=true;e.started=now-300000;
    function evidence(at){Object.assign(e.health,{frameAt:at-1000,progressAt:at-180001,networkFailures:2,networkAt:at-2000,networkStatus:503});}
    evidence(now);assert.equal(e.tryRecoverStall(s,now),false);
    e.settings.autoRecover=true;e.settings.resumeOnReload=true;
    for(const [holder,key,value] of [[doc,'hidden',true],[doc,'hasFocus',()=>false],[e,'manual',{}],[s.adv,'paused',true],[e.health,'frameAt',now-9000],
        [e.health,'networkFailures',1],[global.navigator,'onLine',false],[global.window,'BUILD','unknown'],[e.automation.state,'resourceTx',{}]]){
        const previous=holder[key];holder[key]=value;assert.equal(e.tryRecoverStall(s,now),false,key);holder[key]=previous;
    }
    storage.setItem('pokecatch-tab','other');assert.equal(e.tryRecoverStall(s,now),false);storage.setItem('pokecatch-tab','A');
    const originalPersist=e.persist;e.persist=()=>true;assert.equal(e.tryRecoverStall(s,now),false);e.persist=originalPersist;
    assert.equal(e.tryRecoverStall(s,now),true);assert.equal(e.tryRecoverStall(s,now+1000),false);
    evidence(now+600001);assert.equal(e.tryRecoverStall(s,now+600001),true);
    evidence(now+1200002);assert.equal(e.tryRecoverStall(s,now+1200002),false);assert.equal(seen.length,2);
    assert.equal(JSON.parse(tab.getItem('pokecatch-helper:v1:recovery-window')).length,2);
});

test('confirmed wild shiny holds the active task through a bounded settlement interval; previews and ordinary battles do not',()=>{
    const {e,s}=session();e.running=true;e.driver.nav=()=>true;
    s.adv.battle={kind:'wild',enemies:[{id:25,shiny:true,hp:7}]};
    assert.equal(e.holdWildShiny(s,1000),true);
    delete s.adv.battle;
    assert.equal(e.holdWildShiny(s,1500),true);assert.equal(e.holdWildShiny(s,7499),true);
    assert.equal(e.holdWildShiny(s,7500),false);
    s.adv.battle={kind:'wild',enemies:[{id:25,hp:7}]};assert.equal(e.holdWildShiny(s,8000),false);
    s.adv.battle.enemies[0].shiny=true;
    for(let at=10000;at<=130000;at+=2000)e.holdWildShiny(s,at);
    assert.equal(e.running,false);assert.match(e.lastStop.reason,/异色/);assert.equal(s.adv.battle.enemies[0].hp,7);
});

test('offline hold checkpoints once due, waits for the browser, and rechecks a failed native reconnect with backoff',t=>{
    const {e,s}=session(),now=Date.now();install(t,'navigator',{onLine:false});
    e.running=true;e.started=now-300000;
    assert.equal(e.offlineWait(now),true);assert.equal(e.health.offlineAt,now);
    assert.equal(e.offlineWait(now+6000),true);assert.equal(e.logs.length,1);
    navigator.onLine=true;assert.equal(e.offlineWait(now+10000),false);
    assert.equal(e.health.onlineAt,now+10000);assert.equal(e.reconnectWait(s,now+11000),true);
    e.healthReport=()=>({socketState:'closed-abnormal',socketAt:now+12000,offlineAt:now,onlineAt:now+10000,progressAt:now-3000});
    assert.equal(e.reconnectWait(s,now+15000),true);assert.equal(e.connectionCheckAt,now+25000);
    assert.equal(e.reconnectWait(s,now+25000),true);assert.equal(e.connectionCheckAt,now+45000);
    assert.equal(e.reconnectWait(s,now+75000),false);
});

test('socket recovery requires valid evidence and visible supporting controls, and ignores a normal close',t=>{
    const {e,s}=session(),now=Date.now(),attrs=new Map([['data-pc-helper-background-at',String(now)]]);let active='map',mapReady=false,reloads=0;
    install(t,'window',{BUILD:H.DATA.build});install(t,'navigator',{onLine:true});install(t,'sessionStorage',memory());install(t,'location',{reload:()=>{reloads++;}});
    install(t,'document',{hasFocus:()=>true,hidden:false,documentElement:{getAttribute:key=>attrs.get(key),classList:{contains:()=>false}},
        querySelector:sel=>sel==='.screen.active'?{id:'screen-'+active}:sel.startsWith('#map-root')?(mapReady?{}:null):
            ['#screen-adventure','#tabs [data-screen="adventure"]'].includes(sel)?{}:null});
    e.running=true;e.settings.autoRecover=true;e.settings.resumeOnReload=true;
    Object.assign(e.health,{frameAt:now-500,progressAt:now-45000,offlineAt:now-45000,onlineAt:now-36000});
    const signal=state=>attrs.set('data-pc-helper-realtime',JSON.stringify({state,failures:1,at:now-32000}));
    signal('closed-abnormal');
    assert.deepEqual(e.healthReport(now).compatibility.pages,{map:'控件缺失',raid:'未进入',underground:'未进入'});
    assert.equal(e.tryRecoverStall(s,now),false);mapReady=true;
    for(const state of ['open','closed-client','closed-clean','connecting']){signal(state);assert.equal(e.tryRecoverStall(s,now),false,state);}
    signal('closed-abnormal');attrs.set('data-pc-helper-native-visibility','hidden');assert.equal(e.tryRecoverStall(s,now),false);
    attrs.set('data-pc-helper-native-visibility','visible');assert.equal(e.tryRecoverStall(s,now),true);assert.equal(reloads,1);
});

test('optional socket telemetry follows only game realtime sockets and restores native methods on disable',()=>{
    const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
    const at=Date.now(),attrs=new Map(),windowEvents=new EventTarget();
    class BrowserDocument extends EventTarget {get hidden(){return false;}get visibilityState(){return 'visible';}}
    const document=new BrowserDocument();
    document.documentElement={getAttribute:key=>attrs.get(key)??null,setAttribute:(key,value)=>attrs.set(key,String(value)),removeAttribute:key=>attrs.delete(key)};
    class NativeSocket extends EventTarget{
        constructor(url){super();this.url=url;this.readyState=0;}
        close(){this.readyState=2;}
    }
    const window={WebSocket:NativeSocket,addEventListener:windowEvents.addEventListener.bind(windowEvents)};
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../extension/visibility-main.js'),'utf8'),
        {Document:BrowserDocument,document,window,location:{origin:'https://pokecatch-online.app'},Date,Event});
    const heartbeat='data-pc-helper-background-at',signal='data-pc-helper-realtime';
    const state=()=>JSON.parse(attrs.get(signal)||'null');
    assert.equal(window.WebSocket,NativeSocket);
    attrs.set(heartbeat,String(at));document.dispatchEvent(new Event('pokecatch-support-change'));
    assert.notEqual(window.WebSocket,NativeSocket);
    const unrelated=new window.WebSocket('wss://unrelated.test/realtime/v1/websocket');unrelated.dispatchEvent(new Event('open'));
    assert.equal(state(),null);assert.equal(Object.hasOwn(unrelated,'close'),false);
    const url='wss://game.supabase.co/realtime/v1/websocket?apikey=SECRET';
    const first=new window.WebSocket(url);assert.equal(state().state,'connecting');
    first.readyState=1;first.dispatchEvent(new Event('open'));assert.equal(state().state,'open');
    const spare=new window.WebSocket(url);spare.dispatchEvent(new Event('close'));
    assert.equal(state().state,'open');assert.equal(state().failures,0,'a failed redundant socket cannot suggest a service outage');
    first.close(1000,'secret reason');first.dispatchEvent(new Event('close'));assert.equal(state().state,'closed-client');
    const second=new window.WebSocket(url);const clean=new Event('close');Object.assign(clean,{wasClean:true,code:1000});
    second.dispatchEvent(clean);assert.equal(state().state,'closed-clean');
    const failed=new window.WebSocket(url);failed.dispatchEvent(new Event('close'));
    assert.equal(state().state,'closed-abnormal');assert.equal(state().failures,1);
    const running=new window.WebSocket(url);assert.ok(running instanceof NativeSocket);
    assert.doesNotMatch(attrs.get(signal),/SECRET|supabase|reason/);
    attrs.delete(heartbeat);document.dispatchEvent(new Event('pokecatch-support-change'));
    assert.equal(window.WebSocket,NativeSocket);assert.equal(state(),null);assert.equal(Object.hasOwn(running,'close'),false);
    running.dispatchEvent(new Event('close'));assert.equal(state(),null);
});

test('item tasks start on an already-cached save and rebase on the same item in the next queue slot or a restored page',t=>{
    install(t,'document',{hidden:false,querySelector:()=>null,querySelectorAll:()=>[]});
    const id='deep-sea-tooth',s=game(),nodes=Array.from({length:5},()=>({type:'item',loot:{[id]:0.05}}));
    Object.assign(s.adv,{chapter:33,unlocked:35,runs:1,node:0,nodes,badges:[]});s.stats={itemIn:{[id]:4},spent:{shop:0}};
    const {e,storage}=session(s),cfg={mode:'item',itemId:id,itemQuantity:5,autoPrepare:false};
    const advance=engine=>{s.adv.node++;s.stats.itemIn[id]++;storage.setItem('gachamon-save-v1',JSON.stringify(s));engine.read();};
    e.schedule=()=>{};e.queue=H.normalizeJobs([{settings:cfg},{settings:cfg}]);e.startQueue();
    assert.equal(e.running,true,e.status);assert.equal(e.itemRound.round.count,4);
    advance(e);assert.equal(e.itemRound.round.points[0].gained,1);
    e.completeTask('队列下一项');assert.equal(e.queueIndex,1);
    assert.equal(e.itemRound.round.count,5);assert.equal(e.itemRound.round.observed,0);
    advance(e);assert.equal(e.itemRound.round.observed,1);
    e.suspend();advance(e);
    const restored=new H.Engine(storage);restored.schedule=()=>{};restored.loadAccount(s);restored.read();restored.start(true);
    assert.equal(restored.running,true,restored.status);assert.equal(restored.itemRound.round.count,7);assert.equal(restored.itemRound.round.observed,0);
    advance(restored);assert.equal(restored.itemRound.round.observed,1);
    assert.equal(restored.itemRound.round.points.find(point=>point.index===3).gained,1);
});

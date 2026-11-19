const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Engine}=require('../Pokecatch自动助手.user.js');

function fixture(t,gifts=true){
    const originalDocument=global.document,originalStyle=global.getComputedStyle,nodes=new Map();
    global.document={hidden:false,querySelector:selector=>nodes.get(selector)||null,querySelectorAll:()=>[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{
        if(originalDocument===undefined)delete global.document;else global.document=originalDocument;
        if(originalStyle===undefined)delete global.getComputedStyle;else global.getComputedStyle=originalStyle;
    });
    const now=Date.now(),values=new Map([['pokecatch-tab','tab']]);
    const state={trainer:{id:'starter'},dex:{},mons:[],team:[],money:3000,travel:{to:['unova']},
        adv:{layout:6,chapter:66,unlocked:66,node:0,gifts:{},badges:[],loops:[],speed:4}};
    const save=()=>values.set('gachamon-save-v1',JSON.stringify(state));save();
    const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const engine=new Engine(storage,{mode:'progress',autoTravel:true,autoTeam:false,gifts,raids:false,autoPrepare:false});
    engine.schedule=()=>{};
    t.after(()=>{if(engine.running)engine.stop();});
    return {engine,state,now,nodes,save};
}

test('restart accepts a verified pending regional starter even before the game paints its empty-team picker',async t=>{
    const {engine,state,save}=fixture(t,false);
    state.adv.pending={type:'gift',gift:{key:'starter-unova',choices:[495,498,501]}};save();
    engine.start();assert.equal(engine.running,true);
    engine.driver.nav=()=>true;
    await engine.step();assert.match(engine.status,/等待游戏显示初始伙伴/);
    engine.stop();delete state.adv.pending;save();engine.start();
    assert.equal(engine.running,false);assert.match(engine.status,/队伍为空/);
});

test('an unverified trio outside a real regional start cannot bypass the empty-party guard',t=>{
    const {engine}=fixture(t);
    engine.driver.giftChoice=()=>({reg:'johto',authorized:false});
    engine.start();assert.equal(engine.running,false);assert.match(engine.status,/队伍为空/);
});

test('refresh on the saved starter node can wait for the native pending record before any choice renders',t=>{
    const {engine,state,save}=fixture(t);
    state.adv.nodes=[{type:'gift',gift:{key:'starter-unova',choices:[495,498,501]}}];save();
    engine.start();assert.equal(engine.running,true);engine.stop();
    state.adv.gifts['starter-unova']=495;save();
    engine.start();assert.equal(engine.running,false);assert.match(engine.status,/队伍为空/);
});

test('manual native gift selection keeps the queue alive beyond the popup timeout without sending any choice',async t=>{
    const {engine,now}=fixture(t,false);
    engine.driver.giftChoice=()=>({reg:'unova',authorized:true});
    engine.driver.gift=()=>assert.fail('manual setting must not click choices');
    engine.automation.dialog=()=>assert.fail('covered modal must not receive input');
    engine.start();assert.equal(engine.running,true);
    engine.modalWaitSince=now-241000;
    await engine.step(now+2000);await engine.step(now+250000);
    assert.equal(engine.running,true);assert.equal(engine.modalWaitSince,null);assert.match(engine.status,/选择赠送/);
});

test('ordinary handoff protects the visible starter and explicit resume honours the gifts setting',t=>{
    const {engine,now}=fixture(t,true);
    engine.driver.giftChoice=()=>({reg:'unova',authorized:true});
    engine.start();engine.manualInput(now);
    assert.equal(engine.manualStep(engine.read(),now+20000),true);assert.ok(engine.manual);
    engine.settings.gifts=false;engine.resumeManual(now+21000);assert.ok(engine.manual);
    engine.settings.gifts=true;engine.resumeManual(now+22000);assert.equal(engine.manual,null);
});

test('idle handoff can acknowledge a verified gift receipt while a new task drops stale receipt identity',t=>{
    const {engine,state,now,nodes,save}=fixture(t,false);
    state.mons=[{id:495,uid:'starter',level:5}];state.team=['starter'];save();
    engine.driver.giftReceipt={id:498,at:now};engine.start();
    assert.equal(engine.driver.giftReceipt,null);
    engine.manualInput(now);
    nodes.set('#modal-root.open',{isConnected:true,closest:()=>null,getClientRects:()=>[{}]});
    let acknowledged=0;
    engine.driver.receipt=resuming=>{assert.equal(resuming,true);acknowledged++;nodes.delete('#modal-root.open');return true;};
    assert.equal(engine.manualStep(engine.read(),now+20000),true);
    assert.equal(acknowledged,1);
    assert.equal(engine.manualStep(engine.read(),now+21000),false);assert.equal(engine.manual,null);
});

test('confirmed departure survives reload and waits for native settlement without resending',t=>{
    const {engine,state,now,save}=fixture(t);
    state.mons=[{id:393,uid:'old',level:20}];state.team=['old'];state.adv.chapter=65;state.travel.to=['sinnoh'];save();
    engine.start();const a=engine.automation;
    a.state.departure={reg:'unova',at:now-300000};
    const snapshot=JSON.parse(JSON.stringify(engine.progressSnapshot()));
    engine.beginTask(engine.read(),snapshot,now);
    engine.driver.nav=()=>assert.fail('the map must not be reopened for an accepted trip');
    assert.equal(a.travel(engine.read(),now+5000),true);assert.equal(a.state.departure.at,now);
    state.adv.chapter=66;state.travel.to.push('unova');state.mons=[];state.team=[];save();
    assert.equal(a.finishDeparture(engine.read(),now+10000),true);
    state.adv.gifts['starter-unova']=498;save();
    assert.equal(a.finishDeparture(engine.read(),now+11000),false);assert.equal(a.state.departure,undefined);
});

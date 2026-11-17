const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
function runtime(t){
    const before=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
    const now=Date.now(),state={trainer:{id:'handoff-proof'},money:5000,mons:[{uid:'a',id:6,level:100}],team:['a'],dex:{},stats:{},
        adv:{layout:6,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[]}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(state)],['pokecatch-tab','proof']]);let corrupt=false,gameWrites=0;
    const storage={getItem:key=>{if(corrupt&&key==='gachamon-save-v1')throw Error('fixture read failure');return data.get(key)??null;},
        setItem:(key,value)=>{if(key==='gachamon-save-v1')gameWrites++;data.set(key,String(value));},removeItem:key=>data.delete(key)};
    const e=new H.Engine(storage,{mode:'money',autoPrepare:false,autoTeam:false,raids:false});e.loadAccount(state);e.running=true;e.started=now;e.tabToken='proof';e.read();e.schedule=()=>{};
    const actions=[];Object.assign(e.driver,{animations:()=>false,dismissInformation:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false,activeTeam:()=>false,nav:screen=>{actions.push(screen);return true;}});
    const save=()=>data.set('gachamon-save-v1',JSON.stringify(state));
    return{e,state,now,save,actions,storage,readFailure:()=>{corrupt=true;},gameWrites:()=>gameWrites};
}

test('manual handoff snapshots a helper raid saved after the last engine tick',async t=>{
    const {e,state,now,save,actions,gameWrites}=runtime(t);
    e.driver.raid={reg:'kanto',boss:35,date:H.parisDay(),started:now};
    state.adv.event={raid:true,reg:'kanto',id:35,date:H.parisDay(),loops:23};save();
    assert.equal(e.state.adv.event,undefined,'cached state still predates the raid launch');
    e.manualInput(now);assert.ok(e.manual.raid,'fresh save identity is captured before yielding');
    await e.step(now+16000);assert.equal(e.manual,null);assert.equal(e.running,true);assert.match(e.status,/23\/150/);assert.deepEqual(actions,['adventure']);assert.equal(gameWrites(),0);e.stop();
});

test('the first input before a user launches a new raid still leaves that activity under manual control',async t=>{
    const {e,state,now,save,actions}=runtime(t);e.manualInput(now);assert.equal(e.manual.raid,null);
    state.adv.event={raid:true,reg:'kanto',id:35,date:H.parisDay(),loops:0};save();
    await e.step(now+16000);assert.ok(e.manual);assert.equal(e.driver.raid,null);assert.match(e.status,/手动活动/);assert.deepEqual(actions,[]);e.stop();
});

test('a changed raid remains a manual activity even if the helper remembers an older target',async t=>{
    const {e,state,now,save}=runtime(t);state.adv.event={raid:true,reg:'kanto',id:35,date:H.parisDay(),loops:1};save();
    e.driver.raid={reg:'kanto',boss:35,date:H.parisDay(),started:now};e.manualInput(now);
    state.adv.event.id=14;save();await e.step(now+16000);assert.ok(e.manual);assert.match(e.status,/手动活动/);e.stop();
});

test('a read error during trusted input stops safely without throwing from the event handler',t=>{
    const {e,readFailure,gameWrites}=runtime(t);readFailure();assert.doesNotThrow(()=>e.manualInput());
    assert.equal(e.running,false);assert.equal(e.manual,null);assert.match(e.status,/无法读取.*fixture read failure/);assert.equal(gameWrites(),0);
});

test('a malformed latest save is not replaced with the stale activity snapshot',t=>{
    const {e,storage}=runtime(t);storage.setItem('gachamon-save-v1','{');assert.doesNotThrow(()=>e.manualInput());
    assert.equal(e.running,false);assert.equal(e.manual,null);assert.match(e.status,/无法读取游戏存档/);
});

test('account changes observed during the first manual input stop before adopting another player activity',t=>{
    const {e,state,save,now}=runtime(t);state.trainer.id='other-account';save();e.manualInput(now);
    assert.equal(e.running,false);assert.equal(e.manual,null);assert.match(e.status,/账号或游戏版本/);
});

test('explicit resume clears held input records without restarting the task or its preparation',t=>{
    const {e,now}=runtime(t),started=e.started,preparation={targets:[{uid:'a',goal:100}],phase:'train'};e.preparation=preparation;e.budget.used=3;
    e.manualInput(now);e.inputHeld=true;let cleared=0;e.clearHeldInput=()=>{cleared++;};e.resumeManual(now+1000);
    assert.equal(e.manual,null);assert.equal(e.inputHeld,false);assert.equal(cleared,1);assert.equal(e.started,started);assert.equal(e.preparation,preparation);assert.equal(e.budget.used,3);e.stop();
});

test('explicit resume releases an abandoned PC input focus before checking handoff readiness',t=>{
    const {e,now}=runtime(t);let focused=true;global.document.activeElement={blur:()=>{focused=false;}};e.gameInputFocused=()=>focused;
    e.manualInput(now);e.resumeManual(now+1000);assert.equal(focused,false);assert.equal(e.manual,null);assert.equal(e.running,true);e.stop();
});

test('automatic idle recovery still waits while the user is holding input',t=>{
    const {e,now}=runtime(t);e.manualInput(now);e.inputHeld=true;assert.equal(e.manualStep(e.read(),now+16000),true);assert.match(e.status,/等待松开/);
    e.inputHeld=false;assert.equal(e.manualStep(e.read(),now+17000),false);assert.equal(e.manual,null);e.stop();
});

test('explicit resume does not approve an unresolved native choice dialog',t=>{
    const {e,now,actions}=runtime(t),previous=global.getComputedStyle;t.after(()=>{if(previous===undefined)delete global.getComputedStyle;else global.getComputedStyle=previous;});
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});const modal={isConnected:true,hidden:false,closest:()=>null,getClientRects:()=>[{}]};
    global.document.querySelector=selector=>selector==='#modal-root.open'?modal:null;e.manualInput(now);e.inputHeld=true;e.resumeManual(now+1000);
    assert.ok(e.manual);assert.equal(e.inputHeld,false);assert.match(e.status,/处理游戏选择弹窗/);assert.deepEqual(actions,[]);e.stop();
});

test('a save read failure during explicit resume produces a visible stop reason rather than an uncaught click handler error',t=>{
    const {e,now,readFailure,gameWrites}=runtime(t);e.manualInput(now);readFailure();assert.doesNotThrow(()=>e.resumeManual(now+1000));
    assert.equal(e.running,false);assert.match(e.status,/恢复任务时无法读取游戏存档/);assert.equal(gameWrites(),0);
});

test('explicit resume validates the latest account before adopting its raid',t=>{
    const {e,state,now,save,gameWrites}=runtime(t);e.manualInput(now);state.trainer.id='different-account';state.adv.event={raid:true,id:35,reg:'kanto'};save();e.resumeManual(now+1000);
    assert.equal(e.running,false);assert.equal(e.driver.raid,null);assert.match(e.status,/账号或游戏版本/);assert.equal(gameWrites(),0);
});

test('manual countdown changes to recovery at its deadline without displaying zero seconds',t=>{
    const {e,now}=runtime(t);e.manualInput(now);const deadline=e.manual.until;
    assert.equal(e.manualWaitState(e.state,deadline-1001).seconds,2);
    assert.equal(e.manualWaitState(e.state,deadline-1).mini,'1s');
    for(const at of [deadline,deadline+20000]){
        const wait=e.manualWaitState(e.state,at);assert.equal(wait.reason,'ready');assert.equal(wait.mini,'恢复中');assert.doesNotMatch(wait.status,/0\s*秒/);
    }
    assert.equal(e.manualStep(e.state,deadline),false);assert.equal(e.manual,null);e.stop();
});

test('expired manual recovery explains held input and IME composition instead of a zero countdown',t=>{
    const {e,now}=runtime(t);e.manualInput(now);e.inputHeld=true;
    assert.equal(e.manualWaitState(e.state,now+16000).mini,'等松开');
    e.inputComposing=true;assert.equal(e.manualWaitState(e.state,now+16000).reason,'composing');
    assert.equal(e.manualStep(e.state,now+16000),true);assert.match(e.status,/输入法选词/);
    e.inputHeld=false;e.inputComposing=false;assert.equal(e.manualStep(e.state,now+16000),false);e.stop();
});

test('idle search recovery only releases focus after the grace period and never while input is held',t=>{
    const {e,now}=runtime(t);e.manualInput(now);let focused=true,released=0;
    e.gameInputFocused=()=>focused;e.releaseIdleGameInput=()=>{released++;focused=false;return true;};
    assert.equal(e.manualStep(e.state,now+1000),true);assert.equal(released,0);
    e.inputHeld=true;assert.equal(e.manualStep(e.state,now+16000),true);assert.equal(released,0);
    e.inputHeld=false;e.inputComposing=true;assert.equal(e.manualStep(e.state,now+16000),true);assert.equal(released,0);
    e.inputComposing=false;assert.equal(e.manualStep(e.state,now+16000),false);assert.equal(released,1);assert.equal(e.manual,null);e.stop();
});

test('an editable field keeps control and reports input after its countdown has expired',t=>{
    const {e,now}=runtime(t);e.manualInput(now);e.gameInputFocused=()=>true;e.releaseIdleGameInput=()=>false;
    assert.equal(e.manualWaitState(e.state,now+16000).mini,'输入中');assert.equal(e.manualStep(e.state,now+16000),true);
    assert.ok(e.manual);assert.match(e.status,/输入框/);assert.doesNotMatch(e.status,/0\s*秒/);e.stop();
});

test('an unresolved choice reports its actual blocker and resumes when the dialog is gone',t=>{
    const {e,now}=runtime(t),before=global.getComputedStyle;let open=true;
    t.after(()=>{if(before===undefined)delete global.getComputedStyle;else global.getComputedStyle=before;});
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const modal={isConnected:true,hidden:false,closest:()=>null,getClientRects:()=>[{}]};global.document.querySelector=sel=>open&&sel==='#modal-root.open'?modal:null;
    e.manualInput(now);assert.equal(e.manualWaitState(e.state,now+16000).mini,'待选择');assert.equal(e.manualStep(e.state,now+16000),true);assert.ok(e.manual);
    open=false;assert.equal(e.manualStep(e.state,now+16000),false);assert.equal(e.manual,null);e.stop();
});

test('manual activity waits report the activity and end when the activity completes',t=>{
    const {e,state,now,save}=runtime(t);e.manualInput(now);state.adv.zone={id:145,foe:145};save();
    assert.equal(e.manualWaitState(e.read(),now+16000).mini,'手动活动');assert.equal(e.manualStep(e.state,now+16000),true);
    state.adv.zone=null;save();assert.equal(e.manualStep(e.read(),now+17000),false);assert.equal(e.manual,null);e.stop();
});

test('manual scheduler aims at the final countdown boundary and polls real blockers without spinning',t=>{
    const {e,now}=runtime(t);e.manualInput(now);const deadline=e.manual.until;
    assert.equal(e.nextDelay(deadline-2000),1200);assert.equal(e.nextDelay(deadline-300),300);assert.equal(e.nextDelay(deadline-1),50);
    assert.equal(e.nextDelay(deadline),1200);e.inputHeld=true;assert.equal(e.nextDelay(deadline+1000),1200);e.stop();
});

test('suspended manual sessions report pending recovery rather than an expired timer',t=>{
    const {e,now}=runtime(t);e.manualInput(now);e.suspend();const wait=e.manualWaitState(e.state,now+60000);
    assert.equal(wait.reason,'suspended');assert.equal(wait.mini,'待恢复');assert.doesNotMatch(wait.status,/0\s*秒/);e.stop();
});

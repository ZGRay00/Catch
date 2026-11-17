const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t){
    const before={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};let clock=Date.now(),screen='team',opened=false,currentModal=null,blockInput=false;
    Date.now=()=>clock;t.after(()=>{Date.now=before.now;for(const key of ['document','getComputedStyle'])if(before[key]===undefined)delete global[key];else global[key]=before[key];});
    const node=(extra={})=>({isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],...extra});
    const close=node(),buddy=node({getAttribute:name=>name==='aria-pressed'?'false':null}),search={value:'before'};
    const card=node({querySelector:selector=>selector==='.dc-x'?close:selector.includes('.dc-buddy')?buddy:null});
    const modal=node({querySelector:selector=>selector==='.mon-card'?card:null}),root=node({querySelector:()=>currentModal});
    global.document={hidden:false,querySelector:selector=>selector==='#modal-root.open'&&opened?root:selector==='#pc-search'||selector==='#screen-team.active #pc-search'&&screen==='team'?search:null,querySelectorAll:()=>[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const s={trainer:{id:'buddy-return'},money:1000,mons:[{uid:'a',id:6,level:30}],team:['a'],road:['a'],buddy:{uid:null,ko:0},dex:{},stats:{},items:{},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,runs:0,node:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['pokecatch-tab','tab']]),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)},save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    const e=new H.Engine(storage,{mode:'train',trainUid:'a',trainLevel:40,trainBuddy:true,trainBuff:false,autoTeam:false,autoPrepare:false,raids:false});e.loadAccount(s);e.running=true;e.started=clock;e.tabToken='tab';e.nextRaid=Infinity;e.schedule=()=>{};e.read();
    const actions=[];Object.assign(e.driver,{animations:()=>false,dismissInformation:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false,
        nav:name=>{if(screen===name)return true;actions.push('nav:'+name);screen=name;return false;},
        click:el=>{if(!el)return false;actions.push(el===buddy?'buddy':'close');if(el===close)opened=false;if(el===buddy){s.buddy.uid='a';save();}return true;},
        input:(el,value)=>{if(blockInput)return false;el.value=value;actions.push('search');return true;}});
    const a=e.automation;
    const open=()=>{opened=true;currentModal=modal;};
    const own=()=>{a.own('buddy','.mon-modal',{uid:'a'});a.buddyTask={uid:'a',started:clock};open();};
    return{s,e,a,actions,card,modal,search,save,open,own,now:()=>clock,advance:ms=>{clock+=ms;},screen:()=>screen,
        remove:()=>{opened=false;},replace:()=>{currentModal=node();},blockInput:value=>{blockInput=value;}};
}

test('native refresh removing the selected buddy card still returns to adventure during the next battle',t=>{
    const {s,a,own,modal,remove,screen,actions}=fixture(t);own();a.owner.seen=true;a.owner.node=modal;a.buddyTask.clickedAt=Date.now();s.buddy.uid='a';s.adv.battle={steps:1};remove();
    assert.equal(a.dialog(s),true);assert.equal(a.owner,null);assert.equal(a.buddyTask.stage,'return');
    a.dialog(s);a.dialog(s);assert.equal(screen(),'adventure');assert.equal(a.buddyTask,null);assert.deepEqual(actions,['nav:adventure']);
});

test('finishing the buddy UI does not depend on the toggle or an unfinished training goal',t=>{
    const {s,e,a,own,card,screen}=fixture(t);own();s.buddy.uid='a';s.mons[0].level=40;a.buddyCard(s,card);e.settings.trainBuddy=false;s.adv.battle={steps:1};
    a.dialog(s);a.dialog(s);assert.equal(screen(),'adventure');assert.equal(a.buddyTask,null);assert.equal(s.buddy.uid,'a');
});

test('closing a restored buddy card returns to adventure without toggling an already selected buddy',t=>{
    const {s,a,open,screen,actions}=fixture(t);s.buddy.uid='a';s.adv.battle={steps:1};a.restoreOwner({kind:'buddy',selector:'.mon-modal',uid:'a'});open();
    assert.equal(a.dialog(s),true);assert.equal(a.buddyTask.stage,'return');a.dialog(s);a.dialog(s);
    assert.equal(screen(),'adventure');assert.equal(a.buddyTask,null);assert.deepEqual(actions,['close','nav:adventure']);
});

test('a removed card with delayed native save preserves confirmation and never repeats the buddy toggle',t=>{
    const {s,a,own,modal,remove,advance,screen,actions}=fixture(t);own();a.owner.seen=true;a.owner.node=modal;a.buddyTask.clickedAt=Date.now();remove();
    a.dialog(s);assert.equal(a.buddyTask.stage,'confirmSave');advance(1200);a.dialog(s);assert.equal(screen(),'adventure');assert.equal(a.buddyTask.stage,'confirmSave');
    s.buddy.uid='a';a.dialog(s);a.dialog(s);assert.equal(a.buddyTask,null);assert.equal(actions.filter(x=>x==='buddy').length,0);
});

test('a replacement modal does not inherit buddy authority or allow navigation behind an unknown choice',t=>{
    const {s,a,own,modal,replace,remove,actions,screen}=fixture(t);own();a.owner.seen=true;a.owner.node=modal;s.buddy.uid='a';replace();
    assert.equal(a.dialog(s),true);assert.equal(a.owner,null);assert.equal(a.dialog(s),false);assert.deepEqual(actions,[]);assert.equal(screen(),'team');
    remove();a.dialog(s);a.dialog(s);assert.equal(screen(),'adventure');
});

test('pending buddy navigation yields to a native special-team picker',t=>{
    const {s,a,actions,screen}=fixture(t),query=global.document.querySelector;
    const picker={isConnected:true,hidden:false,closest:()=>null,getClientRects:()=>[{}]};global.document.querySelector=selector=>selector==='#evt-pick'?picker:query(selector);
    a.buddyTask={uid:'a',stage:'return',started:Date.now()};assert.equal(a.dialog(s),false);assert.equal(screen(),'team');assert.deepEqual(actions,[]);
    picker.hidden=true;a.dialog(s);a.dialog(s);assert.equal(screen(),'adventure');assert.equal(a.buddyTask,null);
});

test('the return phase restores PC search before navigation and retries a temporarily blocked input',t=>{
    const {s,a,search,blockInput,screen,actions}=fixture(t);a.buddyTask={uid:'a',stage:'return',started:Date.now(),searchBefore:'original'};search.value='6';blockInput(true);
    assert.equal(a.dialog(s),true);assert.equal(search.value,'6');assert.equal(screen(),'team');blockInput(false);a.dialog(s);a.dialog(s);a.dialog(s);
    assert.equal(search.value,'original');assert.equal(screen(),'adventure');assert.equal(a.buddyTask,null);assert.deepEqual(actions,['search','nav:adventure']);
});

test('a slow detail-card flow gives its return phase a fresh navigation deadline',t=>{
    const {s,a,own,card,advance,screen}=fixture(t);own();advance(29000);s.buddy.uid='a';a.buddyCard(s,card);advance(20000);a.dialog(s);a.dialog(s);
    assert.equal(screen(),'adventure');assert.equal(a.buddyTask,null);
});

test('refresh resumes a buddy return without needing a still-open member-card owner',t=>{
    const {s,e,a,screen,search}=fixture(t);s.buddy.uid='a';a.buddyTask={uid:'a',stage:'return',started:Date.now(),searchBefore:'original'};search.value='6';e.suspend();
    const saved=JSON.parse(e.storage.getItem('pokecatch-helper:v1:buddy-return'));assert.equal(saved.resume.flow.buddyTask.stage,'return');assert.equal(saved.resume.flowOwner,null);
    const resumed=new H.Engine(e.storage);resumed.loadAccount(s);resumed.schedule=()=>{};resumed.start(true);assert.equal(resumed.running,true,resumed.status);
    resumed.driver.nav=e.driver.nav;resumed.driver.input=e.driver.input;resumed.automation.dialog(s);resumed.automation.dialog(s);resumed.automation.dialog(s);
    assert.equal(search.value,'original');assert.equal(screen(),'adventure');assert.equal(resumed.automation.buddyTask,null);resumed.stop();
});

test('search restoration timing out does not discard the pending return to adventure',t=>{
    const {s,a,search,blockInput,advance,screen}=fixture(t);a.buddyTask={uid:'a',stage:'return',started:Date.now(),searchBefore:'original'};search.value='6';blockInput(true);a.dialog(s);advance(45001);
    a.dialog(s);a.dialog(s);assert.equal(search.value,'6');assert.equal(screen(),'adventure');assert.equal(a.buddyTask,null);
});

test('an unavailable adventure page gets a bounded retry and cannot permanently block the workflow',t=>{
    const {s,e,a,advance}=fixture(t);a.buddyTask={uid:'a',stage:'return',started:Date.now()};let attempts=0;e.driver.nav=()=>{attempts++;return false;};
    for(let i=0;i<30;i++){a.dialog(s);advance(1200);}assert.equal(attempts,30);assert.equal(a.buddyTask,null);assert.ok(a.buddyRetryAt>Date.now());assert.equal(e.running,true);assert.match(e.logs[0].text,/冒险页暂不可进入/);
});

test('the engine finishes buddy navigation before completing a training task whose last target just leveled',async t=>{
    const {s,e,a,own,modal,remove,save,screen}=fixture(t);own();a.owner.seen=true;a.owner.node=modal;a.buddyTask.clickedAt=Date.now();s.buddy.uid='a';s.mons[0].level=40;save();remove();
    await e.step();assert.equal(e.running,true);assert.equal(a.buddyTask.stage,'return');await e.step();await e.step();assert.equal(screen(),'adventure');assert.equal(e.running,true);
    await e.step();assert.equal(e.running,false);assert.match(e.status,/已达到 Lv.40/);
});

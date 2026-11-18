const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const settings=(extra={})=>({...H.DEFAULTS,mode:'train',trainUid:'team',trainLevel:70,trainBuddy:true,...extra});
function state(){return{mons:[{uid:'a',id:6,level:20},{uid:'b',id:9,level:30},{uid:'carry',id:150,level:80}],team:['a','b','carry'],road:['a','b','carry'],buddy:{uid:'carry',ko:17},travel:{to:[]},adv:{chapter:0,unlocked:8,loops:[],badges:[]}};}

test('single-target training always chooses the selected unfinished active member',()=>{
    const s=state();s.buddy.uid='a';assert.equal(H.selectTrainingBuddy(s,settings({trainUid:'b'})), 'b');
    assert.equal(H.selectTrainingBuddy(s,settings({trainUid:'b',trainBuddy:false})), 'b','pure target selection is independent of the UI switch');
});
test('a valid unfinished buddy is retained rather than resetting its KO progress for a lower level member',()=>{
    const s=state();s.buddy={uid:'b',ko:4};assert.equal(H.selectTrainingBuddy(s,settings()),'b');assert.equal(s.buddy.ko,4);
});
test('capped and finished members are skipped, and stable party order breaks level ties',()=>{
    const s=state();s.mons[0].level=75;s.mons[1].level=75;assert.equal(H.selectTrainingBuddy(s,settings({trainLevel:100})),null);
    s.mons[0].level=20;s.mons[1].level=20;s.team=['b','a','carry'];s.road=[...s.team];assert.equal(H.selectTrainingBuddy(s,settings()),'b');
});
test('preparation buddies come only from unfinished trainee targets, excluding stronger carriers',()=>{
    const s=state(),prep={targets:[{uid:'b',goal:40}]};assert.equal(H.selectTrainingBuddy(s,settings({mode:'progress'}),prep),'b');
    s.mons[1].level=40;assert.equal(H.selectTrainingBuddy(s,settings({mode:'progress'}),prep),null);
});
test('the Sinnoh Bertha detour replaces a capped Staraptor with a training target below the regional cap',()=>{
    const s=state();s.adv.chapter=59;s.adv.unlocked=61;s.travel.to=['johto','hoenn','sinnoh'];s.link={to:'sinnoh',side:'to'};
    s.mons=[[423,88],[398,88],[473,85],[112,84],[65,84],[405,84]].map(([id,level])=>({uid:'m'+id,id,level,reg:'sinnoh'}));
    s.team=s.mons.map(m=>m.uid);s.road=[...s.team];s.buddy={uid:'m398',ko:15};
    const p={targets:s.mons.slice(1).map(mon=>({uid:mon.uid,goal:88}))};
    assert.equal(H.trainingCap(s,s.mons[1]),88);assert.equal(H.selectTrainingBuddy(s,settings({mode:'progress'}),p),'m112');
    s.buddy.uid='m112';s.mons[3].level=88;
    assert.equal(H.selectTrainingBuddy(s,settings({mode:'progress'}),p),'m65');
});
test('protected team training does not quietly expand to new supports or PC-only members',()=>{
    const s=state();assert.equal(H.selectTrainingBuddy(s,settings(),null,['b']),'b');
    s.road=['carry'];assert.equal(H.selectTrainingBuddy(s,settings(),null,['a','b']),null);
    s.mons.push({uid:'pc',id:1,level:1});assert.equal(H.selectTrainingBuddy(s,settings({trainUid:'pc'})),null);
});
test('temporary run members and members on another linked side are not selected',()=>{
    const s=state();s.adv.chapter=14;s.adv.unlocked=18;s.link={to:'johto',side:'to'};s.mons[0].reg='kanto';s.mons[1].reg='johto';s.mons[1].level=10;
    s.mons.push({uid:'t:temp',id:1,level:1,reg:'johto'});s.team.push('t:temp');s.road=[...s.team];assert.equal(H.selectTrainingBuddy(s,settings()),'b');
});

function fixture(t,{pressed=false,saveOnClick=true}={}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle};t.after(()=>{for(const key of Object.keys(previous))if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const s=state(),cfg=settings({trainUid:'a'}),actions=[],logs=[];
    const element=()=>({isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}]});
    const button={...element(),pressed,getAttribute(name){return name==='aria-pressed'?String(this.pressed):null;}},close=element(),slot={...element(),dataset:{uid:'a'}},search={value:'before'};
    const card={...element(),querySelector:sel=>sel==='.dc-x'?close:sel.includes('.dc-buddy')?button:null};
    const modal={...element(),matches:selector=>selector.includes('.mon-modal'),querySelector:sel=>sel==='.mon-card'?card:null},root={...element(),querySelector:()=>modal};
    let opened=false;
    global.document={hidden:false,querySelector:sel=>sel==='#modal-root.open'&&opened?root:sel==='#pc-search'||sel==='#screen-team.active #pc-search'?search:null,querySelectorAll:sel=>sel==='#team-slots [data-uid],#team-mini.show [data-uid]'?[slot]:sel==='#modal-root.open .modal'&&opened?[modal]:[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    const e={settings:cfg,preparation:null,trainProtected:['a'],running:true,manual:null,telemetry:{sample:{old:true}},budget:{used:7},log:text=>logs.push(text),driver:{lastClick:0,
        nav:screen=>{actions.push('nav:'+screen);return true;},input:(el,value)=>{el.value=value;actions.push('search');return true;},
        click:(el,label)=>{if(!el)return false;actions.push(label);if(el===slot)opened=true;if(el===button){button.pressed=!button.pressed;if(saveOnClick)s.buddy.uid=button.pressed?'a':null;}if(el===close)opened=false;return true;}}};
    const a=new H.Automation(e);e.automation=a;
    return{s,e,a,button,card,modal,actions,logs,search,open:()=>{opened=true;},isOpen:()=>opened};
}
test('auto buddy uses its own protected native member-card owner and does not spend items',t=>{
    const {s,e,a,actions,card}=fixture(t),now=Date.now();assert.equal(a.autoBuddy(s,now),true);assert.equal(a.owner.kind,'buddy');assert.equal(a.owner.uid,'a');
    const driver=new H.DOMDriver(e);e.settings.dismissInfo=true;assert.equal(driver.dismissInformation(s),false);
    a.buddyCard(s,card,a.owner);assert.equal(s.buddy.uid,'a');assert.equal(e.telemetry.sample,null);assert.equal(e.budget.used,7);
    assert.equal(actions.filter(x=>x==='设为当前训练搭档').length,1);a.buddyCard(s,card,a.owner);assert.equal(a.owner,null);
    a.autoBuddy(s,now+1000);assert.equal(a.buddyTask,null);assert.ok(actions.includes('nav:adventure'));
});
test('a selected native buddy button is closed without toggling it off while save confirmation is delayed',t=>{
    const {s,a,card,actions,isOpen}=fixture(t,{pressed:true,saveOnClick:false}),now=Date.now();a.autoBuddy(s,now);
    a.buddyCard(s,card,a.owner);assert.equal(isOpen(),false);assert.equal(a.buddyTask.stage,'confirmSave');
    assert.equal(actions.filter(x=>x==='设为当前训练搭档').length,0);a.autoBuddy(s,now+1200);assert.equal(a.buddyTask.stage,'confirmSave');
    s.buddy.uid='a';a.autoBuddy(s,now+2400);a.autoBuddy(s,now+3600);assert.equal(a.buddyTask,null);
});
test('an unconfirmed buddy click is not repeated, then backs off without failing the training task',t=>{
    const {s,e,a,card,button,actions}=fixture(t,{saveOnClick:false}),now=Date.now();a.autoBuddy(s,now);a.buddyCard(s,card,a.owner);
    button.pressed=false;a.buddyTask.clickedAt=now-11000;a.buddyCard(s,card,a.owner);
    assert.equal(e.running,true);assert.ok(a.buddyRetryAt>now);assert.equal(actions.filter(x=>x==='设为当前训练搭档').length,1);
    a.autoBuddy(s,now+1000);assert.equal(a.autoBuddy(s,now+2000),false);
});
test('a resumed buddy card is closed for member revalidation before any toggle',t=>{
    const {s,a,actions,open,isOpen}=fixture(t);a.restoreOwner({kind:'buddy',selector:'.mon-modal',uid:'a'});open();
    assert.equal(a.owner.reopen,true);assert.equal(a.dialog(s),true);assert.equal(a.owner,null);assert.equal(isOpen(),false);
    assert.equal(actions.filter(x=>x==='设为当前训练搭档').length,0);
});
test('buddy selection waits for native road application and leaves unrelated activities alone',t=>{
    const {s,a,actions}=fixture(t),now=Date.now();s.road=['carry'];assert.equal(a.autoBuddy(s,now),false);assert.deepEqual(actions,[]);
    s.road=[...s.team];s.adv.event={raid:true};assert.equal(a.autoBuddy(s,now),false);assert.deepEqual(actions,[]);
});
test('an already correct buddy never opens a member card',t=>{
    const {s,a,actions}=fixture(t);s.buddy.uid='a';assert.equal(a.autoBuddy(s),false);assert.deepEqual(actions,[]);
});
test('manual handoff leaves the KO counter alone and resume rechecks the unfinished trainee',t=>{
    const {s,e,a,actions,card}=fixture(t);s.adv.battle={kind:'trainer'};e.manual={until:Date.now()+15000};
    assert.equal(a.autoBuddy(s),false);assert.equal(s.buddy.ko,17);assert.deepEqual(actions,[]);
    e.manual=null;assert.equal(a.autoBuddy(s),true);e.manual={};assert.equal(a.buddyCard(s,card),false);
    e.manual=null;s.mons[0].level=70;a.buddyCard(s,card);assert.equal(a.buddyTask.stage,'return');
    assert.equal(actions.includes('设为当前训练搭档'),false);
});
test('a new required choice or independent event interrupts the switch before the buddy button is pressed',t=>{
    const {s,a,actions,card}=fixture(t);
    for(const [key,value] of [['pending',{type:'gift'}],['event',{raid:true}],['zone',{id:150}],['tower',{kind:'candy'}],['league',{reg:'kanto'}]]){
        s.adv.battle={kind:'trainer'};assert.equal(a.autoBuddy(s),true);s.adv[key]=value;
        assert.equal(a.buddyCard(s,card),true,key);assert.equal(a.buddyTask.stage,'return',key);a.autoBuddy(s);
        assert.equal(a.autoBuddy(s),false);assert.equal(a.buddyTask,null);delete s.adv[key];
    }
    assert.equal(actions.includes('设为当前训练搭档'),false);
});

test('mobile buddy selection skips a hidden desktop slot and opens the visible mini party member',t=>{
    const {s,e,a}=fixture(t),base={isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],dataset:{uid:'a'}};
    const hidden={...base,hidden:true},mini={...base};let picked=null;
    global.document.querySelectorAll=selector=>selector==='#team-slots [data-uid],#team-mini.show [data-uid]'?[hidden,mini]:[];
    e.driver.click=el=>{picked=el;return true;};a.autoBuddy(s,Date.now());assert.equal(picked,mini);assert.equal(a.owner.kind,'buddy');
});

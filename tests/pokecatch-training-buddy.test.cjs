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

test('mobile buddy selection skips a hidden desktop slot and opens the visible mini party member',t=>{
    const {s,e,a}=fixture(t),base={isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],dataset:{uid:'a'}};
    const hidden={...base,hidden:true},mini={...base};let picked=null;
    global.document.querySelectorAll=selector=>selector==='#team-slots [data-uid],#team-mini.show [data-uid]'?[hidden,mini]:[];
    e.driver.click=el=>{picked=el;return true;};a.autoBuddy(s,Date.now());assert.equal(picked,mini);assert.equal(a.owner.kind,'buddy');
});

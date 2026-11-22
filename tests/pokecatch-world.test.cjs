const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function fixture(t,settings={}){
    const previousDocument=global.document,previousStyle=global.getComputedStyle;
    const elements=new Map();
    global.document={hidden:false,querySelector:selector=>elements.get(selector)||null,querySelectorAll:()=>[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{if(previousDocument===undefined)delete global.document;else global.document=previousDocument;if(previousStyle===undefined)delete global.getComputedStyle;else global.getComputedStyle=previousStyle;});
    const s={trainer:{id:'world-fixture'},money:10000,mons:[{uid:'a',id:6,level:100}],team:['a'],dex:{},items:{},stats:{},
        adv:{layout:6,chapter:0,unlocked:65,loops:[],badges:[]},wb:{ed:5,tryEd:5,day:0,n:0,caught:5}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'world',worldActions:3,worldCapture:false,autoPrepare:false,...settings});e.running=true;e.account='world-fixture';e.automation.begin(s);
    const clicks=[],completed=[];
    e.driver.nav=()=>true;e.driver.click=(el,label)=>{if(!el)return false;clicks.push(label);el.click?.();return true;};
    e.automation.done=message=>{completed.push(message);e.running=false;};
    function show(selector,onClick){const el={isConnected:true,hidden:false,disabled:false,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],click:onClick};elements.set(selector,el);return el;}
    return {s,e,show,elements,clicks,completed};
}

test('an already captured world boss does not finish an attack-only task',t=>{
    const {s,e,show,completed}=fixture(t);show('#raid-root .wb-capv .chip-ok');
    e.automation.world(s,10000);
    assert.equal(completed.length,0);assert.equal(e.running,true);assert.equal(e.automation.state.worldDone,0);
});

test('a capture task still completes when the current edition is already caught',t=>{
    const {s,e,show,completed}=fixture(t,{worldCapture:true});show('#raid-root .wb-capv .chip-ok');
    e.automation.world(s,10000);
    assert.deepEqual(completed,['本期世界首领已捕获']);
});

test('attack-only completion uses new confirmed attacks even on a previously caught edition',t=>{
    const {s,e,show,completed}=fixture(t);show('#raid-root .wb-capv .chip-ok');
    s.wb.n=2;e.automation.world(s,10000);assert.equal(completed.length,0);
    s.wb.n=3;e.automation.world(s,11000);assert.deepEqual(completed,['世界首领攻击次数目标已完成']);
});

test('unconfirmed world attacks are retried with bounded backoff, then a confirmed attack releases it',t=>{
    const {s,e,show,clicks}=fixture(t);
    show('[data-wb-atk]');
    e.automation.world(s,10000);
    for(const at of [11200,13600,18400,24999])e.automation.world(s,at);
    assert.equal(clicks.length,1);
    assert.match(e.status,/攻击确认/);
    assert.equal(e.nextWake,25000);
    e.automation.world(s,25000);assert.equal(clicks.length,2);
    e.automation.world(s,54999);assert.equal(clicks.length,2);
    e.automation.world(s,55000);assert.equal(clicks.length,3);
    e.automation.world(s,114999);assert.equal(clicks.length,3);
    e.automation.world(s,115000);assert.equal(clicks.length,4);
    assert.equal(e.automation.state.worldAttack.retryAt,175000);

    s.wb.n=1;e.automation.world(s,119000);
    assert.equal(e.automation.state.worldDone,1);
    assert.equal(clicks.length,5);
    assert.equal(e.automation.state.worldAttack.retryAt,134000);
    s.wb.day=1;s.wb.n=0;e.automation.world(s,123000);
    assert.equal(clicks.length,6);
    assert.equal(e.automation.state.worldAttack.retryAt,138000);
});

test('world attack confirmation survives task restoration without blocking an available capture',t=>{
    const {s,e,show,clicks}=fixture(t,{worldCapture:true});
    s.wb.caught=4;
    show('[data-wb-atk]');
    e.automation.world(s,10000);
    const checkpoint=JSON.parse(JSON.stringify(e.progressSnapshot()));
    e.beginTask(s,checkpoint,14000);
    e.automation.world(s,14000);
    assert.deepEqual(clicks,['使用本次世界首领攻击机会']);
    show('[data-wbz-go]');
    e.automation.world(s,15000);
    assert.deepEqual(clicks,['使用本次世界首领攻击机会','进入世界首领捕获']);
});

test('the final confirmed attack finishes its animation and recap before completing the task',t=>{
    const {s,e,show,elements,clicks,completed}=fixture(t);s.wb.n=3;
    const skip=show('#raid-root .wb-skip',()=>{skip.hidden=true;});
    e.automation.world(s,10000);assert.equal(completed.length,0);assert.deepEqual(clicks,['跳过世界首领攻击动画']);
    e.automation.world(s,11200);assert.equal(completed.length,0,'a short gap before the native recap cannot finish the queue item');
    show('.wb-recap [data-wb-go]',()=>elements.delete('.wb-recap [data-wb-go]'));
    e.automation.world(s,12400);assert.deepEqual(clicks,['跳过世界首领攻击动画','确认世界首领攻击结果']);assert.equal(completed.length,0);
    e.automation.world(s,13600);assert.equal(completed.length,0);
    e.automation.world(s,16000);assert.deepEqual(completed,['世界首领攻击次数目标已完成']);assert.equal(clicks.length,2,'the final attack is never replayed');
});

test('disabled animation skipping waits for the native attack display without consuming another attack',t=>{
    const {s,e,show,clicks,completed}=fixture(t,{animations:false});s.wb.n=3;
    show('#raid-root .wb-skip');show('#raid-root .wb-spill');
    e.automation.world(s,10000);e.automation.world(s,20000);
    assert.equal(clicks.length,0);assert.equal(completed.length,0);assert.equal(e.running,true);assert.match(e.status,/攻击结算/);
});

test('capture controls behind a world attack result are not clicked during settlement',t=>{
    const {s,e,show,elements,clicks}=fixture(t,{worldCapture:true});s.wb.caught=4;
    show('#raid-root .wb-spill');show('[data-wbz-go]');
    e.automation.world(s,10000);assert.equal(clicks.length,0);
    elements.delete('#raid-root .wb-spill');e.automation.world(s,11200);assert.equal(clicks.length,0);
    e.automation.world(s,14000);assert.deepEqual(clicks,['进入世界首领捕获']);
});

test('attack-only accumulation continues across days and editions instead of using the capture badge',t=>{
    const {s,e,show,completed}=fixture(t);show('#raid-root .wb-capv .chip-ok');
    s.wb.n=1;e.automation.world(s,10000);
    s.wb.ed=6;s.wb.tryEd=6;s.wb.caught=6;s.wb.day=0;s.wb.n=1;e.automation.world(s,20000);assert.equal(e.automation.state.worldDone,2);assert.equal(completed.length,0);
    s.wb.n=2;e.automation.world(s,30000);assert.deepEqual(completed,['世界首领攻击次数目标已完成']);
});

const closedBoss='#raid-root .rh-hb.wb[aria-disabled="true"]';
function closedLobby(show,deadline){
    show(closedBoss).querySelectorAll=selector=>selector==='[data-wb-cd]'?[{dataset:{wbCd:String(deadline)}}]:[];
    show('#raid-root [data-raid-page="chroma"]');
}

for(const caught of [false,true]){
    test('closed world boss yields to the selected legendary map (shiny raid caught: '+caught+')',t=>{
        const {s,e,show,clicks}=fixture(t);
        const now=Date.UTC(2026,10,20,8,41),opens=now+499*60000,day=H.parisDay(now);
        const base={...e.settings,mode:'legend',dailyMain:'legend',legendId:145,dailyWorld:true,dailyCandy:false,dailyTower:false,dailyElite:false};
        s.wb.caught=0;s.adv.badges=['Maître'];s.raids={seen:day,done:caught?{['johto|'+day]:1}:{}};
        e.rememberDraw(s,'johto',183,now);
        // This case tests the handoff to an already-open Zapdos encounter.
        for(const id of H.DATA.zones.find(zone=>zone.id===145).gate.ids)s.dex[id]={caught:1};
        e.read=()=>s;e.daily={base,checking:true,job:{kind:'world',started:now,until:H.nextParisReset(now)},checkpoint:e.progressSnapshot()};
        closedLobby(show,opens);
        e.automation.world(s,now);
        assert.equal(e.daily.job,null);assert.equal(e.settings.mode,'legend');
        assert.equal(e.dailyMarks.world,opens);assert.equal(e.nextWake,null);
        assert.equal(H.dailyFacility(s,base,e.dailyMarks,opens-1),null);
        assert.equal(H.dailyFacility(s,base,e.dailyMarks,opens).kind,'world');
        assert.equal(e.priorityRaid(s,now+1),!caught);
        if(!caught){
            e.probeRaid(s,now+2);assert.deepEqual(clicks,['打开每日异色团体战']);
            s.raids.done['johto|'+day]=1;e.probeRaid(s,now+3);
        }else assert.deepEqual(clicks,[]);
        assert.equal(e.raidProbe,false);assert.equal(e.settings.mode,'legend');
        let target;e.travel=row=>{target=row.id;};e.legend(s,now+2);assert.equal(target,145);
    });
}

test('upgrading a legacy daily raid preserves its budget and chosen legendary, and drops pending shiny raid actions',t=>{
    const {e,s}=fixture(t);
    const settings={...e.settings,mode:'progress',dailyMain:'raid',legendId:385};
    const resume={account:e.account,wanted:true,settings:{...settings,mode:'raid'},raidProbe:true,
        daily:{base:{...settings,mode:'raid'},menuMode:'progress'},budget:{spent:400,used:2},session:{startMoney:1234}};
    e.storage.setItem('pokecatch-helper:v1:'+e.account,JSON.stringify({settings,resume}));e.loadAccount(s);
    assert.equal(e.settings.dailyMain,'legend');assert.equal(e.checkpoint.settings.mode,'legend');
    assert.equal(e.checkpoint.daily.base.legendId,385);assert.equal(e.checkpoint.daily.menuMode,'progress');
    assert.deepEqual(e.checkpoint.budget,resume.budget);assert.equal(e.checkpoint.session.startMoney,1234);
    assert.ok(!e.checkpoint.raidProbe);
});

test('standalone world boss waits for its lobby countdown and leaves the shiny raid alone',t=>{
    const {s,e,show,clicks}=fixture(t);closedLobby(show,1000000);
    e.automation.world(s,10000);assert.equal(e.nextWake,1000000);assert.deepEqual(clicks,[]);
});

test('an open world boss still enters the native encounter during daily chores',t=>{
    const {s,e,show,clicks}=fixture(t);e.daily={job:{kind:'world'}};
    show('#raid-root .rh-hb.wb[data-wb-go]');show('#raid-root [data-raid-page="chroma"]');
    e.automation.world(s,10000);assert.deepEqual(clicks,['进入世界首领']);
});

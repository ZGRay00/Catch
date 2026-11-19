const test=require('node:test');
const assert=require('node:assert/strict');
const {DATA,Engine,parisDay}=require('../Pokecatch自动助手.user.js');

function fixture(t,now=Date.parse('2026-11-19T12:00:00Z')){
    const previous=global.document,style=global.getComputedStyle,entries=[];
    global.document={querySelector:sel=>sel==='#raid-root .rc-card'?entries[0]||null:null,
        querySelectorAll:sel=>sel==='#raid-root .rc-card[data-rc]'?entries:[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{if(previous)global.document=previous;else delete global.document;
        if(style)global.getComputedStyle=style;else delete global.getComputedStyle;});
    const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
    const s={trainer:{id:'day-raids'},mons:[],team:[],dex:{},raids:{done:{},doneBoss:{}},
        adv:{chapter:13,unlocked:13,badges:['Maître'],node:1}};
    function load(save=s){const engine=new Engine(storage,{mode:'progress',raids:true,skipOwnedShiny:true});
        engine.loadAccount(save);return engine;}
    const e=load();
    function caught(reg,id,day=parisDay(now)){
        const key=reg+'|'+day;s.raids.done[key]=now;s.raids.doneBoss[key]=id;
    }
    return {s,e,now,day:parisDay(now),load,caught,entries};
}
function card(reg,boss,{done=false,disabled=false}={}){
    const portrait={querySelectorAll:()=>[{dataset:{id:String(boss)}}]};
    const go={disabled,isConnected:true,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}]};
    return {dataset:{rc:reg},classList:{contains:k=>k==='done'&&done},
        querySelector:sel=>sel==='.boss'?portrait:sel==='[data-raid-go]'&&!done?go:null};
}

test('a drawn raid completed today never takes the adventure page or interrupts training, even after reload',t=>{
    const {s,e,now,day,caught,load}=fixture(t);
    s.adv.unlocked=64;s.raids.seen=day;caught('kanto',35);
    e.preparation={phase:'train',context:{kind:'progress'}};
    const prep=e.preparation;
    global.document.querySelector=()=>{throw Error('completed raid inspected a game control');};
    for(const dt of [0,600001,3600000]){
        assert.equal(e.priorityRaid(s,now+dt),false);
        assert.equal(e.preparation,prep);assert.equal(e.raidProbe,false);
    }
    const reloaded=load();assert.match(reloaded.raidDailyStatus(s,now).reason,/已完成/);
    // A restored checkpoint may already be on its way to the raid page.
    reloaded.raidProbe=true;reloaded.driver.navigation={screen:'raid'};
    assert.equal(reloaded.priorityRaid(s,now+1),false);assert.equal(reloaded.raidProbe,false);
    assert.equal(reloaded.driver.navigation,null);
});

test('legacy multi-region completion reopens after a newly cleared league and ignores locked regions',t=>{
    const {s,e,now,caught}=fixture(t);caught('kanto',35);
    assert.ok(e.raidDailyStatus(s,now));s.travel={to:['johto']};assert.ok(e.raidDailyStatus(s,now));
    s.adv.unlocked=29;assert.ok(e.raidDailyStatus(s,now));
    s.adv.badges.push('Maître Johto');assert.equal(e.raidDailyStatus(s,now),null);
    caught('johto',183);assert.ok(e.raidDailyStatus(s,now));
    s.adv.unlocked=48;assert.equal(e.raidDailyStatus(s,now),null);
});

test('skip-owned is reversible, survives restart and cannot hide an account change or same-day reroll',t=>{
    const {s,e,now,day,load,entries,caught}=fixture(t);s.raids.seen=day;s.dex[35]={shiny:1};
    e.driver.nav=()=>true;e.driver.click=()=>{throw Error('launched an owned shiny');};
    entries.push(card('kanto',35));e.raidProbe=true;e.driver.raidStep(s,now);
    assert.equal(e.raidProbe,false);
    const restored=load();assert.match(restored.raidDailyStatus(s,now).reason,/跳过/);
    restored.settings.skipOwnedShiny=false;assert.equal(restored.raidDailyStatus(s,now),null);
    restored.settings.skipOwnedShiny=true;
    const other={...s,trainer:{id:'another-player'}};restored.loadAccount(other);
    assert.equal(restored.raidDailyStatus(other,now),null);
    restored.loadAccount(s);s.adv.unlocked=31;s.raids.reroll={day,from:'kanto',to:'johto'};
    caught('kanto',35);assert.equal(restored.raidDailyStatus(s,now),null);
    caught('johto',183);assert.match(restored.raidDailyStatus(s,now).reason,/已完成/);
});

test('partial, disabled, failed, unknown or outdated records never become daily completion',t=>{
    const {s,e,now,day,entries,caught}=fixture(t);
    e.driver.nav=()=>true;s.adv.unlocked=31;
    caught('kanto',35);s.raids.tried={['johto|'+day]:150};s.raids.pity={johto:{n:149,date:day}};
    entries.push(card('kanto',35,{done:true}),card('johto',183,{disabled:true}));
    e.raidProbe=true;e.driver.raidStep(s,now);
    assert.equal(e.raidDailyStatus(s,now),null);assert.doesNotMatch(e.raidCheckNote,/已完成/);
    assert.equal(e.nextRaid,now+600000);
    s.raids.seen=day;e.rememberDraw(s,'kanto',52,now);
    assert.equal(e.raidDailyStatus(s,now),null,'the native boss identity changed since earlier completion');
    e.rememberDraw(s,'not-a-region',183,now);assert.equal(e.raidDraw.boss,52);
    assert.equal(e.raidDailyStatus(s,now+86400000),null);
    s.raids.done={};s.raids.doneBoss={};s.adv.event={raid:true};assert.equal(e.raidDailyStatus(s,now),null);
});

test('Paris midnight handles both daylight-saving transitions; transient retries cannot cross refresh',t=>{
    const {s,e,caught}=fixture(t);
    for(const [start,reset] of [
        ['2026-03-28T23:00Z','2026-03-29T22:00Z'],
        ['2026-10-24T22:00Z','2026-10-25T23:00Z']
    ]){
        const at=Date.parse(start),until=Date.parse(reset);
        s.raids.seen=parisDay(at);caught('kanto',35,parisDay(at));
        assert.equal(e.raidDailyStatus(s,at).until,until);
        assert.equal(e.raidDailyStatus(s,until-1).until,until);
        assert.equal(e.raidDailyStatus(s,until),null);
        e.deferRaid('页面暂未加载',until-3000);assert.equal(e.nextRaid,until);
    }
});

test('an old checkpoint and yesterday’s training return both yield at the first safe boundary of the new day',t=>{
    const {s,e}=fixture(t),midnight=Date.parse('2026-11-19T23:00Z');
    e.beginTask(s,{at:midnight-90000,session:{nextRaid:midnight+510000}},midnight+1);
    assert.equal(e.nextRaid,midnight);
    e.raidReturn={date:parisDay(midnight-1),reg:'kanto',boss:35};e.raidProbe=true;
    e.driver.raidStep=()=>{throw Error('attempted yesterday’s launch');};
    e.probeRaid(s,midnight+1);assert.equal(e.raidReturn,null);assert.equal(e.nextRaid,midnight+1);
    assert.equal(e.priorityRaid(s,midnight+2),true);
});

test('timing out a native raid carried over midnight does not penalize the new regional draw',async t=>{
    const {s,e}=fixture(t),now=Date.parse('2026-11-19T23:00:05Z'),old=parisDay(now-60000);
    global.document.hidden=false;global.document.documentElement={lang:'zh-Hans'};
    s.adv={...s.adv,layout:DATA.layout,
        event:{raid:true,id:35,reg:'kanto',date:old,loops:20}};
    s.mons=[{id:35,uid:'x',level:100}];s.team=['x'];s.items={};s.stats={};s.money=0;
    e.storage.setItem('gachamon-save-v1',JSON.stringify(s));e.tabToken=null;
    e.running=true;e.started=now-7200000;e.schedule=()=>{};e.settings.autoPrepare=false;
    e.driver.raid={date:old,reg:'kanto',boss:35,started:e.started};e.driver.leaveRaid=()=>true;
    e.serviceBackground=()=>false;
    await e.step(now);assert.equal(e.driver.raid,null);
    assert.equal(e.raidCooldown[parisDay(now)+'|kanto'],undefined);assert.equal(e.nextRaid,now);
    assert.equal(e.raidCooldown[old+'|kanto'],now);
});

test('after tab sleep a stale, helper-owned native launch confirmation is cancelled and today can run immediately',t=>{
    const {s,e}=fixture(t),now=Date.now(),old=parisDay(now-86400000),d=e.driver;
    global.document.documentElement={lang:'zh-Hans'};
    const body={textContent:'团体战开始后，就不能再重新抽取今天的团体战了。',querySelector:()=>null};
    const cancel={},launch={},modal={querySelector:sel=>({'.modal-body > p':body,'.modal-actions.duo button.primary':launch,'.modal-actions.duo button.ghost':cancel})[sel]};
    global.document.querySelector=sel=>sel==='#modal-root.open .modal'?modal:null;
    d.raid={reg:'kanto',boss:35,date:old};e.raidProbe=true;
    d.ownedDialog={type:'ally',key:'raid:kanto:35'};d.click=el=>{assert.equal(el,cancel);return true;};
    assert.equal(d.dialog(s),true);assert.equal(d.ownedDialog,null);assert.equal(e.raidProbe,false);
    assert.ok(e.nextRaid<=Date.now());assert.equal(e.priorityRaid(s,Date.now()),true);
});

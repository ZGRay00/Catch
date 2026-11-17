const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

test('returned expeditions never display a polling deadline as remaining travel time',t=>{
    const {s,e,job,now}=fixture(t,{autoUnderCollect:false});
    let row=H.taskExecutionState(s,e,now()).services.find(service=>service.id==='underground');
    assert.equal(row.nextAt,null);assert.match(row.detail,/已返回 1/);
    s.under.slots.push(job('still-travelling',now()+120000,1));
    row=H.taskExecutionState(s,e,now()).services.find(service=>service.id==='underground');
    assert.equal(row.nextAt,now()+120000);assert.match(row.detail,/计时中 1.*已返回 1/);
});

function element(extra={}){
    return{isConnected:true,hidden:false,disabled:false,dataset:{},closest:()=>null,getAttribute:()=>null,
        getClientRects:()=>[{}],classList:{contains:()=>false},querySelector:()=>null,querySelectorAll:()=>[],...extra};
}
function fixture(t,settings={}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};
    let clock=Date.UTC(2026,10,17,12);Date.now=()=>clock;
    const s={trainer:{id:'parallel-services-v330'},money:1000,mons:[6,9,3,65,68,149].map((id,index)=>({uid:'main-'+index,id,level:100,reg:'kanto'})),
        team:Array.from({length:6},(_,index)=>'main-'+index),road:Array.from({length:6},(_,index)=>'main-'+index),dex:{},items:{},stats:{hatched:0},
        travel:{to:['johto','hoenn','sinnoh']},pension:{mons:[],eggs:[{uid:'egg-ready',id:1,hatchAt:clock-1000}]},
        under:{day:H.parisDay(clock),sent:1,used:{},slots:[],geodes:[0,0,0,0]},
        adv:{layout:H.DATA.layout,chapter:48,unlocked:65,node:0,runs:0,speed:4,loops:[],badges:['Forêt'],gifts:{},deaths:{}}};
    const actions=[],nodes=new Map(),tabs=new Map(['adventure','map','raid','team','pension','underground','shop'].map(screen=>[screen,element({dataset:{screen}})]));
    const ui={screen:'adventure',deferCollection:true,rejectClick:false};
    const job=(id='ready',end=clock-1,bay=0)=>({id,bay,start:clock-60000,end,team:['under-0','under-1','under-2'],mons:[74,95,112].map((id,index)=>({uid:'under-'+index,id,level:100,reg:'sinnoh'}))});
    s.under.slots=[job()];
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','parallel-tab']]),writes=[];
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push({key,value:String(value)});data.set(key,String(value));},removeItem:key=>data.delete(key)};
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));
    const readyEggs=()=>ui.screen==='pension'?s.pension.eggs.filter(egg=>egg.hatchAt<=clock).map(egg=>element({dataset:{egg:egg.uid}})):[];
    const takeButtons=()=>ui.screen==='underground'?H.undergroundStatus(s,clock).ready.map(run=>element({dataset:{ugTake:String(run.bay??0)},perform:()=>{
        if(ui.deferCollection)return;s.under.slots=s.under.slots.filter(slot=>slot.id!==run.id);s.mons.push(...run.mons);save();
    }})):[];
    global.document={hidden:false,documentElement:{classList:{contains:()=>false}},
        querySelector(selector){
            if(nodes.has(selector))return nodes.get(selector)[0]||null;
            const tab=/^#tabs \[data-screen="([^"]+)"\]$/.exec(selector);if(tab)return tabs.get(tab[1])||null;
            if(selector==='.screen.active[id^="screen-"]')return element({id:'screen-'+ui.screen});
            if(selector==='#pen-tabs [data-pen-tab="egg"]')return ui.screen==='pension'?element({classList:{contains:name=>name==='on'}}):null;
            if(selector==='#ug-root'&&ui.screen==='underground')return element();
            return null;
        },
        querySelectorAll(selector){if(nodes.has(selector))return nodes.get(selector);if(selector==='#pen-eggs .pen-egg.ready[data-egg]')return readyEggs();if(selector==='#ug-root [data-ug-take]')return takeButtons();return[];}};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const e=new H.Engine(storage,{mode:'money',raids:false,autoPrepare:false,autoTeam:true,optimizeRaid:false,autoEggs:true,autoUnderCollect:true,autoEvolve:true,moneyBuff:false,...settings});
    e.loadAccount(s);e.read();e.running=true;e.started=clock;e.tabToken='parallel-tab';e.schedule=()=>{};e.nextRaid=Infinity;e.automation.begin(s);
    e.driver.nav=screen=>{actions.push({type:'nav',screen});ui.screen=screen;return true;};
    e.driver.click=(el,label)=>{if(!el||el.disabled||el.hidden||ui.rejectClick)return false;actions.push({type:'click',label,el});el.perform?.();return true;};
    e.driver.animations=e.driver.dismissInformation=e.driver.receipt=e.driver.dialog=e.driver.gift=()=>false;
    return{s,e,ui,storage,writes,data,actions,nodes,tabs,save,job,now:()=>clock,advance:ms=>clock+=ms,
        plan:()=>H.parallelPlan(s,e,clock),service:()=>e.serviceBackground(s,clock),under:()=>e.automation.serviceUnderground(s,clock)};
}

test('parallel APIs and conservative background collection default are available without DOM globals',()=>{
    for(const name of ['parallelPlan','taskExecutionState','normalizeServiceState'])assert.equal(typeof H[name],'function',name);
    assert.equal(typeof H.Engine.prototype.serviceBackground,'function');assert.equal(typeof H.Automation.prototype.serviceUnderground,'function');
    assert.equal(H.DEFAULTS.autoUnderCollect,true);assert.equal(H.normalizeSettings({autoUnderCollect:false}).autoUnderCollect,false);
});
test('service-state normalization rejects malformed transactions and copies independent mutable state',()=>{
    const a=H.normalizeServiceState(null),b=H.normalizeServiceState(null);
    assert.equal(a.underground,null);assert.equal(a.underClaimed,0);assert.deepEqual(a.lastStarted,{});assert.deepEqual(a.lastCompleted,{});assert.deepEqual(a.retryAt,{});
    a.lastStarted.eggs=123;assert.equal(b.lastStarted.eggs,undefined);
    const bad=H.normalizeServiceState({underground:{returnScreen:'bad selector',tx:{id:{},uids:'wrong',at:-1}},underClaimed:-99,lastStarted:[]});
    assert.equal(bad.underClaimed,0);assert.ok(!bad.underground||!bad.underground.tx);
});
test('mature eggs and returned expeditions become ready ahead of new evolution work',t=>{
    const f=fixture(t),p=f.plan();assert.ok(p.ready.includes('eggs'));assert.ok(p.ready.includes('underground'));assert.equal(p.mainComplete,false);
    if(p.ready.includes('evolution')){assert.ok(p.ready.indexOf('eggs')<p.ready.indexOf('evolution'));assert.ok(p.ready.indexOf('underground')<p.ready.indexOf('evolution'));}
    assert.ok(p.pendingCount>=2);assert.equal(p.active,null);
});
test('the scheduler honors a native ready egg even when its stored timestamp is still in the future',t=>{
    const f=fixture(t,{autoUnderCollect:false,autoEvolve:false});f.s.under.slots=[];f.ui.screen='pension';f.s.pension.eggs[0].hatchAt=f.now()+60000;
    const ready=element({dataset:{egg:'egg-ready'}});f.nodes.set('#pen-eggs .pen-egg.ready[data-egg]',[ready]);
    const plan=f.plan();assert.ok(plan.ready.includes('eggs'));assert.equal(plan.pendingCount,1);
    const view=H.taskExecutionState(f.s,f.e,f.now());assert.equal(view.services.find(service=>service.id==='eggs').state,'ready');
    assert.equal(f.service(),true);assert.equal(f.e.automation.state.eggService?.tx?.uid,'egg-ready');assert.equal(f.actions.filter(action=>action.type==='click').length,1);
});
test('disabled, disconnected and unknown-UID native ready controls cannot create a false ready egg',t=>{
    const f=fixture(t,{autoUnderCollect:false,autoEvolve:false});f.s.under.slots=[];f.ui.screen='pension';f.s.pension.eggs[0].hatchAt=f.now()+60000;
    f.nodes.set('#pen-eggs .pen-egg.ready[data-egg]',[
        element({dataset:{egg:'egg-ready'},disabled:true}),element({dataset:{egg:'unknown-egg'}}),element({dataset:{egg:'egg-ready'},isConnected:false}),
    ]);
    assert.equal(f.plan().ready.includes('eggs'),false);assert.equal(f.plan().pendingCount,0);assert.equal(f.service(),false);assert.deepEqual(f.actions,[]);
    assert.equal(H.taskExecutionState(f.s,f.e,f.now()).services.find(service=>service.id==='eggs').state,'timing');
});
test('task execution summaries are read-only and remain available when passive jobs are waiting',t=>{
    const f=fixture(t),before=JSON.stringify(f.s),state=H.taskExecutionState(f.s,f.e,f.now());assert.ok(state&&typeof state==='object');assert.equal(JSON.stringify(f.s),before);
    f.s.pension.eggs[0].hatchAt=f.now()+600000;f.s.under.slots[0].end=f.now()+600000;
    const p=f.plan();assert.equal(p.ready.includes('eggs'),false);assert.equal(p.ready.includes('underground'),false);assert.equal(JSON.stringify(f.s).includes('"underClaimed"'),false);
});
test('UI execution state separates the serial foreground queue from passive timer readiness',t=>{
    const f=fixture(t),view=H.taskExecutionState(f.s,f.e,f.now());
    assert.match(view.summary,/串行/);assert.match(view.summary,/并行/);assert.match(view.queueLabel,/串行/);
    assert.equal(view.foreground.state,'running');assert.ok(view.services.some(service=>service.id==='eggs'&&service.state==='ready'));
    assert.ok(view.services.some(service=>service.id==='underground'&&service.state==='ready'));assert.equal(view.uiOwner,'空闲');
});
test('UI uses the actual active raid rather than calling it the planned money task',t=>{
    const f=fixture(t);f.s.adv.event={raid:true,id:25};const view=H.taskExecutionState(f.s,f.e,f.now());
    assert.match(view.foreground.label,/团体战/);assert.match(view.foreground.detail,/原任务/);
    assert.ok(view.services.filter(service=>service.state==='waiting').length>=2);
    f.e.running=false;assert.equal(H.taskExecutionState(f.s,f.e,f.now()).foreground.state,'stopped');
});
test('UI explains why a manually chosen incomplete party blocks auto-receipts',t=>{
    const f=fixture(t,{autoTeam:false});f.s.team=f.s.team.slice(0,5);const view=H.taskExecutionState(f.s,f.e,f.now());
    for(const id of ['eggs','underground']){const service=view.services.find(service=>service.id===id);assert.equal(service.state,'blocked');assert.match(service.detail,/手动队伍/);}
});
test('manual handoff, hidden pages and explicit game pause cannot start new services',t=>{
    const f=fixture(t);const check=()=>{const p=f.plan();assert.equal(p.ready.includes('eggs'),false);assert.equal(p.ready.includes('underground'),false);};
    f.e.manual={until:f.now()+10000};check();f.e.manual=null;
    global.document.hidden=true;check();global.document.hidden=false;
    f.s.adv.paused=true;check();delete f.s.adv.paused;
    f.e.running=false;check();
});
test('native choices and independent activities block opening new side pages',t=>{
    const f=fixture(t);
    for(const field of ['pending','event','zone','tower','league']){
        f.s.adv[field]={id:1};const p=f.plan();assert.equal(p.ready.includes('eggs'),false,field);assert.equal(p.ready.includes('underground'),false,field);delete f.s.adv[field];
    }
});
test('map, party, dialogs and charged actions retain their existing UI claim',t=>{
    const f=fixture(t);
    for(const field of ['pendingMap','teamTask','ownedDialog']){
        f.e.driver[field]={started:f.now()};const p=f.plan();assert.equal(p.ready.includes('eggs'),false,field);assert.equal(p.ready.includes('underground'),false,field);f.e.driver[field]=null;
    }
    for(const field of ['resourceTx','autoBuffTx','resourceBuffTx','underLaunch','underCollect','towerLaunch','candyLaunch']){
        f.e.automation.state[field]={at:f.now()};const p=f.plan();assert.equal(p.ready.includes('eggs'),false,field);assert.equal(p.ready.includes('underground'),false,field);delete f.e.automation.state[field];
    }
    f.e.preparation={candyTx:{at:f.now()}};assert.equal(f.plan().ready.includes('eggs'),false);assert.equal(f.plan().ready.includes('underground'),false);
});
test('primary breeding and underground modes keep their own counters and service ownership',t=>{
    const f=fixture(t);f.e.settings.mode='breed';assert.equal(f.plan().ready.includes('eggs'),false);assert.ok(f.plan().ready.includes('underground'));
    f.e.settings.mode='underground';assert.equal(f.plan().ready.includes('underground'),false);assert.ok(f.plan().ready.includes('eggs'));
});
test('manual teams with spare slots do not receive automatic members through a background receipt',t=>{
    const f=fixture(t,{autoTeam:false});assert.ok(f.plan().ready.includes('eggs'));assert.ok(f.plan().ready.includes('underground'));
    f.s.team=f.s.team.slice(0,5);f.s.road=[...f.s.team];const p=f.plan();assert.equal(p.ready.includes('eggs'),false);assert.equal(p.ready.includes('underground'),false);
    assert.ok(p.blocked.eggs);assert.ok(p.blocked.underground);
});
for(const service of ['eggs','underground'])test(`a manual party shortened during ${service} navigation returns without collecting`,t=>{
    const f=fixture(t,{autoTeam:false,autoEggs:service==='eggs',autoUnderCollect:service==='underground',autoEvolve:false});
    const nav=f.e.driver.nav;f.e.driver.nav=screen=>{f.actions.push({type:'nav',screen});f.ui.screen=screen;return false;};
    assert.equal(f.service(),true);
    const active=service==='eggs'?f.e.automation.state.eggService:f.e.services.underground;assert.ok(active);assert.equal(active.tx,undefined);
    f.s.team=f.s.team.slice(0,5);f.s.road=[...f.s.team];const selected=[...f.s.team];f.e.driver.nav=nav;
    assert.equal(f.service(),true);assert.equal(f.actions.filter(action=>action.type==='click').length,0);
    assert.deepEqual(f.s.team,selected);assert.deepEqual(f.s.road,selected);assert.equal(f.ui.screen,'adventure');assert.equal(f.e.running,true);
    assert.equal(f.e.automation.state.eggService,undefined);assert.equal(f.e.services.underground,null);assert.equal(f.s.pension.eggs.length,1);assert.equal(f.s.under.slots.length,1);
});
test('a completed main goal prevents beginning fresh side work',t=>{
    const f=fixture(t,{mode:'money',moneyTarget:1000}),p=f.plan();assert.equal(p.mainComplete,true);assert.equal(p.ready.includes('eggs'),false);assert.equal(p.ready.includes('underground'),false);
    let started=0;f.e.automation.serviceEggs=f.e.automation.serviceUnderground=()=>{started++;return true;};f.service();assert.equal(started,0);
});
test('an existing service finishes its own transaction before another ready service can preempt it',t=>{
    const f=fixture(t);f.e.automation.state.eggService={started:f.now(),returnScreen:'adventure'};
    assert.equal(f.plan().active,'eggs');const calls=[];f.e.automation.serviceEggs=()=>{calls.push('eggs');return true;};f.e.automation.serviceUnderground=()=>{calls.push('underground');return true;};
    f.service();assert.deepEqual(calls,['eggs']);
    delete f.e.automation.state.eggService;f.e.services.underground={started:f.now(),returnScreen:'adventure',returning:true};assert.equal(f.plan().active,'underground');
});
test('a completed main goal does not abandon a side transaction that was already started',t=>{
    const f=fixture(t,{moneyTarget:1000});f.e.services.underground={started:f.now(),returnScreen:'adventure',tx:{id:'ready',uids:['under-0','under-1','under-2'],at:f.now()}};
    const p=f.plan();assert.equal(p.mainComplete,true);assert.equal(p.active,'underground');let continued=0;f.e.automation.serviceUnderground=()=>{continued++;return true;};f.service();assert.equal(continued,1);
});
test('mature eggs take priority over underground receipts regardless of earlier service timestamps',t=>{
    const f=fixture(t);const calls=[];
    f.e.automation.serviceEggs=()=>{calls.push('eggs');f.e.automation.state.eggService={started:f.now(),returnScreen:'adventure'};return true;};
    f.e.automation.serviceUnderground=()=>{calls.push('underground');f.e.services.underground={started:f.now(),returnScreen:'adventure'};return true;};
    f.e.services.lastStarted={eggs:f.now()-1000,underground:f.now()-10000};f.service();assert.equal(calls[0],'eggs');
    delete f.e.automation.state.eggService;f.e.services.lastStarted={eggs:f.now()-20000,underground:f.now()};calls.length=0;f.service();assert.equal(calls[0],'eggs');
});

test('only mature egg collection may open a side page during ordinary native combat',t=>{
    const f=fixture(t);f.s.adv.battle={steps:2,enemies:[{id:19,hp:10}]};const battle=JSON.stringify(f.s.adv.battle),plan=f.plan();
    assert.equal(plan.ready[0],'eggs');assert.equal(plan.blocked.eggs,undefined);
    assert.ok(!plan.ready.includes('underground'));assert.ok(!plan.ready.includes('evolution'));assert.match(plan.blocked.underground,/战斗/);
    assert.equal(JSON.stringify(f.s.adv.battle),battle);
});
test('a ready mature egg cannot be indefinitely preempted by starting more free evolutions',t=>{
    const f=fixture(t);f.s.under.slots=[];const calls=[];
    f.e.automation.evolution=()=>{calls.push('evolution');return true;};f.e.automation.serviceEggs=()=>{calls.push('eggs');f.e.automation.state.eggService={started:f.now(),returnScreen:'adventure'};return true;};
    assert.equal(f.service(),true);assert.deepEqual(calls,['eggs']);
});
test('a real completed side receipt yields exactly one foreground turn before starting another ready service',t=>{
    const f=fixture(t,{autoEggs:false,autoEvolve:false});f.ui.deferCollection=false;
    assert.equal(f.service(),true);assert.ok(f.e.services.underground?.tx);assert.equal(f.actions.filter(action=>action.type==='click').length,1);
    f.e.automation.owner=null;f.advance(1200);assert.equal(f.service(),true);
    assert.equal(f.e.services.underClaimed,1);assert.equal(f.e.services.underground,null);assert.equal(f.e.backgroundYield,true);
    const second=f.job('ready-second');second.team=second.team.map(uid=>uid+'-second');second.mons=second.mons.map((mon,index)=>({...mon,uid:second.team[index]}));f.s.under.slots=[second];f.save();
    f.plan();f.plan();assert.equal(f.e.backgroundYield,true);assert.ok(f.plan().ready.includes('underground'));
    let foregroundTurns=0;if(!f.service())foregroundTurns++;
    assert.equal(foregroundTurns,1);assert.equal(f.e.backgroundYield,false);assert.equal(f.actions.filter(action=>action.type==='click').length,1);
    assert.equal(f.service(),true);assert.equal(f.e.services.underground?.tx?.id,'ready-second');assert.equal(f.actions.filter(action=>action.type==='click').length,2);
});
test('polling readiness alone does not rewrite fair-start timestamps or main wait deadlines',t=>{
    const f=fixture(t);f.e.nextWake=f.now()+600000;const old=JSON.stringify(f.e.services.lastStarted);
    f.plan();f.plan();assert.equal(JSON.stringify(f.e.services.lastStarted),old);assert.equal(f.e.nextWake,f.now()+600000);
});
test('background underground collection never starts an expedition or opens geodes',t=>{
    const f=fixture(t);f.s.under.slots=[f.job('future',f.now()+600000)];
    f.nodes.set('#ug-root [data-ug-go]',[element({dataset:{ugGo:'0'}})]);f.nodes.set('#ug-root [data-ug-geode]',[element({dataset:{ugGeode:'0'}})]);f.s.under.geodes=[1,0,0,0];
    f.under();assert.equal(f.actions.some(action=>action.type==='click'),false);assert.equal(f.e.services.underClaimed,0);assert.equal(f.e.budget.used,0);
});
test('background collection records a real expedition and does not increment before every UID returns',t=>{
    const f=fixture(t,{autoEggs:false,autoEvolve:false}),run=f.s.under.slots[0],team=[...f.s.team],road=[...f.s.road];
    for(let n=0;n<5&&!f.e.services.underground?.tx;n++){f.under();f.advance(1200);}
    const tx=f.e.services.underground?.tx;assert.ok(tx);assert.equal(tx.id,run.id);assert.deepEqual(tx.uids,run.team);assert.equal(f.e.services.underClaimed,0);
    assert.equal(f.actions.filter(action=>action.type==='click').length,1);f.s.under.slots=[];f.e.automation.owner=null;f.under();assert.equal(f.e.services.underClaimed,0);
    f.s.mons.push(run.mons[0],run.mons[1]);f.under();assert.equal(f.e.services.underClaimed,0);
    f.s.mons.push(run.mons[2]);for(let n=0;n<5&&f.e.services.underground;n++){f.e.automation.owner=null;f.under();f.advance(1200);}
    assert.equal(f.e.services.underClaimed,1);assert.equal(f.e.services.underground,null);assert.equal(f.e.automation.state.underDone||0,0);
    assert.deepEqual(f.s.team,team);assert.deepEqual(f.s.road,road);assert.equal(f.e.budget.used,0);assert.equal(f.ui.screen,'adventure');
});
test('failed background collect clicks cannot create a fake collected count or charged action',t=>{
    const f=fixture(t,{autoEggs:false,autoEvolve:false});f.ui.rejectClick=true;for(let n=0;n<4;n++){f.under();f.advance(1200);}
    assert.equal(f.e.services.underClaimed,0);assert.ok(!f.e.services.underground?.tx);assert.equal(f.actions.filter(action=>action.type==='click').length,0);assert.equal(f.e.budget.used,0);assert.equal(f.e.running,true);
});
test('Automation.begin resets primary counters without losing independent background progress',t=>{
    const f=fixture(t);f.e.services.underClaimed=3;f.e.services.underground={started:f.now(),returnScreen:'map',tx:{id:'ready',uids:['under-0','under-1','under-2'],at:f.now()}};
    const before=JSON.stringify(f.e.services);f.e.automation.state.underDone=8;f.e.automation.begin(f.s);assert.equal(JSON.stringify(f.e.services),before);assert.equal(f.e.automation.state.underDone,0);
});
test('background receipt ownership cannot be replayed from an old primary job snapshot',t=>{
    const f=fixture(t);f.e.services.underground={started:f.now(),returnScreen:'adventure',tx:{id:'ready',uids:['under-0','under-1','under-2'],at:f.now()}};
    f.e.automation.own('receipt','.ug-back');assert.equal(f.e.progressSnapshot().flowOwner,null);
    f.e.automation.own('receipt','.tw-back');assert.equal(f.e.progressSnapshot().flowOwner.selector,'.tw-back');
});
test('account persistence stores services once and does not put them into job session snapshots',t=>{
    const f=fixture(t);f.e.services.underClaimed=4;f.e.queueRunning=true;f.e.queueIndex=0;f.e.queue=[{id:'one',title:'main money',status:'running',settings:{...f.e.settings}}];
    f.e.persist();const saved=JSON.parse(f.data.get('pokecatch-helper:v1:'+f.e.account));assert.equal(saved.services.underClaimed,4);
    assert.equal(Object.hasOwn(saved.queue[0].progress||{},'services'),false);assert.equal(Object.hasOwn(saved.queue[0].progress?.session||{},'services'),false);
    const restored=new H.Engine(f.storage);restored.loadAccount(f.s);assert.equal(restored.services.underClaimed,4);
    const other=new H.Engine(f.storage);other.loadAccount({...f.s,trainer:{id:'another-account'}});assert.equal(other.services.underClaimed,0);
    assert.equal(f.writes.filter(write=>write.key==='gachamon-save-v1').length,0);
});
test('stopping preserves an already-clicked underground transaction for read-only confirmation after reload',t=>{
    const f=fixture(t,{autoEggs:false,autoEvolve:false}),run=f.s.under.slots[0];
    for(let n=0;n<5&&!f.e.services.underground?.tx;n++){f.under();f.advance(1200);}
    assert.equal(f.actions.filter(action=>action.type==='click').length,1);const tx=structuredClone(f.e.services.underground.tx);
    f.e.stop('fixture stop');assert.deepEqual(f.e.services.underground.tx,tx);assert.equal(f.under(),false);assert.equal(f.actions.filter(action=>action.type==='click').length,1);
    const next=new H.Engine(f.storage);next.loadAccount(f.s);next.running=true;next.started=f.now();next.tabToken='parallel-tab';next.schedule=()=>{};
    next.driver.nav=f.e.driver.nav;next.driver.click=f.e.driver.click;next.automation.begin(f.s);
    assert.deepEqual(next.services.underground.tx,tx);next.serviceBackground(f.s,f.now());assert.equal(f.actions.filter(action=>action.type==='click').length,1);
    f.s.under.slots=[];f.s.mons.push(...run.mons);for(let n=0;n<5&&next.services.underground;n++){next.automation.owner=null;next.serviceBackground(f.s,f.now());f.advance(1200);}
    assert.equal(next.services.underClaimed,1);assert.equal(next.services.underground,null);assert.equal(next.running,true);
});
test('a refreshed background receipt is recognized outside the underground primary mode',async t=>{
    const f=fixture(t,{autoEggs:false,autoEvolve:false});f.e.services.underground={started:f.now(),returnScreen:'adventure',tx:{id:'ready',uids:['under-0','under-1','under-2'],at:f.now()}};
    const receipt=element(),modal=element({querySelector:selector=>selector==='.ug-back'?receipt:null});
    f.nodes.set('#modal-root.open',[modal]);f.nodes.set('#modal-root.open .ug-back',[receipt]);f.e.automation.owner=null;
    await f.e.step(f.now());assert.equal(f.e.automation.owner?.kind,'receipt');assert.equal(f.e.automation.owner?.selector,'.ug-back');assert.equal(f.e.running,true);
    assert.equal(f.e.settings.mode,'money');assert.equal(f.e.services.underClaimed,0);assert.equal(f.actions.filter(action=>action.type==='click').length,0);
});
test('background return only shifts UI transaction deadlines, never native passive timers',t=>{
    const f=fixture(t);f.e.hiddenAt=f.now()-60000;f.e.services.underground={started:f.now()-10000,returnScreen:'adventure',tx:{id:'ready',uids:['under-0','under-1','under-2'],at:f.now()-5000}};
    const started=f.e.services.underground.started,at=f.e.services.underground.tx.at,nativeEnd=f.s.under.slots[0].end,hatchAt=f.s.pension.eggs[0].hatchAt;
    f.e.resumeUIClock(f.now());assert.equal(f.e.services.underground.started,started+60000);assert.equal(f.e.services.underground.tx.at,at+60000);
    assert.equal(f.s.under.slots[0].end,nativeEnd);assert.equal(f.s.pension.eggs[0].hatchAt,hatchAt);
});

const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

// The browser integration separately exercises native selectors and pointer events.
// These fixtures isolate launch confirmation, settlement identity and resume accounting.
function fixture(t,settings={}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};
    let clock=Date.UTC(2026,10,17,12);Date.now=()=>clock;
    const elements=new Map(),clicks=[],completed=[],failed=[],pages=[];
    const day=()=>H.parisDay(clock);
    const s={trainer:{id:'facility-v301'},money:10000,mons:[6,9,3,65,68,149].map((id,i)=>({uid:'m'+i,id,level:100,reg:'kanto'})),
        team:['m0','m1','m2','m3','m4','m5'],road:['m0','m1','m2','m3','m4','m5'],dex:{},items:{'rare-candy':30},stats:{},travel:{to:['johto','hoenn','sinnoh']},
        eventTeams:{candy:['m0','m1','m2','m3','m4','m5']},
        adv:{layout:H.DATA.layout,chapter:42,unlocked:65,node:0,runs:0,speed:4,loops:[],badges:['Maître','Maître Johto','Maître Hoenn'],gifts:{},deaths:{}},
        candy:{v:3,played:null,best:0,total:{},run:null,last:null},tower:{run:null,best:null,gift:null}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','facility-tab']]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const show=(selector,perform,extra={})=>{
        const classes=new Set(extra.classes||[]),el={isConnected:true,hidden:false,disabled:false,dataset:{},
            classList:{contains:key=>classes.has(key)},closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],
            querySelector:()=>null,querySelectorAll:()=>[],matches:()=>false,click:perform,...extra};
        elements.set(selector,el);return el;
    };
    global.document={hidden:false,querySelector:selector=>elements.get(selector)||null,querySelectorAll:selector=>elements.has(selector)?[elements.get(selector)]:[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));
    function install(e){
        e.schedule=()=>{};e.ensurePrepared=()=>false;
        e.driver.nav=page=>{pages.push(page);return true;};
        e.driver.click=(el,label)=>{if(!el||el.hidden||el.disabled)return false;clicks.push({el,label});el.click?.();return true;};
        e.automation.raidPage=page=>{pages.push(page);return true;};
        e.automation.done=message=>{completed.push(message);e.running=false;};
        e.automation.fail=message=>{failed.push(message);e.running=false;};
    }
    const e=new H.Engine(storage,{mode:'candy',raids:false,autoTeam:false,autoPrepare:false,optimizeRaid:false,autoEggs:false,...settings});
    e.loadAccount(s);e.read();e.running=true;e.started=clock;e.tabToken='facility-tab';e.automation.begin(s);install(e);
    show('#candy-root');show('#tower-root');show('#candy-root .cr-type [data-type]',null,{dataset:{type:'fire'}});
    function candyRun(floor=1,active=true){
        s.candy.run={day:day(),type:'normal',from:1,floor,ms:1000,at:clock,mons:s.mons.map(mon=>({...mon,uid:'c:'+mon.uid,src:mon.uid,xp:0})),got:{},skipPaid:0};
        s.adv.tower=active?{kind:'candy',back:s.adv.chapter}:null;save();return s.candy.run;
    }
    function towerRun(floor=1,active=true){
        s.tower.run={week:H.towerWeek?H.towerWeek(clock):new Date(Date.UTC(2026,10,16)).toISOString().slice(0,10),floor,ms:1000,mons:s.mons.slice(0,3).map(mon=>({...mon,uid:'t:'+mon.uid,src:mon.uid,xp:0})),log:[]};
        s.adv.tower=active?{back:s.adv.chapter}:null;save();return s.tower.run;
    }
    const settleCandy=(run,floor=run.floor-1)=>{s.candy.last={day:run.day,at:run.at,type:run.type,from:run.from,floor,ms:run.ms,got:{...run.got},team:run.mons.map(mon=>mon.src)};s.candy.run=null;s.adv.tower=null;s.candy.played=run.day;save();};
    return{s,e,storage,elements,clicks,completed,failed,pages,show,save,install,candyRun,towerRun,settleCandy,day,now:()=>clock,advance:ms=>clock+=ms,
        candy:()=>e.automation.candy(s,clock),tower:()=>e.automation.tower(s,clock)};
}

test('factory settings accept zero as unlimited floor and clamp quantities independently of tower settings',()=>{
    assert.equal(H.MODE_NAMES.candy,'糖果工厂');assert.equal(H.DEFAULTS.candyFloor,50);assert.equal(H.DEFAULTS.candyRuns,1);
    const low=H.normalizeSettings({mode:'candy',candyFloor:-9,candyRuns:0,towerFloor:70});
    assert.equal(low.mode,'candy');assert.equal(low.candyFloor,0);assert.equal(low.candyRuns,1);assert.equal(low.towerFloor,70);
    const high=H.normalizeSettings({candyFloor:5000,candyRuns:500});assert.equal(high.candyFloor,999);assert.equal(high.candyRuns,30);
});

test('ordinary tower preparation retains six allies rather than confusing its three opponents with team size',t=>{
    const f=fixture(t,{mode:'tower'}),context=H.battleContext(f.s,'tower',{floor:20});assert.equal(context.size,6);
});

test('historical factory best and an old settlement never finish a newly requested run',t=>{
    const f=fixture(t);f.s.candy.best=999;f.s.candy.last={day:'2026-11-16',at:1,floor:999,got:{}};
    f.show('#candy-root [data-cr-go]',null,{disabled:true});f.candy();
    assert.equal(f.completed.length,0);assert.equal(f.e.automation.state.candyDone||0,0);assert.equal(f.e.running,true);
});

test('factory launch waits for the native save instead of spending a second daily entry',t=>{
    const f=fixture(t);const go=f.show('#candy-root [data-cr-go]');
    f.candy();f.advance(1200);f.candy();f.advance(8000);f.candy();
    assert.equal(f.clicks.filter(action=>action.el===go).length,1);assert.equal(f.e.automation.state.candyDone||0,0);
    assert.ok(f.e.automation.state.candyLaunch);assert.equal(f.completed.length,0);
});

test('manual factory teams and unavailable editors never score the box',t=>{
    const f=fixture(t);
    for(let i=0;i<32;i++)f.s.mons.push({uid:'box'+i,id:i+1,level:85});
    H.clearTeamCache();
    f.show('#candy-root [data-cr-go]',null,{disabled:true});
    f.candy();
    f.e.settings.optimizeRaid=true;
    f.candy();
    assert.equal(f.e.teamSearch?.result,undefined);
    assert.equal(H.teamCacheStats().misses,0);
    assert.equal(f.clicks.length,0);
});

test('factory defers large teams, rejects changed candidates and uses the finished plan once',async t=>{
    const f=fixture(t,{optimizeRaid:true});
    for(let i=0;i<32;i++)f.s.mons.push({uid:'box'+i,id:i+1,level:85});
    const edit=f.show('#candy-root [data-cr-team]');
    f.candy();
    const first=f.e.teamSearch;assert.ok(first);assert.equal(f.clicks.length,0);
    f.s.mons.at(-1).level=99;
    f.candy();
    const fresh=f.e.teamSearch;assert.notEqual(fresh,first);assert.ok(fresh);
    for(let i=0;i<500&&!fresh.result&&!fresh.error;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ifError(fresh.error);assert.deepEqual(fresh.result.uids,H.candyPlan(f.s,f.e.settings,'fire').uids);
    f.candy();
    assert.equal(f.clicks.at(-1).el,edit);
    const own=f.e.driver.ownedDialog;assert.deepEqual(own.uids,fresh.result.uids);
    f.s.eventTeams.candy=[...own.uids];f.e.driver.recent.set(own.key,[...own.uids]);
    f.e.driver.ownedDialog=null;
    f.s.eventTeams.candy.pop();f.candy();assert.ok(f.e.teamSearch,'a manually edited factory party must be re-evaluated');
    f.e.cancelTeamSearch();f.s.eventTeams.candy=[...own.uids];f.show('#candy-root [data-cr-go]');
    H.clearTeamCache();f.candy();
    assert.ok(f.e.automation.state.candyLaunch);assert.equal(f.e.teamSearch,null);assert.equal(H.teamCacheStats().misses,0);
});

test('an unconfirmed factory launch stops rather than replaying the entry',t=>{
    const f=fixture(t);const go=f.show('#candy-root [data-cr-go]');f.candy();f.advance(16000);f.candy();
    assert.equal(f.clicks.filter(action=>action.el===go).length,1);assert.equal(f.e.automation.state.candyDone||0,0);assert.equal(f.e.running,false);
});

test('only the native daily lock suppresses factory visits and a same-day native reopening wins',t=>{
    const f=fixture(t);f.s.candy.played=f.day();
    f.candy();f.candy();
    assert.deepEqual(f.pages,['candy','candy'],'loading or an absent button is inconclusive');
    f.show('#candy-root [data-cr-timer]');f.candy();
    f.elements.delete('#candy-root [data-cr-timer]');f.pages.length=0;
    f.advance(6000);f.candy();
    assert.deepEqual(f.pages,[]);assert.equal(f.e.nextWake,H.nextParisReset(f.now()));
    const go=f.show('#candy-root [data-cr-go]');f.candy();
    assert.deepEqual(f.pages,['candy']);assert.equal(f.clicks.at(-1).el,go);
});

test('the first factory tick of a new Paris day ignores the previous lock',t=>{
    const f=fixture(t);f.s.candy.played=f.day();f.show('#candy-root [data-cr-timer]');
    f.candy();f.pages.length=0;f.advance(H.nextParisReset(f.now())-f.now());f.candy();
    assert.deepEqual(f.pages,['candy']);
});

test('factory floor is the next room and cannot count an unfinished target room',t=>{
    const f=fixture(t,{candyFloor:20});f.candyRun(20,true);const stop=f.show('#candy-root [data-cr-stop]');f.candy();
    assert.equal(f.clicks.some(action=>action.el===stop),false);assert.equal(f.completed.length,0);assert.equal(f.e.running,true);
});

test('an active factory follows the adventure screen without resubmitting its existing run',t=>{
    const f=fixture(t,{candyFloor:50});f.candyRun(11,true);const follow=f.show('#candy-root [data-cr-follow]'),go=f.show('#candy-root [data-cr-go]');f.candy();
    assert.ok(f.pages.includes('adventure'));assert.equal(f.clicks.some(action=>action.el===go),false);assert.equal(f.e.automation.state.candyLaunch,undefined);
    assert.equal(f.e.running,true);assert.equal(f.s.adv.tower.kind,'candy');
});

test('factory resumes an existing run below its floor target without buying skip layers',t=>{
    const f=fixture(t,{candyFloor:50});f.candyRun(11,false);
    const follow=f.show('#candy-root [data-cr-go]'),skip=f.show('#candy-root [data-cr-skip]');f.candy();
    assert.equal(f.clicks.filter(action=>action.el===follow).length,1);assert.equal(f.clicks.some(action=>action.el===skip),false);
    assert.equal(f.s.items['rare-candy'],30);assert.equal(f.e.budget.used,0);assert.equal(f.e.budget.spent,0);
});

test('factory banks at the first available camp at or above its target',t=>{
    const f=fixture(t,{candyFloor:12});const run=f.candyRun(16,false);
    const stop=f.show('#candy-root [data-cr-stop]',()=>f.settleCandy(run)),follow=f.show('#candy-root [data-cr-follow]');f.candy();
    assert.equal(f.clicks.filter(action=>action.el===stop).length,1);assert.equal(f.clicks.some(action=>action.el===follow),false);
    f.advance(1200);f.candy();assert.equal(f.e.automation.state.candyDone,1);assert.equal(f.completed.length,1);
});

test('unlimited factory mode does not stop at the rare-candy daily cap',t=>{
    const f=fixture(t,{candyFloor:0});const run=f.candyRun(101,false);run.got={'rare-candy':25,'exp-candy-big':10};
    const stop=f.show('#candy-root [data-cr-stop]'),follow=f.show('#candy-root [data-cr-go]');f.candy();
    assert.equal(f.clicks.filter(action=>action.el===follow).length,1);assert.equal(f.clicks.some(action=>action.el===stop),false);
});

test('factory defeat still completes the observed run once and retains its earned rewards',t=>{
    const f=fixture(t,{candyRuns:2});const run=f.candyRun(24,true);run.got={'exp-candy-xl':4};f.candy();f.settleCandy(run);f.advance(1200);f.candy();
    assert.equal(f.e.automation.state.candyDone,1);assert.equal(f.completed.length,0);
    f.advance(1200);f.candy();assert.equal(f.e.automation.state.candyDone,1);assert.equal(f.e.running,true);assert.deepEqual(f.s.candy.last.got,{'exp-candy-xl':4});
});

test('a different factory settlement cannot be credited to the observed run',t=>{
    const f=fixture(t,{candyRuns:2});const run=f.candyRun(7,true);f.candy();f.settleCandy(run);f.s.candy.last.at++;f.advance(1200);f.candy();
    assert.equal(f.e.automation.state.candyDone||0,0);assert.equal(f.completed.length,0);
});

test('a new factory run cannot inherit a previous observed run progress or completion authority',t=>{
    const f=fixture(t,{candyRuns:2});f.candyRun(21,true);f.candy();f.s.candy.run.at++;f.advance(1200);f.candy();
    assert.equal(f.e.automation.state.candyDone||0,0);assert.equal(f.e.running,false);assert.equal(f.completed.length,0);
});

test('a day-locked factory waits without submitting entry or stopping the task queue',t=>{
    const f=fixture(t);f.s.candy.played=f.day();const go=f.show('#candy-root [data-cr-go]',null,{disabled:true});f.candy();f.advance(6000);f.candy();
    assert.equal(f.clicks.some(action=>action.el===go),false);assert.equal(f.completed.length,0);assert.equal(f.failed.length,0);assert.equal(f.e.running,true);assert.ok(f.e.nextWake>f.now());
});

test('a native daily-entry control reopened by server reset overrides the local Paris-day estimate',t=>{
    const f=fixture(t);f.s.candy.played=f.day();const go=f.show('#candy-root [data-cr-go]');f.candy();
    assert.equal(f.clicks.filter(action=>action.el===go).length,1);assert.ok(f.e.automation.state.candyLaunch);
});

test('factory resume checkpoints preserve the observed run and resource budgets before settlement',t=>{
    const f=fixture(t,{candyRuns:2});const run=f.candyRun(11,false);f.e.budget.spent=120;f.e.budget.used=3;f.candy();f.save();f.e.persist();f.e.release();
    const next=new H.Engine(f.storage);next.loadAccount(f.s);next.schedule=()=>{};next.start(true);f.install(next);
    assert.equal(next.running,true);assert.equal(next.settings.mode,'candy');assert.equal(next.budget.spent,120);assert.equal(next.budget.used,3);
    f.settleCandy(run);next.automation.candy(f.s,f.now());assert.equal(next.automation.state.candyDone,1);assert.equal(next.budget.spent,120);assert.equal(next.budget.used,3);
});

test('a disabled tower launch button never consumes an attempt',t=>{
    const f=fixture(t,{mode:'tower'});f.show('#tower-root [data-tw-go]',null,{disabled:true});f.tower();
    assert.equal(f.e.automation.state.towerAttempts||0,0);assert.equal(f.clicks.length,0);
});

test('tower launch waits for a real run before consuming the attempt limit',t=>{
    const f=fixture(t,{mode:'tower',towerRuns:1});const go=f.show('#tower-root [data-tw-go]');f.tower();f.advance(1200);f.tower();f.advance(8000);f.tower();
    assert.equal(f.clicks.filter(action=>action.el===go).length,1);assert.equal(f.e.automation.state.towerAttempts||0,0);assert.ok(f.e.automation.state.towerLaunch);
});

test('an unconfirmed tower launch is not retried and does not spend an attempt',t=>{
    const f=fixture(t,{mode:'tower'});const go=f.show('#tower-root [data-tw-go]');f.tower();f.advance(16000);f.tower();
    assert.equal(f.clicks.filter(action=>action.el===go).length,1);assert.equal(f.e.automation.state.towerAttempts||0,0);assert.equal(f.e.running,false);
});

test('a suspended tower run is resumed without being counted as defeat',t=>{
    const f=fixture(t,{mode:'tower',towerRuns:1});f.towerRun(8,true);f.tower();f.s.adv.tower=null;
    const go=f.show('#tower-root [data-tw-go]');f.advance(1200);f.tower();
    assert.equal(f.e.automation.state.towerAttempts||0,0);assert.equal(f.failed.length,0);assert.equal(f.clicks.filter(action=>action.el===go).length,1);
});

test('confirmed tower disappearance counts one finished attempt, including after a pause',t=>{
    const f=fixture(t,{mode:'tower',towerRuns:3});f.towerRun(8,true);f.tower();f.s.adv.tower=null;f.advance(1200);f.tower();
    f.s.tower.run=null;f.advance(1200);f.tower();assert.equal(f.e.automation.state.towerAttempts,1);
    f.advance(1200);f.tower();assert.equal(f.e.automation.state.towerAttempts,1);
});

test('a tower target uses completed floors and does not quit during the target fight',t=>{
    const f=fixture(t,{mode:'tower',towerFloor:20});f.towerRun(20,true);const quit=f.show('#tower-root [data-tw-quit]');f.tower();
    assert.equal(f.clicks.some(action=>action.el===quit),false);assert.equal(f.completed.length,0);
});

test('week rollover discards old reached flags and attempts instead of completing the new week',t=>{
    const f=fixture(t,{mode:'tower',towerFloor:100,towerRuns:1});f.e.automation.state.towerWeek='2026-11-09';f.e.automation.state.towerReached=true;f.e.automation.state.towerAttempts=1;
    f.show('#tower-root [data-tw-go]',null,{disabled:true});f.tower();assert.equal(f.completed.length,0);assert.equal(f.failed.length,0);assert.equal(f.e.automation.state.towerReached,false);assert.equal(f.e.automation.state.towerAttempts,0);
});

test('ordinary tower rejects a live factory instead of mixing its attempt and floor counters',t=>{
    const f=fixture(t,{mode:'tower'});f.candyRun(51,true);f.tower();assert.equal(f.completed.length,0);assert.equal(f.e.automation.state.towerAttempts||0,0);assert.equal(f.e.running,false);
});

test('resuming a paused tower waits for activity confirmation even though its snapshot already exists',t=>{
    const f=fixture(t,{mode:'tower'});f.towerRun(8,false);const go=f.show('#tower-root [data-tw-go]');
    f.tower();for(let i=0;i<5;i++){f.advance(1200);f.tower();}
    assert.equal(f.clicks.filter(action=>action.el===go).length,1);assert.equal(f.e.automation.state.towerAttempts||0,0);
    assert.ok(f.e.automation.state.towerLaunch);f.s.adv.tower={back:42};f.advance(1200);f.tower();assert.equal(f.e.automation.state.towerLaunch,undefined);
});

test('a stale live tower exits through its native control before opening a fresh week',t=>{
    const f=fixture(t,{mode:'tower'});f.towerRun(30,true);f.s.tower.run.week='2000-01-03';
    const quit=f.show('#tower-root [data-tw-quit]'),go=f.show('#tower-root [data-tw-go]');f.tower();
    assert.equal(f.clicks.filter(action=>action.el===quit).length,1);assert.equal(f.clicks.some(action=>action.el===go),false);assert.equal(f.e.automation.state.towerAttempts||0,0);
});

test('completed weekly tower targets await a pending native gift before ending the task',t=>{
    const f=fixture(t,{mode:'tower',towerFloor:20});f.s.tower.best={week:H.towerWeek(f.now()),floor:20};f.s.tower.gift={items:[{kind:'bp',n:15}]};f.tower();
    assert.equal(f.completed.length,0);assert.match(f.e.status,/奖励/);f.s.tower.gift=null;f.advance(1200);f.tower();assert.equal(f.completed.length,1);
});

test('resuming an existing factory snapshot cannot spam go while the adventure state is delayed',t=>{
    const f=fixture(t);f.candyRun(12,false);const go=f.show('#candy-root [data-cr-go]');f.candy();
    for(let i=0;i<5;i++){f.advance(1200);f.candy();}assert.equal(f.clicks.filter(action=>action.el===go).length,1);
    f.s.adv.tower={kind:'candy',back:42};f.advance(1200);f.candy();assert.equal(f.e.automation.state.candyLaunch,undefined);assert.equal(f.e.automation.state.candyDone||0,0);
});

test('factory planning uses the banked camp target and a sensible baseline for unlimited runs',t=>{
    const f=fixture(t),rounded=H.candyPlan(f.s,{...f.e.settings,candyFloor:47},'fire'),unlimited=H.candyPlan(f.s,{...f.e.settings,candyFloor:0},'fire');
    assert.equal(rounded.context.floor,50);assert.equal(rounded.context.battleFloor,49);assert.equal(unlimited.context.floor,50);
});

test('a factory launched during manual preparation handoff keeps its daily cloned run',async t=>{
    const f=fixture(t);f.e.settings.autoPrepare=true;const run=f.candyRun(2,true),p={mode:'candy',context:{kind:'candy',reg:'hoenn'},phase:'train',targets:[],uids:['m0'],originalTeam:['m1'],originalLocation:{reg:'hoenn'},resume:{},phaseAt:f.now(),lastGrowth:f.now(),lastTick:f.now()};
    f.e.preparation=p;f.e.budget.spent=125;f.e.budget.used=2;await f.e.step(f.now());
    assert.equal(f.e.preparation,null);assert.equal(f.e.automation.state.candyPreparation,p);assert.equal(f.s.candy.run,run);assert.equal(f.e.budget.spent,125);assert.equal(f.e.budget.used,2);
    f.settleCandy(run,4);f.advance(1200);f.candy();assert.equal(f.e.automation.state.candyDone,1);assert.equal(f.e.preparation,p);assert.equal(p.phase,'restore');assert.equal(f.completed.length,0);
});

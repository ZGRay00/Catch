const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

test('Paris reset is exact across short and long expedition days and advances at midnight',()=>{
    for(const [start,end] of [
        ['2026-03-28T23:00:00Z','2026-03-29T22:00:00Z'],
        ['2026-10-24T22:00:00Z','2026-10-25T23:00:00Z'],
    ]){
        const first=Date.parse(start),next=Date.parse(end);
        assert.equal(H.nextParisReset(first),next);
        assert.equal(H.nextParisReset(next-1),next);
        assert.equal(H.nextParisReset(next),next+86400000);
        assert.equal(H.nextParisReset(first+12345),next);
    }
});

function fixture(t,settings={}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};let clock=Date.UTC(2026,10,17,12);
    Date.now=()=>clock;const nodes=new Map(),clicks=[],completed=[],failed=[],prepared=[];
    global.document={hidden:false,querySelector:selector=>(nodes.get(selector)||[])[0]||null,querySelectorAll:selector=>nodes.get(selector)||[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const s={trainer:{id:'underground-v320'},mons:[6,9,3,65,68,149].map((id,i)=>({uid:'m'+i,id,reg:'kanto',level:100})),
        team:['m3','m4','m5'],road:['m3','m4','m5'],dex:{},money:10000,items:{},stats:{},travel:{to:['johto','hoenn','sinnoh']},
        eventTeams:{'under:0':['m0','m1','m2']},under:{day:H.parisDay(clock),sent:0,used:{},slots:[],geodes:[0,0,0,0]},
        adv:{layout:H.DATA.layout,chapter:48,unlocked:65,node:0,runs:0,speed:4,loops:[],badges:['Forêt'],gifts:{},deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','under-tab']]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const e=new H.Engine(storage,{mode:'underground',autoPrepare:false,autoTeam:false,optimizeRaid:false,underOpenGeodes:false,raids:false,autoEggs:false,...settings});
    e.loadAccount(s);e.read();e.running=true;e.started=clock;e.tabToken='under-tab';e.schedule=()=>{};e.automation.begin(s);
    e.driver.nav=()=>true;e.ensurePrepared=(_s,context)=>{prepared.push(context);return false;};
    e.driver.click=(el,label)=>{if(!el||el.hidden||el.disabled||el.reject)return false;clicks.push({el,label});el.perform?.();return true;};
    e.automation.done=message=>{completed.push(message);e.running=false;};e.automation.fail=message=>{failed.push(message);e.running=false;};
    const show=(selector,dataset={},extra={})=>{const el={isConnected:true,hidden:false,disabled:false,dataset,closest:()=>null,getClientRects:()=>[{}],getAttribute:()=>null,classList:{contains:()=>false},...extra};nodes.set(selector,[...(nodes.get(selector)||[]),el]);return el;};
    const job=(id='expedition',bay=0,end=clock+60000,uids=['m0','m1','m2'])=>({id,bay,start:clock-1000,end,team:uids,mons:uids.map(uid=>({...s.mons.find(mon=>mon.uid===uid)}))});
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));
    return{s,e,storage,nodes,clicks,completed,failed,prepared,show,job,save,now:()=>clock,advance:ms=>clock+=ms,tick:()=>e.automation.underground(s,clock)};
}

test('underground daily limits match native expansion bonuses and reset by Paris day',()=>{
    const now=Date.UTC(2026,10,17,12),day=H.parisDay(now);
    for(const [extra,perDay,capacity]of [[0,8,1],[1,9,2],[2,10,3],[3,12,4],[99,12,4]]){
        const status=H.undergroundStatus({under:{day,sent:5,extra,slots:[]}},now);
        assert.equal(status.perDay,perDay);assert.equal(status.capacity,capacity);assert.equal(status.left,perDay-5);assert.ok(status.nextReset>now);
    }
    const old=H.undergroundStatus({under:{day:'2026-11-16',sent:12,extra:3,slots:[]}},now);assert.equal(old.sent,0);assert.equal(old.left,12);
});
test('underground readiness distinguishes returned, recalled and still-running teams',()=>{
    const now=Date.UTC(2026,10,17,12),ready={id:'done',end:now},recalled={id:'recall',end:now+1e6,recalled:now-1},running={id:'run',end:now+60000};
    const status=H.undergroundStatus({under:{slots:[ready,recalled,running,{id:'unknown'}]}},now);
    assert.deepEqual(status.ready,[ready,recalled]);assert.equal(status.running.length,2);assert.equal(status.nextReturn,running.end);assert.equal(status.capacity,4);
});

test('a spent daily quota avoids page visits until reset while a newly free dispatch can proceed',t=>{
    const f=fixture(t,{underRuns:3}),pages=[];
    f.e.automation.page=screen=>{pages.push(screen);return false;};
    f.s.under.sent=8;f.tick();f.advance(6000);f.tick();
    assert.deepEqual(pages,[]);assert.equal(f.e.nextWake,H.nextParisReset(f.now()));
    f.s.under.extra=1;f.tick();assert.deepEqual(pages,['underground']);
    f.s.under.extra=0;pages.length=0;f.advance(H.nextParisReset(f.now())-f.now());f.tick();
    assert.deepEqual(pages,['underground']);
});

test('exhausted dispatches can still collect an early recall and show the sooner reset when bays remain',t=>{
    const f=fixture(t,{underRuns:3}),reset=H.nextParisReset(f.now()),pages=[];
    const slot=f.job('late',0,reset+120000);f.s.under.extra=1;f.s.under.sent=9;f.s.under.slots=[slot];
    f.e.automation.page=screen=>{pages.push(screen);return false;};
    f.tick();assert.deepEqual(pages,[]);assert.equal(f.e.nextWake,reset);
    f.e.settings.mode='money';
    assert.equal(H.taskExecutionState(f.s,f.e,f.now()).services.find(row=>row.id==='underground').nextAt,reset);
    f.e.settings.mode='underground';slot.recalled=f.now();f.tick();
    assert.deepEqual(pages,['underground']);
});
test('visible bay allocation matches native explicit, old, duplicate and out-of-range slots',()=>{
    const a={id:'a',bay:2},b={id:'b'},c={id:'c',bay:2},d={id:'d',bay:99},s={under:{extra:3,slots:[a,b,c,d]}};
    assert.equal(H.undergroundBay(s,2),a);assert.equal(H.undergroundBay(s,0),b);assert.equal(H.undergroundBay(s,1),c);assert.equal(H.undergroundBay(s,3),d);
    assert.equal(H.undergroundBay(s,-1),null);assert.equal(H.undergroundBay(s,'not-a-slot'),null);
});
test('dispatch clicks only once while native simulation and save confirmation are pending',t=>{
    const f=fixture(t),go=f.show('#ug-root [data-ug-go]',{ugGo:'0'});f.tick();f.advance(8000);f.tick();f.advance(70000);f.tick();
    assert.equal(f.clicks.filter(action=>action.el===go).length,1);assert.ok(f.e.automation.state.underLaunch);assert.equal(f.failed.length,0);assert.equal(f.e.automation.state.underDone||0,0);
});
test('a dispatch without a native saved expedition stops rather than retrying the daily entry',t=>{
    const f=fixture(t),go=f.show('#ug-root [data-ug-go]',{ugGo:'0'});f.tick();f.advance(120001);f.tick();
    assert.equal(f.clicks.filter(action=>action.el===go).length,1);assert.equal(f.failed.length,1);assert.match(f.failed[0],/重复派遣/);
});
test('a new saved expedition confirms dispatch and waits for its actual return',t=>{
    const f=fixture(t);f.show('#ug-root [data-ug-go]',{ugGo:'0'});f.tick();const run=f.job();f.s.under.slots=[run];f.s.under.sent=1;f.tick();
    assert.equal(f.e.automation.state.underLaunch,undefined);assert.equal(f.e.nextWake,run.end);assert.equal(f.clicks.length,1);
});
test('an existing expedition in a different bay cannot confirm a new dispatch',t=>{
    const f=fixture(t,{underRuns:2});f.s.under.extra=1;f.s.under.slots=[f.job('old',1)];f.show('#ug-root [data-ug-go]',{ugGo:'0'});f.tick();f.tick();
    assert.ok(f.e.automation.state.underLaunch);assert.equal(f.clicks.length,1);assert.equal(f.failed.length,0);
});
test('a failed collect click creates no receipt transaction and never increments the count',t=>{
    const f=fixture(t);f.s.under.slots=[f.job('ready',0,f.now()-1)];f.show('#ug-root [data-ug-take]',{ugTake:'0'},{reject:true});f.tick();
    assert.equal(f.e.automation.state.underCollect,undefined);assert.equal(f.e.automation.state.underDone||0,0);assert.equal(f.completed.length,0);
});
test('collection maps the visible bay to its real expedition, not the slot array index',t=>{
    const f=fixture(t);f.s.under.extra=1;f.s.under.slots=[f.job('bay-one',1,f.now()-1),f.job('bay-zero',0,f.now()-1)];f.show('#ug-root [data-ug-take]',{ugTake:'0'});f.tick();
    assert.equal(f.e.automation.state.underCollect.id,'bay-zero');assert.equal(f.e.automation.owner.selector,'.ug-back');assert.equal(f.e.automation.state.underDone||0,0);
});
test('removing an expedition alone cannot count a collection before all original members return',t=>{
    const f=fixture(t),run=f.job('ready',0,f.now()-1);f.s.mons=f.s.mons.filter(mon=>!run.team.includes(mon.uid));f.s.under.slots=[run];f.show('#ug-root [data-ug-take]',{ugTake:'0'});f.tick();f.s.under.slots=[];f.tick();
    assert.equal(f.e.automation.state.underDone||0,0);assert.equal(f.completed.length,0);
    f.s.mons.push(...run.mons);f.tick();assert.equal(f.e.automation.state.underDone,1);assert.equal(f.e.automation.state.underCollect,undefined);assert.equal(f.completed.length,1);
});
test('unconfirmed collection does not double-click or invent a completed run',t=>{
    const f=fixture(t);f.s.under.slots=[f.job('ready',0,f.now()-1)];f.show('#ug-root [data-ug-take]',{ugTake:'0'});f.tick();f.advance(16000);f.tick();
    assert.equal(f.clicks.length,1);assert.equal(f.failed.length,1);assert.equal(f.e.automation.state.underDone||0,0);
});
test('returned expeditions are collected even when the daily dispatch quota is exhausted',t=>{
    const f=fixture(t);f.s.under.sent=8;f.s.under.slots=[f.job('ready',0,f.now()-1)];const take=f.show('#ug-root [data-ug-take]',{ugTake:'0'});f.show('#ug-root [data-ug-go]',{ugGo:'0'});f.tick();
    assert.equal(f.clicks.length,1);assert.equal(f.clicks[0].el,take);assert.equal(f.prepared.length,0);
});
test('daily exhaustion waits for the exact reset before opening any team picker or training',t=>{
    const f=fixture(t,{optimizeRaid:true});f.s.under.sent=8;f.show('[data-ug-slot]',{ugSlot:'0.0'});f.show('#ug-root [data-ug-go]',{ugGo:'0'});f.tick();
    assert.equal(f.clicks.length,0);assert.equal(f.prepared.length,0);assert.equal(f.e.nextWake,H.nextParisReset(f.now()));assert.match(f.e.status,/次数已用完/);
});
test('full slots and already-dispatched target totals do not trigger a surplus expedition',t=>{
    const f=fixture(t,{underRuns:1});f.s.under.extra=3;f.s.under.slots=[f.job()];f.show('#ug-root [data-ug-go]',{ugGo:'1'});f.tick();
    assert.equal(f.clicks.length,0);assert.equal(f.prepared.length,0);assert.ok(f.e.nextWake>f.now());
});
test('actual bay team drives preparation and manual adventure members remain outside the special plan',t=>{
    const f=fixture(t);f.show('#ug-root [data-ug-go]',{ugGo:'0'});f.tick();assert.equal(f.prepared.length,1);assert.equal(f.prepared[0].slot,0);
    const plan=H.preparationPlan(f.s,f.e.settings,f.prepared[0]);assert.deepEqual(plan.members.map(mon=>mon.uid),['m0','m1','m2']);assert.deepEqual(f.s.team,['m3','m4','m5']);
});
test('the chosen starting floor must be an available native option within the user limit',t=>{
    const f=fixture(t,{underFrom:70}),changes=[];f.show('#ug-root [data-ug-go]',{ugGo:'0'});const select=f.show('#ug-root [data-ug-from="0"]',{}, {value:'1',options:[1,25,50,75].map(value=>({value:String(value)})),dispatchEvent:event=>changes.push(event.type)});f.tick();
    assert.equal(select.value,'50');assert.deepEqual(changes,['change']);assert.equal(f.clicks.length,0);assert.equal(f.prepared.length,0);
});
test('a partial native floor menu cannot spend a dispatch at the wrong starting floor',t=>{
    const f=fixture(t,{underAutoStart:false,underFrom:75});f.s.under.best=129;
    f.show('#ug-root [data-ug-go]',{ugGo:'0'});
    const select=f.show('#ug-root [data-ug-from="0"]',{}, {value:'1',options:[{value:'1'}],dispatchEvent:()=>{}});
    f.tick();assert.equal(f.clicks.length,0);assert.equal(f.prepared.length,0);
    select.options.push({value:'75'});f.tick();assert.equal(select.value,'75');assert.equal(f.clicks.length,0);
});
test('saved checkpoints unlock exactly at the four expedition milestones and stop at 100',()=>{
    for(const [best,target]of [[0,1],[24,1],[25,25],[49,25],[50,50],[74,50],[75,75],[99,75],[100,100],[125,100],[300,100]]){
        const status=H.undergroundStatus({under:{best}});
        assert.equal(H.undergroundStartFloor(H.DEFAULTS,status.startFloors),target);
    }
});
test('legacy floor preferences migrate through account load, queue settings and explicit first-floor selection',t=>{
    assert.equal(H.normalizeSettings({underFrom:1}).underAutoStart,true);
    assert.equal(H.normalizeSettings({underFrom:70}).underAutoStart,false);
    const legacy=H.normalizeJobs([{settings:{mode:'underground',underFrom:50}}]);
    assert.equal(legacy[0].settings.underAutoStart,false);
    const f=fixture(t);f.storage.setItem('pokecatch-helper:v1:'+f.e.account,JSON.stringify({settings:{underFrom:75}}));
    f.e.loadAccount(f.s);assert.equal(f.e.settings.underAutoStart,false);assert.equal(f.e.settings.underFrom,75);
    const manual=H.normalizeSettings({underFrom:1,underAutoStart:false});
    assert.equal(H.undergroundStartFloor(manual,[1,25,50]),1);
    assert.equal(H.normalizeSettings({underFrom:25,underAutoStart:true}).underAutoStart,true);
});
test('automatic standalone expeditions use freshly rendered options, wait after changing and send once from the confirmed bay',t=>{
    const f=fixture(t),changes=[],go=f.show('#ug-root [data-ug-go]',{ugGo:'0'});f.s.under.best=99;
    f.tick();assert.equal(f.clicks.length,0);assert.match(f.e.status,/起始楼层/);
    const select=f.show('#ug-root [data-ug-from="0"]',{}, {value:'1',options:[{value:'1'},{value:'50'},{value:'75',disabled:true}],dispatchEvent:event=>changes.push(event.type)});
    f.tick();assert.equal(select.value,'50');assert.equal(f.clicks.length,0);
    select.options.push({value:'75'});f.tick();assert.equal(select.value,'75');assert.deepEqual(changes,['change','change']);
    f.tick();f.tick();assert.equal(f.clicks.filter(action=>action.el===go).length,1);
    assert.deepEqual(f.e.automation.state.underLaunch.uids,f.s.eventTeams['under:0']);assert.match(f.clicks[0].label,/75/);
});
test('underground preparation follows the selected bay theme and first guard rather than the adventure chapter or level 100',t=>{
    const f=fixture(t);f.s.under.next=['flooded','crystal'];
    const a=H.battleContext(f.s,'under',{slot:1,floor:25}),b=H.battleContext(f.s,'under',{slot:0,floor:100});
    assert.equal(a.slot,1);assert.equal(a.floor,25);assert.equal(a.level,50);assert.equal(b.level,99);
    assert.ok(a.foes.some(foe=>foe.statMult===2));assert.ok(a.foes.every(foe=>H.MONS.get(foe.id).types.some(type=>['ice','psychic','steel'].includes(type))));
    f.s.adv.chapter=7;assert.deepEqual(H.battleContext(f.s,'under',{slot:1,floor:25}).foes,a.foes);
    const {foes,...snapshot}=a;assert.deepEqual(H.rebuildPreparationContext(f.s,snapshot).foes,foes);
});
test('a new expedition in the same bay with different members cannot confirm this task send',t=>{
    const f=fixture(t);f.show('#ug-root [data-ug-go]',{ugGo:'0'});f.tick();
    f.s.under.slots=[f.job('other',0,f.now()+60000,['m3','m4','m5'])];f.tick();
    assert.ok(f.e.automation.state.underLaunch);assert.equal(f.clicks.length,1);
});
test('a single geode uses its own button when native UI has no open-all control',t=>{
    const f=fixture(t,{underOpenGeodes:true});f.e.automation.state.underDone=1;f.s.under.geodes=[1,0,0,0];const single=f.show('#ug-root [data-ug-geode]',{ugGeode:'0'});f.tick();
    assert.equal(f.clicks.length,1);assert.equal(f.clicks[0].el,single);assert.equal(f.completed.length,0);assert.equal(f.e.budget.used,1);
});
test('a geode batch larger than the remaining budget opens only one existing geode',t=>{
    const f=fixture(t,{underOpenGeodes:true,useBudget:1});f.e.automation.state.underDone=1;f.s.under.geodes=[2,0,0,0];const all=f.show('#ug-root [data-ug-all]'),single=f.show('#ug-root [data-ug-geode]',{ugGeode:'0'});f.tick();
    assert.equal(f.clicks[0].el,single);assert.notEqual(f.clicks[0].el,all);assert.equal(f.e.budget.used,1);
});
test('geode inventory without a ready UI waits instead of reporting the task complete',t=>{
    const f=fixture(t,{underOpenGeodes:true});f.e.automation.state.underDone=1;f.s.under.geodes=[1,0,0,0];f.tick();
    assert.equal(f.completed.length,0);assert.equal(f.clicks.length,0);assert.ok(f.e.nextWake>f.now());assert.match(f.e.status,/晶洞/);
});

test('expedition goals survive queue normalization and change both scoring and the plan cache',t=>{
    const f=fixture(t),s=f.s,planner=f.e.automation;
    assert.equal(H.normalizeSettings({underGoal:'unknown'}).underGoal,'depth');
    assert.equal(H.normalizeJobs([{settings:{mode:'underground',underGoal:'money'}}])[0].settings.underGoal,'money');
    s.under.next=['crystal'];
    const team=s.mons.slice(0,3),first=planner.undergroundPlan(s,0,25,team,f.now());
    assert.equal(first,planner.undergroundPlan(s,0,25,team,f.now()));
    const depth=H.undergroundTeamContext(s,{underGoal:'depth'},0,25,team);
    assert.equal(depth.objective,'underDepth');
    assert.ok(depth.foes.some(m=>m.guard)&&depth.foes.some(m=>!m.guard));
    assert.ok(depth.foes.every(m=>Number.isFinite(m.weight)&&m.weight>0));
    f.e.settings.underGoal='money';
    assert.equal(H.undergroundTeamContext(s,f.e.settings,0,25,team).objective,'underMoney');
    const key=planner.undergroundPlanKey(s,0,25,team);
    assert.notEqual(key,first.key);
    assert.notEqual(key,planner.undergroundPlanKey(s,0,50,team));
    s.under.next=['dark'];assert.notEqual(key,planner.undergroundPlanKey(s,0,25,team));
});
test('dedicated dispatch fills a disabled bay by exact UID, respects another bay and rechecks before sending',t=>{
    const f=fixture(t,{optimizeRaid:true}),s=f.s;
    s.under.extra=1;s.under.next=['crystal','dark'];s.eventTeams={'under:0':[],'under:1':['m3','m4','m5']};
    const go=f.show('#ug-root [data-ug-go]',{ugGo:'0'},{disabled:true}),edit=f.show('[data-ug-slot]',{ugSlot:'0.0'});
    f.save();f.tick();
    assert.equal(f.clicks[0].el,edit);
    const own=f.e.driver.ownedDialog;assert.equal(own.type,'underTeam');assert.deepEqual(own.uids,['m0','m1','m2']);
    f.e.driver.ownedDialog=null;s.eventTeams['under:0']=[...own.uids];go.disabled=false;f.save();
    f.e.ensurePrepared=()=>{f.e.read=()=>({...s,under:{...s.under,used:{m1:1}}});return false;};
    f.tick();assert.equal(f.clicks.length,1);assert.equal(f.e.automation.state.underLaunch,undefined);
    f.e.read=()=>s;f.e.ensurePrepared=()=>false;f.tick();f.tick();
    assert.equal(f.clicks.filter(c=>c.el===go).length,1);
});
test('dedicated dispatch keeps the planned team, current road and Buddy when a reserve trio is available',t=>{
    const f=fixture(t,{optimizeRaid:true}),s=f.s;
    const member=(uid,id)=>({uid,id,level:75,reg:'sinnoh'});
    s.mons.push(member('buddy',25),member('road',94),member('other-bay',483),member('used',248));
    s.road=['road',...s.team];s.buddy={uid:'buddy'};s.under.extra=1;s.under.used={used:1};
    s.eventTeams={'under:0':[],'under:1':['other-bay']};
    const edit=f.show('[data-ug-slot]',{ugSlot:'0.0'});f.show('#ug-root [data-ug-go]',{ugGo:'0'},{disabled:true});
    f.save();f.tick();
    assert.equal(f.clicks[0].el,edit);
    assert.deepEqual(f.e.driver.ownedDialog?.uids,['m0','m1','m2']);
    assert.deepEqual(s.team,['m3','m4','m5']);assert.equal(s.buddy.uid,'buddy');
});
test('dedicated dispatch can use party members when three apparent reserves cannot enter together',t=>{
    const f=fixture(t,{optimizeRaid:true}),s=f.s;
    [s.mons[0].id,s.mons[1].id,s.mons[2].id]=[643,646,25];
    s.eventTeams={'under:0':[]};
    f.show('[data-ug-slot]',{ugSlot:'0.0'});f.show('#ug-root [data-ug-go]',{ugGo:'0'},{disabled:true});
    let initial;
    f.e.automation.undergroundPlan=(_s,_slot,_floor,pool)=>{initial=pool.map(mon=>mon.uid);return {key:'fixture',uids:['m0','m2','m3']};};
    f.save();f.tick();
    assert.deepEqual(initial,['m0','m1','m2','m3','m4','m5']);
    assert.deepEqual(f.e.driver.ownedDialog?.uids,['m0','m2','m3']);
});
test('underground plans honor picker identities and mutually exclusive forms even on the three-member fast path',t=>{
    const f=fixture(t),ids=[643,646,25],pool=ids.map((id,i)=>({...f.s.mons[i],id}));
    assert.deepEqual(f.e.automation.undergroundPlan(f.s,0,1,pool,f.now()).uids,[]);
    pool[1].id=643;assert.deepEqual(f.e.automation.undergroundPlan(f.s,0,1,pool,f.now()).uids,[]);
    pool[0].id=25;pool[1].id=6;pool[2].shiny=true;
    assert.equal(f.e.automation.undergroundPlan(f.s,0,1,pool,f.now()).uids.length,3);
    const large=[...pool,{...pool[0],uid:'strong1',id:643},{...pool[0],uid:'strong2',id:646}];
    f.s.under.next=['dark'];const ctx=H.undergroundTeamContext(f.s,H.DEFAULTS,0,100,large);
    const plan=H.planAdventureTeam({...f.s,mons:large,team:[]},H.DEFAULTS,[],ctx);
    assert.equal(plan.uids.length,3);assert.ok(!['strong1','strong2'].every(uid=>plan.uids.includes(uid)));
});

test('completed small-box search matches all twenty trios on both objectives',t=>{
    const f=fixture(t),pool=f.s.mons,s={...f.s,team:[],road:[],under:{...f.s.under,next:['crystal']}};
    for(const goal of ['depth','money']){
        const ctx=H.undergroundTeamContext(s,{underGoal:goal},0,100,pool);
        const chosen=H.planAdventureTeam(s,H.DEFAULTS,[],ctx);
        let best=0;
        for(let i=0;i<4;i++)for(let j=i+1;j<5;j++)for(let k=j+1;k<6;k++){
            const trio=[pool[i],pool[j],pool[k]];
            const trial=H.planAdventureTeam(s,H.DEFAULTS,trio.map(mon=>mon.uid),{...ctx,pool:trio});
            best=Math.max(best,trial.score);
        }
        assert.ok(Math.abs(chosen.score-best)<1e-8);
        assert.equal(chosen.uids.length,3);
    }
});

test('two expeditions reserve active and unclaimed members across the daily reset',t=>{
    const {s,now}=fixture(t),time=now(),sample=s.mons.slice(0,4);
    s.under.day=H.parisDay(time-86400000);s.under.used={[sample[3].uid]:1};
    s.under.slots=[{bay:0,team:[sample[0].uid],end:time+60000},{bay:1,mons:[sample[1]],end:time-1000}];
    const eligible=()=>H.undergroundMembers(s,time).map(mon=>mon.uid);
    assert.ok(!eligible().includes(sample[0].uid)&&!eligible().includes(sample[1].uid));
    assert.ok(eligible().includes(sample[2].uid)&&eligible().includes(sample[3].uid));
    s.under.slots.pop();s.under.day=H.parisDay(time);s.under.used={[sample[1].uid]:1};
    assert.ok(!eligible().includes(sample[1].uid));
    assert.ok(s.mons.includes(sample[1]),'an already used and returned Pokémon remains eligible for adventure');
});

test('depth selection uses a deeper demonstrated guard while income keeps the same probes',t=>{
    const {s}=fixture(t),pool=s.mons.map(mon=>({...mon,level:100}));s.under.next=['crystal'];
    const build=underGoal=>H.undergroundTeamContext(s,{underGoal},0,100,pool);
    const original=build('depth'),income=build('money');
    s.under.best=150;
    const deep=build('depth');
    const strongestGuard=ctx=>Math.max(...ctx.foes.filter(foe=>foe.guard).map(foe=>foe.statMult));
    assert.ok(strongestGuard(deep)>strongestGuard(original));
    assert.deepEqual(build('money').foes,income.foes);
});

for(const goal of ['depth','money']){
    test('budgeted expedition seeds are competitive even with equal levels and birds first: '+goal,t=>{
        const f=fixture(t,{underGoal:goal}),s=f.s;
        const ids=[18,17,16,...Array.from({length:80},(_,i)=>i+20),150,382,483];
        const pool=ids.map((id,i)=>({uid:'u'+i,id,reg:'sinnoh',level:100}));
        Object.assign(s,{mons:pool,team:[],road:[]});s.under.next=['crystal'];s.adv.unlocked=83;
        const planner=f.e.automation,ctx=H.undergroundTeamContext(s,f.e.settings,0,100,pool);
        const score=team=>H.planAdventureTeam(s,f.e.settings,team.map(mon=>mon.uid),{...ctx,pool:team}).score;
        // Stop at the first legal checkpoint just as a severely constrained device can.
        f.e.evaluateTeamSearch=(_key,steps)=>{
            for(const part of steps)if(part?.uids)return {...part,limited:true};
            assert.fail('no budget checkpoint');
        };
        const plan=planner.undergroundPlan(s,0,100,pool,f.now());
        const trio=plan.uids.map(uid=>pool.find(mon=>mon.uid===uid));
        assert.equal(trio.length,3);
        assert.ok(score(trio)>score(pool.slice(0,3)),'improves the original bird trio using the full expedition objective');
        assert.ok(trio.some(mon=>[150,382,483].includes(mon.id)));
        planner.lastUnderPlan=null;
        assert.deepEqual(planner.undergroundPlan(s,0,100,[...pool].reverse(),f.now()).uids,plan.uids);
        // Same-family members remain legal if those are actually the available picks.
        assert.deepEqual(planner.undergroundPlan(s,0,100,pool.slice(0,3),f.now()).uids,pool.slice(0,3).map(mon=>mon.uid));
        assert.match(f.e.logs[0].text,/盒中传说\/幻之 3 只，可派 0 只/);
    });
}

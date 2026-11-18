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

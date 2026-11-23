const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const preparationTick=require('./fixtures/pokecatch-preparation-tick.cjs');

function fixture(t,mode='progress'){
    const before=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
    const now=Date.now(),s={trainer:{id:'frontier-training-flow'},money:10000,mons:[289,282,330,257,310,275].map((id,i)=>({uid:'h'+i,id,level:[69,68,69,71,71,69][i],reg:'hoenn',xp:0})),team:[],road:[],dex:{},items:{},stats:{},travel:{to:['johto','hoenn']},link:{to:'hoenn',side:'to'},
        adv:{layout:H.DATA.layout,chapter:41,unlocked:42,node:35,runs:10,speed:4,loops:[41],badges:[],gifts:{},deaths:{}}};
    s.team=s.mons.map(m=>m.uid);s.road=[...s.team];const data=new Map([['pokecatch-tab','frontier-tab']]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    const e=new H.Engine(storage,{mode,progressUntil:65,trainUid:'team',trainLevel:72,autoPrepare:mode==='progress',autoTeam:false,raids:false,trainBuddy:false,trainBuff:false,moneyBuff:false,progressCandy:false});e.loadAccount(s);e.running=true;e.started=now;e.tabToken='frontier-tab';e.nextRaid=Infinity;e.schedule=()=>{};e.read();e.trainProtected=[...s.team];
    const mapped=[];Object.assign(e.driver,{animations:()=>false,dismissInformation:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false,nav:()=>true,map:row=>{mapped.push(row.id);s.adv.chapter=row.id;s.adv.node=0;s.adv.battle=null;s.adv.pending=null;s.adv.loops=[row.loop];save();return true;}});
    const row={...H.DATA.chapters[41],key:'41',members:[41]};e.target=row;e.visit={started:now-31000,deaths:0};
    let p;
    if(mode==='progress'){
        p={mode,context:{kind:'progress',key:'progress:42',id:42,reg:'hoenn',label:'冠军之路'},resume:{},targets:s.mons.filter(m=>m.level<72).map(m=>({uid:m.uid,id:m.id,goal:72})),uids:[...s.team],originalTeam:[...s.team],originalLocation:row,
            phase:'train',phaseAt:now,started:now,lastTick:now,lastGrowth:now,frontier:42,avoid:{},route:row,visit:{at:now-31000,deaths:0},routeCheck:now-31000};e.preparation=p;
    }
    return{s,e,p,now,mapped,save};
}

test('resuming the screenshot preparation moves from Rain Badge to the open Victory Road while retaining its level and story goals',async t=>{
    const {s,e,p,now,mapped}=fixture(t);p.routeCheck=now;p.routeProfile=e.coach.reviewDifficulty(s,p,now);e.manualInput(now);e.inputHeld=true;e.resumeManual(now+1000);await preparationTick(e,()=>e.step(now+1200));
    assert.equal(e.manual,null);assert.equal(p.phase,'travel');await preparationTick(e,()=>e.step(now+2400));assert.equal(p.phase,'train');assert.deepEqual(mapped,[42]);assert.equal(p.route.id,42);
    assert.equal(e.settings.progressUntil,65);assert.ok(p.targets.every(m=>m.goal===72));assert.equal(s.adv.chapter,42);e.stop();
});

test('standalone training also chooses the open latest map instead of retaining the older route',async t=>{
    const {s,e,now,mapped}=fixture(t,'train');await e.step(now);assert.equal(e.driver.pendingMap?.row.id,42);await e.step(now+1200);
    assert.deepEqual(mapped,[42]);assert.equal(e.target.id,41);
    await e.step(now+2400);assert.equal(e.target.id,42);assert.equal(e.settings.trainLevel,72);assert.equal(s.adv.chapter,42);e.stop();
});

test('a mature measurement on the previous gym does not exclude an efficient unmeasured frontier',async t=>{
    const {s,e,p,now}=fixture(t),row=H.preparationRoutes(s,e.settings,p,e.metrics,now).find(r=>r.id===41);
    e.metrics[H.metricsKey(s,row,e.settings,now)]={xp:row.estimatedRate,xpSeconds:60,xpRuns:2,at:now};await preparationTick(e,()=>e.step(now));
    assert.equal(p.phase,'travel');await preparationTick(e,()=>e.step(now+1200));assert.equal(p.route.id,42);e.stop();
});

test('a route upgrade waits for the native boss fight to finish before entering the latest map',async t=>{
    const {s,e,p,now,mapped,save}=fixture(t);s.adv.battle={steps:1,enemies:[{id:340,level:67,hp:100}]};save();await preparationTick(e,()=>e.step(now));
    assert.equal(p.phase,'train');assert.deepEqual(mapped,[]);s.adv.battle=null;save();await preparationTick(e,()=>e.step(now+1200));assert.equal(p.phase,'travel');await preparationTick(e,()=>e.step(now+2400));assert.deepEqual(mapped,[42]);e.stop();
});

test('an unresolved native gift does not get interrupted to enter the frontier training map',async t=>{
    const {s,e,p,now,mapped,save}=fixture(t);s.adv.pending={type:'gift',gift:{choices:[1,4,7]}};save();await preparationTick(e,()=>e.step(now));assert.equal(p.phase,'train');assert.deepEqual(mapped,[]);
    s.adv.pending=null;save();await preparationTick(e,()=>e.step(now+1200));assert.equal(p.phase,'travel');e.stop();
});

test('the latest-map upgrade waits for the actual road party rather than using the planned carrier roster',async t=>{
    const {s,e,p,now,mapped,save}=fixture(t);s.road=['h4'];save();await preparationTick(e,()=>e.step(now));assert.equal(p.phase,'train');assert.deepEqual(mapped,[]);assert.match(e.status,/等待治疗点上阵/);
    s.road=[...s.team];save();await preparationTick(e,()=>e.step(now+1200));assert.equal(p.phase,'travel');await preparationTick(e,()=>e.step(now+2400));assert.deepEqual(mapped,[42]);e.stop();
});

test('a failed frontier stays avoided until its cooldown expires, then becomes eligible for upgrade again',async t=>{
    const {s,e,p,now,mapped}=fixture(t);p.avoid['42']=now+600000;await preparationTick(e,()=>e.step(now));assert.equal(p.phase,'train');assert.deepEqual(mapped,[]);
    await preparationTick(e,()=>e.step(now+600001));assert.equal(p.phase,'travel');await preparationTick(e,()=>e.step(now+601201));assert.deepEqual(mapped,[42]);assert.equal(e.settings.progressUntil,65);e.stop();
});

test('clearing the original story frontier while training returns to the next story goal without waiting for every member to reach 72',async t=>{
    const {s,e,p,now,save}=fixture(t);s.adv.chapter=42;p.route={...H.DATA.chapters[42],key:'42',members:[42]};s.adv.unlocked=43;save();await preparationTick(e,()=>e.step(now));
    assert.notEqual(e.preparation,p);assert.equal(e.settings.progressUntil,65);assert.match(e.status,/原关卡已通过/);assert.ok(s.mons.some(m=>m.level<72));
    await preparationTick(e,()=>e.step(now+1200));assert.equal(e.preparation?.context.id,43);e.stop();
});

test('route review respects battles, roster changes and late cooldowns while a preparation search is running',async t=>{
    const {s,e,p,now,mapped}=fixture(t);
    s.trainer.id+='-review';
    const previousCheck=p.routeCheck;
    e.coach.step(s,now);
    const first=e.rankingJobs.get('preparation');
    assert.ok(first);
    assert.equal(p.routeCheck,previousCheck);
    await preparationTick.waitForPreparation(e);
    assert.ok(first.rows);
    s.adv.battle={steps:1,enemies:[{id:340,level:67,hp:100}]};
    e.coach.step(s,now+1200);
    assert.equal(p.routeCheck,previousCheck);
    assert.equal(p.phase,'train');
    s.adv.battle=null;
    s.mons[0].level++;
    e.coach.step(s,now+2400);
    const fresh=e.rankingJobs.get('preparation');
    assert.ok(fresh&&fresh!==first);
    await preparationTick.waitForPreparation(e);
    assert.ok(fresh.rows);
    p.avoid['42']=now+10000;
    e.coach.step(s,now+3600);
    assert.equal(p.routeCheck,now+3600);
    assert.equal(p.phase,'train');
    assert.deepEqual(mapped,[]);
    e.stop();
});

test('manual handoff and completing the original frontier discard a pending preparation destination',async t=>{
    const {s,e,p,now,mapped,save}=fixture(t);
    s.trainer.id+='-handoff';
    e.account=s.trainer.id;
    p.phase='travel';
    save();
    await e.step(now);
    assert.ok(e.rankingJobs.get('preparation'));
    e.manualInput(now+1);
    assert.equal(e.rankingJobs.has('preparation'),false);
    assert.ok(e.manual);
    e.resumeManual(now+1200);
    await e.step(now+2400);
    assert.ok(e.rankingJobs.get('preparation'));
    s.adv.unlocked=p.frontier+1;
    save();
    await e.step(now+3600);
    assert.equal(e.preparation,null);
    assert.equal(e.rankingJobs.has('preparation'),false);
    assert.deepEqual(mapped,[]);
    e.stop();
});

const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t,settings={},unlocked=38){
    const before=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
    const now=Date.now(),s={trainer:{id:'training-upgrade'},money:10000,mons:[289,282,330,257,310,275].map((id,i)=>({uid:'h'+i,id,level:[52,52,52,52,44,43][i],reg:'hoenn',xp:0})),team:[],road:[],dex:{},items:{},stats:{},travel:{to:['johto','hoenn']},link:{to:'hoenn',side:'to'},
        adv:{layout:H.DATA.layout,chapter:35,unlocked,node:0,runs:0,speed:4,loops:[35],badges:[],gifts:{},deaths:{}}};
    s.team=s.mons.map(m=>m.uid);s.road=[...s.team];
    const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    const e=new H.Engine(storage,{mode:'train',trainUid:'team',trainLevel:52,autoTeam:false,autoPrepare:false,raids:false,trainBuddy:false,trainBuff:false,progressCandy:false,...settings});e.loadAccount(s);e.running=true;e.started=now;e.schedule=()=>{};e.read();e.automation.begin(s);
    const mapped=[];e.driver.nav=()=>true;e.driver.map=row=>{mapped.push(row);s.adv.chapter=row.id;save();return true;};
    const low=()=>({...H.DATA.chapters[35],key:'35',members:[35]});
    function farming(age=0){e.target=low();e.visit={started:now-age,deaths:0};}
    function preparation(){
        e.settings.mode='progress';e.settings.autoPrepare=true;
        const p={mode:'progress',context:{kind:'progress',key:'progress:38',id:38,reg:'hoenn',label:'送神山'},resume:{},targets:s.mons.slice(4).map(m=>({uid:m.uid,id:m.id,goal:52})),uids:[...s.team],originalTeam:[...s.team],
            originalLocation:low(),phase:'train',phaseAt:now,started:now,lastTick:now,lastGrowth:now,frontier:unlocked,avoid:{},route:low(),visit:{at:now,deaths:0},routeCheck:now};
        e.preparation=p;return p;
    }
    return{s,e,now,mapped,save,farming,preparation};
}
const ace=row=>Math.max(...row.members.map(id=>H.DATA.chapters[id].ace));

test('a ready team awaiting the healing point keeps progressing, but a genuinely stalled screen still times out',t=>{
    const {s,e,now,preparation}=fixture(t,{autoTeam:true}),p=preparation();
    p.phase='team';p.targets=[];p.resumeReady=true;s.road=[s.team[0]];
    for(let tick=0;tick<135;tick++){
        if(tick%20===0)s.adv.node++;
        e.coach.step(s,now+tick*1200);assert.equal(e.running,true);
    }
    for(let tick=135;tick<250&&e.running;tick++)e.coach.step(s,now+tick*1200);
    assert.equal(e.running,false);assert.match(e.status,/治疗点应用队伍/);
});

test('an unmeasured low training map is upgraded after a short review instead of being held for thirty minutes',t=>{
    const {s,e,now,farming}=fixture(t);farming(31000);e.farm(s,now,'train');
    assert.ok(e.driver.pendingMap,'the low-level route must not wait for two complete samples');assert.ok(ace(e.driver.pendingMap.row)>37);assert.match(e.logs[0].text,/练级效率重评/);e.stop();
});
test('a level gain inside the same ten-level measurement bucket triggers an immediate training review',t=>{
    const {s,e,now,farming,save}=fixture(t,{},40);farming();e.farm(s,now,'train');assert.equal(e.driver.pendingMap,null);
    s.mons[0].level=53;save();e.farm(s,now+1200,'train');assert.ok(e.driver.pendingMap);assert.ok(ace(e.driver.pendingMap.row)>37);e.stop();
});
test('XP ticks alone preserve the current training map until the periodic review',t=>{
    const {s,e,now,farming}=fixture(t);farming();e.farm(s,now,'train');s.mons[4].xp=100;e.farm(s,now+1200,'train');
    assert.equal(e.driver.pendingMap,null);e.farm(s,now+31000,'train');assert.ok(e.driver.pendingMap);e.stop();
});
test('an upgrade waits for the current native battle and then retains the pending growth review',t=>{
    const {s,e,now,farming,save}=fixture(t,{},40);farming();e.farm(s,now,'train');s.mons[0].level=53;s.adv.battle={steps:1};save();e.farm(s,now+1200,'train');assert.equal(e.driver.pendingMap,null);
    s.adv.battle=null;save();e.farm(s,now+2400,'train');assert.ok(e.driver.pendingMap);e.stop();
});
test('a planned strong party cannot authorize an upgrade before the native road party applies',t=>{
    const {s,e,now,farming}=fixture(t);farming(31000);s.road=['h4','h5'];e.farm(s,now,'train');assert.equal(e.driver.pendingMap,null);assert.match(e.status,/治疗点上阵/);
    s.road=[...s.team];e.farm(s,now+1200,'train');assert.ok(e.driver.pendingMap);e.stop();
});
test('small XP-rate differences do not cause repeated training map switches',t=>{
    const {s,e,now,farming}=fixture(t);farming(31000);let first=true;
    for(const row of H.xpRanking(s,e.settings,{}, {},now)){
        const rate=row.key==='35'?100000:first?(first=false,110000):50000;
        e.metrics[H.metricsKey(s,row,e.settings,now)]={xp:rate,xpSeconds:60,xpRuns:2};
    }
    e.farm(s,now,'train');assert.equal(e.driver.pendingMap,null);assert.equal(e.target.key,'35');e.stop();
});
test('an old persisted preparation ceiling no longer traps the screenshot party on Mt Chimney',t=>{
    const {s,e,now,preparation,mapped}=fixture(t),p=preparation();p.routeCeiling=37;p.avoid['36']=now+600000;e.coach.step(s,now);
    assert.equal(p.routeCeiling,undefined);assert.equal(p.avoid['36'],now+600000);assert.equal(p.phase,'travel');e.coach.step(s,now+1200);
    assert.ok(ace(mapped.at(-1))>37);assert.equal(p.phase,'train');assert.equal(e.settings.mode,'progress');assert.deepEqual(p.targets.map(m=>m.goal),[52,52]);e.stop();
});
test('preparation upgrades after carrier growth without waiting thirty seconds or changing its original goal',t=>{
    const {s,e,now,preparation,mapped,save}=fixture(t,{},40),p=preparation();
    e.coach.step(s,now);assert.equal(p.phase,'travel');e.coach.step(s,now+1200);assert.equal(p.phase,'train');
    // Reproduce a low route retained by a previous visit, with a current review baseline.
    p.route={...H.DATA.chapters[35],key:'35',members:[35]};s.adv.chapter=35;p.routeCheck=now+1200;p.visit={at:now+1200,deaths:0};
    s.mons[0].level=53;save();e.coach.step(s,now+2400);assert.equal(p.phase,'travel');e.coach.step(s,now+3600);
    assert.ok(ace(mapped.at(-1))>37);assert.equal(p.context.id,38);assert.deepEqual(p.targets.map(m=>m.goal),[52,52]);e.stop();
});
test('new failure ceilings expire while the individual defeated-map cooldown is retained',t=>{
    const {s,e,now,preparation}=fixture(t),p=preparation();
    e.coach.step(s,now);const profile=p.routeProfile;assert.ok(profile);
    p.phase='train';p.routeCeiling=37;p.routeLimit={profile,until:now+600000};p.avoid['37']=now+900000;
    e.coach.step(s,now+1200);assert.equal(p.routeCeiling,37);p.phase='train';e.coach.step(s,now+600001);
    assert.equal(p.routeCeiling,undefined);assert.equal(p.routeLimit,undefined);assert.equal(p.avoid['37'],now+900000);e.stop();
});
test('carrier growth releases a temporary blanket ceiling but does not immediately retry the failed map',t=>{
    const {s,e,now,preparation,save}=fixture(t,{},40),p=preparation();e.coach.step(s,now);const profile=p.routeProfile;
    p.phase='train';p.routeCeiling=37;p.routeLimit={profile,until:now+600000};p.avoid['37']=now+600000;s.mons[0].level=53;save();e.coach.step(s,now+1200);
    assert.equal(p.routeCeiling,undefined);assert.equal(p.avoid['37'],now+600000);assert.equal(p.phase,'travel');e.coach.step(s,now+2400);assert.notEqual(p.route.key,'37');e.stop();
});
test('reaching a regional cap inside a level bucket cannot reuse uncapped XP history',()=>{
    const s={mons:[{uid:'a',id:6,level:51,reg:'hoenn'}],team:['a'],travel:{to:['johto','hoenn']},link:{to:'hoenn',side:'to'},adv:{chapter:35,unlocked:38}},row=H.candidates(s,H.DEFAULTS,true).find(r=>r.id===35);
    assert.equal(H.trainingCap(s,s.mons[0]),52);const key=H.metricsKey(s,row,H.DEFAULTS);s.mons[0].level=52;assert.notEqual(H.metricsKey(s,row,H.DEFAULTS),key);
});

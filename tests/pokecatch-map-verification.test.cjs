const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

const now=new Date(2026,10,19,12,15).getTime();
function fixture(t,settings={}){
    const before=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
    const s={trainer:{id:'map-fixture'},mons:[{uid:'a',id:6,level:30,xp:0},{uid:'b',id:9,level:22,xp:0}],team:['a','b'],road:['a','b'],dex:{},money:3000,
        adv:{layout:H.DATA.layout,chapter:0,unlocked:24,node:5,runs:4,speed:4,loops:['0'],badges:[],gifts:{}},travel:{to:['johto']}};
    const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'money',region:'all',autoPrepare:false,autoTeam:false,raids:false,autoUnderDispatch:false,autoUnderCollect:false, ...settings});
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();e.loadAccount(s);e.running=true;e.started=now;e.tabToken=storage.getItem('pokecatch-tab');e.schedule=()=>{};e.read();
    e.driver.nav=()=>true;
    t.after(()=>e.stop());
    return{s,e,save};
}
const row=id=>{const c=H.DATA.chapters.find(c=>c.id===id);return {...c,key:String(c.loop),members:c.league?H.DATA.chapters.filter(entry=>entry.loop===c.loop).map(entry=>entry.id):[id]};};

test('chapter, regional league and weather identity agree with the local catalog',()=>{
    const ids=new Set(),loops=new Map();
    for(const c of H.DATA.chapters){
        assert.ok(!ids.has(c.id));ids.add(c.id);
        assert.ok(H.DATA.regions.some(r=>r.key===c.reg&&r.start<=c.id&&c.id<=r.end));
        assert.ok(H.WEATHER_DATA.chapters[c.id]);
        const key=String(c.loop);assert.ok(!loops.has(key)||loops.get(key)===c.reg);loops.set(key,c.reg);
    }
    assert.notEqual(H.routeIdentity(row(9)),H.routeIdentity(row(25)));
    assert.notEqual(H.routeIdentity(row(9),{zone:true,tier:1}),H.routeIdentity(row(9),{zone:true,tier:2}));
});

test('a delayed map save never resends the accepted action or starts a sample early',async t=>{
    const {s,e,save}=fixture(t),prior=row(0),next=row(1);let sent=0;
    e.target=prior;e.driver.map=()=>{sent++;return true;};e.travel(next,now);
    await e.step(now);await e.step(now+1200);
    assert.equal(sent,1);assert.equal(e.target,prior);assert.equal(e.telemetry.sample,null);
    s.adv.chapter=next.id;save();await e.step(now+2400);
    assert.equal(e.target,prior,'chapter alone does not prove loop confirmation');
    s.adv.loops=[next.key];save();await e.step(now+3600);
    assert.equal(e.target,next);assert.equal(e.driver.pendingMap,null);assert.equal(sent,1);
});

test('wrong-map and timed-out receipts cannot confirm or duplicate a map operation',async t=>{
    const {s,e,save}=fixture(t);let sent=0;e.driver.map=()=>{sent++;return true;};e.travel(row(1),now);
    await e.step(now);s.adv.chapter=14;s.adv.loops=['1'];save();await e.step(now+1200);
    assert.equal(e.target,null);
    await e.step(now+16000);assert.equal(e.target,null);assert.equal(e.driver.pendingMap,null);assert.equal(sent,1);assert.ok(e.cooldowns['1']>now+16000);
});

test('a same-map restart waits for an actual reset, and a league can confirm after advancing one room',async t=>{
    const {s,e,save}=fixture(t);const check=(r,options,previous)=>({row:r,options,arrival:{at:now,side:null,...previous}});
    e.observeMapArrival(s,check(row(0),{restart:true},{node:5}),now+1000);assert.equal(e.target,null);
    s.adv.node=0;e.observeMapArrival(s,check(row(0),{restart:true},{node:5}),now+1200);assert.equal(e.target.key,'0');
    Object.assign(s.adv,{chapter:10,unlocked:13,loops:['L']});save();
    e.observeMapArrival(s,check(row(9),{},{chapter:8,node:2}),now+2200);assert.equal(e.target.key,'L');
});

test('linked travel confirms the destination wallet only after the native side changes',t=>{
    const {s,e}=fixture(t),target=row(14);
    s.link={from:'kanto',to:'johto',side:'from',stash:{team:['b']}};
    const pending={row:target,options:{},arrival:{at:now,chapter:0,node:5,side:'to'}};
    Object.assign(s.adv,{chapter:14,loops:[target.key]});
    e.observeMapArrival(s,pending,now+1200);assert.equal(e.target,null);
    s.link.side='to';s.mons[1].reg='johto';s.team=['b'];s.road=['b'];
    e.observeMapArrival(s,pending,now+2400);assert.equal(e.target,target);
});

test('learners use goal-truncated UID observations, separate from historical party XP',t=>{
    const {s,e}=fixture(t,{mode:'train',trainUid:'selected',trainUids:['a'],trainLevel:31});
    const target=row(0),key=H.metricsKey(s,target,e.settings,now),samples=e.metrics;
    samples[key]={xp:1e9,xpSeconds:60,xpRuns:3};
    assert.equal(H.xpRanking(s,e.settings,samples,{},now).find(r=>r.key===target.key).measured,false);
    const suffix=H.trainingXpSuffix(H.trainingXpTargets(s,e.settings));
    const remaining=H.trainingXpTargets(s,e.settings)[0].remaining;assert.ok(remaining>1);
    e.telemetry.begin(s,target,e.settings,now);e.telemetry.sample.full=true;
    s.adv.node++;s.adv.runs++;s.mons[0].xp=remaining+50;s.mons[1].xp=1e6;
    const result=e.telemetry.observe(s,target,e.settings,now+15000);
    assert.equal(result.valid,true);assert.equal(result.xp,remaining);assert.equal(samples[key+suffix].xp,remaining);assert.equal(samples[key].xp,1e9);
    s.stats={spent:{shop:100}};s.adv.runs++;s.adv.node++;
    assert.equal(e.telemetry.observe(s,target,e.settings,now+30000),null);
});

const fit=require('./fixtures/pokecatch-wait-team.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function state(level=15){
    return{trainer:{id:'team-farming-v214'},money:5000,mons:[{uid:'a',id:6,level}],team:['a'],road:['a'],dex:{},stats:{},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],deaths:{}}};
}
function fixture(t,mode='money'){
    const previous=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const s=state(5),data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    s.mons=[{uid:'weak',id:10,level:5},...[6,9,3,65,94,149].map((id,i)=>({uid:'strong'+i,id,level:90}))];s.team=['weak'];s.road=['weak'];
    storage.setItem('gachamon-save-v1',JSON.stringify(s));const e=new H.Engine(storage,{mode,autoPrepare:false,autoTeam:true,raids:false});e.loadAccount(s);e.running=true;e.schedule=()=>{};e.read();
    t.after(()=>e.stop());return{s,e,now:Date.now()};
}
function route(id){const c=H.DATA.chapters.find(c=>c.id===id);return{...c,key:String(c.loop),members:c.league?H.DATA.chapters.filter(r=>r.loop===c.loop).map(r=>r.id):[c.id]};}

test('money values the paying trainer while training values XP from both trainers and wild opponents',()=>{
    const s=state(55);
    s.mons.push({uid:'water',id:9,level:55});
    s.adv.badges=['Maître'];s.autoSwitch=false;
    const foes=[{id:6,weight:17,wildWeight:17,level:44},{id:135,weight:2,level:52}];
    const options={foes,size:1,force:true,now:1732000000000};
    const pick=mode=>H.planAdventureTeam(s,{...H.DEFAULTS,mode},[],options).uids;
    assert.deepEqual(pick('money'),['a']);
    assert.deepEqual(pick('train'),['water']);
});

test('XP fitting distinguishes identical copies for the Buddy bonus and still respects a pinned UID',()=>{
    const s=state(45);
    s.mons.push({...s.mons[0],uid:'buddy'});
    s.buddy={uid:'buddy'};s.adv.badges=['Maître'];
    const options={foes:[{id:3,level:45,weight:1}],size:1,now:1732000000000};
    const settings={...H.DEFAULTS,mode:'train',trainLevel:60};
    assert.deepEqual(H.planAdventureTeam(s,settings,[],options).uids,['buddy']);
    assert.deepEqual(H.planAdventureTeam(s,settings,['a'],options).uids,['a']);
});

test('unmeasured money routes reflect the actual party ability rather than reward alone',()=>{
    const s=state(),rows=H.moneyRanking(s,H.DEFAULTS),easy=rows.find(r=>r.id===0),hard=rows.find(r=>r.id===6);
    assert.equal(rows[0].id,0);assert.ok(easy.rate>hard.rate);assert.ok(easy.battleFit.coverage>hard.battleFit.coverage);
    assert.ok(H.estimateRate(hard)>H.estimateRate(easy),'the difficult route would win a reward-only estimate');
});

test('a stronger actual money party can regain the higher-reward routes without waiting for a sample',()=>{
    const s=state(),before=H.moneyRanking(s,H.DEFAULTS);s.mons[0].level=90;const after=H.moneyRanking(s,H.DEFAULTS);
    assert.notEqual(after[0].id,before[0].id);assert.ok(after[0].rate>before[0].rate);assert.ok(after[0].battleFit.coverage>.9);
});

test('a strong member in the PC cannot inflate unmeasured money efficiency until it is deployed',()=>{
    const s=state(),before=H.moneyRanking(s,H.DEFAULTS).map(r=>[r.key,r.rate]);s.mons.push({uid:'bench',id:150,level:100});
    assert.deepEqual(H.moneyRanking(s,H.DEFAULTS).map(r=>[r.key,r.rate]),before);
    s.team=['bench'];assert.ok(H.moneyRanking(s,H.DEFAULTS)[0].rate>before[0][1]);
});

test('completed money measurements retain their real net rate even on a modelled difficult route',()=>{
    const s=state(),r=route(6),metrics={[H.metricsKey(s,r,H.DEFAULTS)]:{net:12345,seconds:60,runs:2}},ranked=H.moneyRanking(s,H.DEFAULTS,metrics),measured=ranked.find(row=>row.id===6);
    assert.equal(measured.rate,12345);assert.equal(measured.measured,true);assert.ok(measured.battleFit.factor<.1);assert.equal(ranked[0].id,6);
    metrics[H.metricsKey(s,r,H.DEFAULTS)].net=-50;assert.equal(H.moneyRanking(s,H.DEFAULTS,metrics).find(row=>row.id===6).rate,-50);
});

test('money berry multipliers apply to the battle-adjusted estimate while actual samples remain authoritative',()=>{
    const s=state(40),now=Date.now(),before=H.moneyRanking(s,H.DEFAULTS,{}, {},now),[key,buff]=Object.entries(H.DATA.automation.buffs).find(([,info])=>info.family==='money');
    s.buffs={money:{key,until:now+60000}};const after=H.moneyRanking(s,H.DEFAULTS,{}, {},now);
    for(const row of after){const plain=before.find(r=>r.key===row.key);assert.ok(Math.abs(row.rate-plain.rate*buff.mult)<1e-8);}
    const r=route(3),metrics={[H.metricsKey(s,r,H.DEFAULTS,now)]:{net:900,seconds:60,runs:2}};
    assert.equal(H.moneyRanking(s,H.DEFAULTS,metrics,{},now).find(row=>row.id===3).rate,900);
});

test('changing native auto-switch invalidates old money and XP samples',()=>{
    const s=state(90),r=route(6),key=H.metricsKey(s,r,H.DEFAULTS),metrics={[key]:{net:99999,seconds:60,runs:2,xp:999999,xpSeconds:60,xpRuns:2}};
    assert.equal(H.moneyRanking(s,H.DEFAULTS,metrics).find(row=>row.id===6).measured,true);s.autoSwitch=false;
    assert.notEqual(H.metricsKey(s,r,H.DEFAULTS),key);assert.equal(H.moneyRanking(s,H.DEFAULTS,metrics).find(row=>row.id===6).measured,false);
    assert.equal(H.xpRanking(s,H.DEFAULTS,metrics).find(row=>row.id===6)?.measured,false);
});

test('money fitting uses its entire selected route instead of a transient enemy',async t=>{
    const {s,e,now}=fixture(t);e.target=route(0);s.adv.battle={enemies:[{id:150,level:100}]};
    const foes=H.chapterFoes(s,H.DATA.chapters[0]).map(([id,level,weight])=>({id,level,weight}));
    const expected=H.planAdventureTeam(s,e.settings,[],{reg:'kanto',foes,objective:'money'});
    assert.equal(await fit(e,s,now),expected.changed);assert.deepEqual(e.driver.teamTask?.uids,expected.changed?expected.uids:undefined);
    assert.equal(e.teamCheck.objective,'money');assert.deepEqual(e.driver.teamTask?.members,[0]);
});

test('money fitting waits for its selected destination instead of rebuilding the old-map party',async t=>{
    const {s,e,now}=fixture(t);e.target=route(1);assert.equal(await fit(e,s,now),false);assert.equal(e.driver.teamTask,null);assert.equal(e.teamCheck,null);
    e.target=null;e.driver.pendingMap={row:route(1),options:{},started:now};assert.equal(await fit(e,s,now),false);assert.equal(e.teamCheck,null);
    e.driver.pendingMap=null;s.adv.chapter=1;e.target=route(1);assert.equal(await fit(e,s,now+1200),true);assert.deepEqual(e.driver.teamTask.members,[1]);
});

test('native auto-switch changes re-evaluate the party while temporary HP changes do not',async t=>{
    const {s,e,now}=fixture(t);await fit(e,s,now);s.autoSwitch=false;await fit(e,s,now+1000);assert.equal(e.teamCheck.at,now+1000);assert.equal(e.teamCheck.autoSwitch,false);
    s.mons[0].hp=1;s.mons[0].status='poison';await fit(e,s,now+2000);assert.equal(e.teamCheck.at,now+1000);
});

test('training fitting preserves its explicit trainee and records a training objective',async t=>{
    const {s,e,now}=fixture(t,'train');e.settings.trainUid='weak';e.trainProtected=['weak'];
    assert.equal(await fit(e,s,now),true);assert.ok(e.driver.teamTask.uids.includes('weak'));assert.equal(e.teamCheck.objective,'train');
});

test('item farming keeps its route-speed objective instead of optimizing trainer payouts',async t=>{
    const {s,e,now}=fixture(t,'item');e.target=route(0);
    assert.equal(await fit(e,s,now),true);
    assert.equal(e.teamCheck.objective,'route');
});

test('mainline fitting does not optimize a replay map before returning to its frontier',async t=>{
    const {s,e,now}=fixture(t,'progress');assert.equal(await fit(e,s,now),false);assert.equal(e.driver.teamTask,null);assert.equal(e.teamCheck,null);
    s.adv.chapter=s.adv.unlocked;assert.equal(await fit(e,s,now+1000),true);assert.equal(e.teamCheck.objective,'progress');
});

test('collecting on Mt Chimney retains a fast legal six through preparation and live fitting',async t=>{
    const {s,e}=fixture(t,'dex'),now=Date.UTC(2026,10,20,10);
    const chapter=H.DATA.chapters.find(c=>c.reg==='hoenn'&&c.name==='烟囱山'),row=route(chapter.id);
    const ids=[150,249,250,382,383,384,13,57,14,468,424,49];
    const levels=[100,100,100,100,100,100,100,59,100,74,64,53];
    s.mons=ids.map((id,i)=>({uid:'m'+id,id,reg:'hoenn',level:levels[i]}));
    s.team=s.mons.slice(0,6).map(m=>m.uid);s.road=[...s.team];
    s.adv.chapter=chapter.id;s.adv.unlocked=83;s.adv.badges=['Maître Hoenn'];s.travel.to=['hoenn'];
    const before=[...s.team];e.settings.autoPrepare=true;e.target=row;
    const context={...H.battleContext(s,'map',{row}),now};
    const validation=H.preparationReadiness(s,e.settings,context);
    assert.ok(validation.ready&&validation.fit.turns<=2&&validation.fit.worstDeaths===0);
    assert.deepEqual(H.preparationPlan(s,e.settings,context).uids,before);
    assert.equal(e.coach.ensure(s,context,{row},now),false);
    assert.equal(e.driver.teamTask,null);
    assert.equal(await fit(e,s,now),false);assert.equal(e.driver.teamTask,null);
    assert.match(e.teamCheck.reason,/补图鉴保留原队/);
    // An actual loss must bypass the replay shortcut. A weak party still gets replacements.
    assert.notDeepEqual(H.preparationPlan(s,e.settings,{...context,forcePreparation:true}).uids,before);
    for(const mon of s.mons.slice(0,6))mon.level=3;
    assert.notDeepEqual(H.preparationPlan(s,e.settings,context).uids,before);
    assert.equal(await fit(e,s,now+1200),true);assert.ok(e.driver.teamTask);
});

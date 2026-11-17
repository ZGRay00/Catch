const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t,settings={}){
    const previous=global.document;const selected={classList:{contains:()=>true}},go={};
    global.document={hidden:false,querySelector:selector=>selector.includes('.rg.open')||selector.includes('.mp-row')?selected:selector.includes('.mp-go')?go:null,querySelectorAll:()=>[]};
    t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const s={trainer:{id:'progress-boundary'},money:10000,mons:[{uid:'a',id:6,level:100}],team:['a'],dex:{},stats:{},travel:{to:['johto']},
        adv:{layout:6,chapter:0,unlocked:18,node:0,runs:0,loops:[],speed:4,badges:[],gifts:{},deaths:{},paidLeaders:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','fixture']]);
    const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'progress',progressUntil:83,autoPrepare:false,autoTeam:false,raids:false,...settings});e.loadAccount(s);e.running=true;e.started=Date.now();e.tabToken='fixture';e.schedule=()=>{};
    const actions=[];e.driver={clearLoops:()=>true,nav:()=>true,click:(el,label)=>{actions.push(label);if(el===go)s.adv.chapter=s.adv.unlocked;return true;}};
    return{s,e,actions};
}

test('explicit mainline returns from an old farming region to its already opened frontier',t=>{
    const {s,e,actions}=fixture(t);assert.equal(e.canProgress(s),true);e.progress(s,Date.now());
    assert.equal(s.adv.chapter,18);assert.equal(e.target.id,18);assert.deepEqual(actions,['推进当前主线']);assert.equal(e.running,true);e.stop();
});

test('incidental dex progress keeps its current-region boundary',t=>{
    const {s,e}=fixture(t,{mode:'dex',region:'current',progress:true});assert.equal(e.canProgress(s),false);
    s.adv.chapter=14;assert.equal(e.canProgress(s),true);e.stop();
});

test('mainline does not bypass departure when the frontier region is not yet open',t=>{
    const {s,e,actions}=fixture(t,{autoTravel:true});s.travel.to=[];s.adv.chapter=13;s.adv.unlocked=14;
    assert.equal(e.canProgress(s),false);let departures=0;e.automation.travel=()=>{departures++;return true;};e.progress(s,Date.now());
    assert.equal(departures,1);assert.equal(s.adv.chapter,13);assert.deepEqual(actions,[]);e.stop();
});

test('an already linked destination is a valid mainline frontier before the travel list refreshes',t=>{
    const {s,e}=fixture(t);s.travel.to=[];s.link={from:'kanto',to:'johto',side:'from'};assert.equal(e.canProgress(s),true);e.stop();
});

test('raid loop counters cannot mark an unfinished final chapter complete',t=>{
    const {s,e}=fixture(t);s.adv.chapter=83;s.adv.unlocked=83;e.automation.state.frontierId=83;e.automation.state.frontierRun=4;
    s.adv.event={raid:true,id:35,reg:'kanto',loops:1};s.adv.runs=5;assert.equal(e.progressReached(s),false);
    s.adv.event=null;assert.equal(e.progressReached(s),false,'returning after the raid still needs the actual final boss');
    s.adv.paidLeaders['83:Goyah']=true;assert.equal(e.progressReached(s),true);e.stop();
});

test('clearing an old farming chapter cannot complete the unrelated selected frontier',t=>{
    const {s,e}=fixture(t,{progressUntil:20});s.adv.unlocked=20;s.adv.chapter=20;e.automation.state.frontierId=20;e.automation.state.frontierRun=8;
    s.adv.chapter=0;s.adv.runs=9;s.adv.chapter=20;assert.equal(e.progressReached(s),false);
    s.adv.unlocked=21;assert.equal(e.progressReached(s),true,'native chapter unlock confirms the leaderless Lake of Rage chapter');e.stop();
});

test('ordinary unlocked and paid-leader completion evidence remains valid',t=>{
    const {s,e}=fixture(t,{progressUntil:18});s.adv.unlocked=19;assert.equal(e.progressReached(s),true);
    s.adv.unlocked=18;s.adv.paidLeaders[H.DATA.chapters[18].leaders[0]]=true;assert.equal(e.progressReached(s),true);e.stop();
});

test('a league run behind its unlocked frontier continues without repeatedly opening the map',t=>{
    const {s,e,actions}=fixture(t);s.travel.to.push('unova');s.adv.chapter=77;s.adv.unlocked=78;
    s.adv.battle={enemies:[{id:563,level:75,hp:100}]};const battle=s.adv.battle,visits=[];e.driver.nav=screen=>{visits.push(screen);return true;};
    e.progress(s,Date.now());
    assert.equal(s.adv.chapter,77);assert.equal(s.adv.battle,battle);assert.deepEqual(actions,[]);assert.deepEqual(visits,['adventure']);
    assert.ok(e.target.members.includes(77)&&e.target.members.includes(78));assert.match(e.status,/推进联盟/);e.stop();
});

test('native league defeat returning to its first chapter does not trigger map navigation on each step',t=>{
    const {s,e,actions}=fixture(t);s.travel.to.push('unova');s.adv.chapter=79;s.adv.unlocked=80;const visits=[];e.driver.nav=screen=>{visits.push(screen);return true;};
    e.progress(s,Date.now());s.adv.chapter=77;s.adv.deaths[79]=1;e.progress(s,Date.now()+1000);s.adv.chapter=78;e.progress(s,Date.now()+2000);
    assert.deepEqual(actions,[]);assert.deepEqual(visits,['adventure','adventure','adventure']);assert.equal(s.adv.unlocked,80);assert.equal(e.progressReached(s),false);e.stop();
});

test('a league in another region is not treated as the frontier continuous run',t=>{
    const {s,e,actions}=fixture(t);s.travel.to.push('unova');s.adv.chapter=25;s.adv.unlocked=78;const visits=[];e.driver.nav=screen=>{visits.push(screen);return true;};
    e.progress(s,Date.now());assert.deepEqual(visits,['map']);assert.deepEqual(actions,['推进当前主线']);e.stop();
});

test('a same-league run still clears enabled chapter loops before progressing naturally',t=>{
    const {s,e,actions}=fixture(t);s.travel.to.push('unova');s.adv.chapter=77;s.adv.unlocked=78;s.adv.loops=['L:unova'];const visits=[];
    let clears=0;e.driver.nav=screen=>{visits.push(screen);return true;};e.driver.clearLoops=()=>{clears++;return false;};
    e.progress(s,Date.now());assert.equal(clears,1);assert.deepEqual(visits,['map']);assert.deepEqual(actions,[]);assert.equal(s.adv.chapter,77);e.stop();
});

test('returning to the frontier skips a redundant party swap for the old farming map',t=>{
    const {s,e}=fixture(t,{autoTeam:true});s.mons.push({uid:'water',id:9,level:100});
    assert.equal(e.fitTeam(s,Date.now()),false);assert.equal(e.driver.teamTask,undefined);
    e.settings.mode='money';assert.equal(e.fitTeam(s,Date.now()),true,'ordinary farming still adapts the current map');e.stop();
});

test('a continuous frontier league still adapts its actual active party',t=>{
    const {s,e}=fixture(t,{autoTeam:true});s.travel.to.push('unova');s.adv.chapter=77;s.adv.unlocked=78;s.mons.push({uid:'water',id:9,level:100});
    assert.equal(e.fitTeam(s,Date.now()),true);assert.ok(e.driver.teamTask.members.includes(77)&&e.driver.teamTask.members.includes(78));e.stop();
});

test('an achieved mainline goal completes before a pending map or party optimization',async t=>{
    const {s,e}=fixture(t,{autoTeam:true,progressUntil:18});s.adv.unlocked=19;
    e.storage.setItem('gachamon-save-v1',JSON.stringify(s));Object.assign(e.driver,{animations:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false});
    e.driver.pendingMap={row:H.candidates(s,H.DEFAULTS)[0],started:Date.now()};let fitted=0;e.fitTeam=()=>{fitted++;return true;};
    await e.step();assert.equal(e.running,false);assert.equal(fitted,0);assert.equal(e.driver.pendingMap,null);assert.match(e.status,/主线目标章节已完成/);
});

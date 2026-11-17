const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
function fixture(t,settings={}){
    const previous=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const s={trainer:{id:'resume-intelligence'},mons:[{uid:'a',id:6,level:80}],team:['a'],dex:{},stats:{},money:10000,travel:{to:[]},
        adv:{layout:6,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','t']]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'money',autoTeam:false,autoPrepare:false,raids:false,...settings});e.loadAccount(s);e.running=true;e.started=Date.now();e.tabToken='t';e.schedule=()=>{};e.read();
    let actions=0;e.driver={animations:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false,nav:()=>{actions++;return true;}};
    return{s,e,storage,save:()=>storage.setItem('gachamon-save-v1',JSON.stringify(s)),actions:()=>actions};
}
test('refresh preserves map and raid failure backoff and the next probe deadlines',t=>{
    const {s,e,storage}=fixture(t),now=Date.now();e.cooldowns={'7':now+900000};e.raidCooldown={[H.parisDay()+'|kanto']:now+1800000};
    e.nextRaid=now+600000;e.nextLegend=now+300000;e.teamRetryAt=now+300000;e.lastExplore=now;e.suspend();
    const next=new H.Engine(storage);next.loadAccount(s);next.schedule=()=>{};next.start(true);
    assert.equal(next.running,true,next.status);assert.equal(next.cooldowns['7'],now+900000);assert.equal(next.raidCooldown[H.parisDay()+'|kanto'],now+1800000);
    assert.equal(next.nextRaid,now+600000);assert.equal(next.nextLegend,now+300000);assert.equal(next.teamRetryAt,now+300000);assert.equal(next.lastExplore,now);next.stop();
});
test('native pause holds planning and UI deadlines until the game resumes',async t=>{
    const {s,e,save,actions}=fixture(t),now=Date.now();s.adv.paused=true;save();
    e.preparation={phase:'train',phaseAt:now,lastGrowth:now,lastTick:now,candyAt:now,candyTx:{at:now},roadWait:{at:now}};
    const prep=e.preparation;let trained=0;e.coach.step=()=>trained++;
    const original=e.storage.getItem('gachamon-save-v1');await e.step(now);await e.step(now+420000);
    assert.equal(e.running,true);assert.equal(trained,0);assert.equal(actions(),0);assert.match(e.status,/游戏已暂停/);
    assert.equal(e.storage.getItem('gachamon-save-v1'),original);
    s.adv.paused=false;save();await e.step(now+421200);
    assert.equal(trained,1);assert.equal(prep.phaseAt,now+421200);assert.equal(prep.lastGrowth,now+421200);assert.equal(prep.roadWait.at,now+421200);e.stop();
});
test('background time during a native pause is excluded from UI deadlines exactly once',async t=>{
    const {s,e,save}=fixture(t),now=Date.now();s.adv.paused=true;save();e.preparation={phase:'train',phaseAt:now,lastGrowth:now,lastTick:now};
    e.coach.step=()=>{};await e.step(now);global.document.hidden=true;await e.step(now+60000);global.document.hidden=false;await e.step(now+180000);
    s.adv.paused=false;save();await e.step(now+240000);assert.equal(e.preparation.phaseAt,now+240000);assert.equal(e.hiddenAt,null);e.stop();
});
test('the configured task-wide stop limit still applies during a native pause',async t=>{
    const {s,e,save,actions}=fixture(t,{stopMinutes:1}),now=e.started;s.adv.paused=true;save();await e.step(now);await e.step(now+60001);
    assert.equal(e.running,false);assert.match(e.status,/定时运行上限/);assert.equal(actions(),0);
});

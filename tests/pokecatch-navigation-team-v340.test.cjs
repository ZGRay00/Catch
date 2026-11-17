const test=require('node:test'),assert=require('node:assert/strict');
const H=require(process.env.POKECATCH_AUDIT_SOURCE||'../Pokecatch自动助手.user.js');

function fixture(t,{screen='raid',respond=true,settings={}}={}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};
    let clock=Date.UTC(2026,10,17,12);Date.now=()=>clock;
    const actions=[],nodes=new Map(),ui={screen,respond};
    function node(extra={}){return{isConnected:true,hidden:false,disabled:false,dataset:{},classes:new Set(),
        get classList(){return{contains:name=>this.classes.has(name)};},closest:()=>null,getAttribute:()=>null,
        getClientRects:()=>[{}],querySelector:()=>null,querySelectorAll:()=>[],...extra};}
    const tabs=new Map(['adventure','team','map','pension'].map(name=>[name,node({dataset:{screen:name},click:()=>{actions.push(name);if(ui.respond)ui.screen=name;}})]));
    global.document={hidden:false,documentElement:{classList:{contains:()=>false}},querySelector:selector=>{
        const active=/^#screen-([\w-]+)\.active$/.exec(selector);if(active)return ui.screen===active[1]?node():null;
        const tab=/^#tabs \[data-screen="([\w-]+)"\]$/.exec(selector);if(tab)return tabs.get(tab[1])||null;
        return nodes.get(selector)||null;
    },querySelectorAll:()=>[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const s={trainer:{id:'navigation-team-v340'},money:1000,mons:[{uid:'a',id:6,level:70},{uid:'b',id:9,level:70}],team:['a','b'],road:['a','b'],dex:{},stats:{},items:{},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','navigation-team-tab']]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const e=new H.Engine(storage,{mode:'money',autoPrepare:false,autoTeam:true,autoEvolve:false,autoEggs:false,autoUnderCollect:false,raids:false,...settings});
    e.loadAccount(s);e.read();e.running=true;e.started=clock;e.tabToken='navigation-team-tab';e.nextRaid=Infinity;e.schedule=()=>{};
    return{s,e,ui,tabs,nodes,actions,data,node,now:()=>clock,advance:ms=>clock+=ms};
}

test('native navigation retries with backoff and clears its transaction only after the target is active',t=>{
    const f=fixture(t,{respond:false}),d=f.e.driver;d.nav('team');assert.deepEqual(f.actions,['team']);assert.equal(d.navigation.attempts,1);
    f.advance(1200);d.nav('team');assert.equal(d.navigation.attempts,2);assert.equal(f.actions.length,2);
    f.advance(1200);d.nav('team');assert.equal(f.actions.length,2,'a late page cannot be hammered once per engine tick');
    f.advance(1200);d.nav('team');assert.equal(f.actions.length,3);
    f.ui.screen='team';assert.equal(d.nav('team'),true);assert.equal(d.navigation,null);
});

test('a missing native entrance can appear late and complete the same navigation',t=>{
    const f=fixture(t),tab=f.tabs.get('pension');f.tabs.delete('pension');f.e.driver.nav('pension');
    assert.equal(f.actions.length,0);assert.match(f.e.status,/入口暂未显示/);const started=f.e.driver.navigation.started;
    f.advance(5000);f.tabs.set('pension',tab);f.e.driver.nav('pension');assert.equal(f.e.driver.navigation.started,started);
    assert.equal(f.e.driver.nav('pension'),true);assert.equal(f.e.driver.navigation,null);assert.equal(f.e.running,true);
});

test('expanding an inert activity group is a separate step from retrying the destination tab',t=>{
    const f=fixture(t);let expanded=false;
    const header=f.node({getAttribute:key=>key==='aria-expanded'?String(expanded):null,click:()=>{expanded=true;f.actions.push('expand');}});
    const group={querySelector:()=>header};f.tabs.get('pension').closest=selector=>selector==='.nav-grp'?group:selector==='[inert]'&&!expanded?{}:null;
    f.e.driver.nav('pension');assert.deepEqual(f.actions,['expand']);assert.equal(f.e.driver.navigation.attempts,0);
    f.advance(701);f.e.driver.nav('pension');assert.deepEqual(f.actions,['expand','pension']);assert.equal(f.ui.screen,'pension');
});

test('an unresponsive navigation fails a queued task with a reason while preserving its goal and game save',t=>{
    const f=fixture(t,{respond:false,settings:{mode:'breed'}}),before=f.data.get('gachamon-save-v1');
    f.e.queue=H.normalizeJobs([{id:'one',settings:f.e.settings,status:'running'}]);f.e.queueRunning=true;f.e.queueIndex=0;
    f.e.driver.nav('pension');f.advance(60000);f.e.driver.nav('pension');
    assert.equal(f.e.running,false);assert.equal(f.e.driver.navigation,null);assert.equal(f.e.queue[0].status,'failed');
    assert.match(f.e.status,/无法打开培育屋/);assert.equal(f.e.queue[0].settings.breedGoal,f.e.settings.breedGoal);
    assert.equal(f.data.get('gachamon-save-v1'),before);assert.equal(f.e.budget.spent,0);
});

test('native unlock conditions do not create a false page timeout',t=>{
    const f=fixture(t);f.tabs.get('pension').classes.add('locked');f.tabs.get('pension').dataset.why='Need badge';
    f.e.driver.nav('pension');f.advance(300000);f.e.driver.nav('pension');assert.equal(f.e.running,true);assert.equal(f.e.driver.navigation,null);assert.equal(f.e.status,'Need badge');
    f.tabs.get('pension').classes.clear();f.e.driver.nav('pension');assert.equal(f.ui.screen,'pension');
});

test('background time does not consume navigation confirmation or retry windows',t=>{
    const f=fixture(t,{respond:false});f.e.driver.nav('team');const started=f.e.driver.navigation.started;
    f.e.hiddenAt=f.now();global.document.hidden=true;f.advance(300000);f.e.driver.nav('team');assert.equal(f.actions.length,1);
    global.document.hidden=false;f.e.resumeUIClock(f.now());assert.equal(f.e.driver.navigation.started,started+300000);
    f.e.driver.nav('team');assert.equal(f.actions.length,1);assert.equal(f.e.running,true);
    f.advance(1200);f.e.driver.nav('team');assert.equal(f.actions.length,2);
});

test('manual takeover and Stop clear stale native navigation transactions',t=>{
    const f=fixture(t,{respond:false});f.e.driver.nav('team');assert.ok(f.e.driver.navigation);f.e.manualInput(f.now());assert.equal(f.e.driver.navigation,null);
    f.e.driver.nav('team');assert.equal(f.e.driver.navigation,null);f.e.manual=null;f.e.driver.nav('team');assert.ok(f.e.driver.navigation);
    f.e.stop();assert.equal(f.e.driver.navigation,null);
});

function teamFixture(t){
    const f=fixture(t,{screen:'team'}),d=f.e.driver;f.drags=[];f.visits=[];
    f.nodes.set('#team-slots',{children:[f.node({slot:0}),f.node({slot:1})]});
    d.nav=screen=>{f.visits.push(screen);return true;};d.drag=(source,target)=>{f.drags.push([source.slot,target.slot]);return true;};
    d.teamTask={chapter:0,members:[0],uids:['b','a'],started:f.now(),attempts:0};
    f.tick=()=>d.adventureTeam(f.s,f.now());return f;
}

test('a delayed native party save cannot trigger duplicate swap drags or undo the accepted order',t=>{
    const f=teamFixture(t);f.tick();assert.deepEqual(f.drags,[[1,0]]);assert.ok(f.e.driver.teamTask.pending);
    for(let i=0;i<5;i++){f.advance(1200);f.tick();}assert.equal(f.drags.length,1);assert.match(f.e.status,/等待游戏确认/);
    f.s.team=['b','a'];f.tick();assert.equal(f.e.driver.teamTask,null);assert.equal(f.drags.length,1);assert.equal(f.visits.at(-1),'adventure');
    assert.deepEqual(f.s.road,['a','b'],'saved PC selection does not invent native road application');
});

test('unconfirmed swaps retry only after their save window and eventually back off to adventure',t=>{
    const f=teamFixture(t);f.e.teamCheck={key:'old'};f.tick();
    f.advance(10000);f.tick();f.advance(10000);f.tick();assert.equal(f.drags.length,3);
    f.advance(9999);f.tick();assert.equal(f.drags.length,3);assert.ok(f.e.driver.teamTask);
    f.advance(1);f.tick();assert.equal(f.e.driver.teamTask,null);assert.equal(f.e.teamCheck,null);
    assert.equal(f.e.teamRetryAt,f.now()+300000);assert.equal(f.visits.at(-1),'adventure');assert.equal(f.e.running,true);
});

test('background suspension preserves the remaining party save confirmation window',t=>{
    const f=teamFixture(t);f.tick();const at=f.e.driver.teamTask.pending.at;f.e.hiddenAt=f.now();f.advance(300000);f.e.resumeUIClock(f.now());
    assert.equal(f.e.driver.teamTask.pending.at,at+300000);f.tick();assert.equal(f.drags.length,1);assert.ok(f.e.driver.teamTask);
});

test('route decisions distinguish the selected party from the real travelling party',t=>{
    const f=fixture(t);f.s.team=['b','a'];f.e.target={...H.DATA.chapters[1],key:'1',members:[1]};
    const before=JSON.stringify(f.s),view=H.taskExecutionState(f.s,f.e,f.now());
    assert.match(view.decision.route,/实际路线.*灰色徽章.*目标.*蓝色徽章/);
    assert.match(view.decision.team,/等待治疗点.*水箭龟.*当前行进阵容.*喷火龙/);assert.equal(JSON.stringify(f.s),before);
});

test('decision UI describes drag confirmation, manual ownership and independent activity squads honestly',t=>{
    const f=teamFixture(t);f.tick();let view=H.taskExecutionState(f.s,f.e,f.now());assert.match(view.decision.team,/等待拖放存档确认/);
    f.e.driver.teamTask=null;f.e.settings.autoTeam=false;view=H.taskExecutionState(f.s,f.e,f.now());assert.match(view.decision.team,/保留手动队伍/);
    f.s.adv.event={raid:true,id:35,reg:'kanto'};view=H.taskExecutionState(f.s,f.e,f.now());assert.match(view.decision.team,/专属队伍/);assert.doesNotMatch(view.decision.team,/喷火龙/);
});

test('live squad reasoning comes from its matching task and route instead of a stale assessment',t=>{
    const f=fixture(t);f.e.teamCheck={key:'0',mode:'money',reason:'减少刷钱回合与倒下换人',opponents:3,gain:.4};
    let view=H.taskExecutionState(f.s,f.e,f.now());assert.match(view.decision.reason,/减少刷钱回合.*覆盖 3/);
    f.e.settings.mode='dex';view=H.taskExecutionState(f.s,f.e,f.now());assert.doesNotMatch(view.decision.reason,/减少刷钱回合/);
});

test('background collection yields to a pending native navigation instead of replacing its destination',t=>{
    const f=fixture(t,{respond:false,settings:{autoEggs:true}});f.s.pension={eggs:[{uid:'ready',hatchAt:f.now()-1}]};
    f.e.driver.nav('team');const navigation=f.e.driver.navigation,plan=H.parallelPlan(f.s,f.e,f.now());
    assert.ok(!plan.ready.includes('eggs'));assert.match(plan.blocked.eggs,/页面正在处理/);
    assert.equal(f.e.serviceBackground(f.s,f.now()),false);assert.equal(f.e.driver.navigation,navigation);
    f.e.farmWait={mode:'money'};assert.equal(f.e.nextDelay(f.now()),1200);
});

test('switching queue goals discards old navigation and squad explanations without changing the game save',t=>{
    const f=fixture(t,{respond:false}),before=f.data.get('gachamon-save-v1');
    f.e.queue=H.normalizeJobs([{id:'a',settings:{mode:'money'},status:'running'},{id:'b',settings:{mode:'progress'},status:'pending'}]);
    f.e.queueRunning=true;f.e.queueIndex=0;f.e.teamCheck={mode:'money',reason:'old route'};f.e.driver.nav('team');
    f.e.completeTask('money done');assert.equal(f.e.driver.navigation,null);assert.equal(f.e.teamCheck,null);assert.equal(f.e.settings.mode,'progress');
    assert.equal(f.e.queue[0].status,'done');assert.equal(f.e.running,true);assert.equal(f.data.get('gachamon-save-v1'),before);
});

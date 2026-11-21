const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t){
    const oldDocument=global.document;
    global.document={hidden:false,documentElement:{lang:'zh-Hans'},querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{if(oldDocument===undefined)delete global.document;else global.document=oldDocument;});
    const s={trainer:{id:'raid-priority'},money:1000,mons:[{uid:'a',id:395,level:85}],team:['a'],road:['a'],dex:{},items:{},stats:{},travel:{to:['sinnoh']},
        adv:{layout:H.DATA.layout,chapter:59,unlocked:61,node:2,runs:2,speed:4,loops:[59],badges:['Maître'],gifts:{},deaths:{}}};
    const data=new Map([['pokecatch-tab','tab']]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'progress',progressUntil:83,raids:true,autoTeam:true,autoPrepare:true,autoEggs:false,autoUnderDispatch:false,autoEvolve:false});e.loadAccount(s);
    e.running=true;e.started=Date.now();e.tabToken='tab';e.schedule=()=>{};e.serviceBackground=()=>false;e.driver.nav=()=>true;
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    const p={mode:'progress',phase:'train',phaseAt:Date.now(),lastGrowth:Date.now(),uids:['a'],context:{id:61,kind:'progress',reg:'sinnoh'},targets:[{uid:'a',id:395,goal:88}],originalTeam:['a']};
    return {s,e,p,save};
}

test('a due daily raid preempts new mainline preparation; existing preparation survives a skipped draw, reload and completed raid',async t=>{
    const {s,e,p,save}=fixture(t),now=e.started;
    let coached=0;e.ensurePrepared=()=>{throw Error('ordinary coaching must yield to the scheduled probe');};
    await e.step(now);assert.equal(e.raidProbe,true);assert.equal(e.preparation,null);
    e.deferRaid('已完成',now);e.preparation=p;e.nextRaid=now;e.coach.step=()=>coached++;
    await e.step(now+1);assert.equal(e.raidPreparation,p);assert.equal(e.preparation,null);assert.equal(coached,0);
    const cp=e.progressSnapshot();assert.deepEqual(cp.session.raidPreparation.targets,p.targets);assert.equal(cp.raidProbe,true);
    e.beginTask(s,cp,now+2);e.driver.raidStep=()=>e.deferRaid('已按设置跳过拥有的异色目标',now+3);
    await e.step(now+3);assert.match(e.raidCheckNote,/已按设置跳过/);
    await e.step(now+4);assert.deepEqual(e.preparation.targets,p.targets);assert.equal(coached,1);
    e.nextRaid=now+5;await e.step(now+5);assert.equal(e.preparation,null);
    e.driver.raidStep=()=>{e.driver.raid={reg:'kanto',boss:35,date:H.parisDay(),started:now};s.adv.event={raid:true,reg:'kanto',id:35,loops:0};save();};
    await e.step(now+6);e.ensurePrepared=()=>false;await e.step(now+7);assert.match(e.raidCheckNote,/进行中/);
    s.adv.event=null;save();await e.step(now+8);assert.deepEqual(e.preparation.targets,p.targets);
    assert.equal(e.preparation.lastGrowth,now+8);assert.ok(e.nextRaid>now+8);assert.equal(e.raidPreparation,null);e.stop();
});

test('native pending choices, ordinary battles, expedition, team and candy transactions retain their page until the next safe boundary',t=>{
    const {s,e,p}=fixture(t),now=e.started;e.preparation=p;
    for(const [target,key,value] of [[s.adv,'pending',{type:'gift'}],[s.adv,'battle',{steps:0}],[p,'candyTx',{kind:'use'}],
        [e.driver,'teamTask',{}],[e.services,'underground',{action:'dispatch'}],[e.automation,'buddyTask',{stage:'confirmSave'}],[p,'phase','restore']]){
        const previous=target[key];target[key]=value;assert.equal(e.priorityRaid(s,now),false,key);assert.equal(e.preparation,p);
        target[key]=previous;
    }
    e.preparation=null;
    for(const mode of ['roam','legend','tower','elite','candy','world','breed','resource','underground']){
        e.settings.mode=mode;assert.equal(e.priorityRaid(s,now),false,mode);
    }
    e.settings.mode='progress';s.adv.badges=[];assert.equal(e.priorityRaid(s,now),false);assert.match(e.raidCheckNote,/关都/);
    s.adv.badges=['Maître'];e.settings.raids=false;assert.equal(e.priorityRaid(s,now),false);
});

test('the login state with a Back button yields to the main task and records why the raid did not start',t=>{
    const {s,e}=fixture(t);e.driver.nav=()=>true;e.raidProbe=true;
    global.document.querySelector=selector=>selector==='#raid-root [data-p]'||selector==='#raid-root [data-raid-page="home"]'?{}:null;
    e.driver.click=()=>{throw Error('unexpected redirect');};e.driver.raidStep(s);
    assert.equal(e.raidProbe,false);assert.match(e.raidCheckNote,/登录/);assert.ok(e.nextRaid>Date.now());
});

test('daily Giratina cannot start a prerequisite zone between a raid exit and its settlement check',async t=>{
    const {s,e,save}=fixture(t),now=e.started,day=H.parisDay(now);
    Object.assign(e.settings,{mode:'legend',legendId:487,legendTier:0,dailyWindow:false,dailyCandy:false,dailyWorld:false,dailyTower:false,dailyElite:false});
    e.daily={base:{...e.settings},checking:false};
    e.driver.raid={reg:'kanto',boss:35,date:day,started:now-6000};
    e.driver.navigation={screen:'adventure',started:now-1000};
    s.raids={seen:day,done:{},doneBoss:{}};e.rememberDraw(s,'kanto',35,now);save();
    let visits=0,probes=0;e.legend=()=>visits++;
    e.driver.raidStep=()=>{probes++;};
    await e.step(now);assert.ok(e.raidProbe);assert.equal(visits,0);
    await e.step(now+1000);assert.equal(probes,1);assert.equal(visits,0);
    s.raids.done['kanto|'+day]=1;s.raids.doneBoss['kanto|'+day]=35;save();
    await e.step(now+2000);assert.equal(e.raidProbe,false);assert.equal(visits,1);
    assert.equal(e.settings.legendId,487);assert.equal(e.daily.checking,false);
});

test('continuous ordinary fights on a cleared training map can yield after 15 seconds, while rare, new and frontier encounters stay protected',t=>{
    const {s,e,p}=fixture(t),now=e.started;
    s.adv.nodes=[{},{},{type:'wild'}];s.adv.battle={kind:'wild',enemies:[{id:25}]};s.dex[25]={caught:1};e.preparation=p;
    assert.equal(e.priorityRaid(s,now),false);assert.equal(e.priorityRaid(s,now+14999),false);
    for(const [object,key,value] of [[s.adv.battle,'kind','trainer'],[s.adv.battle,'enemies',[{id:25,shiny:true}]],
        [s.adv.battle,'enemies',[{id:133}]], [s.adv,'chapter',s.adv.unlocked],[s.adv.nodes[2],'phenom','ripple']]){
        const before=object[key];object[key]=value;assert.equal(e.priorityRaid(s,now+16000),false,key);object[key]=before;
    }
    assert.equal(e.priorityRaid(s,now+16001),true);assert.equal(e.raidPreparation,p);
    s.adv.battle.kind='trainer';let probes=0;e.driver.raidStep=()=>probes++;e.probeRaid(s,now+17000);
    assert.equal(probes,0);assert.match(e.raidCheckNote,/先完成/);s.adv.battle=null;e.probeRaid(s,now+18000);assert.equal(probes,1);
});

test('native warnings require a matching helper launch, exact text and a two-button confirmation; duplicate preference chooses cancel',t=>{
    const {s,e}=fixture(t),d=e.driver;const launch={},cancel={},name={textContent:'皮皮'};
    const body={textContent:'团体战开始后，就不能再重新抽取今天的团体战了。',querySelector:()=>null};
    const modal={querySelector:sel=>({'.modal-body > p':body,'.modal-actions.duo button.primary':launch,'.modal-actions.duo button.ghost':cancel})[sel]};
    global.document.querySelector=selector=>selector==='#modal-root.open .modal'?modal:null;
    e.raidProbe=true;d.raid={date:H.parisDay(),reg:'kanto',boss:35};
    const own=()=>({type:'ally',key:'raid:kanto:35'}),clicks=[];d.click=el=>{clicks.push(el);return true;};
    assert.equal(d.dialog(s),false);assert.deepEqual(clicks,[]);
    d.ownedDialog=own();assert.equal(d.dialog(s),true);assert.equal(clicks.pop(),launch);
    const dup='你已经有异色的皮皮了：捕获后会变成其家族的经验值。仍要开始团体战吗？';
    body.querySelector=()=>name;body.textContent+=dup;e.settings.skipOwnedShiny=false;d.ownedDialog=own();assert.equal(d.dialog(s),true);assert.equal(clicks.pop(),launch);
    body.textContent=dup;e.settings.skipOwnedShiny=true;d.ownedDialog=own();assert.equal(d.dialog(s),true);assert.equal(clicks.pop(),cancel);assert.equal(e.raidProbe,false);
    e.raidProbe=true;d.raid={date:H.parisDay(),reg:'kanto',boss:35};body.textContent='支付金币重新抽取团体战目标？';d.ownedDialog=own();
    assert.equal(d.dialog(s),false);assert.deepEqual(clicks,[]);
});

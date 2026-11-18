const test=require('node:test'),assert=require('node:assert/strict');
const H=require(process.env.POKECATCH_AUDIT_SOURCE||'../Pokecatch自动助手.user.js');

function element(extra={}){
    return{isConnected:true,hidden:false,disabled:false,dataset:{},classList:{contains:()=>false},
        closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],querySelector:()=>null,querySelectorAll:()=>[],
        matches:()=>false,click:()=>{},...extra};
}
function fixture(t,settings={}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};
    let clock=Date.UTC(2026,10,17,12);Date.now=()=>clock;const nodes=new Map(),actions=[],ui={screen:'raid'};
    global.document={hidden:false,documentElement:{classList:{contains:()=>false}},querySelector:selector=>nodes.get(selector)?.[0]||null,querySelectorAll:selector=>nodes.get(selector)||[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const s={trainer:{id:'deep-flows-v332'},money:10000,mons:[{uid:'a',id:6,level:70}],team:['a'],road:['a'],dex:{},items:{},stats:{},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','audit-tab']]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));
    const e=new H.Engine(storage,{mode:'money',autoPrepare:false,autoTeam:false,autoEvolve:false,autoEggs:false,autoUnderCollect:false,raids:false,
        progress:false,legends:false,trainBuddy:false,trainBuff:false,moneyBuff:false,trainLevel:100,itemId:'rare-candy',shinyId:25,...settings});
    e.loadAccount(s);e.read();e.running=true;e.started=clock;e.tabToken='audit-tab';e.nextRaid=Infinity;e.trainProtected=['a'];e.schedule=()=>{};
    e.driver.nav=screen=>{actions.push({type:'nav',screen});ui.screen=screen;return true;};
    return{s,e,ui,nodes,actions,data,save,now:()=>clock,advance:ms=>clock+=ms};
}

for(const mode of ['money','item','train','dex','shiny'])for(const pending of [false,true]){
    test(`${mode} returns to native adventure when ${pending?'a choice':'a battle'} blocks route planning`,async t=>{
        const f=fixture(t,{mode});if(pending)f.s.adv.pending={type:'gym'};else f.s.adv.battle={steps:0,enemies:[{id:19,hp:10}]};f.save();
        const before=f.data.get('gachamon-save-v1');await f.e.step(f.now());
        assert.equal(f.ui.screen,'adventure');assert.ok(f.actions.some(action=>action.screen==='adventure'));
        assert.equal(f.e.driver.pendingMap,null);assert.equal(f.data.get('gachamon-save-v1'),before);assert.equal(f.e.running,true);
    });
}

for(const mode of ['dex','shiny'])test(`${mode} verifies the actual chapter before reusing a remembered route`,async t=>{
    const f=fixture(t,{mode}),ranking=mode==='dex'?H.dexRanking:H.shinyRanking;
    const row=ranking(f.s,f.e.settings,{},f.now())[0];assert.ok(row);
    f.e.target=row;f.e.visit={started:f.now(),deaths:0};f.s.adv.chapter=H.DATA.chapters.find(chapter=>chapter.id<=8&&!row.members.includes(chapter.id)).id;f.save();
    await f.e.step(f.now());assert.ok(f.e.driver.pendingMap,'a changed native chapter requires a real route launch');
    assert.equal(f.e.running,true);assert.notEqual(f.e.driver.pendingMap.row.members.includes(f.s.adv.chapter)&&f.e.driver.pendingMap.row.key===row.key,true);
});

test('an abandoned dex route is not cooled down as though it had been farmed for the full rotation window',async t=>{
    const f=fixture(t,{mode:'dex'}),row=H.dexRanking(f.s,f.e.settings,{},f.now())[0];assert.ok(row);
    f.e.target=row;f.e.visit={started:f.now()-f.e.settings.rotateMinutes*60000-1,deaths:0};
    f.s.adv.chapter=H.DATA.chapters.find(chapter=>chapter.id<=8&&!row.members.includes(chapter.id)).id;f.save();
    await f.e.step(f.now());assert.equal(f.e.cooldowns[row.key],undefined);assert.ok(f.e.driver.pendingMap);
});

test('a ready bench squad waiting for a native choice returns to adventure before configuring the PC',t=>{
    const f=fixture(t,{mode:'progress',autoPrepare:true,autoTeam:true});
    f.s.mons=[{uid:'weak',id:129,level:5},{uid:'ready',id:150,level:100}];f.s.team=['weak'];f.s.road=['weak'];f.s.adv.pending={type:'gym'};
    const context={kind:'progress',key:'audit-ready',id:0,reg:'kanto',level:15,size:1,foes:[{id:10,level:5,weight:1}]};
    assert.equal(H.preparationReadiness(f.s,f.e.settings,context,['ready']).ready,true);
    assert.equal(f.e.ensurePrepared(f.s,context,{},f.now()),true);assert.equal(f.e.driver.teamTask,null);
    assert.equal(f.ui.screen,'adventure');assert.deepEqual(f.s.team,['weak']);
});

function overlayFixture(t,kind,{information=false,unknown=false}={}){
    const f=fixture(t),button=element({classList:{contains:name=>name==='gold'},click:()=>{f.actions.push({type:'ack'});f.nodes.delete('#modal-root.open');f.nodes.delete('#modal-root.open .modal');f.nodes.delete('#modal-root.open .modal.dexcard-modal:has(.dc-new)');}});
    const modal=element({matches:selector=>!unknown&&(information?selector==='.dexcard-modal':selector==='.dexcard-modal:has(.dc-new)'),
        querySelector:selector=>information&&selector==='.dexcard'?{}:information&&selector==='.dc-x'?button:null,
        querySelectorAll:selector=>selector==='.modal-actions button'&&!information&&!unknown?[button]:[]});
    f.nodes.set('#modal-root.open',[modal]);f.nodes.set('#modal-root.open .modal',[modal]);
    if(!information&&!unknown)f.nodes.set('#modal-root.open .modal.dexcard-modal:has(.dc-new)',[modal]);
    const skip=element({click:()=>f.actions.push({type:'skip'})}),fx=element({querySelectorAll:()=>[skip]});
    if(kind==='egg'){
        f.e.automation.state.eggService={started:f.now(),tx:{uid:'egg',before:0,at:f.now()}};
        f.e.automation.state.eggReceiptUntil=f.now()+15000;f.nodes.set('.lk-fx.lk-hatch,.hatch-fx:not(.gift)',[fx]);
    }else{
        f.e.automation.state.evolution={uid:'a',fromId:5,toId:6,started:f.now(),clickedAt:f.now(),stage:'confirm'};
        f.nodes.set('.lk-fx.lk-evo',[fx]);
    }
    return{...f,run:()=>kind==='egg'?f.e.automation.eggUI(f.s,f.now()):f.e.automation.evolutionUI(f.s,f.now())};
}

for(const kind of ['egg','evolution']){
    for(const information of [false,true])test(`${kind} animation first dismisses a safe ${information?'information card':'new-capture receipt'} above it`,t=>{
        const f=overlayFixture(t,kind,{information});assert.equal(f.run(),true);assert.deepEqual(f.actions,[{type:'ack'}]);
        assert.equal(f.e.budget.used,0);assert.equal(f.e.budget.spent,0);
    });
    test(`${kind} animation leaves an unknown choice above it for the user and never skips behind it`,t=>{
        const f=overlayFixture(t,kind,{unknown:true});assert.equal(f.run(),true);assert.deepEqual(f.actions,[]);assert.equal(f.e.running,true);
    });
}

test('returning from a hidden tab preserves UI probe and factory confirmation deadlines without moving native timers',t=>{
    const f=fixture(t),start=f.now(),deadline=start-1000;
    f.e.hiddenAt=start;f.e.raidProbe=true;f.e.raidProbeStarted=deadline;
    f.e.legendProbe={started:deadline};f.e.driver.ownedDialog={type:'factoryTeam',started:deadline,pending:{at:deadline,before:'a'}};
    f.e.automation.state.worldResultAt=deadline;f.e.nextRaid=start+600000;
    f.s.pension={eggs:[{uid:'egg',hatchAt:start+3000}]};f.s.under={slots:[{end:start+4000}]};
    f.advance(300000);f.e.resumeUIClock(f.now());
    assert.equal(f.e.raidProbeStarted,deadline+300000);assert.equal(f.e.legendProbe.started,deadline+300000);
    assert.equal(f.e.driver.ownedDialog.started,deadline+300000);assert.equal(f.e.driver.ownedDialog.pending.at,deadline+300000);
    assert.equal(f.e.automation.state.worldResultAt,deadline+300000);assert.equal(f.e.nextRaid,start+600000);
    assert.equal(f.s.pension.eggs[0].hatchAt,start+3000);assert.equal(f.s.under.slots[0].end,start+4000);
    f.e.resumeUIClock(f.now()+1000);assert.equal(f.e.raidProbeStarted,deadline+300000,'exclude the background interval only once');
});

test('a resumed raid probe still gets its remaining UI window instead of aborting immediately',t=>{
    const f=fixture(t),start=f.now();f.e.hiddenAt=start;f.e.raidProbe=true;f.e.raidProbeStarted=start-1000;
    let calls=0;f.e.driver.raidStep=()=>{calls++;};f.advance(300000);f.e.resumeUIClock(f.now());f.e.probeRaid(f.s,f.now());
    assert.equal(calls,1);assert.equal(f.e.raidProbe,true);f.advance(90000);f.e.probeRaid(f.s,f.now());assert.equal(f.e.raidProbe,false);
});

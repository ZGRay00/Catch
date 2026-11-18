const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

// The native browser fixture covers animation/pointer semantics. These state tests
// use a separate native save and read-only helper copy to expose delayed writes.
function fixture(t,settings={},options={}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};
    let clock=Date.UTC(2026,10,17,12),nativeSaving=false;Date.now=()=>clock;
    const s={trainer:{id:'evolution-v311'},money:10000,mons:[{uid:'leaf',id:2,level:60,xp:0,reg:'kanto',shiny:false}],team:['leaf'],road:['leaf'],dex:{2:{caught:1}},items:{'leaf-stone':3},stats:{wins:0,caught:1,battles:0},travel:{to:[]},pension:{mons:[],eggs:[]},
        adv:{layout:H.DATA.layout,chapter:8,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','evolution-tab']]),actions=[],writes=[];
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(key==='gachamon-save-v1'&&!nativeSaving)throw Error('Helper must never write the native save');writes.push({key,value:String(value)});data.set(key,String(value));},removeItem:key=>data.delete(key)};
    const save=()=>{nativeSaving=true;try{storage.setItem('gachamon-save-v1',JSON.stringify(s));}finally{nativeSaving=false;}};
    const ui={screen:'adventure',modal:null,card:null,shownUid:null,fx:[]};
    const node=(extra={})=>{
        const classes=new Set(extra.classes||[]);
        return{isConnected:true,hidden:false,disabled:false,dataset:{},textContent:'',value:'',tagName:'DIV',
            classList:{contains:key=>classes.has(key)},closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],
            getBoundingClientRect:()=>({left:10,top:10,right:60,bottom:60,width:50,height:50}),
            querySelector:()=>null,querySelectorAll:()=>[],matches:()=>false,dispatchEvent:()=>true,click:()=>{},...extra};
    };
    const clearCard=()=>{if(ui.card)ui.card.isConnected=false;if(ui.modal)ui.modal.isConnected=false;ui.modal=null;ui.card=null;ui.shownUid=null;};
    const close=node({classes:['dc-x'],click:()=>{actions.push({type:'close'});clearCard();}});
    const commit=(toId=3)=>{s.mons[0].id=toId;s.dex[toId]||={caught:1};save();if(options.reopenCard!==false)openCard(s.mons[0].uid);};
    const evolve=node({classes:['evo-btn','gold'],textContent:'Evolve',title:'进化为妙蛙花',click:()=>{actions.push({type:'evolve',uid:ui.shownUid});clearCard();if(!options.deferCommit)commit();}});
    function openCard(uid){
        clearCard();
        ui.shownUid=uid;const mon=s.mons.find(mon=>mon.uid===uid)||s.mons[0];
        const img=node({tagName:'IMG',dataset:{id:String(mon.id)},getAttribute:key=>key==='src'?`assets/pokemon/${mon.id}.png`:null});
        ui.card=node({classes:['mon-card'],dataset:{uid},textContent:H.MONS.get(mon.id)?.name||String(mon.id),
            querySelector:selector=>selector.includes('.evo-btn')?evolve:selector.includes('.dc-x')?close:selector.includes('img')?img:null,
            querySelectorAll:selector=>selector==='img'?[img]:selector.includes('.evo-btn')?[evolve]:[],
            matches:selector=>selector==='.mon-card'});
        ui.modal=node({classes:['modal','mon-modal','dexcard-modal'],querySelector:selector=>selector.includes('.mon-card')?ui.card:selector.includes('.evo-btn')?evolve:selector.includes('.dc-x')?close:/mon-modal|dexcard-modal|^\.modal$/.test(selector)?ui.modal:null,
            querySelectorAll:selector=>selector==='img'?[img]:selector.includes('.evo-btn')?[evolve]:[],matches:selector=>/mon-modal|dexcard-modal|\.modal/.test(selector)});
    }
    const search=node({tagName:'INPUT'});
    const cells=()=>ui.screen==='team'?s.mons.filter(mon=>!search.value||String(mon.id)===search.value||H.MONS.get(mon.id)?.name.includes(search.value)).map(mon=>node({classes:['pc-cell'],dataset:{uid:mon.uid},click:()=>{actions.push({type:'card',uid:mon.uid});openCard(mon.uid);}})):[];
    global.document={hidden:false,
        querySelector(selector){
            if(selector==='#modal-root.open')return ui.modal;
            if(selector.includes('#modal-root.open')){if(!ui.modal)return null;if(selector.includes('.evo-btn'))return evolve;if(selector.includes('.dc-x'))return close;if(selector.includes('.mon-card'))return ui.card;return ui.modal;}
            if(selector==='#evt-pick')return null;
            if(selector.includes('#pc-search'))return ui.screen==='team'?search:null;
            if(selector.includes('#pc-grid')||selector.includes('#team-slots'))return cells().find(el=>!selector.includes('[data-uid=')||selector.includes(`"${el.dataset.uid}"`)||selector.includes(`'${el.dataset.uid}'`))||null;
            if(selector==='.screen.active[id^="screen-"]')return node({id:'screen-'+ui.screen});
            if(/^#screen-[a-z]+\.active$/.test(selector))return selector===`#screen-${ui.screen}.active`?node():null;
            const tab=/^#tabs \[data-screen="([^"]+)"\]$/.exec(selector);if(tab)return node({dataset:{screen:tab[1]},click:()=>{ui.screen=tab[1];}});
            return null;
        },
        querySelectorAll(selector){if(selector.includes('#pc-grid')||selector.includes('#team-slots'))return cells();if(/fx|gift/.test(selector))return ui.fx;return[];},
    };
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const e=new H.Engine(storage,{mode:'progress',autoTeam:true,autoPrepare:false,autoEggs:false,autoEvolve:true,raids:false,trainBuddy:false,trainBuff:false,moneyBuff:false,...settings});
    e.loadAccount(s);e.read();e.running=true;e.started=clock;e.tabToken='evolution-tab';e.schedule=()=>{};e.automation.begin(s);
    function install(engine){
        engine.schedule=()=>{};
        engine.driver.nav=screen=>{actions.push({type:'nav',screen});ui.screen=screen;return true;};
        engine.driver.input=(input,value)=>{actions.push({type:'input',value});input.value=value;return true;};
        engine.driver.click=(el,label)=>{if(!el||el.disabled||!el.isConnected)return false;engine.driver.lastClick=clock;el.click?.();return true;};
        engine.driver.animations=engine.driver.dismissInformation=engine.driver.receipt=engine.driver.dialog=engine.driver.gift=()=>false;
    }
    install(e);
    const service=(engine=e)=>engine.automation.evolution(engine.read(),clock);
    const tick=async(engine=e)=>{engine.driver.lastClick=0;await engine.step(clock);clock+=1200;};
    const until=async(predicate,n=20,engine=e)=>{for(let i=0;i<n&&!predicate();i++)await tick(engine);};
    return{s,e,storage,ui,actions,writes,save,commit,openCard,install,service,tick,until,now:()=>clock,advance:ms=>clock+=ms,evolveClicks:()=>actions.filter(action=>action.type==='evolve')};
}

test('free level evolution is enabled by default but explicit opt-out is retained',()=>{
    assert.equal(H.DEFAULTS.autoEvolve,true);assert.equal(H.normalizeSettings({autoEvolve:false}).autoEvolve,false);
});

test('disabled evolution support never opens or evolves an eligible member',t=>{
    const f=fixture(t,{autoEvolve:false});assert.equal(f.service(),false);assert.deepEqual(f.actions,[]);assert.equal(f.s.mons[0].id,2);
});

function reserveFixture(t){
    const f=fixture(t);
    f.s.mons=Array.from({length:30},(_,i)=>({uid:'pc'+i,id:18,level:5,reg:'kanto'}));
    f.s.mons.push({uid:'gull',id:278,level:100,reg:'hoenn'});
    f.s.team=f.s.mons.slice(0,6).map(mon=>mon.uid);f.s.road=[...f.s.team];f.s.travel.to=['hoenn'];f.save();
    return f;
}
async function completedSearch(job){
    for(let i=0;i<500&&!job.result&&!job.error;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ifError(job.error);assert.ok(job.result);return job.result;
}
test('reserve evolution yields the screen to the adventure solver and rechecks new daycare duplicates before opening it',async t=>{
    const f=reserveFixture(t),e=f.e;
    assert.equal(e.serviceBackground(e.read(),f.now()),false);
    const initial=e.evolutionSearch;assert.ok(initial);assert.equal(f.ui.screen,'adventure');assert.equal(e.automation.state.evolution,undefined);
    e.fitTeam(e.read(),f.now());const partyJob=e.teamSearch;assert.ok(partyJob);assert.equal(e.evolutionSearch,initial);
    const [reserve]=await Promise.all([completedSearch(initial),completedSearch(partyJob)]);
    assert.equal(reserve.uid,'gull');assert.equal(f.actions.length,0);
    f.s.pension.mons=[{mon:{uid:'daycare',id:279,reg:'hoenn'}}];f.save();
    assert.equal(f.service(),false);assert.notEqual(e.evolutionSearch,initial);assert.equal(e.teamSearch,partyJob);
    assert.equal((await completedSearch(e.evolutionSearch)).uid,null);
    assert.equal(f.service(),false);assert.equal(e.teamSearch,partyJob);assert.equal(f.actions.length,0);
    f.s.pension.mons=[];f.save();e.cancelTeamSearch('teamSearch');
    assert.equal(f.service(),false);await completedSearch(e.evolutionSearch);
    assert.equal(f.service(),true);assert.equal(e.automation.state.evolution.uid,'gull');
    assert.equal(e.automation.state.evolution.toId,279);
    assert.equal(f.evolveClicks().length,0);
});
test('manual handoff cancels both scoring jobs without leaving an evolution transaction',t=>{
    const f=reserveFixture(t),e=f.e;
    f.service();e.fitTeam(e.read(),f.now());
    assert.ok(e.teamSearch&&e.evolutionSearch);
    e.manualInput(f.now());
    assert.ok(e.manual);
    assert.equal(e.teamSearch,null);assert.equal(e.evolutionSearch,null);
    assert.equal(e.automation.state.evolution,undefined);assert.equal(f.actions.length,0);
});

test('a level 68 Wingull under preparation takes precedence over an earlier eligible party member',t=>{
    const f=fixture(t);
    const gull={uid:'gull',id:278,level:68,reg:'sinnoh'};
    f.s.mons.push(gull);f.s.team.push(gull.uid);f.s.travel.to=['hoenn','sinnoh'];f.save();
    f.e.preparation={targets:[{uid:gull.uid,id:278,goal:72}]};
    assert.equal(f.service(),true);
    assert.equal(f.e.automation.state.evolution.uid,'gull');
    assert.equal(f.e.automation.state.evolution.toId,279);
});

test('an already completed mainline task does not start a new irreversible evolution',t=>{
    const f=fixture(t,{progressUntil:0});assert.equal(f.service(),false);assert.deepEqual(f.actions,[]);assert.equal(f.s.mons[0].id,2);
});

test('reaching the money goal completes before evolving an otherwise eligible member',t=>{
    const f=fixture(t,{mode:'money',moneyTarget:100});assert.equal(f.service(),false);assert.deepEqual(f.actions,[]);assert.equal(f.s.mons[0].id,2);
});

test('free evolution keeps the same UID and task budgets while returning to adventure',async t=>{
    const f=fixture(t);f.e.budget.spent=123;f.e.budget.used=2;
    await f.until(()=>f.evolveClicks().length===1,20);await f.until(()=>!f.e.automation.state.evolution&&f.ui.screen==='adventure',20);
    assert.equal(f.s.mons[0].id,3);assert.equal(f.s.mons[0].uid,'leaf');assert.deepEqual(f.s.team,['leaf']);
    assert.equal(f.e.budget.spent,123);assert.equal(f.e.budget.used,2);assert.equal(f.e.settings.mode,'progress');assert.equal(f.e.running,true);
    assert.equal(f.evolveClicks().length,1);assert.equal(f.ui.screen,'adventure');
});

test('an evolution waiting on a native save cannot be clicked twice',async t=>{
    const f=fixture(t,{}, {deferCommit:true});await f.until(()=>f.evolveClicks().length===1,20);
    for(let i=0;i<5;i++)await f.tick();assert.equal(f.evolveClicks().length,1);assert.equal(f.e.read().mons[0].id,2);
    const record=JSON.parse(f.storage.getItem('pokecatch-helper:v1:evolution-v311'));
    assert.equal(record.resume.flow.evolution.uid,'leaf');assert.equal(record.resume.flow.evolution.fromId,2);assert.equal(record.resume.flow.evolution.toId,3);
    f.s.mons[0].id=3;await f.tick();assert.ok(f.e.automation.state.evolution,'unsaved native mutation is not a helper confirmation');
    f.save();await f.until(()=>!f.e.automation.state.evolution,20);assert.equal(f.evolveClicks().length,1);assert.equal(f.e.read().mons[0].id,3);
});

test('a pending evolution can resume from its checkpoint without another native click',async t=>{
    const f=fixture(t,{}, {deferCommit:true});await f.until(()=>f.evolveClicks().length===1,20);f.e.budget.spent=250;f.e.budget.used=3;f.e.persist();f.e.release();
    const resumed=new H.Engine(f.storage);resumed.loadAccount(f.s);f.install(resumed);resumed.tryResume();
    assert.equal(resumed.running,true);assert.equal(resumed.budget.spent,250);assert.equal(resumed.budget.used,3);
    f.advance(1200);await f.tick(resumed);assert.equal(f.evolveClicks().length,1);
    f.commit();await f.until(()=>!resumed.automation.state.evolution,20,resumed);assert.equal(f.evolveClicks().length,1);assert.equal(resumed.read().mons[0].id,3);resumed.stop();
});

test('background duration does not expire a pending native evolution confirmation',async t=>{
    const f=fixture(t,{}, {deferCommit:true});await f.until(()=>f.evolveClicks().length===1,20);
    f.e.hiddenAt=f.now();f.advance(60000);f.e.resumeUIClock(f.now());await f.tick();
    assert.equal(f.e.running,true);assert.equal(f.evolveClicks().length,1);
    f.commit();await f.until(()=>!f.e.automation.state.evolution,20);assert.equal(f.e.read().mons[0].id,3);assert.equal(f.evolveClicks().length,1);
});

test('manual handoff preserves a pending evolution without approving further actions',async t=>{
    const f=fixture(t,{}, {deferCommit:true});await f.until(()=>f.evolveClicks().length===1,20);
    const count=f.actions.length;f.e.manual={until:f.now()+15000};f.service();assert.equal(f.actions.length,count);
    f.e.manual=null;f.commit();await f.until(()=>!f.e.automation.state.evolution,20);assert.equal(f.evolveClicks().length,1);assert.equal(f.e.read().mons[0].id,3);
});

test('a restored member card is closed before reopening its saved UID for evolution',async t=>{
    const f=fixture(t);f.s.mons.push({uid:'other',id:2,level:60,xp:0,reg:'kanto'});f.save();
    await f.until(()=>f.e.automation.owner?.kind==='evolution',20);const owner=f.e.automation.snapshotOwner();assert.equal(owner.uid,'leaf');
    f.openCard('other');f.e.automation.owner=null;f.e.automation.restoreOwner(owner);await f.tick();
    assert.equal(f.evolveClicks().length,0);assert.equal(f.ui.modal,null);
    await f.until(()=>f.evolveClicks().length===1,20);assert.equal(f.evolveClicks()[0].uid,'leaf');assert.equal(f.s.mons.find(mon=>mon.uid==='other').id,2);
});

test('a different saved species cannot be acknowledged as the expected evolution',async t=>{
    const f=fixture(t,{}, {deferCommit:true});await f.until(()=>f.evolveClicks().length===1,20);f.commit(9);f.service();
    assert.equal(f.e.automation.state.evolved||0,0);assert.equal(f.e.read().mons[0].id,9);assert.equal(f.evolveClicks().length,1);
    assert.ok(f.ui.modal,'unrelated member details remain for inspection');
});

test('item evolutions, unresolved branches and ranked members are not auto-evolved',t=>{
    const f=fixture(t);f.s.mons=[{uid:'stone',id:25,level:60,reg:'kanto'},{uid:'branch',id:133,level:60,reg:'kanto'},{uid:'ranked',id:2,level:60,rank:1,reg:'kanto'}];f.s.team=f.s.mons.map(mon=>mon.uid);f.s.road=[...f.s.team];f.s.items={'thunder-stone':3,'fire-stone':3,'water-stone':3};f.save();
    assert.equal(f.service(),false);assert.deepEqual(f.actions,[]);assert.deepEqual(f.s.mons.map(mon=>mon.id),[25,133,2]);
});

const gates={
    'an active native battle':f=>{f.s.adv.battle={};},
    'a pending native choice':f=>{f.s.adv.pending={type:'gift'};},
    'a raid':f=>{f.s.adv.event={raid:true};},
    'a legendary zone':f=>{f.s.adv.zone={id:145};},
    'a tower run':f=>{f.s.adv.tower={back:8};},
    'a factory run':f=>{f.s.adv.tower={kind:'candy'};},
    'an elite league':f=>{f.s.adv.league={reg:'kanto'};},
    'a party swap':f=>{f.e.driver.teamTask={};},
    'a special team dialog':f=>{f.e.driver.ownedDialog={};},
    'an owned item card':f=>{f.e.automation.owner={kind:'mon'};},
    'a buddy transaction':f=>{f.e.automation.buddyTask={};},
    'an automatic berry action':f=>{f.e.automation.state.autoBuffTx={};},
    'a resource purchase':f=>{f.e.automation.state.resourceTx={};},
    'a factory launch confirmation':f=>{f.e.automation.state.candyLaunch={at:f.now()};},
    'a tower launch confirmation':f=>{f.e.automation.state.towerLaunch={at:f.now()};},
    'egg collection':f=>{f.e.automation.state.eggService={started:f.now()};},
    'manual control':f=>{f.e.manual={until:f.now()+10000};},
    'the background tab':()=>{document.hidden=true;},
    'a native pause':f=>{f.s.adv.paused=true;},
};
for(const[name,gate]of Object.entries(gates))test('free evolution yields to '+name,t=>{
    const f=fixture(t);gate(f);f.save();assert.equal(f.service(),false);assert.deepEqual(f.actions,[]);assert.equal(f.s.mons[0].id,2);
});

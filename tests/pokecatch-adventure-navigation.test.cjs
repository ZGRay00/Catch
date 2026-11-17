const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function fixture(t,{mobile=false,screen='raid'}={}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};
    let clock=Date.UTC(2026,10,17,12);Date.now=()=>clock;
    const ui={screen},actions=[],nodes=new Map();
    function element(extra={}){
        return{isConnected:true,hidden:false,disabled:false,dataset:{},classes:new Set(),
            get classList(){return{contains:name=>this.classes.has(name)};},
            closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}],...extra};
    }
    const tab=element({hidden:!mobile,click:()=>{actions.push('tab');ui.screen='adventure';}});
    const chapter=element({hidden:mobile,click:()=>{actions.push('chapter');ui.screen=ui.screen==='adventure'?'map':'adventure';}});
    const active=element();nodes.set('#tabs [data-screen="adventure"]',tab);nodes.set('#side-chapter',chapter);
    global.document={hidden:false,documentElement:{classList:{contains:()=>false}},
        querySelector:selector=>selector==='#screen-adventure.active'?ui.screen==='adventure'?active:null:nodes.get(selector)||null,
        querySelectorAll:()=>[]};
    global.getComputedStyle=el=>({display:el.hidden?'none':'block',visibility:'visible',opacity:'1'});
    t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    const s={trainer:{id:'adventure-navigation'},money:1000,mons:[{uid:'a',id:6,level:100}],team:['a'],road:['a'],dex:{},items:{},stats:{},
        travel:{to:['johto','hoenn','sinnoh']},adv:{layout:H.DATA.layout,chapter:50,unlocked:50,node:6,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','navigation-tab']]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const e=new H.Engine(storage,{mode:'progress',progressUntil:65,autoPrepare:false,autoTeam:false,autoEvolve:false,raids:false,autoEggs:false,autoUnderCollect:false});
    e.loadAccount(s);e.read();e.running=true;e.started=clock;e.tabToken='navigation-tab';e.nextRaid=Infinity;e.schedule=()=>{};
    return{s,e,ui,tab,chapter,active,actions,data,nodes,now:()=>clock,advance:ms=>clock+=ms,save:()=>storage.setItem('gachamon-save-v1',JSON.stringify(s))};
}

test('desktop returns through the visible chapter card when the native adventure tab is hidden',t=>{
    const f=fixture(t);assert.equal(f.e.driver.nav('adventure'),false);assert.equal(f.ui.screen,'adventure');assert.deepEqual(f.actions,['chapter']);
    assert.equal(f.e.driver.nav('adventure'),true);assert.deepEqual(f.actions,['chapter'],'never click the chapter card again and reopen the map');
});

test('mobile keeps using its visible adventure tab',t=>{
    const f=fixture(t,{mobile:true});assert.equal(f.e.driver.nav('adventure'),false);assert.equal(f.ui.screen,'adventure');assert.deepEqual(f.actions,['tab']);
});

for(const screen of ['raid','team','pension','underground','map'])test(`desktop can return from ${screen} without changing the game save`,t=>{
    const f=fixture(t,{screen}),before=f.data.get('gachamon-save-v1');f.e.driver.nav('adventure');
    assert.equal(f.ui.screen,'adventure');assert.equal(f.data.get('gachamon-save-v1'),before);assert.deepEqual(f.actions,['chapter']);
});

test('an active adventure screen whose layout is temporarily hidden does not toggle the chapter menu',t=>{
    const f=fixture(t,{screen:'adventure'});f.active.hidden=true;f.e.driver.nav('adventure');assert.deepEqual(f.actions,[]);assert.equal(f.ui.screen,'adventure');
});

test('chapter fallback respects hidden pages, disabled controls, manual handoff and click throttling',t=>{
    const f=fixture(t);global.document.hidden=true;f.e.driver.nav('adventure');assert.deepEqual(f.actions,[]);
    global.document.hidden=false;f.chapter.disabled=true;f.e.driver.nav('adventure');assert.deepEqual(f.actions,[]);
    f.chapter.disabled=false;f.e.manual={until:f.now()+15000};f.e.driver.nav('adventure');assert.deepEqual(f.actions,[]);
    f.e.manual=null;f.e.driver.lastClick=f.now();f.e.driver.nav('adventure');assert.deepEqual(f.actions,[]);
    f.advance(701);f.e.driver.nav('adventure');assert.deepEqual(f.actions,['chapter']);
});

test('a locked native adventure tab cannot be bypassed through the chapter card',t=>{
    const f=fixture(t);f.tab.classes.add('hold');f.e.driver.nav('adventure');assert.deepEqual(f.actions,[]);assert.equal(f.ui.screen,'raid');
});

test('settled raid returns to unfinished mainline including a pending native choice',async t=>{
    const f=fixture(t);f.s.adv.pending={type:'gym'};f.save();const before=f.data.get('gachamon-save-v1');
    f.e.driver.raid={reg:'kanto',boss:29,started:f.now()-60000};
    for(const name of ['animations','dismissInformation','receipt','dialog','gift'])f.e.driver[name]=()=>false;
    await f.e.step(f.now());assert.equal(f.e.driver.raid,null);assert.equal(f.ui.screen,'adventure');assert.deepEqual(f.actions,['chapter']);
    assert.match(f.e.status,/推进主线/);assert.equal(f.e.running,true);assert.equal(f.data.get('gachamon-save-v1'),before);
    f.advance(1200);await f.e.step(f.now());assert.deepEqual(f.actions,['chapter']);assert.equal(f.ui.screen,'adventure');
});

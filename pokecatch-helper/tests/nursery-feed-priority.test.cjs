'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../../Pokecatch自动助手.user.js');

function scenario(t){
    const start=1700000000000,s={trainer:{id:'berry-priority',since:start},adv:{layout:H.DATA.layout,chapter:0},
        items:{'belue-berry':3},pension:{mons:[{mon:{uid:'ditto',id:132}},{mon:{uid:'parent',id:1,shiny:true}}],
            open:{eggs:4},eggs:[],laid:148,tick:start,egg:H.NURSERY_RULES.eggMs}};
    const needs=k=>{const roll=H.nurseryFixedRoll(s,k);return roll>=1/16&&roll<1/8;};
    for(let i=0;!needs(148)||!needs(149)||needs(150);i++)s.trainer.id='berry-'+i;
    let screen='adventure',stockClicks=0,owner=true,accept=true,liveReserve=null,liveEggs=null;
    const rows=new Map(),storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)};
    const e=new H.Engine(storage);e.account=s.trainer.id;e.ownsGameTab=()=>owner;e.persist=()=>true;
    const save=()=>{e.state=s;e.raw=JSON.stringify(s);storage.setItem('gachamon-save-v1',e.raw);};
    const read=e.read=()=>s;save();e.nurseryAssist.load();
    Object.assign(e.nurseryAssist.prefs,{idleHatch:true,autoFeed:true,allowReferenceFeed:true});
    storage.setItem(e.nurseryAssist.key,JSON.stringify(e.nurseryAssist.prefs));
    const element=()=>({isConnected:true,getAttribute:()=>null,closest:()=>null,classList:{contains:()=>false},getClientRects:()=>[1]});
    const tab=id=>({...element(),click:()=>{screen=id;}});
    const tip={querySelector:()=>({textContent:(liveReserve??s.pension.bx)?`En réserve : ${liveReserve??s.pension.bx} / 4, une par œuf.`:'En garde jusqu’à 4, une par œuf.'})};
    const button={...element(),closest:sel=>sel==='.pension-berry-slot'?tip:null,querySelector:()=>({textContent:'×'+s.items['belue-berry']}),click:()=>{
        stockClicks++;
        if(accept){s.items['belue-berry']--;s.pension.bx=(s.pension.bx||0)+1;save();}
    }};
    t.after(()=>{delete global.document;delete global.window;delete global.getComputedStyle;});
    global.window={BUILD:'adf601dce2'};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    global.document={hidden:false,documentElement:{matches:()=>false,classList:{contains:()=>false}},
        querySelectorAll:sel=>sel.startsWith('script[src')?[{getAttribute:()=>'/bundle/app.65ffd40d41.js'}]:[],
        querySelector(sel){
            if(sel==='.screen.active[id^="screen-"]')return {...element(),id:'screen-'+screen};
            if(sel==='#tabs [data-screen="adventure"]')return tab('adventure');
            if(sel==='#tabs [data-screen="pension"]')return tab('pension');
            if(sel==='#screen-pension.active #pen-eggs'&&screen==='pension')return {querySelectorAll:()=>(liveEggs??s.pension.eggs).map(egg=>({dataset:{egg:egg.uid}}))};
            if(sel==='#screen-pension.active #pen-berries [data-myrte]'&&screen==='pension')return button;
            if(sel==='#modal-root.open')return element();
            return null;
        }};
    const step=(i,opts)=>e.nurseryAssist.priorityFeed(read(),start+2500*i,opts);
    return {e,s,save,storage,step,get clicks(){return stockClicks;},get screen(){return screen;},
        setOwner:value=>{owner=value;},setAccept:value=>{accept=value;},setLiveReserve:value=>{liveReserve=value;},
        setLiveEggs:value=>{liveEggs=value;},setScreen:value=>{screen=value;}};
}

test('priority feeding uses stocked berries for consecutive required eggs through a manual legendary battle and modal at zero allowance',t=>{
    const x=scenario(t),{e,s}=x;e.running=true;e.settings.useBudget=0;e.manual={until:Infinity};
    s.adv.zone={id:644};s.adv.paused=true;s.adv.pending={type:'pick'};
    s.pension.eggs=Array.from({length:4},(_,i)=>({uid:'mature-'+i,id:1,k:144+i,hatchAt:1}));x.save();
    const mapRequest=e.driver.navigation={screen:'map'};
    for(let i=0;i<10;i++)x.step(i);
    assert.equal(x.clicks,2);assert.equal(s.pension.bx,2);assert.equal(e.budget.used,2);
    assert.equal(x.screen,'adventure');assert.equal(e.driver.navigation,mapRequest);
    assert.equal(x.step(11,{beforeHatch:true}),false);
    assert.ok(e.logs.some(row=>row.text.includes('#148')));assert.ok(e.logs.some(row=>row.text.includes('#149')));
});

test('a predicted uncovered shiny holds only the hatch when berries are missing, including on a stopped task',t=>{
    const x=scenario(t),{e,s}=x;s.items['belue-berry']=0;x.save();
    assert.equal(x.step(0),false);assert.equal(x.step(1,{beforeHatch:true}),true);
    assert.match(e.nurseryAssist.note,/库存不足/);
    e.nurseryAssist.prefs.autoFeed=false;assert.equal(x.step(2,{beforeHatch:true}),false);
    e.nurseryAssist.prefs.autoFeed=true;s.pension.mons.length=1;x.save();
    assert.equal(x.step(3,{beforeHatch:true}),false);
    x.storage.setItem('gachamon-save-v1','newer save');
    assert.equal(x.step(4,{beforeHatch:true}),true);
    assert.equal(x.clicks,0);
});

test('idle checks feed while paused, stop on real ownership loss and recheck a changed serial after navigation',t=>{
    const x=scenario(t),{e,s}=x;s.adv.paused=true;x.save();
    e.suspended={at:1};x.setOwner(false);
    e.nurseryAssist.idleStep(1700000000000);assert.equal(x.screen,'adventure');assert.equal(x.clicks,0);
    x.setOwner(true);e.nurseryAssist.idleStep(1700000002500);assert.equal(x.screen,'pension');
    s.pension.laid=150;x.save();e.nurseryAssist.idleStep(1700000005000);
    assert.equal(x.screen,'adventure');assert.equal(x.clicks,0);
    s.pension.laid=148;x.save();for(let i=3;i<12;i++)e.nurseryAssist.idleStep(1700000000000+i*2500);
    assert.equal(x.clicks,2);assert.equal(s.pension.bx,2);assert.equal(e.budget.used,0);
});

test('hatch waits for an identifiable next egg and can proceed when an existing reserve covers it',t=>{
    const x=scenario(t),{e,s}=x;
    document.querySelectorAll=()=>[];
    window.BUILD='unknown-game-build';e.nurseryAssist.prefs.allowReferenceFeed=false;
    assert.equal(x.step(0),false);assert.equal(x.step(1,{beforeHatch:true}),true);
    assert.match(e.nurseryAssist.note,/暂缓自动收蛋/);
    s.pension.bx=1;x.save();assert.equal(x.step(2,{beforeHatch:true}),false);
    delete s.pension.bx;delete s.pension.laid;e.nurseryAssist.prefs.allowReferenceFeed=true;x.save();
    assert.equal(x.step(3,{beforeHatch:true}),true);
    assert.match(e.nurseryAssist.note,/序号/);assert.equal(x.clicks,0);
});

test('an undelivered click can be retried after reload with a new native inventory and reserve check',t=>{
    const x=scenario(t),{e,s}=x;e.running=true;x.setAccept(false);
    x.step(0);x.step(1);assert.equal(x.clicks,1);
    const key=e.nurseryAssist.key+':last-feed';
    const first=JSON.parse(x.storage.getItem(key));
    assert.equal(first.stock,3);assert.equal(first.reserve,0);assert.equal(first.laid,148);assert.equal(first.attempt,1);
    e.nurseryAssist.load();x.setAccept(true);x.setLiveReserve(1);
    for(let i=2;i<19;i++)x.step(i);
    assert.equal(x.clicks,1,'a live reserve ahead of the local save prevents another click');
    x.setLiveReserve(0);
    for(let i=19;i<35&&x.clicks===1;i++)x.step(i);
    assert.equal(x.clicks,2);assert.equal(s.pension.bx,1);assert.equal(e.budget.used,1);
    x.step(36);
    assert.equal(JSON.parse(x.storage.getItem(key)).confirmed,true);
    s.pension.bx=0;s.items['belue-berry']=3;x.save();e.nurseryAssist.load();
    for(let i=37;i<55;i++)x.step(i);
    assert.equal(x.clicks,2,'a confirmed receipt also protects against an older save reappearing');
});

test('a missing receipt with changed stock keeps the slot protected without spending another berry',t=>{
    const x=scenario(t),{s}=x;x.setAccept(false);x.step(0);x.step(1);
    s.items['belue-berry']--;x.save();x.e.nurseryAssist.load();x.setAccept(true);
    for(let i=2;i<50;i++)x.step(i);
    assert.equal(x.clicks,1);assert.equal(x.step(51,{beforeHatch:true}),true);
});

test('a legacy serial waits for two consistent observations before retrying',t=>{
    const x=scenario(t),{e,s}=x;
    const guard=H.nextNurseryFeed(s,{build:'adf601dce2'});
    const key=e.nurseryAssist.key+':last-feed';x.storage.setItem(key,guard.key);
    for(let i=0;i<6;i++)x.step(i);
    assert.equal(x.clicks,0);assert.equal(JSON.parse(x.storage.getItem(key)).attempt,0);
    for(let i=6;i<16&&!x.clicks;i++)x.step(i);
    assert.equal(x.clicks,1);assert.equal(x.s.pension.bx,1);
});

test('a newly laid egg visible ahead of autosave blocks a previous ordinary serial from opening another slot',t=>{
    const x=scenario(t);x.s.pension.laid=150;x.save();x.setScreen('pension');
    x.setLiveEggs([{uid:'fresh',id:1}]);
    assert.equal(x.step(0,{beforeHatch:true}),true);
    assert.match(x.e.nurseryAssist.note,/蛋位已变化/);
    x.s.pension.eggs=[{uid:'fresh',id:1}];x.save();
    assert.equal(x.step(1,{beforeHatch:true}),false);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function fixture(t,settings={}){
    const previousDocument=global.document,previousStyle=global.getComputedStyle;
    const now=Date.now(),s={trainer:{id:'legend-wait-fixture'},money:10000,mons:[{uid:'a',id:6,level:100}],team:['a'],dex:{},items:{},stats:{battles:0,wins:0,caught:0},travel:{to:['johto','hoenn','sinnoh']},
        adv:{layout:6,chapter:0,unlocked:65,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','fixture-tab']]);
    const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'legend',legendId:145,autoPrepare:false,optimizeRaid:false,raids:false,...settings});
    const classes=(...names)=>({contains:name=>names.includes(name)});
    const element=(text='',names=[])=>({isConnected:true,hidden:false,disabled:false,classList:classes(...names),textContent:text,closest:()=>null,getAttribute:()=>null,getClientRects:()=>[{}]});
    const dom={region:element('', ['active']),row:element('', ['sel','lz-open','lz-closed']),go:element('仅在夜间开放'),condition:element('等待原生开放条件')};dom.go.disabled=true;
    const zone=H.DATA.zones.find(z=>z.id===145),row={...zone,key:'Z145',members:[],name:'闪电鸟'};
    global.document={hidden:false,querySelector:selector=>{
        if(selector===`#map-root .rg.open[data-rg="${zone.reg}"]`)return dom.region;
        if(selector==='#map-root .mp-row[data-ch="Z145"]')return dom.row;
        if(selector.startsWith('#map-root .mp-go[data-zone="145"]'))return dom.go;
        if(selector==='#map-root .lz-cond')return dom.condition;
        return null;
    },querySelectorAll:()=>[]};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{if(previousDocument===undefined)delete global.document;else global.document=previousDocument;if(previousStyle===undefined)delete global.getComputedStyle;else global.getComputedStyle=previousStyle;});
    e.loadAccount(s);e.read();e.running=true;e.started=now;e.tabToken='fixture-tab';e.startMoney=s.money;
    const clicks=[];e.driver.nav=()=>true;e.driver.click=(el,label)=>{if(!el||el.disabled)return false;clicks.push(label);return true;};
    e.driver.pendingMap={row,options:{zone:true,optimize:false,tier:e.settings.legendTier||0},started:now};
    return {e,s,dom,row,now,clicks,storage};
}

test('new and unlimited legend settings survive normalization while saved time limits retain their values',()=>{
    for(const key of ['legendMinutes','roamMinutes']){
        for(const value of [undefined,'0',0,5,90,720]){
            const cfg=H.normalizeSettings({[key]:value});
            assert.equal(cfg[key],Number(value)||0);
            assert.equal(H.normalizeSettings(JSON.parse(JSON.stringify(cfg)))[key],cfg[key]);
        }
    }
});
test('an active legendary hunt can continue overnight beyond 150 attempts; explicit timers still stop it',async t=>{
    const {e,s,now,storage}=fixture(t,{legendIds:[145,144]});
    const hour=3600000;
    e.driver.pendingMap=null;e.zoneId=145;e.zoneStarted=now;
    s.adv.zone={id:145,foe:145,loops:0};storage.setItem('gachamon-save-v1',JSON.stringify(s));
    await e.step(now);
    s.adv.zone.loops=300;s.stats.battles=600;
    storage.setItem('gachamon-save-v1',JSON.stringify(s));
    await e.step(now+8*hour);assert.ok(e.running);assert.match(e.status,/捕获传说/);
    e.settings={...e.settings,legendMinutes:90};
    await e.step(now+8*hour+1);assert.equal(e.running,false);assert.match(e.status,/传说战达到时限/);
});
test('a global stop timer still takes precedence over an unlimited legendary hunt',async t=>{
    const {e,now}=fixture(t,{legendMinutes:0,stopMinutes:60});
    await e.step(now+3600000);assert.equal(e.running,false);assert.match(e.status,/定时运行上限/);
});
test('a visible disabled native legendary control waits past both UI and progress watchdogs',async t=>{
    const {e,now,clicks,storage}=fixture(t),save=storage.getItem('gachamon-save-v1');
    await e.step(now);assert.ok(e.driver.pendingMap.waiting);assert.match(e.status,/等待闪电鸟开放.*仅在夜间开放/);
    await e.step(now+360000);await e.step(now+720000);
    assert.equal(e.running,true);assert.ok(e.driver.pendingMap.waiting);assert.equal(e.lastProgress,now+720000);
    assert.equal(clicks.length,0);assert.equal(storage.getItem('gachamon-save-v1'),save);e.stop();
});

test('an unlocked native legendary control starts the saved target and starts the battle timer then',async t=>{
    const {e,dom,now,clicks}=fixture(t);await e.step(now);await e.step(now+360000);
    dom.go.disabled=false;dom.row.classList={contains:name=>['sel','lz-open'].includes(name)};
    await e.step(now+361200);
    assert.equal(e.running,true);assert.equal(e.driver.pendingMap,null);assert.equal(e.zoneId,145);
    assert.equal(e.zoneStarted,now+361200);assert.deepEqual(clicks,['挑战闪电鸟']);e.stop();
});

test('a missing native challenge control retains the ordinary 60 second map timeout',async t=>{
    const {e,dom,now}=fixture(t);dom.go=null;await e.step(now);
    assert.equal(e.driver.pendingMap.waiting,undefined);
    await e.step(now+60001);assert.equal(e.running,false);assert.match(e.status,/地图操作超时/);
});

test('native prerequisite locks have no chapter button and launch the outer goal planner', async t=>{
    const {e,dom,now,clicks}=fixture(t);dom.row=null;
    const query=document.querySelector;
    document.querySelector=sel=>sel==='#map-root .mp-row.lz-lock'?dom.condition:query(sel);
    await e.step(now);
    assert.equal(e.lockedLegend,145);assert.equal(e.driver.pendingMap,null);
    e.legend(e.read(),now+1200);
    assert.ok(e.driver.pendingMap?.row.gateRoute);
    assert.equal(e.settings.legendId,145);assert.equal(clicks.length,0);
});

test('a missing legendary row is a UI failure rather than a permanent condition wait',async t=>{
    const {e,dom,now}=fixture(t);dom.row=null;await e.step(now);
    assert.equal(e.running,true);assert.equal(e.driver.pendingMap.waiting,undefined);
    await e.step(now+60001);assert.equal(e.running,false);assert.match(e.status,/地图操作超时/);
});

test('if a known locked control disappears, a fresh UI timeout replaces its condition wait',async t=>{
    const {e,dom,now}=fixture(t);await e.step(now);await e.step(now+360000);
    dom.go=null;await e.step(now+361200);
    assert.equal(e.running,true);assert.equal(e.driver.pendingMap.waiting,undefined);assert.equal(e.driver.pendingMap.started,now+361200);
    await e.step(now+421201);assert.equal(e.running,false);assert.match(e.status,/地图操作超时/);
});

test('a hidden control cannot masquerade as a native condition lock',async t=>{
    const {e,dom,now}=fixture(t);dom.go.hidden=true;await e.step(now);
    assert.equal(e.driver.pendingMap.waiting,undefined);
    await e.step(now+60001);assert.equal(e.running,false);assert.match(e.status,/地图操作超时/);
});

test('native aria-disabled elite controls use the same waiting path without clicking them',async t=>{
    const {e,dom,now,clicks}=fixture(t,{legendTier:1});dom.go.disabled=false;dom.go.getAttribute=name=>name==='aria-disabled'?'true':null;
    await e.step(now);await e.step(now+360000);
    assert.equal(e.running,true);assert.ok(e.driver.pendingMap.waiting);assert.equal(clicks.length,0);e.stop();
});

test('the task-wide stop limit still ends a legendary condition wait',async t=>{
    const {e,now}=fixture(t,{stopMinutes:1});await e.step(now);assert.ok(e.driver.pendingMap.waiting);
    await e.step(now+60000);assert.equal(e.running,false);assert.match(e.status,/定时运行上限/);
});

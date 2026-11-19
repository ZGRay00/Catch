const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

test('known farming waits poll less often while manual control and UI transactions remain responsive',()=>{
    const previous=global.document;global.document={hidden:false};
    try{
        const e=new H.Engine({getItem:()=>null},{mode:'money'});e.waitForFarm('cooldown',Date.now());assert.equal(e.nextDelay(),6000);
        e.manual={};assert.equal(e.nextDelay(),1200);e.manual=null;e.driver.pendingMap={};assert.equal(e.nextDelay(),1200);
        e.driver.pendingMap=null;e.settings.mode='progress';assert.equal(e.nextDelay(),1200);
    }finally{if(previous===undefined)delete global.document;else global.document=previous;}
});
function fixture(t,settings={}){
    const previous=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const s={trainer:{id:'farm-wait'},mons:[{uid:'a',id:6,level:100}],team:['a'],dex:{},items:{},stats:{battles:0,wins:0,caught:0},money:1000,travel:{to:[]},
        adv:{layout:6,chapter:0,unlocked:8,node:0,runs:0,loops:[],speed:4,badges:[],gifts:{},deaths:{}}};
    const data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','tab']]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'money',autoTeam:false,autoPrepare:false,raids:false,...settings});e.loadAccount(s);e.running=true;e.started=Date.now();e.tabToken='tab';e.nextRaid=Infinity;
    e.driver={animations:()=>false,dismissInformation:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false,nav:()=>true};
    return{s,e,save:()=>storage.setItem('gachamon-save-v1',JSON.stringify(s))};
}
test('all money maps in backoff wait without pushing the frontier or triggering the progress watchdog',async t=>{
    const {s,e}=fixture(t),now=Date.now();for(const r of H.moneyRanking(s,e.settings))e.cooldowns[r.key]=now+900000;
    let pushed=0;e.progress=()=>pushed++;await e.step(now);await e.step(now+240000);
    assert.equal(e.running,true);assert.match(e.status,/退避/);assert.equal(pushed,0);assert.equal(e.driver.pendingMap,undefined);
    await e.step(now+960000);assert.equal(e.running,true);assert.ok(e.driver.pendingMap);e.stop();
});
test('a shiny target in temporary map backoff is not misreported as having no wild source',async t=>{
    const {s,e,save}=fixture(t,{mode:'shiny',shinyId:504}),now=Date.now();Object.assign(s.adv,{chapter:66,unlocked:68});s.travel.to=['unova'];save();
    const rows=H.shinyRanking(s,e.settings,{},now);assert.ok(rows.length);for(const r of rows)e.cooldowns[r.key]=now+900000;
    await e.step(now);await e.step(now+240000);assert.equal(e.running,true);assert.match(e.status,/退避/);
    await e.step(now+960000);assert.equal(e.running,true);assert.ok(e.driver.pendingMap);e.stop();
});
test('night-only shiny targets wait for their real phase and continue when it opens',async t=>{
    const {s,e,save}=fixture(t,{mode:'shiny',shinyId:163}),day=new Date(2026,10,16,12).getTime(),night=new Date(2026,10,16,20).getTime();
    Object.assign(s.adv,{chapter:14,unlocked:14});s.travel.to=['johto'];save();
    assert.equal(H.shinyRanking(s,e.settings,{},day).length,0);assert.ok(H.shinyRanking(s,e.settings,{},night).length);
    await e.step(day);assert.equal(e.running,true);assert.match(e.status,/出没时段/);
    await e.step(night);assert.equal(e.running,true);assert.ok(e.driver.pendingMap);e.stop();
});
test('a target with no source in the chosen region still stops instead of waiting indefinitely',async t=>{
    const {e}=fixture(t,{mode:'shiny',shinyId:504});await e.step();assert.equal(e.running,false);assert.match(e.status,/没有该物种的野生来源/);
});
test('both seasonal hunts survive a multi-day wait, reuse the forecast, and plan the target map when it opens',async t=>{
    for(const mode of ['dex','shiny']){
        const {s,e,save}=fixture(t,{mode,[mode+'Species']:[522],[mode+'Weather']:['rain'],legends:false});
        Object.assign(s.adv,{chapter:67,unlocked:83});s.travel.to=['unova'];save();
        const autumn=new Date(2026,10,9,12,15).getTime();
        await e.step(autumn);const window=e.weatherWindow;
        assert.ok(window.at>autumn+48*3600000);assert.equal(e.nextDelay(autumn),6000);
        await e.step(autumn+240000);assert.equal(e.running,true);assert.equal(e.weatherWindow,window);
        assert.equal(e.driver.pendingMap,undefined);assert.match(e.status,/出没时段.*夏季/);
        await e.step(window.at);assert.equal(e.running,true);assert.equal(e.driver.pendingMap.row.id,67);
        assert.equal(e.driver.pendingMap.options.huntSeason,'summer');e.stop();
    }
});
test('a tidal item waits through high tide, then plans the available source at low tide',async t=>{
    const {s,e,save}=fixture(t,{mode:'item',itemId:'prism-scale'}),tide=H.DATA.tideMs,high=(Math.floor(Date.now()/tide/2)*2+1)*tide+1000,low=(Math.floor(high/tide)+1)*tide+1;
    Object.assign(s.adv,{chapter:39,unlocked:39});s.travel.to=['hoenn'];save();assert.equal(H.itemRanking(s,e.settings,{}, {},high).length,0);assert.ok(H.itemRanking(s,e.settings,{}, {},low).length);
    await e.step(high);await e.step(high+240000);assert.equal(e.running,true);assert.match(e.status,/潮汐/);
    await e.step(low);assert.equal(e.running,true);assert.equal(e.driver.pendingMap.row.id,39);e.stop();
});
test('a claimed one-time tidal source does not become an endless tide wait',async t=>{
    const {s,e,save}=fixture(t,{mode:'item',itemId:'prism-scale'});Object.assign(s.adv,{chapter:39,unlocked:39});s.travel.to=['hoenn'];s.adv.gifts['prism-scale']=true;save();
    await e.step();assert.equal(e.running,false);assert.match(e.status,/无可刷道具来源/);
});

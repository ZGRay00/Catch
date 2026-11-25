const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t,settings={}){
    const before=global.document,previousNow=Date.now,clock=new Date(2026,10,16,12).getTime();Date.now=()=>clock;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{Date.now=previousNow;if(before===undefined)delete global.document;else global.document=before;});
    const s={trainer:{id:'collection-support'},money:1000,mons:[{uid:'a',id:6,level:100}],team:['a'],road:['a'],dex:{},items:{'enigma-berry':1,'starf-berry':1},stats:{},travel:{to:[]},
        adv:{layout:6,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map([['pokecatch-tab','tab']]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode:'shiny',shinyId:16,autoBuff:true,autoPrepare:false,autoTeam:false,raids:false,legends:false,progress:false,...settings});e.loadAccount(s);e.running=true;e.started=Date.now();e.tabToken='tab';e.nextRaid=Infinity;
    e.driver={animations:()=>false,dismissInformation:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false,nav:()=>true};
    const calls={buff:0,money:0};e.automation.autoBuff=()=>{calls.buff++;return true;};e.money=()=>{calls.money++;};
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    return{s,e,calls,save};
}
function catchAll(s){s.dex=Object.fromEntries(H.ROOTS.map(m=>[m.id,{caught:1}]));}

for(const mode of ['dex','shiny']){
    test(mode+' travels to a Lv.100 hunting map without starting a training detour',t=>{
        const {s,e,save}=fixture(t,{mode,autoPrepare:true});
        const chapter=H.DATA.chapters.find(row=>row.id===83);
        const row={...chapter,key:'83',members:[83],hasWild:true,expected:1};
        s.adv.chapter=76;s.adv.unlocked=83;s.travel.to=['unova'];s.mons[0].level=60;save();
        const context=H.battleContext(s,'map',{row});assert.equal(context.level,100);
        const old={mode,context,phase:'train',targets:[{uid:'a',goal:100}],uids:['a']};
        e.beginTask(s,{preparation:old,budget:{spent:12,used:1}},Date.now());
        assert.equal(e.preparation,null);
        assert.equal(e.budget.spent,12);assert.equal(e.budget.used,1);
        e.travelHunt(row,null,Date.now());
        assert.equal(e.driver.pendingMap?.row.id,83);
        assert.equal(e.coach.adventure(s,null),null);
        assert.equal(e.preparation,null);
        e.stop();
    });
}

test('collection can still train for explicit story progression and a dedicated legendary encounter',t=>{
    const {s,e}=fixture(t,{mode:'dex',autoPrepare:true});
    s.adv.badges=['Maître'];s.mons[0].level=5;
    const story=H.battleContext(s,'progress',{id:8}),now=Date.now();
    assert.equal(e.ensurePrepared(s,story,{},now),true);
    assert.equal(e.preparation.context.kind,'progress');
    const zone=H.battleContext(s,'zone',{id:145});
    e.preparation=null;
    assert.equal(e.ensurePrepared(s,zone,{},now+1),true);
    assert.equal(e.preparation.context.kind,'zone');
    e.stop();
});

test('weather standby is opt-in and survives saved settings and queued task normalization',t=>{
    const {s,e}=fixture(t,{huntWeatherFallback:'xp'});e.persist();
    const restored=new H.Engine(e.storage);restored.loadAccount(s);
    assert.equal(restored.settings.huntWeatherFallback,'xp');
    assert.equal(H.normalizeSettings({},restored.settings).huntWeatherFallback,'xp');
    assert.equal(H.normalizeSettings({huntWeatherFallback:'money'}).huntWeatherFallback,'money');
    assert.equal(H.normalizeSettings({huntWeatherFallback:'invalid'}).huntWeatherFallback,'wait');
    assert.equal(H.normalizeSettings({}).huntWeatherFallback,'wait');
});

for(const [mode,kind] of [['dex','money'],['shiny','xp']]){
    test(mode+' keeps its weather filter while farming and returns at a roaming weather expiry',async t=>{
        const {s,e,save,calls}=fixture(t,{mode,huntWeatherFallback:kind});
        const now=Date.now(),until=now+45000;
        s.adv.unlocked=0;s.mons[0].level=5;
        const natural=H.chapterWeather(s,0,until).key||'clear';
        const [roamer]=Object.entries(H.WEATHER_DATA.roamingWeather).find(([,sky])=>sky!==natural);
        const id=[...H.weatherEncounterPool(s,0,until).keys()].find(id=>id!==s.mons[0].id);
        s.roam={at:{[roamer]:{ch:0,until}},caught:[]};
        e.settings=H.normalizeSettings({...e.settings,[mode+'Weather']:[natural],[mode+'Species']:[id]});save();
        const row={key:'0',id:0,name:'模拟挂机地图',members:[0],rate:100};
        let compared=0,departures=0;
        e.evaluateRouteRanking=request=>{compared++;assert.equal(request.kind,kind);return [row];};
        e.driver.map=()=>{departures++;return true;};e.automation.autoBuff=()=>false;
        await e.step(now);assert.equal(departures,1);assert.match(e.status,/等待捕捉天气/);
        await e.step(now+1200);assert.equal(departures,1);assert.equal(compared,1);
        s.adv.loops=[0];save();await e.step(now+2400);
        assert.equal(e.settings.mode,mode);assert.equal(e.settings.huntWeatherFallback,kind);
        assert.equal(calls.money,0);assert.deepEqual(e.settings[mode+'Species'],[id]);
        await e.step(until);assert.equal(e.weatherFarm,null);
        const hunt=e.driver.pendingMap?.row;
        assert.equal(hunt?.id,0);
        assert.ok(mode==='dex'?hunt.targets.some(hit=>hit.id===id):hunt.expected>0);
        assert.ok(e.logs.some(entry=>entry.text.includes('捕捉窗口已开放')));e.stop();
    });
}

test('weather training seats the selected PC learner before ranking and keeps it pinned on the XP map',t=>{
    const {s,e}=fixture(t,{mode:'dex',dexSpecies:[637],huntWeatherFallback:'xp',autoTeam:true,
        trainUid:'selected',trainUids:['learner'],trainLevel:90});
    Object.assign(s.adv,{chapter:73,unlocked:83,badges:['Maître Unys']});s.travel.to=['unova'];
    s.mons.push({uid:'learner',id:9,level:70,reg:'unova'});
    let now=Date.now();
    for(let i=0;i<48&&H.unovaAcquisitionSources(s,636,now).some(src=>src.available);i++)now+=3600000;
    const swaps=[],visits=[],fits=[],map={id:73,key:'73',members:[73],name:'测试地图',rate:100};
    e.driver.adventureTeam=()=>{swaps.push(e.driver.teamTask.uids);return true;};
    e.driver.map=row=>{visits.push(row.id);return true;};
    e.evaluateRouteRanking=request=>{assert.equal(request.kind,'xp');return [map];};
    e.fitTeam=(_state,_now,_preview,_roam,cfg)=>{fits.push([cfg.mode,cfg.trainUids,cfg.trainLevel]);return false;};
    assert.equal(e.weatherFarmStep(s,now),true);
    assert.deepEqual(swaps,[['learner','a']]);assert.deepEqual(visits,[]);
    s.team=swaps[0];e.driver.teamTask=null;
    assert.equal(e.weatherFarmStep(s,now+200),true);assert.deepEqual(visits,[]);
    s.road=[...s.team];
    assert.equal(e.weatherFarmStep(s,now+400),true);assert.deepEqual(visits,[73]);
    s.adv.loops=[73];assert.equal(e.weatherFarmStep(s,now+600),true);
    assert.deepEqual(fits,[['train',['learner'],90]]);
    s.mons[1].level=90;assert.equal(e.weatherFarmStep(s,now+800),true);
    assert.match(e.status,/目标等级/);assert.equal(e.settings.mode,'dex');e.stop();
});

test('desert sun egg distinguishes missing weather from badge, incubator and XP cap',t=>{
    const {s,e}=fixture(t,{mode:'dex',dexSpecies:[637],huntWeatherFallback:'xp'});
    Object.assign(s.adv,{chapter:73,unlocked:83});s.travel.to=['unova'];
    s.adv.badges=['Maître Unys'];
    let now=Date.now();
    for(let i=0;i<48&&H.unovaAcquisitionSources(s,636,now).some(src=>src.available);i++)now+=3600000;
    assert.equal(e.weatherFarmStep(s,now),true);assert.match(e.status,/等级上限/);
    s.adv.badges=[];assert.equal(e.weatherFarmStep(s,now+6000),false);
    s.adv.badges=['Maître Unys'];s.pension={eggs:[{id:636}]};
    assert.equal(e.weatherFarmStep(s,now+12000),false);e.stop();
});

for(const kind of ['money','xp']){
    test('sun egg standby chooses a real '+kind+' route, preserves the party and yields to the desert window',async t=>{
        const {s,e,save}=fixture(t,{mode:'dex',dexSpecies:[637],huntWeatherFallback:kind});
        Object.assign(s.adv,{chapter:73,unlocked:83,badges:['Maître Unys']});
        s.travel.to=['unova'];s.mons[0].level=85;save();
        let now=Date.now();
        for(let i=0;i<48&&H.unovaAcquisitionSources(s,636,now).some(src=>src.available);i++)now+=3600000;
        assert.ok(H.unovaAcquisitionSources(s,636,now).some(src=>src.weatherBlocked));
        const opening=H.nextWildWindow(s,e.settings,[636],now,168);
        assert.ok(opening?.at>now);
        const settings={...e.settings,mode:kind==='xp'?'train':'money',region:'current'};
        const best=(kind==='xp'?H.xpRanking:H.moneyRanking)(s,settings,{}, {},now)[0];
        assert.ok(best?.rate>0);
        const visits=[];e.driver.map=row=>{visits.push(row.key);return true;};
        e.automation.autoBuff=()=>false;
        for(let i=0;i<100&&!visits.length;i++){
            await e.step(now+i);if(!visits.length)await new Promise(resolve=>setTimeout(resolve,5));
        }
        assert.deepEqual(visits,[best.key]);assert.deepEqual(s.team,['a']);
        Object.assign(s.adv,{chapter:best.id,loops:[best.loop]});save();
        await e.step(opening.at);assert.equal(e.weatherFarm,null);
        assert.equal(e.driver.pendingMap?.row.id,69);assert.deepEqual(visits,[best.key]);e.stop();
    });
}

test('a time-of-day restriction or map backoff alone does not start weather standby',t=>{
    const {s,e}=fixture(t,{shinyId:163,huntWeatherFallback:'money'}),now=Date.now();
    Object.assign(s.adv,{chapter:14,unlocked:14});s.travel.to=['johto'];
    assert.equal(e.weatherFarmStep(s,now),false);
    e.settings.shinyId=16;s.adv.chapter=0;
    for(const row of H.shinyRanking(s,e.settings,{},now))e.cooldowns[row.key]=now+60000;
    assert.equal(e.weatherFarmStep(s,now),false);e.stop();
});

for(const mode of ['dex','shiny']){
    test(mode+' rotates an empty ice badge roll only after a run and keeps existing wild dust',async t=>{
        const {s,e,save}=fixture(t,{mode,[mode+'Species']:[529,530]});
        e.automation.autoBuff=()=>false;
        const now=Date.now();
        Object.assign(s.adv,{chapter:73,unlocked:83,runs:4,nodes:[{type:'wild',name:'Route 7'}]});
        s.travel.to=['unova'];save();
        const rank=mode==='dex'?H.dexRanking:H.shinyRanking;
        const current=rank(s,e.settings,{},now).find(row=>row.id===73);
        e.target=current;e.visit={started:now,runs:4,deaths:0};
        await e.step(now);assert.equal(e.driver.pendingMap,undefined);
        s.adv.runs++;s.adv.nodes[0].phenom='dust';save();await e.step(now+1200);
        assert.match(e.status,/现象遭遇/);assert.equal(e.driver.pendingMap,null);
        s.adv.nodes[0].type='item';save();await e.step(now+2400);
        const next=e.driver.pendingMap.row;
        assert.notEqual(next.id,73);assert.ok(rank(s,e.settings,{},now).some(row=>row.key===next.key));
        assert.ok(e.cooldowns[current.key]>now);e.stop();
    });
}

test('Alomomola routes leave the ice badge for a ripple chapter',async t=>{
    const {s,e,save}=fixture(t,{mode:'dex',dexSpecies:[594]});e.automation.autoBuff=()=>false;
    Object.assign(s.adv,{chapter:73,unlocked:83,nodes:[{type:'wild',name:'Route 7',phenom:'dust'}]});
    s.travel.to=['unova'];save();await e.step();
    assert.ok([74,83].includes(e.driver.pendingMap.row.id));e.stop();
});

test('Volcarona alone routes to the desert egg, then waits for its evolution without counting the parent',async t=>{
    const {s,e,save}=fixture(t,{mode:'dex',dexSpecies:[637],afterDex:'stop'});
    Object.assign(s.adv,{chapter:73,unlocked:83,badges:['Maître Unys']});s.travel.to=['unova'];save();
    const window=H.nextWildWindow(s,e.settings,[636],Date.now(),168);
    await e.step(window.at);assert.equal(e.driver.pendingMap.row.id,69);
    Object.assign(s.adv,{chapter:69,nodes:[{type:'item',name:'Désert Délassant',weather:'sun',loot:{'egg:636':{p:.2}}}]});
    save();await e.step(window.at+1200);assert.match(e.status,/沙漠地带.*蛋/);
    s.adv.gifts['egg:636']=true;s.adv.nodes=[];s.pension={eggs:[{id:636}]};save();
    await e.step(window.at+2400);assert.match(e.status,/已有蛋，等待孵化/);
    s.dex[636]={caught:1};s.pension.eggs=[];save();await e.step(window.at+3600);
    assert.equal(e.running,true);assert.match(e.status,/59.*培养进化/);
    s.dex[637]={caught:1};save();await e.step(window.at+4800);assert.equal(e.running,false);
});

test('selecting the whole egg family reports its shared incubating egg',async t=>{
    const {s,e,save}=fixture(t,{mode:'dex',dexSpecies:[636,637]});
    Object.assign(s.adv,{chapter:69,unlocked:83,badges:['Maître Unys']});s.travel.to=['unova'];s.pension={eggs:[{id:636}]};
    save();await e.step();assert.match(e.status,/已在孵化器/);assert.equal(e.driver.pendingMap,undefined);e.stop();
});

for(const scene of ['between','trainer','boss']){
    test('specified dust family leaves Shauntal and fits only the confirmed hunting route: '+scene,async t=>{
        const {s,e,save}=fixture(t,{mode:'dex',region:'all',dexSpecies:[529,530],autoTeam:true});
        s.travel.to=['unova'];Object.assign(s.adv,{chapter:77,unlocked:77,loops:['L:unova']});
        if(scene!=='between'){
            s.adv.nodes=[{type:scene}];s.adv.battle={kind:'trainer',enemies:[{id:563}]};
        }
        const fitted=[];e.fitTeam=state=>{fitted.push(state.adv.chapter);return true;};
        save();await e.step();
        if(scene==='boss'){
            assert.match(e.status,/等待当前遭遇.*再前往/);assert.equal(e.driver.pendingMap,undefined);
            s.adv.battle=null;save();await e.step();
        }
        const route=e.driver.pendingMap?.row;
        assert.ok(route&&!route.league&&route.targets.some(hit=>hit.kind==='phenomenon'&&[529,530].includes(hit.id)));
        assert.deepEqual(fitted,[]);
        e.driver.map=row=>{assert.equal(row.key,route.key);return true;};await e.step();
        Object.assign(s.adv,{chapter:route.id,battle:null,nodes:[],loops:[route.key]});save();await e.step();await e.step();
        assert.deepEqual(fitted,[route.id]);e.stop();
    });
}

test('starting a hunt plans its route during the original ordinary battle, before background work',async t=>{
    const {s,e,save}=fixture(t,{mode:'dex',dexSpecies:[529]});
    s.travel.to=['unova'];
    Object.assign(s.adv,{chapter:66,unlocked:83,nodes:[{type:'wild'}],battle:{kind:'wild',enemies:[{id:504}]}});
    save();e.beginTask(s,null,Date.now());
    e.serviceBackground=()=>{throw Error('foreground startup lost priority');};
    await e.step();
    assert.ok(e.driver.pendingMap?.row.targets.some(hit=>hit.id===529));
    assert.equal(e.canStartRoute(s),true);
    s.adv.node++;assert.equal(e.canStartRoute(s),false);
    s.adv.node--;s.adv.battle.enemies[0].shiny=true;assert.equal(e.canStartRoute(s),false);
    s.adv.battle.enemies[0].shiny=false;s.adv.pending={type:'gift'};assert.equal(e.canStartRoute(s),false);
    e.stop();
});

test('dust targets keep their generated route and actual encounter ahead of raid probing',async t=>{
    const {s,e,save}=fixture(t,{mode:'dex',dexSpecies:[529]});
    s.travel.to=['unova'];Object.assign(s.adv,{chapter:67,unlocked:83,nodes:[{type:'wild',phenom:'dust',name:'Veine Souterraine'}]});
    e.priorityRaid=()=>{throw Error('raid interrupted dust hunting');};
    save();await e.step();assert.match(e.status,/现象.*螺钉地鼠/);
    s.adv.battle={kind:'wild',enemies:[{id:529}]};save();await e.step();
    assert.match(e.status,/保护图鉴目标.*螺钉地鼠/);e.stop();
});

test('a shiny task with no local wild source stops before consuming its shiny berry',async t=>{
    const {e,calls}=fixture(t,{shinyId:504});await e.step();assert.equal(e.running,false);assert.match(e.status,/没有该物种的野生来源/);assert.equal(calls.buff,0);
});
test('shiny map backoff does not consume a boost while no eligible route can run',async t=>{
    const {s,e,calls}=fixture(t),now=Date.now();for(const row of H.shinyRanking(s,e.settings,{},now))e.cooldowns[row.key]=now+900000;
    await e.step(now);assert.equal(e.running,true);assert.match(e.status,/退避/);assert.equal(calls.buff,0);e.stop();
});
test('a shiny task waiting for night keeps its boost in inventory',async t=>{
    const {s,e,calls,save}=fixture(t,{shinyId:163}),day=new Date(2026,10,16,12).getTime();Object.assign(s.adv,{chapter:14,unlocked:14});s.travel.to=['johto'];save();
    await e.step(day);assert.equal(e.running,true);assert.match(e.status,/出没时段/);assert.equal(calls.buff,0);e.stop();
});
test('an available shiny route still applies its owned boost at a safe boundary',async t=>{
    const {e,calls}=fixture(t);await e.step();assert.equal(calls.buff,1);assert.equal(e.driver.pendingMap,undefined);e.stop();
});
test('completed dex collection switches to money without consuming a dex boost',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'});catchAll(s);save();await e.step();assert.equal(calls.buff,0);assert.equal(calls.money,1);e.stop();
});
test('a missing gift-only evolution chain does not trigger a wild encounter boost',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'});catchAll(s);delete s.dex[106];s.adv.chapter=5;save();await e.step();
    assert.equal(calls.buff,0);assert.equal(e.driver.pendingMap.row.id,5);e.stop();
});
test('dex route backoff falls back without activating the dex berry',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'}),now=Date.now();catchAll(s);delete s.dex[16];save();for(const row of H.dexRanking(s,e.settings,{},now))e.cooldowns[row.key]=now+900000;
    await e.step(now);assert.equal(calls.buff,0);assert.equal(calls.money,1);e.stop();
});
test('an available wild dex route still applies its boost before travelling',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'});catchAll(s);delete s.dex[16];save();await e.step();assert.equal(calls.buff,1);assert.equal(e.driver.pendingMap,undefined);e.stop();
});
test('an ongoing dex route refills boosts only between native battles',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'}),now=Date.now();catchAll(s);delete s.dex[16];e.target=H.dexRanking(s,e.settings,{},now).find(row=>row.id===0);assert.ok(e.target);e.visit={started:now};
    s.adv.battle={steps:0};save();await e.step(now);assert.equal(calls.buff,0);s.adv.battle=null;save();await e.step(now+1200);assert.equal(calls.buff,1);e.stop();
});
test('daily raid preparation takes precedence without consuming a wild collection boost',async t=>{
    const {s,e,calls,save}=fixture(t,{raids:true});s.adv.badges=['Maître'];e.nextRaid=0;save();await e.step();assert.equal(e.raidProbe,true);assert.equal(calls.buff,0);e.stop();
});
test('dex cancels a pending departure when a target ripple appears on the active route',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'});catchAll(s);delete s.dex[594];
    Object.assign(s.adv,{chapter:74,unlocked:83,nodes:[{name:'Route 8',type:'wild',phenom:'ripple',bg:'lake'}]});
    s.travel.to=['unova'];e.driver.pendingMap={row:{id:83},options:{},started:Date.now()};save();
    await e.step();assert.equal(e.driver.pendingMap,null);assert.match(e.status,/保姆曼波/);assert.equal(calls.buff,0);e.stop();
});
test('dex waits for a Larvesta egg and finishes only after the hatch is registered',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex',autoEggs:false,afterDex:'stop'});catchAll(s);delete s.dex[636];
    s.travel.to=['unova'];Object.assign(s.adv,{chapter:69,unlocked:83,badges:['Maître Unys']});
    s.pension={eggs:[{id:636,hatchAt:Date.now()+600000}],open:{eggs:1}};save();
    await e.step();assert.equal(e.running,true);assert.match(e.status,/培育屋领取/);assert.equal(calls.money,0);
    s.pension.eggs=[];s.dex[636]={caught:1};save();await e.step();assert.equal(e.running,false);assert.match(e.status,/已全部捕获/);
});
test('dex keeps a generated sunny desert item roll for Larvesta and resumes travel for fixed loot',async t=>{
    const {s,e,calls,save}=fixture(t,{mode:'dex'});catchAll(s);delete s.dex[636];s.travel.to=['unova'];
    const node={name:'Désert Délassant',type:'item',weather:'sun',loot:{'egg:636':.2}};
    Object.assign(s.adv,{chapter:69,unlocked:83,badges:['Maître Unys'],nodes:[node]});
    let mapCalls=0;e.driver.map=()=>{mapCalls++;return false;};
    const pending=()=>({row:{...H.DATA.chapters.find(c=>c.id===83),key:'83',members:[83]},options:{},started:Date.now()});
    e.driver.pendingMap=pending();save();await e.step();
    assert.equal(mapCalls,0);assert.equal(e.driver.pendingMap,null);assert.match(e.status,/道具节点.*获得蛋.*燃烧虫/);assert.equal(calls.buff,0);
    node.find='star-piece';e.driver.pendingMap=pending();save();await e.step();
    assert.equal(mapCalls,1);e.stop();
});

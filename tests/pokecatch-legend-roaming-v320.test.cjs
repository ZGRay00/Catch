const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const now=Date.now();
function state(){return{trainer:{id:'roaming-v320'},money:1000,mons:[{uid:'a',id:389,level:100,reg:'johto',xp:0}],team:['a'],road:['a'],dex:{},seen:{},items:{},stats:{},travel:{to:['johto','hoenn','sinnoh','unova']},roam:{at:{243:{ch:15,until:now+15*60000}},caught:[]},adv:{layout:6,chapter:14,unlocked:30,node:0,nodes:[],speed:4,badges:['Maître Johto'],loops:[],gifts:{},deaths:{}}};}
function fixture(t,settings={}){
    const previous=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    const s=state(),data=new Map([['pokecatch-tab','roaming-fixture']]),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)},e=new H.Engine(storage,{mode:'roam',roamId:243,autoPrepare:false,autoTeam:false,autoBuff:false,raids:false,...settings}),calls=[];
    const save=()=>data.set('gachamon-save-v1',JSON.stringify(s));save();
    e.running=true;e.started=now;e.account=H.accountId(s);e.tabToken='roaming-fixture';e.settings=H.normalizeSettings({...e.settings,...settings});e.automation.autoBuff=()=>false;e.ensurePrepared=()=>false;
    e.driver.nav=screen=>{calls.push(['nav',screen]);return true;};e.driver.click=(el,label)=>{calls.push(['click',label]);return !!el;};
    e.travel=(row,at,options)=>{calls.push(['travel',row,options]);};e.completeTask=reason=>calls.push(['complete',reason]);e.failTask=reason=>calls.push(['fail',reason]);e.stop=reason=>calls.push(['stop',reason]);
    return{s,e,calls,save};
}

test('the roaming snapshot contains the native target groups and requires the matching champion',()=>{
    assert.deepEqual(H.ROAMING_DATA.groups.flatMap(group=>group.ids),[243,244,245,380,381,481,641,642]);
    const s=state(),cfg={roamId:243};assert.equal(H.roamingProgress(s,cfg,now).unlocked,true);
    s.adv.badges=['Maître'];assert.equal(H.roamingProgress(s,cfg,now).unlocked,false);
    s.adv.badges=['Maître Johto'];s.travel.to=[];s.adv.chapter=0;assert.equal(H.roamingProgress(s,cfg,now).unlocked,false);
});
test('roaming completion uses captures, never seen records or an encounter marker',()=>{
    const s=state(),cfg={roamId:243};s.seen[243]=1;assert.equal(H.roamingProgress(s,cfg,now).done,false);
    s.dex[243]={caught:1};assert.equal(H.roamingProgress(s,cfg,now).done,true);
    s.dex={};s.roam.caught=[243];assert.equal(H.roamingProgress(s,cfg,now).done,true);
});
test('native position data must be unexpired, unlocked and within its real nonleague region',()=>{
    const s=state(),cfg={roamId:243};assert.deepEqual(H.roamingProgress(s,cfg,now).location,{ch:15,until:now+900000});
    for(const value of [{ch:15,until:now},{ch:33,until:now+900000},{ch:25,until:now+900000},{ch:999999,until:now+900000}]){s.roam.at[243]=value;assert.equal(H.roamingProgress(s,cfg,now).location,null);}
    s.roam.at[243]={ch:24,until:now+900000};s.adv.unlocked=23;assert.equal(H.roamingProgress(s,cfg,now).location,null);
});
test('a current future roaming node is finished before following a relocated marker',()=>{
    const s=state();s.adv.chapter=17;s.adv.node=1;s.adv.nodes=[{type:'heal'},{type:'wild'},{type:'wild',roamer:243}];
    const plan=H.roamingPlan(s,{roamId:243},now);assert.equal(plan.row.id,17);assert.equal(plan.marked,true);assert.equal(plan.restart,false);
    s.roam.at[243].until=now-1;assert.equal(H.roamingPlan(s,{roamId:243},now).row.id,17);
});
test('a passed roaming node requires native restart instead of repeatedly pressing Continue',()=>{
    const s=state();s.adv.chapter=15;s.adv.node=2;s.adv.nodes=[{type:'wild',roamer:243},{type:'heal'},{type:'wild'}];
    const plan=H.roamingPlan(s,{roamId:243},now);assert.equal(plan.restart,true);assert.equal(plan.marked,false);assert.equal(plan.row.id,15);
    s.adv.node=0;s.adv.nodes=[{type:'wild'}];assert.equal(H.roamingPlan(s,{roamId:243},now).restart,false);
});
test('an already active native roaming battle survives relocation of its map marker',()=>{
    const s=state();s.adv.chapter=17;s.adv.battle={roam:243,enemies:[{id:243,level:100,hp:100}]};s.roam.at[243].until=now-1;
    const plan=H.roamingPlan(s,{roamId:243},now);assert.equal(plan.active,true);assert.equal(plan.marked,true);assert.equal(plan.row.id,17);
});
test('roaming battle context trains for the level-100 boss and retains its target after resume',()=>{
    const s=state(),row={...H.DATA.chapters.find(c=>c.id===15),members:[15]};
    const normal=H.battleContext(s,'map',{row}),context=H.battleContext(s,'map',{row,roamId:243});
    assert.equal(context.kind,'map');assert.equal(context.id,15);assert.equal(context.roamId,243);assert.equal(context.level,100);assert.equal(context.foes[0].id,243);assert.equal(context.foes[0].weight,20);assert.notEqual(context.key,normal.key);
    const {foes,...saved}=context,rebuilt=H.rebuildPreparationContext(s,saved);assert.equal(rebuilt.foes[0].id,243);assert.equal(rebuilt.level,100);assert.equal(rebuilt.roamId,243);
});
test('legendary rotating-form progress exposes exactly which capture forms remain',()=>{
    const s=state(),cfg={legendId:386,legendTier:0};s.dex[386]={caught:1};let p=H.legendProgress(s,cfg);
    assert.equal(p.done,false);assert.deepEqual(p.missingForms,[38601,38602,38603]);
    for(const id of p.forms)s.dex[id]={caught:1};assert.equal(H.legendProgress(s,cfg).done,true);
    s.elite={386:{t:4}};assert.equal(H.legendProgress(s,{...cfg,legendTier:3}).done,true);
});
test('ordinary capture of an elite-only legendary entry delegates to roaming',t=>{
    const {s,e,calls}=fixture(t,{mode:'legend',legendId:243,legendTier:0});e.roaming=()=>calls.push(['roam']);e.legend(s,now);assert.deepEqual(calls,[['roam']]);
});
test('an already completed legendary method cannot restart the capture loop',t=>{
    const {s,e,calls}=fixture(t,{mode:'legend',legendId:145});s.dex[145]={caught:1};e.legend(s,now);assert.equal(calls[0][0],'complete');assert.equal(calls.some(call=>call[0]==='travel'),false);
});
test('dex legendary probing excludes elite-only roaming entries instead of trying an uncapturable zone',t=>{
    const {s,e,calls}=fixture(t);e.settings.region='all';assert.equal(e.findLegend(s,{ids:new Set([243,244,380])},now),false);assert.equal(e.legendProbe,null);assert.equal(calls.length,0);
});
test('an unopened roaming target waits without blind navigation or ending the main task',t=>{
    const {s,e,calls}=fixture(t);s.adv.badges=[];e.roaming(s,now);assert.match(e.status,/等待.*游荡开放/);assert.equal(e.lastProgress,now);assert.equal(calls.length,0);
});
test('inventory Master Balls require explicit authorization before active roaming pursuit',t=>{
    const {s,e,calls}=fixture(t);s.items['master-ball']=1;e.roaming(s,now);assert.match(e.status,/大师球/);assert.equal(calls.length,0);
    e.settings.roamAllowMasterBall=true;e.roaming(s,now+1200);assert.equal(calls[0][0],'travel');assert.equal(s.items['master-ball'],1);
});
test('valid native positions plan only the actual target chapter with a target-aware context',t=>{
    const {s,e,calls}=fixture(t);e.roaming(s,now);const travel=calls.find(call=>call[0]==='travel');assert.equal(travel[1].id,15);assert.equal(travel[2].roamId,243);assert.equal(e.roamStarted,undefined);
});
test('expired positions trigger a map refresh without guessing a route',t=>{
    const {s,e,calls}=fixture(t);s.roam.at[243].until=now-1;e.roaming(s,now);assert.match(e.status,/等待.*新游荡位置/);assert.deepEqual(calls,[['nav','map']]);assert.equal(e.lastProgress,now);
});
test('roaming capture is confirmed before completing a task and no route is reopened',t=>{
    const {s,e,calls}=fixture(t);s.roam.caught=[243];e.roaming(s,now);assert.equal(calls.length,1);assert.equal(calls[0][0],'complete');
});
test('the online roaming timer starts on pursuit and enforces its configured limit',t=>{
    const {s,e,calls}=fixture(t,{roamMinutes:5});e.roamStarted=now-300000;e.roaming(s,now);assert.equal(calls[0][0],'fail');assert.match(calls[0][1],/搜寻时限/);
});
test('a legend with roaming capture follows its unlimited legend timer even with a finite standalone roaming timer',t=>{
    const {s,e,calls}=fixture(t,{mode:'legend',legendId:243,legendMinutes:0,roamMinutes:5});
    e.roamStarted=now-8*3600000;e.roaming(s,now);
    assert.ok(calls.some(([kind,row])=>kind==='travel'&&row.id===15));
});
test('failed roaming capture re-enters through native restart once and remains bounded',t=>{
    const {s,e,calls}=fixture(t);s.adv.chapter=15;s.adv.node=2;s.adv.nodes=[{type:'wild',roamer:243},{type:'heal'}];e.target={members:[15]};e.roaming(s,now);
    assert.equal(calls[0][0],'travel');assert.equal(calls[0][2].restart,true);calls.length=0;e.roaming(s,now+1200);assert.equal(calls.some(call=>call[0]==='travel'),false);
});
test('active roaming battles stay on adventure without map changes, buffs or team churn',t=>{
    const {s,e,calls}=fixture(t);s.adv.chapter=15;s.adv.battle={roam:243};e.roaming(s,now);assert.deepEqual(calls,[['nav','adventure']]);assert.equal(e.roamStarted,now);assert.match(e.status,/游荡战斗/);
});
test('legendary dropdown roaming delegation uses the selected target rather than the standalone default',t=>{
    const {s,e,calls}=fixture(t,{mode:'legend',legendId:380,legendTier:0,roamId:243});s.adv.badges=['Maître Hoenn'];s.adv.unlocked=47;s.roam.at[380]={ch:33,until:now+900000};e.roaming(s,now);assert.equal(calls[0][0],'travel');assert.equal(calls[0][1].id,33);assert.equal(calls[0][2].roamId,380);
});
test('an unfinished capture-berry UI transaction is resumed before trying a different berry family',t=>{
    const {s,e}=fixture(t);e.automation.buffUI={family:'capture',started:now-20000};const modes=[];
    e.automation.autoBuff=(state,at,mode)=>{modes.push(mode);return true;};e.roaming(s,now);
    assert.deepEqual(modes,['roamCapture']);assert.equal(e.automation.buffUI.started,now-20000);
});
test('background time does not consume the active roaming search allowance',t=>{
    const {e}=fixture(t);e.roamStarted=now-30000;e.hiddenAt=now;e.resumeUIClock(now+60000);assert.equal(e.roamStarted,now+30000);assert.equal(e.hiddenAt,null);
});
test('the engine routes the roaming mode to the real tracker before generic money or raid planning',async t=>{
    const {e,s,calls,save}=fixture(t);save();await e.step(now);assert.equal(calls.some(call=>call[0]==='travel'&&call[1].id===15&&call[2].roamId===243),true);
    assert.equal(e.raidProbe,false);assert.equal(e.running,true);
});
test('a Master Ball received after planning blocks native map travel until explicit authorization',async t=>{
    const {e,s,calls,save}=fixture(t);s.items['master-ball']=1;save();const row={...H.DATA.chapters.find(c=>c.id===15),key:'15',members:[15]};
    e.driver.pendingMap={row,options:{roamId:243},started:now};let nativeMapCalls=0;e.driver.map=()=>{nativeMapCalls++;return true;};
    await e.step(now);assert.equal(nativeMapCalls,0);assert.equal(e.running,true);assert.match(e.status,/大师球/);assert.equal(s.items['master-ball'],1);
});

test('a settled roaming encounter immediately restarts or follows the new marker before party and berry work',t=>{
    const {s,e,calls}=fixture(t,{autoTeam:true});s.adv.chapter=15;s.adv.node=1;
    s.adv.nodes=[{type:'wild',roamer:243},{type:'trainer'}];s.adv.battle={kind:'trainer'};s.legTries={243:1};
    e.roamRestartAt=now-100;e.target={members:[15],roamId:243};
    e.automation.autoBuff=()=>assert.fail('berry before settled retry');
    e.ensurePrepared=()=>assert.fail('training before settled retry');e.fitTeam=()=>assert.fail('party before settled retry');
    e.roaming(s,now);e.roaming(s,now+1000);
    assert.deepEqual(calls.filter(c=>c[0]==='travel').map(c=>[c[1].id,c[2].restart]),[[15,true]]);
    s.roam.at[243].ch=17;e.roaming(s,now+2000);
    assert.deepEqual(calls.at(-1).slice(1).map((v,i)=>i?v.restart:v.id),[17,false]);
    s.roam.caught.push(243);e.roaming(s,now+3000);assert.equal(calls.at(-1)[0],'complete');
});

test('queued restart is abandoned if the marker moves, another target appears here, or capture is confirmed',async t=>{
    const {s,e,save}=fixture(t,{mode:'legend',legendId:243,legendIds:[243,244]});
    s.adv.chapter=15;s.adv.node=1;s.adv.nodes=[{roamer:243},{type:'heal'}];s.roam.at[244]={ch:18,until:now+60000};
    const pending=()=>({row:{...H.DATA.chapters[15],key:'15',members:[15]},started:now,options:{roamId:243,restart:true,roamIds:[243,244]}});
    e.driver.map=()=>assert.fail('stale map click');
    s.roam.at[243].ch=16;e.driver.pendingMap=pending();save();await e.step(now);assert.equal(e.driver.pendingMap,null);
    s.roam.at[243].ch=15;s.adv.nodes.push({type:'wild',roamer:244});e.driver.pendingMap=pending();save();await e.step(now+1000);
    assert.equal(e.driver.pendingMap,null);assert.ok(e.selectLegendTarget(s,now));assert.equal(e.settings.legendId,244);
    s.adv.nodes.pop();s.roam.caught=[243];e.driver.pendingMap=pending();save();await e.step(now+2000);assert.equal(e.driver.pendingMap,null);
});

test('Ho-Oh prioritizes active and generated beasts, follows relocation, then returns to the tower',t=>{
    const {s,e}=fixture(t,{mode:'legend',legendId:250});s.adv.chapter=16;s.adv.node=1;
    s.roam.at[244]={ch:17,until:now+60000};s.roam.at[245]={ch:18,until:now+60000};
    const pursued=[];e.roaming=(state,at,cfg,sub,opts)=>{assert.equal(sub,true);assert.deepEqual(opts.roamGoals,[250]);pursued.push(cfg.roamId);};
    s.adv.nodes=[{}, {},{type:'wild',roamer:245}];e.legend(s,now);assert.equal(pursued.at(-1),245);
    s.adv.battle={roam:244};e.legend(s,now);assert.equal(pursued.at(-1),244);
    s.adv.battle=null;s.adv.node=3;s.roam.caught=[244,245];s.mons.push({id:244},{id:245});
    s.roam.at[243].ch=20;e.legend(s,now);assert.equal(pursued.at(-1),243);
    s.mons.push({id:243});s.roam.caught.push(243);let trip;e.travel=(row,at,opt)=>trip=[row.id,opt.zone];
    e.legend(s,now);assert.deepEqual(trip,[250,true]);assert.equal(e.settings.legendId,250);
});

test('explicit dex roaming selections and live ownership prerequisites use different capture evidence',t=>{
    const {s,e,calls}=fixture(t,{mode:'dex',dexSpecies:[243,244]});
    const gate=H.legendRequirements(s,[243,244]);assert.deepEqual([...gate.roam],[243,244]);
    s.roam.at[244]={ch:20,until:now+60000};s.adv.chapter=20;
    e.advanceRequirements(s,e.settings,gate,[],now);assert.equal(calls.find(c=>c[0]==='travel')[2].roamId,244);
    s.dex[243]={caught:1};assert.ok(!H.legendRequirements(s,[243]).roam.has(243));
    const parent=H.legendRequirements(s,[250]);assert.ok(parent.roamOwned.has(243)&&parent.roam.has(243));
    assert.equal(H.roamingProgress(s,{roamId:243,roamRequireOwned:true},now).done,false);
    s.roam.caught=[243];const blocked=H.legendRequirements(s,[250]);assert.ok(!blocked.roam.has(243)&&!blocked.zones.has(250));
    assert.ok(blocked.notes.some(note=>note.includes('交换')));
});

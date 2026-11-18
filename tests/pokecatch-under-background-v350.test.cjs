const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function node(extra={}){
    return{isConnected:true,hidden:false,disabled:false,dataset:{},closest:()=>null,getAttribute:()=>null,
        getClientRects:()=>[{}],classList:{contains:()=>false},querySelector:()=>null,querySelectorAll:()=>[],...extra};
}
function fixture(t,settings={}){
    const previous={document:global.document,getComputedStyle:global.getComputedStyle,now:Date.now};
    let clock=Date.UTC(2026,10,17,12);Date.now=()=>clock;
    const s={trainer:{id:'under-background-v350'},money:10000,
        mons:[6,9,3,65,68,149].map((id,i)=>({uid:'main-'+i,id,level:80,reg:'sinnoh'})),
        team:Array.from({length:6},(_,i)=>'main-'+i),road:Array.from({length:6},(_,i)=>'main-'+i),
        dex:{},items:{},stats:{},eventTeams:{},travel:{to:['johto','hoenn','sinnoh']},pension:{mons:[],eggs:[]},
        under:{day:H.parisDay(clock),sent:0,used:{},slots:[],geodes:[0,0,0,0]},
        adv:{layout:H.DATA.layout,chapter:48,unlocked:65,node:0,runs:0,speed:4,loops:[],badges:['Forêt'],gifts:{},deaths:{}}};
    const ui={screen:'adventure',deferSend:true,rejectClick:false},actions=[],nodes=new Map();
    const tabs=new Map(['adventure','underground','pension','team','map'].map(screen=>[screen,node({dataset:{screen}})]));
    const data=new Map([['pokecatch-tab','under-bg-tab']]),writes=[];
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push([key,String(value)]);data.set(key,String(value));},removeItem:key=>data.delete(key)};
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();writes.length=0;
    const e=new H.Engine(storage,{mode:'money',autoEggs:false,autoEvolve:false,autoUnderCollect:true,autoUnderDispatch:true,autoTeam:false,
        autoPrepare:false,raids:false,moneyBuff:false,trainBuddy:false,trainBuff:false,...settings});
    e.loadAccount(s);e.read();e.running=true;e.started=clock;e.tabToken='under-bg-tab';e.nextRaid=Infinity;e.schedule=()=>{};e.automation.begin(s);
    const add=(uid,id=74)=>{const mon={uid,id,level:80,reg:'sinnoh'};s.mons.push(mon);return mon;};
    ['idle-0','idle-1','idle-2'].forEach((uid,i)=>add(uid,[74,95,112][i]));save();writes.length=0;
    const commit=(id='sent-bg',uids=s.eventTeams['under:0']||[],bay=0)=>{
        const mons=uids.map(uid=>s.mons.find(mon=>mon.uid===uid)).filter(Boolean);
        s.under.slots.push({id,bay,start:clock,end:clock+600000,team:[...uids],mons});s.under.sent++;
        for(const uid of uids)s.under.used[uid]=true;s.mons=s.mons.filter(mon=>!uids.includes(mon.uid));save();
    };
    const go=node({dataset:{ugGo:'0'},perform:()=>{if(!ui.deferSend)commit();}});
    const from=node({value:'1',options:[{value:'1'}],dispatchEvent:()=>true});
    global.document={hidden:false,documentElement:{classList:{contains:()=>false}},querySelector:selector=>{
        if(nodes.has(selector))return nodes.get(selector)[0]||null;
        const tab=/^#tabs \[data-screen="([^"]+)"\]$/.exec(selector);if(tab)return tabs.get(tab[1])||null;
        if(selector==='.screen.active[id^="screen-"]')return node({id:'screen-'+ui.screen});
        if(selector==='#ug-root'&&ui.screen==='underground')return node();
        if(selector==='#ug-root [data-ug-from="0"]')return from;
        if(selector==='#ug-root [data-ug-go="0"]')return go;
        return null;
    },querySelectorAll:selector=>{
        if(nodes.has(selector))return nodes.get(selector);
        if(selector==='#ug-root [data-ug-go]'&&ui.screen==='underground')return[go];
        if(selector==='[data-ug-slot]'&&ui.screen==='underground')return[node({dataset:{ugSlot:'0.0'}})];
        return[];
    }};
    global.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
    t.after(()=>{Date.now=previous.now;for(const key of ['document','getComputedStyle'])if(previous[key]===undefined)delete global[key];else global[key]=previous[key];});
    e.driver.nav=screen=>{actions.push({type:'nav',screen});ui.screen=screen;return true;};
    e.driver.click=(el,label)=>{if(!el||el.disabled||el.hidden||ui.rejectClick)return false;actions.push({type:'click',label,el});el.perform?.();return true;};
    e.driver.animations=e.driver.dismissInformation=e.driver.receipt=e.driver.dialog=e.driver.gift=()=>false;
    const plan=()=>H.parallelPlan(s,e,clock),service=()=>e.automation.serviceUnderground(s,clock);
    const prepare=()=>{
        const uids=['idle-0','idle-1','idle-2'];s.eventTeams['under:0']=[...uids];
        e.services.underground={action:'dispatch',started:clock,returnScreen:'adventure',bay:0,uids:[...uids],teamReady:true};save();return uids;
    };
    return{s,e,ui,actions,nodes,tabs,data,writes,storage,save,add,commit,go,from,plan,service,prepare,now:()=>clock,advance:ms=>clock+=ms};
}

test('automatic background dispatch is on by default and has an explicit saved opt-out',()=>{
    assert.equal(H.DEFAULTS.autoUnderDispatch,true);assert.equal(H.normalizeSettings({}).autoUnderDispatch,true);
    assert.equal(H.normalizeSettings({autoUnderDispatch:false}).autoUnderDispatch,false);
});

test('auto fitting gets first choice of PC members, then dispatch can use the remaining squad',async t=>{
    const f=fixture(t,{autoTeam:true}),{s,e}=f;
    s.mons.slice(0,6).forEach(mon=>mon.level=5);
    f.save();
    assert.match(f.plan().blocked.underground,/先适配冒险阵容/);
    await e.step(f.now());
    assert.equal(e.services.underground,null);
    const chosen=e.driver.teamTask?.uids;
    assert.ok(chosen?.some(uid=>uid.startsWith('idle-')),'the adventure plan can take a strong former reserve');
    s.team=[...chosen];e.driver.teamTask=null;
    assert.match(f.plan().blocked.underground,/治疗点/);
    s.road=[...s.team];f.save();
    assert.ok(f.plan().ready.includes('underground'));
    assert.ok(H.undergroundIdleMembers(s,e,f.now()).every(mon=>!chosen.includes(mon.uid)));
    f.add('new-carry',445);assert.match(f.plan().blocked.underground,/先适配/);
});

test('entering Sinnoh enables scheduling but the native Forest badge requirement still applies',t=>{
    const f=fixture(t);f.s.adv.badges=[];
    assert.equal(H.undergroundBackgroundUnlocked(f.s),true);assert.ok(!f.plan().ready.includes('underground'));
    assert.match(f.plan().blocked.underground,/森林徽章/);assert.equal(f.service(),false);assert.equal(f.actions.length,0);
});

test('an idle squad already assigned to the first free bay can be reused without borrowing another bay',t=>{
    const f=fixture(t);f.s.eventTeams['under:0']=['idle-0','idle-1','idle-2'];f.add('other-bay');f.s.eventTeams['under:1']=['other-bay'];
    const idle=H.undergroundIdleMembers(f.s,f.e,f.now()).map(mon=>mon.uid);
    assert.ok(['idle-0','idle-1','idle-2'].every(uid=>idle.includes(uid)));assert.ok(!idle.includes('other-bay'));assert.ok(f.plan().ready.includes('underground'));
});

test('background dispatch waits for foreground preparation transitions and needs three compatible identities',t=>{
    const f=fixture(t);f.e.preparation={phase:'restore',uids:[],targets:[]};assert.ok(!f.plan().ready.includes('underground'));assert.match(f.plan().blocked.underground,/切换/);
    f.e.preparation=null;for(const mon of f.s.mons.filter(mon=>mon.uid.startsWith('idle-')))mon.id=74;
    assert.equal(H.undergroundIdleMembers(f.s,f.e,f.now()).length,3);assert.ok(!f.plan().ready.includes('underground'));assert.match(f.plan().blocked.underground,/同时出战/);
});

test('background dispatch requires having entered Sinnoh, not merely opening an earlier region',()=>{
    for(const s of [{adv:{chapter:0,unlocked:47},travel:{to:['johto','hoenn']}},{adv:{chapter:31,unlocked:47},travel:{to:['hoenn']}}])assert.equal(H.undergroundBackgroundUnlocked(s),false);
    assert.equal(H.undergroundBackgroundUnlocked({adv:{chapter:48,unlocked:48},travel:{to:[]}}),true);
    assert.equal(H.undergroundBackgroundUnlocked({adv:{chapter:0,unlocked:65},travel:{to:['sinnoh']}}),true);
});

test('idle member selection leaves the adventure party and travelling squad untouched',t=>{
    const f=fixture(t),before=JSON.stringify(f.s);assert.deepEqual(H.undergroundIdleMembers(f.s,f.e,f.now()).map(mon=>mon.uid).sort(),['idle-0','idle-1','idle-2']);
    f.s.road.push('idle-0');assert.ok(!H.undergroundIdleMembers(f.s,f.e,f.now()).some(mon=>mon.uid==='idle-0'));
    f.s.road.pop();assert.equal(JSON.stringify(f.s),before);
});

test('Buddy, explicit trainees and both preparation snapshots are protected from background dispatch',t=>{
    const f=fixture(t);for(const uid of ['buddy','trainee','prep-target','prep-plan','prep-original','raid-target','raid-plan','raid-original'])f.add(uid);
    f.s.buddy={uid:'buddy'};f.e.trainProtected=['trainee'];
    f.e.preparation={targets:[{uid:'prep-target'}],uids:['prep-plan'],originalTeam:['prep-original']};
    f.e.raidPreparation={targets:[{uid:'raid-target'}],uids:['raid-plan'],originalTeam:['raid-original']};
    const selected=new Set(H.undergroundIdleMembers(f.s,f.e,f.now()).map(mon=>mon.uid));
    for(const uid of ['buddy','trainee','prep-target','prep-plan','prep-original','raid-target','raid-plan','raid-original'])assert.equal(selected.has(uid),false,uid);
    assert.equal(selected.has('idle-0'),true);
});

test('reserved special squads and other underground slot selections are not borrowed',t=>{
    const f=fixture(t);for(const uid of ['raid-member','zone-member','league-member','candy-member','other-bay'])f.add(uid);
    f.s.eventTeams={'raid:kanto':['raid-member'],'zone:150':['zone-member'],'league:sinnoh':['league-member'],candy:['candy-member'],'under:1':['other-bay']};
    const selected=new Set(H.undergroundIdleMembers(f.s,f.e,f.now()).map(mon=>mon.uid));
    for(const uid of ['raid-member','zone-member','league-member','candy-member','other-bay'])assert.equal(selected.has(uid),false,uid);
    const own=f.prepare();for(const uid of own)assert.ok(H.undergroundIdleMembers(f.s,f.e,f.now()).some(mon=>mon.uid===uid),'the current bay can revalidate its own safe selected UID');
});

test('active tower, candy, league and expedition references cannot become idle candidates',t=>{
    const f=fixture(t);for(const uid of ['tower-member','candy-clone','league-clone','already-sent'])f.add(uid);
    f.s.tower={run:{mons:[{src:'tower-member',uid:'t:clone'}]}};f.s.candy={run:{mons:[{src:'candy-clone',uid:'c:clone'}]}};
    f.s.adv.league={team:['league-clone']};f.s.under.slots=[{id:'away',bay:0,end:f.now()+10000,team:['already-sent'],mons:[{uid:'already-sent',id:74}]}];
    const selected=new Set(H.undergroundIdleMembers(f.s,f.e,f.now()).map(mon=>mon.uid));
    for(const uid of ['tower-member','candy-clone','league-clone','already-sent'])assert.equal(selected.has(uid),false,uid);
});

test('used members remain excluded today and return to eligibility after the native Paris day changes',t=>{
    const f=fixture(t);f.s.under.used['idle-0']=1;assert.ok(!H.undergroundIdleMembers(f.s,f.e,f.now()).some(mon=>mon.uid==='idle-0'));
    f.s.under.day='2026-11-16';assert.ok(H.undergroundIdleMembers(f.s,f.e,f.now()).some(mon=>mon.uid==='idle-0'));
});

test('idle dispatch is ready during ordinary automatic combat but never changes that battle',t=>{
    const f=fixture(t);f.s.adv.battle={steps:2,enemies:[{id:19,hp:50}]};const before=JSON.stringify(f.s);
    assert.ok(f.plan().ready.includes('underground'));assert.equal(JSON.stringify(f.s),before);
});

for(const field of ['pending','event','zone','tower','league'])test(`background dispatch yields to native ${field}`,t=>{
    const f=fixture(t);f.s.adv[field]={id:1};assert.ok(!f.plan().ready.includes('underground'));
});

for(const field of ['pendingMap','teamTask','ownedDialog','navigation'])test(`background dispatch yields to ${field}`,t=>{
    const f=fixture(t);f.e.driver[field]={};assert.ok(!f.plan().ready.includes('underground'));
});

test('background dispatch never starts under manual control, hidden tabs or a paused game',t=>{
    const f=fixture(t);f.e.manual={until:f.now()+15000};assert.ok(!f.plan().ready.includes('underground'));f.e.manual=null;
    global.document.hidden=true;assert.ok(!f.plan().ready.includes('underground'));global.document.hidden=false;
    f.s.adv.paused=true;assert.ok(!f.plan().ready.includes('underground'));
});

test('daily quota, available bays and three real idle members all gate a new dispatch',t=>{
    const f=fixture(t);assert.ok(f.plan().ready.includes('underground'));
    f.s.under.sent=H.undergroundStatus(f.s,f.now()).perDay;assert.ok(!f.plan().ready.includes('underground'));
    f.s.under.sent=0;f.s.under.slots=[{id:'away',bay:0,end:f.now()+600000,team:[],mons:[]}];assert.ok(!f.plan().ready.includes('underground'));
    f.s.under.slots=[];f.s.mons=f.s.mons.filter(mon=>mon.uid!=='idle-2');assert.ok(!f.plan().ready.includes('underground'));
});

test('a collection-only opt-out still allows an explicitly enabled dispatch service',t=>{
    const f=fixture(t,{autoUnderCollect:false,autoUnderDispatch:true});assert.ok(f.plan().ready.includes('underground'));
    f.e.settings.autoUnderDispatch=false;assert.ok(!f.plan().ready.includes('underground'));
});

test('dedicated underground goals and completed foreground goals do not open another background dispatch',t=>{
    const f=fixture(t,{mode:'underground'});assert.ok(!f.plan().ready.includes('underground'));
    f.e.settings.mode='money';f.e.settings.moneyTarget=1000;assert.equal(f.plan().mainComplete,true);assert.ok(!f.plan().ready.includes('underground'));
});

test('idle-only dispatch may coexist with an incomplete manual party without borrowing its members',t=>{
    const f=fixture(t,{autoTeam:false});f.s.team=f.s.team.slice(0,3);f.s.road=[...f.s.team];
    const before=[...f.s.team],plan=f.plan();assert.ok(plan.ready.includes('underground'));
    const idle=new Set(H.undergroundIdleMembers(f.s,f.e,f.now()).map(mon=>mon.uid));for(const uid of before)assert.equal(idle.has(uid),false);
    assert.deepEqual(f.s.team,before);
});

test('pending background dispatch and counters survive independent service-state normalization',()=>{
    const raw={underDispatched:7,underClaimed:3,underground:{action:'dispatch',started:123,returnScreen:'adventure',bay:0,uids:['a','b','c'],editorOpen:true,teamReady:true,launch:{bay:0,ids:['prior'],uids:['a','b','c'],at:124}}};
    const normalized=H.normalizeServiceState(raw);assert.equal(normalized.underDispatched,7);assert.equal(normalized.underClaimed,3);
    assert.equal(normalized.underground.action,'dispatch');assert.deepEqual(normalized.underground.uids,['a','b','c']);assert.deepEqual(normalized.underground.launch,{bay:0,ids:['prior'],uids:['a','b','c'],at:124});
    normalized.underground.uids.push('new');assert.deepEqual(raw.underground.uids,['a','b','c'],'normalized task owns its arrays');
});

test('one launch click waits for the native expedition and cannot repeat while the save is delayed',t=>{
    const f=fixture(t),uids=f.prepare(),beforeTeam=[...f.s.team],beforeRoad=[...f.s.road];
    for(let n=0;n<8&&!f.e.services.underground?.launch;n++){f.service();f.advance(1200);}
    assert.ok(f.e.services.underground?.launch);const clicks=()=>f.actions.filter(action=>action.type==='click'&&action.el===f.go);
    assert.equal(clicks().length,1);assert.equal(f.e.services.underDispatched,0);
    for(let n=0;n<5;n++){f.advance(1200);f.service();}assert.equal(clicks().length,1);
    f.commit('confirmed',uids);for(let n=0;n<6&&f.e.services.underground;n++){f.advance(1200);f.service();}
    assert.equal(f.e.services.underDispatched,1);assert.equal(f.e.services.underground,null);assert.equal(f.ui.screen,'adventure');
    assert.deepEqual(f.s.team,beforeTeam);assert.deepEqual(f.s.road,beforeRoad);assert.equal(f.e.budget.spent,0);assert.equal(f.e.budget.used,0);
});

test('a team member becoming protected before launch cancels dispatch without moving that member',t=>{
    const f=fixture(t);f.prepare();f.s.buddy={uid:'idle-0'};for(let n=0;n<4;n++){f.service();f.advance(1200);}
    assert.equal(f.actions.some(action=>action.type==='click'&&action.el===f.go),false);assert.equal(f.s.under.slots.length,0);assert.ok(f.s.mons.some(mon=>mon.uid==='idle-0'));
    assert.equal(f.e.running,true);assert.equal(f.e.services.underDispatched,0);
});

test('Stop preserves a launch awaiting native confirmation so restart does not resend it',t=>{
    const f=fixture(t),uids=f.prepare();for(let n=0;n<8&&!f.e.services.underground?.launch;n++){f.service();f.advance(1200);}
    const launch=structuredClone(f.e.services.underground.launch);f.e.stop('fixture stop');assert.deepEqual(f.e.services.underground.launch,launch);
    const saved=JSON.parse(f.data.get('pokecatch-helper:v1:'+f.e.account));assert.deepEqual(saved.services.underground.launch,launch);
    f.commit('late-confirmed',uids);const next=new H.Engine(f.storage);next.loadAccount(f.s);next.running=true;next.started=f.now();next.tabToken='under-bg-tab';next.schedule=()=>{};next.automation.begin(f.s);
    next.driver.nav=f.e.driver.nav;next.driver.click=f.e.driver.click;const before=f.actions.filter(action=>action.type==='click'&&action.el===f.go).length;
    for(let n=0;n<5&&next.services.underground;n++){next.automation.serviceUnderground(f.s,f.now());f.advance(1200);}
    assert.equal(next.services.underDispatched,1);assert.equal(f.actions.filter(action=>action.type==='click'&&action.el===f.go).length,before);
});

test('an expired rejected launch clears only after native readiness and all three members are verified',t=>{
    const f=fixture(t),uids=f.prepare();
    const old={bay:0,uids:[...uids],ids:[],at:f.now()};f.e.services.underground.launch=old;
    f.advance(120001);const now=f.now();assert.equal(f.service(),true);
    assert.equal(f.e.services.underground,null);assert.equal(f.e.running,true);
    assert.equal(f.e.services.underDispatched,0);assert.equal(f.e.services.retryAt.underground,now+60000);
    assert.equal(f.ui.screen,'adventure');assert.equal(f.actions.some(action=>action.type==='click'&&action.el===f.go),false);
    assert.ok(uids.every(uid=>f.s.mons.some(mon=>mon.uid===uid)));
    const saved=JSON.parse(f.data.get('pokecatch-helper:v1:'+f.e.account));assert.equal(saved.services.underground,null);
    f.advance(59999);assert.equal(f.service(),false,'The recovered transaction must respect the full backoff');
    assert.equal(f.actions.some(action=>action.type==='click'&&action.el===f.go),false);
});

for(const condition of ['disabled launch control','missing member','matching job with stale PC members'])test(`expired underground launch retains its transaction for ${condition}`,t=>{
    const f=fixture(t),uids=f.prepare();
    const launch={bay:0,uids:[...uids],ids:[],at:f.now()};f.e.services.underground.launch=launch;
    if(condition==='disabled launch control')f.go.disabled=true;
    if(condition==='missing member')f.s.mons=f.s.mons.filter(mon=>mon.uid!==uids[0]);
    if(condition==='matching job with stale PC members')f.s.under.slots.push({id:'unconfirmed',bay:0,team:[...uids],mons:uids.map(uid=>f.s.mons.find(mon=>mon.uid===uid)),end:f.now()+600000});
    f.save();f.advance(120001);assert.equal(f.service(),true);
    assert.deepEqual(f.e.services.underground.launch,launch,'Uncertain native results cannot authorize a repeated dispatch');
    assert.equal(f.e.running,false);assert.equal(f.e.services.underDispatched,0);
    assert.equal(f.actions.some(action=>action.type==='click'&&action.el===f.go),false);
    const saved=JSON.parse(f.data.get('pokecatch-helper:v1:'+f.e.account));assert.deepEqual(saved.services.underground.launch,launch);
});

test('a native expedition confirmed after the timeout is counted once without clearing and relaunching it',t=>{
    const f=fixture(t),uids=f.prepare();
    f.e.services.underground.launch={bay:0,uids:[...uids],ids:[],at:f.now()};
    f.advance(120001);f.commit('very-late-confirmation',uids);assert.equal(f.service(),true);
    assert.equal(f.e.services.underDispatched,1);assert.equal(f.e.services.underground,null);assert.equal(f.e.running,true);
    assert.equal(f.s.under.slots.length,1);assert.equal(f.actions.some(action=>action.type==='click'&&action.el===f.go),false);
    assert.equal(f.service(),false);assert.equal(f.e.services.underDispatched,1);
});

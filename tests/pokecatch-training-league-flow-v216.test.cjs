const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const preparationTick=require('./fixtures/pokecatch-preparation-tick.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

function state(){
    const mons=[289,282,257,319,310,365].map((id,i)=>({uid:'m'+i,id,level:[92,90,93,83,83,74][i],reg:'hoenn',xp:0}));
    return{trainer:{id:'league-flow-v216'},money:10000,mons,team:mons.map(mon=>mon.uid),road:mons.map(mon=>mon.uid),dex:{},items:{},stats:{},
        travel:{to:['johto','hoenn']},link:{from:'johto',to:'hoenn',side:'to'},
        adv:{layout:H.DATA.layout,chapter:43,unlocked:46,node:0,runs:10,speed:4,loops:['L:hoenn'],badges:[],gifts:{},deaths:{}}};
}
function league(){
    const chapters=H.DATA.chapters.filter(c=>c.loop==='L:hoenn');
    return{...chapters[0],key:'L:hoenn',members:chapters.map(c=>c.id),units:chapters.reduce((n,c)=>n+c.units,0),reward:chapters.reduce((n,c)=>n+c.reward,0)};
}

test('the downloaded native ordinary-league defeat branch returns to its first room with or without looping',t=>{
    const bundle=process.env.POKECATCH_NATIVE_APP||path.join(os.tmpdir(),'pokecatch-capture-audit-20261117','app.js');
    if(!fs.existsSync(bundle)){t.skip('Optional public native bundle is not available');return;}
    const native=require('../tools/pokecatch-native-vm.cjs')(bundle);
    native.run('const G=__pcResearch.Game,A=__pcResearch.Adventure;G.load();G.stopSaving();A.ensure();const base=structuredClone(G.S)');
    for(const chapter of [43,46,47])for(const loops of [[],['L:hoenn']]){
        // Start the actual gym battle, then force its native round-limit defeat on a synthetic save.
        const next=native.run(`G.sandbox(structuredClone(base),()=>{
            const s=G.S,mon=G.makeMon(129,1),adv=s.adv;
            s.mons=[mon];s.team=[mon.uid];s.road=[mon.uid];adv.unlocked=47;adv.loops=${JSON.stringify(loops)};
            A.setChapter(${chapter});adv.node=adv.nodes.findLastIndex(node=>node.type==='gym');A.step();
            mon.hp=1;adv.battle.turn=10000;adv.battle.queue=[];
            for(let i=0;i<8;i++)if(A.step().some(event=>event.type==='defeat'))return adv.chapter;
            throw Error('Expected an ordinary league defeat');
        })`);
        assert.equal(next,43,JSON.stringify({chapter,loops}));
    }
});

test('league telemetry does not record individual chapter clears as complete XP cycles',()=>{
    const s=state(),row=league(),t=new H.Telemetry(),settings={...H.DEFAULTS,mode:'train'};t.begin(s,row,settings,0);
    s.adv.node=2;t.observe(s,row,settings,10000);
    for(let chapter=44;chapter<=47;chapter++){
        s.adv.chapter=chapter;s.adv.runs++;s.mons[0].xp+=100;
        assert.equal(t.observe(s,row,settings,(chapter-43)*60000),null);assert.deepEqual(t.metrics,{});
    }
    s.adv.chapter=43;s.adv.runs++;s.adv.node=0;
    assert.equal(t.observe(s,row,settings,300000).valid,false,'the first complete or partial entry remains a warm-up');
    assert.deepEqual(t.metrics,{});
});

test('a warm partial league entry rebases at the first room without treating a one-clear reentry as measured',()=>{
    const s=state(),row=league(),t=new H.Telemetry(),settings={...H.DEFAULTS,mode:'train'};s.adv.chapter=46;t.begin(s,row,settings,0);
    s.adv.node=2;t.observe(s,row,settings,10000);s.adv.runs+=2;s.adv.chapter=43;s.adv.node=0;s.mons[0].xp=200;
    assert.equal(t.observe(s,row,settings,30000).valid,false);assert.equal(t.sample.full,true);
    s.adv.node=2;t.observe(s,row,settings,40000);s.adv.runs++;s.adv.node=0;s.mons[0].xp=300;
    assert.equal(t.observe(s,row,settings,60000).valid,false,'one chapter increment cannot validate an already warmed five-chapter league');
    assert.deepEqual(t.metrics,{});
    s.adv.node=2;t.observe(s,row,settings,70000);s.adv.runs+=5;s.adv.node=0;s.mons[0].xp=800;s.money+=1000;
    const result=t.observe(s,row,settings,360000),m=t.metrics[H.metricsKey(s,row,settings,360000)];
    assert.equal(result.valid,true);assert.equal(result.xp,500);assert.equal(result.seconds,300);assert.equal(m.xpRuns,1);assert.equal(m.xp,500);assert.equal(m.net,1000);
});

function fixture(t){
    const before=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};
    t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
    const s=state(),now=Date.now(),data=new Map([['pokecatch-tab','league-flow-tab']]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();
    const e=new H.Engine(storage,{mode:'progress',progressUntil:65,autoPrepare:true,autoTeam:false,raids:false,trainBuddy:false,trainBuff:false,moneyBuff:false,progressCandy:false});
    e.loadAccount(s);e.running=true;e.started=now;e.tabToken='league-flow-tab';e.nextRaid=Infinity;e.schedule=()=>{};e.read();
    const row=league(),context=H.battleContext(s,'progress',{row:{...H.DATA.chapters[46],members:row.members}});
    const p={mode:'progress',context,resume:{},targets:s.mons.map(mon=>({uid:mon.uid,id:mon.id,goal:95})),uids:[...s.team],originalTeam:[...s.team],originalLocation:row,
        phase:'train',phaseAt:now,started:now,lastTick:now,lastGrowth:now,frontier:46,avoid:{},route:row,visit:{at:now,deaths:0},routeCheck:now};
    e.preparation=p;p.routeProfile=e.coach.reviewDifficulty(s,p,now);const mapped=[];
    Object.assign(e.driver,{animations:()=>false,dismissInformation:()=>false,receipt:()=>false,dialog:()=>false,gift:()=>false,nav:()=>true,map:r=>{mapped.push(r.key);return true;},clearLoops:()=>true});
    t.after(()=>e.stop());return{s,e,p,row,now,save,mapped};
}

test('league preparation keeps its existing route while earlier council rooms clear',t=>{
    const {s,e,p,now,save,mapped}=fixture(t);
    for(let chapter=43;chapter<=46;chapter++){
        s.adv.chapter=chapter;s.adv.node=2;s.adv.runs++;s.mons[0].xp+=10;save();
        e.coach.step(s,now+(chapter-43)*1200);assert.equal(e.preparation,p);assert.equal(p.phase,'train');assert.equal(p.route.key,'L:hoenn');
    }
    assert.deepEqual(mapped,[]);assert.equal(e.settings.progressUntil,65);
});

test('clearing the original Drake frontier continues the champion room without restarting the league',async t=>{
    const {s,e,p,now,save,mapped}=fixture(t);s.adv.chapter=47;s.adv.unlocked=47;s.adv.node=3;s.adv.loops=[];
    s.adv.battle={steps:2,enemies:[{id:376,level:95,hp:100}]};save();e.coach.step(s,now);
    assert.equal(e.preparation,null);assert.equal(s.adv.chapter,47);assert.equal(s.adv.node,3);assert.ok(s.adv.battle);
    e.settings.autoPrepare=false;await e.step(now+1200);
    assert.equal(e.preparation,null);assert.equal(s.adv.chapter,47);assert.equal(s.adv.node,3);assert.ok(s.adv.battle);assert.deepEqual(mapped,[]);assert.equal(e.settings.progressUntil,65);
    assert.match(e.status,/推进主线|推进联盟/);
});

test('repeated league defeats apply one shared league cooldown and return to an easier training route',async t=>{
    const {s,e,p,now,save}=fixture(t);s.adv.deaths[43]=2;save();await preparationTick(e,()=>e.coach.step(s,now));
    assert.equal(p.phase,'travel');assert.equal(p.avoid['L:hoenn'],now+600000);assert.equal(p.routeCeiling,94);
    const alternatives=H.preparationRoutes(s,e.settings,p,e.metrics,now);assert.ok(alternatives.length);assert.ok(alternatives.every(row=>row.key!=='L:hoenn'));
    assert.equal(e.settings.progressUntil,65);
});

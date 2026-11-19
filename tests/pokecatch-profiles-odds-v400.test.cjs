const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

function state(){return{trainer:{id:'v400-profile'},mons:[{uid:'a',id:6,level:70}],team:['a'],road:['a'],dex:{},money:5000,items:{},stats:{},travel:{to:[]},adv:{layout:H.DATA.layout,chapter:0,unlocked:8,badges:[],loops:[],gifts:{}}};}
function engine(){const s=state(),data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','profile-tab']]);const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};const e=new H.Engine(storage);e.loadAccount(s);e.tabToken='profile-tab';return{s,e,data,storage};}

test('configuration backups export only normalized settings and fresh pending jobs',()=>{
    const f=engine();f.e.queue=[{id:'one',title:'目标',settings:{mode:'money',moneyTarget:50000},status:'running',progress:{budget:{spent:999},flow:{resourceTx:{secret:true}}}}];
    const profile=H.configurationProfile(f.e);assert.equal(profile.format,'pokecatch-helper-profile');assert.equal(profile.queue[0].status,'pending');assert.equal(profile.queue[0].progress,undefined);
    assert.equal(profile.queue[0].settings.moneyTarget,50000);for(const key of ['account','mons','services','resume','budget','metrics'])assert.equal(profile[key],undefined,key);
});

test('profile import is reviewed settings only and never starts a task or writes the native save',()=>{
    const f=engine(),before=f.data.get('gachamon-save-v1');f.e.services.underDispatched=3;
    const profile=H.configurationProfile({settings:{mode:'train',trainLevel:75},queue:[{id:'one',settings:{mode:'progress'},status:'done'}]});
    H.importConfigurationProfile(f.e,JSON.stringify(profile));assert.equal(f.e.settings.mode,'train');assert.equal(f.e.settings.trainLevel,75);assert.equal(f.e.running,false);assert.equal(f.e.checkpoint,null);
    assert.equal(f.e.queue[0].status,'pending');assert.equal(f.e.services.underDispatched,3);assert.equal(f.data.get('gachamon-save-v1'),before);
    assert.equal(JSON.parse(f.data.get('pokecatch-helper:v1:v400-profile')).resume,null);
});

test('active, suspended, foreign-tab and unbound accounts cannot import configurations',()=>{
    const f=engine(),profile=H.configurationProfile(f.e);f.e.running=true;assert.throws(()=>H.importConfigurationProfile(f.e,profile),/停止/);
    f.e.running=false;f.e.suspended={};assert.throws(()=>H.importConfigurationProfile(f.e,profile),/停止/);f.e.suspended=null;
    f.data.set('pokecatch-tab','another');assert.throws(()=>H.importConfigurationProfile(f.e,profile),/另一个标签页/);
    f.e.account=null;assert.throws(()=>H.importConfigurationProfile(f.e,profile),/先进入游戏/);
});

test('malformed, oversized, foreign and unsupported queue profiles are rejected before any state change',()=>{
    const f=engine(),profile=H.configurationProfile(f.e),before=f.e.settings;
    for(const input of ['{',JSON.stringify({format:'game-save'}),{...profile,schema:99},{...profile,queue:[{settings:{mode:'evil'}}]},{...profile,queue:Array(51).fill({settings:{mode:'money'}})}])assert.throws(()=>H.importConfigurationProfile(f.e,input));
    assert.throws(()=>H.parseConfigurationProfile(' '.repeat(2*1024*1024+1)),/2MB/);assert.equal(f.e.settings,before);
});

test('failed configuration persistence rolls in-memory settings and task queue back',()=>{
    const f=engine(),before={settings:f.e.settings,queue:f.e.queue};for(let i=0;i<205;i++)f.e.metrics['sample'+i]={at:i};
    f.storage.setItem=()=>{throw Error('quota');};
    assert.throws(()=>H.importConfigurationProfile(f.e,H.configurationProfile({settings:{mode:'money'},queue:[]})),/quota/);
    assert.equal(f.e.settings,before.settings);assert.equal(f.e.queue,before.queue);assert.equal(Object.keys(f.e.metrics).length,205);
});

test('an account or save-layout switch while stopped cannot import into a stale profile',()=>{
    for(const change of [s=>{s.trainer.id='different-account';},s=>{s.adv.layout=999;}]){
        const f=engine(),settings=f.e.settings,profile=H.configurationProfile(f.e),before=f.data.get('pokecatch-helper:v1:v400-profile');
        change(f.s);f.data.set('gachamon-save-v1',JSON.stringify(f.s));
        assert.throws(()=>H.importConfigurationProfile(f.e,profile),/账号或存档版本/);assert.equal(f.e.settings,settings);assert.equal(f.data.get('pokecatch-helper:v1:v400-profile'),before);
    }
});

test('a malformed daily cap or reserve cannot silently become zero when importing a profile or queued job',()=>{
    const f=engine(),profile=H.configurationProfile(f.e);
    const before=JSON.stringify(f.e.settings);
    profile.queue=[{settings:{mode:'resource',spendBudget:20000}}];
    for(const invalid of [null,false,[],{},' ','-1',0.5,1e12+1]){
        profile.queue[0].settings.dailySpendBudget=invalid;
        assert.throws(()=>H.importConfigurationProfile(f.e,profile),/队列第 1 项.*每日支出上限/);
        assert.equal(JSON.stringify(f.e.settings),before);
        assert.equal(f.e.queue.length,0);
    }
    profile.queue[0].settings.dailySpendBudget='0';
    profile.settings.moneyReserve=false;
    assert.throws(()=>H.importConfigurationProfile(f.e,profile),/当前任务.*金币保留额/);
    profile.settings.moneyReserve=' 2500 ';
    H.importConfigurationProfile(f.e,profile);
    assert.equal(f.e.settings.moneyReserve,2500);
    assert.equal(f.e.queue[0].settings.dailySpendBudget,0);
});

test('damaged stored coin limits block new spending while preserving valid inventory usage and old missing fields',()=>{
    for(const key of ['spendBudget','moneyReserve','dailySpendBudget']){
        const config=H.normalizeSettings({spendBudget:500, [key]:false, useBudget:3});
        assert.equal(config.spendBudget,0,key);
        assert.equal(config.useBudget,3);
    }
    const config=H.normalizeSettings({spendBudget:'420',useBudget:[]});
    assert.equal(config.useBudget,0);
    assert.equal(config.spendBudget,420);
    assert.equal(config.moneyReserve,H.DEFAULTS.moneyReserve);
    assert.equal(H.normalizeSettings({spendBudget:10,moneyReserve:0}).spendBudget,10);
});

test('a lease takeover during persistence rolls the imported settings and queue back',()=>{
    const f=engine(),before={settings:f.e.settings,queue:f.e.queue};let calls=0;
    f.e.mayPersist=()=>++calls===1;
    assert.throws(()=>H.importConfigurationProfile(f.e,H.configurationProfile({settings:{mode:'money'},queue:[]})),/接管/);
    assert.equal(f.e.settings,before.settings);assert.equal(f.e.queue,before.queue);assert.equal(f.data.get('pokecatch-helper:v1:v400-profile'),undefined);
});

test('profile import strips progress payloads and prototype-looking foreign fields',()=>{
    const f=engine(),profile=H.configurationProfile(f.e);profile.queue=[{id:'a',settings:{mode:'money'},progress:{flow:{resourceTx:{}}}}];
    const imported=H.parseConfigurationProfile(JSON.stringify(profile).replace('"schema":1','"schema":1,"__proto__":{"polluted":true}'));
    assert.equal({}.polluted,undefined);assert.equal(imported.queue[0].progress,undefined);assert.equal(imported.polluted,undefined);
});

test('wild shiny odds use exact native regional dex completion rather than helper basic-family completion',()=>{
    const s=state();assert.equal(H.shinyOdds(s).rate,1/2048);for(const root of H.ROOTS.filter(mon=>mon.id<=151))s.dex[root.id]={caught:1};
    assert.equal(H.shinyOdds(s).complete,false);for(let id=1;id<=151;id++)s.dex[id]={caught:1};
    assert.equal(H.shinyOdds(s).rate,1/1024);assert.equal(H.shinyOdds(s,{region:'johto'}).rate,1/2048);
});

test('shiny berries affect wild encounters while underground fossil and egg probabilities stay independent',()=>{
    const s=state(),now=Date.now();s.buffs={shiny:{key:'starf-berry',until:now+10000}};
    assert.equal(H.shinyOdds(s,{},now).rate,1/1024);assert.equal(H.shinyOdds(s,{kind:'underground'},now).rate,1/2048);
    assert.equal(H.shinyOdds(s,{kind:'egg'},now).rate,1/512);assert.equal(H.shinyOdds(s,{},now+10001).rate,1/2048);
});

test('egg odds preserve new and legacy parent rules and the independent egg-berry multiplier',()=>{
    const s=state(),eggs=[{},{sp:2},{sp:1},{bx:1},{sp:2,bx:1},{sp:1,bx:1}];
    assert.deepEqual(eggs.map(egg=>H.shinyOdds(s,{kind:'egg',egg}).rate),[1/512,1/16,.1,1/256,1/8,.2]);
    assert.equal(H.shinyOdds(s,{kind:'egg',egg:{shiny:true,sp:2}}).rate,1);assert.equal(H.shinyOdds(s,{kind:'egg',egg:{shiny:false,bx:1}}).rate,0);
});

test('normal legends and roamers never acquire raid appearance probabilities',()=>{
    const s=state();assert.equal(H.shinyOdds(s,{kind:'legend'}).rate,0);assert.equal(H.shinyOdds(s,{kind:'roam'}).rate,0);assert.equal(H.shinyOdds(s,{kind:'raid'}).rate,1);
    assert.match(H.shinyOdds(s,{kind:'raid'}).reason,/捕获率另计/);
});

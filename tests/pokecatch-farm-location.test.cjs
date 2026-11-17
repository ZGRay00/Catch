const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(t,mode){
    const before=global.document;global.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
    const now=Date.now(),s={trainer:{id:'farm-location'},money:10000,mons:[{uid:'a',id:150,level:70}],team:['a'],road:['a'],dex:{},items:{},stats:{},travel:{to:[]},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],gifts:{},deaths:{}}};
    const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
    const e=new H.Engine(storage,{mode,manualPause:false,autoPrepare:false,autoTeam:false,raids:false,trainBuddy:false,trainBuff:false,moneyBuff:false,trainLevel:100,itemId:'rare-candy'});e.loadAccount(s);e.running=true;e.started=now;e.schedule=()=>{};
    const rank={train:H.xpRanking,item:H.itemRanking,money:H.moneyRanking}[mode],target=rank(s,e.settings,{}, {},now)[0];assert.ok(target);
    e.target=target;e.visit={started:now-300000,deaths:0};e.lastExplore=now;
    e.metrics[H.metricsKey(s,target,e.settings,now)]={xp:1e9,xpSeconds:60,xpRuns:2,net:1e9,seconds:60,runs:2,itemCounts:{'rare-candy':1e9},itemSeconds:60,itemRuns:2};
    const save=()=>storage.setItem('gachamon-save-v1',JSON.stringify(s));save();e.read();const nav=[];e.driver.nav=screen=>{nav.push(screen);return true;};
    return{s,e,target,now,save,nav,run:()=>mode==='money'?e.money(s,now):e.farm(s,now,mode)};
}

for(const mode of ['train','item','money']){
    test(`${mode} farming returns to its target when manual control changed the native chapter without pausing`,t=>{
        const {s,e,target,save,run}=fixture(t,mode);s.adv.chapter=target.members.includes(0)?1:0;save();run();
        assert.equal(e.running,true);assert.equal(e.driver.pendingMap?.row.key,target.key,'a remembered target is not evidence that the game is still on its map');e.stop();
    });
    test(`${mode} farming keeps a valid current map without issuing a duplicate travel`,t=>{
        const {s,e,target,save,run,nav}=fixture(t,mode);s.adv.chapter=target.members[0];save();run();
        assert.equal(e.running,true);assert.equal(e.driver.pendingMap,null);assert.deepEqual(nav,['adventure']);assert.equal(e.target.key,target.key);e.stop();
    });
}

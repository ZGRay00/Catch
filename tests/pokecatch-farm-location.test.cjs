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
        const {s,e,target,save,run,nav}=fixture(t,mode);s.adv.chapter=target.members[0];s.adv.loops=[target.loop];save();run();
        assert.equal(e.running,true);assert.equal(e.driver.pendingMap,null);assert.deepEqual(nav,['adventure']);assert.equal(e.target.key,target.key);e.stop();
    });
}

test('Belue berry farming stays in Giant Chasm after a dry run and compares measured pace only when both routes have samples',t=>{
    const {s,e,now,save,nav}=fixture(t,'item');
    e.settings.itemId='belue-berry';s.travel.to=['unova'];
    Object.assign(s.adv,{chapter:83,unlocked:83,loops:[83],badges:['Maître Unys']});
    save();e.read();
    const rank=()=>H.itemRanking(s,e.settings,e.metrics,{},now);
    const [cave,road]=rank();
    assert.deepEqual([cave.id,road.id],[83,76]);
    const caveKey=H.metricsKey(s,cave,e.settings,now),roadKey=H.metricsKey(s,road,e.settings,now);
    e.metrics[caveKey]={itemSeconds:452.028,itemRuns:1,itemCounts:{}};
    e.target=cave;e.farm(s,now,'item');
    assert.equal(e.driver.pendingMap,null);assert.deepEqual(nav,['adventure']);
    assert.equal(rank()[0].rate,cave.rate);assert.equal(rank()[0].actualRate,0);
    e.metrics[roadKey]={itemSeconds:240,itemRuns:2,itemCounts:{'belue-berry':1}};
    assert.deepEqual(rank().map(r=>r.rate),[cave.rate,road.rate]);
    e.metrics[caveKey].itemRuns=2;e.metrics[caveKey].itemSeconds=1000;
    const comparable=rank();
    assert.ok(comparable.every(r=>r.useMeasuredTime));
    assert.equal(comparable[0].id,76);
    e.metrics[caveKey].itemCounts['belue-berry']=4;
    assert.deepEqual(rank().map(r=>r.rate),comparable.map(r=>r.rate));
    e.farm(s,now,'item');assert.equal(e.driver.pendingMap?.row.id,76);
    e.stop();
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../dist/pokecatch-helper.user.js');
const now=Date.now();
function fixture(mode='shiny',itemId='berry-oran',chapter=0){
    const row={...H.DATA.chapters[chapter],key:String(chapter),members:[chapter]};
    const s={trainer:{id:'tail-test'},mons:[],team:[],road:[],items:{},dex:{},adv:{
        chapter,unlocked:83,node:1,nodes:[{type:'wild'},{type:'trainer'},{type:'gym'}],
        runs:2,loops:[chapter],gifts:{},badges:['Maître Unys']}};
    const e=new H.Engine({getItem:()=>null,setItem(){},removeItem(){}},{mode,itemId,autoTeam:false});
    e.account=s.trainer.id;e.running=true;e.target=row;e.visit={started:now};e.farmTailProtected=()=>false;let clicks=0;
    e.driver.map=(_row,_s,options)=>{assert.deepEqual(options,{restart:true,farmTail:true});clicks++;return true;};
    return {e,s,row,step:()=>e.restartFarmTail(s,row,now),get clicks(){return clicks;}};
}
test('all regional Victory Roads and the highest three eligible money routes finish their laps',async()=>{
    const {e,s}=fixture();delete e.farmTailProtected;
    for(const c of H.DATA.chapters.filter(c=>c.name==='冠军之路')){s.adv.chapter=c.id;assert.equal(e.farmTailProtected(s,c,now),true);}
    s.mons=[{uid:'a',id:6,level:80,reg:'kanto'}];s.team=['a'];s.road=['a'];s.travel={to:[]};s.adv.chapter=1;s.adv.unlocked=8;
    const cfg={...e.settings,mode:'money',region:'all',moneyTarget:0};
    const rows=H.moneyRanking(s,cfg,{}, {},now);
    assert.ok(rows.length>3);
    for(const [i,row] of rows.slice(0,4).entries()){
        s.adv.chapter=row.id;
        for(let n=0;n<200&&e.farmTailProtected(s,row,now)&&e.rankingJobs.size;n++)await new Promise(r=>setTimeout(r,5));
        assert.equal(e.farmTailProtected(s,row,now),i<3);
    }
});
test('shiny hunts keep the last grass and its battle, then restart even in a live trainer or gym battle',()=>{
    for(const kind of ['trainer','gym']){
        const f=fixture(),a=f.s.adv;
        a.nodes=[{type:'heal'},{type:'trainer'},{type:'wild',phenom:'grass'},{type:kind}];
        assert.equal(f.step(),false);
        a.node=2;assert.equal(f.step(),false);
        a.battle={kind:'wild',enemies:[{id:25,shiny:true}]};assert.equal(f.step(),false);
        a.node=3;a.battle={kind,enemies:[{id:25}]};assert.equal(f.step(),true);assert.equal(f.step(),false);
        a.node=0;delete a.battle;assert.equal(f.step(),false);
        a.node=3;assert.equal(f.step(),true);assert.equal(f.clicks,2);
    }
});
test('berries distinguish actual town rewards, unresolved item rolls and healing berries',()=>{
    const f=fixture('item'),a=f.s.adv;
    a.nodes=[{type:'item'},{type:'trainer'},{type:'item',town:true,find:{item:'berry-oran'}},{type:'berry'},{type:'gym'}];
    a.battle={kind:'trainer'};assert.equal(f.step(),false);
    delete a.battle;a.node=2;assert.equal(f.step(),false);
    a.nodes[2].find={money:100};assert.equal(f.step(),true);
    const g=fixture('item');g.s.adv.nodes.push({type:'item',loot:{unrelated:0.2}});
    assert.equal(g.step(),false);
    g.s.adv.nodes.pop();g.s.adv.nodes.push({type:'gift',gift:{items:['berry-oran']}});
    assert.equal(g.step(),false);assert.equal(g.clicks,0);
});
test('conditional target loot only counts on a generated item node and zero weight gives no chance',()=>{
    const f=fixture('item','light-stone',69),a=f.s.adv;
    a.nodes[1]={type:'item',loot:{'light-stone':{p:.1,skies:['rain']}}};assert.equal(f.step(),false);
    a.nodes[1].type='wild';assert.equal(f.step(),true);
    const g=fixture('item','light-stone',69);g.s.adv.nodes[1]={type:'item',loot:{'light-stone':{p:0}}};
    assert.equal(g.step(),true);
});
test('interruptions, uncertain layouts, protected encounters and unrelated activities keep their map',()=>{
    for(const mode of ['item','shiny']){
        const f=fixture(mode),a=f.s.adv;
        for(const key of ['paused','pending','zone','event','league','tower']){
            a[key]=true;assert.equal(f.step(),false,key);delete a[key];
        }
        a.nodes[2].shiny=true;assert.equal(f.step(),false);delete a.nodes[2].shiny;
        a.nodes.push({type:'unknown'});assert.equal(f.step(),false);a.nodes.pop();
        a.node=3;assert.equal(f.step(),false);a.node=1;
        a.loops=[];assert.equal(f.step(),false);assert.equal(f.clicks,0);
    }
});
test('the native restart button rechecks the latest lap and a pending capture before committing',()=>{
    const f=fixture(),{e,s,row}=f,driver=new H.DOMDriver(e),button={isConnected:true,closest:()=>null,
        getAttribute:()=>null,getClientRects:()=>[{}]};
    const originalDoc=global.document,originalStyle=global.getComputedStyle;let clicks=0;
    try{
        global.document={querySelector:q=>q.includes('.mp-restart')?button:null};
        global.getComputedStyle=()=>({opacity:1});driver.nav=()=>true;driver.click=()=>{clicks++;return true;};
        let fresh=structuredClone(s);e.read=()=>fresh;
        const run=()=>driver.map(row,s,{restart:true,farmTail:true});
        fresh.adv.nodes.push({type:'wild'});assert.equal(run(),false);fresh.adv.nodes.pop();
        e.shinySettlement={};assert.equal(run(),false);e.shinySettlement=null;
        assert.equal(run(),true);assert.equal(clicks,1);
    }finally{global.document=originalDoc;global.getComputedStyle=originalStyle;}
});

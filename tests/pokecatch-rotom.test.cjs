const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const {sources}=require('../pokecatch-helper/data/rotom.json');
const day=new Date(2026,10,25,12).getTime(),night=new Date(2026,10,25,21).getTime();
function fixture(chapter=52){
    return {mons:[],team:[],road:[],items:{},travel:{to:['sinnoh']},dex:{479:{caught:1}},
        adv:{chapter,unlocked:83,node:0,nodes:[{type:'trainer'}],gifts:{},badges:[],loops:[chapter],runs:4}};
}
const config=(mode,ids)=>H.normalizeSettings({mode,region:'all',[mode+'Species']:ids,autoTeam:false});
const fixed=id=>({type:'static',id,once:sources.find(s=>s.id===id).once});
function engine(cfg){
    const e=new H.Engine({getItem:()=>null,setItem(){},removeItem(){}},cfg);
    e.running=true;e.visit={};e.driver.nav=()=>true;return e;
}
test('each Rotom needs its own native capture receipt, including traded forms, and forecasts update immediately',()=>{
    for(const {id,chapter,once} of sources){
        const s=fixture(chapter),cfg=config('shiny',[id]);
        s.dex[id]={caught:1}; // Includes acquisition through trading.
        for(const other of sources.filter(x=>x.id!==id))s.adv.gifts[other.once]=true;
        assert.deepEqual(cfg.shinySpecies,[id]);
        assert.equal(H.hasWildSource(s,cfg,id),false);
        assert.deepEqual(H.shinyRanking(s,cfg,{},day),[]);
        assert.equal(H.nextWildWindow(s,cfg,[id],day,480),null);
        s.adv.gifts[once]=true;
        assert.equal(H.hasWildSource(s,cfg,id),true);
        const next=H.nextWildWindow(s,cfg,[id],day,480);
        assert.equal(next?.row.id,chapter,'forecast for '+id);
        const row=H.shinyRanking(s,cfg,{},next.at)[0];
        assert.equal(row.id,chapter);assert.ok(row.rotomWild&&row.expected>0&&row.expected<0.05);
        assert.ok(H.acquisitionSources(s,id,next.at).find(a=>a.kind==='wild'&&a.available));
        delete s.adv.gifts[once];
        assert.deepEqual(H.shinyRanking(s,cfg,{},next.at),[]);
        assert.match(H.acquisitionSources(s,id,next.at).find(a=>a.kind==='wild').detail,/固定遭遇中捕获/);
    }
});
test('a generated target still takes priority after its window closes and an empty route cannot restart then',()=>{
    const s=fixture(),cfg=config('dex',[47902,47905]),e=engine(cfg);
    s.adv.nodes.push(fixed(47905));
    let row=H.dexRanking(s,cfg,{},night).find(r=>r.id===52);
    assert.ok(row.marked&&row.targets.find(hit=>hit.id===47905).marked);
    assert.ok(e.followMarkedHunt(s,night));assert.match(e.status,/已生成/);
    assert.ok(H.acquisitionSources(s,47905,night).some(x=>x.kind==='static'&&x.available));
    s.adv.node=1;assert.equal(e.restartForRotom(s,row,night),false);
    s.adv.nodes[1]={type:'gym'};
    const single=config('dex',[47905]),only=engine(single);
    assert.deepEqual(H.dexRanking(s,single,{},night),[]);
    assert.equal(only.restartForRotom(s,{...row,targets:[{kind:'rotomStatic',id:47905}]},night),false);
    assert.equal(only.followMarkedHunt(s,night),false);
});
test('same-map targets, failed capture, protected encounters and duplicate restart clicks',()=>{
    const s=fixture(),cfg=config('dex',[47902,47905]),e=engine(cfg);
    s.adv.nodes.push(fixed(47902),fixed(47905),{type:'gym'});
    const row=()=>H.dexRanking(s,cfg,{},day).find(r=>r.id===52);
    let clicks=0;e.driver.map=(_row,state,options)=>{assert.equal(state,s);assert.deepEqual(options,{restart:true,rotom:true});clicks++;return true;};
    assert.equal(e.restartForRotom(s,row(),day),false);
    s.adv.node=2;assert.equal(e.restartForRotom(s,row(),day),false);
    s.adv.node=3;
    for(const field of ['battle','pending','paused','event','zone','league','tower']){
        s.adv[field]=true;assert.equal(e.restartForRotom(s,row(),day),false,field);delete s.adv[field];
    }
    assert.equal(e.restartForRotom(s,{...row(),targets:[...row().targets,{id:25}]},day),false);
    s.adv.nodes[3].shiny=true;assert.equal(e.restartForRotom(s,row(),day),false);delete s.adv.nodes[3].shiny;
    assert.equal(e.restartForRotom(s,row(),day),true);
    e.restartForRotom(s,row(),day+100);assert.equal(clicks,1);
    s.adv.node=0;s.adv.nodes=[{type:'trainer'},{type:'gym'}];assert.equal(e.restartForRotom(s,row(),day+200),true);assert.equal(clicks,2);
    assert.equal(e.restartForRotom(s,row(),day+500),false);
    s.adv.node=1;assert.equal(e.restartForRotom(s,row(),day+1000),true);assert.equal(clicks,3);
});
test('a generated base Rotom is retained as an appliance prerequisite after sunrise',()=>{
    const s=fixture(49),cfg=config('dex',[47903]),e=engine(cfg);
    s.dex={};s.adv.nodes=[fixed(479)];
    const row=H.dexRanking(s,cfg,{},day)[0];
    assert.equal(row.id,49);assert.ok(row.marked&&row.prepNote);
    assert.ok(e.followMarkedHunt(s,day));s.adv.gifts['rotom-tv']=true;
    assert.equal(e.followMarkedHunt(s,day),false);
});

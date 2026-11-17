const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
function fixture(){
    const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const s={trainer:{id:'metrics-retention'},mons:[{uid:'a',id:6,level:40,xp:0}],team:['a'],dex:{},money:1000,items:{},travel:{to:[]},stats:{},
        adv:{layout:H.DATA.layout,chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],badges:[],deaths:{}}};
    const e=new H.Engine(storage);e.loadAccount(s);return{s,e,storage};
}

test('long running sampling retains the same two hundred newest records in memory and storage',()=>{
    const {e,storage}=fixture(),reference=e.metrics;
    for(let i=0;i<600;i++)e.metrics['route-'+i]={net:i,seconds:60,runs:1,at:i};
    e.persist(false,false);const saved=JSON.parse(storage.getItem('pokecatch-helper:v1:metrics-retention')).metrics;
    assert.equal(Object.keys(e.metrics).length,200);assert.equal(e.metrics,reference);assert.equal(e.telemetry.metrics,reference);assert.deepEqual(saved,e.metrics);
    assert.equal(e.metrics['route-399'],undefined);assert.ok(e.metrics['route-400']);assert.ok(e.metrics['route-599']);
});

test('pruning past contexts preserves the active telemetry ledger and its next full-cycle measurement',()=>{
    const {s,e,storage}=fixture(),row=H.candidates(s,e.settings,true).find(r=>r.id===0),key=H.metricsKey(s,row,e.settings);
    for(let i=0;i<300;i++)e.metrics['old-'+i]={net:0,seconds:60,runs:1,at:i};
    const current={net:0,seconds:0,runs:0,at:1000};e.metrics[key]=current;e.telemetry.begin(s,row,e.settings,1000);e.telemetry.sample.full=true;e.telemetry.sample.advanced=true;
    e.persist(false,false);s.money+=60;s.adv.runs++;
    assert.equal(e.telemetry.observe(s,row,e.settings,61000).valid,true);assert.equal(e.metrics[key],current);assert.equal(current.net,60);assert.equal(current.runs,1);
    e.persist(false,false);assert.equal(Object.keys(e.metrics).length,200);assert.equal(JSON.parse(storage.getItem('pokecatch-helper:v1:metrics-retention')).metrics[key].net,60);
});

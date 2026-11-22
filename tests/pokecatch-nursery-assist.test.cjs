'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const berry=H.NURSERY_RULES.berry,build=H.NURSERY_RULES.build;
function state(){
    return{
        trainer:{id:'nursery-automation',since:1234},adv:{layout:H.DATA.layout,chapter:0},
        mons:[],dex:{},items:{[berry]:2},pension:{
            mons:[{mon:{uid:'d',id:132}},{mon:{uid:'p',id:1,shiny:true}}],
            laid:0,eggs:[],open:{eggs:1},tick:1700000000000,egg:0,
        },
    };
}
function align(s,from,to){
    let k=0;
    while(!(H.nurseryFixedRoll(s,k)>=from&&H.nurseryFixedRoll(s,k)<to))k++;
    s.pension.laid=k;
    return k;
}
test('only the consecutive next verified berry-only egg is eligible, with positive stock and no pending berry',()=>{
    const s=state();
    const k=align(s,1/16,1/8);
    assert.equal(H.nextNurseryFeed(s,{build}).k,k);
    assert.equal(H.nextNurseryFeed(s,{build:'unknown'}),null);
    s.pension.bx=1;assert.equal(H.nextNurseryFeed(s,{build}),null);
    delete s.pension.bx;
    s.items[berry]=0;assert.equal(H.nextNurseryFeed(s,{build}),null);
    s.items[berry]=2;
    align(s,0,1/16);assert.equal(H.nextNurseryFeed(s,{build}),null);
    align(s,1/8,1);assert.equal(H.nextNurseryFeed(s,{build}),null);
});
test('nearly due or stale eggs are deferred until native autosave, while a full incubator can be fed',()=>{
    const s=state(),p=s.pension,now=p.tick,goal=H.NURSERY_RULES.eggMs;
    assert.equal(H.nurseryFeedWindow(p,now),true);
    assert.equal(H.nurseryFeedWindow(p,now+goal-1000),false);
    p.egg=goal;assert.equal(H.nurseryFeedWindow(p,now),false);
    p.eggs.push({uid:'occupied'});
    assert.equal(H.nurseryFeedWindow(p,now),true);
});
test('the new permissions default off and only survive for the account that enabled them',()=>{
    const s=state(),data=new Map([['gachamon-save-v1',JSON.stringify(s)],['pokecatch-tab','one']]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const e=new H.Engine(storage);
    e.loadAccount(s);
    assert.deepEqual(e.nurseryAssist.prefs,{idleHatch:false,autoFeed:false});
    e.nurseryAssist.set('autoFeed',true);
    const reload=new H.Engine(storage);reload.loadAccount(s);
    assert.deepEqual(reload.nurseryAssist.prefs,{idleHatch:false,autoFeed:true});
    const other={...s,trainer:{id:'other',since:1234}};
    storage.setItem('gachamon-save-v1',JSON.stringify(other));
    reload.loadAccount(other);
    assert.deepEqual(reload.nurseryAssist.prefs,{idleHatch:false,autoFeed:false});
});

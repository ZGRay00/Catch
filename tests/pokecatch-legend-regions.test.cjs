const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
function fixture(t,region='all'){
    const previous=global.document,now=Date.now(),s={mons:[],team:[],dex:{},travel:{to:['hoenn','johto']},adv:{chapter:0,unlocked:83,gifts:{}}};
    let active='kanto',switches=[];const visible={kanto:[],hoenn:[377],johto:[]},controls=new Set(Object.keys(visible));
    const e=new H.Engine({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},{region});
    e.driver.nav=()=>true;e.driver.click=el=>{switches.push(el.reg);active=el.reg;return true;};
    global.document={querySelector:sel=>{const reg=/data-rg="([^"]+)"/.exec(sel)?.[1];return controls.has(reg)?{reg,classList:{contains:()=>active===reg}}:null;},
        querySelectorAll:()=>visible[active].map(id=>({dataset:{ch:'Z'+id}}))};
    t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});
    return{e,s,now,visible,controls,switches,status:ids=>({ids:new Set(ids)})};
}
test('all-region dex planning visits the missing legendary region through a native region switch',t=>{
    const {e,s,now,status,switches}=fixture(t);assert.equal(e.findLegend(s,status([377]),now),true);assert.deepEqual(switches,['hoenn']);
    assert.equal(e.driver.pendingMap,null);assert.equal(e.findLegend(s,status([377]),now+1200),true);
    assert.equal(e.driver.pendingMap.row.id,377);assert.equal(e.driver.pendingMap.options.zone,true);assert.equal(e.legendProbe,null);
});
test('a legacy current-region preference still discovers an accessible legendary',t=>{
    const {e,s,now,status,switches}=fixture(t,'current');assert.equal(e.findLegend(s,status([377]),now),true);
    assert.deepEqual(switches,['hoenn']);assert.equal(e.nextLegend,0);assert.equal(e.driver.pendingMap,null);
});
test('the next probe is delayed only after every eligible missing region has been checked',t=>{
    const {e,s,now,status,visible,switches}=fixture(t);visible.hoenn=[];
    assert.equal(e.findLegend(s,status([145,377]),now),true);assert.equal(e.nextLegend,0);
    assert.equal(e.findLegend(s,status([145,377]),now+1200),true);assert.deepEqual(switches,['hoenn']);assert.equal(e.nextLegend,0);
    assert.equal(e.findLegend(s,status([145,377]),now+2400),false);assert.equal(e.nextLegend,now+602400);
});
test('cooldown, unknown targets and unopened regions are excluded without an endless scan',t=>{
    const {e,s,now,status,switches}=fixture(t);e.cooldowns.Z377=now+900000;
    assert.equal(e.findLegend(s,status([377,999999,494]),now),false);assert.deepEqual(switches,[]);assert.equal(e.legendProbe,null);
});
test('a vanished region is skipped and an unresponsive native switch has a bounded probe timeout',t=>{
    const {e,s,now,status,controls}=fixture(t);controls.delete('hoenn');assert.equal(e.findLegend(s,status([377]),now),false);
    controls.add('hoenn');e.nextLegend=0;e.driver.click=()=>false;assert.equal(e.findLegend(s,status([377]),now+1200),true);
    assert.equal(e.findLegend(s,status([377]),now+93000),false);assert.equal(e.legendProbe,null);assert.equal(e.nextLegend,now+693000);
});

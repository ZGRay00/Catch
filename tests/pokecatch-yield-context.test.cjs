const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
function state(){return{mons:[{uid:'a',id:6,level:50}],team:['a'],dex:{},money:1000,travel:{to:[]},adv:{chapter:0,unlocked:8,node:0,runs:0,speed:4,loops:[],deaths:{},capture:{on:true,target:'new',shiny:true}}};}
const settings={...H.DEFAULTS,region:'current'},route=s=>H.candidates(s,settings,true)[0];
test('money and XP estimates apply the native active yield multipliers',()=>{
    const s=state(),now=1000,money=H.moneyRanking(s,settings,{}, {},now).find(r=>r.id===0).rate,xp=H.xpRanking(s,settings,{}, {},now).find(r=>r.id===0).rate;
    s.buffs={money:{key:'lansat-berry',until:60000},xp:{key:'pinap-berry',until:60000}};
    assert.equal(H.moneyRanking(s,settings,{}, {},now).find(r=>r.id===0).rate,money*1.25);
    assert.equal(H.xpRanking(s,settings,{}, {},now).find(r=>r.id===0).rate,xp*1.25);
});
test('buddy XP only increases the estimate for the active buddy member',()=>{
    const s=state(),base=H.xpRanking(s,settings)[0].rate;s.buddy={uid:'pc'};assert.equal(H.xpRanking(s,settings)[0].rate,base);
    s.buddy.uid='a';assert.ok(Math.abs(H.xpRanking(s,settings)[0].rate-base*1.3)<1e-8);
});
test('an origin-side buff cannot contaminate the destination wallet metrics',()=>{
    const s=state(),now=1000;s.buffs={money:{key:'lansat-berry',until:60000,side:'from'}};s.link={from:'kanto',to:'johto',side:'from'};
    assert.equal(H.activeYieldBuff(s,'money',now).mult,1.25);s.link.side='to';assert.equal(H.activeYieldBuff(s,'money',now),null);
});
test('a buff expiry discards the mixed full-cycle sample and never records the partial gain',()=>{
    const s=state(),row=route(s),telemetry=new H.Telemetry();s.buffs={money:{key:'lansat-berry',until:50000}};
    telemetry.begin(s,row,settings,1000);telemetry.sample.full=true;telemetry.sample.advanced=true;s.adv.runs=1;s.money+=300;
    assert.equal(telemetry.observe(s,row,settings,61000),null);assert.equal(telemetry.sample,null);assert.deepEqual(telemetry.metrics,{});
});
test('extending an unchanged buff preserves its compatible measurements',()=>{
    const s=state(),row=route(s);s.buffs={money:{key:'lansat-berry',until:50000}};
    const key=H.metricsKey(s,row,settings,1000);s.buffs.money.until=100000;
    assert.equal(H.metricsKey(s,row,settings,2000),key,'expiry timestamps are not measurement identities');
});
test('taste and permanent stat changes invalidate historical map measurements',()=>{
    const s=state(),row=route(s),key=H.metricsKey(s,row,settings);s.mons[0].taste={h:'atk',up:{spa:25}};
    const taste=H.metricsKey(s,row,settings);assert.notEqual(taste,key);s.mons[0].taste.n=6;s.mons[0].taste.sw={};assert.equal(H.metricsKey(s,row,settings),taste);
    s.mons[0].statMult=1.3;assert.notEqual(H.metricsKey(s,row,settings),taste);
});
test('buddy changes and capture policy changes cannot reuse another gameplay context',()=>{
    const s=state(),row=route(s),key=H.metricsKey(s,row,settings);s.buddy={uid:'a'};
    const buddy=H.metricsKey(s,row,settings);assert.notEqual(buddy,key);s.adv.capture.on=false;assert.notEqual(H.metricsKey(s,row,settings),buddy);
});
test('samples spanning a temporary multiplier cannot be reused for an unboosted map ranking',()=>{
    const s=state(),row=route(s),now=1000;s.buffs={money:{key:'lansat-berry',until:50000}};
    const metrics={[H.metricsKey(s,row,settings,now)]:{net:100000,seconds:60,runs:2}};
    assert.equal(H.moneyRanking(s,settings,metrics,{},now).find(r=>r.id===row.id).measured,true);
    assert.equal(H.moneyRanking(s,settings,metrics,{},60000).find(r=>r.id===row.id).measured,false);
});

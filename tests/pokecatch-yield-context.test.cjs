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

test('learning Flash Cannon at 46 invalidates Empoleon’s Lv45 measurements for both XP and money',()=>{
    const s=state(),r=route(s),mon=s.mons[0];Object.assign(mon,{id:395,level:45});
    const key=H.metricsKey(s,r,settings,1000),history={[key]:{xp:20000,xpRuns:2,xpSeconds:120,net:300,runs:2,seconds:120}};
    const t=new H.Telemetry();t.begin(s,r,settings,1000);t.sample.full=true;t.sample.advanced=true;
    mon.level=46;s.adv.runs=1;
    const fresh=H.metricsKey(s,r,settings,61000);assert.notEqual(fresh,key);
    assert.equal(t.observe(s,r,settings,61000),null);
    assert.equal(H.xpRanking(s,settings,history,{},61000).find(row=>row.key===r.key).measured,false);
    assert.equal(H.moneyRanking(s,settings,history,{},61000).find(row=>row.key===r.key).measured,false);
    mon.level=47;assert.equal(H.metricsKey(s,r,settings,61000),fresh,'no additional attack learned at 47');
    mon.id=132;const ditto=H.metricsKey(s,r,settings,61000);mon.level=48;assert.notEqual(H.metricsKey(s,r,settings,61000),ditto);
});

test('legacy speed two follows the hosted game and a mixed-speed cycle cannot supply a rate',()=>{
    const cfg=H.normalizeSettings({mode:'train',speed:2});assert.equal(cfg.speed,1);
    assert.equal(H.normalizeJobs([{settings:{mode:'train',speed:2}}])[0].settings.speed,1);
    const s=state(),r=route(s),t=new H.Telemetry();s.adv.speed=2;t.begin(s,r,cfg,1000);assert.equal(t.sample,null);
    s.adv.speed=1;t.begin(s,r,cfg,2000);t.sample.full=true;t.sample.advanced=true;
    s.adv.speed=4;s.adv.runs++;assert.equal(t.observe(s,r,cfg,62000),null);assert.deepEqual(t.metrics,{});
});

test('Hoenn rain and clear full cycles retain separate XP and money rates across hours',()=>{
    const s=state();Object.assign(s.adv,{chapter:41,unlocked:43});Object.assign(s.mons[0],{id:9,level:70,reg:'hoenn'});
    const row={id:41,key:'41',members:[41]};
    const times=[],hour=3600000;
    for(let i=0;i<3*24;i++){
        const at=new Date(2026,10,19,10,15).getTime()+i*hour;
        if(new Date(at).getHours()>=10&&new Date(at).getHours()<20)times.push({at,sky:H.chapterWeather(s,41,at).key});
    }
    const index=times.findIndex((item,i)=>!item.sky&&times[i+1]?.sky==='rain'&&times[i+1].at===item.at+hour);
    assert.ok(index>=0,'fixture contains a daytime clear → rain transition');
    const clear=times[index].at,rain=times[index+1].at,key=H.metricsKey(s,row,settings,clear);
    const repeat=times.find(({at,sky})=>at!==clear&&!sky&&H.metricsKey(s,row,settings,at)===key);
    assert.ok(repeat,'another hour can reuse an identical encounter distribution and damage modifiers');
    assert.notEqual(key,H.metricsKey(s,row,settings,rain));
    const sample={net:9999999,seconds:60,runs:3,xp:99999999,xpSeconds:60,xpRuns:3};
    for(const ranking of [H.xpRanking,H.moneyRanking]){
        const score=(metrics,at)=>ranking(s,settings,metrics,{},at).find(r=>r.id===41);
        assert.equal(score({[key]:sample},repeat.at).samples,3);
        assert.equal(score({[key]:sample},rain).measured,false);
        const base=score({},clear),mixed=score({[key.split('|rules')[0]]:sample},clear);
        assert.equal(mixed.samples,0);assert.equal(mixed.measured,false);
        assert.ok(Math.abs(mixed.rate/base.rate-1.25)<1e-8,'mixed history is a bounded prior');
    }
    const t=new H.Telemetry();t.begin(s,row,settings,clear);t.sample.full=true;t.sample.advanced=true;
    s.adv.runs++;s.money+=999;
    assert.equal(t.observe(s,row,settings,rain),null);assert.equal(t.sample,null);assert.deepEqual(t.metrics,{});
});

test('indoor leagues ignore outdoor weather, distinguish damage-relevant nights and support key-only lookups',()=>{
    const s=state();s.adv.unlocked=14;
    const league=H.candidates(s,settings,true).find(r=>r.league),at=hour=>new Date(2026,10,19,hour,15).getTime();
    const day=H.metricsKey(s,league,settings,at(10));
    assert.equal(H.metricsKey(s,league,settings,at(18)),day);
    assert.equal(H.metricsKey(s,{key:league.key},settings,at(18)),day);
    assert.notEqual(H.metricsKey(s,league,settings,at(22)),day);
});

test('a fixed indoor route with no relevant attacks reuses current yields across nights and discounts pre-rebalance history',t=>{
    const s=state();s.adv.unlocked=57;s.adv.chapter=56;
    Object.assign(s.mons[0],{id:129,level:5,reg:'sinnoh'});
    const chapter=H.DATA.chapters[56],original=chapter.foes;chapter.foes=[[129,5,1]];t.after(()=>{chapter.foes=original;});
    const row={key:'56',members:[56]},at=hour=>new Date(2026,10,19,hour,15).getTime();
    const key=H.metricsKey(s,row,settings,at(14));assert.ok(!key.includes('|env'));
    assert.equal(H.metricsKey(s,row,settings,at(21)),key);
    const measured={net:600,seconds:60,runs:3},score=(metrics)=>H.moneyRanking(s,settings,metrics,{},at(21)).find(r=>r.id===56);
    assert.equal(score({[key]:measured}).rate,600);
    const legacy=score({[key.split('|rules')[0]]:measured});
    assert.equal(legacy.measured,false);assert.equal(legacy.samples,0);
    assert.equal(score({[key.replace(/\|rules[^|]+/,'|rulesold-payouts')]:measured}).rate,score({}).rate);
});

test('unlocking roaming separates town drop samples only on chapters with a changed shop pool',()=>{
    const s=state();s.mons[0].level=5;s.adv.badges=[];
    const source=H.ITEMS.get('rowap-berry').sources.find(entry=>entry.beforeRoaming===0&&entry.expected>0);
    assert.ok(source);const town={key:String(source.ch),members:[source.ch]},indoor={key:'9',members:[9]},at=1000;
    const townBefore=H.metricsKey(s,town,settings,at),indoorBefore=H.metricsKey(s,indoor,settings,at);
    s.adv.badges.push(H.ROAMING_DATA.groups[0].badge);
    assert.notEqual(H.metricsKey(s,town,settings,at),townBefore);
    assert.equal(H.metricsKey(s,indoor,settings,at),indoorBefore);
});

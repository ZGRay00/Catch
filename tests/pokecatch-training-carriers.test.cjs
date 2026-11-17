const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const settings={...H.DEFAULTS,region:'current'},screenshot=[[289,52],[282,52],[330,52],[257,52],[310,44],[275,43]];
function fixture(species=screenshot,unlocked=38){
    const mons=species.map(([id,level],i)=>({uid:`m${i}`,id,level,reg:'hoenn'}));
    const s={mons,team:mons.map(m=>m.uid),road:mons.map(m=>m.uid),travel:{to:['hoenn']},link:{from:'kanto',to:'hoenn',side:'to'},
        adv:{chapter:35,unlocked,speed:4,loops:[],badges:[],deaths:{}}};
    return{s,p:{uids:s.team,context:{reg:'hoenn'},avoid:{}}};
}
const routes=(s,p,metrics={},now=Date.now())=>H.preparationRoutes(s,settings,p,metrics,now);

test('the screenshot party prefers the efficient opened frontier over the level-37 volcano',()=>{
    const {s,p}=fixture(),rows=routes(s,p);assert.equal(H.trainingCap(s,s.mons[0]),52);assert.equal(rows[0].id,38);
    assert.ok(rows[0].rate>rows.find(row=>row.id===35).rate*1.5);assert.equal(H.xpRanking(s,settings)[0].id,38);
});
test('an efficient mixed party may train above its strongest member instead of a hard level cutoff',()=>{
    const {s,p}=fixture(screenshot.map(([id])=>[id,53]),40),row=routes(s,p)[0];assert.equal(row.id,39);assert.ok(row.maxLevel>Math.max(...s.mons.map(m=>m.level)));assert.ok(row.battleFit.coverage>=.9);assert.ok(row.battleFit.turns<=3);
    assert.equal(H.xpRanking(s,settings)[0].key,row.key);
});

test('native auto-switch can make weak attribute counters less efficient than a lower training map',()=>{
    const {s,p}=fixture(screenshot,40),rows=routes(s,p),higher=H.candidates(s,settings,true).find(row=>row.id===39),fit=H.battleRouteFit(s,higher),ordered=H.battleRouteFit({...s,autoSwitch:false},higher);
    assert.equal(rows[0].id,38);assert.ok(fit.turns>3);assert.ok(!rows.some(row=>row.id===39),'the slow route cannot pass the efficient-carrier gate merely on the strongest levels');
    assert.ok(fit.turns>ordered.turns);assert.ok(fit.deaths>ordered.deaths,'weak attribute counters add knockouts that an ideal-best-member estimate used to hide');
});
test('one active high-level carrier can take a level-five trainee to a higher XP map',()=>{
    const {s,p}=fixture([[150,70],[129,5]],42),row=routes(s,p)[0];assert.equal(row.id,41);assert.ok(row.maxLevel>70*.75+5*.25);assert.equal(row.trainingSafe,true);assert.equal(row.fallback,false);
});
test('an unused PC powerhouse does not authorize a weak trainee to farm its high-level maps',()=>{
    const {s,p}=fixture([[150,70],[129,5]],42);s.team=['m1'];p.uids=s.team;
    assert.equal(H.xpRanking(s,settings)[0].id,31);assert.equal(routes(s,p)[0].id,31);assert.equal(routes(s,p)[0].fallback,true);
});
test('a weak attackless party keeps the starting fallback and does not escalate while it cools down',()=>{
    const {s,p}=fixture([[129,5],[63,5]],42),rows=H.xpRanking(s,settings);assert.deepEqual(rows.map(row=>row.id),[31]);assert.equal(rows[0].fallback,true);assert.equal(routes(s,p)[0].id,31);
    assert.deepEqual(H.xpRanking(s,settings,{}, {'31':2000},1000),[]);
    p.avoid['31']=2000;assert.deepEqual(routes(s,p,{},1000),[],'preparation also waits rather than escalating past an avoided starter');
});
test('a carrier from the locked origin side cannot provide destination battle coverage',()=>{
    const {s,p}=fixture([[150,70],[129,5]],42);s.mons[0].reg='kanto';const rows=routes(s,p);
    assert.equal(rows[0].id,31);assert.equal(rows[0].fallback,true);assert.ok(rows.every(row=>row.battleFit.coverage===0));
});
test('two complete measured runs remain authoritative while cooldowns and failure ceilings still exclude the route',()=>{
    const {s,p}=fixture([[129,5],[63,5]],42),row=H.candidates(s,settings,true).find(row=>row.id===41),now=1000;
    const metrics={[H.metricsKey(s,row,settings,now)]:{xp:900000,xpSeconds:60,xpRuns:2}};
    assert.equal(H.xpRanking(s,settings,metrics,{},now)[0].rate,900000);assert.equal(routes(s,p,metrics,now)[0].id,41);
    p.avoid['41']=2000;assert.ok(!routes(s,p,metrics,now).some(row=>row.id===41));p.avoid={};p.routeCeiling=52;assert.ok(!routes(s,p,metrics,now).some(row=>row.id===41));
});
test('XP estimates count uncapped trainees and exclude the capped carrier buddy bonus',()=>{
    const {s,p}=fixture(),now=1000,row=H.xpRanking(s,settings,{}, {},now).find(row=>row.id===35),chapter=H.DATA.chapters[35];
    const expected=chapter.xpEstimate*2/Math.max(20,chapter.units*2.8/2.5)*60*row.battleFit.factor;
    assert.equal(row.rate,expected);s.buddy={uid:'m0'};assert.equal(H.xpRanking(s,settings,{}, {},now).find(row=>row.id===35).rate,expected);
    s.buddy.uid='m4';s.buffs={xp:{key:'pinap-berry',until:60000}};const boosted=H.xpRanking(s,settings,{}, {},now).find(row=>row.id===35);
    assert.ok(Math.abs(boosted.rate-expected*2.3/2*1.25)<1e-8);assert.equal(routes(s,p,{},now).find(row=>row.id===35).rate,boosted.rate);
});
test('XP samples from before a party member caps are not reused within the same ten-level bucket',()=>{
    const {s}=fixture();s.mons[0].level=51;const row=H.candidates(s,settings,true).find(row=>row.id===35),before=H.metricsKey(s,row,settings);
    const metrics={[before]:{xp:900000,xpSeconds:60,xpRuns:2}};s.mons[0].level=52;
    assert.notEqual(H.metricsKey(s,row,settings),before);assert.equal(H.xpRanking(s,settings,metrics).find(row=>row.id===35).measured,false);
});

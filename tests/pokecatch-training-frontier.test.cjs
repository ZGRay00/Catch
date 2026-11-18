const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');

function fixture(){
    const mons=[289,282,330,257,310,275].map((id,i)=>({uid:'h'+i,id,level:[69,68,69,71,71,69][i],reg:'hoenn'}));
    const s={mons,team:mons.map(m=>m.uid),road:mons.map(m=>m.uid),dex:{},items:{},stats:{},travel:{to:['johto','hoenn']},link:{to:'hoenn',side:'to'},
        adv:{chapter:41,unlocked:42,speed:4,node:35,runs:1,loops:[41],badges:[],gifts:{},deaths:{}}};
    return{s,p:{uids:[...s.team],context:{reg:'hoenn'},avoid:{}},settings:{...H.DEFAULTS,mode:'train',region:'current'}};
}
const preparation=(s,p,settings=H.DEFAULTS,metrics={},now=Date.now())=>H.preparationRoutes(s,settings,p,metrics,now);

test('the level-69 screenshot party can train on the opened Victory Road frontier rather than being limited to the previous gym',()=>{
    const {s,p,settings}=fixture(),rows=preparation(s,p,settings),frontier=rows.find(row=>row.id===42),gym=rows.find(row=>row.id===41);
    assert.ok(frontier);assert.equal(rows[0].id,42);assert.equal(frontier.trainingFrontier,true);assert.ok(frontier.rate>gym.rate*1.15);assert.ok(frontier.battleFit.coverage>=.9);assert.ok(frontier.battleFit.turns<=3);
});

test('explicit training shares the same efficient frontier candidate and rate as temporary preparation',()=>{
    const {s,p,settings}=fixture(),rows=H.xpRanking(s,settings);assert.equal(rows[0].id,42);assert.equal(rows[0].rate,preparation(s,p,settings)[0].rate);
});

test('the same six evolved Hoenn members can profitably move from Mt Pyre to Mind Badge before three-turn clears',()=>{
    const {s,p,settings}=fixture(),now=Date.UTC(2026,10,18,12);
    s.buddy=null;s.buffs={};s.adv.chapter=38;s.adv.unlocked=39;
    for(const m of s.mons)m.level=50;
    assert.equal(H.xpRanking(s,settings,{}, {},now)[0].id,38);
    for(const m of s.mons)m.level=51;
    for(const rows of [H.xpRanking(s,settings,{}, {},now),preparation(s,p,settings,{},now)]){
        const badge=rows[0],previous=rows.find(row=>row.id===38);
        assert.equal(badge.id,39);assert.equal(badge.measured,false);
        assert.ok(badge.battleFit.turns>3&&badge.battleFit.turns<=4.5);
        assert.ok(badge.battleFit.minCoverage>=.999&&badge.rate>previous.rate*1.15);
    }
    for(const m of s.mons)m.level=52;
    assert.ok(H.xpRanking(s,settings,{}, {},now).find(row=>row.id===39).battleFit.turns<=3);
});

test('an apparently profitable frontier with heavy attrition waits until the real squad can handle its hardest fight',()=>{
    const {s,settings}=fixture(),now=Date.UTC(2026,10,18,12);
    for(const m of s.mons)m.level=65;
    const frontier=H.trainingCandidates(s,settings).find(r=>r.id===42);
    assert.ok(H.battleRouteFit(s,frontier,s.team,now).worstDeaths>2);
    assert.equal(H.xpRanking(s,settings,{}, {},now)[0].id,41);
    for(const m of s.mons)m.level=66;
    assert.equal(H.xpRanking(s,settings,{}, {},now)[0].id,42);
});

test('two complete positive XP runs can establish a frontier despite a pessimistic forecast but never bypass failure backoff',()=>{
    const {s,p,settings}=fixture(),now=Date.UTC(2026,10,18,12);
    for(const m of s.mons)m.level=64;
    const candidate=H.trainingCandidates(s,settings).find(row=>row.id===42);
    const sample={xp:840000,xpRuns:1,xpSeconds:170};
    const metrics={[H.metricsKey(s,candidate,settings,now)]:sample};
    assert.ok(!H.xpRanking(s,settings,metrics,{},now).some(row=>row.id===42));
    sample.xp*=2;sample.xpSeconds*=2;sample.xpRuns=2;
    const winner=H.xpRanking(s,settings,metrics,{},now)[0];
    assert.equal(winner.id,42);assert.equal(winner.rate,sample.xp/sample.xpSeconds*60);
    assert.equal(preparation(s,p,settings,metrics,now)[0].id,42);
    p.avoid['42']=now+100;
    assert.ok(!preparation(s,p,settings,metrics,now).some(row=>row.id===42));
    assert.ok(!H.xpRanking(s,settings,metrics,p.avoid,now).some(row=>row.id===42));
});

test('allowing training on a frontier preserves cash replay and ordinary item/dex candidate policies',()=>{
    const {s,settings}=fixture();assert.ok(H.candidates(s,settings).some(row=>row.id===42));assert.ok(!H.candidates(s,settings,true).some(row=>row.id===42));
    assert.ok(!H.moneyRanking(s,settings).some(row=>row.members.includes(42)));
    const item=H.itemRanking(s,{...settings,itemId:'rare-candy'}).find(row=>row.id===42),dex=H.dexRanking(s,settings).find(row=>row.id===42);
    assert.ok(item);assert.ok(dex);assert.equal(item.trainingFrontier,undefined);assert.equal(dex.trainingFrontier,undefined);
});

test('weak trainees retain an old starting route instead of treating the uncompleted frontier as a fallback',()=>{
    const {s,p,settings}=fixture();s.mons=[{uid:'a',id:129,level:5,reg:'hoenn'},{uid:'b',id:63,level:5,reg:'hoenn'}];s.team=['a','b'];s.road=[...s.team];p.uids=[...s.team];
    const rows=preparation(s,p,settings);assert.deepEqual(rows.map(row=>row.id),[31]);assert.equal(rows[0].fallback,true);assert.deepEqual(H.xpRanking(s,settings).map(row=>row.id),[31]);
});

test('a high level alone cannot authorize a poor attacking party to attempt the new frontier',()=>{
    const {s,p,settings}=fixture();s.mons=[{uid:'a',id:63,level:75,reg:'hoenn'}];s.team=['a'];p.uids=['a'];
    const frontier={...H.DATA.chapters[42],members:[42]},fit=H.battleRouteFit(s,frontier,p.uids);assert.ok(fit.turns>3);
    assert.ok(!preparation(s,p,settings).some(row=>row.id===42));assert.ok(!H.xpRanking(s,settings).some(row=>row.id===42));
});

test('an unused PC carrier cannot make a weak active party frontier-ready',()=>{
    const {s,p,settings}=fixture();s.mons.push({uid:'weak',id:129,level:5,reg:'hoenn'});s.team=['weak'];s.road=['weak'];p.uids=['weak'];
    assert.ok(!preparation(s,p,settings).some(row=>row.id===42));assert.ok(!H.xpRanking(s,settings).some(row=>row.id===42));
});

test('failure cooldowns and a temporary difficulty ceiling remain authoritative over frontier access',()=>{
    const {s,p,settings}=fixture(),now=1000;p.avoid['42']=2000;
    assert.ok(!preparation(s,p,settings,{},now).some(row=>row.id===42));assert.ok(!H.xpRanking(s,settings,{}, {'42':2000},now).some(row=>row.id===42));
    p.avoid={};p.routeCeiling=71;assert.ok(!preparation(s,p,settings).some(row=>row.id===42));p.routeCeiling=72;assert.equal(preparation(s,p,settings)[0].id,42);
});

test('a frontier outside the current region scope or not opened by travel is still excluded',()=>{
    const {s,settings}=fixture();s.adv.chapter=0;
    assert.ok(!H.xpRanking(s,settings).some(row=>row.id===42));assert.ok(H.xpRanking(s,{...settings,region:'all'}).some(row=>row.id===42));
    s.travel.to=[];assert.ok(!H.xpRanking(s,{...settings,region:'all'}).some(row=>row.id===42));
});

test('opening the first league battle does not synthesize an incomplete league loop for training',()=>{
    const {s,p,settings}=fixture();s.adv.unlocked=43;
    assert.ok(!H.xpRanking(s,settings).some(row=>row.league));assert.ok(!preparation(s,p,settings).some(row=>row.league));assert.ok(H.xpRanking(s,settings).some(row=>row.id===42));
});

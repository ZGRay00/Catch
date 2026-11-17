const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const settings={...H.DEFAULTS,mode:'train',region:'current'};
function fixture(unlocked=46){
    const mons=[289,282,257,319,310,365].map((id,i)=>({uid:'p'+i,id,level:[92,90,93,83,83,74][i],reg:'hoenn'}));
    return{mons,team:mons.map(mon=>mon.uid),road:mons.map(mon=>mon.uid),travel:{to:['johto','hoenn']},link:{from:'johto',to:'hoenn',side:'to'},
        adv:{chapter:42,unlocked,loops:[42],speed:4,badges:[],deaths:{}}};
}
const league=s=>H.trainingCandidates(s,settings).find(row=>row.key==='L:hoenn');

test('opening the first native league room enables a full training-loop forecast',()=>{
    assert.equal(league(fixture(42)),undefined);
    const row=league(fixture(43));assert.ok(row);assert.equal(row.id,43);assert.equal(row.reg,'hoenn');
    assert.deepEqual(row.members,[43,44,45,46,47]);assert.equal(row.trainingLeagueFrontier,true);assert.equal(row.trainingFrontier,true);
});

test('the source-stage screenshot gets one whole league candidate rather than only cleared rooms',()=>{
    const s=fixture(),rows=H.trainingCandidates(s,settings),row=rows.find(row=>row.key==='L:hoenn'),members=H.DATA.chapters.filter(chapter=>chapter.loop==='L:hoenn');
    assert.equal(rows.filter(row=>row.key==='L:hoenn').length,1);assert.equal(row.name,'丰缘 · 联盟');
    assert.ok(row.members.includes(47),'the still-future champion belongs to the risk/reward forecast');
    assert.equal(row.reward,members.reduce((sum,chapter)=>sum+chapter.reward,0));assert.equal(row.units,members.reduce((sum,chapter)=>sum+chapter.units,0));
    assert.equal(row.members.reduce((sum,id)=>sum+H.DATA.chapters[id].xpEstimate,0),838352);
});

test('a mature league candidate is not duplicated or relabeled as a new frontier',()=>{
    for(const unlocked of [47,48]){
        const s=fixture(unlocked),rows=H.trainingCandidates(s,settings),row=rows.find(row=>row.key==='L:hoenn');
        assert.equal(rows.filter(row=>row.key==='L:hoenn').length,1);assert.equal(row.trainingLeagueFrontier,undefined);assert.equal(row.trainingFrontier,undefined);
    }
});

test('training-only league access leaves generic replay and money candidate policies intact',()=>{
    const s=fixture();assert.ok(league(s));
    assert.ok(!H.candidates(s,settings,true).some(row=>row.key==='L:hoenn'));
    assert.ok(!H.candidates(s,settings).some(row=>row.key==='L:hoenn'));
    assert.ok(!H.moneyRanking(s,{...settings,mode:'money'}).some(row=>row.key==='L:hoenn'));
});

test('current-region scope does not expose another region league even when travel is open',()=>{
    const s=fixture();s.adv.chapter=0;
    assert.ok(!H.trainingCandidates(s,settings).some(row=>row.key==='L:hoenn'));
    assert.ok(H.trainingCandidates(s,{...settings,region:'all'}).some(row=>row.key==='L:hoenn'));
    s.travel.to=[];assert.ok(!H.trainingCandidates(s,{...settings,region:'all'}).some(row=>row.key==='L:hoenn'));
});

test('an unfinished league forecast cannot become the weak-party fallback',()=>{
    const s=fixture(43);s.mons=[{uid:'weak',id:63,level:1,reg:'hoenn'}];s.team=['weak'];s.road=['weak'];
    assert.ok(league(s));const rows=H.xpRanking(s,settings);assert.ok(rows.length);assert.ok(rows.every(row=>!row.league));
    assert.equal(rows[0].id,31);assert.equal(rows[0].fallback,true);
});

test('every regional league is forecast only after its own first room has opened',()=>{
    for(const region of H.DATA.regions){
        const members=H.DATA.chapters.filter(chapter=>chapter.reg===region.key&&chapter.league);if(!members.length)continue;
        const s=fixture();s.adv.chapter=region.start;s.adv.unlocked=members[0].id;s.travel.to=[];
        const rows=H.trainingCandidates(s,settings),row=rows.find(row=>row.key===String(members[0].loop));
        assert.ok(row,region.key);assert.deepEqual(row.members,members.map(chapter=>chapter.id));
        s.adv.unlocked=members[0].id-1;assert.ok(!H.trainingCandidates(s,settings).some(row=>row.key===String(members[0].loop)),region.key);
    }
});

test('league forecasting does not mutate original chapter reward and membership data',()=>{
    const s=fixture(),before=JSON.stringify(H.DATA.chapters.filter(chapter=>chapter.loop==='L:hoenn')),row=league(s);
    row.members.push(999);row.reward=0;row.units=0;
    assert.equal(JSON.stringify(H.DATA.chapters.filter(chapter=>chapter.loop==='L:hoenn')),before);
    assert.deepEqual(league(s).members,[43,44,45,46,47]);
});

const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
function fixture(id=25,level=70,reg='kanto'){
    const s={mons:[{uid:'train',id,level,reg}],team:['train'],travel:{to:reg==='johto'?['johto']:[]},
        adv:{chapter:reg==='johto'?14:0,unlocked:reg==='johto'?24:8,speed:4,loops:[],badges:[],deaths:{}}};
    return{s,p:{uids:['train'],context:{reg},avoid:{}}};
}
const routes=(s,p,metrics={},now=Date.now())=>H.preparationRoutes(s,H.DEFAULTS,p,metrics,now);

test('equal-level trainees with different moves and defenses no longer receive an identical training map',()=>{
    const fire=fixture(6,62,'johto'),grass=fixture(152,62,'johto');
    const a=routes(fire.s,fire.p),b=routes(grass.s,grass.p);
    assert.equal(a[0].id,19,'native move choice and accuracy make the steel route faster for this fire counter');
    assert.notEqual(a[0].id,b[0].id,'equal levels still select different routes when their battle capabilities differ');
    assert.notEqual(b[0].id,21,'a weak grass trainee receives a less punishing route');
    assert.ok(b.find(r=>r.id===21).battleFit.factor<a[0].battleFit.factor);
});

test('a high-level electric trainee is not sent to the ground gym solely because its level matches',()=>{
    const {s,p}=fixture(),rows=routes(s,p);
    assert.notEqual(rows[0].id,7);assert.ok(rows.find(r=>r.id===7).battleFit.factor<.5);
    assert.ok(rows.every(row=>row.members.every(id=>H.DATA.chapters[id].ace<=70)));
});

test('high level does not make a weak attacking species as efficient as a capable counter',()=>{
    const weak=fixture(129),strong=fixture(150),a=routes(weak.s,weak.p),b=routes(strong.s,strong.p);
    assert.notEqual(a[0].id,7);assert.ok(a.find(r=>r.id===7).battleFit.factor<b.find(r=>r.id===7).battleFit.factor);
});

test('the model uses the actual training party and permits a strong carrier to cover a weak trainee',()=>{
    const {s,p}=fixture(129),row=H.candidates(s,H.DEFAULTS,true).find(r=>r.id===7),alone=H.battleRouteFit(s,row,p.uids);
    s.mons.push({uid:'carry',id:150,level:70});
    assert.deepEqual(H.battleRouteFit(s,row,p.uids),alone,'a strong PC member contributes only after being placed in the training plan');
    p.uids.push('carry');assert.ok(H.battleRouteFit(s,row,p.uids).factor>alone.factor);
});

test('an attackless or immune matchup keeps a bounded fallback rather than hiding every training map',()=>{
    const {s,p}=fixture(63,1);s.adv.unlocked=0;
    const rows=routes(s,p);assert.equal(rows.length,1);assert.equal(rows[0].id,0);assert.equal(rows[0].fallback,true);
    const fit=H.battleRouteFit(s,{reg:'kanto',foes:[{id:92,level:10,weight:1}]},p.uids);
    assert.equal(fit.factor,.02);assert.equal(fit.coverage,0);assert.ok(Number.isFinite(fit.turns));
});

test('normal immunity uses the native typeless Struggle fallback in route difficulty',()=>{
    const {s,p}=fixture(19,5),fit=H.battleRouteFit(s,{reg:'kanto',foes:[{id:92,level:5,weight:1}]},p.uids);
    assert.ok(fit.coverage>0);assert.ok(Number.isFinite(fit.turns));assert.ok(fit.factor>=.02&&fit.factor<=1);
});

test('two complete measured XP cycles supersede the type heuristic while live failure avoidance remains authoritative',()=>{
    const {s,p}=fixture(),row=H.candidates(s,H.DEFAULTS,true).find(r=>r.id===7),key=H.metricsKey(s,row,H.DEFAULTS);
    const metrics={[key]:{xp:2000000,xpSeconds:100,xpRuns:2,runs:2,net:1,seconds:100}};
    let rows=routes(s,p,metrics,1000);assert.equal(rows[0].id,7);assert.equal(rows[0].rate,1200000);assert.equal(rows[0].measured,true);
    p.avoid['7']=2000;rows=routes(s,p,metrics,1000);assert.ok(!rows.some(r=>r.id===7));
    p.avoid={};p.routeCeiling=62;rows=routes(s,p,metrics,1000);assert.ok(!rows.some(r=>r.id===7));
});

test('one measured cycle is blended with the battle model rather than being treated as certain',()=>{
    const {s,p}=fixture(),row=H.candidates(s,H.DEFAULTS,true).find(r=>r.id===7),key=H.metricsKey(s,row,H.DEFAULTS);
    const metrics={[key]:{xp:2000000,xpSeconds:100,xpRuns:1,runs:1,net:1,seconds:100}},estimated=routes(s,p).find(r=>r.id===7).rate;
    const mixed=routes(s,p,metrics).find(r=>r.id===7);
    assert.equal(mixed.rate,(1200000+estimated)/2);
});

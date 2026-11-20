const test=require('node:test'),assert=require('node:assert/strict'),H=require('../Pokecatch自动助手.user.js');
const levels=[92,90,93,83,83,74],species=[289,282,257,319,310,365];
function fixture(){
    const mons=species.map((id,i)=>({uid:'m'+i,id,level:levels[i],reg:'hoenn',xp:0}));
    const s={mons,team:mons.map(mon=>mon.uid),road:mons.map(mon=>mon.uid),travel:{to:['johto','hoenn']},link:{to:'hoenn',side:'to'},
        adv:{chapter:42,unlocked:46,node:0,runs:0,loops:[42],speed:4,deaths:{},badges:[]}};
    const settings={...H.DEFAULTS,mode:'train',region:'current',trainUid:'team',trainLevel:95};
    const chapters=H.DATA.chapters.filter(c=>c.loop==='L:hoenn'),league={...chapters[0],key:'L:hoenn',members:chapters.map(c=>c.id),
        reward:chapters.reduce((sum,c)=>sum+c.reward,0),units:chapters.reduce((sum,c)=>sum+c.units,0)};
    return{s,settings,league};
}

test('the screenshot party can compare a slower but more rewarding opened league against Victory Road',()=>{
    const {s,settings}=fixture(),rows=H.xpRanking(s,settings),league=rows.find(row=>row.key==='L:hoenn'),road=rows.find(row=>row.id===42);
    assert.ok(league,'an opened league must reach the XP comparison');assert.ok(league.battleFit.turns>3,'the old three-turn shortcut is deliberately exceeded');
    assert.ok(league.rate>road.rate,'slower battles may still yield more XP per minute');assert.equal(rows[0].key,'L:hoenn');
});

test('cached league assessments cannot hide a missing active party member',()=>{
    const {s,settings,league}=fixture(),at=Date.UTC(2026,10,20,12);
    s.team.pop();
    const original=H.leagueTrainingModel(s,settings,league,undefined,at);
    s.team.push('no-longer-owned');
    const stale=H.leagueTrainingModel(s,settings,league,undefined,at);
    assert.equal(stale.allowed,false);assert.match(stale.blockReason,/盒子/);
    s.team.pop();
    assert.deepEqual(H.leagueTrainingModel(s,settings,league,undefined,at),original);
});
test('unmeasured league XP accounts for its battle risk instead of treating a complete clear as certain',()=>{
    const {s,settings,league}=fixture(),ranked=H.xpRanking(s,settings).find(row=>row.key==='L:hoenn');assert.ok(ranked);
    const experience=league.members.reduce((sum,id)=>sum+H.DATA.chapters[id].xpEstimate,0)*s.team.length;
    const optimistic=experience/Math.max(20,league.units*2.8/2.5)*60*ranked.battleFit.factor;
    assert.ok(ranked.rate<optimistic,'a risky full-league estimate requires a completion/recovery discount');assert.ok(ranked.rate>0);
});

test('high levels do not make a poorly covered party eligible for unmeasured league training',()=>{
    const {s,settings}=fixture();s.mons=[{uid:'weak',id:129,level:95,reg:'hoenn'}];s.team=['weak'];s.road=['weak'];
    assert.ok(!H.xpRanking(s,settings).some(row=>row.key==='L:hoenn'));
});

test('a powerhouse left in the PC cannot unlock league safety for a weak active trainee',()=>{
    const {s,settings}=fixture();s.mons=[{uid:'weak',id:129,level:5,reg:'hoenn'},{uid:'pc',id:150,level:100,reg:'hoenn'}];s.team=['weak'];s.road=['weak'];
    const rows=H.xpRanking(s,settings);assert.ok(!rows.some(row=>row.key==='L:hoenn'));assert.equal(rows[0].id,31);
});

test('a tiny encounter weight cannot hide a league matchup that wipes the whole active party',t=>{
    const {s,settings}=fixture();for(const mon of s.mons)mon.level=30;
    const chapters=H.DATA.chapters.filter(c=>c.loop==='L:hoenn'),old=chapters.map(c=>c.foes);
    t.after(()=>{chapters.forEach((c,i)=>{c.foes=old[i];});H.clearTeamCache();});
    for(const chapter of chapters)chapter.foes=[[10,1,1000000],[150,100,.00001]];
    H.clearTeamCache();
    const route={reg:'hoenn',members:chapters.map(c=>c.id)};
    assert.ok(H.battleRouteFit(s,route).turns<2,'mean-only safety would hide the catastrophic matchup');
    assert.ok(!H.xpRanking(s,settings).some(row=>row.key==='L:hoenn'),'even a low-weight team wipe must be considered before a full-loop forecast');
});

test('mature complete-loop measurements retain their real XP rate while league cooldowns still win',()=>{
    const {s,settings,league}=fixture(),now=1000,metrics={[H.metricsKey(s,league,settings,now)]:{xp:3000000,xpSeconds:100,xpRuns:2,runs:2,net:1,seconds:100}};
    const ranked=H.xpRanking(s,settings,metrics,{},now).find(row=>row.key==='L:hoenn');assert.ok(ranked);assert.equal(ranked.rate,1800000);assert.equal(ranked.measured,true);
    assert.ok(!H.xpRanking(s,settings,metrics,{'L:hoenn':2000},now).some(row=>row.key==='L:hoenn'));
});

test('a temporary preparation difficulty ceiling can still exclude the opened league',()=>{
    const {s,settings}=fixture(),p={uids:[...s.team],context:{reg:'hoenn'},routeCeiling:94,avoid:{}};
    assert.ok(!H.preparationRoutes(s,settings,p).some(row=>row.key==='L:hoenn'));
    p.routeCeiling=95;p.avoid['L:hoenn']=2000;assert.ok(!H.preparationRoutes(s,settings,p,{},1000).some(row=>row.key==='L:hoenn'));
});

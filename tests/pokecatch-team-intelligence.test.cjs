const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js'),native=require('./fixtures/pokecatch-team-native.json');
// Native samples from the isolated public build b05c8cc201, not an implementation mirror.
const state=()=>({mons:[{uid:'a',id:65,level:50}],team:['a'],adv:{chapter:3,unlocked:8},travel:{to:[]}});
const context=()=>({force:true,size:1,foes:[{id:68,level:50,weight:1}]});

function iceBadge(empoleonLevel=46){
    const mons=[[398,52],[67,51],[208,52],[308,52],[457,52],[389,52],[395,empoleonLevel]]
        .map(([id,level])=>({uid:String(id),id,level,reg:'sinnoh'}));
    const team=mons.slice(0,6).map(m=>m.uid);
    return {mons,team,road:[...team],adv:{chapter:55,unlocked:55,gifts:{}}};
}
const replayTime=1732000000000;
const progression={...H.DEFAULTS,mode:'progress'};

// Equal-level comparisons use the legal final form at that level. Keep recorded
// live-save regressions separate so unevolved or injured real parties stay covered.
function matureIceBattle(level){
    const s=iceBadge();
    s.mons=[{uid:'grass',id:387,level:1},{uid:'water',id:393,level:1}];
    s.team=['grass','water'];s.road=[...s.team];s.autoSwitch=false;
    s.mons=s.mons.map(mon=>H.projectEvolution(s,mon,level??H.trainingCap(s,mon),replayTime));
    const foe={uid:'ice',id:478,level:s.mons[0].level};
    foe.hp=H.effectiveStats(foe).hp;
    s.adv.battle={kind:'gym',slots:1,allies:['grass'],foes:['ice'],enemies:[foe]};
    return s;
}
const switching={...progression,activeSwitch:true};
for(const level of [52,100]){
    test('equal final forms at Lv.'+level+' prefer Empoleon against Froslass in both planning and live switching',()=>{
        const s=matureIceBattle(level===52?undefined:level),foe=s.adv.battle.enemies[0];
        assert.deepEqual(s.mons.map(m=>[m.id,m.level]),[[389,level],[395,level]]);
        assert.deepEqual(H.planAdventureTeam(s,switching,[],{foes:[{...foe,weight:1}],size:1,force:true,now:replayTime}).uids,['water']);
        assert.equal(H.battleSwitchCandidate(s,switching,replayTime).uid,'water');
        s.mons[1].hp=1;
        assert.equal(H.battleSwitchCandidate(s,switching,replayTime),null);
    });
}
test('native autoswitch, prior manual picks and multi-slot or unsettled battles retain ownership',()=>{
    for(const override of [{autoSwitch:true},{autoSwitch:undefined},{road:['water','grass']}]){
        assert.equal(H.battleSwitchCandidate(Object.assign(matureIceBattle(100),override),switching,replayTime),null);
    }
    for(const override of [{pick:'grass'},{slots:2},{kind:'static'},{foes:['stale']}]){
        const s=matureIceBattle(100);Object.assign(s.adv.battle,override);
        assert.equal(H.battleSwitchCandidate(s,switching,replayTime),null);
    }
    const s=matureIceBattle(100);
    for(const settings of [progression,{...switching,autoTeam:false}]){
        assert.equal(H.battleSwitchCandidate(s,settings,replayTime),null);
    }
    const foe=s.adv.battle.enemies[0];s.adv.battle.enemies.push({...foe,uid:'next'});
    assert.equal(H.battleSwitchCandidate(s,switching,replayTime),null);
    s.adv.battle.enemies.pop();foe.shiny=true;
    assert.equal(H.battleSwitchCandidate(s,switching,replayTime),null);
});

test('ordinary adventure fitting fields Lv46 Empoleon at the Sinnoh Ice Badge and keeps the new party stable',()=>{
    const s=iceBadge(),engine=new H.Engine({getItem:()=>null},progression);
    assert.equal(engine.fitTeam(s,replayTime),true);
    const party=engine.driver.teamTask.uids;
    assert.ok(party.includes('395')&&!party.includes('389'));
    assert.match(engine.logs[0].text,/帝王拿波/);
    assert.match(engine.logs[0].text,/土台龟/);
    s.team=[...party];s.road=[...party];engine.driver.teamTask=null;
    assert.equal(engine.fitTeam(s,replayTime+1000),false);
});

test('gym selection respects training pins and the actual strength of an underlevelled resistance',()=>{
    const s=iceBadge(5);
    assert.ok(!H.planAdventureTeam(s,progression,[],{now:replayTime}).uids.includes('395'));
    const pinned=H.planAdventureTeam(iceBadge(),progression,['389'],{force:true,now:replayTime});
    assert.ok(pinned.uids.includes('389'));
});

test('Sinnoh Ice Badge uses the native four opponents and accounts for off-type coverage',()=>{
    const s=iceBadge();
    const gym=H.chapterCombatFoes(s,H.DATA.chapters[55]).filter(foe=>foe.gymCount);
    assert.deepEqual(gym.map(foe=>[foe.id,foe.level]).sort((a,b)=>a[0]-b[0]),[[215,47],[221,47],[460,50],[478,52]]);
    const froslass=gym.find(foe=>foe.id===478),piloswine=gym.find(foe=>foe.id===221);
    const torterra=s.mons[5],empoleon=s.mons[6];
    const weak=H.matchupDetails(torterra,froslass),resist=H.matchupDetails(empoleon,froslass);
    assert.equal(weak.incoming.type,'ice');assert.equal(resist.incoming.key,'hex');
    assert.ok(resist.incoming.hit/resist.hp<weak.incoming.hit/weak.hp);
    assert.equal(H.matchupDetails(empoleon,piloswine).incoming.type,'ground');
});

test('conditional leaders follow the saved starter and farming uses encounter weights without a mainline gym bonus',()=>{
    const s=iceBadge(),chapter=H.DATA.chapters[66];
    for(const [starter,expected] of [[495,513],[498,515]]){
        s.adv.gifts[chapter.foesByStarter.key]=starter;
        const gym=H.chapterCombatFoes(s,chapter).filter(foe=>foe.gymCount);
        assert.ok(gym.some(foe=>foe.id===expected));
    }
    const foes=H.chapterCombatFoes(s,H.DATA.chapters[55]);
    for(const objective of ['money','train']){
        const options={objective,now:replayTime,foes};
        const plan=H.planAdventureTeam(s,progression,[],options);
        assert.equal(plan.objective,objective);
        assert.doesNotMatch(plan.reason,/提高馆主战续航/);
        assert.ok(Number.isFinite(plan.score)&&Number.isFinite(plan.currentScore));
        assert.equal(new Set(plan.uids).size,plan.uids.length);
    }
});

test('team scoring metadata matches the current native HP and taste rules',()=>{
    assert.equal(H.DATA.combat.hpBoost,native.hpBoost);
    for(const key of ['MAX','CAP','LIN','DIS0'])assert.equal(H.DATA.combat.tastes[key],native.tastes[key]);
});

test('effective battle stats match 32 native species, level, rank, shiny and taste combinations',()=>{
    for(const {mon,stats}of native.samples)assert.deepEqual(H.effectiveStats(mon),stats,JSON.stringify(mon));
});

test('taste modifies the five non-HP stats while retaining the native boosted HP',()=>{
    const plain={id:6,level:100},modified={...plain,taste:{h:'def',up:{atk:25},n:25}};
    const a=H.effectiveStats(plain),b=H.effectiveStats(modified);
    assert.equal(a.hp,b.hp);assert.ok(b.atk>a.atk);assert.ok(b.def<a.def);assert.equal(a.spa,b.spa);
});

test('changing a team member taste invalidates the roster and matchup cache',()=>{
    const s=state(),c=context();H.clearTeamCache();
    const before=H.planAdventureTeam(s,H.DEFAULTS,[],c),fingerprint=H.rosterFingerprint(s),misses=H.teamCacheStats().misses;
    H.planAdventureTeam(s,H.DEFAULTS,[],c);assert.equal(H.teamCacheStats().misses,misses);
    s.mons[0].taste={h:'atk',up:{spa:25},n:25};
    const after=H.planAdventureTeam(s,H.DEFAULTS,[],c);
    assert.notEqual(H.rosterFingerprint(s),fingerprint);assert.ok(H.teamCacheStats().misses>misses);assert.ok(after.score>before.score);
});

test('taste bookkeeping that leaves stats unchanged does not trigger redundant team reevaluation',()=>{
    const s=state(),c=context();s.mons[0].taste={h:'atk',up:{spa:25},n:25,sw:{}};H.clearTeamCache();
    const plan=H.planAdventureTeam(s,H.DEFAULTS,[],c),fingerprint=H.rosterFingerprint(s),misses=H.teamCacheStats().misses;
    s.mons[0].taste.n=26;s.mons[0].taste.sw={spa:{i:1,n:2,e0:.2}};
    const again=H.planAdventureTeam(s,H.DEFAULTS,[],c);
    assert.equal(H.rosterFingerprint(s),fingerprint);assert.equal(H.teamCacheStats().misses,misses);assert.equal(again.score,plan.score);
});

test('opponent taste changes do not reuse a stale matchup row',()=>{
    const s=state(),c=context();H.clearTeamCache();const before=H.planAdventureTeam(s,H.DEFAULTS,[],c),misses=H.teamCacheStats().misses;
    c.foes[0].taste={h:'spd',up:{atk:25}};
    const after=H.planAdventureTeam(s,H.DEFAULTS,[],c);
    assert.ok(H.teamCacheStats().misses>misses);assert.notEqual(after.score,before.score);
});

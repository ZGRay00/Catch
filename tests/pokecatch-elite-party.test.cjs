const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const regions=['kanto','johto','hoenn','sinnoh','unova'];
const noon=new Date(2026,10,22,12).getTime(),night=new Date(2026,10,22,22).getTime();
const save=()=>({team:[],road:[],dex:{},adv:{chapter:35,unlocked:83},mons:[]});

test('league objectives use only regional bosses and keep the lineup rolled at entry across dusk',()=>{
    const s=save();
    for(const reg of regions){
        const rooms=H.DATA.chapters.filter(c=>c.league&&c.reg===reg);
        const ctx=H.battleContext(s,'elite',{reg,tier:4,now:noon});
        assert.deepEqual(ctx.foes.map(f=>f.id),rooms.flatMap(c=>c.gymFoes.map(([id])=>id)));
        assert.deepEqual([...new Set(ctx.foes.map(f=>f.chapter))],rooms.map(c=>c.id));
        assert.ok(ctx.foes.every(f=>f.rank===4&&f.level===100&&f.gymCount===1));
    }
    const unova=now=>H.battleContext(s,'elite',{reg:'unova',tier:3,now});
    assert.ok(unova(night).foes.some(f=>f.chapter===81&&f.id===644));
    const day=unova(noon);
    s.adv.league={reg:'unova',tier:3};
    s.adv.nodes=[{ch:81,type:'gym',team:day.foes.filter(f=>f.chapter===81).map(f=>[f.id,100])}];
    assert.deepEqual(unova(night),day);
});

test('one owned box produces region-specific legal elite parties, including native link and species limits',()=>{
    const s=save(),ids=[150,6,9,3,143,68,248,94,130,376,212,445,461,609,635,534,479,150];
    s.mons=ids.map((id,i)=>({uid:'m'+i,id,level:100,reg:i<9?'unova':'kanto',shiny:i===17}));
    const settings={...H.DEFAULTS,mode:'elite',activeSwitch:false};
    function plan(reg){
        const ctx=H.battleContext(s,'elite',{reg,tier:3,now:noon});
        const chosen=H.planAdventureTeam(s,settings,[],{...ctx,now:noon,objective:'progress'}).uids;
        const mons=chosen.map(uid=>s.mons.find(m=>m.uid===uid));
        assert.equal(mons.length,6);assert.equal(new Set(mons.map(m=>m.id)).size,6);
        assert.ok(mons.every(m=>H.teamEligible(s,m,reg)));
        return chosen;
    }
    const results=regions.map(reg=>plan(reg).sort().join(','));
    assert.ok(new Set(results).size>1);
    s.link={from:'sinnoh',to:'unova',side:'to'};
    assert.ok(plan('kanto').every(uid=>s.mons.find(m=>m.uid===uid).reg!=='unova'));
    assert.ok(plan('unova').every(uid=>s.mons.find(m=>m.uid===uid).reg==='unova'));
});

test('all elite room profiles and regional entry parties match the native battle generator',t=>{
    if(!process.env.POKECATCH_NATIVE_APP)return t.skip('Optional native game bundle unavailable');
    const native=require('../tools/pokecatch-native-vm.cjs')(process.env.POKECATCH_NATIVE_APP);
    // Isolate account unlocks and the clock. Native entry, healing, enemy generation and combat use their regular paths.
    native.run("const N=__pcResearch,G=N.Game,A=N.Adventure;G.load();G.stopSaving();A.ensure();N.LegendZones.leagueOpen=()=>true;const base=structuredClone(G.S)");
    for(const reg of regions)for(const tier of [1,5])for(const phase of reg==='unova'?['day','night']:['day']){
        const {dedicated,foes}=JSON.parse(native.run(`G.sandbox(structuredClone(base),()=>{
            const reg=${JSON.stringify(reg)},tier=${tier},s=G.S,a=G.makeMon(25,100),b=G.makeMon(143,100);
            s.mons=[a,b];s.team=[a.uid];s.road=[a.uid];s.eventTeams['league:'+reg]=[b.uid];s.eliteLeague={[reg]:{t:tier-1}};
            N.DAYTIME.phase=()=>({key:${JSON.stringify(phase)}});
            if(!A.startLeague(reg,tier))throw Error('Entry rejected');
            const foes=[];
            for(const [index,room] of s.adv.nodes.entries())if(room.type==='gym'){
                s.adv.node=index;s.adv.battle=null;A.step();
                for(const m of s.adv.battle.enemies)foes.push([room.ch,m.id,m.level,m.rank,m.hpMult,N.CONFIG.GYM_DAMAGE*room.gym.power]);
            }
            return JSON.stringify({dedicated:s.adv.league.team[0]===b.uid,foes});
        })`));
        const ctx=H.battleContext(save(),'elite',{reg,tier,now:phase==='night'?night:noon});
        assert.equal(dedicated,true);
        assert.deepEqual(ctx.foes.map(f=>[f.chapter,f.id,f.level,f.rank,f.hpMult,f.damageMult]),foes,`${reg}/${tier}/${phase}`);
    }
});

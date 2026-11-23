'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const H=require('../../Pokecatch自动助手.user.js');

const now=Date.parse('2026-11-23T12:00:00Z');
const route=H.DATA.chapters.find(chapter=>chapter.id===75);
const next=H.DATA.chapters.find(chapter=>chapter.id===76);
const stored=()=>({adv:{chapter:route.id,unlocked:83,node:2,nodes:[],badges:['Maître Unys']},roam:{at:{},caught:[]}});

test('ordinary route shares the threat across map marker, queued node and boss fight',()=>{
    const s=stored();
    s.roam.at[641]={ch:route.id,until:now+900000};
    const [foe]=H.routeRoamingFoes(s,route,now);
    assert.deepEqual(foe,{id:641,chapter:route.id,level:100,weight:1,wildWeight:1,roaming:true,hpMult:18,damageMult:.51,rageMax:8});
    assert.equal(H.routeCombatFoes(s,route,now).filter(entry=>entry.roaming).length,1);
    assert.deepEqual(H.routeRoamingFoes(s,next,now),[]);
    s.adv.nodes[3]={type:'wild',roamer:641};
    s.roam.at[641].ch=next.id;
    assert.deepEqual(H.routeRoamingFoes(s,route,now),[foe]);
    assert.equal(H.routeRoamingFoes(s,next,now)[0].id,641);
    s.adv.battle={roam:641};s.adv.node=4;
    assert.deepEqual(H.routeRoamingFoes(s,route,now),[foe]);
    delete s.adv.battle;
    assert.deepEqual(H.routeRoamingFoes(s,route,now),[]);
    assert.deepEqual(H.routeRoamingFoes(s,next,now+900000),[]);
    s.roam.caught.push(641);
    assert.deepEqual(H.routeRoamingFoes(s,next,now),[]);
});

test('money team compares complete legal reserves against a roaming group fight',()=>{
    // Synthetic Lv.100 test box with a weak incumbent and a stronger bench.
    const weak=[13,10,265,165,167,11],bench=[145,473,462,395,248,376,534,448,483,642];
    const mons=[...weak,...bench].map(id=>({id,uid:String(id),level:100,reg:'unova'}));
    const s={...stored(),mons,team:weak.map(String),dex:{}};
    s.roam.at[641]={ch:route.id,until:now+900000};
    const foe=H.roamingCombatFoe(641,route.id);
    const group=team=>team.map(mon=>H.matchupDetails(mon,foe));
    assert.equal(H.roamingBattle(group(mons.slice(0,6)),foe).deaths,6);
    const settings={...H.DEFAULTS,mode:'money'};
    for(const autoSwitch of [true,false]){
        const plan=H.planAdventureTeam({...s,autoSwitch},settings,[],{row:route,objective:'money',verifyAll:true,now});
        assert.equal(plan.changed,true);
        assert.equal(plan.uids.length,6);
        assert.equal(plan.verification.safety.wipeWeight,0);
        const selected=group(plan.uids.map(uid=>mons.find(mon=>mon.uid===uid)));
        const fought=H.roamingBattle(selected,foe);
        assert.equal(fought.coverage,1);
        assert.ok(fought.deaths<6);
        assert.deepEqual(H.roamingBattle([...selected].reverse(),foe),fought);
    }
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const useFixturePassword=require('../../tests/fixtures/pokecatch-boss-test-password.cjs');
const bundle=require('node:fs').readFileSync(require.resolve('../dist/pokecatch-helper.user.js'),'utf8');
const fixtureModule={exports:{}};
require('node:vm').compileFunction(useFixturePassword(bundle),['module'])(fixtureModule);
const {BossMoves,bossMoveBattle,bossMoveChanges,bossAttackChoice,DATA}=fixtureModule.exports;
const boss=(extra={})=>({uid:'boss',id:150,hp:100,...extra});
const fight=()=>({layout:DATA.layout,zone:{id:150},battle:{kind:'static',zone:150,enemies:[boss()],foes:['boss'],allies:['lamp']}});
const moves=['shadow-ball','inferno','overheat','ember','smog','incinerate','hex','astonish'];
test('only deployed legend and elite targets participate',()=>{
    const a=fight();
    assert.deepEqual(bossMoveBattle(a).allies,['lamp']);
    a.zone.elite=3;assert.ok(bossMoveBattle(a));
    for(const patch of [{zone:null},{event:{raid:true}},{tower:{}},{battle:{...a.battle,zone:123}},{battle:{...a.battle,kind:'wild'}},{battle:{...a.battle,foes:[]}}])assert.equal(bossMoveBattle({...a,...patch}),null);
    const league={league:{reg:'kanto',tier:2},battle:{...a.battle,kind:'trainer',zone:null}};
    assert.ok(bossMoveBattle(league));assert.equal(bossMoveBattle({...league,league:null}),null);
});
test('Chandelure uses Inferno, Overheat, then Inferno as burn expires',()=>{
    assert.deepEqual([null,'burn',null].map(status=>bossAttackChoice(moves,[boss({status})])),['inferno','overheat','inferno']);
    assert.equal(bossAttackChoice(moves,[boss({confused:2})]),'overheat');
    assert.equal(bossAttackChoice(['inferno','overheat'],[boss({id:6})]),'overheat');
    assert.equal(bossAttackChoice(['thunderbolt','thunder','tackle'],[boss({id:27})]),'tackle');
    assert.equal(bossAttackChoice(['relic-song','tackle'],[boss({lockCd:3})]),'tackle');
    assert.equal(bossAttackChoice(moves,[boss({status:'burn'}),boss()]),null);
    assert.equal(bossAttackChoice(moves,[boss(),boss()]),'inferno');
    assert.equal(bossAttackChoice(['tackle'],[boss()]),'tackle');
    assert.deepEqual(bossMoveChanges([{key:'inferno',banned:true},{key:'ember',banned:true},{key:'overheat',banned:false}],['inferno'],'inferno'),
        [{key:'inferno',ban:false},{key:'overheat',ban:true}]);
});
function fixture(){
    const store=new Map(),s={trainer:{id:'owner'},adv:fight(),mons:[{uid:'lamp',id:609,level:100,ban:['hex']}]};
    const e={account:'owner',mayPersist:()=>true,read:()=>s,storage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}};
    let writes=0,open=true;
    const dialog=(mon,fn)=>open&&fn(moves.map(key=>({key,banned:mon.ban.includes(key)})),(key,ban)=>{
        assert.ok(!ban||JSON.parse(e.storage.getItem('pokecatch-helper:v1:boss-moves:undo:owner')).some(x=>x.keys.includes(key)),'journal persisted before disabling');
        mon.ban=ban?[...mon.ban,key]:mon.ban.filter(k=>k!==key);writes++;return true;
    });
    let service=new BossMoves(e,dialog),clock=10000;
    return {s,e,store,get service(){return service;},reload(){service=new BossMoves(e,dialog);},get writes(){return writes;},
        available(v){open=v;},async step(n=1){while(n-->0)await service.tick(clock+=500);},allowed(){return moves.filter(k=>!s.mons[0].ban.includes(k));}};
}
test('account preference, minimal switches and exact restore after interruption and reload',async()=>{
    const f=fixture(),a=f.s.adv;
    await f.step();assert.equal(f.writes,0);assert.equal(f.service.enabled(),false);
    await f.service.enable(true,'offline-fixture-pass');await f.step(8);assert.deepEqual(f.allowed(),['inferno']);
    const before=f.writes;await f.step(10);assert.equal(f.writes,before);
    a.battle.enemies[0].status='burn';await f.step(5);assert.deepEqual(f.allowed(),['overheat']);assert.equal(f.writes,before+2);
    f.reload();await f.step(4);assert.equal(f.writes,before+2);
    delete a.battle.enemies[0].status;await f.step(5);assert.deepEqual(f.allowed(),['inferno']);
    f.available(false);f.s.adv.battle=null;await f.step(3);f.reload();
    await f.step();f.available(true);await f.step(10);assert.deepEqual(f.s.mons[0].ban,['hex']);
    assert.equal(f.e.storage.getItem('pokecatch-helper:v1:boss-moves:undo:owner'),null);
});
test('switch off halfway through setup and recover only local changes in the owning tab',async()=>{
    const f=fixture();await f.service.enable(true,'offline-fixture-pass');await f.step();const n=f.writes;
    assert.ok(n>0&&n<=4);f.s.mons[0].ban.push('astonish');
    await f.service.enable(false);f.e.mayPersist=()=>false;await f.step(5);assert.equal(f.writes,n);
    f.e.mayPersist=()=>true;f.reload();await f.step(12);
    assert.deepEqual(f.s.mons[0].ban.sort(),['astonish','hex']);assert.equal(f.service.enabled(),false);
});
test('legacy opt-in restores outstanding bans and each new activation requires the exact password',async()=>{
    const f=fixture(),key=f.service.key('on');
    f.store.set(key,'1');f.store.set(f.service.key('undo'),JSON.stringify([{uid:'lamp',keys:['ember']}]));
    f.s.mons[0].ban.push('ember');await f.step(3);
    assert.equal(f.service.enabled(),false);assert.deepEqual(f.s.mons[0].ban,['hex']);
    for(const password of [undefined,'','Offline-fixture-pass','offline-fixture-pass ']){
        assert.equal(await f.service.enable(true,password),false);assert.equal(f.service.enabled(),false);
    }
    const controller=new AbortController(),pending=f.service.enable(true,'offline-fixture-pass',controller.signal);
    controller.abort();assert.equal(await pending,false);
    const switched=f.service.enable(true,'offline-fixture-pass');f.e.account='other';assert.equal(await switched,false);
    f.e.account='owner';assert.ok(await f.service.enable(true,'offline-fixture-pass'));f.reload();assert.ok(f.service.enabled());
    assert.ok(await f.service.enable(false));assert.equal(await f.service.enable(true),false);
});

const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const UID='mifz9abc123456',AT=parseInt(UID.slice(0,8),36);
function fixture(){return {v:2,fmt:2,trainer:{id:'wire-test'},money:5000,team:[UID],eventTeams:{'raid:kanto':[UID]},
    mz:{m:[[UID,6,40,123,0,0,321,{shiny:true,rank:2,taste:{atk:3},hp:88}],['other',650,15]],r:['kanto','unova'],w:['Pallet Town'],dx:1,s:[650],o:[1,0,'external']},
    dex:{6:[3,AT,3,1,1],650:[0,null,2,0,0],132:{caught:1,custom:true}},
    pension:{mons:[{mon:{uid:'parent',id:132,level:25}}],eggs:[{uid:'egg',id:1,hatchAt:AT}]},
    under:{slots:[{id:'trip',mons:[{uid:'under-mon',id:9,level:50}]}]},link:{from:'kanto',to:'unova',side:'to',stash:{money:200,team:[UID]}},
    adv:{layout:6,chapter:0,unlocked:0,node:0,runs:0,speed:4,badges:[]},stats:{itemIn:{'exp-candy-m':4}}};}

test('legacy JSON saves are still accepted without mutating their members',()=>{
    const s={mons:[{uid:'a',id:6,level:40}],dex:{6:{caught:1}},adv:{layout:6}};
    assert.equal(H.decodeSave(s),s);assert.deepEqual(H.decodeSave(s).mons,s.mons);
});

test('FMT 2 PC tuples retain UID, stats, rank, taste, shiny and relative capture timestamp',()=>{
    const state=H.decodeSave(fixture());
    assert.deepEqual(state.mons[0],{uid:UID,id:6,level:40,xp:123,reg:'kanto',where:'Pallet Town',caughtAt:AT+321,shiny:true,rank:2,taste:{atk:3},hp:88});
    assert.deepEqual(state.mons[1],{uid:'other',id:650,level:15,shiny:false});assert.equal(state.fmt,undefined);assert.equal(state.mz,undefined);
});

test('compressed dex restores capture history, regional bit masks and false or zero flags',()=>{
    const state=H.decodeSave(fixture());
    assert.deepEqual(state.dex[6],{caught:3,firstAt:AT,regs:{kanto:1,unova:1},shiny:1,n:1});
    assert.deepEqual(state.dex[650],{caught:0,regs:{unova:1},shiny:0,n:0});assert.deepEqual(state.dex[132],{caught:1,custom:true});
    assert.deepEqual(state.seen,{6:true,132:true,650:true});assert.deepEqual(state.pcOrder,['other',UID,'external']);
});

test('nested residents, expedition parties, linked wallet and configured teams are preserved',()=>{
    const input=fixture(),state=H.decodeSave(input);
    for(const key of ['pension','under','link','team','eventTeams','stats','adv','trainer'])assert.deepEqual(state[key],input[key]);
    assert.equal(H.captured(state,132),true);assert.equal(H.captured(state,9),true);assert.equal(H.captured(state,6),true);
});

test('decoding leaves the packed input unchanged and handles empty dictionaries and object members',()=>{
    const input=fixture(),before=JSON.stringify(input);H.decodeSave(input);assert.equal(JSON.stringify(input),before);
    const member={uid:'kept',id:25,level:10,shiny:false};
    const result=H.decodeSave({fmt:2,mz:{m:[member,[]],dx:1},dex:{}});
    assert.deepEqual(result.mons,[member,{shiny:false}]);assert.deepEqual(result.dex,{});
});

test('timestamp decoding rejects invalid UID stamps and unsafe offsets as native unpack does',()=>{
    const result=H.decodeSave({fmt:2,mz:{m:[['invalid',6,1,null,null,null,3],[UID,6,1,null,null,null,1e15],[UID,6,1,null,null,null,0]],r:[],w:[]},dex:{}});
    assert.equal(result.mons[0].caughtAt,undefined);assert.equal(result.mons[1].caughtAt,undefined);assert.equal(result.mons[2].caughtAt,AT);
});

test('unsupported wire versions and malformed compact structures fail before automation',()=>{
    for(const input of [{fmt:3,mons:[],dex:{}},{fmt:2,mz:null},{fmt:2,mz:{m:{}}},{fmt:2,mz:{m:[],r:'bad'}}])assert.throws(()=>H.decodeSave(input),/存档/);
});

test('Engine.read supports packed saves, caches a private view and never writes the game save',()=>{
    let raw=JSON.stringify(fixture()),writes=0;const storage={getItem:key=>key==='gachamon-save-v1'?raw:null,setItem:()=>writes++,removeItem:()=>writes++};
    const engine=new H.Engine(storage),first=engine.read();assert.equal(first.mons[0].uid,UID);assert.equal(engine.read(),first);assert.equal(writes,0);
    const changed=fixture();changed.mz.m[0][2]=41;raw=JSON.stringify(changed);const second=engine.read();assert.notEqual(second,first);assert.equal(second.mons[0].level,41);assert.equal(first.mons[0].level,40);assert.equal(writes,0);
});

test('invalid compact updates do not replace the last valid cached state',()=>{
    let raw=JSON.stringify(fixture());const engine=new H.Engine({getItem:()=>raw});const first=engine.read();
    raw=JSON.stringify({fmt:2,mz:{m:null}});assert.throws(()=>engine.read(),/存档/);assert.equal(engine.state,first);
});

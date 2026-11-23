'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const H=require('../../Pokecatch自动助手.user.js');

test('box export preserves combat details and team order using local aliases',()=>{
    const s={
        trainer:{id:'private-trainer',name:'private-name',token:'private-credential'},money:123456,
        mons:[
            {uid:'game-uid-one',id:534,level:100,xp:42,rank:2,shiny:1,fav:1,reg:'unova',
                taste:{h:'atk',up:{def:20,spd:4}},ban:['close-combat','close-combat','private-token'],privateField:'omit-me'},
            {uid:'game-uid-two',id:289,level:94,reg:'hoenn'},
            {uid:'game-uid-three',id:13,level:75,reg:'unova'},
        ],
        team:['game-uid-one','game-uid-three'],road:['game-uid-three','game-uid-one'],
        buddy:{uid:'game-uid-three',token:'private-buddy-token'},autoSwitch:false,
        link:{from:'hoenn',to:'unova',side:'to',stash:{team:['game-uid-two','missing-uid'],money:76543}},
        adv:{chapter:83,unlocked:83,speed:4,badges:['Maître']},travel:{to:['hoenn','unova']},
    };
    const initial=JSON.stringify(s),cfg={mode:'money',region:'all',activeSwitch:true,autoTeam:true};
    const at=Date.parse('2026-11-23T12:00:00+08:00');
    const file=JSON.stringify(H.boxSnapshot(s,cfg,at,'6d1e2d8d8d')),box=JSON.parse(file);
    assert.equal(JSON.stringify(s),initial);
    assert.equal(box.format,'pokecatch-box');assert.equal(box.schema,1);assert.equal(box.helperVersion,H.VERSION);
    assert.equal(box.gameBuild,'6d1e2d8d8d');assert.equal(box.exportedAt,'2026-11-23T04:00:00.000Z');
    assert.equal(box.progress.chapter.id,83);assert.equal(box.progress.chapter.name,'巨人洞窟');
    assert.deepEqual(box.team,['box-1','box-3']);assert.deepEqual(box.activeTeam,['box-3','box-1']);
    assert.deepEqual(box.rosterLink,{from:'hoenn',to:'unova',side:'to',storedTeam:['box-2']});assert.equal(box.buddy,'box-3');
    assert.equal(box.rules.nativeAutoSwitch,false);assert.equal(box.rules.activeSwitch,true);assert.equal(box.rules.mode,'money');
    assert.deepEqual(box.members[0],{uid:'box-1',id:534,name:'修建老匠',types:['fighting'],reg:'unova',level:100,xp:42,rank:2,shiny:true,favorite:true,
        taste:{h:'atk',up:{def:20,spd:4}},bannedMoves:['close-combat'],levelCap:100});
    assert.doesNotMatch(file,/private-|game-uid|missing-uid|omit-me|123456|76543/);
});

test('box export accepts packed saves and empty boxes and rejects missing game data',()=>{
    const s=H.decodeSave({fmt:2,mz:{r:['sinnoh'],m:[['native-uid',395,46,5,0,null,null,{ban:['surf']}]]},
        team:['native-uid'],dex:{},adv:{chapter:55,unlocked:55}});
    const box=H.boxSnapshot(s);
    assert.equal(box.members[0].name,'帝王拿波');assert.equal(box.members[0].reg,'sinnoh');
    assert.deepEqual(box.members[0].bannedMoves,['surf']);assert.deepEqual(box.activeTeam,['box-1']);
    assert.deepEqual(H.boxSnapshot({mons:[],adv:{chapter:0,unlocked:0}}).members,[]);
    assert.throws(()=>H.boxSnapshot(null),/进入游戏/);
});

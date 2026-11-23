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

test('box export identifies both dispatched and returned-but-unclaimed teams via temporary aliases',()=>{
    const now=Date.parse('2026-11-23T12:00:00+08:00');
    const member=(uid,id,props={})=>({uid,id,level:100,reg:'sinnoh',...props});
    const active=[member('secret-in-flight-one',483,{rank:2,ban:['dragon-claw']}),member('secret-in-flight-two',484),member('secret-in-flight-three',48701)];
    const returned=[member('secret-returned-one',464),member('secret-returned-two',248),member('secret-returned-three',130)];
    const s={mons:[member('secret-main',395),member('secret-used-in-box',445)],team:['secret-main'],adv:{chapter:65,unlocked:65},
        under:{day:H.parisDay(now),best:129,extra:1,sent:5,next:['volcanic','private-theme'],used:{'secret-used-in-box':1,[active[0].uid]:1,[returned[0].uid]:1,'secret-other-day':1},slots:[
            {id:'secret-return-id',bay:1,from:50,theme:'crystal',end:now-1000,team:returned.map(mon=>mon.uid),mons:returned,res:{coins:7654321},
                start:9876543210987},
            {id:'secret-active-id',bay:0,from:100,theme:'flooded',end:now+123456,team:active.map(mon=>mon.uid),mons:active},
        ]}};
    const original=JSON.stringify(s),file=JSON.stringify(H.boxSnapshot(s,{underGoal:'money',underAutoStart:false,underFrom:75},now)),box=JSON.parse(file);
    assert.equal(JSON.stringify(s),original);
    assert.equal(box.schema,1);
    assert.deepEqual(box.members.map(mon=>[mon.uid,mon.id]),[['box-1',395],['box-2',445]]);
    assert.deepEqual(box.team,['box-1']);
    const {slots,...availability}=box.underground;
    assert.deepEqual(availability,{best:129,capacity:2,sent:5,perDay:9,startFloors:[1,25,50,75,100],nextThemes:['volcanic',null],goal:'money',preferredStartFloor:75,used:['box-2','under-1','under-4']});
    assert.deepEqual(slots.map(({members,...slot})=>slot),[
        {bay:0,theme:'flooded',from:100,state:'active',returnInSeconds:124,team:['under-1','under-2','under-3']},
        {bay:1,theme:'crystal',from:50,state:'ready',returnInSeconds:0,team:['under-4','under-5','under-6']},
    ]);
    assert.deepEqual(slots.flatMap(slot=>slot.members.map(mon=>[mon.uid,mon.id])),[['under-1',483],['under-2',484],['under-3',48701],['under-4',464],['under-5',248],['under-6',130]]);
    assert.equal(slots[0].members[0].rank,2);
    assert.deepEqual(slots[0].members[0].bannedMoves,['dragon-claw']);
    assert.doesNotMatch(file,/secret-|private-theme|7654321|9876543210987/);
    const afterMidnight=H.boxSnapshot(s,{},now+86400000).underground;
    assert.equal(afterMidnight.sent,0);assert.deepEqual(afterMidnight.used,[]);
    assert.ok(afterMidnight.slots.every(slot=>slot.state==='ready'));
});

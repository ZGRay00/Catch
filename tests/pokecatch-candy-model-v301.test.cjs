const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js'),native=require('./fixtures/pokecatch-candy-native-v301.json');
const state=(unlocked=48)=>({mons:[],team:[],road:[],dex:{},travel:{to:['johto','hoenn']},eventTeams:{candy:[]},stats:{},
    adv:{chapter:39,unlocked,badges:[],node:0,runs:0,battle:null}});
const settings=()=>({...H.DEFAULTS,mode:'candy',candyFloor:50});

test('candy theme pools equal all 90 native completed-dex snapshots',()=>{
    const stages=[[14,151],[30,251],[48,386],[65,493],[83,649]];
    for(const[unlocked,cap]of stages)for(const[type,ids]of Object.entries(native.pools[cap])){
        const context=H.candyContext(state(unlocked),type,50);
        assert.equal(context.maxDex,cap,`${unlocked}/${type}`);
        assert.deepEqual(context.foes.map(mon=>mon.id),ids,`${unlocked}/${type}`);
        assert.equal(context.size,native.config.TEAM);
    }
});

test('candy context uses completed leagues rather than visited or currently open regions',()=>{
    const s=state(47);s.travel.to=['johto','hoenn','sinnoh','unova'];
    assert.equal(H.candyContext(s,'dragon').maxDex,251);
    s.adv.badges=['Maître Hoenn'];assert.equal(H.candyContext(s,'dragon').maxDex,386);
});

test('unknown candy theme is not replaced with an assumed daily opponent',()=>{
    assert.equal(H.candyContext(state(),null),null);
    assert.equal(H.candyContext(state(),'unknown'),null);
    assert.equal(H.candyPlan(state(),settings(),null),null);
});

test('target camp uses its last actual battle without inventing a camp fight',()=>{
    const s=state(),fifty=H.candyContext(s,'water',50),sixty=H.candyContext(s,'water',60),next=H.candyContext(s,'water',61);
    assert.equal(fifty.floor,50);assert.equal(fifty.battleFloor,49);assert.equal(fifty.level,97);
    assert.equal(sixty.battleFloor,59);assert.equal(sixty.rank,0);
    assert.equal(next.battleFloor,61);assert.equal(next.rank,1);
    assert.notEqual(sixty.key,next.key);
});

test('actual candy battle levels, ranks and extra stats match the native curve',()=>{
    const s=state();
    for(const row of native.levels){
        const c=H.candyContext(s,'normal',row.floor),battle=native.levels.find(level=>level.floor===c.battleFloor);
        assert.ok(battle,'native extraction contains the last real fight before each camp');
        assert.equal(c.level,battle.level);assert.equal(c.rank,battle.rank);assert.equal(c.statMult,battle.statMult);
        assert.ok(c.foes.every(mon=>mon.level===battle.level&&mon.rank===battle.rank&&mon.statMult===battle.statMult));
    }
});

test('candy snapshots expose current build and the native free start and daily quota',()=>{
    assert.equal(H.CANDY_DATA.build,native.build);
    assert.deepEqual(H.CANDY_DATA.starts,native.config.STARTS);
    assert.equal(H.CANDY_DATA.rareDay,25);
    assert.equal(H.CANDY_DATA.camp,5);
    assert.equal(H.CANDY_DATA.rareAmount,5);
});

test('factory can select old-group PC members while adventure is in a new region',()=>{
    const s=state(65);s.adv.chapter=55;s.link={from:'hoenn',to:'sinnoh',side:'to'};
    s.mons=[{uid:'old',id:6,level:100,reg:'hoenn'},{uid:'new',id:150,level:100,reg:'sinnoh'},
        {uid:'earlier',id:25,level:100,reg:'kanto2'},{uid:'c:foreign',id:493,level:100,reg:'hoenn'}];
    const context=H.candyContext(s,'grass',50),plan=H.candyPlan(s,settings(),'grass');
    assert.equal(context.reg,'hoenn');assert.ok(plan.uids.includes('old'));assert.ok(plan.uids.includes('earlier'));
    assert.ok(!plan.uids.includes('new'));assert.ok(!plan.uids.includes('c:foreign'));
});

test('factory plans only native PC members, not daycare, dispatch or linked stash copies',()=>{
    const s=state();s.mons=[{uid:'pc',id:6,level:100}];
    s.pension={mons:[{mon:{uid:'daycare',id:150,level:100}}]};s.under={slots:[{mons:[{uid:'under',id:493,level:100}]}]};
    s.link={from:'hoenn',to:'sinnoh',side:'from',stash:{mons:[{uid:'stash',id:643,level:100}]}};
    assert.deepEqual(H.candyPlan(s,settings(),'grass').uids,['pc']);
});

test('factory keeps normal and shiny identities separate while honoring native single species',()=>{
    const s=state();s.mons=[{uid:'normal',id:6,level:100},{uid:'shiny',id:6,level:100,shiny:true},
        {uid:'duplicate',id:6,level:100},{uid:'single',id:493,level:100},{uid:'single-shiny',id:493,level:100,shiny:true}];
    const plan=H.candyPlan(s,settings(),'grass'),members=plan.uids.map(uid=>s.mons.find(mon=>mon.uid===uid));
    assert.equal(members.filter(mon=>mon.id===6).length,2);
    assert.equal(members.filter(mon=>mon.id===493).length,1);
});

test('factory plans use actual current levels rather than a future level-100 roster',()=>{
    const s=state();s.mons=[6,9,65,94,143,248].map((id,index)=>({uid:'ready'+index,id,level:100}));
    s.mons.push({uid:'untrained',id:643,level:1});
    const plan=H.candyPlan(s,settings(),'grass');
    assert.equal(plan.uids.length,6);assert.ok(!plan.uids.includes('untrained'));
});

test('temporary PC HP, status and multipliers cannot inflate native candy clone strength',()=>{
    const s=state();s.mons=[{uid:'weak',id:6,level:5},{uid:'ready',id:9,level:100}];
    const clean=H.candyPlan(s,settings(),'water');
    s.mons[0].hpMult=10000;s.mons[0].statMult=10000;s.mons[0].hp=0;s.mons[0].status='poison';
    const dirty=H.candyPlan(s,settings(),'water');
    assert.deepEqual(dirty.uids,clean.uids);assert.equal(dirty.score,clean.score);
});

test('factory model leaves the save and configured team untouched',()=>{
    const s=state();s.mons=[{uid:'a',id:6,level:90,rank:2,taste:{h:'def',up:{atk:5}}},{uid:'b',id:9,level:100,shiny:true}];
    s.eventTeams.candy=['b'];s.team=['a'];s.road=['a'];const before=JSON.stringify(s);
    assert.ok(H.candyPlan(s,settings(),'steel').uids.length>0);
    assert.equal(JSON.stringify(s),before);
});

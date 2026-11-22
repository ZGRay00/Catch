const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js'),native=require('./fixtures/pokecatch-evolution-native-v311.json');
const noon=new Date(2026,10,17,12).getTime();
const mon=(id,level,extra={})=>({uid:'evo-'+id,id,level,xp:0,reg:'sinnoh',shiny:false,...extra});
function state(mons=[],extra={}){return{mons,team:mons.slice(0,6).map(m=>m.uid),dex:{},stats:{},travel:{to:['johto','hoenn','sinnoh','unova']},pension:{mons:[]},under:{slots:[]},
    adv:{chapter:49,unlocked:49,layout:6,badges:[],gifts:{}},...extra};}

test('evolution graph and special prerequisites match the audited native snapshot',()=>{
    const seasonal=Object.fromEntries([1,2,3].map(index=>[58500+index,[{to:58600+index,level:34}]]));
    assert.deepEqual(H.EVOLUTION_DATA.rules,{...native.evolutions,...seasonal});
    assert.deepEqual(H.EVOLUTION_DATA.time,native.time);
});

test('free level rules agree with all 687 native level-boundary golden cases',()=>{
    assert.equal(native.levelCases.length,687);
    for(const row of native.levelCases){
        const m=mon(row.id,row.level),s=state([m]);
        if(row.party){const ally=mon(row.party,40,{uid:'native-party'});s.mons.push(ally);s.team.push(ally.uid);}
        assert.equal(H.levelEvolution(s,m,{now:noon})?.to||null,row.to,row.id+'@'+row.level);
    }
});

test('ready free evolutions preserve the real UID and do not require items',()=>{
    for(const[id,level,to]of [[396,22,397],[63,16,64],[27,22,28],[74,25,75],[92,25,93]]){
        const m=mon(id,level),s=state([m]),before=JSON.stringify(s),rule=H.levelEvolution(s,m,{now:noon});
        assert.equal(rule.to,to);assert.equal(rule.item,undefined);assert.equal(JSON.stringify(s),before);
    }
});

test('projection traverses multiple ready levels but never mutates the source save',()=>{
    const m=mon(10,5,{rank:0,shiny:true,taste:{h:'atk',up:{spa:3}}}),s=state([m]),before=JSON.stringify(s);
    const p=H.projectEvolution(s,m,22,noon);assert.equal(p.id,12);assert.equal(p.level,22);assert.equal(p.uid,m.uid);assert.equal(p.shiny,true);assert.deepEqual(p.taste,m.taste);
    assert.deepEqual(p.evolutionPath.map(step=>[step.from,step.to]),[[10,11],[11,12]]);assert.equal(JSON.stringify(s),before);
});

test('current form and projected form remain distinct until native save confirmation',()=>{
    const m=mon(63,9),s=state([m]),p=H.projectEvolution(s,m,22,noon);assert.equal(m.id,63);assert.equal(m.level,9);assert.equal(p.id,64);assert.equal(p.level,22);
    assert.equal(H.levelEvolution(s,m,{now:noon}),null);assert.match(H.evolutionStatus(s,m,{now:noon}).reason,/Lv\.16/);
});

test('every structural branch remains manual including free-versus-item choices',()=>{
    for(const id of [79,281,290,236,265,412,133]){
        const m=mon(id,100),s=state([m]);assert.equal(H.levelEvolution(s,m,{now:noon}),null,String(id));
        assert.equal(H.projectEvolution(s,m,100,noon).id,id,String(id));assert.match(H.evolutionStatus(s,m,{now:noon}).reason,/分支/);
    }
});

test('owned evolution items do not turn item-only targets into free projections',()=>{
    for(const id of [42,95,299,93,406]){
        const m=mon(id,100),s=state([m],{items:{'soothe-bell':10,'metal-coat':10,'thunder-stone':10,'link-cable':10}});
        assert.equal(H.projectEvolution(s,m,100,noon).id,id);assert.match(H.evolutionStatus(s,m,{now:noon}).reason,/道具/);
    }
});

test('ranked members and activity snapshots cannot gain fictional evolved battle power',()=>{
    for(const extra of [{rank:1},{uid:'t:slot'},{uid:'c:slot'}]){
        const m=mon(396,22,extra),s=state([m]);assert.equal(H.projectEvolution(s,m,100,noon).id,396);
        if(extra.uid)assert.equal(H.projectEvolution(s,m,100,noon).level,22);
    }
});

test('unopened target regions do not appear in a projected training team',()=>{
    const m=mon(190,32,{reg:'johto'}),s=state([m],{travel:{to:['johto']},adv:{chapter:20,unlocked:23,layout:6}});
    assert.equal(H.projectEvolution(s,m,100,noon).id,190);assert.match(H.evolutionStatus(s,m,{now:noon}).reason,/尚未开放/);
    s.travel.to.push('sinnoh');assert.equal(H.projectEvolution(s,m,100,noon).id,424);
});

test('party-dependent level evolutions require that exact species in the real planned party',()=>{
    for(const[id,ally,to]of [[458,223,226],[588,616,589],[616,588,617]]){
        const m=mon(id,22),friend=mon(ally,22),s=state([m,friend]);s.team=[m.uid];
        assert.equal(H.levelEvolution(s,m,{now:noon}),null);assert.match(H.evolutionStatus(s,m,{now:noon}).reason,/特定队友/);
        s.team.push(friend.uid);assert.equal(H.levelEvolution(s,m,{now:noon}).to,to);
    }
});

test('party-dependent evolutions use the applied road party until the next healing point',()=>{
    const m=mon(458,22),friend=mon(223,22),s=state([m,friend]);s.team=[m.uid];s.road=[m.uid,friend.uid];
    assert.equal(H.levelEvolution(s,m,{now:noon}).to,226);
    s.team.push(friend.uid);s.road=[m.uid];assert.equal(H.levelEvolution(s,m,{now:noon}),null);
});

test('same-group same-shiny target copies conservatively defer to native family capacity',()=>{
    const m=mon(396,22),copy=mon(397,22),s=state([m,copy]);assert.equal(H.levelEvolution(s,m,{now:noon}),null);assert.match(H.evolutionStatus(s,m,{now:noon}).reason,/家族容量/);
    copy.shiny=true;assert.equal(H.levelEvolution(s,m,{now:noon}).to,397);
});

test('duplicate target detection includes daycare, expeditions and active trading',()=>{
    const m=mon(396,22),target=mon(397,22);for(const extra of [{pension:{mons:[{mon:target}]}},{under:{slots:[{mons:[target]}]}},{tradeOut:{mon:target}},{tradeIn:{mon:target}},{mktOut:[{mon:target}]}]){
        const s=state([m],extra);assert.equal(H.levelEvolution(s,m,{now:noon}),null);
    }
});

test('copies in the other linked group do not block a legal free evolution',()=>{
    const m=mon(396,22,{reg:'johto'}),target=mon(397,22,{reg:'sinnoh'}),s=state([m,target],{link:{from:'johto',to:'sinnoh',side:'from'}});
    assert.equal(H.levelEvolution(s,m,{now:noon}).to,397);
});

test('mutually dependent party evolutions are not both counted as guaranteed future power',()=>{
    const shell=mon(588,22),bug=mon(616,22),s=state([shell,bug]);
    assert.equal(H.levelEvolution(s,shell,{now:noon}).to,589);assert.equal(H.levelEvolution(s,bug,{now:noon}).to,617);
    const shellFuture=H.projectEvolution(s,shell,100,noon),bugFuture=H.projectEvolution(s,bug,100,noon);
    assert.equal(shellFuture.id,588);assert.equal(bugFuture.id,616);assert.match(shellFuture.evolutionBlockedReason,/队友/);
    shell.id=589;assert.equal(H.levelEvolution(s,bug,{now:noon}),null);
});

test('the screenshot species use actual game evolution thresholds',()=>{
    for(const[id,level,expected]of [[459,21,459],[299,22,299],[453,21,453],[74,22,74],[92,20,92],[63,9,63],[396,22,397]]){
        const m=mon(id,level),s=state([m]);assert.equal(H.projectEvolution(s,m,level,noon).id,expected);
    }
});

test('preparation explains Wingull at 68/72 using its live identity, eligibility and scheduler',()=>{
    const gull=mon(278,68),s=state([gull]),target={uid:gull.uid,id:278,level:50,goal:72};
    const engine={settings:{autoEvolve:true},running:true};
    const label=()=>H.preparationEvolutionLabel(s,target,engine,noon);
    assert.match(label(),/长翅鸥 → 大嘴鸥 68\/72（已满足进化条件/);
    s.adv.battle={};assert.match(label(),/等待当前战斗/);delete s.adv.battle;
    s.mons.push(mon(279,70));assert.match(label(),/家族容量/);s.mons.pop();
    gull.rank=1;assert.match(label(),/已升阶/);delete gull.rank;
    engine.settings.autoEvolve=false;assert.match(label(),/自动进化已关闭/);
    gull.id=279;assert.equal(label(),'大嘴鸥 68/72');
});

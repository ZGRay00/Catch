const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const noon=new Date(2026,10,17,12).getTime(),night=new Date(2026,10,17,22).getTime();
function fixture(){
    const source=H.WEATHER_DATA.chapters[35].nodes[0];
    return{mons:[{uid:'fire',id:6,level:50,reg:'hoenn'},{uid:'water',id:134,level:50,reg:'hoenn'}],team:[],road:[],dex:{},travel:{to:['johto','hoenn']},
        adv:{chapter:35,unlocked:65,node:0,nodes:[{...source,ch:35,type:'wild',weather:null}],gifts:{},badges:[]}};
}
const foe=()=>({id:19,level:50,weight:1,chapter:35,liveNode:true});
const context=at=>({reg:'hoenn',foes:[foe()],size:1,force:true,objective:'money',now:at});

test('production planning changes the selected counter for a verified native rainy encounter',()=>{
    const s=fixture(),clear=H.planAdventureTeam(s,H.DEFAULTS,[],context(noon));
    s.adv.nodes[0].weather='rain';const wet=H.planAdventureTeam(s,H.DEFAULTS,[],context(noon));
    assert.deepEqual(clear.uids,['fire']);assert.deepEqual(wet.uids,['water']);
    const detail=H.combatWeather(s,foe(),{},noon);assert.equal(detail.weather.water,1.1);assert.equal(detail.weather.fire,.9);
});

test('weather changes actual move selection and retains burn/poison and exposed-defense penalties',()=>{
    const s=fixture(),mon={id:6,level:50},target={id:9,level:50},stats=H.effectiveStats(mon),defense=H.effectiveStats(target);
    let changed=false;
    for(const id of [6,9,59,65,94,134,467])for(const foeId of [19,6,9,74,81]){
        const a={id,level:50},b={id:foeId,level:50},at=H.effectiveStats(a),bt=H.effectiveStats(b);
        s.adv.nodes[0].weather=null;const clear=H.expectedDamage(a,b,at,bt,{details:true,...H.combatWeather(s,foe(),{},noon)});
        s.adv.nodes[0].weather='rain';const wet=H.expectedDamage(a,b,at,bt,{details:true,...H.combatWeather(s,foe(),{},noon)});
        if(clear.key!==wet.key)changed=true;
    }assert.ok(changed,'Native weather can change the chosen move, not only its displayed damage');
    const options=H.combatWeather(s,foe(),{},noon),physical={id:106,level:50},victim={id:19,level:50};
    const a=H.effectiveStats(physical),b=H.effectiveStats(victim);
    assert.ok(H.expectedDamage({...physical,status:'burn'},victim,a,b,options)<H.expectedDamage(physical,victim,a,b,options));
    assert.ok(H.expectedDamage(physical,{...victim,status:'sleep'},a,b,options)>H.expectedDamage(physical,victim,a,b,options));
    assert.ok(H.expectedDamage({...mon,status:'poison'},target,stats,defense,options)<=H.expectedDamage(mon,target,stats,defense,options));
});

test('unknown source nodes and aggregate chapter enemies never inherit outdoor weather',()=>{
    const s=fixture();s.adv.nodes[0].weather='rain';
    assert.equal(H.combatWeather(s,{id:19,chapter:35},{},noon).weather.water,1);
    s.adv.nodes[0].name='unverified-node';assert.equal(H.combatWeather(s,foe(),{},noon).weather.water,1);
    assert.equal(H.combatWeather(s,foe(),{},night).weather.ghost,1.1);
    const other=H.combatWeather(s,{...foe(),chapter:6},{},noon);assert.equal(other.weather.water,1,'A target chapter must not borrow the currently displayed node');
});

test('expanded native nodes resolve by identity and kind; indoor nodes retain only night bonuses',()=>{
    const s=fixture(),indoor=H.WEATHER_DATA.chapters[6].nodes.find(node=>node.kind==='route'&&node.indoor);
    s.adv.chapter=6;s.adv.nodes=[{name:indoor.name,bg:indoor.bg,ch:6,type:'wild'}];
    const target={...foe(),chapter:6};assert.ok(H.resolveCombatWeatherNode(s,6,s.adv.nodes[0])?.indoor);
    const day=H.combatWeather(s,target,{},noon),dark=H.combatWeather(s,target,{},night);
    assert.equal(day.weather.water,1);assert.equal(day.weather.fire,1);assert.equal(dark.weather.ghost,1.1);assert.equal(dark.weather.dark,1.1);
    assert.equal(H.resolveCombatWeatherNode(s,35,s.adv.nodes[0]),null);
});

test('an explicit damage override object replaces the entire sky damage table',()=>{
    const s=fixture();s.adv.nodes[0].weather='rain';s.adv.nodes[0].weatherDamage={electric:1.25};
    const weather=H.combatWeather(s,foe(),{},noon).weather;
    assert.equal(weather.electric,1.25);assert.equal(weather.water,1);assert.equal(weather.fire,1);
});

test('team and route caches distinguish weather, hour slots, phases and indoor node identity',()=>{
    H.clearTeamCache();const s=fixture();
    H.planAdventureTeam(s,H.DEFAULTS,[],context(noon));const a=H.teamCacheStats();
    H.planAdventureTeam(s,H.DEFAULTS,[],context(noon+1));const b=H.teamCacheStats();assert.equal(a.misses,b.misses);assert.ok(b.hits>a.hits);
    H.planAdventureTeam(s,H.DEFAULTS,[],context(noon+3600000));const c=H.teamCacheStats();assert.ok(c.misses>b.misses);
    s.adv.nodes[0].weather='rain';H.planAdventureTeam(s,H.DEFAULTS,[],context(noon+3600000));const d=H.teamCacheStats();assert.ok(d.misses>c.misses);
    H.planAdventureTeam(s,H.DEFAULTS,[],context(night));assert.ok(H.teamCacheStats().misses>d.misses);
    s.team=['fire'];s.road=['fire'];const row={...H.DATA.chapters[35],members:[],foes:[{...foe(),hpMult:.8,weatherNode:s.adv.nodes[0]}]};
    const wet=H.battleRouteFit(s,row,s.team,noon);s.adv.nodes[0].weather=null;const clear=H.battleRouteFit(s,row,s.team,noon);
    assert.notEqual(wet.weatherKey,clear.weatherKey);assert.notEqual(wet.turns,clear.turns);
    const later=H.battleRouteFit(s,row,s.team,night);assert.notEqual(later.weatherKey,clear.weatherKey);
});

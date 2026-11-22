const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

const hour=3600000;
function state(){
    return {mons:[],team:[],dex:{},items:{},travel:{to:['unova']},adv:{chapter:67,unlocked:83,node:0,nodes:[],gifts:{},badges:[]}};
}
const autumn=()=>new Date(2026,10,9,12,15).getTime();
const hunt=(mode,weather=[])=>({...H.DEFAULTS,mode,[mode+'Regions']:['unova'],[mode+'Species']:[522],[mode+'Weather']:weather});

test('each season lasts three local dates and changes at local midnight across daylight-saving shifts',t=>{
    const original=process.env.TZ;
    t.after(()=>{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;});
    process.env.TZ='America/New_York';
    const springClock=H.seasonWindow(new Date(2026,2,8,12).getTime());
    const autumnClock=H.seasonWindow(new Date(2026,10,1,12).getTime());
    assert.equal(springClock.endsAt-springClock.startsAt,71*hour);
    assert.equal(autumnClock.endsAt-autumnClock.startsAt,73*hour);
    for(const period of [springClock,autumnClock]){
        assert.equal(new Date(period.startsAt).getHours(),0);
        assert.equal(new Date(period.endsAt).getHours(),0);
        const end=new Date(period.startsAt);end.setDate(end.getDate()+3);
        assert.equal(period.endsAt,end.getTime());
        assert.equal(H.weatherSeason(period.endsAt-1),period.key);
        assert.equal(H.weatherSeason(period.endsAt),period.nextKey);
        assert.equal(H.seasonWindow(period.startsAt-1).endsAt,period.startsAt);
    }
});

test('seasonal restrictions belong to each chapter; native deer appearance sightings stay independent of captures',()=>{
    const s=state(),at=autumn(),wild=id=>H.acquisitionSources(s,id,at).filter(source=>source.kind==='wild');
    const blitzle=wild(522);
    assert.equal(blitzle.length,1);assert.deepEqual(blitzle[0].seasons,['summer']);
    assert.equal(blitzle[0].available,false);assert.match(blitzle[0].detail,/夏季限定/);
    const minccino=wild(572);
    assert.ok(minccino.some(row=>row.chapter===71&&row.seasons.length===4));
    assert.ok(minccino.some(row=>row.chapter===70&&row.seasons.join()==='winter'));
    assert.ok(wild(585).length&&wild(585).every(row=>row.seasons.join()==='spring'&&!row.available));
    s.seasons={585:['summer','summer','invalid']};s.dex[586]={caught:1};
    assert.deepEqual(H.seasonFormProgress(s,585).seen,['summer']);
    assert.deepEqual(H.seasonFormProgress(s,585).missing,['spring','summer','autumn','winter']);
    assert.equal(H.captured(s,585),false);assert.deepEqual(H.seasonFormProgress(s,586).seen,['spring']);
    assert.equal(H.seasonFormProgress(s,522),null);
});

test('seasonal forms have independent caught records, Unova routes and same-form evolution',()=>{
    const s=state(),at=autumn(),id=58501,settings={...H.DEFAULTS,mode:'dex',dexSpecies:[id]};
    s.dex[585]={caught:1};s.seasons={585:['spring','summer']};
    assert.deepEqual(H.dexStatus(s,settings).missing.map(mon=>mon.id),[id]);
    assert.ok(H.dexStatus(s,{...settings,dexSpecies:[]}).ids.has(id));
    assert.equal(H.dexRanking(s,settings,{},at).some(row=>row.targets.some(target=>target.id===id)),false);
    const next=H.nextWildWindow(s,settings,[id],at);
    assert.equal(next.season,'summer');
    assert.ok(H.dexRanking(s,settings,{},next.at).some(row=>row.targets.some(target=>target.id===id)));
    assert.deepEqual(H.EVOLUTION_DATA.rules[id],[{to:58601,level:34}]);
    assert.equal(H.nurseryOffspringId(s,58601),id);
    assert.equal(H.nurseryOffspringId({travel:{to:[]},adv:{chapter:0}},58601),58501);
    assert.equal(H.nurseryOffspringId({travel:{to:[]},adv:{chapter:0}},586),586);
    s.dex[id]={caught:1};
    assert.equal(H.dexStatus(s,settings).missing.length,0);
    assert.deepEqual(H.seasonFormProgress(s,id).missing,['autumn','winter']);
});

test('dex and shiny rankings activate at the forecast season and weather intersection, even more than 48 hours away',()=>{
    const s=state(),at=autumn();
    for(const [mode,rank] of [['dex',H.dexRanking],['shiny',H.shinyRanking]]){
        const settings=hunt(mode,['rain']);
        assert.equal(rank(s,settings,{},at).length,0);
        assert.equal(H.nextWildWindow(s,settings,[522],at,48),null);
        const next=H.nextWildWindow(s,settings,[522],at);
        assert.ok(next.at>at+48*hour);
        assert.equal(next.season,'summer');assert.equal(next.row.id,67);assert.equal(next.weather,'rain');
        assert.ok(H.weatherEncounterPool(s,67,next.at).get(522)>0);
        assert.ok(rank(s,settings,{},next.at).some(row=>row.id===67));
        assert.equal(H.nextWildWindow(s,settings,[522],at+1000),next);
        assert.equal(H.nextWildWindow(s,hunt(mode,['blizzard']),[522],at),null);
        assert.equal(H.nextWildWindow(s,{...settings,[mode+'Regions']:['kanto']},[522],at)?.at,mode==='dex'?next.at:undefined);
    }
});

test('a spawned seasonal dex target gets to finish during a season change, without claiming a shiny',()=>{
    const s=state(),e=new H.Engine({getItem:()=>null},hunt('dex'));
    e.driver.nav=()=>true;
    s.adv.battle={kind:'wild',enemies:[{id:522,level:21,shiny:false}]};
    assert.equal(H.wildShinyEncounter(s),null);
    assert.equal(e.holdWildShiny(s,autumn()),true);assert.match(e.status,/季节图鉴目标/);
    s.dex[522]={caught:1};assert.equal(e.holdWildShiny(s,autumn()),false);
    delete s.dex[522];e.settings.mode='money';assert.equal(e.holdWildShiny(s,autumn()),false);
    e.settings.mode='dex';s.adv.battle.kind='trainer';assert.equal(e.holdWildShiny(s,autumn()),false);
});

const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');
const state=()=>({adv:{chapter:49,unlocked:83,gifts:{},badges:[]},mons:[{id:6,uid:'a',level:100}],team:['a'],dex:{},items:{},travel:{to:['johto','hoenn','sinnoh','unova']},roam:{at:{},caught:[]}});
test('forecast groups each matching chapter once by sky and region, with progression and midnight boundaries',()=>{
 const s=state(),now=new Date(2026,10,18,23,41).getTime(),wanted=['clear','rain','storm'];
 s.travel.to=[];s.adv.chapter=0;s.adv.unlocked=3;
 assert.deepEqual(H.regionalWeatherForecast(s,[],6,false,now),[]);
 for(const unlockedOnly of [true,false]){
  const periods=H.regionalWeatherForecast(s,wanted,6,unlockedOnly,now);
  assert.equal(periods[0].at,now);assert.equal(periods.at(-1).until,(Math.floor(now/3600000)+7)*3600000);
  for(const [i,period] of periods.entries()){
   if(i)assert.equal(periods[i-1].until,period.at);
   const found=[];
   for(const [reg,skies] of period.regions)for(const [sky,rows] of skies)for(const {chapter,locked} of rows){
    assert.equal(reg,chapter.reg);assert.equal(sky,H.chapterWeather(s,chapter.id,period.at).key||'clear');
    assert.equal(locked,chapter.id>3);found.push(chapter.id);
   }
   const expected=H.DATA.chapters.filter(c=>(!unlockedOnly||c.id<=3)&&wanted.includes(H.chapterWeather(s,c.id,period.at).key||'clear')).map(c=>c.id);
   assert.deepEqual(found.sort((a,b)=>a-b),expected);
  }
 }
});
test('forecast reverts to natural weather at the saved roaming expiry inside the hour',()=>{
 const s=state(),now=new Date(2026,10,18,12,5).getTime(),expiry=now+123456;
 const natural=H.chapterWeather(s,49,expiry).key||'clear';
 const [id,sky]=Object.entries(H.WEATHER_DATA.roamingWeather).find(([,key])=>key!==natural);
 s.roam.at[id]={ch:49,until:expiry};
 const slots=H.regionalWeatherForecast(s,[sky],0,true,now);
 const includes=period=>period.regions.get('sinnoh')?.get(sky)?.some(row=>row.chapter.id===49)||false;
 assert.equal(slots[0].until,expiry);assert.equal(slots[1].at,expiry);assert.ok(includes(slots[0]));assert.equal(includes(slots[1]),false);
});
test('wild appearance forecast follows a roaming expiry to the minute and refreshes when its timer changes',()=>{
 const s=state();s.adv.chapter=0;s.adv.unlocked=0;s.travel.to=[];
 const now=Date.UTC(2026,10,18,4,5),expiry=now+125000;
 const natural=H.chapterWeather(s,0,expiry).key||'clear';
 const [roamer]=Object.entries(H.WEATHER_DATA.roamingWeather).find(([,sky])=>sky!==natural);
 const id=[...H.weatherEncounterPool(s,0,expiry).keys()][0];
 const cfg={...H.DEFAULTS,mode:'shiny',region:'current',shinyWeather:[natural]};
 s.roam.at[roamer]={ch:0,until:expiry};
 const first=H.nextWildWindow(s,cfg,[id],now,4);
 assert.equal(first.at,expiry);assert.equal(first.id,id);
 assert.equal(H.nextWildWindow(s,cfg,[id],now+1000,4),first);
 s.roam.at[roamer].until=expiry+60000;
 assert.equal(H.nextWildWindow(s,cfg,[id],now+1000,4).at,expiry+60000);
 s.roam.caught.push(+roamer);
 assert.notEqual(H.nextWildWindow(s,cfg,[id],now+1000,4)?.at,expiry+60000);
});
test('weather metadata has full seasons, phases and referenced finite encounter pools',()=>{
 assert.equal(H.WEATHER_DATA.chance,.54);assert.equal(H.WEATHER_DATA.slotMs,3600000);assert.equal(H.WEATHER_DATA.chapters.length,H.DATA.chapters.length);
 for(const chapter of H.WEATHER_DATA.chapters)for(const kind of ['pools','direct'])for(const season of ['spring','summer','autumn','winter'])for(const phase of ['morning','day','night'])for(const ref of Object.values(chapter[kind][season][phase]))assert.ok(H.WEATHER_DATA.tables[ref]);
 assert.ok(H.WEATHER_DATA.tables.every(table=>table.every(([id,expected])=>Number.isInteger(id)&&Number.isFinite(expected)&&expected>0)));
});
test('Unova opening route includes the Ogoesse encounters in both dry and rainy pools',()=>{
 const weather=H.WEATHER_DATA,chapter=weather.chapters[66];
 assert.ok(chapter.nodes.some(node=>node.kind==='route'&&node.name==='Ogoesse'));
 const day=chapter.pools.autumn.day;
 assert.equal(new Map(weather.tables[day.clear]).get(504),3.638062);
 assert.equal(new Map(weather.tables[day.rain]).get(504),3.549173);
});
test('chapter weather is deterministic and fixed weather takes priority over roaming',()=>{
 const s=state(),now=new Date(2026,10,17,12).getTime(),ch=H.WEATHER_DATA.chapters.find(c=>c.fixed);
 assert.deepEqual(H.chapterWeather(s,49,now),H.chapterWeather(s,49,now));
 const [id,sky]=Object.entries(H.WEATHER_DATA.roamingWeather)[0];s.roam.at[id]={ch:49,until:now+3600000};assert.equal(H.chapterWeather(s,49,now).key,sky);assert.equal(H.chapterWeather(s,49,now).source,'roaming');
 assert.equal(H.chapterWeather(s,49,now+3600000).source,'natural');s.roam.at[id]={ch:ch.id,until:now+3600000};assert.equal(H.chapterWeather(s,ch.id,now).source,'fixed');
});
test('night skies exclude daylight-only weather and candidate chapter controls forced daytime',()=>{
 const s=state();for(let n=0;n<240;n++)for(const c of H.DATA.chapters){const now=new Date(2026,10,17,22).getTime()+n*86400000;assert.notEqual(H.chapterWeather(s,c.id,now).key,'sun');}
 s.adv.chapter=0;s.adv.unlocked=0;assert.equal(H.phaseAt(s,new Date(2026,10,17,22).getTime(),0),'day');assert.equal(H.phaseAt(s,new Date(2026,10,17,22).getTime(),14),'night');
});
test('weather-only wild targets are excluded until their actual weather window',()=>{
 const s=state(),settings={...H.DEFAULTS,mode:'shiny',region:'all'},base=new Date(2026,10,17,0).getTime();let checked=0;
 for(const chapter of H.DATA.chapters){if(checked>=8)break;for(const row of chapter.shinyPools?.day||[]){const[id,best,clear]=row;if(!(best>0&&clear===0))continue;settings.shinyId=id;
  for(let n=0;n<48;n++){const now=base+n*3600000,pool=H.weatherEncounterPool(s,chapter.id,now);if(pool.has(id))continue;const ranked=H.shinyRanking(s,settings,{},now).find(r=>r.members.includes(chapter.id));if(ranked&&ranked.members.length>1)continue;assert.equal(ranked,undefined,`chapter ${chapter.id}, target ${id}, hour ${n}`);checked++;break;}
 }}assert.ok(checked>0,'fixtures cover actual weather-only encounters');
});
test('future wild windows use hour/phase/season boundaries and return available targets',()=>{
 const s=state(),settings={...H.DEFAULTS,region:'all'},now=new Date(2026,10,17,12,12).getTime(),result=H.nextWildWindow(s,settings,[25,54,60],now);
 assert.ok(result&&result.at>now);assert.equal(result.at%H.WEATHER_DATA.slotMs,0);assert.ok(result.row.members.some(ch=>H.weatherEncounterPool(s,ch,result.at).get(result.id)>0));
});
test('strict wild shiny guard ignores previews and nonwild modes, and never changes game state',()=>{
 const s=state(),before=JSON.stringify(s);assert.equal(H.wildShinyEncounter(s),null);assert.equal(JSON.stringify(s),before);
 s.adv.battle={kind:'wild',enemies:[{id:25,shiny:true,level:20}]};const hit=H.wildShinyEncounter(s);assert.equal(hit.enemies[0].id,25);assert.equal(H.wildShinyEncounter(s).key,hit.key);
 for(const kind of ['static','trainer','gym','raid']){s.adv.battle.kind=kind;assert.equal(H.wildShinyEncounter(s),null);}s.adv.battle.kind='wild';
 for(const key of ['event','zone','tower','league']){s.adv[key]={};assert.equal(H.wildShinyEncounter(s),null);delete s.adv[key];}
 s.adv.battle.enemies[0].shiny='true';assert.equal(H.wildShinyEncounter(s),null);s.adv.battle.enemies[0].shiny=true;s.adv.battle.enemies[0].id=999999;assert.equal(H.wildShinyEncounter(s),null);
});
test('wild shiny blocks map/progress/travel/preparation and resumes without losing pending work',()=>{
 const s=state();s.adv.battle={kind:'wild',enemies:[{id:25,shiny:true,level:20}]};let prepared=0;const e=new H.Engine({getItem:()=>null,setItem(){},removeItem(){}});e.read=()=>s;e.coach.ensure=()=>{prepared++;return false;};const pages=[];e.driver.nav=page=>{pages.push(page);return true;};
 const pending={row:{id:1},started:1};e.driver.pendingMap=pending;e.travel({id:2},100);e.progress(s,100);assert.equal(e.ensurePrepared(s,{}, {},100),true);assert.equal(e.driver.map({id:3},s),false);
 assert.equal(prepared,0);assert.equal(e.driver.pendingMap,pending);assert.ok(pages.every(p=>p==='adventure'));assert.equal(e.logs.length,1);delete s.adv.battle;assert.equal(e.holdWildShiny(s,200),false);
});
test('wild shiny suspension freezes helper deadlines once without changing real run or game clocks',()=>{
 const s=state();s.adv.battle={kind:'wild',enemies:[{id:25,shiny:true,level:20}]};s.under={slots:[{end:9999}]};const snapshot=JSON.stringify(s);
 const e=new H.Engine({getItem:()=>null,setItem(){},removeItem(){}},{stopMinutes:2});e.driver.nav=()=>true;e.started=50;
 e.driver.pendingMap={started:100};e.preparation={phaseAt:200,lastGrowth:300,candyAt:400,lastTick:500};e.roamStarted=600;
 assert.equal(e.holdWildShiny(s,1000),true);assert.equal(e.hiddenAt,1000);
 e.resumeUIClock(1500);assert.equal(e.driver.pendingMap.started,600);assert.equal(e.holdWildShiny(s,1500),true);
 assert.equal(JSON.stringify(s),snapshot,'native encounter and expedition deadlines remain read only');
 delete s.adv.battle;e.resumeUIClock(2000);assert.equal(e.holdWildShiny(s,2000),false);
 assert.equal(e.driver.pendingMap.started,1100);assert.equal(e.preparation.phaseAt,1200);assert.equal(e.preparation.lastGrowth,1300);assert.equal(e.preparation.candyAt,1400);assert.equal(e.roamStarted,1600);
 assert.equal(e.started,50);assert.equal(e.settings.stopMinutes,2);assert.equal(e.hiddenAt,null);assert.equal(e.wildShinyProtected,null);
 e.resumeUIClock(2500);assert.equal(e.driver.pendingMap.started,1100,'a completed guard cannot extend the deadline again');assert.equal(e.preparation.lastGrowth,1300);assert.equal(e.started,50);
});

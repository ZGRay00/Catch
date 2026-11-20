    const WEATHER_POOL_CACHE = new Map();
    const WEATHER_LABELS={clear:'晴朗',rain:'下雨',storm:'雷暴',sun:'大晴天',sand:'沙暴',snow:'下雪',ash:'火山灰',fog:'浓雾',blizzard:'暴风雪',breeze:'微风',gale:'强风'};

    function regionalWeatherForecast(s, selected, futureHours, unlockedOnly, now=Date.now()){
        const wanted=new Set(selected),slot=WEATHER_DATA.slotMs;
        if(!wanted.size||!s?.adv)return [];
        const unlocked=new Set(availableChapters(s,{region:'all'}).map(c=>c.id));
        const chapters=DATA.chapters.filter(c=>!unlockedOnly||unlocked.has(c.id));
        const end=(Math.floor(now/slot)+1+futureHours)*slot;
        const periods=[];
        for(let at=now;at<end;){
            let until=(Math.floor(at/slot)+1)*slot;
            // Local day/night can change inside a UTC weather slot in fractional-offset zones.
            const local=new Date(at);
            local.setHours(local.getHours()<8?8:local.getHours()<20?20:32,0,0,0);
            until=Math.min(until,local.getTime());
            const regions=new Map();
            for(const chapter of chapters){
                const sky=chapterWeather(s,chapter.id,at),key=sky.key||'clear';
                if(sky.until>at)until=Math.min(until,sky.until);
                if(!sky.known||!wanted.has(key))continue;
                if(!regions.has(chapter.reg))regions.set(chapter.reg,new Map());
                const skies=regions.get(chapter.reg);
                if(!skies.has(key))skies.set(key,[]);
                skies.get(key).push({chapter,locked:!unlocked.has(chapter.id)});
            }
            periods.push({at,until,regions});
            at=until;
        }
        return periods;
    }
    const WILD_SHINY_IDS = new Set(UNOVA_WILD_IDS);
    const WILD_HABITATS = new Map();
    const WILD_PHASES = ['morning','day','night'];
    for(const c of DATA.chapters){
        const habitat=new Map(),weather=WEATHER_DATA.chapters[c.id];
        function record(id,phase,rotation,seasonMask){
            if(!habitat.has(id))habitat.set(id,{phases:new Set(),ordinary:false,rotations:new Set(),seasonMask:0});
            const hit=habitat.get(id);
            hit.seasonMask|=seasonMask;
            hit.phases.add(phase);
            if(rotation===null)hit.ordinary=true;
            else if(!hit.ordinary)hit.rotations.add(rotation);
            WILD_SHINY_IDS.add(id);
        }
        if(weather?.pools){
            // The base tables must be visited first. Species added solely by a daily
            // spot are still known sources on days when the spot is elsewhere.
            for(const [key,variant] of [['',weather],...Object.entries(weather.variants||{})]){
                const rotation=key?Number(key.split(':',1)[0]):null;
                for(const phase of WILD_PHASES){
                    const tables=new Map();
                    for(const conditions of [variant.pools,variant.direct]){
                        for(const [season,phases] of Object.entries(conditions||{})){
                            const bit=1<<SEASON_KEYS.indexOf(season);
                            for(const table of Object.values(phases[phase]||{}))tables.set(table,(tables.get(table)||0)|bit);
                        }
                    }
                    for(const [table,mask] of tables)for(const [id] of WEATHER_DATA.tables[table])record(id,phase,rotation,mask);
                }
            }
        }else{
            for(const [phase,pool] of Object.entries(c.shinyPools||c.pools)){
                for(const [id,weight] of pool)if(weight>0)record(id,phase,null,15);
            }
        }
        WILD_HABITATS.set(c.id,habitat);
    }
    function huntRegions(settings){
        return ['dex','shiny'].includes(settings.mode)?settings[settings.mode+'Regions']||[]:[];
    }
    function huntRegionMatches(s,settings,region){
        const selected=huntRegions(settings);
        return selected.length?selected.includes(region):settings.region==='all'||region===currentRegion(s);
    }
    function huntWeatherMatches(s,settings,chapter,now){
        const selected=settings[settings.mode+'Weather'];
        if(!selected?.length)return true;
        const sky=chapterWeather(s,chapter,now);
        return sky.known&&selected.includes(sky.key||'clear');
    }
    function shinyGoals(settings){return settings.shinySpecies?.length?settings.shinySpecies:[settings.shinyId];}
    function missingShinies(s,settings){
        const unchecked=shinyGoals(settings).filter(id=>!s.dex?.[id]?.shiny);
        if(!unchecked.length)return [];
        const owned=new Set(collectionMembers(s).filter(mon=>mon.shiny).map(mon=>mon.id));
        return unchecked.filter(id=>!owned.has(id));
    }
    function huntRouteMatches(s,settings,row,now){
        return huntRegionMatches(s,settings,row.reg)&&(row.members||[row.id]).every(id=>huntWeatherMatches(s,settings,id,now));
    }
    // Keep one ranking per task. Narrow dependencies survive native battle autosaves
    // (HP, wallet, XP ticks) and work with imported saves and in-place metric updates.
    const routeRankings=new Map();
    function rankingEnvironment(s,settings,now){
        const activeRoam=Object.entries(s.roam?.at||{}).filter(([id,pos])=>
            pos?.until>now&&!s.roam?.caught?.includes(+id)&&WEATHER_DATA.roamingWeather[id]).map(([id,pos])=>[id,pos.ch]);
        return [accountId(s),s.adv.chapter,s.adv.unlocked,s.travel?.to,settings.region,huntRegions(settings),
            Math.floor(now/WEATHER_DATA.slotMs),new Date(now).getHours(),weatherSeason(now),activeRoam];
    }
    function huntRankingInputs(s,settings,targets,now){
        const a=s.adv;
        const nodes=currentRegion(s)==='unova'&&!a.event&&!a.zone&&!a.tower&&!a.league&&Array.isArray(a.nodes)
            ? a.nodes.slice(Math.max(0,a.node||0)).filter(n=>n.phenom||n.type==='item'&&n.loot) : null;
        const rolled=nodes?.length&&a.nodes[a.node]?.phenom&&a.battle?.kind==='wild' ? a.battle.enemies?.map(mon=>[mon.id,!!mon.shiny]) : null;
        return [rankingEnvironment(s,settings,now),settings[settings.mode+'Weather'],targets,nodes,rolled];
    }
    function rankedRoutes(kind,inputs,build,cooldowns,now){
        const signature=JSON.stringify(inputs);
        let cached=routeRankings.get(kind);
        if(!cached||cached.signature!==signature){
            cached={signature,rows:build()};routeRankings.set(kind,cached);
        }
        // Cooldowns can expire anywhere in a weather slot. A marked dex encounter
        // always keeps precedence, including when its ordinary map is cooling down.
        return availableRankedRoutes(cached.rows,cooldowns,now);
    }
    function availableRankedRoutes(rows,cooldowns,now){
        return rows.filter(row=>row.marked||(cooldowns[row.key]||0)<=now);
    }
    function hasWildSource(s,settings,id){
        const specialChapters=(UNOVA_SOURCE_INDEX.get(id)||[]).filter(route=>route.egg?.id!==id).map(route=>route.chapter);
        return candidates(s,settings).some(row=>row.members.some(ch=>WILD_HABITATS.get(ch)?.has(id)||specialChapters.includes(ch)));
    }
    const chapterSpotIndices=new WeakMap();
    function weatherEncounterTable(data,sky,phase,now){
        let indices=chapterSpotIndices.get(data);
        if(!indices){
            indices=[...new Set(Object.keys(data.variants||{}).map(key=>Number(key.split(':')[0])))].sort((a,b)=>a-b);
            chapterSpotIndices.set(data,indices);
        }
        let variant=data;
        for(const i of indices){
            const selected=data.variants[i+':'+weatherDailySpot(WEATHER_DATA.dailySpots[i],now)];
            if(selected){variant=selected;break;}
        }
        return (sky.source==='natural'?variant.pools:variant.direct)?.[weatherSeason(now)]?.[phase]?.[sky.key||'clear'];
    }
    function weatherEncounterPool(s,chapter,now=Date.now()) {
        const sky=chapterWeather(s,chapter,now),data=WEATHER_DATA.chapters[chapter];
        if(!sky.known||!data)return null;
        const table=weatherEncounterTable(data,sky,phaseAt(s,now,chapter),now);
        if(!Number.isInteger(table))return null;
        if(!WEATHER_POOL_CACHE.has(table))WEATHER_POOL_CACHE.set(table,new Map(WEATHER_DATA.tables[table]));
        return WEATHER_POOL_CACHE.get(table);
    }
    function currentWildPool(s,chapter,now){
        const pool=weatherEncounterPool(s,chapter,now);
        if(pool)return pool;
        const c=CHAPTERS.get(chapter),phase=phaseAt(s,now,chapter);
        return new Map((c?.shinyPools?.[phase]||c?.pools?.[phase]||[]).map(([id,,clear])=>[id,clear]));
    }
    let wildForecastCache;
    function nextWildWindow(s,settings,ids,now=Date.now(),hours) {
        const targets=Array.from(new Set(ids));
        const eggState=settings.mode==='dex'&&targets.some(id=>UNOVA_SOURCE_INDEX.get(id)?.some(route=>route.egg?.id===id))
            ? [s.adv.badges,s.adv.gifts,s.pension?.eggs?.map(egg=>egg.id),s.pension?.open?.eggs] : null;
        const signature=JSON.stringify([rankingEnvironment(s,settings,now),settings.mode,settings[settings.mode+'Weather'],targets,hours,s.roam?.at,s.roam?.caught,eggState]);
        if(wildForecastCache?.signature===signature&&now>=wildForecastCache.from&&now<wildForecastCache.until)return wildForecastCache.result;
        const slot=WEATHER_DATA.slotMs,firstHour=(Math.floor(now/slot)+1)*slot;
        const result=searchWildWindow(s,settings,targets,now,firstHour,hours);
        wildForecastCache={signature,from:now,until:Math.min(firstHour,result?.at??Infinity),result};
        return result;
    }
    function searchWildWindow(s,settings,targets,now,firstHour,hours){
        const allowEgg=settings.mode==='dex';
        const specialIds=targets.filter(id=>UNOVA_WILD_IDS.has(id)||allowEgg&&UNOVA_SOURCE_INDEX.has(id));
        const specialChapters=new Set(specialIds.flatMap(id=>UNOVA_SOURCE_INDEX.get(id).filter(route=>allowEgg||route.egg?.id!==id).map(route=>route.chapter)));
        const rowsBySeason=SEASON_KEYS.map(()=>[]),rows=[];
        let hasSeasonal=false;
        for(const row of candidates(s,settings)){
            let mask=0;
            for(const ch of row.members){
                if(specialChapters.has(ch))mask=15;
                for(const id of targets){
                    const habitat=WILD_HABITATS.get(ch)?.get(id);
                    if(habitat){mask|=habitat.seasonMask;hasSeasonal||=habitat.seasonMask!==15;}
                }
            }
            if(!mask)continue;
            rows.push(row);
            rowsBySeason.forEach((list,index)=>{if(mask&(1<<index))list.push(row);});
        }
        if(!rows.length)return null;
        // A seasonal source can be nine days away. Scan a full local cycle only when needed.
        const cycle=new Date(now);
        cycle.setDate(cycle.getDate()+12);
        const end=hours===undefined&&hasSeasonal?cycle.getTime():firstHour+(Math.floor(hours??48)-1)*WEATHER_DATA.slotMs;
        const chapters=new Set(rows.flatMap(row=>row.members));
        for(const at of huntBoundaries(s,chapters,now,end)){
            const season=weatherSeason(at),possible=rowsBySeason[SEASON_KEYS.indexOf(season)];
            if(!possible.length)continue;
            const matching=possible.filter(row=>huntRouteMatches(s,settings,row,at));
            for(const row of matching)for(const chapter of row.members){
                const pool=currentWildPool(s,chapter,at),id=targets.find(id=>(pool.get(id)||0)>0);
                if(id)return{at,row,id,season,weather:chapterWeather(s,chapter,at).key};
            }
            for(const id of specialIds){
                for(const source of unovaAcquisitionSources(s,id,at,false)){
                    const row=(allowEgg||source.kind==='phenomenon')&&source.available&&matching.find(r=>r.members.includes(source.chapter));
                    if(row)return{at,row,id,season,weather:chapterWeather(s,source.chapter,at).key,...(source.kind==='lootEgg'?{eggPlace:source.nodeName}:{})};
                }
            }
        }
        return null;
    }
    function huntBoundaries(s,chapters,now,end){
        const firstHour=(Math.floor(now/WEATHER_DATA.slotMs)+1)*WEATHER_DATA.slotMs;
        const boundaries=new Set();
        for(let at=firstHour;at<=end;at+=WEATHER_DATA.slotMs)boundaries.add(at);
        // In fractional-offset time zones local phase and season changes can fall inside a weather slot.
        const day=new Date(now);day.setHours(0,0,0,0);
        for(;day.getTime()<=end;day.setDate(day.getDate()+1)){
            for(const hour of [0,8,10,20]){
                const at=new Date(day).setHours(hour,0,0,0);
                if(at>now&&at<=end)boundaries.add(at);
            }
        }
        for(const [id,pos] of Object.entries(s.roam?.at||{})){
            const at=Number(pos?.until);
            if(chapters.has(pos?.ch)&&WEATHER_DATA.roamingWeather[id]&&!s.roam?.caught?.includes(+id)&&at>now&&at<=end)boundaries.add(at);
        }
        return [...boundaries].sort((a,b)=>a-b);
    }
    // Only native battle state is evidence of a real wild shiny. UI badges, sprites,
    // previews and daily raid cards cannot activate this guard.
    function wildEncounter(s,matches) {
        const adv=s?.adv,battle=adv?.battle;
        if(!adv||adv.event||adv.zone||adv.tower||adv.league||battle?.kind!=='wild'||battle.raid)return null;
        const enemies=(Array.isArray(battle.enemies)?battle.enemies:[]).filter(mon=>Number.isInteger(mon?.id)&&MONS.has(mon.id)&&matches(mon));
        if(!enemies.length)return null;
        return{chapter:adv.chapter,node:adv.node,enemies,key:JSON.stringify([adv.chapter,adv.node,adv.runs||0,enemies.map(mon=>[mon.id,mon.uid??null,mon.level??null])])};
    }
    function wildShinyEncounter(s){return wildEncounter(s,mon=>mon.shiny===true);}
    function targetDexEncounter(s,settings){
        if(settings.mode!=='dex'||s?.adv?.battle?.kind!=='wild'||!huntRegionMatches(s,settings,currentRegion(s)))return null;
        let missing;
        return wildEncounter(s,mon=>(missing??=dexStatus(s,settings).ids).has(mon.id));
    }
    function seasonalDexEncounter(s,settings){
        if(settings.mode!=='dex'||s?.adv?.battle?.kind!=='wild'||!huntRegionMatches(s,settings,currentRegion(s)))return null;
        const habitats=WILD_HABITATS.get(s.adv.chapter);
        let missing;
        return wildEncounter(s,mon=>{
            const mask=habitats?.get(mon.id)?.seasonMask;
            if(!mask||mask===15)return false;
            missing??=dexStatus(s,settings).ids;
            return missing.has(mon.id);
        });
    }
    function nodeWeather(s,chapter,node,now=Date.now()) {
        if(!node||node.weather!==undefined||node.indoor)return node?.weather??null;
        return resolveNodeSky(node,chapterWeather(s,chapter,now),phaseAt(s,now,chapter));
    }
    function resolveNodeSky(node,sky,phase){
        if(!node)return null;
        if(node.weather!==undefined)return node.weather;
        if(node.indoor)return null;
        if(sky.source!=='natural')return sky.key;
        const allowed=key=>node.climate?.[key]&&!(phase==='night'&&WEATHER_DATA.types[key]?.daylight);
        return allowed(sky.key)?sky.key:(WEATHER_DATA.translate[sky.key]||[]).find(allowed)||null;
    }
    function weatherDamageContext(s,chapter=s?.adv?.chapter,now=Date.now(),node=null) {
        // A chapter's aggregate sky must never be applied to every indoor/translated
        // encounter. With no explicit node, retain only the native night modifier.
        const key=nodeWeather(s,chapter,node,now),night=phaseAt(s,now,chapter)==='night';
        return Object.fromEntries(Object.keys(DATA.types).map(type=>[type,(node?.weatherDamage?(node.weatherDamage[type]??1):(WEATHER_DATA.types[key]?.damage?.[type]??1))*(night?WEATHER_DATA.nightDamage[type]??1:1)]));
    }
    function collectionMembers(s){
        return [...(s.mons||[]),...(s.pension?.mons||[]).map(slot=>slot?.mon),
            ...(s.link?.stash?.mons||[]),...(s.under?.slots||[]).flatMap(slot=>slot?.mons||[])].filter(Boolean);
    }
    function captured(s, id, ownedIds) {
        // Historical captures survive evolution, trading, daycare and release.
        return Number(s.dex?.[id]?.caught) > 0 || (ownedIds ? ownedIds.has(id) : collectionMembers(s).some(m=>m.id===id));
    }
    function regionOfMon(id) {
        const base=MONS.get(id)?.root||id;
        return DATA.regions.find(r=>r.dexRange&&base>=r.dexRange[0]&&base<=r.dexRange[1])?.key||
            (base<=151?'kanto':base<=251?'johto':base<=386?'hoenn':base<=493?'sinnoh':null);
    }
    function dexStatus(s, settings) {
        const current=currentRegion(s),open = new Set(['kanto', ...(s.travel?.to || []), current]);
        const explicit=settings.mode==='dex'&&settings.dexSpecies?.length;
        const regions=huntRegions(settings);
        const roots = explicit?settings.dexSpecies.map(id=>MONS.get(id)).filter(Boolean):ROOTS.filter(m=>regions.length?regions.includes(regionOfMon(m.id)):
            settings.region==='all'?open.has(regionOfMon(m.id)):regionOfMon(m.id)===current);
        const ownedIds = new Set(collectionMembers(s).map(mon=>mon.id));
        const missing = roots.filter(m => !captured(s, m.id, ownedIds));
        return { roots, missing, complete: roots.length - missing.length, ids: new Set(missing.map(m => m.id)) };
    }
    function availableChapters(s, settings, replay = false) {
        const open = new Set(['kanto', ...(s.travel?.to || [])]);
        const reg = currentRegion(s); open.add(reg);
        return DATA.chapters.filter(c => open.has(c.reg) && huntRegionMatches(s,settings,c.reg) &&
            c.id <= s.adv.unlocked && (!replay || c.id < s.adv.unlocked || c.id === DATA.regions.find(r => r.key === c.reg)?.end));
    }
    function candidates(s, settings, replay = false) {
        const chapters = availableChapters(s, settings, replay), grouped = new Map();
        for (const c of chapters) {
            const key = String(c.loop);
            if (grouped.has(key)) { const row = grouped.get(key); row.members.push(c.id); row.reward += c.reward; row.units += c.units; continue; }
            grouped.set(key, { ...c, key, members: [c.id], name: c.league ? `${DATA.regions.find(r => r.key === c.reg)?.name} · 联盟` : c.name });
        }
        return [...grouped.values()].filter(row => !row.league || DATA.chapters.filter(c => c.loop === row.loop).every(c => chapters.includes(c)));
    }
    const yieldLevelBands=new WeakMap();
    function yieldLevelBand(mon){
        const level=Math.floor(mon.level),bucket=Math.floor(level/10),model=MONS.get(mon.id);
        if(!model)return bucket;
        // Transform uses the opponent's learnset at Ditto's own level.
        if(mon.id===132)return 'ditto'+level;
        let bands=yieldLevelBands.get(model);
        if(!bands){
            const firstLevels=new Map();
            for(const entry of damagingMoves(model)){
                const previous=firstLevels.get(entry.key)??Infinity;
                if(entry.level<previous)firstLevels.set(entry.key,entry.level);
            }
            const learned=new Set(firstLevels.values());
            bands=[];
            for(let lo=0;lo<=100;lo+=10){
                const start=Math.max(1,lo),end=Math.min(100,lo+9);
                let since=start;
                for(let lv=start;lv<=end;lv++){
                    if(learned.has(lv))since=lv;
                    bands[lv]=since;
                }
                // Keep old history only when the whole old bucket had one move set.
                for(let lv=start;lv<=end;lv++)bands[lv]=since===start?lo/10:lo/10+'m'+bands[lv];
            }
            yieldLevelBands.set(model,bands);
        }
        return bands[level]??bucket;
    }
    function teamFingerprint(s) {
        const index = new Map((s.mons || []).map(m => [m.uid, m]));
        // Coarse level buckets allow useful history while rejecting a different party.
        return (s.team || []).map(uid => index.get(uid)).filter(Boolean).map(m => `${m.id}:${yieldLevelBand(m)}:${m.rank || 0}:${+!!m.shiny}:${m.statMult||1}:${m.hpMult||1}:${+!!(m.level>=trainingCap(s,m))}:${tasteProfile(m)}`).join(',');
    }
    function trainingRouteFingerprint(s,uids=s.team||[]){
        const index=new Map((s.mons||[]).map(mon=>[mon.uid,mon]));
        // Route choice reacts to each level and evolution; XP ticks and temporary HP do not.
        return JSON.stringify([s.adv.unlocked,s.link?.side||'',s.autoSwitch!==false,uids.map(uid=>{
            const mon=index.get(uid);return mon?[uid,...combatProfile({...mon,status:null}),trainingCap(s,mon)]:[uid];
        })]);
    }
    function activeYieldBuff(s,family,now=Date.now()){
        const buff=s.buffs?.[family],info=buff&&DATA.automation.buffs[buff.key];
        return info&&info.family===family&&buff.until>now&&!(buff.side==='from'&&s.link?.side==='to')?info:null;
    }
    function yieldFingerprint(s,now=Date.now()){
        const buffs=Object.keys(s.buffs||{}).sort().filter(family=>activeYieldBuff(s,family,now)).map(family=>[family,s.buffs[family].key]);
        return JSON.stringify([s.buddy?.uid||'',buffs,s.adv.capture||null]);
    }
    const metricClimates=new WeakMap(),nightMoveLevels=new WeakMap(),nightFoeLists=new WeakMap();
    const metricPools=new WeakMap(),metricDamage=new WeakMap();
    function conditionDigest(entries){
        return (weatherHash(JSON.stringify(entries))*4294967296).toString(36);
    }
    function poolCondition(index){
        const pool=WEATHER_DATA.tables[index];
        if(!pool)return '?';
        // Bundle exports can renumber the pool dictionary without changing a single encounter.
        if(!metricPools.has(pool))metricPools.set(pool,conditionDigest([...pool].sort((a,b)=>a[0]-b[0])));
        return metricPools.get(pool);
    }
    function damageCondition(key){
        const damage=WEATHER_DATA.types[key]?.damage;
        if(!damage)return '-';
        if(!metricDamage.has(damage))metricDamage.set(damage,conditionDigest(Object.entries(damage).sort()));
        return metricDamage.get(damage);
    }
    function canUseNightMove(id,level){
        const model=MONS.get(id);
        if(!model)return false;
        if(!nightMoveLevels.has(model)){
            const moves=damagingMoves(model).filter(entry=>WEATHER_DATA.nightDamage[entry.move.type]);
            nightMoveLevels.set(model,Math.min(Infinity,...moves.map(entry=>entry.level)));
        }
        return level>=nightMoveLevels.get(model);
    }
    function metricClimate(data){
        let info=metricClimates.get(data);
        if(info)return info;
        const nodes=new Map();
        for(const node of data.nodes){
            if(node.indoor||node.weather!==undefined||node.weatherDamage||!['route','trainer','gym','static'].includes(node.kind))continue;
            nodes.set(Object.keys(node.climate||{}).sort().join(','),node);
        }
        const pools=new Set();
        for(const variant of [data,...Object.values(data.variants||{})]){
            for(const seasons of [variant.pools,variant.direct])for(const phases of Object.values(seasons||{}))
                for(const skies of Object.values(phases))for(const pool of Object.values(skies))pools.add(pool);
        }
        info={nodes:[...nodes.values()],poolChanges:pools.size>1};
        metricClimates.set(data,info);
        return info;
    }
    function metricChapterEnvironment(s,id,now,partyUsesNight){
        const data=WEATHER_DATA.chapters[id],chapter=CHAPTERS.get(id);
        if(!data||!chapter)return '';
        const info=metricClimate(data),phase=phaseAt(s,now,id),foes=chapterFoes(s,chapter);
        if(!nightFoeLists.has(foes))nightFoeLists.set(foes,foes.some(([enemy,level])=>canUseNightMove(enemy,level)));
        const nightVaries=!(chapter.day&&s.adv.unlocked<=id)&&(partyUsesNight||nightFoeLists.get(foes));
        const night=nightVaries?(phase==='night'?'n':'d'):'';
        if(!info.poolChanges&&!info.nodes.length)return night;
        const sky=chapterWeather(s,id,now);
        // Cache once per chart environment, even as battle autosaves replace S.
        // The hour selects the native table, but is never part of a history key.
        const stamp=[sky.at,new Date(now).getDate(),sky.source,sky.key,phase].join('/');
        if(stamp!==info.stamp){
            const table=info.poolChanges?poolCondition(weatherEncounterTable(data,sky,phase,now)):'';
            const damage=info.nodes.map(node=>damageCondition(resolveNodeSky(node,sky,phase))).join('.');
            info.stamp=stamp;info.signature=table+'/'+damage;
        }
        return info.signature+night;
    }
    const metricLoopMembers=new Map();
    for(const chapter of DATA.chapters){
        const key=String(chapter.loop);
        if(!metricLoopMembers.has(key))metricLoopMembers.set(key,[]);
        metricLoopMembers.get(key).push(chapter.id);
    }
    const metricRules=new WeakMap(),roamingDropChapters=new Set();
    let metricDropsByChapter;
    function chapterYieldRules(id){
        const chapter=CHAPTERS.get(id);
        if(!chapter)return '?';
        if(metricRules.has(chapter))return metricRules.get(chapter);
        if(!metricDropsByChapter){
            metricDropsByChapter=new Map();
            for(const item of DATA.items)for(const source of item.sources){
                if(!metricDropsByChapter.has(source.ch))metricDropsByChapter.set(source.ch,[]);
                metricDropsByChapter.get(source.ch).push(JSON.stringify([item.id,Object.entries(source).sort()]));
                if(source.beforeRoaming!=null&&source.beforeRoaming!==source.expected)roamingDropChapters.add(source.ch);
            }
        }
        // A re-export with the same payouts and encounters keeps its samples.
        // Changed trainer rewards, levels or loot tables need their own completed rounds.
        const digest=conditionDigest([chapter.reward,chapter.xpEstimate,chapter.units,chapter.foes,chapter.foesByStarter,
            DATA.economy.xpMultipliers[chapter.reg],DATA.economy.behindMoney,DATA.townCooldown,DATA.tideMs,
            (metricDropsByChapter.get(id)||[]).sort()]);
        metricRules.set(chapter,digest);
        return digest;
    }
    function routeMetricKey(s,settings,now){
        const prefix=`e4|${economicRegion(s)}|${yieldFingerprint(s,now)}|${teamFingerprint(s)}|sw${helperSwitchEnabled(s,settings)?'helper':+(s.autoSwitch!==false)}|${settings.speed}|`;
        const suffix='|u'+s.adv.unlocked;
        const partyUsesNight=partyMons(s).some(mon=>canUseNightMove(mon.id,mon.level));
        const roamingOpen=ROAMING_DATA.groups.some(group=>s.adv.badges?.includes(group.badge));
        return (row,scoped=true)=>{
            const base=prefix+row.key+suffix;
            if(!scoped)return base;
            const members=row.members||metricLoopMembers.get(String(row.key))||[];
            const rules=members.map(chapterYieldRules).join('.');
            const roaming=roamingOpen&&members.some(id=>roamingDropChapters.has(id))?'+roam':'';
            const environments=members.map(id=>metricChapterEnvironment(s,id,now,partyUsesNight));
            const conditions=environments.some(Boolean)?'|env'+environments.join(';'):'';
            return base+'|rules'+rules+roaming+conditions;
        };
    }
    function metricsKey(s,row,settings,now=Date.now()){return routeMetricKey(s,settings,now)(row);}
    function yieldRankingInputs(s,settings,rows,now){
        const starters=rows.flatMap(row=>row.members.map(id=>CHAPTERS.get(id).foesByStarter)).filter(Boolean)
            .map(branch=>starterChoice(s,branch.key,Object.keys(branch.choices||{}).map(Number)));
        const party=partyMons(s).map(m=>[m.uid,monRegion(m),trainingCap(s,m),...combatProfile({...m,status:null})]);
        return [rankingEnvironment(s,settings,now),settings.speed,s.team,party,starters,s.autoSwitch!==false,s.link?.to,s.link?.side,
            economicRegion(s),yieldFingerprint(s,now),s.buddy?.uid];
    }
    function estimatedRouteSeconds(row,speed=4){
        // Native SPEED_PACE maps the top control to 2.5x effective pace.
        // The route units are a time estimate; observed durations stay in real seconds.
        return Math.max(20,row.units*2.8/(Number(speed)===4?2.5:1));
    }
    function estimateRate(row,speed) { return row.reward / estimatedRouteSeconds(row,speed) * 60; }
    function estimateWithHistory(model,historical){
        // Old loops mixed weather and could use earlier payouts. Cap their influence at 25%;
        // only matching full cycles may count toward a proven route switch.
        return Number.isFinite(historical)?model*.75+Math.max(0,Math.min(model*2,historical))*.25:model;
    }
    function moneyRanking(s, settings, metrics = {}, cooldowns = {}, now = Date.now()) {
        return completeYieldRanking(yieldRankingRequest('money',s,settings,metrics,now),cooldowns,now);
    }
    function moneyRouteScore(s,row,m,battleFit,now,speed){
        const measured=m?.seconds>0&&m?.runs>0;
        const coverage=battleFit.coverage==null?1:Math.min(1,Math.max(0,battleFit.coverage));
        // Slow victories and an inability to finish encounters are separate costs.
        const rate=measured?m.net/m.seconds*60:estimateWithHistory(estimateRate(row,speed)*moneyFactor(s,row)*(activeYieldBuff(s,'money',now)?.mult||1)*battleFit.factor*coverage,m?.historicalRate);
        return {...row,rate,battleFit,measured,samples:m?.runs||0,seconds:m?.seconds||0};
    }

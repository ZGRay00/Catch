    const WEATHER_POOL_CACHE = new Map();
    function weatherEncounterPool(s,chapter,now=Date.now()) {
        const sky=chapterWeather(s,chapter,now),data=WEATHER_DATA.chapters[chapter];
        if(!sky.known||!data)return null;
        const variant=WEATHER_DATA.dailySpots.map((spot,i)=>data.variants?.[i+':'+weatherDailySpot(spot,now)]).find(Boolean)||data;
        const table=(sky.source==='natural'?variant.pools:variant.direct)?.[weatherSeason(now)]?.[phaseAt(s,now,chapter)]?.[sky.key||'clear'];
        if(!Number.isInteger(table))return null;
        if(!WEATHER_POOL_CACHE.has(table))WEATHER_POOL_CACHE.set(table,new Map(WEATHER_DATA.tables[table]));
        return WEATHER_POOL_CACHE.get(table);
    }
    function nextWildWindow(s,settings,ids,now=Date.now(),hours=48) {
        const targets=ids instanceof Set?ids:new Set(ids),rows=candidates(s,settings),slot=WEATHER_DATA.slotMs;
        for(let n=1;n<=hours;n++){
            const at=Math.floor(now/slot)*slot+n*slot;
            for(const row of rows)for(const chapter of row.members){
                const pool=weatherEncounterPool(s,chapter,at),id=pool&&[...targets].find(id=>(pool.get(id)||0)>0);
                if(id)return{at,row,id,weather:chapterWeather(s,chapter,at).key};
            }
        }
        return null;
    }
    // Only native battle state is evidence of a real wild shiny. UI badges, sprites,
    // previews and daily raid cards cannot activate this guard.
    function wildShinyEncounter(s) {
        const adv=s?.adv,battle=adv?.battle;
        if(!adv||adv.event||adv.zone||adv.tower||adv.league||battle?.kind!=='wild'||battle.raid)return null;
        const enemies=(Array.isArray(battle.enemies)?battle.enemies:[]).filter(mon=>mon?.shiny===true&&Number.isInteger(mon.id)&&MONS.has(mon.id));
        if(!enemies.length)return null;
        return{chapter:adv.chapter,node:adv.node,enemies,key:JSON.stringify([adv.chapter,adv.node,adv.runs||0,enemies.map(mon=>[mon.id,mon.uid??null,mon.level??null])])};
    }
    function nodeWeather(s,chapter,node,now=Date.now()) {
        if(!node)return null;
        if(node.weather!==undefined)return node.weather;
        if(node.indoor)return null;
        const sky=chapterWeather(s,chapter,now);if(sky.source!=='natural')return sky.key;
        const allowed=key=>node.climate?.[key]&&!(phaseAt(s,now,chapter)==='night'&&WEATHER_DATA.types[key]?.daylight);
        return allowed(sky.key)?sky.key:(WEATHER_DATA.translate[sky.key]||[]).find(allowed)||null;
    }
    function weatherDamageContext(s,chapter=s?.adv?.chapter,now=Date.now(),node=null) {
        // A chapter's aggregate sky must never be applied to every indoor/translated
        // encounter. With no explicit node, retain only the native night modifier.
        const key=nodeWeather(s,chapter,node,now),night=phaseAt(s,now,chapter)==='night';
        return Object.fromEntries(Object.keys(DATA.types).map(type=>[type,(node?.weatherDamage?(node.weatherDamage[type]??1):(WEATHER_DATA.types[key]?.damage?.[type]??1))*(night?WEATHER_DATA.nightDamage[type]??1:1)]));
    }
    function captured(s, id) {
        // Historical captures survive evolution, trading, daycare and release.
        return Number(s.dex?.[id]?.caught) > 0 || (s.mons || []).some(m => m.id === id) ||
            (s.pension?.mons || []).some(m => m.mon?.id === id) ||
            (s.link?.stash?.mons || []).some(m => m.id === id) ||
            (s.under?.slots || []).some(slot => (slot.mons || []).some(m => m.id === id));
    }
    function regionOfMon(id) {
        const base=MONS.get(id)?.root||id;
        return DATA.regions.find(r=>r.dexRange&&base>=r.dexRange[0]&&base<=r.dexRange[1])?.key||
            (base<=151?'kanto':base<=251?'johto':base<=386?'hoenn':base<=493?'sinnoh':null);
    }
    function dexStatus(s, settings) {
        const open = new Set(['kanto', ...(s.travel?.to || []), currentRegion(s)]);
        const roots = ROOTS.filter(m => settings.region === 'all' ? open.has(regionOfMon(m.id)) : regionOfMon(m.id) === currentRegion(s));
        const missing = roots.filter(m => !captured(s, m.id));
        return { roots, missing, complete: roots.length - missing.length, ids: new Set(missing.map(m => m.id)) };
    }
    function availableChapters(s, settings, replay = false) {
        const open = new Set(['kanto', ...(s.travel?.to || [])]);
        const reg = currentRegion(s); open.add(reg);
        return DATA.chapters.filter(c => open.has(c.reg) && (settings.region === 'all' || c.reg === reg) &&
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
    function teamFingerprint(s) {
        const index = new Map((s.mons || []).map(m => [m.uid, m]));
        // Coarse level buckets allow useful history while rejecting a different party.
        return (s.team || []).map(uid => index.get(uid)).filter(Boolean).map(m => `${m.id}:${Math.floor(m.level / 10)}:${m.rank || 0}:${+!!m.shiny}:${m.statMult||1}:${m.hpMult||1}:${+!!(m.level>=trainingCap(s,m))}:${tasteProfile(m)}`).join(',');
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
    function metricsKey(s, row, settings,now=Date.now()) { return `e4|${economicRegion(s)}|${yieldFingerprint(s,now)}|${teamFingerprint(s)}|sw${helperSwitchEnabled(s,settings)?'helper':+(s.autoSwitch!==false)}|${settings.speed}|${row.key}|u${s.adv.unlocked}`; }
    function estimateRate(row) { return row.reward / Math.max(20, row.units * 2.8 / 2.5) * 60; }
    function moneyRanking(s, settings, metrics = {}, cooldowns = {}, now = Date.now()) {
        return candidates(s, settings, true).filter(c => (cooldowns[c.key] || 0) <= now).map(row => {
            const m = metrics[metricsKey(s, row, settings,now)];
            const measured = m?.seconds > 0 && m?.runs > 0;
            const factor = moneyFactor(s,row);
            const battleFit = battleRouteFit(s,row,s.team||[],now);
            const coverage = battleFit.coverage==null ? 1 : Math.min(1,Math.max(0,battleFit.coverage));
            // Slow victories and an inability to finish encounters are separate costs.
            // A difficulty floor must not promise a full route reward to a losing party.
            const rate = measured ? m.net / m.seconds * 60 : estimateRate(row) * factor*(activeYieldBuff(s,'money',now)?.mult||1)*battleFit.factor*coverage;
            return { ...row, rate, battleFit, measured, samples: m?.runs || 0, seconds: m?.seconds || 0 };
        }).sort((a, b) => b.rate - a.rate || a.id - b.id);
    }

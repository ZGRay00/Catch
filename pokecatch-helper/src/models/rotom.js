    const ROTOM_BY_ID=new Map(),ROTOM_BY_CHAPTER=new Map();
    for(const source of ROTOM_DATA.sources){
        const node=WEATHER_DATA.chapters[source.chapter].nodes.find(n=>n.kind==='route'&&n.name===source.name);
        const entry={...source,node};
        ROTOM_BY_ID.set(source.id,entry);
        if(!ROTOM_BY_CHAPTER.has(source.chapter))ROTOM_BY_CHAPTER.set(source.chapter,[]);
        ROTOM_BY_CHAPTER.get(source.chapter).push(entry);
    }
    const ROTOM_PLACES={479:'森之洋馆',47901:'227号道路',47902:'213号道路',47903:'217号道路',47904:'山谷发电厂',47905:'自豪的庭院'};
    function rotomReceipts(s,targets){
        return targets.filter(id=>ROTOM_BY_ID.has(id)&&s.adv.gifts?.[ROTOM_BY_ID.get(id).once]);
    }
    function rotomWildWeight(s,source,now){
        if(!s.adv.gifts?.[source.once]||!source.node)return 0;
        const phase=phaseAt(s,now,source.chapter),sky=nodeWeather(s,source.chapter,source.node,now)||'clear';
        let refs=source.variants.base;
        for(const [key,choices] of Object.entries(source.variants)){
            if(key!=='base'&&weatherDailySpot(WEATHER_DATA.dailySpots[key],now)===source.name){refs=choices;break;}
        }
        const idx=SEASON_KEYS.indexOf(weatherSeason(now))*3+WILD_PHASES.indexOf(phase);
        return ROTOM_DATA.tables[refs[idx]]?.[sky]||0;
    }
    function remainingRotom(s){
        const a=s.adv,found=[];
        if(!ROTOM_BY_CHAPTER.has(a.chapter)||a.event||a.zone||a.league||a.tower||
            !Array.isArray(a.nodes)||!Number.isInteger(a.node)||a.node<0)return found;
        for(let i=a.node;i<a.nodes.length;i++){
            const n=a.nodes[i];
            if(n?.type!=='static')continue;
            const source=ROTOM_BY_ID.get(n.id);
            if(source?.chapter===a.chapter&&source.once===n.once&&!a.gifts?.[n.once])found.push(n.id);
        }
        return found;
    }
    function rotomRouteExhausted(s,row,settings,now){
        const a=s.adv;
        if(settings.mode!=='dex'||!settings.dexSpecies?.length||row.members?.length!==1||a.chapter!==row.id||
            !row.targets?.length||row.targets.some(hit=>hit.kind!=='rotomStatic')||
            a.battle||a.pending||a.paused||a.event||a.zone||a.league||a.tower||
            !Number.isInteger(a.node)||a.node<0||!Array.isArray(a.nodes)||a.node>=a.nodes.length)return false;
        const targets=new Set(row.targets.map(hit=>hit.id));
        for(const id of settings.dexSpecies)if(ROTOM_BY_ID.has(id)&&!captured(s,id))targets.add(id);
        if(remainingRotom(s).some(id=>targets.has(id)))return false;
        for(let i=a.node;i<a.nodes.length;i++){
            const n=a.nodes[i];
            if(!n||typeof n.type!=='string'||n.shiny||n.roamer)return false;
        }
        return CHAPTERS.get(row.id).special.some(spec=>spec.kind==='static'&&targets.has(spec.id)&&
            ROTOM_BY_ID.has(spec.id)&&specialAvailable(s,spec,now,row.id));
    }

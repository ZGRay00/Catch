    const DAILY_BASE_MODES=new Set(['money','train','dex','shiny','item','legend']);
    function migrateDailyResume(resume){
        if(resume?.daily?.base?.mode!=='raid')return resume;
        const base={...normalizeSettings(resume.daily.base),mode:'legend',dailyMain:'legend'};
        // Keep the original wallet and item limits, but discard the former raid's pending UI actions.
        const {started,startMoney,walletScope,oldLoops}=resume.session||{};
        const checkpoint={session:{started,startMoney,walletScope,oldLoops},budget:resume.budget};
        const daily={...resume.daily,base,checkpoint,checking:true};
        if(daily.job)return {...resume,daily};
        return {...checkpoint,account:resume.account,build:resume.build,layout:resume.layout,
            at:resume.at,wanted:resume.wanted,settings:base,daily};
    }
    function dailyMainMode(settings){
        return !settings.dailyMain||settings.dailyMain==='current'?settings.mode:settings.dailyMain;
    }
    function dailyCaptureWindow(s,base,now,id=null){
        const targets=id?[id]:base.dexSpecies;
        if(!targets?.length)return null;
        const cfg={...base,mode:'dex',dexSpecies:targets};
        const status=dexStatus(s,cfg),missing=status.missing.map(mon=>mon.id);
        if(!missing.length)return null;
        const wanted=dexSearchIds(s,cfg,status);
        for(const egg of s.pension?.eggs||[])wanted.delete(egg.id);
        const opportunity=dexDayWindows(s,cfg,wanted,now).filter(w=>w.at<=now&&w.until>now).sort((a,b)=>a.until-b.until)[0];
        if(opportunity)return{kind:'window',until:opportunity.until,settings:{mode:'dex',dexSpecies:[opportunity.id],afterDex:'stop',progress:false,legends:false,raids:false}};
        // Only interrupt for a currently available target that loses its known wild
        // sources at the next boundary. An ordinary all-day source can wait.
        let until=Math.min((Math.floor(now/WEATHER_DATA.slotMs)+1)*WEATHER_DATA.slotMs,seasonWindow(now).endsAt);
        for(const hour of [8,10,20]){
            const phaseChange=new Date(now).setHours(hour,0,0,0);
            if(phaseChange>now)until=Math.min(until,phaseChange);
        }
        const maps=candidates(s,cfg).filter(row=>!row.league&&row.members.some(ch=>missing.some(species=>WILD_HABITATS.get(ch)?.has(species))));
        for(const row of maps)for(const ch of row.members){
            const weatherEnd=chapterWeather(s,ch,now).until;
            if(weatherEnd>now)until=Math.min(until,weatherEnd);
        }
        const available=at=>{
            const found=new Set();
            for(const row of maps){
                if(!huntRouteMatches(s,cfg,row,at))continue;
                for(const ch of row.members){
                    const pool=weatherEncounterPool(s,ch,at);
                    for(const species of missing)if(pool?.get(species)>0)found.add(species);
                }
            }
            return found;
        };
        const current=available(now);if(!current.size)return null;
        const later=available(until);
        const species=missing.find(target=>current.has(target)&&!later.has(target));
        return species?{kind:'window',until,settings:{mode:'dex',dexSpecies:[species],afterDex:'stop',progress:false,legends:false,raids:false}}:null;
    }
    function dailyFacility(s,base,marks,now){
        const open=kind=>!(marks[kind]>now),end=nextParisReset(now),day=parisDay(now);
        if(base.dailyCandy&&open('candy')&&(s.candy?.run||s.candy?.played!==day&&s.candy?.last?.day!==day))
            return {kind:'candy',until:end,settings:{mode:'candy',candyRuns:1,candyFloor:0}};
        if(base.dailyTower){
            const tower=towerProgress(s,now);
            if(tower.run||open('tower')&&tower.best<base.towerFloor)
                return {kind:'tower',until:end,settings:{mode:'tower',towerRuns:1}};
        }
        const edition=s.wb?.tryEd||s.wb?.ed;
        if(base.dailyWorld&&open('world')&&!(edition&&s.wb?.caught===edition))
            return {kind:'world',until:end,settings:{mode:'world',worldActions:1,worldCapture:true}};
        if(base.dailyElite&&open('elite')&&undergroundBackgroundUnlocked(s)){
            const reg=base.eliteRegion==='current'?currentRegion(s):base.eliteRegion;
            const best=s.eliteLeague?.[reg]?.t||0;
            if(best<5&&RAID_CHAMPIONS.some(c=>c.reg===reg&&(s.adv.unlocked>c.id||c.badges.some(b=>s.adv.badges?.includes(b)))))
                return {kind:'elite',until:end,settings:{mode:'elite',eliteRegion:reg,eliteTier:best+1}};
        }
        return null;
    }

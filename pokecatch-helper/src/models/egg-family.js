    const eggFamilyRoots=new Map(),eggFamilyRegions=new Map(),giftEggHomes=new Map();
    for(const mon of DATA.mons){
        let root=mon.id;
        while(NURSERY_LINEAGE.prevo[root])root=NURSERY_LINEAGE.prevo[root];
        if(mon.season)root=mon.root;
        eggFamilyRoots.set(mon.id,root);
        if(!eggFamilyRegions.has(root))eggFamilyRegions.set(root,[]);
        const number=mon.num??NURSERY_LINEAGE.numbers[mon.id]??mon.id;
        eggFamilyRegions.get(root).push(DATA.regions.find(r=>r.dexRange&&number>=r.dexRange[0]&&number<=r.dexRange[1])?.key);
    }
    // Both alternate Burmy lines can evolve into the same Mothim. It adds
    // a slot to each line, while owned Mothim belong to the plant-cloak line.
    for(const root of [41201,41202])eggFamilyRegions.get(root).push('sinnoh');
    // Legacy gift eggs can carry a native place name without a home region.
    for(const chapter of DATA.chapters){
        for(const node of WEATHER_DATA.chapters[chapter.id]?.nodes||[]){
            if(node.kind==='egg')giftEggHomes.set(node.name,chapter.reg);
        }
    }
    for(const name of ['Chenal 220','Chenal 223','Chenal 226'])giftEggHomes.set(name,'sinnoh');
    for(const route of UNOVA_ENCOUNTERS.routes)if(route.egg)giftEggHomes.set(route.name,CHAPTERS.get(route.chapter).reg);
    function hatchingSpecies(s,egg,now){
        if(egg.id!==351)return egg.id;
        // The daycare has its own weather seed and ignores the chapter and roamer overrides.
        const reg=currentRegion(s),open=s.adv?.unlocked>=31&&s.travel?.to?.includes('hoenn');
        const climate=open?{rain:2,sun:2,storm:.5,snow:1}:['kanto','johto'].includes(reg)?{rain:2,storm:.5}:{rain:2,sun:reg==='sinnoh'?1:2,storm:.5};
        const sky=naturalWeatherKey('Parc de la pension',climate,Math.floor(now/WEATHER_DATA.slotMs),phaseAt(s,now)==='night');
        return ({sun:35101,rain:35102,storm:35102,snow:35103})[sky]||351;
    }
    function shinyEggFamilyLimit(s,egg,now){
        const species=hatchingSpecies(s,egg,now),root=eggFamilyRoots.get(species);
        if(root===undefined)return '';
        const open=new Set(['kanto',...(s.travel?.to||[])]);
        const limit=1+eggFamilyRegions.get(root).filter(reg=>open.has(reg)).length;
        const home=monRegion({reg:egg.reg||giftEggHomes.get(egg.place)||currentRegion(s)}),to=s.link?.to;
        const family=mon=>mon?.shiny&&eggFamilyRoots.get(mon.id)===root&&(!to||(monRegion(mon)===to)===(home===to));
        // Match the native family pool, including escrow and expedition members.
        const owned=[...(s.mons||[]),...(s.pension?.mons||[]).map(slot=>slot?.mon),
            ...(s.under?.slots||[]).flatMap(slot=>slot?.mons||[]),s.tradeOut?.mon,s.tradeIn?.mon,...(s.mktOut||[]).map(row=>row?.mon)];
        const count=owned.filter(family).length;
        return count>=limit?`${MONS.get(species).name}闪蛋 · 异色家族已满（${count}/${limit}）`:'';
    }
    function eggHatchPlan(s,eggs,now){
        const eligible=[],shiny=[],blocked=new Map();
        const options=eggs.length?nurseryRuntimeOptions():null;
        for(const egg of eggs){
            if(eggOutcome(s,egg,options).shiny===true){
                const reason=shinyEggFamilyLimit(s,egg,now);
                if(reason){blocked.set(egg,reason);continue;}
                shiny.push(egg);
            }
            eligible.push(egg);
        }
        return {eligible,shiny,blocked};
    }

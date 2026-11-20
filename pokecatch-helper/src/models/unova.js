    const UNOVA_PLACES = {
        'Vestiges du Rêve':'梦之遗迹','Veine Souterraine':'地下水脉之穴',"Forêt d'Empoigne":'矢车森林',
        "Forêt d'Empoigne (est)":'矢车森林东部','Désert Délassant':'沙漠地带','Château Enfoui':'古代城',
        'Pont Yoneuve':'帆巴吊桥','Hangar Frigorifique':'冷冻仓库','Grotte Électrolithe':'电气石洞穴',
        'Grotte Parsemille':'吹寄洞穴','Tour des Cieux':'天堂之塔','Mont Foré':'罗斯山',
        'Tourbière Flocombe':'雪花湿地','Tour Dragospire':'龙螺旋之塔','Route Victoire':'冠军之路',
        'Pont du Hameau':'村庄桥','Baie Vaguelone':'涟漪湾','Forêt Blanche':'白色森林',
        'Bois des Illusions':'迷幻森林','Grotte Cyclopéenne':'巨人洞窟'
    };
    const UNOVA_SOURCE_INDEX = new Map(), UNOVA_WILD_IDS = new Set();
    const unovaPlaces = new Map();
    for(const route of UNOVA_ENCOUNTERS.routes){
        // Victory Road contains two eligible blocks with the same place name.
        const placeKey=JSON.stringify([route.chapter,route.name,route.phenomenon]);
        const repeated=unovaPlaces.get(placeKey);
        if(repeated){repeated.blocks++;continue;}
        const place={...route,blocks:1};
        unovaPlaces.set(placeKey,place);
        const weights=UNOVA_ENCOUNTERS.weights[route.phenomenon];
        const wildIds=new Set([weights,...Object.values(route.weatherWeights||{})].flatMap(pool=>Object.keys(pool).map(Number).filter(Number.isInteger)));
        for(const id of [...wildIds,...(route.egg?[route.egg.id]:[])]){
            if(!UNOVA_SOURCE_INDEX.has(id))UNOVA_SOURCE_INDEX.set(id,[]);
            UNOVA_SOURCE_INDEX.get(id).push(place);
        }
        for(const id of wildIds)UNOVA_WILD_IDS.add(id);
    }
    function unovaAcquisitionSources(s,id,now=Date.now(),useLiveNodes=true,shinyOnly=false){
        const routes=UNOVA_SOURCE_INDEX.get(id);
        if(!routes)return [];
        const a=s.adv||{},regionOpen=currentRegion(s)==='unova'||s.travel?.to?.includes('unova');
        const rollChance=(UNOVA_ENCOUNTERS.chance[0]+UNOVA_ENCOUNTERS.chance[1])/2;
        const pendingNodes=useLiveNodes&&!a.event&&!a.zone&&!a.league&&!a.tower&&Array.isArray(a.nodes)
            ? a.nodes.slice(Math.max(0,a.node||0)) : [];
        const sources=routes.map(route=>{
            const kind=route.egg?.id===id?'lootEgg':'phenomenon';
            const number=/^Route (\d+)(?: \((est|nord)\))?$/.exec(route.name);
            const nodeName=number?number[1]+'号道路'+({est:'东部',nord:'北部'}[number[2]]||''):UNOVA_PLACES[route.name]||route.name;
            const node=WEATHER_DATA.chapters[route.chapter]?.nodes.find(n=>n.kind==='route'&&n.name===route.name);
            const sky=nodeWeather(s,route.chapter,node,now);
            const actualNodes=a.chapter===route.chapter?pendingNodes.filter(n=>n.name===route.name):[];
            const target={kind,chapter:route.chapter,nodeName,originalName:route.name,id,marked:false,timeLimited:!!(route.day||route.night)};
            let reason=!regionOpen?'尚未进入合众':route.chapter>a.unlocked?'章节尚未解锁':'',weight;
            if(kind==='lootEgg'){
                const egg=route.egg,incubator=s.pension?.eggs||[];
                const liveItems=actualNodes.filter(n=>n.type==='item'&&!n.find&&n.loot?.['egg:'+id]&&egg.skies.includes(nodeWeather(s,route.chapter,n,now)));
                Object.assign(target,{badge:egg.badge,skies:egg.skies,chance:egg.chance});
                if(!reason){
                    if(incubator.some(e=>e.id===id))reason='已在孵化器，等待孵化';
                    else if(a.gifts?.['egg:'+id])reason='本存档已领取一次性赠蛋';
                    else if(!a.badges?.includes(egg.badge))reason='需要合众冠军徽章';
                    else if(incubator.length>=Math.max(1,s.pension?.open?.eggs||1))reason='孵化器已满';
                    else if(!liveItems.length&&!egg.skies.includes(sky))reason='等待沙漠地带出现大晴天';
                }
                target.marked=!reason&&liveItems.length>0;
                // With one ordinary and one possible phenomenon item, either node can award the one-off egg.
                weight=target.marked ? 1-(1-egg.chance)**liveItems.length :
                    1-(1-UNOVA_ENCOUNTERS.itemNodeChance*egg.chance)*(1-rollChance*UNOVA_ENCOUNTERS.itemFraction*egg.chance);
            }else{
                const base=UNOVA_ENCOUNTERS.weights[route.phenomenon],conditional=route.weatherWeights||{};
                const directShare=bonus=>((base[id]||0)+(bonus?.[id]||0))/
                    [...Object.values(base),...Object.values(bonus||{})].reduce((sum,n)=>sum+n,0);
                const shares=actualNodes.filter(n=>n.type==='wild'&&!n.roamer&&n.phenom===route.phenomenon)
                    .filter(n=>n!==a.nodes?.[a.node]||a.battle?.kind!=='wild'||!a.battle.enemies?.length||
                        a.battle.enemies.some(mon=>mon.id===id&&(!shinyOnly||mon.shiny)))
                    .map(n=>directShare(n.phenomW?.[nodeWeather(s,route.chapter,n,now)]))
                    .filter(share=>share>0);
                const share=directShare(conditional[sky]);
                target.chance=shares[0]||share;
                target.phenomenon=route.phenomenon;
                target.skies=base[id]?[]:Object.keys(conditional).filter(key=>conditional[key][id]);
                target.marked=shares.length>0&&!reason;
                if(!reason&&!target.marked&&!share)reason='等待现象所需天气';
                if(!reason&&!target.marked&&route.day&&phaseAt(s,now,route.chapter)==='night')reason='此路段只在白天生成';
                if(!reason&&!target.marked&&route.night&&phaseAt(s,now,route.chapter)!=='night')reason='此路段只在夜间生成';
                weight=target.marked?shares.reduce((sum,n)=>sum+n,0):route.blocks*rollChance*(1-UNOVA_ENCOUNTERS.itemFraction)*share;
            }
            return {...target,available:!reason,reason,weight:reason?0:weight};
        });
        // The native Desert Resort habitat enables its sun-only wild entry after the egg quest.
        if(id===636&&a.gifts?.['egg:636']&&!shinyOnly){
            const egg=sources.find(source=>source.kind==='lootEgg');
            if(egg){
                const node=WEATHER_DATA.chapters[egg.chapter]?.nodes.find(n=>n.kind==='route'&&n.name===egg.originalName);
                const available=regionOpen&&egg.chapter<=a.unlocked&&egg.skies.includes(nodeWeather(s,egg.chapter,node,now));
                sources.push({...egg,kind:'questWild',marked:false,available,weight:available ? .01 : 0,chance:undefined,
                    reason:!regionOpen?'尚未进入合众':egg.chapter>a.unlocked?'章节尚未解锁':available?'':'等待沙漠地带出现大晴天'});
            }
        }
        return sources;
    }

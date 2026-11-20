    function legendProgress(s, settings) {
        const zone = DATA.zones.find(z => z.id === settings.legendId);
        if (!zone) return { missing: true };
        const tier = Number(s.elite?.[zone.id]?.t) || 0;
        const forms=zone.forms?.length?zone.forms:[zone.id],missingForms=forms.filter(id=>!captured(s,id)),got=!missingForms.length;
        return { zone, tier, forms, missingForms, captured: got, done: settings.legendTier > 0 ? tier >= settings.legendTier : got, nextTier: Math.min(5,tier + 1), roaming:!!zone.eliteOnly };
    }
    // Public Roaming snapshot: positions are read from the native save; never predict
    // or write a random destination, and never count a visual encounter as a capture.
    const ROAMING_DATA=Object.freeze({build:'1a16948eef',level:100,stayMinutes:15,catchRate:.04,groups:[
        {reg:'johto',badge:'Maître Johto',ids:[243,244,245]},
        {reg:'hoenn',badge:'Maître Hoenn',ids:[380,381]},
        {reg:'sinnoh',badge:'Maître Sinnoh',ids:[481]},
        {reg:'unova',badge:'Maître Unys',ids:[641,642]},
    ]});
    function roamingSettings(settings){
        const zone=settings.mode==='legend'&&!settings.legendTier&&DATA.zones.find(zone=>zone.id===settings.legendId&&zone.eliteOnly);
        return zone?{...settings,roamId:zone.id,roamMinutes:settings.legendMinutes}:settings;
    }
    function roamingProgress(s,settings,now=Date.now()){
        settings=roamingSettings(settings);
        const target=MONS.get(Number(settings.roamId)),group=ROAMING_DATA.groups.find(group=>group.ids.includes(target?.id));
        if(!group)return{missing:true,target:null,group:null,captured:false,unlocked:false,location:null,done:false};
        const got=captured(s,target.id)||(s.roam?.caught||[]).includes(target.id),open=new Set(['kanto',...(s.travel?.to||[]),currentRegion(s)]);
        const unlocked=!!s.adv?.badges?.includes(group.badge)&&open.has(group.reg),raw=s.roam?.at?.[target.id],chapter=CHAPTERS.get(Number(raw?.ch));
        const location=unlocked&&chapter?.reg===group.reg&&!chapter.league&&chapter.id<=s.adv.unlocked&&Number(raw.until)>now?{ch:chapter.id,until:Number(raw.until)}:null;
        return{target,group,captured:got,unlocked,location,done:got};
    }
    function roamingPlan(s,settings,now=Date.now()){
        settings=roamingSettings(settings);const progress=roamingProgress(s,settings,now);
        if(!progress.target||progress.done||!progress.unlocked)return{...progress,row:null,marked:false,restart:false};
        const index=(s.adv.nodes||[]).findIndex(node=>Number(node.roamer)===progress.target.id),active=s.adv.battle?.roam===progress.target.id;
        const marked=active||index>=Number(s.adv.node||0)&&index>=0;
        // A previously generated native roaming node stays a valid encounter even
        // after its map marker moves. Finish that node before chasing the new marker.
        const chapter=marked?CHAPTERS.get(s.adv.chapter):CHAPTERS.get(progress.location?.ch),valid=chapter?.reg===progress.group.reg&&!chapter.league&&chapter.id<=s.adv.unlocked;
        const row=valid?{...chapter,key:String(chapter.loop),members:[chapter.id],roamId:progress.target.id}:null;
        return{...progress,row,marked,index,active,restart:!!row&&row.id===s.adv.chapter&&!marked&&Number(s.adv.node)>0};
    }
    function specialBlockReason(s,special,now,chapter){
        if(special.once&&s.adv.gifts?.[special.once])return '已领取一次性奖励';
        if(special.after&&!s.adv.gifts?.[special.after])return '需要先完成前置事件';
        if(special.needs&&(Number(s.items?.[special.needs])||0)<(special.needN||1))return `需要 ${special.needN||1} 个${ITEMS.get(special.needs)?.name||special.needs}`;
        const phase=phaseAt(s,now,chapter);
        if(special.night&&phase!=='night')return '需在夜间前往';
        if(special.day&&phase==='night')return '需在白天前往';
        if(special.skies?.length){const node=WEATHER_DATA.chapters[chapter]?.nodes.find(node=>node.kind==='static'&&node.id===special.id&&(!special.once||node.once===special.once));if(!special.skies.includes(node?nodeWeather(s,chapter,node,now):chapterWeather(s,chapter,now).key))return '地点天气条件尚未满足';}
        if(special.caught?.some(id=>!s.dex?.[id]))return '需先登记前置宝可梦';
        return '';
    }
    function specialAvailable(s,special,now=Date.now(),chapter=s?.adv?.chapter){
        return !specialBlockReason(s,special,now,chapter);
    }
    const FOSSIL_NAMES = {'old-amber':'秘密琥珀','helix-fossil':'贝壳化石','dome-fossil':'甲壳化石',
        'root-fossil':'根状化石','claw-fossil':'爪子化石','skull-fossil':'头盖化石','armor-fossil':'盾甲化石',
        'cover-fossil':'背盖化石','plume-fossil':'羽毛化石'};
    function acquisitionSources(s,id,now=Date.now()){
        if(!s?.adv||!MONS.has(id))return [];
        const result=[],unlocked=new Set(availableChapters(s,{region:'all'}).map(c=>c.id));
        const eggs=s.pension?.eggs||[],full=eggs.length>=Math.max(1,Number(s.pension?.open?.eggs)||1);
        if(eggs.some(egg=>egg.id===id)){
            const ready=eggs.some(egg=>egg.id===id&&Number.isFinite(egg.hatchAt)&&now>=egg.hatchAt);
            result.push({kind:'incubating',chapter:null,place:'培育屋',available:ready,detail:ready?'已有成熟蛋，可领取后登记图鉴':'目标蛋正在孵化，领取后登记图鉴'});
        }
        for(const c of DATA.chapters){
            const add=(kind,detail,block='',extra={})=>result.push({kind,chapter:c.id,place:c.name,available:unlocked.has(c.id)&&!block,...extra,
                detail:[!unlocked.has(c.id)&&'章节未开放',block,detail].filter(Boolean).join(' · ')});
            const habitat=WILD_HABITATS.get(c.id)?.get(id);
            if(habitat){
                const phases={morning:'清晨',day:'白天',night:'夜间'};
                const times=WILD_PHASES.filter(phase=>habitat.phases.has(phase));
                const daily=!habitat.ordinary;
                const location=daily&&[...habitat.rotations].some(i=>WEATHER_DATA.dailySpots[i]?.honey)?'每日轮换的涂蜜树':
                    daily?'每日轮换的出没地点':'普通野生遭遇';
                const seasons=SEASON_KEYS.filter((_,index)=>habitat.seasonMask&(1<<index));
                const seasonal=habitat.seasonMask!==15;
                const detail=[location,seasonal&&seasons.map(key=>SEASON_NAMES[key]).join('、')+'限定',
                    times.length<3&&times.map(phase=>phases[phase]).join('、')].filter(Boolean).join(' · ');
                const active=currentWildPool(s,c.id,now).get(id)>0;
                let block=active?'':daily?'等待本章轮换地点和出没条件':'等待出没时段或天气';
                if(seasonal&&!seasons.includes(weatherSeason(now))){
                    let next=seasonWindow(now);
                    do { next=seasonWindow(next.endsAt); } while(!seasons.includes(next.key));
                    block=next.name+'从 '+new Date(next.startsAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' 开始';
                }
                add('wild',detail,block,{seasons});
            }
            for(const gift of c.gifts){
                if(!gift.ids.includes(id))continue;
                const blocked=s.adv.gifts?.[gift.key]?'本次赠送已领取':gift.badge&&!s.adv.badges?.includes(gift.badge)?'需要前置徽章':
                    !giftChoices(s,gift).includes(id)?'初始伙伴决定的本次赠送不含此物种':'';
                add('gift','章节赠送',blocked);
            }
            for(const special of c.special){
                const offer=special.offers?.find(([,species])=>species===id);
                if(offer){
                    const item=FOSSIL_NAMES[offer[0]]||ITEMS.get(offer[0])?.name||offer[0];
                    add('trade','使用'+item+'复原化石',ownedItems(s,offer[0])>0?'':'缺少'+item);
                    if(Object.hasOwn(FOSSIL_NAMES,offer[0])){
                        const region=DATA.regions.find(region=>region.key===c.reg);
                        const open=(c.reg==='kanto'||s.travel?.to?.includes(c.reg))&&s.adv.unlocked>=region.start;
                        const registered=c.reg!=='unova'||DATA.mons.some(mon=>mon.root===id&&s.dex?.[mon.id]);
                        const gate=!s.adv.badges?.includes('Forêt')?'需要神奥森林徽章':
                            !open?'需先开放'+region.name:!registered?'合众化石需先登记本进化链的任一形态，可与其他玩家交换':'';
                        result.push({kind:'underground',chapter:null,place:'地下通道',available:!gate,
                            detail:[gate,'从第 75 层起随机获得，返程领取时直接取得宝可梦'].filter(Boolean).join(' · ')});
                    }
                }
                if(![].concat(special.id||[]).includes(id))continue;
                const block=specialBlockReason(s,special,now,c.id);
                if(special.kind==='static')add('static','固定遭遇',block);
                if(special.kind==='egg')add('egg',Array.isArray(special.id)?'一次性随机赠蛋':'章节赠蛋',block||(full?'孵化器已满':''));
            }
        }
        const phenomena={ripple:'水面波纹',grass:'晃动的草丛',dust:'尘土',shadow:'桥上阴影'};
        for(const source of unovaAcquisitionSources(s,id,now)){
            const detail=source.kind==='questWild'?'取得沙漠赠蛋后，大晴天还可在此地野生遇见':source.kind==='lootEgg'
                ? `获得合众冠军徽章后，大晴天在此地点探索道具节点有 ${Math.round(source.chance*100)}% 概率获得一次性赠蛋`
                : `${phenomena[source.phenomenon]}触发野生遭遇时，当前天气下直接抽中${MONS.get(id).name}的概率为 ${Math.round(source.chance*1000)/10}%`;
            const marked=source.marked?(source.kind==='lootEgg'?'当前路线已生成道具节点':'当前路线已生成此现象'):'';
            result.push({...source,place:source.nodeName,detail:[detail,source.reason||marked].filter(Boolean).join(' · ')});
        }
        for(const [from,rules] of Object.entries(EVOLUTION_DATA.rules)){
            for(const rule of rules.filter(edge=>edge.to===id)){
                const species=Number(from),members=(s.mons||[]).filter(mon=>mon.id===species).sort((a,b)=>(a.rank||0)-(b.rank||0)||b.level-a.level);
                const checks=members.map(mon=>evolutionStatus(s,mon,{now},rule)),available=checks.some(check=>check.rule);
                let detail=rule.item==='link-cable'?'交换进化':(rule.level?'Lv.'+rule.level:evolutionItemAccess(s,rule.item).name)+' 进化';
                const time=EVOLUTION_DATA.time[id];
                if(time)detail+=' · '+(time==='night'?'夜间':'白天');
                if(rule.party)detail+=' · 同行队友需要'+(MONS.get(rule.party)?.name||rule.party);
                if(!members.length)detail+=' · 需先取得前置形态';
                else if(!available)detail+=' · '+checks[0].reason;
                else if(rule.item||rules.length>1)detail+=' · 可手动进化';
                result.push({kind:'evolution',chapter:null,place:MONS.get(species)?.name||String(species),fromId:species,available,detail});
            }
        }
        const residents=(s.pension?.mons||[]).map(slot=>slot.mon).filter(Boolean);
        const parents=[...residents,...(s.mons||[])].filter(mon=>mon.id!==id&&breedableOffspring(s,mon)===id);
        if(parents.length){
            const plan=pensionPlan(s,id);
            const parentNames=[...new Set(parents.map(mon=>MONS.get(mon.id)?.name||mon.id))];
            result.push({kind:'breed',chapter:null,place:'培育屋',available:!plan.missing&&!full,
                detail:parentNames.join('、')+' 可与百变怪培育此物种的蛋'+(plan.missing?' · '+plan.missing:full?' · 孵化器已满':' · 可使用繁殖任务')});
        }
        for(const zone of DATA.zones.filter(z=>!z.eliteOnly&&(z.forms||[z.id]).includes(id))){
            result.push({kind:'legend',chapter:null,place:zone.name,available:false,detail:(zone.condition||'传说战')+' · 开放状态以游戏地图为准'});
        }
        const roam=roamingProgress(s,{roamId:id},now);
        if(roam.target)result.push({kind:'roam',chapter:roam.location?.ch??null,place:DATA.regions.find(r=>r.key===roam.group.reg).name,
            available:!!roam.location,detail:roam.location?'游荡中 · '+CHAPTERS.get(roam.location.ch).name:roam.unlocked?'等待在线游荡出现':'取得本地区冠军后开放游荡'});
        return result.sort((a,b)=>Number(b.available)-Number(a.available));
    }
    const giftEggParents=new Map();
    for(const {egg} of UNOVA_ENCOUNTERS.routes){
        if(egg)for(const rule of EVOLUTION_DATA.rules[egg.id]||[])giftEggParents.set(rule.to,egg.id);
    }
    function dexSearchIds(s,settings,status){
        const wanted=new Set(status.ids);
        if(settings.dexSpecies?.length){
            for(const id of status.ids){
                const parent=giftEggParents.get(id);
                if(parent&&!captured(s,parent))wanted.add(parent);
            }
        }
        return wanted;
    }
    function markedDexSource(s,settings,now){
        if(!huntRegionMatches(s,settings,currentRegion(s))||!huntWeatherMatches(s,settings,s.adv.chapter,now))return null;
        if(currentRegion(s)!=='unova'||!s.adv.nodes?.length)return null;
        const nodes=s.adv.nodes.slice(s.adv.node||0);
        let missing;
        for(const [species,routes] of UNOVA_SOURCE_INDEX){
            const matches=routes.some(route=>route.chapter===s.adv.chapter&&nodes.some(node=>node.name===route.name&&
                (route.egg?.id===species?node.type==='item'&&!node.find&&node.loot?.['egg:'+species]:
                    node.type==='wild'&&!node.roamer&&node.phenom===route.phenomenon)));
            if(!matches)continue;
            missing??=dexSearchIds(s,settings,dexStatus(s,settings));
            if(!missing.has(species)||s.pension?.eggs?.some(egg=>egg.id===species))continue;
            const marked=unovaAcquisitionSources(s,species,now).find(source=>source.marked);
            if(marked)return marked;
        }
        return null;
    }
    const dexPrerequisites=[...new Set(DATA.chapters.flatMap(c=>c.special.flatMap(source=>source.caught||[])))];
    const branchedGifts=DATA.chapters.flatMap(c=>c.gifts.filter(gift=>gift.byStarter));
    const timedDexStatics=DATA.chapters.flatMap(c=>c.special.filter(spec=>spec.kind==='static'&&(spec.skies?.length||spec.night||spec.day)).map(spec=>({chapter:c.id,spec})));
    const timedUnovaIds=[...UNOVA_SOURCE_INDEX].filter(([id,routes])=>routes.some(r=>r.egg?.id===id||r.day||r.night||Object.values(r.weatherWeights||{}).some(weights=>weights[id]))).map(([id])=>id);
    let dexDayCache;
    function dexDayWindows(s,settings,wanted,now){
        const statics=timedDexStatics.filter(({spec})=>wanted.has(spec.id));
        const ids=timedUnovaIds.filter(id=>wanted.has(id));
        if(!ids.length&&!statics.length)return [];
        const signature=JSON.stringify([rankingEnvironment(s,settings,now),settings.dexWeather,ids,statics.map(({spec})=>[spec.id,s.items?.[spec.needs],spec.caught?.map(id=>!!s.dex?.[id])]),
            s.adv.badges,s.adv.gifts,s.pension?.eggs?.map(e=>e.id),s.pension?.open?.eggs,s.roam?.at,s.roam?.caught]);
        if(dexDayCache?.signature===signature&&now>=dexDayCache.from&&now<dexDayCache.until)return dexDayCache.windows;
        const chapters=new Set(availableChapters(s,settings).map(c=>c.id));
        const end=new Date(now).setHours(24,0,0,0);
        const times=[now,...huntBoundaries(s,chapters,now,end-1),end],windows=[],last=new Map();
        function record(id,chapter,place,at,until){
            const key=chapter+'|'+id+'|'+place,previous=last.get(key);
            if(previous?.until===at){previous.until=until;return;}
            const window={id,chapter,place,at,until};windows.push(window);last.set(key,window);
        }
        for(let i=0;i<times.length-1;i++){
            const at=times[i],until=times[i+1];
            for(const {chapter,spec} of statics){
                if(chapters.has(chapter)&&huntWeatherMatches(s,settings,chapter,at)&&specialAvailable(s,spec,at,chapter))
                    record(spec.id,chapter,CHAPTERS.get(chapter).name,at,until);
            }
            for(const id of ids)for(const source of unovaAcquisitionSources(s,id,at,false)){
                if(source.available&&chapters.has(source.chapter)&&huntWeatherMatches(s,settings,source.chapter,at)&&
                    (source.skies?.length||source.timeLimited))record(id,source.chapter,source.nodeName,at,until);
            }
        }
        dexDayCache={signature,from:now,until:times[1],windows};return windows;
    }
    function dexRanking(s, settings, cooldowns = {}, now = Date.now(), status = dexStatus(s, settings)) {
        const wanted=dexSearchIds(s,settings,status);
        for(const egg of s.pension?.eggs||[])wanted.delete(egg.id);
        const inputs=[huntRankingInputs(s,settings,[...wanted],now),settings.gifts,s.adv.gifts,s.adv.badges,s.items,s.roam?.at,
            settings.gifts&&Object.keys(FOSSIL_NAMES).map(item=>s.link?.stash?.items?.[item]||0),
            s.pension?.eggs?.length,s.pension?.open?.eggs,dexPrerequisites.map(id=>!!s.dex?.[id]),
            settings.gifts&&branchedGifts.map(gift=>giftChoices(s,gift))];
        return rankedRoutes('dex',inputs,()=>rankDexTargets(s,settings,wanted,now),cooldowns,now);
    }
    function rankDexTargets(s,settings,wanted,now){
        const specialByChapter=new Map();
        const openWindows=dexDayWindows(s,settings,wanted,now).filter(w=>w.at<=now&&now<w.until);
        const eggSpace=(s.pension?.eggs?.length||0)<Math.max(1,Number(s.pension?.open?.eggs)||1);
        for(const species of wanted){
            for(const source of unovaAcquisitionSources(s,species,now)){
                if(!source.available)continue;
                if(!specialByChapter.has(source.chapter))specialByChapter.set(source.chapter,[]);
                specialByChapter.get(source.chapter).push(source);
            }
        }
        return candidates(s, settings).filter(row=>huntRouteMatches(s,settings,row,now)).map(row => {
            const hits = new Map(); let score = 0,marked=false,hasWild=false,specialNodesOnly=true;
            for (const id of row.members) {
                const beforeOrdinarySources=score;
                const c = CHAPTERS.get(id);
                const phaseRows=c.pools[phaseAt(s,now,id)]||[];
                for (const [mon,weight] of currentWildPool(s,id,now)) {
                    if (!wanted.has(mon)||weight<=0) continue;
                    hasWild=true;
                    score += weight * Math.max(.08, MONS.get(mon).rate / 255);
                    const old = hits.get(mon);
                    const data=phaseRows.find(entry=>entry[0]===mon),normal=(data?.[2]||0)>0||!!old?.normal;
                    hits.set(mon, { id: mon, weather: normal?[]:data?.[3]||[], normal });
                }
                for (const gift of c.gifts) {
                    if (!settings.gifts || s.adv.gifts?.[gift.key] || gift.badge && !s.adv.badges?.includes(gift.badge)) continue;
                    const id = giftChoices(s,gift).find(id => wanted.has(id));
                    if (id) { score += 6; hits.set(id, { id, gift: true }); }
                }
                for (const special of c.special) {
                    if(special.kind==='trade'&&settings.gifts){
                        const offers=special.offers.filter(([item,species])=>wanted.has(species)&&ownedItems(s,item)>0);
                        if(offers.length)score+=6; // The native gift selector restores one fossil per visit.
                        for(const [,species] of offers)hits.set(species,{id:species,gift:true,kind:'trade'});
                    }else if(special.kind==='egg'&&eggSpace&&!s.adv.gifts?.[special.once]){
                        const options=[].concat(special.id),desired=options.filter(species=>wanted.has(species));
                        score+=desired.length/options.length;
                        for(const species of desired)hits.set(species,{id:species,special:true,kind:'egg'});
                    }else if(special.kind==='static'&&wanted.has(special.id)&&specialAvailable(s,special,now,id)){
                        score+=special.skies?.length ? .05 : Math.max(.05,special.chance||.5);
                        hits.set(special.id,{id:special.id,special:true});
                    }
                }
                if(score>beforeOrdinarySources)specialNodesOnly=false;
                for(const source of specialByChapter.get(id)||[]){
                    const egg=source.kind==='lootEgg';
                    if(source.kind==='questWild')specialNodesOnly=false;
                    hasWild ||= !egg;
                    const catchFactor=egg?1:Math.max(.08,MONS.get(source.id).rate/255);
                    score+=source.weight*catchFactor;
                    marked||=!!source.marked;
                    if(!hits.get(source.id)?.marked)hits.set(source.id,{id:source.id,special:true,kind:source.kind,place:source.nodeName,marked:!!source.marked});
                }
            }
            const window=openWindows.filter(w=>row.members.includes(w.chapter)&&hits.has(w.id)).sort((a,b)=>a.until-b.until)[0];
            const targets=[...hits.values()];
            const limitedWild=targets.some(hit=>hit.weather?.length||row.members.some(id=>{
                const h=WILD_HABITATS.get(id)?.get(hit.id);
                return h&&(!h.ordinary||h.phases.size<3||h.seasonMask!==15);
            }));
            const phenomenonOnly=targets.some(hit=>hit.kind==='phenomenon'&&!WILD_HABITATS.get(row.id)?.has(hit.id));
            const priority=window?3:limitedWild?2:phenomenonOnly?1:0;
            return { ...row, targets, marked, hasWild, specialNodesOnly, window, priority, score: score / Math.max(15, row.units) };
        }).filter(row=>row.targets.length).sort((a,b)=>Number(b.marked)-Number(a.marked)||b.priority-a.priority||
            (a.window?.until||0)-(b.window?.until||0)||b.score-a.score||a.id-b.id);
    }
    const PARIS_CALENDAR=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'});
    let calendarMinute,calendarDay;
    function parisDay(now = Date.now()) {
        const minute=Math.floor(now/60000);
        if(minute!==calendarMinute){
            const parts=Object.fromEntries(PARIS_CALENDAR.formatToParts(now).map(p=>[p.type,p.value]));
            calendarDay=`${parts.year}-${parts.month}-${parts.day}`;
            calendarMinute=minute;
        }
        return calendarDay;
    }
    // Public build b05c8cc201: same counter/DOT units as the native raid recommendation.
    const RAID_ALLY = {"build":"1a16948eef","raid":{"HP":3.3,"POWER":0.7,"BST_REF":500,"HP_EXP":1.8,"POWER_EXP":1,"ADJ":{"19":0.91,"39":0.88,"40":0.89,"56":0.83,"57":0.9,"66":0.74,"67":0.73,"80":0.89,"86":0.81,"88":0.68,"89":0.85,"96":0.81,"118":0.92,"161":0.73,"185":0.68,"206":0.8,"217":0.71,"218":0.83,"224":0.85,"261":0.79,"262":0.98,"287":0.76,"302":0.81,"328":0.77,"399":0.87,"438":0.86}},"team":6,"enemyHp":0.7,"bossStatus":{"HURT":60,"DOT_TURNS":4,"LOCK_MAX":2,"LOCK_CD":2},"legend":{"ROAM_HP":4,"ROAM_POWER":0.6,"WILD":4,"WILD_LV":[12,6],"HP":3,"POWER":0.5,"COUNTER":0.3,"RAGE":8,"BURST":1,"RIDDLE_WAIT":120000,"AURA":1},"statusChance":0.3,"statusSure":0.15,"statusTeam":[1,0.5],"statusParaCost":1,"moves":{"ember":{"status":"burn","chance":10,"cap":30,"type":"fire","power":40,"acc":100},"fire-punch":{"status":"burn","chance":10,"cap":30,"type":"fire","power":75,"acc":93.63636363636364},"flamethrower":{"status":"burn","chance":10,"cap":30,"type":"fire","power":90,"acc":90.9090909090909},"fire-blast":{"status":"burn","chance":10,"cap":30,"type":"fire","power":110,"acc":87.27272727272728},"flame-wheel":{"status":"burn","chance":10,"cap":30,"type":"fire","power":60,"acc":96.36363636363636},"sacred-fire":{"status":"burn","chance":50,"cap":100,"type":"fire","power":100,"acc":89.0909090909091},"fire-fang":{"status":"burn","chance":10,"cap":30,"type":"fire","power":65,"acc":95.45454545454545},"lava-plume":{"status":"burn","chance":30,"cap":30,"type":"fire","power":80,"acc":92.72727272727272},"heat-wave":{"status":"burn","chance":10,"cap":30,"type":"fire","power":95,"acc":90},"flare-blitz":{"status":"burn","chance":10,"cap":30,"type":"fire","power":120,"acc":85.45454545454545},"blaze-kick":{"status":"burn","chance":10,"cap":30,"type":"fire","power":85,"acc":91.81818181818181},"inferno":{"status":"burn","chance":100,"cap":100,"type":"fire","power":100,"acc":89.0909090909091},"will-o-wisp":{"status":"burn","chance":85,"cap":50,"type":"fire","power":0,"acc":85},"thunder-fang":{"status":"paralysis","chance":10,"cap":30,"type":"electric","power":65,"acc":95.45454545454545},"discharge":{"status":"paralysis","chance":30,"cap":30,"type":"electric","power":80,"acc":92.72727272727272},"nuzzle":{"status":"paralysis","chance":100,"cap":100,"type":"electric","power":20,"acc":100},"bounce":{"status":"paralysis","chance":30,"cap":30,"type":"flying","power":85,"acc":91.81818181818181},"dragon-breath":{"status":"paralysis","chance":30,"cap":30,"type":"dragon","power":60,"acc":96.36363636363636},"scald":{"status":"burn","chance":30,"cap":30,"type":"water","power":80,"acc":92.72727272727272},"searing-shot":{"status":"burn","chance":30,"cap":30,"type":"fire","power":100,"acc":89.0909090909091},"scorching-sands":{"status":"burn","chance":30,"cap":30,"type":"ground","power":70,"acc":94.54545454545455},"ice-burn":{"status":"burn","chance":30,"cap":30,"type":"ice","power":140,"acc":81.81818181818181},"blue-flare":{"status":"burn","chance":20,"cap":30,"type":"fire","power":130,"acc":83.63636363636364},"sandsear-storm":{"status":"burn","chance":20,"cap":30,"type":"ground","power":100,"acc":89.0909090909091},"freeze-shock":{"status":"paralysis","chance":30,"cap":30,"type":"ice","power":140,"acc":81.81818181818181},"bolt-strike":{"status":"paralysis","chance":20,"cap":30,"type":"electric","power":130,"acc":83.63636363636364},"force-palm":{"status":"paralysis","chance":30,"cap":30,"type":"fighting","power":60,"acc":96.36363636363636},"wildbolt-storm":{"status":"paralysis","chance":20,"cap":30,"type":"electric","power":100,"acc":89.0909090909091},"relic-song":{"status":"sleep","chance":10,"cap":30,"type":"normal","power":75,"acc":93.63636363636364},"chatter":{"status":"confusion","chance":100,"cap":30,"type":"flying","power":65,"acc":95.45454545454545},"rock-climb":{"status":"confusion","chance":20,"cap":30,"type":"normal","power":90,"acc":90.9090909090909},"signal-beam":{"status":"confusion","chance":10,"cap":30,"type":"bug","power":75,"acc":93.63636363636364},"axe-kick":{"status":"confusion","chance":30,"cap":30,"type":"fighting","power":120,"acc":85.45454545454545},"poison-jab":{"status":"poison","chance":30,"cap":30,"type":"poison","power":80,"acc":92.72727272727272},"poison-fang":{"status":"poison","chance":50,"cap":30,"type":"poison","power":50,"acc":98.18181818181819},"cross-poison":{"status":"poison","chance":10,"cap":30,"type":"poison","power":70,"acc":94.54545454545455},"gunk-shot":{"status":"poison","chance":30,"cap":30,"type":"poison","power":120,"acc":85.45454545454545},"sludge-wave":{"status":"poison","chance":10,"cap":30,"type":"poison","power":95,"acc":90},"poison-tail":{"status":"poison","chance":10,"cap":30,"type":"poison","power":50,"acc":98.18181818181819},"toxic":{"status":"poison","chance":90,"cap":50,"type":"poison","power":0,"acc":90},"ice-fang":{"status":"freeze","chance":10,"cap":30,"type":"ice","power":65,"acc":95.45454545454545},"freeze-dry":{"status":"freeze","chance":10,"cap":30,"type":"ice","power":70,"acc":94.54545454545455},"dynamic-punch":{"status":"confusion","chance":100,"cap":100,"type":"fighting","power":100,"acc":89.0909090909091},"hurricane":{"status":"confusion","chance":30,"cap":30,"type":"flying","power":110,"acc":87.27272727272728},"water-pulse":{"status":"confusion","chance":20,"cap":30,"type":"water","power":60,"acc":96.36363636363636},"thunder-shock":{"status":"paralysis","chance":10,"cap":30,"type":"electric","power":40,"acc":100},"thunder-punch":{"status":"paralysis","chance":10,"cap":30,"type":"electric","power":75,"acc":93.63636363636364},"thunderbolt":{"status":"paralysis","chance":10,"cap":30,"type":"electric","power":90,"acc":90.9090909090909},"thunder":{"status":"paralysis","chance":30,"cap":30,"type":"electric","power":110,"acc":87.27272727272728},"spark":{"status":"paralysis","chance":30,"cap":30,"type":"electric","power":65,"acc":95.45454545454545},"zap-cannon":{"status":"paralysis","chance":100,"cap":100,"type":"electric","power":120,"acc":85.45454545454545},"body-slam":{"status":"paralysis","chance":30,"cap":30,"type":"normal","power":85,"acc":91.81818181818181},"lick":{"status":"paralysis","chance":30,"cap":30,"type":"ghost","power":30,"acc":100},"poison-sting":{"status":"poison","chance":30,"cap":30,"type":"poison","power":15,"acc":100},"sludge":{"status":"poison","chance":30,"cap":30,"type":"poison","power":65,"acc":95.45454545454545},"sludge-bomb":{"status":"poison","chance":30,"cap":30,"type":"poison","power":90,"acc":90.9090909090909},"smog":{"status":"poison","chance":40,"cap":30,"type":"poison","power":30,"acc":100},"twineedle":{"status":"poison","chance":20,"cap":30,"type":"bug","power":50,"acc":98.18181818181819},"ice-beam":{"status":"freeze","chance":10,"cap":30,"type":"ice","power":90,"acc":90.9090909090909},"ice-punch":{"status":"freeze","chance":10,"cap":30,"type":"ice","power":75,"acc":93.63636363636364},"blizzard":{"status":"freeze","chance":10,"cap":30,"type":"ice","power":110,"acc":87.27272727272728},"powder-snow":{"status":"freeze","chance":10,"cap":30,"type":"ice","power":40,"acc":100},"confusion":{"status":"confusion","chance":10,"cap":30,"type":"psychic","power":50,"acc":98.18181818181819},"psybeam":{"status":"confusion","chance":10,"cap":30,"type":"psychic","power":65,"acc":95.45454545454545},"dizzy-punch":{"status":"confusion","chance":20,"cap":30,"type":"normal","power":70,"acc":94.54545454545455},"tri-attack":{"status":"tri","chance":20,"cap":30,"type":"normal","power":80,"acc":92.72727272727272},"sleep-powder":{"status":"sleep","chance":75,"cap":50,"type":"grass","power":0,"acc":75},"spore":{"status":"sleep","chance":100,"cap":100,"type":"grass","power":0,"acc":100},"hypnosis":{"status":"sleep","chance":60,"cap":50,"type":"psychic","power":0,"acc":60},"sing":{"status":"sleep","chance":55,"cap":50,"type":"normal","power":0,"acc":55},"lovely-kiss":{"status":"sleep","chance":75,"cap":50,"type":"normal","power":0,"acc":75},"stun-spore":{"status":"paralysis","chance":75,"cap":50,"type":"grass","power":0,"acc":75},"thunder-wave":{"status":"paralysis","chance":100,"cap":50,"type":"electric","power":0,"acc":90},"glare":{"status":"paralysis","chance":75,"cap":50,"type":"normal","power":0,"acc":100},"poison-powder":{"status":"poison","chance":75,"cap":50,"type":"poison","power":0,"acc":75},"poison-gas":{"status":"poison","chance":55,"cap":50,"type":"poison","power":0,"acc":90},"confuse-ray":{"status":"confusion","chance":100,"cap":50,"type":"ghost","power":0,"acc":100},"supersonic":{"status":"confusion","chance":55,"cap":50,"type":"normal","power":0,"acc":55},"sweet-kiss":{"status":"confusion","chance":75,"cap":50,"type":"fairy","power":0,"acc":75}},"learn":{"1":[[30,"poison-powder",1],[34,"sleep-powder",1]],"2":[[30,"poison-powder",2],[35,"sleep-powder",2]],"3":[[30,"poison-powder",3],[35,"sleep-powder",3]],"12":[[5,"supersonic",12],[18,"poison-powder",12],[22,"stun-spore",12],[27,"sleep-powder",12]],"23":[[14,"glare",23],[38,"toxic",23]],"24":[[15,"glare",24],[43,"toxic",23]],"25":[[5,"thunder-wave",25],[14,"sweet-kiss",172]],"26":[[10,"thunder-wave",25],[23,"sweet-kiss",172]],"29":[[43,"toxic",29]],"30":[[50,"toxic",30]],"31":[[79,"toxic",30]],"32":[[40,"toxic",32]],"33":[[50,"toxic",33]],"34":[[69,"toxic",33]],"35":[[10,"sing",173],[15,"sweet-kiss",173]],"36":[[9,"sing",173],[14,"sweet-kiss",173]],"37":[[29,"confuse-ray",37],[38,"will-o-wisp",37]],"38":[[29,"confuse-ray",37],[37,"will-o-wisp",37]],"39":[[6,"sing",174],[15,"sweet-kiss",174]],"40":[[5,"sing",174],[23,"sweet-kiss",174]],"41":[[5,"supersonic",41],[28,"toxic",41],[53,"confuse-ray",41]],"42":[[6,"supersonic",41],[28,"toxic",41],[55,"confuse-ray",42]],"43":[[16,"poison-powder",43],[30,"stun-spore",43],[34,"sleep-powder",43],[44,"toxic",43]],"44":[[17,"poison-powder",44],[31,"stun-spore",44],[35,"sleep-powder",44],[44,"toxic",44]],"45":[[17,"poison-powder",44],[30,"stun-spore",44],[39,"sleep-powder",44],[48,"toxic",44]],"46":[[5,"sleep-powder",46],[9,"poison-powder",46],[14,"stun-spore",46],[45,"spore",46]],"47":[[6,"sleep-powder",46],[10,"poison-powder",46],[14,"stun-spore",46],[46,"spore",47]],"48":[[11,"supersonic",48],[19,"poison-powder",48],[47,"stun-spore",48],[60,"sleep-powder",48]],"49":[[10,"supersonic",48],[19,"poison-powder",49],[42,"stun-spore",49],[55,"sleep-powder",49]],"60":[[5,"hypnosis",60]],"61":[[6,"hypnosis",60]],"62":[[6,"hypnosis",60]],"69":[[15,"sleep-powder",69],[42,"poison-powder",69],[46,"stun-spore",69]],"70":[[15,"sleep-powder",70],[42,"poison-powder",70],[46,"stun-spore",70]],"71":[[15,"sleep-powder",70],[42,"poison-powder",70],[47,"stun-spore",70]],"72":[[24,"supersonic",72]],"73":[[23,"supersonic",73]],"81":[[11,"supersonic",81],[15,"thunder-wave",81]],"82":[[10,"supersonic",81],[15,"thunder-wave",81]],"88":[[5,"poison-gas",88],[33,"toxic",88]],"89":[[6,"poison-gas",88],[34,"toxic",89]],"90":[[33,"supersonic",90]],"91":[[24,"supersonic",90]],"92":[[10,"confuse-ray",92],[15,"hypnosis",92],[19,"poison-gas",92],[28,"will-o-wisp",92],[41,"toxic",92]],"93":[[9,"confuse-ray",92],[14,"hypnosis",92],[19,"poison-gas",92],[32,"will-o-wisp",92],[45,"toxic",92]],"94":[[10,"confuse-ray",92],[14,"hypnosis",92],[19,"poison-gas",92],[32,"will-o-wisp",92],[46,"toxic",92]],"96":[[5,"hypnosis",96],[19,"poison-gas",96]],"97":[[5,"hypnosis",96],[19,"poison-gas",97]],"102":[[9,"hypnosis",102],[34,"stun-spore",102],[38,"poison-powder",102],[47,"sleep-powder",102]],"103":[[9,"hypnosis",102],[35,"stun-spore",102],[39,"poison-powder",102],[43,"sleep-powder",102]],"108":[[14,"supersonic",108]],"109":[[6,"poison-gas",109],[38,"toxic",109]],"110":[[6,"poison-gas",109],[42,"toxic",110]],"113":[[14,"sweet-kiss",113],[28,"sing",113]],"114":[[11,"stun-spore",114],[29,"poison-powder",114],[46,"sleep-powder",114]],"118":[[6,"supersonic",118]],"119":[[6,"supersonic",118]],"120":[[15,"confuse-ray",120]],"121":[[14,"confuse-ray",120]],"124":[[33,"sing",124],[55,"sweet-kiss",238],[60,"lovely-kiss",124]],"125":[[35,"thunder-wave",125]],"126":[[30,"confuse-ray",126]],"131":[[5,"sing",131],[33,"confuse-ray",131]],"135":[[33,"thunder-wave",135]],"137":[[28,"thunder-wave",137]],"142":[[24,"supersonic",142]],"145":[[5,"thunder-wave",145]],"147":[[11,"thunder-wave",147]],"148":[[10,"thunder-wave",147]],"149":[[10,"thunder-wave",147]],"150":[[9,"confuse-ray",150]],"152":[[11,"poison-powder",152]],"153":[[11,"poison-powder",152]],"154":[[10,"poison-powder",152]],"163":[[59,"hypnosis",163]],"164":[[50,"hypnosis",164]],"165":[[6,"supersonic",165]],"166":[[6,"supersonic",165]],"169":[[5,"supersonic",41],[28,"toxic",41],[59,"confuse-ray",169]],"170":[[6,"supersonic",170],[14,"thunder-wave",170],[24,"confuse-ray",170]],"171":[[6,"supersonic",170],[15,"thunder-wave",170],[24,"confuse-ray",171]],"172":[[8,"sweet-kiss",172],[28,"thunder-wave",172]],"173":[[5,"sing",173],[9,"sweet-kiss",173]],"174":[[6,"sing",174],[10,"sweet-kiss",174]],"175":[[6,"sweet-kiss",175]],"176":[[6,"sweet-kiss",175]],"177":[[20,"confuse-ray",177]],"178":[[20,"confuse-ray",178]],"179":[[6,"thunder-wave",179],[38,"confuse-ray",179]],"180":[[11,"thunder-wave",180],[37,"confuse-ray",180]],"181":[[11,"thunder-wave",180],[42,"confuse-ray",181]],"182":[[17,"poison-powder",44],[30,"stun-spore",44],[35,"sleep-powder",44],[43,"toxic",44]],"186":[[5,"hypnosis",60]],"187":[[15,"poison-powder",187],[19,"stun-spore",187],[23,"sleep-powder",187]],"188":[[19,"poison-powder",188],[24,"stun-spore",188],[28,"sleep-powder",188]],"189":[[19,"poison-powder",189],[24,"stun-spore",189],[29,"sleep-powder",189]],"193":[[31,"supersonic",193],[59,"hypnosis",193]],"194":[[47,"toxic",194]],"195":[[46,"toxic",195]],"197":[[24,"confuse-ray",197]],"200":[[15,"confuse-ray",200]],"206":[[19,"glare",206]],"211":[[55,"toxic",211]],"226":[[24,"supersonic",226],[28,"confuse-ray",458]],"233":[[28,"thunder-wave",137]],"234":[[12,"hypnosis",234],[25,"confuse-ray",234]],"238":[[32,"sing",238],[46,"sweet-kiss",238]],"239":[[35,"thunder-wave",239]],"240":[[35,"confuse-ray",240]],"242":[[15,"sweet-kiss",113],[29,"sing",242]],"258":[[27,"supersonic",258]],"259":[[37,"supersonic",259]],"260":[[42,"supersonic",260]],"267":[[33,"stun-spore",267]],"269":[[24,"poison-powder",269],[42,"toxic",269]],"278":[[10,"supersonic",278]],"279":[[10,"supersonic",278]],"280":[[11,"hypnosis",280]],"281":[[11,"hypnosis",281]],"282":[[10,"hypnosis",282]],"284":[[55,"stun-spore",284],[73,"supersonic",284]],"285":[[11,"stun-spore",285],[29,"poison-powder",285],[42,"toxic",285],[51,"spore",285]],"286":[[10,"stun-spore",285],[41,"poison-powder",285],[59,"toxic",285],[69,"spore",285]],"292":[[25,"confuse-ray",292]],"293":[[39,"supersonic",293]],"294":[[39,"supersonic",294]],"295":[[42,"supersonic",295]],"299":[[15,"thunder-wave",299]],"300":[[8,"sing",300]],"301":[[8,"sing",300]],"302":[[10,"confuse-ray",302]],"309":[[5,"thunder-wave",309]],"310":[[5,"thunder-wave",309]],"311":[[9,"thunder-wave",311]],"312":[[10,"thunder-wave",312]],"313":[[8,"confuse-ray",313]],"315":[[5,"stun-spore",315],[40,"toxic",315]],"316":[[8,"poison-gas",316],[25,"toxic",316]],"317":[[10,"poison-gas",316],[25,"toxic",317]],"325":[[22,"confuse-ray",325]],"326":[[22,"confuse-ray",326]],"327":[[23,"hypnosis",327]],"329":[[36,"supersonic",329]],"330":[[35,"supersonic",329]],"333":[[37,"sing",333]],"334":[[37,"sing",334]],"336":[[25,"glare",336]],"337":[[24,"hypnosis",337]],"338":[[15,"hypnosis",338]],"345":[[14,"confuse-ray",345]],"346":[[15,"confuse-ray",345]],"353":[[16,"will-o-wisp",353]],"354":[[16,"will-o-wisp",354]],"355":[[13,"confuse-ray",355],[26,"will-o-wisp",355]],"356":[[13,"confuse-ray",356],[26,"will-o-wisp",356]],"370":[[46,"sweet-kiss",370]],"402":[[24,"sing",402]],"403":[[34,"thunder-wave",403]],"404":[[42,"thunder-wave",404]],"405":[[48,"thunder-wave",405]],"406":[[6,"stun-spore",406]],"407":[[6,"stun-spore",315],[40,"toxic",315]],"414":[[37,"poison-powder",414]],"416":[[19,"confuse-ray",416],[64,"toxic",416]],"417":[[30,"sweet-kiss",417],[43,"thunder-wave",417]],"429":[[14,"confuse-ray",200]],"431":[[13,"hypnosis",431]],"432":[[13,"hypnosis",432]],"434":[[5,"poison-gas",434],[41,"toxic",434]],"435":[[6,"poison-gas",434],[42,"toxic",435]],"436":[[11,"confuse-ray",436],[24,"hypnosis",436]],"437":[[10,"confuse-ray",436],[28,"hypnosis",437]],"440":[[8,"sweet-kiss",440]],"441":[[13,"sing",441]],"442":[[10,"confuse-ray",442],[58,"hypnosis",442]],"451":[[39,"toxic",451]],"452":[[43,"toxic",452]],"453":[[69,"toxic",453]],"454":[[74,"toxic",454]],"458":[[10,"supersonic",458],[19,"confuse-ray",458]],"462":[[9,"supersonic",81],[14,"thunder-wave",81]],"463":[[14,"supersonic",108]],"465":[[10,"stun-spore",114],[32,"poison-powder",465],[59,"sleep-powder",465]],"466":[[35,"thunder-wave",466]],"467":[[26,"confuse-ray",467]],"468":[[6,"sweet-kiss",175]],"469":[[32,"supersonic",469],[54,"hypnosis",193]],"474":[[28,"thunder-wave",137]],"475":[[11,"hypnosis",281]],"476":[[20,"thunder-wave",476]],"477":[[12,"confuse-ray",477],[26,"will-o-wisp",477]],"478":[[52,"confuse-ray",478],[62,"will-o-wisp",478]],"479":[[10,"confuse-ray",479],[33,"thunder-wave",479]],"486":[[23,"confuse-ray",486]],"489":[[29,"supersonic",489]],"490":[[29,"supersonic",490]],"491":[[28,"hypnosis",491]],"492":[[82,"sweet-kiss",492]],"504":[[25,"hypnosis",504]],"505":[[25,"hypnosis",505],[29,"confuse-ray",505]],"517":[[10,"hypnosis",517]],"518":[[10,"hypnosis",517]],"522":[[16,"thunder-wave",522]],"523":[[15,"thunder-wave",522]],"535":[[15,"supersonic",535]],"536":[[15,"supersonic",535]],"537":[[14,"supersonic",535]],"543":[[47,"toxic",543]],"544":[[48,"toxic",544]],"545":[[52,"toxic",545]],"546":[[10,"stun-spore",546],[28,"poison-powder",546]],"547":[[9,"stun-spore",546],[32,"poison-powder",546]],"548":[[6,"stun-spore",548],[20,"sleep-powder",548]],"549":[[11,"stun-spore",548],[18,"sleep-powder",548]],"561":[[10,"hypnosis",561]],"562":[[16,"will-o-wisp",562]],"563":[[17,"will-o-wisp",563]],"568":[[6,"poison-gas",568],[38,"toxic",568]],"569":[[5,"poison-gas",568],[47,"toxic",569]],"572":[[12,"sing",572]],"573":[[12,"sing",572]],"574":[[30,"hypnosis",574]],"575":[[31,"hypnosis",575]],"576":[[30,"hypnosis",576]],"590":[[9,"stun-spore",590],[45,"toxic",590],[55,"spore",590]],"591":[[10,"stun-spore",590],[46,"toxic",591],[55,"spore",591]],"595":[[19,"thunder-wave",595]],"596":[[19,"thunder-wave",596]],"602":[[14,"thunder-wave",602]],"603":[[15,"thunder-wave",602]],"604":[[14,"thunder-wave",602]],"607":[[15,"confuse-ray",607],[32,"will-o-wisp",607]],"608":[[14,"confuse-ray",608],[32,"will-o-wisp",608]],"609":[[14,"confuse-ray",608],[37,"will-o-wisp",608]],"615":[[11,"confuse-ray",615]],"617":[[52,"toxic",617]],"648":[[14,"sing",648]],"47901":[[10,"confuse-ray",47901],[33,"thunder-wave",47901]],"47902":[[10,"confuse-ray",47902],[33,"thunder-wave",47902]],"47903":[[10,"confuse-ray",47903],[33,"thunder-wave",47903]],"47904":[[11,"confuse-ray",47904],[33,"thunder-wave",47904]],"47905":[[10,"confuse-ray",47905],[33,"thunder-wave",47905]],"49201":[[82,"sweet-kiss",49201]],"64801":[[14,"sing",64801]],"90025":[[4,"thunder-wave",90025]]},"checked":"2026-11-17"};
    function raidAllyScorer(boss, baseline = []) {
        const foe=MONS.get(boss);
        if(!foe){
            const addStats=(sum,m)=>MONS.has(m.id)?sum+Object.values(effectiveStats({...m,level:clamp(m.level,1,100,100)})).reduce((a,b)=>a+b,0):sum;
            const baselineScore=baseline.reduce(addStats,0);
            return mons=>mons.reduce(addStats,baselineScore);
        }
        const opponent={id:boss,level:100},defense=effectiveStats(opponent),types=foe.types;
        const immune=status=>status==='poison'?types.some(t=>t==='poison'||t==='steel'):status==='burn'?types.includes('fire'):status==='freeze'?types.includes('ice'):false;
        const bossResistances=defensiveTypes(foe);
        function matchup(mon,target,attackStats,defenseStats,includeCounter){
            const transformed=mon.id===132&&target.id!==132;
            const model=MONS.get(transformed?target.id:mon.id);
            if(transformed)attackStats=effectiveStats({...mon,id:target.id});
            const moves=damagingMoves(model),resistances=defensiveTypes(MONS.get(target.id));
            const gap=DATA.combat.levelGap**(mon.level-target.level);
            function damage({move,stab}){
                const physical=move.cat==='phys';
                return ((2*mon.level/5+2)*move.power*attackStats[physical?'atk':'spa']/Math.max(1,defenseStats[physical?'def':'spd'])/50+2)*move.acc/100*stab*(resistances[move.type]??1)*gap;
            }
            let best=null,bestDamage=0;
            for(const entry of moves){
                if(entry.level>mon.level||entry.move.power<=0)continue;
                const value=damage(entry);
                if(!best||value>bestDamage){best=entry;bestDamage=value;}
            }
            let counter=null,coverage=null;
            if(includeCounter&&best){
                for(const entry of moves){
                    const {move}=entry;
                    if(entry.level>mon.level||move.power<=0||entry.key===best.key||resistances[move.type]===0)continue;
                    if(!counter||move.power<counter.move.power)counter=entry;
                    if(!types.includes(move.type)&&(!coverage||move.power<coverage.move.power))coverage=entry;
                }
            }
            return {best,damage:bestDamage,counter:counter?damage(coverage||counter):bestDamage};
        }
        const hpFactor=RAID_ALLY.raid.HP*(RAID_ALLY.raid.BST_REF/Object.values(foe.stats).reduce((a,b)=>a+b,0))**RAID_ALLY.raid.HP_EXP*(RAID_ALLY.raid.ADJ[boss]??1);
        const dotUnit=defense.hp*(1+RAID_ALLY.enemyHp*(RAID_ALLY.team-1))*hpFactor/RAID_ALLY.bossStatus.HURT;
        function memberParts(raw){
            const mon={...raw,level:clamp(raw.level,1,100,100),rank:Math.floor(clamp(raw.rank,0,5,0)),status:null};
            const stats=effectiveStats(mon),attack=matchup(mon,opponent,stats,defense,false),burst=matchup(opponent,mon,defense,stats,true);
            const incoming=burst.damage/RAID_ALLY.team+RAID_ALLY.legend.COUNTER*burst.counter+RAID_ALLY.team/RAID_ALLY.legend.RAGE*RAID_ALLY.legend.BURST*burst.damage;
            const survival=stats.hp/Math.max(1,incoming),chance={poison:0,burn:0,paralysis:0};
            let statusMove=null;
            const statusSpecies=mon.id;
            for(const [level,key] of RAID_ALLY.learn[statusSpecies]||[]){const move=RAID_ALLY.moves[key];if(level<=mon.level&&!immune(move.status)&&(bossResistances[move.type]??1)>0)statusMove=move;}
            const statusShare=statusMove?RAID_ALLY.statusChance:0;
            if(statusMove&&statusMove.status in chance)chance[statusMove.status]+=statusShare*Math.min(statusMove.acc,statusMove.cap)/100;
            const effect=RAID_ALLY.moves[attack.best?.key];
            if(mon.id!==132&&effect&&effect.status in chance&&!immune(effect.status))chance[effect.status]+=(1-statusShare)*(attack.best.move.acc/100)*Math.min(effect.chance,effect.cap)/100;
            const uptime=RAID_ALLY.bossStatus.DOT_TURNS*(chance.poison+chance.burn);
            return {value:attack.damage*survival,dot:dotUnit*uptime/(uptime+1)*survival,para:dotUnit*Math.min(1,chance.paralysis/RAID_ALLY.statusSure)*survival};
        }
        const baselineParts=baseline.filter(m=>MONS.has(m.id)).map(memberParts);
        return mons=>{
            // DOT saturation and paralysis depend on the combined roster.
            const parts=baselineParts.concat(mons.filter(m=>MONS.has(m.id)).map(memberParts));
            const dot=parts.map(p=>p.dot).sort((a,b)=>b-a).reduce((sum,value,i)=>sum+value*(RAID_ALLY.statusTeam[i]??0),0);
            return parts.reduce((sum,p)=>sum+p.value,0)+dot-(dot>0?RAID_ALLY.statusParaCost*parts.reduce((sum,p)=>sum+p.para,0):0);
        };
    }
    function allyStrength(mons,boss){
        return raidAllyScorer(boss)(mons);
    }
    function allyMemberFrom(el){
        const levelText=el.querySelector('.rt-lv')?.textContent||'',levels=levelText.match(/\d+/g),rankText=el.querySelector('.rk-n')?.textContent?.trim(),ranks=['','I','II','III','IV','V'];
        return{id:monIdFrom(el),level:clamp(levels?.at(-1),1,100,1),shiny:[...el.querySelectorAll('img')].some(img=>/(?:\/|[-_])shiny(?:\/|[-_.])/i.test(img.getAttribute('src')||'')),rank:Math.max(0,ranks.indexOf(rankText))};
    }


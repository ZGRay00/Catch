    function ownedItems(s, id) { return (Number(s.items?.[id]) || 0) + (Number(s.link?.stash?.items?.[id]) || 0); }
    function itemCounter(s, id) { return s.stats?.itemIn && typeof s.stats.itemIn === 'object' ? Number(s.stats.itemIn[id]) || 0 : ownedItems(s, id); }
    function ownsMon(s, id) {
        return [...s.mons || [], ...(s.pension?.mons || []).map(p => p.mon), ...s.link?.stash?.mons || [], ...(s.under?.slots || []).flatMap(slot => slot.mons || [])].some(mon => mon?.id === id);
    }
    function starterChoice(s,key,ids){
        const choice=s.adv.gifts?.[key];if(typeof choice==='number')return choice;if(!choice)return null;
        const owned=[...(s.mons||[]),...(s.pension?.mons||[]).map(p=>p.mon),...(s.link?.stash?.mons||[]),...(s.under?.slots||[]).flatMap(slot=>slot.mons||[])];
        return owned.map(m=>MONS.get(m?.id)?.root).find(id=>ids.includes(id))??null;
    }
    function chapterFoes(s,chapter){
        const branch=chapter?.foesByStarter;
        return branch?(branch.choices?.[starterChoice(s,branch.key,Object.keys(branch.choices||{}).map(Number))]||branch.default||chapter.foes||[]):chapter?.foes||[];
    }
    function giftChoices(s,gift){
        const branch=gift.byStarter;
        return branch?(branch.choices?.[starterChoice(s,branch.key,Object.keys(branch.choices||{}).map(Number))]||branch.default||gift.ids):gift.ids;
    }
    function sourceAvailable(s, source, itemId, now = Date.now()) {
        if (source.once && s.adv.gifts?.[source.once] || source.badge && !s.adv.badges?.includes(source.badge)) return false;
        if (source.tide && source.tide !== (Math.floor(now / (DATA.tideMs || 10800000)) % 2 === 0 ? 'low' : 'high')) return false;
        if (source.owns?.some(id => !ownsMon(s, id))) return false;
        if (source.stone) {
            const reg = CHAPTERS.get(source.ch)?.reg;
            const found = s.stonesFound || {};
            const keys = found['r:' + reg] || Object.entries(found).filter(([ch]) => !ch.startsWith('r:') && CHAPTERS.get(+ch)?.reg === reg).flatMap(([, ids]) => ids);
            if (keys.includes(itemId)) return false;
        }
        return true;
    }
    function itemRanking(s, settings, metrics = {}, cooldowns = {}, now = Date.now()) {
        const item = ITEMS.get(settings.itemId); if (!item) return [];
        return candidates(s, settings).filter(row => (cooldowns[row.key] || 0) <= now).map(row => {
            const sources = item.sources.filter(source => row.members.includes(source.ch) && sourceAvailable(s, source, item.id, now));
            const seconds = Math.max(20, row.units * 2.8 / 2.5);
            const expected = sources.reduce((n, source) => n + source.expected * (source.kind === 'town' ? Math.min(1, seconds * 1000 / Math.max(1, DATA.townCooldown || 1)) : 1), 0);
            const m = metrics[metricsKey(s, row, settings,now)], measured = m?.itemSeconds > 0;
            const count = Number(m?.itemCounts?.[item.id]) || 0;
            const estimate = expected / seconds * 60;
            // A zero-drop trial cannot make a rare but valid source look impossible.
            const rate = measured ? (count + expected * 2) / (m.itemSeconds + seconds * 2) * 60 : estimate;
            return { ...row, rate, expected, measured, actualRate: measured ? count / m.itemSeconds * 60 : null, samples: m?.itemRuns || 0, sources };
        }).filter(row => row.expected > 0).sort((a, b) => b.rate - a.rate || a.id - b.id);
    }
    function trainingCap(s, mon) {
        const caps = DATA.caps?.[s.adv.unlocked];
        if(!caps)return 100;
        const regional=reg=>DATA.chapters.some(c=>c.reg===reg&&c.league&&c.badges?.some(b=>s.adv.badges?.includes(b)))?100:caps[reg]??caps.main;
        if(s.link)return Math.min(100,regional(monRegion(mon)));
        // A shared wallet still obeys the next gym cap of every opened, reached region.
        // Snapshot main caps were exported before the isolated runtime opened later regions.
        const open=new Set(['kanto',...(s.travel?.to||[]),currentRegion(s)]);
        const values=DATA.regions.filter(r=>open.has(r.key)&&r.start<=s.adv.unlocked).map(r=>regional(r.key));
        return Math.min(100,...(values.length?values:[caps.main]));
    }
    function trainingStatus(s, settings, protectedUids = null) {
        const party = partyMons(s), ids=settings.trainUid==='team'&&protectedUids?.length?protectedUids:null;
        const targets = ids ? ids.map(uid=>(s.mons||[]).find(m=>m.uid===uid)).filter(Boolean) : settings.trainUid === 'team' ? party : party.filter(m => m.uid === settings.trainUid);
        const missing=!targets.length||!!ids&&(targets.length!==ids.length||ids.some(uid=>!s.team?.includes(uid)));
        const available = targets.filter(m => m.level < Math.min(settings.trainLevel, trainingCap(s, m)));
        return { targets, available, missing, complete: !missing && targets.every(m => m.level >= settings.trainLevel),
            capped: targets.length > 0 && !available.length && targets.some(m => m.level < settings.trainLevel),
            cap: targets.length ? Math.min(...targets.map(m => trainingCap(s, m))) : 0 };
    }
    function selectTrainingBuddy(s,settings,preparation=null,protectedUids=null){
        const party=new Set(s.team||[]),road=new Set(Array.isArray(s.road)&&s.road.length?s.road:s.team||[]);
        let targets;
        if(preparation)targets=preparation.targets||[];
        else if(settings.mode==='train'){
            const ids=settings.trainUid==='team'?(protectedUids?.length?protectedUids:s.team||[]):[settings.trainUid];
            targets=ids.map(uid=>({uid,goal:settings.trainLevel}));
        }else return null;
        const goals=new Map(targets.map(target=>[target.uid,target.goal]));
        const eligible=(s.mons||[]).filter(mon=>party.has(mon.uid)&&road.has(mon.uid)&&goals.has(mon.uid)&&teamEligible(s,mon)&&mon.level<Math.min(Number(goals.get(mon.uid))||0,trainingCap(s,mon)));
        if(eligible.some(mon=>mon.uid===s.buddy?.uid))return s.buddy.uid;
        const order=new Map((s.team||[]).map((uid,i)=>[uid,i]));
        return eligible.sort((a,b)=>a.level-b.level||(order.get(a.uid)??999)-(order.get(b.uid)??999)||String(a.uid).localeCompare(String(b.uid)))[0]?.uid||null;
    }
    function experienceTotal(s, uids = s.team || []) {
        let total = 0;
        for (const uid of uids) {
            const mon = (s.mons || []).find(m => m.uid === uid); if (!mon) return null;
            const tables = DATA.xpThresholds?.[economicRegion(s)]; if (!tables) return null;
            const table = tables[Math.min(tables.length - 1, Math.max(0, Number(mon.rank) || 0))];
            if (!table) return null;
            for (let level = 1; level < mon.level; level++) total += table[level] || 0;
            total += Number(mon.xp) || 0;
        }
        return total;
    }
    function trainingCandidates(s,settings){
        const rows=candidates(s,settings,true),known=new Set(rows.map(row=>row.key));
        // Native normal chapters can loop as soon as opened, including the frontier.
        for(const row of candidates(s,settings))if(!row.league&&row.id===s.adv.unlocked&&!known.has(row.key))rows.push({...row,trainingFrontier:true});
        // The native league entry opens with its first room. Forecast the entire
        // run, including later rooms, rather than inventing a partial-loop reward.
        // Training risk checks decide whether this still-uncompleted run is viable.
        const opened=availableChapters(s,settings),groups=new Map();
        for(const chapter of DATA.chapters.filter(chapter=>chapter.league)){
            const key=String(chapter.loop);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(chapter);
        }
        for(const[key,members]of groups){
            const first=members[0];if(known.has(key)||!opened.includes(first))continue;
            rows.push({...first,key,members:members.map(chapter=>chapter.id),name:`${DATA.regions.find(region=>region.key===first.reg)?.name} · 联盟`,
                reward:members.reduce((sum,chapter)=>sum+chapter.reward,0),units:members.reduce((sum,chapter)=>sum+chapter.units,0),trainingFrontier:true,trainingLeagueFrontier:true});
            known.add(key);
        }
        return rows;
    }
    function xpRouteScore(s,settings,row,metrics,now){
        const m=metrics[metricsKey(s,row,settings,now)],measured=m?.xpSeconds>0,samples=m?.xpRuns||0;
        const party=partyMons(s),growing=party.filter(mon=>mon.level<trainingCap(s,mon)),bonus=growing.some(mon=>mon.uid===s.buddy?.uid)?.3:0,battleFit=battleRouteFit(s,row,s.team||[],now);
        const experience=row.members.reduce((n,id)=>n+(CHAPTERS.get(id).xpEstimate||0),0)*(growing.length+bonus)*(activeYieldBuff(s,'xp',now)?.mult||1);
        const leagueTraining=row.league?leagueTrainingModel(s,settings,row,battleFit,now):null;
        const estimate=leagueTraining?leagueTraining.xpPerMember*(growing.length+bonus)*(activeYieldBuff(s,'xp',now)?.mult||1)/leagueTraining.seconds*60*leagueTraining.riskFactor:experience/Math.max(20,row.units*2.8/2.5)*60*battleFit.factor;
        const actualRate=measured?m.xp/m.xpSeconds*60:null,confidence=measured?Math.min(1,samples/2):0;
        const levels=party.filter(mon=>teamEligible(s,mon,row.reg)).map(mon=>mon.level).sort((a,b)=>b-a);
        const lead=(levels[0]||1)*.75+(levels[1]||levels[0]||1)*.25,maxLevel=Math.max(...row.members.map(id=>CHAPTERS.get(id)?.ace||1));
        const efficient=battleFit.coverage>=.9&&battleFit.turns>0&&battleFit.turns<=3;
        const proven=measured&&samples>=2&&actualRate>0;
        const trainingSafe=leagueTraining?proven||leagueTraining.allowed:efficient||!row.trainingFrontier&&(maxLevel<=lead||proven);
        return{...row,rate:confidence*(actualRate||0)+(1-confidence)*estimate,estimatedRate:estimate,actualRate,measured,samples,battleFit,leagueTraining,maxLevel,trainingSafe};
    }
    function xpRanking(s, settings, metrics = {}, cooldowns = {}, now = Date.now()) {
        const rows=trainingCandidates(s,settings).map(row=>xpRouteScore(s,settings,row,metrics,now)),safe=rows.filter(row=>row.trainingSafe),replays=rows.filter(row=>!row.trainingFrontier);
        const minimum=Math.min(...replays.map(row=>row.maxLevel));
        return(safe.length?safe:replays.filter(row=>row.maxLevel===minimum)).filter(row=>(cooldowns[row.key]||0)<=now).map(row=>({...row,fallback:!safe.length})).sort((a,b)=>b.rate-a.rate||a.id-b.id);
    }
    function candyRegion(s){return economicRegion(s);}
    function candyXpGap(s,mon,goal){
        goal=Math.min(goal,trainingCap(s,mon));if(mon.level>=goal)return 0;
        const tables=DATA.xpThresholds[economicRegion(s)],table=tables?.[Math.min(tables.length-1,Math.max(0,Number(mon.rank)||0))];
        if(!table)return null;let need=-(Number(mon.xp)||0);
        for(let lv=mon.level;lv<goal;lv++){if(!(table[lv]>0))return null;need+=table[lv];}return Math.max(0,need);
    }
    function candyChoice(s,mon,goal,offers=[]){
        const need=candyXpGap(s,mon,goal);if(!(need>0))return null;
        const types=DATA.automation.candies,reg=candyRegion(s);
        const owned=Object.entries(types).filter(([id,info])=>s.items?.[id]>0&&info.xp[reg]>0).map(([id,info])=>({id,xp:info.xp[reg],cost:0,owned:true,need}));
        if(owned.length)return owned.sort((a,b)=>Math.max(0,a.xp-need)-Math.max(0,b.xp-need)||b.xp-a.xp)[0];
        return offers.filter(o=>types[o.id]?.xp[reg]>0&&Number.isFinite(o.cost)&&o.cost>0).map(o=>({...o,xp:types[o.id].xp[reg],need,owned:false})).sort((a,b)=>a.cost/Math.min(need,a.xp)-b.cost/Math.min(need,b.xp)||a.cost-b.cost)[0]||null;
    }
    function routeDescriptor(row){return Object.fromEntries(['id','key','reg','name','loop','league','members','reward','units','ace'].map(key=>[key,row[key]]));}
    function battleContext(s,kind,options={}){
        const row=options.row,c=CHAPTERS.get(row?.id??options.id??s.adv.chapter),zone=kind==='zone'?DATA.zones.find(z=>z.id===options.id):null;
        let reg=options.reg||row?.reg||zone?.reg||(['worldAttack','worldCapture','under'].includes(kind)?'sinnoh':c?.reg||currentRegion(s));
        if(kind==='tower'&&s.link&&reg===s.link.to)reg=DATA.regions.find(region=>region.key===s.link.from)?.key||DATA.regions.filter(region=>region.key!==s.link.to&&region.start<=s.adv.unlocked).at(-1)?.key||'kanto';
        let id=options.id??row?.id??c?.id,level=options.level,foes=[],size=6,label=options.label||row?.name||c?.name||kind;
        if(kind==='map'||kind==='progress'){
            const chapters=row?.members||[id];level=Math.max(...chapters.map(id=>CHAPTERS.get(id)?.ace||1));
            foes=chapters.map(id=>CHAPTERS.get(id)).filter(Boolean).flatMap(chapter=>chapterCombatFoes(s,chapter));
            if(ROAMING_DATA.groups.some(group=>group.ids.includes(Number(options.roamId)))){level=ROAMING_DATA.level;foes=[{id:Number(options.roamId),level,weight:20},...foes.map(foe=>({...foe,weight:foe.weight*.05}))];label='游荡捕获 · '+(MONS.get(Number(options.roamId))?.name||options.roamId);}
        }else if(kind==='zone'||kind==='raid'||kind==='worldCapture'){
            id=kind==='worldCapture'?493:id;level=level||zone?.level||DATA.automation.levels.raid;foes=[{id,level,weight:1}];size=kind==='raid'?2:6;
            label=options.label||({zone:'传说战',raid:'每日团体战',worldCapture:'世界首领捕获'}[kind]+' · '+(MONS.get(id)?.name||id));
        }else{
            const chapter=kind==='elite'?DATA.chapters.find(c=>c.reg===reg&&c.league):c?.reg===reg?c:DATA.chapters.filter(c=>c.reg===reg&&c.id<=s.adv.unlocked).at(-1);
            const all=chapter?chapterThreats({...s,adv:{...s.adv,battle:null}},chapter.id):[];
            level=level||(kind==='tower'?Math.min(DATA.automation.levels.towerMax,Math.floor(DATA.automation.levels.towerStart+(options.floor-1)*DATA.automation.levels.towerStep)+(options.floor%10===0?3:0)):100);
            foes=all.map(m=>({...m,level}));size=kind==='under'?DATA.automation.under.team:6;
            label=options.label||({elite:'精英联盟',tower:'对战塔',under:'地下通道',worldAttack:'世界首领攻击'}[kind]||kind);
        }
        level=Math.min(100,Math.max(1,Number(level)||100));foes=foes.filter(m=>MONS.has(m.id));
        return{kind,id,reg,level,foes,size,label,tier:options.tier||0,speciesUnique:kind==='elite'||kind==='zone'&&!!options.tier,floor:options.floor||0,...options.roamId?{roamId:Number(options.roamId)}:{},key:`${kind}:${reg}:${id}:${options.tier||0}:${options.floor||0}:${level}${options.roamId?':roam:'+options.roamId:''}`};
    }
    function configuredBattleTeam(s,context){
        const teams=s.eventTeams||{},zone=s.adv.zone;
        if(context.kind==='under')return teams[`under:${context.slot??0}`]||[];
        if(context.kind==='candy')return teams.candy||[];
        if(context.kind==='raid')return teams[`raid:${context.reg}`]||[];
        if(context.kind==='elite')return s.adv.league?.reg===context.reg&&s.adv.league.team?.length?s.adv.league.team:teams[`league:${context.reg}`]?.length?teams[`league:${context.reg}`]:s.team||[];
        if(['zone','worldCapture'].includes(context.kind)){
            const id=zone&&[zone.id,zone.foe].includes(context.id)?zone.id:context.id;
            return teams[`zone:${id}`]?.length?teams[`zone:${id}`]:s.team||[];
        }
        return [];
    }
    function preparationCosts(s,pool,desired){
        const xp=new Map(),known=new Set(),references=new Map();
        for(const mon of pool){
            const goal=Math.min(desired,trainingCap(s,mon));
            const gap=candyXpGap(s,mon,goal);if(gap!=null)known.add(mon.uid);
            xp.set(mon.uid,gap??Math.max(0,goal-mon.level));
            if(!references.has(goal))references.set(goal,candyXpGap(s,{...mon,level:Math.max(1,goal-3),rank:0,xp:0},goal)||3);
        }
        const scale=Math.max(1,...references.values()),costs=Object.fromEntries([...xp].map(([uid,gap])=>[uid,gap/scale]));
        const burden=uids=>{
            const values=uids.map(uid=>costs[uid]||0),sum=values.reduce((n,value)=>n+value,0);
            return{cost:Math.max(0,...values)+.25*sum,xp:uids.every(uid=>known.has(uid))?uids.reduce((n,uid)=>n+(xp.get(uid)||0),0):null};
        };
        return{costs,burden};
    }
    function preparationPlan(s,settings,context){
        const desired=Math.min(100,context.level+settings.prepareMargin),available=new Map((s.mons||[]).map(m=>[m.uid,m]));
        if(context.kind==='tower'){
            const progress=towerProgress(s),actual=towerParty(s,{snapshot:!!progress.run,floor:progress.run?progress.floor:1});
            const under=(s.under?.slots||[]).flatMap(slot=>slot.mons||[]),index=new Map([...under,...(s.mons||[])].map(mon=>[mon.uid,mon]));
            // The native tower owns selection and order. Train its actual leading survivors,
            // rather than a hypothetical matchup team which the tower will never deploy.
            const members=actual.map(mon=>index.get(mon.src)||mon).map(mon=>({uid:mon.uid,id:mon.id,level:mon.level,goal:Math.min(desired,trainingCap(s,mon)),trainable:available.has(mon.uid)}));
            const targets=members.filter(mon=>mon.trainable&&mon.level<mon.goal),needed=targets.some(mon=>mon.goal-mon.level>settings.prepareGap);
            const uids=settings.autoTeam===false?[...(s.team||[])]:members.filter(mon=>mon.trainable).map(mon=>mon.uid),used=new Set(members.filter(mon=>mon.trainable).map(mon=>DATA.combat.singles[mon.id]||mon.id));
            if(settings.autoTeam!==false)for(const mon of [...(s.mons||[])].filter(mon=>teamEligible(s,mon,context.reg)).sort((a,b)=>b.level-a.level)){
                const identity=DATA.combat.singles[mon.id]||mon.id;if(uids.length>=6)break;
                if(!used.has(identity)){used.add(identity);uids.push(mon.uid);}
            }
            return{needed,members,targets,uids,desired,selection:{source:'native-tower'},capLimited:members.some(mon=>mon.goal<desired)};
        }
        let pool=(s.mons||[]).filter(m=>teamEligible(s,m,context.reg));
        if(context.kind==='under')pool=undergroundMembers(s);
        if(context.kind==='worldAttack')pool=pool.filter(m=>!s.wb?.used?.[m.uid]);
        const now=Date.now(),future=pool.map(m=>{
            const level=Math.max(m.level,Math.min(desired,trainingCap(s,m)));
            return settings.autoEvolve===false?{...m,level}:projectEvolution(s,m,level,now);
        }),futureByUid=new Map(future.map(m=>[m.uid,m]));
        const forecastIdentity=m=>DATA.combat.singles[m.id]||(context.speciesUnique?`sp:${m.id}`:`${m.id}:${+!!m.shiny}`);
        const ordinary=['map','progress'].includes(context.kind),configured=ordinary?[]:configuredBattleTeam(s,context);
        const choose=ordinary?settings.autoTeam:settings.optimizeRaid||['tower','worldAttack'].includes(context.kind);
        const planning={reg:context.reg,pool:future,foes:context.foes,size:context.size,speciesUnique:context.speciesUnique,force:true};
        let selected,selection=null,ready=false;
        if(configured.length)selected=configured.slice(0,context.size||6);
        else if(choose){
            if(ordinary){
                const actual=planAdventureTeam({...s,mons:pool},settings,[],{...planning,pool}),assessment=!context.forcePreparation?preparationReadiness(s,settings,context,actual.uids):null;
                if(assessment?.ready){
                    selected=actual.uids;ready=true;selection={quality:actual.score,score:actual.score,cost:0,xp:0,source:'current',ready:true};
                }else{
                    const training=preparationCosts(s,pool,desired),penalty=.16;
                    const projected=planAdventureTeam({...s,mons:future},settings,[],planning);
                    const economical=planAdventureTeam({...s,mons:future},settings,[],{...planning,trainingCosts:training.costs,trainingPenalty:penalty});
                    const seen=new Set(),candidates=[];
                    for(const[source,candidate]of [['current',actual],['cost',economical],['potential',projected]]){
                        const identities=new Set(),uids=candidate.uids.filter(uid=>{const mon=futureByUid.get(uid);if(!mon)return false;const key=forecastIdentity(mon);if(identities.has(key))return false;identities.add(key);return true;});
                        const signature=[...uids].sort().join('|');if(seen.has(signature))continue;seen.add(signature);
                        const allowed=new Set(uids),fixed=future.filter(mon=>allowed.has(mon.uid));
                        const quality=planAdventureTeam({...s,mons:future,team:uids},settings,uids,{...planning,pool:fixed}).score;
                        const burden=training.burden(uids),score=quality/(1+penalty*burden.cost);
                        const growing=uids.some(uid=>{const mon=available.get(uid);return mon&&mon.level<Math.min(desired,trainingCap(s,mon));});
                        candidates.push({uids,growing,quality,score,...burden,source,ready:false});
                    }
                    // A real defeat disproves the mature squad's zero-cost advantage.
                    // Prefer a trainable improvement over repeatedly retrying that same
                    // capped lineup, without inventing a project of equal or lower quality.
                    const current=candidates.find(candidate=>candidate.source==='current');
                    const recovery=context.forcePreparation&&current&&!current.growing?candidates.filter(candidate=>candidate.growing&&candidate.quality>current.quality*1.01+.002):[];
                    for(const candidate of recovery.length?recovery:candidates)if(!selection||candidate.score>selection.score+1e-8){
                        const{uids,growing,...comparison}=candidate;selected=uids;selection={...comparison,recovery:recovery.length>0};
                    }
                }
            }else{
                const projected=planAdventureTeam({...s,mons:future},settings,[],planning);selected=projected.uids;
                const identity=m=>DATA.combat.singles[m.id]||(context.speciesUnique?`sp:${m.id}`:`${m.id}:${+!!m.shiny}`);
                const readyPool=pool.filter(m=>m.level>=Math.min(desired,trainingCap(s,m))),count=Math.min(context.size||6,new Set(pool.map(identity)).size);
                if(count&&readyPool.length<pool.length&&new Set(readyPool.map(identity)).size>=count){
                    const actual=planAdventureTeam({...s,mons:readyPool},settings,[],{...planning,pool:readyPool});
                    if(projected.score<=actual.score*1.05+.01)selected=actual.uids;
                }
            }
        }else selected=ordinary?partyMons(s).filter(m=>teamEligible(s,m,context.reg)).map(m=>m.uid):[];
        if(context.speciesUnique){const seen=new Set();selected=selected.filter(uid=>{const m=(ready?pool.find(m=>m.uid===uid):futureByUid.get(uid)),key=m&&(DATA.combat.singles[m.id]||m.id);return key&&!seen.has(key)&&seen.add(key);});}
        const index=new Map(pool.map(m=>[m.uid,m])),members=selected.map(uid=>index.get(uid)).filter(Boolean).map(m=>{
            const projected=ready?(settings.autoEvolve===false?m:projectEvolution(s,m,m.level,now)):futureByUid.get(m.uid)||m;
            return{uid:m.uid,id:m.id,level:m.level,goal:ready?m.level:Math.min(desired,trainingCap(s,m)),trainable:available.has(m.uid),...projected.id!==m.id?{potentialId:projected.id}:{}};
        });
        const targets=members.filter(m=>m.trainable&&m.level<m.goal),needed=targets.some(m=>m.goal-m.level>settings.prepareGap);
        const identity=m=>DATA.combat.singles[m.id]||`${m.id}:${+!!m.shiny}`,used=new Set(),team=[];
        const add=m=>{if(m&&team.length<6&&!used.has(identity(m))){used.add(identity(m));team.push(m);}};
        for(const m of members)add(available.get(m.uid));
        if(!ready&&settings.autoTeam!==false)for(const m of(s.mons||[]).filter(m=>teamEligible(s,m,context.reg)).sort((a,b)=>b.level-a.level))add(m);
        // Keep every selected learner, but order the temporary party using its real
        // current battle strength rather than projected levels or level alone.
        const uids=settings.autoTeam===false?[...(s.team||[])]:ready?[...selected]:choose?planAdventureTeam(s,settings,team.map(m=>m.uid),{reg:context.reg,pool:team,foes:context.foes,objective:'train',force:true}).uids:team.map(m=>m.uid);
        return{needed,members,targets,uids,desired,selection,capLimited:!ready&&members.some(m=>m.goal<desired)};
    }
    function battleRouteFit(s,row,uids=s.team||[],now=Date.now()){
        const index=new Map((s.mons||[]).map(m=>[m.uid,m]));
        const team=uids.map(uid=>index.get(uid)).filter(m=>m&&teamEligible(s,m,row.reg)).map(m=>({...m,status:null}));
        const foes=(row.members?.length?row.members.map(id=>CHAPTERS.get(id)).filter(Boolean).flatMap(chapter=>chapterCombatFoes(s,chapter)):chapterCombatFoes(s,row)).filter(m=>MONS.has(m.id)&&m.weight>0);
        if(!team.length||!foes.length)return{factor:1,turns:null,coverage:null};
        const weatherRows=foes.map(foe=>combatWeather(s,foe,{row},now)),weatherKey=JSON.stringify(weatherRows.map(row=>row.signature));
        const key=JSON.stringify([row.reg,s.autoSwitch!==false,foes,team.map(combatProfile),weatherKey]),cached=ROUTE_FITS.get(key);
        if(cached)return{...cached};
        const allies=team.map(mon=>({mon,stats:effectiveStats(mon)}));let weight=0,cost=0,covered=0,deaths=0,minCoverage=1,worstTurns=0,worstDeaths=0;
        for(const [i,foe]of foes.entries()){
            const defense=effectiveStats(foe),battle=deployedBattle(allies.map(({mon,stats})=>matchupDetails(mon,foe,stats,defense,weatherRows[i])),s.autoSwitch!==false);
            weight+=foe.weight;cost+=foe.weight*battle.turns;covered+=foe.weight*battle.coverage;deaths+=foe.weight*battle.deaths;
            minCoverage=Math.min(minCoverage,battle.coverage);worstTurns=Math.max(worstTurns,battle.turns);worstDeaths=Math.max(worstDeaths,battle.deaths);
        }
        // Static route time assumes a short fight; allow three expected attack turns per foe.
        // Low survival increases that cost, while observed complete runs supersede this model.
        const turns=cost/weight;
        const fit={factor:Math.max(.02,Math.min(1,3/turns)),turns,coverage:covered/weight,deaths:deaths/weight,minCoverage,worstTurns,worstDeaths,weatherKey};
        ROUTE_FITS.set(key,fit);if(ROUTE_FITS.size>256)ROUTE_FITS.delete(ROUTE_FITS.keys().next().value);
        return{...fit};
    }
    function rebuildPreparationContext(s,saved){
        if(!saved||!['map','progress'].includes(saved.kind)||saved.foes?.length)return saved;
        const c=CHAPTERS.get(saved.id);
        if(!c||saved.reg&&c.reg!==saved.reg)return{...saved,foes:[]};
        const row={...c,members:c.league?DATA.chapters.filter(member=>member.loop===c.loop).map(member=>member.id):[c.id]};
        const rebuilt=battleContext(s,saved.kind,{row,roamId:saved.roamId});
        return{...rebuilt,...saved,foes:rebuilt.foes};
    }
    function preparationReadiness(s,settings,context,uids=s.team||[]){
        const reject=reason=>({ready:false,fit:null,reason});
        if(!['map','progress'].includes(context?.kind))return reject('独立活动保留原有等级补练要求');
        if(!settings.autoTeam)return reject('手动配队保留原定补练目标');
        if(context.forcePreparation)return reject('实际战败后先补练，再重新评估');
        if(!Array.isArray(uids)||!uids.length||uids.length>6||new Set(uids).size!==uids.length)return reject('目标队伍为空或成员重复');
        const index=new Map((s.mons||[]).map(mon=>[mon.uid,mon])),team=uids.map(uid=>index.get(uid));
        if(team.some(mon=>!mon||!teamEligible(s,mon,context.reg)))return reject('目标成员不在PC或不符合地区限制');
        const identity=mon=>DATA.combat.singles[mon.id]||`${mon.id}:${+!!mon.shiny}`;
        if(new Set(team.map(identity)).size!==team.length)return reject('目标成员不能同时出战');
        context=rebuildPreparationContext(s,context);
        const foes=(context.foes||[]).filter(foe=>MONS.has(foe.id)&&foe.weight>0);
        if(!foes.length)return reject('目标敌人数据不足，保留等级补练要求');
        // The aggregate route data omits encounter kinds. Apply native gym HP and
        // damage margins to every matchup so ordinary opponents cannot hide a boss.
        const hpMargin=1.3*(6/team.length)**.7,damageMargin=1.3;
        const allies=team.map(mon=>({mon:{...mon,status:null},stats:effectiveStats(mon)}));
        let weight=0,turns=0,deaths=0,coverage=0,minCoverage=1,worstTurns=0,worstDeaths=0,hardest=null;
        for(const foe of foes){
            const guarded={...foe,hpMult:(foe.hpMult||1)*hpMargin},defense=effectiveStats(guarded),weather=combatWeather(s,foe,context,context.now??Date.now());
            const details=allies.map(({mon,stats})=>{
                const detail=matchupDetails(mon,guarded,stats,defense,weather),incoming=detail.incoming;
                return{...detail,incoming:{...incoming,damage:incoming.damage*damageMargin,sustainedDamage:incoming.sustainedDamage*damageMargin,hit:incoming.hit*damageMargin,minHit:incoming.minHit*damageMargin,maxHit:incoming.maxHit*damageMargin}};
            });
            const battle=deployedBattle(details,s.autoSwitch!==false);
            weight+=foe.weight;turns+=foe.weight*battle.turns;deaths+=foe.weight*battle.deaths;coverage+=foe.weight*battle.coverage;
            minCoverage=Math.min(minCoverage,battle.coverage);worstDeaths=Math.max(worstDeaths,battle.deaths);
            if(!hardest||battle.turns>worstTurns){hardest=foe;worstTurns=battle.turns;}
        }
        const fit={coverage:coverage/weight,minCoverage,turns:turns/weight,worstTurns,deaths:deaths/weight,worstDeaths,opponents:foes.length};
        const progress=context.kind==='progress',limits=progress?{turns:4.5,worst:12,deaths:.25,knockouts:2}:{turns:3,worst:8,deaths:.15,knockouts:1};
        const ready=minCoverage>=.999&&fit.turns<=limits.turns&&worstTurns<=limits.worst&&fit.deaths<=limits.deaths&&worstDeaths<=limits.knockouts;
        const label=MONS.get(hardest?.id)?.name||'目标对手';
        const reason=ready?'实际战力已具备稳妥尝试条件，无需所有成员达到等级目标':minCoverage<.999?`${label}等对局仍难以稳定处理`:worstDeaths>limits.knockouts||fit.deaths>limits.deaths?'关键对局预计倒下成员较多，继续补练':`${label}等对局耗时偏高，继续补练`;
        return{ready,fit,reason};
    }
    function leagueTrainingModel(s,settings,row,battleFit=battleRouteFit(s,row),now=Date.now()){
        const party=partyMons(s),chapters=(row.members||[]).map(id=>CHAPTERS.get(id)).filter(Boolean);
        const key=JSON.stringify([row.reg,s.autoSwitch!==false,party.map(mon=>combatProfile({...mon,status:null})),chapters.map(chapter=>[chapter.id,chapterFoes(s,chapter)]),battleFit.weatherKey]),cached=LEAGUE_TRAINING_ROWS.get(key);
        if(cached)return{...cached,completedMembers:[...cached.completedMembers]};
        // A slower league can still be better training. The safety boundary guards
        // severe attrition and losing matchups, rather than requiring a three-turn clear.
        const capable=party.length>0&&party.length<=6&&party.every(mon=>teamEligible(s,mon,row.reg))&&new Set(party.map(mon=>mon.uid)).size===party.length&&
            battleFit.minCoverage>=.999&&battleFit.turns<=10&&battleFit.worstTurns<=24&&battleFit.deaths<=1.25&&battleFit.worstDeaths<=Math.max(1,party.length-2);
        let xpPerMember=0,seconds=0,failedAt=null;const completedMembers=[];
        if(capable)for(const chapter of chapters){
            const assessment=preparationReadiness(s,{...settings,autoTeam:true},{kind:'progress',id:chapter.id,reg:row.reg,foes:chapterCombatFoes(s,chapter),now},s.team),fit=assessment.fit;
            const base=Math.max(20,chapter.units*2.8/2.5),turns=fit?.turns??150;
            seconds+=base*Math.max(1,turns/3);
            const reliable=fit&&fit.minCoverage>=.999&&fit.worstTurns<=24&&fit.turns<=10&&fit.worstDeaths<=Math.max(1,party.length-2);
            if(!reliable){failedAt=chapter.id;seconds+=20;break;}
            xpPerMember+=chapter.xpEstimate||0;completedMembers.push(chapter.id);
        }
        // Credit only the reliably reachable prefix, while charging for the failed
        // chapter and restarting. Partial attempts are never reported as full-cycle XP.
        const model={allowed:capable&&completedMembers.length>0,xpPerMember,seconds:Math.max(20,seconds),riskFactor:1/(1+.25*(battleFit.deaths||0)),completedMembers,failedAt,partial:completedMembers.length<chapters.length};
        LEAGUE_TRAINING_ROWS.set(key,model);if(LEAGUE_TRAINING_ROWS.size>128)LEAGUE_TRAINING_ROWS.delete(LEAGUE_TRAINING_ROWS.keys().next().value);
        return{...model,completedMembers:[...completedMembers]};
    }
    function preparationRoutes(s,settings,preparation,metrics={},now=Date.now()){
        const options={...settings,region:'all'};
        const training={...s,team:preparation.uids};
        let rows=trainingCandidates(s,options).filter(row=>row.reg===preparation.context.reg);
        rows=rows.map(row=>xpRouteScore(training,options,row,metrics,now));
        const maximum=row=>Math.max(...row.members.map(id=>CHAPTERS.get(id)?.ace||1));
        if(Number.isFinite(preparation.routeCeiling))rows=rows.filter(row=>maximum(row)<=preparation.routeCeiling);
        // Ordinary frontiers need quick winning matchups. Open leagues instead compare
        // reachable-prefix experience against attempt/recovery costs; complete native
        // cycle measurements supersede either estimate. Weak starters keep the fallback.
        const safe=rows.filter(row=>row.trainingSafe),start=DATA.regions.find(region=>region.key===preparation.context.reg)?.start;
        const fallback=rows.filter(row=>!row.trainingFrontier||row.id===start),minimum=Math.min(...fallback.map(maximum));
        return(safe.length?safe:fallback.filter(row=>maximum(row)===minimum)).filter(row=>(preparation.avoid?.[row.key]||0)<=now)
            .map(row=>({...row,fallback:!safe.length})).sort((a,b)=>b.rate-a.rate||a.id-b.id);
    }

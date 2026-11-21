    function ownedItems(s, id) { return (Number(s.items?.[id]) || 0) + (Number(s.link?.stash?.items?.[id]) || 0); }
    function itemCounter(s, id) { return s.stats?.itemIn && typeof s.stats.itemIn === 'object' ? Number(s.stats.itemIn[id]) || 0 : ownedItems(s, id); }
    function purchaseEvidence(s,id,cost) {
        const category=Object.hasOwn(DATA.automation.candies,id)?'candy':'shop';
        return {category,cost,spendBefore:Number(s.stats?.spent?.[category])||0,walletBefore:s.money,
            stock:Number(s.items?.[id])||0,in:itemCounter(s,id)};
    }
    function purchasePaid(s,tx) {
        if(!Number.isSafeInteger(tx.cost)||tx.cost<=0)return false;
        if(s.stats?.spent!=null){
            const after=Number(s.stats.spent[tx.category]);
            return Number.isFinite(after)&&Number.isFinite(tx.spendBefore)&&after-tx.spendBefore>=tx.cost;
        }
        return Number.isFinite(tx.walletBefore)&&Number.isFinite(s.money)&&tx.walletBefore-s.money>=tx.cost;
    }
    function purchaseConfirmed(s,tx) {
        const received=itemCounter(s,tx.id)>(tx.in??tx.counter)||(Number(s.items?.[tx.id])||0)>tx.stock;
        // Earlier checkpoints did not record the debit baseline. Reconcile them once using their original receipt.
        return received&&(tx.cost===undefined||purchasePaid(s,tx));
    }
    function purchasedQuantity(s, id, flow) {
        // Older task checkpoints recorded the starting inventory counter.
        return flow.resourcePurchased ?? Math.max(0, itemCounter(s,id) - (flow.resourceIn ?? itemCounter(s,id)));
    }
    function usedQuantity(s,id,flow) {
        const out=Number(s.stats?.itemOut?.[id])||0;
        return flow.resourceUsed??Math.max(0,out-(flow.resourceOut??out));
    }
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
    function eliteItemHint(item){
        if(!item?.eliteReward)return '';
        const {zone,tier}=item.eliteReward;
        return `在「传说战」击败${MONS.get(zone).name}精英 ${tier} 阶，可领取一次${item.name}。`;
    }
    function sourceAvailable(s, source, itemId, now = Date.now()) {
        if (source.until && s.adv.gifts?.[source.until] || source.upTo && (s.items?.[itemId] || 0) >= source.upTo) return false;
        if (source.once && s.adv.gifts?.[source.once] || source.badge && !s.adv.badges?.includes(source.badge)) return false;
        if (source.tide && source.tide !== (Math.floor(now / (DATA.tideMs || 10800000)) % 2 === 0 ? 'low' : 'high')) return false;
        if (source.owns?.some(id => !ownsMon(s, id))) return false;
        if (source.day && phaseAt(s,now,source.ch)==='night') return false;
        if (source.team && !source.team.every(id=>partyMons(s,s.road?.length?s.road:s.team).some(mon=>mon.id===id))) return false;
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
        const metricKey=routeMetricKey(s,settings,now);
        const roamingOpen=ROAMING_DATA.groups.some(group=>s.adv.badges?.includes(group.badge));
        const sourceYield=source=>roamingOpen?source.expected:source.beforeRoaming??source.expected;
        return candidates(s, settings).filter(row => (cooldowns[row.key] || 0) <= now).map(row => {
            const sources = item.sources.filter(source => row.members.includes(source.ch) && sourceYield(source)>0 && sourceAvailable(s, source, item.id, now));
            const seconds = estimatedRouteSeconds(row,settings.speed);
            const expected = sources.reduce((n, source) => n + sourceYield(source) * (source.kind === 'town' ? Math.min(1, seconds * 1000 / Math.max(1, DATA.townCooldown || 1)) : 1), 0);
            const m = metrics[metricKey(row)], measured = m?.itemSeconds > 0;
            const count = Number(m?.itemCounts?.[item.id]) || 0;
            const estimate = expected / seconds * 60;
            // A zero-drop trial cannot make a rare but valid source look impossible.
            const rate = measured ? (count + expected * 2) / (m.itemSeconds + seconds * 2) * 60 : estimate;
            return { ...row, rate, expected, measured, actualRate: measured ? count / m.itemSeconds * 60 : null, samples: m?.itemRuns || 0, sources };
        }).filter(row => row.expected > 0).sort((a, b) => b.rate - a.rate || a.id - b.id);
    }
    const leagueBadgesByRegion = new Map(DATA.regions.map(region => [region.key,
        DATA.chapters.filter(chapter => chapter.reg === region.key && chapter.league).flatMap(chapter => chapter.badges || [])]));
    function trainingCap(s, mon) {
        const caps = DATA.caps?.[s.adv.unlocked];
        if(!caps)return 100;
        const regional=reg=>leagueBadgesByRegion.get(reg)?.some(badge=>s.adv.badges?.includes(badge))?100:caps[reg]??caps.main;
        if(s.link)return Math.min(100,regional(monRegion(mon)));
        // A shared wallet still obeys the next gym cap of every opened, reached region.
        // An older save can have fewer regions open than the reference frontier.
        const open=new Set(['kanto',...(s.travel?.to||[]),currentRegion(s)]);
        const values=DATA.regions.filter(r=>open.has(r.key)&&r.start<=s.adv.unlocked).map(r=>regional(r.key));
        return Math.min(100,...(values.length?values:[caps.main]));
    }
    function trainingUids(s,settings,pinned) {
        if (Array.isArray(pinned) && pinned.length) return [...pinned];
        if (settings.trainUid === 'selected') return [...(settings.trainUids || [])];
        return settings.trainUid === 'team' ? [...(s.team || [])] : [settings.trainUid];
    }
    function trainingParty(s,targets){
        const roster=new Map(s.mons.map(mon=>[mon.uid,mon])), seen=new Set(), uids=[];
        for(const uid of new Set([...targets,...s.team])){
            const mon=roster.get(uid);if(!mon)continue;
            const slot=DATA.combat.singles[mon.id]||mon.id+':'+Number(!!mon.shiny);
            if(seen.has(slot))continue;
            seen.add(slot);uids.push(uid);
            if(uids.length===6)break;
        }
        return uids;
    }
    function trainingStatus(s, settings, protectedUids = null) {
        const ids=trainingUids(s,settings,protectedUids), party=partyMons(s);
        const source=settings.trainUid==='selected'&&settings.autoTeam?s.mons||[]:party;
        const targets=ids.map(uid=>source.find(mon=>mon.uid===uid)).filter(Boolean);
        const usedSlots=new Set(targets.map(mon=>DATA.combat.singles[mon.id]||mon.id+':'+Number(!!mon.shiny)));
        const conflict=settings.trainUid==='selected'&&usedSlots.size!==targets.length;
        const missing=conflict||!ids.length || targets.length!==ids.length || settings.trainUid==='selected'&&targets.some(mon=>!teamEligible(s,mon));
        const available = targets.filter(m => m.level < Math.min(settings.trainLevel, trainingCap(s, m)));
        return { targets, available, missing, conflict, complete: !missing && targets.every(m => m.level >= settings.trainLevel),
            capped: targets.length > 0 && !available.length && targets.some(m => m.level < settings.trainLevel),
            cap: targets.length ? Math.min(...targets.map(m => trainingCap(s, m))) : 0 };
    }
    function trainingGemTarget(s,cfg,pinned,budget,skipped={}) {
        if(cfg.mode!=='train'||!cfg.trainGems||cfg.trainUid==='team'||cfg.trainLevel!==100)return null;
        const status=trainingStatus(s,cfg,pinned);
        if(status.missing)return null;
        const gems=s.under?.gems||{};
        for(const mon of status.targets){
            const next=(mon.rank||0)+1, model=MONS.get(mon.id);
            if(!model||mon.level!==100||next>cfg.trainRank||trainingCap(s,mon)<100||
                EVOLUTION_DATA.rules[mon.id]?.length||budget.check(s,0,next))continue;
            // The native rank button verifies rarity. Both types can supply the cost,
            // but several smaller gem stacks cannot pay for one rank together.
            const stock=Object.entries(gems).filter(([key,count])=>model.types.includes(key.split(':')[0])&&Number.isSafeInteger(count)&&count>=next);
            if(!stock.length)continue;
            const key=JSON.stringify([mon.id,next,stock.sort()]);
            if(skipped[mon.uid]!==key)return {uid:mon.uid,id:mon.id,next,key};
        }
        return null;
    }
    function selectTrainingBuddy(s,settings,preparation=null,protectedUids=null){
        const party=new Set(s.team||[]),road=new Set(Array.isArray(s.road)&&s.road.length?s.road:s.team||[]);
        let targets;
        if(preparation)targets=preparation.targets||[];
        else if(settings.mode==='train'){
            const ids=trainingUids(s,settings,protectedUids);
            targets=ids.map(uid=>({uid,goal:settings.trainLevel}));
        }else return null;
        const goals=new Map(targets.map(target=>[target.uid,target.goal]));
        const eligible=(s.mons||[]).filter(mon=>party.has(mon.uid)&&road.has(mon.uid)&&goals.has(mon.uid)&&teamEligible(s,mon)&&mon.level<Math.min(Number(goals.get(mon.uid))||0,trainingCap(s,mon)));
        if(eligible.some(mon=>mon.uid===s.buddy?.uid))return s.buddy.uid;
        const order=new Map((s.team||[]).map((uid,i)=>[uid,i]));
        return eligible.sort((a,b)=>a.level-b.level||(order.get(a.uid)??999)-(order.get(b.uid)??999)||String(a.uid).localeCompare(String(b.uid)))[0]?.uid||null;
    }
    function recordedXpCompatible(region, multiplier) {
        // Untagged checkpoints and samples used the former 1× Unova curve.
        return multiplier == null ? region !== 'unova' : multiplier === DATA.economy.xpMultipliers[region];
    }
    function rankedXpTable(tables, mon) {
        if (!tables) return null;
        const rank = Math.floor(Number(mon.rank) || 0);
        return tables[Math.min(tables.length - 1, Math.max(0, rank))];
    }
    function experienceTotal(s, uids = s.team || []) {
        const tables = DATA.xpThresholds?.[economicRegion(s)];
        let total = 0;
        for (const uid of uids) {
            const mon = (s.mons || []).find(m => m.uid === uid); if (!mon) return null;
            const table = rankedXpTable(tables, mon);
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
    const STORY_FIT_LIMITS={turns:4.5,worst:12,deaths:.25,knockouts:2};
    const MAP_FIT_LIMITS={turns:3,worst:8,deaths:.15,knockouts:1};
    function clearsWithinLimits(fit,limits){
        return fit.minCoverage>=.999&&fit.turns<=limits.turns&&fit.worstTurns<=limits.worst&&fit.deaths<=limits.deaths&&fit.worstDeaths<=limits.knockouts;
    }
    function* xpRouteSearch(s,settings,row,m,now,sliced,projection){
        const {party,yieldMembers,xpMult}=projection;
        const measured=m?.xpSeconds>0,samples=m?.xpRuns||0;
        const battleFit=yield* battleRouteFitSearch(s,row,party,now,sliced);
        const experience=row.members.reduce((n,id)=>n+(CHAPTERS.get(id).xpEstimate||0),0)*yieldMembers*xpMult;
        const leagueTraining=row.league?yield* leagueTrainingSearch(s,settings,row,battleFit,now,sliced,party):null;
        const model=leagueTraining?leagueTraining.xpPerMember*yieldMembers*xpMult/leagueTraining.seconds*60*leagueTraining.riskFactor:experience/estimatedRouteSeconds(row,settings.speed)*60*battleFit.factor;
        const estimate=estimateWithHistory(model,m?.historicalRate);
        const actualRate=measured?m.xp/m.xpSeconds*60:null,confidence=measured?Math.min(1,samples/2):0;
        const levels=party.filter(mon=>teamEligible(s,mon,row.reg)).map(mon=>mon.level).sort((a,b)=>b-a);
        const lead=(levels[0]||1)*.75+(levels[1]||levels[0]||1)*.25,maxLevel=Math.max(...row.members.map(id=>CHAPTERS.get(id)?.ace||1));
        const proven=measured&&samples>=2&&actualRate>0;
        const efficient=battleFit.coverage>=.9&&battleFit.turns>0&&battleFit.turns<=3;
        // The time model already charges for slower fights. A new chapter also
        // needs an answer to its worst matchup before we try its full loop.
        const covered=battleFit.minCoverage>=.999;
        const ordinary=clearsWithinLimits(battleFit,STORY_FIT_LIMITS)||efficient&&(!row.trainingFrontier||covered)||!row.trainingFrontier&&maxLevel<=lead;
        const trainingSafe=proven||(leagueTraining?leagueTraining.allowed:ordinary);
        return{...row,rate:confidence*(actualRate||0)+(1-confidence)*estimate,estimatedRate:estimate,actualRate,measured,samples,battleFit,leagueTraining,maxLevel,trainingSafe,fallback:!trainingSafe};
    }
    function xpRanking(s, settings, metrics = {}, cooldowns = {}, now = Date.now()) {
        return completeYieldRanking(yieldRankingRequest('xp',s,settings,metrics,now),cooldowns,now);
    }
    function yieldRankingRequest(kind,s,settings,metrics,now){
        let maps=kind==='xp'?trainingCandidates(s,settings):candidates(s,settings,true);
        let otherWallet=null;
        if(s.link){
            const onCurrentSide=row=>(row.reg===s.link.to)===(s.link.side==='to');
            // Entering the other side replaces the entire adventure team. A named
            // trainee or a protected training party cannot earn XP on that trip.
            if(kind==='money'&&maps.some(row=>!onCurrentSide(row))&&!(settings.mode==='money'&&settings.moneyTarget>0)){
                otherWallet=otherMoneyParty(s);
            }
            if(!otherWallet)maps=maps.filter(onCurrentSide);
        }
        return makeYieldRankingRequest(kind,s,settings,metrics,now,maps,undefined,otherWallet);
    }
    function otherMoneyParty(s){
        // Native Game.enterRegion swaps the team and wallet while both groups'
        // Pokémon stay in S.mons. It drops missing UIDs before applying side rules.
        const link=s.link,stored=link.stash?.team;
        if(!Array.isArray(stored)||!['from','to'].includes(link.side))return null;
        const side=link.side==='to'?'from':'to',reg=side==='to'?link.to:link.from;
        if(!reg)return null;
        const index=new Map(s.mons.map(mon=>[mon.uid,mon]));
        const existing=stored.map(uid=>index.get(uid)).filter(Boolean);
        let members=existing.filter(mon=>teamEligible(s,mon,reg));
        if(existing.length&&!members.length){
            const backup=s.mons.filter(mon=>teamEligible(s,mon,reg)).sort((a,b)=>b.level-a.level)[0];
            if(backup)members=[backup];
        }
        if(!members.length)return null;
        return {...s,team:members.map(mon=>mon.uid),link:{...link,side}};
    }
    function preparationRankingRequest(s,settings,preparation,metrics,now){
        const options={...settings,region:'all'},reg=preparation.context.reg;
        const maps=trainingCandidates(s,options).filter(row=>row.reg===reg);
        const training={...s,team:[...(preparation.uids||[])]};
        const request=makeYieldRankingRequest('preparation',training,options,metrics,now,maps,reg);
        request.ceiling=preparation.routeCeiling;
        return request;
    }
    function makeYieldRankingRequest(kind,s,settings,metrics,now,maps,reg,otherWallet=null){
        const xp=kind!=='money';
        const metricKey=routeMetricKey(s,settings,now);
        const otherKey=otherWallet&&routeMetricKey(otherWallet,settings,now);
        const states=maps.map(row=>otherWallet&&(row.reg===s.link.to)===(otherWallet.link.side==='to')?otherWallet:s);
        // The telemetry object mutates in place. Pin precisely the fields read by
        // this search so a sample crossing two slices cannot mix measurements.
        const samples=maps.map((row,i)=>{
            const key=states[i]===s?metricKey:otherKey,exact=key(row),m=metrics[exact];
            if(xp?m?.xpSeconds>0:m?.seconds>0)return xp?{xp:m.xp,xpSeconds:m.xpSeconds,xpRuns:m.xpRuns}:{net:m.net,seconds:m.seconds,runs:m.runs};
            const legacy=key(row,false);
            if(exact===legacy)return;
            const mixed=metrics[legacy],seconds=xp?mixed?.xpSeconds:mixed?.seconds,runs=xp?mixed?.xpRuns:mixed?.runs;
            if(seconds>0&&runs>0)return {historicalRate:(xp?mixed.xp:mixed.net)/seconds*60};
        });
        const otherInputs=otherWallet&&yieldRankingInputs(otherWallet,settings,[],now);
        const signature=JSON.stringify([reg,yieldRankingInputs(s,settings,maps,now),otherInputs,maps.map(row=>row.key),samples]);
        const needsSlices=kind==='preparation' ? maps.length>=4||maps.some(row=>row.league)
            : maps.some(row=>row.reg!==maps[0].reg)||maps.length>=10&&maps.some(row=>row.league);
        return {kind,reg,startChapter:DATA.regions.find(region=>region.key===(reg||currentRegion(s)))?.start,signature,needsSlices,
            search:sliced=>scoreYieldRoutes(kind,s,settings,maps,samples,now,sliced,states)};
    }
    function* scoreYieldRoutes(kind,s,settings,maps,samples,now,sliced,states){
        let rows=[];
        const walletParties=new Map();
        let projection;
        if(kind!=='money'){
            const party=partyMons(s),growing=party.filter(mon=>mon.level<trainingCap(s,mon));
            const buddyShare=growing.some(mon=>mon.uid===s.buddy?.uid) ? .3 : 0;
            projection={party,yieldMembers:growing.length+buddyShare,xpMult:activeYieldBuff(s,'xp',now)?.mult||1};
        }
        for(const [i,row] of maps.entries()){
            if(kind!=='money')rows.push(yield* xpRouteSearch(s,settings,row,samples[i],now,sliced,projection));
            else{
                const state=states[i];
                if(!walletParties.has(state))walletParties.set(state,partyMons(state));
                const fit=yield* battleRouteFitSearch(state,row,walletParties.get(state),now,sliced);
                rows.push(moneyRouteScore(state,row,samples[i],fit,now,settings.speed));
            }
            if(sliced)yield;
        }
        return rows.sort((a,b)=>b.rate-a.rate||a.id-b.id);
    }
    function safeTrainingRoutes(rows,startChapter){
        const safe=rows.filter(row=>row.trainingSafe);
        if(safe.length)return safe;
        const replays=rows.filter(row=>!row.league&&(!row.trainingFrontier||row.id===startChapter));
        const minimum=Math.min(...replays.map(row=>row.maxLevel));
        return replays.filter(row=>row.maxLevel===minimum);
    }
    function selectYieldRoutes(request,rows,cooldowns,now){
        if(request.kind==='preparation'||request.kind==='xp'){
            if(Number.isFinite(request.ceiling))rows=rows.filter(row=>row.maxLevel<=request.ceiling);
            rows=safeTrainingRoutes(rows,request.startChapter);
        }
        return availableRankedRoutes(rows,cooldowns,now);
    }
    function completeYieldRanking(request,cooldowns,now){
        const slot=request.cacheSlot||request.kind;
        let cached=routeRankings.get(slot);
        if(cached?.signature!==request.signature){
            cached={signature:request.signature,rows:request.search(false).next().value};
            routeRankings.set(slot,cached);
        }
        return selectYieldRoutes(request,cached.rows,cooldowns,now);
    }
    function excludedTrainingLeagues(request,selected,cooldowns,now){
        const cached=routeRankings.get(request.kind);
        if(cached?.signature!==request.signature)return [];
        const result=[];
        for(const row of cached.rows){
            if(!row.league||selected.some(other=>other.key===row.key))continue;
            const causes=[];
            if(row.maxLevel>request.ceiling)causes.push(`补练难度上限 Lv.${request.ceiling}，联盟最高 Lv.${row.maxLevel}`);
            if(cooldowns[row.key]>now)causes.push(`退避剩余 ${Math.ceil((cooldowns[row.key]-now)/60000)} 分钟`);
            if(!row.trainingSafe)causes.push(row.leagueTraining.blockReason||'阵容未通过联盟评估');
            result.push({name:row.name,reason:causes.join('；'),rate:row.trainingSafe||row.measured?row.rate:null});
        }
        return result;
    }
    function candyRegion(s){return economicRegion(s);}
    function candyXpGap(s,mon,goal){
        goal=Math.min(goal,trainingCap(s,mon));if(mon.level>=goal)return 0;
        const table=rankedXpTable(DATA.xpThresholds[economicRegion(s)],mon);
        if(!table)return null;let need=-(Number(mon.xp)||0);
        for(let lv=mon.level;lv<goal;lv++){if(!(table[lv]>0))return null;need+=table[lv];}return Math.max(0,need);
    }
    function highestCandy(s,offers){
        const reg=candyRegion(s),types=DATA.automation.candies;
        let best=null,highestXp=0;
        for(const offer of offers){
            const xp=types[offer.id]?.xp[reg];
            if(xp>highestXp){best=offer;highestXp=xp;}
        }
        return best;
    }
    function candyChoice(s,mon,goal,offers=[]){
        const need=candyXpGap(s,mon,goal);if(!(need>0))return null;
        const types=DATA.automation.candies,reg=candyRegion(s);
        const owned=Object.entries(types).filter(([id,info])=>s.items?.[id]>0&&info.xp[reg]>0).map(([id,info])=>({id,xp:info.xp[reg],cost:0,owned:true,need}));
        if(owned.length)return owned.sort((a,b)=>Math.max(0,a.xp-need)-Math.max(0,b.xp-need)||b.xp-a.xp)[0];
        const best=highestCandy(s,offers);
        return best&&Number.isSafeInteger(best.cost)&&best.cost>0?{...best,xp:types[best.id].xp[reg],need,owned:false}:null;
    }
    function routeDescriptor(row){return Object.fromEntries(['id','key','reg','name','loop','league','members','reward','units','ace'].map(key=>[key,row[key]]));}
    function battleContext(s,kind,options={}){
        const row=options.row,c=CHAPTERS.get(row?.id??options.id??s.adv.chapter),zone=kind==='zone'?DATA.zones.find(z=>z.id===options.id):null;
        let reg=options.reg||row?.reg||zone?.reg||(['worldAttack','worldCapture','under'].includes(kind)?'sinnoh':c?.reg||currentRegion(s));
        if(kind==='tower'&&s.link&&reg===s.link.to)reg=DATA.regions.find(region=>region.key===s.link.from)?.key||DATA.regions.filter(region=>region.key!==s.link.to&&region.start<=s.adv.unlocked).at(-1)?.key||'kanto';
        let id=options.id??row?.id??c?.id,level=options.level,foes=[],size=6,label=options.label||row?.name||c?.name||kind;
        if(kind==='under'){
            const slot=Number(options.slot)||0,floor=Math.max(1,Number(options.floor)||1),theme=s.under?.next?.[slot]||'';
            const encounter=undergroundFoes(s,theme,floor);
            return{kind,id,reg,level:encounter.level,foes:encounter.foes,size:DATA.automation.under.team,slot,floor,
                tier:0,label:'地下通道 · 第 '+floor+' 层出发',key:`under:${slot}:${theme}:${floor}:${encounter.level}`};
        }
        if(kind==='map'||kind==='progress'){
            const chapters=row?.members||[id];level=Math.max(...chapters.map(id=>CHAPTERS.get(id)?.ace||1));
            foes=chapters.map(id=>CHAPTERS.get(id)).filter(Boolean).flatMap(chapter=>chapterCombatFoes(s,chapter));
            if(ROAMING_DATA.groups.some(group=>group.ids.includes(Number(options.roamId)))){level=ROAMING_DATA.level;foes=[{id:Number(options.roamId),level,weight:20},...foes.map(foe=>({...foe,gymCount:0,weight:foe.weight*.05}))];label='游荡捕获 · '+(MONS.get(Number(options.roamId))?.name||options.roamId);}
        }else if(kind==='zone'||kind==='raid'||kind==='worldCapture'){
            id=kind==='worldCapture'?493:id;level=level||zone?.level||DATA.automation.levels.raid;foes=[{id,level,weight:1}];size=kind==='raid'?2:6;
            label=options.label||({zone:'传说战',raid:'每日团体战',worldCapture:'世界首领捕获'}[kind]+' · '+(MONS.get(id)?.name||id));
        }else{
            const chapter=kind==='elite'?DATA.chapters.find(c=>c.reg===reg&&c.league):c?.reg===reg?c:DATA.chapters.filter(c=>c.reg===reg&&c.id<=s.adv.unlocked).at(-1);
            const all=chapter?chapterThreats({...s,adv:{...s.adv,battle:null}},chapter.id):[];
            level=level||(kind==='tower'?Math.min(DATA.automation.levels.towerMax,Math.floor(DATA.automation.levels.towerStart+(options.floor-1)*DATA.automation.levels.towerStep)+(options.floor%10===0?3:0)):100);
            foes=all.map(m=>({...m,level,gymCount:0}));
            label=options.label||({elite:'精英联盟',tower:'对战塔',worldAttack:'世界首领攻击'}[kind]||kind);
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
        return preparationSearch(s,settings,context,false).next().value;
    }
    function* preparationSearch(s,settings,context,sliced){
        const desired=Math.min(100,context.level+settings.prepareMargin),available=new Map((s.mons||[]).map(m=>[m.uid,m])),now=context.now??Date.now();
        if(context.kind==='tower'){
            const progress=towerProgress(s,now),actual=towerParty(s,{snapshot:!!progress.run,floor:progress.run?progress.floor:1,now});
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
        let pool=context.kind==='under'?undergroundMembers(s,now):(s.mons||[]).filter(m=>teamEligible(s,m,context.reg));
        if(context.kind==='worldAttack')pool=pool.filter(m=>!s.wb?.used?.[m.uid]);
        const forecastIdentity=m=>DATA.combat.singles[m.id]||(context.speciesUnique?`sp:${m.id}`:`${m.id}:${+!!m.shiny}`);
        const ordinary=['map','progress'].includes(context.kind),configured=ordinary?[]:configuredBattleTeam(s,context);
        const choose=ordinary?settings.autoTeam:settings.optimizeRaid||['tower','worldAttack'].includes(context.kind);
        const planning={reg:context.reg,foes:context.foes,size:context.size,speciesUnique:context.speciesUnique,force:true,now};
        const chapter=CHAPTERS.get(context.id);
        const dexReplay=context.kind==='map'&&!context.roamId&&!context.forcePreparation&&isDexReplay(s,settings,chapter)?chapter:null;
        const actual=ordinary&&choose?yield* adventureTeamSearch({...s,mons:pool},settings,[],{...planning,pool,dexReplay},sliced):null;
        const ready=!!actual&&!context.forcePreparation&&(actual.retainedForHunt||!!preparationReadiness(s,settings,context,actual.uids)?.ready);
        // A saved facility party takes precedence over every other candidate.
        // Its training preview only needs the individuals the native event will use.
        const fixedUids=configured.length?new Set(configured.slice(0,context.size||6)):null;
        const forecastPool=fixedUids?pool.filter(mon=>fixedUids.has(mon.uid)):choose?pool:ordinary?pool.filter(mon=>s.team.includes(mon.uid)):[];
        const future=[];
        if(!ready)for(const mon of forecastPool){
            future.push(trainingProjection(s,mon,desired,settings,now));
            if(sliced)yield;
        }
        const futureByUid=new Map(future.map(m=>[m.uid,m]));
        let selected,selection=null;
        if(configured.length)selected=configured.slice(0,context.size||6);
        else if(choose){
            if(ordinary){
                if(ready){
                    selected=actual.uids;selection={quality:actual.score,score:actual.score,cost:0,xp:0,source:'current',ready:true};
                }else{
                    const training=preparationCosts(s,pool,desired),penalty=.16;
                    const projected=yield* adventureTeamSearch({...s,mons:future},settings,[],planning,sliced);
                    const economical=yield* adventureTeamSearch({...s,mons:future},settings,[],{...planning,trainingCosts:training.costs,trainingPenalty:penalty},sliced);
                    const seen=new Set(),candidates=[];
                    for(const[source,candidate]of [['current',actual],['cost',economical],['potential',projected]]){
                        const identities=new Set(),uids=candidate.uids.filter(uid=>{const mon=futureByUid.get(uid);if(!mon)return false;const key=forecastIdentity(mon);if(identities.has(key))return false;identities.add(key);return true;});
                        const signature=[...uids].sort().join('|');if(seen.has(signature))continue;seen.add(signature);
                        const allowed=new Set(uids),fixed=future.filter(mon=>allowed.has(mon.uid));
                        const fixedPlan=yield* adventureTeamSearch({...s,mons:future,team:uids},settings,uids,{...planning,pool:fixed},sliced);
                        const quality=fixedPlan.score;
                        const burden=training.burden(uids),score=quality/(1+penalty*burden.cost);
                        const growing=uids.some(uid=>{const mon=available.get(uid);return mon&&mon.level<Math.min(desired,trainingCap(s,mon));});
                        const lockedCount=fixed.filter(mon=>mon.evolutionItemLocked).length;
                        candidates.push({uids,growing,quality,score,...burden,lockedCount,source,ready:false});
                    }
                    // A real defeat disproves the mature squad's zero-cost advantage.
                    // Prefer a trainable improvement over repeatedly retrying that same
                    // capped lineup, without inventing a project of equal or lower quality.
                    const current=candidates.find(candidate=>candidate.source==='current');
                    const recovery=context.forcePreparation&&current&&!current.growing?candidates.filter(candidate=>candidate.growing&&candidate.quality>current.quality*1.01+.002):[];
                    for(const candidate of recovery.length?recovery:candidates)if(!selection||candidate.score>selection.score+1e-8||
                        Math.abs(candidate.quality-selection.quality)<1e-8&&Math.abs(candidate.cost-selection.cost)<1e-8&&candidate.lockedCount<selection.lockedCount){
                        const{uids,growing,...comparison}=candidate;selected=uids;selection={...comparison,recovery:recovery.length>0};
                    }
                }
            }else{
                const projected=yield* adventureTeamSearch({...s,mons:future},settings,[],planning,sliced);selected=projected.uids;
                const identity=m=>DATA.combat.singles[m.id]||(context.speciesUnique?`sp:${m.id}`:`${m.id}:${+!!m.shiny}`);
                const readyPool=pool.filter(m=>m.level>=Math.min(desired,trainingCap(s,m))),count=Math.min(context.size||6,new Set(pool.map(identity)).size);
                if(count&&readyPool.length<pool.length&&new Set(readyPool.map(identity)).size>=count){
                    const actual=yield* adventureTeamSearch({...s,mons:readyPool},settings,[],{...planning,pool:readyPool},sliced);
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
        let uids=team.map(m=>m.uid);
        if(settings.autoTeam===false)uids=[...(s.team||[])];
        else if(ready)uids=[...selected];
        else if(choose)uids=(yield* adventureTeamSearch(s,settings,uids,{reg:context.reg,pool:team,foes:context.foes,objective:'train',force:true,now},sliced)).uids;
        return{needed,members,targets,uids,desired,selection,capLimited:!ready&&members.some(m=>m.goal<desired)};
    }
    function battleRouteFit(s,row,uids=s.team||[],now=Date.now()){
        return battleRouteFitSearch(s,row,partyMons(s,uids),now,false).next().value;
    }
    function* battleRouteFitSearch(s,row,party,now,sliced){
        const team=party.filter(m=>teamEligible(s,m,row.reg)).map(m=>({...m,status:null}));
        const foes=(row.members?.length?row.members.map(id=>CHAPTERS.get(id)).filter(Boolean).flatMap(chapter=>chapterCombatFoes(s,chapter)):chapterCombatFoes(s,row)).filter(m=>MONS.has(m.id)&&m.weight>0);
        if(!team.length||!foes.length)return{factor:1,turns:null,coverage:null};
        // Aggregate encounters on the same chapter share their weather. Explicit
        // encounter nodes can override that chapter and must keep their own entry.
        const chapterSkies=new Map(),signatures=[];
        const weatherRows=foes.map(foe=>{
            const shared=!foe.weatherNode&&!foe.liveNode;
            if(shared&&chapterSkies.has(foe.chapter))return chapterSkies.get(foe.chapter);
            const sky=combatWeather(s,foe,{row},now);
            if(shared)chapterSkies.set(foe.chapter,sky);
            signatures.push(sky.signature);
            return sky;
        });
        const weatherKey=JSON.stringify(signatures);
        const key=JSON.stringify([row.reg,s.autoSwitch!==false,foes,team.map(combatProfile),weatherKey]),cached=ROUTE_FITS.get(key);
        if(cached)return{...cached};
        const allies=team.map(mon=>({mon,stats:effectiveStats(mon)}));let weight=0,cost=0,covered=0,deaths=0,minCoverage=1,worstTurns=0,worstDeaths=0;
        for(const [i,foe]of foes.entries()){
            const defense=effectiveStats(foe),battle=deployedBattle(allies.map(({mon,stats})=>matchupDetails(mon,foe,stats,defense,weatherRows[i])),s.autoSwitch!==false);
            weight+=foe.weight;cost+=foe.weight*battle.turns;covered+=foe.weight*battle.coverage;deaths+=foe.weight*battle.deaths;
            minCoverage=Math.min(minCoverage,battle.coverage);worstTurns=Math.max(worstTurns,battle.turns);worstDeaths=Math.max(worstDeaths,battle.deaths);
            if(sliced)yield;
        }
        // Static route time assumes a short fight; allow three expected attack turns per foe.
        // Low survival increases that cost, while observed complete runs supersede this model.
        const turns=cost/weight;
        const fit={factor:Math.max(.02,Math.min(1,3/turns)),turns,coverage:covered/weight,deaths:deaths/weight,minCoverage,worstTurns,worstDeaths,weatherKey};
        ROUTE_FITS.set(key,fit);if(ROUTE_FITS.size>256)ROUTE_FITS.delete(ROUTE_FITS.keys().next().value);
        return{...fit};
    }
    function rebuildPreparationContext(s,saved){
        if(saved?.kind==='under'&&!saved.foes?.length)return battleContext(s,'under',saved);
        if(!saved||!['map','progress'].includes(saved.kind)||saved.foes?.length)return saved;
        const c=CHAPTERS.get(saved.id);
        if(!c||saved.reg&&c.reg!==saved.reg)return{...saved,foes:[]};
        const row={...c,members:c.league?DATA.chapters.filter(member=>member.loop===c.loop).map(member=>member.id):[c.id]};
        const rebuilt=battleContext(s,saved.kind,{row,roamId:saved.roamId});
        return{...rebuilt,...saved,foes:rebuilt.foes};
    }
    function preparationReadiness(s,settings,context,uids=s.team||[]){
        return readinessSearch(s,settings,context,uids,false).next().value;
    }
    function* readinessSearch(s,settings,context,uids,sliced,party){
        const reject=reason=>({ready:false,fit:null,reason});
        if(!['map','progress'].includes(context?.kind))return reject('独立活动保留原有等级补练要求');
        if(!settings.autoTeam)return reject('手动配队保留原定补练目标');
        if(context.forcePreparation)return reject('实际战败后先补练，再重新评估');
        if(!Array.isArray(uids)||!uids.length||uids.length>6||new Set(uids).size!==uids.length)return reject('目标队伍为空或成员重复');
        const team=party??partyMons(s,uids);
        if(team.length!==uids.length||team.some(mon=>!teamEligible(s,mon,context.reg)))return reject('目标成员不在PC或不符合地区限制');
        const identity=mon=>DATA.combat.singles[mon.id]||`${mon.id}:${+!!mon.shiny}`;
        if(new Set(team.map(identity)).size!==team.length)return reject('目标成员不能同时出战');
        context=rebuildPreparationContext(s,context);
        const foes=(context.foes||[]).filter(foe=>MONS.has(foe.id)&&foe.weight>0);
        if(!foes.length)return reject('目标敌人数据不足，保留等级补练要求');
        // The aggregate route data omits encounter kinds. Apply native gym HP and
        // damage margins to every matchup so ordinary opponents cannot hide a boss.
        const hpMargin=1.3*(6/team.length)**.7,damageMargin=1.3;
        const allies=team.map(mon=>({mon:{...mon,status:null},stats:effectiveStats(mon)}));
        let weight=0,turns=0,deaths=0,coverage=0,minCoverage=1,worstTurns=0,worstDeaths=0,hardest=null,uncoveredId=null;
        for(const foe of foes){
            const guarded={...foe,hpMult:(foe.hpMult||1)*hpMargin},defense=effectiveStats(guarded),weather=combatWeather(s,foe,context,context.now??Date.now());
            const details=allies.map(({mon,stats})=>{
                const detail=matchupDetails(mon,guarded,stats,defense,weather);
                // Apply the margin to the HP threshold so each native integer
                // damage roll, including borderline one-hit KOs, stays intact.
                return {...detail,hp:detail.hp/damageMargin};
            });
            const battle=deployedBattle(details,s.autoSwitch!==false);
            weight+=foe.weight;turns+=foe.weight*battle.turns;deaths+=foe.weight*battle.deaths;coverage+=foe.weight*battle.coverage;
            if(battle.coverage<minCoverage){minCoverage=battle.coverage;uncoveredId=foe.id;}
            worstDeaths=Math.max(worstDeaths,battle.deaths);
            if(!hardest||battle.turns>worstTurns){hardest=foe;worstTurns=battle.turns;}
            if(sliced)yield;
        }
        const fit={coverage:coverage/weight,minCoverage,uncoveredId,turns:turns/weight,worstTurns,deaths:deaths/weight,worstDeaths,opponents:foes.length};
        const limits=context.kind==='progress'?STORY_FIT_LIMITS:MAP_FIT_LIMITS;
        const ready=clearsWithinLimits(fit,limits);
        const label=MONS.get(minCoverage<.999?uncoveredId:hardest?.id)?.name||'目标对手';
        const reason=ready?'实际战力已具备稳妥尝试条件，无需所有成员达到等级目标':minCoverage<.999?`${label}等对局仍难以稳定处理`:worstDeaths>limits.knockouts||fit.deaths>limits.deaths?'关键对局预计倒下成员较多，继续补练':`${label}等对局耗时偏高，继续补练`;
        return{ready,fit,reason};
    }
    function leagueTrainingModel(s,settings,row,battleFit,now=Date.now()){
        const party=partyMons(s);
        battleFit??=battleRouteFitSearch(s,row,party,now,false).next().value;
        return leagueTrainingSearch(s,settings,row,battleFit,now,false,party).next().value;
    }
    function* leagueTrainingSearch(s,settings,row,battleFit,now,sliced,party){
        const chapters=(row.members||[]).map(id=>CHAPTERS.get(id)).filter(Boolean);
        const profiles=party.map(mon=>[mon.uid,teamEligible(s,mon,row.reg),...combatProfile({...mon,status:null})]);
        const key=JSON.stringify([row.reg,settings.speed,s.autoSwitch!==false,s.team,profiles,chapters.map(chapter=>[chapter.id,chapterFoes(s,chapter)]),battleFit.weatherKey]),cached=LEAGUE_TRAINING_ROWS.get(key);
        if(cached)return{...cached,completedMembers:[...cached.completedMembers]};
        let blockReason='';
        if(party.length!==(s.team||[]).length)blockReason='队伍含有已不在盒子中的成员';
        else if(!party.length||party.length>6||!party.every(mon=>teamEligible(s,mon,row.reg))||new Set(party.map(mon=>mon.uid)).size!==party.length)blockReason='当前阵容不满足地区出战条件';
        let xpPerMember=0,seconds=0,clearSeconds=0,weightedDeaths=0,failedAt=null,stopReason='';const completedMembers=[];
        if(!blockReason)for(const chapter of chapters){
            const assessment=yield* readinessSearch(s,{...settings,autoTeam:true},{kind:'progress',id:chapter.id,reg:row.reg,foes:chapterCombatFoes(s,chapter),now},s.team,sliced,party),fit=assessment.fit;
            const base=estimatedRouteSeconds(chapter,settings.speed),turns=fit?.turns??150;
            const roomSeconds=base*Math.max(1,turns/3);seconds+=roomSeconds;
            if(!fit)stopReason=assessment.reason;
            else if(fit.minCoverage<.999)stopReason=`模拟难以击败${MONS.get(fit.uncoveredId)?.name||'该关对手'}`;
            else if(fit.turns>10||fit.worstTurns>24)stopReason='预计对局回合过多';
            else if(fit.deaths>1.25||fit.worstDeaths>Math.max(1,party.length-2))stopReason='预计倒下人数超过连战上限';
            if(stopReason){failedAt=chapter.id;seconds+=20;break;}
            clearSeconds+=roomSeconds;weightedDeaths+=roomSeconds*fit.deaths;
            xpPerMember+=chapter.xpEstimate||0;completedMembers.push(chapter.id);
        }
        // Credit only the reliably reachable prefix, while charging for the failed
        // chapter and restarting. Partial attempts are never reported as full-cycle XP.
        if(!completedMembers.length&&failedAt!=null)blockReason=`首关「${CHAPTERS.get(failedAt).name}」：${stopReason}`;
        const model={allowed:!blockReason&&completedMembers.length>0,blockReason,stopReason,xpPerMember,seconds:Math.max(20,seconds),riskFactor:1/(1+.25*weightedDeaths/Math.max(1,clearSeconds)),completedMembers,failedAt,partial:completedMembers.length<chapters.length};
        LEAGUE_TRAINING_ROWS.set(key,model);if(LEAGUE_TRAINING_ROWS.size>128)LEAGUE_TRAINING_ROWS.delete(LEAGUE_TRAINING_ROWS.keys().next().value);
        return{...model,completedMembers:[...completedMembers]};
    }
    function preparationRoutes(s,settings,preparation,metrics={},now=Date.now()){
        const request=preparationRankingRequest(s,settings,preparation,metrics,now);
        return completeYieldRanking(request,preparation.avoid||{},now);
    }

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
        const find=(entries,pokemon)=>{
            for(const entry of entries||[]){const id=MONS.get(pokemon(entry)?.id)?.root;if(ids.includes(id))return id;}
        };
        const live=find(s.mons,mon=>mon)??find(s.pension?.mons,entry=>entry.mon)??find(s.link?.stash?.mons,mon=>mon);
        if(live!=null)return live;
        for(const slot of s.under?.slots||[]){const id=find(slot.mons,mon=>mon);if(id!=null)return id;}
        return null;
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
        if (source.until && s.adv.gifts?.[source.until] || source.upTo && chapterItemCount(s,source.ch,itemId) >= source.upTo) return false;
        if (source.once && s.adv.gifts?.[source.once] || source.badge && !s.adv.badges?.includes(source.badge)) return false;
        if (source.tide && source.tide !== (Math.floor(now / (DATA.tideMs || 10800000)) % 2 === 0 ? 'low' : 'high')) return false;
        if (source.owns?.some(id => !gateOwnsMon(s, id))) return false;
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
        const eligible=[];
        for(const row of candidates(s,{...settings,mode:'item'})){
            if(cooldowns[row.key]>now)continue;
            const sources = item.sources.filter(source => row.members.includes(source.ch) && sourceYield(source)>0 && sourceAvailable(s, source, item.id, now));
            if(sources.length)eligible.push({row,sources,metric:metrics[metricKey(row)]});
        }
        // Compare the same kind of loop time across all eligible maps. A dry or lucky roll
        // changes the displayed observation, not the game's probability at the next node.
        const useMeasuredTime=eligible.every(({metric})=>metric?.itemRuns>=2&&metric.itemSeconds>0);
        return eligible.map(({row,sources,metric})=>{
            const seconds=useMeasuredTime?metric.itemSeconds/metric.itemRuns:estimatedRouteSeconds(row,settings.speed);
            const expected = sources.reduce((n, source) => n + sourceYield(source) * (source.kind === 'town' ? Math.min(1, seconds * 1000 / Math.max(1, DATA.townCooldown || 1)) : 1), 0);
            const measured=metric?.itemSeconds>0,count=Number(metric?.itemCounts?.[item.id])||0;
            return {...row,rate:expected/seconds*60,expected,measured,useMeasuredTime,
                actualRate:measured?count/metric.itemSeconds*60:null,samples:metric?.itemRuns||0,sources};
        }).sort((a,b)=>b.rate-a.rate||a.id-b.id);
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
        const roster=pokemonByUid(s), seen=new Set(), uids=[];
        for(const uid of new Set([...targets,...s.team])){
            const mon=roster.get(uid);if(!mon)continue;
            const slot=DATA.combat.singles[mon.id]||mon.id+':'+Number(!!mon.shiny);
            if(seen.has(slot)||uids.some(id=>teamApart(mon,roster.get(id))))continue;
            seen.add(slot);uids.push(uid);
            if(uids.length===6)break;
        }
        return uids;
    }
    function trainingStatus(s, settings, protectedUids = null) {
        const ids=trainingUids(s,settings,protectedUids), roster=pokemonByUid(s);
        const allowBox=settings.trainUid==='selected'&&settings.autoTeam;
        const targets=ids.filter(uid=>allowBox||s.team?.includes(uid)).map(uid=>roster.get(uid)).filter(Boolean);
        const usedSlots=new Set(targets.map(mon=>DATA.combat.singles[mon.id]||mon.id+':'+Number(!!mon.shiny)));
        const conflict=settings.trainUid==='selected'&&(usedSlots.size!==targets.length||targets.some((mon,i)=>targets.slice(0,i).some(other=>teamApart(mon,other))));
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
        const index=pokemonByUid(s);
        let total = 0;
        for (const uid of uids) {
            const mon=index.get(uid); if(!mon)return null;
            const table = rankedXpTable(tables, mon);
            if (!table) return null;
            total+=xpAtLevel(table,mon.level)+(Number(mon.xp)||0);
        }
        return total;
    }
    function xpAtLevel(table,level){
        let total=0;
        for(let lv=1;lv<level;lv++)total+=table[lv]||0;
        return total;
    }
    function trainingXpTargets(s,settings,goals){
        const named=goals??(settings.mode==='train'&&settings.trainUid!=='team'?trainingUids(s,settings).map(uid=>({uid,goal:settings.trainLevel})):null);
        if(!named)return null;
        const party=partyMons(s),tables=DATA.xpThresholds?.[economicRegion(s)];
        return party.filter(mon=>named.some(t=>t.uid===mon.uid)&&teamEligible(s,mon)).map(mon=>{
            const goal=Math.min(trainingCap(s,mon),named.find(t=>t.uid===mon.uid).goal);
            const table=rankedXpTable(tables,mon);
            const xp=table?xpAtLevel(table,mon.level)+(Number(mon.xp)||0):null;
            return {uid:mon.uid,identity:[mon.id,mon.rank||0],goal,xp,remaining:table?Math.max(0,xpAtLevel(table,goal)-xp):0};
        });
    }
    function trainingXpSuffix(targets){
        return targets?'|xp1:'+JSON.stringify(targets.map(t=>[t.uid,t.goal]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))):'';
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
    function* xpRouteSearch(s,settings,row,now,sliced,party){
        const battleFit=yield* battleRouteFitSearch(s,row,party,now,sliced,settings);
        const leagueTraining=row.league?yield* leagueTrainingSearch(s,settings,row,battleFit,now,sliced,party):null;
        const levels=party.filter(mon=>teamEligible(s,mon,row.reg)).map(mon=>mon.level).sort((a,b)=>b-a);
        const lead=(levels[0]||1)*.75+(levels[1]||levels[0]||1)*.25,maxLevel=Math.max(...row.members.map(id=>CHAPTERS.get(id)?.ace||1));
        const efficient=battleFit.coverage>=.9&&battleFit.turns>0&&battleFit.turns<=3;
        // The time model already charges for slower fights. A new chapter also
        // needs an answer to its worst matchup before we try its full loop.
        const covered=battleFit.minCoverage>=.999;
        const ordinary=clearsWithinLimits(battleFit,STORY_FIT_LIMITS)||efficient&&(!row.trainingFrontier||covered)||!row.trainingFrontier&&maxLevel<=lead;
        return{...row,battleFit,leagueTraining,maxLevel,trainingSafe:leagueTraining?leagueTraining.allowed:ordinary};
    }
    function xpRouteScore(row,m,speed,projection){
        const {battleFit,leagueTraining}=row,{yieldMembers,xpMult,targets,buddy}=projection;
        const base=row.members.reduce((n,id)=>n+(CHAPTERS.get(id).xpEstimate||0),0),perMember=(leagueTraining?.xpPerMember??base)*xpMult;
        const experience=targets?targets.reduce((sum,t)=>sum+Math.min(t.remaining,perMember*(t.uid===buddy?1.3:1)),0):perMember*yieldMembers;
        const model=leagueTraining?experience/leagueTraining.seconds*60*leagueTraining.riskFactor:experience/estimatedRouteSeconds(row,speed)*60*battleFit.factor;
        const estimate=estimateWithHistory(model,m?.historicalRate);
        const measured=m?.xpSeconds>0,samples=m?.xpRuns||0,actualRate=measured?m.xp/m.xpSeconds*60:null,confidence=measured?Math.min(1,samples/2):0;
        const trainingSafe=row.trainingSafe||measured&&samples>=2&&actualRate>0;
        return{...row,rate:confidence*(actualRate||0)+(1-confidence)*estimate,estimatedRate:estimate,actualRate,measured,samples,trainingSafe,fallback:!trainingSafe};
    }
    function xpRanking(s, settings, metrics = {}, cooldowns = {}, now = Date.now()) {
        return completeYieldRanking(yieldRankingRequest('xp',s,settings,metrics,now),cooldowns,now);
    }
    const yieldMaps=new Map();
    function yieldCandidates(s,settings,xp){
        const key=JSON.stringify([xp,settings.mode==='dex',settings.region,huntRegions(settings),currentRegion(s),s.adv.unlocked,s.travel?.to]);
        let maps=yieldMaps.get(key);
        if(!maps){
            maps=xp?trainingCandidates(s,settings):candidates(s,settings,true);
            yieldMaps.set(key,maps);
            if(yieldMaps.size>8)yieldMaps.delete(yieldMaps.keys().next().value);
        }
        return maps;
    }
    function yieldRankingRequest(kind,s,settings,metrics,now,{separateMoney=false}={}){
        if(settings.mode==='dex')settings={...settings,mode:kind==='xp'?'train':'money',autoTeam:false};
        let maps=yieldCandidates(s,settings,kind==='xp');
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
        return makeYieldRankingRequest(kind,s,settings,metrics,now,maps,undefined,otherWallet,undefined,separateMoney);
    }
    let nextBoxContext=0;
    function boxMoneyRequest(s,cfg,now,memo=new Map()){
        const settings={...cfg,mode:'money',region:'all',autoTeam:true,moneyTarget:0};
        const other=s.link&&(otherMoneyParty(s)||{...s,team:[],link:{...s.link,side:s.link.side==='to'?'from':'to'}});
        const onSide=row=>!s.link||(row.reg===s.link.to)===(s.link.side==='to');
        const rows=yieldCandidates(s,settings,false);
        const side=row=>onSide(row)?s:other;
        const potential=row=>{
            const state=side(row);
            return estimateRate(row,settings.speed)*moneyFactor(state,row)*(activeYieldBuff(state,'money',now)?.mult||1)*1.1;
        };
        const queue=rows.map(row=>({...row,upper:potential(row),review:'等待'})).sort((a,b)=>b.upper-a.upper||a.id-b.id);
        // Eligibility differs only across the two linked wallets. Keep one exact fingerprint for each side.
        const representative=new Map(rows.map(row=>[onSide(row),row]));
        const common=JSON.stringify([DATA.build,accountId(s),routePlanSettings(settings),s.adv.unlocked,s.adv.badges,s.team,other?.team,s.link?.side,s.link?.to,
            s.autoSwitch!==false,yieldFingerprint(s,now),[...representative.values()].map(row=>adventureRosterFingerprint(side(row),row.reg))]);
        const evidence=new Map(rows.map(row=>[row.key,moneyScoutEvidence(side(row),row,now)+'|'+partyRunCondition(side(row),row,settings,now)]));
        if(memo.get('context')!==common){memo.clear();memo.set('context',common);memo.set('revision',++nextBoxContext);}
        const signature=JSON.stringify([memo.get('revision'),[...evidence]]);
        function* search(sliced){
            const finished=[],pending=[];
            for(const row of queue){
                const old=memo.get(row.key);
                if(old?.evidence===evidence.get(row.key))finished.push(old.result);
                else pending.push(row);
            }
            const sort=()=>finished.sort((a,b)=>(b.rate??-1)-(a.rate??-1)||a.id-b.id);
            sort();
            if(sliced)yield [...finished,...pending];
            for(const [i,row] of pending.entries()){
                const state=side(row);
                const plan=yield* adventureTeamSearch(state,settings,[],{row,reg:row.reg,objective:'money',now,verifyAll:true,progressive:sliced,lowBudget:true},sliced);
                const proof=plan?.verification||plan?.suggestion?.verification;
                let reviewed={...row,review:'无可核验阵容'};
                if(['verified','exhaustive'].includes(proof?.status)&&proof.uids?.length){
                    const team=partyMons(state,proof.uids),fit=yield* battleRouteFitSearch(state,row,team,now,sliced,settings,true);
                    const selected={...state,team:proof.uids};
                    reviewed={...row,review:'已复核',rate:moneyRouteScore(selected,row,null,fit,now,settings.speed).rate,
                        uids:proof.uids,names:team.map(m=>(MONS.get(m.id)?.name||m.id)+' Lv.'+m.level),
                        profile:JSON.stringify(team.map(rosterCombatKey)),metric:metricsKey(selected,row,settings,now),condition:partyRunCondition(selected,row,settings,now)};
                }
                if(memo.get('context')===common)memo.set(row.key,{evidence:evidence.get(row.key),result:reviewed});
                finished.push(reviewed);sort();
                if(sliced)yield [...finished,...pending.slice(i+1)];
            }
            return finished;
        }
        return {kind:'box',cacheSlot:'money/box',stream:true,needsSlices:true,initialRows:queue,signature,search};
    }
    function otherMoneyParty(s){
        // Native Game.enterRegion swaps the team and wallet while both groups'
        // Pokémon stay in S.mons. It drops missing UIDs before applying side rules.
        const link=s.link,stored=link.stash?.team;
        if(!Array.isArray(stored)||!['from','to'].includes(link.side))return null;
        const side=link.side==='to'?'from':'to',reg=side==='to'?link.to:link.from;
        if(!reg)return null;
        const index=pokemonByUid(s);
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
        const maps=yieldCandidates(s,options,true).filter(row=>row.reg===reg);
        const training={...s,team:[...(preparation.uids||[])]};
        const request=makeYieldRankingRequest('preparation',training,options,metrics,now,maps,reg,null,preparation.targets);
        request.ceiling=preparation.routeCeiling;
        return request;
    }
    const liveYieldRows=new WeakMap(),yieldMetricLookups=new Map();
    function refreshYieldRows(rows,signature,score){
        const cached=liveYieldRows.get(rows);
        if(cached?.signature===signature)return cached.rows;
        const refreshed=rows.map(score).sort(compareYieldRows);
        liveYieldRows.set(rows,{signature,rows:refreshed});
        return refreshed;
    }
    function makeYieldRankingRequest(kind,s,settings,metrics,now,maps,reg,otherWallet=null,goals,separateMoney=false){
        const xp=kind!=='money';
        const targets=xp?trainingXpTargets(s,settings,goals):null,suffix=trainingXpSuffix(targets);
        const states=maps.map(row=>otherWallet&&(row.reg===s.link.to)===(otherWallet.link.side==='to')?otherWallet:s);
        const previewMoney=!xp&&settings.mode==='money'&&settings.autoTeam&&s.mons.length>s.team.length;
        const split=!xp&&separateMoney;
        const otherInputs=otherWallet&&routeYieldInputs(otherWallet,settings,maps.filter((row,i)=>states[i]===otherWallet),now,true);
        const battleInputs=[split,reg,routeYieldInputs(s,settings,maps,now,!xp),otherInputs,maps.map(row=>row.key)];
        // The telemetry object mutates in place. Pin precisely the fields read by
        // this read, while reusing scoped lookup keys between equivalent saves.
        let samples=[];
        if(Object.keys(metrics).length){
            const metricSignature=JSON.stringify([battleInputs,suffix,new Date(now).getDate(),ROAMING_DATA.groups.some(group=>s.adv.badges?.includes(group.badge))]);
            let keys=yieldMetricLookups.get(metricSignature);
            if(!keys){
                const metricKey=routeMetricKey(s,settings,now),otherKey=otherWallet&&routeMetricKey(otherWallet,settings,now);
                keys=maps.map((row,i)=>{
                    const key=states[i]===s?metricKey:otherKey,exact=key(row),legacy=suffix?null:key(row,false);
                    return [exact+suffix,exact===legacy?null:legacy];
                });
                yieldMetricLookups.set(metricSignature,keys);
                if(yieldMetricLookups.size>6)yieldMetricLookups.delete(yieldMetricLookups.keys().next().value);
            }
            samples=keys.map(([exact,legacy])=>{
                const m=metrics[exact];
                if(xp?m?.xpSeconds>0:m?.seconds>0)return xp?{xp:m.xp,xpSeconds:m.xpSeconds,xpRuns:m.xpRuns}:{net:m.net,seconds:m.seconds,runs:m.runs};
                const mixed=legacy&&metrics[legacy],seconds=xp?mixed?.xpSeconds:mixed?.seconds,runs=xp?mixed?.xpRuns:mixed?.runs;
                if(seconds>0&&runs>0)return {historicalRate:(xp?mixed.xp:mixed.net)/seconds*60};
            });
        }
        const maxCycleXp=targets?Math.max(0,...maps.map(row=>row.members.reduce((sum,id)=>sum+(CHAPTERS.get(id)?.xpEstimate||0),0)))*1.3*(activeYieldBuff(s,'xp',now)?.mult||1):0;
        const signature=JSON.stringify([...battleInputs,!xp&&!split?samples:null,
            previewMoney&&!split?rosterFingerprint(s):null]);
        const needsSlices=kind==='preparation' ? maps.length>=4||maps.some(row=>row.league)
            : !split&&previewMoney||maps.some(row=>row.reg!==maps[0].reg)||maps.length>=10&&(split||maps.some(row=>row.league));
        const request={kind,reg,startChapter:DATA.regions.find(region=>region.key===(reg||currentRegion(s)))?.start,signature,needsSlices,
            search:sliced=>scoreYieldRoutes(kind,s,settings,maps,split?[]:samples,now,sliced,states,previewMoney&&!split)};
        if(xp){
            const growing=partyMons(s).filter(mon=>mon.level<trainingCap(s,mon)),buddy=s.buddy?.uid;
            const projection={yieldMembers:growing.length+(growing.some(mon=>mon.uid===buddy)?.3:0),xpMult:activeYieldBuff(s,'xp',now)?.mult||1,targets,buddy};
            const currentSamples=new Map(maps.map((row,i)=>[row.key,samples[i]]));
            const refreshSignature=JSON.stringify([samples,projection.yieldMembers,projection.xpMult,buddy,targets?.map(t=>[t.uid,t.goal,Math.min(t.remaining,maxCycleXp)])]);
            // XP ticks and measured rounds change how a route pays, not how the same team fights.
            request.refreshRows=rows=>refreshYieldRows(rows,refreshSignature,row=>xpRouteScore(row,currentSamples.get(row.key),settings.speed,projection));
            return request;
        }
        if(!split)return request;
        const locations=new Map(maps.map((row,i)=>[row.key,{row,state:states[i],sample:samples[i]}]));
        const refreshSignature=JSON.stringify(samples);
        request.refreshRows=rows=>refreshYieldRows(rows,refreshSignature,row=>{
            const {state,sample}=locations.get(row.key);
            return moneyRouteScore(state,row,sample,row.battleFit,now,settings.speed);
        });
        if(previewMoney){
            request.projections=rows=>moneyProjectionRequest(s,settings,locations,rows,now);
            request.withProjections=(rows,hints)=>applyMoneyProjections(rows,hints,locations,settings,now);
        }
        return request;
    }
    function routeYieldInputs(s,settings,maps,now,money){
        const inputs=yieldRankingInputs(s,settings,maps,now),members=new Set(maps.flatMap(row=>row.members));
        const [account,,unlocked,open,region,hunt,slot,hour,season,roam]=inputs[0];
        // Which room is currently fighting is immaterial to an all-map replay
        // ranking, including natural room progression within a league.
        inputs[0]=[account,unlocked,open,region,hunt,slot,hour,season,roam.filter(([,id])=>members.has(id)),
            totalDeaths(s,{members:[...members]})];
        if(money)inputs.push(maps.map(row=>moneyRouteThreatKey(s,row,now)).filter(Boolean));
        return inputs;
    }
    function moneyRouteThreatKey(s,row,now){
        return routeRoamingFoes(s,row,now).map(foe=>foe.chapter+':'+foe.id).join(',');
    }
    function compareYieldRows(a,b){return b.rate-a.rate||a.id-b.id;}
    function moneySpecialists(s,settings,rows,states){
        const walletFactors=new Map();
        const rated=rows.map((row,i)=>{
            const state=states[i];
            let regional=walletFactors.get(state);
            if(!regional){regional=new Map();walletFactors.set(state,regional);}
            if(!regional.has(row.reg))regional.set(row.reg,moneyFactor(state,row));
            return{row,state,potential:estimateRate(row,settings.speed)*regional.get(row.reg)};
        });
        const high=rated.slice().sort((a,b)=>b.potential-a.potential||a.row.id-b.row.id);
        const active=rated.find(entry=>entry.row.members.includes(s.adv.chapter));
        const different=high.find(entry=>entry.row.league!==high[0]?.row.league);
        return new Set([...high.slice(0,4),...[active,different].filter(Boolean)]);
    }
    function moneyProjectionPartyKey(party){
        return JSON.stringify(party.map(mon=>[mon.uid,monRegion(mon),...combatProfile({...mon,status:null})]));
    }
    function moneyScoutEvidence(state,row,now){
        return JSON.stringify([routeIdentity(row),state.link?.side,chapterYieldRules(row.id),moneyRouteThreatKey(state,row,now),totalDeaths(state,row),
            row.members.map(id=>{
                const branch=CHAPTERS.get(id)?.foesByStarter;
                const starter=branch&&starterChoice(state,branch.key,Object.keys(branch.choices||{}).map(Number));
                return [starter,combatWeather(state,{chapter:id},{row},now).signature];
            })]);
    }
    function projectionEvidence(location,row,now){
        return location.scoutKey??=moneyScoutEvidence(location.state,row,now);
    }
    function moneyProjectionRequest(s,settings,locations,rows,now){
        if(!rows.length)return null;
        const candidates=moneySpecialists(s,settings,rows,rows.map(row=>locations.get(row.key).state));
        // Scouts are hints; a separate live proof checks the exact current Box
        // before deployment. Samples, unrelated members improving and minor XP
        // changes must not keep restarting these slower advisory calculations.
        const candidatesInScope=[...candidates].map(entry=>({...entry,scoutKey:projectionEvidence(locations.get(entry.row.key),entry.row,now)}));
        const scene=candidatesInScope.map(entry=>entry.scoutKey);
        const signature=JSON.stringify([accountId(s),routePlanSettings(settings),scene]);
        return {kind:'money',cacheSlot:'money/projections',signature,needsSlices:true,projectionOnly:true,
            search:sliced=>scoreMoneyProjections(settings,candidatesInScope,now,sliced)};
    }
    function* scoreMoneyProjections(settings,candidates,now,sliced){
        const result=[],setting=routePlanSettings(settings);
        for(const {row,state,scoutKey=moneyScoutEvidence(state,row,now)} of candidates){
            const plan=yield* adventureTeamSearch(state,settings,[],{row,reg:row.reg,objective:'money',now,lowBudget:true},sliced);
            const uidList=plan.changed?plan.uids:[],party=partyMons(state,uidList);
            const hint={key:row.key,scouted:true,account:accountId(state),setting,scoutKey};
            if(uidList.length&&party.length===uidList.length){
                const fit=yield* battleRouteFitSearch(state,row,party,now,sliced,settings,true);
                Object.assign(hint,{scope:state.link?.side??null,party:uidList,profile:moneyProjectionPartyKey(party),
                    evidenceKey:routeMetricKey({...state,team:uidList},settings,now)(row),threat:moneyRouteThreatKey(state,row,now),fit});
            }
            result.push(hint);
            if(sliced)yield result.slice();
        }
        return result;
    }
    function applyMoneyProjections(rows,hints,locations,settings,now){
        if(!hints?.length)return rows;
        const setting=routePlanSettings(settings),shown=new Map(rows.map(row=>[row.key,row])),byKey=new Map();
        for(const hint of hints){
            const location=locations.get(hint.key),row=shown.get(hint.key);
            if(location&&row&&hint.account===accountId(location.state)&&hint.setting===setting&&hint.scoutKey===projectionEvidence(location,row,now))byKey.set(hint.key,hint);
        }
        if(!byKey.size)return rows;
        return rows.map(row=>{
            const hint=byKey.get(row.key),planCoverage={evaluated:byKey.size,total:rows.length,matched:!!hint};
            if(!hint?.party||row.measured&&row.samples>=2)return {...row,planCoverage};
            const {state}=locations.get(row.key),party=partyMons(state,hint.party);
            if((state.link?.side??null)!==hint.scope||party.length!==hint.party.length||party.some(mon=>!teamEligible(state,mon,row.reg))||moneyProjectionPartyKey(party)!==hint.profile)return {...row,planCoverage};
            const key=routeMetricKey({...state,team:hint.party},settings,now)(row);
            if(key!==hint.evidenceKey||moneyRouteThreatKey(state,row,now)!==hint.threat)return {...row,planCoverage};
            const estimate=moneyRouteScore(state,row,null,hint.fit,now,settings.speed).rate;
            if(hint.fit.roamingRisk||hint.fit.coverage<.99||hint.fit.minCoverage<row.battleFit.minCoverage||!(estimate>row.rate*1.08))return {...row,planCoverage};
            return {...row,planCoverage,projectedMoneyRate:estimate,projectedMoneyTurns:hint.fit.turns,
                routePlan:{objective:'money',identity:routeIdentity(row),party:hint.party,entryParty:[...state.team],scope:hint.scope,
                    setting,key,threat:hint.threat,roster:adventureRosterFingerprint(state,row.reg),evidence:'estimate',minimumRate:row.rate*1.08}};
        });
    }
    function* scoreYieldRoutes(kind,s,settings,maps,samples,now,sliced,states,previewMoney){
        const rows=[];
        const walletParties=new Map();
        const party=kind==='money'?null:partyMons(s);
        for(const [i,row] of maps.entries()){
            if(kind!=='money')rows.push(yield* xpRouteSearch(s,settings,row,now,sliced,party));
            else{
                const state=states[i];
                if(!walletParties.has(state))walletParties.set(state,partyMons(state));
                const fit=yield* battleRouteFitSearch(state,row,walletParties.get(state),now,sliced,settings,true);
                rows.push(moneyRouteScore(state,row,samples[i],fit,now,settings.speed));
            }
            if(sliced)yield;
        }
        if(previewMoney){
            // Screen every available map, then do route-specific legal party
            // comparison on a bounded set. The resulting rate belongs only to
            // that exact party. Coverage does not assert a global optimum.
            const candidates=[...moneySpecialists(s,settings,rows,states)].filter(({row})=>!row.measured||row.samples<2);
            const hints=yield* scoreMoneyProjections(settings,candidates,now,sliced);
            const locations=new Map(rows.map((row,i)=>[row.key,{state:states[i]}]));
            return applyMoneyProjections(rows,hints,locations,settings,now).sort(compareYieldRows);
        }
        return party?rows:rows.sort(compareYieldRows);
    }
    function safeTrainingRoutes(rows,startChapter){
        const safe=rows.filter(row=>row.trainingSafe);
        if(safe.length)return safe;
        const replays=rows.filter(row=>!row.league&&(!row.trainingFrontier||row.id===startChapter));
        const minimum=Math.min(...replays.map(row=>row.maxLevel));
        return replays.filter(row=>row.maxLevel===minimum);
    }
    function selectYieldRoutes(request,rows,cooldowns,now){
        if(request.refreshRows)rows=request.refreshRows(rows);
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
        for(const row of request.refreshRows?.(cached.rows)||cached.rows){
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
    function shopCandyTier(s){
        const reg=candyRegion(s),frontier=s.adv?.unlocked;
        if(!Number.isInteger(frontier)||frontier<0)return null;
        // Native shopBadges counts completed badge-awarding gym chapters in its wallet region.
        const badges=DATA.chapters.filter(c=>c.reg===reg&&c.id<frontier&&c.badges.length).length;
        return highestCandy(s,Object.entries(DATA.automation.candies).filter(([,candy])=>candy.badges<=badges).map(([id])=>({id})))?.id||null;
    }
    function candyChoice(s,mon,goal,offers=[]){
        const need=candyXpGap(s,mon,goal);if(!(need>0))return null;
        const types=DATA.automation.candies,reg=candyRegion(s),headroom=candyXpGap(s,mon,100);
        const owned=Object.entries(types).filter(([id,info])=>s.items?.[id]>0&&info.xp[reg]<=headroom).map(([id,info])=>({id,xp:info.xp[reg],cost:0,owned:true,need}));
        if(owned.length)return owned.sort((a,b)=>Math.max(0,a.xp-need)-Math.max(0,b.xp-need)||b.xp-a.xp)[0];
        const best=highestCandy(s,offers);
        return best&&types[best.id].xp[reg]<=headroom&&Number.isSafeInteger(best.cost)&&best.cost>0?{...best,xp:types[best.id].xp[reg],need,owned:false}:null;
    }
    function routeDescriptor(row){return Object.fromEntries(['id','key','reg','name','loop','league','members','reward','units','ace'].map(key=>[key,row[key]]));}
    function routeIdentity(row,options={}){
        return JSON.stringify([row.reg,options.zone?'zone':row.league?'league':'chapter',row.id,String(row.key),options.tier||0,options.roamId||0,row.members||[]]);
    }
    function routePlanSettings(settings){
        return JSON.stringify([settings.mode,settings.autoTeam,settings.speed,settings.activeSwitch,settings.region,settings.moneyTarget]);
    }
    // Native elite rooms reuse the story gym's roster and power, without its route trainers.
    const ELITE_GYM_POWER={9:.36,10:.48,11:.73,12:.57,13:1.72,25:.4,26:.57,27:.75,28:.82,29:1.2,
        43:.42,44:.47,45:.63,46:.52,47:1.11,60:.48,61:.72,62:.8,63:.85,64:1.15,77:.89,78:1,79:.86,80:.86,81:.78,82:.83};
    function eliteBattleContext(s,reg,tier,now){
        const rooms=DATA.chapters.filter(c=>c.reg===reg&&c.league);
        const night=reg==='unova'&&phaseAt(s,now)==='night';
        // An active run has already rolled its lineup. A clock change cannot reroll it.
        const live=s.adv.league?.reg===reg&&s.adv.league.tier===tier?s.adv.nodes||[]:[];
        const foes=rooms.flatMap(c=>{
            const node=live.find(n=>n.ch===c.id&&n.type==='gym');
            const ids=node?.team?.map(([id])=>id)||c.gymFoes.map(([id])=>night&&c.id===81&&id===643?644:id);
            const power=node?.gym?.power||ELITE_GYM_POWER[c.id]||1;
            const damageMult=1.3*power,hpMult=damageMult*Math.max(1,6/ids.length)**.7;
            return ids.map(id=>({id,chapter:c.id,level:100,rank:tier,weight:1,gymCount:1,hpMult,damageMult}));
        });
        const label=(DATA.regions.find(r=>r.key===reg)?.name||reg)+' · 精英联盟第 '+tier+' 阶';
        return{kind:'elite',reg,tier,id:rooms[0]?.id,size:6,level:100,speciesUnique:true,foes,label,
            key:`elite:${reg}:${tier}:${foes.some(f=>f.chapter===81&&f.id===644)?'night':'default'}`};
    }
    function battleContext(s,kind,options={}){
        if(kind==='zone'&&options.tier){
            const elite=legendEliteContext(s,options.id,options.tier,options.now);
            if(elite)return elite;
        }
        const row=options.row,c=CHAPTERS.get(row?.id??options.id??s.adv.chapter),zone=kind==='zone'?DATA.zones.find(z=>z.id===options.id):null;
        let reg=options.reg||row?.reg||zone?.reg||(['worldAttack','worldCapture','under'].includes(kind)?'sinnoh':c?.reg||currentRegion(s));
        if(kind==='tower'&&s.link&&reg===s.link.to)reg=DATA.regions.find(region=>region.key===s.link.from)?.key||DATA.regions.filter(region=>region.key!==s.link.to&&region.start<=s.adv.unlocked).at(-1)?.key||'kanto';
        let id=options.id??row?.id??c?.id,level=options.level,foes=[],size=6,label=options.label||row?.name||c?.name||kind;
        if(kind==='elite')return eliteBattleContext(s,reg,options.tier||1,options.now??Date.now());
        if(kind==='under'){
            const slot=Number(options.slot)||0,floor=Math.max(1,Number(options.floor)||1),theme=s.under?.next?.[slot]||'';
            const encounter=undergroundFoes(s,theme,floor);
            return{kind,id,reg,level:encounter.level,foes:encounter.foes,size:DATA.automation.under.team,slot,floor,
                tier:0,label:'地下通道 · 第 '+floor+' 层出发',key:`under:${slot}:${theme}:${floor}:${encounter.level}`};
        }
        if(kind==='map'||kind==='progress'){
            const chapters=row?.members||[id];level=Math.max(...chapters.map(id=>CHAPTERS.get(id)?.ace||1));
            foes=chapters.map(id=>CHAPTERS.get(id)).filter(Boolean).flatMap(chapter=>chapterCombatFoes(s,chapter));
            if(ROAMING_DATA.groups.some(group=>group.ids.includes(Number(options.roamId)))){
                level=ROAMING_DATA.level;
                foes=[roamingCombatFoe(Number(options.roamId),id,20),...foes.map(foe=>({...foe,gymCount:0,weight:foe.weight*.05}))];
                label='游荡捕获 · '+(MONS.get(Number(options.roamId))?.name||options.roamId);
            }
        }else if(kind==='zone'||kind==='raid'||kind==='worldCapture'){
            id=kind==='worldCapture'?493:id;level=level||zone?.level||DATA.automation.levels.raid;foes=[{id,level,weight:1}];size=kind==='raid'?2:6;
            if(kind==='raid'){
                const {hp,power}=raidBossFactors(id);
                Object.assign(foes[0],{hpMult:hp*(1+RAID_ALLY.enemyHp*(RAID_ALLY.team-1)),damageMult:power});
            }
            label=options.label||({zone:'传说战',raid:'每日团体战',worldCapture:'世界首领捕获'}[kind]+' · '+(MONS.get(id)?.name||id));
        }else{
            const chapter=c?.reg===reg?c:DATA.chapters.filter(c=>c.reg===reg&&c.id<=s.adv.unlocked).at(-1);
            const all=chapter?chapterThreats({...s,adv:{...s.adv,battle:null}},chapter.id):[];
            level=level||(kind==='tower'?towerFloorProfile(options.floor).level:100);
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
        if(context.kind==='tower'||context.kind==='worldAttack'){
            const tower=context.kind==='tower',progress=tower?towerProgress(s,now):null;
            const actual=tower?towerParty(s,{snapshot:!!progress.run,floor:progress.run?progress.floor:1,now}):worldAttackParty(s,context.size);
            const under=(s.under?.slots||[]).flatMap(slot=>slot.mons||[]),index=new Map([...under,...(s.mons||[])].map(mon=>[mon.uid,mon]));
            // Both activities have their own native default selection and ignore a hypothetical adventure party.
            const members=actual.map(mon=>index.get(mon.src)||mon).map(mon=>({uid:mon.uid,id:mon.id,level:mon.level,
                goal:Math.min(desired,trainingCap(s,mon)),trainable:available.has(mon.uid)&&(tower||teamEligible(s,mon,context.reg))}));
            const targets=members.filter(mon=>mon.trainable&&mon.level<mon.goal),needed=targets.some(mon=>mon.goal-mon.level>settings.prepareGap);
            const uids=settings.autoTeam===false?[...(s.team||[])]:members.filter(mon=>mon.trainable).map(mon=>mon.uid),used=new Set(members.filter(mon=>mon.trainable).map(mon=>DATA.combat.singles[mon.id]||mon.id));
            if(settings.autoTeam!==false)for(const mon of [...(s.mons||[])].filter(mon=>teamEligible(s,mon,context.reg)).sort((a,b)=>b.level-a.level)){
                const identity=DATA.combat.singles[mon.id]||mon.id;if(uids.length>=6)break;
                if(!used.has(identity)){used.add(identity);uids.push(mon.uid);}
            }
            return{needed,members,targets,uids,desired,selection:{source:tower?'native-tower':'native-world-attack'},capLimited:members.some(mon=>mon.goal<desired)};
        }
        let pool=context.kind==='under'?undergroundMembers(s,now):(s.mons||[]).filter(m=>teamEligible(s,m,context.reg));
        const forecastIdentity=m=>DATA.combat.singles[m.id]||(context.speciesUnique?`sp:${m.id}`:`${m.id}:${+!!m.shiny}`);
        const ordinary=['map','progress'].includes(context.kind),configured=ordinary?[]:configuredBattleTeam(s,context);
        const choose=ordinary?settings.autoTeam:settings.optimizeRaid;
        const planning={reg:context.reg,foes:context.foes,size:context.size,speciesUnique:context.speciesUnique,force:true,now};
        const chapter=CHAPTERS.get(context.id);
        const dexReplay=context.kind==='map'&&!context.roamId&&!context.forcePreparation&&isDexReplay(s,settings,chapter)?chapter:null;
        const currentFirst=context.kind==='map'&&settings.mode==='money'&&choose&&!context.forcePreparation;
        let actual=null,ready=false;
        if(currentFirst&&s.team?.length){
            const fit=yield* readinessSearch(s,settings,context,s.team,sliced);
            if(fit.ready){actual={uids:s.team};ready=true;}
        }
        if(ordinary&&choose&&!ready){
            actual=yield* adventureTeamSearch({...s,mons:pool},settings,[],{...planning,pool,dexReplay},sliced);
            ready=!context.forcePreparation&&(actual.retainedForHunt||(yield* readinessSearch(s,settings,context,actual.uids,sliced)).ready);
            if(currentFirst&&!ready){
                // Try existing combat-ready members before scoring hypothetical Lv.100 builds.
                const mature=pool.filter(mon=>mon.level+settings.prepareGap>=Math.min(desired,trainingCap(s,mon)));
                if(mature.length<pool.length&&new Set(mature.map(forecastIdentity)).size>=Math.min(context.size||6,pool.length)){
                    const alternative=yield* adventureTeamSearch(s,settings,[],{...planning,pool:mature,objective:'progress',lowBudget:true},sliced);
                    const fit=yield* readinessSearch(s,settings,context,alternative.uids,sliced);
                    if(fit.ready){actual=alternative;ready=true;}
                }
            }
        }
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
                    selected=actual.uids;selection={cost:0,xp:0,source:'current',ready:true};
                    if(Number.isFinite(actual.score))Object.assign(selection,{quality:actual.score,score:actual.score});
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
    function battleRouteFit(s,row,uids=s.team||[],now=Date.now(),settings=DEFAULTS){
        return battleRouteFitSearch(s,row,partyMons(s,uids),now,false,settings).next().value;
    }
    function* battleRouteFitSearch(s,row,party,now,sliced,settings=DEFAULTS,includeRoaming=false){
        const team=party.filter(m=>teamEligible(s,m,row.reg)).map(m=>({...m,status:null}));
        const nativeSwitch=s.autoSwitch!==false,rescue=team.length>1&&!row.league&&helperSwitchEnabled(s,settings);
        const foes=(includeRoaming?routeCombatFoes(s,row,now):
            (row.members?.length?row.members.map(id=>CHAPTERS.get(id)).filter(Boolean).flatMap(chapter=>chapterCombatFoes(s,chapter)):chapterCombatFoes(s,row))).filter(m=>MONS.has(m.id)&&m.weight>0);
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
        const key=JSON.stringify([row.reg,nativeSwitch,rescue,foes,team.map(combatProfile),weatherKey]),cached=ROUTE_FITS.get(key);
        if(cached)return{...cached};
        const allies=team.map(mon=>({mon,stats:effectiveStats(mon)}));let weight=0,cost=0,covered=0,deaths=0,minCoverage=1,worstTurns=0,worstDeaths=0;
        let roamingTurns=0,roamingWeight=0,roamingRisk;
        const recordRisk=battle=>{
            minCoverage=Math.min(minCoverage,battle.coverage);worstTurns=Math.max(worstTurns,battle.turns);worstDeaths=Math.max(worstDeaths,battle.deaths);
        };
        const record=(battle,share)=>{
            weight+=share;cost+=share*battle.turns;covered+=share*battle.coverage;deaths+=share*battle.deaths;
            recordRisk(battle);
        };
        for(const [i,foe]of foes.entries()){
            const defense=effectiveStats(foe),details=allies.map(({mon,stats})=>matchupDetails(mon,foe,stats,defense,weatherRows[i]));
            if(foe.roaming){
                const battle=roamingBattle(details,foe);
                roamingWeight+=foe.weight;roamingTurns+=foe.weight*battle.turns;
                recordRisk(battle);
                if(battle.coverage<.999||battle.deaths>2){
                    if(!roamingRisk||battle.coverage<roamingRisk.coverage||battle.coverage===roamingRisk.coverage&&battle.deaths>roamingRisk.deaths)roamingRisk={id:foe.id,...battle};
                }
                if(sliced)yield;
                continue;
            }
            // The route export separates wild occurrences from paid fights. Keep
            // the conservative native order for trainer waves and special foes.
            const wild=rescue&&!foe.shiny&&!foe.veiled?Math.min(foe.weight,foe.singleWild?foe.weight:foe.wildWeight||0):0;
            const lead=wild?rescueLead(details.length,j=>rescueProfile(details[j],details[j].foeHp,details[j].hp)):0;
            if(lead){
                record(deployedBattle([details[lead],...details.filter((_,j)=>j!==lead)],false),wild);
                if(wild<foe.weight)record(deployedBattle(details,nativeSwitch),foe.weight-wild);
            }else record(deployedBattle(details,nativeSwitch),foe.weight);
            if(sliced)yield;
        }
        // Static route time assumes a short fight; allow three expected attack turns per foe.
        // Low survival increases that cost, while observed complete runs supersede this model.
        // A marked roaming encounter can consume time and knock out the party.
        // Keep it out of the paid encounter denominator and never credit a payout.
        const turns=(cost+roamingTurns)/(weight+roamingWeight);
        const ordinaryFactor=Math.min(1,3*weight/Math.max(1,cost)),roamingDelay=roamingTurns/Math.max(1,3*weight);
        const fit={factor:Math.max(.02,ordinaryFactor/(1+roamingDelay)),turns,coverage:weight?covered/weight:null,deaths:weight?deaths/weight:null,minCoverage,worstTurns,worstDeaths,weatherKey};
        if(roamingRisk)fit.roamingRisk=roamingRisk;
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
        if(new Set(team.map(identity)).size!==team.length||team.some((mon,i)=>team.slice(0,i).some(other=>teamApart(mon,other))))return reject('目标成员不能同时出战');
        context=rebuildPreparationContext(s,context);
        const foes=(context.foes||[]).filter(foe=>MONS.has(foe.id)&&foe.weight>0);
        if(!foes.length)return reject('目标敌人数据不足，保留等级补练要求');
        // The aggregate route data omits encounter kinds. Apply native gym HP and
        // damage margins to every matchup so ordinary opponents cannot hide a boss.
        const hpMargin=1.3*(6/team.length)**.7,damageMargin=1.3;
        const allies=team.map(mon=>({mon:{...mon,status:null},stats:effectiveStats(mon)}));
        let weight=0,turns=0,deaths=0,coverage=0,minCoverage=1,worstTurns=0,worstDeaths=0,hardest=null,uncoveredId=null;
        for(const foe of foes){
            const guarded=foe.roaming?foe:{...foe,hpMult:(foe.hpMult||1)*hpMargin},defense=effectiveStats(guarded),weather=combatWeather(s,foe,context,context.now??Date.now());
            const details=allies.map(({mon,stats})=>{
                const detail=matchupDetails(mon,guarded,stats,defense,weather);
                // Apply the margin to the HP threshold so each native integer
                // damage roll, including borderline one-hit KOs, stays intact.
                return foe.roaming?detail:{...detail,hp:detail.hp/damageMargin};
            });
            const battle=foe.roaming?roamingBattle(details,foe):deployedBattle(details,s.autoSwitch!==false);
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

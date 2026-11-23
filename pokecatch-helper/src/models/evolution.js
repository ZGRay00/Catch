    const EVOLUTION_ITEMS = new Set(Object.values(EVOLUTION_DATA.rules).flat().map(rule => rule.item).filter(Boolean));
    const EVOLUTION_SHOP = new Map(DATA.automation.shop.filter(row => EVOLUTION_ITEMS.has(row.id)).map(row => [row.id, row]));
    const SHINY_EVOLUTION_MANUAL = '异色成员仅可手动进化';

    function evolutionShopLocked(s, row) {
        if (row.once && !s.adv?.gifts?.[row.once]) return true;
        if (!row.region) return false;
        const region = DATA.regions.find(entry => entry.key === row.region);
        return !(s.travel?.to || []).includes(row.region) || !(s.adv?.unlocked >= region?.start);
    }

    function lockedEvolutionItems(s) {
        return [...EVOLUTION_SHOP.values()].filter(row => !(s.items?.[row.id] > 0) && evolutionShopLocked(s, row)).map(row => row.id);
    }

    function evolutionPurchaseReason(s, shop) {
        if (!evolutionShopLocked(s,shop)) return shop.name + '已解锁购买，当前背包缺少' + shop.name;
        const prefix = shop.name + '未解锁购买，';
        if (shop.region) return prefix + '需先开放' + DATA.regions.find(region => region.key === shop.region).name;
        const first = ITEMS.get(shop.id)?.sources?.find(source => source.once === shop.once);
        const chapter = CHAPTERS.get(first?.ch);
        return prefix + (chapter ? '可先到「' + chapter.name + '」取得' : '需先领取地下探险掉落');
    }

    function evolutionItemAccess(s, id) {
        const shop = EVOLUTION_SHOP.get(id);
        const name = shop?.name || ITEMS.get(id)?.name || ({'link-cable':'连接绳','shed-shell':'脱壳'})[id] || id;
        if (id === 'link-cable') return {name, held:false, locked:false, reason:'须通过游戏内交换完成'};
        if (s.items?.[id] > 0) return {name, held:true, locked:false, reason:'已持有' + name + '，可手动使用'};
        if (!shop) return {name, held:false, locked:false, reason:'当前背包缺少' + name};
        const locked = evolutionShopLocked(s, shop);
        const reason = evolutionPurchaseReason(s, shop);
        return {name, held:false, locked, reason};
    }

    function manualItemEvolution(s, rules) {
        if (!rules.length || rules.some(rule => !rule.item)) return null;
        const items = [...new Set(rules.map(rule => rule.item))].map(id => evolutionItemAccess(s, id));
        const locked = items.every(item => item.locked);
        const detail = items.length === 1 ? items[0].reason :
            locked ? items.map(item => item.name).join('、') + '均未解锁购买' : '';
        return {locked, detail};
    }

    function evolutionStatus(s,mon,options={},requestedRule=null){
        const level=clamp(options.level??mon?.level,1,100,1),now=options.now??Date.now();
        const reject=reason=>({rule:null,reason,level});
        if(!mon||!MONS.has(mon.id)||!mon.uid)return reject('成员数据不可用');
        if(String(mon.uid).startsWith('t:')||String(mon.uid).startsWith('c:'))return reject('活动克隆保持入场时形态');
        if(mon.shiny&&!requestedRule)return reject(SHINY_EVOLUTION_MANUAL);
        if(Math.floor(Number(mon.rank)||0)>0)return reject('已升阶成员不能进化');
        const rules=EVOLUTION_DATA.rules[mon.id]||[];
        let rule=requestedRule;
        if(!rule){
            // Automated roles only consider an unambiguous free evolution. The dex
            // supplies a specific rule to check the player's manual options.
            const free=rules.filter(edge=>edge.level>0&&!edge.item);
            const branched=new Set(rules.map(edge=>edge.to)).size>1;
            if(branched||!free.length){
                const item=manualItemEvolution(s,rules);
                const reason=branched?'存在进化分支，保留手动选择':item?'需要道具进化，保留手动操作':'当前形态没有免费等级进化';
                return {...reject(item?.detail?reason+' · '+item.detail:reason),itemLocked:item?.locked===true,itemDetail:item?.detail||''};
            }
            if(free.length!==1)return reject('进化条件存在多个规则，等待手动核对');
            rule=free[0];
        }
        if(!MONS.has(rule.to))return reject('进化目标数据不可用');
        if(rule.level&&level<rule.level)return reject('需要达到 Lv.'+rule.level);
        const targetId=rule.to>10000?Math.floor(rule.to/100):rule.to;
        const region=DATA.regions.find(row=>row.dexRange&&targetId>=row.dexRange[0]&&targetId<=row.dexRange[1])?.key||
            (targetId<=151?'kanto':targetId<=251?'johto':targetId<=386?'hoenn':targetId<=493?'sinnoh':targetId<=649?'unova':null);
        const open=new Set(['kanto',...(s.travel?.to||[]),currentRegion(s)]);
        if(s.link?.to)open.add(s.link.to);
        if(!open.has(region))return reject('进化目标地区尚未开放');
        if(requestedRule&&s.link&&(s.link.side==='to')!==(monRegion(mon)===s.link.to))return reject('请切换至该成员所在的地区队伍');
        if(rule.item==='link-cable')return reject('须通过游戏内交换完成');
        const required=EVOLUTION_DATA.time[rule.to],phase=phaseAt(s,now);
        if(required&&(required==='night'?phase!=='night':phase==='night'))return reject(required==='night'?'需要夜间进化':'需要白天进化');
        if(rule.party){
            if(s.adv?.tower||s.adv?.event||s.adv?.league||s.adv?.zone)return reject('依赖队友形态，等待特殊活动结束后核对');
            const present=uid=>(s.mons||[]).some(ally=>ally.uid===uid&&(!s.link||(s.link.side==='from'?monRegion(ally)!==s.link.to:monRegion(ally)===s.link.to)));
            const road=(s.road||[]).filter(present),party=road.length?road:(s.team||[]).filter(present);
            if(!party.some(uid=>(s.mons||[]).some(ally=>ally.uid===uid&&ally.id===rule.party)))return reject('需要特定队友在实际行进队伍中');
        }
        const group=member=>s.link?(monRegion(member)===s.link.to?'to':'from'):'all';
        // Native family capacity can permit additional copies in some branches. Conservatively
        // leave those duplicates manual rather than claiming unavailable evolved battle power.
        const duplicate=other=>other&&other.uid!==mon.uid&&other.id===rule.to&&!!other.shiny===!!mon.shiny&&group(other)===group(mon);
        if((s.mons||[]).some(duplicate)||reserveEvolutionMembers(s).some(duplicate))return reject('同组已拥有相同进化目标，等待原生家族容量确认');
        if(rule.item){
            const item=evolutionItemAccess(s,rule.item);
            if(!item.held)return reject(item.reason);
        }
        return{rule:{...rule,from:mon.id},reason:requestedRule?'已满足进化条件':'唯一免费等级进化已满足',level};
    }
    function levelEvolution(s,mon,options={}){
        return evolutionStatus(s,mon,options).rule;
    }
    function reserveEvolutionMembers(s){
        return [...(s.pension?.mons||[]).map(row=>row.mon),...(s.under?.slots||[]).flatMap(row=>row.mons||[]),
            ...(s.link?.stash?.mons||[]),s.tradeOut?.mon,s.tradeIn?.mon,...(s.mktOut||[]).map(row=>row.mon)].filter(Boolean);
    }
    function reserveEvolutionKey(s){
        return reserveEvolutionMembers(s).map(mon=>[mon.uid,mon.id,monRegion(mon),!!mon.shiny]);
    }
    function preparationEvolutionLabel(s,target,engine,now){
        const mon=s.mons.find(member=>member.uid===target.uid);
        if(!mon)return '成员已离开队伍或电脑';
        const label=MONS.get(mon.id)?.name||String(mon.id);
        const levels=mon.level+'/'+target.goal;
        const edges=EVOLUTION_DATA.rules[mon.id]||[];
        if(mon.shiny&&edges.length)return label+' '+levels+'（'+SHINY_EVOLUTION_MANUAL+'）';
        if(!edges.some(edge=>edge.level>0&&!edge.item&&mon.level>=edge.level)){
            const next=engine.settings.autoEvolve&&edges.length?projectEvolution(s,mon,target.goal,now):null;
            const detail=next?.evolutionItemDetail||(!next&&evolutionStatus(s,mon,{now}).itemDetail);
            return (next&&next.id!==mon.id?label+' → '+MONS.get(next.id).name:label)+' '+levels+(detail?'（'+detail+'）':'');
        }
        if(!engine.settings.autoEvolve)return label+' '+levels+'（自动进化已关闭）';
        const {rule,reason}=evolutionStatus(s,mon,{now});
        if(!rule)return label+' '+levels+'（'+reason+'）';
        const flow=engine.automation?.state||{};
        const wait=flow.evolution?.uid===mon.uid?'正在处理进化':
            backgroundBlockReason(s,engine,now)||(flow.evolutionRetryAt>now?'等待重试，详见运行日志':'已满足进化条件，待执行');
        return label+' → '+MONS.get(rule.to).name+' '+levels+'（'+wait+'）';
    }
    function projectEvolution(s,mon,level=mon.level,now=Date.now()){
        const fixed=String(mon.uid).startsWith('t:')||String(mon.uid).startsWith('c:');
        const projected={...mon,level:fixed?mon.level:Math.max(Number(mon.level)||1,clamp(level,1,100,1))},path=[],seen=new Set();
        let status;
        while(!seen.has(projected.id)){
            seen.add(projected.id);status=evolutionStatus(s,projected,{level:projected.level,now});
            if(!status.rule)break;
            if(status.rule.party){status={rule:null,reason:'依赖队友形态，需逐次原生进化后重新核对'};break;}
            path.push({from:projected.id,to:status.rule.to,level:status.rule.level});projected.id=status.rule.to;
        }
        return{...projected,evolutionPath:path,evolutionBlockedReason:status?.rule?'进化链数据循环':status?.reason||'',
            evolutionItemLocked:status?.itemLocked===true,evolutionItemDetail:status?.itemDetail||''};
    }

    function trainingProjection(s, mon, desired, settings, now) {
        const level = Math.max(mon.level, Math.min(desired, trainingCap(s,mon)));
        if (settings.autoEvolve !== false) return projectEvolution(s,mon,level,now);
        const itemLocked = !(mon.rank > 0) && manualItemEvolution(s, EVOLUTION_DATA.rules[mon.id] || [])?.locked === true;
        return {...mon, level, evolutionItemLocked:itemLocked};
    }

    function* reserveEvolutionSearch(s,settings,context,candidates,now,sliced){
        const ready=[];
        for(const mon of candidates){
            if(levelEvolution(s,mon,{now}))ready.push(mon.uid);
            if(sliced)yield;
        }
        if(!ready.length)return{uid:null};
        const projected=[];
        for(const mon of s.mons){
            if(teamEligible(s,mon,context.reg))projected.push(projectEvolution(s,mon,mon.level,now));
            if(sliced)yield;
        }
        const plan=yield* adventureTeamSearch({...s,mons:projected},settings,[],{...context,pool:projected,force:true,now},sliced);
        return{uid:ready.find(uid=>plan.uids.includes(uid))??null};
    }


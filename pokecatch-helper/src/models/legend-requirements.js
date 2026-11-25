    // Native progress uses a dex entry for registration, but live ownership for an owns gate.
    // Species lists come from LegendZones.progress in the public f01c6dd773 bundle.
    const gateZones=new Map(DATA.zones.map(zone=>[zone.id,zone]));
    for(const zone of DATA.zones)for(const form of zone.forms||[])if(!gateZones.has(form))gateZones.set(form,zone);
    const gateLeagueEnds=new Map(DATA.chapters.filter(ch=>ch.league).map(ch=>[ch.reg,ch]));
    function gateMembers(s){
        return [...(s.mons||[]),...(s.pension?.mons||[]).map(slot=>slot.mon),...(s.under?.slots||[]).flatMap(slot=>slot.mons||[])];
    }
    function gateOwnsMon(s,id){return gateMembers(s).some(mon=>mon?.id===id);}
    function legendRequirements(s,ids){
        const goals=[...new Set(ids||[])].filter(id=>gateZones.get(id)?.gate||ROAMING_DATA.groups.some(group=>group.ids.includes(id)));
        if(!goals.length)return null;
        const owned=new Set(gateMembers(s).filter(Boolean).map(mon=>mon.id)),visited=new Set();
        const open=new Set(['kanto',currentRegion(s),...(s.travel?.to||[])]);
        const plan={goals,lines:[],wild:new Set(),zones:new Set(),items:new Set(),roam:new Set(),roamOwned:new Set(),trainers:new Set(),doors:new Map(),elites:new Map(),progress:false,notes:[]};
        function elite(id,tier){
            plan.elites.set(id,Math.max(tier,plan.elites.get(id)||0));
            if(!s.adv.badges?.includes('Forêt'))plan.progress=true;
            if(!owned.has(id))species(id,true);
        }
        function item(id){
            if(plan.items.has(id))return;
            plan.items.add(id);
            const sources=ITEMS.get(id)?.sources||[];
            if(!sources.length){
                if(id==='auroraticket')plan.notes.push('对战塔最高到达 40 层后，在塔商店用 1,000 BP 兑换极光船票');
                return;
            }
            // Only a requirement common to every alternative is obligatory.
            const members=src=>[...(src.owns||[]),...(src.team||[])];
            for(const n of new Set(members(sources[0])))if(!owned.has(n)&&sources.every(src=>members(src).includes(n)))species(n,true);
            if(sources.every(src=>src.day&&src.team?.length)){
                plan.notes.push(ITEMS.get(id).name+'须白天携指定成员出战：'+sources.map(src=>src.team.map(n=>MONS.get(n).name).join('、')).join(' / '));
            }
            if(sources.every(src=>!open.has(CHAPTERS.get(src.ch)?.reg)||src.ch>s.adv.unlocked||src.badge&&!s.adv.badges?.includes(src.badge)))plan.progress=true;
        }
        function species(id,requireOwned=false){
            const group=ROAMING_DATA.groups.find(group=>group.ids.includes(id));
            if(group&&requireOwned)plan.roamOwned.add(id);
            if(group&&open.has(group.reg)){
                if(!s.adv.badges?.includes(group.badge))plan.progress=true;
                if(s.roam?.caught?.includes(id)){
                    if(requireOwned&&!owned.has(id)){
                        const note=MONS.get(id).name+'已完成游荡，当前持有条件可通过交换补齐';
                        if(!plan.notes.includes(note))plan.notes.push(note);
                    }
                }else if(requireOwned?!owned.has(id):!captured(s,id))plan.roam.add(id);
                visited.add(id);return;
            }
            if(visited.has(id))return;
            visited.add(id);
            const zone=gateZones.get(id);
            if(!zone){plan.wild.add(id);return;}
            if(!open.has(zone.reg)){plan.progress=true;plan.notes.push('需要开放'+DATA.regions.find(r=>r.key===zone.reg).name);return;}
            // Native ordinary zones reopen for a registered but no longer owned species.
            // Rotating forms instead use their shared dex register to choose the next foe.
            if(!goals.includes(id)&&zone.forms?.length&&captured(s,id)&&!owned.has(id)){
                plan.notes.push(MONS.get(id).name+'有捕获记录，需重新持有；可检查地区寄存或交换');return;
            }
            const gate=zone.gate;
            if(!gate){plan.notes.push(zone.condition);return;}
            const rules=gate.list||[gate];
            let ready=true;
            for(const rule of rules){
                let missing=[],have=0,need=rule.need||1,label='';
                if(rule.ids){
                    const owns=rule.kind==='owns';
                    missing=rule.ids.filter(n=>owns?!owned.has(n):!s.dex?.[n]);
                    have=rule.ids.length-missing.length;need=rule.need||rule.ids.length;
                    label=owns?'持有指定宝可梦':'登记指定物种';
                }else if(rule.kind==='item'){
                    label='取得'+(ITEMS.get(rule.item)?.name||(rule.item==='auroraticket'?'极光船票':rule.item));have=Number(ownedItems(s,rule.item)>0);
                    if(!have){
                        const reward=ITEMS.get(rule.item)?.eliteReward;
                        if(reward){
                            if((s.elite?.[reward.zone]?.t||0)<reward.tier)elite(reward.zone,reward.tier);
                            else plan.notes.push(label+' · 对应精英阶级的一次性奖励已达成，请检查奖励和背包');
                        }else if(!rules.some(other=>other.kind==='owns'&&other.ids.some(n=>!owned.has(n))))item(rule.item);
                    }
                }else if(rule.kind==='tally'){
                    have=s.stats?.byReg?.[zone.reg]?.[rule.field]||0;label='击败本地区训练家';
                    if(have<need)plan.trainers.add(zone.reg);
                }else if(rule.kind==='league'){
                    const ch=gateLeagueEnds.get(rule.region);
                    have=Number(!!ch&&(s.adv.unlocked>ch.id||ch.badges.some(b=>s.adv.badges?.includes(b))));label='打通地区联盟';
                    if(!have)plan.progress=true;
                }else if(rule.kind==='elite'){
                    have=s.elite?.[rule.zone]?.t||0;need=rule.tier;label=MONS.get(rule.zone).name+'精英阶级';
                    if(have<need)elite(rule.zone,need);
                }else if(rule.kind==='door'){
                    have=Number(!!s.zoneDoors?.[rule.key]);label='解开入口铭文';
                    if(!have){
                        missing=(rule.team||[]).filter(n=>!owned.has(n));
                        const team=rule.team?.map(n=>MONS.get(n).name).join('、');
                        const clue=team?'队伍需要'+team:rule.wait?'在铭文前等待':'出示'+(DATA.types[rule.type]?.fr||rule.type)+'属性成员';
                        plan.notes.push(zone.name+' · '+clue);
                        if(!missing.length&&(!rule.badge||s.adv.badges?.includes(rule.badge))){
                            plan.doors.set(id,rule);
                            if(rule.type&&!riddleParty(s,rule,zone.reg,true)){
                                for(const m of ROOTS)if(!m.legend&&m.types.includes(rule.type))plan.wild.add(m.id);
                            }
                        }
                        if(rule.badge&&!s.adv.badges?.includes(rule.badge))plan.progress=true;
                    }
                }else{ready=false;plan.notes.push(zone.condition);continue;}
                plan.lines.push({id,kind:rule.kind,label,have:Math.min(have,need),need,missing});
                if(have<need){ready=false;for(const n of missing)species(n,rule.kind==='owns'||rule.kind==='door');}
            }
            if(ready)plan.zones.add(zone.id);
        }
        for(const id of goals)species(id);
        return plan;
    }
    function requirementLabel(plan){
        return plan.goals.map(id=>MONS.get(id).name).slice(0,3).join('、');
    }
    function riddleParty(s,rule,reg,autoTeam){
        if(rule.wait)return [];
        const party=partyMons(s),pool=autoTeam?[...party,...(s.mons||[])]:party;
        const match=predicate=>pool.find(m=>teamEligible(s,m,reg)&&predicate(m))?.uid;
        const uids=rule.team?rule.team.map(id=>match(m=>m.id===id)):[match(m=>MONS.get(m.id)?.types.includes(rule.type))];
        return uids.every(Boolean)?uids:null;
    }
    let freeParents;
    function gateAncestors(targets){
        if(!freeParents){
            freeParents=new Map();
            for(const [from,rules] of Object.entries(EVOLUTION_DATA.rules)){
                if(rules.length===1&&rules[0].level>0&&!rules[0].item)freeParents.set(rules[0].to,Number(from));
            }
        }
        const parents=new Set();
        for(const target of targets){
            let id=freeParents.get(target);
            while(id&&!parents.has(id)){parents.add(id);id=freeParents.get(id);}
        }
        return parents;
    }
    function gateTrainee(s,cfg,plan,now){
        if(!cfg.autoEvolve||!plan.wild.size)return null;
        const targets=plan.wild.has(spiritEvent.id)&&!s.adv.gifts?.[spiritEvent.once]?
            [...plan.wild,...spiritEvent.caught.filter(id=>!s.dex?.[id])]:plan.wild;
        const parents=gateAncestors(targets);
        let best=null;
        for(const mon of s.mons||[]){
            if(!parents.has(mon.id)||!teamEligible(s,mon)||!cfg.autoTeam&&!s.team?.includes(mon.uid))continue;
            const rule=EVOLUTION_DATA.rules[mon.id][0];
            if(!levelEvolution(s,mon,{level:Math.max(mon.level,Math.min(rule.level,trainingCap(s,mon))),now}))continue;
            const gap=Math.max(0,rule.level-mon.level);
            if(!best||gap<best.gap)best={mon,rule,gap};
        }
        return best;
    }
    function prerequisiteRoutes(s,settings,plan,now){
        const wild=new Set([...plan.wild].filter(id=>!s.pension?.eggs?.some(e=>e.id===id)));
        const rows=wild.size?rankDexTargets(s,settings,wild,now):[];
        const note=requirementLabel(plan)+'前置';
        if(rows.length)return rows.map(row=>({...row,gateRoute:true,prepNote:note+' · 登记'+row.targets.slice(0,3).map(hit=>MONS.get(hit.id).name).join('、')}));
        const fixed=fixedPrerequisiteRoutes(s,settings,wild,now);
        if(fixed.length)return fixed.map(row=>({...row,gateRoute:true,prepNote:note+' · '+row.prepNote}));
        if(settings.autoEvolve&&wild.size){
            const parents=gateAncestors(wild);
            for(const mon of s.mons||[])if(!mon.shiny)parents.delete(mon.id);
            for(const egg of s.pension?.eggs||[])parents.delete(egg.id);
            if(parents.size&&!gateTrainee(s,settings,plan,now)){
                const base=rankDexTargets(s,settings,parents,now);
                if(base.length)return base.map(row=>({...row,gateRoute:true,prepNote:note+' · 捕获可免费进化的前置形态'}));
            }
        }
        const alternatives=new Map();
        for(const itemId of plan.items){
            if(!ITEMS.has(itemId))continue;
            for(const row of itemRanking(s,{...settings,mode:'item',region:'all',itemId},{},{},now)){
                if(!huntRouteMatches(s,settings,row,now))continue;
                const previous=alternatives.get(row.key);
                if(previous){previous.gateItems.push(itemId);previous.score+=row.rate;previous.prepNote+='、'+ITEMS.get(itemId).name;}
                else alternatives.set(row.key,{...row,targets:[],priority:0,gateRoute:true,requiredParty:row.sources[0]?.team,gateItem:itemId,gateItems:[itemId],
                    expected:undefined,score:row.rate,prepNote:note+' · 收集'+ITEMS.get(itemId).name});
            }
        }
        if(alternatives.size)return [...alternatives.values()].sort((a,b)=>b.score-a.score);
        return candidates(s,settings,true).filter(row=>plan.trainers.has(row.reg)&&huntRouteMatches(s,settings,row,now)).map(row=>({
            ...row,targets:[],priority:0,gateRoute:true,score:row.members.reduce((n,id)=>n+CHAPTERS.get(id).trainers,0)/estimatedRouteSeconds(row,settings.speed),
            prepNote:note+' · 累计地区训练家胜场'
        })).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
    }

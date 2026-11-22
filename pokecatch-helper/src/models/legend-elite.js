    function legendEliteContext(s,id,tier,now=Date.now()){
        const zone=DATA.zones.find(entry=>entry.id===id),rules=LEGEND_ELITE.zones[id];
        if(!zone||!rules)return null;
        // A launched run keeps its rolled form. Fresh runs use the native Monday UTC rotation.
        const active=s.adv.zone?.id===id&&s.adv.zone.elite===tier?s.adv.zone:null;
        const week=Math.floor(Date.parse(towerWeek(now))/(7*86400000)),forms=zone.forms||[id];
        const foeId=active?.foe??forms[((week%forms.length)+forms.length)%forms.length],knobs=rules.foes[foeId]?.[tier-1];
        if(!knobs||!MONS.has(foeId))return null;
        const [hp,power]=knobs,weather=weatherDamageContext(s,s.adv.chapter,now);
        const foe={id:foeId,rank:tier,level:LEGEND_ELITE.level,hpMult:hp*LEGEND_ELITE.enemyHp,damageMult:power*LEGEND_ELITE.enemyDamage,weight:1};
        return{kind:'zone',id,tier,reg:zone.reg,level:foe.level,size:LEGEND_ELITE.size,speciesUnique:true,foes:[foe],weather,
            label:(MONS.get(foeId).name||zone.monName)+' · 精英 '+tier+' 阶',
            key:JSON.stringify(['legend-elite',id,tier,foeId,Object.values(weather)]),counter:rules.counter,burst:rules.burst};
    }

    function legendEliteCompatible(mon,team){
        const identity=mon=>DATA.combat.singles[mon.id]||mon.id;
        if(team.some(member=>identity(member)===identity(mon)||LEGEND_ELITE.apart.some(([id,others])=>
            mon.id===id&&others.includes(member.id)||member.id===id&&others.includes(mon.id))))return false;
        return !MONS.get(mon.id).legend||team.filter(member=>MONS.get(member.id).legend).length<LEGEND_ELITE.legendLimit;
    }

    function legendEliteMatchup(mon,context,bossStats,counters){
        const boss=context.foes[0],member={...mon,status:null,level:Math.min(mon.level,context.level)};
        const stats=effectiveStats(member),details={weather:context.weather,details:true};
        const attack=expectedDamage(member,boss,stats,bossStats,details);
        const types=defensiveTypes(MONS.get(member.id));
        if(!context.counter&&!counters.has(member.id)){
            const model=MONS.get(boss.id),moves=[...new Map(damagingMoves(model)
                .filter(move=>move.level<=boss.level&&move.stab>1&&types[move.move.type]>0)
                .map(move=>[move.key,move])).values()].sort((a,b)=>a.move.power-b.move.power);
            counters.set(member.id,moves[Math.floor((moves.length-1)/2)]?.key);
        }
        const counter=context.counter||counters.get(member.id);
        const incoming=expectedDamage(boss,member,bossStats,stats,details).sustainedDamage;
        const retaliation=expectedDamage(boss,member,bossStats,stats,{...details,move:counter}).sustainedDamage*LEGEND_ELITE.counter;
        const burst=expectedDamage(boss,member,bossStats,stats,{...details,move:context.burst}).sustainedDamage*LEGEND_ELITE.burst;
        const [status,chance]=LEGEND_ELITE.dot[attack.key]||[];
        const foeTypes=MONS.get(boss.id).types,foeDefense=defensiveTypes(MONS.get(boss.id)),resistance=LEGEND_ELITE.resist[context.tier-1];
        const blocked={burn:foeTypes.includes('fire'),poison:foeTypes.some(type=>['poison','steel'].includes(type)),freeze:foeTypes.includes('ice')};
        const dot=!blocked[status]&&chance&&attack.hit?chance*attack.turnAccuracy*resistance:0;
        const setupMove=(LEGEND_ELITE.statusLearn[member.id]||[]).findLast(([level,key])=>{
            const [effect,,type]=LEGEND_ELITE.statusMoves[key];
            return level<=member.level&&!blocked[effect]&&foeDefense[type]>0;
        });
        const [setupType,setupChance]=LEGEND_ELITE.statusMoves[setupMove?.[1]]||[];
        const setup=['burn','poison'].includes(setupType)?setupChance*resistance:0;
        return{mon,hp:stats.hp,speed:stats.spe,damage:attack.sustainedDamage,maxHit:attack.maxHit,hits:attack.hit>0?attack.turnAccuracy:0,incoming,retaliation,burst,dot,setup};
    }

    function estimateLegendElite(team,bossStats,tier){
        if(!team.length)return{score:0,turns:0,survivors:0,damage:0};
        const ordered=[...team].sort((a,b)=>b.speed-a.speed),hp=ordered.map(member=>member.hp);
        const maxHP=hp.reduce((sum,value)=>sum+value,0);
        let remaining=bossStats.hp,rage=0,survivors=team.length,turns=0;
        // Model six active allies, a distributed single-target response, and periodic bursts.
        // The selected damaging moves can induce one shared burn or poison at a time.
        const dot=Array(LEGEND_ELITE.dotTurns).fill(0),dotDamage=bossStats.hp/LEGEND_ELITE.hurt[tier-1];
        function enemyHit(kind,multiplier=1,spread=true){
            if(!survivors)return;
            const share=multiplier/(spread?survivors:1);
            for(let i=0;i<hp.length;i++){
                if(hp[i]<=0)continue;
                hp[i]=Math.max(0,hp[i]-ordered[i][kind]*share);
                if(hp[i]===0)survivors--;
            }
        }
        while(turns<90&&remaining>0&&survivors){
            turns++;
            let bossActed=false,withoutDot=1;
            const available=Math.max(0,1-dot.reduce((sum,value)=>sum+value,0));
            for(let i=0;i<ordered.length&&remaining>0;i++){
                const member=ordered[i];
                if(!bossActed&&member.speed<=bossStats.spe){enemyHit('incoming');bossActed=true;}
                if(hp[i]<=0)continue;
                const setUp=member.setup&&remaining>member.maxHit?LEGEND_ELITE.setupChance*available:0;
                const attacks=1-setUp,hits=member.hits*attacks;
                remaining-=member.damage*attacks;withoutDot*=1-member.dot*attacks-member.setup*setUp;
                if(remaining<=0||!hits)continue;
                rage+=hits;
                if(rage>=LEGEND_ELITE.rage){rage-=LEGEND_ELITE.rage;enemyHit('burst',1,false);}
                else enemyHit('retaliation',hits);
            }
            if(remaining>0&&survivors&&!bossActed)enemyHit('incoming');
            for(let i=dot.length-1;i>0;i--)dot[i]=dot[i-1];
            dot[0]=available*(1-withoutDot);
            if(remaining>0&&survivors)remaining-=dotDamage*dot.reduce((sum,value)=>sum+value,0);
        }
        const damage=1-Math.max(0,remaining)/bossStats.hp;
        const health=hp.reduce((sum,value)=>sum+value,0)/maxHP;
        const score=remaining<=0?2+1/(1+turns/10)+.5*health+.25*survivors/LEGEND_ELITE.size:damage+.15*health;
        return{score,turns,survivors,damage};
    }

    function* legendEliteTeamSearch(s,context,sliced){
        const bossStats=effectiveStats(context.foes[0]),counters=new Map(),party=s.eventTeams?.['zone:'+context.id]||[];
        const currentIndex=new Map(party.map((uid,i)=>[uid,i])),profiles=new Map(),current=[];
        for(const mon of s.mons||[]){
            if(!teamEligible(s,mon,context.reg))continue;
            const profile=JSON.stringify(combatProfile({...mon,status:null}));
            let row=profiles.get(profile);
            if(!row||currentIndex.has(mon.uid)){
                row=legendEliteMatchup(mon,context,bossStats,counters);
                if(!profiles.has(profile)||currentIndex.has(mon.uid)&&!currentIndex.has(profiles.get(profile).mon.uid))profiles.set(profile,row);
            }
            if(currentIndex.has(mon.uid))current.push(row);
            if(sliced)yield;
        }
        const statusPressure=row=>row.dot+LEGEND_ELITE.setupChance*row.setup;
        const rows=[...profiles.values()],quality=row=>(row.damage+bossStats.hp/LEGEND_ELITE.hurt[context.tier-1]*statusPressure(row))
            * Math.sqrt(row.hp/Math.max(1,row.incoming+row.retaliation+row.burst/LEGEND_ELITE.rage));
        for(const row of rows)row.quality=quality(row);
        const shortlist=(group,by,count)=>{
            const ids=new Set();
            return [...group].sort((a,b)=>by(b)-by(a)).filter(row=>{
                const id=DATA.combat.singles[row.mon.id]||row.mon.id;
                if(ids.has(id))return false;
                ids.add(id);return true;
            }).slice(0,count);
        };
        const regular=rows.filter(row=>!MONS.get(row.mon.id).legend),legendary=rows.filter(row=>MONS.get(row.mon.id).legend);
        const candidates=[...new Set([
            ...shortlist(regular,row=>row.quality,18),...shortlist(regular,row=>row.damage,8),...shortlist(regular,statusPressure,6),
            ...shortlist(legendary,row=>row.quality,8),...shortlist(legendary,row=>row.damage,4),...current,
        ])];
        const evaluate=team=>estimateLegendElite(team,bossStats,context.tier);
        const legal=(row,team)=>legendEliteCompatible(row.mon,team.map(other=>other.mon));
        let chosen=[];
        while(chosen.length<context.size){
            let best=null,bestScore=-Infinity;
            for(const row of candidates){
                if(!legal(row,chosen))continue;
                const value=evaluate([...chosen,row]).score;
                if(value>bestScore){best=row;bestScore=value;}
                if(sliced)yield;
            }
            if(!best)break;
            chosen.push(best);
        }
        let result=evaluate(chosen);
        for(let i=0;i<chosen.length;i++){
            const others=chosen.filter((_,index)=>index!==i);
            for(const row of candidates){
                if(row===chosen[i]||!legal(row,others))continue;
                const proposed=[...chosen];proposed[i]=row;
                const value=evaluate(proposed);
                if(value.score>result.score*1.001){chosen=proposed;result=value;}
                if(sliced)yield;
            }
        }
        const legalCurrent=[];
        for(const row of current.sort((a,b)=>currentIndex.get(a.mon.uid)-currentIndex.get(b.mon.uid))){
            if(legalCurrent.length<context.size&&legal(row,legalCurrent))legalCurrent.push(row);
        }
        if(legalCurrent.length===party.length&&party.length===chosen.length){
            const previous=evaluate(legalCurrent);
            if(previous.score>=result.score*.97){chosen=legalCurrent;result=previous;}
        }
        return{uids:chosen.map(row=>row.mon.uid),estimate:result};
    }

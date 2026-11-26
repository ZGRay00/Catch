    function candyContext(s,type,floor=50){
        if(!Object.hasOwn(CANDY_DATA.pools,type))return null;
        const target=Math.floor(clamp(floor,1,999,50)),battleFloor=target%CANDY_DATA.step===0?target-1:target;
        const [[from,initial],[until,maximum]]=CANDY_DATA.curve;
        const level=Math.min(100,Math.floor(battleFloor<=until?initial+(maximum-initial)*(battleFloor-from)/(until-from):100));
        const rank=battleFloor<CANDY_DATA.rankFrom?0:Math.min(CANDY_DATA.rankMax,1+Math.floor((battleFloor-CANDY_DATA.rankFrom)/CANDY_DATA.rankEvery));
        const statMult=1+CANDY_DATA.overAfter*Math.max(0,battleFloor-(CANDY_DATA.rankFrom+(CANDY_DATA.rankMax-1)*CANDY_DATA.rankEvery));
        let maxDex=151;
        for(const [key,cap]of [['kanto',151],['johto',251],['hoenn',386],['sinnoh',493],['unova',649]]){
            const league=DATA.chapters.filter(chapter=>chapter.reg===key&&chapter.league),last=league.at(-1);
            if(last&&((s.adv?.unlocked||0)>last.id||last.badges?.some(badge=>s.adv?.badges?.includes(badge))))maxDex=Math.max(maxDex,cap);
        }
        // CandyRun accepts the linked old group even while adventure is in the new region.
        const reg=s.link?(s.link.from&&s.link.from!==s.link.to?s.link.from:'kanto'):economicRegion(s);
        const pool=CANDY_DATA.pools[type][CANDY_DATA.poolCaps.indexOf(maxDex)];
        const foes=pool.filter(id=>MONS.has(id)).map(id=>({id,level,rank,statMult,weight:1}));
        return{kind:'candy',id:type,type,reg,level,rank,statMult,foes,size:CANDY_DATA.team,floor:target,battleFloor,maxDex,speciesUnique:false,
            label:`糖果工厂 · ${DATA.types[type]?.fr||type}主题`,key:`candy:${type}:${target}:${battleFloor}:${reg}:${maxDex}:${level}:${rank}:${statMult}`};
    }
    function candyGoalContext(s,settings,type){
        const goal=settings.candyFloor>0?Math.ceil(settings.candyFloor/CANDY_DATA.step)*CANDY_DATA.step:50;
        return candyContext(s,type,goal);
    }
    function candyPlan(s,settings,type){
        return candyTeamSearch(s,settings,candyGoalContext(s,settings,type),false).next().value;
    }
    function* candyTeamSearch(s,settings,context,sliced,now=Date.now()){
        if(!context)return null;
        // The native run clones these fields only; PC injuries and temporary multipliers
        // do not carry over, and low-level members are never raised to the level cap.
        const pool=(s.mons||[]).filter(mon=>teamEligible(s,mon,context.reg)).map(mon=>({uid:mon.uid,id:mon.id,reg:monRegion(mon),
            level:Math.min(100,Math.max(1,Number(mon.level)||1)),shiny:!!mon.shiny,...mon.rank?{rank:mon.rank}:{},...mon.taste?{taste:mon.taste}:{}}));
        const party=(s.eventTeams?.candy||[]).filter(uid=>pool.some(mon=>mon.uid===uid));
        const state={...s,mons:pool,team:party,road:party};
        const plan=yield* adventureTeamSearch(state,settings,[],{...context,pool,force:true,objective:'progress',now},sliced);
        return{...plan,context,reason:'按今日主题的真实对手、已会招式与耐久选择工厂队伍'};
    }
    function effectiveStats(mon) {
        const model = MONS.get(mon.id), level = clamp(mon.level, 1, 100, 1), scale = (mon.shiny ? 1.1 : 1) * (DATA.combat.rankStat ** (mon.rank || 0)) * (mon.statMult || 1);
        const out = {};
        for (const key of ['atk','def','spa','spd','spe']) out[key] = Math.floor((Math.floor(2 * model.stats[key] * level / 100) + 5) * scale * tasteMultiplier(mon.taste,key));
        out.hp = Math.floor(Math.floor((Math.floor(2 * model.stats.hp * level / 100) + level + 10) * scale) * Math.min(DATA.combat.hpMax, 1 + DATA.combat.hpScale * level / 100) * (DATA.combat.hpBoost||1) * (mon.hpMult || 1));
        return out;
    }
    // Public native CONFIG.MULTI_HIT / MULTI_HIT_ODDS, build 0a26d39c19.
    // movePower is the aggregate used to choose a move; damage is rolled per strike.
    const MULTI_HIT_DATA = Object.freeze({
        odds: [.35,.35,.15,.15],
        moves: { 'double-kick':2,bonemerang:2,twineedle:2,'double-hit':2,'dual-chop':2,'gear-grind':2,'twin-beam':2,'double-iron-bash':2,'dragon-darts':2,'dual-wingbeat':2,'surging-strikes':3,'triple-dive':3,
            'triple-kick':[10,20,30],'triple-axel':[20,40,60],'fury-attack':'2-5','fury-swipes':'2-5','pin-missile':'2-5','bullet-seed':'2-5','icicle-spear':'2-5','rock-blast':'2-5','arm-thrust':'2-5','bone-rush':'2-5','double-slap':'2-5','comet-punch':'2-5','spike-cannon':'2-5',barrage:'2-5','tail-slap':'2-5','water-shuriken':'2-5','scale-shot':'2-5' }
    });
    function damageRollMean(full) {
        // Integrate max(1,floor(full * U[.85,1])) without sampling or a damage-sized loop.
        const low=full*.85,high=full;
        if(!(high>low))return Math.max(1,Math.floor(high||0));
        const integral=value=>{const n=Math.floor(value);return n*(n-1)/2+n*(value-n)+Math.min(value,1);};
        return (integral(high)-integral(low))/(high-low);
    }
    // These values depend only on the game catalog, so HP, level-ups and save
    // changes do not invalidate them. Build each species only when it battles.
    const speciesOffense=new WeakMap(),speciesDefense=new WeakMap();
    function damagingMoves(model){
        let entries=speciesOffense.get(model);
        if(!entries){
            entries=[];
            for(const [level,key] of model.learn||[]){
                const move=DATA.combat.moves[key];
                if(!move?.power)continue;
                const stab=model.types.includes(move.type)?1.5:1;
                const deployPower=move.power*move.acc/100*stab*model.stats[move.cat==='phys'?'atk':'spa'];
                entries.push({level,key,move,stab,deployPower});
            }
            speciesOffense.set(model,entries);
        }
        return entries;
    }
    function activeMoveBans(mon,entries){
        const banned=mon.ban;
        // The native game restores its learned move list if all available attacks are disabled.
        return Array.isArray(banned)&&banned.length&&entries.some(entry=>entry.level<=mon.level&&!banned.includes(entry.key))?banned:null;
    }
    function moveBanKey(mon){
        return Array.isArray(mon.ban)&&mon.ban.length?[...new Set(mon.ban)].sort().join('.'):null;
    }
    function reserveStrength(mon){
        const stats=effectiveStats(mon);
        const entries=damagingMoves(MONS.get(mon.id)),banned=activeMoveBans(mon,entries);
        const offense=entries.reduce((best,{level,key,move,stab})=>level>mon.level||banned?.includes(key)?best:
            Math.max(best,stats[move.cat==='phys'?'atk':'spa']*move.power*move.acc*stab/100),0);
        return Math.sqrt(offense*(mon.damageMult||1)*stats.hp*Math.sqrt(stats.def*stats.spd));
    }
    // Give a one-hit win with room for a stronger foe or a counterattack credit
    // over a borderline one. This is a selection cost, not measured fight time.
    function farmingPressure(detail){
        const damageMargin=(detail.attack.minHit??0)/Math.max(1,detail.foeHp);
        const incoming=(detail.incoming.maxHit??0)/Math.max(1,detail.hp);
        return .22/(1+damageMargin)+(.15+.10*(1-detail.first))*incoming/(1+incoming);
    }
    const FARM_RESERVE_BONUS=.14, FARM_CHANGE_GAIN=.0075;
    function farmRiskDelta(safety,previous){
        const keyWipes=previous.keyWipes-safety.keyWipes;
        return Math.abs(keyWipes)>1e-8?keyWipes:previous.wipes-safety.wipes;
    }
    function farmRiskBeforeScore(safety,previous,score,current){
        const risk=farmRiskDelta(safety,previous);
        return risk>1e-8||Math.abs(risk)<=1e-8&&score>current+1e-8;
    }
    function worthwhileFarmChange(score,current,safety,previous){
        const risk=farmRiskDelta(safety,previous);
        if(Math.abs(risk)>1e-8)return risk>0;
        return score>current*(1+FARM_CHANGE_GAIN)||score>=current&&safety.deaths<=previous.deaths&&safety.worst<=previous.worst-1;
    }
    function teamApart(a,b){
        const fusion=a.id===643||a.id===644?b.id:a.id;
        const dragon=fusion===a.id?b.id:a.id;
        return dragon===643&&(fusion===646||fusion===64602)||dragon===644&&(fusion===646||fusion===64601);
    }
    function* combatShortlist(candidates,party,foes,identity,lowBudget,sliced,roles=false){
        const matchups=new Map();
        for(const foe of foes){
            const model=MONS.get(foe.id),key=model.types.join('/'),existing=matchups.get(key);
            const weight=foe.weight*(foe.gymCount||foe.guard?3:1);
            if(existing)existing.weight+=weight;
            else matchups.set(key,{weight,types:model.types,defense:defensiveTypes(model),leaders:[]});
        }
        const targets=[...matchups.values()].sort((a,b)=>b.weight-a.weight).slice(0,lowBudget?14:20);
        const specialistsPerMatchup=lowBudget?2:3;
        const strength=[];
        for(const mon of candidates){
            const model=MONS.get(mon.id),stats=effectiveStats(mon),defense=defensiveTypes(model),entries=damagingMoves(model);
            const banned=activeMoveBans(mon,entries),offense={};
            for(const {level,key,move,stab} of entries){
                if(level>mon.level||banned?.includes(key))continue;
                const power=stats[move.cat==='phys'?'atk':'spa']*move.power*move.acc*stab*(mon.damageMult||1)/100;
                if(power>(offense[move.type]||0))offense[move.type]=power;
            }
            const attacks=Object.entries(offense),bulk=stats.hp*Math.sqrt(stats.def*stats.spd);
            const offensePeak=Math.max(0,...Object.values(offense)),general=Math.sqrt(offensePeak*bulk);
            strength.push({mon,general,offense:offensePeak,bulk,speed:stats.spe});
            const group=identity(mon);
            for(const target of targets){
                let best=0;
                for(const [type,power] of attacks)best=Math.max(best,power*(target.defense[type]??1));
                const incoming=Math.max(.25,...target.types.map(type=>defense[type]??1));
                const score=best*Math.sqrt(bulk/incoming);
                const same=target.leaders.findIndex(entry=>entry.group===group);
                if(same>=0){
                    if(target.leaders[same].score>=score)continue;
                    target.leaders.splice(same,1);
                }
                if(target.leaders.length<specialistsPerMatchup||score>target.leaders.at(-1).score){
                    target.leaders.push({mon,group,score});target.leaders.sort((a,b)=>b.score-a.score);
                    if(target.leaders.length>specialistsPerMatchup)target.leaders.pop();
                }
            }
            if(sliced&&strength.length%4===0)yield;
        }
        const standing=new Set(candidates);
        const leading=new Set();
        const rolesToKeep=roles?['general','offense','bulk','speed']:['general'];
        for(const role of rolesToKeep){
            const limit=role==='general'?(lowBudget?16:24):(lowBudget?2:4),seen=new Set();
            strength.sort((a,b)=>b[role]-a[role]||b.general-a.general);
            for(const {mon} of strength){
                const id=identity(mon);
                if(seen.has(id))continue;
                seen.add(id);leading.add(mon);
                if(seen.size>=limit)break;
            }
            if(roles&&sliced)yield;
        }
        return [...new Set([...leading,...targets.flatMap(target=>target.leaders.map(entry=>entry.mon)),...party.filter(mon=>standing.has(mon))])];
    }
    function defensiveTypes(model){
        let table=speciesDefense.get(model);
        if(!table){
            table=Object.fromEntries(Object.keys(DATA.types).map(type=>[type,model.types.reduce((n,t)=>n*(DATA.chart[type]?.[t]??1),1)]));
            speciesDefense.set(model,table);
        }
        return table;
    }
    function expectedDamage(mon, foe, stats, defense, options = {}) {
        if(!MONS.has(mon.id)||!MONS.has(foe.id))return 0;
        // Native Transform copies the attacking species and its stats, keeping level/rank/shiny.
        if(mon.id===132&&foe.id!==132){mon={...mon,id:foe.id};stats=effectiveStats(mon);}
        const model = MONS.get(mon.id), enemy = MONS.get(foe.id);
        let best=null;
        function baseDamage(power,attack,weakened,resistance,stab,type,weather){
            return ((2*mon.level/5+2)*power*attack*weakened/resistance/50+2)*stab*type*weather;
        }
        const consider=(key,move,type,stab,typeless=false)=>{
            const physical=move.cat==='phys',weakened=mon.status===(physical?'burn':'poison')?.75:1;
            const exposed=foe.status===(physical?'sleep':'freeze')?.75:1;
            const rawWeather=typeless?1:typeof options.weather==='function'?options.weather(move.type):options.weather?.[move.type];
            const weather=Number.isFinite(rawWeather)&&rawWeather>=0?rawWeather:1;
            const attack=stats[physical?'atk':'spa'],resistance=Math.max(1,defense[physical?'def':'spd']*exposed);
            const accuracy=Math.max(0,Math.min(1,move.acc/100));
            const choice=baseDamage(move.power,attack,weakened,resistance,stab,type,weather)*accuracy;
            if(!best||choice>best.choice)best={key,move,type,stab,weather,attack,weakened,resistance,accuracy,choice,typeless};
        };
        const types=defensiveTypes(enemy);
        const fixed=DATA.combat.moves[options.move];
        if(fixed?.power)consider(options.move,fixed,types[fixed.type]??1,model.types.includes(fixed.type)?1.5:1);
        else{
            const entries=damagingMoves(model),banned=activeMoveBans(mon,entries);
            for(const entry of entries){
                if(entry.level>mon.level||banned?.includes(entry.key))continue;
                consider(entry.key,entry.move,types[entry.move.type]??1,entry.stab);
            }
        }
        // Native combat uses typeless Struggle when all learned damaging moves are immune.
        if(!fixed?.power&&best&&!(best.choice>0)&&DATA.combat.moves.struggle){best=null;consider('struggle',DATA.combat.moves.struggle,1,1,true);}
        if(!best)return options.details?{damage:0,sustainedDamage:0,hit:0,minHit:0,maxHit:0,accuracy:1,turnAccuracy:1,type:null}:0;
        // Native selection uses aggregate power. Integrate per-strike rolls only for the selected move.
        const {key,move,type,stab,weather,attack,weakened,resistance,accuracy,choice,typeless}=best;
        const gap=Math.pow(DATA.combat.levelGap,Math.max(-99,Math.min(99,mon.level-foe.level)));
        const count=typeless?null:MULTI_HIT_DATA.moves[key],randomCount=count==='2-5';
        const repeats=randomCount?MULTI_HIT_DATA.odds.reduce((sum,weight,i)=>sum+weight*(i+2),0):Array.isArray(count)?1:count||1;
        let hit=0,minHit=0,maxHit=0,singleRollMax=0;
        if(type>0){
            for(const power of Array.isArray(count)?count:[move.power/repeats]){
                const full=baseDamage(power,attack,weakened,resistance,stab,type,weather)*gap*(mon.damageMult||1);
                if(!count)singleRollMax=full;
                hit+=damageRollMean(full);minHit+=Math.max(1,Math.floor(full*.85));maxHit+=Math.max(1,Math.ceil(full)-1);
            }
            hit*=repeats;minHit*=randomCount?2:repeats;maxHit*=randomCount?5:repeats;
        }
        const damage=hit*accuracy,turnAccuracy=1/(2-accuracy);
        if(!options.details)return options.capDamage?Math.min(defense.hp,hit)*accuracy:damage;
        const result={key,damage,sustainedDamage:hit*turnAccuracy,hit,minHit,maxHit,singleRollMax,accuracy,turnAccuracy,type:move.type,choice};
        // The native finisher checks one minimum roll with aggregate power, even for multi-hit moves.
        // For random 2–5-hit moves it uses the power of two strikes.
        if(options.knockoutFloor){
            const power=randomCount?2*Math.round(move.power/repeats):move.power;
            const raw=baseDamage(power,attack,weakened,resistance,stab,type,weather)*gap;
            result.knockoutFloor=type>0?Math.max(1,Math.floor(raw*.85)):0;
        }
        return result;
    }
    function matchupScore(mon,foe,stats=effectiveStats(mon),defense=effectiveStats(foe)){
        const attack=expectedDamage(mon,foe,stats,defense,{capDamage:true});
        const incoming=expectedDamage(foe,mon,defense,stats,{capDamage:true});
        const survival=Math.min(4,stats.hp/Math.max(.01,incoming));
        const speed=Math.min(1.2,Math.max(.8,Math.sqrt(stats.spe/Math.max(1,defense.spe))));
        return attack/Math.max(1,defense.hp)*(.5+.5*Math.sqrt(survival))*speed;
    }
    function deploymentScore(mon,foe){
        const model=MONS.get(mon.id),enemy=MONS.get(foe.id);if(!model||!enemy)return-Infinity;
        const types=defensiveTypes(enemy);
        let bestScore=-Infinity,bestType,fallbackPower=-Infinity,fallbackType;
        const entries=damagingMoves(model),banned=activeMoveBans(mon,entries);
        for(const {level,key,move,deployPower} of entries){
            if(level>mon.level||banned?.includes(key))continue;
            if(deployPower>fallbackPower){fallbackPower=deployPower;fallbackType=move.type;}
            const score=deployPower*(types[move.type]??1);
            if(score>bestScore){bestScore=score;bestType=move.type;}
        }
        const attack=types[bestScore>0?bestType:fallbackType]??1;
        const defense=defensiveTypes(model),incoming=Math.max(...enemy.types.map(type=>defense[type]??1));
        return(attack===0?-5:attack>1?3:attack<1?-3:0)+(incoming>1?-2:incoming<1?2:0)+.01*(Math.log2(Math.max(.125,attack))-Math.log2(Math.max(.125,incoming)));
    }
    function matchupDetails(mon,foe,stats=effectiveStats(mon),defense=effectiveStats(foe),options={}){
        const attack=expectedDamage(mon,foe,stats,defense,{...options,details:true}),incoming=expectedDamage(foe,mon,defense,stats,{...options,details:true});
        const speed=stats.spe*(mon.status==='paralysis'?.25:1),gap=speed-defense.spe*(foe.status==='paralysis'?.25:1);
        return{attack,incoming,hp:stats.hp,foeHp:defense.hp,speed,first:gap>0?1:gap<0?0:.5,deployment:deploymentScore(mon,foe)};
    }
    function attackTurns(attack,hp){
        if(!(attack.hit>0)||!(attack.accuracy>0))return Infinity;
        // A single strike rolls floor(full * U[.85,1)). If one strike can KO,
        // two hits are sufficient; integrate the chance of needing the second
        // even when the target is just above average damage.
        if(attack.singleRollMax>0&&hp<=attack.maxHit){
            const chanceOfSecond=hp<=attack.minHit?0:Math.min(1,Math.max(0,(Math.ceil(hp)-.85*attack.singleRollMax)/(.15*attack.singleRollMax)));
            return (1+chanceOfSecond)*(2-Math.min(1,attack.accuracy));
        }
        let hits=Math.max(1,Math.ceil(hp/attack.hit));
        // Borderline one-hit KOs can need a second attack due to the native damage roll.
        if(hits===1){const low=attack.minHit??Math.max(1,attack.hit*.85/.925),high=attack.maxHit??Math.max(1,attack.hit/.925);if(hp>low)hits+=Math.min(1,(hp-low)/Math.max(.01,high-low));}
        // Native battle remembers a miss and guarantees the next strike connects.
        return hits*(2-Math.min(1,attack.accuracy));
    }
    function deployedBattle(details,autoSwitch=true){
        if(!details.length)return{turns:1200,coverage:0,deaths:0};
        // Stable sort retains native party order at equal priorities.
        const order=autoSwitch?details.slice().sort((a,b)=>b.deployment-a.deployment):details;
        let hp=details[0].foeHp,turns=0,deaths=0;
        for(const detail of order){
            const {attack,incoming,first}=detail,needed=attackTurns(attack,hp);
            const survives=detail.survives??attackTurns(incoming,detail.hp),attacks=Math.max(0,survives-(1-first));
            if(Number.isFinite(needed)&&needed<=attacks){turns+=needed;return{turns:Math.max(1,turns),coverage:1,deaths};}
            const dealt=Number.isFinite(attacks)?attacks*(attack.sustainedDamage??attack.hit/(2-Math.min(1,attack.accuracy))):0;
            hp=Math.max(.01,hp-dealt);turns+=Math.min(60,Number.isFinite(survives)?survives:60)+1;deaths++;
        }
        return{turns:Math.max(150,turns*2),coverage:Math.min(.5,Math.max(0,1-hp/details[0].foeHp)*.5),deaths};
    }
    function battleWithReserves(details,autoSwitch,lastVictory,foeIndex){
        if(autoSwitch)details.sort((a,b)=>b.deployment-a.deployment);
        const previous=lastVictory[foeIndex];
        // Reserves after the winning member never enter this encounter. Reuse
        // only when every deployed matchup is identical and in the same order.
        if(previous&&previous.deployed.length<=details.length&&previous.deployed.every((member,j)=>member===details[j]))return previous.result;
        const result=deployedBattle(details,false);
        if(result.coverage===1)lastVictory[foeIndex]={deployed:details.slice(0,result.deaths+1),result};
        return result;
    }
    // Native order is stable. At an equal priority the original party slot breaks the tie.
    function reserveInsertionOrder(rest,order,member,slot,dest){
        let placed=false,n=0;
        for(const index of order){
            const detail=rest[index];
            if(!placed&&(member.deployment>detail.deployment||member.deployment===detail.deployment&&slot<=index)){
                dest[n++]=member;placed=true;
            }
            dest[n++]=detail;
        }
        if(!placed)dest[n++]=member;
        dest.length=n;
        return dest;
    }
    // Native roaming fights put the entire party on the field. Approximate random
    // single-target hits by spreading their expected damage across living allies.
    function roamingBattle(details,foe){
        if(!details.length)return deployedBattle(details);
        // The game rolls equal-speed ties. Use a deterministic tie breaker for the model.
        details=[...details].sort((a,b)=>b.speed-a.speed||b.attack.sustainedDamage-a.attack.sustainedDamage||b.hp-a.hp||
            b.incoming.sustainedDamage-a.incoming.sustainedDamage||b.attack.turnAccuracy-a.attack.turnAccuracy);
        const hp=details.map(detail=>detail.hp),start=details[0].foeHp;
        let remaining=start,alive=details.length,rage=0;
        const hurt=(factor,spread)=>{
            for(let i=0;i<hp.length;i++)if(hp[i]>0){
                hp[i]-=details[i].incoming.sustainedDamage*factor/spread;
                if(hp[i]<=0)alive--;
            }
        };
        for(let turns=1;turns<=32&&alive;turns++){
            let bossActed=false;
            for(let i=0;i<hp.length&&alive;i++){
                if(!bossActed&&details[i].first<1){hurt(1,alive);bossActed=true;}
                if(hp[i]<=0)continue;
                const attack=details[i].attack;
                if(!(attack.sustainedDamage>0))continue;
                remaining-=attack.sustainedDamage;
                if(remaining<=0)return{turns,coverage:1,deaths:details.length-alive};
                rage+=attack.turnAccuracy;
                if(rage>=foe.rageMax){rage-=foe.rageMax;hurt(1/.85,1);}
                else hurt(.3/.85*attack.turnAccuracy,alive);
            }
            if(alive&&!bossActed)hurt(1,alive);
        }
        return{turns:150,coverage:Math.min(.5,Math.max(0,1-remaining/start)*.5),deaths:details.length-alive};
    }
    // The native rail promotes a tapped reserve in both the road and planned party.
    function helperSwitchEnabled(s,settings){
        return settings.activeSwitch===true&&settings.autoTeam===true&&s?.autoSwitch===false;
    }
    function rescueCost(current,rival){
        if(current.turns<=1&&current.loss<1||!Number.isFinite(rival.turns)||rival.loss>=.85)return Infinity;
        if(current.loss<1&&!(current.turns-rival.turns>=1&&current.loss-rival.loss>=.15))return Infinity;
        return rival.turns*(1+rival.loss);
    }
    function rescueProfile(detail,foeHp,hp){
        const turns=attackTurns(detail.attack,foeHp),hits=Math.max(0,turns-detail.first);
        return {turns,loss:hits===0||detail.incoming.sustainedDamage===0?0:hits*detail.incoming.sustainedDamage/hp};
    }
    function rescueLead(count,profile){
        const current=profile(0);let bestCost=Infinity,lead=0;
        for(let i=1;i<count;i++){
            const cost=rescueCost(current,profile(i));
            if(cost<bestCost){bestCost=cost;lead=i;}
        }
        return lead;
    }
    function battleSwitchCandidate(s,settings,now){
        const adv=s.adv,b=adv?.battle;
        if(!helperSwitchEnabled(s,settings)||!b||!['wild','trainer','gym'].includes(b.kind)||adv.paused||adv.pending||adv.zone||adv.event||adv.tower||adv.league||b.pick||
            b.slots!==1||b.allies?.length!==1||b.foes?.length!==1)return null;
        // A native pick persists for this encounter. Don't lock the lead across a wave.
        const remaining=b.enemies?.filter(mon=>mon.hp>0);
        if(remaining?.length!==1)return null;
        const foe=remaining[0];
        if(!foe.uid||foe.uid!==b.foes[0]||!MONS.has(foe.id)||foe.shiny||foe.veiled)return null;
        const planned=s.team||[],road=s.road?.length?s.road:planned;
        if(!road.length||road.length!==planned.length||road.some((uid,i)=>uid!==planned[i]))return null;
        const party=partyMons(s),lead=party.find(mon=>mon.uid===b.allies[0]);
        if(!lead||!MONS.has(lead.id)||(lead.hp??1)<=0)return null;
        const defense=effectiveStats(foe),weather=combatWeather(s,{...foe,liveNode:true},{},now);
        const evaluate=mon=>{
            const stats=effectiveStats(mon),hp=Math.min(stats.hp,mon.hp??stats.hp);
            const detail=matchupDetails(mon,foe,stats,defense,weather);
            return rescueProfile(detail,foe.hp,hp);
        };
        const current=evaluate(lead);
        if(current.turns<=1&&current.loss<1)return null;
        let best=null;
        for(const mon of party){
            if(mon===lead||!MONS.has(mon.id)||(mon.hp??1)<=0)continue;
            const rival=evaluate(mon);
            const cost=rescueCost(current,rival);
            if(Number.isFinite(cost)&&(!best||cost<best.cost))best={uid:mon.uid,foe:foe.uid,lead:lead.uid,cost,reason:current.loss>=1?'避免主力倒下':'缩短战斗并降低损血'};
        }
        return best;
    }
    function chapterCombatFoes(s,chapter){
        if(!chapter)return [];
        const branch=chapter.foesByStarter;
        const starter=branch?.gymChoices&&starterChoice(s,branch.key,Object.keys(branch.choices||{}).map(Number));
        const gym=branch?.gymChoices?.[starter]||chapter.gymFoes||[];
        const counts=new Map();
        for(const [id,level] of gym){const key=id+':'+level;counts.set(key,(counts.get(key)||0)+1);}
        return chapterFoes(s,chapter).map(entry=>{
            const foe=Array.isArray(entry)?{id:entry[0],level:entry[1],weight:entry[2]}:{...entry};
            const gymCount=counts.get(foe.id+':'+foe.level);
            const wildWeight=chapter.wildWeights?.[foe.id+':'+foe.level]||0;
            return {...foe,chapter:chapter.id,wildWeight,...gymCount?{gymCount}:{}};
        });
    }
    function roamingCombatFoe(id,chapter,weight=1){
        // Public game build 6d1e2d8d8d: six slots, ROAM_HP 4, ROAM_POWER .6,
        // ENEMY_HP_PER_ALLY .7, wild attack .85, and a burst every eight hits.
        return{id,chapter,level:ROAMING_DATA.level,weight,wildWeight:weight,roaming:true,
            hpMult:4*(1+.7*5),damageMult:.85*.6,rageMax:8};
    }
    function routeChapters(row){
        if(!row)return [];
        if(row.members?.length)return row.members.map(id=>CHAPTERS.get(id)).filter(Boolean);
        return row.league?DATA.chapters.filter(chapter=>chapter.loop===row.loop):[row];
    }
    function routeRoamingFoes(s,row,now=Date.now()){
        if(!s.roam&&!s.adv?.battle?.roam)return [];
        const watch=new Map(routeChapters(row).filter(chapter=>!chapter.league).map(chapter=>[chapter.id,chapter]));
        if(!watch.size)return [];
        const threats=new Map();
        const add=(rawId,chapter)=>{
            const id=Number(rawId),route=watch.get(chapter);
            if(!route||!ROAMING_DATA.groups.some(group=>group.reg===route.reg&&group.ids.includes(id)&&s.adv?.badges?.includes(group.badge))||s.roam?.caught?.includes(id))return;
            threats.set(`${chapter}:${id}`,roamingCombatFoe(id,chapter));
        };
        for(const [id,marker]of Object.entries(s.roam?.at||{}))if(Number(marker?.until)>now)add(id,Number(marker.ch));
        const adv=s.adv;
        if(adv&&watch.has(adv.chapter)&&!adv.event&&!adv.tower&&!adv.zone&&!adv.league){
            add(adv.battle?.roam,adv.chapter);
            for(let i=Math.max(0,Number(adv.node)||0);i<(adv.nodes?.length||0);i++){
                if(adv.nodes[i]?.roamer)add(adv.nodes[i].roamer,adv.chapter);
            }
        }
        return [...threats.values()].sort((a,b)=>a.chapter-b.chapter||a.id-b.id);
    }
    function routeCombatFoes(s,row,now=Date.now(),hazards=routeRoamingFoes(s,row,now)){
        return [...routeChapters(row).flatMap(chapter=>chapterCombatFoes(s,chapter)),...hazards];
    }
    function resolveCombatWeatherNode(s,chapter,reference){
        const nodes=WEATHER_DATA.chapters[chapter]?.nodes||[];
        if(!reference||typeof reference!=='object')return null;
        if(nodes.includes(reference))return reference;
        if(reference.ch!=null&&reference.ch!==chapter||typeof reference.name!=='string'||typeof reference.bg!=='string')return null;
        // Runtime nodes are expanded into multiple fights; story-node indexes do not
        // match adv.node. Only matching native identity and encounter kind are evidence.
        const kind=reference.type||reference.kind,kinds=kind==='wild'?['route']:kind==='trainer'?['route','trainer']:[kind];
        const sameMap=(a,b)=>JSON.stringify(Object.entries(a||{}).sort())===JSON.stringify(Object.entries(b||{}).sort());
        const matches=nodes.filter(node=>node.name===reference.name&&node.bg===reference.bg&&kinds.includes(node.kind)&&
            (reference.id==null||node.id==null||reference.id===node.id)&&
            (reference.indoor==null||reference.indoor===node.indoor)&&
            (reference.climate==null||sameMap(reference.climate,node.climate)));
        const signature=node=>JSON.stringify([node.indoor,node.climate,node.weather,node.weatherDamage]);
        if(!matches.length||matches.some(node=>signature(node)!==signature(matches[0])))return null;
        const result={...matches[0]};
        // These explicit runtime overrides are what the native damage function reads.
        for(const key of ['weather','weatherDamage'])if(Object.hasOwn(reference,key))result[key]=reference[key];
        return result;
    }
    function weatherChapterOfFoe(s,foe,context){
        return Number.isInteger(foe.chapter)?foe.chapter:Number.isInteger(context.row?.id)?context.row.id:
            ['map','progress'].includes(context.kind)&&Number.isInteger(context.id)?context.id:s.adv?.chapter;
    }
    function weatherReference(s,chapter,foe,context){
        return foe.weatherNode||(foe.liveNode&&chapter===s.adv?.chapter?s.adv.nodes?.[s.adv.node]:null)||context.weatherNode;
    }
    function combatWeather(s,foe={},context={},now=Date.now()){
        const chapter=weatherChapterOfFoe(s,foe,context),reference=weatherReference(s,chapter,foe,context);
        const node=resolveCombatWeatherNode(s,chapter,reference),weather=weatherDamageContext(s,chapter,now,node),sky=chapterWeather(s,chapter,now);
        return{weather,signature:[chapter,Math.floor(now/WEATHER_DATA.slotMs),phaseAt(s,now,chapter),sky.key,sky.source,
            node?[node.name,node.bg,node.kind,node.indoor,node.weather??null]:null,Object.values(weather)]};
    }
    function chapterThreats(s, chapter = s.adv.chapter) {
        const c = CHAPTERS.get(chapter),list=routeCombatFoes(s,c);
        // The current opponent receives extra weight, without discarding the rest of the map.
        if(!c?.league&&chapter===s.adv.chapter)for (const foe of s.adv.battle?.enemies || []) if (MONS.has(foe.id)&&foe.id!==s.adv.battle.roam) list.push({id:foe.id,level:foe.level||c?.ace||50,weight:list.length?.25:1,chapter,liveNode:true});
        return list.filter(foe=>MONS.has(foe.id)&&foe.weight>0);
    }
    const TEAM_ROWS=new Map(),ROUTE_FITS=new Map(),LEAGUE_TRAINING_ROWS=new Map(),TEAM_CACHE={hits:0,misses:0,compactHits:0};
    function combatProfile(m){return [m.id,m.level,m.rank||0,+!!m.shiny,m.statMult||1,m.hpMult||1,m.status||'',m.rageMax!=null,tasteProfile(m),m.damageMult||1,moveBanKey(m)];}
    function teamCacheStats(){return{...TEAM_CACHE,contexts:TEAM_ROWS.size,rows:[...TEAM_ROWS.values()].reduce((n,rows)=>n+rows.size,0)};}
    function clearTeamCache(){TEAM_ROWS.clear();ROUTE_FITS.clear();LEAGUE_TRAINING_ROWS.clear();TEAM_CACHE.hits=0;TEAM_CACHE.misses=0;TEAM_CACHE.compactHits=0;}
    // Overflow rows live only for this search. Store exact doubles in columns so hot
    // scores can be read directly and reserve attack objects materialize only on use.
    const reviewColumns=['score','turns','coverage','deaths','endurance','priorities','farmPressure','first','survives',
        'hit','minHit','maxHit','singleRollMax','accuracy','sustainedDamage'];
    function packReviewRow(row){
        const n=row.length,buffer=new ArrayBuffer(n*reviewColumns.length*8);
        const p=Object.fromEntries(reviewColumns.map((key,i)=>[key,new Float64Array(buffer,i*n*8,n)]));
        p.score.set(row);p.endurance.set(row.endurance);p.priorities.set(row.priorities);p.farmPressure.set(row.farmPressure);
        for(let i=0;i<n;i++){
            const solo=row.solo[i],d=row.details[i],a=d.attack;
            p.turns[i]=solo.turns;p.coverage[i]=solo.coverage;p.deaths[i]=solo.deaths;
            p.first[i]=d.first;p.survives[i]=d.survives;p.hit[i]=a.hit;p.minHit[i]=a.minHit;p.maxHit[i]=a.maxHit;
            p.singleRollMax[i]=a.singleRollMax??0;p.accuracy[i]=a.accuracy;p.sustainedDamage[i]=a.sustainedDamage;
        }
        return p;
    }
    function unpackReviewRow(p,foeStats){
        const row=Array.from(p.score);
        row.packed=p;row.foeStats=foeStats;row.details=new Array(row.length);
        row.priorities=p.priorities;row.endurance=p.endurance;row.farmPressure=p.farmPressure;
        row.solo=row.map((_,i)=>({turns:p.turns[i],coverage:p.coverage[i],deaths:p.deaths[i]}));
        row.safeFarmCost=Float64Array.from(p.turns,(turns,i)=>1+Math.min(turns,180)+.65*(1-p.endurance[i])+p.farmPressure[i]);
        return row;
    }
    function fightDetail(row,i){
        if(row.details[i])return row.details[i];
        const p=row.packed;
        return row.details[i]={foeHp:row.foeStats[i].hp,first:p.first[i],deployment:p.priorities[i],survives:p.survives[i],
            attack:{hit:p.hit[i],minHit:p.minHit[i],maxHit:p.maxHit[i],singleRollMax:p.singleRollMax[i],accuracy:p.accuracy[i],sustainedDamage:p.sustainedDamage[i]}};
    }
    function planAdventureTeam(s, settings, pinned = [], context = {}) {
        const search=adventureTeamSearch(s,settings,pinned,context,false);
        let result=search.next();
        while(!result.done)result=search.next();
        return result.value;
    }
    function isDexReplay(s,settings,chapter){
        return settings.mode==='dex' && chapter && chapter.id<s.adv.unlocked &&
            chapter.loop!==CHAPTERS.get(s.adv.unlocked)?.loop;
    }
    function* adventureTeamSearch(s,settings,pinned,context,sliced){
        const reg = context.reg || currentRegion(s), party = partyMons(s), size=Math.floor(clamp(context.size,1,6,6));
        const pool=context.pool?context.pool.filter(m=>teamEligible(s,m,reg)):eligibleRoster(s,reg);
        const verifyAll=context.verifyAll===true;
        const routeFoes=context.row?routeCombatFoes(s,context.row,context.now):null;
        const rawFoes=context.foes||routeFoes||chapterThreats(s);
        const foes=rawFoes.filter(m=>MONS.has(m.id)&&m.weight>0);
        const objective=context.objective||(['money','train','progress','dex'].includes(settings.mode)?settings.mode==='dex'?'progress':settings.mode:'coverage'),execution=objective!=='coverage';
        if(verifyAll&&(!foes.length||rawFoes.some(foe=>foe.weight>0&&!MONS.has(foe.id))))return {
            uids:[],changed:false,opponents:foes.length,reg,objective,reason:'本地对手资料不足，暂无法验证配队',verification:{status:'unavailable'},
        };
        const xpShares=new Map(),goalByUid=context.trainingGoals&&new Map(context.trainingGoals.map(({uid,goal})=>[uid,goal]));
        const targetSet=goalByUid||new Set(pinned);
        const nominalLearners=Math.max(1,targetSet.size||size);
        function xpShare(mon){
            if(!xpShares.has(mon.uid)){
                const goal=goalByUid?.get(mon.uid)??settings.trainLevel;
                let share=0;
                if((!targetSet.size||targetSet.has(mon.uid))&&mon.level<Math.min(goal,trainingCap(s,mon))){
                    share=mon.uid===s.buddy?.uid?1.3:1;
                }
                xpShares.set(mon.uid,share);
            }
            return xpShares.get(mon.uid);
        }
        const hasLearners=objective==='train'&&pool.some(mon=>xpShare(mon)>0);
        const farming=objective==='money'||hasLearners;
        const protectedUids=new Set(pinned),combatSlots=Math.max(1,size-protectedUids.size);
        const reserveScores=new Map();
        const reserveScore=mon=>{
            if(!reserveScores.has(mon.uid))reserveScores.set(mon.uid,reserveStrength(mon));
            return reserveScores.get(mon.uid);
        };
        let strongestReserve=0;
        if(farming&&protectedUids.size<size){
            let checked=0;
            for(const mon of pool){
                if(!protectedUids.has(mon.uid))strongestReserve=Math.max(strongestReserve,reserveScore(mon));
                if(sliced&&++checked%24===0)yield;
            }
        }
        // Normalize against this legal Box. The combat premium is bounded and
        // independent of encounter order, so cached solo outcomes remain reusable.
        const reserveWeight=strongestReserve>0?FARM_RESERVE_BONUS/(strongestReserve*combatSlots):0;
        function farmPartyScore(team,score){
            if(!reserveWeight||!score)return score;
            let strength=0;
            for(const mon of team)if(!protectedUids.has(mon.uid))strength+=reserveScore(mon);
            return score*(1+reserveWeight*strength);
        }
        const underground=objective==='underMoney'||objective==='underDepth';
        const preferReserves=execution&&!underground;
        const allowRescue=!underground&&helperSwitchEnabled(s,settings);
        const encounters=allowRescue?foes.flatMap(foe=>{
            if(!foe.wildWeight||foe.roaming)return [foe];
            const weight=Math.min(foe.weight,foe.wildWeight),wild={...foe,weight,singleWild:true,gymCount:0};
            return foe.weight>weight?[wild,{...foe,weight:foe.weight-weight,wildWeight:0}]:[wild];
        }):foes;
        const weights=encounters.length?encounters.flatMap(foe=>{
            if((objective!=='progress'&&!farming)||!foe.gymCount)return [foe];
            // The route export gives each gym appearance weight 3 and merges wild
            // encounters of the same species/level. Only the gym share is indoors.
            const gyms=WEATHER_DATA.chapters[foe.chapter]?.nodes?.filter(node=>node.kind==='gym')||[];
            const weight=Math.min(foe.weight,3*foe.gymCount),leader={...foe,weight,wildWeight:0,weatherNode:gyms.length===1?gyms[0]:null};
            return foe.weight>weight?[{...foe,weight:foe.weight-weight,gymCount:0},leader]:[leader];
        }):[{id:19,level:CHAPTERS.get(s.adv.chapter)?.ace||5,weight:1}];
        if(farming&&sliced)yield;
        const gymTotal=objective==='progress'?weights.reduce((n,foe)=>n+(foe.gymCount||0),0):0;
        const critical=weights.map(foe=>!!(foe.gymCount||foe.roaming||foe.guard||['elite','zone','raid','worldCapture'].includes(context.kind)));
        const enduranceRoute=execution&&weights.length>1;
        // A chapter's outdoor encounters share a forecast. Keep explicit gym
        // and live-node overrides separate without resolving every species anew.
        const weatherByChapter=new Map(),instant=context.now??Date.now();
        const weatherRows=weights.map(foe=>{
            if(underground)return{weather:{},signature:'underground'};
            const chapter=weatherChapterOfFoe(s,foe,context),ref=weatherReference(s,chapter,foe,context);
            let nodes=weatherByChapter.get(chapter);
            if(!nodes){nodes=new Map();weatherByChapter.set(chapter,nodes);}
            if(!nodes.has(ref))nodes.set(ref,combatWeather(s,foe,context,instant));
            return nodes.get(ref);
        });
        const threatKey=JSON.stringify([DATA.build,allowRescue,weights.map(foe=>[combatProfile(foe),!!foe.roaming]),weatherRows.map(row=>row.signature)]);
        // A long route's row can contain hundreds of full encounter models.
        // Bound the total retained cells per context as well as the UID count.
        const rowLimit=Math.max(8,Math.min(1024,Math.floor(49152/weights.length)));
        const compactRows=new Map();
        const compactLimit=verifyAll&&!allowRescue&&!weights.some(foe=>foe.roaming)?
            Math.min(1024,Math.floor((context.lowBudget?6:24)*1024*1024/(8*reviewColumns.length*weights.length))):0;
        let shared=TEAM_ROWS.get(threatKey);
        if(!shared){shared=new Map();TEAM_ROWS.set(threatKey,shared);if(TEAM_ROWS.size>4)TEAM_ROWS.delete(TEAM_ROWS.keys().next().value);}
        else{TEAM_ROWS.delete(threatKey);TEAM_ROWS.set(threatKey,shared);}
        const foeStats = weights.map(effectiveStats), cache = new Map();
        if(farming&&sliced)yield;
        function* computeValues(mon,split,reviewPass=false) {
            if (cache.has(mon.uid)) return cache.get(mon.uid);
            const healed={...mon,status:null},key=JSON.stringify(combatProfile(healed));let row=shared.get(key);
            if(row){TEAM_CACHE.hits++;shared.delete(key);shared.set(key,row);}
            else if(compactRows.has(key)){
                TEAM_CACHE.hits++;TEAM_CACHE.compactHits++;row=unpackReviewRow(compactRows.get(key),foeStats);
            }
            else{
                TEAM_CACHE.misses++;const stats=effectiveStats(healed);
                const details=[];
                for(let i=0;i<weights.length;i++){
                    details.push(matchupDetails(healed,weights[i],stats,foeStats[i],weatherRows[i]));
                    if(split&&i%4===3)yield;
                }
                row=details.map((detail,i)=>{
                    const defense=foeStats[i],attack=Math.min(defense.hp,detail.attack.hit)*detail.attack.turnAccuracy,incoming=Math.min(stats.hp,detail.incoming.hit)*detail.incoming.turnAccuracy;
                    const survival=Math.min(4,stats.hp/Math.max(.01,incoming)),speed=Math.min(1.2,Math.max(.8,Math.sqrt(stats.spe/Math.max(1,defense.spe))));
                    return attack/Math.max(1,defense.hp)*(.5+.5*Math.sqrt(survival))*speed;
                });
                row.solo=details.map(detail=>deployedBattle([detail],false));
                // Estimate how much HP a fresh reserve needs to finish this matchup.
                // Use the opponent's best actual move, including off-type coverage.
                if(allowRescue)row.rescue=[];
                row.endurance=details.map(d=>{
                    const profile=rescueProfile(d,d.foeHp,d.hp);
                    if(allowRescue)row.rescue.push(profile);
                    return Number.isFinite(profile.turns)?1/(1+profile.loss*profile.loss):0;
                });
                row.details=details.map((d,i)=>{
                    if(weights[i].roaming)return d;
                    const {hit,minHit,maxHit,singleRollMax,accuracy,sustainedDamage}=d.attack;
                    return{attack:{hit,minHit,maxHit,singleRollMax,accuracy,sustainedDamage},foeHp:d.foeHp,
                        first:d.first,deployment:d.deployment,survives:attackTurns(d.incoming,d.hp)};
                });
                row.priorities=Float64Array.from(details,d=>d.deployment);
                row.farmPressure=Float64Array.from(details,farmingPressure);
                row.safeFarmCost=Float64Array.from(row.solo,(battle,i)=>1+Math.min(battle.turns,180)+.65*(1-row.endurance[i])+row.farmPressure[i]);
                // A sequential full-pool review can be larger than this cache.
                // Keep the existing block for the next pass instead of cycling it out.
                if(!reviewPass||shared.size<rowLimit){
                    shared.set(key,row);
                    if(shared.size>rowLimit)shared.delete(shared.keys().next().value);
                }else if(compactRows.size<compactLimit)compactRows.set(key,packReviewRow(row));
            }
            cache.set(mon.uid,row);return row;
        }
        const values=mon=>cache.get(mon.uid)||computeValues(mon,false).next().value;
        const totalWeight=weights.reduce((n,m)=>n+m.weight,0),discount=[1,.35,.15,.075,.04,.02];
        // Money comes from trainer/gym victories. Wild fights still use time.
        // Grouped encounter exports can't recover the payout of each trainer,
        // so level and encounter class are relative weights, not coin amounts.
        const premiums=farming?weights.map(foe=>{
            if(foe.roaming)return 0;
            const wildShare=foe.singleWild?1:Math.min(1,(foe.wildWeight||0)/foe.weight);
            if(objective==='money')return(1-wildShare)*Math.max(1,foe.level)*(foe.gymCount?1.3:1);
            // The native base XP rises with level^2.4 before species and
            // storyline multipliers. The mixture includes the 1.5× trainer bonus.
            return Math.floor(.8*Math.pow(Math.max(1,foe.level),2.4)+10)*(1.5-.5*wildShare);
        }):[];
        const totalPremium=farming?weights.reduce((sum,foe,i)=>sum+foe.weight*premiums[i],0):0;
        const rewardWeight=totalPremium||totalWeight;
        const trainingPenalty=clamp(context.trainingPenalty,0,2,0);
        const scoreAfterTrainingCost=(score,team)=>{
            if(!context.trainingCosts||!trainingPenalty)return score;
            let highest=0,total=0;
            for(const member of team){
                const cost=clamp(context.trainingCosts[member.uid],0,100,0);
                highest=Math.max(highest,cost);total+=cost;
            }
            return score/(1+trainingPenalty*(highest+.25*total));
        };
        const work=[];
        // Each elite trainer battle starts after a heal. Give the hardest trainer a
        // separate vote so a team cannot hide a bad room behind several easy ones.
        const eliteRooms=context.kind==='elite'?[...new Set(weights.map(foe=>foe.chapter))]:[];
        const roomOf=eliteRooms.length?weights.map(foe=>eliteRooms.indexOf(foe.chapter)):[];
        const roomWeights=eliteRooms.map(ch=>weights.reduce((n,foe)=>n+(foe.chapter===ch?foe.weight:0),0));
        const roomScores=new Float64Array(eliteRooms.length);
        const lastVictory=new Array(weights.length);
        const reserveWork=[];
        const encounterUtility = (team,summary,nativeBasis,inserted,insertAt,scoredRows,coverageByFoe,reserveOrders) => {
            const rows=scoredRows||team.map(values);
            if(farming&&!rows.length)return 0;
            if(underground){
                if(!rows.length)return 0;
                let retained=0,weakestGuard=1,gold=0,seconds=0,guardWeight=0,guardCredit=0,regularWeight=0,reserveCredit=0,progressOnLoss=0;
                for(let i=0;i<weights.length;i++){
                    const foe=weights[i],details=rows.map(row=>fightDetail(row,i));
                    // A fresh lead can hide a weak bench. Use the second-best solo
                    // survivor as a small tie-break for later fights after wear.
                    let first=0,second=0;
                    for(const row of rows){
                        const solo=row.solo[i],value=solo.coverage*row.endurance[i]/Math.max(1,solo.turns);
                        if(value>=first){second=first;first=value;}else second=Math.max(second,value);
                    }
                    reserveCredit+=foe.weight*second;
                    // Underground shuffles the party before encounters. Rotate ties in native
                    // deployment priority instead of rewarding an adventure party's fixed lead.
                    let clears=0,elapsed=0,orders=0,damageOnLoss=0;
                    const priority=Math.max(...details.map(d=>d.deployment));
                    for(let j=0;j<rows.length;j++){
                        if(details[j].deployment!==priority)continue;
                        const leadRow=rows[j],solo=leadRow.solo[i];
                        const rest=details.filter((d,k)=>k!==j);
                        const outcomes=[solo.coverage===1?solo:deployedBattle([details[j],...rest],true)];
                        if(rest.length===2&&solo.coverage!==1&&rest[0].deployment===rest[1].deployment)
                            outcomes.push(deployedBattle([details[j],rest[1],rest[0]],true));
                        for(const battle of outcomes){
                            const cost=battle.deaths+(1-leadRow.endurance[i]);
                            const credit=battle.coverage===1?1/(1+cost):0;
                            const alive=Math.min(3,Math.max(0,rows.length-battle.deaths));
                            const wall=alive===3?45:alive===2?54:81;
                            clears+=credit/outcomes.length;
                            if(!credit)damageOnLoss+=battle.coverage/outcomes.length;
                            elapsed+=(2.8*Math.min(30,battle.turns)+(foe.guard?0:credit*(wall+2.324)))/outcomes.length;
                        }
                        orders++;
                    }
                    const survival=clears/orders;
                    progressOnLoss+=foe.weight*damageOnLoss/orders;
                    retained+=foe.weight*survival;
                    if(foe.guard){
                        guardWeight+=foe.weight;guardCredit+=foe.weight*survival;
                        weakestGuard=Math.min(weakestGuard,survival);
                    }else{
                        regularWeight+=foe.weight;gold+=foe.weight*foe.floorGold*survival;
                    }
                    seconds+=foe.weight*elapsed/orders;
                }
                const depth=.85*retained/totalWeight+.15*weakestGuard;
                // Relative objectives, not a displayed win probability or measured income.
                const guardLoss=(guardWeight-guardCredit)/Math.max(.001,regularWeight);
                const primary=objective==='underDepth'?depth:gold*(1-guardLoss)/Math.max(1,seconds);
                if(summary)summary.expedition={endurance:retained/totalWeight,weakestGuard,guardLoss};
                if(primary<=0)return .001*progressOnLoss/totalWeight;
                return primary*(1+.04*reserveCredit/totalWeight);
            }
            let gymSum=0,gymWorst=1,worstEfficiency=Infinity;
            let farmingTime=0,earnings=0,farmingLoss=0,fallbackCombat=0,learnerTail=0,roamingLoss=0;
            const shares=hasLearners?team.map(xpShare):null;
            const learnerShare=shares?.reduce((a,b)=>a+b,0)||0;
            if(eliteRooms.length)roomScores.fill(0);
            let routeScore=0,turns=0,worst=0,deaths=0,wipes=0,keyWipes=0;
            for(let i=0;i<weights.length;i++){
                const foe=weights[i];
                let coverage=0;
                if(coverageByFoe?.[i]!==undefined)coverage=coverageByFoe[i];
                else if(!farming){
                    let count=0;
                    for(const row of rows){const value=row[i];let at=count++;while(at>0&&work[at-1]<value){work[at]=work[at-1];at--;}work[at]=value;}
                    let value=0;for(let k=0;k<count;k++)value+=work[k]*(discount[k]||0);
                    coverage=Math.log1p(value);
                    if(coverageByFoe)coverageByFoe[i]=coverage;
                }
                if(!execution){routeScore+=foe.weight*coverage;continue;}
                // If the native lead finishes alone, every reserve would be unused.
                // A deployment tie stays with the earlier party member, just as in deployedBattle.
                let leadIndex=0;
                if(nativeBasis){
                    const former=nativeBasis.leads[i],priority=inserted.priorities[i],incumbent=nativeBasis.priorities[i];
                    leadIndex=priority>incumbent||priority===incumbent&&insertAt<=former?insertAt:former+Number(insertAt<=former);
                }else if(s.autoSwitch!==false)for(let j=1;j<rows.length;j++)if(rows[j].priorities[i]>rows[leadIndex].priorities[i])leadIndex=j;
                if(allowRescue&&foe.singleWild&&!foe.shiny&&!foe.veiled&&rows.length>1){
                    leadIndex=rescueLead(rows.length,j=>rows[j].rescue[i]);
                }
                const lead=rows[leadIndex];
                const solo=lead?.solo[i];
                const order=allowRescue&&lead!==rows[0]?[lead,...rows.filter(r=>r!==lead)]:rows;
                let battle;
                if(foe.roaming)battle=roamingBattle(rows.map(row=>fightDetail(row,i)),foe);
                else if(solo&&(solo.coverage===1||rows.length===1))battle=solo;
                else if(reserveOrders){
                    const {rest,order:indices}=reserveOrders[i];
                    battle=battleWithReserves(reserveInsertionOrder(rest,indices,fightDetail(inserted,i),insertAt,reserveWork),false,lastVictory,i);
                }else battle=battleWithReserves(order.map(row=>fightDetail(row,i)),s.autoSwitch!==false,lastVictory,i);
                if(foe.roaming)roamingLoss=Math.max(roamingLoss,battle.deaths);
                if(summary){
                    turns+=foe.weight*battle.turns;worst=Math.max(worst,battle.turns);deaths+=foe.weight*battle.deaths;
                    if(battle.coverage<1){wipes+=foe.weight;if(critical[i])keyWipes+=foe.weight;}
                }
                if(farming){
                    const clear=battle.coverage===1;
                    if(hasLearners)learnerTail=Math.max(learnerTail,Math.min(30,battle.turns)+2*battle.deaths);
                    // Fixed travel/reward time prevents a short fight's last
                    // fraction of a turn from dominating a change of roster.
                    const duration=!foe.roaming&&solo?.coverage===1?lead.safeFarmCost[i]:
                        1+Math.min(battle.turns,180)+.65*(1-(lead?.endurance[i]??0))+1.8*battle.deaths+(clear?0:12)+
                            (foe.roaming?0:lead.farmPressure[i]);
                    farmingTime+=foe.weight*duration;
                    farmingLoss+=foe.weight*(clear?0:foe.gymCount?1.5:1);
                    fallbackCombat+=foe.weight*(clear?1:battle.coverage);
                    if(clear){
                        let credit=1;
                        if(hasLearners){
                            // Native XP gives full party shares and a 10% active
                            // bonus. Count the winner's bonus only when the
                            // fresh lead actually finished the fight.
                            credit=(learnerShare+(battle.deaths===0?.1*shares[leadIndex]:0))/nominalLearners;
                        }
                        earnings+=foe.weight*(foe.roaming?0:totalPremium?premiums[i]:1)*credit;
                    }
                    continue;
                }
                if(gymTotal&&foe.gymCount){
                    const endurance=rows.reduce((sum,row)=>sum+row.endurance[i],0)/Math.max(1,rows.length);
                    gymSum+=foe.gymCount*endurance;gymWorst=Math.min(gymWorst,endurance);
                }
                // Every encounter starts with fresh HP in this estimate. Charge the
                // deployed lead for wear between heals without taxing an unused bench.
                const wear=enduranceRoute&&!(gymTotal&&foe.gymCount) ? .85+.15*(lead?.endurance[i]??0) : 1;
                const efficiency=Math.log1p(3/battle.turns)*battle.coverage*wear/(1+.2*battle.deaths);
                if(eliteRooms.length)roomScores[roomOf[i]]+=foe.weight*efficiency;
                worstEfficiency=Math.min(worstEfficiency,efficiency);
                const weight=objective==='progress'?.35:.7;
                routeScore+=foe.weight*((1-weight)*coverage+weight*efficiency);
            }
            routeScore/=totalWeight;
            if(summary&&execution)Object.assign(summary,{turns,worst,deaths,wipes,keyWipes,roamingLoss});
            if(farming){
                const safety=Math.max(0,1-farmingLoss/totalWeight);
                const rate=3*earnings/rewardWeight/(farmingTime/totalWeight+.06*Math.max(0,learnerTail-3))*(.7+.3*safety);
                return scoreAfterTrainingCost((rate+.025*fallbackCombat/totalWeight)/(1+.04*roamingLoss),team);
            }
            const gymScore=gymTotal ? .7*gymSum/gymTotal+.3*gymWorst : 0;
            if(summary)summary.gym=gymScore;
            const worstWeight=enduranceRoute ? (gymTotal ? .025 : .07) : 0;
            const robust=worstWeight ? (1-worstWeight)*routeScore+worstWeight*worstEfficiency : routeScore;
            let score=gymTotal ? .55*robust+.45*gymScore : robust;
            if(eliteRooms.length){
                let weakest=Infinity;
                for(let i=0;i<roomScores.length;i++)weakest=Math.min(weakest,roomScores[i]/roomWeights[i]);
                score=.85*score+.15*weakest;
            }
            return scoreAfterTrainingCost(score,team);
        };
        const utility=(team,summary)=>farmPartyScore(team,encounterUtility(team,summary));
        if(context.compareTrainingParty){
            const selected=partyMons(s,context.compareTrainingParty),previous={},proposed={};
            const score=utility(selected,proposed),currentScore=utility(party,previous);
            const changed=hasLearners&&legalAdventureParty(s,context.compareTrainingParty,reg,pinned)&&
                (selected.length>party.length||!legalAdventureParty(s,s.team,reg,pinned)||worthwhileFarmChange(score,currentScore,proposed,previous));
            return {changed,score,currentScore,gain:currentScore>0?score/currentScore-1:1};
        }
        const identity = mon => DATA.combat.singles[mon.id] || (context.speciesUnique?`sp:${mon.id}`:`${mon.id}:${+!!mon.shiny}`);
        let force=context.force;
        // Check the real party before a progressive box search can publish a replacement.
        if(!verifyAll&&context.dexReplay && party.length===size && !pinned.length && foes.length && party.every(mon=>pool.includes(mon))){
            const map={kind:'map',id:context.dexReplay.id,reg,foes,now:instant};
            const assessment=yield* readinessSearch(s,settings,map,s.team,sliced);
            if(assessment.ready){
                force=false;
                const fit=assessment.fit;
                if(fit.worstDeaths===0 && fit.turns<=2 && fit.worstTurns<=3){
                    for(const mon of party)yield* computeValues(mon,sliced);
                    const score=utility(party);
                    return {uids:party.map(mon=>mon.uid),changed:false,score,currentScore:score,gain:0,opponents:foes.length,reg,objective,
                        retainedForHunt:true,reason:'补图鉴保留原队 · 预计平均 '+fit.turns.toFixed(1)+' 回合/对手，最慢 '+fit.worstTurns.toFixed(1)+' 回合，无预计倒下'};
                }
            }
        }
        const chosen = [], used = new Set(),poolByUid=new Map(pool.map(mon=>[mon.uid,mon]));
        const partyOrder=new Map((s.team||[]).map((uid,i)=>[uid,i]));
        const reserveTotal=team=>team.reduce((sum,mon)=>sum+reserveScore(mon),0);
        // Only training projections carry this flag. Resolve equal combat scores
        // before falling back to the existing party order and stable UID.
        const prefer=(a,b)=>Number(!!a.evolutionItemLocked)-Number(!!b.evolutionItemLocked)||
            (preferReserves?reserveScore(b)-reserveScore(a):0)||
            (partyOrder.get(a.uid)??9999)-(partyOrder.get(b.uid)??9999)||String(a.uid).localeCompare(String(b.uid));
        for (const uid of pinned) { const mon=poolByUid.get(uid); if(chosen.length<size&&mon&&!used.has(identity(mon))&&!chosen.some(other=>teamApart(mon,other))){chosen.push(mon);used.add(identity(mon));} }
        if(verifyAll&&(poolByUid.size!==pool.length||!context.pool&&rosterIndex(s).duplicates.size||chosen.length!==protectedUids.size))return {
            uids:[],changed:false,opponents:foes.length,reg,objective,reason:'候选存在重复 UID，或固定成员当前无法同时出战',verification:{status:'unavailable'},
        };
        // Copies with the same healed combat profile and training cost occupy the
        // same legal slot. Retain the preferred UID and any explicitly pinned copy.
        let candidates=pool;
        if(pool.length>size){
            const equivalent=new Map();
            for(const mon of pool){
                if(used.has(identity(mon)))continue;
                const profile=JSON.stringify([combatProfile({...mon,status:null}),context.trainingCosts?.[mon.uid]??0,hasLearners?xpShare(mon):0]);
                const other=equivalent.get(profile);
                if(!other||prefer(mon,other)<0)equivalent.set(profile,mon);
            }
            candidates=[...equivalent.values()];
        }
        const largeBox=candidates.length>64;
        // For critical fights, keep the exact matchup screening on moderate boxes.
        const useShortlist=largeBox&&!underground&&(objective!=='progress'||candidates.length>384);
        if(useShortlist)candidates=yield* combatShortlist(candidates,party,weights,identity,context.lowBudget,sliced,verifyAll);
        // A legal incumbent is available before cold matchup rows are computed.
        // Only the live adventure scheduler consumes these checkpoints.
        if(context.progressive){
            if(underground&&candidates.length>size){
                candidates=yield* expeditionSeedOrder(candidates,weights,identity,sliced,context.lowBudget);
            }
            const fallback=chosen.slice(),seen=new Set(used);
            for(const mon of [...party,...candidates]){
                if(fallback.length>=size)break;
                if(!pool.includes(mon)||seen.has(identity(mon))||fallback.some(other=>teamApart(mon,other)))continue;
                seen.add(identity(mon));fallback.push(mon);
            }
            const uids=fallback.map(m=>m.uid);
            yield {uids,changed:JSON.stringify(uids)!==JSON.stringify(s.team),gain:0,opponents:foes.length,reg,objective,reason:'计算预算已到，采用合法基础阵容'};
            if(underground&&fallback.length===size){
                for(const mon of fallback)yield* computeValues(mon,sliced);
                yield {uids,changed:true,checkpointScore:utility(fallback),reg,objective,opponents:foes.length,reason:'已按通道敌人与守卫核对初选三人队'};
            }
            // On slow devices compare a few legal alternatives before scanning the
            // whole box. The scheduler retains the best completed checkpoint.
            if(largeBox&&fallback.length===size){
                for(const mon of fallback)yield* computeValues(mon,true);
                const baseline={};
                const base=utility(fallback,baseline);let best=base;
                const extras=candidates.filter(m=>!seen.has(identity(m)));
                if(preferReserves)extras.sort(prefer);
                for(const mon of extras.slice(0,6)){
                    yield* computeValues(mon,true);
                    for(let i=0;i<size;i++){
                        if(protectedUids.has(fallback[i].uid))continue;
                        const trial=fallback.slice();trial[i]=mon;
                        if(trial.some(other=>teamApart(mon,other)))continue;
                        const summary={},score=utility(trial,summary);
                        const improves=farming?worthwhileFarmChange(score,base,summary,baseline):
                            (underground||score>base*1.05+.01)&&(!preferReserves||summary.wipes<=baseline.wipes);
                        if(score>best+1e-8&&improves){
                            best=score;
                            yield {uids:trial.map(m=>m.uid),changed:true,gain:score/base-1,checkpointScore:score,reg,objective,opponents:foes.length,reason:'局部替换改善当前地图的模型表现'};
                        }else yield;
                    }
                }
            }
        }
        if(sliced)for(const mon of new Set([...chosen,...party.filter(m=>teamEligible(s,m,reg)),...candidates])){
            yield* computeValues(mon,true);
            yield;
        }
        // Screen large boxes using already cached rows. Keep the strongest solo
        // candidates, matchup specialists and the existing party as replacements.
        if(!useShortlist&&candidates.length>64){
            const leaders=weights.map(()=>({mon:null,value:-Infinity}));
            const ranked=[];
            for(const mon of candidates){
                const row=values(mon);
                for(let i=0;i<weights.length;i++){
                    const b=row.solo[i],value=b.coverage*(.75+.25*row.endurance[i])/(b.turns+b.deaths);
                    if(value>leaders[i].value)leaders[i]={mon,value};
                }
                ranked.push({mon,score:utility([mon])});
                if(sliced)yield;
            }
            ranked.sort((a,b)=>b.score-a.score||prefer(a.mon,b.mon));
            candidates=[...new Set([...ranked.slice(0,context.lowBudget?16:32).map(x=>x.mon),...leaders.map(x=>x.mon),...candidates.filter(m=>partyOrder.has(m.uid))])];
        }
        while (chosen.length < size) {
            let best = null, score = -Infinity,bestLeads=false;
            const tryLead=farming&&s.autoSwitch===false&&chosen.length>0&&chosen.every(member=>protectedUids.has(member.uid));
            for (const mon of candidates) {
                if (used.has(identity(mon))||chosen.some(other=>teamApart(mon,other))) continue;
                const append=utility([...chosen,mon]),prepend=tryLead?utility([mon,...chosen]):-Infinity,value=Math.max(append,prepend);
                if (value > score + 1e-8 || Math.abs(value-score)<1e-8&&(!best||prefer(mon,best)<0)) { best=mon;score=value;bestLeads=prepend>append; }
                if(sliced)yield;
            }
            if (!best) break;
            if(bestLeads)chosen.unshift(best);else chosen.push(best);
            used.add(identity(best));
        }
        const incumbent=party.filter(m=>pool.includes(m));
        const conflictingParty=party.some((mon,i)=>party.slice(0,i).some(other=>teamApart(mon,other)));
        const legalIncumbent=!conflictingParty&&incumbent.length===party.length&&party.length===chosen.length&&new Set(party.map(identity)).size===party.length&&chosen.every(m=>!protectedUids.has(m.uid)||incumbent.includes(m));
        const incumbentSafety={};
        const incumbentScore=context.progressive?utility(incumbent,incumbentSafety):0;
        function checkpoint(){
            const summary={},score=utility(chosen,summary);
            const apply=!legalIncumbent||(farming?worthwhileFarmChange(score,incumbentScore,summary,incumbentSafety):
                (preferReserves&&summary.wipes<incumbentSafety.wipes)||(score>incumbentScore*1.05+.01&&(!preferReserves||summary.wipes<=incumbentSafety.wipes)));
            return {uids:(apply?chosen:incumbent).map(m=>m.uid),changed:apply,checkpointScore:apply?score:incumbentScore,gain:incumbentScore?score/incumbentScore-1:0,reg,objective,opponents:foes.length,reason:apply?'采用预算内改善最大的合法阵容':'已评估的提升未过换队门槛'};
        }
        if(context.progressive)yield checkpoint();
        let testedSeed=null;
        if(farming&&chosen.length===size&&protectedUids.size<size){
            const roamingIndexes=weights.flatMap((foe,index)=>foe.roaming?[index]:[]),current={};
            let currentScore=utility(chosen,current);
            // Give the strongest available core its own comparison. A sequence
            // of one-member replacements can get stuck at a fragile local optimum.
            const seed=ordered=>{
                const team=chosen.filter(mon=>protectedUids.has(mon.uid)),seen=new Set(team.map(identity));
                for(const mon of ordered){
                    const key=identity(mon);
                    if(seen.has(key)||team.some(other=>teamApart(mon,other)))continue;
                    team.push(mon);seen.add(key);
                    if(team.length>=size)break;
                }
                return team;
            };
            const seeds=[seed([...candidates].sort(prefer))];
            if(roamingIndexes.length){
                const matchups=candidates.map(mon=>{
                    const row=values(mon);
                    const value=roamingIndexes.reduce((sum,i)=>{
                        const {attack,incoming,hp}=fightDetail(row,i);
                        return sum+attack.sustainedDamage*Math.sqrt(hp/(1+incoming.sustainedDamage));
                    },0);
                    return{mon,value};
                });
                matchups.sort((a,b)=>b.value-a.value||prefer(a.mon,b.mon));
                seeds.push(seed(matchups.map(entry=>entry.mon)));
            }
            for(const trial of seeds){
                if(trial.length!==chosen.length||trial.every((mon,i)=>mon===chosen[i]))continue;
                const safety={},score=utility(trial,safety);
                if(farmRiskBeforeScore(safety,current,score,currentScore)){
                    chosen.splice(0,chosen.length,...trial);Object.assign(current,safety);currentScore=score;
                    testedSeed={members:trial,safety,score};
                    if(context.progressive)yield checkpoint();
                }
            }
        }
        // At most 56 unordered trios. Each candidate is a yield point, with the greedy
        // incumbent already available if the scheduler runs out of time.
        const smallExpedition=underground&&size===3&&!pinned.length&&(verifyAll?pool.length:candidates.length)<=8;
        let exhaustiveAttempts=0;
        if(smallExpedition){
            const trios=verifyAll?pool:candidates;
            let best=chosen.length===3?utility(chosen):-Infinity;
            for(let i=0;i<trios.length-2;i++)for(let j=i+1;j<trios.length-1;j++){
                const a=trios[i],b=trios[j];
                if(identity(a)===identity(b)||teamApart(a,b))continue;
                for(let k=j+1;k<trios.length;k++){
                    const c=trios[k];
                    if(identity(a)===identity(c)||identity(b)===identity(c)||teamApart(a,c)||teamApart(b,c))continue;
                    const trio=[a,b,c],score=utility(trio);
                    exhaustiveAttempts++;
                    if(score>best+1e-8){
                        chosen.splice(0,chosen.length,...trio);best=score;
                        if(context.progressive)yield checkpoint();
                    }
                    if(sliced)yield;
                }
            }
        }
        // Two bounded replacement passes recover combinations a single greedy fill misses.
        for(let pass=0;!smallExpedition&&pass<(context.lowBudget?1:2);pass++){
            let improved=false;
            for(let slot=0;slot<chosen.length;slot++){
                if(protectedUids.has(chosen[slot].uid))continue;
                const rest=chosen.filter((_,i)=>i!==slot),taken=new Set(rest.map(identity));let best=chosen[slot],score=utility(chosen);
                for(const mon of candidates){
                    if(taken.has(identity(mon))||rest.some(other=>teamApart(mon,other)))continue;
                    const value=utility(chosen.map((entry,i)=>i===slot?mon:entry));
                    if(value>score+1e-8||Math.abs(value-score)<1e-8&&
                        (best.evolutionItemLocked&&!mon.evolutionItemLocked||preferReserves&&prefer(mon,best)<0)){best=mon;score=value;}
                    if(sliced)yield;
                }
                if(best.uid!==chosen[slot].uid){chosen[slot]=best;improved=true;if(context.progressive)yield checkpoint();}
            }
            if(!improved)break;
        }
        const soloScores=new Map(chosen.map(mon=>[mon,utility([mon])]));
        const soloOrder=[...chosen].sort((a,b)=>soloScores.get(b)-soloScores.get(a)||prefer(a,b));
        let orderedScore=utility(chosen);
        const soloScore=utility(soloOrder);
        if(!execution||soloScore>=orderedScore){
            chosen.splice(0,chosen.length,...soloOrder);orderedScore=soloScore;
        }
        // Equal native deployment priorities break ties in party order. A strong
        // solo fighter can be the wrong lead for the matchups where this tie occurs.
        let sameMembers=chosen.length===party.length&&chosen.every(mon=>partyOrder.has(mon.uid));
        if(execution&&sameMembers){
            const currentOrder=[...chosen].sort((a,b)=>partyOrder.get(a.uid)-partyOrder.get(b.uid));
            const currentScore=utility(currentOrder);
            if(currentScore>=orderedScore-1e-8){chosen.splice(0,chosen.length,...currentOrder);orderedScore=currentScore;}
        }
        const orderMatters=!underground&&execution&&chosen.length>1&&(s.autoSwitch===false||weights.some((_,i)=>{
            const priorities=chosen.map(mon=>values(mon).priorities[i]);
            return new Set(priorities).size<priorities.length;
        }));
        if(orderMatters)for(let pass=0;pass<2;pass++){
            let changed=false;
            for(let i=0;i<chosen.length-1;i++)for(let j=i+1;j<chosen.length;j++){
                [chosen[i],chosen[j]]=[chosen[j],chosen[i]];const value=utility(chosen);
                if(value>orderedScore+1e-8){orderedScore=value;changed=true;}else[chosen[i],chosen[j]]=[chosen[j],chosen[i]];
                if(sliced)yield;
            }
            if(!changed)break;
        }
        if(testedSeed){
            const safety={},score=utility(chosen,safety);
            if(farmRiskBeforeScore(testedSeed.safety,safety,testedSeed.score,score)){
                chosen.splice(0,chosen.length,...testedSeed.members);
                sameMembers=chosen.every(mon=>partyOrder.has(mon.uid))&&chosen.length===party.length;
            }
        }
        let verification;
        const significant=value=>Math.abs(value)>1e-8?value:0;
        const assessedReserves=assessment=>assessment.reserves??(assessment.reserves=reserveTotal(assessment.team));
        function compareVerified(tested,base){
            const a=tested.safety,b=base.safety;
            // Major fights cannot be traded away for easier ordinary encounters.
            return tested.team.length-base.team.length||significant((b.keyWipes||0)-(a.keyWipes||0))||
                significant((b.wipes||0)-(a.wipes||0))||
                (settings.mode==='item'&&objective==='route'?Math.round(100*b.deaths/totalWeight)-Math.round(100*a.deaths/totalWeight)||
                    Math.round(50*b.turns/totalWeight)-Math.round(50*a.turns/totalWeight)||
                    Math.floor(Math.log(Math.max(1e-9,tested.score))/Math.log(1.01))-Math.floor(Math.log(Math.max(1e-9,base.score))/Math.log(1.01))||
                    tested.team.filter(mon=>partyOrder.has(mon.uid)).length-base.team.filter(mon=>partyOrder.has(mon.uid)).length:0)||significant(tested.score-base.score)||
                (preferReserves?significant((b.worst||0)-(a.worst||0))||significant((b.deaths||0)-(a.deaths||0))||assessedReserves(tested)-assessedReserves(base):0);
        }
        if(verifyAll){
            // Shortlisting supplies only an initial seed. Certification uses the exact
            // full legal pool, independent of the cheap score or seed selection.
            const legal=team=>team.length<=size&&new Set(team.map(identity)).size===team.length&&
                team.every((mon,i)=>poolByUid.get(mon.uid)===mon&&!team.slice(0,i).some(other=>teamApart(mon,other)))&&
                [...protectedUids].every(uid=>team.some(mon=>mon.uid===uid));
            const assess=(team,nativeBasis,inserted,insertAt)=>{
                const safety={},encounterScore=encounterUtility(team,safety,nativeBasis,inserted,insertAt);
                return{team,score:farmPartyScore(team,encounterScore),encounterScore,safety};
            };
            const better=(tested,base)=>compareVerified(tested,base)>1e-8;
            let evaluated=assess(chosen.slice());
            if(legal(party)){
                const former=assess(party.slice());
                if(!better(evaluated,former))evaluated=former;
            }
            let attempts=exhaustiveAttempts,passes=smallExpedition?1:0,pruned=0,orderPruned=0,reused=0,soloReused=0,alternatives=[];
            if(!smallExpedition){
                let tryPairs=execution&&!underground&&evaluated.team.length-protectedUids.size>1&&pool.length>evaluated.team.length+1;
                const pairLimit=context.lowBudget?4:6;
                const anchorScores=new Map();
                const candidateInputs=new Map();
                const exactSolo=objective==='money'&&!allowRescue&&!(trainingPenalty&&context.trainingCosts)&&!weights.some(foe=>foe.roaming);
                function leadBasis(rest){
                    if(!exactSolo||!rest.length)return null;
                    const rows=rest.map(values),priorities=new Float64Array(weights.length),leads=new Uint8Array(weights.length);
                    let allSolo=true;
                    for(let i=0;i<weights.length;i++){
                        let lead=0;
                        if(s.autoSwitch!==false)for(let j=1;j<rows.length;j++)if(rows[j].priorities[i]>rows[lead].priorities[i])lead=j;
                        if(rows[lead].solo[i].coverage!==1)allSolo=false;
                        priorities[i]=rows[lead].priorities[i];leads[i]=lead;
                    }
                    return {priorities,leads,solo:allSolo?assess(rest):null};
                }
                function soloPlacements(member,basis){
                    if(s.autoSwitch===false)return {unchangedAt:1,transitions:2};
                    let unchangedAt=0,transitions=0;
                    for(let i=0;i<basis.priorities.length;i++){
                        const priority=member.priorities[i],current=basis.priorities[i];
                        if(priority>current)unchangedAt=Infinity;
                        if(priority===current){
                            const afterLead=basis.leads[i]+1;
                            unchangedAt=Math.max(unchangedAt,afterLead);
                            transitions|=1<<afterLead;
                        }
                    }
                    return {unchangedAt,transitions};
                }
                for(;;){
                    passes++;
                    const ordered=evaluated.team,selected=new Set(ordered.map(mon=>mon.uid));
                    const slots=ordered.flatMap((mon,slot)=>protectedUids.has(mon.uid)?[]:[slot]);
                    if(ordered.length<size)slots.push(ordered.length);
                    const nativeOrder=s.autoSwitch!==false&&!underground;
                    const anchors=slots.map(slot=>{
                        const rest=ordered.filter((_,i)=>i!==slot);
                        const key=JSON.stringify(rest.map(mon=>mon.uid));
                        let scores=anchorScores.get(key);
                        if(!scores)scores=new Map();
                        anchorScores.delete(key);anchorScores.set(key,scores);
                        if(anchorScores.size>2*(size+1))anchorScores.delete(anchorScores.keys().next().value);
                        const certain=nativeOrder?new Float64Array(weights.length).fill(-Infinity):null;
                        const rows=rest.map(values);
                        if(certain)for(const row of rows){
                            for(let i=0;i<certain.length;i++)if(row.solo[i].coverage===1&&row.priorities[i]>certain[i])certain[i]=row.priorities[i];
                        }
                        const reserveOrders=nativeOrder&&!allowRescue?weights.map((_,i)=>{
                            const details=rows.map(row=>fightDetail(row,i));
                            return {rest:details,order:details.map((_,j)=>j).sort((a,b)=>details[b].deployment-details[a].deployment)};
                        }):null;
                        return {slot,rest,rows,ids:new Set(rest.map(identity)),certain,scores,basis:leadBasis(rest),reserveOrders};
                    });
                    const legalFor=(mon,anchor)=>!anchor.ids.has(identity(mon))&&anchor.rest.every(other=>!teamApart(mon,other));
                    let improved=evaluated,checked=0;
                    const equivalents=new Set(),pairOptions=[];
                    alternatives=[];
                    for(const mon of pool){
                        if(sliced&&checked%16===0)yield {verification:{status:'checking',checked,total:pool.length,passes,attempts,pruned,orderPruned,reused,soloReused}};
                        checked++;
                        const group=identity(mon);
                        // Complete healed battle profile, learner share and training
                        // cost determine equivalence. Incumbents and fixed UIDs are
                        // always visited separately so order and ownership stay exact.
                        let input=candidateInputs.get(mon.uid);
                        if(!input){
                            input={equivalent:JSON.stringify([group,settings.mode==='item'&&partyOrder.has(mon.uid),combatProfile({...mon,status:null}),hasLearners?xpShare(mon):0,
                                context.trainingCosts?.[mon.uid]??0,!!mon.evolutionItemLocked])};
                            candidateInputs.set(mon.uid,input);
                        }
                        const {equivalent}=input;
                        if(!selected.has(mon.uid)&&equivalents.has(equivalent)){pruned++;continue;}
                        if(!selected.has(mon.uid))equivalents.add(equivalent);
                        const possible=anchors.filter(anchor=>legalFor(mon,anchor));
                        if(!possible.length)continue;
                        const member=yield* computeValues(mon,sliced,true);
                        if(tryPairs&&!selected.has(mon.uid)){
                            pairOptions.push({mon,score:input.solo??(input.solo=utility([mon]))});
                            pairOptions.sort((a,b)=>b.score-a.score||prefer(a.mon,b.mon));
                            if(pairOptions.length>pairLimit)pairOptions.pop();
                        }
                        for(const {rest,rows,slot,certain,scores,basis,reserveOrders} of possible){
                            const positions=underground?1:rest.length+1;
                            const placements=basis?.solo?soloPlacements(member,basis):null;
                            const nativeBasis=s.autoSwitch!==false?basis:null;
                            let prior=scores.get(mon.uid);
                            let samePlacement=null;
                            const team=[mon,...rest],scoredRows=[member,...rows];
                            const tested={team};
                            const coverageByFoe=!farming&&!underground?[]:null;
                            for(let at=0;at<positions;at++){
                                if(at){
                                    team[at-1]=rest[at-1];team[at]=mon;
                                    scoredRows[at-1]=rows[at-1];scoredRows[at]=member;
                                }
                                if(placements?.transitions&(1<<at))samePlacement=null;
                                // An adjacent crossing can change a native battle
                                // only at equal priority. Any strictly earlier
                                // guaranteed solo clear makes the tie immaterial.
                                if(at&&certain){
                                    const rival=rows[at-1];
                                    if(!member.priorities.some((priority,i)=>priority===rival.priorities[i]&&priority>=certain[i])){
                                        orderPruned++;continue;
                                    }
                                }
                                // Reuse fight outcomes, then score the replacement's
                                // strength even when the native lead is unchanged.
                                const fromSolo=placements&&(samePlacement||(at>=placements.unchangedAt?basis.solo:null));
                                const known=prior?.[at]||fromSolo;
                                const safety=known?.safety||{};
                                const encounterScore=known?.encounterScore??encounterUtility(team,safety,nativeBasis,member,at,scoredRows,coverageByFoe,reserveOrders);
                                tested.score=farmPartyScore(team,encounterScore);tested.safety=safety;tested.reserves=undefined;
                                if(placements)samePlacement=known||{encounterScore,safety};
                                if(!prior?.[at]&&fromSolo)soloReused++;
                                if(known)reused++;
                                else{
                                    if(!prior&&scores.size<512){prior=[];scores.set(mon.uid,prior);}
                                    if(prior)prior[at]=samePlacement||{encounterScore,safety};
                                }
                                attempts++;
                                // Only results that survive this mutable trial need a team copy.
                                if(better(tested,improved))improved={...tested,team:team.slice()};
                                const alternative=alternatives[slot];
                                if(!selected.has(mon.uid)&&(!alternative||better(tested,alternative)))alternatives[slot]={...tested,team:team.slice(),member:mon};
                                if(sliced)yield;
                            }
                        }
                        if(!selected.has(mon.uid)&&!improved.team.includes(mon)&&!pairOptions.some(entry=>entry.mon===mon))cache.delete(mon.uid);
                    }
                    if(improved!==evaluated){evaluated=improved;continue;}
                    if(tryPairs){
                        tryPairs=false;
                        const paired=new Map(slots.map(slot=>[slot,[...new Set([alternatives[slot]?.member,...pairOptions.map(entry=>entry.mon)].filter(Boolean))].slice(0,pairLimit)]));
                        for(let i=0;i<slots.length-1;i++)for(let j=i+1;j<slots.length;j++){
                            if(slots[j]>=ordered.length)continue;
                            for(const a of paired.get(slots[i]))for(const b of paired.get(slots[j])){
                                if(a===b)continue;
                                const trial=ordered.slice();trial[slots[i]]=a;trial[slots[j]]=b;
                                if(!legal(trial))continue;
                                const tested=assess(trial);attempts++;
                                if(better(tested,improved))improved=tested;
                                if(sliced)yield;
                            }
                        }
                        if(improved!==evaluated){evaluated=improved;continue;}
                    }
                    break;
                }
            }
            chosen.splice(0,chosen.length,...evaluated.team);
            if(!chosen.length||underground&&chosen.length!==size||!legal(chosen))return {uids:[],changed:false,opponents:foes.length,reg,objective,
                reason:'当前没有满足任务约束的队伍',verification:{status:'unavailable'}};
            sameMembers=chosen.length===party.length&&chosen.every(mon=>partyOrder.has(mon.uid));
            const safety=evaluated.safety.expedition||{
                turns:(evaluated.safety.turns||0)/totalWeight,worstTurns:evaluated.safety.worst||0,
                knockouts:(evaluated.safety.deaths||0)/totalWeight,wipeWeight:(evaluated.safety.wipes||0)/totalWeight,keyWipeWeight:(evaluated.safety.keyWipes||0)/totalWeight,
            };
            verification={status:smallExpedition?'exhaustive':'verified',uids:chosen.map(mon=>mon.uid),score:evaluated.score,
                total:pool.length,checked:pool.length,passes,attempts,pruned,orderPruned,reused,soloReused,rules:DATA.build,safety,
                members:chosen.map((mon,slot)=>{
                    const own=values(mon),alternative=alternatives[slot];
                    const favorable=weights.map((foe,i)=>({id:foe.id,key:!!(foe.gymCount||foe.guard),value:own[i]}))
                        .sort((a,b)=>Number(b.key)-Number(a.key)||b.value-a.value).slice(0,3).map(foe=>foe.id);
                    return{uid:mon.uid,id:mon.id,level:mon.level,slot,role:protectedUids.has(mon.uid)?'pinned':hasLearners&&xpShare(mon)>0?'learner':'combat',
                        favorable,contribution:evaluated.score-utility(chosen.filter(other=>other!==mon)),
                        alternative:alternative?{uid:alternative.member.uid,id:alternative.member.id,score:alternative.score}:null};
                })};
        }
        const previous={},proposed={};
        const now = utility(party.filter(m=>teamEligible(s,m,reg)),previous), next=utility(chosen,proposed);
        const changed = !sameMembers;
        const necessary = conflictingParty||party.length!==(s.team||[]).length||party.length>size||chosen.length>party.length||party.some(m=>!teamEligible(s,m,reg))||new Set(party.map(identity)).size<party.length||chosen.some(m=>protectedUids.has(m.uid)&&!s.team.includes(m.uid));
        // Verified recommendations may improve by less than the heuristic threshold.
        // The same objective also decides when the actual party should change.
        const farmUpgrade=farming&&worthwhileFarmChange(next,now,proposed,previous);
        const stableItem=settings.mode==='item'&&objective==='route';
        const safer=proposed.keyWipes<previous.keyWipes-1e-8||proposed.wipes<previous.wipes-1e-8;
        const meaningfulItemGain=safer||proposed.deaths<=previous.deaths-.01*totalWeight||
            proposed.deaths<=previous.deaths+1e-8&&(proposed.turns<previous.turns*.98||next>now*1.01);
        const verifiedImprovement=(!stableItem||meaningfulItemGain)&&!!verification&&compareVerified({team:chosen,score:next,safety:proposed},{team:party,score:now,safety:previous})>1e-8&&
            (!farming||farmUpgrade);
        const gymGain=proposed.gym-previous.gym;
        const gymUpgrade=gymTotal>0&&gymGain>=.02&&next>now+.002;
        const fewerWipes=preferReserves&&(verification?proposed.keyWipes<previous.keyWipes-1e-8||proposed.wipes<previous.wipes-1e-8:proposed.wipes===0&&previous.wipes>0&&next>=now);
        const strongerReserves=preferReserves&&changed&&next>=now-1e-8&&proposed.turns<=previous.turns+1e-8&&
            proposed.worst<=previous.worst&&proposed.wipes<=previous.wipes&&proposed.deaths<=previous.deaths&&
            reserveTotal(chosen)>reserveTotal(party)*(verification?1:1.15)+1e-8;
        const improve = verification?verifiedImprovement:farming?farmUpgrade:(!preferReserves||proposed.wipes<=previous.wipes)&&
            (next > now * 1.05 + .01||gymUpgrade||fewerWipes||strongerReserves);
        const orderChanged=chosen.some((m,i)=>s.team[i]!==m.uid),leadGain=chosen.length&&party.length?utility([chosen[0]])/Math.max(.001,utility([party[0]])):1;
        const fasterOrder=execution&&next>now+.002&&proposed.turns<previous.turns*.92&&proposed.worst<=previous.worst&&proposed.deaths<=previous.deaths;
        const reorder=!changed&&orderChanged&&(improve||!verification&&!farming&&(fasterOrder||s.autoSwitch===false&&leadGain>1.2||!execution&&protectedUids.size<chosen.length&&leadGain>1.2));
        const apply=force||necessary||changed&&improve||reorder,result = apply ? chosen : party;
        const sharedType=result.find((mon,i)=>result.slice(0,i).some(other=>MONS.get(other.id)?.types.some(t=>MONS.get(mon.id)?.types.includes(t))));
        let backup='';
        if(sharedType&&execution){
            const base=apply?next:now,without=utility(result.filter(m=>m.uid!==sharedType.uid));
            const delta=base>0?Math.round((base-without)/base*100):0;
            backup=`同属性队员${MONS.get(sharedType.id).name} · 移除后模型分${delta>0?'降低 '+delta+'%':delta<0?'提高 '+(-delta)+'%':'接近不变'}`;
        }
        const uids=result.map(m=>m.uid),verifiedResult=verification?.uids.every((uid,i)=>uid===uids[i])&&verification.uids.length===uids.length;
        const suggestion=verification&&!verifiedResult?{uids:verification.uids,score:next,verification,
            reason:stableItem?'关键战风险、倒下次数与周转改善有限，保留原队':farming?'新阵容改善不足，保留当前刷图阵容':'换队收益与当前风险不足以抵消切换成本，暂留现队'}:null;
        return { uids, backup, changed: !!apply&&(changed||orderChanged||necessary), score: next, currentScore: now, gain:now>0?next/now-1:1, opponents: foes.length||1, reg, objective,
            ...verification?{selectedScore:apply?next:now,...suggestion?{suggestion}:{verification}}:{},
            reason:suggestion?suggestion.reason:necessary?'修复队伍或保留练级目标':fewerWipes?'改善预计无法取胜的对局':reorder?'调整主力出场顺序':gymUpgrade?'提高馆主战续航，减少替补承受的伤害':objective==='money'?'结合付钱战整轮效率与阵容战力':hasLearners?'保留学员，按经验效率与带队战力配队':strongerReserves?'保留路线效率并增强替补':objective==='route'?'减少刷图回合与倒下换人':'提高打点覆盖与通关稳定性' };
    }

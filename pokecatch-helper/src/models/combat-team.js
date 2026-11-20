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
        for (const {level,key,move,stab} of damagingMoves(model)) {
            if (level > mon.level) continue;
            consider(key,move,types[move.type]??1,stab);
        }
        // Native combat uses typeless Struggle when all learned damaging moves are immune.
        if(best&&!(best.choice>0)&&DATA.combat.moves.struggle){best=null;consider('struggle',DATA.combat.moves.struggle,1,1,true);}
        if(!best)return options.details?{damage:0,sustainedDamage:0,hit:0,minHit:0,maxHit:0,accuracy:1,turnAccuracy:1,type:null}:0;
        // Native selection uses aggregate power. Integrate per-strike rolls only for the selected move.
        const {key,move,type,stab,weather,attack,weakened,resistance,accuracy,choice,typeless}=best;
        const gap=Math.pow(DATA.combat.levelGap,Math.max(-99,Math.min(99,mon.level-foe.level)));
        const count=typeless?null:MULTI_HIT_DATA.moves[key],randomCount=count==='2-5';
        const repeats=randomCount?MULTI_HIT_DATA.odds.reduce((sum,weight,i)=>sum+weight*(i+2),0):Array.isArray(count)?1:count||1;
        let hit=0,minHit=0,maxHit=0,singleRollMax=0;
        if(type>0){
            for(const power of Array.isArray(count)?count:[move.power/repeats]){
                const full=baseDamage(power,attack,weakened,resistance,stab,type,weather)*gap;
                if(!count)singleRollMax=full;
                hit+=damageRollMean(full);minHit+=Math.max(1,Math.floor(full*.85));maxHit+=Math.max(1,Math.ceil(full)-1);
            }
            hit*=repeats;minHit*=randomCount?2:repeats;maxHit*=randomCount?5:repeats;
        }
        const damage=hit*accuracy,turnAccuracy=1/(2-accuracy);
        return options.details?{key,damage,sustainedDamage:hit*turnAccuracy,hit,minHit,maxHit,singleRollMax,accuracy,turnAccuracy,type:move.type,choice}:options.capDamage?Math.min(defense.hp,hit)*accuracy:damage;
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
        for(const {level,move,deployPower} of damagingMoves(model)){
            if(level>mon.level)continue;
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
        const speed=stats.spe*(mon.status==='paralysis'?.25:1)-defense.spe*(foe.status==='paralysis'?.25:1);
        return{attack,incoming,hp:stats.hp,foeHp:defense.hp,first:speed>0?1:speed<0?0:.5,deployment:deploymentScore(mon,foe)};
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
        const order=autoSwitch?details.map((detail,i)=>({detail,i})).sort((a,b)=>b.detail.deployment-a.detail.deployment||a.i-b.i).map(entry=>entry.detail):details;
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
        const c = CHAPTERS.get(chapter), chapters = c?.league ? DATA.chapters.filter(row=>row.loop===c.loop) : [c];
        const list = chapters.filter(Boolean).flatMap(row=>chapterCombatFoes(s,row));
        // The current opponent receives extra weight, without discarding the rest of the map.
        if(!c?.league&&chapter===s.adv.chapter)for (const foe of s.adv.battle?.enemies || []) if (MONS.has(foe.id)) list.push({id:foe.id,level:foe.level||c?.ace||50,weight:list.length?.25:1,chapter,liveNode:true});
        return list.filter(foe=>MONS.has(foe.id)&&foe.weight>0);
    }
    const TEAM_ROWS=new Map(),ROUTE_FITS=new Map(),LEAGUE_TRAINING_ROWS=new Map(),TEAM_CACHE={hits:0,misses:0};
    function combatProfile(m){return [m.id,m.level,m.rank||0,+!!m.shiny,m.statMult||1,m.hpMult||1,m.status||'',m.rageMax!=null,tasteProfile(m)];}
    function teamCacheStats(){return{...TEAM_CACHE,contexts:TEAM_ROWS.size,rows:[...TEAM_ROWS.values()].reduce((n,rows)=>n+rows.size,0)};}
    function clearTeamCache(){TEAM_ROWS.clear();ROUTE_FITS.clear();LEAGUE_TRAINING_ROWS.clear();TEAM_CACHE.hits=0;TEAM_CACHE.misses=0;}
    function planAdventureTeam(s, settings, pinned = [], context = {}) {
        return adventureTeamSearch(s,settings,pinned,context,false).next().value;
    }
    function isDexReplay(s,settings,chapter){
        return settings.mode==='dex' && chapter && chapter.id<s.adv.unlocked &&
            chapter.loop!==CHAPTERS.get(s.adv.unlocked)?.loop;
    }
    function* adventureTeamSearch(s,settings,pinned,context,sliced){
        const reg = context.reg || currentRegion(s), party = partyMons(s), size=Math.floor(clamp(context.size,1,6,6));
        const pool=(context.pool||s.mons||[]).filter(m=>teamEligible(s,m,reg));
        const route=context.row,chapters=route?(route.members?.length?route.members.map(id=>CHAPTERS.get(id)):route.league?DATA.chapters.filter(c=>c.loop===route.loop):[route]):[];
        const routeFoes=route?chapters.filter(Boolean).flatMap(c=>chapterCombatFoes(s,c)):null;
        const foes = (context.foes || routeFoes || chapterThreats(s)).filter(m=>MONS.has(m.id)&&m.weight>0);
        const objective=context.objective||(['money','train','progress','dex'].includes(settings.mode)?settings.mode==='dex'?'progress':settings.mode:'coverage'),execution=objective!=='coverage';
        const underground=objective==='underMoney'||objective==='underDepth';
        const allowRescue=!underground&&helperSwitchEnabled(s,settings);
        const encounters=allowRescue?foes.flatMap(foe=>{
            if(!foe.wildWeight)return [foe];
            const weight=Math.min(foe.weight,foe.wildWeight),wild={...foe,weight,singleWild:true,gymCount:0};
            return foe.weight>weight?[wild,{...foe,weight:foe.weight-weight}]:[wild];
        }):foes;
        const weights=encounters.length?encounters.flatMap(foe=>{
            if(objective!=='progress'||!foe.gymCount)return [foe];
            // The route export gives each gym appearance weight 3 and merges wild
            // encounters of the same species/level. Only the gym share is indoors.
            const gyms=WEATHER_DATA.chapters[foe.chapter]?.nodes?.filter(node=>node.kind==='gym')||[];
            const weight=Math.min(foe.weight,3*foe.gymCount),leader={...foe,weight,weatherNode:gyms.length===1?gyms[0]:null};
            return foe.weight>weight?[{...foe,weight:foe.weight-weight,gymCount:0},leader]:[leader];
        }):[{id:19,level:CHAPTERS.get(s.adv.chapter)?.ace||5,weight:1}];
        const gymTotal=objective==='progress'?weights.reduce((n,foe)=>n+(foe.gymCount||0),0):0;
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
        const threatKey=JSON.stringify([allowRescue,weights.map(combatProfile),weatherRows.map(row=>row.signature)]);
        let shared=TEAM_ROWS.get(threatKey);
        if(!shared){shared=new Map();TEAM_ROWS.set(threatKey,shared);if(TEAM_ROWS.size>4)TEAM_ROWS.delete(TEAM_ROWS.keys().next().value);}
        else{TEAM_ROWS.delete(threatKey);TEAM_ROWS.set(threatKey,shared);}
        const foeStats = weights.map(effectiveStats), cache = new Map();
        function* computeValues(mon,split) {
            if (cache.has(mon.uid)) return cache.get(mon.uid);
            const healed={...mon,status:null},key=JSON.stringify(combatProfile(healed));let row=shared.get(key);
            if(row){TEAM_CACHE.hits++;shared.delete(key);shared.set(key,row);}
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
                row.details=details.map(d=>({
                    attack:d.attack,foeHp:d.foeHp,first:d.first,deployment:d.deployment,
                    survives:attackTurns(d.incoming,d.hp)
                }));
                shared.set(key,row);
                if(shared.size>1024)shared.delete(shared.keys().next().value);
            }
            cache.set(mon.uid,row);return row;
        }
        const values=mon=>cache.get(mon.uid)||computeValues(mon,false).next().value;
        const totalWeight=weights.reduce((n,m)=>n+m.weight,0),discount=[1,.35,.15,.075,.04,.02];
        const work=[];
        const utility = (team,summary) => {
            const rows=team.map(values);
            if(underground){
                if(!rows.length)return 0;
                let retained=0,weakestGuard=1,gold=0,seconds=0,guardWeight=0,guardCredit=0,regularWeight=0;
                for(let i=0;i<weights.length;i++){
                    const foe=weights[i],details=rows.map(row=>row.details[i]);
                    // Underground shuffles the party before encounters. Rotate ties in native
                    // deployment priority instead of rewarding an adventure party's fixed lead.
                    let clears=0,elapsed=0,orders=0;
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
                            elapsed+=(2.8*Math.min(30,battle.turns)+(foe.guard?0:credit*(wall+2.324)))/outcomes.length;
                        }
                        orders++;
                    }
                    const survival=clears/orders;
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
                return objective==='underDepth'?depth:gold*(1-guardLoss)/Math.max(1,seconds);
            }
            let gymSum=0,gymWorst=1,worstEfficiency=Infinity;
            const routeScore=weights.reduce((sum,foe,i)=>{
                let count=0;
                for(const row of rows){const value=row[i];let at=count++;while(at>0&&work[at-1]<value){work[at]=work[at-1];at--;}work[at]=value;}
                let value=0;for(let k=0;k<count;k++)value+=work[k]*(discount[k]||0);
                const coverage=Math.log1p(value);
                if(!execution)return sum+foe.weight*coverage;
                // If the native lead finishes alone, every reserve would be unused.
                // A deployment tie stays with the earlier party member, just as in deployedBattle.
                let lead=rows[0];
                if(s.autoSwitch!==false)for(let j=1;j<rows.length;j++)if(rows[j].details[i].deployment>lead.details[i].deployment)lead=rows[j];
                if(allowRescue&&foe.singleWild&&!foe.shiny&&!foe.veiled&&rows.length>1){
                    const current=lead.rescue[i];let bestCost=Infinity;
                    for(let j=1;j<rows.length;j++){
                        const cost=rescueCost(current,rows[j].rescue[i]);
                        if(cost<bestCost){bestCost=cost;lead=rows[j];}
                    }
                }
                const solo=lead?.solo[i];
                const order=allowRescue&&lead!==rows[0]?[lead,...rows.filter(r=>r!==lead)]:rows;
                const battle=solo&&(solo.coverage===1||rows.length===1)?solo:deployedBattle(order.map(row=>row.details[i]),s.autoSwitch!==false);
                if(summary){
                    summary.turns=(summary.turns||0)+foe.weight*battle.turns;
                    summary.worst=Math.max(summary.worst||0,battle.turns);
                    summary.deaths=(summary.deaths||0)+foe.weight*battle.deaths;
                }
                if(gymTotal&&foe.gymCount){
                    const endurance=rows.reduce((sum,row)=>sum+row.endurance[i],0)/Math.max(1,rows.length);
                    gymSum+=foe.gymCount*endurance;gymWorst=Math.min(gymWorst,endurance);
                }
                // Every encounter starts with fresh HP in this estimate. Charge the
                // deployed lead for wear between heals without taxing an unused bench.
                const wear=enduranceRoute&&!(gymTotal&&foe.gymCount) ? .85+.15*(lead?.endurance[i]??0) : 1;
                const efficiency=Math.log1p(3/battle.turns)*battle.coverage*wear/(1+.2*battle.deaths);
                worstEfficiency=Math.min(worstEfficiency,efficiency);
                const weight=objective==='progress'?.35:.7;
                return sum+foe.weight*((1-weight)*coverage+weight*efficiency);
            },0)/totalWeight;
            const gymScore=gymTotal ? .7*gymSum/gymTotal+.3*gymWorst : 0;
            if(summary)summary.gym=gymScore;
            const worstWeight=enduranceRoute ? (gymTotal ? .025 : .07) : 0;
            const robust=worstWeight ? (1-worstWeight)*routeScore+worstWeight*worstEfficiency : routeScore;
            const score=gymTotal ? .55*robust+.45*gymScore : robust;
            if(!context.trainingCosts)return score;
            const costs=team.map(mon=>clamp(context.trainingCosts[mon.uid],0,100,0)),burden=Math.max(0,...costs)+.25*costs.reduce((n,cost)=>n+cost,0);
            return score/(1+clamp(context.trainingPenalty,0,2,0)*burden);
        };
        const identity = mon => DATA.combat.singles[mon.id] || (context.speciesUnique?`sp:${mon.id}`:`${mon.id}:${+!!mon.shiny}`);
        let force=context.force;
        // Check the real party before a progressive box search can publish a replacement.
        if(context.dexReplay && party.length===size && !pinned.length && foes.length && party.every(mon=>pool.includes(mon))){
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
        const chosen = [], used = new Set();
        const protectedUids=new Set(pinned),partyOrder=new Map((s.team||[]).map((uid,i)=>[uid,i]));
        // Only training projections carry this flag. Resolve equal combat scores
        // before falling back to the existing party order and stable UID.
        const prefer=(a,b)=>Number(!!a.evolutionItemLocked)-Number(!!b.evolutionItemLocked)||
            (partyOrder.get(a.uid)??9999)-(partyOrder.get(b.uid)??9999)||String(a.uid).localeCompare(String(b.uid));
        for (const uid of pinned) { const mon=pool.find(m=>m.uid===uid); if(chosen.length<size&&mon&&!used.has(identity(mon))){chosen.push(mon);used.add(identity(mon));} }
        // Copies with the same healed combat profile and training cost occupy the
        // same legal slot. Retain the preferred UID and any explicitly pinned copy.
        let candidates=pool;
        if(pool.length>size){
            const equivalent=new Map();
            for(const mon of pool){
                if(used.has(identity(mon)))continue;
                const profile=JSON.stringify([combatProfile({...mon,status:null}),context.trainingCosts?.[mon.uid]??0]);
                const other=equivalent.get(profile);
                if(!other||prefer(mon,other)<0)equivalent.set(profile,mon);
            }
            candidates=[...equivalent.values()];
        }
        // A legal incumbent is available before cold matchup rows are computed.
        // Only the live adventure scheduler consumes these checkpoints.
        if(context.progressive){
            const fallback=chosen.slice(),seen=new Set(used);
            for(const mon of [...party,...candidates]){
                if(fallback.length>=size)break;
                if(!pool.includes(mon)||seen.has(identity(mon))||underground&&fallback.some(other=>undergroundApart(mon,other)))continue;
                seen.add(identity(mon));fallback.push(mon);
            }
            const uids=fallback.map(m=>m.uid);
            yield {uids,changed:JSON.stringify(uids)!==JSON.stringify(s.team),gain:0,opponents:foes.length,reg,objective,reason:'计算预算已到，采用合法基础阵容'};
            // On slow devices compare a few legal alternatives before scanning the
            // whole box. The scheduler retains the best completed checkpoint.
            if(candidates.length>64&&fallback.length===size){
                for(const mon of fallback)yield* computeValues(mon,true);
                const base=utility(fallback);let best=base;
                for(const mon of candidates.filter(m=>!seen.has(identity(m))).slice(0,6)){
                    yield* computeValues(mon,true);
                    for(let i=0;i<size;i++){
                        if(protectedUids.has(fallback[i].uid))continue;
                        const trial=fallback.slice();trial[i]=mon;
                        if(underground&&trial.some(other=>undergroundApart(mon,other)))continue;
                        const score=utility(trial);
                        if(score>best&&score>base*1.05+.01){
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
        if(candidates.length>64){
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
            let best = null, score = -Infinity;
            for (const mon of candidates) {
                if (used.has(identity(mon))||underground&&chosen.some(other=>undergroundApart(mon,other))) continue;
                const value = utility([...chosen,mon]);
                if (value > score + 1e-8 || Math.abs(value-score)<1e-8&&(!best||prefer(mon,best)<0)) { best=mon;score=value; }
                if(sliced)yield;
            }
            if (!best) break; chosen.push(best);used.add(identity(best));
        }
        const incumbent=party.filter(m=>pool.includes(m));
        const legalIncumbent=incumbent.length===party.length&&party.length===chosen.length&&new Set(party.map(identity)).size===party.length&&chosen.every(m=>!protectedUids.has(m.uid)||incumbent.includes(m));
        const incumbentScore=context.progressive?utility(incumbent):0;
        function checkpoint(){
            const score=utility(chosen),apply=!legalIncumbent||score>incumbentScore*1.05+.01;
            return {uids:(apply?chosen:incumbent).map(m=>m.uid),changed:apply,checkpointScore:apply?score:incumbentScore,gain:incumbentScore?score/incumbentScore-1:0,reg,objective,opponents:foes.length,reason:apply?'采用预算内改善最大的合法阵容':'已评估的提升未过换队门槛'};
        }
        if(context.progressive)yield checkpoint();
        // At most 56 unordered trios. Each candidate is a yield point, with the greedy
        // incumbent already available if the scheduler runs out of time.
        const smallExpedition=underground&&size===3&&!pinned.length&&candidates.length<=8;
        if(smallExpedition){
            let best=chosen.length===3?utility(chosen):-Infinity;
            for(let i=0;i<candidates.length-2;i++)for(let j=i+1;j<candidates.length-1;j++){
                const a=candidates[i],b=candidates[j];
                if(identity(a)===identity(b)||undergroundApart(a,b))continue;
                for(let k=j+1;k<candidates.length;k++){
                    const c=candidates[k];
                    if(identity(a)===identity(c)||identity(b)===identity(c)||undergroundApart(a,c)||undergroundApart(b,c))continue;
                    const trio=[a,b,c],score=utility(trio);
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
                    if(taken.has(identity(mon))||underground&&rest.some(other=>undergroundApart(mon,other)))continue;
                    const value=utility(chosen.map((entry,i)=>i===slot?mon:entry));
                    if(value>score+1e-8||Math.abs(value-score)<1e-8&&best.evolutionItemLocked&&!mon.evolutionItemLocked){best=mon;score=value;}
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
        const sameMembers=chosen.length===party.length&&chosen.every(mon=>partyOrder.has(mon.uid));
        if(execution&&sameMembers){
            const currentOrder=[...chosen].sort((a,b)=>partyOrder.get(a.uid)-partyOrder.get(b.uid));
            const currentScore=utility(currentOrder);
            if(currentScore>=orderedScore-1e-8){chosen.splice(0,chosen.length,...currentOrder);orderedScore=currentScore;}
        }
        const orderMatters=!underground&&execution&&chosen.length>1&&(s.autoSwitch===false||weights.some((_,i)=>{
            const priorities=chosen.map(mon=>values(mon).details[i].deployment);
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
        const previous={},proposed={};
        const now = utility(party.filter(m=>teamEligible(s,m,reg)),previous), next=utility(chosen,proposed);
        const changed = !sameMembers;
        const necessary = party.length!==(s.team||[]).length||party.length>size||chosen.length>party.length||party.some(m=>!teamEligible(s,m,reg))||new Set(party.map(identity)).size<party.length||chosen.some(m=>protectedUids.has(m.uid)&&!s.team.includes(m.uid));
        // Keep a stable party unless the predicted gain is material, so income sampling remains useful.
        const gymGain=proposed.gym-previous.gym;
        const gymUpgrade=gymTotal>0&&gymGain>=.02&&next>now+.002;
        const improve = next > now * 1.05 + .01||gymUpgrade;
        const orderChanged=chosen.some((m,i)=>s.team[i]!==m.uid),leadGain=chosen.length&&party.length?utility([chosen[0]])/Math.max(.001,utility([party[0]])):1;
        const fasterOrder=execution&&next>now+.002&&proposed.turns<previous.turns*.92&&proposed.worst<=previous.worst&&proposed.deaths<=previous.deaths;
        const reorder=!changed&&orderChanged&&(improve||fasterOrder||s.autoSwitch===false&&leadGain>1.2||!execution&&protectedUids.size<chosen.length&&leadGain>1.2);
        const apply=force||necessary||changed&&improve||reorder,result = apply ? chosen : party;
        const sharedType=result.find((mon,i)=>result.slice(0,i).some(other=>MONS.get(other.id)?.types.some(t=>MONS.get(mon.id)?.types.includes(t))));
        let backup='';
        if(sharedType&&execution){
            const base=apply?next:now,without=utility(result.filter(m=>m.uid!==sharedType.uid));
            const delta=base>0?Math.round((base-without)/base*100):0;
            backup=`同属性队员${MONS.get(sharedType.id).name} · 移除后模型分${delta>0?'降低 '+delta+'%':delta<0?'提高 '+(-delta)+'%':'接近不变'}`;
        }
        return { uids: result.map(m=>m.uid), backup, changed: !!apply&&(changed||orderChanged||necessary), score: next, currentScore: now, gain:now>0?next/now-1:1, opponents: foes.length||1, reg, objective, reason:necessary?'修复队伍或保留练级目标':reorder?'调整主力出场顺序':gymUpgrade?'提高馆主战续航，减少替补承受的伤害':objective==='money'?'减少刷钱回合与倒下换人':objective==='train'?'保留学员并提高带练清图效率':'提高打点覆盖与通关稳定性' };
    }

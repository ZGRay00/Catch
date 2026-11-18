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
    function candyPlan(s,settings,type){
        const goal=settings.candyFloor>0?Math.ceil(settings.candyFloor/CANDY_DATA.step)*CANDY_DATA.step:50;
        const context=candyContext(s,type,goal);if(!context)return null;
        // The native run clones these fields only; PC injuries and temporary multipliers
        // do not carry over, and low-level members are never raised to the level cap.
        const pool=(s.mons||[]).filter(mon=>teamEligible(s,mon,context.reg)).map(mon=>({uid:mon.uid,id:mon.id,reg:monRegion(mon),
            level:Math.min(100,Math.max(1,Number(mon.level)||1)),shiny:!!mon.shiny,...mon.rank?{rank:mon.rank}:{},...mon.taste?{taste:mon.taste}:{}}));
        const party=(s.eventTeams?.candy||[]).filter(uid=>pool.some(mon=>mon.uid===uid));
        const state={...s,mons:pool,team:party,road:party};
        const plan=planAdventureTeam(state,settings,[],{...context,pool,force:true,objective:'progress'});
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
    function expectedDamage(mon, foe, stats, defense, options = {}) {
        if(!MONS.has(mon.id)||!MONS.has(foe.id))return 0;
        // Native Transform copies the attacking species and its stats, keeping level/rank/shiny.
        if(mon.id===132&&foe.id!==132){mon={...mon,id:foe.id};stats=effectiveStats(mon);}
        const model = MONS.get(mon.id), enemy = MONS.get(foe.id); let best = null, learned = false;
        const gap=Math.pow(DATA.combat.levelGap,Math.max(-99,Math.min(99,mon.level-foe.level)));
        const hit=(key,move,type,stab,typeless=false)=>{
            const physical=move.cat==='phys',weakened=mon.status===(physical?'burn':'poison')?.75:1;
            const exposed=foe.status===(physical?'sleep':'freeze')?.75:1;
            const rawWeather=typeless?1:typeof options.weather==='function'?options.weather(move.type):options.weather?.[move.type];
            const weather=Number.isFinite(rawWeather)&&rawWeather>=0?rawWeather:1;
            const baseFor=power=>((2*mon.level/5+2)*power*stats[physical?'atk':'spa']*weakened/Math.max(1,defense[physical?'def':'spd']*exposed)/50+2)*stab*type*weather;
            const base=baseFor(move.power),accuracy=Math.max(0,Math.min(1,move.acc/100)),turnAccuracy=1/(2-accuracy);
            const count=typeless?null:MULTI_HIT_DATA.moves[key],randomCount=count==='2-5';
            const meanCount=randomCount?MULTI_HIT_DATA.odds.reduce((sum,weight,i)=>sum+weight*(i+2),0):Array.isArray(count)?count.length:count||1;
            const powers=Array.isArray(count)?count:[move.power/meanCount];
            const repeats=Array.isArray(count)?1:meanCount;
            const rolls=powers.map(power=>baseFor(power)*gap);
            const damage=type>0?rolls.reduce((sum,full)=>sum+damageRollMean(full),0)*repeats:0;
            const minHit=type>0?rolls.reduce((sum,full)=>sum+Math.max(1,Math.floor(full*.85)),0)*(randomCount?2:repeats):0;
            const maxHit=type>0?rolls.reduce((sum,full)=>sum+Math.max(1,Math.ceil(full)-1),0)*(randomCount?5:repeats):0;
            return {key,damage:damage*accuracy,sustainedDamage:damage*turnAccuracy,hit:damage,minHit,maxHit,accuracy,turnAccuracy,type:move.type,choice:base*accuracy};
        };
        for (const [level, key] of model.learn || []) {
            if (level > mon.level) continue;
            const move = DATA.combat.moves[key]; if (!move?.power) continue;learned=true;
            const type = enemy.types.reduce((n, t) => n * (DATA.chart[move.type]?.[t] ?? 1), 1);
            const candidate=hit(key,move,type,model.types.includes(move.type)?1.5:1);
            // Native combat chooses its move before damage is capped by the target's HP.
            if(!best||candidate.choice>best.choice)best=candidate;
        }
        // Native combat uses typeless Struggle when all learned damaging moves are immune.
        if(learned&&!(best?.choice>0)&&DATA.combat.moves.struggle)best=hit('struggle',DATA.combat.moves.struggle,1,1,true);
        best??={damage:0,sustainedDamage:0,hit:0,minHit:0,maxHit:0,accuracy:1,turnAccuracy:1,type:null};
        return options.details?best:options.capDamage?Math.min(defense.hp,best.hit)*best.accuracy:best.damage;
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
        const typeOf=type=>enemy.types.reduce((n,t)=>n*(DATA.chart[type]?.[t]??1),1);
        let best=null,fallback=null;
        for(const[level,key]of model.learn||[]){
            const move=DATA.combat.moves[key];if(level>mon.level||!move?.power)continue;
            const value=move.power*move.acc/100*(model.types.includes(move.type)?1.5:1)*model.stats[move.cat==='phys'?'atk':'spa'];
            if(!fallback||value>fallback.value)fallback={value,type:move.type};
            const score=value*typeOf(move.type);if(!best||score>best.value)best={value:score,type:move.type};
        }
        const move=best?.value>0?best:fallback,attack=move?typeOf(move.type):1;
        const incoming=Math.max(...enemy.types.map(type=>model.types.reduce((n,t)=>n*(DATA.chart[type]?.[t]??1),1)));
        return(attack===0?-5:attack>1?3:attack<1?-3:0)+(incoming>1?-2:incoming<1?2:0)+.01*(Math.log2(Math.max(.125,attack))-Math.log2(Math.max(.125,incoming)));
    }
    function matchupDetails(mon,foe,stats=effectiveStats(mon),defense=effectiveStats(foe),options={}){
        const attack=expectedDamage(mon,foe,stats,defense,{...options,details:true}),incoming=expectedDamage(foe,mon,defense,stats,{...options,details:true});
        const speed=stats.spe*(mon.status==='paralysis'?.25:1)-defense.spe*(foe.status==='paralysis'?.25:1);
        return{attack,incoming,hp:stats.hp,foeHp:defense.hp,first:speed>0?1:speed<0?0:.5,deployment:deploymentScore(mon,foe)};
    }
    function attackTurns(attack,hp){
        if(!(attack.hit>0)||!(attack.accuracy>0))return Infinity;
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
            const survives=attackTurns(incoming,detail.hp),attacks=Math.max(0,survives-(1-first));
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
            const turns=attackTurns(detail.attack,foe.hp);
            const hitsTaken=Math.max(0,turns-detail.first);
            const loss=hitsTaken===0||detail.incoming.sustainedDamage===0?0:hitsTaken*detail.incoming.sustainedDamage/hp;
            return {turns,loss};
        };
        const current=evaluate(lead);
        if(current.turns<=1&&current.loss<1)return null;
        let best=null;
        for(const mon of party){
            if(mon===lead||!MONS.has(mon.id)||(mon.hp??1)<=0)continue;
            const rival=evaluate(mon);
            if(!Number.isFinite(rival.turns)||rival.loss>=.85)continue;
            const savesLead=current.loss>=1;
            const faster=current.turns-rival.turns>=1&&current.loss-rival.loss>=.15;
            if(!savesLead&&!faster)continue;
            const cost=rival.turns*(1+rival.loss);
            if(!best||cost<best.cost)best={uid:mon.uid,foe:foe.uid,lead:lead.uid,cost,reason:savesLead?'避免主力倒下':'缩短战斗并降低损血'};
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
            return {...foe,chapter:chapter.id,...gymCount?{gymCount}:{}};
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
    function combatWeather(s,foe={},context={},now=Date.now()){
        const chapter=Number.isInteger(foe.chapter)?foe.chapter:Number.isInteger(context.row?.id)?context.row.id:
            ['map','progress'].includes(context.kind)&&Number.isInteger(context.id)?context.id:s.adv?.chapter;
        const reference=foe.weatherNode||(foe.liveNode&&chapter===s.adv?.chapter?s.adv.nodes?.[s.adv.node]:null)||context.weatherNode;
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
        const reg = context.reg || currentRegion(s), party = partyMons(s), size=Math.floor(clamp(context.size,1,6,6));
        const pool=(context.pool||s.mons||[]).filter(m=>teamEligible(s,m,reg));
        const route=context.row,chapters=route?(route.members?.length?route.members.map(id=>CHAPTERS.get(id)):route.league?DATA.chapters.filter(c=>c.loop===route.loop):[route]):[];
        const routeFoes=route?chapters.filter(Boolean).flatMap(c=>chapterCombatFoes(s,c)):null;
        const foes = (context.foes || routeFoes || chapterThreats(s)).filter(m=>MONS.has(m.id)&&m.weight>0);
        const objective=context.objective||(['money','train','progress','dex'].includes(settings.mode)?settings.mode==='dex'?'progress':settings.mode:'coverage'),execution=objective!=='coverage';
        const weights=foes.length?foes.flatMap(foe=>{
            if(objective!=='progress'||!foe.gymCount)return [foe];
            // The route export gives each gym appearance weight 3 and merges wild
            // encounters of the same species/level. Only the gym share is indoors.
            const gyms=WEATHER_DATA.chapters[foe.chapter]?.nodes?.filter(node=>node.kind==='gym')||[];
            const weight=Math.min(foe.weight,3*foe.gymCount),leader={...foe,weight,weatherNode:gyms.length===1?gyms[0]:null};
            return foe.weight>weight?[{...foe,weight:foe.weight-weight,gymCount:0},leader]:[leader];
        }):[{id:19,level:CHAPTERS.get(s.adv.chapter)?.ace||5,weight:1}];
        const gymTotal=objective==='progress'?weights.reduce((n,foe)=>n+(foe.gymCount||0),0):0;
        const weatherRows=weights.map(foe=>combatWeather(s,foe,context,context.now??Date.now()));
        const threatKey=JSON.stringify([weights.map(combatProfile),weatherRows.map(row=>row.signature)]);
        let shared=TEAM_ROWS.get(threatKey);
        if(!shared){shared=new Map();TEAM_ROWS.set(threatKey,shared);if(TEAM_ROWS.size>4)TEAM_ROWS.delete(TEAM_ROWS.keys().next().value);}
        else{TEAM_ROWS.delete(threatKey);TEAM_ROWS.set(threatKey,shared);}
        const foeStats = weights.map(effectiveStats), cache = new Map();
        const values = mon => {
            if (cache.has(mon.uid)) return cache.get(mon.uid);
            const healed={...mon,status:null},key=JSON.stringify(combatProfile(healed));let row=shared.get(key);
            if(row){TEAM_CACHE.hits++;shared.delete(key);shared.set(key,row);}
            else{
                TEAM_CACHE.misses++;const stats=effectiveStats(healed);
                const details=weights.map((foe,i)=>matchupDetails(healed,foe,stats,foeStats[i],weatherRows[i]));
                row=details.map((detail,i)=>{
                    const defense=foeStats[i],attack=Math.min(defense.hp,detail.attack.hit)*detail.attack.turnAccuracy,incoming=Math.min(stats.hp,detail.incoming.hit)*detail.incoming.turnAccuracy;
                    const survival=Math.min(4,stats.hp/Math.max(.01,incoming)),speed=Math.min(1.2,Math.max(.8,Math.sqrt(stats.spe/Math.max(1,defense.spe))));
                    return attack/Math.max(1,defense.hp)*(.5+.5*Math.sqrt(survival))*speed;
                });row.details=details;
                // Estimate how much HP a fresh reserve needs to finish this matchup.
                // Use the opponent's best actual move, including off-type coverage.
                row.endurance=details.map(d=>{
                    const turns=attackTurns(d.attack,d.foeHp);
                    if(!Number.isFinite(turns))return 0;
                    const damageShare=Math.max(0,turns-d.first)*d.incoming.sustainedDamage/d.hp;
                    return 1/(1+damageShare*damageShare);
                });
                shared.set(key,row);
                if(shared.size>1024)shared.delete(shared.keys().next().value);
            }
            cache.set(mon.uid,row);return row;
        };
        const totalWeight=weights.reduce((n,m)=>n+m.weight,0),discount=[1,.35,.15,.075,.04,.02];
        const work=[];
        const utility = (team,summary) => {
            const rows=team.map(values);
            let gymSum=0,gymWorst=1;
            const routeScore=weights.reduce((sum,foe,i)=>{
                let count=0;
                for(const row of rows){const value=row[i];let at=count++;while(at>0&&work[at-1]<value){work[at]=work[at-1];at--;}work[at]=value;}
                let value=0;for(let k=0;k<count;k++)value+=work[k]*(discount[k]||0);
                const coverage=Math.log1p(value);
                if(!execution)return sum+foe.weight*coverage;
                const battle=deployedBattle(rows.map(row=>row.details[i]),s.autoSwitch!==false);
                if(gymTotal&&foe.gymCount){
                    const endurance=rows.reduce((sum,row)=>sum+row.endurance[i],0)/Math.max(1,rows.length);
                    gymSum+=foe.gymCount*endurance;gymWorst=Math.min(gymWorst,endurance);
                }
                const efficiency=Math.log1p(3/battle.turns)*battle.coverage/(1+.2*battle.deaths);
                const weight=objective==='progress'?.35:.7;
                return sum+foe.weight*((1-weight)*coverage+weight*efficiency);
            },0)/totalWeight;
            const gymScore=gymTotal ? .7*gymSum/gymTotal+.3*gymWorst : 0;
            if(summary)summary.gym=gymScore;
            const score=gymTotal ? .55*routeScore+.45*gymScore : routeScore;
            if(!context.trainingCosts)return score;
            const costs=team.map(mon=>clamp(context.trainingCosts[mon.uid],0,100,0)),burden=Math.max(0,...costs)+.25*costs.reduce((n,cost)=>n+cost,0);
            return score/(1+clamp(context.trainingPenalty,0,2,0)*burden);
        };
        const identity = mon => DATA.combat.singles[mon.id] || (context.speciesUnique?`sp:${mon.id}`:`${mon.id}:${+!!mon.shiny}`);
        const chosen = [], used = new Set();
        const protectedUids=new Set(pinned),partyOrder=new Map((s.team||[]).map((uid,i)=>[uid,i]));
        // Only training projections carry this flag. Resolve equal combat scores
        // before falling back to the existing party order and stable UID.
        const prefer=(a,b)=>Number(!!a.evolutionItemLocked)-Number(!!b.evolutionItemLocked)||
            (partyOrder.get(a.uid)??9999)-(partyOrder.get(b.uid)??9999)||String(a.uid).localeCompare(String(b.uid));
        for (const uid of pinned) { const mon=pool.find(m=>m.uid===uid); if(chosen.length<size&&mon&&!used.has(identity(mon))){chosen.push(mon);used.add(identity(mon));} }
        while (chosen.length < size) {
            let best = null, score = -Infinity;
            for (const mon of pool) {
                if (used.has(identity(mon))) continue;
                const value = utility([...chosen,mon]);
                if (value > score + 1e-8 || Math.abs(value-score)<1e-8&&(!best||prefer(mon,best)<0)) { best=mon;score=value; }
            }
            if (!best) break; chosen.push(best);used.add(identity(best));
        }
        // Two bounded replacement passes recover combinations a single greedy fill misses.
        for(let pass=0;pass<2;pass++){
            let improved=false;
            for(let slot=0;slot<chosen.length;slot++){
                if(protectedUids.has(chosen[slot].uid))continue;
                const rest=chosen.filter((_,i)=>i!==slot),taken=new Set(rest.map(identity));let best=chosen[slot],score=utility(chosen);
                for(const mon of pool){
                    if(taken.has(identity(mon)))continue;
                    const value=utility(chosen.map((entry,i)=>i===slot?mon:entry));
                    if(value>score+1e-8||Math.abs(value-score)<1e-8&&best.evolutionItemLocked&&!mon.evolutionItemLocked){best=mon;score=value;}
                }
                if(best.uid!==chosen[slot].uid){chosen[slot]=best;improved=true;}
            }
            if(!improved)break;
        }
        chosen.sort((a,b)=>utility([b])-utility([a])||prefer(a,b));
        // With native auto-switch off, deployment follows party order. Optimize that
        // order as well, including a fully pinned training party whose members stay fixed.
        if(execution&&s.autoSwitch===false)for(let pass=0;pass<2;pass++){
            let changed=false,score=utility(chosen);
            for(let i=0;i<chosen.length-1;i++)for(let j=i+1;j<chosen.length;j++){
                [chosen[i],chosen[j]]=[chosen[j],chosen[i]];const value=utility(chosen);
                if(value>score+1e-8){score=value;changed=true;}else[chosen[i],chosen[j]]=[chosen[j],chosen[i]];
            }
            if(!changed)break;
        }
        const previous={},proposed={};
        const now = utility(party.filter(m=>teamEligible(s,m,reg)),previous), next=utility(chosen,proposed);
        const changed = chosen.length!==party.length || chosen.some(m=>!s.team.includes(m.uid));
        const necessary = party.length!==(s.team||[]).length||party.length>size||chosen.length>party.length||party.some(m=>!teamEligible(s,m,reg))||new Set(party.map(identity)).size<party.length||chosen.some(m=>protectedUids.has(m.uid)&&!s.team.includes(m.uid));
        // Keep a stable party unless the predicted gain is material, so income sampling remains useful.
        const gymGain=proposed.gym-previous.gym;
        const gymUpgrade=gymTotal>0&&gymGain>=.02&&next>now+.002;
        const improve = next > now * 1.05 + .01||gymUpgrade;
        const orderChanged=chosen.some((m,i)=>s.team[i]!==m.uid),leadGain=chosen.length&&party.length?utility([chosen[0]])/Math.max(.001,utility([party[0]])):1;
        const reorder=!changed&&orderChanged&&(next>now*1.08+.01||s.autoSwitch===false&&leadGain>1.2||!execution&&protectedUids.size<chosen.length&&leadGain>1.2);
        const apply=context.force||necessary||changed&&improve||reorder,result = apply ? chosen : party;
        return { uids: result.map(m=>m.uid), changed: !!apply&&(changed||orderChanged||necessary), score: next, currentScore: now, gain:now>0?next/now-1:1, opponents: foes.length||1, reg, objective, reason:necessary?'修复队伍或保留练级目标':reorder?'调整主力出场顺序':gymUpgrade?'提高馆主战续航，减少替补承受的伤害':objective==='money'?'减少刷钱回合与倒下换人':objective==='train'?'保留学员并提高带练清图效率':'提高打点覆盖与通关稳定性' };
    }

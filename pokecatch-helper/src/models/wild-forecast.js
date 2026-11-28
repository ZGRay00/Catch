    const WILD_FORECAST_LIMIT=30000;
    const WILD_COUNTER_BUNDLES=new Set(['f467030697','6e904dfeb4']);

    // Estimate one repeated lap of the generated route. Entering a battle and
    // each one-hit knockout cost one action each. Other stops and the lap
    // transition also take a step. Live animation and capture time can vary.
    function wildEncounterSeconds(s,chapter){
        const {nodes,speed}=s.adv;
        if(!Array.isArray(nodes)||![1,4].includes(speed))return null;
        let wild=0,actions=1;
        for(const node of nodes){
            if(!node?.type)return null;
            actions++;
            if(node.type==='wild'){
                if(!node.roamer||s.roam?.caught?.includes(node.roamer))wild++;
                actions++;
            }else if(node.type==='static')actions++;
            else if(node.type==='trainer'||node.type==='gym'){
                const typical=node.type==='gym'?chapter.gymFoes?.length:node.gymTrainer?1:
                    1+Math.min(2,Math.floor((chapter.id-(DATA.regions.find(r=>r.key===chapter.reg)?.start||0))/2)+1)/2;
                actions+=node.team?.length||node.size||typical||1;
            }
        }
        return wild?actions*2.8/(speed===4?2.5:1)/wild:null;
    }

    function wildShinyForecast(s,bundle,now=Date.now(),cache={}){
        const adv=s?.adv,chapter=CHAPTERS.get(adv?.chapter);
        if(!adv)return {error:'等待读取游戏存档'};
        if(!chapter||adv.event||adv.zone||adv.tower||adv.league||chapter.league)return {error:'回到普通冒险路线后可查看路闪预测'};
        if(!WILD_COUNTER_BUNDLES.has(bundle))return {error:'当前游戏版本的野生遭遇序列尚未核对'};
        const seed=nurserySeed(s);
        if(seed===null||!s.dex)return {error:'等待训练家信息和地区图鉴'};
        // nextWild() reads the old counter before incrementing. The native
        // initializer uses battles only until the first wild counter is saved.
        const counter=s.wildN??Math.max(0,Math.floor(Number(s.stats?.battles??0)));
        if(!Number.isSafeInteger(counter)||counter<0||counter>Number.MAX_SAFE_INTEGER-WILD_FORECAST_LIMIT)return {error:'野生遭遇序号异常'};
        const odds=shinyOdds(s,{region:chapter.reg},now);
        const berryRate=Math.min(1,odds.baseRate*DATA.automation.buffs['starf-berry'].mult);
        const key=JSON.stringify([seed,chapter.reg,odds.baseRate,bundle]);
        // Keep absolute indices. At normal polling frequency most renders only
        // subtract the new counter. A rewind or passed hit needs a fresh scan.
        if(cache.key!==key||counter<cache.start||counter!==cache.start&&
            [cache.natural,cache.berryOnly].some(hit=>hit===null||hit<counter)){
            Object.assign(cache,{key,start:counter,natural:null,berryOnly:null});
            const prefix=seed+'|wild|';
            for(let i=counter;i<counter+WILD_FORECAST_LIMIT;i++){
                const roll=nurseryHash(prefix+i+'|0');
                if(roll<odds.baseRate)cache.natural??=i;
                else if(roll<berryRate)cache.berryOnly??=i;
                if(cache.natural!==null&&cache.berryOnly!==null)break;
            }
        }
        const distance=hit=>hit===null?null:hit-counter+1;
        const natural=distance(cache.natural),berryOnly=distance(cache.berryOnly);
        const berry=natural===null?berryOnly:berryOnly===null?natural:Math.min(natural,berryOnly);
        const remainingMs=activeYieldBuff(s,'shiny',now)&&s.buffs.shiny.key==='starf-berry'?s.buffs.shiny.until-now:0;
        return {region:chapter.reg,complete:odds.complete,natural,berry,berryOnly,remainingMs,seconds:wildEncounterSeconds(s,chapter)};
    }

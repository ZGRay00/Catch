    const WILD_FORECAST_LIMIT=30000;
    const WILD_COUNTER_BUNDLES=new Set(['f467030697','6e904dfeb4','a736e7726c']);

    // Estimate one repeated lap of the generated route. Entering a battle and
    // each one-hit knockout cost one action each. Other stops and the lap
    // transition also take a step. Live animation and capture time can vary.
    function wildRouteTiming(s,chapter){
        const {nodes,speed,node:cursor=0,battle}=s.adv;
        if(!Array.isArray(nodes)||![1,4].includes(speed))return null;
        const positions=[];
        let actions=0,elapsed=null;
        for(const [index,node] of nodes.entries()){
            if(!node?.type)return null;
            const start=actions++;
            let enemies=0;
            if(node.type==='wild'){
                const group=node.roamer&&!node.event&&ROAMING_DATA.groups.find(g=>g.ids.includes(node.roamer));
                const roaming=group&&s.adv.badges?.includes(group.badge)&&!s.roam?.caught?.includes(node.roamer);
                if(!roaming)positions.push(actions);
                enemies=1;
            }else if(node.type==='static')enemies=1;
            else if(node.type==='trainer'||node.type==='gym'){
                const typical=node.type==='gym'?chapter.gymFoes?.length:node.gymTrainer?1:
                    1+Math.min(2,Math.floor((chapter.id-(DATA.regions.find(r=>r.key===chapter.reg)?.start||0))/2)+1)/2;
                enemies=node.team?.length||node.size||typical||1;
            }
            if(index===cursor){
                if(battle&&battle.enemies?.length)enemies=battle.enemies.length;
                // A live battle has already consumed its encounter roll.
                elapsed=battle?start+1+(battle.enemies||[]).filter(e=>e?.hp===0).length:start;
            }
            actions+=enemies;
        }
        if(cursor===nodes.length)elapsed=actions;
        const step=2.8/(speed===4?2.5:1);
        return {positions,elapsed,lap:actions+1,step};
    }
    function wildTargetSeconds(route,n){
        if(!route||n===null||!route.positions.length)return null;
        const {positions,elapsed,lap,step}=route;
        if(elapsed===null)return n*lap*step/positions.length;
        // Locate the Nth future spawn, including the partial current lap.
        const index=positions.filter(at=>at<=elapsed).length+n-1;
        return (Math.floor(index/positions.length)*lap+positions[index%positions.length]-elapsed)*step;
    }

    function wildShinyForecast(s,bundle,now=Date.now(),cache={}){
        const adv=s?.adv,chapter=CHAPTERS.get(adv?.chapter);
        if(!adv)return {error:'等待读取游戏存档'};
        if(!chapter||adv.event||adv.zone||adv.tower||adv.league||chapter.league)return {error:'回到普通冒险路线后可查看路闪预测'};
        if(bundle==='e2eb68ec8c')return {error:'此旧版游戏在遇敌时随机判定，无法按序号预测'};
        const verified=WILD_COUNTER_BUNDLES.has(bundle);
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
        const route=wildRouteTiming(s,chapter),wildPerLap=route?.positions.length??null;
        const times={natural:wildTargetSeconds(route,natural),berry:wildTargetSeconds(route,berry),berryOnly:wildTargetSeconds(route,berryOnly)};
        return {region:chapter.reg,complete:odds.complete,natural,berry,berryOnly,remainingMs,verified,legacyCounter:s.wildN==null,
            seconds:wildPerLap?route.lap*route.step/wildPerLap:null,wildPerLap,times,wildFightSeconds:route?2*route.step:null};
    }

    const GEODE_TIERS=['普通','较少见','稀有','传说'];
    function itemPoints(s,id){
        const adv=s.adv, nodes=adv.nodes;
        if(!Array.isArray(nodes))return null;
        const sources=(ITEMS.get(id)?.sources||[]).filter(row=>row.ch===adv.chapter);
        const kinds=new Set(sources.filter(row=>sourceAvailable(s,row,id)).map(row=>row.kind));
        const points=[];
        nodes.forEach((node,index)=>{
            if(!node)return;
            let kind='';
            if(node.type==='town'&&kinds.has('town'))kind='城镇机会';
            if(node.type==='item'){
                if(node.find?.item===id&&!adv.gifts?.[node.find.once]&&!adv.gifts?.[node.find.until]&&
                    (!node.find.upTo||chapterItemCount(s,adv.chapter,id)<node.find.upTo))kind='指定掉落';
                else if(!node.find&&Object.hasOwn(node.loot||{},id)&&!adv.gifts?.[id]){
                    const rule=node.loot[id];
                    const allowed=typeof rule==='number'?rule>0:rule&&rule.p>0&&
                        sourceAvailable(s,{...rule,ch:adv.chapter},id)&&(!rule.skies||rule.skies.includes(nodeWeather(s,adv.chapter,node)));
                    if(allowed)kind=rule?.eggs?'目标掉落池（蛋数条件待确认）':'目标掉落池';
                }
                else if(!node.find&&(kinds.has('route')||kinds.has('stone')))kind='普通道具池';
            }
            if(kind)points.push({index,kind});
        });
        return points;
    }
    // Native intake is account-wide. Only associate a receipt with a point when
    // exactly that point was crossed and no purchase or competing task intervened.
    class ItemRoundTracker {
        constructor(){this.round=null;}
        observe(s,engine){
            const adv=s?.adv,cfg=engine.settings;
            if(!adv||!engine.running||cfg.mode!=='item'||engine.account!==accountId(s)||
                engine.manual||engine.suspended||engine.preparation||adv.zone||adv.event||adv.tower||adv.league){
                this.round=null;return;
            }
            const id=cfg.itemId,index=adv.node;
            if(!Number.isSafeInteger(index)||!Array.isArray(adv.nodes)){this.round=null;return;}
            const key=JSON.stringify([accountId(s),id,engine.runId,adv.chapter,adv.runs||0]);
            const count=itemCounter(s,id),ledger=!!itemLedger(s),spent=routeExpenseSignature(s);
            let r=this.round;
            if(!r||r.key!==key||index<r.index||count<r.count||r.ledger!==ledger){
                r=this.round={key,id,index,count,ledger,spent,points:itemPoints(s,id),observed:0,partial:index>0};
            }else if(count>r.count&&spent===r.spent){
                r.observed+=count-r.count;
                if(index===r.index+1){
                    const point=r.points?.find(p=>p.index===r.index);
                    if(point)point.gained=(point.gained||0)+count-r.count;
                }
            }
            r.index=index;r.count=count;r.spent=spent;
        }
    }

    function expeditionReward(entry){
        if(!entry||typeof entry!=='object')return null;
        switch(entry.k){
            case 'money': case 'shards':
                return Number.isSafeInteger(entry.n)&&entry.n>0?{name:entry.k==='money'?'金币':'碎片',n:entry.n}:null;
            case 'geode':return GEODE_TIERS[entry.t]?{name:GEODE_TIERS[entry.t]+'晶洞',n:1}:null;
            case 'item':return typeof entry.id==='string'?{name:ITEMS.get(entry.id)?.name||entry.id,n:1}:null;
            case 'plate':return DATA.types[entry.type]?{name:DATA.types[entry.type].fr+'石板（重复可能折算）',n:1}:null;
            case 'fossil':return MONS.has(entry.id)?{name:MONS.get(entry.id).name+'化石',n:1}:null;
            default:return null;
        }
    }
    function expeditionPreview(slot,now=Date.now()){
        const res=slot?.res,from=slot?.from??1,floors=res?.floors;
        if(!res||!Array.isArray(res.at)||!Array.isArray(res.loot))return {error:'缺少本次派遣的逐层时间或掉落记录'};
        if(!Number.isSafeInteger(floors)||floors<0||floors>GEODE_RULES.maxFloors||
            !Number.isSafeInteger(from)||from<1||!Number.isFinite(slot.start)||!Number.isFinite(slot.end)||
            slot.end<slot.start||res.at.length<floors||res.loot.length<floors)return {error:'层数、时间或掉落记录不完整'};
        const time=Number.isFinite(slot.recalled)?slot.recalled:now,arrived=slot.recalled==null&&time>=slot.end;
        const rows=[],earned=new Map(),planned=new Map();
        let previous=-1,current=from-1;
        for(let i=from-1;i<floors;i++){
            const tick=res.at[i];
            if(!Number.isFinite(tick)||tick<0||tick<previous||!Array.isArray(res.loot[i]))return {error:'逐层时间或掉落格式无法识别'};
            previous=tick;
            const at=slot.start+tick*GEODE_RULES.stepMs,reached=arrived||at<=time;
            if(reached)current=i+1;
            const loot=res.loot[i].map(expeditionReward).filter(Boolean);
            if(slot.recalled!=null&&!reached)break;
            for(const reward of loot){
                planned.set(reward.name,(planned.get(reward.name)||0)+reward.n);
                if(reached)earned.set(reward.name,(earned.get(reward.name)||0)+reward.n);
            }
            rows.push({floor:i+1,at,reached,loot});
        }
        return {current,from,floors,rows,earned:[...earned],planned:[...planned],recalled:slot.recalled!=null};
    }
    function geodePreview(s,tier,horizon,build){
        if(build!==GEODE_RULES.build&&build!==GEODE_RULES.bundle)return {error:'当前游戏构建尚未核对晶洞公式'};
        const seed=nurserySeed(s),opened=s?.under?.opened?.[tier]??0;
        if(!s?.adv||!s.under||!seed)return {error:'缺少地下记录或训练师标识'};
        if(!Number.isInteger(tier)||tier<0||tier>3||!Number.isSafeInteger(opened)||opened<0||
            !Number.isSafeInteger(horizon)||horizon<1||horizon>48||!Number.isSafeInteger(opened+horizon))return {error:'晶洞档位、范围或开启计数无效'};
        let regions=GEODE_RULES.regions.filter(r=>s.adv.unlocked>r.last||r.badges.some(b=>s.adv.badges?.includes(b)));
        if(!regions.length)regions=GEODE_RULES.regions.filter(r=>r.open&&s.adv.unlocked>=r.first);
        const sets=Array.from({length:4},(_,t)=>new Set(regions.flatMap(r=>r.pools[t])));
        const addPlate=mon=>{for(const type of GEODE_RULES.plates[mon?.id]||[])sets[3].add(type);};
        for(const mon of s.mons||[])addPlate(mon);
        for(const row of s.pension?.mons||[])addPlate(row?.mon);
        for(const slot of s.under.slots||[])for(const mon of slot.mons||[])addPlate(mon);
        const pools=sets.map(set=>[...set]),rows=[];
        for(let offset=0;offset<horizon;offset++){
            const roll=sub=>nurseryHash(seed+'|geode'+tier+'|'+(opened+offset)+'|'+sub);
            let upgraded=tier;
            while(upgraded<3&&roll(upgraded)<GEODE_RULES.upgrade[upgraded])upgraded++;
            let pool=upgraded;
            while(pool>0&&!pools[pool].length)pool--;
            if(!pools[pool].length)return {error:'该账号还没有可用的宝石池'};
            const type=pools[pool][Math.floor(roll(9)*pools[pool].length)];
            rows.push({offset:offset+1,upgraded,key:type+':'+pool,type});
        }
        return {opened,rows};
    }

    // Keep each day's pre-draw prediction and actual result together. A draw first
    // observed after reroll is a history sample, never a retrospective prediction.
    function raidHistoryEstimate(rows,from,pool,day){
        const history=rows.filter(r=>r.day<day&&r.from===from&&r.to&&JSON.stringify(r.pool)===JSON.stringify(pool));
        const votes=new Map();
        for(const past of history)votes.set(past.to,(votes.get(past.to)||0)+1);
        const ranked=[...votes].sort((a,b)=>b[1]-a[1]);
        const trials={recent:history.at(-1)?.to??null,
            frequent:ranked.length&&ranked[0][1]>(ranked[1]?.[1]||0)?ranked[0][0]:null};
        const surviving=Object.entries(trials).filter(([rule,value])=>value&&
            !history.some(r=>r.trials?.[rule]&&r.trials[rule]!==r.to));
        const estimates=new Set(surviving.map(([,value])=>value));
        return {trials,predicted:estimates.size===1?[...estimates][0]:null};
    }
    class RaidRerollLedger {
        constructor(storage){this.storage=storage;this.rows=[];}
        load(account){
            this.key=PREFIX+'raid-observations:'+encodeURIComponent(account);
            this.signature=null;this.rows=[];this.rows=this.read();
        }
        read(){
            try{
                const value=JSON.parse(this.storage.getItem(this.key)||'[]');
                return Array.isArray(value)?value.filter(r=>r&&typeof r.day==='string'&&Array.isArray(r.pool)&&r.pool.includes(r.from)).slice(-60):[];
            }catch{return this.rows;}
        }
        observe(s,draw,now=Date.now()){
            const account=accountId(s),day=parisDay(now);
            if(this.account!==account){this.account=account;this.load(account);}
            const pool=RAID_CHAMPIONS.filter(c=>s.adv.unlocked>c.id||c.badges.some(b=>s.adv.badges?.includes(b))).map(c=>c.reg);
            const roll=s.raids?.reroll?.day===day?s.raids.reroll:null;
            const from=roll?.from||(s.raids?.seen===day&&draw?.day===day&&!draw.reroll?draw.reg:null);
            const signature=JSON.stringify([day,pool,from,roll?.to]);
            if(signature===this.signature)return this.snapshot;
            this.signature=signature;
            this.rows=this.read();
            let row=this.rows.find(r=>r.day===day);
            const currentFrom=from||row?.from;
            const candidates=pool.filter(reg=>reg!==currentFrom);
            if(pool.includes(from)&&(!roll||candidates.includes(roll.to))){
                if(!row){
                    const estimate=raidHistoryEstimate(this.rows,from,pool,day);
                    const predicted=roll?null:candidates.length===1?candidates[0]:estimate.predicted;
                    row={day,pool,from,predicted,trials:roll?{}:estimate.trials,to:roll?.to||null};
                    this.rows.push(row);
                }else if(roll&&row.from===from)row.to=roll.to;
                this.rows=this.rows.sort((a,b)=>a.day.localeCompare(b.day)).slice(-60);
                try{
                    const serialized=JSON.stringify(this.rows);
                    if(this.storage.getItem(this.key)!==serialized)this.storage.setItem(this.key,serialized);
                }catch{this.signature=null;}
            }
            const actual=this.rows.filter(r=>r.to),scored=actual.filter(r=>r.predicted);
            this.snapshot={day,from:currentFrom,pool,candidates:currentFrom?candidates:[],row,
                history:actual.slice(-8).reverse(),hits:scored.filter(r=>r.predicted===r.to).length,attempts:scored.length};
            return this.snapshot;
        }
    }

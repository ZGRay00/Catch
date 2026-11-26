    function shinyRanking(s,settings,cooldowns={},now=Date.now()){
        const targets=missingShinies(s,settings);
        return rankedRoutes('shiny',[settings.speed,huntRankingInputs(s,settings,targets,now)],
            ()=>rankShinyTargets(s,settings,targets,now),cooldowns,now);
    }
    function rankShinyTargets(s,settings,targets,now){
        const phenomena=targets.filter(id=>UNOVA_WILD_IDS.has(id)).flatMap(id=>unovaAcquisitionSources(s,id,now,true,true)).filter(source=>source.kind==='phenomenon'&&source.available);
        return candidates(s,settings).filter(row=>huntRouteMatches(s,settings,row,now)).map(row=>{
            const members=row.members;
            const sources=phenomena.filter(source=>members.includes(source.chapter));
            let rotomWild=false;
            const ordinary=members.reduce((n,id)=>{
                const pool=currentWildPool(s,id,now);
                for(const target of targets){
                    const weight=pool.get(target)||0;
                    if(weight&&ROTOM_BY_ID.has(target))rotomWild=true;
                    n+=weight;
                }
                return n;
            },0);
            const expected=ordinary+sources.reduce((n,source)=>n+source.weight,0);
            return{...row,expected,rotomWild,specialNodesOnly:ordinary===0,marked:sources.some(source=>source.marked),rate:expected/estimatedRouteSeconds(row,settings.speed)*60};
        }).filter(row=>row.expected>0).sort((a,b)=>Number(b.marked)-Number(a.marked)||b.rate-a.rate);
    }
    function pensionPlan(s,id,shinyGoal=false){
        const residents=(s.pension?.mons||[]).map(x=>x?.mon).filter(Boolean),protectedUids=new Set([...(s.team||[]),...(s.road||[])]);
        const eligible=(s.mons||[]).filter(m=>!protectedUids.has(m.uid));
        const singles=new Set(),parents=[...residents,...eligible].filter(m=>breedableOffspring(s,m)===id).sort((a,b)=>Number(!!b.shiny)-Number(!!a.shiny)||b.level-a.level).filter(m=>{const key=DATA.combat.singles[m.id];if(!key)return true;if(singles.has(key))return false;singles.add(key);return true;});
        const ditto=residents.find(m=>m.id===132)||eligible.find(m=>m.id===132);
        const shinyParents=shinyGoal?parents.filter(m=>m.shiny===true||m.shiny===1):[];
        const preferred=shinyParents.length?shinyParents:parents;
        return{residents,ditto,parents,desired:ditto&&preferred.length?[ditto,...preferred.slice(0,3)]:[],missing:!ditto?'需要一只可寄养的百变怪':!parents.length?'没有可寄养的对应亲本；请先从冒险队伍移出亲本':null};
    }
    function parsePrice(text){
        const parts=String(text??'').normalize('NFKC').trim().split('₽');
        if(parts.length>2||parts.length===2&&/\d/.test(parts[1]))return null;
        // Native shop totals are localized integers. A slot-unlock button also has a translated label.
        // With a currency marker, use the amount directly before it, even if the label contains a quantity.
        const raw=parts[0].trim(),match=/(\d[\d., ]*?)\s*([kmb万亿]?)$/i.exec(raw);
        if(!match||parts.length===1&&match.index!==0||/[\d.,+−-]\s*$/.test(raw.slice(0,match.index)))return null;
        const token=match[1].trim(),suffix=match[2].toLowerCase();
        const factor=({k:1e3,m:1e6,b:1e9,'万':1e4,'亿':1e8})[suffix]||1;
        let numeric;
        if(suffix&&/^(?:\d+|\d{1,3}(?:,\d{3})+)\.\d+$/.test(token)){
            numeric=token.replace(/,/g,'');
        }else if(/^\d+$/.test(token)||/^\d{1,3}([., ])\d{3}(?:\1\d{3})*$/.test(token)){
            numeric=token.replace(/[., ]/g,'');
        }else if(suffix&&/^\d+[,.]\d{1,2}$/.test(token)){
            numeric=token.replace(',','.');
        }else return null;
        const value=Math.ceil(Number(numeric)*factor);
        return Number.isSafeInteger(value)?value:null;
    }
    function queueJobPending(job){return job.status!=='done'&&job.status!=='skipped';}
    function queueItemAcquired(job,s,session){
        if(!session&&Number.isSafeInteger(job.itemAcquired))return job.itemAcquired;
        if(!session&&!queueJobPending(job))return null; // Older finished jobs did not keep their counters.
        const baseline=session||job.progress?.session,id=job.settings.itemId;
        if(!Number.isFinite(baseline?.startItems)||baseline.sessionItemId&&baseline.sessionItemId!==id)return 0;
        return s?.adv?Math.max(0,itemCounter(s,id)-baseline.startItems):null;
    }
    function normalizeJobs(raw) {
        const jobs = [], ids = new Set();
        for (const row of Array.isArray(raw) ? raw.slice(0, 50) : []) {
            if (!Object.hasOwn(MODE_NAMES, row?.settings?.mode)) continue;
            let suffix = jobs.length, id = String(row.id || `job-${suffix}`).slice(0,100);
            while (ids.has(id)) id = `job-${++suffix}`;
            ids.add(id);
            jobs.push({id, title:String(row.title || MODE_NAMES[row.settings.mode]).slice(0,80),
                settings:normalizeSettings(row.settings), status:['done','skipped','failed','running','paused','pending'].includes(row.status) ? row.status : 'pending',
                result:String(row.result || '').slice(0,200),
                ...(row.settings.mode==='item'&&Number.isSafeInteger(row.itemAcquired)&&row.itemAcquired>=0?{itemAcquired:row.itemAcquired}:{}),
                ...(row.progress && typeof row.progress === 'object' && !Array.isArray(row.progress) ? {progress:row.progress} : {})});
        }
        return jobs;
    }
    function configurationProfile(engine){
        return{format:'pokecatch-helper-profile',schema:1,version:VERSION,settings:normalizeSettings(engine.settings),
            queue:normalizeJobs(engine.editableQueue?.()??engine.queue).map(job=>({id:job.id,title:job.title,settings:job.settings,status:'pending',result:''}))};
    }
    function parseConfigurationProfile(input){
        if(typeof input==='string'){if(input.length>2*1024*1024)throw new Error('配置文件超过2MB');input=JSON.parse(input.replace(/^\uFEFF/,''));}
        if(!input||input.format!=='pokecatch-helper-profile'||input.schema!==1||!Object.hasOwn(MODE_NAMES,input.settings?.mode))throw new Error('不是支持的助手配置文件');
        if(!Array.isArray(input.queue)||input.queue.length>50||input.queue.some(job=>!Object.hasOwn(MODE_NAMES,job?.settings?.mode)))throw new Error('任务队列格式无效或超过50项');
        const budgets = [input.settings, ...input.queue.map(job => job.settings)];
        const labels = {spendBudget:'每个任务的支出上限', dailySpendBudget:'每日支出上限', moneyReserve:'金币保留额', useBudget:'每个任务的道具使用上限'};
        for (const [index,settings] of budgets.entries()) {
            for (const key of Object.keys(BUDGET_LIMITS)) {
                if (Object.hasOwn(settings,key) && budgetAmount(key,settings[key]) === null) {
                    throw new Error(`${index ? '队列第 '+index+' 项' : '当前任务'}的${labels[key]}无效，请填写 0 至 ${BUDGET_LIMITS[key]} 的整数`);
                }
            }
        }
        return configurationProfile({settings:input.settings,queue:input.queue});
    }
    function importConfigurationProfile(engine,input){
        if(engine.running||engine.suspended)throw new Error('请先停止助手，再导入配置');
        if(!engine.account)throw new Error('请先进入游戏，再导入账号配置');
        const state=engine.read();
        if(!state?.adv||accountId(state)!==engine.account||state.adv.layout!==DATA.layout)throw new Error('当前账号或存档版本已变化，请刷新页面后导入');
        if(!engine.mayPersist())throw new Error('另一个标签页正在管理当前账号，暂不能导入');
        const profile=parseConfigurationProfile(input);
        engine.refreshQueueEdits();
        const before={settings:engine.settings,queue:engine.queue,queueIndex:engine.queueIndex,queueRunning:engine.queueRunning,checkpoint:engine.checkpoint,
            appliedQueueEdits:new Set(engine.appliedQueueEdits),queueEdits:engine.queueEdits};
        try{
            engine.applyQueueEdits();
            engine.settings=engine.taskSettings(profile.settings);engine.queue=profile.queue;engine.queueIndex=0;engine.queueRunning=false;engine.checkpoint=null;
            if(engine.persist(false,false)===false)throw new Error('另一个标签页已接管，配置未导入');
        }catch(err){Object.assign(engine,before);throw err;}
        engine.teamCheck=null;engine.target=null;engine.visit=null;engine.preparation=null;engine.raidPreparation=null;
        engine.status=`配置已导入 · ${profile.queue.length}项待执行任务；点击开始后运行`;engine.log(engine.status);return profile;
    }
    function shinyOdds(s,options={},now=Date.now()){
        const kind=options.kind||'wild';
        if(kind==='egg'){
            const egg=options.egg||{};
            if(Object.hasOwn(egg,'shiny')){
                if(!nurseryFlag(egg.shiny))return{kind,rate:null,known:false,reason:'存档闪色标记待核对'};
                return{kind,rate:egg.shiny?1:0,known:true,reason:'该蛋已保存闪色标记'};
            }
            return{kind,rate:nurseryEggRate(egg),known:false,reason:'产蛋概率由亲本和靛莓果决定'};
        }
        if(['legend','roam'].includes(kind))return{kind,rate:0,known:true,reason:'普通传说与游荡遭遇固定为普通色'};
        if(kind==='raid')return{kind,rate:1,known:true,reason:'每日异色团体战目标固定异色，捕获率另计'};
        const region=options.region||currentRegion(s),entry=DATA.regions.find(row=>row.key===region),range=entry?.dexRange;
        const complete=!!range&&DATA.mons.filter(mon=>mon.id>=range[0]&&mon.id<=range[1]).every(mon=>!!s?.dex?.[mon.id]);
        const multiplier=activeYieldBuff(s,'shiny',now)?.mult||1;
        const rate=Math.min(1,1/2048*(complete?2:1)*(kind==='wild'?multiplier:1));
        return{kind,rate,known:false,region,complete,multiplier:kind==='wild'?multiplier:1,reason:kind==='underground'?'仅指地下化石结算机会，不是每一层':'野外遭遇概率，不等于最终捕获概率'};
    }
    class Budget{
        constructor(engine,saved){
            this.e=engine;
            // Legacy checkpoints contain a cumulative reservation. Honor it for
            // the interrupted job; subsequent fresh jobs have no saved charges.
            this.spent=clamp(saved?.spent,0,BUDGET_LIMITS.spendBudget,0);
            this.used=clamp(saved?.used,0,999999,0);
        }
        purchaseBlock(cost=null){
            const cfg=this.e.settings;
            if((this.e.refreshAutoPurchase?.() ?? cfg.autoPurchase)===false)return'自动购买已关闭';
            if(cfg.spendBudget===0)return'当前任务采购预算为 0';
            const left=Math.max(0,cfg.spendBudget-this.spent);
            if(cost===null)return left===0?'当前任务采购预算已用尽':null;
            if(cost>left)return Budget.shortfall('当前任务采购预算不足',cost,cost-left);
            return null;
        }
        static shortfall(reason,cost,gap){
            return reason+'（本笔 '+cost.toLocaleString('zh-CN')+' ₽，还差 '+gap.toLocaleString('zh-CN')+' ₽）';
        }
        purchaseSummary(s) {
            const e = this.e, cfg = e.settings;
            const enabled = (e.refreshAutoPurchase?.() ?? cfg.autoPurchase) !== false;
            const active=e.running||e.suspended;
            const taskLeft=Math.max(0,cfg.spendBudget-(active?this.spent:0));
            const usesLeft=Math.max(0,cfg.useBudget-(active?this.used:0));
            const sameAccount = !!e.account && !!s && accountId(s) === e.account;
            const wallet = sameAccount ? Budget.counter(s.money) : null;
            const walletLeft = wallet === null ? null : Math.max(0, wallet - cfg.moneyReserve);
            const day = sameAccount ? this.day() : null;
            const dailyLeft = cfg.dailySpendBudget && day && !day.invalid ? Math.max(0, cfg.dailySpendBudget - day.spent) : null;
            let reason = null, available = null;
            if (!enabled || taskLeft === 0) {
                available = 0;
                reason = !enabled ? '自动购买已关闭' : cfg.spendBudget ? '当前任务采购预算已用尽' : '当前任务采购预算为 0';
            } else if (walletLeft === null) {
                reason = '当前地区金币余额无法确认';
            } else if (day.invalid) {
                reason = '每日消费记录不可识别，已暂停采购';
            } else {
                available = Math.min(taskLeft, walletLeft, dailyLeft ?? Infinity);
                if (available === 0) reason = walletLeft === 0 ? '当前余额已达金币保留额' : '达到每日金币消费上限';
            }
            return {enabled, available, taskLeft, usesLeft, dailyLeft, walletLeft, reason};
        }
        check(s,cost=0,uses=0){
            const cfg=this.e.settings;if(!Number.isSafeInteger(cost)||cost<0)return'无法确认价格，未执行消费';
            if(!Number.isSafeInteger(uses)||uses<0)return'无法确认道具使用份数';
            if(uses>0&&this.used+uses>cfg.useBudget)return'达到当前任务道具使用上限';
            if(cost>0){
                const blocked=this.purchaseBlock(cost);if(blocked)return blocked;
                const wallet=Budget.counter(s.money);
                if(wallet===null)return'当前地区金币余额无法确认';
                if(wallet-cost<cfg.moneyReserve)return Budget.shortfall('消费后低于金币保留额',cost,cfg.moneyReserve+cost-wallet);
                const day=this.day();if(day.invalid)return'每日消费记录不可识别，已暂停采购';
                if(cfg.dailySpendBudget&&day.spent+cost>cfg.dailySpendBudget)return Budget.shortfall('达到每日金币消费上限',cost,day.spent+cost-cfg.dailySpendBudget);
            }return null;
        }
        static counter(value){
            if(typeof value==='string'&&/^\d+$/.test(value))value=Number(value);
            return Number.isSafeInteger(value)&&value>=0?value:null;
        }
        dayKey(){return PREFIX+'budget:'+this.e.account+':'+parisDay();}
        day(key=this.dayKey()){
            try{
                const raw=this.e.storage.getItem(key);
                if(raw===null)return{spent:0};
                const spent=Budget.counter(JSON.parse(raw)?.spent);
                if(spent!==null)return{spent};
            }catch{}
            return{spent:0,invalid:true};
        }
        charge(cost=0,uses=0){
            const key=cost?this.dayKey():null;
            if(key){
                const blocked=this.purchaseBlock(cost);if(blocked)throw new Error(blocked);
                const day=this.day(key);
                if(day.invalid)throw new Error('每日消费记录不可识别，未执行消费');
                if(this.e.settings.dailySpendBudget&&day.spent+cost>this.e.settings.dailySpendBudget)throw new Error('达到每日金币消费上限');
                this.e.storage.setItem(key,JSON.stringify({spent:day.spent+cost}));
            }
            this.spent+=cost;this.used+=uses;
            return{key,cost,uses};
        }
        cancelReservation({key,cost,uses}){
            if(key){
                const day=this.day(key);
                if(day.invalid||day.spent<cost)throw new Error('每日消费记录发生变化，无法撤销预留');
                this.e.storage.setItem(key,JSON.stringify({spent:day.spent-cost}));
            }
            this.spent-=cost;this.used-=uses;
        }
    }
    function currentRegion(s) { return CHAPTERS.get(s?.adv?.chapter)?.reg || 'kanto'; }
    function combinedWalletMoney(s){
        if(!Number.isFinite(s.money)||s.money<0)return null;
        if(!s.link)return s.money;
        const other=s.link.stash?.money;
        return Number.isFinite(other)&&other>=0?s.money+other:null;
    }
    function economicRegion(s){
        if(s.link?.side==='from'&&DATA.regions.some(r=>r.key===s.link.from))return s.link.from;
        const open=new Set(['kanto',...(s.travel?.to||[]),s.link?.to,currentRegion(s)]);
        return DATA.regions.filter(r=>r.start<=(s.adv?.unlocked||0)&&open.has(r.key)).at(-1)?.key||'kanto';
    }
    function moneyFactor(s,row){
        const current=DATA.regions.findIndex(r=>r.key===economicRegion(s)),map=DATA.regions.findIndex(r=>r.key===row.reg);
        const gap=current-map;return gap>0?(DATA.economy.behindMoney[Math.min(gap,DATA.economy.behindMoney.length)-1]??1):1;
    }
    function phaseAt(s, now = Date.now(), chapter = s?.adv?.chapter) {
        const c = CHAPTERS.get(chapter);
        if (c?.day && s.adv.unlocked <= c.id) return 'day';
        const hour = new Date(now).getHours();
        return hour < 8 || hour >= 20 ? 'night' : hour < 10 ? 'morning' : 'day';
    }
    function weatherHash(value) {
        let n=2166136261;
        for(const letter of value)n=Math.imul(n^letter.charCodeAt(0),16777619);
        n^=n>>>16;n=Math.imul(n,2246822507);n^=n>>>13;n=Math.imul(n,3266489909);n^=n>>>16;
        return(n>>>0)/4294967296;
    }
    const SEASON_KEYS=['spring','summer','autumn','winter'];
    const SEASON_NAMES={spring:'春季',summer:'夏季',autumn:'秋季',winter:'冬季'};
    function seasonBlock(now) {
        const date=new Date(now);
        return Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/(3*86400000));
    }
    function weatherSeason(now=Date.now()) {
        return SEASON_KEYS[((seasonBlock(now)%4)+4)%4];
    }
    function seasonWindow(now=Date.now()) {
        const block=seasonBlock(now),index=((block%4)+4)%4;
        const key=SEASON_KEYS[index],nextKey=SEASON_KEYS[(index+1)%4];
        // Native seasons count local calendar days. Across a clock change their elapsed length varies.
        function midnight(b) {
            const d=new Date(b*3*86400000);
            return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()).getTime();
        }
        return {key,name:SEASON_NAMES[key],nextKey,nextName:SEASON_NAMES[nextKey],startsAt:midnight(block),endsAt:midnight(block+1)};
    }
    function seasonFormProgress(s,id) {
        const species=MONS.get(id)?.num??id;
        if(species!==585&&species!==586)return null;
        const owned=new Set(collectionMembers(s).map(mon=>mon.id));
        const legacySightings=Array.isArray(s.seasons?.[species])?s.seasons[species]:[];
        const forms=SEASON_KEYS.map((season,index)=>{
            const formId=index===0?species:species*100+index,registered=captured(s,formId,owned);
            return {id:formId,season,caught:registered,seen:registered||Number(s.dex?.[formId]?.seen)>0||
                legacySightings.includes(season)};
        });
        return {forms,seen:forms.filter(form=>form.seen).map(form=>form.season),
            missing:forms.filter(form=>!form.caught).map(form=>form.season)};
    }
    const WEATHER_SPOT_CACHE = new WeakMap();
    function weatherDailySpot(spot,now=Date.now()) {
        const day=Math.floor(Date.parse(parisDay(now)+'T00:00:00Z')/86400000),start=spot.rare&&Math.floor(Date.parse(spot.from)/86400000);
        if(!spot.rare||day<start)return spot.zones[(Math.imul(day,2654435761)>>>0)%spot.zones.length];
        if(!Number.isFinite(start)||day-start>36600)return null;
        let state=WEATHER_SPOT_CACHE.get(spot);
        if(!state){state={days:[],low:spot.gap[0],high:spot.gap[1],common:spot.zones.filter(zone=>!spot.rare.some(group=>group.includes(zone))),round:[],seen:0,at:spot.rare.map(()=>0),next:spot.rare.map((_,i)=>start+2+i*3)};WEATHER_SPOT_CACHE.set(spot,state);}
        const roll=n=>{n=Math.imul(n^n>>>16,2146121005);n=Math.imul(n^n>>>15,2221713035);return((n^n>>>16)>>>0)/4294967296;};
        while(state.days.length<=day-start){
            const current=start+state.days.length,index=state.next.indexOf(current);
            if(index>=0){const group=spot.rare[index],count=state.at[index]++;state.days.push(group[count%group.length]);let next=current+state.low+Math.floor(roll(index*7919+count*104729+1)*(state.high-state.low+1));if(state.next.includes(next))next+=next-current<state.high?1:-1;state.next[index]=next;}
            else{
                if(!state.round.length){const cycle=Math.floor(state.seen/state.common.length),round=[...state.common];for(let i=round.length-1;i>0;i--){const j=Math.floor(roll(cycle*31337+i*7+2)*(i+1));[round[i],round[j]]=[round[j],round[i]];}if(round[0]===state.days.at(-1))[round[0],round[1]]=[round[1],round[0]];state.round=round;}
                state.seen++;state.days.push(state.round.shift());
            }
        }
        return state.days[day-start];
    }
    function chapterWeather(s, chapter = s?.adv?.chapter, now = Date.now()) {
        const data=WEATHER_DATA.chapters[chapter];
        if(!data)return{key:null,known:false,source:'unknown',at:now};
        const slot=Math.floor(now/WEATHER_DATA.slotMs),at=slot*WEATHER_DATA.slotMs;
        if(data.fixed){const keys=Array.isArray(data.fixed)?data.fixed:[data.fixed];return{key:keys[((slot%keys.length)+keys.length)%keys.length]||null,known:true,source:'fixed',at};}
        const roaming=Object.entries(s.roam?.at||{}).find(([id,row])=>row?.ch===chapter&&Number(row.until)>now&&!s.roam?.caught?.includes(+id)&&WEATHER_DATA.roamingWeather[id]);
        if(roaming)return{key:WEATHER_DATA.roamingWeather[roaming[0]],known:true,source:'roaming',at,until:Number(roaming[1].until)};
        return {key:naturalWeatherKey('ch'+chapter,data.weights,slot,phaseAt(s,now,chapter)==='night'),known:true,source:'natural',at};
    }
    function naturalWeatherKey(seed,climate,slot,night){
        if(!climate)return null;
        let flips=0;
        while(flips<64&&weatherHash(seed+'|'+(slot-flips))<WEATHER_DATA.chance)flips++;
        if(flips%2===0)return null;
        const weights=Object.entries(climate).filter(([key])=>!(night&&WEATHER_DATA.types[key]?.daylight));
        if(!weights.length)return null;
        let roll=weatherHash(slot+'|'+seed)*weights.reduce((sum,[,n])=>sum+n,0),key=weights[0][0];
        for(const [candidate,weight]of weights)if((roll-=weight)<=0){key=candidate;break;}
        return key;
    }

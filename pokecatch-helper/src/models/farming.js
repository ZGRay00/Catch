    function shinyRanking(s,settings,cooldowns={},now=Date.now()){
        const target=settings.shinyId;
        const phenomena=unovaAcquisitionSources(s,target,now).filter(source=>source.kind==='phenomenon'&&source.available);
        return candidates(s,settings).filter(row=>(cooldowns[row.key]||0)<=now).map(row=>{
            const expected=row.members.reduce((n,id)=>n+(currentWildPool(s,id,now).get(target)||0),0)
                +phenomena.filter(source=>row.members.includes(source.chapter)).reduce((n,source)=>n+source.weight,0);
            return{...row,expected,rate:expected/Math.max(20,row.units*2.8/2.5)*60};
        }).filter(row=>row.expected>0).sort((a,b)=>b.rate-a.rate);
    }
    function pensionPlan(s,id){
        const residents=(s.pension?.mons||[]).map(x=>x?.mon).filter(Boolean),protectedUids=new Set([...(s.team||[]),...(s.road||[])]);
        const eligible=(s.mons||[]).filter(m=>!protectedUids.has(m.uid));
        const singles=new Set(),parents=[...residents,...eligible].filter(m=>breedableOffspring(s,m)===id).sort((a,b)=>Number(!!b.shiny)-Number(!!a.shiny)||b.level-a.level).filter(m=>{const key=DATA.combat.singles[m.id];if(!key)return true;if(singles.has(key))return false;singles.add(key);return true;});
        const ditto=residents.find(m=>m.id===132)||eligible.find(m=>m.id===132);
        return{residents,ditto,parents,desired:ditto&&parents.length?[ditto,...parents.slice(0,3)]:[],missing:!ditto?'需要一只可寄养的百变怪':!parents.length?'没有可寄养的对应亲本；请先从冒险队伍移出亲本':null};
    }
    function parsePrice(text){
        const str=String(text||'').trim(),match=str.match(/([\d][\d\s\u00a0\u202f,.]*)([kKmMbB万亿]?)/);if(!match)return null;
        const factor=({k:1e3,m:1e6,b:1e9,'万':1e4,'亿':1e8})[match[2].toLowerCase()]||1;
        const raw=match[1].replace(/[\s\u00a0\u202f]/g,'');const decimalComma=!raw.includes('.')&&/,\d{1,2}$/.test(raw);
        const n=factor===1?Number(raw.replace(/[,.]/g,'')):Number(decimalComma?raw.replace(',','.'):raw.replace(/,/g,''));
        return Number.isFinite(n)&&n>=0?Math.ceil(n*factor):null;
    }
    function normalizeJobs(raw) {
        const jobs = [], ids = new Set();
        for (const row of Array.isArray(raw) ? raw.slice(0, 50) : []) {
            if (!Object.hasOwn(MODE_NAMES, row?.settings?.mode)) continue;
            let suffix = jobs.length, id = String(row.id || `job-${suffix}`).slice(0,100);
            while (ids.has(id)) id = `job-${++suffix}`;
            ids.add(id);
            jobs.push({id, title:String(row.title || MODE_NAMES[row.settings.mode]).slice(0,80),
                settings:normalizeSettings(row.settings), status:['done','failed','running','pending'].includes(row.status) ? row.status : 'pending',
                result:String(row.result || '').slice(0,200),
                ...(row.progress && typeof row.progress === 'object' && !Array.isArray(row.progress) ? {progress:row.progress} : {})});
        }
        return jobs;
    }
    function configurationProfile(engine){
        return{format:'pokecatch-helper-profile',schema:1,version:VERSION,settings:normalizeSettings(engine.settings),
            queue:normalizeJobs(engine.queue).map(job=>({id:job.id,title:job.title,settings:job.settings,status:'pending',result:''}))};
    }
    function parseConfigurationProfile(input){
        if(typeof input==='string'){if(input.length>2*1024*1024)throw new Error('配置文件超过2MB');input=JSON.parse(input.replace(/^\uFEFF/,''));}
        if(!input||input.format!=='pokecatch-helper-profile'||input.schema!==1||!Object.hasOwn(MODE_NAMES,input.settings?.mode))throw new Error('不是支持的助手配置文件');
        if(!Array.isArray(input.queue)||input.queue.length>50||input.queue.some(job=>!Object.hasOwn(MODE_NAMES,job?.settings?.mode)))throw new Error('任务队列格式无效或超过50项');
        return configurationProfile({settings:input.settings,queue:input.queue});
    }
    function importConfigurationProfile(engine,input){
        if(engine.running||engine.suspended)throw new Error('请先停止助手，再导入配置');
        if(!engine.account)throw new Error('请先进入游戏，再导入账号配置');
        const state=engine.read();
        if(!state?.adv||accountId(state)!==engine.account||state.adv.layout!==DATA.layout)throw new Error('当前账号或存档版本已变化，请刷新页面后导入');
        if(!engine.mayPersist())throw new Error('另一个标签页正在管理当前账号，暂不能导入');
        const profile=parseConfigurationProfile(input),before={settings:engine.settings,queue:engine.queue,queueIndex:engine.queueIndex,queueRunning:engine.queueRunning,checkpoint:engine.checkpoint};
        try{
            engine.settings=profile.settings;engine.queue=profile.queue;engine.queueIndex=0;engine.queueRunning=false;engine.checkpoint=null;
            if(engine.persist(false,false)===false)throw new Error('另一个标签页已接管，配置未导入');
        }catch(err){Object.assign(engine,before);throw err;}
        engine.teamCheck=null;engine.target=null;engine.visit=null;engine.preparation=null;engine.raidPreparation=null;
        engine.status=`配置已导入 · ${profile.queue.length}项待执行任务；点击开始后运行`;engine.log(engine.status);return profile;
    }
    function shinyOdds(s,options={},now=Date.now()){
        const kind=options.kind||'wild',region=options.region||currentRegion(s),entry=DATA.regions.find(row=>row.key===region),range=entry?.dexRange;
        const complete=!!range&&DATA.mons.filter(mon=>mon.id>=range[0]&&mon.id<=range[1]).every(mon=>!!s?.dex?.[mon.id]);
        const multiplier=activeYieldBuff(s,'shiny',now)?.mult||1;
        if(kind==='egg'){
            const egg=options.egg||{};
            if(Object.hasOwn(egg,'shiny'))return{kind,rate:egg.shiny?1:0,known:true,reason:'该旧蛋已保存异色标记'};
            const parent=egg.sp?(Number(egg.sp)===2?1/16:.1):0;
            return{kind,rate:Math.min(1,Math.max(1/512,parent)*(egg.bx?2:1)),known:false,reason:'蛋独立概率；不受地区图鉴或野外树果加成'};
        }
        if(['legend','roam'].includes(kind))return{kind,rate:0,known:true,reason:'普通传说与游荡遭遇固定为普通色'};
        if(kind==='raid')return{kind,rate:1,known:true,reason:'每日异色团体战目标固定异色，捕获率另计'};
        const rate=Math.min(1,1/2048*(complete?2:1)*(kind==='wild'?multiplier:1));
        return{kind,rate,known:false,region,complete,multiplier:kind==='wild'?multiplier:1,reason:kind==='underground'?'仅指地下化石结算机会，不是每一层':'野外遭遇概率，不等于最终捕获概率'};
    }
    class Budget{
        constructor(engine){this.e=engine;this.spent=0;this.used=0;}
        check(s,cost=0,uses=0){
            const cfg=this.e.settings;if(cost==null||!Number.isFinite(cost)||cost<0)return'无法确认价格，未执行消费';
            if(uses>0&&this.used+uses>cfg.useBudget)return'达到本次道具使用预算';
            if(cost>0){
                if(this.spent+cost>cfg.spendBudget)return'本次采购预算不足（0 表示不允许花钱）';
                if((Number(s.money)||0)-cost<cfg.moneyReserve)return'消费后低于金币保留额';
                const day=this.day();if(day.invalid)return'每日消费记录不可识别，已暂停采购';if(cfg.dailySpendBudget&&day.spent+cost>cfg.dailySpendBudget)return'达到每日金币消费上限';
            }return null;
        }
        day(){try{const raw=this.e.storage.getItem(PREFIX+'budget:'+this.e.account+':'+parisDay());if(raw===null)return{spent:0};const day=JSON.parse(raw);return day&&Number.isFinite(+day.spent)&&+day.spent>=0?{spent:+day.spent}:{spent:0,invalid:true};}catch{return{spent:0,invalid:true};}}
        charge(cost=0,uses=0){if(cost){const day=this.day();if(day.invalid)throw new Error('每日消费记录不可识别，未执行消费');day.spent+=cost;this.e.storage.setItem(PREFIX+'budget:'+this.e.account+':'+parisDay(),JSON.stringify(day));}this.spent+=cost;this.used+=uses;}
    }
    function currentRegion(s) { return CHAPTERS.get(s?.adv?.chapter)?.reg || 'kanto'; }
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
    function weatherSeason(now) {
        const date=new Date(now),day=Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000);
        return ['spring','summer','autumn','winter'][((Math.floor(day/3)%4)+4)%4];
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
        if(!data.weights)return{key:null,known:true,source:'natural',at};
        const seed='ch'+chapter;let flips=0;
        while(flips<64&&weatherHash(seed+'|'+(slot-flips))<WEATHER_DATA.chance)flips++;
        if(flips%2===0)return{key:null,known:true,source:'natural',at};
        const night=phaseAt(s,now,chapter)==='night',weights=Object.entries(data.weights).filter(([key])=>!(night&&WEATHER_DATA.types[key]?.daylight));
        if(!weights.length)return{key:null,known:true,source:'natural',at};
        let roll=weatherHash(slot+'|'+seed)*weights.reduce((sum,[,n])=>sum+n,0),key=weights[0][0];
        for(const [candidate,weight]of weights)if((roll-=weight)<=0){key=candidate;break;}
        return{key,known:true,source:'natural',at};
    }

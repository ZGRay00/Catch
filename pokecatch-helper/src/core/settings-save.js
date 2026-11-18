    const MODE_NAMES = { dex: '补齐图鉴', money: '自动刷钱', legend: '指定传说战', roam: '游荡捕获', item: '指定道具', train: '目标练级', progress: '推进主线',
        breed:'繁殖孵蛋',shiny:'指定野生刷闪',underground:'地下通道',tower:'对战塔',candy:'糖果工厂',elite:'精英联盟',world:'世界首领',resource:'采购与使用' };
    const FLOW_MODES = new Set(['breed','underground','tower','candy','elite','world','resource']);
    const SESSION_FIELDS=['started','startMoney','startItems','sessionItemId','trainProtected','trainingSelection','startTrainingXp','oldLoops','zoneStarted','roamStarted','raidPreparation','cooldowns','raidCooldown','nextRaid','nextLegend','teamRetryAt','lastExplore'];
    function raidIdentity(s,value=s?.adv?.event){
        if(!value?.raid)return null;
        return JSON.stringify([value.reg||currentRegion(s),value.id,value.date||parisDay()]);
    }
    function sameManualRaid(s,saved){
        if(!saved)return false;try{const [reg,id,date]=JSON.parse(saved);return JSON.stringify([reg||currentRegion(s),id,date||parisDay()])===raidIdentity(s);}catch{return false;}
    }
    const RESOURCE_IDS = new Set([...DATA.automation.shop.map(x=>x.id),...Object.keys(DATA.automation.buffs),'rare-candy','link-cable','up-grade','shed-shell']);
    const WILD_SHINY_IDS = new Set(DATA.chapters.flatMap(c=>Object.values(c.shinyPools||{}).flatMap(pool=>pool.map(([id])=>id))));
    function encounterDataErrors(data = DATA) {
        const errors = [];
        if (data.poolSchema !== 1) errors.push('野外数据版本缺失');
        for (const c of data.chapters || []) {
            if (!(c.wild > 0)) continue;
            for (const phase of ['morning', 'day', 'night']) {
                const pool = c.pools?.[phase];
                if (!Array.isArray(pool) || !pool.length) { errors.push(`${c.name}/${phase} 出没表为空`); continue; }
                if (pool.some(([id, best, clear]) => !Number.isInteger(id) || !(best > 0) || !Number.isFinite(best) || !Number.isFinite(clear) || clear < 0 || best < clear)) errors.push(`${c.name}/${phase} 出没数据无效`);
            }
        }
        return errors;
    }
    const ENCOUNTER_DATA_ERRORS = encounterDataErrors();
    const DEFAULTS = Object.freeze({
        mode: 'dex', raids: true, progress: true, legends: true, gifts: true, animations: true,
        optimizeRaid: true, skipOwnedShiny: true, speed: 4, sampleMinutes: 4,
        rotateMinutes: 15, raidMinutes: 90, lossLimit: 3, stopMinutes: 0,
        moneyTarget: 0, region: 'current', afterDex: 'money', manualPause: true,
        manualResume: true, resumeSeconds: 15, dismissInfo:true,
        autoTeam: true, teamMinutes: 5,autoEvolve:true,activeSwitch:false,
        autoPrepare:true,prepareMargin:2,prepareGap:3,prepareIdleMinutes:5,progressCandy:true,
        legendId: 145, legendTier: 0, legendMinutes: 90, roamId:243,roamMinutes:90,roamAllowMasterBall:false,itemId: 'rare-candy', itemQuantity: 10,
        trainUid: 'team', trainLevel: 100,
        breedId:1,breedGoal:1,breedShiny:false,pensionExpand:false,autoEggs:true,autoUnderCollect:true,autoUnderDispatch:true,
        shinyId:25,autoBuff:false,trainBuddy:true,trainBuff:true,moneyBuff:true,
        underRuns:1,underFrom:1,underOpenGeodes:true,towerFloor:100,towerRuns:1,candyFloor:50,candyRuns:1,
        eliteRegion:'current',eliteTier:1,worldActions:3,worldCapture:true,
        resourceItem:'exp-candy-m',resourceAction:'buy',resourceQuantity:1,useUid:'',
        spendBudget:0,dailySpendBudget:0,moneyReserve:10000,useBudget:20,
        autoTravel:false,progressUntil:DATA.chapters.at(-1).id,resumeOnReload:true,
    });
    const clamp = (v, lo, hi, fallback) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : fallback;
    function normalizeSettings(raw = {}) {
        const out = { ...DEFAULTS };
        for (const k of Object.keys(DEFAULTS)) if (typeof DEFAULTS[k] === 'boolean' && typeof raw[k] === 'boolean') out[k] = raw[k];
        const choices = { mode: Object.keys(MODE_NAMES), speed: [1, 2, 4], region: ['current', 'all'], afterDex: ['money', 'stop'],eliteRegion:['current',...DATA.regions.map(r=>r.key)],resourceAction:['buy','use','buyUse'] };
        for (const [k, allowed] of Object.entries(choices)) if (allowed.includes(raw[k])) out[k] = raw[k];
        for (const [k, lo, hi] of [['sampleMinutes', 1, 30], ['rotateMinutes', 2, 120], ['raidMinutes', 5, 720], ['lossLimit', 1, 20], ['stopMinutes', 0, 1440], ['moneyTarget', 0, 1e12], ['legendTier', 0, 5], ['legendMinutes', 5, 720], ['roamMinutes', 5, 720], ['itemQuantity', 1, 99999], ['trainLevel', 1, 100], ['resumeSeconds', 3, 300], ['teamMinutes', 1, 60]]) {
            out[k] = clamp(raw[k], lo, hi, DEFAULTS[k]);
        }
        for (const key of ['legendTier', 'itemQuantity', 'trainLevel']) out[key] = Math.floor(out[key]);
        for(const[k,lo,hi]of [['breedGoal',1,9999],['underRuns',1,999],['underFrom',1,300],['towerFloor',1,999],['towerRuns',1,100],['eliteTier',1,5],['worldActions',1,3],['resourceQuantity',1,99999],['spendBudget',0,1e12],['dailySpendBudget',0,1e12],['moneyReserve',0,1e12],['useBudget',0,99999],['progressUntil',0,DATA.chapters.at(-1).id]])out[k]=Math.floor(clamp(raw[k],lo,hi,DEFAULTS[k]));
        for(const[k,lo,hi]of [['prepareMargin',0,15],['prepareGap',0,20],['prepareIdleMinutes',2,30]])out[k]=Math.floor(clamp(raw[k],lo,hi,DEFAULTS[k]));
        out.candyFloor=Math.floor(clamp(raw.candyFloor,0,999,DEFAULTS.candyFloor));out.candyRuns=Math.floor(clamp(raw.candyRuns,1,30,DEFAULTS.candyRuns));
        if(MONS.has(+raw.breedId))out.breedId=+raw.breedId;
        if(MONS.has(+raw.shinyId)&&!MONS.get(+raw.shinyId).legend)out.shinyId=+raw.shinyId;
        if(RESOURCE_IDS.has(raw.resourceItem))out.resourceItem=raw.resourceItem;
        if(typeof raw.useUid==='string'&&raw.useUid.length<120)out.useUid=raw.useUid;
        if (DATA.zones.some(z => z.id === +raw.legendId)) out.legendId = +raw.legendId;
        if([243,244,245,380,381,481,641,642].includes(+raw.roamId))out.roamId=+raw.roamId;
        if (ITEMS.has(raw.itemId)) out.itemId = raw.itemId;
        if (typeof raw.trainUid === 'string' && raw.trainUid.length > 0 && raw.trainUid.length <= 120) out.trainUid = raw.trainUid;
        return out;
    }
    // Public SaveWire FMT 2 stores the main PC and dex as compact JSON tuples.
    // Decode a private read-only view; never rewrite or migrate the game's stored save.
    function decodeSave(wire){
        const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
        if(!object(wire)||wire.fmt===undefined)return wire;
        if(wire.fmt!==2)throw new Error(`不支持的游戏存档格式 fmt ${wire.fmt}，请更新助手`);
        const packed=wire.mz;
        if(!object(packed)||!Array.isArray(packed.m)||packed.r!==undefined&&!Array.isArray(packed.r)||packed.w!==undefined&&!Array.isArray(packed.w))throw new Error('游戏压缩存档结构不完整，请先检查游戏保存状态');
        const regions=packed.r||[],places=packed.w||[],state={...wire};delete state.fmt;delete state.mz;
        const stamp=uid=>typeof uid==='string'&&/^[0-9a-z]{8}/.test(uid)?parseInt(uid.slice(0,8),36):NaN;
        state.mons=packed.m.map(row=>{
            if(!Array.isArray(row))return row;
            let mon={shiny:false};
            for(const [at,key]of [[0,'uid'],[1,'id'],[2,'level'],[3,'xp']])if(row[at]!=null)mon[key]=row[at];
            if(row[4]!=null)mon.reg=regions[row[4]];
            if(row[5]!=null)mon.where=places[row[5]];
            if(Number.isSafeInteger(row[6])&&Math.abs(row[6])<1e15&&Number.isSafeInteger(stamp(row[0])))mon.caughtAt=stamp(row[0])+row[6];
            if(object(row[7]))mon={...mon,...row[7]};return mon;
        });
        if(packed.dx===1&&object(wire.dex))state.dex=Object.fromEntries(Object.entries(wire.dex).map(([id,row])=>{
            if(!Array.isArray(row))return[id,row];
            const entry={};if(Number.isSafeInteger(row[2])&&row[2]>=0){entry.regs={};for(let i=0;i<regions.length;i++)if(row[2]&(1<<i))entry.regs[regions[i]]=1;}
            if(row[0]!=null)entry.caught=row[0];if(row[1]!=null)entry.firstAt=row[1];
            if(row.length>3&&row[3]!==null)entry.shiny=row[3];if(row.length>4&&row[4]!==null)entry.n=row[4];
            return[id,entry];
        }));
        if(Array.isArray(packed.s))state.seen=Object.fromEntries([...Object.keys(object(state.dex)?state.dex:{}),...packed.s].map(id=>[id,true]));
        if(Array.isArray(packed.o))state.pcOrder=packed.o.map(value=>Number.isSafeInteger(value)?state.mons[value]?.uid:value);
        return state;
    }
    function accountId(s) { return String(s?.trainer?.id || s?.trainer?.tag || 'guest'); }
    function shinyOwned(s,id){return !!s.dex?.[id]?.shiny||[...(s.mons||[]),...(s.pension?.mons||[]).map(x=>x.mon),...(s.under?.slots||[]).flatMap(x=>x.mons||[]),...(s.link?.stash?.mons||[])].some(m=>m?.id===id&&m.shiny);}

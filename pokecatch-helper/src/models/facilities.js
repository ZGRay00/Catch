    function towerWeek(now=Date.now()){const date=new Date(now);return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-(date.getUTCDay()+6)%7)).toISOString().slice(0,10);}
    let resetDay, resetAt;
    function nextParisReset(now=Date.now()){
        const day=parisDay(now);
        if(day===resetDay)return resetAt;
        let low=Math.floor(now/60000),high=low+27*60;
        while(high-low>1){
            const mid=Math.floor((low+high)/2);
            if(parisDay(mid*60000)===day)low=mid;
            else high=mid;
        }
        resetDay=day;
        resetAt=high*60000;
        return resetAt;
    }
    // The native raid list opens a region when its last league chapter is cleared.
    const RAID_CHAMPIONS=DATA.regions.map(region=>DATA.chapters.filter(c=>c.reg===region.key&&c.league).at(-1)).filter(Boolean);
    function raidProgressText(s,event,now=Date.now()){
        const attempt=Math.max(0,Math.trunc(Number(event.loops)||0))+1;
        const record=s.raids?.pity?.[event.reg||currentRegion(s)];
        const date=event.date||parisDay(now);
        const limit=150; // CONFIG.RAID.PITY. Only a failed capture advances the native gauge.
        const misses=record?.date===date&&Number.isInteger(record.n)?Math.max(0,Math.min(record.n,limit-1)):0;
        return `当前第 ${attempt} 轮 · `+(misses===limit-1?'下一次投球必定捕获':`大师球进度 ${misses}/${limit}`);
    }
    function raidRetryAt(now,day,wait=600000){
        if(day&&day!==parisDay(now))return now;
        return Math.min(now+wait,nextParisReset(now));
    }
    function dailyRaidStatus(s,skipOwned,draw,now,regions){
        const raids=s?.raids,adv=s?.adv;
        if(!adv?.badges?.includes('Maître')||adv.event?.raid)return null;
        const eligible=RAID_CHAMPIONS.filter(c=>adv.unlocked>c.id||c.badges.some(b=>adv.badges.includes(b))).map(c=>c.reg);
        const selected=regions?.length?eligible.filter(reg=>regions.includes(reg)):eligible;
        if(regions?.length&&!selected.length)return {reason:'所选地区的团体战尚未解锁',until:null};
        if(!raids)return null;
        const day=parisDay(now),reroll=raids.reroll?.day===day?raids.reroll.to:null;
        if(!eligible.length)return null;
        const drawn=raids.seen===day||!!reroll;
        const observed=drawn&&draw?.day===day&&draw.reroll===reroll&&eligible.includes(draw.reg)&&
            (!reroll||reroll===draw.reg)&&MONS.has(draw.boss)?draw:null;
        const completed=reg=>{
            const key=reg+'|'+day;
            if(!(Number(raids.done?.[key])>0))return false;
            const boss=raids.doneBoss?.[key];
            return !observed||reg!==observed.reg||boss==null||boss===observed.boss;
        };
        // Draw mode awards one region per day. Older multi-region schedules must finish every unlocked region.
        const reg=observed?.reg||reroll;
        if(reg&&regions?.length&&!regions.includes(reg))return {reason:'今日抽取的团体战不在所选地区',until:nextParisReset(now)};
        // A day stamp says that a draw took place, but does not identify its region.
        // If the draw is unknown, another region's capture cannot settle today's card.
        const done=reg?eligible.includes(reg)&&completed(reg):selected.every(completed);
        if(done)return {reason:'今日可挑战的团体战已完成',until:nextParisReset(now)};
        if(skipOwned&&observed&&s.dex?.[observed.boss]?.shiny){
            return {reason:'已按设置跳过今日已拥有的异色目标',until:nextParisReset(now)};
        }
        return null;
    }
    function towerProgress(s,now=Date.now()){
        const week=towerWeek(now),saved=s.tower?.run,run=saved?.week===week?saved:null;
        const best=s.tower?.best?.week===week?Math.max(0,Number(s.tower.best.floor)||0):0;
        const floor=run?Math.max(1,Number(run.floor)||1):1;
        return{week,run,best,floor,cleared:Math.max(best,run?floor-1:0),
            paused:!!run&&(!s.adv?.tower||s.adv.tower.kind==='candy'),expired:!!saved&&!run};
    }
    function towerParty(s,options={}){
        const progress=towerProgress(s,options.now),snapshot=!!options.snapshot;
        const floor=Math.max(1,Number(options.floor??(snapshot?progress.floor:1))||1);
        const level=Math.min(DATA.automation.levels.towerMax,Math.floor(DATA.automation.levels.towerStart+(floor-1)*DATA.automation.levels.towerStep));
        const copy=mon=>({uid:mon.uid,src:mon.src||mon.uid,id:mon.id,level:Math.min(100,Number(mon.level)||1),shiny:!!mon.shiny,...mon.rank?{rank:mon.rank}:{},...mon.taste?{taste:mon.taste}:{},reg:monRegion(mon)});
        let roster;
        if(snapshot)roster=(progress.run?.mons||[]).filter(mon=>mon&&MONS.has(mon.id)).map(mon=>({...copy(mon),uid:mon.src||mon.uid,towerUid:mon.uid,...mon.hp!=null?{hp:mon.hp}:{}}));
        else{
            roster=[...(s.mons||[]),...(s.under?.slots||[]).flatMap(slot=>slot.mons||[])].filter(mon=>mon&&MONS.has(mon.id)&&mon.uid&&(!s.link||monRegion(mon)!==s.link.to)).map(copy);
            // Native Tower ranks snapshots by statsOf, whose HP has no battle HP boost.
            // Source HP/stat multipliers are not copied into a newly created tower run.
            const total=mon=>{
                const stats=effectiveStats(mon),model=MONS.get(mon.id),scale=(mon.shiny?1.1:1)*DATA.combat.rankStat**(mon.rank||0);
                const hp=Math.floor((Math.floor(2*model.stats.hp*mon.level/100)+mon.level+10)*scale);
                return hp+stats.atk+stats.def+stats.spa+stats.spd+stats.spe;
            };
            const scores=new Map(roster.map(mon=>[mon,total(mon)]));roster.sort((a,b)=>scores.get(b)-scores.get(a));
        }
        const seen=new Set();
        return roster.filter(mon=>{const identity=DATA.combat.singles[mon.id]||mon.id;if(seen.has(identity))return false;seen.add(identity);return true;})
            .filter(mon=>mon.level>=level-10&&(mon.hp==null||mon.hp>0)).slice(0,6);
    }

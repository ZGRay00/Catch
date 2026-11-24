    // Background services, preparation and the foreground scheduler consult the
    // same save evidence before spending resources or advancing a queued job.
    function adventureTaskOutcome(s,e,now=Date.now()){
        if(!s?.adv)return null;
        const cfg=e.settings;
        let reason;
        switch(cfg?.mode){
        case 'money':
            if(cfg.moneyTarget>0&&s.money>=cfg.moneyTarget)reason='达到目标金币';
            break;
        case 'item':
            if(Number.isFinite(e.startItems)&&itemCounter(s,cfg.itemId)-e.startItems>=cfg.itemQuantity)reason=`已获得目标道具 ${cfg.itemQuantity} 个`;
            break;
        case 'shiny':
            if(!missingShinies(s,cfg).length)reason='指定野生异色目标已捕获';
            break;
        case 'dex':
            if((cfg.afterDex==='stop'||e.queueRunning)&&!dexStatus(s,cfg).missing.length)reason=cfg.dexSpecies?.length?'指定物种已全部捕获':'所选范围的基础形态已全部捕获';
            break;
        case 'progress':
            if(e.progressReached?.(s))reason='主线目标章节已完成';
            break;
        case 'legend': {
            const goals=legendGoals(s,cfg);
            if(!goals.length)return {failed:true,reason:LEGEND_TARGET_REQUIRED};
            if(goals.every(goal=>goal.done))reason='指定传说战目标已完成';
            break;
        }
        case 'roam':
            if(roamingProgress(s,cfg,now).done)reason='指定游荡宝可梦已确认捕获';
            break;
        case 'train': {
            const training=trainingStatus(s,cfg,e.trainProtected);
            if(training.conflict)return{failed:true,reason:'指定目标占用同一出战名额，请分成两个培育任务'};
            if(training.missing)return{failed:true,reason:cfg.trainUid==='selected'?'培育目标未持有、地区不符或未加入手动队伍，请核对选择':'练级目标不在冒险队伍中，请重新选择'};
            if(training.complete){reason=`练级目标已达到 Lv.${cfg.trainLevel}`;if(cfg.trainGems&&cfg.trainLevel===100&&cfg.trainUid!=='team'&&training.targets.some(m=>(m.rank||0)<cfg.trainRank))reason+=' · 部分目标未升阶，请核对最终形态、库存宝石和道具额度';}
            else if(training.capped)return{failed:true,reason:`已达到当前等级上限 Lv.${training.cap}，请推进主线后继续`};
            break;
        }
        }
        return reason?{reason,failed:false}:null;
    }

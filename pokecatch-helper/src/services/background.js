    function undergroundTeamKey(s,slot,now=Date.now()){
        const day=parisDay(now),used=s.under?.day===day?Object.keys(s.under?.used||{}).sort().join(','):'';
        return `under:${day}|${slot}|${used}|${rosterFingerprint(s)}`;
    }
    function undergroundMembers(s,now=Date.now()){
        const used=s.under?.day===parisDay(now)?s.under.used||{}:{};
        const away=new Set((s.candy?.run?.mons||[]).map(m=>m.src));
        for(const slot of s.under?.slots||[]){
            for(const uid of slot.team||[])away.add(uid);
            for(const mon of slot.mons||[])away.add(mon.uid);
        }
        return(s.mons||[]).filter(m=>teamEligible(s,m,'sinnoh')&&!used[m.uid]&&!away.has(m.uid));
    }
    function canFillUndergroundTeam(pool){
        const seen=new Set(),candidates=[];
        const compatible=(a,b)=>a.key!==b.key&&!teamApart(a.mon,b.mon);
        for(const mon of pool){
            const form=`${mon.id}:${+!!mon.shiny}`;
            if(seen.has(form))continue;
            seen.add(form);
            const entry={mon,key:DATA.combat.singles[mon.id]||form};
            for(let i=0;i<candidates.length-1;i++){
                const first=candidates[i];
                if(!compatible(entry,first))continue;
                for(let j=i+1;j<candidates.length;j++){
                    const second=candidates[j];
                    if(compatible(entry,second)&&compatible(first,second))return true;
                }
            }
            candidates.push(entry);
        }
        return false;
    }
    function undergroundBayMembers(s,bay,now,preferReserves=true){
        const reserved=new Set();
        for(const [key,uids] of Object.entries(s.eventTeams||{})){
            if(key.startsWith('under:')&&key!=='under:'+bay&&!undergroundBay(s,Number(key.slice(6))))
                for(const uid of uids||[])reserved.add(uid);
        }
        const available=undergroundMembers(s,now).filter(m=>!reserved.has(m.uid));
        if(!preferReserves)return available;
        const adventure=new Set([...(s.team||[]),...(s.road||[]),s.buddy?.uid]);
        const reserves=available.filter(mon=>!adventure.has(mon.uid));
        return canFillUndergroundTeam(reserves)?reserves:available;
    }
    function underSpecialReview(e,key){
        return !!key&&!!e.automation?.state?.underSpecialKeys?.includes(key);
    }
    function finishUnderSpecialReview(e,key){
        if(!underSpecialReview(e,key))return;
        e.automation.state.underSpecialKeys=e.automation.state.underSpecialKeys.filter(item=>item!==key);
        e.persist();
    }
    function undergroundBackgroundUnlocked(s){
        if(!s?.adv)return false;
        return currentRegion(s)==='sinnoh'||(s.travel?.to||[]).includes('sinnoh')||s.link?.from==='sinnoh'||s.link?.to==='sinnoh'&&s.link?.side==='to';
    }
    function undergroundIdleMembers(s,e,now=Date.now()){
        if(!s?.adv)return[];
        const protectedUids=new Set([...(s.team||[]),...(s.road||[]),...(e.trainProtected||[]),...(e.driver?.teamTask?.uids||[])]);
        const keep=uid=>{if(typeof uid==='string'&&uid)protectedUids.add(uid);};
        for(const uid of e.daily?.checkpoint?.session?.trainProtected||[])keep(uid);
        keep(s.buddy?.uid);keep(e.automation?.buddyTask?.uid);keep(e.automation?.state?.evolution?.uid);keep(e.automation?.owner?.uid);keep(e.preparation?.candy?.uid);
        if(e.settings?.mode==='train'||['dex','shiny'].includes(e.settings?.mode)&&e.settings.huntWeatherFallback==='xp')trainingUids(s,e.settings).forEach(keep);
        if(e.settings?.mode==='resource')keep(e.settings.useUid);
        for(const p of [e.preparation,e.raidPreparation])if(p){for(const key of ['uids','originalTeam'])for(const uid of p[key]||[])keep(uid);for(const target of p.targets||[])keep(target.uid);}
        for(const target of e.coach?.ready?.targets||[])keep(target.uid);
        for(const uid of e.coach?.planReview?.plan?.uids||[])keep(uid);
        const status=undergroundStatus(s,now),ownBay=e.services?.underground?.bay??Array.from({length:status.capacity},(_,i)=>i).find(bay=>!undergroundBay(s,bay,status));
        for(const [key,uids]of Object.entries(s.eventTeams||{}))if(key!==`under:${ownBay}`&&Array.isArray(uids))uids.forEach(keep);
        for(const slot of s.under?.slots||[]){(slot.team||[]).forEach(keep);for(const mon of slot.mons||[])keep(mon.uid);}
        for(const run of [s.tower?.run,s.candy?.run,s.adv?.league]){for(const mon of run?.mons||[]){keep(mon.src);keep(mon.uid);}for(const uid of run?.team||[])keep(uid);}
        if(e.settings?.mode==='breed')for(const mon of pensionPlan(s,e.settings.breedId,e.settings.breedShiny).desired)keep(mon.uid);
        const seen=new Set();
        return undergroundMembers(s,now).filter(mon=>!protectedUids.has(mon.uid)&&!seen.has(mon.uid)&&seen.add(mon.uid));
    }
    function adventureDispatchWait(s,e,now){
        if(e.automation?.state?.underWaitUids?.length)return '等待当前任务指定的成员归队';
        if(e.automation?.state?.underPartyReview)return '等待派遣后的任务配队复核';
        if(e.settings.underGoal==='native')return '';
        if(!e.settings.autoTeam)return '';
        const p=e.preparation, party=s.team||[], road=s.road||[];
        const mode=e.settings.mode, roamLegend=mode==='legend'&&!e.settings.legendTier&&DATA.zones.some(z=>z.id===e.settings.legendId&&z.eliteOnly);
        if(!p&&(FLOW_MODES.has(mode)||mode==='legend'&&!roamLegend))return '';
        const partyKey=party.join('|');
        if(p && (p.phase!=='train'||p.uids?.join('|')!==partyKey||!p.route?.members?.includes(s.adv.chapter)))return '等待补练阵容与路线就绪';
        if(road.length&&road.join('|')!==partyKey)return '等待治疗点应用冒险阵容';
        if(p)return '';
        const check=e.teamCheck,chapter=CHAPTERS.get(s.adv.chapter),frontier=mode==='progress'&&CHAPTERS.get(s.adv.unlocked);
        if((frontier&&chapter?.loop!==frontier.loop)||(e.target&&!e.target.members?.includes(s.adv.chapter)))return '等待目标路线的冒险配队';
        if(e.farmingTeamHeld?.(s,now,check))return '';
        const members=check?.members||[s.adv.chapter];
        if(!check||!members.includes(s.adv.chapter)||check.mode!==mode||check.expectedParty!==partyKey||
            check.roster!==adventureRosterFingerprint(s,chapter?.reg)||check.autoSwitch!==(s.autoSwitch!==false)||
            check.deaths!==totalDeaths(s,{members})||now-check.at>=e.settings.teamMinutes*60000||
            check.weatherKey!==adventureTeamWeatherKey(s,members,now))
            return '先适配冒险阵容，再派遣空闲队员';
        return '';
    }
    function undergroundDispatchReason(s,e,now=Date.now(),status){
        if(!e.settings.autoUnderDispatch)return '后台自动派遣已关闭';
        if(!undergroundBackgroundUnlocked(s))return '进入神奥后自动启用后台派遣';
        if(!s.adv.badges?.includes('Forêt'))return '神奥森林徽章后开放地下探险';
        if(['exit','team','restore','travel','travelFirst'].includes(e.preparation?.phase))return '先完成补练队伍与原任务的切换';
        status??=undergroundStatus(s,now);
        if(!status.left)return '今日派遣额度已用完，等待次日';
        if(status.slots.length>=status.capacity)return '派遣位置已满，等待归队';
        const wait=adventureDispatchWait(s,e,now);
        if(wait)return wait;
        if(e.settings.underGoal==='native'){
            if(undergroundMembers(s,now).length<DATA.automation.under.team)return '游戏可派遣队员不足三只';
        }else if(!canFillUndergroundTeam(undergroundIdleMembers(s,e,now)))return '空闲成员不足三只可同时出战的宝可梦，保留主队、Buddy及任务阵容';
        const tab=typeof document==='undefined'?null:$('#tabs [data-screen="underground"]');
        if(tab&&(tab.classList.contains('locked')||tab.classList.contains('hold')))return tab.dataset.why||'地下通道入口尚未开放';
        return '';
    }
    // Native timers can overlap; page actions and the single adventure route cannot.
    // Underground dispatch rechecked against public build cafff21174, 2026-11-17.
    function normalizeServiceState(raw){
        const out={underground:null,underClaimed:0,underDispatched:0,lastStarted:{},lastCompleted:{},retryAt:{}};
        if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
        out.underClaimed=Math.floor(clamp(raw.underClaimed,0,1e9,0));
        out.underDispatched=Math.floor(clamp(raw.underDispatched,0,1e9,0));
        for(const key of ['lastStarted','lastCompleted','retryAt'])for(const id of ['eggs','underground','evolution']){
            const value=Number(raw[key]?.[id]);if(Number.isFinite(value)&&value>=0)out[key][id]=value;
        }
        const task=raw.underground;
        if(task&&typeof task==='object'&&Number.isFinite(task.started)&&task.started>=0){
            out.underground={started:task.started,returnScreen:/^[a-z][\w-]{0,40}$/.test(task.returnScreen||'')?task.returnScreen:'adventure',returning:!!task.returning};
            if(task.action==='dispatch'){
                const ids=Array.isArray(task.uids)?[...new Set(task.uids.filter(uid=>typeof uid==='string'&&uid.length>0&&uid.length<=120))].slice(0,3):[];
                Object.assign(out.underground,{action:'dispatch',uids:ids,editorOpen:!!task.editorOpen,teamReady:!!task.teamReady});
                if(Number.isInteger(task.bay)&&task.bay>=0&&task.bay<4)out.underground.bay=task.bay;
                const launch=task.launch;
                if(launch&&Number.isInteger(launch.bay)&&launch.bay>=0&&launch.bay<4&&Array.isArray(launch.uids)&&launch.uids.length===3&&new Set(launch.uids).size===3&&launch.uids.every(uid=>typeof uid==='string'&&uid.length<=120)&&Number.isFinite(launch.at)&&launch.at>=0){
                    out.underground.launch={bay:launch.bay,uids:[...launch.uids],ids:(Array.isArray(launch.ids)?launch.ids:[]).map(String).slice(0,8),at:launch.at};
                    if(launch.native===true)Object.assign(out.underground.launch,{native:true,partyHit:launch.partyHit===true,
                        specialKeys:(Array.isArray(launch.specialKeys)?launch.specialKeys:[]).filter(key=>typeof key==='string'&&key.length<=120)});
                }
            }
            const tx=task.tx,uids=Array.isArray(tx?.uids)?[...new Set(tx.uids.filter(uid=>typeof uid==='string'&&uid.length>0&&uid.length<=120))].slice(0,6):[];
            if(tx&&tx.id!=null&&String(tx.id).length<=120&&uids.length&&Number.isFinite(tx.at)&&tx.at>=0)out.underground.tx={id:String(tx.id),uids,at:tx.at};
        }
        return out;
    }
    function mainGoalReached(s,e,now=Date.now()){
        if(!s?.adv)return false;
        const c=e.settings||{},mode=c.mode,flow=e.automation?.state||{};
        if(flow.underWaitUids?.length)return false;
        if(!FLOW_MODES.has(mode))return !!adventureTaskOutcome(s,e,now);
        if(mode==='breed')return c.breedShiny?shinyOwned(s,c.breedId):(flow.hatched||0)>=c.breedGoal;
        if(mode==='underground')return(flow.underDone||0)>=c.underRuns;
        if(mode==='resource'){
            const id=c.resourceItem,n=c.resourceAction==='buy'?purchasedQuantity(s,id,flow):usedQuantity(s,id,flow);
            return n>=c.resourceQuantity;
        }
        if(mode==='candy')return!s.candy?.run&&!s.adv.tower&&(flow.candyDone||0)>=c.candyRuns;
        if(mode==='elite'){const reg=c.eliteRegion==='current'?currentRegion(s):c.eliteRegion;return!s.adv.league&&(s.eliteLeague?.[reg]?.t||0)>=c.eliteTier;}
        if(mode==='tower'){const p=towerProgress(s,now);return!s.adv.tower&&!p.run&&(p.best>=c.towerFloor||!!flow.towerReached);}
        if(mode==='world'){
            const edition=s.wb?.tryEd||s.wb?.ed;if(c.worldCapture)return!!edition&&s.wb?.caught===edition;
            const day=String(s.wb?.ed)+'|'+s.wb?.day,base=flow.worldDay&&flow.worldDay!==day?0:flow.worldBase||0;
            return(flow.worldDone||0)+Math.max(0,(Number(s.wb?.n)||0)-base)>=c.worldActions;
        }
        return false;
    }
    function backgroundActivityBlock(a,service,engine){
        const collect=service==='eggs'||service==='underCollect';
        if(a.pending)return '等待当前游戏选择结束';
        const visitDuringLegend=collect||service==='underDispatch'&&!a.zone?.elite&&engine?.settings?.underGoal==='native'&&engine?.settings?.mode==='legend';
        if(visitDuringLegend&&a.zone?.riddle)return '等待传说入口铭文结算';
        if(visitDuringLegend&&a.zone&&engine?.running&&engine.zoneId!==a.zone.id)return '等待助手接管当前传说战';
        const raidHatch=service==='eggs'&&a.event?.raid;
        if(a.event&&!raidHatch||a.tower||a.league||a.zone&&(!visitDuringLegend||a.zone.id===493))return '独立战斗占用前台，计时继续';
        if(a.battle&&!collect&&service!=='underDispatch')return '等待当前战斗结束';
        return '';
    }
    function backgroundBlockReason(s,e,now=Date.now(),service=''){
        if(!e.running||e.suspended)return '助手未运行，原生计时仍独立继续';
        if(e.manual)return '手动控制中，等待归还页面';
        if(pageHidden())return '标签页在后台，等待回到游戏';
        const a=s?.adv||{},d=e.driver||{},auto=e.automation||{},flow=auto.state||{};
        if(a.paused)return '游戏已暂停';
        const activity=backgroundActivityBlock(a,service,e);
        if(activity)return activity;
        if(e.raidProbe||e.raidReturn||d.pendingMap||d.teamTask||d.ownedDialog||d.navigation||auto.owner||auto.buddyTask||auto.buffUI||e.modalWaitSince!=null)return '页面正在处理其他事务';
        if(e.preparation?.candyTx||flow.hatch||flow.resourceTx||flow.pensionPurchase||flow.autoBuffTx||flow.resourceBuffTx||flow.towerLaunch||flow.candyLaunch||flow.underLaunch||flow.underCollect||flow.waitUntil>now)return '等待领取、队伍或道具存档确认';
        if(flow.candyRun&&!s.candy?.run)return '等待糖果工厂结算';
        if(flow.worldResultAt!=null&&now-flow.worldResultAt<3000||typeof document!=='undefined'&&$$('#raid-root .wb-skip,.wb-recap,#raid-root .wb-spill').some(visible))return '等待世界首领攻击结算';
        return '';
    }
    function readyBackgroundEggs(s,now=Date.now()){
        const eggs=s?.pension?.eggs||[];
        const due=egg=>Number.isFinite(egg.hatchAt)&&egg.hatchAt>0&&egg.hatchAt<=now;
        if(eggs.every(due))return eggs;
        const native=new Set(typeof document==='undefined'?[]:$$('#pen-eggs .pen-egg.ready[data-egg]').filter(enabled).map(el=>String(el.dataset.egg)));
        return eggs.filter(egg=>due(egg)||native.has(String(egg.uid)));
    }
    function parallelPlan(s,e,now=Date.now(),eggs=readyBackgroundEggs(s,now),under=s?.under?undergroundStatus(s,now):null){
        const flow=e.automation?.state||{},services=e.services||normalizeServiceState(),c=e.settings||{};
        const active=services.underground?'underground':flow.eggService?'eggs':flow.evolution?'evolution':null;
        const returned=under?.ready.length||0;
        const underDispatch=!(c.autoUnderCollect&&returned)&&c.mode!=='underground';
        const mainComplete=mainGoalReached(s,e,now),blocked={},ready=[];
        let eggChoices;
        const manualParty=c.autoTeam===false&&(s?.team?.length||0)<6;
        for(const id of ['eggs','underground','evolution']){
            const service=id==='underground'?(underDispatch?'underDispatch':'underCollect'):id;
            let reason=backgroundBlockReason(s,e,now,service);
            if(id==='eggs'&&(!c.autoEggs||c.mode==='breed'))reason=c.mode==='breed'?'由当前繁殖任务管理':'自动收蛋已关闭';
            if(id==='underground'){
                if(c.mode==='underground')reason='由当前地下任务管理';
                else if(underDispatch)reason=reason||undergroundDispatchReason(s,e,now,under);
                else if(!c.autoUnderCollect)reason='后台归队领取已关闭';
            }
            if(id==='evolution'&&!c.autoEvolve)reason='自动免费进化已关闭';
            if(mainComplete&&!active)reason='主任务已达标，先完成或切换队列';
            if(!reason&&(id==='eggs'||id==='underground'&&!underDispatch&&!flow.underWaitUids?.length)&&manualParty)reason='手动队伍未满六人，原生领取可能自动入队';
            const retry=id==='eggs'?Math.max(flow.eggRetryAt||0,services.retryAt?.eggs||0):id==='evolution'?flow.evolutionRetryAt||0:services.retryAt?.underground||0;
            if(!reason&&retry>now)reason='等待服务重试时间';
            if(id==='eggs'&&!reason&&eggs.length){
                eggChoices=eggHatchPlan(s,eggs,now);
                if(!eggChoices.eligible.length)reason=eggChoices.blocked.values().next().value;
            }
            if(reason)blocked[id]=reason;
            else if(id==='eggs'?eggs.length:id==='underground'?underDispatch||returned:!['breed','resource'].includes(c.mode))ready.push(id);
        }
        // Mature eggs free incubator capacity first; finish any existing transaction
        // before starting this ordered list: eggs, underground receipts, evolution.
        return{active,ready,blocked,mainComplete,eggChoices,pendingCount:Number((eggChoices?.eligible.length??eggs.length)>0)+Number(returned>0)};
    }
    function taskExecutionState(s,e,now=Date.now()){
        const due=readyBackgroundEggs(s,now),under=undergroundStatus(s||{},now);
        const c=e.settings||{},a=s?.adv||{},flow=e.automation?.state||{},plan=parallelPlan(s,e,now,due,under),services=e.services||{};
        const nativePaused=e.running&&!!a.paused;
        const paused=!!(e.manual||e.suspended||nativePaused);
        const planned=MODE_NAMES[c.mode]||'主任务';let label=planned,detail='同一冒险路线的规划按顺序执行';
        if(a.event?.raid)label='团体战';else if(a.zone)label=a.zone.elite?'精英传说战':'传说捕获';else if(a.league)label='精英联盟';else if(a.tower)label=a.tower.kind==='candy'?'糖果工厂':'对战塔';else if(a.event)label='游戏活动';
        if(label!==planned)detail=`实际前台：${label} · 原任务：${planned}`;
        if(e.preparation){label='补练 → '+planned;detail='使用目标队伍补练，完成后返回原任务';}
        if(!s?.adv){label='未进入游戏';detail='进入游戏后显示实际任务和后台计时';}
        else if(!e.running&&!e.suspended){
            const nativeActivity = a.event || a.zone || a.tower || a.league;
            detail=nativeActivity?`游戏原生${a.event?.raid?'团体战':a.zone?'传说战':a.tower?.kind==='candy'?'糖果工厂':a.tower?'对战塔':a.league?'精英联盟':'活动'}仍可能继续；助手未接管`:'助手已停止；游戏原生冒险和后台计时仍可能继续';
            label='未启动主任务';
        }
        else if(e.manual||e.suspended)detail='助手已让出控制，原生计时不因此暂停';
        else if(nativePaused)detail='在游戏中继续冒险后恢复当前任务';
        else if(e.nextWake>now)detail=`主任务等待结算 · 后台可处理安全派遣与领取`;
        let uiOwner=plan.active==='underground'?(services.underground?.action==='dispatch'?'地下自动派遣':'地下归队领取'):plan.active==='eggs'?'成熟蛋领取':plan.active==='evolution'?'免费进化':e.driver?.ownedDialog?'特殊队伍/盟友弹窗':e.driver?.teamTask?'队伍调整':e.automation?.owner?'游戏弹窗确认':e.automation?.buffUI?'树果操作':e.preparation?.candyTx?'升级糖果确认':e.driver?.pendingMap?'地图切换':e.driver?.navigation?'页面切换':a.battle?'游戏原生战斗':'空闲';
        if(e.manual||e.suspended)uiOwner='手动控制 / 等待恢复';else if(nativePaused)uiOwner='游戏暂停 / 等待继续';else if(!e.running)uiOwner=plan.active?'已停止，原事务待核对':'助手未操作页面';
        const entries=[];
        const nativeEggs=s?.pension?.eggs||[],nextEgg=Math.min(...nativeEggs.filter(egg=>!due.includes(egg)).map(egg=>Number(egg.hatchAt)).filter(at=>at>now));
        const make=(id,enabled,configured,count,nextAt,task,managed,base)=>{
            let state=!configured?'unconfigured':count?'ready':'timing',text=base;
            if(!enabled){state='disabled';text+=(configured?'；原生计时/成熟状态保留，自动领取已关闭':'；未配置');}
            else if(managed){state='waiting';text+='；由当前主任务管理';}
            else if(task){state=e.running&&!paused?'running':'waiting';text+='；'+(state==='running'?'正在领取并归还页面':'事务保留，等待恢复核对');}
            else if(count&&plan.blocked[id]){state=/手动队伍/.test(plan.blocked[id])?'blocked':'waiting';text+='；'+plan.blocked[id];}
            else if(count&&id==='eggs')text+='；成熟蛋优先，可在普通战斗、团体战和传说战期间领取';
            entries.push({id,label:id==='eggs'?'培育屋 / 孵蛋':'地下派遣',state,detail:text,nextAt:Number.isFinite(nextAt)?nextAt:null});
        };
        const residents=(s?.pension?.mons||[]).map(slot=>slot?.mon).filter(Boolean),breeding=residents.some(mon=>mon.id===132)&&residents.some(mon=>breedableOffspring(s,mon)!=null);
        make('eggs',c.autoEggs!==false,nativeEggs.length||residents.length,due.length,nextEgg,flow.eggService,c.mode==='breed',nativeEggs.length?`孵化中 ${nativeEggs.length-due.length} · 已成熟 ${due.length}`:breeding?'已配置寄养亲本，产糖 / 产蛋计时中':residents.length?'寄养产糖计时中，尚未配置可产蛋组合':'未配置蛋或寄养亲本');
        const nextUnder=Math.min(...under.running.map(slot=>Number(slot.end)).filter(at=>Number.isFinite(at)&&at>now));
        const dispatchOn=c.autoUnderDispatch!==false,collectOn=c.autoUnderCollect!==false,underTask=services.underground,unlocked=undergroundBackgroundUnlocked(s);
        let underState=under.slots.length?(under.ready.length?'ready':'timing'):'unconfigured',underLabel='',underAt=Number.isFinite(nextUnder)?nextUnder:null;
        let underText=`计时中 ${under.running.length} · 已返回 ${under.ready.length} · 自动派遣${dispatchOn?'开':'关'} / 领取${collectOn?'开':'关'}`;
        if(unlocked&&s.adv.badges?.includes('Forêt')){
            const nextStart=undergroundStartFloor(c,under.startFloors);
            underText+=` · 今日已派 ${under.sent}/${under.perDay} · 下次从第 ${nextStart} 层出发`;
            if(under.best>0)underText+=`（历史最高 ${under.best} 层）`;
        }
        if(services.underDispatched||services.underClaimed)underText+=` · 后台累计已派 ${services.underDispatched||0} / 已领 ${services.underClaimed||0} 队`;
        if(underTask){
            underState=e.running&&!paused?'running':'waiting';
            underLabel=underState==='running'?(underTask.action==='dispatch'?'派遣中':'领取中'):'等待恢复';
            underText+='；'+(underState==='running'?(underTask.action==='dispatch'?(c.underGoal==='native'?'游戏推荐队伍优先派遣，确认后复核任务配队':'仅用空闲队员派遣，确认后返回原任务'):'领取归队奖励，确认后返回原任务'):'事务保留，恢复后先核对存档');
        }else if(c.mode==='underground'){
            underState='waiting';underLabel='主任务管理';underText+='；由地下主任务管理配队、派遣和领取';
        }else if(under.ready.length&&collectOn){
            const why=plan.blocked.underground;
            underState=why?(/手动队伍/.test(why)?'blocked':'waiting'):'ready';underLabel=why?'等待领取':'待领取';underText+='；'+(why||'归队奖励优先领取后再派遣');
        }else if(dispatchOn){
            if(!unlocked){underState=under.slots.length?'timing':'waiting';underLabel=under.slots.length?'探险中':'待神奥';underText+='；进入神奥后自动派遣';}
            else if(under.slots.length>=under.capacity&&under.slots.length){underState=under.ready.length?'waiting':'timing';underLabel=under.ready.length?'待归队领取':'探险中';underText+='；派遣位已占用，等待归队'+(under.ready.length&&!collectOn?'或手动领取':'');}
            else if(!under.left){underState=under.running.length?'timing':'waiting';underLabel=under.running.length?'探险中':'等待次日';underText+='；今日派遣额度已用完，等待巴黎次日';underAt=Math.min(underAt??Infinity,under.nextReset);}
            else if(c.underGoal==='native'){
                const why=plan.blocked.underground;
                underState=why?'waiting':'ready';underLabel=why?'等待派遣':'待派遣';underText+='；地下优先 · '+(why||'使用游戏自动优化');
            }else{
                const idle=undergroundIdleMembers(s,e,now).length,required=DATA.automation.under.team||3,why=plan.blocked.underground;
                if(why){underState=/手动队伍/.test(why)?'blocked':'waiting';underLabel=/冒险阵容|冒险配队|补练阵容/.test(why)?'等待冒险配队':/不足|空闲.*队员/.test(why)?'等空闲队员':'等待前台';underText+=`；空闲可派遣 ${idle} 只，${why}`;}
                else if(idle<required){underState=under.slots.length?'timing':'waiting';underLabel='等空闲队员';underText+=`；空闲可派遣 ${idle}/${required}，保护主队、Buddy及培养对象`;}
                else{underState='ready';underLabel='待派遣';underText+=`；空闲可派遣 ${idle} 只，等待自动组队派遣`;}
            }
        }else{
            underState=!collectOn?'disabled':under.slots.length?under.ready.length?'disabled':'timing':'unconfigured';
            underText+='；'+(!collectOn?'后台派遣和领取均已关闭，原生计时保留':under.slots.length?'只领取已派出队伍':'尚无派遣队伍，可开启神奥后自动派遣');
        }
        entries.push({id:'underground',label:'地下探险',state:underState,...underLabel?{stateLabel:underLabel}:{},detail:underText,nextAt:underAt});
        return{foreground:{label,detail,state:paused?'paused':e.running?'running':'stopped'},services:entries,uiOwner,queueLabel:'任务队列 · 按顺序执行',summary:'主任务按队列顺序执行 · 后台计时可并行',pendingCount:plan.pendingCount,decision:executionDecision(s,e)};
    }
    function executionDecision(s,e){
        if(!s?.adv)return{route:'进入游戏后显示实际路线',team:'进入游戏后显示配队状态',reason:''};
        const a=s.adv,d=e.driver||{},p=e.preparation,c=e.settings||{},current=CHAPTERS.get(a.chapter),destination=d.pendingMap?.row||p?.route||e.target;
        const region=DATA.regions.find(region=>region.key===current?.reg)?.name||'',active=!!(a.event||a.zone||a.tower||a.league);
        let route=`${active?'主线位置':'实际路线'}：${region} · ${current?.name||'未知章节'}`;
        if(destination&&!destination.members?.includes(a.chapter))route+=`；目标：${destination.name||CHAPTERS.get(destination.id)?.name||'待切换地图'}`;
        if(p?.context?.label)route+=`；补练后返回：${p.context.label}`;
        if(d.navigation)route+=`；正在打开${d.navigation.name||d.navigation.screen}（已尝试 ${d.navigation.attempts||0} 次）`;
        if(active)return{route,team:'独立战斗使用游戏对应的专属队伍',reason:c.optimizeRaid?'特殊队伍按对应活动单独优化':'特殊队伍由你手动配置'};
        const index=pokemonByUid(s);
        const describe=uids=>uids.map(uid=>{const mon=index.get(uid);return mon?`${MONS.get(mon.id)?.name||mon.id} Lv.${mon.level}`:'成员已离开PC';}).join('、')||'未配置';
        const task=d.teamTask,road=Array.isArray(s.road)&&s.road.length?s.road:s.team||[],pending=road.length!==(s.team||[]).length||road.some((uid,i)=>uid!==s.team[i]);
        const stage=task?.pending?'等待拖放存档确认':task?'正在调整队伍':pending?'等待治疗点应用新队伍':c.autoTeam===false?'保留手动队伍':'当前冒险队伍';
        let team=`${stage}：${describe(task?.uids||s.team||[])}`;
        if(e.partyOrigin?.party===road.join('|')&&e.partyOrigin.name)team+='；行进队伍上次适配 '+e.partyOrigin.name;
        if(pending)team+=`；当前行进阵容：${describe(road)}`;
        let reason=c.autoTeam===false?'保留你选择的成员与顺序':p?'保留未完成培养目标，按当前路线选择带练成员':e.manual?'当前由你控制；最近的配队操作可在运行日志中查看':'按当前路线评估打点、回合数和生存能力';
        const check=e.teamCheck,key=String(destination?.key??current?.loop);
        let verification=null;
        if(!p&&c.autoTeam!==false&&check?.mode===c.mode&&check.key===key&&check.reason){
            reason=check.reason+(check.opponents?` · 覆盖 ${check.opponents} 组对手`: '');
            if(task&&check.gain>0)reason+=` · 模型评分 +${Math.round(check.gain*100)}%`;
            verification=check.verification||null;
            if(verification?.total)reason+=` · ${check.suggestion?'建议阵容':'所选阵容'}已复核 ${verification.checked}/${verification.total} 只候选`;
        }
        if(!p&&c.autoTeam!==false&&e.teamValidationNote&&!e.manual)reason=e.teamValidationNote;
        const review=e.teamSearch?.reviewInfo;
        if(review?.route&&review.route!==current?.name&&!e.manual)reason+=' · 正在预先复核'+review.route;
        return{route,team,reason,verification};
    }
    const UNDER_START_FLOORS=[1,25,50,75,100];
    function undergroundStartFloor(settings,floors){
        const cap=settings.underAutoStart===false?settings.underFrom:Infinity;
        return floors.reduce((best,floor)=>Number.isInteger(floor)&&floor>0&&floor<=cap?Math.max(best,floor):best,0);
    }
    const UNDER_THEMES={flooded:['water','grass','electric'],volcanic:['fire','rock','ground'],crystal:['ice','psychic','steel'],dark:['ghost','dark','poison'],ancient:['dragon','fighting'],galleries:['normal','bug','flying']};
    // Screen by dual-type opponents and keep distinct specialists alongside the
    // best generalists. Only the shortlist needs full per-move matchup rows.
    function* expeditionSeedOrder(pool,foes,identity,sliced,lowBudget){
        const groups=new Map();
        for(const foe of foes){
            const model=MONS.get(foe.id),key=model.types.join('/');
            let group=groups.get(key);
            if(!group){group={model,weight:0};groups.set(key,group);}
            group.weight+=foe.weight*(foe.guard?3:1);
        }
        const targets=[...groups.values()].sort((a,b)=>b.weight-a.weight).slice(0,lowBudget?8:12);
        const entries=[];
        for(const mon of pool){
            const model=MONS.get(mon.id),stats=effectiveStats(mon),defense=defensiveTypes(model);
            const learned=damagingMoves(model),banned=activeMoveBans(mon,learned);
            const offense={};
            for(const {level,key,move,stab} of learned){
                if(level>mon.level||banned?.includes(key))continue;
                const value=stats[move.cat==='phys'?'atk':'spa']*move.power*move.acc*stab/100;
                offense[move.type]=Math.max(offense[move.type]||0,value);
            }
            const attacks=Object.entries(offense);
            const bulk=Math.sqrt(stats.hp*Math.sqrt(stats.def*stats.spd));
            const scores=targets.map(({model,weight})=>{
                const targetDefense=defensiveTypes(model),incoming=Math.max(.25,...model.types.map(type=>defense[type]??1));
                let attack=0;
                for(const [type,power] of attacks)attack=Math.max(attack,power*(targetDefense[type]??1));
                return Math.sqrt(attack*bulk*mon.level/incoming)*weight;
            });
            entries.push({mon,group:identity(mon),scores,total:scores.reduce((sum,n)=>sum+n,0),
                physical:bulk*stats.atk,special:bulk*stats.spa,speed:bulk*stats.spe});
            if(sliced&&entries.length%4===0)yield;
        }
        const tie=(a,b)=>String(a.mon.uid).localeCompare(String(b.mon.uid));
        entries.sort((a,b)=>b.total-a.total||tie(a,b));
        const bestByType=targets.map(()=>0),selected=[],taken=new Set();
        while(selected.length<3){
            let best,gain=-Infinity;
            for(const entry of entries){
                if(taken.has(identity(entry.mon))||selected.some(mon=>teamApart(mon,entry.mon)))continue;
                const value=entry.scores.reduce((sum,score,i)=>sum+.7*Math.max(0,score-bestByType[i])+.3*score,0);
                if(value>gain){best=entry;gain=value;}
            }
            if(!best)break;
            selected.push(best.mon);taken.add(identity(best.mon));
            best.scores.forEach((score,i)=>{bestByType[i]=Math.max(bestByType[i],score);});
            if(sliced)yield;
        }
        if(entries.length<=64)return [...selected,...entries.map(entry=>entry.mon).filter(mon=>!selected.includes(mon))];
        const shortlist=new Set(selected);
        const addDistinct=(ordered,count)=>{
            const seen=new Set();
            for(const {mon} of ordered){
                const key=identity(mon);
                if(seen.has(key))continue;
                seen.add(key);shortlist.add(mon);
                if(seen.size>=count)break;
            }
        };
        addDistinct(entries,lowBudget?20:32);
        // Theme resistance alone can hide high-stat members with strong off-type
        // attacks. Keep a few of these for the full move-by-move comparison.
        for(const key of ['physical','special','speed']){
            addDistinct([...entries].sort((a,b)=>b[key]-a[key]||b.total-a.total||tie(a,b)),lowBudget?4:7);
            if(sliced)yield;
        }
        for(const i of targets.keys()){
            const limit=lowBudget?2:3,best=[];
            for(const [j,entry] of entries.entries()){
                const at=best.findIndex(other=>other.group===entry.group);
                if(at<0||entry.scores[i]>best[at].scores[i]){
                    if(at>=0)best.splice(at,1);
                    if(best.length<limit||entry.scores[i]>best.at(-1).scores[i]){
                        best.push(entry);best.sort((a,b)=>b.scores[i]-a.scores[i]||b.total-a.total||tie(a,b));
                        if(best.length>limit)best.pop();
                    }
                }
                if(sliced&&j%128===127)yield;
            }
            for(const entry of best)shortlist.add(entry.mon);
        }
        return [...shortlist];
    }
    const UNDER_FOE_POOLS=new Map();
    function undergroundFoes(s,theme,floor){
        const nationalMax=DATA.regions.reduce((highest,region)=>{
            const champion=DATA.chapters.find(c=>c.reg===region.key&&c.league&&c.badges.length);
            return champion&&(s.adv.unlocked>champion.id||champion.badges.some(b=>s.adv.badges?.includes(b)))?Math.max(highest,region.dexRange[1]):highest;
        },151);
        const types=UNDER_THEMES[theme],cacheKey=(types?theme:'unknown')+'|'+nationalMax;
        let samples=UNDER_FOE_POOLS.get(cacheKey);
        if(!samples){
            const candidates=DATA.mons.filter(mon=>!mon.baby&&!mon.legend&&!DATA.combat.singles[mon.id]&&(!types||mon.types.some(type=>types.includes(type))));
            const inPool=(lo,hi)=>candidates.filter(mon=>mon.id>=lo&&mon.id<=hi&&!EVOLUTION_DATA.rules[mon.id]?.some(edge=>edge.to<=hi&&MONS.has(edge.to)));
            const total=mon=>Object.values(mon.stats).reduce((sum,stat)=>sum+stat,0);
            const stronger=(a,b)=>total(b)-total(a)||a.id-b.id;
            const wild=inPool(1,nationalMax).sort(stronger),guards=inPool(387,493).sort(stronger).slice(0,10);
            // Guards use the native top-ten Sinnoh pool.
            // Stratify by strength across the whole wild pool (including dual types).
            const count=Math.min(12,wild.length);
            const wildSamples=Array.from({length:count},(_,i)=>wild[Math.floor((i+.5)*wild.length/count)]);
            samples={wild:wildSamples.map(mon=>mon.id),guards:guards.map(mon=>mon.id)};
            UNDER_FOE_POOLS.set(cacheKey,samples);
        }
        const enemyLevel=n=>Math.min(100,Math.round(30+(n-1)*.7));
        const level=enemyLevel(Math.ceil(floor/10)*10);
        const foes=[...samples.wild.map(id=>({id,weight:1,level:enemyLevel(floor)})),
            ...samples.guards.map(id=>({id,weight:1,level,statMult:2}))];
        return{foes,level};
    }
    function undergroundTeamContext(s,settings,bay,floor,pool){
        const context=battleContext(s,'under',{slot:bay,floor});
        const levels=pool.map(mon=>mon.level).sort((a,b)=>b-a);
        // Probe at the chosen start and near the level of the third strongest candidate.
        const later=Math.min(300,Math.max(floor+10,Math.round(1+((levels[2]||30)-30)/.7)));
        // Stress-test a guard checkpoint for depth. For income, weight later guards by their regular cadence.
        const money=settings.underGoal==='money',probe=money?later:Math.ceil(later/10)*10;
        // A high-start depth team should also be able to face a harder guard
        // near a checkpoint the player has already reached.
        const reached=Math.min(300,floor+60,Math.floor((s.under?.best||0)/10)*10);
        const stages=!money&&floor>=75&&levels[2]>=95&&reached>probe?[[floor,.5],[probe,.3],[reached,.2]]:[[floor,.55],[probe,.45]];
        const theme=s.under?.next?.[bay],foes=[];
        for(const [start,share] of stages){
            const group=start===floor?context.foes:undergroundFoes(s,theme,start).foes;
            const guards=group.filter(f=>f.statMult===2).length;
            const wild=group.length-guards;
            const toGuard=10-start%10;
            const guardFloor=Math.ceil(start/10)*10;
            const band=start>=150?5:start>=100?4:start>=75?3:start>=50?2:start>=25?1:0;
            // Expected floor money with the reference loot pool. Account unlocks can change roll weights.
            const floorGold=[100,150,200,250,300,350][band]+2*[150,300,450,600,800,1000][band]*[.80,.765,.73,.7095,.653,.617][band];
            for(const f of group){
                const guard=f.statMult===2;
                foes.push({...f,guard,statMult:(f.statMult||1)*(1+.007*Math.max(0,(guard?guardFloor:start)-101)),
                    // A multiple of ten starts with both a wild fight and a guard.
                    weight:share*(guard?1/(guards*(start===floor||!money?(start%10===0?1:toGuard+1):10)):1/wild),
                    floorGold});
            }
        }
        return {...context,foes,pool,themeTypes:UNDER_THEMES[theme]||Object.keys(DATA.types),force:true,objective:settings.underGoal==='money'?'underMoney':'underDepth'};
    }
    // Public native Underground.starts(), build c8fb8b2e96. The best reached
    // floor is credited on return. A live native bay menu is authoritative on send.
    function undergroundStatus(s,now=Date.now()){
        const under=s.under||{},day=parisDay(now),extra=Math.min(3,Math.max(0,Math.floor(Number(under.extra)||0))),slots=Array.isArray(under.slots)?under.slots:[];
        const perDay=8+[1,1,2].slice(0,extra).reduce((n,value)=>n+value,0),sent=under.day===day?Math.max(0,Math.floor(Number(under.sent)||0)):0;
        const ready=slots.filter(slot=>slot.recalled!=null||Number.isFinite(+slot.end)&&+slot.end>0&&+slot.end<=now),running=slots.filter(slot=>!ready.includes(slot));
        const ends=running.map(slot=>Number(slot.end)).filter(end=>Number.isFinite(end)&&end>now);
        const best=Math.max(0,Math.floor(Number(under.best)||0)),startFloors=UNDER_START_FLOORS.filter(floor=>floor===1||floor<=best);
        return{day,slots,ready,running,perDay,sent,left:Math.max(0,perDay-sent),capacity:Math.max(1+extra,slots.length),best,startFloors,nextReturn:ends.length?Math.min(...ends):now+60000,nextReset:nextParisReset(now)};
    }
    function undergroundBay(s,bay,status=undergroundStatus(s)){
        const {slots,capacity}=status,index=Number(bay);if(!Number.isInteger(index)||index<0||index>=capacity)return null;
        // Native expeditions from older saves can have no bay or duplicate bay numbers.
        // Match the visible bay allocator instead of treating the bay as an array index.
        const direct=slots.find(slot=>slot.bay===index);if(direct)return direct;
        const legacy=slots.filter((slot,i)=>slot.bay==null||slot.bay>=capacity||slots.some((other,j)=>j<i&&other.bay===slot.bay));
        const free=Array.from({length:capacity},(_,i)=>i).filter(i=>!slots.some(slot=>slot.bay===i&&!legacy.includes(slot)));
        return legacy[free.indexOf(index)]||null;
    }

    function adventureTeamWeatherKey(s,members,now){
        return JSON.stringify(members.map(chapter=>combatWeather(s,{chapter},{},now).signature));
    }
    function adventureTeamPolicy(s,members,settings,pinned){
        const choices=members.map(id=>CHAPTERS.get(id)?.foesByStarter).filter(Boolean)
            .map(branch=>starterChoice(s,branch.key,Object.keys(branch.choices||{}).map(Number)));
        return JSON.stringify([settings.mode,pinned,helperSwitchEnabled(s,settings),choices]);
    }
    class Engine {
        constructor(storage, settings = {}) {
            this.storage = storage; this.settings = normalizeSettings(settings); this.running = false;
            this.status = '已就绪，点击开始'; this.action = ''; this.logs = []; this.account = null;
            this.metrics = {}; this.telemetry = new Telemetry(this.metrics); this.cooldowns = {}; this.raidCooldown = {};
            this.rankingJobs=new Map();
            this.target = null; this.visit = null; this.nextRaid = 0; this.raidProbe = false; this.raidCheckNote=''; this.raw = null;
            this.progressSignature = ''; this.lastProgress = Date.now(); this.driver = new DOMDriver(this);
            this.timer = null; this.runId = 0; this.nextLegend = 0; this.lease = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            this.manual = null; this.inputHeld = false; this.restoring = false;this.suspended=null;
            this.legendProbe=null;this.farmWait=null;
            this.teamCheck = null; this.teamRetryAt = 0;
            this.automation=new Automation(this);this.services=normalizeServiceState();this.backgroundYield=false;this.budget=new Budget(this);this.queue=[];this.queueIndex=0;this.queueRunning=false;this.checkpoint=null;this.nextWake=null;
            this.nurseryMonitor=new NurseryMonitor(this);
            this.daily=null;this.dailyMarks={};this.dailyCheckAt=0;
            this.coach=new LevelCoach(this);this.preparation=null;this.raidPreparation=null;
        }
        log(text) { this.logs.unshift({ time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), text }); this.logs.length = Math.min(60, this.logs.length); }
        read() {
            const raw = this.storage.getItem(SAVE_KEY);
            if (!raw) return null;
            if (raw !== this.raw) { const state = decodeSave(JSON.parse(raw)); if (!state || !Array.isArray(state.mons) || !state.dex || typeof state.dex !== 'object') throw new Error('无法识别游戏存档'); this.state = state; this.raw = raw;this.nurseryMonitor.observe(state,Date.now(),false); }
            if(this.running&&this.walletScope&&this.startMoney===null&&accountId(this.state)===this.account){
                const balance=combinedWalletMoney(this.state);
                if(balance!==null){this.startMoney=balance;this.walletScope='rebased';}
            }
            return this.state;
        }
        sessionMoneyNet(s){
            if(!this.started)return 0;
            if(this.endedTotals)return this.endedTotals.money;
            const total=combinedWalletMoney(s);
            return total===null||!Number.isFinite(this.startMoney)?null:Math.round(total-this.startMoney);
        }
        loadAccount(s) {
            const id = accountId(s), switching = this.account !== null && this.account !== id;
            if (switching) {
                if (this.running || this.suspended) throw new Error('请先结束上一账号的任务');
                this.cancelRouteRankings();
                for (const field of SESSION_FIELDS) delete this[field];
                this.endedTotals=null;
                this.queueRunning = false;
                this.tabToken = undefined;
                this.target = this.visit = this.preparation = this.nextWake = null;
                this.cooldowns = {}; this.raidCooldown = {}; this.logs = []; this.action = '';
                this.driver = new DOMDriver(this); this.automation = new Automation(this);
                this.budget = new Budget(this); this.coach = new LevelCoach(this);
                this.status = '已切换账号，已载入当前账号的任务配置';
            }
            if(switching)this.raidCheckNote='';
            this.account = id;
            let saved = {};
            try { saved = JSON.parse(this.storage.getItem(PREFIX + id) || '{}') || {}; } catch {}
            this.metrics = readRouteHistory(saved.metrics);
            this.raidDraw=saved.raidDraw||null;
            this.daily=null;this.dailyMarks={};
            for(const key of ['window','candy','world','attack','towerFirst','tower','elite']){
                if(Number.isFinite(saved.dailyMarks?.[key]))this.dailyMarks[key]=saved.dailyMarks[key];
            }
            this.settings = normalizeSettings(saved.settings||{},switching?DEFAULTS:this.settings);
            this.refreshAutoPurchase();
            this.queue = normalizeJobs(saved.queue);
            this.queueIndex = Number.isInteger(saved.queueIndex) ? Math.max(0, Math.min(this.queue.length, saved.queueIndex)) : 0;
            this.checkpoint = saved.resume?.wanted ? migrateDailyResume(saved.resume) : null;
            this.services = normalizeServiceState(saved.services);
            this.telemetry = new Telemetry(this.metrics);
            this.nurseryMonitor.load(s);
        }
        refreshAutoPurchase() {
            if (!this.account) return this.settings.autoPurchase;
            try {
                const saved = this.storage.getItem(PREFIX + 'purchase:' + this.account);
                if (saved !== null) this.settings.autoPurchase = saved === '1';
                return this.settings.autoPurchase;
            } catch {
                return false;
            }
        }
        taskSettings(raw) {
            const settings = normalizeSettings(raw);
            settings.autoPurchase = this.refreshAutoPurchase();
            return settings;
        }
        setAutoPurchase(enabled) {
            if (typeof enabled !== 'boolean' || !this.account) throw new Error('请先进入游戏，再更改自动购买');
            if (this.suspended || (enabled && this.running)) throw new Error('请先停止任务，再开启自动购买');
            if (!this.mayPersist()) {
                const reason = '当前标签页无法保存自动购买开关，请在管理该账号的标签页操作';
                if (!enabled && this.running) this.stop(reason, {persist:false});
                throw new Error(reason);
            }
            if (enabled) {
                const current = this.read();
                if (!current?.adv || accountId(current) !== this.account) throw new Error('当前账号已变化，请刷新后开启自动购买');
            }
            const key = PREFIX + 'purchase:' + this.account;
            try {
                this.storage.setItem(key, enabled ? '1' : '0');
            } catch {
                const reason = '自动购买开关保存失败，请检查浏览器存储';
                if (!enabled && this.mayPersist()) {
                    this.settings = {...this.settings, autoPurchase:false};
                    // Stopping also replaces the former enabled resume checkpoint when storage is nearly full.
                    this.stop(reason);
                    if (this.mayPersist()) {
                        try {
                            this.storage.setItem(key, '0');
                            this.status = '已关闭自动购买，任务已因首次保存失败而停止';
                            this.log(this.status);
                            return true;
                        } catch {}
                    }
                } else if (!enabled && this.running) this.stop(reason, {persist:false});
                throw new Error(reason);
            }
            this.settings = {...this.settings, autoPurchase:enabled};
            // The account key survives a stale task checkpoint or a queue imported from another account.
            // Preserve an existing resume checkpoint when editing this preference from an idle panel.
            if (this.running) {
                try { this.persist(); } catch { /* The account preference is already durable. */ }
            }
            return true;
        }
        progressSnapshot(){
            const session={};for(const key of SESSION_FIELDS)if(this[key]!==undefined)session[key]=this[key];
            const raid=this.driver.raid;
            const special=this.driver.ownedDialog;
            const flowOwner=this.services.underground&&this.automation.owner?.kind==='receipt'&&this.automation.owner.selector==='.ug-back'?null:this.automation.snapshotOwner();
            return{session,flow:{...this.automation.state},preparation:this.preparation,preparationReady:this.coach.ready,flowOwner,specialDialog:special?{type:special.type,key:special.key,optimized:!!special.optimized,...['factoryTeam','underTeam'].includes(special.type)?{bay:special.bay,floor:special.floor,teamKey:special.teamKey,uids:special.uids,searchBefore:special.searchBefore,sortBefore:special.sortBefore,effBefore:special.effBefore}:{} }:null,raidProbe:this.raidProbe,raidReturn:this.raidReturn,
                activity:{raid:raid?{reg:raid.reg,boss:raid.boss,date:raid.date,started:raid.started}:null,zone:this.zoneId?{id:this.zoneId,started:this.zoneStarted}:null},
                budget:{spent:this.budget.spent,used:this.budget.used}};
        }
        saveJobProgress(snapshot=this.progressSnapshot()){
            const job=this.queueRunning&&this.queue[this.queueIndex];if(!this.restoring&&job&&job.status!=='done'&&this.started)job.progress=snapshot;
        }
        mayPersist(now=Date.now()){
            if(!this.account)return false;
            try{
                if(this.tabToken!==undefined&&this.storage.getItem('pokecatch-tab')!==this.tabToken)return false;
                const raw=this.storage.getItem(PREFIX+'lease:'+this.account);
                let held=null;try{held=JSON.parse(raw);}catch{}
                return !(held?.token!==this.lease&&held?.expires>now);
            }catch{return false;}
        }
        persist(wanted=this.running,captureJob=this.running) {
            // A stale tab can stop or receive pagehide after another tab has saved its
            // checkpoint. Its cleanup must not replace that owner's task or settings.
            if (!this.mayPersist()) return false;
            const entries = Object.entries(this.metrics).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 200);
            const snapshot=this.progressSnapshot();if(captureJob)this.saveJobProgress(snapshot);
            const resume=wanted&&this.settings.resumeOnReload?{...snapshot,wanted:true,account:this.account,build:DATA.build,layout:DATA.layout,at:Date.now(),settings:this.settings,daily:this.daily,manual:this.manual,queueRunning:this.queueRunning,queueIndex:this.queueIndex}:null;
            const record=JSON.stringify({ settings: this.idleTaskSettings(), metrics: Object.fromEntries(entries),queue:this.queue,queueIndex:this.queueIndex,resume,services:this.services,raidDraw:this.raidDraw,dailyMarks:this.dailyMarks });
            this.storage.setItem(PREFIX + this.account, record);
            if(this.suspended)this.suspended.record=record;
            // Keep the Telemetry object stable, but prune only after durable persistence.
            const retained=new Set(entries.map(([key])=>key));
            for(const key of Object.keys(this.metrics))if(!retained.has(key))delete this.metrics[key];
            return true;
        }
        startQueue(){if(this.running)return;this.queue=normalizeJobs(this.queue);this.queueIndex=this.queue.findIndex(job=>job.status!=='done');if(this.queueIndex<0){this.status='队列中没有待执行任务';return;}this.queueRunning=true;this.settings=this.taskSettings(this.queue[this.queueIndex].settings);this.queue[this.queueIndex].status='running';this.start();}
        beginTask(s,cp,now,continuingQueue=false){
            this.cancelTeamSearch();
            this.cancelRouteRankings();
            this.budget=new Budget(this,cp?.budget);
            const cfg=this.settings;
            this.startBattle = !cp && s.adv.battle ? this.ordinaryBattleKey(s) : null;
            this.startItems=itemCounter(s,cfg.itemId);
            this.sessionItemId=cfg.itemId;
            this.trainProtected=cfg.mode==='train'?trainingUids(s,cfg):[];
            this.trainingSelection=cfg.trainUid;
            this.startTrainingXp=cfg.mode==='train'?experienceTotal(s,this.trainProtected):null;
            const xpRegion=cfg.mode==='train'?economicRegion(s):null;
            this.trainingXpMultiplier=xpRegion?DATA.economy.xpMultipliers[xpRegion]:null;
            this.trainingXpRebased=false;

            this.target=this.visit=this.telemetry.sample=null;
            this.teamCheck=this.driver.teamTask=this.driver.navigation=this.driver.pendingMap=null;
            this.driver.ownedDialog=this.driver.raid=null;
            this.driver.giftReceipt=null;
            this.preparation=this.raidPreparation=this.coach.checked=this.coach.ready=this.coach.combat=null;
            this.zoneId=this.zoneStarted=this.legendProbe=this.farmWait=this.weatherWindow=null;
            this.dailyZoneExit=null;
            this.weatherFarm=null;this.weatherEvidence=null;
            this.roamStarted=null;
            this.roamProbeAt=this.roamRestartAt=this.lastExplore=this.teamRetryAt=0;
            this.raidProbe=false;this.raidCheckNote='';this.raidBoundarySince=null;
            this.raidReturn=this.nextWake=this.modalWaitSince=this.modalWaitNode=null;
            this.nextRaid=this.nextLegend=0;
            this.progressSignature='';
            this.lastProgress=now;
            this.action='';
            this.automation.begin(s);
            if(!cp)return;

            // A queued job can have its own older checkpoint. Keep the current run's
            // wallet baseline, start time and original loops when handing off to it.
            for(const key of SESSION_FIELDS){
                if(continuingQueue&&['started','startMoney','walletScope','oldLoops'].includes(key))continue;
                if(cp.session?.[key]!==undefined)this[key]=cp.session[key];
            }
            // Older checkpoints could schedule ten minutes past the day of the last probe.
            if(Number.isFinite(cp.at)&&Number.isFinite(this.nextRaid))this.nextRaid=Math.min(this.nextRaid,nextParisReset(cp.at));
            if(xpRegion){
                if(cp.session?.startTrainingXp!=null&&!recordedXpCompatible(xpRegion,cp.session.trainingXpMultiplier)){
                    this.startTrainingXp=experienceTotal(s,this.trainProtected);
                    this.trainingXpRebased=true;
                    this.log('练级经验已按当前地区曲线从恢复时重新计数');
                }
                this.trainingXpMultiplier=DATA.economy.xpMultipliers[xpRegion];
            }
            // Older checkpoints kept the active wallet only. Its starting side is unknown.
            if(!continuingQueue&&(!['all','rebased'].includes(cp.session?.walletScope)||!Number.isFinite(this.startMoney))){
                this.startMoney=combinedWalletMoney(s);this.walletScope='rebased';
            }
            this.automation.state=cp.flow||this.automation.state;
            // Time spent on a closed page cannot tell us whether the native travel animation stalled.
            if(this.automation.state.departure)this.automation.state.departure.at=now;
            if(cfg.autoPrepare&&cp.preparation?.mode===cfg.mode&&Array.isArray(cp.preparation.targets)&&Array.isArray(cp.preparation.uids))this.preparation=cp.preparation;
            if(Array.isArray(cp.preparationReady?.targets))this.coach.ready=cp.preparationReady;
            this.raidReturn=cp.raidReturn||null;
            if(this.manual)return;
            this.automation.restoreOwner(cp.flowOwner);
            if(['team','ally','factoryTeam','underTeam'].includes(cp.specialDialog?.type))this.driver.ownedDialog={...cp.specialDialog,started:now};
            if((cp.raidProbe||this.raidReturn)&&!s.adv.event?.raid){
                this.raidProbe=true;
                this.raidProbeStarted=now;
                if(cp.activity?.raid)this.driver.raid={...cp.activity.raid};
            }
        }
        idleTaskSettings(){
            if(!this.daily)return this.settings;
            return {...this.daily.base,mode:this.daily.menuMode||this.daily.base.mode,autoPurchase:this.settings.autoPurchase};
        }
        yieldLegendToDaily(s,now){
            const zone=s.adv.zone,daily=this.daily;
            if(!daily||daily.job||!zone||zone.elite||zone.id===493||zone.id!==this.zoneId){
                if(this.dailyZoneExit){
                    this.dailyZoneExit=null;this.dailyCheckAt=0;
                    if(!zone&&['map','adventure'].includes(this.driver.navigation?.screen))this.driver.navigation=null;
                }
                return false;
            }
            if(!this.dailyZoneExit){
                const flow=this.automation.state;
                if(this.preparation||this.driver.ownedDialog||this.automation.owner||this.services.underground||
                    flow.eggService||flow.evolution||flow.hatch||this.automation.buddyTask||this.automation.buffUI||flow.autoBuffTx)return false;
                if(now<this.dailyCheckAt)return false;
                const plan=dailyFacility(s,daily.base,this.dailyMarks,now);
                if(!plan){this.dailyCheckAt=Math.min(nextParisReset(now),now+30000);return false;}
                this.dailyZoneExit={kind:plan.kind};
                daily.checking=true;
            }
            const exit=this.dailyZoneExit,label=MODE_NAMES[exit.kind],battle=s.adv.battle;
            this.lastProgress=now;
            if(s.adv.pending||battle?.enemies?.some(m=>m.shiny||m.id===(zone.foe||zone.id))){
                this.status=label+(s.adv.pending?.type==='riddle'?'已排队，请先处理当前铭文谜题':'已排队，等待当前捕获或游戏选择结算');
                exit.started=null;this.driver.nav('adventure');return true;
            }
            const back=CHAPTERS.get(zone.back??s.adv.chapter);
            exit.started??=now;
            if(!back||now-exit.started>60000){
                this.stop('无法确认已退出传说地图，请在游戏地图返回普通章节后继续通关日常');return true;
            }
            this.status='返回'+back.name+'，准备'+label;
            if(!exit.clicked)exit.clicked=this.driver.map(back,s,{leaveZone:true});
            return true;
        }
        dailyStep(s,now,windowFirst){
            const {base,job}=this.daily,d=this.driver,a=this.automation,flow=a.state;
            // During the opening pass reserve an available chore even if the current
            // native battle must finish first. No map or facility click happens here.
            const safe=safeRaidDeparture(s);
            if(s.adv.pending||s.adv.event||s.adv.zone||s.adv.tower||s.adv.league)return false;
            if(!safe&&!job&&(!this.daily.checking||!s.adv.battle))return false;
            if(this.preparation||this.raidProbe||this.raidReturn||d.raid||
                d.teamTask||d.ownedDialog||a.owner||a.buddyTask||a.buffUI||flow.autoBuffTx||
                flow.hatch||flow.eggService||flow.evolution||this.services.underground)return false;
            if(job){
                if(!windowFirst)return false;
                if(job.kind==='window'&&now>=job.until){
                    this.returnFromDaily('捕获窗口已结束',now,now);return true;
                }
                // Settlement and in-flight native launches keep their own confirmation timeouts.
                if(job.kind!=='window'&&now-job.started>90000&&!job.launched&&
                    !flow.candyLaunch&&!flow.candyRun&&!flow.candyDone&&!flow.towerLaunch&&
                    !flow.towerWasActive&&!flow.towerReached&&!(now-flow.worldResultAt<5000)&&!flow.worldCaptureStarted){
                    this.returnFromDaily('活动入口暂不可用，稍后重试',now+30*60000,now);return true;
                }
                return false;
            }
            if(d.pendingMap||d.navigation)return false;
            let plan;
            if(windowFirst){
                if(!base.dailyWindow||now<this.dailyWindowCheckAt||now<this.dailyMarks.window)return false;
                this.dailyWindowCheckAt=now+30000;
                plan=dailyCaptureWindow(s,base,now);
            }else{
                if(now<this.dailyCheckAt)return false;
                this.dailyCheckAt=Math.min(now+30000,nextParisReset(now));
                plan=dailyFacility(s,base,this.dailyMarks,now);
            }
            if(!plan)return false;
            this.daily.checkpoint=this.progressSnapshot();
            this.daily.job={kind:plan.kind,until:plan.until,started:now,waitingForBattle:!safe};
            this.settings=this.taskSettings({...base,...plan.settings,autoPrepare:false,raids:false,
                ...(plan.kind==='window'?{autoTeam:false}:{})});
            this.beginTask(s,{budget:this.daily.checkpoint.budget},now,true);
            this.status='通关日常 · '+MODE_NAMES[this.settings.mode];this.log(this.status);this.persist();return true;
        }
        returnFromDaily(reason,until=this.daily.job.until,now=Date.now()){
            const {base,checkpoint,job}=this.daily;
            const s=this.read();
            if(!s?.adv){this.stop('存档不可用，无法恢复挂机');return;}
            this.dailyMarks[job.kind]=job.kind==='window'?now+30000:until;
            this.settings=this.taskSettings(base);
            this.daily.job=null;this.daily.checking=true;delete this.daily.checkpoint;
            this.beginTask(s,{...checkpoint,budget:{used:this.budget.used,spent:this.budget.spent}},now,true);
            this.dailyCheckAt=0;
            this.status=reason+' · 检查剩余日常';this.log(this.status);this.persist();
        }
        completeTask(reason){
            if(this.daily?.job){this.returnFromDaily(reason);return;}
            const state=this.read();if(this.queueRunning&&(state?.adv?.event||state?.adv?.zone||state?.adv?.tower||state?.adv?.league)){this.status='目标已达成，等待当前独立战斗结束后切换队列';this.lastProgress=Date.now();return;}
            if(!this.queueRunning){this.stop(reason);return;}this.log(reason);
            const job=this.queue[this.queueIndex];if(job){job.status='done';job.result=reason;delete job.progress;}
            const index=this.queue.findIndex((job,i)=>i>this.queueIndex&&job.status!=='done');
            if(index<0){this.queueRunning=false;this.stop('任务队列已全部完成');return;}
            this.queueIndex=index;const next=this.queue[index];next.status='running';this.settings=this.taskSettings(next.settings);
            const s=state,now=Date.now();
            this.beginTask(s,next.progress,now,true);
            if(!this.adoptManualPreparation(s,now,true))return;
            this.status=`队列 ${index+1}/${this.queue.length} · ${next.title}`;this.persist();this.onChange?.();
        }
        failTask(reason){if(this.queueRunning&&this.queue[this.queueIndex]){this.queue[this.queueIndex].status='failed';this.queue[this.queueIndex].result=reason;}this.stop(reason);}
        suspend(){
            if(!this.running)return;
            if(!this.mayPersist()){this.stop('另一个标签页接管了游戏',{persist:false});return;}
            const now=Date.now();
            this.suspended=this.restoring?null:{at:now,queueRunning:this.queueRunning,queueIndex:this.queueIndex};
            this.hiddenAt??=now;
            try{
                if(this.suspended)this.suspended.record=this.storage.getItem(PREFIX+this.account);
                this.persist(!this.restoring,!this.restoring);
            }catch{}
            this.running=false;this.runId++;clearTimeout(this.timer);this.timer=null;this.release();
            this.cancelTeamSearch();
            this.cancelRouteRankings();
            if(this.restoring){this.restoring=false;this.status='页面已离开，循环恢复操作已中断';}
        }
        resumeSuspended(explicit=false,now=Date.now()){
            const suspended=this.suspended;if(this.running||!suspended)return false;
            if(!explicit&&!this.settings.resumeOnReload){this.status='页面已返回，点击“继续原任务”后恢复';return false;}
            if(pageHidden()){this.status='后台等待，回到游戏页后可继续原任务';return false;}
            try{
                const s=this.read();if(!s?.adv)throw new Error('游戏存档不可用');
                if(accountId(s)!==this.account||s.adv.layout!==DATA.layout){this.stop('账号或游戏版本发生变化，请刷新检查');return false;}
                if(this.storage.getItem('pokecatch-tab')!==this.tabToken){this.stop('另一个标签页接管了游戏');return false;}
                if(!this.acquire(now)){this.status='等待其他标签页释放助手，再继续原任务';return false;}
                if(this.storage.getItem(PREFIX+this.account)!==suspended.record){
                    // A different page may have settled the order, advanced the queue, or stopped it.
                    this.stop('原任务记录已更新，重新读取账号进度',{persist:false});
                    this.loadAccount(s);
                    this.tryResume();
                    return this.running;
                }
                this.refreshAutoPurchase();
                // BFCache preserves this instance and its native UI; continue the same
                // transaction/session rather than restarting it from initial task settings.
                this.running=true;this.runId++;this.queueRunning=suspended.queueRunning;this.queueIndex=suspended.queueIndex;
                this.suspended=null;this.inputHeld=false;this.clearHeldInput?.();this.stoppedAt=null;
                this.lastProgress=now;this.progressSignature='';
                this.status=this.manual?'页面已返回，继续检查手动控制状态':'页面已返回，继续原任务';this.log(this.status);
                this.persist();this.schedule(50);return true;
            }catch(err){this.stop('页面恢复失败：'+(err?.message||err),{persist:false});return false;}
        }
        tryResume(){
            const cp=this.checkpoint;if(this.running||!cp?.wanted||!this.settings.resumeOnReload||pageHidden())return;
            if(visible($('.title-fx')))return;
            const compatible=record=>record.account===this.account&&record.layout===DATA.layout&&record.build===DATA.build;
            try{
                if(!this.acquire(Date.now())){
                    this.status='等待其他标签页释放助手后续跑';
                    if(!compatible(cp))this.checkpoint=null;
                    return;
                }
                const s=this.read();
                if(!s?.adv||accountId(s)!==this.account){this.checkpoint=null;this.status='当前账号已变化，请重新选择任务';return;}
                // Read the owner's latest queue, receipts and reservations together after taking the lease.
                this.loadAccount(s);
                if(!this.checkpoint||!this.settings.resumeOnReload){this.status='当前账号没有待自动续跑的任务';return;}
                if(!compatible(this.checkpoint)){this.checkpoint=null;this.status='续跑记录与当前账号或版本不一致，请手动开始';this.persist(false,false);return;}
                this.start(true);
            }catch(err){this.status='无法读取最新续跑记录：'+(err?.message||err);}
            finally{if(!this.running)this.release();}
        }
        acquire(now) {
            const key = PREFIX + 'lease:' + this.account;
            let held = null; try { held = JSON.parse(this.storage.getItem(key)); } catch {}
            if (held?.token !== this.lease && held?.expires > now) return false;
            this.storage.setItem(key, JSON.stringify({ token: this.lease, expires: now + 10000 }));
            return JSON.parse(this.storage.getItem(key) || '{}').token === this.lease;
        }
        release() {
            const key = PREFIX + 'lease:' + this.account;
            try { if (JSON.parse(this.storage.getItem(key) || '{}').token === this.lease) this.storage.removeItem(key); } catch {}
        }
        start(resume=false,daily=false) {
            if (this.running) return;
            this.suspended=null;
            let controlDenied=false;
            try {
                if (visible($('.title-fx'))) throw new Error('请先从标题画面进入游戏');
                const s = this.read();
                if (!s?.adv) throw new Error('请先进入游戏并选择初始宝可梦');
                if (s.adv.layout !== DATA.layout) throw new Error(`存档版本不匹配（需要 layout ${DATA.layout}），请更新助手`);
                if (!this.account) this.loadAccount(s);
                const jobProgress=this.queueRunning?this.queue[this.queueIndex]?.progress:null;
                const cp=resume?this.checkpoint:jobProgress?{...jobProgress,settings:this.settings,queueRunning:true,queueIndex:this.queueIndex}:null;
                if(cp){this.settings=this.taskSettings(cp.settings);this.queueRunning=!!cp.queueRunning;this.queueIndex=Number(cp.queueIndex)||0;}
                else this.refreshAutoPurchase();
                if (accountId(s) !== this.account) throw new Error('账号已切换，请刷新页面');
                const mode=daily?dailyMainMode(this.settings):this.settings.mode;
                if(daily&&(!DAILY_BASE_MODES.has(mode)||!s.adv.badges?.includes('Maître')))throw new Error('取得关都冠军徽章后，请在通关日常中选择每日主线');
                if(mode==='train'&&this.settings.trainUid==='selected'&&!cp){
                    const plan=trainingStatus(s,this.settings);
                    if(plan.conflict)throw new Error('指定目标占用同一出战名额，请分成两个培育任务');
                    if(plan.missing)throw new Error('请选择可在当前地区出战的培育目标；手动配队时请先将目标编入队伍');
                }
                const ownedFlow=mode==='tower'&&!!s.adv.tower&&s.adv.tower.kind!=='candy'||mode==='candy'&&s.adv.tower?.kind==='candy'||mode==='elite'&&!!s.adv.league||mode==='world'&&s.adv.zone?.id===493;
                if(!cp?.manual&&((s.adv.event&&!s.adv.event.raid||s.adv.tower||s.adv.league||s.adv.zone?.elite&&mode!=='legend')&&!ownedFlow))throw new Error('当前活动与任务不匹配，请先结束该活动');
                const rememberedRaid=cp?.activity?.raid;
                const resumingRaid=s.adv.event?.raid&&rememberedRaid&&rememberedRaid.reg===(s.adv.event.reg||currentRegion(s))&&rememberedRaid.boss===s.adv.event.id&&(!rememberedRaid.date||rememberedRaid.date===(s.adv.event.date||parisDay()));
                if(FLOW_MODES.has(mode)&&(s.adv.event||s.adv.zone||s.adv.tower||s.adv.league)&&!ownedFlow&&!cp?.manual&&!resumingRaid)throw new Error('请先结束当前战斗，再启动所选独立流程');
                if (mode === 'legend' && s.adv.zone && s.adv.zone.id !== this.settings.legendId) throw new Error('当前传说战与所选目标不同，请先结束当前战斗或调整目标');
                if (mode === 'legend' && s.adv.zone?.elite && !this.settings.legendTier) throw new Error('当前为精英传说战，请先选择目标精英阶级');
                if (!(s.team || []).length && !s.adv.event?.raid && !s.adv.zone && !FLOW_MODES.has(mode) && !['legend','raid'].includes(mode) && (!this.settings.autoTeam || !(s.mons||[]).length)) {
                    const gift=this.driver.giftChoice?.(s);
                    if(!pendingRegionalStarter(s)&&!(gift?.reg&&gift.authorized))throw new Error('冒险队伍为空，请先配置队伍');
                }
                if (mode === 'dex' && ENCOUNTER_DATA_ERRORS.length) throw new Error('图鉴出没数据损坏，请重新安装完整脚本');
                if (!this.acquire(Date.now())) { controlDenied=true;throw new Error('另一个标签页正在运行助手'); }
                this.running = true; this.runId++; this.started = Date.now(); this.stoppedAt = null;this.hiddenAt=null;this.endedTotals=null;
                this.manual = cp?.manual||null; this.interruptedPicker=null; this.inputHeld = false;this.clearHeldInput?.();
                this.startMoney=combinedWalletMoney(s);this.walletScope='all';
                this.tabToken = this.storage.getItem('pokecatch-tab'); this.oldLoops = [...s.adv.loops || []];
                this.errors=0;this.lastCheckpoint=0;
                this.checkpoint=null;
                this.daily=cp?.daily&&!this.queueRunning&&DAILY_BASE_MODES.has(cp.daily.base?.mode)?cp.daily:
                    daily?{base:{...this.settings,mode},menuMode:this.settings.mode,job:null,checking:true}:null;
                if(this.daily)this.daily.checking??=!this.daily.job;
                if(daily)this.settings=this.taskSettings(this.daily.base);
                this.dailyCheckAt=this.dailyWindowCheckAt=0;
                this.beginTask(s,cp,this.started);
                if(!this.manual&&!this.adoptManualPreparation(s,Date.now(),true))return;
                this.log(this.daily?'开始通关日常 · '+(this.daily.job?MODE_NAMES[this.settings.mode]:'检查待办'):`开始${MODE_NAMES[this.settings.mode]}`);
                if (s.adv.event?.raid) {
                    const raid = s.adv.event;
                    const remembered=cp?.activity?.raid,same=remembered?.reg===(raid.reg||currentRegion(s))&&remembered?.boss===raid.id&&(!remembered.date||remembered.date===(raid.date||parisDay()));
                    this.driver.raid = { reg: raid.reg || currentRegion(s), boss: raid.id, date: raid.date || parisDay(), started: same?clamp(remembered.started,1,Date.now(),Date.now()):Date.now(), adopted: true };
                    if(!this.manual&&this.preparation&&this.preparation.context.kind!=='raid'){this.raidPreparation=this.preparation;this.preparation=null;}
                    this.status = `已接管当前团体战 · ${MONS.get(raid.id)?.name || raid.reg} · 尝试 ${raid.loops || 0}/150`;
                    this.log(this.status);
                } else if (s.adv.zone) {
                    this.zoneId = s.adv.zone.id;this.zoneStarted=cp?.activity?.zone?.id===this.zoneId?clamp(cp.activity.zone.started,1,Date.now(),Date.now()):Date.now();
                    this.status = `已接管当前传说战 · ${MONS.get(s.adv.zone.foe || this.zoneId)?.name || this.zoneId}`;
                    this.log(this.status);
                } else this.status = this.daily?.checking?'正在检查通关日常':'规划中';
                if(cp){this.status='已从上次记录续跑 · '+MODE_NAMES[this.settings.mode];this.log(this.status);}
                this.persist(); this.schedule(50);
            } catch (err) { this.status = err.message; this.log(err.message); this.running = false;this.checkpoint=null;if(this.queueRunning&&this.queue[this.queueIndex]){this.queue[this.queueIndex].status='failed';this.queue[this.queueIndex].result=err.message;} try{if(!controlDenied)this.persist(false);}catch{}finally{this.release();} }
        }
        stop(reason = '已停止助手',options={}) {
            const save=options.persist!==false&&this.mayPersist();
            if((this.running||this.suspended)&&this.started&&!this.endedTotals){
                let s=this.state;
                try{s=this.read()||s;}catch{}
                const sameAccount=!!s?.adv&&accountId(s)===this.account;
                this.endedTotals={
                    money:sameAccount?this.sessionMoneyNet(s):null,
                    items:sameAccount?itemCounter(s,this.sessionItemId):null,
                    xp:sameAccount&&this.startTrainingXp!=null?experienceTotal(s,this.trainProtected||s.team):null,
                };
            }
            this.suspended=null;
            this.saveJobProgress();
            if(this.daily){this.settings=this.taskSettings(this.idleTaskSettings());this.daily=null;}
            this.running = false; this.runId++; this.stoppedAt ??= Date.now(); clearTimeout(this.timer); this.timer = null;
            this.cancelTeamSearch();
            this.cancelRouteRankings();
            this.manual = null; this.interruptedPicker=null; this.inputHeld = false;this.clearHeldInput?.(); this.restoring = false;
            this.legendProbe=null;this.farmWait=null;
            this.checkpoint=null;this.automation.owner=null;this.automation.buddyTask=null;this.automation.buffUI=null;this.nextWake=null;this.modalWaitSince=null;
            this.telemetry.sample = null; this.driver.pendingMap = null; this.driver.ownedDialog = null;
            this.driver.teamTask=null;this.driver.navigation=null;
            this.status = reason; this.log(reason);
            // Expose the stopped checkpoint before a waiting page can claim the lease.
            try { if(save)this.persist(false,false); } catch {} finally { this.release(); }
        }
        manualInput(now = Date.now()) {
            if (!this.running || !this.settings.manualPause) return;
            if (!this.settings.manualResume || this.restoring) { this.stop('检测到手动操作，已停止助手'); return; }
            if (!this.manual) {
                this.cancelTeamSearch();
                this.cancelRouteRankings();
                // A launch can be saved between ticks while this.state still describes the old map.
                // Snapshot the latest persisted activity before yielding to the user's first input.
                let s;
                try{ s=this.read();if(!s?.adv)throw new Error('游戏存档不可用'); }
                catch(err){this.stop('手动接管时无法读取游戏存档：'+(err?.message||err));return;}
                if(accountId(s)!==this.account||s.adv.layout!==DATA.layout){this.stop('账号或游戏版本发生变化，请刷新检查');return;}
                const raid = s.adv.event, zone = s.adv.zone;
                this.manual = { since: now, until: now, raid: raidIdentity(s),
                    zone: zone ? JSON.stringify([zone.id, zone.foe, zone.elite]) : null,
                    tower:s?.adv?.tower?JSON.stringify(s.adv.tower):null,league:s?.adv?.league?JSON.stringify([s.adv.league.reg,s.adv.league.tier]):null };
                // Keep a live DOM identity only for the picker this run actually opened.
                const own=this.driver.ownedDialog;
                const ally=own?.type==='ally'&&this.raidProbe&&this.driver.raid&&$('#modal-root.open .raid-dlg');
                this.interruptedPicker=null;
                if(visible(ally))this.interruptedPicker={handoff:this.manual,node:ally,raid:this.driver.raid};
                else if(['team','factoryTeam','underTeam','backgroundUnderTeam'].includes(own?.type)){
                    const close=$('#evt-pick [data-evt-close]');
                    if(visible(close))this.interruptedPicker={handoff:this.manual,node:close};
                }
                this.log('手动控制中；空闲后自动恢复原任务');
                // A user can change the selected map, party or dialog while in control.
                // Keep session goals and the original loop backup, discard interrupted UI work.
                this.target = null; this.visit = null; this.telemetry.sample = null;
                this.driver.pendingMap = null; this.driver.ownedDialog = null; this.raidProbe = false;
                this.driver.teamTask=null;this.driver.navigation=null;this.teamCheck=null;
                if(this.services.underground?.action==='dispatch'&&!this.services.underground.launch)this.services.underground.returning=true;
                this.driver.recent?.clear();
                this.coach.checked=null;this.coach.ready=null;
                this.automation.owner=null;this.automation.rankUI=null;this.automation.buddyTask=null;this.automation.buffUI=null;
                this.automation.eggFX=null;delete this.automation.state.eggReceiptUntil;
                this.legendProbe=null;this.farmWait=null;
                this.nextWake=null;
                this.modalWaitSince=null;
            }
            this.manual.until = now + this.settings.resumeSeconds * 1000;
            this.status = `手动控制中 · ${Math.ceil(this.settings.resumeSeconds)} 秒无操作后恢复`;
            if(this.sleepDelay>1200)this.schedule(50);
        }
        manualWaitState(s=this.state,now=Date.now(),resumeGift=false){
            const state=(reason,mini,status,detail,seconds=0)=>({reason,mini,status,detail,seconds});
            if(this.suspended&&!this.running)return state('suspended','待恢复','页面已挂起 · 等待继续原任务','点击立即恢复继续，或停止助手取消本次任务。');
            if(!this.manual)return null;
            if(!this.running)return state('suspended','待恢复','任务已挂起 · 等待继续原任务','点击立即恢复继续原任务。');
            if(s?.adv?.paused)return state('paused','游戏暂停','游戏已暂停，等待你在游戏内继续','继续游戏后会重新检查手动控制状态。');
            const seconds=Math.max(0,Math.ceil((this.manual.until-now)/1000));
            if(this.inputComposing)return state('composing','选词中','手动控制中 · 等待输入法选词结束','完成输入法选词后开始恢复倒计时。');
            if(this.inputHeld)return state('held','等松开','手动控制中 · 等待松开按键或鼠标','松开后按设置的空闲时间自动恢复。');
            if(seconds>0)return state('countdown',`${seconds}s`,`手动控制中 · ${seconds} 秒后恢复原任务`,'停止操作后自动继续原任务。',seconds);
            if(this.gameInputFocused?.())return state('input','输入中','输入框正在使用，结束输入并移开焦点后恢复','正在编辑的文字会保留；搜索框空闲后会自动移开焦点。');
            const gift=s?.adv&&this.driver.giftChoice?.(s);
            if(gift&&(!resumeGift||!gift.authorized||!this.settings.gifts))return state('gift','待选择','等待你在游戏中完成赠送选择',this.settings.gifts&&gift.authorized?'也可以点击立即恢复，由助手接手选择。':'完成选择后会继续原任务。');
            if((!gift&&visible($('#modal-root.open')))||visible($('#evt-pick')))return state('dialog','待选择','等待你处理游戏选择弹窗，再自动恢复','请在游戏中完成当前选择。');
            if(!s?.adv)return state('unavailable','等待读档','等待游戏存档后恢复原任务','请检查游戏是否已经进入。');
            const raid=s.adv.event,zone=s.adv.zone;
            if(s.adv.tower&&this.manual.tower!==JSON.stringify(s.adv.tower)||s.adv.league&&this.manual.league!==JSON.stringify([s.adv.league.reg,s.adv.league.tier])||raid&&(!raid.raid||!sameManualRaid(s,this.manual.raid))||zone&&this.manual.zone!==JSON.stringify([zone.id,zone.foe,zone.elite])){
                return state('activity','手动活动','手动活动进行中 · 结束后自动恢复原任务','当前手动活动结束后返回原任务。');
            }
            return state('ready','恢复中','手动操作已结束，正在恢复原任务','正在重新规划原任务。');
        }
        adoptManualPreparation(s,now=Date.now(),force=false){
            const p=this.preparation;
            if(!p||p.terminalGoal||this.settings.autoTeam||!p.context)return true;
            const chosen=[...(s.team||[])],planned=p.uids||[],changed=chosen.length!==planned.length||chosen.some((uid,i)=>planned[i]!==uid);
            if(!force&&!changed)return true;
            const index=new Map((s.mons||[]).map(mon=>[mon.uid,mon]));
            if(!chosen.length||chosen.some(uid=>!index.has(uid)||!teamEligible(s,index.get(uid),p.context.reg))){this.failTask('当前手动队伍为空或不符合目标地区条件，请手动配置后继续');return false;}
            const plan=preparationPlan(s,this.settings,rebuildPreparationContext(s,p.context));
            p.uids=chosen;p.originalTeam=[...chosen];p.targets=plan.targets;p.selection=null;
            delete p.resumeReady;delete p.earlyReady;p.assessment=null;p.growth=null;delete p.roadWait;
            if(changed&&p.phase!=='exit'&&p.phase!=='travelFirst')p.phase=plan.targets.length?'team':'restore';
            p.phaseAt=now;p.lastGrowth=now;p.lastTick=now;p.routeCheck=0;p.routeProfile=null;
            if(changed)this.log('保留你新选择的手动队伍，继续原任务和对应补练');
            return true;
        }
        manualStep(s, now, resumeGift=false) {
            if (!this.manual) return false;
            this.lastProgress = now; this.telemetry.sample = null;
            if(this.inputHeld&&!this.inputComposing&&now>=this.manual.until)this.reconcileHeldInput?.(now);
            let wait=this.manualWaitState(s,now,resumeGift);
            if(wait.reason==='input'&&this.releaseIdleGameInput?.())wait=this.manualWaitState(s,now,resumeGift);
            if(this.automation.state.departure||wait.reason==='gift')this.hiddenAt??=now;
            if(wait.reason==='dialog'){
                const picker=this.interruptedPicker,ally=$('#modal-root.open .raid-dlg');
                if(picker?.handoff===this.manual&&picker.raid&&picker.node===ally&&visible(ally)&&!s.adv.event&&!s.adv.zone&&!s.adv.tower&&!s.adv.league&&picker.raid.date===parisDay(now)){
                    this.manual=null;this.interruptedPicker=null;this.raidProbe=true;this.raidProbeStarted=now;
                    this.driver.raid=picker.raid;this.driver.ownedDialog={type:'ally',started:now};
                    this.status='继续为当前团体战选择同伴';return false;
                }
                if(picker?.handoff===this.manual&&!picker.raid&&visible(picker.node)&&
                    (picker.node===$('#evt-pick [data-evt-close]')||picker.node===ally?.querySelector('.dc-x'))){
                    if(this.driver.click(picker.node,'关闭已中断的选择窗口，重新规划',false,true))this.interruptedPicker=null;
                    return true;
                }
                if(this.automation.dismissCompletedDeparture(s,$('#modal-root.open .dp-modal'),true))return true;
                if(this.driver.receipt?.(true)){this.status='已确认捕获结果，准备恢复原任务';return true;}
                if(this.driver.dismissInformation?.(s,true)){this.status='已关闭信息弹窗，准备恢复原任务';return true;}
            }
            if(wait.reason!=='ready'){this.status=wait.status;return true;}
            const raid = s.adv.event, zone = s.adv.zone;
            // Reconcile the saved order on resuming. Time in manual control gave the helper no opportunity to check it.
            const flow=this.automation.state;
            for(const tx of [flow.resourceTx,flow.resourceBuffTx,flow.pensionPurchase,this.preparation?.candyTx]){
                if(tx)tx.at=now;
            }
            this.manual = null; this.interruptedPicker=null; this.target = null; this.visit = null; this.telemetry.sample = null;
            this.driver.pendingMap = null; this.driver.ownedDialog = null; this.raidProbe = false;
            this.driver.teamTask=null;this.teamCheck=null;
            if(!this.adoptManualPreparation(s,now,true))return true;
            if(this.preparation?.phase==='train'){this.preparation.routeCheck=0;this.preparation.routeProfile=null;}
            if(this.raidReturn&&!raid?.raid){this.raidProbe=true;this.raidProbeStarted=now;}
            if (!raid?.raid) this.driver.raid = null;
            if (!zone) { this.zoneId = null; this.zoneStarted = null; }
            this.lastProgress = now; this.progressSignature = ''; this.errors = 0; this.lastExplore = 0;
            this.status = `已恢复${MODE_NAMES[this.settings.mode]}，重新规划中`; this.action = '';
            this.log(this.status); return false;
        }
        resumeManual(now = Date.now()) {
            if(!this.running&&this.suspended&&!this.resumeSuspended(true,now))return;
            if (!this.running || !this.manual) return;
            let s;
            try{s=this.read();if(!s?.adv)throw new Error('游戏存档不可用');}
            catch(err){this.stop('恢复任务时无法读取游戏存档：'+(err?.message||err));return;}
            if(accountId(s)!==this.account||s.adv.layout!==DATA.layout){this.stop('账号或游戏版本发生变化，请刷新检查');return;}
            if(this.storage.getItem('pokecatch-tab')!==this.tabToken||!this.acquire(now)){this.stop('另一个标签页接管了游戏',{persist:false});return;}
            // The explicit resume click ends the handoff, including a release event lost to
            // native pointer capture, an animation, or a browser focus change.
            this.clearHeldInput?.();this.inputHeld=false;
            if(this.gameInputFocused?.())document.activeElement?.blur?.();
            const raid=s.adv.event;
            if(raid?.raid){
                const reg=raid.reg||currentRegion(s),date=raid.date||parisDay(),old=this.driver.raid;
                const same=old?.reg===reg&&old.boss===raid.id&&(!old.date||old.date===date);
                this.driver.raid={reg,boss:raid.id,date,started:same?old.started:now,adopted:true};
                if(this.preparation&&this.preparation.context.kind!=='raid'){this.raidPreparation=this.preparation;this.preparation=null;}
                this.manual.raid=raidIdentity(s);this.raidProbe=false;this.raidReturn=null;
                this.log(`明确接管当前团体战 · ${MONS.get(raid.id)?.name||reg} · 保留尝试 ${raid.loops||0}/150`);
            }
            this.manual.until = now;
            const ally=$('#modal-root.open .raid-dlg');
            if(visible(ally)&&!(this.interruptedPicker?.handoff===this.manual&&this.interruptedPicker.raid?.date===parisDay(now)&&this.interruptedPicker.node===ally)){
                const close=ally.querySelector('.dc-x');
                if(visible(close))this.interruptedPicker={handoff:this.manual,node:close};
            }
            if(s.adv.paused)this.status=this.manualWaitState(s,now).status;
            else this.manualStep(s,now,true);
            this.persist();this.schedule(50);
        }
        schedule(ms = 1200) {
            clearTimeout(this.timer);
            if (!this.running) return;
            const epoch = this.runId;this.sleepDelay=ms;
            // A visibility event can reschedule an already overdue callback before it runs.
            const due=Date.now()+ms;
            this.tickDue=this.tickEpoch===epoch?Math.min(this.tickDue??due,due):due;this.tickEpoch=epoch;
            this.timer = setTimeout(async () => {
                if (epoch !== this.runId) return;
                const now=Date.now();
                this.accountTimerDelay(this.tickDue,now);this.tickDue=null;
                try { await this.step(now); this.errors = 0; }
                catch (err) { this.log(`异常：${err.message}`); this.status = err.message; if (++this.errors >= 3) this.failTask('连续异常，已暂停：' + err.message); }
                try{this.onChange?.();this.renderError=null;}catch(err){if(this.renderError!==err.message)this.log('面板刷新失败：'+err.message);this.renderError=err.message;}
                if (this.running && epoch === this.runId) this.schedule(this.nextDelay());
            }, ms);
        }
        nextDelay(now=Date.now()){
            if(pageHidden())return 6000;
            if(this.manual){const left=Number(this.manual.until)-now;return left>0?Math.min(1200,Math.max(50,left)):1200;}
            if(this.preparation||this.driver.pendingMap||this.driver.teamTask||this.driver.ownedDialog||this.driver.navigation||this.automation.owner||this.automation.buddyTask||this.automation.buffUI||this.automation.state.eggService||this.automation.state.evolution||this.services.underground)return 1200;
            if(this.farmWait?.mode===this.settings.mode)return 6000;
            if(FLOW_MODES.has(this.settings.mode)&&this.nextWake>now)return Math.min(6000,Math.max(1200,this.nextWake-now));
            return 1200;
        }
        accountTimerDelay(due,now){
            if(due==null||now-due<5000)return;
            this.telemetry.sample=null;
            if(this.hiddenAt!=null){this.hiddenAt=Math.min(this.hiddenAt,due);return;}
            this.hiddenAt=due;this.resumeUIClock(now,true);
        }
        backgroundFramesStalled(now){
            if(!backgroundKeepalive(now)||typeof requestAnimationFrame!=='function'){this.frameProbe=null;return false;}
            if(this.frameProbe==null){
                const probe={at:now};
                this.frameProbe=probe;
                requestAnimationFrame(()=>{if(this.frameProbe===probe)this.frameProbe=null;});
            }
            return now-this.frameProbe.at>=8000;
        }
        resumeUIClock(now,delayed=false){
            if(this.hiddenAt==null)return;
            const duration=Math.max(0,now-this.hiddenAt);this.hiddenAt=null;
            if(this.daily?.job&&this.daily.job.kind!=='window')this.daily.job.started+=duration;
            if(this.dailyZoneExit?.started!=null)this.dailyZoneExit.started+=duration;
            if(this.weatherFarm?.started!=null)this.weatherFarm.started+=duration;
            this.lastProgress=delayed?Math.min(now,this.lastProgress+duration):now;
            if(this.roamStarted!=null)this.roamStarted+=duration;
            if(this.raidProbe&&this.raidProbeStarted!=null)this.raidProbeStarted+=duration;
            if(this.driver.ownedDialog?.openingUntil!=null)this.driver.ownedDialog.openingUntil+=duration;
            if(this.legendProbe?.started!=null)this.legendProbe.started+=duration;
            for(const task of [this.driver.ownedDialog,this.driver.teamTask])if(task?.pending?.at!=null)task.pending.at+=duration;
            if(this.driver.navigation){this.driver.navigation.started+=duration;this.driver.navigation.nextAt+=duration;}
            if(this.automation.state.worldResultAt!=null)this.automation.state.worldResultAt+=duration;
            if(this.services.underground){this.services.underground.started+=duration;if(this.services.underground.tx)this.services.underground.tx.at+=duration;if(this.services.underground.launch)this.services.underground.launch.at+=duration;}
            for(const task of [this.driver.pendingMap,this.driver.teamTask,this.driver.ownedDialog,this.automation.owner,this.automation.buddyTask,this.automation.buffUI,this.automation.eggFX,this.automation.evolutionFX,this.automation.state.evolution])if(task?.started)task.started+=duration;
            if(this.automation.state.evolution){this.automation.state.evolution.at+=duration;if(this.automation.state.evolution.clickedAt)this.automation.state.evolution.clickedAt+=duration;}
            if(this.automation.buddyTask?.clickedAt!=null)this.automation.buddyTask.clickedAt+=duration;
            if(this.automation.state.autoBuffTx?.at!=null)this.automation.state.autoBuffTx.at+=duration;
            if(this.automation.state.resourceBuffTx?.at!=null)this.automation.state.resourceBuffTx.at+=duration;
            if(this.automation.state.resourceTx?.at!=null)this.automation.state.resourceTx.at+=duration;
            if(this.automation.state.pensionPurchase?.at!=null)this.automation.state.pensionPurchase.at+=duration;
            for(const tx of [this.automation.rankUI,this.automation.state.rankReceipt,this.automation.state.towerLaunch,this.automation.state.candyLaunch,this.automation.state.underLaunch,this.automation.state.underCollect,this.automation.state.departure])if(tx?.at!=null)tx.at+=duration;
            if(this.automation.state.candyEndedAt!=null)this.automation.state.candyEndedAt+=duration;
            const eggs=this.automation.state;
            if(eggs.eggService){eggs.eggService.started+=duration;if(eggs.eggService.tx)eggs.eggService.tx.at+=duration;}
            if(eggs.hatch?.at!=null)eggs.hatch.at+=duration;
            if(eggs.eggReceiptUntil!=null)eggs.eggReceiptUntil+=duration;
            if(this.modalWaitSince!=null)this.modalWaitSince+=duration;
            const p=this.preparation;
            if(p){for(const key of ['phaseAt','lastGrowth','candyAt'])if(p[key]!=null)p[key]+=duration;if(p.roadWait)p.roadWait.at+=duration;if(p.candyTx)p.candyTx.at+=duration;if(!delayed)p.lastTick=now;else if(p.lastTick!=null)p.lastTick+=duration;}
        }
        serviceBackground(s,now=Date.now()){
            if(!this.running||this.manual||pageHidden())return false;
            const plan=parallelPlan(s,this,now),a=this.automation;
            if(plan.active){
                const handled=plan.active==='underground'?a.serviceUnderground(s,now):plan.active==='eggs'?a.serviceEggs(s,now):a.evolution(s,now);
                if(handled&&!parallelPlan(s,this,now).active){this.services.lastCompleted[plan.active]=now;this.backgroundYield=true;}
                return handled;
            }
            if(plan.mainComplete)return false;
            if(this.backgroundYield){this.backgroundYield=false;return false;}
            for(const id of plan.ready){
                const handled=id==='eggs'?a.serviceEggs(s,now):id==='underground'?a.serviceUnderground(s,now):a.evolution(s,now);
                if(handled){this.services.lastStarted[id]=now;this.persist();return true;}
            }
            return false;
        }
        async step(now = Date.now()) {
            if (!this.running) return;
            const s = this.read(); if (!s?.adv) { this.stop('游戏存档不可用'); return; }
            if (accountId(s) !== this.account || s.adv.layout !== DATA.layout) { this.stop('账号或游戏版本发生变化，请刷新检查'); return; }
            if (this.storage.getItem('pokecatch-tab') !== this.tabToken || !this.acquire(now)) { this.stop('另一个标签页接管了游戏',{persist:false}); return; }
            if (this.settings.stopMinutes && now - this.started >= this.settings.stopMinutes * 60000) { this.stop('达到定时运行上限'); return; }
            const idle=pageHidden()||FLOW_MODES.has(this.settings.mode)&&this.nextWake>now;
            if(now-(this.lastCheckpoint||0)>(idle?15000:5000)){this.lastCheckpoint=now;this.persist();}
            if (pageHidden()) { this.frameProbe=null;this.hiddenAt??=now;this.status = '后台等待；回到游戏标签后继续'; this.lastProgress = now; this.telemetry.sample = null; return; }
            if(this.backgroundFramesStalled(now)){
                this.hiddenAt??=now;this.status='浏览器已暂停游戏画面，等待恢复渲染后继续补练或原任务';
                this.lastProgress=now;this.telemetry.sample=null;return;
            }
            const sleepOverlay=$('.sleep-fx'),sleeping=document.documentElement?.classList?.contains('sleeping')||visible(sleepOverlay);
            if(s.adv.paused||sleeping){this.hiddenAt??=now;this.lastProgress=now;this.telemetry.sample=null;}
            else this.resumeUIClock(now);
            if(s.adv.paused){this.status='游戏已暂停，等待你在游戏内继续';return;}
            if (this.manual && this.manualStep(s, now)) return;
            if(sleeping){
                this.status='游戏进入省电界面，正在唤醒后继续原任务';
                // The native handler restores both its internal sleep state and the active
                // game screen. Removing the html class alone would leave those out of sync.
                this.driver.click(sleepOverlay,'唤醒游戏省电界面',true);
                return;
            }
            const signature = JSON.stringify([s.adv.chapter, s.adv.node, s.adv.runs, s.stats?.battles, s.stats?.wins, s.stats?.caught, s.adv.event?.loops, s.adv.battle?.steps, s.adv.battle?.enemies?.map(m => m.hp)]);
            if (signature !== this.progressSignature) { this.progressSignature = signature; this.lastProgress = now; }
            // Gift FX can cover a departure dialog while the regional save is still settling.
            const gift=this.driver.giftChoice?.(s);
            if(gift){
                this.modalWaitNode=null;this.modalWaitSince=null;this.lastProgress=now;
                this.hiddenAt=now;this.telemetry.sample=null;
                if(this.settings.gifts)this.driver.gift(s,gift);
                else this.status='等待你在游戏中选择赠送，完成后继续原任务';
                return;
            }
            if(!this.automation.owner&&this.automation.state.evolution?.stage==='open'&&visible($('#modal-root.open .mon-modal')))this.automation.restoreOwner({kind:'evolution',selector:'.mon-modal',uid:this.automation.state.evolution.uid});
            if(!this.automation.owner&&this.services.underground?.tx&&visible($('#modal-root.open .ug-back')))this.automation.own('receipt','.ug-back');
            const backgroundUnder=this.services.underground;
            if(backgroundUnder?.action==='dispatch'&&backgroundUnder.editorOpen&&!this.driver.ownedDialog){
                if(visible($('#evt-pick'))){this.driver.ownedDialog={type:'backgroundUnderTeam',teamKey:`under:${backgroundUnder.bay}`,uids:backgroundUnder.uids||[],started:now,cancelled:'页面恢复后先关闭旧队伍窗口，重新核对成员'};backgroundUnder.returning=true;}
                else backgroundUnder.editorOpen=false;
            }
            if(!this.automation.owner&&FLOW_MODES.has(this.settings.mode)){
                const selector={breed:'.dexcard-modal:has(.dc-new)',underground:'.ug-back',tower:'.tw-back',candy:'.cr-back:not(.tw-back)',elite:'.lgp-modal'}[this.settings.mode];
                if(selector&&visible($('#modal-root.open '+selector)))this.automation.own(this.settings.mode==='elite'?'gem':'receipt',selector);
            }
            // FX can cover an owned item card; finish the top overlay before using the card again.
            if ((this.automation.rankUI||this.automation.state.rankReceipt)&&this.automation.advanceTrainingRank(s,now))return;
            if (this.automation.evolutionUI(s,now) || this.automation.eggUI(s,now) || this.driver.animations(s) || this.driver.dismissInformation?.(s) || this.driver.receipt() || this.automation.finishDeparture(s,now) || this.automation.dialog(s) || this.driver.dialog(s)) return;
            if (this.driver.ownedDialog) return;
            if (visible($('#modal-root.open')) || visible($('#evt-pick'))) {
                const blocker=$('#modal-root.open .modal')||$('#evt-pick')||$('#modal-root.open');
                if(this.modalWaitNode!==blocker){this.modalWaitNode=blocker;this.modalWaitSince=now;}
                this.modalWaitSince??=now;
                this.status = '等待游戏弹窗；需要选择时请手动处理';
                if (now - this.modalWaitSince > 120000) this.failTask('弹窗等待超时，请处理后重新开始'); return;
            }
            this.modalWaitSince=null;this.modalWaitNode=null;
            if(!s.team?.length&&pendingRegionalStarter(s)){
                this.lastProgress=now;this.telemetry.sample=null;
                this.status='等待游戏显示初始伙伴选择';this.driver.nav('adventure');return;
            }
            if(this.holdWildShiny(s,now))return;
            if(this.yieldLegendToDaily(s,now))return;
            const inActivity=s.adv.event||s.adv.zone||s.adv.tower||s.adv.league;
            const reserved=this.daily?.job;
            if(reserved?.waitingForBattle&&!inActivity){
                if(now>=reserved.until){this.returnFromDaily('日常时段已结束',now,now);return;}
                if(!safeRaidDeparture(s)){
                    this.status='日常已排队 · '+MODE_NAMES[this.settings.mode]+' · 等待当前遭遇或选择结算';
                    this.lastProgress=now;this.driver.nav('adventure');return;
                }
                reserved.waitingForBattle=false;reserved.started=now;this.persist();
            }
            if(inActivity&&this.daily?.job&&this.daily.job.kind!=='window')this.daily.job.started=now;
            const outcome=inActivity?null:this.preparation?.terminalGoal||adventureTaskOutcome(s,this,now);
            if(!outcome&&!this.adoptManualPreparation(s,now))return;
            const startingBattle = !!this.startBattle && this.startBattle === this.ordinaryBattleKey(s);
            if (!startingBattle) this.startBattle = null;
            const flow=this.automation.state;
            const settling=!!(this.services.underground||flow.hatch||flow.eggService||flow.evolution||flow.autoBuffTx||this.automation.buffUI||this.automation.buddyTask);
            const foregroundFirst=startingBattle&&!settling;
            // A finite main goal can already be satisfied at login or by a facility reward.
            // Give remaining daily work a turn before honoring the main task's stop condition.
            const finishDaily=outcome&&!outcome.failed&&this.daily&&!this.daily.job&&!this.preparation;
            if(finishDaily&&this.driver.raid&&!this.raidProbe&&!this.raidReturn)this.finishRaidReturn(now);
            const opening=this.daily?.checking&&!this.daily.job&&!inActivity;
            const scheduleDaily=opening||!outcome||finishDaily;
            if(opening&&this.driver.raid&&!this.raidProbe&&!this.raidReturn)this.finishRaidReturn(now);
            if(opening&&s.adv.pending&&!settling){
                this.status='检查日常前等待当前游戏选择结算';this.lastProgress=now;this.driver.nav('adventure');return;
            }
            if(opening&&this.dailyStep(s,now,false))return;
            if(this.daily&&!inActivity&&scheduleDaily&&this.dailyStep(s,now,true))return;
            if(this.settings.mode!=='raid'&&this.daily&&(opening||!foregroundFirst||finishDaily)&&!inActivity&&scheduleDaily&&this.priorityRaid(s,now))return;
            if(!opening&&this.daily&&!inActivity&&scheduleDaily&&this.dailyStep(s,now,false))return;
            if(opening&&!settling&&!this.driver.teamTask&&!this.preparation&&!this.raidProbe&&!this.raidReturn){
                if(this.raidBoundarySince!=null){
                    this.status='每日团体战已排队，等待当前遭遇结算';this.lastProgress=now;this.driver.nav('adventure');return;
                }
                this.daily.checking=false;
                this.log('当前可执行日常已检查，开始挂机 · '+MODE_NAMES[this.settings.mode]);this.persist();
            }
            if(!inActivity&&!outcome&&!this.preparation&&!this.raidProbe&&!this.raidReturn&&!settling&&!this.driver.teamTask&&this.followMarkedHunt(s,now))return;
            if(this.settings.mode!=='raid'&&!this.daily&&!foregroundFirst&&!inActivity&&scheduleDaily&&this.priorityRaid(s,now))return;
            const enteringFacility=this.daily?.job&&this.daily.job.kind!=='window'&&!inActivity;
            if(!foregroundFirst&&(!enteringFacility||settling)&&this.serviceBackground(s,now))return;
            if(!inActivity&&!outcome&&!settling&&!this.daily?.job&&!this.preparation&&!this.driver.teamTask&&
                !this.raidProbe&&!this.raidReturn&&!this.driver.raid&&this.weatherFarmStep(s,now))return;
            if(finishDaily&&!safeRaidDeparture(s)&&(dailyFacility(s,this.daily.base,this.dailyMarks,now)||this.raidBoundarySince!=null)){
                this.status='每日主线已达标，当前战斗结束后处理剩余日常';this.lastProgress=now;return;
            }
            if(this.settings.mode==='candy'&&s.adv.tower?.kind==='candy'&&this.preparation?.context.kind==='candy'){
                // A user may launch the daily run while preflight training is handed off.
                // Its cloned roster is now fixed; restore the old party after settlement.
                this.automation.state.candyPreparation=this.preparation;this.preparation=null;this.driver.teamTask=null;
                this.log('已进入糖果工厂，保留本场机会；入场前队伍在结算后恢复');this.persist();
            }
            if(this.raidPreparation&&!s.adv.event?.raid&&!this.preparation&&!this.raidProbe&&!this.raidReturn){
                if(this.driver.raid){this.nextRaid=raidRetryAt(now,this.driver.raid.date);this.raidCheckNote='团体战已结束，恢复之前的补练';}
                this.preparation=this.raidPreparation;this.raidPreparation=null;this.driver.raid=null;
                this.preparation.phaseAt=now;this.preparation.lastGrowth=now;this.preparation.lastTick=now;
                if(this.preparation.candyAt!=null)this.preparation.candyAt=now;
                if(this.preparation.candyTx)this.preparation.candyTx.at=now;
                if(this.preparation.roadWait)this.preparation.roadWait.at=now;
                this.preparation.routeCheck=0;this.preparation.routeProfile=null;this.lastProgress=now;
                this.log('继续之前的补练任务');
            }
            const canCultivate=!inActivity&&!this.preparation&&!this.raidProbe&&!this.raidReturn&&!settling&&this.settings.mode==='train';
            if(canCultivate&&this.settings.trainUid==='selected'&&this.settings.autoTeam&&!outcome?.failed){
                const ids=trainingUids(s,this.settings,this.trainProtected);
                const needsParty=ids.some(uid=>!s.team.includes(uid))&&(!outcome||trainingGemTarget(s,this.settings,ids,this.budget,this.automation.state.rankSkipped));
                if(needsParty){
                    if(this.driver.teamTask){this.driver.adventureTeam(s,now);return;}
                    if(now<this.teamRetryAt){this.status='等待游戏允许重新配置培育队伍';this.lastProgress=now;return;}
                    this.driver.teamTask={uids:trainingParty(s,ids),members:[s.adv.chapter],chapter:s.adv.chapter,started:now,attempts:0};
                    this.status='正在把指定培育目标编入冒险队伍';return;
                }
            }
            if(canCultivate&&!this.driver.teamTask&&this.settings.trainGems){
                const target=trainingGemTarget(s,this.settings,this.trainProtected,this.budget,this.automation.state.rankSkipped);
                if(target && this.automation.advanceTrainingRank(s,now,target))return;
            }
            if(outcome){
                const p=this.preparation;
                if(!p){
                    if(outcome.failed)this.failTask(outcome.reason);
                    else this.completeTask(outcome.reason);
                    return;
                }
                if(!p.terminalGoal){
                    p.terminalGoal=outcome;
                    if(p.phase!=='restore'){
                        this.driver.teamTask=null;
                        this.coach.setPhase(p,'restore',now);
                    }
                }
            }
            if(!this.preparation&&!outcome&&this.settings.autoPrepare){
                const context=this.coach.activity(s),zone=s.adv.zone&&DATA.zones.find(z=>z.id===s.adv.zone.id);
                const resume=context?.kind==='raid'?{type:'raid'}:zone?{row:routeDescriptor({...zone,key:`Z${zone.id}`,members:[],name:zone.monName||zone.name}),options:{zone:true,tier:s.adv.zone.elite||0,optimize:this.settings.optimizeRaid}}:{};
                if(context&&this.ensurePrepared(s,context,resume,now))return;
                const adventure=!context&&this.coach.adventure(s,outcome);
                if(adventure&&this.ensurePrepared(s,adventure.context,adventure.resume,now))return;
            }
            if(this.driver.teamTask&&this.driver.adventureTeam(s,now))return;
            if(!startingBattle&&!outcome&&this.settings.activeSwitch&&this.driver.switchInBattle(s,now))return;
            if(this.preparation){this.coach.step(s,now);return;}
            if(this.raidReturn&&this.raidProbe&&!s.adv.event?.raid){this.probeRaid(s,now);return;}
            if (s.adv.event?.raid) {
                if (now - this.lastProgress > 180000) { this.stop('3 分钟没有游戏进展，请检查网络、待选项或队伍'); return; }
                this.raidProbe = false; this.raidReturn=null; this.telemetry.sample = null;
                const raid = this.driver.raid;
                if (!raid) { this.stop('团体战尚未接管，请点击开始助手'); return; }
                if (raid.reg !== (s.adv.event.reg||currentRegion(s)) || raid.boss !== s.adv.event.id) { this.stop('团体战目标已变化，请重新开始接管'); return; }
                const attempts = s.adv.event.loops || 0;
                this.status = `团体战进行中 · ${MONS.get(s.adv.event.id)?.name || s.adv.event.reg} · 尝试 ${attempts}/150`;
                this.raidCheckNote='团体战进行中 · '+(MONS.get(s.adv.event.id)?.name||s.adv.event.reg);
                if (now - raid.started > this.settings.raidMinutes * 60000) {
                    if (this.driver.leaveRaid()) {
                        const day=raid.date||s.adv.event.date||parisDay(now);
                        this.raidCooldown[day+'|'+raid.reg]=raidRetryAt(now,day,1800000);
                        this.raidCheckNote=day===parisDay(now)?'团体战达到时限，稍后重试':'上一日团体战已退出，接下来检查今日抽取';
                        this.nextRaid=raidRetryAt(now,day);this.driver.raid=null;this.log(this.raidCheckNote);
                    }
                } else if(!this.driver.activeTeam?.(s))this.driver.nav('adventure');
                return;
            }
            if (this.driver.raid && !this.raidProbe)this.finishRaidReturn(now);
            if(this.settings.mode==='raid'&&!inActivity){
                this.lastProgress=now;
                const rest=this.raidDailyStatus(s,now);
                if(this.priorityRaid(s,now,rest))return;
                this.status=rest?rest.reason+(rest.until?' · 等待每日刷新':''):this.raidBoundarySince!=null?'团体战已排队，等待当前战斗结算':this.raidCheckNote||'等待团体战入口';
                if(this.raidBoundarySince!=null)this.driver.nav('adventure');
                return;
            }
            if(FLOW_MODES.has(this.settings.mode)){this.automation.step(s,now);return;}
            if(this.farmWait?.mode===this.settings.mode){this.lastProgress=now;this.farmWait=null;}
            if (now - this.lastProgress > 180000&&!this.driver.pendingMap?.waiting) { this.stop('3 分钟没有游戏进展，请检查网络、待选项或队伍'); return; }
            if (s.adv.zone) {
                this.telemetry.sample = null;
                if (this.zoneId !== s.adv.zone.id) { this.stop('检测到手动传说战，已交还控制'); return; }
                this.status = `${s.adv.zone.elite ? '精英传说战' : '捕获传说'} · ${MONS.get(s.adv.zone.foe || s.adv.zone.id)?.name || this.zoneId}`;
                if (s.adv.pending?.type === 'riddle') { this.stop('遇到铭文谜题，请手动解谜后继续'); return; }
                if (now - this.zoneStarted > this.settings.legendMinutes * 60000) { this.stop('传说战达到时限，请手动退出或继续'); return; }
                if(!this.driver.activeTeam?.(s))this.driver.nav('adventure'); return;
            }
            if (s.adv.event || s.adv.tower || s.adv.league) { this.stop('检测到其他活动，已暂停助手'); return; }
            if (!(s.team || []).length && this.settings.mode !== 'legend' && !this.settings.autoTeam) { this.stop('当前战斗已结束，冒险队伍为空，请先配置队伍'); return; }
            if (this.driver.pendingMap) {
                const pending = this.driver.pendingMap;
                const mode=this.settings.mode;
                if(mode==='dex'&&pending.options?.dexWindow){
                    const current=dexRanking(s,this.settings,this.cooldowns,now).find(r=>r.key===pending.row.key);
                    if(!current?.window&&!current?.marked){
                        this.driver.pendingMap=null;this.status='捕获窗口已关闭，重新选择图鉴路线';return;
                    }
                }
                if(pending.options?.huntSeason&&pending.options.huntSeason!==weatherSeason(now)){
                    const rows=mode==='dex'?dexRanking(s,this.settings,{},now):shinyRanking(s,this.settings,{},now);
                    if(!rows.some(row=>row.key===pending.row.key)){
                        this.driver.pendingMap=null;this.target=null;this.visit=null;this.telemetry.sample=null;
                        this.status='季节已切换，重新选择可出没的地图';return;
                    }
                    pending.options.huntSeason=weatherSeason(now);
                }
                if(['dex','shiny'].includes(mode)&&!pending.options?.zone&&
                    (huntRegions(this.settings).length||this.settings[mode+'Weather']?.length)&&
                    (mode==='shiny'||dexStatus(s,this.settings).missing.length)&&!huntRouteMatches(s,this.settings,pending.row,now)){
                    this.driver.pendingMap=null;this.target=null;this.visit=null;this.telemetry.sample=null;
                    this.status='地图条件已变化，重新选择搜寻路线';return;
                }
                if(pending.options?.roamId&&!this.settings.roamAllowMasterBall&&(Number(s.items?.['master-ball'])||0)>0){
                    pending.started=now;this.lastProgress=now;this.status='原生游荡捕获会自动消耗大师球；请先处理库存或明确开启允许大师球';return;
                }
                const wasWaiting=!!pending.waiting;
                if (!wasWaiting&&now - pending.started > 60000) { this.stop('地图操作超时，请检查地区解锁和页面控件'); return; }
                if (this.driver.map(pending.row, s, pending.options)) {
                    this.driver.pendingMap = null;
                    if (pending.options?.zone) { this.zoneId = pending.row.id; this.zoneStarted = now; }
                    else {
                        this.target=pending.row;
                        this.visit={started:now,deaths:totalDeaths(s,pending.row),runs:s.adv.runs||0};
                        if(this.settings.mode==='train')this.visit.trainingProfile=pending.trainingProfile??trainingRouteFingerprint(s);
                        this.telemetry.sample=null;
                        if(pending.options?.roamId){this.roamStarted??=now;if(pending.options.restart)this.roamRestartAt=now;}
                    }
                }
                else if(pending.waiting||wasWaiting){pending.started=now;this.lastProgress=now;}
                return;
            }
            const safeBoundary = !s.adv.battle && !s.adv.pending;
            if(this.settings.mode==='roam'||this.settings.mode==='legend'&&!this.settings.legendTier&&DATA.zones.some(zone=>zone.id===this.settings.legendId&&zone.eliteOnly)){
                this.roaming(s,now);return;
            }
            if (this.settings.mode === 'legend') {
                if (s.adv.speed !== this.settings.speed) { if (this.driver.nav('adventure')) this.driver.click($(`#speed-btns [data-speed="${this.settings.speed}"]`), '设置游戏内速度'); return; }
                if (safeBoundary || startingBattle) this.legend(s, now); return;
            }
            const speed = $(`#speed-btns [data-speed="${this.settings.speed}"]`);
            if (s.adv.speed !== this.settings.speed && this.driver.nav('adventure')) { this.driver.click(speed, '设置游戏内速度'); return; }
            const dex=this.settings.mode==='dex'?dexStatus(s,this.settings):null;
            let dexRoutes=dex?.missing.length?dexRanking(s,this.settings,this.cooldowns,now,dex):[];
            const directedHunt=this.settings.mode==='shiny'||(dex?.missing.length>0&&(this.settings.dexSpecies.length>0||dexRoutes[0]?.window));
            if(!directedHunt&&this.settings.autoTeam&&(!startingBattle||this.target||this.settings.mode==='progress')&&this.fitTeam(s,now))return;
            const roadPending=Array.isArray(s.road)&&s.road.length>0&&(s.road.length!==s.team.length||s.road.some((uid,i)=>uid!==s.team[i]));
            if(roadPending)this.telemetry.sample=null;
            if (this.target && this.target.members.includes(s.adv.chapter) && !roadPending) {
                if (!this.telemetry.sample) this.telemetry.begin(s, this.target, this.settings, now);
                const sample = this.telemetry.observe(s, this.target, this.settings, now);
                if (sample?.valid) { this.log(`${this.target.name} 实测 ${Math.round(sample.net / sample.seconds * 60)} ₽/分钟${sample.xp != null ? ` · ${Math.round(sample.xp / sample.seconds * 60)} EXP/分钟` : ''}`); this.persist(); }
                if (this.visit && totalDeaths(s, this.target) - this.visit.deaths >= this.settings.lossLimit && safeBoundary) {
                    this.cooldowns[this.target.key] = now + 15 * 60000; this.log(`${this.target.name} 连续失败，避开 15 分钟`); this.target = null; this.telemetry.sample = null;
                    if(dex)dexRoutes=dexRanking(s,this.settings,this.cooldowns,now,dex);
                }
            }
            if (this.settings.mode === 'progress') { this.progress(s, now); return; }
            if(this.settings.mode==='shiny'){
                const remaining=missingShinies(s,this.settings);
                const rows=shinyRanking(s,this.settings,this.cooldowns,now),current=rows.find(row=>row.key===this.target?.key);
                if(rows.length)this.weatherWindow=null;
                if(safeBoundary&&rows.length&&this.automation.autoBuff(s,now)){this.telemetry.sample=null;return;}
                const alternate=this.huntAlternate(s,current,rows,now);
                if(current&&current.members.includes(s.adv.chapter)&&this.visit&&!alternate){
                    if(this.settings.autoTeam&&this.fitTeam(s,now))return;
                    this.status=`刷闪 · ${current.name} · 还缺 ${remaining.length} 种异色`;this.driver.nav('adventure');return;
                }
                if(!safeBoundary&&!startingBattle&&!this.ordinaryBattleKey(s)){this.waitForHuntBoundary(rows[0]);return;}if(!rows.length){
                    const eligible=shinyRanking(s,this.settings,{},now);
                    if(eligible.length){this.waitForFarm('刷闪地图暂时退避，等待后重试',now);return;}
                    if(this.waitForWildWindow(s,remaining,now))return;
                    const possible=remaining.some(id=>hasWildSource(s,this.settings,id));
                    if(possible){this.waitForFarm('已确认野生来源，等待天气、季节或出没时段；不会放弃任务',now);return;}
                    this.failTask('当前范围没有该物种的野生来源；请检查地区、时段和天气');return;
                }this.travelHunt(alternate||rows[0],alternate,now);return;
            }
            if (this.settings.mode === 'item') { this.farm(s, now, 'item'); return; }
            if (this.settings.mode === 'train') { this.farm(s, now, 'train'); return; }
            if (this.settings.mode === 'dex') {
                const status = dex;
                if (!status.missing.length) {
                    const done=this.settings.dexSpecies?.length?'指定物种已全部捕获':'所选范围的基础形态已全部捕获';
                    if (this.settings.afterDex === 'stop'||this.queueRunning) { this.completeTask(done); return; }
                    this.status = done+'，转为刷钱'; this.money(s, now); return;
                }
                const rows = dexRoutes;
                if(rows.length)this.weatherWindow=null;
                const stillNeeded = rows.find(r => r.key === this.target?.key);
                if(!rows.length&&status.missing.every(mon=>s.pension?.eggs?.some(egg=>egg.id===mon.id))){
                    this.lastProgress=now;
                    this.status=this.settings.autoEggs?'补图鉴 · 剩余目标均已取得蛋，等待成熟并领取':'补图鉴 · 剩余目标均已取得蛋，成熟后请在培育屋领取';
                    this.driver.nav('adventure');return;
                }
                const alternate=this.huntAlternate(s,stillNeeded,rows,now);
                if (this.target && stillNeeded && stillNeeded.members.includes(s.adv.chapter) && this.visit && !alternate) {
                    if(directedHunt&&this.settings.autoTeam&&this.fitTeam(s,now))return;
                    if(safeBoundary&&stillNeeded.hasWild&&this.automation.autoBuff(s,now)){this.telemetry.sample=null;return;}
                    const limit=stillNeeded.window;
                    const detail=limit?` · 优先 ${MONS.get(limit.id).name}（${limit.place}，至 ${new Date(limit.until).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}）`:stillNeeded.specialNodesOnly?' · 等待生成目标节点':'';
                    this.status = `补图鉴 · ${this.target.name} · 目标 ${stillNeeded.targets.map(m => MONS.get(m.id)?.name).slice(0, 5).join('、')}${detail}`; this.driver.nav('adventure'); return;
                }
                if (!safeBoundary&&!startingBattle&&!(directedHunt&&this.ordinaryBattleKey(s))) {this.waitForHuntBoundary(rows[0]);return;}
                const next=alternate||rows[0];
                if (next) {
                    if(!directedHunt&&safeBoundary&&next.hasWild&&this.automation.autoBuff(s,now)){this.telemetry.sample=null;return;}
                    this.travelHunt(next,alternate,now); return;
                }
                if (this.settings.legends && !this.settings.dexWeather?.length && now >= this.nextLegend && this.findLegend(s, status, now)) return;
                if(this.settings.dexWeather?.length||this.settings.dexSpecies?.length||this.settings.dexRegions?.length){
                    this.target=null;this.visit=null;this.telemetry.sample=null;
                    if(this.settings.dexSpecies?.length&&!dexRanking(s,this.settings,{},now).length){
                        const hatchedLater=new Set((s.pension?.eggs||[]).map(egg=>egg.id));
                        if(this.waitForWildWindow(s,[...dexSearchIds(s,this.settings,status)].filter(id=>!hatchedLater.has(id)),now))return;
                        // A selected parent and its evolution share the same pending gift egg.
                        const remaining=status.missing.filter(mon=>!status.ids.has(giftEggParents.get(mon.id)));
                        if(remaining.length===1){
                            const id=remaining[0].id;
                            const egg=unovaAcquisitionSources(s,id,now).find(source=>source.kind==='lootEgg'&&!source.available);
                            if(egg){this.waitForFarm(`${MONS.get(id).name} · ${CHAPTERS.get(egg.chapter).name} / ${egg.nodeName} · ${egg.reason}`,now);return;}
                            const from=giftEggParents.get(id);
                            if(from){
                                const rule=EVOLUTION_DATA.rules[from].find(rule=>rule.to===id);
                                const reason=unovaAcquisitionSources(s,from,now)[0]?.reason;
                                this.waitForFarm(`${MONS.get(id).name} · 由${MONS.get(from).name} Lv.${rule.level} 进化；${hatchedLater.has(from)?'已有蛋，等待孵化':captured(s,from)?'请确认前置形态并安排培养进化':reason||'等待符合筛选的赠蛋地点'}`,now);return;
                            }
                        }
                    }
                    this.waitForFarm('所选范围暂无可刷目标，等待天气、退避结束或开放来源；可在图鉴查看获取条件',now);return;
                }
                if (this.settings.progress && this.canProgress(s)) { this.progress(s, now); return; }
                this.status = `还缺 ${status.missing.length} 条进化链；等待天气、特殊条件或解锁，暂刷钱`;
                this.money(s, now); return;
            }
            this.money(s, now);
        }
        cancelTeamSearch(slot){
            for(const name of slot?[slot]:['teamSearch','evolutionSearch']){
                if(this[name])clearTimeout(this[name].timer);
                this[name]=null;
            }
            if(!slot||slot==='teamSearch')this.teamContinuation=null;
        }
        evaluateTeamSearch(signature,search,slot='teamSearch'){
            let job=this[slot];
            if(job&&job.signature!==signature){this.cancelTeamSearch(slot);job=null;}
            if(job){
                if(job.error){this.cancelTeamSearch(slot);throw job.error;}
                const result=job.result;
                if(result){
                    this.cancelTeamSearch(slot);
                    if(job.resume)this.teamContinuation=job;
                }
                return result;
            }
            if(slot==='teamSearch'&&this.teamContinuation){
                const saved=this.teamContinuation;this.teamContinuation=null;
                if(saved.signature===signature&&saved.epoch===this.runId){
                    this[slot]=saved;saved.result=null;saved.cpu=0;
                    const resume=saved.resume;saved.resume=null;saved.timer=setTimeout(resume,0);
                    return null;
                }
            }
            const smallDevice=globalThis.navigator?.hardwareConcurrency<=4||globalThis.navigator?.deviceMemory<=4;
            job=this[slot]={signature,epoch:this.runId,cpu:0,slice:4,limit:smallDevice?80:180};
            const advance=()=>{
                if(this[slot]!==job)return;
                if(!this.running||this.manual||job.epoch!==this.runId||pageHidden()){this.cancelTeamSearch(slot);return;}
                // Only score this snapshot here. The normal tick checks the latest
                // route, party and roster again before it can queue a single PC action.
                const start=performance.now(),deadline=start+job.slice;
                try{
                    do{
                        const step=search.next();
                        if(step.done){
                            const plan=step.value,finalScore=plan?.changed?plan.score:plan?.currentScore;
                            job.result=job.best?.checkpointScore>finalScore?job.best:plan;
                            return;
                        }
                        if(step.value?.uids&&(!job.best||(step.value.checkpointScore??0)>=(job.best.checkpointScore??0)))job.best=step.value;
                        if(job.best&&job.cpu+performance.now()-start>=job.limit){
                            job.result={...job.best,limited:true};
                            job.resume=advance;return;
                        }
                    }while(performance.now()<deadline);
                    const elapsed=performance.now()-start;
                    job.cpu+=elapsed;
                    if(elapsed>8){job.slice=3;job.limit=Math.min(job.limit,120);}
                    job.timer=setTimeout(advance,0);
                }catch(error){job.error=error;}
            };
            job.timer=setTimeout(advance,0);
            return null;
        }
        fitTeam(s,now) {
            if(s.adv.battle?.pick||this.driver.lastSwitchFoe&&s.adv.battle?.foes?.includes(this.driver.lastSwitchFoe))return false;
            const roam=this.settings.mode==='roam'||this.settings.mode==='legend'&&!this.settings.legendTier&&DATA.zones.some(zone=>zone.id===this.settings.legendId&&zone.eliteOnly);
            const c=CHAPTERS.get(s.adv.chapter);if(!c||this.settings.mode==='legend'&&!roam||now<this.teamRetryAt)return false;
            const frontier=this.settings.mode==='progress'&&CHAPTERS.get(s.adv.unlocked);
            if(frontier&&c.id!==frontier.id&&!(c.league&&frontier.league&&c.loop===frontier.loop))return false;
            // Navigation owns an explicit destination; avoid swapping for the old route.
            const pending=this.driver.pendingMap;
            if(pending?.options?.zone||pending&&!pending.row.members?.includes(c.id)||!frontier&&this.target&&!this.target.members?.includes(c.id))return false;
            if(Array.isArray(s.road)&&s.road.length>0&&(s.road.length!==s.team.length||s.road.some((uid,i)=>s.team[i]!==uid)))return false;
            const current={...c,key:String(c.loop),members:c.league?DATA.chapters.filter(member=>member.loop===c.loop).map(member=>member.id):[c.id]};
            const row=frontier?current:pending?.row||this.target||current;
            const objective=this.settings.mode==='train'?'train':['money','item','shiny'].includes(this.settings.mode)||this.settings.mode==='dex'&&!dexStatus(s,this.settings).missing.length&&this.settings.afterDex==='money'?'money':'progress';
            const roamId=roam?roamingSettings(this.settings).roamId:undefined;
            const dexReplay=objective==='progress'&&isDexReplay(s,this.settings,c)?c:null;
            const key=String(row.key??c.loop)+(roamId?`:roam:${roamId}`:''),autoSwitch=s.autoSwitch!==false,roster=rosterFingerprint(s),last=this.teamCheck,deaths=Number(s.adv.deaths?.[s.adv.chapter])||0;
            const members=row.members||[c.id],weatherKey=adventureTeamWeatherKey(s,members,now);
            const pinned=this.settings.mode==='train'?trainingUids(s,this.settings,this.trainProtected):[];
            const policy=adventureTeamPolicy(s,members,this.settings,pinned);
            if(last&&last.policy===policy&&last.chapter===c.id&&last.key===key&&last.weatherKey===weatherKey&&last.objective===objective&&last.dexReplay===!!dexReplay&&last.autoSwitch===autoSwitch&&(this.driver.teamTask||last.expectedParty===s.team.join('|'))&&last.party===s.team.join('|')&&(!last.limited||now-last.at<5000)&&
                last.roster===roster&&last.deaths===deaths)return false;
            const foes=roamId?battleContext(s,'map',{row,roamId}).foes:(row.members||[c.id]).map(id=>CHAPTERS.get(id)).filter(Boolean).flatMap(chapter=>chapterCombatFoes(s,chapter));
            const context={reg:row.reg||c.reg,foes,objective,dexReplay,now,lowBudget:globalThis.navigator?.hardwareConcurrency<=4||globalThis.navigator?.deviceMemory<=4};
            let plan;
            if(s.mons.length===1&&s.team.length===1&&s.team[0]===s.mons[0].uid&&teamEligible(s,s.mons[0],context.reg)){
                plan={uids:s.team,changed:false,reason:'当前地区只有一个可选成员',gain:0,opponents:foes.length};
            }else if(this.running){
                const signature=JSON.stringify(['adventure',this.runId,policy,c.id,key,!!dexReplay,context.reg,weatherKey,objective,autoSwitch,deaths,roster,s.team,foes]);
                plan=this.evaluateTeamSearch(signature,adventureTeamSearch(s,this.settings,pinned,{...context,progressive:true},true));
            }else plan=planAdventureTeam(s,this.settings,pinned,context);
            if(!plan){this.status='正在评估冒险队伍 · '+(row.name||c.name);return true;}
            this.teamCheck={key,policy,dexReplay:!!dexReplay,limited:!!plan.limited,chapter:c.id,members,weatherKey,objective,autoSwitch,roster,party:s.team.join('|'),expectedParty:(plan.changed?plan.uids:s.team).join('|'),at:now,deaths,mode:this.settings.mode,name:row.name||c.name,
                reason:[plan.changed||plan.limited||plan.retainedForHunt?plan.reason:'模拟收益未过换队门槛，保留现有队伍',plan.backup].filter(Boolean).join(' · '),gain:plan.gain,opponents:plan.opponents};
            if(!plan.uids.length){this.stop('当前地区没有可出战的宝可梦，请先配置队伍');return true;}
            if(!plan.changed)return false;
            const nameOf=uid=>MONS.get(s.mons.find(mon=>mon.uid===uid)?.id)?.name||uid;
            const incoming=plan.uids.filter(uid=>!s.team.includes(uid)).map(nameOf);
            const outgoing=s.team.filter(uid=>!plan.uids.includes(uid)).map(nameOf);
            const changes=[incoming.length&&'上阵 '+incoming.join('、'),outgoing.length&&'换下 '+outgoing.join('、')].filter(Boolean);
            this.log([`配队评估 · ${plan.reason}`,...changes,plan.gain>0&&`综合评分 +${Math.round(plan.gain*100)}%`].filter(Boolean).join(' · '));
            this.telemetry.sample=null;this.status=`为${row.name||c.name}调整冒险队伍`;
            this.driver.teamTask={chapter:c.id,members,uids:plan.uids,started:now,attempts:0,fitBasis:{roster,weatherKey,autoSwitch,policy,party:s.team.join('|'),frontier:s.adv.unlocked,roamId}};
            return true;
        }
        legend(s, now) {
            const goal = legendProgress(s, this.settings);
            if (!goal.zone) { this.stop('无法识别所选传说战'); return; }
            if(goal.done){this.completeTask('指定传说战目标已完成');return;}
            const open = new Set(['kanto', ...(s.travel?.to || []), currentRegion(s)]);
            if (!open.has(goal.zone.reg)) { this.stop('目标传说所在地区尚未解锁'); return; }
            const tier = this.settings.legendTier ? goal.nextTier : 0;
            if (goal.zone.eliteOnly && !tier) { this.roaming(s,now);return; }
            if (tier && !goal.captured) { this.stop('精英传说战需要先完成该传说的普通捕获'); return; }
            this.travel({ ...goal.zone, key: `Z${goal.zone.id}`, members: [], name: `${goal.zone.monName || MONS.get(goal.zone.id)?.name || goal.zone.name}${tier ? ` · 精英 ${tier} 阶` : ''}` }, now, { zone: true, tier, optimize: this.settings.optimizeRaid });
        }
        roaming(s,now){
            const cfg=roamingSettings(this.settings),plan=roamingPlan(s,cfg,now),d=this.driver;
            this.telemetry.sample=null;
            if(!plan.target){this.failTask('无法识别所选游荡宝可梦');return;}
            if(plan.done){this.completeTask('指定游荡宝可梦已确认捕获');return;}
            if(!plan.unlocked){this.lastProgress=now;this.status=`等待${MONS.get(plan.target.id)?.name}游荡开放 · 需要${DATA.regions.find(region=>region.key===plan.group.reg)?.name}冠军及地区解锁`;return;}
            if((Number(s.items?.['master-ball'])||0)>0&&!cfg.roamAllowMasterBall){this.lastProgress=now;this.status='原生游荡捕获会自动消耗大师球；请先处理库存或明确开启允许大师球，再开始主动追踪';return;}
            if(this.roamStarted&&now-this.roamStarted>=cfg.roamMinutes*60000){this.failTask('达到游荡目标在线搜寻时限，已停止助手规划');return;}
            if(s.adv.speed!==cfg.speed){if(d.nav('adventure'))d.click($(`#speed-btns [data-speed="${cfg.speed}"]`),'设置游荡捕获速度');return;}
            if(plan.active){this.roamStarted??=now;this.status=`游荡战斗 · ${plan.target.name} · 捕获后以存档确认完成`;d.nav('adventure');return;}
            if(!this.canStartRoute(s)){this.status=`追踪${plan.target.name} · 等待当前战斗或选择结束`;d.nav('adventure');return;}
            if(!plan.row){
                this.lastProgress=now;this.status=`等待${plan.target.name}的新游荡位置 · 仅在线生成遭遇`;
                if(!d.nav('map'))return;
                this.roamStarted??=now;
                const region=$(`#map-root .rg.open[data-rg="${plan.group.reg}"]`);
                if(region&&(!region.classList.contains('active')||!this.roamProbeAt||now-this.roamProbeAt>=5000)){if(d.click(region,'刷新原生地图中的游荡位置'))this.roamProbeAt=now;}
                return;
            }
            const buffFamily=this.automation.buffUI?.family||this.automation.state.autoBuffTx?.family;
            if(buffFamily==='capture'){if(this.automation.autoBuff(s,now,'roamCapture'))return;}
            else if(this.automation.autoBuff(s,now,'roam')||this.automation.autoBuff(s,now,'roamCapture'))return;
            const context=battleContext(s,'map',{row:plan.row,roamId:plan.target.id});
            if(this.ensurePrepared(s,context,{row:routeDescriptor(plan.row),options:{roamId:plan.target.id}},now))return;
            if(s.adv.chapter!==plan.row.id||!this.target?.members?.includes(plan.row.id)){
                this.travel(plan.row,now,{roamId:plan.target.id,restart:plan.restart});return;
            }
            this.roamStarted??=now;
            if(cfg.autoTeam&&this.fitTeam(s,now))return;
            if(plan.restart&&now-(this.roamRestartAt||0)>=7000){this.roamRestartAt=now;this.travel(plan.row,now,{roamId:plan.target.id,restart:true});return;}
            const remaining=plan.location?` · 驻留约 ${Math.max(1,Math.ceil((plan.location.until-now)/60000))} 分钟`:'';
            this.status=`追踪${plan.target.name} · ${plan.row.name}${plan.marked?' · 当前路线已生成目标遭遇':remaining}`;d.nav('adventure');
        }
        cancelRankingJob(kind){
            const job=this.rankingJobs.get(kind);
            if(job){clearTimeout(job.timer);this.rankingJobs.delete(kind);}
        }
        cancelRouteRankings(){
            for(const kind of this.rankingJobs.keys())this.cancelRankingJob(kind);
        }
        releaseRankingView(keep){
            for(const [kind,job] of this.rankingJobs){
                if(kind===keep)continue;
                job.view=false;
                if(!job.task)this.cancelRankingJob(kind);
            }
        }
        rankedYieldRoutes(s,kind,cooldowns=this.cooldowns,now=Date.now(),view=false){
            const request=yieldRankingRequest(kind,s,this.settings,this.metrics,now);
            return this.evaluateRouteRanking(request,cooldowns,now,view);
        }
        evaluateRouteRanking(request,cooldowns,now,view=false){
            const kind=request.cacheSlot||request.kind;
            if(view)this.releaseRankingView(kind);
            let job=this.rankingJobs.get(kind);
            if(job&&job.signature!==request.signature){this.cancelRankingJob(kind);job=null;}
            if(routeRankings.get(kind)?.signature===request.signature||!request.needsSlices){
                if(job)this.cancelRankingJob(kind);
                return completeYieldRanking(request,cooldowns,now);
            }
            if(job){
                job.view||=view;
                job.task||=!view;
                if(job.error){this.cancelRankingJob(kind);throw job.error;}
                if(!job.rows)return null;
                this.cancelRankingJob(kind);
                routeRankings.set(kind,{signature:request.signature,rows:job.rows});
                return selectYieldRoutes(request,job.rows,cooldowns,now);
            }
            const search=request.search(true);
            job={signature:request.signature,epoch:this.runId,view,task:!view};
            this.rankingJobs.set(kind,job);
            const advance=()=>{
                if(this.rankingJobs.get(kind)!==job)return;
                if(job.epoch!==this.runId||pageHidden()||!job.view&&(!this.running||this.manual)){
                    this.cancelRankingJob(kind);return;
                }
                // The timer can finish a leaderboard, but only a subsequent
                // request against the latest save can publish it or select a map.
                const deadline=performance.now()+6;
                try{
                    do{
                        const part=search.next();
                        if(part.done){job.rows=part.value;break;}
                    }while(performance.now()<deadline);
                }catch(error){job.error=error;}
                if(!job.rows&&!job.error)job.timer=setTimeout(advance,0);
                else if(job.view)this.onChange?.();
            };
            job.timer=setTimeout(advance,0);
            return null;
        }
        farm(s, now, mode) {
            const rank=cooldowns=>mode==='item'?itemRanking(s,this.settings,this.metrics,cooldowns,now):this.rankedYieldRoutes(s,'xp',cooldowns,now);
            const rows=rank(this.cooldowns);
            if(!rows){this.status='正在比较练级路线';this.lastProgress=now;return;}
            if (!rows.length) {
                const eligible=rank({});
                if (eligible.length) { this.waitForFarm('目标地图暂时退避，等待后重试',now); return; }
                if(mode==='item'){
                    const tide=DATA.tideMs||10800000,nextTide=(Math.floor(now/tide)+1)*tide+1;
                    if(itemRanking(s,this.settings,this.metrics,{},nextTide).length){this.waitForFarm('等待目标道具的潮汐条件开放',now);return;}
                }
                this.stop(mode === 'item' ? '所选范围无可刷道具来源；请检查解锁、一次性领取、潮汐条件和地区范围' : '当前范围暂无可重打的练级地图，请先推进主线'); return;
            }
            const safe=!s.adv.battle&&!s.adv.pending;
            const roadPending=Array.isArray(s.road)&&s.road.length>0&&(s.road.length!==s.team.length||s.road.some((uid,i)=>uid!==s.team[i]));
            if(mode==='train'&&roadPending){this.status='练级等待新队伍在治疗点上阵';this.telemetry.sample=null;this.driver.nav('adventure');return;}
            if(mode==='train'&&!s.adv.pending){
                if(this.automation.autoBuddy(s,now)){this.telemetry.sample=null;return;}
                if(safe&&this.automation.autoBuff(s,now,'train')){this.telemetry.sample=null;return;}
            }
            const current = rows.find(row => row.key === this.target?.key);
            const elapsed = this.visit ? now - this.visit.started : Infinity;
            const label = mode === 'item' ? `${ITEMS.get(this.settings.itemId)?.name} · 本次 ${Math.max(0, itemCounter(s, this.settings.itemId) - this.startItems)}/${this.settings.itemQuantity}` : `练级至 Lv.${this.settings.trainLevel}`;
            if(mode==='train'&&current&&current.members.includes(s.adv.chapter)&&this.visit){
                if(safe){
                    const profile=trainingRouteFingerprint(s),previous=this.visit.trainingProfile,at=this.visit.trainingReviewAt??this.visit.started;
                    if(!previous||previous!==profile||now-at>=30000){
                        this.visit.trainingProfile=profile;this.visit.trainingReviewAt=now;
                        const next=rows[0],due=previous&&previous!==profile||now-at>=30000;
                        if(due&&shouldSwitchTrainingRoute(current,next)){
                            this.log(`练级效率重评：${current.name} → ${next.name} · ${Math.round(next.rate)} EXP/分钟`);
                            this.travel(next,now);return;
                        }
                    }
                }
                this.status=`${label} · ${current.name} · ${current.measured?'实测':'预计'} ${Math.round(current.rate)} EXP/分钟`;
                this.driver.nav('adventure');return;
            }
            if (mode==='item' && current && current.members.includes(s.adv.chapter) && elapsed < 30 * 60000 && (elapsed < this.settings.sampleMinutes * 60000 || !current.measured)) {
                this.status = `${label} · ${current.name}`; this.driver.nav('adventure'); return;
            }
            if (!this.canStartRoute(s)) {this.driver.nav('adventure');return;}
            let next=rows[0];
            if(mode==='item'){
                const unsampled=rows.filter(row=>!row.measured&&row.key!==current?.key);
                if(unsampled.length&&(!this.lastExplore||now-this.lastExplore>2*this.settings.sampleMinutes*60000))next=unsampled[0];
                if(!next.measured)this.lastExplore=now;
                if(next.key===current?.key&&this.visit&&current.members.includes(s.adv.chapter)){this.visit.started=now;this.status=`${label} · ${next.name}`;this.driver.nav('adventure');return;}
            }
            this.travel(next, now);
        }
        huntAlternate(s,current,rows,now){
            if(!current?.members.includes(s.adv.chapter)||!this.visit||current.marked||rows.length<2)return null;
            if(this.settings.mode==='dex'){
                const best=rows[0];
                if(best.key!==current.key&&(best.marked||best.priority>current.priority||
                    (best.window&&current.window&&best.window.until<current.window.until)))return best;
                if(current.window){
                    // Give a different target with the same deadline a turn after a complete attempt.
                    const peer=rows.find(r=>r.window?.until===current.window.until&&r.window.id!==current.window.id);
                    const share=Math.min(this.settings.rotateMinutes*60000,Math.max(60000,(current.window.until-this.visit.started)/2));
                    if(peer&&s.adv.runs>this.visit.runs&&now-this.visit.started>=share)return peer;
                    return null;
                }
            }
            const newRoll=current.specialNodesOnly&&s.adv.nodes?.length>0&&s.adv.runs>this.visit.runs;
            if(!newRoll&&now-this.visit.started<this.settings.rotateMinutes*60000)return null;
            return rows.find(row=>row.key!==current.key);
        }
        travelHunt(row,alternate,now){
            if(alternate&&this.target&&!alternate.window&&!alternate.marked){
                this.cooldowns[this.target.key]=Math.min(now+5*60000,(Math.floor(now/WEATHER_DATA.slotMs)+1)*WEATHER_DATA.slotMs);
                this.log(`搜寻轮换 · ${this.target.name} → ${row.name}`);
            }
            this.travel(row,now);
        }
        waitForWildWindow(s,targets,now){
            const window=nextWildWindow(s,this.settings,targets,now);
            this.weatherWindow=window;
            if(!window)return false;
            const when=new Date(window.at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
            const label=window.eggPlace?'等待赠蛋天气':'等待野生出没时段';
            const place=window.eggPlace?`${window.row.name} / ${window.eggPlace}`:window.row.name;
            this.waitForFarm(`${label} · ${MONS.get(window.id).name} · ${place} · ${SEASON_NAMES[window.season]} ${when}`,now);
            return true;
        }
        weatherFarmStep(s,now){
            const cfg=this.settings,kind=cfg.huntWeatherFallback;
            if(!['money','xp'].includes(kind)||!['dex','shiny'].includes(cfg.mode)||this.driver.pendingMap?.options?.zone)return false;
            const dex=cfg.mode==='dex',status=dex?dexStatus(s,cfg):null;
            const rows=dex?dexRanking(s,cfg,{},now,status):shinyRanking(s,cfg,{},now);
            // The hunt model already invalidates this entry on weather, roster, unlocks and target changes.
            const ranking=routeRankings.get(cfg.mode);
            if(!rows.length&&this.weatherEvidence?.ranking!==ranking){
                const targets=dex?[...dexSearchIds(s,cfg,status)].filter(id=>!s.pension?.eggs?.some(egg=>egg.id===id)):missingShinies(s,cfg);
                this.weatherEvidence={ranking,blocked:!!targets.length&&hasWeatherBlockedTarget(s,cfg,targets,now)};
            }
            if(rows.length||!this.weatherEvidence?.blocked){
                if(this.weatherFarm){
                    this.cancelRankingJob('weatherFarm/'+kind);
                    this.weatherFarm=null;this.driver.navigation=null;this.farmWait=null;this.weatherWindow=null;
                    this.log(rows.length?'捕捉窗口已开放，返回搜寻目标':'已重新核对目标，结束天气等待期间的挂机');
                }
                return false;
            }
            if(!this.weatherFarm){
                this.weatherFarm={cooldowns:{}};this.target=this.visit=this.telemetry.sample=null;
                this.driver.pendingMap=this.driver.navigation=this.legendProbe=null;
            }
            const farm=this.weatherFarm,label=kind==='xp'?'当前队伍练级':'刷钱';
            this.lastProgress=now;
            this.status='等待捕捉天气 · '+label;
            if(kind==='xp'&&!partyMons(s).some(mon=>mon.level<trainingCap(s,mon))){
                this.status+=' · 队员均已达到当前等级上限';return true;
            }
            if(!farm.row||!(farm.reviewAt>now)){
                const options={...cfg,mode:kind==='xp'?'train':'money',region:'current'};
                const request=yieldRankingRequest(kind,s,options,this.metrics,now);
                request.cacheSlot='weatherFarm/'+kind;
                const ranked=this.evaluateRouteRanking(request,{...this.cooldowns,...farm.cooldowns},now);
                if(!ranked?.length||!(ranked[0].rate>0)){
                    this.status+=ranked?' · 暂无可获收益的地图':' · 正在比较地图';return true;
                }
                farm.row=ranked[0];farm.reviewAt=now+15000;
            }
            const row=farm.row;
            if(row.key!==farm.key){farm.key=row.key;farm.started=null;farm.clicked=0;farm.deaths=totalDeaths(s,row);}
            this.status+=' · '+row.name;
            if(totalDeaths(s,row)-farm.deaths>=cfg.lossLimit){
                farm.cooldowns[row.key]=now+15*60000;farm.row=null;farm.key=null;
                this.log(row.name+'达到挂机失败上限，重新选择收益地图');return true;
            }
            if(row.members.includes(s.adv.chapter)&&s.adv.loops?.length===1&&String(s.adv.loops[0])===row.key){
                farm.started=null;farm.clicked=0;this.driver.nav('adventure');return true;
            }
            if(s.adv.pending||s.adv.battle&&!this.ordinaryBattleKey(s)){farm.started=null;return true;}
            farm.started??=now;
            if(now-farm.started>60000){
                farm.cooldowns[row.key]=now+5*60000;farm.row=null;farm.key=null;
                this.log('天气等待期间未能进入'+row.name+'，稍后重试');return true;
            }
            if(!farm.clicked&&this.driver.map(row,s))farm.clicked=now;
            return true;
        }
        ordinaryBattleKey(s) {
            const a=s.adv, b=a.battle, node=a.nodes?.[a.node];
            if (!b || a.pending || a.event || a.zone || a.tower || a.league || b.raid || node?.static || node?.phenom || node?.roamer) return null;
            if (!['wild','trainer'].includes(b.kind) || node && !['wild','trainer'].includes(node.type)) return null;
            if (b.kind==='wild' && (!b.enemies?.length || b.enemies.some(m=>!MONS.has(m.id)||m.shiny||MONS.get(m.id).legend))) return null;
            return JSON.stringify([a.chapter,a.node,a.runs||0,b.kind]);
        }
        canStartRoute(s) {
            return !s.adv.pending && (!s.adv.battle || !!this.startBattle && this.startBattle===this.ordinaryBattleKey(s));
        }
        waitForHuntBoundary(row) {
            this.status=row?`等待当前遭遇或选项结算，再前往${row.name}`:'等待当前遭遇或选项结算后重新规划搜寻';
            this.driver.nav('adventure');
        }
        followMarkedHunt(s,now) {
            const mode=this.settings.mode;
            if (!['shiny','dex'].includes(mode)||currentRegion(s)!=='unova'||!s.adv.nodes?.length||this.driver.pendingMap?.options?.zone) return false;
            let marked;
            if(mode==='dex') marked=markedDexSource(s,this.settings,now);
            else if(huntRegionMatches(s,this.settings,currentRegion(s))&&huntWeatherMatches(s,this.settings,s.adv.chapter,now)){
                marked=missingShinies(s,this.settings).filter(id=>UNOVA_WILD_IDS.has(id)).flatMap(id=>unovaAcquisitionSources(s,id,now,true,true)).find(source=>source.marked);
            }
            if(!marked)return false;
            this.driver.pendingMap=null;
            const action=marked.kind==='lootEgg'?'探索道具节点，尝试获得蛋':'走完已生成的现象遭遇';
            this.status=`${mode==='dex'?'补图鉴':'刷闪'} · ${marked.nodeName} · ${action} · ${MONS.get(marked.id).name}`;
            this.driver.nav('adventure');return true;
        }
        holdWildShiny(s,now=Date.now()) {
            const shiny=wildShinyEncounter(s),seasonal=shiny?null:seasonalDexEncounter(s,this.settings);
            const encounter=shiny||seasonal||targetDexEncounter(s,this.settings);
            if(!encounter){this.wildShinyProtected=null;return false;}
            const label=shiny?'野生异色':seasonal?'季节图鉴目标':'图鉴目标',names=encounter.enemies.map(mon=>MONS.get(mon.id)?.name||mon.id).join('、');
            if(this.wildShinyProtected!==encounter.key){this.wildShinyProtected=encounter.key;this.log('优先完成'+label+'捕获：'+names);}
            this.telemetry.sample=null;
            this.status='保护'+label+' · '+names+' · 捕获结算后继续原任务';
            // Helper UI transactions are suspended while the native capture runs;
            // their deadlines must not expire when control returns to the old task.
            this.hiddenAt??=now;this.driver.nav('adventure');return true;
        }
        travel(row, now, options = {}) {
            const s=this.read();if(this.holdWildShiny(s,now))return;
            if(this.settings.mode==='dex'&&row.window)options={...options,dexWindow:true};
            if(!options.huntSeason&&(this.settings.mode==='dex'&&row.hasWild||this.settings.mode==='shiny'&&row.expected>0))options={...options,huntSeason:weatherSeason(now)};
            if(!options.zone&&this.ensurePrepared(s,battleContext(s,'map',{row,roamId:options.roamId}),{row:routeDescriptor(row),options},now))return;
            this.driver.pendingMap = { row, options, started: now };
            if(this.settings.mode==='train')this.driver.pendingMap.trainingProfile=trainingRouteFingerprint(s);
            this.telemetry.sample = null; this.status = `规划前往：${row.name}`;
        }
        canProgress(s) {
            const next=CHAPTERS.get(s.adv.unlocked);if(!next)return false;
            if(next.reg===currentRegion(s))return true;
            // An explicit mainline task can return from farming to an already opened frontier.
            // Incidental progression retains its current-region boundary and native departures.
            return this.settings.mode==='progress'&&new Set(['kanto',...(s.travel?.to||[]),s.link?.to]).has(next.reg);
        }
        ensurePrepared(s,context,resume={},now=Date.now()){return this.holdWildShiny(s,now)||this.coach.ensure(s,context,resume,now);}
        raidDailyStatus(s,now=Date.now()){
            return dailyRaidStatus(s,this.settings.skipOwnedShiny,this.account===accountId(s)?this.raidDraw:null,now,this.settings.mode==='raid'?this.settings.dailyRaidRegions:null);
        }
        rememberDraw(s,reg,boss,now){
            const day=parisDay(now);
            if(this.account!==accountId(s)||s.raids?.seen!==day||!MONS.has(boss)||!RAID_CHAMPIONS.some(c=>c.reg===reg))return;
            const reroll=s.raids.reroll?.day===day?s.raids.reroll.to:null;
            if(reroll&&reroll!==reg)return;
            const previous=this.raidDraw;
            if(previous?.day===day&&previous.reg===reg&&previous.boss===boss&&previous.reroll===reroll)return;
            this.raidDraw={day,reg,boss,reroll};
            this.persist();
        }
        finishRaidReturn(now){
            if(this.settings.mode==='raid'){
                this.nextRaid=now;this.driver.raid=null;this.target=null;this.raidCheckNote='团体战已结束，检查下一地区';this.log(this.raidCheckNote);return;
            }
            this.log('团体战已结束，返回主任务');this.nextRaid=raidRetryAt(now,this.driver.raid.date);
            this.driver.raid=null;this.target=null;this.raidCheckNote='团体战已结束，继续原任务';
        }
        priorityRaid(s,now,knownStatus){
            if((!this.settings.raids&&this.settings.mode!=='raid')||FLOW_MODES.has(this.settings.mode)||['roam','legend'].includes(this.settings.mode))return false;
            const rest=knownStatus===undefined?this.raidDailyStatus(s,now):knownStatus;
            if(rest){
                this.raidBoundarySince=null;
                if(this.raidProbe||this.raidReturn)this.deferRaid(rest.reason,now,0);
                this.raidCheckNote=''; // The panel reads today's live evidence; a stale note must not survive midnight.
                return false;
            }
            if(this.raidProbe){this.probeRaid(s,now);return true;}
            if(now<this.nextRaid||this.driver.raid||this.raidReturn||this.raidPreparation)return false;
            if(!s.adv.badges?.includes('Maître')){
                this.raidCheckNote='尚未获得关都联盟冠军徽章';return false;
            }
            const tab=$('#tabs [data-screen="raid"]');
            if(tab?.classList.contains('locked')||tab?.classList.contains('hold')){
                this.raidBoundarySince=null;
                this.raidCheckNote=tab.dataset?.why||'游戏的团体战入口暂不可用';return false;
            }
            const p=this.preparation,d=this.driver,a=this.automation,flow=a.state;
            if(p&&(p.phase!=='train'||!['progress','map'].includes(p.context.kind))||d.pendingMap||d.navigation||d.teamTask||a.owner||a.buddyTask||a.buffUI||
                p?.candyTx||flow.autoBuffTx||flow.eggService||flow.evolution||this.services.underground||s.adv.pending)return false;
            if(s.adv.battle){
                this.raidBoundarySince??=now;
                if(now-this.raidBoundarySince<15000||!safeRaidDeparture(s))return false;
            }
            this.raidBoundarySince=null;
            if(p){this.raidPreparation=p;this.preparation=null;this.cancelRouteRankings();}
            this.raidProbe=true;this.raidProbeStarted=now;this.telemetry.sample=null;
            this.status=this.raidCheckNote=p?'已暂存补练进度，优先检查每日团体战':'正在检查每日团体战';
            return true;
        }
        deferRaid(reason,now=Date.now(),retryAt=raidRetryAt(now,this.driver.raid?.date||this.raidReturn?.date)){
            this.raidProbe=false;this.raidReturn=null;this.driver.raid=null;
            if(this.driver.navigation?.screen==='raid')this.driver.navigation=null;
            this.nextRaid=retryAt;this.status=reason;this.raidCheckNote=retryAt===0?'':reason;
            this.log(reason);
        }
        probeRaid(s,now){
            this.telemetry.sample=null;
            if(this.raidReturn?.date&&this.raidReturn.date!==parisDay(now)){
                this.deferRaid('补练前的团体战已换日，重新检查今日目标',now,now);return;
            }
            const rest=this.raidDailyStatus(s,now);
            if(rest){this.deferRaid(rest.reason,now,0);return;}
            if(!safeRaidDeparture(s)){
                // The native startRaid discards the current fight. Let a newly appeared
                // trainer, uncollected wild or frontier battle finish on the adventure screen.
                this.raidProbeStarted=now;this.lastProgress=now;this.raidCheckNote=this.status='团体战已排队，先完成当前战斗或游戏选择';
                this.driver.nav('adventure');return;
            }
            if(now-this.raidProbeStarted>90000){this.deferRaid('团体战页面检查超时，10 分钟后再检查',now);return;}
            this.status='准备每日团体战';this.driver.raidStep(s,now);
        }
        progressReached(s){
            const goal=this.settings.progressUntil,target=CHAPTERS.get(goal);
            // runs is shared by chapter clears, raids and other events; it is not goal evidence.
            return s.adv.unlocked>goal||!!target?.leaders?.length&&target.leaders.every(key=>s.adv.paidLeaders?.[key]);
        }
        progress(s, now) {
            if(this.holdWildShiny(s,now))return;
            if(this.settings.mode==='progress'){
                if(this.progressReached(s)){this.completeTask('主线目标章节已完成');return;}
            }
            if (!this.canProgress(s)) { if(this.automation.travel(s,now))return;this.status = this.settings.autoTravel?'等待下一地区开放':'本地区主线已到边界；可启用跨地区开局';this.lastProgress=now;return; }
            const c = CHAPTERS.get(s.adv.unlocked);
            if(this.ensurePrepared(s,battleContext(s,'progress',{row:{...c,members:c.league?DATA.chapters.filter(row=>row.loop===c.loop).map(row=>row.id):[c.id]}}),{},now))return;
            if ((this.cooldowns[String(c.loop)] || 0) > now) { this.money(s, now); return; }
            const row = candidates(s, { ...this.settings, region: 'current' }).find(r => r.members.includes(c.id)) || { ...c, key: String(c.loop), members: c.league?DATA.chapters.filter(member=>member.loop===c.loop).map(member=>member.id):[c.id] };
            if (this.target?.key !== row.key) {
                this.target = row; this.visit = { started: now, deaths: totalDeaths(s, row) };
                this.telemetry.sample = null;
            }
            const active=CHAPTERS.get(s.adv.chapter),sameLeague=!!c.league&&!!active?.league&&String(active.loop)===String(c.loop);
            if (s.adv.chapter !== c.id&&!sameLeague || s.adv.loops?.length) {
                // Progress uses the native automatic chapter advance; never loops the frontier.
                if (!this.driver.nav('map')) return;
                if (!this.driver.clearLoops(s)) return;
                const reg = $(`#map-root .rg.open[data-rg="${c.reg}"]`);
                if(!reg){this.status='当前主线地区尚未显示，请检查地图解锁条件';return;}
                if(!reg.classList.contains('active')){this.driver.click(reg,'切换到当前主线地区');return;}
                const list = $(`#map-root .mp-row[data-ch="${c.league ? 'L' : c.id}"]`);
                if (!list) { this.driver.click(reg, '打开当前地区'); return; }
                if (!list.classList.contains('sel')) { this.driver.click(list, '选择主线章节'); return; }
                if(c.league){const ordinary=$('#map-root [data-lg-view="league"]:not(.on)');if(enabled(ordinary)){this.driver.click(ordinary,'切回普通联盟，推进主线');return;}}
                const loops = $$('#map-root [data-loop][aria-checked="true"]');
                if (loops.length) { this.driver.click(loops[0], '关闭章节循环，推进主线'); return; }
                this.driver.click($(`#map-root .mp-go[data-go="${c.league ? 'L' : c.id}"]`), '推进当前主线');
                this.target = row; this.visit ||= { started: now, deaths: totalDeaths(s, row) }; return;
            }
            this.target = row; this.status = sameLeague&&active.id!==c.id?`推进联盟 · ${active.name} · 前沿 ${c.name}`:`推进主线 · ${c.name}`; this.driver.nav('adventure');
        }
        money(s, now) {
            const rows=this.rankedYieldRoutes(s,'money',this.cooldowns,now);
            if(!rows){this.status='正在比较刷钱路线';this.lastProgress=now;return;}
            if (!rows.length) {
                if(this.rankedYieldRoutes(s,'money',{},now).length){this.waitForFarm('刷钱地图暂时退避，等待后重试',now);return;}
                const frontier = CHAPTERS.get(s.adv.unlocked);
                if (this.canProgress(s) && (this.cooldowns[String(frontier.loop)] || 0) <= now) this.progress(s, now);
                else this.status = '暂无可用地图，等待失败退避时间结束';
                return;
            }
            if(!s.adv.battle&&!s.adv.pending&&this.automation.autoBuff(s,now,'money')){this.telemetry.sample=null;return;}
            const current = rows.find(row => row.key === this.target?.key);
            const elapsed = this.visit ? now - this.visit.started : Infinity;
            // Hold a map until at least two complete cycles have supplied a valid observation.
            if (current && this.target.members.includes(s.adv.chapter) && (elapsed < this.settings.sampleMinutes * 60000 || !current.measured) && elapsed < 30 * 60000) {
                this.status = `刷钱 · ${current.name} · ${current.measured ? '实测' : '预计'} ${Math.round(current.rate)} ₽/分钟`; this.driver.nav('adventure'); return;
            }
            if (!this.canStartRoute(s)) {this.driver.nav('adventure');return;}
            // Rotate all eligible maps over time, reserving most visits for the current winner.
            const unsampled = rows.filter(row => !row.measured && row.key !== current?.key);
            const next = unsampled.length && (!this.lastExplore || now - this.lastExplore > 2 * this.settings.sampleMinutes * 60000) ? unsampled[0] : rows[0];
            if (!next.measured) this.lastExplore = now;
            if (next.key === current?.key && this.visit && current.members.includes(s.adv.chapter)) { this.visit.started = now; this.status = `继续收益最高地图 · ${next.name} · ${Math.round(next.rate)} ₽/分钟`; this.driver.nav('adventure'); return; }
            this.travel(next, now);
        }
        waitForFarm(reason,now){
            this.farmWait={mode:this.settings.mode};this.lastProgress=now;this.status=reason;
        }
        findLegend(s, status, now) {
            const open=new Set(['kanto',...(s.travel?.to||[]),currentRegion(s)]);
            const zones=DATA.zones.filter(z=>!z.eliteOnly&&status.ids.has(z.id)&&open.has(z.reg)&&huntRegionMatches(s,this.settings,z.reg)&&(this.cooldowns[`Z${z.id}`]||0)<=now);
            const signature=zones.map(z=>`${z.reg}:${z.id}`).join('|');
            const finish=()=>{this.legendProbe=null;this.nextLegend=now+10*60000;return false;};
            if(!zones.length)return finish();
            if(!this.legendProbe||this.legendProbe.signature!==signature)this.legendProbe={signature,regions:[...new Set(zones.map(z=>z.reg))],index:0,started:now};
            const probe=this.legendProbe;
            if(now-probe.started>90000){this.log('传说入口探测超时，稍后重试');return finish();}
            if(!this.driver.nav('map'))return true;
            const reg=probe.regions[probe.index],control=$(`#map-root .rg.open[data-rg="${reg}"]`);
            if(control&&!control.classList.contains('active')){this.driver.click(control,'切换地区，检查缺失传说入口');return true;}
            const row=control&&$$('#map-root .mp-row.lz-open:not(.lz-closed)[data-ch]').find(el=>zones.some(z=>z.reg===reg&&z.id===Number(el.dataset.ch.slice(1))));
            if(row){
                const id=Number(row.dataset.ch.slice(1)),zone=zones.find(z=>z.id===id);this.legendProbe=null;
                this.travel({...zone,key:`Z${id}`,members:[],name:MONS.get(id)?.name||zone.name},now,{zone:true,optimize:true});return true;
            }
            if(++probe.index>=probe.regions.length)return finish();
            return true;
        }
    }


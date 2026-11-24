    function adventureTeamWeatherKey(s,members,now){
        return JSON.stringify(members.map(chapter=>combatWeather(s,{chapter},{},now).signature));
    }
    function adventureTeamPolicy(s,members,settings,pinned){
        const choices=members.map(id=>CHAPTERS.get(id)?.foesByStarter).filter(Boolean)
            .map(branch=>starterChoice(s,branch.key,Object.keys(branch.choices||{}).map(Number)));
        const training=settings.mode==='train'?[settings.trainLevel,s.buddy?.uid,s.adv.unlocked,s.adv.badges]:null;
        return JSON.stringify([settings.mode,pinned,helperSwitchEnabled(s,settings),choices,training]);
    }
    function adventureTeamPins(s,members,settings,protectedUids){
        if(settings.mode==='train')return trainingUids(s,settings,protectedUids);
        if(settings.mode!=='item')return [];
        const required=new Set(ITEMS.get(settings.itemId)?.sources.filter(source=>members.includes(source.ch)).flatMap(source=>source.team||[]));
        if(!required.size)return [];
        const party=partyMons(s);
        return [...required].map(id=>party.find(mon=>mon.id===id)?.uid).filter(Boolean);
    }
    function legalAdventureParty(s,uids,region,pins=[]){
        const party=partyMons(s,uids);
        return party.length>0&&party.length<=6&&party.length===uids.length&&pins.every(uid=>uids.includes(uid))&&
            party.every((mon,i)=>teamEligible(s,mon,region)&&!party.slice(0,i).some(other=>teamApart(mon,other)))&&
            new Set(party.map(mon=>DATA.combat.singles[mon.id]||`${mon.id}:${+!!mon.shiny}`)).size===party.length;
    }
    function localRulesKnown(build=typeof window==='undefined'?null:window.BUILD){
        return !build||[DATA.build,DATA.combat.build,DATA.economy.build,WEATHER_DATA.build].includes(build);
    }
    function logLevel(text){
        if(/失败|异常|不匹配|损坏/.test(text))return 'error';
        if(/超时|未确认|暂缓|已暂停|不可用|没有游戏进展|接管了游戏|需手动/.test(text))return 'warn';
        return /已完成|已领取|已捕获|已结算/.test(text)?'ok':'info';
    }
    function safeLogText(text){
        return String(text??'').replace(/https?:\/\/[^\s，。]+/gi,'[地址]').replace(/\b(?:bearer\s+[^\s,]+|(?:token|apikey|authorization|password|cookie)\s*[=:]\s*[^\s,;&]+)/gi,'[已隐去]').slice(0,360);
    }
    function journalRows(rows){
        if(!Array.isArray(rows))return [];
        return rows.slice(0,80).filter(row=>typeof row?.text==='string').map(row=>({
            text:safeLogText(row.text), time:String(row.time||'').slice(0,16),ts:Number(row.ts)||0,
            level:['info','warn','error','ok'].includes(row.level)?row.level:'info',module:safeLogText(row.module||'运行').slice(0,32),
            count:Math.max(1,Math.min(99999,Number(row.count)||1))
        }));
    }
    class Engine {
        constructor(storage, settings = {}) {
            this.storage = storage; this.settings = normalizeSettings(settings); this.running = false;
            this.status = '已就绪，点击开始'; this.action = ''; this.logs = []; this.account = null;
            this.metrics = {}; this.telemetry = new Telemetry(this.metrics); this.cooldowns = {}; this.raidCooldown = {};
            this.rankingJobs=new Map();
            this.completedTeamSearch=new Map();
            this.searchRosters=new Map();
            this.target = null; this.visit = null; this.nextRaid = 0; this.raidProbe = false; this.raidCheckNote=''; this.raw = null;
            this.progressSignature = ''; this.lastProgress = Date.now(); this.driver = new DOMDriver(this);
            this.timer = null; this.runId = 0; this.nextLegend = 0; this.lease = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            this.manual = null; this.inputHeld = false; this.restoring = false;this.suspended=null;
            this.legendProbe=null;this.farmWait=null;
            this.teamCheck = null; this.teamRetryAt = 0;
            this.automation=new Automation(this);this.services=normalizeServiceState();this.backgroundYield=false;this.budget=new Budget(this);this.queue=[];this.queueIndex=0;this.queueRunning=false;this.checkpoint=null;this.nextWake=null;
            this.nurseryMonitor=new NurseryMonitor(this);
            this.itemRound=new ItemRoundTracker();
            this.nurseryAssist=new NurseryAssist(this);
            this.daily=null;this.dailyMarks={};this.dailyCheckAt=0;
            this.coach=new LevelCoach(this);this.preparation=null;this.raidPreparation=null;
            this.localSnapshot={status:'empty',revision:0,sourceEpoch:0};this.localFailure=null;this.localDirty=true;
            this.health={};this.lastStop=null;this.archivedLogs=[];this.journalAccount=null;this.recoveryPending=null;
            this.computePending=new Map();this.computeTimer=null;this.computeWindow=0;this.computeCpu=0;this.computeTurn=0;
        }
        log(message,level=null,module=null,ts=Date.now()){
            const text=safeLogText(message);
            if(!text)return;
            level=level||logLevel(text);module=module||MODE_NAMES[this.settings.mode]||'运行';
            const prior=this.logs.find(row=>row.text===text&&row.level===level&&row.module===module&&ts>=row.ts&&ts-row.ts<=10000);
            if(prior)this.logs.splice(this.logs.indexOf(prior),1);
            const row={time:new Date(ts).toLocaleTimeString('zh-CN',{hour12:false}),ts,text,level,module,count:Math.min(99999,(prior?.count||0)+1)};
            this.logs.unshift(row);this.logs.length=Math.min(80,this.logs.length);
            // Stops and warnings persist the surrounding activity as context. Routine ticks stay in memory.
            if(level!=='info')this.saveJournal();
            return row;
        }
        saveJournal(){
            if(!this.account||this.account!==this.journalAccount||!this.mayPersist())return;
            try{this.storage.setItem(PREFIX+'journal:'+this.account,JSON.stringify({logs:this.logHistory(),lastStop:this.lastStop}));}catch{}
        }
        logHistory(){return this.logs.concat(this.archivedLogs).slice(0,80);}
        loadJournal(id){
            if(this.journalAccount===id)return;
            this.journalAccount=id;this.logs=[];this.archivedLogs=[];this.lastStop=null;this.health={};this.shinySettlement=null;this.clearFrameProbe();
            try{
                const record=JSON.parse(this.storage.getItem(PREFIX+'journal:'+id)||'{}');
                this.archivedLogs=journalRows(record.logs);
                if(Number.isFinite(record.lastStop?.ts)&&typeof record.lastStop.reason==='string'){
                    this.lastStop={...record.lastStop,reason:safeLogText(record.lastStop.reason),logs:journalRows(record.lastStop.logs).slice(0,12)};
                }
            }catch{}
            this.observeGameRequests();
        }
        observeGameRequests(){
            this.networkObserver?.disconnect();this.networkObserver=null;
            if(typeof window==='undefined'||typeof PerformanceObserver!=='function')return;
            const account=this.account,began=performance.now();
            try{
                this.networkObserver=new PerformanceObserver(list=>{
                    if(this.account!==account)return;
                    for(const entry of list.getEntries()){
                        if(entry.startTime>=began)this.observeGameResponse(entry,Math.round(performance.timeOrigin+entry.responseEnd));
                    }
                });
                this.networkObserver.observe({type:'resource',buffered:false});
            }catch{this.networkObserver?.disconnect();this.networkObserver=null;}
        }
        observeGameResponse(entry,ts){
            if(!Number.isFinite(ts)||!['fetch','xmlhttprequest'].includes(entry?.initiatorType))return;
            const status=Number(entry.responseStatus);
            // Resource Timing exposes no response body or headers. A hidden status (zero) is unknown.
            if(!Number.isInteger(status)||status<100||status>599)return;
            let url;try{url=new URL(String(entry.name).split(/[?#]/,1)[0]);}catch{return;}
            const service=/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)&&/^\/rest\/v1\/rpc\/(?:raid_|world_|session_|cloud_)[a-z_]+$/.test(url.pathname);
            if(!service||url.protocol!=='https:'||url.port||ts<(this.health.networkAt||0))return;
            const failures=this.health.networkFailures||0,previous=this.health.networkAt;
            this.health.networkFailures=status>=500?(previous&&ts-previous<=60000?failures+1:1):0;
            this.health.networkAt=ts;this.health.networkStatus=status;
            if(this.health.networkFailures===2)this.log('游戏服务连续返回 HTTP '+status,'warn','连接',ts);
        }
        healthReport(now=Date.now()){
            const doc=typeof document==='undefined'?null:document,build=typeof window==='undefined'?null:window.BUILD;
            const heartbeat=Number(doc?.documentElement?.getAttribute?.('data-pc-helper-background-at'));
            const nativeVisibility=heartbeat>0&&now>=heartbeat&&now-heartbeat<90000?doc?.documentElement?.getAttribute?.('data-pc-helper-native-visibility'):null;
            let socket={};
            if(heartbeat>0&&now>=heartbeat&&now-heartbeat<90000){
                try{
                    const live=JSON.parse(doc.documentElement.getAttribute('data-pc-helper-realtime'));
                    if(live&&['connecting','open','closed-client','closed-clean','closed-abnormal'].includes(live.state)&&Number.isFinite(live.at)&&live.at>0&&live.at<=now)socket=live;
                }catch{}
            }
            const adv=this.state?.adv,observed=this.health;
            const controls=doc?.querySelector?.('#screen-adventure')&&doc?.querySelector?.('#tabs [data-screen="adventure"]');
            const active=doc?.querySelector?.('.screen.active')?.id;
            const pages={};
            for(const [id,selector] of Object.entries({map:'#map-root .rg[data-rg],#map-root .mp-row,#map-root [data-zone]',
                raid:'#raid-root [data-raid-page],#raid-root .rc-card,#raid-root .map-body,#raid-root [data-raid-draw]',
                underground:'#ug-root [data-ug-tab],#ug-root [data-ug-go],#ug-root [data-ug-take]'})){
                pages[id]=active!=='screen-'+id?'未进入':doc?.querySelector?.(selector)?'已识别':'控件缺失';
            }
            return {frameAt:observed.frameAt??null,saveReadAt:observed.saveReadAt??null,saveState:this.localSnapshot.status,
                saveChangedAt:this.localSnapshot.publishedAt??null,progressAt:observed.progressAt??null,
                networkAt:observed.networkAt??null,networkStatus:observed.networkStatus??null,networkFailures:observed.networkFailures||0,
                socketState:socket.state||'unknown',socketAt:socket.at||null,socketFailures:Math.max(0,Math.min(999,Number(socket.failures)||0)),
                offlineAt:observed.offlineAt??null,onlineAt:observed.onlineAt??null,
                online:typeof navigator!=='undefined'&&typeof navigator.onLine==='boolean'?navigator.onLine:null,
                heartbeatAt:heartbeat>0&&heartbeat<=now?heartbeat:null,hidden:nativeVisibility==='hidden'?true:nativeVisibility==='visible'?false:doc?!!doc.hidden:null,
                compatibility:{pages,layout:!adv||this.localSnapshot.status!=='ready'?'未读取':adv.layout===DATA.layout?'匹配':'不匹配',build:!build?'未读取':localRulesKnown(build)?'已识别':'待核对',controls:!doc?'未读取':controls?'已识别':'未就绪'}};
        }
        captureStop(reason,level=logLevel(reason),ts=Date.now()){
            this.lastStop={ts,reason:safeLogText(reason),level,mode:this.settings.mode,action:safeLogText(this.action),
                status:safeLogText(this.status),signals:this.healthReport(ts),logs:this.logHistory().slice(0,12).map(row=>({...row}))};
            this.log(reason,level,'运行',ts);if(level==='info')this.saveJournal();
        }
        getSnapshot(){return this.localSnapshot;}
        markLocalDirty(){this.localDirty=true;}
        readForView(now=Date.now()){
            const view=this.localSnapshot;
            return !this.localDirty&&view.status==='ready'&&now>=view.checkedAt&&now-view.checkedAt<100?this.state:this.read();
        }
        localReadFailure(status,error,now){
            if(this.localSnapshot.status==='ready'){
                this.cancelTeamSearch();this.cancelRouteRankings();this.teamCheck=null;
                this.driver.teamTask=null;this.telemetry.sample=null;
            }
            this.localSnapshot={...this.localSnapshot,status,checkedAt:now,reason:error?.message};
            if(error)throw error;
            return null;
        }
        read() {
            const now=Date.now();let raw;
            this.localDirty=false;
            try{raw=this.storage.getItem(SAVE_KEY);}
            catch(error){return this.localReadFailure('error',error,now);}
            if(!raw){this.localFailure=null;return this.localReadFailure('missing',null,now);}
            if(raw!==this.raw){
                if(raw===this.localFailure?.raw)return this.localReadFailure('error',this.localFailure.error,now);
                let wire,state,availability;
                try{
                    wire=JSON.parse(raw);state=decodeSave(wire);
                    if(!state||!Array.isArray(state.mons)||!state.dex||typeof state.dex!=='object')throw new Error('无法识别游戏存档');
                    availability=rosterAvailabilityKey(state);
                }catch(error){this.localFailure={raw,error};return this.localReadFailure('error',error,now);}
                const prior=this.localSnapshot,source=JSON.stringify([accountId(state),wire.fmt??null,state.adv?.layout??null]);
                const sameSource=prior.source===source;
                if(prior.source&&!sameSource){
                    this.cancelTeamSearch();this.cancelRouteRankings();this.teamCheck=null;
                    this.driver.teamTask=null;this.telemetry.sample=null;
                    routeRankings.clear();clearTeamCache();
                }
                const box=publishSaveBox(state,sameSource?this.state:null);
                const scene=JSON.stringify([state.adv?.layout,state.adv?.chapter,state.adv?.unlocked,state.adv?.speed,state.adv?.capture,
                    state.adv?.zone?.id,state.adv?.zone?.elite,state.adv?.league?.reg,state.adv?.league?.tier,state.adv?.event?.id,state.buffs,state.autoSwitch]);
                this.localSnapshot={status:'ready',source,sourceEpoch:prior.sourceEpoch+Number(!sameSource),revision:prior.revision+1,
                    combatRevision:(prior.combatRevision||0)+Number(!sameSource||prior.combatKey!==box.roster.fingerprint),
                    availabilityRevision:(prior.availabilityRevision||0)+Number(!sameSource||prior.availability!==availability),
                    sceneRevision:(prior.sceneRevision||0)+Number(!sameSource||prior.scene!==scene),
                    combatKey:box.roster.fingerprint,availability,scene,checkedAt:now,publishedAt:now,rebuiltProfiles:box.roster.rebuilt};
                this.state=state;this.raw=raw;this.localFailure=null;
                this.nurseryMonitor.observe(state,now,false);
                this.itemRound.observe(state,this);
            }else{
                this.localFailure=null;
                if(this.localSnapshot.status!=='ready')this.localSnapshot={...this.localSnapshot,status:'ready',reason:undefined};
                this.localSnapshot.checkedAt=now;
            }
            if(this.running&&this.walletScope&&this.startMoney===null&&accountId(this.state)===this.account){
                const balance=combinedWalletMoney(this.state);
                if(balance!==null){this.startMoney=balance;this.walletScope='rebased';}
            }
            this.health.saveReadAt=now;
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
                this.cancelTeamSearch();
                this.cancelRouteRankings();
                for (const field of SESSION_FIELDS) delete this[field];
                this.endedTotals=null;
                this.queueDraftBase=null;
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
            this.loadJournal(id);
            this.lastPersistedRecord = null;this.lastPersistedAt=null;this.checkpointError=null;this.lastCheckpoint=0;
            let saved = {};
            try { saved = JSON.parse(this.storage.getItem(PREFIX + id) || '{}') || {}; } catch {}
            this.metrics = readRouteHistory(saved.metrics);
            this.raidDraw=saved.raidDraw||null;
            this.daily=null;this.dailyMarks={};
            for(const key of ['window','candy','world','attack','tower','elite']){
                if(Number.isFinite(saved.dailyMarks?.[key]))this.dailyMarks[key]=saved.dailyMarks[key];
            }
            const towerFirst=saved.dailyMarks?.towerFirst;
            if(Number.isFinite(towerFirst)&&towerFirst>(this.dailyMarks.tower||0))this.dailyMarks.tower=towerFirst;
            this.settings = normalizeSettings(saved.settings||{},switching?DEFAULTS:this.settings);
            this.refreshAutoPurchase();
            this.queue = normalizeJobs(saved.queue);
            this.queueIndex = Number.isInteger(saved.queueIndex) ? Math.max(0, Math.min(this.queue.length, saved.queueIndex)) : 0;
            this.checkpoint = saved.resume?.wanted ? migrateDailyResume(saved.resume) : null;
            this.services = normalizeServiceState(saved.services);
            this.telemetry = new Telemetry(this.metrics);
            this.nurseryMonitor.load(s);
            this.nurseryAssist.load();
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
            return{session,flow:{...this.automation.state},preparation:this.preparation,preparationReady:this.coach.ready,flowOwner,specialDialog:special?{type:special.type,key:special.key,optimized:!!special.optimized,...['factoryTeam','eliteTeam','underTeam'].includes(special.type)?{bay:special.bay,floor:special.floor,teamKey:special.teamKey,uids:special.uids,searchBefore:special.searchBefore,sortBefore:special.sortBefore,effBefore:special.effBefore}:{} }:null,raidProbe:this.raidProbe,raidReturn:this.raidReturn,
                activity:{raid:raid?{reg:raid.reg,boss:raid.boss,date:raid.date,started:raid.started}:null,zone:this.zoneId?{id:this.zoneId,started:this.zoneStarted}:null,
                    exit:this.startActivityExit?{kind:this.startActivityExit.kind,key:this.startActivityExit.key}:null},
                budget:{spent:this.budget.spent,used:this.budget.used}};
        }
        saveJobProgress(snapshot=this.progressSnapshot()){
            const job=this.queueRunning&&this.queue[this.queueIndex];if(!this.restoring&&job&&queueJobPending(job)&&this.started)job.progress=snapshot;
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
        persist(wanted=this.running,captureJob=this.running,periodicAt=null) {
            // A stale tab can stop or receive pagehide after another tab has saved its
            // checkpoint. Its cleanup must not replace that owner's task or settings.
            if (!this.mayPersist()) return false;
            const now=periodicAt??Date.now();
            const entries = Object.entries(this.metrics);
            if(entries.length>200){
                entries.sort((a,b)=>(b[1].at||0)-(a[1].at||0));
                entries.length=200;
            }
            const shouldResume=wanted&&this.settings.resumeOnReload;
            const snapshot=captureJob||shouldResume?this.progressSnapshot():null;
            if(captureJob)this.saveJobProgress(snapshot);
            const resume=shouldResume?{...snapshot,wanted:true,account:this.account,build:DATA.build,layout:DATA.layout,at:periodicAt===null?now:this.lastPersistedAt??now,settings:this.settings,daily:this.daily,manual:this.manual,queueRunning:this.queueRunning,queueIndex:this.queueIndex,queueJobId:this.queueRunning?this.queue[this.queueIndex]?.id:undefined}:null;
            const state={settings:this.idleTaskSettings(),metrics:Object.fromEntries(entries),queue:this.queue,queueIndex:this.queueIndex,resume,services:this.services,raidDraw:this.raidDraw,dailyMarks:this.dailyMarks};
            let record=JSON.stringify(state);
            if(periodicAt!==null&&!this.checkpointError&&record===this.lastPersistedRecord&&(!resume||now-this.lastPersistedAt<300000))return true;
            if(resume&&resume.at!==now){resume.at=now;record=JSON.stringify(state);}
            this.storage.setItem(PREFIX + this.account, record);
            this.lastPersistedRecord=record;this.lastPersistedAt=now;this.checkpointError=null;
            if(this.suspended)this.suspended.record=record;
            // Keep the Telemetry object stable, but prune only after durable persistence.
            const retained=new Set(entries.map(([key])=>key));
            for(const key of Object.keys(this.metrics))if(!retained.has(key))delete this.metrics[key];
            return true;
        }
        checkpointTick(now,idle){
            const interval=this.checkpointError?30000:idle?15000:5000;
            const elapsed=now-(this.lastCheckpoint||0);
            if(elapsed>=0&&elapsed<=interval)return;
            this.lastCheckpoint=now;
            // Expired route and dated raid entries otherwise travel with every resume record.
            for(const dates of [this.cooldowns,this.raidCooldown,this.preparation?.avoid,this.weatherFarm?.cooldowns]){
                for(const key of Object.keys(dates||{}))if(!(dates[key]>now))delete dates[key];
            }
            try{this.persist(true,true,now);}
            catch(error){
                if(!this.checkpointError)this.log('暂时无法保存续跑进度，将自动重试：'+(error?.message||error));
                this.checkpointError=String(error?.message||error);
            }
        }
        updateQueue(jobs){
            if(this.running||this.suspended||this.checkpoint?.wanted&&this.settings.resumeOnReload)throw new Error('请先停止任务，再调整任务队列');
            if(!Array.isArray(jobs)||jobs.length>50)throw new Error('任务队列最多保存 50 项');
            const s=this.read();
            if(!s?.adv||accountId(s)!==this.account||!this.mayPersist())throw new Error('当前标签页无法保存任务队列');
            const previous={queue:this.queue,queueIndex:this.queueIndex,queueRunning:this.queueRunning,checkpoint:this.checkpoint};
            const currentId=this.queue[this.queueIndex]?.id;
            this.queue=normalizeJobs(jobs);
            this.queueIndex=Math.max(0,this.queue.findIndex(job=>job.id===currentId));
            this.queueRunning=false;
            this.checkpoint=null;
            try{if(!this.persist(false,false))throw new Error('当前标签页无法保存任务队列');}
            catch(error){Object.assign(this,previous);throw error;}
        }
        startQueue(){
            if(this.running||this.suspended||this.queueDraftBase)return;
            this.queue=normalizeJobs(this.queue);
            const index=this.queue.findIndex(queueJobPending);
            if(index<0){this.status='任务队列中没有可执行任务';return;}
            this.queueIndex=index;this.queueRunning=true;
            this.settings=this.taskSettings(this.queue[index].settings);
            this.start();
        }
        beginTask(s,cp,now,continuingQueue=false){
            this.strictPlanning=true;
            this.nurseryAssist.cancelIdle();
            this.nurseryAssist.feed=null;
            this.cancelTeamSearch();
            this.cancelRouteRankings();
            this.budget=new Budget(this,cp?.budget);
            const cfg=this.settings;
            this.startBattle = !cp && s.adv.battle ? this.ordinaryBattleKey(s) : null;
            this.startItems=itemCounter(s,cfg.itemId);
            this.moneyRankingSince=null;
            this.moneyBoundaryUntil=0;
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
            this.gateSignature=this.lockedLegend=null;
            this.dailyZoneExit=null;
            this.startActivityExit=null;
            this.weatherFarm=null;this.weatherEvidence=null;
            this.roamStarted=null;
            this.roamRestartAt=this.lastExplore=this.teamRetryAt=0;
            this.teamRetryLoop=null;
            this.lastRoamAttempt=null;
            this.raidProbe=false;this.raidCheckNote='';this.raidBoundarySince=null;
            this.raidReturn=this.nextWake=this.modalWaitSince=this.modalWaitNode=null;
            this.nextRaid=this.nextLegend=0;
            this.progressSignature='';
            this.lastProgress=now;
            this.action='';
            this.automation.begin(s);
            // Adjacent jobs can share both an item ID and the engine's runId.
            this.itemRound.round=null;
            if(!cp){this.itemRound.observe(s,this);return;}

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
            if(this.automation.state.eliteDefeat){this.automation.state.eliteDefeat.at=now;this.automation.state.eliteDefeat.clicked=false;}
            if(cfg.autoPrepare&&cp.preparation?.mode===cfg.mode&&Array.isArray(cp.preparation.targets)&&Array.isArray(cp.preparation.uids)){
                if(isCollectionMap(cfg.mode,cp.preparation.context?.kind))this.log('已跳过旧版搜寻路线补练，重新规划捕获目标');
                else this.preparation=cp.preparation;
            }
            if(Array.isArray(cp.preparationReady?.targets))this.coach.ready=cp.preparationReady;
            this.raidReturn=cp.raidReturn||null;
            this.itemRound.observe(s,this);
            if(this.manual)return;
            // Older breeding runs could leave a pending confirmation to withdraw a parent.
            if(!(cfg.mode==='breed'&&cp.flowOwner?.kind==='confirm'&&cp.flowOwner.match?.includes('取回')))this.automation.restoreOwner(cp.flowOwner);
            if(['team','ally','factoryTeam','eliteTeam','underTeam'].includes(cp.specialDialog?.type))this.driver.ownedDialog={...cp.specialDialog,started:now};
            if((cp.raidProbe||this.raidReturn)&&!s.adv.event?.raid){
                this.raidProbe=true;
                this.raidProbeStarted=now;
                if(cp.activity?.raid)this.driver.raid={...cp.activity.raid};
            }
        }
        idleTaskSettings(){
            if(!this.daily)return this.queueDraftBase?{...this.queueDraftBase,autoPurchase:this.settings.autoPurchase}:this.settings;
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
            const raidDue=()=>daily.base.raids&&now>=this.nextRaid&&!this.driver.raid&&!this.raidReturn&&
                !this.raidDailyStatus(s,now)&&!this.raidEntryBlock(s);
            if(!this.dailyZoneExit?.clicked){
                const flow=this.automation.state;
                if(this.preparation||this.driver.ownedDialog||this.automation.owner||this.services.underground||
                    flow.eggService||flow.evolution||flow.hatch||this.automation.buddyTask||this.automation.buffUI||flow.autoBuffTx)return false;
                if(!this.dailyZoneExit&&now<this.dailyCheckAt)return false;
                const plan=dailyFacility(s,daily.base,this.dailyMarks,now)||(raidDue()?{kind:'raid'}:null);
                if(!plan){
                    this.dailyZoneExit=null;
                    this.dailyCheckAt=Math.min(nextParisReset(now),now+30000);
                    return false;
                }
                if(this.dailyZoneExit?.kind!==plan.kind)this.dailyZoneExit={kind:plan.kind};
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
            if(!exit.clicked){
                exit.clicked=this.driver.map(back,s,{leaveZone:true});
                if(exit.clicked)daily.checking=true;
            }
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
                    !flow.towerWasActive&&!flow.towerReached&&!(now-flow.worldResultAt<5000)&&
                    !(flow.worldAttack?.retryAt>now)&&!flow.worldCaptureStarted){
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
            this.beginDailyJob(s,plan,now,!safe);
            this.persist();return true;
        }
        beginDailyJob(s,plan,now,waitingForBattle=false){
            this.daily.checkpoint=this.progressSnapshot();
            this.daily.job={kind:plan.kind,until:plan.until,started:now,waitingForBattle,
                ...(plan.adoptedCandy?{adoptedCandy:true}:{})};
            this.settings=this.taskSettings({...this.daily.base,...plan.settings,autoPrepare:false,raids:false,
                ...(plan.kind==='window'?{autoTeam:false}:{})});
            this.beginTask(s,{budget:this.daily.checkpoint.budget},now,true);
            if(plan.kind==='candy'&&s.candy?.run){
                const {day,at,from}=s.candy.run;
                this.automation.state.candyRun={day,at,from:from||1};
            }
            if(plan.kind==='tower'&&(s.adv.tower||towerProgress(s,now).run)){
                this.daily.job.launched=true;
                this.dailyMarks.tower=Math.max(this.dailyMarks.tower||0,nextParisReset(now));
            }
            const label=MODE_NAMES[this.settings.mode];
            this.status=plan.adopted?'已接管当前'+label+' · 结算后继续通关日常':'通关日常 · '+label;
            this.log(this.status);
        }
        returnFromDaily(reason,until=this.daily.job.until,now=Date.now()){
            const {base,checkpoint,job}=this.daily;
            const s=this.read();
            if(!s?.adv){this.stop('存档不可用，无法恢复挂机');return;}
            this.dailyMarks[job.kind]=job.kind==='window'?now+30000:job.kind==='tower'?Math.max(this.dailyMarks.tower||0,until):until;
            this.settings=this.taskSettings(base);
            this.daily.job=null;this.daily.checking=true;delete this.daily.checkpoint;
            this.beginTask(s,{...checkpoint,budget:{used:this.budget.used,spent:this.budget.spent}},now,true);
            this.dailyCheckAt=0;
            this.status=reason+' · 检查剩余日常';this.log(this.status);this.persist();
        }
        completeTask(reason,status='done'){
            if(this.daily?.job){this.returnFromDaily(reason);return;}
            const state=this.read();if(this.queueRunning&&(state?.adv?.event||state?.adv?.zone||state?.adv?.tower||state?.adv?.league)){this.status='目标已达成，等待当前独立战斗结束后切换队列';this.lastProgress=Date.now();return;}
            if(!this.queueRunning){this.stop(reason);return;}this.log(reason);
            const job=this.queue[this.queueIndex];if(job){job.status=status;job.result=reason;delete job.progress;}
            const index=this.queue.findIndex((job,i)=>i>this.queueIndex&&queueJobPending(job));
            if(index<0){this.queueRunning=false;this.stop(this.queue.some(job=>job.status==='skipped')?'任务队列已结束，含已跳过任务':'任务队列已全部完成');return;}
            this.queueIndex=index;const next=this.queue[index];next.status='running';this.settings=this.taskSettings(next.settings);
            const s=state,now=Date.now();
            this.beginTask(s,next.progress,now,true);
            if(!this.adoptManualPreparation(s,now,true))return;
            this.status=`队列 ${index+1}/${this.queue.length} · ${next.title}`;this.persist();this.notifyView();
        }
        failTask(reason){if(this.queueRunning&&this.queue[this.queueIndex]){this.queue[this.queueIndex].status='failed';this.queue[this.queueIndex].result=reason;}this.stop(reason);}
        suspend(){
            if(!this.running)return;
            if(!this.mayPersist()){this.stop('另一个标签页接管了游戏',{persist:false});return;}
            if(this.logs.length)this.saveJournal();
            const now=Date.now();
            this.suspended=this.restoring?null:{at:now,queueRunning:this.queueRunning,queueIndex:this.queueIndex};
            this.hiddenAt??=now;
            try{
                if(this.suspended)this.suspended.record=this.storage.getItem(PREFIX+this.account);
                this.persist(!this.restoring,!this.restoring);
            }catch{}
            this.cancelRouteRankings(!!this.suspended);
            this.running=false;this.runId++;clearTimeout(this.timer);this.timer=null;this.release();
            this.clearFrameProbe();
            this.cancelTeamSearch(undefined,!!this.suspended);
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
                if(!this.acquire(now)){
                    suspended.retryAt=now+5000;
                    this.status='等待其他标签页释放助手，再继续原任务';return false;
                }
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
                this.itemRound.observe(s,this);
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
            if (held?.token === this.lease && held.expires-now > 5000 && held.expires-now <= 10000) return true;
            this.storage.setItem(key, JSON.stringify({ token: this.lease, expires: now + 10000 }));
            return JSON.parse(this.storage.getItem(key) || '{}').token === this.lease;
        }
        release() {
            const key = PREFIX + 'lease:' + this.account;
            try { if (JSON.parse(this.storage.getItem(key) || '{}').token === this.lease) this.storage.removeItem(key); } catch {}
        }
        activityToLeave(s,cfg=this.settings,cp=null,daily=false){
            const {event,zone,tower,league}=s.adv,mode=cfg.mode;
            if(event?.raid){
                const remembered=cp?.activity?.raid;
                const same=remembered?.reg===(event.reg||currentRegion(s))&&remembered.boss===event.id&&
                    (!remembered.date||remembered.date===(event.date||parisDay()));
                return mode==='raid'||same||daily&&cfg.raids||(!FLOW_MODES.has(mode)&&mode!=='legend')?null:'raid';
            }
            if(event)return 'event';
            if(tower?.kind==='candy')return mode==='candy'?null:'candy';
            if(tower)return mode==='tower'?null:'tower';
            if(league)return mode==='elite'&&(cfg.eliteRegion==='current'||cfg.eliteRegion===league.reg)&&league.tier<=cfg.eliteTier?null:'elite';
            if(!zone)return null;
            if(mode==='world'&&zone.id===493)return null;
            const ids=mode==='legend'?selectedLegendIds(cfg):mode==='dex'?cfg.dexSpecies:[];
            if(ids.includes(zone.id)&&(mode==='dex'?!zone.elite:zone.elite?cfg.legendTier>=zone.elite:!cfg.legendTier))return null;
            if(ids.length&&cp?.activity?.zone?.id===zone.id){
                const gates=legendRequirements(s,ids);
                if(zone.elite?gates?.elites.has(zone.id):gates?.zones.has(zone.id)||gates?.doors.has(zone.id))return null;
            }
            if(mode==='dex'&&!ids.length&&!zone.elite)return null;
            return 'zone';
        }
        startActivityKey(s,kind){
            const {event,zone,tower,league}=s.adv;
            if(kind==='raid'||kind==='event')return JSON.stringify([event?.id,event?.reg,event?.date,event?.started]);
            if(kind==='zone')return JSON.stringify([zone?.id,zone?.elite,zone?.back]);
            if(kind==='elite')return JSON.stringify([league?.reg,league?.tier,league?.back]);
            return JSON.stringify([tower?.kind,s.candy?.run?.at,s.tower?.run?.at]);
        }
        leaveStartActivity(s,now){
            const exit=this.startActivityExit;
            if(!exit)return false;
            const a=s.adv,active={raid:a.event?.raid,event:a.event&&!a.event.raid,zone:a.zone,elite:a.league,tower:a.tower&&a.tower.kind!=='candy',candy:a.tower?.kind==='candy'}[exit.kind];
            if(!active){
                this.startActivityExit=null;this.lastProgress=now;
                this.log('上一项活动已退出，开始'+MODE_NAMES[this.settings.mode]);return false;
            }
            if(exit.key!==this.startActivityKey(s,exit.kind)){this.failTask('当前活动在切换期间发生变化，请重新开始所选任务');return true;}
            if(now-exit.started>60000){this.failTask('游戏未确认退出上一项活动，请检查退出控件后重新开始');return true;}
            this.lastProgress=now;this.telemetry.sample=null;
            this.status='正在退出当前活动，准备'+MODE_NAMES[this.settings.mode];
            if(exit.clicked)return true;
            const d=this.driver,f=this.automation;
            if(exit.kind==='raid')exit.clicked=d.leaveRaid('退出当前团体战，切换任务');
            else if(exit.kind==='tower'||exit.kind==='candy'){
                const candy=exit.kind==='candy';
                if(f.raidPage(exit.kind)&&d.click($(candy?'#candy-root [data-cr-stop]':'#tower-root [data-tw-quit]'),'结束当前'+MODE_NAMES[exit.kind])){
                    exit.clicked=true;
                    f.own('confirm','.modal',{match:/(停止|结束|放弃|放棄|Arrêter|Stop|Quit|Terminer|Abandon|Give up)/i});
                }
            }else if(exit.kind==='event'){
                if(d.nav('event')&&d.click($('#event-root [data-ev-leave]'),'退出当前活动')){
                    exit.clicked=true;
                    f.own('confirm','.modal',{match:/(退出|离开|離開|Quitter|Leave)/i});
                }
            }else{
                if(a.pending?.type==='riddle'){
                    if(d.nav('adventure'))d.click($('#arena [data-rd="pass"]'),'离开当前铭文');
                    return true;
                }
                const back=CHAPTERS.get((a.zone||a.league).back??a.chapter);
                const usable=c=>c&&!c.league&&c.id<=a.unlocked&&(exit.kind!=='elite'||c.id!==a.chapter);
                const row=usable(back)?back:DATA.chapters.find(c=>c.reg===(back?.reg||currentRegion(s))&&usable(c));
                if(row)exit.clicked=d.map(row,s,{leaveZone:true,leaveLabel:'返回'+row.name+'，切换任务'});
            }
            return true;
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
                const cp=resume?this.checkpoint:jobProgress?{...jobProgress,settings:this.settings,queueRunning:true,queueIndex:this.queueIndex,queueJobId:this.queue[this.queueIndex]?.id}:null;
                if(cp){
                    const index=cp.queueJobId?this.queue.findIndex(job=>job.id===cp.queueJobId):Number(cp.queueIndex)||0;
                    if(cp.queueRunning&&(!this.queue[index]||!queueJobPending(this.queue[index])||this.queue[index].settings.mode!==cp.settings?.mode)){
                        this.queueRunning=false;throw new Error('续跑的任务在队列中已变化，请检查任务队列后继续');
                    }
                    this.settings=this.taskSettings(cp.settings);this.queueRunning=!!cp.queueRunning;this.queueIndex=index;
                }
                else this.refreshAutoPurchase();
                if (accountId(s) !== this.account) throw new Error('账号已切换，请刷新页面');
                const mode=daily?dailyMainMode(this.settings):this.settings.mode;
                if(daily&&(!DAILY_BASE_MODES.has(mode)||!s.adv.badges?.includes('Maître')))throw new Error('取得关都冠军徽章后，请在通关日常中选择每日主线');
                if(mode==='train'&&this.settings.trainUid==='selected'&&!cp){
                    const plan=trainingStatus(s,this.settings);
                    if(plan.conflict)throw new Error('指定目标占用同一出战名额，请分成两个培育任务');
                    if(plan.missing)throw new Error('请选择可在当前地区出战的培育目标；手动配队时请先将目标编入队伍');
                }
                const savedDaily=cp?.daily&&!this.queueRunning&&DAILY_BASE_MODES.has(cp.daily.base?.mode)?cp.daily:null;
                const {tower,event,zone,league}=s.adv;
                let adoptedFacility=null;
                if((daily||savedDaily&&!savedDaily.job)&&!event&&!zone&&!league){
                    if(tower)adoptedFacility=tower.kind==='candy'?'candy':'tower';
                    else if(s.candy?.run)adoptedFacility='candy';
                    else if(towerProgress(s).run)adoptedFacility='tower';
                }
                const firstMode=adoptedFacility||mode;
                const leave=this.activityToLeave(s,{...this.settings,mode:firstMode},cp,daily||!!savedDaily);
                const exitKey=leave?this.startActivityKey(s,leave):null;
                if(resume&&leave&&(cp?.activity?.exit?.kind!==leave||cp.activity.exit.key!==exitKey))throw new Error('发现上次任务以外的活动，请点击开始确认切换');
                if (!(s.team || []).length && !s.adv.event?.raid && !s.adv.zone && !FLOW_MODES.has(firstMode) && !['legend','raid'].includes(firstMode) && (!this.settings.autoTeam || !(s.mons||[]).length)) {
                    const gift=this.driver.giftChoice?.(s);
                    if(!pendingRegionalStarter(s)&&!(gift?.reg&&gift.authorized))throw new Error('冒险队伍为空，请先配置队伍');
                }
                if (mode === 'dex' && ENCOUNTER_DATA_ERRORS.length) throw new Error('图鉴出没数据损坏，请重新安装完整脚本');
                if (!this.acquire(Date.now())) { controlDenied=true;throw new Error('另一个标签页正在运行助手'); }
                if(this.queueRunning&&this.queue[this.queueIndex])this.queue[this.queueIndex].status='running';
                this.running = true; this.runId++; this.started = Date.now(); this.stoppedAt = null;this.hiddenAt=null;this.endedTotals=null;
                this.manual = cp?.manual||null; this.interruptedPicker=null; this.inputHeld = false;this.clearHeldInput?.();
                this.startMoney=combinedWalletMoney(s);this.walletScope='all';
                this.tabToken = this.storage.getItem('pokecatch-tab'); this.oldLoops = [...s.adv.loops || []];
                this.errors=0;this.lastCheckpoint=0;this.saveUnavailableAt=null;this.recoveryPending=null;this.shinySettlement=null;
                this.checkpoint=null;
                this.daily=savedDaily||(daily?{base:{...this.settings,mode},menuMode:this.settings.mode,job:null,checking:true}:null);
                if(this.daily)this.daily.checking??=!this.daily.job;
                if(daily)this.settings=this.taskSettings(this.daily.base);
                if(this.daily?.job?.kind==='tower')this.settings={...this.settings,towerRuns:1};
                this.dailyCheckAt=this.dailyWindowCheckAt=0;
                this.beginTask(s,cp,this.started);
                if(leave)this.startActivityExit={kind:leave,key:exitKey,started:this.started};
                else if(adoptedFacility){
                    const candy=adoptedFacility==='candy';
                    this.beginDailyJob(s,{kind:adoptedFacility,until:nextParisReset(this.started),adopted:true,adoptedCandy:candy,
                        settings:candy?{mode:'candy',candyRuns:1,candyFloor:0}:{mode:'tower',towerRuns:1}},this.started,!tower&&!safeRaidDeparture(s));
                }
                if(!leave&&!this.manual&&!this.adoptManualPreparation(s,Date.now(),true))return;
                this.log(this.daily?'开始通关日常 · '+(this.daily.job?MODE_NAMES[this.settings.mode]:'检查待办'):`开始${MODE_NAMES[this.settings.mode]}`);
                if(leave)this.status='已启动'+MODE_NAMES[this.settings.mode]+'，准备退出当前活动';
                else if (s.adv.event?.raid) {
                    const raid = s.adv.event;
                    const remembered=cp?.activity?.raid,same=remembered?.reg===(raid.reg||currentRegion(s))&&remembered?.boss===raid.id&&(!remembered.date||remembered.date===(raid.date||parisDay()));
                    this.driver.raid = { reg: raid.reg || currentRegion(s), boss: raid.id, date: raid.date || parisDay(), started: same?clamp(remembered.started,1,Date.now(),Date.now()):Date.now(), adopted: true };
                    this.trackDailyRaid(s,this.started);
                    if(!this.manual&&this.preparation&&this.preparation.context.kind!=='raid'){this.raidPreparation=this.preparation;this.preparation=null;}
                    this.status = `已接管当前团体战 · ${MONS.get(raid.id)?.name || raid.reg} · ${raidProgressText(s,raid)}`;
                    this.log(this.status);
                } else if (s.adv.zone) {
                    this.zoneId = s.adv.zone.id;this.zoneStarted=cp?.activity?.zone?.id===this.zoneId?clamp(cp.activity.zone.started,1,Date.now(),Date.now()):Date.now();
                    this.status = `已接管当前传说战 · ${MONS.get(s.adv.zone.foe || this.zoneId)?.name || this.zoneId}`;
                    this.log(this.status);
                } else if(!adoptedFacility)this.status = this.daily?.checking?'正在检查通关日常':'规划中';
                if(cp&&!adoptedFacility){this.status='已从上次记录续跑 · '+MODE_NAMES[this.settings.mode];this.log(this.status);}
                this.persist(); this.schedule(50);
            } catch (err) { this.captureStop(err.message,'error');this.status=err.message;this.running=false;this.checkpoint=null;if(!controlDenied&&this.queueRunning&&this.queue[this.queueIndex]){this.queue[this.queueIndex].status='failed';this.queue[this.queueIndex].result=err.message;}this.queueRunning=false;try{if(!controlDenied)this.persist(false);}catch{}finally{this.release();} }
        }
        stop(reason = '已停止助手',options={}) {
            const save=options.persist!==false&&this.mayPersist();
            this.captureStop(reason,options.level);this.shinySettlement=null;this.recoveryPending=null;
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
            if((this.running||this.suspended)&&save){
                this.saveJobProgress();
                const job=this.queueRunning&&this.queue[this.queueIndex];
                if(job?.status==='running'){job.status='paused';job.result=reason;}
            }
            this.suspended=null;
            this.queueRunning=false;
            if(this.daily){this.settings=this.taskSettings(this.idleTaskSettings());this.daily=null;}
            this.running = false; this.runId++; this.stoppedAt ??= Date.now(); clearTimeout(this.timer); this.timer = null;
            this.clearFrameProbe();
            this.cancelTeamSearch();
            this.cancelRouteRankings();
            this.manual = null; this.interruptedPicker=null; this.inputHeld = false;this.clearHeldInput?.(); this.restoring = false;
            this.legendProbe=null;this.farmWait=null;
            this.checkpoint=null;this.automation.owner=null;this.automation.buddyTask=null;this.automation.buffUI=null;this.nextWake=null;this.modalWaitSince=null;
            this.telemetry.sample = null; this.driver.pendingMap = null; this.driver.ownedDialog = null;
            this.driver.teamTask=null;this.driver.navigation=null;
            this.status = reason;
            // Expose the stopped checkpoint before a waiting page can claim the lease.
            try { if(save)this.persist(false,false); } catch {} finally { this.release(); }
        }
        manualInput(now = Date.now()) {
            if (!this.running || !this.settings.manualPause) return;
            if (!this.settings.manualResume || this.restoring) { this.stop('检测到手动操作，已停止助手'); return; }
            if (!this.manual) {
                // A launch can be saved between ticks while this.state still describes the old map.
                // Snapshot the latest persisted activity before yielding to the user's first input.
                let s;
                try{ s=this.read();if(!s?.adv)throw new Error('游戏存档不可用'); }
                catch(err){this.stop('手动接管时无法读取游戏存档：'+(err?.message||err));return;}
                if(accountId(s)!==this.account||s.adv.layout!==DATA.layout){this.stop('账号或游戏版本发生变化，请刷新检查');return;}
                const pending=this.driver.pendingMap,readyRoute=this.moneyReadyRoute||(pending?.routePlan?.verified?pending.row:null);
                this.handoffPlanning={route:this.target,visit:this.visit,mode:this.settings.mode,party:s.team.join('|'),ready:this.coach.ready,checked:this.coach.checked};
                this.cancelTeamSearch(undefined,true);
                this.moneyReadyRoute=readyRoute;
                this.cancelRouteRankings(true);
                const raid = s.adv.event, zone = s.adv.zone;
                this.manual = { since: now, until: now, raid: raidIdentity(s),
                    zone: zone ? JSON.stringify([zone.id, zone.foe, zone.elite]) : null,
                    tower:s?.adv?.tower?JSON.stringify(s.adv.tower):null,league:s?.adv?.league?JSON.stringify([s.adv.league.reg,s.adv.league.tier]):null };
                // Keep a live DOM identity only for the picker this run actually opened.
                const own=this.driver.ownedDialog;
                const ally=own?.type==='ally'&&this.raidProbe&&this.driver.raid&&$('#modal-root.open .raid-dlg');
                this.interruptedPicker=null;
                if(visible(ally))this.interruptedPicker={handoff:this.manual,node:ally,raid:this.driver.raid};
                else if(['team','factoryTeam','eliteTeam','legendEliteTeam','underTeam','backgroundUnderTeam'].includes(own?.type)){
                    const close=$('#evt-pick [data-evt-close]');
                    if(visible(close))this.interruptedPicker={handoff:this.manual,node:close};
                }
                this.log('手动控制中；空闲后自动恢复原任务');
                // A user can change the selected map, party or dialog while in control.
                // Keep session goals and the original loop backup, discard interrupted UI work.
                this.target = null; this.visit = null; this.telemetry.sample = null;
                this.driver.pendingMap = null; this.driver.ownedDialog = null; this.raidProbe = false;
                this.driver.teamTask=null;this.driver.navigation=null;
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
            const index=pokemonByUid(s);
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
            for(const tx of [flow.resourceTx,flow.resourceBuffTx,flow.pensionPurchase,flow.eliteDefeat,this.preparation?.candyTx]){
                if(tx)tx.at=now;
            }
            this.manual = null; this.interruptedPicker=null; this.target = null; this.visit = null; this.telemetry.sample = null;
            this.driver.pendingMap = null; this.driver.ownedDialog = null; this.raidProbe = false;
            this.driver.teamTask=null;
            const reviewed=this.handoffPlanning;this.handoffPlanning=null;
            if(reviewed?.mode===this.settings.mode&&reviewed.party===s.team.join('|')){
                this.coach.ready=reviewed.ready;this.coach.checked=reviewed.checked;
                if(reviewed.route?.members?.length&&this.routeReached(s,reviewed.route)){
                    this.target=reviewed.route;this.visit=reviewed.visit;
                }
            }
            if(!this.startActivityExit&&!this.adoptManualPreparation(s,now,true))return true;
            if(this.raidReturn&&!raid?.raid){this.raidProbe=true;this.raidProbeStarted=now;}
            if (!raid?.raid) this.driver.raid = null;
            if (!zone) { this.zoneId = null; this.zoneStarted = null; }
            this.lastProgress = now; this.progressSignature = ''; this.errors = 0; this.lastExplore = 0;
            this.status = `已恢复${MODE_NAMES[this.settings.mode]}，核对上次规划`; this.action = '';
            this.itemRound.round=null;this.itemRound.observe(s,this);
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
                this.log(`明确接管当前团体战 · ${MONS.get(raid.id)?.name||reg} · ${raidProgressText(s,raid,now)}`);
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
            if (!this.running) return;
            const epoch=this.runId, due=Date.now()+ms;
            if(this.activeTick){
                if(this.requestedTick?.epoch!==epoch||due<this.requestedTick.due)this.requestedTick={epoch,due};
                return;
            }
            if(this.timer!=null&&this.tickEpoch===epoch&&this.scheduledDue<=due)return;
            clearTimeout(this.timer);
            this.sleepDelay=ms;this.scheduledDue=due;
            // A visibility event can reschedule an already overdue callback before it runs.
            this.tickDue=this.tickEpoch===epoch?Math.min(this.tickDue??due,due):due;this.tickEpoch=epoch;
            const ticket=this.tickTicket={};
            this.timer=setTimeout(async()=>{
                if(epoch!==this.runId||ticket!==this.tickTicket||!this.running)return;
                this.timer=null;this.activeTick=true;
                const now=Date.now();
                const tickDue=this.tickDue;this.tickDue=null;
                try{
                    this.accountTimerDelay(tickDue,now);
                    await this.step(now);
                    if(epoch===this.runId)this.errors=0;
                }catch(error){
                    if(epoch===this.runId&&this.running){
                        const message=String(error?.message||error);
                        this.log('异常：'+message);this.status=message;
                        if(++this.errors>=3)this.failTask('连续异常，已暂停：'+message);
                    }
                }finally{
                    this.activeTick=false;
                    const requested=this.requestedTick;this.requestedTick=null;
                    if(this.running&&(epoch===this.runId||requested?.epoch===this.runId)){
                        const delay=requested?.epoch===this.runId?Math.max(0,requested.due-Date.now()):this.nextDelay();
                        this.schedule(delay);
                    }
                    this.notifyView();
                }
            },ms);
        }
        notifyView(force=false){
            try{this.onChange?.(force);this.renderError=null;}
            catch(error){
                const message=String(error?.message||error);
                if(this.renderError!==message)this.log('面板刷新失败：'+message);
                this.renderError=message;
            }
        }
        nextDelay(now=Date.now()){
            if(pageHidden())return 6000;
            if(this.connectionPausedAt!=null)return 6000;
            if(this.connectionCheckAt>now)return Math.min(6000,Math.max(100,this.connectionCheckAt-now));
            if(this.saveUnavailableAt!=null)return 3000;
            if(this.manual){const left=Number(this.manual.until)-now;return left>0?Math.min(1200,Math.max(50,left)):1200;}
            if(Number.isFinite(this.driver.pendingMap?.started)||Number.isFinite(this.driver.teamTask?.started)){
                const at=this.driver.pendingMap?.arrival?.at??this.driver.teamTask?.pending?.at;
                if(at!=null)return now-at<1800?350:1200;
                if(this.driver.pendingMap?.waiting)return 1200;
                if(this.driver.navigation?.nextAt>now)return Math.min(1200,Math.max(350,this.driver.navigation.nextAt-now));
                const untilClick=GAME_ACTION_GAP-Math.max(0,now-this.driver.lastClick);
                return untilClick>0?Math.max(300,untilClick):GAME_ACTION_GAP;
            }
            if(this.preparation||this.driver.pendingMap||this.driver.teamTask||this.driver.ownedDialog||this.driver.navigation||this.automation.owner||this.automation.buddyTask||this.automation.buffUI||this.automation.state.eggService||this.automation.state.evolution||this.services.underground)return 1200;
            if(this.moneyBoundaryUntil>now)return 400;
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
        clearFrameProbe(){
            const probe=this.frameProbe;this.frameProbe=null;
            if(probe&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(probe.frame);
        }
        backgroundFramesStalled(now){
            if(typeof requestAnimationFrame!=='function'){this.clearFrameProbe();return false;}
            if(this.frameProbe==null){
                const probe={at:now};
                this.frameProbe=probe;
                probe.frame=requestAnimationFrame(()=>{if(this.frameProbe===probe){this.frameProbe=null;this.health.frameAt=Date.now();}});
            }
            return backgroundKeepalive(now)&&now-this.frameProbe.at>=8000;
        }
        tryRecoverStall(s,now){
            if(!this.settings.autoRecover||!this.settings.resumeOnReload||!this.running||!this.account||!this.mayPersist(now))return false;
            if(this.manual||this.suspended||this.restoring||this.inputHeld||this.gameInputFocused?.()||this.hiddenAt!=null||this.nextWake>now||
                this.saveUnavailableAt!=null||this.preparation||this.automation.owner||this.driver.ownedDialog||this.driver.teamTask||
                this.driver.pendingMap||this.driver.navigation||this.services.underground||this.automation.state.eggService||this.automation.state.evolution||
                this.automation.buddyTask||this.automation.buffUI||this.shinySettlement||this.raidProbe||this.raidReturn||
                this.startActivityExit||this.daily||FLOW_MODES.has(this.settings.mode))return false;
            const flow=this.automation.state;
            if([flow.resourceTx,flow.autoBuffTx,flow.resourceBuffTx,flow.hatch,flow.underLaunch,flow.underCollect,flow.towerLaunch,
                flow.candyLaunch,flow.departure,flow.rankReceipt,flow.pensionPurchase].some(Boolean))return false;
            const a=s?.adv,doc=typeof document==='undefined'?null:document;
            if(!a||accountId(s)!==this.account||a.paused||a.pending||a.event||a.zone||a.tower||a.league||wildShinyEncounter(s)||
                !doc||doc.hidden||doc.hasFocus?.()!==true||doc.documentElement?.classList?.contains('sleeping')||visible($('.sleep-fx'))||
                visible($('.title-fx'))||visible($('#modal-root.open'))||visible($('#evt-pick')))return false;
            const h=this.healthReport(now);
            const httpFailure=h.networkFailures>=2&&h.networkStatus>=500&&h.networkAt>=h.progressAt&&now-h.networkAt>=0&&now-h.networkAt<=60000;
            const afterReconnect=h.onlineAt!=null&&h.offlineAt!=null&&h.onlineAt>=h.offlineAt&&now-h.onlineAt>=30000&&now-h.onlineAt<=300000;
            const socketFailure=h.socketState==='closed-abnormal'&&h.socketAt>=h.progressAt&&now-h.socketAt<=300000&&
                (h.socketFailures>=2||afterReconnect&&h.socketAt>=h.offlineAt);
            const requiredStall=socketFailure&&afterReconnect?30000:180000;
            // A quiet game, background throttling, loss of connectivity, or an opaque response alone never confirms this case.
            if(h.compatibility.layout!=='匹配'||h.compatibility.build!=='已识别'||h.compatibility.controls!=='已识别'||h.online!==true||h.hidden!==false||
                Object.values(h.compatibility.pages).includes('控件缺失')||h.frameAt==null||now-h.frameAt<0||now-h.frameAt>8000||
                h.progressAt==null||now-h.progressAt<requiredStall||!httpFailure&&!socketFailure)return false;
            try{
                if(typeof sessionStorage==='undefined'||typeof location==='undefined'||typeof location.reload!=='function')return false;
                const key=PREFIX+'recovery-window',raw=sessionStorage.getItem(key);
                const stored=raw===null?[]:JSON.parse(raw);
                if(!Array.isArray(stored)||stored.some(at=>!Number.isFinite(at)||at>now))return false;
                const attempts=stored.filter(at=>now-at<3600000);
                if(attempts.length>=2||attempts.some(at=>now-at<600000))return false;
                // Check durable readback and ownership immediately before consuming this tab's shared quota.
                if(!this.persist(true,true))return false;
                const saved=JSON.parse(this.storage.getItem(PREFIX+this.account));
                if(saved?.resume?.account!==this.account||saved.resume.build!==DATA.build||!saved.resume.wanted||!this.mayPersist(now))return false;
                sessionStorage.setItem(key,JSON.stringify([...attempts,now]));
                this.captureStop((httpFailure?'进度停滞且连续收到游戏服务错误':'进度停滞且游戏实时连接异常中断')+'，检查点已保存，正在重新载入','warn',now);
                this.status=this.lastStop.reason;this.recoveryPending=now;location.reload();return true;
            }catch{this.recoveryPending=null;return false;}
        }
        stopStalled(s,now){
            if(!this.tryRecoverStall(s,now))this.stop('3 分钟没有游戏进展，请检查网络、待选项或队伍',{level:'warn'});
        }
        offlineWait(now){
            if(typeof navigator==='undefined'||typeof navigator.onLine!=='boolean')return false;
            if(navigator.onLine){
                if(this.connectionPausedAt!=null){
                    this.health.onlineAt=now;this.connectionPausedAt=null;this.connectionCheckAt=now+5000;this.reconnectDelay=5000;
                    this.log('浏览器已恢复联网，等待游戏自行重连','info','连接',now);
                }
                return false;
            }
            if(this.connectionPausedAt==null){
                this.health.offlineAt=now;this.connectionPausedAt=now;this.connectionCheckAt=null;
                this.log('浏览器报告断网，已暂缓自动操作','warn','连接',now);
            }
            this.checkpointTick(now,true);this.telemetry.sample=null;this.hiddenAt??=now;
            if(!this.manual)this.status='浏览器离线，等待网络恢复';
            return true;
        }
        reconnectWait(s,now){
            if(this.connectionCheckAt==null)return false;
            if(now<this.connectionCheckAt){this.hiddenAt??=now;this.telemetry.sample=null;this.status='网络已恢复，等待游戏重新连接';return true;}
            const h=this.healthReport(now);
            if(h.socketState==='closed-abnormal'&&h.socketAt>=h.offlineAt&&h.progressAt<=h.onlineAt){
                if(this.tryRecoverStall(s,now))return true;
                if(now-h.onlineAt<60000){
                    this.reconnectDelay=Math.min(30000,this.reconnectDelay*2);this.connectionCheckAt=now+this.reconnectDelay;
                    this.hiddenAt??=now;this.telemetry.sample=null;
                    this.status='游戏实时连接仍未恢复，等待游戏自行重连';return true;
                }
            }
            this.connectionCheckAt=null;return false;
        }
        resumeUIClock(now,delayed=false){
            if(this.hiddenAt==null)return;
            const duration=Math.max(0,now-this.hiddenAt);this.hiddenAt=null;
            if(this.daily?.job&&this.daily.job.kind!=='window')this.daily.job.started+=duration;
            if(this.dailyZoneExit?.started!=null)this.dailyZoneExit.started+=duration;
            if(this.startActivityExit?.started!=null)this.startActivityExit.started+=duration;
            if(this.weatherFarm?.started!=null)this.weatherFarm.started+=duration;
            this.lastProgress=delayed?Math.min(now,this.lastProgress+duration):now;
            if(this.roamStarted!=null)this.roamStarted+=duration;
            if(this.raidProbe&&this.raidProbeStarted!=null)this.raidProbeStarted+=duration;
            if(this.driver.ownedDialog?.openingUntil!=null)this.driver.ownedDialog.openingUntil+=duration;
            if(this.legendProbe?.started!=null)this.legendProbe.started+=duration;
            if(this.driver.pendingMap?.arrival?.at!=null)this.driver.pendingMap.arrival.at+=duration;
            if(this.visit?.routePlan?.started!=null)this.visit.routePlan.started+=duration;
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
            for(const tx of [this.automation.rankUI,this.automation.state.rankReceipt,this.automation.state.towerLaunch,this.automation.state.candyLaunch,this.automation.state.underLaunch,this.automation.state.underCollect,this.automation.state.departure,this.automation.state.eliteDefeat])if(tx?.at!=null)tx.at+=duration;
            if(this.automation.state.candyEndedAt!=null)this.automation.state.candyEndedAt+=duration;
            const eggs=this.automation.state;
            if(eggs.eggService){eggs.eggService.started+=duration;if(eggs.eggService.tx)eggs.eggService.tx.at+=duration;}
            if(eggs.hatch?.at!=null)eggs.hatch.at+=duration;
            if(eggs.eggReceiptUntil!=null)eggs.eggReceiptUntil+=duration;
            if(this.modalWaitSince!=null)this.modalWaitSince+=duration;
            const p=this.preparation;
            if(p){for(const key of ['phaseAt','lastGrowth','candyAt'])if(p[key]!=null)p[key]+=duration;if(p.roadWait)p.roadWait.at+=duration;if(p.candyTx)p.candyTx.at+=duration;if(!delayed)p.lastTick=now;else if(p.lastTick!=null)p.lastTick+=duration;}
        }
        serviceBackground(s,now=Date.now(),plan=null,phase='all'){
            if(!this.running||this.manual||pageHidden())return false;
            plan??=parallelPlan(s,this,now);
            const a=this.automation;
            if(plan.active){
                const handled=plan.active==='underground'?a.serviceUnderground(s,now):plan.active==='eggs'?a.serviceEggs(s,now):a.evolution(s,now);
                if(handled&&!parallelPlan(s,this,now).active){this.services.lastCompleted[plan.active]=now;this.backgroundYield=true;}
                return handled;
            }
            if(plan.mainComplete)return false;
            // Ready daily services can chain a receipt and a new expedition before a facility takes the page.
            if(this.backgroundYield&&phase!=='daily'){this.backgroundYield=false;return false;}
            for(const id of plan.ready){
                if(phase==='daily'&&id==='evolution'||phase==='evolution'&&id!=='evolution')continue;
                const handled=id==='eggs'?a.serviceEggs(s,now):id==='underground'?a.serviceUnderground(s,now):a.evolution(s,now);
                if(handled){this.backgroundYield=false;this.services.lastStarted[id]=now;this.persist();return true;}
            }
            return false;
        }
        async step(now = Date.now()) {
            if (!this.running) return;
            if (this.storage.getItem('pokecatch-tab') !== this.tabToken || !this.acquire(now)) { this.stop('另一个标签页接管了游戏',{persist:false}); return; }
            if(this.recoveryPending!=null){if(now-this.recoveryPending>=15000)this.stop('重新载入未完成，请手动检查当前页面',{level:'warn'});return;}
            if (this.settings.stopMinutes && now - this.started >= this.settings.stopMinutes * 60000) { this.stop('达到定时运行上限'); return; }
            if (pageHidden()) { this.checkpointTick(now,true);this.clearFrameProbe();this.hiddenAt??=now;this.status = '后台等待；回到游戏标签后继续'; this.lastProgress = now; this.telemetry.sample = null; return; }
            if(this.offlineWait(now))return;
            let s;
            try{s=this.read();}
            catch(error){if(error?.name==='UnsupportedGameSaveError'){this.stop(error.message,{persist:false});return;}}
            if(!s?.adv){
                this.saveUnavailableAt??=now;
                this.telemetry.sample=null;this.hiddenAt??=now;this.lastProgress=now;
                if(now-this.saveUnavailableAt>=60000)this.stop('游戏存档持续不可用，请检查游戏是否已加载');
                else this.status='等待游戏存档恢复，期间暂停助手操作';
                return;
            }
            if (accountId(s) !== this.account || s.adv.layout !== DATA.layout) { this.stop('账号或游戏版本发生变化，请刷新检查',{persist:false}); return; }
            this.saveUnavailableAt=null;
            this.checkpointTick(now,FLOW_MODES.has(this.settings.mode)&&this.nextWake>now);
            if(this.backgroundFramesStalled(now)){
                this.hiddenAt??=now;this.status='浏览器已暂停游戏画面，等待恢复渲染后继续补练或原任务';
                this.lastProgress=now;this.telemetry.sample=null;return;
            }
            const sleepOverlay=$('.sleep-fx'),sleeping=document.documentElement?.classList?.contains('sleeping')||visible(sleepOverlay);
            if(s.adv.paused||sleeping){this.hiddenAt??=now;this.lastProgress=now;this.telemetry.sample=null;}
            else this.resumeUIClock(now);
            if(s.adv.paused){this.status='游戏已暂停，等待你在游戏内继续';return;}
            if (this.manual && this.manualStep(s, now)) return;
            this.trackDailyRaid(s,now);
            if(sleeping){
                this.status='游戏进入省电界面，正在唤醒后继续原任务';
                // The native handler restores both its internal sleep state and the active
                // game screen. Removing the html class alone would leave those out of sync.
                this.driver.click(sleepOverlay,'唤醒游戏省电界面',true);
                return;
            }
            const signature = JSON.stringify([s.adv.chapter, s.adv.node, s.adv.runs, s.stats?.battles, s.stats?.wins, s.stats?.caught, s.adv.event?.loops, s.adv.zone?.loops, s.adv.battle?.steps, s.adv.battle?.enemies?.map(m => m.hp)]);
            if (signature !== this.progressSignature) { this.progressSignature = signature; this.lastProgress = now;this.health.progressAt=now; }
            if(this.reconnectWait(s,now))return;
            if((this.shinySettlement||wildShinyEncounter(s))&&this.holdWildShiny(s,now))return;
            const zoneRequest=this.driver.pendingMap;
            if(zoneRequest?.options?.zone&&zoneRequest.arrival&&this.observeZoneArrival(s,zoneRequest,now))return;
            if(s.adv.zone?.riddle&&s.adv.zone.id===this.zoneId&&['dex','legend'].includes(this.settings.mode)){
                const zone=gateZones.get(this.zoneId),rule=zone?.gate;
                if(rule?.kind==='door'&&rule.key===s.adv.zone.riddle&&(!this.settings.legendMinutes||now-this.zoneStarted<this.settings.legendMinutes*60000)){
                    this.lastProgress=now;this.status=zone.name+' · 正在解开入口铭文';
                    const pending=s.adv.pending;
                    if(!pending||pending.type!=='riddle'||pending.waitAt){this.driver.nav('adventure');return;}
                    const uids=riddleParty(s,rule,zone.reg,false);
                    if(!uids){this.stop('铭文所需队员已改变，请调整队伍后继续');return;}
                    const modal=$('#modal-root.open');
                    if(modal){
                        const answer=[...modal.querySelectorAll('.rd-dlg .rd-mon[data-uid]')].find(el=>el.dataset.uid===uids[0]);
                        if(answer){this.driver.click(answer,'向铭文展示队员');return;}
                    }else{
                        if(this.driver.nav('adventure'))this.driver.click($(rule.wait?'#arena [data-rd="wait"]':'#arena [data-rd="show"]'),'回应入口铭文');
                        return;
                    }
                }
            }
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
            if(this.startActivityExit?.kind==='zone'&&s.adv.pending?.type==='riddle'&&visible($('#modal-root.open .rd-dlg'))){
                this.driver.click($('#modal-root.open .rd-dlg .dc-x'),'关闭当前铭文，切换任务');return;
            }
            if (this.driver.ownedDialog) return;
            if (visible($('#modal-root.open')) || visible($('#evt-pick'))) {
                const blocker=$('#modal-root.open .modal')||$('#evt-pick')||$('#modal-root.open');
                if(this.modalWaitNode!==blocker){this.modalWaitNode=blocker;this.modalWaitSince=now;}
                this.modalWaitSince??=now;
                this.status = '等待游戏弹窗；需要选择时请手动处理';
                if (now - this.modalWaitSince > 120000) this.failTask('弹窗等待超时，请处理后重新开始'); return;
            }
            this.modalWaitSince=null;this.modalWaitNode=null;
            if(this.leaveStartActivity(s,now))return;
            if(this.nurseryAssist.runningStep(s,now))return;
            if(this.settings.mode==='elite'&&this.automation.exitDefeatedLeague(s,now))return;
            if(!s.team?.length&&pendingRegionalStarter(s)){
                this.lastProgress=now;this.telemetry.sample=null;
                this.status='等待游戏显示初始伙伴选择';this.driver.nav('adventure');return;
            }
            if(this.holdWildShiny(s,now))return;
            if(this.yieldLegendToDaily(s,now))return;
            const inActivity=s.adv.event||s.adv.zone||s.adv.tower||s.adv.league;
            if(this.daily&&!inActivity&&this.driver.raid&&!this.raidProbe&&!this.raidReturn&&!this.preparation){
                this.finishRaidReturn(now,s);
            }
            const dailyBackground=this.daily&&!inActivity?parallelPlan(s,this,now):null;
            if(dailyBackground&&this.serviceBackground(s,now,dailyBackground,'daily'))return;
            if(!inActivity&&this.waitForDailyRaid(s,now))return;
            const reserved=this.daily?.job;
            if(reserved?.waitingForBattle&&!inActivity){
                if(now>=reserved.until&&!reserved.launched&&!reserved.adoptedCandy){this.returnFromDaily('日常时段已结束',now,now);return;}
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
            const opening=this.daily?.checking&&!this.daily.job&&!inActivity;
            const scheduleDaily=opening||!outcome||finishDaily;
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
                const raidNote=this.daily.base.raids&&(this.raidDailyStatus(s,now)?.reason||this.raidCheckNote);
                this.log('当前可执行日常已检查，开始挂机 · '+MODE_NAMES[this.settings.mode]+(raidNote?' · '+raidNote:''));this.persist();
            }
            if(!inActivity&&!outcome&&!this.preparation&&!this.raidProbe&&!this.raidReturn&&!settling&&!this.driver.teamTask&&this.followMarkedHunt(s,now))return;
            if(this.settings.mode!=='raid'&&!this.daily&&!foregroundFirst&&!inActivity&&scheduleDaily&&this.priorityRaid(s,now))return;
            const enteringFacility=this.daily?.job&&this.daily.job.kind!=='window'&&!inActivity;
            if(!foregroundFirst&&(!enteringFacility||settling)&&
                this.serviceBackground(s,now,dailyBackground,dailyBackground?'evolution':'all'))return;
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
            // A planned party can differ from the road party as soon as the
            // first drag is saved. Finish that transaction before checking readiness.
            if(this.applyArrivalTeam(s,now)){
                if(this.driver.teamTask)this.driver.adventureTeam(s,now);
                return;
            }
            const startedSwap=this.driver.teamTask;
            if((startedSwap?.hasDragged||startedSwap?.pending)&&this.driver.adventureTeam(s,now))return;
            if(!this.preparation&&!outcome&&this.settings.autoPrepare){
                const context=this.coach.activity(s),zone=s.adv.zone&&DATA.zones.find(z=>z.id===s.adv.zone.id);
                const resume=context?.kind==='raid'?{type:'raid'}:zone?{row:routeDescriptor({...zone,key:`Z${zone.id}`,members:[],name:zone.monName||zone.name}),options:{zone:true,tier:s.adv.zone.elite||0,optimize:this.settings.optimizeRaid}}:{};
                if(context&&this.ensurePrepared(s,context,resume,now))return;
                const adventure=!context&&this.coach.adventure(s,outcome,now);
                if(adventure&&this.ensurePrepared(s,adventure.context,adventure.resume,now))return;
            }
            if(this.driver.teamTask&&this.driver.adventureTeam(s,now))return;
            if(!startingBattle&&!outcome&&this.settings.activeSwitch&&this.driver.switchInBattle(s,now))return;
            if(this.preparation){this.coach.step(s,now);return;}
            if(this.raidReturn&&this.raidProbe&&!s.adv.event?.raid){this.probeRaid(s,now);return;}
            if (s.adv.event?.raid) {
                if (now - this.lastProgress > 180000) { this.stopStalled(s,now);return; }
                this.raidProbe = false; this.raidReturn=null; this.telemetry.sample = null;
                const raid = this.driver.raid;
                if (!raid) { this.stop('团体战尚未接管，请点击开始助手'); return; }
                if (raid.reg !== (s.adv.event.reg||currentRegion(s)) || raid.boss !== s.adv.event.id) { this.stop('团体战目标已变化，请重新开始接管'); return; }
                const event=s.adv.event;
                this.status = `团体战进行中 · ${MONS.get(event.id)?.name || event.reg} · ${raidProgressText(s,event,now)}`;
                this.raidCheckNote=this.status;
                if (!this.daily?.raidPending && now - raid.started > this.settings.raidMinutes * 60000) {
                    if (this.driver.leaveRaid()) {
                        const day=raid.date||s.adv.event.date||parisDay(now);
                        this.raidCooldown[day+'|'+raid.reg]=raidRetryAt(now,day,1800000);
                        this.raidCheckNote=day===parisDay(now)?'团体战达到时限，稍后重试':'上一日团体战已退出，接下来检查今日抽取';
                        this.nextRaid=raidRetryAt(now,day);this.driver.raid=null;this.log(this.raidCheckNote);
                    }
                } else if(!this.driver.activeTeam?.(s))this.driver.nav('adventure');
                return;
            }
            if (this.driver.raid && !this.raidProbe)this.finishRaidReturn(now,s);
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
            if (now - this.lastProgress > 180000&&!this.driver.pendingMap?.waiting) { this.stopStalled(s,now);return; }
            if (s.adv.zone) {
                this.telemetry.sample = null;
                if (this.zoneId !== s.adv.zone.id) { this.stop('检测到手动传说战，已交还控制'); return; }
                this.status = `${s.adv.zone.elite ? '精英传说战' : '捕获传说'} · ${MONS.get(s.adv.zone.foe || s.adv.zone.id)?.name || this.zoneId}`;
                if (s.adv.pending?.type === 'riddle') { this.stop('遇到铭文谜题，请手动解谜后继续'); return; }
                if (this.settings.legendMinutes>0 && this.zoneStarted!=null && now-this.zoneStarted>=this.settings.legendMinutes*60000) { this.stop('传说战达到时限，请手动退出或继续'); return; }
                if(!this.driver.activeTeam?.(s))this.driver.nav('adventure'); return;
            }
            if (s.adv.event || s.adv.tower || s.adv.league) { this.stop('检测到其他活动，已暂停助手'); return; }
            if (!(s.team || []).length && this.settings.mode !== 'legend' && !this.settings.autoTeam) { this.stop('当前战斗已结束，冒险队伍为空，请先配置队伍'); return; }
            if (this.driver.pendingMap) {
                const pending = this.driver.pendingMap;
                const mode=this.settings.mode;
                if(pending.arrival){this.observeMapArrival(s,pending,now);return;}
                if(pending.options?.zone&&pending.options.tier&&(Number(s.elite?.[pending.row.id]?.t)||0)+1!==pending.options.tier){
                    this.driver.pendingMap=null;
                    this.status='传说精英阶级已变化，重新核对下一阶';
                    return;
                }
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
                if(pending.options?.roamId){
                    const opt=pending.options;
                    const wait=roamingMasterBallWait(s,this.settings,opt.roamId);
                    if(wait){pending.started=now;this.lastProgress=now;this.status=wait;return;}
                    const gates=opt.roamGoals?legendRequirements(s,opt.roamGoals.filter(id=>!captured(s,id))):null;
                    const ids=opt.roamGoals?(gates?.roam||[]):opt.roamIds||[opt.roamId];
                    const best=bestRoamingPlan(s,this.settings,ids,now,opt.roamId,gates?[...gates.roamOwned]:[]);
                    if(!best||best.target.id!==opt.roamId||best.row.id!==pending.row.id||best.active||
                        best.marked&&best.row.id===s.adv.chapter||!!opt.restart!==best.restart){
                        this.driver.pendingMap=null;this.status='游荡位置或遭遇已变化，重新确认路线';return;
                    }
                    if(s.adv.pending||s.adv.battle&&!this.ordinaryBattleKey(s)){
                        pending.started=now;this.lastProgress=now;return;
                    }
                }
                const wasWaiting=!!pending.waiting;
                if (!wasWaiting&&now - pending.started > 60000) { this.stop('地图操作超时，请检查地区解锁和页面控件'); return; }
                if(!pending.options?.zone&&!this.routeRequestValid(s,pending,now)){
                    this.driver.pendingMap=null;this.telemetry.sample=null;this.status='地图或队伍条件已变化，重新比较路线';return;
                }
                if(!pending.options?.zone&&!pending.options?.restart&&this.routeReached(s,pending.row)){
                    if(this.driver.nav('adventure'))this.confirmMapArrival(s,pending,now);
                    return;
                }
                if (this.driver.map(pending.row, s, pending.options)) {
                    if(pending.options?.zone){
                        pending.arrival={at:now,caught:captured(s,pending.row.id),tier:Number(s.elite?.[pending.row.id]?.t)||0};
                        this.status=`等待游戏确认传说战 · ${pending.row.name}`;
                    }
                    else{
                        pending.arrival={at:now,chapter:s.adv.chapter,node:s.adv.node,runs:s.adv.runs||0,
                            side:s.link?(pending.row.reg===s.link.to?'to':'from'):null};
                        this.status=`等待游戏确认到达 · ${pending.row.name}`;
                    }
                }
                else if(pending.waiting||wasWaiting){
                    pending.started=now;this.lastProgress=now;
                    if(pending.waiting&&pending.options?.gateElite){
                        this.cooldowns['gateElite:'+pending.row.id]=now+5*60000;this.driver.pendingMap=null;
                    }else if(pending.waiting?.prerequisite&&mode==='legend'&&pending.row.id===this.settings.legendId){
                        this.lockedLegend=pending.row.id;this.driver.pendingMap=null;
                    }else if(pending.waiting&&pending.options?.zone&&mode==='legend'&&this.settings.legendIds?.length>1){
                        this.cooldowns['legend:'+pending.row.id]=now+5*60000;
                        this.log(pending.row.name+' 暂未开放，继续检查其他所选目标');
                        this.driver.pendingMap=null;
                    }
                }
                return;
            }
            const safeBoundary = !s.adv.battle && !s.adv.pending;
            if(this.settings.mode==='legend'&&this.settings.legendIds?.length>1&&!this.selectLegendTarget(s,now))return;
            if(this.settings.mode==='roam'||this.settings.mode==='legend'&&!this.settings.legendTier&&DATA.zones.some(zone=>zone.id===this.settings.legendId&&zone.eliteOnly)){
                this.roaming(s,now);return;
            }
            if (this.settings.mode === 'legend') {
                if (s.adv.speed !== this.settings.speed) { if (this.driver.nav('adventure')) this.driver.click($(`#speed-btns [data-speed="${this.settings.speed}"]`), '设置游戏内速度'); return; }
                if(!safeBoundary&&!startingBattle&&this.lockedLegend===this.settings.legendId&&!this.settings.legendTier&&!s.adv.pending){
                    const gate=legendRequirements(s,[this.lockedLegend]);
                    if(gate&&this.pursueGateRoamer(s,{...this.settings,legends:true,dexWeather:[]},gate,now))return;
                }
                if (safeBoundary || startingBattle) this.legend(s, now); return;
            }
            const speed = $(`#speed-btns [data-speed="${this.settings.speed}"]`);
            if (s.adv.speed !== this.settings.speed && this.driver.nav('adventure')) { this.driver.click(speed, '设置游戏内速度'); return; }
            const dex=this.settings.mode==='dex'?dexStatus(s,this.settings):null;
            let dexRoutes=dex?.missing.length?dexRanking(s,this.settings,this.cooldowns,now,dex):[];
            const directedHunt=this.settings.mode==='shiny'||(dex?.missing.length>0&&(this.settings.dexSpecies.length>0||dexRoutes[0]?.window));
            const paired=this.visit?.activeRoutePlan;
            const pairedReady=paired&&this.verifiedFarmHeld(s,now);
            if(paired&&!pairedReady)delete this.visit.activeRoutePlan;
            if(!directedHunt&&!pairedReady&&this.settings.autoTeam&&(!startingBattle||this.target||this.settings.mode==='progress')&&this.fitTeam(s,now))return;
            const roadPending=Array.isArray(s.road)&&s.road.length>0&&(s.road.length!==s.team.length||s.road.some((uid,i)=>uid!==s.team[i]));
            if(roadPending)this.telemetry.sample=null;
            if (this.target && this.target.members.includes(s.adv.chapter) && !roadPending) {
                if (!this.telemetry.sample) this.telemetry.begin(s, this.target, this.settings, now);
                const sample = this.telemetry.observe(s, this.target, this.settings, now);
                if (sample?.valid) {
                    this.updateHeldFarmSample(s,sample,now);
                    this.log(`${this.target.name} 实测 ${Math.round(sample.net / sample.seconds * 60)} ₽/分钟${sample.xp != null ? ` · ${Math.round(sample.xp / sample.seconds * 60)} EXP/分钟` : ''}`);
                    this.persist();
                }
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
                const gate=this.settings.dexSpecies.length
                    ?legendRequirements(s,status.missing.map(m=>m.id)):null;
                if(gate&&!s.adv.pending){
                    if(!rows.length||rows[0].gateRoute){if(this.advanceRequirements(s,this.settings,gate,rows,now))return;}
                    else if(this.pursueGateRoamer(s,this.settings,gate,now))return;
                }
                const alternate=this.huntAlternate(s,stillNeeded,rows,now);
                if (this.target && stillNeeded && stillNeeded.members.includes(s.adv.chapter) && this.visit && !alternate) {
                    if(directedHunt&&this.settings.autoTeam&&!stillNeeded.requiredParty?.length&&this.fitTeam(s,now))return;
                    if(safeBoundary&&stillNeeded.hasWild&&this.automation.autoBuff(s,now)){this.telemetry.sample=null;return;}
                    const limit=stillNeeded.window;
                    const detail=limit?` · 优先 ${MONS.get(limit.id).name}（${limit.place}，至 ${new Date(limit.until).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}）`:stillNeeded.specialNodesOnly?' · 等待生成目标节点':'';
                    this.status = stillNeeded.prepNote ? `${this.target.name} · ${stillNeeded.prepNote}` :
                        `补图鉴 · ${DATA.regions.find(r=>r.key===stillNeeded.reg)?.name||stillNeeded.reg} · ${this.target.name} · 目标 ${stillNeeded.targets.map(m => MONS.get(m.id)?.name).slice(0, 5).join('、')}${detail}`; this.driver.nav('adventure'); return;
                }
                if (!safeBoundary&&!startingBattle&&!(directedHunt&&this.ordinaryBattleKey(s))) {this.waitForHuntBoundary(rows[0]);return;}
                const next=alternate||rows[0];
                if (next) {
                    if(!directedHunt&&safeBoundary&&next.hasWild&&this.automation.autoBuff(s,now)){this.telemetry.sample=null;return;}
                    this.travelHunt(next,alternate,now); return;
                }
                if (!gate && this.settings.legends && !this.settings.dexWeather?.length && now >= this.nextLegend && this.findLegend(s, status, now)) return;
                if(this.settings.dexWeather?.length||this.settings.dexSpecies?.length){
                    this.target=null;this.visit=null;this.telemetry.sample=null;
                    if(this.settings.dexSpecies?.length){
                        if(dexRanking(s,this.settings,{},now).length){this.waitForFarm('目标地图暂时退避，到期后自动重试',now);return;}
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
                        const advice=dexWaitAdvice(s,this.settings,status.missing,now);
                        this.waitForFarm(advice,now);return;
                    }
                    this.waitForFarm('所选范围暂无可刷目标，等待天气、退避结束或开放来源；可在图鉴查看获取条件',now);return;
                }
                if (this.settings.progress && this.canProgress(s)) { this.progress(s, now); return; }
                this.status = `还缺 ${status.missing.length} 条进化链；等待天气、特殊条件或解锁，暂刷钱`;
                this.money(s, now); return;
            }
            this.money(s, now);
        }
        queueCompute(job,run,priority){
            this.computePending.set(job,{run,priority});this.runComputeQueue();
        }
        cancelCompute(job){
            this.computePending.delete(job);
            if(!this.computePending.size&&this.computeTimer!==null){clearTimeout(this.computeTimer);this.computeTimer=null;}
        }
        runComputeQueue(){
            if(this.computeBusy||this.computeTimer!==null||!this.computePending.size)return;
            const now=performance.now(),elapsed=now-this.computeWindow;
            if(elapsed>=50){this.computeWindow=now;this.computeCpu=0;}
            const delay=this.computeCpu>=16?Math.max(1,Math.ceil(50-elapsed)):0;
            this.computeTimer=setTimeout(()=>{
                this.computeTimer=null;
                const start=performance.now();if(start-this.computeWindow>=50){this.computeWindow=start;this.computeCpu=0;}
                let selected;
                const fair=++this.computeTurn%5===0;
                for(const entry of this.computePending){
                    if(!selected||entry[1].priority<selected[1].priority)selected=entry;
                    if(fair)break;
                }
                if(!selected)return;
                const [job,{run}]=selected;this.computePending.delete(job);this.computeBusy=true;
                try{run();}finally{this.computeBusy=false;this.computeCpu+=performance.now()-start;this.runComputeQueue();}
            },delay);
        }
        cancelTeamSearch(slot,preserveCompleted=false){
            for(const name of slot?[slot]:['teamSearch','evolutionSearch','moneyProofSearch']){
                if(this[name])this.cancelCompute(this[name]);
                this[name]=null;
            }
            if(!slot||slot==='teamSearch')this.teamContinuation=null;
            if(!slot){
                this.adventureReview=null;this.moneyProofReview=null;this.moneyProofRetry=null;this.moneyReadyRoute=null;
                if(!preserveCompleted){this.completedTeamSearch.clear();this.searchRosters.clear();this.routeProof=null;this.handoffPlanning=null;}
            }
        }
        searchRosterRevision(slot,fingerprint){
            // Keep the exact comparison, but don't serialize the whole PC into every poll's search key.
            const prior=this.searchRosters.get(slot);
            if(prior&&prior.fingerprint===fingerprint)return prior.revision;
            const revision=(prior?.revision||0)+1;
            this.searchRosters.set(slot,{fingerprint,revision});
            return revision;
        }
        evaluateTeamSearch(signature,search,slot='teamSearch',strict=false,expiresAt=Infinity){
            let job=this[slot];
            if(job&&job.signature!==signature){this.cancelTeamSearch(slot);job=null;}
            const completed=this.completedTeamSearch.get(slot);
            if(strict&&completed?.signature===signature&&!job)return completed.result;
            if(strict&&performance.now()>=(job?.expiresAt??expiresAt)&&!job?.result){
                this.cancelTeamSearch(slot);return {timedOut:true};
            }
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
                    const resume=saved.resume;saved.resume=null;this.queueCompute(saved,resume,1);
                    return null;
                }
            }
            const smallDevice=globalThis.navigator?.hardwareConcurrency<=4||globalThis.navigator?.deviceMemory<=4;
            const priority=slot==='moneyProofSearch'?2:1;
            job=this[slot]={signature,epoch:this.runId,cpu:0,slice:4,limit:smallDevice?80:180,strict,expiresAt};
            const advance=()=>{
                if(this[slot]!==job)return;
                if(!this.running||this.manual||job.epoch!==this.runId||pageHidden()){this.cancelTeamSearch(slot);return;}
                if(job.strict&&performance.now()>=job.expiresAt){job.result={timedOut:true};return;}
                // Only score this snapshot here. The normal tick checks the latest
                // route, party and roster again before it can queue a single PC action.
                const start=performance.now(),deadline=start+job.slice;
                try{
                    do{
                        const step=search.next();
                        if(step.done){
                            const plan=step.value,finalScore=plan?.changed?plan.score:plan?.currentScore;
                            job.result=!job.strict&&job.best?.checkpointScore>finalScore?job.best:plan;
                            if(job.strict&&signature.startsWith('["adventure",')&&['verified','exhaustive'].includes(plan?.verification?.status)&&
                                plan.verification.uids?.join('|')===plan.uids?.join('|'))this.completedTeamSearch.set(slot,{signature,result:plan});
                            if((this.timer!=null||this.activeTick)&&(signature.startsWith('["adventure",')||slot==='moneyProofSearch'))this.schedule(0);
                            return;
                        }
                        if(step.value?.uids&&(!job.best||(step.value.checkpointScore??0)>=(job.best.checkpointScore??0)))job.best=step.value;
                        if(step.value?.verification)job.verification=step.value.verification;
                        if(!job.strict&&job.best&&job.cpu+performance.now()-start>=job.limit){
                            job.result={...job.best,limited:true};
                            job.resume=advance;return;
                        }
                    }while(performance.now()<deadline);
                    const elapsed=performance.now()-start;
                    job.cpu+=elapsed;
                    if(elapsed>8){job.slice=3;job.limit=Math.min(job.limit,120);}
                    this.queueCompute(job,advance,job.strict&&job.best?Math.max(2,priority):priority);
                }catch(error){job.error=error;}
            };
            this.queueCompute(job,advance,priority);
            return null;
        }
        fitTeam(s,now,trackedRoamer) {
            if(this.strictPlanning&&!localRulesKnown()){
                this.teamValidationNote='当前游戏构建待核对，保留现有冒险队伍';
                if(this.teamSearch?.signature.startsWith('["adventure",'))this.cancelTeamSearch('teamSearch');
                return false;
            }
            if(this.target?.requiredParty?.length&&!ownedItems(s,this.target.gateItem)&&this.target.members.includes(s.adv.chapter))return false;
            if(s.adv.battle?.pick||this.driver.lastSwitchFoe&&s.adv.battle?.foes?.includes(this.driver.lastSwitchFoe))return false;
            const roam=trackedRoamer||this.settings.mode==='roam'||this.settings.mode==='legend'&&!this.settings.legendTier&&DATA.zones.some(zone=>zone.id===this.settings.legendId&&zone.eliteOnly);
            const c=CHAPTERS.get(s.adv.chapter);if(!c||this.settings.mode==='legend'&&!roam)return false;
            if(now<this.teamRetryAt&&(!this.teamRetryLoop||this.teamRetryLoop===String(c.loop))){
                this.teamValidationNote=`当前地图配队暂缓 · ${Math.ceil((this.teamRetryAt-now)/1000)} 秒后重试`;
                return false;
            }
            const frontier=this.settings.mode==='progress'&&CHAPTERS.get(s.adv.unlocked);
            if(frontier&&c.id!==frontier.id&&!(c.league&&frontier.league&&c.loop===frontier.loop))return false;
            // Navigation owns an explicit destination; avoid swapping for the old route.
            const pending=this.driver.pendingMap;
            if(pending?.options?.zone||pending&&!pending.row.members?.includes(c.id)||!frontier&&this.target&&!this.target.members?.includes(c.id))return false;
            if(Array.isArray(s.road)&&s.road.length>0&&(s.road.length!==s.team.length||s.road.some((uid,i)=>s.team[i]!==uid))){
                // Dispatch removes the member from the PC and planned team before
                // the native road state refreshes. A real pending swap still waits.
                if(s.adv.battle||partyMons(s,s.road).map(mon=>mon.uid).join('|')!==s.team.join('|'))return false;
            }
            const current={...c,key:String(c.loop),members:c.league?DATA.chapters.filter(member=>member.loop===c.loop).map(member=>member.id):[c.id]};
            const row=frontier?current:pending?.row||this.target||current;
            const mode=this.settings.mode;
            const objective=mode==='train'?'train':mode==='money'||mode==='dex'&&!dexStatus(s,this.settings).missing.length&&this.settings.afterDex==='money'?'money':
                ['item','shiny'].includes(mode)?'route':'progress';
            const roamId=trackedRoamer||(roam?roamingSettings(this.settings).roamId:undefined);
            const dexReplay=objective==='progress'&&isDexReplay(s,this.settings,c)?c:null;
            const reg=row.reg||c.reg;
            const key=String(row.key??c.loop)+(roamId?`:roam:${roamId}`:''),autoSwitch=s.autoSwitch!==false,last=this.teamCheck,deaths=totalDeaths(s,row);
            const members=row.members||[c.id];
            const pinned=adventureTeamPins(s,members,this.settings,this.trainProtected);
            const policy=adventureTeamPolicy(s,members,this.settings,pinned);
            const partyKey=s.team.join('|');
            const currentPartyIsLegal=()=>legalAdventureParty(s,s.team,reg,pinned);
            const farmKind=objective==='money'?'money':objective==='train'?'xp':null;
            const farmKey=farmKind&&this.farmPlanningKey(s,farmKind);
            if(farmKey&&last?.farmKey===farmKey&&last.key===key&&last.expectedParty===partyKey&&
                last.objective===objective&&!last.limited&&last.deaths===deaths&&currentPartyIsLegal())return false;
            const roster=adventureRosterFingerprint(s,reg),weatherKey=adventureTeamWeatherKey(s,members,now);
            const hazards=roamId?[]:routeRoamingFoes(s,row,now),hazardKey=JSON.stringify(hazards);
            const matches=last&&(last.party===partyKey&&(this.driver.teamTask||last.expectedParty===partyKey)||last.expectedParty===partyKey&&last.verification?.uids?.join('|')===partyKey);
            if(matches&&last.policy===policy&&last.key===key&&last.weatherKey===weatherKey&&last.hazardKey===hazardKey&&last.objective===objective&&last.dexReplay===!!dexReplay&&last.autoSwitch===autoSwitch&&(!last.limited||now-last.at<5000)&&
                last.roster===roster&&last.deaths===deaths){
                // Reuse a completed search whose inputs still match, including for underground dispatch.
                if(!last.limited&&now-last.at>=this.settings.teamMinutes*60000)last.at=now;
                return false;
            }
            const makeFoes=()=>roamId?battleContext(s,'map',{row,roamId}).foes:routeCombatFoes(s,row,now,hazards);
            const strict=!!this.strictPlanning;
            const reviewKey=JSON.stringify([this.runId,policy,key,row.reg||c.reg,objective]);
            if(strict&&this.adventureReview?.key!==reviewKey)this.adventureReview={key:reviewKey,expiresAt:performance.now()+60000};
            const context={reg,objective,dexReplay,now,verifyAll:strict,lowBudget:globalThis.navigator?.hardwareConcurrency<=4||globalThis.navigator?.deviceMemory<=4};
            let plan;
            if(s.mons.length===1&&s.team.length===1&&s.team[0]===s.mons[0].uid&&teamEligible(s,s.mons[0],context.reg)){
                plan={uids:s.team,changed:false,reason:'当前地区只有一个可选成员',gain:0,opponents:makeFoes().length};
            }else if(this.running){
                const signature=JSON.stringify(['adventure',this.localSnapshot.sourceEpoch,policy,key,members,!!dexReplay,reg,weatherKey,hazardKey,objective,autoSwitch,this.searchRosterRevision('teamSearch',roster),partyKey,strict,deaths]);
                const settings=this.settings;
                function* search(){return yield* adventureTeamSearch(s,settings,pinned,{...context,foes:makeFoes(),progressive:true},true);}
                plan=this.evaluateTeamSearch(signature,search(),'teamSearch',strict,this.adventureReview?.expiresAt);
            }else plan=planAdventureTeam(s,this.settings,pinned,{...context,foes:makeFoes()});
            if(plan?.timedOut){
                this.adventureReview=null;this.teamRetryAt=now+30000;this.teamRetryLoop=String(c.loop);
                if(!currentPartyIsLegal()){this.failTask('配队复核超时，当前无合规队伍');return true;}
                this.teamValidationNote='配队复核超时，暂用当前合法队伍';
                this.log(this.teamValidationNote);return false;
            }
            if(!plan){
                const verification=this.teamSearch?.verification;
                this.status='正在评估冒险队伍 · '+(row.name||c.name)+(verification?.total?' · 已复核 '+verification.checked+'/'+verification.total:'');
                this.teamValidationNote=verification?.total?'冒险配队复核 '+verification.checked+'/'+verification.total:'正在计算可用冒险队伍';
                if(!strict||!currentPartyIsLegal())return true;
                if(s.team.length>=6||s.adv.battle||s.adv.pending)return false;
                const party=partyMons(s),occupied=new Set(party.map(mon=>DATA.combat.singles[mon.id]||`${mon.id}:${+!!mon.shiny}`));
                // Allow an underfilled party to finish its pending fit before a new route takes control.
                return eligibleRoster(s,context.reg).some(mon=>!occupied.has(DATA.combat.singles[mon.id]||`${mon.id}:${+!!mon.shiny}`)&&!party.some(other=>teamApart(mon,other)));
            }
            this.adventureReview=null;
            this.teamValidationNote='';
            this.teamCheck={key,policy,farmKey,dexReplay:!!dexReplay,limited:!!plan.limited,chapter:c.id,members,weatherKey,hazardKey,objective,autoSwitch,roster,party:s.team.join('|'),expectedParty:(plan.changed?plan.uids:s.team).join('|'),at:now,deaths,mode:this.settings.mode,name:row.name||c.name,
                reason:[plan.changed||plan.limited||plan.retainedForHunt||plan.suggestion?plan.reason:'现队仍是本次复核的最优阵容',plan.backup].filter(Boolean).join(' · '),
                gain:plan.gain,opponents:plan.opponents,verification:plan.verification||plan.suggestion?.verification,suggestion:!!plan.suggestion};
            if(!plan.uids.length){this.stop('当前地区没有可出战的宝可梦，请先配置队伍');return true;}
            if(!plan.changed)return false;
            if(strict&&(!['verified','exhaustive'].includes(plan.verification?.status)||plan.verification.uids?.join('|')!==plan.uids.join('|'))){
                this.teamCheck=null;this.status='等待完整配队复核';return true;
            }
            const box=pokemonByUid(s),nameOf=uid=>MONS.get(box.get(uid)?.id)?.name||uid;
            const incoming=plan.uids.filter(uid=>!s.team.includes(uid)).map(nameOf);
            const outgoing=s.team.filter(uid=>!plan.uids.includes(uid)).map(nameOf);
            const changes=[incoming.length&&'上阵 '+incoming.join('、'),outgoing.length&&'换下 '+outgoing.join('、')].filter(Boolean);
            this.log([`配队评估 · ${plan.reason}`,...changes,plan.gain>0&&`综合评分 +${Math.round(plan.gain*100)}%`].filter(Boolean).join(' · '));
            this.telemetry.sample=null;this.status=`为${row.name||c.name}调整冒险队伍`;
            const farming=objective==='train'||objective==='money'?{
                mode,region:this.settings.region,side:s.link?.side,link:s.link?.to,switchEnabled:helperSwitchEnabled(s,this.settings),
                trainLevel:mode==='train'?this.settings.trainLevel:null,pins:pinned.join('|'),
            }:null;
            this.driver.teamTask={chapter:c.id,members,uids:plan.uids,started:now,attempts:0,fitBasis:{roster,weatherKey,hazardKey,autoSwitch,policy,farming,party:partyKey,frontier:s.adv.unlocked,roamId,epoch:this.runId,sourceEpoch:this.localSnapshot.sourceEpoch}};
            return true;
        }
        legend(s, now) {
            const goal = legendProgress(s, this.settings);
            if (!goal.zone) { this.stop('无法识别所选传说战'); return; }
            if(goal.done){this.completeTask('指定传说战目标已完成');return;}
            const open = new Set(['kanto', ...(s.travel?.to || []), currentRegion(s)]);
            if (!open.has(goal.zone.reg)) {
                if(goal.zone.gate&&this.settings.progress&&(this.canProgress(s)||this.settings.autoTravel)){this.progress(s,now);return;}
                this.waitForFarm('等待目标地区开放 · '+goal.zone.name+'，可开启主线推进与跨地区开局',now);return;
            }
            const gate=goal.zone.gate;
            if(gate&&!this.settings.legendTier){
                this.lockedLegend=goal.zone.id;
                const cfg={...this.settings,mode:'dex',region:'all',dexSpecies:[goal.zone.id],dexWeather:[],legends:true};
                const plan=legendRequirements(s,cfg.dexSpecies);
                if(plan&&!plan.zones.has(goal.zone.id)){
                    const rows=dexRanking(s,cfg,this.cooldowns,now);
                    if(!this.advanceRequirements(s,cfg,plan,rows,now)){
                        const row=rows[0];
                        if(this.target?.key===row.key&&row.members.includes(s.adv.chapter)){this.status=row.prepNote;this.driver.nav('adventure');}
                        else this.travel(row,now);
                    }
                    return;
                }
                this.lockedLegend=null;
            }
            const tier = this.settings.legendTier ? goal.nextTier : 0;
            if (goal.zone.eliteOnly && !tier) { this.roaming(s,now);return; }
            if (tier && !goal.captured) { this.stop('精英传说战需要先完成该传说的普通捕获'); return; }
            this.travel({ ...goal.zone, key: `Z${goal.zone.id}`, members: [], name: `${goal.zone.monName || MONS.get(goal.zone.id)?.name || goal.zone.name}${tier ? ` · 精英 ${tier} 阶` : ''}` }, now, { zone: true, tier, optimize: this.settings.optimizeRaid });
        }
        selectLegendTarget(s,now){
            const cfg=this.settings,regions=new Set(['kanto',currentRegion(s),...(s.travel?.to||[])]);
            const remaining=legendGoals(s,cfg).filter(goal=>!goal.done);
            if(!remaining.length){this.completeTask('所选传说战目标已全部完成');return false;}
            const eligible=remaining.filter(({zone,captured})=>regions.has(zone.reg)&&(!cfg.legendTier||captured)&&
                !(this.cooldowns['legend:'+zone.id]>now));
            const blocked=goal=>!cfg.roamAllowMasterBall&&roamingMasterBalls(s,goal.zone.id)>0;
            const unlockedRoamer=goal=>goal.roaming&&!cfg.legendTier&&roamingProgress(s,{...cfg,legendId:goal.zone.id},now).unlocked;
            const canAttempt=goal=>{
                if(cfg.legendTier||!goal.roaming)return true;
                if(blocked(goal))return false;
                const plan=roamingPlan(s,{...cfg,legendId:goal.zone.id},now);
                return plan.unlocked&&(plan.marked||plan.location);
            };
            const tracked=!cfg.legendTier&&bestRoamingPlan(s,cfg,eligible.filter(g=>g.roaming).map(g=>g.zone.id),now,this.target?.roamId);
            const first=eligible.find(canAttempt);
            const prefer=tracked&&(tracked.active||tracked.marked||first?.roaming);
            const goal=(prefer&&eligible.find(g=>g.zone.id===tracked.target.id))||first||eligible.find(g=>unlockedRoamer(g)&&!blocked(g));
            if(!goal){
                const reserved=eligible.find(g=>unlockedRoamer(g)&&blocked(g));
                this.status=reserved?roamingMasterBallWait(s,cfg,reserved.zone.id):'还有 '+remaining.length+' 个传说目标，等待地区、地图、普通捕获或游荡条件满足';
                this.lastProgress=now;return false;
            }
            if(goal.zone.id!==cfg.legendId){
                this.settings={...cfg,legendId:goal.zone.id};
                this.roamStarted=this.roamRestartAt=null;
                this.target=this.visit=null;
                this.log('切换传说目标 · '+(goal.zone.monName||goal.zone.name));
            }
            return true;
        }
        roaming(s,now,cfg=roamingSettings(this.settings),prerequisite=false,groupOptions={}){
            const plan=roamingPlan(s,cfg,now),d=this.driver;
            this.telemetry.sample=null;
            if(!plan.target){this.failTask('无法识别所选游荡宝可梦');return;}
            if(plan.done){if(!prerequisite)this.completeTask('指定游荡宝可梦已确认捕获');return;}
            if(!plan.unlocked){this.lastProgress=now;this.status=`等待${MONS.get(plan.target.id)?.name}游荡开放 · 需要${DATA.regions.find(region=>region.key===plan.group.reg)?.name}冠军及地区解锁`;return;}
            const wait=roamingMasterBallWait(s,cfg,plan.target.id);
            if(wait){this.lastProgress=now;this.status=wait;return;}
            if(cfg.roamMinutes>0&&this.roamStarted!=null&&now-this.roamStarted>=cfg.roamMinutes*60000){this.failTask('达到游荡目标在线搜寻时限，已停止助手规划');return;}
            if(s.adv.speed!==cfg.speed){if(d.nav('adventure'))d.click($(`#speed-btns [data-speed="${cfg.speed}"]`),'设置游荡捕获速度');return;}
            if(plan.active){this.roamStarted??=now;this.status=`游荡战斗 · ${plan.target.name} · 捕获后以存档确认完成`;d.nav('adventure');return;}
            if(!this.canStartRoute(s)&&!this.ordinaryBattleKey(s)){this.status=`追踪${plan.target.name} · 等待当前战斗或选择结束`;d.nav('adventure');return;}
            const options={roamId:plan.target.id,restart:plan.restart,...groupOptions};
            if(!prerequisite&&cfg.mode==='legend'&&cfg.legendIds?.length>1)options.roamIds=cfg.legendIds;
            if(plan.passed&&plan.row){
                const attempt=[plan.target.id,s.adv.chapter,s.adv.runs||0,s.legTries?.[plan.target.id]||0,plan.row.id].join('/');
                if(attempt!==this.lastRoamAttempt){
                    this.lastRoamAttempt=attempt;this.roamRestartAt=now;
                    this.travel(plan.row,now,{...options,roamSettled:true});return;
                }
                if(now-this.roamRestartAt<7000){d.nav('adventure');return;}
            }
            if(!plan.row){
                this.lastProgress=now;this.status=`等待${plan.target.name}的新游荡位置 · 仅在线生成遭遇`;
                if(!d.nav('map'))return;
                this.roamStarted??=now;
                const region=$(`#map-root .rg.open[data-rg="${plan.group.reg}"]`);
                // The game refreshes roaming positions on its own. Re-selecting
                // the active region redraws the whole map without changing the target.
                if(region&&!region.classList.contains('active'))d.click(region,'打开游荡目标所在地区');
                return;
            }
            const buffFamily=this.automation.buffUI?.family||this.automation.state.autoBuffTx?.family;
            if(buffFamily==='capture'){if(this.automation.autoBuff(s,now,'roamCapture'))return;}
            else if(this.automation.autoBuff(s,now,'roam')||this.automation.autoBuff(s,now,'roamCapture'))return;
            const context=battleContext(s,'map',{row:plan.row,roamId:plan.target.id});
            if(this.ensurePrepared(s,context,{row:routeDescriptor(plan.row),options},now))return;
            if(s.adv.chapter!==plan.row.id||!plan.marked&&!this.target?.members?.includes(plan.row.id)){
                this.travel(plan.row,now,options);return;
            }
            if(plan.marked&&this.target?.roamId!==plan.target.id)this.target=plan.row;
            this.roamStarted??=now;
            if(cfg.autoTeam&&this.fitTeam(s,now,plan.target.id))return;
            if(plan.restart&&now-(this.roamRestartAt||0)>=7000){this.roamRestartAt=now;this.travel(plan.row,now,options);return;}
            const remaining=plan.location?` · 驻留约 ${Math.max(1,Math.ceil((plan.location.until-now)/60000))} 分钟`:'';
            this.status=`追踪${plan.target.name} · ${plan.row.name}${plan.marked?' · 当前路线已生成目标遭遇':remaining}`;d.nav('adventure');
        }
        cancelRankingJob(kind){
            const job=this.rankingJobs.get(kind);
            if(job){this.cancelCompute(job);this.rankingJobs.delete(kind);}
        }
        cancelRouteRankings(preserveCompleted=false){
            for(const [kind,job] of this.rankingJobs){
                if(preserveCompleted&&job.rows&&job.epoch===this.runId)routeRankings.set(kind,{signature:job.signature,rows:job.rows,at:Date.now()});
                this.cancelRankingJob(kind);
            }
        }
        releaseRankingView(keep){
            for(const [kind,job] of this.rankingJobs){
                if(kind===keep||Array.isArray(keep)&&keep.includes(kind))continue;
                job.view=false;
                if(!job.task)this.cancelRankingJob(kind);
            }
        }
        farmPlanningKey(s,kind){
            const cfg=this.settings;
            return JSON.stringify([this.localSnapshot.sourceEpoch,cfg.mode,kind,cfg.region,cfg.speed,cfg.autoTeam,
                s.autoSwitch!==false,helperSwitchEnabled(s,cfg),s.link?.side,s.link?.to,
                kind==='xp'?[cfg.trainUid,cfg.trainUids,cfg.trainLevel,this.trainProtected]:[cfg.moneyTarget,cfg.stopMinutes]]);
        }
        farmingTeamHeld(s,now,check=this.teamCheck){
            const row=this.target,party=s.team.join('|');
            if(this.verifiedFarmHeld(s,now))return true;
            if(!check?.farmKey||check.limited||check.expectedParty!==party||!check.members?.includes(s.adv.chapter)||
                (row&&row.key!==check.key)||check.deaths!==totalDeaths(s,check))return false;
            const kind=check.objective==='train'?'xp':'money',reg=CHAPTERS.get(s.adv.chapter)?.reg;
            return check.farmKey===this.farmPlanningKey(s,kind)&&
                legalAdventureParty(s,s.team,reg,adventureTeamPins(s,check.members,this.settings,this.trainProtected));
        }
        verifiedFarmHeld(s,now){
            const visit=this.visit,row=this.target,plan=visit?.activeRoutePlan;
            return !!(plan&&row&&visit.activeFarmKey===this.farmPlanningKey(s,'money')&&this.routeReached(s,row)&&
                plan.party.join('|')===s.team.join('|')&&(!s.road?.length||s.road.join('|')===s.team.join('|'))&&
                visit.activeRouteDeaths===totalDeaths(s,row)&&this.routeRequestValid(s,{row,routePlan:plan},now,true,true));
        }
        heldFarm(s,kind,now){
            const held=this.visit?.farmPlan,row=this.target;
            if(!held||held.kind!==kind||!row||held.row.key!==row.key||!this.routeReached(s,row)||
                held.inputs!==this.farmPlanningKey(s,kind)||held.party!==s.team.join('|')||
                held.deaths!==totalDeaths(s,row)||!this.routeRequestValid(s,{row},now)||
                s.road?.length&&s.road.join('|')!==held.party||
                !legalAdventureParty(s,s.team,row.reg,adventureTeamPins(s,row.members,this.settings,this.trainProtected)))return null;
            return held;
        }
        rememberFarm(s,kind,row,rows,now){
            if(!this.visit||this.target?.key!==row.key||!this.routeReached(s,row)||
                this.settings.autoTeam&&this.strictPlanning&&!this.farmingTeamHeld(s,now)||
                s.road?.length&&s.road.join('|')!==s.team.join('|'))return;
            this.visit.farmPlan={kind,row,rows,inputs:this.farmPlanningKey(s,kind),party:s.team.join('|'),deaths:totalDeaths(s,row)};
        }
        updateHeldFarmSample(s,sample,now){
            const kind=this.settings.mode==='train'?'xp':'money',held=this.heldFarm(s,kind,now);
            if(!held)return;
            const amount=kind==='xp'?sample.xp:sample.net;
            if(!Number.isFinite(amount)||!(sample.seconds>0))return;
            const record=this.metrics[metricsKey(s,held.row,this.settings,now)+(kind==='xp'?trainingXpSuffix(trainingXpTargets(s,this.settings)):'')];
            const seconds=kind==='xp'?record?.xpSeconds:record?.seconds,net=kind==='xp'?record?.xp:record?.net;
            const rate=seconds>0&&Number.isFinite(net)?net/seconds*60:amount/sample.seconds*60;
            const runs=kind==='xp'?record?.xpRuns:record?.runs;
            held.row={...held.row,rate,actualRate:rate,measured:true,samples:runs??((held.row.samples||0)+1)};
            held.rows=held.rows.map(row=>row.key===held.row.key?held.row:row).sort(compareYieldRows);
        }
        rankedYieldRoutes(s,kind,cooldowns=this.cooldowns,now=Date.now(),view=false){
            const held=this.heldFarm(s,kind,now);
            if(held)return availableRankedRoutes(held.rows,cooldowns,now);
            const request=yieldRankingRequest(kind,s,this.settings,this.metrics,now,{separateMoney:true});
            const rows=this.evaluateRouteRanking(request,cooldowns,now,view);
            if(!rows?.length)return rows;
            const projections=request.projections?.(rows);
            if(!projections)return rows;
            const hints=this.evaluateRouteRanking({...projections,background:true},{},now,view);
            return request.withProjections(rows,hints);
        }
        evaluateRouteRanking(request,cooldowns,now,view=false){
            const kind=request.cacheSlot||request.kind;
            if(view&&!request.background)this.releaseRankingView(kind==='money'?['money','money/projections']:kind);
            const stored=routeRankings.get(kind),cached=stored?.signature===request.signature?stored:null;
            const available=job=>{
                const previous=request.projectionOnly?stored?.rows:cached?.rows;
                if(!job?.partial||!previous)return job?.partial||previous;
                return [...new Map([...previous,...job.partial].map(row=>[row.key,row])).values()];
            };
            let job=this.rankingJobs.get(kind);
            // A different preview must never restart the planner serving the active task.
            if(view&&job?.task&&job.signature!==request.signature){
                const ready=available();
                return ready?selectYieldRoutes(request,ready,cooldowns,now):null;
            }
            if(job&&job.signature!==request.signature){this.cancelRankingJob(kind);job=null;}
            if(cached||!request.needsSlices){
                if(job)this.cancelRankingJob(kind);
                return completeYieldRanking(request,cooldowns,now);
            }
            if(job){
                job.view||=view;
                job.task||=!view;
                if(job.error){this.cancelRankingJob(kind);throw job.error;}
                if(!job.rows){
                    const ready=available(job);
                    return ready?selectYieldRoutes(request,ready,cooldowns,now):null;
                }
                this.cancelRankingJob(kind);
                routeRankings.set(kind,{signature:request.signature,rows:job.rows,at:now});
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
                const deadline=performance.now()+4;
                try{
                    do{
                        const part=search.next();
                        if(part.done){job.rows=part.value;break;}
                        if(request.projectionOnly&&Array.isArray(part.value))job.partial=part.value;
                    }while(performance.now()<deadline);
                }catch(error){job.error=error;}
                if(!job.rows&&!job.error)this.queueCompute(job,advance,request.background?3:job.task?0:3);
                else{
                    if(job.task&&this.running&&!this.manual&&(this.timer!=null||this.activeTick)&&kind!=='money/projections')this.schedule(0);
                    if(job.view)this.notifyView(true);
                }
            };
            this.queueCompute(job,advance,request.background?3:job.task?0:3);
            const ready=available();
            return ready?selectYieldRoutes(request,ready,cooldowns,now):null;
        }
        farm(s, now, mode) {
            const rank=cooldowns=>mode==='item'?itemRanking(s,this.settings,this.metrics,cooldowns,now):this.rankedYieldRoutes(s,'xp',cooldowns,now);
            const held=mode==='train'&&this.heldFarm(s,'xp',now);
            const rows=held?.rows||rank(this.cooldowns);
            if(!rows){this.status='正在比较练级路线';this.lastProgress=now;return;}
            if (!rows.length) {
                const eligible=rank({});
                if (eligible.length) { this.waitForFarm('目标地图暂时退避，等待后重试',now); return; }
                if(mode==='item'){
                    const item=ITEMS.get(this.settings.itemId);
                    if(item?.eliteReward){this.stop(eliteItemHint(item));return;}
                    const daylight=item?.id==='gracidea'&&item.sources.find(source=>source.day);
                    if(daylight&&candidates(s,this.settings).some(row=>row.members.includes(daylight.ch))&&!s.adv.gifts?.[daylight.once]){
                        if(sourceAvailable(s,{...daylight,day:false},item.id,now)){this.waitForFarm('等待白天前往花苑花田领取葛拉西蒂亚花',now);return;}
                        this.stop('领取葛拉西蒂亚花需要陆上形态谢米在当前出战队伍中');return;
                    }
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
            const label = mode === 'item' ? `${ITEMS.get(this.settings.itemId)?.name} · 本次 ${Math.max(0, itemCounter(s, this.settings.itemId) - this.startItems)}/${this.settings.itemQuantity}` : `练级至 Lv.${this.settings.trainLevel}`;
            if(mode==='train'&&current&&current.members.includes(s.adv.chapter)&&this.visit){
                if(!held){
                    const next=rows[0],switchRoute=this.routeWorthSwitch(s,current,next,now,'xp');
                    if(safe&&switchRoute){
                        this.log(`选择练级路线：${current.name} → ${next.name} · ${Math.round(next.rate)} EXP/分钟`);
                        this.travel(next,now);return;
                    }
                    if(!switchRoute)this.rememberFarm(s,'xp',current,rows,now);
                }
                this.status=`${label} · ${current.name} · ${current.measured?'实测':'预计'} ${Math.round(current.rate)} EXP/分钟`;
                this.driver.nav('adventure');return;
            }
            if (mode==='item'&&current&&current.members.includes(s.adv.chapter)&&!this.routeWorthSwitch(s,current,rows[0],now,'item')) {
                this.status = `${label} · ${current.name}`; this.driver.nav('adventure'); return;
            }
            if (!this.canStartRoute(s)) {this.driver.nav('adventure');return;}
            this.travel(rows[0],now);
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
                if(!current.specialNodesOnly&&Number.isFinite(current.score)&&Number.isFinite(best.score)){
                    if(best.key===current.key)return null;
                    const completed=s.adv.runs>this.visit.runs;
                    const due=now-this.visit.started>=this.settings.rotateMinutes*60000;
                    return (completed||due)&&best.score>current.score*(due?1:1.08)?best:null;
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
            if (!b || a.pending || a.event || a.zone || a.tower || a.league || b.raid || b.roam || node?.static || node?.phenom || node?.roamer) return null;
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
            if(!shiny&&this.shinySettlement&&this.running){
                const wait=this.shinySettlement;
                wait.endedAt??=now;
                if(now-wait.endedAt<6000){
                    this.hiddenAt??=now;this.telemetry.sample=null;this.status='野生异色战斗已结束，等待捕获结算';return true;
                }
                this.shinySettlement=null;this.wildShinyProtected=null;
                this.log('野生异色结算缓冲已结束，继续原任务','info','异色保护',now);
            }
            const prerequisite=this.target?.gateRoute&&['dex','legend'].includes(this.settings.mode)&&
                wildEncounter(s,mon=>this.target.targets?.some(hit=>hit.id===mon.id));
            const encounter=shiny||seasonal||targetDexEncounter(s,this.settings)||prerequisite;
            if(!encounter){this.wildShinyProtected=null;this.shinySettlement=null;return false;}
            const label=shiny?'野生异色':seasonal?'季节图鉴目标':prerequisite?'前置图鉴目标':'图鉴目标',names=encounter.enemies.map(mon=>MONS.get(mon.id)?.name||mon.id).join('、');
            if(this.wildShinyProtected!==encounter.key){this.wildShinyProtected=encounter.key;this.log('优先完成'+label+'捕获：'+names);}
            if(shiny){
                // Count observed active time only. A sleeping browser cannot demonstrate a stuck encounter.
                const b=s.adv.battle,progress=JSON.stringify([b.steps,b.enemies?.map(mon=>mon.hp),s.adv.pending?.type]);
                let wait=this.shinySettlement;
                if(!wait||wait.key!==encounter.key)wait=this.shinySettlement={key:encounter.key,progress,at:now,ms:0,idle:0};
                wait.endedAt=null;
                const delta=Math.max(0,Math.min(6000,now-wait.at));wait.at=now;wait.ms+=delta;
                wait.idle=progress===wait.progress?wait.idle+delta:0;wait.progress=progress;
                if(wait.idle>=120000||wait.ms>=600000){
                    this.stop('异色遭遇仍未结算，已保留当前战斗，请检查后继续',{level:'warn'});return true;
                }
            }else this.shinySettlement=null;
            this.telemetry.sample=null;
            this.status='保护'+label+' · '+names+' · 捕获结算后继续原任务';
            // Helper UI transactions are suspended while the native capture runs;
            // their deadlines must not expire when control returns to the old task.
            this.hiddenAt??=now;this.driver.nav('adventure');return true;
        }
        travel(row, now, options = {}) {
            const s=this.read();if(!s?.adv||this.holdWildShiny(s,now))return;
            if(!options.zone&&this.strictPlanning&&!localRulesKnown()&&['money','train','dex','shiny','item'].includes(this.settings.mode)){
                this.status='当前游戏构建待核对，暂留原地图';this.lastProgress=now;return;
            }
            if(this.settings.mode==='dex'&&row.window)options={...options,dexWindow:true};
            if(!options.huntSeason&&(this.settings.mode==='dex'&&row.hasWild||this.settings.mode==='shiny'&&row.expected>0))options={...options,huntSeason:weatherSeason(now)};
            const routePlan=options.orderedRoutePlan?row.routePlan:null;
            if(!routePlan&&!options.zone&&!options.roamSettled&&this.ensurePrepared(s,battleContext(s,'map',{row,roamId:options.roamId}),{row:routeDescriptor(row),options},now))return;
            this.driver.pendingMap = { row, options, routePlan, started: now };
            this.telemetry.sample = null; this.status = `规划前往：${row.name}`;
        }
        routeReached(s,row){
            return !s.adv.event&&!s.adv.zone&&!s.adv.tower&&!s.adv.league&&CHAPTERS.get(s.adv.chapter)?.reg===row.reg&&
                row.members.includes(s.adv.chapter)&&(s.adv.loops||[]).length===1&&String(s.adv.loops[0])===row.key;
        }
        routeRequestValid(s,pending,now,arrived=false,finishingSwap=false){
            if(this.strictPlanning&&!localRulesKnown()&&['money','train','dex','shiny','item'].includes(this.settings.mode))return false;
            const {row,routePlan,options}=pending,mode=this.settings.mode,chapter=CHAPTERS.get(row.id);
            if(!chapter||row.reg!==chapter.reg||String(chapter.loop)!==row.key||!row.members?.includes(row.id)||
                !row.members.every(id=>{const c=CHAPTERS.get(id);return c?.reg===row.reg&&String(c.loop)===row.key;}))return false;
            if(this.cooldowns[row.key]>now)return false;
            const progress=new Set(['kanto',currentRegion(s),...(s.travel?.to||[]),s.link?.to]);
            if(!progress.has(row.reg)||!Number.isInteger(s.adv.unlocked)||s.adv.unlocked<row.id)return false;
            if(mode==='item'&&!itemRanking(s,this.settings,{},this.cooldowns,now).some(r=>routeIdentity(r)===routeIdentity(row)))return false;
            if(options?.dexWindow){
                const current=dexRanking(s,this.settings,this.cooldowns,now).find(r=>r.key===row.key);
                if(!current?.window&&!current?.marked)return false;
            }
            if(!routePlan)return true;
            if(this.strictPlanning&&(routePlan.sourceEpoch!==this.localSnapshot.sourceEpoch||routePlan.runId!==this.runId||!routePlan.verified))return false;
            return !!this.routePlanState(s,row,routePlan,now,arrived,finishingSwap);
        }
        routePlanState(s,row,routePlan,now,arrived=false,finishingSwap=false){
            const cfg=this.settings,side=s.link?(row.reg===s.link.to?'to':'from'):null;
            const state=side===(s.link?.side??null)?s:otherMoneyParty(s);
            if(!state||side!==routePlan.scope||routePlan.setting!==routePlanSettings(cfg)||routePlan.identity!==routeIdentity(row)||
                (!arrived&&side!==(s.link?.side??null)&&cfg.moneyTarget>0))return null;
            if(finishingSwap)return side===(s.link?.side??null)&&legalAdventureParty(state,routePlan.party,row.reg)?state:null;
            if(adventureRosterFingerprint(state,row.reg)!==routePlan.roster)return null;
            if((routePlan.threat||'')!==moneyRouteThreatKey(state,row,now))return null;
            if(!arrived&&(state.team.length!==routePlan.entryParty.length||!state.team.every((uid,i)=>uid===routePlan.entryParty[i])))return null;
            const party=partyMons(state,routePlan.party);
            return party.length===routePlan.party.length&&party.every(mon=>teamEligible(state,mon,row.reg))&&
                routeMetricKey({...state,team:routePlan.party},cfg,now)(row)===routePlan.key?state:null;
        }
        observeMapArrival(s,pending,now){
            const {row,arrival,options}=pending;
            this.lastProgress=now;
            if(!this.routeRequestValid(s,pending,now,!!this.routeReached(s,row)))arrival.invalidated=true;
            const loopReady=options?.restart?CHAPTERS.get(s.adv.chapter)?.reg===row.reg&&s.adv.chapter===row.id&&
                !s.adv.event&&!s.adv.zone&&!s.adv.tower&&!s.adv.league&&Number(s.adv.node)<Number(arrival.node):this.routeReached(s,row);
            if(loopReady&&arrival.side===(s.link?.side??null)&&this.driver.nav('adventure')){
                if(arrival.invalidated){
                    this.driver.pendingMap=null;this.telemetry.sample=null;this.target=null;this.visit=null;
                    this.status='已核对旧地图操作的回执，重新规划当前目标';
                }else this.confirmMapArrival(s,pending,now);
                return;
            }
            if(now-arrival.at>=15000){
                this.driver.pendingMap=null;this.telemetry.sample=null;this.target=null;this.visit=null;
                this.cooldowns[row.key]=now+60000;
                this.status=`未确认到达 · ${row.name} · 暂缓后重新规划`;
                this.log(this.status);return;
            }
            this.status=`等待游戏确认到达 · ${row.name}`;
        }
        observeZoneArrival(s,pending,now){
            const {row,arrival,options}=pending,zone=s.adv.zone;
            this.lastProgress=now;
            if(zone?.id===row.id&&(Number(zone.elite)||0)===(options.tier||0)&&(!options.riddle||zone.riddle)&&this.driver.nav('adventure')){
                this.driver.pendingMap=null;this.zoneId=row.id;this.zoneStarted=now;return false;
            }
            // The complete result can be saved before the first observation of
            // this activity. Require a new receipt for this ID and exact tier.
            if(!zone&&!s.adv.event&&!s.adv.tower&&!s.adv.league&&!options.riddle&&
                (options.tier?arrival.tier<options.tier&&Number(s.elite?.[row.id]?.t)===options.tier:arrival.caught===false&&captured(s,row.id))){
                this.driver.pendingMap=null;return false;
            }
            if(now-arrival.at>=15000){
                this.driver.pendingMap=null;this.failTask(`未确认传说战入口 · ${row.name} · 请检查游戏当前活动`);return true;
            }
            this.status=`等待游戏确认传说战 · ${row.name}`;return true;
        }
        confirmMapArrival(s,pending,now){
            const {row,routePlan,options}=pending;
            this.driver.pendingMap=null;this.target=row;
            if(this.teamRetryLoop&&this.teamRetryLoop!==row.key){
                this.teamRetryAt=0;this.teamRetryLoop=null;this.teamValidationNote='';
            }
            this.visit={started:now,deaths:totalDeaths(s,row),runs:s.adv.runs||0};
            if(routePlan)this.visit.routePlan={plan:routePlan,started:now,autoSwitch:s.autoSwitch!==false,link:s.link?.to,rows:pending.farmRows};
            this.telemetry.sample=null;
            if(options?.roamId){this.roamStarted??=now;if(options.restart)this.roamRestartAt=now;}
        }
        applyArrivalTeam(s,now){
            const pending=this.visit?.routePlan, row=this.target;
            if(!pending||!row)return false;
            const {plan}=pending;
            const task=this.driver.teamTask,finishingSwap=pending.applied||task?.routePlan===plan&&task.hasDragged;
            const same=uids=>plan.party.length===uids.length&&plan.party.every((uid,i)=>uid===uids[i]);
            if(!this.routeReached(s,row)||pending.autoSwitch!==(s.autoSwitch!==false)||pending.link!==s.link?.to||pending.applied&&!same(s.team||[])||
                !this.routeRequestValid(s,{row,routePlan:plan},now,true,finishingSwap)||now-pending.started>=120000||now<this.teamRetryAt){
                if(this.driver.teamTask?.routePlan===plan)this.driver.teamTask=null;
                delete this.visit.routePlan;this.telemetry.sample=null;return false;
            }
            if(!same(s.team||[])){
                if(s.adv.pending||s.adv.battle){
                    if(this.ordinaryBattleKey(s))this.moneyBoundaryUntil=now+2000;
                    this.status=`已到${row.name} · 等待当前遭遇或选择处理完毕`;
                    this.lastProgress=now;this.driver.nav('adventure');return true;
                }
                this.driver.teamTask??={chapter:s.adv.chapter,members:row.members,uids:plan.party,started:now,attempts:0,routePlan:plan,partySignature:s.team.join('|')};
                this.status=`已到${row.name} · 等待应用该地图的配队`;
                this.lastProgress=now;return true;
            }
            if(this.driver.teamTask?.routePlan===plan)return true;
            if(s.road?.length&&!same(s.road)){
                this.status=`已到${row.name} · 等待治疗点确认出战队伍`;
                this.lastProgress=now;this.driver.nav('adventure');return true;
            }
            this.visit.routePlan=null;
            if(this.routeRequestValid(s,{row,routePlan:plan},now,true)){
                this.visit.activeRoutePlan=plan;
                this.visit.activeRouteDeaths=totalDeaths(s,row);
                this.visit.activeFarmKey=this.farmPlanningKey(s,'money');
                const chosen={...row,rate:row.projectedMoneyRate??row.rate,measured:false,samples:0};
                this.rememberFarm(s,'money',chosen,pending.rows?.map(entry=>entry.key===row.key?chosen:entry)||[chosen],now);
            }
            this.visit.started=now;
            this.telemetry.sample=null;
            return false;
        }
        canProgress(s) {
            const next=CHAPTERS.get(s.adv.unlocked);if(!next)return false;
            if(next.reg===currentRegion(s))return true;
            // An explicit mainline task can return from farming to an already opened frontier.
            // Incidental progression retains its current-region boundary and native departures.
            return this.settings.mode==='progress'&&new Set(['kanto',...(s.travel?.to||[]),s.link?.to]).has(next.reg);
        }
        ensurePrepared(s,context,resume={},now=Date.now()){return this.holdWildShiny(s,now)||this.coach.ensure(s,context,resume,now);}
        trackDailyRaid(s,now){
            const daily=this.daily;
            if(!daily)return;
            const pending=daily.raidPending,event=s.adv.event;
            if(!daily.base.raids||daily.base.dailyRaidUntilCaught===false||daily.job){
                if(pending)delete daily.raidPending;
                return;
            }
            if(!pending&&!event?.raid)return;
            const today=parisDay(now);
            if(event?.raid&&event.id&&(event.date||today)===today){
                const reg=event.reg||currentRegion(s);
                if(pending?.date!==today||pending.reg!==reg||pending.boss!==event.id){
                    daily.raidPending={reg,date:today,boss:event.id};this.persist();
                }
            }else if(pending&&(pending.date!==today||raidCaptureRecorded(s,pending.reg,today,pending.boss)||
                s.raids?.reroll?.day===today&&s.raids.reroll.to&&s.raids.reroll.to!==pending.reg)){
                delete daily.raidPending;this.nextRaid=now;daily.checking=true;
                if(pending.date===today&&raidCaptureRecorded(s,pending.reg,today,pending.boss))
                    this.log('已确认今日异色团体战捕获 · '+(MONS.get(pending.boss)?.name||pending.boss));
                this.persist();
            }
        }
        waitForDailyRaid(s,now){
            const pending=this.daily?.raidPending;
            if(!pending||this.preparation||this.raidReturn)return false;
            this.lastProgress=now;
            if(!this.raidProbe){
                if(now<this.nextRaid){
                    this.status=(MONS.get(pending.boss)?.name||'每日异色团体战')+' · 捕获尚未确认，'+Math.ceil((this.nextRaid-now)/60000)+' 分钟内复查';
                    return true;
                }
                const blocked=this.raidEntryBlock(s);
                if(blocked){this.deferRaid(blocked,now,raidRetryAt(now,pending.date,30000));return true;}
                this.raidProbe=true;this.raidProbeStarted=now;
            }
            this.probeRaid(s,now);return true;
        }
        raidDailyStatus(s,now=Date.now()){
            // Once entered, historical shiny ownership, other regional clears and a
            // disabled card cannot settle this target while its capture save is pending.
            if(this.daily?.raidPending?.date===parisDay(now))return null;
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
        finishRaidReturn(now,s){
            const kind=this.settings.mode==='train'?'xp':'money';
            const returnToFarm=s?.adv&&this.heldFarm(s,kind,now);
            if(this.daily&&!this.daily.job&&this.daily.base.raids){
                const rest=this.raidDailyStatus(s,now);
                this.driver.raid=null;if(!returnToFarm)this.target=null;this.nextRaid=now;
                if(['adventure','raid'].includes(this.driver.navigation?.screen))this.driver.navigation=null;
                this.raidCheckNote=rest?.reason||'每日异色团体战尚未确认完成，重新检查今日可挑战目标';
                if(!rest)this.daily.checking=true;
                this.log(this.raidCheckNote);return;
            }
            if(this.settings.mode==='raid'){
                this.nextRaid=now;this.driver.raid=null;this.target=null;this.raidCheckNote='团体战已结束，检查下一地区';this.log(this.raidCheckNote);return;
            }
            this.log('团体战已结束，返回主任务');this.nextRaid=raidRetryAt(now,this.driver.raid.date);
            this.driver.raid=null;if(!returnToFarm)this.target=null;this.raidCheckNote='团体战已结束，继续原任务';
        }
        raidEntryBlock(s){
            if(!s.adv.badges?.includes('Maître'))return '尚未获得关都联盟冠军徽章';
            const tab=$('#tabs [data-screen="raid"]');
            if(tab?.classList.contains('locked')||tab?.classList.contains('hold'))return tab.dataset?.why||'游戏的团体战入口暂不可用';
            return null;
        }
        priorityRaid(s,now,knownStatus){
            const mode=this.settings.mode;
            if((!this.settings.raids&&mode!=='raid')||FLOW_MODES.has(mode)||mode==='roam'||
                (mode==='legend'&&(!this.daily||this.daily.job)))return false;
            const rest=knownStatus===undefined?this.raidDailyStatus(s,now):knownStatus;
            if(rest){
                this.raidBoundarySince=null;
                if(this.raidProbe||this.raidReturn)this.deferRaid(rest.reason,now,0);
                this.raidCheckNote=''; // The panel reads today's live evidence; a stale note must not survive midnight.
                return false;
            }
            if(this.raidProbe){this.probeRaid(s,now);return true;}
            if(now<this.nextRaid||this.driver.raid||this.raidReturn||this.raidPreparation)return false;
            const blocked=this.raidEntryBlock(s);
            if(blocked){
                this.raidBoundarySince=null;
                this.raidCheckNote=blocked;return false;
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
            const row = candidates(s, { ...this.settings, mode:'progress', region: 'current' }).find(r => r.members.includes(c.id)) || { ...c, key: String(c.loop), members: c.league?DATA.chapters.filter(member=>member.loop===c.loop).map(member=>member.id):[c.id] };
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
            this.moneyBoundaryUntil=0;
            const held=this.heldFarm(s,'money',now);
            if(held){
                if(!s.adv.battle&&!s.adv.pending&&this.automation.autoBuff(s,now,'money')){this.telemetry.sample=null;return;}
                this.status=`刷钱 · ${held.row.name} · ${held.row.measured?'实测':'预计'} ${Math.round(held.row.rate)} ₽/分钟`;
                this.driver.nav('adventure');return;
            }
            const rows=this.rankedYieldRoutes(s,'money',this.cooldowns,now);
            if(!rows){
                const chapter=CHAPTERS.get(s.adv.chapter);
                const onLoop=chapter&&(s.adv.loops||[]).some(key=>String(key)===String(chapter.loop));
                this.moneyRankingSince??=now;
                this.status=onLoop?`刷钱 · ${chapter.name} · 后台比较其他路线`:'正在比较刷钱路线';
                if(onLoop||s.adv.battle||s.adv.pending)this.driver.nav('adventure');
                else if(now-this.moneyRankingSince>=15000&&this.canStartRoute(s)){
                    const eligible=candidates(s,this.settings,true).find(row=>row.members.includes(s.adv.chapter)&&!(this.cooldowns[row.key]>now));
                    if(eligible){this.moneyRankingSince=now;this.travel(eligible,now);}
                }
                return;
            }
            this.moneyRankingSince=null;
            if (!rows.length) {
                if(this.rankedYieldRoutes(s,'money',{},now)?.length){this.waitForFarm('刷钱地图暂时退避，等待后重试',now);return;}
                const frontier = CHAPTERS.get(s.adv.unlocked);
                if (this.canProgress(s) && (this.cooldowns[String(frontier.loop)] || 0) <= now) this.progress(s, now);
                else this.status = '暂无可用地图，等待失败退避时间结束';
                return;
            }
            if(!s.adv.battle&&!s.adv.pending&&this.automation.autoBuff(s,now,'money')){this.telemetry.sample=null;return;}
            const live=rows.find(row=>this.routeReached(s,row));
            if(live&&live.key!==this.target?.key)this.confirmMapArrival(s,{row:live},now);
            const current=live||rows.find(row=>row.key===this.target?.key&&row.members.includes(s.adv.chapter));
            const rate=row=>this.settings.mode==='money'&&row.routePlan?.party?row.projectedMoneyRate:row.rate;
            const safer=rows.filter(row=>!row.battleFit?.roamingRisk);
            const shortlist=safer.length?safer:rows;
            const base=shortlist[0];
            let winner=shortlist.reduce((best,row)=>rate(row)>rate(best)?row:best);
            const ready=this.moneyReadyRoute;
            const readyRow=ready&&shortlist.find(row=>row.key===ready.key);
            const readyValid=readyRow&&ready.projectedMoneyRate>=readyRow.rate*1.08&&this.routeRequestValid(s,{row:readyRow,routePlan:ready.routePlan},now);
            if(!readyValid)this.moneyReadyRoute=null;
            const reviewing=this.moneyProofReview?.row;
            const stillAvailable=reviewing&&shortlist.find(row=>row.key===reviewing.key);
            if(readyValid)winner={...readyRow,routePlan:ready.routePlan,projectedMoneyRate:ready.projectedMoneyRate};
            else if(stillAvailable&&this.routePlanState(s,stillAvailable,reviewing.routePlan,now)){
                // A new measurement or a temporarily missing forecast cannot abandon a valid review.
                const routePlan={...reviewing.routePlan,minimumRate:stillAvailable.rate*1.08};
                winner={...stillAvailable,routePlan,projectedMoneyRate:reviewing.projectedMoneyRate};
            }else if(reviewing){
                this.cancelTeamSearch('moneyProofSearch');this.moneyProofReview=null;
            }
            let usePlan=this.settings.mode==='money'&&!!winner.routePlan;
            let next=usePlan?{...winner,rate:winner.projectedMoneyRate,measured:false,samples:0}:winner;
            const stays=row=>current&&current.members.includes(s.adv.chapter)&&!this.routeWorthSwitch(s,current,row,now,'money');
            const settle=candidate=>{
                // A newly adopted native loop has a short switch delay. Let the
                // first comparison finish deciding before locking that loop.
                if(candidate.key!==current.key&&this.visit&&now-this.visit.started<15000)return;
                if(!this.rankingJobs.has('money/projections')&&!this.moneyProofReview&&!(this.moneyProofRetry?.until>now))
                    this.rememberFarm(s,'money',current,rows,now);
            };
            if(stays(next)&&!reviewing){
                settle(next);
                const roadPending=s.road?.length&&s.road.join('|')!==s.team.join('|');
                this.status = roadPending?`刷钱 · ${current.name} · 等待治疗点应用新队伍`:
                    `刷钱 · ${current.name} · ${current.measured ? '实测' : '预计'} ${Math.round(current.rate)} ₽/分钟`;
                this.driver.nav('adventure'); return;
            }
            if(usePlan&&this.strictPlanning&&!readyValid){
                const reviewingName=winner.name;
                const confirmed=this.moneyRouteProof(s,winner,now);
                if(confirmed){this.moneyReadyRoute=winner=confirmed;next={...confirmed,rate:confirmed.projectedMoneyRate,measured:false,samples:0};}
                else{winner=next=base;usePlan=false;}
                if(stays(next)){
                    if(confirmed!==undefined)settle(next);
                    const verification=this.moneyProofSearch?.verification;
                    const detail=verification?.total?` · 第 ${verification.passes} 轮 ${verification.checked}/${verification.total} 只`:'';
                    this.status=confirmed===undefined?`刷钱 · ${current.name} · 复核${reviewingName}阵容${detail}`:`保留刷钱路线 · ${current.name}`;
                    this.driver.nav('adventure');return;
                }
            }
            if(stays(next)){settle(next);this.status=`保留刷钱路线 · ${current.name}`;this.driver.nav('adventure');return;}
            if (!this.canStartRoute(s)) {
                if(this.ordinaryBattleKey(s))this.moneyBoundaryUntil=now+2000;
                if(current?.battleFit?.roamingRisk&&!next.battleFit?.roamingRisk){
                    const foe=MONS.get(current.battleFit.roamingRisk.id)?.name||'游荡首领';
                    this.status=`${foe}风险较高 · 等待结算后前往${next.name}`;
                }else this.status=`已选${next.name} · 等待当前战斗或选项结算`;
                this.driver.nav('adventure');return;
            }
            this.travel(winner,now,usePlan?{orderedRoutePlan:true}:{});
            if(this.driver.pendingMap?.row.key===winner.key){
                if(usePlan)this.driver.pendingMap.farmRows=rows;
                this.moneyReadyRoute=null;
            }
        }
        moneyRouteProof(s,row,now){
            const base=row.routePlan,cfg=this.settings;
            const state=this.routePlanState(s,row,base,now);
            if(!state)return null;
            const threat=moneyRouteThreatKey(state,row,now);
            if((base.threat||'')!==threat)return null;
            const stamp=[this.localSnapshot.sourceEpoch,this.runId,base.identity,this.searchRosterRevision('moneyProofSearch',base.roster),base.key,base.setting,state.team,threat,totalDeaths(state,row)];
            const signature='map-proof:'+JSON.stringify(stamp);
            const profitable=verified=>verified?.projectedMoneyRate>=base.minimumRate?verified:null;
            if(this.routeProof?.signature===signature)return profitable(this.routeProof.row);
            if(this.moneyProofRetry?.signature===signature&&now<this.moneyProofRetry.until)return null;
            if(this.moneyProofReview?.signature!==signature)this.moneyProofReview={signature,row,started:now,expiresAt:performance.now()+120000};
            const sourceEpoch=this.localSnapshot.sourceEpoch,runId=this.runId;
            function* search(){
                const seeded={...state,team:base.party};
                const plan=yield* adventureTeamSearch(seeded,cfg,[],{row,reg:row.reg,objective:'money',now,force:true,verifyAll:true,lowBudget:true},true);
                if(!['verified','exhaustive'].includes(plan.verification?.status)||plan.verification.uids?.join('|')!==plan.uids.join('|'))return {row:null};
                const fit=yield* battleRouteFitSearch(state,row,partyMons(state,plan.uids),now,true,cfg,true);
                const projected=moneyRouteScore(state,row,null,fit,now,cfg.speed).rate;
                if(fit.roamingRisk||fit.minCoverage<.999)return {row:null};
                const routePlan={...base,party:plan.uids,key:routeMetricKey({...state,team:plan.uids},cfg,now)(row),sourceEpoch,runId,verified:true};
                return {row:{...row,routePlan,projectedMoneyRate:projected},verification:plan.verification};
            }
            const result=this.evaluateTeamSearch(signature,search(),'moneyProofSearch',true,this.moneyProofReview.expiresAt);
            if(!result)return undefined;
            const elapsed=Math.max(0,Math.round((now-this.moneyProofReview.started)/1000));
            this.moneyProofReview=null;
            if(result.timedOut){
                this.moneyProofRetry={signature,until:now+120000};
                this.log('路线专用阵容复核超时，继续按当前可用阵容刷钱');return null;
            }
            this.routeProof={signature,row:result.row};
            if(result.verification?.total)this.log(`${row.name}阵容复核完成 · ${result.verification.checked} 只 · ${elapsed} 秒`);
            return profitable(result.row);
        }
        routeWorthSwitch(s,current,next,now,kind){
            if(!next||next.key===current.key)return false;
            if(kind==='money'&&current.battleFit?.roamingRisk&&!next.battleFit?.roamingRisk)return next.rate>0;
            if(next.trainingSafe&&!current.trainingSafe&&kind==='xp')return true;
            if(!(next.rate>0))return false;
            if(kind!=='xp'&&this.visit&&now-this.visit.started<15000)return false;
            const dependable=row=>row.measured&&row.samples>=(kind==='xp'?3:2);
            const threshold=dependable(current)&&dependable(next)?.05:.08;
            const incumbent=kind==='money'&&current.measured&&current.samples<2&&Number.isFinite(current.estimatedReward)&&current.estimatedSeconds>0
                ?(current.rate+current.estimatedReward/current.estimatedSeconds*60)/2:current.rate;
            const time=this.settings.stopMinutes?Math.max(0,this.settings.stopMinutes*60-(now-this.started)/1000):600;
            const cost=8+(current.reg!==next.reg?12:0)+(next.routePlan?20:0);
            return next.rate*Math.max(0,time-cost)>Math.max(0,incumbent)*(1+threshold)*time;
        }
        waitForFarm(reason,now){
            this.farmWait={mode:this.settings.mode};this.lastProgress=now;this.status=reason;
        }
        pursueGateRoamer(s,cfg,plan,now){
            if(!cfg.legends||cfg.dexWeather?.length||!plan.roam.size)return false;
            const best=bestRoamingPlan(s,cfg,plan.roam,now,this.target?.roamId,[...plan.roamOwned]);
            if(!best)return false;
            const id=best.target.id;
            this.roaming(s,now,{...cfg,mode:'roam',roamId:id,roamRequireOwned:plan.roamOwned.has(id)},true,{roamGoals:plan.goals});
            return true;
        }
        advanceRequirements(s,cfg,plan,rows,now){
            const enabled=cfg.legends&&!cfg.dexWeather?.length,label=requirementLabel(plan)+'前置';
            const signature=JSON.stringify([plan.goals,[...plan.zones],this.settings.mode]);
            if(signature!==this.gateSignature){this.gateSignature=signature;this.legendProbe=null;this.nextLegend=0;}
            if(this.pursueGateRoamer(s,cfg,plan,now))return true;
            if(enabled&&plan.zones.size&&now>=this.nextLegend&&this.findLegend(s,{ids:plan.zones},now))return true;
            if(rows.length)return false;
            // Some native loot rolls require a particular member in the active road party.
            for(const itemId of plan.items){
                for(const src of ITEMS.get(itemId)?.sources||[]){
                    if(!src.team?.length||sourceAvailable(s,src,itemId,now)||!sourceAvailable(s,{...src,team:null},itemId,now))continue;
                    const row=candidates(s,cfg).find(r=>r.members.includes(src.ch)&&huntRouteMatches(s,cfg,r,now));
                    if(!row||(this.cooldowns[row.key]||0)>now)continue;
                    const uids=riddleParty(s,{team:src.team},row.reg,cfg.autoTeam);
                    if(!uids){
                        plan.notes.push('请将'+src.team.map(id=>MONS.get(id).name).join('、')+'加入'+row.name+'的可出战队伍');
                        continue;
                    }
                    if(!row.members.includes(s.adv.chapter)){
                        this.travel({...row,requiredParty:src.team,gateItem:itemId,gateRoute:true,targets:[]},now);return true;
                    }
                    if(uids.some(uid=>!s.team.includes(uid))&&!s.adv.battle&&!s.adv.pending&&now>=this.teamRetryAt)
                        this.driver.teamTask={uids:trainingParty(s,uids),members:row.members,chapter:s.adv.chapter,started:now,attempts:0};
                    this.status=label+' · 等待指定队员上场收集'+ITEMS.get(itemId).name;return true;
                }
            }
            for(const [id,tier] of plan.elites){
                if(!enabled||Number(s.elite?.[id]?.t||0)>=tier||!captured(s,id)||!gateOwnsMon(s,id)||
                    !s.adv.badges?.includes('Forêt')||(this.cooldowns['gateElite:'+id]||0)>now)continue;
                const zone=gateZones.get(id);
                if(!zone)continue;
                this.travel({...zone,key:'Z'+id,members:[]},now,{zone:true,tier:(s.elite?.[id]?.t||0)+1,gateElite:true,optimize:cfg.optimizeRaid});
                return true;
            }
            for(const [id,rule] of plan.doors){
                if(!enabled)break;
                const zone=gateZones.get(id),uids=riddleParty(s,rule,zone.reg,cfg.autoTeam);
                if(!uids){plan.notes.push(cfg.autoTeam?'铭文成员须在当前可出战的盒子或队伍中':'手动配队已开启，请先备好铭文队伍');continue;}
                if(uids.some(uid=>!s.team.includes(uid))){
                    if(!s.adv.battle&&!s.adv.pending&&now>=this.teamRetryAt)this.driver.teamTask={
                        uids:trainingParty(s,uids),members:[s.adv.chapter],chapter:s.adv.chapter,started:now,attempts:0
                    };
                    this.status=label+' · 准备'+zone.name+'的铭文队伍';return true;
                }
                this.travel({...zone,key:'Z'+id,members:[]},now,{zone:true,riddle:true,optimize:false});return true;
            }
            const trainee=gateTrainee(s,cfg,plan,now);
            if(trainee){
                const {mon,rule,gap}=trainee;
                this.status=label+' · '+MONS.get(mon.id).name+' Lv.'+mon.level+' → '+MONS.get(rule.to).name+' Lv.'+rule.level;
                if(gap&&!s.team.includes(mon.uid)&&cfg.autoTeam){
                    if(!s.adv.battle&&!s.adv.pending&&now>=this.teamRetryAt)this.driver.teamTask={
                        uids:trainingParty(s,[mon.uid]),members:[s.adv.chapter],chapter:s.adv.chapter,started:now,attempts:0
                    };
                }else if(gap&&!s.adv.battle&&!s.adv.pending){
                    const ceiling=Math.max(mon.level,...partyMons(s).map(m=>m.level));
                    const maps=candidates(s,{...cfg,region:'current'},true).filter(row=>!row.league&&row.reg===currentRegion(s)&&row.ace<=ceiling&&
                        huntRouteMatches(s,cfg,row,now)&&(this.cooldowns[row.key]||0)<=now).sort((a,b)=>b.ace-a.ace);
                    if(maps.length&&(this.target?.key!==maps[0].key||!maps[0].members.includes(s.adv.chapter))){
                        this.travel(maps[0],now);return true;
                    }
                }
                this.driver.nav('adventure');return true;
            }
            if(plan.progress&&cfg.progress&&(this.canProgress(s)||cfg.autoTravel)){this.progress(s,now);return true;}
            const names=ids=>[...ids].slice(0,4).map(id=>MONS.get(id)?.name||id).join('、');
            const details=[...plan.notes];
            const roamIds=[...plan.roam],availableRoam=roamIds.filter(id=>cfg.roamAllowMasterBall||roamingMasterBalls(s,id)===0);
            if(roamIds.length)details.push('等待游荡 · '+names(roamIds)+(availableRoam.length<roamIds.length?'（有目标受大师球保护限制）':''));
            if(plan.zones.size)details.push(enabled?'等待传说入口开放':'请检查传说战开关和天气筛选');
            if(plan.items.size)details.push('待取得 '+[...plan.items].map(id=>ITEMS.get(id)?.name||(id==='auroraticket'?'极光船票':id)).join('、'));
            if(plan.wild.size)details.push('待登记 '+names(plan.wild)+'，可在图鉴查看进化、赠送或交换条件');
            if(plan.elites.size)details.push('需要开放地下通道与对应精英阶级');
            if(plan.progress&&!cfg.progress)details.push('可开启无目标时推进主线');
            if(enabled){
                for(const id of availableRoam){
                    const sub={...cfg,mode:'roam',roamId:id,roamRequireOwned:plan.roamOwned.has(id)},state=roamingProgress(s,sub,now);
                    if(!state.done&&state.unlocked){this.roaming(s,now,sub,true,{roamGoals:plan.goals});return true;}
                }
            }
            this.waitForFarm(label+' · '+(details.join('；')||'等待游戏开放来源'),now);
            return true;
        }
        findLegend(s, status, now) {
            const open=new Set(['kanto',...(s.travel?.to||[]),currentRegion(s)]);
            const zones=DATA.zones.filter(z=>!z.eliteOnly&&status.ids.has(z.id)&&open.has(z.reg)&&(this.settings.mode==='legend'&&this.lockedLegend||huntRegionMatches(s,this.settings,z.reg))&&(this.cooldowns[`Z${z.id}`]||0)<=now);
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
                this.travel({...zone,key:`Z${id}`,members:[],name:MONS.get(id)?.name||zone.name},now,{zone:true,optimize:this.settings.optimizeRaid});return true;
            }
            if(++probe.index>=probe.regions.length)return finish();
            return true;
        }
    }


    const NURSERY_AUTOMATION_KEY=PREFIX+'nursery-auto:';
    const NURSERY_AUTOMATION_DEFAULTS={idleHatch:false,autoFeed:false,allowReferenceFeed:false};

    function nurseryFeedPlan(s,options={}){
        const p=s?.pension,build=options.build,parents=p?.mons;
        if(!p||Array.isArray(parents)&&parents.length<2)return {};
        const reserve=nurseryBerryReserve(p,build);
        if(reserve!==null&&reserve>=nurseryBerryCapacity(build))return {};
        const forecast=nurseryForecast(s,{build,limit:(reserve||0)+1,estimateUnverified:options.allowReferenceFeed===true});
        if(!build||!forecast.active){
            const pool=nurseryParentPool(s);
            if(pool.known&&(!pool.hasDitto||!pool.parents.length)||reserve>0)return {};
            return {hold:forecast.reason||'当前游戏的产蛋规则尚未识别'};
        }
        const next=forecast.nextUncoveredEgg;
        if(!next?.withBerryShiny||next.withoutBerryShiny)return {};
        const stock=Number(s.items?.[NURSERY_RULES.berry])||0;
        const target={key:nurseryHash(nurserySeed(s)).toString(16)+':'+next.k,k:next.k,id:next.eggId,
            stock,reference:!forecast.known,laid:forecast.counter,reserve};
        return {target};
    }
    function nextNurseryFeed(s,options){
        const target=nurseryFeedPlan(s,options).target;
        if(!target||target.stock<1)return null;
        const {key,k,id,stock,reference}=target;
        return {key,k,id,stock,reference};
    }
    function nurseryFeedWindow(p,now){
        if(!Array.isArray(p.eggs))return false;
        const eggs=p.eggs,capacity=Math.min(NURSERY_RULES.maxEggs,Math.max(1,eggs.length,Number(p.open?.eggs)||1));
        if(eggs.length>=capacity)return true;
        if(!Number.isFinite(p.tick)||p.tick<=0||p.tick-now>300000)return false;
        const goal=NURSERY_RULES.eggMs,savedGoal=Number(p.eggGoal??0),savedProgress=Number(p.egg??0);
        if(!Number.isFinite(savedGoal)||savedGoal<0||!Number.isFinite(savedProgress)||savedProgress<0)return false;
        const progress=savedProgress*(goal/(savedGoal||goal));
        return progress+Math.max(0,now-p.tick)<goal-2500;
    }

    class NurseryAssist {
        constructor(engine){
            this.e=engine;
            this.idleAutomation=new Automation(engine);
            this.prefs={...NURSERY_AUTOMATION_DEFAULTS};
            this.note='';
        }
        get enabled(){return this.prefs.idleHatch||this.prefs.autoFeed;}
        load(){
            this.key=NURSERY_AUTOMATION_KEY+this.e.account;
            this.cancelIdle();
            const previous=this.feedReceipt();
            this.feed=previous?.attempt&&!previous.confirmed?{...previous,screen:null}:null;
            this.uiRetry=null;
            this.note='';
            this.refresh();
        }
        feedReceipt(){
            const value=this.e.storage.getItem(this.key+':last-feed');
            if(!value)return null;
            if(!value.startsWith('{'))return {key:value,legacy:true};
            try{
                const r=JSON.parse(value);
                if(typeof r.key==='string'&&Number.isSafeInteger(r.k)&&r.k>=0&&Number.isFinite(r.at)&&
                    Number.isSafeInteger(r.attempt)&&r.attempt>=0)return r;
            }catch{}
            return null;
        }
        recordFeed(target,at,attempt,confirmed=false){
            const {key,k,id,stock,reference,laid,reserve,budgetScope,budgetFloor}=target;
            this.e.storage.setItem(this.key+':last-feed',JSON.stringify({key,k,id,stock,reference,laid,reserve,at,attempt,confirmed,budgetScope,budgetFloor}));
        }
        refresh(){
            let record;
            try{record=JSON.parse(this.e.storage.getItem(this.key)||'{}');}catch{}
            this.prefs=Object.fromEntries(Object.keys(NURSERY_AUTOMATION_DEFAULTS).map(key=>[key,record?.[key]===true]));
        }
        set(key,value){
            if(!this.key||!Object.hasOwn(NURSERY_AUTOMATION_DEFAULTS,key)||typeof value!=='boolean')throw new Error('请先进入游戏');
            const s=this.e.read();
            if(!s?.adv||accountId(s)!==this.e.account||!this.e.mayPersist())throw new Error('请在当前账号的游戏标签页修改');
            const prefs={...this.prefs,[key]:value};
            this.e.storage.setItem(this.key,JSON.stringify(prefs));
            this.prefs=prefs;
            this.note='';
        }
        cancelIdle(){
            if(this.idleAutomation.state.eggService)this.e.driver.navigation=null;
            this.idleAutomation.state={};
            this.idleAutomation.eggFX=null;
            this.idleAccess=false;
        }
        userInput(now=Date.now()){
            if(!this.enabled)return;
            this.manualUntil=now+15000;
            if(!this.e.running)this.cancelIdle();
        }
        blocked(){
            return this.e.inputHeld||this.e.gameInputFocused?.()||document.documentElement?.matches?.('html:active')||
                visible($('.title-fx'))||visible($('.sleep-fx'))||document.documentElement?.classList?.contains('sleeping');
        }
        activeScreen(){
            const screen=$('.screen.active[id^="screen-"]')?.id?.slice(7);
            return /^[a-z][\w-]{0,40}$/.test(screen||'')?screen:'adventure';
        }
        idleStep(now=Date.now()){
            const e=this.e;
            if(!this.key||e.running||!this.enabled&&!this.feed&&!this.idleAutomation.state.eggService)return;
            if(!e.ownsGameTab()){this.note='等待当前游戏标签页取得控制权';return;}
            const s=e.read(),a=s?.adv;
            if(!a||accountId(s)!==e.account||a.layout!==DATA.layout)return;
            if(this.priorityFeed(s,now,{idle:true}))return;
            if(e.suspended||e.checkpoint?.wanted&&e.settings.resumeOnReload||pageHidden()||now<this.manualUntil||
                this.blocked()||a.paused||backgroundActivityBlock(a,'eggs'))return;
            const service=this.idleAutomation.state.eggService;
            const due=this.prefs.idleHatch&&!service?readyBackgroundEggs(s,now):[];
            if(!service&&(!due.length||!this.idleAutomation.hatchChoices(s,due,now).eligible.length))return;
            if(!e.acquire(now))return;
            const {status,lastProgress,action}=e;
            this.idleAccess=true;
            try{
                if(this.idleAutomation.eggUI(s,now,true))return;
                if(visible($('#modal-root.open'))||visible($('#evt-pick'))||$$('.rc-fx,.lk-fx,.hatch-fx,.gift').some(visible))return;
                if(this.idleAutomation.serviceEggs(s,now,true,this.prefs.idleHatch))this.note=e.status;
            }finally{
                this.idleAccess=false;
                Object.assign(e,{status,lastProgress,action});
                e.release();
            }
        }
        feedScreen(screen,refresh=false){
            if(this.activeScreen()===screen&&!refresh)return true;
            const tab=$(`#tabs [data-screen="${screen}"]`);
            if(!tab||tab.disabled||tab.classList.contains('locked')||tab.classList.contains('hold'))return false;
            if(screen==='adventure'&&!visible(tab)&&enabled($('#side-chapter'))){$('#side-chapter').click();return false;}
            const group=tab.closest('.nav-grp'),header=group?.querySelector('.nav-grp-h');
            if(header?.getAttribute('aria-expanded')==='false'||tab.closest('[inert]')){
                if(enabled(header))header.click();
                return false;
            }
            if(enabled(tab)){tab.click();return refresh&&this.activeScreen()===screen;}
            return false;
        }
        renderedReserve(button,build){
            const tip=button.closest('.pension-berry-slot')?.querySelector('.pension-berry-tip p:last-child');
            const text=tip?.textContent?.normalize('NFKC')||'';
            const ratio=/(\d+)\s*\/\s*(\d+)/.exec(text);
            if(ratio&&+ratio[1]<=+ratio[2])return +ratio[1];
            // With no queued berries the native tip only names the maximum.
            const digits=text.match(/\d+/g);
            if(digits?.length===1&&Number(digits[0])===4)return 0;
            // Reviewed single-berry versions disable this button while one is pending.
            if(NURSERY_RULES.compatibleBuilds.includes(build)&&nurseryBerryCapacity(build)===1&&enabled(button))return 0;
            return null;
        }
        eggsMatchScreen(p,incubator){
            const rendered=incubator.querySelectorAll('.pen-egg[data-egg]'),eggs=p?.eggs;
            if(!Array.isArray(eggs)||rendered.length!==eggs.length)return false;
            const ids=new Set(eggs.map(egg=>String(egg.uid)));
            for(const row of rendered)if(!ids.delete(row.dataset.egg))return false;
            return !ids.size;
        }
        finishFeed(task,now){
            if(task.screen&&this.activeScreen()==='pension'&&task.screen!=='pension'){
                task.returnAt??=now;
                this.feedScreen(task.screen);
                if(this.activeScreen()==='pension'&&now-task.returnAt<3000)return;
            }
            this.feed=null;
            this.e.telemetry.sample=null;
        }
        waitForFeedUI(task,now,beforeHatch){
            // Let the normal task resolve blockers, e.g. a native wake or update dialog.
            // The per-egg guard still prevents opening a slot during the retry interval.
            if(now-task.started<3000)return true;
            this.uiRetry={key:task.key,at:now+1500};
            this.finishFeed(task,now);
            return beforeHatch&&!task.reserve;
        }
        priorityFeed(s,now=Date.now(),{idle=!this.e.running,beforeHatch=false}={}){
            const e=this.e;
            if(!this.key||!this.prefs.autoFeed&&!this.feed)return false;
            if(!s?.adv||accountId(s)!==e.account||s.adv.layout!==DATA.layout||!e.ownsGameTab()){
                this.note='等待当前游戏标签页取得控制权';
                return beforeHatch;
            }
            if(beforeHatch&&(e.state&&e.state!==s||e.raw!==e.storage.getItem(SAVE_KEY))){
                this.note='等待最新游戏存档，再核对喂果目标';
                return true;
            }
            const incubator=$('#screen-pension.active #pen-eggs');
            if(beforeHatch&&incubator&&!this.eggsMatchScreen(s.pension,incubator)){
                this.note='培育屋蛋位已变化，等游戏保存新蛋号再收蛋';
                return true;
            }
            const options={...nurseryRuntimeOptions(),allowReferenceFeed:this.prefs.allowReferenceFeed};
            const {target,hold}=this.prefs.autoFeed?nurseryFeedPlan(s,options):{};
            const task=this.feed;
            if(!task&&!target){
                if(hold)this.note='暂缓自动收蛋 · '+hold;
                else if(/^(暂缓自动收蛋|等待当前游戏标签页|等待最新游戏存档|目标蛋 #)/.test(this.note))this.note='';
                return beforeHatch&&!!hold;
            }
            if(!task&&target.stock<1){
                this.note=`目标蛋 #${target.k} 需要靛莓果，库存不足`+(target.reserve?'':' · 暂缓自动收蛋');
                return beforeHatch&&!target.reserve;
            }
            if(!task&&this.uiRetry?.key===target.key&&now<this.uiRetry.at)return beforeHatch&&!target.reserve;
            if(!e.acquire(now)){this.note='等待当前游戏标签页取得控制权';return beforeHatch;}
            try{
                if(!e.ownsGameTab()||e.raw!==e.storage.getItem(SAVE_KEY)){
                    this.note='等待最新游戏存档，再核对喂果目标';return beforeHatch||!!task;
                }
                if(task?.returnAt!=null){this.finishFeed(task,now);return !!this.feed||beforeHatch;}
                if(task?.at!=null){
                    const p=s.pension,laid=p?.laid??task.laid,reserve=nurseryBerryReserve(p,options.build);
                    const applied=laid<=task.k&&reserve!==null&&laid+reserve>task.k||p?.eggs?.some(egg=>egg.k===task.k&&egg.bx);
                    if(applied&&Number(s.items?.[NURSERY_RULES.berry]||0)<task.stock){
                        if(this.feedReceipt()?.key===task.key)this.recordFeed(task,task.at,task.attempt,true);
                        this.note=`已喂靛莓果 · 目标蛋 #${task.k}`+(task.reference?'（按旧规则预测）':'');
                        e.log(this.note);
                    }else if(now-task.at<15000){
                        this.note=`正在核对目标蛋 #${task.k} 的靛莓果扣除及储备`;
                        return true;
                    }else{
                        this.note=`蛋 #${task.k} 的喂果结果未获确认`;e.log(this.note);
                    }
                    this.finishFeed(task,now);
                    return true;
                }
                if(task&&(!target||task.key!==target.key||target.stock<1)){
                    this.finishFeed(task,now);
                    return true;
                }
                const key=this.key+':last-feed',previous=this.feedReceipt();
                const retry=previous?.key===target.key?previous:null;
                if(retry){
                    // v8.2.8 stored only the serial. Establish a baseline, then inspect
                    // it again after the same native save/confirmation interval.
                    if(retry.legacy){this.recordFeed(target,now,0);this.note=`正在核对目标蛋 #${target.k} 的旧喂果记录`;return beforeHatch&&!target.reserve;}
                    const retryDelay=Math.min(60000,15000*Math.max(1,retry.attempt));
                    if(retry.confirmed||target.stock!==retry.stock||target.laid!==retry.laid||target.reserve!==retry.reserve||
                        now-retry.at<retryDelay){
                        this.note=`目标蛋 #${target.k} 已有喂果记录，等待库存和储备确认`;
                        return beforeHatch&&!target.reserve;
                    }
                }
                const tx=this.feed??={...target,screen:this.activeScreen(),started:now};
                e.telemetry.sample=null;
                if(!this.feedScreen('pension')){
                    this.note=`正在打开培育屋，为目标蛋 #${target.k} 喂果`;
                    return this.activeScreen()==='pension'||this.waitForFeedUI(tx,now,beforeHatch);
                }
                if(retry&&!tx.refreshed){
                    // Re-entering the current tab rerenders the live inventory and
                    // reserve even if the game has not written another local save.
                    tx.refreshed=this.feedScreen('pension',true);
                    return tx.refreshed||this.waitForFeedUI(tx,now,beforeHatch);
                }
                const button=$('#screen-pension.active #pen-berries [data-myrte]');
                if(!enabled(button)){
                    const tab=$('#pen-tabs [data-pen-tab="res"]:not(.on)');
                    if(enabled(tab)){tab.click();return true;}
                    this.note='等待培育屋显示可用的靛莓果按钮';
                    return this.waitForFeedUI(tx,now,beforeHatch);
                }
                const stock=Number(button.querySelector('.bag-qty')?.textContent?.replace(/[^\d]/g,''));
                if(!incubator||!this.eggsMatchScreen(s.pension,incubator)||stock!==target.stock){
                    this.note=nurseryFeedWindow(s.pension,now)?'培育屋画面与存档尚未同步':'即将产蛋，正在核对游戏最新蛋位';
                    return this.waitForFeedUI(tx,now,beforeHatch);
                }
                if(retry&&this.renderedReserve(button,options.build)!==target.reserve){
                    this.note=`目标蛋 #${target.k} 的游戏储备数尚未核实，暂缓再次喂果`;
                    return this.waitForFeedUI(tx,now,beforeHatch);
                }
                let reservation;
                const attempt=(retry?.attempt||0)+1,priorRecord=e.storage.getItem(key);
                if(!idle){
                    target.budgetScope=e.automation.state.started??e.started??e.lease;
                    const reserved=retry?.budgetScope===target.budgetScope&&e.budget.used>=retry.budgetFloor;
                    target.budgetFloor=reserved?retry.budgetFloor:e.budget.used+1;
                }
                try{
                    this.recordFeed(target,now,attempt);
                    if(!idle&&e.budget.used<target.budgetFloor){
                        reservation=e.budget.charge(0,1);
                        if(e.persist()===false)throw new Error('当前任务用量无法保存');
                    }
                    if(!e.ownsGameTab()||e.raw!==e.storage.getItem(SAVE_KEY))throw new Error('游戏页面或存档已切换');
                }catch(error){
                    if(reservation)e.budget.cancelReservation(reservation);
                    try{
                        if(this.feedReceipt()?.key===target.key){
                            if(priorRecord===null)e.storage.removeItem(key);else e.storage.setItem(key,priorRecord);
                        }
                        if(reservation)e.persist();
                    }catch{} // The native click has not run. Storage may still be unavailable.
                    this.note='暂缓自动喂果 · '+error.message;
                    this.finishFeed(tx,now);return beforeHatch&&!target.reserve;
                }
                // Reserve the serial before calling the game's own button. Keep the
                // reservation if dispatch throws or the receipt arrives after a reload.
                Object.assign(tx,target,{at:now,attempt});e.driver.lastClick=now;
                this.note=`正在为目标蛋 #${target.k} 喂靛莓果`;
                try{button.click();}
                catch{this.note=`目标蛋 #${target.k} 的按钮未返回，正在核对存档`;e.log(this.note);}
                return true;
            }finally{
                if(idle&&!this.idleAccess)e.release();
            }
        }
    }

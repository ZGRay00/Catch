    const NURSERY_AUTOMATION_KEY=PREFIX+'nursery-auto:';
    const NURSERY_AUTOMATION_DEFAULTS={idleHatch:false,autoFeed:false};

    function nextNurseryFeed(s,options){
        const stock=Number(s?.items?.[NURSERY_RULES.berry])||0;
        if(stock<1||s?.pension?.bx||!NURSERY_RULES.compatibleBuilds.includes(options?.build))return null;
        const forecast=nurseryForecast(s,{build:options.build,limit:1});
        const next=forecast.nextEgg;
        if(!forecast.known||forecast.pendingBerry!==false||!next?.withBerryShiny||next.withoutBerryShiny)return null;
        return{key:nurseryHash(nurserySeed(s)).toString(16)+':'+next.k,k:next.k,id:next.eggId,stock};
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
            this.tab=this.e.storage.getItem('pokecatch-tab');
            this.cancelIdle();
            this.feed=null;
            this.retryFeedAt=0;
            this.note='';
            this.refresh();
        }
        refresh(){
            let record;
            try{record=JSON.parse(this.e.storage.getItem(this.key)||'{}');}catch{}
            this.prefs={idleHatch:record?.idleHatch===true,autoFeed:record?.autoFeed===true};
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
            if(this.idleAutomation.state.eggService||this.feed?.idle)this.e.driver.navigation=null;
            this.idleAutomation.state={};
            this.idleAutomation.eggFX=null;
            if(this.feed?.idle)this.feed=null;
            this.idleAccess=false;
        }
        userInput(now=Date.now()){
            if(!this.enabled)return;
            this.manualUntil=now+15000;
            if(!this.e.running)this.cancelIdle();
            else if(this.feed){this.feed=null;this.e.driver.navigation=null;}
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
            if(!this.key||e.running||e.suspended||e.checkpoint?.wanted&&e.settings.resumeOnReload||pageHidden()||now<this.manualUntil||
                !this.enabled&&!this.feed&&!this.idleAutomation.state.eggService)return;
            if(this.blocked())return;
            const tab=e.storage.getItem('pokecatch-tab');
            if(!tab||this.tab&&tab!==this.tab)return;
            this.tab??=tab;
            const s=e.read(),a=s?.adv;
            if(!a||accountId(s)!==e.account||a.layout!==DATA.layout||a.paused||a.pending||a.event||a.zone||a.tower||a.league)return;
            const pendingHatch=this.idleAutomation.state.eggService;
            const hatch=this.prefs.idleHatch&&(pendingHatch||readyBackgroundEggs(s,now).length);
            const feed=this.feed||this.prefs.autoFeed&&now>=this.retryFeedAt&&Number(s.items?.[NURSERY_RULES.berry])>0&&!s.pension?.bx;
            if(!hatch&&!feed&&!pendingHatch)return;
            if(!e.acquire(now))return;
            const {status,lastProgress,action}=e;
            this.idleAccess=true;
            try{
                if(this.idleAutomation.eggUI(s,now,true))return;
                if(visible($('#modal-root.open'))||visible($('#evt-pick'))||$$('.rc-fx,.lk-fx,.hatch-fx,.gift').some(visible))return;
                if(this.feedStep(s,now,true))return;
                if(this.idleAutomation.serviceEggs(s,now,true,this.prefs.idleHatch))this.note=e.status;
            }finally{
                this.idleAccess=false;
                Object.assign(e,{status,lastProgress,action});
                e.release();
            }
        }
        runningStep(s,now){
            const e=this.e;
            if(!this.key||!this.prefs.autoFeed&&!this.feed||e.manual||now<this.manualUntil||e.startActivityExit||
                e.automation.state.eggService&&!this.feed||this.blocked()||
                backgroundBlockReason(s,e,now,'eggs')&&!this.feed)return false;
            const a=s.adv;
            if(a.pending||a.event||a.zone||a.tower||a.league){
                if(this.feed){this.feed=null;e.driver.navigation=null;}
                return false;
            }
            return this.feedStep(s,now,false);
        }
        feedStep(s,now,idle){
            const e=this.e,d=e.driver,p=s.pension;
            let task=this.feed;
            if(task&&task.idle!==idle){this.feed=null;return false;}
            const current=()=>{
                if(!this.prefs.autoFeed||!(p?.mons?.length>=2)||p.bx||!(Number(s.items?.[NURSERY_RULES.berry])>0)||!nurseryFeedWindow(p,now))return null;
                return nextNurseryFeed(s,nurseryRuntimeOptions());
            };
            let next;
            if(!task){
                if(now<this.retryFeedAt)return false;
                next=current();
                if(!next)return false;
                const tab=$('#tabs [data-screen="pension"]');
                if(e.storage.getItem(this.key+':last-feed')===next.key||
                    !idle&&e.budget.check(s,0,1)||!tab||tab.classList.contains('locked')||tab.classList.contains('hold'))return false;
                if(e.raw!==e.storage.getItem(SAVE_KEY))return false;
                task=this.feed={...next,idle,started:now,screen:this.activeScreen()};
                e.telemetry.sample=null;
            }
            const spent=task.at!=null&&Number(s.items?.[NURSERY_RULES.berry]||0)<task.stock;
            const applied=p?.bx&&p.laid===task.k||p?.eggs?.some(egg=>egg.k===task.k&&egg.bx);
            if(task.at!=null&&!task.returning){
                if(spent&&applied){
                    this.note=`已喂靛莓果 · 目标蛋 #${task.k}`;e.log(this.note);task.returning=true;
                }else if(now-task.at<15000){
                    this.note='正在核对靛莓果扣除及目标蛋标记';return true;
                }else{
                    this.note=`蛋 #${task.k} 的喂果结果未获确认`;e.log(this.note);task.returning=true;
                }
            }
            if(now-task.started>45000){this.feed=null;d.navigation=null;this.retryFeedAt=now+60000;return false;}
            if(!task.returning){
                next??=current();
                if(!next||next.key!==task.key||next.id!==task.id||!idle&&e.budget.check(s,0,1))task.returning=true;
                else if(!d.nav('pension'))return true;
                else{
                    const button=$('#screen-pension.active #pen-berries [data-myrte]');
                    if(!enabled(button)){
                        const tab=$('#pen-tabs [data-pen-tab="res"]:not(.on)');
                        if(enabled(tab)){d.click(tab,'打开培育屋树果栏');return true;}
                        this.note='培育屋未显示可用的靛莓果按钮';
                        this.retryFeedAt=now+60000;task.returning=true;
                    }else if(now-d.lastClick>=700&&e.raw===e.storage.getItem(SAVE_KEY)){
                        // Rendering can reveal a newly laid egg before the save catches up.
                        const incubator=$('#screen-pension.active #pen-eggs');
                        const eggs=p.eggs||[];
                        const rendered=incubator?.querySelectorAll('.pen-egg[data-egg]');
                        if(rendered?.length!==eggs.length||[...rendered].some(el=>!eggs.some(egg=>String(egg.uid)===el.dataset.egg)))return true;
                        const stock=Number(button.querySelector('.bag-qty')?.textContent?.replace(/[^\d]/g,''));
                        if(stock!==next.stock)return true;
                        // Reserve both the target serial and any foreground budget before invoking the native click.
                        const key=this.key+':last-feed';
                        try{e.storage.setItem(key,task.key);}
                        catch{this.note='无法保存喂果记录，已跳过本次喂果';this.retryFeedAt=now+60000;task.returning=true;return true;}
                        task.stock=next.stock;task.at=now;
                        const clicked=idle?d.click(button,'给百变怪喂靛莓果'):e.automation.spentClick(button,s,0,1,'给百变怪喂靛莓果');
                        if(!clicked){delete task.at;e.storage.removeItem(key);task.returning=true;}
                        return true;
                    }else return true;
                }
            }
            if(task.screen!==this.activeScreen()&&!d.nav(task.screen))return true;
            this.feed=null;e.telemetry.sample=null;return true;
        }
    }

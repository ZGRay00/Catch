    function regionalStarter(reg) {
        const region=DATA.regions.find(region=>region.key===reg);
        return CHAPTERS.get(region?.start)?.gifts.find(gift=>gift.key===(reg==='kanto'?'starter':'starter-'+reg));
    }
    function pendingRegionalStarter(s) {
        const reg=currentRegion(s),chapter=CHAPTERS.get(s.adv.chapter);
        const starter=regionalStarter(reg);
        if(!starter||!chapter?.gifts.some(gift=>gift.key===starter.key)||s.adv.gifts?.[starter.key])return false;
        const event=s.adv.pending||s.adv.nodes?.[s.adv.node];
        return event?.type==='gift'&&event.gift?.key===starter.key;
    }
    function resourceButtons(card,id) {
        return [...card.querySelectorAll('.dc-candy,.item-actions .btn')].filter(el=>
            [...el.querySelectorAll('img')].some(img=>(img.getAttribute('src')||'').includes('/'+id+'.')));
    }
    function resourceRecipientBlock(s,mon,id) {
        if(!mon)return '道具使用对象不存在，请选择成员';
        if(s.link?.side==='from'&&monRegion(mon)===s.link.to)return '当前地区的背包不能供该成员使用，请切换至成员所在地区';
        if(DATA.automation.candies[id]||id==='rare-candy'){
            return mon.level>=trainingCap(s,mon)?'目标成员已达到当前等级上限':null;
        }
        if(id==='link-cable')return '连接绳进化需要在游戏内交换';
        if(!(EVOLUTION_DATA.rules[mon.id]||[]).some(rule=>rule.item===id))return '所选成员的当前形态无法使用此道具';
        if(mon.rank>0)return '已升阶成员无法使用进化道具';
        return null;
    }
    function resourcePreviewKey(s,mon,id,now) {
        return JSON.stringify([mon.uid,mon.id,id,s.adv.chapter,s.adv.unlocked,s.link?.side,phaseAt(s,now)]);
    }
    class Automation {
        get buddyTask(){return this.state.buddyTask||null;}
        set buddyTask(value){if(value)this.state.buddyTask=value;else delete this.state.buddyTask;}
        get buddyRetryAt(){return Number(this.state.buddyRetryAt)||0;}
        set buddyRetryAt(value){this.state.buddyRetryAt=Number(value)||0;}
        get buffRetry(){return this.state.buffRetry||={};}
        set buffRetry(value){this.state.buffRetry=value||{};}
        constructor(engine){this.e=engine;this.state={};this.owner=null;this.lastService=0;}
        begin(s){this.elitePlan=null;this.rankUI=null;this.resourcePreview=null;this.state={started:Date.now(),hatched:0,underDone:0,towerAttempts:0,resourcePurchased:0,resourceUsed:0,worldBase:Number(s.wb?.n)||0,worldCaught:s.wb?.caught||0,resourceIn:itemCounter(s,this.e.settings.resourceItem),resourceOut:Number(s.stats?.itemOut?.[this.e.settings.resourceItem])||0};this.owner=null;this.lastService=0;this.eggFX=null;this.evolutionFX=null;this.evolutionChoiceCache=null;this.buddyTask=null;this.buddyRetryAt=0;this.buffUI=null;this.buffRetry={};}
        wait(text,at){this.e.status=text;this.e.lastProgress=Date.now();this.e.nextWake=at||null;}
        fail(text){this.e.failTask(text);}
        done(text){this.e.completeTask(text);}
        spentClick(el,s,cost,uses,label){
            const e=this.e,d=e.driver;if(!enabled(el)||!e.running||e.manual||pageHidden()||Date.now()-d.lastClick<700)return false;
            if(!e.mayPersist())return false;
            const why=e.budget.check(s,cost,uses);if(why){this.fail(why);return false;}
            let reservation,saved;
            try{reservation=e.budget.charge(cost,uses);saved=e.persist();}
            catch(error){
                if(reservation)e.budget.cancelReservation(reservation);
                e.status='消费记录保存失败，未执行操作：'+error.message;e.log(e.status);
                return false;
            }
            if(saved===false){e.budget.cancelReservation(reservation);return false;}
            // false is the driver's guarantee that the native action was never invoked.
            // If dispatch throws or the game's receipt is delayed, keep the reservation.
            if(d.click(el,label)!==false)return true;
            e.budget.cancelReservation(reservation);
            e.persist();
            return false;
        }
        own(kind,selector,extra={}){this.owner={kind,selector,started:Date.now(),...extra};}
        snapshotOwner(){const o=this.owner;return o?{kind:o.kind,selector:o.selector,uid:o.uid,reg:o.reg,match:o.match?.source}:null;}
        restoreOwner(o){
            if(!o||!['mon','coachCandy','buddy','evolution','travel','receipt','gem','confirm'].includes(o.kind)||typeof o.selector!=='string')return;
            this.own(o.kind,o.selector,{uid:o.uid,reg:o.reg,reopen:['mon','coachCandy','buddy','evolution'].includes(o.kind),...o.kind==='confirm'?{match:new RegExp(o.match||'(?!)','i')}:{}});
        }
        dialog(s){
            const e=this.e,d=e.driver,o=this.owner,root=$('#modal-root.open');
            if(!o)return !!this.buddyTask&&!d.ownedDialog&&!visible(root)&&!visible($('#evt-pick'))&&this.autoBuddy(s,Date.now());
            const owned=root?.querySelector(o.selector);
            if(o.seen&&(!visible(owned)||o.node&&o.node!==owned)){this.buddyCardClosed(s,o);this.owner=null;return o.kind==='buddy';}
            if(Date.now()-o.started>120000){this.owner=null;if(visible(root)){this.fail('流程弹窗等待超时，请检查日志');return true;}return false;}
            if(visible(owned)){o.seen=true;o.node=owned;}
            if(o.kind==='mon'||o.kind==='coachCandy'||o.kind==='buddy'||o.kind==='evolution'){
                if(!visible(root)){this.buddyCardClosed(s,o);this.owner=null;return o.kind==='buddy';}
                const card=owned?.querySelector('.mon-card');if(!visible(owned)||!card)return false;
                // A restored checkpoint cannot prove which member the current UI card belongs to.
                // Close it without consuming anything, then reopen the saved UID through the PC.
                if(o.reopen){if(d.click(card.querySelector('.dc-x'),'重新核对道具使用对象')){this.buddyCardClosed(s,o);this.owner=null;}return true;}
                const handled=o.kind==='buddy'?this.buddyCard(s,card,o):o.kind==='evolution'?this.evolutionCard(s,card,o):o.kind==='coachCandy'?e.coach.candyCard(s,card):this.useFromCard(s,card);if(d.lastClick>o.started)o.started=d.lastClick;return handled;
            }
            const modal=owned;
            if(!visible(modal))return false;
            if(o.kind==='travel'){
                // The map's native departure control supplied the destination before this dialog opened.
                const starter=regionalStarter(o.reg);
                if(!e.settings.autoTravel||!starter||modal.classList.contains('mkc-modal')||this.departureArrived(s,o.reg)){
                    this.owner=null;return false;
                }
                const banner=modal.querySelector('.dp-starters');
                if(banner&&!this.departureBannerMatches(modal,starter)){this.owner=null;return false;}
                if(d.click(modal.querySelector('.modal-actions .primary'),'确认跨地区出发')){
                    this.state.departure={reg:o.reg,at:Date.now()};
                    this.owner=null;e.persist();
                }
                return true;
            }
            if(o.kind==='confirm'&&!o.match.test(modal.textContent)){this.wait('弹窗内容与当前动作不符，等待手动处理');return true;}
            if(o.kind==='gem'){
                const options=[...modal.querySelectorAll('.rk-gems .pl-opt')].filter(enabled);
                if(options.length&&!options.some(el=>el.classList.contains('on'))){if(d.click(options[0],'选择精英联盟奖励宝石'))o.started=Date.now();return true;}
            }
            const actions=[...modal.querySelectorAll('.modal-actions button')];
            const button=modal.querySelector(o.kind==='confirm'?'.modal-actions .danger,.modal-actions .gold,.modal-actions .primary':'.modal-actions .gold,.modal-actions .primary')||(o.kind==='confirm'&&actions.length===2?actions[1]:null);
            if(d.click(button,'确认流程结果'))this.owner=null;
            return true;
        }
        page(name){return this.e.driver.nav(name);}
        pcSearch(id,grid){
            const d=this.e.driver,other=$$('#pc-active [data-clear]').filter(enabled).find(el=>el.dataset.clear!=='q');
            if(other){d.click(other,'清除PC筛选');return null;}
            const search=$('#pc-search');if(search&&search.value!==String(id)){d.input(search,String(id),'查找目标宝可梦');return null;}
            return $$(grid+' [data-uid]').filter(visible);
        }
        step(s,now){
            this.e.lastProgress=now;
            this.e.nextWake=null;
            if((s.adv.tower||s.adv.league||s.adv.zone)&&s.adv.speed!==this.e.settings.speed){if(this.page('adventure'))this.e.driver.click($(`#speed-btns [data-speed="${this.e.settings.speed}"]`),'设置活动战斗速度');return;}
            if(this.state.waitUntil>now){this.wait(this.state.waitLabel||'等待游戏结算',this.state.waitUntil);return;}
            if(this.e.settings.mode==='breed')return this.breed(s,now);
            if(this.e.settings.mode==='underground')return this.underground(s,now);
            if(this.e.settings.mode==='tower')return this.tower(s,now);
            if(this.e.settings.mode==='candy')return this.candy(s,now);
            if(this.e.settings.mode==='elite')return this.elite(s,now);
            if(this.e.settings.mode==='world')return this.world(s,now);
            if(this.e.settings.mode==='resource')return this.resource(s,now);
        }
        evolutionUI(s,now){
            const task=this.state.evolution,d=this.e.driver;
            if(!task?.clickedAt||!this.e.running||this.e.manual||pageHidden()||this.owner)return false;
            const fx=$$('.lk-fx.lk-evo').find(visible);
            if(fx){
                if(this.evolutionFX&&this.evolutionFX.node!==fx){this.e.stop('进化动画发生变化，请确认后继续');return true;}
                this.evolutionFX??={node:fx,started:now};
                if(now-this.evolutionFX.started>120000){this.e.stop('进化动画长时间未结束，请检查游戏后继续');return true;}
                if(visible($('#modal-root.open'))||visible($('#evt-pick'))){
                    if(d.dismissInformation?.(s)||d.receipt())return true;
                    this.e.status='自动进化 · 等待前方弹窗处理完毕';return true;
                }
                d.click([...fx.querySelectorAll('.fx-skip:not([data-gone]),.rc-tap')].find(enabled),'继续本次免费进化动画',true);this.e.lastProgress=now;return true;
            }
            this.evolutionFX=null;
            const card=$('#modal-root.open .mon-card');
            if(visible(card)&&monIdFrom(card.querySelector('.dc-hero')||card)===task.toId){d.click(card.querySelector('.dc-x'),'关闭已完成的进化详情');return true;}
            return false;
        }
        evolution(s,now){
            const e=this.e,d=e.driver;let task=this.state.evolution;
            if(!e.running||e.manual||pageHidden())return false;
            if(!task){
                if(!e.settings.autoEvolve||['breed','resource'].includes(e.settings.mode)||this.state.evolutionRetryAt>now)return false;
                const cfg=e.settings;
                if(cfg.mode==='progress'&&e.progressReached(s)||cfg.mode==='money'&&cfg.moneyTarget&&s.money>=cfg.moneyTarget||
                    cfg.mode==='item'&&itemCounter(s,cfg.itemId)-e.startItems>=cfg.itemQuantity||cfg.mode==='shiny'&&!missingShinies(s,cfg).length||
                    cfg.mode==='dex'&&(cfg.afterDex==='stop'||e.queueRunning)&&!dexStatus(s,cfg).missing.length)return false;
                if(cfg.mode==='train'){const status=trainingStatus(s,cfg,e.trainProtected);if(status.complete||status.capped||status.missing)return false;}
                if(s.adv.paused||s.adv.battle||s.adv.pending||s.adv.event||s.adv.zone||s.adv.tower||s.adv.league||
                    e.raidProbe||e.raidReturn||d.pendingMap||d.teamTask||d.ownedDialog||this.owner||this.buddyTask||this.buffUI||
                    this.state.eggService||this.state.hatch||this.state.resourceTx||this.state.autoBuffTx||this.state.resourceBuffTx||
                    this.state.towerLaunch||this.state.candyLaunch||this.state.underLaunch||this.state.underCollect||this.state.candyRun&&!s.candy?.run||e.preparation?.candyTx||
                    visible($('#modal-root.open'))||visible($('#evt-pick'))||$$('.rc-fx,.lk-fx,.hatch-fx,.gift').some(visible))return false;
                const possible=(s.mons||[]).filter(mon=>!(mon.rank>=1)&&EVOLUTION_DATA.rules[mon.id]?.some(rule=>rule.level>0&&!rule.item&&rule.level<=mon.level));
                if(!possible.length)return false;
                const context=e.preparation?.context?rebuildPreparationContext(s,e.preparation.context):e.coach.adventure(s)?.context||battleContext(s,'map');
                const reg=context.reg||currentRegion(s),candidates=possible.filter(mon=>teamEligible(s,mon,reg));
                if(!candidates.length)return false;
                const preferred=[...(e.preparation?.targets||[]).map(mon=>mon.uid),...(s.team||[])];
                const byUid=new Map(candidates.map(mon=>[mon.uid,mon]));
                let choice;
                for(const uid of preferred){
                    const mon=byUid.get(uid),rule=mon&&levelEvolution(s,mon,{now});
                    if(rule){choice={mon,rule};break;}
                }
                const gateIds=cfg.mode==='dex'?cfg.dexSpecies.filter(id=>!captured(s,id)):cfg.mode==='legend'&&e.lockedLegend?[e.lockedLegend]:[];
                const gate=gateIds.length?legendRequirements(s,gateIds):null;
                if(gate?.wild.size){
                    const parents=gateAncestors(gate.wild);
                    const eligible=(cfg.mode==='legend'?cfg.optimizeRaid:cfg.autoTeam)?candidates:candidates.filter(m=>s.team.includes(m.uid));
                    for(const mon of eligible){
                        const rule=levelEvolution(s,mon,{now});
                        if(rule&&parents.has(mon.id)){choice={mon,rule};break;}
                    }
                }
                const specialSelection=FLOW_MODES.has(cfg.mode)||cfg.mode==='legend'||!['map','progress'].includes(context.kind);
                const manualSelection=specialSelection?!cfg.optimizeRaid:!cfg.autoTeam;
                if(!choice&&!manualSelection){
                    const foes=context.foes||chapterThreats(s),chapters=[...new Set(foes.map(foe=>foe.chapter??s.adv.chapter).concat(s.adv.chapter))];
                    const key=JSON.stringify([cfg.mode,context.key,foes,rosterFingerprint(s),s.mons.map(m=>[m.uid,m.rageMax!=null]),s.team,s.road,
                        s.adv.unlocked,s.adv.badges,s.travel?.to,s.autoSwitch!==false,phaseAt(s,now),lockedEvolutionItems(s),reserveEvolutionKey(s),adventureTeamWeatherKey(s,chapters,now)]);
                    if(this.evolutionChoiceCache?.key!==key){
                        const sliced=s.mons.length>=24,search=reserveEvolutionSearch(s,cfg,{...context,reg,foes},candidates,now,sliced);
                        const result=sliced?e.evaluateTeamSearch(key,search,'evolutionSearch'):search.next().value;
                        // A pending background calculation owns no game screen. The main task
                        // and higher-priority nursery/expedition actions can proceed normally.
                        if(!result)return false;
                        this.evolutionChoiceCache={key,uid:result.uid};
                    }
                    if(e.teamSearch&&!e.teamSearch.result&&!e.teamSearch.error)return false;
                    const mon=byUid.get(this.evolutionChoiceCache.uid),rule=mon&&levelEvolution(s,mon,{now});
                    if(rule)choice={mon,rule};
                }
                if(!choice)return false;
                const screen=$('.screen.active[id^="screen-"]')?.id?.slice(7)||'adventure';
                task=this.state.evolution={uid:choice.mon.uid,fromId:choice.mon.id,toId:choice.rule.to,at:now,started:now,stage:'open',returnScreen:/^[a-z][\w-]{0,40}$/.test(screen)?screen:'adventure'};
                e.telemetry.sample=null;e.log(`免费等级进化：${MONS.get(task.fromId)?.name} → ${MONS.get(task.toId)?.name}`);e.persist();
            }
            e.lastProgress=now;e.status=`自动免费进化 · ${MONS.get(task.fromId)?.name} → ${MONS.get(task.toId)?.name}`;
            const mon=(s.mons||[]).find(mon=>mon.uid===task.uid);
            const defer=reason=>{task.stage='return';this.state.evolutionRetryAt=now+60000;e.log('免费进化暂缓：'+reason);};
            if(task.stage==='confirm'){
                if(mon?.id===task.toId){task.stage='return';this.state.evolved=(this.state.evolved||0)+1;e.teamCheck=null;e.coach.checked=null;e.coach.planReview=null;e.coach.preparationReview=null;d.recent?.clear();this.evolutionChoiceCache=null;e.log('进化存档已确认，按真实新形态重新配队');e.persist();}
                else if(!mon||mon.id!==task.fromId)defer('个体或形态已变化，重新检查实际存档');
                else if(now-task.at>120000)defer('存档未确认，不重复点击进化');
                else return true;
            }
            if(task.stage==='open'){
                if(!mon||mon.id!==task.fromId||!e.settings.autoEvolve||levelEvolution(s,mon,{now})?.to!==task.toId)defer('当前已不满足唯一免费等级进化条件');
                else if(now-task.started>90000)defer('详情操作超时');
                else{
                    if(!d.nav('team'))return true;
                    task.searchBefore??=$('#pc-search')?.value||'';
                    let card=$$('#team-slots [data-uid],#team-mini.show [data-uid]').find(el=>el.dataset.uid===task.uid&&enabled(el));
                    if(!card){const cards=this.pcSearch(mon.id,'#pc-grid');if(!cards)return true;card=cards.find(el=>el.dataset.uid===task.uid);}
                    if(card&&d.click(card,'打开已核对UID的进化对象'))this.own('evolution','.mon-modal',{uid:task.uid});
                    return true;
                }
            }
            const card=$('#modal-root.open .mon-card');
            if(visible(card)){if([task.fromId,task.toId].includes(monIdFrom(card.querySelector('.dc-hero')||card)))d.click(card.querySelector('.dc-x'),'关闭本次进化详情');return true;}
            const search=$('#screen-team.active #pc-search');if(search&&task.searchBefore!==undefined&&search.value!==task.searchBefore){d.input(search,task.searchBefore,'恢复进化前的PC搜索');return true;}
            const tab=$(`#tabs [data-screen="${task.returnScreen}"]`),screen=tab&&!tab.classList.contains('locked')&&!tab.classList.contains('hold')?task.returnScreen:'adventure';
            if(!d.nav(screen))return true;
            const duration=Math.max(0,now-task.started),p=e.preparation;
            if(p){for(const key of ['phaseAt','lastGrowth','candyAt'])if(p[key]!=null)p[key]+=duration;if(p.roadWait)p.roadWait.at+=duration;p.lastTick=now;}
            delete this.state.evolution;this.evolutionFX=null;e.telemetry.sample=null;e.persist();return true;
        }
        evolutionCard(s,card,owner=this.owner){
            const task=this.state.evolution,now=Date.now(),d=this.e.driver,mon=(s.mons||[]).find(mon=>mon.uid===owner?.uid);
            const close=()=>{if(d.click(card.querySelector('.dc-x'),'关闭免费进化详情'))this.owner=null;return true;};
            if(!task||task.stage!=='open'||!mon||task.uid!==owner?.uid||mon.id!==task.fromId||!this.e.settings.autoEvolve)return close();
            const rule=levelEvolution(s,mon,{now}),buttons=[...card.querySelectorAll('.item-actions .evo-btn')].filter(enabled);
            if(rule?.to!==task.toId||monIdFrom(card.querySelector('.dc-hero')||card)!==task.fromId||buttons.length!==1){task.stage='return';this.state.evolutionRetryAt=now+60000;this.e.log('进化按钮或对象不符，保留手动操作');return close();}
            task.stage='confirm';task.at=now;task.clickedAt=now;this.e.persist();
            if(d.click(buttons[0],'执行唯一免费等级进化')){this.owner=null;this.evolutionFX=null;}
            else{task.stage='open';delete task.clickedAt;}
            this.e.persist();return true;
        }
        eggUI(s,now){
            // Hatch results belong to our native egg click, including duplicate-family XP
            // which has an animation but no dex receipt. Never wait for a nonexistent card.
            if(!this.e.running||this.e.manual||pageHidden())return false;
            const pending=this.state.eggService?.tx||this.state.hatch;
            if(this.owner||this.e.driver.ownedDialog||!(this.state.eggReceiptUntil>now||pending&&this.state.eggReceiptUntil||this.eggFX?.node?.isConnected))return false;
            const fx=$$('.lk-fx.lk-hatch,.hatch-fx:not(.gift)').find(visible),d=this.e.driver;
            if(fx){
                if(this.eggFX&&this.eggFX.node!==fx){this.e.stop('孵蛋界面发生变化，请确认后继续');return true;}
                this.eggFX??={node:fx,started:now};
                if(now-this.eggFX.started>120000){this.e.stop('孵蛋动画长时间未结束，请检查游戏后继续');return true;}
                if(visible($('#modal-root.open'))||visible($('#evt-pick'))){
                    if(d.dismissInformation?.(s)||d.receipt())return true;
                    this.e.status='自动收蛋 · 等待前方弹窗处理完毕';return true;
                }
                d.click([...fx.querySelectorAll('.fx-skip:not([data-gone]),.rc-tap,.hx-tap')].find(enabled),'领取孵蛋结果',true);this.e.lastProgress=now;return true;
            }
            if(this.eggFX)this.state.eggReceiptUntil=now+15000;
            this.eggFX=null;
            const card=$('#modal-root.open .modal.dexcard-modal');
            if(!visible(card)||card.querySelector('.mon-card'))return false;
            const actions=[...card.querySelectorAll('.modal-actions button')];
            if(actions.length!==1||!actions[0].matches('.gold,.primary'))return false;
            if(d.click(actions[0],'确认自动收蛋结果'))delete this.state.eggReceiptUntil;
            return true;
        }
        serviceEggs(s,now){
            const e=this.e,d=e.driver,eggs=s.pension?.eggs||[];let task=this.state.eggService;
            if(!e.running||e.manual||pageHidden())return false;
            if(!task){
                this.lastService=now;
                if(!e.settings.autoEggs||e.settings.mode==='breed'||this.state.eggRetryAt>now)return false;
                if(e.settings.autoTeam===false&&(s.team?.length||0)<6)return false;
                // Native ordinary adventure battles keep running on the daycare screen.
                // Hatching does not reset that battle; real choices and owned UI still wait.
                if(backgroundBlockReason(s,e,now,'eggs')||this.state.evolution||visible($('#modal-root.open'))||visible($('#evt-pick')))return false;
                if(!eggs.length)return false;
                if($$('.rc-fx,.lk-fx,.hatch-fx,.gift').some(visible))return false;
                // The native ready control wins over wall-clock estimates when already visible.
                if(!readyBackgroundEggs(s,now).length)return false;
                const tab=$('#tabs [data-screen="pension"]');if(!tab||tab.classList.contains('locked')||tab.classList.contains('hold'))return false;
                const screen=$('.screen.active[id^="screen-"]')?.id?.slice(7)||'adventure';
                task=this.state.eggService={started:now,returnScreen:/^[a-z][\w-]{0,40}$/.test(screen)?screen:'adventure'};
                e.telemetry.sample=null;e.log('成熟蛋已就绪，领取后继续原任务');e.persist();
            }
            e.lastProgress=now;e.status='自动收蛋 · 成熟后孵化领取，再继续原任务';
            const tx=task.tx;
            if(tx){
                if(!eggs.some(egg=>String(egg.uid)===String(tx.uid))){
                    if((s.stats?.hatched||0)>tx.before){this.state.autoHatched=(this.state.autoHatched||0)+1;e.log(`自动收蛋完成 · 本任务累计 ${this.state.autoHatched} 枚`);}
                    else if(now-tx.at<15000){e.status='自动收蛋 · 蛋已离开孵化器，等待孵化计数确认';return true;}
                    else e.log('蛋已不在孵化器，未确认孵化计数，继续原任务');
                    delete task.tx;e.persist();
                }else if(now-tx.at<15000){e.status='自动收蛋 · 等待游戏存档确认';return true;}
                else{task.returning=true;this.state.eggRetryAt=now+60000;delete task.tx;e.log('收蛋未获确认，暂缓一分钟后重试');}
            }
            if(now-task.started>90000){task.returning=true;this.state.eggRetryAt=now+60000;}
            const due=readyBackgroundEggs(s,now).length>0;
            if(!e.settings.autoEggs||!due||s.adv.pending||s.adv.event||s.adv.zone||s.adv.tower||s.adv.league||e.settings.autoTeam===false&&(s.team?.length||0)<6)task.returning=true;
            if(!task.returning){
                if(!this.page('pension'))return true;
                const buttons=$$('#pen-eggs .pen-egg.ready[data-egg]').filter(el=>enabled(el)&&eggs.some(egg=>String(egg.uid)===el.dataset.egg));
                if(buttons.length){
                    const rules=buttons.length>1?nurseryRuntimeOptions():null;
                    const ready=(rules&&buttons.find(el=>eggOutcome(s,eggs.find(egg=>String(egg.uid)===el.dataset.egg),rules).shiny===true))||buttons[0];
                    task.tx={uid:ready.dataset.egg,before:s.stats?.hatched||0,at:now};e.persist();
                    if(d.click(ready,'自动收蛋：孵化成熟的蛋')){this.eggFX=null;this.state.eggReceiptUntil=now+15000;}
                    else delete task.tx;
                    e.persist();return true;
                }
                const eggTab=$('#pen-tabs [data-pen-tab="egg"]');
                if(enabled(eggTab)&&!eggTab.classList.contains('on')){d.click(eggTab,'打开孵化器收蛋');return true;}
                if(eggs.length)this.state.eggRetryAt=now+60000;
                task.returning=true;
            }
            const tab=$(`#tabs [data-screen="${task.returnScreen}"]`),screen=!s.adv.pending&&tab&&!tab.classList.contains('locked')&&!tab.classList.contains('hold')?task.returnScreen:'adventure';
            if(!this.page(screen))return true;
            delete this.state.eggService;this.lastService=now;
            // Exclude this side service from map measurements and preparation UI deadlines.
            const duration=Math.max(0,now-task.started),p=e.preparation;
            if(p){for(const key of ['phaseAt','lastGrowth','candyAt'])if(p[key]!=null)p[key]+=duration;if(p.roadWait)p.roadWait.at+=duration;p.lastTick=now;}
            e.telemetry.sample=null;e.status='自动收蛋完成，继续原任务';e.persist();return true;
        }
        serviceUnderground(s,now){
            const e=this.e,d=e.driver;let task=e.services.underground;
            if(!e.running||e.manual||pageHidden())return false;
            if(!task){
                if(e.settings.mode==='underground'||e.services.retryAt.underground>now)return false;
                const status=undergroundStatus(s,now),tab=$('#tabs [data-screen="underground"]');
                const collect=e.settings.autoUnderCollect&&status.ready.length;
                if(backgroundBlockReason(s,e,now,collect?'':'underDispatch')||!collect&&undergroundDispatchReason(s,e,now,status))return false;
                if(collect&&e.settings.autoTeam===false&&(s.team?.length||0)<6)return false;
                if(!tab||tab.classList.contains('locked')||tab.classList.contains('hold'))return false;
                const screen=$('.screen.active[id^="screen-"]')?.id?.slice(7)||'adventure';
                task=e.services.underground={started:now,returnScreen:/^[a-z][\w-]{0,40}$/.test(screen)?screen:'adventure',...collect?{}:{action:'dispatch'}};
                e.telemetry.sample=null;e.log(collect?'地下队伍已归队，后台领取后继续原任务':'使用空闲成员安排地下探险，保留前台队伍');e.persist();
            }
            if(task.action==='dispatch')return this.dispatchUnderground(s,now,task);
            e.lastProgress=now;e.status='后台地下归队 · 领取确认后返回原任务';
            const tx=task.tx;
            if(tx){
                const exists=(s.under?.slots||[]).some(slot=>String(slot.id)===String(tx.id)),returned=tx.uids.every(uid=>(s.mons||[]).some(mon=>mon.uid===uid));
                if(!exists&&returned){
                    e.services.underClaimed++;delete task.tx;task.returning=true;e.log(`后台地下领取已确认 · 累计 ${e.services.underClaimed} 队`);e.persist();
                }else if(now-tx.at<15000){e.status='后台地下归队 · 等待原队员与奖励存档确认';return true;}
                else{delete task.tx;task.returning=true;e.services.retryAt.underground=now+60000;e.log('后台地下领取未获完整确认，暂缓一分钟后重新核对，期间不重复点击');e.persist();}
            }
            if(now-task.started>90000){task.returning=true;e.services.retryAt.underground=now+60000;}
            if(!e.settings.autoUnderCollect||s.adv.battle||s.adv.pending||s.adv.event||s.adv.zone||s.adv.tower||s.adv.league||e.settings.autoTeam===false&&(s.team?.length||0)<6)task.returning=true;
            if(!task.returning){
                if(!this.page('underground'))return true;
                const exp=$('#ug-root [data-ug-tab="exp"]:not(.on)');if(enabled(exp)){d.click(exp,'打开地下派遣归队页');return true;}
                const status=undergroundStatus(s,now),take=$$('#ug-root [data-ug-take]').find(el=>enabled(el)&&status.ready.includes(undergroundBay(s,el.dataset.ugTake)));
                if(take){
                    const job=undergroundBay(s,take.dataset.ugTake),uids=(job.mons||[]).map(mon=>mon.uid).filter(Boolean);
                    if(!job.id||!uids.length){task.returning=true;e.services.retryAt.underground=now+60000;e.log('后台归队记录无法核对，保留给手动或地下主任务处理');}
                    else{
                        task.tx={id:String(job.id),uids,at:now};e.persist();
                        if(d.click(take,'后台领取地下归队与奖励'))this.own('receipt','.ug-back');else delete task.tx;
                        e.persist();return true;
                    }
                }else if(status.ready.length&&now-task.started<15000){e.status='后台地下归队 · 等待原生领取按钮刷新';return true;}
                else{task.returning=true;if(status.ready.length)e.services.retryAt.underground=now+60000;}
            }
            const tab=$(`#tabs [data-screen="${task.returnScreen}"]`),screen=tab&&!tab.classList.contains('locked')&&!tab.classList.contains('hold')?task.returnScreen:'adventure';
            if(!this.page(screen))return true;
            const duration=Math.max(0,now-task.started),p=e.preparation;
            if(p){for(const key of ['phaseAt','lastGrowth','candyAt'])if(p[key]!=null)p[key]+=duration;if(p.roadWait)p.roadWait.at+=duration;p.lastTick=now;}
            e.services.underground=null;e.services.lastCompleted.underground=now;e.telemetry.sample=null;e.status='后台归队处理完成，继续原任务';e.persist();return true;
        }
        undergroundPlanKey(s,bay,floor,pool){
            return JSON.stringify([accountId(s),Number(bay),s.under?.next?.[bay],floor,this.e.settings.underGoal,
                s.adv.unlocked,s.adv.badges,rosterFingerprint({...s,mons:pool})]);
        }
        undergroundPlan(s,bay,floor,pool,now){
            const e=this.e,key=this.undergroundPlanKey(s,bay,floor,pool);
            if(this.lastUnderPlan?.key===key)return this.lastUnderPlan;
            const availability=()=>{
                const countLegend=mons=>mons.reduce((n,mon)=>n+Number(!!MONS.get(mon.id)?.legend),0);
                return `可派候选 ${pool.length} 只 · 盒中传说/幻之 ${countLegend(s.mons)} 只，可派 ${countLegend(pool)} 只`;
            };
            if(pool.length<=3){
                const unique=new Set(pool.map(m=>DATA.combat.singles[m.id]||m.id+':'+!!m.shiny));
                const legal=unique.size===pool.length&&!pool.some(m=>pool.some(other=>undergroundApart(m,other)));
                if(pool.length===3&&legal)e.log(`地下第 ${Number(bay)+1} 队 · ${availability()} · ${pool.map(m=>MONS.get(m.id).name).join('、')}`);
                return this.lastUnderPlan={key,uids:legal?pool.map(m=>m.uid):[]};
            }
            let search;
            if(e.teamSearch?.signature!==key){
                const context=undergroundTeamContext(s,e.settings,bay,floor,pool);
                context.progressive=true;context.now=now;
                search=adventureTeamSearch({...s,team:[],road:[]},e.settings,[],context,true);
            }
            const plan=e.evaluateTeamSearch(key,search);
            if(!plan){e.status='地下探险 · 正在比较'+(e.settings.underGoal==='money'?'金币时薪':'冲层续航');return null;}
            if(plan.uids.length===3){
                const byUid=new Map(pool.map(m=>[m.uid,m]));
                const names=plan.uids.map(uid=>MONS.get(byUid.get(uid)?.id)?.name||uid);
                e.log(`地下第 ${Number(bay)+1} 队 · 第 ${floor} 层 · ${e.settings.underGoal==='money'?'刷金币':'冲层'} · ${availability()} · ${names.join('、')}${plan.limited?'（限时推荐）':''}`);
            }
            return this.lastUnderPlan={key,uids:plan.uids};
        }
        dispatchUnderground(s,now,task){
            const e=this.e,d=e.driver,status=undergroundStatus(s,now);
            e.lastProgress=now;e.telemetry.sample=null;e.status='后台地下派遣 · 仅使用空闲成员';
            const launch=task.launch;
            if(launch){
                const job=status.slots.find(job=>!launch.ids.includes(String(job.id))&&Number(job.bay)===launch.bay&&launch.uids.every(uid=>(job.team||[]).includes(uid)||(job.mons||[]).some(mon=>mon.uid===uid)));
                if(job&&launch.uids.every(uid=>!(s.mons||[]).some(mon=>mon.uid===uid))){e.services.underDispatched++;delete task.launch;task.returning=true;e.log(`后台地下派遣已确认 · 从第 ${job.from||1} 层出发，继续原任务`);e.persist();}
                else if(now-launch.at<120000){e.status='后台地下派遣 · 等待原生准备与存档确认';return true;}
                else{
                    // A late async native launch must never be reissued after a timeout.
                    if(!d.nav('underground'))return true;
                    const retry=$(`#ug-root [data-ug-go="${launch.bay}"]`),stillHere=launch.uids.every(uid=>(s.mons||[]).some(mon=>mon.uid===uid));
                    if(!job&&stillHere&&enabled(retry)){
                        delete task.launch;e.log('原生派遣已恢复可操作且队员均在PC，清理未成功记录，暂缓后重试');
                    }else e.status='地下派遣尚未获确认；保留记录，继续核对原生结果';
                    task.returning=true;
                    e.services.retryAt.underground=now+60000;
                }
            }
            if(!launch&&(now-task.started>90000||e.settings.mode==='underground'||!e.settings.autoUnderDispatch||!undergroundBackgroundUnlocked(s)||s.adv.pending||s.adv.event||s.adv.zone||s.adv.tower||s.adv.league||mainGoalReached(s,e,now)||adventureDispatchWait(s,e,now)))task.returning=true;
            if(!task.returning){
                if(!d.nav('underground'))return true;
                const exp=$('#ug-root [data-ug-tab="exp"]:not(.on)');if(enabled(exp)){d.click(exp,'打开后台地下探险页');return true;}
                if(!status.left||status.slots.length>=status.capacity){task.returning=true;}
                else{
                    const controls=$$('#ug-root [data-ug-go]');
                    if(task.bay==null){
                        const free=controls.find(el=>!undergroundBay(s,Number(el.dataset.ugGo),status));
                        if(!free){e.services.retryAt.underground=now+60000;task.returning=true;}
                        else{task.bay=Number(free.dataset.ugGo);e.persist();}
                    }
                    if(task.bay!=null&&undergroundBay(s,task.bay,status))task.returning=true;
                    if(!task.returning){
                        const idle=undergroundIdleMembers(s,e,now);
                        const floor=this.selectUndergroundStart(task.bay,status);if(!floor)return true;
                        if(!task.uids?.length||task.planKey!==this.undergroundPlanKey(s,task.bay,floor,idle)){
                            const plan=this.undergroundPlan(s,task.bay,floor,idle,now);
                            if(!plan)return true;
                            task.uids=plan.uids;task.planKey=plan.key;task.teamReady=false;e.persist();
                        }
                        const allowed=new Set(idle.map(mon=>mon.uid));
                        if(task.uids.length!==DATA.automation.under.team||task.uids.some(uid=>!allowed.has(uid))){task.returning=true;e.services.retryAt.underground=now+60000;e.log('后台地下派遣暂缓：空闲成员不足或已被前台任务使用');}
                        else{
                            const configured=s.eventTeams?.[`under:${task.bay}`]||[],same=configured.length===task.uids.length&&configured.every((uid,i)=>uid===task.uids[i]);
                            if(!same){
                                const edit=$$('[data-ug-slot]').find(el=>Number(el.dataset.ugSlot?.split('.')[0])===task.bay&&enabled(el));
                                if(enabled(edit)&&d.click(edit,'为地下探险选择空闲队员')){task.editorOpen=true;d.ownedDialog={type:'backgroundUnderTeam',teamKey:`under:${task.bay}`,uids:[...task.uids],started:now};e.persist();}
                                return true;
                            }
                            const go=controls.find(el=>Number(el.dataset.ugGo)===task.bay);
                            if(enabled(go)){
                                // Re-read immediately before the irreversible native send.
                                const latest=e.read(),available=undergroundIdleMembers(latest,e,now),valid=new Set(available.map(mon=>mon.uid)),actual=latest.eventTeams?.[`under:${task.bay}`]||[];
                                const checked=undergroundStatus(latest,now);
                                if(!checked.left||undergroundBay(latest,task.bay,checked)||actual.length!==task.uids.length||actual.some((uid,i)=>uid!==task.uids[i]||!valid.has(uid))||task.planKey!==this.undergroundPlanKey(latest,task.bay,floor,available)||latest.adv.pending||latest.adv.event||latest.adv.zone||latest.adv.tower||latest.adv.league||adventureDispatchWait(latest,e,now)){task.returning=true;return true;}
                                task.launch={bay:task.bay,uids:[...task.uids],ids:status.slots.map(job=>String(job.id)),at:now};e.persist();
                                if(!d.click(go,`后台派遣地下空闲队伍 · 第 ${floor} 层出发`))delete task.launch;
                                e.persist();return true;
                            }
                            e.status='后台地下派遣 · 等待原生出发按钮就绪';return true;
                        }
                    }
                }
            }
            const tab=$(`#tabs [data-screen="${task.returnScreen}"]`),screen=!s.adv.pending&&tab&&!tab.classList.contains('locked')&&!tab.classList.contains('hold')?task.returnScreen:'adventure';
            if(!d.nav(screen))return true;
            if(task.launch){e.status='原生地下派遣确认超时，记录已保留；请检查后继续';e.failTask(e.status);return true;}
            const duration=Math.max(0,now-task.started),p=e.preparation;
            if(p){for(const key of ['phaseAt','lastGrowth','candyAt'])if(p[key]!=null)p[key]+=duration;if(p.roadWait)p.roadWait.at+=duration;p.lastTick=now;}
            e.services.underground=null;e.services.lastCompleted.underground=now;e.status='后台派遣处理完成，继续原任务';e.persist();return true;
        }
        breed(s,now){
            const e=this.e,cfg=e.settings,d=e.driver,p=s.pension||{},eggs=p.eggs||[];
            const slots=Math.max(1,Number(p.open?.slots)||0,p.mons?.length||0);
            const expansion=this.state.pensionPurchase;
            if(expansion){
                if(slots>expansion.slots&&purchasePaid(s,expansion)){
                    delete this.state.pensionPurchase;e.persist();
                }else{
                    if(now-expansion.at<10000)this.wait('等待游戏确认寄养位扩容和金币扣款');
                    else this.fail('寄养位扩容未确认，已暂停以避免重复扣款');
                    return;
                }
            }
            if(this.state.hatch&&eggs.some(x=>x.uid===this.state.hatch.uid)){
                this.state.hatch.at??=now;
                if(now-this.state.hatch.at<15000){this.wait('等待孵蛋存档确认');return;}
                this.state.hatch=null;this.state.hatchRetryAt=now+60000;this.wait('孵蛋尚未确认，一分钟后重试',this.state.hatchRetryAt);return;
            }
            if(this.state.hatch&&!eggs.some(x=>x.uid===this.state.hatch.uid)){
                const tx=this.state.hatch, count=s.stats?.hatched||0;
                if(count===tx.before){
                    if(tx.disappearedAt==null){tx.disappearedAt=now;e.persist();}
                    if(now-tx.disappearedAt<NURSERY_LEDGER_LIMITS.windowMs){
                        this.wait((tx.target?'目标蛋':'蛋')+'已离开孵化器，等待游戏写入孵化计数');return;
                    }
                    e.log('未收到游戏孵化计数，本枚蛋未计入任务');
                }
                if(count>tx.before&&tx.target)this.state.hatched=(this.state.hatched||0)+1;
                if(this.owner?.kind==='receipt'&&this.owner.selector==='.dexcard-modal'&&!visible($('#modal-root.open .dexcard-modal')))this.owner=null;
                this.state.hatch=null;e.persist();
            }
            if(cfg.breedShiny?shinyOwned(s,cfg.breedId):(this.state.hatched||0)>=cfg.breedGoal){this.done('繁殖孵蛋目标已完成');return;}
            if(this.state.hatchRetryAt>now){this.wait('等待孵蛋重试',this.state.hatchRetryAt);return;}
            const targetEggs=eggs.filter(egg=>egg.id===cfg.breedId);
            const outstanding=cfg.breedGoal-(this.state.hatched||0);
            const rules=cfg.breedShiny&&targetEggs.length?nurseryRuntimeOptions():null;
            const confirmedShiny=rules?targetEggs.filter(egg=>eggOutcome(s,egg,rules).shiny===true):[];
            const covered=cfg.breedShiny?confirmedShiny.length>0:targetEggs.length>=outstanding;
            const waitLabel=confirmedShiny.length?'已确认目标闪蛋，等待孵化':`等待已有目标蛋孵化 · ${targetEggs.length} 枚`;
            // No parent changes are needed to meet this target. A native ready
            // button on an already-visible daycare still takes precedence over our clock.
            if(covered&&eggs.every(egg=>Number.isFinite(egg.hatchAt)&&egg.hatchAt>now)&&!readyBackgroundEggs(s,now).length){
                this.wait(waitLabel,Math.min(...eggs.map(egg=>egg.hatchAt)));return;
            }
            if(!this.page('pension'))return;
            const readyButtons=$$('#pen-eggs .pen-egg.ready[data-egg]').filter(enabled);
            const buttonFor=egg=>readyButtons.find(el=>el.dataset.egg===String(egg.uid));
            const egg=confirmedShiny.find(buttonFor)||targetEggs.find(buttonFor)||eggs.find(buttonFor);
            if(egg){this.state.hatch={uid:egg.uid,before:s.stats?.hatched||0,target:egg.id===cfg.breedId,at:now};e.persist();if(d.click(buttonFor(egg),'孵化已成熟的蛋'))this.state.eggReceiptUntil=now+15000;else this.state.hatch=null;e.persist();return;}
            const eggTab=$('#pen-tabs [data-pen-tab="egg"]');
            if(eggs.some(x=>x.hatchAt<=now)&&enabled(eggTab)&&!eggTab.classList.contains('on')){d.click(eggTab,'打开孵化器');return;}
            const plan=pensionPlan(s,cfg.breedId,cfg.breedShiny);
            if(targetEggs.length&&(plan.missing||covered)){
                const next=Math.min(...eggs.map(egg=>Number(egg.hatchAt)||now+60000));
                this.wait(waitLabel,Math.max(now+1200,next));return;
            }
            if(plan.missing){
                const all=s.mons||[];
                const parent=plan.parents.length ? null : all.find(m=>breedableOffspring(s,m)===cfg.breedId);
                const ditto=plan.ditto ? null : all.find(m=>m.id===132);
                const remove=[parent?.uid,ditto?.uid].filter(uid=>s.team?.includes(uid));
                if(remove.length&&!cfg.autoTeam){this.wait('繁殖亲本在手动冒险队伍中，请先手动移出亲本后继续');return;}
                if(remove.length){const rest=s.team.filter(uid=>!remove.includes(uid)),bench=all.filter(m=>!remove.includes(m.uid)&&!rest.includes(m.uid)&&teamEligible(s,m)).sort((a,b)=>b.level-a.level);while(rest.length<Math.min(6,s.team.length)&&bench.length)rest.push(bench.shift().uid);
                    if(rest.length){d.teamTask={chapter:s.adv.chapter,members:[s.adv.chapter],uids:rest,started:now,attempts:0};this.wait('先将繁殖亲本移回PC');return;}}
                if([parent?.uid,ditto?.uid].some(uid=>uid&&s.road?.includes(uid)&&!s.team?.includes(uid))){this.wait('亲本已移出计划队伍，等待下个治疗点更新行进队伍');return;}
                this.fail(plan.missing);return;
            }
            const open=slots,desired=plan.desired.slice(0,Math.max(2,open));
            if(open<2){
                if(!cfg.pensionExpand){this.fail('繁殖需要至少两个寄养位；请解锁寄养位，或开启自动扩容并设置预算');return;}
                const blocked=e.budget.purchaseBlock();if(blocked){this.fail('寄养位扩容需要金币：'+blocked);return;}
                const tab=$('#pen-tabs [data-pen-tab="res"]');if(enabled(tab)&&!tab.classList.contains('on')){d.click(tab,'打开寄养位');return;}
                const buy=$('#pen-res .buy button');if(!visible(buy)){this.fail('当前寄养位尚未开放购买');return;}
                const cost=parsePrice(buy.textContent);
                if(!(cost>0)){this.fail('无法确认寄养位的金币价格');return;}
                if(!enabled(buy)){this.fail(e.budget.check(s,cost)||'游戏暂未开放该寄养位的购买按钮');return;}
                this.state.pensionPurchase={category:'pension',slots,cost,spendBefore:Number(s.stats?.spent?.pension)||0,walletBefore:s.money,at:now};
                if(!this.spentClick(buy,s,cost,0,'扩容寄养位')){delete this.state.pensionPurchase;e.persist();}
                return;
            }
            const missing=desired.find(m=>!plan.residents.some(r=>r.uid===m.uid));
            if(missing){
                const tab=$('#pen-tabs [data-pen-tab="res"]');if(enabled(tab)&&!tab.classList.contains('on')){d.click(tab,'打开寄养管理');return;}
                const cards=this.pcSearch(missing.id,'#pen-grid');if(!cards)return;const card=cards.find(el=>el.dataset.uid===missing.uid);
                if(!card){this.wait('等待亲本出现在寄养PC');return;}
                if(plan.residents.length>=open){const out=plan.residents.find(m=>!desired.some(x=>x.uid===m.uid));
                    if(!out){this.fail('寄养位不足，无法放入目标亲本');return;}
                    if(!card.classList.contains('picked')){d.click(card,'选择待寄养的亲本');return;}
                    d.click($$('#pen-res [data-uid]').find(el=>el.dataset.uid===out.uid),'替换非目标亲本');return;
                }
                d.click(card,missing.id===132?'寄养百变怪':'寄养目标亲本');return;
            }
            const unwanted=plan.residents.find(m=>m.id!==132&&breedableOffspring(s,m)!==cfg.breedId);
            if(unwanted){const el=$$('#pen-res [data-uid]').find(el=>el.dataset.uid===unwanted.uid);if(d.click(el,'取回不参与目标繁殖的成员'))this.own('confirm','.modal',{match:/(取回|取出|回到|返回|Récupérer|Retrieve|Return)/i});return;}
            const until=eggs.length?Math.min(...eggs.map(x=>x.hatchAt||now+60000)):now+60000;
            this.wait(`繁殖中 · 已孵化 ${this.state.hatched||0}/${cfg.breedShiny?'目标异色':cfg.breedGoal} · 孵化器 ${eggs.length} 枚`,until);
        }
        selectUndergroundStart(bay,status){
            const settings=this.e.settings,select=$(`#ug-root [data-ug-from="${bay}"]`);
            const expected=undergroundStartFloor(settings,status.startFloors);
            if(!select&&expected===1)return 1;
            const floor=select&&undergroundStartFloor(settings,[...select.options].filter(option=>!option.disabled).map(option=>Number(option.value)));
            if(!floor||(settings.underAutoStart===false&&floor<expected)||!enabled(select)){
                this.e.status='地下探险 · 等待游戏显示已开放的起始楼层';return 0;
            }
            if(+select.value===floor)return floor;
            select.value=String(floor);select.dispatchEvent(new Event('change',{bubbles:true}));
            this.e.status=`地下探险 · 已选择第 ${floor} 层，等待出发控件刷新`;return 0;
        }
        underground(s,now){
            const e=this.e,cfg=e.settings,d=e.driver;
            const status=undergroundStatus(s,now),launch=this.state.underLaunch,collect=this.state.underCollect;
            if(launch){
                const job=status.slots.find(slot=>!launch.ids.includes(String(slot.id))&&String(slot.bay)===String(launch.bay)&&(!launch.uids?.length||launch.uids.every(uid=>slot.team?.includes(uid)||slot.mons?.some(mon=>mon.uid===uid))));
                if(job){delete this.state.underLaunch;e.log(`地下通道第 ${Number(launch.bay)+1} 队派遣已确认 · 从第 ${job.from||1} 层出发`);e.persist();}
                else if(now-launch.at<120000){this.wait('等待地下通道派遣准备与存档确认',now+2000);return;}
                else{this.fail('地下通道派遣未获存档确认，已暂停以免重复派遣；请检查游戏后继续');return;}
            }
            if(collect){
                const exists=status.slots.some(slot=>String(slot.id)===String(collect.id)),returned=Array.isArray(collect.uids)&&collect.uids.length&&collect.uids.every(uid=>(s.mons||[]).some(mon=>mon.uid===uid));
                if(!exists&&returned){this.state.underDone=(this.state.underDone||0)+1;delete this.state.underCollect;delete this.state.collectId;e.persist();}
                else if(now-collect.at<15000){this.wait('等待地下通道队员归队与奖励存档确认',now+1500);return;}
                else{this.fail('地下通道领取未获完整存档确认，已暂停以免误计或重复领取');return;}
            }
            if(this.state.collectId){delete this.state.collectId;e.log('已清理旧版地下领取标记；仅确认队员归队后累计本次领取');e.persist();}
            const completed=this.state.underDone||0,running=status.running.length;
            const untilReturn=Math.min(status.nextReturn,status.nextReset);
            if(completed<cfg.underRuns&&!status.ready.length){
                if(running+completed>=cfg.underRuns||running>=status.capacity){this.wait(`地下通道等待归队 · 已领取 ${completed}/${cfg.underRuns}`,status.nextReturn);return;}
                if(!status.left){this.wait(`今日地下派遣次数已用完 · ${status.sent}/${status.perDay}，等待巴黎时间次日`,running?untilReturn:status.nextReset);return;}
            }
            if(!this.page('underground'))return;
            if(completed>=cfg.underRuns){
                if(cfg.underOpenGeodes&&this.openGeodes(s))return;
                this.done('地下通道派遣与领取目标已完成');return;
            }
            const exp=$('#ug-root [data-ug-tab="exp"]:not(.on)');if(enabled(exp)){d.click(exp,'打开地下通道派遣');return;}
            const take=$$('#ug-root [data-ug-take]').find(el=>enabled(el)&&status.ready.includes(undergroundBay(s,el.dataset.ugTake)));
            if(take){
                const job=undergroundBay(s,take.dataset.ugTake),uids=(job.mons||[]).map(mon=>mon.uid).filter(Boolean);
                if(!job.id||!uids.length){this.fail('无法核对地下通道归队队员，请手动领取后重新开始');return;}
                if(d.click(take,'领取地下通道归队与奖励')){this.state.underCollect={id:String(job.id),uids,at:now};this.own('receipt','.ug-back');e.persist();}return;
            }
            if(status.ready.length){this.wait('地下通道已归队，等待领取按钮刷新',now+2000);return;}
            const ownedFx=$('.gd-fx .gd-ok:not([hidden])')||$('.gd-fx .gd-skip');if(enabled(ownedFx)){d.click(ownedFx,'完成晶洞奖励动画');return;}
            if(cfg.optimizeRaid&&undergroundMembers(s,now).length<DATA.automation.under.team){this.wait('可派遣队员不足，等待归队或巴黎时间次日恢复',running?untilReturn:status.nextReset);return;}
            const controls=$$('#ug-root [data-ug-go]');
            for(const go of controls){
                const slot=Number(go.dataset.ugGo),teamKey='under:'+slot;
                if(undergroundBay(s,slot,status)||!cfg.optimizeRaid&&!enabled(go))continue;
                const floor=this.selectUndergroundStart(slot,status);if(!floor)return;
                const configured=s.eventTeams?.[teamKey]||[];
                let plan;
                if(cfg.optimizeRaid){
                    plan=this.undergroundPlan(s,slot,floor,undergroundBayMembers(s,slot,now),now);
                    if(!plan)return;
                    if(plan.uids.length!==DATA.automation.under.team)continue;
                    if(configured.length!==plan.uids.length||configured.some((uid,i)=>uid!==plan.uids[i])){
                        const edit=$$('[data-ug-slot]').find(el=>Number(el.dataset.ugSlot?.split('.')[0])===slot&&enabled(el));
                        if(d.click(edit,'按地下主题和出发层配置队伍')){
                            d.ownedDialog={type:'underTeam',key:plan.key,teamKey,bay:slot,floor,uids:plan.uids,started:now};
                        }
                        return;
                    }
                }
                if(!enabled(go))continue;
                if(configured.length===DATA.automation.under.team&&e.ensurePrepared(s,battleContext(s,'under',{slot,floor}),{},now))return;
                if(plan){
                    const latest=e.read(),live=latest?.eventTeams?.[teamKey]||[];
                    if(!latest||!undergroundStatus(latest,now).left||undergroundBay(latest,slot)||
                        live.length!==configured.length||live.some((uid,i)=>uid!==configured[i])||
                        this.undergroundPlanKey(latest,slot,floor,undergroundBayMembers(latest,slot,now))!==plan.key)return;
                }
                this.state.underLaunch={bay:slot,uids:[...configured],ids:status.slots.map(job=>String(job.id)),at:now};e.persist();
                if(!d.click(go,`派遣地下通道队伍 · 第 ${floor} 层出发`)){delete this.state.underLaunch;e.persist();}
                return;
            }
            this.wait(running?`地下通道等待返回 · 已领取 ${this.state.underDone||0}/${cfg.underRuns}`:cfg.optimizeRaid?'等待地下通道解锁或可用派遣队伍':'请在游戏内配置三只可派遣成员，或开启特殊战自动配队',running?untilReturn:now+60000);
        }
        openGeodes(s){
            const d=this.e.driver,fx=$$('.gd-fx .gd-ok,.gd-fx .gd-skip').find(enabled)||$$('.gd-fx .gd-stage canvas').find(enabled);if(fx){d.click(fx,'完成晶洞奖励动画',fx.tagName==='CANVAS');return true;}
            if(!(s.under?.geodes||[]).some(n=>n>0))return false;
            const tab=$('#ug-root [data-ug-tab="geo"]:not(.on)');if(enabled(tab)){d.click(tab,'打开晶洞背包');return true;}
            const all=$('#ug-root [data-ug-all]'),count=(s.under.geodes||[]).reduce((n,v)=>n+(Number(v)||0),0),remaining=this.e.settings.useBudget-this.e.budget.used;
            const bulk=count>1&&count<=remaining&&enabled(all),button=bulk?all:$$('#ug-root [data-ug-geode]').find(enabled),uses=bulk?count:1;
            if(remaining<=0){this.fail('达到当前任务道具使用上限，剩余晶洞保留在背包');return true;}
            if(enabled(button)){this.spentClick(button,s,0,uses,'开启已拥有的晶洞');return true;}
            this.wait('等待晶洞背包与开启按钮刷新',Date.now()+2000);return true;
        }
        raidPage(page){const d=this.e.driver;if(!d.nav('raid'))return false;const home=$('#raid-root [data-raid-page="home"]');
            if(page==='tower'&&$('#tower-root'))return true;
            if(page==='candy'&&$('#candy-root'))return true;
            const control=$(`#raid-root [data-raid-page="${page}"]`);if(enabled(control)){d.click(control,'打开'+({tower:'对战塔',candy:'糖果工厂'}[page]||page));return false;}
            if(enabled(home)){d.click(home,'返回活动首页');return false;}return false;
        }
        tower(s,now){
            const e=this.e,cfg=e.settings,d=e.driver,progress=towerProgress(s,now),{run,best,week}=progress,active=!!s.adv.tower;
            if(s.adv.tower?.kind==='candy'){this.fail('当前为糖果工厂，请先结束该活动');return;}
            if(this.state.towerWeek!==week){Object.assign(this.state,{towerWeek:week,towerAttempts:0,towerReached:false,towerWasActive:false});delete this.state.towerLaunch;e.persist();}
            if(this.state.towerLaunch){
                if(run&&active){delete this.state.towerLaunch;this.state.towerWasActive=true;e.persist();}
                else if(now-this.state.towerLaunch.at<15000){this.wait('等待对战塔启动存档确认');return;}
                else{delete this.state.towerLaunch;this.fail('对战塔启动未获确认，已暂停以免重复开启');return;}
            }
            if(active&&!run){
                if(!this.raidPage('tower'))return;
                if(d.click($('#tower-root [data-tw-quit]'),'清理失效的对战塔活动'))this.own('confirm','.modal',{match:/(放弃|放棄|结束|Abandon|Quit|Give up)/i});
                else this.wait('等待原生对战塔清理过期场次');return;
            }
            if(this.state.towerWasActive&&!run&&!progress.expired){this.state.towerAttempts=(this.state.towerAttempts||0)+1;this.state.towerWasActive=false;e.persist();}
            if(!run&&s.tower?.gift){if(this.raidPage('tower'))this.wait('正在领取对战塔待结算奖励');return;}
            if(run){
                this.state.towerWasActive=true;
                if(progress.cleared>=cfg.towerFloor)this.state.towerReached=true;
                if(this.state.towerReached){if(!this.raidPage('tower'))return;const quit=$('#tower-root [data-tw-quit]');if(d.click(quit,'达到楼层，结束本次爬塔'))this.own('confirm','.modal',{match:/(放弃|放棄|结束|Abandon|Quit|Give up)/i});return;}
                if(active){this.wait(`对战塔进行中 · 已过 ${progress.cleared} 层 / 目标 ${cfg.towerFloor}`);d.nav('adventure');return;}
            }
            if(!active&&!run&&(best>=cfg.towerFloor||this.state.towerReached)){this.done('对战塔目标楼层已完成');return;}
            if(!run&&((this.state.towerAttempts||0)>=cfg.towerRuns||e.daily?.job?.kind==='tower'&&e.dailyMarks.tower>now)){
                if(e.daily?.job?.kind==='tower')this.done('今日对战塔尝试已完成');
                else this.fail('已达到对战塔尝试上限，目标楼层尚未完成');
                return;
            }
            if(!this.raidPage('tower'))return;
            const tab=$('#tower-root [data-tw-tab="tower"]:not(.on)');if(enabled(tab)){d.click(tab,'打开爬塔进度');return;}
            const go=$('#tower-root [data-tw-go]');if(enabled(go)){
                if(!run&&e.ensurePrepared(s,battleContext(s,'tower',{floor:cfg.towerFloor}),{},now))return;
                this.state.towerLaunch={at:now,week};e.persist();
                if(!d.click(go,run?'继续本周对战塔':'开始本周对战塔'))delete this.state.towerLaunch;
                else if(!run&&e.daily?.job?.kind==='tower'){
                    const last=cfg.towerRuns===1||e.dailyMarks.towerFirst>now;
                    e.dailyMarks[last?'tower':'towerFirst']=nextParisReset(now);
                }
                e.persist();return;
            }
            this.wait('等待对战塔解锁、登录或可用成员');
        }
        candy(s,now){
            const e=this.e,cfg=e.settings,d=e.driver,run=s.candy?.run,last=s.candy?.last;
            const identity=value=>value?`${value.day}|${value.at}|${value.from||1}`:'';
            if(s.adv.tower&&s.adv.tower.kind!=='candy'){this.fail('当前为对战塔，请先结束该活动');return;}
            const launch=this.state.candyLaunch;
            if(launch){
                if(run&&s.adv.tower?.kind==='candy'){this.state.candyRun={day:run.day,at:run.at,from:run.from||1};delete this.state.candyLaunch;e.persist();}
                else if(last&&identity(last)!==launch.previousLast&&last.day===launch.day){this.state.candyRun={day:last.day,at:last.at,from:last.from||1};delete this.state.candyLaunch;}
                else if(now-launch.at<15000){this.wait('等待糖果工厂启动存档确认');return;}
                else{delete this.state.candyLaunch;this.fail('糖果工厂启动未获确认，已暂停以免浪费每日机会');return;}
            }
            if(run){
                if(this.state.candyRun&&identity(this.state.candyRun)!==identity(run)){this.fail('糖果工厂场次发生变化，请重新接管');return;}
                this.state.candyRun={day:run.day,at:run.at,from:run.from||1};delete this.state.candyEndedAt;
                const cleared=Math.max(0,(Number(run.floor)||1)-1),goal=cfg.candyFloor>0?Math.ceil(cfg.candyFloor/5)*5:0;
                if(goal&&cleared>=goal){
                    if(!this.raidPage('candy'))return;
                    if(d.click($('#candy-root [data-cr-stop]'),'糖果工厂达到目标，保留已获奖励并结束'))this.own('confirm','.modal',{match:/(停止|结束|放弃|Arrêter|Stop|Quit|Terminer|Abandon)/i});return;
                }
                this.wait(`糖果工厂 · 已过 ${cleared} 层${goal?' / 目标 '+goal:' · 尽力挑战'} · 糖果按营地到账`);
                if(s.adv.tower?.kind==='candy'){d.nav('adventure');return;}
                if(!this.raidPage('candy'))return;
                const resume=$('#candy-root [data-cr-go]');
                if(enabled(resume)){this.state.candyLaunch={at:now,day:run.day,previousLast:identity(last)};e.persist();if(!d.click(resume,'继续已有糖果工厂场次'))delete this.state.candyLaunch;return;}
                return;
            }
            if(this.state.candyRun){
                if(identity(last)===identity(this.state.candyRun)){
                    this.state.candyDone=(this.state.candyDone||0)+1;this.state.candyResult={floor:last.floor||0,got:last.got||{}};
                    this.state.candyLast=identity(last);delete this.state.candyRun;delete this.state.candyEndedAt;
                    e.log(`糖果工厂结算 · 本次已过 ${last.floor||0} 层 · 完成 ${this.state.candyDone}/${cfg.candyRuns} 局`);e.persist();
                }else{this.state.candyEndedAt??=now;if(now-this.state.candyEndedAt>15000)this.fail('糖果工厂结束记录未获确认，请检查游戏结算');else this.wait('等待糖果工厂结算存档确认');return;}
            }
            if(this.state.candyPreparation){
                const p=this.state.candyPreparation;delete this.state.candyPreparation;
                p.phase='restore';p.phaseAt=now;p.lastGrowth=now;p.lastTick=now;p.returnReason='工厂本局已结束，恢复入场前冒险队伍';
                e.preparation=p;e.persist();return;
            }
            if((this.state.candyDone||0)>=cfg.candyRuns){this.done('糖果工厂目标场次已完成，奖励已由游戏发放');return;}
            const day=parisDay(now),played=s.candy?.played===day;
            if(played&&e.daily?.job?.kind==='candy'){this.done('今日工厂机会已用');return;}
            const dailyKey=JSON.stringify([accountId(s),day,identity(last)]);
            // The server can explicitly reopen the factory on the same day. Only a
            // rendered native lock proves exhaustion; reload checks the server again.
            if(played&&this.candyClosed===dailyKey&&!enabled($('#candy-root [data-cr-go]'))){
                this.wait('今日糖果工厂机会已用，等待巴黎时间次日刷新',nextParisReset(now));return;
            }
            if(!this.raidPage('candy'))return;
            if(played&&!enabled($('#candy-root [data-cr-go]'))){
                if(visible($('#candy-root [data-cr-timer]')))this.candyClosed=dailyKey;
                this.wait('今日糖果工厂机会已用，等待巴黎时间次日刷新',nextParisReset(now));return;
            }
            this.candyClosed=null;
            const type=$('#candy-root .cr-type [data-type]')?.dataset.type;
            if(!type||!DATA.types[type]){this.wait('等待糖果工厂今日主题加载；请确认活动已解锁并登录');return;}
            const context=candyGoalContext(s,cfg,type);
            if(cfg.optimizeRaid){
                const key=JSON.stringify([context.key,parisDay(now),rosterFingerprint(s),s.autoSwitch!==false,adventureTeamWeatherKey(s,[s.adv.chapter],now)]);
                const party=s.eventTeams?.candy||[],confirmed=d.recent.get(key);
                if(!Array.isArray(confirmed)||confirmed.length!==party.length||confirmed.some((uid,i)=>party[i]!==uid)){
                    const edit=$('#candy-root [data-cr-team]');
                    if(!enabled(edit)){this.wait('等待糖果工厂配队入口就绪');return;}
                    const sliced=s.mons.length>=24,search=candyTeamSearch(s,cfg,context,sliced,now);
                    const plan=sliced?e.evaluateTeamSearch(JSON.stringify([key,party]),search):search.next().value;
                    if(!plan){this.wait('正在评估糖果工厂专属队伍');return;}
                    if(!plan.uids.length){this.wait('糖果工厂没有可用的已关联地区成员');return;}
                    if(d.click(edit,'按糖果工厂今日主题配置队伍'))d.ownedDialog={type:'factoryTeam',key,uids:plan.uids,started:now};
                    return;
                }
            }
            const go=$('#candy-root [data-cr-go]');
            if(!enabled(go)){this.wait('等待糖果工厂开放、今日机会或有效专属队伍');return;}
            if(e.ensurePrepared(s,context,{},now))return;
            const from=$$('#candy-root [data-cr-from].on').find(enabled);
            if(from&&+from.dataset.crFrom!==1){const first=$('#candy-root [data-cr-from="1"]');if(enabled(first))d.click(first,'从第一层开始，保留跳层资源');else this.fail('无法确认糖果工厂免费起点，请手动选择第一层');return;}
            this.state.candyLaunch={at:now,day:parisDay(now),previousLast:identity(last)};e.persist();
            if(!d.click(go,'开始今日糖果工厂'))delete this.state.candyLaunch;e.persist();
        }
        exitDefeatedLeague(s,now){
            const e=this.e,league=s.adv.league;
            let exit=this.state.eliteDefeat;
            // The native league starts at tries=1. A wipe increments it and immediately rebuilds the same tier.
            if(!exit){
                if(!(league?.tries>1)||league.reg!==(e.settings.eliteRegion==='current'?currentRegion(s):e.settings.eliteRegion))return false;
                exit=this.state.eliteDefeat={reg:league.reg,tier:league.tier,at:now};
                e.persist();
            }
            const reason=`精英联盟第 ${exit.tier} 阶挑战失败，已跳过`;
            if(!league){
                e.completeTask(reason,'skipped');return true;
            }
            if(league.reg!==exit.reg||league.tier!==exit.tier){
                this.fail('精英联盟场次已变更，请确认当前活动后继续');return true;
            }
            if(now-exit.at>60000){
                this.fail('精英联盟落败后未能确认退出，请返回普通章节后继续');return true;
            }
            // The map's native Go control only switches out of an elite league if the chapter changes.
            // Its ordinary-league row may resolve to the current room, so pick a distinct ordinary chapter.
            const back=CHAPTERS.get(league.back??s.adv.chapter);
            const usable=c=>c&&!c.league&&c.id!==s.adv.chapter&&c.id<=s.adv.unlocked;
            const row=usable(back)?back:DATA.chapters.find(c=>c.reg===(back?.reg||exit.reg)&&usable(c));
            if(!row){this.fail('精英联盟落败后找不到可返回的普通章节');return true;}
            this.wait('精英联盟挑战失败，正在退出');
            if(!exit.clicked&&e.driver.map(row,s,{leaveZone:true}))exit.clicked=true;
            return true;
        }
        elitePartyKey(s,context,now){
            const rooms=[...new Set(context.foes.map(f=>f.chapter))];
            const weather=rooms.map(chapter=>{
                const gym=WEATHER_DATA.chapters[chapter]?.nodes?.find(n=>n.kind==='gym');
                return combatWeather(s,{chapter,weatherNode:gym},context,now).weather;
            });
            return JSON.stringify([context.key,rosterFingerprint(s),s.autoSwitch!==false,weather]);
        }
        eliteEditorCurrent(s,own,now){
            const reg=this.e.settings.eliteRegion==='current'?currentRegion(s):this.e.settings.eliteRegion;
            if(own.teamKey!=='league:'+reg||!this.elitePlan||s.adv.league)return false;
            const tier=(Number(s.eliteLeague?.[reg]?.t)||0)+1;
            return this.elitePlan.key===this.elitePartyKey(s,battleContext(s,'elite',{reg,tier,now}),now);
        }
        elite(s,now){
            const e=this.e,cfg=e.settings,d=e.driver,reg=cfg.eliteRegion==='current'?currentRegion(s):cfg.eliteRegion,best=Number(s.eliteLeague?.[reg]?.t)||0;
            if(s.adv.league){if(s.adv.league.reg!==reg){this.fail('当前精英联盟与所选地区不同');return;}this.wait(`精英联盟 · ${DATA.regions.find(r=>r.key===reg)?.name||reg} · ${s.adv.league.tier||best+1} 阶`);d.nav('adventure');this.own('gem','.lgp-modal');return;}
            if(best>=cfg.eliteTier){this.done('精英联盟目标阶级已完成');return;}
            if(e.daily?.job?.launched){
                if(now-e.daily.job.launched<15000)this.wait('等待精英联盟场次确认');
                else this.done('本日精英联盟挑战已提交');
                return;
            }
            if(!d.nav('map'))return;
            const region=$(`#map-root .rg.open[data-rg="${reg}"]`);
            if(region&&!region.classList.contains('active')){d.click(region,'选择精英联盟地区');return;}
            const row=$('#map-root .mp-row[data-ch="L"]');
            if(!region||!row){
                const reason=!region?'精英联盟所在地区尚未开放':'当前地区没有可用联盟入口';
                if(e.daily?.job?.kind==='elite')e.returnFromDaily(reason,Math.min(nextParisReset(now),now+30*60000),now);
                else this.fail(reason);
                return;
            }
            if(!row.classList.contains('sel')){d.click(row,'选择联盟');return;}
            const tab=$('#map-root [data-lg-view="elite"]:not(.on)');if(enabled(tab)){d.click(tab,'切换精英联盟');return;}
            const go=$(`#map-root [data-league="${reg}"][data-tier="${best+1}"]`);
            const context=battleContext(s,'elite',{reg,tier:best+1,now}),edit=$(`#map-root [data-lg-team="${reg}"]`);
            if(cfg.optimizeRaid&&(enabled(edit)||enabled(go))){
                const teamKey='league:'+reg,party=s.eventTeams?.[teamKey]||[];
                const key=this.elitePartyKey(s,context,now);
                let desired=this.elitePlan?.key===key?this.elitePlan.uids:null;
                if(!desired){
                    const state={...s,team:party,road:party},search=adventureTeamSearch(state,{...cfg,activeSwitch:false},[],
                        {...context,now,objective:'progress'},true);
                    const plan=e.evaluateTeamSearch(JSON.stringify([key,party]),search);
                    if(!plan){this.wait('正在按地区首领评估队伍 · '+context.label);return;}
                    if(!plan.uids.length){this.wait('当前地区没有可出战的精英联盟队员');return;}
                    desired=plan.uids;this.elitePlan={key,uids:desired,label:context.label};
                }
                if(desired.length!==party.length||desired.some((uid,i)=>uid!==party[i])){
                    if(!enabled(edit)){this.wait('等待地区专属队伍入口 · '+context.label);return;}
                    if(d.click(edit,'配置队伍 · '+context.label))d.ownedDialog={type:'eliteTeam',teamKey,uids:desired,started:now,openingUntil:now+5000};
                    return;
                }
            }
            if(enabled(go)&&e.ensurePrepared(s,context,{},now))return;
            if(enabled(go)){
                if(d.click(go,'挑战下一阶精英联盟')&&e.daily?.job?.kind==='elite'){
                    e.daily.job.launched=now;e.dailyMarks.elite=nextParisReset(now);e.persist();
                }
                return;
            }
            this.wait('精英联盟尚未满足开放条件；需要联盟通关和地下通道开放');
        }
        world(s,now){
            const e=this.e,cfg=e.settings,d=e.driver;
            if(s.adv.zone){if(s.adv.zone.id!==493){this.fail('当前传说战不是世界首领');return;}this.wait('世界首领捕获进行中');d.nav('adventure');return;}
            const edition=s.wb?.tryEd||s.wb?.ed;
            if(cfg.worldCapture&&edition&&s.wb?.caught===edition&&(this.state.worldCaptureStarted&&s.wb.caught!==this.state.worldCaught||visible($('#raid-root .wb-capv .chip-ok')))){this.done('本期世界首领已捕获');return;}
            const n=Number(s.wb?.n)||0,day=String(s.wb?.ed)+'|'+s.wb?.day;
            if(!this.state.worldDay)this.state.worldDay=day;
            if(this.state.worldDay!==day){this.state.worldBase=0;this.state.worldDay=day;}
            let pendingAttack=this.state.worldAttack;
            if(pendingAttack&&(pendingAttack.day!==day||n>pendingAttack.count)){
                delete this.state.worldAttack;
                pendingAttack=null;
            }
            const delta=(this.state.worldDone||0)+Math.max(0,n-(this.state.worldBase||0));
            this.state.worldDone=delta;this.state.worldBase=n;
            const skip=$('#raid-root .wb-skip'),recap=$('.wb-recap [data-wb-go]'),spill=$('#raid-root .wb-spill');
            const resultVisible=visible(skip)||visible(recap)||visible(spill);
            if(resultVisible)this.state.worldResultAt=now;
            // The native daily counter is saved before the attack and retaliation animation.
            // A brief gap separates the spill being hidden from the result card appearing.
            const settling=this.state.worldResultAt!=null&&now-this.state.worldResultAt<3000;
            const daily=e.daily?.job?.kind==='world';
            if(daily&&delta>=cfg.worldActions&&!resultVisible&&!settling){
                e.returnFromDaily('今日首领攻击已完成',Math.min(nextParisReset(now),now+30*60000),now);return;
            }
            if(delta>=cfg.worldActions&&!cfg.worldCapture&&!resultVisible&&!settling){this.done('世界首领攻击次数目标已完成');return;}
            if(!d.nav('raid'))return;
            if(cfg.animations&&enabled(skip)){d.click(skip,'跳过世界首领攻击动画');return;}
            if(enabled(recap)){d.click(recap,'确认世界首领攻击结果');return;}
            if(resultVisible||settling){this.wait('等待世界首领攻击结算与结果确认');return;}
            const capture=$('[data-wbz-go]');if(cfg.worldCapture&&enabled(capture)){
                const key=`world:493|${rosterFingerprint(s)}`,edit=$('[data-wbz-team]');if(cfg.optimizeRaid&&!d.recent.has(key)&&enabled(edit)){if(d.click(edit,'配置世界首领捕获队伍'))d.ownedDialog={type:'team',key,optimized:false};return;}
                if(e.ensurePrepared(s,battleContext(s,'worldCapture',{id:493}),{},now))return;
                if(d.click(capture,'进入世界首领捕获'))this.state.worldCaptureStarted=true;return;
            }
            const capPage=$('[data-wb-cap]');
            if(daily&&enabled(capPage)){d.click(capPage,'打开世界首领捕获阶段');return;}
            // A button can reappear before the native save reflects an accepted
            // attack, or immediately after a failed connection. Keep checking
            // the counter while backing off repeated submissions.
            if(pendingAttack&&now<pendingAttack.retryAt){
                this.wait('等待世界首领攻击确认',pendingAttack.retryAt);return;
            }
            const attack=$('[data-wb-atk]');if(enabled(attack)&&delta<cfg.worldActions&&(!daily||!(e.dailyMarks.attack>now))){
                if(e.ensurePrepared(s,battleContext(s,'worldAttack'),{},now))return;
                if(d.click(attack,'使用本次世界首领攻击机会')){
                    const attempts=Math.min(3,(pendingAttack?.attempts||0)+1);
                    this.state.worldAttack={day,count:Math.max(n,pendingAttack?.count??n),attempts,retryAt:now+15000*2**(attempts-1)};
                    this.state.waitUntil=now+3000;this.state.waitLabel='世界首领攻击提交中';
                    if(daily)e.dailyMarks.attack=nextParisReset(now);
                    e.persist();
                }return;
            }
            const banner=$('#raid-root .rh-hb.wb[data-wb-go]');if(enabled(banner)){d.click(banner,'进入世界首领');return;}
            if(cfg.worldCapture&&enabled(capPage)){d.click(capPage,'打开世界首领捕获阶段');return;}
            const home=$('#raid-root [data-raid-page="home"]');
            if(enabled(home)&&!visible($('#raid-root .wb-view,#raid-root .wb-recap'))){d.click(home,'返回活动首页，查找世界首领');return;}
            const closedBanner=$('#raid-root .rh-hb.wb[aria-disabled="true"]');
            const worldView=$('#raid-root .map-region.wb-view');
            const surface=visible(closedBanner)?closedBanner:visible(worldView)?worldView:null;
            const timers=surface?[...surface.querySelectorAll('[data-wb-cd]')]:[];
            const deadlines=timers.map(el=>Number(el.dataset.wbCd)).filter(at=>at>now);
            const nextPhase=deadlines.length?Math.min(...deadlines):null;
            if(daily&&surface){
                const reason=surface===closedBanner?'世界首领尚未开放':'首领暂无可执行机会';
                e.returnFromDaily(reason,Math.min(nextParisReset(now),nextPhase??now+30*60000),now);return;
            }
            this.wait(delta>=cfg.worldActions?'本次攻击目标已完成，等待世界首领捕获阶段':'等待世界首领阶段、登录或可用攻击成员',nextPhase??now+60000);
        }
        advanceTrainingRank(s,now,target=null){
            const e=this.e,d=e.driver,receipt=this.state.rankReceipt;
            if(receipt){
                const fx=$('.rk-fx');
                if(visible(fx)&&now-receipt.at<=90000){
                    const ok=fx.querySelector('.rk-ok');
                    if(enabled(ok))d.click(ok,'结束宝石升阶动画');
                    else if(e.settings.animations)d.click(fx.querySelector('.rk-skip'),'跳过宝石升阶动画');
                    return true;
                }
                const mon=s.mons.find(m=>m.uid===receipt.uid);
                if(!visible(fx)&&mon?.id===receipt.id && mon.rank===receipt.next){
                    const card=$('#modal-root.open .mon-modal .mon-card');
                    if(visible(card)&&monIdFrom(card.querySelector('.dc-hero')||card)===mon.id){
                        d.click(card.querySelector('.dc-x'),'关闭升阶后的成员详情');return true;
                    }
                    delete this.state.rankReceipt;this.rankUI=null;
                    if(Number.isFinite(receipt.oldXp)&&Number.isFinite(e.startTrainingXp)){
                        const resetXp=experienceTotal({...s,mons:[{...mon,level:5,xp:0}]},[mon.uid]);
                        if(resetXp!=null)e.startTrainingXp-=receipt.oldXp-resetXp;
                    }
                    e.teamCheck=null;e.telemetry.sample=null;
                    e.log('宝石升阶已确认 · '+MONS.get(mon.id).name+' '+mon.rank+' 阶，继续练级');e.persist();
                    return true;
                }
                if(now-receipt.at>90000)this.fail('宝石使用结果尚未确认，请核对目标阶数和库存后继续');
                else e.status='等待游戏保存目标阶数';
                return true;
            }
            let task=this.rankUI;
            if(!task){
                if(!target||s.adv.pending||this.owner||d.ownedDialog||visible($('#modal-root.open')))return false;
                task=this.rankUI={...target,stage:'team',at:now};
            }
            const skip=reason=>{
                (this.state.rankSkipped||={})[task.uid]=task.key;
                e.log('跳过本次升阶 · '+reason);this.rankUI=null;
                return false;
            };
            const current=trainingGemTarget(s,e.settings,e.trainProtected,e.budget,this.state.rankSkipped);
            if(current?.uid!==task.uid||current.key!==task.key||s.adv.event||s.adv.zone||s.adv.tower||s.adv.league){
                this.rankUI=null;return false;
            }
            if(now-task.at>30000)return skip('游戏未显示预期的升阶控件');
            e.status='目标培育 · '+MONS.get(task.id).name+' → '+task.next+' 阶';
            const modal=$('#modal-root.open .modal');
            if(task.stage==='team'){
                if(visible(modal))return skip('页面出现其他弹窗');
                if(!d.nav('team'))return true;
                const member=$$('#team-slots [data-uid],#team-mini.show [data-uid]').find(el=>el.dataset.uid===task.uid&&enabled(el));
                if(member&&d.click(member,'打开指定培育队员'))task.stage='card';
                return true;
            }
            if(!visible(modal))return true;
            if(task.stage==='card'){
                const card=modal.querySelector('.mon-card');
                if(!modal.matches('.mon-modal')||!card||monIdFrom(card.querySelector('.dc-hero')||card)!==task.id)return skip('目标详情与所选队员不符');
                const button=card.querySelector('.more-actions .rk-btn');
                if(!enabled(button)){
                    if(d.click(card.querySelector('.dc-x'),'关闭未满足升阶条件的详情'))skip('当前没有足够的对应稀有度宝石或游戏尚未开放升阶');
                    return true;
                }
                if(d.click(button,'查看指定队员升阶费用')){task.card=modal;task.stage='confirm';}
                return true;
            }
            if(modal===task.card)return true;
            if(!modal.matches('.rk-modal:not(.lgp-modal)')||!modal.querySelector('.rk-q'))return skip('无法核对升阶窗口');
            const costText=modal.querySelector('.dc-fact b')?.textContent||'';
            const counts=costText.match(/\d+/g);
            if(modal.querySelector('.ot-warn')||counts?.length!==1||Number(counts[0])!==task.next){
                if(d.click(modal.querySelector('.modal-actions .ghost'),'取消条件不符的升阶'))skip('游戏提示仍可进化或费用已变化');
                return true;
            }
            // spentClick persists the receipt and allowance together before dispatch.
            this.state.rankReceipt={uid:task.uid,id:task.id,next:task.next,at:now,oldXp:experienceTotal(s,[task.uid])};
            if(this.spentClick(modal.querySelector('.modal-actions .gold'),s,0,task.next,'使用库存宝石升阶'))this.rankUI=null;
            else{delete this.state.rankReceipt;e.persist();}
            return true;
        }
        buddyTarget(s){
            const e=this.e,a=s.adv;
            if(!e.settings.trainBuddy||a.pending||a.event||a.zone||a.tower||a.league||a.paused)return null;
            if(e.preparation?.phase&&e.preparation.phase!=='train')return null;
            if(Array.isArray(s.road)&&s.road.length&&(s.road.length!==s.team.length||s.road.some((uid,i)=>s.team[i]!==uid)))return null;
            return selectTrainingBuddy(s,e.settings,e.preparation,e.trainProtected);
        }
        autoBuddy(s,now=Date.now()){
            const e=this.e,d=e.driver,task=this.buddyTask;
            if(!e.running||e.manual||pageHidden())return false;
            if(task?.stage==='return'){
                // Search restoration is optional; a stale checkpoint must still return to play.
                if(now-task.started>45000)delete task.searchBefore;
                const search=$('#screen-team.active #pc-search');
                if(search&&task.searchBefore!==undefined&&search.value!==task.searchBefore){d.input(search,task.searchBefore,'恢复搭档选择前的PC搜索');return true;}
                if(!d.nav('adventure')){
                    task.returnAttempts=(task.returnAttempts||0)+1;
                    if(task.returnAttempts>=30){this.buddyTask=null;this.buddyRetryAt=now+60000;e.log('搭档已处理，冒险页暂不可进入；暂缓搭档操作并继续原任务');return false;}
                    return true;
                }
                this.buddyTask=null;return true;
            }
            if(task?.stage==='confirmSave'){
                if(s.buddy?.uid===task.uid){task.stage='return';task.started=now;return true;}
                if(now-task.clickedAt<=10000){e.lastProgress=now;e.status='等待游戏保存训练搭档';d.nav('adventure');return true;}
                this.buddyRetryAt=now+60000;task.stage='return';e.log('搭档调整暂缓：游戏未确认选择，60秒后重试');return true;
            }
            // Finishing an existing UI action must not depend on a remaining training target.
            if(!task&&this.buddyRetryAt>now)return false;
            const uid=this.buddyTarget(s);
            if(!uid||uid===s.buddy?.uid){if(task){task.stage='return';task.started=now;return true;}return false;}
            if(task&&task.uid!==uid){task.stage='return';task.started=now;return true;}
            if(!task||task.uid!==uid)this.buddyTask={uid,started:now};
            const current=this.buddyTask;
            if(now-current.started>30000){current.stage='return';this.buddyRetryAt=now+60000;e.log('搭档调整暂缓：页面操作超时，60秒后重试');return true;}
            if(this.owner)return false;
            e.status=`选择训练搭档 · ${MONS.get((s.mons||[]).find(mon=>mon.uid===uid)?.id)?.name||uid}`;
            if(!d.nav('team'))return true;
            if(current.searchBefore===undefined)current.searchBefore=$('#pc-search')?.value||'';
            let card=$$('#team-slots [data-uid],#team-mini.show [data-uid]').find(el=>el.dataset.uid===uid&&enabled(el));
            if(!card){const mon=s.mons.find(m=>m.uid===uid),cards=this.pcSearch(mon.id,'#pc-grid');if(!cards)return true;card=cards.find(el=>el.dataset.uid===uid);}
            if(card&&d.click(card,'打开训练搭档详情'))this.own('buddy','.mon-modal',{uid});
            return true;
        }
        buddyCardClosed(s,owner,now=Date.now()){
            if(owner?.kind!=='buddy')return;
            const task=this.buddyTask?.uid===owner.uid?this.buddyTask:{uid:owner.uid};
            task.started=now;task.stage=task.clickedAt!=null&&s.buddy?.uid!==owner.uid?'confirmSave':'return';
            this.buddyTask=task;
        }
        buddyCard(s,card,owner=this.owner){
            const e=this.e,d=e.driver,now=Date.now();
            if(!owner||!e.running||e.manual||pageHidden())return false;
            this.buddyTask||={uid:owner.uid,started:owner.started||now};
            const task=this.buddyTask;
            const close=stage=>{if(d.click(card.querySelector('.dc-x'),'关闭训练搭档详情')){this.owner=null;task.stage=stage;task.started=now;}return true;};
            const defer=reason=>{this.buddyRetryAt=now+60000;owner.cancelled=true;e.log(`搭档调整暂缓：${reason}，60秒后重试`);return close('return');};
            if(owner.cancelled)return close('return');
            if(this.buddyTarget(s)!==owner.uid)return close('return');
            if(now-task.started>30000)return defer('页面操作超时');
            const button=card.querySelector('.dc-head .dc-buddy[aria-pressed]')||card.querySelector('.dc-buddy[aria-pressed]');
            if(s.buddy?.uid===owner.uid)return close('return');
            if(!enabled(button))return defer('当前成员没有可用搭档按钮');
            if(button.getAttribute('aria-pressed')==='true'){
                task.clickedAt??=now;return close('confirmSave');
            }
            if(task.clickedAt!=null){
                if(now-task.clickedAt>10000)return defer('游戏未确认选择');
                e.status='等待游戏确认训练搭档';return true;
            }
            if(d.click(button,'设为当前训练搭档')){task.clickedAt=now;e.telemetry.sample=null;e.log(`训练搭档：${MONS.get((s.mons||[]).find(mon=>mon.uid===owner.uid)?.id)?.name||owner.uid}`);}
            return true;
        }
        resource(s,now){
            if(this.resourcePending(s,now))return;
            const cfg=this.e.settings,id=cfg.resourceItem,used=usedQuantity(s,id,this.state),bought=purchasedQuantity(s,id,this.state);
            if(cfg.resourceAction==='buy'&&bought>=cfg.resourceQuantity){this.done('道具采购目标已完成');return;}
            if(cfg.resourceAction!=='buy'&&used>=cfg.resourceQuantity){
                const close=$('#modal-root.open .mon-modal .dc-x');if(enabled(close)){this.e.driver.click(close,'关闭已完成的道具使用面板');this.owner=null;return;}
                this.done('道具使用目标已完成');return;
            }
            if(cfg.resourceAction==='buy')return this.buy(s,id);
            const stocked=s.items?.[id]>0;
            if(!stocked&&cfg.resourceAction==='use'){this.fail('背包中没有目标道具');return;}
            const why=this.e.budget.check(s,0,1)||(!stocked&&this.e.budget.purchaseBlock());
            if(why){this.fail(why);return;}
            if(DATA.automation.buffs[id])return stocked?this.buff(s,id):this.buy(s,id);
            const uid=cfg.useUid||(s.team||[])[0],mon=s.mons.find(m=>m.uid===uid);
            const blocked=resourceRecipientBlock(s,mon,id);
            if(blocked){this.fail(blocked);return;}
            let preview=null;
            if(!stocked){
                const xp=DATA.automation.candies[id]?.xp[candyRegion(s)];
                if(xp&&!(candyXpGap(s,mon,100)>=xp)){this.fail('购买后经验会超出该成员当前等级上限，已暂停补购');return;}
                if(DATA.automation.candies[id]||id==='rare-candy')return this.buy(s,id);
                preview=resourcePreviewKey(s,mon,id,now);
                if(this.resourcePreview?.key===preview&&this.resourcePreview.until>=now)return this.buy(s,id);
            }
            if(!this.page('team'))return;
            let card=$$('#team-slots [data-uid]').find(el=>el.dataset.uid===uid);
            if(!card){const cards=this.pcSearch(mon.id,'#pc-grid');if(!cards)return;card=cards.find(el=>el.dataset.uid===uid);}
            if(!card){this.wait('等待道具使用对象出现在PC');return;}
            if(this.e.driver.click(card,preview?'购买前核对目标成员的进化条件':'打开道具使用对象'))this.own('mon','.mon-modal',{uid,preview});
        }
        buy(s,id){
            if(this.resourcePending(s,Date.now()))return;
            const e=this.e,d=e.driver;
            const blocked=e.budget.purchaseBlock();if(blocked){this.fail(blocked);return;}
            if(!this.page('shop'))return;
            const section=$('#shop-grid [data-sh-sec="shop"]:not(.active)');if(enabled(section)){d.click(section,'打开金币商店');return;}
            const buyTab=$('#shop-grid [data-sh-mode="buy"]:not(.on)');if(enabled(buyTab)){d.click(buyTab,'切换购买');return;}
            const cards=$$('#shop-grid .sh-item[data-id]');
            if(!cards.length){
                this.state.shopLoadTries=(this.state.shopLoadTries||0)+1;
                if(this.state.shopLoadTries<12)this.wait('等待金币商店载入商品');
                else{delete this.state.shopLoadTries;this.fail('金币商店未显示商品，请检查商店页面后继续');}
                return;
            }
            delete this.state.shopLoadTries;
            const item=cards.find(el=>el.dataset.id===id);
            if(!item||item.classList.contains('locked')){
                const row=EVOLUTION_SHOP.get(id);
                this.fail(row&&evolutionShopLocked(s,row)?evolutionPurchaseReason(s,row):'目标道具未在当前金币商店解锁');return;
            }
            if(DATA.automation.candies[id]){
                const highest=highestShopCandy(s,cards);
                if(highest?.id!==id){
                    this.fail(highest?'当前商店最高档为'+(ITEMS.get(highest.id)?.name||highest.id)+'，请将采购目标改为该档':'当前商店没有已解锁的经验糖果');
                    return;
                }
            }
            const {one,single,buy,cost}=shopOffer(item);
            if(!single){
                if(enabled(one)&&!one.classList.contains('on')){d.click(one,'将购买数量限制为一份');return;}
                this.fail('无法确认商品的单份数量，已暂停采购');return;
            }
            if(cost==null){this.fail('无法确认商品单价，已暂停采购');return;}
            if(!enabled(buy)){this.fail(e.budget.check(s,cost)||'游戏商店的购买按钮暂不可用');return;}
            this.resourceSpend(buy,s,id,'buy',cost,0,'购买目标道具');
        }
        resourcePending(s,now=Date.now()){
            const tx=this.state.resourceTx||this.state.resourceBuffTx;if(!tx)return false;
            const stock=Number(s.items?.[tx.id])||0,out=Number(s.stats?.itemOut?.[tx.id])||0;
            const buff=tx===this.state.resourceBuffTx?s.buffs?.[tx.family]:null;
            const confirmed=tx.kind==='buy'?purchaseConfirmed(s,tx):out>tx.out||stock<tx.stock||
                buff?.key===tx.id&&activeYieldBuff(s,tx.family,now)&&(Number(buff.until)||0)>tx.until;
            if(confirmed){
                if(tx.kind==='buy'&&this.state.resourcePurchased!=null)this.state.resourcePurchased++;
                if(tx.kind!=='buy'){
                    const before=this.state.resourceUsed??Math.max(0,tx.out-(this.state.resourceOut??tx.out));
                    this.state.resourceUsed=before+1;
                }
                if(tx===this.state.resourceBuffTx)delete this.state.resourceBuffTx;
                else delete this.state.resourceTx;
                this.e.persist();
                return false;
            }
            const item=tx===this.state.resourceBuffTx?'目标树果':'目标道具';
            if(now-tx.at<10000)this.wait(tx.kind==='buy'?'等待目标道具购买到账确认':'等待'+item+'使用确认');
            else this.fail(tx.kind==='buy'?'目标道具购买未确认，已暂停以避免重复采购':item+'使用未确认，已暂停以避免重复消耗');
            return true;
        }
        resourceSpend(button,s,id,kind,cost,uses,label){
            const e=this.e,d=e.driver;if(!enabled(button)||!e.running||e.manual||pageHidden()||Date.now()-d.lastClick<700)return false;
            const why=e.budget.check(s,cost,uses);if(why){this.fail(why);return false;}
            // Persist the pending action with its budget reservation before the native click.
            // A stale or failed game save must never authorize a second purchase or serving.
            this.state.resourceTx={kind,id,stock:Number(s.items?.[id])||0,in:itemCounter(s,id),out:Number(s.stats?.itemOut?.[id])||0,at:Date.now()};
            if(kind==='buy'){
                this.state.resourcePurchased=purchasedQuantity(s,id,this.state);
                Object.assign(this.state.resourceTx,purchaseEvidence(s,id,cost));
            }else this.state.resourceUsed=usedQuantity(s,id,this.state);
            const clicked=this.spentClick(button,s,cost,uses,label);
            if(clicked&&kind==='buy')this.resourcePreview=null;
            if(!clicked){delete this.state.resourceTx;e.persist();}
            return clicked;
        }
        useFromCard(s,card){
            if(this.resourcePending(s,Date.now()))return true;
            const cfg=this.e.settings,id=cfg.resourceItem,used=usedQuantity(s,id,this.state);
            if(used>=cfg.resourceQuantity){this.e.driver.click(card.querySelector('.dc-x'),'关闭道具面板');this.owner=null;return true;}
            const uid=cfg.useUid||(s.team||[])[0],mon=s.mons.find(m=>m.uid===uid);
            if(this.owner?.uid&&this.owner.uid!==uid){
                if(this.e.driver.click(card.querySelector('.dc-x'),'重新核对道具使用对象'))this.owner=null;
                return true;
            }
            const blocked=resourceRecipientBlock(s,mon,id);
            if(blocked){this.fail(blocked);return true;}
            const buttons=resourceButtons(card,id);
            if(!(s.items?.[id]>0)&&cfg.resourceAction==='buyUse'){
                const preview=this.owner?.preview,now=Date.now();
                const check=preview&&preview===resourcePreviewKey(s,mon,id,now);
                // With zero stock native eligible evolution buttons retain an item → species title.
                // A blocked duplicate or the wrong regional bag replaces that title with the rejection reason.
                if(check&&buttons.filter(el=>visible(el)&&el.title?.includes(' → ')).length!==1){
                    this.fail('游戏尚未确认该成员有唯一可用的目标进化，请检查地区、时段和已有形态');return true;
                }
                if(this.e.driver.click(card.querySelector('.dc-x'),'关闭已无库存的道具面板')){
                    if(check)this.resourcePreview={key:preview,until:now+30000};
                    this.owner=null;
                }
                return true;
            }
            const usable=buttons.filter(enabled);
            if(usable.length>1){this.fail('该道具有多个可用进化分支，请先手动选择');return true;}
            const button=usable[0];
            if(!enabled(button)){this.fail('该道具当前不能用于所选宝可梦（可能达到等级上限或不满足进化条件）');return true;}
            this.resourceSpend(button,s,id,'use',0,1,'使用一份目标道具');return true;
        }
        buff(s,id){
            const e=this.e,now=Date.now(),family=DATA.automation.buffs[id].family;
            if(this.resourcePending(s,now))return;
            const active=activeYieldBuff(s,family,now)?s.buffs[family]:null;
            if(active&&active.key!==id){this.wait('同类已有其他树果增益，保留并等待其结束后使用目标树果',active.until);return;}
            const duration=(Number(DATA.automation.buffMinutes)||60)*60000,limit=(Number(DATA.automation.buffStack)||8)*duration;
            if(active&&active.until-now+duration>limit){this.wait('目标树果已达续时上限，等待可追加一份后继续',active.until+duration-limit);return;}
            if(!this.page('adventure'))return;
            const d=this.e.driver,button=$(`#bag-panel .bag-cell[data-k="${id}"]`);
            if(enabled(button)){
                const why=e.budget.check(s,0,1);if(why){this.fail(why);return;}
                this.state.resourceUsed=usedQuantity(s,id,this.state);
                this.state.resourceBuffTx={id,family,stock:Number(s.items?.[id])||0,out:Number(s.stats?.itemOut?.[id])||0,until:Number(s.buffs?.[family]?.until)||0,at:now};
                if(!this.spentClick(button,s,0,1,'使用一份目标增益树果')){delete this.state.resourceBuffTx;e.persist();}
                return;
            }
            const open=$('#bag-panel .bag-box.folded .zone-head');if(enabled(open)){d.click(open,'展开冒险消耗品');return;}
            this.fail('当前页面没有可用的树果消耗入口');
        }
        autoBuff(s,now,mode=this.e.settings.mode){
            const cfg=this.e.settings,allowed=mode==='train'?cfg.trainBuff:mode==='money'?cfg.moneyBuff:cfg.autoBuff;
            const family={money:'money',train:'xp',shiny:'shiny',dex:'dex',roam:'roam',roamCapture:'capture'}[mode];
            const tx=this.state.autoBuffTx;
            if(tx){
                const confirmed=(Number(s.items?.[tx.id])||0)<tx.stock||(Number(s.stats?.itemOut?.[tx.id])||0)>tx.out||s.buffs?.[tx.family]?.key===tx.id&&!!activeYieldBuff(s,tx.family,now);
                if(confirmed){delete this.state.autoBuffTx;}
                else if(now-tx.at<10000){this.e.action='等待增益树果使用确认';this.buffUI=null;return !!allowed&&family===tx.family;}
                else{
                    if(!tx.warned){tx.warned=true;(this.buffRetry||={})[tx.family]=now+60000;this.e.log('树果使用未确认，保留待核验记录并继续任务');}
                    this.buffUI=null;return false;
                }
            }
            if(!allowed||!family){this.buffUI=null;return false;}
            if(mode==='train'&&(!selectTrainingBuddy(s,cfg,this.e.preparation,this.e.trainProtected)||Array.isArray(s.road)&&s.road.length&&JSON.stringify(s.road)!==JSON.stringify(s.team))){this.buffUI=null;return false;}
            if(activeYieldBuff(s,family,now)||this.e.budget.check(s,0,1)||(this.buffRetry?.[family]||0)>now){this.buffUI=null;return false;}
            const id=Object.keys(DATA.automation.buffs).filter(id=>DATA.automation.buffs[id].family===family&&s.items?.[id]>0).sort((a,b)=>(DATA.automation.buffs[b].mult||0)-(DATA.automation.buffs[a].mult||0))[0];
            if(!id){this.buffUI=null;return false;}
            this.buffUI??={family,started:now};
            if(this.buffUI.family!==family)this.buffUI={family,started:now};
            if(now-this.buffUI.started>30000){this.buffUI=null;(this.buffRetry||={})[family]=now+60000;return false;}
            if(!this.page('adventure'))return true;
            const button=$(`#bag-panel .bag-cell[data-k="${id}"]`),open=$('#bag-panel .bag-box.folded .zone-head');
            if(enabled(button)){
                this.state.autoBuffTx={id,family,stock:Number(s.items[id])||0,out:Number(s.stats?.itemOut?.[id])||0,at:now};
                const clicked=this.spentClick(button,s,0,1,`自动使用${family==='xp'?'经验':family==='money'?'金币':'当前任务'}增益树果`);
                if(!clicked){delete this.state.autoBuffTx;this.e.persist();}this.buffUI=null;return clicked;
            }
            if(enabled(open)){this.e.driver.click(open,'展开增益树果');return true;}
            this.buffUI=null;(this.buffRetry||={})[family]=now+60000;return false;
        }
        departureBannerMatches(modal,starter){
            if(!starter||!modal||modal.classList.contains('mkc-modal'))return false;
            const ids=[...modal.querySelectorAll('.dp-starters figure')].map(monIdFrom);
            return ids.length===starter.ids.length&&starter.ids.every(id=>ids.includes(id));
        }
        departureArrived(s,reg){
            return currentRegion(s)===reg&&(s.travel?.to?.includes(reg)||s.link?.side==='to'&&s.link.to===reg);
        }
        dismissCompletedDeparture(s,modal,resuming=false){
            const reg=currentRegion(s),starter=regionalStarter(reg);
            if(!visible(modal)||!this.departureArrived(s,reg)||!starter||!s.adv.gifts?.[starter.key]||!this.departureBannerMatches(modal,starter))return false;
            const close=modal.querySelector('.modal-actions .ghost')||modal.querySelector('.dc-x');
            if(!enabled(close))return false;
            this.e.driver.click(close,'关闭已完成的跨地区出发提示',false,resuming);
            this.wait('已领取初始伙伴，正在返回冒险');return true;
        }
        finishDeparture(s,now){
            const tx=this.state.departure;
            const modal=$('#modal-root.open .dp-modal');
            if(!tx&&!visible(modal))return false;
            const reg=tx?.reg||currentRegion(s),starter=regionalStarter(reg);
            if(this.departureArrived(s,reg)){
                if(this.dismissCompletedDeparture(s,modal))return true;
                if(!tx)return false;
                if(s.team?.length||s.adv.gifts?.[starter?.key]){
                    delete this.state.departure;this.e.persist();return false;
                }
            }
            if(!tx)return false;
            if(now-tx.at>=120000){this.fail('已确认跨地区出发，游戏尚未完成转场或发放初始伙伴，请检查游戏画面');return true;}
            this.wait('已确认跨地区出发，等待游戏转场和初始伙伴');return true;
        }
        travel(s,now){
            const e=this.e,d=e.driver;if(!e.settings.autoTravel)return false;
            if(this.state.departure)return this.finishDeparture(s,now);
            if(!d.nav('map'))return true;
            const depart=$$('#map-root [data-depart]').find(el=>enabled(el)&&regionalStarter(el.dataset.depart)&&!s.travel?.to?.includes(el.dataset.depart));if(!depart)return false;
            if(d.click(depart,'准备跨地区开局'))this.own('travel','.dp-modal',{reg:depart.dataset.depart});
            e.telemetry.sample=null;this.wait('跨地区开局：新队伍与钱包由游戏分开管理');return true;
        }
    }


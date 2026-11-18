    class LevelCoach {
        constructor(engine){this.e=engine;this.checked=null;this.combat=null;this.ready=null;this.planReview=null;}
        partyProfile(s,uids=s.team||[]){
            const index=new Map((s.mons||[]).map(mon=>[mon.uid,mon]));
            return JSON.stringify([s.autoSwitch!==false,uids.map(uid=>{const mon=index.get(uid);return mon?[uid,...combatProfile({...mon,status:null})]:[uid];})]);
        }
        trialFloor(s,uids=s.team||[]){
            return uids.map(uid=>(s.mons||[]).find(mon=>mon.uid===uid)).filter(Boolean).map(mon=>({uid:mon.uid,id:mon.id,level:mon.level,rank:mon.rank||0,statMult:mon.statMult||1,hpMult:mon.hpMult||1,taste:tasteProfile(mon)}));
        }
        trialGrew(s,p){
            if(!p.trialFailure?.floor)return true;
            const old=new Map(p.trialFailure.floor.map(mon=>[mon.uid,mon]));
            return(p.uids||[]).some(uid=>{
                const mon=(s.mons||[]).find(mon=>mon.uid===uid),before=old.get(uid);if(!mon)return false;
                return!before||mon.level>=before.level+2||mon.id!==before.id||(mon.rank||0)>before.rank||(mon.statMult||1)>before.statMult||(mon.hpMult||1)>before.hpMult||tasteProfile(mon)!==before.taste;
            });
        }
        rememberReady(s,context,targets,trial=false){
            const chapter=CHAPTERS.get(context.id),members=chapter?.league?DATA.chapters.filter(c=>c.loop===chapter.loop).map(c=>c.id):[context.id];
            this.ready={key:context.key,deaths:totalDeaths(s,{members}),targets:trial?this.trialFloor(s).map(mon=>({uid:mon.uid,goal:mon.level})):targets.map(t=>({uid:t.uid,goal:t.goal}))};
            if(trial)Object.assign(this.ready,{trial:true,profile:this.partyProfile(s)});
        }
        manualTrainingWait(s,targets,reg,now){
            if(this.e.settings.autoTeam!==false)return false;
            const index=new Map((s.mons||[]).map(mon=>[mon.uid,mon])),chosen=s.team||[];
            const missing=targets.filter(target=>index.has(target.uid)&&index.get(target.uid).level<target.goal&&!chosen.includes(target.uid));
            const invalid=!chosen.length||chosen.some(uid=>!index.has(uid)||!teamEligible(s,index.get(uid),reg));
            if(!missing.length&&!invalid)return false;
            this.e.lastProgress=now;this.e.telemetry.sample=null;this.e.nextWake=null;
            this.e.status=missing.length?`请手动将${missing.map(target=>MONS.get(index.get(target.uid).id)?.name||target.uid).join('、')}加入冒险队伍以补练`:'请手动配置符合目标地区的冒险队伍以补练';
            const p=this.e.preparation;
            if(p){p.phaseAt=now;p.lastGrowth=now;p.lastTick=now;p.growth=null;delete p.roadWait;}
            return true;
        }
        ensure(s,context,resume={},now=Date.now()){
            const e=this.e;if(!e.settings.autoPrepare||e.preparation||['train','breed','resource'].includes(e.settings.mode))return false;
            if(e.settings.mode==='money'&&e.settings.moneyTarget&&s.money>=e.settings.moneyTarget)return false;
            const ordinary=['map','progress'].includes(context.kind),chapter=CHAPTERS.get(context.id);
            if(ordinary&&!e.settings.autoTeam&&!e.driver.teamTask){
                const index=new Map((s.mons||[]).map(mon=>[mon.uid,mon])),chosen=s.team||[];
                if(!chosen.length||chosen.some(uid=>!index.has(uid)||!teamEligible(s,index.get(uid),context.reg))){e.failTask('手动队伍为空、成员已离开PC或不符合目标地区，请手动配置后继续');return true;}
            }
            const deaths=ordinary?totalDeaths(s,{members:chapter?.league?DATA.chapters.filter(c=>c.loop===chapter.loop).map(c=>c.id):[context.id]}):0;
            // Engine.step runs this check before the native PC transaction. Let an
            // already queued roster finish instead of replacing it or blocking it.
            if(ordinary&&e.driver.teamTask?.preparationReady)return false;
            let failedTrial=null;
            if(this.ready){
                const ready=this.ready;
                if(ordinary&&ready.key===context.key&&deaths<=ready.deaths&&(!ready.trial||ready.profile===this.partyProfile(s))&&ready.targets.every(t=>(s.mons||[]).some(m=>m.uid===t.uid&&m.level>=Math.min(t.goal,trainingCap(s,m)))))return false;
                if(ordinary&&ready.key===context.key&&ready.trial&&deaths>ready.deaths)failedTrial={at:now,deaths,floor:this.trialFloor(s)};
                this.ready=null;
            }
            if(ordinary){
                if(this.combat?.key!==context.key)this.combat={key:context.key,deaths,failedAt:0};
                else{if(deaths>this.combat.deaths)this.combat.failedAt=now;this.combat.deaths=deaths;}
            }
            const recovering=ordinary&&(!!failedTrial||this.combat.failedAt>0&&now-this.combat.failedAt<10*60000);
            const fingerprint=JSON.stringify([context.key,e.settings.mode,e.settings.autoTeam,e.settings.autoEvolve,e.settings.optimizeRaid,e.settings.prepareMargin,e.settings.prepareGap,s.adv.unlocked,s.team,s.link?.side,s.autoSwitch!==false,
                rosterFingerprint(s),configuredBattleTeam(s,context),context.kind==='tower'?towerParty(s,{snapshot:!!towerProgress(s,now).run,now}).map(mon=>[mon.src,mon.id,mon.level]):null,context.kind==='under'?s.under?.used:context.kind==='worldAttack'?s.wb?.used:null,deaths,recovering]);
            if(this.checked===fingerprint)return false;
            let plan;
            if(this.planReview?.profile===fingerprint&&now-this.planReview.at<30000)plan=this.planReview.plan;
            else{plan=preparationPlan(s,e.settings,recovering?{...context,forcePreparation:true}:context);this.planReview={profile:fingerprint,at:now,plan};}
            const desired=Math.min(100,context.level+e.settings.prepareMargin);
            if(ordinary&&e.settings.autoTeam&&!recovering){
                const assessment=preparationReadiness(s,e.settings,context,plan.uids);
                if(assessment.ready){
                    const same=plan.uids.length===(s.team||[]).length&&plan.uids.every((uid,i)=>s.team[i]===uid),roadPending=Array.isArray(s.road)&&s.road.length>0&&(s.road.length!==s.team.length||s.road.some((uid,i)=>s.team[i]!==uid));
                    if(!same){
                        e.telemetry.sample=null;e.lastProgress=now;
                        if(s.adv.battle||s.adv.pending){e.status='当前队伍无需额外补练，等待安全节点安排出战';e.driver.nav('adventure');return true;}
                        if(now<e.teamRetryAt){e.status='可直接挑战的队伍等待原生配队重试';e.driver.nav('adventure');return true;}
                        e.driver.teamTask={chapter:s.adv.chapter,members:[s.adv.chapter],uids:plan.uids,started:now,attempts:0,preparationReady:true};
                        e.status=`使用现有战力挑战${context.label}，准备队伍上阵`;return true;
                    }
                    if(roadPending){e.telemetry.sample=null;e.lastProgress=now;e.status='现有战力已足够，等待治疗点应用队伍';e.driver.nav('adventure');return true;}
                    this.rememberReady(s,context,[],true);this.checked=fingerprint;return false;
                }
            }
            const staleTower=context.kind==='tower'&&towerParty(s,{snapshot:true}).some(mon=>mon.level+e.settings.prepareGap<desired&&(s.mons||[]).some(real=>real.uid===mon.src&&real.level>mon.level));
            if(!plan.needed&&!staleTower&&!(recovering&&plan.targets.length)){this.checked=fingerprint;return false;}
            if(plan.targets.length&&this.manualTrainingWait(s,plan.targets,context.reg,now))return true;
            if(!plan.uids.length&&!(staleTower&&!plan.targets.length)){e.log(`无法为${context.label}安排补练：当前PC没有合规成员`);this.checked=fingerprint;return false;}
            const {foes,...savedContext}=context;
            if(resume.type==='raid')resume={...resume,date:s.adv.event?.date||e.driver.raid?.date||parisDay(now)};
            e.preparation={mode:e.settings.mode,context:savedContext,resume,targets:plan.targets,uids:plan.uids,originalTeam:[...(s.team||[])],
                originalLocation:routeDescriptor({...CHAPTERS.get(s.adv.chapter),key:String(CHAPTERS.get(s.adv.chapter)?.loop),members:[s.adv.chapter]}),
                phase:'exit',phaseAt:now,started:now,lastTick:now,lastGrowth:now,frontier:s.adv.unlocked,avoid:{},restartTower:context.kind==='tower'&&!!s.tower?.run,capLimited:plan.capLimited,selection:plan.selection};
            if(failedTrial||recovering)e.preparation.trialFailure=failedTrial||{at:now,deaths,floor:this.trialFloor(s)};
            e.target=null;e.visit=null;e.telemetry.sample=null;e.driver.pendingMap=null;e.driver.teamTask=null;e.driver.ownedDialog=null;
            e.raidProbe=false;e.raidReturn=null;e.nextWake=null;this.checked=null;
            if(context.kind==='tower')e.automation.state.towerWasActive=false;
            e.log(`先为${context.label}补练：${plan.targets.map(m=>`${MONS.get(m.id)?.name} Lv.${m.level}→${m.goal}`).join('、')||'刷新爬塔阵容'}${plan.capLimited?'（受当前等级上限限制）':''}`);
            e.status=recovering?'战败后先补齐可提升等级，再继续原任务':'等级不足，准备补练后继续原任务';e.persist();return true;
        }
        adventure(s){
            const e=this.e,mode=e.settings.mode,a=s.adv;
            if(a.event||a.zone||a.tower||a.league||e.raidProbe||e.raidReturn||FLOW_MODES.has(mode)||['legend','train'].includes(mode))return null;
            let row;
            if(mode==='progress'){
                if(e.progressReached(s)||!e.canProgress(s))return null;
                const c=CHAPTERS.get(a.unlocked);row={...c,key:String(c.loop),members:c.league?DATA.chapters.filter(x=>x.loop===c.loop).map(x=>x.id):[c.id]};
            }else{
                if(mode==='money'&&e.settings.moneyTarget&&s.money>=e.settings.moneyTarget||mode==='shiny'&&shinyOwned(s,e.settings.shinyId)||mode==='item'&&itemCounter(s,e.settings.itemId)-e.startItems>=e.settings.itemQuantity||mode==='dex'&&(e.settings.afterDex==='stop'||e.queueRunning)&&!dexStatus(s,e.settings).missing.length)return null;
                row=e.driver.pendingMap&&!e.driver.pendingMap.options?.zone?e.driver.pendingMap.row:e.target;
                if(!row)return null;
            }
            return{context:battleContext(s,mode==='progress'?'progress':'map',{row,roamId:mode==='roam'?e.settings.roamId:undefined}),resume:mode==='progress'?{}:{row:routeDescriptor(row),...mode==='roam'?{options:{roamId:e.settings.roamId}}:{}}};
        }
        activity(s){
            const a=s.adv;
            if(a.event?.raid)return battleContext(s,'raid',{id:a.event.id,reg:a.event.reg});
            if(a.zone&&!a.zone.riddle&&a.pending?.type!=='riddle'&&(a.zone.id!==493||this.e.settings.mode==='world'))return battleContext(s,a.zone.id===493?'worldCapture':'zone',{id:a.zone.foe||a.zone.id,level:a.zone.level||100,reg:DATA.zones.find(z=>z.id===a.zone.id)?.reg,tier:a.zone.elite});
            if(a.league)return battleContext(s,'elite',{reg:a.league.reg,tier:a.league.tier});
            if(a.tower&&a.tower.kind!=='candy'&&towerProgress(s).run)return battleContext(s,'tower',{floor:this.e.settings.towerFloor});
            return null;
        }
        setPhase(p,phase,now){p.phase=phase;p.phaseAt=now;}
        candyFallback(p,reason){
            p.candyDisabled=true;delete p.candyTx;this.e.log(`主线经验糖果：${reason}，改用普通练级`);
        }
        candyPending(s,p,now){
            const tx=p.candyTx;if(!tx)return false;
            const mon=s.mons.find(m=>m.uid===tx.uid),xp=mon?experienceTotal(s,[tx.uid]):null;
            const changed=tx.kind==='buy'?(Number(s.items?.[tx.id])||0)>tx.stock||itemCounter(s,tx.id)>tx.counter:
                (Number(s.items?.[tx.id])||0)<tx.stock||(Number(s.stats?.itemOut?.[tx.id])||0)>tx.counter||xp>tx.xp;
            if(changed){delete p.candyTx;p.candyAt=now;if(tx.kind==='use'&&!(xp>tx.xp))this.candyFallback(p,'道具已消耗但目标经验未增加');return false;}
            if(now-tx.at>10000){this.candyFallback(p,'操作未确认，不重复购买或使用');return false;}
            p.lastGrowth=now;this.e.status='主线经验糖果 · 等待游戏确认'+(tx.kind==='buy'?'到账':'经验增长');return true;
        }
        candyClick(s,p,el,uid,id,kind,cost,now){
            const e=this.e,uses=kind==='use'?1:0,why=e.budget.check(s,cost,uses);
            if(why){this.candyFallback(p,why);return false;}
            p.candyTx={uid,id,kind,stock:Number(s.items?.[id])||0,counter:kind==='buy'?itemCounter(s,id):Number(s.stats?.itemOut?.[id])||0,xp:experienceTotal(s,[uid]),at:now};
            if(e.automation.spentClick(el,s,cost,uses,kind==='buy'?'购买一份主线补练经验糖果':'使用一份主线补练经验糖果'))return true;
            delete p.candyTx;return false;
        }
        candy(s,p,now){
            const e=this.e,d=e.driver;p.phaseAt=now;e.telemetry.sample=null;p.candyAt??=now;
            if(now-p.candyAt>90000){this.candyFallback(p,'页面操作超时');return false;}
            if(this.candyPending(s,p,now))return true;if(p.candyDisabled)return false;
            const targets=p.targets.map(t=>({...t,mon:s.mons.find(m=>m.uid===t.uid)})).filter(t=>t.mon&&candyXpGap(s,t.mon,t.goal)>0).sort((a,b)=>a.mon.level-b.mon.level);
            const target=targets[0];if(!target)return false;
            e.status=`主线经验糖果 · 为${MONS.get(target.mon.id)?.name}补至 Lv.${target.goal}`;
            const why=e.budget.check(s,0,1);if(why){this.candyFallback(p,why);return false;}
            let choice=candyChoice(s,target.mon,target.goal);
            if(!choice){
                if(e.settings.spendBudget<=e.budget.spent){this.candyFallback(p,'本次采购预算不足（0 表示不允许花钱）');return false;}
                if(!d.nav('shop'))return true;
                const section=$('#shop-grid [data-sh-sec="shop"]:not(.active)'),tab=$('#shop-grid [data-sh-mode="buy"]:not(.on)');
                if(enabled(section)){d.click(section,'打开金币经验糖果商店');return true;}if(enabled(tab)){d.click(tab,'切换购买经验糖果');return true;}
                const offers=$$('#shop-grid .sh-item[data-id]').filter(el=>DATA.automation.candies[el.dataset.id]&&!el.classList.contains('locked')).map(el=>{
                    const quantity=Number(el.querySelector('[data-n].on')?.dataset.n)||1;
                    return{id:el.dataset.id,cost:parsePrice(el.querySelector('.total')?.textContent)/quantity,el};
                }).filter(o=>enabled(o.el.querySelector('.buy'))&&!e.budget.check(s,o.cost,0));
                choice=candyChoice(s,target.mon,target.goal,offers);
                if(!choice){this.candyFallback(p,'没有已解锁且预算内可购买的经验糖果');return false;}
                const one=choice.el.querySelector('[data-n="1"]');if(enabled(one)&&!one.classList.contains('on')){d.click(one,'限制经验糖果购买数量为一份');return true;}
                if(Number(choice.el.querySelector('[data-n].on')?.dataset.n||1)!==1){this.candyFallback(p,'无法确认单份购买数量');return false;}
                const cost=parsePrice(choice.el.querySelector('.total')?.textContent);this.candyClick(s,p,choice.el.querySelector('.buy'),target.uid,choice.id,'buy',cost,now);return !p.candyDisabled;
            }
            p.candy={uid:target.uid,goal:target.goal};
            if(!d.nav('team'))return true;
            let card=$$('#team-slots [data-uid]').find(el=>el.dataset.uid===target.uid);
            if(!card){const cards=e.automation.pcSearch(target.mon.id,'#pc-grid');if(!cards)return true;card=cards.find(el=>el.dataset.uid===target.uid);}
            if(card&&d.click(card,'打开主线补练成员使用经验糖果'))e.automation.own('coachCandy','.mon-modal',{uid:target.uid});
            return true;
        }
        candyCard(s,card){
            const e=this.e,p=e.preparation,d=e.driver,now=Date.now();
            const close=()=>{if(d.click(card.querySelector('.dc-x'),'关闭主线补练糖果面板')){e.automation.owner=null;if(p)delete p.candy;}return true;};
            if(!p||!p.candy)return close();p.phaseAt=now;
            if(this.candyPending(s,p,now))return true;
            if(p.candyDisabled)return close();
            const mon=s.mons.find(m=>m.uid===p.candy.uid),choice=mon&&candyChoice(s,mon,p.candy.goal);
            if(!choice||!choice.owned)return close();
            const why=e.budget.check(s,0,1);if(why){this.candyFallback(p,why);return close();}
            const button=[...card.querySelectorAll('.dc-candy')].find(el=>[...el.querySelectorAll('img')].some(img=>(img.getAttribute('src')||'').includes('/'+choice.id+'.')));
            if(!enabled(button)){this.candyFallback(p,'该糖果当前无法用于目标成员');return close();}
            e.status=`主线经验糖果 · ${MONS.get(mon.id)?.name} Lv.${mon.level} → ${p.candy.goal}`;
            this.candyClick(s,p,button,mon.uid,choice.id,'use',0,now);return true;
        }
        team(s,uids,now){
            if(s.team?.length===uids.length&&uids.every((uid,i)=>s.team[i]===uid))return false;
            if(now<this.e.teamRetryAt){this.e.status='补练等待配队重试；请检查原生PC控件';return true;}
            this.e.driver.teamTask={chapter:s.adv.chapter,members:[s.adv.chapter],uids,started:now,attempts:0};return true;
        }
        reconcile(s,p,now=Date.now()){
            const index=new Map(s.mons.map(m=>[m.uid,m])),identity=m=>DATA.combat.singles[m.id]||`${m.id}:${+!!m.shiny}`;
            if(!this.e.settings.autoTeam){
                const planned=p.uids.map(uid=>index.get(uid)),invalid=planned.some(mon=>!mon||!teamEligible(s,mon,p.context.reg))||new Set(planned.filter(Boolean).map(identity)).size!==p.uids.length;
                if(invalid)this.e.failTask('手动队伍成员不可用，请配置有效阵容后继续');
                return;
            }
            const pending=p.targets.filter(t=>index.get(t.uid).level<t.goal),required=[],seen=new Set();
            // If evolution makes two trainees mutually exclusive, finish one batch before the next.
            pending.sort((a,b)=>Number(p.uids.includes(b.uid))-Number(p.uids.includes(a.uid)));
            for(const t of pending){const m=index.get(t.uid),key=identity(m);if(!seen.has(key)){seen.add(key);required.push(t.uid);}}
            const planned=p.uids.map(uid=>index.get(uid)),valid=planned.every(m=>m&&teamEligible(s,m,p.context.reg))&&new Set(planned.map(identity)).size===planned.length;
            const repair=!valid||required.some(uid=>!p.uids.includes(uid));
            const optimize=['map','progress'].includes(p.context.kind)?this.e.settings.autoTeam:this.e.settings.optimizeRaid||['tower','worldAttack'].includes(p.context.kind);
            if(!repair&&!optimize)return;
            const roadPending=Array.isArray(s.road)&&s.road.length>0&&(s.road.length!==s.team.length||s.road.some((uid,i)=>s.team[i]!==uid));
            // Do not consume the review fingerprint while a fight/choice or the native
            // road roster is pending; the first safe tick must still see the new carrier.
            if(s.adv.battle||s.adv.pending||roadPending||p.candyTx||this.e.driver?.ownedDialog||this.e.automation?.owner||this.e.automation?.buddyTask||this.e.automation?.buffUI||this.e.automation?.state?.resourceTx||this.e.automation?.state?.autoBuffTx||this.e.automation?.state?.resourceBuffTx)return;
            const current=CHAPTERS.get(s.adv.chapter),fallback=current?.reg===p.context.reg?current:DATA.chapters.find(c=>c.reg===p.context.reg);
            const row=p.route?.reg===p.context.reg?p.route:fallback;
            const fingerprint=()=>JSON.stringify([row?.key||row?.id,p.context.reg,p.targets.map(t=>[t.uid,t.goal]),p.uids,s.autoSwitch!==false,rosterFingerprint(s)]);
            const profile=fingerprint(),last=this.teamReview;
            if(!repair&&last?.preparation===p&&last.profile===profile&&now-last.at<30000)return;
            const plan=planAdventureTeam({...s,team:p.uids},this.e.settings,required,{reg:p.context.reg,row,objective:'train',force:repair});
            if(plan.changed&&plan.uids.length){
                p.uids=plan.uids;this.e.telemetry.sample=null;p.routeCheck=0;p.routeProfile=null;
                this.e.log(`补练配队重评：${plan.reason}${plan.gain>0?` · 综合评分 +${Math.round(plan.gain*100)}%`:''}`);
            }
            this.teamReview={preparation:p,at:now,profile:fingerprint()};
        }
        reviewPreparation(s,p,now){
            const e=this.e;
            if(!['map','progress'].includes(p.context.kind)||!e.settings.autoTeam||e.settings.mode==='train'||p.phase==='exit'||p.phase==='travelFirst'||p.phase==='restore')return false;
            const roadPending=Array.isArray(s.road)&&s.road.length>0&&(s.road.length!==s.team.length||s.road.some((uid,i)=>s.team[i]!==uid));
            const prepared=p.uids.map(uid=>(s.mons||[]).find(mon=>mon.uid===uid)),identity=mon=>DATA.combat.singles[mon.id]||`${mon.id}:${+!!mon.shiny}`;
            const readyRosterValid=prepared.length>0&&prepared.every(mon=>mon&&teamEligible(s,mon,p.context.reg))&&new Set(prepared.map(identity)).size===prepared.length;
            const readyApplied=p.uids.length===s.team.length&&p.uids.every((uid,i)=>s.team[i]===uid);
            // A ready roster is a pending native transaction, not a new search target.
            // Keep it stable until applied; unavailable members still force replanning.
            if(p.resumeReady&&readyRosterValid&&(!readyApplied||roadPending))return false;
            if(s.adv.battle||s.adv.pending||roadPending||e.driver.teamTask||e.driver.ownedDialog||p.candyTx||e.automation?.owner||e.automation?.buddyTask||e.automation?.buffUI||e.automation?.state?.resourceTx||e.automation?.state?.autoBuffTx||e.automation?.state?.resourceBuffTx)return false;
            const context=rebuildPreparationContext(s,p.context);if(!context?.foes?.length)return false;
            const profile=JSON.stringify([context.key,e.settings.autoEvolve,s.adv.unlocked,s.autoSwitch!==false,s.team,p.uids,p.targets.map(t=>[t.uid,t.goal]),rosterFingerprint(s)]),last=this.preparationReview;
            if(last?.preparation===p&&last.profile===profile&&now-last.at<30000)return false;
            this.preparationReview={preparation:p,profile,at:now};
            const applied=p.uids.length===s.team.length&&p.uids.every((uid,i)=>s.team[i]===uid),assessment=preparationReadiness(s,e.settings,context,s.team),grew=this.trialGrew(s,p);
            p.assessment={ready:assessment.ready&&grew&&applied,reason:!applied?'等待目标队伍在治疗点实际上阵后重新评估':!grew?'上次试打战败，先补练获得可验证成长后再尝试':assessment.reason};
            if(assessment.fit)p.assessment.fit={turns:assessment.fit.turns,coverage:assessment.fit.coverage,deaths:assessment.fit.deaths};
            if(applied&&assessment.ready&&grew){
                p.earlyReady=true;p.returnReason='当前战力已足够尝试原任务，提前结束补练';this.setPhase(p,'restore',now);return true;
            }
            const plan=preparationPlan(s,e.settings,grew?context:{...context,forcePreparation:true});
            const targetKey=targets=>JSON.stringify(targets.map(t=>[t.uid,t.goal]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
            if(!plan.uids.length){if(p.resumeReady){e.failTask('准备上阵的队伍已不可用，当前地区没有可替换成员');return true;}p.selection=plan.selection;return false;}
            if(targetKey(plan.targets)===targetKey(p.targets)&&plan.uids.length===p.uids.length&&plan.uids.every((uid,i)=>p.uids[i]===uid)){p.selection=plan.selection;return false;}
            const pool=(s.mons||[]).filter(mon=>teamEligible(s,mon,context.reg)),desired=Math.min(100,context.level+e.settings.prepareMargin),future=pool.map(mon=>{
                const level=Math.max(mon.level,Math.min(desired,trainingCap(s,mon)));
                return e.settings.autoEvolve===false?{...mon,level}:projectEvolution(s,mon,level,now);
            }),oldIds=new Set(p.uids);
            const previous=planAdventureTeam({...s,mons:future,team:p.uids},e.settings,p.uids,{reg:context.reg,pool:future.filter(mon=>oldIds.has(mon.uid)),foes:context.foes,size:context.size,force:true});
            const burden=preparationCosts(s,pool,desired).burden(p.uids),oldScore=previous.score/(1+.16*burden.cost),next=plan.selection;
            const worthwhile=next?.ready||!p.targets.length||next&&(next.score>oldScore*1.08+.005&&next.quality>=previous.score*.9||next.cost<burden.cost*.75&&next.quality>=previous.score*.97);
            if(!worthwhile)return false;
            p.targets=plan.targets;p.uids=plan.uids;p.selection=next;p.capLimited=plan.capLimited;p.lastGrowth=now;p.growth=null;p.routeCheck=0;p.routeProfile=null;
            p.resumeReady=!plan.needed&&!plan.targets.length;this.teamReview=null;e.telemetry.sample=null;this.preparationReview=null;
            this.setPhase(p,'team',now);e.log(next?.ready?'发现无需额外补练的现成队伍，准备上阵后继续原任务':'补练计划重评：改用培养负担更低的队伍，保留原任务与预算');return true;
        }
        reviewDifficulty(s,p,now){
            const profile=trainingRouteFingerprint(s,p.uids),limit=p.routeLimit;
            if(Number.isFinite(p.routeCeiling)&&(!limit||now>=limit.until||limit.profile!==profile)){
                delete p.routeCeiling;delete p.routeLimit;
                // Keep each defeated map's cooldown even when the old blanket ceiling expires.
                this.e.log(limit?'补练队伍已成长或退避到期，重新评估高收益地图':'重新评估旧补练难度限制，保留战败地图避让');
            }
            return profile;
        }
        finish(s,p,now){
            const e=this.e;
            if(['map','progress'].includes(p.context.kind)){
                this.rememberReady(s,p.context,p.targets,!!p.earlyReady);
            }
            e.preparation=null;e.target=null;e.visit=null;e.telemetry.sample=null;e.driver.pendingMap=null;e.teamCheck=null;e.teamRetryAt=0;e.driver.recent?.clear();this.checked=null;
            e.zoneId=null;e.zoneStarted=null;e.driver.raid=null;e.raidProbe=false;e.raidReturn=null;this.preparationReview=null;
            e.status=p.returnReason||`补练完成，继续${p.context.label}`;e.log(e.status);
            if(p.resume.type==='raid'){e.raidReturn={reg:p.context.reg,boss:p.context.id,date:p.resume.date||parisDay()};e.raidProbe=true;e.raidProbeStarted=now;e.nextRaid=now;}
            else if(p.resume.row)e.travel(p.resume.row,now,p.resume.options||{});
            e.persist();
        }
        step(s,now){
            const e=this.e,p=e.preparation,d=e.driver;if(!p)return;
            e.lastProgress=now;
            // A PC transaction or a higher-priority service can own the UI for many
            // ticks. Charge the phase only for opportunities the coach actually had.
            const gap=now-(p.lastTick??now);
            if(gap>5000)p.phaseAt=Math.min(now,p.phaseAt+gap-1200);
            if(gap>60000){p.lastGrowth=now;if(p.candyAt)p.candyAt=now;if(p.roadWait)p.roadWait.at=now;}p.lastTick=now;
            const index=new Map((s.mons||[]).map(m=>[m.uid,m]));
            if(p.targets.some(m=>!index.has(m.uid))){e.failTask('补练目标已离开PC，请取回成员或重新规划任务');return;}
            for(const target of p.targets){const mon=index.get(target.uid);target.id=mon.id;target.goal=Math.min(target.goal,trainingCap(s,mon));}
            if(e.settings.autoTeam===false){
                if(p.targets.some(target=>index.get(target.uid).level<target.goal)&&this.manualTrainingWait(s,p.targets,p.context.reg,now))return;
                p.uids=[...(s.team||[])];p.originalTeam=[...(s.team||[])];
            }
            if(s.adv.paused){e.status='补练等待中：游戏已暂停，请在游戏内继续';p.lastGrowth=now;return;}
            if(p.candyTx&&this.candyPending(s,p,now))return;
            if(p.phase!=='train'){
                // Healing points apply the planned road roster as adventure advances.
                const healing=p.resumeReady&&p.uids.every((uid,i)=>uid===s.team[i])&&s.road?.length&&s.team.some((uid,i)=>uid!==s.road[i]);
                const progress=JSON.stringify([p.phase,$('.screen.active')?.id,s.adv.unlocked,s.team,s.road,
                    $('#map-root .rg.active')?.dataset.rg,$('#map-root .mp-row.sel')?.dataset.ch,s.adv.loops,
                    healing?[s.adv.chapter,s.adv.node,s.adv.runs,s.stats?.battles]:null]);
                if(progress!==p.uiProgress){p.uiProgress=progress;p.phaseAt=now;}
                if(now-p.phaseAt>120000){
                    const phase={team:'应用队伍',travel:'前往练级地图',travelFirst:'切换地区',exit:'退出活动',restore:'恢复原任务'}[p.phase]||p.phase;
                    e.failTask(`补练等待${healing?'治疗点应用队伍':phase}超过 2 分钟，页面和存档均无进展`);return;
                }
            }
            if(p.phase==='exit'){
                if(s.adv.tower||p.restartTower&&s.tower?.run){
                    if(!e.automation.raidPage('tower'))return;
                    if(d.click($('#tower-root [data-tw-quit]'),'补练前结束旧爬塔阵容'))e.automation.own('confirm','.modal',{match:/(放弃|放棄|结束|Abandon|Quit|Give up)/i});return;
                }
                if(s.adv.event?.raid){d.leaveRaid();return;}
                if(s.adv.zone||s.adv.league){
                    const row=preparationRoutes(s,e.settings,p,e.metrics,now).find(row=>s.adv.zone||row.id!==s.adv.chapter);
                    if(!row){e.failTask('没有可用于退出当前战斗的练级地图，请先手动结束该战斗');return;}
                    d.map(row,s);return;
                }
                e.driver.raid=null;this.setPhase(p,currentRegion(s)===p.context.reg?'team':'travelFirst',now);
            }
            if(p.context.kind==='progress'&&s.adv.unlocked>(p.frontier??p.context.id)&&p.phase!=='restore'){
                p.returnReason='补练期间原关卡已通过，继续推进后续主线';this.setPhase(p,'restore',now);
            }
            if(this.reviewPreparation(s,p,now)&&p.phase!=='restore')return;
            const applied=p.uids.length===s.team.length&&p.uids.every((uid,i)=>s.team[i]===uid)&&(!Array.isArray(s.road)||!s.road.length||s.road.length===s.team.length&&s.road.every((uid,i)=>uid===s.team[i]));
            if(p.phase!=='restore'&&p.resumeReady&&!applied){
                p.lastGrowth=now;e.telemetry.sample=null;
                if(p.uids.length!==s.team.length||p.uids.some((uid,i)=>s.team[i]!==uid)){this.team(s,p.uids,now);e.status='准备用现成战力继续原任务，等待队伍配置';}
                else{e.status='现成战力已配置，等待治疗点应用后继续原任务';d.nav('adventure');}return;
            }
            const complete=p.targets.every(m=>index.get(m.uid).level>=m.goal);
            if(complete&&p.phase!=='restore')this.setPhase(p,'restore',now);
            if(p.phase==='restore'){
                if(!['map','progress'].includes(p.context.kind)&&p.originalLocation?.reg!==currentRegion(s)){d.map(p.originalLocation,s);return;}
                const original=p.originalTeam.filter(uid=>index.has(uid)&&teamEligible(s,index.get(uid)));
                if((!['map','progress'].includes(p.context.kind)||!e.settings.autoTeam)&&original.length&&this.team(s,original,now))return;
                this.finish(s,p,now);return;
            }
            this.reconcile(s,p,now);
            const routeProfile=this.reviewDifficulty(s,p,now);
            if(currentRegion(s)!==p.context.reg&&p.phase==='train')this.setPhase(p,'travelFirst',now);
            if(p.phase==='train'&&(s.team.length!==p.uids.length||p.uids.some((uid,i)=>s.team[i]!==uid))){
                this.setPhase(p,'team',now);p.lastGrowth=now;p.growth=null;e.telemetry.sample=null;
            }
            if(p.phase==='team'){
                if(this.team(s,p.uids,now)){p.phaseAt=now;p.lastGrowth=now;return;}
                this.setPhase(p,'travel',now);
            }
            if(e.settings.progressCandy&&p.context.kind==='progress'&&p.phase!=='travelFirst'&&!p.candyDisabled&&this.candy(s,p,now))return;
            if(p.phase==='travel'||p.phase==='travelFirst'){
                const routes=preparationRoutes(s,e.settings,p,e.metrics,now),row=routes[0];
                if(!row){
                    if(Object.values(p.avoid).some(until=>until>now)){e.status='补练地图暂时退避，等待后重试';p.phaseAt=now;p.lastGrowth=now;return;}
                    e.failTask('目标地区暂无可进入的补练地图，请先解锁或切换地区');return;
                }
                e.status=`补练前往 ${row.name}${row.fallback?' · 起步地图自动重试':''}`;
                if(d.map(row,s)){
                    if(p.phase==='travelFirst'){this.setPhase(p,'team',now);return;}
                    p.route=routeDescriptor(row);p.visit={at:now,deaths:totalDeaths(s,row)};p.routeCheck=now;p.routeProfile=routeProfile;e.telemetry.sample=null;this.setPhase(p,'train',now);
                }return;
            }
            const growth=p.targets.map(m=>{const mon=index.get(m.uid);return `${m.uid}:${mon.level}:${mon.xp||0}:${mon.rank||0}`;}).join('|');
            if(p.growth!==growth){p.growth=growth;p.lastGrowth=now;}
            const live=p.targets.map(m=>({...m,level:index.get(m.uid).level}));
            e.status=`先补练 · ${p.context.label} · ${live.map(m=>`${MONS.get(m.id)?.name} ${m.level}/${m.goal}`).slice(0,4).join('、')}`;
            if(now-p.lastGrowth>e.settings.prepareIdleMinutes*60000){e.failTask(`补练 ${e.settings.prepareIdleMinutes} 分钟没有目标经验增长，请检查等级上限、队伍和游戏状态`);return;}
            if(!p.route?.members?.includes(s.adv.chapter)){this.setPhase(p,'travel',now);e.telemetry.sample=null;return;}
            const roadPending=Array.isArray(s.road)&&s.road.length>0&&(s.road.length!==s.team.length||s.road.some((uid,i)=>uid!==s.team[i]));
            if(roadPending){
                e.telemetry.sample=null;p.lastGrowth=now;e.status+=' · 等待治疗点上阵';
                const key=JSON.stringify([s.team,s.road]);
                if(p.roadWait?.key!==key)p.roadWait={key,at:now};
                if(now-p.roadWait.at>=e.settings.prepareIdleMinutes*60000){
                    const alternative=preparationRoutes(s,e.settings,p,e.metrics,now).find(row=>!row.members.includes(s.adv.chapter));
                    if(alternative&&(p.roadRepairs||0)<2){
                        p.roadRepairs=(p.roadRepairs||0)+1;p.avoid[p.route.key]=now+e.settings.prepareIdleMinutes*60000;
                        p.roadWait=null;this.setPhase(p,'travel',now);e.log('新队伍迟未上阵，切换练级地图触发原生治疗点');return;
                    }
                    e.failTask('补练队伍等待治疗点应用超时，请检查原生行进队伍后继续');return;
                }
            }
            else{
                p.roadWait=null;p.roadRepairs=0;
                if(!e.telemetry.sample)e.telemetry.begin(s,p.route,e.settings,now);
                const sample=e.telemetry.observe(s,p.route,e.settings,now);if(sample?.valid)e.persist();
            }
            const safe=!s.adv.battle&&!s.adv.pending;
            if(safe&&totalDeaths(s,p.route)-(p.visit?.deaths||0)>=Math.min(2,e.settings.lossLimit)){
                const ceiling=Math.max(...p.route.members.map(id=>CHAPTERS.get(id)?.ace||1))-1;
                const alternatives=preparationRoutes(s,e.settings,{...p,routeCeiling:ceiling},e.metrics,now);
                if(alternatives.length){p.routeCeiling=ceiling;p.routeLimit={until:now+10*60000,profile:routeProfile};p.avoid[p.route.key]=now+10*60000;e.log(`${p.route.name}补练仍有战败，暂时降低难度，成长后重新评估`);this.setPhase(p,'travel',now);e.telemetry.sample=null;return;}
                p.visit.deaths=totalDeaths(s,p.route);e.log('当前只有一张起步练级地图，继续获取经验后重试');
            }
            if(safe&&!roadPending&&(p.routeProfile!==routeProfile||now-(p.routeCheck||0)>=30000)){
                p.routeCheck=now;p.routeProfile=routeProfile;
                const rows=preparationRoutes(s,e.settings,p,e.metrics,now),next=rows[0],current=rows.find(row=>row.key===p.route.key);
                if(next&&next.key!==p.route.key&&(!current||next.rate>current.rate*1.15)){
                    e.log(`补练效率重评：${p.route.name} → ${next.name} · ${Math.round(next.rate)} EXP/分钟`);
                    this.setPhase(p,'travel',now);e.telemetry.sample=null;return;
                }
            }
            if(safe&&!roadPending){
                if(e.automation.autoBuddy(s,now)){e.telemetry.sample=null;return;}
                if(e.automation.autoBuff(s,now,'train')){e.telemetry.sample=null;return;}
            }
            if(d.nav('adventure')&&s.adv.speed!==e.settings.speed)d.click($(`#speed-btns [data-speed="${e.settings.speed}"]`),'设置补练游戏速度');
        }
    }


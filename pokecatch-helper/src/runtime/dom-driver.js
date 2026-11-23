    const $ = selector => document.querySelector(selector);
    const $$ = selector => [...document.querySelectorAll(selector)];
    function visible(el) {
        if (!el || !el.isConnected || el.hidden || el.closest('[hidden],[inert]')) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > .05 && el.getClientRects().length > 0;
    }
    function enabled(el) { return visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }
    function highestShopCandy(s,cards,expected=shopCandyTier(s)){
        // An unlocked card still sets the tier if its price or button is unavailable.
        const shown=highestCandy(s,cards.filter(el=>!el.classList.contains('locked')).map(el=>({id:el.dataset.id,el})));
        return shown?.id===expected?shown:null;
    }
    function shopOffer(el) {
        const id=el.dataset.id,buy=el.querySelector('.buy'),one=el.querySelector('[data-n="1"]');
        const selected=el.querySelector('[data-n].on')?.dataset.n;
        const batch=!!one||selected!=null||DATA.automation.shop.some(row=>row.id===id&&row.qty);
        const single=!batch||!!one&&one.classList.contains('on')&&(selected==null||selected==='1');
        const total=parsePrice(batch?el.querySelector('.total')?.textContent:buy?.textContent);
        // Native Max prefixes its unit price with the current quantity, e.g. "×8 · 200 ₽ l'unité".
        const unitText=el.querySelector('.unit')?.textContent?.split('·').at(-1);
        const unit=parsePrice(unitText),count=Number(selected);
        let cost=single?total:unit;
        if(single&&unit!=null&&unit!==total)cost=null;
        if(!single&&cost==null&&Number.isSafeInteger(count)&&count>0&&total!=null)cost=total/count;
        return {el,id,buy,one,single,cost:Number.isSafeInteger(cost)&&cost>0?cost:null};
    }
    function raidText(french,chinese){
        const lang=document.documentElement?.lang,dictionary=globalThis.window?.I18N;
        if(!lang||lang==='fr')return french;
        return dictionary?.[lang]?.[french]||(lang==='zh-Hans'&&chinese)||dictionary?.en?.[french]||french;
    }
    function safeRaidDeparture(s){
        const a=s.adv,b=a.battle;
        if(a.pending||a.event||a.zone||a.tower||a.league)return false;
        if(!b)return true;
        const node=a.nodes?.[a.node];
        return a.chapter<a.unlocked&&node?.type==='wild'&&!node.phenom&&!node.static&&b.kind==='wild'&&!b.raid&&
            !!b.enemies?.length&&b.enemies.every(mon=>MONS.has(mon.id)&&!MONS.get(mon.id).legend&&!mon.shiny&&captured(s,mon.id));
    }
    function monIdFrom(el) {
        if (!el) return null;
        for (const img of el.querySelectorAll('img')) {
            const id = Number(img.dataset.id) || Number(/\/(\d+)(?:[-.]|\/)/.exec(img.getAttribute('src') || '')?.[1]);
            if (MONS.has(id)) return id;
            const model = DATA.mons.find(m => (img.getAttribute('src') || '').includes('/' + m.key + '.'));
            if (model) return model.id;
        }
        const text = el.textContent;
        return DATA.mons.find(m => text.includes(m.name) || text.toLowerCase().includes(m.key))?.id || null;
    }

    class DOMDriver {
        constructor(engine) { this.e = engine; this.lastClick = 0; this.ownedDialog = null; this.pendingMap = null; this.raid = null; this.recent = new Map(); this.teamTask = null; this.navigation = null; }
        rememberTeam(key,value){
            if(typeof key!=='string'||!key)return;
            this.recent.delete(key);this.recent.set(key,value);
            let characters=0;
            for(const savedKey of this.recent.keys())characters+=savedKey.length;
            for(const savedKey of this.recent.keys()){
                if(this.recent.size<=1||this.recent.size<=80&&characters<=250000)break;
                this.recent.delete(savedKey);characters-=savedKey.length;
            }
        }
        click(el, label, pointer = false, resuming = false) {
            const handoff=this.e.manual;
            if (!enabled(el) || !this.e.running&&!this.e.nurseryAssist?.idleAccess || handoff&&(!resuming||Date.now()<handoff.until||this.e.inputHeld||this.e.gameInputFocused?.()) || pageHidden() || Date.now() - this.lastClick < 700) return false;
            this.lastClick = Date.now();
            if (pointer) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0 }));
            el.click(); this.e.action = label; return true;
        }
        nav(screen) {
            if (visible($(`#screen-${screen}.active`))) {this.navigation=null;return true;}
            const tab = $(`#tabs [data-screen="${screen}"]`);
            if (tab?.classList.contains('locked') || tab?.classList.contains('hold')) {this.navigation=null;this.e.status=tab.dataset.why||'目标页面尚未开放，请满足游戏解锁条件';this.e.lastProgress=Date.now();return false;}
            if(!this.e.running&&!this.e.nurseryAssist?.idleAccess||this.e.manual||pageHidden())return false;
            const now=Date.now(),name={map:'进度',adventure:'冒险',raid:'团体战',team:'队伍 / PC',pension:'培育屋',underground:'地下通道',shop:'商店'}[screen]||screen;
            if(this.navigation?.screen!==screen)this.navigation={screen,name,started:now,attempts:0,nextAt:now};
            const task=this.navigation;
            if(now-task.started>=60000){
                this.navigation=null;
                if(this.e.nurseryAssist?.idleAccess)this.e.nurseryAssist.cancelIdle();
                else this.e.failTask(`无法打开${name}页面：入口缺失或切换未响应，请检查游戏页面后继续`);
                return false;
            }
            if(now<task.nextAt){this.e.status=`正在打开${name}，等待游戏页面响应`;return false;}
            const navigate=control=>{
                if(!enabled(control)){this.e.status=`${name}入口暂未显示，等待游戏页面恢复`;return false;}
                if(this.click(control,`打开${name}`)){task.attempts++;task.nextAt=now+Math.min(6000,1200*2**Math.min(3,task.attempts-1));}
                return false;
            };
            // Desktop hides the adventure tab; the visible chapter card forwards its
            // native click to that tab. On adventure itself the card opens the map,
            // so never use it while the adventure screen is already active.
            if(screen==='adventure'&&!visible(tab)&&!$('#screen-adventure.active')){
                const chapter=$('#side-chapter');
                if(enabled(chapter))return navigate(chapter);
            }
            const group=tab?.closest('.nav-grp'),header=group?.querySelector('.nav-grp-h');
            if(header?.getAttribute('aria-expanded')==='false'||tab?.closest('[inert]')){this.click(header,'展开游戏活动导航');return false;}
            return navigate(tab);
        }
        input(el, value, label) {
            if (!enabled(el) || !this.e.running || this.e.manual || pageHidden() || Date.now()-this.lastClick<700) return false;
            this.lastClick=Date.now(); el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); this.e.action=label; return true;
        }
        drag(source, target, label) {
            if (!enabled(source) || !enabled(target) || !this.e.running || this.e.manual || pageHidden() || Date.now()-this.lastClick<700) return false;
            const a=source.getBoundingClientRect(),b=target.getBoundingClientRect(),pointer={bubbles:true,pointerId:927,pointerType:'mouse',isPrimary:true,button:0};
            const from={clientX:a.left+a.width/2,clientY:a.top+a.height/2},to={clientX:b.left+b.width/2,clientY:b.top+b.height/2};
            this.lastClick=Date.now();
            source.dispatchEvent(new PointerEvent('pointerdown',{...pointer,...from,buttons:1}));
            document.dispatchEvent(new PointerEvent('pointermove',{...pointer,clientX:from.clientX+8,clientY:from.clientY+8,buttons:1}));
            document.dispatchEvent(new PointerEvent('pointermove',{...pointer,...to,buttons:1}));
            document.dispatchEvent(new PointerEvent('pointerup',{...pointer,...to,buttons:0}));
            this.e.action=label; return true;
        }
        switchInBattle(s,now) {
            const e=this.e,b=s.adv.battle;
            if(!b||!helperSwitchEnabled(s,e.settings)||e.manual||FLOW_MODES.has(e.settings.mode)||this.teamTask||this.pendingMap||this.navigation||
                this.ownedDialog||!visible($('#screen-adventure.active'))||document.body.classList.contains('swap-mode'))return false;
            if(this.lastSwitchFoe&&b.foes?.includes(this.lastSwitchFoe))return false;
            const choice=battleSwitchCandidate(s,e.settings,now);
            if(!choice)return false;
            // Cross-check the save against the live arena before clicking. Between battles
            // the same rail also accepts clicks, but would only change party order there.
            const enemies=$$('#enemy-slot .enemy[data-uid]:not(.fainted):not(.fxclone)').filter(visible);
            const rows=$$('#team-rail .tr-row[data-uid]'),active=rows.filter(row=>row.classList.contains('active'));
            if(enemies.length!==1||enemies[0].dataset.uid!==choice.foe||active.length!==1||active[0].dataset.uid!==choice.lead)return false;
            const target=rows.find(row=>row.dataset.uid===choice.uid&&!row.classList.contains('ko'));
            const name=MONS.get(s.mons.find(mon=>mon.uid===choice.uid).id).name;
            if(!this.click(target,`战斗换人 · ${name} · ${choice.reason}`))return false;
            this.lastSwitchFoe=choice.foe;
            return true;
        }
        adventureTeam(s, now) {
            const task=this.teamTask; if(!task)return false;
            if(task.fitBasis){
                const b=task.fitBasis,e=this.e,pins=adventureTeamPins(s,task.members,e.settings,e.trainProtected);
                const destination=this.pendingMap?.row||(e.settings.mode!=='progress'&&e.target);
                const current=pokemonByUid(s),region=CHAPTERS.get(task.chapter)?.reg;
                if(!e.settings.autoTeam||b.epoch!==e.runId||b.sourceEpoch!==e.localSnapshot.sourceEpoch||task.chapter!==s.adv.chapter||destination&&!destination.members?.includes(task.chapter)||
                    e.settings.mode==='progress'&&b.frontier!==s.adv.unlocked||b.roamId&&b.roamId!==(destination?.roamId||roamingSettings(e.settings).roamId)||
                    !task.hasDragged&&b.party!==s.team.join('|')||b.policy!==adventureTeamPolicy(s,task.members,e.settings,pins)||b.roster!==rosterFingerprint(s)||
                    b.autoSwitch!==(s.autoSwitch!==false)||b.weatherKey!==adventureTeamWeatherKey(s,task.members,now)||
                    task.uids.some(uid=>!current.has(uid)||!teamEligible(s,current.get(uid),region))){
                    this.teamTask=null;e.teamCheck=null;return false;
                }
            }
            const fail=reason=>{this.e.log(`自动配队暂缓：${reason}`);this.e.teamRetryAt=now+5*60000;this.e.teamCheck=null;this.teamTask=null;this.nav('adventure');};
            if(s.adv.event||s.adv.zone||s.adv.tower||s.adv.league||!task.members.includes(s.adv.chapter)){this.teamTask=null;this.e.teamCheck=null;return false;}
            if(now-task.started>90000){fail('队伍页面操作超时，继续当前任务');return false;}
            const roster=pokemonByUid(s);
            if(task.uids.some(uid=>!roster.has(uid))){this.teamTask=null;this.e.teamCheck=null;return false;}
            const signature=s.team.join('|');
            if(task.pending){
                if(signature===task.pending.before&&now-task.pending.at<10000){this.e.status='冒险配队 · 等待游戏确认上一次拖放';this.e.lastProgress=now;return true;}
                delete task.pending;
            }
            const same=task.uids.length===s.team.length&&task.uids.every((uid,i)=>s.team[i]===uid);
            if(same){
                const search=$('#screen-team.active #pc-search');
                if(search&&task.searchBefore!==undefined&&search.value!==task.searchBefore){this.input(search,task.searchBefore,'恢复PC搜索');return true;}
                this.teamTask=null;this.e.telemetry.sample=null;
                if(this.e.target&&!task.routePlan)this.e.visit={started:now,deaths:totalDeaths(s,this.e.target),caught:dexStatus(s,this.e.settings).complete};
                this.e.status='冒险队伍已适配，等待游戏治疗点应用';
                this.e.log(`冒险队伍已适配${CHAPTERS.get(task.chapter)?.name}：${task.uids.map(uid=>MONS.get(roster.get(uid)?.id)?.name).join('、')}`);
                this.nav('adventure');return true;
            }
            if(!this.nav('team'))return true;
            if(task.searchBefore===undefined)task.searchBefore=$('#pc-search')?.value||'';
            this.e.status=`适配冒险队伍 · ${task.uids.filter((uid,i)=>s.team[i]===uid).length}/${task.uids.length}`;
            if(task.signature!==signature){task.signature=signature;task.attempts=0;}
            if(task.attempts>=3){fail('游戏未接受拖放，请检查队伍地区限制');return false;}
            const move=(source,target,label)=>{
                if(this.drag(source,target,label)){task.attempts++;task.hasDragged=true;task.pending={before:signature,at:now};}
                return true;
            };
            const slotNodes=()=>{const mini=$('#team-mini.show');return [...(mini?.children||$('#team-slots')?.children||[])];};
            const mismatch=task.uids.findIndex((uid,i)=>s.team[i]!==uid);
            if(mismatch>=0){
                const uid=task.uids[mismatch],oldIndex=s.team.indexOf(uid),mon=roster.get(uid);
                if(oldIndex>=0){const slots=slotNodes();return move(slots[oldIndex],slots[mismatch],'调整冒险队伍顺序');}
                const filters=$$('#pc-active [data-clear]').filter(enabled),other=filters.find(el=>el.dataset.clear!=='q');
                if(other){this.click(filters.find(el=>el.dataset.clear==='all')||other,'清除PC筛选以配置队伍');return true;}
                const search=$('#pc-search');if(!search){fail('找不到PC搜索框');return false;}
                if(search.value!==String(mon.id)){this.input(search,String(mon.id),`查找配队成员：${MONS.get(mon.id)?.name}`);return true;}
                const card=$$('#pc-grid .pc-cell[data-uid]').find(el=>el.dataset.uid===uid);
                if(!card){this.e.status='等待PC列表显示配队成员';return true;}
                const rect=card.getBoundingClientRect();
                if(rect.top<0||rect.bottom>innerHeight){card.scrollIntoView({block:'center'});return true;}
                // A PC drop replaces the occupant. Bring the newcomer onto the team
                // first, then reorder within the team so retained trainees stay on it.
                let destination=mismatch;
                if(task.uids.includes(s.team[mismatch])){
                    const outgoing=s.team.findIndex(member=>!task.uids.includes(member));
                    destination=outgoing<0?s.team.length:outgoing;
                }
                return move(card,slotNodes()[destination],`派出${MONS.get(mon.id)?.name}`);
            }else{
                const index=s.team.findIndex(uid=>!task.uids.includes(uid));
                if(index>=0)return move(slotNodes()[index],$('#pc-grid'),'移出多余冒险队员');
            }
            return true;
        }
        activeTeam(s) {
            if(!this.e.settings.optimizeRaid)return false;
            const raid=s.adv.event?.raid?s.adv.event:null,zone=s.adv.zone;if(!raid&&!zone)return false;
            if(zone?.elite)return false;
            const key=raid?`raid:${raid.date||parisDay()}|${raid.reg}|${raid.id}|${rosterFingerprint(s)}`:`zone:${zone.id}:${zone.elite||0}|${rosterFingerprint(s)}`;
            if(this.recent.has(key))return false;
            let edit;
            if(raid){
                if(!this.nav('raid'))return true;
                const page=$('#raid-root [data-raid-page="chroma"]');
                if(enabled(page)){this.click(page,'打开当前团体战配队');return true;}
                edit=$$('#raid-root .rc-card').find(el=>el.dataset.rc===raid.reg)?.querySelector('[data-raid-edit]');
            }else{
                if(!this.nav('map'))return true;
                const model=DATA.zones.find(z=>z.id===zone.id),reg=model&&$(`#map-root .rg.open[data-rg="${model.reg}"]`);
                if(reg&&!reg.classList.contains('active')){this.click(reg,'打开传说所在地区');return true;}
                const row=$(`#map-root .mp-row[data-ch="Z${zone.id}"]`);
                if(row&&!row.classList.contains('sel')){this.click(row,'选择当前传说战配队');return true;}
                const tab=$('#map-root [data-lz-view="zone"]:not(.on)');if(enabled(tab)){this.click(tab,'打开当前传说战');return true;}
                edit=$(`#map-root [data-lz-team="${zone.id}"]${zone.elite?`[data-lz-tier="${zone.elite}"]`:':not([data-lz-tier])'}`);
            }
            if(enabled(edit)){if(this.click(edit,'适配当前特殊战队伍'))this.ownedDialog={type:'team',key,optimized:false};return true;}
            this.rememberTeam(key,Date.now());this.e.log('当前特殊战没有可用配队入口，保留现有队伍');return false;
        }
        animations(s) {
            if(visible($('.lk-fx.lk-evo'))){
                this.e.status='等待在游戏中手动处理进化动画';
                this.e.lastProgress=Date.now();return true;
            }
            if (!this.e.settings.animations) return false;
            const skip = $$('.fx-skip:not([data-gone])').find(enabled);
            if (skip) return this.click(skip, '跳过过场动画', true);
            const selectors = ['.lk-fx:not(.lk-choice) .rc-tap', '.hatch-fx:not(.gift) .hx-tap'];
            const tap = selectors.flatMap(sel => $$(sel)).find(enabled);
            if (tap) return this.click(tap, '继续游戏动画', true);
            return false;
        }
        receipt(resuming=false) {
            // Fresh capture cards have a single acknowledgement action, not purchases or item use.
            const card = $('#modal-root.open .modal.dexcard-modal:has(.dc-new)');
            const buttons = card ? [...card.querySelectorAll('.modal-actions button')] : [];
            if (buttons.length === 1 && buttons[0].classList.contains('gold')) {
                const acknowledged=this.click(buttons[0], '确认新捕获宝可梦',false,resuming);
                if(acknowledged)this.giftReceipt=null;
                return acknowledged;
            }
            // A regional starter can already be registered from an earlier adventure.
            // Its receipt uses the same Dex card without the "new" badge.
            const expected=this.giftReceipt;
            if(!expected)return false;
            if(Date.now()-expected.at>120000){this.giftReceipt=null;return false;}
            const receipt=$('#modal-root.open .modal.dexcard-modal:has(.dexcard.v2)'),
                id=Number(receipt?.querySelector('.dc-head .dc-sum b')?.textContent?.trim()),
                actions=receipt?.querySelector('.modal-actions.solo');
            if(!receipt||id!==expected.id||!receipt.querySelector('.dc-top .dc-hero')||actions?.children.length!==1)return false;
            if(this.click(actions.querySelector('button.gold'),'确认已登记宝可梦的赠送结果',false,resuming)){
                this.giftReceipt=null;return true;
            }
            return false;
        }
        dismissInformation(s,resuming=false){
            if(!this.e.settings.dismissInfo)return false;
            const modal=$$('#modal-root.open .modal').filter(visible).at(-1);if(!modal)return false;
            const owner=this.e.automation.owner;
            if(owner&&['mon','coachCandy','buddy','evolution'].includes(owner.kind)&&modal.matches(owner.selector))return false;
            if(owner?.kind==='receipt'&&modal.matches(owner.selector))return false;
            // Close only native information cards; never infer approval from arbitrary button text.
            // The game shares dexcard-modal with ally pickers, bag, shops and settings.
            if((modal.matches('.mon-modal')||modal.matches('.dexcard-modal')&&modal.querySelector('.dexcard'))&&!modal.querySelector('.modal-actions button')){
                const close=modal.querySelector('.dc-x');
                if(enabled(close))return this.click(close,'关闭图鉴 / 宝可梦信息卡，继续原任务',false,resuming);
            }
            if(modal.matches('.dexcard-modal:has(.dc-new)'))return this.receipt(resuming);
            if(modal.matches('.ug-back,.tw-back')){
                const actions=[...modal.querySelectorAll('.modal-actions button')];
                if(actions.length===1&&actions[0].classList.contains('gold'))return this.click(actions[0],'确认已完成活动的奖励信息',false,resuming);
            }
            return false;
        }
        giftChoice(s) {
            const pending=s?.adv?.pending;
            const overlay=$$('.hatch-fx.gift,.lk-fx.lk-choice,#arena .berry-fx.item-choice').filter(visible).at(-1);
            if(!overlay)return null;
            const event=pending||s.adv.nodes?.[s.adv.node];
            const gift=event?.type==='gift'&&!s.adv.gifts?.[event.gift?.key]?event.gift:null;
            const balls=overlay.matches('.hatch-fx.gift'),items=overlay.matches('.item-choice');
            if(items&&!gift?.items?.length)return null;
            const slots=[...overlay.querySelectorAll(balls?'.gift-balls .gift-ball':items?'.ic-item':'.lk-slot')];
            const saved=gift?.choices||gift?.items||[];
            const isItem=items||balls&&slots.some(el=>el.classList.contains('gift-item'));
            const ids=slots.map(el=>{
                if(balls&&el.dataset.id)return isItem?el.dataset.id:Number(el.dataset.id);
                if(!isItem){
                    const sprite=el.querySelector('.lk-mon');
                    return sprite?.querySelector('img')?monIdFrom(sprite):null;
                }
                return el.querySelector('img')?.getAttribute('src')?.split('/').pop()?.split('.')[0]||null;
            });
            // LinkFx slots keep their native order. Use saved IDs only when visible
            // IDs agree, so a delayed previous gift cannot identify a new set of slots.
            const agrees=saved.length===ids.length&&ids.every((id,i)=>id==null||String(id)===String(saved[i]));
            const choices=agrees?ids.map((id,i)=>id??saved[i]):ids;
            const region=DATA.regions.find(({key})=>{
                const starter=regionalStarter(key);
                return starter&&(gift?.key===starter.key&&(!slots.length||agrees)||
                    starter.ids.length===choices.length&&starter.ids.every(id=>choices.includes(id)));
            });
            const starter=region&&regionalStarter(region.key);
            const savedOffer=gift&&gift.key!=='demo'&&agrees&&isItem===!!gift.items;
            let authorized=!!savedOffer;
            if(!authorized&&starter&&!s.adv.gifts?.[starter.key]&&(!pending||gift?.key===starter.key)&&event?.gift?.key!=='demo'&&
                starter.ids.length===choices.length&&starter.ids.every(id=>choices.includes(id))){
                const automation=this.e.automation;
                const entry=s.adv.chapter===region.start&&!s.adv.gifts?.[starter.key]&&(!s.team?.length||pendingRegionalStarter(s));
                const departure=$('#modal-root.open .dp-modal');
                authorized=entry||automation?.state?.departure?.reg===region.key||
                    !!(visible(departure)&&automation?.departureBannerMatches(departure,starter));
            }
            if(authorized&&starter&&!(this.observedGifts??=new WeakSet()).has(overlay)){
                // Manual confirmation may open an already-known Dex card before the next save.
                this.observedGifts.add(overlay);
                overlay.addEventListener('click',event=>{
                    if(!this.e.running||!enabled(event.target.closest?.('.gift-go,.lk-go')))return;
                    const selected=overlay.querySelector('.gift-ball.on,.lk-slot.pick.on');
                    const id=Number(selected?.dataset.id)||monIdFrom(selected?.querySelector('.lk-mon'));
                    if(starter.ids.includes(id))this.giftReceipt={id,at:Date.now()};
                },true);
            }
            return {overlay,kind:balls?'balls':items?'items':'link',reg:region?.key,slots,choices,authorized};
        }
        gift(s,scene=this.giftChoice(s)) {
            if(!scene||!this.e.settings.gifts)return false;
            const {overlay,kind,slots,choices,authorized}=scene;
            this.e.status='等待赠送界面就绪';
            if(!authorized||!choices.length||choices.some(id=>id==null)){
                if(slots.some(el=>el.matches('.ready,.pick')))this.e.status='请在游戏中确认赠送选项，选择后继续任务';
                return true;
            }
            if(kind==='balls'&&overlay.classList.contains('auto')){
                const tap=overlay.querySelector('.gift-tap');
                if(slots[0]?.classList.contains('on')&&this.click(tap,'领取游戏赠送',true)&&MONS.has(choices[0]))
                    this.giftReceipt={id:choices[0],at:Date.now()};
                return true;
            }
            const settings=this.e.settings;
            const missing=settings.mode==='dex'?dexStatus(s,settings).ids:null;
            const gateIds=missing?.size&&settings.dexSpecies?.length?[...missing]:settings.mode==='legend'&&this.e.lockedLegend?[this.e.lockedLegend]:[];
            const gated=gateIds.length?legendRequirements(s,gateIds):null;
            const desired=choices.find(id=>missing?.has(id))??choices.find(id=>gated?.wild.has(id))??choices.find(id=>MONS.has(id)&&!captured(s,MONS.get(id).root))??choices[0];
            const slot=slots[choices.indexOf(desired)],go=overlay.querySelector(kind==='balls'?'.gift-go':kind==='items'?'.ic-go':'.lk-go');
            const ready=kind==='balls'?slot.classList.contains('ready'):kind==='items'?overlay.classList.contains('ready'):slot.classList.contains('pick');
            if(!ready)return true;
            const name=MONS.get(desired)?.name||FOSSIL_NAMES[desired]||desired;
            this.e.status=`正在选择赠送 · ${name}`;
            if(!slot.classList.contains('on'))this.click(slot,`选择赠送 · ${name}`);
            else if(this.click(go,`确认赠送 · ${name}`)&&MONS.has(desired))this.giftReceipt={id:desired,at:Date.now()};
            return true;
        }
        clearLoops(s, keep = null) {
            const unwanted = (s.adv.loops || []).find(key => String(key) !== String(keep));
            if (unwanted === undefined) return true;
            if (!this.nav('map')) return false;
            const chapter = DATA.chapters.find(c => String(c.loop) === String(unwanted));
            if (!chapter) throw new Error('发现未知章节循环，请手动清理后重试');
            const reg = $(`#map-root .rg.open[data-rg="${chapter.reg}"]`);
            if (!reg) throw new Error('无法关闭未显示地区的循环，请手动清理后重试');
            if (!reg.classList.contains('active')) { this.click(reg, '切换地区，关闭其他循环'); return false; }
            const control = $$('#map-root [data-loop]').find(el => el.dataset.loop === String(unwanted));
            if (!control) throw new Error('找不到已有循环的控制按钮');
            this.click(control, '关闭其他章节循环'); return false;
        }
        map(row, s, options = {}) {
            if(this.e.holdWildShiny?.(s,Date.now()))return false;
            // Clear a previous native condition wait before inspecting the current controls.
            // Missing or hidden controls must use the normal UI timeout rather than wait forever.
            if(this.pendingMap?.row===row)delete this.pendingMap.waiting;
            if (!this.nav('map')) return false;
            if (!options.zone && !options.leaveZone && !options.restart && !this.clearLoops(s, row.key)) return false;
            const reg = $(`#map-root .rg.open[data-rg="${row.reg}"]`);
            if (!reg) throw new Error(`地图地区未解锁：${row.reg}`);
            if (!reg.classList.contains('active')) {
                this.click(reg, '切换地图地区'); return false;
            }
            // A region can share numeric chapter controls only after its click refreshes the list.
            const wanted = options.zone ? `Z${row.id}` : row.league ? 'L' : String(row.id);
            const list = $(`#map-root .mp-row[data-ch="${wanted}"]`);
            const multiZone=options.zone&&this.e.settings.mode==='legend'&&this.e.settings.legendIds?.length>1&&this.pendingMap?.row===row;
            // A locked prerequisite row has no data-ch. A timed closure still has a numbered button.
            if(options.zone&&!options.riddle&&!options.tier&&this.e.settings.mode==='legend'&&row.gate&&this.pendingMap?.row===row&&
                (list?.classList.contains('lz-seal')||!list&&$('#map-root .mp-row.lz-lock'))){
                const plan=legendRequirements(s,[row.id]);
                if(plan&&!plan.zones.has(row.id)){this.pendingMap.waiting={reason:row.condition,prerequisite:true};return false;}
            }
            if(!list&&multiZone){
                const start=DATA.regions.find(region=>region.key===row.reg)?.start;
                if($(`#map-root .mp-row[data-ch="${start}"]`))this.pendingMap.waiting={reason:'本地区地图尚未显示该入口'};
            }
            if (!list) return false;
            if((multiZone||options.gateElite)&&list.classList.contains('lz-closed')&&(!options.tier||options.gateElite)){
                this.pendingMap.waiting={reason:row.condition||'入口未开放'};return false;
            }
            if (list.classList.contains('locked') && !options.zone) return false;
            if (!list.classList.contains('sel')) { this.click(list, `选择${row.name}`); return false; }
            if (options.zone) {
                const zoneTab = $('#map-root [data-lz-view="zone"]:not(.on)');
                if (enabled(zoneTab)) { this.click(zoneTab, '打开传说战挑战面板'); return false; }
                const tier = options.tier || 0;
                const go = $(`#map-root .mp-go[data-zone="${row.id}"]${tier ? `[data-tier="${tier}"]` : ':not([data-tier])'}`);
                if (!enabled(go)) {
                    if(visible(go)&&(go.disabled||go.getAttribute('aria-disabled')==='true')){
                        const reason=go.textContent.trim()||$('#map-root .lz-cond')?.textContent.trim()||row.condition||'请在游戏中查看开放条件';
                        if(this.pendingMap?.row===row)this.pendingMap.waiting={reason:reason.slice(0,180)};
                        this.e.status=`等待${row.name}开放 · ${reason.slice(0,180)}`;this.e.lastProgress=Date.now();
                    }
                    return false;
                }
                if(options.riddle)return list.classList.contains('lz-seal')&&this.click(go,'阅读'+row.name+'的铭文');
                if(tier&&options.optimize&&this.e.settings.optimizeRaid){
                    const edit=$(`#map-root [data-lz-team="${row.id}"][data-lz-tier="${tier}"]`);
                    if(this.prepareEliteLegend(s,row,tier,edit,Date.now()))return false;
                }else if (!tier&&options.optimize) {
                    const key=`zone:${row.id}:0|${rosterFingerprint(s)}`;
                    const edit = $(`#map-root [data-lz-team="${row.id}"]:not([data-lz-tier])`);
                    if (!this.recent.has(key) && enabled(edit) && this.click(edit, '配置传说战队伍')) { this.ownedDialog = { type: 'team', key, optimized: false }; return false; }
                }
                if(this.e.ensurePrepared(s,battleContext(s,'zone',{id:row.id,reg:row.reg,level:row.level,tier}),{row:routeDescriptor(row),options},Date.now()))return false;
                return this.click(go, `挑战${row.name}`);
            }
            // The map remembers its elite tab across activities and region switches.
            if(row.league){const ordinary=$('#map-root [data-lg-view="league"]:not(.on)');if(enabled(ordinary)){this.click(ordinary,'切回普通联盟');return false;}}
            if(options.leaveZone){
                const go=$(`#map-root .mp-go[data-go="${row.league?'L':row.id}"]`);
                return this.click(go,options.leaveLabel||(s.adv.league?'退出精英联盟，返回'+row.name:'返回原章节，先处理通关日常'));
            }
            if(options.restart){
                if(s.adv.chapter!==row.id||!Number(s.adv.node))return false;
                const restart=$(`#map-root .mp-restart[data-restart="${row.id}"]`);
                return enabled(restart)?this.click(restart,`重新进入${row.name}，生成当前游荡遭遇`):false;
            }
            // Give the helper exclusive native looping; remember the previous set for restoration.
            const unwanted = $$('#map-root [data-loop][aria-checked="true"]').find(el => String(el.dataset.loop) !== row.key);
            if (unwanted) { this.click(unwanted, '关闭其他章节循环'); return false; }
            const loop = $$('#map-root [data-loop]').find(el => String(el.dataset.loop) === row.key);
            if (!loop) return false;
            if (loop.getAttribute('aria-checked') !== 'true') { this.click(loop, '启用目标地图循环'); return false; }
            const go = $(`#map-root .mp-go[data-go="${row.league ? 'L' : row.id}"]`);
            return this.click(go, `前往${row.name}`);
        }
        eliteLegendKey(s,context){
            return JSON.stringify([context.key,rosterFingerprint(s)]);
        }
        prepareEliteLegend(s,row,tier,edit,now){
            const e=this.e,context=legendEliteContext(s,row.id,tier,now),teamKey='zone:'+row.id;
            if(!context){e.failTask('无法核对当前精英首领的形态，请检查游戏版本和配队');return true;}
            const party=s.eventTeams?.[teamKey]||[],key=this.eliteLegendKey(s,context);
            if(this.legendElitePlan?.key!==key){
                const plan=e.evaluateTeamSearch(JSON.stringify([key,party]),legendEliteTeamSearch(s,context,true));
                if(!plan){
                    if(this.pendingMap?.row===row)this.pendingMap.started=now;
                    e.lastProgress=now;e.status='正在评估精英传说阵容 · '+context.label;
                    return true;
                }
                if(!plan.uids.length){e.failTask('当前地区没有符合条件的精英传说战队员');return true;}
                this.legendElitePlan={...plan,key};
            }
            const {uids,estimate}=this.legendElitePlan;
            if(uids.length===party.length&&uids.every((uid,i)=>uid===party[i]))return false;
            if(enabled(edit)&&this.click(edit,'配置队伍 · '+context.label)){
                this.ownedDialog={type:'legendEliteTeam',key,teamKey,zoneId:row.id,tier,uids,estimate,started:now,openingUntil:now+5000};
            }else if(!enabled(edit))e.status='等待精英传说战的专属队伍入口 · '+context.label;
            return true;
        }
        dialog(s) {
            const own = this.ownedDialog;
            if (!own) return false;
            if(own.type==='ally'&&own.key&&this.e.raidProbe&&this.raid&&this.confirmRaidLaunch(s,own))return true;
            if(own.type==='backgroundUnderTeam'){
                if(!visible($('#evt-pick'))){const task=this.e.services.underground;if(task)task.editorOpen=false;this.ownedDialog=null;return false;}
                own.started??=Date.now();return this.factoryTeam(s,own);
            }
            const teamDialog=['team','factoryTeam','eliteTeam','legendEliteTeam','underTeam'].includes(own.type);
            if(teamDialog&&!this.e.settings.optimizeRaid){this.ownedDialog=null;this.e.status='特殊战采用手动配队，请在游戏内完成队伍选择';return false;}
            const ownedRoot=teamDialog?$('#evt-pick'):own.type==='ally'?$('#modal-root.open .raid-dlg'):null;
            if(!visible(ownedRoot)){
                // The native modal queue can mount the picker after the launch click.
                if(own.openingUntil>Date.now()&&!s.adv?.event?.raid&&!visible($('#modal-root.open .modal'))&&!visible($('#evt-pick')))return true;
                if(own.type==='ally'&&own.key&&visible($('#evt-pick'))&&this.e.settings.optimizeRaid){
                    this.ownedDialog={type:'team',key:own.key,optimized:false};return true;
                }
                this.ownedDialog=null;return false;
            }
            own.started ||= Date.now();
            if(Date.now()-own.started>120000){this.ownedDialog=null;this.e.failTask('特殊战配队或盟友弹窗等待超时，请检查页面');return true;}
            if(this.e.raidProbe&&own.key?.startsWith('raid:')&&this.raid?.date&&this.raid.date!==parisDay()&&!s.adv?.event?.raid){
                const close=own.type==='team'?ownedRoot.querySelector('[data-evt-close]'):ownedRoot.querySelector('.dc-x');
                if(this.click(close,'关闭上一日团体战的选择窗口')){
                    this.ownedDialog=null;this.e.deferRaid('团体战已换日，重新检查今日目标');
                }
                return true;
            }
            if(teamDialog&&own.type!=='team')return this.factoryTeam(s,own);
            if (own.type === 'team') {
                if (!visible($('#evt-pick'))) { this.ownedDialog = null; return false; }
                if (!own.optimized) {
                    if (!enabled($('#evt-opt'))) throw new Error('队伍优化按钮不可用，请手动配置队伍');
                    if (this.click($('#evt-opt'), '使用游戏推荐队伍')) {own.optimized = true;own.started=Date.now();}
                    return true;
                }
                if (!$('#evt-team [data-uid]')) throw new Error('没有可出战的宝可梦，请先配置队伍');
                if (this.click($('#evt-pick [data-evt-close]'), '保存推荐队伍')) {
                    this.rememberTeam(own.key,Date.now());
                    this.e.log('特殊战队伍已按游戏推荐调整');this.ownedDialog = null;
                }
                return true;
            }
            if (own.type === 'ally') {
                const choices = $$('#modal-root.open .raid-dlg [data-pick]').filter(enabled);
                if (!choices.length) {
                    this.e.status='等待可选团体战同伴';
                    if(Date.now()-own.started>=10000&&this.click(ownedRoot.querySelector('.dc-x'),'暂无可用同伴，返回主任务')){
                        const now=Date.now(),day=this.raid?.date||parisDay(now);
                        if(this.raid?.reg)this.e.raidCooldown[day+'|'+this.raid.reg]=raidRetryAt(now,day);
                        this.ownedDialog=null;this.e.deferRaid('团体战同伴列表为空，10 分钟后再检查');
                    }
                    return true;
                }
                const bots = s.raids?.bots?.[this.raid?.reg] || [];
                const offers = Array.isArray(bots) ? bots : Object.values(bots);
                const offersByKey=new Map();
                for(const bot of offers)if(!offersByKey.has(bot.key))offersByKey.set(bot.key,bot);
                const available=new Set(choices.map(el=>el.dataset.pick)),index=new Map((s.mons||[]).map(m=>[m.uid,m]));
                const baseline=(s.eventTeams?.[`raid:${this.raid?.reg}`]||[]).map(uid=>index.get(uid)).filter(Boolean);
                for(const key of s.raids?.pick?.[this.raid?.reg]||[])if(key&&!available.has(key))baseline.push(...(offersByKey.get(key)?.mons||[]));
                const scoreTeam=raidAllyScorer(this.raid?.boss,baseline);
                let bestChoice=null,bestScore=0;
                for(const el of choices){
                    const known = offersByKey.get(el.dataset.pick);
                    const mons = known?.mons || [...el.querySelectorAll('.rt-mon')].map(allyMemberFrom);
                    const score=scoreTeam(mons);
                    if(!bestChoice||score>bestScore){bestChoice=el;bestScore=score;}
                }
                if (this.click(bestChoice, '选择团体战盟友')) this.ownedDialog = null;
                return true;
            }
            return false;
        }
        confirmRaidLaunch(s,own){
            const modal=$('#modal-root.open .modal'),body=modal?.querySelector('.modal-body > p');
            if(!body||own.confirmed)return false;
            const launch=modal.querySelector('.modal-actions.duo button.primary'),cancel=modal.querySelector('.modal-actions.duo button.ghost');
            if(!launch||!cancel)return false;
            // Only the notice(s) emitted by the native daily raid launch may be accepted.
            const reroll=raidText('Une fois le raid lancé, tu ne pourras plus relancer le tirage du jour.','团体战开始后，就不能再重新抽取今天的团体战了。');
            const name=body.querySelector('b')?.textContent;
            const duplicate=name&&raidText("Tu as déjà {name} chromatique : s'il est capturé, il se changera en XP pour sa famille. Lancer le raid quand même ?",
                '你已经有异色的{name}了：捕获后会变成其家族的经验值。仍要开始团体战吗？').replace('{name}',name);
            const text=body.textContent.trim(),owned=duplicate&&(text===duplicate||text===reroll+duplicate);
            if(text!==reroll&&!owned)return false;
            if(this.raid.date!==parisDay()){
                if(this.click(cancel,'关闭上一日团体战的启动确认')){this.ownedDialog=null;this.e.deferRaid('团体战已换日，重新检查今日目标');}
            }else if(!safeRaidDeparture(s)){
                if(this.click(cancel,'先处理当前战斗或待选事件')){this.ownedDialog=null;this.e.deferRaid('保留当前战斗或待选事件，稍后再检查团体战');}
            }else if(owned&&this.e.settings.skipOwnedShiny){
                if(this.click(cancel,'已拥有今日异色，跳过团体战')){this.ownedDialog=null;this.e.deferRaid('原生游戏确认已拥有今日异色，按设置跳过');}
            }else if(this.click(launch,'确认开始每日团体战')){
                own.confirmed=true;own.openingUntil=Date.now()+5000;
            }
            return true;
        }
        factoryTeam(s,own){
            const now=Date.now(),background=own.type==='backgroundUnderTeam',under=background||own.type==='underTeam',desired=own.uids||[],teamKey=own.teamKey||'candy',current=s.eventTeams?.[teamKey]||[],search=$('#evt-search'),grid=$('#evt-pc'),sort=$('#evt-sort'),eff=$('#evt-eff');
            const elite=own.type==='eliteTeam',legend=own.type==='legendEliteTeam',facility=under?'地下探险':elite?'精英联盟':legend?'精英传说战':'糖果工厂';
            if(legend){
                const context=legendEliteContext(s,own.zoneId,own.tier,now);
                if(!context||s.adv.zone||this.pendingMap?.row.id!==own.zoneId||(Number(s.elite?.[own.zoneId]?.t)||0)+1!==own.tier||
                    own.key!==this.eliteLegendKey(s,context)){
                    if(this.click($('#evt-pick [data-evt-close]'),'首领或收藏已变化，重新评估精英队伍')){
                        this.ownedDialog=null;
                        if(this.pendingMap)this.pendingMap.started=now;
                    }
                    return true;
                }
                this.e.status='正在配置精英传说队伍 · '+context.label;
            }
            if(elite&&!this.e.automation.eliteEditorCurrent(s,own,now)){
                if(this.click($('#evt-pick [data-evt-close]'),'重新核对地区联盟队伍'))this.ownedDialog=null;
                return true;
            }
            const fail=reason=>{
                if(!background){this.e.failTask(reason);return true;}
                const task=this.e.services.underground;
                if(task){task.returning=true;task.teamReady=false;}
                if(!own.cancelled){own.cancelled=reason;this.e.log('后台地下配队暂缓：'+reason);}
                const close=$('#evt-pick [data-evt-close]');
                if(this.click(close,'关闭本次后台地下配队')){if(task)task.editorOpen=false;this.ownedDialog=null;this.e.persist();}
                return true;
            };
            if(background){
                own.started??=now;
                const task=this.e.services.underground,allowed=new Set(undergroundIdleMembers(s,this.e,now).map(mon=>mon.uid));
                if(own.cancelled)return fail(own.cancelled);
                if(!task||task.action!=='dispatch'||teamKey!==`under:${task.bay}`||desired.length!==3||new Set(desired).size!==3||desired.some((uid,i)=>!allowed.has(uid)||uid!==task.uids?.[i])||s.adv.pending||s.adv.event||s.adv.zone||s.adv.tower||s.adv.league)return fail('目标队员已被前台任务占用，保留主队后重新规划');
                if(now-own.started>90000)return fail('后台选队页面操作超时');
            }
            if(own.type==='underTeam'&&own.key!==this.e.automation.undergroundPlanKey(s,own.bay,own.floor,undergroundBayMembers(s,own.bay,now))){
                if(this.click($('#evt-pick [data-evt-close]'),'成员或主题已变更，重新规划地下队伍'))this.ownedDialog=null;
                return true;
            }
            if(!desired.length||desired.some(uid=>!(s.mons||[]).some(m=>m.uid===uid)))return fail(facility+'配队目标已离开PC，请重新规划');
            own.searchBefore??=search?.value||'';own.sortBefore??=sort?.value||'best';own.effBefore??=eff?.classList.contains('on')||false;
            const signature=current.join('|');
            if(own.pending){if(signature===own.pending.before){if(now-own.pending.at>10000)return fail(facility+'拖放配队未获存档确认，请检查游戏窗口');return true;}delete own.pending;if(!background)own.started=now;own.lookup=null;}
            const same=current.length===desired.length&&current.every((uid,i)=>uid===desired[i]);
            if(same){
                if(search&&search.value!==own.searchBefore){this.input(search,own.searchBefore,'恢复'+facility+'配队搜索');return true;}
                if(sort&&sort.value!==own.sortBefore){sort.value=own.sortBefore;sort.dispatchEvent(new Event('change',{bubbles:true}));return true;}
                if(eff&&eff.classList.contains('on')!==own.effBefore){this.click(eff,'恢复'+facility+'配队筛选');return true;}
                if(this.click($('#evt-pick [data-evt-close]'),'保存'+facility+'专属队伍')){
                    this.ownedDialog=null;
                    if(background){const task=this.e.services.underground;task.teamReady=true;task.editorOpen=false;this.e.log('后台地下安全队伍已配置，派遣前再次核对占用');this.e.persist();}
                    else if(elite)this.e.log('已确认'+this.e.automation.elitePlan.label+'专属队伍');
                    else if(legend){
                        if(this.pendingMap)this.pendingMap.started=now;
                        const {damage,turns,survivors}=own.estimate;
                        this.e.log('精英传说专属队伍已确认 · '+(damage>=1?`估算 ${turns} 回合，剩 ${survivors} 人`:`估算可削减首领 ${Math.floor(damage*100)}% 体力`));
                    }
                    else if(under)this.e.log('地下探险队伍已配置，将在出发前再次核对');
                    else{
                        this.rememberTeam(own.key,[...desired]);
                        this.e.log('糖果工厂队伍已按今日主题调整');
                    }
                }return true;
            }
            const slots=$$('#evt-team .slot[data-slot]'),index=desired.findIndex((uid,i)=>current[i]!==uid),uid=index>=0?desired[index]:current[desired.length];
            const target=index>=0?slots.find(el=>+el.dataset.slot===index):grid;
            let source=$$('#evt-team [data-uid]').find(el=>el.dataset.uid===uid)||$$('#evt-pc .pc-cell[data-uid]').find(el=>el.dataset.uid===uid);
            if(source&&target){
                const rect=source.getBoundingClientRect();if(rect.top<0||rect.bottom>innerHeight){source.scrollIntoView({block:'nearest'});return true;}
                own.pending={before:signature,at:now};
                if(!this.drag(source,target,'配置'+facility+'出战成员'))delete own.pending;return true;
            }
            // EventTeam search only accepts the current display language. Scan its native
            // virtualised PC with filters cleared, so French/English/Chinese all work.
            if(search?.value){this.input(search,'','清除'+facility+'配队搜索');return true;}
            if(eff?.classList.contains('on')){this.click(eff,'显示所有'+facility+'候选成员');return true;}
            if(sort&&sort.value!=='level'){sort.value='level';sort.dispatchEvent(new Event('change',{bubbles:true}));return true;}
            if(!grid)return fail('找不到'+facility+'选队PC，请重新打开配队窗口');
            if(own.lookup?.uid!==uid){own.lookup={uid,scanned:0};grid.scrollTop=0;grid.dispatchEvent(new Event('scroll',{bubbles:true}));return true;}
            const next=Math.min(grid.scrollHeight-grid.clientHeight,grid.scrollTop+Math.max(100,grid.clientHeight*.8));
            if(next<=grid.scrollTop+1)return fail(facility+'候选成员未出现在可用PC中，请检查地区和收藏');
            grid.scrollTop=next;grid.dispatchEvent(new Event('scroll',{bubbles:true}));own.lookup.scanned++;return true;
        }
        raidStep(s,now=Date.now()) {
            if(this.navigation?.screen==='raid'&&now-this.navigation.started>=60000&&!visible($('#screen-raid.active'))){
                this.e.deferRaid('团体战入口没有响应，稍后再检查',now);return false;
            }
            if (!this.nav('raid')) return false;
            const draw = $('#raid-root [data-raid-draw]');
            if (enabled(draw)) return this.click(draw, '抽取今日团体战');
            if (!$('#raid-root .rc-card')) {
                const chroma = $('#raid-root [data-raid-page="chroma"]');
                if (enabled(chroma)) return this.click(chroma, '打开每日异色团体战');
                if ($('#raid-root [data-p]')) {
                    this.e.deferRaid('异色团体战需要游戏内登录，稍后再检查',now);return false;
                }
                const empty=$('#raid-root .map-body > .pg-empty');
                if(empty?.textContent.trim()===raidText('Chargement…','加载中…')){this.e.status='等待游戏加载每日团体战';return false;}
                if(empty?.textContent.trim()===raidText('Raids indisponibles pour le moment.','团体战暂时不可用。')){
                    this.e.deferRaid('游戏暂未提供每日团体战，稍后再检查',now);return false;
                }
                const home=$('#raid-root [data-raid-page="home"]');
                if(enabled(home))return this.click(home,'返回活动首页，准备每日团体战');
                this.e.status = '团体战未解锁、未登录或今日目标尚未加载';
                return false;
            }
            const entries=$$('#raid-root .rc-card[data-rc]');
            let cards=entries.filter(card=>!card.classList.contains('done')&&enabled(card.querySelector('[data-raid-go]')));
            if(this.e.settings.mode==='raid'){
                const regions=this.e.settings.dailyRaidRegions;
                cards=RAID_CHAMPIONS.filter(c=>(!regions.length||regions.includes(c.reg))&&
                    (s.adv.unlocked>c.id||c.badges.some(b=>s.adv.badges?.includes(b))))
                    .map(c=>cards.find(entry=>entry.dataset.rc===c.reg)).filter(Boolean);
            }
            const day=parisDay(now),bossOf=card=>monIdFrom(card.querySelector('.boss'))||monIdFrom(card.querySelector('h3'));
            if(entries.length===1)this.e.rememberDraw(s,entries[0].dataset.rc,bossOf(entries[0]),now);
            let skippedOwned=false,skippedCooldown=false;
            const card = cards.find(card => {
                const reg=card.dataset.rc,boss=bossOf(card);
                const pending=this.e.daily?.raidPending;
                if(pending&&(pending.reg!==reg||pending.boss!==boss))return false;
                if(raidCaptureRecorded(s,reg,day,boss))return false;
                if(this.e.raidReturn&&(this.e.raidReturn.date!==day||this.e.raidReturn.reg!==reg||this.e.raidReturn.boss!==boss))return false;
                if ((this.e.raidCooldown[`${day}|${reg}`] || 0) > now){skippedCooldown=true;return false;}
                if(this.e.settings.skipOwnedShiny&&(card.querySelector('.chip-own')||s.dex?.[boss]?.shiny)){skippedOwned=true;return false;}
                return true;
            });
            if (!card) {
                const rest=this.e.raidDailyStatus(s,now);
                if(rest)this.e.deferRaid(rest.reason,now,0);
                else{
                    const displayedDone=entries.length>0&&entries.every(entry=>entry.classList.contains('done'));
                    if(this.e.daily&&this.e.raidProbe&&!this.e.raidReturn&&!skippedOwned&&!skippedCooldown&&now-this.e.raidProbeStarted<10000){
                        this.e.status=displayedDone?'等待异色团体战捕获记录同步':'等待异色团体战挑战按钮就绪';
                        return false;
                    }
                    const reason=skippedCooldown?'团体战目标仍在重试冷却中':skippedOwned?'已按设置跳过拥有的异色目标':this.e.raidReturn?'补练前的团体战目标已不可用':displayedDone?'团体战页面显示已捕获，等待存档确认':'当前没有开放且可挑战的团体战';
                    this.e.deferRaid(reason,now);
                }
                return false;
            }
            const reg = card.dataset.rc, boss = bossOf(card);
            const sameRaid=this.raid?.reg===reg&&this.raid?.boss===boss&&this.raid?.date===day;
            this.raid = { reg, boss, date:day, started: sameRaid ? this.raid.started : now };
            const key = `raid:${day}|${reg}|${boss}|${rosterFingerprint(s)}`;
            const edit = card.querySelector('[data-raid-edit]');
            if (this.e.settings.optimizeRaid && !this.recent.has(key) && enabled(edit)) {
                if(!this.click(edit, '按团体战对手优化队伍'))return false;
                this.ownedDialog = { type: 'team', key, optimized: false, openingUntil:Date.now()+5000 };
                return true;
            }
            if(MONS.has(boss)&&this.e.ensurePrepared(s,battleContext(s,'raid',{id:boss,reg}),{type:'raid'},now)){
                this.e.raidCheckNote='优先团体战：正在为'+MONS.get(boss).name+'准备队伍';return false;
            }
            const go = card.querySelector('[data-raid-go]');
            // The game's launch control opens missing team/ally dialogs in sequence.
            if (this.click(go, '进入每日团体战')) {
                if ($('#evt-pick')?.classList.contains('open') || visible($('#evt-pick'))) {
                    this.ownedDialog=this.e.settings.optimizeRaid?{type:'team',key,optimized:false}:null;
                    if(!this.e.settings.optimizeRaid)this.e.status='请手动配置团体战队伍，或开启优化特殊战队伍';
                }
                else this.ownedDialog = { type: 'ally',key,openingUntil:Date.now()+5000 };
                return true;
            }
            return false;
        }
        leaveRaid(label='达到时限，退出团体战') {
            if (!this.nav('raid')) return false;
            const leave = $('#raid-root [data-raid-leave]');
            if (enabled(leave)) return this.click(leave, label);
            const page = $('#raid-root [data-raid-page="chroma"]');
            if (enabled(page)) this.click(page, '打开当前团体战，准备退出');
            return false;
        }
    }


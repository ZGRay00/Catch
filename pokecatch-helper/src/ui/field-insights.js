    function gameItemIcon(key){
        const icon=document.createElement('img');
        icon.className='game-item-icon';icon.src=GAME_UI_ICONS[key];icon.alt='';
        return icon;
    }
    function mountFieldInsights(root,engine,signal){
        const item=root.querySelector('#item-field-insight'),under=root.querySelector('#under-field-insight'),raid=root.querySelector('#raid-field-insight');
        const ledger=new RaidRerollLedger(engine.storage);
        const element=(tag,text,cls='')=>{
            const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;
        };
        function chooser(label,options){
            const wrap=element('label',label+' '),select=element('select','');
            select.setAttribute('aria-label',label);
            for(const [value,name] of options)select.append(panelOption(value,name));
            wrap.append(select);return {wrap,select};
        }
        const slotMenu=chooser('探险队伍',[]),targetMenu=chooser('查看掉落',[]);
        const tier=chooser('晶洞档位',GEODE_TIERS.map((name,i)=>[i,name]));
        const range=chooser('向后查看',[12,24,48].map(n=>[n,n+' 次']));
        const summary=element('p','','hint'),floors=element('ol','');
        const geodes=element('details',''),geodeText=element('p','','hint'),rolls=element('ol','');
        const crystalIcon=gameItemIcon('0');
        tier.wrap.prepend(crystalIcon);
        geodes.append(element('summary','未来晶洞 · 公式预测'),tier.wrap,range.wrap,geodeText,rolls);
        under.append(slotMenu.wrap,targetMenu.wrap,summary,floors,geodes);
        const roundTitle=element('strong','本轮掉落点'),roundNote=element('p','','hint'),roundRows=element('div','');
        item.append(roundTitle,roundNote,roundRows);
        let last,slotKey,targetKey,underKey,geodeKey,raidKey,roundKey,previousAccount;
        const nameOf=reg=>DATA.regions.find(r=>r.key===reg)?.name||reg;
        const wildPanel=root.querySelector('#wild-forecast'),wildCache={};
        let wildView=null;
        function showWildForecast(s,now){
            const hashes=gameBundleHashes(),bundle=hashes.size===1?[...hashes][0]:null;
            const f=wildShinyForecast(s,bundle,now,wildCache);
            const lines=[];
            if(f.error)lines.push(f.error);
            else{
                const estimate=n=>{
                    if(f.seconds===null)return '';
                    const minutes=n*f.seconds/60;
                    return minutes<0.1?' · 不足 0.1 分钟':' · 约 '+minutes.toLocaleString('zh-CN',{maximumFractionDigits:1})+' 分钟';
                };
                const target=n=>n===null?'未来 30,000 次内未找到':(n===1?'下次遭遇':'再遇 '+n.toLocaleString('zh-CN')+' 次')+estimate(n);
                lines.push('自然路闪　'+target(f.natural),'星桃果生效　'+target(f.berry));
                if(f.natural!==null&&f.natural===f.berry)lines.push('上述目标自然就会闪。仅吃果才闪的下一次为　'+target(f.berryOnly));
                const berry=f.remainingMs?'星桃果剩 '+Math.ceil(f.remainingMs/60000)+' 分钟':'星桃果未生效';
                lines.push(nameOf(f.region)+' · '+(f.complete?'完整图鉴加成 ×2':'基础闪率')+' · '+berry);
                if(f.remainingMs&&f.berry===f.berryOnly&&f.berry!==null&&f.seconds!==null&&f.berry*f.seconds*1000>=f.remainingMs)
                    lines.push('按当前速度，目标遭遇前这次果效预计会结束。');
                lines.push(f.seconds===null?'此路线缺少可估速的普通野生遭遇。':
                    '按本图 '+s.adv.speed+' 档速度连续挂机、每只一击击倒，平均 '+f.seconds.toFixed(1)+' 秒遇敌一次。');
                lines.push('只计普通野生遭遇。吃果目标要求遇敌时果效仍在。');
            }
            const view=lines.join('\n');
            if(view!==wildView){wildView=view;wildPanel.querySelector('.sub').replaceChildren(...lines.map(line=>element('p',line)));}
        }
        const rewardText=values=>values.map(([name,n])=>name+' ×'+n).join('、')||'暂无掉落';
        function options(menu,rows){
            const selected=menu.value;
            menu.replaceChildren(...rows.map(([v,t])=>panelOption(v,t)));
            if(rows.some(([v])=>String(v)===selected))menu.value=selected;
        }
        function showExpedition(s,now){
            const slots=Array.isArray(s?.under?.slots)?s.under.slots:[];
            const entries=slots.map((slot,i)=>[String(slot?.id??('bay-'+(slot?.bay??i)+'-'+slot?.start)),(slot?.bay??i)+1]);
            const signature=JSON.stringify(entries);
            if(slotKey!==signature){slotKey=signature;options(slotMenu.select,entries.map(([id,bay])=>[id,'第 '+bay+' 队']));}
            const index=entries.findIndex(([id])=>slotMenu.select.value===id),slot=slots[index];
            const result=slot?expeditionPreview(slot,now):{error:s?'当前没有已派遣的队伍':'等待读取游戏存档'};
            const choices=[['*','全部掉落'],...(result.planned||[]).map(([name])=>[name,name])],key=JSON.stringify(choices);
            if(key!==targetKey){targetKey=key;options(targetMenu.select,choices);}
            const wanted=targetMenu.select.value,rows=result.rows||[];
            const lines=rows.filter(row=>row.loot.length&&row.loot.some(v=>wanted==='*'||v.name===wanted));
            const first=lines.find(row=>!row.reached);
            const progress=result.error?'':result.current<result.from?'从第 '+result.from+' 层出发，本次尚未通过首层':
                '从第 '+result.from+' 层出发，已通过第 '+result.current+' 层';
            const status=result.error||(progress+' · '+(result.recalled?'已召回':now>=slot.end?'已归队':'探险中')+
                '。已走楼层记录：'+rewardText(result.earned)+'。本次派遣记录合计：'+rewardText(result.planned)+
                (first?'。下一处匹配掉落在第 '+first.floor+' 层':''));
            const labels=lines.map(r=>(r.reached?'已通过':'待到达')+' · 第 '+r.floor+' 层 · '+r.loot.map(v=>v.name+' ×'+v.n).join('、'));
            const view=JSON.stringify([status,labels]);
            if(view!==underKey){underKey=view;summary.textContent=status;floors.replaceChildren(...labels.map((t,i)=>element('li',t,lines[i].reached?'reached':'upcoming')));}
            if(!geodes.open)return;
            if(crystalIcon.getAttribute('src')!==GAME_UI_ICONS[tier.select.value])crystalIcon.src=GAME_UI_ICONS[tier.select.value];
            const source=nurseryRuntimeOptions(),preview=geodePreview(s,+tier.select.value,+range.select.value,source.bundle||source.build);
            const message=preview.error||('已开启 '+preview.opened+' 次 · 已核对游戏构建 '+GEODE_RULES.build+' · 下列结果为预测');
            const predictions=(preview.rows||[]).map(r=>'第 '+r.offset+' 次 · '+GEODE_TIERS[r.upgraded]+'晶洞 · '+(DATA.types[r.type]?.fr||r.type)+'属性'+GEODE_TIERS[Number(r.key.split(':')[1])]+'宝石');
            const seq=JSON.stringify([message,predictions]);
            if(seq!==geodeKey){geodeKey=seq;geodeText.textContent=message;rolls.replaceChildren(...predictions.map(t=>element('li',t)));}
        }
        function update(s,now,ui){
            last={s,ui};const ok=!!s?.adv&&engine.account===accountId(s);
            if(previousAccount!==engine.account){slotKey=null;targetKey=null;previousAccount=engine.account;slotMenu.select.replaceChildren();targetMenu.select.replaceChildren();}
            const r=ok&&engine.running&&engine.settings.mode==='item'&&engine.itemRound?.round;
            let itemSummary='';
            if(r){
                const goal=Number.isFinite(engine.startItems)?Math.max(0,itemCounter(s,r.id)-engine.startItems):null;
                itemSummary=(ITEMS.get(r.id)?.name||r.id)+' · '+(goal==null?'本轮 +'+r.observed:goal+'/'+engine.settings.itemQuantity);
            }
            if(!ui.folded&&ui.workspace==='tasks'&&engine.settings.mode==='item'){
                const points=r?.points||[],passed=points.filter(p=>p.index<r.index).length;
                const status=!r?(ok?'开始刷道具并进入地图后记录本轮机会':'等待读取游戏存档'):
                    '本轮 '+points.length+' 个机会 · 已过 '+passed+' 个 · '+(r.partial?'自观测起':'本轮')+'入账 +'+r.observed+
                    (r.ledger?'（游戏入账计数）':'（按库存增量估算）')+' · '+itemSummary;
                const rows=points.map(p=>'第 '+(p.index+1)+' 格 · '+p.kind+' · '+(p.index<r.index?'已过':p.index===r.index?'当前':'前方')+(p.gained?' · 同步入账 +'+p.gained:''));
                const sig=JSON.stringify([status,rows]);
                if(sig!==roundKey){
                    roundKey=sig;roundTitle.replaceChildren('本轮掉落点');
                    if(engine.settings.itemId?.startsWith('berry-'))roundTitle.prepend(gameItemIcon('berry'));
                    roundNote.textContent=status;roundRows.replaceChildren(...rows.map(t=>element('div',t,'sub')));
                }
            }
            if(!ui.folded&&ui.workspace==='activity'){
                if(wildPanel?.open)showWildForecast(ok?s:null,now);
                for(const id of ['casino-insight','party-history']){
                    const detail=root.querySelector('#'+id);
                    if(!detail?.open)continue;
                    let lines=['等待读取游戏存档'];
                    if(ok&&id==='casino-insight')lines=casinoSummary(s,engine.casinoReading);
                    if(ok&&id==='party-history'){
                        const chapter=CHAPTERS.get(s.adv.chapter);
                        if(chapter){
                            const row={key:String(chapter.loop),members:chapter.league?DATA.chapters.filter(c=>c.loop===chapter.loop).map(c=>c.id):[chapter.id]};
                            const records=partyHistory(engine.metrics,partyRunCondition(s,row,engine.settings,now));
                            const active=JSON.stringify(partyMons(s,s.road?.length?s.road:s.team).map(rosterCombatKey));
                            lines=[chapter.name+' · 相同天气、速度与增益的完整轮次',...records.map(r=>
                                (r.profile===active?'现队':'历史队伍')+' · '+r.names.join('、')+'｜'+r.runs+' 轮 · 平均 '+(r.seconds/r.runs).toFixed(1)+' 秒 · 失败 '+r.losses+' 次 · 观察到倒下 '+r.down+' 次 · 净 '+Math.round(r.net*60/r.seconds)+' ₽/分钟')];
                            if(!records.some(r=>r.profile===active))lines.splice(1,0,'现队尚无符合条件的完整轮次');
                        }
                    }
                    const body=detail.querySelector('.sub'),key=JSON.stringify(lines);
                    if(body.dataset.render!==key){body.dataset.render=key;body.replaceChildren(...lines.map(t=>element('p',t)));}
                }
            }
            const raidParent=raid.closest('details');
            // Observe the native card even when the assistant is folded, without opening the game screen.
            let observed=ok?engine.raidDraw:null;
            if(ok&&s.raids?.seen===parisDay(now)&&observed?.day!==s.raids.seen){
                const cards=document.querySelectorAll('#raid-root .rc-card[data-rc]');
                if(cards.length===1)observed={day:s.raids.seen,reg:cards[0].dataset.rc};
            }
            const record=ok?ledger.observe(s,observed,now):null;
            if(!ui.folded&&ui.workspace==='activity'&&(!raidParent||raidParent.open)){
                const row=record?.row,candidates=record?.candidates||[];
                const text=!record?'等待读取游戏存档':!record.from?'在游戏里查看今日首抽后显示重抽候选':
                    '今日首抽 '+nameOf(record.from)+' · '+(row?.to?'已重抽到 '+nameOf(row.to):
                        '候选 '+(candidates.map(nameOf).join('、')||'暂无其他地区')+
                        (row?.predicted?' · '+(candidates.length===1?'唯一候选 ':'同池历史推测 ')+nameOf(row.predicted):' · 样本不足或结论不唯一'));
                const past=record?.history||[],stat=record?'已提前记录预测的命中 '+record.hits+'/'+record.attempts+' · 仅统计重抽前留存的预测':'';
                const history=past.map(v=>v.day+' · '+nameOf(v.from)+' → '+nameOf(v.to)+(v.predicted?' · 事前推测 '+nameOf(v.predicted):' · 仅记录结果'));
                const key=JSON.stringify([text,stat,history]);
                if(key!==raidKey){
                    raidKey=key;const title=element('strong',text);title.prepend(gameItemIcon('ball'));
                    raid.replaceChildren(title,element('p',stat,'hint'),...history.map(t=>element('div',t,'sub')));
                }
            }
            if(!ui.folded&&ui.workspace==='activity'&&under.closest('details')?.open)showExpedition(ok?s:null,now);
            return {itemSummary};
        }
        function repaint(){if(last)update(last.s,Date.now(),last.ui);}
        window.addEventListener('storage',event=>{if(event.key===ledger.key){ledger.signature=null;repaint();}},{signal});
        for(const control of [slotMenu,targetMenu,tier,range])control.select.addEventListener('change',repaint);
        for(const detail of [under.closest('details'),raid.closest('details'),root.querySelector('#casino-insight'),root.querySelector('#party-history'),wildPanel,geodes])detail?.addEventListener('toggle',repaint);
        return {update};
    }

    function mountNurseryPanel(root,engine,{preferences={},save=()=>{},onChange=()=>{}}={}){
        const box=document.createElement('div');box.id='nursery-info';box.className='nursery-card';
        box.innerHTML=`<div class="nursery-heading"><div class="nursery-title"><h3>孵化器</h3><small id="nursery-rule-notice" role="status" hidden></small></div><span id="nursery-summary"></span></div>
            <div class="nursery-metrics"><div><b id="nursery-shiny">0</b>已确认在栏闪蛋<small id="nursery-estimated"></small></div><div><b id="nursery-ready">0</b>成熟待领</div><div><b id="nursery-native">—</b>累计孵化</div></div>
            <div id="nursery-eggs"></div>
            <div class="nursery-tools"><label><input type="checkbox" data-setting="autoEggs">自动收成熟蛋</label><button id="nursery-plan">配置繁殖任务</button></div>
            <div class="nursery-section-heading"><h3>寄养亲本</h3><span id="nursery-parent-summary"></span></div>
            <div id="nursery-parents"></div>
            <div id="nursery-laying" class="nursery-laying" hidden>
                <div><span>自然产蛋进度</span><b id="nursery-laying-time"></b></div>
                <progress id="nursery-laying-progress" aria-label="自然产蛋进度"></progress>
            </div>
            <div class="nursery-section-heading"><h3>闪光蛋预测</h3><span id="nursery-prediction-state"></span></div>
            <div class="nursery-next-card">
                <strong id="nursery-next"></strong><div id="nursery-forecast" class="sub"></div>
                <div id="nursery-feed" class="sub"></div>
            </div>
            <dl id="nursery-berry-plan" hidden><dt>最近一枚自然闪蛋</dt><dd id="nursery-natural"></dd><dt>最近一枚喂果才闪</dt><dd id="nursery-berry-only"></dd></dl>
            <details id="nursery-comparison" open>
                <summary>闪蛋清单</summary>
                <p class="hint" id="nursery-comparison-note"></p>
                <div id="nursery-comparison-grid"></div>
            </details>
            <div id="nursery-condition" class="hint"></div>
            <details id="nursery-rules"><summary>预测依据</summary><div id="nursery-basis" class="hint"></div><div id="nursery-scenarios" class="hint"></div></details>
            <div id="nursery-observed" class="sub"></div><div id="nursery-segment" class="hint"></div><div id="nursery-error" class="hint warn"></div>
            <label class="nursery-preference"><input id="nursery-hints" type="checkbox">标记游戏孵化器中的闪光蛋</label>
            <div class="actions"><button id="nursery-export">导出蛋统计</button><button id="nursery-reset">清空观测统计</button></div>
            <div class="hint">闪蛋统计从首次观测开始。清空后从当前孵化器重新计数。</div>
            <details><summary>最近孵化与观测</summary><div id="nursery-recent"></div><div id="nursery-events"></div></details>`;
        root.querySelector('#pane-eggs').appendChild(box);
        const nodes=new Map([...box.querySelectorAll('[id]')].map(node=>['#'+node.id,node]));
        const query=selector=>nodes.get(selector),hints=query('#nursery-hints');hints.checked=preferences.nurseryHints!==false;
        function write(selector,value){
            const node=query(selector),text=String(value);
            if(node.textContent!==text)node.textContent=text;
        }
        hints.onchange=()=>{preferences.nurseryHints=hints.checked;save();onChange();};
        query('#nursery-reset').onclick=()=>{try{engine.nurseryMonitor.reset(engine.read());}catch(error){engine.nurseryMonitor.error=error.message;}onChange();};
        query('#nursery-export').onclick=()=>{
            const data=engine.nurseryMonitor.ledger.snapshot(),report={format:'pokecatch-nursery-statistics',schema:1,version:VERSION,
                segment:{ordinal:data.segment.ordinal,startedAt:data.segment.startedAt,reason:data.segment.reason},nativeHatched:data.nativeHatched,stats:data.stats,current:data.current,
                recent:data.recent.map(({id,known,shiny,status,at})=>({id,known,shiny,status,at})),events:data.events};
            const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='pokecatch-egg-statistics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
        };
        function duration(ms){
            if(ms===null)return '时间待确认';
            const seconds=Math.ceil(ms/1000), minutes=Math.ceil(seconds/60);
            if(seconds<=0)return '成熟待领';
            if(seconds<60)return seconds+'秒';
            if(minutes<60)return minutes+'分钟';
            return Math.floor(minutes/60)+'时'+(minutes%60?minutes%60+'分':'');
        }
        function name(id){return MONS.get(id)?.name||'未知物种';}
        function percent(rate){return (rate*100).toLocaleString('zh-CN',{maximumFractionDigits:3})+'%';}
        function label(tag,text,className){
            const node=document.createElement(tag);node.textContent=text;
            if(className)node.className=className;
            return node;
        }
        function eggEvidence(row){
            if(row.certainty==='saved')return '存档已记录';
            if(row.certainty==='deterministic')return row.source==='legacy'?'按旧蛋标识确定':'按蛋序号确定';
            if(row.reason===NURSERY_UNVERIFIED_REASON)return '';
            const rate=row.rateVerified&&Number.isFinite(row.rate)?' · 机制闪率 '+percent(row.rate):'';
            return row.reason+rate;
        }
        let nativeHintStyle,nativeHintKey='';
        function hintCards(rows=[]){
            const confirmed=[],estimated=[];
            for(const row of rows){
                if(row.uid==null||String(row.uid)==='')continue;
                if(row.known&&row.shiny)confirmed.push(String(row.uid));
                else if(row.estimatedShiny)estimated.push(String(row.uid));
            }
            const key=confirmed.length||estimated.length?JSON.stringify([confirmed,estimated]):'';
            if(key===nativeHintKey)return;
            nativeHintKey=key;
            if(!nativeHintStyle){
                nativeHintStyle=document.createElement('style');nativeHintStyle.id='pokecatch-nursery-hints';
                (document.head||document.documentElement).appendChild(nativeHintStyle);
            }
            // Keep the mark outside the game's card markup so native morphing cannot erase it.
            const badge=(ids,text,line)=>{
                if(!ids.length)return '';
                const cards=ids.map(id=>`#pen-eggs .pen-egg[data-egg=${CSS.escape(id)}]`);
                return `${cards.join(',')}{position:relative;border-color:#e8b94e;outline:1px ${line} #e8b94e;outline-offset:-2px}
                    ${cards.map(card=>card+'::after').join(',')}{content:"${text}";position:absolute;right:4px;bottom:3px;padding:1px 4px;border-radius:4px;background:#382905;color:#fff1bb;font:600 10px/1.3 system-ui;white-space:nowrap;pointer-events:none;z-index:2}`;
            };
            nativeHintStyle.textContent=badge(confirmed,'✦ 闪蛋','solid')+badge(estimated,'预计闪蛋','dashed');
        }
        let forecastKey,forecast,scan,scanTimer,eggListKey,historyKey,parentKey,shownComparison;
        function renderParents(s,pool){
            const parents=query('#nursery-parents'),residents=Array.isArray(s.pension?.mons)?s.pension.mons:[];
            const key=JSON.stringify([pool.known,residents.map(row=>[row?.mon?.id,row?.mon?.shiny]),pool.parents]);
            write('#nursery-parent-summary',residents.length+' 只寄养 · '+pool.parents.length+' 只可抽中');
            if(parentKey===key)return;
            parentKey=key;
            const eligible=new Map(pool.parents.map(parent=>[parent.slot,parent]));
            parents.replaceChildren(...residents.map((resident,index)=>{
                const mon=resident?.mon;
                const parent=eligible.get(index+1),ditto=mon?.id===NURSERY_RULES.ditto;
                const row=label('div','','nursery-parent');
                row.append(label('span',(index+1)+' 号','nursery-slot'),
                    label('strong',(mon?.shiny===true||mon?.shiny===1?'✦ ':'')+name(mon?.id)),
                    label('small',ditto?'自然产蛋所需':parent?'产出 '+name(parent.eggId):pool.known?'未进入亲本池':'亲本待核对'));
                return row;
            }));
            if(!residents.length)parents.append(label('p','尚未寄养亲本。','hint'));
        }
        function renderComparisons(f){
            const section=query('#nursery-comparison'),grid=query('#nursery-comparison-grid');
            const hidden=!f?.active;
            if(section.hidden!==hidden)section.hidden=hidden;
            if(shownComparison===f)return;
            shownComparison=f;grid.replaceChildren();
            if(!f?.active)return;
            write('#nursery-comparison-note','按实际抽中的亲代分组。喂果才闪的蛋，须在该蛋产出前喂靛莓果。');
            for(const rule of f.comparisons){
                const group=label('section','','nursery-scenario');
                group.dataset.berry=String(rule.berry);
                const heading=label('div','','nursery-scenario-heading');
                const shownRate='1/'+Math.round(1/rule.rate);
                const rate=rule.berry?'1/'+Math.round(1/rule.baseRate)+' → '+shownRate:shownRate;
                heading.append(label('strong',rule.label),label('span',rate,'nursery-rate'));
                const list=label('ol','','nursery-predictions');
                for(const hit of rule.hits){
                    const entry=label('li','');
                    const offset=hit.position===1?'下一枚':(hit.position-1)+' 枚后';
                    const body=label('span','');
                    body.append(label('b',offset),label('small',hit.parent.slot+' 号位 '+name(hit.parent.id)+' → '+name(hit.eggId)));
                    entry.append(body,label('code','k='+hit.k));list.append(entry);
                }
                if(!rule.hits.length)list.append(label('li','前 '+f.scanned+' 枚未找到。'));
                group.append(heading,list);grid.append(group);
            }
        }
        const visiblePanel=()=>!box.closest('[hidden]')&&!root.querySelector('.panel').classList.contains('hidden')&&!document.hidden;
        function cancelScan(){
            clearTimeout(scanTimer);scanTimer=null;
            if(scan){scan=null;forecastKey=null;}
        }
        document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelScan();});
        window.addEventListener('pagehide',cancelScan);
        function advance(){
            if(!visiblePanel()){cancelScan();return;}
            const deadline=performance.now()+3;
            do{
                const step=scan.next();
                if(step.done){forecast=step.value;scan=null;return;}
            }while(performance.now()<deadline);
            scanTimer=setTimeout(()=>{
                scanTimer=null;advance();
                if(forecast&&!scan)onChange();
            },16);
        }
        return{render(s,now=Date.now()){
            box.classList.toggle('hidden',!s?.adv);if(!s?.adv){cancelScan();hintCards();return null;}
            const detailsVisible=visiblePanel();
            if(!detailsVisible)cancelScan();
            const monitor=engine.nurseryMonitor;
            // New saves are already observed by Engine.read. Only reconciliation or a visible history needs a second pass.
            const sameAccount=accountId(s)===engine.account;
            if(detailsVisible||monitor.ledger.dirty||monitor.ledger.pending.length||monitor.ledger.credits.length)monitor.observe(s,now,false);
            const ledger=sameAccount&&detailsVisible?monitor.ledger:null;
            const markNative=hints.checked&&Array.isArray(s.pension?.eggs)&&s.pension.eggs.length>0;
            if(!detailsVisible&&!preferences.folded&&!markNative){hintCards();return null;}
            const options={...nurseryRuntimeOptions(),now,forecast:false,estimateUnverifiedEggs:true},snap=nurserySnapshot(s,options);
            hintCards(markNative?snap.eggRows:[]);
            if(!detailsVisible)return snap;
            const verified=NURSERY_RULES.compatibleBuilds.includes(options.build),notice=query('#nursery-rule-notice');
            if(notice.hidden!==verified)notice.hidden=verified;
            write('#nursery-rule-notice',verified?'':'规则待核对 · 预测仅供参考');
            const unknownBundle=/^unverified:([a-f0-9]{10})$/.exec(options.build)?.[1];
            const noticeTitle=unknownBundle?'游戏程序包 '+unknownBundle+' 尚未核对':'';
            if(notice.title!==noticeTitle)notice.title=noticeTitle;
            const unknown=snap.counts.unknown-snap.counts.estimated;
            write('#nursery-summary',`占用 ${snap.counts.total}/${snap.capacity}${unknown?' · 待判 '+unknown:''}`);
            query('#nursery-plan').disabled=engine.running||!!engine.suspended||!sameAccount;
            // In older saves the native counter is initialized only when the next egg is laid.
            const laid=s.pension?.laid,counterKey=laid==null?[snap.hatched,Array.isArray(s.pension?.eggs)?snap.counts.total:null]:laid;
            const pool=nurseryParentPool(s);
            renderParents(s,pool);
            const key=JSON.stringify([options.build,nurserySeed(s),counterKey,Object.hasOwn(s.pension||{},'bx')?[s.pension.bx]:[],pool]);
            if(key!==forecastKey){
                cancelScan();forecastKey=key;forecast=null;
                scan=nurseryForecastSteps(s,{...options,estimateUnverified:true,compare:true});advance();
            }
            snap.forecast=forecast;
            write('#nursery-shiny',unknown&&!snap.counts.shiny?'待判':snap.counts.shiny);
            write('#nursery-estimated',snap.counts.estimated?'另预计 '+snap.counts.estimatedShiny+' 枚':'');
            write('#nursery-ready',snap.counts.ready);write('#nursery-native',snap.hatched??'—');
            const f=snap.forecast,next=f?.nextEgg,flash=f?.nextShiny;
            write('#nursery-prediction-state',!f?'计算中':f.active?'当前条件预测':'条件待确认');
            renderComparisons(f);
            if(!f){
                write('#nursery-next','正在计算当前亲本的闪蛋序列…');
                for(const id of ['forecast','scenarios','basis','feed'])write('#nursery-'+id,'');
                query('#nursery-berry-plan').hidden=true;
            }else{
                const nextLabel=next?`下一枚自然蛋 #${next.k} · ${name(next.eggId)}${next.shiny?' ✦ 闪光':' · 普通'} · 亲本槽 ${next.parent.slot}${next.bx?' · 靛莓果生效':''}`:'';
                const sequence=f.active?(flash?`第 ${flash.position} 枚自然蛋为闪蛋（${name(flash.eggId)}，编号 ${flash.k}）`:`已扫描 ${f.scanned} 枚自然蛋，未找到闪蛋`):'';
                const reference=f.certainty==='reference';
                let feed='';
                if(next&&f.known){
                    const effect=next.withoutBerryShiny?'无果也会闪':next.withBerryShiny?'需要靛莓果才会闪':'用靛莓果仍为普通';
                    feed=`下一枚 #${next.k} · ${effect}。`+(next.bx?'已记录待用靛莓果。':next.withBerryShiny&&!next.withoutBerryShiny?'现在可喂百变怪，须在这枚自然蛋产出前生效。':'');
                }
                write('#nursery-feed',feed);
                write('#nursery-next',next?(reference?'预计 · ':'按当前条件预测 · ')+nextLabel:'下一枚自然蛋暂无法预测 · '+f.reason);
                write('#nursery-forecast',f.active?(reference?'预计 · '+sequence:sequence):Number.isFinite(f.nextRate)?
                    '仅可估计单枚闪率 '+percent(f.nextRate)+'（按当前亲本池）':'');
                const windowLabel=row=>row?`第 ${row.position} 枚 · ${name(row.eggId)}（#${row.k}）`:`前 ${f.scanned} 枚未找到`;
                query('#nursery-berry-plan').hidden=!f.active;
                write('#nursery-natural',f.active?windowLabel(f.firstWithoutBerry):'');
                write('#nursery-berry-only',f.active?windowLabel(f.firstBerryOnly)+(f.known&&f.firstBerryOnly?
                    (f.firstBerryOnly.position===1?(f.pendingBerry?' · 已为下一枚备果':' · 就是下一枚'):
                        ` · 等下一枚编号变成 #${f.firstBerryOnly.k} 再喂`):''):'');
                const scenarios=f?.scenarios,position=scenario=>scenario?.nextShiny?'第 '+scenario.nextShiny.position+' 枚':'范围内未找到';
                const effect={'always-shiny':'普通亲本和异色亲本都会产出闪蛋','always-plain':'普通亲本和异色亲本都会产出普通蛋','depends':'仅抽到异色亲本时会产出闪蛋'}[next?.parentEffect];
                write('#nursery-scenarios',f.active?`${effect?'保持下一枚的蛋号和树果状态时，'+effect+'。 ':''}仅下一枚用果时，首枚闪蛋为${position(scenarios.berryNext)}。`:'');
                const buildBasis=options.launcherBuild?`启动器 ${options.launcherBuild} 沿用已核对的游戏程序 ${options.bundle}。`:
                    f.rateVerified?`游戏构建 ${options.build} 的蛋规则已核对。`:'';
                const counterBasis=f.counterSource==='native-initializer'?' 下一蛋号按游戏初始化规则取累计孵化数加现存蛋数。':'';
                write('#nursery-basis',buildBasis+counterBasis+' 已产蛋优先读存档标记。');
            }
            const progress=s.pension?.egg,savedGoal=s.pension?.eggGoal,condition=[];
            const goal=Number.isFinite(savedGoal)&&savedGoal>0?savedGoal:NURSERY_RULES.eggMs;
            const showLaying=!!f?.rateVerified&&pool.known&&pool.hasDitto&&pool.parents.length>0&&Number.isFinite(progress)&&progress>=0;
            query('#nursery-laying').hidden=!showLaying;
            if(showLaying){
                const bar=query('#nursery-laying-progress'),value=Math.min(progress,goal);
                if(bar.max!==goal)bar.max=goal;
                if(bar.value!==value||!bar.hasAttribute('value'))bar.value=value;
                const full=snap.counts.total>=snap.capacity;
                write('#nursery-laying-time',full?'等待空出蛋位':value===goal?'等待游戏产蛋':'预计还需 '+duration(goal-value));
                condition.push(`存档产蛋进度 ${Math.floor(value/60000)}/${Math.floor(goal/60000)} 分钟。`);
            }
            if(snap.counts.total>=snap.capacity)condition.push('孵化器已满，空出蛋位后才能收下新蛋。');
            else if(f?.active)condition.push(`下一枚预计进入 ${snap.counts.total+1} 号位。`);
            if(f?.active)condition.push('距离按自然产蛋次数计算。更换或调序亲本、使用靛莓果、赠蛋占号后会重算。');
            if(next?.eggId===351||snap.eggRows.some(row=>row.id===351))condition.push('飘浮泡泡的形态取决于实际孵出时的培育屋天气。');
            write('#nursery-condition',condition.join(' '));
            const eggs=query('#nursery-eggs'),listKey=JSON.stringify(snap.eggRows.map(row=>[row.uid,row.id,row.k,row.known,row.shiny,row.estimatedShiny,row.berryApplied,row.parentId,row.laidAt,row.hatchAt,eggEvidence(row),duration(row.remainingMs)]));
            if(listKey!==eggListKey){
                eggListKey=listKey;eggs.replaceChildren();
                if(!snap.counts.total)eggs.textContent='孵化器目前没有蛋。';
                for(const [index,row] of snap.eggRows.entries()){
                    const item=document.createElement('div');item.className='nursery-egg';item.dataset.shiny=String(row.known&&row.shiny);
                    const title=document.createElement('div'),basis=document.createElement('div'),time=document.createElement('span');
                    const colour=row.known?(row.shiny?'✦ 闪光':'普通'):row.certainty==='reference'?(row.estimatedShiny?'预计闪光':'预计普通'):'待判定';
                    title.textContent=(index+1)+' 号位 · '+name(row.id)+' · '+colour+(Number.isSafeInteger(row.k)&&row.k>=0?' #'+row.k:'');
                    const evidence=eggEvidence(row),berry=row.berryApplied===null?'用果标记待核对':row.berryApplied?'此蛋已带靛莓果':'此蛋未记录靛莓果';
                    basis.className='hint';basis.textContent=[evidence,berry,row.parentId?'亲本 '+name(row.parentId):''].filter(Boolean).join(' · ');
                    title.appendChild(basis);
                    if(!row.ready&&Number.isFinite(row.laidAt)&&row.hatchAt>row.laidAt){
                        const bar=document.createElement('progress');bar.max=row.hatchAt-row.laidAt;
                        bar.value=Math.max(0,bar.max-row.remainingMs);bar.setAttribute('aria-label',name(row.id)+'孵化进度');
                        title.appendChild(bar);
                    }
                    time.textContent=duration(row.remainingMs);item.dataset.ready=String(row.ready);item.append(title,time);eggs.appendChild(item);
                }
            }
            const stats=ledger?.stats;
            write('#nursery-observed',sameAccount&&stats?`本段新观测 ${stats.eggsObserved} 枚（闪 ${stats.shinyObserved} / 普通 ${stats.plainObserved} / 未知 ${stats.unknownObserved}）。本段已孵 ${stats.hatched} 枚（闪 ${stats.shinyHatched} / 普通 ${stats.plainHatched} / 闪色未知 ${stats.unknownHatched}）`:'账号发生变化，请刷新页面载入对应统计');
            const start=ledger?.segment.startedAt;
            write('#nursery-segment',ledger?`观测起点${Number.isFinite(start)?' '+new Date(start).toLocaleString('zh-CN'):'未留存'} · 第 ${ledger.segment.ordinal} 段${ledger.pending.length?' · 离巢待核对 '+ledger.pending.length+' 枚':''}`:'');
            write('#nursery-error',engine.nurseryMonitor.error);query('#nursery-reset').disabled=!sameAccount||!engine.mayPersist();query('#nursery-export').disabled=!sameAccount;
            const recentRows=ledger?.recent.slice(0,8)||[],eventsRows=ledger?.events.slice(0,8)||[];
            const keyHistory=JSON.stringify([recentRows.map(r=>[r.id,r.status,r.known,r.shiny,r.at]),eventsRows.map(r=>[r.at,r.text])]);
            if(keyHistory===historyKey)return snap;
            historyKey=keyHistory;
            const recent=query('#nursery-recent');recent.replaceChildren();for(const row of recentRows){const item=document.createElement('div');item.className='nursery-egg';item.dataset.shiny=String(row.status==='hatched'&&row.known&&row.shiny);item.textContent=(row.known&&row.shiny?'✦ ':'')+name(row.id)+' · '+(row.status==='hatched'?'已孵化'+(row.known?row.shiny?' / 闪光':' / 普通':' / 闪色待确认'):'离巢未获孵化确认')+' · '+new Date(row.at).toLocaleTimeString('zh-CN',{hour12:false});recent.appendChild(item);}
            const events=query('#nursery-events');events.replaceChildren();for(const event of eventsRows){const item=document.createElement('div');item.className='nursery-event';item.textContent=new Date(event.at).toLocaleTimeString('zh-CN',{hour12:false})+' '+event.text;events.appendChild(item);}return snap;
        }};
    }

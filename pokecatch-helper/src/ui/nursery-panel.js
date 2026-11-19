    function mountNurseryPanel(root,engine,{preferences={},save=()=>{},onChange=()=>{}}={}){
        const box=document.createElement('div');box.id='nursery-info';box.className='nursery-card';
        box.innerHTML=`<div class="nursery-heading"><h3>孵化器</h3><span id="nursery-summary"></span></div>
            <div class="nursery-metrics"><div><b id="nursery-shiny">0</b>在栏闪蛋</div><div><b id="nursery-ready">0</b>成熟待领</div><div><b id="nursery-native">—</b>累计孵化</div></div>
            <div id="nursery-eggs"></div>
            <div class="nursery-tools"><label><input type="checkbox" data-setting="autoEggs">自动收成熟蛋</label><button id="nursery-plan">配置繁殖任务</button></div>
            <h3>下一枚与闪蛋预测</h3><div id="nursery-next" class="sub"></div><div id="nursery-forecast" class="sub"></div>
            <dl id="nursery-berry-plan" hidden><dt>无果即闪</dt><dd id="nursery-natural"></dd><dt>仅用果才闪</dt><dd id="nursery-berry-only"></dd></dl>
            <div id="nursery-condition" class="hint"></div>
            <details id="nursery-rules"><summary>预测依据与亲本对照</summary><div id="nursery-basis" class="hint"></div><div id="nursery-scenarios" class="hint"></div></details>
            <div id="nursery-observed" class="sub"></div><div id="nursery-segment" class="hint"></div><div id="nursery-error" class="hint warn"></div>
            <label class="nursery-preference"><input id="nursery-hints" type="checkbox">标记游戏孵化器中的闪光蛋</label>
            <div class="actions"><button id="nursery-export">导出蛋统计</button><button id="nursery-reset">清空观测统计</button></div>
            <div class="hint">闪蛋统计从首次观测开始。清空后从当前孵化器重新计数。</div>
            <details><summary>最近孵化与观测</summary><div id="nursery-recent"></div><div id="nursery-events"></div></details>`;
        root.querySelector('#pane-eggs').appendChild(box);
        const style=document.createElement('style');style.textContent='.nursery-card{border:1px solid #3c4c62;border-radius:11px;padding:9px 10px;background:#172335}.nursery-card>summary{color:#d4e4ed;font-size:12px}.nursery-card.has-shiny>summary{color:#ffe096}.nursery-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}.nursery-metrics>div{text-align:center;font-size:10px;background:#101b2b;border-radius:8px;padding:7px 3px}.nursery-metrics b{display:block;font-size:17px;color:#a6e4d1}.nursery-metrics>div:first-child b{color:#ffdb85}.nursery-egg{display:flex;justify-content:space-between;gap:6px;font-size:11px;padding:6px 0;border-bottom:1px solid #304157}.nursery-egg[data-shiny=true]{color:#ffdf91}.nursery-preference{font-size:11px;margin:9px 0}.nursery-egg span:last-child{text-align:right}.nursery-event{font-size:10px;margin:5px 0;color:#9aafc5}';root.appendChild(style);
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
        function eggEvidence(row){
            if(row.certainty==='saved')return '存档已记录';
            if(row.certainty==='deterministic')return row.source==='legacy'?'按旧蛋标识确定':'按蛋序号确定';
            const rate=Number.isFinite(row.rate)?' · '+(row.rateVerified?'机制闪率 ':'旧规则参考闪率 ')+percent(row.rate):'';
            return row.reason+rate;
        }
        function hintCards(container,rows){
            const wanted=new Map(rows.filter(row=>row.known&&row.shiny&&row.uid!=null).map(row=>[String(row.uid),row]));
            for(const card of container.querySelectorAll('.pen-egg[data-egg]')){
                const row=hints.checked&&wanted.get(card.dataset.egg),badge=card.querySelector('[data-pch-nursery-tag]');
                if(!row){if(card.hasAttribute('data-pch-shiny'))card.removeAttribute('data-pch-shiny');badge?.remove();continue;}
                if(card.dataset.pchShiny!=='1')card.dataset.pchShiny='1';
                const tag=badge||document.createElement('span'),title='✦ '+name(row.id);
                if(tag.textContent!==title)tag.textContent=title;
                if(!badge){tag.dataset.pchNurseryTag='';card.appendChild(tag);}
            }
            if(!document.getElementById('pokecatch-nursery-hints')){const css=document.createElement('style');css.id='pokecatch-nursery-hints';css.textContent='#pen-eggs [data-pch-shiny="1"]{position:relative;outline:2px solid #ffdc79;outline-offset:2px}#pen-eggs [data-pch-nursery-tag]{position:absolute;top:3px;left:3px;right:3px;padding:1px 3px;border-radius:4px;background:#352a14ef;color:#ffe6a0;font:10px/1.3 system-ui;pointer-events:none;white-space:normal;z-index:1}';(document.head||document.documentElement).appendChild(css);}
        }
        let forecastKey,forecast,scan,scanTimer,eggListKey,historyKey;
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
            box.classList.toggle('hidden',!s?.adv);if(!s?.adv){cancelScan();return null;}
            const detailsVisible=visiblePanel();
            if(!detailsVisible)cancelScan();
            const monitor=engine.nurseryMonitor;
            // New saves are already observed by Engine.read. Only reconciliation or a visible history needs a second pass.
            const sameAccount=accountId(s)===engine.account;
            if(detailsVisible||monitor.ledger.dirty||monitor.ledger.pending.length||monitor.ledger.credits.length)monitor.observe(s,now,false);
            const ledger=sameAccount&&detailsVisible?monitor.ledger:null;
            const nativeEggs=document.getElementById('pen-eggs');
            if(!detailsVisible&&!preferences.folded&&!nativeEggs)return null;
            const options={...nurseryRuntimeOptions(),now,forecast:false},snap=nurserySnapshot(s,options);
            if(nativeEggs&&!document.hidden)hintCards(nativeEggs,snap.eggRows);
            if(!detailsVisible)return snap;
            write('#nursery-summary',`占用 ${snap.counts.total}/${snap.capacity}${snap.counts.unknown?' · 待判 '+snap.counts.unknown:''}`);
            query('#nursery-plan').disabled=engine.running||!!engine.suspended||!sameAccount;
            // In older saves the native counter is initialized only when the next egg is laid.
            const laid=s.pension?.laid,counterKey=laid==null?[snap.hatched,Array.isArray(s.pension?.eggs)?snap.counts.total:null]:laid;
            const key=JSON.stringify([options.build,nurserySeed(s),counterKey,Object.hasOwn(s.pension||{},'bx')?[s.pension.bx]:[],nurseryParentPool(s)]);
            if(key!==forecastKey){
                cancelScan();forecastKey=key;forecast=null;
                scan=nurseryForecastSteps(s,{...options,estimateUnverified:true});advance();
            }
            snap.forecast=forecast;
            write('#nursery-shiny',snap.counts.shiny);write('#nursery-ready',snap.counts.ready);write('#nursery-native',snap.hatched??'—');
            const f=snap.forecast,next=f?.nextEgg,flash=f?.nextShiny;
            if(!f){
                write('#nursery-next','正在计算当前亲本的闪蛋序列…');
                for(const id of ['forecast','scenarios','basis'])write('#nursery-'+id,'');
                query('#nursery-berry-plan').hidden=true;
            }else{
                const nextLabel=next?`下一枚自然蛋 #${next.k} · ${name(next.eggId)}${next.shiny?' ✦ 闪光':' · 普通'} · 亲本槽 ${next.parent.slot}${next.bx?' · 靛莓果生效':''}`:'';
                const sequence=f.active?(flash?`第 ${flash.position} 枚自然蛋为闪蛋（${name(flash.eggId)}，编号 ${flash.k}）`:`已扫描 ${f.scanned} 枚自然蛋，未找到闪蛋`):'';
                const reference=f.certainty==='reference';
                write('#nursery-next',next?(reference?'旧规则参考 · ':'按当前条件预测 · ')+nextLabel:'下一枚自然蛋暂无法预测 · '+f.reason);
                write('#nursery-forecast',f.active?(reference?'预计 · '+sequence+' · 旧规则单枚参考闪率 '+percent(f.nextRate):sequence):Number.isFinite(f.nextRate)?
                    (f.rateVerified?'仅可估计单枚闪率 ':'旧规则单枚参考闪率 ')+percent(f.nextRate)+'（按当前亲本池）':'');
                const windowLabel=row=>row?`第 ${row.position} 枚 · ${name(row.eggId)}（#${row.k}）`:`前 ${f.scanned} 枚未找到`;
                query('#nursery-berry-plan').hidden=!f.active;
                const windowPrefix=reference?'参考 · ':'';
                write('#nursery-natural',f.active?windowPrefix+windowLabel(f.firstWithoutBerry):'');
                write('#nursery-berry-only',f.active?windowPrefix+windowLabel(f.firstBerryOnly)+(f.known&&f.firstBerryOnly?
                    (f.firstBerryOnly.position===1&&f.pendingBerry?' · 靛莓果已生效':' · 在这枚产出前用靛莓果'):''):'');
                const scenarios=f?.scenarios,position=scenario=>scenario?.nextShiny?'第 '+scenario.nextShiny.position+' 枚':'范围内未找到';
                const effect={'always-shiny':'普通亲本和异色亲本都会产出闪蛋','always-plain':'普通亲本和异色亲本都会产出普通蛋','depends':'仅抽到异色亲本时会产出闪蛋'}[next?.parentEffect];
                write('#nursery-scenarios',f.active?windowPrefix+`${effect?'保持下一枚的蛋号和树果状态时，'+effect+'。 ':''}首枚闪蛋对照 · 全普通亲本 ${position(scenarios.plainParents)}，全异色亲本 ${position(scenarios.shinyParents)}，仅下一枚用果 ${position(scenarios.berryNext)}。`:'');
                const buildBasis=options.launcherBuild?`启动器 ${options.launcherBuild} 沿用已核对的游戏程序 ${options.bundle}。`:
                    f.rateVerified?`游戏构建 ${options.build} 的蛋规则已核对。`:`当前构建 ${options.build} 尚未核对，参考预测沿用 ${NURSERY_RULES.build} 的规则。`;
                const counterBasis=f.counterSource==='native-initializer'?' 下一蛋号按游戏初始化规则取累计孵化数加现存蛋数。':'';
                write('#nursery-basis',buildBasis+counterBasis+' 已产蛋优先读存档标记。');
            }
            const progress=s.pension?.egg,condition=[`孵化器 ${snap.counts.total}/${snap.capacity} · 寄养 ${s.pension?.mons?.length||0} 只。`];
            if(f?.rateVerified&&f.hasDitto&&f.pool.length&&Number.isFinite(progress)&&progress>=0){
                const minutes=Math.floor(Math.min(progress,NURSERY_RULES.eggMs)/60000);
                condition.push(`存档产蛋进度 ${minutes}/${NURSERY_RULES.eggMs/60000} 分钟。`);
            }
            if(snap.counts.total>=snap.capacity)condition.push('孵化器已满，空出蛋位后才能收下新蛋。');
            else condition.push(`下一枚预计进入 ${snap.counts.total+1} 号位。`);
            if(f?.active)condition.push('距离按自然产蛋次数计算。更换或调序亲本、使用靛莓果、赠蛋占号后会重算。');
            if(next?.eggId===351||snap.eggRows.some(row=>row.id===351))condition.push('飘浮泡泡的形态取决于实际孵出时的培育屋天气。');
            write('#nursery-condition',condition.join(' '));
            const eggs=query('#nursery-eggs'),listKey=JSON.stringify(snap.eggRows.map(row=>[row.uid,row.id,row.k,row.known,row.shiny,eggEvidence(row),duration(row.remainingMs)]));
            if(listKey!==eggListKey){
                eggListKey=listKey;eggs.replaceChildren();
                if(!snap.counts.total)eggs.textContent='孵化器目前没有蛋。';
                for(const [index,row] of snap.eggRows.entries()){
                    const item=document.createElement('div');item.className='nursery-egg';item.dataset.shiny=String(row.known&&row.shiny);
                    const title=document.createElement('div'),basis=document.createElement('div'),time=document.createElement('span');
                    title.textContent=(index+1)+' 号位 · '+name(row.id)+' · '+(row.known?row.shiny?'✦ 闪光':'普通':'待判定')+(Number.isSafeInteger(row.k)&&row.k>=0?' #'+row.k:'');
                    basis.className='hint';basis.textContent=eggEvidence(row);title.appendChild(basis);
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

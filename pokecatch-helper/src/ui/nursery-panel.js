    function mountNurseryPanel(root,engine,{preferences={},save=()=>{},onChange=()=>{}}={}){
        const box=document.createElement('details');box.id='nursery-info';box.className='nursery-card';
        box.innerHTML='<summary id="nursery-summary">培育屋 · 闪蛋计数</summary><div class="nursery-metrics"><div><b id="nursery-shiny">0</b>当前闪蛋</div><div><b id="nursery-ready">0</b>成熟待领</div><div><b id="nursery-native">—</b>游戏累计孵化</div></div><div id="nursery-next" class="sub"></div><div id="nursery-forecast" class="sub"></div><div id="nursery-scenarios" class="hint"></div><div id="nursery-condition" class="hint"></div><div id="nursery-eggs"></div><div id="nursery-observed" class="sub"></div><div id="nursery-segment" class="hint"></div><div id="nursery-error" class="hint warn"></div><label class="nursery-preference"><input id="nursery-hints" type="checkbox">标记游戏孵化器中的闪光蛋</label><div class="actions"><button id="nursery-export">导出蛋统计</button><button id="nursery-reset">清空观测统计</button></div><div class="hint">首次只建立基线；历史闪蛋数不从图鉴反推。清空仅影响助手观测统计。预测按当前亲本和待用靛莓果计算，赠蛋会改变序号。</div><details><summary>最近孵化与观测</summary><div id="nursery-recent"></div><div id="nursery-events"></div></details>';
        root.querySelector('#execution-info').after(box);
        const style=document.createElement('style');style.textContent='.nursery-card{border:1px solid #3c4c62;border-radius:11px;padding:9px 10px;background:#172335}.nursery-card>summary{color:#d4e4ed;font-size:12px}.nursery-card.has-shiny>summary{color:#ffe096}.nursery-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}.nursery-metrics>div{text-align:center;font-size:10px;background:#101b2b;border-radius:8px;padding:7px 3px}.nursery-metrics b{display:block;font-size:17px;color:#a6e4d1}.nursery-metrics>div:first-child b{color:#ffdb85}.nursery-egg{display:flex;justify-content:space-between;gap:6px;font-size:11px;padding:6px 0;border-bottom:1px solid #304157}.nursery-egg[data-shiny=true]{color:#ffdf91}.nursery-preference{font-size:11px;margin:9px 0}.nursery-egg span:last-child{text-align:right}.nursery-event{font-size:10px;margin:5px 0;color:#9aafc5}';root.appendChild(style);
        const query=selector=>box.querySelector(selector),hints=query('#nursery-hints');hints.checked=preferences.nurseryHints!==false;
        hints.onchange=()=>{preferences.nurseryHints=hints.checked;save();onChange();};box.addEventListener('toggle',()=>{if(box.open)onChange();});
        query('#nursery-reset').onclick=()=>{try{engine.nurseryMonitor.reset(engine.read());}catch(error){engine.nurseryMonitor.error=error.message;}onChange();};
        query('#nursery-export').onclick=()=>{
            const data=engine.nurseryMonitor.ledger.snapshot(),report={format:'pokecatch-nursery-statistics',schema:1,version:VERSION,
                segment:{ordinal:data.segment.ordinal,startedAt:data.segment.startedAt,reason:data.segment.reason},nativeHatched:data.nativeHatched,stats:data.stats,current:data.current,
                recent:data.recent.map(({id,known,shiny,status,at})=>({id,known,shiny,status,at})),events:data.events};
            const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='pokecatch-egg-statistics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
        };
        function duration(ms){if(ms===null)return'时间待确认';const seconds=Math.ceil(ms/1000);return seconds<=0?'成熟待领':seconds<60?seconds+'秒':seconds<3600?Math.ceil(seconds/60)+'分钟':Math.floor(seconds/3600)+'时'+Math.ceil(seconds%3600/60)+'分';}
        function name(id){return MONS.get(id)?.name||'未知物种';}
        function hintCards(rows){
            if(typeof document==='undefined')return;
            const wanted=new Map(rows.filter(row=>row.known&&row.shiny&&row.uid!=null).map(row=>[String(row.uid),row]));
            for(const card of document.querySelectorAll('#pen-eggs .pen-egg[data-egg]')){
                const row=hints.checked&&wanted.get(card.dataset.egg),badge=card.querySelector('[data-pch-nursery-tag]');
                if(!row){card.removeAttribute('data-pch-shiny');badge?.remove();continue;}
                card.setAttribute('data-pch-shiny','1');const tag=badge||document.createElement('span');tag.dataset.pchNurseryTag='';tag.textContent='✦ '+name(row.id);if(!badge)card.appendChild(tag);
            }
            if(!document.getElementById('pokecatch-nursery-hints')){const css=document.createElement('style');css.id='pokecatch-nursery-hints';css.textContent='#pen-eggs [data-pch-shiny="1"]{position:relative;outline:2px solid #ffdc79;outline-offset:2px}#pen-eggs [data-pch-nursery-tag]{position:absolute;top:3px;left:3px;right:3px;padding:1px 3px;border-radius:4px;background:#352a14ef;color:#ffe6a0;font:10px/1.3 system-ui;pointer-events:none;white-space:normal;z-index:1}';(document.head||document.documentElement).appendChild(css);}
        }
        return{render(s,now=Date.now()){
            box.classList.toggle('hidden',!s?.adv);if(!s?.adv)return null;
            const ledger=engine.nurseryMonitor.observe(s,now),sameAccount=accountId(s)===engine.account;
            const options={...nurseryRuntimeOptions(),now,forecast:box.open&&!root.querySelector('.panel').classList.contains('hidden')&&!pageHidden()},snap=nurserySnapshot(s,options);
            query('#nursery-summary').textContent=`培育屋 · 闪蛋 ${snap.counts.shiny}/${snap.counts.total} · 待领 ${snap.counts.ready}${snap.counts.unknown?' · 待判 '+snap.counts.unknown:''}`;box.classList.toggle('has-shiny',snap.counts.shiny>0);
            if(!pageHidden())hintCards(snap.eggRows);
            if(!box.open)return snap;
            query('#nursery-shiny').textContent=snap.counts.shiny;query('#nursery-ready').textContent=snap.counts.ready;query('#nursery-native').textContent=snap.hatched??'—';
            const f=snap.forecast,next=f?.nextEgg,flash=f?.nextShiny;
            query('#nursery-next').textContent=next?`下一编号 K=${next.k} · 自然蛋：${next.shiny?'✦ 闪光':'普通'} · ${name(next.eggId)} · 亲本槽 ${next.parent.slot}${next.bx?' · 已有待用靛莓果':''}`:`下一自然蛋：${f?.reason||'展开时核对'}（蛋序号 ${snap.counter??'未知'}）`;
            query('#nursery-forecast').textContent=flash?`当前条件下，再产第 ${flash.position} 枚为闪蛋 · ${name(flash.eggId)} · K=${flash.k}`:f?.known?`接下来 ${f.scanned} 枚自然蛋内未找到闪蛋；不是保底倒计时。`:f?.reason||'等待可核对的繁殖状态';
            const scenarios=f?.scenarios,position=scenario=>scenario?.nextShiny?'第 '+scenario.nextShiny.position+' 枚':'范围内未找到';
            query('#nursery-scenarios').textContent=f?.known?`条件对照（非当前实况）：全普通亲代 ${position(scenarios.plainParents)}；全异色亲代 ${position(scenarios.shinyParents)}；下一颗使用靛莓果 ${position(scenarios.berryNext)}。`:'';
            const candy=(s.pension?.mons||[]).reduce((total,slot)=>total+(Number(slot.candy)||0),0);
            query('#nursery-condition').textContent=`孵化器 ${snap.counts.total}/${snap.capacity} · 寄养 ${s.pension?.mons?.length||0} 只 · 待领糖果 ${candy}${snap.counts.total>=snap.capacity?'；孵化器已满，先领取才可继续产蛋。':'。'}${f?.known?'预测假设亲本顺序不变且没有赠蛋占号；靛莓果只用于下一自然蛋。':''}`;
            const eggs=query('#nursery-eggs');eggs.replaceChildren();
            for(const row of snap.eggRows){const item=document.createElement('div');item.className='nursery-egg';item.dataset.shiny=String(row.known&&row.shiny);const title=document.createElement('span'),time=document.createElement('span');title.textContent=(row.known?row.shiny?'✦ ':'● ':'? ')+name(row.id)+(row.k!=null?' · K='+row.k:'');time.textContent=(row.known?row.shiny?'闪光 · ':'普通 · ':'未判定 · ')+duration(row.remainingMs);item.append(title,time);eggs.appendChild(item);}
            const stats=ledger?.stats;
            query('#nursery-observed').textContent=sameAccount&&stats?`本段新观测 ${stats.eggsObserved} 枚（闪 ${stats.shinyObserved} / 未知 ${stats.unknownObserved}）；孵化增量 ${stats.hatched}（已确认闪 ${stats.shinyHatched} / 普通 ${stats.plainHatched} / 待核对 ${stats.unknownHatched}）`:'账号发生变化，请刷新页面载入对应统计';
            query('#nursery-segment').textContent=ledger?`观测起点 ${new Date(ledger.segment.startedAt).toLocaleString('zh-CN')} · 第 ${ledger.segment.ordinal} 段${ledger.current.pendingDisappearances?' · 离巢待核对 '+ledger.current.pendingDisappearances+' 枚':''}`:'';
            query('#nursery-error').textContent=engine.nurseryMonitor.error;query('#nursery-reset').disabled=!sameAccount||!engine.mayPersist();query('#nursery-export').disabled=!sameAccount;
            const recent=query('#nursery-recent');recent.replaceChildren();for(const row of ledger?.recent.slice(0,8)||[]){const item=document.createElement('div');item.className='nursery-egg';item.dataset.shiny=String(row.status==='hatched'&&row.known&&row.shiny);item.textContent=(row.known&&row.shiny?'✦ ':'')+name(row.id)+' · '+(row.status==='hatched'?'已孵化'+(row.known?row.shiny?' / 闪光':' / 普通':' / 闪色待确认'):'离巢未获孵化确认')+' · '+new Date(row.at).toLocaleTimeString('zh-CN',{hour12:false});recent.appendChild(item);}
            const events=query('#nursery-events');events.replaceChildren();for(const event of ledger?.events.slice(0,8)||[]){const item=document.createElement('div');item.className='nursery-event';item.textContent=new Date(event.at).toLocaleTimeString('zh-CN',{hour12:false})+' '+event.text;events.appendChild(item);}return snap;
        }};
    }

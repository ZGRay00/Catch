    function mountWildForecastPanel(panel){
        panel.innerHTML=`<div class="nursery-card">
            <div class="nursery-heading"><h3>路闪预测</h3><span class="sub" data-wild="location"></span></div>
            <p role="status" data-wild="error"></p>
            <div data-wild="results" hidden>
                <p class="hint warn" data-wild="reference" hidden></p>
                <div class="wild-targets">
                    <div class="nursery-next-card"><h4>自然路闪</h4><strong data-wild="natural"></strong><div class="sub" data-wild="natural-time"></div><div class="sub" data-wild="natural-pure"></div></div>
                    <div class="nursery-next-card"><h4>星桃果路闪</h4><strong data-wild="berry"></strong><div class="sub" data-wild="berry-time"></div><div class="sub" data-wild="berry-pure"></div></div>
                </div>
                <p data-wild="overlap" hidden></p>
                <div class="nursery-section-heading"><h3>当前条件</h3></div>
                <dl class="decision-list"><dt>星桃果</dt><dd data-wild="buff"></dd><dt>地区闪率</dt><dd data-wild="odds"></dd><dt>遇敌速度</dt><dd data-wild="pace"></dd></dl>
                <p class="warn" data-wild="expiry" hidden>按当前速度，这次果效预计会在目标遭遇前结束。</p>
                <details><summary>预测依据</summary><p class="hint">只数从下一只普通野生宝可梦生成时算起。训练家、道馆、固定对手和游荡传说都不推进序号。当前地图按现有路线循环，从所在格算到目标出现。纯野战按连续遭遇、每只一击击倒估算，排除其他节点的耗时。换图后按新路线重算。</p></details>
            </div></div>`;
        const nodes=Object.fromEntries([...panel.querySelectorAll('[data-wild]')].map(el=>[el.dataset.wild,el]));
        const cache={};
        function write(key,value){if(nodes[key].textContent!==value)nodes[key].textContent=value;}
        function distance(n){return n===null?'30,000 只内未找到':'还需 '+n.toLocaleString('zh-CN')+' 只'+(n===1?'（下一只）':'');}
        function estimate(seconds){
            if(seconds===null)return '用时待估';
            const minutes=seconds/60;
            return minutes<0.1?'不足 0.1 分钟':'约 '+minutes.toLocaleString('zh-CN',{maximumFractionDigits:1})+' 分钟';
        }
        return (s,now)=>{
            const hashes=gameBundleHashes();
            const f=wildShinyForecast(s,hashes.size===1?[...hashes][0]:null,now,cache);
            nodes.results.hidden=!!f.error;nodes.error.hidden=!f.error;
            write('error',f.error||'');
            write('location',f.error?'':(DATA.regions.find(r=>r.key===f.region)?.name||f.region)+' · '+CHAPTERS.get(s.adv.chapter).name);
            if(f.error)return;
            nodes.reference.hidden=f.verified&&!f.legacyCounter;
            write('reference',(f.verified?'':'当前版本规则待核对，以下为参考预测。')+
                (f.legacyCounter?'野生序号尚未保存，暂按当前战斗数初始化估算；首次普通遇敌前的其他战斗可能改变结果。':''));
            for(const key of ['natural','berry']){
                write(key,distance(f[key]));write(key+'-time',f[key]===null?'':'当前地图 · '+estimate(f.times[key]));
                write(key+'-pure',f[key]===null?'':'纯野战 · '+estimate(f.wildFightSeconds===null?null:(f[key]-0.5)*f.wildFightSeconds));
            }
            const overlap=f.natural!==null&&f.natural===f.berry;
            nodes.overlap.hidden=!overlap;
            if(overlap)write('overlap','本次自然就会闪。下一次仅吃果才闪　'+distance(f.berryOnly)+(f.berryOnly===null?'':' · 当前地图 '+estimate(f.times.berryOnly)));
            write('buff',f.remainingMs?'剩余 '+Math.ceil(f.remainingMs/60000)+' 分钟':'未生效');
            write('odds',f.complete?'完整图鉴加成 ×2':'基础闪率');
            write('pace',f.wildPerLap===0?'本轮地图没有普通野生遭遇':f.seconds===null?'等待可估速的路线':
                '本轮 '+f.wildPerLap+' 只 · '+s.adv.speed+' 档 · 平均 '+f.seconds.toFixed(1)+' 秒 / 只');
            nodes.expiry.hidden=!(f.remainingMs&&f.times.berryOnly!==null&&f.times.berryOnly*1000>=f.remainingMs);
        };
    }

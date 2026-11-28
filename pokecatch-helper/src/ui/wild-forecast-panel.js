    function mountWildForecastPanel(panel){
        panel.innerHTML=`<div class="nursery-card">
            <div class="nursery-heading"><h3>路闪预测</h3><span class="sub" data-wild="location"></span></div>
            <p role="status" data-wild="error"></p>
            <div data-wild="results" hidden>
                <div class="wild-targets">
                    <div class="nursery-next-card"><h4>自然路闪</h4><strong data-wild="natural"></strong><div class="sub" data-wild="natural-time"></div></div>
                    <div class="nursery-next-card"><h4>星桃果路闪</h4><strong data-wild="berry"></strong><div class="sub" data-wild="berry-time"></div></div>
                </div>
                <p data-wild="overlap" hidden></p>
                <div class="nursery-section-heading"><h3>当前条件</h3></div>
                <dl class="decision-list"><dt>星桃果</dt><dd data-wild="buff"></dd><dt>地区闪率</dt><dd data-wild="odds"></dd><dt>遇敌速度</dt><dd data-wild="pace"></dd></dl>
                <p class="warn" data-wild="expiry" hidden>按当前速度，这次果效预计会在目标遭遇前结束。</p>
                <details><summary>预测依据</summary><p class="hint">从下一次普通野生遭遇起算。星桃果须在目标遭遇生成时生效。时间按当前地图持续循环、每只对手一击击倒估算，包含沿途训练家和其他节点。</p></details>
            </div></div>`;
        const nodes=Object.fromEntries([...panel.querySelectorAll('[data-wild]')].map(el=>[el.dataset.wild,el]));
        const cache={};
        function write(key,value){if(nodes[key].textContent!==value)nodes[key].textContent=value;}
        function distance(n){return n===null?'30,000 次内未找到':n===1?'下次遭遇':'再遇 '+n.toLocaleString('zh-CN')+' 次';}
        function estimate(n,seconds){
            if(n===null)return '';
            if(seconds===null)return '用时待估';
            const minutes=n*seconds/60;
            return minutes<0.1?'不足 0.1 分钟':'约 '+minutes.toLocaleString('zh-CN',{maximumFractionDigits:1})+' 分钟';
        }
        return (s,now)=>{
            const hashes=gameBundleHashes();
            const f=wildShinyForecast(s,hashes.size===1?[...hashes][0]:null,now,cache);
            nodes.results.hidden=!!f.error;nodes.error.hidden=!f.error;
            write('error',f.error||'');
            write('location',f.error?'':(DATA.regions.find(r=>r.key===f.region)?.name||f.region)+' · '+CHAPTERS.get(s.adv.chapter).name);
            if(f.error)return;
            for(const key of ['natural','berry']){
                write(key,distance(f[key]));write(key+'-time',estimate(f[key],f.seconds));
            }
            const overlap=f.natural!==null&&f.natural===f.berry;
            nodes.overlap.hidden=!overlap;
            if(overlap)write('overlap','本次自然就会闪。下一次仅吃果才闪　'+[distance(f.berryOnly),estimate(f.berryOnly,f.seconds)].filter(Boolean).join(' · '));
            write('buff',f.remainingMs?'剩余 '+Math.ceil(f.remainingMs/60000)+' 分钟':'未生效');
            write('odds',f.complete?'完整图鉴加成 ×2':'基础闪率');
            write('pace',f.seconds===null?'等待可估速的路线':s.adv.speed+' 档 · 平均 '+f.seconds.toFixed(1)+' 秒 / 次');
            nodes.expiry.hidden=!(f.remainingMs&&f.berryOnly!==null&&f.seconds!==null&&f.berryOnly*f.seconds*1000>=f.remainingMs);
        };
    }

    function mountSpeciesRanking(panel){
        const section=document.createElement('section');
        section.id='species-ranking';
        section.hidden=true;
        section.innerHTML=`
            <div class="ranking-filters">
                <label>属性<select data-rank="type"></select></label>
                <label>榜单<select data-rank="order"><option value="overall">综合榜</option><option value="power">威力榜</option></select></label>
                <label class="ranking-wide">计算口径<select data-rank="source"><option value="sheet">原表 · 插件 v${SPECIES_RANKING_DATA.version}</option><option value="game">游戏默认招式 · 按相同公式复算</option></select></label>
                <input class="ranking-wide" type="search" data-rank="search" aria-label="在此属性搜索宝可梦" placeholder="在此属性搜索名称或编号">
            </div>
            <details class="ranking-rules"><summary>分数怎么算？</summary>
                <p>按 100 级、普通色、无星级及道具加成计算。双属性分别入榜，形态单列。每个属性独立计分。</p>
                <p>期望输出 = 威力 × 命中率 × 1.5 × 攻击或特攻。命中率按威力从 40 到 150 线性降至 80%，两端分别取 100% 和 80%，先保留两位小数。</p>
                <p>耐久 = 生命 ×（防御 + 特防）。生命取种族值 × 2 + 110，其他能力取种族值 × 2 + 5。输出、耐久及两者乘积分别除以本属性最高值，再乘 100，得到输出分、耐久分和综合分。</p>
                <p>游戏口径按版本 ${SPECIES_RANKING_DATA.bundle} 的默认学习表与专属招式威力复算，替换期望输出有变化的选招。两种口径都只比较本系静态表现。</p>
            </details>
            <div data-rank="results"></div>
            <div class="insight-pages ranking-pages"><button type="button" data-rank="prev">上一页</button><span data-rank="page" role="status"></span><button type="button" data-rank="next">下一页</button></div>`;
        panel.append(section);
        const get=key=>section.querySelector('[data-rank="'+key+'"]');
        const type=get('type'),order=get('order'),source=get('source'),search=get('search'),results=get('results');
        for(const key of Object.keys(SPECIES_RANKING_DATA.groups)){
            const option=document.createElement('option');
            option.value=key;option.textContent=DATA.types[key].fr;type.append(option);
        }
        let page=0;
        const pageSize=10,format=value=>(Math.round(value*10)/10).toFixed(1);
        function render(){
            const term=search.value.trim().toLowerCase(),overall=order.value==='overall';
            const rows=speciesRankings(type.value,source.value).filter(row=>{
                const mon=MONS.get(row.id);
                return !term||String(row.id)===term.replace(/^#/,'')||[row.name,mon.name,mon.key].some(name=>name?.toLowerCase().includes(term));
            });
            if(!overall)rows.sort((a,b)=>a.powerRank-b.powerRank);
            const pages=Math.ceil(rows.length/pageSize);
            page=Math.max(0,Math.min(page,pages-1));
            const list=document.createDocumentFragment();
            for(const row of rows.slice(page*pageSize,(page+1)*pageSize)){
                const details=document.createElement('details'),summary=document.createElement('summary');
                for(const [cls,value] of [['position',overall?row.overallRank:row.powerRank],['name',row.name],['score',format(overall?row.overallScore:row.outputScore)+' 分']]){
                    const field=document.createElement('span');field.className='ranking-'+cls;field.textContent=value;summary.append(field);
                }
                details.append(summary);
                const lines=['#'+row.id+' · '+row.rarity+' · '+row.move+'（'+(row.category==='phys'?'物理':'特殊')+'）',
                    '威力 '+row.power+' · 命中 '+row.accuracy.toFixed(2)+'% · '+(row.category==='phys'?'攻击 ':'特攻 ')+row.attack,
                    '期望输出 '+format(row.expected/1000)+' 千 · 耐久 '+format(row.bulk/1000)+' 千',
                    '输出分 '+format(row.outputScore)+' · 耐久分 '+format(row.bulkScore)+' · 综合分 '+format(row.overallScore),
                    '威力榜第 '+row.powerRank+' 名 · 综合榜第 '+row.overallRank+' 名'];
                if(row.sheetMove!==row.gameMove)lines.push('原表选招为'+row.sheetMove+'，游戏默认招式复算选用'+row.gameMove+'。');
                for(const line of lines){const p=document.createElement('p');p.textContent=line;details.append(p);}
                list.append(details);
            }
            results.replaceChildren(list);
            get('prev').disabled=page===0;get('next').disabled=page+1>=pages;
            get('page').textContent=pages?(page+1)+' / '+pages+' 页 · '+rows.length+' 条':'此属性下没有匹配记录';
        }
        function reset(){page=0;render();}
        for(const control of [type,order,source])control.onchange=reset;
        search.oninput=reset;
        get('prev').onclick=()=>{page--;render();};get('next').onclick=()=>{page++;render();};
        section.render=render;
        return section;
    }

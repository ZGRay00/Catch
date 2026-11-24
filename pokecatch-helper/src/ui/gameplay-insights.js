    function mountGameInsights(panel,refresh) {
        const catalog=panel.querySelector('[data-insight-catalog]');
        const nav=document.createElement('nav'),section=document.createElement('section');
        nav.className='insight-nav';nav.setAttribute('aria-label','图鉴工具');
        section.id='game-insights';section.hidden=true;
        section.innerHTML='<div class="insight-controls"><label class="insight-field insight-route">评估路线<select data-insight="chapter"></select></label>'+
            '<label class="insight-field">查找持有个体<input type="search" data-insight="filter" placeholder="名称、编号、异色、在队或 UID" autocomplete="off"></label>'+
            '<div data-insight="pages" class="insight-pages" hidden><button type="button" data-insight="prev">上一页</button><span data-insight="page" role="status"></span><button type="button" data-insight="next">下一页</button></div>'+
            '<div class="insight-picks"><label class="insight-field"><span data-insight="left-label">个体 A</span><select data-insight="a"></select></label>'+
            '<label class="insight-field" data-insight="right-field">个体 B<select data-insight="b"></select></label></div></div>'+
            '<section data-insight="comparison"><h3 class="insight-title">路线表现</h3><p class="insight-context" data-insight="context"></p><div data-insight="evaluation"></div>'+
            '<div class="insight-actions"><button type="button" data-insight="inspect-a">查看 A 的禁招建议</button><button type="button" data-insight="inspect-b">查看 B 的禁招建议</button></div></section>'+
            '<section data-insight="advice" hidden><h3 class="insight-title" id="insight-advice-title" tabindex="-1">禁招建议</h3><p class="insight-context" data-insight="advice-context"></p>'+
            '<p class="insight-notice" data-insight="rule-notice" role="status" hidden></p><div data-insight="moves"></div></section>';
        panel.prepend(nav);panel.append(section);
        const get=name=>section.querySelector('[data-insight="'+name+'"]');
        const route=get('chapter'),search=get('filter'),left=get('a'),right=get('b'),output=get('evaluation'),moves=get('moves'),ruleNotice=get('rule-notice');
        const make=(tag,value,cls)=>{const el=document.createElement(tag);if(value!=null)el.textContent=value;if(cls)el.className=cls;return el;};
        const titleOf=m=>(m.shiny?'✦ ':'')+MONS.get(m.id).name+' Lv.'+m.level;
        const regions=new Map(DATA.regions.map(r=>[r.key,r.name]));
        let view='catalog',account,priorSave,roster=[],byUid=new Map(),term=null,filtered=[],page=0;
        let teamKey='',teamPositions=new Map();
        let selected={a:null,b:null,advice:null},pendingUid=null,routeKey='',pickerKey='',resultKey='';
        const pageSize=40;
        const catalogId=catalog.id||'insight-species';catalog.id=catalogId;
        for(const [key,label] of [['catalog','物种图鉴'],['compare','路线对比'],['advice','禁招建议']]){
            const button=make('button',label);button.type='button';button.dataset.insightView=key;
            button.setAttribute('aria-controls',key==='catalog'?catalogId:section.id);
            button.setAttribute('aria-pressed',String(key===view));
            button.onclick=()=>{setView(key);refresh();};nav.append(button);
        }
        function setView(next){
            if(next===view)return;
            if(next==='advice'&&view==='compare')selected.advice=selected.a;
            view=next;pickerKey='';resultKey='';
            for(const button of nav.children)button.setAttribute('aria-pressed',String(button.dataset.insightView===view));
            catalog.hidden=view!=='catalog';section.hidden=view==='catalog';
            get('comparison').hidden=view!=='compare';get('advice').hidden=view!=='advice';
            get('right-field').hidden=view!=='compare';
            get('left-label').textContent=view==='compare'?'个体 A':'查看个体';
        }
        function selectMember(uid,next='compare'){setView(next);pendingUid=String(uid);}
        function openAdvice(uid){
            selectMember(uid,'advice');refresh();
            const heading=section.querySelector('#insight-advice-title');
            heading.focus({preventScroll:true});heading.scrollIntoView({block:'nearest'});
        }
        get('inspect-a').onclick=()=>openAdvice(selected.a);
        get('inspect-b').onclick=()=>openAdvice(selected.b);
        search.oninput=()=>{page=0;refresh();};
        get('prev').onclick=()=>{page=Math.max(0,page-1);refresh();};
        get('next').onclick=()=>{page++;refresh();};
        route.onchange=refresh;
        left.onchange=()=>{
            if(view==='advice')selected.advice=left.value;
            else{if(selected.b===left.value)selected.b=selected.a;selected.a=left.value;}
            refresh();
        };
        right.onchange=()=>{selected.b=right.value;refresh();};

        function updateRoute(s){
            const current=s.adv.chapter,key=JSON.stringify([current,s.adv.unlocked]);
            if(key===routeKey)return;
            routeKey=key;
            const previous=route.value,fragment=document.createDocumentFragment(),groups=new Map();
            const follow=make('option','跟随当前路线 · '+(CHAPTERS.get(current)?.name||'未知章节'));
            follow.value='current';fragment.append(follow);
            for(const chapter of DATA.chapters){
                if(chapter.id>s.adv.unlocked&&chapter.id!==current)continue;
                if(!groups.has(chapter.reg)){
                    const group=document.createElement('optgroup');group.label=regions.get(chapter.reg)||chapter.reg;
                    groups.set(chapter.reg,group);fragment.append(group);
                }
                const option=make('option',chapter.name);option.value=String(chapter.id);groups.get(chapter.reg).append(option);
            }
            route.replaceChildren(fragment);route.value=previous;if(!route.value)route.value='current';
        }
        function updateRoster(s){
            const query=search.value.trim().normalize('NFKC').toLowerCase();
            const deployed=s.road?.length?s.road:s.team||[],teamSignature=JSON.stringify(deployed);
            const teamChanged=teamSignature!==teamKey;
            if(teamChanged){
                teamKey=teamSignature;teamPositions=new Map(deployed.map((uid,i)=>[String(uid),i+1]));
            }
            if(priorSave!==s||term!==query||teamChanged){
                if(priorSave!==s){priorSave=s;roster=insightRoster(s);byUid=new Map(roster.map(m=>[String(m.uid),m]));}
                term=query;
                const number=/^#?\d+$/.test(query)?Number(query.replace('#','')):null;
                filtered=query?roster.filter(mon=>{
                    const m=MONS.get(mon.id);
                    return (query==='在队'&&teamPositions.has(String(mon.uid)))||number===mon.id||m.name.includes(query)||m.key?.includes(query)||String(mon.uid).toLowerCase().includes(query)||
                        (mon.shiny?'异色 闪光':'普通').includes(query);
                }):roster;
            }
            const team=[...teamPositions.keys()].filter(uid=>byUid.has(uid));
            if(!byUid.has(selected.a))selected.a=team[0]??(roster[0]?String(roster[0].uid):'');
            if(selected.b===null){
                const next=team.find(uid=>uid!==selected.a)??roster.find(m=>String(m.uid)!==selected.a)?.uid;
                selected.b=next==null?'':String(next);
            }
            if(!byUid.has(selected.b)||selected.b===selected.a)selected.b='';
            if(!byUid.has(selected.advice))selected.advice=selected.a;
            if(pendingUid!==null){
                if(byUid.has(pendingUid)){
                    if(view==='advice')selected.advice=pendingUid;
                    else{if(selected.b===pendingUid)selected.b=selected.a;selected.a=pendingUid;}
                }
                pendingUid=null;
            }
            const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages-1);
            get('pages').hidden=pages<=1&&(!term||filtered.length>0);
            get('prev').disabled=page===0;get('next').disabled=page===pages-1;
            const pageText=filtered.length?'第 '+(page+1)+' / '+pages+' 页 · '+filtered.length+' 只':roster.length?'没有匹配的个体，保留当前选择':'没有匹配的个体';
            if(get('page').textContent!==pageText)get('page').textContent=pageText;
            const pageRows=filtered.slice(page*pageSize,(page+1)*pageSize);
            const visible=new Map(pageRows.map(m=>[String(m.uid),m]));
            const active=view==='advice'?selected.advice:selected.a;
            for(const uid of [active,view==='compare'&&selected.b])if(byUid.has(uid))visible.set(uid,byUid.get(uid));
            const rows=[...visible].map(([id,m])=>[id,titleOf(m)+(teamPositions.has(id)?' · 在队 '+teamPositions.get(id):'')+' · '+id]);
            const key=JSON.stringify([view,rows,active,selected.b]);
            if(key===pickerKey)return;
            pickerKey=key;
            function fill(control,isSecond){
                const options=document.createDocumentFragment();
                if(isSecond){const empty=make('option','不选第二只');empty.value='';options.append(empty);}
                for(const [uid,label] of rows){
                    if(isSecond&&uid===active)continue;
                    const option=make('option',label);option.value=uid;options.append(option);
                }
                control.replaceChildren(options);control.value=isSecond?selected.b:active;control.disabled=!roster.length;
            }
            fill(left,false);if(view==='compare')fill(right,true);
        }
        function comparisonTable(summary,members){
            const table=make('table',null,'insight-metrics'),head=table.createTHead().insertRow(),body=table.createTBody();
            const column=label=>{const th=make('th',label);th.scope='col';head.append(th);return th;};
            column('路线指标');
            members.forEach((m,i)=>{
                const th=column(i?'B':'A');th.append(make('span',titleOf(m)));
                th.title=titleOf(m)+' · UID '+m.uid;
            });
            const metrics=[
                ['damage','首击期望输出',m=>m.damage,'','','—'],
                ['accuracy','路线命中率',m=>m.moves.length?m.accuracy*100:null,'%',' 个百分点','无可用招式'],
                ['endurance','满血耐久',m=>m.endurance,' 击',' 击','无有效承伤']
            ];
            for(const [key,label,value,unit,diffUnit,unavailable] of metrics){
                const row=body.insertRow();row.dataset.metric=key;
                const th=make('th',label);th.scope='row';row.append(th);
                const values=summary.members.map(value).map(n=>n==null?null:Math.round(n*10)/10);
                let best=-1;
                if(values.length===2&&values.every(v=>v!=null)){
                    const diff=values[0]-values[1];if(diff!==0)best=diff>0?0:1;
                    th.append(make('small',best<0?'持平':(best===0?'A':'B')+' 高 '+Number(Math.abs(diff).toFixed(1))+diffUnit));
                }
                values.forEach((v,i)=>{
                    const td=row.insertCell();td.textContent=v==null?unavailable:v.toFixed(1)+unit;
                    if(i===best)td.className='insight-leading';
                });
            }
            return table;
        }
        function comparisonDetails(summary,members){
            const detail=make('details',null,'insight-detail');detail.append(make('summary','招式、承伤与估算口径'));
            summary.members.forEach((m,i)=>{
                const group=make('div',null,'insight-breakdown'),move=m.moves[0];
                group.append(make('strong',(i?'B · ':'A · ')+titleOf(members[i])),
                    make('p',move?'常用招式 '+moveLabel(move.key)+' · 基础命中 '+Math.round(move.accuracy*100)+'% · 覆盖 '+Math.round(move.weight*100)+'% 对手权重':'未找到可用攻击招式'),
                    make('p','首击预计承伤 '+m.incoming.toFixed(1)+' · HP '+m.stats.hp+' · 物防 '+m.stats.def+' · 特防 '+m.stats.spd),
                    make('small','UID '+members[i].uid,'insight-note'));
                detail.append(group);
            });
            detail.append(make('p','按本章标准满血对手的出现权重估算。首击输出计入未命中和溢出伤害，路线命中率取各对手对应招式的基础命中加权值。满血耐久按自身 HP 除以平均首击承伤计算。具体节点、天气和战中状态会改变结果。','insight-note'));
            return detail;
        }
        function renderMoves(mon,member,openGroups){
            const rows=moveAdvice(mon,member);
            moves.replaceChildren();
            if(!rows.length){
                moves.append(make('p',mon.id===132?'百变怪会复制对手招式，没有固定的禁招方案。':'当前等级没有可核对的招式。'));return;
            }
            const groups={consider:[],keep:[],banned:[]};
            for(const row of rows)groups[row.banned?'banned':row.action==='consider'?'consider':'keep'].push(row);
            if(!groups.consider.length)moves.append(make('p',member?'这条路线没有建议禁用的招式。':'缺少路线对手数据，暂缓给出禁用候选。','insight-note'));
            for(const [key,label] of [['consider','可考虑禁用'],['keep','建议保留'],['banned','当前已禁用']]){
                if(!groups[key].length)continue;
                const detail=make('details',null,'insight-move-group');detail.dataset.moveGroup=key;
                detail.open=openGroups.has(key)?openGroups.get(key):key==='consider'||key==='keep'&&!groups.consider.length;
                const heading=make('summary',label);heading.append(make('span',String(groups[key].length),'insight-count'));detail.append(heading);
                const list=make('ul');
                for(const row of groups[key]){
                    const item=make('li'),line=make('div',null,'insight-move-line');
                    line.append(make('strong',moveLabel(row.key)),make('span',(DATA.types[row.type]?.fr||row.type)+' · '+({phys:'物理',spec:'特殊',status:'变化'}[row.category]||'特殊')));
                    const facts=[];
                    if(row.power>0)facts.push('威力 '+row.power);
                    if(row.accuracy>0)facts.push('命中 '+Math.round(row.accuracy*100)+'%');
                    if(row.recorded&&!row.banned)facts.push('勾选禁用未生效');
                    item.append(line);if(facts.length)item.append(make('small',facts.join(' · ')));
                    item.append(make('p',row.reason));
                    list.append(item);
                }
                detail.append(list);moves.append(detail);
            }
        }
        let previousAdviceUid=null;
        function render(s,now){
            const nextAccount=accountId(s);
            if(nextAccount!==account){
                if(account!==undefined){selected={a:null,b:null,advice:null};search.value='';page=0;route.value='current';}
                account=nextAccount;priorSave=null;resultKey='';pickerKey='';routeKey='';previousAdviceUid=null;
            }
            if(view==='catalog')return view;
            updateRoute(s);updateRoster(s);
            const chapter=route.value==='current'?s.adv.chapter:Number(route.value),model=CHAPTERS.get(chapter);
            const members=(view==='advice'?[selected.advice]:[selected.a,selected.b]).map(uid=>byUid.get(uid)).filter(Boolean);
            if(view==='advice'){
                const build=nurseryRuntimeOptions().build,verified=build===MOVE_ADVICE_BUILD&&build===DATA.combat.build;
                if(ruleNotice.hidden!==verified){
                    ruleNotice.hidden=verified;
                    ruleNotice.textContent=verified?'':'当前游戏版本的招式规则待核对，以下建议按上次核对的规则估算。';
                }
            }
            const branch=model?.foesByStarter;
            const starter=branch&&starterChoice(s,branch.key,Object.keys(branch.choices||{}).map(Number));
            const weather=model&&combatWeather(s,{chapter},{kind:'map',id:chapter},now).signature;
            const key=JSON.stringify([view,nextAccount,members.map(m=>[m.uid,combatProfile(m),m.counter,m.burst]),chapter,starter,weather]);
            if(key===resultKey)return view;
            const summary=model&&members.length?routeMemberComparison(s,members,chapter,now):null;
            const context=[regions.get(model?.reg),model?.name,summary&&summary.foes+' 组对手'].filter(Boolean).join(' · ');
            if(view==='compare'){
                const detailsOpen=output.querySelector('details')?.open;
                output.replaceChildren();get('context').textContent=context;
                get('inspect-a').hidden=!members[0];get('inspect-b').hidden=!members[1];
                if(summary){
                    const detail=comparisonDetails(summary,members);detail.open=!!detailsOpen;
                    output.append(comparisonTable(summary,members),detail);
                }else output.append(make('p',members.length?'该路线没有可核对的对手数据。':'当前没有可读取的持有个体。','insight-note'));
            }else{
                section.querySelector('#insight-advice-title').textContent=members[0]?titleOf(members[0])+' 的禁招建议':'禁招建议';
                get('advice-context').textContent=context+(members[0]?' · 只读预览':'');
                const same=members[0]&&previousAdviceUid===selected.advice;
                const openGroups=same?new Map([...moves.querySelectorAll('[data-move-group]')].map(d=>[d.dataset.moveGroup,d.open])):new Map();
                previousAdviceUid=selected.advice;
                if(members[0])renderMoves(members[0],summary?.members[0],openGroups);
                else moves.replaceChildren(make('p','当前没有可读取的持有个体。','insight-note'));
            }
            resultKey=key;return view;
        }
        return{render,setView,selectMember};
    }

    function mountNativeFamily(openSpecies,openMember) {
        let save=null,onlyMissing=false,account=null,previousList=null,dexSignature='',familyNode=null,familyKey='';
        let observer=null,frame=0,rosterSave=null,appliedDexSave=null,ownedById=new Map(),registered=new Set(),previousCardSave=null;
        const tileActions=new WeakMap();
        let openedDex=null;
        const style=document.createElement('style');
        style.textContent='.pch-hide-captured{display:none!important}.pch-native-family{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.pch-native-family button,.pch-native-filter{min-height:36px;max-width:100%;white-space:normal}.pch-family-tile{cursor:pointer}.pch-family-tile:focus-visible{outline:2px solid currentColor}';
        document.head?.append(style);
        function currentCard(){return document.querySelector('#modal-root.open .dexcard-modal .dexcard,#modal-root.open .mon-card');}
        function ensureRoster(){
            if(rosterSave===save)return;
            rosterSave=save;ownedById=new Map();registered=new Set();
            for(const [id,rec] of Object.entries(save?.dex||{}))if(Number(rec?.caught)>0)registered.add(Number(id));
            for(const mon of collectionMembers(save||{})){
                registered.add(mon.id);
                if(!mon.uid)continue;
                let group=ownedById.get(mon.id);if(!group){group=[null,null];ownedById.set(mon.id,group);}
                const variant=Number(!!mon.shiny),before=group[variant];
                if(!before||mon.level>before.level)group[variant]=mon;
            }
        }
        // Native dex cards remember this exact list at the time the player opens one.
        // Its built-in arrows resolve the *current* modal. Clicking a grid cell with
        // the modal open would queue another modal behind it and leave a stale action.
        document.addEventListener('click',event=>{
            const cell=event.target.closest?.('#dex-regions .dex-cell[data-id]');
            if(!cell||currentCard())return;
            const ids=[...document.querySelectorAll('#dex-regions .dex-region:not(.folded) .dex-cell:not([hidden])')].map(node=>Number(node.dataset.id));
            const id=Number(cell.dataset.id);
            openedDex=ids.includes(id)?{id,ids,card:null,pendingUntil:Date.now()+1500}:null;
        },true);
        function choose(id,mon,origin,sourceId){
            if(mon){openMember(id,mon.uid);return;}
            if(openedDex?.id===sourceId&&openedDex.card===origin&&currentCard()===origin){
                const index=openedDex.ids.indexOf(sourceId);
                const direction=id===openedDex.ids[index-1]?'prev':id===openedDex.ids[index+1]?'next':null;
                const button=direction&&origin.closest('.dexcard-modal')?.querySelector('.dc-nav.'+direction);
                if(button&&!button.disabled&&typeof button.onclick==='function'){
                    openedDex.id=id;openedDex.card=null;openedDex.pendingUntil=Date.now()+1500;button.click();return;
                }
            }
            openSpecies(id);
        }
        function syncCard(){
            const card=currentCard(),family=card?.querySelector('.fam-sec')||card?.querySelector('.dc-sec .evo')?.closest('.dc-sec');
            if(openedDex?.card&&openedDex.card!==card||openedDex&&!openedDex.card&&Date.now()>openedDex.pendingUntil)openedDex=null;
            if(!family){familyNode=null;familyKey='';previousCardSave=null;return;}
            if(family===familyNode&&save===previousCardSave&&family.querySelector('.pch-native-family'))return;
            const hero=card.querySelector('.dc-hero'),current=hero&&monIdFrom(hero)||monIdFrom(family.querySelector('.evo.cur'));
            if(!current)return;
            const owned=card.matches('.mon-card'),candidates=new Map(familyMembers(current).filter(mon=>mon.id!==current).map(mon=>[mon.id,mon]));
            if(!owned&&openedDex?.id===current&&!openedDex.card)openedDex.card=card;
            const tiles=[...family.querySelectorAll('.evo:not(.cur)')].map(tile=>({tile,id:monIdFrom(tile)})).filter(row=>row.id&&row.id!==current);
            for(const {id} of tiles)candidates.set(id,MONS.get(id));
            if(owned)ensureRoster();
            const entries=[];
            for(const candidate of candidates.values()){
                if(!owned){entries.push([candidate,null]);continue;}
                for(const match of ownedById.get(candidate.id)||[])if(match)entries.push([candidate,match]);
            }
            const key=JSON.stringify([account,owned,current,entries.map(([m,individual])=>[m.id,individual?.uid,individual?.level])]);
            previousCardSave=save;
            if(familyNode===family&&key===familyKey&&(!entries.length||family.querySelector('.pch-native-family')))return;
            familyNode=family;familyKey=key;
            family.querySelector('.pch-native-family')?.remove();
            if(!entries.length)return;
            const nav=document.createElement('div');nav.className='pch-native-family';nav.setAttribute('aria-label','查看同家族形态');
            for(const [model,mon] of entries){
                const button=document.createElement('button');button.type='button';
                button.textContent='查看'+(mon?(mon.shiny?'✦ 异色':'普通'):'')+model.name+(mon?' Lv.'+mon.level:'');
                button.addEventListener('click',event=>{event.stopPropagation();choose(model.id,mon,card,current);});
                nav.append(button);
            }
            for(const {tile,id} of tiles){
                if(tile.matches('button,a')||tile.onclick||tile.querySelector('button,a'))continue;
                const shiny=!!tile.querySelector('img[src*="/shiny/"],.shiny-ico');
                const mon=owned?ownedById.get(id)?.[Number(shiny)]:null;
                const existing=tileActions.get(tile);
                if(owned&&(!tile.classList.contains('own')||!mon)){
                    if(existing){existing.run=null;tile.removeAttribute('role');tile.removeAttribute('tabindex');tile.removeAttribute('aria-label');tile.classList.remove('pch-family-tile');}
                    continue;
                }
                const action=existing||{run:null};action.run=()=>choose(id,mon,card,current);
                tile.setAttribute('role','button');tile.tabIndex=0;tile.classList.add('pch-family-tile');
                tile.setAttribute('aria-label','查看'+MONS.get(id).name);
                if(!existing){
                    tileActions.set(tile,action);
                    tile.addEventListener('click',event=>{if(action.run){event.stopPropagation();action.run();}});
                    tile.addEventListener('keydown',event=>{if(action.run&&(event.key==='Enter'||event.key===' ')){event.preventDefault();tile.click();}});
                }
            }
            family.append(nav);
        }
        function syncDex(force=false){
            const native=document.querySelector('#dex-shiny'),list=document.querySelector('#dex-regions,#dex-list');
            if(!native||!list)return;
            let button=native.parentElement?.querySelector('.pch-native-filter');
            if(!button){
                button=document.createElement('button');button.type='button';button.className='chip pch-native-filter';button.textContent='只看未捕获';
                button.onclick=event=>{event.stopPropagation();onlyMissing=!onlyMissing;syncDex(true);};
                native.after(button);
            }
            button.setAttribute('aria-pressed',String(onlyMissing));button.classList.toggle('on',onlyMissing);
            if(previousList!==list){
                observer?.disconnect();
                if(typeof MutationObserver!=='undefined'){
                    observer=new MutationObserver(records=>{
                        if(!onlyMissing||frame)return;
                        const newCells=records.some(record=>record.type==='attributes'||[...record.addedNodes].some(node=>
                            node.nodeType===1&&(node.matches('.dex-cell')||node.querySelector('.dex-cell'))));
                        if(newCells)frame=requestAnimationFrame(()=>{frame=0;syncDex(true);});
                    });
                    observer.observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['data-id']});
                }
                previousList=list;force=true;
            }
            if(!onlyMissing){
                if(force||dexSignature)for(const cell of list.querySelectorAll('.pch-hide-captured'))cell.classList.remove('pch-hide-captured');
                dexSignature='';appliedDexSave=null;return;
            }
            if(!save)return;
            if(!force&&appliedDexSave===save)return;
            ensureRoster();
            appliedDexSave=save;
            const key=Array.from(registered).join(',');
            if(!force&&dexSignature===key)return;
            dexSignature=key;
            for(const cell of list.querySelectorAll('.dex-cell[data-id]'))cell.classList.toggle('pch-hide-captured',registered.has(Number(cell.dataset.id)));
        }
        return s=>{
            save=s;
            const next=s?accountId(s):null;
            if(next!==account){account=next;onlyMissing=false;openedDex=null;rosterSave=null;syncDex(true);}
            if(!s)return;
            syncDex();syncCard();
        };
    }

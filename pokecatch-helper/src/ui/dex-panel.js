    function mountDexPanel(root,refresh){
        const panel=root.querySelector('#dex-panel');
        panel.innerHTML='<div class="dex-searchbar"><input id="dex-search" type="search" aria-label="搜索宝可梦的获取方式" placeholder="搜索名称、英文名或编号" autocomplete="off" aria-controls="dex-results"><button type="button" id="dex-clear" hidden>返回缺失列表</button></div><div class="list" id="dex-results" tabindex="-1" aria-label="图鉴结果"></div>';
        const input=panel.querySelector('#dex-search'),results=panel.querySelector('#dex-results'),clear=panel.querySelector('#dex-clear');
        const methods={wild:'野生遭遇',questWild:'解锁后野生遭遇',static:'固定遭遇',gift:'赠送',egg:'赠蛋',lootEgg:'探索得蛋',phenomenon:'特殊现象',incubating:'孵化',breed:'繁殖',trade:'交换／复原',underground:'探险奖励',evolution:'进化',legend:'传说战',roam:'游荡'};
        let signature=null,returnSpecies=null;
        function search(value, showResults = refresh){
            if(showResults!==refresh)returnSpecies=null;
            input.value=value;
            results.scrollTop=0;
            showResults();
            const destination=value?results.querySelector('.dex-heading'):
                returnSpecies&&results.querySelector('[data-species="'+returnSpecies+'"]');
            (destination||results).focus({preventScroll:true});
            if(!value&&destination)destination.scrollIntoView({block:'nearest'});
            if(!value)returnSpecies=null;
        }
        clear.onclick=()=>search('');
        input.addEventListener('input',()=>{returnSpecies=null;results.scrollTop=0;refresh();});
        results.addEventListener('click',event=>{
            const button=event.target.closest('button[data-species]');
            if(button){
                if(!input.value.trim())returnSpecies=button.dataset.species;
                search('#'+button.dataset.species);
            }
        });
        function label(tag,text,className){
            const element=document.createElement(tag);element.textContent=text;
            if(className)element.className=className;
            return element;
        }
        function speciesButton(mon,text){
            const button=label('button',text,'chip');button.type='button';button.dataset.species=String(mon.id);
            return button;
        }
        function searchSpecies(value){
            const term=value.normalize('NFKC').trim().toLowerCase();
            if(/^#?\d+$/.test(term)){
                const mon=MONS.get(Number(term.replace('#','')));return mon?[mon]:[];
            }
            const name=term==='火神虫'?'火神蛾':term;
            const exact=DATA.mons.find(mon=>mon.name===name||mon.key===name);
            if(exact)return[exact];
            return DATA.mons.filter(mon=>mon.name.includes(name)||mon.key?.includes(name));
        }
        function changed(next){
            const key=JSON.stringify(next);
            if(key===signature)return false;
            signature=key;results.replaceChildren();return true;
        }
        function renderDex(s,settings,now){
            const term=input.value.trim();
            clear.hidden=!term;
            if(!term){
                const status=dexStatus(s,settings);
                const planned=new Map();
                for(const route of dexRanking(s,settings,{},now,status)){
                    for(const target of route.targets)if(!planned.has(target.id))planned.set(target.id,route);
                }
                const expanded=status.missing.length<=6;
                const rows=status.missing.map(mon=>{
                    const tag=planned.has(mon.id)?'可规划':ROAMING_DATA.groups.some(group=>group.ids.includes(mon.id))?'游荡':mon.legend?'传说':'查看来源';
                    const route=expanded&&planned.get(mon.id);
                    return[mon.id,tag,route?route.name:''];
                });
                const countUnit=settings.mode==='dex'&&settings.dexSpecies?.length?' 种目标宝可梦':' 条进化链';
                const targets=dexSearchIds(s,settings,status);
                for(const egg of s.pension?.eggs||[])targets.delete(egg.id);
                const windows=settings.mode==='dex'?dexDayWindows(s,settings,targets,now):[];
                const time=at=>new Date(at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
                const hints=windows.map(w=>(w.at<=now?'当前':time(w.at))+'–'+time(w.until)+' · '+MONS.get(w.id).name+' · '+w.place);
                if(!changed(['missing',countUnit,rows,hints]))return;
                if(!rows.length){results.append(label('p','所选收集目标已全部捕获。'));return;}
                if(hints.length){
                    const details=document.createElement('details');
                    details.append(label('summary','今日限时捕获 · '+hints[0]+(hints.length>1?' 等 '+hints.length+' 个窗口':'')));
                    for(const hint of hints)details.append(label('div',hint,'hint'));
                    results.append(details);
                }
                results.append(label('h3','待收集 · '+rows.length+countUnit,'dex-list-title'));
                const wrap=label('div','',expanded?'dex-targets':'dex-compact');
                for(const [id,tag,place] of rows){
                    const mon=MONS.get(id);
                    if(!expanded){wrap.append(speciesButton(mon,'#'+id+' '+mon.name+' · '+tag));continue;}
                    const button=speciesButton(mon,'');button.className='dex-target';
                    const body=label('span','','dex-target-body');
                    body.append(label('strong',mon.name));
                    if(place)body.append(label('small',place));
                    button.append(label('span','#'+id,'dex-number'),body,label('span',tag,'dex-method'));
                    button.dataset.planned=String(planned.has(id));
                    button.setAttribute('aria-label','查看'+mon.name+'的获取方式，'+tag+(place?'，'+place:''));
                    wrap.append(button);
                }
                results.append(wrap);return;
            }
            const matches=searchSpecies(term);
            if(matches.length!==1){
                if(!changed(['matches',term,matches.map(mon=>mon.id)]))return;
                if(!matches.length){results.append(label('p','未找到匹配的宝可梦。','empty'));return;}
                const wrap=label('div','','missing');
                for(const mon of matches)wrap.append(speciesButton(mon,'#'+mon.id+' '+mon.name));
                results.append(wrap);return;
            }
            const mon=matches[0],base=MONS.get(mon.root)||mon;
            const caught=captured(s,mon.id),chainComplete=captured(s,base.id);
            const forms=seasonFormProgress(s,mon.id),currentSeason=forms&&weatherSeason(now);
            const sources=acquisitionSources(s,mon.id,now).sort((a,b)=>Number(!!b.marked)-Number(!!a.marked));
            const spirit=mon.id===spiritEvent.id?spiritProgress(s):null;
            const gates=legendRequirements(s,[mon.id]);
            if(!changed(['detail',gates?.lines,gates?.notes,mon.id,caught,chainComplete,forms?.forms,currentSeason,spirit?.missing,sources.map(row=>[row.kind,row.chapter,row.place,row.available,row.marked,row.detail])]))return;
            const heading=label('h3','#'+mon.id+' '+mon.name+' · '+(caught?'已捕获':'未捕获'),'dex-heading');
            heading.tabIndex=-1;results.append(heading);
            const family=label('div','基础形态 '+base.name+' · '+(chainComplete?'进化链已完成':'进化链待收集'),'hint');
            if(base.id!==mon.id)family.append(' ',speciesButton(base,'查'+base.name+'来源'));
            results.append(family);
            if(!caught&&gates&&gateZones.get(mon.id)?.gate){
                const details=label('details','','gate-checks'),list=label('ul','');
                const direct=gates.lines.filter(line=>line.id===mon.id);
                details.open=true;
                details.append(label('summary',direct.length?'捕获条件 · '+direct.filter(line=>line.have>=line.need).length+'/'+direct.length+' 项已满足':'捕获条件 · 地区待开放'));
                for(const line of gates.lines){
                    if(line.id!==mon.id&&line.have>=line.need)continue;
                    const row=label('li',(line.id===mon.id?'':MONS.get(line.id).name+' · ')+line.label+' '+line.have+'/'+line.need);
                    if(line.missing.length){
                        const links=label('div','','missing');
                        for(const id of line.missing.slice(0,6))links.append(speciesButton(MONS.get(id),MONS.get(id).name));
                        if(line.missing.length>6){
                            const more=label('details','','gate-more');
                            more.append(label('summary','查看其余 '+(line.missing.length-6)+' 种'));
                            more.addEventListener('toggle',()=>{
                                if(!more.open||more.children.length>1)return;
                                const rest=label('div','','missing');
                                for(const id of line.missing.slice(6))rest.append(speciesButton(MONS.get(id),MONS.get(id).name));
                                more.append(rest);
                            });
                            links.append(more);
                        }
                        row.append(links);
                    }
                    list.append(row);
                }
                for(const note of new Set(gates.notes))list.append(label('li',note));
                details.append(list);results.append(details);
            }
            if(!caught&&spirit?.missing.length){
                results.append(label('h4','待登记的幽灵 · 点击查看来源','dex-section'));
                const links=label('div','','missing');
                for(const id of spirit.missing){const ghost=MONS.get(id);links.append(speciesButton(ghost,ghost.name));}
                results.append(links);
            }
            if(forms){
                results.append(label('h4','季节形态 · 已捕获 '+(forms.forms.length-forms.missing.length)+'/4','dex-section'));
                const list=label('ul','','season-forms');
                for(const form of forms.forms){
                    const entry=label('li','');
                    const name=SEASON_NAMES[form.season],state=form.caught?'已捕获':form.seen?'已遇见':'未记录';
                    entry.append(speciesButton(MONS.get(form.id),name+' · '+state+(currentSeason===form.season?'（本季）':'')));
                    entry.dataset.seen=String(form.seen);list.append(entry);
                }
                results.append(list);
            }
            let priorState;
            for(const row of sources){
                const state=row.marked?'当前路线已生成':row.available?'当前可尝试':'其他获取条件';
                if(state!==priorState){
                    results.append(label('h4',state,'dex-section'));
                    priorState=state;
                }
                const block=label('div','','dex-source');
                const chapter=CHAPTERS.get(row.chapter);
                const region=chapter&&DATA.regions.find(region=>region.key===chapter.reg);
                const location=[region?.name,chapter?.name,row.place!==chapter?.name&&row.place].filter(Boolean).join(' · ');
                block.append(label('strong',[methods[row.kind]||'获取方式',location].filter(Boolean).join(' · ')));
                block.append(label('div',row.detail,'hint'));results.append(block);
                if(row.kind==='evolution'&&row.fromId!==base.id&&MONS.has(row.fromId)){
                    const previous=MONS.get(row.fromId);
                    block.append(speciesButton(previous,'查'+previous.name+'来源'));
                }
            }
            if(!sources.length)results.append(label('p','当前数据尚未收录该形态的获取地点或方式。','empty'));
        }
        let routeView,routeEntries;
        function showTargets(entry){
            if(entry.targets)return;
            const targets=label('div','','missing');
            for(const hit of entry.hits){
                const button=label('button',MONS.get(hit.id).name,'chip');
                button.type='button';button.dataset.lookup=String(hit.id);
                button.setAttribute('aria-label','查看'+button.textContent+'的获取方式');
                targets.append(button);
            }
            entry.section.append(targets);entry.targets=targets;
        }
        function createRoute(row,open){
            const section=document.createElement('details'),summary=label('summary',row.league?row.name:DATA.regions.find(r=>r.key===row.reg).name+' · '+row.name);
            const count=label('span','','dex-route-count');
            section.dataset.dexRoute=row.key;section.open=open;summary.append(count);section.append(summary);
            const entry={section,count,hits:row.targets,targets:null};
            section.addEventListener('toggle',()=>{if(section.open)showTargets(entry);});
            return entry;
        }
        function renderRoutes(view,s,status,engine){
            const rows=dexRanking(s,engine.settings,engine.cooldowns);
            if(routeView?.parentNode!==view){
                routeView=label('div','','dex-routes');routeEntries=new Map();
                view.replaceChildren(routeView);
            }
            const focused=root.activeElement,activeRoute=focused?.closest('details[data-dex-route]')?.dataset.dexRoute;
            const activeSpecies=focused?.dataset.lookup;
            if(!rows.length){
                const message=status.missing.length?'当前范围与条件下暂无可规划的地图。可在图鉴查看缺失物种的获取条件。':'所选收集目标已全部捕获。';
                if(routeView.firstChild?.textContent!==message)routeView.replaceChildren(label('p',message,'empty'));
                routeEntries.clear();return;
            }
            if(!routeEntries.size)routeView.replaceChildren();
            const firstLoad=!routeEntries.size;
            const live=new Set(rows.map(row=>row.key));
            for(const [key,entry] of routeEntries)if(!live.has(key)){entry.section.remove();routeEntries.delete(key);}
            let position=routeView.firstChild;
            for(const [index,row] of rows.entries()){
                let entry=routeEntries.get(row.key);
                if(!entry){entry=createRoute(row,firstLoad&&index===0);routeEntries.set(row.key,entry);}
                const state=row.marked?'已生成目标节点':row.key===engine.target?.key?'任务目标':'';
                const count=[state,row.prepNote||row.targets.length+' 种',Number.isFinite(row.expected)?'估算 '+row.expected.toFixed(2)+' 种/轮':''].filter(Boolean).join(' · ');
                if(entry.count.textContent!==count)entry.count.textContent=count;
                if(entry.hits!==row.targets){
                    if(entry.targets&&(entry.hits.length!==row.targets.length||row.targets.some((hit,i)=>hit.id!==entry.hits[i].id))){
                        entry.targets.remove();entry.targets=null;
                    }
                    entry.hits=row.targets;
                }
                if(entry.section.open)showTargets(entry);
                if(entry.section!==position)routeView.insertBefore(entry.section,position);
                position=entry.section.nextSibling;
            }
            if(activeRoute&&root.activeElement!==focused){
                const section=routeView.querySelector('[data-dex-route="'+CSS.escape(activeRoute)+'"]');
                const next=activeSpecies&&section?.querySelector('[data-lookup="'+CSS.escape(activeSpecies)+'"]');
                (next||section?.querySelector('summary'))?.focus({preventScroll:true});
            }
        }
        return {renderDex,renderRoutes,search};
    }

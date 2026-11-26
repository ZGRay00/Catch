    function mountQueuePanel(root,engine){
        const list=root.querySelector('#queue-list'),summary=root.querySelector('#queue-summary');
        const notice=root.querySelector('#queue-notice'),add=root.querySelector('#queue-add');
        let previous;
        const itemCells=new Map();
        function updateItemCounts(jobs,s,active){
            for(const job of jobs){
                const cells=itemCells.get(job.id);
                if(!cells)continue;
                const acquired=s?.adv?queueItemAcquired(job,s,job===active?engine:null):job.itemAcquired;
                const values=[job.settings.itemQuantity,s?.adv?ownedItems(s,job.settings.itemId):null,acquired];
                values.forEach((value,i)=>{
                    const text=value==null?'未记录':value.toLocaleString('zh-CN');
                    if(cells[i].textContent!==text)cells[i].textContent=text;
                });
            }
        }
        return function renderQueue(s,locked,pending,editingJob,error,planned=engine.queue){
            const ready=!!engine.account&&(!s||accountId(s)===engine.account);
            const canEdit=ready;
            const active=engine.queueRunning&&(engine.running||engine.suspended)?engine.queue[engine.queueIndex]:null;
            const next=engine.queueRunning&&active?pending.find(job=>job.id!==active.id):pending[0];
            const title=ready?(planned.length?`${pending.length} 项待处理 · ${planned.length-pending.length} 项已结束`:'队列为空'):'进入游戏后管理任务队列';
            if(summary.textContent!==title)summary.textContent=title;
            add.disabled=!canEdit;
            add.textContent=editingJob?'继续编辑':'配置新任务';
            const nextLabel=next?`下一项 · ${next.title}`:'';
            const message=error||(ready&&!s?.adv?`游戏存档暂不可用，正在编辑账号 ${engine.account} 的任务队列。`:editingJob?'保存或取消当前编辑后，可继续运行队列。':
                engine.queueEdits?.length?'队列修改已保存。当前项结束或重新启动队列时按新设置执行。':locked?[engine.status,nextLabel].filter(Boolean).join(' · '):nextLabel);
            notice.hidden=!message;
            if(notice.textContent!==message)notice.textContent=message;
            const jobs=ready?planned:[];
            const signature=JSON.stringify([canEdit,active?.id,!!engine.manual,!!engine.suspended,editingJob,
                jobs.map(job=>[job.id,job.title,job.status,job.result,!!job.progress,job.settings.mode,job.settings.moneyTarget])]);
            if(previous===signature){updateItemCounts(jobs,s,active);return;}
            previous=signature;
            const expanded=new Set([...list.querySelectorAll('[data-queue-more][aria-expanded="true"]')].map(button=>button.dataset.queueMore));
            itemCells.clear();
            const fragment=document.createDocumentFragment();
            for(const [index,job] of jobs.entries()){
                const card=document.createElement('li');card.className='queue-job';card.dataset.queueJob=job.id;
                const isActive=job===active;
                if(isActive)card.setAttribute('aria-current','step');
                const head=document.createElement('div');head.className='queue-job-head';
                const order=document.createElement('span');order.className='queue-position';order.textContent=String(index+1);order.setAttribute('aria-hidden','true');
                const label=document.createElement('strong');label.textContent=job.title;
                const chip=document.createElement('span');chip.className='queue-state';
                chip.dataset.state=isActive?engine.suspended||engine.manual?'paused':'running':job.status==='running'?'paused':job.status;
                chip.textContent={pending:'待执行',running:'运行中',paused:job.progress||isActive?'可续跑':'已暂停',done:'已完成',skipped:'已跳过',failed:'待处理'}[chip.dataset.state];
                head.append(order,label,chip);card.append(head);
                if(job.settings.mode==='item'){
                    const stats=document.createElement('dl');stats.className='queue-item-counts';
                    const cells=[];
                    for(const caption of ['目标刷取','当前持有','本项已刷']){
                        const group=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');
                        term.textContent=caption;group.append(term,value);stats.append(group);cells.push(value);
                    }
                    itemCells.set(job.id,cells);card.append(stats);
                }
                const detail=job.result||((job.settings.mode==='money'&&!job.settings.moneyTarget&&queueJobPending(job))?'未设置金币目标，后续任务会等待。':'');
                if(detail){const text=document.createElement('p');text.className='queue-job-detail';text.textContent=detail;card.append(text);}
                const actions=document.createElement('div');actions.className='queue-job-actions';
                const more=document.createElement('button'),secondary=document.createElement('div');
                more.type='button';more.textContent='更多';more.dataset.queueMore=job.id;
                more.setAttribute('aria-label','更多操作：'+job.title);
                secondary.className='queue-secondary';secondary.hidden=!expanded.has(job.id);
                more.setAttribute('aria-expanded',String(!secondary.hidden));
                more.onclick=()=>{
                    secondary.hidden=!secondary.hidden;
                    more.setAttribute('aria-expanded',String(!secondary.hidden));
                };
                const buttons=[['edit','编辑'],['up','上移'],['down','下移']];
                if(queueJobPending(job))buttons.push(['skip','跳过']);
                if(job.progress||job.status!=='pending')buttons.push(['retry','重置进度']);
                buttons.push(['remove','移除']);
                for(const [action,text] of buttons){
                    const button=document.createElement('button');button.dataset.job=job.id;button.dataset.jobAction=action;
                    button.textContent=text;button.setAttribute('aria-label',`${text}：${job.title}`);
                    if(action==='retry')button.title='清除该项助手进度和任务内用量，从头运行';
                    button.disabled=!canEdit||!!editingJob||action==='up'&&index===0||action==='down'&&index===jobs.length-1;
                    (['edit','up','down'].includes(action)?actions:secondary).append(button);
                }
                actions.append(more,secondary);
                card.append(actions);fragment.append(card);
            }
            if(ready&&!jobs.length){
                const empty=document.createElement('li');empty.className='queue-empty';empty.textContent='从「任务」配置目标，再点「加入队列」。按列表顺序执行。';fragment.append(empty);
            }
            updateItemCounts(jobs,s,active);
            list.replaceChildren(fragment);
        };
    }

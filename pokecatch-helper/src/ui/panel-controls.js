    const PANEL_LOG_LEVELS={info:'信息',ok:'完成',warn:'警告',error:'错误'};

    function panelOption(value,label){
        const option=document.createElement('option');
        option.value=String(value);option.textContent=label;
        return option;
    }

    function renderTaskExplanation(node,engine,{goalLabel,goalValue,hint,actionText,activeLabel,wait}){
        const active=engine.running||engine.suspended;
        const target=active&&(engine.driver.pendingMap?.row||engine.preparation?.route||engine.target);
        const goal=[activeLabel,goalLabel,goalValue,target?.name].filter(Boolean).join(' · ');
        let why=active&&engine.preparation?.context?.label?'完成补练后回到'+engine.preparation.context.label:target?.prepNote||hint;
        if(target&&Number.isFinite(target.rate)&&['money','train','item'].includes(engine.settings.mode)){
            const unit={money:'₽',train:'EXP',item:'个'}[engine.settings.mode];
            why=target.name+' · '+(target.measured?'含实测':'估算')+'每分钟 '+Number(target.rate.toFixed(2)).toLocaleString()+' '+unit;
        }
        const next=wait?.detail||(!active?'点击开始当前任务':engine.driver.navigation?'打开'+(engine.driver.navigation.name||engine.driver.navigation.screen):engine.driver.pendingMap?.row?'切换至'+engine.driver.pendingMap.row.name:actionText);
        [goal,why,next].forEach((value,i)=>{const cell=node.children[2*i+1];if(cell.textContent!==value)cell.textContent=value;});
    }

    function renderHealthFacts(node,report,now){
        const stamp=value=>Number.isFinite(value)&&value>0?new Date(value).toLocaleTimeString('zh-CN',{hour12:false})+' · '+Math.max(0,Math.floor((now-value)/1000))+' 秒前':'尚未观察到';
        const describe=value=>value||'待验证';
        const socket={unknown:'尚未观察到',connecting:'连接中',open:'已连接','closed-client':'客户端关闭','closed-clean':'正常关闭','closed-abnormal':'异常关闭'};
        const entries=[
            ['游戏页',report.hidden==null?'未知':report.hidden?'后台':'前台'],['浏览器网络',report.online==null?'未知':report.online?'在线':'离线'],
            ['最后成功读档',stamp(report.saveReadAt)],['最近存档变化',stamp(report.saveChangedAt)],['最近任务进展',stamp(report.progressAt)],
            ['动画帧',stamp(report.frameAt)],['后台保活心跳',stamp(report.heartbeatAt)],['最近网络应答',stamp(report.networkAt)+(report.networkStatus?' · HTTP '+report.networkStatus:'')],
            ['连续网络失败',String(report.networkFailures||0)],['网络离线',stamp(report.offlineAt)],['网络恢复',stamp(report.onlineAt)],
            ['实时连接',socket[report.socketState]||socket.unknown],['实时连接变化',stamp(report.socketAt)],['异常关闭计数',String(report.socketFailures||0)],
            ['存档布局',describe(report.compatibility?.layout)],['游戏构建',describe(report.compatibility?.build)],['关键控件',describe(report.compatibility?.controls)],
            ...Object.entries({map:'地图',underground:'地下',raid:'团体战'}).map(([key,label])=>[label+'页控件',describe(report.compatibility?.pages?.[key])])
        ];
        entries.forEach(([key,value],i)=>{
            if(!node.children[i*2]){const dt=document.createElement('dt');dt.textContent=key;node.append(dt,document.createElement('dd'));}
            const cell=node.children[i*2+1];if(cell.textContent!==value)cell.textContent=value;
        });
    }

    function mountPanelAppearance(root,host,ui,save){
        const select=root.querySelector('#panel-theme'),button=root.querySelector('#panel-expand'),style=root.querySelector('style'),panel=root.querySelector('.panel');
        let systemLight;
        try{if(typeof window.matchMedia==='function')systemLight=window.matchMedia('(prefers-color-scheme: light)');}catch{}
        let lightStyle;
        function apply(){
            const mode=['light','dark'].includes(ui.theme)?ui.theme:'system';
            select.value=mode;
            const scheme=mode==='system'?(systemLight?.matches?'light':'dark'):mode;
            if(host.dataset.scheme!==scheme){
                host.dataset.scheme=scheme;
                style.textContent=scheme==='dark'?PANEL_STYLE:(lightStyle??=lightPanelStyles(PANEL_STYLE));
            }
            const full=!!ui.expanded&&!ui.folded;
            host.classList.toggle('pc-full-panel',full);
            if(full){panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','PokéCatch 自动助手');}
            else{panel.removeAttribute('role');panel.removeAttribute('aria-modal');panel.removeAttribute('aria-label');}
            button.setAttribute('aria-pressed',String(full));
            button.textContent=full?'还原':'铺满';
            button.title=full?'还原浮动面板':'铺满当前游戏窗口';
        }
        select.addEventListener('change',()=>{ui.theme=select.value;save();apply();});
        button.addEventListener('click',()=>{ui.expanded=!ui.expanded;save();apply();});
        root.addEventListener('keydown',event=>{
            if(event.defaultPrevented||!ui.expanded||ui.folded)return;
            if(event.key==='Tab'){
                const controls=[...panel.querySelectorAll('button,input,textarea,select,a[href],summary,[tabindex]')]
                    .filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length&&!el.closest('.sr-only'));
                const first=controls[0],last=controls.at(-1);
                if(first&&((event.shiftKey&&root.activeElement===first)||(!event.shiftKey&&root.activeElement===last))){
                    event.preventDefault();(event.shiftKey?last:first).focus();
                }
                return;
            }
            if(event.key!=='Escape')return;
            if(event.target.matches('input,select,textarea,[contenteditable=true]'))return;
            event.preventDefault();event.stopPropagation();ui.expanded=false;save();apply();button.focus({preventScroll:true});
        });
        try{
            if(typeof systemLight?.addEventListener==='function')systemLight.addEventListener('change',apply);
            else if(typeof systemLight?.addListener==='function')systemLight.addListener(apply);
        }catch{} // Read-only media queries still provide an initial system theme.
        apply();
        return apply;
    }

    function logStopText(stop){
        if(!stop)return '';
        const date=value=>Number.isFinite(value)&&value>0?new Date(value).toLocaleString('zh-CN',{hour12:false}):'未记录';
        const lines=['停止时间　'+date(stop.ts),'停止原因　'+stop.reason];
        if(stop.mode)lines.push('任务　'+(MODE_NAMES[stop.mode]||stop.mode));
        if(stop.status)lines.push('停止前状态　'+stop.status);
        if(stop.action)lines.push('停止前动作　'+stop.action);
        if(stop.signals){
            const h=stop.signals;
            lines.push('最后存档变化　'+date(h.saveChangedAt),'最后任务进展　'+date(h.progressAt));
            if(h.networkAt)lines.push('最近网络应答　'+date(h.networkAt)+(h.networkStatus?' · HTTP '+h.networkStatus:''));
        }
        const rows=[...(stop.logs||[])].sort((a,b)=>(a.ts||0)-(b.ts||0));
        for(const row of rows)lines.push([row.time||date(row.ts),PANEL_LOG_LEVELS[row.level]||'信息',row.module,row.text,(row.count>1?'×'+row.count:'')].filter(Boolean).join(' · '));
        return lines.join('\n');
    }

    function mountPanelLogs(root,engine,update){
        const tools=root.querySelector('#log-tools'),level=tools.querySelector('#log-level'),module=tools.querySelector('#log-module');
        const copy=tools.querySelector('#copy-stop'),result=tools.querySelector('#copy-stop-result'),fallback=tools.querySelector('textarea');
        let displayedAccount=null;
        const caption=key=>({core:'运行',engine:'运行',task:'任务',recovery:'恢复',health:'运行状态',queue:'队列',team:'配队',network:'网络',ui:'界面',runtime:'运行时',automation:'自动化',storage:'存储',lifecycle:'页面',shiny:'异色',route:'路线',nursery:'孵蛋',underground:'地下',manual:'手动操作'}[key]||key);
        level.onchange=module.onchange=update;
        copy.onclick=async()=>{
            const text=logStopText(engine.lastStop);
            if(!text)return;
            try{
                if(!navigator.clipboard?.writeText)throw Error();
                await navigator.clipboard.writeText(text);result.textContent='已复制最近一次停机过程';fallback.hidden=true;
            }catch{
                fallback.hidden=false;fallback.value=text;fallback.focus();fallback.select();
                let copied=false;try{copied=document.execCommand('copy');}catch{}
                result.textContent=copied?'已复制最近一次停机过程':'记录已选中，可使用系统复制';if(copied){fallback.hidden=true;copy.focus();}
            }
        };
        function controls(show){
            tools.hidden=!show;
            if(displayedAccount!==engine.account){
                displayedAccount=engine.account;result.textContent='';fallback.value='';fallback.hidden=true;module.value='';level.value='';
            }
            if(!show)return;
            copy.disabled=!engine.lastStop;
            const modules=[...new Set(engine.logHistory().map(row=>row.module||'core'))].sort();
            if(module.dataset.keys!==JSON.stringify(modules)){
                const selected=module.value;
                module.replaceChildren(panelOption('','全部模块'),...modules.map(key=>panelOption(key,caption(key))));
                module.value=modules.includes(selected)?selected:'';module.dataset.keys=JSON.stringify(modules);
            }
        }
        function draw(view){
            const history=engine.logHistory();
            const rows=history.filter(row=>(!module.value||(row.module||'core')===module.value)&&
                (!level.value||(level.value==='issues'?['warn','error'].includes(row.level):(row.level||'info')===level.value)));
            for(const row of rows){
                const line=document.createElement('div'),time=document.createElement('time'),source=document.createElement('span');
                line.className='log';line.dataset.level=row.level||'info';time.textContent=row.time;
                source.className='log-source';source.textContent=[PANEL_LOG_LEVELS[row.level]||'信息',caption(row.module||'core')].join(' · ');
                line.append(time,source,row.text+(row.count>1?' ×'+row.count:''));view.appendChild(line);
            }
            if(!rows.length)view.append(history.length?'没有符合筛选的记录。':'开始运行后将在这里记录切图、收益与停止原因。');
        }
        return{controls,draw,filterKey:()=>[level.value,module.value]};
    }

    function updateMiniActions(root,engine,s,now,itemSummary){
        const eggs=readyBackgroundEggs(s,now).length,slots=s?.under?.slots?.length?undergroundStatus(s,now):null;
        const due=slots?.ready.length||0,failed=engine.queue.filter(job=>job.status==='failed').length;
        const time=ts=>localCalendarTime(ts);
        const future=[
            [engine.running?engine.nextWake:null,'任务'],
            [engine.suspended?.retryAt,'恢复'],
            ...((s?.pension?.eggs||[]).map(egg=>[egg.hatchAt,'孵蛋'])),
            ...((slots?.running||[]).map(slot=>[Number(slot.end),'地下']))
        ].filter(([at])=>Number.isFinite(at)&&at>now).sort((a,b)=>a[0]-b[0])[0];
        const net=engine.started?engine.sessionMoneyNet(s):null;
        const values={logs:(!engine.running&&!engine.suspended&&engine.lastStop)?'停机记录':'',eggs:eggs?'蛋可领 '+eggs:'',underground:due?'地下归队 '+due:'',queue:failed?'队列需处理 '+failed:'',
            next:future?future[1]+' '+time(future[0]):'',gain:itemSummary||(Number.isFinite(net)?'净收益 '+(net>0?'+':'')+net.toLocaleString()+' ₽':'')};
        for(const button of root.querySelectorAll('[data-mini-link]')){
            const key=button.dataset.miniLink,text=values[key];
            button.hidden=!text;
            if(button.textContent!==text)button.textContent=text;
            if(key==='next')button.dataset.nextTarget=({'孵蛋':'eggs','地下':'underground'}[future?.[1]]||'activity');
        }
    }

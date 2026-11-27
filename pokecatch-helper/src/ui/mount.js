    // Userscript worlds have separate window properties but share the document.
    // A live listener, unlike a saved marker, disappears with its world.
    const ownerEvent='pokecatch-helper:owner',showEvent='pokecatch-helper:show';
    const requestOwner=type=>!document.dispatchEvent(new Event(type,{cancelable:true}));
    const mountedHost=()=>{
        const node=document.getElementById('pokecatch-auto-helper'),shadow=node?.shadowRoot;
        return node?.isConnected&&shadow?.querySelector('.panel #fold')&&shadow.querySelector('.mini')?node:null;
    };
    const previousHelper=window.__pokecatchHelper;
    function showExisting(){
        if(requestOwner(showEvent))return true;
        if(typeof previousHelper?.show==='function'){
            try{previousHelper.show();}catch{}
        }
        const node=mountedHost();
        if(!node)return false;
        revealHost(node);
        if(node.shadowRoot.querySelector('.panel').classList.contains('hidden'))node.shadowRoot.querySelector('.mini').click();
        return true;
    }
    if(requestOwner(ownerEvent)){
        restorePanel=showExisting;startupPhase='复用已挂载实例';
        if(!mountedHost())requestOwner(showEvent);
        return;
    }
    // A 7.x/8.0 host in another world has no public JS API in this one.
    if(previousHelper?.ready!==false&&(mountedHost()||previousHelper?.show&&showExisting())){
        restorePanel=showExisting;startupPhase='复用已挂载实例';return;
    }
    const recoveringLegacy=!!previousHelper||!!document.getElementById('pokecatch-helper-recovery');
    if(previousHelper){
        try{previousHelper.stop?.();}catch(error){
            if(previousHelper.ready===true)throw new Error('旧实例无法停止，请刷新游戏页重新加载助手');
        }
        if(previousHelper.ready===false){
            try{previousHelper.show=()=>requestOwner(showEvent);}catch{}
        }
    }
    document.getElementById('pokecatch-auto-helper')?.remove();
    let helperStorage,storageError;
    try{helperStorage=window.localStorage;helperStorage.getItem(SAVE_KEY);}
    catch(err){
        storageError='浏览器存储不可用：'+(err?.message||err);
        const memory=new Map();helperStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
    }
    const engine = new Engine(helperStorage);
    if(storageError)engine.status=storageError;
    const helperAPI={version:VERSION,ready:false,stop:()=>engine.stop('手动停止助手')};
    const life=new AbortController();
    engine.observeGameTab(document,life.signal);
    let ownedHost=null,heartbeatTimer=null;
    document.addEventListener(ownerEvent,event=>event.preventDefault(),{signal:life.signal});
    document.addEventListener(showEvent,event=>{
        event.preventDefault();
        if(helperAPI.ready)helperAPI.show();
    },{signal:life.signal});
    window.__pokecatchHelper=helperAPI;
    startupPhase='准备挂载面板';

    function trainingEtaText(eta,now,targetRank,paused){
        const label='预计完成时间';
        if(paused)return label+' · 已暂停，恢复后重算';
        if(!eta)return label+' · 等待练级路线和有效经验速度';
        const stamp=minutes=>localCalendarTime(now+minutes*60000);
        const minutes=Math.ceil(eta.minutes),hours=Math.floor(minutes/60);
        const duration=hours?hours+' 小时'+(minutes%60?' '+minutes%60+' 分钟':''):minutes+' 分钟';
        const scope=eta.rankMinutes?'（本阶）':eta.capped?'（至当前等级上限）':'';
        const current=minutes?stamp(eta.minutes)+'（约 '+duration+'，'+(eta.measured?'本图实测':'路线估算')+'）':'已达标';
        const ranks=eta.rankMinutes?' · 若能连续升阶，'+targetRank+' 阶满级约在 '+stamp(eta.rankMinutes):'';
        return label+scope+' · '+current+ranks;
    }
    function mount() {
        if(life.signal.aborted)return;
        if (!document.body){startupPhase='等待页面主体';return setTimeout(mount,500);}
        try{
        const host = document.createElement('div');ownedHost=host;host.id = 'pokecatch-auto-helper';
        host.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;position:fixed;right:14px;top:86px;z-index:2147483000;max-width:calc(100vw - 20px);';
        const root = host.attachShadow({ mode: 'open' });
        const underStartControls = `<label class="field"><span>地下探险出发层</span><select data-setting="underStartChoice"><option value="auto">最高已解锁层</option>${UNDER_START_FLOORS.map(n=>`<option value="${n}">第 ${n} 层</option>`).join('')}</select></label><div class="hint" data-under-start-note></div><label class="field"><span>地下探险配队</span><select data-setting="underGoal"><option value="depth">冲层 · 优先连战和守卫</option><option value="money">刷金币 · 优先每小时收益</option><option value="native">自动优化 · 地下探险优先（游戏推荐）</option></select></label><div class="hint">自动优化可派出主队成员，确认出发后会重新检查当前任务的队伍。</div>`;
        const purchaseToggle = `<label class="purchase-toggle">
            <strong>自动购买</strong><span data-purchase-state aria-hidden="true"></span>
            <input type="checkbox" role="switch" data-setting="autoPurchase" aria-label="自动购买">
        </label>`;
        const roamingBallControl = mode => `<div class="roam-ball-control" hidden>
            <label><input type="checkbox" data-setting="roamAllowMasterBall" aria-describedby="roam-ball-${mode}">允许游荡战消耗背包大师球</label>
            <strong data-roam-ball-stock="${mode}"></strong>
            <p class="hint" id="roam-ball-${mode}">赢下游荡战时，游戏会自动用掉背包里的 1 个大师球并必中。关闭时，助手跳过会用球的主动追踪。异色团体战的保底单独计数。</p>
        </div>`;
        root.innerHTML = `<style>${PANEL_STYLE}</style><div class="mini-bar hidden"><button class="mini" aria-controls="helper-panel" title="展开助手">ϟ PokéCatch <span id="mini-state">待命</span></button><div class="mini-links" aria-label="待办与进度"><button data-mini-link="logs" hidden></button><button data-mini-link="eggs" hidden></button><button data-mini-link="underground" hidden></button><button data-mini-link="queue" hidden></button><button data-mini-link="next" hidden></button><button data-mini-link="gain" hidden></button></div></div><section class="panel" id="helper-panel">
            <header title="拖动标题栏移动面板"><span class="logo">ϟ</span><b>PokéCatch 自动助手</b><span class="tag">${VERSION}</span><button id="check-update" title="检查 Catch 仓库的在线更新">在线更新</button><button id="panel-expand" type="button" aria-pressed="false">铺满</button><button id="fold" aria-label="收起助手">−</button></header>
            <nav class="workspace-nav" aria-label="助手面板">
                <button data-workspace="tasks" aria-controls="pane-tasks">任务</button>
                <button data-workspace="queue" aria-controls="pane-queue">任务队列</button>
                <button data-workspace="dex" aria-controls="pane-dex">图鉴</button>
                <button data-workspace="weather" aria-controls="pane-weather">天气</button>
                <button data-workspace="eggs" aria-controls="pane-eggs">孵蛋</button>
                <button data-workspace="activity" aria-controls="pane-activity">运行实况</button>
                <button data-workspace="settings" aria-controls="pane-settings">设置</button>
            </nav><div class="content"><div id="update-notice" class="update-notice hidden" role="status" aria-live="polite"></div><details id="update-tools" class="hidden"><summary>更新源与连接状态</summary><div class="row"><select id="update-source" aria-label="选择在线更新源"><option value="auto">自动切换（推荐）</option>${UPDATE_SOURCES.map(source=>`<option value="${source.id}">${source.name}</option>`).join('')}</select><button id="recheck-update">重新检查</button></div><div id="update-source-list"></div><div class="row"><button id="download-update" disabled>下载已校验脚本</button></div><div class="hint">取得最新提交后优先固定版本；分支缓存仅表示暂未发现更新。安装页打不开时，可下载本次校验的脚本，再用油猴导入。</div></details><div class="status" role="status" aria-live="polite"><div class="live"><i class="dot"></i><span id="run-state">READY · 已就绪</span></div><strong id="status"></strong><div class="sub" id="action"></div></div>
            <div id="gate-guide" class="gate-guide" hidden><div><strong id="gate-title"></strong><div class="sub" id="gate-next"></div></div><button type="button" id="gate-details">查看条件</button></div>
            <button type="button" id="spirit-conditions" data-lookup="442" hidden>查看花岩怪获取条件</button>
            <div class="metrics"><div class="metric"><b id="dex-value">—</b><span id="primary-label">进化链完成</span></div><div class="metric" title="合计当前钱包及跨地区暂存的钱包余额"><b id="money-value">0</b><span id="money-label">本次金币净增</span></div><div class="metric"><b id="time-value">0:00</b>本次运行</div></div>
            <details id="season-calendar" class="season-calendar"><summary><span>游戏季节</span><strong></strong><span class="season-remaining"></span></summary><div class="season-period"></div><div class="season-next"></div></details>
            <div class="target hidden" id="prepare-info"><b id="prepare-title"></b><div class="sub" id="prepare-target"></div><div class="sub" id="prepare-route"></div><div class="sub" id="prepare-levels"></div><div class="sub" id="prepare-buddy"></div><div class="sub" id="prepare-assessment"></div><div class="bar"><i id="prepare-bar"></i></div><div class="sub" id="prepare-eta"></div></div>
            <section id="pane-tasks" aria-label="任务"><div id="queue-edit-note" class="queue-notice" hidden></div><div class="caption">选择任务</div><select data-setting="mode" class="sr-only" aria-label="任务模式">${Object.entries(MODE_NAMES).map(([id,name]) => `<option value="${id}">${name}</option>`).join('')}</select>
            <div class="categories" role="group" aria-label="任务分类"><button data-category="adventure" class="on">冒险</button><button data-category="collect">收集与养成</button><button data-category="battle">独立活动</button><button data-category="resource">资源</button></div>
            <div class="modes">${[['dex','◈','补齐图鉴','adventure'],['money','₽','自动刷钱','adventure'],['progress','➜','推进主线','adventure'],['daily','☀','通关日常','adventure'],['legend','✦','指定传说','collect'],['roam','⌖','游荡捕获','collect'],['shiny','✧','野生刷闪','collect'],['breed','◌','繁殖孵蛋','collect'],['train','↑','目标练级','collect'],['underground','⛏','地下通道','battle'],['tower','▥','对战塔','battle'],['candy','◬','糖果工厂','battle'],['elite','♜','精英联盟','battle'],['world','◎','世界首领','battle'],['item','▣','刷指定道具','resource'],['resource','＋','采购与使用','resource']].map(([id,icon,name,group]) => `<button data-mode="${id}" data-group="${group}" aria-pressed="false"><span>${icon}</span>${name}</button>`).join('')}</div>
            <section class="target hidden" id="daily-routine" aria-label="通关日常设置">
                <label class="field"><span>每日主线</span><select data-setting="dailyMain"><option value="current">沿用当前挂机任务</option><option value="dex">补图鉴</option><option value="money">刷钱</option><option value="shiny">野生刷闪</option><option value="train">目标练级 / 培育</option><option value="legend">传说战</option></select></label>
                <div id="daily-legend-fields"></div><div id="daily-train-fields"></div>
                <div class="sub" id="daily-state"></div>
                <button type="button" id="daily-edit-goal">打开主线目标设置</button>
                <button type="button" data-open-raid-insight>查看团体战候选与历史</button>
                <div class="checks">
                    <label><input type="checkbox" data-setting="dailyWindow">抢即将结束的图鉴窗口</label>
                    <label><input type="checkbox" data-setting="dailyCandy">糖果工厂免费场</label>
                    <label><input type="checkbox" id="daily-shiny-raid">每日异色团体战</label>
                    <label><input type="checkbox" data-setting="dailyRaidUntilCaught">开战后持续到捕获</label>
                    <label><input type="checkbox" data-setting="dailyWorld">世界首领攻击与捕获</label>
                    <label><input type="checkbox" data-setting="dailyTower">每天最多一场对战塔</label>
                    <label><input type="checkbox" data-setting="dailyElite">每日挑战一阶精英联盟（落败即跳过）</label>
                </div>
                <p class="hint">符合条件时，优先收成熟蛋、领地下归队奖励并补派空闲队伍，再继续日常或原任务。沿用自动收蛋、地下派遣和领取开关。捕获窗口沿用补图鉴筛选。</p>
            </section><div class="target" id="ordinary-target">
                <div class="field" id="scope-field"><span>规划范围</span><select data-setting="region" aria-label="规划地区"><option value="current">当前地区</option><option value="all">所有已解锁地区</option></select></div>
                <div data-fields="legend" class="hidden">
                    <details id="legend-picker" class="legend-picker">
                        <summary><strong>传说目标</strong><span id="legend-selection"></span></summary>
                        <details id="legend-order"><summary>挑战顺序</summary><ol aria-label="传说挑战优先顺序"></ol></details>
                        <div class="legend-tools">
                            <input type="search" id="legend-search" placeholder="搜宝可梦、地点或地区" aria-label="搜索传说目标">
                            <button type="button" id="legend-all" title="选中所有地区的传说目标">全选</button>
                            <button type="button" id="legend-clear" title="取消所有地区的已选传说目标" aria-label="取消全部已选传说目标">取消</button>
                        </div>
                        <div id="legend-checks" class="legend-list"></div>
                        <div id="legend-empty" class="hint" role="status" hidden>没有匹配的传说目标。</div>
                        <div class="legend-footer"><span id="legend-count" role="status"></span><span id="legend-instruction"></span></div>
                    </details>
                    <p id="legend-window-wait" class="hint" role="status" hidden></p>
                    <div class="field"><span>完成条件</span><select data-setting="legendTier" aria-label="传说战完成条件"><option value="0">普通捕获（全部轮换形态）</option>${[1,2,3,4,5].map(t => `<option value="${t}">精英推进至 ${t} 阶</option>`).join('')}</select></div>
                    <div class="field"><span>单场时限（分钟）</span><input data-setting="legendMinutes" type="number" min="0" max="720" aria-label="传说战时限，0 为不限时"></div>
                    ${roamingBallControl('legend')}<div class="hint" id="legend-elite-team-hint" hidden></div><div class="hint">睡前挂机可填 0 持续挑战，也可填 5–720 分钟限时。助手按目标完成情况切换。游荡目标的普通捕获会转为在线追踪；精英入口仅用于挑战阶级。普通传说战与游荡目标不能刷异色。</div>
                </div>
                <div data-fields="roam" class="hidden"><div class="field"><span>游荡目标</span><select data-setting="roamId" aria-label="游荡宝可梦目标"></select></div><div class="field"><span>搜寻时限（分钟）</span><input data-setting="roamMinutes" type="number" min="0" max="720" aria-label="游荡搜寻时限，0 为不限时"></div>${roamingBallControl('roam')}<div class="hint">填 0 持续在线追踪，或填 5–720 分钟限时。捕获确认后完成。游荡目标为普通色；真正离线不会产生新遭遇。</div></div>
                <div data-fields="item" class="hidden"><div class="field"><span>搜索道具</span><input id="item-search" type="search" placeholder="名称或英文编号" aria-label="筛选道具"></div><div class="field"><span>道具目标</span><select data-setting="itemId" aria-label="道具目标"></select></div><div class="field"><span>本次获取</span><input data-setting="itemQuantity" type="number" min="1" max="99999" aria-label="本次道具数量"></div><div id="item-field-insight"></div></div>
                <div data-fields="train" class="hidden"><div class="field"><span>快捷选择</span><select data-setting="trainUid" aria-label="练级对象"><option value="team">当前冒险队伍 · 全队</option></select></div><fieldset class="trainee-list"><legend id="train-count">练级目标</legend><div id="train-members" class="checks"></div><details id="train-pc-field"><summary>从电脑勾选成员</summary><input id="train-search" type="search" placeholder="名称、编号或成员 UID" aria-label="搜索电脑成员"><div id="train-pc" class="checks"></div><button type="button" id="train-more">显示更多成员</button></details><small id="train-selection-hint"></small></fieldset><div class="field"><span>目标等级</span><input data-setting="trainLevel" type="number" min="1" max="100" aria-label="目标等级"></div><label id="train-gems-toggle"><input data-setting="trainGems" type="checkbox">使用库存宝石升阶（指定目标 · Lv.100）</label><div id="train-rank-settings"><label class="field"><span>目标阶数</span><input type="number" data-setting="trainRank" min="1" max="5"></label><small>仅对指定的最终形态生效。目标等级设为 100 后，升阶会回到 Lv.5，再练至 Lv.100。每颗宝石占一份道具额度。</small></div></div>
                <div data-fields="progress" class="hidden"><div class="field"><span>完成章节</span><select data-setting="progressUntil" aria-label="主线目标章节"></select></div><label class="setting"><span><input type="checkbox" data-setting="autoTravel">达到条件后自动跨地区开局</span></label></div>
                <fieldset id="hunt-filters" style="min-width:0;margin:8px 0;padding:9px;border:1px solid #40516a;border-radius:8px">
                    <legend>搜寻条件</legend>
                    <details><summary id="hunt-species-summary"></summary>
                        <input id="hunt-search" type="search" aria-label="搜索目标物种" placeholder="中文名、英文名或编号">
                        <div class="field"><select id="hunt-picker" aria-label="可添加的物种"></select><button type="button" id="hunt-add">添加</button></div>
                        <div id="hunt-selected" class="missing" aria-label="已选物种"></div>
                    </details>
                    <details id="hunt-region-controls"><summary id="hunt-region-summary"></summary><div id="hunt-regions" class="checks"></div></details>
                    <details><summary id="hunt-weather-summary"></summary><div id="hunt-weather" class="checks"></div></details>
                    <label class="field"><span>等待捕捉天气时</span><select data-setting="huntWeatherFallback"><option value="wait">原地等待</option><option value="money">去刷钱</option><option value="xp">练级</option></select></label><div id="weather-train-fields"></div>
                    <div id="hunt-help" class="hint"></div>
                </fieldset><button type="button" id="hunt-forecast">查看地区天气预报</button>
                <div data-fields="breed" class="hidden"><div class="field"><span>孵化目标</span><select data-setting="breedId" aria-label="繁殖物种"></select></div><div class="field"><span>孵化数量</span><input data-setting="breedGoal" type="number" min="1" max="9999"></div><label class="setting"><span><input type="checkbox" data-setting="breedShiny">孵到目标异色为止</span></label><label class="setting"><span><input type="checkbox" data-setting="pensionExpand">预算内购买繁殖必需的寄养位</span></label></div>
                <div data-fields="underground" class="hidden"><div class="field"><span>领取次数</span><input data-setting="underRuns" type="number" min="1" max="999"></div>${underStartControls}<label class="setting"><span><input type="checkbox" data-setting="underOpenGeodes">领取完后开启背包中的晶洞</span></label></div>
                <div data-fields="tower" class="hidden"><div class="field"><span>目标楼层</span><input data-setting="towerFloor" type="number" min="1" max="999"></div><div class="field"><span>尝试上限</span><input data-setting="towerRuns" type="number" min="1" max="100"></div></div>
                <div data-fields="candy" class="hidden"><div class="field"><span>目标层（0 尽力挑战）</span><input data-setting="candyFloor" type="number" min="0" max="999"></div><div class="field"><span>完成场次（每天一次）</span><input data-setting="candyRuns" type="number" min="1" max="30"></div></div>
                <div data-fields="elite" class="hidden"><div class="field"><span>联盟地区</span><select data-setting="eliteRegion"><option value="current">当前地区</option>${DATA.regions.map(r=>`<option value="${r.key}">${r.name}</option>`).join('')}</select></div><div class="field"><span>目标阶级</span><select data-setting="eliteTier">${[1,2,3,4,5].map(n=>`<option value="${n}">推进至 ${n} 阶</option>`).join('')}</select></div></div>
                <div data-fields="world" class="hidden"><div class="field"><span>本次攻击</span><input data-setting="worldActions" type="number" min="1" max="3"></div><label class="setting"><span><input type="checkbox" data-setting="worldCapture">攻击后等待开放，并自动捕获本期首领</span></label></div>
                <div data-fields="resource" class="hidden"><label class="field"><span>目标道具</span><select data-setting="resourceItem"></select></label><label class="field"><span>执行动作</span><select data-setting="resourceAction"><option value="buy">只购买</option><option value="use">只使用背包道具</option><option value="buyUse">不足时购买并使用</option></select></label><label class="field"><span id="resource-quantity-label">目标份数</span><input data-setting="resourceQuantity" type="number" min="1" max="99999"></label><label id="resource-member" class="field"><span>使用对象</span><select data-setting="useUid"><option value="">冒险队伍首位</option></select></label></div>
                <div data-fields="money" class="hidden"><div class="field"><span>目标金币</span><input data-setting="moneyTarget" type="number" min="0" placeholder="0 为持续执行"></div></div>
                <section id="task-purchase" class="purchase-card" hidden>
                    ${purchaseToggle}
                    <div class="hint" id="task-purchase-policy"></div>
                    <div class="purchase-budget"><span data-purchase-status></span><button type="button" id="purchase-edit-budget">查看预算</button></div>
                </section>
                <div class="hint" id="target-hint"></div><div class="hint" id="item-route-choice" hidden></div><dl class="decision-list" id="task-decision" hidden><dt>当前目标</dt><dd></dd><dt>选择依据</dt><dd></dd><dt>下一步</dt><dd></dd></dl><div class="goal"><span id="goal-label">进度</span><span id="goal-value">—</span></div><div class="bar" id="task-progress" role="progressbar" aria-label="任务进度" aria-valuemin="0" aria-valuemax="100"><i></i></div>
            </div>
            <div id="training-eta" class="hint" hidden></div>
            </section>
            <section id="pane-queue" aria-label="任务队列" hidden>
                <div class="queue-heading"><div><h2>任务队列</h2><p id="queue-summary" aria-live="polite"></p></div><button id="queue-add">配置新任务</button></div>
                <p class="queue-notice" id="queue-notice" role="status" hidden></p>
                <ol id="queue-list" class="queue-list"></ol>
            </section>
            <section id="pane-activity" aria-label="运行实况" hidden>
            <section id="execution-info" class="execution-card" aria-label="任务执行状态" aria-live="polite"><div class="execution-top"><span>任务执行</span><span id="ui-owner"></span></div><strong id="foreground-task">未启动主任务</strong><div id="foreground-detail"></div><div id="background-services"></div><details id="decision-info"><summary>路线与配队依据</summary><div class="sub" id="execution-route"></div><div class="sub" id="execution-team"></div><div class="sub" id="execution-reason"></div><div class="sub" id="execution-environment"></div></details><div id="concurrency-note">主任务串行 · 后台计时可并行 · 页面操作依次执行</div></section>
            <details id="parallel-rules"><summary>并行与串行规则</summary><table><tbody><tr><td>推图 / 刷钱 / 练级 / 捕获</td><td>同一路线，只运行一个规划；同场自然产生多种收益</td></tr><tr><td>团体战 / 传说 / 塔 / 工厂</td><td>共享活动槽，按顺序挑战</td></tr><tr><td>寄养 / 孵蛋 / 地下探险计时</td><td>原生计时可与前台任务并行</td></tr><tr><td>成熟蛋 / 地下归队</td><td>普通战斗和传说战期间可先收成熟蛋，再领归队奖励，领取后返回原页面</td></tr><tr><td>神奥后自动地下派遣</td><td>冲层和刷金币使用空闲队员，保留主队、Buddy 和任务成员；自动优化优先使用游戏推荐的地下队伍</td></tr><tr><td>免费进化</td><td>等待战斗结束后处理</td></tr><tr><td>在线更新检查</td><td>独立网络请求，可同时检查</td></tr></tbody></table><div class="hint">入口铭文、游戏选择、配队和消费确认优先处理。地下主任务单独管理派遣次数和晶洞。世界首领护盾攻击机制上可与冒险共存；当前助手仍按独立流程提交，捕获阶段独占活动槽。</div></details>
            <details id="probability-info"><summary>异色概率与收集进度</summary><div class="sub" id="probability-wild"></div><div class="sub" id="probability-eggs"></div><div class="hint">概率表示遭遇或孵化机会，不代表下一次必出。图鉴加成按游戏完整图鉴判定，与助手的基础进化链进度分别计算。</div></details>
            <details id="underground-insight"><summary>地下探险 · 分槽与晶洞</summary><div id="under-field-insight"></div></details>
            <details id="raid-insight"><summary>团体战 · 地区候选与历史</summary><div id="raid-field-insight"></div></details>
            <details id="party-history"><summary>本图队伍实绩</summary><div class="sub"></div></details><details id="casino-insight"><summary>游戏厅收支与弹珠目标</summary><div class="sub"></div></details><details id="health-insight"><summary>运行健康与兼容性</summary><dl class="decision-list" id="health-facts"></dl></details>
            <div class="tabs" role="group" aria-label="运行实况视图"><button data-tab="maps" aria-controls="view">目标与收益</button><button data-tab="logs" aria-controls="view">日志</button></div>
            <div id="log-tools" hidden><div class="log-controls">
                <label>级别<select id="log-level"><option value="">全部级别</option><option value="issues">警告与错误</option><option value="error">错误</option><option value="warn">警告</option><option value="ok">完成</option><option value="info">信息</option></select></label>
                <label>模块<select id="log-module"><option value="">全部模块</option></select></label><button type="button" id="copy-stop">复制最近停机过程</button></div><span role="status" id="copy-stop-result"></span><textarea aria-label="最近停机过程" readonly hidden></textarea></div>
            <div id="yield-metric" role="group" aria-label="地图收益显示方式" hidden>
                <button type="button" data-yield-view="task" aria-controls="view">跟随任务</button>
                <button type="button" data-yield-view="money" aria-controls="view">金币</button>
                <button type="button" data-yield-view="box" aria-controls="view">我的盒子</button>
                <button type="button" data-yield-view="train" aria-controls="view">经验</button>
            </div><div id="view" class="list"></div>
            </section>
            <p id="lookup-empty" role="status" hidden>进入游戏并载入存档后即可查询。</p>
            <section id="pane-dex" aria-label="图鉴" hidden><p id="dex-waiting" class="hint" hidden>载入游戏存档后，可查看图鉴、比较路线和预览持有个体的禁招建议。</p><div id="dex-panel"></div></section>
            <section id="pane-weather" aria-label="天气" hidden><div id="weather-panel" aria-label="地区天气预报"></div></section>
            <section id="pane-eggs" aria-label="孵蛋" hidden></section>
            <section id="pane-settings" aria-label="设置" hidden>
            <section id="settings-purchase" class="purchase-card">
                ${purchaseToggle}
                <div class="hint">控制本账号的道具采购、主线补练买糖和寄养扩容，已入队任务也遵循此开关。</div>
                <div data-purchase-status class="purchase-budget"></div>
                <details id="budget-details"><summary>资源预算 <span id="budget-summary"></span></summary>
                    <div id="purchase-limits" class="sub"></div>
                    <label class="setting">每个任务的金币支出上限（0 禁止）<input data-setting="spendBudget" type="number" min="0"></label>
                    <label class="setting">每日支出上限（0 不另限）<input data-setting="dailySpendBudget" type="number" min="0"></label>
                    <label class="setting">至少保留金币<input data-setting="moneyReserve" type="number" min="0"></label>
                    <label class="setting">每个任务的道具使用上限<input data-setting="useBudget" type="number" min="0" max="99999"></label>
                    <div class="hint">每个新任务单独计数，续跑原任务沿用已花金额和已用份数。每日支出按账号累计，金币保留额每笔检查。</div>
                    <label class="setting"><span><input type="checkbox" data-setting="trainBuff">练级 / 补练自动吃经验树果</span></label>
                    <label class="setting"><span><input type="checkbox" data-setting="moneyBuff">刷钱自动吃金币树果</span></label>
                    <label class="setting"><span><input type="checkbox" data-setting="autoBuff">补图鉴 / 刷闪 / 游荡自动吃对应树果</span></label>
                    <div class="hint">自动吃树果仅使用库存，也受道具使用上限限制。用完后继续原任务。若要购买树果，请指定采购任务。</div>
                </details>
            </section>
            <details class="settings-group"><summary>配队与培养</summary>
            <label class="setting">冒险配队<select data-setting="autoTeam" data-boolean="true"><option value="true">自动配队 · 强度优先</option><option value="false">用户手动配队</option></select></label>
            <label class="setting">特殊战配队<select data-setting="optimizeRaid" data-boolean="true"><option value="true">智能自动配队</option><option value="false">用户手动配队</option></select></label>
            <div class="hint" id="team-policy-hint"></div>
            <label class="setting"><span><input type="checkbox" data-setting="activeSwitch">助手主动换人</span></label><div class="hint" id="switch-hint"></div>
            <label class="setting"><span><input type="checkbox" data-setting="trainBuddy">练级 / 补练自动选择经验搭档 Buddy</span></label><div class="hint">搭档获得 1.3 倍经验。当前搭档仍需培养时会保留，更换会重置搭档的击倒计数。</div>
            <label class="setting" id="prepare-toggle"><span><input type="checkbox" data-setting="autoPrepare"><span id="prepare-toggle-text">等级不足时先补练，再继续原任务</span></span></label>
            <div id="progress-candy-toggle"><label class="setting"><span><input type="checkbox" data-setting="progressCandy">主线补练允许使用 / 购买 EXP Candy</span></label><div class="hint" id="candy-hint">优先使用库存，逐份补购；与资源任务共用消费预算和金币保留额，预算不足改用普通练级。</div></div>
            <div class="hint" id="team-hint">冒险按当前地图配队，途中变更在下个治疗点生效；练级对象会保留。特殊战使用独立队伍。</div>
            <label class="setting"><span><input type="checkbox" data-setting="autoEvolve">普通色自动执行免费等级进化</span></label><div class="hint" id="evolution-hint">普通色的培养规划考虑可达免费进化形态。异色、道具和分支进化由你手动处理。</div>
            </details>
            <details class="settings-group"><summary>战斗与过场</summary>
            <div class="checks"><label><input type="checkbox" data-setting="raids">每日团体战优先</label><label><input type="checkbox" data-setting="animations">继续 / 跳过过场</label><label><input type="checkbox" data-setting="gifts">自动选择赠送</label></div><div class="hint" id="raid-check"></div>
            <button type="button" data-open-raid-insight>查看团体战候选与历史</button>
            </details>
            <details class="settings-group"><summary>地下探索与后台领取</summary>
            <div class="checks background-toggles"><label title="进入神奥后按地下探险配队选项派遣"><input type="checkbox" data-setting="autoUnderDispatch">神奥后自动地下派遣</label><label title="领取已经归队的地下队伍并返回原任务；后台不自动开晶洞"><input type="checkbox" data-setting="autoUnderCollect">自动领取地下归队</label></div><div class="hint">原生计时可并行，页面操作依次处理。地下派遣和归队领取可分别开关；手动队伍不足六人时暂缓后台领取，避免原生自动加人。</div>
            ${underStartControls}<div class="hint">地下主任务和后台派遣共用起点。归队领取后按最高纪录开放 25、50、75、100 层。跳过的楼层没有经验和掉落。</div>
            </details>
            <details class="settings-group"><summary>孵蛋与喂果</summary>
            <label class="setting"><span><input type="checkbox" data-setting="autoEggs">任务中自动领取成熟蛋</span></label>
            <label class="setting"><span><input type="checkbox" data-nursery-pref="idleHatch">待命时自动领取成熟蛋</span></label>
            <label class="setting"><span><input type="checkbox" data-nursery-pref="autoFeed">下一枚自然蛋喂果才闪时自动喂靛莓果</span></label>
            <div class="nursery-feed-permission">
                <label class="setting"><span><input type="checkbox" data-nursery-pref="allowReferenceFeed" aria-describedby="nursery-reference-feed-hint">允许按旧规则预测自动喂果</span></label>
                <div class="hint" id="nursery-reference-feed-hint">游戏规则待核对时也允许按预测喂果，可能消耗靛莓果而未出闪蛋。</div>
            </div>
            <div class="hint">开关按账号保存。助手优先检查下一枚自然蛋，连续几枚都需要靛莓果时会按顺序备果。下一枚需果时，确认已备果才自动收蛋。缺果时保留蛋位。喂果使用库存，任务道具额度用完后仍可喂。</div>
            <div class="hint" id="nursery-auto-note" aria-live="polite"></div>
            </details>
            <details class="settings-group"><summary>面板外观</summary>
            <label class="setting">助手外观<select id="panel-theme"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
            <label class="setting">最小化是否显示额外信息<input type="checkbox" role="switch" id="mini-extra-info"></label>
            </details>
            <div class="hint hidden" id="support-info" aria-live="polite"></div>
            <div class="row"><button id="start" class="primary">开始当前任务</button><button id="start-queue" class="primary">运行任务队列</button><button id="resume" class="primary hidden">立即恢复</button><button id="stop" class="danger" disabled>停止助手</button></div>
            <div class="queue-tools"><button id="add-job">＋ 加入队列</button><button id="open-queue" aria-controls="pane-queue">任务队列 <span id="queue-count">0</span></button><button id="cancel-job" class="hidden">取消编辑</button></div>
            <details><summary>运行设置与自动停止</summary>
                <label class="setting">游戏速度<select data-setting="speed"><option value="1">×1</option><option value="4">×3（最高档）</option></select></label>
                <label class="setting">单图最短采样（分钟）<input data-setting="sampleMinutes" type="number" min="1" max="30"></label>
                <label class="setting">配队复查间隔（分钟）<input data-setting="teamMinutes" type="number" min="1" max="60"></label>
                <label class="setting">补练目标高于对手（级）<input data-setting="prepareMargin" type="number" min="0" max="15"></label>
                <label class="setting">等级落后超过几级补练<input data-setting="prepareGap" type="number" min="0" max="20"></label>
                <label class="setting">补练无经验停止（分钟）<input data-setting="prepareIdleMinutes" type="number" min="2" max="30"></label>
                <label class="setting">图鉴轮换（分钟）<input data-setting="rotateMinutes" type="number" min="2" max="120"></label>
                <label class="setting">限时团体战（分钟）<input data-setting="raidMinutes" type="number" min="5" max="720"></label>
                <div class="hint">通关日常勾选「开战后持续到捕获」时，已进入的当日异色团体战会等到捕获确认或每日刷新。普通挂机仍按时限退出。</div>
                <label class="setting">本次驻留累计失败上限<input data-setting="lossLimit" type="number" min="1" max="20"></label>
                <label class="setting">定时停止（分钟，0 不限）<input data-setting="stopMinutes" type="number" min="0" max="1440"></label>
                <label class="setting"><span><input type="checkbox" data-setting="resumeOnReload" aria-describedby="resume-update-hint">刷新后自动恢复未停止的任务</span></label><div class="hint" id="resume-update-hint">任务运行中遇到游戏更新提示时，助手会先保存任务，再确认游戏更新。重新载入后继续原任务。</div>
                <label class="setting"><span><input type="checkbox" data-setting="autoRecover" aria-describedby="recovery-hint">连接异常且任务停滞时尝试恢复</span></label><div class="hint" id="recovery-hint">先启用刷新后续跑；在运行实况查看恢复依据。</div>
                <div class="hint">自动收蛋默认开启：在安全间隙孵化成熟蛋，完成后返回当前任务；支持补练和独立任务空闲期。新蛋由游戏自动进入孵化器，不购买槽位、不更换亲本。</div>
                <label class="setting">图鉴完成后<select data-setting="afterDex"><option value="money">继续刷钱</option><option value="stop">停止助手</option></select></label>
                <label class="setting"><span><input type="checkbox" data-setting="progress">无图鉴目标时推进主线</span></label>
                <label class="setting"><span><input type="checkbox" data-setting="legends">补图鉴时尝试开放传说战</span></label>
                <label class="setting"><span><input type="checkbox" data-setting="skipOwnedShiny">跳过已经捕获的异色团体战目标</span></label>
                <label class="setting"><span><input type="checkbox" data-setting="manualPause">手动操作游戏时让出控制</span></label>
                <label class="setting"><span><input type="checkbox" data-setting="manualResume">手动操作后自动恢复原任务</span></label>
                <label class="setting"><span><input type="checkbox" data-setting="dismissInfo">自动关闭只读图鉴 / 信息弹窗</span></label>
                <label class="setting">无操作后恢复（秒）<input data-setting="resumeSeconds" type="number" min="3" max="300"></label>
                <div class="hint">默认空闲 15 秒后继续。只读信息卡可自动关闭；正在输入、需要选择的弹窗或手动活动结束前保持等待。关闭自动恢复后，手动操作会直接停止助手。</div>
                <div class="hint">停止助手会停止规划与点击；游戏自身的战斗和地图循环仍会继续。可在停止后恢复启动前的循环。</div>
            </details>
            <div class="actions"><button id="export-box" type="button" aria-describedby="box-export-result" disabled>导出盒子 JSON</button><button type="button" id="simulator-export">导出模拟器 Box</button><label><input type="checkbox" id="simulator-resources">附培养资源（当前钱包金币、进化道具、升阶宝石）</label><button type="button" id="simulator-reset-scope">重建匿名身份空间</button><button type="button" id="simulator-plan-open">核对挑战方案</button><input hidden type="file" accept=".json" id="simulator-plan-file"><section id="simulator-review"></section><button id="export">导出诊断</button><button id="reset">清除采样</button><button id="restore">恢复原循环</button><button id="export-profile">导出配置</button><button id="import-profile">导入配置</button><input id="profile-file" type="file" accept="application/json,.json" hidden></div><div class="hint" id="box-export-result" role="status"></div><div class="hint update-source">更新来源：<a href="https://github.com/ZGRay00/Catch" target="_blank" rel="noopener noreferrer">ZGRay00/Catch</a> · 安装新版后刷新游戏</div><div class="hint warn" id="build"></div></section></div></section>`;
        document.body.appendChild(host);
        const query = sel => root.querySelector(sel); let tab = 'maps', drag = null, miniDraggedAt = 0,category='adventure',lastMode='',editingJob=null,settingsViewKey='',viewSignature=null,queueSignature=null,queueError='';
        const newQueueJob=Symbol('new queue job');
        let queueForm=null;
        const formSettings=()=>queueForm||engine.settings;
        const formLocked=()=>!queueForm&&(engine.running||!!engine.suspended);
        const roamingStock=[...root.querySelectorAll('[data-roam-ball-stock]')];
        const commandbar=document.createElement('div');commandbar.className='commandbar';commandbar.append(query('#start').closest('.row'),query('.queue-tools'));query('.panel').appendChild(commandbar);
        const lookupTask=document.createElement('span');lookupTask.className='lookup-task';commandbar.querySelector('.row').prepend(lookupTask);
        const updater=new UpdateChecker({onChange:renderUpdate});let updateTouched=false;
        function renderUpdate(){
            const button=query('#check-update'),notice=query('#update-notice');
            const downloadOnly=updater.pending&&new URL(updater.pending.url).hostname==='api.github.com';
            button.disabled=false;button.textContent=updater.busy?'取消检查':downloadOnly?'下载新版':updater.pending?'安装新版':'在线更新';
            button.title=updater.pending?`安装 v${updater.pending.version} · 当前 v${VERSION}`:'检查 Catch 仓库的在线更新';button.classList.toggle('available',!!updater.pending);
            notice.textContent=updater.message;notice.classList.toggle('hidden',!updateTouched);notice.classList.toggle('available',!!updater.pending);
            query('#update-tools').classList.toggle('hidden',!updateTouched);query('#update-source').disabled=updater.busy;query('#recheck-update').disabled=updater.busy;query('#download-update').disabled=updater.busy||!updater.pending?.text;
            const list=query('#update-source-list'),labels={checking:'连接中',pending:'等待中',waiting:'等待中',ok:'可用',success:'可用',skipped:'未选用',error:'失败',conflict:'内容冲突',cancelled:'已取消',timeout:'超时'};list.replaceChildren();
            for(const source of updater.sourceResults||[]){const row=document.createElement('div');row.className='update-source-row';row.dataset.state=source.state;const name=document.createElement('span'),status=document.createElement('span');name.textContent=source.name;status.textContent=[labels[source.state]||source.state,source.phase==='pinned'?'固定提交':source.phase==='branch'?'分支缓存':'',source.version?`v${source.version}`:'',source.cached?'本页已校验':'',source.commit?source.commit.slice(0,7):'',Number.isFinite(source.ms)?`${source.ms}ms`:'',source.error||''].filter(Boolean).join(' · ');row.append(name,status);list.appendChild(row);}
        }
        async function runUpdateCheck(){updateTouched=true;query('.content').scrollTop=0;return updater.check({sourceId:query('#update-source').value});}
        query('#check-update').onclick=()=>{updateTouched=true;if(updater.busy)updater.cancel();else if(updater.pending)updater.install();else void runUpdateCheck();};
        query('#recheck-update').onclick=()=>void runUpdateCheck();query('#update-source').onchange=()=>void runUpdateCheck();query('#download-update').onclick=()=>updater.download();
        helperAPI.checkUpdate=()=>{helperAPI.show();return runUpdateCheck();};
        if(typeof GM_registerMenuCommand==='function'){try{GM_registerMenuCommand('检查助手在线更新',()=>void helperAPI.checkUpdate());}catch{}}
        renderUpdate();
        let ui = {}; try { const saved = JSON.parse(localStorage.getItem(PREFIX + 'ui') || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) ui = saved; } catch {}
        // Version 1.1.0 used a single position; migrate it only to the expanded panel.
        if (!ui.panel && Number.isFinite(ui.x) && Number.isFinite(ui.y)) ui.panel = { x: ui.x, y: ui.y };
        function saveUI() { try { localStorage.setItem(PREFIX + 'ui', JSON.stringify(ui)); } catch {} }
        const miniExtraInfo=query('#mini-extra-info'),miniLinks=query('.mini-links');
        miniExtraInfo.checked=ui.miniExtraInfo===true;
        miniLinks.classList.toggle('hidden',!miniExtraInfo.checked);
        miniExtraInfo.onchange=()=>{
            ui.miniExtraInfo=miniExtraInfo.checked;
            miniLinks.classList.toggle('hidden',!ui.miniExtraInfo);
            saveUI();
        };
        const applyPanelAppearance=mountPanelAppearance(root,host,ui,saveUI);
        const logPanel=mountPanelLogs(root,engine,()=>{viewSignature=null;render();});
        const fieldInsights=mountFieldInsights(root,engine,life.signal);
        const metricGroup=query('#yield-metric');
        function selectYieldView(value) {
            ui.yieldView=['money','train','box'].includes(value)?value:'task';
            for(const button of metricGroup.querySelectorAll('button')){
                button.setAttribute('aria-pressed',String(button.dataset.yieldView===ui.yieldView));
            }
        }
        selectYieldView(ui.yieldView);
        const workspaces = [...root.querySelectorAll('[data-workspace]')];
        const content=query('.content');
        const workspaceScroll=ui.scroll&&typeof ui.scroll==='object'?ui.scroll:{};
        ui.scroll=workspaceScroll;
        function rememberWorkspaceScroll(){if(!ui.folded&&ui.workspace)workspaceScroll[ui.workspace]=content.scrollTop;}
        function selectWorkspace(name, refresh = true) {
            const active = workspaces.find(button => button.dataset.workspace === name) || workspaces[0];
            if(refresh)rememberWorkspaceScroll();
            for (const button of workspaces) {
                const selected = button === active;
                button.setAttribute('aria-pressed', String(selected));
                query('#' + button.getAttribute('aria-controls')).hidden = !selected;
            }
            ui.workspace = active.dataset.workspace;
            query('.panel').classList.toggle('lookup-page', ['dex','weather','eggs'].includes(ui.workspace));
            query('.panel').classList.toggle('queue-page', ui.workspace==='queue');
            if (refresh) {
                render();place();content.scrollTop=Number(workspaceScroll[ui.workspace])||0;
                const nav=active.parentElement,box=active.getBoundingClientRect(),bounds=nav.getBoundingClientRect();
                if(box.right>bounds.right)nav.scrollLeft+=box.right-bounds.right;
                else if(box.left<bounds.left)nav.scrollLeft+=box.left-bounds.left;
                saveUI();
            }
        }
        function jumpTo(workspace,selector){
            if(ui.folded)fold(false);
            selectWorkspace(workspace);
            const target=selector&&query(selector);if(!target)return;
            if(target.tagName==='DETAILS')target.open=true;
            for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
            const focus=target.tagName==='DETAILS'?target.querySelector('summary'):target;
            if(!focus.matches('button,input,select,textarea,summary,[tabindex]'))focus.tabIndex=-1;
            focus.focus({preventScroll:true});focus.scrollIntoView({block:'nearest'});
        }
        for (const button of workspaces) button.onclick = () => selectWorkspace(button.dataset.workspace);
        query('#open-queue').onclick=()=>selectWorkspace('queue');
        query('#purchase-edit-budget').onclick = () => {
            query('#budget-details').open = true;
            selectWorkspace('settings');
            const summary = query('#budget-details summary');
            summary.focus({preventScroll:true});
            summary.scrollIntoView({block:'nearest'});
        };
        selectWorkspace(ui.workspace, false);
        const drawQueue=mountQueuePanel(root,engine);
        const nurseryPanel=mountNurseryPanel(root,engine,{preferences:ui,save:saveUI,onChange:()=>render()});
        query('#nursery-plan').onclick=()=>{
            if(engine.running||engine.suspended||!changeSetting('mode','breed'))return;
            selectWorkspace('tasks');showCategory('collect');
            query('[data-setting="breedId"]').focus();
        };
        const dexPanel=mountDexPanel(root,render,()=>{if(ui.folded)fold(false);selectWorkspace('dex');});
        const weatherPanel=mountWeatherPanel(query('#weather-panel'),ui,saveUI,render);
        const renderSeason=mountSeasonCalendar(query('#season-calendar'));
        query('#hunt-forecast').onclick=()=>{
            const selected=formSettings()[formSettings().mode+'Weather'];
            if(selected?.length)weatherPanel.selectSkies(selected);
            selectWorkspace('weather');
            query('[data-workspace="weather"]').focus({preventScroll:true});
        };
        function selectActivityTab(name){
            tab=name;
            for(const button of root.querySelectorAll('[data-tab]')){
                const active=button.dataset.tab===name;
                button.classList.toggle('on',active);
                button.setAttribute('aria-pressed',String(active));
            }
        }
        selectActivityTab(tab);
        function place() {
            const position = ui.folded ? ui.mini : ui.panel;
            host.style.left = 'auto'; host.style.right = '14px'; host.style.bottom = 'auto';
            if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
                const box = host.getBoundingClientRect(),maxX=innerWidth-box.width-6;
                if(ui.folded&&drag?.key==='mini'&&drag.moved)position.right=position.x>=maxX;
                if(ui.folded&&position.right===true)host.style.right='6px';
                else {
                    host.style.right='auto';
                    host.style.left=`${Math.max(6,Math.min(position.x,maxX))}px`;
                }
                host.style.top = `${Math.max(6, Math.min(position.y, innerHeight - box.height - 6))}px`;
            } else if (ui.folded) { host.style.top = 'auto'; host.style.bottom = 'max(14px, env(safe-area-inset-bottom))'; }
            else host.style.top = innerWidth <= 450 || innerHeight <= 560 ? '12px' : '86px';
        }
        function fold(value) {
            const changed=!!ui.folded!==value;if(value&&!ui.folded)rememberWorkspaceScroll();
            ui.folded=value;query('.panel').classList.toggle('hidden',value);query('.mini-bar').classList.toggle('hidden',!value);query('.mini').classList.toggle('hidden',!value);
            query('.mini').setAttribute('aria-expanded',String(!value));applyPanelAppearance();saveUI();if(changed)render();place();
            if(changed&&!value)content.scrollTop=Number(workspaceScroll[ui.workspace])||0;
        }
        function renderEnvironment(now){
            const node=query('#execution-environment');
            const text=backgroundKeepalive(now)?'保活扩展已启用，心跳有效，助手拥有后台运行许可。浏览器冻结时会保留任务并等待恢复。':document.hidden?'当前标签在后台，等待回到游戏后继续。可在游戏页启用包内的保持激活扩展。':'当前游戏页面可操作。切走后要继续推图，可加载完整包里的 pokecatch-keep-active，并在游戏页开启。';
            if(node.textContent!==text)node.textContent=text;
        }
        let serviceSignature=null;
        function renderExecution(s,now){
            const model=taskExecutionState(s,engine,now),states={unconfigured:'未配置',disabled:'自动关闭',timing:'计时中',ready:'待领取',waiting:'等待安全点',running:'处理中',blocked:'需处理'};
            query('#foreground-task').textContent=model.foreground.label;query('#foreground-detail').textContent=model.foreground.detail;query('#ui-owner').textContent='页面：'+model.uiOwner;query('#concurrency-note').textContent=model.summary;
            query('#execution-route').textContent=model.decision.route;query('#execution-team').textContent=model.decision.team;query('#execution-reason').textContent=model.decision.reason;
            if(query('#decision-info').open){
                let review=query('#execution-review');
                if(!review){review=document.createElement('div');review.id='execution-review';review.className='sub';query('#execution-reason').after(review);}
                const members=model.decision.verification?.members||[],name=id=>MONS.get(id)?.name||String(id);
                const text=members.map(member=>{
                    const role={pinned:'固定成员',learner:'学员',combat:'出战'}[member.role];
                    const matchups=member.favorable?.map(name).join('、');
                    return `${member.slot+1}. ${name(member.id)} Lv.${member.level} · ${role}${matchups?' · 打点 '+matchups:''}${member.alternative?' · 备选 '+name(member.alternative.id):''}`;
                }).join('\n');
                review.style.whiteSpace='pre-line';if(review.textContent!==text)review.textContent=text;
            }
            if(query('#probability-info').open){
                const odds=shinyOdds(s||{}, {},now),eggs=s?.pension?.eggs||[],format=rate=>!Number.isFinite(rate)?'标记待核对':rate===1?'已保存异色标记':rate===0?'已保存普通色标记':`${(rate*100).toFixed(4)}%（约1/${Math.round(1/rate)}）`;
                query('#probability-wild').textContent=`野外：${format(odds.rate)} · ${odds.complete?'地区完整图鉴×2已生效':'地区完整图鉴加成未生效'}${odds.multiplier>1?` · 野外树果×${odds.multiplier}`:''}；地下化石按对应地区计算，当前地区示例：${format(shinyOdds(s||{},{kind:'underground'},now).rate)}`;
                const verified=NURSERY_RULES.compatibleBuilds.includes(nurseryRuntimeOptions().build);
                const rates=verified?[...new Set(eggs.map(egg=>shinyOdds(s||{},{kind:'egg',egg},now).rate))]:[];
                const ratesText=rates.length?rates.map(format).join('、'):'普通亲本 1/512，异色亲本 1/16，靛莓果翻倍';
                query('#probability-eggs').textContent=verified?'孵蛋 · '+ratesText+'。':'蛋的闪率和判定见「孵蛋」页。';
            }
            const signature=JSON.stringify(model.services.map(service=>[service.id,service.state,service.label,service.stateLabel,service.detail,Math.max(0,Math.ceil((service.nextAt-now)/60000))]));
            if(signature===serviceSignature)return model;
            serviceSignature=signature;
            const list=query('#background-services');list.replaceChildren();
            for(const service of model.services){const row=document.createElement('div');row.className='service-row';row.dataset.service=service.id;row.dataset.state=service.state;
                const label=document.createElement('span');label.className='service-label';label.textContent=service.label;
                const state=document.createElement('span');state.className='service-state';state.textContent=service.stateLabel||states[service.state]||service.state;
                const detail=document.createElement('span');detail.className='service-detail';const minutes=service.nextAt>now?Math.max(1,Math.ceil((service.nextAt-now)/60000)):0;detail.textContent=service.detail+(minutes?` · 约${minutes>=60?Math.floor(minutes/60)+'时'+(minutes%60?minutes%60+'分':''):minutes+'分钟'}`:'');row.append(label,state,detail);list.appendChild(row);}
            return model;
        }
        helperAPI.show=()=>{
            if(life.signal.aborted)return requestOwner(showEvent);
            revealHost(host);delete ui.panel;
            fold(false);render();place();return true;
        };
        restorePanel=helperAPI.show;
        const legendPicker=query('#legend-picker'),legendChecks=query('#legend-checks'),legendSearch=query('#legend-search');
        const legendGroups=[],legendEntries=new Map();
        for(const region of DATA.regions){
            const section=document.createElement('fieldset'),title=document.createElement('legend');
            title.textContent=region.name;section.append(title);
            const entries=[];
            for(const zone of DATA.zones.filter(zone=>zone.reg===region.key)){
                const mon=MONS.get(zone.id),name=zone.monName||mon?.name||String(zone.id);
                const row=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input');
                const text=document.createElement('span'),species=document.createElement('strong'),place=document.createElement('small');
                row.className='legend-option';
                input.type='checkbox';input.value=zone.id;
                species.textContent=name;place.textContent=zone.name;text.append(species,place);label.append(input,text);
                const only=document.createElement('button');
                only.type='button';only.textContent='仅选';only.setAttribute('aria-label','仅选'+name+' · '+zone.name);
                only.onclick=()=>{
                    if(changeSetting('legendIds',[zone.id])){
                        legendPicker.open=false;legendPicker.querySelector('summary').focus();
                    }
                };
                const entry={row,input,only,name,place:zone.name,search:`${name} ${zone.name} ${region.name} ${mon?.key||''} ${zone.id}`.toLowerCase()};
                entries.push(entry);legendEntries.set(zone.id,entry);
                row.append(label,only);section.append(row);
            }
            if(entries.length){legendGroups.push({section,entries});legendChecks.append(section);}
        }
        const legendOrder=query('#legend-order'),orderList=legendOrder.querySelector('ol');
        let pickerIds=[],orderSignature='';
        legendChecks.onchange=event=>{
            const id=Number(event.target.value);
            changeSetting('legendIds',event.target.checked?[...pickerIds,id]:pickerIds.filter(value=>value!==id));
        };
        const legendAll=query('#legend-all'),legendClear=query('#legend-clear');
        legendAll.textContent='全选 '+legendEntries.size+' 项';
        legendAll.onclick=()=>changeSetting('legendIds',[...new Set([...pickerIds,...legendEntries.keys()])]);
        legendClear.onclick=()=>changeSetting('legendIds',[]);
        function filterLegendTargets(){
            const words=legendSearch.value.trim().toLowerCase().split(/\s+/);
            let found=false;
            for(const {section,entries} of legendGroups){
                let visible=false;
                for(const entry of entries){
                    const matches=words.every(word=>entry.search.includes(word));
                    entry.row.hidden=!matches;visible||=matches;
                }
                section.hidden=!visible;found||=visible;
            }
            query('#legend-empty').hidden=found;legendChecks.hidden=!found;legendChecks.scrollTop=0;
        }
        legendSearch.oninput=filterLegendTargets;
        legendPicker.ontoggle=()=>{
            if(!legendPicker.open&&legendSearch.value){legendSearch.value='';filterLegendTargets();}
        };
        function syncLegendPicker(cfg,locked){
            pickerIds=selectedLegendIds(cfg);
            const selected=new Set(pickerIds);
            const signature=JSON.stringify([pickerIds,locked]);
            if(orderSignature!==signature){
                orderSignature=signature;legendOrder.hidden=selected.size<2;
                orderList.replaceChildren(...pickerIds.map((id,index)=>{
                    const li=document.createElement('li'),name=document.createElement('span');
                    name.textContent=legendEntries.get(id).name;li.append(name);
                    for(const [delta,label] of [[-1,'上移'],[1,'下移']]){
                        const button=document.createElement('button'),to=index+delta;
                        button.type='button';button.textContent=label;button.disabled=locked||to<0||to>=pickerIds.length;
                        button.setAttribute('aria-label',label+name.textContent);
                        button.onclick=()=>{
                            const ids=pickerIds.slice();[ids[index],ids[to]]=[ids[to],ids[index]];
                            if(changeSetting('legendIds',ids)){
                                const row=orderList.children[to];
                                (row.querySelector('button:not(:disabled)')||legendOrder.querySelector('summary')).focus({preventScroll:true});
                                row.scrollIntoView({block:'nearest'});
                            }
                        };
                        li.append(button);
                    }
                    return li;
                }));
            }
            for(const [id,entry] of legendEntries){
                const picked=selected.has(id),last=picked&&selected.size===1;
                entry.input.checked=picked;entry.input.disabled=locked;entry.only.disabled=locked||last;
                entry.row.classList.toggle('selected',picked);
            }
            const single=selected.size===1&&legendEntries.get(cfg.legendId);
            query('#legend-selection').textContent=single?`${single.name} · ${single.place}`:selected.size===legendEntries.size?'全部目标':`已选 ${selected.size} 项`;
            query('#legend-count').textContent=`已选 ${selected.size} / ${legendEntries.size}`;
            query('#legend-instruction').textContent=selected.size>1?'按所选顺序挑战。限时入口开放后优先回刷。':selected.size?'已选 1 个目标':LEGEND_TARGET_REQUIRED;
            legendAll.disabled=locked||selected.size===legendEntries.size;
            legendClear.disabled=locked||selected.size===0;
        }
        function addOption(select,value,label){const el=document.createElement('option');el.value=String(value);el.textContent=label;select.appendChild(el);}
        for(const group of ROAMING_DATA.groups){const options=document.createElement('optgroup');options.label=DATA.regions.find(region=>region.key===group.reg)?.name||group.reg;for(const id of group.ids)addOption(options,id,`#${id} ${MONS.get(id)?.name||id}`);query('[data-setting="roamId"]').appendChild(options);}
        function huntChecks(container,suffix,entries){
            for(const [value,name] of entries){
                const label=document.createElement('label'),box=document.createElement('input');
                box.type='checkbox';box.value=value;box.dataset.hunt=suffix;
                box.onchange=()=>{
                    const key=formSettings().mode+suffix,selected=new Set(formSettings()[key]);
                    if(box.checked)selected.add(value);else selected.delete(value);
                    changeSetting(key,[...selected]);
                };
                label.append(box,name);query(container).append(label);
            }
        }
        huntChecks('#hunt-regions','Regions',DATA.regions.map(r=>[r.key,r.name]));
        huntChecks('#hunt-weather','Weather',Object.entries(WEATHER_LABELS));
        function selectedSpecies(cfg){return cfg.mode==='shiny'?shinyGoals(cfg):cfg.dexSpecies;}
        const huntSearch=query('#hunt-search'),huntPicker=query('#hunt-picker'),speciesDetails=huntSearch.closest('details');
        let speciesOptionsKey=null;
        function filterSpecies(){
            const cfg=formSettings(),term=huntSearch.value.trim().toLowerCase().replace(/^#/,'');
            const ids=selectedSpecies(cfg),key=JSON.stringify([cfg.mode,term,ids]);
            if(key===speciesOptionsKey)return;
            const selected=new Set(ids),options=document.createDocumentFragment();
            for(const mon of DATA.mons){
                if(selected.has(mon.id)||cfg.mode==='shiny'&&(!WILD_SHINY_IDS.has(mon.id)||mon.legend))continue;
                if(term&&!mon.name.includes(term)&&!mon.key?.includes(term)&&!String(mon.id).startsWith(term))continue;
                addOption(options,mon.id,'#'+mon.id+' '+mon.name);
            }
            huntPicker.replaceChildren(options);
            query('#hunt-add').disabled=!huntPicker.value;
            speciesOptionsKey=key;
        }
        huntSearch.oninput=filterSpecies;
        speciesDetails.addEventListener('toggle',()=>{if(speciesDetails.open)filterSpecies();});
        query('#hunt-add').onclick=()=>{
            const cfg=formSettings(),id=Number(query('#hunt-picker').value);
            if(id)changeSetting(cfg.mode+'Species',[...selectedSpecies(cfg),id]);
        };
        function syncHunt(){
            const cfg=formSettings(),mode=cfg.mode,field=query('#hunt-filters');
            field.hidden=!['dex','shiny'].includes(mode);query('#hunt-forecast').hidden=field.hidden;if(field.hidden)return;
            const regions=cfg[mode+'Regions'],weather=cfg[mode+'Weather'],species=selectedSpecies(cfg);
            query('#hunt-region-controls').hidden=mode==='dex';
            query('#hunt-region-summary').textContent='搜寻地区 · '+(regions.map(id=>DATA.regions.find(r=>r.key===id).name).join('、')||'沿用规划范围');
            query('#hunt-weather-summary').textContent='地图天气 · '+(weather.map(key=>WEATHER_LABELS[key]).join('、')||'不限');
            query('#hunt-species-summary').textContent='目标物种 · '+(species.length===1?MONS.get(species[0]).name:species.length?species.length+' 种':'全部缺失进化链');
            query('#hunt-help').textContent=mode==='dex'?'自动比较所有已解锁地区的出现率、捕获率与路线长度。指定物种按形态登记；留空补基础形态。':'每捕获一种目标异色，助手就继续寻找剩余目标。';
            for(const box of field.querySelectorAll('[data-hunt]'))box.checked=cfg[mode+box.dataset.hunt].includes(box.value);
            const wrap=query('#hunt-selected');wrap.replaceChildren();
            for(const id of species){
                const button=document.createElement('button');button.type='button';button.className='chip';
                button.textContent=MONS.get(id).name+' ×';button.setAttribute('aria-label','移除'+MONS.get(id).name);
                button.disabled=mode==='shiny'&&species.length===1;
                button.onclick=()=>changeSetting(mode+'Species',species.filter(value=>value!==id));wrap.append(button);
            }
            if(speciesDetails.open)filterSpecies();
        }
        let eggRegionKey = '';
        function updateBreedingOptions(s) {
            const target = formSettings().breedId;
            const key = JSON.stringify([currentRegion(s), s.travel?.to, s.link?.to, target]);
            if (key === eggRegionKey) return;
            eggRegionKey = key;
            const ids = new Set(DATA.mons.map(mon => breedableOffspring(s, mon)).filter(id => id != null));
            const select = query('[data-setting="breedId"]');
            select.replaceChildren();
            for (const id of [...ids].sort((a,b) => a-b)) addOption(select,id,`#${id} ${MONS.get(id).name}`);
            if (!ids.has(target)) addOption(select,target,`${MONS.get(target)?.name || target} · 当前地区条件不符`);
            select.value = String(target);
        }
        for(const chapter of DATA.chapters)addOption(query('[data-setting="progressUntil"]'),chapter.id,`${DATA.regions.find(r=>r.key===chapter.reg)?.name} · ${chapter.name}`);
        for(const id of RESOURCE_IDS)addOption(query('[data-setting="resourceItem"]'),id,ITEMS.get(id)?.name||DATA.automation.shop.find(x=>x.id===id)?.name||DATA.automation.buffs[id]?.name||id);
        function itemOptions() {
            const select = query('[data-setting="itemId"]'), filter = query('#item-search').value.trim().toLowerCase(); select.replaceChildren();
            for (const item of DATA.items) {
                if (item.id !== formSettings().itemId && filter && !`${item.name} ${item.id}`.toLowerCase().includes(filter)) continue;
                const option = document.createElement('option'); option.value = item.id; option.textContent = item.name + (item.sources.some(s => s.repeat) ? '' : ' · 有限来源'); select.appendChild(option);
            }
            select.value = formSettings().itemId;
        }
        const memberKeys=new Map();
        function updateMemberOptions(field,members,missingLabel){
            const selected=formSettings()[field];
            const key=JSON.stringify([selected,...members.map(m=>[m.uid,m.id,m.level,!!m.shiny])]);
            if(memberKeys.get(field)===key)return;
            memberKeys.set(field,key);
            const select=query('[data-setting="'+field+'"]'),options=Array.from(select.options),added=document.createDocumentFragment();
            let index=1,found=selected===options[0].value;
            function option(uid,name){
                const existing=options[index++];
                if(existing){
                    if(existing.value!==uid)existing.value=uid;
                    if(existing.textContent!==name)existing.textContent=name;
                }else addOption(added,uid,name);
                if(uid===selected)found=true;
            }
            if(field==='trainUid')option('selected','指定一只或多只队员');
            for(const m of members)option(m.uid,(MONS.get(m.id)?.name||m.id)+' · Lv.'+m.level+(m.shiny?' ✦':''));
            if(!found)option(selected,missingLabel);
            for(const extra of options.slice(index))extra.remove();
            if(added.childNodes.length)select.append(added);
            if(select.value!==selected)select.value=selected;
        }
        let pcLimit=36;
        function trainingEntry(){
            const cfg=queueForm||engine.daily?.base||formSettings();
            const mode=selectedCard()==='daily'?dailyMainMode(cfg):cfg.mode;
            if(mode==='train')return 'train';
            return ['shiny','dex'].includes(mode)&&cfg.huntWeatherFallback==='xp'?'weather':'';
        }
        function partyOptions(s,both=false){
            if(both||formSettings().mode==='resource')updateMemberOptions('useUid',s.mons||[],'原目标已离开PC · 请选择');
            if(!trainingEntry())return;
            const cfg=queueForm||engine.daily?.base||formSettings(),members=partyMons(s),ids=trainingUids(s,cfg);
            const selected=new Set(ids),locked=formLocked();
            updateMemberOptions('trainUid',members,'原目标已离队 · 请选择');
            const name=mon=>(MONS.get(mon.id)?.name||mon.id)+' · Lv.'+mon.level+(mon.shiny?' ✦':'');
            const pcField=query('#train-pc-field');
            pcField.hidden=!cfg.autoTeam;
            query('#train-count').textContent='练级目标 · 已选 '+ids.length+' / 6';
            const plan=trainingStatus(s,cfg);
            query('#train-selection-hint').textContent=!ids.length?'请勾选至少一只宝可梦':plan.conflict?'所选成员占用同一出战名额，请调整选择':plan.missing?'有成员无法出战，请重新选择':cfg.autoTeam?'保留勾选成员，其余位置自动配队。':'手动配队已开启，可勾选冒险队伍中的成员。';
            function checks(selector,rows){
                const key=JSON.stringify([locked,ids,rows]);
                if(memberKeys.get(selector)===key)return;
                memberKeys.set(selector,key);
                const fragment=document.createDocumentFragment();
                for(const [uid,text] of rows){
                    const label=document.createElement('label'),input=document.createElement('input');
                    input.type='checkbox';input.value=uid;input.checked=selected.has(uid);
                    input.disabled=locked||!input.checked&&ids.length>=6;
                    input.onchange=()=>changeSetting('trainUids',input.checked?[...ids,uid]:ids.filter(id=>id!==uid));
                    label.append(input,text);fragment.append(label);
                }
                query(selector).replaceChildren(fragment);
            }
            const box=pokemonByUid(s);
            checks('#train-members',[...new Set([...ids,...members.map(m=>m.uid)])].map(uid=>{
                const mon=box.get(uid);
                return [uid,mon?name(mon)+(s.team.includes(uid)?'':' · 电脑'):'已离队 · '+uid];
            }));
            if(pcField.hidden||!pcField.open)return;
            const term=query('#train-search').value.trim().toLowerCase().replace(/^#/,''),team=new Set(s.team),rows=[];
            for(const mon of s.mons||[]){
                if(team.has(mon.uid)||!teamEligible(s,mon))continue;
                const species=MONS.get(mon.id);
                if(term&&![species?.name,species?.key,mon.id,mon.uid].some(x=>String(x).toLowerCase().includes(term)))continue;
                rows.push([mon.uid,name(mon)+' · '+mon.uid]);
                if(rows.length>pcLimit)break;
            }
            query('#train-more').hidden=rows.length<=pcLimit;
            checks('#train-pc',rows.slice(0,pcLimit));
            if(!rows.length)query('#train-pc').textContent='没有匹配的可出战成员';
        }
        function refreshTrainees(){if(engine.state?.adv)partyOptions(engine.state);}
        query('#train-search').oninput=()=>{pcLimit=36;refreshTrainees();};
        query('#train-pc-field').ontoggle=refreshTrainees;
        query('#train-more').onclick=()=>{pcLimit+=36;refreshTrainees();};
        function showCategory(value){category=value;root.querySelectorAll('[data-category]').forEach(el=>el.classList.toggle('on',el.dataset.category===value));root.querySelectorAll('[data-group]').forEach(el=>el.classList.toggle('hidden',el.dataset.group!==value));}
        let dailySelected=false;
        // Daily temporarily runs its own child tasks. Keep their mode independent of the selected card.
        function selectedCard(){return !queueForm&&(engine.daily||dailySelected)?'daily':formSettings().mode;}
        function syncSettings() {
            syncHunt();
            settingsViewKey=JSON.stringify(formSettings());
            if(engine.state?.adv){
                if(trainingEntry()||formSettings().mode==='resource')partyOptions(engine.state,true);
                if(formSettings().mode==='breed')updateBreedingOptions(engine.state);
            }
            for (const input of root.querySelectorAll('[data-setting]')) {
                const value = input.dataset.setting==='underStartChoice'?(formSettings().underAutoStart?'auto':undergroundStartFloor(formSettings(),UNDER_START_FLOORS)):formSettings()[input.dataset.setting];
                if (input.type === 'checkbox') input.checked = value;
                else if(!budgetDrafts.has(input))input.value = String(value);
                if(input.dataset.setting!=='autoPurchase')input.disabled = formLocked();
            }
            const card=selectedCard();
            const dailyBase=queueForm||engine.daily?.base||formSettings();
            query('#daily-shiny-raid').checked=dailyBase.raids;
            query('#daily-shiny-raid').disabled=formLocked();
            const untilCaught=root.querySelector('[data-setting="dailyRaidUntilCaught"]');
            untilCaught.checked=dailyBase.dailyRaidUntilCaught!==false;
            untilCaught.disabled=!dailyBase.raids||formLocked();
            const dailyLegend=card==='daily'&&dailyMainMode(dailyBase)==='legend';
            syncLegendPicker(dailyLegend?dailyBase:formSettings(),formLocked());
            const legendSettings=dailyLegend?dailyBase:formSettings(),legendHint=query('#legend-elite-team-hint');
            legendHint.hidden=!legendSettings.legendTier;
            if(legendSettings.legendTier)legendHint.textContent=legendSettings.optimizeRaid?'精英战按首领形态和阶级自动配置专属队伍，最多带一只传说或幻之宝可梦。':'精英战使用你在游戏中设置的专属队伍。';
            const legendFields=query('[data-fields="legend"]');
            const destination=query(dailyLegend?'#daily-legend-fields':'#ordinary-target');
            if(legendFields.parentNode!==destination)destination.insertBefore(legendFields,dailyLegend?null:query('[data-fields="roam"]'));
            query('#daily-routine').classList.toggle('hidden',card!=='daily');
            query('#ordinary-target').classList.toggle('hidden',card==='daily');
            root.querySelectorAll('[data-mode]').forEach(button => { const on = button.dataset.mode === card; button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); });
            if(lastMode!==card){lastMode=card;showCategory(query(`[data-mode="${lastMode}"]`)?.dataset.group||'adventure');}
            root.querySelectorAll('[data-fields]').forEach(el => el.classList.toggle('hidden', el.dataset.fields !== formSettings().mode&&!(el===legendFields&&dailyLegend)));
            query('#scope-field').classList.toggle('hidden', huntRegions(formSettings()).length>0||['dex','legend','roam'].includes(formSettings().mode)||FLOW_MODES.has(formSettings().mode));
            const training=trainingEntry(),trainFields=query('[data-fields="train"]');
            const trainParent=query(card==='daily'&&training?'#daily-train-fields':training==='weather'?'#weather-train-fields':'#ordinary-target');
            if(trainFields.parentElement!==trainParent)trainParent.insertBefore(trainFields,trainParent.id==='ordinary-target'?query('[data-fields="progress"]'):null);
            trainFields.classList.toggle('hidden',!training);
            query('#train-gems-toggle').hidden=training==='weather';
            query('#train-rank-settings').hidden=training==='weather'||!formSettings().trainGems;
            const mode=formSettings().mode,independent=FLOW_MODES.has(mode)||mode==='legend';
            query('#task-purchase').hidden=!['progress','breed','resource'].includes(mode);
            if(mode==='resource'){
                const action=formSettings().resourceAction;
                query('#resource-quantity-label').textContent=action==='buy'?'购买份数':'使用份数';
                query('#resource-member').classList.toggle('hidden',action==='buy'||!!DATA.automation.buffs[formSettings().resourceItem]);
                query('#task-purchase-policy').textContent={
                    buy:'按目标份数向金币商店购买。每份确认到账后再买下一份。',
                    use:'只使用背包中的目标道具。库存用尽时任务暂停。',
                    buyUse:'优先使用库存。仍需使用且库存不足时，按一份的价格检查预算并补购。',
                }[action]+(action!=='use'&&DATA.automation.candies[formSettings().resourceItem]?' 经验糖果只采购当前商店已解锁的最高档，目标档位不符时暂停。':'');
            }else if(mode==='breed'){
                query('#task-purchase-policy').textContent=formSettings().pensionExpand
                    ?'寄养位少于两个、繁殖需要扩容时才会购买。'
                    :'当前只使用已有寄养位。如需扩容，请勾选上方的寄养位选项。';
            }else if(mode==='progress'){
                query('#task-purchase-policy').textContent=!formSettings().autoPrepare?'补练已关闭，主线不会买糖。'
                    :formSettings().progressCandy?'补练先用库存 EXP Candy，再按预算逐份补购商店已解锁的最高档。'
                    :'主线补练买糖已关闭，可在设置中开启 EXP Candy 选项。';
            }
            query('[data-setting="autoTeam"]').closest('label').classList.remove('hidden');
            const raidMode=!(independent||mode==='roam')||(mode==='legend'&&!!engine.daily&&!engine.daily.job);
            query('[data-setting="raids"]').closest('label').classList.toggle('hidden',!raidMode);
            query('#raid-check').classList.toggle('hidden',!raidMode||!formSettings().raids);
            query('[data-setting="gifts"]').closest('label').classList.toggle('hidden',independent);
            query('[data-setting="optimizeRaid"]').closest('label').classList.toggle('hidden',['breed','resource','tower'].includes(mode));
            const collection=mode==='dex'||mode==='shiny';
            query('#team-policy-hint').textContent=mode==='tower'?'对战塔由游戏从收藏中自动选人；这里不提供原生不存在的手动塔队选择。':mode==='world'?'世界首领攻击由游戏选择成员；捕获队伍按特殊战配队选项执行。':independent?formSettings().optimizeRaid?'特殊战按目标自动配置独立队伍。':'使用你在游戏内设置的专属队伍；未配置时等待你选择，不自动替换成员。':collection?formSettings().autoTeam?'普通搜寻直接用现有成员配队。':'普通搜寻使用你设置的队伍。':formSettings().autoTeam?'冒险按目标自动选人、排序与补练；特殊战可单独设置。':'保留当前冒险成员和出场顺序，不自动加人或换人；补练也使用你选择的队伍。';
            query('#team-hint').classList.toggle('hidden',independent);
            query('#evolution-hint').textContent=formSettings().autoEvolve?'普通色免费等级进化已开启，进化确认后重新配队。异色、道具、分支和升阶锁定个体保留当前形态。':'免费进化已关闭，按当前形态评估队伍。';
            query('#prepare-toggle').classList.toggle('hidden',['breed','resource','train'].includes(mode));
            query('#prepare-toggle-text').textContent=collection?'主线和独立挑战等级不足时先补练':'等级不足时先补练，再继续原任务';
            query('#progress-candy-toggle').classList.toggle('hidden',mode!=='progress');
            query('#candy-hint').textContent='先按经验缺口使用库存。购买档位按金币商店所属地区的徽章解锁，页面确认最高档后逐份购买。预算不足或经验会超过当前等级上限时，继续地图练级。';
        }
        const editableControls=root.querySelectorAll('[data-setting]:not([data-setting="autoPurchase"]), [data-mode], #item-search');
        const purchaseInputs=root.querySelectorAll('[data-setting="autoPurchase"]');
        function renderPurchases(s){
            const inSettings=ui.workspace==='settings';
            const cardVisible=inSettings||(ui.workspace==='tasks'&&!query('#task-purchase').hidden);
            const accountReady=!!s?.adv&&engine.account===accountId(s);
            const budget=cardVisible&&accountReady?engine.budget.purchaseSummary(s):null;
            const enabled=budget?.enabled??engine.settings.autoPurchase===true;
            const locked=!!engine.suspended||!accountReady||(engine.running&&!enabled);
            const stateLabel=enabled?'已开启':engine.running&&!engine.suspended?'已关闭 · 停止任务后可开启':'已关闭';
            for(const input of purchaseInputs){
                input.disabled=locked;
                input.checked=enabled;
                const state=input.parentElement.querySelector('[data-purchase-state]');
                if(state.textContent!==stateLabel)state.textContent=stateLabel;
            }
            if(!cardVisible)return;
            const card=query(inSettings?'#settings-purchase':'#task-purchase');
            const status=card.querySelector('[data-purchase-status]');
            if(!budget){
                status.textContent=s?.adv?'等待助手同步当前账号的购买设置':'载入游戏存档后显示可购额度';
                if(inSettings){
                    query('#purchase-limits').textContent='';
                    query('#budget-summary').textContent='';
                }
                return;
            }
            const coins=value=>Number.isSafeInteger(value)?value.toLocaleString()+' ₽':'待确认';
            const scope=engine.running||engine.suspended?'当前任务':'新任务';
            const candy=(engine.running||engine.suspended)&&engine.settings.progressCandy&&engine.preparation?.context?.kind==='progress'?engine.preparation:null;
            const detail=scope+'可购额度 '+coins(budget.available)+' · 道具剩余 '+budget.usesLeft+' 份'+(budget.reason?' · '+budget.reason:'')+
                (budget.usesLeft===0?' · 补练买糖和购买后使用需要道具额度。只购买按金币额度执行。':'')+
                (candy?.candyTx?.kind==='buy'?' · 已下单，正在核对糖果到账':candy?.candyDisabled&&candy.candyReason?' · 上次补练买糖检查：'+candy.candyReason:'');
            if(status.textContent!==detail)status.textContent=detail;
            if(inSettings){
                const usage=engine.budget;
                const previous=!engine.running&&!engine.suspended&&(usage.spent>0||usage.used>0);
                query('#budget-summary').textContent=`${previous?'上个任务':scope}已支出 ${coins(usage.spent)} · 已用 ${usage.used} 份`;
                const daily=engine.settings.dailySpendBudget?coins(budget.dailyLeft):'未另设上限';
                query('#purchase-limits').textContent=`${scope}剩余预算 ${coins(budget.taskLeft)} · 今日剩余额度 ${daily}。当前地区余额 ${coins(Budget.counter(s.money))}，保留 ${coins(engine.settings.moneyReserve)} 后可用 ${coins(budget.walletLeft)}。`;
            }
        }
        function buddySummary(s,preparation){
            const current=s.buddy?.uid,mons=s.mons||[],name=uid=>MONS.get(mons.find(m=>m.uid===uid)?.id)?.name;
            const label='Buddy：'+(name(current)||'未设置');
            if(!engine.settings.trainBuddy)return label+'（自动选择已关）';
            const next=selectTrainingBuddy(s,engine.settings,preparation,engine.trainProtected);
            if(!next||next===current)return label;
            const target=name(next)||'待确认成员';
            if(engine.manual||engine.suspended||s.adv?.paused)return label+' · 恢复后评估候选 '+target;
            return label+(engine.automation.buddyTask?.uid===next?' · 正在切换为':' · 待切换为')+target;
        }
        let lastLockState=null,lastPaint=0,guideState=null,guideId=null,guidePlan=null,paintedTask='';
        const taskState=()=>[engine.runId,engine.running,!!engine.manual,!!engine.suspended,engine.queueIndex,engine.settings.mode].join('|');
        const paintDue=()=>taskState()!==paintedTask||performance.now()-lastPaint>=2000;
        function render(reuseLocalSnapshot=false) {
            if(life.signal.aborted)return;
            lastPaint=performance.now();
            if(ui.workspace==='activity'&&!ui.folded)renderEnvironment(Date.now());
            if(document.hidden){engine.releaseRankingView();return;}
            if(!host.isConnected&&document.body){document.body.appendChild(host);place();}
            let s; try { s = reuseLocalSnapshot===true?engine.readForView():engine.read(); if (s?.adv && accountId(s) !== engine.account && !engine.running && !engine.suspended) {
                engine.loadAccount(s); dailySelected=false; resetBudgetDrafts(); editingJob = null; queueForm=null; queueError=''; memberKeys.clear(); viewSignature = null;
                query('#add-job').textContent = '＋ 加入队列'; itemOptions(); syncSettings();
            } } catch (err) { engine.status = err.message; }
            if(helperAPI.ready)dexPanel.syncNative(s);
            query('#export-box').disabled=!s?.adv;
            if(s?.adv&&!engine.running&&!engine.suspended&&engine.checkpoint)engine.tryResume();
            paintedTask=taskState();
            const now=Date.now(),wait=engine.manualWaitState(s||engine.state,now),resumable=!!engine.manual||!!engine.suspended,locked=engine.running||!!engine.suspended;
            const insights=fieldInsights.update(s,now,ui);
            if(wait?.reason==='ready'&&engine.running&&!pageHidden()&&!engine.timer)engine.schedule(50);
            if(ui.folded||ui.workspace!=='activity'||tab!=='maps'||!s?.adv)engine.releaseRankingView();
            if(ui.workspace==='settings'&&!ui.folded){
                const prefs=engine.nurseryAssist.prefs;
                for(const input of root.querySelectorAll('[data-nursery-pref]')){
                    const key=input.dataset.nurseryPref;
                    input.disabled=!engine.account||!!engine.suspended||key==='allowReferenceFeed'&&!prefs.autoFeed;
                    input.checked=prefs[key];
                }
                const note=query('#nursery-auto-note'),text=engine.nurseryAssist.note;
                if(note.textContent!==text)note.textContent=text;
            }
            if(s?.adv&&!ui.folded&&['tasks','settings'].includes(ui.workspace)){
                const best=Number(s.under?.best)||0,selected=undergroundStartFloor(engine.settings,UNDER_START_FLOORS);
                const floor=undergroundStartFloor(engine.settings,UNDER_START_FLOORS.filter(n=>n===1||n<=best));
                const note=`下次从第 ${floor} 层出发 · 历史最高 ${best} 层`+(!engine.settings.underAutoStart&&floor<selected?' · 解锁所选楼层后自动使用':'');
                for(const el of root.querySelectorAll('[data-under-start-note]'))if(el.textContent!==note)el.textContent=note;
            }
            const nativePaused=engine.running&&!!s?.adv?.paused;
            let dailyPhase='';
            if(engine.daily){
                if(s?.adv?.event?.raid)dailyPhase='每日异色团体战';
                else if(engine.daily.job)dailyPhase=MODE_NAMES[engine.settings.mode];
                else if(engine.dailyZoneExit)dailyPhase='准备'+MODE_NAMES[engine.dailyZoneExit.kind];
                else if(engine.raidProbe)dailyPhase='检查每日异色团体战';
                else if(engine.daily.raidPending)dailyPhase='等待每日异色团体战';
            }
            const activeLabel=dailyPhase||MODE_NAMES[engine.settings.mode];
            commandbar.classList.toggle('has-task',locked);
            if(locked&&['dex','weather','eggs'].includes(ui.workspace)){
                const label=(resumable||nativePaused?'已暂停 · ':'运行中 · ')+activeLabel;
                if(lookupTask.textContent!==label)lookupTask.textContent=label;
            }
            const paused=resumable||nativePaused;
            query('#status').textContent = engine.suspended?engine.status:wait?.status||(nativePaused?'游戏已暂停':engine.status);
            query('#spirit-conditions').hidden=!(ui.workspace==='tasks'&&engine.running&&engine.settings.mode==='dex'&&
                engine.settings.dexSpecies.includes(spiritEvent.id)&&!s?.dex?.[spiritEvent.id]?.caught&&(engine.farmWait||engine.target?.prepNote));
            const guide=query('#gate-guide'),cfg=engine.settings;
            const gateIds=cfg.mode==='dex'?cfg.dexSpecies:cfg.mode==='legend'?[cfg.legendId]:[];
            const id=!ui.folded&&ui.workspace==='tasks'&&s?.adv&&gateIds.find(id=>gateZones.get(id)?.gate&&!captured(s,id));
            guide.hidden=!id;
            if(id){
                if(guideState!==s||guideId!==id){guideState=s;guideId=id;guidePlan=legendRequirements(s,[id]);}
                const plan=guidePlan,line=plan.lines.find(entry=>entry.have<entry.need);
                const title=MONS.get(id).name+' · 捕获条件';
                const detail=line?MONS.get(line.id).name+' · '+line.label+' '+line.have+'/'+line.need:plan.notes[0]||'前置已满足，等待入口开放';
                if(query('#gate-title').textContent!==title)query('#gate-title').textContent=title;
                if(query('#gate-next').textContent!==detail)query('#gate-next').textContent=detail;
                query('#gate-details').dataset.lookup=id;
            }
            for(const indicator of [query('.status'),query('.mini')]){
                indicator.classList.toggle('running',engine.running&&!paused);
                indicator.classList.toggle('manual',paused);
            }
            const queueStep=engine.queueRunning&&engine.running?`${engine.queueIndex+1}/${engine.queue.length}`:'';
            query('#run-state').textContent = engine.suspended?'PAUSED · 页面已挂起':engine.manual ? 'PAUSED · 手动控制' : nativePaused?'PAUSED · 游戏暂停':engine.running ? queueStep?`队列 ${queueStep} · 运行中`:'RUNNING · 运行中' : 'READY · 已停止';
            const miniState=query('#mini-state');
            const miniBase=wait ? `${engine.suspended?'挂起':'手动'} · ${wait.mini}` : nativePaused?'游戏已暂停':engine.running?(engine.preparation?'补练 → ':'')+activeLabel+(queueStep?' '+queueStep:''):engine.lastStop?.reason?'已停 · '+engine.lastStop.reason:'待命';
            if(ui.folded){
                if(miniExtraInfo.checked)updateMiniActions(root,engine,s,now,insights.itemSummary);
            }
            else if(ui.workspace==='activity'){
                renderExecution(s,now);
                if(query('#health-insight').open)renderHealthFacts(query('#health-facts'),engine.healthReport(now),now);
            }
            const nursery=nurseryPanel.render(s,now);
            const miniText=miniExtraInfo.checked?miniBase+(nursery?.counts.shiny?' · ✦蛋'+nursery.counts.shiny:'')+(nursery?.counts.estimatedShiny?' · 预计闪蛋'+nursery.counts.estimatedShiny:''):miniBase;
            if(miniState.textContent!==miniText)miniState.textContent=miniText;
            miniState.title=miniText;
            if(lastMode!==selectedCard()||settingsViewKey!==JSON.stringify(formSettings()))syncSettings();
            if(ui.folded)return;
            renderSeason(now);
            query('#switch-hint').textContent=!s?'进入游戏后显示换人状态。':s.autoSwitch!==false?'游戏自动换人已开启，由游戏选择出战者。':!engine.settings.activeSwitch?'游戏和助手的自动换人均已关闭。':!engine.settings.autoTeam?'手动配队中，保留你的队首顺序。':'助手接管普通冒险单打。只剩一个对手且换人能明显改善战况时点击替补，游戏会将其移到队首。';
            query('#resume').classList.toggle('hidden', !resumable); query('#start').classList.toggle('hidden', resumable);
            query('#resume').textContent=engine.manual&&s?.adv?.event?.raid?'接管当前团体战':engine.suspended?'继续原任务':'立即恢复';
            const action=wait?.detail||(nativePaused?'在游戏中继续冒险后，助手会接着执行当前任务。':engine.nextWake>now?`预计等待 ${Math.max(1,Math.ceil((engine.nextWake-now)/60000))} 分钟 · ${engine.action||'按游戏时间结算'}`:engine.action || (engine.running?'助手已接管，按当前任务执行':'选择任务与目标后开始'));
            const actionNode=query('#action'),actionText=engine.running&&engine.checkpointError?action+' · 续跑进度暂未保存，正在重试':action;
            if(actionNode.textContent!==actionText)actionNode.textContent=actionText;
            query('#stop').disabled = !locked;
            const dailyBase=engine.daily?.base||engine.settings,baseMode=engine.daily?.base.mode||dailyMainMode(dailyBase);
            const canDaily=DAILY_BASE_MODES.has(baseMode)&&s?.adv?.badges?.includes('Maître');
            const dailyCard=selectedCard()==='daily';
            const cardSettings=dailyCard?dailyBase:formSettings();
            const formState=s?.adv?s:queueForm&&engine.state&&accountId(engine.state)===engine.account?engine.state:null;
            const missingTrainees=!!trainingEntry()&&(!formState?.adv||trainingStatus(formState,cardSettings).missing);
            const missingLegendTarget=(dailyCard?baseMode:cardSettings.mode)==='legend'&&cardSettings.legendId===null;
            if(ui.workspace==='tasks'){
                const cfg=cardSettings,ids=selectedLegendIds(cfg);
                for(const el of roamingStock){
                    const roaming=el.dataset.roamBallStock==='roam';
                    const target=roaming?cfg.roamId:!cfg.legendTier&&ids.length===1?ids[0]:null;
                    const group=ROAMING_DATA.groups.find(entry=>entry.ids.includes(target));
                    const stock=group?roamingMasterBalls(s,target):roaming||!cfg.legendTier?ownedItems(s||{},'master-ball'):0;
                    const control=el.parentElement,hidden=!s?.adv||stock<=0;
                    if(control.hidden!==hidden)control.hidden=hidden;
                    if(hidden)continue;
                    const scope=group?(DATA.regions.find(region=>region.key===group.reg)?.name||'目标地区')+'背包':'背包合计';
                    const value=`${scope} · ${stock} 个`;
                    if(el.textContent!==value)el.textContent=value;
                }
            }
            query('#start').disabled=locked||!!editingJob||(dailyCard&&!canDaily)||missingLegendTarget||missingTrainees;
            query('#daily-edit-goal').hidden=locked||baseMode==='legend'||!DAILY_BASE_MODES.has(baseMode);
            const ids=baseMode==='shiny'?shinyGoals(dailyBase):baseMode==='dex'?dailyBase.dexSpecies:[];
            const goal=ids.length?ids.slice(0,3).map(id=>MONS.get(id)?.name).join('、')+(ids.length>3?' 等 '+ids.length+' 种':''):
                baseMode==='legend'?legendSelectionLabel(dailyBase):
                baseMode==='train'?(dailyBase.trainUid==='selected'?dailyBase.trainUids.length+' 只指定队员':dailyBase.trainUid==='team'?'全队':'指定队员')+' · Lv.'+dailyBase.trainLevel:baseMode==='dex'?'缺失的基础形态':baseMode==='money'?dailyBase.moneyTarget?'目标 '+dailyBase.moneyTarget.toLocaleString()+' ₽':'持续刷钱':'';
            query('#daily-state').textContent=!s?.adv?.badges?.includes('Maître')?'取得关都冠军徽章后开放。':
                !DAILY_BASE_MODES.has(baseMode)?'请选择每日主线，或先选择一个挂机任务。':
                (dailyPhase?'当前日常：'+dailyPhase+'。完成日常后继续':engine.daily?.checking?'正在检查待办，完成后继续':engine.daily?'正在执行每日主线：':'先处理可执行的日常、周常，再开始')+MODE_NAMES[baseMode]+(goal?' · '+goal:'');
            if(engine.daily&&!wait&&!nativePaused)query('#run-state').textContent='通关日常 · '+(dailyPhase||(s?.adv?.zone?'传说战进行中':engine.daily.checking?'检查待办':'挂机 · '+activeLabel));
            const leaving=s?.adv&&(s.adv.event||s.adv.zone||s.adv.tower||s.adv.league)&&engine.activityToLeave(s,engine.settings);
            query('#start').textContent = dailyCard?'开始通关日常':leaving?'开始任务并切换活动':s?.adv?.event?.raid?'接管当前团体战':s?.adv?.zone?'接管当前传说战':'开始当前任务';
            const planned=engine.editableQueue(),pending=planned.filter(queueJobPending),nextJob=pending[0];
            const windowNote=query('#legend-window-wait');
            const waitingLegends=!queueForm&&engine.running&&engine.settings.mode==='legend'?selectedLegendIds(engine.settings).filter(id=>engine.legendDeferred?.[id]):[];
            windowNote.hidden=!waitingLegends.length;
            const windowText=waitingLegends.map(id=>legendEntries.get(id).name+' · '+engine.legendDeferred[id].reason).join('；');
            if(windowNote.textContent!==windowText)windowNote.textContent=windowText;
            query('#queue-count').textContent=pending.length;
            query('#add-job').disabled=formLocked()||dailyCard||(!s?.adv&&!(queueForm&&engine.account))||missingLegendTarget||missingTrainees;
            query('#start-queue').disabled=locked||!!editingJob||!nextJob||!s?.adv;
            query('#start-queue').classList.toggle('hidden',locked);
            query('#start-queue').textContent=engine.running&&engine.queueRunning?'任务队列运行中':nextJob?.progress?'继续任务队列':'运行任务队列';
            query('#add-job').textContent=editingJob?'保存并返回队列':'＋ 加入队列';
            query('#cancel-job').classList.toggle('hidden',!editingJob);
            const editNote=query('#queue-edit-note');
            editNote.hidden=!editingJob;
            if(editingJob)editNote.textContent=queueError||(editingJob===newQueueJob?'正在配置要加入队列的新任务':`正在编辑队列中的「${planned.find(job=>job.id===editingJob)?.title||'任务'}」`);
            renderPurchases(s);
            query('#reset').disabled = locked; query('#restore').disabled = locked || !engine.oldLoops;
            query('#import-profile').disabled=locked||!!editingJob||!engine.account;
            if(formLocked()!==lastLockState){
                const locked=formLocked();
                editableControls.forEach(input=>input.disabled=locked);
                query('#hunt-filters').disabled=locked;
                syncLegendPicker(dailyCard?dailyBase:formSettings(),locked);
                lastLockState=locked;
            }
            query('[data-mode="daily"]').disabled=formLocked()||!!queueForm;
            const lookup = ['dex','weather','eggs'].includes(ui.workspace);
            query('#lookup-empty').hidden = !lookup || !!s?.adv;
            logPanel.controls(ui.workspace==='activity'&&tab==='logs');
            metricGroup.hidden = !s?.adv || tab!=='maps';
            const note=query('#item-route-choice'),choice=engine.itemRouteDecision;
            note.hidden=!(s?.adv&&engine.running&&engine.settings.mode==='item'&&choice?.account===engine.account&&choice?.run===engine.runId&&choice.id===engine.settings.itemId&&choice.text);
            if(!note.hidden)note.textContent=choice.text;
            const decision=query('#task-decision');
            const etaLine=query('#training-eta');
            etaLine.hidden=!(s?.adv&&ui.workspace==='tasks'&&!queueForm&&!engine.preparation&&engine.settings.mode==='train'&&(engine.running||engine.suspended));
            decision.hidden=ui.workspace!=='tasks'||!s?.adv;
            if(ui.workspace==='settings')query('[data-setting="autoRecover"]').disabled=!formSettings().resumeOnReload||formLocked();
            if(ui.workspace==='queue'){drawQueue(s,locked,pending,editingJob,queueError,planned);return;}
            if (!s?.adv) {
                query('#support-info').classList.add('hidden');query('#dex-panel').hidden=true;query('#weather-panel').hidden=true;
                query('#dex-waiting').hidden=ui.workspace!=='dex';
                const view=query('#view');view.hidden=false;
                if(ui.workspace==='activity'&&tab==='logs'){
                    const key=JSON.stringify(['offline-logs',logPanel.filterKey(),engine.logHistory()]);
                    if(key!==viewSignature){view.replaceChildren();logPanel.draw(view);viewSignature=key;}
                }else{viewSignature=null;view.textContent='进入游戏并载入存档后可查看任务和图鉴。';}
                return;
            }
            if (lookup) {
                if(ui.workspace==='eggs')return;
                if (ui.workspace === 'dex') {
                    query('#dex-waiting').hidden = true;
                    query('#dex-panel').hidden = false;
                    dexPanel.renderDex(s,engine.settings,now);
                } else {
                    query('#weather-panel').hidden = false;
                    weatherPanel.render(s, now);
                }
                return;
            }
            const taskPage=ui.workspace==='tasks';
            if(ui.workspace==='settings'&&engine.settings.raids){
                const daily=engine.raidDailyStatus(s,now);
                const note=daily?.reason||engine.raidCheckNote||(!s.adv.badges?.includes('Maître')?'通关关都联盟后开放':'可在日常冒险和主线补练中插入异色团体战');
                const retry=engine.running&&Number.isFinite(engine.nextRaid)&&engine.nextRaid>now?localCalendarTime(engine.nextRaid):'';
                const pause=engine.manual||engine.suspended?' · 恢复助手后继续':'';
                query('#raid-check').textContent=daily?note+(daily.until?' · 下次刷新 '+localCalendarTime(daily.until)+'（本地时间）':''):note+(retry?' · 下次检查 '+retry:'')+pause;
            }
            if(taskPage&&(trainingEntry()||formSettings().mode==='resource'))partyOptions(s);
            if(taskPage&&formSettings().mode==='breed')updateBreedingOptions(s);
            const preparation=engine.preparation;query('#prepare-info').classList.toggle('hidden',!preparation||!engine.running);
            const canEstimateTraining=!paused&&!engine.daily?.job&&!s.adv.event&&!s.adv.zone&&!s.adv.tower&&!s.adv.league&&!engine.driver.pendingMap&&
                (!s.road?.length||s.road.join('|')===s.team.join('|'));
            if(preparation){
                query('#prepare-title').textContent=paused?'补练已暂停':'↑ 正在补练';
                const levels=preparation.targets.map(target=>({...target,level:s.mons.find(m=>m.uid===target.uid)?.level||target.level}));
                query('#prepare-target').textContent=`完成后返回：${preparation.context.label}${preparation.capLimited?' · 目标受当前等级上限限制':''}`;
                query('#prepare-route').textContent=preparation.route?`练级地图：${preparation.route.name}${engine.manual?' · 恢复后重新评估':preparation.route.league?' · 联盟试刷，按完整轮次实测校正':''}`:'练级地图：正在评估可用路线';
                query('#prepare-levels').textContent=levels.map(target=>preparationEvolutionLabel(s,target,engine,now)).join('、')||'更新原生战斗阵容';
                const adaptive=['map','progress'].includes(preparation.context.kind)&&engine.settings.autoTeam,assessment=preparation.assessment;
                const fit=assessment?.fit,remaining=levels.reduce((total,target)=>{const mon=s.mons.find(mon=>mon.uid===target.uid),gap=mon&&candyXpGap(s,mon,target.goal);return gap==null?null:total==null?null:total+gap;},0);
                query('#prepare-assessment').textContent=adaptive?[assessment?.reason||'按实际战力复查，达标可提前返回原任务',fit?`保守预计 ${fit.turns.toFixed(1)} 回合/对手`:'',remaining>0?`当前培养目标剩余 ${Math.round(remaining).toLocaleString()} EXP`:''].filter(Boolean).join(' · '):'按所选阵容完成当前补练等级目标';
                query('#prepare-bar').style.width=`${levels.length?levels.reduce((n,m)=>n+Math.min(1,m.level/m.goal),0)/levels.length*100:100}%`;
                const review=engine.coach.routeReview;
                const row=preparation.phase==='train'&&review?.preparation===preparation&&review.rows?.find(r=>r.key===preparation.route?.key);
                const goals=preparation.targets.map(t=>({mon:pokemonByUid(s).get(t.uid),level:t.goal}));
                query('#prepare-eta').textContent=trainingEtaText(canEstimateTraining&&row&&trainingCompletionTime(s,goals,row),now,0,paused);
            }
            const settings = engine.settings, mode = settings.mode, status = dexStatus(s, settings);
            const training=!!engine.preparation||mode==='train',money=mode==='money'||mode==='dex'&&!status.missing.length&&settings.afterDex==='money';
            const supportVisible=(training||money)&&!s.adv.event&&!s.adv.zone&&!s.adv.tower&&!s.adv.league;
            const buddyText=supportVisible&&training?buddySummary(s,preparation):'';
            if(preparation)query('#prepare-buddy').textContent=buddyText;
            query('#support-info').classList.toggle('hidden',!supportVisible);
            if(supportVisible){
                const now=Date.now(),family=training?'xp':'money',buff=activeYieldBuff(s,family,now),auto=training?settings.trainBuff:settings.moneyBuff;
                const stock=Object.entries(DATA.automation.buffs).filter(([,info])=>info.family===family).reduce((n,[id])=>n+(Number(s.items?.[id])||0),0);
                const remaining=Math.max(0,settings.useBudget-engine.budget.used),parts=[];
                if(training)parts.push(buddyText);
                parts.push(buff?`${training?'经验':'金币'}增益 ×${buff.mult} · 剩 ${Math.ceil((s.buffs[family].until-now)/60000)} 分钟`:!auto?'自动树果已关闭':stock<=0?`${training?'经验':'金币'}树果无库存`:remaining<=0?'树果使用预算已用完':`${training?'经验':'金币'}树果 ${stock} 颗 · 等待可刷路线及安全节点`);
                parts.push(`使用预算剩 ${remaining} 次`);query('#support-info').textContent=parts.join('；');
            }
            const net=engine.sessionMoneyNet(s),moneyValue=query('#money-value');
            moneyValue.textContent=net===null?'—':(net>0?'+':'')+net.toLocaleString();
            query('#money-label').textContent=net===null?(engine.endedTotals?'结束时余额未知':'等待完整钱包'):engine.walletScope==='rebased'?'重计后金币净增':'本次金币净增';
            const seconds = engine.started ? Math.max(0, Math.floor(((engine.running ? Date.now() : engine.stoppedAt || Date.now()) - engine.started) / 1000)) : 0;
            query('#time-value').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
            const shinyRoutes=mode==='shiny'&&(taskPage||ui.workspace==='activity'&&tab==='maps'&&ui.yieldView==='task')?shinyRanking(s,settings,engine.cooldowns,now):null;
            let primary = `${status.complete}/${status.roots.length}`, primaryLabel = settings.dexSpecies?.length&&mode==='dex'?'目标已捕获':'进化链完成', goalLabel = settings.dexSpecies?.length&&mode==='dex'?'指定物种收集':'基础形态收集', goalValue = `${status.missing.length} 条待完成`, percent = status.complete / Math.max(1,status.roots.length) * 100;
            let hint = mode === 'money' ? '按整轮金币净增实测排名，轮换采样后优先高收益地图；未测地图显示估算。' : '基础形态曾捕获即完成整条进化链；幼年形态不另设目标。';
            if(mode==='progress'){
                hint='推图目标为所选章节。';
                if(settings.autoTravel)hint+='跨区后使用新地区的队伍和钱包。'+(settings.gifts?'助手会优先领取缺失进化链的初始宝可梦。':'请手选初始宝可梦，领取后继续推图。');
            }
            if (mode === 'dex' && settings.dexSpecies?.length) {
                goalValue = `${status.missing.length} 只待捕获`;
                hint = '按所选物种各自的捕获记录计数。助手会在符合地区和地图天气的路线中寻找剩余目标。';
            }
            if (mode==='legend'&&settings.legendId===null){
                primary='0 项';primaryLabel='已选传说目标';goalLabel='传说目标';goalValue='未选择';percent=0;
                hint=LEGEND_TARGET_REQUIRED;
            } else if (mode === 'legend') {
                const p = legendProgress(s, settings);
                primary = settings.legendTier ? `${p.tier}/${settings.legendTier}` : p.done ? '已完成' : '待捕获'; primaryLabel = settings.legendTier ? '精英阶级' : '普通捕获'; goalLabel = p.zone.monName || p.zone.name; goalValue = settings.legendTier ? `推进至 ${settings.legendTier} 阶` : '全部轮换形态'; percent = p.done ? 100 : settings.legendTier ? p.tier / settings.legendTier * 100 : 0;
                if(settings.legendIds?.length>1){
                    const goals=legendGoals(s,settings),done=goals.filter(g=>g.done).length;
                    primary=done+'/'+goals.length;primaryLabel='传说目标完成';percent=100*done/goals.length;
                }
                hint = p.roaming&&!settings.legendTier?'该目标普通捕获通过在线游荡追踪完成；需要对应地区冠军，按实际驻留地图搜寻。可切换“游荡捕获”设置搜寻时限。':`${p.zone.condition || '按游戏中的开放条件挑战。'} ${settings.legendTier?'精英战逐阶推进。':'剩余形态：'+p.missingForms.map(id=>MONS.get(id)?.name||id).join('、')+'。'}`;
            } else if(mode==='roam'){
                const p=roamingProgress(s,settings,now),location=CHAPTERS.get(p.location?.ch);
                primary=p.captured?'已捕获':p.unlocked?'追踪中':'未解锁';primaryLabel='游荡目标';goalLabel=MONS.get(settings.roamId)?.name||settings.roamId;goalValue=location?`${DATA.regions.find(region=>region.key===location.reg)?.name||location.reg} · ${location.name}`:'等待原生驻留地点';percent=p.captured?100:0;
                hint='按目标实际驻留章节追踪，先补练再搜寻，捕获登记确认后完成；不会把一次遇到或逃跑计为捕获。真正离线不产生新游荡遭遇，本任务不插入团体战。停止助手不暂停游戏本体，原生已发生的遭遇仍按游戏规则用球。';
            } else if (mode === 'item') {
                const item=ITEMS.get(settings.itemId),count=engine.endedTotals?engine.endedTotals.items:itemCounter(s,settings.itemId);
                const n=engine.started&&engine.sessionItemId===settings.itemId&&count!=null?Math.max(0,count-engine.startItems):0;
                primary = `${n}/${settings.itemQuantity}`; primaryLabel = '本次道具获取'; goalLabel = item.name; goalValue = `背包 ${ownedItems(s,item.id)} · 本次 +${n}`; percent = n / settings.itemQuantity * 100;
                if(taskPage)hint = eliteItemHint(item)||(item.id==='gracidea'?'白天带陆上形态谢米前往神奥花苑花田，在道具事件中领取一次。':`${itemRanking(s,settings).length} 个章节可规划。${item.sources.some(source => source.repeat) ? '按预计每小时掉落选图，实际收获可在路线表查看。' : '此道具为有限来源，已领取或已转金币的地点会排除。'} 获取数量按本次新增统计。`);
            } else if (mode === 'train') {
                const p=trainingStatus(s,settings,engine.running?engine.trainProtected:null),xp=engine.endedTotals?engine.endedTotals.xp:experienceTotal(s,engine.trainProtected||s.team);
                if(!etaLine.hidden){
                    const route=engine.visit?.farmPlan?.kind==='xp'?engine.visit.farmPlan.row:engine.target;
                    const rank=settings.trainGems&&settings.trainUid!=='team'?settings.trainRank:0;
                    const goals=p.targets.map(mon=>({mon,level:settings.trainLevel}));
                    const eta=canEstimateTraining&&!p.missing&&route?.key===engine.target?.key&&trainingCompletionTime(s,goals,route,rank);
                    etaLine.textContent=trainingEtaText(eta,now,rank,paused);
                }
                const gained=engine.started&&engine.trainingSelection===settings.trainUid&&xp!=null&&engine.startTrainingXp!=null?Math.max(0,xp-engine.startTrainingXp):0;
                primary = gained.toLocaleString(); primaryLabel = engine.trainingXpRebased?'恢复后新增 EXP':settings.trainUid==='team'?'本次全队 EXP':'练级对象 EXP'; goalLabel = `目标 Lv.${settings.trainLevel} · 上限 ${p.cap || '—'}`; goalValue = `${p.targets.filter(m=>m.level>=settings.trainLevel).length}/${p.targets.length} 达标`; percent = p.targets.length ? p.targets.reduce((n,m)=>n+Math.min(1,m.level/settings.trainLevel),0)/p.targets.length*100 : 0;
                hint = p.missing ? '所选目标不在当前冒险队伍中，请重新选择。' : `当前 ${p.targets.map(m=>`${MONS.get(m.id)?.name || m.id} Lv.${m.level}`).join('、')}。按全队经验/分钟选图，达到目标或当前等级上限时停止；不使用糖果。`;
            } else if (mode === 'money') { goalLabel = '金币目标'; goalValue = settings.moneyTarget ? `${s.money.toLocaleString()} / ${settings.moneyTarget.toLocaleString()}` : '持续刷钱'; percent = settings.moneyTarget ? s.money/settings.moneyTarget*100 : 0; }
            else if(mode==='shiny'){const goals=shinyGoals(settings),left=missingShinies(s,settings).length;primary=(goals.length-left)+'/'+goals.length;primaryLabel='目标异色';goalLabel=goals.slice(0,3).map(id=>MONS.get(id).name).join('、')+(goals.length>3?' 等':'');goalValue=`${shinyRoutes?.length||0} 张可刷地图`;percent=(goals.length-left)/goals.length*100;hint='按当前野生遭遇表、轮换与特殊现象选图。运行实况显示各地图每轮预计遇到目标物种的次数，捕获目标异色后完成。';}
            else if(mode==='breed'){
                const flow=engine.automation.state;
                primary=`${flow.hatched||0}/${settings.breedShiny?'✦':settings.breedGoal}`;primaryLabel='目标孵化';goalLabel=MONS.get(settings.breedId)?.name;
                goalValue=`寄养 ${s.pension?.mons?.length||0} · 蛋 ${s.pension?.eggs?.length||0}`;
                percent=settings.breedShiny?(shinyOwned(s,settings.breedId)?100:0):(flow.hatched||0)/settings.breedGoal*100;
                hint='请在游戏中手动寄养百变怪和目标亲本。'+(settings.breedShiny?'助手会优先孵化已确认的目标闪蛋。':'助手会按游戏确认的孵化数量记录进度。');
            }
            else if(mode==='underground'){const u=undergroundStatus(s,now);primary=`${engine.automation.state.underDone||0}/${settings.underRuns}`;primaryLabel='确认归队领取';goalLabel=`今日 ${u.sent}/${u.perDay} 次 · 可用 ${u.left}`;goalValue=`可领 ${u.ready.length} · 派遣中 ${u.running.length} · 槽位 ${u.slots.length}/${u.capacity}`;percent=(engine.automation.state.underDone||0)/settings.underRuns*100;hint=`下次从第 ${undergroundStartFloor(settings,u.startFloors)} 层出发 · 历史最高 ${u.best} 层。按所选方式配队，领取归队奖励后更新纪录。`;}
            else if(mode==='tower'){
                const {week,cleared}=towerProgress(s,now),goal=settings.towerFloor;
                primary=`${cleared}/${goal}`;primaryLabel='本周已过楼层';
                const attempts=engine.automation.state.towerWeek===week?engine.automation.state.towerAttempts||0:0;
                goalLabel='已结束尝试';goalValue=`${attempts}/${settings.towerRuns}`;percent=cleared/goal*100;
                const {level,ranks,statMult}=towerFloorProfile(goal);
                const paid=Number(s.tower?.paid?.[week])||0;
                const nextEgg=TOWER_RULES.eggFloors.find(floor=>floor>Math.max(cleared,paid));
                hint=`目标层敌方 Lv.${level} · 阶级 ${ranks.join('/')}${statMult>1?' · 属性 ×'+statMult.toFixed(2):''}。`;
                if(nextEgg)hint+=`本周下一处蛋奖励在第 ${nextEgg} 层。`;
            }
            else if(mode==='candy'){const run=s.candy?.run,flow=engine.automation.state,cleared=Math.max(0,run?run.floor-1:flow.candyResult?.floor||0);primary=settings.candyFloor?`${cleared}/${Math.ceil(settings.candyFloor/5)*5}`:String(cleared);primaryLabel='本场已过楼层';goalLabel=`完成场次 ${flow.candyDone||0}/${settings.candyRuns}`;goalValue=run?`今日${DATA.types[run.type]?.fr||run.type}主题 · 已获糖果保留`:'每日一次 · 巴黎时间刷新';percent=(flow.candyDone||0)/settings.candyRuns*100;hint='按今日主题、实际招式与耐久配置六人专属队伍；需要时先补练再入场，入场后保留克隆阵容。目标层向上取整至五层营地，0 表示尽力挑战；不购买跳层，失败仍按真实结算计一局。25枚神奇糖果日上限后仍可获得经验糖果。';}
            else if(mode==='elite'){const reg=settings.eliteRegion==='current'?currentRegion(s):settings.eliteRegion,best=s.eliteLeague?.[reg]?.t||0;primary=`${best}/${settings.eliteTier}`;primaryLabel='精英联盟阶级';goalLabel=DATA.regions.find(r=>r.key===reg)?.name;goalValue='逐阶挑战并领取宝石';percent=best/settings.eliteTier*100;hint=`${settings.optimizeRaid?'按本地区首领、阶级和最难对局选择队员':'使用本地区已保存的手动队伍'}。胜利后领取宝石，首次战败即退出并跳过本项。`;}
            else if(mode==='world'){primary=`${engine.automation.state.worldDone||0}/${settings.worldActions}`;primaryLabel='本次首领攻击';goalLabel='世界首领';goalValue=settings.worldCapture?'攻击 → 等待 → 捕获':'攻击目标完成即结束';percent=(engine.automation.state.worldDone||0)/settings.worldActions*100;hint='使用原生推荐的可攻击成员，每日次数和登录条件由服务器校验。捕获阶段可能需要等待；没有开放时不会反复提交攻击。';}
            else if(mode==='resource'){const flow=engine.automation.state,id=settings.resourceItem,n=settings.resourceAction==='buy'?purchasedQuantity(s,id,flow):usedQuantity(s,id,flow);primary=`${n}/${settings.resourceQuantity}`;primaryLabel=settings.resourceAction==='buy'?'采购份数':'使用份数';goalLabel=ITEMS.get(id)?.name||id;goalValue=`背包 ${s.items?.[id]||0}`;percent=n/settings.resourceQuantity*100;hint='每次只购买或使用一份，逐次核对价格、到账和预算。只购买支持当前金币商店的道具；树果用于全局增益，糖果或进化道具用于所选成员。';}
            else if(mode==='progress'){primary=`${Math.min(settings.progressUntil,s.adv.unlocked)}/${settings.progressUntil}`;primaryLabel='主线章节';goalLabel=CHAPTERS.get(settings.progressUntil)?.name;goalValue=`当前 ${CHAPTERS.get(s.adv.chapter)?.name||s.adv.chapter}`;percent=s.adv.unlocked/Math.max(1,settings.progressUntil)*100;}
            query('#dex-value').textContent = primary; query('#primary-label').textContent = primaryLabel; query('#target-hint').textContent = hint;
            query('#goal-label').textContent = goalLabel; query('#goal-value').textContent = goalValue;
            if(!decision.hidden)renderTaskExplanation(decision,engine,{goalLabel,goalValue,hint,actionText,activeLabel,wait});
            percent = Math.max(0,Math.min(100,percent || 0)); query('#task-progress i').style.width = `${percent}%`; query('#task-progress').setAttribute('aria-valuenow', String(Math.round(percent)));
            const buildInfo=query('#build'),liveBuild=window.BUILD;
            const planningVerified=!!liveBuild&&[DATA.combat.build,DATA.economy.build,WEATHER_DATA.build].every(build=>build===liveBuild);
            buildInfo.textContent=planningVerified?`游戏构建 ${liveBuild} · 已核对战斗、经验和天气数据`
                :liveBuild&&liveBuild!==DATA.build?`游戏构建 ${liveBuild} · 战斗数据 ${DATA.combat.build}，经验数据 ${DATA.economy.build}，天气数据 ${WEATHER_DATA.build}。`:'';
            buildInfo.classList.toggle('warn',!!buildInfo.textContent&&!planningVerified);
            if (ui.workspace === 'activity') renderView(s,status,shinyRoutes);
        }
        function textCell(row, value) { const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell); }
        function trainingComparison(rows,chapter,preparing){
            const current=rows.find(row=>row.members.includes(chapter));
            const basis=preparing?'按补练阵容比较':'按当前队伍比较';
            if(!current)return basis+'各图的每分钟经验。';
            const adjacent=id=>rows.find(row=>row.reg===current.reg&&row.members.includes(id));
            const previous=adjacent(Math.min(...current.members)-1),next=adjacent(Math.max(...current.members)+1);
            function relativeRate(from,to){
                if(!Number.isFinite(from.rate)||!Number.isFinite(to.rate))return '暂待计算';
                if(from.rate<=0)return to.rate>0?'高，参考图当前经验估算为 0':'均为 0';
                const difference=(to.rate/from.rate-1)*100;
                return Math.abs(difference)<.05?'几乎持平':(difference>0?'高 ':'低 ')+Math.abs(difference).toFixed(1)+'%';
            }
            const comparisons=[];
            if(previous)comparisons.push(current.name+'与上一图'+previous.name+'比较，当前图每分钟经验'+relativeRate(previous,current));
            if(next)comparisons.push('下一图'+next.name+'比当前图的每分钟经验'+relativeRate(current,next));
            const best=rows[0];
            let decision='当前在'+current.name+'，已是候选中每分钟经验最高的地图。';
            if(!rows.some(row=>row.rate>0))decision='当前在'+current.name+'，候选路线暂无正的每分钟经验估算。';
            else if(best.key!==current.key){
                const margin=trainingSwitchMargin(current,best);
                const gain=current.rate>0?'（'+relativeRate(current,best)+'）':'';
                decision='当前在'+current.name+'，'+best.name+'排名第一'+gain+'。'+
                    (shouldSwitchTrainingRoute(current,best)?'已达到换图条件，安全节点复评后可切换。':'收益提升需超过 '+margin+'% 才切换。');
            }
            return (comparisons.length?basis+'，'+comparisons.join('。')+'。':basis+'各图的每分钟经验。')+decision;
        }
        function renderView(s, status, shinyRoutes) {
            const prep=tab==='maps'&&['train','travel'].includes(engine.preparation?.phase)&&engine.preparation.context?.reg?engine.preparation:null;
            const taskMode=prep?'train':engine.settings.mode;
            const mode=tab==='maps'&&ui.yieldView!=='task'?ui.yieldView:taskMode;
            if(mode==='box'&&tab==='maps'){
                const view=query('#view');
                if(!localRulesKnown()){engine.releaseRankingView();view.textContent='当前游戏构建待核对，暂缓盒子收益复核';viewSignature=null;return;}
                const now=Date.now(),request=boxMoneyRequest(s,engine.settings,now,engine.boxReviews);
                const rows=engine.evaluateRouteRanking(request,{},now,true)??request.initialRows;
                const texts=rows.map(row=>{
                    const records=engine.metrics[row.metric]?.partyRuns||[];
                    const match=records.find(r=>r.condition===row.condition&&r.profile===row.profile);
                    return [row.name+' · '+row.review,'理论上限 '+Math.round(row.upper)+' · 盒子预计 '+(row.rate==null?'—':Math.round(row.rate))+' · 同队实测 '+(match?Math.round(match.net*60/match.seconds)+'（'+match.runs+' 轮）':'—'),row.names?.join('、')];
                });
                const key='box'+JSON.stringify(texts);
                if(key!==viewSignature){
                    viewSignature=key;const title=document.createElement('p');title.className='hint';
                    title.textContent='已检查 '+rows.filter(r=>r.review!=='等待').length+'/'+rows.length+' 张可重打地图 · ₽/分钟 · 按盒子预计排序';
                    const opened=new Set([...view.querySelectorAll('details[open]')].map(d=>d.dataset.route)),scroll=view.scrollTop;
                    const nodes=texts.map(([name,rate,party],index)=>{
                        const block=document.createElement('div'),heading=document.createElement('strong'),line=document.createElement('div');
                        heading.textContent=name;line.textContent=rate;line.className='sub';block.append(heading,line);
                        if(party){
                            const detail=document.createElement('details'),label=document.createElement('summary'),team=document.createElement('div');
                            detail.dataset.route=rows[index].key;detail.open=opened.has(detail.dataset.route);
                            label.textContent='查看配队';team.textContent=party;detail.append(label,team);block.append(detail);
                        }
                        return block;
                    });
                    view.replaceChildren(title,...nodes);view.scrollTop=scroll;
                }
                return;
            }
            const preview=mode!==taskMode;
            const moneyAfterDex=!status.missing.length&&engine.settings.afterDex==='money'&&!engine.queueRunning;
            if(tab==='maps'&&mode==='dex'&&!moneyAfterDex){
                engine.releaseRankingView();
                viewSignature=null;dexPanel.renderRoutes(query('#view'),s,status,engine);return;
            }
            let rows,signature=null,leagueNotes=[],retained=false;
            if(FLOW_MODES.has(mode)||['legend','roam','shiny','item'].includes(mode))engine.releaseRankingView();
            if(tab==='logs')signature=JSON.stringify([tab,logPanel.filterKey(),engine.logHistory()]);
            else if(FLOW_MODES.has(mode))signature='flow:'+mode;
            else if(mode==='shiny')signature=JSON.stringify([mode,shinyRoutes.map(row=>[row.key,row.name,row.expected])]);
            else if(!['legend','roam'].includes(mode)){
                const now=Date.now();
                if(mode==='train'){
                    const held=prep?engine.coach.heldTrainingRoutes(s,prep):engine.heldFarm(s,'xp',now)?.rows;
                    if(held){rows=held;retained=true;}
                    else{
                        const request=prep?preparationRankingRequest(s,engine.settings,prep,engine.metrics,now):yieldRankingRequest('xp',s,engine.settings,engine.metrics,now);
                        const cooldowns=prep?(prep.avoid||{}):engine.cooldowns;
                        rows=engine.evaluateRouteRanking(request,cooldowns,now,true);
                        if(rows!==null)leagueNotes=excludedTrainingLeagues(request,rows,cooldowns,now);
                    }
                }else if(mode==='item')rows=itemRanking(s,engine.settings,engine.metrics,{},now).filter(row=>!(engine.cooldowns[row.key]>now));
                else{
                    retained=!!engine.heldFarm(s,'money',now);
                    rows=engine.rankedYieldRoutes(s,'money',engine.cooldowns,now,true);
                }
                if(rows===null){
                    const pending='pending:'+mode;
                    if(viewSignature!==pending){
                        const message=document.createElement('div');message.className='empty';message.setAttribute('role','status');
                        message.textContent=mode==='train'?'正在比较各地图的练级效率…':'正在比较各地图的金币收益…';
                        query('#view').replaceChildren(message);viewSignature=pending;
                    }
                    return;
                }
                signature=JSON.stringify([mode,preview,!!prep,retained,prep?prep.route?.key:engine.target?.key,(preview||mode==='train')&&s.adv.chapter,leagueNotes,rows.map(row=>[row.key,row.name,row.rate,row.measured,row.useMeasuredTime,row.actualRate,row.samples,row.projectedMoneyRate,row.projectedMoneyTurns,row.planCoverage,row.leagueTraining?.failedAt,row.leagueTraining?.stopReason,row.estimatedSeconds,row.estimatedReward,row.battleFit?.roamingRisk?.id])]);
            }
            if(signature!==null&&signature===viewSignature)return;viewSignature=signature;
            const view = query('#view'), scroll = view.scrollTop; view.replaceChildren();
            if (tab === 'maps') {
                if (mode === 'legend') {
                    const p = legendProgress(s,engine.settings), el = document.createElement('div'); el.className = 'empty';
                    el.textContent = p.zone?`${p.zone.monName || p.zone.name} · ${DATA.regions.find(r=>r.key===p.zone.reg)?.name} / ${p.zone.name}。${p.done ? '所选目标已完成。' : `当前精英 ${p.tier} 阶。${p.zone.condition || '请查看游戏开放条件。'}`}`:LEGEND_TARGET_REQUIRED; view.appendChild(el);
                } else if(mode==='roam'){
                    const p=roamingProgress(s,engine.settings,Date.now()),el=document.createElement('div');el.className='empty';
                    const map=CHAPTERS.get(p.location?.ch);el.textContent=`${MONS.get(engine.settings.roamId)?.name||engine.settings.roamId} · ${p.captured?'目标已捕获':p.unlocked?'已满足地区冠军条件':'需先获得对应地区冠军徽章'}。${map?'当前驻留：'+map.name+'。':'暂无有效驻留记录，按原生踪迹查找。'}普通色目标，基础捕获率 4%，捕获树果可提高捕获率。`;view.appendChild(el);
                } else if(FLOW_MODES.has(mode)){
                    const steps={breed:['安排百变怪与目标亲本','游戏自动产蛋、进入孵化器','等待成熟并孵化至目标'],underground:['按主题配队并派遣','等待原生远征返回','领取奖励、按设置开启晶洞'],tower:['核对本周进度与实际原生阵容','确认启动后记录已过楼层','达标原生退出、结算后切换任务'],candy:['读取今日主题并配置独立阵容','补练达标后开始今日免费场次','到目标营地退出或尽力挑战，核对真实结算'],elite:['配置整座联盟的专属队伍','逐阶挑战未完成阶级','选择宝石并领取奖励'],world:['进入本期活动并提交攻击','等待护盾击破与捕获阶段','配置捕获队伍并捕获首领'],resource:['核对目标、余额与预算','逐份购买或使用','核对新增与消耗数量']}[mode];
                    const list=document.createElement('div');list.className='flow-list';for(const [i,label]of steps.entries()){const row=document.createElement('div');row.className='step';const n=document.createElement('b');n.textContent=String(i+1).padStart(2,'0');row.append(n,label);list.appendChild(row);}view.appendChild(list);
                } else if(mode==='shiny'){
                    const table=document.createElement('table');table.innerHTML='<thead><tr><th>地图</th><th>预计目标遭遇 / 轮</th></tr></thead><tbody></tbody>';
                    for(const row of shinyRoutes){const tr=document.createElement('tr');textCell(tr,row.name);textCell(tr,row.expected.toLocaleString('zh-CN',{maximumSignificantDigits:3}));table.tBodies[0].appendChild(tr);}view.appendChild(table);if(!shinyRoutes.length)view.append('当前范围、时段和地图退避条件下暂无可用路线。');
                } else {
                    if(retained){
                        const note=document.createElement('div');note.className='hint';note.textContent='沿用已规划的路线与队伍。继续记录整轮实测，战败后复评。';view.appendChild(note);
                    }else if(mode==='train'&&rows.length){
                        const note=document.createElement('div');note.className='hint';note.textContent=preview?'按当前队伍比较各地图的每分钟经验。':trainingComparison(rows,s.adv.chapter,!!prep);view.appendChild(note);
                    }else if(mode==='item'&&rows.length){
                        const note=document.createElement('div');note.className='hint';
                        note.textContent=rows[0].useMeasuredTime?'按掉落概率和各图实测平均用时排序。':'按掉落概率和预计用时排序。各候选地图均有至少 2 轮样本后，改用实测平均用时。';
                        view.appendChild(note);
                    }
                    const coverage=mode==='money'&&rows[0]?.planCoverage;
                    if(coverage&&!retained){
                        const note=document.createElement('div');note.className='hint';
                        note.textContent=`按当前队伍比较 ${coverage.total} 张图，另估算 ${coverage.evaluated} 张图的专用阵容。`;
                        view.appendChild(note);
                    }
                    const table = document.createElement('table');
                    table.innerHTML = `<thead><tr><th>地图</th><th>${mode === 'item' ? '实得/小时（样本）' : '来源 / 整轮'}</th><th>${mode === 'item' ? '预计个/小时' : mode === 'train' ? 'EXP/分钟' : '₽/分钟'}</th></tr></thead><tbody></tbody>`;
                    const selectedKey=prep?prep.route?.key:engine.target?.key;
                    for(const league of leagueNotes){
                        const tr=table.tBodies[0].insertRow();
                        textCell(tr,league.name+'已解锁');textCell(tr,'暂不选图');textCell(tr,league.rate===null?'—':Math.round(league.rate).toLocaleString());
                        const detail=table.tBodies[0].insertRow().insertCell();
                        detail.colSpan=3;detail.className='hint warn';detail.style.textAlign='left';detail.textContent=league.reason;
                    }
                    for(const row of rows){
                        const tr=document.createElement('tr'),selected=preview?row.members.includes(s.adv.chapter):selectedKey===row.key;
                        tr.classList.toggle('active',selected);textCell(tr,(selected?'▶ ':'')+row.name);
                        let source='估算';
                        if(mode==='item')source=row.measured?(row.actualRate*60).toFixed(2)+'（'+Math.floor(row.samples)+' 轮）':'暂无样本';
                        else if(row.measured)source=(mode==='train'&&row.samples<2?'估算＋实测':'实测')+' / '+Math.floor(row.samples);
                        else if(mode==='train'&&row.leagueTraining?.partial)source='前 '+row.leagueTraining.completedMembers.length+' 关估算';
                        textCell(tr,source);textCell(tr,mode==='item'?(row.rate*60).toFixed(2):Math.round(row.rate).toLocaleString());table.tBodies[0].appendChild(tr);
                        if(mode==='money'&&row.battleFit?.roamingRisk){
                            const detail=table.tBodies[0].insertRow().insertCell();
                            detail.colSpan=3;detail.className='hint warn';detail.style.textAlign='left';
                            detail.textContent=`当前阵容难以稳定应对 ${MONS.get(row.battleFit.roamingRisk.id)?.name||'游荡首领'}`;
                        }
                        if(mode==='money'&&row.projectedMoneyRate!=null){
                            const detail=table.tBodies[0].insertRow().insertCell();
                            detail.colSpan=3;detail.className='hint';detail.style.textAlign='left';
                            detail.textContent=`专用阵容估算 ${Math.round(row.projectedMoneyRate).toLocaleString()} ₽/分钟 · 预计 ${row.projectedMoneyTurns.toFixed(1)} 回合/对手`;
                        }
                        if(mode==='money'&&selected&&!row.measured&&Number.isFinite(row.estimatedSeconds)&&Number.isFinite(row.estimatedReward)){
                            const detail=table.tBodies[0].insertRow().insertCell();
                            detail.colSpan=3;detail.className='hint';detail.style.textAlign='left';
                            detail.textContent=`每轮预计 ${Math.round(row.estimatedReward).toLocaleString()} ₽ · ${Math.round(row.estimatedSeconds)} 秒`;
                        }
                        if(mode==='train'&&row.leagueTraining?.failedAt!=null&&row.samples<2){
                            const detail=table.tBodies[0].insertRow().insertCell();
                            detail.colSpan=3;detail.className='hint';detail.style.textAlign='left';
                            detail.textContent=CHAPTERS.get(row.leagueTraining.failedAt).name+'：'+row.leagueTraining.stopReason+'。估算已计入挑战和重开耗时。';
                        }
                    }
                    view.appendChild(table); if (!rows.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '当前范围没有可规划地图，请检查解锁、来源条件或目标。'; view.appendChild(empty); }
                }
            } else {
                logPanel.draw(view);
            }
            view.scrollTop = scroll;
        }
        function changeSetting(key,value) {
            if(key==='autoPurchase'){
                try{
                    if(engine.setAutoPurchase(value)===false)throw new Error('请检查当前账号和标签页的控制权');
                }catch(error){
                    engine.status='自动购买设置未保存：'+(error.message||'请检查浏览器存储空间');
                    syncSettings();render();return false;
                }
                syncSettings();render();return true;
            }
            if (formLocked()) return false;
            const previous=formSettings();
            const patch=key==='underStartChoice'?{underAutoStart:value==='auto',underFrom:value==='auto'?previous.underFrom:Number(value)}:{[key]:value};
            if(key==='trainUids')patch.trainUid='selected';
            if(key==='legendIds')patch.legendId=value[0]??null;
            const settings=normalizeSettings({...previous,...patch});
            if(queueForm)queueForm=settings;else engine.settings=settings;
            try {
                if(engine.account&&!editingJob&&!engine.persist())throw new Error('当前标签页无权保存设置，请切回管理该账号的标签页');
                if (key === 'mode'&&!queueForm) { dailySelected=false; engine.status = `已选择${MODE_NAMES[engine.settings.mode]}，设置目标后开始`; engine.action = ''; }
            } catch(error) {
                if(queueForm)queueForm=previous;else engine.settings=previous;
                engine.status='设置未保存：'+(error.message||'请检查浏览器存储空间');
                syncSettings();render();return false;
            }
            syncSettings(); render(); place(); return true;
        }
        const budgetDrafts = new Map();
        function resetBudgetDrafts() {
            for (const input of budgetDrafts.keys()) input.removeAttribute('aria-invalid');
            budgetDrafts.clear();
        }
        function commitBudgetInput(input) {
            const key = input.dataset.setting;
            if (!budgetDrafts.has(input)) budgetDrafts.set(input,engine.account);
            if (budgetDrafts.get(input) !== engine.account || input.disabled || formLocked()) return false;
            if (engine.account) {
                let state;
                try { state=engine.read(); } catch {}
                if ((!state?.adv&&!queueForm)||state&&accountId(state)!==engine.account) {
                    engine.status='存档或账号已变化，请重新核对资源预算';
                    render();
                    return false;
                }
            }
            const amount = budgetAmount(key,input.valueAsNumber);
            if (amount === null) {
                input.setAttribute('aria-invalid','true');
                engine.status = '预算未保存，请填写 0 至 '+BUDGET_LIMITS[key]+' 的整数';
                render();
                return false;
            }
            input.removeAttribute('aria-invalid');
            if (!changeSetting(key,amount)) return false;
            input.value = String(amount);
            budgetDrafts.delete(input);
            return true;
        }
        function commitBudgetDrafts(reveal=false) {
            for (const input of budgetDrafts.keys()) {
                if (commitBudgetInput(input)) continue;
                if (reveal) {
                    selectWorkspace('settings');
                    query('#budget-details').open=true;
                    input.focus();
                }
                return false;
            }
            return true;
        }
        root.addEventListener('input',event=>{
            const input=event.target;
            if(Object.hasOwn(BUDGET_LIMITS,input.dataset.setting)&&!input.disabled)budgetDrafts.set(input,engine.account);
        });
        root.addEventListener('change',event=>{
            const input=event.target,key=input.dataset.setting;
            if(input.dataset.nurseryPref){
                try{engine.nurseryAssist.set(input.dataset.nurseryPref,input.checked);}
                catch(error){engine.nurseryAssist.note='孵蛋设置未保存 · '+error.message;}
                render();return;
            }
            if(!key)return;
            if(Object.hasOwn(BUDGET_LIMITS,key)){commitBudgetInput(input);return;}
            changeSetting(key,input.dataset.boolean==='true'?input.value==='true':input.type==='checkbox'?input.checked:input.type==='number'||['speed','legendId','legendTier'].includes(key)?Number(input.value):input.value);
        });
        // A mobile browser can hide the page or activate a command before its number keyboard emits change.
        root.addEventListener('click',event=>{
            if(event.target.closest?.('#start,#start-queue,#add-job')&&!commitBudgetDrafts(true))event.stopImmediatePropagation();
        },true);
        root.addEventListener('click',event=>{
            const button=event.target.closest('button');if(!button)return;
            if(button.dataset.category)showCategory(button.dataset.category);
            if(button.dataset.mode==='daily'&&!engine.running&&!engine.suspended){
                finishQueueEdit();dailySelected=true;
                engine.status='已选择通关日常';engine.action='';syncSettings();render();place();
            }else if(button.dataset.mode)changeSetting('mode',button.dataset.mode);
            if(button.dataset.tab){selectActivityTab(button.dataset.tab);render();}
            if(button.dataset.yieldView&&button.dataset.yieldView!==ui.yieldView){
                selectYieldView(button.dataset.yieldView);saveUI();
                viewSignature=null;query('#view').scrollTop=0;render();
            }
            if(button.dataset.lookup){
                dexPanel.search('#'+button.dataset.lookup, () => selectWorkspace('dex'));
            }
            if(button.dataset.jobAction)manageQueueJob(button.dataset.job,button.dataset.jobAction);
        });
        query('#item-search').addEventListener('input',itemOptions);
        function beginDrag(event) {
            const mini = event.currentTarget === query('.mini');
            if (event.button !== 0 || !mini&&ui.expanded || !mini && event.target.closest('button')) return;
            const box = host.getBoundingClientRect();
            drag = { key: mini ? 'mini' : 'panel', pointer: event.pointerId, x: event.clientX, y: event.clientY, dx: event.clientX-box.left, dy: event.clientY-box.top, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
        }
        function moveDrag(event) {
            if (!drag || event.pointerId !== drag.pointer) return;
            drag.moved ||= Math.hypot(event.clientX-drag.x,event.clientY-drag.y) > 5;
            if (!drag.moved) return;
            ui[drag.key] = { x: event.clientX-drag.dx, y: event.clientY-drag.dy }; place();
        }
        function endDrag(event) {
            if (!drag || event.pointerId !== drag.pointer) return;
            if (drag.key === 'mini' && drag.moved && event.type !== 'pointercancel') miniDraggedAt = Date.now();
            drag = null; saveUI();
        }
        for (const handle of [query('header'),query('.mini')]) {
            handle.addEventListener('pointerdown',beginDrag); handle.addEventListener('pointermove',moveDrag);
            handle.addEventListener('pointerup',endDrag); handle.addEventListener('pointercancel',endDrag); handle.addEventListener('lostpointercapture',endDrag);
        }
        window.addEventListener('resize',place,{signal:life.signal});
        query('.mini-links').onclick=event=>{
            const button=event.target.closest('[data-mini-link]');if(!button)return;
            const key=button.dataset.miniLink==='next'?button.dataset.nextTarget:button.dataset.miniLink;
            if(key==='logs'){selectActivityTab('logs');jumpTo('activity','#log-tools');}
            else if(key==='underground')jumpTo('activity','#underground-insight');
            else if(key==='eggs')jumpTo('eggs','#nursery-info');
            else if(key==='queue')jumpTo('queue','#queue-list');
            else if(key==='gain'&&engine.settings.mode==='item')jumpTo('tasks','#item-field-insight');
            else if(key==='gain'){selectActivityTab('maps');jumpTo('activity','#view');}
            else jumpTo('activity','#execution-info');
        };
        query('#health-insight').addEventListener('toggle',()=>{if(query('#health-insight').open)render();});
        query('#underground-insight').addEventListener('toggle',()=>{if(query('#underground-insight').open)render();});
        query('#raid-insight').addEventListener('toggle',()=>{if(query('#raid-insight').open)render();});
        for(const button of root.querySelectorAll('[data-open-raid-insight]'))button.onclick=()=>jumpTo('activity','#raid-insight');
        query('#fold').onclick=()=>{fold(true);query('.mini').focus({preventScroll:true});};
        query('.mini').onclick=event=>{if(event.detail>0 && Date.now()-miniDraggedAt<500)return;fold(false);query('#fold').focus({preventScroll:true});};
        function finishQueueEdit(){
            if(!editingJob)return;
            queueForm=null;editingJob=null;queueError='';
            resetBudgetDrafts();itemOptions();syncSettings();
        }
        function saveQueue(jobs,operation){
            try{engine.updateQueue(jobs,operation);queueError='';return true;}
            catch(error){queueError='任务队列未保存 · '+error.message;engine.status=queueError;render();return false;}
        }
        function focusQueueJob(id,action='edit'){
            if(id===newQueueJob)id=null;
            const card=[...root.querySelectorAll('[data-queue-job]')].find(el=>el.dataset.queueJob===id);
            (card?.querySelector(`[data-job-action="${action}"]:not(:disabled)`)||card?.querySelector('[data-job-action="edit"]:not(:disabled)')||query('#queue-add')).focus({preventScroll:true});
            card?.scrollIntoView({block:'nearest'});
        }
        function manageQueueJob(id,action){
            if(editingJob)return;
            const jobs=engine.editableQueue(),i=jobs.findIndex(job=>job.id===id),job=jobs[i];
            if(!job)return;
            queueError='';
            if(action==='edit'){
                dailySelected=false;resetBudgetDrafts();
                editingJob=id;
                queueForm=engine.taskSettings(job.settings);itemOptions();syncSettings();selectWorkspace('tasks');return;
            }
            if(action==='up'||action==='down'){
                const next=i+(action==='up'?-1:1);
                if(!jobs[next])return;
                [jobs[i],jobs[next]]=[jobs[next],job];
            }else if(action==='skip'){
                jobs[i]={...job,status:'skipped',result:'已手动跳过'};
                if(job.settings.mode==='item')jobs[i].itemAcquired=queueItemAcquired(job,engine.state);
            }else if(action==='retry')jobs[i]={...job,status:'pending',result:'',progress:undefined,itemAcquired:undefined};
            else if(action==='remove')jobs.splice(i,1);
            else return;
            const move=action==='up'||action==='down';
            const op=move?{kind:'move',id,anchor:jobs[i].id,after:action==='down'}:{kind:action,id};
            if(saveQueue(jobs,op)){render();focusQueueJob(action==='remove'?jobs[Math.min(i,jobs.length-1)]?.id:id,action);}
        }
        function jobTitle(cfg){const target={legend:legendSelectionLabel(cfg),roam:MONS.get(cfg.roamId)?.name,dex:cfg.dexSpecies?.length?cfg.dexSpecies.length+' 种目标':null,shiny:shinyGoals(cfg).map(id=>MONS.get(id).name).slice(0,3).join('、')+(shinyGoals(cfg).length>3?' 等':''),breed:MONS.get(cfg.breedId)?.name,item:ITEMS.get(cfg.itemId)?.name,train:`Lv.${cfg.trainLevel}`,progress:CHAPTERS.get(cfg.progressUntil)?.name,elite:`${cfg.eliteTier} 阶`,tower:`${cfg.towerFloor} 层`,candy:`${cfg.candyFloor?cfg.candyFloor+'层':'尽力挑战'} / ${cfg.candyRuns}局`,underground:`${cfg.underRuns} 次`,world:`${cfg.worldActions} 次攻击`,resource:ITEMS.get(cfg.resourceItem)?.name||cfg.resourceItem}[cfg.mode];return MODE_NAMES[cfg.mode]+(target?' · '+target:'');}
        function goalIdentity(cfg){
            const keys={
                dex:['dexSpecies','dexWeather','dexRegions'],shiny:['shinyId','shinySpecies','shinyWeather','shinyRegions'],
                legend:['legendId','legendIds','legendTier'],roam:['roamId'],item:['itemId'],train:['trainUid','trainUids','trainLevel','trainRank','trainGems'],
                breed:['breedId','breedShiny'],elite:['eliteRegion','eliteTier'],world:['worldCapture'],
                resource:['resourceItem','resourceAction','useUid'],progress:['progressUntil'],
            };
            return JSON.stringify([cfg.mode,cfg.region,...(keys[cfg.mode]||[]).map(key=>cfg[key])]);
        }
        query('#queue-add').onclick=()=>{
            if(!editingJob){editingJob=newQueueJob;queueForm=engine.taskSettings(engine.settings);resetBudgetDrafts();}
            queueError='';dailySelected=false;itemOptions();syncSettings();selectWorkspace('tasks');
        };
        query('#cancel-job').onclick=()=>{const id=editingJob;finishQueueEdit();selectWorkspace('queue');focusQueueJob(id);};
        query('#add-job').onclick=()=>{
            if(formLocked())return;
            const jobs=engine.editableQueue(),i=jobs.findIndex(job=>job.id===editingJob),current=jobs[i];
            if(jobs.length>=50&&!current){engine.status='任务队列最多保存 50 项';render();return;}
            const settings=normalizeSettings(formSettings());
            if(editingJob&&editingJob!==newQueueJob&&!current){queueError='该任务已被移除，请取消编辑并返回队列。';render();return;}
            if(trainingEntry()&&engine.state){
                if(trainingStatus(engine.state,settings).missing)return;
                settings.trainUids=trainingUids(engine.state,settings);settings.trainUid='selected';
            }
            const job={id:current?.id||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,title:jobTitle(settings),settings,status:'pending',result:''};
            if(current?.progress){
                const compatible=goalIdentity(current.settings)===goalIdentity(settings);
                job.progress=compatible?current.progress:{budget:current.progress.budget};
                if(compatible){job.status='paused';job.result=current.result;job.itemAcquired=current.itemAcquired;}
            }
            if(current)jobs[i]=job;else jobs.push(job);
            if(!saveQueue(jobs,{kind:current?'edit':'add',id:job.id,job,wasPending:!!current&&queueJobPending(current),keepProgress:!!current&&goalIdentity(current.settings)===goalIdentity(settings)}))return;
            finishQueueEdit();if(!engine.running&&!engine.suspended)engine.status='任务已保存到队列';selectWorkspace('queue');focusQueueJob(job.id);
        };
        query('#start-queue').onclick=()=>{if(editingJob)return;dailySelected=false;engine.startQueue();if(!engine.running)queueError=engine.status;else queueError='';syncSettings();render();};
        query('#start').onclick=()=>{
            const daily=selectedCard()==='daily';
            if(trainingEntry()&&engine.state&&engine.settings.trainUid!=='selected'&&
                !changeSetting('trainUids',trainingUids(engine.state,engine.settings)))return;
            engine.queueRunning=false;engine.start(false,daily);syncSettings();render();
        };
        query('#daily-shiny-raid').onchange=event=>changeSetting('raids',event.target.checked);
        query('#daily-edit-goal').onclick=()=>{
            const mode=dailyMainMode(engine.settings);
            if(!DAILY_BASE_MODES.has(mode)||!changeSetting('mode',mode))return;
            const field=['dex','shiny'].includes(mode)?query('#hunt-filters'):query(`[data-fields="${mode}"]`);
            field?.scrollIntoView({block:'nearest'});field?.querySelector('summary,select,input')?.focus({preventScroll:true});
        };
        query('#stop').onclick=()=>{engine.stop();syncSettings();render();};
        query('#resume').onclick=()=>{engine.resumeManual();render();};
        query('#reset').onclick=()=>{if(engine.running||engine.suspended)return;engine.metrics={};engine.telemetry=new Telemetry(engine.metrics);engine.persist();engine.log('已清除金币、经验与道具采样');render();};
        function downloadJson(data,filename){
            const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
            const url=URL.createObjectURL(blob),link=document.createElement('a');
            link.href=url;link.download=filename;
            document.body.appendChild(link);
            try{link.click();}
            finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
        }
        const readSimBox=async()=>{
            const s=engine.read();if(!s?.adv)throw Error('请先加载存档');
            return simulatorBox(s,accountId(s)===engine.account?engine.settings:DEFAULTS,Date.now(),window.BUILD,query('#simulator-resources').checked);
        };
        query('#simulator-export').onclick=async()=>{const status=query('#box-export-result');try{const box=await readSimBox();downloadJson(box,'pokecatch-simulator-box.json');
            const flagged=box.members.filter(m=>m.fieldDiagnostics).length;
            status.textContent='已导出 '+box.members.length+' 只'+(flagged?' · '+flagged+' 只含待核对字段':'')+(box.resourcesSnapshot?' · 已附培养资源':'')+(box.identityPersistent?'':' · 未识别存档，本次使用新身份空间');}catch(e){status.textContent=e.message;}};
        query('#simulator-reset-scope').onclick=async()=>{if(!confirm('重建当前存档的匿名身份空间？旧方案将需要手动核对。'))return;
            try{const s=engine.read();if(!s?.trainer?.id)throw Error('当前存档身份未知');await simIdentity(String(s.trainer.id),(s.mons??[]).map(m=>m.uid),true);
                query('#box-export-result').textContent='已重建身份空间，请重新导出 Box。';}catch(e){query('#box-export-result').textContent=e.message;}};
        query('#simulator-plan-open').onclick=()=>query('#simulator-plan-file').click();
        query('#simulator-plan-file').onchange=async event=>{
            const file=event.target.files?.[0];event.target.value='';if(!file)return;
            const panel=query('#simulator-review');try{
                if(file.size>256*1024)throw Error('方案文件超过 256 KiB');
                const plan=readSimulatorPlan(await file.text()),box=await readSimBox(),{rows,same}=await reviewSimulatorPlan(plan,box);
                const content=document.createElement('div'),line=text=>{const p=document.createElement('p');p.textContent=text;content.append(p);return p;};
                line('挑战方案 · '+plan.target+' · '+plan.conditions.weather+' / '+plan.conditions.phase+' · 模拟 '+plan.sample.wins+'/'+plan.sample.trials);
                for(const a of plan.training.actions)line('手动补练 · 第 '+a.position+' 位 Lv.'+a.from+' → '+a.to+' · 经验 '+(a.xp??'未知'));
                if(!same)line('身份空间不同或旧版 Box，请逐只手工确认。');
                if(box.rules.autoTeam||box.rules.activeSwitch)line('助手自动配队或切换已开启，可能覆盖推荐队。');
                for(const key of ['weather','phase'])if(plan.conditions[key]!==box.conditionsSnapshot[key])line(key+' · 当前 '+box.conditionsSnapshot[key]+'，请核对方案条件。');
                const selected=rows.map(r=>r.mon?.uid),messages=[];
                const status=document.createElement('p'),done=document.createElement('button');
                const refresh=()=>{done.disabled=selected.some(a=>!a)||new Set(selected).size!==rows.length;status.textContent=done.disabled?'尚有缺失、重复或待确认成员':selected.join(',')===box.activeTeam.join(',')?'当前队及顺序一致':'当前队与推荐队不同，请手动调整。';};
                for(const [i,r] of rows.entries()){
                    const label=(i+1)+'. '+r.m.name+(r.m.profile.shiny?' ✦ 异色':'')+' Lv.'+r.m.profile.level+' · '+r.m.profile.rank+' 阶';messages.push(label);line(label);
                    const describe=m=>{const dif=Object.keys(r.m.profile).filter(k=>simCanonical(simProfile(m)[k])!==simCanonical(r.m.profile[k]));return (m.fieldDiagnostics?'当前存档字段异常 · '+Object.keys(m.fieldDiagnostics).join('、')+' · ':'')+(dif.length?'字段变化 '+dif.join('、'):'画像相符')+(m.availability.state==='available'?'':' · 成员被占用或状态未知');};
                    if(r.m.sources){const supplied=Object.entries(r.m.sources).filter(([,v])=>['user-supplied','model-assumption'].includes(v));if(supplied.length)line('按模型假设或手动补充 · '+supplied.map(([k])=>k).join('、'));}
                    if(r.mon)line(describe(r.mon));else{const sel=document.createElement('select'),details=line(r.choices.length?'请选择具体个体':'存档中没有此成员');sel.add(new Option('待确认',''));for(const m of r.choices)sel.add(new Option(m.name+' '+(m.shiny?'✦ 异色 ':'')+'Lv.'+m.level+' · '+m.rank+'阶 · '+m.uid,m.uid));content.append(sel);
                        sel.onchange=()=>{selected[i]=sel.value;const m=r.choices.find(m=>m.uid===sel.value);details.textContent=m?describe(m):'待确认';refresh();};}
                }
                const copy=document.createElement('button');copy.textContent='复制核对清单';copy.onclick=()=>navigator.clipboard.writeText(messages.join('\n'));
                done.textContent='标记已核对';done.onclick=()=>{status.textContent='已由玩家核对 · '+new Date().toLocaleTimeString();};
                const share=document.createElement('button');share.textContent='导出分享问题包';
                share.onclick=()=>{if(confirm('分享文件包含队伍画像、条件和模拟结果，仍可能被识别。继续导出？'))downloadJson({format:'pokecatch-team-review-share',schema:1,target:plan.target,conditions:plan.conditions,
                    team:plan.team.map(m=>({profile:m.profile})),sample:plan.sample,engine:plan.engine,rules:plan.rules},'pokecatch-review-share.json');};
                content.append(status,copy,done,share);refresh();panel.replaceChildren(content);
            }catch(e){panel.textContent='无法核对 · '+e.message;}
        };
        query('#export-box').onclick=()=>{
            const result=query('#box-export-result');
            try{
                const s=engine.read(),settings=s&&accountId(s)===engine.account?engine.settings:DEFAULTS;
                const box=boxSnapshot(s,settings,Date.now(),window.BUILD),name='pokecatch-box.json';
                downloadJson(box,name);
                const expeditions=box.underground?.slots.length||0;
                result.textContent=`已导出盒中 ${box.members.length} 只${expeditions?`及地下 ${expeditions} 队`:''} · ${name}`;
            }catch(error){result.textContent='盒子导出失败 · '+error.message;}
        };
        query('#export').onclick=()=>{
            const s=engine.state,diagnostic={version:VERSION,build:window.BUILD,dataBuild:DATA.build,mechanismBuild:DATA.economy.build,mechanismChecked:DATA.economy.checked,settings:engine.settings,status:engine.status,flow:engine.automation.state,services:engine.services,execution:taskExecutionState(s,engine),preparation:engine.preparation,queue:engine.queue,budget:{spent:engine.budget.spent,used:engine.budget.used},game:s?.adv?{chapter:s.adv.chapter,unlocked:s.adv.unlocked,layout:s.adv.layout,event:s.adv.event?.raid?'raid':!!s.adv.event,zone:s.adv.zone?.id,money:s.money,teamSize:s.team?.length}:null,metrics:engine.metrics,logs:engine.logHistory()};
            diagnostic.health=engine.healthReport();diagnostic.lastStop=engine.lastStop;
            if(s?.pension){
                diagnostic.nursery={...engine.nurseryAssist.prefs,build:nurseryRuntimeOptions().build,
                    nextEgg:s.pension.laid??null,reserve:s.pension.bx??0,stock:s.items?.[NURSERY_RULES.berry]??0,
                    note:engine.nurseryAssist.note};
            }
            diagnostic.teamReview={current:engine.reviewProgress(),recent:diagnostic.logs.filter(entry=>entry.module==='配队复核').slice(0,12)};
            downloadJson(diagnostic,'pokecatch-helper-diagnostic.json');
        };
        query('#probability-info').addEventListener('toggle',()=>{if(query('#probability-info').open)render();});
        query('#export-profile').onclick=()=>{
            const profile=configurationProfile({settings:engine.idleTaskSettings(),queue:engine.queue});
            downloadJson(profile,`pokecatch-settings-${VERSION}.json`);
        };
        query('#import-profile').onclick=()=>query('#profile-file').click();
        query('#profile-file').onchange=async event=>{
            const file=event.target.files?.[0], account=engine.account;event.target.value='';if(!file)return;
            try{if(file.size>2*1024*1024)throw new Error('配置文件超过2MB');const content=await file.text();if(account!==engine.account)throw new Error('读取文件期间账号已切换，请重新选择文件');importConfigurationProfile(engine,content);resetBudgetDrafts();editingJob=null;syncSettings();}
            catch(err){engine.status='配置导入失败：'+err.message;engine.log(engine.status);}
            render();
        };

        query('#restore').onclick = async () => {
            if (engine.running || engine.suspended || !engine.oldLoops) return;
            // Restoration uses the same page switches, and can be cancelled with Stop.
            if (!engine.acquire(Date.now())) { engine.status = '另一个标签页正在运行助手'; render(); return; }
            engine.running = true; engine.restoring = true; const epoch = ++engine.runId; query('#stop').disabled = false; query('#start').disabled = true;
            try {
                const started = Date.now();
                for (const region of DATA.regions) {
                    let complete = false;
                    for (let n = 0; n < 30 && engine.running && epoch === engine.runId; n++) {
                        if (Date.now() - started > 60000) throw new Error('恢复循环超时');
                        if (!engine.acquire(Date.now()) || engine.storage.getItem('pokecatch-tab') !== engine.tabToken) throw new Error('另一个标签页已接管游戏');
                        if (!engine.driver.nav('map')) { await new Promise(r => setTimeout(r, 800)); continue; }
                        const reg = $(`#map-root .rg.open[data-rg="${region.key}"]`); if (!reg) { complete = true; break; }
                        const selected = $('#map-root .rg.active[data-rg]');
                        if (selected?.dataset.rg !== region.key) { engine.driver.click(reg, '切换地区，恢复循环'); await new Promise(r => setTimeout(r, 800)); continue; }
                        const mismatch = $$('#map-root [data-loop]').find(el => (el.getAttribute('aria-checked') === 'true') !== engine.oldLoops.some(key => String(key) === el.dataset.loop));
                        if (!mismatch) { complete = true; break; }
                        engine.driver.click(mismatch, '恢复启动前循环'); await new Promise(r => setTimeout(r, 800));
                    }
                    if (epoch !== engine.runId || !engine.running) return;
                    if (!complete) throw new Error('部分循环未能恢复，请手动检查');
                }
                if (engine.running && epoch === engine.runId) engine.stop('已恢复启动前的循环设置');
            } catch (err) { if (epoch === engine.runId) engine.stop(err.message); }
            render();
        };

        document.addEventListener('visibilitychange',()=>{
            if(document.hidden){
                if(pageHidden()&&engine.running)engine.hiddenAt??=Date.now();
                engine.releaseRankingView();commitBudgetDrafts();
                return;
            }
            engine.markLocalDirty();
            if(engine.suspended)engine.resumeSuspended();
            else if(engine.running&&!engine.restoring)engine.schedule(50);
            engine.notifyView(true);place();
        },{signal:life.signal});
        engine.gameInputFocused = () => {
            const active = document.activeElement;
            return !!active&&active!==host&&active!==document.body&&(active.isContentEditable||active.tagName==='TEXTAREA'||active.tagName==='INPUT'&&['text','search','password','email','url','tel','number'].includes(active.type));
        };
        engine.releaseIdleGameInput=()=>{
            if(engine.inputHeld||engine.inputComposing)return false;
            const active=document.activeElement;
            if(!engine.gameInputFocused()||!active)return false;
            if(active.matches('#pc-search,input[type="search"]')||!visible(active)){active.blur();return !engine.gameInputFocused();}
            return false;
        };
        window.addEventListener('pagehide', () => {
            try{rememberWorkspaceScroll();saveUI();commitBudgetDrafts();}
            finally{engine.releaseRankingView();engine.nurseryAssist.cancelIdle();engine.suspend();}
        },{signal:life.signal});
        window.addEventListener('storage',event=>{
            if(event.storageArea===engine.storage&&engine.account&&(event.key?.startsWith(engine.queueEditPrefix())||event.key===PREFIX+engine.account)){
                if(event.key===PREFIX+engine.account&&!engine.running&&!engine.suspended&&!engine.mayPersist()&&event.newValue){
                    const record=JSON.parse(engine.storage.getItem(event.key)||'{}');
                    engine.queue=normalizeJobs(record.queue);engine.appliedQueueEdits=new Set(record.appliedQueueEdits||[]);
                }
                engine.refreshQueueEdits();render();
            }
            if((event.key===SAVE_KEY||event.key===null)&&event.storageArea===engine.storage)engine.markLocalDirty();
            if(engine.nurseryAssist.key&&event.key===engine.nurseryAssist.key){
                engine.nurseryAssist.refresh();render();return;
            }
            if(!engine.account||event.key!==PREFIX+'purchase:'+engine.account)return;
            engine.refreshAutoPurchase();
            syncSettings();render();
        },{signal:life.signal});
        window.addEventListener('pageshow',()=>{if(engine.suspended){engine.resumeSuspended();engine.notifyView(true);}},{signal:life.signal});
        engine.onChange = (force=true) => {if(force||paintDue())render(!force);};
        itemOptions(); syncSettings(); render(); fold(!!ui.folded);if(!ui.folded)content.scrollTop=Number(workspaceScroll[ui.workspace])||0;
        bindManualInput(engine,host,force=>{if(force||performance.now()-lastPaint>=500)render();},()=>helperAPI.show(),life.signal);
        heartbeatTimer=setInterval(()=>{
            if(!document.hidden&&engine.settings.resumeOnReload&&engine.suspended?.retryAt<=Date.now())engine.resumeSuspended();
            try{engine.nurseryAssist.idleStep();}
            catch(error){engine.nurseryAssist.cancelIdle();engine.nurseryAssist.note='待命孵蛋暂停 · '+error.message;}
            if(!document.hidden&&paintDue())engine.notifyView();
        },2500);
        helperAPI.ready=true;startupPhase='已显示';
        document.getElementById('pokecatch-helper-recovery')?.remove();
        if(recoveringLegacy){
            // Older releases kept their own menus and visibility listeners after a failed mount.
            const legacyNodes=new MutationObserver(changes=>{
                for(const change of changes)for(const node of change.addedNodes){
                    if(node!==host&&node.isConnected&&(node.id==='pokecatch-auto-helper'||node.id==='pokecatch-helper-recovery'))node.remove();
                }
                if(!host.isConnected&&document.body)document.body.appendChild(host);
            });
            legacyNodes.observe(document.body,{childList:true});
            life.signal.addEventListener('abort',()=>legacyNodes.disconnect(),{once:true});
        }
        dexPanel.syncNative(engine.state);
        }catch(err){
            const reason='助手界面初始化失败：'+(err?.message||err);
            life.abort();clearInterval(heartbeatTimer);
            helperAPI.ready=false;helperAPI.error=reason;engine.onChange=null;
            engine.networkObserver?.disconnect();engine.nurseryAssist.cancelIdle();ownedHost?.remove();
            try{engine.stop(reason,{persist:false});}catch{}
            showStartupError(err);
            const showFailure=restorePanel;
            helperAPI.show=restorePanel=()=>requestOwner(showEvent)||showFailure();
        }
    }
    mount();
    }catch(err){showStartupError(err);}
})();

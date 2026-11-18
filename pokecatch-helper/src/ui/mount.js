    if (window.top !== window.self) return;
    const previousHelper=window.__pokecatchHelper;
    if(previousHelper&&document.getElementById('pokecatch-auto-helper')?.isConnected){if(typeof previousHelper.show==='function')restorePanel=previousHelper.show;startupPhase='复用已挂载实例';return;}
    if(previousHelper&&typeof previousHelper.show==='function'){restorePanel=previousHelper.show;startupPhase='恢复已有实例';previousHelper.show();return;}
    // Older builds created this marker before mounting. A marker without a panel is
    // not a working instance and must not prevent a new installation from appearing.
    try{previousHelper?.stop?.();}catch{}
    let helperStorage,storageError;
    try{helperStorage=window.localStorage;helperStorage.getItem(SAVE_KEY);}
    catch(err){
        storageError='浏览器存储不可用：'+(err?.message||err);
        const memory=new Map();helperStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
    }
    const engine = new Engine(helperStorage);
    if(storageError)engine.status=storageError;
    const helperAPI={version:VERSION,ready:false,stop:()=>engine.stop('手动停止助手')};
    window.__pokecatchHelper=helperAPI;
    startupPhase='准备挂载面板';

    function mount() {
        if (!document.body){startupPhase='等待页面主体';return setTimeout(mount,500);}
        try{
        const host = document.createElement('div'); host.id = 'pokecatch-auto-helper';
        host.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;position:fixed;right:14px;top:86px;z-index:2147483000;max-width:calc(100vw - 20px);';
        const root = host.attachShadow({ mode: 'open' });
        const underStartControls = `<label class="setting"><span><input type="checkbox" data-setting="underAutoStart">地下探险从最高已解锁起点出发</span></label>
            <label class="field" data-under-manual><span>手动起点上限</span><input type="number" min="1" max="300" data-setting="underFrom"></label>`;
        root.innerHTML = `<style>${PANEL_STYLE}</style><button class="mini hidden" title="展开助手">ϟ PokéCatch <span id="mini-state">待命</span></button><section class="panel">
            <header title="拖动标题栏移动面板"><span class="logo">ϟ</span><b>PokéCatch 自动助手</b><span class="tag">${VERSION}</span><button id="check-update" title="检查 Catch 仓库的在线更新">在线更新</button><button id="fold" aria-label="收起助手">−</button></header>
            <nav class="workspace-nav" aria-label="助手面板">
                <button data-workspace="tasks" aria-controls="pane-tasks">任务</button><button data-workspace="activity" aria-controls="pane-activity">运行实况</button><button data-workspace="settings" aria-controls="pane-settings">设置</button>
            </nav><div class="content"><div id="update-notice" class="update-notice hidden" role="status" aria-live="polite"></div><details id="update-tools" class="hidden"><summary>更新源与连接状态</summary><div class="row"><select id="update-source" aria-label="选择在线更新源"><option value="auto">自动切换（推荐）</option>${UPDATE_SOURCES.map(source=>`<option value="${source.id}">${source.name}</option>`).join('')}</select><button id="recheck-update">重新检查</button></div><div id="update-source-list"></div><div class="row"><button id="download-update" disabled>下载已校验脚本</button></div><div class="hint">取得最新提交后优先固定版本；分支缓存仅表示暂未发现更新。安装页打不开时，可下载本次校验的脚本，再用油猴导入。</div></details><div class="status" role="status" aria-live="polite"><div class="live"><i class="dot"></i><span id="run-state">READY · 已就绪</span></div><strong id="status"></strong><div class="sub" id="action"></div></div>
            <div class="metrics"><div class="metric"><b id="dex-value">—</b><span id="primary-label">进化链完成</span></div><div class="metric" title="合计当前钱包及跨地区暂存的钱包余额"><b id="money-value">0</b><span id="money-label">本次金币净增</span></div><div class="metric"><b id="time-value">0:00</b>本次运行</div></div>
            <div class="target hidden" id="prepare-info"><b id="prepare-title"></b><div class="sub" id="prepare-target"></div><div class="sub" id="prepare-route"></div><div class="sub" id="prepare-levels"></div><div class="sub" id="prepare-buddy"></div><div class="sub" id="prepare-assessment"></div><div class="bar"><i id="prepare-bar"></i></div></div>
            <section id="pane-tasks" aria-label="任务"><div class="caption">选择任务</div><select data-setting="mode" class="sr-only" aria-label="任务模式">${Object.entries(MODE_NAMES).map(([id,name]) => `<option value="${id}">${name}</option>`).join('')}</select>
            <div class="categories" role="group" aria-label="任务分类"><button data-category="adventure" class="on">冒险</button><button data-category="collect">收集与养成</button><button data-category="battle">独立活动</button><button data-category="resource">资源</button></div>
            <div class="modes">${[['dex','◈','补齐图鉴','adventure'],['money','₽','自动刷钱','adventure'],['progress','➜','推进主线','adventure'],['legend','✦','指定传说','collect'],['roam','⌖','游荡捕获','collect'],['shiny','✧','野生刷闪','collect'],['breed','◌','繁殖孵蛋','collect'],['train','↑','目标练级','collect'],['underground','⛏','地下通道','battle'],['tower','▥','对战塔','battle'],['candy','◬','糖果工厂','battle'],['elite','♜','精英联盟','battle'],['world','◎','世界首领','battle'],['item','▣','刷指定道具','resource'],['resource','＋','采购与使用','resource']].map(([id,icon,name,group]) => `<button data-mode="${id}" data-group="${group}" aria-pressed="false"><span>${icon}</span>${name}</button>`).join('')}</div>
            <div class="target">
                <div class="field" id="scope-field"><span>规划范围</span><select data-setting="region" aria-label="规划地区"><option value="current">当前地区</option><option value="all">所有已解锁地区</option></select></div>
                <div data-fields="legend" class="hidden"><div class="field"><span>传说目标</span><select data-setting="legendId" aria-label="传说战目标"></select></div><div class="field"><span>完成条件</span><select data-setting="legendTier" aria-label="传说战完成条件"><option value="0">普通捕获（全部轮换形态）</option>${[1,2,3,4,5].map(t => `<option value="${t}">精英推进至 ${t} 阶</option>`).join('')}</select></div><div class="field"><span>最长等待</span><input data-setting="legendMinutes" type="number" min="5" max="720" aria-label="传说战最长分钟数"></div><label class="setting"><span><input type="checkbox" data-setting="roamAllowMasterBall">允许游荡目标自动消耗库存大师球</span></label><div class="hint">游荡目标的普通捕获会转为在线追踪；精英入口仅用于挑战阶级。普通传说战与游荡目标不能刷异色。</div></div>
                <div data-fields="roam" class="hidden"><div class="field"><span>游荡目标</span><select data-setting="roamId" aria-label="游荡宝可梦目标"></select></div><div class="field"><span>搜寻时限</span><input data-setting="roamMinutes" type="number" min="5" max="720" aria-label="游荡搜寻最长分钟数"></div><label class="setting"><span><input type="checkbox" data-setting="roamAllowMasterBall">允许游戏自动使用库存大师球</span></label><div class="hint">在线追踪目标驻留地图，捕获确认后完成。游荡目标为普通色；真正离线不会产生新遭遇。默认不允许消耗大师球，持有大师球时会提示等待你处理。</div></div>
                <div data-fields="item" class="hidden"><div class="field"><span>搜索道具</span><input id="item-search" type="search" placeholder="名称或英文编号" aria-label="筛选道具"></div><div class="field"><span>道具目标</span><select data-setting="itemId" aria-label="道具目标"></select></div><div class="field"><span>本次获取</span><input data-setting="itemQuantity" type="number" min="1" max="99999" aria-label="本次道具数量"></div></div>
                <div data-fields="train" class="hidden"><div class="field"><span>练级对象</span><select data-setting="trainUid" aria-label="练级对象"><option value="team">当前冒险队伍 · 全队</option></select></div><div class="field"><span>目标等级</span><input data-setting="trainLevel" type="number" min="1" max="100" aria-label="目标等级"></div></div>
                <div data-fields="progress" class="hidden"><div class="field"><span>完成章节</span><select data-setting="progressUntil" aria-label="主线目标章节"></select></div><label class="setting"><span><input type="checkbox" data-setting="autoTravel">达到条件后自动跨地区开局</span></label></div>
                <fieldset id="hunt-filters" style="min-width:0;margin:8px 0;padding:9px;border:1px solid #40516a;border-radius:8px">
                    <legend>搜寻条件</legend>
                    <details><summary id="hunt-region-summary"></summary><div id="hunt-regions" class="checks"></div></details>
                    <details><summary id="hunt-weather-summary"></summary><div id="hunt-weather" class="checks"></div></details>
                    <details><summary id="hunt-species-summary"></summary>
                        <input id="hunt-search" type="search" aria-label="搜索目标物种" placeholder="中文名、英文名或编号">
                        <div class="field"><select id="hunt-picker" aria-label="可添加的物种"></select><button type="button" id="hunt-add">添加</button></div>
                        <div id="hunt-selected" class="missing" aria-label="已选物种"></div>
                    </details><div id="hunt-help" class="hint"></div>
                </fieldset><button type="button" id="hunt-forecast">查看地区天气预报</button>
                <div data-fields="breed" class="hidden"><div class="field"><span>孵化目标</span><select data-setting="breedId" aria-label="繁殖物种"></select></div><div class="field"><span>孵化数量</span><input data-setting="breedGoal" type="number" min="1" max="9999"></div><label class="setting"><span><input type="checkbox" data-setting="breedShiny">孵到目标异色为止</span></label><label class="setting"><span><input type="checkbox" data-setting="pensionExpand">预算内购买繁殖必需的寄养位</span></label></div>
                <div data-fields="underground" class="hidden"><div class="field"><span>领取次数</span><input data-setting="underRuns" type="number" min="1" max="999"></div>${underStartControls}<label class="setting"><span><input type="checkbox" data-setting="underOpenGeodes">领取完后开启背包中的晶洞</span></label></div>
                <div data-fields="tower" class="hidden"><div class="field"><span>目标楼层</span><input data-setting="towerFloor" type="number" min="1" max="999"></div><div class="field"><span>尝试上限</span><input data-setting="towerRuns" type="number" min="1" max="100"></div></div>
                <div data-fields="candy" class="hidden"><div class="field"><span>目标层（0 尽力挑战）</span><input data-setting="candyFloor" type="number" min="0" max="999"></div><div class="field"><span>完成场次（每天一次）</span><input data-setting="candyRuns" type="number" min="1" max="30"></div></div>
                <div data-fields="elite" class="hidden"><div class="field"><span>联盟地区</span><select data-setting="eliteRegion"><option value="current">当前地区</option>${DATA.regions.map(r=>`<option value="${r.key}">${r.name}</option>`).join('')}</select></div><div class="field"><span>目标阶级</span><select data-setting="eliteTier">${[1,2,3,4,5].map(n=>`<option value="${n}">推进至 ${n} 阶</option>`).join('')}</select></div></div>
                <div data-fields="world" class="hidden"><div class="field"><span>本次攻击</span><input data-setting="worldActions" type="number" min="1" max="3"></div><label class="setting"><span><input type="checkbox" data-setting="worldCapture">攻击后等待开放，并自动捕获本期首领</span></label></div>
                <div data-fields="resource" class="hidden"><div class="field"><span>目标道具</span><select data-setting="resourceItem"></select></div><div class="field"><span>执行动作</span><select data-setting="resourceAction"><option value="buy">只购买</option><option value="use">只使用背包道具</option><option value="buyUse">不足时购买并使用</option></select></div><div class="field"><span>份数目标</span><input data-setting="resourceQuantity" type="number" min="1" max="99999"></div><div class="field"><span>使用对象</span><select data-setting="useUid"><option value="">冒险队伍首位</option></select></div></div>
                <div data-fields="money" class="hidden"><div class="field"><span>目标金币</span><input data-setting="moneyTarget" type="number" min="0" placeholder="0 为持续执行"></div></div>
                <div class="hint" id="target-hint"></div><div class="goal"><span id="goal-label">进度</span><span id="goal-value">—</span></div><div class="bar" id="task-progress" role="progressbar" aria-label="任务进度" aria-valuemin="0" aria-valuemax="100"><i></i></div>
            </div>
            </section>
            <section id="pane-activity" aria-label="运行实况" hidden>
            <section id="execution-info" class="execution-card" aria-label="任务执行状态" aria-live="polite"><div class="execution-top"><span>任务执行</span><span id="ui-owner"></span></div><strong id="foreground-task">未启动主任务</strong><div id="foreground-detail"></div><div id="background-services"></div><details id="decision-info"><summary>路线与配队依据</summary><div class="sub" id="execution-route"></div><div class="sub" id="execution-team"></div><div class="sub" id="execution-reason"></div><div class="sub" id="execution-environment"></div></details><div id="concurrency-note">主任务串行 · 后台计时可并行 · 页面操作依次执行</div></section>
            <details id="parallel-rules"><summary>并行与串行规则</summary><table><tbody><tr><td>推图 / 刷钱 / 练级 / 捕获</td><td>同一路线，只运行一个规划；同场自然产生多种收益</td></tr><tr><td>团体战 / 传说 / 塔 / 工厂</td><td>共享活动槽，按顺序挑战</td></tr><tr><td>寄养 / 孵蛋 / 地下探险计时</td><td>原生计时可与前台任务并行</td></tr><tr><td>成熟蛋领取</td><td>优先处理，可在普通战斗期间切页领取，完成后继续原任务</td></tr><tr><td>神奥后自动地下派遣</td><td>仅用空闲队员，保护主队、Buddy、培养对象和活动队伍；派遣后返回原任务</td></tr><tr><td>地下归队 / 免费进化</td><td>等待安全节点，依次切页并归还原任务</td></tr><tr><td>在线更新检查</td><td>独立网络请求，可同时检查</td></tr></tbody></table><div class="hint">需要选择的弹窗、独立活动、配队和消费确认仍先处理。后台派遣不移走前台任务成员，也不自动开晶洞；地下主任务单独管理派遣次数、配队和晶洞。世界首领护盾攻击机制上可与冒险共存；当前助手仍按独立流程提交，捕获阶段独占活动槽。</div></details>
            <details id="probability-info"><summary>异色概率与收集进度</summary><div class="sub" id="probability-wild"></div><div class="sub" id="probability-eggs"></div><div class="hint">概率表示遭遇或孵化机会，不代表下一次必出。图鉴加成按游戏完整图鉴判定，与助手的基础进化链进度分别计算。</div></details>
            <div class="tabs" role="group" aria-label="运行实况视图"><button data-tab="maps" aria-controls="view">目标与收益</button><button data-tab="queue" aria-controls="view">任务队列</button><button data-tab="dex" aria-controls="dex-panel">图鉴</button><button data-tab="weather" aria-controls="weather-panel">天气</button><button data-tab="logs" aria-controls="view">日志</button></div><div id="dex-panel" hidden></div><section id="weather-panel" aria-label="地区天气预报" hidden></section><div id="view" class="list"></div>
            </section>
            <section id="pane-settings" aria-label="设置" hidden>
            <h3>配队与自动化</h3>
            <label class="setting">冒险配队<select data-setting="autoTeam" data-boolean="true"><option value="true">智能自动配队</option><option value="false">用户手动配队</option></select></label>
            <label class="setting">特殊战配队<select data-setting="optimizeRaid" data-boolean="true"><option value="true">智能自动配队</option><option value="false">用户手动配队</option></select></label>
            <div class="hint" id="team-policy-hint"></div>
            <label class="setting"><span><input type="checkbox" data-setting="activeSwitch">助手主动换人</span></label><div class="hint" id="switch-hint"></div>
            <label class="setting"><span><input type="checkbox" data-setting="trainBuddy">练级 / 补练自动选择经验搭档 Buddy</span></label><div class="hint">搭档获得 1.3 倍经验。当前搭档仍需培养时会保留，更换会重置搭档的击倒计数。</div>
            <div class="checks"><label><input type="checkbox" data-setting="raids">每日团体战优先</label><label><input type="checkbox" data-setting="animations">继续 / 跳过过场</label><label><input type="checkbox" data-setting="gifts">自动选择赠送</label></div><div class="hint" id="raid-check"></div><div class="caption">后台服务 · 不替换当前任务</div><div class="checks background-toggles"><label title="优先领取成熟蛋，可在普通战斗期间处理，完成后返回原任务"><input type="checkbox" data-setting="autoEggs">自动收蛋</label><label title="进入神奥后仅用空闲队员自动组队派遣；保护主队、Buddy、培养对象与活动队员"><input type="checkbox" data-setting="autoUnderDispatch">神奥后自动地下派遣</label><label title="领取已经归队的地下队伍并返回原任务；后台不自动开晶洞"><input type="checkbox" data-setting="autoUnderCollect">自动领取地下归队</label></div><div class="hint">原生计时可并行，页面操作依次处理。地下派遣和归队领取可分别开关；手动队伍不足六人时暂缓后台领取，避免原生自动加人。</div>
            ${underStartControls}<div class="hint">地下主任务和后台派遣共用起点。归队领取后按最高纪录开放 25、50、75、100 层。跳过的楼层没有经验和掉落。</div>
            <label class="setting" id="prepare-toggle"><span><input type="checkbox" data-setting="autoPrepare">等级不足时先补练，再继续原任务</span></label>
            <div id="progress-candy-toggle"><label class="setting"><span><input type="checkbox" data-setting="progressCandy">主线补练允许使用 / 购买 EXP Candy</span></label><div class="hint" id="candy-hint">优先使用库存，逐份补购；与资源任务共用消费预算和金币保留额，预算不足改用普通练级。</div></div>
            <div class="hint" id="team-hint">冒险按当前地图配队，途中变更在下个治疗点生效；练级对象会保留。特殊战使用独立队伍。</div>
            <label class="setting"><span><input type="checkbox" data-setting="autoEvolve">自动执行免费等级进化</span></label><div class="hint" id="evolution-hint">培养规划考虑可达免费进化形态；实际进化并确认存档后再按新形态配队。道具与分支进化留待手动。</div>
            <div class="hint hidden" id="support-info" aria-live="polite"></div>
            <div class="row"><button id="start" class="primary">开始当前任务</button><button id="resume" class="primary hidden">立即恢复</button><button id="stop" class="danger" disabled>停止助手</button></div>
            <div class="queue-tools"><button id="add-job">＋ 加入队列</button><button id="start-queue" title="按顺序执行一个主任务；后台计时独立">串行队列 <span id="queue-count">0</span></button></div>
            <details><summary>资源预算 <span id="budget-summary"></span></summary><label class="setting">本次金币支出（0 禁止）<input data-setting="spendBudget" type="number" min="0"></label><label class="setting">每日支出上限（0 不另限）<input data-setting="dailySpendBudget" type="number" min="0"></label><label class="setting">至少保留金币<input data-setting="moneyReserve" type="number" min="0"></label><label class="setting">本次道具使用上限<input data-setting="useBudget" type="number" min="0" max="99999"></label><label class="setting"><span><input type="checkbox" data-setting="trainBuff">练级 / 补练自动吃经验树果</span></label><label class="setting"><span><input type="checkbox" data-setting="moneyBuff">刷钱自动吃金币树果</span></label><label class="setting"><span><input type="checkbox" data-setting="autoBuff">补图鉴 / 刷闪 / 游荡自动吃对应树果</span></label><div class="hint">仅使用库存树果；游荡使用停留果与捕获果，同类有效增益不重复吃，不自动补购。树果计入道具使用上限，用尽后继续普通练级或刷钱。</div><div class="hint">采购和寄养扩容共用金币预算；主动使用道具共用份数上限。队列累计计费，每项设置同时生效。普通战斗的游戏扣款不计入采购预算。</div></details>
            <details><summary>运行设置与自动停止</summary>
                <label class="setting">游戏速度<select data-setting="speed"><option value="1">×1</option><option value="4">×3（最高档）</option></select></label>
                <label class="setting">单图最短采样（分钟）<input data-setting="sampleMinutes" type="number" min="1" max="30"></label>
                <label class="setting">配队复查间隔（分钟）<input data-setting="teamMinutes" type="number" min="1" max="60"></label>
                <label class="setting">补练目标高于对手（级）<input data-setting="prepareMargin" type="number" min="0" max="15"></label>
                <label class="setting">等级落后超过几级补练<input data-setting="prepareGap" type="number" min="0" max="20"></label>
                <label class="setting">补练无经验停止（分钟）<input data-setting="prepareIdleMinutes" type="number" min="2" max="30"></label>
                <label class="setting">图鉴轮换（分钟）<input data-setting="rotateMinutes" type="number" min="2" max="120"></label>
                <label class="setting">团体战时限（分钟）<input data-setting="raidMinutes" type="number" min="5" max="720"></label>
                <label class="setting">地图失败上限<input data-setting="lossLimit" type="number" min="1" max="20"></label>
                <label class="setting">定时停止（分钟，0 不限）<input data-setting="stopMinutes" type="number" min="0" max="1440"></label>
                <label class="setting"><span><input type="checkbox" data-setting="resumeOnReload">刷新后自动恢复未停止的任务</span></label>
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
            <div class="actions"><button id="export">导出诊断</button><button id="reset">清除采样</button><button id="restore">恢复原循环</button><button id="export-profile">导出配置</button><button id="import-profile">导入配置</button><input id="profile-file" type="file" accept="application/json,.json" hidden></div><div class="hint update-source">更新来源：<a href="https://github.com/ZGRay00/Catch" target="_blank" rel="noopener noreferrer">ZGRay00/Catch</a> · 安装新版后刷新游戏</div><div class="hint warn" id="build"></div></section></div></section>`;
        document.body.appendChild(host);
        const query = sel => root.querySelector(sel); let tab = 'maps', drag = null, miniDraggedAt = 0,category='adventure',lastMode='',editingJob=null,settingsViewKey='',viewSignature=null;
        const commandbar=document.createElement('div');commandbar.className='commandbar';commandbar.append(query('#start').closest('.row'),query('.queue-tools'));query('.panel').appendChild(commandbar);
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
        const workspaces = [...root.querySelectorAll('[data-workspace]')];
        function selectWorkspace(name, refresh = true) {
            const active = workspaces.find(button => button.dataset.workspace === name) || workspaces[0];
            for (const button of workspaces) {
                const selected = button === active;
                button.setAttribute('aria-pressed', String(selected));
                query('#' + button.getAttribute('aria-controls')).hidden = !selected;
            }
            ui.workspace = active.dataset.workspace;
            if (refresh) { query('.content').scrollTop = 0; saveUI(); render(); place(); }
        }
        for (const button of workspaces) button.onclick = () => selectWorkspace(button.dataset.workspace);
        selectWorkspace(ui.workspace, false);
        const nurseryPanel=mountNurseryPanel(root,engine,{preferences:ui,save:saveUI,onChange:()=>render()});
        const dexPanel=mountDexPanel(root,render);
        const weatherPanel=mountWeatherPanel(query('#weather-panel'),ui,saveUI,render);
        query('#hunt-forecast').onclick=()=>{
            const selected=engine.settings[engine.settings.mode+'Weather'];
            if(selected?.length)weatherPanel.selectSkies(selected);
            selectActivityTab('weather');selectWorkspace('activity');
            query('[data-tab="weather"]').focus({preventScroll:true});
            query('[data-tab="weather"]').scrollIntoView({block:'nearest'});
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
                const box = host.getBoundingClientRect(); host.style.right = 'auto';
                host.style.left = `${Math.max(6, Math.min(position.x, innerWidth - box.width - 6))}px`;
                host.style.top = `${Math.max(6, Math.min(position.y, innerHeight - box.height - 6))}px`;
            } else if (ui.folded) { host.style.top = 'auto'; host.style.bottom = 'max(14px, env(safe-area-inset-bottom))'; }
            else host.style.top = innerWidth <= 450 || innerHeight <= 560 ? '12px' : '86px';
        }
        function fold(value) { const changed=!!ui.folded!==value;ui.folded = value; query('.panel').classList.toggle('hidden', value); query('.mini').classList.toggle('hidden', !value); saveUI();if(changed)render();place(); }
        function renderEnvironment(now){
            query('#execution-environment').textContent=backgroundKeepalive(now)?'保活扩展已启用，心跳有效，助手拥有后台运行许可。浏览器冻结时会保留任务并等待恢复。':pageHidden()?'当前标签在后台，等待回到游戏后继续。可在游戏页启用包内的保持激活扩展。':'当前游戏页面可操作。切走后要继续推图，可加载完整包里的 pokecatch-keep-active，并在游戏页开启。';
        }
        let serviceSignature=null;
        function renderExecution(s,now){
            const model=taskExecutionState(s,engine,now),states={unconfigured:'未配置',disabled:'自动关闭',timing:'计时中',ready:'待领取',waiting:'等待安全点',running:'处理中',blocked:'需处理'};
            query('#foreground-task').textContent=model.foreground.label;query('#foreground-detail').textContent=model.foreground.detail;query('#ui-owner').textContent='页面：'+model.uiOwner;query('#concurrency-note').textContent=model.summary;
            query('#execution-route').textContent=model.decision.route;query('#execution-team').textContent=model.decision.team;query('#execution-reason').textContent=model.decision.reason;
            if(query('#probability-info').open){
                const odds=shinyOdds(s||{}, {},now),eggs=s?.pension?.eggs||[],format=rate=>rate===1?'已保存异色标记':rate===0?'已保存普通色标记':`${(rate*100).toFixed(4)}%（约1/${Math.round(1/rate)}）`;
                query('#probability-wild').textContent=`野外：${format(odds.rate)} · ${odds.complete?'地区完整图鉴×2已生效':'地区完整图鉴加成未生效'}${odds.multiplier>1?` · 野外树果×${odds.multiplier}`:''}；地下化石按对应地区计算，当前地区示例：${format(shinyOdds(s||{},{kind:'underground'},now).rate)}`;
                const rates=[...new Set(eggs.map(egg=>shinyOdds(s||{},{kind:'egg',egg},now).rate))];
                query('#probability-eggs').textContent=`${rates.length?'现有蛋的理论档：'+rates.map(format).join('、'):'普通亲代1/512，新异色亲代1/16；旧sp:1为10%，靛莓果另乘2'}；确定结果与下闪条件见培育屋计数。`;
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
            revealHost(host);delete ui.panel;
            fold(false);render();place();return true;
        };
        restorePanel=helperAPI.show;
        for (const region of DATA.regions) {
            const group = document.createElement('optgroup'); group.label = region.name;
            for (const zone of DATA.zones.filter(z => z.reg === region.key)) { const option = document.createElement('option'); option.value = zone.id; option.textContent = `${zone.monName || MONS.get(zone.id)?.name || zone.id} · ${zone.name}`; group.appendChild(option); }
            query('[data-setting="legendId"]').appendChild(group);
        }
        function addOption(select,value,label){const el=document.createElement('option');el.value=String(value);el.textContent=label;select.appendChild(el);}
        for(const group of ROAMING_DATA.groups){const options=document.createElement('optgroup');options.label=DATA.regions.find(region=>region.key===group.reg)?.name||group.reg;for(const id of group.ids)addOption(options,id,`#${id} ${MONS.get(id)?.name||id}`);query('[data-setting="roamId"]').appendChild(options);}
        function huntChecks(container,suffix,entries){
            for(const [value,name] of entries){
                const label=document.createElement('label'),box=document.createElement('input');
                box.type='checkbox';box.value=value;box.dataset.hunt=suffix;
                box.onchange=()=>{
                    const key=engine.settings.mode+suffix,selected=new Set(engine.settings[key]);
                    if(box.checked)selected.add(value);else selected.delete(value);
                    changeSetting(key,[...selected]);
                };
                label.append(box,name);query(container).append(label);
            }
        }
        huntChecks('#hunt-regions','Regions',DATA.regions.map(r=>[r.key,r.name]));
        huntChecks('#hunt-weather','Weather',Object.entries(WEATHER_LABELS));
        function selectedSpecies(cfg){return cfg.mode==='shiny'?shinyGoals(cfg):cfg.dexSpecies;}
        function filterSpecies(){
            const cfg=engine.settings,term=query('#hunt-search').value.trim().toLowerCase().replace(/^#/,'');
            const picker=query('#hunt-picker'),selected=new Set(selectedSpecies(cfg));
            picker.replaceChildren();
            for(const mon of DATA.mons){
                if(selected.has(mon.id)||cfg.mode==='shiny'&&(!WILD_SHINY_IDS.has(mon.id)||mon.legend))continue;
                if(term&&!mon.name.includes(term)&&!mon.key?.includes(term)&&!String(mon.id).startsWith(term))continue;
                addOption(picker,mon.id,'#'+mon.id+' '+mon.name);
            }
            query('#hunt-add').disabled=!picker.value;
        }
        query('#hunt-search').oninput=filterSpecies;
        query('#hunt-add').onclick=()=>{
            const cfg=engine.settings,id=Number(query('#hunt-picker').value);
            if(id)changeSetting(cfg.mode+'Species',[...selectedSpecies(cfg),id]);
        };
        function syncHunt(){
            const cfg=engine.settings,mode=cfg.mode,field=query('#hunt-filters');
            field.hidden=!['dex','shiny'].includes(mode);query('#hunt-forecast').hidden=field.hidden;if(field.hidden)return;
            const regions=cfg[mode+'Regions'],weather=cfg[mode+'Weather'],species=selectedSpecies(cfg);
            query('#hunt-region-summary').textContent='搜寻地区 · '+(regions.map(id=>DATA.regions.find(r=>r.key===id).name).join('、')||'沿用规划范围');
            query('#hunt-weather-summary').textContent='地图天气 · '+(weather.map(key=>WEATHER_LABELS[key]).join('、')||'不限');
            query('#hunt-species-summary').textContent='目标物种 · '+(species.length===1?MONS.get(species[0]).name:species.length?species.length+' 种':'全部缺失进化链');
            query('#hunt-help').textContent=mode==='dex'?'指定物种按该形态的捕获记录完成；留空按基础形态补齐进化链。':'每捕获一种目标异色，助手就继续寻找剩余目标。';
            for(const box of field.querySelectorAll('[data-hunt]'))box.checked=cfg[mode+box.dataset.hunt].includes(box.value);
            const wrap=query('#hunt-selected');wrap.replaceChildren();
            for(const id of species){
                const button=document.createElement('button');button.type='button';button.className='chip';
                button.textContent=MONS.get(id).name+' ×';button.setAttribute('aria-label','移除'+MONS.get(id).name);
                button.disabled=mode==='shiny'&&species.length===1;
                button.onclick=()=>changeSetting(mode+'Species',species.filter(value=>value!==id));wrap.append(button);
            }
            filterSpecies();
        }
        let eggRegionKey = '';
        function updateBreedingOptions(s) {
            const target = engine.settings.breedId;
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
                if (item.id !== engine.settings.itemId && filter && !`${item.name} ${item.id}`.toLowerCase().includes(filter)) continue;
                const option = document.createElement('option'); option.value = item.id; option.textContent = item.name + (item.sources.some(s => s.repeat) ? '' : ' · 有限来源'); select.appendChild(option);
            }
            select.value = engine.settings.itemId;
        }
        const memberKeys=new Map();
        function updateMemberOptions(field,members,missingLabel){
            const selected=engine.settings[field];
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
            for(const m of members)option(m.uid,(MONS.get(m.id)?.name||m.id)+' · Lv.'+m.level+(m.shiny?' ✦':''));
            if(!found)option(selected,missingLabel);
            for(const extra of options.slice(index))extra.remove();
            if(added.childNodes.length)select.append(added);
            if(select.value!==selected)select.value=selected;
        }
        function partyOptions(s,both=false) {
            if(both||engine.settings.mode==='train')updateMemberOptions('trainUid',partyMons(s),'原目标已离队 · 请选择');
            if(both||engine.settings.mode==='resource')updateMemberOptions('useUid',s.mons||[],'原目标已离开PC · 请选择');
        }
        function showCategory(value){category=value;root.querySelectorAll('[data-category]').forEach(el=>el.classList.toggle('on',el.dataset.category===value));root.querySelectorAll('[data-group]').forEach(el=>el.classList.toggle('hidden',el.dataset.group!==value));}
        function syncSettings() {
            syncHunt();
            settingsViewKey=JSON.stringify(engine.settings);
            if(engine.state?.adv){
                if(['train','resource'].includes(engine.settings.mode))partyOptions(engine.state,true);
                if(engine.settings.mode==='breed')updateBreedingOptions(engine.state);
            }
            for (const input of root.querySelectorAll('[data-setting]')) {
                const value = engine.settings[input.dataset.setting];
                if (input.type === 'checkbox') input.checked = value; else input.value = String(value);
                input.disabled = engine.running||!!engine.suspended;
            }
            root.querySelectorAll('[data-mode]').forEach(button => { const on = button.dataset.mode === engine.settings.mode; button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); });
            if(lastMode!==engine.settings.mode){lastMode=engine.settings.mode;showCategory(query(`[data-mode="${lastMode}"]`)?.dataset.group||'adventure');}
            root.querySelectorAll('[data-fields]').forEach(el => el.classList.toggle('hidden', el.dataset.fields !== engine.settings.mode));
            root.querySelectorAll('[data-under-manual]').forEach(el=>el.classList.toggle('hidden',engine.settings.underAutoStart));
            query('#scope-field').classList.toggle('hidden', huntRegions(engine.settings).length>0||['legend','roam'].includes(engine.settings.mode)||FLOW_MODES.has(engine.settings.mode));
            const mode=engine.settings.mode,independent=FLOW_MODES.has(mode)||mode==='legend';
            query('[data-setting="autoTeam"]').closest('label').classList.remove('hidden');
            const raidMode=!(independent||mode==='roam');
            query('[data-setting="raids"]').closest('label').classList.toggle('hidden',!raidMode);
            query('#raid-check').classList.toggle('hidden',!raidMode||!engine.settings.raids);
            query('[data-setting="gifts"]').closest('label').classList.toggle('hidden',independent);
            query('[data-setting="optimizeRaid"]').closest('label').classList.toggle('hidden',['breed','resource','tower'].includes(mode));
            query('#team-policy-hint').textContent=mode==='tower'?'对战塔由游戏从收藏中自动选人；这里不提供原生不存在的手动塔队选择。':mode==='world'?'世界首领攻击由游戏选择成员；捕获队伍按特殊战配队选项执行。':independent?engine.settings.optimizeRaid?'特殊战按目标自动配置独立队伍。':'使用你在游戏内设置的专属队伍；未配置时等待你选择，不自动替换成员。':engine.settings.autoTeam?'冒险按目标自动选人、排序与补练；特殊战可单独设置。':'保留当前冒险成员和出场顺序，不自动加人或换人；补练也使用你选择的队伍。';
            query('#team-hint').classList.toggle('hidden',independent);
            query('#evolution-hint').textContent=engine.settings.autoEvolve?'免费等级进化已开启：培养考虑后续形态，实际进化确认后重新配队；道具、分支和升阶锁定个体不自动处理。':'免费进化已关闭：按当前形态评估队伍，保留手动进化。';
            query('#prepare-toggle').classList.toggle('hidden',['breed','resource','train'].includes(mode));
            query('#progress-candy-toggle').classList.toggle('hidden',mode!=='progress');
            query('#candy-hint').textContent=engine.settings.spendBudget>0?'优先使用库存，逐份补购；达到等级目标后继续主线，预算不足改用普通练级。':'金币支出预算为 0：不会购买。已有糖果仍按使用上限消耗；如需采购，请展开“资源预算”设置金额和金币保留额。';
        }
        const editableControls=root.querySelectorAll('[data-setting], [data-mode], #item-search');
        function buddySummary(s,preparation){
            const current=s.buddy?.uid,mons=s.mons||[],name=uid=>MONS.get(mons.find(m=>m.uid===uid)?.id)?.name;
            const label='Buddy：'+(name(current)||'未设置');
            if(!engine.settings.trainBuddy)return label+'（自动选择已关）';
            const next=selectTrainingBuddy(s,engine.settings,preparation,engine.trainProtected);
            if(!next||next===current)return label;
            const target=name(next)||'待确认成员';
            if(engine.manual||engine.suspended)return label+' · 恢复后评估候选 '+target;
            return label+(engine.automation.buddyTask?.uid===next?' · 正在切换为':' · 待切换为')+target;
        }
        let lastLockState=null,lastPaint=0;
        function render() {
            lastPaint=performance.now();
            if(!host.isConnected&&document.body){document.body.appendChild(host);place();}
            let s; try { s = engine.read(); if (s?.adv && accountId(s) !== engine.account && !engine.running && !engine.suspended) {
                engine.loadAccount(s); editingJob = null; memberKeys.clear(); viewSignature = null;
                query('#add-job').textContent = '＋ 加入队列'; itemOptions(); syncSettings();
            } } catch (err) { engine.status = err.message; }
            if(s?.adv&&!engine.running&&!engine.suspended&&engine.checkpoint)engine.tryResume();
            const now=Date.now(),wait=engine.manualWaitState(s||engine.state,now),resumable=!!engine.manual||!!engine.suspended,locked=engine.running||!!engine.suspended;
            if(wait?.reason==='ready'&&engine.running&&!pageHidden()&&!engine.timer)engine.schedule(50);
            // Keepalive permits background game actions, but its invisible panel does not need drawing.
            if(document.hidden||ui.folded||ui.workspace!=='activity'||tab!=='maps'||!s?.adv)engine.releaseRankingView();
            if(ui.workspace==='activity'&&!ui.folded)renderEnvironment(now);
            if(document.hidden)return;
            query('#status').textContent = engine.suspended?engine.status:wait?.status||engine.status; query('.status').classList.toggle('running', engine.running); query('.mini').classList.toggle('running', engine.running);
            query('.status').classList.toggle('manual', resumable); query('.mini').classList.toggle('manual', resumable);
            const queueStep=engine.queueRunning&&engine.running?`${engine.queueIndex+1}/${engine.queue.length}`:'';
            query('#run-state').textContent = engine.suspended?'PAUSED · 页面已挂起':engine.manual ? 'PAUSED · 手动控制' : engine.running ? queueStep?`队列 ${queueStep} · 运行中`:'RUNNING · 运行中' : 'READY · 已停止';
            query('#mini-state').textContent = wait ? `${engine.suspended?'挂起':'手动'} · ${wait.mini}` : engine.running ? (engine.preparation?'补练 → ':'')+MODE_NAMES[engine.settings.mode]+(queueStep?' '+queueStep:'') : '待命';
            if(ui.folded){
                const pendingCount=Number(readyBackgroundEggs(s,now).length>0)+Number(!!s?.under?.slots?.length&&undergroundStatus(s,now).ready.length>0);
                if(pendingCount)query('#mini-state').textContent+=` · 待办 ${pendingCount}`;
            }else if(ui.workspace==='activity')renderExecution(s,now);
            const nursery=nurseryPanel.render(s,now);if(nursery?.counts.shiny)query('#mini-state').textContent+=` · ✦蛋${nursery.counts.shiny}`;
            if(settingsViewKey!==JSON.stringify(engine.settings))syncSettings();
            if(ui.folded)return;
            query('#switch-hint').textContent=!s?'进入游戏后显示换人状态。':s.autoSwitch!==false?'游戏自动换人已开启，由游戏选择出战者。':!engine.settings.activeSwitch?'游戏和助手的自动换人均已关闭。':!engine.settings.autoTeam?'手动配队中，保留你的队首顺序。':'助手接管普通冒险单打。只剩一个对手且换人能明显改善战况时点击替补，游戏会将其移到队首。';
            query('#resume').classList.toggle('hidden', !resumable); query('#start').classList.toggle('hidden', resumable);
            query('#resume').textContent=engine.manual&&s?.adv?.event?.raid?'接管当前团体战':engine.suspended?'继续原任务':'立即恢复';
            query('#action').textContent = wait?.detail||(engine.nextWake>now?`预计等待 ${Math.max(1,Math.ceil((engine.nextWake-now)/60000))} 分钟 · ${engine.action||'按游戏时间结算'}`:engine.action || (engine.running?'助手已接管，按当前任务执行':'选择任务与目标后开始'));
            query('#start').disabled = locked; query('#stop').disabled = !locked;
            query('#start').textContent = s?.adv?.event?.raid ? '接管当前团体战' : s?.adv?.zone ? '接管当前传说战' : '开始当前任务';
            query('#queue-count').textContent=engine.queue.filter(job=>job.status!=='done').length;
            query('#add-job').disabled=locked;query('#start-queue').disabled=locked||!engine.queue.some(job=>job.status!=='done');
            query('#budget-summary').textContent=`已支出 ${engine.budget.spent.toLocaleString()} ₽ · 已用 ${engine.budget.used} 份`;
            query('#reset').disabled = locked; query('#restore').disabled = locked || !engine.oldLoops;
            query('#import-profile').disabled=locked||!engine.account;
            if(locked!==lastLockState){
                editableControls.forEach(input=>input.disabled=locked);
                query('#hunt-filters').disabled=locked;
                lastLockState=locked;
            }
            if (!s?.adv) {
                query('#support-info').classList.add('hidden');query('#dex-panel').hidden=true;query('#weather-panel').hidden=true;
                const view=query('#view');view.hidden=false;viewSignature=null;view.textContent='进入游戏并载入存档后可查看任务和图鉴。';return;
            }
            const taskPage=ui.workspace==='tasks';
            if(ui.workspace==='settings'&&engine.settings.raids){
                const note=engine.raidCheckNote||(!s.adv.badges?.includes('Maître')?'通关关都联盟后开放':'可在日常冒险和主线补练中插入异色团体战');
                const retry=engine.running&&Number.isFinite(engine.nextRaid)&&engine.nextRaid>now?new Date(engine.nextRaid).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'';
                const pause=engine.manual||engine.suspended?' · 恢复助手后继续':'';
                query('#raid-check').textContent=note+(retry?' · 下次检查 '+retry:'')+pause;
            }
            if(taskPage&&['resource','train'].includes(engine.settings.mode))partyOptions(s);
            if(taskPage&&engine.settings.mode==='breed')updateBreedingOptions(s);
            const preparation=engine.preparation;query('#prepare-info').classList.toggle('hidden',!preparation||!engine.running);
            if(preparation){
                query('#prepare-title').textContent=engine.manual?'补练已暂停':'↑ 正在补练';
                const levels=preparation.targets.map(target=>({...target,level:s.mons.find(m=>m.uid===target.uid)?.level||target.level}));
                query('#prepare-target').textContent=`完成后返回：${preparation.context.label}${preparation.capLimited?' · 目标受当前等级上限限制':''}`;
                query('#prepare-route').textContent=preparation.route?`练级地图：${preparation.route.name}${engine.manual?' · 恢复后重新评估':preparation.route.league?' · 联盟试刷，按完整轮次实测校正':''}`:'练级地图：正在评估可用路线';
                query('#prepare-levels').textContent=levels.map(target=>preparationEvolutionLabel(s,target,engine,now)).join('、')||'更新原生战斗阵容';
                const adaptive=['map','progress'].includes(preparation.context.kind)&&engine.settings.autoTeam,assessment=preparation.assessment;
                const fit=assessment?.fit,remaining=levels.reduce((total,target)=>{const mon=s.mons.find(mon=>mon.uid===target.uid),gap=mon&&candyXpGap(s,mon,target.goal);return gap==null?null:total==null?null:total+gap;},0);
                query('#prepare-assessment').textContent=adaptive?[assessment?.reason||'按实际战力复查，达标可提前返回原任务',fit?`保守预计 ${fit.turns.toFixed(1)} 回合/对手`:'',remaining>0?`当前培养目标剩余 ${Math.round(remaining).toLocaleString()} EXP`:''].filter(Boolean).join(' · '):'按所选阵容完成当前补练等级目标';
                query('#prepare-bar').style.width=`${levels.length?levels.reduce((n,m)=>n+Math.min(1,m.level/m.goal),0)/levels.length*100:100}%`;
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
            query('#money-label').textContent=net===null?'等待完整钱包':engine.walletScope==='rebased'?'重计后金币净增':'本次金币净增';
            const seconds = engine.started ? Math.max(0, Math.floor(((engine.running ? Date.now() : engine.stoppedAt || Date.now()) - engine.started) / 1000)) : 0;
            query('#time-value').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
            const shinyRoutes=mode==='shiny'&&(taskPage||ui.workspace==='activity'&&tab==='maps')?shinyRanking(s,settings,engine.cooldowns,now):null;
            let primary = `${status.complete}/${status.roots.length}`, primaryLabel = settings.dexSpecies?.length&&mode==='dex'?'目标已捕获':'进化链完成', goalLabel = settings.dexSpecies?.length&&mode==='dex'?'指定物种收集':'基础形态收集', goalValue = `${status.missing.length} 条待完成`, percent = status.complete / Math.max(1,status.roots.length) * 100;
            let hint = mode === 'money' ? '按整轮金币净增实测排名，轮换采样后优先高收益地图；未测地图显示估算。' : mode === 'progress' ? '关闭章节循环，自动适配队伍并推进至目标章节；开启跨地区开局后会按游戏规则分开管理新地区的钱包和队伍。' : '基础形态曾捕获即完成整条进化链；幼年形态不另设目标。';
            if (mode === 'dex' && settings.dexSpecies?.length) {
                goalValue = `${status.missing.length} 只待捕获`;
                hint = '按所选物种各自的捕获记录计数。助手会在符合地区和地图天气的路线中寻找剩余目标。';
            }
            if (mode === 'legend') {
                const p = legendProgress(s, settings);
                primary = settings.legendTier ? `${p.tier}/${settings.legendTier}` : p.done ? '已完成' : '待捕获'; primaryLabel = settings.legendTier ? '精英阶级' : '普通捕获'; goalLabel = p.zone.monName || p.zone.name; goalValue = settings.legendTier ? `推进至 ${settings.legendTier} 阶` : '全部轮换形态'; percent = p.done ? 100 : settings.legendTier ? p.tier / settings.legendTier * 100 : 0;
                hint = p.roaming&&!settings.legendTier?'该目标普通捕获通过在线游荡追踪完成；需要对应地区冠军，按实际驻留地图搜寻。可切换“游荡捕获”设置搜寻时限。此模式不插入每日团体战。':`${p.zone.condition || '按游戏中的开放条件挑战。'} ${settings.legendTier?'精英战逐阶推进。':'剩余形态：'+p.missingForms.map(id=>MONS.get(id)?.name||id).join('、')+'。'}此模式不插入每日团体战。`;
            } else if(mode==='roam'){
                const p=roamingProgress(s,settings,now),location=CHAPTERS.get(p.location?.ch);
                primary=p.captured?'已捕获':p.unlocked?'追踪中':'未解锁';primaryLabel='游荡目标';goalLabel=MONS.get(settings.roamId)?.name||settings.roamId;goalValue=location?`${DATA.regions.find(region=>region.key===location.reg)?.name||location.reg} · ${location.name}`:'等待原生驻留地点';percent=p.captured?100:0;
                hint='按目标实际驻留章节追踪，先补练再搜寻，捕获登记确认后完成；不会把一次遇到或逃跑计为捕获。真正离线不产生新游荡遭遇，本任务不插入团体战。停止助手不暂停游戏本体，原生已发生的遭遇仍按游戏规则用球。';
            } else if (mode === 'item') {
                const item = ITEMS.get(settings.itemId), n = engine.started && engine.sessionItemId === settings.itemId ? Math.max(0,itemCounter(s,settings.itemId)-engine.startItems) : 0;
                primary = `${n}/${settings.itemQuantity}`; primaryLabel = '本次道具获取'; goalLabel = item.name; goalValue = `背包 ${ownedItems(s,item.id)} · 本次 +${n}`; percent = n / settings.itemQuantity * 100;
                if(taskPage)hint = `${itemRanking(s,settings).length} 个章节可规划。${item.sources.some(source => source.repeat) ? '按目标掉落效率选图，显示平滑估计与整轮实测。' : '此道具为有限来源，已领取或已转金币的地点会排除。'} 获取数量按本次新增统计；来源条件见游戏。`;
            } else if (mode === 'train') {
                const p = trainingStatus(s, settings,engine.running?engine.trainProtected:null), xp = experienceTotal(s,engine.trainProtected || s.team), gained = engine.started && engine.trainingSelection===settings.trainUid && xp != null && engine.startTrainingXp != null ? Math.max(0,xp-engine.startTrainingXp) : 0;
                primary = gained.toLocaleString(); primaryLabel = settings.trainUid==='team'?'本次全队 EXP':'练级对象 EXP'; goalLabel = `目标 Lv.${settings.trainLevel} · 上限 ${p.cap || '—'}`; goalValue = `${p.targets.filter(m=>m.level>=settings.trainLevel).length}/${p.targets.length} 达标`; percent = p.targets.length ? p.targets.reduce((n,m)=>n+Math.min(1,m.level/settings.trainLevel),0)/p.targets.length*100 : 0;
                hint = p.missing ? '所选目标不在当前冒险队伍中，请重新选择。' : `当前 ${p.targets.map(m=>`${MONS.get(m.id)?.name || m.id} Lv.${m.level}`).join('、')}。按全队经验/分钟选图，达到目标或当前等级上限时停止；不使用糖果。`;
            } else if (mode === 'money') { goalLabel = '金币目标'; goalValue = settings.moneyTarget ? `${s.money.toLocaleString()} / ${settings.moneyTarget.toLocaleString()}` : '持续刷钱'; percent = settings.moneyTarget ? s.money/settings.moneyTarget*100 : 0; }
            else if(mode==='shiny'){const goals=shinyGoals(settings),left=missingShinies(s,settings).length;primary=(goals.length-left)+'/'+goals.length;primaryLabel='目标异色';goalLabel=goals.slice(0,3).map(id=>MONS.get(id).name).join('、')+(goals.length>3?' 等':'');goalValue=`${shinyRoutes?.length||0} 张可刷地图`;percent=(goals.length-left)/goals.length*100;hint='按当前野生遭遇表、轮换与特殊现象选图。运行实况显示各地图每轮预计遇到目标物种的次数，捕获目标异色后完成。';}
            else if(mode==='breed'){const flow=engine.automation.state,plan=pensionPlan(s,settings.breedId);primary=`${flow.hatched||0}/${settings.breedShiny?'✦':settings.breedGoal}`;primaryLabel='目标孵化';goalLabel=MONS.get(settings.breedId)?.name;goalValue=`寄养 ${s.pension?.mons?.length||0} · 蛋 ${s.pension?.eggs?.length||0}`;percent=settings.breedShiny?(shinyOwned(s,settings.breedId)?100:0):(flow.hatched||0)/settings.breedGoal*100;hint=(plan.missing?plan.missing+'。':'优先异色亲本，配置百变怪和对应亲本。')+'游戏自动产蛋并放入孵化器；成熟后点击孵化，重复个体仍计入本次目标。蛋成熟后自动孵化，异色可能需要多轮。';}
            else if(mode==='underground'){const u=undergroundStatus(s,now);primary=`${engine.automation.state.underDone||0}/${settings.underRuns}`;primaryLabel='确认归队领取';goalLabel=`今日 ${u.sent}/${u.perDay} 次 · 可用 ${u.left}`;goalValue=`可领 ${u.ready.length} · 派遣中 ${u.running.length} · 槽位 ${u.slots.length}/${u.capacity}`;percent=(engine.automation.state.underDone||0)/settings.underRuns*100;hint=`下次从第 ${undergroundStartFloor(settings,u.startFloors)} 层出发 · 历史最高 ${u.best} 层。按派遣位的主题配队，领取归队奖励后更新纪录。`;}
            else if(mode==='tower'){const p=towerProgress(s,now),reached=Math.max(p.best,p.cleared);primary=`${reached}/${settings.towerFloor}`;primaryLabel='本周已过楼层';goalLabel='已结束尝试';goalValue=`${engine.automation.state.towerWeek===p.week?engine.automation.state.towerAttempts||0:0}/${settings.towerRuns}`;percent=reached/settings.towerFloor*100;hint='按原生收藏排序、同种族限制和休息等级核对实际前六名，只为真正会上场的成员补练。暂停场次继续，不计失败；周记录与尝试次数按 UTC 周一重置，奖励结算后再结束任务。';}
            else if(mode==='candy'){const run=s.candy?.run,flow=engine.automation.state,cleared=Math.max(0,run?run.floor-1:flow.candyResult?.floor||0);primary=settings.candyFloor?`${cleared}/${Math.ceil(settings.candyFloor/5)*5}`:String(cleared);primaryLabel='本场已过楼层';goalLabel=`完成场次 ${flow.candyDone||0}/${settings.candyRuns}`;goalValue=run?`今日${DATA.types[run.type]?.fr||run.type}主题 · 已获糖果保留`:'每日一次 · 巴黎时间刷新';percent=(flow.candyDone||0)/settings.candyRuns*100;hint='按今日主题、实际招式与耐久配置六人专属队伍；需要时先补练再入场，入场后保留克隆阵容。目标层向上取整至五层营地，0 表示尽力挑战；不购买跳层，失败仍按真实结算计一局。25枚神奇糖果日上限后仍可获得经验糖果。';}
            else if(mode==='elite'){const reg=settings.eliteRegion==='current'?currentRegion(s):settings.eliteRegion,best=s.eliteLeague?.[reg]?.t||0;primary=`${best}/${settings.eliteTier}`;primaryLabel='精英联盟阶级';goalLabel=DATA.regions.find(r=>r.key===reg)?.name;goalValue='逐阶挑战并领取宝石';percent=best/settings.eliteTier*100;hint='按全联盟配置专属队伍，只挑战未完成的下一阶；通关后选择第一种可领取宝石。原生条件不足时等待，不重复领取已完成阶级。';}
            else if(mode==='world'){primary=`${engine.automation.state.worldDone||0}/${settings.worldActions}`;primaryLabel='本次首领攻击';goalLabel='世界首领';goalValue=settings.worldCapture?'攻击 → 等待 → 捕获':'攻击目标完成即结束';percent=(engine.automation.state.worldDone||0)/settings.worldActions*100;hint='使用原生推荐的可攻击成员，每日次数和登录条件由服务器校验。捕获阶段可能需要等待；没有开放时不会反复提交攻击。';}
            else if(mode==='resource'){const flow=engine.automation.state,id=settings.resourceItem,n=settings.resourceAction==='buy'?purchasedQuantity(s,id,flow):Math.max(0,(s.stats?.itemOut?.[id]||0)-(flow.resourceOut??s.stats?.itemOut?.[id]??0));primary=`${n}/${settings.resourceQuantity}`;primaryLabel=settings.resourceAction==='buy'?'采购份数':'使用份数';goalLabel=ITEMS.get(id)?.name||id;goalValue=`背包 ${s.items?.[id]||0}`;percent=n/settings.resourceQuantity*100;hint='每次只购买或使用一份，逐次核对价格、到账和预算。只购买支持当前金币商店的道具；树果用于全局增益，糖果或进化道具用于所选成员。';}
            else if(mode==='progress'){primary=`${Math.min(settings.progressUntil,s.adv.unlocked)}/${settings.progressUntil}`;primaryLabel='主线章节';goalLabel=CHAPTERS.get(settings.progressUntil)?.name;goalValue=`当前 ${CHAPTERS.get(s.adv.chapter)?.name||s.adv.chapter}`;percent=s.adv.unlocked/Math.max(1,settings.progressUntil)*100;}
            query('#dex-value').textContent = primary; query('#primary-label').textContent = primaryLabel; query('#target-hint').textContent = hint;
            query('#goal-label').textContent = goalLabel; query('#goal-value').textContent = goalValue;
            percent = Math.max(0,Math.min(100,percent || 0)); query('#task-progress i').style.width = `${percent}%`; query('#task-progress').setAttribute('aria-valuenow', String(Math.round(percent)));
            query('#build').textContent = window.BUILD && window.BUILD !== DATA.build ? `游戏构建 ${window.BUILD} 与数据快照 ${DATA.build} 不同，预估可能需要更新。` : '';
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
                const difference=(to.rate/from.rate-1)*100;
                return Math.abs(difference)<.05?'几乎持平':(difference>0?'高 ':'低 ')+Math.abs(difference).toFixed(1)+'%';
            }
            const comparisons=[];
            if(previous?.rate>0)comparisons.push(current.name+'比上一图'+previous.name+'的每分钟经验'+relativeRate(previous,current)+'（常规换图需提升超过 '+trainingSwitchMargin(previous,current)+'%）');
            if(next&&current.rate>0)comparisons.push('下一图'+next.name+'比当前图'+relativeRate(current,next)+'（常规换图需提升超过 '+trainingSwitchMargin(current,next)+'%）');
            return comparisons.length?basis+'，'+comparisons.join('。')+'。':basis+'各图的每分钟经验。';
        }
        function renderView(s, status, shinyRoutes) {
            query('#dex-panel').hidden=tab!=='dex';query('#weather-panel').hidden=tab!=='weather';query('#view').hidden=tab==='dex'||tab==='weather';
            if(tab==='weather'){weatherPanel.render(s,Date.now());return;}
            if(tab==='dex'){dexPanel.renderDex(s,status,engine.settings,Date.now());return;}
            const prep=tab==='maps'&&['train','travel'].includes(engine.preparation?.phase)&&engine.preparation.context?.reg?engine.preparation:null;
            const mode=prep?'train':engine.settings.mode;
            const moneyAfterDex=!status.missing.length&&engine.settings.afterDex==='money'&&!engine.queueRunning;
            if(tab==='maps'&&mode==='dex'&&!moneyAfterDex){
                engine.releaseRankingView();
                viewSignature=null;dexPanel.renderRoutes(query('#view'),s,status,engine);return;
            }
            let rows,signature=null;
            if(FLOW_MODES.has(mode)||['legend','roam','shiny','item'].includes(mode))engine.releaseRankingView();
            if(tab==='queue')signature=JSON.stringify([tab,engine.running,!!engine.suspended,!!engine.manual,engine.queueRunning,engine.queueIndex,engine.queue.map(job=>[job.id,job.title,job.status,job.result])]);
            else if(tab==='logs')signature=JSON.stringify([tab,engine.logs]);
            else if(FLOW_MODES.has(mode))signature='flow:'+mode;
            else if(mode==='shiny')signature=JSON.stringify([mode,shinyRoutes.map(row=>[row.key,row.name,row.expected])]);
            else if(!['legend','roam'].includes(mode)){
                const now=Date.now();
                if(prep){
                    const request=preparationRankingRequest(s,engine.settings,prep,engine.metrics,now);
                    rows=engine.evaluateRouteRanking(request,prep.avoid||{},now,true);
                }else rows=mode==='item'?itemRanking(s,engine.settings,engine.metrics,engine.cooldowns,now)
                    :engine.rankedYieldRoutes(s,mode==='train'?'xp':'money',engine.cooldowns,now,true);
                if(rows===null){
                    const pending='pending:'+mode;
                    if(viewSignature!==pending){
                        const message=document.createElement('div');message.className='empty';message.setAttribute('role','status');
                        message.textContent=mode==='train'?'正在比较各地图的练级效率…':'正在比较各地图的金币收益…';
                        query('#view').replaceChildren(message);viewSignature=pending;
                    }
                    return;
                }
                signature=JSON.stringify([mode,!!prep,prep?prep.route?.key:engine.target?.key,mode==='train'&&s.adv.chapter,rows.map(row=>[row.key,row.name,row.rate,row.measured,row.actualRate,row.samples,row.leagueTraining?.partial])]);
            }
            if(signature!==null&&signature===viewSignature)return;viewSignature=signature;
            const view = query('#view'), scroll = view.scrollTop; view.replaceChildren();
            if (tab === 'maps') {
                if (mode === 'legend') {
                    const p = legendProgress(s,engine.settings), el = document.createElement('div'); el.className = 'empty';
                    el.textContent = `${p.zone.monName || p.zone.name} · ${DATA.regions.find(r=>r.key===p.zone.reg)?.name} / ${p.zone.name}。${p.done ? '所选目标已完成。' : `当前精英 ${p.tier} 阶。${p.zone.condition || '请查看游戏开放条件。'}`}`; view.appendChild(el);
                } else if(mode==='roam'){
                    const p=roamingProgress(s,engine.settings,Date.now()),el=document.createElement('div');el.className='empty';
                    const map=CHAPTERS.get(p.location?.ch);el.textContent=`${MONS.get(engine.settings.roamId)?.name||engine.settings.roamId} · ${p.captured?'目标已捕获':p.unlocked?'已满足地区冠军条件':'需先获得对应地区冠军徽章'}。${map?'当前驻留：'+map.name+'。':'暂无有效驻留记录，按原生踪迹查找。'}普通色目标，基础捕获率 4%；捕获果加成与大师球按游戏原生规则处理。`;view.appendChild(el);
                } else if(FLOW_MODES.has(mode)){
                    const steps={breed:['安排百变怪与目标亲本','游戏自动产蛋、进入孵化器','等待成熟并孵化至目标'],underground:['按主题配队并派遣','等待原生远征返回','领取奖励、按设置开启晶洞'],tower:['核对本周进度与实际原生阵容','确认启动后记录已过楼层','达标原生退出、结算后切换任务'],candy:['读取今日主题并配置独立阵容','补练达标后开始今日免费场次','到目标营地退出或尽力挑战，核对真实结算'],elite:['配置整座联盟的专属队伍','逐阶挑战未完成阶级','选择宝石并领取奖励'],world:['进入本期活动并提交攻击','等待护盾击破与捕获阶段','配置捕获队伍并捕获首领'],resource:['核对目标、余额与预算','逐份购买或使用','核对新增与消耗数量']}[mode];
                    const list=document.createElement('div');list.className='flow-list';for(const [i,label]of steps.entries()){const row=document.createElement('div');row.className='step';const n=document.createElement('b');n.textContent=String(i+1).padStart(2,'0');row.append(n,label);list.appendChild(row);}view.appendChild(list);
                } else if(mode==='shiny'){
                    const table=document.createElement('table');table.innerHTML='<thead><tr><th>地图</th><th>预计目标遭遇 / 轮</th></tr></thead><tbody></tbody>';
                    for(const row of shinyRoutes){const tr=document.createElement('tr');textCell(tr,row.name);textCell(tr,row.expected.toLocaleString('zh-CN',{maximumSignificantDigits:3}));table.tBodies[0].appendChild(tr);}view.appendChild(table);if(!shinyRoutes.length)view.append('当前范围、时段和地图退避条件下暂无可用路线。');
                } else {
                    if(mode==='train'&&rows.length){
                        const note=document.createElement('div');note.className='hint';note.textContent=trainingComparison(rows,s.adv.chapter,!!prep);view.appendChild(note);
                    }
                    const table = document.createElement('table');
                    table.innerHTML = `<thead><tr><th>地图</th><th>${mode === 'item' ? '平滑 / 实测' : '来源 / 整轮'}</th><th>${mode === 'item' ? '个/分钟' : mode === 'train' ? 'EXP/分钟' : '₽/分钟'}</th></tr></thead><tbody></tbody>`;
                    const selectedKey=prep?prep.route?.key:engine.target?.key;
                    for(const row of rows){
                        const tr=document.createElement('tr'),selected=selectedKey===row.key;
                        tr.classList.toggle('active',selected);textCell(tr,(selected?'▶ ':'')+row.name);
                        let source='估算';
                        if(mode==='item'&&row.measured)source='平滑 · 实测 '+row.actualRate.toFixed(2);
                        else if(row.measured)source=(mode==='train'&&row.samples<2?'估算＋实测':'实测')+' / '+Math.floor(row.samples);
                        else if(mode==='train'&&row.leagueTraining?.partial)source='前段估算 / 0';
                        textCell(tr,source);textCell(tr,mode==='item'?row.rate.toFixed(2):Math.round(row.rate).toLocaleString());table.tBodies[0].appendChild(tr);
                    }
                    view.appendChild(table); if (!rows.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '当前范围没有可规划地图，请检查解锁、来源条件或目标。'; view.appendChild(empty); }
                }
            } else if(tab==='queue'){
                const note=document.createElement('div');note.className='queue-note';note.textContent='主任务按顺序执行；已配置的寄养、孵蛋和地下计时可并行，后台领取不占队列项。';view.appendChild(note);
                for(const [index,job]of engine.queue.entries()){
                    const active=engine.running&&engine.queueRunning&&index===engine.queueIndex;
                    const el=document.createElement('div');el.className='job'+(active?' active':'');
                    const head=document.createElement('div');head.className='job-head';const title=document.createElement('span');title.textContent=`${index+1}. ${job.title}`;const state=document.createElement('span');state.className='job-state';state.textContent=({pending:'等待',running:active?engine.manual?'手动暂停':'运行中':'已暂停',done:'已完成',failed:'需处理'})[job.status];head.append(title,state);el.appendChild(head);
                    if(job.result){const result=document.createElement('div');result.className='sub';result.textContent=job.result;el.appendChild(result);}
                    const actions=document.createElement('div');actions.className='job-actions';for(const[action,label]of [['up','↑'],['down','↓'],['edit','编辑'],['retry','重置'],['remove','移除']]){const button=document.createElement('button');button.dataset.job=job.id;button.dataset.jobAction=action;button.textContent=label;button.disabled=engine.running||!!engine.suspended;actions.appendChild(button);}el.appendChild(actions);view.appendChild(el);
                }
                if(!engine.queue.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='设置一个任务后点击“加入队列”。任务按顺序执行，失败时保留进度并暂停；持续刷钱项需设置目标金币，后续任务才能开始。';view.appendChild(empty);}
            } else {
                for (const item of engine.logs) { const el = document.createElement('div'); el.className = 'log'; const time = document.createElement('time'); time.textContent = item.time; el.append(time,item.text); view.appendChild(el); }
                if (!engine.logs.length) view.append('开始运行后将在这里记录切图、收益与停止原因。');
            }
            view.scrollTop = scroll;
        }
        function changeSetting(key,value) {
            if (engine.running||engine.suspended) return;
            engine.settings = normalizeSettings({...engine.settings,[key]:value});
            if (key === 'mode') { engine.status = `已选择${MODE_NAMES[engine.settings.mode]}，设置目标后开始`; engine.action = ''; }
            try { engine.persist(); } catch { engine.status = '设置无法保存，请检查浏览器存储空间'; }
            syncSettings(); render(); place();
        }
        root.addEventListener('change',event=>{ const input=event.target,key=input.dataset.setting;if(!key)return;changeSetting(key,input.dataset.boolean==='true'?input.value==='true':input.type==='checkbox'?input.checked:input.type==='number'||['speed','legendId','legendTier'].includes(key)?Number(input.value):input.value); });
        root.addEventListener('click',event=>{
            const button=event.target.closest('button');if(!button)return;
            if(button.dataset.category)showCategory(button.dataset.category);
            if(button.dataset.mode)changeSetting('mode',button.dataset.mode);
            if(button.dataset.tab){selectActivityTab(button.dataset.tab);render();}
            if(button.dataset.lookup){selectActivityTab('dex');dexPanel.search('#'+button.dataset.lookup);}
            if(button.dataset.jobAction&&!engine.running&&!engine.suspended){const i=engine.queue.findIndex(job=>job.id===button.dataset.job);if(i<0)return;const job=engine.queue[i],action=button.dataset.jobAction;
                if(action==='remove'){engine.queue.splice(i,1);if(editingJob===job.id){editingJob=null;query('#add-job').textContent='＋ 加入队列';}}
                if(action==='retry'){job.status='pending';job.result='';delete job.progress;}
                if(action==='up'&&i>0)[engine.queue[i-1],engine.queue[i]]=[job,engine.queue[i-1]];
                if(action==='down'&&i<engine.queue.length-1)[engine.queue[i+1],engine.queue[i]]=[job,engine.queue[i+1]];
                if(action==='edit'){selectWorkspace('tasks');editingJob=job.id;engine.settings=normalizeSettings(job.settings);engine.status='正在编辑队列项；调整目标后点击“更新任务”';query('#add-job').textContent='保存到队列项';itemOptions();syncSettings();}
                engine.persist(false);render();
            }
        });
        query('#item-search').addEventListener('input',itemOptions);
        function beginDrag(event) {
            const mini = event.currentTarget === query('.mini');
            if (event.button !== 0 || !mini && event.target.closest('button')) return;
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
        window.addEventListener('resize',place);
        document.addEventListener('visibilitychange',()=>{if(document.hidden)engine.releaseRankingView();else{render();place();}});
        query('#fold').onclick=()=>fold(true);
        query('.mini').onclick=event=>{if(event.detail>0 && Date.now()-miniDraggedAt<500)return;fold(false);};
        function jobTitle(cfg){const target={legend:MONS.get(cfg.legendId)?.name,roam:MONS.get(cfg.roamId)?.name,dex:cfg.dexSpecies?.length?cfg.dexSpecies.length+' 种目标':null,shiny:shinyGoals(cfg).map(id=>MONS.get(id).name).slice(0,3).join('、')+(shinyGoals(cfg).length>3?' 等':''),breed:MONS.get(cfg.breedId)?.name,item:ITEMS.get(cfg.itemId)?.name,train:`Lv.${cfg.trainLevel}`,progress:CHAPTERS.get(cfg.progressUntil)?.name,elite:`${cfg.eliteTier} 阶`,tower:`${cfg.towerFloor} 层`,candy:`${cfg.candyFloor?cfg.candyFloor+'层':'尽力挑战'} / ${cfg.candyRuns}局`,underground:`${cfg.underRuns} 次`,world:`${cfg.worldActions} 次攻击`,resource:ITEMS.get(cfg.resourceItem)?.name||cfg.resourceItem}[cfg.mode];return MODE_NAMES[cfg.mode]+(target?' · '+target:'');}
        function goalIdentity(cfg){return JSON.stringify(['mode','legendId','legendTier','roamId','itemId','trainUid','shinyId','breedId','eliteRegion','worldCapture','resourceItem','resourceAction','useUid','progressUntil','region',...(['dex','shiny'].includes(cfg.mode)?['Species','Weather','Regions'].map(suffix=>cfg.mode+suffix):[])].map(key=>cfg[key]));}
        query('#add-job').onclick=()=>{if(engine.running)return;if(engine.queue.length>=50&&!editingJob){engine.status='队列最多保存 50 项';render();return;}const current=engine.queue.find(job=>job.id===editingJob),job={id:current?.id||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,title:jobTitle(engine.settings),settings:normalizeSettings(engine.settings),status:'pending',result:''};if(current){if(goalIdentity(current.settings)!==goalIdentity(job.settings))delete current.progress;Object.assign(current,job);}else engine.queue.push(job);editingJob=null;query('#add-job').textContent='＋ 加入队列';engine.persist(false);selectActivityTab('queue');engine.status='任务已保存到队列';selectWorkspace('activity');};
        query('#start-queue').onclick=()=>{engine.startQueue();syncSettings();render();};
        query('#start').onclick=()=>{engine.queueRunning=false;engine.start();engine.sessionItemId=engine.settings.itemId;syncSettings();render();};
        query('#stop').onclick=()=>{engine.stop();syncSettings();render();};
        query('#resume').onclick=()=>{engine.resumeManual();render();};
        query('#reset').onclick=()=>{if(engine.running||engine.suspended)return;engine.metrics={};engine.telemetry=new Telemetry(engine.metrics);engine.persist();engine.log('已清除金币、经验与道具采样');render();};
        query('#export').onclick=()=>{
            const s=engine.state,diagnostic={version:VERSION,build:window.BUILD,dataBuild:DATA.build,mechanismBuild:DATA.economy.build,mechanismChecked:DATA.economy.checked,settings:engine.settings,status:engine.status,flow:engine.automation.state,services:engine.services,execution:taskExecutionState(s,engine),preparation:engine.preparation,queue:engine.queue,budget:{spent:engine.budget.spent,used:engine.budget.used},game:s?.adv?{chapter:s.adv.chapter,unlocked:s.adv.unlocked,layout:s.adv.layout,event:s.adv.event?.raid?'raid':!!s.adv.event,zone:s.adv.zone?.id,money:s.money,teamSize:s.team?.length}:null,metrics:engine.metrics,logs:engine.logs};
            const blob=new Blob([JSON.stringify(diagnostic,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pokecatch-helper-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        };
        query('#probability-info').addEventListener('toggle',()=>{if(query('#probability-info').open)render();});
        query('#export-profile').onclick=()=>{
            const blob=new Blob([JSON.stringify(configurationProfile(engine),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
            link.href=url;link.download=`pokecatch-settings-${VERSION}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        };
        query('#import-profile').onclick=()=>query('#profile-file').click();
        query('#profile-file').onchange=async event=>{
            const file=event.target.files?.[0], account=engine.account;event.target.value='';if(!file)return;
            try{if(file.size>2*1024*1024)throw new Error('配置文件超过2MB');const content=await file.text();if(account!==engine.account)throw new Error('读取文件期间账号已切换，请重新选择文件');importConfigurationProfile(engine,content);editingJob=null;syncSettings();}
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
        const heldPointers = new Set(), heldKeys = new Set();let composing=false,compositionTarget=null;
        const outsideHelper = event => event.isTrusted && !event.composedPath().includes(host);
        const updateHeld = () => { engine.inputComposing=composing;engine.inputHeld = composing||heldPointers.size > 0 || heldKeys.size > 0; };
        function manualEvent(event) {
            if (!engine.running || !engine.settings.manualPause || !outsideHelper(event)) return;
            if (event.type === 'pointerdown') heldPointers.add(event.pointerId);
            if (event.type === 'keydown') heldKeys.add(event.code || event.key);
            if(event.isComposing){composing=true;compositionTarget=event.target;}
            const newPause=!engine.manual,previousHeld=engine.inputHeld;
            engine.manualInput(); updateHeld();
            if(newPause||engine.inputHeld!==previousHeld||performance.now()-lastPaint>=500)render();
        }
        document.addEventListener('pointerdown',manualEvent,true);
        document.addEventListener('wheel',manualEvent,{capture:true,passive:true});
        document.addEventListener('input',manualEvent,true);
        document.addEventListener('compositionstart',event=>{if(!engine.running||!engine.settings.manualPause||!outsideHelper(event))return;composing=true;compositionTarget=event.target;engine.manualInput();updateHeld();render();},true);
        // Chromium can end a native composition with isTrusted=false. Only release a
        // composition already started by trusted input on this same editing target.
        window.addEventListener('compositionend',event=>{if(!composing||event.target!==compositionTarget)return;composing=false;compositionTarget=null;heldKeys.delete('Process');heldKeys.delete('Unidentified');updateHeld();if(engine.manual)engine.manualInput();render();},true);
        const releasePointer = event => { if (!event.isTrusted) return; const wasHeld = heldPointers.delete(event.pointerId); updateHeld(); if (wasHeld && engine.manual) engine.manualInput(); };
        window.addEventListener('pointerup',releasePointer,true); window.addEventListener('pointercancel',releasePointer,true);
        window.addEventListener('lostpointercapture',event=>{if(!event.buttons)releasePointer(event);},true);
        window.addEventListener('pointermove',event=>{if(event.isTrusted&&event.pointerType==='mouse'&&!event.buttons&&heldPointers.has(event.pointerId))releasePointer(event);},true);
        window.addEventListener('keydown',event=>{
            if(event.isTrusted&&event.altKey&&event.shiftKey&&event.code==='KeyP'){event.preventDefault();event.stopPropagation();helperAPI.show();}
        },true);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && engine.running && event.isTrusted) { engine.stop('Esc 停止助手'); render(); return; }
            manualEvent(event);
        }, true);
        window.addEventListener('keyup',event=>{if(!event.isTrusted)return;const wasHeld=heldKeys.delete(event.code||event.key);updateHeld();if(wasHeld&&engine.manual)engine.manualInput();},true);
        const clearHeld = () => { composing=false;compositionTarget=null;heldPointers.clear(); heldKeys.clear(); updateHeld(); };
        engine.clearHeldInput=clearHeld;
        window.addEventListener('blur',clearHeld); document.addEventListener('visibilitychange',()=>{if(pageHidden()){clearHeld();if(engine.running)engine.hiddenAt??=Date.now();}else if(engine.suspended){engine.resumeSuspended();render();}else if(engine.running&&!engine.restoring)engine.schedule(50);});
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
        window.addEventListener('pagehide', () => engine.suspend());
        window.addEventListener('pageshow',()=>{if(engine.suspended){engine.resumeSuspended();render();}});
        engine.onChange = render; itemOptions(); syncSettings(); render(); fold(!!ui.folded);
        setInterval(()=>{if(performance.now()-lastPaint>=2000)render();},2500);
        helperAPI.ready=true;startupPhase='已显示';
        }catch(err){
            const reason='助手界面初始化失败：'+(err?.message||err);
            try{engine.stop(reason);}catch{}
            helperAPI.ready=false;helperAPI.error=reason;
            showStartupError(err);helperAPI.show=()=>restorePanel();
        }
    }
    mount();
    }catch(err){showStartupError(err);}
})();

# 构建边界与维护规则

## 单文件运行，分模块维护

浏览器产物保留一个 IIFE 和原有启动保护；所有片段按 `build.manifest.json` 顺序拼接。工程不使用运行时 `import`、外部依赖、额外网络脚本或 `eval`。这使 Tampermonkey 沙箱、游戏页面桥接以及现有 Node 与浏览器回归保持一致。

每个分片是原脚本一个连续的顶级声明区间。片段不单独执行、不单独包裹闭包，也不能分别加载到页面。类和函数的内部逻辑仍然保留在所属模块内。

## 当前模块职责

| 模块 | 负责内容 |
| --- | --- |
| `src/00-bootstrap.js` | 版本、页面作用域检测、早期启动诊断、外层启动保护 |
| `src/core/updates.js` | 仓库来源、更新元数据与兼容检查 |
| `data/game.json` | 目录、等级上限、招式、属性、经济与机制数据 |
| `src/core/catalog.js` | 数据索引、默认设置、模式约束 |
| `src/data/candy.js` | 保留为原生 JS 的糖果工厂目录与池模型 |
| `src/core/settings-save.js` | 设置清理、存档解析、地区与时间辅助函数 |
| `src/models/facilities.js` | 对战塔、地下通道及活动候选模型 |
| `src/services/background.js` | 并行服务排程与地下探险事务规划 |
| `src/models/farming.js` | 普通刷闪、地图候选与基础目标选择 |
| `src/models/nursery-model.js` | 只读蛋判定、实际亲本池和条件下闪预测 |
| `src/models/nursery-ledger.js` | 有界观测台账、原生孵化增量、刷新和回档分段 |
| `src/services/nursery-monitor.js` | 账号独立存储、最新存档检查和多标签写前核对 |
| `src/ui/nursery-panel.js` | 闪蛋卡片、成熟倒计时、原生可选标记和统计导出 |
| `data/weather.json` | 每小时天气规则、季节与昼夜遭遇池快照 |
| `src/models/weather.js` | 当前真实天气池、天气上下文与缓存 |
| `src/models/roster.js` | 队伍成员索引、能力与基础匹配 |
| `data/evolution.json` | 等级进化、条件进化与时间规则 |
| `src/models/evolution.js` | 免费进化候选与执行前检查 |
| `src/models/combat-team.js` | 招式伤害、行动序列、配队与战斗期望 |
| `src/models/routes-training.js` | 物资、练级、补练与地图收益评估 |
| `src/models/collection.js` | 传说、游荡目标、图鉴和特殊条件 |
| `src/core/telemetry.js` | 真实整轮采样、队伍/地图/收益上下文 |
| `src/runtime/dom-driver.js` | 可见性检查、原生控件操作与导航 |
| `src/runtime/automation.js` | 执行事务、模态框、设施、资源和队伍流程 |
| `src/runtime/level-coach.js` | 补练生命周期、目标恢复与辅助资源 |
| `src/runtime/engine.js` | 状态机、任务队列、控制权与持久化 |
| `src/runtime/node-exports.js` | 离线规划测试所需的 CommonJS 导出 |
| `src/ui/mount.js` | 助手面板、交互事件、启动与启动失败显示 |

`src/data/game-after.js`、`weather-after.js` 和 `evolution-after.js` 保存数据声明后、下一个模块前的原始注释或辅助声明。它们可以仅有换行，目的是让迁移保持完整、容易核对。

## 修改与扩展

1. 先找到负责该机制的模型和执行模块。纯规划函数尽量保留在 `models/`，原生页面点击和交易确认放在 `runtime/`。
2. 新的数据快照只写 JSON，不能含函数、表达式或脚本。`DATA`、`WEATHER_DATA` 和 `EVOLUTION_DATA` 由构建器解析、校验，再作为常量注入产物。
3. 新增分片时，在 manifest 中写明顺序。常量必须先初始化再读取；函数可按当前作用域使用声明提升。
4. 修改对外模型时同步维护 `node-exports.js` 和对应离线回归。浏览器测试依赖唯一、精确的 `    mount();` 行，不要更名、缩进或复制这个钩子。
5. 执行 `npm run build`、`npm test` 和必要的浏览器/原生差异回归，最后执行 `npm run package`。

## 构建检查

构建会拒绝越出项目目录的清单路径、重复模块、重复数据常量、缺失必要数据、损坏的 species/stats/learnset/章节字段、丢失的 CommonJS 边界、重复的挂载钩子和 JavaScript 语法错误。

`VERSION` 必须紧随 IIFE 的 `'use strict';`，以保证早期失败面板也能显示版本。版本源只有 `package.json`；头部与 bootstrap 使用 `{{VERSION}}` 模板。构建信息只包含版本和内容哈希，不写入当前时间，从而可以重复验证。

## 自动化状态约束

后台孵蛋、地下派遣和前台副本可能同时处于活动状态，但页面操作仍由同一个引擎串行调度。点击出发、购买、领蛋等操作必须先记录事务，等待原生状态确认后再清除。存档恢复时先核对真实任务和占用成员，不能只凭持久化的“已点击”标记重复交易。

手动操作暂停、浏览器冻结恢复、跨地区重置和任务完成应分别处理。任何临时补练都要保留原任务，达标或等级上限变化时重新评估并返回原任务。收益样本需要绑定队伍与地图上下文，不能把糖果支出、后台结算或部分地图循环误算成完整刷取收益。

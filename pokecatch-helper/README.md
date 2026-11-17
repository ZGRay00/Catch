# PokéCatch 自动助手 4.0

普通用户只需把 `dist/pokecatch-helper.user.js` 安装到 Tampermonkey。模块目录是可维护的源码，不需要上传到游戏页面，也不需要安装 Node 才能使用助手。

脚本在浏览器中读取游戏状态并操作游戏原生控件。队伍、任务队列和自动化设置继续使用现有存储格式；更新脚本前可以从助手面板导出诊断，游戏存档请使用游戏自身的导出功能。

面板中“异色概率与收集进度”可以展开查看当前野外与蛋的概率。这里显示的是机会概率，不能保证下次出现异色；游戏完整图鉴加成与助手“基础形态即完成进化链”的任务统计分别计算。要备份助手设置，请展开面板并滚动到底部，使用“导出配置 / 导入配置”；导入前先停止当前任务，导入后点击开始才执行任务。

后台支持默认关闭。需要时先按 `extension/README.md` 加载可选扩展，手动刷新已打开的游戏页，然后点击扩展图标开启后台支持。防止系统休眠是另外一个默认关闭的选项，仅在用户勾选时申请 `power` 权限。助手的任务状态卡会显示是否检测到保活心跳。

## 开发与构建

使用 Node.js 22 或更高版本。工程没有第三方依赖，不需要执行 `npm install`。

```powershell
cd pokecatch-helper
npm run build
npm run check
npm test
npm run package
```

如果 Windows PowerShell 的执行策略拦截 `npm.ps1`，使用 `npm.cmd run build`、`npm.cmd test` 等同名命令即可，无需更改系统执行策略。

- `build` 校验模块、数据和 JavaScript 语法，然后生成工作区根目录 `Pokecatch自动助手.user.js`，以及 `dist/` 中的安装脚本、更新元数据和构建哈希。
- `check` 重新计算全部产物并检查是否与当前文件一致，不会改写文件。
- `test` 先检查构建产物，再运行本工程的构建测试和工作区 `tests/pokecatch*.test.cjs` 离线回归。
- `package` 构建并检查产物，生成 `dist/pokecatch-helper-v4.0.0.zip`。相同源码、Node 版本与 zlib 版本会生成相同字节的 ZIP。
- `test:build` 只测试构建、数据校验和打包工具；`test:browser` 运行浏览器集成回归，需要本机具有测试脚本所支持的 Chrome 或 Edge。

**修改 `src/` 和 `data/` 后再构建。根目录和 `dist/` 的 `.user.js`、`.meta.js` 及 `build-info.json` 都是生成文件，请勿手工修改。** 生成文件的改动会被下次构建覆盖，`npm run check` 会报告漂移。

`build.manifest.json` 决定模块顺序。模块在同一个 IIFE 词法作用域内依次拼接，保留现有启动保护、CommonJS 规划导出和浏览器测试钩子。浏览器安装文件仍然是完整单文件，不依赖运行时下载模块。

## 目录

```text
pokecatch-helper/
  package.json                 版本号与开发命令
  build.manifest.json          构建顺序
  userscript.header.txt        Tampermonkey 元数据模板
  data/game.json               游戏目录、基础数值、招式与机制快照
  data/evolution.json          进化规则快照
  data/weather.json            天气、季节与昼夜遭遇池快照
  src/core/                    设置、存档兼容、更新、遥测
  src/models/                  配队、伤害、收集、收益与练级模型
  src/services/                地下通道等后台任务规划
  src/runtime/                 DOM 操作、任务执行与主引擎
  src/ui/                      助手面板
  tools/                       导入、构建、回归入口与 ZIP 打包
  tests/                       工程完整性测试
  dist/                        可安装产物与发布压缩包
```

保留分片共享闭包，是为了兼容油猴的页面沙箱和已存在的测试。跨模块调用使用同一闭包内的声明；拆分边界不能随意移动到类或函数内部。依赖顺序和扩展方法见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 浏览器与原生机制回归

默认离线测试不会启动真实游戏或修改账户。浏览器测试使用本地模拟页面，原生机制差异测试需要另外提供**已下载的游戏公开构建文件**，不会把该文件包含在发布包中。

```powershell
node ../tests/pokecatch-helper-browser.cjs
node ../tests/pokecatch-startup-browser.cjs
node ../tests/pokecatch-execution-ui-browser.cjs
node ../tests/pokecatch-team-native-v214.cjs C:\path\to\public-app.js
```

其他 `*-native-*.cjs` 和 `pokecatch-native-*.cjs` 也是按需执行的机制核对工具，先查看对应文件参数。浏览器测试需要本机安装 Chrome 或 Edge；游戏公开构建由开发者单独取得并核对版本。

天气快照可以从已下载且已核对版本的公开游戏构建重建：`node tools/extract-pokecatch-weather.cjs C:\path\to\public-app.js`。工具使用合成内存存档与静止计时器，不读取浏览器存档、不访问网络；默认直接写入唯一数据源 `data/weather.json`，随后需要重新构建并跑天气差异回归。不要把原始游戏构建或重复的原始天气 JSON 加入发布包。

## 可选保持激活扩展

安装助手无需保持激活扩展。如果发布包有 `extension/` 或 `extensions/`，可按其中说明通过浏览器“加载已解压的扩展程序”安装。扩展属于可选支持，不能保证系统休眠、断网或浏览器强制冻结时继续执行任务。

助手后台状态和游戏原生离线收益是两套机制。页面被冻结时 JavaScript 不执行；返回页面后助手根据实际游戏状态恢复。扩展的权限与行为以其 `manifest.json` 和说明为准。

## 发布包内容与可重复构建

打包工具采用文件白名单：助手安装脚本、本工程源码和数据、开发工具、说明、与 PokéCatch 有关的测试及模拟夹具，以及存在时的第一方可选扩展。个人存档、浏览器配置、参考插件、其他游戏脚本、`.git`、缓存和已有 ZIP 均不进入发布包。

ZIP 使用固定文件顺序、UTF-8 文件名和固定时间，内置 Node `zlib` 压缩。`dist/build-info.json` 保存每份输入和产物的 SHA-256，检查时重新计算，不依赖修改时间。跨 Node/zlib 版本时压缩字节可能不同，安装脚本本身依旧可以直接比较。

## 从旧单文件迁移

`tools/import-legacy.cjs` 只用于本项目旧单文件的一次性迁移；它不会导入、运行第三方插件。迁移已经完成后，请直接编辑模块。

```powershell
node tools/import-legacy.cjs
npm run build
npm test
```

导入器会按明确的顶级声明边界切分源码，把游戏目录、天气与进化 JSON 数据独立出来，并保留原声明的执行顺序。已有模块时默认拒绝导入；`--force` 只应用于刻意重新迁移，**会覆盖模块内的修改**。它不会在日常构建和测试时自动执行。

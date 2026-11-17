# 4.0.1 多源在线更新修复

参考本工作区红叶镇和 Aether 自动助手的更新流程，增加四个固定来源：

| 来源 | 正文地址 |
| --- | --- |
| GitHub Raw | `https://raw.githubusercontent.com/ZGRay00/Catch/main/pokecatch-helper.user.js` |
| jsDelivr | `https://cdn.jsdelivr.net/gh/ZGRay00/Catch@main/pokecatch-helper.user.js` |
| Fastly | `https://fastly.jsdelivr.net/gh/ZGRay00/Catch@main/pokecatch-helper.user.js` |
| GCore | `https://gcore.jsdelivr.net/gh/ZGRay00/Catch@main/pokecatch-helper.user.js` |

2026-11-17 的实际 GET 检查中，四源正文、固定提交、时间戳及元数据请求均成功。检查时远端仍为 3.5.0；网络探测结果不能代替发布后的版本核对。结构化记录见 `update-sources-2026-11-17.json`。

CDN 分支地址可能缓存数小时，即使加时间戳也不能保证新鲜度。面板先尝试取得仓库最新提交，跨源使用同一提交检查；提交信息不可用或固定来源全部失败时，比较分支来源的有效版本。仅分支缓存一致时不会声称已确认最新提交。[jsDelivr 缓存规则](https://github.com/jsdelivr/jsdelivr#caching)

各请求有独立时限，并行检查来源；单源失败不会阻断其余来源。面板显示连接状态、版本、耗时与错误，允许选择来源、重试及取消。取消后的迟到响应不能覆盖新的结果。

下载正文只进行名称、namespace、版本和完整脚本格式验证，不执行远程正文。固定仓库和文件白名单、HTTPS、正常端口、重定向身份检查继续保留；没有引入通用代理或任意 URL 输入。新增的油猴跨域授权只包含上述 CDN 域名。

“安装新版”打开本次检查成功的来源；取得提交时使用固定提交地址。安装页不可访问时，“下载已校验脚本”保存本次缓存正文，由用户通过油猴导入。符合用户脚本安装流程的 `.user.js` 链接也可以直接打开。[Tampermonkey 安装说明](https://www.tampermonkey.net/faq.php?q=Q102)

原生油猴 `@updateURL` 和 `@downloadURL` 只能各提供一个地址，继续保留缓存时间较短的 Raw 地址。四源容错由助手面板实现，不能把元数据中的单地址描述为自动支持四源。当前已经安装的旧单源版本，需要先完成一次手动更新。

本次修复不改变游戏存档、任务队列、控制权或 4.0 的模块化结构。

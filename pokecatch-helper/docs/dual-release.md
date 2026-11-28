# 助手双渠道发行

国内固定入口位于 COS 的 updates/v1/helper，全球固定入口位于 ZGRay00/Catch 主分支根目录。普通开发提交只触发测试。版本记录见 helper-vVERSION 标签与 GitHub Release。安装入口、同版本覆盖与玩家操作见 release-notes.md。

在已审阅且与远程 main 相同的干净 Catch 检出内，运行 `node pokecatch-helper/tools/start-release.cjs VERSION`。它执行回归、冻结、签名、推送准备分支并提交受保护的云端发行作业。恢复模式在 Windows 设置 POKECATCH_LOCAL_RELEASE_PS1 为现有模拟器 local.ps1 的绝对路径，命令末尾加 local。相同版本和内容已上线时执行只读回查。

手工恢复时，维护者先冻结源码提交，在原生产签名机对该提交执行 node pokecatch-helper/tools/helper-release.cjs seal releases/helper-vVERSION SOURCE_SHA。签名机通过 POKECATCH_SIGNING_KEY 提供本地生产密钥路径。维护者须检查原有免费试用、禁止商业使用授权覆盖此次文件。程序验证源码输入和现有 Ed25519 公钥，封存共享正文、两个头部、四个变体、来源提交与说明摘要。保留发布目录原始字节。将根目录兼容脚本（含中文别名）和 meta 指向全球版，并复制签名清单。以源码提交为直接父提交生成发布提交，仅增加封存文件并更新兼容入口和安装说明，推至 helper-prepared/VERSION。

在仓库中启用受保护的 helper-production Environment，限制受信任主分支并设置审批人。在该环境设置 COS_SECRET_ID 与 COS_SECRET_KEY，在仓库设置 HELPER_CI_RELEASE_ENABLED=true。专用身份仅需既有前缀的读写权限。两处共享身份时，撤销凭据会同时影响两处。确认环境保护可用后，手动触发 Pokecatch helper，填版本及完整准备提交，执行一次双渠道提升。仓库未配置时可以由已授权 Windows 用户通过本机 DPAPI 包装器发布同一签名文件集。两条路径竞争同一个 GitHub 引用锁。工作流没有生产签名私钥。

发布程序先检查双方现有版本与签名文件，再准备 GitHub 草稿附件、COS 历史对象。完成回读后公布 Release、以快进更新主分支，再写 COS 正文、meta 与手动检查清单。固定链接可能暂时返回缓存。发布回执列出两边的进度；失败可用同一封存提交重试。进程意外终止留下 helper-publish-lock 时，先核实没有活跃本机或云作业，再由维护者释放遗留锁。已发布版本不能用不同内容覆盖，修正使用更高版本。

GitHub Actions 工作流以 Linux 云 runner 检查构建，受保护发行作业回读外部链接。按实际运行位置记录跨地区结果。该工作流的公共下载回读不代表脚本管理器已完成安装。

本次在隔离的 Edge 配置中，用真实 Tampermonkey 5.5.1 验证了 8.7.1 → 国内 8.8.0（Update）、国内 → 全球 → 国内（Reinstall）。四次核对均只有一个脚本，原有管理器脚本 ID 和检查偏好保持一致。

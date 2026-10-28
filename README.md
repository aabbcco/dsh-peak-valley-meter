# 峰谷时计 · Peak & Valley Meter

插件包名：`dsh-peak-valley-meter`（原 `dsh-peak-valley-price`）。本版面向 DeepSeek Harness `0.2.1-rc.3`，用户设置统一使用原生 Config 与当前 profile 的配置覆盖层；官方价格缓存和提醒去重键沿用原命名空间。

**配置重构说明：本版不迁移、读取或写入旧独立 JSON 设置。** 首次使用时采用原生 profile 已配置的值或 Schema 默认值，需要时请在设置页重新配置。旧文件留在磁盘上，不会自动删除或重新导入。

DeepSeek Harness 的轻量峰谷显示插件。保留可自定义的峰谷名称、颜色与显示位置；悬停查看当天时间轴，点击固定展开价格详情。无需 API Key，不查询余额，也不唤醒模型发送提醒。用量特效只处理调用计数、时间与模型标识，不保存对话正文。

## 使用

- 常驻标签：当前时段、自定义名称、倒计时，以及可选价格、时钟、时间条。
- 悬停或键盘聚焦标签：查看显示时区下的当天时间轴和当前位置。
- 点击标签：固定展开详情，包括下次切换的完整日期/时间、当前价格及来源、官方参考价目表、规则版本和更新状态；Escape 或点击外部关闭。
- 设置 → 峰谷时计，或插件详情页：编辑名称、颜色、位置、显示项目、价格模式、规则模式和提醒。名称默认保留为“梁文峰 / 梁文谷”，已有自定义名称优先，只有保存修改后才生效。
- 提醒默认全部关闭。可以分别开启进入峰/谷时的提醒，或提前 1–60 分钟提醒。提醒仅在应用内显示，不调用模型；首次加载、页面隐藏及长时间挂起后的恢复不补发过去的提醒。

## 调用消耗飘字

默认开启，在当前会话每次模型调用结束并上报有效用量后，从“梁文峰 / 梁文谷”文字处飘出 `−1,234 tokens`，默认约 3 秒向上飘约 58px，同时缓慢放大至约 1.6 倍并淡出消失，可将“动画时长”调至 1–8 秒，数值越大动画越慢。可独立选择“飘字颜色”（选择后自动取消跟随峰谷颜色），也可勾选“跟随峰谷颜色”；这些设置不会改变峰谷标签本身的颜色。插件设置中的“调用消耗飘字”可以关闭，或切换为 `≈−0.0123 元` 的人民币参考估算。顶部位置空间不足时显示在标签下方；系统开启“减少动态效果”时仅淡入淡出。

- 在“调用消耗飘字”设置中点击“预览特效”，可在预览区域重复播放上飘、放大与淡出效果。使用当前未保存的颜色、时长、单位和跟随颜色选项；示例数字不触发模型调用，也不写入真实用量或保存配置。关闭飘字时仍可预览。
- 使用宿主的 `peakValleyUsage` 会话投影实时接收最终用量，不新增日志轮询；当前会话与其他会话隔离。
- input、缓存命中/写入与 output 分别计数；reasoning 已包含在 output，不重复累加。同一调用修正数据不会重复飘字，重试调用单独计算；没有有效用量的调用不显示虚构数字。
- 金额是当前插件内置官方价目表的参考估算，按每次请求开始时的北京时间峰谷档位计算。只对可确认的官方 DeepSeek 路由和支持模型显示金额；其他模型、价格无法确认或日历超出覆盖范围时自动显示 token。它不采用用户自定义的单项展示价，也不代表账户实际扣款。
- 首次打开、切换会话、页面隐藏及休眠恢复不会补播历史；同屏最多 4 条，动画不拦截鼠标操作，结束后自动清理。

## 规则与来源

截至 2026-10-22 核对的官方规则：北京时间周一至周五（不含中国法定节假日）09:00–12:00、14:00–18:00 为高峰；其他时段、周末及中国法定节假日全天为谷时。

- [官方中文定价页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)
- [官方英文定价页](https://api-docs.deepseek.com/quick_start/pricing/)
- [国务院办公厅 2026 年节假日安排](https://www.gov.cn/zhengce/content/202511/content_7047090.htm)

内置日历覆盖 **2026-01-01 至 2026-12-31**，采用国务院通知中的完整放假区间。根据官方定价“周末全天谷时”的表述，周末调休上班日仍按谷时处理。日历未覆盖的年份会明确提示；其中需要节假日信息才能确认的工作日高峰窗口显示“规则待更新”，不会把未知日期当作已核实高峰。

计费日期始终按北京时间判定，显示时区可单独选择。当前状态、下一次切换和时间轴使用同一套规则；倒计时以绝对时间为准，支持跨周末、长假和夏令时显示日。时间轴按真实时间长度绘制，因此夏令时切换日可能是 23 或 25 小时。

## 价格模式与原生设置

- **官方模式**：可选 `deepseek-flash` / `deepseek-v4-pro` 和缓存命中输入、未命中输入、输出项目。币种为人民币，单位为每百万 tokens。
- **自定义模式**：使用自己设置的峰价、谷价、币种和单位；仅供个人参考，不改变实际账单。必须显式选择自定义模式，仅设置价格不会自动切换模式。
- 名称、颜色、位置、时段和提醒等字段全部声明为原生 volatile Config；保存后立即生效，业务读取 `.get()` 的最新值，无需重新挂载插件。
- 默认值不自动写成 profile 覆盖。配置仅保存修改过的路径，并检查宿主修订号；其他窗口先保存时保留当前草稿并提示重新读取，不自动重试覆盖。
- 原生设置服务不可用时只读显示，不回退写旧 JSON。旧版页面的摘要式配置版本不再接受，升级后需刷新页面。
- 颜色统一使用 `#RRGGBB`，数字和布尔值严格校验；无效设置不会保存，也不会替换当前生效值。

本次内置 Flash 输出参考价为峰 ¥8、谷 ¥4；完整价目表以界面显示的来源及更新时间为准。旧模型名 `deepseek-v4-flash` 已由官方重定向至新版 Flash 服务，本插件的官方模型选择使用 `deepseek-flash`。

## 自动更新与回退

默认启动时检查官方定价页，此后最多每 6 小时检查一次；详情中也可手动检查。只访问固定的官方中英文地址，不接收任意下载 URL，不发送凭据或本地数据。

解析器检查两个页面的时间规则一致、模型列表可识别、价格项完整、峰谷价格比例符合页面说明。超时、离线、页面格式变化、规则冲突或缓存写入失败时，继续使用最后一次有效规则，并显示原因。成功结果保存为插件自己的缓存，重启后可继续使用。

官方页面的新规则若超出解析器支持范围，需要人工核对后升级插件；不会根据未知文字猜测规则。价格同步**不会更新节假日日历**，日历覆盖范围单独显示，后续年份需要加入已核实的官方安排。

自定义规则可设置 UTC 小时窗口（最多 6 个）、周末/节假日开关，支持分钟精度、跨午夜、合并重叠窗口。`[]` 表示没有峰时窗口，`[[0,24]]` 表示全天窗口；日历开关仍单独作用。

## 工具与数据

- `peak_valley_price`：查询当前状态、下次切换、时间轴、价格与来源。
- `peak_valley_settings`：`get` 返回设置、可写状态、命名空间、修订号和字段约束；`update` 通过原生 settings.mutate 部分修改；`refresh` 同步官方参考数据。建议 update 传入上次 get 的 `configVersion` 作为 `expectedRevision`。
- 用户配置：由 ConfigEditor 写入当前 profile 的 `cordis.patch.yml`，以实际插件条目 ID 为命名空间；不要通过脚本直接改运行中 profile 文件。
- 官方缓存：`$DSH_HOME/storages/dsh-peak-valley-price/official-policy.json`。旧同目录 `config.json` 不再读取或更新。
- 提醒去重：插件专用浏览器 localStorage，支持 Web Locks 时跨同源窗口串行去重；存储不可用时退化为单窗口去重。

## 安装与开发

通过 DSH 插件管理器安装 `github:aabbcco/dsh-peak-valley-meter`，或安装本目录，不需要修改 DSH 本体或其他插件。Host/Client 均为直接运行的 JavaScript，无需转译；构建流程负责校验和生成发行包。已运行实例是否加载新代码，以插件管理器应用结果和实际界面验证为准。

从 GitHub 克隆开发：

```bash
git clone git@github.com:aabbcco/dsh-peak-valley-meter.git
cd dsh-peak-valley-meter
pnpm install --frozen-lockfile --ignore-scripts --config.auto-install-peers=false
pnpm test
```

运行 `npm test` 或 `node --test test/*.test.js`。测试覆盖峰谷边界、周末/长假、时区与夏令时、未覆盖日历、官方解析失败、原生 Schema、设置冲突、持久化与重新加载，以及界面提醒逻辑。文件写入测试仅使用插件目录内的临时目录，结束后清理，不改实际用户配置。

核心文件：`lib/policy.js`（纯规则）、`lib/config.js`（原生 Config 与统一校验）、`lib/native-settings.js`（宿主设置适配）、`lib/official.js`（官方同步）、`lib/index.js`（Host）、`lib/client.js`（Client）。Host 只注册 `/api/peak-valley-price/status`、`refreshPolicy`、`clientReport` 三个精确路由；用户配置由宿主标准 `settings/mutate` 保存。加载诊断只保留该插件的版本、初始化状态及有界错误文字，不读取其他页面数据。

## 构建与打包

环境：Node.js 22.19+，需要 `npm` 用于本地打包；依赖安装后构建不访问网络。

```bash
npm run check  # 校验 JS 语法、包声明、插件挂载、客户端模块、图标与双语资源
npm test       # 运行全部回归测试
npm run build  # 自动执行校验与全部测试，然后生成发行目录、安装包及 SHA-256
```

也可使用 `pnpm run check`、`pnpm test`、`pnpm run build`。这是纯 JavaScript 项目的发行构建，保留 Host ESM 与浏览器 ModuleLoader 格式，不添加转译或压缩步骤。

构建产物：

| 路径 | 内容 |
| --- | --- |
| `dist/package/` | 整理后的插件目录，包含 Host/Client、规则模块、元数据、图标、语言文件、README 和 LICENSE |
| `dist/dsh-peak-valley-meter-<版本>.tgz` | 标准 npm 安装包，可交给 DSH 插件管理器安装 |
| `dist/SHA256SUMS.txt` | 安装包 SHA-256 校验和 |
| `dist/build-info.json` | 构建时间、Node 版本、文件清单、大小与校验和 |

构建从明确的发行文件清单复制资源，验证实际压缩包内容与清单一致；不包含测试、构建脚本、依赖目录或本地配置。发行版清除开发依赖和生命周期脚本，运行依赖仍按标准包声明由安装器解析。重复构建只替换 `dist/package/` 等构建产物，不改正在运行的 `lib/` 或用户配置；`dist/` 已加入 Git 忽略规则。

## GitHub Actions 自动发布（npm OIDC）

`.github/workflows/release.yml` 在 GitHub Release **发布**时触发（`release: published`）。保存草稿、只推送 tag 或修改发布说明不会发布 npm 包。

流程分为两个作业：

1. **构建**：检出 Release tag，要求 tag 严格等于 `v<package.json.version>`，校验插件元数据版本；使用 Node.js 24、pnpm 11.24.0 和冻结锁文件安装依赖，禁止安装生命周期脚本；运行完整测试、构建并校验安装包。
2. **发布**：检出构建时记录的同一提交，下载同一次运行的产物并再次核对 SHA-256；上传 `.tgz`、`SHA256SUMS.txt` 和 `build-info.json` 到该 Release；通过 npm OIDC 发布**同一个 `.tgz`**，附带 provenance。发布作业不会重新打包。

正式版本发布到 npm `latest`。形如 `0.3.2-rc.1` 的预发布版本必须在 GitHub Release 勾选 prerelease，并发布到 `next`；版本形式与 Release 类型不一致时停止。测试、版本检查或校验和检查失败均不会发布。

### 一次性配置 Trusted Publisher

该流程不使用 `NPM_TOKEN`、`NODE_AUTH_TOKEN` 或长期 npm 凭据。请由 npm 包维护者在 npm 网站打开 `dsh-peak-valley-meter` → Settings → Trusted publishing，添加 GitHub Actions：

| 字段 | 值 |
| --- | --- |
| Organization or user | `aabbcco` |
| Repository | `dsh-peak-valley-meter` |
| Workflow filename | `release.yml`（只填文件名） |
| Environment name | `npm` |

同时在 GitHub 仓库 Settings → Environments 创建 `npm` 环境，与工作流名称完全一致。可按维护需要配置环境审批或允许的 Release tags。工作流仅对发布作业授予 `contents: write` 和 `id-token: write`，构建作业只有源码读取权限。npm CLI 固定为支持 Trusted Publishing 的 `11.6.2`；不执行 `npm login` 或依赖 `npm whoami` 的本地发布脚本。

参考：[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)。绑定需在 npm 账户侧完成，提交工作流文件不会自动创建此绑定。

### 发布步骤与失败重试

1. 同步包版本、插件元数据、Host/Client 版本标识及相关测试。本次版本为 `0.3.1`。
2. 将代码、工作流、构建脚本和锁文件提交并推送到 GitHub；Release tag 必须包含这些文件。
3. 在 GitHub 创建 tag `v0.3.1` 对应的 Release，点击 **Publish release**。
4. 在 Actions 查看 `Release` 工作流，成功后检查 Release 的三个附件及 npm 包版本。

若 npm OIDC 配置失败，已经上传的 Release 附件会保留；完成 Trusted Publisher 设置后可在同一次运行中 **Re-run failed jobs**。重复运行会更新同名 Release 附件；如果 npm 上已存在该版本，只有远端包的 SHA-512 与本次安装包完全相同时才跳过 npm 发布，不会覆盖既有版本。网络或 registry 错误不会被当作“版本不存在”。

GitHub Release 本身在点击发布时已经公开，因此构建失败不会自动撤回 Release，也不能把“Release 已发布”当作“npm 发布成功”。此外，将已发布预发布版本转为正式 Release 不会自动升级包版本或切换 npm 标签；正式发布请创建不带预发布后缀的新版本和新 Release。

## 本地手动发布到 npm

包名为 `dsh-peak-valley-meter`，当前版本为 `0.3.1`，发布目标固定为公共 npm registry。以下仅用于维护者本地发布，自动发布使用上面的 OIDC 工作流。

```bash
npm run publish:dry-run  # 重新构建、测试并预演发布，不上传
npm login --registry=https://registry.npmjs.org/
npm run release          # 重新构建、核对 SHA-256、确认登录身份并发布实际安装包
```

`release` 发布的是经过验证的 `dist/*.tgz`，不是工作目录。登录无效会停止发布并提示重新登录；账号还需要目标包的发布权限，并满足 npm 的双重验证要求。同一版本无法重复发布，后续发布需同步修改包声明和插件元数据中的版本号。

也可手动发布构建后的包：

```bash
npm publish ./dist/dsh-peak-valley-meter-0.3.1.tgz --access public --registry=https://registry.npmjs.org/
```

从源码目录直接运行 `npm publish` 时，`prepublishOnly` 会先运行资源校验和全部测试。安装包本身没有开发或安装生命周期脚本，安装时不会自动构建。

## License

BSD-3-Clause，沿用本仓库的 LICENSE。插件图标为本项目原创 SVG。

---
kind: "package-bundle"
description: "在 DeepSeek Harness 中使用 ChatGPT OAuth 账号与 Codex 模型。"
---

# Codex Connect

<a id="plugin-information"></a>
## 插件信息

在 DeepSeek Harness 中使用 ChatGPT OAuth 账号与 Codex 模型。

| 字段 | 内容 |
|---|---|
| 包名 | `dsh-codex-connect` |
| 当前 checkout 版本 | `0.1.0-alpha.4.35` |
| 维护仓库 | [AaronWu77/dsh-codex-connect](https://github.com/AaronWu77/dsh-codex-connect) |
| 包许可证 | Apache-2.0 |

包身份、许可证和上游声明以 [package.json](../package.json) 为准。checkout 版本不代表已发布版本或经过验证的兼容性；下文已有的验证范围与部署限制仍然适用。

<a id="source-and-attribution"></a>
## 来源与归属

- [Codex Connect](https://github.com/franksong2702/dsh-codex-connect) — 基于上游改造; Apache-2.0; 未记录精确上游基准。 本地 DSH 兼容与账号、用量管理集成。
- [dsh-codex](https://github.com/Yan-Zero/dsh-codex) — 基于上游改造; Apache-2.0; 未记录精确上游基准。 通过 Codex Connect 继承，原作者归属保留在 NOTICE 中。 [详细记录](https://github.com/AaronWu77/dsh-codex-connect/blob/HEAD/NOTICE)。
- [pi-ai OAuth](https://github.com/earendil-works/pi) — 基于上游改造; MIT; @earendil-works/pi-ai 0.84.4。 OAuth 登录与刷新代码，修改了 JWT 解码、回调清理和刷新拒绝处理，详见 NOTICE。 [详细记录](https://github.com/AaronWu77/dsh-codex-connect/blob/HEAD/NOTICE)。

维护中的 fork 与上游项目属于不同仓库。原作者、版权、许可证与通知声明继续保留；缺失的上游基准不根据本地版本推断。

[![npm version](https://img.shields.io/npm/v/dsh-codex-connect/alpha?label=npm%20alpha&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)

[English](../README.md) | 中文

通过 OAuth 把你的 ChatGPT 订阅接入 DeepSeek Harness，并提供可选的 GPT Image 图片生成、由用户控制的默认设置、Harness 原生审批、诊断与可靠的会话恢复。

社区 Alpha 项目——与 OpenAI、ChatGPT、Codex、DeepSeek 或 DeepSeek Harness 不存在隶属关系，也未获得其背书。

Codex Connect 为标准 Harness agent loop 添加 `openai-codex` 模型提供方。工具、权限、审批、附件、会话持久化、压缩与恢复继续由 Harness 管理。安装插件不会改变默认模型或搜索路由，也不会把 ChatGPT 订阅变成 OpenAI Platform API Key。

本 checkout 面向已构建的本地 DSH `0.2.2-rc.1` fork，不是已发布的版本组合。Host 运行时与类型声明都必须具有搜索路由访问器、Agent 模型访问、工具批次执行和 Session 摘要投影 API。包元数据保留既有 npm 版本范围；仅版本相符不能证明这些 npm 版本已通过验证。Codex 请求 PI 与 `pi-ai-host` 事件流 alias 均以精确的 PI `1.4.0` 为目标；带本地补丁的 OAuth 实现仍固定使用 PI `0.84.4` 源码。[rc.2 候选证据](rc2-candidate-validation.md)记录的是此前基线。无需密钥的本地检查不能证明真实 OAuth、推理、浏览器行为或活动 profile 可用。下方已发布安装指南及验证历史保持不变。

此私有 checkout 还包含选择性移植的本地审核、速度/推理默认值和仅原图恢复。应用前请阅读[本地集成与迁移限制](local-feature-update.zh.md)；修改候选并不代表运行中的 profile 已安装这些功能。

## 快速开始

本指南介绍下方已发布的组合。请先运行 `dsh --version`；其他 DSH 版本请查阅[安装与升级](../INSTALL.md)。`alpha` 等会移动的 npm tag 不代表兼容性保证。

| 要求 | 已验证组合 |
|---|---|
| Codex Connect | `0.1.0-alpha.4.33` |
| DeepSeek Harness | `0.1.2-rc.1` 或 `0.1.5-alpha.1` |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| 账户 | 通过 ChatGPT OAuth 使用所请求的 Codex 模型；可用性由 OpenAI 决定 |

### 1. 安装

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.33
dsh web
```

将 `web` 替换为正在使用的 profile 名，启动 Harness 时也使用同一个 profile。从 DSH 源码 checkout 执行时，请在命令前加 `pnpm`。其他 profile 的用法和安装检查见 [INSTALL.md](../INSTALL.md)。

### 2. 授权并选择模型

打开 **设置 → 模型 → Openai-Codex → 授权**，然后亲自在浏览器中完成批准。如果内嵌窗口被拦截，请用 **打开 ChatGPT 登录页面**。在 Harness 的常规模型选择器中选择一个 `openai-codex` 模型。

不要把授权 URL、code、token 或账户标识粘贴到 issue、日志、聊天或配置文件中。在另一台设备上使用浏览器时，可通过默认收起的手动回调表单完成当前登录，无需转发 localhost 回调端口；请遵循[远程浏览器授权](reference.zh.md#远程浏览器授权)说明。

### 3. 检查安装

```sh
dsh plugin --profile web exec dsh-codex-connect status --json
dsh plugin --profile web exec dsh-codex-connect doctor --json
```

`status --json` 在已登录时返回 `0`，未登录时返回 `1`，不会启动 OAuth。`doctor --json` 输出本地安装诊断，不发送网络请求，也不包含原始凭据。诊断通过不代表账户具有模型权限；实际可用性仍需通过真实请求验证。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/hero.jpg" alt="Codex Connect — 为 DeepSeek Harness 接入 ChatGPT OAuth" width="100%">
</p>

## 核心能力

- **账户：**在 DSH 主机上保存最多 16 个账户，手动选择后续请求使用的活动账户，不按会话绑定。请求保持已固定的账户，插件不会自动轮换或静默故障切换。每个已保存账户也会在模型选择器中作为独立路由出现——当前账户使用 `openai-codex`，其他账户使用 `openai-codex-2`、`openai-codex-3` 等——因此无需先切换账户即可直接选择其他已登录账户的模型。
- **模型与 GPT-6：**pi-ai 尚无 `gpt-6-astra` 时插件补充该模型并校准推理档位；已保存的 Off/Minimal 选择需要[明确更新](../MIGRATION.md#astra-reasoning-selections)。实时或官方缓存目录列出 `gpt-6-sol`、`gpt-6-luna` 时，两款模型会加入每个账户路由；如果配置了 `models` 白名单，还须把这些 ID 加进去才会出现在选择器。模型列出不等于可调用，权限与额度由 OpenAI 决定。
- **实时模型目录：**模型名称、上下文窗口、输出上限、推理档位和服务层级来自 `chatgpt.com`，缓存六小时。回退顺序为：实时读取、本插件位于 `$DSH_HOME` 的缓存、官方 CLI 缓存 `~/.codex/models_cache.json`（只读）、插件内置目录。任何一层失败都不会缩小或清空选择器。`contextWindowMode` 选择服务端默认值或其扩展上限，`modelCatalogClientVersion` 设置端点要求的版本校验值。详见[模型目录](reference.zh.md#模型目录)。 每个已保存账户独立维护目录及刷新有效期。模型从成功读取的目录中撤回后保留最后的元数据，并在读取凭据或发送推理请求之前本地拒绝；后续目录重新列出时恢复可用。
- **Fast Mode：**为单个对话请求优先服务，默认关闭。主账户和带数字后缀的 Codex 账户路由使用 GPT 模型时均显示开关；切换账户后仍保持当前对话的设置。实际速度和额度消耗取决于服务端，不保证固定提速倍数。
- **额度：**显示服务端返回的 `5h`、`7d` 窗口及重置时间，已登录时通常每 60 秒刷新一次。不虚构缺失窗口；Spark 使用独立额度桶。其他插件可通过 `codexQuota` 客户端服务读取同一批数据：该服务报告每个已登录账户——活动账户来自设置页轮询，其他已保存账户由 DSH 主机读取——因此仪表盘可以并排显示两个账户。
- **额度与用量卡片：**Codex Connect 管理侧栏额度卡片及详情对话框，保留紧凑布局、所有账户的额度窗口、重置时间和单元格下钻。账户余额明确为 **DeepSeek 平台余额**，含赠金与充值，不是 Codex credits。每日 Token 沿用此前由 Context 提供的 Codex 统计口径：按结算日期统计每个会话的已结算请求，合计输入、缓存读取、缓存写入和输出 Token。独立只读扫描包含归档与子会话、排除继承前缀并跳过活动的空白会话，不依赖 Context。这些数字覆盖本地会话的全部模型提供商，不是 Codex 账号账单；不会把额度百分比转换成 Token。扫描发生实际错误时显示简短提示，并可重新尝试。历史用量需要 DSH 主程序提供会话列表与已准备观察结果的会话和持久化来源标识；较旧的主程序会提示更新，不会显示未经验证的数字。本次不增加订阅到期或套餐状态面板。
- **本地用量：**「今日用量」与用量卡片读取每个会话自身记录的 `codexConnectUsage` 投影值——与会话列表同源、不额外轮询，也不依赖 Context 插件。该投影按 `localUsageTimeZone` 的日历、按每次已结算请求汇总输入、缓存读取、缓存写入和输出 Token，并保留最近 `localUsageRetainedDays` 个有数据的日期（默认 400 天）。未报告完整用量的请求只计入已知数值，因此总量可能不完整；缺失用量不会显示为已确认的零值。冷会话（未挂载的已存会话）由一次性预热补齐：客户端首次需要时触发 `POST /api/dsh-codex-connect/local-usage/backfill`，主机通过投影缓存的冷读阶梯读取每个日志一次、写入投影行后即返回；`POST /api/dsh-codex-connect/local-usage/status` 只报告状态、不启动任务。预热只处理 `localUsageRestMs` 分隔的已存会话，跳过活动会话（其自身即时折叠），并在结束后刷新会话列表。整轮只读一次、不写会话日志，也不写入其他插件的投影值。活动投影保留未完成工具调用 ID 的哈希及其是否为提问，不保留工具名称、参数或结果内容。增加 `localUsagePollMs` 可降低状态轮询频率。
- **管理中心：**设置 → Codex Connect 是独立的一级设置项，直接展示用量概览、账号管理、模型、能力和网络，不再套一层折叠卡。概览复用只读用量弹窗；侧栏小卡保持原有功能。同一个设置表单在切换页签时保留未保存草稿，仅在“保存”或“放弃修改”后处理。账号授权、默认账号切换、移除及连接测试是单独的即时操作；移除账号需要确认。模型预览按已保存账号读取，不切换默认账号，也不发送推理请求。全局模型显示范围和 Token 预算不会选择当前对话的模型。
- **模型传输：**默认仍使用 SSE。可在 profile 配置中选择 `transport: auto`，使用原生 WebSocket 优先／SSE 回退，每次请求建立独立连接；自定义设置卡片暂不提供传输控件。验收要求与清理限制见[模型传输](reference.zh.md#模型传输)。
- **插件更新：**检查 Codex Connect 新版本，不自动安装，也不建议更改 DSH。宿主兼容性信息通过主动运行的本地诊断查看。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/composer-capabilities.jpg" alt="DeepSeek Harness Composer 中的 Fast Mode 与额度控件" width="820">
</p>

## 可选能力

以下选项在新安装时全部关闭。请在 **设置 → Codex Connect** 或 **设置 → 模型 → Openai-Codex → 更多设置** 中编辑，再点击 **保存更改**。发生冲突或保存失败时会保留草稿。

| 能力 | 启用字段 | 重要行为 |
|---|---|---|
| 代理 | `enableProxy` | 不带凭据的 HTTP(S)，只作用于本插件流量。代理请求失败不会静默改走直连。 |
| Codex 搜索 | `enableSearch` | 将整个 profile 的搜索路由切换为 Codex；关闭后恢复之前的路由。 |
| 图片查看 | `enableImageTool` | 为视觉模型添加 `view_image`，读取本地文件和经过校验的公网 HTTP(S) 图片。 |
| GPT Image 图片生成与编辑 | `enableImageGeneration` | 显式生成，或编辑当前会话有权使用的图片；两种操作之间不会静默回退。 |
| 自动审查 | `enableAutoReview` | 将有界的审批上下文、工具参数、工作目录和待执行动作发送到 `chatgpt.com`，首次启用需要确认。失败时交还人工审批。 |

使用你当前 GPT 订阅计划提供的图片生成能力。生成原文件与附件预览分开保存；关闭能力或卸载插件不会删除这些文件。存储和访问规则见[配置与恢复](reference.zh.md#搜索与图片工具)。

自动审查在 Harness 策略判定需要审批后执行，不会绕过该策略。启用前请阅读[自动审查行为](auto-review.zh.md)。

## 模型体验

图片编辑添加有界、带版本的选择句柄，数据来自已记录的图片元数据。原有图片块顺序不变；非 Codex 工具结果和会话重放也保留句柄。显式编辑发送一个目标和最多四张参考图片，会增加请求输入大小；插件不推断 KV-cache 节省。

## 已知限制与暂缓工作

部署后仍需使用真实账号验收 OAuth、模型权限及图片编辑端点。插件不自动切换账号或重放请求。

## 常见问题与重要限制

### 凭据保存在哪里？

OAuth 凭据保存在运行 DSH 的主机上，由该主机用于向 OpenAI 认证和发起请求。正常浏览器账户响应只返回账户摘要，不返回原始 token。远程浏览器设备不一定是 DSH 主机。

### 卸载插件会退出登录吗？

不会。OAuth 状态单独保存在 `$DSH_HOME/.openai-codex-auth.json`（默认 `~/.dsh`），插件不会复制或修改 `~/.codex/auth.json`。只有确实要删除凭据时，才使用 **退出所有账户**，或在卸载前运行 `logout`。

### 可以给不同对话分别切换账户吗？

后续 Codex 请求使用所选活动账户，每个对话不会各自绑定账户。每个已保存账户也会作为独立的模型选择路由提供，且该路由在认证和 token 刷新期间始终使用自己的账户。Fast Mode 才是会话级设置。取消新的授权会保留已有账户；明确的刷新凭据撤销响应会提示重新授权，临时故障则保留账户供重试。详见[账户行为](reference.zh.md#账户模型与额度)。

### 为什么列表中的模型调用失败？

账户权限、插件与宿主兼容性、网络条件都会影响可用性。其他客户端可以使用，不代表此集成一定可用。OpenAI 控制模型权限、额度、上下文容量和服务行为；目录条目不是账户权限证明。

### 可以保留原来的 `dsh-codex` 插件吗？

不能在同一份有效配置中并存：两者都会注册 `openai-codex`。请遵循 [MIGRATION.md](../MIGRATION.md)，只移除已经确认冲突的条目，不删除凭据或无关提供方。

### 诊断能证明什么？

`doctor` 只做本地检查。能力与 reviewer 探针在满足前置条件时可能联网并消耗额度。`auto-review-probe` 只检查 reviewer 路由和结构化响应，不验证完整 Harness 审批集成，也不执行被审查的动作。命令、限制与退出码见[诊断参考](reference.zh.md#能力探针)。

[verified-compatibility.json](../verified-compatibility.json) 缺少某个 DSH/plugin 组合，只表示尚未验证，不表示已知不可运行。不要根据旧组合推断新版宿主支持情况。

## 文档与开发

- [安装与升级](../INSTALL.md)
- [配置、诊断与恢复](reference.zh.md)
- [从 `dsh-codex` 迁移](../MIGRATION.md)
- [架构与安全细节](design.zh.md)
- [自动审查行为](auto-review.zh.md)
- [发布运行手册](../RELEASING.md)、[贡献指南](../CONTRIBUTING.md)和[安全政策](../SECURITY.md)

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:browser
pnpm run check:dsh-install
```

`check` 包含静态检查、单元测试、构建、兼容性和打包检查。`lint:metadata` 检查包元数据与发布规则；`lint:source` 检查宿主与浏览器 TypeScript 中未处理或误用的 Promise、无效 await、重复 case 和不可达代码。浏览器回归与隔离 DSH 安装是另外两个命令。这些检查不使用真实 OAuth 授权，也不能替代真实账户验收。若不替换 `lib/client.js` 而测试隔离的客户端构建产物，请将 `DSH_CODEX_TEST_CLIENT` 设为其路径，再运行 `pnpm exec vitest run tests/usage-built-client.integration.spec.tsx`；未设置时该测试会跳过。

对于此本地 fork，请先安装本插件的开发工具，并构建目标 Host checkout。在本仓库运行 `pnpm run prepare:local-host <harness-checkout>`。命令会输出唯一且被忽略的 `.tmp` 目录，包含当前源码，并同时为运行时与类型链接该 Host 的包及已安装的第三方工具。在输出目录依次运行 `pnpm run typecheck`、`pnpm test`、`pnpm run build`、`pnpm run lint`、`pnpm run check:compatibility` 和 `pnpm run pack:check`。准备操作不会安装依赖、构建或修改 Host、覆盖本仓库的 `lib` 或 `ws-package-candidate`、修改 profile，也不验证 npm 发布版本。调查失败时请保留该目录及其中的 `local-host-validation.json`。开发基线固定为 npm DSH `0.2.2-rc.1`；本地 Host 验证还会检查 fork 的搜索选择扩展。元数据检查通过不代表已验证任一声明 npm 版本的真实账号兼容性。浏览器布局 fixture 包含固定版本的 Host 主题样式及其 MIT 声明，不依赖相邻的 Harness checkout。CI 会先构建提交 `5414d2bcfab351b228023d4abaccced341a4c33b` 的配套 Host，再准备相同的验证源码。准备快照前请保存全部源码修改和双语记录。

浏览器测试会加载 SDK 的原生客户端 UI 模块；Harness 提供给这些模块的库在本仓库中列为开发依赖。运行前，请用 `pnpm exec playwright install chromium --only-shell` 安装锁文件中 Playwright 所需的 Chromium 构建。

## 许可证与致谢

Codex Connect 的修改与新增工作 Copyright 2026 Frank Song。本项目包含派生自 [Yan-Zero/dsh-codex](https://github.com/Yan-Zero/dsh-codex) 的软件；上游内容继续保留 Copyright 2026 Yan-Zero。两部分均按 Apache-2.0 发布，详情见 [NOTICE](../NOTICE)。

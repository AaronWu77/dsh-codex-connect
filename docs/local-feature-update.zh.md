# 本地功能集成

[English](local-feature-update.md) | 中文

## 范围

此私有候选加入 Auto-review 本地检查、请求速度与推理默认值，以及图片预览持久化失败后的原图恢复。它保留定制 DSH rc.2 适配、PI-AI 1.4.0 请求与 Host alias、OAuth 源 0.84.4、按账号路由、动态模型目录、管理界面及 Sol 的 Off/Minimal 限制。它不是上游发布版，也不是直接替换正在运行插件的指令。

## 本地审核

Auto-review 仍须通过已有告知后启用。独立的 `autoReviewLocalPolicy` 默认是 `manual`：远端建议可以否决符合条件的动作，但远端 allow 本身不能授权。明确选择 `workspace-read` 或 `workspace-files` 才授予原工作区内对应的普通文件操作范围。Shell、递归搜索、敏感配置或凭据路径、歧义目标和无法确认的执行世界仍交 Host 人工链。当前执行目录不能扩大原授权范围。详见[自动审查](auto-review.zh.md)。

## 请求速度与推理强度

| 设置 | 可选值 | 含义 |
|---|---|---|
| `newSessionSpeedMode` | `standard`、`fast`、`ultrafast`、省略/null | 新主会话的默认请求档位。 |
| `newSubagentSpeedMode` | 同上 | 新普通子代理会话的独立默认值。 |
| `reasoningEffort` | `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`、省略/null | 仅在请求未显式指定强度时回退。 |

显式速度默认值优先于对应的旧版 Fast 布尔值。省略/null 的速度默认值沿用对应旧默认值；null 会屏蔽继承的速度偏好。已有或恢复会话不会重新应用启动默认值，Composer 手动命令优先于启动意图。不支持的推理档位会在认证和网络请求前失败；Sol 的 Off 和 Minimal 仍不可用。

Standard 移除插件的 priority/ultrafast 提示，Fast 请求 `priority`，Ultrafast 请求 `ultrafast`。Ultrafast 仅允许已注册、已登录的账号路由上的精确 `gpt-6-astra` 或 `gpt-6.1-sol`。账号资格、实际服务档位、速度和额度影响仍未知。拒绝不会触发插件新增的自动降档、提供方/账号切换或重放；Host 原有重试策略保持不变。

会话选择仅保存在当前插件实例内。模型/账号变化会令 Ultrafast 选择失效，须明确重选。达到有界容量时，待处理或已选择的 Ultrafast 意图会保留，冲突的准入可见失败，而不是静默变为 Standard。插件或服务重启会清除会话内选择；profile 默认值仍由 Host 设置保存。标题和压缩请求不继承会话付费档位。

## 没有预览时的已存原图

完整图片批次通过签名、大小和 Host 图片校验后才保存原图。若随后预览存储失败，成功的第 3 版结果仍保留需认证的原图下载、明确的预览降级提示，以及精确原图编辑引用。它不会为恢复预览再次生成图片。原生与 PTC 读取路径支持新结果，同时保留旧预览格式的读取。

此恢复只覆盖未取消调用的预览持久化失败。取消调用仍遵循当前 Host 的 ABORTED 规则，并可能删除已存原图；本轮没有实现取消恢复。进程崩溃或最终结果发布失败也不在恢复承诺内。缺失或无效原图绝不会被当作成功恢复。

## 应用候选

不要把候选依赖视图或构建库复制进运行中的进程。先审阅已记录源码差异，另行决定应用后再使用外部维护窗口。保留六插件 workspace 与现有依赖固定值；运行时 peer 显式声明当前 DSH fs-local 与 working-directory 服务为可选；fs-local 已有开发固定值，working-directory 增加对应开发声明。外部 fs-local peer 让本地执行检查与 Host 使用同一运行世界的类。重建插件 Host 和 Client 产物，再重启原 profile 并刷新现有 GUI。不要复用旧 PI-AI Apply 计划应用本次改动。

真实账号 Auto-review、Ultrafast 资格和真实图片生成仍须另行人工验收。无需密钥的测试、合成传输检查和源码审查不能证明这些服务端结果。

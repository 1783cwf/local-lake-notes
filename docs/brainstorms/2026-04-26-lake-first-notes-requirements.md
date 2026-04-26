---
date: 2026-04-26
topic: lake-first-notes
---

# Lake-first 本地笔记软件

## Problem Frame

目标是做一个以语雀 Lake 格式为核心的本地笔记软件，而不是继续做 Obsidian 插件。用户需要在桌面 App 中选择一个本地知识库目录，新建 `.lake` 文档，使用语雀编辑器进行富文本编辑，并把图片上传到自己的 S3 兼容 OSS。第一版面向个人使用，重点验证语雀编辑器作为本地笔记编辑器的可行性。

---

## Actors

- A1. 个人用户：创建、打开、编辑、保存 Lake 文档，并配置 OSS 上传能力。
- A2. 桌面 App：承载语雀编辑器，管理本地知识库目录、`.lake` 文件和资源上传流程。
- A3. S3 兼容 OSS：接收图片上传并返回可访问 URL。
- A4. 语雀编辑器：提供 Lake 文档编辑能力，并以 `text/lake` 作为主读写格式。

---

## Key Flows

- F1. 选择知识库目录
  - **Trigger:** 用户首次启动 App 或切换知识库。
  - **Actors:** A1, A2
  - **Steps:** 用户选择本地目录；App 记录当前知识库目录；App 展示该目录下的 `.lake` 文档列表；如果目录为空，用户可以直接新建文档。
  - **Outcome:** App 有一个可读写的当前知识库目录。
  - **Covered by:** R1, R2

- F2. 新建并编辑 Lake 文档
  - **Trigger:** 用户点击新建文档。
  - **Actors:** A1, A2, A4
  - **Steps:** App 创建新的 `.lake` 文件；打开 Lake 编辑视图；语雀编辑器加载空文档；用户编辑内容；App 自动保存或响应手动保存。
  - **Outcome:** `.lake` 文件持久化为最新 `text/lake` 内容。
  - **Covered by:** R3, R4, R5, R6

- F3. 图片上传到 OSS
  - **Trigger:** 用户在语雀编辑器中插入或粘贴图片。
  - **Actors:** A1, A2, A3, A4
  - **Steps:** 语雀编辑器触发图片上传配置；App 将图片上传到 S3 兼容 OSS 的图片目录；OSS 返回可访问 URL；App 将 URL、文件名、大小等信息返回给语雀编辑器。
  - **Outcome:** 文档中的图片引用指向 OSS URL，并可在编辑器中显示。
  - **Covered by:** R7, R8, R9

---

## Requirements

**Knowledge Base and Files**

- R1. App 必须允许用户选择一个本地目录作为知识库目录。
- R2. App 必须展示当前知识库目录中的 `.lake` 文档，并能打开已有 `.lake` 文档。
- R3. App 必须支持在当前知识库目录中新建 `.lake` 文档。
- R4. `.lake` 文件必须以语雀 `text/lake` 内容作为主存储格式。

**Editing and Saving**

- R5. App 必须使用本地打包的语雀编辑器资源提供 Lake 文档编辑能力，不依赖运行时 CDN。
- R6. App 必须支持自动保存和手动保存；保存时从语雀编辑器读取 `text/lake` 内容并写回当前 `.lake` 文件。

**Resource Upload**

- R7. App 必须支持配置 S3 兼容 OSS 的必要连接信息，用于图片上传。
- R8. 图片上传必须按资源类型目录存储，第一版至少支持图片目录。
- R9. 图片上传成功后，App 必须向语雀编辑器返回图片 URL、文件名和大小，使图片能在文档中继续编辑和预览。

**Interface and Visual Design**

- R10. App 第一版界面必须参考语雀编辑器工作台风格：左侧窄图标栏、知识库/文档树侧栏、中间编辑画布、右侧大纲区域。
- R11. App 顶部必须提供文档标题区域和语雀编辑器工具栏，使编辑体验接近语雀原生编辑页。
- R12. App 视觉风格必须以轻量、克制、白底、浅边框、绿色强调色为主，避免营销式首页、装饰性渐变和卡片堆叠。
- R13. 文档正文区域必须接近截图中的阅读/编辑体验：居中内容宽度、清晰大标题、舒适行高、右侧大纲不干扰正文。

**Export and Scope Support**

- R14. Markdown 和 HTML 不作为第一版默认存储格式；如果实现导出，只能作为显式手动动作，不影响 `.lake` 主文件。
- R15. 第一版不需要支持 Obsidian、原生 Markdown 反链、图谱或搜索索引。

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given 用户选择了一个包含 `.lake` 文件的目录，when App 打开该目录，then App 展示这些 `.lake` 文件并允许用户打开其中任意一个。
- AE2. **Covers R3, R4, R5, R6.** Given 用户点击新建文档，when 用户在语雀编辑器中输入内容并保存，then 知识库目录中出现一个 `.lake` 文件，文件内容来自 `editor.getDocument('text/lake')`。
- AE3. **Covers R7, R8, R9.** Given 用户已配置 S3 兼容 OSS，when 用户在编辑器中插入图片，then 图片上传到图片目录，文档中插入 OSS 返回的图片 URL，并能继续显示。
- AE4. **Covers R10, R11, R12, R13.** Given 用户打开 Lake 文档，when 编辑界面渲染完成，then 用户看到类似语雀的左侧导航、顶部工具栏、中间编辑画布和右侧大纲，而不是通用 Markdown 编辑器布局。

---

## Success Criteria

- 用户能完成一句话 MVP：选目录、新建 `.lake`、用语雀编辑器编辑保存、图片上传到 OSS。
- `.lake` 主格式能保留语雀编辑器能力，后续规划无需重新定义主存储方向。
- 下游实现计划可以直接围绕 Tauri App、Lake 文件读写、语雀编辑器集成和 OSS 图片上传拆任务。

---

## Scope Boundaries

### Deferred for later

- Markdown / HTML 导出命令。
- 附件、音频、视频上传。
- WebDAV 存储 provider。
- 全文搜索、标签、反链、图谱、索引。
- 多知识库管理、复杂配置迁移、公开发布插件或应用市场发布。
- Markdown 导入或从 Obsidian 迁移。

### Outside this product's identity

- 不做 Obsidian 插件。
- 不做 Markdown-first 笔记软件。
- 不做云端协作文档平台。
- 不做语雀 OpenAPI 客户端或语雀云同步工具。

---

## Key Decisions

- 独立 App 替代 Obsidian 插件：避免 Obsidian 文件类型、视图生命周期和插件沙箱限制。
- Tauri 作为桌面壳：Web 前端适合承载语雀编辑器，本地能力由桌面后端提供。
- 文件夹式知识库：用户数据透明，`.lake` 文件可备份、迁移和手动管理。
- `.lake` / `text/lake` 为主格式：优先保留语雀编辑器原生能力。
- 语雀编辑器资源本地打包：第一版不依赖 CDN，提高个人使用稳定性。
- UI 风格参考语雀原生编辑器页面：优先复刻工作台布局和文档编辑体验，而不是做通用笔记软件样式。
- 第一版个人使用优先：暂不按公开产品或插件市场标准扩展范围。

---

## Dependencies / Assumptions

- `yuque-developer-docs.md` 已确认语雀编辑器提供 `createOpenEditor`、`createOpenViewer`、`getDocument('text/lake')`、`setDocument('text/lake')` 等能力。
- `yuque-developer-docs.md` 已确认图片上传可通过编辑器配置接管，并返回 URL、文件名、大小等信息。
- 假设语雀编辑器资源允许本地打包进个人使用的桌面 App；授权和分发边界需要在规划或实现前确认。
- 假设 Tauri WebView 环境能加载并运行语雀编辑器本地资源；兼容性需要通过原型验证。
- 假设用户拥有可用的 S3 兼容 OSS 账号和公开访问 URL 配置。

---

## Outstanding Questions

### Resolve Before Planning

- 无。

### Deferred to Planning

- [Affects R5][Needs research] 语雀编辑器 JS/CSS 本地打包的具体来源、版本锁定方式和许可边界。
- [Affects R6][Technical] `.lake` 文件是否只保存原始 `text/lake` 字符串，还是需要包含轻量元数据包装。
- [Affects R7, R8, R9][Technical] S3 上传由前端直接完成还是通过 Tauri 后端命令完成。
- [Affects R5][Technical] Tauri WebView 中语雀编辑器的 CSP、资源路径、React 依赖和样式隔离处理方式。

---

## Next Steps

-> /ce-plan for structured implementation planning

# Local Lake Notes

Local Lake Notes 是一个基于 Tauri 的本地离线笔记应用原型，目标是在桌面端直接使用语雀 Lake 编辑器编辑 `.lake` 文档。当前版本以 Lake 原生格式为主，文档文件保存在用户选择的知识库目录中，应用配置、排序和文件存储设置等非文档数据保存在 SQLite 中。

## 当前能力

- 选择本地目录作为知识库。
- 支持多个本地知识库，在左侧知识库入口中切换、添加已有知识库，或在指定位置新建知识库目录。
- 新建 `.lake` 文档，并使用语雀 Lake 编辑器编辑和保存。
- 新建表格，并使用 Univer 开源 Sheets 在本地编辑和自动保存，支持 Excel `.xlsx` 导入导出。
- 新建多维表格，支持表格视图和多个看板视图共享同一份记录数据。
- 多维表格支持文本、单选、多选、数字、进度、附件、时间、URL 等字段类型，字段可新增、重命名、修改类型、删除。
- 多维表格时间字段支持日期、日期时间和纯时间三种格式，并按格式显示对应的日期/时间选择器。
- 多维表格单选和多选字段支持新增、编辑、删除选项；删除选项会同步清理记录中的旧值。
- 多维表格支持筛选、排序、搜索，并会随视图配置保存；看板视图支持按单选字段分组、配置卡片展示字段和拖拽调整记录分组。
- 多维表格记录详情支持附件上传下载、正文富文本编辑和正文全屏编辑。
- 支持知识库、目录、文档的层级展示。
- 支持在目录区域右键新建目录、文档、表格和多维表格，也支持右键重命名、删除目录或文档。
- 支持目录展开/收起，以及目录和文档重命名、删除，并可在同一知识库内任意拖拽排序或移动层级。
- 使用 Lake 编辑器内置大纲能力。
- 支持目录栏拖拽调整宽度，编辑区占满剩余空间。
- 支持图片和附件上传到文件存储，当前可选择 S3 兼容存储、本地目录或 WebDAV。
- 应用数据使用 SQLite 存储，并支持在设置页自定义数据库目录。
- 打包后的桌面应用支持通过菜单打开开发者工具，便于排查运行时错误。
- 兼容 Lake 编辑器的远程内置图片资源，并隔离编辑器挂载节点，避免切换或关闭文档时因第三方 DOM 销毁导致白屏。

## 技术栈

- 桌面壳：Tauri 2
- 前端：React 18、TypeScript、Vite
- 后端：Rust
- 本地数据库：SQLite，使用 `rusqlite`
- 编辑器：语雀 Lake 编辑器静态资源，位于 `public/vendor/lakex-doc`
- 表格编辑器：Univer 开源 Sheets，表格落盘为 Univer `IWorkbookData` workbook snapshot JSON
- 文件存储：AWS S3 SDK、本地文件系统、WebDAV

## 目录结构

```text
.
├── public/vendor/lakex-doc        # 语雀 Lake 编辑器资源
├── src                            # React 前端
│   ├── app                        # 应用控制器和状态类型
│   ├── components                 # 主界面组件
│   ├── features/lake-editor       # Lake 编辑器适配、上传、自动保存
│   ├── features/spreadsheet        # Univer 表格编辑、快照读写和 Excel 转换
│   ├── features/multidimensional-table # 多维表格字段、记录、表格视图和看板视图
│   ├── features/settings          # 文件存储、数据存储、备份和资源密钥设置
│   ├── features/workspace         # 知识库文档树模型
│   └── lib/tauri.ts               # 前端 Tauri 调用封装
├── src-tauri                      # Tauri/Rust 后端
│   ├── src/commands               # Tauri 命令
│   ├── src/storage                # SQLite、对象存储 provider、备份和资源加密实现
│   └── tests                      # Rust 集成测试
├── docs                           # 需求和计划文档
└── yuque-developer-docs.md        # 语雀开发者文档整理稿
```

## 数据存储

`.lake` 文档、Univer workbook snapshot JSON 表格和多维表格 JSON 保存在用户选择的知识库目录中，例如：

```text
/Users/you/Notes/
├── 工作/
│   ├── 需求分析.lake
│   ├── 预算.json
│   └── 上线记录.dbtable.json
└── 个人/
    └── 读书笔记.lake
```

说明：单个表格文档可通过顶部菜单导入或导出 `.xlsx`；知识库 ZIP 导出会把表格转换为可编辑的 Excel 文件。多维表格使用 `.dbtable.json` 保存 record-based schema，知识库 ZIP 导出会保留原始 `.dbtable.json` 文件，避免错误转换为 Markdown 或 Excel。

应用自身数据保存在 SQLite 中，不再写入知识库目录：

- 最近打开的知识库路径
- 已知知识库列表
- 目录和文档排序
- 文件存储设置
- 备份和资源密钥的非敏感元数据

开发环境固定使用仓库内的 SQLite 文件，方便反复调试时复用同一份应用数据：

```text
src-tauri/dev-data/yuque-lake-notes.sqlite3
```

该目录已加入 `.gitignore`，不会被提交。

打包后的应用使用 Tauri 的应用本地数据目录，数据跟随应用标识保存。macOS 下通常位于：

```text
~/Library/Application Support/com.weistuday.yuque.lake-notes/yuque-lake-notes.sqlite3
```

说明：SQLite 不写入 `.app` 包体内部。macOS 应用包在安装、签名和升级时不适合承载可变数据，实际可写数据应放在应用数据目录中。

说明：当前应用标识仍保留为 `com.weistuday.yuque.lake-notes`，用于兼容已有本地配置和 SQLite 数据目录。

可以在 **设置 -> 数据存储** 中自定义 SQLite 数据库目录。应用会在所选目录下使用固定文件名：

```text
yuque-lake-notes.sqlite3
```

切换到一个没有数据库文件的空目录时，应用会把当前数据库复制过去再切换；如果目标目录已经存在 `yuque-lake-notes.sqlite3`，则直接切换使用该数据库。

数据库目录配置不会写入 SQLite 自身，而是保存到应用配置目录中的独立文件：

```text
database-location.json
```

这样应用启动时可以先定位数据库，再读取 SQLite 中的应用数据。

旧版本产生的 `workspace.json`、`oss-settings.json`、`.yuque-lake-notes/order.json` 会在读取时迁移到 SQLite。

## 环境要求

- Node.js 20 或更高版本
- npm
- Rust stable
- macOS 构建需要 Xcode Command Line Tools

检查环境：

```bash
node -v
npm -v
rustc --version
cargo --version
```

## 安装依赖

```bash
cd /Users/weifeng/code/OpenSource/yuque
npm install
```

## 本地开发

启动桌面应用开发模式：

```bash
npm run tauri dev
```

该命令会自动启动 Vite 开发服务：

```bash
npm run dev
```

默认前端地址：

```text
http://127.0.0.1:1420
```

说明：直接在浏览器打开 Vite 页面时会使用浏览器 fallback 存储；完整的文件系统、SQLite、OSS 上传能力需要在 Tauri 桌面窗口中验证。

开发模式和打包后的桌面应用都可以通过菜单 **View -> 打开开发者工具** 打开 DevTools，也可以使用快捷键 `CmdOrCtrl+Alt+I`。

开发模式下反复运行 `npm run tauri dev` 默认会复用同一个数据库：

```text
src-tauri/dev-data/yuque-lake-notes.sqlite3
```

如果在设置页修改了数据库目录，后续开发模式也会优先使用自定义目录。

## 本地验证流程

建议使用一个空目录验证，避免影响真实笔记：

```bash
mkdir -p /tmp/yuque-lake-test
npm run tauri dev
```

在应用中验证：

1. 选择 `/tmp/yuque-lake-test` 作为知识库。
2. 在左侧知识库入口中添加第二个临时目录，切换后确认目录树只显示当前知识库内容。
3. 在左侧知识库入口中新建一个知识库，确认应用会在所选父目录下创建目录并自动激活。
4. 从知识库列表移除当前知识库，确认只从列表遗忘，不删除本地目录。
5. 新建目录、`.lake` 文档、表格和多维表格。
6. 编辑文档内容并观察自动保存状态。
7. 新建多个标题，确认 Lake 编辑器内置大纲正常显示。
8. 切换或关闭 Lake 文档，确认不会出现白屏。
9. 右键目录区域，确认可以新建目录、文档、表格和多维表格；右键目录或文档，确认可以重命名和删除。
10. 重命名目录、文档和知识库。
11. 保存并重新打开表格，确认表格内容仍能通过 Univer 正常加载；导入和导出 `.xlsx`，确认内容可读。
12. 打开多维表格，确认可以在表格视图新增记录、编辑字段、修改字段类型、管理单选/多选选项、上传下载附件。
13. 修改多维表格时间字段格式，确认日期格式只显示日历，日期时间格式显示日历和时分，纯时间格式只显示时分。
14. 在多维表格看板视图新增看板、重命名/删除看板、切换分组字段、配置卡片字段展示、拖拽记录到其他分组。
15. 在多维表格中配置筛选、排序和搜索，切换视图或重新打开后确认筛选配置仍生效。
16. 打开多维表格记录详情，编辑正文并进入全屏正文编辑，确认内容自动保存。
17. 导出知识库 ZIP，确认 `.lake` 文档、表格 `.xlsx` 和多维表格 `.dbtable.json` 都在导出包中。
18. 删除测试目录、测试文档、测试表格或测试多维表格。
19. 拖拽目录、文档、表格或多维表格到同级前后、目录内部和根目录末尾，确认侧边栏顺序、磁盘路径和重启后的排序保持一致。
20. 拖动目录栏边界，确认目录宽度可调且编辑区占满剩余空间。
21. 在设置页的数据存储中选择一个临时数据库目录，保存后重启应用，确认最近知识库、已知知识库列表和排序仍正常。
22. 配置文件存储后上传图片和附件，确认文档或多维表格记录中可以预览、下载。
23. 切换为本地文件存储，选择临时目录后上传图片和附件，确认目录内生成资源对象，重启后仍可预览和下载。
24. 在设置页文件存储中执行资源迁移 dry-run，确认能看到待迁移资源、涉及文档、不可读资源和冲突统计。

## 测试

前端测试：

```bash
npm run test:run
```

Rust 测试：

```bash
cd src-tauri
cargo test
```

完整验证建议：

```bash
npm run build
npm run test:run
cd src-tauri && cargo test
```

## 构建前端

```bash
npm run build
```

该命令会执行 TypeScript 检查并生成 Vite 静态产物到 `dist/`。

## 打包桌面应用

本项目使用 GitHub Actions 原生 runner 分别构建 macOS、Windows 和 Linux 安装包。不要在 macOS 本机直接交叉编译所有系统的安装包，Tauri 的安装包生成依赖各平台原生工具链。

固定发版流程：

1. 在功能分支完成版本号、README 和代码修改，至少执行 `npm run build`、`npm run test:run`、`cd src-tauri && cargo test`。
2. 提交功能分支并推送远程，先合并到 `devlop`，确认 `devlop` 已包含本次全部变更。
3. 从最新 `devlop` 拉出 `release/vX.Y.Z` 分支并推送远程，作为本次发布候选分支。
4. 从 `release/vX.Y.Z` 创建合并到 `main` 的 PR，必须通过 GitHub 合并请求完成，禁止本地直接 merge 后 push 到 `main`。
5. PR 合并后切换到最新 `main`，确认 `main` 的 `HEAD` 等于 `origin/main` 的发布合并提交。
6. 只在 `main` 的发布合并提交上创建版本 tag，禁止直接在功能分支、`devlop` 或 release 分支 tag 发布。
7. 推送 tag 后创建 GitHub Release，确认 Release 指向 `main` 的发布合并提交。
8. Release 名称只使用版本号，例如 `v1.7.0`，不要使用应用名加版本号。
9. Release notes 只描述当前版本相对上一版本的变化，不要把上一版本完整说明复制到本次 Release 中。
10. 发布完成后确认 Release assets 已上传，Release 名称、Release notes、版本号和 tag 都一致。

示例：

```bash
git switch main
git pull --ff-only origin main
git tag v1.7.0
git push origin v1.7.0
```

Release notes 格式：

```text
v1.4.0

从 v1.3.0 到 v1.4.0 的主要变化：

- 新增或优化的能力。
- 修复的问题。
- 文档、版本号和构建配置更新。

验证：

- npm run build
- npm run test:run
- cd src-tauri && cargo test
```

本次 Release notes 草稿：

```text
v1.7.4

从 v1.7.3 到 v1.7.4 的主要变化：

- 新增全局和文档级字体设置，优化看板展示，并支持标签分组与多维表格长文本高度持久化。
- 新增关闭当前标签、关闭其他标签操作，保留锁定标签并在关闭前处理未保存文档。
- 修复 HTML 导出代码块名称丢失问题；仅含图片时使用 Base64 单文件导出，包含附件时生成带资源目录的 zip。
- 文档内图片和导出的 HTML 支持放大、缩小、复位与快捷关闭查看。
- 优化多图文档打开性能，使用并发加载、批量回填和本地预览缓存，避免附件预加载阻塞首屏。
- 新增图片体积优化设置，在尽量保持清晰度的前提下生成优化预览，并仅在上传结果更小时保存压缩图片。
- 修复 WebView 中表格剪贴板权限失败提示，补充兼容复制路径，并完善自动发版命令与本地数据清理。
- 更新 README 发版说明，并更新应用、Tauri 配置、Node 包和 Rust crate 版本号到 1.7.4。

验证：

- npm run build
- npm run test:run
- cd src-tauri && cargo test
- git diff --check
```

当前 GitHub Actions 会构建：

| 平台 | 架构 | 产物 |
| --- | --- | --- |
| macOS | arm64 | `.dmg` |
| macOS | x64 | `.dmg` |
| Windows | x64 | NSIS `.exe` |
| Windows | arm64 | NSIS `.exe` |
| Linux | x64 | `.deb`、`.rpm`、`.AppImage` |
| Linux | arm64 | `.deb`、`.rpm`、`.AppImage` |

本地只建议构建当前系统可原生打包的产物。

macOS `.dmg`：

```bash
npm run tauri -- build --bundles dmg --ci --no-sign
```

macOS 提示“已损坏，无法打开”的处理方式：

当前 Release 的 macOS `.dmg` 使用 `--no-sign` 构建，没有做 Developer ID 签名和 Apple 公证。从浏览器下载后，macOS Gatekeeper 可能会把应用标记为“已损坏”。如果确认安装包来自本项目 GitHub Release，可以先把应用拖到 `/Applications`，再执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Local Lake Notes.app"
```

如果应用还在下载目录，需要把路径替换为实际 `.app` 路径，例如：

```bash
xattr -dr com.apple.quarantine "$HOME/Downloads/Local Lake Notes.app"
```

根本解决方式是为 macOS Release 配置 Developer ID 签名和 Apple 公证，正式对外分发时不应继续使用 `--no-sign`。

Windows NSIS `.exe`：

```bash
npm run tauri -- build --bundles nsis --ci --no-sign
```

Linux `.deb`、`.rpm`、`.AppImage`：

```bash
npm run tauri -- build --bundles deb,rpm,appimage --ci --no-sign
```

本地当前平台快捷构建：

```bash
npm run build:current
```

macOS 产物通常位于：

```text
src-tauri/target/<target-triple>/release/bundle/dmg/
```

说明：

- `--no-sign` 只适合本地验证和内部测试。macOS 未签名/未公证的应用下载后可能被 Gatekeeper 提示“已损坏”或“无法打开”。
- Windows 未签名安装包可能触发 SmartScreen 风险提示。
- 正式对外分发需要配置 macOS Developer ID 签名、公证，以及 Windows 代码签名证书。

## 文件存储配置

当前图片、附件、短时导出临时对象和备份对象使用统一文件存储 provider。设置页可选择一个当前激活 provider，新上传资源和新备份会写入该 provider；已有文档中的 `yuque-resource://...` 会记录 provider/storageId，切换 provider 后仍能按原引用读取历史资源。

设置页可配置图片体积优化：默认保留原图；“清晰优先”将最长边限制为 2560，“体积优先”限制为 1920。已有资源只生成按策略缓存的优化预览，不会改写原图；新上传图片只在优化结果更小时保存优化版。

### S3 兼容存储

S3 provider 使用兼容 S3 协议的配置项：

- endpoint
- bucket
- region
- access key
- secret key
- public base URL（可选，只用于兼容旧公开链接或显式 CDN 场景）
- force path style
- image prefix
- file prefix
- 默认导出资源策略
- 签名链接默认/最大有效期

上传后的图片对象 key 会按年份和月份分目录保存，例如：

```text
images/2026/04/<uuid>.png
```

推荐把 bucket 保持为私有读写，不要配置公开只读 bucket policy。应用会把文档中的图片和附件保存为 `yuque-resource://...` 内部资源引用，编辑预览、附件下载、短时签名和导出资源读取都由 Tauri 后端通过 S3 凭据完成，前端不会持有 S3 secret。

### 本地和 WebDAV 存储

本地 provider 需要选择一个本地目录作为对象根目录，应用会把资源、备份和索引都保存为相对 object key，并拒绝 `..`、绝对路径等越界 key。

WebDAV provider 需要配置服务地址、用户名、密码、根路径和存储标识。`.lake` 和多维表格文档只保存 provider、storageId 和相对 object key，不会写入 WebDAV 完整 URL 或凭据。

使用 S3 或 WebDAV provider 上传图片和附件前，需要先在设置页配置本机资源加密密钥。新上传的远端资源会在 Tauri 后端使用本地密钥加密后再写入文件存储，provider 中的原始对象是密文，不能直接通过对象 URL 预览。密钥保存在本机应用 SQLite 数据库中，`.lake` 文档只保存 key fingerprint；如果换设备使用，需要后续导入对应资源密钥，否则旧加密资源无法解密。本地 provider 面向本机目录读写，不再额外执行资源级加解密。

导出资源有两种策略：

- 本地资源包：单篇 HTML 只有图片时直接导出单文件并把图片内嵌为 Base64，包含普通附件时才导出 zip，图片写入 `assets/`、附件写入 `attachments/`，并由 `index.html` 使用相对路径引用；无资源时仍直接导出 HTML。单篇 Markdown 默认直接导出，图片会尽量内嵌，包含附件时才导出为 zip。知识库整体导出仍会把资源放入 zip。适合长期留存和离线交付。
- 短时签名链接：仅 S3 provider 支持。导出文件中的资源链接会改写为带有效期的 S3 presigned URL，适合临时在线交付。加密资源不会直接签原始密文对象；应用会先解密并上传一份临时明文对象到 `tmp/exports/` 前缀，再对临时明文对象生成短时链接。有效期结束后需要重新导出，建议在对象存储侧给该前缀配置 lifecycle 清理规则。

### 资源迁移

设置页的文件存储面板提供资源迁移入口，用于把当前知识库中引用的资源从旧 provider 批量复制到当前激活 provider。

- Dry-run 会清点资源数量、涉及文档数量、总大小、不可读资源和目标冲突。
- 执行迁移会先复制并校验全部目标对象，再重写 `.lake` 文档和多维表格中的 resourceRef。
- 同一个 resourceRef 被多个文档引用时只复制一次。
- 迁移会按目标 provider 策略转换资源：目标为本地时写入可直接读取的资源对象，目标为 S3 或 WebDAV 时写入带 `enc` 和 `keyFingerprint` 的加密资源对象。
- 迁移完成后不会删除旧 provider 中的对象，旧对象清理需要单独确认。

## 后续方向

- 补充 `.lake` 与 HTML/Markdown 的导入能力。
- 增强多维表格视图能力，例如字段顺序、表格字段显示隐藏和更多视图类型。
- 支持多个存储 profile 列表和凭据统一管理。

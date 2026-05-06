# Local Lake Notes

Local Lake Notes 是一个基于 Tauri 的本地离线笔记应用原型，目标是在桌面端直接使用语雀 Lake 编辑器编辑 `.lake` 文档。当前版本以 Lake 原生格式为主，文档文件保存在用户选择的知识库目录中，应用配置、排序和 OSS 设置等非文档数据保存在 SQLite 中。

## 当前能力

- 选择本地目录作为知识库。
- 新建 `.lake` 文档，并使用语雀 Lake 编辑器编辑和保存。
- 新建表格，并使用 Univer 开源 Sheets 在本地编辑和自动保存。
- 支持知识库、目录、文档的层级展示。
- 支持目录展开/收起，以及目录和文档重命名、删除，并可在同一知识库内任意拖拽排序或移动层级。
- 使用 Lake 编辑器内置大纲能力。
- 支持目录栏拖拽调整宽度，编辑区占满剩余空间。
- 支持图片上传到兼容 S3 协议的 OSS。
- 应用数据使用 SQLite 存储，并支持在设置页自定义数据库目录。
- 打包后的桌面应用支持通过菜单打开开发者工具，便于排查运行时错误。

## 技术栈

- 桌面壳：Tauri 2
- 前端：React 18、TypeScript、Vite
- 后端：Rust
- 本地数据库：SQLite，使用 `rusqlite`
- 编辑器：语雀 Lake 编辑器静态资源，位于 `public/vendor/lakex-doc`
- 表格编辑器：Univer 开源 Sheets，表格落盘为 Univer `IWorkbookData` workbook snapshot JSON
- 对象存储：AWS S3 SDK，兼容 S3 协议的 OSS

## 目录结构

```text
.
├── public/vendor/lakex-doc        # 语雀 Lake 编辑器资源
├── src                            # React 前端
│   ├── app                        # 应用控制器和状态类型
│   ├── components                 # 主界面组件
│   ├── features/lake-editor       # Lake 编辑器适配、上传、自动保存
│   ├── features/spreadsheet        # Univer 表格编辑和快照读写
│   ├── features/settings          # OSS 设置
│   ├── features/workspace         # 知识库文档树模型
│   └── lib/tauri.ts               # 前端 Tauri 调用封装
├── src-tauri                      # Tauri/Rust 后端
│   ├── src/commands               # Tauri 命令
│   ├── src/storage                # SQLite 和 S3 存储实现
│   └── tests                      # Rust 集成测试
├── docs                           # 需求和计划文档
└── yuque-developer-docs.md        # 语雀开发者文档整理稿
```

## 数据存储

`.lake` 文档和 Univer workbook snapshot JSON 表格保存在用户选择的知识库目录中，例如：

```text
/Users/you/Notes/
├── 工作/
│   ├── 需求分析.lake
│   └── 预算.json
└── 个人/
    └── 读书笔记.lake
```

说明：知识库 Markdown ZIP 导出只导出 `.lake` 文档；表格会以 Univer 原生 `IWorkbookData` 快照 JSON 保留为知识库中的独立文件，并通过备份恢复链路处理。当前表格能力聚焦本地创建、编辑、读取和保存，不提供 XLSX 导入导出。

应用自身数据保存在 SQLite 中，不再写入知识库目录：

- 最近打开的知识库路径
- 目录和文档排序
- OSS 设置
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
2. 新建目录、`.lake` 文档和表格。
3. 编辑文档内容并观察自动保存状态。
4. 新建多个标题，确认 Lake 编辑器内置大纲正常显示。
5. 重命名目录、文档和知识库。
6. 保存并重新打开表格，确认表格内容仍能通过 Univer 正常加载。
7. 删除测试目录、测试文档或测试表格。
8. 拖拽目录、文档或表格到同级前后、目录内部和根目录末尾，确认侧边栏顺序、磁盘路径和重启后的排序保持一致。
9. 拖动目录栏边界，确认目录宽度可调且编辑区占满剩余空间。
10. 在设置页的数据存储中选择一个临时数据库目录，保存后重启应用，确认最近知识库和排序仍正常。
11. 配置 OSS 后上传图片，确认图片 URL 被插入到文档中。

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

手动触发完整发布构建：

1. 打开 GitHub 仓库的 Actions 页面。
2. 选择 `Release` workflow。
3. 点击 `Run workflow`。
4. 构建完成后在 workflow artifacts 中下载各平台安装包。

打 tag 时也会触发发布构建：

```bash
git tag v0.1.0
git push origin v0.1.0
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

## OSS 配置

当前图片和附件上传使用兼容 S3 协议的配置项：

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

上传图片和附件前，需要先在设置页配置本机资源加密密钥。新上传的资源会在 Tauri 后端使用本地密钥加密后再写入 OSS，存储桶中的原始对象是密文，不能直接通过对象 URL 预览。密钥只保存在本机系统钥匙串中，SQLite 和 `.lake` 文档只保存 key fingerprint；如果换设备使用，需要后续导入对应资源密钥，否则旧加密资源无法解密。

导出资源有两种策略：

- 本地资源包：单篇 HTML/Markdown 会导出为 zip，包含正文文件和 `assets/`、`attachments/` 资源目录；知识库整体导出也会把资源放入 zip。适合长期留存和离线交付。
- 短时签名链接：导出文件中的资源链接会改写为带有效期的 S3 presigned URL，适合临时在线交付。加密资源不会直接签原始密文对象；应用会先解密并上传一份临时明文对象到 `tmp/exports/` 前缀，再对临时明文对象生成短时链接。有效期结束后需要重新导出，建议在对象存储侧给该前缀配置 lifecycle 清理规则。

## 后续方向

- 支持多知识库列表和知识库排序。
- 支持 WebDAV 备份笔记和设置。
- 补充 `.lake` 与 HTML/Markdown 的导入能力。
- 增强拖拽能力，支持跨目录移动。
- 增加更完整的打包格式，例如 `.dmg`。

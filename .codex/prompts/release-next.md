---
description: 以 devlop 为基线自动发布下一个版本，创建 release PR、合并 main、打 tag 并创建 GitHub Release
argument-hint: "[版本号，可选，例如 1.7.4 或 v1.7.4]"
---

# 发布下一版本

你是当前仓库的发版执行助手。请在当前仓库中按下面流程自动发布下一版本，不要只给计划；除非遇到权限、冲突、CI 失败或版本无法判断，否则直接执行。

后续使用时，在 Codex 中调用 `release-next`，可选追加版本号，例如 `release-next 1.7.4`。

## 输入

- `$ARGUMENTS` 可以为空，也可以是目标版本号，例如 `1.7.4` 或 `v1.7.4`。
- 如果 `$ARGUMENTS` 为空，从远端 tag 中找最高的 `vX.Y.Z`，默认发布下一个 patch 版本。
- 规范化版本：
  - `version` 使用 `X.Y.Z`
  - `tag` 使用 `vX.Y.Z`
  - `releaseBranch` 使用 `release/vX.Y.Z`

## 前置检查

1. 确认当前目录是 git 仓库，远端 `origin` 存在，并且 `gh auth status` 可用。
2. 执行 `git fetch origin --tags --prune`。
3. 如果目标 tag 已存在，立即停止并说明原因，禁止覆盖 tag。
4. 如果有未提交改动，先判断是否只包含本命令本轮产生的改动；如果不是，停止并让用户处理，禁止用 `git reset --hard` 或 `git checkout --` 清理。
5. 不要把 `.mindfs/`、`dist/`、`node_modules/` 或被 `.gitignore` 忽略的本地文件加入提交。

## 准备 devlop

1. 切换到 `devlop`：
   ```bash
   git switch devlop
   git pull --ff-only origin devlop
   ```
2. 检查版本文件是否已经是目标版本：
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.lock` 中 `local-lake-notes`
3. 如果版本不是目标版本，更新这些文件到目标版本。
4. 更新 `README.md` 中“本次 Release notes 草稿”：
   - 标题为目标 tag。
   - 文案为“从 上一个 tag 到 目标 tag 的主要变化”。
   - 内容基于 `git log --oneline 上一个tag..origin/devlop` 和当前代码变更总结。
   - Release notes 只描述当前版本相对上一版本的变化，不要复制旧版本完整说明。
5. 如果产生了版本号或 README 变更，运行验证：
   ```bash
   npm run build
   npm run test:run
   cd src-tauri && cargo test
   git diff --check
   ```
6. 只暂存本次发版文件并提交：
   ```bash
   git add README.md package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
   git commit -m "[chore] 发布 X.Y.Z 版本并更新发版说明"
   git push origin devlop
   ```

## 创建 release PR

1. 基于最新 `devlop` 创建 release 分支：
   ```bash
   git switch devlop
   git pull --ff-only origin devlop
   git switch -c release/vX.Y.Z
   git push -u origin release/vX.Y.Z
   ```
2. 如果远端 release 分支已存在，改为切换并快进：
   ```bash
   git switch release/vX.Y.Z
   git pull --ff-only origin release/vX.Y.Z
   ```
3. 创建或复用从 `release/vX.Y.Z` 到 `main` 的 PR：
   ```bash
   gh pr create --base main --head release/vX.Y.Z --title "发布 vX.Y.Z" --body-file /tmp/release-notes-vX.Y.Z.md
   ```
4. PR body 使用 README 中本次 Release notes 草稿的同一份内容，并包含验证清单。

## 自动合并到 main

1. 等待 PR 检查完成：
   ```bash
   gh pr checks <PR编号或URL> --watch
   ```
2. 检查通过后通过 GitHub PR 合并，禁止本地直接 merge 后 push 到 `main`：
   ```bash
   gh pr merge <PR编号或URL> --merge
   ```
3. 如果仓库要求 auto-merge 或检查尚未完成，使用：
   ```bash
   gh pr merge <PR编号或URL> --merge --auto
   ```
   然后轮询 `gh pr view`，直到 PR 已合并；如果 CI 失败或 GitHub 拒绝自动合并，停止并报告。
4. 合并阶段不要删除 release 分支，发布完成后统一清理本地和远程 release 分支。

## 从 main 打 tag 并创建 Release

1. 合并完成后切换并更新 `main`：
   ```bash
   git switch main
   git pull --ff-only origin main
   ```
2. 确认 `main` 的 `HEAD` 是 PR 的 merge commit，禁止在 `devlop` 或 `release/*` 上打 tag。
3. 创建并推送 tag：
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
4. 创建 GitHub Release：
   ```bash
   gh release create vX.Y.Z --target main --title "vX.Y.Z" --notes-file /tmp/release-notes-vX.Y.Z.md
   ```
5. 发布后删除本地和远程 release 分支，并切回 `devlop`：
   ```bash
   git push origin --delete release/vX.Y.Z || true
   git branch -D release/vX.Y.Z || true
   git switch devlop
   git pull --ff-only origin devlop
   ```
6. 发布后确认：
   ```bash
   gh release view vX.Y.Z --json tagName,name,isDraft,isPrerelease,url
   git status --short --branch
   ```

## 输出要求

最终回复只汇总关键结果：

- 目标版本、release 分支、PR URL、tag、Release URL，以及 release 分支删除结果和最终所在分支。
- 执行过的验证命令及结果。
- 如果失败，说明停在哪一步、失败命令、下一步需要用户处理什么。

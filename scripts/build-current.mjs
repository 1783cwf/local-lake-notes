#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const nativeTargets = {
  "darwin-arm64": {
    label: "macOS arm64 DMG",
    rustTarget: "aarch64-apple-darwin",
    bundles: "dmg",
  },
  "darwin-x64": {
    label: "macOS amd64 DMG",
    rustTarget: "x86_64-apple-darwin",
    bundles: "dmg",
  },
  "win32-arm64": {
    label: "Windows arm64 NSIS",
    rustTarget: "aarch64-pc-windows-msvc",
    bundles: "nsis",
  },
  "win32-x64": {
    label: "Windows amd64 NSIS",
    rustTarget: "x86_64-pc-windows-msvc",
    bundles: "nsis",
  },
  "linux-arm64": {
    label: "Linux arm64 DEB/RPM/AppImage",
    rustTarget: "aarch64-unknown-linux-gnu",
    bundles: "deb,rpm,appimage",
  },
  "linux-x64": {
    label: "Linux amd64 DEB/RPM/AppImage",
    rustTarget: "x86_64-unknown-linux-gnu",
    bundles: "deb,rpm,appimage",
  },
};

const scriptArgs = process.argv.slice(2);
const target = nativeTargets[`${process.platform}-${process.arch}`];
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const rustupMirror = selectRustupMirror(scriptArgs);
const rustupDistServer = rustupMirror.distServer;
const rustupUpdateRoot = rustupMirror.updateRoot;
const rustupDownloadTimeout = process.env.RUSTUP_DOWNLOAD_TIMEOUT || "600";
const dryRun = scriptArgs.includes("--dry-run");

if (!target) {
  console.error(`当前平台暂不支持本地原生打包：${process.platform}/${process.arch}`);
  console.error("跨平台包请使用 GitHub Actions release workflow 构建。");
  process.exit(1);
}

logHeader("当前架构构建目标");
console.log(`平台架构：${process.platform}/${process.arch}`);
console.log(`构建目标：${target.label}`);
console.log(`Rust target：${target.rustTarget}`);
console.log(`产物类型：${target.bundles}`);
console.log(`RUSTUP_DIST_SERVER=${rustupDistServer}`);
console.log(`RUSTUP_UPDATE_ROOT=${rustupUpdateRoot}`);

if (dryRun) {
  console.log("Dry run：只打印命令，不执行构建。");
}

logHeader("安装当前 Rust target");
if (run("rustup", ["target", "add", target.rustTarget]) !== 0) {
  console.error("\n安装 Rust target 失败。");
  process.exit(1);
}

logHeader(`构建 ${target.label}`);
const buildStatus = run(npmCommand, [
  "run",
  "tauri",
  "--",
  "build",
  "--target",
  target.rustTarget,
  "--bundles",
  target.bundles,
  "--ci",
  "--no-sign",
]);

if (buildStatus !== 0) {
  console.error(`\n构建失败：${target.label}`);
  process.exit(1);
}

logHeader("当前架构构建完成");
console.log(`产物目录：src-tauri/target/${target.rustTarget}/release/bundle`);

function selectRustupMirror(args) {
  const mirrorArg = args.find((arg) => arg.startsWith("--rustup-mirror="));
  const mirrorName = mirrorArg?.slice("--rustup-mirror=".length) || "tuna";
  const mirrors = {
    tuna: {
      distServer: "https://mirrors.tuna.tsinghua.edu.cn/rustup",
      updateRoot: "https://mirrors.tuna.tsinghua.edu.cn/rustup/rustup",
    },
    ustc: {
      distServer: "https://mirrors.ustc.edu.cn/rust-static",
      updateRoot: "https://mirrors.ustc.edu.cn/rust-static/rustup",
    },
  };
  const mirror = mirrors[mirrorName];

  if (!mirror) {
    console.error(`未知 Rustup 镜像：${mirrorName}`);
    console.error(`可用镜像：${Object.keys(mirrors).join(", ")}`);
    process.exit(1);
  }

  return mirror;
}

function logHeader(message) {
  console.log(`\n==> ${message}`);
}

function run(command, args) {
  if (dryRun) {
    console.log([command, ...args].join(" "));
    return 0;
  }

  // 构建脚本显式传入 rustup 镜像环境变量，避免本地或 CI 下载标准库时走默认源。
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUSTUP_DIST_SERVER: rustupDistServer,
      RUSTUP_UPDATE_ROOT: rustupUpdateRoot,
      RUSTUP_DOWNLOAD_TIMEOUT: rustupDownloadTimeout,
    },
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

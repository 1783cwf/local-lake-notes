#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const releaseTargets = [
  {
    id: "macos-arm64",
    label: "macOS arm64 DMG",
    platform: "darwin",
    arch: "arm64",
    rustTarget: "aarch64-apple-darwin",
    bundles: "dmg",
  },
  {
    id: "macos-amd64",
    label: "macOS amd64 DMG",
    platform: "darwin",
    arch: "x64",
    rustTarget: "x86_64-apple-darwin",
    bundles: "dmg",
  },
  {
    id: "windows-arm64",
    label: "Windows arm64 NSIS",
    platform: "win32",
    arch: "arm64",
    rustTarget: "aarch64-pc-windows-msvc",
    bundles: "nsis",
  },
  {
    id: "windows-amd64",
    label: "Windows amd64 NSIS",
    platform: "win32",
    arch: "x64",
    rustTarget: "x86_64-pc-windows-msvc",
    bundles: "nsis",
  },
  {
    id: "linux-arm64",
    label: "Linux arm64 DEB/RPM/AppImage",
    platform: "linux",
    arch: "arm64",
    rustTarget: "aarch64-unknown-linux-gnu",
    bundles: "deb,rpm,appimage",
  },
  {
    id: "linux-amd64",
    label: "Linux amd64 DEB/RPM/AppImage",
    platform: "linux",
    arch: "x64",
    rustTarget: "x86_64-unknown-linux-gnu",
    bundles: "deb,rpm,appimage",
  },
];

const scriptArgs = process.argv.slice(2);
const selectedTargets = selectTargets(scriptArgs);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const rustupMirror = selectRustupMirror(scriptArgs);
const rustupDistServer = process.env.RUSTUP_DIST_SERVER || rustupMirror.distServer;
const rustupUpdateRoot = process.env.RUSTUP_UPDATE_ROOT || rustupMirror.updateRoot;
const rustupDownloadTimeout = process.env.RUSTUP_DOWNLOAD_TIMEOUT || "600";
const dryRun = scriptArgs.includes("--dry-run");
const failures = [];

logHeader("Release build targets");
for (const target of selectedTargets) {
  console.log(`- ${target.label}: ${target.rustTarget}, bundles=${target.bundles}`);
}

logHeader("Install Rust targets");
console.log(`RUSTUP_DIST_SERVER=${rustupDistServer}`);
console.log(`RUSTUP_UPDATE_ROOT=${rustupUpdateRoot}`);
console.log(`RUSTUP_DOWNLOAD_TIMEOUT=${rustupDownloadTimeout}`);
if (dryRun) {
  console.log("Dry run: commands will be printed but not executed.");
}
if (run("rustup", ["target", "add", ...selectedTargets.map((target) => target.rustTarget)]) !== 0) {
  console.error("\nFailed to install required Rust targets.");
  process.exit(1);
}

for (const target of selectedTargets) {
  logHeader(`Build ${target.label}`);
  const status = run(npmCommand, [
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

  if (status === 0) {
    console.log(`\nDone: ${target.label}`);
    console.log(`Bundle output: src-tauri/target/${target.rustTarget}/release/bundle`);
  } else {
    failures.push(target);
    console.error(`\nFailed: ${target.label}`);
  }
}

if (failures.length > 0) {
  logHeader("Build failures");
  for (const target of failures) {
    console.error(`- ${target.label}: ${target.rustTarget}`);
  }
  process.exit(1);
}

logHeader("All release builds completed");

function selectTargets(args) {
  const targetArg = args.find((arg) => arg.startsWith("--targets="));
  if (!targetArg) {
    const targets = defaultTargetsForCurrentPlatform();
    if (targets.length === 0) {
      console.error(`No native release target for ${process.platform}/${process.arch}.`);
      console.error("Use --targets=<id> to select an explicit target, or use GitHub Actions for all platforms.");
      process.exit(1);
    }
    return targets;
  }

  const ids = targetArg
    .slice("--targets=".length)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const selected = ids.map((id) => {
    const target = releaseTargets.find((candidate) => candidate.id === id || candidate.rustTarget === id);
    if (!target) {
      console.error(`Unknown build target: ${id}`);
      process.exit(1);
    }
    return target;
  });

  return selected.length > 0 ? selected : releaseTargets;
}

function defaultTargetsForCurrentPlatform() {
  return releaseTargets.filter((target) => target.platform === process.platform && target.arch === process.arch);
}

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
    console.error(`Unknown Rustup mirror: ${mirrorName}`);
    console.error(`Available mirrors: ${Object.keys(mirrors).join(", ")}`);
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

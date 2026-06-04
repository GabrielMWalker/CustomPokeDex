import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipChecks = args.includes("--skip-checks");
const versionArg = args.find(arg => !arg.startsWith("--"));

const run = (command, commandArgs, options = {}) => {
  const display = [command, ...commandArgs].join(" ");
  if (dryRun) {
    console.log(`[dry-run] ${display}`);
    return "";
  }
  return execFileSync(command, commandArgs, {
    cwd: options.cwd || root,
    encoding: options.encoding || "utf8",
    stdio: options.stdio || "pipe"
  });
};

const capture = (command, commandArgs, options = {}) =>
  execFileSync(command, commandArgs, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: "pipe"
  });

const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const tauriConfig = readJson(path.join("src-tauri", "tauri.conf.json"));
const packageJson = readJson("package.json");
const version = String(tauriConfig.version || "").trim();
const packageVersion = String(packageJson.version || "").trim();
const requestedVersion = versionArg ? versionArg.replace(/^v/i, "") : version;
const tagName = `v${version}`;

if (!version) {
  throw new Error("Versao nao encontrada em src-tauri/tauri.conf.json.");
}

if (requestedVersion !== version) {
  throw new Error(`Versao solicitada ${requestedVersion} nao bate com src-tauri/tauri.conf.json (${version}).`);
}

if (packageVersion !== version) {
  throw new Error(`package.json (${packageVersion}) nao bate com src-tauri/tauri.conf.json (${version}).`);
}

const status = capture("git", ["status", "--porcelain"]).trim();
if (status) {
  const message = "A arvore Git tem mudancas pendentes. Faca commit antes de criar a release.";
  if (!dryRun) throw new Error(message);
  console.warn(`[dry-run] aviso: ${message}`);
}

const currentBranch = capture("git", ["branch", "--show-current"]).trim();
if (!currentBranch) {
  throw new Error("Nao consegui identificar a branch atual.");
}

const localTagExists = (() => {
  try {
    capture("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`]);
    return true;
  } catch {
    return false;
  }
})();

if (localTagExists) {
  const message = `A tag ${tagName} ja existe localmente.`;
  if (!dryRun) throw new Error(message);
  console.warn(`[dry-run] aviso: ${message}`);
}

const remoteTag = dryRun ? "" : run("git", ["ls-remote", "--tags", "origin", tagName]).trim();
if (remoteTag) {
  throw new Error(`A tag ${tagName} ja existe no origin.`);
}

if (!skipChecks) {
  run(process.execPath, ["--check", path.join("src", "scripts", "app.js")], { stdio: "inherit" });
  run(process.execPath, ["--check", path.join("src", "scripts", "app-utils.js")], { stdio: "inherit" });
  run(process.execPath, ["--check", path.join("scripts", "generate-latest-json.mjs")], { stdio: "inherit" });
  run(process.execPath, ["--check", path.join("scripts", "release-github.mjs")], { stdio: "inherit" });
  run("cargo", ["check"], { cwd: path.join(root, "src-tauri"), stdio: "inherit" });
}

run("git", ["push", "origin", currentBranch], { stdio: "inherit" });
run("git", ["tag", "-a", tagName, "-m", `Release ${tagName}`], { stdio: "inherit" });
run("git", ["push", "origin", tagName], { stdio: "inherit" });

console.log(dryRun
  ? `Dry-run da release ${tagName} concluido. Nenhuma tag foi criada ou enviada.`
  : `Release ${tagName} disparada. Acompanhe o GitHub Actions para ver o build e os assets.`);

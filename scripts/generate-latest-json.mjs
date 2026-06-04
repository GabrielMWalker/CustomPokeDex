import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoOwner = "GabrielMWalker";
const repoName = "CustomPokeDex";
const root = process.cwd();
const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
const version = tauriConfig.version;
const nsisDir = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
const setupName = `Pixelmon - Pokelist_${version}_x64-setup.exe`;
const releaseSetupName = setupName.replace(/\s+/g, ".");
const setupPath = path.join(nsisDir, setupName);
const signaturePath = `${setupPath}.sig`;
const privateKeyPath = path.join(root, ".tauri", "pixelmon-pokelist.key");

if (!fs.existsSync(setupPath)) {
  throw new Error(`Installer nao encontrado: ${setupPath}`);
}

if (!fs.existsSync(privateKeyPath)) {
  throw new Error(`Chave privada nao encontrada: ${privateKeyPath}`);
}

const quote = value => `"${String(value).replace(/"/g, '\\"')}"`;
execSync(
  `npx.cmd tauri signer sign --private-key-path ${quote(privateKeyPath)} --password "" ${quote(setupPath)}`,
  { stdio: "inherit" }
);

const latest = {
  version,
  notes: `Pixelmon - Pokelist ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: fs.readFileSync(signaturePath, "utf8").trim(),
      url: `https://github.com/${repoOwner}/${repoName}/releases/latest/download/${encodeURIComponent(releaseSetupName)}`
    }
  }
};

const outputPath = path.join(nsisDir, "latest.json");
fs.writeFileSync(outputPath, `${JSON.stringify(latest, null, 2)}\n`);
console.log(`latest.json gerado em: ${outputPath}`);

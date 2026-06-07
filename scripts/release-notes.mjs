import { execFileSync } from "node:child_process";

const captureGit = (args, cwd = process.cwd()) => {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: "pipe"
    }).trim();
  } catch {
    return "";
  }
};

export function getPreviousVersionTag(currentTag, cwd = process.cwd()) {
  return captureGit(["tag", "--list", "v[0-9]*", "--sort=-version:refname"], cwd)
    .split(/\r?\n/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .find(tag => tag !== currentTag) || "";
}

export function getReleaseCommitSubjects(currentTag, cwd = process.cwd()) {
  const previousTag = getPreviousVersionTag(currentTag, cwd);
  const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
  const output = captureGit(["log", "--no-merges", "--pretty=format:%s", range], cwd);
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

export function formatReleaseNotes({ version, tagName = `v${version}`, cwd = process.cwd() }) {
  const commits = getReleaseCommitSubjects(tagName, cwd);
  const lines = [
    `Pixelmon - Pokelist ${tagName}`,
    "",
    "Mudancas nesta versao:"
  ];

  if (commits.length) {
    commits.slice(0, 12).forEach(subject => lines.push(`- ${subject}`));
    if (commits.length > 12) lines.push(`- Mais ${commits.length - 12} mudanca(s) no historico da versao.`);
  } else {
    lines.push("- Ajustes e correcoes do app.");
  }

  lines.push("", "Validacao:");
  lines.push("- Checks locais rodam antes da tag pelo script de release.");
  lines.push("- O GitHub Actions gera o instalador, assinatura e latest.json.");

  return `${lines.join("\n")}\n`;
}

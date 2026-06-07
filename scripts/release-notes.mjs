import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

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

export function getReleaseCommits(currentTag, cwd = process.cwd()) {
  const previousTag = getPreviousVersionTag(currentTag, cwd);
  const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
  const output = captureGit(["log", "--no-merges", "--pretty=format:%s%x1f%b%x1e", range], cwd);
  return output
    .split("\x1e")
    .map(chunk => {
      const [subject = "", body = ""] = chunk.split("\x1f");
      return {
        subject: subject.trim(),
        body: body
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.startsWith("- "))
          .map(line => line.replace(/^-+\s*/, "").trim())
          .filter(Boolean)
      };
    })
    .filter(commit => commit.subject);
}

export function formatReleaseNotes({ version, tagName = `v${version}`, cwd = process.cwd() }) {
  const commits = getReleaseCommits(tagName, cwd);
  const lines = [
    `Pixelmon - Pokelist ${tagName}`,
    "",
    "Mudancas nesta versao:"
  ];

  if (commits.length) {
    commits.slice(0, 12).forEach(commit => {
      lines.push(`- ${commit.subject}`);
      commit.body.slice(0, 4).forEach(detail => lines.push(`  - ${detail}`));
    });
    if (commits.length > 12) lines.push(`- Mais ${commits.length - 12} mudanca(s) no historico da versao.`);
  } else {
    lines.push("- Ajustes e correcoes do app.");
  }

  lines.push("", "Validacao:");
  lines.push("- Checks locais rodam antes da tag pelo script de release.");
  lines.push("- O GitHub Actions gera o instalador, assinatura e latest.json.");

  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tagName = process.argv[2] || process.env.GITHUB_REF_NAME || "";
  const version = (tagName || "0.0.0").replace(/^v/i, "");
  process.stdout.write(formatReleaseNotes({ version, tagName: tagName || `v${version}` }));
}

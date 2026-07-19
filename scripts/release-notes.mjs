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

function collectReleaseHighlights(commits) {
  const text = commits
    .flatMap(commit => [commit.subject, ...commit.body])
    .join("\n")
    .toLowerCase();
  const highlights = [];

  const add = (condition, line) => {
    if (condition && !highlights.includes(line)) highlights.push(line);
  };

  add(
    /\bcobbleverse\b|\bmodpack\b/.test(text),
    "Dados, guias e recursos visuais do COBBLEVERSE 1.7.31-CF foram ampliados."
  );
  add(
    /\bdrop\b|\bdrops\b|\bpasture\b/.test(text),
    "Nova consulta de drops com chance, quantidade, icones dos itens e compatibilidade com o Pasture."
  );
  add(
    /\bbait\b|\bbaits\b|\bberry\b|\bberries\b|\bcrossplant/.test(text),
    "Novas areas de Baits e Berries, incluindo perks e combinacoes de crossplanting."
  );
  add(
    /\bbreeding\b|\begg group\b|\begggroup\b/.test(text),
    "Breeding atualizado com verificacao de pares e filtros por Egg Group."
  );
  add(
    /\bginasio\b|\bginasios\b|\bgym\b|\bgyms\b/.test(text),
    "Guia dos 32 ginasios de Kanto, Johto, Hoenn e Sinnoh com equipes e progresso local."
  );
  add(
    /\bcollection\b|\bcolecao\b|\bcoleção\b|\bha\b|\bshiny\b/.test(text),
    "Nova area de colecao para acompanhar HA, Shiny e listas de Pokemon com mais praticidade."
  );
  add(
    /\bsftp\b|\bserver\b|\bservidor\b|\bplayer sync\b/.test(text),
    "Nova sincronizacao segura dos dados do jogador diretamente com o servidor configurado."
  );
  add(
    /\bbackup\b|\bmerge\b|\bmescl|\bentre pcs\b|\bmulti-pc\b/.test(text),
    "Novo fluxo para atualizar dados entre PCs sem substituir a base local."
  );
  add(
    /\bteam\b|\btimes\b|\bcounter\b|\bshield\b|\bescudo\b|\bbuild\b/.test(text),
    "Melhorias nos times, counters e consultas de cobertura para planejamento de batalhas."
  );
  add(
    /\blog\b|\btelemetry\b|\btelemetria\b|\breward\b|\brecompensa\b|\bganho\b/.test(text),
    "Monitoramento de logs mais completo para capturas, ganhos e recompensas do jogador."
  );
  add(
    /\bsom\b|\bsons\b|\baudio\b|\bnotifica|\balerta|\balerts?\b/.test(text),
    "Novas opcoes para personalizar os sons dos alertas de invasao, quiz e GTS."
  );
  add(
    /\bstatus base\b|\bstats\b|\bbase stats\b|\batributo/.test(text),
    "Descricoes dos Pokemon agora mostram status base para comparar atributos rapidamente."
  );
  add(
    /\bdata:\b|\bdados\b|\bgenerated pokemon\b|\bmethod\b|\bmetodo\b|\bmétodo\b|\bbiome\b|\bbioma\b|\bevolution\b|\bevolucao\b|\bevolução\b/.test(text),
    "Dados de Pokemon revisados com ajustes em metodos, biomas e evolucoes."
  );

  if (!highlights.length) {
    highlights.push("Melhorias gerais de usabilidade, estabilidade e dados do app.");
  }

  return highlights;
}

export function formatReleaseNotes({ version, tagName = `v${version}`, cwd = process.cwd() }) {
  const commits = getReleaseCommits(tagName, cwd);
  const lines = [
    `Cobbleverse Companion ${tagName}`,
    "",
    "Destaques desta versao:"
  ];

  collectReleaseHighlights(commits).forEach(highlight => lines.push(`- ${highlight}`));

  lines.push("", "Como atualizar:");
  lines.push("- Use Buscar atualizacoes dentro do app ou baixe o instalador desta release.");

  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tagName = process.argv[2] || process.env.GITHUB_REF_NAME || "";
  const version = (tagName || "0.0.0").replace(/^v/i, "");
  process.stdout.write(formatReleaseNotes({ version, tagName: tagName || `v${version}` }));
}

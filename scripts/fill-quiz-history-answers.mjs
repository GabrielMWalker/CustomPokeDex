import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const shouldWrite = process.argv.includes("--write");
const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const historyPath = path.join(
  appData,
  "com.gabrielmwalker.pixelmon-pokedex-checklist",
  "pokemon-quiz-history.json"
);

const canonical = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "");

const answerRules = [
  ["imune a veneno e no pode ser envenenado", "Immunity"],
  ["30 de chance de curar a condio de status de um aliado", "Healer"],
  ["efeitos das condies climticas so desativados", "Cloud Nine"],
  ["efeitos secundrios dos movimentos do pokemon tm chance dobrada", "Serene Grace"],
  ["movimentos de status efeitos usados ganham prioridade", "Prankster"],
  ["vive em bules antigos", "Sinistea"],
  ["manchas de pele no condutivas", "Flaaffy"],
  ["suas penas esto em sete cores", "Ho-Oh"],
  ["colorao muda de acordo com as estaes", "Deerling"],
  ["recombinao dos genes de mew", "Mewtwo"],
  ["explosion mind blown self destruct misty explosion", "Damp"],
  ["cauda deste lendrio", "Yveltal"],
  ["padro em sua barriga para intimidao", "Arbok"],
  ["fora centrfuga do concreto giratrio", "Conkeldurr"],
  ["karrablast esto juntos", "Shelmet"],
  ["mordido por shellder na cabea", "Slowking"],
  ["levanta os ouvidos e libera fora psquica", "Meowstic"],
  ["capacidade de criar ferro do nada", "Meltan"],
  ["trouxer emoes fortes perto deste pokmon", "Hatterene"],
  ["bola de puxo perigoso porque pode eletrocutar", "Voltorb"],
  ["concha em espiral cresceu demais", "Omastar"],
  ["machucasse seu orgulho", "Empoleon"],
  ["raios solares que absorve so processados", "Solrock"],
  ["come minrio de ferro", "Aron"],
  ["aflige os que esto sua volta com pesadelos", "Darkrai"],
  ["prolas negras para amplificar seu poder psquico", "Grumpig"],
  ["muito leal ajuda os treinadores", "Herdier"],
  ["dentes da frente de", "Bidoof"],
  ["antenas na cabea e na cauda", "Whiscash"],
  ["eletricidade dos pontos redondos", "Eelektrik"],
  ["colnias no topo das rvores", "Mankey"],
  ["sua pele comprida to confortvel", "Stoutland"],
  ["estrutura celular ento este pokmon muda", "Castform"],
  ["tempo flui quando o corao de", "Dialga"],
  ["olhos redondos e bonitos", "Jigglypuff"],
  ["videiras azuis crescem", "Tangela"],
  ["vrus aliengena", "Deoxys"],
  ["maior juba de fogo", "Pyroar"],
  ["1 2 de dano de movimentos que fazem contato", "Fluffy"],
  ["hp mximo ao ser atingido por ataques do tipo gua", "Water Absorb"],
  ["chance queimar o atacante", "Flame Body"],
  ["habitava praias h 300", "Kabuto"],
  ["sobrevive a ohko", "Sturdy"],
  ["crnios extremamente espessos", "Rampardos"],
  ["cauda em forma de um peixe pequeno", "Huntail"],
  ["greninja depois de nocautear", "Battle Bond"],
  ["assusta as pessoas no meio da noite", "Misdreavus"],
  ["calor sobe de sua juba", "Litleo"],
  ["normalmente lento para reagir", "Pawmot"],
  ["une foras com um tatsugiri", "Dondozo"],
  ["congelado no gelo por mais de 100", "Amaura"],
  ["guarda ossos desde que nasceu", "Marowak"],
  ["sandstorm hail e ataques baseados em p", "Overcoat"],
  ["conjunto de trs", "Combee"],
  ["relacionada a wailmer", "Cetoddle"],
  ["latir e correr atrs daqueles", "Growlithe"],
  ["ver tanto passado quanto futuro", "Xatu"],
  ["ncleo vermelho permanecer", "Staryu"],
  ["bandos com base na cor de suas penas", "Squawkabilly"],
  ["guas rasas para treinar as pernas", "Quaxwell"],
  ["apndices frontais", "Carracosta"],
  ["emanaes produzidas por pessoas", "Impidimp"],
  ["mergulha seu grande bico no mar", "Pelipper"],
  ["parece apenas uma pinha", "Pineco"],
  ["se h dois ou mais", "Unown"],
  ["final da era do gelo", "Mamoswine"],
  ["reconstituir toda a sua estrutura celular", "Ditto"],
  ["mesmos tipos do pokemon ganham um bnus maior", "Adaptability"],
  ["veneno de seus picos de cauda", "Wurmple"],
  ["ladres de tmulos", "Cofagrigus"],
  ["impede o opontente de trocar", "Arena Trap"],
  ["multi hit deste pokemon", "Skill Link"],
  ["poderosa metade inferior", "Dracozolt"],
  ["caudas de fogo brilham", "Charmeleon"]
].map(([pattern, answer]) => ({ pattern: canonical(pattern), answer }));

function findAnswer(question) {
  const key = canonical(question);
  return answerRules.find(rule => key.includes(rule.pattern))?.answer || "";
}

const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
const entries = Array.isArray(history.entries) ? history.entries : [];
let changed = 0;
const unresolved = [];

for (const entry of entries) {
  if (!entry || String(entry.answer || "").trim()) continue;
  const answer = findAnswer(entry.question);
  if (answer) {
    entry.answer = answer;
    changed += 1;
  } else {
    unresolved.push(entry.question);
  }
}

if (shouldWrite && changed) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${historyPath}.bak-${timestamp}`;
  fs.copyFileSync(historyPath, backupPath);
  history.updatedAt = String(Math.floor(Date.now() / 1000));
  fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  console.log(`Backup: ${backupPath}`);
}

console.log(`Total: ${entries.length}`);
console.log(`Preenchidas: ${changed}`);
console.log(`Pendentes restantes: ${unresolved.length}`);
if (unresolved.length) {
  console.log("Nao resolvidas:");
  unresolved.forEach(question => console.log(`- ${question}`));
}

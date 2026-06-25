import fs from "node:fs";
import vm from "node:vm";

const catalogSource = fs.readFileSync("src/pokemon-catalogo-data.js", "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(catalogSource, sandbox);

const catalog = sandbox.window.POKEMON_CATALOG || [];
const cachePath = "scripts/.pokemon-stats-cache.json";
const cache = fs.existsSync(cachePath)
  ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
  : {};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const statKeyMap = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe"
};

async function fetchPokemon(entry) {
  const key = String(entry.id);
  if (cache[key]) return cache[key];

  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${entry.id}`);
  if (!response.ok) {
    throw new Error(`PokeAPI ${response.status} for #${entry.id} ${entry.name}`);
  }
  const data = await response.json();
  const stats = {};
  data.stats.forEach(item => {
    const key = statKeyMap[item.stat?.name];
    if (key) stats[key] = Number(item.base_stat) || 0;
  });
  const record = {
    id: entry.id,
    name: entry.name,
    stats,
    total: Object.values(stats).reduce((sum, value) => sum + value, 0)
  };
  cache[key] = record;
  return record;
}

const results = [];
const concurrency = 10;
let index = 0;

async function worker() {
  while (index < catalog.length) {
    const entry = catalog[index++];
    const record = await fetchPokemon(entry);
    results.push(record);
    if (results.length % 50 === 0) {
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
      console.log(`Fetched ${results.length}/${catalog.length}`);
    }
    await sleep(20);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
results.sort((a, b) => a.id - b.id);
fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
fs.writeFileSync(
  "src/pokemon-stats-data.js",
  `window.POKEMON_STATS_DATA = ${JSON.stringify(results)};\n`,
  "utf8",
);
console.log(`Generated ${results.length} stat records`);

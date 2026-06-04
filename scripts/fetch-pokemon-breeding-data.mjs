import fs from "node:fs";
import vm from "node:vm";

const catalogSource = fs.readFileSync("src/pokemon-catalogo-data.js", "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(catalogSource, sandbox);

const catalog = sandbox.window.POKEMON_CATALOG || [];
const cachePath = "scripts/.pokemon-species-cache.json";
const cache = fs.existsSync(cachePath)
  ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
  : {};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSpecies(entry) {
  const key = String(entry.id);
  if (cache[key]) return cache[key];

  const response = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${entry.id}`);
  if (!response.ok) {
    throw new Error(`PokeAPI ${response.status} for #${entry.id} ${entry.name}`);
  }
  const data = await response.json();
  const record = {
    id: entry.id,
    name: entry.name,
    eggGroups: data.egg_groups.map(group => group.name),
    genderRate: data.gender_rate,
    hatchCycles: data.hatch_counter,
    isBaby: Boolean(data.is_baby),
    isLegendary: Boolean(data.is_legendary),
    isMythical: Boolean(data.is_mythical)
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
    const record = await fetchSpecies(entry);
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
  "src/pokemon-breeding-data.js",
  `window.POKEMON_BREEDING_DATA = ${JSON.stringify(results)};\n`,
  "utf8",
);
console.log(`Generated ${results.length} breeding records`);

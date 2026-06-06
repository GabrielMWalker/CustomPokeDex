import fs from "node:fs";
import vm from "node:vm";

const catalogSource = fs.readFileSync("src/pokemon-catalogo-data.js", "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(catalogSource, sandbox);

const catalog = sandbox.window.POKEMON_CATALOG || [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function formatAbilityName(name) {
  return String(name || "")
    .split("-")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchPokemon(entry) {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${entry.id}`);
  if (!response.ok) {
    throw new Error(`PokeAPI ${response.status} for #${entry.id} ${entry.name}`);
  }
  const data = await response.json();
  const abilities = data.abilities
    .sort((a, b) => a.slot - b.slot)
    .map(item => ({
      name: formatAbilityName(item.ability.name),
      isHidden: Boolean(item.is_hidden),
      slot: item.slot
    }));

  return {
    id: entry.id,
    name: entry.name,
    abilities,
    hiddenAbilities: abilities.filter(item => item.isHidden).map(item => item.name)
  };
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
      console.log(`Fetched ${results.length}/${catalog.length}`);
    }
    await sleep(20);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
results.sort((a, b) => a.id - b.id);
fs.writeFileSync(
  "src/pokemon-abilities-data.js",
  `window.POKEMON_ABILITIES_DATA = ${JSON.stringify(results)};\n`,
  "utf8",
);
console.log(`Generated ${results.length} ability records`);

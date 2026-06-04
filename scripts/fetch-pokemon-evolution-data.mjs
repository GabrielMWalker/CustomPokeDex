import fs from "node:fs";
import vm from "node:vm";

const catalogSource = fs.readFileSync("src/pokemon-catalogo-data.js", "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(catalogSource, sandbox);

const catalog = sandbox.window.POKEMON_CATALOG || [];
const catalogById = new Map(catalog.map(entry => [entry.id, entry]));
const speciesCachePath = "scripts/.pokemon-evolution-species-cache.json";
const chainCachePath = "scripts/.pokemon-evolution-chain-cache.json";
const speciesCache = fs.existsSync(speciesCachePath)
  ? JSON.parse(fs.readFileSync(speciesCachePath, "utf8"))
  : {};
const chainCache = fs.existsSync(chainCachePath)
  ? JSON.parse(fs.readFileSync(chainCachePath, "utf8"))
  : {};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const idFromUrl = url => Number(String(url).match(/\/(\d+)\/?$/)?.[1] || 0);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchSpecies(entry) {
  const key = String(entry.id);
  if (speciesCache[key]) return speciesCache[key];
  const data = await fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${entry.id}`);
  const record = {
    id: entry.id,
    name: entry.name,
    chainId: idFromUrl(data.evolution_chain.url),
  };
  speciesCache[key] = record;
  return record;
}

function readableRequirement(details = []) {
  if (!details.length) return "";
  const detail = details[0];
  if (detail.min_level) return `Lvl ${detail.min_level}`;
  if (detail.item?.name) return detail.item.name.replace(/-/g, " ");
  if (detail.trigger?.name) return detail.trigger.name.replace(/-/g, " ");
  if (detail.min_happiness) return `Happiness ${detail.min_happiness}`;
  if (detail.known_move?.name) return `Move ${detail.known_move.name.replace(/-/g, " ")}`;
  if (detail.location?.name) return detail.location.name.replace(/-/g, " ");
  return "";
}

function normalizeChainNode(node) {
  const id = idFromUrl(node.species.url);
  const catalogEntry = catalogById.get(id);
  return {
    id,
    name: catalogEntry?.name || node.species.name,
    requirement: readableRequirement(node.evolution_details),
    children: node.evolves_to.map(normalizeChainNode),
  };
}

async function fetchEvolutionChain(chainId) {
  const key = String(chainId);
  if (chainCache[key]) return chainCache[key];
  const data = await fetchJson(`https://pokeapi.co/api/v2/evolution-chain/${chainId}`);
  const record = {
    id: chainId,
    root: normalizeChainNode(data.chain),
  };
  chainCache[key] = record;
  return record;
}

const members = [];
let index = 0;
const concurrency = 10;

async function speciesWorker() {
  while (index < catalog.length) {
    const entry = catalog[index++];
    members.push(await fetchSpecies(entry));
    if (members.length % 50 === 0) {
      fs.writeFileSync(speciesCachePath, JSON.stringify(speciesCache, null, 2), "utf8");
      console.log(`Fetched species ${members.length}/${catalog.length}`);
    }
    await sleep(20);
  }
}

await Promise.all(Array.from({ length: concurrency }, speciesWorker));
members.sort((a, b) => a.id - b.id);
fs.writeFileSync(speciesCachePath, JSON.stringify(speciesCache, null, 2), "utf8");

const chainIds = [...new Set(members.map(member => member.chainId))].sort((a, b) => a - b);
const chains = [];
for (let i = 0; i < chainIds.length; i += 1) {
  chains.push(await fetchEvolutionChain(chainIds[i]));
  if ((i + 1) % 25 === 0) {
    fs.writeFileSync(chainCachePath, JSON.stringify(chainCache, null, 2), "utf8");
    console.log(`Fetched chains ${i + 1}/${chainIds.length}`);
  }
  await sleep(20);
}

chains.sort((a, b) => a.id - b.id);
fs.writeFileSync(chainCachePath, JSON.stringify(chainCache, null, 2), "utf8");
fs.writeFileSync(
  "src/pokemon-evolution-data.js",
  `window.POKEMON_EVOLUTION_DATA = ${JSON.stringify({ pokemon: members, chains })};\n`,
  "utf8",
);
console.log(`Generated ${members.length} evolution members and ${chains.length} chains`);

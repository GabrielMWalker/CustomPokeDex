import fs from "node:fs";
import path from "node:path";

const dataPath = path.resolve("src/cobbleverse-data.js");
const source = fs.readFileSync(dataPath, "utf8").trim();
const prefix = "window.COBBLEVERSE_DATA = ";

if (!source.startsWith(prefix)) throw new Error("Formato inesperado em cobbleverse-data.js");
const data = JSON.parse(source.slice(prefix.length).replace(/;$/, ""));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(data.metadata.modpackVersion === "1.7.31-CF", "Versao do modpack incorreta");
assert(data.metadata.cobblemonVersion === "1.7.3", "Versao do Cobblemon incorreta");
assert(data.pokemon.length === 1025, `Esperados 1025 Pokemon, recebidos ${data.pokemon.length}`);
assert(data.baits.length === 78, `Esperados 78 baits, recebidos ${data.baits.length}`);
assert(data.berries.length === 70, `Esperadas 70 berries, recebidas ${data.berries.length}`);
const mutations = data.berries.filter(berry => berry.source === "mutation" && berry.mutation);
assert(mutations.length === 40, `Esperadas 40 mutacoes, recebidas ${mutations.length}`);
assert(data.gyms.length === 32, `Esperados 32 ginasios, recebidos ${data.gyms.length}`);
assert(new Set(data.pokemon.map(pokemon => pokemon.dex)).size === 1025, "Numeros da Pokedex duplicados");
assert(data.pokemon.every(pokemon => Array.isArray(pokemon.spawns)), "Pokemon sem lista de spawns");
assert(data.pokemon.every(pokemon => Array.isArray(pokemon.drops)), "Pokemon sem lista de drops");
assert(data.gyms.every(gym => gym.team.length >= 4), "Ginasio sem equipe oficial completa");
assert(["kanto", "johto", "hoenn", "sinnoh"].every(region => data.gyms.filter(gym => gym.region.toLowerCase() === region).length === 8), "Cada regiao deve ter oito ginasios");

const summary = {
  pokemon: data.pokemon.length,
  spawns: data.pokemon.reduce((total, pokemon) => total + pokemon.spawns.length, 0),
  drops: data.pokemon.reduce((total, pokemon) => total + pokemon.drops.length, 0),
  baits: data.baits.length,
  berries: data.berries.length,
  mutations: mutations.length,
  gyms: data.gyms.length,
  gymPokemon: data.gyms.reduce((total, gym) => total + gym.team.length, 0),
};

console.log("Dados Cobbleverse validados:", summary);

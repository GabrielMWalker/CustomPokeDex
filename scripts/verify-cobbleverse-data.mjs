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
assert(data.moves && Object.keys(data.moves).length >= 900, `Base de golpes incompleta: ${Object.keys(data.moves || {}).length}`);
assert(new Set(data.pokemon.map(pokemon => pokemon.dex)).size === 1025, "Numeros da Pokedex duplicados");
assert(data.pokemon.every(pokemon => Array.isArray(pokemon.spawns)), "Pokemon sem lista de spawns");
assert(data.pokemon.every(pokemon => pokemon.spawns.every(spawn => spawn && typeof spawn === "object")), "Pokemon com spawn nulo ou invalido");
assert(data.pokemon.every(pokemon => Array.isArray(pokemon.drops)), "Pokemon sem lista de drops");
assert(data.pokemon.every(pokemon => Array.isArray(pokemon.acquisitionMethods)), "Pokemon sem lista de obtencoes especiais");
const typeNull = data.pokemon.find(pokemon => pokemon.id === "type: null");
const mewtwo = data.pokemon.find(pokemon => pokemon.id === "mewtwo");
assert(typeNull?.acquisitionMethods.some(method => method.items.includes("lumymon:fossilized_helmet")), "Revival do Type: Null nao encontrado");
assert(mewtwo?.acquisitionMethods.some(method => method.items.includes("lumymon:ancient_dna") && method.items.includes("lumymon:cloning_catalyst")), "Revival do Mewtwo nao encontrado");
assert(data.gyms.every(gym => gym.team.length >= 4), "Ginasio sem equipe oficial completa");
const moveId = value => String(value || "").split(":").pop().replace(/[^a-z0-9]+/gi, "").toLowerCase();
assert(data.gyms.every(gym => gym.team.every(member => (member.moveset || []).every(move => data.moves[moveId(move)]))), "Golpe de ginasio sem tipo/categoria na base do Showdown");
assert(data.gyms.every(gym => gym.locatorCostItem && gym.locatorBaseItem === "minecraft:map"), "Ginasio sem troca de mapa completa");
assert(data.gyms.every(gym => /^cobbleversebadges:.+_badge$/.test(gym.badgeItem)), "Ginasio sem insignia oficial");
assert(["kanto", "johto", "hoenn", "sinnoh"].every(region => data.gyms.filter(gym => gym.region.toLowerCase() === region).length === 8), "Cada regiao deve ter oito ginasios");
assert(Array.isArray(data.extraLocations) && data.extraLocations.length === 61, `Esperados 61 locais extras, recebidos ${data.extraLocations?.length}`);
assert(data.extraLocations.filter(location => location.category === "league").length === 4, "Esperadas quatro Ligas Pokemon");
assert(data.extraLocations.filter(location => location.category === "league").every(location => location.locatorCostItem && location.rewardItem), "Liga sem mapa ou trofeu oficial");
for (const structure of [
  "cobblemon:ruins/luna_henge_ruins",
  "cobblemon:ruins/sol_henge_ruins",
  "legendarymonuments:lake_verity",
  "legendarymonuments:stark_mountain",
  "legendarymonuments:eternatus_cocoon",
]) {
  assert(data.extraLocations.some(location => location.structure === structure), `Estrutura especial ausente: ${structure}`);
}

const summary = {
  pokemon: data.pokemon.length,
  spawns: data.pokemon.reduce((total, pokemon) => total + pokemon.spawns.length, 0),
  specialAcquisitions: data.pokemon.reduce((total, pokemon) => total + pokemon.acquisitionMethods.length, 0),
  drops: data.pokemon.reduce((total, pokemon) => total + pokemon.drops.length, 0),
  baits: data.baits.length,
  berries: data.berries.length,
  mutations: mutations.length,
  gyms: data.gyms.length,
  extraLocations: data.extraLocations.length,
  gymPokemon: data.gyms.reduce((total, gym) => total + gym.team.length, 0),
};

console.log("Dados Cobbleverse validados:", summary);

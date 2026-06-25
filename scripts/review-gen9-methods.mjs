import fs from "node:fs";
import vm from "node:vm";

const APPLY = process.argv.includes("--apply");
const generationArg = process.argv.find((arg) => arg.startsWith("--gen="))?.split("=")[1] || "9";
const GENERATION = Number.parseInt(generationArg, 10);
const GENERATION_RANGES = new Map([
  [1, [1, 151]],
  [2, [152, 251]],
  [3, [252, 386]],
  [4, [387, 493]],
  [5, [494, 649]],
  [6, [650, 721]],
  [7, [722, 809]],
  [8, [810, 905]],
  [9, [906, 1025]],
]);
if (!GENERATION_RANGES.has(GENERATION)) {
  throw new Error(`Geração não suportada: ${generationArg}`);
}
const [GENERATION_START, GENERATION_END] = GENERATION_RANGES.get(GENERATION);
const REPORT_PATH = `GEN${GENERATION}_METHOD_REVIEW.md`;
const DATA_FILES = [
  "src/pokemon-catalogo-data.js",
  "src/pokemon-evolution-data.js",
  "src/pokemon-metodos-data.js",
];

const context = { window: {} };
vm.createContext(context);
for (const file of DATA_FILES) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
}

const CATALOG = context.window.POKEMON_CATALOG || [];
const EVOLUTION_DATA = context.window.POKEMON_EVOLUTION_DATA;
const METHODS = context.window.POKEMON_SUPPLEMENTAL_METHODS || [];
const TARGET_POKEMON = CATALOG.filter((pokemon) => pokemon.id >= GENERATION_START && pokemon.id <= GENERATION_END);
const catalogByName = new Map(CATALOG.map((pokemon) => [pokemon.name, pokemon]));
const catalogNameSet = new Set(CATALOG.map((pokemon) => pokemon.name));
const LEGENDARY_SPAWNS_URL = "https://pixelmonmod.com/wiki/Legendary_Pokemon";

const specialPokemonNames = new Set([
  "Articuno",
  "Zapdos",
  "Moltres",
  "Mewtwo",
  "Mew",
  "Raikou",
  "Entei",
  "Suicune",
  "Lugia",
  "Ho-Oh",
  "Celebi",
  "Regirock",
  "Regice",
  "Registeel",
  "Latias",
  "Latios",
  "Kyogre",
  "Groudon",
  "Rayquaza",
  "Jirachi",
  "Deoxys",
  "Uxie",
  "Mesprit",
  "Azelf",
  "Dialga",
  "Palkia",
  "Heatran",
  "Regigigas",
  "Giratina",
  "Cresselia",
  "Phione",
  "Manaphy",
  "Darkrai",
  "Shaymin",
  "Arceus",
  "Victini",
  "Cobalion",
  "Terrakion",
  "Virizion",
  "Tornadus",
  "Thundurus",
  "Reshiram",
  "Zekrom",
  "Landorus",
  "Kyurem",
  "Keldeo",
  "Meloetta",
  "Genesect",
  "Xerneas",
  "Yveltal",
  "Zygarde",
  "Diancie",
  "Hoopa",
  "Volcanion",
  "Type: Null",
  "Tapu Koko",
  "Tapu Lele",
  "Tapu Bulu",
  "Tapu Fini",
  "Cosmog",
  "Necrozma",
  "Nihilego",
  "Buzzwole",
  "Pheromosa",
  "Xurkitree",
  "Celesteela",
  "Kartana",
  "Guzzlord",
  "Poipole",
  "Stakataka",
  "Blacephalon",
  "Magearna",
  "Marshadow",
  "Zeraora",
  "Zacian",
  "Zamazenta",
  "Eternatus",
  "Kubfu",
  "Zarude",
  "Regieleki",
  "Regidrago",
  "Glastrier",
  "Spectrier",
  "Calyrex",
  "Enamorus",
  "Wo-Chien",
  "Chien-Pao",
  "Ting-Lu",
  "Chi-Yu",
  "Koraidon",
  "Miraidon",
  "Okidogi",
  "Munkidori",
  "Fezandipiti",
  "Ogerpon",
  "Terapagos",
  "Pecharunt",
]);

const ultraBeastPokemonNames = new Set([
  "Nihilego",
  "Buzzwole",
  "Pheromosa",
  "Xurkitree",
  "Celesteela",
  "Kartana",
  "Guzzlord",
  "Poipole",
  "Naganadel",
  "Stakataka",
  "Blacephalon",
]);

const paradoxPokemonNames = new Set([
  "Great Tusk",
  "Scream Tail",
  "Brute Bonnet",
  "Flutter Mane",
  "Slither Wing",
  "Sandy Shocks",
  "Iron Treads",
  "Iron Bundle",
  "Iron Hands",
  "Iron Jugulis",
  "Iron Moth",
  "Iron Thorns",
  "Roaring Moon",
  "Iron Valiant",
  "Koraidon",
  "Miraidon",
  "Walking Wake",
  "Iron Leaves",
  "Gouging Fire",
  "Raging Bolt",
  "Iron Boulder",
  "Iron Crown",
]);

const serverDimensionOverrides = new Map([
  ...[...ultraBeastPokemonNames].map((name) => [name, {
    category: "Lend\u00e1rios, m\u00edticos e especiais",
    detail: "Biomas: Dimens\u00e3o Ultra (Any)",
    evidence: "Configura\u00e7\u00e3o do servidor: Ultra Beasts spawnam na Dimens\u00e3o Ultra.",
  }]),
  ...[...paradoxPokemonNames].map((name) => [name, {
    category: "Encontrar ou capturar",
    detail: "Biomas: Dimens\u00e3o Paradox (Any)",
    evidence: "Configura\u00e7\u00e3o do servidor: Pok\u00e9mon Paradox spawnam na Dimens\u00e3o Paradox.",
  }]),
]);

const evoOverrides = new Map([
  ["Kadabra->Alakazam", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Kadabra.",
    requirement: "trade",
  }],
  ["Machoke->Machamp", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Machoke.",
    requirement: "trade",
  }],
  ["Graveler->Golem", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Graveler.",
    requirement: "trade",
  }],
  ["Haunter->Gengar", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Haunter.",
    requirement: "trade",
  }],
  ["Golbat->Crobat", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Golbat com felicidade alta.",
    requirement: "felicidade alta",
  }],
  ["Togepi->Togetic", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Togepi com felicidade alta.",
    requirement: "felicidade alta",
  }],
  ["Poliwhirl->Politoed", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Poliwhirl enquanto segura King's Rock.",
    requirement: "troca com King's Rock",
  }],
  ["Eevee->Espeon", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Eevee durante o dia com felicidade alta.",
    requirement: "felicidade alta de dia",
  }],
  ["Eevee->Umbreon", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Eevee durante a noite com felicidade alta.",
    requirement: "felicidade alta \u00e0 noite",
  }],
  ["Slowpoke->Slowking", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Slowpoke enquanto segura King's Rock.",
    requirement: "troca com King's Rock",
  }],
  ["Onix->Steelix", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Onix enquanto segura Metal Coat.",
    requirement: "troca com Metal Coat",
  }],
  ["Scyther->Scizor", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Scyther enquanto segura Metal Coat.",
    requirement: "troca com Metal Coat",
  }],
  ["Seadra->Kingdra", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Seadra enquanto segura Dragon Scale.",
    requirement: "troca com Dragon Scale",
  }],
  ["Porygon->Porygon2", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Porygon enquanto segura Up-Grade.",
    requirement: "troca com Up-Grade",
  }],
  ["Tyrogue->Hitmontop", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Evoluir Tyrogue at\u00e9 o n\u00edvel 20 com Attack e Defense iguais.",
    requirement: "Lvl 20 com Attack = Defense",
  }],
  ["Chansey->Blissey", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Chansey com felicidade alta.",
    requirement: "felicidade alta",
  }],
  ["Wurmple->Silcoon", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Evoluir Wurmple at\u00e9 o n\u00edvel 7; a forma pode variar entre Silcoon e Cascoon.",
    requirement: "Lvl 7",
  }],
  ["Wurmple->Cascoon", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Evoluir Wurmple at\u00e9 o n\u00edvel 7; a forma pode variar entre Silcoon e Cascoon.",
    requirement: "Lvl 7",
  }],
  ["Nincada->Shedinja", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Evoluir Nincada at\u00e9 o n\u00edvel 20 com espa\u00e7o livre na equipe e uma Pok\u00e9 Ball dispon\u00edvel.",
    requirement: "Lvl 20 com espa\u00e7o livre e Pok\u00e9 Ball",
  }],
  ["Feebas->Milotic", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Feebas enquanto segura Prism Scale.",
    requirement: "troca com Prism Scale",
  }],
  ["Clamperl->Huntail", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Clamperl enquanto segura Deep Sea Tooth.",
    requirement: "troca com Deep Sea Tooth",
  }],
  ["Clamperl->Gorebyss", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Clamperl enquanto segura Deep Sea Scale.",
    requirement: "troca com Deep Sea Scale",
  }],
  ["Magneton->Magnezone", {
    category: "Evolu\u00e7\u00e3o com pedra ou item",
    detail: "Usar Thunder Stone em Magneton.",
    requirement: "Thunder Stone",
  }],
  ["Lickitung->Lickilicky", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Lickitung enquanto conhece Rollout.",
    requirement: "subir n\u00edvel conhecendo Rollout",
  }],
  ["Rhydon->Rhyperior", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Rhydon enquanto segura Protector.",
    requirement: "troca com Protector",
  }],
  ["Tangela->Tangrowth", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Tangela enquanto conhece Ancient Power.",
    requirement: "subir n\u00edvel conhecendo Ancient Power",
  }],
  ["Electabuzz->Electivire", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Electabuzz enquanto segura Electirizer.",
    requirement: "troca com Electirizer",
  }],
  ["Magmar->Magmortar", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Magmar enquanto segura Magmarizer.",
    requirement: "troca com Magmarizer",
  }],
  ["Eevee->Leafeon", {
    category: "Evolu\u00e7\u00e3o com pedra ou item",
    detail: "Usar Leaf Stone em Eevee.",
    requirement: "Leaf Stone",
  }],
  ["Eevee->Glaceon", {
    category: "Evolu\u00e7\u00e3o com pedra ou item",
    detail: "Usar Ice Stone em Eevee.",
    requirement: "Ice Stone",
  }],
  ["Porygon2->Porygon-Z", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Porygon2 enquanto segura Dubious Disc.",
    requirement: "troca com Dubious Disc",
  }],
  ["Aipom->Ambipom", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Aipom enquanto conhece Double Hit.",
    requirement: "subir n\u00edvel conhecendo Double Hit",
  }],
  ["Yanma->Yanmega", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Yanma enquanto conhece Ancient Power.",
    requirement: "subir n\u00edvel conhecendo Ancient Power",
  }],
  ["Gligar->Gliscor", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Gligar \u00e0 noite enquanto segura Razor Fang.",
    requirement: "Razor Fang \u00e0 noite",
  }],
  ["Sneasel->Weavile", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Sneasel \u00e0 noite enquanto segura Razor Claw.",
    requirement: "Razor Claw \u00e0 noite",
  }],
  ["Piloswine->Mamoswine", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Piloswine enquanto conhece Ancient Power.",
    requirement: "subir n\u00edvel conhecendo Ancient Power",
  }],
  ["Kirlia->Gallade", {
    category: "Evolu\u00e7\u00e3o com pedra ou item",
    detail: "Usar Dawn Stone em Kirlia macho.",
    requirement: "Dawn Stone em macho",
  }],
  ["Nosepass->Probopass", {
    category: "Evolu\u00e7\u00e3o com pedra ou item",
    detail: "Usar Thunder Stone em Nosepass.",
    requirement: "Thunder Stone",
  }],
  ["Dusclops->Dusknoir", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Dusclops enquanto segura Reaper Cloth.",
    requirement: "troca com Reaper Cloth",
  }],
  ["Snorunt->Froslass", {
    category: "Evolu\u00e7\u00e3o com pedra ou item",
    detail: "Usar Dawn Stone em Snorunt f\u00eamea.",
    requirement: "Dawn Stone em f\u00eamea",
  }],
  ["Burmy->Wormadam", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Evoluir Burmy f\u00eamea at\u00e9 o n\u00edvel 20.",
    requirement: "f\u00eamea Lvl 20",
  }],
  ["Burmy->Mothim", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Evoluir Burmy macho at\u00e9 o n\u00edvel 20.",
    requirement: "macho Lvl 20",
  }],
  ["Combee->Vespiquen", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Evoluir Combee f\u00eamea at\u00e9 o n\u00edvel 21.",
    requirement: "f\u00eamea Lvl 21",
  }],
  ["Buneary->Lopunny", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Buneary com felicidade alta.",
    requirement: "felicidade alta",
  }],
  ["Riolu->Lucario", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Riolu durante o dia com felicidade alta.",
    requirement: "felicidade alta de dia",
  }],
  ["Phione->Manaphy", {
    category: "Lend\u00e1rios, m\u00edticos e especiais",
    detail: "Obten\u00e7\u00e3o especial. Consulte o m\u00e9todo configurado no servidor ou a wiki do Pixelmon.",
    requirement: "special",
  }],
  ["Boldore->Gigalith", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Boldore.",
    requirement: "trade",
  }],
  ["Woobat->Swoobat", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Woobat com felicidade alta.",
    requirement: "level up",
  }],
  ["Gurdurr->Conkeldurr", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Gurdurr.",
    requirement: "trade",
  }],
  ["Swadloon->Leavanny", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Subir o n\u00edvel de Swadloon com felicidade alta.",
    requirement: "level up",
  }],
  ["Karrablast->Escavalier", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Karrablast por Shelmet.",
    requirement: "trade",
  }],
  ["Shelmet->Accelgor", {
    category: "Troca ou evolu\u00e7\u00e3o especial",
    detail: "Trocar Shelmet por Karrablast.",
    requirement: "trade",
  }],
  ["Quilladin->Chesnaught", {
    category: "Evoluir por nível",
    detail: "Evoluir Quilladin até o nível 36.",
    requirement: "Lvl 36",
  }],
  ["Braixen->Delphox", {
    category: "Evoluir por nível",
    detail: "Evoluir Braixen até o nível 36.",
    requirement: "Lvl 36",
  }],
  ["Frogadier->Greninja", {
    category: "Evoluir por nível",
    detail: "Evoluir Frogadier até o nível 36.",
    requirement: "Lvl 36",
  }],
  ["Fletchinder->Talonflame", {
    category: "Evoluir por nível",
    detail: "Evoluir Fletchinder até o nível 35.",
    requirement: "Lvl 35",
  }],
  ["Skiddo->Gogoat", {
    category: "Evoluir por nível",
    detail: "Evoluir Skiddo até o nível 32.",
    requirement: "Lvl 32",
  }],
  ["Espurr->Meowstic", {
    category: "Evoluir por nível",
    detail: "Evoluir Espurr até o nível 25.",
    requirement: "Lvl 25",
  }],
  ["Doublade->Aegislash", {
    category: "Evolução com pedra ou item",
    detail: "Usar Dusk Stone em Doublade.",
    requirement: "Dusk Stone",
  }],
  ["Spritzee->Aromatisse", {
    category: "Troca ou evolução especial",
    detail: "Trocar Spritzee enquanto segura Sachet.",
    requirement: "troca com Sachet",
  }],
  ["Swirlix->Slurpuff", {
    category: "Troca ou evolução especial",
    detail: "Trocar Swirlix enquanto segura Whipped Dream.",
    requirement: "troca com Whipped Dream",
  }],
  ["Inkay->Malamar", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Inkay até o nível 30 em Y maior que 127.",
    requirement: "Lvl 30 em Y > 127",
  }],
  ["Skrelp->Dragalge", {
    category: "Evoluir por nível",
    detail: "Evoluir Skrelp até o nível 48.",
    requirement: "Lvl 48",
  }],
  ["Helioptile->Heliolisk", {
    category: "Evolução com pedra ou item",
    detail: "Usar Sun Stone em Helioptile.",
    requirement: "Sun Stone",
  }],
  ["Tyrunt->Tyrantrum", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Tyrunt até o nível 39 durante o dia.",
    requirement: "Lvl 39 de dia",
  }],
  ["Amaura->Aurorus", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Amaura até o nível 39 durante a noite.",
    requirement: "Lvl 39 à noite",
  }],
  ["Goomy->Sliggoo", {
    category: "Evoluir por nível",
    detail: "Evoluir Goomy até o nível 40.",
    requirement: "Lvl 40",
  }],
  ["Sliggoo->Goodra", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Sliggoo até o nível 50 na chuva.",
    requirement: "Lvl 50 na chuva",
  }],
  ["Pancham->Pangoro", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Pancham até o nível 32 com um Pokémon Dark na equipe.",
    requirement: "Lvl 32 com Pokemon Dark na equipe",
  }],
  ["Phantump->Trevenant", {
    category: "Troca ou evolução especial",
    detail: "Trocar Phantump.",
    requirement: "troca",
  }],
  ["Pumpkaboo->Gourgeist", {
    category: "Troca ou evolução especial",
    detail: "Trocar Pumpkaboo.",
    requirement: "troca",
  }],
  ["Eevee->Sylveon", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Eevee com alta felicidade, ataque Fairy e em Sunflower Plains ou Flower Forest.",
    requirement: "alta felicidade + ataque Fairy + bioma de flores",
  }],
  ["Type: Null->Silvally", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Type: Null com felicidade alta.",
    requirement: "felicidade alta",
  }],
  ["Cosmog->Cosmoem", {
    category: "Evoluir por nível",
    detail: "Evoluir Cosmog até o nível 43.",
    requirement: "Lvl 43",
  }],
  ["Cosmoem->Solgaleo", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Cosmoem até o nível 53 durante o dia.",
    requirement: "Lvl 53 de dia",
  }],
  ["Cosmoem->Lunala", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Cosmoem até o nível 53 durante a noite.",
    requirement: "Lvl 53 à noite",
  }],
  ["Charjabug->Vikavolt", {
    category: "Evolução com pedra ou item",
    detail: "Usar Thunder Stone em Charjabug.",
    requirement: "Thunder Stone",
  }],
  ["Crabrawler->Crabominable", {
    category: "Evolução com pedra ou item",
    detail: "Usar Ice Stone em Crabrawler.",
    requirement: "Ice Stone",
  }],
  ["Steenee->Tsareena", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Steenee enquanto conhece Stomp.",
    requirement: "subir nível conhecendo Stomp",
  }],
  ["Salandit->Salazzle", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Salandit fêmea até o nível 33.",
    requirement: "fêmea Lvl 33",
  }],
  ["Poipole->Naganadel", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Poipole enquanto conhece Dragon Pulse.",
    requirement: "subir nível conhecendo Dragon Pulse",
  }],
  ["Meltan->Melmetal", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Meltan depois de alimentá-lo com 400 Iron Nuggets. Iron Ingots e Blocks também contam proporcionalmente.",
    requirement: "400 Iron Nuggets",
  }],
  ["Applin->Flapple", {
    category: "Evolução com pedra ou item",
    detail: "Usar Tart Apple em Applin.",
    requirement: "Tart Apple",
  }],
  ["Applin->Appletun", {
    category: "Evolução com pedra ou item",
    detail: "Usar Sweet Apple em Applin.",
    requirement: "Sweet Apple",
  }],
  ["Milcery->Alcremie", {
    category: "Troca ou evolução especial",
    detail: "Girar com Milcery segurando um Sweet; forma varia conforme doce, horário e sentido do giro.",
    requirement: "girar segurando Sweet",
  }],
  ["Farfetch'd->Sirfetch'd", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Farfetch'd de Galar depois de acertar 3 golpes críticos em uma batalha.",
    requirement: "3 críticos em uma batalha",
  }],
  ["Yamask->Runerigus", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Yamask de Galar depois de perder 49 ou mais HP.",
    requirement: "perder 49+ HP",
  }],
  ["Snom->Frosmoth", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Snom à noite com felicidade alta.",
    requirement: "felicidade alta à noite",
  }],
  ["Clobbopus->Grapploct", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Clobbopus enquanto conhece Taunt.",
    requirement: "subir nível conhecendo Taunt",
  }],
  ["Kubfu->Urshifu", {
    category: "Troca ou evolução especial",
    detail: "Usar Kubfu diante do Scroll of Darkness ou do Scroll of Waters no topo da torre correspondente.",
    requirement: "Scroll of Darkness ou Scroll of Waters",
  }],
  ["Stantler->Wyrdeer", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Stantler com um Pokemon Hisuian na party.",
    requirement: "Pokemon Hisuian na party",
  }],
  ["Scyther->Kleavor", {
    category: "Evolução com pedra ou item",
    detail: "Usar Black Augurite em Scyther.",
    requirement: "Black Augurite",
  }],
  ["Ursaring->Ursaluna", {
    category: "Evolução com pedra ou item",
    detail: "Usar Peat Block em Ursaring durante lua cheia.",
    requirement: "Peat Block em lua cheia",
  }],
  ["Basculin->Basculegion", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Basculin depois de receber dano de recuo suficiente sem desmaiar.",
    requirement: "dano de recuo sem desmaiar",
  }],
  ["Sneasel->Sneasler", {
    category: "Evolução com pedra ou item",
    detail: "Usar Razor Claw em Sneasel de Hisui durante o dia.",
    requirement: "Razor Claw de dia",
  }],
  ["Qwilfish->Overqwil", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Qwilfish de Hisui depois de usar Barb Barrage 20 vezes.",
    requirement: "usar Barb Barrage 20 vezes",
  }],
  ["Primeape->Annihilape", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Primeape depois de usar Rage Fist 20 vezes.",
    requirement: "usar Rage Fist 20 vezes",
  }],
  ["Girafarig->Farigiraf", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Girafarig enquanto conhece Twin Beam.",
    requirement: "subir nível conhecendo Twin Beam",
  }],
  ["Dunsparce->Dudunsparce", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Dunsparce enquanto conhece Hyper Drill.",
    requirement: "subir nível conhecendo Hyper Drill",
  }],
  ["Bisharp->Kingambit", {
    category: "Evolução com pedra ou item",
    detail: "Usar Leader's Crest em Bisharp.",
    requirement: "Leader's Crest",
  }],
  ["Pawmo->Pawmot", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Pawmo fora da Poké Ball depois de caminhar 1000 passos.",
    requirement: "1000 passos fora da Poké Ball",
  }],
  ["Bramblin->Brambleghast", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Bramblin fora da Poké Ball depois de caminhar 1000 passos.",
    requirement: "1000 passos fora da Poké Ball",
  }],
  ["Rellor->Rabsca", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Rellor com felicidade maior que 220. Dica: conferir a felicidade e usar /evofix.",
    requirement: "felicidade > 220 + /evofix",
    evidenceNote: "Wiki pública cita 1000 passos fora da Poké Ball; mantido ajuste do servidor informado pelo usuário: felicidade > 220 + /evofix.",
  }],
  ["Greavard->Houndstone", {
    category: "Troca ou evolução especial",
    detail: "Evoluir Greavard até o nível 30 durante a noite.",
    requirement: "Lvl 30 à noite",
  }],
  ["Gimmighoul->Gholdengo", {
    category: "Troca ou evolução especial",
    detail: "Subir um nível de Gimmighoul depois de entregar 99 Gimmighoul Coins.",
    requirement: "99 Gimmighoul Coins",
  }],
  ["Dipplin->Hydrapple", {
    category: "Troca ou evolução especial",
    detail: "Subir o nível de Dipplin enquanto conhece Dragon Cheer.",
    requirement: "subir nível conhecendo Dragon Cheer",
  }],
  ["Duraludon->Archaludon", {
    category: "Evolução com pedra ou item",
    detail: "Usar Metal Alloy em Duraludon.",
    requirement: "Metal Alloy",
    fallbackWiki: "https://bulbapedia.bulbagarden.net/wiki/Archaludon_(Pok%C3%A9mon)",
  }],
  ["Poltchageist->Sinistcha", {
    category: "Evolução com pedra ou item",
    detail: "Usar Unremarkable Teacup em Poltchageist.",
    requirement: "Unremarkable Teacup",
    fallbackWiki: "https://bulbapedia.bulbagarden.net/wiki/Sinistcha_(Pok%C3%A9mon)",
  }],
]);

const itemNames = new Map([
  ["auspicious armor", "Auspicious Armor"],
  ["malicious armor", "Malicious Armor"],
  ["leaf stone", "Leaf Stone"],
  ["water stone", "Water Stone"],
  ["moon stone", "Moon Stone"],
  ["thunder stone", "Thunder Stone"],
  ["fire stone", "Fire Stone"],
  ["ice stone", "Ice Stone"],
  ["sun stone", "Sun Stone"],
  ["shiny stone", "Shiny Stone"],
  ["dusk stone", "Dusk Stone"],
  ["sachet", "Sachet"],
  ["whipped dream", "Whipped Dream"],
  ["tart apple", "Tart Apple"],
  ["sweet apple", "Sweet Apple"],
  ["syrupy apple", "Syrupy Apple"],
  ["cracked pot", "Cracked Pot"],
  ["chipped pot", "Chipped Pot"],
  ["black augurite", "Black Augurite"],
  ["peat block", "Peat Block"],
  ["razor claw", "Razor Claw"],
  ["unremarkable teacup", "Unremarkable Teacup"],
  ["metal alloy", "Metal Alloy"],
]);

const parentByName = buildParentMap(EVOLUTION_DATA.chains);
const methodByName = new Map(METHODS.map((method) => [method.name, method]));
const legendarySpawnPage = await fetchWiki(LEGENDARY_SPAWNS_URL);
const legendarySpawnByName = legendarySpawnPage.ok ? parseLegendarySpawns(legendarySpawnPage.html) : new Map();
const progress = TARGET_POKEMON.map((pokemon) => ({
  id: pokemon.id,
  name: pokemon.name,
  status: "Pendente",
  source: wikiUrl(pokemon.name),
  evidence: "",
  local: summarizeMethod(methodByName.get(pokemon.name)),
  suggested: "",
  action: "",
  suggestedMethod: null,
  shouldApply: false,
}));

writeReport(progress);

for (const entry of progress) {
  const rawParentInfo = parentByName.get(entry.name);
  const parentEntry = rawParentInfo ? catalogByName.get(rawParentInfo.from) : null;
  const ignoredFutureParent = Boolean(parentEntry && parentEntry.id > entry.id);
  const parentInfo = parentEntry && parentEntry.id < entry.id ? rawParentInfo : null;
  const primaryUrl = wikiUrl(entry.name);
  const page = await fetchWiki(primaryUrl);
  const wiki = page.ok ? parsePixelmonPage(page.html) : { evolutionSentence: "", spawnSummary: "" };
  const override = parentInfo ? evoOverrides.get(`${parentInfo.from}->${entry.name}`) : null;
  const legendarySpawn = legendarySpawnByName.get(entry.name);

  const suggestedMethod = buildSuggestedMethod(entry.name, primaryUrl, parentInfo, wiki, page.ok, override, legendarySpawn);
  const currentMethod = methodByName.get(entry.name);
  entry.suggestedMethod = suggestedMethod;
  entry.status = page.ok || suggestedMethod.documented || legendarySpawn ? "Validado" : "Wiki pendente";
  entry.source = suggestedMethod.wiki;
  entry.evidence = evidenceText(page, wiki, suggestedMethod, legendarySpawn);
  entry.suggested = summarizeMethod(suggestedMethod);
  entry.shouldApply = shouldApplyMethodUpdate(currentMethod, suggestedMethod, parentInfo, wiki, page.ok, override, ignoredFutureParent, legendarySpawn);
  entry.action = actionText(entry.local, entry.suggested, entry.shouldApply, page.ok);

  writeReport(progress);
  console.log(`${entry.status}: #${entry.id} ${entry.name}`);
}

if (APPLY) {
  applyMethodUpdates(progress);
  applyEvolutionUpdates();
  console.log("Dados atualizados.");
}

function buildParentMap(chains) {
  const map = new Map();

  function visit(node, parent = null) {
    if (parent) {
      map.set(node.name, { from: parent.name, requirement: node.requirement, node });
    }

    for (const child of node.children || []) {
      visit(child, node);
    }
  }

  for (const chain of chains || []) {
    visit(chain.root);
  }

  return map;
}

function wikiUrl(name) {
  return `https://pixelmonmod.com/wiki/${encodeURIComponent(name.replaceAll(" ", "_"))}`;
}

async function fetchWiki(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, status: response.status, html: "" };
    }

    return { ok: true, status: response.status, html: await response.text() };
  } catch (error) {
    return { ok: false, status: `erro: ${error.message}`, html: "" };
  }
}

function parsePixelmonPage(html) {
  const evolutionParagraph = html.match(/<p\b[^>]*>[\s\S]*?\bevolves\b[\s\S]*?<\/p>/i)?.[0] || "";
  const evolutionSentence = evolutionParagraph
    ? htmlToText(evolutionParagraph).split(/(?<=\.)\s+/).find((sentence) => /\bevolves\b/i.test(sentence))?.trim() || ""
    : "";
  const spawnSummary = extractSpawnSummary(html);

  return { evolutionSentence, spawnSummary };
}

function parseLegendarySpawns(html) {
  const locationsStart = html.search(/id=["']Locations["']/i);
  const specialTexturesStart = html.search(/id=["']Special_Textures["']/i);
  const section = html.slice(
    locationsStart === -1 ? 0 : locationsStart,
    specialTexturesStart === -1 ? undefined : specialTexturesStart
  );
  const rows = [...section.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  const spawns = new Map();
  let currentPokemon = null;

  for (const row of rows) {
    const cells = extractTableCells(row);
    if (!cells.length) continue;
    if (/^pok[e\u00e9]mon$/i.test(cells[0].text)) continue;

    const rowPokemonName = getCatalogPokemonName(cells[0].text);
    const pokemonName = rowPokemonName && specialPokemonNames.has(rowPokemonName) ? rowPokemonName : "";
    let biome = "";
    let time = "";

    if (rowPokemonName) {
      currentPokemon = null;
      if (!pokemonName) continue;

      currentPokemon = {
        name: pokemonName,
        time: cells[3]?.text || "",
      };
      biome = cells[1]?.text || "";
      time = currentPokemon.time;
    } else if (currentPokemon) {
      biome = cells[0]?.text || "";
      time = currentPokemon.time;
    }

    if (!currentPokemon || !isSpawnBiome(biome)) continue;

    if (!spawns.has(currentPokemon.name)) spawns.set(currentPokemon.name, []);
    spawns.get(currentPokemon.name).push({
      biome: cleanLegendaryCell(biome),
      time: cleanLegendaryTime(time),
    });
  }

  return new Map([...spawns.entries()].map(([name, entries]) => [name, {
    entries,
    summary: summarizeLegendarySpawnEntries(entries),
  }]));
}

function extractTableCells(rowHtml) {
  return [...rowHtml.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map(([, attrs, html]) => ({
    rowspan: Number.parseInt(attrs.match(/\browspan=["']?(\d+)/i)?.[1] || "1", 10),
    text: cleanLegendaryCell(htmlToText(html)),
  }));
}

function getCatalogPokemonName(text) {
  const clean = cleanLegendaryCell(text);
  if (catalogNameSet.has(clean)) return clean;
  return "";
}

function isSpawnBiome(value) {
  const text = normalize(cleanLegendaryCell(value));
  return Boolean(text)
    && text !== "-"
    && text !== "does not spawn"
    && text !== "overworld"
    && !text.includes("evolves from")
    && !text.includes("hatch from egg")
    && !text.includes("quests")
    && !text.includes("mystery box");
}

function cleanLegendaryCell(value) {
  return String(value || "")
    .replace(/\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLegendaryTime(value) {
  const text = cleanLegendaryCell(value);
  return text && text !== "-" ? text : "Any";
}

function summarizeLegendarySpawnEntries(entries) {
  const byBiome = new Map();
  for (const entry of entries) {
    if (!byBiome.has(entry.biome)) byBiome.set(entry.biome, new Set());
    byBiome.get(entry.biome).add(entry.time || "Any");
  }

  return [...byBiome.entries()]
    .map(([biome, times]) => `${biome} (${[...times].join(", ")})`)
    .join("; ");
}

function filterUnavailableDimensionSpawns(spawn) {
  const entries = (spawn?.entries || []).filter((entry) => !isUnavailableServerDimension(entry.biome));
  return {
    entries,
    summary: summarizeLegendarySpawnEntries(entries),
  };
}

function isUnavailableServerDimension(biome = "") {
  const text = normalize(cleanLegendaryCell(biome));
  return text.includes("small end islands")
    || text === "end"
    || text.includes("end barrens")
    || text.includes("end highlands")
    || text.includes("hellish")
    || text.includes("nether")
    || text.includes("basalt")
    || text.includes("crimson")
    || text.includes("warped")
    || text.includes("soul sand");
}

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-")
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&apos;/g, "'");
}

function extractSpawnSummary(html) {
  const start = html.indexOf('id="Spawn_Biomes"');
  if (start === -1) return "";

  const headingEnd = html.indexOf("</h2>", start);
  const nextHeading = html.indexOf("<h2", headingEnd === -1 ? start + 1 : headingEnd + 5);
  const section = html.slice(start, nextHeading === -1 ? undefined : nextHeading);
  const textSection = htmlToText(section);

  if (/can only be obtained by evolving/i.test(textSection)) {
    return "";
  }

  const rows = [...section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const entries = [];

  for (const [, row] of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => htmlToText(cell[1]))
      .map((cell) => cell.replace(/\s+/g, " ").trim());

    if (cells.length < 6) continue;

    const [biome, , time, location, condition] = cells;
    if (!biome || /^biome$/i.test(biome)) continue;

    entries.push(`${biome} (${time || "Any"})`);
  }

  return unique(entries).slice(0, 12).join("; ");
}

function buildSuggestedMethod(name, primaryUrl, parentInfo, wiki, pageOk, override, legendarySpawn) {
  const serverOverride = serverDimensionOverrides.get(name);
  if (serverOverride) {
    return {
      name,
      category: serverOverride.category,
      detail: serverOverride.detail,
      wiki: primaryUrl,
      documented: true,
      evidence: serverOverride.evidence,
    };
  }

  if (parentInfo) {
    const detail = override?.detail || detailFromRequirement(parentInfo.from, parentInfo.requirement);
    const category = override?.category || categoryFromRequirement(parentInfo.requirement);
    const fallbackWiki = override?.fallbackWiki;
    const documented = pageOk || Boolean(fallbackWiki);

    return {
      name,
      category,
      detail,
      wiki: pageOk ? primaryUrl : fallbackWiki || primaryUrl,
      documented,
    };
  }

  if (legendarySpawn) {
    const availableLegendarySpawn = filterUnavailableDimensionSpawns(legendarySpawn);
    if (!availableLegendarySpawn.entries.length) {
      return {
        name,
        category: "Disponibilidade depende do servidor",
        detail: "Spawn oficial usa dimens\u00e3o indispon\u00edvel neste servidor. Verifique o spawn customizado do servidor.",
        wiki: LEGENDARY_SPAWNS_URL,
        documented: true,
        evidence: `Legendary Pok\u00e9mon#Spawning oficial: ${legendarySpawn.summary}`,
      };
    }

    return {
      name,
      category: "Lend\u00e1rios, m\u00edticos e especiais",
      detail: `Biomas: ${availableLegendarySpawn.summary}`,
      wiki: LEGENDARY_SPAWNS_URL,
      documented: true,
      evidence: availableLegendarySpawn.summary === legendarySpawn.summary
        ? `Legendary Pok\u00e9mon#Spawning: ${legendarySpawn.summary}`
        : `Legendary Pok\u00e9mon#Spawning, sem dimens\u00f5es indispon\u00edveis neste servidor: ${availableLegendarySpawn.summary}`,
    };
  }

  if (pageOk && wiki.spawnSummary) {
    return {
      name,
      category: "Encontrar ou capturar",
      detail: `Biomas: ${wiki.spawnSummary}`,
      wiki: primaryUrl,
      documented: true,
    };
  }

  if (specialPokemonNames.has(name)) {
    return {
      name,
      category: "Lendários, míticos e especiais",
      detail: pageOk
        ? "Obtenção especial. Consulte o método configurado no servidor ou a wiki do Pixelmon."
        : "Método ainda não documentado na wiki pública do Pixelmon. Verifique a versão e a configuração do servidor.",
      wiki: primaryUrl,
      documented: pageOk,
    };
  }

  return {
    name,
    category: "Disponibilidade depende do servidor",
    detail: pageOk
      ? "A wiki pública do Pixelmon não expõe bioma ou requisito resumido. Verifique a configuração do servidor."
      : "Página ainda não disponível na wiki pública do Pixelmon. Verifique a versão do servidor.",
    wiki: primaryUrl,
    documented: pageOk,
  };
}

function categoryFromRequirement(requirement = "") {
  const text = requirement.toLowerCase();

  if (text.startsWith("lvl ")) return "Evoluir por nível";
  if ([...itemNames.keys()].some((item) => text.includes(item))) return "Evolução com pedra ou item";

  return "Troca ou evolução especial";
}

function detailFromRequirement(parent, requirement = "") {
  const level = requirement.match(/^Lvl\s+(\d+)/i);
  if (level) {
    return `Evoluir ${parent} até o nível ${level[1]}.`;
  }

  const item = itemNames.get(requirement.toLowerCase());
  if (item) {
    return `Usar ${item} em ${parent}.`;
  }

  return `Evoluir ${parent}: ${requirement}.`;
}

function evidenceText(page, wiki, method, legendarySpawn) {
  if (method.evidence) return method.evidence;
  if (legendarySpawn) return `Legendary Pok\u00e9mon#Spawning: ${legendarySpawn.summary}`;
  const parentInfo = parentByName.get(method.name);
  const override = parentInfo ? evoOverrides.get(`${parentInfo.from}->${method.name}`) : null;
  if (override?.evidenceNote) return override.evidenceNote;
  if (wiki.evolutionSentence) return wiki.evolutionSentence;
  if (wiki.spawnSummary) return `Spawn Biomes: ${wiki.spawnSummary}`;
  if (!page.ok && method.documented) return "Pixelmon wiki sem página pública; requisito validado por wiki alternativa.";
  if (!page.ok) return `Pixelmon wiki indisponível (${page.status}).`;
  return "Página consultada, mas sem método explícito no resumo.";
}

function summarizeMethod(method) {
  if (!method) return "Sem entrada local";
  return `${method.category}: ${method.detail}`;
}

function shouldApplyMethodUpdate(currentMethod, suggestedMethod, parentInfo, wiki, pageOk, override, ignoredFutureParent = false, legendarySpawn = null) {
  if (!currentMethod) return true;
  if (override) {
    const currentText = `${currentMethod.category}: ${currentMethod.detail}`;
    const suggestedText = `${suggestedMethod.category}: ${suggestedMethod.detail}`;
    const methodChanged = normalize(currentText) !== normalize(suggestedText);
    const evolutionChanged = parentInfo?.node && parentInfo.node.requirement !== override.requirement;
    return methodChanged || evolutionChanged;
  }

  const currentText = `${currentMethod.category}: ${currentMethod.detail}`;
  const suggestedText = `${suggestedMethod.category}: ${suggestedMethod.detail}`;
  if (normalize(currentText) === normalize(suggestedText)) return false;

  const currentIsEncounter = normalize(currentMethod.category).includes("encontrar")
    || normalize(currentMethod.detail).includes("biomas:");
  const currentIsServerish = isServerish(currentMethod);
  const suggestedIsConcrete = !isServerish(suggestedMethod);
  const suggestedIsServerOverride = serverDimensionOverrides.has(suggestedMethod.name);

  if (suggestedIsServerOverride && normalize(currentText) !== normalize(suggestedText)) return true;
  if (legendarySpawn && normalize(currentText) !== normalize(suggestedText) && (currentMethod.wiki === LEGENDARY_SPAWNS_URL || !currentIsEncounter || currentIsServerish)) return true;
  if (!legendarySpawn && currentMethod.wiki === LEGENDARY_SPAWNS_URL && currentIsEncounter) return true;
  if (ignoredFutureParent && pageOk && wiki.spawnSummary && !currentIsEncounter) return true;
  if (currentIsEncounter && pageOk && wiki.spawnSummary) return false;
  if (currentIsServerish && suggestedIsConcrete) return true;
  if (parentInfo && !pageOk && suggestedMethod.documented) return true;

  return false;
}

function isServerish(method) {
  const text = normalize(`${method?.category || ""} ${method?.detail || ""}`);
  return text.includes("disponibilidade depende")
    || text.includes("consultar")
    || text.includes("nao documentado")
    || text.includes("nao encontrada")
    || text.includes("nao disponivel")
    || text.includes("sem metodo")
    || text.includes("configuracao do servidor");
}

function actionText(local, suggested, shouldApply, pageOk) {
  if (shouldApply) return "Corrigir dado";
  if (!pageOk) return "Sem página pública";
  if (normalize(local) === normalize(suggested)) return "OK";
  return "Manter local";
}

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function writeReport(rows) {
  const done = rows.filter((row) => row.status !== "Pendente").length;
  const lines = [
    `# Revisão Gen ${GENERATION} - métodos de evolução/obtenção`,
    "",
    `Progresso: ${done}/${rows.length} validações concluídas.`,
    "",
    "Fonte primária: páginas públicas da Pixelmon Wiki. Quando a página pública do Pixelmon não existe, a linha fica marcada como pendente ou usa fallback explicitamente indicado.",
    "",
    "| # | Pokémon | Status | Fonte | Evidência | Local | Revisado | Ação |",
    "|---:|---|---|---|---|---|---|---|",
  ];

  for (const row of rows) {
    lines.push(`| ${[
      row.id,
      escapeMd(row.name),
      escapeMd(row.status),
      `[wiki](${row.source})`,
      escapeMd(row.evidence || "-"),
      escapeMd(row.local || "-"),
      escapeMd(row.suggested || "-"),
      escapeMd(row.action || "-"),
    ].join(" | ")} |`);
  }

  fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
}

function escapeMd(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function applyMethodUpdates(rows) {
  const nextMethods = [...METHODS];

  for (const row of rows) {
    if (!row.suggestedMethod || !row.shouldApply) continue;

    const index = nextMethods.findIndex((method) => method.name === row.name);
    if (index === -1) {
      nextMethods.push(row.suggestedMethod);
    } else {
      nextMethods[index] = row.suggestedMethod;
    }
  }

  fs.writeFileSync(
    "src/pokemon-metodos-data.js",
    `window.POKEMON_SUPPLEMENTAL_METHODS = ${JSON.stringify(nextMethods)};\n`,
    "utf8"
  );
}

function applyEvolutionUpdates() {
  for (const [key, override] of evoOverrides) {
    const [from, to] = key.split("->");
    const parentInfo = parentByName.get(to);
    if (!parentInfo || parentInfo.from !== from) continue;
    parentInfo.node.requirement = override.requirement;
  }

  fs.writeFileSync(
    "src/pokemon-evolution-data.js",
    `window.POKEMON_EVOLUTION_DATA = ${JSON.stringify(EVOLUTION_DATA)};\n`,
    "utf8"
  );
}

function unique(values) {
  return [...new Set(values)];
}

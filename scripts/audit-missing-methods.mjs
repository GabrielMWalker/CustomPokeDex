import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.createContext(context);

[
  'src/pokemon-catalogo-data.js',
  'src/lista-falta-pokemon-data.js',
  'src/pokemon-metodos-data.js',
  'src/pokemon-biomas-data.js',
].forEach(file => {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
});

const CATALOG = context.window.POKEMON_CATALOG || [];
const SUPPLEMENTAL_METHODS = context.window.POKEMON_SUPPLEMENTAL_METHODS || [];
const CAPTURE_BIOMES = context.window.POKEMON_CAPTURE_BIOMES || [];
const SOURCE = context.window.POKEMON_MISSING_SOURCE || '';

const fixTextEncodingArtifacts = value => String(value)
  .replace(/\u00c3\u00a9/g, '\u00e9')
  .replace(/\u00e2\u2122\u20ac/g, '\u2640')
  .replace(/\u00e2\u2122\u201a/g, '\u2642');

const normalize = value => fixTextEncodingArtifacts(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const canonicalKey = name => normalize(name)
  .replace(/\u2640/g, 'f')
  .replace(/\u2642/g, 'm')
  .replace(/[^a-z0-9]/g, '');

const categoryLabels = {
  lendario: 'Lendários, míticos e Ultra Beasts',
  ultrabeast: 'Lendários, míticos e Ultra Beasts',
  'precisa de pedra': 'Evoluir com pedra ou item',
  'precisa de outras coisas, tipo troca ou algo assim': 'Evolução especial',
  'preciso encontrar': 'Encontrar ou capturar',
  'upar lvl mas não tenho pokemon requisito': 'Evoluir por nível: requisito ainda ausente',
  'upar lvl mas nÃ£o tenho pokemon requisito': 'Evoluir por nível: requisito ainda ausente',
  'upar lvl e tenho o pokemon requisito': 'Evoluir por nível: requisito disponível',
};

const missingRequirementCategory = 'Evoluir por nível: requisito ainda ausente';
const availableRequirementCategory = 'Evoluir por nível: requisito disponível';
const specialCategory = 'Lendários, míticos e Ultra Beasts';
const itemCategory = 'Evoluir com pedra ou item';
const tradeCategory = 'Evoluir por troca';
const evolutionCategory = 'Evolução especial';
const fossilCategory = 'Reviver fóssil';
const encounterCategory = 'Encontrar ou capturar';
const serverCategory = 'Disponibilidade depende do servidor';
const unclassifiedCategory = 'Método não definido';
const levelRequirementCategories = new Set([
  missingRequirementCategory,
  availableRequirementCategory,
]);

const specialPokemonKeys = new Set([
  'Articuno', 'Zapdos', 'Moltres', 'Mewtwo', 'Mew',
  'Raikou', 'Entei', 'Suicune', 'Lugia', 'Ho-Oh', 'Celebi',
  'Regirock', 'Regice', 'Registeel', 'Latias', 'Latios', 'Kyogre', 'Groudon', 'Rayquaza', 'Jirachi', 'Deoxys',
  'Uxie', 'Mesprit', 'Azelf', 'Dialga', 'Palkia', 'Heatran', 'Regigigas', 'Giratina', 'Cresselia', 'Phione', 'Manaphy', 'Darkrai', 'Shaymin', 'Arceus',
  'Victini', 'Cobalion', 'Terrakion', 'Virizion', 'Tornadus', 'Thundurus', 'Reshiram', 'Zekrom', 'Landorus', 'Kyurem', 'Keldeo', 'Meloetta', 'Genesect',
  'Xerneas', 'Yveltal', 'Zygarde', 'Diancie', 'Hoopa', 'Volcanion',
  'Type: Null', 'Tapu Koko', 'Tapu Lele', 'Tapu Bulu', 'Tapu Fini', 'Cosmog', 'Cosmoem', 'Solgaleo', 'Lunala', 'Necrozma',
  'Nihilego', 'Buzzwole', 'Pheromosa', 'Xurkitree', 'Celesteela', 'Kartana', 'Guzzlord', 'Poipole', 'Naganadel', 'Stakataka', 'Blacephalon',
  'Magearna', 'Marshadow', 'Zeraora', 'Meltan', 'Melmetal',
  'Zacian', 'Zamazenta', 'Eternatus', 'Kubfu', 'Urshifu', 'Zarude', 'Regieleki', 'Regidrago', 'Glastrier', 'Spectrier', 'Calyrex', 'Enamorus',
  'Wo-Chien', 'Chien-Pao', 'Ting-Lu', 'Chi-Yu', 'Koraidon', 'Miraidon', 'Walking Wake', 'Iron Leaves',
  'Okidogi', 'Munkidori', 'Fezandipiti', 'Ogerpon', 'Gouging Fire', 'Raging Bolt', 'Iron Boulder', 'Iron Crown', 'Terapagos', 'Pecharunt',
].map(canonicalKey));

function classifyCategory(category, detail = '') {
  const categoryText = normalize(category || '');
  const detailText = normalize(detail);
  if (categoryText.includes('lendario') || categoryText.includes('mitico') || categoryText.includes('ultra beast')) return specialCategory;
  if (categoryText.includes('fossil') || detailText.includes('fossil') || detailText.includes('reviver')) return fossilCategory;
  if (categoryText === normalize(tradeCategory) || detailText.includes('por troca') || detailText.startsWith('trocar ') || detailText.includes(' traded')) return tradeCategory;
  if (categoryText.includes('pedra') || detailText.includes(' stone') || detailText.includes(' armor') || detailText.includes(' apple') || detailText.includes('exposed to')) return itemCategory;
  if (levelRequirementCategories.has(category) || categoryText === 'evoluir por nivel' || /^evoluir .+ nivel \d+/i.test(detailText)) {
    return missingRequirementCategory;
  }
  if (categoryText.includes('evolucao especial') || categoryText.includes('requisito especial') || detailText.startsWith('subir o nivel')) return evolutionCategory;
  if (categoryText.includes('disponibilidade depende') || categoryText.includes('consultar wiki')) return serverCategory;
  if (categoryText.includes('encontrar') || detailText.includes('bioma')) return encounterCategory;
  return category || encounterCategory;
}

function classifyPokemonCategory(name, category, detail = '') {
  const result = classifyCategory(category, detail);
  return result === encounterCategory && specialPokemonKeys.has(canonicalKey(name))
    ? specialCategory
    : result;
}

function hasRealEncounterInfo(detail = '') {
  const text = normalize(detail);
  const rawText = detail.toLowerCase();
  if (!text) return false;
  if (text.includes('nao encontrado') || rawText.includes('nÃ£o encontrado') || text.includes('consulte') || text.includes('configuracao do servidor')) return false;
  return text.includes('biomas:') || text.includes('encontrar e capturar em');
}

function parseSource(source) {
  const groups = [];
  let current = null;
  source.split(/\r?\n/).forEach(line => {
    const category = line.match(/^\*\*(.+)\*\*$/);
    if (category) {
      current = { name: categoryLabels[category[1].trim()] || category[1].trim(), entries: [] };
      groups.push(current);
      return;
    }

    const item = line.match(/^\*\s+(.+)$/);
    if (!item || !current) return;

    const raw = item[1].trim();
    const parts = raw.match(/^(.+?)\s+\((.+)\)$/);
    const name = parts ? parts[1] : raw;
    const detail = parts ? parts[2] : '';
    current.entries.push({
      name,
      detail,
      sourceCategory: classifyCategory(current.name, detail),
    });
  });
  return groups;
}

const manualEntries = parseSource(SOURCE).flatMap(group => group.entries);
const manualByKey = new Map(manualEntries.map(entry => [canonicalKey(entry.name), entry]));
const supplementalByKey = new Map(SUPPLEMENTAL_METHODS.map(entry => [canonicalKey(entry.name), entry]));
const captureBiomesByKey = new Map(CAPTURE_BIOMES.map(entry => [canonicalKey(entry.name), entry]));

const missing = CATALOG.map(pokemon => {
  const nameKey = canonicalKey(pokemon.name);
  const manual = manualByKey.get(nameKey);
  const method = supplementalByKey.get(nameKey);
  const captureBiome = captureBiomesByKey.get(nameKey);
  const detail = manual?.detail || captureBiome?.detail || method?.detail || '';
  const rawCategory = manual?.sourceCategory || method?.category || (captureBiome ? encounterCategory : '');
  let sourceCategory = rawCategory
    ? classifyPokemonCategory(pokemon.name, rawCategory, detail)
    : unclassifiedCategory;
  if (sourceCategory === encounterCategory && !hasRealEncounterInfo(detail)) {
    sourceCategory = detail ? serverCategory : unclassifiedCategory;
  }
  return { ...pokemon, detail, sourceCategory };
}).filter(entry => entry.sourceCategory === unclassifiedCategory);

console.log(`Missing methods: ${missing.length}`);
missing.forEach(entry => {
  console.log(`${String(entry.id).padStart(4, '0')} ${entry.name}`);
});

import fs from 'node:fs';
import vm from 'node:vm';

const DATA_FILES = [
  'src/pokemon-catalogo-data.js',
  'src/lista-falta-pokemon-data.js',
  'src/pokemon-metodos-data.js',
  'src/pokemon-biomas-data.js',
];

const context = { window: {} };
vm.createContext(context);
DATA_FILES.forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context));

const CATALOG = context.window.POKEMON_CATALOG || [];
const SUPPLEMENTAL_METHODS = context.window.POKEMON_SUPPLEMENTAL_METHODS || [];
const CAPTURE_BIOMES = context.window.POKEMON_CAPTURE_BIOMES || [];
const SOURCE = context.window.POKEMON_MISSING_SOURCE || '';

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
const levelRequirementCategories = new Set([missingRequirementCategory, availableRequirementCategory]);

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

function fixTextEncodingArtifacts(value) {
  return String(value)
    .replace(/\u00c3\u00a9/g, '\u00e9')
    .replace(/\u00e2\u2122\u20ac/g, '\u2640')
    .replace(/\u00e2\u2122\u201a/g, '\u2642');
}

function normalize(value) {
  return fixTextEncodingArtifacts(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function canonicalKey(name) {
  return normalize(name)
    .replace(/\u2640/g, 'f')
    .replace(/\u2642/g, 'm')
    .replace(/[^a-z0-9]/g, '');
}

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
  return result === encounterCategory && specialPokemonKeys.has(canonicalKey(name)) ? specialCategory : result;
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
    current.entries.push({ name, detail, sourceCategory: classifyCategory(current.name, detail) });
  });
  return groups;
}

function currentMissingMethods() {
  const manualEntries = parseSource(SOURCE).flatMap(group => group.entries);
  const manualByKey = new Map(manualEntries.map(entry => [canonicalKey(entry.name), entry]));
  const supplementalByKey = new Map(SUPPLEMENTAL_METHODS.map(entry => [canonicalKey(entry.name), entry]));
  const captureBiomesByKey = new Map(CAPTURE_BIOMES.map(entry => [canonicalKey(entry.name), entry]));

  return CATALOG.map(pokemon => {
    const nameKey = canonicalKey(pokemon.name);
    const manual = manualByKey.get(nameKey);
    const method = supplementalByKey.get(nameKey);
    const captureBiome = captureBiomesByKey.get(nameKey);
    const detail = manual?.detail || captureBiome?.detail || method?.detail || '';
    const rawCategory = manual?.sourceCategory || method?.category || (captureBiome ? encounterCategory : '');
    let sourceCategory = rawCategory ? classifyPokemonCategory(pokemon.name, rawCategory, detail) : unclassifiedCategory;
    if (sourceCategory === encounterCategory && !hasRealEncounterInfo(detail)) {
      sourceCategory = detail ? serverCategory : unclassifiedCategory;
    }
    return { ...pokemon, detail, sourceCategory };
  }).filter(entry => entry.sourceCategory === unclassifiedCategory);
}

function decodeHtml(value) {
  const named = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' ',
    ndash: '-',
    mdash: '-',
    eacute: 'é',
    female: '♀',
    male: '♂',
  };
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name] ?? `&${name};`)
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function wikiTitle(name) {
  return encodeURIComponent(name.replace(/ /g, '_'));
}

function wikiUrl(name) {
  return `https://pixelmonmod.com/wiki/${wikiTitle(name)}`;
}

function parseSpawnRows(html) {
  const headingIndex = html.search(/id=["']Spawn_Biomes["']|>\s*Spawn Biomes\s*</i);
  if (headingIndex < 0) return [];
  const afterHeading = html.slice(headingIndex);
  const tableStart = afterHeading.search(/<table/i);
  if (tableStart < 0) return [];
  const tableHtml = afterHeading.slice(tableStart, afterHeading.search(/<\/table>/i) + 8);
  const rows = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
    .map(match => [...match[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => stripTags(cell[1])))
    .filter(cells => cells.length >= 5 && !/^Biome$/i.test(cells[0]));

  return rows.map(cells => ({
    biome: cells[0],
    time: cells[2],
    location: cells[3],
    condition: cells[4],
  })).filter(row => row.biome && !/^-$|^—$/.test(row.biome));
}

function summarizeSpawnRows(rows) {
  const byBiome = new Map();
  rows.forEach(row => {
    const biome = row.biome;
    const time = row.time && !/^-$|^—$/.test(row.time) ? row.time : 'Any';
    if (!byBiome.has(biome)) byBiome.set(biome, new Set());
    byBiome.get(biome).add(time);
  });

  const parts = [...byBiome.entries()].map(([biome, times]) => {
    const timeText = [...times].join(', ');
    return `${biome} (${timeText})`;
  });
  return `Biomas: ${parts.join('; ')}`;
}

function pagePlainText(html) {
  return stripTags(html)
    .replace(/\s+Contents\s+1 Spawn Biomes[\s\S]*$/i, '')
    .replace(/\s+Contents\s+1 Drops[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanName(value) {
  return decodeHtml(value)
    .replace(/\s+starting$/i, '')
    .replace(/\s+when$/i, '')
    .replace(/\s+if$/i, '')
    .trim();
}

function parseEvolutionMethod(name, html) {
  const text = pagePlainText(html);
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sentenceMatch = text.match(new RegExp(`${escapedName}[^.]*evolves from [^.]+\\.`, 'i'));
  const sentence = sentenceMatch?.[0] || text.match(/It evolves from [^.]+\./i)?.[0] || '';
  if (!sentence) return null;

  const fromMatch = sentence.match(/evolves from (.+?)(?: starting at level| when| if| after| while| by| using| and|,|\.)/i);
  const from = cleanName(fromMatch?.[1] || '');
  if (!from) return null;

  const levelMatch = sentence.match(/starting at level (\d+)/i);
  if (levelMatch) {
    return {
      category: 'Evoluir por nível',
      detail: `Evoluir ${from} até o nível ${levelMatch[1]}.`,
    };
  }

  const exposedMatch = sentence.match(/exposed to (?:a |an |the )?(.+?)(?:\.|,)/i);
  if (exposedMatch) {
    return {
      category: 'Evolução com pedra ou item',
      detail: `Usar ${cleanName(exposedMatch[1])} em ${from}.`,
    };
  }

  const tradedHoldingMatch = sentence.match(/traded (?:while )?holding (?:a |an |the )?(.+?)(?:\.|,)/i);
  if (tradedHoldingMatch) {
    return {
      category: 'Troca ou evolução especial',
      detail: `Trocar ${from} enquanto segura ${cleanName(tradedHoldingMatch[1])}.`,
    };
  }

  if (/when traded/i.test(sentence)) {
    return {
      category: 'Troca ou evolução especial',
      detail: `Trocar ${from}.`,
    };
  }

  const lower = sentence.toLowerCase();
  if (lower.includes('high friendship') || lower.includes('happiness')) {
    return {
      category: 'Troca ou evolução especial',
      detail: `Subir o nível de ${from} com felicidade alta.`,
    };
  }
  if (lower.includes('during the day')) {
    return {
      category: 'Troca ou evolução especial',
      detail: `Subir o nível de ${from} durante o dia.`,
    };
  }
  if (lower.includes('at night') || lower.includes('during the night')) {
    return {
      category: 'Troca ou evolução especial',
      detail: `Subir o nível de ${from} durante a noite.`,
    };
  }
  if (lower.includes('outside of its poké ball') || lower.includes('outside of its poke ball')) {
    return {
      category: 'Troca ou evolução especial',
      detail: `Subir o nível de ${from} fora da Poké Ball após caminhar o requisito necessário.`,
    };
  }

  return {
    category: 'Troca ou evolução especial',
    detail: `Obter por evolução de ${from}. Consulte a página da espécie para o requisito exato.`,
  };
}

function fallbackMethod(entry, html) {
  if (specialPokemonKeys.has(canonicalKey(entry.name))) {
    return {
      category: 'Lendários, míticos e especiais',
      detail: 'Obtenção especial. Consulte o método configurado no servidor ou a wiki do Pixelmon.',
    };
  }

  if (html.includes('Fossil Machine') || html.includes('fossil')) {
    return {
      category: 'Reviver fóssil',
      detail: 'Reviver o fóssil correspondente em uma Fossil Machine.',
    };
  }

  return {
    category: 'Disponibilidade depende do servidor',
    detail: 'Consultar a wiki do Pixelmon e a configuração do servidor para o método atual.',
  };
}

async function createMethod(entry) {
  const url = wikiUrl(entry.name);
  const response = await fetch(url);
  if (!response.ok) {
    return {
      name: entry.name,
      category: 'Disponibilidade depende do servidor',
      detail: 'Página não encontrada na wiki pública do Pixelmon. Verifique a versão do servidor.',
      wiki: url,
      documented: false,
    };
  }

  const html = await response.text();
  const spawnRows = parseSpawnRows(html);
  const method = spawnRows.length
    ? { category: 'Encontrar ou capturar', detail: summarizeSpawnRows(spawnRows) }
    : parseEvolutionMethod(entry.name, html) || fallbackMethod(entry, html);

  return {
    name: entry.name,
    category: method.category,
    detail: method.detail,
    wiki: url,
    documented: response.ok,
  };
}

const missing = currentMissingMethods();
const existingKeys = new Set(SUPPLEMENTAL_METHODS.map(entry => canonicalKey(entry.name)));
const generated = [];

console.log(`Missing before fill: ${missing.length}`);
for (const [index, entry] of missing.entries()) {
  if (existingKeys.has(canonicalKey(entry.name))) continue;
  const method = await createMethod(entry);
  generated.push(method);
  console.log(`${index + 1}/${missing.length} ${entry.name}: ${method.category}`);
}

const merged = [...SUPPLEMENTAL_METHODS, ...generated];
fs.writeFileSync(
  'src/pokemon-metodos-data.js',
  `window.POKEMON_SUPPLEMENTAL_METHODS = ${JSON.stringify(merged)};\n`,
  'utf8',
);

console.log(`Added methods: ${generated.length}`);

const SOURCE = window.POKEMON_LIST_SOURCE || "";
      const CATALOG = window.POKEMON_CATALOG || [];
    const SUPPLEMENTAL_METHODS = window.POKEMON_SUPPLEMENTAL_METHODS || [];
    const CAPTURE_BIOMES = window.POKEMON_CAPTURE_BIOMES || [];
    const TYPE_DATA = window.POKEMON_TYPES_DATA || [];
    const EVOLUTION_DATA = window.POKEMON_EVOLUTION_DATA || { pokemon: [], chains: [] };
    const BREEDING_DATA = window.POKEMON_BREEDING_DATA || [];
    const BIOME_DATA_LOADED = Array.isArray(window.POKEMON_CAPTURE_BIOMES);
    const STORAGE_KEY = "pokemon-checklist-captured-v2";
    const LEGACY_STORAGE_KEY = "pokemon-checklist-status-v1";
    const THEME_KEY = "pokemon-checklist-theme";
    const DENSITY_KEY = "pokemon-checklist-density";
    const LOG_SIDEBAR_COLLAPSED_KEY = "pokemon-checklist-log-sidebar-collapsed";
    const LOG_MONITOR_MINIMIZED_KEY = "pokemon-checklist-log-monitor-minimized";
    const getTauriInvoke = () => window.__TAURI__?.core?.invoke;
    const isTauriApp = () => Boolean(getTauriInvoke());
    const invokeTauri = (command, args = {}) => getTauriInvoke()(command, args);
    const capturedState = new Map();
    const filterState = { status: "", methods: new Set(), types: new Set(), sort: "number" };
    let activeView = "checklist";
    let telemetrySearch = "";
    let breedingSearch = "";
    let breedingGroupFilter = "";
    let buildSearch = "";
    let buildRoleFilter = "";
    let buildDamageFilter = "";
    let raidShieldType = "";
    let buildMetaOnly = false;
    let selectedBreedingKey = "";
    let focusTelemetrySearchAfterRender = false;
    let focusBreedingSearchAfterRender = false;
    let focusBuildSearchAfterRender = false;
    let activeModalEntry = null;
    const defaultNavigation = { type: "all", label: "Todos os Pok\u00e9mon" };
    const generationRanges = [
      { type: "generation", label: "Gera\u00e7\u00e3o 1", start: 1, end: 151 },
      { type: "generation", label: "Gera\u00e7\u00e3o 2", start: 152, end: 251 },
      { type: "generation", label: "Gera\u00e7\u00e3o 3", start: 252, end: 386 },
      { type: "generation", label: "Gera\u00e7\u00e3o 4", start: 387, end: 493 },
      { type: "generation", label: "Gera\u00e7\u00e3o 5", start: 494, end: 649 },
      { type: "generation", label: "Gera\u00e7\u00e3o 6", start: 650, end: 721 },
      { type: "generation", label: "Gera\u00e7\u00e3o 7", start: 722, end: 809 },
      { type: "generation", label: "Gera\u00e7\u00e3o 8", start: 810, end: 905 },
      { type: "generation", label: "Gera\u00e7\u00e3o 9", start: 906, end: 1025 }
    ];
    let activeNavigation = defaultNavigation;
    let useFileDatabase = false;
    const logCaptureState = {
      enabled: false,
      configuredLogPath: "",
      defaultLogPath: "",
      needsLogPathConfig: true,
      activeFile: "",
      activePath: "",
      candidates: [],
      lastChat: null,
      lastSignal: null,
      lastCapture: null,
      lastIgnored: null,
      lastScanAt: "",
      lastFrontendPollAt: "",
      currentSize: 0,
      offset: 0,
      lastDelta: 0,
      lastNoReadReason: "",
      pathResetCount: 0,
      pollCount: 0,
      frontendPollCount: 0,
      linesRead: 0,
      chatLinesRead: 0,
      eventsRead: 0,
      candidateCount: 0,
      lastError: "",
      poller: null
    };
    let activeTheme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    let isCompactMode = localStorage.getItem(DENSITY_KEY) === "compact";
    let isLogSidebarCollapsed = localStorage.getItem(LOG_SIDEBAR_COLLAPSED_KEY) === "true";
    let isLogMonitorMinimized = localStorage.getItem(LOG_MONITOR_MINIMIZED_KEY) === "true";

    const fixTextEncodingArtifacts = value => String(value)
      .replace(/\u00c3\u00a9/g, "\u00e9")
      .replace(/\u00e2\u2122\u20ac/g, "\u2640")
      .replace(/\u00e2\u2122\u201a/g, "\u2642");

    const normalize = value => fixTextEncodingArtifacts(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    const canonicalKey = name => normalize(name)
      .replace(/\u2640/g, "f")
      .replace(/\u2642/g, "m")
      .replace(/[^a-z0-9]/g, "");

    const imageSlug = name => normalize(name)
      .replace(/\u2640/g, "-f")
      .replace(/\u2642/g, "-m")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    function parseSource(source) {
      const groups = [];
      let current = null;

      source.split(/\r?\n/).forEach(line => {
        const category = line.match(/^\*\*(.+)\*\*$/);
        if (category) {
          current = { name: category[1].trim(), entries: [] };
          groups.push(current);
          return;
        }

        const item = line.match(/^\*\s+(.+)$/);
        if (!item || !current) return;

        const raw = item[1].trim();
        const parts = raw.match(/^(.+?)\s+\((.+)\)$/);
        const name = parts ? parts[1] : raw;
        const detail = parts ? parts[2] : "";
        const materials = [...detail.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
        current.entries.push({
          name,
          detail: detail.replace(/[{}]/g, ""),
          materials,
          key: `${current.name}::${name}`
        });
      });

      return groups;
    }

    const categoryLabels = {
      "lendario": "Lendários, míticos e Ultra Beasts",
      "ultrabeast": "Lendários, míticos e Ultra Beasts",
      "precisa de pedra": "Evoluir com pedra ou item",
      "precisa de outras coisas, tipo troca ou algo assim": "Evolução especial",
      "preciso encontrar": "Encontrar ou capturar",
      "upar lvl mas não tenho pokemon requisito": "Evoluir por nível: requisito ainda ausente",
      "upar lvl mas n\u00c3\u00a3o tenho pokemon requisito": "Evoluir por nível: requisito ainda ausente",
      "upar lvl e tenho o pokemon requisito": "Evoluir por nível: requisito disponível"
    };
    const missingRequirementCategory = "Evoluir por nível: requisito ainda ausente";
    const availableRequirementCategory = "Evoluir por nível: requisito disponível";
    const specialCategory = "Lendários, míticos e Ultra Beasts";
    const itemCategory = "Evoluir com pedra ou item";
    const tradeCategory = "Evoluir por troca";
    const evolutionCategory = "Evolução especial";
    const fossilCategory = "Reviver fóssil";
    const encounterCategory = "Encontrar ou capturar";
    const serverCategory = "Disponibilidade depende do servidor";
    const unclassifiedCategory = "Método não definido";
    const levelRequirementCategories = new Set([
      missingRequirementCategory,
      availableRequirementCategory
    ]);
    const statusFilters = [
      { value: "pending", label: "Somente Faltando" },
      { value: "done", label: "Capturados" },
      { value: "", label: "Todos" }
    ];
    const methodFilters = [
      {
        value: "",
        label: "Todos",
        categories: null
      },
      {
        value: "encounter",
        label: "Encontrar/Capturar",
        categories: new Set([encounterCategory])
      },
      {
        value: "level-ready",
        label: "Por N\u00edvel: dispon\u00edvel",
        categories: new Set([availableRequirementCategory])
      },
      {
        value: "level-missing",
        label: "Por N\u00edvel: base ausente",
        categories: new Set([missingRequirementCategory])
      },
      {
        value: "item",
        label: "Por Item",
        categories: new Set([itemCategory, fossilCategory])
      },
      {
        value: "trade",
        label: "Troca",
        categories: new Set([tradeCategory])
      },
      {
        value: "special",
        label: "Especial",
        categories: new Set([evolutionCategory, specialCategory, serverCategory])
      }
    ];
    const sortOptions = [
      { value: "number", label: "Numérica" },
      { value: "alpha", label: "Alfabética" },
      { value: "alpha-desc", label: "Alfabética Z-A" }
    ];
    const eggGroupLabels = {
      monster: "Monster",
      water1: "Water 1",
      bug: "Bug",
      flying: "Flying",
      ground: "Field",
      fairy: "Fairy",
      plant: "Grass",
      humanshape: "Human-Like",
      water3: "Water 3",
      mineral: "Mineral",
      indeterminate: "Amorphous",
      water2: "Water 2",
      ditto: "Ditto",
      dragon: "Dragon",
      "no-eggs": "Undiscovered"
    };
    const typeLabels = {
      normal: "Normal",
      fire: "Fogo",
      water: "Água",
      electric: "Elétrico",
      grass: "Grama",
      ice: "Gelo",
      fighting: "Lutador",
      poison: "Venenoso",
      ground: "Terra",
      flying: "Voador",
      psychic: "Psíquico",
      bug: "Inseto",
      rock: "Pedra",
      ghost: "Fantasma",
      dragon: "Dragão",
      dark: "Sombrio",
      steel: "Aço",
      fairy: "Fada"
    };
    const typeFilters = Object.entries(typeLabels).map(([value, label]) => ({ value, label }));
    const buildRoleFilters = [
      { value: "", label: "Todos" },
      { value: "physical-sweeper", label: "Físico veloz" },
      { value: "special-sweeper", label: "Especial veloz" },
      { value: "physical-tank", label: "Tanque físico" },
      { value: "special-tank", label: "Tanque especial" },
      { value: "support", label: "Suporte" },
      { value: "balanced", label: "Balanceado" }
    ];
    const buildDamageFilters = [
      { value: "", label: "Todos" },
      { value: "physical", label: "Fisico" },
      { value: "special", label: "Especial" },
      { value: "mixed", label: "Misto" },
      { value: "status", label: "Suporte" }
    ];
    const buildDamageLabels = {
      physical: "Dano fisico",
      special: "Dano especial",
      mixed: "Dano misto",
      status: "Suporte"
    };
    const typeEffectiveness = {
      normal: { rock: .5, ghost: 0, steel: .5 },
      fire: { fire: .5, water: .5, grass: 2, ice: 2, bug: 2, rock: .5, dragon: .5, steel: 2 },
      water: { fire: 2, water: .5, grass: .5, ground: 2, rock: 2, dragon: .5 },
      electric: { water: 2, electric: .5, grass: .5, ground: 0, flying: 2, dragon: .5 },
      grass: { fire: .5, water: 2, grass: .5, poison: .5, ground: 2, flying: .5, bug: .5, rock: 2, dragon: .5, steel: .5 },
      ice: { fire: .5, water: .5, grass: 2, ice: .5, ground: 2, flying: 2, dragon: 2, steel: .5 },
      fighting: { normal: 2, ice: 2, poison: .5, flying: .5, psychic: .5, bug: .5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: .5 },
      poison: { grass: 2, poison: .5, ground: .5, rock: .5, ghost: .5, steel: 0, fairy: 2 },
      ground: { fire: 2, electric: 2, grass: .5, poison: 2, flying: 0, bug: .5, rock: 2, steel: 2 },
      flying: { electric: .5, grass: 2, fighting: 2, bug: 2, rock: .5, steel: .5 },
      psychic: { fighting: 2, poison: 2, psychic: .5, dark: 0, steel: .5 },
      bug: { fire: .5, grass: 2, fighting: .5, poison: .5, flying: .5, psychic: 2, ghost: .5, dark: 2, steel: .5, fairy: .5 },
      rock: { fire: 2, ice: 2, fighting: .5, ground: .5, flying: 2, bug: 2, steel: .5 },
      ghost: { normal: 0, psychic: 2, ghost: 2, dark: .5 },
      dragon: { dragon: 2, steel: .5, fairy: 0 },
      dark: { fighting: .5, psychic: 2, ghost: 2, dark: .5, fairy: .5 },
      steel: { fire: .5, water: .5, electric: .5, ice: 2, rock: 2, steel: .5, fairy: 2 },
      fairy: { fire: .5, fighting: 2, poison: .5, dragon: 2, dark: 2, steel: .5 }
    };
    const buildTemplates = {
      "physical-sweeper": {
        name: "Ofensiva fisica",
        damageType: "physical",
        role: "Atacante físico veloz",
        evs: [["Attack", 252], ["Speed", 252], ["HP", 4]],
        nature: "Jolly ou Adamant",
        item: "Life Orb, Choice Band ou item de setup",
        moves: ["STAB físico", "Cobertura", "Setup ou prioridade", "Utility"],
        note: "Template ofensivo para pressionar com Speed e dano físico."
      },
      "special-sweeper": {
        name: "Ofensiva especial",
        damageType: "special",
        role: "Atacante especial veloz",
        evs: [["Special Attack", 252], ["Speed", 252], ["HP", 4]],
        nature: "Timid ou Modest",
        item: "Life Orb, Choice Specs ou item de setup",
        moves: ["STAB especial", "Cobertura", "Setup", "Utility"],
        note: "Template ofensivo para dano especial e iniciativa."
      },
      "physical-tank": {
        name: "Bulky fisica",
        damageType: "physical",
        role: "Tanque físico",
        evs: [["HP", 252], ["Defense", 252], ["Attack", 4]],
        nature: "Impish ou Adamant",
        item: "Leftovers, Rocky Helmet ou item defensivo",
        moves: ["STAB", "Recovery ou proteção", "Controle", "Cobertura"],
        note: "Template para segurar contato físico e ainda ter presença ofensiva."
      },
      "special-tank": {
        name: "Bulky especial",
        damageType: "special",
        role: "Tanque especial",
        evs: [["HP", 252], ["Special Defense", 252], ["Special Attack", 4]],
        nature: "Calm ou Modest",
        item: "Leftovers, Assault Vest ou item defensivo",
        moves: ["STAB", "Recovery ou proteção", "Status", "Cobertura"],
        note: "Template para absorver dano especial e manter pressão."
      },
      support: {
        name: "Suporte",
        damageType: "status",
        role: "Suporte bulky",
        evs: [["HP", 252], ["Defense", 128], ["Special Defense", 128]],
        nature: "Bold, Calm ou Careful",
        item: "Leftovers, Sitrus Berry ou item utilitário",
        moves: ["Status", "Controle de campo", "Recovery ou proteção", "STAB"],
        note: "Template de suporte para utilidade e sobrevivência."
      },
      balanced: {
        name: "Mista flex",
        damageType: "mixed",
        role: "Balanceado",
        evs: [["HP", 252], ["Attack", 128], ["Special Attack", 128]],
        nature: "Nature neutra ao plano escolhido",
        item: "Item flexível",
        moves: ["STAB principal", "STAB secundário", "Cobertura", "Utility"],
        note: "Template inicial para Pokémon sem papel claro nos dados locais."
      }
    };
    const buildOverrides = new Map(Object.entries({
      [canonicalKey("Charizard")]: [
        {
          name: "Belly Drum",
          roleKey: "physical-sweeper",
          source: "Meta Smogon",
          evs: [["Attack", 252], ["Speed", 252], ["HP", 4]],
          nature: "Jolly",
          item: "Sitrus Berry",
          moves: ["Belly Drum", "Acrobatics", "Earthquake", "Flame Charge"],
          attackTypes: ["flying", "ground", "fire"],
          note: "Setup físico de all-in: use Belly Drum para maximizar Attack e ativar Acrobatics sem item."
        }
      ],
      [canonicalKey("Venusaur")]: [
        {
          name: "Chlorophyll Sun",
          roleKey: "special-sweeper",
          source: "Meta Smogon",
          evs: [["Special Attack", 252], ["Speed", 252], ["Special Defense", 4]],
          nature: "Modest",
          item: "Life Orb",
          moves: ["Growth", "Giga Drain", "Weather Ball", "Sludge Bomb"],
          attackTypes: ["grass", "fire", "poison"],
          note: "Sweeper de sol: Growth fica muito mais forte sob sun e Weather Ball vira cobertura Fire."
        }
      ],
      [canonicalKey("Dragonite")]: [
        {
          name: "Dragon Dance",
          roleKey: "physical-sweeper",
          source: "Meta Smogon",
          evs: [["Attack", 252], ["Speed", 252], ["Defense", 4]],
          nature: "Adamant ou Jolly",
          item: "Heavy-Duty Boots",
          moves: ["Dragon Dance", "Extreme Speed", "Earthquake", "Ice Spinner ou Roost"],
          attackTypes: ["normal", "ground", "ice"],
          note: "Setup sweeper com Multiscale preservado por Boots e prioridade para finalizar alvos."
        },
        {
          name: "Choice Band",
          roleKey: "physical-sweeper",
          source: "Meta Smogon",
          evs: [["Attack", 252], ["Speed", 252], ["Defense", 4]],
          nature: "Adamant",
          item: "Choice Band",
          moves: ["Outrage", "Extreme Speed", "Ice Spinner", "Fire Punch ou Earthquake"],
          attackTypes: ["dragon", "normal", "ice", "fire", "ground"],
          note: "Wallbreaker físico com Extreme Speed para revenge kill."
        }
      ],
      [canonicalKey("Garchomp")]: [
        {
          name: "Swords Dance",
          roleKey: "physical-sweeper",
          source: "Meta Smogon",
          evs: [["Attack", 252], ["Speed", 252], ["Special Defense", 4]],
          nature: "Jolly",
          item: "Loaded Dice ou Life Orb",
          moves: ["Swords Dance", "Scale Shot", "Earthquake", "Fire Fang ou Dragon Tail"],
          attackTypes: ["dragon", "ground", "fire"],
          note: "Setup físico com Scale Shot para aumentar Speed e Earthquake como STAB principal."
        }
      ],
      [canonicalKey("Kingambit")]: [
        {
          name: "Swords Dance Cleaner",
          roleKey: "physical-sweeper",
          source: "Meta Smogon",
          evs: [["Attack", 252], ["Speed", 252], ["Defense", 4]],
          nature: "Adamant",
          item: "Black Glasses, Leftovers ou Lum Berry",
          moves: ["Swords Dance", "Sucker Punch", "Kowtow Cleave", "Iron Head ou Low Kick"],
          attackTypes: ["dark", "steel", "fighting"],
          note: "Cleaner físico de late game com Supreme Overlord e prioridade em Sucker Punch."
        },
        {
          name: "Bulky Swords Dance",
          roleKey: "physical-tank",
          source: "Meta Smogon",
          evs: [["HP", 212], ["Attack", 252], ["Speed", 44]],
          nature: "Adamant",
          item: "Leftovers ou Black Glasses",
          moves: ["Swords Dance", "Sucker Punch", "Kowtow Cleave", "Iron Head"],
          attackTypes: ["dark", "steel"],
          note: "Versão mais bulky para aproveitar switches e pressionar sem depender tanto de Speed."
        }
      ],
      [canonicalKey("Dragapult")]: [
        {
          name: "Hex Status",
          roleKey: "support",
          source: "Meta Smogon",
          evs: [["Speed", 252], ["Special Attack", 252], ["Attack", 4]],
          nature: "Timid ou Hasty",
          item: "Heavy-Duty Boots",
          moves: ["Hex", "Will-O-Wisp ou Thunder Wave", "Dragon Darts", "U-turn"],
          attackTypes: ["ghost", "dragon", "bug"],
          note: "Suporte ofensivo veloz: espalha status para fortalecer Hex e manter momentum."
        }
      ]
    }));
    const specialPokemonKeys = new Set([
      "Articuno", "Zapdos", "Moltres", "Mewtwo", "Mew",
      "Raikou", "Entei", "Suicune", "Lugia", "Ho-Oh", "Celebi",
      "Regirock", "Regice", "Registeel", "Latias", "Latios", "Kyogre", "Groudon", "Rayquaza", "Jirachi", "Deoxys",
      "Uxie", "Mesprit", "Azelf", "Dialga", "Palkia", "Heatran", "Regigigas", "Giratina", "Cresselia", "Phione", "Manaphy", "Darkrai", "Shaymin", "Arceus",
      "Victini", "Cobalion", "Terrakion", "Virizion", "Tornadus", "Thundurus", "Reshiram", "Zekrom", "Landorus", "Kyurem", "Keldeo", "Meloetta", "Genesect",
      "Xerneas", "Yveltal", "Zygarde", "Diancie", "Hoopa", "Volcanion",
      "Type: Null", "Tapu Koko", "Tapu Lele", "Tapu Bulu", "Tapu Fini", "Cosmog", "Cosmoem", "Solgaleo", "Lunala", "Necrozma",
      "Nihilego", "Buzzwole", "Pheromosa", "Xurkitree", "Celesteela", "Kartana", "Guzzlord", "Poipole", "Naganadel", "Stakataka", "Blacephalon",
      "Magearna", "Marshadow", "Zeraora", "Meltan", "Melmetal",
      "Zacian", "Zamazenta", "Eternatus", "Kubfu", "Urshifu", "Zarude", "Regieleki", "Regidrago", "Glastrier", "Spectrier", "Calyrex", "Enamorus",
      "Wo-Chien", "Chien-Pao", "Ting-Lu", "Chi-Yu", "Koraidon", "Miraidon", "Walking Wake", "Iron Leaves",
      "Okidogi", "Munkidori", "Fezandipiti", "Ogerpon", "Gouging Fire", "Raging Bolt", "Iron Boulder", "Iron Crown", "Terapagos", "Pecharunt"
    ].map(canonicalKey));
    const mythicalPokemonKeys = new Set([
      "Mew", "Celebi", "Jirachi", "Deoxys", "Phione", "Manaphy", "Darkrai", "Shaymin", "Arceus",
      "Victini", "Keldeo", "Meloetta", "Genesect", "Diancie", "Hoopa", "Volcanion", "Magearna",
      "Marshadow", "Zeraora", "Meltan", "Melmetal", "Zarude", "Pecharunt"
    ].map(canonicalKey));
    const ultraBeastPokemonKeys = new Set([
      "Nihilego", "Buzzwole", "Pheromosa", "Xurkitree", "Celesteela", "Kartana", "Guzzlord",
      "Poipole", "Naganadel", "Stakataka", "Blacephalon"
    ].map(canonicalKey));
    const specialNavItems = [
      {
        type: "legendary",
        label: "Lend\u00e1rios",
        predicate: entry => specialPokemonKeys.has(canonicalKey(entry.name))
          && !mythicalPokemonKeys.has(canonicalKey(entry.name))
          && !ultraBeastPokemonKeys.has(canonicalKey(entry.name))
      },
      {
        type: "mythical",
        label: "M\u00edticos",
        predicate: entry => mythicalPokemonKeys.has(canonicalKey(entry.name))
      },
      {
        type: "ultra",
        label: "Ultra Beasts",
        predicate: entry => ultraBeastPokemonKeys.has(canonicalKey(entry.name))
      }
    ];

    const manualGroups = parseSource(SOURCE);
    manualGroups.forEach(group => {
      group.name = categoryLabels[group.name] || group.name;
      group.entries.forEach(entry => {
        entry.sourceCategory = classifyCategory(group.name, entry.detail);
        entry.requiredPokemon = parseRequiredPokemon(entry.detail);
      });
    });
    const manualEntries = manualGroups.flatMap(group => group.entries);
    const manualByKey = new Map(manualEntries.map(entry => [canonicalKey(entry.name), entry]));
    const supplementalByKey = new Map(SUPPLEMENTAL_METHODS.map(entry => [canonicalKey(entry.name), entry]));
    const captureBiomesByKey = new Map(CAPTURE_BIOMES.map(entry => [canonicalKey(entry.name), entry]));
    const typesByKey = new Map(TYPE_DATA.map(entry => [canonicalKey(entry.name), entry]));
    const evolutionMembersByKey = new Map((EVOLUTION_DATA.pokemon || []).map(entry => [canonicalKey(entry.name), entry]));
    const evolutionChainsById = new Map((EVOLUTION_DATA.chains || []).map(chain => [chain.id, chain]));
    const breedingByKey = new Map(BREEDING_DATA.map(entry => [canonicalKey(entry.name), entry]));
    const allEntries = CATALOG.map(pokemon => {
      const nameKey = canonicalKey(pokemon.name);
      const manual = manualByKey.get(nameKey);
      const method = supplementalByKey.get(nameKey);
      const captureBiome = captureBiomesByKey.get(nameKey);
      const typeInfo = typesByKey.get(nameKey);
      const evolution = evolutionMembersByKey.get(nameKey);
      const breeding = breedingByKey.get(nameKey);
      const detail = manual?.detail || captureBiome?.detail || method?.detail || "";
      const rawCategory = manual?.sourceCategory || method?.category || (captureBiome ? encounterCategory : "");
      let sourceCategory = rawCategory
        ? classifyPokemonCategory(pokemon.name, rawCategory, detail)
        : unclassifiedCategory;
      if (sourceCategory === encounterCategory && !hasRealEncounterInfo(detail)) {
        sourceCategory = detail ? serverCategory : unclassifiedCategory;
      }
      return {
        id: pokemon.id,
        name: pokemon.name,
        detail: detail || (sourceCategory === specialCategory
          ? "Obtenção especial. Consulte o método configurado no servidor ou a wiki do Pixelmon."
          : ""),
        materials: manual?.materials || [],
        key: `pokemon::${pokemon.name}`,
        legacyKey: manual?.key,
        requiredPokemon: manual?.requiredPokemon || parseRequiredPokemon(detail),
        sourceCategory,
        wiki: captureBiome?.wiki || method?.wiki || "",
        types: typeInfo?.types || [],
        evolution: evolution || null,
        breeding: breeding || null,
        showDetailInline: !isFindingInformation(sourceCategory)
      };
    });

    function parseRequiredPokemon(detail) {
      return detail.match(/^(.+?)\s+lvl\s+\d+/i)?.[1]?.trim()
        || detail.match(/^Evoluir\s+(.+?)\s+(?:até|at\u00c3\u00a9|durante|a partir)/i)?.[1]?.trim()
        || "";
    }

    function classifyCategory(category, detail = "") {
      const categoryText = normalize(category || "");
      const detailText = normalize(detail);
      if (categoryText.includes("lendario") || categoryText.includes("mitico") || categoryText.includes("ultra beast")) return specialCategory;
      if (categoryText.includes("fossil") || detailText.includes("fossil") || detailText.includes("reviver")) return fossilCategory;
      if (categoryText === normalize(tradeCategory) || detailText.includes("por troca") || detailText.startsWith("trocar ") || detailText.includes(" traded")) return tradeCategory;
      if (categoryText.includes("pedra") || detailText.includes(" stone") || detailText.includes(" armor") || detailText.includes(" apple") || detailText.includes("exposed to")) return itemCategory;
      if (levelRequirementCategories.has(category) || categoryText === "evoluir por nivel" || /^evoluir .+ nivel \d+/i.test(detailText)) {
        return missingRequirementCategory;
      }
      if (categoryText.includes("evolucao especial") || categoryText.includes("requisito especial") || detailText.startsWith("subir o nivel")) return evolutionCategory;
      if (categoryText.includes("disponibilidade depende") || categoryText.includes("consultar wiki")) return serverCategory;
      if (categoryText.includes("encontrar") || detailText.includes("bioma")) return encounterCategory;
      return category || encounterCategory;
    }

    function classifyPokemonCategory(name, category, detail = "") {
      const result = classifyCategory(category, detail);
      return result === encounterCategory && specialPokemonKeys.has(canonicalKey(name))
        ? specialCategory
        : result;
    }

    function hasRealEncounterInfo(detail = "") {
      const text = normalize(detail);
      const rawText = detail.toLowerCase();
      if (!text) return false;
      if (text.includes("nao encontrado") || rawText.includes("nÃ£o encontrado") || text.includes("consulte") || text.includes("configuracao do servidor")) return false;
      return text.includes("biomas:") || text.includes("encontrar e capturar em");
    }

    function isFindingInformation(category) {
      return category === encounterCategory || category === specialCategory || category === serverCategory;
    }

    function getMethodFilter(entry) {
      const category = getCurrentCategory(entry);
      return methodFilters.find(filter => filter.categories?.has(category))?.value || "unknown";
    }

    const catalogByKey = new Map(allEntries.map(entry => [canonicalKey(entry.name), entry]));
    const catalogById = new Map(allEntries.map(entry => [entry.id, entry]));

    function readJsonStorage(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
      } catch {
        return fallback;
      }
    }

    function normalizeCapturedRecords(records) {
      if (!Array.isArray(records)) return [];
      const seen = new Set();
      const capturedRecords = [];
      records.forEach(record => {
        const rawName = typeof record === "string" ? record : record?.name;
        const key = canonicalKey(String(rawName || ""));
        const entry = catalogByKey.get(key);
        if (!entry || seen.has(key)) return;
        seen.add(key);
        capturedRecords.push({
          name: entry.name,
          capturedAt: typeof record === "object" && record?.capturedAt ? String(record.capturedAt) : ""
        });
      });
      return capturedRecords;
    }

    function setCapturedFromRecords(records) {
      capturedState.clear();
      normalizeCapturedRecords(records).forEach(record => {
        capturedState.set(canonicalKey(record.name), record);
      });
    }

    function getCapturedRecords() {
      return allEntries
        .filter(entry => capturedState.has(canonicalKey(entry.name)))
        .map(entry => {
          const record = capturedState.get(canonicalKey(entry.name));
          return {
            name: entry.name,
            capturedAt: record?.capturedAt || ""
          };
        });
    }

    function getCapturedNames() {
      return getCapturedRecords().map(record => record.name);
    }

    function markCaptured(entry, capturedAt = new Date().toISOString()) {
      capturedState.set(canonicalKey(entry.name), {
        name: entry.name,
        capturedAt
      });
    }

    function migrateLegacyStatus(status = {}) {
      return allEntries
        .filter(entry => {
          if (Object.prototype.hasOwnProperty.call(status, entry.key)) return status[entry.key] === true;
          if (entry.legacyKey && Object.prototype.hasOwnProperty.call(status, entry.legacyKey)) return status[entry.legacyKey] === true;
          return false;
        })
        .map(entry => entry.name);
    }

    function initializeLocalCapturedState() {
      const captured = readJsonStorage(STORAGE_KEY, null);
      if (Array.isArray(captured)) {
        setCapturedFromRecords(captured);
        return;
      }

      const legacyStatus = readJsonStorage(LEGACY_STORAGE_KEY, null);
      if (legacyStatus && typeof legacyStatus === "object") {
        setCapturedFromRecords(migrateLegacyStatus(legacyStatus));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(getCapturedRecords()));
      }
    }

    initializeLocalCapturedState();

    const searchInput = document.querySelector("#search");
    const pokemonSearchOptions = document.querySelector("#pokemon-search-options");
    const appShell = document.querySelector("#app-shell");
    const toolbar = document.querySelector(".toolbar");
    const checklistTab = document.querySelector("#flow-checklist");
    const capturedTab = document.querySelector("#flow-telemetry");
    const breedingTab = document.querySelector("#flow-breeding");
    const buildsTab = document.querySelector("#flow-builds");
    const checklistNavSections = document.querySelector("#checklist-nav-sections");
    const checklistFlowCount = document.querySelector("#flow-checklist-count");
    const telemetryFlowCount = document.querySelector("#flow-telemetry-count");
    const breedingFlowCount = document.querySelector("#flow-breeding-count");
    const buildsFlowCount = document.querySelector("#flow-builds-count");
    const themeToggleButton = document.querySelector("#theme-toggle");
    const densityToggleButton = document.querySelector("#density-toggle");
    const statusChips = document.querySelector("#status-chips");
    const methodChips = document.querySelector("#method-chips");
    const typeChips = document.querySelector("#type-chips");
    const sortChips = document.querySelector("#sort-chips");
    const generationNav = document.querySelector("#generation-nav");
    const specialNav = document.querySelector("#special-nav");
    const activeTitle = document.querySelector("#active-title");
    const visibleCount = document.querySelector("#visible-count");
    const logCaptureToggle = document.querySelector("#log-capture-toggle");
    const captureSidebar = document.querySelector(".capture-sidebar");
    const toggleLogSidebarButton = document.querySelector("#toggle-log-sidebar");
    const logSidebarRailButton = document.querySelector("#log-sidebar-rail");
    const logSidebarRailIcon = document.querySelector(".capture-rail-icon");
    const logSidebarBadge = document.querySelector("#log-sidebar-badge");
    const logPathInput = document.querySelector("#log-path-input");
    const logPathHint = document.querySelector("#log-path-hint");
    const saveLogPathButton = document.querySelector("#save-log-path");
    const logCaptureStatus = document.querySelector("#log-capture-status");
    const logCaptureList = document.querySelector("#log-capture-list");
    const refreshLogCapturesButton = document.querySelector("#refresh-log-captures");
    const clearLogCapturesButton = document.querySelector("#clear-log-captures");
    const pokemonModal = document.querySelector("#pokemon-modal");
    const pokemonModalContent = document.querySelector("#pokemon-modal-content");
    const pokemonModalClose = document.querySelector("#pokemon-modal-close");
    document.querySelector("#catalog-count").textContent = CATALOG.length;

    function renderSearchOptions() {
      pokemonSearchOptions.replaceChildren(...allEntries.map(entry => {
        const option = document.createElement("option");
        option.value = entry.name;
        return option;
      }));
    }

    function matchesActiveNavigation(entry) {
      if (activeNavigation.type === "generation") {
        return entry.id >= activeNavigation.start && entry.id <= activeNavigation.end;
      }
      if (activeNavigation.predicate) return activeNavigation.predicate(entry);
      return true;
    }

    function entriesForActiveNavigation() {
      return allEntries.filter(matchesActiveNavigation);
    }

    function createNavButton(item, count) {
      const button = document.createElement("button");
      const isActive = activeNavigation.type === item.type
        && (item.type !== "generation" || activeNavigation.start === item.start);
      button.className = `nav-button${isActive ? " active" : ""}`;
      button.type = "button";
      button.setAttribute("aria-pressed", isActive ? "true" : "false");

      const label = document.createElement("span");
      label.textContent = item.label;
      const badge = document.createElement("span");
      badge.className = "nav-count";
      badge.textContent = count;
      button.append(label, badge);

      button.addEventListener("click", () => {
        activeNavigation = item;
        activeView = "checklist";
        render();
      });
      return button;
    }

    function renderNavigation() {
      generationNav.replaceChildren(
        createNavButton(defaultNavigation, allEntries.length),
        ...generationRanges.map(item => createNavButton(
          item,
          allEntries.filter(entry => entry.id >= item.start && entry.id <= item.end).length
        ))
      );
      specialNav.replaceChildren(
        ...specialNavItems.map(item => createNavButton(
          item,
          allEntries.filter(item.predicate).length
        ))
      );
    }

    function createFilterChip({ label, active, count, onClick }) {
      const button = document.createElement("button");
      button.className = `filter-chip${active ? " active" : ""}`;
      button.type = "button";
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.textContent = count === undefined ? label : `${label} (${count})`;
      button.addEventListener("click", onClick);
      return button;
    }

    function renderFilterChips() {
      const visibleByNavigation = entriesForActiveNavigation();
      const passesStatusFilter = (entry, status = filterState.status) => {
        const done = isOwned(entry);
        return !status || (status === "done" ? done : !done);
      };
      const passesMethodFilter = (entry, methods = filterState.methods) =>
        !methods.size || methods.has(getMethodFilter(entry));
      const passesTypeFilter = (entry, types = filterState.types) =>
        !types.size || entry.types.some(type => types.has(type));
      const countFilteredEntries = ({
        status = filterState.status,
        methods = filterState.methods,
        types = filterState.types
      } = {}) =>
        visibleByNavigation.filter(entry =>
          passesStatusFilter(entry, status)
          && passesMethodFilter(entry, methods)
          && passesTypeFilter(entry, types)
        ).length;

      statusChips.replaceChildren(...statusFilters.map(filter => {
        const count = countFilteredEntries({ status: filter.value });
        return createFilterChip({
          label: filter.label,
          count,
          active: filterState.status === filter.value,
          onClick: () => {
            filterState.status = filter.value;
            render();
          }
        });
      }));

      methodChips.replaceChildren(...methodFilters.map(filter => {
        const count = countFilteredEntries({
          methods: filter.value ? new Set([filter.value]) : new Set()
        });
        return createFilterChip({
          label: filter.label,
          count,
          active: filter.value ? filterState.methods.has(filter.value) : !filterState.methods.size,
          onClick: () => {
            if (!filter.value) {
              filterState.methods.clear();
              render();
              return;
            }
            if (filterState.methods.has(filter.value)) {
              filterState.methods.delete(filter.value);
            } else {
              filterState.methods.add(filter.value);
            }
            render();
          }
        });
      }));

      typeChips.replaceChildren(
        createFilterChip({
          label: "Todos",
          count: countFilteredEntries({ types: new Set() }),
          active: !filterState.types.size,
          onClick: () => {
            filterState.types.clear();
            render();
          }
        }),
        ...typeFilters.map(filter => createFilterChip({
          label: filter.label,
          count: countFilteredEntries({ types: new Set([filter.value]) }),
          active: filterState.types.has(filter.value),
          onClick: () => {
            if (filterState.types.has(filter.value)) {
              filterState.types.delete(filter.value);
            } else {
              filterState.types.add(filter.value);
            }
            render();
          }
        }))
      );

      sortChips.replaceChildren(...sortOptions.map(option => createFilterChip({
        label: option.label,
        active: filterState.sort === option.value,
        onClick: () => {
          filterState.sort = option.value;
          render();
        }
      })));
    }

    applyViewPreferences();
    renderSearchOptions();
    renderFilterChips();

    async function persistData() {
      const captured = getCapturedRecords();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(captured));
      if (isTauriApp()) {
        try {
          await invokeTauri("save_state", { captured });
        } catch {
          document.querySelector("#storage-info").textContent = "Não foi possível atualizar o banco local do app.";
        }
        return;
      }
      if (!useFileDatabase) return;

      try {
        await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: 3, captured })
        });
      } catch {
        document.querySelector("#storage-info").textContent = "Não foi possível atualizar o banco local. Mantenha o iniciador aberto enquanto usa a página.";
      }
    }

    function saveState() {
      persistData();
    }

    function isOwned(entry) {
      return capturedState.has(canonicalKey(entry.name));
    }

    function pokemonSpriteSource(entry) {
      return `https://img.pokemondb.net/sprites/home/normal/${imageSlug(entry.name)}.png`;
    }

    function applyPokemonImageFallback(image) {
      image.onerror = () => {
        image.onerror = null;
        image.src = "data:image/svg+xml," + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="39" fill="#f7fbfb" stroke="#bfd2d8" stroke-width="7"/>
            <path d="M12 50h76" stroke="#bfd2d8" stroke-width="7"/>
            <circle cx="50" cy="50" r="14" fill="#fff" stroke="#bfd2d8" stroke-width="7"/>
          </svg>
        `);
      };
    }

    function createPokemonImage(entry, className) {
      const image = document.createElement("img");
      image.className = className;
      image.loading = "lazy";
      image.alt = entry.name;
      image.src = pokemonSpriteSource(entry);
      applyPokemonImageFallback(image);
      return image;
    }

    function getDisplayGroups() {
      if (!filterState.methods.size) {
        return [{
          name: "Todos",
          entries: getSortedEntries(allEntries)
        }];
      }

      const displayGroups = new Map();
      allEntries.forEach(entry => {
        const groupName = isOwned(entry) ? "Já capturados" : getCurrentCategory(entry);
        if (!displayGroups.has(groupName)) displayGroups.set(groupName, { name: groupName, entries: [] });
        displayGroups.get(groupName).entries.push(entry);
      });
      return [...displayGroups.values()].map(group => ({
        ...group,
        entries: getSortedEntries(group.entries)
      }));
    }

    function getSortedEntries(entries) {
      return entries.slice().sort(compareEntries);
    }

    function compareEntries(a, b) {
      if (filterState.sort === "alpha") {
        return a.name.localeCompare(b.name, "pt-BR") || a.id - b.id;
      }
      if (filterState.sort === "alpha-desc") {
        return b.name.localeCompare(a.name, "pt-BR") || a.id - b.id;
      }
      return a.id - b.id;
    }

    function getCurrentCategory(entry) {
      let groupName = entry.sourceCategory;
      if (levelRequirementCategories.has(groupName) && entry.requiredPokemon) {
        const requirement = catalogByKey.get(canonicalKey(entry.requiredPokemon));
        groupName = requirement && isOwned(requirement)
          ? availableRequirementCategory
          : missingRequirementCategory;
      }
      return groupName;
    }

    function getMethodFilterLabel(entry) {
      const method = getMethodFilter(entry);
      if (method === "unknown") return "Sem método definido";
      return methodFilters.find(filter => filter.value === method)?.label || "Especial";
    }

    function getSearchText(entry) {
      const dexNumber = String(entry.id).padStart(4, "0");
      return normalize(`${entry.id} ${dexNumber} #${dexNumber} ${entry.name} ${entry.detail} ${entry.materials.join(" ")}`);
    }

    function matchesTextSearch(entry, search) {
      if (!search) return true;
      const numericSearch = search.replace(/^#/, "").replace(/^0+/, "");
      if (/^\d+$/.test(numericSearch) && String(entry.id) === numericSearch) return true;
      return getSearchText(entry).includes(search);
    }

    function formatEggGroup(group) {
      return eggGroupLabels[group] || group.replace(/-/g, " ");
    }

    function formatPokemonType(type) {
      return typeLabels[type] || type;
    }

    function createTypeBadge(type) {
      const badge = document.createElement("span");
      badge.className = `type-badge type-${type}`;
      badge.textContent = formatPokemonType(type);
      return badge;
    }

    function getEggGroups(entry) {
      return entry?.breeding?.eggGroups?.length ? entry.breeding.eggGroups : ["no-eggs"];
    }

    function isUndiscovered(entry) {
      return getEggGroups(entry).includes("no-eggs");
    }

    function isDitto(entry) {
      return getEggGroups(entry).includes("ditto");
    }

    function canBreedWith(source, candidate) {
      if (!source || !candidate || source.id === candidate.id) return false;
      if (isUndiscovered(source) || isUndiscovered(candidate)) return false;
      if (isDitto(source)) return !isDitto(candidate);
      if (isDitto(candidate)) return true;
      const sourceGroups = new Set(getEggGroups(source));
      return getEggGroups(candidate).some(group => sourceGroups.has(group));
    }

    function getBreedingPartners(entry) {
      return allEntries
        .filter(candidate => canBreedWith(entry, candidate))
        .sort((a, b) => Number(isOwned(b)) - Number(isOwned(a)) || a.id - b.id);
    }

    function getGenderLabel(entry) {
      const rate = entry?.breeding?.genderRate;
      if (rate === -1) return "Sem genero";
      if (rate === 0) return "100% macho";
      if (rate === 8) return "100% femea";
      if (typeof rate !== "number") return "Nao informado";
      const female = Math.round(rate / 8 * 100);
      return `${100 - female}% macho / ${female}% femea`;
    }

    function createEggBadge(group) {
      const badge = document.createElement("span");
      badge.className = `egg-badge${group === "no-eggs" ? " no-eggs" : ""}`;
      badge.textContent = formatEggGroup(group);
      return badge;
    }

    function inferBuildRole(entry) {
      const types = new Set(entry.types || []);
      const fastTypes = new Set(["electric", "flying", "fire", "dragon", "ghost", "dark", "psychic"]);
      const physicalTypes = new Set(["fighting", "ground", "rock", "steel", "dark", "bug", "poison", "normal"]);
      const specialTypes = new Set(["psychic", "electric", "fire", "water", "grass", "ice", "dragon", "fairy", "ghost"]);
      const physicalTankTypes = new Set(["steel", "rock", "ground"]);
      const specialTankTypes = new Set(["water", "grass", "fairy", "poison"]);

      const isFast = [...types].some(type => fastTypes.has(type));
      const physicalScore = [...types].filter(type => physicalTypes.has(type)).length;
      const specialScore = [...types].filter(type => specialTypes.has(type)).length;

      if (isFast && specialScore >= physicalScore) return "special-sweeper";
      if (isFast && physicalScore > specialScore) return "physical-sweeper";
      if ([...types].some(type => physicalTankTypes.has(type))) return "physical-tank";
      if ([...types].some(type => specialTankTypes.has(type))) return "special-tank";
      if (isUndiscovered(entry) || getEggGroups(entry).includes("fairy")) return "support";
      if (specialScore > physicalScore) return "special-sweeper";
      if (physicalScore > specialScore) return "physical-sweeper";
      return "balanced";
    }

    function getBuildRecommendation(entry) {
      return getBuildRecommendations(entry)[0];
    }

    function getSuggestedBuildRoleKeys(entry) {
      const primary = inferBuildRole(entry);
      if (primary === "physical-tank") return ["physical-tank", "support"];
      if (primary === "special-tank") return ["special-tank", "support"];
      return [primary];
    }

    function materializeBuild(entry, roleKey, overrides = {}, index = 0) {
      const template = buildTemplates[roleKey] || buildTemplates.balanced;
      return {
        buildId: `${canonicalKey(entry.name)}-${roleKey}-${index}`,
        roleKey,
        source: "Sugerido geral",
        isMeta: false,
        ...template,
        ...overrides
      };
    }

    function getTypeEffectiveness(attackType, targetTypes = []) {
      return targetTypes.reduce((multiplier, targetType) => {
        const typeChart = typeEffectiveness[attackType] || {};
        return multiplier * (typeChart[targetType] ?? 1);
      }, 1);
    }

    function getBuildAttackTypes(entry, build) {
      const types = build.attackTypes?.length ? build.attackTypes : entry.types;
      return [...new Set(types.filter(Boolean))];
    }

    function getSuperEffectiveAttackTypes(targetType) {
      return Object.keys(typeEffectiveness)
        .filter(attackType => getTypeEffectiveness(attackType, [targetType]) > 1);
    }

    function getRaidMatchup(entry, build, shieldType) {
      const attackTypes = getBuildAttackTypes(entry, build);
      const strongAttackTypes = attackTypes
        .filter(type => getTypeEffectiveness(type, [shieldType]) > 1);
      const incomingMultiplier = getTypeEffectiveness(shieldType, entry.types);
      const defensiveLabel = incomingMultiplier === 0
        ? "Imune"
        : incomingMultiplier < 1
          ? "Resiste"
          : incomingMultiplier > 1
            ? "Sofre"
            : "Neutro";
      const score = (strongAttackTypes.length ? 80 : 0)
        + (build.isMeta ? 12 : 0)
        + (incomingMultiplier === 0 ? 18 : incomingMultiplier < 1 ? 10 : incomingMultiplier > 1 ? -18 : 0)
        + (build.damageType === "status" ? -8 : 0);

      return {
        attackTypes,
        strongAttackTypes,
        incomingMultiplier,
        defensiveLabel,
        score
      };
    }

    function getBuildRecommendations(entry) {
      const override = buildOverrides.get(canonicalKey(entry.name));
      if (override) {
        const overrideBuilds = Array.isArray(override) ? override : [override];
        return overrideBuilds.map((build, index) =>
          materializeBuild(entry, build.roleKey || "balanced", {
            source: build.source || "Meta cadastrada",
            isMeta: true,
            ...build
          }, index)
        );
      }

      return getSuggestedBuildRoleKeys(entry).map((roleKey, index) =>
        materializeBuild(entry, roleKey, {
          source: index === 0 ? "Sugerido principal" : "Alternativa"
        }, index)
      );
    }

    function formatEvSpread(build) {
      return build.evs.map(([stat, value]) => `${value} ${formatStatName(stat)}`).join(" / ");
    }

    function formatStatName(stat) {
      return {
        HP: "HP",
        Attack: "Atk",
        Defense: "Def",
        "Special Attack": "SpA",
        "Special Defense": "SpD",
        Speed: "Speed"
      }[stat] || stat;
    }

    function createEvSpread(build) {
      const wrap = document.createElement("div");
      wrap.className = "ev-spread";
      build.evs.forEach(([stat, value]) => {
        const chip = document.createElement("span");
        chip.className = "ev-chip";
        chip.innerHTML = `<strong></strong><span></span>`;
        chip.querySelector("strong").textContent = value;
        chip.querySelector("span").textContent = formatStatName(stat);
        wrap.append(chip);
      });
      return wrap;
    }

    function createBuildSummary(entry, options = {}) {
      const build = options.build || getBuildRecommendation(entry);
      const wrap = document.createElement("div");
      wrap.className = options.compact ? "build-summary compact" : "build-summary";
      wrap.innerHTML = `
        <div class="build-summary-header">
          <strong></strong>
          <span class="build-source-badge"></span>
          <span class="build-damage-badge"></span>
        </div>
        <div class="build-ev-slot"></div>
        <dl class="build-detail-list">
          <div><dt>Nature</dt><dd></dd></div>
          <div><dt>Item</dt><dd></dd></div>
        </dl>
      `;
      wrap.querySelector(".build-summary-header strong").textContent = `${build.name} - ${build.role}`;
      wrap.querySelector(".build-source-badge").textContent = build.source;
      wrap.querySelector(".build-damage-badge").textContent = buildDamageLabels[build.damageType] || "Dano flex";
      wrap.querySelector(".build-ev-slot").append(createEvSpread(build));
      const details = wrap.querySelectorAll(".build-detail-list dd");
      details[0].textContent = build.nature;
      details[1].textContent = build.item;
      if (!options.compact) {
        const attackTypes = document.createElement("div");
        attackTypes.className = "build-attack-types";
        getBuildAttackTypes(entry, build).forEach(type => attackTypes.append(createTypeBadge(type)));
        const moves = document.createElement("div");
        moves.className = "build-moves";
        moves.append(...build.moves.map(move => {
          const chip = document.createElement("span");
          chip.textContent = move;
          return chip;
        }));
        const note = document.createElement("p");
        note.className = "build-note";
        note.textContent = build.note;
        wrap.append(attackTypes, moves, note);
      }
      return wrap;
    }

    function getEvolutionChain(entry) {
      if (!entry?.evolution?.chainId) return null;
      return evolutionChainsById.get(entry.evolution.chainId)?.root || null;
    }

    function countEvolutionNodes(node) {
      if (!node) return 0;
      return 1 + node.children.reduce((total, child) => total + countEvolutionNodes(child), 0);
    }

    function findEvolutionNode(node, entry) {
      if (!node || !entry) return null;
      if (node.id === entry.id || canonicalKey(node.name) === canonicalKey(entry.name)) return node;
      for (const child of node.children || []) {
        const found = findEvolutionNode(child, entry);
        if (found) return found;
      }
      return null;
    }

    function collectEvolutionLeaves(node, leaves = []) {
      if (!node) return leaves;
      if (!node.children?.length) {
        const entry = catalogById.get(node.id) || catalogByKey.get(canonicalKey(node.name));
        if (entry) leaves.push(entry);
        return leaves;
      }
      node.children.forEach(child => collectEvolutionLeaves(child, leaves));
      return leaves;
    }

    function getFinalEvolutionEntries(entry) {
      const chain = getEvolutionChain(entry);
      if (!chain) return [entry];
      const node = findEvolutionNode(chain, entry);
      if (!node || !node.children?.length) return [entry];
      return collectEvolutionLeaves(node);
    }

    function isFinalEvolutionEntry(entry) {
      return getFinalEvolutionEntries(entry).some(finalEntry => finalEntry.id === entry.id);
    }

    function getBuildEligibleEntries() {
      return allEntries.filter(isFinalEvolutionEntry);
    }

    function createEvolutionCard(node, activeEntry) {
      const entry = catalogById.get(node.id) || catalogByKey.get(canonicalKey(node.name));
      const active = entry && entry.id === activeEntry.id;
      const owned = entry ? isOwned(entry) : false;
      const button = document.createElement("button");
      button.className = `evolution-card${active ? " is-active" : ""}`;
      button.type = "button";
      button.innerHTML = `
        <span class="evolution-image"></span>
        <span class="evolution-text">
          <strong></strong>
          <span class="evolution-requirement"></span>
          <span class="evolution-state"></span>
        </span>
      `;
      if (entry) {
        button.querySelector(".evolution-image").replaceWith(createPokemonImage(entry, ""));
      }
      button.querySelector("strong").textContent = entry
        ? `#${String(entry.id).padStart(4, "0")} ${entry.name}`
        : node.name;
      button.querySelector(".evolution-requirement").textContent = node.requirement || "Base";
      button.querySelector(".evolution-state").textContent = active ? "Atual" : owned ? "Capturado" : "Faltando";
      button.disabled = !entry;
      button.addEventListener("click", () => {
        if (!entry) return;
        activeModalEntry = entry;
        renderPokemonModal();
      });
      return button;
    }

    function createEvolutionTree(node, activeEntry) {
      const branch = document.createElement("div");
      branch.className = "evolution-branch";
      branch.append(createEvolutionCard(node, activeEntry));
      if (node.children.length) {
        const children = document.createElement("div");
        children.className = "evolution-children";
        node.children.forEach(child => {
          const childWrap = document.createElement("div");
          childWrap.className = "evolution-child";
          childWrap.append(createEvolutionTree(child, activeEntry));
          children.append(childWrap);
        });
        branch.append(children);
      }
      return branch;
    }

    async function loadPersistentData() {
      if (isTauriApp()) {
        try {
          const data = await invokeTauri("get_state");
          useFileDatabase = true;

          if (Array.isArray(data.captured)) {
            setCapturedFromRecords(data.captured);
          } else {
            setCapturedFromRecords([]);
            await persistData();
          }

          document.querySelector("#storage-info").textContent = "App local ativo: suas marcações ficam salvas no arquivo local do aplicativo.";
          render();
          refreshLogCaptureStatus();
          return;
        } catch {
          document.querySelector("#storage-info").textContent = "Banco local do app indisponível. As marcações continuam salvas nesta tela.";
        }
      }

      if (!["http:", "https:"].includes(location.protocol)) {
        render();
        return;
      }

      try {
        const response = await fetch("/api/state");
        if (!response.ok) throw new Error("Banco local indisponível");
        const data = await response.json();
        useFileDatabase = true;

        if (Array.isArray(data.captured)) {
          setCapturedFromRecords(data.captured);
        } else if (data.status && typeof data.status === "object") {
          setCapturedFromRecords(migrateLegacyStatus(data.status));
          await persistData();
        } else {
          setCapturedFromRecords([]);
          await persistData();
        }

        document.querySelector("#storage-info").textContent = BIOME_DATA_LOADED
          ? "Banco local ativo: suas marcações ficam salvas no arquivo pokemon-checklist-db.json."
          : "Banco local ativo, mas os biomas não carregaram. Feche a janela do iniciador e abra iniciar-checklist.bat novamente.";
      } catch {
        document.querySelector("#storage-info").textContent = "Banco local indisponível. As marcações continuam salvas neste navegador.";
      }

      render();
    }

    function updateStats() {
      const owned = allEntries.filter(isOwned).length;
      const percent = Math.min(100, Math.round(owned / CATALOG.length * 100));
      document.querySelector("#owned-count").textContent = owned;
      document.querySelector("#catalog-total-count").textContent = CATALOG.length;
      document.querySelector("#remaining-count").textContent = CATALOG.length - owned;
      document.querySelector("#percent-count").textContent = `${percent}%`;
      document.querySelector("#progress-bar").style.width = `${percent}%`;
      const note = document.querySelector("#collection-note");
      note.classList.remove("warning");
      note.textContent = "Base de capturados unificada";
    }

    function createCard(entry) {
      const done = isOwned(entry);
      const card = document.createElement("article");
      card.className = `card${done ? " done" : ""}`;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Abrir detalhes de ${entry.name}`);

      const image = createPokemonImage(entry, "art");

      const text = document.createElement("div");
      text.className = "card-main";
      text.innerHTML = `
        <div class="name-row">
          <div>
            <h3></h3>
            <span class="dex-number"></span>
          </div>
          <span class="status-dot" aria-hidden="true"></span>
        </div>
        <div class="meta-row">
          <span class="method-badge"></span>
        </div>
        ${entry.types.length ? `<div class="meta-row type-row"></div>` : ""}
        ${entry.detail && entry.showDetailInline ? `<p class="detail"></p>` : ""}
        ${entry.detail && !entry.showDetailInline ? `<span class="help-wrap"><button class="help-button" type="button" aria-label="Ver detalhes">?</button><span class="help-tooltip"></span></span>` : ""}
        ${entry.materials.length ? `<div class="meta-row materials-row"></div>` : ""}
      `;
      text.querySelector("h3").textContent = entry.name;
      text.querySelector(".dex-number").textContent = `#${String(entry.id).padStart(4, "0")}`;
      const method = getMethodFilter(entry);
      const methodBadge = text.querySelector(".method-badge");
      methodBadge.classList.add(`method-${method}`);
      methodBadge.textContent = getMethodFilterLabel(entry);
      if (entry.types.length) {
        const typeRow = text.querySelector(".type-row");
        entry.types.forEach(type => typeRow.append(createTypeBadge(type)));
      }
      if (entry.detail && entry.showDetailInline) text.querySelector(".detail").textContent = entry.detail;
      if (entry.detail && !entry.showDetailInline) {
        const help = text.querySelector(".help-wrap");
        const tooltip = help.querySelector(".help-tooltip");
        tooltip.textContent = entry.detail;
        if (entry.wiki) {
          const link = document.createElement("a");
          link.href = entry.wiki;
          link.target = "_blank";
          link.rel = "noopener";
          link.textContent = "Abrir Wiki Pixelmon";
          tooltip.append(link);
        }
        help.querySelector(".help-button").addEventListener("click", event => {
          event.stopPropagation();
          help.classList.toggle("open");
        });
      }
      if (entry.materials.length) {
        entry.materials.forEach(material => {
          const chip = document.createElement("span");
          chip.className = "material-badge";
          chip.textContent = material;
          text.querySelector(".materials-row").append(chip);
        });
      }

      const button = document.createElement("button");
      button.className = "complete-button";
      button.type = "button";
      button.textContent = done ? "\u2713 Adquirido" : "Marcar como capturado";
      if (done) {
        button.addEventListener("mouseenter", () => {
          button.textContent = "Desmarcar";
        });
        button.addEventListener("mouseleave", () => {
          button.textContent = "\u2713 Adquirido";
        });
      }
      button.addEventListener("click", event => {
        event.stopPropagation();
        const key = canonicalKey(entry.name);
        if (isOwned(entry)) {
          capturedState.delete(key);
        } else {
          markCaptured(entry);
        }
        saveState();
        render();
      });

      card.addEventListener("click", () => openPokemonModal(entry));
      card.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openPokemonModal(entry);
      });

      card.append(image, text, button);
      return card;
    }

    function createModalSection(title, content) {
      const section = document.createElement("article");
      section.className = "modal-section";
      const heading = document.createElement("h3");
      heading.textContent = title;
      section.append(heading);
      if (content instanceof Node) {
        section.append(content);
      } else {
        const paragraph = document.createElement("p");
        paragraph.textContent = content || "Nao informado";
        section.append(paragraph);
      }
      return section;
    }

    function createModalInfoRow(label, content) {
      const row = document.createElement("div");
      row.className = "modal-info-row";
      const term = document.createElement("dt");
      const value = document.createElement("dd");
      term.textContent = label;
      if (content instanceof Node) {
        value.append(content);
      } else {
        value.textContent = String(content || "Nao informado");
      }
      row.append(term, value);
      return row;
    }

    function renderPokemonModal() {
      const entry = activeModalEntry;
      if (!entry) return;
      const done = isOwned(entry);
      const record = capturedState.get(canonicalKey(entry.name));
      const partners = getBreedingPartners(entry);

      pokemonModalContent.replaceChildren();
      const hero = document.createElement("div");
      hero.className = "modal-hero";
      hero.append(createPokemonImage(entry, ""));
      const heroText = document.createElement("div");
      heroText.innerHTML = `
        <p class="modal-kicker"></p>
        <h2 class="modal-title" id="pokemon-modal-title"></h2>
        <div class="modal-actions"></div>
      `;
      heroText.querySelector(".modal-kicker").textContent = `#${String(entry.id).padStart(4, "0")} - ${getMethodFilterLabel(entry)}`;
      heroText.querySelector(".modal-title").textContent = entry.name;
      const captureButton = document.createElement("button");
      captureButton.className = `modal-capture-button${done ? " is-owned" : ""}`;
      captureButton.type = "button";
      captureButton.textContent = done ? "Adquirido - desmarcar" : "Marcar como capturado";
      captureButton.addEventListener("click", () => {
        const key = canonicalKey(entry.name);
        if (isOwned(entry)) {
          capturedState.delete(key);
        } else {
          markCaptured(entry);
        }
        saveState();
        render();
        renderPokemonModal();
      });
      heroText.querySelector(".modal-actions").append(captureButton);
      if (entry.wiki) {
        const wikiLink = document.createElement("a");
        wikiLink.className = "muted-button modal-capture-button";
        wikiLink.href = entry.wiki;
        wikiLink.target = "_blank";
        wikiLink.rel = "noopener";
        wikiLink.textContent = "Abrir Wiki";
        heroText.querySelector(".modal-actions").append(wikiLink);
      }
      hero.append(heroText);
      pokemonModalContent.append(hero);

      const layout = document.createElement("div");
      layout.className = "modal-detail-layout";

      const primaryColumn = document.createElement("div");
      primaryColumn.className = "modal-primary-column";

      const sideColumn = document.createElement("div");
      sideColumn.className = "modal-side-column";

      const summaryList = document.createElement("dl");
      summaryList.className = "modal-definition-list";
      [
        ["Status", done ? `Capturado (${formatCapturedDateTime(record?.capturedAt)})` : "Faltando"],
        ["Metodo", getMethodFilterLabel(entry)],
        ["Categoria", getCurrentCategory(entry)],
        ["Gender", getGenderLabel(entry)],
        ["Hatch cycles", entry.breeding?.hatchCycles ?? "Nao informado"],
        ["Breeding", isUndiscovered(entry) ? "Nao breeda" : `${partners.length} compativeis`]
      ].forEach(([term, value]) => summaryList.append(createModalInfoRow(term, value)));
      primaryColumn.append(createModalSection("Resumo", summaryList));

      const profileList = document.createElement("dl");
      profileList.className = "modal-definition-list modal-profile-list";

      const typeWrap = document.createElement("div");
      typeWrap.className = "breeding-meta";
      if (entry.types.length) {
        entry.types.forEach(type => typeWrap.append(createTypeBadge(type)));
      }
      profileList.append(createModalInfoRow("Tipo", entry.types.length ? typeWrap : "Nao informado"));

      const eggWrap = document.createElement("div");
      eggWrap.className = "breeding-meta";
      getEggGroups(entry).forEach(group => eggWrap.append(createEggBadge(group)));
      profileList.append(createModalInfoRow("Egg groups", eggWrap));

      profileList.append(createModalInfoRow("Obtencao", entry.detail || "Sem detalhe cadastrado."));

      if (entry.materials.length) {
        const materialsWrap = document.createElement("div");
        materialsWrap.className = "breeding-meta";
        entry.materials.forEach(material => {
          const chip = document.createElement("span");
          chip.className = "material-badge";
          chip.textContent = material;
          materialsWrap.append(chip);
        });
        profileList.append(createModalInfoRow("Itens", materialsWrap));
      }
      primaryColumn.append(createModalSection("Perfil", profileList));
      const modalBuilds = document.createElement("div");
      modalBuilds.className = "build-summary-list";
      if (isFinalEvolutionEntry(entry)) {
        getBuildRecommendations(entry).forEach(build => {
          modalBuilds.append(createBuildSummary(entry, { build }));
        });
      } else {
        const finalEntries = getFinalEvolutionEntries(entry);
        const note = document.createElement("p");
        note.className = "build-note";
        note.textContent = `Builds focadas apenas em evolucoes finais: ${finalEntries.map(finalEntry => finalEntry.name).join(", ")}.`;
        const links = document.createElement("div");
        links.className = "modal-partners";
        finalEntries.slice(0, 8).forEach(finalEntry => {
          const button = document.createElement("button");
          button.className = "modal-partner-button";
          button.type = "button";
          button.textContent = finalEntry.name;
          button.addEventListener("click", () => {
            activeModalEntry = finalEntry;
            renderPokemonModal();
          });
          links.append(button);
        });
        modalBuilds.append(note, links);
      }
      primaryColumn.append(createModalSection("Builds / EVs", modalBuilds));

      const evolutionChain = getEvolutionChain(entry);
      if (evolutionChain && countEvolutionNodes(evolutionChain) > 1) {
        const evolutionWrap = document.createElement("div");
        evolutionWrap.className = "modal-evolution-tree";
        evolutionWrap.append(createEvolutionTree(evolutionChain, entry));
        sideColumn.append(createModalSection("Evolucoes", evolutionWrap));
      }

      const partnersWrap = document.createElement("div");
      partnersWrap.className = "modal-partners";
      partners.slice(0, 8).forEach(partner => {
        const button = document.createElement("button");
        button.className = "modal-partner-button";
        button.type = "button";
        button.textContent = `${partner.name} ${isOwned(partner) ? "- capturado" : "- faltando"}`;
        button.addEventListener("click", () => {
          activeModalEntry = partner;
          renderPokemonModal();
        });
        partnersWrap.append(button);
      });
      if (partners.length) {
        const partnersContent = document.createElement("div");
        partnersContent.className = "modal-partners-block";
        const partnersSummary = document.createElement("p");
        partnersSummary.className = "modal-section-note";
        partnersSummary.textContent = `${Math.min(partners.length, 8)} de ${partners.length} compativeis`;
        partnersContent.append(partnersSummary, partnersWrap);
        sideColumn.append(createModalSection("Compativeis", partnersContent));
      }

      layout.append(primaryColumn, sideColumn);
      pokemonModalContent.append(layout);
    }

    function openPokemonModal(entry) {
      activeModalEntry = entry;
      renderPokemonModal();
      pokemonModal.hidden = false;
    }

    function closePokemonModal() {
      pokemonModal.hidden = true;
      activeModalEntry = null;
    }

    function getVisibleLogCaptureCandidates() {
      const seen = new Set();
      return logCaptureState.candidates
        .map(candidate => ({
          candidate,
          entry: catalogByKey.get(canonicalKey(candidate.pokemon))
        }))
        .filter(item => {
          if (!item.entry || isOwned(item.entry)) return false;
          const key = canonicalKey(item.entry.name);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function applyViewPreferences() {
      document.documentElement.dataset.theme = activeTheme;
      document.body.classList.toggle("compact-cards", isCompactMode);
      themeToggleButton.classList.toggle("active", activeTheme === "dark");
      themeToggleButton.setAttribute("aria-pressed", activeTheme === "dark" ? "true" : "false");
      themeToggleButton.textContent = activeTheme === "dark" ? "Tema claro" : "Tema escuro";
      densityToggleButton.classList.toggle("active", isCompactMode);
      densityToggleButton.setAttribute("aria-pressed", isCompactMode ? "true" : "false");
      densityToggleButton.textContent = isCompactMode ? "Cards normais" : "Modo compacto";
    }

    function applyLogPanelPreferences() {
      const pendingCount = getVisibleLogCaptureCandidates().length;
      appShell.classList.toggle("logs-collapsed", isLogSidebarCollapsed);
      captureSidebar.classList.toggle("is-collapsed", isLogSidebarCollapsed);
      toggleLogSidebarButton.textContent = "\u203a";
      toggleLogSidebarButton.title = "Recolher logs locais";
      toggleLogSidebarButton.setAttribute("aria-label", toggleLogSidebarButton.title);
      toggleLogSidebarButton.setAttribute("aria-expanded", "true");
      logSidebarRailIcon.textContent = "\u2039";
      logSidebarRailButton.setAttribute("aria-expanded", isLogSidebarCollapsed ? "false" : "true");
      logSidebarBadge.textContent = pendingCount > 99 ? "99+" : String(pendingCount);
      logSidebarBadge.classList.toggle("is-empty", pendingCount === 0);
      logSidebarRailButton.title = pendingCount
        ? `Abrir logs locais (${pendingCount} pendente${pendingCount === 1 ? "" : "s"})`
        : "Abrir logs locais";
      logSidebarRailButton.setAttribute("aria-label", logSidebarRailButton.title);
    }

    function setLogCaptureStatus(title, detailHtml) {
      const expanded = !isLogMonitorMinimized;
      logCaptureStatus.classList.toggle("monitor-minimized", isLogMonitorMinimized);
      logCaptureStatus.innerHTML = `
        <div class="capture-monitor-header">
          <strong>${escapeHtml(title)}</strong>
          <button class="capture-monitor-toggle" id="toggle-monitor-details" type="button" aria-expanded="${expanded ? "true" : "false"}">
            ${isLogMonitorMinimized ? "Expandir" : "Minimizar"}
          </button>
        </div>
        <span class="capture-monitor-details">${detailHtml || ""}</span>
      `;
    }

    function formatDateTimeLabel(value) {
      if (!value) return "--";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "--";
      return date.toLocaleTimeString("pt-BR", { hour12: false });
    }

    function formatBytesLabel(bytes) {
      const value = Number(bytes) || 0;
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${(value / 1024 / 1024).toFixed(1)} MB`;
    }

    function compactText(value, maxLength = 120) {
      const text = String(value || "");
      return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
    }

    function getLogCandidateTypeLabel(type) {
      if (type === "local-prize-pokemon") return "Prêmio";
      if (type === "local-capture-sent-to-pc") return "Enviado ao PC";
      if (type === "local-capture") return "Captura";
      return "Log";
    }

    function applyLogCaptureState(data = {}) {
      logCaptureState.enabled = Boolean(data.enabled);
      logCaptureState.configuredLogPath = data.configuredLogPath || "";
      logCaptureState.defaultLogPath = data.defaultLogPath || "";
      logCaptureState.needsLogPathConfig = Boolean(data.needsLogPathConfig);
      logCaptureState.activeFile = data.activeFile || "";
      logCaptureState.activePath = data.activePath || "";
      logCaptureState.candidates = Array.isArray(data.candidates) ? data.candidates : [];
      logCaptureState.lastChat = data.lastChat || null;
      logCaptureState.lastSignal = data.lastSignal || null;
      logCaptureState.lastCapture = data.lastCapture || null;
      logCaptureState.lastIgnored = data.lastIgnored || null;
      logCaptureState.lastScanAt = data.lastScanAt || "";
      logCaptureState.currentSize = Number(data.currentSize) || 0;
      logCaptureState.offset = Number(data.offset) || 0;
      logCaptureState.lastDelta = Number(data.lastDelta) || 0;
      logCaptureState.lastNoReadReason = data.lastNoReadReason || "";
      logCaptureState.pathResetCount = Number(data.pathResetCount) || 0;
      logCaptureState.pollCount = Number(data.pollCount) || 0;
      logCaptureState.linesRead = Number(data.linesRead) || 0;
      logCaptureState.chatLinesRead = Number(data.chatLinesRead) || 0;
      logCaptureState.eventsRead = Number(data.eventsRead) || 0;
      logCaptureState.candidateCount = Number(data.candidateCount) || logCaptureState.candidates.length;
      logCaptureState.lastError = data.lastError || "";
      if (document.activeElement !== logPathInput) {
        logPathInput.value = logCaptureState.configuredLogPath || logCaptureState.defaultLogPath;
      }
      scheduleLogCapturePolling();
      renderLogCapturePanel();
    }

    async function postLogCapture(path, body = {}) {
      if (isTauriApp()) {
        const commandMap = {
          "/api/log-capture": ["set_log_capture_enabled", { enabled: Boolean(body.enabled) }],
          "/api/log-capture/config": ["set_log_capture_config", { logPath: body.logPath || "" }],
          "/api/log-capture/ack": ["ack_log_capture", { ids: body.ids || [] }],
          "/api/log-capture/clear": ["clear_log_capture", {}]
        };
        const command = commandMap[path];
        if (!command) throw new Error("Comando indisponível");
        applyLogCaptureState(await invokeTauri(command[0], command[1]));
        return;
      }

      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("Monitor indisponível");
      applyLogCaptureState(await response.json());
    }

    async function refreshLogCaptureStatus() {
      if (!useFileDatabase) {
        renderLogCapturePanel();
        return;
      }
      logCaptureState.frontendPollCount += 1;
      logCaptureState.lastFrontendPollAt = new Date().toISOString();
      try {
        if (isTauriApp()) {
          applyLogCaptureState(await invokeTauri("get_log_capture"));
          return;
        }
        const response = await fetch("/api/log-capture");
        if (!response.ok) throw new Error("Monitor indisponível");
        applyLogCaptureState(await response.json());
      } catch {
        logCaptureState.lastError = "Não foi possível acessar o monitor de logs.";
        scheduleLogCapturePolling();
        renderLogCapturePanel();
      }
    }

    function scheduleLogCapturePolling() {
      if (logCaptureState.poller) {
        clearInterval(logCaptureState.poller);
        logCaptureState.poller = null;
      }
      if (useFileDatabase && logCaptureState.enabled) {
        logCaptureState.poller = setInterval(refreshLogCaptureStatus, 10000);
      }
    }

    async function acknowledgeLogCapture(ids) {
      if (!ids.length || !useFileDatabase) return;
      await postLogCapture("/api/log-capture/ack", { ids });
    }

    async function saveLogCapturePath() {
      if (!useFileDatabase) return;
      saveLogPathButton.disabled = true;
      try {
        const logPath = logPathInput.value.trim() || logCaptureState.defaultLogPath;
        await postLogCapture("/api/log-capture/config", { logPath });
      } catch {
        logCaptureState.lastError = "Não foi possível salvar a pasta de logs. Confirme se o caminho existe.";
        renderLogCapturePanel();
      } finally {
        saveLogPathButton.disabled = false;
      }
    }

    async function confirmLogCapture(candidate, entry) {
      if (!entry || isOwned(entry)) {
        await acknowledgeLogCapture([candidate.id]);
        return;
      }
      markCaptured(entry);
      await persistData();
      await acknowledgeLogCapture([candidate.id]);
      render();
    }

    function renderLogCapturePanel() {
      applyLogPanelPreferences();
      logCaptureToggle.checked = logCaptureState.enabled;
      logCaptureToggle.disabled = !useFileDatabase;
      logPathInput.disabled = !useFileDatabase;
      saveLogPathButton.disabled = !useFileDatabase;
      refreshLogCapturesButton.disabled = !useFileDatabase;
      clearLogCapturesButton.disabled = !useFileDatabase || !logCaptureState.candidates.length;
      logPathHint.textContent = logCaptureState.configuredLogPath
        ? "Caminho salvo para este computador."
        : `Primeiro uso: cole a pasta de logs. Sugestão: ${logCaptureState.defaultLogPath || "%APPDATA%\\CoreLauncher\\game\\instances\\Pixelmon Brasil - Gen 9\\logs"}`;

      if (!useFileDatabase) {
        setLogCaptureStatus("Servidor local necessário", "Abra pelo iniciar-checklist.bat para usar a captura por logs.");
      } else if (logCaptureState.lastError) {
        setLogCaptureStatus("Monitor com atenção", escapeHtml(logCaptureState.lastError));
      } else if (logCaptureState.needsLogPathConfig) {
        setLogCaptureStatus("Configure a pasta de logs", "Salve o caminho da pasta antes de ligar o monitor.");
      } else if (logCaptureState.enabled) {
        const details = [];
        details.push(`Tela consultou: ${logCaptureState.frontendPollCount}x, ${formatDateTimeLabel(logCaptureState.lastFrontendPollAt)}`);
        details.push(`Servidor varreu: ${logCaptureState.pollCount}x, ${formatDateTimeLabel(logCaptureState.lastScanAt)}`);
        details.push(`Arquivo: ${formatBytesLabel(logCaptureState.currentSize)} | offset: ${formatBytesLabel(logCaptureState.offset)} | delta: ${formatBytesLabel(logCaptureState.lastDelta)} | resets: ${logCaptureState.pathResetCount}`);
        details.push(`Linhas lidas: ${logCaptureState.linesRead} | chat: ${logCaptureState.chatLinesRead} | eventos: ${logCaptureState.eventsRead} | fila: ${logCaptureState.candidateCount}`);
        if (logCaptureState.lastNoReadReason) {
          details.push(`Leitura: ${logCaptureState.lastNoReadReason}`);
        }
        if (logCaptureState.lastChat) {
          details.push(`Último chat lido: ${logCaptureState.lastChat.logTime || "--:--:--"} - ${compactText(logCaptureState.lastChat.message)}`);
        }
        if (logCaptureState.lastCapture) {
          details.push(`Última detecção lida: ${logCaptureState.lastCapture.pokemon} - ${getLogCandidateTypeLabel(logCaptureState.lastCapture.type)} (${logCaptureState.lastCapture.logTime || "--:--:--"})`);
        }
        if (logCaptureState.lastIgnored) {
          details.push(`Ignorada: ${logCaptureState.lastIgnored.pokemon} - ${logCaptureState.lastIgnored.reason}`);
        }
        if (logCaptureState.lastSignal) {
          details.push(`Último sinal sem nome: ${logCaptureState.lastSignal.logTime || "--:--:--"}`);
        }
        const detailLines = [
          logCaptureState.activePath || logCaptureState.activeFile || "Aguardando arquivo ativo.",
          ...details
        ];
        setLogCaptureStatus("Monitor ligado", detailLines.map(escapeHtml).join("<br>"));
      } else {
        setLogCaptureStatus("Monitor desligado", "Ative para acompanhar novas capturas locais.");
      }

      const visibleCandidates = getVisibleLogCaptureCandidates();
      logCaptureList.replaceChildren();
      if (!visibleCandidates.length) {
        const empty = document.createElement("div");
        empty.className = "capture-empty";
        empty.textContent = logCaptureState.enabled
          ? "Nenhuma captura pendente de confirmação."
          : "Ligue o monitor para receber candidatos aqui.";
        logCaptureList.append(empty);
        return;
      }

      visibleCandidates.forEach(({ candidate, entry }) => {
        const card = document.createElement("article");
        card.className = "capture-card";
        const image = createPokemonImage(entry, "");
        const content = document.createElement("div");
        content.innerHTML = `
          <h3></h3>
          <p class="capture-meta"></p>
          <div class="capture-actions"></div>
        `;
        content.querySelector("h3").textContent = entry.name;
        content.querySelector(".capture-meta").textContent =
          `#${String(entry.id).padStart(4, "0")} • ${getLogCandidateTypeLabel(candidate.type)} • ${candidate.logTime || "agora"} • ${candidate.source || "log"}`;

        const confirmButton = document.createElement("button");
        confirmButton.className = "confirm-capture-button";
        confirmButton.type = "button";
        confirmButton.textContent = "Confirmar";
        confirmButton.addEventListener("click", () => confirmLogCapture(candidate, entry));

        const dismissButton = document.createElement("button");
        dismissButton.className = "dismiss-capture-button";
        dismissButton.type = "button";
        dismissButton.textContent = "Ignorar";
        dismissButton.addEventListener("click", () => acknowledgeLogCapture([candidate.id]));

        content.querySelector(".capture-actions").append(confirmButton, dismissButton);
        card.append(image, content);
        logCaptureList.append(card);
      });
    }

    function createSearchSuggestions(search, visible) {
      if (!search || visible > 0) return null;
      const suggestions = allEntries
        .filter(entry => matchesActiveNavigation(entry) && matchesTextSearch(entry, search))
        .slice(0, 8);
      if (!suggestions.length) return null;
      const categories = [...new Set(suggestions.map(getMethodFilterLabel))].join(", ");

      const section = document.createElement("section");
      section.className = "suggestions";
      section.innerHTML = `
        <p class="suggestions-title">Encontrado fora dos filtros atuais</p>
        <p class="suggestions-note"></p>
        <div class="grid"></div>
      `;
      section.querySelector(".suggestions-note").textContent =
        `Estes cards batem com a busca, mas estão fora dos filtros ativos. Categorias: ${categories}.`;
      const grid = section.querySelector(".grid");
      suggestions.forEach(entry => {
        grid.append(createCard(entry));
      });
      return section;
    }

    function getBreedingGroupOptions() {
      return [...new Set(allEntries.flatMap(getEggGroups))]
        .sort((a, b) => formatEggGroup(a).localeCompare(formatEggGroup(b), "pt-BR"));
    }

    function findBreedingSearchEntry(search) {
      const value = search.trim();
      if (!value) return null;
      const numeric = value.replace(/^#/, "").replace(/^0+/, "");
      if (/^\d+$/.test(numeric)) {
        return allEntries.find(entry => String(entry.id) === numeric) || null;
      }
      const key = canonicalKey(value);
      return allEntries.find(entry => canonicalKey(entry.name) === key) || null;
    }

    function createBreedingRow(entry) {
      const button = document.createElement("button");
      button.className = "breeding-row";
      button.type = "button";
      button.innerHTML = `
        <span class="breeding-row-image"></span>
        <span><strong></strong><span class="breeding-row-groups"></span></span>
        <span class="breeding-owned"></span>
      `;
      button.querySelector(".breeding-row-image").replaceWith(createPokemonImage(entry, ""));
      button.querySelector("strong").textContent = `#${String(entry.id).padStart(4, "0")} ${entry.name}`;
      button.querySelector(".breeding-row-groups").textContent = getEggGroups(entry).map(formatEggGroup).join(", ");
      button.querySelector(".breeding-owned").textContent = isOwned(entry) ? "Capturado" : "Faltando";
      button.addEventListener("click", () => openPokemonModal(entry));
      return button;
    }

    function renderBreedingTools(list, groups) {
      const wrapper = document.createElement("section");
      wrapper.className = "breeding-tools";
      wrapper.innerHTML = `
        <input class="search-field" id="breeding-search" type="search" list="pokemon-search-options" placeholder="Buscar Pokémon para ver compatíveis...">
        <div class="breeding-panel">
          <div class="chip-group" aria-label="Egg groups">
            <span class="chip-label">Egg group</span>
            <div class="breeding-chip-list"></div>
          </div>
        </div>
      `;
      const input = wrapper.querySelector("#breeding-search");
      input.value = breedingSearch;
      input.addEventListener("input", event => {
        breedingSearch = event.target.value;
        selectedBreedingKey = "";
        focusBreedingSearchAfterRender = true;
        render();
      });
      const chipList = wrapper.querySelector(".breeding-chip-list");
      [
        { value: "", label: "Todos" },
        ...groups.map(group => ({ value: group, label: formatEggGroup(group) }))
      ].forEach(group => {
        chipList.append(createFilterChip({
          label: group.label,
          active: breedingGroupFilter === group.value,
          count: allEntries.filter(entry => !group.value || getEggGroups(entry).includes(group.value)).length,
          onClick: () => {
            breedingGroupFilter = group.value;
            selectedBreedingKey = "";
            render();
          }
        }));
      });
      list.append(wrapper);
      if (focusBreedingSearchAfterRender) {
        focusBreedingSearchAfterRender = false;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }

    function renderSelectedBreeding(list, entry) {
      const partners = getBreedingPartners(entry);
      const summary = document.createElement("section");
      summary.className = "breeding-summary";

      const focus = document.createElement("article");
      focus.className = "breeding-focus";
      focus.innerHTML = `
        <div class="breeding-focus-header">
          <span class="breeding-focus-image"></span>
          <div>
            <p class="modal-kicker"></p>
            <h3></h3>
            <div class="breeding-meta"></div>
          </div>
        </div>
        <p class="breeding-note"></p>
      `;
      focus.querySelector(".breeding-focus-image").replaceWith(createPokemonImage(entry, ""));
      focus.querySelector(".modal-kicker").textContent = `#${String(entry.id).padStart(4, "0")} - ${getGenderLabel(entry)}`;
      focus.querySelector("h3").textContent = entry.name;
      getEggGroups(entry).forEach(group => focus.querySelector(".breeding-meta").append(createEggBadge(group)));
      focus.querySelector(".breeding-note").textContent = isUndiscovered(entry)
        ? "Este Pokémon está no grupo Undiscovered e não cruza por breeding."
        : `Hatch cycles: ${entry.breeding?.hatchCycles ?? "Nao informado"}. Compatíveis encontrados: ${partners.length}.`;

      const partnersCard = document.createElement("article");
      partnersCard.className = "breeding-partners";
      partnersCard.innerHTML = `
        <h3>Compatíveis</h3>
        <p class="breeding-note"></p>
        <div class="breeding-list"></div>
      `;
      partnersCard.querySelector(".breeding-note").textContent = isDitto(entry)
        ? "Ditto cruza com a maioria dos Pokémon que não estão em Undiscovered."
        : "Compatibilidade baseada em egg groups compartilhados e Ditto.";
      const partnerList = partnersCard.querySelector(".breeding-list");
      partners.slice(0, 80).forEach(partner => partnerList.append(createBreedingRow(partner)));
      if (!partners.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Nenhum parceiro compatível encontrado.";
        partnerList.append(empty);
      }

      summary.append(focus, partnersCard);
      list.append(summary);
      visibleCount.textContent = `${partners.length} compatíveis`;
    }

    function renderEggGroupOverview(list, groups) {
      const grid = document.createElement("section");
      grid.className = "egg-group-grid";
      groups.forEach(group => {
        const entries = allEntries.filter(entry => getEggGroups(entry).includes(group));
        const owned = entries.filter(isOwned).length;
        const card = document.createElement("button");
        card.className = "egg-group-card";
        card.type = "button";
        card.innerHTML = "<strong></strong><span></span><span></span>";
        card.querySelector("strong").textContent = formatEggGroup(group);
        card.children[1].textContent = `${entries.length} Pokémon no grupo`;
        card.children[2].textContent = `${owned} capturados`;
        card.addEventListener("click", () => {
          breedingGroupFilter = group;
          render();
        });
        grid.append(card);
      });
      list.append(grid);
    }

    function renderBreedingFlow(list) {
      const groups = getBreedingGroupOptions();
      const search = normalize(breedingSearch.trim());
      const selected = selectedBreedingKey
        ? catalogByKey.get(selectedBreedingKey)
        : findBreedingSearchEntry(breedingSearch);
      activeTitle.textContent = "Breeding";
      visibleCount.textContent = "";
      renderBreedingTools(list, groups);

      if (selected) {
        renderSelectedBreeding(list, selected);
        return;
      }

      const filteredEntries = allEntries.filter(entry =>
        (!breedingGroupFilter || getEggGroups(entry).includes(breedingGroupFilter))
        && matchesTextSearch(entry, search)
      );
      visibleCount.textContent = `${filteredEntries.length} Pokémon`;

      if (!breedingGroupFilter && !search) {
        renderEggGroupOverview(list, groups);
        return;
      }

      const section = document.createElement("section");
      section.className = "category";
      section.innerHTML = `
        <div class="category-heading">
          <h2></h2>
          <span class="category-count"></span>
        </div>
        <div class="breeding-list"></div>
      `;
      section.querySelector("h2").textContent = breedingGroupFilter ? formatEggGroup(breedingGroupFilter) : "Resultado";
      section.querySelector(".category-count").textContent = `${filteredEntries.length} Pokémon`;
      const rows = section.querySelector(".breeding-list");
      filteredEntries.forEach(entry => rows.append(createBreedingRow(entry)));
      list.append(section);
    }

    function renderBuildTools(list) {
      const wrapper = document.createElement("section");
      wrapper.className = "build-tools";
      wrapper.innerHTML = `
        <input class="search-field" id="build-search" type="search" list="pokemon-search-options" placeholder="Buscar Pokémon para ver EVs e build...">
        <div class="build-panel">
          <div class="chip-group" aria-label="Função da build">
            <span class="chip-label">Função</span>
            <div class="build-chip-list"></div>
          </div>
          <div class="chip-group" aria-label="Tipo de dano da build">
            <span class="chip-label">Dano</span>
            <div class="build-damage-chip-list"></div>
          </div>
          <div class="build-toggle-line"></div>
        </div>
      `;
      const input = wrapper.querySelector("#build-search");
      input.value = buildSearch;
      input.addEventListener("input", event => {
        buildSearch = event.target.value;
        focusBuildSearchAfterRender = true;
        render();
      });

      const chipList = wrapper.querySelector(".build-chip-list");
      buildRoleFilters.forEach(filter => {
        chipList.append(createFilterChip({
          label: filter.label,
          active: buildRoleFilter === filter.value,
          count: getAllBuildResults().filter(item => !filter.value || item.build.roleKey === filter.value).length,
          onClick: () => {
            buildRoleFilter = filter.value;
            render();
          }
        }));
      });

      const damageChipList = wrapper.querySelector(".build-damage-chip-list");
      buildDamageFilters.forEach(filter => {
        damageChipList.append(createFilterChip({
          label: filter.label,
          active: buildDamageFilter === filter.value,
          count: getAllBuildResults().filter(item => !filter.value || item.build.damageType === filter.value).length,
          onClick: () => {
            buildDamageFilter = filter.value;
            render();
          }
        }));
      });

      const metaToggle = document.createElement("button");
      metaToggle.className = `muted-button${buildMetaOnly ? " active" : ""}`;
      metaToggle.type = "button";
      metaToggle.textContent = buildMetaOnly ? "Mostrando meta" : "Somente meta";
      metaToggle.addEventListener("click", () => {
        buildMetaOnly = !buildMetaOnly;
        render();
      });
      wrapper.querySelector(".build-toggle-line").append(metaToggle);

      list.append(wrapper);
      if (focusBuildSearchAfterRender) {
        focusBuildSearchAfterRender = false;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }

    function getAllBuildResults() {
      return getBuildEligibleEntries().flatMap(entry =>
        getBuildRecommendations(entry).map(build => ({ entry, build }))
      );
    }

    function createBuildCard(entry, build) {
      const card = document.createElement("article");
      card.className = `build-card${build.isMeta ? " is-meta" : ""}`;
      card.innerHTML = `
        <div class="build-card-header">
          <span class="build-card-image"></span>
          <div>
            <p class="modal-kicker"></p>
            <h3></h3>
            <div class="breeding-meta"></div>
          </div>
        </div>
        <div class="build-card-body"></div>
        <div class="build-card-actions"></div>
      `;
      card.querySelector(".build-card-image").replaceWith(createPokemonImage(entry, ""));
      card.querySelector(".modal-kicker").textContent = `#${String(entry.id).padStart(4, "0")} - ${build.source} - ${buildDamageLabels[build.damageType] || "Dano flex"}`;
      card.querySelector("h3").textContent = `${entry.name} - ${build.name}`;
      entry.types.forEach(type => card.querySelector(".breeding-meta").append(createTypeBadge(type)));
      card.querySelector(".build-card-body").append(createBuildSummary(entry, { compact: true, build }));

      const openButton = document.createElement("button");
      openButton.className = "muted-button";
      openButton.type = "button";
      openButton.textContent = "Detalhes";
      openButton.addEventListener("click", () => openPokemonModal(entry));
      card.querySelector(".build-card-actions").append(openButton);
      return card;
    }

    function renderRaidAdvisor(list) {
      const section = document.createElement("section");
      section.className = "raid-panel";
      section.innerHTML = `
        <div class="raid-header">
          <div>
            <p class="eyebrow">Raids</p>
            <h2>Escudo elemental</h2>
          </div>
          <span class="category-count"></span>
        </div>
        <div class="chip-group" aria-label="Tipo do escudo elemental">
          <span class="chip-label">Escudo</span>
          <div class="raid-type-list"></div>
        </div>
        <div class="raid-content"></div>
      `;

      const typeList = section.querySelector(".raid-type-list");
      typeFilters.forEach(type => {
        typeList.append(createFilterChip({
          label: type.label,
          active: raidShieldType === type.value,
          count: getAllBuildResults().filter(({ entry, build }) =>
            getRaidMatchup(entry, build, type.value).strongAttackTypes.length
          ).length,
          onClick: () => {
            raidShieldType = raidShieldType === type.value ? "" : type.value;
            render();
          }
        }));
      });

      const content = section.querySelector(".raid-content");
      if (!raidShieldType) {
        section.querySelector(".category-count").textContent = "Escolha um tipo";
        const empty = document.createElement("p");
        empty.className = "raid-note";
        empty.textContent = "Selecione o tipo do escudo para ver builds com dano super efetivo e menor risco defensivo.";
        content.append(empty);
        list.append(section);
        return;
      }

      const results = getAllBuildResults()
        .map(({ entry, build }) => ({ entry, build, matchup: getRaidMatchup(entry, build, raidShieldType) }))
        .filter(item => item.matchup.strongAttackTypes.length)
        .sort((a, b) => b.matchup.score - a.matchup.score || a.entry.id - b.entry.id)
        .slice(0, 10);
      const counters = getSuperEffectiveAttackTypes(raidShieldType).map(formatPokemonType).join(", ");
      section.querySelector(".category-count").textContent = `${results.length} sugestoes`;

      const note = document.createElement("p");
      note.className = "raid-note";
      note.textContent = `Ataques bons contra escudo ${formatPokemonType(raidShieldType)}: ${counters}.`;
      content.append(note);

      const grid = document.createElement("div");
      grid.className = "raid-grid";
      results.forEach(({ entry, build, matchup }) => {
        const card = document.createElement("article");
        card.className = "raid-card";
        card.innerHTML = `
          <div class="raid-card-main">
            <span class="raid-card-image"></span>
            <div>
              <p class="modal-kicker"></p>
              <h3></h3>
              <div class="raid-card-types"></div>
            </div>
          </div>
          <div class="raid-tags"></div>
          <p class="raid-note"></p>
        `;
        card.querySelector(".raid-card-image").replaceWith(createPokemonImage(entry, ""));
        card.querySelector(".modal-kicker").textContent = `${build.name} - ${buildDamageLabels[build.damageType] || "Dano flex"}`;
        card.querySelector("h3").textContent = entry.name;
        matchup.strongAttackTypes.forEach(type => card.querySelector(".raid-card-types").append(createTypeBadge(type)));
        const tags = card.querySelector(".raid-tags");
        tags.append(createTextBadge(matchup.defensiveLabel));
        tags.append(createTextBadge(build.source));
        card.querySelector(".raid-note").textContent = `Use cobertura ${matchup.strongAttackTypes.map(formatPokemonType).join(" / ")}. Defesa vs ${formatPokemonType(raidShieldType)}: ${matchup.defensiveLabel}.`;
        card.addEventListener("click", () => openPokemonModal(entry));
        grid.append(card);
      });
      content.append(grid);
      list.append(section);
    }

    function createTextBadge(label) {
      const badge = document.createElement("span");
      badge.className = "text-badge";
      badge.textContent = label;
      return badge;
    }

    function renderBuildsFlow(list) {
      activeTitle.textContent = "Builds";
      renderBuildTools(list);
      renderRaidAdvisor(list);
      const search = normalize(buildSearch.trim());
      const results = getAllBuildResults().filter(({ entry, build }) =>
        matchesTextSearch(entry, search)
          && (!buildRoleFilter || build.roleKey === buildRoleFilter)
          && (!buildDamageFilter || build.damageType === buildDamageFilter)
          && (!buildMetaOnly || build.isMeta)
      );
      visibleCount.textContent = `${results.length} builds`;

      if (!results.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = buildMetaOnly
          ? "Nenhuma build meta cadastrada ainda."
          : "Nenhuma build encontrada com esses filtros.";
        list.append(empty);
        return;
      }

      const section = document.createElement("section");
      section.className = "build-results";
      section.innerHTML = `
        <div class="category-heading">
          <h2>EVs sugeridos</h2>
          <span class="category-count"></span>
        </div>
        <div class="build-grid"></div>
      `;
      section.querySelector(".category-count").textContent = `${results.length} builds`;
      const grid = section.querySelector(".build-grid");
      results
        .sort((a, b) => Number(b.build.isMeta) - Number(a.build.isMeta) || a.entry.id - b.entry.id || a.build.name.localeCompare(b.build.name, "pt-BR"))
        .forEach(({ entry, build }) => grid.append(createBuildCard(entry, build)));
      list.append(section);
    }

    function applyViewTabs() {
      const checklistActive = activeView === "checklist";
      const telemetryActive = activeView === "captured";
      const breedingActive = activeView === "breeding";
      const buildsActive = activeView === "builds";
      checklistTab.classList.toggle("active", checklistActive);
      capturedTab.classList.toggle("active", telemetryActive);
      breedingTab.classList.toggle("active", breedingActive);
      buildsTab.classList.toggle("active", buildsActive);
      checklistTab.setAttribute("aria-pressed", checklistActive ? "true" : "false");
      capturedTab.setAttribute("aria-pressed", telemetryActive ? "true" : "false");
      breedingTab.setAttribute("aria-pressed", breedingActive ? "true" : "false");
      buildsTab.setAttribute("aria-pressed", buildsActive ? "true" : "false");
      document.body.classList.toggle("flow-without-kpis", breedingActive || buildsActive);
      checklistNavSections.hidden = !checklistActive;
      toolbar.hidden = !checklistActive;
      const owned = allEntries.filter(isOwned).length;
      const percent = percentValue(owned, CATALOG.length);
      const breedable = allEntries.filter(entry => !isUndiscovered(entry)).length;
      checklistFlowCount.textContent = `${owned}/${CATALOG.length}`;
      telemetryFlowCount.textContent = `${percent}%`;
      breedingFlowCount.textContent = breedable;
      buildsFlowCount.textContent = getBuildEligibleEntries().length;
    }

    function formatCapturedDateTime(value) {
      if (!value) return "Sem data";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "Sem data";
      return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    function getCapturedTelemetryRows() {
      return getCapturedRecords()
        .map(record => {
          const entry = catalogByKey.get(canonicalKey(record.name));
          return entry ? { entry, record } : null;
        })
        .filter(Boolean)
        .sort((a, b) => {
          const aTime = Date.parse(a.record.capturedAt) || 0;
          const bTime = Date.parse(b.record.capturedAt) || 0;
          return bTime - aTime || a.entry.id - b.entry.id;
        });
    }

    function percentValue(count, total) {
      return total ? Math.round(count / total * 100) : 0;
    }

    function createCaptureBar({ label, count, total }) {
      const percent = percentValue(count, total);
      const row = document.createElement("div");
      row.className = "capture-bar-row";
      row.innerHTML = `
        <span></span>
        <span class="capture-bar-track"><span class="capture-bar-fill"></span></span>
        <span class="capture-bar-percent"></span>
      `;
      row.children[0].textContent = label;
      row.querySelector(".capture-bar-fill").style.setProperty("--percent", `${percent}%`);
      row.querySelector(".capture-bar-percent").textContent = `${percent}%`;
      row.title = `${count} de ${total} Pokémon`;
      return row;
    }

    function renderCaptureCharts(list, rows) {
      const capturedKeys = new Set(rows.map(({ entry }) => canonicalKey(entry.name)));
      const total = allEntries.length;
      const captured = rows.length;
      const overallPercent = percentValue(captured, total);

      const section = document.createElement("section");
      section.className = "capture-charts";
      section.setAttribute("aria-label", "Gráficos de porcentagem de captura");
      section.innerHTML = `
        <article class="capture-chart-card">
          <h3 class="capture-chart-title">Progresso geral</h3>
          <div class="capture-ring" aria-label="Progresso geral">
            <div class="capture-ring-inner"></div>
          </div>
          <p class="capture-chart-note"></p>
        </article>
        <article class="capture-chart-card">
          <h3 class="capture-chart-title">Por geração</h3>
          <div class="capture-bars" data-chart="generations"></div>
        </article>
        <article class="capture-chart-card">
          <h3 class="capture-chart-title">Por método</h3>
          <div class="capture-bars" data-chart="methods"></div>
        </article>
      `;

      const ring = section.querySelector(".capture-ring");
      ring.style.setProperty("--percent", `${overallPercent}%`);
      section.querySelector(".capture-ring-inner").textContent = `${overallPercent}%`;
      section.querySelector(".capture-chart-note").textContent = `${captured} de ${total} Pokémon capturados`;

      const generationBars = section.querySelector('[data-chart="generations"]');
      generationRanges.forEach(generation => {
        const entries = allEntries.filter(entry => entry.id >= generation.start && entry.id <= generation.end);
        const count = entries.filter(entry => capturedKeys.has(canonicalKey(entry.name))).length;
        generationBars.append(createCaptureBar({ label: generation.label.replace("Geração ", "Gen "), count, total: entries.length }));
      });

      const methodBars = section.querySelector('[data-chart="methods"]');
      methodFilters
        .filter(filter => filter.value)
        .forEach(filter => {
          const entries = allEntries.filter(entry => getMethodFilter(entry) === filter.value);
          const count = entries.filter(entry => capturedKeys.has(canonicalKey(entry.name))).length;
          methodBars.append(createCaptureBar({ label: filter.label, count, total: entries.length }));
        });

      list.append(section);
    }

    function renderCapturedTelemetry(list) {
      const rows = getCapturedTelemetryRows();
      const tableSearch = normalize(telemetrySearch.trim());
      const tableRows = rows.filter(({ entry }) => matchesTextSearch(entry, tableSearch));
      activeTitle.textContent = "Telemetria de captura";
      visibleCount.textContent = tableSearch
        ? `${tableRows.length} de ${rows.length} Pok\u00e9mon`
        : `${rows.length} Pok\u00e9mon`;
      renderCaptureCharts(list, rows);

      const searchWrap = document.createElement("div");
      searchWrap.className = "telemetry-search";
      searchWrap.innerHTML = `
        <input class="search-field" id="telemetry-search" type="search" list="pokemon-search-options" placeholder="Pesquisar na tabela de capturados...">
      `;
      const telemetrySearchInput = searchWrap.querySelector("#telemetry-search");
      telemetrySearchInput.value = telemetrySearch;
      telemetrySearchInput.addEventListener("input", event => {
        telemetrySearch = event.target.value;
        focusTelemetrySearchAfterRender = true;
        render();
      });
      list.append(searchWrap);
      if (focusTelemetrySearchAfterRender) {
        focusTelemetrySearchAfterRender = false;
        telemetrySearchInput.focus();
        telemetrySearchInput.setSelectionRange(telemetrySearchInput.value.length, telemetrySearchInput.value.length);
      }

      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Nenhum Pokémon capturado ainda.";
        list.append(empty);
        return;
      }
      if (!tableRows.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Nenhum Pokémon capturado encontrado com essa busca.";
        list.append(empty);
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.className = "telemetry-table-wrap";
      wrapper.innerHTML = `
        <table class="telemetry-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Pokémon</th>
              <th>Método</th>
              <th>Data de captura</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      `;
      const body = wrapper.querySelector("tbody");
      tableRows.forEach(({ entry, record }) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td class="telemetry-number"></td>
          <td class="telemetry-name"></td>
          <td></td>
          <td class="telemetry-date"></td>
        `;
        row.querySelector(".telemetry-number").textContent = `#${String(entry.id).padStart(4, "0")}`;
        row.querySelector(".telemetry-name").textContent = entry.name;
        row.children[2].textContent = getMethodFilterLabel(entry);
        row.querySelector(".telemetry-date").textContent = formatCapturedDateTime(record.capturedAt);
        body.append(row);
      });
      list.append(wrapper);
    }

    function render() {
      renderNavigation();
      renderFilterChips();
      applyViewTabs();
      const search = normalize(searchInput.value.trim());
      const list = document.querySelector("#list");
      list.replaceChildren();
      let visible = 0;

      if (activeView === "captured") {
        renderCapturedTelemetry(list);
        updateStats();
        renderLogCapturePanel();
        return;
      }

      if (activeView === "breeding") {
        renderBreedingFlow(list);
        updateStats();
        renderLogCapturePanel();
        return;
      }

      if (activeView === "builds") {
        renderBuildsFlow(list);
        updateStats();
        renderLogCapturePanel();
        return;
      }

      getDisplayGroups().forEach(group => {
        const entries = group.entries.filter(entry => {
          const done = isOwned(entry);
          const method = getMethodFilter(entry);
          return matchesActiveNavigation(entry)
            && matchesTextSearch(entry, search)
            && (!filterState.status || (filterState.status === "done" ? done : !done))
            && (!filterState.methods.size || filterState.methods.has(method))
            && (!filterState.types.size || entry.types.some(type => filterState.types.has(type)));
        });
        if (!entries.length) return;
        visible += entries.length;

        const section = document.createElement("section");
        section.className = "category";
        section.innerHTML = `
          <div class="category-heading">
            <h2></h2>
            <span class="category-count"></span>
          </div>
          <div class="grid"></div>
        `;
        section.querySelector("h2").textContent = group.name;
        section.querySelector(".category-count").textContent = `${entries.length} Pokémon`;
        const grid = section.querySelector(".grid");
        entries.forEach(entry => grid.append(createCard(entry)));
        list.append(section);
      });

      if (!visible) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Nenhum Pokémon encontrado com esses filtros.";
        list.append(empty);
      }
      const suggestions = createSearchSuggestions(search, visible);
      if (suggestions) list.append(suggestions);
      activeTitle.textContent = activeNavigation.label;
      visibleCount.textContent = `${visible} Pok\u00e9mon`;
      updateStats();
      renderLogCapturePanel();
    }

    function exportMissingPokemon() {
      const missingGroups = getDisplayGroups()
        .filter(group => group.name !== "Já capturados")
        .map(group => ({
          name: group.name,
          entries: group.entries.filter(entry => !isOwned(entry))
        }))
        .filter(group => group.entries.length);
      const total = missingGroups.reduce((sum, group) => sum + group.entries.length, 0);
      const lines = [
        "POKÉMON FALTANTES",
        `Exportado em: ${new Date().toLocaleString("pt-BR")}`,
        `Total: ${total}`,
        ""
      ];

      missingGroups.forEach(group => {
        lines.push(`## ${group.name}`);
        group.entries
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          .forEach(entry => lines.push(`- ${entry.name}${entry.detail ? ` — ${entry.detail}` : ""}`));
        lines.push("");
      });

      const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "pokemon-faltantes.txt";
      link.click();
      URL.revokeObjectURL(link.href);
    }

    checklistTab.addEventListener("click", () => {
      activeView = "checklist";
      render();
    });
    capturedTab.addEventListener("click", () => {
      activeView = "captured";
      render();
    });
    breedingTab.addEventListener("click", () => {
      activeView = "breeding";
      render();
    });
    buildsTab.addEventListener("click", () => {
      activeView = "builds";
      render();
    });
    searchInput.addEventListener("input", render);
    themeToggleButton.addEventListener("click", () => {
      activeTheme = activeTheme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, activeTheme);
      applyViewPreferences();
    });
    densityToggleButton.addEventListener("click", () => {
      isCompactMode = !isCompactMode;
      localStorage.setItem(DENSITY_KEY, isCompactMode ? "compact" : "normal");
      applyViewPreferences();
    });
    document.querySelector("#export-missing").addEventListener("click", exportMissingPokemon);
    document.querySelector("#clear-filters").addEventListener("click", () => {
      searchInput.value = "";
      filterState.status = "";
      filterState.methods.clear();
      filterState.types.clear();
      filterState.sort = "number";
      activeNavigation = defaultNavigation;
      activeView = "checklist";
      render();
    });
    toggleLogSidebarButton.addEventListener("click", () => {
      isLogSidebarCollapsed = !isLogSidebarCollapsed;
      localStorage.setItem(LOG_SIDEBAR_COLLAPSED_KEY, String(isLogSidebarCollapsed));
      renderLogCapturePanel();
    });
    logSidebarRailButton.addEventListener("click", () => {
      isLogSidebarCollapsed = false;
      localStorage.setItem(LOG_SIDEBAR_COLLAPSED_KEY, "false");
      renderLogCapturePanel();
    });
    logCaptureStatus.addEventListener("click", event => {
      if (!event.target.closest("#toggle-monitor-details")) return;
      isLogMonitorMinimized = !isLogMonitorMinimized;
      localStorage.setItem(LOG_MONITOR_MINIMIZED_KEY, String(isLogMonitorMinimized));
      renderLogCapturePanel();
    });
    logCaptureToggle.addEventListener("change", () => {
      const shouldEnable = logCaptureToggle.checked;
      const configureIfNeeded = logCaptureState.needsLogPathConfig && shouldEnable
        ? postLogCapture("/api/log-capture/config", { logPath: logPathInput.value.trim() || logCaptureState.defaultLogPath })
        : Promise.resolve();

      configureIfNeeded
        .then(() => postLogCapture("/api/log-capture", { enabled: shouldEnable }))
        .catch(() => {
          logCaptureState.lastError = "Nao foi possivel alterar o monitor de logs.";
          renderLogCapturePanel();
        });
    });
    saveLogPathButton.addEventListener("click", saveLogCapturePath);
    logPathInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveLogCapturePath();
      }
    });
    refreshLogCapturesButton.addEventListener("click", () => {
      refreshLogCaptureStatus();
    });
    clearLogCapturesButton.addEventListener("click", () => {
      postLogCapture("/api/log-capture/clear").catch(() => {
        logCaptureState.lastError = "Não foi possível limpar a fila.";
        renderLogCapturePanel();
      });
    });

    pokemonModalClose.addEventListener("click", closePokemonModal);
    pokemonModal.addEventListener("click", event => {
      if (event.target.matches("[data-close-modal]")) closePokemonModal();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !pokemonModal.hidden) closePokemonModal();
    });

    loadPersistentData().then(refreshLogCaptureStatus);

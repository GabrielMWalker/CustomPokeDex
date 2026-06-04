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
    const APP_META = window.POKELIST_APP_META || {
      name: "Pixelmon - Pokelist",
      version: "1.0.0",
      releaseUrl: "",
      updaterUrl: ""
    };
    const appUtils = window.POKELIST_UTILS || {};
    const getTauriInvoke = () => window.__TAURI__?.core?.invoke;
    const isTauriApp = () => Boolean(getTauriInvoke());
    const invokeTauri = (command, args = {}) => getTauriInvoke()(command, args);
    const capturedState = new Map();
    const filterState = { status: "", methods: new Set(), types: new Set(), sort: "number" };
    let activeView = "checklist";
    let captureSearch = "";
    let selectedCaptureBiome = "";
    let selectedCapturePeriod = "";
    let captureStatusFilter = "missing";
    let telemetrySearch = "";
    let breedingSearch = "";
    let breedingGroupFilter = "";
    let buildSearch = "";
    let buildRoleFilter = "";
    let buildDamageFilter = "";
    let raidShieldType = "";
    let counterSearch = "";
    let counterBossSearch = "";
    let selectedCounterBossKey = "";
    let counterTargetTypes = new Set();
    let counterOwnedOnly = false;
    let buildMetaOnly = false;
    let selectedBreedingKey = "";
    let focusTelemetrySearchAfterRender = false;
    let focusCaptureSearchAfterRender = false;
    let focusBreedingSearchAfterRender = false;
    let focusBuildSearchAfterRender = false;
    let focusCounterSearchAfterRender = false;
    let focusCounterBossSearchAfterRender = false;
    let updateCheckInProgress = false;
    let updateInstallInProgress = false;
    let appUpdateStatus = "";
    let appDialogResolve = null;
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

    function getCaptureBiomeData(entry) {
      return captureBiomesByKey.get(canonicalKey(entry.name)) || null;
    }

    function getEntryBiomes(entry) {
      return getCaptureBiomeData(entry)?.biomes || [];
    }

    function getCaptureBiomeGroupName(biome = "") {
      const raw = String(biome || "").trim();
      const value = normalize(raw.replace(/\s+\((byg|bop|forge|category)\)$/i, ""));
      if (!value) return "Outros";
      if (value === "any") return "Any";
      if (value.startsWith("ultra ")) return "Ultra Space";
      if (value.includes("end")) return "End";
      if (value.includes("hellish") || value.includes("nether") || value.includes("crimson") || value.includes("warped") || value.includes("basalt") || value.includes("soul sand")) return "Hellish";
      if (value.includes("beach") || value.includes("shore")) return "Beaches";
      if (value.includes("ocean") || value.includes("deep sea") || value.includes("dead sea")) return "Oceanic";
      if (value.includes("river")) return "Rivers";
      if (value.includes("lake")) return "Lakes";
      if (value.includes("swamp")) return "Swamps";
      if (value.includes("freezing forest") || value.includes("snowy forest")) return "Freezing Forests";
      if (value.includes("freezing mountain") || value.includes("snowy mountain") || value.includes("snowy slope") || value.includes("jagged peak") || value.includes("ice mountain") || value.includes("mount lanakila")) return "Freezing Mountains";
      if (value.includes("freezing") || value.includes("frozen") || value.includes("snowy") || value.includes("ice plains") || value.includes("cold")) return "Freezing";
      if (value.includes("redwood")) return "Redwoods";
      if (value.includes("birch") || value.includes("aspen")) return "Birches";
      if (value.includes("roofed") || value.includes("dark forest")) return "Roofed";
      if (value.includes("taiga")) return "Taigas";
      if (value.includes("jungle") || value.includes("bamboo") || value.includes("guiana shield")) return "Jungles";
      if (value.includes("mushroom")) return "Mushroom";
      if (value.includes("evil") || value.includes("burnt") || value.includes("pumpkin") || value.includes("wailing") || value.includes("wither")) return "Evil";
      if (value.includes("magical") || value.includes("mystic") || value.includes("twilight") || value.includes("enchanted") || value.includes("witch")) return "Magical";
      if (value.includes("flower") || value.includes("sunflower") || value.includes("allium") || value.includes("rose") || value.includes("lavender")) return "Flowery";
      if (value.includes("mesa") || value.includes("badland") || value.includes("red rock") || value.includes("bryce")) return "Mesas";
      if (value.includes("savanna")) return "Savannas";
      if (value.includes("arid") || value.includes("desert") || value.includes("dune") || value.includes("quartz")) return "Arid";
      if (value.includes("mountain") || value.includes("hill") || value.includes("peak") || value.includes("cliff") || value.includes("crag") || value.includes("slope") || value.includes("highland") || value.includes("crystalline chasm")) return "Mountainous";
      if (value.includes("forest") || value.includes("woods") || value.includes("grove") || value.includes("orchard")) return "Forests";
      if (value.includes("plains") || value.includes("grassland") || value.includes("prairie") || value.includes("field") || value.includes("clearing")) return "Plains";
      return "Outros";
    }

    function getEntryBiomeGroups(entry) {
      const groups = new Set();
      getEntryBiomes(entry).forEach(item => groups.add(getCaptureBiomeGroupName(item.biome)));
      return groups;
    }

    function getCaptureBiomeOptions() {
      const options = new Map();
      allEntries.forEach(entry => {
        getEntryBiomeGroups(entry).forEach(key => {
          const current = options.get(key) || { name: key, total: 0, missing: 0 };
          current.total += 1;
          if (!isOwned(entry)) current.missing += 1;
          options.set(key, current);
        });
      });
      return [...options.values()]
        .sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name, "pt-BR"));
    }

    function getCapturePeriodOptions() {
      const periods = new Set();
      allEntries.forEach(entry => {
        getEntryBiomes(entry).forEach(item => {
          String(item.period || "")
            .split(",")
            .map(period => period.trim())
            .filter(Boolean)
            .forEach(period => periods.add(period));
        });
      });
      return [...periods].sort((a, b) => a.localeCompare(b, "pt-BR"));
    }

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
    const captureTab = document.querySelector("#flow-capture");
    const capturedTab = document.querySelector("#flow-telemetry");
    const breedingTab = document.querySelector("#flow-breeding");
    const buildsTab = document.querySelector("#flow-builds");
    const settingsTab = document.querySelector("#flow-settings");
    const checklistNavSections = document.querySelector("#checklist-nav-sections");
    const checklistFlowCount = document.querySelector("#flow-checklist-count");
    const captureFlowCount = document.querySelector("#flow-capture-count");
    const telemetryFlowCount = document.querySelector("#flow-telemetry-count");
    const breedingFlowCount = document.querySelector("#flow-breeding-count");
    const buildsFlowCount = document.querySelector("#flow-builds-count");
    const settingsFlowCount = document.querySelector("#flow-settings-count");
    const themeToggleButton = document.querySelector("#theme-toggle");
    const densityToggleButton = document.querySelector("#density-toggle");
    const updateCheckButton = document.querySelector("#update-check");
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
    const appDialog = document.querySelector("#app-dialog");
    const appDialogKicker = document.querySelector("#app-dialog-kicker");
    const appDialogTitle = document.querySelector("#app-dialog-title");
    const appDialogMessage = document.querySelector("#app-dialog-message");
    const appDialogDetail = document.querySelector("#app-dialog-detail");
    const appDialogCancel = document.querySelector("#app-dialog-cancel");
    const appDialogConfirm = document.querySelector("#app-dialog-confirm");
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

    async function openExternalUrl(url) {
      if (!url) return;
      if (isTauriApp()) {
        await invokeTauri("open_external_url", { url });
        return;
      }
      window.open(url, "_blank", "noopener");
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
        const wikiLink = document.createElement("button");
        wikiLink.className = "muted-button modal-capture-button";
        wikiLink.type = "button";
        wikiLink.textContent = "Abrir Wiki";
        wikiLink.addEventListener("click", event => {
          event.preventDefault();
          openExternalUrl(entry.wiki).catch(() => {});
        });
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

    function closeAppDialog(result = false) {
      if (appDialog.hidden) return;
      appDialog.hidden = true;
      if (appDialogResolve) {
        appDialogResolve(result);
        appDialogResolve = null;
      }
    }

    function showAppDialog({
      kicker = "Pixelmon - Pokelist",
      title,
      message = "",
      detail = "",
      confirmLabel = "OK",
      cancelLabel = "Cancelar",
      showCancel = false
    }) {
      appDialogKicker.textContent = kicker;
      appDialogTitle.textContent = title;
      appDialogMessage.textContent = message;
      appDialogDetail.textContent = detail;
      appDialogDetail.hidden = !detail;
      appDialogCancel.textContent = cancelLabel;
      appDialogCancel.hidden = !showCancel;
      appDialogConfirm.textContent = confirmLabel;
      appDialog.hidden = false;
      appDialogConfirm.focus();
      return new Promise(resolve => {
        appDialogResolve = resolve;
      });
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
      updateCheckButton.hidden = !isTauriApp();
      updateCheckButton.disabled = updateCheckInProgress || !isTauriApp();
      updateCheckButton.textContent = updateInstallInProgress
        ? "Instalando..."
        : updateCheckInProgress
          ? "Buscando..."
          : "Buscar atualizacoes";
    }

    async function checkForAppUpdateManually() {
      if (!isTauriApp() || updateCheckInProgress) return;
      updateCheckInProgress = true;
      appUpdateStatus = "Buscando atualizacoes...";
      applyViewPreferences();
      try {
        const update = await invokeTauri("check_update");
        if (!update?.available) {
          appUpdateStatus = `Versao ${update?.currentVersion || "atual"} instalada.`;
          render();
          await showAppDialog({
            kicker: "Atualizacoes",
            title: "Tudo em dia",
            message: `Voce ja esta na versao mais recente (${update?.currentVersion || "atual"}).`,
            confirmLabel: "Fechar"
          });
          return;
        }
        appUpdateStatus = `Versao ${update.version} disponivel.`;
        render();
        const shouldInstall = await showAppDialog({
          kicker: "Atualizacoes",
          title: `Versao ${update.version} disponivel`,
          message: "Baixar, instalar e reiniciar o app agora?",
          detail: `Versao atual: ${update.currentVersion || "atual"}.`,
          confirmLabel: "Instalar agora",
          cancelLabel: "Depois",
          showCancel: true
        });
        if (!shouldInstall) return;
        updateInstallInProgress = true;
        appUpdateStatus = "Instalando atualizacao e reiniciando o app...";
        render();
        await invokeTauri("install_latest_update");
      } catch (error) {
        appUpdateStatus = "Nao foi possivel buscar atualizacoes.";
        render();
        await showAppDialog({
          kicker: "Atualizacoes",
          title: "Update indisponivel",
          message: "Nao foi possivel buscar atualizacoes.",
          detail: "Confira se a release no GitHub ja foi criada com os arquivos do updater.",
          confirmLabel: "Fechar"
        });
        console.warn("Nao foi possivel buscar atualizacoes.", error);
      } finally {
        updateCheckInProgress = false;
        updateInstallInProgress = false;
        applyViewPreferences();
      }
    }

    function applyLogPanelPreferences() {
      const pendingCount = getVisibleLogCaptureCandidates().length;
      appShell.classList.toggle("logs-collapsed", isLogSidebarCollapsed);
      captureSidebar.classList.toggle("is-collapsed", isLogSidebarCollapsed);
      toggleLogSidebarButton.textContent = "\u203a";
      toggleLogSidebarButton.title = "Recolher logs locais";
      toggleLogSidebarButton.setAttribute("aria-label", toggleLogSidebarButton.title);
      toggleLogSidebarButton.setAttribute("aria-expanded", "true");
      logSidebarRailIcon.textContent = "+";
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

    function maskLocalPath(value) {
      let text = String(value || "");
      if (!text) return text;
      text = text
        .replace(/^[A-Z]:\\Users\\[^\\]+\\AppData\\Roaming\\/i, "%APPDATA%\\")
        .replace(/^[A-Z]:\\Users\\[^\\]+\\AppData\\Local\\/i, "%LOCALAPPDATA%\\")
        .replace(/^[A-Z]:\\Users\\[^\\]+\\/i, "%USERPROFILE%\\");

      if (/^[A-Z]:\\/i.test(text)) {
        const parts = text.split("\\").filter(Boolean);
        if (parts.length > 4) return `...\\${parts.slice(-4).join("\\")}`;
      }
      return text;
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

    async function saveLogCapturePath(logPathValue = logPathInput.value, button = saveLogPathButton) {
      if (!useFileDatabase) return;
      button.disabled = true;
      try {
        const logPath = logPathValue.trim() || logCaptureState.defaultLogPath;
        await postLogCapture("/api/log-capture/config", { logPath });
      } catch {
        logCaptureState.lastError = "Não foi possível salvar a pasta de logs. Confirme se o caminho existe.";
        renderLogCapturePanel();
      } finally {
        button.disabled = false;
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
        : `Primeiro uso: cole a pasta de logs. Sugestão: ${maskLocalPath(logCaptureState.defaultLogPath || "%APPDATA%\\CoreLauncher\\game\\instances\\Pixelmon Brasil - Gen 9\\logs")}`;

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
          maskLocalPath(logCaptureState.activePath || logCaptureState.activeFile || "Aguardando arquivo ativo."),
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
      if (appUtils.appendProgressiveItems) {
        appUtils.appendProgressiveItems({
          container: grid,
          items: suggestions,
          renderItem: createCard,
          batchSize: 48,
          buttonLabel: "Mostrar mais sugestoes"
        });
      } else {
        suggestions.forEach(entry => grid.append(createCard(entry)));
      }
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

    function formatMultiplier(multiplier) {
      if (multiplier === 4) return "4x";
      if (multiplier === 2) return "2x";
      if (multiplier === 1) return "1x";
      if (multiplier === .5) return "0.5x";
      if (multiplier === .25) return "0.25x";
      if (multiplier === 0) return "0x";
      return `${multiplier}x`;
    }

    function getCounterTargetTypes() {
      return [...counterTargetTypes];
    }

    function getCounterAttackTypes(targetTypes) {
      if (!targetTypes.length) return [];
      return Object.keys(typeEffectiveness)
        .map(type => ({
          type,
          multiplier: getTypeEffectiveness(type, targetTypes)
        }))
        .filter(item => item.multiplier > 1)
        .sort((a, b) => b.multiplier - a.multiplier || formatPokemonType(a.type).localeCompare(formatPokemonType(b.type), "pt-BR"));
    }

    function getCounterDefenseLabel(entry, targetTypes) {
      if (!targetTypes.length) return "Neutro";
      const incoming = targetTypes.map(type => getTypeEffectiveness(type, entry.types));
      const worst = Math.max(...incoming);
      const best = Math.min(...incoming);
      if (worst === 0) return "Imune";
      if (worst < 1) return "Resiste";
      if (best === 0 && worst <= 1) return "Tem imunidade";
      if (worst > 1) return "Cuidado";
      return "Neutro";
    }

    function getCounterDefenseScore(entry, targetTypes) {
      if (!targetTypes.length) return 0;
      const incoming = targetTypes.map(type => getTypeEffectiveness(type, entry.types));
      const worst = Math.max(...incoming);
      const best = Math.min(...incoming);
      if (worst === 0) return 22;
      if (worst < 1) return 14;
      if (best === 0 && worst <= 1) return 12;
      if (worst > 1) return -16;
      return 0;
    }

    function entryHasCapturePeriod(entry, period) {
      if (!period) return true;
      return getEntryBiomes(entry).some(item =>
        String(item.period || "")
          .split(",")
          .map(value => value.trim().toLowerCase())
          .includes(period.toLowerCase())
      );
    }

    function entryHasBiome(entry, biome) {
      if (!biome) return true;
      const groups = getEntryBiomeGroups(entry);
      return groups.has("Any") || groups.has(biome);
    }

    function entryHasNightCapture(entry) {
      return getEntryBiomes(entry).some(item => {
        const period = normalize(item.period);
        return period.includes("night") || period.includes("midnight") || period.includes("dusk");
      });
    }

    function entryHasWaterBiome(entry) {
      return getEntryBiomes(entry).some(item => {
        const biome = normalize(item.biome);
        return biome.includes("ocean") || biome.includes("river") || biome.includes("lake") || biome.includes("beach") || biome.includes("swamp");
      });
    }

    function entryHasCaveLikeBiome(entry) {
      return getEntryBiomes(entry).some(item => {
        const biome = normalize(item.biome);
        return biome.includes("cave") || biome.includes("crater") || biome.includes("deep") || biome.includes("mountain");
      });
    }

    function getPokeballRecommendation(entry) {
      const category = getCurrentCategory(entry);
      const types = new Set(entry.types || []);
      const isSpecial = category === specialCategory || specialPokemonKeys.has(canonicalKey(entry.name)) || mythicalPokemonKeys.has(canonicalKey(entry.name)) || ultraBeastPokemonKeys.has(canonicalKey(entry.name));
      const night = entryHasNightCapture(entry);
      const waterBiome = entryHasWaterBiome(entry);
      const caveLike = entryHasCaveLikeBiome(entry);

      if (types.has("bug") || types.has("water")) {
        return {
          opener: "Quick Ball",
          primary: "Net Ball",
          backup: night || caveLike ? "Dusk Ball" : "Ultra Ball",
          reason: "Bonus forte contra tipos Water/Bug; use Quick Ball no primeiro turno.",
          priority: isSpecial ? "Alta" : "Media"
        };
      }

      if (night || caveLike || types.has("dark") || types.has("ghost")) {
        return {
          opener: "Quick Ball",
          primary: "Dusk Ball",
          backup: isSpecial ? "Timer Ball" : "Ultra Ball",
          reason: "Boa para capturas noturnas, cavernas e alvos Dark/Ghost.",
          priority: isSpecial ? "Alta" : "Media"
        };
      }

      if (waterBiome) {
        return {
          opener: "Quick Ball",
          primary: "Dive Ball",
          backup: "Net Ball",
          reason: "Rota aquatica; leve Net Ball se o alvo tambem for Water ou Bug.",
          priority: "Media"
        };
      }

      if (isSpecial) {
        return {
          opener: "Quick Ball",
          primary: "Timer Ball",
          backup: "Ultra Ball",
          reason: "Para lutas longas ou especiais, Timer Ball tende a ficar melhor com turnos.",
          priority: "Alta"
        };
      }

      return {
        opener: "Quick Ball",
        primary: "Ultra Ball",
        backup: "Timer Ball",
        reason: "Plano geral: Quick Ball abre a tentativa, Ultra Ball cobre o restante.",
        priority: "Normal"
      };
    }

    const pokeballVisuals = {
      "Quick Ball": { top: "#4daee8", bottom: "#f7d94a", mark: "#1d4f7a" },
      "Dusk Ball": { top: "#2f3b38", bottom: "#7cc05b", mark: "#f4cf65" },
      "Net Ball": { top: "#3d8eb8", bottom: "#eff8fa", mark: "#172f42" },
      "Dive Ball": { top: "#3f9fd7", bottom: "#f3fbff", mark: "#244f9f" },
      "Timer Ball": { top: "#e85252", bottom: "#f5f2df", mark: "#173042" },
      "Repeat Ball": { top: "#ee8a3a", bottom: "#f8e36c", mark: "#8d2c2c" },
      "Master Ball": { top: "#8c55c7", bottom: "#f6f0ff", mark: "#e9649a" },
      "Ultra Ball": { top: "#30343a", bottom: "#f4cf65", mark: "#ffffff" }
    };

    function getSpecialBallOptions(entry) {
      const recommendation = getPokeballRecommendation(entry);
      const types = new Set(entry.types || []);
      const owned = isOwned(entry);
      const category = getCurrentCategory(entry);
      const isSpecial = category === specialCategory || specialPokemonKeys.has(canonicalKey(entry.name)) || mythicalPokemonKeys.has(canonicalKey(entry.name)) || ultraBeastPokemonKeys.has(canonicalKey(entry.name));
      const night = entryHasNightCapture(entry);
      const waterBiome = entryHasWaterBiome(entry);
      const caveLike = entryHasCaveLikeBiome(entry);
      const options = new Map();
      const add = (name, score) => options.set(name, Math.max(options.get(name) || 0, score));

      add("Quick Ball", 88);
      add("Timer Ball", isSpecial ? 84 : 68);
      if (types.has("water") || types.has("bug")) add("Net Ball", 90);
      if (waterBiome) add("Dive Ball", types.has("water") ? 84 : 76);
      if (night || caveLike || types.has("dark") || types.has("ghost")) add("Dusk Ball", 88);
      if (owned) add("Repeat Ball", 92);
      if (isSpecial) add("Master Ball", 100);
      add(recommendation.primary, recommendation.priority === "Alta" ? 86 : 78);
      add(recommendation.backup, recommendation.priority === "Alta" ? 78 : 70);
      if (options.size < 3) add("Ultra Ball", 62);

      return [...options.entries()]
        .map(([name, score]) => ({ name, score: Math.min(100, score) }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"))
        .slice(0, 4);
    }

    function pokeballImageSrc(name) {
      const visual = pokeballVisuals[name] || pokeballVisuals["Ultra Ball"];
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="${visual.bottom}" stroke="#173042" stroke-width="4"/>
          <path d="M5 32a27 27 0 0 1 54 0H5z" fill="${visual.top}"/>
          <path d="M5 32h54" stroke="#173042" stroke-width="5"/>
          <circle cx="32" cy="32" r="11" fill="#fff" stroke="#173042" stroke-width="4"/>
          <circle cx="32" cy="32" r="5" fill="${visual.mark}"/>
        </svg>
      `;
      return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    function createPokeballOption(item) {
      const row = document.createElement("div");
      row.className = "pokeball-option";
      row.innerHTML = `
        <img alt="">
        <span class="pokeball-option-name"></span>
        <strong></strong>
      `;
      const image = row.querySelector("img");
      image.src = pokeballImageSrc(item.name);
      image.alt = item.name;
      row.querySelector(".pokeball-option-name").textContent = item.name;
      row.querySelector("strong").textContent = `${item.score}%`;
      return row;
    }

    function getCapturePriorityRank(entry) {
      const recommendation = getPokeballRecommendation(entry);
      const rank = { Alta: 0, Media: 1, Normal: 2 };
      return rank[recommendation.priority] ?? 3;
    }

    function matchesCaptureSearch(entry, search) {
      if (!search) return true;
      const recommendation = getPokeballRecommendation(entry);
      const biomeText = getEntryBiomes(entry).map(item => `${item.biome} ${item.period}`).join(" ");
      const biomeGroups = [...getEntryBiomeGroups(entry)].join(" ");
      return normalize(`${entry.id} ${entry.name} ${entry.detail} ${biomeText} ${biomeGroups} ${recommendation.primary} ${recommendation.backup}`).includes(search);
    }

    function getCaptureFilteredEntries() {
      const normalizedSearch = normalize(captureSearch.trim());
      return allEntries
        .filter(entry => getEntryBiomes(entry).length)
        .filter(entry => entryHasBiome(entry, selectedCaptureBiome))
        .filter(entry => entryHasCapturePeriod(entry, selectedCapturePeriod))
        .filter(entry => {
          if (captureStatusFilter === "missing") return !isOwned(entry);
          if (captureStatusFilter === "captured") return isOwned(entry);
          return true;
        })
        .filter(entry => matchesCaptureSearch(entry, normalizedSearch))
        .sort((a, b) =>
          Number(isOwned(a)) - Number(isOwned(b))
          || getCapturePriorityRank(a) - getCapturePriorityRank(b)
          || a.id - b.id
        );
    }

    function renderCaptureTools(list) {
      const biomeOptions = getCaptureBiomeOptions();
      const periodOptions = getCapturePeriodOptions();
      if (selectedCaptureBiome && !biomeOptions.some(option => option.name === selectedCaptureBiome)) {
        selectedCaptureBiome = "";
      }

      const tools = document.createElement("section");
      tools.className = "capture-planner-tools";
      tools.innerHTML = `
        <div class="capture-planner-panel">
          <div class="capture-planner-header">
            <div>
              <p class="eyebrow">Rota de captura</p>
              <h2 class="filter-title">Grupo e Poké Bola</h2>
            </div>
            <button class="link-button" id="clear-capture-route" type="button">Limpar rota</button>
          </div>
          <div class="capture-planner-fields">
            <label>
              <span>Grupo de bioma</span>
              <select id="capture-biome-select"></select>
            </label>
            <label>
              <span>Período</span>
              <select id="capture-period-select"></select>
            </label>
            <label>
              <span>Busca</span>
              <input id="capture-search" type="search" list="pokemon-search-options" placeholder="Nome, bola ou detalhe...">
            </label>
          </div>
          <div class="capture-status-filters" aria-label="Status de captura"></div>
        </div>
      `;

      const biomeSelect = tools.querySelector("#capture-biome-select");
      biomeSelect.append(new Option("Todos os grupos", ""));
      biomeOptions.forEach(option => {
        biomeSelect.append(new Option(`${option.name} (${option.missing}/${option.total})`, option.name));
      });
      biomeSelect.value = selectedCaptureBiome;
      biomeSelect.addEventListener("change", event => {
        selectedCaptureBiome = event.target.value;
        render();
      });

      const periodSelect = tools.querySelector("#capture-period-select");
      periodSelect.append(new Option("Todos os períodos", ""));
      periodOptions.forEach(period => periodSelect.append(new Option(period, period)));
      periodSelect.value = selectedCapturePeriod;
      periodSelect.addEventListener("change", event => {
        selectedCapturePeriod = event.target.value;
        render();
      });

      const search = tools.querySelector("#capture-search");
      search.value = captureSearch;
      search.addEventListener("input", event => {
        captureSearch = event.target.value;
        focusCaptureSearchAfterRender = true;
        render();
      });

      const statusFilters = tools.querySelector(".capture-status-filters");
      [
        { value: "missing", label: "Não capturados" },
        { value: "all", label: "Todos" },
        { value: "captured", label: "Já capturados" }
      ].forEach(filter => statusFilters.append(createFilterChip({
        label: filter.label,
        active: captureStatusFilter === filter.value,
        onClick: () => {
          captureStatusFilter = filter.value;
          render();
        }
      })));

      tools.querySelector("#clear-capture-route").addEventListener("click", () => {
        selectedCaptureBiome = "";
        selectedCapturePeriod = "";
        captureSearch = "";
        captureStatusFilter = "missing";
        render();
      });

      list.append(tools);
      if (focusCaptureSearchAfterRender) {
        focusCaptureSearchAfterRender = false;
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      }
    }

    function renderCaptureLoadout(list, entries) {
      const targetEntries = captureStatusFilter === "captured"
        ? entries
        : entries.filter(entry => !isOwned(entry));
      const ballCounts = new Map();
      targetEntries.forEach(entry => {
        const ball = getSpecialBallOptions(entry)[0]?.name || getPokeballRecommendation(entry).primary;
        ballCounts.set(ball, (ballCounts.get(ball) || 0) + 1);
      });

      const section = document.createElement("section");
      section.className = "capture-loadout";
      section.innerHTML = `
        <div class="capture-loadout-header">
          <div>
            <p class="eyebrow">Mochila sugerida</p>
            <h2>Plano do filtro atual</h2>
          </div>
          <span class="visible-count"></span>
        </div>
        <div class="capture-loadout-grid"></div>
      `;
      section.querySelector(".visible-count").textContent = captureStatusFilter === "captured"
        ? `${targetEntries.length} capturado${targetEntries.length === 1 ? "" : "s"}`
        : `${targetEntries.length} faltando`;
      const grid = section.querySelector(".capture-loadout-grid");

      if (!targetEntries.length) {
        const empty = document.createElement("p");
        empty.className = "capture-planner-note";
        empty.textContent = captureStatusFilter === "captured"
          ? "Nenhum capturado nesse filtro."
          : "Nenhum faltante nesse filtro. Troque o bioma ou veja capturados para revisar.";
        grid.append(empty);
      } else {
        [...ballCounts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
          .slice(0, 5)
          .forEach(([ball, count]) => {
            const item = document.createElement("article");
            item.className = "capture-loadout-card";
            item.innerHTML = `<strong></strong><span></span>`;
            item.querySelector("strong").textContent = ball;
            item.querySelector("span").textContent = `${count} alvo${count === 1 ? "" : "s"}`;
            grid.append(item);
          });
      }

      list.append(section);
    }

    function createCapturePlannerCard(entry) {
      const recommendation = getPokeballRecommendation(entry);
      const card = document.createElement("article");
      card.className = `capture-planner-card${isOwned(entry) ? " is-owned" : ""}`;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Abrir detalhes de ${entry.name}`);
      card.innerHTML = `
        <div class="capture-card-top">
          <span class="capture-card-image"></span>
          <div class="pokeball-options" aria-label="Poké Bolas recomendadas"></div>
        </div>
        <div class="capture-card-main">
          <div>
            <p class="modal-kicker"></p>
            <h3></h3>
            <div class="raid-card-types"></div>
          </div>
        </div>
        <p class="capture-reason"></p>
      `;
      card.querySelector(".capture-card-image").replaceWith(createPokemonImage(entry, ""));
      card.querySelector(".modal-kicker").textContent = `#${String(entry.id).padStart(4, "0")} - ${getMethodFilterLabel(entry)}`;
      card.querySelector("h3").textContent = entry.name;
      entry.types.forEach(type => card.querySelector(".raid-card-types").append(createTypeBadge(type)));
      getSpecialBallOptions(entry).forEach(item => {
        card.querySelector(".pokeball-options").append(createPokeballOption(item));
      });
      card.querySelector(".capture-reason").textContent = recommendation.reason;

      card.addEventListener("click", () => openPokemonModal(entry));
      card.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openPokemonModal(entry);
      });
      return card;
    }

    function renderCaptureFlow(list) {
      activeTitle.textContent = "Captura por bioma";
      renderCaptureTools(list);
      const entries = getCaptureFilteredEntries();
      const totalMissingWithBiomes = allEntries.filter(entry => getEntryBiomes(entry).length && !isOwned(entry)).length;
      visibleCount.textContent = `${entries.length} alvo${entries.length === 1 ? "" : "s"}`;
      captureFlowCount.textContent = totalMissingWithBiomes;
      renderCaptureLoadout(list, entries);

      const section = document.createElement("section");
      section.className = "capture-planner-results";
      section.innerHTML = `
        <div class="category-heading">
          <h2></h2>
          <span class="category-count"></span>
        </div>
        <div class="capture-planner-grid"></div>
      `;
      const statusHeading = captureStatusFilter === "captured"
        ? "Capturados"
        : captureStatusFilter === "all"
          ? "Todos os alvos"
          : "Não capturados";
      section.querySelector("h2").textContent = selectedCaptureBiome
        ? `${statusHeading} em ${selectedCaptureBiome}`
        : statusHeading;
      section.querySelector(".category-count").textContent = `${entries.length} resultado${entries.length === 1 ? "" : "s"}`;
      const grid = section.querySelector(".capture-planner-grid");

      if (!entries.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = selectedCaptureBiome
          ? "Nenhum Pokémon encontrado para esse grupo com os filtros atuais."
          : "Nenhum Pokémon com bioma cadastrado encontrado com os filtros atuais.";
        section.append(empty);
      } else if (appUtils.appendProgressiveItems) {
        appUtils.appendProgressiveItems({
          container: grid,
          items: entries,
          renderItem: createCapturePlannerCard,
          batchSize: 72,
          buttonLabel: "Mostrar mais capturas"
        });
      } else {
        entries.forEach(entry => grid.append(createCapturePlannerCard(entry)));
      }

      list.append(section);
    }

    function getCounterCandidates(targetTypes, search = "") {
      if (!targetTypes.length) return [];
      const normalizedSearch = normalize(search.trim());
      return getBuildEligibleEntries()
        .filter(entry => !counterOwnedOnly || isOwned(entry))
        .filter(entry => !normalizedSearch || matchesTextSearch(entry, normalizedSearch))
        .map(entry => {
          const builds = getBuildRecommendations(entry);
          const attackTypes = new Set(entry.types);
          builds.forEach(build => getBuildAttackTypes(entry, build).forEach(type => attackTypes.add(type)));
          const strongTypes = [...attackTypes]
            .map(type => ({
              type,
              multiplier: getTypeEffectiveness(type, targetTypes)
            }))
            .filter(item => item.multiplier > 1)
            .sort((a, b) => b.multiplier - a.multiplier || formatPokemonType(a.type).localeCompare(formatPokemonType(b.type), "pt-BR"));
          if (!strongTypes.length) return null;
          const strongest = strongTypes[0]?.multiplier || 1;
          const hasMetaBuild = builds.some(build =>
            build.isMeta && getBuildAttackTypes(entry, build).some(type => strongTypes.some(item => item.type === type))
          );
          const score = strongest * 100
            + (hasMetaBuild ? 20 : 0)
            + (isOwned(entry) ? 8 : 0)
            + getCounterDefenseScore(entry, targetTypes)
            - entry.id / 10000;
          return {
            entry,
            strongTypes,
            hasMetaBuild,
            defenseLabel: getCounterDefenseLabel(entry, targetTypes),
            score
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.entry.id - b.entry.id);
    }

    function getCounterBossSuggestions(search) {
      const normalizedSearch = normalize(search.trim());
      if (!normalizedSearch) return [];
      return allEntries
        .filter(entry => entry.types.length && matchesTextSearch(entry, normalizedSearch))
        .sort((a, b) => a.id - b.id)
        .slice(0, 8);
    }

    function selectCounterBoss(entry) {
      if (!entry?.types?.length) return;
      counterBossSearch = entry.name;
      selectedCounterBossKey = canonicalKey(entry.name);
      counterTargetTypes = new Set(entry.types);
      counterSearch = "";
      render();
    }

    function renderCounterBossSuggestions(wrapper, suggestions) {
      const panel = wrapper.querySelector(".counter-boss-suggestions");
      panel.replaceChildren();
      panel.hidden = !suggestions.length;
      suggestions.forEach(entry => {
        const button = document.createElement("button");
        button.className = "counter-boss-option";
        button.type = "button";
        button.innerHTML = `
          <span class="counter-boss-image"></span>
          <span class="counter-boss-text">
            <strong></strong>
            <span class="counter-boss-types"></span>
          </span>
        `;
        button.querySelector(".counter-boss-image").replaceWith(createPokemonImage(entry, ""));
        button.querySelector("strong").textContent = `#${String(entry.id).padStart(4, "0")} ${entry.name}`;
        entry.types.forEach(type => button.querySelector(".counter-boss-types").append(createTypeBadge(type)));
        button.addEventListener("click", () => selectCounterBoss(entry));
        panel.append(button);
      });
    }

    function renderCounterTools(list) {
      const wrapper = document.createElement("section");
      wrapper.className = "counter-tools";
      wrapper.innerHTML = `
        <div class="counter-panel">
          <div class="counter-panel-header">
            <h2 class="filter-title">Tipos do inimigo</h2>
            <button class="link-button" id="clear-counter-types" type="button">Limpar tipos</button>
          </div>
          <div class="counter-boss-search">
            <input class="search-field" id="counter-boss-search" type="search" placeholder="Buscar boss por nome ou numero...">
            <div class="counter-boss-suggestions" hidden></div>
          </div>
          <div class="chip-group" aria-label="Tipos do inimigo">
            <span class="chip-label">Tipo</span>
            <div class="counter-chip-list"></div>
          </div>
        </div>
      `;
      const bossInput = wrapper.querySelector("#counter-boss-search");
      const bossSuggestions = selectedCounterBossKey ? [] : getCounterBossSuggestions(counterBossSearch);
      bossInput.value = counterBossSearch;
      bossInput.addEventListener("input", event => {
        counterBossSearch = event.target.value;
        selectedCounterBossKey = "";
        focusCounterBossSearchAfterRender = true;
        render();
      });
      bossInput.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        const [firstSuggestion] = getCounterBossSuggestions(counterBossSearch);
        if (!firstSuggestion) return;
        event.preventDefault();
        selectCounterBoss(firstSuggestion);
      });
      renderCounterBossSuggestions(wrapper, bossSuggestions);

      const chipList = wrapper.querySelector(".counter-chip-list");
      typeFilters.forEach(type => {
        const nextTypes = new Set(counterTargetTypes);
        if (nextTypes.has(type.value)) nextTypes.delete(type.value);
        else nextTypes.add(type.value);
        const countTypes = counterTargetTypes.has(type.value)
          ? getCounterTargetTypes()
          : [...nextTypes];
        chipList.append(createFilterChip({
          label: type.label,
          active: counterTargetTypes.has(type.value),
          count: getCounterCandidates(countTypes).length,
          onClick: () => {
            if (counterTargetTypes.has(type.value)) counterTargetTypes.delete(type.value);
            else counterTargetTypes.add(type.value);
            counterBossSearch = "";
            selectedCounterBossKey = "";
            render();
          }
        }));
      });

      wrapper.querySelector("#clear-counter-types").addEventListener("click", () => {
        counterBossSearch = "";
        selectedCounterBossKey = "";
        counterTargetTypes = new Set();
        render();
      });

      list.append(wrapper);
      if (focusCounterBossSearchAfterRender) {
        focusCounterBossSearchAfterRender = false;
        bossInput.focus();
        bossInput.setSelectionRange(bossInput.value.length, bossInput.value.length);
      }
    }

    function renderCounterResultsSearch(list) {
      const searchWrap = document.createElement("div");
      searchWrap.className = "counter-results-search";
      searchWrap.innerHTML = `
        <input class="search-field" id="counter-search" type="search" list="pokemon-search-options" placeholder="Pesquisar nas sugestoes...">
        <div class="counter-results-filters" aria-label="Filtros dos resultados de counters"></div>
      `;
      const input = searchWrap.querySelector("#counter-search");
      input.value = counterSearch;
      input.addEventListener("input", event => {
        counterSearch = event.target.value;
        focusCounterSearchAfterRender = true;
        render();
      });
      const filters = searchWrap.querySelector(".counter-results-filters");
      filters.append(createFilterChip({
        label: "Somente capturados",
        active: counterOwnedOnly,
        onClick: () => {
          counterOwnedOnly = !counterOwnedOnly;
          render();
        }
      }));
      list.append(searchWrap);
      if (focusCounterSearchAfterRender) {
        focusCounterSearchAfterRender = false;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }

    function renderCounterSummary(list, targetTypes) {
      const section = document.createElement("section");
      section.className = "counter-summary";
      section.innerHTML = `
        <div class="counter-summary-header">
          <div>
            <p class="eyebrow">Efetividade</p>
            <h2></h2>
          </div>
          <span class="category-count"></span>
        </div>
        <div class="counter-type-grid"></div>
      `;
      const title = targetTypes.length
        ? targetTypes.map(formatPokemonType).join(" / ")
        : "Escolha um ou mais tipos";
      section.querySelector("h2").textContent = targetTypes.length
        ? `Bater forte contra ${title}`
        : "O que levar contra cada elemento";
      const strongAttackTypes = getCounterAttackTypes(targetTypes);
      section.querySelector(".category-count").textContent = targetTypes.length
        ? `${strongAttackTypes.length} tipos fortes`
        : "Selecione no filtro";

      const grid = section.querySelector(".counter-type-grid");
      if (!targetTypes.length) {
        const note = document.createElement("p");
        note.className = "raid-note";
        note.textContent = "Marque o tipo do Pokemon inimigo. Para tipo duplo, como Dragon + Dark, marque os dois.";
        grid.append(note);
      } else if (!strongAttackTypes.length) {
        const note = document.createElement("p");
        note.className = "raid-note";
        note.textContent = "Nenhum tipo fica super efetivo nessa combinacao.";
        grid.append(note);
      } else {
        strongAttackTypes.forEach(item => {
          const card = document.createElement("article");
          card.className = "counter-type-card";
          card.innerHTML = `
            <div class="counter-type-card-main"></div>
            <strong></strong>
            <span></span>
          `;
          card.querySelector(".counter-type-card-main").append(createTypeBadge(item.type));
          card.querySelector("strong").textContent = `${formatMultiplier(item.multiplier)} de dano`;
          card.querySelector("span").textContent = `Ataques ${formatPokemonType(item.type)}`;
          grid.append(card);
        });
      }

      list.append(section);
    }

    function createCounterCard(result) {
      const { entry, strongTypes, hasMetaBuild, defenseLabel } = result;
      const card = document.createElement("article");
      card.className = `counter-card${isOwned(entry) ? " is-owned" : ""}`;
      card.innerHTML = `
        <div class="counter-card-main">
          <span class="counter-card-image"></span>
          <div>
            <p class="modal-kicker"></p>
            <h3></h3>
            <div class="raid-card-types"></div>
          </div>
        </div>
        <div class="counter-strong-types"></div>
        <div class="raid-tags"></div>
        <p class="raid-note"></p>
      `;
      card.querySelector(".counter-card-image").replaceWith(createPokemonImage(entry, ""));
      card.querySelector(".modal-kicker").textContent = `#${String(entry.id).padStart(4, "0")}`;
      card.querySelector("h3").textContent = entry.name;
      entry.types.forEach(type => card.querySelector(".raid-card-types").append(createTypeBadge(type)));
      strongTypes.slice(0, 4).forEach(item => {
        const chip = createTextBadge(`${formatPokemonType(item.type)} ${formatMultiplier(item.multiplier)}`);
        card.querySelector(".counter-strong-types").append(chip);
      });
      const tags = card.querySelector(".raid-tags");
      tags.append(createTextBadge(isOwned(entry) ? "Capturado" : "Faltando"));
      tags.append(createTextBadge(defenseLabel));
      if (hasMetaBuild) tags.append(createTextBadge("Meta cadastrada"));
      card.querySelector(".raid-note").textContent =
        `Leve para usar ${strongTypes.slice(0, 3).map(item => formatPokemonType(item.type)).join(" / ")} contra esse alvo.`;
      card.addEventListener("click", () => openPokemonModal(entry));
      return card;
    }

    function renderBuildsFlow(list) {
      activeTitle.textContent = "Counters por tipo";
      const targetTypes = getCounterTargetTypes();
      renderCounterTools(list);
      renderCounterSummary(list, targetTypes);
      const results = getCounterCandidates(targetTypes, counterSearch);
      visibleCount.textContent = targetTypes.length
        ? `${results.length} sugestoes`
        : `${typeFilters.length} tipos`;

      if (!targetTypes.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Selecione o tipo do inimigo acima para ver o que levar.";
        list.append(empty);
        return;
      }

      renderCounterResultsSearch(list);

      if (!results.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Nenhum Pokemon final encontrado com cobertura forte para esses tipos.";
        list.append(empty);
        return;
      }

      const section = document.createElement("section");
      section.className = "counter-results";
      section.innerHTML = `
        <div class="category-heading">
          <h2>Melhores opcoes para levar</h2>
          <span class="category-count"></span>
        </div>
        <div class="counter-grid"></div>
      `;
      section.querySelector(".category-count").textContent = `${results.length} sugestoes`;
      const grid = section.querySelector(".counter-grid");
      if (appUtils.appendProgressiveItems) {
        appUtils.appendProgressiveItems({
          container: grid,
          items: results,
          renderItem: createCounterCard,
          batchSize: 80,
          buttonLabel: "Mostrar mais counters"
        });
      } else {
        results.slice(0, 80).forEach(result => grid.append(createCounterCard(result)));
      }
      list.append(section);
    }

    function applyViewTabs() {
      const checklistActive = activeView === "checklist";
      const captureActive = activeView === "capture";
      const telemetryActive = activeView === "captured";
      const breedingActive = activeView === "breeding";
      const buildsActive = activeView === "builds";
      const settingsActive = activeView === "settings";
      checklistTab.classList.toggle("active", checklistActive);
      captureTab.classList.toggle("active", captureActive);
      capturedTab.classList.toggle("active", telemetryActive);
      breedingTab.classList.toggle("active", breedingActive);
      buildsTab.classList.toggle("active", buildsActive);
      settingsTab.classList.toggle("active", settingsActive);
      checklistTab.setAttribute("aria-pressed", checklistActive ? "true" : "false");
      captureTab.setAttribute("aria-pressed", captureActive ? "true" : "false");
      capturedTab.setAttribute("aria-pressed", telemetryActive ? "true" : "false");
      breedingTab.setAttribute("aria-pressed", breedingActive ? "true" : "false");
      buildsTab.setAttribute("aria-pressed", buildsActive ? "true" : "false");
      settingsTab.setAttribute("aria-pressed", settingsActive ? "true" : "false");
      document.body.classList.toggle("flow-without-kpis", captureActive || breedingActive || buildsActive || settingsActive);
      checklistNavSections.hidden = !checklistActive;
      toolbar.hidden = !checklistActive;
      const owned = allEntries.filter(isOwned).length;
      const percent = percentValue(owned, CATALOG.length);
      const breedable = allEntries.filter(entry => !isUndiscovered(entry)).length;
      const captureMissing = allEntries.filter(entry => getEntryBiomes(entry).length && !isOwned(entry)).length;
      checklistFlowCount.textContent = `${owned}/${CATALOG.length}`;
      captureFlowCount.textContent = captureMissing;
      telemetryFlowCount.textContent = `${percent}%`;
      breedingFlowCount.textContent = breedable;
      buildsFlowCount.textContent = typeFilters.length;
      settingsFlowCount.textContent = isTauriApp() ? "Desk" : "Web";
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

    function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
      const blob = new Blob([content], { type });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    }

    function exportCapturedBackup() {
      const captured = getCapturedRecords();
      const backup = {
        app: "Pixelmon - Pokelist",
        version: 1,
        exportedAt: new Date().toISOString(),
        captured
      };
      downloadTextFile(
        "pixelmon-pokelist-backup.json",
        JSON.stringify(backup, null, 2),
        "application/json;charset=utf-8"
      );
    }

    function renderSettingsStatus(list, title, detail) {
      const status = appUtils.createStatusBlock
        ? appUtils.createStatusBlock(title, detail)
        : document.createElement("div");
      if (!appUtils.createStatusBlock) {
        status.className = "settings-status";
        status.textContent = `${title}: ${detail}`;
      }
      list.append(status);
    }

    function renderSettingsFlow(list) {
      activeTitle.textContent = "Configuracoes";
      visibleCount.textContent = isTauriApp() ? "Modo desktop" : "Modo navegador";

      const grid = document.createElement("section");
      grid.className = "settings-grid";
      grid.setAttribute("aria-label", "Configuracoes do app");

      const logPanel = document.createElement("article");
      logPanel.className = "settings-panel is-wide";
      logPanel.innerHTML = `
        <div class="settings-panel-header">
          <div>
            <p class="eyebrow">Logs locais</p>
            <h3 class="settings-panel-title">Captura automatica</h3>
            <p class="settings-panel-note">A pasta real continua salva localmente; caminhos longos aparecem mascarados na interface.</p>
          </div>
        </div>
        <div class="settings-row">
          <label for="settings-log-path">Pasta de logs</label>
          <div class="settings-path-row">
            <input id="settings-log-path" type="text" placeholder="%APPDATA%\\CoreLauncher\\game\\instances\\Pixelmon Brasil - Gen 9\\logs">
            <button class="modal-capture-button" id="settings-save-log-path" type="button">Salvar</button>
          </div>
          <p class="settings-row-note" id="settings-log-note"></p>
        </div>
        <div class="settings-action-row">
          <button class="muted-button" id="settings-toggle-log-capture" type="button"></button>
          <button class="muted-button" id="settings-refresh-log-capture" type="button">Atualizar logs</button>
        </div>
      `;
      const settingsLogPath = logPanel.querySelector("#settings-log-path");
      const settingsSaveLogPath = logPanel.querySelector("#settings-save-log-path");
      const settingsLogNote = logPanel.querySelector("#settings-log-note");
      const settingsToggleLogCapture = logPanel.querySelector("#settings-toggle-log-capture");
      const settingsRefreshLogCapture = logPanel.querySelector("#settings-refresh-log-capture");
      settingsLogPath.value = logCaptureState.configuredLogPath || logCaptureState.defaultLogPath;
      settingsLogPath.disabled = !useFileDatabase;
      settingsSaveLogPath.disabled = !useFileDatabase;
      settingsToggleLogCapture.disabled = !useFileDatabase;
      settingsRefreshLogCapture.disabled = !useFileDatabase;
      settingsToggleLogCapture.textContent = logCaptureState.enabled ? "Desligar monitor" : "Ligar monitor";
      settingsLogNote.textContent = useFileDatabase
        ? `Atual: ${maskLocalPath(logCaptureState.activePath || logCaptureState.configuredLogPath || logCaptureState.defaultLogPath || "nao configurado")}`
        : "Abra pelo app desktop ou pelo servidor local para usar captura por logs.";
      settingsSaveLogPath.addEventListener("click", () => {
        saveLogCapturePath(settingsLogPath.value, settingsSaveLogPath).then(render);
      });
      settingsLogPath.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        saveLogCapturePath(settingsLogPath.value, settingsSaveLogPath).then(render);
      });
      settingsToggleLogCapture.addEventListener("click", () => {
        postLogCapture("/api/log-capture", { enabled: !logCaptureState.enabled }).then(render).catch(() => {
          logCaptureState.lastError = "Nao foi possivel alterar o monitor de logs.";
          render();
        });
      });
      settingsRefreshLogCapture.addEventListener("click", () => refreshLogCaptureStatus().then(render));

      const viewPanel = document.createElement("article");
      viewPanel.className = "settings-panel";
      viewPanel.innerHTML = `
        <div>
          <p class="eyebrow">Visual</p>
          <h3 class="settings-panel-title">Tema e densidade</h3>
          <p class="settings-panel-note">Preferencias salvas neste navegador/app.</p>
        </div>
        <div class="settings-action-row">
          <button class="modal-capture-button" id="settings-theme-toggle" type="button"></button>
          <button class="muted-button" id="settings-density-toggle" type="button"></button>
        </div>
      `;
      const settingsThemeToggle = viewPanel.querySelector("#settings-theme-toggle");
      const settingsDensityToggle = viewPanel.querySelector("#settings-density-toggle");
      settingsThemeToggle.textContent = activeTheme === "dark" ? "Usar tema claro" : "Usar tema escuro";
      settingsDensityToggle.textContent = isCompactMode ? "Usar cards normais" : "Usar modo compacto";
      settingsThemeToggle.addEventListener("click", () => {
        activeTheme = activeTheme === "dark" ? "light" : "dark";
        localStorage.setItem(THEME_KEY, activeTheme);
        applyViewPreferences();
        render();
      });
      settingsDensityToggle.addEventListener("click", () => {
        isCompactMode = !isCompactMode;
        localStorage.setItem(DENSITY_KEY, isCompactMode ? "compact" : "normal");
        applyViewPreferences();
        render();
      });

      const updatePanel = document.createElement("article");
      updatePanel.className = "settings-panel";
      updatePanel.innerHTML = `
        <div>
          <p class="eyebrow">Update</p>
          <h3 class="settings-panel-title">Atualizacoes</h3>
          <p class="settings-panel-note">Fluxo manual, sem verificacao automatica ao abrir.</p>
        </div>
        <div class="settings-action-row">
          <button class="modal-capture-button" id="settings-update-check" type="button">Buscar atualizacoes</button>
        </div>
      `;
      const settingsUpdateCheck = updatePanel.querySelector("#settings-update-check");
      settingsUpdateCheck.disabled = !isTauriApp() || updateCheckInProgress;
      settingsUpdateCheck.textContent = updateInstallInProgress
        ? "Instalando..."
        : updateCheckInProgress
          ? "Buscando..."
          : "Buscar atualizacoes";
      settingsUpdateCheck.addEventListener("click", checkForAppUpdateManually);
      renderSettingsStatus(
        updatePanel,
        isTauriApp() ? "Updater disponivel" : "Updater indisponivel no navegador",
        appUpdateStatus || (isTauriApp() ? "Pronto para buscar manualmente." : "Abra o app desktop para buscar updates assinados.")
      );

      const backupPanel = document.createElement("article");
      backupPanel.className = "settings-panel is-wide";
      backupPanel.innerHTML = `
        <div>
          <p class="eyebrow">Dados locais</p>
          <h3 class="settings-panel-title">Backup e exportacao</h3>
          <p class="settings-panel-note">Exporte seus capturados para guardar antes de trocar de PC ou reinstalar o Windows.</p>
        </div>
        <div class="settings-action-row">
          <button class="modal-capture-button" id="settings-export-backup" type="button">Exportar backup</button>
          <button class="muted-button" id="settings-export-missing" type="button">Exportar faltantes</button>
        </div>
      `;
      backupPanel.querySelector("#settings-export-backup").addEventListener("click", exportCapturedBackup);
      backupPanel.querySelector("#settings-export-missing").addEventListener("click", exportMissingPokemon);
      renderSettingsStatus(
        backupPanel,
        `${getCapturedRecords().length} capturados salvos`,
        useFileDatabase ? "Banco local do app em uso." : "Dados salvos no navegador atual."
      );

      grid.append(logPanel, viewPanel, updatePanel, backupPanel);
      appendAboutSettingsPanels(grid);
      list.append(grid);
    }

    function appendAboutSettingsPanels(grid) {
      const appPanel = document.createElement("article");
      appPanel.className = "settings-panel";
      appPanel.innerHTML = `
        <div>
          <p class="eyebrow">Aplicativo</p>
          <h3 class="settings-panel-title"></h3>
          <p class="settings-panel-note">Checklist local para acompanhar capturas, breeding, counters e logs do Pixelmon.</p>
        </div>
        <div class="settings-action-row">
          <button class="modal-capture-button" id="about-release-link" type="button">Abrir releases</button>
        </div>
      `;
      appPanel.querySelector(".settings-panel-title").textContent = APP_META.name;
      appPanel.querySelector("#about-release-link").disabled = !APP_META.releaseUrl;
      appPanel.querySelector("#about-release-link").addEventListener("click", () => {
        openExternalUrl(APP_META.releaseUrl).catch(() => {});
      });
      renderSettingsStatus(appPanel, "Versao atual", APP_META.version);

      const dataPanel = document.createElement("article");
      dataPanel.className = "settings-panel is-wide";
      dataPanel.innerHTML = `
        <div>
          <p class="eyebrow">Dados</p>
          <h3 class="settings-panel-title">Armazenamento local</h3>
          <p class="settings-panel-note">Caminhos locais ficam mascarados na interface para facilitar prints e logs.</p>
        </div>
      `;
      renderSettingsStatus(
        dataPanel,
        "Capturados",
        `${getCapturedRecords().length} de ${CATALOG.length} especies`
      );
      renderSettingsStatus(
        dataPanel,
        "Banco",
        useFileDatabase ? "Arquivo local na pasta de dados do app." : "localStorage do navegador atual."
      );
      renderSettingsStatus(
        dataPanel,
        "Pasta de logs",
        maskLocalPath(logCaptureState.configuredLogPath || logCaptureState.defaultLogPath || "Nao configurada")
      );

      const techPanel = document.createElement("article");
      techPanel.className = "settings-panel is-wide";
      techPanel.innerHTML = `
        <div>
          <p class="eyebrow">Tecnico</p>
          <h3 class="settings-panel-title">Fontes e pacote</h3>
          <p class="settings-panel-note">Resumo rapido para conferir release e catalogo sem abrir arquivos internos.</p>
        </div>
      `;
      renderSettingsStatus(techPanel, "Catalogo", `${CATALOG.length} especies carregadas`);
      renderSettingsStatus(techPanel, "Endpoint de update", APP_META.updaterUrl || "Nao configurado");

      grid.append(appPanel, dataPanel, techPanel);
    }

    function render() {
      renderNavigation();
      renderFilterChips();
      applyViewTabs();
      applyViewPreferences();
      const search = normalize(searchInput.value.trim());
      const list = document.querySelector("#list");
      list.replaceChildren();
      let visible = 0;

      if (activeView === "capture") {
        renderCaptureFlow(list);
        updateStats();
        renderLogCapturePanel();
        return;
      }

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

      if (activeView === "settings") {
        renderSettingsFlow(list);
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
        if (appUtils.appendProgressiveItems) {
          appUtils.appendProgressiveItems({
            container: grid,
            items: entries,
            renderItem: createCard,
            batchSize: isCompactMode ? 140 : 90,
            buttonLabel: "Mostrar mais Pokemon"
          });
        } else {
          entries.forEach(entry => grid.append(createCard(entry)));
        }
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
    captureTab.addEventListener("click", () => {
      activeView = "capture";
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
    settingsTab.addEventListener("click", () => {
      activeView = "settings";
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
    updateCheckButton.addEventListener("click", checkForAppUpdateManually);
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
    appDialogCancel.addEventListener("click", () => closeAppDialog(false));
    appDialogConfirm.addEventListener("click", () => closeAppDialog(true));
    appDialog.addEventListener("click", event => {
      if (event.target.matches("[data-close-dialog]")) closeAppDialog(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (!appDialog.hidden) {
        closeAppDialog(false);
        return;
      }
      if (!pokemonModal.hidden) closePokemonModal();
    });

    loadPersistentData().then(refreshLogCaptureStatus);

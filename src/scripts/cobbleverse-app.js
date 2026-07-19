(() => {
  "use strict";

  const DATA = window.COBBLEVERSE_DATA;
  if (!DATA?.pokemon?.length) {
    document.body.innerHTML = "<main style='padding:32px;font-family:system-ui'><h1>Dados do Cobbleverse não carregados</h1><p>Execute scripts/generate-cobbleverse-data.ps1 e reabra o app.</p></main>";
    return;
  }

  const APP_STATE_KEY = "cobbleverse-companion-state-v2";
  const SFTP_PLAYER_NAME_KEY = "cobbleverse-companion-sftp-player-name";
  const ABILITY_DISPLAY_NAMES = new Map((window.POKEMON_ABILITIES_DATA || [])
    .flatMap(pokemon => pokemon.abilities || [])
    .map(ability => [abilityNameKey(ability.name), ability.name]));
  const V1_EVOLUTION_DATA = window.POKEMON_EVOLUTION_DATA || { pokemon: [], chains: [] };
  const V1_EVOLUTION_MEMBER_BY_NAME = new Map((V1_EVOLUTION_DATA.pokemon || []).map(pokemon => [normalize(pokemon.name), pokemon]));
  const V1_EVOLUTION_CHAIN_BY_ID = new Map((V1_EVOLUTION_DATA.chains || []).map(chain => [chain.id, chain.root]));
  const V1_SNAPSHOT_KEY = "cobbleverse-companion-v1-backup";
  const LEGACY_KEYS = [
    "pokemon-checklist-captured-v2", "pokemon-checklist-status-v1", "pokemon-collection-tracking-v1",
    "pokemon-breeding-parents-v1", "pokemon-teams-v1", "pokemon-checklist-theme", "pokemon-checklist-density",
    "pokemon-checklist-collapsed-sections-v1", "pokemon-checklist-player-name-v1",
    "pokemon-checklist-invasion-windows-notification-v1", "pokemon-checklist-quiz-alerts-v1",
    "pokemon-checklist-quiz-auto-copy-v1", "pokemon-checklist-gts-alerts-v1",
    "pokemon-checklist-notification-sounds-v1", "pokemon-checklist-alert-sound-library-v1",
    "pokemon-checklist-custom-alerts-v1", "pokemon-checklist-gts-watchlist-v1"
  ];
  const ALL_TYPES = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];
  const TYPE_COLORS = {
    normal: "#7b8174", fire: "#d35435", water: "#3478bd", electric: "#c49614", grass: "#3f8d4d", ice: "#4b9ca8",
    fighting: "#b33c39", poison: "#8d4ca1", ground: "#a86f35", flying: "#6f82c2", psychic: "#c34f7a", bug: "#718b2b",
    rock: "#8d7948", ghost: "#65578d", dragon: "#5d58aa", dark: "#51453f", steel: "#687c87", fairy: "#c86494"
  };
  const TYPE_CHART = {
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
  const EV_STATS = [
    { key: "hp", label: "HP", short: "HP", color: "#a73748", berry: "Pomeg", powerItem: "Power Weight", mochi: "Health Mochi" },
    { key: "attack", label: "Ataque", short: "ATK", color: "#934226", berry: "Kelpsy", powerItem: "Power Bracer", mochi: "Muscle Mochi" },
    { key: "defence", label: "Defesa", short: "DEF", color: "#365f9f", berry: "Qualot", powerItem: "Power Belt", mochi: "Resist Mochi" },
    { key: "special_attack", label: "Ataque Especial", short: "SPA", color: "#704494", berry: "Hondew", powerItem: "Power Lens", mochi: "Genius Mochi" },
    { key: "special_defence", label: "Defesa Especial", short: "SPD", color: "#246f64", berry: "Grepa", powerItem: "Power Band", mochi: "Clever Mochi" },
    { key: "speed", label: "Velocidade", short: "SPE", color: "#76570f", berry: "Tamato", powerItem: "Power Anklet", mochi: "Swift Mochi" }
  ];
  const SPAWN_RARITIES = [
    { key: "common", label: "Comum" },
    { key: "uncommon", label: "Incomum" },
    { key: "rare", label: "Raro" },
    { key: "ultra-rare", label: "Ultrarraro" }
  ];
  const BUILD_TEMPLATES = {
    "physical-offense": {
      name: "Ofensiva física",
      role: "Atacante físico",
      evs: "252 Attack / 252 Speed / 4 HP",
      nature: "Jolly ou Adamant",
      item: "Life Orb, Choice Band ou item de setup",
      note: "Prioriza dano físico e velocidade para pressionar ou finalizar a batalha."
    },
    "special-offense": {
      name: "Ofensiva especial",
      role: "Atacante especial",
      evs: "252 Special Attack / 252 Speed / 4 HP",
      nature: "Timid ou Modest",
      item: "Life Orb, Choice Specs ou item de setup",
      note: "Prioriza dano especial e velocidade, com cobertura para os checks mais comuns."
    },
    "physical-bulk": {
      name: "Defensiva física",
      role: "Tanque físico",
      evs: "252 HP / 252 Defense / 4 Attack",
      nature: "Impish ou Bold",
      item: "Leftovers ou Rocky Helmet",
      note: "Usa a resistência física para entrar em campo, espalhar status e manter pressão."
    },
    "special-bulk": {
      name: "Defensiva especial",
      role: "Tanque especial",
      evs: "252 HP / 252 Special Defense / 4 Special Attack",
      nature: "Careful ou Calm",
      item: "Leftovers ou Assault Vest",
      note: "Foca em absorver golpes especiais e devolver dano ou utilidade."
    },
    support: {
      name: "Suporte",
      role: "Suporte resistente",
      evs: "252 HP / 128 Defense / 128 Special Defense",
      nature: "Bold, Calm ou Careful",
      item: "Leftovers, Sitrus Berry ou item utilitário",
      note: "Base flexível para status, controle de campo, recuperação e um STAB seguro."
    }
  };
  const BUILD_OVERRIDES = {
    charizard: [{
      name: "Belly Drum", role: "Setup físico", evs: "252 Attack / 252 Speed / 4 HP", nature: "Jolly",
      item: "Sitrus Berry", moves: ["Belly Drum", "Acrobatics", "Earthquake", "Flame Charge"],
      note: "Setup físico de all-in: maximiza Attack e ativa Acrobatics sem item."
    }],
    venusaur: [{
      name: "Chlorophyll Sun", role: "Sweeper de sol", evs: "252 Special Attack / 252 Speed / 4 Special Defense", nature: "Modest",
      item: "Life Orb", moves: ["Growth", "Giga Drain", "Weather Ball", "Sludge Bomb"],
      note: "Growth e Weather Ball aproveitam o sol para ampliar dano e cobertura."
    }],
    dragonite: [{
      name: "Dragon Dance", role: "Setup físico", evs: "252 Attack / 252 Speed / 4 Defense", nature: "Adamant ou Jolly",
      item: "Heavy-Duty Boots", moves: ["Dragon Dance", "Extreme Speed", "Earthquake", "Ice Spinner ou Roost"],
      note: "Preserva Multiscale com Boots e usa prioridade para finalizar alvos."
    }, {
      name: "Choice Band", role: "Wallbreaker físico", evs: "252 Attack / 252 Speed / 4 Defense", nature: "Adamant",
      item: "Choice Band", moves: ["Outrage", "Extreme Speed", "Ice Spinner", "Fire Punch ou Earthquake"],
      note: "Pressão imediata com golpes fortes e Extreme Speed para revenge kill."
    }],
    garchomp: [{
      name: "Swords Dance", role: "Setup físico", evs: "252 Attack / 252 Speed / 4 Special Defense", nature: "Jolly",
      item: "Loaded Dice", moves: ["Swords Dance", "Scale Shot", "Earthquake", "Fire Fang ou Dragon Tail"],
      note: "Scale Shot aumenta Speed e Earthquake funciona como STAB principal."
    }],
    kingambit: [{
      name: "Swords Dance Cleaner", role: "Cleaner físico", evs: "252 Attack / 252 Speed / 4 Defense", nature: "Adamant",
      item: "Leftovers, Lum Berry, Black Glasses ou Air Balloon", moves: ["Swords Dance", "Sucker Punch", "Kowtow Cleave", "Iron Head ou Low Kick"],
      note: "Cleaner de late game com Supreme Overlord e prioridade em Sucker Punch."
    }, {
      name: "Bulky Swords Dance", role: "Setup resistente", evs: "212 HP / 252 Attack / 44 Speed", nature: "Adamant",
      item: "Leftovers, Lum Berry, Black Glasses ou Air Balloon", moves: ["Swords Dance", "Sucker Punch", "Kowtow Cleave", "Iron Head"],
      note: "Versão bulky para aproveitar trocas e pressionar sem depender tanto de Speed."
    }],
    dragapult: [{
      name: "Boots Pivot", role: "Suporte ofensivo", evs: "252 Speed / 252 Special Attack / 4 Attack", nature: "Naive ou Timid",
      item: "Heavy-Duty Boots", moves: ["Dragon Darts ou Draco Meteor", "Hex", "Will-O-Wisp ou Thunder Wave", "U-turn"],
      note: "Espalha status para fortalecer Hex e manter momentum com U-turn."
    }]
  };
  const LEGENDARY_FUSIONS = [
    {
      members: ["kyurem", "reshiram"], result: "Kyurem White", item: "DNA Splicers", itemId: "mega_showdown:dna_splicer",
      types: ["dragon", "ice"], ability: "Turboblaze", note: "Kyurem + Reshiram; a junção é reversível com o mesmo item."
    },
    {
      members: ["kyurem", "zekrom"], result: "Kyurem Black", item: "DNA Splicers", itemId: "mega_showdown:dna_splicer",
      types: ["dragon", "ice"], ability: "Teravolt", note: "Kyurem + Zekrom; a junção é reversível com o mesmo item."
    },
    {
      members: ["necrozma", "solgaleo"], result: "Necrozma Dusk Mane", item: "N-Solarizer", itemId: "mega_showdown:n_solarizer",
      types: ["psychic", "steel"], ability: "Prism Armor", note: "Necrozma + Solgaleo; pode chegar a Ultra Necrozma usando Ultranecrozium Z em batalha."
    },
    {
      members: ["necrozma", "lunala"], result: "Necrozma Dawn Wings", item: "N-Lunarizer", itemId: "mega_showdown:n_lunarizer",
      types: ["psychic", "ghost"], ability: "Prism Armor", note: "Necrozma + Lunala; pode chegar a Ultra Necrozma usando Ultranecrozium Z em batalha."
    },
    {
      members: ["calyrex", "glastrier"], result: "Calyrex Ice Rider", item: "Reins of Unity", itemId: "mega_showdown:reins_of_unity",
      types: ["psychic", "ice"], ability: "As One (Glastrier)", note: "Calyrex + Glastrier; a junção é reversível com o mesmo item."
    },
    {
      members: ["calyrex", "spectrier"], result: "Calyrex Shadow Rider", item: "Reins of Unity", itemId: "mega_showdown:reins_of_unity",
      types: ["psychic", "ghost"], ability: "As One (Spectrier)", note: "Calyrex + Spectrier; a junção é reversível com o mesmo item."
    }
  ];
  const VIEW_COPY = {
    home: ["Visão geral", "Início", "Sua coleção, farms, progresso e próximos passos em um só lugar."],
    pokedex: ["Guia do modpack", "Pokédex Cobbleverse", "Espécies, spawns, evoluções e informações da versão instalada."],
    drops: ["Pasture farms", "Drops de Pokémon", "Pesquise pelo item que quer farmar ou pelo Pokémon que pode produzi-lo."],
    baits: ["Poké Snacks e pesca", "Baits e perks", "Descubra qual berry ou ingrediente favorece cada Pokémon e o efeito exato do perk."],
    berries: ["Agricultura", "Berries e crossplanting", "Todas as berries naturais e mutações, com pais, mulch e tempo de cultivo."],
    "ev-training": ["Treinamento competitivo", "Treino de EVs", "Escolha um atributo e encontre os Pokémon, itens e berries certos para treiná-lo."],
    breeding: ["Compatibilidade", "Breeding", "Compatibilidade por Egg Group; calculadora e fragmentos foram removidos."],
    teams: ["Coleção do servidor", "Meus Pokémon", "Consulte todos os Pokémon do PC, compare atributos e monte times para raids e batalhas."],
    counters: ["Matchup elemental", "Counters", "Ranking por tipos e atributos, sem qualquer lógica de escudo."],
    gyms: ["Progressão regional", "Ginásios", "Mapas, insígnias, equipes oficiais e pontos especiais de cada região."],
    settings: ["Dados locais", "Configurações", "Backup, restauração, aparência e preservação da v1 do app."]
  };
  const EXTRA_LOCATION_NAMES = {
    ash: "Casa do Ash",
    crown_cemetery: "Cemitério da Coroa",
    crown_spire: "Pináculo da Coroa",
    dawn_tower: "Torre do Amanhecer",
    dusk_tower: "Torre do Crepúsculo",
    kanto_league: "Liga Pokémon de Kanto",
    "legendary/articuno": "Articuno",
    "legendary/moltres": "Moltres",
    "legendary/zapdos": "Zapdos",
    "mythical/mew": "Mew",
    team_rocket_tower: "Torre da Equipe Rocket",
    bell_tower: "Torre do Sino",
    burned_tower: "Torre Queimada",
    celebi_shrine: "Santuário de Celebi",
    johto_league: "Liga Pokémon de Johto",
    rocket_radio_tower: "Torre de Rádio Rocket",
    whirl_island: "Ilhas Redemoinho",
    dyna_tree: "Árvore Dyna",
    hoenn_league: "Liga Pokémon de Hoenn",
    "legendary/groudon": "Groudon",
    "legendary/kyogre": "Kyogre",
    "legendary/regice": "Regice",
    "legendary/regirock": "Regirock",
    "legendary/registeel": "Registeel",
    "mythical/deoxys": "Deoxys",
    "mythical/jirachi": "Jirachi",
    secret_garden: "Jardim Secreto",
    sky_pillar: "Pilar Celeste",
    crescent_isle: "Ilha Crescente",
    eterna_building: "Prédio de Eterna",
    flower_paradise: "Paraíso das Flores",
    fullmoon_island: "Ilha da Lua Cheia",
    "mythical/manaphy": "Manaphy",
    sinnoh_league: "Liga Pokémon de Sinnoh",
    snowpoint_temple: "Templo de Snowpoint",
    spear_pillar: "Pilar da Lança",
    split_decision_temple: "Templo da Decisão",
    team_galactic_hq: "Quartel-General da Equipe Galáctica",
    wind_plant: "Usina Eólica",
    "cobblemon/ruins/luna_henge_ruins": "Ruínas Luna Henge",
    "cobblemon/ruins/sol_henge_ruins": "Ruínas Sol Henge",
    "cobblemon/ruins/deserted_gimmi_tower": "Torre Gimmi do Deserto",
    "cobblemon/ruins/frozen_gimmi_tower": "Torre Gimmi Congelada",
    "cobblemon/ruins/lush_gimmi_tower": "Torre Gimmi Exuberante",
    "cobblemon/ruins/crumbling_arch_ruins": "Ruínas do Arco Desmoronado",
    "cobblemon/ruins/mossy_oubliette_ruins": "Ruínas da Masmorra Musgosa",
    "mega_showdown/archaeological_site": "Sítio Arqueológico",
    "mega_showdown/wishing_weald": "Bosque dos Desejos",
    "legendarymonuments/lake_verity": "Lago Verity",
    "legendarymonuments/lake_acuity": "Lago Acuity",
    "legendarymonuments/lake_valor": "Lago Valor",
    "legendarymonuments/turnback_cave": "Caverna Retorno",
    "legendarymonuments/distortion_portal": "Portal de Retorno da Distorção",
    "legendarymonuments/giratina_island": "Ilha de Giratina",
    "legendarymonuments/stark_mountain": "Montanha Stark",
    "legendarymonuments/firescourge_shrine": "Santuário Firescourge",
    "legendarymonuments/grasswither_shrine": "Santuário Grasswither",
    "legendarymonuments/groundblight_shrine": "Santuário Groundblight",
    "legendarymonuments/icerend_shrine": "Santuário Icerend",
    "legendarymonuments/outskirt_stand": "Posto do Deserto",
    "legendarymonuments/eternatus_cocoon": "Casulo de Eternatus"
  };
  const OFFICIAL_STRUCTURE_GUIDE_URL = "https://www.lumyverse.com/cobbleverse/exclusive-structures-in-cobbleverse/";
  const OFFICIAL_LEGENDARY_GUIDE_URL = "https://www.lumyverse.com/cobbleverse/how-to-catch-all-legendary-mythical-pokemon/";
  const OFFICIAL_SPECIAL_ITEMS_GUIDE_URL = "https://www.lumyverse.com/cobbleverse/special-items-where-find-them/";
  const OFFICIAL_OTHER_STRUCTURES_GUIDE_URL = "https://www.lumyverse.com/en/cobbleverse/other-structures/";
  const OFFICIAL_SPAWN_GUIDE_URL = "https://www.lumyverse.com/cobbleverse/all-pokemon-spawn-in-cobbleverse/";

  const EXTRA_LOCATION_DETAILS = {
    ash: { rewards: ["Ash's Cap", "Doces e recompensas de batalha"], steps: ["Explore o quarto do Ash e procure a gaveta que guarda o boné.", "Derrote Ash e a mãe dele para receber as recompensas dos treinadores.", "Para Ash-Greninja, use o boné em um Greninja com 255 de amizade."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    crown_cemetery: { rewards: ["Calyrex", "Spectrier", "Shaderoot Carrot", "Calyrex Crown"], steps: ["Encontre o cemitério em Old Growth Pine Taiga e recolha a Shaderoot Carrot e a Calyrex Crown.", "Use a cenoura no ritual da estrutura para atrair Spectrier.", "Use a Calyrex Crown na estátua/altar para chamar Calyrex; depois, Reins of Unity une Calyrex e Spectrier."], wikiUrl: OFFICIAL_SPAWN_GUIDE_URL },
    crown_spire: { rewards: ["Calyrex", "Glastrier", "Iceroot Carrot", "Calyrex Crown"], steps: ["Encontre o pináculo na região nevada e recolha a Iceroot Carrot e a Calyrex Crown.", "Use a cenoura no ritual da estrutura para atrair Glastrier.", "Use a Calyrex Crown na estátua/altar para chamar Calyrex; depois, Reins of Unity cria Ice Rider."], wikiUrl: OFFICIAL_SPAWN_GUIDE_URL },
    dawn_tower: { rewards: ["Encontro de Poipole", "Estrutura temática de Dawn Wings Necrozma"], steps: ["Explore a torre no End e procure Poipole, que pode aparecer dentro dela.", "A torre também faz parte da rota temática de Necrozma; a fusão em si usa um Lunarizer carregado em Necrozma."], wikiUrl: OFFICIAL_SPAWN_GUIDE_URL },
    dusk_tower: { rewards: ["Encontro de Poipole", "Estrutura temática de Dusk Mane Necrozma"], steps: ["Explore a torre no End e procure Poipole, que pode aparecer dentro dela.", "A torre também faz parte da rota temática de Necrozma; a fusão em si usa um Solarizer carregado em Necrozma."], wikiUrl: OFFICIAL_SPAWN_GUIDE_URL },
    "legendary/articuno": { rewards: ["Articuno", "Pena de invocação da torre"], steps: ["Explore a torre nas Snowy Plains e procure a pena correspondente escondida no local.", "Leve a pena ao ponto de invocação da própria torre para iniciar o encontro com Articuno."], wikiUrl: OFFICIAL_STRUCTURE_GUIDE_URL },
    "legendary/moltres": { rewards: ["Moltres", "Pena de invocação da torre"], steps: ["Explore a torre no Nether Wastes e procure a pena correspondente escondida no local.", "Leve a pena ao ponto de invocação da própria torre para iniciar o encontro com Moltres."], wikiUrl: OFFICIAL_STRUCTURE_GUIDE_URL },
    "legendary/zapdos": { rewards: ["Zapdos", "Pena de invocação da torre"], steps: ["Explore a torre em Stony Shore e procure a pena correspondente escondida no local.", "Leve a pena ao ponto de invocação da própria torre para iniciar o encontro com Zapdos."], wikiUrl: OFFICIAL_STRUCTURE_GUIDE_URL },
    "mythical/mew": { rewards: ["Mew", "Ancient DNA"], steps: ["Obtenha Ancient Origin Ball derrotando Blue e Lance, Ancient DNA com Giovanni ou no templo e mais 5 fósseis quaisquer.", "Crie o Origin Fossil com esses materiais.", "Coloque o Origin Fossil no altar do templo para invocar Mew."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    team_rocket_tower: { rewards: ["Cloning Catalyst", "Ominous Key", "Blank Crystal", "Mewtwo"], steps: ["Suba até General Archer e quebre o piso abaixo dele para alcançar Admin Atena.", "Derrote Atena com o limite de nível 100 para obter o Cloning Catalyst.", "Combine Cloning Catalyst e Ancient DNA na Resurrection Machine para receber Mewtwo; a variante com balão pode dar o catalisador de Mewtwo Shiny."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    bell_tower: { rewards: ["Ho-Oh"], steps: ["Primeiro derrote o Old Sage na Burned Tower para obter a Rainbow Wing.", "Suba a Bell Tower e use a Rainbow Wing no ponto de invocação para chamar Ho-Oh no nível 70."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    burned_tower: { rewards: ["Rainbow Wing", "Raikou", "Entei", "Suicune"], steps: ["Derrote o Old Sage, com limite recomendado de nível 60+, para receber a Rainbow Wing.", "As três feras são spawns ultra-raros ao redor da torre; acompanhe-as pelo PokéNav."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    celebi_shrine: { rewards: ["GS Ball", "Celebi"], steps: ["Derrote o Rival Red próximo ao santuário; a batalha exige limite de nível 100.", "Segure a GS Ball recebida e pressione o botão do santuário para invocar Celebi, por volta do nível 30."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    rocket_radio_tower: { rewards: ["Silver Wing", "Shadow Heart", "Corrupted Shards", "Synthetic Matrix"], steps: ["Suba até o topo e derrote Giovanni, com limite de nível 70+, para obter a Silver Wing.", "Procure os Corrupted Shards escondidos e derrote Apollo para obter Shadow Heart e a receita da Shadow Soul Stone.", "Encontre a Synthetic Matrix escondida; ela entra na receita da armadura de Mewtwo."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    whirl_island: { rewards: ["Lugia"], steps: ["Obtenha a Silver Wing derrotando Giovanni na Rocket Radio Tower.", "Use a Silver Wing no altar de Whirl Island para invocar Lugia no nível 70."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    dyna_tree: { rewards: ["Articuno de Galar", "Zapdos de Galar", "Moltres de Galar"], steps: ["Procure as aves na base da árvore: Articuno de Galar à noite, Zapdos de Galar durante tempestades e Moltres de Galar durante o dia.", "São encontros raros; prepare as Poké Balls antes de se aproximar."], wikiUrl: OFFICIAL_SPAWN_GUIDE_URL },
    "legendary/groudon": { rewards: ["Groudon", "Red Orb"], steps: ["Ache e processe em Blast Furnace as 8 Magma Geostones escondidas no vulcão.", "Crie o Earth Core e use-o no ponto de invocação para chamar Groudon.", "Explore a passagem secreta do vulcão para encontrar também a Red Orb."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    "legendary/kyogre": { rewards: ["Kyogre", "Blue Orb"], steps: ["Crie o Ocean Core usando os materiais indicados no REI.", "Use o Ocean Core no altar submerso para invocar Kyogre.", "Revire os compartimentos escondidos do templo para encontrar a Blue Orb."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    "legendary/regice": { rewards: ["Regice", "Segredo sob o templo"], steps: ["Minere Ice Ore em Frozen Peaks, Frozen Ocean ou Ice Spikes entre Y 65 e 125.", "Transforme-a em Cryo Relic e use a relíquia no altar do templo para invocar Regice."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    "legendary/regirock": { rewards: ["Regirock", "Segredo sob o templo"], steps: ["Minere Rock Ore em Badlands, Eroded Badlands ou Wooded Badlands entre Y 75 e 135.", "Transforme-a em Pebble Relic e use a relíquia no altar do templo para invocar Regirock."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    "legendary/registeel": { rewards: ["Registeel", "Segredo sob o templo"], steps: ["Minere Steel Ore em Dripstone Caves entre Y -50 e 10.", "Transforme-a em Metal Relic e use a relíquia no altar do templo para invocar Registeel."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    "mythical/deoxys": { rewards: ["Deoxys", "Meteoritos de mudança de forma"], steps: ["No End, escave os blocos de Mega Meteorite para revelar o Meteorite Crystal e o altar escondido.", "Use o cristal no altar para invocar Deoxys.", "Recolha os meteoritos espalhados pela ilha para alternar entre as formas Normal, Attack, Defense e Speed."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    "mythical/jirachi": { rewards: ["Jirachi", "Melodic Tape (Vol. 1)"], steps: ["Suba até o topo da Wish Cave e procure a Melodic Tape dentro de um barril.", "Use a fita no ponto de invocação da estrutura para chamar Jirachi no nível 75."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    secret_garden: { rewards: ["Latias", "Latios"], steps: ["Derrote o campeão de Hoenn, Rocco, para receber Ruby Dew e Sapphire Dew.", "Use Ruby Dew no jardim para invocar Latias ou Sapphire Dew para invocar Latios, ambos por volta do nível 55."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    sky_pillar: { rewards: ["Rayquaza", "Primordial Gem", "Desolate Gem", "Aether Gem", "Emerald Emblem"], steps: ["Derrote Ivan, Max e Lyris para receber as três Gems; a rota usa limite de nível 70+.", "Na sala dos crafters, acione a alavanca acima do baú e procure o Emerald Emblem no barril revelado.", "Crie o Sky Core e use-o no topo do pilar para invocar Rayquaza."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    crescent_isle: { rewards: ["Lunar Wing", "Pista para Cresselia"], steps: ["Encontre Sailor Elfio e explore a ilha para obter a Lunar Wing.", "Guarde-a: ela é um dos componentes do Dream Catcher usado na Fullmoon Island."], wikiUrl: OFFICIAL_STRUCTURE_GUIDE_URL },
    eterna_building: { rewards: ["Batalha com Commander Jupiter", "Progressão da Equipe Galáctica"], steps: ["Limpe os treinadores do prédio e enfrente Jupiter.", "Explore os laboratórios e baús; essa base contextualiza os experimentos com o Lago Verity, mas não possui uma invocação lendária própria."], wikiUrl: OFFICIAL_STRUCTURE_GUIDE_URL },
    flower_paradise: { rewards: ["Shaymin", "Professor Oak's Letter"], steps: ["Mantenha Bulbasaur, Charmander, Squirtle, Pikachu e Eevee juntos na equipe para receber a carta.", "Use Professor Oak's Letter no paraíso para invocar Shaymin no nível 30.", "Depois do uso, a carta pode ser recriada com 3 Gracidea Flowers."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    fullmoon_island: { rewards: ["Cresselia", "Dream Strings", "Moonlight Amulet após a captura"], steps: ["Recolha 8 Dream Strings exclusivas da estrutura.", "Combine-as com a Lunar Wing da Crescent Isle para criar o Dream Catcher.", "Use o Dream Catcher no ponto de invocação para chamar Cresselia entre os níveis 70 e 80."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    "mythical/manaphy": { rewards: ["Mythical Egg de Manaphy", "Manaphy", "Phione por breeding"], steps: ["Explore as ruínas submersas e recolha o Mythical Egg protegido pela estrutura.", "Depois de obter Manaphy, coloque Manaphy e Ditto juntos em um Pasture Block para gerar um ovo de Phione."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    snowpoint_temple: { rewards: ["Regigigas"], steps: ["Obtenha os cinco titãs: Regirock, Regice, Registeel, Regidrago e Regieleki.", "Crie a Titan Relic usando os elementos centrais dos cinco.", "Leve todos os cinco na equipe e use a Titan Relic no templo para despertar Regigigas, nível 80+."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    spear_pillar: { rewards: ["Dialga", "Palkia", "Temporal Flute", "Spatial Flute"], steps: ["Consiga a Red Chain derrotando Cyrus no Team Galactic HQ.", "Leve Adamant Orb para Dialga ou Lustrous Orb para Palkia e use junto da Red Chain no altar.", "A Red Chain é de uso único e vira Broken Red Chain; as flautas são obtidas após capturar os respectivos lendários."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    split_decision_temple: { rewards: ["Regidrago ou Regieleki"], steps: ["Para Regidrago, minere Dragon Ore no Deep Dark entre Y -60 e 0 e crie a Draco Relic.", "Para Regieleki, minere Electron Ore no deserto entre Y 30 e 90 e crie a Spark Relic.", "Escolha um dos lados e use a relíquia correspondente; o caminho não escolhido é selado."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    team_galactic_hq: { rewards: ["Red Chain", "Adamant Orb", "Lustrous Orb", "Torn Journal/Page"], steps: ["Avance pelo quartel e derrote Cyrus para receber a Red Chain.", "Explore os laboratórios e baús para encontrar Adamant Orb, Lustrous Orb e páginas do diário.", "Guarde a Red Chain para Dialga/Palkia no Spear Pillar ou Giratina na Distortion World."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    wind_plant: { rewards: ["Torn Page", "Batalha com Commander Mars"], steps: ["Limpe a usina ocupada pela Equipe Galáctica e derrote Mars.", "Procure a Torn Page nos conteúdos da estrutura; ela participa da criação do Old Journal e da progressão de Sinnoh."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    "cobblemon/ruins/luna_henge_ruins": { rewards: ["Rusted Sword", "Forma Crowned Sword de Zacian"], steps: ["Procure blocos de areia ou cascalho suspeitos dentro das Luna Henge Ruins.", "Use um pincel nesses blocos; a Rusted Sword aparece como loot arqueológico incomum.", "Use/equipe a Rusted Sword em Zacian para acessar sua forma Crowned Sword."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    "cobblemon/ruins/sol_henge_ruins": { rewards: ["Rusted Shield", "Forma Crowned Shield de Zamazenta"], steps: ["Procure blocos de areia ou cascalho suspeitos dentro das Sol Henge Ruins.", "Use um pincel nesses blocos; a Rusted Shield aparece como loot arqueológico incomum.", "Use/equipe a Rusted Shield em Zamazenta para acessar sua forma Crowned Shield."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    "cobblemon/ruins/deserted_gimmi_tower": { rewards: ["Hearthflame Mask de Ogerpon"], steps: ["Procure areia ou cascalho suspeito na torre do deserto.", "Escove os blocos arqueológicos até obter a Hearthflame Mask; o item muda Ogerpon para a forma Hearthflame."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    "cobblemon/ruins/frozen_gimmi_tower": { rewards: ["Wellspring Mask de Ogerpon"], steps: ["Procure areia ou cascalho suspeito na torre congelada.", "Escove os blocos arqueológicos até obter a Wellspring Mask; o item muda Ogerpon para a forma Wellspring."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    "cobblemon/ruins/lush_gimmi_tower": { rewards: ["Cornerstone Mask de Ogerpon"], steps: ["Procure areia ou cascalho suspeito na torre exuberante.", "Escove os blocos arqueológicos até obter a Cornerstone Mask; o item muda Ogerpon para a forma Cornerstone."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    "cobblemon/ruins/crumbling_arch_ruins": { rewards: ["Zygarde Core"], steps: ["Explore as ruínas subterrâneas e procure os blocos arqueológicos suspeitos.", "Use um pincel para ter chance de obter Zygarde Core; guarde-o no Zygarde Cube para a montagem de Zygarde."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    "cobblemon/ruins/mossy_oubliette_ruins": { rewards: ["Zygarde Core"], steps: ["Explore a ruína no pântano e procure os blocos arqueológicos suspeitos.", "Use um pincel para ter chance de obter Zygarde Core; combine cores e cells no sistema de Reassembly Unit."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    "mega_showdown/archaeological_site": { rewards: ["Zygarde Cells"], steps: ["Revire os baús e pontos arqueológicos do sítio no deserto.", "Armazene as Zygarde Cells em um Zygarde Cube e use uma Reassembly Unit quando tiver cores e cells suficientes."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    "mega_showdown/wishing_weald": { rewards: ["Zygarde Cells"], steps: ["Explore os baús do bosque em biomas sombrios/spooky para recolher Zygarde Cells.", "Armazene-as no Zygarde Cube; a quantidade de cells e cores define a forma produzida na Reassembly Unit."], wikiUrl: OFFICIAL_SPECIAL_ITEMS_GUIDE_URL },
    "legendarymonuments/lake_verity": { rewards: ["Mesprit", "Mesprit Plume", "Jewel of Emotion"], steps: ["Derrote o Pokémon que ocupa a caverna para receber a Mesprit Plume.", "Use a pluma no altar para invocar Mesprit, nível 70+.", "Após a captura, obtenha a Jewel of Emotion, usada para reparar a Broken Red Chain."], wikiUrl: OFFICIAL_OTHER_STRUCTURES_GUIDE_URL },
    "legendarymonuments/lake_acuity": { rewards: ["Uxie", "Uxie Claw", "Jewel of Knowledge"], steps: ["Derrote o Pokémon que ocupa a caverna para receber a Uxie Claw.", "Use a garra no altar para invocar Uxie, nível 70+.", "Após a captura, obtenha a Jewel of Knowledge, usada para reparar a Broken Red Chain."], wikiUrl: OFFICIAL_OTHER_STRUCTURES_GUIDE_URL },
    "legendarymonuments/lake_valor": { rewards: ["Azelf", "Azelf Fang", "Jewel of Willpower"], steps: ["Derrote o Pokémon que ocupa a caverna para receber a Azelf Fang.", "Use a presa no altar para invocar Azelf, nível 70+.", "Após a captura, obtenha a Jewel of Willpower, usada para reparar a Broken Red Chain."], wikiUrl: OFFICIAL_OTHER_STRUCTURES_GUIDE_URL },
    "legendarymonuments/turnback_cave": { rewards: ["Acesso à Distortion World", "Rota para Giratina"], steps: ["Encontre a caverna no Overworld e atravesse o portal em seu interior.", "Na Distortion World, procure Giratina Island; leve uma Red Chain para a invocação."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    "legendarymonuments/distortion_portal": { rewards: ["Saída natural da Distortion World"], steps: ["Procure este portal dentro da dimensão para retornar ao mundo normal.", "Como alternativa, colete Raw Origin na dimensão e crie um portal artificial."], wikiUrl: OFFICIAL_OTHER_STRUCTURES_GUIDE_URL },
    "legendarymonuments/giratina_island": { rewards: ["Giratina", "Materiais da Distortion World"], steps: ["Entre na dimensão pela Turnback Cave e localize a ilha.", "Use a Red Chain no altar para invocar Giratina, nível 75+.", "Depois, encontre o portal de retorno próximo à ilha; a corrente quebra após o uso."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    "legendarymonuments/stark_mountain": { rewards: ["Heatran", "Heat Fragment", "Heat Splinter", "Magma Stone"], steps: ["Derrote Buck para obter Heat Fragment e Charon para obter Heat Splinter.", "Combine os dois itens em um Magmatic Cluster e processe-o na Stark Forge para criar a Magma Stone.", "Use a Magma Stone no altar para despertar Heatran, nível 70+."], wikiUrl: OFFICIAL_LEGENDARY_GUIDE_URL },
    "legendarymonuments/firescourge_shrine": { rewards: ["Chi-Yu"], steps: ["Encontre e remova as 8 estacas da cor ligada ao santuário.", "Quando o selo se romper, volte ao Firescourge Shrine para desafiar e capturar Chi-Yu."], wikiUrl: OFFICIAL_OTHER_STRUCTURES_GUIDE_URL },
    "legendarymonuments/grasswither_shrine": { rewards: ["Wo-Chien"], steps: ["Encontre e remova as 8 estacas da cor ligada ao santuário.", "Quando o selo se romper, volte ao Grasswither Shrine para desafiar e capturar Wo-Chien."], wikiUrl: OFFICIAL_OTHER_STRUCTURES_GUIDE_URL },
    "legendarymonuments/groundblight_shrine": { rewards: ["Ting-Lu"], steps: ["Encontre e remova as 8 estacas da cor ligada ao santuário.", "Quando o selo se romper, volte ao Groundblight Shrine para desafiar e capturar Ting-Lu."], wikiUrl: OFFICIAL_OTHER_STRUCTURES_GUIDE_URL },
    "legendarymonuments/icerend_shrine": { rewards: ["Chien-Pao"], steps: ["Encontre e remova as 8 estacas da cor ligada ao santuário.", "Quando o selo se romper, volte ao Icerend Shrine para desafiar e capturar Chien-Pao."], wikiUrl: OFFICIAL_OTHER_STRUCTURES_GUIDE_URL },
    "legendarymonuments/outskirt_stand": { rewards: ["Zygarde Cells compráveis"], steps: ["Encontre o posto comercial no deserto.", "Fale com o comerciante especializado e compre Zygarde Cells; depois guarde-as no Zygarde Cube para a Reassembly Unit."], wikiUrl: OFFICIAL_OTHER_STRUCTURES_GUIDE_URL },
    "legendarymonuments/eternatus_cocoon": { rewards: ["Eternatus"], steps: ["Minere e reúna exatamente 500 Galar Particles no Overworld.", "Leve as partículas ao casulo no End e use-as para sobrecarregar e romper o selo.", "Prepare-se antes de liberar o encontro com Eternatus."], wikiUrl: OFFICIAL_OTHER_STRUCTURES_GUIDE_URL }
  };
  const OFFICIAL_STRUCTURE_PREVIEW_BASE = "https://www.lumyverse.com/wp-content/uploads/";
  const EXTRA_LOCATION_PREVIEW_FILES = {
    ash: "COBBLEVERSE-Ash-House-1-1024x576.jpg",
    crown_cemetery: "COBBLEVERSE-Crown-Cemetery-Calyrex-2-1024x694.jpg",
    crown_spire: "COBBLEVERSE-Crown-Spire-Calyrex-1-1024x694.jpg",
    dawn_tower: "COBBLEVERSE-Dawn-Tower-889x1024.jpg",
    dusk_tower: "COBBLEVERSE-Dusk-Tower-889x1024.jpg",
    "legendary/articuno": "COBBLEVERSE-Kanto-Articuno-Tower-1-834x1024.png",
    "legendary/moltres": "COBBLEVERSE-Kanto-Moltres-Tower-834x1024.png",
    "legendary/zapdos": "COBBLEVERSE-Kanto-Zapdos-Tower-834x1024.png",
    "mythical/mew": "COBBLEMON-Origin-Temple-Mew-1024x811.jpg",
    team_rocket_tower: "COBBLEVERSE-Team-Rocket-Tower-1024x576.jpg",
    bell_tower: "COBBLEVERSE-Johto-Bell-Tower-834x1024.png",
    burned_tower: "COBBLEVERSE-Johto-Burned-Tower-834x1024.png",
    celebi_shrine: "2026-03-05_14.06.01-1-1024x576.png",
    rocket_radio_tower: "COBBLEVERSE-Johto-Radio-tower-Team-Rocket-834x1024.png",
    whirl_island: "COBBLEVERSE-Whirl-Island-Lugia-1024x951.jpg",
    dyna_tree: "COBBLEVERSE-Dyna-Tree-1024x830.jpg",
    "legendary/groudon": "COBBLEVERSE-Hoenn-Groudon-Volcano.jpg",
    "legendary/kyogre": "COBBLEVERSE-Hoenn-Kyogre-Temple.jpg",
    "legendary/regice": "COBBLEVERSE-Hoenn-Regice-temple.jpg",
    "legendary/regirock": "COBBLEVERSE-Hoenn-Regirock-temple.jpg",
    "legendary/registeel": "COBBLEVERSE-Hoenn-Registeel-temple.jpg",
    "mythical/deoxys": "COBBLEVERSE-Deoxys-Meteroite.jpg",
    "mythical/jirachi": "COBBLEVERSE-Hoenn-Wish-Caves.jpg",
    secret_garden: "COBBLEVERSE-Hoenn-Secret-Garden-1024x585.jpg",
    sky_pillar: "COBBLEVERSE-Hoenn-sky-pillar-1.jpg",
    crescent_isle: "COBBLEVERSE-Crescent-Isle-1024x769.jpg",
    eterna_building: "COBBLEVERSE-Eterna-Building-1024x920.jpg",
    flower_paradise: "COBBLEVERSE-Flower-Paradise-2-1024x600.jpg",
    fullmoon_island: "COBBLEVERSE-Fullmoon-Island-1-1024x769.jpg",
    "mythical/manaphy": "COBBLEVERSE-Manaphy-1024x600.jpg",
    snowpoint_temple: "COBBLEVERSE-Snowpoint-Temple-1-1024x540.jpg",
    spear_pillar: "COBBLEVERSE-Spear-Pillar-1-1024x788.jpg",
    split_decision_temple: "COBBLEVERSE-Split-Decision-temple-1024x561.jpg",
    team_galactic_hq: "COBBLEVERSE-Team-Galactic-HQ-1024x644.jpg",
    wind_plant: "COBBLEVERSE-Windplant-1024x791.jpg",
    kanto_league: "COBBLEVERSE-Elite-4-Tower-KANTO-1024x583.jpg",
    hoenn_league: "COBBLEVERSE-Hoenn_League-1024x659.jpg",
    sinnoh_league: "COBBLEVERSE-Sinnoh-League-1024x720.jpg",
    "legendarymonuments/lake_verity": "COBBLEVERSE-Lake-Veirty-1-1024x769.jpg",
    "legendarymonuments/lake_acuity": "COBBLEVERSE-Lake-Acuity-1-1024x769.jpg",
    "legendarymonuments/lake_valor": "COBBLEVERSE-Lake-Valor-1-1024x769.jpg",
    "legendarymonuments/turnback_cave": "COBBLEVERSE-LM-Turnback-cave-1024x670.jpg",
    "legendarymonuments/distortion_portal": "image-43.png",
    "legendarymonuments/giratina_island": "COBBLEVERSE-LM-Giratina-Island-1-1024x505.jpg",
    "legendarymonuments/stark_mountain": "COBBLEVERSE-LM-Stark-Mountain-2-1024x540.jpg",
    "legendarymonuments/firescourge_shrine": "COBBLEVERSE-LM-Firescourge-shrine-1017x1024.jpg",
    "legendarymonuments/grasswither_shrine": "COBBLEVERSE-LM-Grasswither-shrine-1017x1024.jpg",
    "legendarymonuments/groundblight_shrine": "COBBLEVERSE-LM-Groundblight-shrine-1017x1024.jpg",
    "legendarymonuments/icerend_shrine": "COBBLEVERSE-LM-Icerend-shrine-1-1017x1024.jpg",
    "legendarymonuments/outskirt_stand": "COBBLEVERSE-LM-Outskirt-Stand-1024x670.jpg",
    "legendarymonuments/eternatus_cocoon": "COBBLEVERSE-LM-Eternatus-cocoon-1024x725.jpg"
  };
  const EXTRA_LOCATION_PREVIEW_OVERRIDES = {
    "cobblemon/ruins/luna_henge_ruins": { url: "https://wiki.cobblemon.com/images/8/83/Luna_henge_ruins.png", sourceLabel: "Cobblemon Wiki", sourceUrl: "https://wiki.cobblemon.com/index.php/Ruins" },
    "cobblemon/ruins/sol_henge_ruins": { url: "https://wiki.cobblemon.com/images/4/4b/Sol_henge_ruins.png", sourceLabel: "Cobblemon Wiki", sourceUrl: "https://wiki.cobblemon.com/index.php/Ruins" },
    "cobblemon/ruins/deserted_gimmi_tower": { url: "https://wiki.cobblemon.com/images/1/1f/Gimmighoul_Tower_%28deserted%29.png", sourceLabel: "Cobblemon Wiki", sourceUrl: "https://wiki.cobblemon.com/index.php/Ruins" },
    "cobblemon/ruins/frozen_gimmi_tower": { url: "https://wiki.cobblemon.com/images/a/ae/Gimmighoul_Tower_%28frozen%29.png", sourceLabel: "Cobblemon Wiki", sourceUrl: "https://wiki.cobblemon.com/index.php/Ruins" },
    "cobblemon/ruins/lush_gimmi_tower": { url: "https://wiki.cobblemon.com/images/b/b1/Gimmighoul_Tower_%28lush%29.png", sourceLabel: "Cobblemon Wiki", sourceUrl: "https://wiki.cobblemon.com/index.php/Ruins" },
    "cobblemon/ruins/crumbling_arch_ruins": { url: "https://wiki.cobblemon.com/images/f/f7/Crumbling_Arch_Ruins.png", sourceLabel: "Cobblemon Wiki", sourceUrl: "https://wiki.cobblemon.com/index.php/Ruins" },
    "cobblemon/ruins/mossy_oubliette_ruins": { url: "https://wiki.cobblemon.com/images/8/81/Mossy_Oubliette_Ruins.png", sourceLabel: "Cobblemon Wiki", sourceUrl: "https://wiki.cobblemon.com/index.php/Ruins" },
    "mega_showdown/archaeological_site": { url: "https://cobbletoolkit.pages.dev/guides/archaeological-site.png", sourceLabel: "CobbleToolkit · crédito Mega Showdown", sourceUrl: "https://cobbletoolkit.pages.dev/guides/cobbleverse/items/" },
    "mega_showdown/wishing_weald": { url: "https://cobbletoolkit.pages.dev/guides/wishing-weald.png", sourceLabel: "CobbleToolkit · crédito Mega Showdown", sourceUrl: "https://cobbletoolkit.pages.dev/guides/cobbleverse/items/" }
  };
  const EXTRA_CATEGORY_META = {
    league: { label: "Liga / Elite Four", symbol: "♛", description: "Desafio regional com a Elite Four e o campeão." },
    villain: { label: "Base de equipe", symbol: "◆", description: "Estrutura ligada a uma equipe vilã da região." },
    encounter: { label: "Encontro especial", symbol: "✦", description: "Local especial associado a Pokémon raros, lendários ou míticos." },
    landmark: { label: "Ponto de exploração", symbol: "⌂", description: "Estrutura adicional de exploração presente no datapack." }
  };

  const pokemonById = new Map(DATA.pokemon.map(pokemon => [pokemon.id, pokemon]));
  const pokemonByName = new Map(DATA.pokemon.map(pokemon => [normalize(pokemon.name), pokemon]));
  const dropRows = DATA.pokemon.flatMap(pokemon => pokemon.drops.map(drop => ({ pokemon, ...drop })));
  const eggGroups = [...new Set(DATA.pokemon.flatMap(pokemon => pokemon.eggGroups || []))].sort((left, right) => humanizeId(left).localeCompare(humanizeId(right)));
  const eggGroupCounts = new Map(eggGroups.map(group => [group, DATA.pokemon.filter(pokemon => pokemon.eggGroups.includes(group)).length]));
  const pcPokemonIds = () => new Set(ownedPokemonEntries().filter(entry => entry.storage === "pc" && !isFarmPokemon(entry)).map(entry => resolveServerPokemon(entry.species)?.id).filter(Boolean));
  const content = document.querySelector("#content");
  const viewKicker = document.querySelector("#view-kicker");
  const viewTitle = document.querySelector("#view-title");
  const viewDescription = document.querySelector("#view-description");
  const headerMeta = document.querySelector("#header-meta");
  const modal = document.querySelector("#pokemon-modal");
  const modalContent = document.querySelector("#modal-content");
  const backupFileInput = document.querySelector("#backup-file-input");

  let activeView = "home";
  let state = createEmptyState();
  let saveTimer = 0;
  let teamFormExpanded = false;
  let editingTeamId = "";
  let teamDraftInstanceIds = [];
  let teamDraftName = "";
  let teamDraftNotes = "";
  let updateCheckInProgress = false;
  let updateInstallInProgress = false;
  let updateStatus = "";
  let sftpProfileStatus = { saved: false, host: "", port: 22, username: "", remotePath: "" };
  let sftpConnectionStatus = "";
  let sftpConnectionTone = "neutral";
  let sftpConnectionBusy = false;
  let sftpRemoteEntries = [];
  let sftpPlayerName = localStorage.getItem(SFTP_PLAYER_NAME_KEY) || "";
  let sftpPlayerSyncBusy = false;
  let pokedexAutoLoadObserver = null;
  const POKEMON_TAG_COLORS = ["violet", "blue", "green", "orange", "pink", "slate"];
  const BUILTIN_POKEMON_TAGS = [
    { id: "farm", name: "Farm", color: "gold", description: "Reservado para produção; não aparece nas opções de batalha." },
    { id: "ready", name: "Pronto", color: "green", description: "Treinado e pronto para raids, ginásios ou batalhas." }
  ];
  const ui = {
    pokedexSearch: "", pokedexType: "", pokedexGeneration: "", pokedexLimit: 96,
    dropMode: "catalog", dropSearch: "", dropFarmableOnly: true, dropSort: "pokemon", dropCoverage: "all", dropLimit: 120,
    baitSearch: "", baitCategory: "all", baitLimit: 100,
    berrySearch: "", berrySource: "all", berryLimit: 100,
    evStat: "attack", evSearch: "", evYield: "all", evRarity: "all", evSpawnOnly: true, evLimit: 96,
    breedingMode: "pokemon", breedingA: "", breedingB: "", breedingSearch: "", breedingEggGroup: "", breedingGroupSearch: "", breedingLimit: 96,
    counterBoss: "", counterTypes: new Set(), counterSearch: "", counterCapturedOnly: false, counterPcOnly: false, counterTag: "all", counterMatchupMode: "against", counterEffectiveOnly: true, counterLimit: 80,
    gymRegion: "Kanto",
    ownedMode: "collection", ownedSearch: "", ownedType: "", ownedLocation: "all", ownedTag: "all", ownedShiny: false, ownedSort: "box", ownedLimit: 120
  };

  function createEmptyState() {
    return {
      schemaVersion: 3,
      captured: [],
      pokedexSeen: [],
      teams: [],
      gymCompleted: [],
      farmPokemon: [],
      pokemonTags: {},
      customPokemonTags: [],
      serverSync: null,
      preferences: { theme: "light", density: "comfortable" }
    };
  }

  function sanitizeCustomPokemonTags(value) {
    const seenIds = new Set();
    const seenNames = new Set(BUILTIN_POKEMON_TAGS.map(tag => normalize(tag.name)));
    return (Array.isArray(value) ? value : []).map((tag, index) => {
      const name = String(tag?.name || "").trim().slice(0, 28);
      const id = String(tag?.id || `custom-${index}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
      const normalizedName = normalize(name);
      if (!name || !id || seenIds.has(id) || seenNames.has(normalizedName)) return null;
      seenIds.add(id);
      seenNames.add(normalizedName);
      return { id, name, color: POKEMON_TAG_COLORS.includes(tag?.color) ? tag.color : POKEMON_TAG_COLORS[index % POKEMON_TAG_COLORS.length] };
    }).filter(Boolean);
  }

  function sanitizePokemonTagAssignments(value, validTagIds) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([instanceId, tagIds]) => {
      const tags = [...new Set((Array.isArray(tagIds) ? tagIds : []).map(String).filter(tagId => validTagIds.has(tagId)))];
      return [String(instanceId), tags];
    }).filter(([instanceId, tags]) => instanceId && tags.length));
  }

  function sanitizeState(value) {
    const fresh = createEmptyState();
    if (!value || typeof value !== "object") return fresh;
    const farmPokemon = [...new Set(Array.isArray(value.farmPokemon) ? value.farmPokemon.map(String).filter(Boolean) : [])];
    const customPokemonTags = sanitizeCustomPokemonTags(value.customPokemonTags);
    const validTagIds = new Set([...BUILTIN_POKEMON_TAGS.map(tag => tag.id), ...customPokemonTags.map(tag => tag.id)]);
    const pokemonTags = sanitizePokemonTagAssignments(value.pokemonTags, validTagIds);
    farmPokemon.forEach(instanceId => {
      pokemonTags[instanceId] = [...new Set([...(pokemonTags[instanceId] || []), "farm"])];
    });
    return {
      schemaVersion: 3,
      captured: [...new Set(Array.isArray(value.captured) ? value.captured.filter(id => pokemonById.has(id)) : [])],
      pokedexSeen: [...new Set(Array.isArray(value.pokedexSeen) ? value.pokedexSeen.filter(id => pokemonById.has(id)) : (Array.isArray(value.captured) ? value.captured.filter(id => pokemonById.has(id)) : []))],
      teams: Array.isArray(value.teams) ? value.teams.map(sanitizeTeam).filter(Boolean) : [],
      gymCompleted: [...new Set(Array.isArray(value.gymCompleted) ? value.gymCompleted : [])],
      farmPokemon,
      pokemonTags,
      customPokemonTags,
      serverSync: sanitizeServerSync(value.serverSync),
      preferences: {
        theme: value.preferences?.theme === "dark" ? "dark" : "light",
        density: value.preferences?.density === "compact" ? "compact" : "comfortable"
      }
    };
  }

  function sanitizeServerPokemon(pokemon) {
    if (!pokemon || typeof pokemon !== "object" || !pokemon.species) return null;
    const optionalNumber = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
    const serverField = (camelCase, snakeCase) => pokemon[camelCase] ?? pokemon[snakeCase];
    const statAliases = { hp: "hp", health: "hp", attack: "attack", atk: "attack", defence: "defence", defense: "defence", def: "defence", special_attack: "special_attack", specialattack: "special_attack", spa: "special_attack", special_defence: "special_defence", special_defense: "special_defence", specialdefence: "special_defence", specialdefense: "special_defence", spd: "special_defence", speed: "speed", spe: "speed" };
    const sanitizeStats = values => Object.fromEntries(Object.entries(values && typeof values === "object" ? values : {})
      .map(([key, amount]) => [statAliases[String(key).split(":").pop().toLowerCase()], amount])
      .filter(([key, amount]) => key && Number.isFinite(Number(amount)))
      .map(([key, amount]) => [key, Number(amount)]));
    return {
      uuid: pokemon.uuid ? String(pokemon.uuid) : null,
      species: String(pokemon.species),
      nickname: pokemon.nickname ? String(pokemon.nickname) : null,
      level: optionalNumber(pokemon.level),
      experience: optionalNumber(pokemon.experience),
      friendship: optionalNumber(pokemon.friendship),
      currentHealth: optionalNumber(serverField("currentHealth", "current_health")),
      form: pokemon.form ? String(pokemon.form) : null,
      shiny: Boolean(pokemon.shiny),
      gender: pokemon.gender ? String(pokemon.gender) : null,
      nature: pokemon.nature ? String(pokemon.nature) : null,
      mintedNature: serverField("mintedNature", "minted_nature") ? String(serverField("mintedNature", "minted_nature")) : null,
      ability: pokemon.ability ? String(pokemon.ability) : null,
      heldItem: serverField("heldItem", "held_item") ? String(serverField("heldItem", "held_item")) : null,
      caughtBall: serverField("caughtBall", "caught_ball") ? String(serverField("caughtBall", "caught_ball")) : null,
      originalTrainer: serverField("originalTrainer", "original_trainer") ? String(serverField("originalTrainer", "original_trainer")) : null,
      teraType: serverField("teraType", "tera_type") ? String(serverField("teraType", "tera_type")) : null,
      dmaxLevel: optionalNumber(serverField("dmaxLevel", "dmax_level")),
      gmaxFactor: Boolean(serverField("gmaxFactor", "gmax_factor")),
      ivs: sanitizeStats(pokemon.ivs),
      evs: sanitizeStats(pokemon.evs),
      hyperTrainedIvs: sanitizeStats(serverField("hyperTrainedIvs", "hyper_trained_ivs")),
      moves: Array.isArray(pokemon.moves) ? pokemon.moves.map(String).slice(0, 8) : [],
      position: pokemon.position ? String(pokemon.position) : ""
    };
  }

  function sanitizeServerSync(value) {
    if (!value || typeof value !== "object") return null;
    return {
      playerName: String(value.playerName || ""),
      uuid: String(value.uuid || ""),
      levelName: String(value.levelName || "world"),
      storageFormat: String(value.storageFormat || "nbt"),
      syncedAt: Number(value.syncedAt || 0),
      caughtCount: Math.max(0, Number(value.caughtCount || 0)),
      seenCount: Math.max(0, Number(value.seenCount || 0)),
      party: Array.isArray(value.party) ? value.party.map(sanitizeServerPokemon).filter(Boolean).slice(0, 6) : [],
      pc: Array.isArray(value.pc) ? value.pc.map(sanitizeServerPokemon).filter(Boolean) : [],
      keyItems: Array.isArray(value.keyItems) ? value.keyItems.map(String) : [],
      filesRead: Math.max(0, Number(value.filesRead || 0)),
      warnings: Array.isArray(value.warnings) ? value.warnings.map(String).slice(0, 20) : [],
      unmatchedSpecies: Array.isArray(value.unmatchedSpecies) ? value.unmatchedSpecies.map(String).slice(0, 50) : []
    };
  }

  function sanitizeTeam(team) {
    if (!team || typeof team !== "object") return null;
    const members = Array.isArray(team.members) ? team.members.filter(id => pokemonById.has(id)).slice(0, 6) : [];
    return {
      id: String(team.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`),
      name: String(team.name || "Time sem nome").trim().slice(0, 80),
      members,
      memberInstances: Array.isArray(team.memberInstances) ? team.memberInstances.map(value => value ? String(value) : null).slice(0, 6) : [],
      notes: String(team.notes || "").slice(0, 3000)
    };
  }

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/♀/g, " f ").replace(/♂/g, " m ").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function humanizeId(value) {
    const id = String(value || "").split(":").pop().replace(/_/g, " ");
    return id.replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function abilityNameKey(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function formatAbilityName(value) {
    return ABILITY_DISPLAY_NAMES.get(abilityNameKey(value)) || humanizeId(value);
  }

  function getPokemonAbilities(pokemon) {
    const regular = [];
    const hiddenCandidates = [];
    const seenRegular = new Set();
    const seenHidden = new Set();
    (pokemon?.abilities || []).forEach(rawAbility => {
      const isHidden = String(rawAbility).startsWith("h:");
      const ability = String(rawAbility).replace(/^h:/, "");
      const key = normalize(ability);
      if (!key) return;
      if (isHidden) {
        if (!seenHidden.has(key)) hiddenCandidates.push(ability);
        seenHidden.add(key);
      } else {
        if (!seenRegular.has(key)) regular.push(ability);
        seenRegular.add(key);
      }
    });
    const hidden = hiddenCandidates.filter(ability => !seenRegular.has(normalize(ability)));
    return { regular, hidden };
  }

  function renderAbilitySummary(pokemon) {
    const abilities = getPokemonAbilities(pokemon);
    const normalHtml = abilities.regular.length
      ? `<span class="badge is-muted">Possíveis: ${abilities.regular.map(ability => escapeHtml(formatAbilityName(ability))).join(" · ")}</span>`
      : `<span class="badge is-muted">Habilidade normal não informada</span>`;
    const hiddenHtml = abilities.hidden.length
      ? abilities.hidden.map(ability => `<span class="badge is-warning">HA: ${escapeHtml(formatAbilityName(ability))}</span>`).join("")
      : `<span class="badge is-muted">Sem HA diferente</span>`;
    return `<div class="ability-summary">${normalHtml}${hiddenHtml}</div>`;
  }

  function renderAbilitySection(pokemon) {
    const abilities = getPokemonAbilities(pokemon);
    const rows = [
      ...abilities.regular.map(ability => `<li><strong>${escapeHtml(formatAbilityName(ability))}</strong><span>Habilidade possível</span></li>`),
      ...abilities.hidden.map(ability => `<li class="is-hidden-ability"><strong>${escapeHtml(formatAbilityName(ability))}</strong><span>Hidden Ability (HA)</span></li>`)
    ];
    if (!abilities.hidden.length) {
      rows.push("<li><strong>HA</strong><span>Não há uma habilidade oculta diferente na base instalada.</span></li>");
    }
    return `<ul class="ability-list">${rows.join("") || "<li>Não informada.</li>"}</ul>`;
  }

  function smogonSlug(pokemon) {
    return imageSlug(pokemon?.name || "");
  }

  function smogonProfileUrl(pokemon) {
    const slug = smogonSlug(pokemon);
    return slug ? `https://www.smogon.com/dex/sv/pokemon/${slug}/` : "https://www.smogon.com/dex/sv/pokemon/";
  }

  async function openExternalUrl(url) {
    if (!/^https?:\/\//i.test(String(url || ""))) return;
    const invoke = window.__TAURI__?.core?.invoke;
    if (invoke) {
      try {
        await invoke("open_external_url", { url });
        return;
      } catch (error) {
        console.warn("Não foi possível abrir o link pelo desktop.", error);
      }
    }
    window.open(url, "_blank", "noopener");
  }

  function inferBuildKeys(pokemon) {
    const stats = pokemon?.stats || {};
    const attack = Number(stats.attack || 0);
    const specialAttack = Number(stats.special_attack || 0);
    const defence = Number(stats.defence || 0);
    const specialDefence = Number(stats.special_defence || 0);
    const speed = Number(stats.speed || 0);
    const hp = Number(stats.hp || 0);
    const primary = attack >= specialAttack ? "physical-offense" : "special-offense";
    const secondary = Math.abs(attack - specialAttack) <= 15
      ? (primary === "physical-offense" ? "special-offense" : "physical-offense")
      : Math.max(defence, specialDefence, hp) >= speed + 15
        ? (defence >= specialDefence ? "physical-bulk" : "special-bulk")
        : "support";
    return [primary, secondary];
  }

  function getBuildRecommendations(pokemon) {
    const exact = BUILD_OVERRIDES[normalize(pokemon?.name)];
    if (exact?.length) return exact;
    const typeMoves = (pokemon?.types || []).map(type => `STAB ${humanizeId(type)}`);
    return inferBuildKeys(pokemon).map(key => {
      const template = BUILD_TEMPLATES[key] || BUILD_TEMPLATES.support;
      const moves = key.includes("offense")
        ? [...typeMoves, ...(typeMoves.length < 2 ? ["Segundo STAB ou prioridade"] : []), "Cobertura", "Setup ou utilidade"].slice(0, 4)
        : [...typeMoves, "Recuperação ou proteção", "Status ou controle", "Cobertura"].slice(0, 4);
      return { ...template, moves };
    });
  }

  function renderBuildRecommendations(pokemon) {
    const smogonUrl = smogonProfileUrl(pokemon);
    return `<div class="build-recommendation-grid">${getBuildRecommendations(pokemon).map(build => `
      <article class="build-recommendation">
        <div class="build-recommendation-header"><div><span>${escapeHtml(build.role)}</span><strong>${escapeHtml(build.name)}</strong></div><button class="secondary-button" data-external-url="${escapeHtml(smogonUrl)}" type="button">Smogon ↗</button></div>
        <dl class="build-details"><div><dt>EVs</dt><dd>${escapeHtml(build.evs)}</dd></div><div><dt>Nature</dt><dd>${escapeHtml(build.nature)}</dd></div><div><dt>Item</dt><dd>${escapeHtml(build.item)}</dd></div></dl>
        <div class="build-moves">${(build.moves || []).map(move => `<span>${escapeHtml(move)}</span>`).join("")}</div>
        <p>${escapeHtml(build.note)}</p>
      </article>`).join("")}</div><p class="section-note">As sugestões restauram a base de planejamento da v1. Confirme formato, geração e moves disponíveis no perfil do Smogon.</p>`;
  }

  function getLegendaryFusions(pokemon) {
    const key = normalize(pokemon?.name);
    return LEGENDARY_FUSIONS.filter(fusion => fusion.members.includes(key));
  }

  function renderLegendaryFusions(pokemon) {
    const fusions = getLegendaryFusions(pokemon);
    if (!fusions.length) return "";
    return `<section class="detail-section is-wide fusion-section"><h3>Possíveis junções lendárias</h3><div class="fusion-grid">${fusions.map(fusion => `
      <article class="fusion-card">
        <div><span class="fusion-formula">${fusion.members.map(member => `<button class="fusion-member-button" data-profile-pokemon="${escapeHtml(member)}" type="button">${escapeHtml(humanizeId(member))}</button>`).join("<b>+</b>")}</span><strong>${escapeHtml(fusion.result)}</strong></div>
        <div class="type-row">${fusion.types.map(typePill).join("")}<span class="badge is-warning">${escapeHtml(fusion.ability)}</span></div>
        <p>${escapeHtml(fusion.note)}</p>
        <small>Item: <strong>${escapeHtml(fusion.item)}</strong> · <code>${escapeHtml(fusion.itemId)}</code></small>
      </article>`).join("")}</div><p class="section-note">Combinações encontradas no Mega Showdown instalado com o Cobbleverse 1.7.31.</p></section>`;
  }

  function imageSlug(name) {
    return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/♀/g, "-f").replace(/♂/g, "-m").replace(/[.'’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function pokemonImage(pokemon) {
    return `https://img.pokemondb.net/sprites/home/normal/${imageSlug(pokemon.name)}.png`;
  }

  function itemIcon(itemId) {
    const [namespace = "minecraft", path = ""] = String(itemId || "").split(":", 2);
    return `./assets/item-icons/${namespace}/${path}.png`;
  }

  function typePill(type) {
    return `<span class="type-pill" style="--type-color:${TYPE_COLORS[type] || "#607d68"}">${escapeHtml(humanizeId(type))}</span>`;
  }

  function effectiveness(attackType, defenderTypes) {
    return defenderTypes.reduce((value, defenderType) => value * (TYPE_CHART[attackType]?.[defenderType] ?? 1), 1);
  }

  function generationOf(pokemon) {
    const label = pokemon.labels.find(item => /^gen\d+$/i.test(item));
    if (label) return Number(label.replace(/\D/g, ""));
    const dex = pokemon.dex;
    return dex <= 151 ? 1 : dex <= 251 ? 2 : dex <= 386 ? 3 : dex <= 493 ? 4 : dex <= 649 ? 5 : dex <= 721 ? 6 : dex <= 809 ? 7 : dex <= 905 ? 8 : 9;
  }

  function resolvePokemon(value) {
    const query = normalize(value);
    if (!query) return null;
    if (/^\d+$/.test(query)) return DATA.pokemon.find(pokemon => pokemon.dex === Number(query)) || null;
    return pokemonByName.get(query) || DATA.pokemon.find(pokemon => normalize(pokemon.name).startsWith(query)) || null;
  }

  function resolveServerPokemon(value) {
    const raw = String(value || "");
    const id = raw.split(":").pop().toLowerCase();
    return pokemonById.get(id)
      || pokemonById.get(id.replace(/_/g, "-"))
      || pokemonByName.get(normalize(humanizeId(raw)))
      || null;
  }

  function captureSet() { return new Set(state.captured); }
  function seenSet() { return new Set([...state.pokedexSeen, ...state.captured]); }

  function getValidPokemonSpawns(pokemon) {
    const spawns = Array.isArray(pokemon?.spawns) ? pokemon.spawns : pokemon?.spawns ? [pokemon.spawns] : [];
    return spawns.filter(spawn => spawn && typeof spawn === "object" && Object.keys(spawn).length && Number(spawn.weight) > 0);
  }

  function getPokemonSpawnRarities(pokemon) {
    const buckets = new Set(getValidPokemonSpawns(pokemon).map(spawn => spawn.bucket).filter(Boolean));
    return SPAWN_RARITIES.filter(rarity => buckets.has(rarity.key));
  }

  function getPokemonAcquisitionMethods(pokemon) {
    const methods = Array.isArray(pokemon?.acquisitionMethods) ? pokemon.acquisitionMethods : pokemon?.acquisitionMethods ? [pokemon.acquisitionMethods] : [];
    return methods.filter(method => method && typeof method === "object" && Array.isArray(method.items));
  }

  function renderAcquisitionItem(itemId) {
    return `<div class="acquisition-item"><span class="item-icon-frame"><img src="${escapeHtml(itemIcon(itemId))}" alt="" loading="lazy"></span><span><strong>${escapeHtml(humanizeId(itemId))}</strong><code>${escapeHtml(itemId)}</code></span></div>`;
  }

  function renderSpecialAcquisitions(pokemon) {
    const methods = getPokemonAcquisitionMethods(pokemon);
    if (!methods.length) return "";
    return `<section class="detail-section is-wide acquisition-section"><div class="detail-section-heading"><div><h3>Obtenção especial</h3><p>Receitas declaradas pelo datapack do Cobbleverse.</p></div><span class="badge">Revival por item</span></div><div class="acquisition-grid">${methods.map(method => `<article class="acquisition-card"><div class="acquisition-card-title"><span>${method.shiny ? "Versão shiny" : "Revival"}</span><strong>${method.items.length > 1 ? "Use estes itens juntos" : "Use este item"}</strong></div><div class="acquisition-items">${method.items.map(renderAcquisitionItem).join(method.items.length > 1 ? '<b class="acquisition-plus">+</b>' : "")}</div><p>Use ${method.items.length > 1 ? "os itens indicados" : "o item indicado"} no sistema de revival de fósseis para obter ${escapeHtml(pokemon.name)}${method.shiny ? " shiny" : ""}.</p></article>`).join("")}</div></section>`;
  }

  function applyPreferences() {
    document.documentElement.dataset.theme = state.preferences.theme;
    document.body.dataset.theme = state.preferences.theme;
    document.body.classList.toggle("compact", state.preferences.density === "compact");
  }

  function backupLegacyLocalStorage() {
    if (localStorage.getItem(V1_SNAPSHOT_KEY)) return;
    const values = {};
    const keys = new Set(LEGACY_KEYS);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key !== APP_STATE_KEY && key !== V1_SNAPSHOT_KEY) keys.add(key);
    }
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value !== null) values[key] = value;
    }
    localStorage.setItem(V1_SNAPSHOT_KEY, JSON.stringify({ schema: "pixelmon-pokelist-v1", savedAt: new Date().toISOString(), values }));
  }

  async function loadState() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (invoke) {
      try {
        const loaded = await invoke("load_app_state");
        return sanitizeState(loaded);
      } catch (error) {
        console.warn("Banco desktop indisponível; usando localStorage.", error);
      }
    }
    try { return sanitizeState(JSON.parse(localStorage.getItem(APP_STATE_KEY) || "null")); }
    catch { return createEmptyState(); }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveState, 120);
  }

  async function saveState() {
    const snapshot = JSON.parse(JSON.stringify(state));
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(snapshot));
    const invoke = window.__TAURI__?.core?.invoke;
    if (invoke) {
      try { await invoke("save_app_state", { state: snapshot }); }
      catch (error) { console.warn("Não foi possível salvar no banco desktop.", error); }
    }
  }

  async function loadSftpProfileStatus() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return;
    try {
      sftpProfileStatus = await invoke("get_sftp_profile_status");
    } catch (error) {
      sftpConnectionStatus = error?.message || String(error);
      sftpConnectionTone = "danger";
    }
  }

  function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function updateChrome() {
    const copy = VIEW_COPY[activeView];
    viewKicker.textContent = copy[0];
    viewTitle.textContent = copy[1];
    viewDescription.textContent = copy[2];
    document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("is-active", button.dataset.view === activeView));
    document.querySelector("#nav-pokedex-count").textContent = DATA.pokemon.length;
    document.querySelector("#nav-drops-count").textContent = dropRows.filter(row => !row.pastureBlocked).length;
    document.querySelector("#nav-baits-count").textContent = DATA.baits.length;
    document.querySelector("#nav-berries-count").textContent = DATA.berries.length;
    const ownedCount = (state.serverSync?.party.length || 0) + (state.serverSync?.pc.length || 0);
    document.querySelector("#nav-teams-count").textContent = ownedCount || state.teams.length;
    document.querySelector("#nav-gyms-count").textContent = `${state.gymCompleted.length}/${DATA.gyms.length}`;
    const pokedexProgress = activeView === "pokedex"
      ? `<span class="meta-pill pokedex-meta-count"><span aria-hidden="true">◉</span><b>${seenSet().size}</b> vistos</span><span class="meta-pill pokedex-meta-count"><span class="caught-ball-icon" aria-hidden="true"></span><b>${captureSet().size}</b> capturados</span>`
      : "";
    headerMeta.innerHTML = `${pokedexProgress}<span class="meta-pill">${escapeHtml(DATA.metadata.modpackVersion)}</span><span class="meta-pill">Cobblemon ${escapeHtml(DATA.metadata.cobblemonVersion)}</span>`;
    const syncButton = document.querySelector("#server-player-sync");
    syncButton.hidden = !sftpProfileStatus.saved;
    syncButton.disabled = sftpPlayerSyncBusy;
    syncButton.textContent = sftpPlayerSyncBusy
      ? "Atualizando dados..."
      : sftpPlayerName.trim()
        ? `Atualizar ${sftpPlayerName.trim()}`
        : "Configurar jogador";
    const lastSync = state.serverSync?.syncedAt ? new Date(state.serverSync.syncedAt * 1000).toLocaleString("pt-BR") : "";
    syncButton.title = lastSync ? `Última atualização: ${lastSync}` : "Buscar manualmente Pokédex, time e PC via SFTP";
  }

  function getAutocompleteOptions(input) {
    const listId = input?.dataset.autocompleteList || input?.getAttribute("list");
    const datalist = listId ? document.getElementById(listId) : null;
    if (!datalist) return [];
    return [...datalist.options].map(option => ({
      value: option.value,
      detail: option.label || option.textContent || ""
    })).filter(option => option.value);
  }

  function getAutocompleteMatches(input) {
    const query = normalize(input?.value);
    if (!query) return [];
    return getAutocompleteOptions(input)
      .map(option => {
        const value = normalize(option.value);
        const detail = normalize(option.detail);
        const starts = value.startsWith(query);
        const contains = value.includes(query) || detail.includes(query);
        return { ...option, starts, contains };
      })
      .filter(option => option.contains)
      .sort((left, right) => Number(right.starts) - Number(left.starts) || left.value.localeCompare(right.value, "pt-BR"))
      .slice(0, 8);
  }

  function updateTextInputControls(input, showAutocomplete = false) {
    if (!input?.matches(".input")) return;
    const wrapper = input.closest(".clearable-input");
    const clearButton = wrapper?.querySelector(".input-clear-button");
    if (clearButton) clearButton.hidden = !input.value;
    const menu = wrapper?.querySelector(".autocomplete-menu");
    if (!menu) return;
    const matches = showAutocomplete ? getAutocompleteMatches(input) : [];
    menu.innerHTML = matches.map((option, index) => `<button class="autocomplete-option${index === 0 ? " is-active" : ""}" data-autocomplete-value="${escapeHtml(option.value)}" type="button"><strong>${escapeHtml(option.value)}</strong>${option.detail && option.detail !== option.value ? `<span>${escapeHtml(option.detail)}</span>` : ""}</button>`).join("");
    menu.hidden = !matches.length;
  }

  function enhanceTextInputs() {
    content.querySelectorAll("input.input").forEach(input => {
      if (["checkbox", "file", "radio", "hidden"].includes(input.type)) return;
      const labelText = input.closest("label")?.querySelector(":scope > span")?.textContent || "campo";
      const listId = input.getAttribute("list");
      if (listId) {
        input.dataset.autocompleteList = listId;
        input.removeAttribute("list");
        input.setAttribute("autocomplete", "off");
      }
      const wrapper = document.createElement("div");
      wrapper.className = "clearable-input";
      input.before(wrapper);
      wrapper.append(input);

      const clearButton = document.createElement("button");
      clearButton.className = "input-clear-button";
      clearButton.type = "button";
      clearButton.dataset.clearInput = input.id || "true";
      clearButton.setAttribute("aria-label", `Limpar ${labelText}`);
      clearButton.textContent = "×";
      clearButton.hidden = !input.value;
      wrapper.append(clearButton);

      if (listId) {
        const menu = document.createElement("div");
        menu.className = "autocomplete-menu";
        menu.setAttribute("role", "listbox");
        menu.hidden = true;
        wrapper.append(menu);
      }
    });
  }

  function moveAutocompleteSelection(input, direction) {
    const options = [...(input.closest(".clearable-input")?.querySelectorAll(".autocomplete-option") || [])];
    if (!options.length) return false;
    const current = options.findIndex(option => option.classList.contains("is-active"));
    const next = current < 0 ? 0 : (current + direction + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle("is-active", index === next));
    options[next].scrollIntoView({ block: "nearest" });
    return true;
  }

  function selectAutocompleteValue(input, value) {
    if (!input) return;
    input.value = value;
    input.focus();
    if (typeof input.setSelectionRange === "function") input.setSelectionRange(value.length, value.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function rerenderPreservingFocus() {
    const active = document.activeElement;
    const id = active?.id;
    const start = active?.selectionStart;
    const end = active?.selectionEnd;
    render();
    if (!id) return;
    requestAnimationFrame(() => {
      const next = document.getElementById(id);
      if (!next) return;
      next.focus();
      if (typeof next.setSelectionRange === "function" && Number.isInteger(start)) next.setSelectionRange(start, end);
      updateTextInputControls(next, true);
    });
  }

  function render() {
    pokedexAutoLoadObserver?.disconnect();
    pokedexAutoLoadObserver = null;
    updateChrome();
    content.innerHTML = "";
    ({
      home: renderHome,
      pokedex: renderPokedex,
      drops: renderDrops,
      baits: renderBaits,
      berries: renderBerries,
      "ev-training": renderEvTraining,
      breeding: renderBreeding,
      teams: renderTeams,
      counters: renderCounters,
      gyms: renderGyms,
      settings: renderSettings
    })[activeView]();
    enhanceTextInputs();
  }

  function renderHome() {
    const entries = ownedPokemonEntries();
    const farms = entries.filter(isFarmPokemon);
    const usable = entries.filter(entry => !isFarmPokemon(entry));
    const coverage = state.serverSync ? dropCoverageRows("all", "") : [];
    const coveredDrops = coverage.filter(row => row.status === "covered").length;
    const completedGyms = new Set(state.gymCompleted);
    const nextGym = DATA.gyms.find(gym => !completedGyms.has(gym.id));
    const syncedAt = state.serverSync?.syncedAt ? new Date(state.serverSync.syncedAt * 1000).toLocaleString("pt-BR") : "Ainda não sincronizado";
    const duplicateSpecies = new Map();
    usable.forEach(entry => {
      const pokemon = resolveServerPokemon(entry.species);
      if (pokemon?.drops.some(drop => !drop.pastureBlocked)) duplicateSpecies.set(pokemon.id, { pokemon, count: (duplicateSpecies.get(pokemon.id)?.count || 0) + 1 });
    });
    const farmCandidates = [...duplicateSpecies.values()].filter(row => row.count > 1).sort((left, right) => right.count - left.count || left.pokemon.dex - right.pokemon.dex).slice(0, 4);
    if (!state.serverSync) {
      content.innerHTML = `<section class="home-hero"><div><p class="eyebrow">Comece pela sua coleção</p><h3>Conecte o jogador ao Companion</h3><p>Depois da sincronização, a Home passa a resumir Pokémon utilizáveis, farms, cobertura de drops e progresso regional.</p></div><button class="primary-button" data-action="home-open-view" data-view="settings" type="button">Configurar servidor</button></section><div class="home-action-grid">${renderHomeAction("Pokédex", "Consultar espécies, evoluções e spawns.", "pokedex", `${DATA.pokemon.length} espécies`)}${renderHomeAction("Drops", "Pesquisar fontes e chances do Pasture.", "drops", `${dropRows.filter(row => !row.pastureBlocked).length} combinações`)}${renderHomeAction("Ginásios", "Equipes oficiais, estruturas e recompensas.", "gyms", `${state.gymCompleted.length}/${DATA.gyms.length}`)}</div>`;
      return;
    }
    content.innerHTML = `<section class="home-hero"><div><p class="eyebrow">${escapeHtml(state.serverSync.playerName)}</p><h3>Sua central do Cobbleverse</h3><p>Última leitura: ${escapeHtml(syncedAt)}. Use “Atualizar agora” para carregar os dados mais recentes do servidor.</p></div>${sftpProfileStatus.saved ? `<button class="primary-button" data-action="home-sync" type="button"${sftpPlayerSyncBusy ? " disabled" : ""}>${sftpPlayerSyncBusy ? "Atualizando..." : "Atualizar agora"}</button>` : ""}</section><div class="home-stat-grid"><article><span>Utilizáveis</span><b>${usable.length}</b><small>${new Set(usable.map(entry => resolveServerPokemon(entry.species)?.id).filter(Boolean)).size} espécies</small></article><article><span>Farms</span><b>${farms.length}</b><small>indivíduos separados</small></article><article><span>Drops cobertos</span><b>${coveredDrops}/${coverage.length}</b><small>por farms marcados</small></article><article><span>Ginásios</span><b>${state.gymCompleted.length}/${DATA.gyms.length}</b><small>${nextGym ? `próximo: ${escapeHtml(nextGym.leader)}` : "todos concluídos"}</small></article></div><div class="home-action-grid">${renderHomeAction("Meus Pokémon", "Gerenciar utilizáveis, farms e times.", "teams", `${entries.length} sincronizados`)}${renderHomeAction("Cobertura da fazenda", "Ver itens cobertos, disponíveis e ausentes.", "drops", `${coveredDrops} itens cobertos`, "coverage")}${renderHomeAction("Counters", "Encontrar opções de batalha disponíveis no PC.", "counters", `${pcPokemonIds().size} espécies utilizáveis`)}${renderHomeAction("Ginásios", nextGym ? `Preparar a equipe para ${nextGym.leader}.` : "Revisar ginásios e estruturas especiais.", "gyms", `${state.gymCompleted.length}/${DATA.gyms.length}`)}</div>${farmCandidates.length ? `<section class="panel home-farm-suggestions"><div class="section-heading"><div><p class="eyebrow">Organização sugerida</p><h3>Possíveis Pokémon de farm</h3><p>Espécies repetidas que possuem drops farmáveis e ainda estão na lista de utilizáveis.</p></div><button class="secondary-button" data-action="home-open-view" data-view="teams" data-owned-mode="collection" type="button">Classificar individualmente</button></div><div class="home-farm-candidate-row">${farmCandidates.map(row => `<button data-action="owned-mark-species-farm" data-pokemon="${escapeHtml(row.pokemon.id)}" type="button"><img src="${pokemonImage(row.pokemon)}" alt="" loading="lazy"><b>${row.count}× ${escapeHtml(row.pokemon.name)}</b><small>${row.pokemon.drops.filter(drop => !drop.pastureBlocked).length} drops</small><em>Marcar todos como farm</em></button>`).join("")}</div></section>` : ""}`;
  }

  function renderHomeAction(title, description, view, meta, dropMode = "") {
    return `<button class="home-action-card" data-action="home-open-view" data-view="${escapeHtml(view)}"${view === "teams" ? ' data-owned-mode="collection"' : ""}${dropMode ? ` data-drop-mode="${escapeHtml(dropMode)}"` : ""} type="button"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span><b>${escapeHtml(meta)}</b><i aria-hidden="true">→</i></button>`;
  }

  function renderPokedex() {
    const query = normalize(ui.pokedexSearch);
    const captured = captureSet();
    const seen = seenSet();
    const filtered = DATA.pokemon.filter(pokemon => {
      if (ui.pokedexType && !pokemon.types.includes(ui.pokedexType)) return false;
      if (ui.pokedexGeneration && generationOf(pokemon) !== Number(ui.pokedexGeneration)) return false;
      if (!query) return true;
      const abilityNames = pokemon.abilities.map(ability => formatAbilityName(String(ability).replace(/^h:/, ""))).join(" ");
      return normalize(`${pokemon.dex} ${pokemon.name} ${pokemon.types.join(" ")} ${pokemon.abilities.join(" ")} ${abilityNames}`).includes(query);
    });
    const visible = filtered.slice(0, ui.pokedexLimit);
    content.innerHTML = `
      <div class="toolbar">
        <label class="field"><span>Buscar Pokémon</span><input class="input" id="pokedex-search" list="pokemon-options" value="${escapeHtml(ui.pokedexSearch)}" placeholder="Nome, número, habilidade..."></label>
        <label class="field"><span>Tipo</span><select class="select" id="pokedex-type"><option value="">Todos</option>${ALL_TYPES.map(type => `<option value="${type}"${ui.pokedexType === type ? " selected" : ""}>${humanizeId(type)}</option>`).join("")}</select></label>
        <label class="field"><span>Geração</span><select class="select" id="pokedex-generation"><option value="">Todas</option>${Array.from({ length: 9 }, (_, index) => `<option value="${index + 1}"${String(index + 1) === ui.pokedexGeneration ? " selected" : ""}>Geração ${index + 1}</option>`).join("")}</select></label>
      </div>
      <div class="info-banner pokedex-progress-banner"><div><strong>${filtered.length} espécies encontradas</strong><p>O olho indica registro visual; a Pokébola aparece somente nas espécies realmente capturadas.</p></div><div class="pokedex-progress-counts"><div class="info-stat"><b>${seen.size}</b><span>vistos</span></div><div class="info-stat"><b>${captured.size}</b><span>capturados</span></div></div></div>
      <div class="pokemon-grid">${visible.map(pokemon => renderPokemonCard(pokemon, seen, captured)).join("")}</div>
      ${visible.length < filtered.length ? `<button class="secondary-button load-more" data-action="pokedex-more" type="button">Mostrar mais ${Math.min(96, filtered.length - visible.length)}</button>` : ""}
    `;
    enablePokedexAutoLoad();
  }

  function enablePokedexAutoLoad() {
    const fallbackButton = content.querySelector("[data-action='pokedex-more']");
    if (!fallbackButton || activeView !== "pokedex" || !("IntersectionObserver" in window)) return;

    pokedexAutoLoadObserver = new IntersectionObserver(entries => {
      if (activeView !== "pokedex" || !entries.some(entry => entry.isIntersecting)) return;
      pokedexAutoLoadObserver?.disconnect();
      pokedexAutoLoadObserver = null;
      ui.pokedexLimit += 96;
      render();
    }, { rootMargin: "400px 0px", threshold: 0.01 });
    pokedexAutoLoadObserver.observe(fallbackButton);
  }

  function renderPokemonCard(pokemon, seen, captured) {
    const isCaptured = captured.has(pokemon.id);
    const isSeen = seen.has(pokemon.id);
    const abilities = getPokemonAbilities(pokemon);
    const abilityCount = abilities.regular.length + abilities.hidden.length;
    const spawnCount = getValidPokemonSpawns(pokemon).length;
    return `<article class="pokemon-card${isSeen ? " is-seen" : ""}${isCaptured ? " is-captured" : ""}" data-action="open-pokemon" data-pokemon="${pokemon.id}" tabindex="0">
      <button class="capture-toggle${isCaptured ? " is-captured" : isSeen ? " is-seen" : ""}" data-action="cycle-pokedex-status" data-pokemon="${pokemon.id}" type="button" aria-label="Alterar registro de ${escapeHtml(pokemon.name)}">${isCaptured ? '<span class="caught-ball-icon" aria-label="Capturado"></span>' : isSeen ? '<span aria-label="Visto">◉</span>' : "+"}</button>
      <div class="pokemon-image-wrap"><img class="pokemon-image" src="${pokemonImage(pokemon)}" alt="" loading="lazy"></div>
      <div class="pokemon-card-body"><span class="pokemon-number">#${String(pokemon.dex).padStart(4, "0")} · Gen ${generationOf(pokemon)}</span><h3 class="pokemon-name">${escapeHtml(pokemon.name)}</h3><div class="type-row">${pokemon.types.map(typePill).join("")}</div><div class="badge-row"><span class="badge is-muted">${abilityCount} hab.</span><span class="badge is-muted">${spawnCount} spawns</span><span class="badge is-muted">${pokemon.drops.filter(drop => !drop.pastureBlocked).length} drops</span></div></div>
    </article>`;
  }

  function resolveEvolutionNodePokemon(node) {
    if (!node) return null;
    return DATA.pokemon.find(pokemon => pokemon.dex === Number(node.id))
      || pokemonByName.get(normalize(node.name))
      || null;
  }

  function createFallbackEvolutionRoot(pokemon) {
    return {
      id: pokemon.dex,
      name: pokemon.name,
      requirement: "",
      children: (pokemon.evolutions || []).map(evolution => {
        const target = resolvePokemon(evolution.result);
        return {
          id: target?.dex || 0,
          name: humanizeId(evolution.result),
          requirement: evolution.requirements.map(formatRequirement).join(" · ") || humanizeId(evolution.variant),
          children: []
        };
      })
    };
  }

  function getProfileEvolutionRoot(pokemon) {
    const member = V1_EVOLUTION_MEMBER_BY_NAME.get(normalize(pokemon?.name));
    return V1_EVOLUTION_CHAIN_BY_ID.get(member?.chainId) || createFallbackEvolutionRoot(pokemon);
  }

  function renderEvolutionTreeNode(node, activePokemon) {
    const target = resolveEvolutionNodePokemon(node);
    const isActive = target?.id === activePokemon.id;
    const isCaptured = target ? captureSet().has(target.id) : false;
    const isSeen = target ? seenSet().has(target.id) : false;
    const requirement = node.requirement ? node.requirement.charAt(0).toUpperCase() + node.requirement.slice(1) : "Forma base";
    const card = `<button class="profile-evolution-card${isActive ? " is-active" : ""}" type="button"${target ? ` data-profile-pokemon="${escapeHtml(target.id)}"` : " disabled"}>
      ${target ? `<img src="${pokemonImage(target)}" alt="" loading="lazy">` : "<span class=\"profile-evolution-placeholder\">?</span>"}
      <span class="profile-evolution-text"><strong>${target ? `#${String(target.dex).padStart(4, "0")} ${escapeHtml(node.name || target.name)}` : escapeHtml(node.name)}</strong><small>${escapeHtml(requirement)}</small><em>${isActive ? "Perfil atual" : isCaptured ? "Capturado · abrir perfil" : isSeen ? "Visto · abrir perfil" : "Abrir perfil"}</em></span>
    </button>`;
    const children = (node.children || []).map(child => `<div class="profile-evolution-child">${renderEvolutionTreeNode(child, activePokemon)}</div>`).join("");
    return `<div class="profile-evolution-branch">${card}${children ? `<div class="profile-evolution-children">${children}</div>` : ""}</div>`;
  }

  function renderProfileEvolutionTree(pokemon) {
    const root = getProfileEvolutionRoot(pokemon);
    return `<div class="profile-evolution-tree">${renderEvolutionTreeNode(root, pokemon)}</div><p class="section-note">Clique em qualquer card para abrir o perfil correspondente.</p>`;
  }

  function formatRequirement(requirement) {
    if (!requirement || typeof requirement !== "object") return "Requisito especial";
    const values = Object.entries(requirement).filter(([key]) => key !== "variant").map(([key, value]) => `${humanizeId(key)}: ${Array.isArray(value) ? value.map(humanizeId).join(", ") : humanizeId(value)}`);
    return `${humanizeId(requirement.variant || "requisito")}${values.length ? ` · ${values.join(" · ")}` : ""}`;
  }

  function flattenCondition(condition) {
    if (!condition) return [];
    return Object.entries(condition).flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map(item => `${humanizeId(key)}: ${humanizeId(item)}`);
    });
  }

  function captureBallRecommendations(pokemon, spawns = []) {
    const catchRate = Number(pokemon.catchRate);
    const recommendations = [];
    const add = (name, reason) => {
      if (!recommendations.some(item => item.name === name)) recommendations.push({ name, reason });
    };
    const conditionText = JSON.stringify(spawns.map(spawn => [spawn.position, spawn.context, spawn.condition])).toLowerCase();
    const hasDarkEncounter = /night|cave|deep_dark|maxskylight|"canseesky":false/.test(conditionText);
    const hasWaterEncounter = spawns.some(spawn => ["submerged", "fishing"].includes(spawn.position)) || /ocean|river|water/.test(conditionText);

    if (Number.isFinite(catchRate) && catchRate <= 3) add("Master Ball", "captura garantida; vale reservar para este encontro extremamente difícil.");
    add("Quick Ball", "melhor primeira tentativa: use logo no primeiro turno.");
    if (hasDarkEncounter) add("Dusk Ball", "excelente quando o encontro acontece à noite ou dentro de cavernas.");
    if (hasWaterEncounter) add("Dive Ball", "boa escolha quando o Pokémon é encontrado submerso ou durante a pesca.");
    if (pokemon.types.some(type => ["water", "bug"].includes(type))) add("Net Ball", "recebe bônus contra Pokémon dos tipos Água ou Inseto.");
    if (Number.isFinite(catchRate) && catchRate <= 60) add("Timer Ball", "ganha força em batalhas longas; reduza o HP, aplique status e aguarde alguns turnos.");
    add("Ultra Ball", "opção geral confiável quando nenhuma condição especial se aplica.");
    add("Repeat Ball", "ótima alternativa se esta espécie já estiver registrada como capturada.");
    return recommendations.slice(0, 3);
  }

  function renderPokemonModal(pokemon) {
    const stats = pokemon.stats || {};
    const validSpawns = getValidPokemonSpawns(pokemon);
    const ballRecommendations = captureBallRecommendations(pokemon, validSpawns);
    const spawnHtml = validSpawns.length ? validSpawns.map(spawn => {
      const conditions = [...flattenCondition(spawn.condition), ...flattenCondition(spawn.anticondition).map(value => `Não ${value}`)];
      return `<div class="spawn-entry"><div class="badge-row"><span class="badge">${escapeHtml(humanizeId(spawn.bucket || "desconhecido"))}</span><span class="badge is-muted">Nível ${escapeHtml(spawn.level || "?")}</span><span class="badge is-muted">Peso ${escapeHtml(spawn.weight ?? "?")}</span><span class="badge is-muted">${escapeHtml(humanizeId(spawn.position || spawn.context || "mundo"))}</span></div><p>${conditions.map(escapeHtml).join(" · ") || "Sem condição adicional declarada."}</p></div>`;
    }).join("") : `<p class='section-note'>Nenhum spawn natural declarado no datapack.${getPokemonAcquisitionMethods(pokemon).length ? " Veja a obtenção especial por item acima." : " Pode exigir estrutura, altar, evento ou invocação."}</p>`;
    const dropHtml = pokemon.drops.length ? pokemon.drops.map(drop => `<li><strong>${escapeHtml(humanizeId(drop.item))}</strong> · ${formatPercent(drop.percentage)} · qtd. ${escapeHtml(drop.quantity)}${drop.pastureBlocked ? " <span class='badge is-danger'>bloqueado no Pasture</span>" : ""}</li>`).join("") : "<li>Nenhum drop declarado.</li>";
    modalContent.innerHTML = `
      <div class="modal-hero"><img src="${pokemonImage(pokemon)}" alt=""><div><p class="eyebrow">#${String(pokemon.dex).padStart(4, "0")} · Geração ${generationOf(pokemon)}</p><h2 id="modal-title">${escapeHtml(pokemon.name)}</h2><div class="type-row">${pokemon.types.map(typePill).join("")}</div>${renderAbilitySummary(pokemon)}</div></div>
      <div class="stats-grid">${[["HP", stats.hp], ["Ataque", stats.attack], ["Defesa", stats.defence], ["Sp. Atk", stats.special_attack], ["Sp. Def", stats.special_defence], ["Velocidade", stats.speed]].map(([label, value]) => `<div class="stat-box"><b>${value ?? "—"}</b><span>${label}</span></div>`).join("")}</div>
      <div class="detail-columns" style="margin-top:14px">
        <section class="detail-section"><h3>Informações</h3><ul class="detail-list"><li>Egg Groups: ${pokemon.eggGroups.map(humanizeId).join(", ") || "—"}</li><li>Catch rate: ${pokemon.catchRate ?? "—"}</li><li>Altura: ${pokemon.height ? `${pokemon.height / 10} m` : "—"} · Peso: ${pokemon.weight ? `${pokemon.weight / 10} kg` : "—"}</li></ul></section>
        <section class="detail-section"><h3>Habilidades possíveis</h3>${renderAbilitySection(pokemon)}</section>
        <section class="detail-section is-wide profile-evolution-section"><h3>Linha evolutiva</h3>${renderProfileEvolutionTree(pokemon)}</section>
        <section class="detail-section"><h3>Drops</h3><ul class="detail-list">${dropHtml}</ul></section>
        <section class="detail-section"><h3>Poké Balls recomendadas</h3><ul class="detail-list">${ballRecommendations.map((item, index) => `<li><strong>${index === 0 ? "Melhor opção: " : ""}${escapeHtml(item.name)}</strong> · ${escapeHtml(item.reason)}</li>`).join("")}</ul><p class="section-note">Sugestão baseada no catch rate e nos spawns conhecidos. HP baixo e Sono ou Paralisia continuam aumentando as chances.</p></section>
        ${renderSpecialAcquisitions(pokemon)}
        ${renderLegendaryFusions(pokemon)}
        <section class="detail-section is-wide build-section"><div class="detail-section-heading"><div><h3>Builds recomendadas</h3><p>Possíveis funções para começar o planejamento.</p></div><button class="secondary-button" data-external-url="${escapeHtml(smogonProfileUrl(pokemon))}" type="button">Ver perfil no Smogon ↗</button></div>${renderBuildRecommendations(pokemon)}</section>
        <section class="detail-section is-wide"><h3>Spawns naturais do Cobbleverse</h3>${spawnHtml}</section>
      </div>`;
    modal.hidden = false;
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${number.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  }

  function renderDrops() {
    if (ui.dropMode === "coverage") {
      renderDropCoverage();
      return;
    }
    const query = normalize(ui.dropSearch);
    let rows = dropRows.filter(row => {
      if (ui.dropFarmableOnly && row.pastureBlocked) return false;
      return !query || normalize(`${row.pokemon.dex} ${row.pokemon.name} ${row.item} ${humanizeId(row.item)}`).includes(query);
    });
    rows = [...rows].sort(ui.dropSort === "chance"
      ? (left, right) => right.percentage - left.percentage || left.pokemon.dex - right.pokemon.dex
      : ui.dropSort === "item"
        ? (left, right) => humanizeId(left.item).localeCompare(humanizeId(right.item), "pt-BR")
        : (left, right) => left.pokemon.dex - right.pokemon.dex || humanizeId(left.item).localeCompare(humanizeId(right.item)));
    const visible = rows.slice(0, ui.dropLimit);
    const triggerChance = DATA.pasture.dropChancePerMinute * 100;
    content.innerHTML = `
      <div class="tab-row drop-tabs"><button class="tab-button is-active" data-action="drop-mode" data-mode="catalog" type="button">Catálogo de drops</button><button class="tab-button" data-action="drop-mode" data-mode="coverage" type="button">Cobertura da fazenda</button></div>
      <div class="info-banner"><div><strong>Como interpretar as chances</strong><p>O Pasture Loot tenta gerar drops com ${formatPercent(triggerChance)} de chance por minuto. Quando a tentativa passa, cada item usa a porcentagem da tabela do Pokémon. Itens bloqueados pela configuração 1.7.31 ficam fora do filtro padrão.</p></div><div class="info-stat"><b>${formatPercent(triggerChance)}</b><span>tentativa por minuto</span></div></div>
      <div class="toolbar is-wide">
        <label class="field"><span>Item ou Pokémon</span><input class="input" id="drop-search" list="drop-options" value="${escapeHtml(ui.dropSearch)}" placeholder="Ex.: Blaze Powder, Charizard ou 6..."></label>
        <label class="field"><span>Ordenar</span><select class="select" id="drop-sort"><option value="pokemon"${ui.dropSort === "pokemon" ? " selected" : ""}>Pokémon</option><option value="item"${ui.dropSort === "item" ? " selected" : ""}>Item</option><option value="chance"${ui.dropSort === "chance" ? " selected" : ""}>Maior chance</option></select></label>
        <label class="checkbox-field"><input id="drop-farmable" type="checkbox"${ui.dropFarmableOnly ? " checked" : ""}> Somente farmável no Pasture</label>
        <div class="info-stat"><b>${rows.length}</b><span>combinações</span></div>
      </div>
      ${visible.length ? `<div class="drop-grid">${visible.map(renderDropCard).join("")}</div>` : renderEmpty("Nenhum drop encontrado", "Tente outro item ou desative o filtro do Pasture.")}
      ${visible.length < rows.length ? `<button class="secondary-button load-more" data-action="drops-more" type="button">Mostrar mais ${Math.min(120, rows.length - visible.length)}</button>` : ""}`;
  }

  function dropCoverageRows(coverageFilter = ui.dropCoverage, searchValue = ui.dropSearch) {
    const entries = ownedPokemonEntries();
    const farmCounts = new Map();
    const usableCounts = new Map();
    entries.forEach(entry => {
      const pokemon = resolveServerPokemon(entry.species);
      if (!pokemon) return;
      const target = isFarmPokemon(entry) ? farmCounts : usableCounts;
      target.set(pokemon.id, (target.get(pokemon.id) || 0) + 1);
    });
    const items = new Map();
    dropRows.forEach(row => {
      if (ui.dropFarmableOnly && row.pastureBlocked) return;
      if (!items.has(row.item)) items.set(row.item, { item: row.item, blockedOnly: true, sources: new Map() });
      const item = items.get(row.item);
      item.blockedOnly = item.blockedOnly && row.pastureBlocked;
      const current = item.sources.get(row.pokemon.id);
      if (!current || Number(row.percentage || 0) > Number(current.percentage || 0)) item.sources.set(row.pokemon.id, row);
    });
    const query = normalize(searchValue);
    return [...items.values()].map(item => {
      const sources = [...item.sources.values()].map(row => ({ ...row, farmCount: farmCounts.get(row.pokemon.id) || 0, usableCount: usableCounts.get(row.pokemon.id) || 0 }));
      const farmSources = sources.filter(source => source.farmCount > 0);
      const usableSources = sources.filter(source => source.usableCount > 0);
      const status = farmSources.length ? "covered" : usableSources.length ? "available" : "missing";
      return { ...item, sources, farmSources, usableSources, status };
    }).filter(row => {
      if (coverageFilter !== "all" && row.status !== coverageFilter) return false;
      return !query || normalize(`${row.item} ${humanizeId(row.item)} ${row.sources.map(source => source.pokemon.name).join(" ")}`).includes(query);
    }).sort((left, right) => ({ covered: 0, available: 1, missing: 2 }[left.status] - { covered: 0, available: 1, missing: 2 }[right.status]) || humanizeId(left.item).localeCompare(humanizeId(right.item), "pt-BR"));
  }

  function renderDropCoverageCard(row) {
    const sourcePool = row.farmSources.length ? row.farmSources : row.usableSources.length ? row.usableSources : [...row.sources].sort((left, right) => Number(right.percentage || 0) - Number(left.percentage || 0));
    const sources = sourcePool.slice(0, 4);
    const statusCopy = row.status === "covered"
      ? { label: "Coberto por farm", description: `${row.farmSources.reduce((sum, source) => sum + source.farmCount, 0)} indivíduo(s) marcado(s) produzem este item.` }
      : row.status === "available"
        ? { label: "Disponível na coleção", description: "Você possui uma fonte, mas ela ainda não está marcada como farm." }
        : { label: "Não coberto", description: "Nenhuma das espécies que produzem este item está na coleção sincronizada." };
    return `<article class="drop-coverage-card is-${row.status}"><div class="drop-coverage-heading"><span class="item-icon-frame"><img src="${escapeHtml(itemIcon(row.item))}" alt="" loading="lazy"></span><div><small>${escapeHtml(statusCopy.label)}</small><strong>${escapeHtml(humanizeId(row.item))}</strong><code>${escapeHtml(row.item)}</code></div></div><p>${escapeHtml(statusCopy.description)}</p><div class="drop-coverage-sources">${sources.map(source => `<button data-action="open-pokemon" data-pokemon="${escapeHtml(source.pokemon.id)}" type="button"><img src="${pokemonImage(source.pokemon)}" alt="" loading="lazy"><span>${escapeHtml(source.pokemon.name)}<small>${source.farmCount ? `${source.farmCount} farm` : source.usableCount ? `${source.usableCount} utilizável` : `${formatPercent(source.percentage)} · possível fonte`}</small></span></button>`).join("")}</div>${sourcePool.length > sources.length ? `<span class="section-note">+${sourcePool.length - sources.length} outras fontes</span>` : ""}</article>`;
  }

  function renderDropCoverage() {
    const tabs = `<div class="tab-row drop-tabs"><button class="tab-button" data-action="drop-mode" data-mode="catalog" type="button">Catálogo de drops</button><button class="tab-button is-active" data-action="drop-mode" data-mode="coverage" type="button">Cobertura da fazenda</button></div>`;
    if (!state.serverSync) {
      content.innerHTML = `${tabs}${renderEmpty("Sincronize sua coleção", "A cobertura de drops precisa dos Pokémon encontrados no time e no PC do jogador.")}`;
      return;
    }
    const allRows = dropCoverageRows("all");
    const rows = dropCoverageRows();
    const counts = Object.fromEntries(["covered", "available", "missing"].map(status => [status, allRows.filter(row => row.status === status).length]));
    const visible = rows.slice(0, ui.dropLimit);
    content.innerHTML = `${tabs}<div class="drop-coverage-summary"><article><b>${counts.covered}</b><span>Cobertos por farms</span></article><article><b>${counts.available}</b><span>Disponíveis para classificar</span></article><article><b>${counts.missing}</b><span>Ainda não cobertos</span></article></div><div class="toolbar is-wide"><label class="field"><span>Item ou Pokémon fonte</span><input class="input" id="drop-search" value="${escapeHtml(ui.dropSearch)}" placeholder="Ex.: Blaze Powder ou Persian..."></label><label class="field"><span>Cobertura</span><select class="select" id="drop-coverage"><option value="all"${ui.dropCoverage === "all" ? " selected" : ""}>Todos</option><option value="covered"${ui.dropCoverage === "covered" ? " selected" : ""}>Cobertos por farm</option><option value="available"${ui.dropCoverage === "available" ? " selected" : ""}>Tenho, mas não é farm</option><option value="missing"${ui.dropCoverage === "missing" ? " selected" : ""}>Não cobertos</option></select></label><label class="checkbox-field"><input id="drop-farmable" type="checkbox"${ui.dropFarmableOnly ? " checked" : ""}> Somente farmável no Pasture</label><div class="info-stat"><b>${rows.length}</b><span>itens</span></div></div>${visible.length ? `<div class="drop-coverage-grid">${visible.map(renderDropCoverageCard).join("")}</div>` : renderEmpty("Nenhum item nesta situação", "Altere o filtro de cobertura ou a busca.")}${visible.length < rows.length ? `<button class="secondary-button load-more" data-action="drops-more" type="button">Mostrar mais</button>` : ""}`;
  }

  function renderDropCard(row) {
    return `<article class="drop-card"><div class="drop-card-heading"><span class="item-icon-frame"><img src="${escapeHtml(itemIcon(row.item))}" alt="" loading="lazy"></span><div><p class="card-kicker">#${String(row.pokemon.dex).padStart(4, "0")} · ${escapeHtml(row.pokemon.name)}</p><h3 class="card-title">${escapeHtml(humanizeId(row.item))}</h3></div></div><p class="card-subtitle">${escapeHtml(row.item)} · quantidade ${escapeHtml(row.quantity)}</p><div class="drop-rate"><b>${formatPercent(row.percentage)}</b><span>${row.pastureBlocked ? "Bloqueado no Pasture 1.7.31" : "Chance declarada do drop"}</span></div><div class="action-row" style="margin-top:10px"><button class="text-button" data-action="open-pokemon" data-pokemon="${row.pokemon.id}" type="button">Ver ${escapeHtml(row.pokemon.name)}</button>${row.pastureBlocked ? "<span class='badge is-danger'>não farmável</span>" : "<span class='badge'>Pasture</span>"}</div></article>`;
  }

  function renderEmpty(title, description) {
    return `<div class="empty-state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`;
  }

  const STAT_LABELS = { hp: "HP", atk: "Ataque", attack: "Ataque", def: "Defesa", defence: "Defesa", spa: "Ataque Especial", special_attack: "Ataque Especial", spd: "Defesa Especial", special_defence: "Defesa Especial", spe: "Velocidade", speed: "Velocidade" };

  function effectSubtype(effect) {
    return String(effect.subcategory || "").split(":").pop();
  }

  function formatChance(chance) {
    return Number.isFinite(Number(chance)) ? formatPercent(Number(chance) * 100) : "100%";
  }

  function formatBaitEffect(effect) {
    const type = String(effect.type || "").split(":").pop();
    const sub = effectSubtype(effect);
    const stat = STAT_LABELS[sub] || humanizeId(sub);
    const value = Number(effect.value);
    const chance = formatChance(effect.chance);
    const labels = {
      typing: `Atrai Pokémon do tipo ${humanizeId(sub)} em ×${value || 1} (${chance})`,
      egg_group: `Atrai Egg Group ${humanizeId(sub)} em ×${value || 1} (${chance})`,
      ev: `Favorece Pokémon que dão EV de ${stat} (${chance})`,
      nature: `Favorece natureza de ${stat} (${chance})`,
      iv: `Adiciona +${value || 0} IV em ${stat} (${chance})`,
      bite_time: `Reduz o tempo de atração/pesca em ${formatPercent(value * 100)} (${chance})`,
      pokemon_chance: `Chance de atrair Pokémon: ${chance}`,
      ha_chance: `Chance de Hidden Ability: ${chance}`,
      level_raise: `Eleva o nível em até +${value || 0} (${chance})`,
      friendship: `Favorece Pokémon por amizade (${chance})`,
      gender_chance: `Favorece gênero ${humanizeId(sub)} (${chance})`,
      drops_reroll: `+${value || 1} reroll de drops (${chance})`,
      shiny_reroll: `+${value || 1} rerolls de shiny (${chance})`,
      rarity_bucket: `Eleva a raridade em +${value || 1} tier(s) (${chance})`
    };
    return labels[type] || `${humanizeId(type)}${sub ? ` · ${humanizeId(sub)}` : ""}${Number.isFinite(value) ? ` · ${value}` : ""} (${chance})`;
  }

  function baitName(bait) {
    return humanizeId(bait.item);
  }

  function baitMatchScore(bait, pokemon) {
    let score = 0;
    const reasons = [];
    for (const effect of bait.effects) {
      const type = String(effect.type || "").split(":").pop();
      const sub = effectSubtype(effect);
      if (type === "typing" && pokemon.types.includes(sub)) {
        score += 120;
        reasons.push(`tipo ${humanizeId(sub)}`);
      }
      if (type === "egg_group" && pokemon.eggGroups.includes(sub)) {
        score += 95;
        reasons.push(`Egg Group ${humanizeId(sub)}`);
      }
      if (type === "ev") {
        const aliases = { atk: "attack", def: "defence", spa: "special_attack", spd: "special_defence", spe: "speed" };
        if (Number(pokemon.evYield?.[aliases[sub] || sub]) > 0) {
          score += 75;
          reasons.push(`EV de ${STAT_LABELS[sub] || humanizeId(sub)}`);
        }
      }
    }
    return { score, reasons: [...new Set(reasons)] };
  }

  function renderBaits() {
    const query = normalize(ui.baitSearch);
    const target = resolvePokemon(ui.baitSearch);
    let baits = DATA.baits.filter(bait => ui.baitCategory === "all" || bait.category === ui.baitCategory);
    if (target) {
      baits = baits.map(bait => ({ bait, match: baitMatchScore(bait, target) })).filter(row => row.match.score > 0).sort((a, b) => b.match.score - a.match.score || baitName(a.bait).localeCompare(baitName(b.bait))).map(row => ({ ...row.bait, recommendation: row.match }));
    } else if (query) {
      baits = baits.filter(bait => normalize(`${bait.item} ${bait.effects.map(formatBaitEffect).join(" ")}`).includes(query));
    }
    const visible = baits.slice(0, ui.baitLimit);
    content.innerHTML = `
      <div class="toolbar">
        <label class="field"><span>Pokémon, bait ou perk</span><input class="input" id="bait-search" list="bait-options" value="${escapeHtml(ui.baitSearch)}" placeholder="Ex.: Gible, Haban Berry, Hidden Ability..."></label>
        <label class="field"><span>Categoria</span><select class="select" id="bait-category"><option value="all"${ui.baitCategory === "all" ? " selected" : ""}>Todas</option><option value="berry"${ui.baitCategory === "berry" ? " selected" : ""}>Berries</option><option value="fruit"${ui.baitCategory === "fruit" ? " selected" : ""}>Frutas</option><option value="bait"${ui.baitCategory === "bait" ? " selected" : ""}>Poké Bait</option></select></label>
        <div class="info-stat"><b>${baits.length}</b><span>${target ? "recomendados" : "baits"}</span></div>
      </div>
      ${target ? `<div class="info-banner"><div><strong>Perks para ${escapeHtml(target.name)}</strong><p>Recomendações calculadas a partir dos tipos ${target.types.map(humanizeId).join(" / ")}, Egg Groups ${target.eggGroups.map(humanizeId).join(" / ")} e EV Yield declarados no Cobblemon 1.7.3.</p></div><div class="type-row">${target.types.map(typePill).join("")}</div></div>` : `<div class="info-banner"><div><strong>Digite um Pokémon para receber recomendações</strong><p>Também é possível procurar diretamente por berry, tipo, Egg Group, IV, natureza, shiny, Hidden Ability ou reroll de drop.</p></div><div class="info-stat"><b>${DATA.baits.length}</b><span>definições exatas</span></div></div>`}
      ${visible.length ? `<div class="bait-grid">${visible.map(renderBaitCard).join("")}</div>` : renderEmpty("Nenhum bait compatível", target ? "Esse Pokémon não possui um perk específico por tipo, Egg Group ou EV na tabela base. Use perks genéricos de raridade, shiny, HA ou nível." : "Tente outro termo de busca.")}
      ${visible.length < baits.length ? `<button class="secondary-button load-more" data-action="baits-more" type="button">Mostrar mais</button>` : ""}`;
  }

  function renderBaitCard(bait) {
    return `<article class="bait-card"><div class="catalog-card-heading"><span class="item-icon-frame"><img src="${escapeHtml(itemIcon(bait.item))}" alt="Ícone de ${escapeHtml(baitName(bait))}" loading="lazy"></span><div><p class="card-kicker">${escapeHtml(humanizeId(bait.category))}</p><h3 class="card-title">${escapeHtml(baitName(bait))}</h3></div></div><p class="card-subtitle">${escapeHtml(bait.item)}</p>${bait.recommendation ? `<div class="badge-row" style="margin-top:9px">${bait.recommendation.reasons.map(reason => `<span class="badge">${escapeHtml(reason)}</span>`).join("")}</div>` : ""}<ul class="effect-list">${bait.effects.map(effect => `<li>${escapeHtml(formatBaitEffect(effect))}</li>`).join("")}</ul></article>`;
  }

  function renderBerries() {
    const query = normalize(ui.berrySearch);
    const berries = DATA.berries.filter(berry => {
      if (ui.berrySource !== "all" && berry.source !== ui.berrySource) return false;
      const mutationText = berry.mutation ? `${berry.mutation.parentA} ${berry.mutation.parentBOptions.join(" ")} ${berry.mutation.mulch}` : "";
      return !query || normalize(`${berry.name} ${mutationText} ${berry.baitEffects.map(formatBaitEffect).join(" ")}`).includes(query);
    });
    const visible = berries.slice(0, ui.berryLimit);
    content.innerHTML = `
      <div class="info-banner"><div><strong>Crossplanting no Cobblemon 1.7.3</strong><p>Plante os pais lado a lado, sem diagonal. Cada colheita tem 12,5% de chance base de gerar a mutação; Surprise Mulch aumenta essa chance.</p></div><div class="info-stat"><b>12,5%</b><span>chance base</span></div></div>
      <div class="toolbar">
        <label class="field"><span>Berry, pai ou mulch</span><input class="input" id="berry-search" list="berry-options" value="${escapeHtml(ui.berrySearch)}" placeholder="Ex.: Enigma, Oran, Humid..."></label>
        <label class="field"><span>Origem</span><select class="select" id="berry-source"><option value="all"${ui.berrySource === "all" ? " selected" : ""}>Todas</option><option value="natural"${ui.berrySource === "natural" ? " selected" : ""}>Naturais (30)</option><option value="mutation"${ui.berrySource === "mutation" ? " selected" : ""}>Crossplanting (40)</option></select></label>
        <div class="info-stat"><b>${berries.length}</b><span>berries</span></div>
      </div>
      <div class="berry-grid">${visible.map(renderBerryCard).join("")}</div>
      ${visible.length < berries.length ? `<button class="secondary-button load-more" data-action="berries-more" type="button">Mostrar mais</button>` : ""}`;
  }

  function renderBerryCard(berry) {
    const mutation = berry.mutation;
    const formula = mutation ? `<div class="mutation-formula"><span class="berry-node">${escapeHtml(mutation.parentA)} Berry</span><span class="mutation-symbol">+</span><span class="berry-node" title="${escapeHtml(mutation.parentBOptions.join(", "))}">${escapeHtml(mutation.parentBOptions.length > 1 ? `${mutation.parentBOptions.length} opções` : `${mutation.parentBOptions[0]} Berry`)}</span><span class="mutation-symbol mutation-arrow">→</span><span class="berry-node mutation-result">${escapeHtml(berry.name)}</span></div>` : "";
    const berryItem = `cobblemon:${berry.id}_berry`;
    return `<article class="berry-card"><div class="catalog-card-heading"><span class="item-icon-frame"><img src="${escapeHtml(itemIcon(berryItem))}" alt="Ícone de ${escapeHtml(berry.name)}" loading="lazy"></span><div><p class="card-kicker">${berry.source === "natural" ? "Natural" : "Crossplanting"}</p><h3 class="card-title">${escapeHtml(berry.name)}</h3></div></div>${mutation ? `${formula}<div class="badge-row"><span class="badge">${escapeHtml(mutation.mulch)} Mulch</span><span class="badge is-muted">Yield ${escapeHtml(mutation.yield)}</span><span class="badge is-muted">${mutation.matureMinutes} min</span></div><p class="card-subtitle">Segundo pai: ${escapeHtml(mutation.parentBOptions.map(name => `${name} Berry`).join(" ou "))}. Reposição em ${mutation.replenishMinutes} min.</p>` : `<p class="card-subtitle">Encontrada naturalmente no mundo e usada como base para mutações.</p>`}${berry.baitEffects.length ? `<div class="card-divider"></div><ul class="effect-list">${berry.baitEffects.map(effect => `<li>${escapeHtml(formatBaitEffect(effect))}</li>`).join("")}</ul>` : ""}</article>`;
  }

  function evYieldFor(pokemon, statKey) {
    return Number(pokemon.evYield?.[statKey] || 0);
  }

  function evBerryItem(stat) {
    return `cobblemon:${stat.berry.toLowerCase()}_berry`;
  }

  function renderEvYieldBadges(pokemon, selectedStat) {
    return EV_STATS.filter(stat => evYieldFor(pokemon, stat.key) > 0).map(stat => {
      const selected = stat.key === selectedStat;
      return `<span class="ev-yield-badge${selected ? " is-selected" : ""}" style="--ev-color:${stat.color}">+${evYieldFor(pokemon, stat.key)} ${escapeHtml(stat.short)}</span>`;
    }).join("");
  }

  function renderEvTrainingCard(pokemon, stat) {
    const spawnCount = getValidPokemonSpawns(pokemon).length;
    const rarityText = getPokemonSpawnRarities(pokemon).map(rarity => rarity.label).join(" / ");
    return `<button class="ev-pokemon-card" data-action="open-pokemon" data-pokemon="${escapeHtml(pokemon.id)}" type="button"><img src="${pokemonImage(pokemon)}" alt="Ícone de ${escapeHtml(pokemon.name)}" loading="lazy"><span class="ev-pokemon-copy"><small>#${String(pokemon.dex).padStart(4, "0")} · Geração ${generationOf(pokemon)}</small><strong>${escapeHtml(pokemon.name)}</strong><span class="ev-yield-row">${renderEvYieldBadges(pokemon, stat.key)}</span><span class="ev-spawn-summary">${spawnCount ? `${spawnCount} ${spawnCount === 1 ? "spawn ativo" : "spawns ativos"}${rarityText ? ` · ${escapeHtml(rarityText)}` : ""}` : "Sem spawn natural ativo"} · abrir detalhes</span></span></button>`;
  }

  function renderEvTraining() {
    const stat = EV_STATS.find(item => item.key === ui.evStat) || EV_STATS[1];
    const query = normalize(ui.evSearch);
    const allForStat = DATA.pokemon.filter(pokemon => evYieldFor(pokemon, stat.key) > 0);
    let pokemon = allForStat.filter(candidate => {
      const activeSpawns = getValidPokemonSpawns(candidate);
      if (ui.evSpawnOnly && !activeSpawns.length) return false;
      if (ui.evRarity !== "all" && !activeSpawns.some(spawn => spawn.bucket === ui.evRarity)) return false;
      if (ui.evYield !== "all" && evYieldFor(candidate, stat.key) !== Number(ui.evYield)) return false;
      return !query || normalize(`${candidate.dex} ${candidate.name} ${candidate.types.join(" ")} ${candidate.labels.join(" ")}`).includes(query);
    });
    pokemon.sort((left, right) => evYieldFor(right, stat.key) - evYieldFor(left, stat.key) || left.dex - right.dex);
    const visible = pokemon.slice(0, ui.evLimit);
    const berryItem = evBerryItem(stat);
    content.innerHTML = `
      <section class="ev-guide-intro panel">
        <div><p class="eyebrow">Como funciona</p><h3>Treine o atributo certo sem confundir EV Yield com o efeito de bait</h3><p>Derrote as espécies listadas para receber os EVs exibidos no card. Cada atributo aceita até <strong>252 EVs</strong> e cada Pokémon pode acumular <strong>510 EVs</strong> no total.</p></div>
        <ol class="ev-guide-steps"><li>Escolha o atributo.</li><li>Equipe o item de treino, se tiver.</li><li>Derrote os Pokémon da lista e acompanhe o total.</li></ol>
      </section>
      <div class="ev-stat-grid" role="tablist" aria-label="Atributo para treinamento">${EV_STATS.map(item => `<button class="ev-stat-button${item.key === stat.key ? " is-active" : ""}" style="--ev-color:${item.color}" data-action="ev-stat" data-stat="${item.key}" type="button" role="tab" aria-selected="${item.key === stat.key}"><span class="ev-stat-symbol">${item.short}</span><span><strong>${escapeHtml(item.label)}</strong><small>${DATA.pokemon.filter(pokemonItem => evYieldFor(pokemonItem, item.key) > 0 && getValidPokemonSpawns(pokemonItem).length).length} espécies com spawn</small></span></button>`).join("")}</div>
      <div class="ev-tool-grid">
        <article class="ev-tool-card" style="--ev-color:${stat.color}"><span class="item-icon-frame"><img src="${escapeHtml(itemIcon(berryItem))}" alt="Ícone de ${escapeHtml(stat.berry)} Berry" loading="lazy"></span><div><small>Corrigir EVs</small><strong>${escapeHtml(stat.berry)} Berry</strong><p>Reduz 10 EVs de ${escapeHtml(stat.label)} e aumenta amizade. Como bait, ela apenas atrai espécies com esse EV Yield.</p></div></article>
        <article class="ev-tool-card" style="--ev-color:${stat.color}"><span class="ev-tool-symbol">+8</span><div><small>Acelerar batalhas</small><strong>${escapeHtml(stat.powerItem)}</strong><p>Enquanto equipado, adiciona 8 EVs de ${escapeHtml(stat.label)} além do EV Yield do oponente derrotado.</p></div></article>
        <article class="ev-tool-card" style="--ev-color:${stat.color}"><span class="ev-tool-symbol">+4</span><div><small>Treino direto</small><strong>${escapeHtml(stat.mochi)}</strong><p>Aumenta diretamente em 4 os EVs de ${escapeHtml(stat.label)}, sem precisar batalhar.</p></div></article>
      </div>
      <div class="toolbar ev-toolbar">
        <label class="field"><span>Buscar Pokémon</span><input class="input" id="ev-search" value="${escapeHtml(ui.evSearch)}" placeholder="Nome, número, tipo ou geração"></label>
        <label class="field"><span>EV Yield</span><select class="select" id="ev-yield"><option value="all"${ui.evYield === "all" ? " selected" : ""}>Qualquer valor</option>${[1, 2, 3].map(value => `<option value="${value}"${ui.evYield === String(value) ? " selected" : ""}>${value} EV${value > 1 ? "s" : ""}</option>`).join("")}</select></label>
        <label class="field"><span>Raridade do spawn</span><select class="select" id="ev-rarity"><option value="all"${ui.evRarity === "all" ? " selected" : ""}>Todas as raridades</option>${SPAWN_RARITIES.map(rarity => `<option value="${rarity.key}"${ui.evRarity === rarity.key ? " selected" : ""}>${escapeHtml(rarity.label)}</option>`).join("")}</select></label>
        <label class="checkbox-field"><input id="ev-spawn-only" type="checkbox"${ui.evSpawnOnly ? " checked" : ""}> Somente com spawn natural ativo</label>
      </div>
      <div class="section-heading"><div><h3>Pokémon para treinar ${escapeHtml(stat.label)}</h3><p>Ordenados pelo maior EV Yield. Espécies que concedem mais de um atributo mostram todos os ganhos.</p></div><div class="info-stat"><b>${pokemon.length}</b><span>opções</span></div></div>
      ${visible.length ? `<div class="ev-pokemon-grid">${visible.map(candidate => renderEvTrainingCard(candidate, stat)).join("")}</div>` : renderEmpty("Nenhuma opção encontrada", "Altere a busca, o valor de EV, a raridade ou o filtro de spawn natural.")}
      ${visible.length < pokemon.length ? `<button class="secondary-button load-more" data-action="ev-more" type="button">Mostrar mais</button>` : ""}`;
  }

  function genderProfile(pokemon) {
    const ratio = Number(pokemon.maleRatio);
    if (!Number.isFinite(ratio) || ratio < 0) return { male: false, female: false, genderless: true };
    return { male: ratio > 0, female: ratio < 1, genderless: false };
  }

  function breedingCompatibility(left, right) {
    if (!left || !right) return { compatible: false, reason: "Selecione dois Pokémon." };
    const leftGroups = new Set(left.eggGroups);
    const rightGroups = new Set(right.eggGroups);
    const undiscovered = groupSet => groupSet.has("undiscovered") || groupSet.has("no-eggs-discovered");
    if (undiscovered(leftGroups) || undiscovered(rightGroups)) return { compatible: false, reason: "Egg Group Undiscovered não produz ovos." };
    const leftDitto = left.id === "ditto" || leftGroups.has("ditto");
    const rightDitto = right.id === "ditto" || rightGroups.has("ditto");
    if (leftDitto || rightDitto) {
      if (leftDitto && rightDitto) return { compatible: false, reason: "Dois Ditto não produzem ovos entre si." };
      return { compatible: true, reason: "Compatível através de Ditto." };
    }
    const shared = [...leftGroups].filter(group => rightGroups.has(group));
    if (!shared.length) return { compatible: false, reason: "Não compartilham Egg Group." };
    const a = genderProfile(left);
    const b = genderProfile(right);
    if (a.genderless || b.genderless) return { compatible: false, reason: "Pokémon sem gênero precisam de Ditto." };
    if (!((a.male && b.female) || (a.female && b.male))) return { compatible: false, reason: "As espécies não possuem gêneros opostos possíveis." };
    return { compatible: true, reason: `Egg Group compartilhado: ${shared.map(humanizeId).join(", ")}.` };
  }

  function compatibleWith(target) {
    if (!target) return [];
    return DATA.pokemon.filter(candidate => breedingCompatibility(target, candidate).compatible);
  }

  function renderBreeding() {
    const tabs = `<div class="region-tabs breeding-tabs" role="tablist" aria-label="Visualização de breeding"><button class="tab-button${ui.breedingMode === "pokemon" ? " is-active" : ""}" data-action="breeding-mode" data-mode="pokemon" type="button" role="tab" aria-selected="${ui.breedingMode === "pokemon"}">Por Pokémon</button><button class="tab-button${ui.breedingMode === "egg-group" ? " is-active" : ""}" data-action="breeding-mode" data-mode="egg-group" type="button" role="tab" aria-selected="${ui.breedingMode === "egg-group"}">Por Egg Group</button></div>`;
    content.innerHTML = `${tabs}${ui.breedingMode === "egg-group" ? renderBreedingEggGroups() : renderBreedingPokemon()}`;
  }

  function renderBreedingPokemon() {
    const left = resolvePokemon(ui.breedingA);
    const right = resolvePokemon(ui.breedingB);
    const result = left && right ? breedingCompatibility(left, right) : null;
    const query = normalize(ui.breedingSearch);
    let compatible = left ? compatibleWith(left) : [];
    if (query) compatible = compatible.filter(pokemon => normalize(`${pokemon.name} ${pokemon.eggGroups.join(" ")}`).includes(query));
    const visible = compatible.slice(0, ui.breedingLimit);
    return `
      <section class="panel"><h3>Verificar um par</h3><p class="section-note">A análise usa Egg Groups e disponibilidade de gênero das espécies. IVs, itens e lucro não fazem mais parte deste app.</p><div class="form-grid" style="margin-top:12px"><label class="field"><span>Pokémon A</span><input class="input" id="breeding-a" list="pokemon-options" value="${escapeHtml(ui.breedingA)}" placeholder="Ex.: Eevee"></label><label class="field"><span>Pokémon B</span><input class="input" id="breeding-b" list="pokemon-options" value="${escapeHtml(ui.breedingB)}" placeholder="Ex.: Vulpix"></label></div>${result ? `<div class="info-banner" style="margin:14px 0 0"><div><strong>${result.compatible ? "Compatíveis" : "Não compatíveis"}</strong><p>${escapeHtml(result.reason)}</p></div><span class="badge ${result.compatible ? "" : "is-danger"}">${result.compatible ? "Pode gerar ovo" : "Sem ovo"}</span></div>` : ""}</section>
      ${left ? `<div class="section-heading"><div><h3>Compatíveis com ${escapeHtml(left.name)}</h3><p>${left.eggGroups.map(humanizeId).join(" · ") || "Sem Egg Group"}</p></div></div><div class="toolbar"><label class="field"><span>Filtrar compatíveis</span><input class="input" id="breeding-search" list="pokemon-options" value="${escapeHtml(ui.breedingSearch)}" placeholder="Nome ou Egg Group"></label><div class="info-stat"><b>${compatible.length}</b><span>espécies</span></div></div>${visible.length ? `<div class="compatibility-grid">${visible.map(pokemon => `<article class="compatibility-card"><div class="compatibility-card-heading"><img src="${pokemonImage(pokemon)}" alt="Ícone de ${escapeHtml(pokemon.name)}" loading="lazy"><div><p class="card-kicker">#${String(pokemon.dex).padStart(4, "0")}</p><h3 class="card-title">${escapeHtml(pokemon.name)}</h3></div></div><p class="card-subtitle">${escapeHtml(breedingCompatibility(left, pokemon).reason)}</p><div class="type-row" style="margin-top:9px">${pokemon.types.map(typePill).join("")}</div></article>`).join("")}</div>` : renderEmpty("Nenhum compatível", "Revise o Pokémon ou o filtro informado.")}${visible.length < compatible.length ? `<button class="secondary-button load-more" data-action="breeding-more" type="button">Mostrar mais</button>` : ""}` : renderEmpty("Escolha o primeiro Pokémon", "A lista de espécies compatíveis aparecerá aqui.")}`;
  }

  function breedingGenderLabel(pokemon) {
    const profile = genderProfile(pokemon);
    if (profile.genderless) return "Sem gênero";
    const malePercent = Math.round(Number(pokemon.maleRatio) * 100);
    if (!profile.female) return "Somente macho";
    if (!profile.male) return "Somente fêmea";
    return `${malePercent}% macho · ${100 - malePercent}% fêmea`;
  }

  function renderBreedingEggGroups() {
    const selectedGroup = eggGroups.includes(ui.breedingEggGroup) ? ui.breedingEggGroup : "";
    const query = normalize(ui.breedingGroupSearch);
    let groupedPokemon = selectedGroup ? DATA.pokemon.filter(pokemon => pokemon.eggGroups.includes(selectedGroup)) : [];
    if (query) groupedPokemon = groupedPokemon.filter(pokemon => normalize(`${pokemon.dex} ${pokemon.name} ${pokemon.eggGroups.join(" ")}`).includes(query));
    const visible = groupedPokemon.slice(0, ui.breedingLimit);
    const specialNote = selectedGroup === "undiscovered"
      ? "Pokémon do grupo Undiscovered não produzem ovos, mesmo entre si ou com Ditto."
      : selectedGroup === "ditto"
        ? "Ditto pode cruzar com espécies que produzem ovos, mas dois Ditto não geram ovo."
        : "O Egg Group é o primeiro filtro. Para formar um par ainda é necessário considerar gêneros compatíveis; Pokémon sem gênero normalmente precisam de Ditto.";
    return `
      <section class="panel"><h3>Filtrar por Egg Group</h3><p class="section-note">Grupos extraídos diretamente das espécies instaladas no Cobblemon ${escapeHtml(DATA.metadata.cobblemonVersion)}.</p><div class="egg-group-filter" role="list">${eggGroups.map(group => `<button class="egg-group-button${selectedGroup === group ? " is-active" : ""}" data-action="breeding-egg-group" data-group="${escapeHtml(group)}" type="button"><span>${escapeHtml(humanizeId(group))}</span><b>${eggGroupCounts.get(group)}</b></button>`).join("")}</div></section>
      ${selectedGroup ? `<div class="info-banner"><div><strong>${escapeHtml(humanizeId(selectedGroup))}</strong><p>${escapeHtml(specialNote)}</p></div><div class="info-stat"><b>${eggGroupCounts.get(selectedGroup)}</b><span>no grupo</span></div></div><div class="toolbar"><label class="field"><span>Buscar neste grupo</span><input class="input" id="breeding-group-search" list="pokemon-options" value="${escapeHtml(ui.breedingGroupSearch)}" placeholder="Nome, número ou outro Egg Group"></label><div class="info-stat"><b>${groupedPokemon.length}</b><span>encontrados</span></div></div>${visible.length ? `<div class="compatibility-grid">${visible.map(pokemon => { const otherGroups = pokemon.eggGroups.filter(group => group !== selectedGroup); return `<article class="compatibility-card"><div class="compatibility-card-heading"><img src="${pokemonImage(pokemon)}" alt="Ícone de ${escapeHtml(pokemon.name)}" loading="lazy"><div><p class="card-kicker">#${String(pokemon.dex).padStart(4, "0")} · ${escapeHtml(breedingGenderLabel(pokemon))}</p><h3 class="card-title">${escapeHtml(pokemon.name)}</h3></div></div><p class="card-subtitle">${otherGroups.length ? "Também pertence a" : "Egg Group"}</p><div class="egg-membership-row">${otherGroups.length ? otherGroups.map(group => `<span class="egg-membership">${escapeHtml(humanizeId(group))}</span>`).join("") : `<span class="egg-membership is-only">Somente ${escapeHtml(humanizeId(selectedGroup))}</span>`}</div></article>`; }).join("")}</div>` : renderEmpty("Nenhum Pokémon encontrado", "Revise a busca dentro deste Egg Group.")}${visible.length < groupedPokemon.length ? `<button class="secondary-button load-more" data-action="breeding-more" type="button">Mostrar mais</button>` : ""}` : renderEmpty("Escolha um Egg Group", "Selecione um dos grupos acima para ver todas as espécies cadastradas nele.")}`;
  }

  function ownedPokemonEntries() {
    const summary = state.serverSync;
    if (!summary) return [];
    return [
      ...summary.party.map(entry => ({ ...entry, storage: "party" })),
      ...summary.pc.map(entry => ({ ...entry, storage: "pc" }))
    ].map(entry => ({ ...entry, instanceId: entry.uuid || `${entry.storage}:${entry.position}:${entry.species}` }));
  }

  function pokemonTagDefinitions(includeFarm = true) {
    return [...BUILTIN_POKEMON_TAGS.filter(tag => includeFarm || tag.id !== "farm"), ...state.customPokemonTags];
  }

  function pokemonTagDefinition(tagId) {
    return pokemonTagDefinitions().find(tag => tag.id === tagId) || null;
  }

  function pokemonTagIds(entryOrInstanceId) {
    const instanceId = typeof entryOrInstanceId === "string" ? entryOrInstanceId : entryOrInstanceId?.instanceId;
    if (!instanceId) return [];
    const tags = new Set(state.pokemonTags?.[instanceId] || []);
    if (state.farmPokemon.includes(instanceId)) tags.add("farm");
    return [...tags].filter(tagId => pokemonTagDefinition(tagId));
  }

  function hasPokemonTag(entryOrInstanceId, tagId) {
    return pokemonTagIds(entryOrInstanceId).includes(tagId);
  }

  function setPokemonTag(instanceId, tagId, enabled) {
    if (!instanceId || !pokemonTagDefinition(tagId)) return;
    const tags = new Set(pokemonTagIds(instanceId));
    enabled ? tags.add(tagId) : tags.delete(tagId);
    state.pokemonTags = { ...state.pokemonTags };
    if (tags.size) state.pokemonTags[instanceId] = [...tags];
    else delete state.pokemonTags[instanceId];
    if (tagId === "farm") {
      const farms = new Set(state.farmPokemon);
      enabled ? farms.add(instanceId) : farms.delete(instanceId);
      state.farmPokemon = [...farms];
    }
  }

  function createCustomPokemonTag(name) {
    const cleanName = String(name || "").trim().replace(/\s+/g, " ").slice(0, 28);
    if (!cleanName) return null;
    if (pokemonTagDefinitions().some(tag => normalize(tag.name) === normalize(cleanName))) {
      alert("Já existe uma tag com esse nome.");
      return null;
    }
    const tag = {
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      color: POKEMON_TAG_COLORS[state.customPokemonTags.length % POKEMON_TAG_COLORS.length]
    };
    state.customPokemonTags = [...state.customPokemonTags, tag];
    return tag;
  }

  function deleteCustomPokemonTag(tagId) {
    if (!state.customPokemonTags.some(tag => tag.id === tagId)) return;
    state.customPokemonTags = state.customPokemonTags.filter(tag => tag.id !== tagId);
    state.pokemonTags = Object.fromEntries(Object.entries(state.pokemonTags).map(([instanceId, tagIds]) => [instanceId, tagIds.filter(id => id !== tagId)]).filter(([, tagIds]) => tagIds.length));
    if (ui.ownedTag === tagId) ui.ownedTag = "all";
    if (ui.counterTag === tagId) ui.counterTag = "all";
  }

  function renderPokemonTagChip(tagId) {
    const tag = pokemonTagDefinition(tagId);
    return tag ? `<span class="pokemon-tag is-color-${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span>` : "";
  }

  function isFarmPokemon(entry) {
    return hasPokemonTag(entry, "farm");
  }

  function usableOwnedPokemonEntries() {
    return ownedPokemonEntries().filter(entry => !isFarmPokemon(entry));
  }

  function usablePcPokemonEntries() {
    return usableOwnedPokemonEntries().filter(entry => entry.storage === "pc");
  }

  function pcPokemonIdsWithTag(tagId) {
    return new Set(usablePcPokemonEntries().filter(entry => hasPokemonTag(entry, tagId)).map(entry => resolveServerPokemon(entry.species)?.id).filter(Boolean));
  }

  function pcTagIdsForSpecies(pokemonId) {
    const tags = new Set();
    usablePcPokemonEntries().filter(entry => resolveServerPokemon(entry.species)?.id === pokemonId).forEach(entry => pokemonTagIds(entry).forEach(tagId => {
      if (tagId !== "farm") tags.add(tagId);
    }));
    return [...tags];
  }

  function ownedLocationLabel(entry) {
    if (entry.storage === "party") {
      const slot = Number(entry.position.match(/Slot(\d+)/i)?.[1]);
      return `Time atual · Slot ${Number.isFinite(slot) ? slot + 1 : "?"}`;
    }
    const box = Number(entry.position.match(/Box(\d+)/i)?.[1]);
    const slot = Number(entry.position.match(/Slot(\d+)/i)?.[1]);
    return `PC · Caixa ${Number.isFinite(box) ? box + 1 : "?"} · Slot ${Number.isFinite(slot) ? slot + 1 : "?"}`;
  }

  function ownedStatTotal(entry, key) {
    return Object.values(entry?.[key] || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  }

  function filterOwnedPokemon(entries = ownedPokemonEntries()) {
    const query = normalize(ui.ownedSearch);
    const filtered = entries.filter(entry => {
      const pokemon = resolveServerPokemon(entry.species);
      const tagIds = pokemonTagIds(entry);
      if (!pokemon) return false;
      if (ui.ownedType && !pokemon.types.includes(ui.ownedType)) return false;
      if (ui.ownedLocation !== "all" && entry.storage !== ui.ownedLocation) return false;
      if (ui.ownedTag === "untagged" && tagIds.length) return false;
      if (ui.ownedTag !== "all" && ui.ownedTag !== "untagged" && !tagIds.includes(ui.ownedTag)) return false;
      if (ui.ownedShiny && !entry.shiny) return false;
      if (!query) return true;
      const tagNames = tagIds.map(tagId => pokemonTagDefinition(tagId)?.name).filter(Boolean);
      return normalize([pokemon.name, entry.nickname, entry.ability, entry.nature, entry.mintedNature, entry.heldItem, ...entry.moves, ...tagNames].filter(Boolean).join(" ")).includes(query);
    });
    return filtered.sort((left, right) => {
      const leftPokemon = resolveServerPokemon(left.species);
      const rightPokemon = resolveServerPokemon(right.species);
      if (ui.ownedSort === "level") return Number(right.level || 0) - Number(left.level || 0);
      if (ui.ownedSort === "ivs") return ownedStatTotal(right, "ivs") - ownedStatTotal(left, "ivs");
      if (ui.ownedSort === "evs") return ownedStatTotal(right, "evs") - ownedStatTotal(left, "evs");
      if (ui.ownedSort === "name") return leftPokemon.name.localeCompare(rightPokemon.name, "pt-BR");
      return left.position.localeCompare(right.position, undefined, { numeric: true });
    });
  }

  function renderPokemonTagManager() {
    const tags = pokemonTagDefinitions();
    return `<section class="owned-tag-manager"><div><strong>Organize com tags</strong><p>Farm altera as opções de batalha; Pronto e suas tags personalizadas servem para separar e encontrar indivíduos.</p></div><div class="owned-tag-library">${tags.map(tag => tag.id.startsWith("custom-") ? `<span class="pokemon-tag is-manageable is-color-${escapeHtml(tag.color)}">${escapeHtml(tag.name)}<button data-action="owned-delete-tag" data-tag="${escapeHtml(tag.id)}" type="button" aria-label="Excluir tag ${escapeHtml(tag.name)}">×</button></span>` : renderPokemonTagChip(tag.id)).join("")}<button class="secondary-button" data-action="owned-create-tag" type="button">+ Nova tag</button></div></section>`;
  }

  function renderOwnedFilters() {
    return `<div class="toolbar owned-toolbar">
      <label class="field"><span>Buscar nos meus Pokémon</span><input class="input" id="owned-search" value="${escapeHtml(ui.ownedSearch)}" placeholder="Nome, apelido, habilidade, golpe..."></label>
      <label class="field"><span>Tipo</span><select class="select" id="owned-type"><option value="">Todos</option>${ALL_TYPES.map(type => `<option value="${type}"${ui.ownedType === type ? " selected" : ""}>${humanizeId(type)}</option>`).join("")}</select></label>
      <label class="field"><span>Local</span><select class="select" id="owned-location"><option value="all"${ui.ownedLocation === "all" ? " selected" : ""}>Time e PC</option><option value="party"${ui.ownedLocation === "party" ? " selected" : ""}>Time atual</option><option value="pc"${ui.ownedLocation === "pc" ? " selected" : ""}>PC</option></select></label>
      <label class="field"><span>Tag</span><select class="select" id="owned-tag"><option value="all"${ui.ownedTag === "all" ? " selected" : ""}>Todas</option><option value="untagged"${ui.ownedTag === "untagged" ? " selected" : ""}>Sem tags</option>${pokemonTagDefinitions(ui.ownedMode === "farms").map(tag => `<option value="${escapeHtml(tag.id)}"${ui.ownedTag === tag.id ? " selected" : ""}>${escapeHtml(tag.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Ordenar</span><select class="select" id="owned-sort"><option value="box"${ui.ownedSort === "box" ? " selected" : ""}>Posição no PC</option><option value="name"${ui.ownedSort === "name" ? " selected" : ""}>Nome</option><option value="level"${ui.ownedSort === "level" ? " selected" : ""}>Maior nível</option><option value="ivs"${ui.ownedSort === "ivs" ? " selected" : ""}>Maior soma de IVs</option><option value="evs"${ui.ownedSort === "evs" ? " selected" : ""}>Maior soma de EVs</option></select></label>
      <label class="checkbox-field"><input id="owned-shiny" type="checkbox"${ui.ownedShiny ? " checked" : ""}> Somente shiny</label>
    </div>`;
  }

  function renderOwnedPokemonCard(entry, selectable = false) {
    const pokemon = resolveServerPokemon(entry.species);
    if (!pokemon) return "";
    const selected = teamDraftInstanceIds.includes(entry.instanceId);
    const farm = isFarmPokemon(entry);
    const ready = hasPokemonTag(entry, "ready");
    const tagIds = pokemonTagIds(entry);
    const perfectIvs = EV_STATS.filter(stat => Number(entry.ivs?.[stat.key]) >= 31 || Number(entry.hyperTrainedIvs?.[stat.key]) >= 31).length;
    return `<article class="owned-pokemon-card${selected ? " is-selected" : ""}${farm ? " is-farm" : ""}${ready ? " is-ready" : ""}" data-action="owned-open" data-instance="${escapeHtml(entry.instanceId)}" tabindex="0">
      <div class="owned-pokemon-image"><img src="${pokemonImage(pokemon)}" alt="" loading="lazy">${entry.shiny ? '<span class="owned-shiny">★</span>' : ""}</div>
      <div class="owned-pokemon-copy"><small>${escapeHtml(ownedLocationLabel(entry))}</small><strong>${escapeHtml(entry.nickname || pokemon.name)}</strong>${entry.nickname ? `<span>${escapeHtml(pokemon.name)}</span>` : ""}<div class="type-row">${pokemon.types.map(typePill).join("")}</div>${tagIds.length ? `<div class="owned-tag-row">${tagIds.map(renderPokemonTagChip).join("")}</div>` : ""}<div class="owned-pokemon-metrics"><span>Lv. <b>${entry.level ?? "?"}</b></span><span>IV <b>${ownedStatTotal(entry, "ivs")}/186</b></span><span><b>${perfectIvs}</b> perfeitos</span><span>EV <b>${ownedStatTotal(entry, "evs")}/510</b></span></div></div>
      <div class="owned-pokemon-actions">${selectable ? `<button class="${selected ? "danger-button" : "primary-button"}" data-action="owned-toggle-team" data-instance="${escapeHtml(entry.instanceId)}" type="button">${selected ? "Remover" : "Adicionar"}</button>` : ""}<button class="secondary-button${ready ? " is-tag-active" : ""}" data-action="owned-toggle-tag" data-tag="ready" data-instance="${escapeHtml(entry.instanceId)}" type="button">${ready ? "✓ Pronto" : "Marcar pronto"}</button><button class="secondary-button${farm ? " is-tag-active" : ""}" data-action="owned-toggle-tag" data-tag="farm" data-instance="${escapeHtml(entry.instanceId)}" type="button">${farm ? "Remover de farm" : "Marcar como farm"}</button><button class="text-button" data-action="owned-open" data-instance="${escapeHtml(entry.instanceId)}" type="button">Tags e detalhes</button></div>
    </article>`;
  }

  function openOwnedPokemonModal(instanceId) {
    const entry = ownedPokemonEntries().find(item => item.instanceId === instanceId);
    const pokemon = entry ? resolveServerPokemon(entry.species) : null;
    if (!entry || !pokemon) return;
    const assignedTags = pokemonTagIds(entry);
    const statRows = EV_STATS.map(stat => {
      const iv = Number(entry.ivs?.[stat.key] || 0);
      const hyper = Number(entry.hyperTrainedIvs?.[stat.key] || 0);
      const ev = Number(entry.evs?.[stat.key] || 0);
      return `<div class="owned-stat-row"><strong>${escapeHtml(stat.short)}</strong><span>IV <b>${iv}</b>${hyper ? `<em>HT ${hyper}</em>` : ""}</span><span>EV <b>${ev}</b></span></div>`;
    }).join("");
    modalContent.innerHTML = `<div class="modal-hero"><img src="${pokemonImage(pokemon)}" alt=""><div><p class="eyebrow">${escapeHtml(ownedLocationLabel(entry))}</p><h2 id="modal-title">${escapeHtml(entry.nickname || pokemon.name)}${entry.shiny ? " ★" : ""}</h2>${entry.nickname ? `<p class="section-note">${escapeHtml(pokemon.name)}</p>` : ""}<div class="type-row">${pokemon.types.map(typePill).join("")}</div>${assignedTags.length ? `<div class="owned-tag-row">${assignedTags.map(renderPokemonTagChip).join("")}</div>` : ""}</div></div>
      <div class="owned-detail-summary"><span><b>${entry.level ?? "?"}</b>Nível</span><span><b>${ownedStatTotal(entry, "ivs")}</b>IV total</span><span><b>${ownedStatTotal(entry, "evs")}</b>EV total</span><span><b>${entry.friendship ?? "?"}</b>Amizade</span></div>
      <section class="detail-section owned-tag-section"><div class="detail-section-heading"><div><h3>Tags deste Pokémon</h3><p>Use Pronto para destacar os treinados. Farm continua removendo o indivíduo das opções de batalha.</p></div></div><div class="owned-tag-picker">${pokemonTagDefinitions().map(tag => `<button class="pokemon-tag-toggle is-color-${escapeHtml(tag.color)}${assignedTags.includes(tag.id) ? " is-selected" : ""}" data-owned-modal-tag="${escapeHtml(tag.id)}" data-instance="${escapeHtml(entry.instanceId)}" type="button"><span>${assignedTags.includes(tag.id) ? "✓" : "+"}</span>${escapeHtml(tag.name)}</button>`).join("")}<button class="pokemon-tag-toggle is-create" data-owned-modal-create-tag data-instance="${escapeHtml(entry.instanceId)}" type="button">+ Nova tag</button></div></section>
      <section class="detail-section owned-stats-section"><div class="detail-section-heading"><div><h3>IVs e EVs</h3><p>Valores exatos salvos neste Pokémon.</p></div></div><div class="owned-stat-table">${statRows}</div></section>
      <div class="detail-columns"><section class="detail-section"><h3>Características</h3><ul class="detail-list"><li><strong>Nature:</strong> ${escapeHtml(humanizeId(entry.mintedNature || entry.nature || "não informada"))}${entry.mintedNature ? ` (original: ${escapeHtml(humanizeId(entry.nature))})` : ""}</li><li><strong>Habilidade:</strong> ${escapeHtml(formatAbilityName(entry.ability || "não informada"))}</li><li><strong>Item:</strong> ${escapeHtml(humanizeId(entry.heldItem || "nenhum"))}</li><li><strong>Pokébola:</strong> ${escapeHtml(humanizeId(entry.caughtBall || "não informada"))}</li><li><strong>Tera Type:</strong> ${escapeHtml(humanizeId(entry.teraType || "não informado"))}</li></ul></section><section class="detail-section"><h3>Golpes atuais</h3><ul class="detail-list">${entry.moves.length ? entry.moves.map(move => `<li>${escapeHtml(humanizeId(move))}</li>`).join("") : "<li>Nenhum golpe informado.</li>"}</ul></section></div>`;
    modal.hidden = false;
  }

  function renderTeamMember(pokemon, instance) {
    return `<span class="team-member"><img src="${pokemonImage(pokemon)}" alt="" loading="lazy"><span>${escapeHtml(instance?.nickname || pokemon.name)}</span>${instance?.level ? `<small>Lv. ${instance.level}</small>` : ""}</span>`;
  }

  function renderSavedTeams(entries) {
    const byInstance = new Map(entries.map(entry => [entry.instanceId, entry]));
    if (!state.teams.length) return renderEmpty("Nenhum time salvo", "Monte um time usando os Pokémon disponíveis no PC.");
    return `<div class="team-grid">${state.teams.map(team => `<article class="team-card"><div class="team-card-header"><div><p class="card-kicker">${team.members.length}/6 Pokémon</p><h3 class="card-title">${escapeHtml(team.name)}</h3></div><div class="action-row"><button class="text-button" data-action="team-edit" data-team="${escapeHtml(team.id)}" type="button">Editar</button><button class="text-button" data-action="team-delete" data-team="${escapeHtml(team.id)}" type="button">Excluir</button></div></div><div class="team-members">${team.members.map((id, index) => { const pokemon = pokemonById.get(id); const instance = byInstance.get(team.memberInstances?.[index]); return pokemon ? renderTeamMember(pokemon, instance) : ""; }).join("")}</div>${team.notes ? `<p class="card-subtitle">${escapeHtml(team.notes)}</p>` : ""}</article>`).join("")}</div>`;
  }

  function renderTeams() {
    const allEntries = ownedPokemonEntries();
    const farmEntries = allEntries.filter(isFarmPokemon);
    const usableEntries = allEntries.filter(entry => !isFarmPokemon(entry));
    const entries = ui.ownedMode === "farms" ? farmEntries : usableEntries;
    const editing = editingTeamId ? state.teams.find(team => team.id === editingTeamId) : null;
    const filtered = filterOwnedPokemon(entries);
    const visible = filtered.slice(0, ui.ownedLimit);
    const tabs = `<div class="tab-row owned-tabs"><button class="tab-button${ui.ownedMode === "collection" ? " is-active" : ""}" data-action="owned-mode" data-mode="collection" type="button">Utilizáveis (${usableEntries.length})</button><button class="tab-button${ui.ownedMode === "farms" ? " is-active" : ""}" data-action="owned-mode" data-mode="farms" type="button">Farms (${farmEntries.length})</button><button class="tab-button${ui.ownedMode === "teams" ? " is-active" : ""}" data-action="owned-mode" data-mode="teams" type="button">Times (${state.teams.length})</button></div>`;
    const tagManager = renderPokemonTagManager();
    if (!state.serverSync) {
      content.innerHTML = `${tabs}${tagManager}${renderEmpty("Nenhum Pokémon sincronizado", "Salve uma conexão SFTP, configure seu nick e use o botão de atualização no menu lateral.")}`;
      return;
    }
    if (ui.ownedMode === "collection") {
      content.innerHTML = `${tabs}${tagManager}<div class="info-banner"><div><strong>${entries.length} Pokémon utilizáveis</strong><p>Estes indivíduos podem aparecer em times, Counters e recomendações. Marque os dedicados à produção para movê-los à área de farms.</p></div><div class="info-stat"><b>${new Set(entries.map(entry => entry.species)).size}</b><span>espécies</span></div></div>${renderOwnedFilters()}${visible.length ? `<div class="owned-pokemon-grid">${visible.map(entry => renderOwnedPokemonCard(entry)).join("")}</div>` : renderEmpty("Nenhum Pokémon utilizável encontrado", "Altere os filtros ou mova um Pokémon da área de farms.")}${visible.length < filtered.length ? `<button class="secondary-button load-more" data-action="owned-more" type="button">Mostrar mais</button>` : ""}`;
      return;
    }
    if (ui.ownedMode === "farms") {
      content.innerHTML = `${tabs}${tagManager}<div class="info-banner"><div><strong>${farmEntries.length} Pokémon dedicados a farm</strong><p>Eles ficam fora da montagem de times, Counters e recomendações de batalha. A cobertura dos itens pode ser conferida em Drops.</p></div><button class="secondary-button" data-action="home-open-view" data-view="drops" data-drop-mode="coverage" type="button">Ver cobertura de drops</button></div>${renderOwnedFilters()}${visible.length ? `<div class="owned-pokemon-grid is-farm-list">${visible.map(entry => renderOwnedPokemonCard(entry)).join("")}</div>` : renderEmpty("Nenhum Pokémon marcado para farm", "Na aba Utilizáveis, use “Marcar como farm” nos indivíduos dedicados à produção.")}${visible.length < filtered.length ? `<button class="secondary-button load-more" data-action="owned-more" type="button">Mostrar mais</button>` : ""}`;
      return;
    }
    const form = teamFormExpanded || editing ? `<section class="team-form owned-team-form"><div class="team-card-header"><div><h3>${editing ? "Editar time" : "Novo time"}</h3><p class="section-note">Selecione até seis indivíduos do seu time ou PC.</p></div><button class="text-button" data-action="team-close-form" type="button">Fechar</button></div><div class="form-grid"><label class="field"><span>Nome do time</span><input class="input" id="team-name" value="${escapeHtml(teamDraftName)}" placeholder="Ex.: Raid de Água"></label><label class="field"><span>Observações</span><textarea class="textarea" id="team-notes" placeholder="Funções, estratégia, boss...">${escapeHtml(teamDraftNotes)}</textarea></label></div><div class="team-draft-slots">${Array.from({ length: 6 }, (_, index) => { const instanceId = teamDraftInstanceIds[index]; const entry = entries.find(item => item.instanceId === instanceId); const pokemon = entry ? resolveServerPokemon(entry.species) : null; return `<div class="team-draft-slot${entry ? " is-filled" : ""}">${entry && pokemon ? `<img src="${pokemonImage(pokemon)}" alt=""><span>${escapeHtml(entry.nickname || pokemon.name)}<small>Lv. ${entry.level ?? "?"}</small></span><button data-action="owned-toggle-team" data-instance="${escapeHtml(instanceId)}" type="button" aria-label="Remover">×</button>` : `<span>Slot ${index + 1}</span>`}</div>`; }).join("")}</div><div class="action-row"><button class="primary-button" data-action="team-save" type="button">${editing ? "Salvar alterações" : "Salvar time"}</button>${editing ? `<button class="secondary-button" data-action="team-cancel-edit" type="button">Cancelar</button>` : ""}</div><h3 class="owned-pool-title">Escolher no PC</h3>${renderOwnedFilters()}${visible.length ? `<div class="owned-pokemon-grid is-picker">${visible.map(entry => renderOwnedPokemonCard(entry, true)).join("")}</div>` : renderEmpty("Nenhum Pokémon encontrado", "Altere os filtros para selecionar membros.")}${visible.length < filtered.length ? `<button class="secondary-button load-more" data-action="owned-more" type="button">Mostrar mais</button>` : ""}</section>` : "";
    content.innerHTML = `${tabs}${tagManager}<div class="info-banner"><div><strong>Times para raids e batalhas</strong><p>Os times são planejamentos locais; Pokémon marcados para farm não aparecem na seleção.</p></div><button class="primary-button" data-action="team-open-form" type="button">${state.teams.length ? "Adicionar time" : "Montar primeiro time"}</button></div>${form}${renderSavedTeams(allEntries)}`;
  }

  function bestAttackFor(candidate, targetTypes) {
    return candidate.types.map(type => ({ type, multiplier: effectiveness(type, targetTypes) })).sort((a, b) => b.multiplier - a.multiplier)[0] || { type: "normal", multiplier: 1 };
  }

  function counterScore(candidate, targetTypes) {
    const best = bestAttackFor(candidate, targetTypes);
    const stats = candidate.stats || {};
    const offense = Math.max(Number(stats.attack) || 0, Number(stats.special_attack) || 0);
    const bulk = (Number(stats.hp) || 0) + (Number(stats.defence) || 0) + (Number(stats.special_defence) || 0);
    const speed = Number(stats.speed) || 0;
    return { best, score: best.multiplier * offense + bulk * .16 + speed * .22 };
  }

  function resolveCounterTarget(value) {
    const query = normalize(value);
    if (!query) return null;
    if (/^\d+$/.test(query)) return DATA.pokemon.find(pokemon => pokemon.dex === Number(query)) || null;
    return pokemonByName.get(query) || null;
  }

  function counterTargetMatches(value) {
    const query = normalize(value);
    if (!query) return [];
    return DATA.pokemon
      .filter(pokemon => pokemon.implemented && (normalize(pokemon.name).includes(query) || String(pokemon.dex).includes(query)))
      .sort((left, right) => Number(normalize(right.name).startsWith(query)) - Number(normalize(left.name).startsWith(query)) || left.dex - right.dex)
      .slice(0, 8);
  }

  function renderCounterTargetChoice(pokemon, selected = false) {
    const content = `<img src="${pokemonImage(pokemon)}" alt="" loading="lazy"><span class="counter-target-choice-copy"><small>#${String(pokemon.dex).padStart(4, "0")} · Geração ${generationOf(pokemon)}</small><strong>${escapeHtml(pokemon.name)}</strong><span class="type-row">${pokemon.types.map(typePill).join("")}</span></span><span class="counter-target-choice-action">${selected ? "Selecionado ✓" : "Usar como alvo →"}</span>`;
    return selected
      ? `<article class="counter-target-choice is-selected">${content}</article>`
      : `<button class="counter-target-choice" data-action="counter-select-target" data-pokemon="${escapeHtml(pokemon.id)}" type="button">${content}</button>`;
  }

  function formatEffectivenessMultiplier(multiplier) {
    return `×${Number(multiplier).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }

  function counterMatchupTone(multiplier) {
    if (multiplier > 1) return " is-strong";
    if (multiplier === 1) return " is-neutral";
    if (multiplier === 0) return " is-immune";
    return " is-resisted";
  }

  function counterMatchupRows(targetTypes, mode) {
    return ALL_TYPES.map((type, index) => {
      if (mode === "boss") {
        const attacks = targetTypes.map(attackType => ({
          type: attackType,
          multiplier: effectiveness(attackType, [type])
        })).sort((left, right) => right.multiplier - left.multiplier);
        return { type, index, multiplier: attacks[0]?.multiplier ?? 1, sourceType: attacks[0]?.type || "" };
      }
      return { type, index, multiplier: effectiveness(type, targetTypes), sourceType: type };
    }).sort((left, right) => right.multiplier - left.multiplier || left.index - right.index);
  }

  function renderCounterMatchups(targetTypes, targetLabel) {
    const mode = ui.counterMatchupMode === "boss" ? "boss" : "against";
    const allRows = counterMatchupRows(targetTypes, mode);
    const rows = ui.counterEffectiveOnly ? allRows.filter(row => row.multiplier > 1) : allRows;
    const isBossMode = mode === "boss";
    return `<section class="counter-matchup-panel">
      <div class="counter-matchup-heading">
        <div>
          <p class="eyebrow">Efetividade elemental</p>
          <h3>${isBossMode ? "Dano causado pelo boss" : "Dano causado ao boss"}</h3>
          <p>${isBossMode ? `Melhor multiplicador entre os ataques STAB de ${escapeHtml(targetLabel)} contra cada tipo defensivo.` : `Multiplicador de cada tipo de ataque contra ${escapeHtml(targetLabel)}.`}</p>
        </div>
        <div class="counter-matchup-controls">
          <div class="counter-matchup-tabs" role="tablist" aria-label="Direção do dano">
            <button class="tab-button${isBossMode ? "" : " is-active"}" data-action="counter-matchup-mode" data-mode="against" role="tab" aria-selected="${isBossMode ? "false" : "true"}" type="button">Contra o boss</button>
            <button class="tab-button${isBossMode ? " is-active" : ""}" data-action="counter-matchup-mode" data-mode="boss" role="tab" aria-selected="${isBossMode ? "true" : "false"}" type="button">Ataques do boss</button>
          </div>
          <button class="counter-matchup-filter${ui.counterEffectiveOnly ? " is-active" : ""}" data-action="counter-effective-only" aria-pressed="${ui.counterEffectiveOnly ? "true" : "false"}" type="button"><span aria-hidden="true">✓</span> Apenas efetivos</button>
        </div>
      </div>
      ${rows.length ? `<div class="counter-matchup-grid">${rows.map(row => `<article class="counter-matchup-type${counterMatchupTone(row.multiplier)}"${isBossMode && targetTypes.length > 1 ? ` title="Melhor STAB: ${escapeHtml(humanizeId(row.sourceType))}"` : ""}>${typePill(row.type)}<strong>${formatEffectivenessMultiplier(row.multiplier)}</strong></article>`).join("")}</div>` : `<p class="counter-matchup-empty">Nenhum tipo possui multiplicador super efetivo nesta leitura. Desative “Apenas efetivos” para ver todos os elementos.</p>`}
      ${isBossMode ? `<p class="counter-matchup-footnote">Considera apenas os tipos do boss como ataques STAB. Habilidade, moveset, Terastalização e combinações defensivas de dois tipos podem alterar o resultado.</p>` : ""}
    </section>`;
  }

  function renderCounters() {
    const boss = resolveCounterTarget(ui.counterBoss);
    const targetMatches = boss ? [] : counterTargetMatches(ui.counterBoss);
    const targetTypes = boss ? boss.types : [...ui.counterTypes];
    const query = normalize(ui.counterSearch);
    const captured = captureSet();
    const inPc = pcPokemonIds();
    const counterTags = pokemonTagDefinitions(false);
    const taggedInPc = ui.counterTag === "all" ? null : pcPokemonIdsWithTag(ui.counterTag);
    let candidates = DATA.pokemon.filter(pokemon => {
      if (!pokemon.implemented || !pokemon.types.length) return false;
      if (boss?.id === pokemon.id) return false;
      if (ui.counterCapturedOnly && !captured.has(pokemon.id)) return false;
      if (ui.counterPcOnly && !inPc.has(pokemon.id)) return false;
      if (taggedInPc && !taggedInPc.has(pokemon.id)) return false;
      return !query || normalize(`${pokemon.name} ${pokemon.types.join(" ")}`).includes(query);
    });
    if (targetTypes.length) candidates = candidates.map(pokemon => ({ pokemon, ...counterScore(pokemon, targetTypes) })).sort((a, b) => b.score - a.score || a.pokemon.dex - b.pokemon.dex);
    else candidates = [];
    const visible = candidates.slice(0, ui.counterLimit);
    content.innerHTML = `
      <div class="toolbar is-wide counter-toolbar">
        <label class="field"><span>Pokémon alvo</span><input class="input" id="counter-boss" value="${escapeHtml(ui.counterBoss)}" autocomplete="off" placeholder="Digite nome ou número da Pokédex"></label>
        <label class="field"><span>Filtrar resultados</span><input class="input" id="counter-search" value="${escapeHtml(ui.counterSearch)}" autocomplete="off" placeholder="Nome ou tipo"></label>
        <label class="field"><span>Tag no PC</span><select class="select" id="counter-tag"${inPc.size ? "" : " disabled"}><option value="all"${ui.counterTag === "all" ? " selected" : ""}>Todas, exceto Farm</option>${counterTags.map(tag => `<option value="${escapeHtml(tag.id)}"${ui.counterTag === tag.id ? " selected" : ""}>${escapeHtml(tag.name)}</option>`).join("")}</select></label>
        <label class="checkbox-field" title="Espécies registradas como capturadas na Pokédex, mesmo que já tenham sido evoluídas, trocadas ou liberadas."><input id="counter-captured" type="checkbox"${ui.counterCapturedOnly ? " checked" : ""}> Capturados na Pokédex</label>
        <label class="checkbox-field"${inPc.size ? ' title="Indivíduos utilizáveis que estão atualmente no PC sincronizado; farms ficam de fora."' : ' title="Sincronize os dados do servidor para carregar o PC"'}><input id="counter-pc" type="checkbox"${ui.counterPcOnly ? " checked" : ""}${inPc.size ? "" : " disabled"}> Atualmente no meu PC${inPc.size ? ` (${inPc.size})` : ""}</label>
      </div>
      ${boss ? `<section class="counter-target-picker is-selected"><div class="counter-target-picker-heading"><div><p class="eyebrow">Alvo confirmado</p><h3>Pokémon selecionado</h3></div><span class="badge">Pronto para calcular</span></div>${renderCounterTargetChoice(boss, true)}</section>` : targetMatches.length ? `<section class="counter-target-picker"><div class="counter-target-picker-heading"><div><p class="eyebrow">Resultados visuais</p><h3>Escolha o Pokémon correto</h3></div><span class="badge">${targetMatches.length} encontrados</span></div><div class="counter-target-choice-grid">${targetMatches.map(pokemon => renderCounterTargetChoice(pokemon)).join("")}</div></section>` : ui.counterBoss.trim() ? `<div class="counter-target-empty"><strong>Nenhum Pokémon encontrado</strong><span>Continue digitando ou confira o nome e o número da Pokédex.</span></div>` : ""}
      <section class="panel"><h3>Ou selecione os tipos do alvo</h3><p class="section-note">O Pokémon escolhido acima substitui esta seleção. A lógica considera STAB, efetividade e atributos base; escudos não fazem parte do cálculo.</p><div class="type-row" style="margin-top:12px">${ALL_TYPES.map(type => `<button class="tab-button${ui.counterTypes.has(type) ? " is-active" : ""}" data-action="counter-type" data-type="${type}" type="button">${humanizeId(type)}</button>`).join("")}</div></section>
      ${targetTypes.length ? `<div class="info-banner"><div><strong>Alvo: ${boss ? escapeHtml(boss.name) : targetTypes.map(humanizeId).join(" / ")}</strong><p>Tipos defensivos: ${targetTypes.map(humanizeId).join(" + ")}. Ranking sem informações de moveset, habilidade ou Terastalização.</p></div><div class="type-row">${targetTypes.map(typePill).join("")}</div></div>${renderCounterMatchups(targetTypes, boss?.name || targetTypes.map(humanizeId).join(" / "))}<div class="counter-grid">${visible.map(row => renderCounterCard(row)).join("")}</div>${visible.length < candidates.length ? `<button class="secondary-button load-more" data-action="counters-more" type="button">Mostrar mais</button>` : ""}` : renderEmpty("Escolha o alvo", "Busque um Pokémon ou selecione um ou dois tipos para gerar os counters.")}`;
  }

  function renderCounterCard(row) {
    const multiplierLabel = row.best.multiplier >= 4 ? "4×" : row.best.multiplier >= 2 ? "2×" : row.best.multiplier === 0 ? "0×" : `${row.best.multiplier}×`;
    const tagIds = pcTagIdsForSpecies(row.pokemon.id);
    return `<article class="counter-card"><img src="${pokemonImage(row.pokemon)}" alt="" loading="lazy"><div><p class="card-kicker">#${String(row.pokemon.dex).padStart(4, "0")}</p><h3 class="card-title">${escapeHtml(row.pokemon.name)}</h3><div class="type-row" style="margin-top:6px">${row.pokemon.types.map(typePill).join("")}</div>${tagIds.length ? `<div class="owned-tag-row counter-tag-row">${tagIds.map(renderPokemonTagChip).join("")}</div>` : ""}<p class="card-subtitle">Melhor STAB: ${humanizeId(row.best.type)} <strong>${multiplierLabel}</strong></p></div><span class="counter-score">${Math.round(row.score)}</span></article>`;
  }

  function memberPokemon(member) {
    const raw = String(member?.species || "").split(" ")[0].split(":").pop();
    return pokemonById.get(raw) || pokemonByName.get(normalize(humanizeId(raw))) || DATA.pokemon.find(pokemon => normalize(pokemon.name) === normalize(raw));
  }

  function recommendedTypesForTeam(team) {
    const defenders = team.map(memberPokemon).filter(Boolean);
    if (!defenders.length) return [];
    return ALL_TYPES.map(type => {
      const values = defenders.map(pokemon => effectiveness(type, pokemon.types));
      return { type, superCount: values.filter(value => value > 1).length, average: values.reduce((sum, value) => sum + value, 0) / values.length, immuneCount: values.filter(value => value === 0).length };
    }).filter(row => row.superCount > 0).sort((a, b) => b.superCount - a.superCount || b.average - a.average || a.immuneCount - b.immuneCount).slice(0, 4);
  }

  function moveMetadata(value) {
    const id = String(value || "").split(":").pop().replace(/[^a-z0-9]+/gi, "").toLowerCase();
    const move = DATA.moves?.[id];
    return move ? { id, ...move } : null;
  }

  function abilityAdjustedEffectiveness(multiplier, attackType, ability) {
    const id = normalize(String(ability || "").split(":").pop()).replace(/\s+/g, "");
    const immunities = {
      ground: ["levitate", "eartheater"],
      water: ["waterabsorb", "stormdrain", "dryskin"],
      fire: ["flashfire", "wellbakedbody"],
      electric: ["voltabsorb", "lightningrod", "motordrive"],
      grass: ["sapsipper"]
    };
    if (immunities[attackType]?.includes(id)) return 0;
    if ((id === "thickfat" && ["fire", "ice"].includes(attackType)) || (id === "heatproof" && attackType === "fire") || (id === "waterbubble" && attackType === "fire")) return multiplier * .5;
    return multiplier;
  }

  function gymThreatMoves(gym) {
    const byType = new Map();
    gym.team.forEach(member => (member.moveset || []).forEach(value => {
      const move = moveMetadata(value);
      if (!move || move.category === "status" || move.power <= 0) return;
      const current = byType.get(move.type);
      if (!current || move.power > current.power) byType.set(move.type, move);
    }));
    return [...byType.values()];
  }

  function gymPokemonRecommendations(gym) {
    const defenders = gym.team.map(member => ({ member, pokemon: memberPokemon(member) })).filter(row => row.pokemon);
    const threats = gymThreatMoves(gym);
    const owned = usableOwnedPokemonEntries().map(entry => ({ entry, pokemon: resolveServerPokemon(entry.species) })).filter(row => row.pokemon);
    const candidates = state.serverSync ? owned : DATA.pokemon.filter(pokemon => pokemon.implemented && pokemon.types.length).map(pokemon => ({ entry: null, pokemon }));
    const gymMaxLevel = Math.max(...gym.team.map(member => Number(member.level || 0)), 1);
    return candidates.map(({ entry, pokemon }) => {
      const actualMoves = (entry?.moves || []).map(value => ({ value, move: moveMetadata(value) })).filter(row => row.move && row.move.category !== "status" && row.move.power > 0);
      const attackOptions = actualMoves.length
        ? actualMoves
        : pokemon.types.map(type => ({ value: `STAB ${humanizeId(type)}`, move: { type, power: 80, name: `STAB ${humanizeId(type)}` } }));
      const matchups = defenders.map(({ member, pokemon: defender }) => {
        const options = attackOptions.map(option => ({
          ...option,
          multiplier: abilityAdjustedEffectiveness(effectiveness(option.move.type, defender.types), option.move.type, member.ability),
          damageScore: abilityAdjustedEffectiveness(effectiveness(option.move.type, defender.types), option.move.type, member.ability) * option.move.power
        })).sort((left, right) => right.damageScore - left.damageScore || right.multiplier - left.multiplier);
        return options[0];
      });
      const offensiveAverage = matchups.reduce((sum, row) => sum + (row?.multiplier || 0), 0) / Math.max(matchups.length, 1);
      const superCount = matchups.filter(row => row?.multiplier > 1).length;
      const fourXCount = matchups.filter(row => row?.multiplier >= 4).length;
      const movePerformance = attackOptions.map(option => {
        const multipliers = defenders.map(({ member, pokemon: defender }) => abilityAdjustedEffectiveness(effectiveness(option.move.type, defender.types), option.move.type, member.ability));
        return { ...option, superCount: multipliers.filter(value => value > 1).length, average: multipliers.reduce((sum, value) => sum + value, 0) / Math.max(multipliers.length, 1) };
      }).sort((left, right) => right.superCount - left.superCount || right.average - left.average || right.move.power - left.move.power);
      const defensive = threats.map(move => ({ move, multiplier: abilityAdjustedEffectiveness(effectiveness(move.type, pokemon.types), move.type, entry?.ability || pokemon.abilities?.[0]) }));
      const resistCount = defensive.filter(row => row.multiplier < 1).length;
      const weaknessCount = defensive.filter(row => row.multiplier > 1).length;
      const worstThreat = Math.max(1, ...defensive.map(row => row.multiplier));
      const stats = pokemon.stats || {};
      const baseQuality = Math.max(Number(stats.attack || 0), Number(stats.special_attack || 0)) * .07
        + (Number(stats.hp || 0) + Number(stats.defence || 0) + Number(stats.special_defence || 0)) * .025
        + Number(stats.speed || 0) * .025;
      const level = Number(entry?.level || gymMaxLevel);
      const levelFit = owned.length ? (level - gymMaxLevel) * 1.25 : 0;
      const readyBonus = entry && hasPokemonTag(entry, "ready") ? 18 : 0;
      const score = superCount * 34 + fourXCount * 14 + offensiveAverage * 16 + resistCount * 7 - weaknessCount * 13 - (worstThreat - 1) * 9 + baseQuality + levelFit + readyBonus;
      return { entry, pokemon, score, superCount, resistCount, weaknessCount, worstThreat, bestMoves: movePerformance.slice(0, 2), gymSize: defenders.length };
    }).sort((left, right) => right.score - left.score || Number(right.entry?.level || 0) - Number(left.entry?.level || 0) || left.pokemon.dex - right.pokemon.dex).slice(0, 6);
  }

  function renderGymPokemonRecommendation(row) {
    const location = row.entry ? ownedLocationLabel(row.entry) : "Sugestão geral";
    const moveNames = row.bestMoves.map(option => option.move.name || humanizeId(option.value));
    const risk = row.weaknessCount ? `${row.weaknessCount} cobertura${row.weaknessCount === 1 ? " perigosa" : "s perigosas"}` : "sem fraqueza à cobertura";
    const tags = row.entry ? pokemonTagIds(row.entry).filter(tagId => tagId !== "farm") : [];
    return `<article class="gym-pokemon-recommendation"><img src="${pokemonImage(row.pokemon)}" alt="" loading="lazy"><div class="gym-pokemon-recommendation-copy"><small>${escapeHtml(location)}</small><strong>${escapeHtml(row.entry?.nickname || row.pokemon.name)}${row.entry?.level ? ` · Nv. ${row.entry.level}` : ""}</strong>${row.entry?.nickname ? `<span>${escapeHtml(row.pokemon.name)}</span>` : ""}<div class="type-row">${row.pokemon.types.map(typePill).join("")}</div>${tags.length ? `<div class="owned-tag-row">${tags.map(renderPokemonTagChip).join("")}</div>` : ""}<p>Use <b>${escapeHtml(moveNames.join(" ou "))}</b>. Vantagem contra ${row.superCount}/${row.gymSize}; ${row.resistCount} resistências e ${escapeHtml(risk)}.</p></div></article>`;
  }

  function renderGyms() {
    const gyms = DATA.gyms.filter(gym => gym.region === ui.gymRegion);
    const extraLocations = (DATA.extraLocations || [])
      .filter(location => location.region === ui.gymRegion)
      .sort((left, right) => {
        const categoryOrder = { league: 0, villain: 1, landmark: 2, encounter: 3 };
        return (categoryOrder[left.category] ?? 9) - (categoryOrder[right.category] ?? 9)
          || extraLocationName(left).localeCompare(extraLocationName(right), "pt-BR");
      });
    const completed = new Set(state.gymCompleted);
    const primaryRegions = ["Kanto", "Johto", "Hoenn", "Sinnoh"];
    const extraRegions = [...new Set((DATA.extraLocations || []).map(location => location.region))].filter(region => !primaryRegions.includes(region));
    const regions = [...primaryRegions, ...extraRegions];
    content.innerHTML = `
      <div class="locator-card"><span class="locator-icon">🧭</span><div><h3>Como encontrar os ginásios</h3><p>O cartógrafo regional troca um <strong>item específico de cada líder</strong> junto com um mapa vazio pelo mapa do ginásio. Abra um card para ver o item exato e a insígnia recebida.</p></div></div>
      <div class="region-tabs" style="margin-bottom:16px">${regions.map(region => {
        const regionGyms = DATA.gyms.filter(gym => gym.region === region);
        const label = regionGyms.length ? `${region} · ${regionGyms.filter(gym => completed.has(gym.id)).length}/${regionGyms.length}` : `${region} · extras`;
        return `<button class="tab-button${ui.gymRegion === region ? " is-active" : ""}" data-action="gym-region" data-region="${region}" type="button">${label}</button>`;
      }).join("")}</div>
      ${gyms.length ? `<section class="gym-section"><div class="section-heading"><div><p class="eyebrow">Rota principal</p><h3>Ginásios de ${escapeHtml(ui.gymRegion)}</h3></div><span class="badge">${gyms.filter(gym => completed.has(gym.id)).length}/${gyms.length} concluídos</span></div><div class="gym-grid">${gyms.map(gym => renderGymCard(gym, completed.has(gym.id))).join("")}</div></section>` : ""}
      <section class="extra-locations-section"><div class="section-heading"><div><p class="eyebrow">${gyms.length ? "Além dos ginásios" : "Estruturas especiais"}</p><h3>Pontos extras de ${escapeHtml(ui.gymRegion)}</h3><p>${extraLocations.length} estruturas de progressão confirmadas nos datapacks e mods da instalação.</p></div></div><div class="extra-location-grid">${extraLocations.map(renderExtraLocationCard).join("")}</div></section>`;
  }

  function gymTypeIcon(type, large = false) {
    return `<span class="gym-type-icon${large ? " is-large" : ""}" style="--type-color:${TYPE_COLORS[type] || "#607d68"}"><img src="./assets/gym-icons/${escapeHtml(type)}.png" alt="Símbolo do tipo ${escapeHtml(humanizeId(type))}" loading="lazy"></span>`;
  }

  function gymBadgeName(gym) {
    return humanizeId(gym.badgeItem || "insígnia não informada").replace(new RegExp(`^${gym.region}\\s+`, "i"), "");
  }

  function extraLocationName(location) {
    return EXTRA_LOCATION_NAMES[location.key] || humanizeId(location.key.split("/").pop());
  }

  function extraLocationDetails(location) {
    if (EXTRA_LOCATION_DETAILS[location.key]) return EXTRA_LOCATION_DETAILS[location.key];
    if (location.category === "league") {
      return {
        rewards: [`Troféu da Liga de ${location.region}`, "Conclusão da Elite Four e do campeão"],
        steps: ["Obtenha o mapa da Liga com o cartógrafo regional usando o item indicado acima e um mapa vazio.", "Vença a Elite Four e o campeão em sequência para concluir a região e receber o troféu."],
        wikiUrl: OFFICIAL_STRUCTURE_GUIDE_URL
      };
    }
    return { rewards: ["Loot e encontros da estrutura"], steps: ["Explore toda a estrutura e confira seus baús, treinadores e pontos interativos."], wikiUrl: OFFICIAL_STRUCTURE_GUIDE_URL };
  }

  function renderExtraLocationPreview(location) {
    const override = EXTRA_LOCATION_PREVIEW_OVERRIDES[location.key];
    const fileName = EXTRA_LOCATION_PREVIEW_FILES[location.key];
    const imageUrl = override?.url || (fileName ? `${OFFICIAL_STRUCTURE_PREVIEW_BASE}${fileName}` : "");
    if (!imageUrl) return "";
    const sourceLabel = override?.sourceLabel || "equipe LUMYVERSE";
    const sourceUrl = override?.sourceUrl || extraLocationDetails(location).wikiUrl;
    return `<figure class="extra-location-preview"><div class="extra-location-preview-media"><img class="extra-location-preview-image" src="${escapeHtml(imageUrl)}" alt="Exemplo de ${escapeHtml(extraLocationName(location))} dentro do Minecraft" loading="lazy"><div class="extra-location-preview-fallback" hidden><span aria-hidden="true">▧</span><strong>Prévia indisponível sem internet</strong><p>A fonte da imagem ainda pode ser aberta no navegador.</p></div></div><figcaption><div><strong>Exemplo no Minecraft</strong><span>Publicado por ${escapeHtml(sourceLabel)}; pode variar conforme a versão.</span></div><button class="text-button" data-external-url="${escapeHtml(sourceUrl)}" type="button">Abrir fonte ↗</button></figcaption></figure>`;
  }

  function renderGymCard(gym, isComplete) {
    const recommendations = recommendedTypesForTeam(gym.team);
    return `<article class="gym-card${isComplete ? " is-complete" : ""}"><div class="gym-summary"><div class="gym-card-header"><button class="gym-card-main" data-action="gym-open" data-gym="${gym.id}" type="button">${gymTypeIcon(gym.specialty)}<span class="gym-title"><strong>${escapeHtml(gym.leader)}</strong><small>${gym.order}º ginásio · no pack: ${escapeHtml(gym.packName)}</small></span></button><button class="capture-toggle${isComplete ? " is-captured" : ""}" style="position:static" data-action="gym-complete" data-gym="${gym.id}" type="button" aria-label="${isComplete ? "Desmarcar" : "Marcar"} ginásio de ${escapeHtml(gym.leader)}">${isComplete ? "✓" : "+"}</button></div><div class="type-row" style="margin-top:11px">${typePill(gym.specialty)}${recommendations.slice(0, 3).map(row => `<span class="badge">Use ${escapeHtml(humanizeId(row.type))} · ${row.superCount}/${gym.team.length}</span>`).join("")}</div><button class="gym-details-button" data-action="gym-open" data-gym="${gym.id}" type="button"><span>Mapa, insígnia e equipe (${gym.team.length})</span><b aria-hidden="true">→</b></button></div></article>`;
  }

  function renderExtraLocationCard(location) {
    const category = EXTRA_CATEGORY_META[location.category] || EXTRA_CATEGORY_META.landmark;
    return `<button class="extra-location-card" data-action="extra-location-open" data-location="${escapeHtml(location.id)}" type="button"><span class="extra-location-icon is-${escapeHtml(location.category)}" aria-hidden="true">${category.symbol}</span><span class="extra-location-copy"><small>${escapeHtml(category.label)}</small><strong>${escapeHtml(extraLocationName(location))}</strong><span>${escapeHtml(humanizeId(location.biome))}</span></span>${location.locatorCostItem ? `<span class="badge">Mapa disponível</span>` : `<span class="extra-card-arrow" aria-hidden="true">→</span>`}</button>`;
  }

  function renderItemFact(label, itemId, description) {
    return `<article class="gym-fact-card"><img src="${itemIcon(itemId)}" alt="" loading="lazy"><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(humanizeId(itemId))}</strong><p>${description}</p><code>${escapeHtml(itemId)}</code></div></article>`;
  }

  function openGymModal(gym) {
    const recommendations = recommendedTypesForTeam(gym.team);
    const pokemonRecommendations = gymPokemonRecommendations(gym);
    const threatTypes = gymThreatMoves(gym);
    const usesOwnedPokemon = pokemonRecommendations.some(row => row.entry);
    const recommendationCopy = usesOwnedPokemon
      ? "Selecionados entre os Pokémon utilizáveis do seu time e PC, considerando nível, golpes atuais e resistência ao moveset do líder."
      : state.serverSync
        ? "Nenhum Pokémon utilizável está disponível. Mova pelo menos um indivíduo da área de farms para receber recomendações."
        : "Sugestões gerais por tipos e atributos. Sincronize o servidor para receber recomendações usando os seus próprios Pokémon e golpes.";
    modalContent.innerHTML = `
      <header class="gym-modal-hero">${gymTypeIcon(gym.specialty, true)}<div><p class="eyebrow">${gym.order}º ginásio de ${escapeHtml(gym.region)}</p><h2 id="modal-title">${escapeHtml(gym.leader)}</h2><p>No pack: ${escapeHtml(gym.packName)} · especialidade ${escapeHtml(humanizeId(gym.specialty))}</p></div></header>
      <div class="gym-modal-facts">
        ${renderItemFact("Item usado para encontrar", gym.locatorCostItem, `Entregue ao cartógrafo de ${escapeHtml(gym.region)} junto com <strong>${escapeHtml(humanizeId(gym.locatorBaseItem))}</strong> para receber “${escapeHtml(gym.locatorMapName)}”.`)}
        ${renderItemFact("Insígnia recebida", gym.badgeItem, `Recompensa oficial ao derrotar ${escapeHtml(gym.leader)}: <strong>${escapeHtml(gymBadgeName(gym))}</strong>.`)}
      </div>
      <div class="detail-columns gym-modal-columns" style="margin-top:14px">
        <section class="detail-section is-wide"><div class="detail-section-heading"><div><h3>Equipe oficial 1.7.31</h3><p>${escapeHtml(humanizeId(gym.battleFormat))} · até ${gym.maxItemUses ?? 0} usos de item</p></div><div class="type-row">${typePill(gym.specialty)}</div></div><div class="official-team">${gym.team.map(renderOfficialMember).join("")}</div></section>
        <section class="detail-section is-wide gym-pokemon-recommendations-section"><div class="detail-section-heading"><div><h3>Quais Pokémon utilizar</h3><p>${recommendationCopy}</p></div><span class="badge">${usesOwnedPokemon ? "Sua coleção" : state.serverSync ? "Sem utilizáveis" : "Base completa"}</span></div><div class="gym-threat-types"><span>Ataques ofensivos conhecidos:</span><div class="type-row">${threatTypes.map(move => typePill(move.type)).join("")}</div></div>${pokemonRecommendations.length ? `<div class="gym-pokemon-recommendation-grid">${pokemonRecommendations.map(renderGymPokemonRecommendation).join("")}</div>` : renderEmpty("Nenhuma recomendação disponível", "Revise a classificação entre Pokémon utilizáveis e farms.")}<p class="section-note">A ordem combina vantagem ofensiva contra toda a equipe, resistência aos tipos dos ataques conhecidos, atributos base e nível. Habilidades de imunidade comuns também são consideradas.</p></section>
        <section class="detail-section"><h3>Recomendações elementais</h3><p class="section-note">Tipos com vantagem contra mais integrantes da equipe oficial.</p><div class="gym-recommendations">${recommendations.map(row => `<span class="badge">${escapeHtml(humanizeId(row.type))} · ${row.superCount}/${gym.team.length}</span>`).join("") || `<span class="section-note">Sem recomendação calculada.</span>`}</div></section>
        <section class="detail-section"><h3>Local</h3><ul class="detail-list"><li>Bioma: ${escapeHtml(humanizeId(gym.biome))}</li><li>Estrutura: <code>${escapeHtml(gym.structure)}</code></li><li>Tabela: <code>${escapeHtml(gym.locatorTable)}</code></li></ul></section>
      </div>`;
    modal.hidden = false;
    modal.querySelector(".modal-panel")?.scrollTo({ top: 0 });
  }

  function openExtraLocationModal(location) {
    const category = EXTRA_CATEGORY_META[location.category] || EXTRA_CATEGORY_META.landmark;
    const details = extraLocationDetails(location);
    const locatorFact = location.locatorCostItem
      ? renderItemFact("Item usado no mapa", location.locatorCostItem, `Entregue ao cartógrafo de ${escapeHtml(location.region)} junto com <strong>${escapeHtml(humanizeId(location.locatorBaseItem))}</strong> para receber “${escapeHtml(location.locatorMapName)}”.`)
      : `<article class="gym-fact-card is-text"><span class="extra-location-icon is-${escapeHtml(location.category)}" aria-hidden="true">⌖</span><div><span>Como localizar</span><strong>Exploração pelo bioma</strong><p>Nenhuma troca de mapa foi identificada nos arquivos instalados para esta estrutura.</p></div></article>`;
    const rewardFact = location.rewardItem
      ? renderItemFact("Recompensa da Liga", location.rewardItem, `Troféu oficial recebido ao concluir a Liga Pokémon de ${escapeHtml(location.region)}.`)
      : "";
    modalContent.innerHTML = `
      <header class="gym-modal-hero extra-modal-hero"><span class="extra-location-icon is-${escapeHtml(location.category)} is-large" aria-hidden="true">${category.symbol}</span><div><p class="eyebrow">${escapeHtml(location.region)} · ${escapeHtml(category.label)}</p><h2 id="modal-title">${escapeHtml(extraLocationName(location))}</h2><p>${escapeHtml(category.description)}</p></div><button class="secondary-button extra-wiki-button" data-external-url="${escapeHtml(details.wikiUrl)}" type="button">Wiki oficial ↗</button></header>
      ${renderExtraLocationPreview(location)}
      <div class="gym-modal-facts">${locatorFact}${rewardFact || `<article class="gym-fact-card is-text"><span class="extra-location-icon is-landmark" aria-hidden="true">⌁</span><div><span>Bioma</span><strong>${escapeHtml(humanizeId(location.biome))}</strong><p>Bioma declarado pela estrutura oficial do datapack.</p></div></article>`}</div>
      <div class="location-guide-grid">
        <section class="detail-section"><h3>O que você encontra / ganha</h3><div class="location-rewards">${details.rewards.map(reward => `<span class="location-reward-chip">${escapeHtml(reward)}</span>`).join("")}</div></section>
        <section class="detail-section"><h3>Como conseguir</h3><ol class="location-steps">${details.steps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section>
      </div>
      <section class="detail-section" style="margin-top:14px"><h3>Dados da estrutura</h3><ul class="detail-list"><li>Região: ${escapeHtml(location.region)}</li><li>Bioma: ${escapeHtml(humanizeId(location.biome))}</li><li>ID técnico: <code>${escapeHtml(location.structure)}</code></li>${location.locatorDestination ? `<li>Destino do mapa: <code>${escapeHtml(location.locatorDestination)}</code></li>` : ""}</ul><p class="structure-version-note">Mecânica conferida com os arquivos da instalação 1.7.31. A wiki abre a documentação oficial atual e pode refletir mudanças posteriores.</p></section>`;
    modal.hidden = false;
    modal.querySelector(".modal-panel")?.scrollTo({ top: 0 });
  }

  function renderOfficialMember(member) {
    const pokemon = memberPokemon(member);
    const name = pokemon?.name || humanizeId(member.species);
    const held = Array.isArray(member.heldItem) ? member.heldItem.map(humanizeId).join(", ") : member.heldItem ? humanizeId(member.heldItem) : "Sem item";
    return `<div class="official-member"><div class="official-member-main">${pokemon ? `<img src="${pokemonImage(pokemon)}" alt="" loading="lazy">` : ""}<div><strong>${escapeHtml(name)} · Nv. ${member.level ?? "?"}</strong><span>${escapeHtml(humanizeId(member.ability || "habilidade não informada"))} · ${escapeHtml(held)}</span><div class="moves">${Array.isArray(member.moveset) ? member.moveset.map(humanizeId).join(" · ") : "Moveset não informado"}</div></div></div><span class="badge is-muted">${escapeHtml(humanizeId(member.nature || "natureza ?"))}</span></div>`;
  }

  function getV1Snapshot() {
    try { return JSON.parse(localStorage.getItem(V1_SNAPSHOT_KEY) || "null"); }
    catch { return null; }
  }

  async function checkForAppUpdateManually() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke || updateCheckInProgress) return;
    updateCheckInProgress = true;
    updateStatus = "Buscando atualizações...";
    render();
    try {
      const update = await invoke("check_update");
      if (!update?.available) {
        updateStatus = `Versão ${update?.currentVersion || "atual"} instalada. Tudo em dia.`;
        render();
        alert(`Você já está na versão mais recente (${update?.currentVersion || "atual"}).`);
        return;
      }

      updateStatus = `Versão ${update.version} disponível.`;
      render();
      const shouldInstall = confirm(`Versão ${update.version} disponível.\n\nBaixar, instalar e reiniciar o app agora?`);
      if (!shouldInstall) return;

      updateInstallInProgress = true;
      updateStatus = "Instalando a atualização e reiniciando o app...";
      render();
      await invoke("install_latest_update");
    } catch (error) {
      updateStatus = "Não foi possível buscar atualizações.";
      render();
      alert("Não foi possível buscar atualizações. Confira a conexão e se a release possui latest.json e a assinatura do instalador.");
      console.warn("Não foi possível buscar atualizações.", error);
    } finally {
      updateCheckInProgress = false;
      updateInstallInProgress = false;
      if (activeView === "settings") render();
    }
  }

  function formatRemoteFileSize(value) {
    const size = Number(value);
    if (!Number.isFinite(size) || size < 0) return "Tamanho não informado";
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
    if (size < 1024 ** 3) return `${(size / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
    return `${(size / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
  }

  function renderSftpRemoteEntries() {
    if (!sftpRemoteEntries.length) return "";
    return `<div class="sftp-result"><div class="detail-section-heading"><div><h3>Conteúdo remoto</h3><p>Até 100 entradas do diretório configurado.</p></div><span class="badge">${sftpRemoteEntries.length} entradas</span></div><div class="sftp-entry-list">${sftpRemoteEntries.map(entry => {
      const modified = entry.modifiedAt ? new Date(Number(entry.modifiedAt) * 1000).toLocaleString("pt-BR") : "Data não informada";
      return `<div class="sftp-entry"><span class="sftp-entry-icon" aria-hidden="true">${entry.isDirectory ? "▣" : "▤"}</span><div><strong>${escapeHtml(entry.name)}</strong><span>${entry.isDirectory ? "Diretório" : formatRemoteFileSize(entry.size)} · ${escapeHtml(modified)}</span></div></div>`;
    }).join("")}</div></div>`;
  }

  function renderSftpPlayerSummary() {
    const summary = state.serverSync;
    if (!summary) return "";
    const syncedAt = summary.syncedAt ? new Date(summary.syncedAt * 1000).toLocaleString("pt-BR") : "data desconhecida";
    return `<div class="sftp-player-summary"><div><strong>Última leitura de ${escapeHtml(summary.playerName)}</strong><span>${escapeHtml(syncedAt)} · mundo ${escapeHtml(summary.levelName)}</span></div><div class="sftp-player-summary-stats"><span><b>${summary.seenCount}</b> vistos</span><span><b>${summary.caughtCount}</b> capturados</span><span><b>${summary.party.length + summary.pc.length}</b> disponíveis</span><span><b>${summary.filesRead}</b> arquivos</span></div>${summary.warnings.length ? `<p>${escapeHtml(summary.warnings.join(" · "))}</p>` : ""}</div>`;
  }

  async function applySftpPlayerSyncResult(result) {
    const caughtSpecies = Array.isArray(result?.caughtSpecies) ? result.caughtSpecies : [];
    const seenSpecies = Array.isArray(result?.seenSpecies) ? result.seenSpecies : [];
    const party = Array.isArray(result?.party) ? result.party : [];
    const pc = Array.isArray(result?.pc) ? result.pc : [];
    const resolvedCaught = caughtSpecies.map(resolveServerPokemon).filter(Boolean);
    const resolvedSeen = seenSpecies.map(resolveServerPokemon).filter(Boolean);
    const unmatchedSpecies = seenSpecies.filter(species => !resolveServerPokemon(species));
    state.captured = [...new Set(resolvedCaught.map(pokemon => pokemon.id))];
    state.pokedexSeen = [...new Set([...resolvedSeen, ...resolvedCaught].map(pokemon => pokemon.id))];
    state.teams = state.teams.filter(team => !team.id.startsWith("server-party-"));

    sftpPlayerName = String(result.playerName || sftpPlayerName).trim();
    localStorage.setItem(SFTP_PLAYER_NAME_KEY, sftpPlayerName);
    state.serverSync = sanitizeServerSync({
      playerName: result.playerName,
      uuid: result.uuid,
      levelName: result.levelName,
      storageFormat: result.storageFormat,
      syncedAt: result.syncedAt,
      caughtCount: caughtSpecies.length,
      seenCount: seenSpecies.length,
      party,
      pc,
      keyItems: result.keyItems,
      filesRead: Array.isArray(result.filesRead) ? result.filesRead.length : 0,
      warnings: result.warnings,
      unmatchedSpecies
    });
    await saveState();
  }

  async function syncConfiguredPlayerData() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke || sftpPlayerSyncBusy || !sftpProfileStatus.saved) return;
    if (!sftpPlayerName.trim()) {
      activeView = "settings";
      sftpConnectionStatus = "Informe o nick do jogador para localizar o UUID no usercache.json.";
      sftpConnectionTone = "danger";
      render();
      requestAnimationFrame(() => document.querySelector("#sftp-player-name")?.focus());
      return;
    }

    const scrollTop = document.scrollingElement?.scrollTop || 0;
    sftpPlayerSyncBusy = true;
    updateChrome();
    try {
      const result = await invoke("sync_sftp_player_data", { playerName: sftpPlayerName.trim() });
      await applySftpPlayerSyncResult(result);
      sftpConnectionStatus = `Dados de ${result.playerName} atualizados: ${result.seenSpecies.length} vistos na Pokédex e ${result.party.length + result.pc.length} Pokémon disponíveis.`;
      sftpConnectionTone = "success";
      render();
      requestAnimationFrame(() => window.scrollTo({ top: scrollTop }));
    } catch (error) {
      sftpConnectionStatus = error?.message || String(error);
      sftpConnectionTone = "danger";
      if (activeView === "settings") render();
      else alert(`Não foi possível atualizar os dados do servidor.\n\n${sftpConnectionStatus}`);
    } finally {
      sftpPlayerSyncBusy = false;
      updateChrome();
    }
  }

  function renderSftpSettings(desktop) {
    const saved = Boolean(sftpProfileStatus.saved);
    const status = sftpConnectionStatus
      ? `<div class="sftp-status is-${escapeHtml(sftpConnectionTone)}">${escapeHtml(sftpConnectionStatus)}</div>`
      : "";
    return `<section class="panel sftp-panel"><div class="detail-section-heading"><div><p class="eyebrow">Fonte remota</p><h3>Servidor SFTP</h3><p>Conecte em modo somente leitura para validar o diretório que contém os dados do servidor.</p></div><span class="badge ${saved ? "" : "is-muted"}">${saved ? "Credencial protegida salva" : "Nada salvo"}</span></div>
      <div class="sftp-security-note"><strong>Privacidade</strong><p>Por padrão, host, login, senha e caminho existem apenas durante esta tentativa. Se você optar por salvar, o perfil completo será colocado no Credential Manager do Windows; a senha não entra no banco nem nos backups do app.</p></div>
      <div class="sftp-form-grid">
        <label class="field"><span>Host</span><input class="input" id="sftp-host" type="text" value="${escapeHtml(saved ? sftpProfileStatus.host : "")}" placeholder="sftp.exemplo.com" autocomplete="off"${desktop ? "" : " disabled"}></label>
        <label class="field"><span>Porta</span><input class="input" id="sftp-port" type="number" min="1" max="65535" value="${escapeHtml(saved ? sftpProfileStatus.port : 22)}"${desktop ? "" : " disabled"}></label>
        <label class="field"><span>Login</span><input class="input" id="sftp-username" type="text" value="${escapeHtml(saved ? sftpProfileStatus.username : "")}" placeholder="usuario" autocomplete="off"${desktop ? "" : " disabled"}></label>
        <label class="field"><span>Senha</span><input class="input" id="sftp-password" type="password" value="" placeholder="${saved ? "Protegida no cofre do Windows" : "Solicitada a cada acesso"}" autocomplete="new-password"${desktop ? "" : " disabled"}></label>
        <label class="field is-wide"><span>Caminho remoto</span><input class="input" id="sftp-remote-path" type="text" value="${escapeHtml(saved ? sftpProfileStatus.remotePath : "")}" placeholder="/home/servidor" autocomplete="off"${desktop ? "" : " disabled"}></label>
        <label class="field is-wide"><span>Nick do jogador</span><input class="input" id="sftp-player-name" type="text" value="${escapeHtml(sftpPlayerName)}" placeholder="Seu nick exato no Minecraft" autocomplete="off"${desktop ? "" : " disabled"}><small>O app usa o nick apenas para resolver seu UUID no usercache.json durante a atualização manual.</small></label>
      </div>
      <div class="sftp-options">${saved ? `<label class="checkbox-field"><input id="sftp-use-saved" type="checkbox" checked> Usar perfil protegido salvo</label>` : ""}<label class="checkbox-field"><input id="sftp-save-profile" type="checkbox"${desktop ? "" : " disabled"}> Salvar perfil no cofre do Windows</label></div>
      <div class="action-row"><button class="primary-button" data-action="sftp-connect" type="button"${!desktop || sftpConnectionBusy ? " disabled" : ""}>${sftpConnectionBusy ? "Conectando..." : "Conectar e buscar"}</button>${saved ? `<button class="danger-button" data-action="sftp-forget" type="button"${sftpConnectionBusy ? " disabled" : ""}>Remover credencial salva</button>` : ""}</div>
      ${desktop ? "" : `<p class="section-note">A conexão SFTP está disponível apenas no aplicativo desktop.</p>`}${status}${renderSftpPlayerSummary()}${renderSftpRemoteEntries()}</section>`;
  }

  async function connectToSftpServer() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke || sftpConnectionBusy) return;
    const useSavedCredentials = Boolean(document.querySelector("#sftp-use-saved")?.checked);
    const request = {
      host: document.querySelector("#sftp-host")?.value.trim() || "",
      port: Number(document.querySelector("#sftp-port")?.value || 22),
      username: document.querySelector("#sftp-username")?.value.trim() || "",
      password: document.querySelector("#sftp-password")?.value || "",
      remotePath: document.querySelector("#sftp-remote-path")?.value.trim() || "",
      useSavedCredentials,
      saveCredentials: Boolean(document.querySelector("#sftp-save-profile")?.checked),
      acceptHostKey: false,
      expectedFingerprint: null
    };
    if (!useSavedCredentials && (!request.host || !request.username || !request.password || !request.remotePath)) {
      sftpConnectionStatus = "Preencha host, login, senha e caminho remoto antes de conectar.";
      sftpConnectionTone = "danger";
      render();
      return;
    }

    sftpConnectionBusy = true;
    sftpConnectionStatus = "Abrindo uma conexão SFTP segura...";
    sftpConnectionTone = "neutral";
    sftpRemoteEntries = [];
    render();
    try {
      let result = await invoke("connect_sftp", { request });
      if (result?.status === "hostKeyConfirmationRequired") {
        const trusted = confirm(`Primeiro acesso a ${result.host}:${result.port}.\n\nTipo da chave: ${result.hostKeyType}\nImpressão digital SHA-256:\n${result.fingerprint}\n\nConfirme essa impressão digital com o administrador do servidor antes de continuar. Confiar nesta chave?`);
        if (!trusted) {
          sftpConnectionStatus = "Conexão cancelada: a chave SSH não foi aceita.";
          sftpConnectionTone = "neutral";
          return;
        }
        request.acceptHostKey = true;
        request.expectedFingerprint = result.fingerprint;
        result = await invoke("connect_sftp", { request });
      }
      sftpRemoteEntries = Array.isArray(result?.entries) ? result.entries : [];
      sftpConnectionStatus = `Conectado a ${result.host}:${result.port}. Diretório ${result.remotePath} validado com ${sftpRemoteEntries.length} entrada(s).`;
      sftpConnectionTone = "success";
      if (request.saveCredentials) {
        await loadSftpProfileStatus();
      } else if (useSavedCredentials) {
        sftpProfileStatus = { ...sftpProfileStatus, remotePath: result.remotePath };
      }
    } catch (error) {
      sftpConnectionStatus = error?.message || String(error);
      sftpConnectionTone = "danger";
    } finally {
      request.password = "";
      sftpConnectionBusy = false;
      if (activeView === "settings") render();
    }
  }

  async function forgetSftpProfile() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke || sftpConnectionBusy || !confirm("Remover do cofre do Windows o host, login, senha e caminho SFTP salvos?")) return;
    sftpConnectionBusy = true;
    try {
      sftpProfileStatus = await invoke("forget_sftp_profile");
      sftpRemoteEntries = [];
      sftpConnectionStatus = "Credencial SFTP e chave SSH local removidas.";
      sftpConnectionTone = "success";
    } catch (error) {
      sftpConnectionStatus = error?.message || String(error);
      sftpConnectionTone = "danger";
    } finally {
      sftpConnectionBusy = false;
      if (activeView === "settings") render();
    }
  }

  function renderSettings() {
    const v1 = getV1Snapshot();
    const v1Count = Object.keys(v1?.values || {}).length;
    const desktop = Boolean(window.__TAURI__?.core?.invoke);
    const updateButtonLabel = updateInstallInProgress ? "Instalando..." : updateCheckInProgress ? "Buscando..." : "Buscar atualizações";
    content.innerHTML = `
      ${renderSftpSettings(desktop)}
      <div class="panel"><h3>Dados do novo app</h3><p>O Cobbleverse usa um banco v2 vazio e separado. Capturas, times e progresso antigos não são importados automaticamente.</p><div class="action-row"><button class="primary-button" data-action="export-state" type="button">Exportar backup v2</button><button class="secondary-button" data-action="import-state" type="button">Importar backup v2</button><button class="danger-button" data-action="reset-state" type="button">Resetar dados v2</button></div></div>
      <div class="panel"><h3>Backup preservado da v1</h3><p>O snapshot do localStorage antigo contém ${v1Count} chaves e foi criado em ${v1?.savedAt ? new Date(v1.savedAt).toLocaleString("pt-BR") : "esta instalação"}. No desktop, os arquivos antigos também são copiados para <code>backups/v1</code> antes de o banco novo ser aberto.</p><button class="secondary-button" data-action="export-v1" type="button"${v1 ? "" : " disabled"}>Baixar snapshot da v1</button></div>
      <div class="panel"><h3>Atualizações</h3><p>${updateStatus || "Busque novas versões manualmente. Instalações da v1 recebem a v2 pelo mesmo canal de atualização assinado."}</p><button class="primary-button" data-action="check-update" type="button"${!desktop || updateCheckInProgress ? " disabled" : ""}>${updateButtonLabel}</button>${desktop ? "" : `<p class="section-note">Disponível apenas no aplicativo desktop.</p>`}</div>
      <div class="panel"><h3>Aparência</h3><p>Tema atual: ${state.preferences.theme === "dark" ? "escuro" : "claro"}. Densidade: ${state.preferences.density === "compact" ? "compacta" : "confortável"}.</p><div class="action-row"><button class="secondary-button" data-action="toggle-theme" type="button">Alternar tema</button><button class="secondary-button" data-action="toggle-density" type="button">Alternar densidade</button></div></div>
      <div class="panel"><h3>Base de dados</h3><ul class="detail-list"><li>${DATA.metadata.speciesCount} espécies e ${DATA.pokemon.reduce((sum, pokemon) => sum + getValidPokemonSpawns(pokemon).length, 0)} entradas de spawn.</li><li>${dropRows.length} relações de drop; ${dropRows.filter(row => !row.pastureBlocked).length} disponíveis no Pasture.</li><li>${DATA.baits.length} baits, ${DATA.berries.length} berries e ${DATA.gyms.length} ginásios oficiais.</li><li>Fonte: ${escapeHtml(DATA.metadata.source)}.</li><li>Gerado em ${new Date(DATA.metadata.generatedAt).toLocaleString("pt-BR")}.</li></ul></div>`;
  }

  function toggleTheme() {
    state.preferences.theme = state.preferences.theme === "dark" ? "light" : "dark";
    applyPreferences();
    scheduleSave();
    render();
  }

  async function handleContentClick(event) {
    const autocompleteOption = event.target.closest("[data-autocomplete-value]");
    if (autocompleteOption) {
      event.preventDefault();
      const input = autocompleteOption.closest(".clearable-input")?.querySelector("input.input");
      selectAutocompleteValue(input, autocompleteOption.dataset.autocompleteValue);
      return;
    }
    const clearButton = event.target.closest("[data-clear-input]");
    if (clearButton) {
      event.preventDefault();
      const input = clearButton.closest(".clearable-input")?.querySelector("input.input");
      selectAutocompleteValue(input, "");
      return;
    }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "open-pokemon") {
      const pokemon = pokemonById.get(target.dataset.pokemon);
      if (pokemon) renderPokemonModal(pokemon);
    } else if (action === "cycle-pokedex-status") {
      event.stopPropagation();
      const captured = captureSet();
      const seen = seenSet();
      const id = target.dataset.pokemon;
      if (captured.has(id)) {
        captured.delete(id);
        seen.delete(id);
      } else if (seen.has(id)) {
        captured.add(id);
      } else {
        seen.add(id);
      }
      state.captured = [...captured];
      state.pokedexSeen = [...seen];
      scheduleSave();
      render();
    } else if (action === "breeding-mode") {
      ui.breedingMode = target.dataset.mode === "egg-group" ? "egg-group" : "pokemon";
      ui.breedingLimit = 96;
      render();
    } else if (action === "breeding-egg-group") {
      ui.breedingEggGroup = eggGroups.includes(target.dataset.group) ? target.dataset.group : "";
      ui.breedingGroupSearch = "";
      ui.breedingLimit = 96;
      render();
    } else if (action === "ev-stat") {
      if (EV_STATS.some(stat => stat.key === target.dataset.stat)) ui.evStat = target.dataset.stat;
      ui.evLimit = 96;
      render();
    } else if (action === "home-open-view") {
      activeView = target.dataset.view || "home";
      if (target.dataset.dropMode) ui.dropMode = target.dataset.dropMode;
      if (target.dataset.ownedMode) ui.ownedMode = target.dataset.ownedMode;
      render();
    } else if (action === "home-sync") {
      syncConfiguredPlayerData();
    } else if (action === "drop-mode") {
      ui.dropMode = target.dataset.mode === "coverage" ? "coverage" : "catalog";
      ui.dropLimit = 120;
      render();
    } else if (action.endsWith("-more")) {
      const key = { "pokedex-more": "pokedexLimit", "drops-more": "dropLimit", "baits-more": "baitLimit", "berries-more": "berryLimit", "ev-more": "evLimit", "breeding-more": "breedingLimit", "counters-more": "counterLimit", "owned-more": "ownedLimit" }[action];
      if (key) ui[key] += key === "dropLimit" ? 120 : 96;
      render();
    } else if (action === "owned-mode") {
      ui.ownedMode = ["collection", "farms", "teams"].includes(target.dataset.mode) ? target.dataset.mode : "collection";
      if (ui.ownedTag === "farm" && ui.ownedMode !== "farms") ui.ownedTag = "all";
      teamFormExpanded = false;
      editingTeamId = "";
      teamDraftInstanceIds = [];
      teamDraftName = "";
      teamDraftNotes = "";
      render();
    } else if (action === "owned-open") {
      openOwnedPokemonModal(target.dataset.instance);
    } else if (action === "owned-toggle-tag") {
      event.stopPropagation();
      const scrollTop = document.scrollingElement?.scrollTop || 0;
      const instanceId = target.dataset.instance;
      const tagId = target.dataset.tag;
      const enabled = !hasPokemonTag(instanceId, tagId);
      setPokemonTag(instanceId, tagId, enabled);
      if (tagId === "farm" && enabled) teamDraftInstanceIds = teamDraftInstanceIds.filter(id => id !== instanceId);
      scheduleSave();
      render();
      requestAnimationFrame(() => window.scrollTo({ top: scrollTop }));
    } else if (action === "owned-create-tag") {
      const tag = createCustomPokemonTag(prompt("Nome da nova tag (ex.: Raid, PvP ou Breeding):", ""));
      if (tag) { scheduleSave(); render(); }
    } else if (action === "owned-delete-tag") {
      const tag = pokemonTagDefinition(target.dataset.tag);
      if (tag && confirm(`Excluir a tag “${tag.name}” de todos os Pokémon?`)) {
        deleteCustomPokemonTag(tag.id);
        scheduleSave();
        render();
      }
    } else if (action === "owned-mark-species-farm") {
      const pokemonId = target.dataset.pokemon;
      const matching = ownedPokemonEntries().filter(entry => resolveServerPokemon(entry.species)?.id === pokemonId);
      matching.forEach(entry => setPokemonTag(entry.instanceId, "farm", true));
      teamDraftInstanceIds = teamDraftInstanceIds.filter(id => !matching.some(entry => entry.instanceId === id));
      scheduleSave();
      render();
    } else if (action === "owned-toggle-team") {
      event.stopPropagation();
      const instanceId = target.dataset.instance;
      const index = teamDraftInstanceIds.indexOf(instanceId);
      if (index >= 0) teamDraftInstanceIds.splice(index, 1);
      else if (teamDraftInstanceIds.length < 6) teamDraftInstanceIds.push(instanceId);
      else alert("Um time pode ter no máximo seis Pokémon.");
      render();
    } else if (action === "team-open-form") {
      teamFormExpanded = true; editingTeamId = ""; teamDraftInstanceIds = []; teamDraftName = ""; teamDraftNotes = ""; render();
    } else if (action === "team-close-form" || action === "team-cancel-edit") {
      teamFormExpanded = false; editingTeamId = ""; teamDraftInstanceIds = []; teamDraftName = ""; teamDraftNotes = ""; render();
    } else if (action === "team-edit") {
      editingTeamId = target.dataset.team;
      teamFormExpanded = true;
      const team = state.teams.find(item => item.id === editingTeamId);
      teamDraftName = team?.name || "";
      teamDraftNotes = team?.notes || "";
      const entries = usableOwnedPokemonEntries();
      const used = new Set();
      teamDraftInstanceIds = (team?.members || []).map((member, index) => {
        const saved = team.memberInstances?.[index];
        if (saved && entries.some(entry => entry.instanceId === saved)) { used.add(saved); return saved; }
        const match = entries.find(entry => !used.has(entry.instanceId) && resolveServerPokemon(entry.species)?.id === member);
        if (match) used.add(match.instanceId);
        return match?.instanceId || null;
      }).filter(Boolean);
      render();
    } else if (action === "team-delete") {
      const team = state.teams.find(item => item.id === target.dataset.team);
      if (team && confirm(`Excluir o time “${team.name}”?`)) { state.teams = state.teams.filter(item => item.id !== team.id); scheduleSave(); render(); }
    } else if (action === "team-save") {
      saveTeamFromForm();
    } else if (action === "counter-select-target") {
      const pokemon = pokemonById.get(target.dataset.pokemon);
      if (pokemon) {
        ui.counterBoss = pokemon.name;
        ui.counterTypes.clear();
        ui.counterLimit = 80;
        render();
      }
    } else if (action === "counter-type") {
      const type = target.dataset.type;
      ui.counterTypes.has(type) ? ui.counterTypes.delete(type) : ui.counterTypes.size < 2 && ui.counterTypes.add(type);
      ui.counterBoss = ""; render();
    } else if (action === "counter-matchup-mode") {
      ui.counterMatchupMode = target.dataset.mode === "boss" ? "boss" : "against";
      render();
    } else if (action === "counter-effective-only") {
      ui.counterEffectiveOnly = !ui.counterEffectiveOnly;
      render();
    } else if (action === "gym-region") {
      ui.gymRegion = target.dataset.region; render();
    } else if (action === "gym-open") {
      const gym = DATA.gyms.find(item => item.id === target.dataset.gym);
      if (gym) openGymModal(gym);
    } else if (action === "extra-location-open") {
      const location = (DATA.extraLocations || []).find(item => item.id === target.dataset.location);
      if (location) openExtraLocationModal(location);
    } else if (action === "gym-complete") {
      const completed = new Set(state.gymCompleted);
      completed.has(target.dataset.gym) ? completed.delete(target.dataset.gym) : completed.add(target.dataset.gym);
      state.gymCompleted = [...completed]; scheduleSave(); render();
    } else if (action === "export-state") {
      downloadJson(`cobbleverse-companion-v2-${new Date().toISOString().slice(0, 10)}.json`, { app: "Cobbleverse Companion", version: 2, exportedAt: new Date().toISOString(), state });
    } else if (action === "import-state") {
      backupFileInput.click();
    } else if (action === "export-v1") {
      const snapshot = getV1Snapshot();
      if (snapshot) downloadJson(`pixelmon-pokelist-v1-backup-${new Date().toISOString().slice(0, 10)}.json`, snapshot);
    } else if (action === "reset-state") {
      if (confirm("Resetar apenas os dados v2 do Cobbleverse? O backup da v1 será mantido.")) { state = createEmptyState(); applyPreferences(); saveState(); render(); }
    } else if (action === "check-update") {
      checkForAppUpdateManually();
    } else if (action === "sftp-connect") {
      await connectToSftpServer();
    } else if (action === "sftp-forget") {
      await forgetSftpProfile();
    } else if (action === "toggle-theme") {
      toggleTheme();
    } else if (action === "toggle-density") {
      state.preferences.density = state.preferences.density === "compact" ? "comfortable" : "compact"; applyPreferences(); scheduleSave(); render();
    }
  }

  function saveTeamFromForm() {
    const name = document.querySelector("#team-name")?.value.trim() || teamDraftName.trim() || "Time sem nome";
    const entries = usableOwnedPokemonEntries();
    const selected = teamDraftInstanceIds.map(instanceId => entries.find(entry => entry.instanceId === instanceId)).filter(Boolean);
    const members = selected.map(entry => resolveServerPokemon(entry.species)).filter(Boolean).map(pokemon => pokemon.id);
    const notes = document.querySelector("#team-notes")?.value.trim() || teamDraftNotes.trim() || "";
    if (!members.length) { alert("Escolha pelo menos um Pokémon para o time."); return; }
    if (editingTeamId) {
      const index = state.teams.findIndex(team => team.id === editingTeamId);
      if (index >= 0) state.teams[index] = sanitizeTeam({ id: editingTeamId, name, members, memberInstances: selected.map(entry => entry.instanceId), notes });
    } else {
      state.teams.push(sanitizeTeam({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, name, members, memberInstances: selected.map(entry => entry.instanceId), notes }));
    }
    editingTeamId = ""; teamFormExpanded = false; teamDraftInstanceIds = []; teamDraftName = ""; teamDraftNotes = ""; scheduleSave(); render();
  }

  function handleContentInput(event) {
    const target = event.target;
    if (target.matches("input.input")) updateTextInputControls(target, true);
    if (target.id === "team-name") { teamDraftName = target.value; return; }
    if (target.id === "team-notes") { teamDraftNotes = target.value; return; }
    if (target.id === "sftp-player-name") {
      sftpPlayerName = target.value;
      localStorage.setItem(SFTP_PLAYER_NAME_KEY, sftpPlayerName);
      updateChrome();
      return;
    }
    const mapping = {
      "pokedex-search": "pokedexSearch", "drop-search": "dropSearch", "bait-search": "baitSearch", "berry-search": "berrySearch", "ev-search": "evSearch",
      "breeding-a": "breedingA", "breeding-b": "breedingB", "breeding-search": "breedingSearch", "breeding-group-search": "breedingGroupSearch",
      "counter-boss": "counterBoss", "counter-search": "counterSearch", "owned-search": "ownedSearch"
    };
    const key = mapping[target.id];
    if (!key) return;
    ui[key] = target.value;
    if (key.endsWith("Search")) {
      const limitKey = { pokedexSearch: "pokedexLimit", dropSearch: "dropLimit", baitSearch: "baitLimit", berrySearch: "berryLimit", evSearch: "evLimit", breedingSearch: "breedingLimit", breedingGroupSearch: "breedingLimit", counterSearch: "counterLimit", ownedSearch: "ownedLimit" }[key];
      if (limitKey) ui[limitKey] = limitKey === "dropLimit" ? 120 : 96;
    }
    rerenderPreservingFocus();
  }

  function handleContentChange(event) {
    const target = event.target;
    const mapping = { "pokedex-type": "pokedexType", "pokedex-generation": "pokedexGeneration", "drop-sort": "dropSort", "drop-coverage": "dropCoverage", "bait-category": "baitCategory", "berry-source": "berrySource", "ev-yield": "evYield", "ev-rarity": "evRarity", "counter-tag": "counterTag", "owned-type": "ownedType", "owned-location": "ownedLocation", "owned-tag": "ownedTag", "owned-sort": "ownedSort" };
    if (mapping[target.id]) {
      ui[mapping[target.id]] = target.value;
      if (target.id === "pokedex-type" || target.id === "pokedex-generation") ui.pokedexLimit = 96;
      if (target.id === "ev-yield" || target.id === "ev-rarity") ui.evLimit = 96;
      if (target.id === "counter-tag") ui.counterLimit = 80;
      if (target.id.startsWith("owned-")) ui.ownedLimit = 120;
      render();
      return;
    }
    if (target.id === "ev-spawn-only") { ui.evSpawnOnly = target.checked; ui.evLimit = 96; render(); }
    if (target.id === "drop-farmable") { ui.dropFarmableOnly = target.checked; render(); }
    if (target.id === "counter-captured") { ui.counterCapturedOnly = target.checked; render(); }
    if (target.id === "counter-pc") { ui.counterPcOnly = target.checked; render(); }
    if (target.id === "owned-shiny") { ui.ownedShiny = target.checked; ui.ownedLimit = 120; render(); }
  }

  async function importBackupFile(file) {
    try {
      const parsed = JSON.parse(await file.text());
      state = sanitizeState(parsed.state || parsed);
      applyPreferences();
      await saveState();
      render();
    } catch (error) {
      alert(`Backup inválido: ${error.message || error}`);
    } finally {
      backupFileInput.value = "";
    }
  }

  function bindEvents() {
    document.querySelector("#main-nav").addEventListener("click", event => {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      activeView = button.dataset.view;
      render();
    });
    document.querySelector("#theme-toggle").addEventListener("click", toggleTheme);
    document.querySelector("#server-player-sync").addEventListener("click", syncConfiguredPlayerData);
    content.addEventListener("click", handleContentClick);
    content.addEventListener("input", handleContentInput);
    content.addEventListener("change", handleContentChange);
    content.addEventListener("focusin", event => {
      if (event.target.matches("input.input")) updateTextInputControls(event.target, true);
    });
    content.addEventListener("focusout", event => {
      const wrapper = event.target.closest?.(".clearable-input");
      if (!wrapper) return;
      window.setTimeout(() => {
        if (wrapper.contains(document.activeElement)) return;
        const menu = wrapper.querySelector(".autocomplete-menu");
        if (menu) menu.hidden = true;
      }, 0);
    });
    content.addEventListener("keydown", event => {
      if (event.target.matches("input.input")) {
        const input = event.target;
        const menu = input.closest(".clearable-input")?.querySelector(".autocomplete-menu");
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          if (menu?.hidden) updateTextInputControls(input, true);
          if (moveAutocompleteSelection(input, event.key === "ArrowDown" ? 1 : -1)) event.preventDefault();
          return;
        }
        if (event.key === "Enter" && menu && !menu.hidden) {
          const selected = menu.querySelector(".autocomplete-option.is-active") || menu.querySelector(".autocomplete-option");
          if (selected) {
            event.preventDefault();
            selectAutocompleteValue(input, selected.dataset.autocompleteValue);
          }
          return;
        }
        if (event.key === "Escape" && menu) {
          menu.hidden = true;
          event.preventDefault();
          return;
        }
      }
      if (event.key !== "Enter" || !event.target.matches("[data-action='open-pokemon']")) return;
      event.preventDefault();
      const pokemon = pokemonById.get(event.target.dataset.pokemon);
      if (pokemon) renderPokemonModal(pokemon);
    });
    modal.addEventListener("error", event => {
      const image = event.target.closest?.(".extra-location-preview-image");
      if (!image) return;
      image.hidden = true;
      const fallback = image.parentElement?.querySelector(".extra-location-preview-fallback");
      if (fallback) fallback.hidden = false;
    }, true);
    modal.addEventListener("click", event => {
      const tagToggle = event.target.closest("[data-owned-modal-tag]");
      if (tagToggle) {
        event.preventDefault();
        const instanceId = tagToggle.dataset.instance;
        const tagId = tagToggle.dataset.ownedModalTag;
        const enabled = !hasPokemonTag(instanceId, tagId);
        const scrollTop = modal.querySelector(".modal-panel")?.scrollTop || 0;
        setPokemonTag(instanceId, tagId, enabled);
        if (tagId === "farm" && enabled) teamDraftInstanceIds = teamDraftInstanceIds.filter(id => id !== instanceId);
        scheduleSave();
        render();
        openOwnedPokemonModal(instanceId);
        requestAnimationFrame(() => modal.querySelector(".modal-panel")?.scrollTo({ top: scrollTop }));
        return;
      }
      const createTagButton = event.target.closest("[data-owned-modal-create-tag]");
      if (createTagButton) {
        event.preventDefault();
        const tag = createCustomPokemonTag(prompt("Nome da nova tag (ex.: Raid, PvP ou Breeding):", ""));
        if (tag) {
          setPokemonTag(createTagButton.dataset.instance, tag.id, true);
          scheduleSave();
          render();
          openOwnedPokemonModal(createTagButton.dataset.instance);
        }
        return;
      }
      const profileLink = event.target.closest("[data-profile-pokemon]");
      if (profileLink) {
        event.preventDefault();
        const pokemon = pokemonById.get(profileLink.dataset.profilePokemon);
        if (pokemon) {
          renderPokemonModal(pokemon);
          modal.querySelector(".modal-panel")?.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }
      const externalLink = event.target.closest("[data-external-url]");
      if (externalLink) {
        event.preventDefault();
        openExternalUrl(externalLink.dataset.externalUrl);
        return;
      }
      if (event.target.closest("[data-close-modal]")) modal.hidden = true;
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !modal.hidden) modal.hidden = true; });
    backupFileInput.addEventListener("change", () => { if (backupFileInput.files?.[0]) importBackupFile(backupFileInput.files[0]); });
  }

  function fillDatalists() {
    const pokemonOptions = DATA.pokemon.map(pokemon => `<option value="${escapeHtml(pokemon.name)}">#${String(pokemon.dex).padStart(4, "0")}</option>`).join("");
    document.querySelector("#pokemon-options").innerHTML = pokemonOptions;
    document.querySelector("#bait-options").innerHTML = `${pokemonOptions}${DATA.baits.map(bait => `<option value="${escapeHtml(baitName(bait))}">${escapeHtml(bait.item)}</option>`).join("")}`;
    const items = [...new Set(dropRows.map(row => row.item))].sort((left, right) => left.localeCompare(right));
    document.querySelector("#drop-options").innerHTML = `${pokemonOptions}${items.map(item => `<option value="${escapeHtml(humanizeId(item))}">${escapeHtml(item)}</option>`).join("")}`;
    document.querySelector("#berry-options").innerHTML = DATA.berries.map(berry => `<option value="${escapeHtml(berry.name)}">${escapeHtml(berry.source)}</option>`).join("");
    document.querySelector("#counter-options").innerHTML = `${pokemonOptions}${ALL_TYPES.map(type => `<option value="${escapeHtml(humanizeId(type))}">Tipo</option>`).join("")}`;
  }

  async function init() {
    backupLegacyLocalStorage();
    state = await loadState();
    await loadSftpProfileStatus();
    applyPreferences();
    fillDatalists();
    bindEvents();
    render();
  }

  init().catch(error => {
    console.error(error);
    content.innerHTML = renderEmpty("Falha ao iniciar o app", error.message || String(error));
  });
})();

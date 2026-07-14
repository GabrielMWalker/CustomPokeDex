(() => {
  "use strict";

  const DATA = window.COBBLEVERSE_DATA;
  if (!DATA?.pokemon?.length) {
    document.body.innerHTML = "<main style='padding:32px;font-family:system-ui'><h1>Dados do Cobbleverse não carregados</h1><p>Execute scripts/generate-cobbleverse-data.ps1 e reabra o app.</p></main>";
    return;
  }

  const APP_STATE_KEY = "cobbleverse-companion-state-v2";
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
  const VIEW_COPY = {
    pokedex: ["Guia do modpack", "Pokédex Cobbleverse", "Espécies, spawns, evoluções e informações da versão instalada."],
    drops: ["Pasture farms", "Drops de Pokémon", "Pesquise pelo item que quer farmar ou pelo Pokémon que pode produzi-lo."],
    baits: ["Poké Snacks e pesca", "Baits e perks", "Descubra qual berry ou ingrediente favorece cada Pokémon e o efeito exato do perk."],
    berries: ["Agricultura", "Berries e crossplanting", "Todas as berries naturais e mutações, com pais, mulch e tempo de cultivo."],
    breeding: ["Compatibilidade", "Breeding", "Compatibilidade por Egg Group; calculadora e fragmentos foram removidos."],
    teams: ["Planejamento", "Times", "Monte e consulte seus times salvos para batalhas e exploração."],
    counters: ["Matchup elemental", "Counters", "Ranking por tipos e atributos, sem qualquer lógica de escudo."],
    gyms: ["Progressão regional", "Ginásios", "Ordem, bioma, mapas localizadores, recomendações e equipes oficiais do pack."],
    settings: ["Dados locais", "Configurações", "Backup, restauração, aparência e preservação da v1 do app."]
  };

  const pokemonById = new Map(DATA.pokemon.map(pokemon => [pokemon.id, pokemon]));
  const pokemonByName = new Map(DATA.pokemon.map(pokemon => [normalize(pokemon.name), pokemon]));
  const dropRows = DATA.pokemon.flatMap(pokemon => pokemon.drops.map(drop => ({ pokemon, ...drop })));
  const eggGroups = [...new Set(DATA.pokemon.flatMap(pokemon => pokemon.eggGroups || []))].sort((left, right) => humanizeId(left).localeCompare(humanizeId(right)));
  const eggGroupCounts = new Map(eggGroups.map(group => [group, DATA.pokemon.filter(pokemon => pokemon.eggGroups.includes(group)).length]));
  const teamPokemonIds = () => new Set(state.teams.flatMap(team => team.members));
  const content = document.querySelector("#content");
  const viewKicker = document.querySelector("#view-kicker");
  const viewTitle = document.querySelector("#view-title");
  const viewDescription = document.querySelector("#view-description");
  const headerMeta = document.querySelector("#header-meta");
  const modal = document.querySelector("#pokemon-modal");
  const modalContent = document.querySelector("#modal-content");
  const backupFileInput = document.querySelector("#backup-file-input");

  let activeView = "pokedex";
  let state = createEmptyState();
  let saveTimer = 0;
  let teamFormExpanded = false;
  let editingTeamId = "";
  let expandedGymId = "";
  let updateCheckInProgress = false;
  let updateInstallInProgress = false;
  let updateStatus = "";
  let pokedexAutoLoadObserver = null;
  const ui = {
    pokedexSearch: "", pokedexType: "", pokedexGeneration: "", pokedexLimit: 96,
    dropSearch: "", dropFarmableOnly: true, dropSort: "pokemon", dropLimit: 120,
    baitSearch: "", baitCategory: "all", baitLimit: 100,
    berrySearch: "", berrySource: "all", berryLimit: 100,
    breedingMode: "pokemon", breedingA: "", breedingB: "", breedingSearch: "", breedingEggGroup: "", breedingGroupSearch: "", breedingLimit: 96,
    counterBoss: "", counterTypes: new Set(), counterSearch: "", counterCapturedOnly: false, counterTeamsOnly: false, counterLimit: 80,
    gymRegion: "Kanto"
  };

  function createEmptyState() {
    return {
      schemaVersion: 2,
      captured: [],
      teams: [],
      gymCompleted: [],
      gymNotes: {},
      preferences: { theme: "light", density: "comfortable" }
    };
  }

  function sanitizeState(value) {
    const fresh = createEmptyState();
    if (!value || typeof value !== "object") return fresh;
    return {
      schemaVersion: 2,
      captured: [...new Set(Array.isArray(value.captured) ? value.captured.filter(id => pokemonById.has(id)) : [])],
      teams: Array.isArray(value.teams) ? value.teams.map(sanitizeTeam).filter(Boolean) : [],
      gymCompleted: [...new Set(Array.isArray(value.gymCompleted) ? value.gymCompleted : [])],
      gymNotes: value.gymNotes && typeof value.gymNotes === "object" ? value.gymNotes : {},
      preferences: {
        theme: value.preferences?.theme === "dark" ? "dark" : "light",
        density: value.preferences?.density === "compact" ? "compact" : "comfortable"
      }
    };
  }

  function sanitizeTeam(team) {
    if (!team || typeof team !== "object") return null;
    const members = Array.isArray(team.members) ? team.members.filter(id => pokemonById.has(id)).slice(0, 6) : [];
    return {
      id: String(team.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`),
      name: String(team.name || "Time sem nome").trim().slice(0, 80),
      members,
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

  function captureSet() { return new Set(state.captured); }

  function applyPreferences() {
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
    document.querySelector("#nav-teams-count").textContent = state.teams.length;
    document.querySelector("#nav-gyms-count").textContent = `${state.gymCompleted.length}/${DATA.gyms.length}`;
    headerMeta.innerHTML = `<span class="meta-pill">${escapeHtml(DATA.metadata.modpackVersion)}</span><span class="meta-pill">Cobblemon ${escapeHtml(DATA.metadata.cobblemonVersion)}</span>`;
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
    });
  }

  function render() {
    pokedexAutoLoadObserver?.disconnect();
    pokedexAutoLoadObserver = null;
    updateChrome();
    content.innerHTML = "";
    ({
      pokedex: renderPokedex,
      drops: renderDrops,
      baits: renderBaits,
      berries: renderBerries,
      breeding: renderBreeding,
      teams: renderTeams,
      counters: renderCounters,
      gyms: renderGyms,
      settings: renderSettings
    })[activeView]();
  }

  function renderPokedex() {
    const query = normalize(ui.pokedexSearch);
    const captured = captureSet();
    const filtered = DATA.pokemon.filter(pokemon => {
      if (ui.pokedexType && !pokemon.types.includes(ui.pokedexType)) return false;
      if (ui.pokedexGeneration && generationOf(pokemon) !== Number(ui.pokedexGeneration)) return false;
      if (!query) return true;
      return normalize(`${pokemon.dex} ${pokemon.name} ${pokemon.types.join(" ")} ${pokemon.abilities.join(" ")}`).includes(query);
    });
    const visible = filtered.slice(0, ui.pokedexLimit);
    content.innerHTML = `
      <div class="toolbar">
        <label class="field"><span>Buscar Pokémon</span><input class="input" id="pokedex-search" list="pokemon-options" value="${escapeHtml(ui.pokedexSearch)}" placeholder="Nome, número, habilidade..."></label>
        <label class="field"><span>Tipo</span><select class="select" id="pokedex-type"><option value="">Todos</option>${ALL_TYPES.map(type => `<option value="${type}"${ui.pokedexType === type ? " selected" : ""}>${humanizeId(type)}</option>`).join("")}</select></label>
        <label class="field"><span>Geração</span><select class="select" id="pokedex-generation"><option value="">Todas</option>${Array.from({ length: 9 }, (_, index) => `<option value="${index + 1}"${String(index + 1) === ui.pokedexGeneration ? " selected" : ""}>Geração ${index + 1}</option>`).join("")}</select></label>
      </div>
      <div class="info-banner"><div><strong>${filtered.length} espécies encontradas</strong><p>${captured.size} marcadas nesta nova base do Cobbleverse. Os dados da v1 não foram misturados.</p></div><div class="info-stat"><b>${DATA.metadata.speciesCount}</b><span>espécies do pack</span></div></div>
      <div class="pokemon-grid">${visible.map(pokemon => renderPokemonCard(pokemon, captured)).join("")}</div>
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

  function renderPokemonCard(pokemon, captured) {
    const isCaptured = captured.has(pokemon.id);
    return `<article class="pokemon-card" data-action="open-pokemon" data-pokemon="${pokemon.id}" tabindex="0">
      <button class="capture-toggle${isCaptured ? " is-captured" : ""}" data-action="toggle-captured" data-pokemon="${pokemon.id}" type="button" aria-label="${isCaptured ? "Desmarcar" : "Marcar"} ${escapeHtml(pokemon.name)}">${isCaptured ? "✓" : "+"}</button>
      <div class="pokemon-image-wrap"><img class="pokemon-image" src="${pokemonImage(pokemon)}" alt="" loading="lazy"></div>
      <div class="pokemon-card-body"><span class="pokemon-number">#${String(pokemon.dex).padStart(4, "0")} · Gen ${generationOf(pokemon)}</span><h3 class="pokemon-name">${escapeHtml(pokemon.name)}</h3><div class="type-row">${pokemon.types.map(typePill).join("")}</div><div class="badge-row"><span class="badge is-muted">${pokemon.spawns.length} spawns</span><span class="badge is-muted">${pokemon.drops.filter(drop => !drop.pastureBlocked).length} drops</span></div></div>
    </article>`;
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

  function renderPokemonModal(pokemon) {
    const stats = pokemon.stats || {};
    const spawnHtml = pokemon.spawns.length ? pokemon.spawns.map(spawn => {
      const conditions = [...flattenCondition(spawn.condition), ...flattenCondition(spawn.anticondition).map(value => `Não ${value}`)];
      return `<div class="spawn-entry"><div class="badge-row"><span class="badge">${escapeHtml(humanizeId(spawn.bucket || "desconhecido"))}</span><span class="badge is-muted">Nível ${escapeHtml(spawn.level || "?")}</span><span class="badge is-muted">Peso ${escapeHtml(spawn.weight ?? "?")}</span><span class="badge is-muted">${escapeHtml(humanizeId(spawn.position || spawn.context || "mundo"))}</span></div><p>${conditions.map(escapeHtml).join(" · ") || "Sem condição adicional declarada."}</p></div>`;
    }).join("") : "<p class='section-note'>Sem spawn natural no datapack; pode exigir estrutura, altar, evento ou invocação.</p>";
    const evolutionHtml = pokemon.evolutions.length ? pokemon.evolutions.map(evolution => `<li><strong>${escapeHtml(humanizeId(evolution.result))}</strong><br>${evolution.requirements.map(formatRequirement).map(escapeHtml).join("<br>") || escapeHtml(humanizeId(evolution.variant))}</li>`).join("") : "<li>Não evolui para outra espécie.</li>";
    const dropHtml = pokemon.drops.length ? pokemon.drops.map(drop => `<li><strong>${escapeHtml(humanizeId(drop.item))}</strong> · ${formatPercent(drop.percentage)} · qtd. ${escapeHtml(drop.quantity)}${drop.pastureBlocked ? " <span class='badge is-danger'>bloqueado no Pasture</span>" : ""}</li>`).join("") : "<li>Nenhum drop declarado.</li>";
    modalContent.innerHTML = `
      <div class="modal-hero"><img src="${pokemonImage(pokemon)}" alt=""><div><p class="eyebrow">#${String(pokemon.dex).padStart(4, "0")} · Geração ${generationOf(pokemon)}</p><h2 id="modal-title">${escapeHtml(pokemon.name)}</h2><div class="type-row">${pokemon.types.map(typePill).join("")}</div><p class="view-description">Habilidades: ${pokemon.abilities.map(ability => escapeHtml(humanizeId(ability.replace(/^h:/, "HA ")))).join(", ") || "—"}</p></div></div>
      <div class="stats-grid">${[["HP", stats.hp], ["Ataque", stats.attack], ["Defesa", stats.defence], ["Sp. Atk", stats.special_attack], ["Sp. Def", stats.special_defence], ["Velocidade", stats.speed]].map(([label, value]) => `<div class="stat-box"><b>${value ?? "—"}</b><span>${label}</span></div>`).join("")}</div>
      <div class="detail-columns" style="margin-top:14px">
        <section class="detail-section"><h3>Informações</h3><ul class="detail-list"><li>Egg Groups: ${pokemon.eggGroups.map(humanizeId).join(", ") || "—"}</li><li>Catch rate: ${pokemon.catchRate ?? "—"}</li><li>Altura: ${pokemon.height ? `${pokemon.height / 10} m` : "—"} · Peso: ${pokemon.weight ? `${pokemon.weight / 10} kg` : "—"}</li><li>Pré-evolução: ${pokemon.preEvolution ? humanizeId(pokemon.preEvolution) : "—"}</li></ul></section>
        <section class="detail-section"><h3>Evoluções</h3><ul class="detail-list">${evolutionHtml}</ul></section>
        <section class="detail-section"><h3>Drops</h3><ul class="detail-list">${dropHtml}</ul></section>
        <section class="detail-section"><h3>EV Yield</h3><ul class="detail-list">${Object.entries(pokemon.evYield || {}).filter(([, value]) => value > 0).map(([key, value]) => `<li>${humanizeId(key)}: +${value}</li>`).join("") || "<li>Nenhum EV declarado.</li>"}</ul></section>
        <section class="detail-section is-wide"><h3>Spawns exatos do Cobbleverse</h3>${spawnHtml}</section>
      </div>`;
    modal.hidden = false;
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${number.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  }

  function renderDrops() {
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
    return `<article class="bait-card"><p class="card-kicker">${escapeHtml(humanizeId(bait.category))}</p><h3 class="card-title">${escapeHtml(baitName(bait))}</h3><p class="card-subtitle">${escapeHtml(bait.item)}</p>${bait.recommendation ? `<div class="badge-row" style="margin-top:9px">${bait.recommendation.reasons.map(reason => `<span class="badge">${escapeHtml(reason)}</span>`).join("")}</div>` : ""}<ul class="effect-list">${bait.effects.map(effect => `<li>${escapeHtml(formatBaitEffect(effect))}</li>`).join("")}</ul></article>`;
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
        <label class="field"><span>Berry, pai ou mulch</span><input class="input" id="berry-search" value="${escapeHtml(ui.berrySearch)}" placeholder="Ex.: Enigma, Oran, Humid..."></label>
        <label class="field"><span>Origem</span><select class="select" id="berry-source"><option value="all"${ui.berrySource === "all" ? " selected" : ""}>Todas</option><option value="natural"${ui.berrySource === "natural" ? " selected" : ""}>Naturais (30)</option><option value="mutation"${ui.berrySource === "mutation" ? " selected" : ""}>Crossplanting (40)</option></select></label>
        <div class="info-stat"><b>${berries.length}</b><span>berries</span></div>
      </div>
      <div class="berry-grid">${visible.map(renderBerryCard).join("")}</div>
      ${visible.length < berries.length ? `<button class="secondary-button load-more" data-action="berries-more" type="button">Mostrar mais</button>` : ""}`;
  }

  function renderBerryCard(berry) {
    const mutation = berry.mutation;
    const formula = mutation ? `<div class="mutation-formula"><span class="berry-node">${escapeHtml(mutation.parentA)} Berry</span><span class="mutation-symbol">+</span><span class="berry-node" title="${escapeHtml(mutation.parentBOptions.join(", "))}">${escapeHtml(mutation.parentBOptions.length > 1 ? `${mutation.parentBOptions.length} opções` : `${mutation.parentBOptions[0]} Berry`)}</span><span class="mutation-symbol mutation-arrow">→</span><span class="berry-node mutation-result">${escapeHtml(berry.name)}</span></div>` : "";
    return `<article class="berry-card"><p class="card-kicker">${berry.source === "natural" ? "Natural" : "Crossplanting"}</p><h3 class="card-title">${escapeHtml(berry.name)}</h3>${mutation ? `${formula}<div class="badge-row"><span class="badge">${escapeHtml(mutation.mulch)} Mulch</span><span class="badge is-muted">Yield ${escapeHtml(mutation.yield)}</span><span class="badge is-muted">${mutation.matureMinutes} min</span></div><p class="card-subtitle">Segundo pai: ${escapeHtml(mutation.parentBOptions.map(name => `${name} Berry`).join(" ou "))}. Reposição em ${mutation.replenishMinutes} min.</p>` : `<p class="card-subtitle">Encontrada naturalmente no mundo e usada como base para mutações.</p>`}${berry.baitEffects.length ? `<div class="card-divider"></div><ul class="effect-list">${berry.baitEffects.map(effect => `<li>${escapeHtml(formatBaitEffect(effect))}</li>`).join("")}</ul>` : ""}</article>`;
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
      ${left ? `<div class="section-heading"><div><h3>Compatíveis com ${escapeHtml(left.name)}</h3><p>${left.eggGroups.map(humanizeId).join(" · ") || "Sem Egg Group"}</p></div></div><div class="toolbar"><label class="field"><span>Filtrar compatíveis</span><input class="input" id="breeding-search" value="${escapeHtml(ui.breedingSearch)}" placeholder="Nome ou Egg Group"></label><div class="info-stat"><b>${compatible.length}</b><span>espécies</span></div></div>${visible.length ? `<div class="compatibility-grid">${visible.map(pokemon => `<article class="compatibility-card"><p class="card-kicker">#${String(pokemon.dex).padStart(4, "0")}</p><h3 class="card-title">${escapeHtml(pokemon.name)}</h3><p class="card-subtitle">${escapeHtml(breedingCompatibility(left, pokemon).reason)}</p><div class="type-row" style="margin-top:9px">${pokemon.types.map(typePill).join("")}</div></article>`).join("")}</div>` : renderEmpty("Nenhum compatível", "Revise o Pokémon ou o filtro informado.")}${visible.length < compatible.length ? `<button class="secondary-button load-more" data-action="breeding-more" type="button">Mostrar mais</button>` : ""}` : renderEmpty("Escolha o primeiro Pokémon", "A lista de espécies compatíveis aparecerá aqui.")}`;
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
    if (query) groupedPokemon = groupedPokemon.filter(pokemon => normalize(`${pokemon.dex} ${pokemon.name} ${pokemon.types.join(" ")} ${pokemon.eggGroups.join(" ")}`).includes(query));
    const visible = groupedPokemon.slice(0, ui.breedingLimit);
    const specialNote = selectedGroup === "undiscovered"
      ? "Pokémon do grupo Undiscovered não produzem ovos, mesmo entre si ou com Ditto."
      : selectedGroup === "ditto"
        ? "Ditto pode cruzar com espécies que produzem ovos, mas dois Ditto não geram ovo."
        : "O Egg Group é o primeiro filtro. Para formar um par ainda é necessário considerar gêneros compatíveis; Pokémon sem gênero normalmente precisam de Ditto.";
    return `
      <section class="panel"><h3>Filtrar por Egg Group</h3><p class="section-note">Grupos extraídos diretamente das espécies instaladas no Cobblemon ${escapeHtml(DATA.metadata.cobblemonVersion)}.</p><div class="egg-group-filter" role="list">${eggGroups.map(group => `<button class="egg-group-button${selectedGroup === group ? " is-active" : ""}" data-action="breeding-egg-group" data-group="${escapeHtml(group)}" type="button"><span>${escapeHtml(humanizeId(group))}</span><b>${eggGroupCounts.get(group)}</b></button>`).join("")}</div></section>
      ${selectedGroup ? `<div class="info-banner"><div><strong>${escapeHtml(humanizeId(selectedGroup))}</strong><p>${escapeHtml(specialNote)}</p></div><div class="info-stat"><b>${eggGroupCounts.get(selectedGroup)}</b><span>no grupo</span></div></div><div class="toolbar"><label class="field"><span>Buscar neste grupo</span><input class="input" id="breeding-group-search" value="${escapeHtml(ui.breedingGroupSearch)}" placeholder="Nome, número, tipo ou outro Egg Group"></label><div class="info-stat"><b>${groupedPokemon.length}</b><span>encontrados</span></div></div>${visible.length ? `<div class="compatibility-grid">${visible.map(pokemon => `<article class="compatibility-card"><p class="card-kicker">#${String(pokemon.dex).padStart(4, "0")} · ${escapeHtml(breedingGenderLabel(pokemon))}</p><h3 class="card-title">${escapeHtml(pokemon.name)}</h3><p class="card-subtitle">Egg Groups: ${pokemon.eggGroups.map(group => escapeHtml(humanizeId(group))).join(" · ")}</p><div class="type-row" style="margin-top:9px">${pokemon.types.map(typePill).join("")}</div></article>`).join("")}</div>` : renderEmpty("Nenhum Pokémon encontrado", "Revise a busca dentro deste Egg Group.")}${visible.length < groupedPokemon.length ? `<button class="secondary-button load-more" data-action="breeding-more" type="button">Mostrar mais</button>` : ""}` : renderEmpty("Escolha um Egg Group", "Selecione um dos grupos acima para ver todas as espécies cadastradas nele.")}`;
  }

  function renderTeamMember(pokemon) {
    return `<span class="team-member"><img src="${pokemonImage(pokemon)}" alt="" loading="lazy"><span>${escapeHtml(pokemon.name)}</span></span>`;
  }

  function renderTeams() {
    const editing = editingTeamId ? state.teams.find(team => team.id === editingTeamId) : null;
    const form = teamFormExpanded || editing ? `<section class="team-form" style="padding:16px;margin-bottom:16px"><div class="team-card-header"><div><h3 style="margin:0">${editing ? "Editar time" : "Novo time"}</h3><p class="section-note">Escolha até seis Pokémon do catálogo Cobbleverse.</p></div><button class="text-button" data-action="team-close-form" type="button">Fechar</button></div><div class="form-grid is-six" style="margin-top:14px"><label class="field" style="grid-column:1/-1"><span>Nome do time</span><input class="input" id="team-name" value="${escapeHtml(editing?.name || "")}" placeholder="Ex.: Exploração, Ginásios, Água..."></label>${Array.from({ length: 6 }, (_, index) => {
      const member = editing?.members[index] ? pokemonById.get(editing.members[index]) : null;
      return `<label class="field"><span>Slot ${index + 1}</span><input class="input team-member-input" list="pokemon-options" value="${escapeHtml(member?.name || "")}" placeholder="Pokémon"></label>`;
    }).join("")}<label class="field" style="grid-column:1/-1"><span>Observações</span><textarea class="textarea" id="team-notes" placeholder="Funções, golpes, itens, estratégia...">${escapeHtml(editing?.notes || "")}</textarea></label></div><div class="action-row" style="margin-top:12px"><button class="primary-button" data-action="team-save" type="button">${editing ? "Salvar alterações" : "Cadastrar time"}</button>${editing ? `<button class="secondary-button" data-action="team-cancel-edit" type="button">Cancelar edição</button>` : ""}</div></section>` : "";
    content.innerHTML = `
      <div class="info-banner"><div><strong>Visualização primeiro</strong><p>O cadastro começa recolhido para deixar seus times salvos em destaque.</p></div><button class="primary-button" data-action="team-open-form" type="button">${state.teams.length ? "Adicionar time" : "Cadastrar primeiro time"}</button></div>
      ${form}
      ${state.teams.length ? `<div class="team-grid">${state.teams.map(team => `<article class="team-card"><div class="team-card-header"><div><p class="card-kicker">${team.members.length}/6 Pokémon</p><h3 class="card-title">${escapeHtml(team.name)}</h3></div><div class="action-row"><button class="text-button" data-action="team-edit" data-team="${escapeHtml(team.id)}" type="button">Editar</button><button class="text-button" data-action="team-delete" data-team="${escapeHtml(team.id)}" type="button">Excluir</button></div></div><div class="team-members">${team.members.map(id => pokemonById.get(id)).filter(Boolean).map(renderTeamMember).join("")}</div>${team.notes ? `<p class="card-subtitle">${escapeHtml(team.notes)}</p>` : ""}</article>`).join("")}</div>` : renderEmpty("Nenhum time salvo", "Abra o cadastro para montar seu primeiro time no novo app.")}`;
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

  function renderCounters() {
    const boss = resolvePokemon(ui.counterBoss);
    const targetTypes = boss ? boss.types : [...ui.counterTypes];
    const query = normalize(ui.counterSearch);
    const captured = captureSet();
    const inTeams = teamPokemonIds();
    let candidates = DATA.pokemon.filter(pokemon => {
      if (!pokemon.implemented || !pokemon.types.length) return false;
      if (boss?.id === pokemon.id) return false;
      if (ui.counterCapturedOnly && !captured.has(pokemon.id)) return false;
      if (ui.counterTeamsOnly && !inTeams.has(pokemon.id)) return false;
      return !query || normalize(`${pokemon.name} ${pokemon.types.join(" ")}`).includes(query);
    });
    if (targetTypes.length) candidates = candidates.map(pokemon => ({ pokemon, ...counterScore(pokemon, targetTypes) })).sort((a, b) => b.score - a.score || a.pokemon.dex - b.pokemon.dex);
    else candidates = [];
    const visible = candidates.slice(0, ui.counterLimit);
    content.innerHTML = `
      <div class="toolbar is-wide">
        <label class="field"><span>Pokémon alvo</span><input class="input" id="counter-boss" list="pokemon-options" value="${escapeHtml(ui.counterBoss)}" placeholder="Ex.: Dragonite"></label>
        <label class="field"><span>Filtrar resultados</span><input class="input" id="counter-search" value="${escapeHtml(ui.counterSearch)}" placeholder="Nome ou tipo"></label>
        <label class="checkbox-field"><input id="counter-captured" type="checkbox"${ui.counterCapturedOnly ? " checked" : ""}> Somente marcados</label>
        <label class="checkbox-field"><input id="counter-teams" type="checkbox"${ui.counterTeamsOnly ? " checked" : ""}> Somente meus times</label>
      </div>
      <section class="panel"><h3>Ou selecione os tipos do alvo</h3><p class="section-note">O Pokémon escolhido acima substitui esta seleção. A lógica considera STAB, efetividade e atributos base; escudos não fazem parte do cálculo.</p><div class="type-row" style="margin-top:12px">${ALL_TYPES.map(type => `<button class="tab-button${ui.counterTypes.has(type) ? " is-active" : ""}" data-action="counter-type" data-type="${type}" type="button">${humanizeId(type)}</button>`).join("")}</div></section>
      ${targetTypes.length ? `<div class="info-banner"><div><strong>Alvo: ${boss ? escapeHtml(boss.name) : targetTypes.map(humanizeId).join(" / ")}</strong><p>Tipos defensivos: ${targetTypes.map(humanizeId).join(" + ")}. Ranking sem informações de moveset, habilidade ou Terastalização.</p></div><div class="type-row">${targetTypes.map(typePill).join("")}</div></div><div class="counter-grid">${visible.map(row => renderCounterCard(row)).join("")}</div>${visible.length < candidates.length ? `<button class="secondary-button load-more" data-action="counters-more" type="button">Mostrar mais</button>` : ""}` : renderEmpty("Escolha o alvo", "Busque um Pokémon ou selecione um ou dois tipos para gerar os counters.")}`;
  }

  function renderCounterCard(row) {
    const multiplierLabel = row.best.multiplier >= 4 ? "4×" : row.best.multiplier >= 2 ? "2×" : row.best.multiplier === 0 ? "0×" : `${row.best.multiplier}×`;
    return `<article class="counter-card"><img src="${pokemonImage(row.pokemon)}" alt="" loading="lazy"><div><p class="card-kicker">#${String(row.pokemon.dex).padStart(4, "0")}</p><h3 class="card-title">${escapeHtml(row.pokemon.name)}</h3><div class="type-row" style="margin-top:6px">${row.pokemon.types.map(typePill).join("")}</div><p class="card-subtitle">Melhor STAB: ${humanizeId(row.best.type)} <strong>${multiplierLabel}</strong></p></div><span class="counter-score">${Math.round(row.score)}</span></article>`;
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

  function renderGyms() {
    const gyms = DATA.gyms.filter(gym => gym.region === ui.gymRegion);
    const completed = new Set(state.gymCompleted);
    const mapTable = gyms[0]?.locatorTable || "cobbleverse:gym_map";
    content.innerHTML = `
      <div class="locator-card"><span class="locator-icon">🗺️</span><div><h3>Item localizador: Gym Map da região</h3><p>Use a <strong>Regional Cartography Table</strong> para obter o mapa de ginásio. O item técnico é <code>minecraft:map</code> e a tabela desta região é <code>${escapeHtml(mapTable)}</code>; o mapa aponta para o primeiro ginásio e a progressão fornece os próximos.</p></div></div>
      <div class="region-tabs" style="margin-bottom:16px">${["Kanto", "Johto", "Hoenn", "Sinnoh"].map(region => `<button class="tab-button${ui.gymRegion === region ? " is-active" : ""}" data-action="gym-region" data-region="${region}" type="button">${region} · ${DATA.gyms.filter(gym => gym.region === region && completed.has(gym.id)).length}/8</button>`).join("")}</div>
      <div class="gym-grid">${gyms.map(gym => renderGymCard(gym, completed.has(gym.id))).join("")}</div>`;
  }

  function renderGymCard(gym, isComplete) {
    const expanded = expandedGymId === gym.id;
    const recommendations = recommendedTypesForTeam(gym.team);
    return `<article class="gym-card${isComplete ? " is-complete" : ""}"><div class="gym-summary"><div class="gym-card-header"><span class="gym-order">${gym.order}</span><div class="gym-title"><h3>${escapeHtml(gym.leader)}</h3><p>No pack: ${escapeHtml(gym.packName)} · ${escapeHtml(humanizeId(gym.biome))}</p></div><button class="capture-toggle${isComplete ? " is-captured" : ""}" style="position:static" data-action="gym-complete" data-gym="${gym.id}" type="button" aria-label="Marcar ginásio">${isComplete ? "✓" : "+"}</button></div><div class="type-row" style="margin-top:11px">${typePill(gym.specialty)}${recommendations.map(row => `<span class="badge">Use ${escapeHtml(humanizeId(row.type))} · ${row.superCount}/${gym.team.length}</span>`).join("")}</div><div class="action-row" style="margin-top:10px"><button class="text-button" data-action="gym-toggle" data-gym="${gym.id}" type="button">${expanded ? "Ocultar equipe" : `Ver equipe oficial (${gym.team.length})`}</button></div></div>${expanded ? `<div class="gym-details"><div class="section-heading"><div><h3>Equipe oficial 1.7.31</h3><p>${escapeHtml(humanizeId(gym.battleFormat))} · até ${gym.maxItemUses ?? 0} usos de item</p></div></div><div class="official-team">${gym.team.map(renderOfficialMember).join("")}</div><label class="field" style="margin-top:12px"><span>Minhas observações / equipe encontrada</span><textarea class="textarea gym-note" data-gym="${gym.id}" placeholder="Registre mudanças, estratégia ou outro time observado...">${escapeHtml(state.gymNotes[gym.id] || "")}</textarea></label><div class="badge-row" style="margin-top:10px"><span class="badge is-muted">Estrutura ${escapeHtml(gym.structure)}</span><span class="badge is-muted">Bioma ${escapeHtml(gym.biome)}</span></div></div>` : ""}</article>`;
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

  function renderSettings() {
    const v1 = getV1Snapshot();
    const v1Count = Object.keys(v1?.values || {}).length;
    const desktop = Boolean(window.__TAURI__?.core?.invoke);
    const updateButtonLabel = updateInstallInProgress ? "Instalando..." : updateCheckInProgress ? "Buscando..." : "Buscar atualizações";
    content.innerHTML = `
      <div class="panel"><h3>Dados do novo app</h3><p>O Cobbleverse usa um banco v2 vazio e separado. Capturas, times e progresso antigos não são importados automaticamente.</p><div class="action-row"><button class="primary-button" data-action="export-state" type="button">Exportar backup v2</button><button class="secondary-button" data-action="import-state" type="button">Importar backup v2</button><button class="danger-button" data-action="reset-state" type="button">Resetar dados v2</button></div></div>
      <div class="panel"><h3>Backup preservado da v1</h3><p>O snapshot do localStorage antigo contém ${v1Count} chaves e foi criado em ${v1?.savedAt ? new Date(v1.savedAt).toLocaleString("pt-BR") : "esta instalação"}. No desktop, os arquivos antigos também são copiados para <code>backups/v1</code> antes de o banco novo ser aberto.</p><button class="secondary-button" data-action="export-v1" type="button"${v1 ? "" : " disabled"}>Baixar snapshot da v1</button></div>
      <div class="panel"><h3>Atualizações</h3><p>${updateStatus || "Busque novas versões manualmente. Instalações da v1 recebem a v2 pelo mesmo canal de atualização assinado."}</p><button class="primary-button" data-action="check-update" type="button"${!desktop || updateCheckInProgress ? " disabled" : ""}>${updateButtonLabel}</button>${desktop ? "" : `<p class="section-note">Disponível apenas no aplicativo desktop.</p>`}</div>
      <div class="panel"><h3>Aparência</h3><p>Tema atual: ${state.preferences.theme === "dark" ? "escuro" : "claro"}. Densidade: ${state.preferences.density === "compact" ? "compacta" : "confortável"}.</p><div class="action-row"><button class="secondary-button" data-action="toggle-theme" type="button">Alternar tema</button><button class="secondary-button" data-action="toggle-density" type="button">Alternar densidade</button></div></div>
      <div class="panel"><h3>Base de dados</h3><ul class="detail-list"><li>${DATA.metadata.speciesCount} espécies e ${DATA.pokemon.reduce((sum, pokemon) => sum + pokemon.spawns.length, 0)} entradas de spawn.</li><li>${dropRows.length} relações de drop; ${dropRows.filter(row => !row.pastureBlocked).length} disponíveis no Pasture.</li><li>${DATA.baits.length} baits, ${DATA.berries.length} berries e ${DATA.gyms.length} ginásios oficiais.</li><li>Fonte: ${escapeHtml(DATA.metadata.source)}.</li><li>Gerado em ${new Date(DATA.metadata.generatedAt).toLocaleString("pt-BR")}.</li></ul></div>`;
  }

  function toggleTheme() {
    state.preferences.theme = state.preferences.theme === "dark" ? "light" : "dark";
    applyPreferences();
    scheduleSave();
    render();
  }

  function handleContentClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "open-pokemon") {
      const pokemon = pokemonById.get(target.dataset.pokemon);
      if (pokemon) renderPokemonModal(pokemon);
    } else if (action === "toggle-captured") {
      event.stopPropagation();
      const captured = captureSet();
      captured.has(target.dataset.pokemon) ? captured.delete(target.dataset.pokemon) : captured.add(target.dataset.pokemon);
      state.captured = [...captured];
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
    } else if (action.endsWith("-more")) {
      const key = { "pokedex-more": "pokedexLimit", "drops-more": "dropLimit", "baits-more": "baitLimit", "berries-more": "berryLimit", "breeding-more": "breedingLimit", "counters-more": "counterLimit" }[action];
      if (key) ui[key] += key === "dropLimit" ? 120 : 96;
      render();
    } else if (action === "team-open-form") {
      teamFormExpanded = true; editingTeamId = ""; render();
    } else if (action === "team-close-form" || action === "team-cancel-edit") {
      teamFormExpanded = false; editingTeamId = ""; render();
    } else if (action === "team-edit") {
      editingTeamId = target.dataset.team; teamFormExpanded = true; render();
    } else if (action === "team-delete") {
      const team = state.teams.find(item => item.id === target.dataset.team);
      if (team && confirm(`Excluir o time “${team.name}”?`)) { state.teams = state.teams.filter(item => item.id !== team.id); scheduleSave(); render(); }
    } else if (action === "team-save") {
      saveTeamFromForm();
    } else if (action === "counter-type") {
      const type = target.dataset.type;
      ui.counterTypes.has(type) ? ui.counterTypes.delete(type) : ui.counterTypes.size < 2 && ui.counterTypes.add(type);
      ui.counterBoss = ""; render();
    } else if (action === "gym-region") {
      ui.gymRegion = target.dataset.region; expandedGymId = ""; render();
    } else if (action === "gym-toggle") {
      expandedGymId = expandedGymId === target.dataset.gym ? "" : target.dataset.gym; render();
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
    } else if (action === "toggle-theme") {
      toggleTheme();
    } else if (action === "toggle-density") {
      state.preferences.density = state.preferences.density === "compact" ? "comfortable" : "compact"; applyPreferences(); scheduleSave(); render();
    }
  }

  function saveTeamFromForm() {
    const name = document.querySelector("#team-name")?.value.trim() || "Time sem nome";
    const members = [...document.querySelectorAll(".team-member-input")].map(input => resolvePokemon(input.value)).filter(Boolean).map(pokemon => pokemon.id);
    const notes = document.querySelector("#team-notes")?.value.trim() || "";
    if (!members.length) { alert("Escolha pelo menos um Pokémon para o time."); return; }
    if (editingTeamId) {
      const index = state.teams.findIndex(team => team.id === editingTeamId);
      if (index >= 0) state.teams[index] = sanitizeTeam({ id: editingTeamId, name, members, notes });
    } else {
      state.teams.push(sanitizeTeam({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, name, members, notes }));
    }
    editingTeamId = ""; teamFormExpanded = false; scheduleSave(); render();
  }

  function handleContentInput(event) {
    const target = event.target;
    if (target.matches(".gym-note")) {
      state.gymNotes[target.dataset.gym] = target.value;
      scheduleSave();
      return;
    }
    const mapping = {
      "pokedex-search": "pokedexSearch", "drop-search": "dropSearch", "bait-search": "baitSearch", "berry-search": "berrySearch",
      "breeding-a": "breedingA", "breeding-b": "breedingB", "breeding-search": "breedingSearch", "breeding-group-search": "breedingGroupSearch",
      "counter-boss": "counterBoss", "counter-search": "counterSearch"
    };
    const key = mapping[target.id];
    if (!key) return;
    ui[key] = target.value;
    if (key.endsWith("Search")) {
      const limitKey = { pokedexSearch: "pokedexLimit", dropSearch: "dropLimit", baitSearch: "baitLimit", berrySearch: "berryLimit", breedingSearch: "breedingLimit", breedingGroupSearch: "breedingLimit", counterSearch: "counterLimit" }[key];
      if (limitKey) ui[limitKey] = limitKey === "dropLimit" ? 120 : 96;
    }
    rerenderPreservingFocus();
  }

  function handleContentChange(event) {
    const target = event.target;
    const mapping = { "pokedex-type": "pokedexType", "pokedex-generation": "pokedexGeneration", "drop-sort": "dropSort", "bait-category": "baitCategory", "berry-source": "berrySource" };
    if (mapping[target.id]) {
      ui[mapping[target.id]] = target.value;
      if (target.id === "pokedex-type" || target.id === "pokedex-generation") ui.pokedexLimit = 96;
      render();
      return;
    }
    if (target.id === "drop-farmable") { ui.dropFarmableOnly = target.checked; render(); }
    if (target.id === "counter-captured") { ui.counterCapturedOnly = target.checked; render(); }
    if (target.id === "counter-teams") { ui.counterTeamsOnly = target.checked; render(); }
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
    content.addEventListener("click", handleContentClick);
    content.addEventListener("input", handleContentInput);
    content.addEventListener("change", handleContentChange);
    content.addEventListener("keydown", event => {
      if (event.key !== "Enter" || !event.target.matches("[data-action='open-pokemon']")) return;
      event.preventDefault();
      const pokemon = pokemonById.get(event.target.dataset.pokemon);
      if (pokemon) renderPokemonModal(pokemon);
    });
    modal.addEventListener("click", event => { if (event.target.closest("[data-close-modal]")) modal.hidden = true; });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !modal.hidden) modal.hidden = true; });
    backupFileInput.addEventListener("change", () => { if (backupFileInput.files?.[0]) importBackupFile(backupFileInput.files[0]); });
  }

  function fillDatalists() {
    const pokemonOptions = DATA.pokemon.map(pokemon => `<option value="${escapeHtml(pokemon.name)}">#${String(pokemon.dex).padStart(4, "0")}</option>`).join("");
    document.querySelector("#pokemon-options").innerHTML = pokemonOptions;
    document.querySelector("#bait-options").innerHTML = `${pokemonOptions}${DATA.baits.map(bait => `<option value="${escapeHtml(baitName(bait))}">${escapeHtml(bait.item)}</option>`).join("")}`;
    const items = [...new Set(dropRows.map(row => row.item))].sort((left, right) => left.localeCompare(right));
    document.querySelector("#drop-options").innerHTML = `${pokemonOptions}${items.map(item => `<option value="${escapeHtml(humanizeId(item))}">${escapeHtml(item)}</option>`).join("")}`;
  }

  async function init() {
    backupLegacyLocalStorage();
    state = await loadState();
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

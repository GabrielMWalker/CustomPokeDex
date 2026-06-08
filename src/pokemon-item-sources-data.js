(() => {
  const wiki = page => `https://pixelmonmod.com/wiki/${page.replaceAll(" ", "_")}`;
  const itemSource = (item, source, sourceType, extra = {}) => ({ item, source, sourceType, ...extra });
  const shardName = stone => `${stone} Shard`;
  const shardWiki = stone => wiki(shardName(stone));
  const stoneWiki = stone => wiki(stone);
  const shardDrop = (stone, pokemon, chance, quantity) => itemSource(shardName(stone), pokemon, "pokemon-drop", {
    chance,
    quantity,
    aliases: [stone],
    wiki: shardWiki(stone)
  });
  const stoneDrop = (stone, pokemon, chance, quantity) => itemSource(stone, pokemon, "pokemon-drop", {
    chance,
    quantity,
    wiki: stoneWiki(stone)
  });
  const shardMining = (stone, source, biome, note) => itemSource(shardName(stone), source, "mining", {
    biome,
    quantity: "1+",
    aliases: [stone],
    note,
    wiki: wiki(`${stone} Ore`)
  });
  const shardForage = (stone, biome, note) => itemSource(shardName(stone), "Craft", "forage", {
    biome,
    chance: "Rarity 40",
    aliases: [stone],
    note,
    wiki: shardWiki(stone)
  });
  const shardFishing = (stone, source, biome, note) => itemSource(shardName(stone), source, "fishing", {
    biome,
    chance: "Rarity 30",
    aliases: [stone],
    note,
    wiki: shardWiki(stone)
  });
  const stoneCraft = stone => itemSource(stone, "Crafting", "crafting", {
    quantity: `9 ${shardName(stone)}`,
    note: `Craftar com 9 ${shardName(stone)}.`,
    wiki: stoneWiki(stone)
  });
  const stoneChest = (stone, note = "Mineshaft chest 7.8%; Legendary PokeStop 1.2%.") => itemSource(stone, "Chest loot", "chest", {
    chance: "7.8% / 1.2%",
    quantity: "1",
    note,
    wiki: stoneWiki(stone)
  });
  const stoneRaid = (stone, type) => itemSource(stone, `${type}-type Max Raid`, "raid", {
    note: `Possivel drop em Max Raid Battles do tipo ${type}.`,
    wiki: stoneWiki(stone)
  });
  const stoneFishing = (stone, source, biome, note) => itemSource(stone, source, "fishing", {
    biome,
    chance: "Rarity 20",
    note,
    wiki: stoneWiki(stone)
  });
  const held = (stone, pokemon, chance) => itemSource(stone, pokemon, "held", {
    chance,
    note: `Item segurado ao capturar ${pokemon}.`,
    wiki: stoneWiki(stone)
  });

  const shardDrops = [
    ["Thunder Stone", "Pikachu", "50%", "1"],
    ["Thunder Stone", "Raichu", "30%", "1-2"],
    ["Thunder Stone", "Alolan Raichu", "30%", "1-2"],
    ["Thunder Stone", "Electabuzz", "50%", "1-2"],
    ["Thunder Stone", "Jolteon", "30%", "1-2"],
    ["Thunder Stone", "Helioptile", "10%", "1"],
    ["Thunder Stone", "Heliolisk", "10%", "1-2"],
    ["Thunder Stone", "Toxel", "10%", "1"],
    ["Thunder Stone", "Toxtricity", "30%", "1-2"],
    ["Fire Stone", "Charizard", "10%", "1-2"],
    ["Fire Stone", "Vulpix", "10%", "1"],
    ["Fire Stone", "Ninetales", "30%", "1-2"],
    ["Fire Stone", "Magmar", "50%", "1-2"],
    ["Fire Stone", "Flareon", "30%", "1-2"],
    ["Fire Stone", "Pansear", "10%", "1"],
    ["Fire Stone", "Darumaka", "10%", "1"],
    ["Water Stone", "Poliwhirl", "50%", "1"],
    ["Water Stone", "Staryu", "10%", "1"],
    ["Water Stone", "Vaporeon", "30%", "1-2"],
    ["Water Stone", "Corsola", "30%", "1"],
    ["Water Stone", "Anorith", "10%", "1"],
    ["Water Stone", "Armaldo", "10%", "1-2"],
    ["Water Stone", "Relicanth", "10%", "1"],
    ["Water Stone", "Panpour", "10%", "1"],
    ["Leaf Stone", "Sudowoodo", "10%", "1"],
    ["Leaf Stone", "Lileep", "10%", "1"],
    ["Leaf Stone", "Cradily", "10%", "1-2"],
    ["Leaf Stone", "Leafeon", "30%", "1-2"],
    ["Leaf Stone", "Pansage", "10%", "1"],
    ["Moon Stone", "Nidorina", "10%", "1"],
    ["Moon Stone", "Nidorino", "10%", "1"],
    ["Moon Stone", "Wigglytuff", "10%", "1-2"],
    ["Moon Stone", "Lunatone", "50%", "1-2"],
    ["Moon Stone", "Munna", "10%", "1"],
    ["Moon Stone", "Cosmoem", "50%", "1-2"],
    ["Moon Stone", "Lunala", "50%", "1-4"],
    ["Sun Stone", "Solrock", "50%", "1-2"],
    ["Sun Stone", "Cosmoem", "50%", "1-2"],
    ["Sun Stone", "Solgaleo", "50%", "1-4"],
    ["Dawn Stone", "Espeon", "30%", "1-2"],
    ["Dawn Stone", "Kirlia", "50%", "1"],
    ["Dawn Stone", "Gardevoir", "50%", "1-2"],
    ["Dawn Stone", "Glalie", "10%", "1-2"],
    ["Dawn Stone", "Gallade", "50%", "1-2"],
    ["Dusk Stone", "Umbreon", "30%", "1-2"],
    ["Dusk Stone", "Misdreavus", "10%", "1"],
    ["Dusk Stone", "Galarian Corsola", "30%", "1"],
    ["Dusk Stone", "Houndoom", "30%", "1"],
    ["Dusk Stone", "Zorua", "10%", "1"],
    ["Dusk Stone", "Hisuian Zorua", "10%", "1"],
    ["Dusk Stone", "Necrozma", "50%", "1-4"],
    ["Shiny Stone", "Murkrow", "10%", "1"],
    ["Shiny Stone", "Honchkrow", "50%", "1-2"],
    ["Shiny Stone", "Sylveon", "30%", "1-2"],
    ["Shiny Stone", "Minior", "50%", "1-2"],
    ["Ice Stone", "Alolan Sandshrew", "50%", "1"],
    ["Ice Stone", "Alolan Sandslash", "50%", "1-2"],
    ["Ice Stone", "Alolan Vulpix", "10%", "1"],
    ["Ice Stone", "Alolan Ninetales", "30%", "1-2"],
    ["Ice Stone", "Glaceon", "30%", "1-2"],
    ["Ice Stone", "Galarian Darumaka", "10%", "1"]
  ].map(([stone, pokemon, chance, quantity]) => shardDrop(stone, pokemon, chance, quantity));

  const shardSources = [
    shardMining("Thunder Stone", "Thunder Stone Ore", "Mountainous", "Overworld em biomas Mountainous, Y -40 a 200, maior concentracao perto de Y=80; tambem sob Mountain Raid Dens."),
    shardMining("Fire Stone", "Fire Stone Ore", "Mesas", "Overworld em Mesas, Y -40 a 200, maior concentracao perto de Y=80; tambem sob Nether Raid Dens."),
    shardMining("Water Stone", "Water Stone Ore", "Oceanic", "Overworld em Oceanic, em gravel ou deepslate, Y -40 a 62, maior concentracao perto de Y=11."),
    shardMining("Leaf Stone", "Leaf Stone Ore", "All Forests", "Overworld em All Forests, Y -40 a 200, maior concentracao perto de Y=80."),
    shardMining("Moon Stone", "Moon Stone Ore", "Mountainous", "Overworld em Mountainous, Y -40 a 320, maior concentracao perto de Y=140."),
    shardMining("Sun Stone", "Sun Stone Ore", "Desert", "Overworld em biomas do tag IS_DESERT, Y -40 a 100, maior concentracao perto de Y=30; tambem sob Beach/Desert Raid Dens."),
    shardMining("Dawn Stone", "Dawn Stone Ore", "Plains", "Overworld em biomas do tag IS_PLAINS, Y -40 a 200, maior concentracao perto de Y=80; tambem sob Plains Raid Dens e Forest Raid Dens variant B."),
    shardMining("Dusk Stone", "Dusk Stone Ore", "Swamps", "Overworld em biomas do tag IS_SWAMP, Y -40 a 200, maior concentracao perto de Y=80; tambem sob Swamp/Taiga Raid Dens."),
    shardMining("Shiny Stone", "Shiny Stone Ore", "Flowery", "Overworld em Flowery, Y -40 a 200, maior concentracao perto de Y=80; tambem sob Badlands Raid Dens."),
    shardMining("Ice Stone", "Ice Stone Ore", "Freezing", "Overworld em Freezing, em packed ice ou deepslate, Y -40 a 200, maior concentracao perto de Y=80; tambem sob Ice/Snowy/Ultra Deep Sea Raid Dens."),
    shardForage("Thunder Stone", "Freezing Mountains; Mountainous; Mountainous Forests; Savannas; Ultra Plant", "Craft em qualquer ambiente nesses biomas."),
    shardForage("Fire Stone", "Arid; Hellish; Mesas; Mountainous; Ultra Crater; Ultra Desert", "Craft em qualquer ambiente nesses biomas."),
    shardForage("Water Stone", "Beaches; Lakes; Oceanic; River; Swamps; Ultra Deep Sea; Ultra Jungle", "Craft em qualquer ambiente nesses biomas."),
    shardForage("Leaf Stone", "All Forests; Freezing Forests; Jungles; Mountainous Forests; Ultra Forest; Ultra Jungle", "Craft em qualquer ambiente nesses biomas."),
    shardForage("Moon Stone", "Freezing Mountains; Hills; Mountainous; Ultra Crater; Ultra Forest; End", "Craft a noite nos biomas listados; End tem raridade 20."),
    shardForage("Sun Stone", "Freezing Mountains; Hills; Mountainous; Ultra Crater; Ultra Jungle; End", "Craft de dia nos biomas listados; End tem raridade 20."),
    shardForage("Dawn Stone", "Evil; Mushroom; Plains (Category); Ultra Desert", "Craft em Dawn nesses biomas."),
    shardForage("Dusk Stone", "Evil; Mushroom; Plains (Category); Ultra Deep Sea; Ultra Plant", "Craft em Dusk nesses biomas."),
    shardForage("Shiny Stone", "Flowery; Magical; Mushroom; Plains (Category); Ultra Desert; Ultra Forest", "Craft em qualquer ambiente nesses biomas."),
    shardForage("Ice Stone", "Freezing; Freezing Forests; Freezing Mountains; Ultra Deep Sea; Ultra Plant", "Craft em qualquer ambiente nesses biomas."),
    shardFishing("Thunder Stone", "Lava fishing", "Mountainous", "Good Rod ou Super Rod em lava, Mountainous, Dawn."),
    shardFishing("Fire Stone", "Lava fishing", "Arid", "Good Rod ou Super Rod em lava, Arid, Night."),
    shardFishing("Water Stone", "Water fishing", "Oceanic", "Good Rod ou Super Rod em agua, Oceanic, Dusk."),
    shardFishing("Leaf Stone", "Water fishing", "Forests", "Good Rod ou Super Rod em agua, Forests, Dusk."),
    shardFishing("Moon Stone", "Lava fishing", "Underground, max Y 32", "Good Rod ou Super Rod em lava no underground, max Y 32."),
    shardFishing("Sun Stone", "Water fishing", "Birches", "Good Rod ou Super Rod em agua, Birches, Day."),
    shardFishing("Dawn Stone", "Water fishing", "Taigas", "Good Rod ou Super Rod em agua, Taigas, Dawn."),
    shardFishing("Dusk Stone", "Lava fishing", "Dark Forest; Dark Forest Hills", "Good Rod ou Super Rod em lava, Dark Forest/Dark Forest Hills, Dusk."),
    shardFishing("Shiny Stone", "Lava fishing", "Mesas", "Good Rod ou Super Rod em lava, Mesas, Dawn ou Dusk."),
    shardFishing("Ice Stone", "Water fishing", "Freezing", "Good Rod ou Super Rod em agua, Freezing, Day."),
    itemSource("Leaf Stone Shard", "Headbutt", "headbutt", {
      chance: "Rarity 10",
      quantity: "1",
      aliases: ["Leaf Stone"],
      note: "Possivel item de Headbutt.",
      wiki: shardWiki("Leaf Stone")
    })
  ];

  const stoneDrops = [
    ["Thunder Stone", "Electabuzz", "10%", "1"],
    ["Thunder Stone", "Jolteon", "10%", "1"],
    ["Thunder Stone", "Zapdos", "10%", "1"],
    ["Thunder Stone", "Electivire", "30%", "1-2"],
    ["Fire Stone", "Ninetales", "10%", "1"],
    ["Fire Stone", "Magmar", "10%", "1"],
    ["Fire Stone", "Flareon", "10%", "1"],
    ["Fire Stone", "Moltres", "10%", "1"],
    ["Fire Stone", "Magmortar", "30%", "1-2"],
    ["Fire Stone", "Simisear", "10%", "1"],
    ["Fire Stone", "Darmanitan", "10%", "1"],
    ["Water Stone", "Starmie", "10%", "1"],
    ["Water Stone", "Vaporeon", "10%", "1"],
    ["Water Stone", "Simipour", "10%", "1"],
    ["Leaf Stone", "Leafeon", "10%", "1"],
    ["Leaf Stone", "Simisage", "10%", "1"],
    ["Moon Stone", "Nidoqueen", "10%", "1"],
    ["Moon Stone", "Nidoking", "10%", "1"],
    ["Moon Stone", "Cresselia", "30%", "1"],
    ["Moon Stone", "Musharna", "10%", "1"],
    ["Moon Stone", "Lunala", "10%", "1"],
    ["Sun Stone", "Solgaleo", "10%", "1"],
    ["Dawn Stone", "Espeon", "10%", "1"],
    ["Dawn Stone", "Gallade", "10%", "1"],
    ["Dawn Stone", "Froslass", "10%", "1"],
    ["Dusk Stone", "Umbreon", "10%", "1"],
    ["Dusk Stone", "Mismagius", "10%", "1"],
    ["Dusk Stone", "Darkrai", "30%", "1"],
    ["Dusk Stone", "Zoroark", "30%", "1"],
    ["Dusk Stone", "Hisuian Zoroark", "30%", "1"],
    ["Dusk Stone", "Necrozma", "10%", "1"],
    ["Dusk Stone", "Cursola", "10%", "1"],
    ["Shiny Stone", "Roserade", "10%", "1"],
    ["Shiny Stone", "Honchkrow", "10%", "1"],
    ["Shiny Stone", "Sylveon", "10%", "1"],
    ["Ice Stone", "Alolan Sandslash", "10%", "1"],
    ["Ice Stone", "Alolan Ninetales", "10%", "1"],
    ["Ice Stone", "Articuno", "10%", "1"],
    ["Ice Stone", "Glaceon", "10%", "1"],
    ["Ice Stone", "Galarian Darmanitan", "10%", "1"]
  ].map(([stone, pokemon, chance, quantity]) => stoneDrop(stone, pokemon, chance, quantity));

  const directStoneSources = [
    ...["Thunder Stone", "Fire Stone", "Water Stone", "Leaf Stone", "Moon Stone", "Sun Stone", "Dawn Stone", "Dusk Stone", "Shiny Stone", "Ice Stone"].map(stoneCraft),
    stoneChest("Thunder Stone"),
    stoneChest("Fire Stone"),
    stoneChest("Water Stone", "Mineshaft chest 7.8%; Underwater Ruin big/small chest 8.4%; Legendary PokeStop 1.2%."),
    stoneChest("Leaf Stone"),
    stoneChest("Moon Stone"),
    stoneChest("Sun Stone"),
    stoneChest("Dawn Stone"),
    stoneChest("Dusk Stone"),
    stoneChest("Shiny Stone"),
    stoneChest("Ice Stone"),
    stoneRaid("Thunder Stone", "Electric"),
    stoneRaid("Fire Stone", "Fire"),
    stoneRaid("Water Stone", "Water"),
    stoneRaid("Leaf Stone", "Grass"),
    stoneRaid("Moon Stone", "Fairy"),
    stoneRaid("Sun Stone", "Rock"),
    stoneRaid("Dawn Stone", "Psychic"),
    stoneRaid("Dusk Stone", "Dark"),
    stoneRaid("Shiny Stone", "Normal"),
    stoneRaid("Ice Stone", "Ice"),
    stoneFishing("Thunder Stone", "Lava fishing", "Mountainous", "Super Rod em lava, Mountainous, Dawn."),
    stoneFishing("Fire Stone", "Lava fishing", "Arid", "Super Rod em lava, Arid, Night."),
    stoneFishing("Water Stone", "Water fishing", "Oceanic", "Super Rod em agua, Oceanic, Day."),
    stoneFishing("Leaf Stone", "Water fishing", "Forests", "Super Rod em agua, Forests, Dusk."),
    stoneFishing("Moon Stone", "Lava fishing", "Underground, max Y 32", "Super Rod em lava no underground, max Y 32."),
    stoneFishing("Sun Stone", "Water fishing", "Birches", "Super Rod em agua, Birches, Day."),
    stoneFishing("Dawn Stone", "Water fishing", "Taigas", "Super Rod em agua, Taigas, Dawn."),
    stoneFishing("Dusk Stone", "Water fishing", "Dark Forest; Dark Forest Hills", "Super Rod em agua, Dark Forest/Dark Forest Hills, Dusk."),
    stoneFishing("Shiny Stone", "Lava fishing", "Mesas", "Super Rod em lava, Mesas, Dawn ou Dusk."),
    stoneFishing("Ice Stone", "Water fishing", "Freezing", "Super Rod em agua, Freezing, Day."),
    held("Moon Stone", "Clefairy", "5%"),
    held("Moon Stone", "Clefable", "5%"),
    held("Moon Stone", "Jigglypuff", "5%"),
    held("Moon Stone", "Wigglytuff", "5%"),
    held("Moon Stone", "Cleffa", "5%"),
    held("Moon Stone", "Lunatone", "5%"),
    held("Moon Stone", "Cresselia", "100%"),
    held("Moon Stone", "Lunala", "5%"),
    held("Sun Stone", "Solrock", "5%")
  ];

  window.POKEMON_ITEM_SOURCES = [
    ...shardDrops,
    ...shardSources,
    ...stoneDrops,
    ...directStoneSources
  ];
})();

param(
  [string]$InstancePath = "$env:USERPROFILE\curseforge\minecraft\Instances\COBBLEVERSE - Pokemon Adventure [Cobblemon]",
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\src\cobbleverse-data.js")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-RequiredFile {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label nao encontrado em: $Path"
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

function Get-ArchiveJsonEntries {
  param([string]$ArchivePath, [string]$Pattern)

  $zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
  try {
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName -notmatch $Pattern) { continue }
      $reader = [IO.StreamReader]::new($entry.Open())
      try {
        [pscustomobject]@{
          Name = $entry.FullName
          Data = ($reader.ReadToEnd() | ConvertFrom-Json)
        }
      } finally {
        $reader.Dispose()
      }
    }
  } finally {
    $zip.Dispose()
  }
}

function Get-ArchiveJson {
  param([string]$ArchivePath, [string]$EntryName)
  $zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
  try {
    $entry = $zip.GetEntry($EntryName)
    if (-not $entry) { return $null }
    $reader = [IO.StreamReader]::new($entry.Open())
    try {
      return ($reader.ReadToEnd() | ConvertFrom-Json)
    } finally {
      $reader.Dispose()
    }
  } finally {
    $zip.Dispose()
  }
}

function Merge-Object {
  param($Base, $Overlay)
  if ($null -eq $Base) { return $Overlay }
  if ($null -eq $Overlay) { return $Base }
  if ($Base -isnot [pscustomobject] -or $Overlay -isnot [pscustomobject]) { return $Overlay }

  $result = [ordered]@{}
  foreach ($property in $Base.PSObject.Properties) { $result[$property.Name] = $property.Value }
  foreach ($property in $Overlay.PSObject.Properties) {
    if ($result.Contains($property.Name) -and $result[$property.Name] -is [pscustomobject] -and $property.Value -is [pscustomobject]) {
      $result[$property.Name] = Merge-Object $result[$property.Name] $property.Value
    } else {
      $result[$property.Name] = $property.Value
    }
  }
  return [pscustomobject]$result
}

function Convert-CompactCondition {
  param($Condition)
  if ($null -eq $Condition) { return $null }
  $result = [ordered]@{}
  foreach ($property in $Condition.PSObject.Properties) {
    if ($null -ne $property.Value -and "$($property.Value)" -ne "") {
      $result[$property.Name] = $property.Value
    }
  }
  return [pscustomobject]$result
}

function New-Mutation {
  param(
    [string]$Result,
    [string]$ParentA,
    [string[]]$ParentB,
    [string]$Mulch,
    [string]$Yield,
    [string]$Mature,
    [string]$Replenish
  )
  [pscustomobject]@{
    result = $Result
    parentA = $ParentA
    parentBOptions = @($ParentB)
    mulch = $Mulch
    yield = $Yield
    bonusYield = "0-1"
    matureMinutes = [double]($Mature -replace ',', '.')
    replenishMinutes = [double]($Replenish -replace ',', '.')
    chance = 12.5
  }
}

$manifestPath = Get-RequiredFile (Join-Path $InstancePath "manifest.json") "Manifesto do Cobbleverse"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$modsPath = Join-Path $InstancePath "mods"
$datapacksPath = Join-Path $InstancePath "datapacks"
$cobblemonJar = Get-ChildItem -LiteralPath $modsPath -Filter "Cobblemon-fabric-1.7.3+*.jar" | Select-Object -First 1 -ExpandProperty FullName
$mainPack = Get-RequiredFile (Join-Path $datapacksPath "COBBLEVERSE-DP-v19-CF.zip") "Datapack principal"
$rctPack = Get-RequiredFile (Join-Path $datapacksPath "COBBLEVERSE-RCT-DP-v19.zip") "Datapack de treinadores"
$pastureConfigPath = Get-RequiredFile (Join-Path $InstancePath "config\PastureLoot.json") "Configuracao do Pasture Loot"
$cobblemonJar = Get-RequiredFile $cobblemonJar "Cobblemon 1.7.3"
$pastureConfig = Get-Content -LiteralPath $pastureConfigPath -Raw | ConvertFrom-Json

$speciesById = @{}
foreach ($entry in Get-ArchiveJsonEntries $cobblemonJar '^data/cobblemon/species/.+\.json$') {
  $speciesById[$entry.Data.name.ToLowerInvariant()] = $entry.Data
}
foreach ($entry in Get-ArchiveJsonEntries $mainPack '^data/cobblemon/species/.+\.json$') {
  $id = $entry.Data.name.ToLowerInvariant()
  $speciesById[$id] = Merge-Object $speciesById[$id] $entry.Data
}
foreach ($entry in Get-ArchiveJsonEntries $mainPack '^data/cobblemon/species_additions/.+\.json$') {
  $id = (($entry.Data.target -split ':')[-1]).ToLowerInvariant()
  if ($speciesById.ContainsKey($id)) {
    $speciesById[$id] = Merge-Object $speciesById[$id] $entry.Data
  }
}

$spawnFiles = @{}
foreach ($entry in Get-ArchiveJsonEntries $cobblemonJar '^data/cobblemon/spawn_pool_world/.+\.json$') {
  $spawnFiles[[IO.Path]::GetFileName($entry.Name)] = $entry.Data
}
foreach ($entry in Get-ArchiveJsonEntries $mainPack '^data/cobblemon/spawn_pool_world/.+\.json$') {
  $spawnFiles[[IO.Path]::GetFileName($entry.Name)] = $entry.Data
}

$spawnsByPokemon = @{}
foreach ($file in $spawnFiles.Values) {
  if ($file.enabled -eq $false) { continue }
  foreach ($spawn in @($file.spawns)) {
    $pokemonId = (($spawn.pokemon -split ' ')[0] -split ':')[-1].ToLowerInvariant()
    if (-not $spawnsByPokemon.ContainsKey($pokemonId)) { $spawnsByPokemon[$pokemonId] = @() }
    $spawnsByPokemon[$pokemonId] += [pscustomobject]@{
      id = $spawn.id
      pokemon = $spawn.pokemon
      presets = @($spawn.presets)
      type = $spawn.type
      position = $spawn.spawnablePositionType
      bucket = $spawn.bucket
      level = $spawn.level
      weight = $spawn.weight
      context = $spawn.context
      condition = Convert-CompactCondition $spawn.condition
      anticondition = Convert-CompactCondition $spawn.anticondition
    }
  }
}

$blacklist = @($pastureConfig.item_blacklist)
$pokemon = foreach ($species in $speciesById.Values | Sort-Object nationalPokedexNumber) {
  $id = $species.name.ToLowerInvariant()
  $dropEntries = foreach ($drop in @($species.drops.entries)) {
    if ($null -eq $drop) { continue }
    [pscustomobject]@{
      item = $drop.item
      percentage = if ($null -ne $drop.percentage) { [double]$drop.percentage } else { 100.0 }
      quantity = if ($drop.quantityRange) { $drop.quantityRange } else { "1" }
      pastureBlocked = $blacklist -contains $drop.item
    }
  }
  $evolutions = foreach ($evolution in @($species.evolutions)) {
    if ($null -eq $evolution) { continue }
    [pscustomobject]@{
      id = $evolution.id
      variant = $evolution.variant
      result = $evolution.result
      consumeHeldItem = $evolution.consumeHeldItem
      requirements = @($evolution.requirements)
    }
  }
  [pscustomobject]@{
    id = $id
    dex = [int]$species.nationalPokedexNumber
    name = $species.name
    implemented = $species.implemented -ne $false
    types = @($species.primaryType, $species.secondaryType | Where-Object { $_ })
    labels = @($species.labels)
    abilities = @($species.abilities)
    eggGroups = @($species.eggGroups)
    maleRatio = $species.maleRatio
    height = $species.height
    weight = $species.weight
    catchRate = $species.catchRate
    eggCycles = $species.eggCycles
    baseFriendship = $species.baseFriendship
    stats = $species.baseStats
    evYield = $species.evYield
    preEvolution = $species.preEvolution
    evolutions = @($evolutions)
    drops = @($dropEntries)
    dropAmount = $species.drops.amount
    spawns = @($spawnsByPokemon[$id])
  }
}

$baits = foreach ($entry in Get-ArchiveJsonEntries $cobblemonJar '^data/cobblemon/spawn_bait_effects/.+\.json$') {
  [pscustomobject]@{
    item = $entry.Data.item
    category = if ($entry.Name -match '/berries/') { 'berry' } elseif ($entry.Name -match '/fruits/') { 'fruit' } else { 'bait' }
    effects = @($entry.Data.effects)
  }
}

$naturalBerries = @(
  'Oran','Cheri','Chesto','Pecha','Rawst','Aspear','Persim','Razz','Bluk','Nanab','Wepear','Pinap',
  'Occa','Passho','Wacan','Rindo','Yache','Chople','Kebia','Shuca','Coba','Payapa','Tanga','Charti',
  'Kasib','Haban','Colbur','Babiri','Chilan','Roseli'
)
$mutations = @(
  (New-Mutation Figy Persim Cheri Loamy '2-3' 60 20),
  (New-Mutation Touga Figy Razz Peat '1-3' 60 20),
  (New-Mutation Spelon Touga Colbur Sandy '1-2' 80 20),
  (New-Mutation Tamato Touga Occa Loamy '1-2' 100 25),
  (New-Mutation Lansat Spelon Chople Coarse '1' 80 23),
  (New-Mutation Salac Spelon Tamato Sandy '1' 80 23),
  (New-Mutation Wiki Persim Chesto Sandy '2-3' 60 20),
  (New-Mutation Cornn Wiki Bluk Loamy '1-3' 60 20),
  (New-Mutation Pamtre Cornn Passho Humid '1-2' 80 20),
  (New-Mutation Kelpsy Cornn Rindo Coarse '1-2' 100 25),
  (New-Mutation Micle Pamtre Kebia Loamy '1' 80 20),
  (New-Mutation Liechi Pamtre Kelpsy Humid '1' 80 23),
  (New-Mutation Mago Persim Pecha Peat '2-3' 60 20),
  (New-Mutation Magost Mago Nanab Humid '1-3' 60 20),
  (New-Mutation Watmel Magost Tanga Humid '1-2' 80 20),
  (New-Mutation Qualot Magost Roseli Humid '1-2' 100 25),
  (New-Mutation Custap Watmel Chilan Peat '1' 80 20),
  (New-Mutation Ganlon Watmel Qualot Loamy '1' 80 23),
  (New-Mutation Aguav Persim Rawst Humid '2-3' 60 20),
  (New-Mutation Rabuta Aguav Wepear Sandy '1-3' 60 20),
  (New-Mutation Durin Rabuta Babiri Peat '1-2' 80 20),
  (New-Mutation Hondew Rabuta Shuca Sandy '1-2' 100 25),
  (New-Mutation Jaboca Durin Charti Loamy '1' 80 20),
  (New-Mutation Petaya Durin Hondew Sandy '1' 80 23),
  (New-Mutation Iapapa Persim Aspear Sandy '2-3' 60 20),
  (New-Mutation Nomel Iapapa Pinap Coarse '1-3' 60 20),
  (New-Mutation Belue Nomel Payapa Coarse '1-2' 80 20),
  (New-Mutation Grepa Nomel Yache Peat '1-2' 100 25),
  (New-Mutation Rowap Belue Coba Coarse '1' 80 20),
  (New-Mutation Apicot Belue Grepa Coarse '1' 80 23),
  (New-Mutation Lum Oran @('Cheri','Chesto','Pecha','Rawst','Aspear') Humid '1-2' 80 22),
  (New-Mutation Leppa Oran @('Razz','Bluk','Nanab','Wepear','Pinap') Loamy '1-2' 80 22),
  (New-Mutation Sitrus Lum @('Figy','Wiki','Mago','Aguav','Iapapa') Coarse '1-3' 80 22),
  (New-Mutation Hopo Lum Leppa Coarse '1-2' 120 25),
  (New-Mutation Enigma Hopo @('Occa','Passho','Wacan','Rindo','Yache','Chople','Kebia','Shuca','Coba','Payapa','Tanga','Charti','Kasib','Haban','Colbur','Babiri','Chilan','Roseli') Peat '1' 80 20),
  (New-Mutation Maranga Enigma Wacan Humid '1-2' 80 20),
  (New-Mutation Kee Enigma Kasib Peat '1-2' 80 20),
  (New-Mutation Pomeg Sitrus Haban Peat '1-2' 100 25),
  (New-Mutation Starf Pomeg @('Tamato','Kelpsy','Qualot','Hondew','Grepa') Loamy '1' 80 21.5),
  (New-Mutation Eggant Leppa @('Figy','Wiki','Mago','Aguav','Iapapa') Humid '1-3' 60 20)
)

$baitByBerry = @{}
foreach ($bait in $baits | Where-Object category -eq 'berry') {
  $berryId = (($bait.item -split ':')[-1] -replace '_berry$', '')
  $baitByBerry[$berryId] = $bait.effects
}
$mutationByResult = @{}
foreach ($mutation in $mutations) { $mutationByResult[$mutation.result.ToLowerInvariant()] = $mutation }
$berries = foreach ($name in @($naturalBerries + ($mutations | ForEach-Object result)) | Sort-Object -Unique) {
  $id = $name.ToLowerInvariant()
  $mutation = $mutationByResult[$id]
  [pscustomobject]@{
    id = $id
    name = "$name Berry"
    source = if ($naturalBerries -contains $name) { 'natural' } else { 'mutation' }
    mutation = $mutation
    baitEffects = @($baitByBerry[$id])
  }
}

$gymDefinitions = @(
  [pscustomobject]@{ region='Kanto'; pack=$mainPack; map='cobbleverse:gym_map'; leaders=@(
    @('brock','Brock','Brock','Rock'), @('misty','Misty','Misty','Water'), @('ltsurge','Lt. Surge','Lt. Surge','Electric'), @('erika','Erika','Erika','Grass'),
    @('koga','Koga','Koga','Poison'), @('sabrina','Sabrina','Sabrina','Psychic'), @('blaine','Blaine','Blaine','Fire'), @('giovanni','Giovanni','Giovanni','Ground')) },
  [pscustomobject]@{ region='Johto'; pack=(Join-Path $datapacksPath 'extra\COBBLEVERSE-Johto-DP.zip'); map='cobbleverse:johto_gym_map'; leaders=@(
    @('valerio','Falkner','Valerio','Flying'), @('raffaello','Bugsy','Raffaello','Bug'), @('chiara','Whitney','Chiara','Normal'), @('angelo','Morty','Angelo','Ghost'),
    @('furio','Chuck','Furio','Fighting'), @('jasmine','Jasmine','Jasmine','Steel'), @('alfredo','Pryce','Alfredo','Ice'), @('sandra','Clair','Sandra','Dragon')) },
  [pscustomobject]@{ region='Hoenn'; pack=(Join-Path $datapacksPath 'extra\COBBLEVERSE-Hoenn-DP.zip'); map='cobbleverse:hoenn_gym_map'; leaders=@(
    @('petra','Roxanne','Petra','Rock'), @('rudi','Brawly','Rudi','Fighting'), @('walter','Wattson','Walter','Electric'), @('fiammetta','Flannery','Fiammetta','Fire'),
    @('norman','Norman','Norman','Normal'), @('alice','Winona','Alice','Flying'), @('tell_pat','Tate & Liza','Tell & Pat','Psychic'), @('adriano','Juan','Adriano','Water')) },
  [pscustomobject]@{ region='Sinnoh'; pack=(Join-Path $datapacksPath 'extra\COBBLEVERSE-Sinnoh-DP.zip'); map='cobbleverse:sinnoh_gym_map'; leaders=@(
    @('pedro','Roark','Pedro','Rock'), @('gardenia','Gardenia','Gardenia','Grass'), @('marzia','Maylene','Marzia','Fighting'), @('omar','Crasher Wake','Omar','Water'),
    @('fannie','Fantina','Fannie','Ghost'), @('ferruccio','Byron','Ferruccio','Steel'), @('bianca','Candice','Bianca','Ice'), @('corrado','Volkner','Corrado','Electric')) }
)

$gyms = @()
foreach ($region in $gymDefinitions) {
  $region.pack = Get-RequiredFile $region.pack "Datapack de $($region.region)"
  $order = 0
  foreach ($leader in $region.leaders) {
    $order++
    $structureId = $leader[0]
    $trainerId = if ($region.region -eq 'Hoenn' -and $structureId -eq 'tell_pat') { 'hoenn_tell' } else { "$($region.region.ToLowerInvariant())_$structureId" }
    $structure = Get-ArchiveJson $region.pack "data/cobbleverse/worldgen/structure/$structureId.json"
    $trainer = Get-ArchiveJson $rctPack "data/rctmod/trainers/$trainerId.json"
    if ($region.region -eq 'Hoenn' -and $structureId -eq 'tell_pat') {
      $trainerPat = Get-ArchiveJson $rctPack 'data/rctmod/trainers/hoenn_pat.json'
      if ($trainerPat -and $trainer) { $trainer.team = @($trainer.team) + @($trainerPat.team) }
    }
    $gyms += [pscustomobject]@{
      id = "$($region.region.ToLowerInvariant())-$structureId"
      region = $region.region
      order = $order
      leader = $leader[1]
      packName = $leader[2]
      specialty = $leader[3].ToLowerInvariant()
      biome = $structure.biomes
      structure = "cobbleverse:$structureId"
      locatorItem = 'minecraft:map'
      locatorTable = $region.map
      team = @($trainer.team)
      bag = @($trainer.bag)
      battleFormat = $trainer.battleFormat
      maxItemUses = $trainer.battleRules.maxItemUses
    }
  }
}

$payload = [ordered]@{
  metadata = [ordered]@{
    modpack = 'COBBLEVERSE'
    modpackVersion = $manifest.version
    minecraftVersion = $manifest.minecraft.version
    cobblemonVersion = '1.7.3'
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    speciesCount = @($pokemon).Count
    spawnFileCount = $spawnFiles.Count
    source = 'Instalacao local CurseForge e datapacks oficiais do COBBLEVERSE 1.7.31-CF'
  }
  pasture = [ordered]@{
    tickPerMinute = $pastureConfig.tick_per_minute
    dropChancePerMinute = [double]$pastureConfig.drop_chance_per_minute
    legacyFlattenItemQuantity = [bool]$pastureConfig.legacy_flatten_item_quantity
    blacklist = @($blacklist)
  }
  pokemon = @($pokemon)
  baits = @($baits | Sort-Object item)
  berries = @($berries)
  gyms = @($gyms)
}

$json = $payload | ConvertTo-Json -Depth 100 -Compress
$content = "window.COBBLEVERSE_DATA = $json;`n"
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
[IO.File]::WriteAllText($resolvedOutput, $content, [Text.UTF8Encoding]::new($false))

Write-Host "Cobbleverse $($manifest.version): $(@($pokemon).Count) Pokemon, $($spawnFiles.Count) arquivos de spawn, $(@($baits).Count) baits, $(@($berries).Count) berries e $(@($gyms).Count) ginasios."
Write-Host "Gerado em $resolvedOutput"

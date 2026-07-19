param(
  [string]$InstancePath = "$env:USERPROFILE\curseforge\minecraft\Instances\COBBLEVERSE - Pokemon Adventure [Cobblemon]",
  [string]$MinecraftJar = "$env:USERPROFILE\curseforge\minecraft\Install\versions\1.21.1\1.21.1.jar",
  [string]$DataPath = (Join-Path $PSScriptRoot "..\src\cobbleverse-data.js"),
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\src\assets\item-icons"),
  [string]$GymIconOutputPath = (Join-Path $PSScriptRoot "..\src\assets\gym-icons")
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

function Read-ArchiveJson {
  param($Archive, [string]$EntryName)
  $entry = $Archive.GetEntry($EntryName)
  if (-not $entry) { return $null }
  $reader = [IO.StreamReader]::new($entry.Open())
  try {
    return ($reader.ReadToEnd() | ConvertFrom-Json)
  } finally {
    $reader.Dispose()
  }
}

function Split-ResourceLocation {
  param([string]$Value, [string]$FallbackNamespace)
  $parts = $Value -split ':', 2
  if ($parts.Count -eq 2) { return @($parts[0], $parts[1]) }
  return @($FallbackNamespace, $parts[0])
}

function Resolve-ModelTexture {
  param(
    [hashtable]$Archives,
    [string]$Namespace,
    [string]$ModelPath,
    [Collections.Generic.HashSet[string]]$Visited
  )

  $key = "${Namespace}:${ModelPath}"
  if ($Visited.Contains($key)) { return $null }
  [void]$Visited.Add($key)

  $archive = $Archives[$Namespace]
  if (-not $archive) { return $null }
  $model = Read-ArchiveJson $archive "assets/$Namespace/models/$ModelPath.json"
  if (-not $model) { return $null }

  $textureRefs = @()
  if ($model.textures) {
    foreach ($preferred in @('layer0', 'layer1', 'all', 'side', 'top', 'end', 'particle', 'texture')) {
      $value = $model.textures.$preferred
      if ($value -and "$value" -notmatch '^#') { $textureRefs += "$value" }
    }
    foreach ($property in $model.textures.PSObject.Properties) {
      if ($property.Value -and "$($property.Value)" -notmatch '^#') {
        $textureRefs += "$($property.Value)"
      }
    }
  }

  foreach ($textureRef in $textureRefs | Select-Object -Unique) {
    $location = Split-ResourceLocation $textureRef $Namespace
    $textureArchive = $Archives[$location[0]]
    $entryName = "assets/$($location[0])/textures/$($location[1]).png"
    if ($textureArchive -and $textureArchive.GetEntry($entryName)) {
      return [pscustomobject]@{ Namespace = $location[0]; EntryName = $entryName }
    }
  }

  if ($model.parent -and "$($model.parent)" -notmatch '^builtin/') {
    $parent = Split-ResourceLocation $model.parent $Namespace
    return Resolve-ModelTexture $Archives $parent[0] $parent[1] $Visited
  }
  return $null
}

function Resolve-ItemTexture {
  param([hashtable]$Archives, [string]$ItemId)
  $location = Split-ResourceLocation $ItemId 'minecraft'
  $namespace = $location[0]
  $path = $location[1]
  $archive = $Archives[$namespace]
  if (-not $archive) { return $null }

  $directEntry = "assets/$namespace/textures/item/$path.png"
  if ($archive.GetEntry($directEntry)) {
    return [pscustomobject]@{ Namespace = $namespace; EntryName = $directEntry }
  }

  return Resolve-ModelTexture $Archives $namespace "item/$path" ([Collections.Generic.HashSet[string]]::new())
}

$dataPath = Get-RequiredFile $DataPath "Base do Cobbleverse"
$minecraftJar = Get-RequiredFile $MinecraftJar "Minecraft 1.21.1"
$modsPath = Join-Path $InstancePath "mods"
$cobblemonJar = Get-ChildItem -LiteralPath $modsPath -Filter "Cobblemon-fabric-1.7.3+*.jar" | Select-Object -First 1 -ExpandProperty FullName
$cobblemonJar = Get-RequiredFile $cobblemonJar "Cobblemon 1.7.3"
$lumymonJar = Get-ChildItem -LiteralPath $modsPath -Filter "LumyMon-*.jar" | Select-Object -First 1 -ExpandProperty FullName
$lumymonJar = Get-RequiredFile $lumymonJar "LumyMon"
$badgesJar = Get-ChildItem -LiteralPath $modsPath -Filter "CobbleverseBadges-*.jar" | Select-Object -First 1 -ExpandProperty FullName
$badgesJar = Get-RequiredFile $badgesJar "CobbleverseBadges"

$rawData = Get-Content -LiteralPath $dataPath -Raw -Encoding UTF8
$json = $rawData.Substring($rawData.IndexOf('=') + 1).Trim().TrimEnd(';')
$data = $json | ConvertFrom-Json
$items = @($data.pokemon | ForEach-Object {
  $_.drops | ForEach-Object { $_.item }
  $_.acquisitionMethods | ForEach-Object { $_.items }
}) + @($data.gyms | ForEach-Object {
  $_.locatorCostItem
  $_.locatorBaseItem
  $_.locatorItem
  $_.badgeItem
}) + @($data.extraLocations | ForEach-Object {
  $_.locatorCostItem
  $_.locatorBaseItem
  $_.locatorItem
  $_.rewardItem
}) + @($data.baits | ForEach-Object {
  $_.item
}) + @($data.berries | ForEach-Object {
  "cobblemon:$($_.id)_berry"
})
$items = @($items | Where-Object { $_ } | Sort-Object -Unique)

$archives = @{
  minecraft = [IO.Compression.ZipFile]::OpenRead($minecraftJar)
  cobblemon = [IO.Compression.ZipFile]::OpenRead($cobblemonJar)
  lumymon = [IO.Compression.ZipFile]::OpenRead($lumymonJar)
  cobbleversebadges = [IO.Compression.ZipFile]::OpenRead($badgesJar)
}
$iconOverrides = @{
  'cobblemon:sacred_ash' = 'cobblemon:soft_sand'
}

$copied = 0
$gymIconsCopied = 0
$missing = @()
try {
  foreach ($item in $items) {
    $itemLocation = Split-ResourceLocation $item 'minecraft'
    $textureItem = if ($iconOverrides.ContainsKey($item)) { $iconOverrides[$item] } else { $item }
    $texture = Resolve-ItemTexture $archives $textureItem
    if (-not $texture) {
      $missing += $item
      continue
    }

    $destinationDirectory = Join-Path $OutputPath $itemLocation[0]
    [IO.Directory]::CreateDirectory($destinationDirectory) | Out-Null
    $destinationPath = Join-Path $destinationDirectory "$($itemLocation[1]).png"
    $entry = $archives[$texture.Namespace].GetEntry($texture.EntryName)
    $inputStream = $entry.Open()
    $outputStream = [IO.File]::Open($destinationPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
    try {
      $inputStream.CopyTo($outputStream)
    } finally {
      $outputStream.Dispose()
      $inputStream.Dispose()
    }
    $copied++
  }

  [IO.Directory]::CreateDirectory($GymIconOutputPath) | Out-Null
  foreach ($type in @('normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy')) {
    $entry = $archives.lumymon.GetEntry("assets/lumymon/textures/map/decorations/${type}_gym.png")
    if (-not $entry) { continue }
    $destinationPath = Join-Path $GymIconOutputPath "$type.png"
    $inputStream = $entry.Open()
    $outputStream = [IO.File]::Open($destinationPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
    try {
      $inputStream.CopyTo($outputStream)
    } finally {
      $outputStream.Dispose()
      $inputStream.Dispose()
    }
    $gymIconsCopied++
  }
} finally {
  $archives.Values | ForEach-Object { $_.Dispose() }
}

Write-Host "$copied icones de item extraidos para: $OutputPath"
Write-Host "$gymIconsCopied icones elementais de ginasio extraidos para: $GymIconOutputPath"
if ($missing.Count) {
  Write-Warning ("Sem textura local: " + ($missing -join ', '))
}

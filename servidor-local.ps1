param(
  [switch]$NoBrowser,
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$webRoot = Join-Path $root "src"
$databasePath = Join-Path $root "pokemon-checklist-db.json"
$configPath = Join-Path $root "pokemon-checklist-config.json"
$address = [Net.IPAddress]::Parse("127.0.0.1")
$utf8 = [Text.UTF8Encoding]::new($false)
$logCaptureState = [ordered]@{
  Enabled = $false
  LogDirectory = ""
  FilePath = ""
  Offset = 0L
  Buffer = ""
  Candidates = [Collections.Generic.List[object]]::new()
  Seen = @{}
  LastChat = $null
  LastSignal = $null
  LastCapture = $null
  LastIgnored = $null
  LastError = ""
  LastScanAt = ""
  LastChangeAt = ""
  CurrentSize = 0L
  LastDelta = 0L
  LastNoReadReason = ""
  PathResetCount = 0
  PollCount = 0
  LinesRead = 0
  ChatLinesRead = 0
  EventsRead = 0
  NextId = 1
}

function Write-Response {
  param(
    [Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$ContentType,
    [byte[]]$Body
  )

  $statusText = if ($StatusCode -eq 200) { "OK" } elseif ($StatusCode -eq 404) { "Not Found" } else { "Bad Request" }
  $headers = "HTTP/1.1 $StatusCode $statusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`nCache-Control: no-store`r`n`r`n"
  $headerBytes = $utf8.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

function Read-Request {
  param([Net.Sockets.NetworkStream]$Stream)

  $buffer = [Collections.Generic.List[byte]]::new()
  $headerEnd = -1
  while ($headerEnd -lt 0) {
    $value = $Stream.ReadByte()
    if ($value -lt 0) { break }
    $buffer.Add([byte]$value)
    $count = $buffer.Count
    if ($count -ge 4 -and $buffer[$count - 4] -eq 13 -and $buffer[$count - 3] -eq 10 -and $buffer[$count - 2] -eq 13 -and $buffer[$count - 1] -eq 10) {
      $headerEnd = $count
    }
  }

  $headerText = $utf8.GetString($buffer.ToArray())
  $lines = $headerText -split "`r`n"
  $requestParts = $lines[0] -split " "
  $contentLength = 0
  foreach ($line in $lines) {
    if ($line -match "^Content-Length:\s*(\d+)$") { $contentLength = [int]$matches[1] }
  }

  $body = [byte[]]::new($contentLength)
  $read = 0
  while ($read -lt $contentLength) {
    $chunk = $Stream.Read($body, $read, $contentLength - $read)
    if ($chunk -le 0) { break }
    $read += $chunk
  }

  [pscustomobject]@{
    Method = $requestParts[0]
    Path = $requestParts[1]
    Body = $utf8.GetString($body)
  }
}

function Get-DatabaseJson {
  if (Test-Path -LiteralPath $databasePath) {
    return [IO.File]::ReadAllText($databasePath, $utf8)
  }

  $database = [ordered]@{
    version = 2
    updatedAt = [DateTime]::UtcNow.ToString("o")
    captured = @()
  }
  $output = $database | ConvertTo-Json -Depth 10
  [IO.File]::WriteAllText($databasePath, $output, $utf8)
  return $output
}

function Save-DatabaseJson {
  param([string]$Json)

  $data = $Json | ConvertFrom-Json
  $captured = @()
  if ($null -ne $data.captured) {
    $captured = @($data.captured | Where-Object { $_ -is [string] } | Sort-Object -Unique)
  }

  $database = [ordered]@{
    version = 2
    updatedAt = [DateTime]::UtcNow.ToString("o")
    captured = $captured
  }
  $output = $database | ConvertTo-Json -Depth 10
  $temporaryPath = "$databasePath.tmp"
  [IO.File]::WriteAllText($temporaryPath, $output, $utf8)
  Move-Item -LiteralPath $temporaryPath -Destination $databasePath -Force
}

function ConvertTo-PokemonKey {
  param([string]$Name)

  $normalized = ($Name -as [string]).Normalize([Text.NormalizationForm]::FormD).ToLowerInvariant()
  $builder = [Text.StringBuilder]::new()
  foreach ($character in $normalized.ToCharArray()) {
    $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($character)
    if ($category -eq [Globalization.UnicodeCategory]::NonSpacingMark) { continue }
    if ($character -eq [char]0x2640) {
      [void]$builder.Append("f")
    } elseif ($character -eq [char]0x2642) {
      [void]$builder.Append("m")
    } elseif ([char]::IsLetterOrDigit($character)) {
      [void]$builder.Append($character)
    }
  }
  $builder.ToString()
}

function Get-CapturedKeySet {
  $set = @{}
  try {
    $data = (Get-DatabaseJson) | ConvertFrom-Json
    if ($null -ne $data.captured) {
      @($data.captured) | Where-Object { $_ -is [string] } | ForEach-Object {
        $key = ConvertTo-PokemonKey -Name $_
        if ($key) { $set[$key] = $true }
      }
    }
  } catch {}
  return $set
}

function Get-DefaultLogDirectory {
  if ($env:APPDATA) {
    return Join-Path $env:APPDATA "CoreLauncher\game\instances\Pixelmon Brasil - Gen 9\logs"
  }
  return ""
}

function Get-ConfigJson {
  if (Test-Path -LiteralPath $configPath) {
    return [IO.File]::ReadAllText($configPath, $utf8)
  }

  return (@{
    version = 1
    logDirectory = ""
  } | ConvertTo-Json -Depth 5)
}

function Get-ConfiguredLogDirectory {
  if ($logCaptureState.LogDirectory) { return $logCaptureState.LogDirectory }
  try {
    $config = (Get-ConfigJson) | ConvertFrom-Json
    if ($config.logDirectory -is [string]) {
      $logCaptureState.LogDirectory = $config.logDirectory
    }
  } catch {
    $logCaptureState.LogDirectory = ""
  }
  return $logCaptureState.LogDirectory
}

function Save-LogCaptureDirectory {
  param([string]$Directory)

  $directory = [Environment]::ExpandEnvironmentVariables(($Directory -as [string]).Trim())
  if (-not $directory) {
    throw "Informe a pasta de logs do Pixelmon antes de ligar o monitor."
  }

  $fullPath = [IO.Path]::GetFullPath($directory)
  if (-not (Test-Path -LiteralPath $fullPath -PathType Container)) {
    throw "Pasta de logs nao encontrada: $fullPath"
  }

  $config = [ordered]@{
    version = 1
    updatedAt = [DateTime]::UtcNow.ToString("o")
    logDirectory = $fullPath
  }
  $output = $config | ConvertTo-Json -Depth 5
  $temporaryPath = "$configPath.tmp"
  [IO.File]::WriteAllText($temporaryPath, $output, $utf8)
  Move-Item -LiteralPath $temporaryPath -Destination $configPath -Force

  $logCaptureState.LogDirectory = $fullPath
  $logCaptureState.FilePath = ""
  $logCaptureState.Offset = 0L
  $logCaptureState.Buffer = ""
  $logCaptureState.LastError = ""
  $logCaptureState.LastNoReadReason = "Pasta de logs configurada; ligue o monitor."
  return $fullPath
}

function Get-LogDirectories {
  $directory = Get-ConfiguredLogDirectory
  if (-not $directory) { return @() }
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    $logCaptureState.LastError = "Pasta de logs configurada nao encontrada: $directory"
    return @()
  }
  return @($directory)
}

function Get-ActiveLogFile {
  $files = @()
  $errors = [Collections.Generic.List[string]]::new()
  foreach ($directory in Get-LogDirectories) {
    try {
      $files += Get-ChildItem -LiteralPath $directory -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in @(".log", ".txt") }
    } catch {
      $errors.Add("Sem acesso a $directory")
    }
  }
  $file = $files | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if ($null -eq $file -and $errors.Count -gt 0) {
    $logCaptureState.LastError = ($errors -join "; ")
  }
  return $file
}

function Remove-MinecraftFormatting {
  param([string]$Text)

  $replacement = [regex]::Escape([string][char]0xFFFD)
  return ($Text -as [string]) `
    -replace "($replacement|Â§|§|&)[0-9A-FK-ORa-fk-or]", "" `
    -replace "\\n", " " `
    -replace "\s+", " "
}

function Get-CleanPrizePokemonName {
  param([string]$Value)

  $name = (Remove-MinecraftFormatting -Text $Value).Trim()
  $name = $name `
    -replace "^(?:\[[^\]]+\]\s*)+", "" `
    -replace "^\d+x?\s+", "" `
    -replace "(?i)^Chave\s+de\s+Textura\s+", "" `
    -replace "(?i)^Textura\s+", "" `
    -replace "(?i)^Pel[uú]cia\s+do\s+", "" `
    -replace "(?i)^Pelia\s+do\s+", "" `
    -replace "(?i)\s+shiny$", "" `
    -replace "\s*\([^)]*\)\s*$", "" `
    -replace "\s*-\s*.*$", ""
  return $name.Trim(" !.")
}

function Get-LocalPrizePokemonName {
  param([string]$Message)

  $message = (Remove-MinecraftFormatting -Text $Message).Trim()
  if ($message -notmatch "Voc\S*\s+ganhou\s+") { return "" }
  if ($message -match "(?i)\b(Placa|Placas|Plate)\b") { return "" }
  if ($message -match "(?i)ganhou\s+da\s+Caixa") { return "" }

  if ($message -notmatch "(?i)^\[Caixas?\].*Voc\S*\s+ganhou\s+(?<prize>.+?)(?:\s+da\s+Caixa\s+(?<box>.+?))?!?$") {
    return ""
  }

  $prizeText = $matches.prize
  $boxText = if ($null -ne $matches.box) { $matches.box } else { "" }
  $isPokemonPrize = $false
  if ($prizeText -match "(?i)Textura\s*\[(?<pokemon>[^\]]+)\]") {
    return Get-CleanPrizePokemonName -Value $matches.pokemon
  }
  if ($prizeText -match "\[(?<pokemon>[A-Za-z][A-Za-z0-9 .'\-]+)\]") {
    return Get-CleanPrizePokemonName -Value $matches.pokemon
  }
  if ($boxText -match "(?i)(Textura|Shiny|Magikarp|Ultrabeast|Lend)") {
    $isPokemonPrize = $true
  }
  if (-not $isPokemonPrize) { return "" }

  return Get-CleanPrizePokemonName -Value $prizeText
}

function ConvertFrom-PixelmonLogLine {
  param([string]$Line)

  if ($Line -notmatch "^\[(?<time>\d{2}:\d{2}:\d{2})\]\s+\[[^\]]+\]:\s+\[CHAT\]\s+(?<message>.*)$") {
    return $null
  }

  $message = (Remove-MinecraftFormatting -Text $matches.message).Trim()
  $time = $matches.time
  $replacement = [regex]::Escape([string][char]0xFFFD)

  if ($message -match "Habilidades.*Voc(e|ê|$replacement)\s+ativou\s+a\s+habilidade\s+(?<ability>Captura Humanizada)!?$") {
    return [pscustomobject]@{
      type = "capture-ability-activated"
      confidence = "context-only"
      time = $time
      pokemon = ""
      ability = $matches.ability
      raw = $Line
    }
  }

  if ($message -match "^(?:Your party is full\.\s*)?(?<pokemon>.+?)\s+was sent to your PC!?$") {
    $pokemon = (Remove-MinecraftFormatting -Text $matches.pokemon) -replace "^(?:\[[^\]]+\]\s*)+", ""
    $pokemon = $pokemon.Trim()
    if ($pokemon -match "^the egg$") { return $null }
    return [pscustomobject]@{
      type = "local-capture-sent-to-pc"
      confidence = "high"
      time = $time
      pokemon = $pokemon
      ability = ""
      raw = $Line
    }
  }

  if ($message -match "^You captured\s+(?<pokemon>.+?)!?$") {
    $pokemon = ((Remove-MinecraftFormatting -Text $matches.pokemon) -replace "^(?:\[[^\]]+\]\s*)+", "").Trim()
    return [pscustomobject]@{
      type = "local-capture"
      confidence = "high"
      time = $time
      pokemon = $pokemon
      ability = ""
      raw = $Line
    }
  }

  $prizePokemon = Get-LocalPrizePokemonName -Message $message
  if ($prizePokemon) {
    return [pscustomobject]@{
      type = "local-prize-pokemon"
      confidence = "needs-confirmation"
      time = $time
      pokemon = $prizePokemon
      ability = ""
      raw = $Line
    }
  }

  return $null
}

function ConvertFrom-LogChatLine {
  param([string]$Line)

  if ($Line -notmatch "^\[(?<time>\d{2}:\d{2}:\d{2})\]\s+\[[^\]]+\]:\s+\[CHAT\]\s+(?<message>.*)$") {
    return $null
  }

  return [pscustomobject]@{
    time = $matches.time
    message = (Remove-MinecraftFormatting -Text $matches.message).Trim()
    raw = $Line
  }
}

function Add-LogCaptureCandidate {
  param([object]$Event, [string]$SourceFile)

  $captured = Get-CapturedKeySet
  $pokemonKey = ConvertTo-PokemonKey -Name $Event.pokemon
  $logCaptureState.LastCapture = [ordered]@{
    pokemon = $Event.pokemon
    type = $Event.type
    confidence = $Event.confidence
    logTime = $Event.time
    detectedAt = [DateTime]::UtcNow.ToString("o")
    source = [IO.Path]::GetFileName($SourceFile)
  }

  if (-not $pokemonKey) {
    $logCaptureState.LastIgnored = [ordered]@{
      pokemon = $Event.pokemon
      reason = "Nome do Pokemon vazio ou invalido."
      logTime = $Event.time
      detectedAt = [DateTime]::UtcNow.ToString("o")
    }
    return
  }
  if ($captured.ContainsKey($pokemonKey)) {
    $logCaptureState.LastIgnored = [ordered]@{
      pokemon = $Event.pokemon
      reason = "Ja estava marcado como capturado."
      logTime = $Event.time
      detectedAt = [DateTime]::UtcNow.ToString("o")
    }
    return
  }

  $seenKey = "$($Event.time)|$pokemonKey|$SourceFile"
  if ($logCaptureState.Seen.ContainsKey($seenKey)) { return }
  $logCaptureState.Seen[$seenKey] = $true

  $candidate = [ordered]@{
    id = $logCaptureState.NextId
    pokemon = $Event.pokemon
    type = $Event.type
    confidence = $Event.confidence
    logTime = $Event.time
    detectedAt = [DateTime]::UtcNow.ToString("o")
    source = [IO.Path]::GetFileName($SourceFile)
  }
  $logCaptureState.NextId += 1
  $logCaptureState.Candidates.Add([pscustomobject]$candidate)
  while ($logCaptureState.Candidates.Count -gt 30) {
    $logCaptureState.Candidates.RemoveAt(0)
  }
}

function Update-LogCapture {
  if (-not $logCaptureState.Enabled) { return }
  $logCaptureState.PollCount += 1
  $logCaptureState.LastScanAt = [DateTime]::UtcNow.ToString("o")

  try {
    $file = $null
    if ($logCaptureState.FilePath -and (Test-Path -LiteralPath $logCaptureState.FilePath)) {
      $file = Get-Item -LiteralPath $logCaptureState.FilePath
    } else {
      $file = Get-ActiveLogFile
      if ($null -eq $file) {
        if (-not $logCaptureState.LastError) {
          $logCaptureState.LastError = "Nenhum arquivo .log ou .txt encontrado."
        }
        $logCaptureState.LastNoReadReason = "Arquivo ativo nao encontrado."
        return
      }

      $logCaptureState.FilePath = $file.FullName
      $logCaptureState.Offset = $file.Length
      $logCaptureState.Buffer = ""
      $logCaptureState.LastError = ""
      $logCaptureState.LastNoReadReason = "Arquivo ativo definido; aguardando proximas linhas."
      $logCaptureState.PathResetCount += 1
      return
    }

    $logCaptureState.CurrentSize = [long]$file.Length
    $logCaptureState.LastDelta = [long]$file.Length - [long]$logCaptureState.Offset

    if ($file.Length -lt $logCaptureState.Offset) {
      $logCaptureState.Offset = 0L
      $logCaptureState.Buffer = ""
    }
    if ($file.Length -eq $logCaptureState.Offset) {
      $logCaptureState.LastNoReadReason = "Sem crescimento do arquivo desde a ultima varredura."
      return
    }

    $stream = [IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
      [void]$stream.Seek($logCaptureState.Offset, [IO.SeekOrigin]::Begin)
      $reader = [IO.StreamReader]::new($stream, $utf8, $true)
      $content = $reader.ReadToEnd()
      $logCaptureState.Offset = $stream.Length
    } finally {
      if ($null -ne $reader) { $reader.Dispose() }
      $stream.Dispose()
    }

    $combined = $logCaptureState.Buffer + $content
    $lines = $combined -split "\r?\n"
    $logCaptureState.Buffer = $lines[-1]
    if ($lines.Count -le 1) {
      $logCaptureState.LastNoReadReason = "Bytes novos chegaram, mas ainda sem linha completa."
      return
    }
    $logCaptureState.LastNoReadReason = ""

    foreach ($line in $lines[0..($lines.Count - 2)]) {
      if (-not $line) { continue }
      $logCaptureState.LinesRead += 1
      $chat = ConvertFrom-LogChatLine -Line $line
      if ($null -ne $chat) {
        $logCaptureState.ChatLinesRead += 1
        $logCaptureState.LastChat = [ordered]@{
          message = $chat.message
          logTime = $chat.time
          detectedAt = [DateTime]::UtcNow.ToString("o")
          source = [IO.Path]::GetFileName($file.FullName)
        }
      }
      $event = ConvertFrom-PixelmonLogLine -Line $line
      if ($null -eq $event) { continue }
      $logCaptureState.EventsRead += 1
      $logCaptureState.LastChangeAt = [DateTime]::UtcNow.ToString("o")
      if ($event.type -eq "capture-ability-activated") {
        $logCaptureState.LastSignal = [ordered]@{
          type = $event.type
          confidence = $event.confidence
          ability = $event.ability
          logTime = $event.time
          detectedAt = [DateTime]::UtcNow.ToString("o")
          source = [IO.Path]::GetFileName($file.FullName)
        }
      } elseif ($event.pokemon) {
        Add-LogCaptureCandidate -Event $event -SourceFile $file.FullName
      }
    }
    $logCaptureState.LastError = ""
  } catch {
    $logCaptureState.LastError = $_.Exception.Message
  }
}

function Set-LogCaptureEnabled {
  param([bool]$Enabled)

  $logCaptureState.LastError = ""
  if (-not $Enabled) {
    $logCaptureState.Enabled = $false
    return
  }

  $directory = Get-ConfiguredLogDirectory
  if (-not $directory) {
    $logCaptureState.Enabled = $false
    $logCaptureState.FilePath = ""
    $logCaptureState.Offset = 0L
    $logCaptureState.LastError = "Configure a pasta de logs antes de ligar o monitor."
    $logCaptureState.LastNoReadReason = "Aguardando configuracao da pasta de logs."
    return
  }

  $logCaptureState.Enabled = $true
  if ($Enabled) {
    $file = Get-ActiveLogFile
    if ($null -eq $file) {
      $logCaptureState.FilePath = ""
      $logCaptureState.Offset = 0L
      if (-not $logCaptureState.LastError) {
        $logCaptureState.LastError = "Nenhum arquivo .log ou .txt encontrado em $directory."
      }
      $logCaptureState.Enabled = $false
      return
    }
    $logCaptureState.FilePath = $file.FullName
    $logCaptureState.Offset = $file.Length
    $logCaptureState.CurrentSize = [long]$file.Length
    $logCaptureState.LastDelta = 0L
    $logCaptureState.LastNoReadReason = "Monitor ligado; aguardando novas linhas."
    $logCaptureState.PathResetCount += 1
    $logCaptureState.Buffer = ""
  }
}

function Get-LogCaptureJson {
  Update-LogCapture
  $configuredDirectory = Get-ConfiguredLogDirectory
  $response = [ordered]@{
    enabled = $logCaptureState.Enabled
    configuredLogPath = $configuredDirectory
    defaultLogPath = Get-DefaultLogDirectory
    needsLogPathConfig = -not [bool]$configuredDirectory
    activeFile = if ($logCaptureState.FilePath) { [IO.Path]::GetFileName($logCaptureState.FilePath) } else { "" }
    activePath = $logCaptureState.FilePath
    candidates = @($logCaptureState.Candidates)
    lastChat = $logCaptureState.LastChat
    lastSignal = $logCaptureState.LastSignal
    lastCapture = $logCaptureState.LastCapture
    lastIgnored = $logCaptureState.LastIgnored
    lastScanAt = $logCaptureState.LastScanAt
    lastChangeAt = $logCaptureState.LastChangeAt
    currentSize = $logCaptureState.CurrentSize
    offset = $logCaptureState.Offset
    lastDelta = $logCaptureState.LastDelta
    lastNoReadReason = $logCaptureState.LastNoReadReason
    pathResetCount = $logCaptureState.PathResetCount
    pollCount = $logCaptureState.PollCount
    linesRead = $logCaptureState.LinesRead
    chatLinesRead = $logCaptureState.ChatLinesRead
    eventsRead = $logCaptureState.EventsRead
    candidateCount = $logCaptureState.Candidates.Count
    lastError = $logCaptureState.LastError
  }
  return $response | ConvertTo-Json -Depth 10
}

function Remove-LogCaptureCandidates {
  param([object[]]$Ids)

  if ($null -eq $Ids -or $Ids.Count -eq 0) { return }
  $idSet = @{}
  foreach ($id in $Ids) { $idSet[[int]$id] = $true }
  for ($index = $logCaptureState.Candidates.Count - 1; $index -ge 0; $index -= 1) {
    if ($idSet.ContainsKey([int]$logCaptureState.Candidates[$index].id)) {
      $logCaptureState.Candidates.RemoveAt($index)
    }
  }
}

$listener = [Net.Sockets.TcpListener]::new($address, $port)
try {
  $listener.Start()
} catch [Net.Sockets.SocketException] {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/pokemon-biomas-data.js" -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$port/" }
      Write-Host "O checklist ja estava aberto. A pagina foi aberta novamente."
      exit 0
    }
  } catch {
    Write-Host ""
    Write-Host "Existe uma janela antiga do checklist aberta."
    Write-Host "Feche a janela antiga e execute iniciar-checklist.bat novamente."
    Write-Host ""
    if (-not $NoBrowser) { Read-Host "Pressione Enter para fechar" }
    exit 1
  }
}
if (-not $NoBrowser) {
  Start-Process "http://127.0.0.1:$port/"
}

Write-Host ""
Write-Host "Checklist Pokemon aberto no navegador."
Write-Host "Mantenha esta janela aberta enquanto estiver usando a pagina."
Write-Host "Para encerrar, feche esta janela ou pressione Ctrl+C."
Write-Host ""

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $request = Read-Request -Stream $stream
      $requestPath = ($request.Path -split "\?")[0]

      if ($request.Method -eq "GET" -and ($requestPath -eq "/" -or $requestPath -eq "/pokemon-checklist.html")) {
        Write-Response -Stream $stream -StatusCode 200 -ContentType "text/html; charset=utf-8" -Body ([IO.File]::ReadAllBytes((Join-Path $webRoot "index.html")))
      } elseif ($request.Method -eq "GET" -and $requestPath -eq "/lista-falta-pokemon-data.js") {
        Write-Response -Stream $stream -StatusCode 200 -ContentType "application/javascript; charset=utf-8" -Body ([IO.File]::ReadAllBytes((Join-Path $webRoot "lista-falta-pokemon-data.js")))
      } elseif ($request.Method -eq "GET" -and $requestPath -match "^/[a-z0-9-]+-data\.js$") {
        $fileName = $requestPath.TrimStart("/")
        $filePath = [IO.Path]::GetFullPath((Join-Path $webRoot $fileName))
        if ($filePath.StartsWith($webRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $filePath)) {
          Write-Response -Stream $stream -StatusCode 200 -ContentType "application/javascript; charset=utf-8" -Body ([IO.File]::ReadAllBytes($filePath))
        } else {
          Write-Response -Stream $stream -StatusCode 404 -ContentType "text/plain; charset=utf-8" -Body ($utf8.GetBytes("Pagina nao encontrada."))
        }
      } elseif ($request.Method -eq "GET" -and $requestPath -eq "/api/state") {
        Write-Response -Stream $stream -StatusCode 200 -ContentType "application/json; charset=utf-8" -Body ($utf8.GetBytes((Get-DatabaseJson)))
      } elseif ($request.Method -eq "POST" -and $requestPath -eq "/api/state") {
        Save-DatabaseJson -Json $request.Body
        Write-Response -Stream $stream -StatusCode 200 -ContentType "application/json; charset=utf-8" -Body ($utf8.GetBytes('{"saved":true}'))
      } elseif ($request.Method -eq "GET" -and $requestPath -eq "/api/log-capture") {
        Write-Response -Stream $stream -StatusCode 200 -ContentType "application/json; charset=utf-8" -Body ($utf8.GetBytes((Get-LogCaptureJson)))
      } elseif ($request.Method -eq "POST" -and $requestPath -eq "/api/log-capture") {
        $body = if ($request.Body) { $request.Body | ConvertFrom-Json } else { [pscustomobject]@{} }
        Set-LogCaptureEnabled -Enabled ([bool]$body.enabled)
        Write-Response -Stream $stream -StatusCode 200 -ContentType "application/json; charset=utf-8" -Body ($utf8.GetBytes((Get-LogCaptureJson)))
      } elseif ($request.Method -eq "POST" -and $requestPath -eq "/api/log-capture/config") {
        $body = if ($request.Body) { $request.Body | ConvertFrom-Json } else { [pscustomobject]@{ logPath = "" } }
        Save-LogCaptureDirectory -Directory ([string]$body.logPath) | Out-Null
        Write-Response -Stream $stream -StatusCode 200 -ContentType "application/json; charset=utf-8" -Body ($utf8.GetBytes((Get-LogCaptureJson)))
      } elseif ($request.Method -eq "POST" -and $requestPath -eq "/api/log-capture/ack") {
        $body = if ($request.Body) { $request.Body | ConvertFrom-Json } else { [pscustomobject]@{ ids = @() } }
        Remove-LogCaptureCandidates -Ids @($body.ids)
        Write-Response -Stream $stream -StatusCode 200 -ContentType "application/json; charset=utf-8" -Body ($utf8.GetBytes((Get-LogCaptureJson)))
      } elseif ($request.Method -eq "POST" -and $requestPath -eq "/api/log-capture/clear") {
        $logCaptureState.Candidates.Clear()
        Write-Response -Stream $stream -StatusCode 200 -ContentType "application/json; charset=utf-8" -Body ($utf8.GetBytes((Get-LogCaptureJson)))
      } else {
        Write-Response -Stream $stream -StatusCode 404 -ContentType "text/plain; charset=utf-8" -Body ($utf8.GetBytes("Pagina nao encontrada."))
      }
    } catch {
      if ($null -ne $stream) {
        Write-Response -Stream $stream -StatusCode 400 -ContentType "text/plain; charset=utf-8" -Body ($utf8.GetBytes("Erro ao processar a solicitacao."))
      }
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}

use serde::{Deserialize, Deserializer, Serialize};
use std::{
  collections::{HashMap, HashSet},
  env,
  fs::{self, File},
  io::{Read, Seek, SeekFrom, Write},
  path::{Path, PathBuf},
  process::Command,
  sync::Mutex,
  time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Database {
  version: u8,
  updated_at: String,
  #[serde(default, deserialize_with = "deserialize_captured_records")]
  captured: Vec<CapturedRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapturedRecord {
  name: String,
  #[serde(default)]
  captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoredConfig {
  #[serde(default)]
  log_directory: String,
  #[serde(default)]
  log_capture_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogChat {
  time: String,
  text: String,
  file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogSignal {
  time: String,
  text: String,
  file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogCandidate {
  id: u64,
  pokemon: String,
  #[serde(rename = "type")]
  event_type: String,
  confidence: String,
  log_time: String,
  detected_at: String,
  source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogCaptureResponse {
  enabled: bool,
  configured_log_path: String,
  default_log_path: String,
  needs_log_path_config: bool,
  active_file: String,
  active_path: String,
  candidates: Vec<LogCandidate>,
  last_chat: Option<LogChat>,
  last_signal: Option<LogSignal>,
  last_capture: Option<LogCandidate>,
  last_ignored: Option<String>,
  last_scan_at: String,
  current_size: u64,
  offset: u64,
  last_delta: u64,
  last_no_read_reason: String,
  path_reset_count: u64,
  poll_count: u64,
  lines_read: u64,
  chat_lines_read: u64,
  events_read: u64,
  candidate_count: usize,
  last_error: String,
}

#[derive(Debug, Default)]
struct LogCaptureState {
  enabled: bool,
  log_directory: String,
  file_path: String,
  offset: u64,
  buffer: String,
  candidates: Vec<LogCandidate>,
  seen: HashSet<String>,
  local_players: HashSet<String>,
  last_chat: Option<LogChat>,
  last_signal: Option<LogSignal>,
  last_capture: Option<LogCandidate>,
  last_ignored: Option<String>,
  last_error: String,
  last_scan_at: String,
  last_change_at: String,
  current_size: u64,
  last_delta: u64,
  last_no_read_reason: String,
  path_reset_count: u64,
  poll_count: u64,
  lines_read: u64,
  chat_lines_read: u64,
  events_read: u64,
  next_id: u64,
}

struct AppState {
  database_path: PathBuf,
  config_path: PathBuf,
  log: Mutex<LogCaptureState>,
}

#[tauri::command]
fn get_state(state: State<'_, AppState>) -> Result<Database, String> {
  read_database(&state.database_path)
}

#[tauri::command]
fn save_state(captured: Vec<CapturedRecord>, state: State<'_, AppState>) -> Result<serde_json::Value, String> {
  save_database(&state.database_path, captured)?;
  Ok(serde_json::json!({ "saved": true }))
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
  let trimmed = url.trim();
  if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
    return Err("URL externa invalida.".to_string());
  }

  Command::new("rundll32.exe")
    .args(["url.dll,FileProtocolHandler", trimmed])
    .spawn()
    .map_err(|error| error.to_string())?;
  Ok(())
}

#[tauri::command]
fn get_log_capture(state: State<'_, AppState>) -> Result<LogCaptureResponse, String> {
  refresh_log_capture(&state)
}

#[tauri::command]
fn set_log_capture_enabled(enabled: bool, state: State<'_, AppState>) -> Result<LogCaptureResponse, String> {
  let log_directory = {
    let mut log = state.log.lock().map_err(|_| "Monitor indisponível".to_string())?;
    if enabled && log.log_directory.trim().is_empty() {
      if let Some(default_path) = existing_default_log_directory() {
        log.log_directory = default_path;
        reset_log_reader(&mut log);
      }
    }
    log.enabled = enabled;
    log.last_error.clear();
    log.log_directory.clone()
  };
  write_json_atomic(&state.config_path, &StoredConfig {
    log_directory,
    log_capture_enabled: enabled,
  })?;
  refresh_log_capture(&state)
}

#[tauri::command]
fn set_log_capture_config(log_path: String, state: State<'_, AppState>) -> Result<LogCaptureResponse, String> {
  let expanded = expand_windows_env_vars(log_path.trim());

  let log_capture_enabled = {
    let mut log = state.log.lock().map_err(|_| "Monitor indisponível".to_string())?;
    log.log_directory = expanded.clone();
    reset_log_reader(&mut log);
    log.enabled
  };

  write_json_atomic(&state.config_path, &StoredConfig {
    log_directory: expanded,
    log_capture_enabled,
  })?;

  refresh_log_capture(&state)
}

#[tauri::command]
fn ack_log_capture(ids: Vec<u64>, state: State<'_, AppState>) -> Result<LogCaptureResponse, String> {
  {
    let mut log = state.log.lock().map_err(|_| "Monitor indisponível".to_string())?;
    let id_set: HashSet<u64> = ids.into_iter().collect();
    log.candidates.retain(|candidate| !id_set.contains(&candidate.id));
  }
  refresh_log_capture(&state)
}

#[tauri::command]
fn clear_log_capture(state: State<'_, AppState>) -> Result<LogCaptureResponse, String> {
  {
    let mut log = state.log.lock().map_err(|_| "Monitor indisponível".to_string())?;
    log.candidates.clear();
  }
  refresh_log_capture(&state)
}

pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let app_dir = app.path().app_data_dir()?;
      fs::create_dir_all(&app_dir)?;

      let config_path = app_dir.join("pokemon-checklist-config.json");
      let database_path = app_dir.join("pokemon-checklist-db.json");
      let config = read_config(&config_path).unwrap_or_default();

      let mut log = LogCaptureState::default();
      log.log_directory = if config.log_directory.trim().is_empty() {
        existing_default_log_directory().unwrap_or_default()
      } else {
        config.log_directory
      };
      log.enabled = config.log_capture_enabled;
      log.next_id = 1;

      app.manage(AppState {
        database_path,
        config_path,
        log: Mutex::new(log),
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_state,
      save_state,
      open_external_url,
      get_log_capture,
      set_log_capture_enabled,
      set_log_capture_config,
      ack_log_capture,
      clear_log_capture
    ])
    .run(tauri::generate_context!())
    .expect("erro ao iniciar o aplicativo");
}

fn now_string() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}

fn read_database(path: &Path) -> Result<Database, String> {
  if path.exists() {
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    return serde_json::from_str(&text).map_err(|error| error.to_string());
  }

  let database = Database {
    version: 3,
    updated_at: now_string(),
    captured: Vec::new(),
  };
  write_json_atomic(path, &database)?;
  Ok(database)
}

fn save_database(path: &Path, captured: Vec<CapturedRecord>) -> Result<(), String> {
  let mut seen = HashSet::new();
  let mut unique = captured
    .into_iter()
    .filter_map(|record| {
      let name = record.name.trim();
      if name.is_empty() {
        return None;
      }
      let key = pokemon_key(name);
      if seen.contains(&key) {
        return None;
      }
      seen.insert(key);
      Some(CapturedRecord {
        name: name.to_string(),
        captured_at: record.captured_at,
      })
    })
    .collect::<Vec<_>>();
  unique.sort_by(|a, b| pokemon_key(&a.name).cmp(&pokemon_key(&b.name)));

  let database = Database {
    version: 3,
    updated_at: now_string(),
    captured: unique,
  };

  write_json_atomic(path, &database)
}

fn deserialize_captured_records<'de, D>(deserializer: D) -> Result<Vec<CapturedRecord>, D::Error>
where
  D: Deserializer<'de>,
{
  let values = Vec::<serde_json::Value>::deserialize(deserializer)?;
  let records = values
    .into_iter()
    .filter_map(|value| match value {
      serde_json::Value::String(name) => Some(CapturedRecord {
        name,
        captured_at: String::new(),
      }),
      serde_json::Value::Object(mut object) => {
        let name = object
          .remove("name")
          .and_then(|value| value.as_str().map(ToString::to_string))
          .unwrap_or_default();
        let captured_at = object
          .remove("capturedAt")
          .or_else(|| object.remove("captured_at"))
          .and_then(|value| value.as_str().map(ToString::to_string))
          .unwrap_or_default();
        Some(CapturedRecord { name, captured_at })
      }
      _ => None,
    })
    .collect();
  Ok(records)
}

fn read_config(path: &Path) -> Result<StoredConfig, String> {
  if !path.exists() {
    return Ok(StoredConfig::default());
  }
  let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
  serde_json::from_str(&text).map_err(|error| error.to_string())
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }

  let temporary_path = path.with_extension("tmp");
  let text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
  {
    let mut file = File::create(&temporary_path).map_err(|error| error.to_string())?;
    file.write_all(text.as_bytes()).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
  }
  if path.exists() {
    fs::remove_file(path).map_err(|error| error.to_string())?;
  }
  fs::rename(&temporary_path, path).map_err(|error| error.to_string())
}

fn refresh_log_capture(state: &AppState) -> Result<LogCaptureResponse, String> {
  let captured_keys = get_captured_key_set(&state.database_path);
  let mut log = state.log.lock().map_err(|_| "Monitor indisponível".to_string())?;
  scan_logs(&mut log, &captured_keys);
  Ok(log_response(&log))
}

fn get_captured_key_set(path: &Path) -> HashSet<String> {
  read_database(path)
    .map(|database| database.captured.into_iter().map(|record| pokemon_key(&record.name)).collect())
    .unwrap_or_default()
}

fn reset_log_reader(log: &mut LogCaptureState) {
  log.file_path.clear();
  log.offset = 0;
  log.buffer.clear();
  log.last_delta = 0;
  log.path_reset_count += 1;
}

fn scan_logs(log: &mut LogCaptureState, captured_keys: &HashSet<String>) {
  log.poll_count += 1;
  log.last_scan_at = now_string();
  log.last_no_read_reason.clear();

  if !log.enabled {
    return;
  }

  if log.log_directory.trim().is_empty() {
    log.last_error = "Configure a pasta de logs antes de ligar o monitor.".to_string();
    return;
  }

  let directory = PathBuf::from(&log.log_directory);
  if !directory.is_dir() {
    log.last_error = "Pasta de logs não encontrada.".to_string();
    return;
  }

  let Some(active_file) = newest_log_file(&directory) else {
    log.last_error = "Nenhum arquivo .log ou .txt encontrado na pasta.".to_string();
    return;
  };

  let active_path = active_file.to_string_lossy().to_string();
  if log.file_path != active_path {
    let is_first_active_file = log.file_path.is_empty();
    log.file_path = active_path;
    log.buffer.clear();
    log.path_reset_count += 1;

    if is_first_active_file {
      match fs::metadata(&active_file) {
        Ok(metadata) => {
          log.offset = metadata.len();
          log.current_size = log.offset;
          log.last_delta = 0;
          log.last_no_read_reason = "Monitor iniciou no fim do arquivo atual".to_string();
          return;
        }
        Err(error) => {
          log.last_error = error.to_string();
          return;
        }
      }
    }

    log.offset = 0;
  }

  match read_new_text(&active_file, log.offset) {
    Ok((text, size)) => {
      log.last_error.clear();
      log.current_size = size;
      log.last_delta = text.len() as u64;
      if text.is_empty() {
        log.last_no_read_reason = "Sem crescimento do arquivo desde a última varredura".to_string();
        return;
      }
      log.last_change_at = log.last_scan_at.clone();
      log.offset = size;
      process_log_text(log, &active_file, &text, captured_keys);
    }
    Err(error) => {
      log.last_error = error;
    }
  }
}

fn newest_log_file(directory: &Path) -> Option<PathBuf> {
  fs::read_dir(directory)
    .ok()?
    .filter_map(Result::ok)
    .map(|entry| entry.path())
    .filter(|path| {
      path.is_file()
        && path
          .extension()
          .and_then(|extension| extension.to_str())
          .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "log" | "txt"))
          .unwrap_or(false)
    })
    .max_by_key(|path| fs::metadata(path).and_then(|metadata| metadata.modified()).ok())
}

fn read_new_text(path: &Path, offset: u64) -> Result<(String, u64), String> {
  let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
  let size = metadata.len();
  let start = if offset > size { 0 } else { offset };

  let mut file = File::open(path).map_err(|error| error.to_string())?;
  file.seek(SeekFrom::Start(start)).map_err(|error| error.to_string())?;

  let mut bytes = Vec::new();
  file.read_to_end(&mut bytes).map_err(|error| error.to_string())?;
  Ok((String::from_utf8_lossy(&bytes).to_string(), size))
}

fn process_log_text(log: &mut LogCaptureState, path: &Path, text: &str, captured_keys: &HashSet<String>) {
  let file_name = path
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or("latest.log")
    .to_string();

  log.buffer.push_str(text);
  let mut lines = log.buffer.lines().map(str::to_string).collect::<Vec<_>>();
  if !log.buffer.ends_with('\n') && !log.buffer.ends_with('\r') {
    log.buffer = lines.pop().unwrap_or_default();
  } else {
    log.buffer.clear();
  }

  for raw_line in lines {
    log.lines_read += 1;
    let Some((time, chat_text)) = parse_chat_line(&raw_line) else {
      continue;
    };

    log.chat_lines_read += 1;
    log.last_chat = Some(LogChat {
      time: time.clone(),
      text: chat_text.clone(),
      file: file_name.clone(),
    });

    if let Some(player_name) = detect_local_player_name(&chat_text) {
      log.local_players.insert(player_name);
    }

    if chat_text.contains("Captura Humanizada") {
      log.last_signal = Some(LogSignal {
        time: time.clone(),
        text: "Captura Humanizada".to_string(),
        file: file_name.clone(),
      });
    }

    let Some(event) = parse_capture_event(&chat_text) else {
      continue;
    };

    if let Some(player_name) = &event.player_name {
      if !log.local_players.is_empty() && !log.local_players.iter().any(|name| name.eq_ignore_ascii_case(player_name)) {
        log.last_ignored = Some(format!("{} capturado por {}", event.pokemon, player_name));
        continue;
      }
      if log.local_players.is_empty() {
        log.last_ignored = Some(format!("{} ignorado: jogador local ainda desconhecido", event.pokemon));
        continue;
      }
    }

    log.events_read += 1;
    let key = pokemon_key(&event.pokemon);
    if captured_keys.contains(&key) {
      log.last_ignored = Some(format!("{} já estava capturado", event.pokemon));
      continue;
    }

    let seen_key = format!("{}|{}|{}", time, key, file_name);
    if log.seen.contains(&seen_key) {
      continue;
    }
    log.seen.insert(seen_key);

    let candidate = LogCandidate {
      id: log.next_id,
      pokemon: event.pokemon,
      event_type: event.event_type,
      confidence: event.confidence,
      log_time: time,
      detected_at: now_string(),
      source: file_name.clone(),
    };
    log.next_id += 1;
    log.last_capture = Some(candidate.clone());
    log.candidates.push(candidate);
  }
}

struct ParsedEvent {
  pokemon: String,
  event_type: String,
  confidence: String,
  player_name: Option<String>,
}

fn parse_chat_line(line: &str) -> Option<(String, String)> {
  let marker = "[CHAT] ";
  let marker_index = line.find(marker)?;
  let time = line.get(1..9).unwrap_or("").to_string();
  let text = clean_minecraft_text(&line[marker_index + marker.len()..]);
  Some((time, text))
}

fn parse_capture_event(text: &str) -> Option<ParsedEvent> {
  let lower = text.to_lowercase();
  if lower.contains("pokegacha") || lower.contains("pokégacha") {
    return None;
  }

  if let Some(name) = capture_between(text, "Your party is full. ", " was sent to your PC") {
    return Some(ParsedEvent {
      pokemon: name,
      event_type: "capture".to_string(),
      confidence: "alta".to_string(),
      player_name: None,
    });
  }

  if let Some(name) = capture_between(text, "You captured ", "!") {
    return Some(ParsedEvent {
      pokemon: name,
      event_type: "capture".to_string(),
      confidence: "alta".to_string(),
      player_name: None,
    });
  }

  if let Some(name) = parse_personal_portuguese_capture(text) {
    return Some(ParsedEvent {
      pokemon: name,
      event_type: "capture".to_string(),
      confidence: "alta".to_string(),
      player_name: None,
    });
  }

  if let Some((pokemon, player_name)) = parse_global_portuguese_capture(text) {
    return Some(ParsedEvent {
      pokemon,
      event_type: "capture".to_string(),
      confidence: "média".to_string(),
      player_name: Some(player_name),
    });
  }

  if !lower.contains("[caixas]") || !lower.contains(" ganhou ") {
    return None;
  }

  if lower.contains(" placa ") || lower.contains(" plate ") {
    return None;
  }

  let (pokemon, player_name) = parse_box_prize(text)?;
  Some(ParsedEvent {
    pokemon,
    event_type: "prize".to_string(),
    player_name,
    confidence: "média".to_string(),
  })
}

fn parse_personal_portuguese_capture(text: &str) -> Option<String> {
  let lower = text.to_lowercase();
  let marker = [
    "você capturou ",
    "voce capturou ",
    "vocÃª capturou ",
    "voc� capturou ",
  ]
  .iter()
  .find(|marker| lower.contains(**marker))?;
  let start = lower.find(marker)? + marker.len();
  let value = text.get(start..)?.trim();
  clean_capture_name(split_capture_tail(value))
}

fn parse_global_portuguese_capture(text: &str) -> Option<(String, String)> {
  let lower = text.to_lowercase();
  let marker = " foi capturado por ";
  let marker_index = lower.find(marker)?;
  let before = text.get(..marker_index)?.trim();
  let after = text.get(marker_index + marker.len()..)?.trim();
  let player_name = clean_player_name(after.split_whitespace().next()?)?;

  let pokemon_part = before
    .rsplit_once(" Um ")
    .map(|(_, value)| value)
    .or_else(|| before.rsplit_once(" Uma ").map(|(_, value)| value))
    .unwrap_or(before);
  let pokemon_part = pokemon_part.split(", com ").next().unwrap_or(pokemon_part);
  let pokemon = clean_capture_name(pokemon_part)?;
  Some((pokemon, player_name))
}

fn split_capture_tail(value: &str) -> &str {
  value
    .split(|character| matches!(character, '!' | '.' | ','))
    .next()
    .unwrap_or(value)
}

fn clean_capture_name(value: &str) -> Option<String> {
  let output = value
    .replace("Lendário", "")
    .replace("Lendario", "")
    .replace("LendÃ¡rio", "")
    .replace("Lend�rio", "")
    .replace("Mítico", "")
    .replace("Mitico", "")
    .replace("MÃ­tico", "")
    .replace("M�tico", "")
    .replace("Ultra Beast", "")
    .replace("Pokémon", "")
    .replace("Pokemon", "")
    .replace("PokÃ©mon", "")
    .replace("Pok�mon", "")
    .replace("Shiny", "")
    .replace('[', "")
    .replace(']', "")
    .trim()
    .to_string();

  if output.is_empty() {
    None
  } else {
    Some(output)
  }
}

fn detect_local_player_name(text: &str) -> Option<String> {
  if let Some((_, suffix)) = text.split_once("Successfully healed ") {
    if let Some((name, _)) = suffix.split_once("'s Pok") {
      return clean_player_name(name);
    }
  }

  if let Some((name, suffix)) = text.split_once(" successfully healed ") {
    if suffix.contains("'s Pok") {
      return clean_player_name(name);
    }
  }

  None
}

fn clean_player_name(value: &str) -> Option<String> {
  let name = value
    .trim()
    .trim_matches(|character: char| !character.is_ascii_alphanumeric() && character != '_');

  if name.is_empty() {
    None
  } else {
    Some(name.to_string())
  }
}

fn parse_box_prize(text: &str) -> Option<(String, Option<String>)> {
  let player_name = parse_box_player_name(text);

  if let Some(name) = capture_between(text, "Textura [", "]") {
    return Some((name, player_name));
  }

  let start = text.find(" ganhou ")? + " ganhou ".len();
  let after = &text[start..];
  let end = after.find(" da Caixa ").or_else(|| after.find(" da caixa ")).unwrap_or(after.len());
  let prize = after[..end].trim();
  if prize.is_empty() {
    return None;
  }

  let cleaned = prize
    .replace("Textura", "")
    .replace("Shiny", "")
    .replace("Pokemon", "")
    .replace("Pokémon", "")
    .replace('[', "")
    .replace(']', "")
    .trim()
    .to_string();

  if cleaned.is_empty() {
    None
  } else {
    Some((cleaned, player_name))
  }
}

fn parse_box_player_name(text: &str) -> Option<String> {
  for marker in ["O treinador ", "A treinadora "] {
    let Some(start) = text.find(marker).map(|index| index + marker.len()) else {
      continue;
    };
    let after = text.get(start..)?;
    let Some((name, _)) = after.split_once(" ganhou ") else {
      continue;
    };
    if let Some(player_name) = clean_player_name(name) {
      return Some(player_name);
    }
  }

  None
}

fn capture_between(text: &str, start: &str, end: &str) -> Option<String> {
  let start_index = text.find(start)? + start.len();
  let after_start = &text[start_index..];
  let end_index = after_start.find(end)?;
  let value = after_start[..end_index].trim();
  if value.is_empty() {
    None
  } else {
    Some(value.to_string())
  }
}

fn clean_minecraft_text(text: &str) -> String {
  let mut output = String::new();
  let mut skip_next = false;

  for character in text.chars() {
    if skip_next {
      skip_next = false;
      continue;
    }
    if character == '§' {
      skip_next = true;
      continue;
    }
    if character == '&' || character == '§' {
      skip_next = true;
      continue;
    }
    if character == '\u{fffd}' || character.is_control() {
      continue;
    }
    output.push(character);
  }

  output.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn pokemon_key(name: &str) -> String {
  let replacements = HashMap::from([
    ('á', 'a'),
    ('à', 'a'),
    ('ã', 'a'),
    ('â', 'a'),
    ('é', 'e'),
    ('ê', 'e'),
    ('í', 'i'),
    ('ó', 'o'),
    ('ô', 'o'),
    ('õ', 'o'),
    ('ú', 'u'),
    ('ç', 'c'),
  ]);

  name
    .to_lowercase()
    .chars()
    .filter_map(|character| match character {
      '♀' => Some('f'),
      '♂' => Some('m'),
      character if character.is_ascii_alphanumeric() => Some(character),
      character => replacements.get(&character).copied(),
    })
    .collect()
}

fn log_response(log: &LogCaptureState) -> LogCaptureResponse {
  let default_path = default_log_directory();
  LogCaptureResponse {
    enabled: log.enabled,
    configured_log_path: log.log_directory.clone(),
    default_log_path: default_path.clone(),
    needs_log_path_config: log.log_directory.trim().is_empty(),
    active_file: Path::new(&log.file_path)
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or("")
      .to_string(),
    active_path: log.file_path.clone(),
    candidates: log.candidates.clone(),
    last_chat: log.last_chat.clone(),
    last_signal: log.last_signal.clone(),
    last_capture: log.last_capture.clone(),
    last_ignored: log.last_ignored.clone(),
    last_scan_at: log.last_scan_at.clone(),
    current_size: log.current_size,
    offset: log.offset,
    last_delta: log.last_delta,
    last_no_read_reason: log.last_no_read_reason.clone(),
    path_reset_count: log.path_reset_count,
    poll_count: log.poll_count,
    lines_read: log.lines_read,
    chat_lines_read: log.chat_lines_read,
    events_read: log.events_read,
    candidate_count: log.candidates.len(),
    last_error: log.last_error.clone(),
  }
}

fn existing_default_log_directory() -> Option<String> {
  let default_path = default_log_directory();
  if !default_path.trim().is_empty() && PathBuf::from(&default_path).is_dir() {
    Some(default_path)
  } else {
    None
  }
}

fn default_log_directory() -> String {
  env::var("APPDATA")
    .map(|app_data| {
      PathBuf::from(app_data)
        .join("CoreLauncher")
        .join("game")
        .join("instances")
        .join("Pixelmon Brasil - Gen 9")
        .join("logs")
        .to_string_lossy()
        .to_string()
    })
    .unwrap_or_default()
}

fn expand_windows_env_vars(value: &str) -> String {
  let mut output = value.to_string();
  for (key, env_value) in env::vars() {
    output = output.replace(&format!("%{}%", key), &env_value);
  }
  output
}

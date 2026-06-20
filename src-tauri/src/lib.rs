use flate2::read::GzDecoder;
use serde::{Deserialize, Deserializer, Serialize};
use std::{
    collections::{HashMap, HashSet},
    env,
    fs::{self, File},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, Manager, State};
#[cfg(not(target_os = "windows"))]
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

const INITIAL_LOG_HISTORY_BYTES: u64 = 512 * 1024;
const MAX_LOG_REWARD_EVENTS: usize = 500;
const MAX_GTS_SALE_EVENTS: usize = 2000;

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
    #[serde(default)]
    player_name: String,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogRewardEvent {
    id: u64,
    #[serde(rename = "type")]
    event_type: String,
    title: String,
    detail: String,
    log_time: String,
    detected_at: String,
    source: String,
    text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct QuizHistory {
    version: u8,
    updated_at: String,
    #[serde(default)]
    entries: Vec<QuizHistoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuizHistoryEntry {
    key: String,
    question: String,
    answer: String,
    source: String,
    learned_at: String,
    last_seen_at: String,
    count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuizHistoryImportResponse {
    imported: usize,
    total: usize,
    scanned_files: usize,
    changed: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GtsHistoryImportResponse {
    imported: usize,
    imported_sales: usize,
    found: usize,
    found_sales: usize,
    total: usize,
    total_sales: usize,
    scanned_files: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogCaptureResponse {
    enabled: bool,
    player_name: String,
    configured_log_path: String,
    default_log_path: String,
    needs_log_path_config: bool,
    active_file: String,
    active_path: String,
    candidates: Vec<LogCandidate>,
    reward_events: Vec<LogRewardEvent>,
    gts_sales: Vec<LogRewardEvent>,
    gts_sale_debug_samples: Vec<String>,
    quiz_history: Vec<QuizHistoryEntry>,
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
    reward_events: Vec<LogRewardEvent>,
    gts_sales: Vec<LogRewardEvent>,
    gts_sale_debug_samples: Vec<String>,
    pending_quiz: Option<PendingQuiz>,
    pending_who_is_prompt: Option<String>,
    pending_who_is_quiz: Option<PendingWhoIsQuiz>,
    pending_gts_sale: Option<PendingGtsSale>,
    quiz_history: Vec<QuizHistoryEntry>,
    seen: HashSet<String>,
    local_players: HashSet<String>,
    player_name: String,
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
    quiz_history_path: PathBuf,
    log: Mutex<LogCaptureState>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    available: bool,
    version: String,
    current_version: String,
}

#[tauri::command]
fn get_state(state: State<'_, AppState>) -> Result<Database, String> {
    read_database(&state.database_path)
}

#[tauri::command]
fn save_state(
    captured: Vec<CapturedRecord>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
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
fn show_native_notification(
    app: AppHandle,
    title: String,
    body: String,
    sound: Option<String>,
) -> Result<(), String> {
    let title = clean_notification_text(&title, "Pixelmon - Pokelist", 80);
    let body = clean_notification_text(&body, "Use /warp navio para entrar.", 180);
    show_app_notification(&app, &title, &body, sound.as_deref())
}

#[cfg(not(target_os = "windows"))]
fn show_app_notification(
    app: &AppHandle,
    title: &str,
    body: &str,
    sound: Option<&str>,
) -> Result<(), String> {
    let mut notification = app.notification().builder().title(title).body(body);
    if let Some(sound) = sound {
        notification = notification.sound(sound);
    }
    notification.show().map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn show_app_notification(
    app: &AppHandle,
    title: &str,
    body: &str,
    sound: Option<&str>,
) -> Result<(), String> {
    let app_id = app.config().identifier.as_str();
    register_windows_notification_identity(app, app_id);
    set_windows_process_app_id(app_id);

    let mut toast = tauri_winrt_notification::Toast::new(app_id)
        .title(title)
        .text1(body)
        .duration(tauri_winrt_notification::Duration::Short)
        .sound(windows_notification_sound(sound));

    if let Some(icon_path) = notification_icon_path(app) {
        toast = toast.icon(
            &icon_path,
            tauri_winrt_notification::IconCrop::Square,
            "Pixelmon - Pokelist",
        );
    }

    toast.show().map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn windows_notification_sound(sound: Option<&str>) -> Option<tauri_winrt_notification::Sound> {
    match sound {
        Some("invasion") => Some(tauri_winrt_notification::Sound::Reminder),
        Some("gts") | Some("gts_sale") => Some(tauri_winrt_notification::Sound::SMS),
        Some("quiz") => Some(tauri_winrt_notification::Sound::IM),
        _ => Some(tauri_winrt_notification::Sound::Default),
    }
}

#[cfg(target_os = "windows")]
fn set_windows_process_app_id(app_id: &str) {
    use windows::{core::PCWSTR, Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID};

    let app_id = wide_null(app_id);
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(PCWSTR(app_id.as_ptr()));
    }
}

#[cfg(target_os = "windows")]
fn register_windows_notification_identity(app: &AppHandle, app_id: &str) {
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::NO_ERROR,
            System::Registry::{
                RegCloseKey, RegCreateKeyExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
                REG_OPTION_NON_VOLATILE,
            },
        },
    };

    let subkey = wide_null(&format!(r"SOFTWARE\Classes\AppUserModelId\{app_id}"));
    let mut key = HKEY::default();
    let status = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey.as_ptr()),
            None,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut key,
            None,
        )
    };
    if status != NO_ERROR {
        return;
    }

    let product_name = app
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| "Pixelmon - Pokelist".to_string());
    let _ = set_windows_registry_string(key, "DisplayName", &product_name);
    let _ = set_windows_registry_string(key, "IconBackgroundColor", "0");
    if let Some(icon_path) = notification_icon_path(app).or_else(|| env::current_exe().ok()) {
        let _ = set_windows_registry_string(key, "IconUri", &icon_path.display().to_string());
    }

    unsafe {
        let _ = RegCloseKey(key);
    }
}

#[cfg(target_os = "windows")]
fn set_windows_registry_string(
    key: windows::Win32::System::Registry::HKEY,
    name: &str,
    value: &str,
) -> Result<(), String> {
    use windows::{
        core::PCWSTR,
        Win32::{Foundation::NO_ERROR, System::Registry::{RegSetValueExW, REG_SZ}},
    };

    let name = wide_null(name);
    let data = utf16_registry_bytes(value);
    let status = unsafe { RegSetValueExW(key, PCWSTR(name.as_ptr()), None, REG_SZ, Some(&data)) };
    if status == NO_ERROR {
        Ok(())
    } else {
        Err(format!("Falha ao registrar notificacao do app: {}", status.0))
    }
}

#[cfg(target_os = "windows")]
fn notification_icon_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let resource_icon = resource_dir.join("icons").join("icon.png");
        if resource_icon.is_file() {
            return Some(resource_icon);
        }
    }

    let exe_dir = env::current_exe().ok()?.parent()?.to_path_buf();
    let mut local_candidates = vec![exe_dir.join("icons").join("icon.png")];
    if let Some(source_icon) = exe_dir
        .parent()
        .and_then(|target_dir| target_dir.parent())
        .map(|src_tauri_dir| src_tauri_dir.join("icons").join("icon.png"))
    {
        local_candidates.push(source_icon);
    }
    local_candidates.into_iter().find(|path| path.is_file())
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn utf16_registry_bytes(value: &str) -> Vec<u8> {
    wide_null(value)
        .into_iter()
        .flat_map(|unit| unit.to_le_bytes())
        .collect()
}

#[tauri::command]
fn set_clipboard_text(text: String) -> Result<(), String> {
    let mut command = Command::new("powershell.exe");
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$value = [Console]::In.ReadToEnd(); Set-Clipboard -Value $value",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let Some(mut stdin) = child.stdin.take() else {
        return Err("Area de transferencia indisponivel.".to_string());
    };
    stdin
        .write_all(text.as_bytes())
        .map_err(|error| error.to_string())?;
    drop(stdin);

    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if error.is_empty() {
            "Nao foi possivel copiar para a area de transferencia.".to_string()
        } else {
            error
        })
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn ocr_image_text(bytes: Vec<u8>) -> Result<String, String> {
    use windows::{
        Graphics::Imaging::BitmapDecoder,
        Media::Ocr::OcrEngine,
        Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    };

    if bytes.is_empty() {
        return Err("Imagem vazia.".to_string());
    }

    let stream = InMemoryRandomAccessStream::new().map_err(|error| error.to_string())?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(|error| error.to_string())?;
    writer
        .WriteBytes(&bytes)
        .map_err(|error| error.to_string())?;
    writer
        .StoreAsync()
        .map_err(|error| error.to_string())?
        .get()
        .map_err(|error| error.to_string())?;
    writer
        .DetachStream()
        .map_err(|error| error.to_string())?;
    stream.Seek(0).map_err(|error| error.to_string())?;

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|error| error.to_string())?
        .get()
        .map_err(|error| error.to_string())?;
    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|error| error.to_string())?
        .get()
        .map_err(|error| error.to_string())?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|error| error.to_string())?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|error| error.to_string())?
        .get()
        .map_err(|error| error.to_string())?;

    result.Text().map(|text| text.to_string()).map_err(|error| error.to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
async fn ocr_image_text(_bytes: Vec<u8>) -> Result<String, String> {
    Err("OCR de imagem esta disponivel apenas no app desktop para Windows.".to_string())
}

#[tauri::command]
async fn check_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();
    let update = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;

    Ok(UpdateInfo {
        available: update.is_some(),
        version: update
            .map(|available_update| available_update.version.to_string())
            .unwrap_or_else(|| current_version.clone()),
        current_version,
    })
}

#[tauri::command]
async fn install_latest_update(app: AppHandle) -> Result<(), String> {
    let Some(update) = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
    else {
        return Ok(());
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;

    app.restart();
}

#[tauri::command]
fn get_log_capture(state: State<'_, AppState>) -> Result<LogCaptureResponse, String> {
    refresh_log_capture(&state)
}

#[tauri::command]
fn get_quiz_history(state: State<'_, AppState>) -> Result<QuizHistory, String> {
    let history = read_quiz_history(&state.quiz_history_path)?;
    {
        let mut log = state.log.lock().map_err(|error| error.to_string())?;
        log.quiz_history = history.entries.clone();
    }
    Ok(history)
}

#[tauri::command]
fn import_quiz_history_from_logs(
    state: State<'_, AppState>,
) -> Result<QuizHistoryImportResponse, String> {
    import_quiz_history_from_log_directory(&state)
}

#[tauri::command]
fn import_gts_history_from_logs(state: State<'_, AppState>) -> Result<GtsHistoryImportResponse, String> {
    import_gts_history_from_log_directory(&state)
}

#[tauri::command]
fn save_quiz_history_answer(
    state: State<'_, AppState>,
    question: String,
    answer: String,
) -> Result<QuizHistory, String> {
    let mut entries = read_quiz_history(&state.quiz_history_path)?.entries;
    let Some(question) = clean_quiz_history_question(&question) else {
        return Err("Informe uma pergunta valida.".to_string());
    };
    let Some(answer) = clean_quiz_answer(&answer) else {
        return Err("Informe uma resposta valida.".to_string());
    };
    let key = quiz_history_key(&question);
    if key.is_empty() {
        return Err("Informe uma pergunta e uma resposta validas.".to_string());
    }
    let now = now_string();
    if let Some(entry) = entries.iter_mut().find(|entry| entry.key == key) {
        entry.question = question;
        entry.answer = answer;
        entry.source = "manual".to_string();
        entry.last_seen_at = now;
        entry.count = entry.count.max(1);
    } else {
        entries.push(QuizHistoryEntry {
            key,
            question,
            answer,
            source: "manual".to_string(),
            learned_at: now.clone(),
            last_seen_at: now,
            count: 1,
        });
    }
    entries.sort_by(|a, b| {
        b.answer
            .trim()
            .is_empty()
            .cmp(&a.answer.trim().is_empty())
            .then_with(|| a.question.cmp(&b.question))
    });
    write_quiz_history(&state.quiz_history_path, entries.clone())?;
    {
        let mut log = state
            .log
            .lock()
            .map_err(|_| "Monitor indisponivel".to_string())?;
        log.quiz_history = entries.clone();
    }
    Ok(QuizHistory {
        version: 1,
        updated_at: now_string(),
        entries,
    })
}

#[tauri::command]
fn set_log_capture_enabled(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<LogCaptureResponse, String> {
    let (log_directory, player_name) = {
        let mut log = state
            .log
            .lock()
            .map_err(|_| "Monitor indisponível".to_string())?;
        let was_enabled = log.enabled;
        if enabled && log.log_directory.trim().is_empty() {
            if let Some(default_path) = existing_default_log_directory() {
                log.log_directory = default_path;
                reset_log_reader(&mut log);
            }
        }
        if enabled && !was_enabled {
            reset_log_reader(&mut log);
        }
        log.enabled = enabled;
        log.last_error.clear();
        (log.log_directory.clone(), log.player_name.clone())
    };
    write_json_atomic(
        &state.config_path,
        &StoredConfig {
            log_directory,
            log_capture_enabled: enabled,
            player_name,
        },
    )?;
    refresh_log_capture(&state)
}

#[tauri::command]
fn set_log_capture_config(
    log_path: String,
    state: State<'_, AppState>,
) -> Result<LogCaptureResponse, String> {
    let expanded = expand_windows_env_vars(log_path.trim());

    let (log_capture_enabled, player_name) = {
        let mut log = state
            .log
            .lock()
            .map_err(|_| "Monitor indisponível".to_string())?;
        log.log_directory = expanded.clone();
        reset_log_reader(&mut log);
        (log.enabled, log.player_name.clone())
    };

    write_json_atomic(
        &state.config_path,
        &StoredConfig {
            log_directory: expanded,
            log_capture_enabled,
            player_name,
        },
    )?;

    refresh_log_capture(&state)
}

#[tauri::command]
fn set_log_player_name(
    player_name: String,
    state: State<'_, AppState>,
) -> Result<LogCaptureResponse, String> {
    let (log_directory, log_capture_enabled, clean_name) = {
        let mut log = state
            .log
            .lock()
            .map_err(|_| "Monitor indisponÃ­vel".to_string())?;
        log.player_name = clean_player_name(&player_name).unwrap_or_default();
        log.reward_events.clear();
        log.seen.retain(|key| !key.starts_with("reward|"));
        reset_log_reader(&mut log);
        (
            log.log_directory.clone(),
            log.enabled,
            log.player_name.clone(),
        )
    };

    write_json_atomic(
        &state.config_path,
        &StoredConfig {
            log_directory,
            log_capture_enabled,
            player_name: clean_name,
        },
    )?;

    refresh_log_capture(&state)
}

#[tauri::command]
fn ack_log_capture(
    ids: Vec<u64>,
    state: State<'_, AppState>,
) -> Result<LogCaptureResponse, String> {
    {
        let mut log = state
            .log
            .lock()
            .map_err(|_| "Monitor indisponível".to_string())?;
        let id_set: HashSet<u64> = ids.into_iter().collect();
        log.candidates
            .retain(|candidate| !id_set.contains(&candidate.id));
    }
    refresh_log_capture(&state)
}

#[tauri::command]
fn clear_log_capture(state: State<'_, AppState>) -> Result<LogCaptureResponse, String> {
    {
        let mut log = state
            .log
            .lock()
            .map_err(|_| "Monitor indisponível".to_string())?;
        log.candidates.clear();
    }
    refresh_log_capture(&state)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_dir)?;

            let config_path = app_dir.join("pokemon-checklist-config.json");
            let database_path = app_dir.join("pokemon-checklist-db.json");
            let quiz_history_path = app_dir.join("pokemon-quiz-history.json");
            let config = read_config(&config_path).unwrap_or_default();

            let mut log = LogCaptureState::default();
            log.log_directory = if config.log_directory.trim().is_empty() {
                existing_default_log_directory().unwrap_or_default()
            } else {
                config.log_directory
            };
            log.enabled = config.log_capture_enabled;
            log.player_name = config.player_name;
            log.quiz_history = read_quiz_history(&quiz_history_path)
                .map(|history| history.entries)
                .unwrap_or_default();
            log.next_id = 1;

            app.manage(AppState {
                database_path,
                config_path,
                quiz_history_path,
                log: Mutex::new(log),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            save_state,
            open_external_url,
            show_native_notification,
            set_clipboard_text,
            ocr_image_text,
            check_update,
            install_latest_update,
            get_quiz_history,
            import_quiz_history_from_logs,
            import_gts_history_from_logs,
            save_quiz_history_answer,
            get_log_capture,
            set_log_capture_enabled,
            set_log_capture_config,
            set_log_player_name,
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

fn clean_notification_text(value: &str, fallback: &str, max_chars: usize) -> String {
    let text = clean_minecraft_text(value)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let text = text.trim();
    if text.is_empty() {
        return fallback.to_string();
    }
    text.chars().take(max_chars).collect()
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

fn read_quiz_history(path: &Path) -> Result<QuizHistory, String> {
    if !path.exists() {
        return Ok(QuizHistory {
            version: 1,
            updated_at: now_string(),
            entries: Vec::new(),
        });
    }
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut history: QuizHistory =
        serde_json::from_str(&text).map_err(|error| error.to_string())?;
    history.version = 1;
    normalize_quiz_history_entries(&mut history.entries);
    Ok(history)
}

fn write_quiz_history(path: &Path, entries: Vec<QuizHistoryEntry>) -> Result<(), String> {
    let mut entries = entries;
    normalize_quiz_history_entries(&mut entries);
    write_json_atomic(
        path,
        &QuizHistory {
            version: 1,
            updated_at: now_string(),
            entries,
        },
    )
}

fn learn_quiz_history_answer(
    entries: &mut Vec<QuizHistoryEntry>,
    question: &str,
    answer: &str,
    source: &str,
) -> bool {
    let Some(question) = clean_quiz_history_question(question) else {
        return false;
    };
    let Some(answer) = clean_quiz_answer(answer) else {
        return false;
    };
    let key = quiz_history_key(&question);
    if key.is_empty() {
        return false;
    }
    let now = now_string();
    if let Some(entry) = entries.iter_mut().find(|entry| entry.key == key) {
        let changed = entry.answer != answer || entry.question != question;
        entry.question = question;
        entry.answer = answer;
        entry.last_seen_at = now;
        entry.source = source.to_string();
        entry.count = entry.count.saturating_add(1);
        return changed;
    }
    entries.push(QuizHistoryEntry {
        key,
        question,
        answer,
        source: source.to_string(),
        learned_at: now.clone(),
        last_seen_at: now,
        count: 1,
    });
    true
}

fn remember_quiz_history_question(
    entries: &mut Vec<QuizHistoryEntry>,
    question: &str,
    source: &str,
) -> bool {
    let Some(question) = clean_quiz_history_question(question) else {
        return false;
    };
    let key = quiz_history_key(&question);
    if key.is_empty() || entries.iter().any(|entry| entry.key == key) {
        return false;
    }
    let now = now_string();
    entries.push(QuizHistoryEntry {
        key,
        question,
        answer: String::new(),
        source: source.to_string(),
        learned_at: now.clone(),
        last_seen_at: now,
        count: 1,
    });
    true
}

fn clean_quiz_history_question(value: &str) -> Option<String> {
    if let Some(quiz) = parse_who_is_pokemon_event(value) {
        return Some(quiz.detail);
    }
    if let Some(quiz) = parse_ability_description_event(value) {
        return Some(quiz.detail);
    }
    clean_quiz_clue(value)
}

fn quiz_history_key(question: &str) -> String {
    pokemon_key(question)
}

fn normalize_quiz_history_entries(entries: &mut Vec<QuizHistoryEntry>) {
    entries.retain(|entry| !entry.key.trim().is_empty() && !entry.question.trim().is_empty());
    for entry in entries.iter_mut() {
        entry.question = strip_leading_quiz_color_prefix(&entry.question);
        entry.key = quiz_history_key(&entry.question);
        if entry.source != "manual" {
            entry.answer = strip_quiz_timeout_color_prefix(&entry.answer);
        }
    }

    let mut normalized = Vec::new();
    for entry in entries.drain(..) {
        if let Some(index) = normalized
            .iter()
            .position(|existing| are_quiz_history_duplicates(existing, &entry))
        {
            let existing = normalized.remove(index);
            normalized.insert(index, merge_quiz_history_entries(existing, entry));
        } else {
            normalized.push(entry);
        }
    }
    *entries = normalized;
}

fn are_quiz_history_duplicates(left: &QuizHistoryEntry, right: &QuizHistoryEntry) -> bool {
    if left.key == right.key {
        return true;
    }
    if !quiz_history_answers_compatible(&left.answer, &right.answer) {
        return false;
    }
    are_quiz_history_keys_near_duplicates(&left.key, &right.key)
}

fn quiz_history_answers_compatible(left: &str, right: &str) -> bool {
    let left_key = pokemon_key(left);
    let right_key = pokemon_key(right);
    left_key.is_empty() || right_key.is_empty() || left_key == right_key
}

fn are_quiz_history_keys_near_duplicates(left: &str, right: &str) -> bool {
    let left_len = left.chars().count();
    let right_len = right.chars().count();
    if left_len < 35 || right_len < 35 || left_len.abs_diff(right_len) > 8 {
        return false;
    }
    let max_distance = 5;
    let distance = bounded_levenshtein_distance(left, right, max_distance);
    distance <= max_distance && distance * 100 <= left_len.max(right_len) * 8
}

fn bounded_levenshtein_distance(left: &str, right: &str, max_distance: usize) -> usize {
    let left_chars: Vec<char> = left.chars().collect();
    let right_chars: Vec<char> = right.chars().collect();
    let right_len = right_chars.len();
    let mut previous: Vec<usize> = (0..=right_len).collect();

    for (left_index, left_char) in left_chars.iter().enumerate() {
        let mut current = vec![left_index + 1; right_len + 1];
        let mut row_min = current[0];
        for (right_index, right_char) in right_chars.iter().enumerate() {
            let substitution_cost = if left_char == right_char { 0 } else { 1 };
            let value = (previous[right_index + 1] + 1)
                .min(current[right_index] + 1)
                .min(previous[right_index] + substitution_cost);
            current[right_index + 1] = value;
            row_min = row_min.min(value);
        }
        if row_min > max_distance {
            return max_distance + 1;
        }
        previous = current;
    }

    previous[right_len]
}

fn merge_quiz_history_entries(left: QuizHistoryEntry, right: QuizHistoryEntry) -> QuizHistoryEntry {
    let question = choose_better_quiz_question(&left.question, &right.question);
    let answer = choose_better_quiz_answer(&left.answer, &right.answer);
    let source = if right.source == "manual" || left.source.trim().is_empty() {
        right.source
    } else {
        left.source
    };
    let learned_at = min_non_empty_string(left.learned_at, right.learned_at);
    let last_seen_at = max_non_empty_string(left.last_seen_at, right.last_seen_at);

    QuizHistoryEntry {
        key: quiz_history_key(&question),
        question,
        answer,
        source,
        learned_at,
        last_seen_at,
        count: left.count.saturating_add(right.count),
    }
}

fn choose_better_quiz_question(left: &str, right: &str) -> String {
    if quiz_question_quality_score(right) > quiz_question_quality_score(left) {
        right.to_string()
    } else {
        left.to_string()
    }
}

fn quiz_question_quality_score(value: &str) -> isize {
    let mut score = value.chars().count() as isize;
    score -= value.matches("??").count() as isize * 8;
    score -= value.matches('\u{fffd}').count() as isize * 12;
    score
}

fn choose_better_quiz_answer(left: &str, right: &str) -> String {
    if left.trim().is_empty() {
        return right.to_string();
    }
    if right.trim().is_empty() {
        return left.to_string();
    }
    left.to_string()
}

fn min_non_empty_string(left: String, right: String) -> String {
    if left.trim().is_empty() || (!right.trim().is_empty() && right < left) {
        right
    } else {
        left
    }
}

fn max_non_empty_string(left: String, right: String) -> String {
    if left.trim().is_empty() || (!right.trim().is_empty() && right > left) {
        right
    } else {
        left
    }
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let temporary_path = path.with_extension("tmp");
    let text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    {
        let mut file = File::create(&temporary_path).map_err(|error| error.to_string())?;
        file.write_all(text.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary_path, path).map_err(|error| error.to_string())
}

fn refresh_log_capture(state: &AppState) -> Result<LogCaptureResponse, String> {
    let captured_keys = get_captured_key_set(&state.database_path);
    let mut log = state
        .log
        .lock()
        .map_err(|_| "Monitor indisponível".to_string())?;
    if let Ok(history) = read_quiz_history(&state.quiz_history_path) {
        log.quiz_history = history.entries;
    }
    scan_logs(&mut log, &captured_keys, &state.quiz_history_path);
    Ok(log_response(&log))
}

fn import_quiz_history_from_log_directory(
    state: &AppState,
) -> Result<QuizHistoryImportResponse, String> {
    let directory = {
        let log = state
            .log
            .lock()
            .map_err(|_| "Monitor indisponivel".to_string())?;
        if log.log_directory.trim().is_empty() {
            default_log_directory()
        } else {
            log.log_directory.clone()
        }
    };
    let directory = PathBuf::from(directory);
    if !directory.is_dir() {
        return Err("Pasta de logs nao encontrada.".to_string());
    }

    let mut entries = read_quiz_history(&state.quiz_history_path)?.entries;
    let before_total = entries.len();
    let mut scanned_files = 0;
    let mut changed = 0;
    for path in historical_log_files(&directory) {
        if let Ok(text) = read_full_log_text(&path) {
            scanned_files += 1;
            changed += learn_quiz_history_from_text(&mut entries, &path, &text);
        }
    }
    normalize_quiz_history_entries(&mut entries);
    entries.sort_by(|a, b| {
        b.answer
            .trim()
            .is_empty()
            .cmp(&a.answer.trim().is_empty())
            .then_with(|| a.question.cmp(&b.question))
    });
    write_quiz_history(&state.quiz_history_path, entries.clone())?;

    let total = entries.len();
    {
        let mut log = state
            .log
            .lock()
            .map_err(|_| "Monitor indisponivel".to_string())?;
        log.quiz_history = entries;
    }

    Ok(QuizHistoryImportResponse {
        imported: total.saturating_sub(before_total),
        total,
        scanned_files,
        changed,
    })
}

fn import_gts_history_from_log_directory(
    state: &AppState,
) -> Result<GtsHistoryImportResponse, String> {
    let directory = {
        let log = state
            .log
            .lock()
            .map_err(|_| "Monitor indisponivel".to_string())?;
        if log.log_directory.trim().is_empty() {
            default_log_directory()
        } else {
            log.log_directory.clone()
        }
    };
    let directory = PathBuf::from(directory);
    if !directory.is_dir() {
        return Err("Pasta de logs nao encontrada.".to_string());
    }

    let mut scanned_files = 0;
    let mut imported = 0;
    let mut imported_sales = 0;
    let mut collected = Vec::new();
    let mut debug_samples = Vec::new();
    for path in historical_log_files(&directory) {
        if let Ok(text) = read_full_log_text(&path) {
            scanned_files += 1;
            collected.extend(collect_gts_events_from_text(&path, &text));
            debug_samples.extend(collect_gts_sale_debug_samples_from_text(&path, &text));
        }
    }
    let found = collected.len();
    let found_sales = collected
        .iter()
        .filter(|event| event.event.event_type == "gts_sale")
        .count();

    let (total, total_sales) = {
        let mut log = state
            .log
            .lock()
            .map_err(|_| "Monitor indisponivel".to_string())?;
        for event in collected {
            let is_sale = event.event.event_type == "gts_sale";
            if push_imported_gts_event_if_new(&mut log, event) {
                imported += 1;
                if is_sale {
                    imported_sales += 1;
                }
            }
        }
        for sample in debug_samples {
            push_gts_sale_debug_sample(&mut log, sample);
        }
        (log.reward_events.len(), log.gts_sales.len())
    };

    Ok(GtsHistoryImportResponse {
        imported,
        imported_sales,
        found,
        found_sales,
        total,
        total_sales,
        scanned_files,
    })
}

fn historical_log_files(directory: &Path) -> Vec<PathBuf> {
    let mut files = fs::read_dir(directory)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .map(|name| {
                        let name = name.to_ascii_lowercase();
                        name.ends_with(".log")
                            || name.ends_with(".txt")
                            || name.ends_with(".log.gz")
                            || name.ends_with(".txt.gz")
                    })
                    .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
    });
    files
}

fn read_full_log_text(path: &Path) -> Result<String, String> {
    let mut bytes = Vec::new();
    let is_gzip = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|name| name.to_ascii_lowercase().ends_with(".gz"))
        .unwrap_or(false);
    if is_gzip {
        let file = File::open(path).map_err(|error| error.to_string())?;
        let mut decoder = GzDecoder::new(file);
        decoder
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
    } else {
        let mut file = File::open(path).map_err(|error| error.to_string())?;
        file.read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
    }
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn learn_quiz_history_from_text(
    entries: &mut Vec<QuizHistoryEntry>,
    path: &Path,
    text: &str,
) -> usize {
    let source = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("log")
        .to_string();
    let mut pending_prompt: Option<String> = None;
    let mut pending_clue: Option<String> = None;
    let before_total = entries.len();

    for raw_line in text.lines() {
        let Some((_, chat_text)) = parse_chat_line(raw_line) else {
            continue;
        };

        if is_likely_player_chat_message(&chat_text) {
            pending_prompt = None;
            continue;
        }

        if let Some((quiz, answer)) = parse_complex_quiz_timeout_event(&chat_text) {
            remember_quiz_history_question(entries, &quiz.detail, &source);
            learn_quiz_history_answer(entries, &quiz.detail, &answer, &source);
            pending_clue = None;
            continue;
        }

        if let Some(answer) = parse_quiz_timeout_answer(&chat_text) {
            if let Some(clue) = pending_clue.take() {
                learn_quiz_history_answer(entries, &clue, &answer, &source);
            }
            continue;
        }

        if let Some(prompt) = pending_prompt.take() {
            if let Some(quiz) = parse_pending_complex_quiz_event(prompt, &chat_text) {
                remember_quiz_history_question(entries, &quiz.detail, &source);
                pending_clue = Some(quiz.detail);
                continue;
            }
        }

        if let Some(quiz) = parse_who_is_pokemon_event(&chat_text) {
            remember_quiz_history_question(entries, &quiz.detail, &source);
            pending_clue = Some(quiz.detail);
            continue;
        }

        if let Some(quiz) = parse_ability_description_event(&chat_text) {
            remember_quiz_history_question(entries, &quiz.detail, &source);
            pending_clue = Some(quiz.detail);
            continue;
        }

        if let Some(prompt) = parse_who_is_pokemon_prompt(&chat_text)
            .or_else(|| parse_ability_description_prompt(&chat_text))
        {
            pending_prompt = Some(prompt);
        }
    }

    entries.len().saturating_sub(before_total)
}

fn collect_gts_events_from_text(path: &Path, text: &str) -> Vec<CollectedGtsEvent> {
    let source = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("log")
        .to_string();
    let mut events = Vec::new();
    let mut pending_sale: Option<PendingGtsSale> = None;

    for raw_line in text.lines() {
        let Some((time, chat_text)) = parse_chat_line(raw_line) else {
            continue;
        };

        if let Some(gts_sale) = parse_gts_sale_bundle_event(&chat_text) {
            events.push(CollectedGtsEvent {
                event: gts_sale,
                log_time: time,
                source: source.clone(),
                text: chat_text,
            });
            pending_sale = None;
            continue;
        }

        if let Some(gts) = parse_gts_listing_event(&chat_text) {
            events.push(CollectedGtsEvent {
                event: gts,
                log_time: time,
                source: source.clone(),
                text: chat_text,
            });
            continue;
        }

        if let Some(gts_sale) = parse_gts_sale_event(&chat_text) {
            events.push(CollectedGtsEvent {
                event: gts_sale,
                log_time: time,
                source: source.clone(),
                text: chat_text,
            });
            pending_sale = None;
            continue;
        }

        if let Some(sale_start) = parse_gts_sale_start_event(&chat_text) {
            pending_sale = Some(PendingGtsSale {
                buyer: sale_start.buyer,
                item: sale_start.item,
                price: String::new(),
                fee: String::new(),
                received: String::new(),
                log_time: time,
                source: source.clone(),
                text: chat_text,
            });
            continue;
        }

        if let Some((field, amount)) = parse_gts_sale_amount_line(&chat_text) {
            if let Some(mut sale) = pending_sale.take() {
                match field {
                    "price" => sale.price = amount,
                    "fee" => sale.fee = amount,
                    "received" => sale.received = amount,
                    _ => {}
                }
                sale.text.push('\n');
                sale.text.push_str(&chat_text);
                if sale.price.is_empty() || sale.fee.is_empty() || sale.received.is_empty() {
                    pending_sale = Some(sale);
                } else {
                    events.push(CollectedGtsEvent {
                        event: ParsedRewardEvent {
                            event_type: "gts_sale".to_string(),
                            title: format!("Venda GTS: {}", sale.item),
                            detail: format!(
                                "{} | {} | {} | {} | {}",
                                sale.item, sale.buyer, sale.price, sale.fee, sale.received
                            ),
                        },
                        log_time: sale.log_time,
                        source: sale.source,
                        text: sale.text,
                    });
                }
            }
        }
    }

    events
}

fn collect_gts_sale_debug_samples_from_text(path: &Path, text: &str) -> Vec<String> {
    let source = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("log");
    let mut samples = Vec::new();
    for raw_line in text.lines() {
        let Some((_time, chat_text)) = parse_chat_line(raw_line) else {
            continue;
        };
        if !looks_like_gts_sale_debug_line(&chat_text) {
            continue;
        }
        let label = if parse_gts_sale_bundle_event(&chat_text).is_some() {
            "OK pacote"
        } else if parse_gts_sale_event(&chat_text).is_some() {
            "OK simples"
        } else if parse_gts_sale_start_event(&chat_text).is_some() {
            "OK inicio"
        } else if parse_gts_sale_amount_line(&chat_text).is_some() {
            "OK valor"
        } else {
            "NAO parseou"
        };
        samples.push(format!("{label} | {source} | {chat_text}"));
    }
    if samples.len() > 12 {
        samples.drain(0..samples.len() - 12);
    }
    samples
}

fn get_captured_key_set(path: &Path) -> HashSet<String> {
    read_database(path)
        .map(|database| {
            database
                .captured
                .into_iter()
                .map(|record| pokemon_key(&record.name))
                .collect()
        })
        .unwrap_or_default()
}

fn reset_log_reader(log: &mut LogCaptureState) {
    log.file_path.clear();
    log.offset = 0;
    log.buffer.clear();
    log.pending_quiz = None;
    log.pending_who_is_prompt = None;
    log.pending_who_is_quiz = None;
    log.pending_gts_sale = None;
    log.last_delta = 0;
    log.path_reset_count += 1;
}

fn initial_log_history_offset(size: u64) -> u64 {
    size.saturating_sub(INITIAL_LOG_HISTORY_BYTES)
}

fn scan_logs(log: &mut LogCaptureState, captured_keys: &HashSet<String>, quiz_history_path: &Path) {
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
    let mut trim_partial_start = false;
    if log.file_path != active_path {
        let is_first_active_file = log.file_path.is_empty();
        trim_partial_start = is_first_active_file;
        log.file_path = active_path;
        log.buffer.clear();
        log.path_reset_count += 1;

        if is_first_active_file {
            match fs::metadata(&active_file) {
                Ok(metadata) => {
                    log.offset = initial_log_history_offset(metadata.len());
                    log.current_size = metadata.len();
                    log.last_delta = 0;
                    log.last_no_read_reason = if log.offset == 0 {
                        "Monitor lendo o arquivo atual desde o inicio".to_string()
                    } else {
                        "Monitor lendo historico recente do arquivo atual".to_string()
                    };
                }
                Err(error) => {
                    log.last_error = error.to_string();
                    return;
                }
            }
        }

        log.offset = 0;
    }

    match read_new_text(&active_file, log.offset, trim_partial_start) {
        Ok((text, size)) => {
            log.last_error.clear();
            log.current_size = size;
            log.last_delta = text.len() as u64;
            if text.is_empty() {
                log.last_no_read_reason =
                    "Sem crescimento do arquivo desde a última varredura".to_string();
                return;
            }
            log.last_change_at = log.last_scan_at.clone();
            log.offset = size;
            if process_log_text(log, &active_file, &text, captured_keys) {
                normalize_quiz_history_entries(&mut log.quiz_history);
                let history = QuizHistory {
                    version: 1,
                    updated_at: now_string(),
                    entries: log.quiz_history.clone(),
                };
                if let Err(error) = write_json_atomic(quiz_history_path, &history) {
                    log.last_error = error;
                }
            }
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
                    .map(|extension| {
                        matches!(extension.to_ascii_lowercase().as_str(), "log" | "txt")
                    })
                    .unwrap_or(false)
        })
        .max_by_key(|path| {
            fs::metadata(path)
                .and_then(|metadata| metadata.modified())
                .ok()
        })
}

fn read_new_text(
    path: &Path,
    offset: u64,
    trim_partial_start: bool,
) -> Result<(String, u64), String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let size = metadata.len();
    let start = if offset > size { 0 } else { offset };

    let mut file = File::open(path).map_err(|error| error.to_string())?;
    file.seek(SeekFrom::Start(start))
        .map_err(|error| error.to_string())?;

    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    let mut text = String::from_utf8_lossy(&bytes).to_string();
    if trim_partial_start && start > 0 {
        text = text
            .find('\n')
            .map(|index| text[index + 1..].to_string())
            .unwrap_or_default();
    }
    Ok((text, size))
}

fn process_log_text(
    log: &mut LogCaptureState,
    path: &Path,
    text: &str,
    captured_keys: &HashSet<String>,
) -> bool {
    let mut quiz_history_changed = false;
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

        let is_server_chat_message = !is_likely_player_chat_message(&chat_text);

        if is_server_chat_message {
            if let Some((quiz, answer)) = parse_complex_quiz_timeout_event(&chat_text) {
                quiz_history_changed |=
                    remember_quiz_history_question(&mut log.quiz_history, &quiz.detail, &file_name);
                quiz_history_changed |= learn_quiz_history_answer(
                    &mut log.quiz_history,
                    &quiz.detail,
                    &answer,
                    &file_name,
                );
                log.pending_who_is_quiz = None;
                push_quiz_event_if_new(log, quiz, &time, &file_name);
                continue;
            }

            if let Some(answer) = parse_quiz_timeout_answer(&chat_text) {
                if let Some(pending) = log.pending_who_is_quiz.take() {
                    quiz_history_changed |= learn_quiz_history_answer(
                        &mut log.quiz_history,
                        &pending.clue,
                        &answer,
                        &file_name,
                    );
                }
                continue;
            }
        }

        if let Some(player_name) = detect_local_player_name(&chat_text) {
            log.local_players.insert(player_name);
        }

        if is_server_chat_message {
            if let Some(prompt) = log.pending_who_is_prompt.take() {
                if let Some(quiz) = parse_pending_complex_quiz_event(prompt, &chat_text) {
                    quiz_history_changed |= remember_quiz_history_question(
                        &mut log.quiz_history,
                        &quiz.detail,
                        &file_name,
                    );
                    log.pending_who_is_quiz = Some(PendingWhoIsQuiz {
                        clue: quiz.detail.clone(),
                    });
                    push_quiz_event_if_new(log, quiz, &time, &file_name);
                    continue;
                }
            }

            if let Some(quiz) = parse_pending_quiz_event(log.pending_quiz.take(), &chat_text) {
                push_quiz_event_if_new(log, quiz, &time, &file_name);
            } else if let Some(quiz) = parse_quiz_event(&chat_text) {
                push_quiz_event_if_new(log, quiz, &time, &file_name);
            } else if let Some(quiz) = parse_who_is_pokemon_event(&chat_text) {
                quiz_history_changed |=
                    remember_quiz_history_question(&mut log.quiz_history, &quiz.detail, &file_name);
                log.pending_who_is_quiz = Some(PendingWhoIsQuiz {
                    clue: quiz.detail.clone(),
                });
                push_quiz_event_if_new(log, quiz, &time, &file_name);
            } else if let Some(quiz) = parse_ability_description_event(&chat_text) {
                quiz_history_changed |=
                    remember_quiz_history_question(&mut log.quiz_history, &quiz.detail, &file_name);
                log.pending_who_is_quiz = Some(PendingWhoIsQuiz {
                    clue: quiz.detail.clone(),
                });
                push_quiz_event_if_new(log, quiz, &time, &file_name);
            } else if let Some(prompt) = parse_who_is_pokemon_prompt(&chat_text)
                .or_else(|| parse_ability_description_prompt(&chat_text))
            {
                log.pending_who_is_prompt = Some(prompt);
            } else if let Some(pending_quiz) = parse_pending_quiz_prompt(&chat_text) {
                log.pending_quiz = Some(pending_quiz);
            }
        } else {
            log.pending_quiz = None;
            log.pending_who_is_prompt = None;
        }

        if chat_text.contains("Captura Humanizada") {
            log.last_signal = Some(LogSignal {
                time: time.clone(),
                text: "Captura Humanizada".to_string(),
                file: file_name.clone(),
            });
        }

        if let Some(invasion) = parse_invasion_event(&chat_text) {
            let seen_key = format!("invasion|{}|{}", time, file_name);
            if !log.seen.contains(&seen_key) {
                log.seen.insert(seen_key);
                push_log_reward_event(
                    log,
                    invasion.event_type,
                    invasion.title,
                    invasion.detail,
                    time.clone(),
                    file_name.clone(),
                    chat_text.clone(),
                );
            }
        }

        if let Some(gts) = parse_gts_listing_event(&chat_text) {
            let seen_key = gts_seen_key(&gts, &time, &file_name);
            if !log.seen.contains(&seen_key) {
                log.seen.insert(seen_key);
                push_log_reward_event(
                    log,
                    gts.event_type,
                    gts.title,
                    gts.detail,
                    time.clone(),
                    file_name.clone(),
                    chat_text.clone(),
                );
            }
        } else if let Some(gts_sale) = parse_gts_sale_bundle_event(&chat_text) {
            push_gts_sale_debug_sample(log, format!("OK pacote | {} | {}", file_name, chat_text));
            push_gts_sale_event_if_new(log, gts_sale, &time, &file_name, &chat_text);
        } else if let Some(gts_sale) = parse_gts_sale_event(&chat_text) {
            push_gts_sale_debug_sample(log, format!("OK simples | {} | {}", file_name, chat_text));
            push_gts_sale_event_if_new(log, gts_sale, &time, &file_name, &chat_text);
        } else if let Some(sale_start) = parse_gts_sale_start_event(&chat_text) {
            push_gts_sale_debug_sample(log, format!("OK inicio | {} | {}", file_name, chat_text));
            log.pending_gts_sale = Some(PendingGtsSale {
                buyer: sale_start.buyer,
                item: sale_start.item,
                price: String::new(),
                fee: String::new(),
                received: String::new(),
                log_time: time.clone(),
                source: file_name.clone(),
                text: chat_text.clone(),
            });
            continue;
        } else if let Some((field, amount)) = parse_gts_sale_amount_line(&chat_text) {
            push_gts_sale_debug_sample(log, format!("OK valor {field}={amount} | {} | {}", file_name, chat_text));
            if let Some(mut pending_sale) = log.pending_gts_sale.take() {
                match field {
                    "price" => pending_sale.price = amount,
                    "fee" => pending_sale.fee = amount,
                    "received" => pending_sale.received = amount,
                    _ => {}
                }
                pending_sale.text.push('\n');
                pending_sale.text.push_str(&chat_text);
                if pending_sale.price.is_empty()
                    || pending_sale.fee.is_empty()
                    || pending_sale.received.is_empty()
                {
                    log.pending_gts_sale = Some(pending_sale);
                } else {
                    push_completed_gts_sale_event_if_new(log, pending_sale);
                }
            }
            continue;
        } else if looks_like_gts_sale_debug_line(&chat_text) {
            push_gts_sale_debug_sample(log, format!("NAO parseou | {} | {}", file_name, chat_text));
        }

        if let Some(reward) = parse_reward_event(&chat_text, &log.player_name) {
            let seen_key = format!(
                "reward|{}|{}|{}",
                time,
                pokemon_key(&reward.title),
                file_name
            );
            if !log.seen.contains(&seen_key) {
                log.seen.insert(seen_key);
                push_log_reward_event(
                    log,
                    reward.event_type,
                    reward.title,
                    reward.detail,
                    time.clone(),
                    file_name.clone(),
                    chat_text.clone(),
                );
            }
        }

        let Some(event) = parse_capture_event(&chat_text) else {
            continue;
        };

        if let Some(player_name) = &event.player_name {
            if !log.local_players.is_empty()
                && !log
                    .local_players
                    .iter()
                    .any(|name| name.eq_ignore_ascii_case(player_name))
            {
                log.last_ignored = Some(format!("{} capturado por {}", event.pokemon, player_name));
                continue;
            }
            if log.local_players.is_empty() {
                log.last_ignored = Some(format!(
                    "{} ignorado: jogador local ainda desconhecido",
                    event.pokemon
                ));
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

    quiz_history_changed
}

fn push_log_reward_event(
    log: &mut LogCaptureState,
    event_type: impl Into<String>,
    title: impl Into<String>,
    detail: impl Into<String>,
    log_time: String,
    source: String,
    text: String,
) {
    log.events_read += 1;
    let reward_event = LogRewardEvent {
        id: log.next_id,
        event_type: event_type.into(),
        title: title.into(),
        detail: detail.into(),
        log_time,
        detected_at: now_string(),
        source,
        text,
    };
    log.next_id += 1;
    if reward_event.event_type == "gts_sale" {
        push_gts_sale_history(log, reward_event.clone());
    }
    log.reward_events.push(reward_event);
    trim_log_reward_events(log);
}

fn push_gts_sale_history(log: &mut LogCaptureState, event: LogRewardEvent) {
    let key = log_reward_seen_key(&event);
    if log
        .gts_sales
        .iter()
        .any(|existing| log_reward_seen_key(existing) == key)
    {
        return;
    }
    log.gts_sales.push(event);
    if log.gts_sales.len() > MAX_GTS_SALE_EVENTS {
        let overflow = log.gts_sales.len() - MAX_GTS_SALE_EVENTS;
        log.gts_sales.drain(0..overflow);
    }
}

fn looks_like_gts_sale_debug_line(text: &str) -> bool {
    let clean_text = clean_minecraft_text(text).to_lowercase();
    clean_text.contains("bought your")
        || clean_text.contains("comprou seu")
        || clean_text.contains("comprou sua")
        || clean_text.contains("sale price:")
        || clean_text.contains("sale fee:")
        || clean_text.contains("amount received:")
        || clean_text.contains("venda")
        || clean_text.contains("vendido")
}

fn push_gts_sale_debug_sample(log: &mut LogCaptureState, sample: impl Into<String>) {
    let sample = sample.into();
    if sample.trim().is_empty()
        || log
            .gts_sale_debug_samples
            .iter()
            .any(|existing| existing == &sample)
    {
        return;
    }
    log.gts_sale_debug_samples.push(sample);
    if log.gts_sale_debug_samples.len() > 12 {
        let overflow = log.gts_sale_debug_samples.len() - 12;
        log.gts_sale_debug_samples.drain(0..overflow);
    }
}

fn trim_log_reward_events(log: &mut LogCaptureState) {
    if log.reward_events.len() > MAX_LOG_REWARD_EVENTS {
        let mut overflow = log.reward_events.len() - MAX_LOG_REWARD_EVENTS;
        let mut index = 0;
        while overflow > 0 && index < log.reward_events.len() {
            if log.reward_events[index].event_type == "gts_sale" {
                index += 1;
                continue;
            }
            log.reward_events.remove(index);
            overflow -= 1;
        }
        if overflow > 0 {
            log.reward_events.drain(0..overflow);
        }
    }
}

fn push_gts_sale_event_if_new(
    log: &mut LogCaptureState,
    gts_sale: ParsedRewardEvent,
    time: &str,
    file_name: &str,
    text: &str,
) {
    let seen_key = gts_seen_key(&gts_sale, time, file_name);
    if log.seen.contains(&seen_key) {
        return;
    }
    log.seen.insert(seen_key);
    push_log_reward_event(
        log,
        gts_sale.event_type,
        gts_sale.title,
        gts_sale.detail,
        time.to_string(),
        file_name.to_string(),
        text.to_string(),
    );
}

fn push_completed_gts_sale_event_if_new(log: &mut LogCaptureState, sale: PendingGtsSale) {
    let detail = format!(
        "{} | {} | {} | {} | {}",
        sale.item, sale.buyer, sale.price, sale.fee, sale.received
    );
    let event = ParsedRewardEvent {
        event_type: "gts_sale".to_string(),
        title: format!("Venda GTS: {}", sale.item),
        detail,
    };
    push_gts_sale_event_if_new(log, event, &sale.log_time, &sale.source, &sale.text);
}

fn push_imported_gts_event_if_new(log: &mut LogCaptureState, event: CollectedGtsEvent) -> bool {
    let seen_key = gts_seen_key(&event.event, &event.log_time, &event.source);
    let is_sale = event.event.event_type == "gts_sale";
    let already_visible = log
        .reward_events
        .iter()
        .any(|reward| log_reward_seen_key(reward) == seen_key)
        || log
            .gts_sales
            .iter()
            .any(|reward| log_reward_seen_key(reward) == seen_key);
    if log.seen.contains(&seen_key) {
        if !is_sale || already_visible {
            return false;
        }
    } else {
        log.seen.insert(seen_key);
    }
    push_log_reward_event(
        log,
        event.event.event_type,
        event.event.title,
        event.event.detail,
        event.log_time,
        event.source,
        event.text,
    );
    true
}

fn gts_seen_key(event: &ParsedRewardEvent, time: &str, file_name: &str) -> String {
    gts_seen_key_parts(&event.event_type, &event.detail, time, file_name)
}

fn log_reward_seen_key(event: &LogRewardEvent) -> String {
    gts_seen_key_parts(&event.event_type, &event.detail, &event.log_time, &event.source)
}

fn gts_seen_key_parts(event_type: &str, detail: &str, time: &str, file_name: &str) -> String {
    let prefix = if event_type == "gts_sale" {
        "gts-sale"
    } else {
        "gts"
    };
    format!(
        "{}|{}|{}|{}",
        prefix,
        time,
        pokemon_key(detail),
        file_name
    )
}

fn push_quiz_event_if_new(
    log: &mut LogCaptureState,
    quiz: ParsedQuizEvent,
    time: &str,
    file_name: &str,
) {
    let seen_key = format!(
        "quiz|{}|{}|{}|{}",
        quiz.title,
        pokemon_key(&quiz.detail),
        time,
        file_name
    );
    if log.seen.contains(&seen_key) {
        return;
    }
    log.seen.insert(seen_key);
    push_log_reward_event(
        log,
        "quiz",
        quiz.title,
        quiz.detail,
        time.to_string(),
        file_name.to_string(),
        quiz.question,
    );
}

struct ParsedEvent {
    pokemon: String,
    event_type: String,
    confidence: String,
    player_name: Option<String>,
}

struct ParsedRewardEvent {
    event_type: String,
    title: String,
    detail: String,
}

struct CollectedGtsEvent {
    event: ParsedRewardEvent,
    log_time: String,
    source: String,
    text: String,
}

struct ParsedQuizEvent {
    title: String,
    detail: String,
    question: String,
}

#[derive(Debug)]
struct PendingQuiz {
    title: String,
    question: String,
}

#[derive(Debug)]
struct PendingWhoIsQuiz {
    clue: String,
}

#[derive(Debug)]
struct PendingGtsSale {
    buyer: String,
    item: String,
    price: String,
    fee: String,
    received: String,
    log_time: String,
    source: String,
    text: String,
}

#[derive(Debug)]
struct ParsedGtsSaleStart {
    buyer: String,
    item: String,
}

fn parse_chat_line(line: &str) -> Option<(String, String)> {
    let marker = "[CHAT] ";
    let marker_index = line.find(marker)?;
    let time = line.get(1..9).unwrap_or("").to_string();
    let text = clean_minecraft_text(&line[marker_index + marker.len()..]);
    Some((time, text))
}

fn is_likely_player_chat_message(text: &str) -> bool {
    let clean_text = clean_minecraft_text(text);
    let text_key = pokemon_key(&clean_text);
    if text_key.contains("privado")
        && (clean_text.contains(" -> ")
            || clean_text.contains("->")
            || clean_text.contains('\u{00bb}')
            || clean_text.contains("\u{00c2}\u{00bb}"))
    {
        return true;
    }

    let separator_index = clean_text
        .find('\u{00bb}')
        .or_else(|| clean_text.find("\u{00c2}\u{00bb}"));
    let Some(index) = separator_index else {
        return false;
    };
    let prefix = clean_text[..index].trim();
    let message = clean_text[index..]
        .trim_start_matches('\u{00bb}')
        .trim_start_matches("\u{00c2}\u{00bb}")
        .trim();
    if prefix.is_empty() || message.is_empty() {
        return false;
    }

    let speaker = prefix
        .split(']')
        .next_back()
        .unwrap_or(prefix)
        .split_whitespace()
        .next_back()
        .unwrap_or("")
        .trim();
    let Some(clean_speaker) = clean_player_name(speaker) else {
        return false;
    };
    let speaker_key = pokemon_key(&clean_speaker);
    if speaker_key.is_empty()
        || ["pxbr", "rsk", "gts", "system", "sistema"].contains(&speaker_key.as_str())
    {
        return false;
    }

    true
}

fn parse_invasion_event(text: &str) -> Option<ParsedRewardEvent> {
    let clean_text = clean_minecraft_text(text);
    let lower = clean_text.to_lowercase();
    let text_key = pokemon_key(&clean_text);
    let has_invasion = lower.contains("invas") || text_key.contains("invas");
    let has_navio_warp = lower.contains("/warp navio") || text_key.contains("warpnavio");
    let started =
        lower.contains("acaba de ser iniciada") || text_key.contains("acabadeseriniciada");

    if !has_invasion || !has_navio_warp || !started {
        return None;
    }

    Some(ParsedRewardEvent {
        event_type: "invasion".to_string(),
        title: summarize_invasion_title(&clean_text),
        detail: clean_text,
    })
}

fn summarize_invasion_title(text: &str) -> String {
    let lower = text.to_lowercase();
    if let Some(index) = lower.find("por ") {
        let after = text[index + 4..].trim();
        let player = after
            .split('.')
            .next()
            .unwrap_or("")
            .trim_matches(|character: char| {
                character.is_whitespace() || matches!(character, ':' | '-' | '!' | '[' | ']')
            })
            .trim();
        if !player.is_empty() && !player.to_lowercase().contains("/warp") {
            let player = player.chars().take(40).collect::<String>();
            return format!("Invasao iniciada por {}", player);
        }
    }
    "Invasao iniciada".to_string()
}

fn parse_gts_listing_event(text: &str) -> Option<ParsedRewardEvent> {
    let clean_text = clean_minecraft_text(text);
    let lower = clean_text.to_lowercase();
    if !lower.contains("[gts")
        || (!lower.contains(" added a ") && !lower.contains(" added an "))
    {
        return None;
    }

    let market = if lower.contains("[gts global]") {
        "GTS Global"
    } else {
        "GTS"
    };
    let (_, after_prefix) = clean_text.split_once(']')?;
    let (seller, rest) = after_prefix
        .trim()
        .split_once(" added an ")
        .or_else(|| after_prefix.trim().split_once(" added a "))?;
    let markers = [" to the global GTS", " to the GTS"];
    let (item, after_item) = markers.iter().find_map(|marker| {
        rest.find(marker)
            .map(|index| (rest[..index].trim(), rest[index + marker.len()..].trim()))
    })?;
    if item.is_empty() || seller.trim().is_empty() {
        return None;
    }

    let (listing_type, price) =
        if let Some((_, price)) = after_item.split_once("by auction, starting at ") {
            ("Leilao", price)
        } else if let Some((_, price)) = after_item.split_once("for ") {
            ("Venda", price)
        } else {
            return None;
        };
    let price = price.trim().trim_end_matches('!').trim();
    if price.is_empty() {
        return None;
    }

    Some(ParsedRewardEvent {
        event_type: "gts".to_string(),
        title: format!("{}: {}", market, item),
        detail: format!(
            "{} | {} | {} | {}",
            item,
            price,
            seller.trim(),
            listing_type
        ),
    })
}

fn parse_gts_sale_event(text: &str) -> Option<ParsedRewardEvent> {
    let clean_text = clean_minecraft_text(text);
    let lower = clean_text.to_lowercase();
    let marker = " comprou seu ";
    let index = lower.find(marker)?;
    let before = clean_text.get(..index)?.trim();
    let after = clean_text.get(index + marker.len()..)?.trim();
    let item = after.trim_end_matches('!').trim();
    if item.is_empty() {
        return None;
    }
    let buyer = before
        .split_whitespace()
        .last()
        .unwrap_or(before)
        .trim_matches(|character: char| {
            character.is_whitespace() || matches!(character, '[' | ']' | ':' | '-' | '!' | '»')
        })
        .trim();
    if buyer.is_empty() {
        return None;
    }

    Some(ParsedRewardEvent {
        event_type: "gts_sale".to_string(),
        title: format!("Venda GTS: {}", item),
        detail: format!("{} | {}", item, buyer),
    })
}

fn parse_gts_sale_start_event(text: &str) -> Option<ParsedGtsSaleStart> {
    let clean_text = clean_minecraft_text(text);
    let lower = clean_text.to_lowercase();
    let marker = " bought your ";
    let index = lower.find(marker)?;
    let before = clean_text.get(..index)?.trim();
    let after = clean_text.get(index + marker.len()..)?.trim();
    let item = after.split('!').next().unwrap_or(after).trim();
    if item.is_empty() {
        return None;
    }
    let buyer = before
        .split_whitespace()
        .next_back()
        .unwrap_or(before)
        .trim_matches(|character: char| {
            character.is_whitespace()
                || matches!(
                    character,
                    '[' | ']' | ':' | '-' | '!' | '\u{00c2}' | '\u{00bb}'
                )
        })
        .trim();
    if buyer.is_empty() {
        return None;
    }

    Some(ParsedGtsSaleStart {
        buyer: buyer.to_string(),
        item: item.to_string(),
    })
}

fn parse_gts_sale_amount_value(text: &str, marker: &str) -> Option<String> {
    let clean_text = clean_minecraft_text(text).replace("\\n", "\n");
    let lower = clean_text.to_lowercase();
    let index = lower.find(marker)? + marker.len();
    let amount = clean_text
        .get(index..)?
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .trim_end_matches('!')
        .trim();
    if amount.is_empty() {
        return None;
    }
    Some(amount.to_string())
}

fn parse_gts_sale_bundle_event(text: &str) -> Option<ParsedRewardEvent> {
    let sale = parse_gts_sale_start_event(text)?;
    let price = parse_gts_sale_amount_value(text, "sale price:")?;
    let fee = parse_gts_sale_amount_value(text, "sale fee:")?;
    let received = parse_gts_sale_amount_value(text, "amount received:")?;
    Some(ParsedRewardEvent {
        event_type: "gts_sale".to_string(),
        title: format!("Venda GTS: {}", sale.item),
        detail: format!(
            "{} | {} | {} | {} | {}",
            sale.item, sale.buyer, price, fee, received
        ),
    })
}

fn parse_gts_sale_amount_line(text: &str) -> Option<(&'static str, String)> {
    let clean_text = clean_minecraft_text(text);
    let lower = clean_text.to_lowercase();
    let markers = [
        ("sale price:", "price"),
        ("sale fee:", "fee"),
        ("amount received:", "received"),
    ];
    let (marker, field) = markers
        .iter()
        .find(|(marker, _)| lower.contains(*marker))?;
    let index = lower.find(marker)? + marker.len();
    let amount = clean_text.get(index..)?.trim().trim_end_matches('!').trim();
    if amount.is_empty() {
        return None;
    }
    Some((*field, amount.to_string()))
}

fn parse_quiz_event(text: &str) -> Option<ParsedQuizEvent> {
    let clean_text = clean_minecraft_text(text);
    let text_key = pokemon_key(&clean_text);

    if text_key.contains("qualeotipoelementaldo")
        || text_key.contains("qualotipoelementaldo")
        || text_key.contains("qualeotipoelementaledo")
        || text_key.contains("qualotipoelementaledo")
        || text_key.contains("qualeeoelementodo")
        || text_key.contains("qualeoelementodo")
        || text_key.contains("qualoelementodo")
        || text_key.contains("queeoelementodo")
        || text_key.contains("qualeotipodopokemon")
        || text_key.contains("qualotipodopokemon")
    {
        let pokemon = extract_quiz_pokemon_after(
            &clean_text,
            &[
                "tipo elemental do ",
                "tipo elementale do ",
                "tipo elemental de ",
                "tipo elementale de ",
                "tipo do pokemon ",
                "tipo do ",
                "elemento do pokemon ",
                "elemento do pokmon ",
                "elemento do ",
            ],
        )?;
        return Some(ParsedQuizEvent {
            title: "Curiosidade: Tipo Elemental".to_string(),
            detail: pokemon,
            question: clean_text,
        });
    }

    if text_key.contains("qualeoegggroupdo")
        || text_key.contains("qualoegggroupdo")
        || text_key.contains("qualeoegggrupodo")
        || text_key.contains("qualoegggrupodo")
    {
        let pokemon = extract_quiz_pokemon_after(
            &clean_text,
            &[
                "egggroup do ",
                "egg group do ",
                "egggroup de ",
                "egg group de ",
            ],
        )?;
        return Some(ParsedQuizEvent {
            title: "Curiosidade: EggGroup".to_string(),
            detail: pokemon,
            question: clean_text,
        });
    }

    if is_ability_by_pokemon_quiz_key(&text_key) {
        let pokemon = extract_quiz_pokemon_after(
            &clean_text,
            &[
                "habilidades do pokemon ",
                "habilidades do pokmon ",
                "habilidade do pokemon ",
                "habilidade do pokmon ",
            ],
        )?;
        return Some(ParsedQuizEvent {
            title: "Curiosidade: Habilidade".to_string(),
            detail: pokemon,
            question: clean_text,
        });
    }

    None
}

fn parse_pending_quiz_prompt(text: &str) -> Option<PendingQuiz> {
    let clean_text = clean_minecraft_text(text);
    let text_key = pokemon_key(&clean_text);
    if !is_ability_by_pokemon_quiz_key(&text_key) {
        return None;
    }

    Some(PendingQuiz {
        title: "Curiosidade: Habilidade".to_string(),
        question: clean_text,
    })
}

fn is_ability_by_pokemon_quiz_key(text_key: &str) -> bool {
    text_key.contains("citeumadashabilidadesdopokemon")
        || text_key.contains("citeumadashabilidadesdopokmon")
        || text_key.contains("citeumahabilidadedopokemon")
        || text_key.contains("citeumahabilidadedopokmon")
}

fn parse_pending_quiz_event(pending: Option<PendingQuiz>, text: &str) -> Option<ParsedQuizEvent> {
    let pending = pending?;
    let pokemon = clean_quiz_pokemon_name(text)?;
    Some(ParsedQuizEvent {
        title: pending.title,
        detail: pokemon,
        question: pending.question,
    })
}

fn parse_who_is_pokemon_prompt(text: &str) -> Option<String> {
    let clean_text = clean_minecraft_text(text);
    let text_key = pokemon_key(&clean_text);
    if text_key.contains("qualeessepokemon")
        || text_key.contains("qualessepokemon")
        || text_key.contains("qualaessepokemon")
        || text_key.contains("qualaessepokamon")
        || text_key.contains("qualesspokmon")
        || text_key.contains("qualessepokmon")
        || text_key.contains("quemeeessepokemon")
        || text_key.contains("quemessepokemon")
    {
        return Some(clean_text);
    }
    None
}

fn parse_ability_description_prompt(text: &str) -> Option<String> {
    let clean_text = clean_minecraft_text(text);
    let text_key = pokemon_key(&clean_text);
    if text_key.contains("qualeessahabilidade")
        || text_key.contains("qualessahabilidade")
        || text_key.contains("queeessahabilidade")
        || text_key.contains("quehabilidadeeessa")
    {
        return Some(clean_text);
    }
    None
}

fn parse_who_is_pokemon_event(text: &str) -> Option<ParsedQuizEvent> {
    let prompt = parse_who_is_pokemon_prompt(text)?;
    let clean_text = clean_minecraft_text(text);
    let after_question = clean_text
        .split_once('?')
        .map(|(_, after)| after)
        .unwrap_or("");
    let clue = clean_quiz_clue(after_question)?;
    Some(ParsedQuizEvent {
        title: "Qual e esse Pokemon?".to_string(),
        detail: clue,
        question: prompt,
    })
}

fn parse_ability_description_event(text: &str) -> Option<ParsedQuizEvent> {
    let prompt = parse_ability_description_prompt(text)?;
    let clean_text = clean_minecraft_text(text);
    let after_question = clean_text
        .split_once('?')
        .map(|(_, after)| after)
        .unwrap_or("");
    let clue = clean_quiz_clue(after_question)?;
    Some(ParsedQuizEvent {
        title: "Qual e essa Habilidade?".to_string(),
        detail: clue,
        question: prompt,
    })
}

fn parse_pending_complex_quiz_event(prompt: String, text: &str) -> Option<ParsedQuizEvent> {
    let title = if parse_ability_description_prompt(&prompt).is_some() {
        "Qual e essa Habilidade?"
    } else if parse_who_is_pokemon_prompt(&prompt).is_some() {
        "Qual e esse Pokemon?"
    } else {
        return None;
    };
    let clue = clean_quiz_clue(text)?;
    Some(ParsedQuizEvent {
        title: title.to_string(),
        detail: clue,
        question: prompt,
    })
}

fn parse_complex_quiz_timeout_event(text: &str) -> Option<(ParsedQuizEvent, String)> {
    let answer = parse_quiz_timeout_answer(text)?;
    let quiz =
        parse_who_is_pokemon_event(text).or_else(|| parse_ability_description_event(text))?;
    Some((quiz, answer))
}

fn parse_quiz_timeout_answer(text: &str) -> Option<String> {
    let clean_text = clean_minecraft_text(text);
    let key = pokemon_key(&clean_text);
    if !key.contains("aquestaonafoirespondidaatempo")
        && !key.contains("respostasaceitaveiseram")
        && !key.contains("respostasaceitveiseram")
        && !key.contains("respostasaceitviseram")
    {
        return None;
    }

    let lower = clean_text.to_lowercase();
    let markers = [
        "respostas aceitaveis eram:",
        "respostas aceitáveis eram:",
        "respostas aceit�veis eram:",
        "respostas aceitveis eram:",
    ];
    let (index, marker) = markers
        .iter()
        .find_map(|marker| lower.find(marker).map(|index| (index, *marker)))?;
    let answer = clean_text.get(index + marker.len()..)?.trim();
    clean_quiz_timeout_answer(answer)
}

fn clean_quiz_clue(value: &str) -> Option<String> {
    let clean_value = clean_minecraft_text(value).replace("\\n", " ");
    let clue = strip_leading_quiz_color_prefix(&strip_quiz_result_tail(&clean_value))
        .trim_matches(|character: char| character.is_whitespace() || matches!(character, '[' | ']'))
        .trim()
        .chars()
        .take(360)
        .collect::<String>();
    let key = pokemon_key(&clue);
    if key.len() < 20
        || key.contains("curiosidade")
        || key.contains("qualeessepokemon")
        || key.contains("respostasaceitaveis")
        || key.contains("respondeucorretamente")
    {
        return None;
    }
    Some(clue)
}

fn strip_quiz_result_tail(value: &str) -> String {
    let lower = value.to_lowercase();
    let markers = [
        "a questao nao foi respondida",
        "a questão não foi respondida",
        "a questÃ£o nÃ£o foi respondida",
        "a questï¿½o nï¿½o foi respondida",
        "respostas aceitaveis eram",
        "respostas aceitáveis eram",
        "respostas aceitÃ¡veis eram",
        "respostas aceitï¿½veis eram",
        "respostas aceitveis eram",
    ];
    let cut = markers.iter().filter_map(|marker| lower.find(marker)).min();
    cut.and_then(|index| value.get(..index))
        .unwrap_or(value)
        .trim()
        .to_string()
}

fn clean_quiz_answer(value: &str) -> Option<String> {
    let answer = clean_minecraft_text(value)
        .trim_matches(|character: char| {
            character.is_whitespace()
                || matches!(character, '.' | '!' | '?' | ':' | '-' | '[' | ']')
        })
        .trim()
        .split(',')
        .next()
        .unwrap_or("")
        .trim()
        .chars()
        .take(80)
        .collect::<String>();
    let key = pokemon_key(&answer);
    if key.len() < 2 {
        return None;
    }
    Some(format_known_egg_group_answer(&answer).unwrap_or(answer))
}

fn format_known_egg_group_answer(value: &str) -> Option<String> {
    let key = pokemon_key(value);
    let label = match key.as_str() {
        "monster" => "Monster",
        "water1" => "Water 1",
        "bug" => "Bug",
        "flying" => "Flying",
        "ground" | "field" => "Field",
        "fairy" => "Fairy",
        "plant" | "grass" => "Grass",
        "humanshape" | "humanlike" => "Human-Like",
        "water3" => "Water 3",
        "mineral" => "Mineral",
        "indeterminate" | "amorphous" => "Amorphous",
        "water2" => "Water 2",
        "ditto" => "Ditto",
        "dragon" => "Dragon",
        "noeggs" | "undiscovered" => "Undiscovered",
        _ => return None,
    };
    Some(label.to_string())
}

fn strip_leading_quiz_color_prefix(value: &str) -> String {
    let trimmed = value.trim();
    let mut chars = trimmed.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    let Some(second) = chars.next() else {
        return trimmed.to_string();
    };
    if is_minecraft_format_code(first) && (second.is_ascii_uppercase() || second.is_whitespace()) {
        if second.is_whitespace() {
            return chars.as_str().trim_start().to_string();
        }
        let mut output = chars.as_str().to_string();
        output.insert(0, second);
        return output;
    }
    trimmed.to_string()
}

fn clean_quiz_timeout_answer(value: &str) -> Option<String> {
    let answer = clean_quiz_answer(value)?;
    let answer = strip_quiz_timeout_color_prefix(&answer);
    let key = pokemon_key(&answer);
    if key.len() < 2 {
        return None;
    }
    Some(format_known_egg_group_answer(&answer).unwrap_or(answer))
}

fn strip_quiz_timeout_color_prefix(value: &str) -> String {
    let trimmed = value.trim();
    if let Some(answer) = format_known_egg_group_answer(trimmed) {
        return answer;
    }
    let mut chars = trimmed.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    let Some(second) = chars.next() else {
        return trimmed.to_string();
    };
    if first == 'b' && second.is_ascii_lowercase() {
        let mut output = chars.as_str().to_string();
        output.insert(0, second);
        return output;
    }
    trimmed.to_string()
}

fn extract_quiz_pokemon_after(text: &str, markers: &[&str]) -> Option<String> {
    let lower = text.to_lowercase();
    for marker in markers {
        if let Some(index) = lower.find(marker) {
            let after = text.get(index + marker.len()..)?;
            return clean_quiz_pokemon_name(after);
        }
    }
    None
}

fn clean_quiz_pokemon_name(value: &str) -> Option<String> {
    let cleaned_name_source = clean_minecraft_text(value).replace("\\n", " ");
    let raw_name_segment = cleaned_name_source
        .trim()
        .split("  ")
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    let mut name = raw_name_segment
        .trim_matches(|character: char| {
            character.is_whitespace()
                || matches!(character, '?' | '!' | '.' | ':' | '-' | '[' | ']')
        })
        .trim()
        .chars()
        .take(60)
        .collect::<String>();

    let mut stripped_leading_format_code = false;
    if name.chars().count() > 2 {
        let mut chars = name.chars();
        if let (Some(first), Some(second)) = (chars.next(), chars.next()) {
            let looks_like_leftover_color_code = matches!(
              first,
              '0'..='9' | 'a'..='f' | 'k'..='o' | 'r'
            ) && second.is_ascii_uppercase();
            if looks_like_leftover_color_code {
                name = chars.as_str().to_string();
                name.insert(0, second);
                stripped_leading_format_code = true;
            }
        }
    }

    if stripped_leading_format_code
        && name.chars().count() > 2
        && has_trailing_format_code_before_punctuation(&raw_name_segment)
    {
        if name
            .chars()
            .next_back()
            .is_some_and(is_minecraft_format_code)
        {
            name.pop();
        }
    } else if has_trailing_replacement_format_code(value) {
        name.pop();
    }

    let key = pokemon_key(&name);
    if key.len() < 2
        || ["curiosidade", "correto", "incorreto"].contains(&key.as_str())
        || key.contains("respondeu")
    {
        return None;
    }
    Some(name)
}

fn has_trailing_format_code_before_punctuation(value: &str) -> bool {
    let mut skipped_punctuation = false;
    let mut chars = value.trim().chars().rev();
    for character in chars.by_ref() {
        if character.is_whitespace() {
            continue;
        }
        if matches!(character, '?' | '!' | '.' | ':' | '-' | '[' | ']') {
            skipped_punctuation = true;
            continue;
        }
        return skipped_punctuation && is_minecraft_format_code(character);
    }
    false
}

fn has_trailing_replacement_format_code(value: &str) -> bool {
    let trimmed = value.trim().trim_end_matches(|character: char| {
        character.is_whitespace() || matches!(character, '?' | '!' | '.' | ':' | '-' | '[' | ']')
    });
    let mut chars = trimmed.chars().rev();
    let Some(last) = chars.next() else {
        return false;
    };
    let Some(before_last) = chars.next() else {
        return false;
    };
    before_last == '\u{fffd}' && is_minecraft_format_code(last)
}

fn is_minecraft_format_code(character: char) -> bool {
    matches!(
        character,
        '0'..='9' | 'a'..='f' | 'k'..='o' | 'r' | 'A'..='F' | 'K'..='O' | 'R'
    )
}

fn parse_reward_event(text: &str, player_name: &str) -> Option<ParsedRewardEvent> {
    let player_name = player_name.trim();
    if player_name.is_empty() {
        return None;
    }

    let clean_text = clean_minecraft_text(text);
    let lower = clean_text.to_lowercase();
    let text_key = pokemon_key(&clean_text);
    let player_key = pokemon_key(player_name);
    if player_key.is_empty() || !text_key.contains(&player_key) {
        return None;
    }

    if lower.contains("captur") || lower.contains("captured") || lower.contains("sent to your pc") {
        return None;
    }

    let reward_key = pokemon_key(&clean_text);
    let has_gain_signal = [
        "ganhou",
        "recebeu",
        "received",
        "won",
        "reward",
        "recompensa",
        "premio",
        "claim",
        "obtained",
        "obteve",
        "gacha",
        "caixa",
        "crate",
        "money",
        "coins",
        "cash",
        "dinheiro",
        "saldo",
    ]
    .iter()
    .any(|marker| lower.contains(marker) || reward_key.contains(marker));
    if !has_gain_signal {
        return None;
    }

    let event_type = if ["gacha", "pokegacha", "caixa", "crate"]
        .iter()
        .any(|marker| lower.contains(marker) || reward_key.contains(marker))
    {
        "gacha"
    } else if ["money", "coins", "cash", "dinheiro", "saldo", "pokedollar"]
        .iter()
        .any(|marker| lower.contains(marker) || reward_key.contains(marker))
        || clean_text.contains('$')
    {
        "money"
    } else if ["reward", "recompensa", "premio"]
        .iter()
        .any(|marker| lower.contains(marker) || reward_key.contains(marker))
    {
        "reward"
    } else {
        "item"
    };

    let title = summarize_reward_title(&clean_text, player_name);
    Some(ParsedRewardEvent {
        event_type: event_type.to_string(),
        detail: clean_text,
        title,
    })
}

fn summarize_reward_title(text: &str, player_name: &str) -> String {
    let mut summary = text.replace(player_name, "");
    for marker in [
        "ganhou",
        "recebeu",
        "received",
        "won",
        "reward",
        "recompensa",
        "claim",
        "obtained",
        "obteve",
    ] {
        if let Some(index) = summary.to_lowercase().find(marker) {
            summary = summary[index + marker.len()..].to_string();
            break;
        }
    }
    let summary = summary
        .trim_matches(|character: char| {
            character.is_whitespace() || matches!(character, ':' | '-' | '!' | '.' | '[' | ']')
        })
        .trim();
    let fallback = text.trim();
    let value = if summary.is_empty() {
        fallback
    } else {
        summary
    };
    value.chars().take(96).collect()
}

fn parse_capture_event(text: &str) -> Option<ParsedEvent> {
    let normalized_text = clean_minecraft_text(text);
    let text = normalized_text.as_str();
    let lower = text.to_lowercase();
    if lower.contains("pokegacha") || lower.contains("pokégacha") {
        return None;
    }

    if let Some(name) = parse_english_pc_capture(text) {
        return Some(ParsedEvent {
            pokemon: name,
            event_type: "local-capture-sent-to-pc".to_string(),
            confidence: "alta".to_string(),
            player_name: None,
        });
    }

    if let Some(name) = parse_portuguese_pc_capture(text) {
        return Some(ParsedEvent {
            pokemon: name,
            event_type: "local-capture-sent-to-pc".to_string(),
            confidence: "alta".to_string(),
            player_name: None,
        });
    }

    if let Some(name) = capture_between(text, "You captured ", "!") {
        let name = clean_capture_name(&name)?;
        return Some(ParsedEvent {
            pokemon: name,
            event_type: "local-capture".to_string(),
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

fn parse_english_pc_capture(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let start_marker = "your party is full";
    let start_index = lower.find(start_marker)? + start_marker.len();
    let after_start = text
        .get(start_index..)?
        .trim_start_matches(|character: char| {
            character.is_whitespace() || matches!(character, '.' | '!' | ':' | '-')
        });
    let after_lower = after_start.to_lowercase();
    let end_marker = " was sent to your pc";
    let end_index = after_lower.find(end_marker)?;
    clean_capture_name(&after_start[..end_index])
}

fn parse_portuguese_pc_capture(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let start_markers = [
        "você já tem 6 pokémons",
        "você já tem 6 pokemons",
        "voce ja tem 6 pokemons",
        "vocÃª jÃ¡ tem 6 pokemons",
        "voc� j� tem 6 pokemons",
    ];
    let start_marker = start_markers
        .iter()
        .find(|marker| lower.contains(**marker))?;
    let start_index = lower.find(start_marker)? + start_marker.len();
    let mut after_start = text
        .get(start_index..)?
        .trim_start_matches(|character: char| {
            character.is_whitespace() || matches!(character, '.' | '!' | ':' | '-')
        });
    let after_start_lower = after_start.to_lowercase();
    for prefix in ["no seu time", "em seu time", "na sua equipe"] {
        if after_start_lower.trim_start().starts_with(prefix) {
            let trimmed = after_start.trim_start();
            let separator_index =
                trimmed.find(|character| matches!(character, '.' | '!' | ':' | '-'))?;
            after_start =
                trimmed
                    .get(separator_index + 1..)?
                    .trim_start_matches(|character: char| {
                        character.is_whitespace() || matches!(character, '.' | '!' | ':' | '-')
                    });
            break;
        }
    }
    let after_lower = after_start.to_lowercase();
    let end_markers = [
        " foi mandado(a) para o pc",
        " foi mandado para o pc",
        " foi enviada para o pc",
        " foi enviado para o pc",
    ];
    let end_marker = end_markers
        .iter()
        .find(|marker| after_lower.contains(**marker))?;
    let end_index = after_lower.find(end_marker)?;
    clean_capture_name(&after_start[..end_index])
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
    let pokemon_part = split_capture_tail(pokemon_part);
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
    let clean_value = clean_minecraft_text(value);
    let output = clean_value
        .replace("Lendário", "")
        .replace("Lendário", "")
        .replace("Lendario", "")
        .replace("LendÃ¡rio", "")
        .replace("Lend�rio", "")
        .replace("Mítico", "")
        .replace("Mítico", "")
        .replace("Mitico", "")
        .replace("MÃ­tico", "")
        .replace("M�tico", "")
        .replace("Ultra Beast", "")
        .replace("Pokémon", "")
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
    let end = after
        .find(" da Caixa ")
        .or_else(|| after.find(" da caixa "))
        .unwrap_or(after.len());
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
    let mut chars = text.chars().peekable();

    while let Some(character) = chars.next() {
        if skip_next {
            skip_next = false;
            continue;
        }
        if character == '&' {
            let mut lookahead = chars.clone();
            if lookahead.next() == Some('#') {
                let hex = [
                    lookahead.next(),
                    lookahead.next(),
                    lookahead.next(),
                    lookahead.next(),
                    lookahead.next(),
                    lookahead.next(),
                ];
                if hex
                    .iter()
                    .all(|value| value.is_some_and(|item| item.is_ascii_hexdigit()))
                {
                    chars.next();
                    for _ in 0..6 {
                        chars.next();
                    }
                    continue;
                }
            }
        }
        if character == '§' {
            skip_next = true;
            continue;
        }
        if character == '&' || character == '§' || character == '\u{00a7}' {
            skip_next = true;
            continue;
        }
        if character == '\u{fffd}' {
            let mut lookahead = chars.clone();
            if let (Some(next), Some(after_next)) = (lookahead.next(), lookahead.next()) {
                if is_minecraft_format_code(next)
                    && (after_next.is_ascii_uppercase()
                        || after_next.is_whitespace()
                        || after_next.is_ascii_punctuation())
                {
                    chars.next();
                }
            }
            continue;
        }
        if character.is_control() {
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

    name.to_lowercase()
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
        player_name: log.player_name.clone(),
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
        reward_events: log.reward_events.clone(),
        gts_sales: log.gts_sales.clone(),
        gts_sale_debug_samples: log.gts_sale_debug_samples.clone(),
        quiz_history: log.quiz_history.clone(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_party_full_capture_with_minecraft_formatting_codes() {
        let event =
            parse_capture_event("Your party is full. &rHitmonchan&r was sent to your PC!&r")
                .unwrap();

        assert_eq!(event.pokemon, "Hitmonchan");
        assert_eq!(event.event_type, "local-capture-sent-to-pc");
        assert_eq!(event.confidence, "alta");
        assert!(event.player_name.is_none());
    }

    #[test]
    fn parses_party_full_capture_with_section_formatting_codes() {
        let event =
            parse_capture_event("Your party is full! §aCharmander§r was sent to your PC!").unwrap();

        assert_eq!(event.pokemon, "Charmander");
        assert_eq!(event.event_type, "local-capture-sent-to-pc");
    }

    #[test]
    fn parses_portuguese_party_full_capture_with_formatting_codes() {
        let event = parse_capture_event(
            "Você já tem 6 Pokemons no seu time. &rQuagsire&r foi mandado(a) para o PC!&r",
        )
        .unwrap();

        assert_eq!(event.pokemon, "Quagsire");
        assert_eq!(event.event_type, "local-capture-sent-to-pc");
        assert_eq!(event.confidence, "alta");
        assert!(event.player_name.is_none());
    }

    #[test]
    fn parses_direct_capture_with_formatting_codes() {
        let event = parse_capture_event("You captured &bSquirtle&r!").unwrap();

        assert_eq!(event.pokemon, "Squirtle");
        assert_eq!(event.event_type, "local-capture");
    }

    #[test]
    fn parses_global_capture_with_hex_formatting_codes() {
        let event = parse_capture_event("&a&lPX&r&e&lBR&r&e &r&8&l»&r&8 &r&#3DAC00U&r&#41B102m&r&#45B603 &r&#49BB05L&r&#4DC007e&r&#51C408n&r&#55C90Ad&r&#59CE0Cá&r&#5DD30Dr&r&#61D80Fi&r&#65DD10o&r&#69E212 &r&#6DE714L&r&#71EB15a&r&#75F017t&r&#79F519i&r&#7DFA1Aa&r&#81FF1Cs&r&#81FF1C,&r&#7AF719c&r&#73EE16o&r&#6DE614m&r&#66DE11 &r&#5FD60E7&r&#58CD0B8&r&#51C508.&r&#4BBD062&r&#44B4036&r&#3DAC00%&r&#42B202 &r&#46B704d&r&#4BBD06e&r&#4FC207 &r&#54C809I&r&#58CD0BV&r&#5DD30Ds&r&#61D80F,&r&#66DE11 &r&#6AE313f&r&#6FE915o&r&#73EE16i&r&#78F418 &r&#7CF91Ac&r&#81FF1Ca&r&#81FF1Cpturado por Jorgimgamiprays&r").unwrap();

        assert_eq!(event.pokemon, "Latias");
        assert_eq!(event.player_name.as_deref(), Some("Jorgimgamiprays"));
        assert_eq!(event.event_type, "capture");
    }

    #[test]
    fn initial_scan_reads_recent_existing_log_lines() {
        let dir = env::temp_dir().join(format!(
            "pixelmon-log-scan-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let log_path = dir.join("latest.log");
        fs::write(
            &log_path,
            "[12:00:00] [Client thread/INFO]: [CHAT] You captured &bSquirtle&r!\n",
        )
        .unwrap();

        let mut log = LogCaptureState {
            enabled: true,
            log_directory: dir.to_string_lossy().to_string(),
            ..Default::default()
        };

        let quiz_history_path = dir.join("quiz-history.json");
        scan_logs(&mut log, &HashSet::new(), &quiz_history_path);

        fs::remove_file(log_path).unwrap();
        let _ = fs::remove_file(quiz_history_path);
        fs::remove_dir(dir).unwrap();

        assert_eq!(log.candidates.len(), 1);
        assert_eq!(log.candidates[0].pokemon, "Squirtle");
        assert_eq!(log.offset, log.current_size);
    }

    #[test]
    fn initial_log_history_offset_keeps_small_files_from_start() {
        assert_eq!(initial_log_history_offset(32), 0);
        assert_eq!(
            initial_log_history_offset(INITIAL_LOG_HISTORY_BYTES + 10),
            10
        );
    }

    #[test]
    fn parses_reward_event_for_configured_player() {
        let event = parse_reward_event(
            "[Gacha] SuperFast recebeu 3 Rare Candy da caixa diaria.",
            "SuperFast",
        )
        .unwrap();

        assert_eq!(event.event_type, "gacha");
        assert!(event.title.contains("3 Rare Candy"));
    }

    #[test]
    fn ignores_reward_event_from_other_player() {
        assert!(
            parse_reward_event("[Gacha] OutroPlayer recebeu 3 Rare Candy.", "SuperFast").is_none()
        );
    }

    #[test]
    fn parses_invasion_event_started_with_navio_warp() {
        let event = parse_invasion_event(
            "Invasao ? Uma Invasao acaba de ser iniciada por MCigrepousando. (/warp navio)",
        )
        .unwrap();

        assert_eq!(event.event_type, "invasion");
        assert!(event.title.contains("MCigrepousando"));
    }

    #[test]
    fn ignores_invasion_chat_without_start_signal() {
        assert!(parse_invasion_event("alguem abre invasao ai?").is_none());
        assert!(
            parse_invasion_event("[Esconde-Esconde] Procure o jogador na /Warp invasao!").is_none()
        );
    }

    #[test]
    fn parses_gts_global_listing_event() {
        let event = parse_gts_listing_event("§7[§6GTS Global§7] §eSOLDADOQUADRADO§7 added a Gift Card de §r§bR$5.00§r to the global GTS for §b$ 12,000,000.00 PokéCoins!§r").unwrap();

        assert_eq!(event.event_type, "gts");
        assert_eq!(event.title, "GTS Global: Gift Card de R$5.00");
        assert_eq!(
            event.detail,
            "Gift Card de R$5.00 | $ 12,000,000.00 PokéCoins | SOLDADOQUADRADO | Venda"
        );
    }

    #[test]
    fn parses_gts_auction_listing_event() {
        let event = parse_gts_listing_event(
            "[GTS Global] Yalx_ added a Ogerpon to the global GTS by auction, starting at $ 50,000,000.00 PokéCoins!",
        )
        .unwrap();

        assert_eq!(event.event_type, "gts");
        assert_eq!(
            event.detail,
            "Ogerpon | $ 50,000,000.00 PokéCoins | Yalx_ | Leilao"
        );
    }

    #[test]
    fn parses_gts_listing_with_an_article() {
        let event = parse_gts_listing_event(
            "[GTS Global] Yalx_ added an Ogerpon to the global GTS for $ 50,000,000.00 PokéCoins!",
        )
        .unwrap();

        assert_eq!(event.event_type, "gts");
        assert_eq!(event.title, "GTS Global: Ogerpon");
        assert!(event.detail.contains("Ogerpon"));
        assert!(event.detail.contains("Yalx_"));
        assert!(event.detail.contains("Venda"));
    }

    #[test]
    fn parses_gts_sale_event() {
        let event = parse_gts_sale_event("§aAsh_10 comprou seu Riolu!").unwrap();

        assert_eq!(event.event_type, "gts_sale");
        assert_eq!(event.title, "Venda GTS: Riolu");
        assert_eq!(event.detail, "Riolu | Ash_10");
    }

    #[test]
    fn parses_gts_sale_start_and_amount_lines() {
        let sale = parse_gts_sale_start_event(
            "&7[&a!&7] &eLucas_tempest&7 &abought your &r&bChave de Shiny Aleatorio&r!&7",
        )
        .unwrap();

        assert_eq!(sale.buyer, "Lucas_tempest");
        assert_eq!(sale.item, "Chave de Shiny Aleatorio");
        assert_eq!(
            parse_gts_sale_amount_line("[&a!&7] Sale price: &e4.31 Tokens&7").unwrap(),
            ("price", "4.31 Tokens".to_string())
        );
        assert_eq!(
            parse_gts_sale_amount_line("[&a!&7] Sale fee: &c0.22 Tokens&7").unwrap(),
            ("fee", "0.22 Tokens".to_string())
        );
        assert_eq!(
            parse_gts_sale_amount_line("[&a!&7] Amount received: &a4.09 Tokens&r").unwrap(),
            ("received", "4.09 Tokens".to_string())
        );
    }

    #[test]
    fn parses_gts_sale_bundle_with_escaped_newlines() {
        let event = parse_gts_sale_bundle_event(
            "[!] Jvmaster2011b bought your Chave de Megastone!\\n[!] Sale price: 4.31 Tokens\\n[!] Sale fee: 0.22 Tokens\\n[!] Amount received: 4.09 Tokens",
        )
        .unwrap();

        assert_eq!(event.event_type, "gts_sale");
        assert_eq!(event.title, "Venda GTS: Chave de Megastone");
        assert_eq!(
            event.detail,
            "Chave de Megastone | Jvmaster2011b | 4.31 Tokens | 0.22 Tokens | 4.09 Tokens"
        );
    }

    #[test]
    fn scans_gts_sale_with_token_details() {
        let dir = env::temp_dir().join(format!(
            "pixelmon-gts-sale-scan-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let log_path = dir.join("latest.log");
        fs::write(
            &log_path,
            concat!(
                "[14:57:53] [Client thread/INFO]: [CHAT] &7[&a!&7] &eLucas_tempest&7 &abought your &r&bChave de Shiny Aleatorio&r!&7\n",
                "[14:57:54] [Client thread/INFO]: [CHAT] [&a!&7] Sale price: &e4.31 Tokens&7\n",
                "[14:57:55] [Client thread/INFO]: [CHAT] [&a!&7] Sale fee: &c0.22 Tokens&7\n",
                "[14:57:56] [Client thread/INFO]: [CHAT] [&a!&7] Amount received: &a4.09 Tokens&r\n",
            ),
        )
        .unwrap();

        let mut log = LogCaptureState {
            enabled: true,
            log_directory: dir.to_string_lossy().to_string(),
            ..Default::default()
        };
        let quiz_history_path = dir.join("quiz-history.json");
        scan_logs(&mut log, &HashSet::new(), &quiz_history_path);

        fs::remove_file(log_path).unwrap();
        let _ = fs::remove_file(quiz_history_path);
        fs::remove_dir(dir).unwrap();

        let event = log
            .reward_events
            .iter()
            .find(|event| event.event_type == "gts_sale")
            .unwrap();
        assert_eq!(event.title, "Venda GTS: Chave de Shiny Aleatorio");
        assert_eq!(
            event.detail,
            "Chave de Shiny Aleatorio | Lucas_tempest | 4.31 Tokens | 0.22 Tokens | 4.09 Tokens"
        );
    }

    #[test]
    fn collects_multiple_gts_sales_from_log_text() {
        let text = concat!(
            "[14:57:53] [Client thread/INFO]: [CHAT] &7[&a!&7] &eLucas_tempest&7 &abought your &r&bChave de Shiny Aleatorio&r!&7\n",
            "[14:57:54] [Client thread/INFO]: [CHAT] [&a!&7] Sale price: &e4.31 Tokens&7\n",
            "[14:57:55] [Client thread/INFO]: [CHAT] [&a!&7] Sale fee: &c0.22 Tokens&7\n",
            "[14:57:56] [Client thread/INFO]: [CHAT] [&a!&7] Amount received: &a4.09 Tokens&r\n",
            "[15:10:00] [Client thread/INFO]: [CHAT] &7[&a!&7] &eAsh_10&7 &abought your &r&bRiolu&r!&7\n",
            "[15:10:01] [Client thread/INFO]: [CHAT] [&a!&7] Sale price: &e10 Tokens&7\n",
            "[15:10:02] [Client thread/INFO]: [CHAT] [&a!&7] Sale fee: &c1 Token&7\n",
            "[15:10:03] [Client thread/INFO]: [CHAT] [&a!&7] Amount received: &a9 Tokens&r\n",
        );
        let events = collect_gts_events_from_text(Path::new("latest.log"), text);
        let sales = events
            .iter()
            .filter(|event| event.event.event_type == "gts_sale")
            .collect::<Vec<_>>();

        assert_eq!(sales.len(), 2);
        assert!(sales[0].event.detail.contains("Chave de Shiny Aleatorio"));
        assert!(sales[1].event.detail.contains("Riolu | Ash_10 | 10 Tokens"));
    }

    #[test]
    fn collects_gts_sale_bundle_from_log_text() {
        let text = "[14:57:53] [Client thread/INFO]: [CHAT] [!] Jvmaster2011b bought your Chave de Megastone!\\n[!] Sale price: 4.31 Tokens\\n[!] Sale fee: 0.22 Tokens\\n[!] Amount received: 4.09 Tokens\n";
        let events = collect_gts_events_from_text(Path::new("latest.log"), text);
        let sale = events
            .iter()
            .find(|event| event.event.event_type == "gts_sale")
            .unwrap();

        assert_eq!(sale.event.title, "Venda GTS: Chave de Megastone");
        assert!(sale.event.detail.contains("Jvmaster2011b | 4.31 Tokens"));
    }

    #[test]
    fn keeps_gts_sales_when_reward_event_limit_is_full() {
        let mut log = LogCaptureState::default();
        push_log_reward_event(
            &mut log,
            "gts_sale",
            "Venda GTS: Riolu",
            "Riolu | Ash_10",
            "14:00:00".to_string(),
            "latest.log".to_string(),
            "Ash_10 comprou seu Riolu!".to_string(),
        );

        for index in 0..MAX_LOG_REWARD_EVENTS {
            push_log_reward_event(
                &mut log,
                "gts",
                format!("GTS Global: Item {index}"),
                format!("Item {index} | 1 Token | Seller | Venda"),
                format!("14:{:02}:00", index % 60),
                "latest.log".to_string(),
                format!("Seller added Item {index} to the global GTS for 1 Token!"),
            );
        }

        assert_eq!(log.reward_events.len(), MAX_LOG_REWARD_EVENTS);
        assert_eq!(log.gts_sales.len(), 1);
        assert!(log
            .reward_events
            .iter()
            .any(|event| event.event_type == "gts_sale" && event.detail.contains("Riolu")));
    }

    #[test]
    fn reimports_seen_gts_sale_when_missing_from_visible_lists() {
        let mut log = LogCaptureState::default();
        let parsed = ParsedRewardEvent {
            event_type: "gts_sale".to_string(),
            title: "Venda GTS: Riolu".to_string(),
            detail: "Riolu | Ash_10".to_string(),
        };
        let seen_key = gts_seen_key(&parsed, "14:00:00", "latest.log");
        log.seen.insert(seen_key);

        let imported = CollectedGtsEvent {
            event: parsed,
            log_time: "14:00:00".to_string(),
            source: "latest.log".to_string(),
            text: "Ash_10 comprou seu Riolu!".to_string(),
        };

        assert!(push_imported_gts_event_if_new(&mut log, imported));
        assert_eq!(log.gts_sales.len(), 1);
        assert_eq!(log.gts_sales[0].detail, "Riolu | Ash_10");
    }

    #[test]
    fn parses_curiosity_type_quiz() {
        let event = parse_quiz_event("Qual e o Tipo Elemental do Sealeo?").unwrap();

        assert_eq!(event.title, "Curiosidade: Tipo Elemental");
        assert_eq!(event.detail, "Sealeo");
    }

    #[test]
    fn parses_curiosity_type_quiz_with_ampersand_codes() {
        let event = parse_quiz_event(
            "\n              &b&lCuriosidade    \n &eQual é o &aTipo Elemental&e do &aDiglett&e? \n &r",
        )
        .unwrap();

        assert_eq!(event.title, "Curiosidade: Tipo Elemental");
        assert_eq!(event.detail, "Diglett");
    }

    #[test]
    fn parses_curiosity_element_quiz() {
        let event = parse_quiz_event("Qual e o elemento do Sandshrew?").unwrap();

        assert_eq!(event.title, "Curiosidade: Tipo Elemental");
        assert_eq!(event.detail, "Sandshrew");
    }

    #[test]
    fn parses_curiosity_egg_group_quiz() {
        let event = parse_quiz_event("Qual e o EggGroup do Vanillish?").unwrap();

        assert_eq!(event.title, "Curiosidade: EggGroup");
        assert_eq!(event.detail, "Vanillish");
    }

    #[test]
    fn parses_curiosity_egg_group_quiz_with_section_codes_and_accent() {
        let event = parse_quiz_event(
            "\n            §b§lCuriosidade    \n §eQual é o EggGroup do §bLumineon§e? \n ",
        )
        .unwrap();

        assert_eq!(event.title, "Curiosidade: EggGroup");
        assert_eq!(event.detail, "Lumineon");
    }

    #[test]
    fn scans_curiosity_egg_group_quiz_from_latest_log_line() {
        let dir = env::temp_dir().join(format!(
            "pixelmon-egg-quiz-scan-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let log_path = dir.join("latest.log");
        fs::write(
            &log_path,
            "[14:57:53] [Client thread/INFO]: [CHAT] \\n            §b§lCuriosidade    \\n §eQual é o EggGroup do §bLumineon§e? \\n \n",
        )
        .unwrap();

        let mut log = LogCaptureState {
            enabled: true,
            log_directory: dir.to_string_lossy().to_string(),
            ..Default::default()
        };
        let quiz_history_path = dir.join("quiz-history.json");
        scan_logs(&mut log, &HashSet::new(), &quiz_history_path);

        fs::remove_file(log_path).unwrap();
        let _ = fs::remove_file(quiz_history_path);
        fs::remove_dir(dir).unwrap();

        let event = log
            .reward_events
            .iter()
            .find(|event| event.event_type == "quiz")
            .unwrap();
        assert_eq!(event.title, "Curiosidade: EggGroup");
        assert_eq!(event.detail, "Lumineon");
    }

    #[test]
    fn detects_ranked_player_chat_message() {
        let text = concat!(
            "&e[l] &r&7[RSK&7] &r&7[Nv 99] ",
            "&r&8&l[&r&2Elite&r&8&l] &rpaiolnorte&r &r&8&l\u{00bb} ",
            "&r&cCURIOSIDADE Cite uma das habilidades do pok\u{00e9}mon Liepard&r"
        );

        assert!(is_likely_player_chat_message(text));
    }

    #[test]
    fn detects_private_chat_message() {
        let text = concat!(
            "&6[Privado] &r&6paiolnorte&r&7 -> &r&6Voc\u{00ea}&r ",
            "&r&8&l\u{00bb} &rCURIOSIDADE Cite uma das habilidades do pok\u{00e9}mon Liepard&r"
        );

        assert!(is_likely_player_chat_message(text));
    }

    #[test]
    fn ignores_curiosity_quiz_written_by_player() {
        let dir = env::temp_dir().join(format!(
            "pixelmon-player-quiz-scan-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let log_path = dir.join("latest.log");
        fs::write(
            &log_path,
            concat!(
                "[14:57:53] [Client thread/INFO]: [CHAT] ",
                "&e[l] &r&7[RSK&7] &r&7[Nv 99] ",
                "&r&8&l[&r&2Elite&r&8&l] &rpaiolnorte&r &r&8&l\u{00bb} ",
                "&r&cCURIOSIDADE Cite uma das habilidades do pokemon Liepard&r\n",
            ),
        )
        .unwrap();

        let mut log = LogCaptureState {
            enabled: true,
            log_directory: dir.to_string_lossy().to_string(),
            ..Default::default()
        };
        let quiz_history_path = dir.join("quiz-history.json");
        scan_logs(&mut log, &HashSet::new(), &quiz_history_path);

        fs::remove_file(log_path).unwrap();
        let _ = fs::remove_file(quiz_history_path);
        fs::remove_dir(dir).unwrap();

        assert!(log
            .reward_events
            .iter()
            .all(|event| event.event_type != "quiz"));
    }

    #[test]
    fn ignores_private_curiosity_quiz_message() {
        let dir = env::temp_dir().join(format!(
            "pixelmon-private-quiz-scan-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let log_path = dir.join("latest.log");
        fs::write(
            &log_path,
            concat!(
                "[14:57:53] [Client thread/INFO]: [CHAT] ",
                "&6[Privado] &r&6paiolnorte&r&7 -> &r&6Voc\u{00ea}&r ",
                "&r&8&l\u{00bb} &rCURIOSIDADE Cite uma das habilidades do pokemon Liepard&r\n",
            ),
        )
        .unwrap();

        let mut log = LogCaptureState {
            enabled: true,
            log_directory: dir.to_string_lossy().to_string(),
            ..Default::default()
        };
        let quiz_history_path = dir.join("quiz-history.json");
        scan_logs(&mut log, &HashSet::new(), &quiz_history_path);

        fs::remove_file(log_path).unwrap();
        let _ = fs::remove_file(quiz_history_path);
        fs::remove_dir(dir).unwrap();

        assert!(log
            .reward_events
            .iter()
            .all(|event| event.event_type != "quiz"));
    }

    #[test]
    fn parses_curiosity_ability_quiz_split_over_lines() {
        let pending = parse_pending_quiz_prompt("Cite uma das habilidades do pokemon").unwrap();
        let event = parse_pending_quiz_event(Some(pending), "Cyclizar").unwrap();

        assert_eq!(event.title, "Curiosidade: Habilidade");
        assert_eq!(event.detail, "Cyclizar");
    }

    #[test]
    fn parses_curiosity_ability_quiz_singular_prompt() {
        let pending = parse_pending_quiz_prompt("Cite uma habilidade do pokemon").unwrap();
        let event = parse_pending_quiz_event(Some(pending), "Sandshrew").unwrap();

        assert_eq!(event.title, "Curiosidade: Habilidade");
        assert_eq!(event.detail, "Sandshrew");
    }

    #[test]
    fn parses_degraded_curiosity_type_quiz_from_log() {
        let event = parse_quiz_event("\\n Curiosidade \\n Qual \u{fffd} o Tipo Elemental\u{fffd}e do \u{fffd}aSealeo\u{fffd}e? \\n").unwrap();

        assert_eq!(event.title, "Curiosidade: Tipo Elemental");
        assert_eq!(event.detail, "Sealeo");
    }

    #[test]
    fn parses_degraded_curiosity_egg_group_quiz_from_log() {
        let event = parse_quiz_event(
            "\\n Curiosidade \\n Qual \u{fffd} o EggGroup do \u{fffd}bVanillish\u{fffd}e? \\n",
        )
        .unwrap();

        assert_eq!(event.title, "Curiosidade: EggGroup");
        assert_eq!(event.detail, "Vanillish");
    }

    #[test]
    fn parses_degraded_curiosity_ability_quiz_from_log() {
        let event = parse_quiz_event("\\n Curiosidade \\n Cite uma das habilidades do pok\u{fffd}mon \\n \u{fffd}bCyclizar \\n").unwrap();

        assert_eq!(event.title, "Curiosidade: Habilidade");
        assert_eq!(event.detail, "Cyclizar");
    }

    #[test]
    fn ignores_unsupported_who_is_pokemon_quiz() {
        assert!(parse_quiz_event("Qual e esse Pokemon?").is_none());
    }

    #[test]
    fn parses_who_is_pokemon_prompt_and_timeout_answer() {
        assert!(parse_who_is_pokemon_prompt("Qual é esse Pokemon?").is_some());
        let answer = parse_quiz_timeout_answer(
            "A questao nao foi respondida a tempo. Respostas aceitaveis eram: morelull",
        )
        .unwrap();

        assert_eq!(answer, "morelull");
    }

    #[test]
    fn removes_b_color_prefix_from_timeout_answer() {
        let answer = parse_quiz_timeout_answer(
            "A questao nao foi respondida a tempo. Respostas aceitaveis eram: \u{fffd}bgluttony",
        )
        .unwrap();

        assert_eq!(answer, "gluttony");
        assert_eq!(strip_quiz_timeout_color_prefix("bbagon"), "bagon");
    }

    #[test]
    fn preserves_known_egg_group_answer_formatting() {
        assert_eq!(clean_quiz_timeout_answer("humanlike").unwrap(), "Human-Like");
        assert_eq!(clean_quiz_timeout_answer("human like").unwrap(), "Human-Like");
        assert_eq!(clean_quiz_timeout_answer("water1").unwrap(), "Water 1");
        assert_eq!(clean_quiz_timeout_answer("bug").unwrap(), "Bug");
    }

    #[test]
    fn parses_who_is_pokemon_event_from_single_chat_line() {
        let event = parse_who_is_pokemon_event("\\n Qual é esse Pokémon? \\n Espalha seus esporos brilhantes ao redor de si mesmo. \\n").unwrap();

        assert_eq!(event.title, "Qual e esse Pokemon?");
        assert!(event.detail.contains("esporos brilhantes"));
    }

    #[test]
    fn parses_ability_description_event_from_single_chat_line() {
        let event = parse_ability_description_event(
            "\\n Qual e essa Habilidade? \\n Aumenta a evasao durante tempestade de areia. \\n",
        )
        .unwrap();

        assert_eq!(event.title, "Qual e essa Habilidade?");
        assert!(event.detail.contains("tempestade de areia"));
    }

    #[test]
    fn learns_who_is_pokemon_answer_from_log_text() {
        let text = [
            "[09:24:57] [Render thread/INFO]: [CHAT] Qual e esse Pokemon?",
            "[09:24:58] [Render thread/INFO]: [CHAT] Ele puxa o ar pela cauda, transforma-o em fogo e o usa como uma lingua. Derrete Durant e come-os.",
      "[09:25:08] [Render thread/INFO]: [CHAT] A questao nao foi respondida a tempo. Respostas aceitaveis eram: heatmor",
    ].join("\n");
        let mut entries = Vec::new();
        let imported = learn_quiz_history_from_text(&mut entries, Path::new("latest.log"), &text);

        assert_eq!(imported, 1);
        assert_eq!(entries[0].answer, "heatmor");
        assert!(entries[0].question.contains("Derrete Durant"));
    }

    #[test]
    fn learns_complex_quiz_answer_from_single_formatted_chat_line() {
        let text = "[09:24:57] [Render thread/INFO]: [CHAT] &6&lQual é esse Pokémon? &eSua respiração tem a capacidade fantástica de reviver plantas e flores mortas. &r &e A questão não foi respondida a tempo. Respostas aceitáveis eram: &bmeganium&r";
        let mut entries = Vec::new();
        let imported = learn_quiz_history_from_text(&mut entries, Path::new("latest.log"), text);

        assert_eq!(imported, 1);
        assert_eq!(entries[0].answer, "meganium");
        assert_eq!(
            entries[0].question,
            "Sua respiração tem a capacidade fantástica de reviver plantas e flores mortas."
        );
    }

    #[test]
    fn learns_complex_quiz_answer_with_gurdurr_clue() {
        let text = [
            "[09:24:57] [Render thread/INFO]: [CHAT] &6&lQual \u{00e9} esse Pok\u{00e9}mon?",
            "[09:24:58] [Render thread/INFO]: [CHAT] &eCom corpos fortalecidos, eles habilmente empunham vigas de a\u{00e7}o para derrubar edif\u{00ed}cios. &r",
            "[09:25:08] [Render thread/INFO]: [CHAT] &e A quest\u{00e3}o n\u{00e3}o foi respondida a tempo. Respostas aceit\u{00e1}veis eram: &bgurdurr&r",
        ].join("\n");
        let mut entries = Vec::new();
        let imported = learn_quiz_history_from_text(&mut entries, Path::new("latest.log"), &text);

        assert_eq!(imported, 1);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].answer, "gurdurr");
        assert!(entries[0].question.contains("vigas de a\u{00e7}o"));
    }

    #[test]
    fn removes_leftover_color_prefix_from_complex_quiz_clues() {
        assert_eq!(
            clean_quiz_clue(
                "eAnexado sua cabeca um enorme conjunto de mandibulas formadas por chifres."
            )
            .unwrap(),
            "Anexado sua cabeca um enorme conjunto de mandibulas formadas por chifres."
        );
        assert_eq!(
            clean_quiz_clue("eAo entrar em campo, ativa o efeito de Grassy Terrain.").unwrap(),
            "Ao entrar em campo, ativa o efeito de Grassy Terrain."
        );
        assert_eq!(
            clean_quiz_clue("\u{fffd}eAo entrar em campo, ativa o efeito do movimento Rain Dance.")
                .unwrap(),
            "Ao entrar em campo, ativa o efeito do movimento Rain Dance."
        );
    }

    #[test]
    fn deduplicates_near_quiz_history_questions_without_losing_answer() {
        let mut entries = vec![
            QuizHistoryEntry {
                key: quiz_history_key(
                    "Ataques baseados em socos t seu poder multiplicado por 1.2.",
                ),
                question: "Ataques baseados em socos t seu poder multiplicado por 1.2.".to_string(),
                answer: String::new(),
                source: "latest.log".to_string(),
                learned_at: "2026-06-16T10:00:00Z".to_string(),
                last_seen_at: "2026-06-16T10:00:00Z".to_string(),
                count: 1,
            },
            QuizHistoryEntry {
                key: quiz_history_key(
                    "Ataques baseados em socos tm seu poder multiplicado por 1.2.",
                ),
                question: "Ataques baseados em socos tm seu poder multiplicado por 1.2."
                    .to_string(),
                answer: "Iron Fist".to_string(),
                source: "latest.log".to_string(),
                learned_at: "2026-06-16T10:01:00Z".to_string(),
                last_seen_at: "2026-06-16T10:01:00Z".to_string(),
                count: 2,
            },
        ];

        normalize_quiz_history_entries(&mut entries);

        assert_eq!(entries.len(), 1);
        assert_eq!(
            entries[0].question,
            "Ataques baseados em socos tm seu poder multiplicado por 1.2."
        );
        assert_eq!(entries[0].answer, "Iron Fist");
        assert_eq!(entries[0].count, 3);
    }

    #[test]
    fn remembers_unanswered_complex_quiz_from_log_text() {
        let text = [
            "[09:24:57] [Render thread/INFO]: [CHAT] Qual e essa Habilidade?",
            "[09:24:58] [Render thread/INFO]: [CHAT] Aumenta a evasao durante tempestade de areia.",
        ]
        .join("\n");
        let mut entries = Vec::new();
        let imported = learn_quiz_history_from_text(&mut entries, Path::new("latest.log"), &text);

        assert_eq!(imported, 1);
        assert_eq!(entries[0].answer, "");
        assert!(entries[0].question.contains("tempestade de areia"));
    }
}

fn expand_windows_env_vars(value: &str) -> String {
    let mut output = value.to_string();
    for (key, env_value) in env::vars() {
        output = output.replace(&format!("%{}%", key), &env_value);
    }
    output
}

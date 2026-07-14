use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::UpdaterExt;

const DATABASE_FILE: &str = "cobbleverse-companion-db.json";
const V1_BACKUP_DIRECTORY: &str = "backups/v1";
const V1_DATABASE_FILES: &[&str] = &[
    "pokemon-checklist-db.json",
    "pokemon-checklist-config.json",
    "pokemon-quiz-history.json",
    "config.json",
];

struct AppState {
    database_path: PathBuf,
    v1_backup_dir: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredDatabase {
    schema: String,
    updated_at: u64,
    state: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct V1BackupStatus {
    backup_dir: String,
    files: Vec<String>,
    created: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    available: bool,
    version: String,
    current_version: String,
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Caminho de banco inválido".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, contents).map_err(|error| error.to_string())?;

    if path.exists() {
        fs::copy(&temporary, path).map_err(|error| error.to_string())?;
        fs::remove_file(&temporary).map_err(|error| error.to_string())?;
    } else {
        fs::rename(&temporary, path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn backup_v1_files(app_data_dir: &Path) -> Result<V1BackupStatus, String> {
    let backup_dir = app_data_dir.join(V1_BACKUP_DIRECTORY);
    fs::create_dir_all(&backup_dir).map_err(|error| error.to_string())?;
    let mut copied_files = Vec::new();

    for file_name in V1_DATABASE_FILES {
        let source = app_data_dir.join(file_name);
        let destination = backup_dir.join(file_name);
        if source.is_file() {
            if !destination.exists() {
                fs::copy(&source, &destination).map_err(|error| error.to_string())?;
            }
            copied_files.push((*file_name).to_string());
        }
    }

    if let Ok(entries) = fs::read_dir(app_data_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("pokemon-") && entry.path().is_file() {
                let destination = backup_dir.join(&name);
                if !destination.exists() {
                    fs::copy(entry.path(), &destination).map_err(|error| error.to_string())?;
                }
                copied_files.push(name);
            }
        }
    }

    copied_files.sort();
    copied_files.dedup();
    let manifest_path = backup_dir.join("v1-backup-manifest.json");
    let created = !manifest_path.exists();
    if created {
        let manifest = json!({
            "schema": "pixelmon-pokelist-v1-backup",
            "savedAt": unix_timestamp(),
            "files": copied_files,
            "note": "Cópia preservada antes da inicialização limpa do Cobbleverse Companion v2. Os arquivos de origem não foram removidos."
        });
        let bytes = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
        atomic_write(&manifest_path, &bytes)?;
    }

    Ok(V1BackupStatus {
        backup_dir: backup_dir.to_string_lossy().to_string(),
        files: copied_files,
        created,
    })
}

#[tauri::command]
fn load_app_state(app_state: State<'_, AppState>) -> Result<Value, String> {
    if !app_state.database_path.exists() {
        return Ok(Value::Null);
    }
    let contents = fs::read(&app_state.database_path).map_err(|error| error.to_string())?;
    let database: StoredDatabase =
        serde_json::from_slice(&contents).map_err(|error| error.to_string())?;
    Ok(database.state)
}

#[tauri::command]
fn save_app_state(state: Value, app_state: State<'_, AppState>) -> Result<Value, String> {
    let database = StoredDatabase {
        schema: "cobbleverse-companion-v2".to_string(),
        updated_at: unix_timestamp(),
        state: state.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&database).map_err(|error| error.to_string())?;
    atomic_write(&app_state.database_path, &bytes)?;
    Ok(state)
}

#[tauri::command]
fn get_v1_backup_status(app_state: State<'_, AppState>) -> Result<V1BackupStatus, String> {
    backup_v1_files(
        app_state
            .v1_backup_dir
            .parent()
            .and_then(Path::parent)
            .ok_or_else(|| "Diretório de backup inválido".to_string())?,
    )
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let backup = backup_v1_files(&app_data_dir).map_err(std::io::Error::other)?;
            app.manage(AppState {
                database_path: app_data_dir.join(DATABASE_FILE),
                v1_backup_dir: PathBuf::from(backup.backup_dir),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_app_state,
            get_v1_backup_status,
            check_update,
            install_latest_update
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar o Cobbleverse Companion");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_v1_backup_without_removing_source() {
        let root = std::env::temp_dir().join(format!("cobbleverse-backup-{}", unix_timestamp()));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("pokemon-checklist-db.json");
        fs::write(&source, b"{\"version\":1}").unwrap();

        let result = backup_v1_files(&root).unwrap();

        assert!(source.exists());
        assert!(root
            .join(V1_BACKUP_DIRECTORY)
            .join("pokemon-checklist-db.json")
            .exists());
        assert!(root
            .join(V1_BACKUP_DIRECTORY)
            .join("v1-backup-manifest.json")
            .exists());
        assert!(result
            .files
            .contains(&"pokemon-checklist-db.json".to_string()));

        fs::remove_dir_all(root).unwrap();
    }
}

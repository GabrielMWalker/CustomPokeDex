use fastnbt::Value as NbtValue;
use flate2::read::{GzDecoder, ZlibDecoder};
use russh::{
    client,
    keys::ssh_key::{HashAlg, PublicKey},
};
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::UpdaterExt;
use zeroize::{Zeroize, Zeroizing};

const DATABASE_FILE: &str = "cobbleverse-companion-db.json";
const SFTP_KNOWN_HOSTS_FILE: &str = "sftp-known-hosts.json";
const SFTP_KEYRING_SERVICE: &str = "Cobbleverse Companion SFTP";
const SFTP_KEYRING_ACCOUNT: &str = "default-profile";
const MAX_DECOMPRESSED_NBT_BYTES: u64 = 128 * 1024 * 1024;
const V1_BACKUP_DIRECTORY: &str = "backups/v1";
const V1_DATABASE_FILES: &[&str] = &[
    "pokemon-checklist-db.json",
    "pokemon-checklist-config.json",
    "pokemon-quiz-history.json",
    "config.json",
];

struct AppState {
    database_path: PathBuf,
    sftp_known_hosts_path: PathBuf,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SftpConnectionRequest {
    host: String,
    port: u16,
    username: String,
    password: String,
    remote_path: String,
    use_saved_credentials: bool,
    save_credentials: bool,
    accept_host_key: bool,
    expected_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Zeroize)]
#[serde(rename_all = "camelCase")]
struct SavedSftpProfile {
    host: String,
    port: u16,
    username: String,
    password: String,
    remote_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SftpProfileStatus {
    saved: bool,
    host: String,
    port: u16,
    username: String,
    remote_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SftpRemoteEntry {
    name: String,
    is_directory: bool,
    size: Option<u64>,
    modified_at: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SftpConnectionResult {
    status: String,
    host: String,
    port: u16,
    username: String,
    remote_path: String,
    fingerprint: String,
    host_key_type: String,
    entries: Vec<SftpRemoteEntry>,
    saved: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MinecraftUserCacheEntry {
    name: String,
    uuid: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SftpPlayerPokemon {
    uuid: Option<String>,
    species: String,
    nickname: Option<String>,
    level: Option<i64>,
    experience: Option<i64>,
    friendship: Option<i64>,
    current_health: Option<i64>,
    form: Option<String>,
    shiny: bool,
    gender: Option<String>,
    nature: Option<String>,
    minted_nature: Option<String>,
    ability: Option<String>,
    held_item: Option<String>,
    caught_ball: Option<String>,
    original_trainer: Option<String>,
    tera_type: Option<String>,
    dmax_level: Option<i64>,
    gmax_factor: bool,
    ivs: HashMap<String, i64>,
    evs: HashMap<String, i64>,
    hyper_trained_ivs: HashMap<String, i64>,
    moves: Vec<String>,
    position: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SftpPlayerSyncResult {
    player_name: String,
    uuid: String,
    level_name: String,
    storage_format: String,
    caught_species: Vec<String>,
    seen_species: Vec<String>,
    party: Vec<SftpPlayerPokemon>,
    pc: Vec<SftpPlayerPokemon>,
    key_items: Vec<String>,
    minecraft_player_data_found: bool,
    files_read: Vec<String>,
    warnings: Vec<String>,
    synced_at: u64,
}

struct TrustedSftpSession {
    _ssh: client::Handle<SftpSshClient>,
    sftp: SftpSession,
    profile: Zeroizing<SavedSftpProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SftpKnownHost {
    host: String,
    port: u16,
    fingerprint: String,
    host_key_type: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SftpKnownHosts {
    hosts: Vec<SftpKnownHost>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HostKeyDecision {
    Trusted,
    AcceptedNew,
    ConfirmationRequired,
    Mismatch,
    ConfirmationChanged,
}

#[derive(Debug, Clone)]
struct HostKeyObservation {
    fingerprint: String,
    host_key_type: String,
    decision: HostKeyDecision,
}

struct SftpSshClient {
    trusted_host: Option<SftpKnownHost>,
    accept_host_key: bool,
    expected_fingerprint: Option<String>,
    observation: Arc<Mutex<Option<HostKeyObservation>>>,
}

impl client::Handler for SftpSshClient {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = server_public_key.fingerprint(HashAlg::Sha256).to_string();
        let host_key_type = server_public_key.algorithm().as_str().to_string();
        let decision = match self.trusted_host.as_ref() {
            Some(known) if known.fingerprint == fingerprint => HostKeyDecision::Trusted,
            Some(_) => HostKeyDecision::Mismatch,
            None if !self.accept_host_key => HostKeyDecision::ConfirmationRequired,
            None if self.expected_fingerprint.as_deref() == Some(fingerprint.as_str()) => {
                HostKeyDecision::AcceptedNew
            }
            None => HostKeyDecision::ConfirmationChanged,
        };
        let accepted = matches!(
            decision,
            HostKeyDecision::Trusted | HostKeyDecision::AcceptedNew
        );
        if let Ok(mut observation) = self.observation.lock() {
            *observation = Some(HostKeyObservation {
                fingerprint,
                host_key_type,
                decision,
            });
        }
        Ok(accepted)
    }
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

fn validate_sftp_profile(profile: &SavedSftpProfile) -> Result<(), String> {
    let host = profile.host.trim();
    if host.is_empty() || host.len() > 253 || host.contains("//") || host.contains(['/', '\\', '@'])
    {
        return Err(
            "Informe apenas o host ou IP do servidor, sem protocolo ou caminho.".to_string(),
        );
    }
    if profile.port == 0 {
        return Err("A porta SFTP deve estar entre 1 e 65535.".to_string());
    }
    let username = profile.username.trim();
    if username.is_empty() || username.len() > 128 || username.chars().any(char::is_whitespace) {
        return Err("Informe um login SFTP válido, sem espaços.".to_string());
    }
    if profile.password.is_empty() {
        return Err("Informe a senha SFTP.".to_string());
    }
    let remote_path = profile.remote_path.trim();
    if remote_path.is_empty() || remote_path.len() > 2048 || remote_path.contains('\0') {
        return Err("Informe o caminho remoto que deve ser consultado.".to_string());
    }
    Ok(())
}

#[cfg(windows)]
fn sftp_keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SFTP_KEYRING_SERVICE, SFTP_KEYRING_ACCOUNT).map_err(|error| {
        format!("Não foi possível acessar o cofre de credenciais do Windows: {error}")
    })
}

#[cfg(windows)]
fn load_saved_sftp_profile() -> Result<Option<SavedSftpProfile>, String> {
    let entry = sftp_keyring_entry()?;
    let encoded = match entry.get_password() {
        Ok(value) => value,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Não foi possível ler a credencial SFTP protegida: {error}"
            ))
        }
    };
    let profile = serde_json::from_str(&encoded).map_err(|_| {
        "A credencial SFTP protegida está inválida. Remova-a e salve novamente.".to_string()
    })?;
    Ok(Some(profile))
}

#[cfg(not(windows))]
fn load_saved_sftp_profile() -> Result<Option<SavedSftpProfile>, String> {
    Ok(None)
}

#[cfg(windows)]
fn save_sftp_profile(profile: &SavedSftpProfile) -> Result<(), String> {
    let encoded = serde_json::to_string(profile).map_err(|error| error.to_string())?;
    sftp_keyring_entry()?
        .set_password(&encoded)
        .map_err(|error| {
            format!("Não foi possível salvar a credencial no cofre do Windows: {error}")
        })
}

#[cfg(not(windows))]
fn save_sftp_profile(_profile: &SavedSftpProfile) -> Result<(), String> {
    Err("O armazenamento protegido de credenciais está disponível somente no aplicativo para Windows.".to_string())
}

#[cfg(windows)]
fn delete_saved_sftp_profile() -> Result<(), String> {
    match sftp_keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Não foi possível remover a credencial protegida: {error}"
        )),
    }
}

#[cfg(not(windows))]
fn delete_saved_sftp_profile() -> Result<(), String> {
    Ok(())
}

fn sftp_profile_status(profile: Option<SavedSftpProfile>) -> SftpProfileStatus {
    match profile {
        Some(profile) => SftpProfileStatus {
            saved: true,
            host: profile.host,
            port: profile.port,
            username: profile.username,
            remote_path: profile.remote_path,
        },
        None => SftpProfileStatus {
            saved: false,
            host: String::new(),
            port: 22,
            username: String::new(),
            remote_path: String::new(),
        },
    }
}

fn load_sftp_known_hosts(path: &Path) -> Result<SftpKnownHosts, String> {
    if !path.is_file() {
        return Ok(SftpKnownHosts::default());
    }
    let bytes = fs::read(path)
        .map_err(|error| format!("Não foi possível ler as chaves SSH conhecidas: {error}"))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("O arquivo local de chaves SSH conhecidas está inválido: {error}"))
}

fn find_sftp_known_host(
    known_hosts: &SftpKnownHosts,
    host: &str,
    port: u16,
) -> Option<SftpKnownHost> {
    known_hosts
        .hosts
        .iter()
        .find(|known| known.host.eq_ignore_ascii_case(host) && known.port == port)
        .cloned()
}

fn persist_sftp_known_host(
    path: &Path,
    host: &str,
    port: u16,
    observation: &HostKeyObservation,
) -> Result<(), String> {
    let mut known_hosts = load_sftp_known_hosts(path)?;
    known_hosts
        .hosts
        .retain(|known| !(known.host.eq_ignore_ascii_case(host) && known.port == port));
    known_hosts.hosts.push(SftpKnownHost {
        host: host.to_string(),
        port,
        fingerprint: observation.fingerprint.clone(),
        host_key_type: observation.host_key_type.clone(),
    });
    let bytes = serde_json::to_vec_pretty(&known_hosts).map_err(|error| error.to_string())?;
    atomic_write(path, &bytes)
}

fn apply_sftp_remote_path_override(profile: &mut SavedSftpProfile, remote_path: &str) {
    let remote_path = remote_path.trim();
    if !remote_path.is_empty() {
        profile.remote_path = remote_path.to_string();
    }
}

async fn run_sftp_connection(
    request: SftpConnectionRequest,
    known_hosts_path: PathBuf,
) -> Result<SftpConnectionResult, String> {
    let persist_profile = request.save_credentials || request.use_saved_credentials;
    let profile = if request.use_saved_credentials {
        let mut saved = load_saved_sftp_profile()?
            .ok_or_else(|| "Não há uma credencial SFTP salva neste computador.".to_string())?;
        apply_sftp_remote_path_override(&mut saved, &request.remote_path);
        saved
    } else {
        SavedSftpProfile {
            host: request.host.trim().to_string(),
            port: request.port,
            username: request.username.trim().to_string(),
            password: request.password,
            remote_path: request.remote_path.trim().to_string(),
        }
    };
    validate_sftp_profile(&profile)?;
    let profile = Zeroizing::new(profile);
    let known_hosts = load_sftp_known_hosts(&known_hosts_path)?;
    let trusted_host = find_sftp_known_host(&known_hosts, &profile.host, profile.port);
    let observation = Arc::new(Mutex::new(None));
    let handler = SftpSshClient {
        trusted_host,
        accept_host_key: request.accept_host_key,
        expected_fingerprint: request.expected_fingerprint.clone(),
        observation: observation.clone(),
    };
    let config = client::Config {
        inactivity_timeout: Some(Duration::from_secs(20)),
        keepalive_interval: Some(Duration::from_secs(10)),
        ..Default::default()
    };
    let connect_result = tokio::time::timeout(
        Duration::from_secs(15),
        client::connect(
            Arc::new(config),
            (profile.host.as_str(), profile.port),
            handler,
        ),
    )
    .await
    .map_err(|_| {
        format!(
            "Tempo esgotado ao conectar a {}:{}.",
            profile.host, profile.port
        )
    })?;

    let observed = observation
        .lock()
        .map_err(|_| "Não foi possível validar a chave SSH do servidor.".to_string())?
        .clone();
    let mut session = match connect_result {
        Ok(session) => session,
        Err(error) => {
            match observed.as_ref().map(|value| value.decision) {
                Some(HostKeyDecision::ConfirmationRequired) => {
                    let observed = observed.expect("observação presente");
                    return Ok(SftpConnectionResult {
                        status: "hostKeyConfirmationRequired".to_string(),
                        host: profile.host.clone(),
                        port: profile.port,
                        username: profile.username.clone(),
                        remote_path: profile.remote_path.clone(),
                        fingerprint: observed.fingerprint,
                        host_key_type: observed.host_key_type,
                        entries: Vec::new(),
                        saved: request.use_saved_credentials,
                    });
                }
                Some(HostKeyDecision::Mismatch) => {
                    return Err(format!(
                    "A chave SSH de {}:{} mudou. A conexão foi bloqueada para evitar interceptação.",
                    profile.host, profile.port
                ));
                }
                Some(HostKeyDecision::ConfirmationChanged) => {
                    return Err("A impressão digital SSH mudou durante a confirmação. A conexão foi cancelada.".to_string());
                }
                _ => return Err(format!("Falha no handshake SSH: {error}")),
            }
        }
    };
    let observed = observed.ok_or_else(|| {
        "O servidor não forneceu uma chave SSH válida durante a conexão.".to_string()
    })?;

    let authenticated = tokio::time::timeout(
        Duration::from_secs(20),
        session.authenticate_password(profile.username.as_str(), profile.password.as_str()),
    )
    .await
    .map_err(|_| "Tempo esgotado durante a autenticação SFTP.".to_string())?
    .map_err(|error| format!("Login ou senha SFTP recusados: {error}"))?;
    if !authenticated.success() {
        return Err("O servidor recusou o login ou a senha SFTP.".to_string());
    }

    let channel = session
        .channel_open_session()
        .await
        .map_err(|error| format!("Não foi possível abrir o canal SSH: {error}"))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|error| format!("O servidor não disponibilizou o subsistema SFTP: {error}"))?;
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|error| format!("Não foi possível iniciar a sessão SFTP: {error}"))?;
    let mut entries = sftp
        .read_dir(profile.remote_path.as_str())
        .await
        .map_err(|error| {
            format!(
                "Não foi possível ler o caminho remoto {}: {error}",
                profile.remote_path
            )
        })?
        .map(|entry| {
            let metadata = entry.metadata();
            SftpRemoteEntry {
                name: entry.file_name(),
                is_directory: metadata.is_dir(),
                size: metadata.size,
                modified_at: metadata.mtime.map(u64::from),
            }
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    entries.truncate(100);

    if observed.decision == HostKeyDecision::AcceptedNew && persist_profile {
        persist_sftp_known_host(&known_hosts_path, &profile.host, profile.port, &observed)?;
    }
    if request.save_credentials {
        save_sftp_profile(&profile)?;
    }
    let saved = request.save_credentials || request.use_saved_credentials;

    Ok(SftpConnectionResult {
        status: "connected".to_string(),
        host: profile.host.clone(),
        port: profile.port,
        username: profile.username.clone(),
        remote_path: profile.remote_path.clone(),
        fingerprint: observed.fingerprint,
        host_key_type: observed.host_key_type,
        entries,
        saved,
    })
}

async fn open_trusted_sftp(known_hosts_path: &Path) -> Result<TrustedSftpSession, String> {
    let profile = load_saved_sftp_profile()?.ok_or_else(|| {
        "Configure e salve uma conexão SFTP antes de atualizar o jogador.".to_string()
    })?;
    validate_sftp_profile(&profile)?;
    let profile = Zeroizing::new(profile);
    let known_hosts = load_sftp_known_hosts(known_hosts_path)?;
    let trusted_host =
        find_sftp_known_host(&known_hosts, &profile.host, profile.port).ok_or_else(|| {
            "Conecte uma vez pelas Configurações e confirme a chave SSH do servidor.".to_string()
        })?;
    let observation = Arc::new(Mutex::new(None));
    let handler = SftpSshClient {
        trusted_host: Some(trusted_host),
        accept_host_key: false,
        expected_fingerprint: None,
        observation: observation.clone(),
    };
    let config = client::Config {
        inactivity_timeout: Some(Duration::from_secs(30)),
        keepalive_interval: Some(Duration::from_secs(10)),
        ..Default::default()
    };
    let connect_result = tokio::time::timeout(
        Duration::from_secs(15),
        client::connect(
            Arc::new(config),
            (profile.host.as_str(), profile.port),
            handler,
        ),
    )
    .await
    .map_err(|_| {
        format!(
            "Tempo esgotado ao conectar a {}:{}.",
            profile.host, profile.port
        )
    })?;
    let observed = observation
        .lock()
        .map_err(|_| "Não foi possível validar a chave SSH do servidor.".to_string())?
        .clone();
    let mut session = connect_result.map_err(|error| {
        if observed.as_ref().map(|value| value.decision) == Some(HostKeyDecision::Mismatch) {
            format!(
                "A chave SSH de {}:{} mudou. A atualização foi bloqueada.",
                profile.host, profile.port
            )
        } else {
            format!("Falha no handshake SSH: {error}")
        }
    })?;
    let authenticated = tokio::time::timeout(
        Duration::from_secs(20),
        session.authenticate_password(profile.username.as_str(), profile.password.as_str()),
    )
    .await
    .map_err(|_| "Tempo esgotado durante a autenticação SFTP.".to_string())?
    .map_err(|error| format!("Login ou senha SFTP recusados: {error}"))?;
    if !authenticated.success() {
        return Err("O servidor recusou o login ou a senha SFTP salva.".to_string());
    }
    let channel = session
        .channel_open_session()
        .await
        .map_err(|error| format!("Não foi possível abrir o canal SSH: {error}"))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|error| format!("O servidor não disponibilizou o subsistema SFTP: {error}"))?;
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|error| format!("Não foi possível iniciar a sessão SFTP: {error}"))?;
    Ok(TrustedSftpSession {
        _ssh: session,
        sftp,
        profile,
    })
}

fn remote_join(base: &str, relative: &str) -> String {
    let base = base.trim().trim_end_matches('/');
    let relative = relative.trim().trim_start_matches('/');
    if base.is_empty() {
        format!("/{relative}")
    } else if relative.is_empty() {
        base.to_string()
    } else {
        format!("{base}/{relative}")
    }
}

fn remote_parent(path: &str) -> Option<String> {
    let normalized = path.trim().trim_end_matches('/');
    if normalized.is_empty() || normalized == "/" {
        return None;
    }
    let parent = normalized
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    Some(if parent.is_empty() {
        "/".to_string()
    } else {
        parent.to_string()
    })
}

async fn read_remote_file_limited(
    sftp: &SftpSession,
    path: &str,
    max_bytes: u64,
) -> Result<Option<Vec<u8>>, String> {
    let exists = sftp
        .try_exists(path)
        .await
        .map_err(|error| format!("Não foi possível consultar {path}: {error}"))?;
    if !exists {
        return Ok(None);
    }
    let metadata = sftp
        .metadata(path)
        .await
        .map_err(|error| format!("Não foi possível consultar o tamanho de {path}: {error}"))?;
    if metadata.size.unwrap_or(0) > max_bytes {
        return Err(format!(
            "O arquivo {path} excede o limite de segurança de {} MB.",
            max_bytes / 1024 / 1024
        ));
    }
    sftp.read(path)
        .await
        .map(Some)
        .map_err(|error| format!("Não foi possível ler {path}: {error}"))
}

async fn locate_server_root(
    sftp: &SftpSession,
    configured_path: &str,
) -> Result<(String, Vec<u8>), String> {
    let mut candidates = Vec::new();
    let mut current = if configured_path.trim().is_empty() {
        "/".to_string()
    } else {
        configured_path.trim().to_string()
    };
    for _ in 0..8 {
        if !candidates.contains(&current) {
            candidates.push(current.clone());
        }
        let Some(parent) = remote_parent(&current) else {
            break;
        };
        current = parent;
    }
    if !candidates.iter().any(|candidate| candidate == "/") {
        candidates.push("/".to_string());
    }
    for candidate in candidates {
        let path = remote_join(&candidate, "usercache.json");
        if let Some(bytes) = read_remote_file_limited(sftp, &path, 2 * 1024 * 1024).await? {
            if serde_json::from_slice::<Vec<MinecraftUserCacheEntry>>(&bytes).is_ok() {
                return Ok((candidate, bytes));
            }
        }
    }
    Err("Não encontrei usercache.json na raiz configurada nem nas pastas superiores.".to_string())
}

fn validate_minecraft_uuid(uuid: &str) -> Result<(), String> {
    let valid = uuid.len() == 36
        && uuid
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            });
    if valid {
        Ok(())
    } else {
        Err("O UUID encontrado no usercache.json é inválido.".to_string())
    }
}

fn read_to_end_limited(
    reader: impl Read,
    max_bytes: u64,
    compression: &str,
) -> Result<Vec<u8>, String> {
    let mut decoded = Vec::new();
    reader
        .take(max_bytes + 1)
        .read_to_end(&mut decoded)
        .map_err(|error| format!("NBT {compression} inválido: {error}"))?;
    if decoded.len() as u64 > max_bytes {
        return Err(format!(
            "NBT {compression} excede o limite descompactado de {} MB.",
            max_bytes / 1024 / 1024
        ));
    }
    Ok(decoded)
}

fn decode_compressed_nbt(bytes: &[u8]) -> Result<NbtValue, String> {
    let decoded = if bytes.starts_with(&[0x1f, 0x8b]) {
        read_to_end_limited(GzDecoder::new(bytes), MAX_DECOMPRESSED_NBT_BYTES, "GZip")?
    } else if bytes.first() == Some(&0x78) {
        read_to_end_limited(ZlibDecoder::new(bytes), MAX_DECOMPRESSED_NBT_BYTES, "Zlib")?
    } else {
        read_to_end_limited(bytes, MAX_DECOMPRESSED_NBT_BYTES, "sem compressão")?
    };
    let compound = fastnbt::from_bytes::<HashMap<String, NbtValue>>(&decoded)
        .map_err(|error| format!("NBT inválido: {error}"))?;
    Ok(NbtValue::Compound(compound))
}

fn collect_nbt_strings_for_key(value: &NbtValue, key: &str, output: &mut Vec<String>) {
    match value {
        NbtValue::Compound(compound) => {
            if let Some(text) = compound.get(key).and_then(NbtValue::as_str) {
                output.push(text.to_string());
            }
            compound
                .values()
                .for_each(|child| collect_nbt_strings_for_key(child, key, output));
        }
        NbtValue::List(values) => values
            .iter()
            .for_each(|child| collect_nbt_strings_for_key(child, key, output)),
        _ => {}
    }
}

fn nbt_nested_string(
    compound: &HashMap<String, NbtValue>,
    parent: &str,
    key: &str,
) -> Option<String> {
    let NbtValue::Compound(value) = compound.get(parent)? else {
        return None;
    };
    value.get(key)?.as_str().map(str::to_string)
}

fn normalized_stat_key(value: &str) -> Option<&'static str> {
    let key = value
        .rsplit(':')
        .next()
        .unwrap_or(value)
        .to_ascii_lowercase()
        .replace(['_', '-', ' '], "");
    match key.as_str() {
        "hp" | "health" => Some("hp"),
        "attack" | "atk" => Some("attack"),
        "defence" | "defense" | "def" => Some("defence"),
        "specialattack" | "spattack" | "spatk" | "spa" => Some("special_attack"),
        "specialdefence" | "specialdefense" | "spdef" | "spd" => Some("special_defence"),
        "speed" | "spe" => Some("speed"),
        _ => None,
    }
}

fn collect_nbt_stat_values(value: &NbtValue, output: &mut HashMap<String, i64>) {
    if let NbtValue::Compound(compound) = value {
        for (key, child) in compound {
            if let (Some(stat), Some(amount)) = (normalized_stat_key(key), child.as_i64()) {
                output.insert(stat.to_string(), amount);
            }
        }
    }
}

fn nbt_stat_maps(
    compound: &HashMap<String, NbtValue>,
) -> (
    HashMap<String, i64>,
    HashMap<String, i64>,
    HashMap<String, i64>,
) {
    let mut ivs = HashMap::new();
    let mut evs = HashMap::new();
    let mut hyper_trained = HashMap::new();
    if let Some(value) = compound.get("IVs") {
        if let NbtValue::Compound(iv_compound) = value {
            collect_nbt_stat_values(iv_compound.get("Base").unwrap_or(value), &mut ivs);
            if let Some(hyper) = iv_compound.get("HyperTrained") {
                collect_nbt_stat_values(hyper, &mut hyper_trained);
            }
        } else {
            collect_nbt_stat_values(value, &mut ivs);
        }
    }
    if let Some(value) = compound.get("EVs") {
        collect_nbt_stat_values(value, &mut evs);
    }
    (ivs, evs, hyper_trained)
}

fn nbt_component_text(value: &NbtValue) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    let NbtValue::Compound(compound) = value else {
        return None;
    };
    compound
        .get("text")
        .or_else(|| compound.get("literal"))
        .and_then(NbtValue::as_str)
        .map(str::to_string)
}

fn nbt_uuid(value: &NbtValue) -> Option<String> {
    if let Some(uuid) = value.as_str() {
        return Some(uuid.to_string());
    }
    let NbtValue::IntArray(parts) = value else {
        return None;
    };
    if parts.len() != 4 {
        return None;
    }
    let raw = parts
        .iter()
        .map(|part| format!("{:08x}", *part as u32))
        .collect::<String>();
    Some(format!(
        "{}-{}-{}-{}-{}",
        &raw[0..8],
        &raw[8..12],
        &raw[12..16],
        &raw[16..20],
        &raw[20..32]
    ))
}

fn pokemon_from_nbt(
    compound: &HashMap<String, NbtValue>,
    position: String,
) -> Option<SftpPlayerPokemon> {
    let species = compound.get("Species")?.as_str()?.to_string();
    let (ivs, evs, hyper_trained_ivs) = nbt_stat_maps(compound);
    let mut moves = Vec::new();
    if let Some(move_set) = compound.get("MoveSet") {
        collect_nbt_strings_for_key(move_set, "MoveName", &mut moves);
    }
    moves.sort();
    moves.dedup();
    Some(SftpPlayerPokemon {
        uuid: compound.get("UUID").and_then(nbt_uuid),
        species,
        nickname: compound.get("Nickname").and_then(nbt_component_text),
        level: compound.get("Level").and_then(NbtValue::as_i64),
        experience: compound.get("Experience").and_then(NbtValue::as_i64),
        friendship: compound.get("Friendship").and_then(NbtValue::as_i64),
        current_health: compound.get("Health").and_then(NbtValue::as_i64),
        form: compound
            .get("FormId")
            .and_then(NbtValue::as_str)
            .map(str::to_string),
        shiny: compound
            .get("Shiny")
            .and_then(NbtValue::as_i64)
            .unwrap_or(0)
            != 0,
        gender: compound
            .get("Gender")
            .and_then(NbtValue::as_str)
            .map(str::to_string),
        nature: compound
            .get("Nature")
            .and_then(NbtValue::as_str)
            .map(str::to_string),
        minted_nature: compound
            .get("MintedNature")
            .and_then(NbtValue::as_str)
            .map(str::to_string),
        ability: nbt_nested_string(compound, "Ability", "AbilityName"),
        held_item: nbt_nested_string(compound, "HeldItem", "id"),
        caught_ball: compound
            .get("CaughtBall")
            .and_then(NbtValue::as_str)
            .map(str::to_string),
        original_trainer: compound
            .get("PokemonOriginalTrainer")
            .and_then(NbtValue::as_str)
            .map(str::to_string),
        tera_type: compound
            .get("TeraType")
            .and_then(NbtValue::as_str)
            .map(str::to_string),
        dmax_level: compound.get("DmaxLevel").and_then(NbtValue::as_i64),
        gmax_factor: compound
            .get("GmaxFactor")
            .and_then(NbtValue::as_i64)
            .unwrap_or(0)
            != 0,
        ivs,
        evs,
        hyper_trained_ivs,
        moves,
        position,
    })
}

fn collect_nbt_pokemon(value: &NbtValue, path: &str, output: &mut Vec<SftpPlayerPokemon>) {
    match value {
        NbtValue::Compound(compound) => {
            if let Some(pokemon) = pokemon_from_nbt(compound, path.to_string()) {
                output.push(pokemon);
                return;
            }
            let mut keys = compound.keys().collect::<Vec<_>>();
            keys.sort();
            for key in keys {
                let child_path = if path.is_empty() {
                    key.to_string()
                } else {
                    format!("{path}/{key}")
                };
                collect_nbt_pokemon(&compound[key], &child_path, output);
            }
        }
        NbtValue::List(values) => {
            for (index, child) in values.iter().enumerate() {
                collect_nbt_pokemon(child, &format!("{path}/{index}"), output);
            }
        }
        _ => {}
    }
}

fn json_nested_string(
    compound: &serde_json::Map<String, Value>,
    parent: &str,
    key: &str,
) -> Option<String> {
    compound.get(parent)?.get(key)?.as_str().map(str::to_string)
}

fn collect_json_strings_for_key(value: &Value, key: &str, output: &mut Vec<String>) {
    match value {
        Value::Object(compound) => {
            if let Some(text) = compound.get(key).and_then(Value::as_str) {
                output.push(text.to_string());
            }
            compound
                .values()
                .for_each(|child| collect_json_strings_for_key(child, key, output));
        }
        Value::Array(values) => values
            .iter()
            .for_each(|child| collect_json_strings_for_key(child, key, output)),
        _ => {}
    }
}

fn collect_json_stat_values(value: &Value, output: &mut HashMap<String, i64>) {
    if let Value::Object(compound) = value {
        for (key, child) in compound {
            if let (Some(stat), Some(amount)) = (normalized_stat_key(key), child.as_i64()) {
                output.insert(stat.to_string(), amount);
            }
        }
    }
}

fn json_stat_maps(
    compound: &serde_json::Map<String, Value>,
) -> (
    HashMap<String, i64>,
    HashMap<String, i64>,
    HashMap<String, i64>,
) {
    let mut ivs = HashMap::new();
    let mut evs = HashMap::new();
    let mut hyper_trained = HashMap::new();
    if let Some(value) = compound.get("IVs") {
        collect_json_stat_values(value.get("Base").unwrap_or(value), &mut ivs);
        if let Some(hyper) = value.get("HyperTrained") {
            collect_json_stat_values(hyper, &mut hyper_trained);
        }
    }
    if let Some(value) = compound.get("EVs") {
        collect_json_stat_values(value, &mut evs);
    }
    (ivs, evs, hyper_trained)
}

fn json_component_text(value: &Value) -> Option<String> {
    value.as_str().map(str::to_string).or_else(|| {
        value
            .get("text")
            .or_else(|| value.get("literal"))
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

fn collect_json_pokemon(value: &Value, path: &str, output: &mut Vec<SftpPlayerPokemon>) {
    match value {
        Value::Object(compound) => {
            if let Some(species) = compound.get("Species").and_then(Value::as_str) {
                let (ivs, evs, hyper_trained_ivs) = json_stat_maps(compound);
                let mut moves = Vec::new();
                if let Some(move_set) = compound.get("MoveSet") {
                    collect_json_strings_for_key(move_set, "MoveName", &mut moves);
                }
                moves.sort();
                moves.dedup();
                output.push(SftpPlayerPokemon {
                    uuid: compound
                        .get("UUID")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    species: species.to_string(),
                    nickname: compound.get("Nickname").and_then(json_component_text),
                    level: compound.get("Level").and_then(Value::as_i64),
                    experience: compound.get("Experience").and_then(Value::as_i64),
                    friendship: compound.get("Friendship").and_then(Value::as_i64),
                    current_health: compound.get("Health").and_then(Value::as_i64),
                    form: compound
                        .get("FormId")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    shiny: compound
                        .get("Shiny")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                    gender: compound
                        .get("Gender")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    nature: compound
                        .get("Nature")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    minted_nature: compound
                        .get("MintedNature")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    ability: json_nested_string(compound, "Ability", "AbilityName"),
                    held_item: json_nested_string(compound, "HeldItem", "id"),
                    caught_ball: compound
                        .get("CaughtBall")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    original_trainer: compound
                        .get("PokemonOriginalTrainer")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    tera_type: compound
                        .get("TeraType")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    dmax_level: compound.get("DmaxLevel").and_then(Value::as_i64),
                    gmax_factor: compound
                        .get("GmaxFactor")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                    ivs,
                    evs,
                    hyper_trained_ivs,
                    moves,
                    position: path.to_string(),
                });
                return;
            }
            let mut keys = compound.keys().collect::<Vec<_>>();
            keys.sort();
            for key in keys {
                let child_path = if path.is_empty() {
                    key.to_string()
                } else {
                    format!("{path}/{key}")
                };
                collect_json_pokemon(&compound[key], &child_path, output);
            }
        }
        Value::Array(values) => {
            for (index, child) in values.iter().enumerate() {
                collect_json_pokemon(child, &format!("{path}/{index}"), output);
            }
        }
        _ => {}
    }
}

fn parse_pokedex_nbt(value: &NbtValue) -> (Vec<String>, Vec<String>) {
    let mut caught = Vec::new();
    let mut seen = Vec::new();
    let NbtValue::Compound(root) = value else {
        return (caught, seen);
    };
    let Some(NbtValue::Compound(records)) = root.get("speciesRecords") else {
        return (caught, seen);
    };
    for (species, record) in records {
        let mut knowledge = Vec::new();
        collect_nbt_strings_for_key(record, "knowledge", &mut knowledge);
        if knowledge
            .iter()
            .any(|value| value.eq_ignore_ascii_case("CAUGHT"))
        {
            caught.push(species.clone());
            seen.push(species.clone());
        } else if knowledge
            .iter()
            .any(|value| value.eq_ignore_ascii_case("ENCOUNTERED"))
        {
            seen.push(species.clone());
        }
    }
    caught.sort();
    seen.sort();
    (caught, seen)
}

fn parse_level_name(server_properties: Option<&[u8]>) -> String {
    server_properties
        .and_then(|bytes| std::str::from_utf8(bytes).ok())
        .and_then(|contents| {
            contents.lines().find_map(|line| {
                line.trim()
                    .strip_prefix("level-name=")
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
            })
        })
        .unwrap_or("world")
        .to_string()
}

async fn read_first_existing(
    sftp: &SftpSession,
    paths: &[String],
    max_bytes: u64,
) -> Result<Option<(String, Vec<u8>)>, String> {
    for path in paths {
        if let Some(bytes) = read_remote_file_limited(sftp, path, max_bytes).await? {
            return Ok(Some((path.clone(), bytes)));
        }
    }
    Ok(None)
}

fn player_pokedex_paths(level_root: &str, uuid: &str) -> [String; 2] {
    let short_uuid = &uuid[..2];
    [
        remote_join(level_root, &format!("pokedex/{short_uuid}/{uuid}.nbt")),
        remote_join(level_root, &format!("pokedex/{short_uuid}/{uuid}.nbt.old")),
    ]
}

async fn sync_saved_sftp_player_data(
    player_name: String,
    known_hosts_path: PathBuf,
) -> Result<SftpPlayerSyncResult, String> {
    let player_name = player_name.trim();
    if player_name.is_empty() || player_name.len() > 64 || player_name.contains(['/', '\\', '\0']) {
        return Err("Informe um nick de jogador válido nas Configurações.".to_string());
    }
    let connection = open_trusted_sftp(&known_hosts_path).await?;
    let (server_root, usercache_bytes) =
        locate_server_root(&connection.sftp, &connection.profile.remote_path).await?;
    let users: Vec<MinecraftUserCacheEntry> = serde_json::from_slice(&usercache_bytes)
        .map_err(|error| format!("usercache.json inválido: {error}"))?;
    let player = users
        .into_iter()
        .find(|entry| entry.name.eq_ignore_ascii_case(player_name))
        .ok_or_else(|| format!("O jogador {player_name} não foi encontrado em usercache.json."))?;
    validate_minecraft_uuid(&player.uuid)?;
    let short_uuid = &player.uuid[..2];
    let mut files_read = vec![remote_join(&server_root, "usercache.json")];
    let mut warnings = Vec::new();

    let server_properties_path = remote_join(&server_root, "server.properties");
    let server_properties =
        read_remote_file_limited(&connection.sftp, &server_properties_path, 1024 * 1024).await?;
    if server_properties.is_some() {
        files_read.push(server_properties_path);
    }
    let level_name = parse_level_name(server_properties.as_deref());
    let level_root = remote_join(&server_root, &level_name);

    let cobblemon_config_path = remote_join(&server_root, "config/cobblemon/main.json");
    let cobblemon_config =
        read_remote_file_limited(&connection.sftp, &cobblemon_config_path, 2 * 1024 * 1024).await?;
    let storage_format = cobblemon_config
        .as_deref()
        .and_then(|bytes| serde_json::from_slice::<Value>(bytes).ok())
        .and_then(|config| config.get("storageFormat")?.as_str().map(str::to_string))
        .unwrap_or_else(|| "nbt".to_string())
        .to_lowercase();
    if cobblemon_config.is_some() {
        files_read.push(cobblemon_config_path);
    }
    if storage_format == "mongodb" {
        return Err("Este servidor usa MongoDB para os dados do Cobblemon. O SFTP não contém Pokédex, party e PC; será necessária uma conexão somente leitura com o banco.".to_string());
    }
    let store_extension = if storage_format == "json" {
        "json"
    } else {
        "dat"
    };
    let store_path = |folder: &str| {
        remote_join(
            &level_root,
            &format!(
                "pokemon/{folder}/{short_uuid}/{}.{}",
                player.uuid, store_extension
            ),
        )
    };
    let party_paths = [store_path("playerpartystore"), store_path("partystorage")];
    let pc_paths = [store_path("pcstore"), store_path("pcstorage")];
    let mut party = Vec::new();
    if let Some((path, bytes)) =
        read_first_existing(&connection.sftp, &party_paths, 16 * 1024 * 1024).await?
    {
        files_read.push(path.clone());
        let parsed = if store_extension == "json" {
            serde_json::from_slice::<Value>(&bytes)
                .map_err(|error| format!("Party JSON inválida em {path}: {error}"))?
        } else {
            let nbt = decode_compressed_nbt(&bytes)
                .map_err(|error| format!("Party NBT inválida em {path}: {error}"))?;
            collect_nbt_pokemon(&nbt, "party", &mut party);
            Value::Null
        };
        if store_extension == "json" {
            collect_json_pokemon(&parsed, "party", &mut party);
        }
    } else {
        warnings.push("Arquivo da party não encontrado.".to_string());
    }
    party.sort_by(|left, right| left.position.cmp(&right.position));

    let mut pc = Vec::new();
    if let Some((path, bytes)) =
        read_first_existing(&connection.sftp, &pc_paths, 64 * 1024 * 1024).await?
    {
        files_read.push(path.clone());
        if store_extension == "json" {
            let parsed = serde_json::from_slice::<Value>(&bytes)
                .map_err(|error| format!("PC JSON inválido em {path}: {error}"))?;
            collect_json_pokemon(&parsed, "pc", &mut pc);
        } else {
            let nbt = decode_compressed_nbt(&bytes)
                .map_err(|error| format!("PC NBT inválido em {path}: {error}"))?;
            collect_nbt_pokemon(&nbt, "pc", &mut pc);
        }
    } else {
        warnings.push("Arquivo do PC não encontrado.".to_string());
    }
    pc.sort_by(|left, right| left.position.cmp(&right.position));

    let pokedex_paths = player_pokedex_paths(&level_root, &player.uuid);
    let (mut caught_species, mut seen_species) = if let Some((path, bytes)) =
        read_first_existing(&connection.sftp, &pokedex_paths, 32 * 1024 * 1024).await?
    {
        files_read.push(path.clone());
        let nbt = decode_compressed_nbt(&bytes)
            .map_err(|error| format!("Pokédex NBT inválida em {path}: {error}"))?;
        if path.ends_with(".old") {
            warnings.push(
                "A Pokédex principal não foi encontrada; foi usada a cópia .nbt.old.".to_string(),
            );
        }
        parse_pokedex_nbt(&nbt)
    } else {
        warnings.push("Arquivo da Pokédex não encontrado.".to_string());
        (Vec::new(), Vec::new())
    };

    caught_species.sort();
    caught_species.dedup();
    seen_species.sort();
    seen_species.dedup();

    let general_data_path = remote_join(
        &level_root,
        &format!("cobblemonplayerdata/{short_uuid}/{}.json", player.uuid),
    );
    let mut key_items = Vec::new();
    if let Some(bytes) =
        read_remote_file_limited(&connection.sftp, &general_data_path, 8 * 1024 * 1024).await?
    {
        files_read.push(general_data_path.clone());
        if let Ok(data) = serde_json::from_slice::<Value>(&bytes) {
            if let Some(items) = data.get("keyItems").and_then(Value::as_array) {
                key_items = items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect();
            }
        }
    }
    key_items.sort();
    key_items.dedup();

    let minecraft_player_data_path =
        remote_join(&level_root, &format!("playerdata/{}.dat", player.uuid));
    let minecraft_player_data_found = connection
        .sftp
        .try_exists(&minecraft_player_data_path)
        .await
        .map_err(|error| {
            format!("Não foi possível consultar {minecraft_player_data_path}: {error}")
        })?;
    if minecraft_player_data_found {
        files_read.push(minecraft_player_data_path);
    }

    Ok(SftpPlayerSyncResult {
        player_name: player.name,
        uuid: player.uuid,
        level_name,
        storage_format,
        caught_species,
        seen_species,
        party,
        pc,
        key_items,
        minecraft_player_data_found,
        files_read,
        warnings,
        synced_at: unix_timestamp(),
    })
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
async fn get_sftp_profile_status() -> Result<SftpProfileStatus, String> {
    tauri::async_runtime::spawn_blocking(|| load_saved_sftp_profile().map(sftp_profile_status))
        .await
        .map_err(|error| format!("Falha ao consultar o cofre de credenciais: {error}"))?
}

#[tauri::command]
async fn forget_sftp_profile(app_state: State<'_, AppState>) -> Result<SftpProfileStatus, String> {
    let known_hosts_path = app_state.sftp_known_hosts_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        delete_saved_sftp_profile()?;
        if known_hosts_path.is_file() {
            fs::remove_file(known_hosts_path)
                .map_err(|error| format!("A credencial foi removida, mas a chave SSH local não pôde ser apagada: {error}"))?;
        }
        Ok(sftp_profile_status(None))
    })
    .await
    .map_err(|error| format!("Falha ao remover a credencial protegida: {error}"))?
}

#[tauri::command]
async fn connect_sftp(
    request: SftpConnectionRequest,
    app_state: State<'_, AppState>,
) -> Result<SftpConnectionResult, String> {
    let known_hosts_path = app_state.sftp_known_hosts_path.clone();
    run_sftp_connection(request, known_hosts_path).await
}

#[tauri::command]
async fn sync_sftp_player_data(
    player_name: String,
    app_state: State<'_, AppState>,
) -> Result<SftpPlayerSyncResult, String> {
    sync_saved_sftp_player_data(player_name, app_state.sftp_known_hosts_path.clone()).await
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
                sftp_known_hosts_path: app_data_dir.join(SFTP_KNOWN_HOSTS_FILE),
                v1_backup_dir: PathBuf::from(backup.backup_dir),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_app_state,
            get_v1_backup_status,
            open_external_url,
            get_sftp_profile_status,
            forget_sftp_profile,
            connect_sftp,
            sync_sftp_player_data,
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
    fn limits_decompressed_nbt_payloads() {
        let error = read_to_end_limited(&b"12345"[..], 4, "teste").unwrap_err();

        assert!(error.contains("limite descompactado"));
    }

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

    #[test]
    fn rejects_incomplete_sftp_profiles() {
        let mut profile = SavedSftpProfile {
            host: "sftp.example.com".to_string(),
            port: 22,
            username: "player".to_string(),
            password: "secret".to_string(),
            remote_path: "/server".to_string(),
        };
        assert!(validate_sftp_profile(&profile).is_ok());

        profile.host = "https://sftp.example.com".to_string();
        assert!(validate_sftp_profile(&profile).is_err());
        profile.host = "sftp.example.com".to_string();
        profile.password.clear();
        assert!(validate_sftp_profile(&profile).is_err());
    }

    #[test]
    fn sftp_profile_status_never_exposes_password() {
        let status = sftp_profile_status(Some(SavedSftpProfile {
            host: "sftp.example.com".to_string(),
            port: 22,
            username: "player".to_string(),
            password: "must-not-leak".to_string(),
            remote_path: "/server".to_string(),
        }));
        let serialized = serde_json::to_string(&status).unwrap();
        assert!(!serialized.contains("must-not-leak"));
        assert!(!serialized.contains("password"));
    }

    #[test]
    fn persists_and_matches_sftp_host_fingerprint() {
        let root = std::env::temp_dir().join(format!(
            "cobbleverse-sftp-known-host-{}-{}",
            unix_timestamp(),
            std::process::id()
        ));
        let path = root.join("known-hosts.json");
        let observation = HostKeyObservation {
            fingerprint: "SHA256:example".to_string(),
            host_key_type: "ssh-ed25519".to_string(),
            decision: HostKeyDecision::AcceptedNew,
        };

        persist_sftp_known_host(&path, "sftp.example.com", 2022, &observation).unwrap();
        let known_hosts = load_sftp_known_hosts(&path).unwrap();
        let known = find_sftp_known_host(&known_hosts, "SFTP.EXAMPLE.COM", 2022).unwrap();

        assert_eq!(known.fingerprint, "SHA256:example");
        assert_eq!(known.host_key_type, "ssh-ed25519");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn saved_sftp_profile_accepts_a_temporary_remote_path() {
        let mut profile = SavedSftpProfile {
            host: "sftp.example.com".to_string(),
            port: 2022,
            username: "player".to_string(),
            password: "secret".to_string(),
            remote_path: "/".to_string(),
        };

        apply_sftp_remote_path_override(&mut profile, " /world/playerdata ");

        assert_eq!(profile.remote_path, "/world/playerdata");
        assert_eq!(profile.host, "sftp.example.com");
        assert_eq!(profile.port, 2022);
        assert_eq!(profile.username, "player");
        assert_eq!(profile.password, "secret");
    }

    #[test]
    fn reads_pokemon_from_cobblemon_nbt_keys() {
        let pokemon = NbtValue::Compound(HashMap::from([
            (
                "Species".to_string(),
                NbtValue::String("cobblemon:charizard".to_string()),
            ),
            ("Level".to_string(), NbtValue::Int(74)),
            ("Friendship".to_string(), NbtValue::Int(196)),
            (
                "CaughtBall".to_string(),
                NbtValue::String("cobblemon:ancient_feather_ball".to_string()),
            ),
            (
                "TeraType".to_string(),
                NbtValue::String("cobblemon:fire".to_string()),
            ),
            ("Shiny".to_string(), NbtValue::Byte(1)),
            (
                "IVs".to_string(),
                NbtValue::Compound(HashMap::from([
                    (
                        "Base".to_string(),
                        NbtValue::Compound(HashMap::from([
                            ("cobblemon:hp".to_string(), NbtValue::Int(31)),
                            ("cobblemon:attack".to_string(), NbtValue::Int(27)),
                        ])),
                    ),
                    (
                        "HyperTrained".to_string(),
                        NbtValue::Compound(HashMap::from([(
                            "cobblemon:attack".to_string(),
                            NbtValue::Int(31),
                        )])),
                    ),
                ])),
            ),
            (
                "EVs".to_string(),
                NbtValue::Compound(HashMap::from([(
                    "cobblemon:special_attack".to_string(),
                    NbtValue::Int(252),
                )])),
            ),
            (
                "HeldItem".to_string(),
                NbtValue::Compound(HashMap::from([(
                    "id".to_string(),
                    NbtValue::String("minecraft:charcoal".to_string()),
                )])),
            ),
        ]));
        let mut parsed = Vec::new();

        collect_nbt_pokemon(&pokemon, "party/Slot0", &mut parsed);

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].species, "cobblemon:charizard");
        assert_eq!(parsed[0].level, Some(74));
        assert!(parsed[0].shiny);
        assert_eq!(parsed[0].held_item.as_deref(), Some("minecraft:charcoal"));
        assert_eq!(parsed[0].ivs.get("hp"), Some(&31));
        assert_eq!(parsed[0].ivs.get("attack"), Some(&27));
        assert_eq!(parsed[0].hyper_trained_ivs.get("attack"), Some(&31));
        assert_eq!(parsed[0].evs.get("special_attack"), Some(&252));
        assert_eq!(parsed[0].friendship, Some(196));
        assert_eq!(
            parsed[0].caught_ball.as_deref(),
            Some("cobblemon:ancient_feather_ball")
        );
        assert_eq!(parsed[0].tera_type.as_deref(), Some("cobblemon:fire"));

        let frontend = serde_json::to_value(&parsed[0]).unwrap();
        assert_eq!(frontend["friendship"], 196);
        assert_eq!(frontend["caughtBall"], "cobblemon:ancient_feather_ball");
        assert_eq!(frontend["teraType"], "cobblemon:fire");
        assert_eq!(frontend["ivs"]["hp"], 31);
        assert_eq!(frontend["evs"]["special_attack"], 252);
    }

    #[test]
    fn separates_caught_and_encountered_pokedex_records() {
        let form = |knowledge: &str| {
            NbtValue::Compound(HashMap::from([(
                "formRecords".to_string(),
                NbtValue::List(vec![NbtValue::Compound(HashMap::from([(
                    "knowledge".to_string(),
                    NbtValue::String(knowledge.to_string()),
                )]))]),
            )]))
        };
        let pokedex = NbtValue::Compound(HashMap::from([(
            "speciesRecords".to_string(),
            NbtValue::Compound(HashMap::from([
                ("cobblemon:charizard".to_string(), form("CAUGHT")),
                ("cobblemon:mew".to_string(), form("ENCOUNTERED")),
            ])),
        )]));

        let (caught, seen) = parse_pokedex_nbt(&pokedex);

        assert_eq!(caught, vec!["cobblemon:charizard"]);
        assert_eq!(seen, vec!["cobblemon:charizard", "cobblemon:mew"]);
    }

    #[test]
    fn walks_remote_paths_without_escaping_the_server_root() {
        assert_eq!(
            remote_join("/server/", "/world/playerdata"),
            "/server/world/playerdata"
        );
        assert_eq!(
            remote_parent("/server/world/playerdata"),
            Some("/server/world".to_string())
        );
        assert_eq!(remote_parent("/"), None);
    }

    #[test]
    fn uses_the_official_cobblemon_pokedex_nbt_path() {
        let uuid = "e34539e6-c74d-4e08-8415-f480c09cdc7b";
        let paths = player_pokedex_paths("/world", uuid);

        assert_eq!(
            paths[0],
            "/world/pokedex/e3/e34539e6-c74d-4e08-8415-f480c09cdc7b.nbt"
        );
        assert_eq!(paths[1], format!("{}.old", paths[0]));
        assert!(paths.iter().all(|path| !path.ends_with(".dat")));
    }

    #[test]
    #[ignore = "requer perfil SFTP salvo e servidor disponível"]
    fn live_saved_sftp_sync_reads_the_current_pokedex_file() {
        let known_hosts = std::env::var("COBBLEVERSE_LIVE_SFTP_KNOWN_HOSTS")
            .expect("informe COBBLEVERSE_LIVE_SFTP_KNOWN_HOSTS");
        let player_name = std::env::var("COBBLEVERSE_LIVE_PLAYER_NAME")
            .expect("informe COBBLEVERSE_LIVE_PLAYER_NAME");
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let result = runtime
            .block_on(sync_saved_sftp_player_data(
                player_name,
                PathBuf::from(known_hosts),
            ))
            .unwrap();

        assert!(result.seen_species.len() >= result.caught_species.len());
        assert!(result
            .files_read
            .iter()
            .any(|path| path.ends_with(".nbt") || path.ends_with(".nbt.old")));
        if let Ok(expected_species) = std::env::var("COBBLEVERSE_LIVE_CAUGHT_SPECIES") {
            for species in expected_species
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                assert!(
                    result.caught_species.iter().any(|value| {
                        value.eq_ignore_ascii_case(species)
                            || value
                                .rsplit(':')
                                .next()
                                .is_some_and(|id| id.eq_ignore_ascii_case(species))
                    }),
                    "a Pokédex não marcou {species} como capturado"
                );
            }
        }
        if let Ok(inspected_species) = std::env::var("COBBLEVERSE_LIVE_INSPECT_SPECIES") {
            let pokemon = result
                .party
                .iter()
                .chain(result.pc.iter())
                .find(|pokemon| {
                    pokemon
                        .species
                        .rsplit(':')
                        .next()
                        .is_some_and(|id| id.eq_ignore_ascii_case(inspected_species.trim()))
                })
                .expect("Pokemon solicitado para inspecao nao encontrado");
            eprintln!(
                "PARSED {} friendship={:?} caught_ball={:?} tera_type={:?} ivs={:?} evs={:?}",
                pokemon.species,
                pokemon.friendship,
                pokemon.caught_ball,
                pokemon.tera_type,
                pokemon.ivs,
                pokemon.evs
            );
        }
        eprintln!(
            "Pokedex: {} vistos, {} capturados; party: {}; PC: {}",
            result.seen_species.len(),
            result.caught_species.len(),
            result.party.len(),
            result.pc.len()
        );
    }
}

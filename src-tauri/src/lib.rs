#![allow(clippy::upper_case_acronyms)] // Win32 FFI structs keep their SDK names
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::os::windows::process::CommandExt;
use base64::{Engine as _, engine::general_purpose};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, Position, WebviewWindow,
};
use winreg::enums::*;
use winreg::{RegKey, RegValue};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub is_playing: bool,
    pub title: String,
    pub artist: String,
    pub source_app: String,
    pub audio_peak: f32,
    pub position_secs: f64,
    pub duration_secs: f64,
}

#[cfg(windows)]
pub mod media_bridge {
    use super::MediaState;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };
    use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
    use windows::Win32::Media::Audio::{IMMDeviceEnumerator, MMDeviceEnumerator, eMultimedia, eRender};
    use windows::Win32::System::Com::{CLSCTX_ALL, CoCreateInstance, CoInitializeEx, COINIT_MULTITHREADED};

    pub struct ComGuard {
        needs_uninit: bool,
    }

    impl ComGuard {
        pub fn new() -> Self {
            unsafe {
                let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
                Self {
                    needs_uninit: hr.is_ok(),
                }
            }
        }
    }

    impl Default for ComGuard {
        fn default() -> Self {
            Self::new()
        }
    }

    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.needs_uninit {
                unsafe {
                    windows::Win32::System::Com::CoUninitialize();
                }
            }
        }
    }

    thread_local! {
        static CACHED_AUDIO_METER: std::cell::RefCell<Option<IAudioMeterInformation>> = const { std::cell::RefCell::new(None) };
        static CACHED_GSMTC_MANAGER: std::cell::RefCell<Option<GlobalSystemMediaTransportControlsSessionManager>> = const { std::cell::RefCell::new(None) };
    }

    pub fn get_system_audio_peak() -> f32 {
        let _com = ComGuard::new();

        // 1. Fast path: check cached audio meter directly
        let cached_peak = CACHED_AUDIO_METER.with(|cell| {
            if let Some(meter) = cell.borrow().as_ref() {
                unsafe {
                    if let Ok(peak) = meter.GetPeakValue()
                        && peak.is_finite() && peak >= 0.0 {
                            return Some(peak.min(1.0));
                        }
                }
            }
            None
        });

        if let Some(peak) = cached_peak {
            return peak;
        }

        // 2. Slow path / recovery: default endpoint invalidated or not yet created
        unsafe {
            let enumerator: Result<IMMDeviceEnumerator, _> = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);
            if let Ok(enumerator) = enumerator
                && let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)
                    && let Ok(meter) = device.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None)
                        && let Ok(peak) = meter.GetPeakValue() {
                            let final_peak = if peak.is_finite() && peak >= 0.0 {
                                peak.min(1.0)
                            } else {
                                0.0
                            };
                            CACHED_AUDIO_METER.with(|cell| {
                                *cell.borrow_mut() = Some(meter);
                            });
                            return final_peak;
                        }
        }

        // Endpoint inactive or no audio hardware
        CACHED_AUDIO_METER.with(|cell| {
            *cell.borrow_mut() = None;
        });
        0.0
    }

    fn get_gsmtc_manager() -> Option<GlobalSystemMediaTransportControlsSessionManager> {
        CACHED_GSMTC_MANAGER.with(|cell| {
            if let Some(mgr) = cell.borrow().as_ref() {
                return Some(mgr.clone());
            }
            if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                && let Ok(mgr) = op.join() {
                    *cell.borrow_mut() = Some(mgr.clone());
                    return Some(mgr);
                }
            None
        })
    }

    #[derive(Clone, Default, Debug)]
    pub struct MediaMetadata {
        pub is_playing: bool,
        pub title: String,
        pub artist: String,
        pub source_app: String,
        pub position_secs: f64,
        pub duration_secs: f64,
    }

    fn is_ignored_media(source_app: &str, title: &str, artist: &str) -> bool {
        let app_lower = source_app.to_lowercase();
        let title_lower = title.to_lowercase();
        let artist_lower = artist.to_lowercase();

        // 1. Applications to ignore: video/audio editors, conferencing, meetings, calls, screen recorders
        const IGNORED_APPS: &[&str] = &[
            "capcut",
            "lemon.capcut",
            "zoom",
            "cpthost",
            "teams",
            "msteams",
            "discord",
            "skype",
            "webex",
            "ciscocollabhost",
            "slack",
            "whatsapp",
            "telegram",
            "premiere",
            "afterfx",
            "resolve",
            "davinci",
            "audacity",
            "filmora",
            "camtasia",
            "obs64",
            "obs32",
            "obs",
            "streamlabs",
        ];

        for ignored in IGNORED_APPS {
            if app_lower.contains(ignored) {
                return true;
            }
        }

        // 2. Browser meeting tabs or conference titles
        const IGNORED_TITLES: &[&str] = &[
            "meet - ",
            "google meet",
            "zoom meeting",
            "zoom workplace",
            "microsoft teams",
            "discord |",
            "whatsapp call",
            "telegram call",
            "webex meeting",
        ];

        for ignored in IGNORED_TITLES {
            if title_lower.contains(ignored) || artist_lower.contains(ignored) {
                return true;
            }
        }

        false
    }

    fn extract_session_metadata(
        session: &windows::Media::Control::GlobalSystemMediaTransportControlsSession,
    ) -> Option<MediaMetadata> {
        let mut source_app = String::new();
        if let Ok(app_id) = session.SourceAppUserModelId() {
            let raw = app_id.to_string();
            let raw_lower = raw.to_lowercase();
            if raw_lower.contains("brave") {
                source_app = "Brave".to_string();
            } else if raw_lower.contains("chrome") {
                source_app = "Chrome".to_string();
            } else if raw_lower.contains("edge") {
                source_app = "Edge".to_string();
            } else if raw_lower.contains("firefox") {
                source_app = "Firefox".to_string();
            } else if raw_lower.contains("spotify") {
                source_app = "Spotify".to_string();
            } else {
                source_app = raw;
            }
        }

        let mut title = String::new();
        let mut artist = String::new();
        if let Ok(props_op) = session.TryGetMediaPropertiesAsync()
            && let Ok(props) = props_op.join() {
                if let Ok(t) = props.Title() {
                    title = t.to_string();
                }
                if let Ok(a) = props.Artist() {
                    artist = a.to_string();
                }
            }

        // Filter out non-music applications (Zoom, CapCut, Teams, etc.)
        if is_ignored_media(&source_app, &title, &artist) {
            return None;
        }

        if title.trim().is_empty() {
            return None;
        }

        let mut is_playing = false;
        if let Ok(info) = session.GetPlaybackInfo()
            && let Ok(status) = info.PlaybackStatus() {
                is_playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
            }

        let mut position_secs: f64 = 0.0;
        let mut duration_secs: f64 = 0.0;

        if let Ok(timeline) = session.GetTimelineProperties() {
            let mut base_pos: f64 = 0.0;
            if let Ok(pos) = timeline.Position() {
                let s = (pos.Duration as f64) / 10_000_000.0;
                if s >= 0.0 && s.is_finite() {
                    base_pos = s;
                }
            }
            if let Ok(end) = timeline.EndTime() {
                let s = (end.Duration as f64) / 10_000_000.0;
                if s >= 0.0 && s.is_finite() {
                    duration_secs = s;
                }
            }

            // Windows GSMTC position is reported as-of LastUpdatedTime!
            // If playing, interpolate the elapsed real time so timeline stays perfectly synced
            // across media players (Spotify, Brave, Chrome, etc.)
            if is_playing
                && let Ok(last_updated) = timeline.LastUpdatedTime() {
                    let win_epoch_offset = 116_444_736_000_000_000i64;
                    let last_updated_100ns = last_updated.UniversalTime;
                    if last_updated_100ns > win_epoch_offset {
                        let unix_now_100ns = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| (d.as_nanos() / 100) as i64)
                            .unwrap_or(0);
                        let last_updated_unix_100ns = last_updated_100ns - win_epoch_offset;
                        if unix_now_100ns > last_updated_unix_100ns {
                            let elapsed = (unix_now_100ns - last_updated_unix_100ns) as f64 / 10_000_000.0;
                            if (0.0..86400.0).contains(&elapsed) {
                                base_pos += elapsed;
                            }
                        }
                    }
                }

            if duration_secs > 0.0 && base_pos > duration_secs {
                base_pos = duration_secs;
            }
            position_secs = base_pos;
        }

        Some(MediaMetadata {
            is_playing,
            title,
            artist,
            source_app,
            position_secs,
            duration_secs,
        })
    }

    pub fn get_media_metadata() -> MediaMetadata {
        let manager = get_gsmtc_manager();
        if let Some(manager) = manager {
            // 1. Check current active session first
            let session_res = manager.GetCurrentSession();
            let session = match session_res {
                Ok(s) => Ok(s),
                Err(_) => {
                    // Stale manager handle, refresh once
                    CACHED_GSMTC_MANAGER.with(|cell| *cell.borrow_mut() = None);
                    get_gsmtc_manager().and_then(|m| m.GetCurrentSession().ok()).ok_or(())
                }
            };

            if let Ok(curr_session) = session
                && let Some(meta) = extract_session_metadata(&curr_session) {
                    return meta;
                }

            // 2. If current session is ignored (e.g. CapCut or Zoom active on screen) or invalid,
            // iterate all sessions to find an active music session (e.g. Spotify playing in background)
            if let Ok(sessions) = manager.GetSessions()
                && let Ok(size) = sessions.Size() {
                    let mut candidate: Option<MediaMetadata> = None;
                    for i in 0..size {
                        if let Ok(s) = sessions.GetAt(i)
                            && let Some(meta) = extract_session_metadata(&s) {
                                if meta.is_playing {
                                    return meta;
                                }
                                if candidate.is_none() {
                                    candidate = Some(meta);
                                }
                            }
                    }
                    if let Some(meta) = candidate {
                        return meta;
                    }
                }
        }

        MediaMetadata::default()
    }

    pub fn get_current_media_state() -> MediaState {
        let meta = get_media_metadata();
        let audio_peak = get_system_audio_peak();
        let has_track = !meta.title.is_empty();

        let mut is_playing = meta.is_playing;
        // Audio peak only confirms playback if there is a legitimate, recognized music track!
        if audio_peak > 0.015 && has_track {
            is_playing = true;
        }

        MediaState {
            is_playing,
            title: meta.title,
            artist: meta.artist,
            source_app: meta.source_app,
            audio_peak: if has_track { audio_peak } else { 0.0 },
            position_secs: meta.position_secs,
            duration_secs: meta.duration_secs,
        }
    }

    use windows::Media::Control::GlobalSystemMediaTransportControlsSession as Session;

    fn session_app(s: &Session) -> String {
        s.SourceAppUserModelId().map(|id| id.to_string()).unwrap_or_default()
    }

    /// Runs `action` on the current session first, then on every other session,
    /// skipping ignored apps (Zoom, CapCut…). Returns true on the first success.
    fn act_on_media_sessions(action: impl Fn(&Session) -> bool) -> bool {
        let Some(manager) = get_gsmtc_manager() else { return false };
        if let Ok(session) = manager.GetCurrentSession()
            && !is_ignored_media(&session_app(&session), "", "") && action(&session) {
                return true;
            }
        if let Ok(sessions) = manager.GetSessions() {
            for i in 0..sessions.Size().unwrap_or(0) {
                if let Ok(s) = sessions.GetAt(i)
                    && !is_ignored_media(&session_app(&s), "", "") && action(&s) {
                        return true;
                    }
            }
        }
        false
    }

    macro_rules! join_bool {
        ($op:expr) => {
            $op.ok().and_then(|o| o.join().ok()).unwrap_or(false)
        };
    }

    pub fn toggle_play() -> bool {
        act_on_media_sessions(|s| {
            if join_bool!(s.TryTogglePlayPauseAsync()) {
                return true;
            }
            let playing = s
                .GetPlaybackInfo()
                .and_then(|i| i.PlaybackStatus())
                .map(|st| st == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
                .unwrap_or(false);
            if playing { join_bool!(s.TryPauseAsync()) } else { join_bool!(s.TryPlayAsync()) }
        })
    }

    pub fn skip_next() -> bool {
        act_on_media_sessions(|s| join_bool!(s.TrySkipNextAsync()))
    }

    pub fn skip_prev() -> bool {
        act_on_media_sessions(|s| join_bool!(s.TrySkipPreviousAsync()))
    }
}

#[cfg(not(windows))]
pub mod media_bridge {
    #[derive(Default)]
    pub struct ComGuard;
    impl ComGuard {
        pub fn new() -> Self { Self }
    }
    use super::MediaState;

    #[derive(Clone, Default, Debug)]
    pub struct MediaMetadata {
        pub is_playing: bool,
        pub title: String,
        pub artist: String,
        pub source_app: String,
        pub position_secs: f64,
        pub duration_secs: f64,
    }

    pub fn get_system_audio_peak() -> f32 { 0.0 }
    pub fn get_media_metadata() -> MediaMetadata { MediaMetadata::default() }
    pub fn get_current_media_state() -> MediaState {
        MediaState {
            is_playing: false,
            title: String::new(),
            artist: String::new(),
            source_app: String::new(),
            audio_peak: 0.0,
            position_secs: 0.0,
            duration_secs: 0.0,
        }
    }
    pub fn toggle_play() -> bool { false }
    pub fn skip_next() -> bool { false }
    pub fn skip_prev() -> bool { false }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub category: String,
}

const APP_IDENTIFIER: &str = "com.programfreelance.hovera";

/// Single source of truth for the app data directory. Initialised once in `setup`
/// from Tauri's `app_local_data_dir()` (= %LOCALAPPDATA%\com.programfreelance.hovera).
static APP_DATA_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

fn get_app_data_dir() -> PathBuf {
    APP_DATA_DIR
        .get_or_init(|| {
            std::env::var("LOCALAPPDATA")
                .map(|d| PathBuf::from(d).join(APP_IDENTIFIER))
                .unwrap_or_else(|_| PathBuf::from(".").join(APP_IDENTIFIER))
        })
        .clone()
}

/// Older builds sometimes wrote data into %LOCALAPPDATA%\Hovera (which is also the
/// NSIS per-user install directory). Copy those files once into the real data dir.
fn migrate_legacy_data_dir(target: &Path) {
    let Ok(local_app_data) = std::env::var("LOCALAPPDATA") else { return };
    let legacy = PathBuf::from(local_app_data).join("Hovera");
    if legacy == target || !legacy.exists() {
        return;
    }
    let _ = fs::create_dir_all(target);
    for name in [
        "app-settings.json",
        "app-settings.json.bak",
        "window-position.json",
        "window-position.json.bak",
        "clipboard-history.json",
        "user-storage.json",
    ] {
        let src = legacy.join(name);
        let dst = target.join(name);
        if src.exists() && !dst.exists() {
            // Copy only (never delete the source) so a downgrade still finds its data.
            if let Err(e) = fs::copy(&src, &dst) {
                log::warn!("Gagal migrasi {}: {}", name, e);
            }
        }
    }
}

/// Lock that never stays poisoned: a panic in one thread must not permanently
/// disable the clipboard feature (or crash every later command).
fn lock_clipboard() -> std::sync::MutexGuard<'static, ()> {
    CLIPBOARD_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

/// Truncate to at most `max_chars` characters without splitting a UTF-8 code point.
fn truncate_chars(s: &str, max_chars: usize) -> String {
    match s.char_indices().nth(max_chars) {
        Some((idx, _)) => format!("{}...", &s[..idx]),
        None => s.to_string(),
    }
}

fn get_position_file() -> PathBuf {
    let dir = get_app_data_dir();
    let _ = fs::create_dir_all(&dir);
    dir.join("window-position.json")
}

fn get_position_backup_file() -> PathBuf {
    let dir = get_app_data_dir();
    dir.join("window-position.json.bak")
}

fn get_settings_file() -> PathBuf {
    let dir = get_app_data_dir();
    let _ = fs::create_dir_all(&dir);
    dir.join("app-settings.json")
}

fn get_settings_backup_file() -> PathBuf {
    let dir = get_app_data_dir();
    dir.join("app-settings.json.bak")
}

fn atomic_write_file(path: &Path, content: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let tmp_path = path.with_extension(format!("tmp.{}", std::process::id()));
    fs::write(&tmp_path, content)?;
    if fs::rename(&tmp_path, path).is_err() {
        let _ = fs::remove_file(path);
        if let Err(e) = fs::rename(&tmp_path, path) {
            let _ = fs::write(path, content);
            let _ = fs::remove_file(&tmp_path);
            return Err(e);
        }
    }
    Ok(())
}


fn get_clipboard_history_file() -> PathBuf {
    let dir = get_app_data_dir();
    let _ = fs::create_dir_all(&dir);
    dir.join("clipboard-history.json")
}

fn get_clipboard_images_dir() -> PathBuf {
    let dir = get_app_data_dir().join("clipboard-images");
    let _ = fs::create_dir_all(&dir);
    dir
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardItem {
    pub id: String,
    pub content: String,
    pub preview: String,
    pub item_type: String, // "text", "link", "color", "code", "image"
    pub color_hex: Option<String>,
    pub char_count: usize,
    pub is_pinned: bool,
    pub timestamp: i64,
    pub image_path: Option<String>,
    pub image_data_url: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub image_size_bytes: Option<usize>,
}

static CLIPBOARD_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(windows)]
#[link(name = "user32")]
unsafe extern "system" {
    fn GetClipboardSequenceNumber() -> u32;
}

fn classify_clipboard_text(text: &str) -> (String, Option<String>) {
    let trimmed = text.trim();
    // 1. Color check (HEX: #FFF, #FFFFFF, #FFFFFFFF or rgb/rgba)
    let is_hex_color = (trimmed.len() == 4 || trimmed.len() == 7 || trimmed.len() == 9)
        && trimmed.starts_with('#')
        && trimmed[1..].chars().all(|c| c.is_ascii_hexdigit());

    if is_hex_color {
        return ("color".to_string(), Some(trimmed.to_string()));
    }

    if trimmed.starts_with("rgb(") || trimmed.starts_with("rgba(") {
        return ("color".to_string(), Some(trimmed.to_string()));
    }

    // 2. Link check
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return ("link".to_string(), None);
    }

    // 3. Code snippet check
    let has_newlines = trimmed.contains('\n');
    let has_code_tokens = trimmed.contains('{') && trimmed.contains('}')
        || trimmed.contains("const ")
        || trimmed.contains("let ")
        || trimmed.contains("function ")
        || trimmed.contains("def ")
        || trimmed.contains("import ")
        || trimmed.contains("class ")
        || trimmed.contains("SELECT ")
        || trimmed.contains("</div>")
        || trimmed.contains("=>");

    if has_newlines && has_code_tokens {
        return ("code".to_string(), None);
    }

    ("text".to_string(), None)
}

/// In-memory clipboard history. Unpinned items never touch the disk (privacy);
/// only pinned items are persisted to `clipboard-history.json`.
static CLIPBOARD_ITEMS: std::sync::Mutex<Option<Vec<ClipboardItem>>> = std::sync::Mutex::new(None);
static CLIPBOARD_ENABLED: AtomicBool = AtomicBool::new(true);
const CLIPBOARD_MAX_UNPINNED: usize = 50;
const CLIPBOARD_MAX_TEXT_BYTES: usize = 200_000;

fn read_clipboard_file() -> Vec<ClipboardItem> {
    let file = get_clipboard_history_file();
    if file.exists() {
        match fs::read_to_string(&file) {
            Ok(content) => match serde_json::from_str::<Vec<ClipboardItem>>(&content) {
                Ok(items) => return items,
                Err(e) => log::warn!("clipboard-history.json rusak: {}", e),
            },
            Err(e) => log::warn!("Gagal membaca clipboard-history.json: {}", e),
        }
    }
    Vec::new()
}

/// Must be called while holding `lock_clipboard()`.
fn load_clipboard_history() -> Vec<ClipboardItem> {
    let mut store = CLIPBOARD_ITEMS.lock().unwrap_or_else(|e| e.into_inner());
    if store.is_none() {
        let mut items = read_clipboard_file();
        items.retain(|i| i.is_pinned);
        *store = Some(items);
    }
    store.clone().unwrap_or_default()
}

/// Must be called while holding `lock_clipboard()`.
fn save_clipboard_history(items: &[ClipboardItem]) -> bool {
    *CLIPBOARD_ITEMS.lock().unwrap_or_else(|e| e.into_inner()) = Some(items.to_vec());
    let pinned: Vec<&ClipboardItem> = items.iter().filter(|i| i.is_pinned).collect();
    let file = get_clipboard_history_file();
    match serde_json::to_string(&pinned) {
        Ok(json) => match atomic_write_file(&file, &json) {
            Ok(()) => true,
            Err(e) => {
                log::warn!("Gagal menyimpan riwayat clipboard: {}", e);
                false
            }
        },
        Err(_) => false,
    }
}

/// Keep all pinned items plus the newest `CLIPBOARD_MAX_UNPINNED` unpinned ones.
fn enforce_clipboard_limit(items: &mut Vec<ClipboardItem>) {
    let mut unpinned_count = 0;
    items.retain(|item| {
        if item.is_pinned {
            return true;
        }
        unpinned_count += 1;
        if unpinned_count > CLIPBOARD_MAX_UNPINNED {
            if let Some(ref p) = item.image_path {
                let _ = fs::remove_file(p);
            }
            false
        } else {
            true
        }
    });
}

/// Returns true when the current clipboard content was marked by its source app
/// (password managers, browsers' password fields, KeePass…) as not to be recorded.
#[cfg(windows)]
fn clipboard_is_excluded() -> bool {
    use std::os::raw::c_void;
    unsafe extern "system" {
        fn RegisterClipboardFormatW(name: *const u16) -> u32;
        fn IsClipboardFormatAvailable(format: u32) -> i32;
        fn OpenClipboard(hwnd: *mut c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn GetClipboardData(format: u32) -> *mut c_void;
        fn GlobalLock(h: *mut c_void) -> *mut c_void;
        fn GlobalUnlock(h: *mut c_void) -> i32;
    }
    fn fmt(name: &str) -> u32 {
        let w: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe { RegisterClipboardFormatW(w.as_ptr()) }
    }
    unsafe {
        for name in ["ExcludeClipboardContentFromMonitorProcessing", "Clipboard Viewer Ignore"] {
            let f = fmt(name);
            if f != 0 && IsClipboardFormatAvailable(f) != 0 {
                return true;
            }
        }
        // CanIncludeInClipboardHistory = DWORD 0 means "do not keep in history"
        let f = fmt("CanIncludeInClipboardHistory");
        if f != 0 && IsClipboardFormatAvailable(f) != 0 {
            let mut excluded = false;
            if OpenClipboard(std::ptr::null_mut()) != 0 {
                let h = GetClipboardData(f);
                if !h.is_null() {
                    let p = GlobalLock(h) as *const u32;
                    if !p.is_null() {
                        excluded = *p == 0;
                        GlobalUnlock(h);
                    }
                }
                CloseClipboard();
            }
            return excluded;
        }
    }
    false
}

#[cfg(not(windows))]
fn clipboard_is_excluded() -> bool {
    false
}

#[tauri::command]
fn get_clipboard_history_enabled() -> bool {
    CLIPBOARD_ENABLED.load(Ordering::SeqCst)
}

#[tauri::command]
fn set_clipboard_history_enabled(enabled: bool) -> bool {
    CLIPBOARD_ENABLED.store(enabled, Ordering::SeqCst);
    let mut settings = read_app_settings();
    if let Some(obj) = settings.as_object_mut() {
        obj.insert("clipboardHistoryEnabled".into(), serde_json::Value::Bool(enabled));
    }
    write_app_settings(&settings);
    if !enabled {
        cleanup_unpinned_clipboard_history();
    }
    enabled
}

fn cleanup_unpinned_clipboard_history() {
    let _guard = lock_clipboard();
    let mut items = load_clipboard_history();

    let mut pinned_images = std::collections::HashSet::new();

    items.retain(|item| {
        if item.is_pinned {
            if let Some(ref path_str) = item.image_path
                && let Some(file_name) = Path::new(path_str).file_name() {
                    pinned_images.insert(file_name.to_string_lossy().to_string());
                }
            true
        } else {
            if let Some(ref path_str) = item.image_path {
                let _ = fs::remove_file(path_str);
            }
            false
        }
    });

    let img_dir = get_clipboard_images_dir();
    if let Ok(entries) = fs::read_dir(&img_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str()
                && !pinned_images.contains(name) {
                    let _ = fs::remove_file(entry.path());
                }
        }
    }

    // Always rewrite: files from older versions may still hold unpinned (plaintext) items.
    save_clipboard_history(&items);
}

#[tauri::command]
fn get_clipboard_history() -> Vec<ClipboardItem> {
    let _guard = lock_clipboard();
    load_clipboard_history()
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> bool {
    if let Ok(mut cb) = arboard::Clipboard::new() {
        return cb.set_text(text).is_ok();
    }
    false
}

#[tauri::command]
async fn copy_clipboard_item(id: String) -> bool {
    let item = {
        let _guard = lock_clipboard();
        load_clipboard_history().into_iter().find(|i| i.id == id)
    };
    let Some(item) = item else { return false };
    run_blocking(move || {
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        if item.item_type != "image" {
            return cb.set_text(&item.content).map_err(|e| e.to_string());
        }
        let path = item.image_path.map(PathBuf::from).ok_or("tanpa gambar")?;
        let rgba = image::open(&path).map_err(|e| e.to_string())?.to_rgba8();
        let (width, height) = (rgba.width() as usize, rgba.height() as usize);
        cb.set_image(arboard::ImageData { width, height, bytes: std::borrow::Cow::Owned(rgba.into_raw()) })
            .map_err(|e| e.to_string())
    })
    .await
    .is_ok()
}

#[tauri::command]
fn save_clipboard_image(id: String) -> Result<String, String> {
    let item = {
        let _guard = lock_clipboard();
        let items = load_clipboard_history();
        items.into_iter().find(|i| i.id == id)
    }.ok_or("Item tidak ditemukan")?;

    let src_path = item.image_path.ok_or("Tidak ada gambar untuk item ini")?;
    let src = PathBuf::from(&src_path);
    if !src.exists() {
        return Err("Berkas gambar tidak ditemukan di disk".to_string());
    }

    let default_name = format!("Hovera_Capture_{}.png", item.id.replace("clip_", "").replace("img_", ""));
    let dialog = rfd::FileDialog::new()
        .set_title("Simpan Gambar Klip")
        .set_file_name(&default_name)
        .add_filter("Gambar PNG (*.png)", &["png"]);

    if let Some(dest_path) = dialog.save_file() {
        fs::copy(&src, &dest_path).map_err(|e| format!("Gagal menyimpan gambar: {}", e))?;
        Ok(dest_path.to_string_lossy().to_string())
    } else {
        Err("Dibatalkan oleh pengguna".to_string())
    }
}

#[tauri::command]
fn delete_clipboard_item(id: String) -> bool {
    let _guard = lock_clipboard();
    let mut items = load_clipboard_history();
    if let Some(pos) = items.iter().position(|item| item.id == id) {
        let removed = items.remove(pos);
        if let Some(ref path_str) = removed.image_path {
            let _ = fs::remove_file(path_str);
        }
        return save_clipboard_history(&items);
    }
    false
}

#[tauri::command]
fn toggle_pin_clipboard_item(id: String) -> bool {
    let _guard = lock_clipboard();
    let mut items = load_clipboard_history();
    if let Some(item) = items.iter_mut().find(|i| i.id == id) {
        item.is_pinned = !item.is_pinned;
        return save_clipboard_history(&items);
    }
    false
}

#[tauri::command]
fn clear_clipboard_history() -> bool {
    cleanup_unpinned_clipboard_history();
    true
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
struct SavedPosition {
    x: i32,
    y: i32,
    #[serde(default)]
    anchor_center_x: Option<i32>,
}

fn load_saved_position() -> Option<SavedPosition> {
    let file = get_position_file();
    if file.exists()
        && let Ok(content) = fs::read_to_string(&file)
            && let Ok(pos) = serde_json::from_str::<SavedPosition>(&content) {
                return Some(pos);
            }
    let backup_file = get_position_backup_file();
    if backup_file.exists()
        && let Ok(content) = fs::read_to_string(&backup_file)
            && let Ok(pos) = serde_json::from_str::<SavedPosition>(&content) {
                let _ = fs::copy(&backup_file, &file);
                return Some(pos);
            }
    None
}

fn save_position_with_anchor(x: i32, y: i32, anchor_center_x: i32) {
    let file = get_position_file();
    let backup_file = get_position_backup_file();
    let pos = SavedPosition {
        x,
        y,
        anchor_center_x: Some(anchor_center_x),
    };
    if let Ok(json) = serde_json::to_string(&pos)
        && atomic_write_file(&file, &json).is_ok() {
            let _ = fs::copy(&file, &backup_file);
        }
}

#[allow(dead_code)]
fn save_position(x: i32, y: i32) {
    save_position_with_anchor(x, y, x + 120);
}

fn clear_saved_position() {
    let file = get_position_file();
    let backup_file = get_position_backup_file();
    if file.exists() {
        let _ = fs::remove_file(file);
    }
    if backup_file.exists() {
        let _ = fs::remove_file(backup_file);
    }
}

#[cfg(windows)]
fn get_work_area_for_monitor(mon_x: i32, mon_y: i32) -> Option<(i32, i32, i32, i32)> {
    use std::os::raw::c_void;
    #[repr(C)]
    struct POINT {
        x: i32,
        y: i32,
    }
    #[repr(C)]
    struct RECT {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[repr(C)]
    struct MONITORINFO {
        cb_size: u32,
        rc_monitor: RECT,
        rc_work: RECT,
        dw_flags: u32,
    }
    unsafe extern "system" {
        fn MonitorFromPoint(pt: POINT, dw_flags: u32) -> *mut c_void;
        fn GetMonitorInfoW(h_monitor: *mut c_void, lpmi: *mut MONITORINFO) -> i32;
    }

    unsafe {
        let pt = POINT {
            x: mon_x + 10,
            y: mon_y + 10,
        };
        let hmon = MonitorFromPoint(pt, 2); // MONITOR_DEFAULTTONEAREST = 2
        if !hmon.is_null() {
            let mut mi = MONITORINFO {
                cb_size: std::mem::size_of::<MONITORINFO>() as u32,
                rc_monitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
                rc_work: RECT { left: 0, top: 0, right: 0, bottom: 0 },
                dw_flags: 0,
            };
            if GetMonitorInfoW(hmon, &mut mi) != 0 {
                return Some((mi.rc_work.left, mi.rc_work.top, mi.rc_work.right, mi.rc_work.bottom));
            }
        }
    }
    None
}

#[cfg(not(windows))]
fn get_work_area_for_monitor(_mon_x: i32, _mon_y: i32) -> Option<(i32, i32, i32, i32)> {
    None
}

fn get_virtual_desktop_bounds(window: &WebviewWindow) -> (i32, i32, i32, i32) {
    let monitors = window.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        if let Ok(Some(mon)) = window.current_monitor() {
            let pos = mon.position();
            let size = mon.size();
            return (pos.x, pos.y, pos.x + size.width as i32, pos.y + size.height as i32);
        }
        return (0, 0, 1920, 1080);
    }
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;

    for mon in &monitors {
        let pos = mon.position();
        let size = mon.size();
        min_x = min_x.min(pos.x);
        min_y = min_y.min(pos.y);
        max_x = max_x.max(pos.x + size.width as i32);
        max_y = max_y.max(pos.y + size.height as i32);
    }
    (min_x, min_y, max_x, max_y)
}

fn is_position_valid(window: &WebviewWindow, x: i32, y: i32) -> bool {
    let monitors = window.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        return true;
    }

    for mon in &monitors {
        let mon_scale = mon.scale_factor();
        let win_w = (600.0 * mon_scale).round() as i32;
        let win_h = (76.0 * mon_scale).round() as i32;

        let pos = mon.position();
        let size = mon.size();

        let mon_right = pos.x + size.width as i32;
        let mon_bottom = pos.y + size.height as i32;

        let overlap_left = x.max(pos.x);
        let overlap_right = (x + win_w).min(mon_right);
        let overlap_top = y.max(pos.y);
        let overlap_bottom = (y + win_h).min(mon_bottom);

        if overlap_right > overlap_left && overlap_bottom > overlap_top {
            let overlap_area = (overlap_right - overlap_left) as i64 * (overlap_bottom - overlap_top) as i64;
            let win_area = win_w as i64 * win_h as i64;
            // Valid if at least 35% of the island is visible within this monitor
            if overlap_area * 100 >= win_area * 35 {
                return true;
            }
        }
    }
    false
}

fn center_window_top(window: &WebviewWindow, y_offset: i32) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(mon) = monitor {
        let scale = mon.scale_factor();
        let mon_pos = mon.position();
        let mon_size = mon.size();

        // 600 logical width in physical pixels on the target monitor
        let win_physical_width = (600.0 * scale).round() as i32;
        let win_physical_height = (76.0 * scale).round() as i32;

        // Query work area to prevent collision with top taskbars
        let (work_left, work_top, work_right, work_bottom) = get_work_area_for_monitor(mon_pos.x, mon_pos.y)
            .unwrap_or((
                mon_pos.x,
                mon_pos.y,
                mon_pos.x + mon_size.width as i32,
                mon_pos.y + mon_size.height as i32,
            ));

        let work_width = work_right - work_left;
        let target_x = work_left + (work_width - win_physical_width) / 2;
        let target_y = work_top + ((y_offset as f64 * scale).round() as i32);

        let max_x = work_right - win_physical_width;
        let max_y = work_bottom - win_physical_height;

        let safe_x = target_x.clamp(work_left, max_x.max(work_left));
        let safe_y = target_y.clamp(work_top, max_y.max(work_top));

        let _ = window.set_position(Position::Physical(PhysicalPosition {
            x: safe_x,
            y: safe_y,
        }));
        pin_to_topmost(window);
    }
}

#[cfg(windows)]
pub fn pin_to_topmost(window: &WebviewWindow) {
    let _ = window.set_always_on_top(true);
    use std::os::raw::c_void;
    unsafe extern "system" {
        fn FindWindowW(lpClassName: *const u16, lpWindowName: *const u16) -> *mut c_void;
        fn SetWindowPos(
            hWnd: *mut c_void,
            hWndInsertAfter: *mut c_void,
            X: i32,
            Y: i32,
            cx: i32,
            cy: i32,
            uFlags: u32,
        ) -> i32;
    }

    let hwnd_raw: *mut c_void = if let Ok(hwnd) = window.hwnd() {
        hwnd.0
    } else {
        let title: Vec<u16> = "Hovera\0".encode_utf16().collect();
        unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) }
    };

    if !hwnd_raw.is_null() {
        const HWND_TOPMOST: *mut c_void = -1isize as *mut c_void;
        const SWP_NOSIZE: u32 = 0x0001;
        const SWP_NOMOVE: u32 = 0x0002;
        const SWP_NOACTIVATE: u32 = 0x0010;
        unsafe {
            SetWindowPos(
                hwnd_raw,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
}

#[cfg(not(windows))]
pub fn pin_to_topmost(_window: &WebviewWindow) {}

#[cfg(windows)]
fn get_global_cursor_pos() -> Option<(i32, i32)> {
    #[repr(C)]
    struct POINT {
        x: i32,
        y: i32,
    }
    unsafe extern "system" {
        fn GetCursorPos(point: *mut POINT) -> i32;
    }
    let mut pt = POINT { x: 0, y: 0 };
    unsafe {
        if GetCursorPos(&mut pt) != 0 {
            Some((pt.x, pt.y))
        } else {
            None
        }
    }
}

#[cfg(not(windows))]
fn get_global_cursor_pos() -> Option<(i32, i32)> {
    None
}

#[cfg(windows)]
pub fn trim_memory_internal() {
    use std::collections::HashSet;
    use std::os::raw::c_void;

    #[repr(C)]
    struct PROCESSENTRY32W {
        dw_size: u32,
        cnt_usage: u32,
        th32_process_id: u32,
        th32_default_heap_id: usize,
        th32_module_id: u32,
        cnt_threads: u32,
        th32_parent_process_id: u32,
        pc_pri_class_base: i32,
        dw_flags: u32,
        sz_exe_file: [u16; 260],
    }

    unsafe extern "system" {
        fn GetCurrentProcessId() -> u32;
        fn GetCurrentProcess() -> *mut c_void;
        fn SetProcessWorkingSetSize(h_process: *mut c_void, min: usize, max: usize) -> i32;
        fn CreateToolhelp32Snapshot(dw_flags: u32, th32_process_id: u32) -> *mut c_void;
        fn Process32FirstW(h_snapshot: *mut c_void, lppe: *mut PROCESSENTRY32W) -> i32;
        fn Process32NextW(h_snapshot: *mut c_void, lppe: *mut PROCESSENTRY32W) -> i32;
        fn OpenProcess(dw_desired_access: u32, b_inherit_handle: i32, dw_process_id: u32) -> *mut c_void;
        fn CloseHandle(h_object: *mut c_void) -> i32;
    }

    unsafe {
        let cur = GetCurrentProcess();
        let _ = SetProcessWorkingSetSize(cur, usize::MAX, usize::MAX);

        let my_pid = GetCurrentProcessId();
        let snapshot = CreateToolhelp32Snapshot(0x00000002, 0); // TH32CS_SNAPPROCESS
        if snapshot as isize == -1 || snapshot.is_null() {
            return;
        }

        let mut entry = PROCESSENTRY32W {
            dw_size: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            cnt_usage: 0,
            th32_process_id: 0,
            th32_default_heap_id: 0,
            th32_module_id: 0,
            cnt_threads: 0,
            th32_parent_process_id: 0,
            pc_pri_class_base: 0,
            dw_flags: 0,
            sz_exe_file: [0; 260],
        };

        let mut all_pids = Vec::new();
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                all_pids.push((entry.th32_process_id, entry.th32_parent_process_id));
                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);

        let mut target_pids = HashSet::new();
        target_pids.insert(my_pid);

        let mut changed = true;
        while changed {
            changed = false;
            for &(pid, parent_pid) in &all_pids {
                if target_pids.contains(&parent_pid) && !target_pids.contains(&pid) {
                    target_pids.insert(pid);
                    changed = true;
                }
            }
        }

        for &pid in &target_pids {
            if pid == my_pid {
                continue;
            }
            let h = OpenProcess(0x0100 | 0x0400, 0, pid);
            if !h.is_null() {
                let _ = SetProcessWorkingSetSize(h, usize::MAX, usize::MAX);
                CloseHandle(h);
            }
        }
    }
}

#[cfg(not(windows))]
pub fn trim_memory_internal() {}

#[tauri::command]
fn trim_memory() {
    trim_memory_internal();
}

use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU32, AtomicU64, Ordering};

static EXPAND_SESSION_ID: AtomicU64 = AtomicU64::new(0);
static IS_EXPANDED: AtomicBool = AtomicBool::new(false);
static COMPACT_WIDTH: AtomicU32 = AtomicU32::new(240);
static COMPACT_HEIGHT: AtomicU32 = AtomicU32::new(48);
static IS_IGNORING_MOUSE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn set_ignore_mouse_events(window: WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

#[tauri::command]
fn set_window_expanded(
    window: WebviewWindow,
    expanded: bool,
    height: Option<u32>,
    width: Option<u32>,
) {
    let session = EXPAND_SESSION_ID.fetch_add(1, Ordering::SeqCst) + 1;
    IS_EXPANDED.store(expanded, Ordering::SeqCst);

    if let Some(w) = width {
        COMPACT_WIDTH.store(w, Ordering::SeqCst);
    }
    if let Some(h) = height
        && !expanded {
            COMPACT_HEIGHT.store(h, Ordering::SeqCst);
        }

    let h = if expanded {
        (height.unwrap_or(430) + 70) as f64
    } else {
        76.0
    };

    // Width is always constant at 600.0: provides a static canvas for Framer Motion,
    // completely eliminating any horizontal reflow, snapping, or width-adjustment glitches!
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: 600.0,
        height: h,
    }));
    pin_to_topmost(&window);

    if expanded {
        let _ = window.set_ignore_cursor_events(false);
        IS_IGNORING_MOUSE.store(false, Ordering::SeqCst);
    }

    if !expanded {
        // Trim the working set only once, after the island has stayed collapsed
        // for a while. Trimming immediately (or periodically) just moves pages to
        // the pagefile and causes stutter on the next expand.
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(60));
            if EXPAND_SESSION_ID.load(Ordering::SeqCst) == session && !IS_EXPANDED.load(Ordering::SeqCst) {
                trim_memory_internal();
            }
        });
    }

    if expanded {
        let w = window.clone();
        std::thread::spawn(move || {
            // Initial grace period after expansion
            std::thread::sleep(std::time::Duration::from_millis(350));
            let mut outside_streak = 0;

            loop {
                std::thread::sleep(std::time::Duration::from_millis(80));

                if EXPAND_SESSION_ID.load(Ordering::SeqCst) != session {
                    break;
                }

                let pos = match w.outer_position() {
                    Ok(p) => p,
                    Err(_) => break,
                };
                let size = match w.outer_size() {
                    Ok(s) => s,
                    Err(_) => break,
                };

                if let Some((cx, cy)) = get_global_cursor_pos() {
                    let min_x = pos.x - 15;
                    let max_x = pos.x + (size.width as i32) + 15;
                    let min_y = pos.y - 15;
                    let max_y = pos.y + (size.height as i32) + 15;

                    if cx < min_x || cx > max_x || cy < min_y || cy > max_y {
                        outside_streak += 1;
                        if outside_streak >= 2 {
                            let _ = w.emit("native-cursor-left", ());
                            break;
                        }
                    } else {
                        outside_streak = 0;
                    }
                }
            }
        });
    }
}

#[tauri::command]
fn move_window(window: WebviewWindow, delta_x: f64, delta_y: f64) {
    let scale = window.scale_factor().unwrap_or(1.0);
    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
        let new_x = pos.x + (delta_x * scale).round() as i32;
        let new_y = pos.y + (delta_y * scale).round() as i32;

        let (min_x, min_y, max_x, max_y) = get_virtual_desktop_bounds(&window);
        let win_w = size.width as i32;

        // Ensure window stays safely on-screen horizontally and vertically (never above screen top or lost below)
        let safe_x = new_x.clamp(min_x - (win_w - 80), max_x - 80);
        let safe_y = new_y.clamp(min_y, (max_y - 40).max(min_y));

        let _ = window.set_position(Position::Physical(PhysicalPosition { x: safe_x, y: safe_y }));
        let center_x = safe_x + (win_w / 2);
        save_position_with_anchor(safe_x, safe_y, center_x);
    }
}

#[tauri::command]
fn set_window_position(window: WebviewWindow, x: f64, y: f64) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let new_x = x.round() as i32;
    let new_y = y.round() as i32;

    let (min_x, min_y, max_x, max_y) = get_virtual_desktop_bounds(&window);
    let win_w = window.outer_size().map(|s| s.width as i32).unwrap_or((240.0 * scale).round() as i32);

    let safe_x = new_x.clamp(min_x - (win_w - 80), max_x - 80);
    let safe_y = new_y.clamp(min_y, (max_y - 40).max(min_y));

    let _ = window.set_position(Position::Physical(PhysicalPosition { x: safe_x, y: safe_y }));
    let center_x = safe_x + (win_w / 2);
    save_position_with_anchor(safe_x, safe_y, center_x);
    pin_to_topmost(&window);
}

#[tauri::command]
fn get_app_settings() -> serde_json::Value {
    read_app_settings()
}

#[tauri::command]
fn save_app_settings(settings: serde_json::Value) -> bool {
    if !settings.is_object() {
        return false;
    }
    // Preserve backend-owned keys that the frontend does not know about.
    let mut merged = read_app_settings();
    if let (Some(dst), Some(src)) = (merged.as_object_mut(), settings.as_object()) {
        for (k, v) in src {
            dst.insert(k.clone(), v.clone());
        }
    }
    write_app_settings(&merged)
}

fn read_app_settings() -> serde_json::Value {
    let file = get_settings_file();
    if file.exists()
        && let Ok(content) = fs::read_to_string(&file)
            && let Ok(val) = serde_json::from_str::<serde_json::Value>(&content)
                && val.is_object() {
                    return val;
                }
    let backup_file = get_settings_backup_file();
    if backup_file.exists()
        && let Ok(content) = fs::read_to_string(&backup_file)
            && let Ok(val) = serde_json::from_str::<serde_json::Value>(&content)
                && val.is_object() {
                    let _ = fs::copy(&backup_file, &file);
                    return val;
                }
    serde_json::json!({})
}

fn write_app_settings(settings: &serde_json::Value) -> bool {
    let file = get_settings_file();
    let backup_file = get_settings_backup_file();
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        match atomic_write_file(&file, &json) {
            Ok(()) => {
                let _ = fs::copy(&file, &backup_file);
                return true;
            }
            Err(e) => log::warn!("Gagal menyimpan app-settings.json: {}", e),
        }
    }
    false
}

/// Durable copy of the webview's `di_*` localStorage keys (notes, todos, shortcuts…),
/// so user data survives a WebView2 profile reset.
fn get_user_storage_file() -> PathBuf {
    let dir = get_app_data_dir();
    let _ = fs::create_dir_all(&dir);
    dir.join("user-storage.json")
}

#[tauri::command]
fn get_user_storage() -> serde_json::Value {
    let file = get_user_storage_file();
    for candidate in [file.clone(), file.with_extension("json.bak")] {
        if let Ok(content) = fs::read_to_string(&candidate)
            && let Ok(val) = serde_json::from_str::<serde_json::Value>(&content)
                && val.is_object() {
                    return val;
                }
    }
    serde_json::json!({})
}

#[tauri::command]
fn save_user_storage(data: serde_json::Value) -> bool {
    let Some(obj) = data.as_object() else { return false };
    // Only string values under the app's own key prefix.
    let filtered: serde_json::Map<String, serde_json::Value> = obj
        .iter()
        .filter(|(k, v)| k.starts_with("di_") && v.is_string())
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let file = get_user_storage_file();
    match serde_json::to_string(&filtered) {
        Ok(json) if json.len() <= 20 * 1024 * 1024 => match atomic_write_file(&file, &json) {
            Ok(()) => {
                let _ = fs::copy(&file, file.with_extension("json.bak"));
                true
            }
            Err(e) => {
                log::warn!("Gagal menyimpan user-storage.json: {}", e);
                false
            }
        },
        _ => false,
    }
}

#[tauri::command]
fn get_window_position(window: WebviewWindow) -> serde_json::Value {
    if let Ok(pos) = window.outer_position() {
        let is_custom = load_saved_position().is_some();
        serde_json::json!({
            "x": pos.x,
            "y": pos.y,
            "isCustom": is_custom
        })
    } else {
        serde_json::json!(null)
    }
}

#[tauri::command]
fn reset_window_position(window: WebviewWindow) -> serde_json::Value {
    clear_saved_position();
    center_window_top(&window, 6);
    let _ = window.emit("window-position-reset", ());
    if let Ok(pos) = window.outer_position() {
        serde_json::json!({ "x": pos.x, "y": pos.y })
    } else {
        serde_json::json!(null)
    }
}

#[tauri::command]
fn adjust_y_offset(window: WebviewWindow, offset: i32) {
    if load_saved_position().is_none() {
        center_window_top(&window, offset.clamp(0, 100));
    }
}

#[tauri::command]
fn hide_window(window: WebviewWindow) {
    USER_HIDDEN.store(true, Ordering::SeqCst);
    let _ = window.hide();
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Schemes the webview may hand to the OS shell. Anything else (file paths,
/// `file:`, `javascript:`, custom protocol handlers) is rejected.
fn is_allowed_external_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    let ok_scheme = lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("ms-settings:")
        || lower.starts_with("mailto:")
        || lower.starts_with("spotify:");
    ok_scheme && !url.chars().any(|c| c.is_control())
}

#[tauri::command]
fn open_external(url: String) -> bool {
    if !is_allowed_external_url(&url) {
        log::warn!("open_external ditolak: {}", url);
        return false;
    }
    opener::open(url.trim()).is_ok()
}

/// Opens a file, folder or URL through the shell *without* going through cmd.exe,
/// so characters like `&`, `|`, `^` are never interpreted.
#[cfg(windows)]
fn shell_execute(target: &str) -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    unsafe extern "system" {
        fn ShellExecuteW(
            hwnd: *mut std::ffi::c_void,
            op: *const u16,
            file: *const u16,
            params: *const u16,
            dir: *const u16,
            show: i32,
        ) -> usize;
    }
    let wide = |s: &str| -> Vec<u16> { OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect() };
    let file = wide(target);
    let op = wide("open");
    let ret = unsafe { ShellExecuteW(std::ptr::null_mut(), op.as_ptr(), file.as_ptr(), std::ptr::null(), std::ptr::null(), 1) };
    ret > 32
}

#[cfg(not(windows))]
fn shell_execute(target: &str) -> bool {
    opener::open(target).is_ok()
}

#[tauri::command]
fn launch_app(target: String) -> bool {
    let target = target.trim().to_string();
    if target.is_empty() || target.chars().any(|c| c.is_control()) {
        return false;
    }

    match target.as_str() {
        "antigravity" | "antigravity-ide" | "code" | "editor" => return open_project_in_editor(None),
        "calc" => return shell_execute("calc.exe"),
        "notepad" => return shell_execute("notepad.exe"),
        "explorer" => return shell_execute("explorer.exe"),
        "taskmgr" => return shell_execute("taskmgr.exe"),
        _ => {}
    }

    if is_allowed_external_url(&target) {
        return opener::open(&target).is_ok();
    }

    // User-defined shortcut: must be an existing executable / shortcut / folder on disk.
    let path = Path::new(&target);
    if path.is_absolute() && path.exists() {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if path.is_dir() || matches!(ext.as_str(), "exe" | "lnk" | "url" | "appref-ms") {
            return shell_execute(&target);
        }
    }

    // Bare program name registered in "App Paths" (e.g. `chrome`, `winword`).
    // ShellExecute resolves it without a shell, and the charset blocks injection.
    if target.len() <= 64
        && target
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && !target.starts_with('.')
    {
        return shell_execute(&target);
    }

    log::warn!("launch_app ditolak: {}", target);
    false
}

/// Finds a code editor installed for the current user. Order: Antigravity, VS Code, Cursor.
fn find_code_editor() -> Option<PathBuf> {
    let local = std::env::var("LOCALAPPDATA").ok().map(PathBuf::from)?;
    let candidates = [
        local.join("Programs").join("Antigravity IDE").join("Antigravity IDE.exe"),
        local.join("Programs").join("Microsoft VS Code").join("Code.exe"),
        local.join("Programs").join("cursor").join("Cursor.exe"),
    ];
    let mut found = candidates.into_iter().find(|p| p.exists());
    if found.is_none()
        && let Ok(pf) = std::env::var("ProgramFiles") {
            let p = PathBuf::from(pf).join("Microsoft VS Code").join("Code.exe");
            if p.exists() {
                found = Some(p);
            }
        }
    found
}

fn open_project_in_editor(folder_path: Option<String>) -> bool {
    let folder = folder_path.filter(|f| Path::new(f).is_dir());
    match find_code_editor() {
        Some(editor) => {
            let mut cmd = Command::new(editor);
            if let Some(ref f) = folder {
                cmd.arg(f);
            }
            cmd.spawn().is_ok()
        }
        // No editor installed: at least open the folder in Explorer.
        None => folder.map(|f| shell_execute(&f)).unwrap_or(false),
    }
}

#[tauri::command]
fn open_project_in_antigravity(folder_path: Option<String>) -> bool {
    open_project_in_editor(folder_path)
}

#[tauri::command]
fn has_code_editor() -> bool {
    find_code_editor().is_some()
}

/// Lists sub-folders of the parent folders the user configured (no hardcoded paths).
#[tauri::command]
fn scan_projects(roots: Option<Vec<String>>) -> Vec<ProjectInfo> {
    let mut results = Vec::new();
    for root in roots.unwrap_or_default().into_iter().take(10) {
        let p = Path::new(&root);
        if !p.is_dir() {
            continue;
        }
        let category = p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| root.clone());
        let Ok(entries) = fs::read_dir(p) else { continue };
        for entry in entries.flatten().take(500) {
            if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') {
                    results.push(ProjectInfo {
                        name,
                        path: entry.path().to_string_lossy().to_string(),
                        category: category.clone(),
                    });
                }
            }
        }
    }
    results
}

#[tauri::command]
fn select_folder() -> Option<String> {
    let mut dialog = rfd::FileDialog::new().set_title("Pilih Folder Project");
    if let Ok(profile) = std::env::var("USERPROFILE") {
        dialog = dialog.set_directory(profile);
    }
    dialog.pick_folder().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn save_note_file(title: String, content: String, format: String) -> serde_json::Value {
    let ext = if format == "md" { "md" } else { "txt" };
    let sanitized_title = title.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
    let default_name = format!("{}.{}", sanitized_title, ext);

    if let Some(path) = rfd::FileDialog::new()
        .set_title("Export Catatan Meeting")
        .set_file_name(&default_name)
        .add_filter(if ext == "md" { "Markdown" } else { "Text" }, &[ext])
        .save_file()
    {
        if fs::write(&path, content).is_ok() {
            return serde_json::json!({ "success": true, "filePath": path.to_string_lossy().to_string() });
        } else {
            return serde_json::json!({ "success": false, "canceled": false, "error": "Gagal menyimpan berkas ke disk" });
        }
    }
    serde_json::json!({ "success": false, "canceled": true })
}

fn ensure_startup_registration() {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Clean up dead legacy electron keys from Run and StartupApproved
    if let Ok(run_key) = hkcu.open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_ALL_ACCESS) {
        let _ = run_key.delete_value("DynamicIslandWindows");
        let _ = run_key.delete_value("electron.app.Dynamic Island");
    }
    if let Ok(approved_key) = hkcu.open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run", KEY_ALL_ACCESS) {
        let _ = approved_key.delete_value("DynamicIslandWindows");
        let _ = approved_key.delete_value("electron.app.Dynamic Island");
    }

    // Dev builds (`tauri dev`) must never touch the user's startup entry.
    if cfg!(debug_assertions) {
        return;
    }

    // Autostart is ON by default, but only applied once (first run). After that the
    // user's choice (Settings, Task Manager, Windows Settings) is always respected.
    let mut settings = read_app_settings();
    let already_initialized = settings
        .get("autoStartInitialized")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !already_initialized {
        let has_entry = hkcu
            .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .and_then(|k| k.get_value::<String, _>("Hovera"))
            .is_ok();
        // Existing installs already have an entry (and maybe a user-disabled state): leave it.
        if !has_entry {
            set_auto_start(true);
        }
        if let Some(obj) = settings.as_object_mut() {
            obj.insert("autoStartInitialized".into(), serde_json::Value::Bool(true));
        }
        write_app_settings(&settings);
    }

    // Keep the executable path in sync after an update/move.
    if let Ok(run_key) = hkcu.open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_ALL_ACCESS)
        && let (Ok(current_val), Ok(current_exe)) = (run_key.get_value::<String, _>("Hovera"), std::env::current_exe()) {
            let quoted_path = format!("\"{}\"", current_exe.to_string_lossy().trim_matches('"'));
            if current_val != quoted_path {
                let _ = run_key.set_value("Hovera", &quoted_path);
            }
        }
}

#[tauri::command]
fn get_auto_start() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    // 1. Check if "Hovera" exists in Run
    if let Ok(run_key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
        if run_key.get_value::<String, _>("Hovera").is_err() {
            return false;
        }
    } else {
        return false;
    }

    // 2. Check StartupApproved\Run for user's switch status from Windows Settings / Task Manager
    if let Ok(approved_key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run")
        && let Ok(raw_val) = approved_key.get_raw_value("Hovera")
            && let Some(&first_byte) = raw_val.bytes.first() {
                // Odd first byte (0x01, 0x03) means disabled by user in Windows Settings
                // Even first byte (0x02, 0x00) means enabled
                return (first_byte & 1) == 0;
            }

    true
}

#[tauri::command]
fn set_auto_start(enable: bool) -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(current_exe) = std::env::current_exe() else { return false };

    // 1. Ensure "Hovera" is registered in Run with correct quoted path
    if let Ok((run_key, _)) = hkcu.create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
        let quoted_path = format!("\"{}\"", current_exe.to_string_lossy().trim_matches('"'));
        let _ = run_key.set_value("Hovera", &quoted_path);
        // Clean up legacy keys
        let _ = run_key.delete_value("DynamicIslandWindows");
        let _ = run_key.delete_value("electron.app.Dynamic Island");
    }

    // 2. Update StartupApproved\Run so Windows Settings & Task Manager show the exact toggle state
    if let Ok((approved_key, _)) = hkcu.create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run") {
        let mut bytes = vec![0u8; 12];
        bytes[0] = if enable { 0x02 } else { 0x03 };
        let reg_val = RegValue {
            vtype: RegType::REG_BINARY,
            bytes: bytes.into(),
        };
        let _ = approved_key.set_raw_value("Hovera", &reg_val);
        // Clean up legacy approved keys
        let _ = approved_key.delete_value("DynamicIslandWindows");
        let _ = approved_key.delete_value("electron.app.Dynamic Island");
    }

    enable
}

#[tauri::command]
fn open_startup_settings() {
    let _ = Command::new("cmd")
        .args(["/c", "start", "ms-settings:startupapps"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn();
}

#[tauri::command]
fn check_office_installed() -> serde_json::Value {
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
    let word = hkcr.open_subkey("Word.Application").is_ok();
    let excel = hkcr.open_subkey("Excel.Application").is_ok();
    let ppt = hkcr.open_subkey("PowerPoint.Application").is_ok();
    serde_json::json!({
        "word": word,
        "excel": excel,
        "powerpoint": ppt,
        "available": word || excel || ppt
    })
}

// ---------------------------------------------------------------------------
// File access: the webview may only read / process files the user explicitly
// picked in a native dialog during this session, or files Hovera produced.
// ---------------------------------------------------------------------------
static ALLOWED_PATHS: std::sync::Mutex<Option<std::collections::HashSet<PathBuf>>> = std::sync::Mutex::new(None);

fn normalize_path(p: &Path) -> PathBuf {
    fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

fn allow_path(p: &Path) {
    let mut guard = ALLOWED_PATHS.lock().unwrap_or_else(|e| e.into_inner());
    guard.get_or_insert_with(Default::default).insert(normalize_path(p));
}

fn is_path_allowed(p: &Path) -> bool {
    let guard = ALLOWED_PATHS.lock().unwrap_or_else(|e| e.into_inner());
    guard.as_ref().is_some_and(|set| set.contains(&normalize_path(p)))
}

fn require_allowed_file(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.is_file() {
        return Err("Berkas tidak ditemukan".to_string());
    }
    if !is_path_allowed(&p) {
        log::warn!("Akses berkas ditolak (bukan pilihan user): {}", path);
        return Err("Akses ke berkas ini tidak diizinkan. Pilih ulang berkas lewat dialog.".to_string());
    }
    Ok(p)
}

const EXECUTABLE_EXTENSIONS: &[&str] = &[
    "exe", "com", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi", "msp",
    "scr", "lnk", "hta", "cpl", "reg", "pif", "msc", "jar", "appref-ms", "url", "scf", "inf",
];

fn is_executable_path(p: &Path) -> bool {
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    EXECUTABLE_EXTENSIONS.contains(&ext.as_str())
}

/// Keeps only characters that are safe inside a file name part (stem / suffix / extension).
fn sanitize_name_part(s: &str, max_len: usize) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | ' '))
        .take(max_len)
        .collect()
}

async fn run_blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("Tugas latar belakang gagal: {}", e))?
}

#[tauri::command]
fn pick_files_dialog(filter_type: String) -> Vec<serde_json::Value> {
    let mut dialog = rfd::FileDialog::new().set_title("Pilih Berkas");
    if filter_type == "images" {
        dialog = dialog.add_filter("Gambar (PNG, JPG, WebP, SVG, BMP)", &["png", "jpg", "jpeg", "webp", "svg", "bmp"]);
    } else if filter_type == "docs" {
        dialog = dialog.add_filter("Dokumen (Word, Excel, PowerPoint, Text, MD)", &["docx", "doc", "xlsx", "xls", "pptx", "ppt", "txt", "md"]);
    } else {
        dialog = dialog.add_filter("Semua Berkas Terkait", &["png", "jpg", "jpeg", "webp", "svg", "bmp", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "txt", "md", "pdf"]);
    }

    let mut results = Vec::new();
    if let Some(paths) = dialog.pick_files() {
        for p in paths {
            allow_path(&p);
            let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_string().to_lowercase();
            let size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            results.push(serde_json::json!({
                "path": p.to_string_lossy().to_string(),
                "name": name,
                "extension": ext,
                "size": size
            }));
        }
    }
    results
}

const MAX_BASE64_FILE_BYTES: u64 = 200 * 1024 * 1024;

#[tauri::command]
async fn read_file_as_base64(path: String) -> Result<String, String> {
    run_blocking(move || {
        let p = require_allowed_file(&path)?;
        let size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
        if size > MAX_BASE64_FILE_BYTES {
            return Err("Berkas terlalu besar (maks. 200 MB)".to_string());
        }
        let bytes = fs::read(&p).map_err(|e| e.to_string())?;
        Ok(general_purpose::STANDARD.encode(bytes))
    })
    .await
}

fn default_output_dir() -> PathBuf {
    std::env::var("USERPROFILE")
        .map(|p| PathBuf::from(p).join("Pictures"))
        .unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
async fn save_file_in_same_folder(
    source_path: String,
    suffix: Option<String>,
    target_ext: Option<String>,
    base64_data: String,
) -> Result<serde_json::Value, String> {
    run_blocking(move || {
        let p = PathBuf::from(&source_path);
        // Only write next to the source when the user picked that source file;
        // otherwise fall back to the Pictures folder.
        let parent_dir = match p.parent() {
            Some(parent) if p.is_absolute() && p.is_file() && is_path_allowed(&p) => parent.to_path_buf(),
            _ => default_output_dir(),
        };
        let _ = fs::create_dir_all(&parent_dir);

        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let stem = sanitize_name_part(stem, 120);
        let stem = if stem.trim().is_empty() { "file".to_string() } else { stem };
        let ext = target_ext
            .map(|e| sanitize_name_part(&e, 10))
            .filter(|e| !e.is_empty())
            .unwrap_or_else(|| sanitize_name_part(p.extension().and_then(|e| e.to_str()).unwrap_or("bin"), 10));
        let ext = if ext.is_empty() { "bin".to_string() } else { ext.to_ascii_lowercase() };
        if EXECUTABLE_EXTENSIONS.contains(&ext.as_str()) {
            return Err("Ekstensi berkas keluaran tidak diizinkan".to_string());
        }
        let sfx = suffix
            .map(|s| sanitize_name_part(&s, 40))
            .unwrap_or_else(|| "_compressed".to_string());

        let filename = format!("{}{}.{}", stem, sfx, ext);
        let target_file_path = parent_dir.join(&filename);

        let raw_b64 = match base64_data.find(";base64,") {
            Some(idx) => &base64_data[idx + 8..],
            None => &base64_data,
        };
        let bytes = general_purpose::STANDARD
            .decode(raw_b64)
            .map_err(|e| format!("Base64 decode error: {}", e))?;

        fs::write(&target_file_path, bytes).map_err(|e| format!("Gagal menulis berkas: {}", e))?;
        allow_path(&target_file_path);

        Ok(serde_json::json!({
            "success": true,
            "filePath": target_file_path.to_string_lossy().to_string(),
            "fileName": filename,
            "folderPath": parent_dir.to_string_lossy().to_string()
        }))
    })
    .await
}

fn office_script(app: &str, input: &str, output: &str) -> String {
    let input = input.replace('\'', "''");
    let output = output.replace('\'', "''");
    // AutomationSecurity = 3 (msoAutomationSecurityForceDisable): never run macros
    // from documents opened through automation.
    match app {
        "word" => format!(
            r#"
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
try {{
    $doc = $word.Documents.Open('{input}', $false, $true, $false)
    $doc.SaveAs2('{output}', 17)
    $doc.Close($false)
}} finally {{
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}}
"#
        ),
        "excel" => format!(
            r#"
$ErrorActionPreference = 'Stop'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AutomationSecurity = 3
try {{
    $wb = $excel.Workbooks.Open('{input}', 0, $true)
    $wb.ExportAsFixedFormat(0, '{output}')
    $wb.Close($false)
}} finally {{
    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}}
"#
        ),
        _ => format!(
            r#"
$ErrorActionPreference = 'Stop'
$ppt = New-Object -ComObject PowerPoint.Application
$ppt.AutomationSecurity = 3
try {{
    $pres = $ppt.Presentations.Open('{input}', -1, 0, 0)
    $pres.SaveAs('{output}', 32)
    $pres.Close()
}} finally {{
    $ppt.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}}
"#
        ),
    }
}

/// Runs a command, killing it if it exceeds `timeout`. Returns (success, stdout, stderr).
fn run_with_timeout(mut cmd: Command, timeout: std::time::Duration) -> Result<(bool, String, String), String> {
    use std::io::Read;
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Gagal menjalankan proses: {}", e))?;

    // Drain pipes on helper threads so a chatty child can never dead-lock on a full pipe.
    let mut out_pipe = child.stdout.take();
    let mut err_pipe = child.stderr.take();
    let out_t = std::thread::spawn(move || {
        let mut s = Vec::new();
        if let Some(ref mut p) = out_pipe {
            let _ = p.read_to_end(&mut s);
        }
        String::from_utf8_lossy(&s).to_string()
    });
    let err_t = std::thread::spawn(move || {
        let mut s = Vec::new();
        if let Some(ref mut p) = err_pipe {
            let _ = p.read_to_end(&mut s);
        }
        String::from_utf8_lossy(&s).to_string()
    });

    let start = std::time::Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() > timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Proses melebihi batas waktu dan dihentikan".to_string());
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(150)),
            Err(e) => return Err(e.to_string()),
        }
    };
    let stdout = out_t.join().unwrap_or_default();
    let stderr = err_t.join().unwrap_or_default();
    Ok((status.success(), stdout, stderr))
}

#[tauri::command]
async fn convert_office_to_pdf(input_path: String) -> Result<serde_json::Value, String> {
    run_blocking(move || {
        let p = require_allowed_file(&input_path)?;
        let parent_dir = p.parent().unwrap_or(Path::new(".")).to_path_buf();
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("document").to_string();
        let target_pdf_path = parent_dir.join(format!("{}.pdf", stem));
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

        let app = match ext.as_str() {
            "docx" | "doc" => "word",
            "xlsx" | "xls" => "excel",
            "pptx" | "ppt" => "powerpoint",
            _ => return Err(format!("Format .{} belum didukung untuk Office COM", ext)),
        };
        let script = office_script(app, &p.to_string_lossy(), &target_pdf_path.to_string_lossy());

        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(0x08000000);
        let (ok, _stdout, stderr) = run_with_timeout(cmd, std::time::Duration::from_secs(180))?;
        if !ok {
            return Err(format!("Konversi gagal: {}", stderr.trim()));
        }
        if !target_pdf_path.exists() {
            return Err("Berkas PDF hasil tidak ditemukan setelah konversi".to_string());
        }
        allow_path(&target_pdf_path);

        Ok(serde_json::json!({
            "success": true,
            "filePath": target_pdf_path.to_string_lossy().to_string(),
            "fileName": format!("{}.pdf", stem),
            "folderPath": parent_dir.to_string_lossy().to_string()
        }))
    })
    .await
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("Berkas tidak ditemukan".to_string());
    }
    let mut cmd = Command::new("explorer.exe");
    if p.is_file() {
        cmd.raw_arg(format!("/select,\"{}\"", p.to_string_lossy().replace('"', "")));
    } else {
        cmd.arg(p.as_os_str());
    }
    cmd.creation_flags(0x08000000).spawn().map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn open_file(path: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("Berkas tidak ditemukan".to_string());
    }
    if p.is_dir() {
        return Ok(shell_execute(&path));
    }
    // Never launch executables/scripts from the webview, even ones we produced.
    if is_executable_path(&p) {
        log::warn!("open_file menolak berkas eksekusi: {}", path);
        return Err("Jenis berkas ini tidak boleh dibuka dari Hovera".to_string());
    }
    if shell_execute(&path) {
        Ok(true)
    } else {
        Err("Gagal membuka berkas".to_string())
    }
}

#[tauri::command]
async fn compress_pdf_file(input_path: String) -> Result<serde_json::Value, String> {
    run_blocking(move || {
        let p = require_allowed_file(&input_path)?;
        let original_size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
        let parent = p.parent().unwrap_or(Path::new(".")).to_path_buf();
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
        let out_name = format!("{}_compressed.pdf", stem);
        let out_path = parent.join(&out_name);

        let load_res = std::panic::catch_unwind(|| lopdf::Document::load(&p));
        let mut doc = match load_res {
            Ok(Ok(d)) => d,
            Ok(Err(e)) => return Err(format!("Gagal membaca berkas PDF: {}", e)),
            Err(_) => return Err("Berkas PDF rusak atau tidak dapat diproses".to_string()),
        };

        let process_res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            doc.prune_objects();
            doc.compress();
        }));
        if process_res.is_err() {
            return Err("Terjadi kesalahan saat mengompres struktur PDF".to_string());
        }

        doc.save(&out_path).map_err(|e| format!("Gagal menyimpan PDF terkompresi: {}", e))?;
        allow_path(&out_path);
        let compressed_size = fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0);
        let savings_percent = if original_size > 0 && compressed_size < original_size {
            ((original_size - compressed_size) as f64 / original_size as f64 * 100.0).round() as i64
        } else {
            0
        };

        Ok(serde_json::json!({
            "success": true,
            "filePath": out_path.to_string_lossy().to_string(),
            "fileName": out_name,
            "folderPath": parent.to_string_lossy().to_string(),
            "originalSize": original_size,
            "compressedSize": compressed_size,
            "savingsPercent": savings_percent
        }))
    })
    .await
}

#[tauri::command]
fn get_media_state() -> MediaState {
    media_bridge::get_current_media_state()
}

#[tauri::command]
fn media_toggle_play() -> bool {
    media_bridge::toggle_play()
}

#[tauri::command]
fn media_next() -> bool {
    media_bridge::skip_next()
}

#[tauri::command]
fn media_prev() -> bool {
    media_bridge::skip_prev()
}

// ---------------------------------------------------------------------------
// Network downloads. Every URL coming from the webview is validated, and passed
// to curl via `--url` / to yt-dlp after `--`, so it can never be parsed as an option.
// ---------------------------------------------------------------------------
const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

fn validate_download_url(url: &str) -> Result<String, String> {
    let url = url.trim();
    let lower = url.to_ascii_lowercase();
    let rest = if let Some(r) = lower.strip_prefix("https://") {
        r
    } else if let Some(r) = lower.strip_prefix("http://") {
        r
    } else {
        return Err("Hanya tautan http/https yang didukung".to_string());
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty()
        || url.len() > 4096
        || url.chars().any(|c| c.is_control() || c.is_whitespace())
    {
        return Err("Tautan tidak valid".to_string());
    }
    Ok(url.to_string())
}

fn downloads_dir() -> PathBuf {
    let dir = std::env::var("USERPROFILE")
        .map(|p| PathBuf::from(p).join("Downloads"))
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = fs::create_dir_all(&dir);
    dir
}

fn sanitize_file_name(name: &str, fallback: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .take(180)
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').to_string();
    if cleaned.is_empty() {
        return fallback.to_string();
    }
    // Downloaded media must never become something Windows would execute.
    if is_executable_path(Path::new(&cleaned)) {
        return format!("{}.download", cleaned);
    }
    cleaned
}

/// `name.ext` → `name (1).ext` … if the file already exists (never overwrite user files).
fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let p = Path::new(file_name);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = p.extension().and_then(|s| s.to_str());
    for i in 1..1000 {
        let name = match ext {
            Some(e) => format!("{} ({}).{}", stem, i, e),
            None => format!("{} ({})", stem, i),
        };
        let c = dir.join(name);
        if !c.exists() {
            return c;
        }
    }
    candidate
}

fn referer_for(url: &str) -> Option<&'static str> {
    if url.contains("tiktok.com") || url.contains("tikwm.com") {
        Some("https://www.tiktok.com/")
    } else if url.contains("instagram.com") || url.contains("fbcdn.net") || url.contains("cdninstagram.com") {
        Some("https://www.instagram.com/")
    } else {
        None
    }
}

fn curl_download(url: &str, target: &Path) -> Result<(), String> {
    let mut cmd = Command::new("curl.exe");
    cmd.args([
        "--location",
        "--fail",
        "--silent",
        "--show-error",
        "--proto", "=https,http",
        "--proto-redir", "=https,http",
        "--max-time", "900",
        "--user-agent", BROWSER_UA,
    ]);
    if let Some(r) = referer_for(url) {
        cmd.args(["--referer", r]);
    }
    cmd.arg("--output").arg(target).arg("--url").arg(url);
    cmd.creation_flags(0x08000000);

    let (ok, _out, err) = run_with_timeout(cmd, std::time::Duration::from_secs(960))?;
    if !ok {
        let _ = fs::remove_file(target);
        return Err(format!("Unduhan gagal: {}", err.trim()));
    }
    Ok(())
}

/// Rejects empty / HTML error pages and converts WebP to JPEG so Windows Photos opens it.
/// Returns the final path.
fn finalize_downloaded_file(path: &Path) -> Result<PathBuf, String> {
    use std::io::Read;
    let meta = fs::metadata(path).map_err(|_| "Berkas unduhan tidak ditemukan".to_string())?;
    if meta.len() < 100 {
        let _ = fs::remove_file(path);
        return Err("Berkas yang diunduh kosong atau tidak valid".to_string());
    }
    let mut buf = [0u8; 32];
    let n = fs::File::open(path)
        .and_then(|mut f| f.read(&mut buf))
        .map_err(|e| e.to_string())?;
    let head = String::from_utf8_lossy(&buf[..n]).to_lowercase();
    if head.contains("<!doct") || head.contains("<html") || head.contains("<?xml") || head.contains("cf-mitigated") {
        let _ = fs::remove_file(path);
        return Err("Server memblokir unduhan langsung (halaman web terdeteksi)".to_string());
    }

    if n >= 12 && &buf[0..4] == b"RIFF" && &buf[8..12] == b"WEBP"
        && let Ok(dyn_img) = image::open(path) {
            let dir = path.parent().unwrap_or(Path::new("."));
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("foto");
            let new_path = unique_path(dir, &format!("{}.jpg", stem));
            if dyn_img.to_rgb8().save_with_format(&new_path, image::ImageFormat::Jpeg).is_ok() {
                let _ = fs::remove_file(path);
                return Ok(new_path);
            }
        }
    Ok(path.to_path_buf())
}

#[tauri::command]
async fn download_media_url(url: String, filename: String) -> Result<serde_json::Value, String> {
    run_blocking(move || {
        let url = validate_download_url(&url)?;
        let dir = downloads_dir();
        let safe_name = sanitize_file_name(&filename, "media_download.mp4");
        let target = unique_path(&dir, &safe_name);

        curl_download(&url, &target)?;
        let final_path = finalize_downloaded_file(&target)?;
        allow_path(&final_path);

        Ok(serde_json::json!({
            "success": true,
            "filePath": final_path.to_string_lossy().to_string(),
            "fileName": final_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
            "folderPath": dir.to_string_lossy().to_string()
        }))
    })
    .await
}

#[tauri::command]
async fn fetch_url_text(url: String) -> Result<String, String> {
    run_blocking(move || {
        let url = validate_download_url(&url)?;
        if !url.to_ascii_lowercase().starts_with("https://") {
            return Err("Hanya tautan https yang didukung".to_string());
        }
        let mut cmd = Command::new("curl.exe");
        cmd.args([
            "--silent",
            "--location",
            "--proto", "=https",
            "--proto-redir", "=https",
            "--max-time", "12",
            "--max-filesize", "10485760",
            "--user-agent", BROWSER_UA,
            "--url",
        ])
        .arg(&url)
        .creation_flags(0x08000000);
        let (ok, stdout, _err) = run_with_timeout(cmd, std::time::Duration::from_secs(20))?;
        if !ok {
            return Err("Koneksi gagal".to_string());
        }
        Ok(stdout)
    })
    .await
}

#[derive(serde::Deserialize)]
struct BatchMediaItem {
    url: String,
    filename: String,
}

#[tauri::command]
async fn download_batch_media(items: Vec<BatchMediaItem>, folder_name: String) -> Result<serde_json::Value, String> {
    run_blocking(move || {
        if items.len() > 100 {
            return Err("Terlalu banyak berkas dalam satu unduhan (maks. 100)".to_string());
        }
        let safe_folder = sanitize_name_part(&folder_name, 80);
        let safe_folder = if safe_folder.trim().is_empty() { "Hovera_Downloads".to_string() } else { safe_folder.trim().to_string() };
        let target_dir = downloads_dir().join(&safe_folder);
        let _ = fs::create_dir_all(&target_dir);

        let mut saved_files: Vec<String> = Vec::new();
        for item in items {
            let Ok(url) = validate_download_url(&item.url) else { continue };
            let safe_name = sanitize_file_name(&item.filename, "unduhan_media.jpg");
            let file_path = unique_path(&target_dir, &safe_name);
            if curl_download(&url, &file_path).is_err() {
                continue;
            }
            if let Ok(final_path) = finalize_downloaded_file(&file_path) {
                allow_path(&final_path);
                if let Some(name) = final_path.file_name() {
                    saved_files.push(name.to_string_lossy().to_string());
                }
            }
        }

        if saved_files.is_empty() {
            return Err("Tidak ada berkas yang berhasil diunduh".to_string());
        }
        let first_file_path = target_dir.join(&saved_files[0]).to_string_lossy().to_string();

        Ok(serde_json::json!({
            "success": true,
            "folderPath": target_dir.to_string_lossy().to_string(),
            "totalCount": saved_files.len(),
            "files": saved_files,
            "filePath": first_file_path
        }))
    })
    .await
}

const YTDLP_BASE_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
const YTDLP_MAX_AGE: std::time::Duration = std::time::Duration::from_secs(14 * 24 * 3600);

fn sha256_hex(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut f = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect())
}

/// Downloads yt-dlp.exe + SHA2-256SUMS from the official release, verifies the
/// checksum and only then atomically replaces the local binary.
fn download_verified_ytdlp(target: &Path) -> Result<(), String> {
    let dir = target.parent().ok_or("Path yt-dlp tidak valid")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp_exe = dir.join("yt-dlp.exe.part");
    let tmp_sums = dir.join("SHA2-256SUMS.part");

    let result = (|| {
        curl_download(&format!("{}/yt-dlp.exe", YTDLP_BASE_URL), &tmp_exe)?;
        curl_download(&format!("{}/SHA2-256SUMS", YTDLP_BASE_URL), &tmp_sums)?;
        let sums = fs::read_to_string(&tmp_sums).map_err(|e| e.to_string())?;
        let expected = sums
            .lines()
            .find_map(|line| {
                let mut parts = line.split_whitespace();
                let hash = parts.next()?;
                let name = parts.next()?.trim_start_matches('*');
                (name == "yt-dlp.exe").then(|| hash.to_ascii_lowercase())
            })
            .ok_or("Checksum yt-dlp.exe tidak ditemukan")?;
        let actual = sha256_hex(&tmp_exe)?;
        if actual != expected {
            return Err("Checksum yt-dlp tidak cocok; unduhan dibatalkan".to_string());
        }
        let _ = fs::remove_file(target);
        fs::rename(&tmp_exe, target).map_err(|e| e.to_string())
    })();

    let _ = fs::remove_file(&tmp_exe);
    let _ = fs::remove_file(&tmp_sums);
    result
}

fn ensure_ytdlp() -> Result<PathBuf, String> {
    let bin = get_app_data_dir().join("bin").join("yt-dlp.exe");
    let is_stale = fs::metadata(&bin)
        .and_then(|m| m.modified())
        .map(|t| t.elapsed().unwrap_or_default() > YTDLP_MAX_AGE)
        .unwrap_or(true);

    if !bin.exists() || is_stale {
        match download_verified_ytdlp(&bin) {
            Ok(()) => log::info!("yt-dlp diperbarui"),
            // An old but verified binary is better than nothing.
            Err(e) if bin.exists() => log::warn!("Gagal memperbarui yt-dlp, memakai versi lama: {}", e),
            Err(e) => return Err(format!("Gagal menyiapkan yt-dlp: {}", e)),
        }
    }
    Ok(bin)
}

fn has_node_runtime() -> bool {
    Command::new("node")
        .arg("--version")
        .creation_flags(0x08000000)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[tauri::command]
async fn download_via_ytdlp(url: String, format_type: String) -> Result<serde_json::Value, String> {
    run_blocking(move || {
        let url = validate_download_url(&url)?;
        let dir = downloads_dir();
        let ytdlp_path = ensure_ytdlp()?;
        let output_template = dir.join("%(title).150B.%(ext)s");

        let mut cmd = Command::new(&ytdlp_path);
        cmd.creation_flags(0x08000000);
        cmd.args(["--ignore-config", "--no-playlist", "--no-warnings", "--no-overwrites", "--windows-filenames"]);
        if has_node_runtime() {
            cmd.args(["--js-runtimes", "node"]);
        }
        cmd.args(["--print", "after_move:filepath"]);
        cmd.arg("-o").arg(&output_template);
        if format_type == "audio" {
            cmd.args(["-f", "ba[ext=m4a]/ba/bestaudio/audio/b"]);
        } else {
            cmd.args(["-f", "b[ext=mp4]/b/18/best[ext=mp4]/best"]);
        }
        // `--` guarantees the URL is never interpreted as an option (e.g. `--exec`).
        cmd.arg("--").arg(&url);

        let (ok, stdout, stderr) = run_with_timeout(cmd, std::time::Duration::from_secs(1800))?;
        if !ok {
            return Err(format!("Unduhan gagal: {}", stderr.trim()));
        }

        let mut downloaded = stdout
            .lines()
            .map(str::trim)
            .rfind(|l| !l.is_empty() && Path::new(l).is_file())
            .map(PathBuf::from)
            .ok_or("Unduhan selesai namun berkas tidak ditemukan. Pastikan tautan masih aktif.")?;

        // TikTok audio often comes in an .mp4 container: rename to .m4a for media players.
        if format_type == "audio"
            && downloaded.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("mp4"))
        {
            let m4a = downloaded.with_extension("m4a");
            if !m4a.exists() && fs::rename(&downloaded, &m4a).is_ok() {
                downloaded = m4a;
            }
        }
        allow_path(&downloaded);

        Ok(serde_json::json!({
            "success": true,
            "folderPath": dir.to_string_lossy().to_string(),
            "fileName": downloaded.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "Berkas Tersimpan".into()),
            "filePath": downloaded.to_string_lossy().to_string()
        }))
    })
    .await
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub has_update: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
}

#[tauri::command]
async fn hovera_check_updates(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return Err(format!("Updater error: {}", e)),
    };

    match updater.check().await {
        Ok(Some(update)) => {
            log::info!("Update available: {}", update.version);
            Ok(UpdateInfo {
                has_update: true,
                version: Some(update.version),
                notes: update.body,
                pub_date: update.date.and_then(|d| d.format(&time::format_description::well_known::Rfc3339).ok()),
            })
        }
        Ok(None) => {
            log::info!("No updates available");
            Ok(UpdateInfo {
                has_update: false,
                version: None,
                notes: None,
                pub_date: None,
            })
        }
        Err(e) => {
            log::error!("Failed to check for updates: {}", e);
            Err(format!("Gagal memeriksa pembaruan: {}", e))
        }
    }
}

static IS_UPDATING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
async fn hovera_install_update(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    if IS_UPDATING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Err("Pembaruan sedang diunduh atau dipasang. Harap tunggu...".to_string());
    }

    struct UpdateGuard;
    impl Drop for UpdateGuard {
        fn drop(&mut self) {
            IS_UPDATING.store(false, Ordering::SeqCst);
        }
    }
    let _guard = UpdateGuard;

    let updater = app.updater().map_err(|e| format!("Updater initialization failed: {}", e))?;
    let update = updater.check().await.map_err(|e| format!("Update check failed: {}", e))?;

    if let Some(update) = update {
        let app_handle = app.clone();
        let mut downloaded: usize = 0;

        update
            .download_and_install(
                move |chunk_length, content_length| {
                    downloaded += chunk_length;
                    let total = content_length.unwrap_or(0) as usize;
                    let percent = if total > 0 {
                        (((downloaded as f64 / total as f64) * 100.0).round() as u32).min(100)
                    } else {
                        0
                    };
                    let _ = app_handle.emit(
                        "update-download-progress",
                        serde_json::json!({
                            "downloaded": downloaded,
                            "total": total,
                            "percent": percent
                        }),
                    );
                },
                || {
                    log::info!("Update download completed, applying installer...");
                },
            )
            .await
            .map_err(|e| format!("Gagal mengunduh atau memasang update: {}", e))?;

        Ok(serde_json::json!({
            "success": true,
            "message": "Pembaruan berhasil dipasang"
        }))
    } else {
        Err("Tidak ada pembaruan yang siap dipasang".to_string())
    }
}

// ---------------------------------------------------------------------------
// Window geometry cache (updated from window events) so the hit-test loop does
// not round-trip to the main thread 33x per second.
// ---------------------------------------------------------------------------
static WIN_X: AtomicI32 = AtomicI32::new(0);
static WIN_Y: AtomicI32 = AtomicI32::new(0);
static WIN_W: AtomicI32 = AtomicI32::new(600);
static WIN_SCALE_BITS: AtomicU64 = AtomicU64::new(0x3FF0_0000_0000_0000); // 1.0f64
/// Window hidden explicitly by the user (tray / hide command).
static USER_HIDDEN: AtomicBool = AtomicBool::new(false);

fn init_window_geometry_cache(window: &WebviewWindow) {
    if let Ok(p) = window.outer_position() {
        WIN_X.store(p.x, Ordering::Relaxed);
        WIN_Y.store(p.y, Ordering::Relaxed);
    }
    if let Ok(s) = window.outer_size() {
        WIN_W.store(s.width as i32, Ordering::Relaxed);
    }
    if let Ok(scale) = window.scale_factor() {
        WIN_SCALE_BITS.store(scale.to_bits(), Ordering::Relaxed);
    }
}

fn is_window_hidden() -> bool {
    USER_HIDDEN.load(Ordering::Relaxed)
}

fn toggle_window_visibility(w: &WebviewWindow) {
    if w.is_visible().unwrap_or(false) {
        USER_HIDDEN.store(true, Ordering::SeqCst);
        let _ = w.hide();
    } else {
        USER_HIDDEN.store(false, Ordering::SeqCst);
        let _ = w.show();
        pin_to_topmost(w);
    }
}

fn spawn_hit_test_manager(w_hit: WebviewWindow) {
    // Allows click-through on the transparent wings outside the capsule while
    // keeping the 600px canvas fixed for Framer Motion.
    std::thread::spawn(move || loop {
        if is_window_hidden() {
            std::thread::sleep(std::time::Duration::from_millis(250));
            continue;
        }
        if IS_EXPANDED.load(Ordering::Relaxed) {
            if IS_IGNORING_MOUSE.load(Ordering::Relaxed) {
                let _ = w_hit.set_ignore_cursor_events(false);
                IS_IGNORING_MOUSE.store(false, Ordering::Relaxed);
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
            continue;
        }

        let scale = f64::from_bits(WIN_SCALE_BITS.load(Ordering::Relaxed));
        let pos_x = WIN_X.load(Ordering::Relaxed);
        let pos_y = WIN_Y.load(Ordering::Relaxed);
        let win_w = WIN_W.load(Ordering::Relaxed);

        let compact_w = (COMPACT_WIDTH.load(Ordering::Relaxed) as f64 * scale).round() as i32;
        let compact_h = (COMPACT_HEIGHT.load(Ordering::Relaxed) as f64 * scale).round() as i32;
        let capsule_left = pos_x + (win_w - compact_w) / 2;
        let hit_margin = (10.0 * scale).round() as i32;
        let min_x = capsule_left - hit_margin;
        let max_x = capsule_left + compact_w + hit_margin;
        let min_y = pos_y - hit_margin;
        let max_y = pos_y + compact_h + hit_margin;

        let mut sleep_ms = 30;
        if let Some((cx, cy)) = get_global_cursor_pos() {
            let inside_capsule = cx >= min_x && cx <= max_x && cy >= min_y && cy <= max_y;
            let currently_ignored = IS_IGNORING_MOUSE.load(Ordering::Relaxed);

            if inside_capsule && currently_ignored {
                let _ = w_hit.set_ignore_cursor_events(false);
                IS_IGNORING_MOUSE.store(false, Ordering::Relaxed);
            } else if !inside_capsule && !currently_ignored {
                let _ = w_hit.set_ignore_cursor_events(true);
                IS_IGNORING_MOUSE.store(true, Ordering::Relaxed);
            }

            // Cursor far away from the island: poll less often.
            let far = (200.0 * scale) as i32;
            if cx < min_x - far || cx > max_x + far || cy > max_y + far {
                sleep_ms = 120;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
    });
}

fn build_tray(app: &mut tauri::App) {
    let (Ok(toggle_item), Ok(reset_item), Ok(quit_item)) = (
        MenuItemBuilder::with_id("toggle", "Tampilkan / Sembunyikan Hovera").build(app),
        MenuItemBuilder::with_id("reset", "Reset Posisi ke Atas Tengah").build(app),
        MenuItemBuilder::with_id("quit", "Keluar (Quit)").build(app),
    ) else {
        return;
    };
    let Ok(tray_menu) = MenuBuilder::new(app)
        .item(&toggle_item)
        .item(&reset_item)
        .separator()
        .item(&quit_item)
        .build()
    else {
        return;
    };
    let Some(icon) = app
        .default_window_icon()
        .cloned()
        .or_else(|| tauri::image::Image::from_app_icon_resource(32).ok())
    else {
        return;
    };

    let _ = TrayIconBuilder::new()
        .tooltip("Hovera")
        .icon(icon)
        .menu(&tray_menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => {
                if let Some(w) = app.get_webview_window("main") {
                    toggle_window_visibility(&w);
                }
            }
            "reset" => {
                if let Some(w) = app.get_webview_window("main") {
                    clear_saved_position();
                    center_window_top(&w, 6);
                    let _ = w.emit("window-position-reset", ());
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
                && let Some(w) = tray.app_handle().get_webview_window("main") {
                    toggle_window_visibility(&w);
                }
        })
        .build(app);
}

/// True while a fullscreen game / video / presentation is in the foreground.
#[cfg(windows)]
fn is_fullscreen_app_active() -> bool {
    unsafe extern "system" {
        fn SHQueryUserNotificationState(state: *mut i32) -> i32;
    }
    let mut state: i32 = 0;
    let hr = unsafe { SHQueryUserNotificationState(&mut state) };
    // QUNS_BUSY = 2, QUNS_RUNNING_D3D_FULL_SCREEN = 3, QUNS_PRESENTATION_MODE = 4
    hr == 0 && matches!(state, 2..=4)
}

#[cfg(not(windows))]
fn is_fullscreen_app_active() -> bool {
    false
}

fn spawn_topmost_guard(win_bg: WebviewWindow) {
    std::thread::spawn(move || {
        let mut ticks: u32 = 0;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            ticks = ticks.wrapping_add(1);

            if is_window_hidden() || !win_bg.is_visible().unwrap_or(false) {
                continue;
            }
            // The island stays visible over fullscreen apps: while one is in the
            // foreground re-assert topmost every tick so the fullscreen window
            // cannot cover it; otherwise every ~20s. Never re-shows a hidden window.
            if is_fullscreen_app_active() || ticks.is_multiple_of(10) {
                pin_to_topmost(&win_bg);
            }
        }
    });
}

fn now_secs_and_millis() -> (i64, u128) {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    (d.as_secs() as i64, d.as_millis() % 10000)
}

fn record_clipboard_image(cb: &mut arboard::Clipboard) -> Option<Vec<ClipboardItem>> {
    let img = cb.get_image().ok()?;
    if img.width == 0 || img.height == 0 || img.bytes.is_empty() {
        return None;
    }
    let w = img.width as u32;
    let h = img.height as u32;
    let rgba = image::RgbaImage::from_raw(w, h, img.bytes.into_owned())?;
    let dyn_img = image::DynamicImage::ImageRgba8(rgba);

    let (timestamp, millis) = now_secs_and_millis();
    let id = format!("clip_img_{}_{}", timestamp, millis);
    let img_path = get_clipboard_images_dir().join(format!("{}.png", id));

    if let Err(e) = dyn_img.save_with_format(&img_path, image::ImageFormat::Png) {
        log::warn!("Gagal menyimpan gambar clipboard: {}", e);
        return None;
    }
    let file_size = fs::metadata(&img_path).map(|m| m.len() as usize).unwrap_or(0);

    let thumb = dyn_img.thumbnail(360, 240);
    let mut thumb_cursor = std::io::Cursor::new(Vec::new());
    let data_url = thumb
        .write_to(&mut thumb_cursor, image::ImageFormat::Png)
        .ok()
        .map(|_| format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(thumb_cursor.into_inner())));

    let _guard = lock_clipboard();
    let mut items = load_clipboard_history();
    let is_duplicate = items.first().is_some_and(|f| {
        f.item_type == "image"
            && f.image_width == Some(w)
            && f.image_height == Some(h)
            && f.image_size_bytes == Some(file_size)
    });
    if is_duplicate {
        let _ = fs::remove_file(&img_path);
        return Some(Vec::new()); // handled, nothing new
    }

    items.insert(
        0,
        ClipboardItem {
            id,
            content: format!("Gambar ({} × {} px)", w, h),
            preview: format!("Gambar ({} × {} px)", w, h),
            item_type: "image".to_string(),
            color_hex: None,
            char_count: 0,
            is_pinned: false,
            timestamp,
            image_path: Some(img_path.to_string_lossy().to_string()),
            image_data_url: data_url,
            image_width: Some(w),
            image_height: Some(h),
            image_size_bytes: Some(file_size),
        },
    );
    enforce_clipboard_limit(&mut items);
    save_clipboard_history(&items);
    Some(items)
}

fn record_clipboard_text(cb: &mut arboard::Clipboard) -> Option<Vec<ClipboardItem>> {
    let text = cb.get_text().ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() || text.len() > CLIPBOARD_MAX_TEXT_BYTES {
        return None;
    }

    let _guard = lock_clipboard();
    let mut items = load_clipboard_history();
    if items.first().map(|i| i.content.as_str()) == Some(text.as_str()) {
        return None;
    }

    let mut was_pinned = false;
    if let Some(pos) = items.iter().position(|i| i.content == text) {
        was_pinned = items[pos].is_pinned;
        items.remove(pos);
    }

    let (item_type, color_hex) = classify_clipboard_text(&text);
    let (timestamp, millis) = now_secs_and_millis();
    let new_item = ClipboardItem {
        id: format!("clip_{}_{}", timestamp, millis),
        preview: truncate_chars(trimmed, 300),
        char_count: trimmed.chars().count(),
        content: text,
        item_type,
        color_hex,
        is_pinned: was_pinned,
        timestamp,
        image_path: None,
        image_data_url: None,
        image_width: None,
        image_height: None,
        image_size_bytes: None,
    };

    items.insert(0, new_item);
    enforce_clipboard_limit(&mut items);
    save_clipboard_history(&items);
    Some(items)
}

fn spawn_clipboard_watcher(clipboard_win: WebviewWindow) {
    std::thread::spawn(move || {
        #[cfg(windows)]
        let mut last_seq: u32 = unsafe { GetClipboardSequenceNumber() };
        #[cfg(not(windows))]
        let mut last_seq: u32 = 0;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(350));

            #[cfg(windows)]
            let current_seq = unsafe { GetClipboardSequenceNumber() };
            #[cfg(not(windows))]
            let current_seq = last_seq;

            if current_seq == last_seq {
                continue;
            }
            last_seq = current_seq;

            if !CLIPBOARD_ENABLED.load(Ordering::SeqCst) || clipboard_is_excluded() {
                continue;
            }

            let Ok(mut cb) = arboard::Clipboard::new() else { continue };
            // Never let a bad clipboard payload kill the watcher thread.
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                record_clipboard_image(&mut cb).or_else(|| record_clipboard_text(&mut cb))
            }));
            match result {
                Ok(Some(items)) if !items.is_empty() => {
                    let _ = clipboard_win.emit("clipboard-history-updated", &items);
                }
                Ok(_) => {}
                Err(_) => log::error!("Panic saat memproses clipboard; item dilewati"),
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_builder = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Resolve the data directory once, before anything reads or writes files.
            if let Ok(dir) = app.path().app_local_data_dir() {
                let _ = fs::create_dir_all(&dir);
                migrate_legacy_data_dir(&dir);
                let _ = APP_DATA_DIR.set(dir);
            }

            let settings = read_app_settings();
            let clipboard_enabled = settings
                .get("clipboardHistoryEnabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            CLIPBOARD_ENABLED.store(clipboard_enabled, Ordering::SeqCst);

            // Clean unpinned clipboard history from previous session
            cleanup_unpinned_clipboard_history();

            let Some(window) = app.get_webview_window("main") else {
                log::error!("Main window not found during setup");
                return Ok(());
            };

            // Set compact initial window size (width 600.0 is fixed for butter-smooth Framer Motion animations)
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: 600.0,
                height: 76.0,
            }));

            // Restore saved position if it's on an active monitor, otherwise center horizontally at top
            let is_top_notch = {
                let settings = get_app_settings();
                settings.get("displayStyle").and_then(|v| v.as_str()) == Some("top-notch")
            };
            let mut position_restored = false;
            if let Some(saved) = load_saved_position() {
                let initial_y = if is_top_notch { 0 } else { saved.y };
                if is_position_valid(&window, saved.x, initial_y) {
                    let _ = window.set_position(Position::Physical(PhysicalPosition {
                        x: saved.x,
                        y: initial_y,
                    }));
                    position_restored = true;
                }
            }
            if !position_restored {
                center_window_top(&window, if is_top_notch { 0 } else { 6 });
            }

            pin_to_topmost(&window);
            ensure_startup_registration();

            init_window_geometry_cache(&window);
            spawn_hit_test_manager(window.clone());
            build_tray(app);
            spawn_topmost_guard(window.clone());

            // Background Clipboard History Watcher (zero CPU polling via OS sequence number)
            spawn_clipboard_watcher(window.clone());

            // Background Media & Audio Peak Watcher (ultra-low CPU < 0.1% idle)
            let media_win = window.clone();
            std::thread::spawn(move || {
                let _com_guard = media_bridge::ComGuard::new();

                let mut last_state = MediaState {
                    is_playing: false,
                    title: String::new(),
                    artist: String::new(),
                    source_app: String::new(),
                    audio_peak: 0.0,
                    position_secs: 0.0,
                    duration_secs: 0.0,
                };

                let mut cached_meta = media_bridge::get_media_metadata();
                let mut meta_refresh_ticks = 0usize;

                loop {
                    let audio_peak = media_bridge::get_system_audio_peak();
                    let has_track = !cached_meta.title.is_empty();
                    let is_active = has_track && (cached_meta.is_playing || audio_peak > 0.012);

                    meta_refresh_ticks += 1;
                    let should_refresh_meta = if is_active {
                        meta_refresh_ticks >= 10 // Refresh GSMTC metadata every ~600ms when playing
                    } else {
                        true // When idle, refresh metadata on every tick (800ms)
                    };

                    if should_refresh_meta {
                        meta_refresh_ticks = 0;
                        cached_meta = media_bridge::get_media_metadata();
                    }

                    let mut is_playing = cached_meta.is_playing;
                    if audio_peak > 0.015 && !cached_meta.title.is_empty() {
                        is_playing = true;
                    }

                    let current = MediaState {
                        is_playing,
                        title: cached_meta.title.clone(),
                        artist: cached_meta.artist.clone(),
                        source_app: cached_meta.source_app.clone(),
                        audio_peak: if has_track { audio_peak } else { 0.0 },
                        position_secs: cached_meta.position_secs,
                        duration_secs: cached_meta.duration_secs,
                    };

                    if is_active {
                        let peak_diff = (current.audio_peak - last_state.audio_peak).abs();
                        let state_changed = current.is_playing != last_state.is_playing
                            || current.title != last_state.title
                            || current.artist != last_state.artist
                            || peak_diff > 0.02
                            || (current.position_secs - last_state.position_secs).abs() >= 1.0;

                        if state_changed {
                            let _ = media_win.emit("media-state-changed", &current);
                            last_state = current;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(60));
                    } else {
                        if last_state.is_playing || last_state.audio_peak > 0.012 {
                            let _ = media_win.emit("media-state-changed", &current);
                            last_state = current;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(800));
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Moved(p) => {
                WIN_X.store(p.x, Ordering::Relaxed);
                WIN_Y.store(p.y, Ordering::Relaxed);
            }
            tauri::WindowEvent::Resized(s) => {
                WIN_W.store(s.width as i32, Ordering::Relaxed);
                if let Ok(p) = window.outer_position() {
                    WIN_X.store(p.x, Ordering::Relaxed);
                    WIN_Y.store(p.y, Ordering::Relaxed);
                }
            }
            tauri::WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                WIN_SCALE_BITS.store(scale_factor.to_bits(), Ordering::Relaxed);
            }
            // Files the user drag-and-dropped onto the island count as user-chosen.
            tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                for p in paths {
                    allow_path(p);
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            set_ignore_mouse_events,
            set_window_expanded,
            move_window,
            set_window_position,
            get_window_position,
            reset_window_position,
            get_app_settings,
            save_app_settings,
            adjust_y_offset,
            hide_window,
            quit_app,
            open_external,
            launch_app,
            open_project_in_antigravity,
            scan_projects,
            select_folder,
            save_note_file,
            get_auto_start,
            set_auto_start,
            open_startup_settings,
            check_office_installed,
            pick_files_dialog,
            read_file_as_base64,
            save_file_in_same_folder,
            convert_office_to_pdf,
            compress_pdf_file,
            show_in_folder,
            open_file,
            trim_memory,
            get_media_state,
            media_toggle_play,
            media_next,
            media_prev,
            download_media_url,
            download_via_ytdlp,
            download_batch_media,
            fetch_url_text,
            hovera_check_updates,
            hovera_install_update,
            get_clipboard_history,
            copy_to_clipboard,
            copy_clipboard_item,
            save_clipboard_image,
            delete_clipboard_item,
            toggle_pin_clipboard_item,
            clear_clipboard_history,
            get_clipboard_history_enabled,
            set_clipboard_history_enabled,
            has_code_editor,
            get_user_storage,
            save_user_storage
        ]);

    let app = match app_builder.build(tauri::generate_context!()) {
        Ok(a) => a,
        Err(err) => {
            log::error!("Error while building hovera tauri application: {err}");
            return;
        }
    };

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            cleanup_unpinned_clipboard_history();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_chars_never_splits_utf8() {
        // 299 ASCII chars + emoji straddling the old 300-byte cut.
        let s = format!("{}😀😀 tail", "a".repeat(299));
        let out = truncate_chars(&s, 300);
        assert!(out.ends_with("..."));
        assert_eq!(out.chars().count(), 303);
        assert_eq!(truncate_chars("pendek", 300), "pendek");
        let multi = "é".repeat(400);
        assert_eq!(truncate_chars(&multi, 300).chars().count(), 303);
    }

    #[test]
    fn classify_clipboard_text_kinds() {
        assert_eq!(classify_clipboard_text("#FFAA00").0, "color");
        assert_eq!(classify_clipboard_text("rgb(1,2,3)").0, "color");
        assert_eq!(classify_clipboard_text("https://example.com").0, "link");
        assert_eq!(classify_clipboard_text("const a = 1;\nfunction b() {}").0, "code");
        assert_eq!(classify_clipboard_text("halo dunia").0, "text");
        assert_eq!(classify_clipboard_text("#ZZZ").0, "text");
    }

    #[test]
    fn external_url_allowlist() {
        assert!(is_allowed_external_url("https://github.com"));
        assert!(is_allowed_external_url("ms-settings:startupapps"));
        assert!(!is_allowed_external_url("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_allowed_external_url(r"C:\Windows\System32\cmd.exe"));
        assert!(!is_allowed_external_url("javascript:alert(1)"));
        assert!(!is_allowed_external_url("https://a.com/\r\nx"));
    }

    #[test]
    fn download_url_validation() {
        assert!(validate_download_url("https://www.tiktok.com/@a/video/1").is_ok());
        assert!(validate_download_url("--exec calc").is_err());
        assert!(validate_download_url(r"-o C:\x.exe").is_err());
        assert!(validate_download_url("file:///C:/secret.txt").is_err());
        assert!(validate_download_url("https:///nohost").is_err());
        assert!(validate_download_url("https://a.com/x y").is_err());
    }

    #[test]
    fn file_name_sanitizing() {
        assert_eq!(sanitize_file_name(r"..\..\evil:name?.mp4", "x"), "_.._evil_name_.mp4");
        assert_eq!(sanitize_file_name("   ", "fallback.jpg"), "fallback.jpg");
        assert_eq!(sanitize_file_name("payload.exe", "x"), "payload.exe.download");
        assert_eq!(sanitize_name_part(r"_x/../..\a.exe", 40), "_xaexe");
    }

    #[test]
    fn executable_detection() {
        assert!(is_executable_path(Path::new(r"C:\a\b.EXE")));
        assert!(is_executable_path(Path::new("run.ps1")));
        assert!(!is_executable_path(Path::new("foto.jpg")));
        assert!(!is_executable_path(Path::new("laporan.pdf")));
    }

    #[test]
    fn clipboard_limit_keeps_pinned() {
        let make = |i: usize, pinned: bool| ClipboardItem {
            id: i.to_string(),
            content: i.to_string(),
            preview: String::new(),
            item_type: "text".into(),
            color_hex: None,
            char_count: 1,
            is_pinned: pinned,
            timestamp: 0,
            image_path: None,
            image_data_url: None,
            image_width: None,
            image_height: None,
            image_size_bytes: None,
        };
        let mut items: Vec<ClipboardItem> = (0..70).map(|i| make(i, i % 10 == 0)).collect();
        enforce_clipboard_limit(&mut items);
        assert_eq!(items.iter().filter(|i| i.is_pinned).count(), 7);
        assert_eq!(items.iter().filter(|i| !i.is_pinned).count(), CLIPBOARD_MAX_UNPINNED);
    }
}

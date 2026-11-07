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
                    if let Ok(peak) = meter.GetPeakValue() {
                        if peak.is_finite() && peak >= 0.0 {
                            return Some(peak.min(1.0));
                        }
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
            if let Ok(enumerator) = enumerator {
                if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                    if let Ok(meter) = device.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None) {
                        if let Ok(peak) = meter.GetPeakValue() {
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
                }
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
            if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
                if let Ok(mgr) = op.join() {
                    *cell.borrow_mut() = Some(mgr.clone());
                    return Some(mgr);
                }
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
        if let Ok(props_op) = session.TryGetMediaPropertiesAsync() {
            if let Ok(props) = props_op.join() {
                if let Ok(t) = props.Title() {
                    title = t.to_string();
                }
                if let Ok(a) = props.Artist() {
                    artist = a.to_string();
                }
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
        if let Ok(info) = session.GetPlaybackInfo() {
            if let Ok(status) = info.PlaybackStatus() {
                is_playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
            }
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
            if is_playing {
                if let Ok(last_updated) = timeline.LastUpdatedTime() {
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
                            if elapsed >= 0.0 && elapsed < 86400.0 {
                                base_pos += elapsed;
                            }
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

            if let Ok(curr_session) = session {
                if let Some(meta) = extract_session_metadata(&curr_session) {
                    return meta;
                }
            }

            // 2. If current session is ignored (e.g. CapCut or Zoom active on screen) or invalid,
            // iterate all sessions to find an active music session (e.g. Spotify playing in background)
            if let Ok(sessions) = manager.GetSessions() {
                if let Ok(size) = sessions.Size() {
                    let mut candidate: Option<MediaMetadata> = None;
                    for i in 0..size {
                        if let Ok(s) = sessions.GetAt(i) {
                            if let Some(meta) = extract_session_metadata(&s) {
                                if meta.is_playing {
                                    return meta;
                                }
                                if candidate.is_none() {
                                    candidate = Some(meta);
                                }
                            }
                        }
                    }
                    if let Some(meta) = candidate {
                        return meta;
                    }
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

    pub fn toggle_play() -> bool {
        if let Some(manager) = get_gsmtc_manager() {
            // Check current session if not ignored
            if let Ok(session) = manager.GetCurrentSession() {
                let app = session.SourceAppUserModelId().map(|id| id.to_string()).unwrap_or_default();
                if !is_ignored_media(&app, "", "") {
                    if let Ok(ctrl) = session.TryTogglePlayPauseAsync() {
                        if let Ok(res) = ctrl.join() {
                            if res {
                                return true;
                            }
                        }
                    }
                    if let Ok(info) = session.GetPlaybackInfo() {
                        if let Ok(status) = info.PlaybackStatus() {
                            if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                                if let Ok(ctrl) = session.TryPauseAsync() {
                                    return ctrl.join().unwrap_or(false);
                                }
                            } else {
                                if let Ok(ctrl) = session.TryPlayAsync() {
                                    return ctrl.join().unwrap_or(false);
                                }
                            }
                        }
                    }
                }
            }
            // Check other non-ignored sessions (e.g. Spotify)
            if let Ok(sessions) = manager.GetSessions() {
                if let Ok(size) = sessions.Size() {
                    for i in 0..size {
                        if let Ok(s) = sessions.GetAt(i) {
                            let app = s.SourceAppUserModelId().map(|id| id.to_string()).unwrap_or_default();
                            if !is_ignored_media(&app, "", "") {
                                if let Ok(ctrl) = s.TryTogglePlayPauseAsync() {
                                    if let Ok(res) = ctrl.join() {
                                        if res {
                                            return true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        false
    }

    pub fn skip_next() -> bool {
        if let Some(manager) = get_gsmtc_manager() {
            if let Ok(session) = manager.GetCurrentSession() {
                let app = session.SourceAppUserModelId().map(|id| id.to_string()).unwrap_or_default();
                if !is_ignored_media(&app, "", "") {
                    if let Ok(ctrl) = session.TrySkipNextAsync() {
                        if let Ok(res) = ctrl.join() {
                            if res {
                                return true;
                            }
                        }
                    }
                }
            }
            if let Ok(sessions) = manager.GetSessions() {
                if let Ok(size) = sessions.Size() {
                    for i in 0..size {
                        if let Ok(s) = sessions.GetAt(i) {
                            let app = s.SourceAppUserModelId().map(|id| id.to_string()).unwrap_or_default();
                            if !is_ignored_media(&app, "", "") {
                                if let Ok(ctrl) = s.TrySkipNextAsync() {
                                    if let Ok(res) = ctrl.join() {
                                        if res {
                                            return true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        false
    }

    pub fn skip_prev() -> bool {
        if let Some(manager) = get_gsmtc_manager() {
            if let Ok(session) = manager.GetCurrentSession() {
                let app = session.SourceAppUserModelId().map(|id| id.to_string()).unwrap_or_default();
                if !is_ignored_media(&app, "", "") {
                    if let Ok(ctrl) = session.TrySkipPreviousAsync() {
                        if let Ok(res) = ctrl.join() {
                            if res {
                                return true;
                            }
                        }
                    }
                }
            }
            if let Ok(sessions) = manager.GetSessions() {
                if let Ok(size) = sessions.Size() {
                    for i in 0..size {
                        if let Ok(s) = sessions.GetAt(i) {
                            let app = s.SourceAppUserModelId().map(|id| id.to_string()).unwrap_or_default();
                            if !is_ignored_media(&app, "", "") {
                                if let Ok(ctrl) = s.TrySkipPreviousAsync() {
                                    if let Ok(res) = ctrl.join() {
                                        if res {
                                            return true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        false
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

fn get_app_data_dir() -> PathBuf {
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let preferred = PathBuf::from(&local_app_data).join("com.programfreelance.hovera");
        if preferred.exists() {
            return preferred;
        }
        let fallback = PathBuf::from(&local_app_data).join("Hovera");
        let _ = fs::create_dir_all(&fallback);
        fallback
    } else {
        PathBuf::from(".").join("Hovera")
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
    if let Err(_) = fs::rename(&tmp_path, path) {
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

fn load_clipboard_history() -> Vec<ClipboardItem> {
    let file = get_clipboard_history_file();
    if file.exists() {
        if let Ok(content) = fs::read_to_string(&file) {
            if let Ok(items) = serde_json::from_str::<Vec<ClipboardItem>>(&content) {
                return items;
            }
        }
    }
    Vec::new()
}

fn save_clipboard_history(items: &[ClipboardItem]) -> bool {
    let file = get_clipboard_history_file();
    if let Ok(json) = serde_json::to_string_pretty(items) {
        return atomic_write_file(&file, &json).is_ok();
    }
    false
}

fn cleanup_unpinned_clipboard_history() {
    let _guard = CLIPBOARD_LOCK.lock().unwrap();
    let mut items = load_clipboard_history();
    let original_len = items.len();

    let mut pinned_images = std::collections::HashSet::new();

    items.retain(|item| {
        if item.is_pinned {
            if let Some(ref path_str) = item.image_path {
                if let Some(file_name) = Path::new(path_str).file_name() {
                    pinned_images.insert(file_name.to_string_lossy().to_string());
                }
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
            if let Some(name) = entry.file_name().to_str() {
                if !pinned_images.contains(name) {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }

    if items.len() != original_len {
        save_clipboard_history(&items);
    }
}

#[tauri::command]
fn get_clipboard_history() -> Vec<ClipboardItem> {
    let _guard = CLIPBOARD_LOCK.lock().unwrap();
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
fn copy_clipboard_item(id: String) -> bool {
    let _guard = CLIPBOARD_LOCK.lock().unwrap();
    let items = load_clipboard_history();
    if let Some(item) = items.iter().find(|i| i.id == id) {
        if item.item_type == "image" {
            if let Some(ref path_str) = item.image_path {
                let path = PathBuf::from(path_str);
                if path.exists() {
                    if let Ok(dyn_img) = image::open(&path) {
                        let rgba = dyn_img.to_rgba8();
                        let width = rgba.width() as usize;
                        let height = rgba.height() as usize;
                        let raw_bytes = rgba.into_raw();

                        if let Ok(mut cb) = arboard::Clipboard::new() {
                            let img_data = arboard::ImageData {
                                width,
                                height,
                                bytes: std::borrow::Cow::Owned(raw_bytes),
                            };
                            return cb.set_image(img_data).is_ok();
                        }
                    }
                }
            }
            return false;
        } else {
            if let Ok(mut cb) = arboard::Clipboard::new() {
                return cb.set_text(&item.content).is_ok();
            }
        }
    }
    false
}

#[tauri::command]
fn save_clipboard_image(id: String) -> Result<String, String> {
    let item = {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();
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
    let _guard = CLIPBOARD_LOCK.lock().unwrap();
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
    let _guard = CLIPBOARD_LOCK.lock().unwrap();
    let mut items = load_clipboard_history();
    if let Some(item) = items.iter_mut().find(|i| i.id == id) {
        item.is_pinned = !item.is_pinned;
        return save_clipboard_history(&items);
    }
    false
}

#[tauri::command]
fn clear_clipboard_history() -> bool {
    let _guard = CLIPBOARD_LOCK.lock().unwrap();
    let mut items = load_clipboard_history();
    let mut pinned_images = std::collections::HashSet::new();

    items.retain(|item| {
        if item.is_pinned {
            if let Some(ref path_str) = item.image_path {
                if let Some(file_name) = Path::new(path_str).file_name() {
                    pinned_images.insert(file_name.to_string_lossy().to_string());
                }
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
            if let Some(name) = entry.file_name().to_str() {
                if !pinned_images.contains(name) {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }

    save_clipboard_history(&items)
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
    if file.exists() {
        if let Ok(content) = fs::read_to_string(&file) {
            if let Ok(pos) = serde_json::from_str::<SavedPosition>(&content) {
                return Some(pos);
            }
        }
    }
    let backup_file = get_position_backup_file();
    if backup_file.exists() {
        if let Ok(content) = fs::read_to_string(&backup_file) {
            if let Ok(pos) = serde_json::from_str::<SavedPosition>(&content) {
                let _ = fs::copy(&backup_file, &file);
                return Some(pos);
            }
        }
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
    if let Ok(json) = serde_json::to_string(&pos) {
        if atomic_write_file(&file, &json).is_ok() {
            let _ = fs::copy(&file, &backup_file);
        }
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
        const SWP_SHOWWINDOW: u32 = 0x0040;
        unsafe {
            SetWindowPos(
                hwnd_raw,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
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

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};

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
    if let Some(h) = height {
        if !expanded {
            COMPACT_HEIGHT.store(h, Ordering::SeqCst);
        }
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
        // Island collapsed to compact capsule: purge unused working set memory
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(250));
            trim_memory_internal();
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
    let file = get_settings_file();
    if file.exists() {
        if let Ok(content) = fs::read_to_string(&file) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if val.is_object() {
                    return val;
                }
            }
        }
    }
    let backup_file = get_settings_backup_file();
    if backup_file.exists() {
        if let Ok(content) = fs::read_to_string(&backup_file) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if val.is_object() {
                    let _ = fs::copy(&backup_file, &file);
                    return val;
                }
            }
        }
    }
    serde_json::json!({})
}

#[tauri::command]
fn save_app_settings(settings: serde_json::Value) -> bool {
    let file = get_settings_file();
    let backup_file = get_settings_backup_file();
    if let Ok(json) = serde_json::to_string_pretty(&settings) {
        if atomic_write_file(&file, &json).is_ok() {
            let _ = fs::copy(&file, &backup_file);
            return true;
        }
    }
    false
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
        center_window_top(&window, offset.max(0).min(100));
    }
}

#[tauri::command]
fn hide_window(window: WebviewWindow) {
    let _ = window.hide();
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_external(url: String) -> bool {
    opener::open(&url).is_ok()
}

#[tauri::command]
fn launch_app(target: String) -> bool {
    if target.is_empty() {
        return false;
    }

    if target == "antigravity" || target == "antigravity-ide" || target == "code" {
        return open_project_in_antigravity(None);
    }

    if target == "calc" {
        return Command::new("cmd")
            .args(["/c", "start", "calc:"])
            .creation_flags(0x08000000)
            .spawn()
            .is_ok();
    }
    if target == "notepad" {
        return Command::new("notepad").spawn().is_ok();
    }
    if target == "explorer" {
        return Command::new("explorer").spawn().is_ok();
    }
    if target == "taskmgr" {
        return Command::new("cmd")
            .args(["/c", "start", "taskmgr"])
            .creation_flags(0x08000000)
            .spawn()
            .is_ok();
    }
    if target.starts_with("http://") || target.starts_with("https://") || target.starts_with("ms-settings:") {
        return opener::open(&target).is_ok();
    }

    // Try spawning or shell execution
    if Command::new(&target).spawn().is_ok() {
        return true;
    }
    Command::new("cmd")
        .args(["/c", "start", "", &target])
        .creation_flags(0x08000000)
        .spawn()
        .is_ok()
}

#[tauri::command]
fn open_project_in_antigravity(folder_path: Option<String>) -> bool {
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users".into());
    let exe_path = PathBuf::from(&local_app_data)
        .join("Programs")
        .join("Antigravity IDE")
        .join("Antigravity IDE.exe");
    let cmd_path = PathBuf::from(&local_app_data)
        .join("Programs")
        .join("Antigravity IDE")
        .join("bin")
        .join("antigravity-ide.cmd");

    let target_bin = if exe_path.exists() {
        exe_path
    } else if cmd_path.exists() {
        cmd_path
    } else {
        PathBuf::from("code")
    };

    let mut cmd = Command::new(target_bin);
    if let Some(folder) = folder_path {
        if Path::new(&folder).exists() {
            cmd.arg(folder);
        }
    }
    cmd.spawn().is_ok()
}

#[tauri::command]
fn scan_projects() -> Vec<ProjectInfo> {
    let base_dirs = [
        ("Program Kantor", "C:\\Developer\\Program Kantor"),
        ("Program Freelance", "C:\\Developer\\Program Freelance"),
    ];

    let mut results = Vec::new();
    for (category, base_path) in base_dirs {
        let p = Path::new(base_path);
        if p.exists() {
            if let Ok(entries) = fs::read_dir(p) {
                for entry in entries.flatten() {
                    if let Ok(ft) = entry.file_type() {
                        if ft.is_dir() {
                            let name = entry.file_name().to_string_lossy().to_string();
                            if !name.starts_with('.') {
                                results.push(ProjectInfo {
                                    name,
                                    path: entry.path().to_string_lossy().to_string(),
                                    category: category.to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    results
}

#[tauri::command]
fn select_folder() -> Option<String> {
    rfd::FileDialog::new()
        .set_directory("C:\\Developer")
        .set_title("Pilih Folder Project untuk Antigravity")
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
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

    // Always ensure "Hovera" is registered in Run so Windows Settings (ms-settings:startupapps) displays it,
    // and keep the executable path synchronized if the binary was updated or moved.
    if let Ok((run_key, _)) = hkcu.create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
        if let Ok(current_exe) = std::env::current_exe() {
            let exe_str = current_exe.to_string_lossy();
            let quoted_path = format!("\"{}\"", exe_str.trim_matches('"'));
            let current_val = run_key.get_value::<String, _>("Hovera").ok();
            if current_val.as_ref() != Some(&quoted_path) {
                let _ = run_key.set_value("Hovera", &quoted_path);
            }
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
    if let Ok(approved_key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run") {
        if let Ok(raw_val) = approved_key.get_raw_value("Hovera") {
            if let Some(&first_byte) = raw_val.bytes.first() {
                // Odd first byte (0x01, 0x03) means disabled by user in Windows Settings
                // Even first byte (0x02, 0x00) means enabled
                return (first_byte & 1) == 0;
            }
        }
    }

    true
}

#[tauri::command]
fn set_auto_start(enable: bool) -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // 1. Ensure "Hovera" is registered in Run with correct quoted path
    if let Ok((run_key, _)) = hkcu.create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
        let exe_path = if let Ok(current_exe) = std::env::current_exe() {
            current_exe.to_string_lossy().to_string()
        } else {
            let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
            format!("{}\\Hovera\\hovera.exe", local_app_data)
        };
        let quoted_path = format!("\"{}\"", exe_path.trim_matches('"'));
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

#[tauri::command]
fn read_file_as_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn save_file_in_same_folder(
    source_path: String,
    suffix: Option<String>,
    target_ext: Option<String>,
    base64_data: String,
) -> Result<serde_json::Value, String> {
    let p = PathBuf::from(&source_path);
    let parent_dir = if let Some(parent) = p.parent() {
        if p.is_absolute() && !parent.as_os_str().is_empty() {
            parent.to_path_buf()
        } else if let Ok(pictures) = std::env::var("USERPROFILE") {
            PathBuf::from(pictures).join("Pictures")
        } else {
            PathBuf::from(".")
        }
    } else if let Ok(pictures) = std::env::var("USERPROFILE") {
        PathBuf::from(pictures).join("Pictures")
    } else {
        PathBuf::from(".")
    };

    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = target_ext.unwrap_or_else(|| {
        p.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin")
            .to_string()
    });
    let sfx = suffix.unwrap_or_else(|| "_compressed".to_string());

    let filename = format!("{}{}.{}", stem, sfx, ext);
    let target_file_path = parent_dir.join(&filename);

    let raw_b64 = if let Some(idx) = base64_data.find(";base64,") {
        &base64_data[idx + 8..]
    } else {
        &base64_data
    };

    let bytes = general_purpose::STANDARD
        .decode(raw_b64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    fs::write(&target_file_path, bytes).map_err(|e| format!("Gagal menulis berkas: {}", e))?;

    Ok(serde_json::json!({
        "success": true,
        "filePath": target_file_path.to_string_lossy().to_string(),
        "fileName": filename,
        "folderPath": parent_dir.to_string_lossy().to_string()
    }))
}

#[tauri::command]
fn convert_office_to_pdf(input_path: String) -> Result<serde_json::Value, String> {
    let p = PathBuf::from(&input_path);
    if !p.exists() {
        return Err("Berkas sumber tidak ditemukan".to_string());
    }

    let parent_dir = p.parent().unwrap_or(Path::new(".")).to_path_buf();
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
    let target_pdf_path = parent_dir.join(format!("{}.pdf", stem));

    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let script = match ext.as_str() {
        "docx" | "doc" => {
            format!(
                r#"
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {{
    $doc = $word.Documents.Open('{input}', $false, $true)
    $doc.SaveAs2('{output}', 17)
    $doc.Close()
}} finally {{
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}}
"#,
                input = p.to_string_lossy().replace('\'', "''"),
                output = target_pdf_path.to_string_lossy().replace('\'', "''")
            )
        }
        "xlsx" | "xls" => {
            format!(
                r#"
$ErrorActionPreference = 'Stop'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {{
    $wb = $excel.Workbooks.Open('{input}', $false, $true)
    $wb.ExportAsFixedFormat(0, '{output}')
    $wb.Close($false)
}} finally {{
    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}}
"#,
                input = p.to_string_lossy().replace('\'', "''"),
                output = target_pdf_path.to_string_lossy().replace('\'', "''")
            )
        }
        "pptx" | "ppt" => {
            format!(
                r#"
$ErrorActionPreference = 'Stop'
$ppt = New-Object -ComObject PowerPoint.Application
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
"#,
                input = p.to_string_lossy().replace('\'', "''"),
                output = target_pdf_path.to_string_lossy().replace('\'', "''")
            )
        }
        _ => return Err(format!("Format .{} belum didukung untuk Office COM", ext)),
    };

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Gagal memanggil PowerShell: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Konversi gagal: {}", err.trim()));
    }

    if !target_pdf_path.exists() {
        return Err("Berkas PDF hasil tidak ditemukan setelah konversi".to_string());
    }

    Ok(serde_json::json!({
        "success": true,
        "filePath": target_pdf_path.to_string_lossy().to_string(),
        "fileName": format!("{}.pdf", stem),
        "folderPath": parent_dir.to_string_lossy().to_string()
    }))
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("Berkas tidak ditemukan".to_string());
    }
    let mut cmd = Command::new("explorer.exe");
    if p.is_file() {
        cmd.arg(format!("/select,{}", p.to_string_lossy()));
    } else {
        cmd.arg(p.as_os_str());
    }
    cmd.creation_flags(0x08000000)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn open_file(path: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("Berkas tidak ditemukan".to_string());
    }

    if p.is_dir() {
        let mut cmd = Command::new("explorer.exe");
        cmd.arg(p.as_os_str());
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
        return Ok(true);
    }

    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let wide_path: Vec<u16> = OsStr::new(&path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let wide_open: Vec<u16> = OsStr::new("open")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe extern "system" {
            fn ShellExecuteW(
                hwnd: *mut std::ffi::c_void,
                lpOperation: *const u16,
                lpFile: *const u16,
                lpParameters: *const u16,
                lpDirectory: *const u16,
                nShowCmd: i32,
            ) -> usize;
        }

        let ret = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                wide_open.as_ptr(),
                wide_path.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        };

        if ret > 32 {
            return Ok(true);
        }
    }

    opener::open(&path).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn compress_pdf_file(input_path: String) -> Result<serde_json::Value, String> {
    let p = PathBuf::from(&input_path);
    if !p.exists() {
        return Err("Berkas PDF tidak ditemukan".to_string());
    }

    let original_size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
    let parent = p.parent().unwrap_or(Path::new("."));
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

#[tauri::command]
async fn download_media_url(
    url: String,
    filename: String,
) -> Result<serde_json::Value, String> {
    let downloads_dir = if let Ok(user_profile) = std::env::var("USERPROFILE") {
        PathBuf::from(user_profile).join("Downloads")
    } else {
        PathBuf::from(".")
    };

    if !downloads_dir.exists() {
        let _ = fs::create_dir_all(&downloads_dir);
    }

    let safe_filename: String = filename
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();

    let safe_filename = if safe_filename.trim().is_empty() {
        "media_download.mp4".to_string()
    } else {
        safe_filename.trim().to_string()
    };

    let target_path = downloads_dir.join(&safe_filename);

    let referer = if url.contains("tiktok.com") {
        "https://www.tiktok.com/"
    } else if url.contains("instagram.com") || url.contains("fbcdn.net") || url.contains("cdninstagram.com") {
        "https://www.instagram.com/"
    } else {
        ""
    };

    let mut cmd = Command::new("curl.exe");
    let mut args: Vec<&str> = vec![
        "-L",
        "-A",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ];
    if !referer.is_empty() {
        args.push("-e");
        args.push(referer);
    }
    args.push("-o");
    let target_str = target_path.to_str().unwrap_or("");
    args.push(target_str);
    args.push("--silent");
    args.push("--show-error");
    args.push(&url);

    cmd.args(&args);
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| format!("Gagal menjalankan curl: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Unduhan gagal: {}", err));
    }

    let mut final_path = target_path.clone();
    let mut final_filename = safe_filename.clone();

    // Verify downloaded file is not an HTML error or empty, and transcode WebP to standard JPEG if needed
    if let Ok(metadata) = fs::metadata(&target_path) {
        if metadata.len() < 100 {
            let _ = fs::remove_file(&target_path);
            return Err("Berkas yang diunduh kosong atau tidak valid".to_string());
        }
        if let Ok(mut f) = fs::File::open(&target_path) {
            use std::io::Read;
            let mut buf = [0u8; 32];
            if let Ok(n) = f.read(&mut buf) {
                let start = String::from_utf8_lossy(&buf[..n]).to_lowercase();
                if start.contains("<!doct") || start.contains("<html") || start.contains("<?xml") || start.contains("cf-mitigated") {
                    drop(f);
                    let _ = fs::remove_file(&target_path);
                    return Err("Server memblokir unduhan langsung (halaman web terdeteksi)".to_string());
                }

                // If content is WebP (RIFF....WEBP), transcode to standard JPEG so Windows Photos decodes it seamlessly
                if n >= 12 && &buf[0..4] == b"RIFF" && &buf[8..12] == b"WEBP" {
                    drop(f);
                    if let Ok(img_bytes) = fs::read(&target_path) {
                        if let Ok(dyn_img) = image::load_from_memory(&img_bytes) {
                            let stem = Path::new(&final_filename)
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("foto");
                            let new_filename = format!("{}.jpg", stem);
                            let new_path = downloads_dir.join(&new_filename);
                            if dyn_img.save_with_format(&new_path, image::ImageFormat::Jpeg).is_ok() {
                                if new_path != target_path {
                                    let _ = fs::remove_file(&target_path);
                                }
                                final_path = new_path;
                                final_filename = new_filename;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "success": true,
        "filePath": final_path.to_string_lossy().to_string(),
        "fileName": final_filename,
        "folderPath": downloads_dir.to_string_lossy().to_string()
    }))
}

#[tauri::command]
async fn fetch_url_text(url: String) -> Result<String, String> {
    let ua = if url.contains("instagram.com") {
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    } else {
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };

    let mut cmd = Command::new("curl.exe");
    cmd.args(&[
        "-s",
        "-L",
        "--max-time",
        "12",
        "-A",
        ua,
        &url,
    ]);
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("Gagal memanggil curl: {}", e))?;
    if !output.status.success() {
        return Err("Koneksi gagal".to_string());
    }
    String::from_utf8(output.stdout).map_err(|_| "Respon bukan format teks UTF-8 yang valid".to_string())
}

#[derive(serde::Deserialize)]
struct BatchMediaItem {
    url: String,
    filename: String,
}

#[tauri::command]
async fn download_batch_media(
    items: Vec<BatchMediaItem>,
    folder_name: String,
) -> Result<serde_json::Value, String> {
    let downloads_dir = if let Ok(user_profile) = std::env::var("USERPROFILE") {
        PathBuf::from(user_profile).join("Downloads")
    } else {
        PathBuf::from(".")
    };

    let safe_folder: String = folder_name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();

    let safe_folder = if safe_folder.trim().is_empty() {
        "Hovera_Downloads".to_string()
    } else {
        safe_folder.trim().to_string()
    };

    let target_dir = downloads_dir.join(&safe_folder);
    if !target_dir.exists() {
        let _ = fs::create_dir_all(&target_dir);
    }

    let mut saved_files: Vec<String> = Vec::new();

    for item in items {
        let safe_filename: String = item.filename
            .chars()
            .map(|c| match c {
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
                _ => c,
            })
            .collect();
        let safe_filename = if safe_filename.trim().is_empty() {
            "unduhan_media.jpg".to_string()
        } else {
            safe_filename.trim().to_string()
        };

        let file_path = target_dir.join(&safe_filename);
        let referer = if item.url.contains("tiktok.com") {
            "https://www.tiktok.com/"
        } else if item.url.contains("instagram.com") || item.url.contains("fbcdn.net") || item.url.contains("cdninstagram.com") {
            "https://www.instagram.com/"
        } else {
            ""
        };

        let mut cmd = Command::new("curl.exe");
        let mut args: Vec<&str> = vec![
            "-L",
            "-A",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ];
        if !referer.is_empty() {
            args.push("-e");
            args.push(referer);
        }
        args.push("-o");
        let target_str = file_path.to_str().unwrap_or("");
        args.push(target_str);
        args.push("--silent");
        args.push("--show-error");
        args.push(&item.url);

        cmd.args(&args);
        cmd.creation_flags(0x08000000);
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                // Validate file and detect WebP
                let mut valid = false;
                let mut actual_name = safe_filename.clone();
                if let Ok(meta) = fs::metadata(&file_path) {
                    if meta.len() >= 100 {
                        if let Ok(mut f) = fs::File::open(&file_path) {
                            use std::io::Read;
                            let mut buf = [0u8; 32];
                            if let Ok(n) = f.read(&mut buf) {
                                let start = String::from_utf8_lossy(&buf[..n]).to_lowercase();
                                if !start.contains("<!doct") && !start.contains("<html") && !start.contains("<?xml") {
                                    valid = true;
                                    if n >= 12 && &buf[0..4] == b"RIFF" && &buf[8..12] == b"WEBP" {
                                        drop(f);
                                        if let Ok(img_bytes) = fs::read(&file_path) {
                                            if let Ok(dyn_img) = image::load_from_memory(&img_bytes) {
                                                let stem = Path::new(&actual_name)
                                                    .file_stem()
                                                    .and_then(|s| s.to_str())
                                                    .unwrap_or("foto");
                                                let new_name = format!("{}.jpg", stem);
                                                let new_p = target_dir.join(&new_name);
                                                if dyn_img.save_with_format(&new_p, image::ImageFormat::Jpeg).is_ok() {
                                                    if new_p != file_path {
                                                        let _ = fs::remove_file(&file_path);
                                                    }
                                                    actual_name = new_name;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if valid {
                    saved_files.push(actual_name);
                } else {
                    let _ = fs::remove_file(&file_path);
                }
            }
        }
    }

    if saved_files.is_empty() {
        return Err("Tidak ada berkas yang berhasil diunduh".to_string());
    }

    let first_file_path = if let Some(first) = saved_files.first() {
        target_dir.join(first).to_string_lossy().to_string()
    } else {
        target_dir.to_string_lossy().to_string()
    };

    Ok(serde_json::json!({
        "success": true,
        "folderPath": target_dir.to_string_lossy().to_string(),
        "totalCount": saved_files.len(),
        "files": saved_files,
        "filePath": first_file_path
    }))
}

#[tauri::command]
async fn download_via_ytdlp(
    url: String,
    format_type: String,
) -> Result<serde_json::Value, String> {
    let downloads_dir = if let Ok(user_profile) = std::env::var("USERPROFILE") {
        PathBuf::from(user_profile).join("Downloads")
    } else {
        PathBuf::from(".")
    };

    if !downloads_dir.exists() {
        let _ = fs::create_dir_all(&downloads_dir);
    }

    let local_bin = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        PathBuf::from(local_app_data).join("Hovera").join("bin").join("yt-dlp.exe")
    } else {
        PathBuf::from("yt-dlp.exe")
    };

    let ytdlp_path = if local_bin.exists() {
        local_bin
    } else {
        if let Some(parent) = local_bin.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let mut get_cmd = Command::new("curl.exe");
        get_cmd.args(&[
            "-L",
            "-o",
            local_bin.to_str().unwrap_or(""),
            "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
        ]);
        get_cmd.creation_flags(0x08000000);
        let _ = get_cmd.output();
        if local_bin.exists() {
            local_bin
        } else {
            PathBuf::from("yt-dlp.exe")
        }
    };

    let output_template = downloads_dir.join("%(title)s.%(ext)s");

    let mut cmd = Command::new(&ytdlp_path);
    cmd.creation_flags(0x08000000);
    cmd.arg("--no-playlist");
    cmd.arg("--no-warnings");
    cmd.args(&["--js-runtimes", "node:node"]);
    cmd.args(&["--print", "after_move:filepath"]);
    cmd.arg("-o");
    cmd.arg(output_template.to_string_lossy().to_string());

    if format_type == "audio" {
        cmd.args(&["-f", "ba[ext=m4a]/ba/bestaudio/audio/b"]);
    } else {
        cmd.args(&["-f", "b[ext=mp4]/b/18/best[ext=mp4]/best"]);
    }

    cmd.arg(&url);

    let output = cmd.output().map_err(|e| format!("Gagal memproses unduhan: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Unduhan gagal: {}", err));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let mut downloaded_filepath = String::new();
    for line in stdout_str.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() && Path::new(trimmed).exists() {
            downloaded_filepath = trimmed.to_string();
        }
    }

    if downloaded_filepath.is_empty() {
        return Err("Unduhan selesai namun berkas tidak ditemukan. Pastikan tautan masih aktif.".to_string());
    }

    // If format is audio and the downloaded file has an .mp4 container (common in TikTok audio stream),
    // rename it to .m4a so Windows shell and media players identify it natively as an audio file
    if format_type == "audio" && downloaded_filepath.to_lowercase().ends_with(".mp4") {
        let old_p = PathBuf::from(&downloaded_filepath);
        let m4a_path = old_p.with_extension("m4a");
        if fs::rename(&old_p, &m4a_path).is_ok() {
            downloaded_filepath = m4a_path.to_string_lossy().to_string();
        }
    }

    let file_name = Path::new(&downloaded_filepath)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Berkas Tersimpan")
        .to_string();

    Ok(serde_json::json!({
        "success": true,
        "folderPath": downloads_dir.to_string_lossy().to_string(),
        "fileName": file_name,
        "filePath": downloaded_filepath
    }))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_builder = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
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

            // Background dynamic hit-test manager:
            // Allows 100% click-through for background apps (like Chrome tabs)
            // in the transparent wings outside the capsule while keeping the 600px
            // window canvas fixed for butter-smooth Framer Motion animations!
            let w_hit = window.clone();
            std::thread::spawn(move || {
                loop {
                    if IS_EXPANDED.load(Ordering::Relaxed) {
                        if IS_IGNORING_MOUSE.load(Ordering::Relaxed) {
                            let _ = w_hit.set_ignore_cursor_events(false);
                            IS_IGNORING_MOUSE.store(false, Ordering::Relaxed);
                        }
                        // Sleep longer when expanded since island takes cursor focus
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        continue;
                    }

                    // 30ms (~33 FPS) provides imperceptible mouse hover latency with minimal CPU overhead
                    std::thread::sleep(std::time::Duration::from_millis(30));

                    let pos = match w_hit.outer_position() {
                        Ok(p) => p,
                        Err(_) => continue,
                    };
                    let size = match w_hit.outer_size() {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    let scale = w_hit.scale_factor().unwrap_or(1.0);

                    let compact_w = (COMPACT_WIDTH.load(Ordering::Relaxed) as f64 * scale).round() as i32;
                    let compact_h = (COMPACT_HEIGHT.load(Ordering::Relaxed) as f64 * scale).round() as i32;

                    let win_w = size.width as i32;
                    let capsule_left = pos.x + (win_w - compact_w) / 2;
                    let capsule_right = capsule_left + compact_w;
                    let capsule_bottom = pos.y + compact_h;

                    let hit_margin = (10.0 * scale).round() as i32;
                    let min_x = capsule_left - hit_margin;
                    let max_x = capsule_right + hit_margin;
                    let min_y = pos.y - hit_margin;
                    let max_y = capsule_bottom + hit_margin;

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
                    }
                }
            });

            // System Tray with zero panic risks
            if let (Ok(toggle_item), Ok(reset_item), Ok(quit_item)) = (
                MenuItemBuilder::with_id("toggle", "Tampilkan / Sembunyikan Hovera").build(app),
                MenuItemBuilder::with_id("reset", "Reset Posisi ke Atas Tengah").build(app),
                MenuItemBuilder::with_id("quit", "Keluar (Quit)").build(app),
            ) {
                if let Ok(tray_menu) = MenuBuilder::new(app)
                    .item(&toggle_item)
                    .item(&reset_item)
                    .separator()
                    .item(&quit_item)
                    .build()
                {
                    let tray_icon = app
                        .default_window_icon()
                        .cloned()
                        .or_else(|| tauri::image::Image::from_app_icon_resource(32).ok());

                    if let Some(icon) = tray_icon {
                        let _ = TrayIconBuilder::new()
                            .tooltip("Hovera")
                            .icon(icon)
                            .menu(&tray_menu)
                            .on_menu_event(|app, event| match event.id.as_ref() {
                                "toggle" => {
                                    if let Some(w) = app.get_webview_window("main") {
                                        if w.is_visible().unwrap_or(false) {
                                            let _ = w.hide();
                                        } else {
                                            let _ = w.show();
                                            pin_to_topmost(&w);
                                        }
                                    }
                                }
                                "reset" => {
                                    if let Some(w) = app.get_webview_window("main") {
                                        clear_saved_position();
                                        center_window_top(&w, 6);
                                        let _ = w.emit("window-position-reset", ());
                                    }
                                }
                                "quit" => {
                                    app.exit(0);
                                }
                                _ => {}
                            })
                            .on_tray_icon_event(|tray, event| {
                                if let TrayIconEvent::Click {
                                    button: MouseButton::Left,
                                    button_state: MouseButtonState::Up,
                                    ..
                                } = event
                                {
                                    let app = tray.app_handle();
                                    if let Some(w) = app.get_webview_window("main") {
                                        if w.is_visible().unwrap_or(false) {
                                            let _ = w.hide();
                                        } else {
                                            let _ = w.show();
                                            pin_to_topmost(&w);
                                        }
                                    }
                                }
                            })
                            .build(app);
                    }
                }
            }

            // Continuous lightweight memory trimmer and topmost enforcer
            let win_bg = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                if !IS_EXPANDED.load(Ordering::Relaxed) {
                    trim_memory_internal();
                }
                pin_to_topmost(&win_bg);

                loop {
                    std::thread::sleep(std::time::Duration::from_secs(20));
                    // Only trim working set pages when collapsed to avoid UI stutter during user interaction
                    if !IS_EXPANDED.load(Ordering::Relaxed) {
                        trim_memory_internal();
                    }
                    pin_to_topmost(&win_bg);
                }
            });

            // Background Clipboard History Watcher (Zero CPU polling via OS sequence number)
            let clipboard_win = window.clone();
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

                    if current_seq != last_seq {
                        last_seq = current_seq;

                        if let Ok(mut cb) = arboard::Clipboard::new() {
                            let mut handled_as_image = false;

                            // 1. Check if clipboard holds an image
                            if let Ok(img) = cb.get_image() {
                                if img.width > 0 && img.height > 0 && !img.bytes.is_empty() {
                                    let w = img.width as u32;
                                    let h = img.height as u32;

                                    if let Some(rgba) = image::RgbaImage::from_raw(w, h, img.bytes.into_owned()) {
                                        let dyn_img = image::DynamicImage::ImageRgba8(rgba);

                                        let timestamp = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs() as i64;

                                        let millis = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_millis() % 10000;

                                        let id = format!("clip_img_{}_{}", timestamp, millis);
                                        let img_filename = format!("{}.png", id);
                                        let img_path = get_clipboard_images_dir().join(&img_filename);

                                        if dyn_img.save_with_format(&img_path, image::ImageFormat::Png).is_ok() {
                                            let file_size = fs::metadata(&img_path).map(|m| m.len() as usize).unwrap_or(0);

                                            // Generate lightweight thumbnail for instant UI rendering
                                            let thumb = dyn_img.thumbnail(360, 240);
                                            let mut thumb_cursor = std::io::Cursor::new(Vec::new());
                                            let data_url = if thumb.write_to(&mut thumb_cursor, image::ImageFormat::Png).is_ok() {
                                                let b64 = general_purpose::STANDARD.encode(thumb_cursor.into_inner());
                                                Some(format!("data:image/png;base64,{}", b64))
                                            } else {
                                                None
                                            };

                                            let _guard = CLIPBOARD_LOCK.lock().unwrap();
                                            let mut items = load_clipboard_history();

                                            // Check duplicate with previous top item
                                            let is_duplicate = items.first().map(|f| {
                                                f.item_type == "image"
                                                    && f.image_width == Some(w)
                                                    && f.image_height == Some(h)
                                                    && f.image_size_bytes == Some(file_size)
                                            }).unwrap_or(false);

                                            if !is_duplicate {
                                                let new_item = ClipboardItem {
                                                    id: id.clone(),
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
                                                };

                                                items.insert(0, new_item);

                                                if items.len() > 60 {
                                                    let mut unpinned_count = 0;
                                                    items.retain(|item| {
                                                        if item.is_pinned {
                                                            true
                                                        } else {
                                                            unpinned_count += 1;
                                                            if unpinned_count > 50 {
                                                                if let Some(ref p) = item.image_path {
                                                                    let _ = fs::remove_file(p);
                                                                }
                                                                false
                                                            } else {
                                                                true
                                                            }
                                                        }
                                                    });
                                                }

                                                save_clipboard_history(&items);
                                                let _ = clipboard_win.emit("clipboard-history-updated", &items);
                                            } else {
                                                let _ = fs::remove_file(&img_path);
                                            }
                                            handled_as_image = true;
                                        }
                                    }
                                }
                            }

                            // 2. Fallback to text if not an image
                            if !handled_as_image {
                                if let Ok(text) = cb.get_text() {
                                    let trimmed = text.trim();
                                    if !trimmed.is_empty() && trimmed.len() <= 500_000 {
                                        let _guard = CLIPBOARD_LOCK.lock().unwrap();
                                        let mut items = load_clipboard_history();

                                        if items.first().map(|i| i.content.as_str()) != Some(&text) {
                                            let mut was_pinned = false;
                                            if let Some(pos) = items.iter().position(|i| i.content == text) {
                                                was_pinned = items[pos].is_pinned;
                                                items.remove(pos);
                                            }

                                            let (item_type, color_hex) = classify_clipboard_text(&text);
                                            let preview = if trimmed.len() > 300 {
                                                format!("{}...", &trimmed[..300])
                                            } else {
                                                trimmed.to_string()
                                            };

                                            let timestamp = std::time::SystemTime::now()
                                                .duration_since(std::time::UNIX_EPOCH)
                                                .unwrap_or_default()
                                                .as_secs() as i64;

                                            let millis = std::time::SystemTime::now()
                                                .duration_since(std::time::UNIX_EPOCH)
                                                .unwrap_or_default()
                                                .as_millis() % 10000;

                                            let id = format!("clip_{}_{}", timestamp, millis);

                                            let char_count = trimmed.chars().count();
                                            let new_item = ClipboardItem {
                                                id,
                                                content: text,
                                                preview,
                                                item_type,
                                                color_hex,
                                                char_count,
                                                is_pinned: was_pinned,
                                                timestamp,
                                                image_path: None,
                                                image_data_url: None,
                                                image_width: None,
                                                image_height: None,
                                                image_size_bytes: None,
                                            };

                                            items.insert(0, new_item);

                                            if items.len() > 60 {
                                                let mut unpinned_count = 0;
                                                items.retain(|item| {
                                                    if item.is_pinned {
                                                        true
                                                    } else {
                                                        unpinned_count += 1;
                                                        if unpinned_count > 50 {
                                                            if let Some(ref p) = item.image_path {
                                                                let _ = fs::remove_file(p);
                                                            }
                                                            false
                                                        } else {
                                                            true
                                                        }
                                                    }
                                                });
                                            }

                                            save_clipboard_history(&items);
                                            let _ = clipboard_win.emit("clipboard-history-updated", &items);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

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
            clear_clipboard_history
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

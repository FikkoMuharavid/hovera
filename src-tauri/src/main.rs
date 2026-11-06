// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
fn ensure_single_instance() -> bool {
    // If this is a Chromium/WebView2 helper process, allow it to run!
    if std::env::args().any(|arg| arg.starts_with("--type=")) {
        return true;
    }

    use std::os::raw::c_void;
    unsafe extern "system" {
        fn CreateMutexW(lpMutexAttributes: *mut c_void, bInitialOwner: i32, lpName: *const u16) -> *mut c_void;
        fn GetLastError() -> u32;
        fn FindWindowW(lpClassName: *const u16, lpWindowName: *const u16) -> *mut c_void;
        fn SetForegroundWindow(hWnd: *mut c_void) -> i32;
        fn ShowWindow(hWnd: *mut c_void, nCmdShow: i32) -> i32;
        fn CloseHandle(hObject: *mut c_void) -> i32;
    }

    let global_name: Vec<u16> = "Global\\Hovera_DynamicIsland_SingleInstance_Mutex\0".encode_utf16().collect();
    let local_name: Vec<u16> = "Local\\Hovera_DynamicIsland_SingleInstance_Mutex\0".encode_utf16().collect();

    // Try Global mutex first (cross-session / elevated), fallback to Local session mutex
    let mut handle = unsafe { CreateMutexW(std::ptr::null_mut(), 1, global_name.as_ptr()) };
    let mut err = unsafe { GetLastError() };

    // ERROR_ACCESS_DENIED (5) -> retry with Local session namespace
    if handle.is_null() && err == 5 {
        handle = unsafe { CreateMutexW(std::ptr::null_mut(), 1, local_name.as_ptr()) };
        err = unsafe { GetLastError() };
    }

    if err == 183 { // ERROR_ALREADY_EXISTS = 183
        let win_title: Vec<u16> = "Hovera\0".encode_utf16().collect();
        // Give the primary instance a brief moment to show its window if it was launching
        for _ in 0..5 {
            let hwnd = unsafe { FindWindowW(std::ptr::null(), win_title.as_ptr()) };
            if !hwnd.is_null() {
                unsafe {
                    ShowWindow(hwnd, 5); // SW_SHOW = 5
                    SetForegroundWindow(hwnd);
                }
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        if !handle.is_null() {
            unsafe { CloseHandle(handle); }
        }
        return false;
    }

    use std::sync::atomic::{AtomicPtr, Ordering};
    static MUTEX_HANDLE: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

    // Retain mutex handle in static storage for the entire process lifetime
    MUTEX_HANDLE.store(handle, Ordering::Relaxed);
    true
}

#[cfg(not(windows))]
fn ensure_single_instance() -> bool {
    true
}

fn main() {
    #[cfg(windows)]
    {
        if !ensure_single_instance() {
            // Another instance of Hovera is already running! Exit immediately.
            std::process::exit(0);
        }
    }

    let args = [
        "--renderer-process-limit=1",
        "--disable-features=SpareRendererForSitePerProcess,OptimizationHints,Translate,Autofill,AudioServiceOutOfProcess,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,MediaRouter",
        "--disable-background-networking",
        "--disable-extensions",
        "--disable-sync",
        "--disable-default-apps",
        "--disable-component-update",
        "--disable-breakpad",
        "--disable-domain-reliability",
        "--disable-gpu-shader-disk-cache",
        "--disk-cache-size=1048576",
        "--media-cache-size=1048576",
        "--js-flags=--max-old-space-size=48",
    ].join(" ");

    unsafe {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", args);
    }
    std::panic::set_hook(Box::new(|info| {
        eprintln!("[Hovera Fatal Panic] {}", info);
        log::error!("[Hovera Fatal Panic] {}", info);
    }));
    hovera_lib::run();
}

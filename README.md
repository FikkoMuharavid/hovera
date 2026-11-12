# Hovera

> **Dynamic Productivity Hub for Windows**  
> An ultra-sleek, lightweight, and fluid Dynamic Island experience crafted natively for Windows 10 & 11.

---

## Overview

**Hovera** transforms your Windows desktop workflow by bringing a fluid "dynamic island" capsule to the top of your screen. Powered by **Tauri v2** and **Rust** (using the system WebView2 instead of a bundled browser), Hovera stays lightweight while providing a suite of daily productivity tools, media utilities, and system controls.

---

## Key Features

### 1. Dual Display Styles
- **Dynamic Island (Floating Mode)**: Smooth, freely-movable floating pill capsule with 360-degree positioning anywhere across your monitors.
- **Dynamic Notch (Flush-Top Mode)**: Sits 100% flush against the top bezel of your monitor with seamless bottom corner curves and zero gap, featuring horizontal-only constrained dragging.

### 2. Live Media & Synced Lyrics
- Real-time media playback detection across browsers (Brave, Chrome, Edge) and desktop players (Spotify, Windows Media).
- Dynamic 4-bar audio equalizer responding live to system audio output peaks.
- **Synchronized Live Lyrics**: Automatic line-by-line scrolling lyrics synchronized with the currently playing track.

### 3. Smart Media Downloader
- **Universal Downloader**: Download videos, carousels, and high-definition audio from TikTok, Instagram, and YouTube.
- **Auto WebP Transcoding**: Automatically transcodes WebP images into standard baseline JPEG files so they open natively in Windows Photos without errors.
- **Clean Audio Extraction**: Extracts pure AAC/M4A audio tracks for native playback in Windows Media Player.

### 4. Productivity & Time Management
- **Quick Notes**: Fast note taking with automatic disk synchronization and Markdown/TXT export.
- **Task Hub & Todo List**: Streamlined task tracking with instant completion badges on the compact capsule.
- **Focus Timer & Stopwatch**: High-precision timers for Pomodoro and deep work sessions.
- **Health Reminders**: Non-intrusive reminders for drinking water and taking stretch breaks.
- **Relationship Countdown**: Custom anniversary and monthly milestone tracker.

### 5. File Utilities Hub
- **Office to PDF**: 1-click batch conversion from Word (.docx), Excel (.xlsx), and PowerPoint (.pptx) to PDF without opening Microsoft Office.
- **PDF Compressor & Merger**: Fast offline document optimization.
- **Image Compressor**: Compress images to target sizes without uploading to third-party cloud servers.

### 6. Native Auto-Updates
- Built-in, 1-click auto-update engine powered by **Tauri v2** and **GitHub Releases**.
- Protected with industry-standard **Ed25519 cryptographic signatures** to guarantee package authenticity.
- Background update notifications directly inside the Dynamic Island.

---

## Tech Stack

- **Core Engine**: [Tauri v2](https://v2.tauri.app/) (Rust)
- **Frontend Framework**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Styling & Animations**: [Tailwind CSS v4](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/)
- **Icons**: [Lucide Icons](https://lucide.dev/)
- **Packaging**: NSIS Windows Installer (`.exe`)

---

## Installation

Download the latest official installer (`Hovera_x.x.x_x64-setup.exe`) from the [Releases](https://github.com/FikkoMuharavid/hovera/releases) page.

1. Run the setup executable.
2. Hovera will launch and dock at the top of your screen.
3. Configure your preferences (Display Style, Auto-Start on Windows boot, Haptic sounds) in the **Setelan (Settings)** tab.

---

## Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Rust & Cargo](https://www.rust-lang.org/tools/install) (stable, 1.90+)
- Visual Studio C++ Build Tools

### Running in Development
```bash
git clone https://github.com/FikkoMuharavid/hovera.git
cd hovera
npm install          # also installs the pinned Tauri CLI
npm run tauri:dev    # Vite dev server + Tauri window
```

### Checks
```bash
npm run typecheck && npm run lint && npm run test:rust
```
The same checks (plus `cargo clippy -D warnings` and `npm audit`) run in CI on every push.

### Building Production Installer
```bash
npm run tauri:build
```
The installer is written to `src-tauri/target/release/bundle/nsis/`. For a full signed release use
`scripts/release-github.ps1` (see *Releasing* below).

---

## Privacy

- Notes, todos, shortcuts, settings and pinned clipboard items are stored only on your PC, in
  `%LOCALAPPDATA%\com.programfreelance.hovera\`.
- **Clipboard history** can be paused at any time from the Clipboard tab. Content that password
  managers and browsers mark as sensitive is never recorded. Unpinned items are kept in memory only
  and are cleared when Hovera exits.
- Some features contact third-party services:
  - **Synced lyrics** send the current track's title and artist to [LRCLIB](https://lrclib.net) and
    NetEase Cloud Music. Turn off *Lyrics* in Settings to disable this.
  - **Media downloader** sends the link you paste to TikWM (TikTok), public Invidious instances
    (YouTube) or Instagram, and downloads [yt-dlp](https://github.com/yt-dlp/yt-dlp) from its official
    GitHub releases (SHA-256 verified) when needed. Only download content you have the right to download.
  - **Auto-update** checks GitHub Releases.

## Security

- The webview has a strict Content-Security-Policy and can only open http(s)/`ms-settings:` links,
  launch known apps, and read/process files you picked yourself.
- Updates are signed with an Ed25519 key (verified by the updater before installing).

## Releasing

1. Create the updater key once, *outside* the repo and with a password:
   `.\scripts\generate-keys.ps1` → `~\.hovera\hovera.key`. Back up the key and password offline;
   losing it means existing installs can no longer be updated.
2. (Recommended) Get an Authenticode code-signing certificate (OV/EV or Azure Trusted Signing),
   import it into the Windows certificate store and set `HOVERA_CERT_THUMBPRINT`.
   Without it, Windows SmartScreen warns users when they run the installer.
3. Run `.\scripts\release-github.ps1 -Version x.y.z -Notes "..." -AutoPublish`.

---

## License

This project is licensed under the [MIT License](LICENSE).

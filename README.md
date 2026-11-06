# Hovera

> **Dynamic Productivity Hub for Windows**  
> An ultra-sleek, lightweight, and fluid Dynamic Island experience crafted natively for Windows 10 & 11.

---

## Overview

**Hovera** transforms your Windows desktop workflow by bringing the fluid, intuitive aesthetics of Apple's Dynamic Island and MacBook Notch directly to your screen. Powered by **Tauri v2** and **Rust**, Hovera operates with near-zero resource consumption (~30 MB RAM) while providing a comprehensive suite of daily productivity tools, media utilities, and system controls.

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
- [Rust & Cargo](https://www.rust-lang.org/tools/install) (latest stable)
- Visual Studio C++ Build Tools

### Running in Development
```bash
# Clone the repository
git clone https://github.com/FikkoMuharavid/hovera.git
cd hovera

# Install frontend dependencies
npm install

# Run Vite dev server with Tauri v2 window
npm run tauri:dev
```

### Building Production Installer
```bash
# Compile and build the NSIS installer
npm run build
npx @tauri-apps/cli build --bundles nsis
```

The compiled installer will be located in `src-tauri/target/release/bundle/nsis/`.

---

## Security & Secrets

Hovera does not store user data on remote servers. All notes, settings, and downloaded media remain strictly on your local machine.

Release updates are cryptographically signed using Ed25519 keypairs. The private signing key is never included in the repository.

---

## License

This project is licensed under the [MIT License](LICENSE).

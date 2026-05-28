<p align="center">
  <img src="vizwall-logo.png" alt="VizWall Workspace Logo" width="600" />
</p>

<p align="center">
  <a href="https://github.com/benzsiangco/VizWall-Manager/releases"><img src="https://img.shields.io/github/v/release/benzsiangco/VizWall-Manager?style=flat-square&label=latest&color=8b5cf6" alt="Latest Release" /></a>
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri&style=flat-square" alt="Tauri" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18.3-cyan?logo=react&style=flat-square" alt="React" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&style=flat-square" alt="TypeScript" /></a>
  <a href="https://sqlite.org/"><img src="https://img.shields.io/badge/SQLite-3.x-lightblue?logo=sqlite&style=flat-square" alt="SQLite" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows-0078d4?logo=windows&style=flat-square" alt="Windows" />
</p>

**VizWall Workspace** is a high-performance, local-first desktop application built for video editors, animators, and post-production professionals. It replaces Windows Explorer for creative work — automating folder structures, organizing assets by type, tracking client projects from ingestion to delivery, and connecting directly to Premiere Pro via a CEP panel plugin.

Built with **Tauri v2**, **React**, and **TypeScript**. All data stays on your machine in a local SQLite database. No cloud, no subscriptions.

---

## ✨ Features

### 📁 Project & Client Management
- Create clients and projects with a single click
- Every new project auto-generates a full industry-standard folder structure:
  `IMPORTS`, `MEDIA/A_ROLL`, `MEDIA/B_ROLL`, `AUDIO/Voiceovers`, `AUDIO/Music`, `AUDIO/SFX`, `GRAPHICS`, `EXPORTS/Final`, `REVISIONS`, `BRANDING`, `DELIVERABLES`, and more
- Track deadlines, project status, and add free-form notes per project
- Drag Kanban cards between pipeline stages (To Edit → In Progress → Client Review → Revisions → Approved → Exported)
- Search projects by name, client, status, or notes directly from the title bar

### 🗂️ Asset Workspace & Global Library
- Browse project assets in grid or list view with live waveform previews for audio
- Single-click any asset to instantly open a full-screen QuickLook preview with playback controls
- Scrub video thumbnails by clicking and dragging across the card
- Drag assets out of the app directly into Premiere Pro, DaVinci Resolve, After Effects, or Explorer
- Global Library mode: point to any folder on disk and browse it as a live asset library with full folder tree, category auto-tagging, and favorites
- Folder type overrides: right-click any folder to tag all files inside as SFX, Music, Graphics, etc.
- Audio files under 60 seconds are auto-tagged as SFX; longer files as Music (via ffprobe duration detection)

### 🎬 Premiere Pro CEP Panel Plugin
- Installed automatically on first launch
- Browse your VizWall projects and Global Library directly inside Premiere Pro
- **Drag assets from the panel onto the Premiere timeline** using the native CEP drag API
- Single-click to import an asset directly to the project bin
- Import entire project structures with one click, organized into bins matching your folder layout
- Waveform previews for audio assets inside the panel

### 📊 Activity Heat Map (Dashboard)
- GitHub-style contribution grid showing daily activity over the last 3, 6, or 12 months
- Real data from the activity log: project creates, imports, renames, organizes, archives, exports
- Stats: Active Days, Total Events, Projects Worked On, Assets Processed (bytes)
- Hover any day cell to see the exact event count

### 🔄 Revision & Export Trackers
- Log every client export with file path, size, and notes
- Track revision versions with feedback and status history

### 🧹 Disk Utilities
- Find duplicate files across all projects
- Detect and delete empty folders
- Storage analytics per drive and per asset category

### 🗄️ Archive & Auto-Purge
- Archive completed projects with configurable auto-delete policies
- One-click restore from archive

### 🔔 Auto-Updater
- Version number always visible in the title bar
- Silent background update check on startup (5s delay)
- When a new release is available: a pulsing green dot appears on the version chip
- Click it to see release notes and download + install in one step — app restarts automatically

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Zustand |
| Desktop wrapper | Tauri v2, Rust |
| Database | SQLite (local `vizwall.db` in app data folder) |
| Media processing | ffmpeg + ffprobe (bundled sidecar) |
| Premiere plugin | CEP panel (HTML/JS/ExtendScript), CSInterface v11 |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Rust & Cargo](https://www.rust-lang.org/)
- Windows Build Tools (MSVC)

### Development

```bash
# Clone
git clone https://github.com/benzsiangco/VizWall-Manager.git
cd VizWall-Manager

# Install JS dependencies
npm install

# Run in dev mode (hot reload)
npm run tauri dev

# Build production installer
npm run tauri build
```

Installers are output to `src-tauri/target/release/bundle/`:
- `nsis/VizWall Workspace_x.x.x_x64-setup.exe` — NSIS installer (recommended)
- `msi/VizWall Workspace_x.x.x_x64_en-US.msi` — MSI package

### Premiere Pro Plugin

The CEP panel is installed automatically when VizWall launches for the first time. It copies the plugin to:
```
%APPDATA%\Adobe\CEP\extensions\com.vizwall.premiere
```

To enable unsigned CEP extensions in Premiere Pro, the installer also sets the required registry keys (`HKCU\Software\Adobe\CSXS.8` through `CSXS.12`, `PlayerDebugMode = 1`).

---

## 📦 Releases

Download the latest Windows installer from the [Releases Page](https://github.com/benzsiangco/VizWall-Manager/releases).

---

## 👤 Author

Developed by **Benz Siangco** — video editor, motion designer, and tool builder.

- **Website**: [vizwall.site](https://vizwall.site)
- **Instagram**: [@vizwall.site](https://instagram.com/vizwall.site)
- **TikTok**: [@vizwall.site](https://tiktok.com/@vizwall.site)
- **Email**: [benz@vizwall.site](mailto:benz@vizwall.site)

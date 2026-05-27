# 🎬 VizWall Workspace

[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri&style=flat-square)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18.3-cyan?logo=react&style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&style=flat-square)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-lightblue?logo=sqlite&style=flat-square)](https://sqlite.org/)

**VizWall Workspace** is a high-performance, local-first desktop application designed specifically for video editors, animators, and post-production professionals. It simplifies file organization, automates folder structures, tracks revision workflows, and helps manage client projects from ingestion to final delivery.

Built using **Tauri v2**, **React**, and **TypeScript**, it runs directly on your computer with a lightning-fast native SQLite database.

---

## ✨ Features

- **📁 Automated Workspace Organization**
  - Instant project initialization with standard industry templates (e.g., `IMPORTS`, `MEDIA/A_ROLL`, `MEDIA/B_ROLL`, `AUDIO/Voiceovers`, `EXPORTS/Final`, etc.).
  - Automatic naming convention enforcement for assets.
  
- **💼 Client & Project Management**
  - Seamlessly manage multiple clients and their corresponding projects.
  - Track deadlines, project status, and view recent activities.
  - SQLite backend ensures local-first data integrity.

- **📊 Asset Inspector & Media Library**
  - View asset folders directly within the app.
  - Generate automatic thumbnails for video and image files using embedded `ffmpeg`.
  - Batch rename, update categories, and mark favorite assets.
  - Drag and drop files directly out of the app to your video editor.

- **🔄 Revision & Export Trackers**
  - Keep history of all client exports, review links, and notes.
  - Track revisions with details (feedback, versioning, status).

- **🧹 Disk Utilities & Cleanups**
  - Find duplicate files and empty directories across project workspace.
  - One-click deletion of empty folders to keep directories clean.
  - Local disk and workspace storage analytics.

- **🗄️ Project Archiver**
  - Archive completed projects into dedicated directories.
  - Configure archive policies and auto-purge expired archives to save disk space.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Framer Motion, Zustand
- **Backend / Desktop Wrapper**: Tauri v2, Rust
- **Database**: SQLite (local database file `vizwall.db` stored in app data folder)
- **External Binaries**: `ffmpeg` (for media processing and thumbnail generation), `llama-cli` (sidecar binary integrations)

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v18+)
- [Rust & Cargo](https://www.rust-lang.org/) (for compiling the Tauri desktop wrapper)
- Windows Build Tools (if building on Windows)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/benzsiangco/VizWall-Manager.git
   cd VizWall-Manager
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the app in developer mode:**
   ```bash
   npm run tauri dev
   ```

4. **Build the production release:**
   ```bash
   npm run tauri build
   ```

The compiled installers (NSIS `.exe` and `.msi`) will be generated under `src-tauri/target/release/bundle/`.

---

## 📦 Releases

Download the latest production installers (Windows NSIS setup or MSI package) from our [Releases Page](https://github.com/benzsiangco/VizWall-Manager/releases).

---

## 👤 Author

Developed by **Benz Siangco**.
- **Website**: [vizwall.site](https://vizwall.site)
- **Instagram**: [@vizwall.site](https://instagram.com/vizwall.site)
- **TikTok**: [@vizwall.site](https://tiktok.com/@vizwall.site)
- **Email**: [benz@vizwall.site](mailto:benz@vizwall.site)

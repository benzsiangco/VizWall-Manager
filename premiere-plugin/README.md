# VizWall Workspace - Premiere Pro Extension

This directory contains the Adobe Premiere Pro Common Extensibility Platform (CEP) extension panel for **VizWall Workspace**. It allows you to search and import assets from your VizWall database directly into Premiere Pro with a single click.

## Features

- **Direct Database Access**: Reads the local `vizwall.db` using WebAssembly SQLite (`sql.js`).
- **One-Click Ingestion**: Imports files straight to the active bin in Premiere Pro.
- **Glassmorphic UI**: High-fidelity dark mode designed to match Adobe's workspace styling.

## Installation

### Automatic Installation (Production/Tauri Integration)
The VizWall Workspace desktop application bundles this extension in its resources. When the desktop application launches:
1. It automatically copies the plugin directory to `C:\Users\<User>\AppData\Roaming\Adobe\CEP\extensions\com.vizwall.premiere`.
2. It sets the required Adobe registry keys to enable local unsigned extensions.

### Manual Installation (Development)
If you want to install it manually:

1. Copy the `com.vizwall.premiere` directory to your Adobe extensions folder:
   - **Windows**: `C:\Users\<YourUsername>\AppData\Roaming\Adobe\CEP\extensions\`
   - **macOS**: `~/Library/Application Support/Adobe/CEP/extensions/`

2. Enable Adobe CEP Debugging (required to load unsigned extensions locally):
   - **Windows**:
     Open PowerShell as Administrator and run:
     ```powershell
     # For CEP 9 (Premiere Pro 2019+)
     Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.9" -Name "PlayerDebugMode" -Value "1" -Force
     # For CEP 10 (Premiere Pro 2020+)
     Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.10" -Name "PlayerDebugMode" -Value "1" -Force
     # For CEP 11 (Premiere Pro 2021+)
     Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.11" -Name "PlayerDebugMode" -Value "1" -Force
     ```
   - **macOS**:
     Open Terminal and run:
     ```bash
     defaults write com.adobe.CSXS.9 PlayerDebugMode 1
     defaults write com.adobe.CSXS.10 PlayerDebugMode 1
     defaults write com.adobe.CSXS.11 PlayerDebugMode 1
     ```

3. Restart Premiere Pro. You will find the extension under **Window** -> **Extensions** -> **VizWall Workspace**.

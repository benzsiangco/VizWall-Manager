use std::path::Path;
use tauri::path::BaseDirectory;
use tauri::{App, Manager};

// Helper function to recursively copy files and directories
fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> std::io::Result<()> {
    std::fs::create_dir_all(&dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

pub fn install_premiere_plugin(app_handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    
    // 1. Resolve source path in Tauri bundle resources
    // The resource directory in production matches the structure in tauri.conf.json resources
    let source_path = app_handle
        .path()
        .resolve("../premiere-plugin/com.vizwall.premiere", BaseDirectory::Resource)?;
    
    if !source_path.exists() {
        println!("Premiere Pro plugin source directory does not exist: {:?}", source_path);
        return Ok(());
    }

    // 2. Resolve destination path in Roaming AppData
    // C:\Users\<User>\AppData\Roaming\Adobe\CEP\extensions\com.vizwall.premiere
    let app_data = app_handle.path().app_data_dir()?; // AppData/Roaming/com.vizwall.workspace
    let roaming = app_data.parent().ok_or("Could not find AppData Roaming directory")?;
    let dest_path = roaming
        .join("Adobe")
        .join("CEP")
        .join("extensions")
        .join("com.vizwall.premiere");

    println!("Installing Premiere Pro plugin to: {:?}", dest_path);

    // 3. Create destination directory and copy files
    if dest_path.exists() {
        // Remove existing to ensure a clean install/update
        let _ = std::fs::remove_dir_all(&dest_path);
    }
    
    copy_dir_all(&source_path, &dest_path)?;
    println!("Successfully installed Premiere Pro plugin!");

    // 4. Configure registry on Windows for PlayerDebugMode
    #[cfg(target_os = "windows")]
    {
        configure_player_debug_mode()?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn configure_player_debug_mode() -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // We set debug mode for CSXS versions 8 through 12 to cover Premiere CC 2018 through 2024+
    for version in 8..=12 {
        let key = format!("HKCU\\Software\\Adobe\\CSXS.{}", version);
        let status = Command::new("reg")
            .args(&["add", &key, "/v", "PlayerDebugMode", "/t", "REG_SZ", "/d", "1", "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
        
        match status {
            Ok(s) if s.success() => {
                println!("Successfully set registry key for CSXS.{}", version);
            }
            _ => {
                eprintln!("Failed to set registry key for CSXS.{}", version);
            }
        }
    }
    Ok(())
}

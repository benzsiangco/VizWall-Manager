// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod models;
mod commands;
mod plugin_installer;

use database::{init_db, DbState};
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle();

            let db_path = app_handle
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap())
                .join("vizwall.db");

            let conn = init_db(db_path).expect("Failed to initialize SQLite database");
            app.manage(DbState(Mutex::new(conn)));

            // Automatically install/update the Premiere Pro plugin CEP extension and registry
            if let Err(e) = plugin_installer::install_premiere_plugin(app) {
                eprintln!("Error installing Premiere Pro plugin: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_clients_and_projects,
            commands::create_client,
            commands::create_project,
            commands::update_project_status,
            commands::delete_project,
            commands::delete_client,
            commands::get_project_assets,
            commands::import_folder,
            commands::list_import_subfolders,
            commands::preview_import_folder,
            commands::organize_folder,
            commands::rename_assets_batch,
            commands::toggle_favorite_asset,
            commands::get_recent_activity,
            commands::get_storage_stats,
            commands::get_disk_stats,
            commands::get_all_disk_stats,
            commands::get_workspace_path,
            commands::save_workspace_settings,
            commands::get_naming_template,
            commands::pick_folder_dialog,
            commands::pick_file_dialog,
            commands::open_in_editor,
            commands::reveal_in_explorer,
            commands::generate_thumbnail,
            commands::get_ffmpeg_status,
            // Revisions
            commands::get_project_revisions,
            commands::get_all_revisions,
            commands::add_revision,
            commands::delete_revision,
            // Exports
            commands::get_project_exports,
            commands::get_all_exports,
            commands::add_export,
            commands::delete_export,
            // Archive
            commands::archive_project,
            commands::unarchive_project,
            commands::set_archive_policy,
            commands::get_archived_projects,
            commands::purge_expired_archives,
            // Project thumbnail
            commands::set_project_thumbnail,
            commands::update_project_deadline,
            commands::delete_asset,
            commands::update_asset_category,
            commands::drag_file,
            commands::find_duplicates,
            commands::find_empty_folders,
            commands::delete_empty_folders,
            commands::rename_client,
            commands::rename_project,
            commands::get_global_library,
            commands::save_global_library,
            commands::scan_folder_assets,
            commands::scan_folder_assets_cached,
            commands::clear_library_cache,
            commands::update_project_notes,
            commands::get_activity_heatmap
        ])
        .run(tauri::generate_context!())
        .expect("Error while running tauri application");
}

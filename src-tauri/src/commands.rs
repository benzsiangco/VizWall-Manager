use crate::database::DbState;
use crate::models::*;
use rusqlite::params;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{State, Emitter};
use sysinfo::Disks;
use chrono::TimeZone;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
pub fn get_clients_and_projects(state: State<'_, DbState>) -> Result<Vec<ClientWithProjects>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, name, created_at FROM clients ORDER BY name ASC").map_err(|e| e.to_string())?;
    let client_rows = stmt.query_map([], |row| {
        Ok(Client {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut clients = Vec::new();
    for client in client_rows {
        let client = client.map_err(|e| e.to_string())?;
        
        let mut proj_stmt = conn.prepare(
            "SELECT id, client_id, name, path, status, created_at, thumbnail_path,
                    COALESCE(archived, 0), archived_at, COALESCE(auto_delete_days, 30), completed_at,
                    deadline, notes
             FROM projects WHERE client_id = ? AND COALESCE(archived, 0) = 0 ORDER BY name ASC"
        ).map_err(|e| e.to_string())?;
        let proj_rows = proj_stmt.query_map(params![client.id], |row| {
            let archived_int: i32 = row.get(7)?;
            Ok(Project {
                id: row.get(0)?,
                client_id: row.get(1)?,
                name: row.get(2)?,
                path: row.get(3)?,
                status: row.get(4)?,
                created_at: row.get(5)?,
                thumbnail_path: row.get(6)?,
                archived: archived_int == 1,
                archived_at: row.get(8)?,
                auto_delete_days: row.get(9)?,
                completed_at: row.get(10)?,
                deadline: row.get(11)?,
                notes: row.get(12)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut projects = Vec::new();
        for proj in proj_rows {
            projects.push(proj.map_err(|e| e.to_string())?);
        }

        clients.push(ClientWithProjects {
            id: client.id,
            name: client.name,
            created_at: client.created_at,
            projects,
        });
    }

    Ok(clients)
}

#[tauri::command]
pub fn create_client(state: State<'_, DbState>, name: String) -> Result<Client, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO clients (id, name, created_at) VALUES (?, ?, ?)",
        params![id, name, now],
    ).map_err(|e| e.to_string())?;

    // Log activity
    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, NULL, 'CLIENT_CREATE', ?, ?)",
        params![log_id, format!("Created client '{}'", name), now],
    );

    Ok(Client { id, name, created_at: now })
}

#[tauri::command]
pub fn create_project(state: State<'_, DbState>, client_id: String, name: String, path: String, deadline: Option<String>) -> Result<Project, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let status = "To Edit".to_string();

    // ── Create the full project folder structure immediately ──────────────
    // Every subfolder is created upfront so the project is ready to use
    // as a drop-in replacement for Windows Explorer.
    let subfolders = [
        // Raw imports staging area
        "IMPORTS",
        // Pre-production docs
        "PROJECT_INFO/Brief",
        "PROJECT_INFO/Scripts",
        "PROJECT_INFO/Shotlists",
        "PROJECT_INFO/References",
        "PROJECT_INFO/Moodboards",
        "PROJECT_INFO/Client_Notes",
        // Branding assets
        "BRANDING/Logos",
        "BRANDING/Fonts",
        "BRANDING/LUTS",
        "BRANDING/Overlays",
        "BRANDING/Style_Guide",
        // Media footage
        "MEDIA/A_ROLL",
        "MEDIA/B_ROLL",
        "MEDIA/Drone",
        "MEDIA/Photos",
        "MEDIA/Screen_Recordings",
        "MEDIA/References",
        // Audio
        "AUDIO/Voiceovers",
        "AUDIO/Music",
        "AUDIO/SFX",
        "AUDIO/Cleaned_Audio",
        // Graphics & motion
        "GRAPHICS/Logos",
        "GRAPHICS/PNGs",
        "GRAPHICS/Overlays",
        "GRAPHICS/Lower_Thirds",
        "GRAPHICS/Thumbnails",
        "GRAPHICS/Motion_Graphics",
        // Project files per NLE
        "PROJECT_FILES/Premiere_Pro",
        "PROJECT_FILES/DaVinci_Resolve",
        "PROJECT_FILES/After_Effects",
        "PROJECT_FILES/CapCut",
        "PROJECT_FILES/AutoSaves",
        // Proxy files
        "PROXIES",
        // Exports per platform
        "EXPORTS/Internal",
        "EXPORTS/Client_Review",
        "EXPORTS/Final",
        "EXPORTS/TikTok",
        "EXPORTS/Instagram",
        "EXPORTS/YouTube",
        "EXPORTS/Archive",
        // Revision versions
        "REVISIONS/Revision_01",
        "REVISIONS/Revision_02",
        "REVISIONS/Revision_03",
        "REVISIONS/Approved",
        // Social media copy
        "SOCIAL_MEDIA/Captions",
        "SOCIAL_MEDIA/Hashtags",
        "SOCIAL_MEDIA/Descriptions",
        "SOCIAL_MEDIA/Upload_Assets",
        // Final deliverables
        "DELIVERABLES/Client_Delivery",
        "DELIVERABLES/Source_Files",
        "DELIVERABLES/Backup_Exports",
    ];

    let root = Path::new(&path);
    for subfolder in &subfolders {
        let dir = root.join(subfolder);
        if let Err(e) = fs::create_dir_all(&dir) {
            // Log but don't fail — partial creation is better than no creation
            eprintln!("Warning: could not create {:?}: {}", dir, e);
        }
    }

    conn.execute(
        "INSERT INTO projects (id, client_id, name, path, status, created_at, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![id, client_id, name, path, status, now, deadline],
    ).map_err(|e| e.to_string())?;

    // Log activity
    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'PROJECT_CREATE', ?, ?)",
        params![log_id, id, format!("Created project '{}' with full folder structure at '{}'", name, path), now],
    );

    Ok(Project {
        id,
        client_id,
        name,
        path,
        status,
        created_at: now,
        thumbnail_path: None,
        archived: false,
        archived_at: None,
        auto_delete_days: 30,
        completed_at: None,
        deadline,
        notes: None,
    })
}

fn export_subfolder_for_status(status: &str) -> &'static str {
    match status {
        "Client Review" | "Revisions" => "Client_Review",
        "Approved" | "Exported" | "Delivered" => "Final",
        "To Edit" | "In Progress" => "Internal",
        _ => "Internal",
    }
}

fn unique_destination_path(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let src = Path::new(file_name);
    let stem = src.file_stem().unwrap_or_default().to_string_lossy();
    let ext = src.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();

    for idx in 1..1000 {
        let next_name = if ext.is_empty() {
            format!("{}_{}", stem, idx)
        } else {
            format!("{}_{}.{}", stem, idx, ext)
        };
        let next = dir.join(next_name);
        if !next.exists() {
            return next;
        }
    }

    candidate
}

fn move_exports_for_status(
    conn: &rusqlite::Connection,
    project_id: &str,
    status: &str,
    now: &str,
) -> Result<usize, String> {
    let project_path: String = conn.query_row(
        "SELECT path FROM projects WHERE id = ?",
        params![project_id],
        |r| r.get(0),
    ).map_err(|_| "Project not found".to_string())?;

    let target_subfolder = export_subfolder_for_status(status);
    let target_dir = Path::new(&project_path).join("EXPORTS").join(target_subfolder);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, name, path FROM exports WHERE project_id = ?")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut moved = 0usize;
    for row in rows {
        let (export_id, name, path) = row.map_err(|e| e.to_string())?;
        let src = PathBuf::from(&path);
        if !src.exists() {
            continue;
        }

        let src_parent = src.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        if src_parent == target_dir {
            continue;
        }

        let dest = unique_destination_path(&target_dir, &name);
        fs::rename(&src, &dest)
            .or_else(|_| {
                fs::copy(&src, &dest)?;
                fs::remove_file(&src)
            })
            .map_err(|e| format!("Failed to move export '{}': {}", name, e))?;

        conn.execute(
            "UPDATE exports SET path = ? WHERE id = ?",
            params![dest.to_string_lossy().to_string(), export_id],
        ).map_err(|e| e.to_string())?;

        moved += 1;
    }

    if moved > 0 {
        let log_id = uuid::Uuid::new_v4().to_string();
        let _ = conn.execute(
            "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'EXPORT_MOVE', ?, ?)",
            params![
                log_id,
                project_id,
                format!("Moved {} export{} to EXPORTS/{}", moved, if moved == 1 { "" } else { "s" }, target_subfolder),
                now
            ],
        );
    }

    Ok(moved)
}

#[tauri::command]
pub fn update_project_status(state: State<'_, DbState>, project_id: String, status: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // If moving to a "completed" state, stamp completed_at; otherwise clear it
    let is_completed = matches!(status.as_str(), "Approved" | "Exported" | "Delivered");
    if is_completed {
        conn.execute(
            "UPDATE projects SET status = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?",
            params![status, now, project_id],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE projects SET status = ?, completed_at = NULL WHERE id = ? AND archived = 0",
            params![status, project_id],
        ).map_err(|e| e.to_string())?;
    }

    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'PROJECT_UPDATE', ?, ?)",
        params![log_id, &project_id, format!("Updated status to '{}'", status), now],
    );

    move_exports_for_status(&conn, &project_id, &status, &now)?;

    Ok(())
}

#[tauri::command]
pub fn get_project_assets(state: State<'_, DbState>, project_id: String) -> Result<Vec<Asset>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, original_name, path, size, mime_type, category, duration, thumbnail_path, ai_description, favorite, created_at 
         FROM assets WHERE project_id = ? ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;

    let asset_rows = stmt.query_map(params![project_id], |row| {
        let favorite_val: i32 = row.get(11)?;
        Ok(Asset {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            original_name: row.get(3)?,
            path: row.get(4)?,
            size: row.get(5)?,
            mime_type: row.get(6)?,
            category: row.get(7)?,
            duration: row.get(8)?,
            thumbnail_path: row.get(9)?,
            ai_description: row.get(10)?,
            favorite: favorite_val == 1,
            created_at: row.get(12)?,
            tags: Vec::new(),
        })
    }).map_err(|e| e.to_string())?;

    let mut assets = Vec::new();
    for asset_res in asset_rows {
        let mut asset = asset_res.map_err(|e| e.to_string())?;
        
        // Query tags
        let mut tags_stmt = conn.prepare(
            "SELECT t.name FROM tags t 
             JOIN asset_tags at ON t.id = at.tag_id 
             WHERE at.asset_id = ?"
        ).map_err(|e| e.to_string())?;
        
        let tags_rows = tags_stmt.query_map(params![asset.id], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
        
        for tag in tags_rows {
            asset.tags.push(tag.map_err(|e| e.to_string())?);
        }
        
        assets.push(asset);
    }

    Ok(assets)
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct FileInfoForAi {
    pub name: String,
    pub path: PathBuf,
    pub created_secs: u64,
    pub created_str: String,
}

/// Temporal Propagation & Rules fallback wrapper:
/// Classifies all files, resolving categories by GGUF AI results, rule keywords,
/// and co-created sequence clustering (creation times).
fn classify_files_with_temporal_propagation(
    files: &[FileInfoForAi],
    ai_results: &HashMap<String, (String, String)>,
) -> HashMap<String, (String, String)> {
    let mut results = HashMap::new();

    // 1. Initialize with AI results
    for file in files {
        if let Some(res) = ai_results.get(&file.name) {
            results.insert(file.name.clone(), res.clone());
        }
    }

    // 2. Classify remaining files using rule-based keywords
    for file in files {
        if !results.contains_key(&file.name) {
            let ext = file.path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            let stem = file.path.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
            let (cat, _) = classify_file_rules(&stem, &ext);
            let reasoning = format!("Rule-based classification: {} (extension and filename keywords).", cat.replace("_", " ").to_lowercase());
            results.insert(file.name.clone(), (cat.to_string(), reasoning));
        }
    }

    // 3. Temporal Propagation:
    // If a file is categorized as B_ROLL or ARCHIVE (which are typical defaults for unrecognized files),
    // and was created within 120 seconds of an A_ROLL or VOICEOVER file, propagate that context to improve organization.
    let files_sorted_by_time = {
        let mut f = files.to_vec();
        f.sort_by_key(|x| x.created_secs);
        f
    };

    for i in 0..files_sorted_by_time.len() {
        let file = &files_sorted_by_time[i];
        let current_cat = results.get(&file.name).map(|r| r.0.as_str()).unwrap_or("ARCHIVE");

        if current_cat == "B_ROLL" || current_cat == "ARCHIVE" {
            let ext = file.path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            let is_video = matches!(ext.as_str(), "mp4" | "mov" | "mkv" | "avi" | "mxf" | "m4v" | "wmv");
            let is_audio = matches!(ext.as_str(), "mp3" | "wav" | "aac" | "flac" | "ogg" | "m4a" | "aiff" | "aif");

            for other in &files_sorted_by_time {
                if other.name != file.name && other.created_secs > 0 && file.created_secs > 0 {
                    let diff = (other.created_secs as i64 - file.created_secs as i64).abs();
                    if diff <= 120 {
                        let other_cat = results.get(&other.name).map(|r| r.0.as_str()).unwrap_or("ARCHIVE");
                        if other_cat == "A_ROLL" && is_video && current_cat == "B_ROLL" {
                            let new_reasoning = format!("Temporal grouping: categorized as B_ROLL (associated B-Roll shot at same time as interview A_ROLL file '{}').", other.name);
                            results.insert(file.name.clone(), ("B_ROLL".to_string(), new_reasoning));
                            break;
                        } else if other_cat == "VOICEOVER" && is_audio {
                            let new_reasoning = format!("Temporal grouping: categorized as VOICEOVER (associated audio recorded at same time as voiceover file '{}').", other.name);
                            results.insert(file.name.clone(), ("VOICEOVER".to_string(), new_reasoning));
                            break;
                        }
                    }
                }
            }
        }
    }

    results
}

/// Rule-based file categorization — used as fallback when AI is not available
fn classify_file_rules(stem_lower: &str, extension: &str) -> (&'static str, Option<String>) {
    match extension {
        // ── Video files ──────────────────────────────────────────────────
        "mp4" | "mov" | "mkv" | "avi" | "mxf" | "m4v" | "wmv" | "mp2t" | "ts" | "webm" => {
            // Check for voiceover first!
            let is_vo = stem_lower.contains("vo_") || stem_lower.contains("_vo")
                || stem_lower.starts_with("vo ")  || stem_lower.ends_with(" vo")
                || stem_lower.contains("voiceover") || stem_lower.contains("voice_over")
                || stem_lower.contains("voice over") || stem_lower.contains("narr")
                || stem_lower.contains("narration") || stem_lower.contains("dialogue")
                || stem_lower.contains("dialog") || stem_lower.contains("speech")
                || stem_lower.contains("spoken") || stem_lower.contains("interview_audio")
                || stem_lower.contains("mic_") || stem_lower.contains("_mic")
                || stem_lower.contains("dub") || stem_lower.contains("dubbing")
                || stem_lower.contains("record") || stem_lower.contains("take_")
                || stem_lower.contains("_take") || stem_lower.contains("read_")
                || stem_lower.contains("_read") || stem_lower.contains("commentary")
                || stem_lower.contains("podcast") || stem_lower.contains("vocal_")
                || stem_lower.contains("_vocal");

            // Rendered / exported outputs → EXPORTS
            let is_export = stem_lower.contains("render") || stem_lower.contains("export")
                || stem_lower.contains("final") || stem_lower.contains("master")
                || stem_lower.contains("output") || stem_lower.contains("deliverable")
                || stem_lower.contains("encoded") || stem_lower.starts_with("rendered");

            // Talking head / interview → A_ROLL
            let is_aroll = stem_lower.contains("interview") || stem_lower.contains("talking")
                || stem_lower.contains("host") || stem_lower.contains("presenter")
                || stem_lower.contains("a_roll") || stem_lower.contains("aroll")
                || stem_lower.contains("speaker") || stem_lower.contains("selfie_cam")
                || stem_lower.contains("face_cam") || stem_lower.contains("facecam");

            let cat = if is_vo { "VOICEOVER" }
                else if is_export { "EXPORTS" }
                else if is_aroll { "A_ROLL" }
                else { "B_ROLL" };

            (cat, Some("video/mp4".to_string()))
        }

        // ── Audio files — duration-aware + keyword matching ──────────────
        // Note: duration is not available at classification time from filename alone,
        // so we use filename keywords + extension patterns.
        // Duration-based SFX detection (< 60s) is handled separately in import_folder
        // where we have actual file metadata.
        "mp3" | "wav" | "aac" | "flac" | "ogg" | "m4a" | "aiff" | "aif" | "wma" => {
            // Voiceover / narration / dialogue / dub — dedicated recording folder
            let is_vo = stem_lower.contains("vo_") || stem_lower.contains("_vo")
                || stem_lower.starts_with("vo ")  || stem_lower.ends_with(" vo")
                || stem_lower.contains("voiceover") || stem_lower.contains("voice_over")
                || stem_lower.contains("voice over") || stem_lower.contains("narr")
                || stem_lower.contains("narration") || stem_lower.contains("dialogue")
                || stem_lower.contains("dialog") || stem_lower.contains("speech")
                || stem_lower.contains("spoken") || stem_lower.contains("interview_audio")
                || stem_lower.contains("mic_") || stem_lower.contains("_mic")
                || stem_lower.contains("dub") || stem_lower.contains("dubbing")
                || stem_lower.contains("record") || stem_lower.contains("take_")
                || stem_lower.contains("_take") || stem_lower.contains("read_")
                || stem_lower.contains("_read") || stem_lower.contains("commentary")
                || stem_lower.contains("podcast") || stem_lower.contains("vocal_")
                || stem_lower.contains("_vocal");

            // SFX — sound effects, transitions, UI sounds, ambience, short clips
            let is_sfx = stem_lower.contains("sfx") || stem_lower.contains("_fx")
                || stem_lower.contains("fx_") || stem_lower.contains("sound_effect")
                || stem_lower.contains("sound effect") || stem_lower.contains("foley")
                || stem_lower.contains("impact") || stem_lower.contains("whoosh")
                || stem_lower.contains("swoosh") || stem_lower.contains("click")
                || stem_lower.contains("beep") || stem_lower.contains("ding")
                || stem_lower.contains("transition") || stem_lower.contains("riser")
                || stem_lower.contains("stinger") || stem_lower.contains("hit")
                || stem_lower.contains("boom") || stem_lower.contains("zap")
                || stem_lower.contains("sci fi") || stem_lower.contains("sci_fi")
                || stem_lower.contains("scifi") || stem_lower.contains("ambient")
                || stem_lower.contains("atmos") || stem_lower.contains("room_tone")
                || stem_lower.contains("noise") || stem_lower.contains("glitch")
                || stem_lower.contains("ui_") || stem_lower.contains("_ui")
                || stem_lower.contains("notification") || stem_lower.contains("alert")
                || stem_lower.contains("mouse") || stem_lower.contains("keyboard")
                || stem_lower.contains("enhanced") || stem_lower.contains("whomp")
                || stem_lower.contains("swipe") || stem_lower.contains("swoosh")
                || stem_lower.contains("pop") || stem_lower.contains("snap")
                || stem_lower.contains("tick") || stem_lower.contains("tock")
                || stem_lower.contains("chime") || stem_lower.contains("bell")
                || stem_lower.contains("buzz") || stem_lower.contains("hum");

            let cat = if is_vo { "VOICEOVER" }
                else if is_sfx { "SFX" }
                else { "MUSIC" };

            (cat, Some("audio/wav".to_string()))
        }

        // ── Image files ──────────────────────────────────────────────────
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tiff" | "tif" | "heic" | "heif" => {
            let cat = if stem_lower.contains("thumb") || stem_lower.contains("thumbnail")
                || stem_lower.contains("cover") || stem_lower.contains("poster")
                || stem_lower.contains("banner") || stem_lower.contains("key_art")
                || stem_lower.contains("keyart") {
                "THUMBNAILS"
            } else {
                "GRAPHICS"
            };
            (cat, Some("image/jpeg".to_string()))
        }

        // ── Motion graphics / templates → GRAPHICS ───────────────────────
        "mogrt"                                     // Premiere Pro Motion Graphics Template
        | "mogrts"                                  // Premiere Pro Motion Graphics Template (sequence)
        | "prfpset"                                 // Premiere Pro preset
        | "ffx"                                     // After Effects preset
        | "aet"                                     // After Effects template
        | "aepx"                                    // After Effects XML project
        | "jsx" | "jsxbin"                          // After Effects scripts
        => {
            ("GRAPHICS", Some("application/octet-stream".to_string()))
        }

        // ── Font files → GRAPHICS ─────────────────────────────────────────
        "ttf" | "otf" | "woff" | "woff2" | "eot" | "fon" | "fnt" => {
            ("GRAPHICS", Some("application/octet-stream".to_string()))
        }

        // ── Project / editing files — NEVER move these ───────────────────
        "prproj"                                    // Premiere Pro project
        | "drp"                                     // DaVinci Resolve project
        | "aep"                                     // After Effects project
        | "fcpx" | "fcpbundle"                      // Final Cut Pro
        | "resolve"                                 // DaVinci Resolve
        | "veg"                                     // Vegas Pro
        | "kdenlive"                                // Kdenlive
        | "capcut"                                  // CapCut
        | "psd"                                     // Photoshop
        | "ai"                                      // Illustrator
        | "indd"                                    // InDesign
        | "xd"                                      // Adobe XD
        | "fig"                                     // Figma
        | "lut" | "cube" | "3dl"                    // LUT files
        | "xml" | "fcpxml"                          // XML project interchange
        | "edl" | "aaf" | "omf"                     // Edit Decision List / interchange
        | "json" | "csv" | "txt" | "pdf"
        | "docx" | "xlsx" | "pptx" => {
            ("PROJECT_FILES", Some("application/octet-stream".to_string()))
        }

        // ── Proxy / camera metadata — archive ────────────────────────────
        "lrv" | "thm" | "srt" | "sub" | "vtt" => {
            ("ARCHIVE", None)
        }

        _ => ("ARCHIVE", None),
    }
}

fn get_file_time(path: &Path) -> (u64, String) {
    let metadata = fs::metadata(path);
    let time = metadata.ok().and_then(|m| {
        m.created().ok().or_else(|| m.modified().ok())
    });

    if let Some(t) = time {
        let duration = t.duration_since(std::time::SystemTime::UNIX_EPOCH).unwrap_or_default();
        let secs = duration.as_secs();
        let datetime: chrono::DateTime<chrono::Local> = t.into();
        let formatted = datetime.format("%Y-%m-%d %H:%M:%S").to_string();
        (secs, formatted)
    } else {
        (0, "Unknown time".to_string())
    }
}

#[tauri::command]
pub fn import_folder(
    window: tauri::Window,
    state: State<'_, DbState>,
    project_id: String,
    folder_path: String,
    excluded_subfolders: Option<Vec<String>>,
) -> Result<Vec<Asset>, String> {
    // 1. Get project path in a scoped block to avoid holding the lock
    let (_project_name, project_root_path) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let mut proj_stmt = conn.prepare("SELECT name, path FROM projects WHERE id = ?").map_err(|e| e.to_string())?;
        let mut proj_rows = proj_stmt.query_map(params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;

        match proj_rows.next() {
            Some(res) => res.map_err(|e| e.to_string())?,
            None => return Err("Project not found".to_string()),
        }
    };

    let source_dir = Path::new(&folder_path);
    if !source_dir.exists() || !source_dir.is_dir() {
        return Err("Source path is not a valid directory".to_string());
    }

    let _ = window.emit("ai-organize-log", "Scanning local directories recursively...".to_string());

    let excluded_subfolders = excluded_subfolders.unwrap_or_default();
    let excluded_roots: Vec<PathBuf> = excluded_subfolders
        .iter()
        .filter(|p| !p.trim().is_empty())
        .map(|p| PathBuf::from(p.replace('\\', "/")))
        .collect();

    fn relative_path(root: &Path, path: &Path) -> Option<PathBuf> {
        path.strip_prefix(root).ok().map(|p| PathBuf::from(p.to_string_lossy().replace('\\', "/")))
    }

    fn is_excluded(root: &Path, dir: &Path, excluded_roots: &[PathBuf]) -> bool {
        if excluded_roots.is_empty() {
            return false;
        }
        let Some(rel) = relative_path(root, dir) else {
            return false;
        };
        excluded_roots.iter().any(|excluded| rel == *excluded || rel.starts_with(excluded))
    }

    // 2. Scan folder recursively for files
    let mut files_to_import = Vec::new();
    fn scan_dir(root: &Path, dir: &Path, excluded_roots: &[PathBuf], files: &mut Vec<PathBuf>) -> std::io::Result<()> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    if is_excluded(root, &path, excluded_roots) {
                        continue;
                    }
                    scan_dir(root, &path, excluded_roots, files)?;
                } else {
                    files.push(path);
                }
            }
        }
        Ok(())
    }
    scan_dir(source_dir, source_dir, &excluded_roots, &mut files_to_import).map_err(|e| e.to_string())?;

    // Skip files that are already inside the project folder
    let project_path_canonical = Path::new(&project_root_path).canonicalize().unwrap_or_else(|_| Path::new(&project_root_path).to_path_buf());
    files_to_import.retain(|f| {
        let canonical = f.canonicalize().unwrap_or_else(|_| f.clone());
        !canonical.starts_with(&project_path_canonical)
    });

    let mut imported_assets = Vec::new();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let _ = window.emit("ai-organize-log", format!("Found {} files to process.", files_to_import.len()));

    // Limit to 50 files for initial UI responsiveness
    let files_to_process: Vec<PathBuf> = files_to_import.iter().take(50).cloned().collect();

    let mut files_for_ai = Vec::new();
    for file_path in &files_to_process {
        let name = file_path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let (secs, formatted) = get_file_time(file_path);
        files_for_ai.push(FileInfoForAi {
            name,
            path: file_path.clone(),
            created_secs: secs,
            created_str: formatted,
        });
    }

    // Use rule-based classification only — running LLM inference per-file on the
    // command thread blocks the entire Tauri runtime and freezes the app.
    let _ = window.emit("ai-organize-log", format!("Classifying {} files using smart rules...", files_for_ai.len()));
    let processed_classifications = classify_files_with_temporal_propagation(&files_for_ai, &HashMap::new());

    for file_path in &files_to_process {
        let file_name = file_path.file_name().unwrap().to_string_lossy().to_string();
        let extension = file_path.extension().unwrap_or_default().to_string_lossy().to_string().to_lowercase();
        let metadata = fs::metadata(file_path).map_err(|e| e.to_string())?;
        let size = metadata.len() as i64;

        // Retrieve classification & reasoning
        let (category, ai_description) = match processed_classifications.get(&file_name) {
            Some((cat, reasoning)) => (cat.as_str(), reasoning.clone()),
            None => {
                let stem_lower = file_path.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
                let (cat, _) = classify_file_rules(&stem_lower, &extension);
                (cat, format!("Rule-based classification: {} (extension and filename keywords).", cat.replace("_", " ").to_lowercase()))
            }
        };

        // Determine MIME type
        let mime_type = match extension.as_str() {
            "mp4" | "mov" | "mkv" | "avi" | "mxf" | "m4v" | "wmv" => Some("video/mp4".to_string()),
            "mp3" | "wav" | "aac" | "flac" | "ogg" | "m4a" => Some("audio/wav".to_string()),
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" => Some("image/jpeg".to_string()),
            _ => None,
        };

        // Destination: Copy flat to IMPORTS first
        let dest_subfolder = "IMPORTS";
        let category_dir = Path::new(&project_root_path).join(dest_subfolder);
        if !category_dir.exists() {
            let _ = window.emit("ai-organize-log", format!("Workspace: creating directory structure '{}'...", dest_subfolder));
            let _ = fs::create_dir_all(&category_dir);
        }
        let dest_path = category_dir.join(&file_name);

        // Copy file physically
        if file_path.as_path() != dest_path.as_path() {
            let _ = window.emit("ai-organize-log", format!("Workspace: copying file '{}' to '{}'...", file_name, dest_subfolder));
            if let Err(e) = fs::copy(file_path, &dest_path) {
                println!("Failed to copy file {:?}: {}", file_path, e);
                continue; // Skip file if we can't read/write it
            }
        }

        // Generate ID
        let asset_id = uuid::Uuid::new_v4().to_string();

        // ── Duration-based SFX override ──────────────────────────────────
        let actual_duration: Option<f64> = if matches!(extension.as_str(),
            "mp3" | "wav" | "aac" | "flac" | "ogg" | "m4a" | "aiff" | "aif" | "wma"
        ) {
            let ffmpeg_cmd = resolve_ffmpeg();
            let ffprobe_cmd = ffmpeg_cmd.replace("ffmpeg", "ffprobe");
            let probe_result = std::process::Command::new(&ffprobe_cmd)
                .args([
                    "-v", "quiet",
                    "-print_format", "compact=print_section=0:nokey=1:escape=csv",
                    "-show_entries", "format=duration",
                    &dest_path.to_string_lossy(),
                ])
                .creation_flags(0x08000000)
                .output();

            if let Ok(out) = probe_result {
                let s = String::from_utf8_lossy(&out.stdout);
                s.trim().parse::<f64>().ok()
            } else {
                None
            }
        } else {
            None
        };

        // Override: audio < 60s that isn't already VOICEOVER → SFX
        let category = if let Some(dur) = actual_duration {
            if dur < 60.0 && category == "MUSIC" {
                "SFX"
            } else {
                category
            }
        } else {
            category
        };

        let duration = actual_duration.or_else(|| {
            if category == "B_ROLL" || category == "A_ROLL" { Some(0.0) }
            else if category == "AUDIO" || category == "MUSIC" || category == "SFX" || category == "VOICEOVER" { Some(0.0) }
            else { None }
        });

        // Generate content-aware tags from filename keywords
        let mut tags = vec![category.to_string(), extension.clone()];
        let fl = file_name.to_lowercase();
        if fl.contains("interview") || fl.contains("talking") { tags.push("Interview".to_string()); }
        if fl.contains("broll") || fl.contains("b_roll") || fl.contains("b-roll") { tags.push("B-Roll".to_string()); }
        if fl.contains("aroll") || fl.contains("a_roll") || fl.contains("a-roll") { tags.push("A-Roll".to_string()); }
        if fl.contains("vo") || fl.contains("voice") || fl.contains("vocal") || fl.contains("narr") { tags.push("Voiceover".to_string()); }
        if fl.contains("sfx") || fl.contains("sound_effect") || fl.contains("fx") { tags.push("SFX".to_string()); }
        if fl.contains("music") || fl.contains("track") || fl.contains("beat") || fl.contains("bgm") { tags.push("Music".to_string()); }
        if fl.contains("drone") || fl.contains("aerial") { tags.push("Drone".to_string()); }
        if fl.contains("slow") || fl.contains("slo_mo") || fl.contains("slomo") { tags.push("Slow-Mo".to_string()); }
        if fl.contains("raw") || fl.contains("original") { tags.push("Raw".to_string()); }
        if fl.contains("export") || fl.contains("final") || fl.contains("master") { tags.push("Export".to_string()); }
        if fl.contains("thumb") || fl.contains("cover") || fl.contains("poster") { tags.push("Thumbnail".to_string()); }
        if fl.contains("graphic") || fl.contains("overlay") || fl.contains("lower_third") { tags.push("Graphics".to_string()); }

        // Scoped DB transaction to insert the asset and its tags
        {
            let conn = state.0.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO assets (id, project_id, name, original_name, path, size, mime_type, category, duration, thumbnail_path, ai_description, favorite, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?)",
                params![
                    asset_id,
                    project_id,
                    file_name,
                    file_name,
                    dest_path.to_string_lossy().to_string(),
                    size,
                    mime_type,
                    category,
                    duration,
                    ai_description,
                    now
                ],
            ).map_err(|e| e.to_string())?;

            for tag_name in &tags {
                let tag_id = uuid::Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)",
                    params![tag_id, tag_name],
                );
                
                let mut tag_query = conn.prepare("SELECT id FROM tags WHERE name = ?").unwrap();
                if let Ok(real_tag_id) = tag_query.query_row(params![tag_name], |row| row.get::<_, String>(0)) {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?, ?)",
                        params![asset_id, real_tag_id],
                    );
                }
            }
        }

        imported_assets.push(Asset {
            id: asset_id,
            project_id: project_id.clone(),
            name: file_name.clone(),
            original_name: file_name,
            path: dest_path.to_string_lossy().to_string(),
            size,
            mime_type,
            category: category.to_string(),
            duration,
            thumbnail_path: None,
            ai_description: Some(ai_description),
            favorite: false,
            created_at: now.clone(),
            tags,
        });
    }

    // Log Activity with a scoped connection lock
    let log_id = uuid::Uuid::new_v4().to_string();
    if let Ok(conn) = state.0.lock() {
        let _ = conn.execute(
            "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'IMPORT', ?, ?)",
            params![log_id, project_id, format!("Imported {} assets from '{}'", imported_assets.len(), folder_path), now],
        );
    }

    Ok(imported_assets)
}

#[tauri::command]
pub fn list_import_subfolders(folder_path: String) -> Result<Vec<String>, String> {
    let source_dir = Path::new(&folder_path);
    if !source_dir.exists() || !source_dir.is_dir() {
        return Err("Source path is not a valid directory".to_string());
    }

    let mut subfolders = Vec::new();

    fn scan(root: &Path, dir: &Path, subfolders: &mut Vec<String>) -> std::io::Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                if let Ok(rel) = path.strip_prefix(root) {
                    subfolders.push(rel.to_string_lossy().replace('\\', "/"));
                }
                scan(root, &path, subfolders)?;
            }
        }
        Ok(())
    }

    scan(source_dir, source_dir, &mut subfolders).map_err(|e| e.to_string())?;
    subfolders.sort_by_key(|p| p.to_lowercase());
    Ok(subfolders)
}

#[tauri::command]
pub fn preview_import_folder(
    folder_path: String,
    excluded_subfolders: Option<Vec<String>>,
) -> Result<HashMap<String, i64>, String> {
    let source_dir = Path::new(&folder_path);
    if !source_dir.exists() || !source_dir.is_dir() {
        return Err("Source path is not a valid directory".to_string());
    }

    let excluded_subfolders = excluded_subfolders.unwrap_or_default();
    let excluded_roots: Vec<PathBuf> = excluded_subfolders
        .iter()
        .filter(|p| !p.trim().is_empty())
        .map(|p| PathBuf::from(p.replace('\\', "/")))
        .collect();

    fn rel_path(root: &Path, path: &Path) -> Option<PathBuf> {
        path.strip_prefix(root).ok().map(|p| PathBuf::from(p.to_string_lossy().replace('\\', "/")))
    }

    fn excluded(root: &Path, dir: &Path, excluded_roots: &[PathBuf]) -> bool {
        let Some(rel) = rel_path(root, dir) else {
            return false;
        };
        excluded_roots.iter().any(|item| rel == *item || rel.starts_with(item))
    }

    fn scan(root: &Path, dir: &Path, excluded_roots: &[PathBuf], counts: &mut HashMap<String, i64>) -> std::io::Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                if excluded(root, &path, excluded_roots) {
                    *counts.entry("Skipped folders".to_string()).or_insert(0) += 1;
                    continue;
                }
                scan(root, &path, excluded_roots, counts)?;
            } else {
                *counts.entry("Total files".to_string()).or_insert(0) += 1;
                if let Ok(meta) = fs::metadata(&path) {
                    *counts.entry("Total bytes".to_string()).or_insert(0) += meta.len() as i64;
                }
                let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
                let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
                let (category, _) = classify_file_rules(&stem, &ext);
                *counts.entry(category.to_string()).or_insert(0) += 1;
            }
        }
        Ok(())
    }

    let mut counts = HashMap::new();
    scan(source_dir, source_dir, &excluded_roots, &mut counts).map_err(|e| e.to_string())?;
    counts.entry("Skipped folders".to_string()).or_insert(excluded_roots.len() as i64);
    Ok(counts)
}

#[tauri::command]
pub fn rename_assets_batch(
    state: State<'_, DbState>,
    renames: HashMap<String, String>, // Mapping asset_id -> new_name
) -> Result<Vec<Asset>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let updated_assets = Vec::new();

    for (asset_id, new_name) in renames {
        // Retrieve current asset data
        let mut stmt = conn.prepare(
            "SELECT name, path, project_id, category FROM assets WHERE id = ?"
        ).map_err(|e| e.to_string())?;
        
        let asset_data = stmt.query_row(params![asset_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        });

        if let Ok((old_name, old_path_str, project_id, category)) = asset_data {
            let old_path = Path::new(&old_path_str);
            if old_path.exists() {
                let is_in_imports = old_path_str.contains("IMPORTS");

                let parent = if is_in_imports {
                    let subfolder = match category.as_str() {
                        "A_ROLL"        => "MEDIA/A_ROLL",
                        "B_ROLL"        => "MEDIA/B_ROLL",
                        "VOICEOVER"     => "AUDIO/Voiceovers",
                        "SFX"           => "AUDIO/SFX",
                        "AUDIO"         => "AUDIO/Voiceovers",
                        "MUSIC"         => "AUDIO/Music",
                        "GRAPHICS"      => "GRAPHICS/PNGs",
                        "THUMBNAILS"    => "GRAPHICS/Thumbnails",
                        "EXPORTS"       => "EXPORTS/Final",
                        "PROJECT_FILES" => "PROJECT_FILES",
                        _               => "IMPORTS/Client_Files",
                    };
                    
                    // Determine the correct GRAPHICS subfolder based on file extension
                    let subfolder = if category == "GRAPHICS" {
                        let ext = old_path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
                        match ext.as_str() {
                            "ttf" | "otf" | "woff" | "woff2" | "eot" | "fon" | "fnt" => "GRAPHICS/Fonts",
                            "mogrt" | "mogrts" | "aet" | "ffx" | "prfpset" => "GRAPHICS/Motion_Graphics",
                            "lut" | "cube" | "3dl" => "BRANDING/LUTS",
                            _ => subfolder,
                        }
                    } else {
                        subfolder
                    };

                    let project_path: String = conn.query_row(
                        "SELECT path FROM projects WHERE id = ?",
                        params![project_id],
                        |row| row.get(0),
                    ).unwrap_or_default();

                    let dest_dir = Path::new(&project_path).join(subfolder);
                    if !dest_dir.exists() {
                        let _ = fs::create_dir_all(&dest_dir);
                    }
                    dest_dir
                } else {
                    old_path.parent().unwrap().to_path_buf()
                };

                let new_path = parent.join(&new_name);

                // Rename/Move physical file
                if let Err(e) = fs::rename(&old_path, &new_path) {
                    println!("Failed to rename/move file physically: {}", e);
                    continue;
                }

                let new_path_str = new_path.to_string_lossy().to_string();

                // Update SQLite
                let _ = conn.execute(
                    "UPDATE assets SET name = ?, path = ? WHERE id = ?",
                    params![new_name, new_path_str, asset_id],
                );

                // Log Activity
                let log_id = uuid::Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'RENAME', ?, ?)",
                    params![
                        log_id,
                        project_id,
                        format!("Renamed file from '{}' to '{}'", old_name, new_name),
                        now
                    ],
                );
            }
        }
    }

    Ok(updated_assets)
}

#[tauri::command]
pub fn toggle_favorite_asset(state: State<'_, DbState>, asset_id: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    let current_fav: i32 = conn.query_row(
        "SELECT favorite FROM assets WHERE id = ?",
        params![asset_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let new_fav = if current_fav == 1 { 0 } else { 1 };

    conn.execute(
        "UPDATE assets SET favorite = ? WHERE id = ?",
        params![new_fav, asset_id],
    ).map_err(|e| e.to_string())?;

    Ok(new_fav == 1)
}

#[tauri::command]
pub fn get_recent_activity(state: State<'_, DbState>) -> Result<Vec<ActivityLog>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, project_id, action_type, details, created_at 
         FROM activity_logs ORDER BY created_at DESC LIMIT 30"
    ).map_err(|e| e.to_string())?;

    let log_rows = stmt.query_map([], |row| {
        Ok(ActivityLog {
            id: row.get(0)?,
            project_id: row.get(1)?,
            action_type: row.get(2)?,
            details: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut logs = Vec::new();
    for log in log_rows {
        logs.push(log.map_err(|e| e.to_string())?);
    }

    Ok(logs)
}

#[tauri::command]
pub fn get_storage_stats(state: State<'_, DbState>) -> Result<StorageStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    let mut total_size: i64 = 0;
    let mut total_files: i32 = 0;

    let size_res: Result<i64, _> = conn.query_row("SELECT SUM(size) FROM assets", [], |row| row.get(0));
    if let Ok(sz) = size_res {
        total_size = sz;
    }

    let count_res: Result<i32, _> = conn.query_row("SELECT COUNT(*) FROM assets", [], |row| row.get(0));
    if let Ok(ct) = count_res {
        total_files = ct;
    }

    let mut size_by_category = HashMap::new();
    let mut count_by_category = HashMap::new();

    let mut stmt = conn.prepare(
        "SELECT category, SUM(size), COUNT(*) FROM assets GROUP BY category"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i32>(2)?,
        ))
    }).map_err(|e| e.to_string())?;

    for r in rows {
        let (cat, sz, count) = r.map_err(|e| e.to_string())?;
        size_by_category.insert(cat.clone(), sz);
        count_by_category.insert(cat, count);
    }

    Ok(StorageStats {
        total_size,
        total_files,
        size_by_category,
        count_by_category,
    })
}

#[tauri::command]
pub fn open_in_editor(_editor_type: String, file_path: String) -> Result<(), String> {
    // Open in editor attempts to launch the application.
    // In Rust we can use the `open` crate which launches files with default system handlers,
    // or launch Premiere Pro / Resolve if they are registered, or just spawn explorer.
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    // To provide a real implementation, we can open with default application (Resolve/Premiere projects open via association)
    open::that(file_path).map_err(|e| format!("Failed to open file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn reveal_in_explorer(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);

    #[cfg(target_os = "windows")]
    {
        // Normalize to backslashes
        let win_path = file_path.replace("/", "\\");

        if path.exists() {
            // PowerShell handles quoting and spaces correctly for all path types
            // Invoke-Item opens Explorer and selects the file
            let ps_script = format!(
                "Start-Process explorer.exe -ArgumentList '/select,\"{}\"'",
                win_path.replace("'", "''")  // escape single quotes for PS
            );
            std::process::Command::new("powershell")
                .args(&[
                    "-NoProfile",
                    "-NonInteractive",
                    "-WindowStyle", "Hidden",
                    "-Command",
                    &ps_script,
                ])
                .creation_flags(0x08000000)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            // File missing — open parent folder
            let parent = path.parent().unwrap_or(path);
            let parent_str = parent.to_string_lossy().replace("/", "\\");
            std::process::Command::new("explorer")
                .arg(&parent_str)
                .creation_flags(0x08000000)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if path.exists() {
            std::process::Command::new("open")
                .args(&["-R", &file_path])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            let parent = path.parent().unwrap_or(path);
            std::process::Command::new("open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let target = path.parent().unwrap_or(path);
        open::that(target).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_disk_stats(path: String) -> Result<DiskStats, String> {
    let disks = Disks::new_with_refreshed_list();
    let target_path = Path::new(&path);
    
    let mut best_disk: Option<&sysinfo::Disk> = None;
    let mut best_mount_len = 0usize;
    
    for disk in disks.list() {
        let mount = disk.mount_point();
        if target_path.starts_with(mount) {
            let mount_len = mount.to_string_lossy().len();
            if mount_len > best_mount_len {
                best_mount_len = mount_len;
                best_disk = Some(disk);
            }
        }
    }
    
    if best_disk.is_none() {
        best_disk = disks.list().first();
    }
    
    match best_disk {
        Some(disk) => {
            let total = disk.total_space();
            let free = disk.available_space();
            let used = total.saturating_sub(free);
            let label = disk.name().to_string_lossy().to_string();
            let mount = disk.mount_point().to_string_lossy().to_string();
            let kind = format!("{:?}", disk.kind());
            Ok(DiskStats {
                total_bytes: total,
                used_bytes: used,
                free_bytes: free,
                drive_label: if label.is_empty() { mount.clone() } else { label },
                mount_point: mount,
                disk_type: kind,
            })
        }
        None => Err("No disk found".to_string()),
    }
}

#[tauri::command]
pub fn get_all_disk_stats() -> Result<Vec<DiskStats>, String> {
    let disks = Disks::new_with_refreshed_list();
    let mut result = Vec::new();

    for disk in disks.list() {
        let total = disk.total_space();
        // Skip zero-size virtual/system disks
        if total == 0 {
            continue;
        }
        let free = disk.available_space();
        let used = total.saturating_sub(free);
        let label = disk.name().to_string_lossy().to_string();
        let mount = disk.mount_point().to_string_lossy().to_string();
        let kind = format!("{:?}", disk.kind());
        result.push(DiskStats {
            total_bytes: total,
            used_bytes: used,
            free_bytes: free,
            drive_label: if label.is_empty() { mount.clone() } else { label },
            mount_point: mount,
            disk_type: kind,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn pick_folder_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    // This is synchronous blocking — use the blocking variant
    let folder = app.dialog()
        .file()
        .blocking_pick_folder();
    
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
pub fn pick_file_dialog(app: tauri::AppHandle, filter_extensions: Vec<String>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut builder = app.dialog().file();
    if !filter_extensions.is_empty() {
        let exts: Vec<&str> = filter_extensions.iter().map(|s| s.as_str()).collect();
        builder = builder.add_filter("Model Files", &exts);
    }
    let file = builder.blocking_pick_file();
    Ok(file.map(|p| p.to_string()))
}

#[tauri::command]
pub fn delete_project(state: State<'_, DbState>, project_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    
    // Get project name for log
    let name: String = conn.query_row(
        "SELECT name FROM projects WHERE id = ?",
        params![project_id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "Unknown".to_string());
    
    conn.execute("DELETE FROM projects WHERE id = ?", params![project_id])
        .map_err(|e| e.to_string())?;
    
    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, NULL, 'PROJECT_DELETE', ?, ?)",
        params![log_id, format!("Deleted project '{}'", name), now],
    );
    
    Ok(())
}

#[tauri::command]
pub fn delete_client(state: State<'_, DbState>, client_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    
    let name: String = conn.query_row(
        "SELECT name FROM clients WHERE id = ?",
        params![client_id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "Unknown".to_string());
    
    conn.execute("DELETE FROM clients WHERE id = ?", params![client_id])
        .map_err(|e| e.to_string())?;
    
    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, NULL, 'CLIENT_DELETE', ?, ?)",
        params![log_id, format!("Deleted client '{}'", name), now],
    );
    
    Ok(())
}

#[tauri::command]
pub fn organize_folder(
    window: tauri::Window,
    state: State<'_, DbState>,
    project_id: String,
    source_folder: String,
    naming_template: String, // e.g. "{client}_{project}_{category}_{index}"
) -> Result<Vec<Asset>, String> {
    // Get project + client info in a scoped block to avoid holding the lock
    let (_project_name, project_path, _client_name): (String, String, String) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT p.name, p.path, c.name FROM projects p JOIN clients c ON p.client_id = c.id WHERE p.id = ?"
        ).map_err(|e| e.to_string())?;
        stmt.query_row(params![project_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        }).map_err(|_| "Project not found".to_string())?
    };
    
    let source_dir = Path::new(&source_folder);
    if !source_dir.exists() || !source_dir.is_dir() {
        return Err("Source path is not a valid directory".to_string());
    }
    
    let _ = window.emit("ai-organize-log", "Scanning folder structure...".to_string());

    // Scan all files
    let mut files_to_import: Vec<PathBuf> = Vec::new();
    fn scan_dir(dir: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    scan_dir(&path, files)?;
                } else {
                    files.push(path);
                }
            }
        }
        Ok(())
    }
    scan_dir(source_dir, &mut files_to_import).map_err(|e| e.to_string())?;
    
    let mut imported_assets = Vec::new();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let files_to_process: Vec<PathBuf> = files_to_import.iter().take(200).cloned().collect();

    let mut files_for_ai = Vec::new();
    for file_path in &files_to_process {
        let name = file_path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let (secs, formatted) = get_file_time(file_path);
        files_for_ai.push(FileInfoForAi {
            name,
            path: file_path.clone(),
            created_secs: secs,
            created_str: formatted,
        });
    }

    // Use rule-based classification only — running LLM inference per-file on the
    // command thread blocks the entire Tauri runtime and freezes the app.
    let _ = window.emit("ai-organize-log", format!("Classifying {} files using smart rules...", files_for_ai.len()));
    let processed_classifications = classify_files_with_temporal_propagation(&files_for_ai, &HashMap::new());
    
    for file_path in &files_to_process {
        let file_name = file_path.file_name().unwrap().to_string_lossy().to_string();
        let extension = file_path.extension().unwrap_or_default().to_string_lossy().to_string().to_lowercase();
        let metadata = match fs::metadata(file_path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let size = metadata.len() as i64;
        
        let (category, ai_description) = match processed_classifications.get(&file_name) {
            Some((cat, reasoning)) => (cat.as_str(), reasoning.clone()),
            None => {
                let stem_lower = file_path.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
                let (cat, _) = classify_file_rules(&stem_lower, &extension);
                (cat, format!("Rule-based classification: {} (extension and filename keywords).", cat.replace("_", " ").to_lowercase()))
            }
        };

        let mime_type = match extension.as_str() {
            "mp4" | "mov" | "mkv" | "avi" | "mxf" | "m4v" | "wmv" => Some("video/mp4".to_string()),
            "mp3" | "wav" | "aac" | "flac" | "ogg" | "m4a" => Some("audio/wav".to_string()),
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" => Some("image/jpeg".to_string()),
            _ => None,
        };
        
        // Destination: flat under IMPORTS first
        let dest_subfolder = "IMPORTS";
        let category_dir = Path::new(&project_path).join(dest_subfolder);
        if !category_dir.exists() {
            let _ = window.emit("ai-organize-log", format!("Workspace: creating directory structure '{}'...", dest_subfolder));
            let _ = fs::create_dir_all(&category_dir);
        }
        let dest_path = category_dir.join(&file_name);
        
        if file_path.as_path() != dest_path.as_path() {
            let _ = window.emit("ai-organize-log", format!("Workspace: importing file to '{}' as '{}'...", dest_subfolder, file_name));
            if let Err(e) = fs::copy(file_path, &dest_path) {
                println!("Failed to copy {:?}: {}", file_path, e);
                continue;
            }
        }
        
        let asset_id = uuid::Uuid::new_v4().to_string();
        
        let duration = match category {
            "B_ROLL" | "A_ROLL" => Some(0.0_f64),
            "AUDIO" | "VOICEOVER" | "MUSIC" | "SFX" => Some(0.0_f64),
            _ => None,
        };
        
        // Auto-tags — rich keyword-based tags matching the frontend TAG_META system
        let mut tags = vec![category.to_string()];
        let fl = file_name.to_lowercase();
        if fl.contains("interview") || fl.contains("talking") { tags.push("Interview".to_string()); }
        if fl.contains("broll") || fl.contains("b_roll") || fl.contains("b-roll") { tags.push("B-Roll".to_string()); }
        if fl.contains("aroll") || fl.contains("a_roll") || fl.contains("a-roll") { tags.push("A-Roll".to_string()); }
        if fl.contains("vo") || fl.contains("voice") || fl.contains("vocal") || fl.contains("narr") { tags.push("Voiceover".to_string()); }
        if fl.contains("sfx") || fl.contains("sound_effect") || fl.contains("_fx") { tags.push("SFX".to_string()); }
        if fl.contains("music") || fl.contains("track") || fl.contains("beat") || fl.contains("bgm") { tags.push("Music".to_string()); }
        if fl.contains("drone") || fl.contains("aerial") { tags.push("Drone".to_string()); }
        if fl.contains("slow") || fl.contains("slo_mo") || fl.contains("slomo") { tags.push("Slow-Mo".to_string()); }
        if fl.contains("raw") || fl.contains("original") { tags.push("Raw".to_string()); }
        if fl.contains("export") || fl.contains("final") || fl.contains("master") { tags.push("Export".to_string()); }
        if fl.contains("thumb") || fl.contains("cover") || fl.contains("poster") { tags.push("Thumbnail".to_string()); }
        if fl.contains("graphic") || fl.contains("overlay") || fl.contains("lower_third") { tags.push("Graphics".to_string()); }

        // Scoped DB transaction to insert the asset and its tags
        {
            let conn = state.0.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO assets (id, project_id, name, original_name, path, size, mime_type, category, duration, thumbnail_path, ai_description, favorite, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?)",
                params![
                    asset_id, project_id, file_name, file_name,
                    dest_path.to_string_lossy().to_string(),
                    size, mime_type, category, duration, ai_description, now
                ],
            ).map_err(|e| e.to_string())?;
            
            for tag_name in &tags {
                let tag_id = uuid::Uuid::new_v4().to_string();
                let _ = conn.execute("INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)", params![tag_id, tag_name]);
                let mut tag_query = conn.prepare("SELECT id FROM tags WHERE name = ?").unwrap();
                if let Ok(real_tag_id) = tag_query.query_row(params![tag_name], |row| row.get::<_, String>(0)) {
                    let _ = conn.execute("INSERT OR IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?, ?)", params![asset_id, real_tag_id]);
                }
            }
        }
        
        imported_assets.push(Asset {
            id: asset_id,
            project_id: project_id.clone(),
            name: file_name.clone(),
            original_name: file_name,
            path: dest_path.to_string_lossy().to_string(),
            size,
            mime_type,
            category: category.to_string(),
            duration,
            thumbnail_path: None,
            ai_description: Some(ai_description),
            favorite: false,
            created_at: now.clone(),
            tags,
        });
    }
    
    // Log Activity with a scoped connection lock
    let log_id = uuid::Uuid::new_v4().to_string();
    if let Ok(conn) = state.0.lock() {
        let _ = conn.execute(
            "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'ORGANIZE', ?, ?)",
            params![log_id, project_id, format!("Organized {} files from '{}' using template '{}'", imported_assets.len(), source_folder, naming_template), now],
        );
    }
    
    Ok(imported_assets)
}

#[tauri::command]
pub fn generate_thumbnail(
    state: State<'_, DbState>,
    asset_id: String,
    asset_path: String,
    cache_dir: String,
) -> Result<String, String> {
    let cache = Path::new(&cache_dir);
    if !cache.exists() {
        fs::create_dir_all(cache).map_err(|e| e.to_string())?;
    }

    let thumb_path = cache.join(format!("{}.jpg", asset_id));

    // Return cached thumbnail if it already exists
    if thumb_path.exists() {
        return Ok(thumb_path.to_string_lossy().to_string());
    }

    let src = Path::new(&asset_path);
    if !src.exists() {
        return Err(format!("Source file not found: {}", asset_path));
    }

    let ext = src.extension().unwrap_or_default().to_string_lossy().to_lowercase();
    let is_image = matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp");
    let is_video = matches!(ext.as_str(), "mp4" | "mov" | "mkv" | "avi" | "mxf" | "m4v" | "wmv");

    if is_image {
        return Ok(asset_path.clone());
    }

    if is_video {
        let ffmpeg_cmd = resolve_ffmpeg();

        let mut cmd = std::process::Command::new(&ffmpeg_cmd);
        cmd.args([
            "-ss", "00:00:01",
            "-i", &asset_path,
            "-vframes", "1",
            "-vf", "scale=320:-1",
            "-q:v", "3",
            "-y",
            &thumb_path.to_string_lossy(),
        ]);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let ffmpeg_result = cmd.output();

        match ffmpeg_result {
            Ok(output) if output.status.success() => {
                if let Ok(conn) = state.0.lock() {
                    let _ = conn.execute(
                        "UPDATE assets SET thumbnail_path = ? WHERE id = ?",
                        params![thumb_path.to_string_lossy().to_string(), asset_id],
                    );
                }
                return Ok(thumb_path.to_string_lossy().to_string());
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("ffmpeg failed: {}", &stderr[..stderr.len().min(300)]));
            }
            Err(e) => {
                return Err(format!("ffmpeg not available: {}", e));
            }
        }
    }

    Err(format!("Unsupported file type: {}", ext))
}

/// Resolve ffmpeg path: bundled sidecar > PATH
fn resolve_ffmpeg() -> String {
    // Try sidecar next to the executable
    if let Ok(exe) = std::env::current_exe() {
        let sidecar = exe.parent().unwrap_or(Path::new(".")).join("ffmpeg.exe");
        if sidecar.exists() {
            return sidecar.to_string_lossy().to_string();
        }
        // Also check binaries/ subfolder (dev mode)
        let dev_sidecar = exe.parent().unwrap_or(Path::new("."))
            .join("..").join("..").join("..").join("binaries")
            .join("ffmpeg-x86_64-pc-windows-msvc.exe");
        if let Ok(canonical) = dev_sidecar.canonicalize() {
            if canonical.exists() {
                return canonical.to_string_lossy().to_string();
            }
        }
    }
    // Fall back to PATH
    "ffmpeg".to_string()
}

#[tauri::command]
pub fn get_ffmpeg_status() -> Result<String, String> {
    let cmd = resolve_ffmpeg();
    let mut proc = std::process::Command::new(&cmd);
    proc.arg("-version");
    #[cfg(target_os = "windows")]
    proc.creation_flags(0x08000000);
    let result = proc.output();
    match result {
        Ok(output) => {
            let version_line = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("ffmpeg found")
                .to_string();
            Ok(format!("{} ({})", version_line, cmd))
        }
        Err(_) => Err(format!("ffmpeg not found at: {}", cmd)),
    }
}


// ── Helpers ─────────────────────────────────────────────────────────────
fn detect_mime_and_duration(ext: &str) -> (Option<String>, Option<f64>) {
    let lower = ext.to_lowercase();
    match lower.as_str() {
        "mp4" | "mov" | "mkv" | "avi" | "mxf" | "m4v" | "wmv" => (Some("video/mp4".to_string()), Some(0.0)),
        "mp3" | "wav" | "aac" | "flac" | "ogg" | "m4a" => (Some("audio/wav".to_string()), Some(0.0)),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" => (Some("image/jpeg".to_string()), None),
        _ => (None, None),
    }
}

// ── Revisions ───────────────────────────────────────────────────────────
#[tauri::command]
pub fn get_project_revisions(state: State<'_, DbState>, project_id: String) -> Result<Vec<Revision>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.project_id, p.name, c.name, r.version, r.name, r.path,
                COALESCE(r.size, 0), r.mime_type, r.duration, r.thumbnail_path, r.notes, r.created_at
         FROM revisions r
         JOIN projects p ON r.project_id = p.id
         JOIN clients c ON p.client_id = c.id
         WHERE r.project_id = ? ORDER BY r.version DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(Revision {
            id: row.get(0)?,
            project_id: row.get(1)?,
            project_name: Some(row.get::<_, String>(2)?),
            client_name: Some(row.get::<_, String>(3)?),
            version: row.get(4)?,
            name: row.get(5)?,
            path: row.get(6)?,
            size: row.get(7)?,
            mime_type: row.get(8)?,
            duration: row.get(9)?,
            thumbnail_path: row.get(10)?,
            notes: row.get(11)?,
            created_at: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(|e| e.to_string())?); }
    Ok(out)
}

#[tauri::command]
pub fn get_all_revisions(state: State<'_, DbState>) -> Result<Vec<Revision>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.project_id, p.name, c.name, r.version, r.name, r.path,
                COALESCE(r.size, 0), r.mime_type, r.duration, r.thumbnail_path, r.notes, r.created_at
         FROM revisions r
         JOIN projects p ON r.project_id = p.id
         JOIN clients c ON p.client_id = c.id
         ORDER BY r.created_at DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Revision {
            id: row.get(0)?,
            project_id: row.get(1)?,
            project_name: Some(row.get::<_, String>(2)?),
            client_name: Some(row.get::<_, String>(3)?),
            version: row.get(4)?,
            name: row.get(5)?,
            path: row.get(6)?,
            size: row.get(7)?,
            mime_type: row.get(8)?,
            duration: row.get(9)?,
            thumbnail_path: row.get(10)?,
            notes: row.get(11)?,
            created_at: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(|e| e.to_string())?); }
    Ok(out)
}

#[tauri::command]
pub fn add_revision(
    state: State<'_, DbState>,
    project_id: String,
    source_path: String,
    notes: Option<String>,
) -> Result<Revision, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Get project info + next version
    let (project_path, project_name): (String, String) = conn.query_row(
        "SELECT path, name FROM projects WHERE id = ?",
        params![project_id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
    ).map_err(|_| "Project not found".to_string())?;

    let next_version: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM revisions WHERE project_id = ?",
        params![project_id],
        |r| r.get(0),
    ).unwrap_or(1);

    let src = Path::new(&source_path);
    if !src.exists() {
        return Err(format!("Source file not found: {}", source_path));
    }

    let ext = src.extension().unwrap_or_default().to_string_lossy().to_string();
    let metadata = fs::metadata(src).map_err(|e| e.to_string())?;
    let size = metadata.len() as i64;
    let (mime_type, duration) = detect_mime_and_duration(&ext);

    // Build versioned name and copy into REVISIONS folder
    let project_seg = project_name.replace(' ', "_");
    let new_name = format!("{}_v{:03}.{}", project_seg, next_version, ext);
    let revisions_dir = Path::new(&project_path).join("REVISIONS");
    if !revisions_dir.exists() {
        fs::create_dir_all(&revisions_dir).map_err(|e| e.to_string())?;
    }
    let dest_path = revisions_dir.join(&new_name);
    if src != dest_path.as_path() {
        fs::copy(src, &dest_path).map_err(|e| format!("Failed to copy: {}", e))?;
    }

    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO revisions (id, project_id, version, name, path, size, mime_type, duration, thumbnail_path, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
        params![
            id, project_id, next_version, new_name,
            dest_path.to_string_lossy().to_string(),
            size, mime_type, duration, notes, now
        ],
    ).map_err(|e| e.to_string())?;

    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'REVISION_ADD', ?, ?)",
        params![log_id, project_id, format!("Added revision v{:03} '{}'", next_version, new_name), now],
    );

    Ok(Revision {
        id,
        project_id,
        project_name: Some(project_name),
        client_name: None,
        version: next_version,
        name: new_name,
        path: dest_path.to_string_lossy().to_string(),
        size,
        mime_type,
        duration,
        thumbnail_path: None,
        notes,
        created_at: now,
    })
}

#[tauri::command]
pub fn delete_revision(state: State<'_, DbState>, revision_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let path: Option<String> = conn.query_row(
        "SELECT path FROM revisions WHERE id = ?",
        params![revision_id],
        |r| r.get(0),
    ).ok();

    conn.execute("DELETE FROM revisions WHERE id = ?", params![revision_id])
        .map_err(|e| e.to_string())?;

    if let Some(p) = path {
        let _ = fs::remove_file(&p);
    }
    Ok(())
}

// ── Exports ─────────────────────────────────────────────────────────────
#[tauri::command]
pub fn get_project_exports(state: State<'_, DbState>, project_id: String) -> Result<Vec<Export>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT e.id, e.project_id, p.name, c.name, e.name, e.path, e.file_size,
                e.mime_type, e.duration, e.thumbnail_path, e.created_at
         FROM exports e
         JOIN projects p ON e.project_id = p.id
         JOIN clients c ON p.client_id = c.id
         WHERE e.project_id = ? ORDER BY e.created_at DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(Export {
            id: row.get(0)?,
            project_id: row.get(1)?,
            project_name: Some(row.get::<_, String>(2)?),
            client_name: Some(row.get::<_, String>(3)?),
            name: row.get(4)?,
            path: row.get(5)?,
            file_size: row.get(6)?,
            mime_type: row.get(7)?,
            duration: row.get(8)?,
            thumbnail_path: row.get(9)?,
            created_at: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(|e| e.to_string())?); }
    Ok(out)
}

#[tauri::command]
pub fn get_all_exports(state: State<'_, DbState>) -> Result<Vec<Export>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT e.id, e.project_id, p.name, c.name, e.name, e.path, e.file_size,
                e.mime_type, e.duration, e.thumbnail_path, e.created_at
         FROM exports e
         JOIN projects p ON e.project_id = p.id
         JOIN clients c ON p.client_id = c.id
         ORDER BY e.created_at DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Export {
            id: row.get(0)?,
            project_id: row.get(1)?,
            project_name: Some(row.get::<_, String>(2)?),
            client_name: Some(row.get::<_, String>(3)?),
            name: row.get(4)?,
            path: row.get(5)?,
            file_size: row.get(6)?,
            mime_type: row.get(7)?,
            duration: row.get(8)?,
            thumbnail_path: row.get(9)?,
            created_at: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(|e| e.to_string())?); }
    Ok(out)
}

#[tauri::command]
pub fn add_export(
    state: State<'_, DbState>,
    project_id: String,
    source_path: String,
) -> Result<Export, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let (project_path, project_name, project_status): (String, String, String) = conn.query_row(
        "SELECT path, name, status FROM projects WHERE id = ?",
        params![project_id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
    ).map_err(|_| "Project not found".to_string())?;

    let src = Path::new(&source_path);
    if !src.exists() {
        return Err(format!("Source file not found: {}", source_path));
    }
    let file_name = src.file_name().unwrap().to_string_lossy().to_string();
    let ext = src.extension().unwrap_or_default().to_string_lossy().to_string();
    let metadata = fs::metadata(src).map_err(|e| e.to_string())?;
    let size = metadata.len() as i64;
    let (mime_type, duration) = detect_mime_and_duration(&ext);

    let exports_dir = Path::new(&project_path)
        .join("EXPORTS")
        .join(export_subfolder_for_status(&project_status));
    if !exports_dir.exists() {
        fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
    }
    let dest_path = exports_dir.join(&file_name);
    if src != dest_path.as_path() {
        fs::copy(src, &dest_path).map_err(|e| format!("Failed to copy: {}", e))?;
    }

    // Set this export as the project's thumbnail/preview if not set
    let _ = conn.execute(
        "UPDATE projects SET thumbnail_path = COALESCE(thumbnail_path, ?) WHERE id = ?",
        params![dest_path.to_string_lossy().to_string(), project_id],
    );

    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO exports (id, project_id, name, path, file_size, mime_type, duration, thumbnail_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)",
        params![
            id, project_id, file_name,
            dest_path.to_string_lossy().to_string(),
            size, mime_type, duration, now
        ],
    ).map_err(|e| e.to_string())?;

    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'EXPORT_ADD', ?, ?)",
        params![log_id, project_id, format!("Added export '{}'", file_name), now],
    );

    Ok(Export {
        id,
        project_id,
        project_name: Some(project_name),
        client_name: None,
        name: file_name,
        path: dest_path.to_string_lossy().to_string(),
        file_size: size,
        mime_type,
        duration,
        thumbnail_path: None,
        created_at: now,
    })
}

#[tauri::command]
pub fn delete_export(state: State<'_, DbState>, export_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let path: Option<String> = conn.query_row(
        "SELECT path FROM exports WHERE id = ?",
        params![export_id],
        |r| r.get(0),
    ).ok();

    conn.execute("DELETE FROM exports WHERE id = ?", params![export_id])
        .map_err(|e| e.to_string())?;

    if let Some(p) = path {
        let _ = fs::remove_file(&p);
    }
    Ok(())
}

// ── Project thumbnail ───────────────────────────────────────────────────
#[tauri::command]
pub fn set_project_thumbnail(
    state: State<'_, DbState>,
    project_id: String,
    file_path: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE projects SET thumbnail_path = ? WHERE id = ?",
        params![file_path, project_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Archive ─────────────────────────────────────────────────────────────
#[tauri::command]
pub fn archive_project(
    state: State<'_, DbState>,
    project_id: String,
    auto_delete_days: i32,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "UPDATE projects SET archived = 1, archived_at = ?, auto_delete_days = ?, status = 'Archived' WHERE id = ?",
        params![now, auto_delete_days, project_id],
    ).map_err(|e| e.to_string())?;

    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'PROJECT_ARCHIVE', ?, ?)",
        params![log_id, project_id, format!("Archived project (auto-delete in {} days)", auto_delete_days), now],
    );
    Ok(())
}

#[tauri::command]
pub fn unarchive_project(state: State<'_, DbState>, project_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "UPDATE projects SET archived = 0, archived_at = NULL, status = 'Approved' WHERE id = ?",
        params![project_id],
    ).map_err(|e| e.to_string())?;

    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'PROJECT_UNARCHIVE', 'Restored from archive', ?)",
        params![log_id, project_id, now],
    );
    Ok(())
}

#[tauri::command]
pub fn set_archive_policy(
    state: State<'_, DbState>,
    project_id: String,
    auto_delete_days: i32,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE projects SET auto_delete_days = ? WHERE id = ?",
        params![auto_delete_days, project_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_archived_projects(state: State<'_, DbState>) -> Result<Vec<Project>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, client_id, name, path, status, created_at, thumbnail_path,
                COALESCE(archived, 0), archived_at, COALESCE(auto_delete_days, 30), completed_at, deadline, notes
         FROM projects WHERE archived = 1 ORDER BY archived_at DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let archived_int: i32 = row.get(7)?;
        Ok(Project {
            id: row.get(0)?,
            client_id: row.get(1)?,
            name: row.get(2)?,
            path: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
            thumbnail_path: row.get(6)?,
            archived: archived_int == 1,
            archived_at: row.get(8)?,
            auto_delete_days: row.get(9)?,
            completed_at: row.get(10)?,
            deadline: row.get(11)?,
            notes: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows { out.push(r.map_err(|e| e.to_string())?); }
    Ok(out)
}

#[tauri::command]
pub fn update_project_deadline(state: State<'_, DbState>, project_id: String, deadline: Option<String>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE projects SET deadline = ? WHERE id = ?",
        params![deadline, project_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn purge_expired_archives(state: State<'_, DbState>, dry_run: bool) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now_ts = chrono::Local::now();

    let mut stmt = conn.prepare(
        "SELECT id, name, path, archived_at, COALESCE(auto_delete_days, 30) FROM projects WHERE archived = 1 AND auto_delete_days > 0"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, i32>(4)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut purged = Vec::new();
    for r in rows {
        let (id, name, _path, archived_at_opt, days) = r.map_err(|e| e.to_string())?;
        let Some(archived_at) = archived_at_opt else { continue; };
        let archived = chrono::NaiveDateTime::parse_from_str(&archived_at, "%Y-%m-%d %H:%M:%S")
            .ok()
            .and_then(|dt| chrono::Local.from_local_datetime(&dt).single());
        let Some(archived) = archived else { continue; };

        let elapsed = (now_ts - archived).num_days();
        if elapsed >= days as i64 {
            purged.push(format!("{} ({})", name, id));
            if !dry_run {
                let _ = conn.execute("DELETE FROM projects WHERE id = ?", params![id]);
                let log_id = uuid::Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, NULL, 'PROJECT_PURGE', ?, ?)",
                    params![log_id, format!("Purged expired archive '{}'", name), now_ts.format("%Y-%m-%d %H:%M:%S").to_string()],
                );
            }
        }
    }
    Ok(purged)
}

// ── Asset management ─────────────────────────────────────────────────────

/// Delete an asset record from DB and optionally remove the file from disk
#[tauri::command]
pub fn delete_asset(state: State<'_, DbState>, asset_id: String, delete_file: bool) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Get path + project_id before deleting
    let (path, project_id, name): (String, String, String) = conn.query_row(
        "SELECT path, project_id, name FROM assets WHERE id = ?",
        params![asset_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|e| e.to_string())?;

    // Remove from DB (cascades asset_tags)
    conn.execute("DELETE FROM assets WHERE id = ?", params![asset_id])
        .map_err(|e| e.to_string())?;

    // Optionally delete physical file
    if delete_file {
        let _ = fs::remove_file(&path);
    }

    // Log
    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'ASSET_DELETE', ?, ?)",
        params![log_id, project_id, format!("Deleted asset '{}'", name), now],
    );

    Ok(())
}

/// Re-categorize an asset and move its file to the correct subfolder
#[tauri::command]
pub fn update_asset_category(
    state: State<'_, DbState>,
    asset_id: String,
    new_category: String,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Get current asset info
    let (old_path, project_id, name, old_category): (String, String, String, String) = conn.query_row(
        "SELECT path, project_id, name, category FROM assets WHERE id = ?",
        params![asset_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).map_err(|e| e.to_string())?;

    // Get project root path
    let project_path: String = conn.query_row(
        "SELECT path FROM projects WHERE id = ?",
        params![project_id],
        |row| row.get(0),
    ).map_err(|_| "Project not found".to_string())?;

    // Map category to subfolder path
    let subfolder = match new_category.as_str() {
        "A_ROLL"        => "MEDIA/A_ROLL",
        "B_ROLL"        => "MEDIA/B_ROLL",
        "VOICEOVER"     => "AUDIO/Voiceovers",
        "SFX"           => "AUDIO/SFX",
        "AUDIO"         => "AUDIO/Voiceovers",
        "MUSIC"         => "AUDIO/Music",
        "GRAPHICS"      => "GRAPHICS/PNGs",
        "THUMBNAILS"    => "GRAPHICS/Thumbnails",
        "EXPORTS"       => "EXPORTS/Final",
        "PROJECT_FILES" => "PROJECT_FILES",
        _               => "IMPORTS/Client_Files",
    };

    // Determine the correct GRAPHICS subfolder based on file extension
    let subfolder = if new_category == "GRAPHICS" {
        match Path::new(&old_path).extension().unwrap_or_default().to_string_lossy().to_lowercase().as_str() {
            "ttf" | "otf" | "woff" | "woff2" | "eot" | "fon" | "fnt" => "GRAPHICS/Fonts",
            "mogrt" | "mogrts" | "aet" | "ffx" | "prfpset" => "GRAPHICS/Motion_Graphics",
            "lut" | "cube" | "3dl" => "BRANDING/LUTS",
            _ => subfolder,
        }
    } else {
        subfolder
    };

    let dest_dir = Path::new(&project_path).join(subfolder);
    if !dest_dir.exists() {
        fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    }

    let file_name = Path::new(&old_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let new_path = dest_dir.join(&file_name);
    let new_path_str = new_path.to_string_lossy().to_string();

    // Move file if it exists and destination is different
    let old_file = Path::new(&old_path);
    if old_file.exists() && old_path != new_path_str {
        fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to move file: {}", e))?;
    }

    // Update DB
    conn.execute(
        "UPDATE assets SET category = ?, path = ? WHERE id = ?",
        params![new_category, new_path_str, asset_id],
    ).map_err(|e| e.to_string())?;

    // Log
    let log_id = uuid::Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO activity_logs (id, project_id, action_type, details, created_at) VALUES (?, ?, 'RECATEGORIZE', ?, ?)",
        params![log_id, project_id, format!("Moved '{}' from {} to {}", name, old_category, new_category), now],
    );

    Ok(new_path_str)
}

// ── Native file drag ─────────────────────────────────────────────────────

/// Start a native OS drag operation for a file.
/// This lets users drag assets from VizWall directly into Premiere Pro,
/// DaVinci Resolve, After Effects, Explorer, etc.
#[tauri::command]
pub fn drag_file(window: tauri::Window, file_path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    // Use a transparent 1x1 drag image (the OS will show the file icon)
    // PNG: 1x1 transparent pixel
    let drag_image = drag::Image::Raw(vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, // IEND chunk
        0x42, 0x60, 0x82,
    ]);

    drag::start_drag(
        &window,
        drag::DragItem::Files(vec![path]),
        drag_image,
        |_result, _cursor_pos| {},
        drag::Options::default(),
    ).map_err(|e| format!("Drag failed: {}", e))?;

    Ok(())
}

// ── Cleaning tools ───────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: i64,
    pub files: Vec<DuplicateFile>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct DuplicateFile {
    pub asset_id: String,
    pub name: String,
    pub path: String,
    pub project_id: String,
    pub category: String,
    pub created_at: String,
}

/// Find duplicate assets by comparing file size + first 64KB hash
#[tauri::command]
pub fn find_duplicates(state: State<'_, DbState>) -> Result<Vec<DuplicateGroup>, String> {
    use std::collections::HashMap;
    use std::io::Read;

    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Get all assets with their paths
    let mut stmt = conn.prepare(
        "SELECT id, name, path, project_id, category, size, created_at FROM assets ORDER BY size DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,  // id
            row.get::<_, String>(1)?,  // name
            row.get::<_, String>(2)?,  // path
            row.get::<_, String>(3)?,  // project_id
            row.get::<_, String>(4)?,  // category
            row.get::<_, i64>(5)?,     // size
            row.get::<_, String>(6)?,  // created_at
        ))
    }).map_err(|e| e.to_string())?;

    // Group by size first (fast pre-filter)
    let mut by_size: HashMap<i64, Vec<(String, String, String, String, String, String)>> = HashMap::new();
    for row in rows {
        let (id, name, path, project_id, category, size, created_at) = row.map_err(|e| e.to_string())?;
        by_size.entry(size).or_default().push((id, name, path, project_id, category, created_at));
    }

    let mut groups: Vec<DuplicateGroup> = Vec::new();

    for (size, files) in by_size {
        if files.len() < 2 { continue; }

        // Hash first 64KB of each file to confirm duplicates
        let mut by_hash: HashMap<String, Vec<DuplicateFile>> = HashMap::new();
        for (id, name, path, project_id, category, created_at) in files {
            let file_path = Path::new(&path);
            if !file_path.exists() { continue; }

            let hash = match fs::File::open(file_path) {
                Ok(mut f) => {
                    let mut buf = vec![0u8; 65536.min(size as usize)];
                    let n = f.read(&mut buf).unwrap_or(0);
                    buf.truncate(n);
                    // Simple hash: size + first 64 bytes as hex
                    let prefix: String = buf[..buf.len().min(64)]
                        .iter()
                        .map(|b| format!("{:02x}", b))
                        .collect();
                    format!("{}_{}", size, prefix)
                }
                Err(_) => continue,
            };

            by_hash.entry(hash.clone()).or_default().push(DuplicateFile {
                asset_id: id,
                name,
                path,
                project_id,
                category,
                created_at,
            });
        }

        for (hash, dup_files) in by_hash {
            if dup_files.len() >= 2 {
                groups.push(DuplicateGroup { hash, size, files: dup_files });
            }
        }
    }

    // Sort by size descending (biggest space savings first)
    groups.sort_by(|a, b| b.size.cmp(&a.size));
    Ok(groups)
}

/// Find empty folders inside a project path
#[tauri::command]
pub fn find_empty_folders(project_path: String) -> Result<Vec<String>, String> {
    let root = Path::new(&project_path);
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut empty: Vec<String> = Vec::new();

    fn scan_empty(dir: &Path, empty: &mut Vec<String>) -> bool {
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return false,
        };

        let mut has_content = false;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let child_empty = scan_empty(&path, empty);
                if !child_empty {
                    has_content = true;
                }
            } else {
                has_content = true;
            }
        }

        if !has_content {
            empty.push(dir.to_string_lossy().to_string());
        }
        !has_content
    }

    scan_empty(root, &mut empty);
    // Remove the root itself if it ended up in the list
    empty.retain(|p| p != &project_path);
    empty.sort();
    Ok(empty)
}

/// Delete empty folders
#[tauri::command]
pub fn delete_empty_folders(paths: Vec<String>) -> Result<usize, String> {
    let mut deleted = 0;
    // Sort by depth descending so deepest folders are deleted first
    let mut sorted = paths.clone();
    sorted.sort_by(|a, b| b.len().cmp(&a.len()));

    for path in sorted {
        let p = Path::new(&path);
        if p.exists() && p.is_dir() {
            if let Ok(mut entries) = fs::read_dir(p) {
                if entries.next().is_none() {
                    if fs::remove_dir(p).is_ok() {
                        deleted += 1;
                    }
                }
            }
        }
    }
    Ok(deleted)
}

// ── Rename client / project ───────────────────────────────────────────────

#[tauri::command]
pub fn rename_client(state: State<'_, DbState>, client_id: String, new_name: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let trimmed = new_name.trim().to_string();
    if trimmed.is_empty() { return Err("Name cannot be empty".to_string()); }
    conn.execute("UPDATE clients SET name = ? WHERE id = ?", params![trimmed, client_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn rename_project(state: State<'_, DbState>, project_id: String, new_name: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let trimmed = new_name.trim().to_string();
    if trimmed.is_empty() { return Err("Name cannot be empty".to_string()); }
    conn.execute("UPDATE projects SET name = ? WHERE id = ?", params![trimmed, project_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Workspace settings ───────────────────────────────────────────────────

#[tauri::command]
pub fn get_workspace_path(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let path: String = conn.query_row(
        "SELECT value FROM ai_settings WHERE key = 'workspace_path'",
        [],
        |row| row.get(0),
    ).unwrap_or_default();
    Ok(path)
}

#[tauri::command]
pub fn save_workspace_settings(
    state: State<'_, DbState>,
    workspace_path: String,
    naming_template: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO ai_settings (key, value) VALUES ('workspace_path', ?)",
        params![workspace_path],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO ai_settings (key, value) VALUES ('naming_template', ?)",
        params![naming_template],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_naming_template(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let template: String = conn.query_row(
        "SELECT value FROM ai_settings WHERE key = 'naming_template'",
        [],
        |row| row.get(0),
    ).unwrap_or_else(|_| "{client}_{project}_{category}_{original}_{index}.{ext}".to_string());
    Ok(template)
}

// ── Global Library — single root path ───────────────────────────────────

#[tauri::command]
pub fn get_global_library(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let path: String = conn.query_row(
        "SELECT value FROM ai_settings WHERE key = 'library_path'",
        [],
        |row| row.get(0),
    ).unwrap_or_default();
    Ok(path)
}

#[tauri::command]
pub fn save_global_library(state: State<'_, DbState>, path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO ai_settings (key, value) VALUES ('library_path', ?)",
        params![path],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Live folder scanner (Global Library / no DB) ─────────────────────────
/// Recursively scans a folder and returns Asset-shaped objects.
/// Files are NOT inserted into the database — this is a live view.
/// project_id is set to "GLOBAL_LIBRARY" as a sentinel value.
#[tauri::command]
pub fn scan_folder_assets(folder_path: String) -> Result<Vec<Asset>, String> {
    let root = Path::new(&folder_path);
    if !root.exists() {
        return Err(format!("Folder not found: {}", folder_path));
    }

    let mut assets: Vec<Asset> = Vec::new();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    fn walk(dir: &Path, assets: &mut Vec<Asset>, now: &str) {
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, assets, now);
                continue;
            }
            let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

            // Skip hidden files and system files
            if name.starts_with('.') { continue; }

            let metadata = match fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let size = metadata.len() as i64;

            let (category, mime_type) = match ext.as_str() {
                "mp4" | "mov" | "mkv" | "avi" | "mxf" | "m4v" | "wmv" | "webm" | "ts" | "mp2t" => {
                    let cat = if stem.contains("export") || stem.contains("final") || stem.contains("render") || stem.contains("master") {
                        "EXPORTS"
                    } else if stem.contains("a_roll") || stem.contains("aroll") || stem.contains("interview") || stem.contains("talking") {
                        "A_ROLL"
                    } else {
                        "B_ROLL"
                    };
                    (cat, Some("video/mp4".to_string()))
                }
                "mp3" | "wav" | "aac" | "flac" | "ogg" | "m4a" | "aiff" | "aif" | "wma" => {
                    // Global library has no voiceover — that's per-project only.
                    // Default to SFX; the post-walk duration pass upgrades to MUSIC if >= 60s.
                    // Keyword hints can also force MUSIC classification.
                    let cat = if stem.contains("music") || stem.contains("track") || stem.contains("beat")
                        || stem.contains("bgm") || stem.contains("score") || stem.contains("ost")
                        || stem.contains("theme") || stem.contains("loop") || stem.contains("ambient_music")
                        || stem.contains("soundtrack") || stem.contains("jingle")
                    {
                        "MUSIC"
                    } else {
                        // Default to SFX — duration pass will confirm or upgrade to MUSIC
                        "SFX"
                    };
                    (cat, Some("audio/wav".to_string()))
                }
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tiff" | "tif" | "heic" | "heif" | "svg" | "avif" => {
                    let cat = if stem.contains("thumb") || stem.contains("cover") || stem.contains("poster") || stem.contains("banner") {
                        "THUMBNAILS"
                    } else {
                        "GRAPHICS"
                    };
                    (cat, Some("image/jpeg".to_string()))
                }
                // Motion graphics & templates → GRAPHICS
                "mogrt" | "mogrts" | "aet" | "aepx" | "ffx" | "prfpset" | "jsx" | "jsxbin" => {
                    ("GRAPHICS", Some("application/octet-stream".to_string()))
                }
                // Fonts → GRAPHICS
                "ttf" | "otf" | "woff" | "woff2" | "eot" => {
                    ("GRAPHICS", Some("application/octet-stream".to_string()))
                }
                // LUTs → GRAPHICS
                "cube" | "3dl" | "lut" => {
                    ("GRAPHICS", Some("application/octet-stream".to_string()))
                }
                // Skip non-media files silently
                "txt" | "pdf" | "docx" | "xlsx" | "pptx" | "xml" | "json" | "csv" | "md" => continue,
                "prproj" | "drp" | "aep" | "fcpx" | "capcut" | "veg" | "kdenlive" => continue,
                "lrv" | "thm" | "srt" | "sub" | "vtt" | "ds_store" | "ini" | "db" | "exe" | "dll" => continue,
                _ => continue, // skip unknown types
            };

            let id = format!("lib_{:x}", {
                use std::collections::hash_map::DefaultHasher;
                use std::hash::{Hash, Hasher};
                let mut h = DefaultHasher::new();
                path.to_string_lossy().hash(&mut h);
                h.finish()
            });

            // Build rich tags — no VOICEOVER in global library
            let fl = name.to_lowercase();
            let mut asset_tags = vec![category.to_string()];
            if fl.contains("interview") || fl.contains("talking") { asset_tags.push("Interview".to_string()); }
            if fl.contains("broll") || fl.contains("b_roll") || fl.contains("b-roll") { asset_tags.push("B-Roll".to_string()); }
            if fl.contains("aroll") || fl.contains("a_roll") || fl.contains("a-roll") { asset_tags.push("A-Roll".to_string()); }
            if fl.contains("sfx") || fl.contains("sound_effect") || fl.contains("_fx") { asset_tags.push("SFX".to_string()); }
            if fl.contains("music") || fl.contains("track") || fl.contains("beat") || fl.contains("bgm") { asset_tags.push("Music".to_string()); }
            if fl.contains("drone") || fl.contains("aerial") { asset_tags.push("Drone".to_string()); }
            if fl.contains("slow") || fl.contains("slo_mo") || fl.contains("slomo") { asset_tags.push("Slow-Mo".to_string()); }
            if fl.contains("export") || fl.contains("final") || fl.contains("master") { asset_tags.push("Export".to_string()); }
            if fl.contains("thumb") || fl.contains("cover") || fl.contains("poster") { asset_tags.push("Thumbnail".to_string()); }

            assets.push(Asset {
                id,
                project_id: "GLOBAL_LIBRARY".to_string(),
                name: name.clone(),
                original_name: name,
                path: path.to_string_lossy().to_string(),
                size,
                mime_type,
                category: category.to_string(),
                duration: None,
                thumbnail_path: None,
                ai_description: None,
                favorite: false,
                created_at: now.to_string(),
                tags: asset_tags,
            });
        }
    }

    walk(root, &mut assets, &now);

    // ── Duration-based SFX override ──────────────────────────────────────
    // Any audio file under 60 seconds → SFX, regardless of filename keywords.
    // This runs after the walk so we don't need ffprobe inside the nested fn.
    let ffprobe_cmd = resolve_ffmpeg().replace("ffmpeg", "ffprobe");
    for asset in assets.iter_mut() {
        let is_audio = matches!(
            asset.mime_type.as_deref(),
            Some("audio/wav") | Some("audio/mp3") | Some("audio/aac")
        ) || matches!(
            Path::new(&asset.path).extension().unwrap_or_default().to_string_lossy().to_lowercase().as_str(),
            "mp3" | "wav" | "aac" | "flac" | "ogg" | "m4a" | "aiff" | "aif" | "wma"
        );

        if !is_audio { continue; }
        // No VOICEOVER in global library — all audio gets duration-based SFX check

        // Probe duration
        let probe = std::process::Command::new(&ffprobe_cmd)
            .args([
                "-v", "quiet",
                "-print_format", "compact=print_section=0:nokey=1:escape=csv",
                "-show_entries", "format=duration",
                &asset.path,
            ])
            .creation_flags(0x08000000)
            .output();

        if let Ok(out) = probe {
            let s = String::from_utf8_lossy(&out.stdout);
            if let Ok(dur) = s.trim().parse::<f64>() {
                asset.duration = Some(dur);
                if dur < 60.0 {
                    // Short audio → SFX regardless of filename
                    asset.category = "SFX".to_string();
                    if let Some(first) = asset.tags.first_mut() { *first = "SFX".to_string(); }
                    if !asset.tags.contains(&"SFX".to_string()) { asset.tags.push("SFX".to_string()); }
                    asset.tags.retain(|t| t != "MUSIC");
                } else {
                    // Long audio → MUSIC
                    asset.category = "MUSIC".to_string();
                    if let Some(first) = asset.tags.first_mut() { *first = "MUSIC".to_string(); }
                    if !asset.tags.contains(&"Music".to_string()) { asset.tags.push("Music".to_string()); }
                    asset.tags.retain(|t| t != "SFX");
                }
            }
        }
    }

    // Sort by name for consistent display
    assets.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(assets)
}

// ── Library cache helpers ────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct LibraryCacheEntry {
    folder_path: String,
    folder_mtime: u64,   // folder last-modified unix timestamp
    scanned_at: String,
    assets: Vec<Asset>,
}

fn cache_file_path(folder_path: &str) -> std::path::PathBuf {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    folder_path.hash(&mut h);
    let hash = h.finish();
    // Use %LOCALAPPDATA%\VizWall\cache\ on Windows, /tmp/vizwall/ elsewhere
    let cache_dir = if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA")
            .map(|p| std::path::PathBuf::from(p).join("VizWall").join("cache"))
            .unwrap_or_else(|_| std::env::temp_dir().join("vizwall_cache"))
    } else {
        std::env::temp_dir().join("vizwall_cache")
    };
    let _ = fs::create_dir_all(&cache_dir);
    cache_dir.join(format!("lib_cache_{:x}.json", hash))
}

fn folder_mtime(path: &Path) -> u64 {
    // Walk the folder and find the most recent modification time of any file/dir
    // We use a quick top-level check for speed — only stat the root + immediate children
    let mut latest: u64 = 0;
    if let Ok(meta) = fs::metadata(path) {
        if let Ok(t) = meta.modified() {
            if let Ok(d) = t.duration_since(std::time::SystemTime::UNIX_EPOCH) {
                latest = latest.max(d.as_secs());
            }
        }
    }
    // Check immediate subdirectories too (catches new subfolders)
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten().take(200) {
            if let Ok(meta) = entry.metadata() {
                if let Ok(t) = meta.modified() {
                    if let Ok(d) = t.duration_since(std::time::SystemTime::UNIX_EPOCH) {
                        latest = latest.max(d.as_secs());
                    }
                }
            }
        }
    }
    latest
}

/// Scan a folder and return assets, using a persistent disk cache.
/// Cache is invalidated when the folder's modification time changes.
/// Pass force_refresh=true to bypass the cache and re-scan.
#[tauri::command]
pub fn scan_folder_assets_cached(
    folder_path: String,
    force_refresh: bool,
) -> Result<Vec<Asset>, String> {
    let root = Path::new(&folder_path);
    if !root.exists() {
        return Err(format!("Folder not found: {}", folder_path));
    }

    let cache_path = cache_file_path(&folder_path);
    let current_mtime = folder_mtime(root);

    // Try to load from cache
    if !force_refresh {
        if let Ok(data) = fs::read_to_string(&cache_path) {
            if let Ok(entry) = serde_json::from_str::<LibraryCacheEntry>(&data) {
                if entry.folder_path == folder_path && entry.folder_mtime == current_mtime {
                    // Cache is valid — return immediately
                    return Ok(entry.assets);
                }
            }
        }
    }

    // Cache miss or stale — do a full scan
    let assets = scan_folder_assets(folder_path.clone())?;

    // Save to cache
    let entry = LibraryCacheEntry {
        folder_path: folder_path.clone(),
        folder_mtime: current_mtime,
        scanned_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        assets: assets.clone(),
    };
    if let Ok(json) = serde_json::to_string(&entry) {
        let _ = fs::write(&cache_path, json);
    }

    Ok(assets)
}

/// Clear the library cache for a specific folder (or all if folder_path is empty)
#[tauri::command]
pub fn clear_library_cache(folder_path: String) -> Result<(), String> {
    if folder_path.is_empty() {
        let cache_dir = if cfg!(target_os = "windows") {
            std::env::var("LOCALAPPDATA")
                .map(|p| std::path::PathBuf::from(p).join("VizWall").join("cache"))
                .unwrap_or_else(|_| std::env::temp_dir().join("vizwall_cache"))
        } else {
            std::env::temp_dir().join("vizwall_cache")
        };
        if let Ok(entries) = fs::read_dir(&cache_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("lib_cache_") && name.ends_with(".json") {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    } else {
        let cache_path = cache_file_path(&folder_path);
        let _ = fs::remove_file(cache_path);
    }
    Ok(())
}

// ── Project notes ────────────────────────────────────────────────────────

#[tauri::command]
pub fn update_project_notes(
    state: State<'_, DbState>,
    project_id: String,
    notes: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE projects SET notes = ? WHERE id = ?",
        params![if notes.is_empty() { None::<String> } else { Some(notes) }, project_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Activity heatmap ─────────────────────────────────────────────────────
/// Returns per-day activity counts from activity_logs for the last N days.
/// Also returns summary stats: active days, total events, projects touched,
/// and total asset bytes processed (from IMPORT/ORGANIZE events).
#[tauri::command]
pub fn get_activity_heatmap(
    state: State<'_, DbState>,
    days: i32,
) -> Result<crate::models::ActivityHeatmap, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Build a map of date → count from activity_logs
    let mut stmt = conn.prepare(
        "SELECT substr(created_at, 1, 10) as day, COUNT(*) as cnt
         FROM activity_logs
         WHERE created_at >= date('now', ?)
         GROUP BY day
         ORDER BY day ASC"
    ).map_err(|e| e.to_string())?;

    let offset = format!("-{} days", days);
    let rows = stmt.query_map(params![offset], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
    }).map_err(|e| e.to_string())?;

    let mut day_map: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    let mut total_events = 0i32;
    for r in rows {
        let (day, cnt) = r.map_err(|e| e.to_string())?;
        day_map.insert(day, cnt);
        total_events += cnt;
    }

    // Fill in all days in range (including zeros)
    let mut heatmap_days = Vec::new();
    let today = chrono::Local::now().date_naive();
    for i in (0..days).rev() {
        let d = today - chrono::Duration::days(i as i64);
        let date_str = d.format("%Y-%m-%d").to_string();
        let count = day_map.get(&date_str).copied().unwrap_or(0);
        heatmap_days.push(crate::models::HeatmapDay { date: date_str, count });
    }

    let active_days = heatmap_days.iter().filter(|d| d.count > 0).count() as i32;

    // Count distinct projects touched
    let mut proj_stmt = conn.prepare(
        "SELECT COUNT(DISTINCT project_id) FROM activity_logs
         WHERE created_at >= date('now', ?) AND project_id IS NOT NULL"
    ).map_err(|e| e.to_string())?;
    let projects_touched: i32 = proj_stmt
        .query_row(params![offset], |row| row.get(0))
        .unwrap_or(0);

    // Total asset bytes processed (sum of asset sizes for assets created in range)
    let mut asset_stmt = conn.prepare(
        "SELECT COALESCE(SUM(size), 0) FROM assets WHERE created_at >= date('now', ?)"
    ).map_err(|e| e.to_string())?;
    let assets_processed: i64 = asset_stmt
        .query_row(params![offset], |row| row.get(0))
        .unwrap_or(0);

    Ok(crate::models::ActivityHeatmap {
        days: heatmap_days,
        active_days,
        total_events,
        projects_touched,
        assets_processed,
    })
}

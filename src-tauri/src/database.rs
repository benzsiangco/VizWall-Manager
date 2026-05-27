use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

pub fn init_db(db_path: PathBuf) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let conn = Connection::open(db_path)?;
    conn.execute("PRAGMA foreign_keys = ON;", [])?;

    // ── Tables ──────────────────────────────────────────────────────────
    conn.execute(
        "CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            thumbnail_path TEXT,
            archived INTEGER DEFAULT 0,
            archived_at TEXT,
            auto_delete_days INTEGER DEFAULT 30,
            completed_at TEXT,
            deadline TEXT,
            notes TEXT
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            original_name TEXT NOT NULL,
            path TEXT NOT NULL,
            size INTEGER NOT NULL,
            mime_type TEXT,
            category TEXT NOT NULL,
            duration REAL,
            thumbnail_path TEXT,
            ai_description TEXT,
            favorite INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS asset_tags (
            asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
            tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (asset_id, tag_id)
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS revisions (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            path TEXT NOT NULL,
            size INTEGER DEFAULT 0,
            mime_type TEXT,
            duration REAL,
            thumbnail_path TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS exports (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            mime_type TEXT,
            duration REAL,
            thumbnail_path TEXT,
            created_at TEXT NOT NULL
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS activity_logs (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            action_type TEXT NOT NULL,
            details TEXT NOT NULL,
            created_at TEXT NOT NULL
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS ai_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
        [],
    )?;

    // ── Migrations: add columns if missing on existing dbs ──────────────
    let proj_cols = column_set(&conn, "projects");
    if !proj_cols.contains("thumbnail_path") {
        let _ = conn.execute("ALTER TABLE projects ADD COLUMN thumbnail_path TEXT", []);
    }
    if !proj_cols.contains("archived") {
        let _ = conn.execute("ALTER TABLE projects ADD COLUMN archived INTEGER DEFAULT 0", []);
    }
    if !proj_cols.contains("archived_at") {
        let _ = conn.execute("ALTER TABLE projects ADD COLUMN archived_at TEXT", []);
    }
    if !proj_cols.contains("auto_delete_days") {
        let _ = conn.execute("ALTER TABLE projects ADD COLUMN auto_delete_days INTEGER DEFAULT 30", []);
    }
    if !proj_cols.contains("completed_at") {
        let _ = conn.execute("ALTER TABLE projects ADD COLUMN completed_at TEXT", []);
    }
    if !proj_cols.contains("deadline") {
        let _ = conn.execute("ALTER TABLE projects ADD COLUMN deadline TEXT", []);
    }
    if !proj_cols.contains("notes") {
        let _ = conn.execute("ALTER TABLE projects ADD COLUMN notes TEXT", []);
    }

    let rev_cols = column_set(&conn, "revisions");
    if !rev_cols.contains("name") {
        let _ = conn.execute("ALTER TABLE revisions ADD COLUMN name TEXT NOT NULL DEFAULT ''", []);
    }
    if !rev_cols.contains("size") {
        let _ = conn.execute("ALTER TABLE revisions ADD COLUMN size INTEGER DEFAULT 0", []);
    }
    if !rev_cols.contains("mime_type") {
        let _ = conn.execute("ALTER TABLE revisions ADD COLUMN mime_type TEXT", []);
    }
    if !rev_cols.contains("duration") {
        let _ = conn.execute("ALTER TABLE revisions ADD COLUMN duration REAL", []);
    }
    if !rev_cols.contains("thumbnail_path") {
        let _ = conn.execute("ALTER TABLE revisions ADD COLUMN thumbnail_path TEXT", []);
    }

    let exp_cols = column_set(&conn, "exports");
    if !exp_cols.contains("mime_type") {
        let _ = conn.execute("ALTER TABLE exports ADD COLUMN mime_type TEXT", []);
    }
    if !exp_cols.contains("duration") {
        let _ = conn.execute("ALTER TABLE exports ADD COLUMN duration REAL", []);
    }
    if !exp_cols.contains("thumbnail_path") {
        let _ = conn.execute("ALTER TABLE exports ADD COLUMN thumbnail_path TEXT", []);
    }

    // ── AI settings defaults ────────────────────────────────────────────
    let defaults = [
        ("model_path", ""),
        ("runtime", "llama_cpp_cpu"),
        ("context_size", "2048"),
        ("threads", "4"),
        ("gpu_layers", "0"),
        ("enabled", "false"),
        ("workspace_path", ""),
        ("naming_template", "{client}_{project}_{category}_{original}_{index}.{ext}"),
        ("default_archive_days", "30"),
    ];
    for (k, v) in defaults.iter() {
        conn.execute(
            "INSERT OR IGNORE INTO ai_settings (key, value) VALUES (?, ?)",
            rusqlite::params![k, v],
        )?;
    }

    Ok(conn)
}

fn column_set(conn: &Connection, table: &str) -> std::collections::HashSet<String> {
    let mut set = std::collections::HashSet::new();
    if let Ok(mut stmt) = conn.prepare(&format!("PRAGMA table_info({})", table)) {
        if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(1)) {
            for r in rows.flatten() {
                set.insert(r);
            }
        }
    }
    set
}

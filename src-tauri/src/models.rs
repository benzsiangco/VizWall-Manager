use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Client {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskStats {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub drive_label: String,
    pub mount_point: String,
    pub disk_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiSettings {
    pub model_path: String,
    pub runtime: String,       // "llama_cpp_cpu", "llama_cpp_vulkan", "llama_cpp_cuda"
    pub context_size: u32,
    pub threads: u32,
    pub gpu_layers: u32,
    pub enabled: bool,
    pub workspace_path: String,
    pub naming_template: String,
    pub llama_cli_path: String, // explicit path to llama-cli binary (overrides auto-detect)
}

impl Default for AiSettings {
    fn default() -> Self {
        AiSettings {
            model_path: String::new(),
            runtime: "llama_cpp_cpu".to_string(),
            context_size: 2048,
            threads: 4,
            gpu_layers: 0,
            enabled: false,
            workspace_path: String::new(),
            naming_template: "{client}_{project}_{category}_{original}_{index}.{ext}".to_string(),
            llama_cli_path: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub client_id: String,
    pub name: String,
    pub path: String,
    pub status: String,
    pub created_at: String,
    pub thumbnail_path: Option<String>,
    pub archived: bool,
    pub archived_at: Option<String>,
    pub auto_delete_days: i32,    // -1 = never auto-delete
    pub completed_at: Option<String>,
    pub deadline: Option<String>, // ISO date string "YYYY-MM-DD"
    pub notes: Option<String>,    // free-form project notes
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HeatmapDay {
    pub date: String,   // "YYYY-MM-DD"
    pub count: i32,     // number of activity events on that day
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActivityHeatmap {
    pub days: Vec<HeatmapDay>,
    pub active_days: i32,
    pub total_events: i32,
    pub projects_touched: i32,
    pub assets_processed: i64,  // total asset bytes processed
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Asset {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub original_name: String,
    pub path: String,
    pub size: i64,
    pub mime_type: Option<String>,
    pub category: String, // A_ROLL, B_ROLL, AUDIO, etc.
    pub duration: Option<f64>,
    pub thumbnail_path: Option<String>,
    pub ai_description: Option<String>,
    pub favorite: bool,
    pub created_at: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Revision {
    pub id: String,
    pub project_id: String,
    pub project_name: Option<String>,
    pub client_name: Option<String>,
    pub version: i32,
    pub name: String,
    pub path: String,
    pub size: i64,
    pub mime_type: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail_path: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Export {
    pub id: String,
    pub project_id: String,
    pub project_name: Option<String>,
    pub client_name: Option<String>,
    pub name: String,
    pub path: String,
    pub file_size: i64,
    pub mime_type: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActivityLog {
    pub id: String,
    pub project_id: Option<String>,
    pub action_type: String,
    pub details: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClientWithProjects {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub projects: Vec<Project>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,   // "user" | "assistant" | "system"
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StorageStats {
    pub total_size: i64,
    pub total_files: i32,
    pub size_by_category: std::collections::HashMap<String, i64>,
    pub count_by_category: std::collections::HashMap<String, i32>,
}

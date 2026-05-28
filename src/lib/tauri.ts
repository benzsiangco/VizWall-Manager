import { invoke } from "@tauri-apps/api/core";

// ==========================================
// TypeScript interfaces matching Rust models
// ==========================================
export interface Client {
  id: string;
  name: string;
  created_at: string;
}

export interface Project {
  id: string;
  client_id: string;
  name: string;
  path: string;
  status: string;
  created_at: string;
  thumbnail_path?: string;
  archived: boolean;
  archived_at?: string;
  auto_delete_days: number; // -1 = never
  completed_at?: string;
  deadline?: string; // "YYYY-MM-DD"
  notes?: string;
}

export interface HeatmapDay {
  date: string;   // "YYYY-MM-DD"
  count: number;
}

export interface ActivityHeatmap {
  days: HeatmapDay[];
  active_days: number;
  total_events: number;
  projects_touched: number;
  assets_processed: number; // bytes
}

export interface ClientWithProjects extends Client {
  projects: Project[];
}

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  original_name: string;
  path: string;
  size: number;
  mime_type?: string;
  category: string;
  duration?: number;
  thumbnail_path?: string;
  ai_description?: string;
  favorite: boolean;
  created_at: string;
  tags: string[];
}

export interface Revision {
  id: string;
  project_id: string;
  project_name?: string;
  client_name?: string;
  version: number;
  name: string;
  path: string;
  size: number;
  mime_type?: string;
  duration?: number;
  thumbnail_path?: string;
  notes?: string;
  created_at: string;
}

export interface Export {
  id: string;
  project_id: string;
  project_name?: string;
  client_name?: string;
  name: string;
  path: string;
  file_size: number;
  mime_type?: string;
  duration?: number;
  thumbnail_path?: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  project_id?: string;
  action_type: string;
  details: string;
  created_at: string;
}

export interface StorageStats {
  total_size: number;
  total_files: number;
  size_by_category: Record<string, number>;
  count_by_category: Record<string, number>;
}

export interface DiskStats {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  drive_label: string;
  mount_point: string;
  disk_type: string;
}

export interface AiSettings {
  model_path: string;
  runtime: string;
  context_size: number;
  threads: number;
  gpu_layers: number;
  enabled: boolean;
  workspace_path: string;
  naming_template: string;
  llama_cli_path: string;
}

// ==========================================
// Tauri detection
// ==========================================
export const isTauri = () => {
  return typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
};

// ==========================================
// BROWSER FALLBACK — no seed data, empty state
// ==========================================
class BrowserMockDatabase {
  private clients: Client[] = [];
  private projects: Project[] = [];
  private assets: Asset[] = [];
  private logs: ActivityLog[] = [];
  private revisions: Revision[] = [];
  private exports: Export[] = [];
  private aiSettings: AiSettings = {
    model_path: "",
    runtime: "llama_cpp_cpu",
    context_size: 2048,
    threads: 4,
    gpu_layers: 0,
    enabled: false,
    workspace_path: "",
    naming_template: "{client}_{project}_{category}_{original}_{index}.{ext}",
    llama_cli_path: "",
  };

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      this.clients = JSON.parse(localStorage.getItem("vizwall_clients") || "[]");
      this.projects = JSON.parse(localStorage.getItem("vizwall_projects") || "[]");
      this.assets = JSON.parse(localStorage.getItem("vizwall_assets") || "[]");
      this.logs = JSON.parse(localStorage.getItem("vizwall_logs") || "[]");
      this.revisions = JSON.parse(localStorage.getItem("vizwall_revisions") || "[]");
      this.exports = JSON.parse(localStorage.getItem("vizwall_exports") || "[]");
      const savedAi = localStorage.getItem("vizwall_ai_settings");
      if (savedAi) this.aiSettings = JSON.parse(savedAi);
    } catch (e) {
      console.error("Failed to load mock storage", e);
    }
  }

  private saveToStorage() {
    localStorage.setItem("vizwall_clients", JSON.stringify(this.clients));
    localStorage.setItem("vizwall_projects", JSON.stringify(this.projects));
    localStorage.setItem("vizwall_assets", JSON.stringify(this.assets));
    localStorage.setItem("vizwall_logs", JSON.stringify(this.logs));
    localStorage.setItem("vizwall_revisions", JSON.stringify(this.revisions));
    localStorage.setItem("vizwall_exports", JSON.stringify(this.exports));
    localStorage.setItem("vizwall_ai_settings", JSON.stringify(this.aiSettings));
  }

  getClientsAndProjects(): ClientWithProjects[] {
    return this.clients.map(c => ({
      ...c,
      projects: this.projects.filter(p => p.client_id === c.id && !p.archived)
    }));
  }

  createClient(name: string): Client {
    const client: Client = {
      id: "c_" + Math.random().toString(36).substr(2, 9),
      name,
      created_at: new Date().toISOString().replace("T", " ").substr(0, 19)
    };
    this.clients.push(client);
    this.logs.unshift({
      id: "l_" + Math.random().toString(36).substr(2, 9),
      action_type: "CLIENT_CREATE",
      details: `Created client '${name}'`,
      created_at: client.created_at
    });
    this.saveToStorage();
    return client;
  }

  deleteClient(clientId: string): void {
    const client = this.clients.find(c => c.id === clientId);
    this.clients = this.clients.filter(c => c.id !== clientId);
    this.projects = this.projects.filter(p => p.client_id !== clientId);
    if (client) {
      this.logs.unshift({
        id: "l_" + Math.random().toString(36).substr(2, 9),
        action_type: "CLIENT_DELETE",
        details: `Deleted client '${client.name}'`,
        created_at: new Date().toISOString().replace("T", " ").substr(0, 19)
      });
    }
    this.saveToStorage();
  }

  createProject(clientId: string, name: string, path: string, deadline?: string): Project {
    const project: Project = {
      id: "p_" + Math.random().toString(36).substr(2, 9),
      client_id: clientId,
      name,
      path,
      status: "To Edit",
      created_at: new Date().toISOString().replace("T", " ").substr(0, 19),
      archived: false,
      auto_delete_days: 30,
      deadline,
    };
    this.projects.push(project);
    this.logs.unshift({
      id: "l_" + Math.random().toString(36).substr(2, 9),
      project_id: project.id,
      action_type: "PROJECT_CREATE",
      details: `Created project '${name}' at path '${path}'`,
      created_at: project.created_at
    });
    this.saveToStorage();
    return project;
  }

  setProjectDeadline(projectId: string, deadline: string | null): void {
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) {
      proj.deadline = deadline ?? undefined;
      this.saveToStorage();
    }
  }

  deleteProject(projectId: string): void {
    const proj = this.projects.find(p => p.id === projectId);
    this.projects = this.projects.filter(p => p.id !== projectId);
    this.assets = this.assets.filter(a => a.project_id !== projectId);
    if (proj) {
      this.logs.unshift({
        id: "l_" + Math.random().toString(36).substr(2, 9),
        action_type: "PROJECT_DELETE",
        details: `Deleted project '${proj.name}'`,
        created_at: new Date().toISOString().replace("T", " ").substr(0, 19)
      });
    }
    this.saveToStorage();
  }

  updateProjectStatus(projectId: string, status: string): void {
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) {
      proj.status = status;
      if (["Approved", "Exported", "Delivered"].includes(status) && !proj.completed_at) {
        proj.completed_at = new Date().toISOString().replace("T", " ").substr(0, 19);
      }
      this.logs.unshift({
        id: "l_" + Math.random().toString(36).substr(2, 9),
        project_id: projectId,
        action_type: "PROJECT_UPDATE",
        details: `Updated status to '${status}'`,
        created_at: new Date().toISOString().replace("T", " ").substr(0, 19)
      });
      this.saveToStorage();
    }
  }

  archiveProject(projectId: string): void {
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) {
      proj.archived = true;
      proj.archived_at = new Date().toISOString().replace("T", " ").substr(0, 19);
      this.saveToStorage();
    }
  }

  unarchiveProject(projectId: string): void {
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) {
      proj.archived = false;
      proj.archived_at = undefined;
      this.saveToStorage();
    }
  }

  getArchivedProjects(): (Project & { client_name: string })[] {
    return this.projects
      .filter(p => p.archived)
      .map(p => {
        const client = this.clients.find(c => c.id === p.client_id);
        return { ...p, client_name: client?.name ?? "Unknown" };
      });
  }

  setArchivePolicy(projectId: string, days: number): void {
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) {
      proj.auto_delete_days = days;
      this.saveToStorage();
    }
  }

  getProjectAssets(projectId: string): Asset[] {
    return this.assets.filter(a => a.project_id === projectId);
  }

  importFolder(projectId: string, folderPath: string): Asset[] {
    const now = new Date().toISOString().replace("T", " ").substr(0, 19);
    const proj = this.projects.find(p => p.id === projectId);
    const projName = proj ? proj.name.replace(/\s+/g, "_") : "Project";
    const client = proj ? this.clients.find(c => c.id === proj.client_id) : null;
    const clientName = client ? client.name.replace(/\s+/g, "_") : "Client";

    const mockFiles = [
      { name: "clip_001.mp4", size: 85200000, category: "B_ROLL", type: "video/mp4", duration: 8.5 },
      { name: "clip_002.mp4", size: 92000000, category: "B_ROLL", type: "video/mp4", duration: 6.2 },
      { name: "music_track.wav", size: 36000000, category: "MUSIC", type: "audio/wav", duration: 120.0 },
      { name: "voiceover.mp3", size: 8000000, category: "AUDIO", type: "audio/mp3", duration: 45.0 },
      { name: "graphic_overlay.png", size: 850000, category: "GRAPHICS", type: "image/png" },
      { name: "thumbnail.jpg", size: 450000, category: "THUMBNAILS", type: "image/jpeg" },
      { name: "timeline.prproj", size: 1200000, category: "PROJECT_FILES", type: "application/octet-stream" },
    ];

    const newAssets: Asset[] = mockFiles.map((mf, index) => {
      const extension = mf.name.split(".").pop() || "";
      const assetId = "a_" + Math.random().toString(36).substr(2, 9);
      const stem = mf.name.split(".")[0];
      const renamedName = `${clientName}_${projName}_${mf.category}_${stem}_${String(index + 1).padStart(3, "0")}.${extension}`;
      const path = `${folderPath}/${mf.category}/${renamedName}`;
      const tags = [mf.category, extension.toUpperCase()];

      return {
        id: assetId,
        project_id: projectId,
        name: renamedName,
        original_name: mf.name,
        path,
        size: mf.size,
        mime_type: mf.type,
        category: mf.category,
        duration: mf.duration,
        ai_description: `Scanned from '${folderPath}'. Category: ${mf.category}.`,
        favorite: false,
        created_at: now,
        tags
      };
    });

    this.assets.push(...newAssets);
    this.logs.unshift({
      id: "l_" + Math.random().toString(36).substr(2, 9),
      project_id: projectId,
      action_type: "IMPORT",
      details: `Imported ${newAssets.length} assets from '${folderPath}'`,
      created_at: now
    });
    this.saveToStorage();
    return newAssets;
  }

  renameAssetsBatch(renames: Record<string, string>): Asset[] {
    const updated: Asset[] = [];
    const now = new Date().toISOString().replace("T", " ").substr(0, 19);
    for (const [id, newName] of Object.entries(renames)) {
      const asset = this.assets.find(a => a.id === id);
      if (asset) {
        const oldName = asset.name;
        asset.name = newName;
        const pathParts = asset.path.split("/");
        pathParts[pathParts.length - 1] = newName;
        asset.path = pathParts.join("/");
        this.logs.unshift({
          id: "l_" + Math.random().toString(36).substr(2, 9),
          project_id: asset.project_id,
          action_type: "RENAME",
          details: `Renamed '${oldName}' → '${newName}'`,
          created_at: now
        });
        updated.push(asset);
      }
    }
    this.saveToStorage();
    return updated;
  }

  toggleFavoriteAsset(assetId: string): boolean {
    const asset = this.assets.find(a => a.id === assetId);
    if (asset) {
      asset.favorite = !asset.favorite;
      this.saveToStorage();
      return asset.favorite;
    }
    return false;
  }

  getRecentActivity(): ActivityLog[] {
    return this.logs.slice(0, 30);
  }

  getStorageStats(): StorageStats {
    let total_size = 0;
    let total_files = 0;
    const size_by_category: Record<string, number> = {};
    const count_by_category: Record<string, number> = {};
    this.assets.forEach(a => {
      total_size += a.size;
      total_files += 1;
      size_by_category[a.category] = (size_by_category[a.category] || 0) + a.size;
      count_by_category[a.category] = (count_by_category[a.category] || 0) + 1;
    });
    return { total_size, total_files, size_by_category, count_by_category };
  }

  getDiskStats(_path: string): DiskStats {
    return { total_bytes: 0, used_bytes: 0, free_bytes: 0, drive_label: "N/A (Browser)", mount_point: "/", disk_type: "Unknown" };
  }

  getAiSettings(): AiSettings {
    return { ...this.aiSettings };
  }

  saveAiSettings(settings: AiSettings): void {
    this.aiSettings = { ...settings };
    this.saveToStorage();
  }

  getProjectRevisions(projectId: string): Revision[] {
    return this.revisions.filter(r => r.project_id === projectId);
  }

  getAllRevisions(): Revision[] {
    return [...this.revisions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  addRevision(projectId: string, sourcePath: string, notes?: string): Revision {
    const proj = this.projects.find(p => p.id === projectId);
    const client = proj ? this.clients.find(c => c.id === proj.client_id) : null;
    const existing = this.revisions.filter(r => r.project_id === projectId);
    const version = existing.length + 1;
    const projSeg = (proj?.name ?? "Project").replace(/\s+/g, "_");
    const ext = sourcePath.split(".").pop() ?? "mp4";
    const rev: Revision = {
      id: "r_" + Math.random().toString(36).substr(2, 9),
      project_id: projectId,
      project_name: proj?.name,
      client_name: client?.name,
      version,
      name: `${projSeg}_v${String(version).padStart(3, "0")}.${ext}`,
      path: sourcePath,
      size: 0,
      mime_type: "video/mp4",
      notes,
      created_at: new Date().toISOString().replace("T", " ").substr(0, 19),
    };
    this.revisions.push(rev);
    this.saveToStorage();
    return rev;
  }

  deleteRevision(revisionId: string): void {
    this.revisions = this.revisions.filter(r => r.id !== revisionId);
    this.saveToStorage();
  }

  getProjectExports(projectId: string): Export[] {
    return this.exports.filter(e => e.project_id === projectId);
  }

  getAllExports(): Export[] {
    return [...this.exports].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  addExport(projectId: string, sourcePath: string): Export {
    const proj = this.projects.find(p => p.id === projectId);
    const client = proj ? this.clients.find(c => c.id === proj.client_id) : null;
    const name = sourcePath.split(/[\\/]/).pop() ?? "export.mp4";
    const exp: Export = {
      id: "e_" + Math.random().toString(36).substr(2, 9),
      project_id: projectId,
      project_name: proj?.name,
      client_name: client?.name,
      name,
      path: sourcePath,
      file_size: 0,
      mime_type: "video/mp4",
      created_at: new Date().toISOString().replace("T", " ").substr(0, 19),
    };
    this.exports.push(exp);
    this.saveToStorage();
    return exp;
  }

  deleteExport(exportId: string): void {
    this.exports = this.exports.filter(e => e.id !== exportId);
    this.saveToStorage();
  }
}

const mockDb = new BrowserMockDatabase();

// ==========================================
// CENTRAL API LAYER
// ==========================================
export async function apiGetClientsAndProjects(): Promise<ClientWithProjects[]> {
  if (isTauri()) return invoke<ClientWithProjects[]>("get_clients_and_projects");
  return mockDb.getClientsAndProjects();
}

export async function apiCreateClient(name: string): Promise<Client> {
  if (isTauri()) return invoke<Client>("create_client", { name });
  return mockDb.createClient(name);
}

export async function apiDeleteClient(clientId: string): Promise<void> {
  if (isTauri()) return invoke("delete_client", { clientId });
  mockDb.deleteClient(clientId);
}

export async function apiCreateProject(clientId: string, name: string, path: string, deadline?: string): Promise<Project> {
  if (isTauri()) return invoke<Project>("create_project", { clientId, name, path, deadline });
  return mockDb.createProject(clientId, name, path, deadline);
}

export async function apiDeleteProject(projectId: string): Promise<void> {
  if (isTauri()) return invoke("delete_project", { projectId });
  mockDb.deleteProject(projectId);
}

export async function apiUpdateProjectStatus(projectId: string, status: string): Promise<void> {
  if (isTauri()) return invoke("update_project_status", { projectId, status });
  mockDb.updateProjectStatus(projectId, status);
}

export async function apiUpdateProjectDeadline(projectId: string, deadline: string | null): Promise<void> {
  if (isTauri()) return invoke("update_project_deadline", { projectId, deadline });
  mockDb.setProjectDeadline(projectId, deadline);
}

export async function apiGetProjectAssets(projectId: string): Promise<Asset[]> {
  if (isTauri()) return invoke<Asset[]>("get_project_assets", { projectId });
  return mockDb.getProjectAssets(projectId);
}

export async function apiImportFolder(projectId: string, folderPath: string, excludedSubfolders: string[] = []): Promise<Asset[]> {
  if (isTauri()) return invoke<Asset[]>("import_folder", { projectId, folderPath, excludedSubfolders });
  return mockDb.importFolder(projectId, folderPath);
}

export async function apiListImportSubfolders(folderPath: string): Promise<string[]> {
  if (isTauri()) return invoke<string[]>("list_import_subfolders", { folderPath });
  return [];
}

export async function apiPreviewImportFolder(folderPath: string, excludedSubfolders: string[] = []): Promise<Record<string, number>> {
  if (isTauri()) return invoke<Record<string, number>>("preview_import_folder", { folderPath, excludedSubfolders });
  return { "Total files": 0, "Total bytes": 0, "Skipped folders": excludedSubfolders.length };
}

export async function apiOrganizeFolder(
  projectId: string,
  sourceFolder: string,
  namingTemplate: string
): Promise<Asset[]> {
  if (isTauri()) return invoke<Asset[]>("organize_folder", { projectId, sourceFolder, namingTemplate });
  return mockDb.importFolder(projectId, sourceFolder);
}

export async function apiRenameAssetsBatch(renames: Record<string, string>): Promise<Asset[]> {
  if (isTauri()) return invoke<Asset[]>("rename_assets_batch", { renames });
  return mockDb.renameAssetsBatch(renames);
}

export async function apiToggleFavoriteAsset(assetId: string): Promise<boolean> {
  if (isTauri()) return invoke<boolean>("toggle_favorite_asset", { assetId });
  return mockDb.toggleFavoriteAsset(assetId);
}

export async function apiGetRecentActivity(): Promise<ActivityLog[]> {
  if (isTauri()) return invoke<ActivityLog[]>("get_recent_activity");
  return mockDb.getRecentActivity();
}

export async function apiGetStorageStats(): Promise<StorageStats> {
  if (isTauri()) return invoke<StorageStats>("get_storage_stats");
  return mockDb.getStorageStats();
}

export async function apiGetDiskStats(path: string): Promise<DiskStats> {
  if (isTauri()) return invoke<DiskStats>("get_disk_stats", { path });
  return mockDb.getDiskStats(path);
}

export async function apiGetAllDiskStats(): Promise<DiskStats[]> {
  if (isTauri()) return invoke<DiskStats[]>("get_all_disk_stats");
  return [];
}

// Simple workspace path helpers (replaces AI settings for workspace/naming)
export async function apiGetWorkspacePath(): Promise<string> {
  if (isTauri()) return invoke<string>("get_workspace_path");
  return localStorage.getItem("vizwall_workspace_path") ?? "";
}

export async function apiSaveWorkspacePath(workspacePath: string, namingTemplate: string): Promise<void> {
  if (isTauri()) return invoke("save_workspace_settings", { workspacePath, namingTemplate });
  localStorage.setItem("vizwall_workspace_path", workspacePath);
  localStorage.setItem("vizwall_naming_template", namingTemplate);
}

export async function apiGetNamingTemplate(): Promise<string> {
  if (isTauri()) return invoke<string>("get_naming_template");
  return localStorage.getItem("vizwall_naming_template") ?? "{client}_{project}_{category}_{original}_{index}.{ext}";
}

// ── Global Library — single root path ─────────────────────────────────
export async function apiGetGlobalLibrary(): Promise<string> {
  if (isTauri()) return invoke<string>("get_global_library");
  return localStorage.getItem("vizwall_library_path") ?? "";
}

export async function apiSaveGlobalLibrary(path: string): Promise<void> {
  if (isTauri()) return invoke("save_global_library", { path });
  localStorage.setItem("vizwall_library_path", path);
}

export async function apiScanFolderAssets(folderPath: string, forceRefresh = false): Promise<Asset[]> {
  if (isTauri()) return invoke<Asset[]>("scan_folder_assets_cached", { folderPath, forceRefresh });
  return [];
}

export async function apiClearLibraryCache(folderPath = ""): Promise<void> {
  if (isTauri()) return invoke("clear_library_cache", { folderPath });
}

export async function apiPickFolder(): Promise<string | null> {
  if (isTauri()) return invoke<string | null>("pick_folder_dialog");
  const path = window.prompt("Enter folder path:");
  return path || null;
}

export async function apiPickFile(filterExtensions: string[] = []): Promise<string | null> {
  if (isTauri()) return invoke<string | null>("pick_file_dialog", { filterExtensions });
  const path = window.prompt("Enter file path:");
  return path || null;
}

export async function apiOpenInEditor(editorType: "premiere" | "resolve", filePath: string): Promise<void> {
  if (isTauri()) return invoke("open_in_editor", { editorType, filePath });
  alert(`[Browser] Opening ${filePath} in ${editorType === "premiere" ? "Premiere Pro" : "DaVinci Resolve"}`);
}

export async function apiLaunchApp(editorType: "premiere" | "davinci"): Promise<void> {
  if (isTauri()) return invoke("launch_app", { editorType });
  alert(`[Browser] Launching ${editorType === "premiere" ? "Premiere Pro" : "DaVinci Resolve"}`);
}

export async function apiRevealInExplorer(filePath: string): Promise<void> {
  if (isTauri()) return invoke("reveal_in_explorer", { filePath });
  alert(`[Browser] Reveal in Explorer: ${filePath}`);
}

export async function apiGenerateThumbnail(
  assetId: string,
  assetPath: string,
  cacheDir: string
): Promise<string> {
  if (isTauri()) return invoke<string>("generate_thumbnail", { assetId, assetPath, cacheDir });
  return "";
}

export async function apiGetFfmpegStatus(): Promise<string> {
  if (isTauri()) return invoke<string>("get_ffmpeg_status");
  return "ffmpeg not available in browser";
}

// ── Revisions ──────────────────────────────────────────────────────────
export async function apiGetProjectRevisions(projectId: string): Promise<Revision[]> {
  if (isTauri()) return invoke<Revision[]>("get_project_revisions", { projectId });
  return mockDb.getProjectRevisions(projectId);
}

export async function apiGetAllRevisions(): Promise<Revision[]> {
  if (isTauri()) return invoke<Revision[]>("get_all_revisions");
  return mockDb.getAllRevisions();
}

export async function apiAddRevision(projectId: string, sourcePath: string, notes?: string): Promise<Revision> {
  if (isTauri()) return invoke<Revision>("add_revision", { projectId, sourcePath, notes });
  return mockDb.addRevision(projectId, sourcePath, notes);
}

export async function apiDeleteRevision(revisionId: string): Promise<void> {
  if (isTauri()) return invoke("delete_revision", { revisionId });
  mockDb.deleteRevision(revisionId);
}

// ── Exports ────────────────────────────────────────────────────────────
export async function apiGetProjectExports(projectId: string): Promise<Export[]> {
  if (isTauri()) return invoke<Export[]>("get_project_exports", { projectId });
  return mockDb.getProjectExports(projectId);
}

export async function apiGetAllExports(): Promise<Export[]> {
  if (isTauri()) return invoke<Export[]>("get_all_exports");
  return mockDb.getAllExports();
}

export async function apiAddExport(projectId: string, sourcePath: string): Promise<Export> {
  if (isTauri()) return invoke<Export>("add_export", { projectId, sourcePath });
  return mockDb.addExport(projectId, sourcePath);
}

export async function apiDeleteExport(exportId: string): Promise<void> {
  if (isTauri()) return invoke("delete_export", { exportId });
  mockDb.deleteExport(exportId);
}

// ── Archive ────────────────────────────────────────────────────────────
export async function apiArchiveProject(projectId: string, autoDeleteDays: number = 30): Promise<void> {
  if (isTauri()) return invoke("archive_project", { projectId, autoDeleteDays });
  mockDb.archiveProject(projectId);
}

export async function apiUnarchiveProject(projectId: string): Promise<void> {
  if (isTauri()) return invoke("unarchive_project", { projectId });
  mockDb.unarchiveProject(projectId);
}

export async function apiSetArchivePolicy(projectId: string, autoDeleteDays: number): Promise<void> {
  if (isTauri()) return invoke("set_archive_policy", { projectId, autoDeleteDays });
  mockDb.setArchivePolicy(projectId, autoDeleteDays);
}

export async function apiGetArchivedProjects(): Promise<(Project & { client_name: string })[]> {
  if (isTauri()) return invoke<(Project & { client_name: string })[]>("get_archived_projects");
  return mockDb.getArchivedProjects();
}

export async function apiPurgeExpiredArchives(dryRun: boolean): Promise<string[]> {
  if (isTauri()) return invoke<string[]>("purge_expired_archives", { dryRun });
  return [];
}

export async function apiSetProjectThumbnail(projectId: string, thumbnailPath: string): Promise<void> {
  if (isTauri()) return invoke("set_project_thumbnail", { projectId, thumbnailPath });
}

export async function apiAutoSetProjectThumbnail(projectId: string, cacheDir: string): Promise<string> {
  if (isTauri()) return invoke<string>("auto_set_project_thumbnail", { projectId, cacheDir });
  return "";
}

export async function apiDeleteAsset(assetId: string, deleteFile: boolean): Promise<void> {
  if (isTauri()) return invoke("delete_asset", { assetId, deleteFile });
  // browser mock
}

export async function apiUpdateAssetCategory(assetId: string, newCategory: string): Promise<string> {
  if (isTauri()) return invoke<string>("update_asset_category", { assetId, newCategory });
  return "";
}

export async function apiDragFile(filePath: string): Promise<void> {
  if (isTauri()) return invoke("drag_file", { filePath });
}

// ── Cleaning tools ────────────────────────────────────────────────────────
export interface DuplicateFile {
  asset_id: string;
  name: string;
  path: string;
  project_id: string;
  category: string;
  created_at: string;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: DuplicateFile[];
}

export async function apiFindDuplicates(): Promise<DuplicateGroup[]> {
  if (isTauri()) return invoke<DuplicateGroup[]>("find_duplicates");
  return [];
}

export async function apiFindEmptyFolders(projectPath: string): Promise<string[]> {
  if (isTauri()) return invoke<string[]>("find_empty_folders", { projectPath });
  return [];
}

export async function apiDeleteEmptyFolders(paths: string[]): Promise<number> {
  if (isTauri()) return invoke<number>("delete_empty_folders", { paths });
  return 0;
}

// Convert a local file path to a URL that Tauri's asset protocol can serve
export function assetUrl(filePath: string): string {
  if (!filePath) return "";
  if (isTauri()) {
    const normalized = filePath.replace(/\\/g, "/");
    return `asset://localhost/${encodeURIComponent(normalized)}`;
  }
  return filePath;
}

export async function apiRenameClient(clientId: string, newName: string): Promise<void> {
  if (isTauri()) return invoke("rename_client", { clientId, newName });
  // browser mock
  const clients = JSON.parse(localStorage.getItem("vizwall_clients") || "[]");
  const c = clients.find((x: any) => x.id === clientId);
  if (c) { c.name = newName; localStorage.setItem("vizwall_clients", JSON.stringify(clients)); }
}

export async function apiRenameProject(projectId: string, newName: string): Promise<void> {
  if (isTauri()) return invoke("rename_project", { projectId, newName });
  // browser mock
  const projects = JSON.parse(localStorage.getItem("vizwall_projects") || "[]");
  const p = projects.find((x: any) => x.id === projectId);
  if (p) { p.name = newName; localStorage.setItem("vizwall_projects", JSON.stringify(projects)); }
}

export async function apiUpdateProjectNotes(projectId: string, notes: string): Promise<void> {
  if (isTauri()) return invoke("update_project_notes", { projectId, notes });
  // browser mock
  const projects = JSON.parse(localStorage.getItem("vizwall_projects") || "[]");
  const p = projects.find((x: any) => x.id === projectId);
  if (p) { p.notes = notes; localStorage.setItem("vizwall_projects", JSON.stringify(projects)); }
}

export async function apiGetActivityHeatmap(days = 365): Promise<ActivityHeatmap> {
  if (isTauri()) return invoke<ActivityHeatmap>("get_activity_heatmap", { days });
  // browser mock — return empty
  return { days: [], active_days: 0, total_events: 0, projects_touched: 0, assets_processed: 0 };
}

export async function apiGetAppVersion(): Promise<string> {
  if (isTauri()) return invoke<string>("get_app_version");
  return "1.0.0"; // browser mock
}

export async function apiCheckForUpdates(): Promise<any> {
  if (isTauri()) return invoke<any>("check_for_updates");
  
  // browser mock - return no updates after 1 second delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  return null;
}

export async function apiDownloadAndInstallUpdate(url: string): Promise<string> {
  if (isTauri()) return invoke<string>("download_and_install_update", { url });
  alert("Browser Mock: Downloading installer from " + url);
  return "Success";
}


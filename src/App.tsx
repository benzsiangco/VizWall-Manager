import React, { useEffect, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Workspace } from "./pages/Workspace";
import { Pipeline } from "./pages/Pipeline";
import { Revisions } from "./pages/Revisions";
import { Exports } from "./pages/Exports";
import { ArchivePage } from "./pages/Archive";
import { CleanPage } from "./pages/Clean";
import { Settings } from "./pages/Settings";
import { ImportZone } from "./components/ImportZone";
import { ProgressToasts } from "./components/ProgressToasts";
import { useProjectStore } from "./stores/useProjectStore";
import { useUiStore } from "./stores/useUiStore";
import { useAssetStore } from "./stores/useAssetStore";
import { apiGetNamingTemplate, apiGetWorkspacePath, apiPickFolder, apiPurgeExpiredArchives, apiSaveWorkspacePath } from "./lib/tauri";
import { X, Users, FolderOpen, Mail, Globe, Instagram, Facebook, Music2, ExternalLink } from "lucide-react";

export default function App() {
  const { fetchClientsAndProjects, clients, createClient, createProject } = useProjectStore();
  const { fetchStorageStats } = useAssetStore();
  const {
    activeTab,
    newClientModalOpen,
    setNewClientModalOpen,
    newProjectModalOpen,
    setNewProjectModalOpen,
    aboutModalOpen,
    setAboutModalOpen,
  } = useUiStore();

  const [clientName, setClientName] = useState("");
  const [projectClientId, setProjectClientId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDeadline, setProjectDeadline] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [projectPathMode, setProjectPathMode] = useState<"workspace" | "exact">("workspace");
  const [exactProjectPath, setExactProjectPath] = useState("");
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectSubmitting, setProjectSubmitting] = useState(false);

  useEffect(() => {
    fetchClientsAndProjects();
    fetchStorageStats();
    apiGetWorkspacePath().then((p) => {
      if (p) setWorkspaceRoot(p);
    }).catch(() => {});
    apiPurgeExpiredArchives(false).catch(() => {});
  }, []);

  useEffect(() => {
    if (!newProjectModalOpen) return;

    setProjectError(null);
    apiGetWorkspacePath()
      .then((p) => setWorkspaceRoot(p || ""))
      .catch((e) => setProjectError(String(e)));
  }, [newProjectModalOpen]);

  useEffect(() => {
    if (newProjectModalOpen && !projectClientId && clients.length > 0) {
      setProjectClientId(clients[0].id);
    }
  }, [clients, newProjectModalOpen, projectClientId]);

  const derivedProjectPath = (() => {
    if (projectPathMode === "exact") return exactProjectPath.trim();
    if (!workspaceRoot || !projectName.trim()) return "";
    const selectedClient = clients.find((c) => c.id === projectClientId) ?? clients[0];
    const clientSeg = selectedClient ? selectedClient.name.replace(/\s+/g, "_") : "Client";
    const projSeg = projectName.trim().replace(/\s+/g, "_");
    const sep = workspaceRoot.includes("\\") ? "\\" : "/";
    const root = workspaceRoot.replace(/[\\/]+$/, "");
    return `${root}${sep}${clientSeg}${sep}${projSeg}`;
  })();

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clientName.trim()) {
      await createClient(clientName.trim());
      setClientName("");
      setNewClientModalOpen(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setProjectError(null);
    const clientId = projectClientId || (clients[0] && clients[0].id);
    if (clientId && projectName.trim() && derivedProjectPath) {
      setProjectSubmitting(true);
      const created = await createProject(clientId, projectName.trim(), derivedProjectPath, projectDeadline || undefined);
      setProjectSubmitting(false);
      if (!created) {
        setProjectError(useProjectStore.getState().error || "Failed to create project");
        return;
      }
      setProjectName("");
      setProjectDeadline("");
      setProjectClientId("");
      setExactProjectPath("");
      setProjectPathMode("workspace");
      setNewProjectModalOpen(false);
    } else if (projectPathMode === "workspace" && !workspaceRoot) {
      setProjectError("Choose a workspace folder before creating a project.");
    } else if (projectPathMode === "exact" && !exactProjectPath.trim()) {
      setProjectError("Choose the exact project folder before creating a project.");
    }
  };

  const handlePickProjectFolder = async (mode: "workspace" | "exact") => {
    setProjectError(null);
    try {
      const path = await apiPickFolder();
      if (!path) return;
      if (mode === "workspace") {
        setWorkspaceRoot(path);
        setProjectPathMode("workspace");
        const namingTemplate = await apiGetNamingTemplate().catch(() => "{client}_{project}_{category}_{original}_{index}.{ext}");
        await apiSaveWorkspacePath(path, namingTemplate);
      } else {
        setExactProjectPath(path);
        setProjectPathMode("exact");
      }
    } catch (e) {
      setProjectError(String(e));
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#08070d] text-white font-outfit select-none overflow-hidden relative">
      <div className="absolute top-[-20%] left-[20%] w-[60%] h-[50%] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[40%] bg-blue-900/10 rounded-full blur-[100px] pointer-events-none" />

      <TitleBar
        showSearch={activeTab === "pipeline"}
        searchQuery={pipelineSearch}
        onSearchChange={setPipelineSearch}
        searchPlaceholder="Search projects…"
      />

      <div className="flex-1 flex overflow-hidden z-10 relative">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 bg-[#06050a]/40">
          {activeTab === "dashboard"  && <Dashboard />}
          {activeTab === "workspace"  && <Workspace />}
          {activeTab === "pipeline"   && <Pipeline searchQuery={pipelineSearch} />}
          {activeTab === "revisions"  && <Revisions />}
          {activeTab === "exports"    && <Exports />}
          {activeTab === "archive"    && <ArchivePage />}
          {activeTab === "clean"      && <CleanPage />}
          {activeTab === "settings"   && <Settings />}
        </div>
      </div>

      <ImportZone />
      <ProgressToasts />

      {/* About Modal */}
      {aboutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#0c0a14] rounded-2xl overflow-hidden shadow-2xl border border-white/[0.06]">
            <div className="p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white font-outfit">About VizWall</h3>
              <button onClick={() => setAboutModalOpen(false)} className="p-1 rounded hover:bg-white/[0.06] text-white/40 hover:text-white">
                <X size={14} />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-5">
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] px-4 py-5">
                <img
                  src="/vizwall-logo.png"
                  alt="VizWall"
                  className="w-full max-w-sm h-auto object-contain"
                  style={{ imageRendering: "auto" }}
                />
              </div>

              <div>
                <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold mb-1">Author</p>
                <p className="text-base font-bold text-white font-outfit">Benz Siangco</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { label: "benz@vizwall.site", href: "mailto:benz@vizwall.site", icon: <Mail size={13} /> },
                  { label: "vizwall.site", href: "https://vizwall.site", icon: <Globe size={13} /> },
                  { label: "Instagram @vizwall.site", href: "https://instagram.com/vizwall.site", icon: <Instagram size={13} /> },
                  { label: "Facebook vizwall.site", href: "https://facebook.com/vizwall.site", icon: <Facebook size={13} /> },
                  { label: "X vizwall.site", href: "https://x.com/vizwall.site", icon: <span className="text-[13px] font-bold">X</span> },
                  { label: "TikTok vizwall.site", href: "https://tiktok.com/@vizwall.site", icon: <Music2 size={13} /> },
                ].map(link => (
                  <a
                    key={link.href}
                    href={link.href}
                    target={link.href.startsWith("http") ? "_blank" : undefined}
                    rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                    className="min-w-0 flex items-center gap-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2 text-xs text-white/70 hover:text-white transition-colors"
                  >
                    <span className="text-violet-400 shrink-0">{link.icon}</span>
                    <span className="truncate">{link.label}</span>
                    <ExternalLink size={11} className="ml-auto text-white/20 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Client Modal */}
      {newClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#0c0a14] rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-violet-400" />
                <h3 className="text-sm font-bold text-white font-outfit">New Client</h3>
              </div>
              <button onClick={() => setNewClientModalOpen(false)} className="p-1 rounded hover:bg-white/[0.06] text-white/40 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <form onSubmit={handleCreateClient}>
              <div className="px-5 pb-4 space-y-2">
                <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest font-outfit">Client Name</label>
                <input
                  type="text" required autoFocus
                  value={clientName} onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Nike, Red Bull, Universal"
                  className="w-full bg-white/[0.03] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:bg-white/[0.05] transition-colors"
                />
              </div>
              <div className="px-5 py-4 flex justify-end gap-2 bg-white/[0.01]">
                <button type="button" onClick={() => setNewClientModalOpen(false)} className="px-4 py-2 text-xs text-white/55 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors">Add Client</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Project Modal */}
      {newProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0c0a14] rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen size={14} className="text-violet-400" />
                <h3 className="text-sm font-bold text-white font-outfit">New Project</h3>
              </div>
              <button onClick={() => setNewProjectModalOpen(false)} className="p-1 rounded hover:bg-white/[0.06] text-white/40 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="px-5 pb-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest font-outfit">Client</label>
                  <select value={projectClientId} onChange={(e) => setProjectClientId(e.target.value)}
                    className="w-full bg-white/[0.03] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:bg-white/[0.05] transition-colors">
                    <option value="" disabled>Select Client...</option>
                    {clients.map((c) => <option key={c.id} value={c.id} className="bg-[#0e0c15]">{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest font-outfit">Project Name</label>
                  <input type="text" required value={projectName} onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Summer Campaign"
                    className="w-full bg-white/[0.03] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:bg-white/[0.05] transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest font-outfit">Deadline <span className="text-white/20 normal-case font-normal">(optional)</span></label>
                  <input type="date" value={projectDeadline} onChange={(e) => setProjectDeadline(e.target.value)}
                    className="w-full bg-white/[0.03] rounded-lg px-3 py-2 text-sm text-white/75 focus:outline-none focus:bg-white/[0.05] transition-colors [color-scheme:dark]" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest font-outfit">Folder Path</label>
                    <button
                      type="button"
                      onClick={() => handlePickProjectFolder("workspace")}
                      className="text-[9px] font-bold uppercase tracking-wider text-violet-400 hover:text-violet-300"
                    >
                      Root
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePickProjectFolder("exact")}
                      className="text-[9px] font-bold uppercase tracking-wider text-violet-400 hover:text-violet-300"
                    >
                      Exact Folder
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.03] p-1">
                    {[
                      { id: "workspace", label: "Workspace Root" },
                      { id: "exact", label: "Exact Folder" },
                    ].map(mode => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setProjectPathMode(mode.id as "workspace" | "exact")}
                        className={`rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                          projectPathMode === mode.id ? "bg-violet-600 text-white" : "text-white/40 hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  {derivedProjectPath
                    ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-white/35 font-mono bg-white/[0.02] rounded-lg px-3 py-2 truncate">{derivedProjectPath}</p>
                        <div className="bg-white/[0.02] rounded-lg px-3 py-2 space-y-0.5">
                          <p className="text-[9px] text-white/25 mb-1.5 font-semibold uppercase tracking-wider">Auto-created folders:</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                            {["IMPORTS", "MEDIA/A_ROLL", "MEDIA/B_ROLL", "AUDIO/Voiceovers", "AUDIO/Music", "AUDIO/SFX",
                              "GRAPHICS/PNGs", "GRAPHICS/Thumbnails", "EXPORTS/Final", "EXPORTS/Client_Review",
                              "PROJECT_FILES", "REVISIONS", "BRANDING", "DELIVERABLES"].map(f => (
                              <span key={f} className="text-[9px] text-violet-400/60 font-mono truncate">{f}/</span>
                            ))}
                            <span className="text-[9px] text-white/20 italic col-span-2">+ more…</span>
                          </div>
                        </div>
                      </div>
                    )
                    : (
                      <div className="space-y-2">
                        <p className="text-[10px] text-white/20 italic px-1">
                          {projectPathMode === "exact"
                            ? "Choose the exact project folder"
                            : workspaceRoot ? "Enter project name to preview path" : "Choose a workspace path to create project folders"}
                        </p>
                        {(projectPathMode === "exact" || !workspaceRoot) && (
                          <button
                            type="button"
                            onClick={() => handlePickProjectFolder(projectPathMode)}
                            className="px-3 py-2 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-[10px] font-bold rounded-lg transition-colors font-outfit uppercase flex items-center gap-1.5"
                          >
                            <FolderOpen size={12} /> Browse {projectPathMode === "exact" ? "Project Folder" : "Workspace"}
                          </button>
                        )}
                      </div>
                    )
                  }
                </div>
                {projectError && (
                  <p className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {projectError}
                  </p>
                )}
              </div>
              <div className="px-5 py-4 flex justify-end gap-2 bg-white/[0.01]">
                <button type="button" onClick={() => setNewProjectModalOpen(false)} className="px-4 py-2 text-xs text-white/55 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={projectSubmitting || clients.length === 0 || !derivedProjectPath}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
                  {projectSubmitting ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

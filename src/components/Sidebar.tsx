import React, { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard, FolderClosed, FolderOpen, KanbanSquare,
  ChevronDown, ChevronRight, Plus, Users, Settings,
  HardDrive, FileOutput, GitBranch, Archive, Sparkles,
  Pencil, Trash2, Check, X, Library,
} from "lucide-react";
import { useProjectStore } from "../stores/useProjectStore";
import { useAssetStore } from "../stores/useAssetStore";
import { useUiStore } from "../stores/useUiStore";
import { apiGetGlobalLibrary } from "../lib/tauri";
import { cn } from "../lib/utils";

const STATUS_DOT: Record<string, string> = {
  "In Progress":   "bg-violet-500",
  "Client Review": "bg-blue-500",
  "Revisions":     "bg-amber-500",
  "Approved":      "bg-emerald-500",
  "Exported":      "bg-cyan-500",
  "To Edit":       "bg-slate-500",
};

const STATUS_LABEL: Record<string, string> = {
  "In Progress":   "In Progress",
  "Client Review": "Review",
  "Revisions":     "Revisions",
  "Approved":      "Approved",
  "Exported":      "Exported",
  "To Edit":       "To Edit",
};

function formatBytes(b: number) {
  if (!b) return "0 B";
  const k = 1024;
  const s = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
}

// ── Context menu ──────────────────────────────────────────────────────────
interface CtxMenu {
  x: number;
  y: number;
  type: "client" | "project";
  id: string;
  name: string;
}

const SidebarContextMenu: React.FC<{
  menu: CtxMenu;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  onOpen?: () => void;
}> = ({ menu, onClose, onRename, onDelete, onOpen }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 9999 }}
      className="w-44 bg-[#0e0c15] border border-white/[0.08] rounded-xl shadow-2xl py-1 overflow-hidden"
    >
      {onOpen && (
        <button
          onClick={() => { onOpen(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors text-left"
        >
          <FolderOpen size={12} className="text-violet-400" />
          Open Workspace
        </button>
      )}
      <button
        onClick={() => { onRename(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors text-left"
      >
        <Pencil size={12} className="text-blue-400" />
        Rename
      </button>
      <div className="mx-2 my-1 h-px bg-white/[0.05]" />
      <button
        onClick={() => { onDelete(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/70 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors text-left"
      >
        <Trash2 size={12} className="text-red-400" />
        Delete
      </button>
    </div>
  );
};

// ── Inline rename input ───────────────────────────────────────────────────
const InlineRename: React.FC<{
  initialValue: string;
  onCommit: (val: string) => void;
  onCancel: () => void;
}> = ({ initialValue, onCommit, onCancel }) => {
  const [val, setVal] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const trimmed = val.trim();
    if (trimmed && trimmed !== initialValue) onCommit(trimmed);
    else onCancel();
  };

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancel();
          e.stopPropagation();
        }}
        onBlur={commit}
        onClick={e => e.stopPropagation()}
        className="flex-1 min-w-0 bg-white/[0.06] text-white text-[11px] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
      />
      <button
        onMouseDown={e => { e.preventDefault(); commit(); }}
        className="p-0.5 rounded hover:bg-emerald-500/10 text-emerald-400"
      >
        <Check size={10} />
      </button>
      <button
        onMouseDown={e => { e.preventDefault(); onCancel(); }}
        className="p-0.5 rounded hover:bg-red-500/10 text-red-400"
      >
        <X size={10} />
      </button>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const {
    clients, activeProjectId, setActiveProjectId,
    deleteProject, deleteClient, renameClient, renameProject,
  } = useProjectStore();
  const { fetchAssets, storageStats, assets } = useAssetStore();
  const { activeTab, setActiveTab, setNewClientModalOpen, setNewProjectModalOpen, openLibrary, activeLibraryPath } = useUiStore();

  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [hoveredClient, setHoveredClient] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<CtxMenu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [libraryPath, setLibraryPath] = useState<string>("");

  useEffect(() => {
    apiGetGlobalLibrary().then(p => { if (p) setLibraryPath(p); }).catch(() => {});
  }, [activeTab]);

  const toggleClient = (id: string) =>
    setExpandedClients(prev => ({ ...prev, [id]: !prev[id] }));

  const selectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    fetchAssets(projectId);
    setActiveTab("workspace");
    // Clear library mode when switching to a project
    useUiStore.getState().closeLibrary();
  };

  const handleContextMenu = (e: React.MouseEvent, type: "client" | "project", id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, name });
  };

  const handleRename = () => {
    if (!contextMenu) return;
    setRenamingId(contextMenu.id);
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    const { type, id, name } = contextMenu;
    if (type === "client") {
      if (window.confirm(`Remove client "${name}" and all their projects? Files on disk are not deleted.`))
        await deleteClient(id);
    } else {
      if (window.confirm(`Remove project "${name}" from VizWall? Files on disk are not deleted.`))
        await deleteProject(id);
    }
  };

  const handleOpen = () => {
    if (!contextMenu) return;
    selectProject(contextMenu.id);
  };

  const commitRename = async (id: string, type: "client" | "project", newName: string) => {
    setRenamingId(null);
    if (type === "client") await renameClient(id, newName);
    else await renameProject(id, newName);
  };

  const totalStorageUsed = storageStats?.total_size ?? 0;

  const NAV = [
    { id: "dashboard",  label: "Dashboard",       icon: <LayoutDashboard size={15} /> },
    { id: "pipeline",   label: "Pipeline",        icon: <KanbanSquare size={15} /> },
    { id: "revisions",  label: "Revisions",       icon: <GitBranch size={15} /> },
    { id: "exports",    label: "Exports",         icon: <FileOutput size={15} /> },
    { id: "archive",    label: "Archive",         icon: <Archive size={15} /> },
    { id: "clean",      label: "Clean",           icon: <Sparkles size={15} /> },
  ];

  const isLibraryActive = activeLibraryPath === libraryPath && activeTab === "workspace" && !!libraryPath;

  return (
    <div className="w-56 bg-[#0a0910] flex flex-col shrink-0 select-none">

      {/* Logo */}
      <div className="px-4 py-3 flex items-center">
        <img
          src="/vizwall-logo.png"
          alt="VizWall"
          className="w-full max-w-[160px] h-auto"
          style={{ imageRendering: "auto", display: "block" }}
        />
      </div>

      {/* Nav */}
      <div className="p-2 space-y-0.5">
        <p className="px-3 text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1.5 font-outfit">Workspace</p>
        {NAV.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
              activeTab === item.id && !isLibraryActive
                ? "bg-violet-600/15 text-violet-400"
                : "text-white/50 hover:text-white/85 hover:bg-white/[0.04]"
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        {/* Library button — only shown when a library path is configured */}
        {libraryPath && (
          <button
            onClick={() => openLibrary(libraryPath, "Library")}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
              isLibraryActive
                ? "bg-violet-600/15 text-violet-400"
                : "text-white/50 hover:text-white/85 hover:bg-white/[0.04]"
            )}
          >
            <Library size={15} /> Library
          </button>
        )}
        <button
          onClick={() => setActiveTab("settings")}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
            activeTab === "settings"
              ? "bg-violet-600/15 text-violet-400"
              : "text-white/50 hover:text-white/85 hover:bg-white/[0.04]"
          )}
        >
          <Settings size={15} /> Settings
        </button>
      </div>

      <div className="mx-3 my-2 h-px bg-white/[0.04]" />

      {/* Clients */}
      <div className="flex-1 px-2 overflow-y-auto min-h-0">
        <div className="flex items-center justify-between px-2 mb-1.5 mt-1">
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest font-outfit">Clients</p>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setNewClientModalOpen(true)} className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors" title="New Client">
              <Users size={11} />
            </button>
            <button onClick={() => setNewProjectModalOpen(true)} className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors" title="New Project">
              <Plus size={11} />
            </button>
          </div>
        </div>

        <div className="space-y-0.5 pb-2">
          {clients.map(client => {
            const clientProjects = client.projects;
            const clientAssets = assets.filter(a => clientProjects.some(p => p.id === a.project_id));
            const clientStorage = clientAssets.reduce((sum, a) => sum + a.size, 0);
            const statusCounts = clientProjects.reduce<Record<string, number>>((acc, p) => {
              acc[p.status] = (acc[p.status] ?? 0) + 1;
              return acc;
            }, {});
            const isRenamingClient = renamingId === client.id;

            return (
              <div key={client.id} className="relative">
                <div
                  className="group flex items-center"
                  onMouseEnter={() => setHoveredClient(client.id)}
                  onMouseLeave={() => setHoveredClient(null)}
                >
                  {isRenamingClient ? (
                    <div className="flex-1 flex items-center gap-1 px-2 py-1.5">
                      <InlineRename
                        initialValue={client.name}
                        onCommit={val => commitRename(client.id, "client", val)}
                        onCancel={() => setRenamingId(null)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => toggleClient(client.id)}
                      onContextMenu={e => handleContextMenu(e, "client", client.id, client.name)}
                      className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-white/65 hover:text-white hover:bg-white/[0.04] transition-colors text-left"
                    >
                      {expandedClients[client.id]
                        ? <ChevronDown size={12} className="text-white/25 shrink-0" />
                        : <ChevronRight size={12} className="text-white/25 shrink-0" />}
                      <span className="font-medium truncate">{client.name}</span>
                      <span className="ml-auto text-[9px] text-white/20 font-mono shrink-0">{clientProjects.length}</span>
                    </button>
                  )}
                </div>

                {/* Client hover tooltip */}
                {hoveredClient === client.id && clientProjects.length > 0 && !isRenamingClient && (
                  <div className="absolute left-full top-0 ml-2 z-50 w-52 bg-[#0e0c15] rounded-xl border border-white/[0.08] shadow-2xl p-3 pointer-events-none">
                    <p className="text-xs font-bold text-white font-outfit mb-2">{client.name}</p>
                    <div className="flex items-center justify-between text-[10px] mb-2">
                      <span className="text-white/40 flex items-center gap-1">
                        <FolderOpen size={10} /> {clientProjects.length} project{clientProjects.length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-white/40 flex items-center gap-1">
                        <HardDrive size={10} /> {formatBytes(clientStorage)}
                      </span>
                    </div>
                    {Object.keys(statusCounts).length > 0 && (
                      <div className="space-y-1">
                        {Object.entries(statusCounts).map(([status, count]) => (
                          <div key={status} className="flex items-center gap-1.5 text-[9px]">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[status] ?? "bg-slate-500")} />
                            <span className="text-white/40 flex-1">{STATUS_LABEL[status] ?? status}</span>
                            <span className="text-white/25 font-mono">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1">
                      {clientProjects.slice(0, 3).map(p => (
                        <div key={p.id} className="flex items-center gap-1.5 text-[9px]">
                          <span className={cn("w-1 h-1 rounded-full shrink-0", STATUS_DOT[p.status] ?? "bg-slate-500")} />
                          <span className="text-white/50 truncate">{p.name}</span>
                        </div>
                      ))}
                      {clientProjects.length > 3 && (
                        <p className="text-[9px] text-white/20 italic">+{clientProjects.length - 3} more</p>
                      )}
                    </div>
                  </div>
                )}

                {expandedClients[client.id] && (
                  <div className="ml-4 pl-3 space-y-0.5">
                    {clientProjects.map(project => {
                      const isSelected = activeProjectId === project.id;
                      const dotColor = STATUS_DOT[project.status] ?? "bg-slate-500";
                      const isRenamingProject = renamingId === project.id;

                      return (
                        <div key={project.id} className="group flex items-center">
                          {isRenamingProject ? (
                            <div className="flex-1 flex items-center gap-1 px-2 py-1">
                              <InlineRename
                                initialValue={project.name}
                                onCommit={val => commitRename(project.id, "project", val)}
                                onCancel={() => setRenamingId(null)}
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() => selectProject(project.id)}
                              onContextMenu={e => handleContextMenu(e, "project", project.id, project.name)}
                              className={cn(
                                "flex-1 flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-left transition-colors",
                                isSelected ? "text-violet-400 font-medium bg-violet-500/8" : "text-white/45 hover:text-white/75 hover:bg-white/[0.04]"
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)} />
                              {isSelected ? <FolderOpen size={11} className="shrink-0" /> : <FolderClosed size={11} className="shrink-0" />}
                              <span className="truncate">{project.name}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {clientProjects.length === 0 && (
                      <span className="text-[10px] text-white/20 italic block py-1 pl-2">No projects</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {clients.length === 0 && (
            <div className="px-2 py-4 text-center">
              <p className="text-[10px] text-white/25 mb-2">No clients yet</p>
              <button onClick={() => setNewClientModalOpen(true)} className="text-[10px] text-violet-400 hover:text-violet-300 font-medium">
                + Add first client
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Storage gauge */}
      {totalStorageUsed > 0 && (
        <div className="p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-white/40">
              <HardDrive size={11} className="text-violet-400" />
              <span className="text-[10px] font-medium">Local Drive</span>
            </div>
            <span className="text-[9px] text-white/30 font-mono">{formatBytes(totalStorageUsed)}</span>
          </div>
          <div className="w-full h-1 bg-white/[0.04] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full" style={{ width: "100%" }} />
          </div>
          <p className="text-[9px] text-white/20 font-mono mt-1">{storageStats?.total_files ?? 0} files indexed</p>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <SidebarContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onRename={handleRename}
          onDelete={handleDelete}
          onOpen={contextMenu.type === "project" ? handleOpen : undefined}
        />
      )}
    </div>
  );
};

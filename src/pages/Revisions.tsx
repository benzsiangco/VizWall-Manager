import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  GitBranch, Play, Video, FileText, Plus,
  Trash2, Clock, FolderOpen,
} from "lucide-react";
import { useProjectStore } from "../stores/useProjectStore";
import { useUiStore } from "../stores/useUiStore";
import {
  apiGetAllRevisions, apiAddRevision, apiDeleteRevision,
  apiPickFile, Revision, isTauri,
} from "../lib/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

// ── Revision card with hover-play ────────────────────────────────────────
const RevisionCard: React.FC<{ rev: Revision; onDelete: () => void }> = ({ rev, onDelete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [thumbSrc, setThumbSrc] = useState("");

  const isVideo = rev.mime_type?.startsWith("video/") ?? false;

  useEffect(() => {
    if (!isTauri()) return;
    if (rev.thumbnail_path) setThumbSrc(convertFileSrc(rev.thumbnail_path));
  }, [rev.id]);

  const onEnter = useCallback(() => {
    if (!isVideo || !rev.path || !isTauri()) return;
    timer.current = setTimeout(() => {
      setPlaying(true);
      videoRef.current?.play().catch(() => {});
    }, 350);
  }, [isVideo, rev.path]);

  const onLeave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    setPlaying(false);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const fmtBytes = (b: number) => {
    if (!b) return ""; const k = 1024;
    const s = ["B", "KB", "MB", "GB"]; const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
  };

  return (
    <div
      className="bg-white/[0.02] hover:bg-white/[0.04] rounded-2xl overflow-hidden group transition-colors"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* Thumbnail / preview */}
      <div className="aspect-video relative overflow-hidden bg-gradient-to-br from-violet-900/20 to-blue-900/10">
        {thumbSrc && !playing && (
          <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setThumbSrc("")} />
        )}
        {isVideo && rev.path && isTauri() && (
          <video
            ref={videoRef}
            src={playing ? convertFileSrc(rev.path) : undefined}
            className={cn("absolute inset-0 w-full h-full object-cover transition-opacity", playing ? "opacity-100" : "opacity-0")}
            muted loop playsInline preload="none"
          />
        )}
        {!thumbSrc && !playing && (
          <div className="absolute inset-0 flex items-center justify-center">
            {isVideo ? <Video size={22} className="text-violet-500/30" /> : <FileText size={22} className="text-white/20" />}
          </div>
        )}
        {isVideo && !playing && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <Play size={12} className="text-white fill-white ml-0.5" />
            </div>
          </div>
        )}
        {/* Version badge */}
        <span className="absolute top-2 left-2 bg-violet-600/80 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded-md font-mono">
          v{String(rev.version).padStart(3, "0")}
        </span>
        {rev.duration != null && rev.duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] font-mono text-white/85">
            {fmt(rev.duration)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/85 truncate font-outfit">{rev.name}</p>
            <p className="text-[9px] text-white/35 mt-0.5 truncate">
              {rev.client_name && <span className="text-violet-400/70">{rev.client_name} · </span>}
              {rev.project_name}
            </p>
          </div>
          <button
            onClick={onDelete}
            className="shrink-0 p-1 rounded hover:bg-red-500/10 text-white/15 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={11} />
          </button>
        </div>

        {rev.notes && (
          <p className="text-[10px] text-white/40 italic truncate">{rev.notes}</p>
        )}

        <div className="flex items-center justify-between text-[9px] text-white/25 font-mono pt-1">
          <span className="flex items-center gap-1">
            <Clock size={9} />
            {rev.created_at.split(" ")[0]}
          </span>
          {rev.size > 0 && <span>{fmtBytes(rev.size)}</span>}
        </div>
      </div>
    </div>
  );
};

// ── Main Revisions page ───────────────────────────────────────────────────
export const Revisions: React.FC = () => {
  const { clients, activeProjectId } = useProjectStore();
  const { setActiveTab } = useUiStore();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const allProjects = clients.flatMap(c => c.projects.map(p => ({ ...p, clientName: c.name })));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGetAllRevisions();
      setRevisions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddRevision = async (projectId: string) => {
    setAddingFor(projectId);
    try {
      const file = await apiPickFile(["mp4", "mov", "mkv", "avi", "mxf"]);
      if (file) {
        const notes = window.prompt("Notes for this revision (optional):") ?? undefined;
        await apiAddRevision(projectId, file, notes || undefined);
        await load();
      }
    } finally {
      setAddingFor(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this revision? The file will also be removed from disk.")) return;
    await apiDeleteRevision(id);
    setRevisions(prev => prev.filter(r => r.id !== id));
  };

  const filtered = filterProjectId === "all"
    ? revisions
    : revisions.filter(r => r.project_id === filterProjectId);

  // Group by project
  const grouped = filtered.reduce<Record<string, Revision[]>>((acc, r) => {
    const key = r.project_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-[#09080e]/40 shrink-0 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold font-outfit text-white flex items-center gap-2">
            <GitBranch size={16} className="text-violet-400" /> Revisions
          </h2>
          <p className="text-xs text-white/40 mt-0.5">Versioned outputs per project — {revisions.length} total</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Project filter */}
          <select
            value={filterProjectId}
            onChange={e => setFilterProjectId(e.target.value)}
            className="bg-white/[0.03] text-white/65 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:bg-white/[0.06] transition-colors"
          >
            <option value="all">All Projects</option>
            {allProjects.map(p => (
              <option key={p.id} value={p.id} className="bg-[#0e0c15]">{p.clientName} / {p.name}</option>
            ))}
          </select>

          {/* Add revision for active project */}
          {activeProjectId && (
            <button
              onClick={() => handleAddRevision(activeProjectId)}
              disabled={addingFor !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus size={13} /> Add Revision
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-600/10 flex items-center justify-center mb-4">
              <GitBranch size={24} className="text-violet-400/60" />
            </div>
            <h3 className="text-sm font-semibold text-white/40 mb-1">No revisions yet</h3>
            <p className="text-xs text-white/25 max-w-xs mb-4">
              Add a revision to a project to track versioned outputs. Files are saved as <span className="font-mono text-violet-400/60">ProjectName_v001.mp4</span>
            </p>
            {allProjects.length > 0 && (
              <button
                onClick={() => handleAddRevision(allProjects[0].id)}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition-colors"
              >
                <Plus size={13} /> Add First Revision
              </button>
            )}
            {allProjects.length === 0 && (
              <button
                onClick={() => setActiveTab("pipeline")}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-white/60 text-xs font-semibold rounded-xl transition-colors"
              >
                <FolderOpen size={13} /> Go to Pipeline
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([projectId, revs]) => {
              const proj = allProjects.find(p => p.id === projectId);
              const projLabel = proj ? `${proj.clientName} / ${proj.name}` : revs[0]?.project_name ?? "Unknown Project";
              return (
                <div key={projectId}>
                  {/* Project group header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen size={13} className="text-violet-400/60" />
                      <span className="text-xs font-semibold text-white/60 font-outfit">{projLabel}</span>
                      <span className="text-[9px] text-white/25 font-mono bg-white/[0.03] px-1.5 py-0.5 rounded-md">
                        {revs.length} revision{revs.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <button
                      onClick={() => handleAddRevision(projectId)}
                      disabled={addingFor !== null}
                      className="flex items-center gap-1 text-[10px] text-violet-400/70 hover:text-violet-400 transition-colors"
                    >
                      <Plus size={11} /> Add
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {revs.map(rev => (
                      <RevisionCard key={rev.id} rev={rev} onDelete={() => handleDelete(rev.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

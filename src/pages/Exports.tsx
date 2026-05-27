import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  FileOutput, Play, Video, FileText, Plus,
  Trash2, Clock, FolderOpen, Download,
} from "lucide-react";
import { useProjectStore } from "../stores/useProjectStore";
import { useUiStore } from "../stores/useUiStore";
import {
  apiGetAllExports, apiAddExport, apiDeleteExport,
  apiPickFile, apiRevealInExplorer, Export, isTauri,
} from "../lib/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

// ── Export card with hover-play ───────────────────────────────────────────
const ExportCard: React.FC<{ exp: Export; onDelete: () => void; onReveal: () => void }> = ({ exp, onDelete, onReveal }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [thumbSrc, setThumbSrc] = useState("");

  const isVideo = exp.mime_type?.startsWith("video/") ?? false;

  useEffect(() => {
    if (!isTauri()) return;
    if (exp.thumbnail_path) setThumbSrc(convertFileSrc(exp.thumbnail_path));
  }, [exp.id]);

  const onEnter = useCallback(() => {
    if (!isVideo || !exp.path || !isTauri()) return;
    timer.current = setTimeout(() => {
      setPlaying(true);
      videoRef.current?.play().catch(() => {});
    }, 350);
  }, [isVideo, exp.path]);

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
      <div className="aspect-video relative overflow-hidden bg-gradient-to-br from-cyan-900/20 to-blue-900/10">
        {thumbSrc && !playing && (
          <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setThumbSrc("")} />
        )}
        {isVideo && exp.path && isTauri() && (
          <video
            ref={videoRef}
            src={playing ? convertFileSrc(exp.path) : undefined}
            className={cn("absolute inset-0 w-full h-full object-cover transition-opacity", playing ? "opacity-100" : "opacity-0")}
            muted loop playsInline preload="none"
          />
        )}
        {!thumbSrc && !playing && (
          <div className="absolute inset-0 flex items-center justify-center">
            {isVideo ? <Video size={22} className="text-cyan-500/30" /> : <FileText size={22} className="text-white/20" />}
          </div>
        )}
        {isVideo && !playing && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <Play size={12} className="text-white fill-white ml-0.5" />
            </div>
          </div>
        )}
        {/* Final badge */}
        <span className="absolute top-2 left-2 bg-cyan-600/80 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded-md">
          FINAL
        </span>
        {exp.duration != null && exp.duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] font-mono text-white/85">
            {fmt(exp.duration)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/85 truncate font-outfit">{exp.name}</p>
            <p className="text-[9px] text-white/35 mt-0.5 truncate">
              {exp.client_name && <span className="text-cyan-400/70">{exp.client_name} · </span>}
              {exp.project_name}
            </p>
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={onReveal}
              className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors"
              title="Show in Explorer"
            >
              <Download size={11} />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded hover:bg-red-500/10 text-white/15 hover:text-red-400 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-[9px] text-white/25 font-mono pt-1">
          <span className="flex items-center gap-1">
            <Clock size={9} />
            {exp.created_at.split(" ")[0]}
          </span>
          {exp.file_size > 0 && <span>{fmtBytes(exp.file_size)}</span>}
        </div>
      </div>
    </div>
  );
};

// ── Main Exports page ─────────────────────────────────────────────────────
export const Exports: React.FC = () => {
  const { clients, activeProjectId } = useProjectStore();
  const { setActiveTab } = useUiStore();
  const [exports, setExports] = useState<Export[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [adding, setAdding] = useState(false);

  const allProjects = clients.flatMap(c => c.projects.map(p => ({ ...p, clientName: c.name })));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGetAllExports();
      setExports(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddExport = async (projectId: string) => {
    setAdding(true);
    try {
      const file = await apiPickFile(["mp4", "mov", "mkv", "avi", "mxf"]);
      if (file) {
        await apiAddExport(projectId, file);
        await load();
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this export record? The file on disk will also be deleted.")) return;
    await apiDeleteExport(id);
    setExports(prev => prev.filter(e => e.id !== id));
  };

  const handleReveal = async (path: string) => {
    try { await apiRevealInExplorer(path); } catch (e) { console.error(e); }
  };

  const filtered = filterProjectId === "all"
    ? exports
    : exports.filter(e => e.project_id === filterProjectId);

  // Group by project
  const grouped = filtered.reduce<Record<string, Export[]>>((acc, e) => {
    const key = e.project_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-[#09080e]/40 shrink-0 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold font-outfit text-white flex items-center gap-2">
            <FileOutput size={16} className="text-cyan-400" /> Exports
          </h2>
          <p className="text-xs text-white/40 mt-0.5">Final deliverables across all projects — {exports.length} total</p>
        </div>

        <div className="flex items-center gap-2">
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

          {activeProjectId && (
            <button
              onClick={() => handleAddExport(activeProjectId)}
              disabled={adding}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus size={13} /> Add Export
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-cyan-600/10 flex items-center justify-center mb-4">
              <FileOutput size={24} className="text-cyan-400/60" />
            </div>
            <h3 className="text-sm font-semibold text-white/40 mb-1">No exports yet</h3>
            <p className="text-xs text-white/25 max-w-xs mb-4">
              Register final deliverables here to track what's been sent to clients.
            </p>
            {allProjects.length > 0 && (
              <button
                onClick={() => handleAddExport(allProjects[0].id)}
                className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl transition-colors"
              >
                <Plus size={13} /> Add First Export
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
            {Object.entries(grouped).map(([projectId, exps]) => {
              const proj = allProjects.find(p => p.id === projectId);
              const projLabel = proj ? `${proj.clientName} / ${proj.name}` : exps[0]?.project_name ?? "Unknown Project";
              return (
                <div key={projectId}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen size={13} className="text-cyan-400/60" />
                      <span className="text-xs font-semibold text-white/60 font-outfit">{projLabel}</span>
                      <span className="text-[9px] text-white/25 font-mono bg-white/[0.03] px-1.5 py-0.5 rounded-md">
                        {exps.length} export{exps.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <button
                      onClick={() => handleAddExport(projectId)}
                      disabled={adding}
                      className="flex items-center gap-1 text-[10px] text-cyan-400/70 hover:text-cyan-400 transition-colors"
                    >
                      <Plus size={11} /> Add
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {exps.map(exp => (
                      <ExportCard
                        key={exp.id}
                        exp={exp}
                        onDelete={() => handleDelete(exp.id)}
                        onReveal={() => handleReveal(exp.path)}
                      />
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

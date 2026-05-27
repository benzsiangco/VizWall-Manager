import React, { useEffect, useState, useCallback } from "react";
import {
  Archive, RotateCcw, Trash2, Clock, AlertTriangle,
  FolderOpen, Calendar, Settings2,
} from "lucide-react";
import { useProjectStore } from "../stores/useProjectStore";
import { useUiStore } from "../stores/useUiStore";
import { Project } from "../lib/tauri";
import { cn } from "../lib/utils";

interface ArchivedProject extends Project {
  client_name: string;
}

// ── Days until deletion countdown ────────────────────────────────────────
function daysUntilDelete(archivedAt: string | undefined, autoDeleteDays: number): number | null {
  if (autoDeleteDays === -1 || !archivedAt) return null;
  const archived = new Date(archivedAt.replace(" ", "T"));
  const deleteAt = new Date(archived.getTime() + autoDeleteDays * 86400000);
  const now = new Date();
  return Math.max(0, Math.ceil((deleteAt.getTime() - now.getTime()) / 86400000));
}

// ── Archive policy slider modal ───────────────────────────────────────────
const PolicyModal: React.FC<{
  project: ArchivedProject;
  onSave: (days: number) => void;
  onClose: () => void;
}> = ({ project, onSave, onClose }) => {
  const [days, setDays] = useState(project.auto_delete_days === -1 ? 30 : project.auto_delete_days);
  const [never, setNever] = useState(project.auto_delete_days === -1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[#0c0a14] rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 size={14} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white font-outfit">Archive Policy</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.06] text-white/40 hover:text-white">
            ✕
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <p className="text-xs text-white/50">
            Set how long <span className="text-white/75 font-medium">{project.name}</span> stays in the archive before being permanently deleted.
          </p>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={never}
              onChange={e => setNever(e.target.checked)}
              className="w-3.5 h-3.5 accent-violet-500"
            />
            <span className="text-xs text-white/65">Never auto-delete</span>
          </label>

          {!never && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">Delete after</span>
                <span className="text-sm font-bold text-amber-400 font-mono">{days} days</span>
              </div>
              <input
                type="range"
                min={7}
                max={365}
                step={1}
                value={days}
                onChange={e => setDays(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-[9px] text-white/25 font-mono">
                <span>7d</span>
                <span>30d</span>
                <span>90d</span>
                <span>180d</span>
                <span>365d</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-xs text-white/55 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={() => { onSave(never ? -1 : days); onClose(); }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Save Policy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Archive page ─────────────────────────────────────────────────────
export const ArchivePage: React.FC = () => {
  const { archivedProjects, fetchArchivedProjects, unarchiveProject, deleteProject, setArchivePolicy } = useProjectStore();
  const { setActiveTab } = useUiStore();
  const [loading, setLoading] = useState(true);
  const [policyProject, setPolicyProject] = useState<ArchivedProject | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    await fetchArchivedProjects();
    setLoading(false);
  }, [fetchArchivedProjects]);

  useEffect(() => { load(); }, [load]);

  const handleUnarchive = async (id: string) => {
    await unarchiveProject(id);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    await deleteProject(id);
    await fetchArchivedProjects();
  };

  const handleSavePolicy = async (projectId: string, days: number) => {
    await setArchivePolicy(projectId, days);
  };

  // Warn if any project expires within 7 days
  const expiringSoon = archivedProjects.filter(p => {
    const d = daysUntilDelete(p.archived_at, p.auto_delete_days);
    return d !== null && d <= 7;
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-[#09080e]/40 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold font-outfit text-white flex items-center gap-2">
              <Archive size={16} className="text-amber-400" /> Archive
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              Completed projects pending deletion — {archivedProjects.length} archived
            </p>
          </div>
        </div>

        {/* Expiry warning banner */}
        {expiringSoon.length > 0 && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-500/10 rounded-xl text-xs text-amber-400">
            <AlertTriangle size={13} className="shrink-0" />
            <span>
              {expiringSoon.length} project{expiringSoon.length > 1 ? "s" : ""} will be permanently deleted within 7 days.
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : archivedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-600/10 flex items-center justify-center mb-4">
              <Archive size={24} className="text-amber-400/60" />
            </div>
            <h3 className="text-sm font-semibold text-white/40 mb-1">Archive is empty</h3>
            <p className="text-xs text-white/25 max-w-xs mb-4">
              Archive completed projects from the Pipeline to keep your workspace clean. Archived projects are held here before permanent deletion.
            </p>
            <button
              onClick={() => setActiveTab("pipeline")}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-white/60 text-xs font-semibold rounded-xl transition-colors"
            >
              <FolderOpen size={13} /> Go to Pipeline
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {archivedProjects.map(proj => {
              const daysLeft = daysUntilDelete(proj.archived_at, proj.auto_delete_days);
              const isUrgent = daysLeft !== null && daysLeft <= 7;
              const isExpired = daysLeft !== null && daysLeft === 0;

              return (
                <div
                  key={proj.id}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl transition-colors",
                    isUrgent ? "bg-amber-500/5 hover:bg-amber-500/8" : "bg-white/[0.02] hover:bg-white/[0.04]"
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    isUrgent ? "bg-amber-500/15" : "bg-white/[0.04]"
                  )}>
                    <Archive size={16} className={isUrgent ? "text-amber-400" : "text-white/30"} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white/80 font-outfit truncate">{proj.name}</p>
                      <span className="text-[9px] text-white/30 font-mono">{proj.client_name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {proj.archived_at && (
                        <span className="flex items-center gap-1 text-[10px] text-white/30 font-mono">
                          <Calendar size={9} />
                          Archived {proj.archived_at.split(" ")[0]}
                        </span>
                      )}
                      {proj.completed_at && (
                        <span className="flex items-center gap-1 text-[10px] text-white/30 font-mono">
                          <Clock size={9} />
                          Completed {proj.completed_at.split(" ")[0]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Countdown */}
                  <div className="shrink-0 text-right">
                    {daysLeft === null ? (
                      <span className="text-[10px] text-white/25 font-mono">Never deletes</span>
                    ) : isExpired ? (
                      <span className="text-[10px] text-red-400 font-mono font-bold">Expired</span>
                    ) : (
                      <div>
                        <span className={cn(
                          "text-sm font-bold font-mono",
                          isUrgent ? "text-amber-400" : "text-white/50"
                        )}>
                          {daysLeft}d
                        </span>
                        <p className="text-[9px] text-white/25 font-mono">until delete</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setPolicyProject(proj as ArchivedProject)}
                      className="p-2 rounded-lg hover:bg-white/[0.06] text-white/25 hover:text-amber-400 transition-colors"
                      title="Archive policy"
                    >
                      <Settings2 size={13} />
                    </button>
                    <button
                      onClick={() => handleUnarchive(proj.id)}
                      className="p-2 rounded-lg hover:bg-emerald-500/10 text-white/25 hover:text-emerald-400 transition-colors"
                      title="Restore project"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(proj.id, proj.name)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-white/15 hover:text-red-400 transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Policy modal */}
      {policyProject && (
        <PolicyModal
          project={policyProject}
          onSave={(days) => handleSavePolicy(policyProject.id, days)}
          onClose={() => setPolicyProject(null)}
        />
      )}
    </div>
  );
};

import React, { useState, useCallback } from "react";
import {
  Sparkles, Copy, FolderX, Trash2, RefreshCw,
  ChevronDown, ChevronRight, FolderOpen,
  CheckCircle2, X,
} from "lucide-react";
import {
  apiFindDuplicates, apiFindEmptyFolders, apiDeleteEmptyFolders,
  apiDeleteAsset, apiRevealInExplorer,
  DuplicateGroup,
} from "../lib/tauri";
import { useProjectStore } from "../stores/useProjectStore";
import { useAssetStore } from "../stores/useAssetStore";
import { cn } from "../lib/utils";

function fmtBytes(b: number) {
  if (!b) return "0 B";
  const k = 1024; const s = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
}

export const CleanPage: React.FC = () => {
  const { clients, activeProjectId } = useProjectStore();
  const { fetchAssets } = useAssetStore();

  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set()); // asset_ids
  const [deleting, setDeleting] = useState(false);
  const [deletingFolders, setDeletingFolders] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const activeProject = clients.flatMap(c => c.projects).find(p => p.id === activeProjectId);

  const runScan = useCallback(async () => {
    setScanning(true);
    setScanDone(false);
    setDuplicates([]);
    setEmptyFolders([]);
    setSelectedToDelete(new Set());
    setResult(null);

    try {
      const [dups, folders] = await Promise.all([
        apiFindDuplicates(),
        activeProject?.path ? apiFindEmptyFolders(activeProject.path) : Promise.resolve([]),
      ]);
      setDuplicates(dups);
      setEmptyFolders(folders);
      setScanDone(true);
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  }, [activeProject?.path]);

  const toggleGroup = (hash: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  // Auto-select all but the first file in each duplicate group (keep newest)
  const autoSelectDuplicates = () => {
    const toDelete = new Set<string>();
    for (const group of duplicates) {
      // Keep the first (most recently added), mark rest for deletion
      const sorted = [...group.files].sort((a, b) => b.created_at.localeCompare(a.created_at));
      sorted.slice(1).forEach(f => toDelete.add(f.asset_id));
    }
    setSelectedToDelete(toDelete);
  };

  const toggleSelect = (assetId: string) => {
    setSelectedToDelete(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selectedToDelete.size === 0) return;
    if (!window.confirm(`Delete ${selectedToDelete.size} duplicate file${selectedToDelete.size > 1 ? "s" : ""} from disk permanently?`)) return;

    setDeleting(true);
    let deleted = 0;
    for (const assetId of selectedToDelete) {
      try {
        await apiDeleteAsset(assetId, true);
        deleted++;
      } catch (e) {
        console.error(e);
      }
    }
    setResult(`Deleted ${deleted} duplicate file${deleted !== 1 ? "s" : ""}.`);
    setDeleting(false);
    setSelectedToDelete(new Set());
    if (activeProjectId) fetchAssets(activeProjectId);
    // Re-scan
    runScan();
  };

  const deleteEmptyFolders = async () => {
    if (emptyFolders.length === 0) return;
    if (!window.confirm(`Remove ${emptyFolders.length} empty folder${emptyFolders.length > 1 ? "s" : ""}?`)) return;

    setDeletingFolders(true);
    try {
      const count = await apiDeleteEmptyFolders(emptyFolders);
      setResult(prev => {
        const msg = `Removed ${count} empty folder${count !== 1 ? "s" : ""}.`;
        return prev ? `${prev} ${msg}` : msg;
      });
      setEmptyFolders([]);
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingFolders(false);
    }
  };

  // Space that would be freed
  const selectedSize = duplicates
    .flatMap(g => g.files)
    .filter(f => selectedToDelete.has(f.asset_id))
    .reduce((sum, f) => {
      const group = duplicates.find(g => g.files.some(ff => ff.asset_id === f.asset_id));
      return sum + (group?.size ?? 0);
    }, 0);

  const totalDupSize = duplicates.reduce((sum, g) => sum + g.size * (g.files.length - 1), 0);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-[#09080e]/40 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold font-outfit text-white flex items-center gap-2">
            <Sparkles size={16} className="text-violet-400" /> Clean
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            Find duplicates and remove empty folders
            {activeProject && <span className="text-white/25"> · {activeProject.name}</span>}
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors"
        >
          {scanning
            ? <RefreshCw size={13} className="animate-spin" />
            : <RefreshCw size={13} />
          }
          {scanning ? "Scanning…" : scanDone ? "Re-scan" : "Scan Now"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Result banner */}
        {result && (
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 rounded-xl text-sm text-emerald-400">
            <CheckCircle2 size={16} />
            <span>{result}</span>
            <button onClick={() => setResult(null)} className="ml-auto text-emerald-400/60 hover:text-emerald-400">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Empty state */}
        {!scanDone && !scanning && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-600/10 flex items-center justify-center mb-4">
              <Sparkles size={28} className="text-violet-400/60" />
            </div>
            <h3 className="text-sm font-semibold text-white/40 mb-2">Ready to clean</h3>
            <p className="text-xs text-white/25 max-w-xs">
              Scan your project to find duplicate files and empty folders that are wasting space.
            </p>
          </div>
        )}

        {/* ── Duplicates ── */}
        {scanDone && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Copy size={14} className="text-amber-400" />
                <h3 className="text-sm font-bold text-white font-outfit">
                  Duplicate Files
                </h3>
                <span className="text-[10px] text-white/30 font-mono bg-white/[0.04] px-2 py-0.5 rounded-md">
                  {duplicates.length} group{duplicates.length !== 1 ? "s" : ""}
                </span>
                {totalDupSize > 0 && (
                  <span className="text-[10px] text-amber-400/70 font-mono">
                    {fmtBytes(totalDupSize)} wasted
                  </span>
                )}
              </div>
              {duplicates.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={autoSelectDuplicates}
                    className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Auto-select duplicates
                  </button>
                  {selectedToDelete.size > 0 && (
                    <button
                      onClick={deleteSelected}
                      disabled={deleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={11} />
                      Delete {selectedToDelete.size} ({fmtBytes(selectedSize)})
                    </button>
                  )}
                </div>
              )}
            </div>

            {duplicates.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/8 rounded-xl text-xs text-emerald-400/80">
                <CheckCircle2 size={14} />
                No duplicate files found.
              </div>
            ) : (
              <div className="space-y-2">
                {duplicates.map(group => {
                  const isOpen = expandedGroups.has(group.hash);
                  const groupSelected = group.files.filter(f => selectedToDelete.has(f.asset_id)).length;
                  return (
                    <div key={group.hash} className="bg-white/[0.02] rounded-xl overflow-hidden">
                      {/* Group header */}
                      <button
                        onClick={() => toggleGroup(group.hash)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
                      >
                        {isOpen ? <ChevronDown size={12} className="text-white/30 shrink-0" /> : <ChevronRight size={12} className="text-white/30 shrink-0" />}
                        <span className="text-xs font-semibold text-white/70 flex-1">
                          {group.files[0].name}
                        </span>
                        <span className="text-[10px] text-white/30 font-mono">{group.files.length} copies</span>
                        <span className="text-[10px] text-amber-400/70 font-mono ml-2">{fmtBytes(group.size)} each</span>
                        {groupSelected > 0 && (
                          <span className="text-[9px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded font-mono ml-2">
                            {groupSelected} selected
                          </span>
                        )}
                      </button>

                      {/* File list */}
                      {isOpen && (
                        <div className="border-t border-white/[0.04]">
                          {group.files.map((file, idx) => {
                            const isSelected = selectedToDelete.has(file.asset_id);
                            return (
                              <div
                                key={file.asset_id}
                                className={cn(
                                  "flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.03] last:border-0 transition-colors",
                                  isSelected ? "bg-red-500/8" : "hover:bg-white/[0.02]"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(file.asset_id)}
                                  className="w-3.5 h-3.5 accent-red-500 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-white/70 truncate">{file.name}</p>
                                  <p className="text-[9px] text-white/30 font-mono truncate mt-0.5">{file.path}</p>
                                </div>
                                <span className="text-[9px] text-white/25 font-mono shrink-0">{file.created_at.split(" ")[0]}</span>
                                {idx === 0 && (
                                  <span className="text-[8px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded shrink-0">keep</span>
                                )}
                                <button
                                  onClick={() => apiRevealInExplorer(file.path).catch(() => {})}
                                  className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors shrink-0"
                                  title="Reveal in Explorer"
                                >
                                  <FolderOpen size={11} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Empty Folders ── */}
        {scanDone && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderX size={14} className="text-slate-400" />
                <h3 className="text-sm font-bold text-white font-outfit">Empty Folders</h3>
                <span className="text-[10px] text-white/30 font-mono bg-white/[0.04] px-2 py-0.5 rounded-md">
                  {emptyFolders.length}
                </span>
              </div>
              {emptyFolders.length > 0 && (
                <button
                  onClick={deleteEmptyFolders}
                  disabled={deletingFolders}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600/20 hover:bg-slate-600/30 text-slate-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {deletingFolders ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  Remove all {emptyFolders.length}
                </button>
              )}
            </div>

            {emptyFolders.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/8 rounded-xl text-xs text-emerald-400/80">
                <CheckCircle2 size={14} />
                No empty folders found.
              </div>
            ) : (
              <div className="bg-white/[0.02] rounded-xl overflow-hidden">
                {emptyFolders.map(folder => (
                  <div key={folder} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <FolderX size={12} className="text-slate-400/60 shrink-0" />
                    <p className="flex-1 text-xs text-white/50 font-mono truncate">{folder}</p>
                    <button
                      onClick={() => apiRevealInExplorer(folder).catch(() => {})}
                      className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors shrink-0"
                    >
                      <FolderOpen size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {scanDone && duplicates.length === 0 && emptyFolders.length === 0 && !result && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-600/10 flex items-center justify-center mb-3">
              <CheckCircle2 size={24} className="text-emerald-400/70" />
            </div>
            <h3 className="text-sm font-semibold text-white/50 mb-1">All clean</h3>
            <p className="text-xs text-white/25">No duplicates or empty folders found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

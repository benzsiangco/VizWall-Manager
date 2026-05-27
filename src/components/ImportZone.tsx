import React, { useEffect, useState } from "react";
import { Folder, UploadCloud, X, AlertCircle, FolderSearch, RefreshCw } from "lucide-react";
import { useUiStore } from "../stores/useUiStore";
import { useProjectStore } from "../stores/useProjectStore";
import { useAssetStore } from "../stores/useAssetStore";
import { apiListImportSubfolders, apiPickFolder, apiPreviewImportFolder } from "../lib/tauri";
import { cn } from "../lib/utils";

export const ImportZone: React.FC = () => {
  const { importModalOpen, setImportModalOpen } = useUiStore();
  const { activeProjectId } = useProjectStore();
  const { importFolder, fetchAssets } = useAssetStore();
  const [folderPath, setFolderPath] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [subfolders, setSubfolders] = useState<string[]>([]);
  const [excludedSubfolders, setExcludedSubfolders] = useState<string[]>([]);
  const [loadingSubfolders, setLoadingSubfolders] = useState(false);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!folderPath.trim()) {
      setSubfolders([]);
      setExcludedSubfolders([]);
      return;
    }

    const timer = setTimeout(() => {
      setLoadingSubfolders(true);
      apiListImportSubfolders(folderPath.trim())
        .then((items) => {
          setSubfolders(items);
          setExcludedSubfolders(prev => prev.filter(item => items.includes(item)));
        })
        .catch(() => {
          setSubfolders([]);
          setExcludedSubfolders([]);
        })
        .finally(() => setLoadingSubfolders(false));
    }, 350);

    return () => clearTimeout(timer);
  }, [folderPath]);

  useEffect(() => {
    if (!folderPath.trim()) {
      setPreview(null);
      return;
    }

    const timer = setTimeout(() => {
      setLoadingPreview(true);
      apiPreviewImportFolder(folderPath.trim(), excludedSubfolders)
        .then(setPreview)
        .catch(() => setPreview(null))
        .finally(() => setLoadingPreview(false));
    }, 350);

    return () => clearTimeout(timer);
  }, [folderPath, excludedSubfolders]);

  if (!importModalOpen) return null;

  const handleBrowse = async () => {
    const picked = await apiPickFolder();
    if (picked) setFolderPath(picked);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const path = (file as any).path || file.name;
      setFolderPath(path);
    }
  };

  const resetModal = () => {
    setImportModalOpen(false);
    setStatus("idle");
    setProgress(0);
    setFolderPath("");
    setSubfolders([]);
    setExcludedSubfolders([]);
    setPreview(null);
  };

  const toggleExclude = (path: string) => {
    setExcludedSubfolders(prev =>
      prev.includes(path) ? prev.filter(item => item !== path) : [...prev, path]
    );
  };

  const handleStartScan = async () => {
    if (!activeProjectId || !folderPath.trim()) return;
    setImporting(true);
    setStatus("scanning");
    setProgress(10);

    // Animate progress bar while import runs
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) { clearInterval(interval); return 90; }
        return prev + 6;
      });
    }, 250);

    try {
      await importFolder(activeProjectId, folderPath, excludedSubfolders);
      clearInterval(interval);
      setProgress(100);
      setStatus("done");
      if (activeProjectId) await fetchAssets(activeProjectId);
      setTimeout(() => {
        setImportModalOpen(false);
        setImporting(false);
        setStatus("idle");
        setProgress(0);
        setFolderPath("");
        setSubfolders([]);
        setExcludedSubfolders([]);
        setPreview(null);
      }, 800);
    } catch (e) {
      clearInterval(interval);
      console.error(e);
      setStatus("error");
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg bg-[#0c0a14] rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UploadCloud size={18} className="text-violet-400" />
            <h3 className="text-sm font-bold font-outfit text-white">Import Local Media Folder</h3>
          </div>
          <button
            onClick={resetModal}
            className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex gap-2 items-center bg-violet-950/20 border border-violet-900/30 rounded-lg p-3 text-[11px] text-violet-300 leading-normal">
            <AlertCircle size={14} className="shrink-0" />
            <span>
              VizWall will scan this directory and categorize all media assets (A-Roll, B-Roll, Audio, Graphics, etc.) automatically.
            </span>
          </div>

          {/* Path input + browse */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider font-outfit block">
              Directory Path on Disk
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Folder className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                <input
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="e.g. D:/Projects/Footage/RAW"
                  className="w-full bg-[#12101c]/60 border border-white/5 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono"
                />
              </div>
              <button
                onClick={handleBrowse}
                className="px-3 bg-white/5 hover:bg-white/10 text-white border border-white/5 text-[10px] font-bold rounded-lg transition-colors font-outfit uppercase flex items-center gap-1.5"
              >
                <FolderSearch size={12} />
                Browse
              </button>
            </div>
          </div>

          {/* Exclude subfolders */}
          {folderPath.trim() && (
            <div className="space-y-2 rounded-xl bg-white/[0.02] border border-white/[0.05] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider font-outfit">
                    Exclude Subfolders
                  </p>
                  <p className="text-[10px] text-white/25 mt-0.5">
                    Checked folders will be skipped during import.
                  </p>
                </div>
                {loadingSubfolders && <RefreshCw size={13} className="text-violet-400 animate-spin shrink-0" />}
              </div>

              {!loadingSubfolders && subfolders.length === 0 && (
                <p className="text-[10px] text-white/25 italic">No subfolders found.</p>
              )}

              {subfolders.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {subfolders.map(folder => (
                    <label
                      key={folder}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] text-[10px] text-white/60 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={excludedSubfolders.includes(folder)}
                        onChange={() => toggleExclude(folder)}
                        className="h-3 w-3 accent-violet-500"
                      />
                      <span className="font-mono truncate">{folder}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Import preview */}
          {folderPath.trim() && (
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider font-outfit">Import Preview</p>
                {loadingPreview && <RefreshCw size={13} className="text-violet-400 animate-spin" />}
              </div>
              {preview ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["Files", preview["Total files"] ?? 0],
                    ["Skipped", preview["Skipped folders"] ?? excludedSubfolders.length],
                    ["Video", (preview["A_ROLL"] ?? 0) + (preview["B_ROLL"] ?? 0)],
                    ["Audio", (preview["AUDIO"] ?? 0) + (preview["MUSIC"] ?? 0) + (preview["SFX"] ?? 0) + (preview["VOICEOVER"] ?? 0)],
                    ["Graphics", preview["GRAPHICS"] ?? 0],
                    ["Images", preview["THUMBNAILS"] ?? 0],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-white/[0.03] px-2 py-2">
                      <p className="text-[9px] text-white/30">{label}</p>
                      <p className="text-sm font-bold text-white/80 font-mono">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-white/25 italic">Preview unavailable for this folder.</p>
              )}
            </div>
          )}

          {/* Drag area */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "border border-dashed rounded-xl aspect-[2/1] flex flex-col items-center justify-center p-6 text-center transition-all duration-300 cursor-pointer",
              dragActive
                ? "border-violet-500 bg-violet-500/5"
                : "border-white/5 hover:border-white/10 bg-[#12101c]/30 hover:bg-[#12101c]/50"
            )}
          >
            <UploadCloud size={32} className="text-white/20 mb-3" />
            <span className="text-xs font-semibold text-white/60 mb-1">Drag & Drop folder here</span>
            <p className="text-[10px] text-white/30 max-w-[250px]">
              Or use the Browse button above to pick a folder from your system.
            </p>
          </div>

          {/* Progress bar */}
          {importing && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/50">
                  {status === "scanning" ? "Scanning & categorizing files…" : status === "done" ? "Done!" : ""}
                </span>
                <span className="text-violet-400 font-mono">{progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === "error" && (
            <p className="text-[11px] text-red-400 flex items-center gap-1.5">
              <AlertCircle size={12} /> Import failed. Check the folder path and try again.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white/[0.01] flex justify-end gap-2">
          <button
            onClick={resetModal}
            disabled={importing}
            className="px-4 py-2 bg-transparent hover:bg-white/5 text-white/70 text-[10px] font-bold tracking-wider uppercase rounded-lg transition-colors font-outfit disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleStartScan}
            disabled={!folderPath.trim() || !activeProjectId || importing}
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white text-[10px] font-bold tracking-wider uppercase rounded-lg transition-all font-outfit"
          >
            {importing ? "Importing…" : "Scan & Organize"}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Minus, Square, X, Maximize2, Search,
  ArrowDownToLine, CheckCircle, RefreshCw, Sparkles, Bell,
} from "lucide-react";
import { isTauri, apiCheckForUpdates, apiDownloadAndInstallUpdate } from "../lib/tauri";
import { useAssetStore } from "../stores/useAssetStore";
import { useUiStore } from "../stores/useUiStore";
import { cn } from "../lib/utils";

const APP_VERSION = "1.0.0";

// ── Update notification card ──────────────────────────────────────────────
type CheckState = "idle" | "checking" | "up-to-date" | "available";
type DownloadState = "idle" | "downloading" | "done" | "error";

interface UpdateInfo {
  version: string;
  notes: string;
  url: string;
}

const UpdateCard: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [checkState, setCheckState] = useState<CheckState>("checking");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dlState, setDlState] = useState<DownloadState>("idle");
  const [progress, setProgress] = useState(0);

  // Close on outside click or Escape
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  // Check for updates when card opens
  useEffect(() => {
    if (!isTauri()) { setCheckState("up-to-date"); return; }
    const check = async () => {
      setCheckState("checking");
      try {
        const data = await apiCheckForUpdates();
        if (!data?.tag_name) { setCheckState("up-to-date"); return; }
        const remote = (data.tag_name as string).replace(/^v/, "");
        // Compare versions
        const isNewer = remote.split(".").map(Number)
          .some((n: number, i: number) => n > (APP_VERSION.split(".").map(Number)[i] ?? 0));
        if (!isNewer) { setCheckState("up-to-date"); return; }
        const assets: any[] = data.assets ?? [];
        const exe = assets.find((a: any) =>
          typeof a.browser_download_url === "string" &&
          (a.browser_download_url.endsWith(".exe") || a.browser_download_url.endsWith(".msi"))
        );
        setUpdateInfo({
          version: remote,
          notes: (data.body as string | undefined)?.slice(0, 280) ?? "",
          url: exe?.browser_download_url ?? data.html_url ?? "",
        });
        setCheckState("available");
      } catch {
        setCheckState("up-to-date");
      }
    };
    check();
  }, []);

  const handleDownload = async () => {
    if (!updateInfo) return;
    setDlState("downloading");
    setProgress(0);
    const iv = setInterval(() => {
      setProgress(p => { if (p >= 90) { clearInterval(iv); return 90; } return p + Math.random() * 9; });
    }, 350);
    try {
      await apiDownloadAndInstallUpdate(updateInfo.url);
      clearInterval(iv);
      setProgress(100);
      setDlState("done");
    } catch {
      clearInterval(iv);
      setDlState("error");
    }
  };

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-2 w-72 bg-[#0e0c15] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden z-[9999]"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <Bell size={13} className="text-white/40" />
          <span className="text-xs font-bold text-white font-outfit">Updates</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/25 font-mono">v{APP_VERSION}</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white transition-colors">
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        {/* Checking */}
        {checkState === "checking" && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0">
              <RefreshCw size={14} className="text-white/30 animate-spin" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white/70">Checking for updates…</p>
              <p className="text-[10px] text-white/30 mt-0.5">Connecting to GitHub releases</p>
            </div>
          </div>
        )}

        {/* Up to date */}
        {checkState === "up-to-date" && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <CheckCircle size={16} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">You're up to date</p>
              <p className="text-[10px] text-white/35 mt-0.5">VizWall v{APP_VERSION} is the latest version</p>
            </div>
          </div>
        )}

        {/* Update available */}
        {checkState === "available" && updateInfo && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-blue-500 flex items-center justify-center shrink-0">
                <Sparkles size={14} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Update available</p>
                <p className="text-[10px] text-white/40 mt-0.5">
                  v{APP_VERSION} → <span className="text-violet-400 font-semibold">v{updateInfo.version}</span>
                </p>
              </div>
            </div>

            {updateInfo.notes && (
              <div className="bg-white/[0.03] rounded-xl px-3 py-2.5">
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1.5">What's new</p>
                <p className="text-[10px] text-white/55 leading-relaxed line-clamp-3">{updateInfo.notes}</p>
              </div>
            )}

            {dlState === "idle" && (
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl transition-all"
              >
                <ArrowDownToLine size={13} />
                Download & Install
              </button>
            )}

            {dlState === "downloading" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/50 flex items-center gap-1.5">
                    <RefreshCw size={9} className="animate-spin text-violet-400" />
                    Downloading update…
                  </span>
                  <span className="text-white/40 font-mono">{Math.round(progress)}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-blue-400 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-[9px] text-white/25 text-center">App will restart automatically after install</p>
              </div>
            )}

            {dlState === "done" && (
              <div className="flex items-center justify-center gap-2 py-2 text-emerald-400 text-xs">
                <CheckCircle size={13} />
                Installing… restarting shortly
              </div>
            )}

            {dlState === "error" && (
              <div className="space-y-2">
                <p className="text-[10px] text-red-400 text-center">Download failed. Check your connection.</p>
                <button
                  onClick={() => { setDlState("idle"); setProgress(0); }}
                  className="w-full py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white/60 text-xs rounded-xl transition-colors"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Update icon button ────────────────────────────────────────────────────
const UpdateButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Silent background check — just sets the dot, doesn't open anything
  useEffect(() => {
    if (!isTauri()) return;
    const t = setTimeout(async () => {
      try {
        const data = await apiCheckForUpdates();
        if (!data?.tag_name) return;
        const remote = (data.tag_name as string).replace(/^v/, "");
        const newer = remote.split(".").map(Number)
          .some((n: number, i: number) => n > (APP_VERSION.split(".").map(Number)[i] ?? 0));
        if (newer) setHasUpdate(true);
      } catch { /* silent */ }
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={containerRef} className="relative flex items-center" onMouseDown={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "relative w-9 h-9 flex items-center justify-center transition-colors",
          open
            ? "text-white/70 bg-white/[0.06]"
            : "text-white/25 hover:text-white/60 hover:bg-white/[0.04]"
        )}
        title="Updates"
      >
        <ArrowDownToLine size={13} />
        {/* Pulsing dot — only when update is available */}
        {hasUpdate && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-violet-400 ring-2 ring-[#0a0910] animate-pulse" />
        )}
      </button>

      {open && <UpdateCard onClose={() => setOpen(false)} />}
    </div>
  );
};

// ── TitleBar ──────────────────────────────────────────────────────────────
interface TitleBarProps {
  onSearchChange?: (query: string) => void;
  searchQuery?: string;
  searchPlaceholder?: string;
  showSearch?: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  onSearchChange,
  searchQuery = "",
  searchPlaceholder = "Search…",
  showSearch = false,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const assetLoading = useAssetStore(s => s.loading);
  const progressTasks = useUiStore(s => s.progressTasks);

  const runningTask = progressTasks.find(t => t.status === "running");
  const isLoading = assetLoading || !!runningTask;

  const progressLabel = runningTask
    ? runningTask.detail
      ? `${runningTask.label} — ${runningTask.detail}`
      : runningTask.label
    : assetLoading
    ? "Indexing library…"
    : "";

  const progressPct = runningTask && runningTask.total > 0
    ? runningTask.current / runningTask.total
    : null;

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const check = async () => setIsMaximized(await win.isMaximized());
    check();
    let unlisten: (() => void) | undefined;
    win.onResized(() => check()).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  const handleDragAreaMouseDown = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (!isTauri()) return;
    await getCurrentWindow().startDragging();
  };

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isTauri()) await getCurrentWindow().minimize();
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isTauri()) return;
    const win = getCurrentWindow();
    if (await win.isMaximized()) await win.unmaximize();
    else await win.maximize();
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isTauri()) await getCurrentWindow().close();
  };

  return (
    <div className="bg-[#0a0910] border-b border-white/5 shrink-0 z-50 relative select-none">
      <div className="h-9 flex items-center relative">
        {/* Drag region */}
        <div className="absolute inset-0 z-0" onMouseDown={handleDragAreaMouseDown} />

        {/* Left: loading status */}
        {isLoading && !showSearch && (
          <div className="relative z-10 ml-3 flex items-center gap-2 pointer-events-none">
            <div className="w-3 h-3 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            <span className="text-[10px] text-violet-400/70 font-mono truncate max-w-[280px]">
              {progressLabel}
            </span>
          </div>
        )}

        {/* Center: search bar */}
        {showSearch && (
          <div className="relative z-10 mx-auto w-72 pointer-events-auto" onMouseDown={e => e.stopPropagation()}>
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-6 bg-white/[0.05] hover:bg-white/[0.07] focus:bg-white/[0.08] border border-white/[0.06] focus:border-violet-500/40 rounded-lg pl-7 pr-3 text-[11px] text-white/70 placeholder-white/25 focus:outline-none transition-colors"
            />
          </div>
        )}

        {/* Right: update + loading + window controls */}
        <div className="relative z-20 ml-auto flex items-center">
          {isLoading && showSearch && (
            <div className="mr-2 flex items-center gap-1.5 pointer-events-none">
              <div className="w-2.5 h-2.5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              <span className="text-[9px] text-violet-400/50 font-mono hidden sm:block truncate max-w-[160px]">
                {progressLabel}
              </span>
            </div>
          )}

          {/* Update icon — always present, dot appears when update found */}
          <UpdateButton />

          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleMinimize}
            className="w-9 h-9 flex items-center justify-center text-white/30 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
            title="Minimize"
          >
            <Minus size={12} />
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleMaximize}
            className="w-9 h-9 flex items-center justify-center text-white/30 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Square size={11} /> : <Maximize2 size={11} />}
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center text-white/30 hover:text-white hover:bg-red-500/80 transition-colors"
            title="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className={cn(
        "h-[2px] w-full transition-opacity duration-300",
        isLoading ? "opacity-100" : "opacity-0"
      )}>
        {progressPct !== null ? (
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-blue-400 transition-all duration-300"
            style={{ width: `${Math.round(progressPct * 100)}%` }}
          />
        ) : (
          <div
            className="h-full bg-gradient-to-r from-violet-500 via-blue-400 to-violet-500"
            style={{
              backgroundSize: "200% 100%",
              animation: isLoading ? "progressSlide 1.5s linear infinite" : "none",
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes progressSlide {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
};

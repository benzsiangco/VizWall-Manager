import React, { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Minus, Square, X, Maximize2, Search,
  ArrowDownToLine, CheckCircle, RefreshCw, Sparkles,
} from "lucide-react";
import { isTauri, apiCheckForUpdates, apiDownloadAndInstallUpdate } from "../lib/tauri";
import { useAssetStore } from "../stores/useAssetStore";
import { useUiStore } from "../stores/useUiStore";
import { cn } from "../lib/utils";

// ── Current app version (bump this on each release) ──────────────────────
const APP_VERSION = "1.0.0";

// ── Version chip — always visible in titlebar ─────────────────────────────
const VersionChip: React.FC<{ onClick: () => void; hasUpdate: boolean }> = ({ onClick, hasUpdate }) => (
  <button
    onMouseDown={e => e.stopPropagation()}
    onClick={onClick}
    className={cn(
      "relative flex items-center gap-1.5 px-2.5 h-9 text-[10px] font-mono transition-colors",
      hasUpdate
        ? "text-emerald-400/80 hover:text-emerald-300"
        : "text-white/20 hover:text-white/50"
    )}
    title={hasUpdate ? "Update available — click to install" : `VizWall v${APP_VERSION}`}
  >
    <span>v{APP_VERSION}</span>
    {hasUpdate && (
      <>
        <ArrowDownToLine size={11} />
        <span className="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 ring-1 ring-[#0a0910] animate-pulse" />
      </>
    )}
  </button>
);

// ── Update popover ────────────────────────────────────────────────────────
type UpdateState = "idle" | "checking" | "available" | "downloading" | "done" | "error" | "up-to-date";

interface UpdateInfo {
  version: string;
  notes: string;
  url: string;
}

const UpdatePopover: React.FC<{
  info: UpdateInfo;
  onClose: () => void;
}> = ({ info, onClose }) => {
  const [state, setState] = useState<"idle" | "downloading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0); // 0–100
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  const handleInstall = async () => {
    setState("downloading");
    setProgress(0);

    // Simulate progress while the download runs (we don't get real progress from powershell)
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 90) { clearInterval(interval); return 90; }
        return p + Math.random() * 8;
      });
    }, 400);

    try {
      await apiDownloadAndInstallUpdate(info.url);
      clearInterval(interval);
      setProgress(100);
      setState("done");
    } catch (e) {
      clearInterval(interval);
      setState("error");
    }
  };

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-1 w-72 bg-[#0e0c15] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-[9999]"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shrink-0">
          <Sparkles size={13} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white font-outfit">Update Available</p>
          <p className="text-[9px] text-white/40">
            v{APP_VERSION} → <span className="text-emerald-400 font-semibold">v{info.version}</span>
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white transition-colors">
          <X size={11} />
        </button>
      </div>

      {/* Release notes */}
      {info.notes && (
        <div className="px-4 py-2.5 border-b border-white/[0.04]">
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1.5">What's new</p>
          <p className="text-[10px] text-white/55 leading-relaxed line-clamp-4">{info.notes}</p>
        </div>
      )}

      {/* Action area */}
      <div className="px-4 py-3">
        {state === "idle" && (
          <button
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <ArrowDownToLine size={12} />
            Download & Install
          </button>
        )}

        {state === "downloading" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-white/50 flex items-center gap-1.5">
                <RefreshCw size={9} className="animate-spin text-emerald-400" />
                Downloading…
              </span>
              <span className="text-white/40 font-mono">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[9px] text-white/25 text-center">App will restart automatically</p>
          </div>
        )}

        {state === "done" && (
          <div className="flex items-center justify-center gap-2 py-2 text-emerald-400 text-xs">
            <CheckCircle size={13} />
            Installing… app will restart
          </div>
        )}

        {state === "error" && (
          <div className="space-y-2">
            <p className="text-[10px] text-red-400 text-center">Download failed. Try again.</p>
            <button
              onClick={() => setState("idle")}
              className="w-full py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white/60 text-xs rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Update button in titlebar ─────────────────────────────────────────────
const UpdateButton: React.FC = () => {
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check for updates once on mount, silently
  useEffect(() => {
    if (!isTauri()) return;
    const check = async () => {
      setUpdateState("checking");
      try {
        const data = await apiCheckForUpdates();
        if (!data || !data.tag_name) {
          setUpdateState("up-to-date");
          return;
        }
        // Parse version from tag like "v1.2.3"
        const remoteVersion = (data.tag_name as string).replace(/^v/, "");
        if (remoteVersion === APP_VERSION) {
          setUpdateState("up-to-date");
          return;
        }
        // Extract download URL — prefer NSIS exe
        const assets: any[] = data.assets ?? [];
        const exeAsset = assets.find((a: any) =>
          typeof a.browser_download_url === "string" &&
          (a.browser_download_url.endsWith(".exe") || a.browser_download_url.endsWith(".msi"))
        );
        const url = exeAsset?.browser_download_url ?? data.html_url ?? "";
        const notes = (data.body as string | undefined)?.slice(0, 300) ?? "";
        setUpdateInfo({ version: remoteVersion, notes, url });
        setUpdateState("available");
      } catch {
        setUpdateState("idle"); // silent fail — don't bother the user
      }
    };
    // Delay check by 5s so it doesn't compete with startup
    const t = setTimeout(check, 5000);
    return () => clearTimeout(t);
  }, []);

  const hasUpdate = updateState === "available";

  return (
    <div ref={containerRef} className="relative flex items-center" onMouseDown={e => e.stopPropagation()}>
      <VersionChip
        onClick={() => { if (hasUpdate) setPopoverOpen(o => !o); }}
        hasUpdate={hasUpdate}
      />

      {popoverOpen && updateInfo && (
        <UpdatePopover
          info={updateInfo}
          onClose={() => setPopoverOpen(false)}
        />
      )}
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

        {/* Left: status label when loading (only when no search bar) */}
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

        {/* Right: update button + loading indicator + window controls */}
        <div className="relative z-20 ml-auto flex items-center">
          {/* Loading indicator when search is shown */}
          {isLoading && showSearch && (
            <div className="mr-2 flex items-center gap-1.5 pointer-events-none">
              <div className="w-2.5 h-2.5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              <span className="text-[9px] text-violet-400/50 font-mono hidden sm:block truncate max-w-[160px]">
                {progressLabel}
              </span>
            </div>
          )}

          {/* Update button — appears when update is available */}
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

      {/* Progress bar — thin strip at the bottom of the title bar */}
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

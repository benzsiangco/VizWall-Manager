import React, { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Maximize2, Search } from "lucide-react";
import { isTauri } from "../lib/tauri";
import { useAssetStore } from "../stores/useAssetStore";
import { useUiStore } from "../stores/useUiStore";
import { cn } from "../lib/utils";

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

  // Any running task OR asset loading = show progress
  const runningTask = progressTasks.find(t => t.status === "running");
  const isLoading = assetLoading || !!runningTask;

  const progressLabel = runningTask
    ? runningTask.detail
      ? `${runningTask.label} — ${runningTask.detail}`
      : runningTask.label
    : assetLoading
    ? "Indexing library…"
    : "";

  // Determinate progress (0–1) if we have a task with total > 0
  const progressPct = runningTask && runningTask.total > 0
    ? runningTask.current / runningTask.total
    : null; // null = indeterminate

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

        {/* Left: status label when loading */}
        {isLoading && !showSearch && (
          <div className="relative z-10 ml-3 flex items-center gap-2 pointer-events-none">
            <div className="w-3 h-3 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            <span className="text-[10px] text-violet-400/70 font-mono truncate max-w-[280px]">
              {progressLabel}
            </span>
          </div>
        )}

        {/* Center: search bar (when enabled) */}
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

        {/* Window controls */}
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
          // Determinate bar
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-blue-400 transition-all duration-300"
            style={{ width: `${Math.round(progressPct * 100)}%` }}
          />
        ) : (
          // Indeterminate sliding bar
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

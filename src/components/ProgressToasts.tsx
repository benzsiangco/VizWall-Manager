import React from "react";
import { Check, RefreshCw, AlertCircle } from "lucide-react";
import { useUiStore } from "../stores/useUiStore";
import { cn } from "../lib/utils";

export const ProgressToasts: React.FC = () => {
  const { progressTasks } = useUiStore();

  if (progressTasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 w-80 pointer-events-none">
      {progressTasks.map((task) => {
        const pct = task.total > 0 ? Math.min(100, (task.current / task.total) * 100) : 0;
        const isDone = task.status === "done";
        const isError = task.status === "error";

        return (
          <div
            key={task.id}
            className={cn(
              "bg-[#0e0c1a] backdrop-blur-md rounded-2xl p-3.5 shadow-2xl pointer-events-auto",
              "transition-all duration-300 transform animate-in slide-in-from-right",
              isError && "ring-1 ring-red-500/30"
            )}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className={cn(
                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                isDone ? "bg-emerald-500/15 text-emerald-400"
                : isError ? "bg-red-500/15 text-red-400"
                : "bg-violet-500/15 text-violet-400"
              )}>
                {isDone ? <Check size={12} />
                  : isError ? <AlertCircle size={12} />
                  : <RefreshCw size={12} className="animate-spin" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/85 font-outfit truncate">{task.label}</p>
                {task.detail && (
                  <p className="text-[10px] text-white/40 truncate">{task.detail}</p>
                )}
              </div>
              <span className="text-[10px] text-white/40 font-mono shrink-0">
                {task.current}/{task.total}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  isError ? "bg-red-500"
                  : isDone ? "bg-emerald-500"
                  : "bg-gradient-to-r from-violet-500 to-blue-500"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

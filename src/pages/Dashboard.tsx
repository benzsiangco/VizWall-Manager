import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  UploadCloud, FolderPlus, Eye, Plus,
  HardDrive, Clock, ChevronRight, Star, Play,
  Video, Music, ImageIcon, FileText,
  FolderOpen, Activity,
  Trash2, Wand2, Flame,
} from "lucide-react";
import { useUiStore } from "../stores/useUiStore";
import { useAssetStore } from "../stores/useAssetStore";
import { useProjectStore } from "../stores/useProjectStore";
import {
  apiGetAllDiskStats, apiGetActivityHeatmap,
  apiGetProjectExports, apiGetProjectRevisions,
  DiskStats, Asset, Project, ActivityHeatmap, isTauri,
} from "../lib/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

// ── Activity Heatmap Widget ───────────────────────────────────────────────
const HEATMAP_RANGES = [
  { label: "Last 3 Months", days: 90 },
  { label: "Last 6 Months", days: 180 },
  { label: "Last 12 Months", days: 365 },
];

function heatColor(count: number, max: number): string {
  if (count === 0) return "bg-white/[0.04]";
  const ratio = max > 0 ? count / max : 0;
  if (ratio < 0.15) return "bg-violet-900/40";
  if (ratio < 0.35) return "bg-violet-700/60";
  if (ratio < 0.60) return "bg-violet-600/80";
  if (ratio < 0.80) return "bg-violet-500";
  return "bg-violet-400";
}

const ActivityHeatmapWidget: React.FC = () => {
  const [rangeIdx, setRangeIdx] = useState(2); // default: 12 months
  const [heatmap, setHeatmap] = useState<ActivityHeatmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    apiGetActivityHeatmap(HEATMAP_RANGES[rangeIdx].days)
      .then(data => { setHeatmap(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [rangeIdx]);

  const formatBytes = (b: number) => {
    if (!b) return "0 B";
    const k = 1024;
    const s = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
  };

  if (loading || !heatmap) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white font-outfit flex items-center gap-2">
            <Flame size={13} className="text-violet-400" /> Activity Heat Map
          </h2>
        </div>
        <div className="bg-white/[0.02] rounded-2xl p-5 h-40 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Build week columns: group days into weeks (Sun–Sat)
  const days = heatmap.days;
  const maxCount = Math.max(...days.map(d => d.count), 1);

  // Pad start so first day aligns to correct weekday (0=Sun)
  const firstDate = days.length > 0 ? new Date(days[0].date + "T00:00:00") : new Date();
  const startPad = firstDate.getDay(); // 0=Sun
  const paddedDays = [
    ...Array(startPad).fill(null),
    ...days,
  ];

  // Split into weeks
  const weeks: (typeof days[0] | null)[][] = [];
  for (let i = 0; i < paddedDays.length; i += 7) {
    weeks.push(paddedDays.slice(i, i + 7));
  }

  // Month labels: find first day of each month in the data
  const monthLabels: { label: string; weekIdx: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstReal = week.find(d => d !== null);
    if (firstReal) {
      const m = new Date(firstReal.date + "T00:00:00").getMonth();
      if (m !== lastMonth) {
        monthLabels.push({
          label: new Date(firstReal.date + "T00:00:00").toLocaleString("default", { month: "short" }),
          weekIdx: wi,
        });
        lastMonth = m;
      }
    }
  });

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white font-outfit flex items-center gap-2">
            <Flame size={13} className="text-violet-400" /> Activity Heat Map
          </h2>
          <p className="text-[10px] text-white/30 mt-0.5">See your productivity patterns. The more you create, the brighter the day.</p>
        </div>
        <div className="flex items-center gap-1">
          {HEATMAP_RANGES.map((r, i) => (
            <button key={r.label} onClick={() => setRangeIdx(i)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors",
                rangeIdx === i
                  ? "bg-violet-600/20 text-violet-400"
                  : "text-white/30 hover:text-white/60 hover:bg-white/[0.03]"
              )}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white/[0.02] rounded-2xl p-5 space-y-4">
        {/* Grid */}
        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-0">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-[3px] mr-1 shrink-0">
              <div className="h-4" /> {/* spacer for month row */}
              {DOW.map((d, i) => (
                <div key={d} className={cn(
                  "h-[11px] text-[8px] text-white/20 font-mono flex items-center",
                  i % 2 === 0 ? "opacity-100" : "opacity-0"
                )}>
                  {d}
                </div>
              ))}
            </div>

            {/* Week columns */}
            {weeks.map((week, wi) => {
              const monthLabel = monthLabels.find(m => m.weekIdx === wi);
              return (
                <div key={wi} className="flex flex-col gap-[3px] shrink-0">
                  {/* Month label */}
                  <div className="h-4 flex items-center">
                    {monthLabel && (
                      <span className="text-[8px] text-white/30 font-mono whitespace-nowrap">{monthLabel.label}</span>
                    )}
                  </div>
                  {/* Day cells */}
                  {week.map((day, di) => (
                    <div
                      key={di}
                      className={cn(
                        "w-[11px] h-[11px] rounded-[2px] transition-colors cursor-default",
                        day ? heatColor(day.count, maxCount) : "opacity-0"
                      )}
                      onMouseEnter={e => {
                        if (!day) return;
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setTooltip({ date: day.date, count: day.count, x: rect.left, y: rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[9px] text-white/25">
          <span>Less</span>
          {["bg-white/[0.04]", "bg-violet-900/40", "bg-violet-700/60", "bg-violet-600/80", "bg-violet-500", "bg-violet-400"].map((c, i) => (
            <div key={i} className={cn("w-[11px] h-[11px] rounded-[2px]", c)} />
          ))}
          <span>More</span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 pt-2 border-t border-white/[0.04]">
          {[
            { icon: <Activity size={14} className="text-violet-400" />, value: heatmap.active_days, label: "Active Days", sub: "Days with project activity" },
            { icon: <Clock size={14} className="text-blue-400" />, value: heatmap.total_events, label: "Total Events", sub: "Actions logged" },
            { icon: <FolderOpen size={14} className="text-emerald-400" />, value: heatmap.projects_touched, label: "Projects Worked On", sub: "In this period" },
            { icon: <HardDrive size={14} className="text-orange-400" />, value: formatBytes(heatmap.assets_processed), label: "Assets Processed", sub: "Imported & organized" },
          ].map(stat => (
            <div key={stat.label} className="bg-white/[0.02] rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                  {stat.icon}
                </div>
                <span className="text-lg font-bold text-white font-outfit">{stat.value}</span>
              </div>
              <p className="text-[10px] font-semibold text-white/60">{stat.label}</p>
              <p className="text-[9px] text-white/25">{stat.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-[#0e0c15] border border-white/[0.08] rounded-lg px-2.5 py-1.5 shadow-xl"
          style={{ left: tooltip.x + 16, top: tooltip.y - 8 }}
        >
          <p className="text-[10px] font-semibold text-white">{tooltip.date}</p>
          <p className="text-[9px] text-white/50">{tooltip.count} event{tooltip.count !== 1 ? "s" : ""}</p>
        </div>
      )}
    </div>
  );
};

// ── Project card with thumbnail / hover-play ──────────────────────────────
interface ProjectThumbCardProps {
  proj: Project & { clientName: string };
  sc: { badge: string; bar: string };
  projAssets: Asset[];
  pct: number;
  thumbSrc: string;
  isVideoThumb: boolean;
  thumbPath: string | null;
  onClick: () => void;
}

const ProjectThumbCard: React.FC<ProjectThumbCardProps> = ({
  proj, sc, projAssets, pct, thumbSrc, isVideoThumb, thumbPath, onClick
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [imgSrc, setImgSrc] = useState(thumbSrc);

  const onEnter = useCallback(() => {
    if (!isVideoThumb || !thumbPath || !isTauri()) return;
    timer.current = setTimeout(() => {
      setPlaying(true);
      videoRef.current?.play().catch(() => {});
    }, 350);
  }, [isVideoThumb, thumbPath]);

  const onLeave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    setPlaying(false);
  }, []);

  return (
    <div
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="bg-white/[0.02] hover:bg-white/[0.04] rounded-2xl overflow-hidden cursor-pointer group transition-colors"
    >
      <div className="aspect-video relative overflow-hidden bg-gradient-to-br from-violet-900/20 to-blue-900/10">
        {imgSrc && !playing && (
          <img
            src={imgSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgSrc("")}
          />
        )}
        {isVideoThumb && thumbPath && isTauri() && (
          <video
            ref={videoRef}
            src={playing ? convertFileSrc(thumbPath) : undefined}
            className={cn("absolute inset-0 w-full h-full object-cover transition-opacity", playing ? "opacity-100" : "opacity-0")}
            muted loop playsInline preload="none"
          />
        )}
        {!imgSrc && !playing && (
          <FolderOpen size={24} className="absolute inset-0 m-auto text-violet-500/25" />
        )}
        {isVideoThumb && !playing && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <Play size={10} className="text-white fill-white ml-0.5" />
            </div>
          </div>
        )}
        <span className={cn("absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded-md", sc.badge)}>
          {proj.status}
        </span>
      </div>
      <div className="p-3 space-y-2">
        <div>
          <p className="text-xs font-semibold text-white/85 truncate font-outfit">{proj.name}</p>
          <p className="text-[9px] text-white/30 mt-0.5">{projAssets.length} assets · {proj.clientName}</p>
        </div>
        <div className="w-full h-1 bg-white/[0.04] rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", sc.bar)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
};

// ── Hover-play asset thumbnail ────────────────────────────────────────────
const AssetThumb: React.FC<{ asset: Asset; onClick: () => void }> = ({ asset, onClick }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [thumbSrc, setThumbSrc] = useState("");
  const [playing, setPlaying] = useState(false);

  const isVideo = asset.category === "A_ROLL" || asset.category === "B_ROLL";
  const isAudio = asset.category === "AUDIO" || asset.category === "MUSIC";
  const isImage = asset.category === "THUMBNAILS" || asset.category === "GRAPHICS";

  useEffect(() => {
    if (!isTauri()) return;
    if (asset.thumbnail_path) { setThumbSrc(convertFileSrc(asset.thumbnail_path)); return; }
    if (isImage && asset.path) { setThumbSrc(convertFileSrc(asset.path)); return; }
  }, [asset.id]);

  const onEnter = useCallback(() => {
    if (!isVideo || !asset.path || !isTauri()) return;
    timer.current = setTimeout(() => {
      setPlaying(true);
      videoRef.current?.play().catch(() => {});
    }, 350);
  }, [isVideo, asset.path]);

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
    <div onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave} className="group shrink-0 w-44 cursor-pointer">
      <div className="aspect-video rounded-xl overflow-hidden bg-white/[0.02] relative">
        {thumbSrc && !playing && (
          <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setThumbSrc("")} />
        )}
        {isVideo && asset.path && isTauri() && (
          <video ref={videoRef} src={playing ? convertFileSrc(asset.path) : undefined}
            className={cn("absolute inset-0 w-full h-full object-cover transition-opacity", playing ? "opacity-100" : "opacity-0")}
            muted loop playsInline preload="none" />
        )}
        {!thumbSrc && !playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/[0.03] to-transparent">
            {isVideo && <Video size={20} className="text-violet-500/40" />}
            {isAudio && <Music size={20} className="text-blue-500/40" />}
            {isImage && <ImageIcon size={20} className="text-cyan-500/40" />}
            {!isVideo && !isAudio && !isImage && <FileText size={20} className="text-white/20" />}
          </div>
        )}
        {isVideo && !playing && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <Play size={11} className="text-white fill-white ml-0.5" />
            </div>
          </div>
        )}
        {asset.duration != null && asset.duration > 0 && (
          <span className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm px-1 py-0.5 rounded text-[8px] font-mono text-white/85">{fmt(asset.duration)}</span>
        )}
        {asset.favorite && <Star size={10} className="absolute top-1.5 right-1.5 text-violet-400 fill-violet-400" />}
      </div>
      <div className="mt-1.5 px-0.5">
        <p className="text-[10px] text-white/65 truncate font-outfit" title={asset.name}>{asset.name}</p>
        <p className="text-[8px] text-white/25 font-mono mt-0.5">{fmtBytes(asset.size)}</p>
      </div>
    </div>
  );
};

// ── Project status colors ────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { badge: string; bar: string }> = {
  "In Progress":   { badge: "text-violet-400 bg-violet-500/10",   bar: "bg-violet-500" },
  "Client Review": { badge: "text-blue-400 bg-blue-500/10",       bar: "bg-blue-500" },
  "Revisions":     { badge: "text-amber-400 bg-amber-500/10",     bar: "bg-amber-500" },
  "Approved":      { badge: "text-emerald-400 bg-emerald-500/10", bar: "bg-emerald-500" },
  "Exported":      { badge: "text-cyan-400 bg-cyan-500/10",       bar: "bg-cyan-500" },
  "To Edit":       { badge: "text-slate-400 bg-slate-500/10",     bar: "bg-slate-500" },
};

// ── Main Dashboard ────────────────────────────────────────────────────────
const STATUS_PROGRESS: Record<string, number> = {
  "To Edit": 12,
  "In Progress": 45,
  "Client Review": 72,
  "Revisions": 82,
  "Approved": 92,
  "Exported": 100,
};

function formatRelativeTime(value?: string) {
  if (!value) return "N/A";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "N/A";
  const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

const CurrentProjectHighlight: React.FC<{
  project: Project & { clientName: string };
  assets: Asset[];
  exportCount: number;
  revisionCount: number;
  lastActivity?: string;
  onOpen: () => void;
}> = ({ project, assets, exportCount, revisionCount, lastActivity, onOpen }) => {
  const sc = STATUS_COLORS[project.status] ?? STATUS_COLORS["To Edit"];
  const progress = STATUS_PROGRESS[project.status] ?? Math.min(100, Math.max(15, assets.length * 8));
  const firstImage = assets.find(a => a.thumbnail_path || ["THUMBNAILS", "GRAPHICS"].includes(a.category));
  const rawThumb = project.thumbnail_path || firstImage?.thumbnail_path || firstImage?.path || "";
  const thumbSrc = rawThumb && isTauri() ? convertFileSrc(rawThumb) : "";
  const [imgSrc, setImgSrc] = useState(thumbSrc);

  useEffect(() => {
    setImgSrc(thumbSrc);
  }, [thumbSrc]);

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-2xl border border-violet-500/35 bg-[#0b0913]/80 shadow-[0_0_24px_rgba(124,58,237,0.16)] p-4 hover:border-violet-400/55 hover:bg-[#100d1c]/85 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-bold text-white/65 uppercase tracking-widest font-outfit">Current Project</h2>
        <ChevronRight size={13} className="text-violet-400/70" />
      </div>

      <div className="flex gap-4 min-w-0">
        <div className="w-28 aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-violet-700/35 via-blue-500/20 to-black shrink-0 relative">
          {imgSrc ? (
            <img src={imgSrc} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setImgSrc("")} />
          ) : (
            <FolderOpen size={24} className="absolute inset-0 m-auto text-violet-300/45" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white font-outfit truncate">{project.name}</p>
              <p className="text-[10px] text-white/35 truncate">{project.clientName}</p>
            </div>
            <span className={cn("shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-md", sc.badge)}>
              {project.status}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full", sc.bar)} style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[10px] font-bold text-white/75 font-mono w-9 text-right">{progress}%</span>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-4">
            {[
              { label: "Assets", value: assets.length },
              { label: "Exports", value: exportCount },
              { label: "Revisions", value: revisionCount },
              { label: "Last Active", value: formatRelativeTime(lastActivity || project.created_at) },
            ].map(item => (
              <div key={item.label} className="min-w-0">
                <p className="text-[9px] text-white/35">{item.label}</p>
                <p className="text-xs font-bold text-white/85 truncate">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
};

export const Dashboard: React.FC = () => {
  const { setImportModalOpen, setNewClientModalOpen, setNewProjectModalOpen, setActiveTab, recentActivity, fetchRecentActivity } = useUiStore();
  const { storageStats, fetchStorageStats, assets, fetchAssets } = useAssetStore();
  const { clients, activeProjectId, setActiveProjectId } = useProjectStore();

  const [allDisks, setAllDisks] = useState<DiskStats[]>([]);
  const [assetFilter, setAssetFilter] = useState("All");
  const [currentExportCount, setCurrentExportCount] = useState(0);
  const [currentRevisionCount, setCurrentRevisionCount] = useState(0);

  useEffect(() => {
    fetchRecentActivity();
    fetchStorageStats();
    apiGetAllDiskStats().then(setAllDisks).catch(console.error);
    const iv = setInterval(fetchRecentActivity, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    fetchAssets(activeProjectId);
    apiGetProjectExports(activeProjectId).then(items => setCurrentExportCount(items.length)).catch(() => setCurrentExportCount(0));
    apiGetProjectRevisions(activeProjectId).then(items => setCurrentRevisionCount(items.length)).catch(() => setCurrentRevisionCount(0));
  }, [activeProjectId]);

  const formatBytes = (b: number, d = 1) => {
    if (!b) return "0 B"; const k = 1024;
    const s = ["B", "KB", "MB", "GB", "TB"]; const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(d)) + " " + s[i];
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  };

  const allProjects = clients.flatMap(c => c.projects.map(p => ({ ...p, clientName: c.name })));
  const currentProject = allProjects.find(p => p.id === activeProjectId) ?? allProjects[0];
  const currentProjectAssets = currentProject ? assets.filter(a => a.project_id === currentProject.id) : [];
  const currentProjectLastActivity = currentProject
    ? recentActivity.find(log => log.project_id === currentProject.id)?.created_at
    : undefined;

  const ASSET_FILTERS = ["All", "Video", "Audio", "Images", "Graphics"];
  const filteredAssets = assets.filter(a => {
    if (assetFilter === "All") return true;
    if (assetFilter === "Video") return a.category === "A_ROLL" || a.category === "B_ROLL";
    if (assetFilter === "Audio") return a.category === "AUDIO" || a.category === "MUSIC";
    if (assetFilter === "Images") return a.category === "THUMBNAILS";
    if (assetFilter === "Graphics") return a.category === "GRAPHICS";
    return true;
  }).slice(0, 12);

  const openProject = (id: string) => {
    setActiveProjectId(id);
    fetchAssets(id);
    setActiveTab("workspace");
  };

  const storageBreakdown = [
    { label: "Video", size: (storageStats?.size_by_category?.["A_ROLL"] ?? 0) + (storageStats?.size_by_category?.["B_ROLL"] ?? 0), color: "bg-violet-500" },
    { label: "Audio", size: (storageStats?.size_by_category?.["AUDIO"] ?? 0) + (storageStats?.size_by_category?.["MUSIC"] ?? 0), color: "bg-blue-500" },
    { label: "Images", size: (storageStats?.size_by_category?.["THUMBNAILS"] ?? 0), color: "bg-pink-500" },
    { label: "Graphics", size: (storageStats?.size_by_category?.["GRAPHICS"] ?? 0), color: "bg-cyan-500" },
    { label: "Project Files", size: (storageStats?.size_by_category?.["PROJECT_FILES"] ?? 0), color: "bg-amber-500" },
  ].filter(s => s.size > 0);

  // allDisks used directly in render

  return (
    <div className="flex-1 flex overflow-hidden select-none">

      {/* ── MAIN ── */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 min-w-0">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold font-outfit text-white">
              {getGreeting()}, VizWall Editor
            </h1>
            <p className="text-sm text-white/40 mt-1">
              Let's organize your creative assets and bring your ideas to life.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setNewProjectModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors">
              <Plus size={15} /> New Project
            </button>
          </div>
        </div>

        {currentProject && (
          <CurrentProjectHighlight
            project={currentProject}
            assets={currentProjectAssets}
            exportCount={currentExportCount}
            revisionCount={currentRevisionCount}
            lastActivity={currentProjectLastActivity}
            onOpen={() => openProject(currentProject.id)}
          />
        )}

        {/* Action cards — softer borderless */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { icon: <UploadCloud size={20} />,  iconColor: "text-violet-400",  title: "Import Folder", desc: "Auto-organize files",          action: () => setImportModalOpen(true) },
            { icon: <FolderPlus size={20} />,   iconColor: "text-emerald-400", title: "New Project",   desc: "Start a creative project",     action: () => setNewProjectModalOpen(true) },
            { icon: <Eye size={20} />,          iconColor: "text-cyan-400",    title: "Settings",      desc: "Workspace & naming",           action: () => setActiveTab("settings") },
          ].map(card => (
            <button key={card.title} onClick={card.action}
              className="text-left p-4 bg-white/[0.02] hover:bg-white/[0.04] rounded-2xl transition-colors group">
              <div className={cn("mb-3 transition-transform group-hover:scale-110", card.iconColor)}>
                {card.icon}
              </div>
              <p className="text-sm font-semibold text-white font-outfit">{card.title}</p>
              <p className="text-[11px] text-white/35 mt-0.5">{card.desc}</p>
            </button>
          ))}
        </div>

        {/* Activity Heatmap */}
        <ActivityHeatmapWidget />

        {/* Recent Projects */}
        {allProjects.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white font-outfit">Recent Projects</h2>
              <button onClick={() => setActiveTab("pipeline")} className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 font-medium">
                View All <ChevronRight size={11} />
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {allProjects.slice(0, 4).map(proj => {
                const sc = STATUS_COLORS[proj.status] ?? STATUS_COLORS["To Edit"];
                const projAssets = assets.filter(a => a.project_id === proj.id);
                const pct = Math.min(100, projAssets.length * 8);
                // Find latest export/revision video for hover-play
                const thumbPath = proj.thumbnail_path ?? null;
                const thumbSrc = thumbPath && isTauri() ? convertFileSrc(thumbPath) : "";
                const isVideoThumb = thumbPath ? /\.(mp4|mov|mkv|avi|mxf)$/i.test(thumbPath) : false;
                return (
                  <ProjectThumbCard
                    key={proj.id}
                    proj={proj}
                    sc={sc}
                    projAssets={projAssets}
                    pct={pct}
                    thumbSrc={thumbSrc}
                    isVideoThumb={isVideoThumb}
                    thumbPath={thumbPath}
                    onClick={() => openProject(proj.id)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Assets */}
        {assets.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white font-outfit">Recent Assets</h2>
              <button onClick={() => setActiveTab("workspace")} className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 font-medium">
                View All <ChevronRight size={11} />
              </button>
            </div>
            <div className="flex items-center gap-1">
              {ASSET_FILTERS.map(f => (
                <button key={f} onClick={() => setAssetFilter(f)}
                  className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-semibold transition-colors",
                    assetFilter === f ? "bg-violet-600/15 text-violet-400" : "text-white/35 hover:text-white/60 hover:bg-white/[0.03]"
                  )}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {filteredAssets.map(asset => (
                <AssetThumb key={asset.id} asset={asset} onClick={() => setActiveTab("workspace")} />
              ))}
              {filteredAssets.length === 0 && (
                <p className="text-[11px] text-white/25 italic py-4">No assets in this category.</p>
              )}
            </div>
          </div>
        )}

        {/* Activity Feed */}
        {recentActivity.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-white font-outfit flex items-center gap-2">
              <Activity size={13} className="text-violet-400" /> Activity
            </h2>
            <div className="bg-white/[0.02] rounded-2xl divide-y divide-white/[0.03] overflow-hidden">
              {recentActivity.slice(0, 5).map(log => {
                const iconMap: Record<string, { icon: React.ReactNode; color: string }> = {
                  IMPORT:         { icon: <UploadCloud size={11} />, color: "text-violet-400" },
                  RENAME:         { icon: <Wand2 size={11} />,      color: "text-blue-400" },
                  ORGANIZE:       { icon: <Wand2 size={11} />,      color: "text-violet-400" },
                  PROJECT_CREATE: { icon: <FolderPlus size={11} />,  color: "text-emerald-400" },
                  CLIENT_CREATE:  { icon: <Plus size={11} />,        color: "text-cyan-400" },
                  PROJECT_DELETE: { icon: <Trash2 size={11} />,      color: "text-red-400" },
                };
                const meta = iconMap[log.action_type] ?? { icon: <Clock size={11} />, color: "text-white/40" };

                const timeAgo = (() => {
                  const now = new Date();
                  const then = new Date(log.created_at.replace(" ", "T"));
                  const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
                  if (diff < 60) return `${diff}s ago`;
                  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                  return `${Math.floor(diff / 86400)}d ago`;
                })();

                return (
                  <div key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cn("shrink-0", meta.color)}>{meta.icon}</span>
                    <span className="flex-1 text-xs text-white/55 truncate">{log.details}</span>
                    <span className="text-[9px] text-white/25 font-mono shrink-0">{timeAgo}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {allProjects.length === 0 && assets.length === 0 && recentActivity.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-600/10 flex items-center justify-center mb-4">
              <FolderPlus size={28} className="text-violet-400" />
            </div>
            <h3 className="text-base font-bold text-white/60 mb-2">Welcome to VizWall</h3>
            <p className="text-sm text-white/30 max-w-xs mb-6">
              Create your first client and project to get started.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setNewClientModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition-colors">
                <Plus size={13} /> Add First Client
              </button>
              <button onClick={() => setImportModalOpen(true)}
                className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-white/70 text-xs font-semibold rounded-xl transition-colors">
                Import Folder
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="w-72 shrink-0 bg-[#0a0910] overflow-y-auto p-5 space-y-5">

        {/* Storage — all drives ── */}
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold text-white/35 uppercase tracking-widest font-outfit">Storage</h3>

          {allDisks.length === 0 && (
            <p className="text-[10px] text-white/25 italic">No drives detected</p>
          )}

          {allDisks.map((disk, idx) => {
            const pct = disk.total_bytes > 0
              ? Math.min((disk.used_bytes / disk.total_bytes) * 100, 100) : 0;
            const isMain = idx === 0;
            return (
              <div key={disk.mount_point} className={cn("space-y-1.5", idx > 0 && "pt-2 border-t border-white/[0.03]")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/55">
                    <HardDrive size={10} className={isMain ? "text-violet-400" : "text-white/30"} />
                    <span className="font-mono font-medium">{disk.mount_point}</span>
                    {disk.drive_label && disk.drive_label !== disk.mount_point && (
                      <span className="text-white/25 truncate max-w-[80px]">{disk.drive_label}</span>
                    )}
                  </div>
                  <span className="text-[9px] text-white/30 font-mono">{Math.round(pct)}%</span>
                </div>
                <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", isMain ? "bg-gradient-to-r from-violet-500 to-blue-500" : "bg-white/20")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-white/25 font-mono">
                  <span>{formatBytes(disk.free_bytes)} free</span>
                  <span>{formatBytes(disk.total_bytes)}</span>
                </div>
              </div>
            );
          })}

          {/* Asset storage breakdown */}
          {storageBreakdown.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-white/[0.03]">
              <p className="text-[9px] text-white/20 uppercase tracking-widest font-mono">Assets by type</p>
              {storageBreakdown.map(s => (
                <div key={s.label} className="flex items-center gap-2 text-[10px]">
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.color)} />
                  <span className="text-white/45 flex-1">{s.label}</span>
                  <span className="text-white/30 font-mono">{formatBytes(s.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-1 pt-4 border-t border-white/[0.04]">
          <h3 className="text-[11px] font-bold text-white/35 uppercase tracking-widest font-outfit mb-2 px-1">Quick Actions</h3>
          {[
            { label: "Asset Workspace", icon: <FolderOpen size={13} />, onClick: () => setActiveTab("workspace") },
            { label: "View Pipeline",   icon: <Eye size={13} />,        onClick: () => setActiveTab("pipeline") },
            { label: "Settings",        icon: <HardDrive size={13} />,  onClick: () => setActiveTab("settings") },
          ].map(a => (
            <button key={a.label} onClick={a.onClick}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.04] text-[11px] text-white/55 hover:text-white transition-colors group">
              <span className="text-white/35 group-hover:text-white/70 transition-colors">{a.icon}</span>
              <span className="flex-1 text-left">{a.label}</span>
              <ChevronRight size={11} className="text-white/15 group-hover:text-white/35 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  FolderClosed, ChevronRight, Archive, Trash2,
  Play, Clock, GripVertical, FolderOpen, Calendar,
  StickyNote, X, Check,
} from "lucide-react";
import { useProjectStore } from "../stores/useProjectStore";
import { useAssetStore } from "../stores/useAssetStore";
import { useUiStore } from "../stores/useUiStore";
import { isTauri, apiAutoSetProjectThumbnail } from "../lib/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { cn } from "../lib/utils";

interface Column {
  id: string;
  title: string;
  color: string;
}

const COLUMNS: Column[] = [
  { id: "To Edit",       title: "To Edit",       color: "border-t-slate-500 bg-slate-500/5 text-slate-400" },
  { id: "In Progress",   title: "In Progress",   color: "border-t-violet-500 bg-violet-500/5 text-violet-400" },
  { id: "Client Review", title: "Client Review", color: "border-t-blue-500 bg-blue-500/5 text-blue-400" },
  { id: "Revisions",     title: "Revisions",     color: "border-t-amber-500 bg-amber-500/5 text-amber-400" },
  { id: "Approved",      title: "Approved",      color: "border-t-emerald-500 bg-emerald-500/5 text-emerald-400" },
  { id: "Exported",      title: "Exported",      color: "border-t-cyan-500 bg-cyan-500/5 text-cyan-400" },
];

// ── Context menu ──────────────────────────────────────────────────────────
interface ContextMenuState {
  x: number;
  y: number;
  projectId: string;
  projectName: string;
  status: string;
}

// ── Deadline badge helpers ────────────────────────────────────────────────
function deadlineBadge(deadline: string | undefined): { label: string; color: string } | null {
  if (!deadline) return null;
  const now = new Date();
  const due = new Date(deadline + "T00:00:00");
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0)   return { label: "Overdue",    color: "text-red-400 bg-red-500/10" };
  if (diffDays === 0) return { label: "Due today",  color: "text-orange-400 bg-orange-500/10" };
  if (diffDays <= 3)  return { label: `${diffDays}d`, color: "text-amber-400 bg-amber-500/10" };
  if (diffDays <= 7)  return { label: `${diffDays}d`, color: "text-yellow-400/80 bg-yellow-500/8" };
  return { label: deadline, color: "text-white/25 bg-white/[0.03]" };
}

// ── Inline deadline editor ────────────────────────────────────────────────
const DeadlineEditor: React.FC<{
  projectId: string;
  deadline?: string;
  onUpdate: (projectId: string, deadline: string | null) => void;
}> = ({ projectId, deadline, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(deadline ?? "");
  const badge = deadlineBadge(deadline);

  const commit = () => {
    setEditing(false);
    onUpdate(projectId, val || null);
  };

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        onMouseDown={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        className="w-full text-[9px] font-mono bg-white/[0.06] text-white rounded px-1.5 py-0.5 focus:outline-none [color-scheme:dark]"
      />
    );
  }

  return (
    <button
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      className={cn(
        "flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors",
        badge ? badge.color : "text-white/20 hover:text-white/50 hover:bg-white/[0.04]"
      )}
      title="Click to set deadline"
    >
      <Clock size={8} />
      {badge ? badge.label : "Set deadline"}
    </button>
  );
};

// ── Project card type ─────────────────────────────────────────────────────
interface CardData {
  id: string;
  name: string;
  status: string;
  created_at: string;
  clientName: string;
  thumbnail_path?: string;
  deadline?: string;
  notes?: string;
}

// ── Visual project card ───────────────────────────────────────────────────
interface ProjectCardProps {
  proj: CardData;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onSingleClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onArchive: () => void;
  onDeadlineUpdate: (projectId: string, deadline: string | null) => void;
  onNotesClick: (e: React.MouseEvent) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  proj, isDragging, onPointerDown, onSingleClick, onDoubleClick, onContextMenu, onArchive, onDeadlineUpdate, onNotesClick,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [thumbSrc, setThumbSrc] = useState(() => {
    if (proj.thumbnail_path && isTauri()) return convertFileSrc(proj.thumbnail_path);
    return "";
  });
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | null>(null);

  // Update thumbSrc when thumbnail_path changes (e.g. after auto-generation)
  useEffect(() => {
    if (proj.thumbnail_path && isTauri()) {
      setThumbSrc(convertFileSrc(proj.thumbnail_path));
    }
  }, [proj.thumbnail_path]);

  const isVideoThumb = proj.thumbnail_path
    ? /\.(mp4|mov|mkv|avi|mxf)$/i.test(proj.thumbnail_path)
    : false;

  const isCompletedStatus = ["Approved", "Exported", "Delivered"].includes(proj.status);

  const startHoverPlay = useCallback(() => {
    if (!isVideoThumb || !proj.thumbnail_path || !isTauri() || isDragging) return;
    hoverTimer.current = setTimeout(() => {
      setPlaying(true);
      videoRef.current?.play().catch(() => {});
    }, 350);
  }, [isVideoThumb, proj.thumbnail_path, isDragging]);

  const stopHoverPlay = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    setPlaying(false);
  }, []);

  // Distinguish single vs double click with a short delay
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clickTimer.current) {
      // Second click within 300ms → double click
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onDoubleClick();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onSingleClick();
      }, 280);
    }
  };

  return (
    <div
      data-card-id={proj.id}
      onPointerDown={onPointerDown}
      onMouseEnter={startHoverPlay}
      onMouseLeave={stopHoverPlay}
      onContextMenu={onContextMenu}
      onClick={handleClick}
      className={cn(
        "rounded-lg overflow-hidden group relative touch-none select-none",
        isDragging
          ? "opacity-30 cursor-grabbing bg-[#12101e]/40"
          : "cursor-grab bg-[#12101e]/60 hover:bg-[#151224]/80 transition-colors"
      )}
    >
      {/* Drag affordance */}
      <div className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
        <GripVertical size={10} className="text-white/40" />
      </div>

      {/* Thumbnail — blurred bg fill + contained sharp image, handles portrait & landscape */}
      <div className="aspect-video relative overflow-hidden bg-[#0a0910]">
        {thumbSrc && !playing && (
          <>
            {/* Blurred background fill for letterboxed/portrait content */}
            <img
              src={thumbSrc}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover opacity-30 blur-md scale-110 pointer-events-none"
              onError={() => {}}
            />
            {/* Sharp foreground — contained so portrait thumbnails aren't cropped */}
            <img
              src={thumbSrc}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              onError={() => setThumbSrc("")}
              onLoad={e => {
                const img = e.currentTarget;
                setOrientation(img.naturalHeight > img.naturalWidth ? "portrait" : "landscape");
              }}
            />
          </>
        )}
        {isVideoThumb && proj.thumbnail_path && isTauri() && (
          <video
            ref={videoRef}
            src={playing ? convertFileSrc(proj.thumbnail_path) : undefined}
            className={cn(
              "absolute inset-0 w-full h-full pointer-events-none transition-opacity",
              orientation === "portrait" ? "object-contain" : "object-cover",
              playing ? "opacity-100" : "opacity-0"
            )}
            muted loop playsInline preload="none"
          />
        )}
        {!thumbSrc && !playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-gradient-to-br from-violet-900/20 to-blue-900/10">
            <FolderClosed size={18} className="text-violet-500/20" />
          </div>
        )}
        {isVideoThumb && !playing && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <Play size={10} className="text-white fill-white ml-0.5" />
            </div>
          </div>
        )}
        {isCompletedStatus && (
          <button
            onMouseDown={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onArchive(); }}
            className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/50 backdrop-blur-sm text-white/40 hover:text-amber-400 hover:bg-amber-500/20 transition-colors opacity-0 group-hover:opacity-100"
            title="Archive project"
          >
            <Archive size={10} />
          </button>
        )}
      </div>

      {/* Card body */}
      <div className="p-2.5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-white/30 group-hover:text-violet-400 transition-colors min-w-0">
            <FolderClosed size={10} className="shrink-0" />
            <span className="text-[9px] font-mono tracking-wide uppercase truncate">
              {proj.clientName}
            </span>
          </div>
          <ChevronRight size={9} className="text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
        </div>

        <h4 className="text-[11px] font-semibold text-white/80 group-hover:text-white mb-2 font-outfit truncate">
          {proj.name}
        </h4>

        <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.04]">
          <DeadlineEditor
            projectId={proj.id}
            deadline={proj.deadline}
            onUpdate={onDeadlineUpdate}
          />
          <div className="flex items-center gap-1">
            <button
              onMouseDown={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              onClick={onNotesClick}
              className={cn(
                "p-1 rounded transition-colors",
                proj.notes
                  ? "text-violet-400/70 hover:text-violet-300"
                  : "text-white/15 hover:text-white/40 hover:bg-white/[0.04]"
              )}
              title={proj.notes ? "View/edit notes" : "Add notes"}
            >
              <StickyNote size={9} />
            </button>
            <span className="text-[8px] text-white/20 font-mono">
              {proj.created_at.split(" ")[0]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Notes panel ───────────────────────────────────────────────────────────
const NotesPanel: React.FC<{
  proj: CardData;
  onClose: () => void;
  onSave: (projectId: string, notes: string) => void;
}> = ({ proj, onClose, onSave }) => {
  const [value, setValue] = useState(proj.notes ?? "");
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSave = () => {
    onSave(proj.id, value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div
        className="w-full max-w-sm bg-[#0e0c15] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
          <div className="flex items-center gap-2">
            <StickyNote size={12} className="text-violet-400" />
            <div>
              <p className="text-xs font-semibold text-white font-outfit truncate max-w-[200px]">{proj.name}</p>
              <p className="text-[9px] text-white/30">{proj.clientName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white transition-colors">
            <X size={13} />
          </button>
        </div>
        <div className="p-4">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Add notes, links, client feedback, revision requests…"
            rows={8}
            className="w-full bg-white/[0.03] border border-white/[0.06] focus:border-violet-500/40 rounded-xl px-3 py-2.5 text-xs text-white/80 placeholder-white/20 focus:outline-none resize-none transition-colors"
          />
        </div>
        <div className="px-4 pb-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-white/40 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5",
              saved
                ? "bg-emerald-600/20 text-emerald-400"
                : "bg-violet-600 hover:bg-violet-500 text-white"
            )}
          >
            {saved ? <><Check size={10} /> Saved</> : "Save Notes"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Dragging state ────────────────────────────────────────────────────────
interface DragState {
  card: CardData;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  currentX: number;
  currentY: number;
  hoverColumn: string | null;
  moved: boolean;
}

// ── Context Menu Component ────────────────────────────────────────────────
const KanbanContextMenu: React.FC<{
  menu: ContextMenuState;
  onClose: () => void;
  onOpenWorkspace: (id: string) => void;
  onArchive: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
  onSetDeadline: () => void;
}> = ({ menu, onClose, onOpenWorkspace, onArchive, onDelete, onSetDeadline }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Adjust position so menu doesn't go off-screen
  const style: React.CSSProperties = {
    position: "fixed",
    left: menu.x,
    top: menu.y,
    zIndex: 9999,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="w-48 bg-[#0e0c15] border border-white/[0.08] rounded-xl shadow-2xl py-1 overflow-hidden"
    >
      <button
        onClick={() => { onOpenWorkspace(menu.projectId); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors text-left"
      >
        <FolderOpen size={12} className="text-violet-400" />
        Open in Workspace
      </button>
      <button
        onClick={() => { onSetDeadline(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors text-left"
      >
        <Calendar size={12} className="text-blue-400" />
        Set Deadline
      </button>
      <div className="mx-2 my-1 h-px bg-white/[0.05]" />
      <button
        onClick={() => { onArchive(menu.projectId, menu.projectName); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/70 hover:text-amber-400 hover:bg-amber-500/[0.06] transition-colors text-left"
      >
        <Archive size={12} className="text-amber-400" />
        Archive Project
      </button>
      <button
        onClick={() => { onDelete(menu.projectId, menu.projectName); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/70 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors text-left"
      >
        <Trash2 size={12} className="text-red-400" />
        Delete Project
      </button>
    </div>
  );
};

// ── Main KanbanBoard ──────────────────────────────────────────────────────
export const KanbanBoard: React.FC<{ searchQuery?: string }> = ({ searchQuery = "" }) => {
  const { clients, updateProjectStatus, updateProjectDeadline, updateProjectNotes, setActiveProjectId, archiveProject, deleteProject } = useProjectStore();
  const { fetchAssets } = useAssetStore();
  const { setActiveTab } = useUiStore();

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [notesProject, setNotesProject] = useState<CardData | null>(null);

  // Auto-generate thumbnails for projects that don't have one yet
  // Runs in the background — one project at a time to avoid hammering ffmpeg
  useEffect(() => {
    if (!isTauri()) return;
    const projectsMissingThumb = clients
      .flatMap(c => c.projects)
      .filter(p => !p.thumbnail_path && p.path);
    if (projectsMissingThumb.length === 0) return;

    let cancelled = false;
    const run = async () => {
      try {
        const cacheDir = await appDataDir() + "thumbnails";
        for (const proj of projectsMissingThumb) {
          if (cancelled) break;
          try {
            const thumb = await apiAutoSetProjectThumbnail(proj.id, cacheDir);
            if (thumb && !cancelled) {
              // Optimistically update the store so the card shows the thumb immediately
              useProjectStore.setState(state => ({
                clients: state.clients.map(c => ({
                  ...c,
                  projects: c.projects.map(p =>
                    p.id === proj.id ? { ...p, thumbnail_path: thumb } : p
                  ),
                })),
              }));
            }
          } catch {
            // No video files found or ffmpeg unavailable — skip silently
          }
        }
      } catch {
        // appDataDir unavailable — skip
      }
    };
    // Small delay so the board renders first
    const t = setTimeout(run, 800);
    return () => { cancelled = true; clearTimeout(t); };
  }, [clients]);

  useEffect(() => { dragRef.current = drag; }, [drag]);

  const allProjectsWithClient: CardData[] = clients.flatMap(client =>
    client.projects.map(proj => ({
      id: proj.id,
      name: proj.name,
      status: proj.status,
      created_at: proj.created_at,
      clientName: client.name,
      thumbnail_path: proj.thumbnail_path,
      deadline: proj.deadline,
      notes: proj.notes,
    }))
  );

  // Filter by search query
  const q = searchQuery.toLowerCase().trim();
  const filteredProjects = q
    ? allProjectsWithClient.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q) ||
        (p.notes && p.notes.toLowerCase().includes(q))
      )
    : allProjectsWithClient;

  const findColumnAt = useCallback((x: number, y: number): string | null => {
    const cols = document.querySelectorAll<HTMLElement>("[data-column-id]");
    for (const el of cols) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return el.dataset.columnId ?? null;
      }
    }
    return null;
  }, []);

  const handleCardPointerDown = useCallback((e: React.PointerEvent, card: CardData) => {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    setDrag({
      card,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      currentX: e.clientX,
      currentY: e.clientY,
      hoverColumn: card.status,
      moved: false,
    });
  }, []);

  useEffect(() => {
    if (!drag) return;

    const SCROLL_ZONE = 80;
    const SCROLL_SPEED = 12;

    const startAutoScroll = (clientX: number) => {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
      const board = boardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const distFromLeft  = clientX - rect.left;
      const distFromRight = rect.right - clientX;
      let scrollDir = 0;
      let intensity = 1;
      if (distFromLeft < SCROLL_ZONE) {
        scrollDir = -1;
        intensity = 1 - distFromLeft / SCROLL_ZONE;
      } else if (distFromRight < SCROLL_ZONE) {
        scrollDir = 1;
        intensity = 1 - distFromRight / SCROLL_ZONE;
      }
      if (scrollDir === 0) return;
      const step = () => {
        if (!boardRef.current || !dragRef.current?.moved) return;
        boardRef.current.scrollLeft += scrollDir * SCROLL_SPEED * (0.5 + intensity * 0.5);
        scrollAnimRef.current = requestAnimationFrame(step);
      };
      scrollAnimRef.current = requestAnimationFrame(step);
    };

    const stopAutoScroll = () => {
      if (scrollAnimRef.current) { cancelAnimationFrame(scrollAnimRef.current); scrollAnimRef.current = null; }
    };

    const handleMove = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const dx = e.clientX - current.startX;
      const dy = e.clientY - current.startY;
      const moved = current.moved || Math.hypot(dx, dy) > 5;
      const hoverColumn = findColumnAt(e.clientX, e.clientY);
      setDrag({ ...current, currentX: e.clientX, currentY: e.clientY, moved, hoverColumn });
      if (moved) startAutoScroll(e.clientX);
    };

    const handleUp = async (e: PointerEvent) => {
      stopAutoScroll();
      const current = dragRef.current;
      if (!current) return;
      const targetColumn = findColumnAt(e.clientX, e.clientY);
      if (current.moved && targetColumn && targetColumn !== current.card.status) {
        await updateProjectStatus(current.card.id, targetColumn);
      }
      setDrag(null);
    };

    const handleCancel = () => { stopAutoScroll(); setDrag(null); };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleCancel);
    document.addEventListener("contextmenu", handleCancel);

    return () => {
      stopAutoScroll();
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleCancel);
      document.removeEventListener("contextmenu", handleCancel);
    };
  }, [drag, findColumnAt, updateProjectStatus]);

  const openProject = (projectId: string) => {
    setActiveProjectId(projectId);
    fetchAssets(projectId);
    setActiveTab("workspace");
  };

  const handleProjectClick = (projectId: string) => {
    // Single click — just select the project
    setActiveProjectId(projectId);
  };

  const handleProjectDoubleClick = (projectId: string) => {
    // Double click — navigate to workspace
    openProject(projectId);
  };

  const handleContextMenu = (e: React.MouseEvent, proj: CardData) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, projectId: proj.id, projectName: proj.name, status: proj.status });
  };

  const handleArchive = async (projectId: string, projectName: string) => {
    if (!window.confirm(`Archive "${projectName}"? It will be held in the Archive tab before permanent deletion.`)) return;
    await archiveProject(projectId);
  };

  const handleDelete = async (projectId: string, projectName: string) => {
    if (!window.confirm(`Delete "${projectName}"? This removes it from VizWall. Files on disk are not deleted.`)) return;
    await deleteProject(projectId);
  };

  const handleDeadlineUpdate = async (projectId: string, deadline: string | null) => {
    await updateProjectDeadline(projectId, deadline);
  };

  const handleNotesClick = (e: React.MouseEvent, proj: CardData) => {
    e.stopPropagation();
    setNotesProject(proj);
  };

  const handleNotesSave = async (projectId: string, notes: string) => {
    await updateProjectNotes(projectId, notes);
    // Update local notesProject so the panel reflects the saved value
    setNotesProject(prev => prev && prev.id === projectId ? { ...prev, notes } : prev);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-[#09080e]/40 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold font-outfit text-white">Pipeline</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {q
              ? `${filteredProjects.length} result${filteredProjects.length !== 1 ? "s" : ""} for "${searchQuery}"`
              : "Drag cards between columns · Double-click to open · Right-click for options"
            }
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/25">
          <Archive size={10} className="text-amber-400/50" />
          <span>Hover completed card to archive</span>
        </div>
      </div>

      {/* Board */}
      <div ref={boardRef} className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-3 items-start">
        {COLUMNS.map(column => {
          const columnProjects = filteredProjects.filter(p =>
            !(drag?.card.id === p.id) && p.status === column.id
          );
          const isOver = drag?.hoverColumn === column.id && drag?.moved;
          const isSourceColumn = drag?.card.status === column.id;

          return (
            <div
              key={column.id}
              data-column-id={column.id}
              className={cn(
                "w-64 shrink-0 flex flex-col rounded-xl transition-all duration-150",
                isOver ? "bg-violet-950/40 ring-2 ring-violet-500/60" : "bg-[#0b0a13]/40"
              )}
              style={{ minHeight: "440px" }}
            >
              {/* Column header */}
              <div className={cn(
                "p-3 border-t-2 flex items-center justify-between rounded-t-xl bg-[#0e0c15]/80",
                column.color
              )}>
                <span className="text-[10px] font-bold font-outfit uppercase tracking-wider">{column.title}</span>
                <span className="text-[9px] bg-white/[0.05] font-mono px-1.5 py-0.5 rounded-full text-white/40">
                  {columnProjects.length + (isSourceColumn ? 1 : 0)}
                </span>
              </div>

              {/* Cards list */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ minHeight: "360px" }}>
                {isOver && !isSourceColumn && drag && (
                  <div
                    className="rounded-lg border-2 border-dashed border-violet-500/50 bg-violet-500/10"
                    style={{ height: drag.height }}
                  />
                )}

                {columnProjects.map(proj => (
                  <ProjectCard
                    key={proj.id}
                    proj={proj}
                    isDragging={false}
                    onPointerDown={e => handleCardPointerDown(e, proj)}
                    onSingleClick={() => handleProjectClick(proj.id)}
                    onDoubleClick={() => handleProjectDoubleClick(proj.id)}
                    onContextMenu={e => handleContextMenu(e, proj)}
                    onArchive={() => handleArchive(proj.id, proj.name)}
                    onDeadlineUpdate={handleDeadlineUpdate}
                    onNotesClick={e => handleNotesClick(e, proj)}
                  />
                ))}

                {columnProjects.length === 0 && !isOver && !isSourceColumn && (
                  <div className="h-16 flex items-center justify-center border border-dashed border-white/[0.06] rounded-lg opacity-40 pointer-events-none">
                    <span className="text-[10px] text-white/30 italic">Drop projects here</span>
                  </div>
                )}

                {isSourceColumn && drag && (
                  <div
                    className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02]"
                    style={{ height: drag.height }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating drag preview */}
      {drag && drag.moved && (
        <div
          className="fixed z-[100] pointer-events-none rounded-lg overflow-hidden bg-[#151224]/95 backdrop-blur-sm shadow-2xl ring-2 ring-violet-500/40"
          style={{
            left: drag.currentX - drag.offsetX,
            top: drag.currentY - drag.offsetY,
            width: drag.width,
            transform: "rotate(-2deg) scale(1.02)",
            transition: "transform 0.05s ease-out",
          }}
        >
          <div className="aspect-video bg-[#0a0910] flex items-center justify-center relative overflow-hidden">
            {drag.card.thumbnail_path && isTauri() ? (
              <>
                <img src={convertFileSrc(drag.card.thumbnail_path)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 blur-md scale-110" onError={() => {}} />
                <img src={convertFileSrc(drag.card.thumbnail_path)} alt="" className="absolute inset-0 w-full h-full object-contain" onError={() => {}} />
              </>
            ) : (
              <FolderClosed size={20} className="text-violet-500/40" />
            )}
          </div>
          <div className="p-2.5">
            <div className="flex items-center gap-1.5 text-violet-400 mb-1">
              <FolderClosed size={10} />
              <span className="text-[9px] font-mono tracking-wide uppercase truncate">{drag.card.clientName}</span>
            </div>
            <h4 className="text-[11px] font-semibold text-white truncate font-outfit">{drag.card.name}</h4>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <KanbanContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpenWorkspace={openProject}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onSetDeadline={() => {
            setContextMenu(null);
          }}
        />
      )}

      {/* Notes panel */}
      {notesProject && (
        <NotesPanel
          proj={notesProject}
          onClose={() => setNotesProject(null)}
          onSave={handleNotesSave}
        />
      )}
    </div>
  );
};

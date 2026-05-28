import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Play, FileText, Music, Image as ImageIcon, Star,
  FolderSearch, Video, Volume2,
  Heart, Trash2, Tag, FolderInput,
} from "lucide-react";
import {
  Asset, apiRevealInExplorer, apiGenerateThumbnail,
  apiDeleteAsset, apiUpdateAssetCategory, apiDragFile, isTauri,
} from "../lib/tauri";
import { useAssetStore } from "../stores/useAssetStore";
import { cn } from "../lib/utils";
import { appDataDir } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";

interface AssetCardProps {
  asset: Asset;
  onSelect: (asset: Asset) => void;
  isSelected: boolean;
  viewMode?: "grid" | "list";
  onQuickLook?: (asset: Asset) => void;
  onRefresh?: () => void;
  onLibFavoriteToggle?: () => void; // for library assets not in DB
}

function toSrc(p: string) {
  return isTauri() ? convertFileSrc(p) : "";
}

// ── Waveform preview for audio files ─────────────────────────────────────
interface WaveformProps {
  src: string;
  isHovering: boolean;
  accentColor: string; // tailwind color value like "#3b82f6"
  shouldDecode: boolean;
}

const WaveformPreview: React.FC<WaveformProps> = ({ src, isHovering, accentColor, shouldDecode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number | null>(null);
  const [waveData, setWaveData] = useState<Float32Array | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  // Decode audio and extract waveform data once
  useEffect(() => {
    if (!src || !isTauri() || !shouldDecode) return;
    let cancelled = false;
    setLoading(true);

    const decode = async () => {
      try {
        const ctx = new AudioContext();
        const resp = await fetch(src);
        const buf = await resp.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        if (cancelled) return;

        // Downsample to ~200 bars
        const raw = decoded.getChannelData(0);
        const bars = 200;
        const step = Math.floor(raw.length / bars);
        const data = new Float32Array(bars);
        for (let i = 0; i < bars; i++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            max = Math.max(max, Math.abs(raw[i * step + j] ?? 0));
          }
          data[i] = max;
        }
        setWaveData(data);
        ctx.close();
      } catch {
        // audio decode failed — no waveform
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    decode();
    return () => { cancelled = true; };
  }, [src, shouldDecode]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const barW = W / waveData.length;
    const playedX = playProgress * W;

    for (let i = 0; i < waveData.length; i++) {
      const x = i * barW;
      const barH = Math.max(2, waveData[i] * H * 0.85);
      const y = (H - barH) / 2;

      // Played portion brighter, unplayed dimmer
      ctx.fillStyle = x < playedX ? accentColor : accentColor + '55';
      ctx.fillRect(x + 0.5, y, Math.max(1, barW - 1), barH);
    }
  }, [waveData, playProgress, accentColor]);

  // Play/pause on hover
  useEffect(() => {
    if (!src || !isTauri()) return;

    if (isHovering) {
      if (!audioRef.current) {
        audioRef.current = new Audio(src);
        audioRef.current.volume = 0.7;
      }
      audioRef.current.play().catch(() => {});

      // Animate progress
      const tick = () => {
        const a = audioRef.current;
        if (a && a.duration > 0) {
          setPlayProgress(a.currentTime / a.duration);
        }
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setPlayProgress(0);
      }
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isHovering, src]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
      {waveData ? (
        <canvas
          ref={canvasRef}
          width={300}
          height={80}
          className="w-full h-full"
          style={{ imageRendering: "pixelated" }}
        />
      ) : !loading && (
        // Animated bars placeholder while no waveform
        <div className="flex items-end gap-[2px] h-8 px-2 w-full justify-center">
          {Array.from({ length: 32 }, (_, i) => (
            <div
              key={i}
              className="flex-1 rounded-full opacity-40"
              style={{
                backgroundColor: accentColor,
                height: `${20 + Math.sin(i * 0.8) * 15 + Math.cos(i * 0.4) * 10}%`,
                animationDelay: `${i * 0.05}s`,
                animation: isHovering ? `pulse 0.8s ease-in-out ${i * 0.04}s infinite alternate` : 'none',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Tag color map — maps tag strings to display styles ────────────────────
const TAG_META: Record<string, { label: string; color: string; bg: string }> = {
  // Category tags
  A_ROLL:        { label: "A-Roll",      color: "text-red-300",     bg: "bg-red-500/12" },
  B_ROLL:        { label: "B-Roll",      color: "text-violet-300",  bg: "bg-violet-500/12" },
  VOICEOVER:     { label: "Voiceover",   color: "text-sky-300",     bg: "bg-sky-500/12" },
  SFX:           { label: "SFX",         color: "text-orange-300",  bg: "bg-orange-500/12" },
  MUSIC:         { label: "Music",       color: "text-emerald-300", bg: "bg-emerald-500/12" },
  AUDIO:         { label: "Audio",       color: "text-blue-300",    bg: "bg-blue-500/12" },
  GRAPHICS:      { label: "Graphics",    color: "text-cyan-300",    bg: "bg-cyan-500/12" },
  THUMBNAILS:    { label: "Thumbnail",   color: "text-pink-300",    bg: "bg-pink-500/12" },
  EXPORTS:       { label: "Export",      color: "text-teal-300",    bg: "bg-teal-500/12" },
  PROJECT_FILES: { label: "Project",     color: "text-amber-300",   bg: "bg-amber-500/12" },
  ARCHIVE:       { label: "Archive",     color: "text-slate-300",   bg: "bg-slate-500/12" },
  // Descriptive tags
  Interview:     { label: "Interview",   color: "text-red-300",     bg: "bg-red-500/10" },
  "A-Roll":      { label: "A-Roll",      color: "text-red-300",     bg: "bg-red-500/10" },
  "B-Roll":      { label: "B-Roll",      color: "text-violet-300",  bg: "bg-violet-500/10" },
  Drone:         { label: "Drone",       color: "text-blue-300",    bg: "bg-blue-500/10" },
  "Slow-Mo":     { label: "Slow-Mo",     color: "text-indigo-300",  bg: "bg-indigo-500/10" },
  Raw:           { label: "Raw",         color: "text-white/50",    bg: "bg-white/[0.05]" },
  Export:        { label: "Export",      color: "text-teal-300",    bg: "bg-teal-500/10" },
  Thumbnail:     { label: "Thumbnail",   color: "text-pink-300",    bg: "bg-pink-500/10" },
  Graphics:      { label: "Graphics",    color: "text-cyan-300",    bg: "bg-cyan-500/10" },
  Music:         { label: "Music",       color: "text-emerald-300", bg: "bg-emerald-500/10" },
  Voiceover:     { label: "Voiceover",   color: "text-sky-300",     bg: "bg-sky-500/10" },
};

// File extension → display label (skip raw extensions as tags)
const EXT_SKIP = new Set([
  "mp4","mov","mkv","avi","mxf","m4v","wmv","webm","ts",
  "mp3","wav","aac","flac","ogg","m4a","aiff","aif","wma",
  "png","jpg","jpeg","gif","webp","bmp","tiff","tif","heic",
  "mogrt","aet","aepx","ffx","prfpset","ttf","otf","woff","woff2",
  "prproj","drp","aep","fcpx","capcut","psd","ai","pdf","txt","xml","json",
  "cube","3dl","lut","lrv","thm","srt","sub","vtt",
]);

// Tags that duplicate the category badge — skip them
const CATEGORY_TAG_SKIP = new Set([
  "A_ROLL","B_ROLL","VOICEOVER","SFX","MUSIC","AUDIO","GRAPHICS",
  "THUMBNAILS","EXPORTS","PROJECT_FILES","ARCHIVE",
]);

function getDisplayTags(asset: Asset): { label: string; color: string; bg: string }[] {
  const seen = new Set<string>();
  const result: { label: string; color: string; bg: string }[] = [];

  for (const tag of asset.tags) {
    const key = tag.trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());

    // Skip raw extensions
    if (EXT_SKIP.has(key.toLowerCase())) continue;
    // Skip category duplicates (already shown as badge on thumbnail)
    if (CATEGORY_TAG_SKIP.has(key)) continue;

    const meta = TAG_META[key];
    if (meta) {
      result.push(meta);
    } else {
      // Unknown tag — show as neutral chip
      result.push({ label: key, color: "text-white/40", bg: "bg-white/[0.05]" });
    }

    if (result.length >= 3) break; // max 3 tags shown
  }
  return result;
}

export const CATEGORY_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  A_ROLL:        { label: "A-Roll",        color: "text-red-300",    bg: "bg-red-500/15",    border: "border-red-500/30" },
  B_ROLL:        { label: "B-Roll",        color: "text-violet-300", bg: "bg-violet-500/15", border: "border-violet-500/30" },
  AUDIO:         { label: "Audio VO",      color: "text-blue-300",   bg: "bg-blue-500/15",   border: "border-blue-500/30" },
  VOICEOVER:     { label: "Voiceover",     color: "text-sky-300",    bg: "bg-sky-500/15",    border: "border-sky-500/30" },
  SFX:           { label: "SFX",           color: "text-orange-300", bg: "bg-orange-500/15", border: "border-orange-500/30" },
  MUSIC:         { label: "Music",         color: "text-emerald-300",bg: "bg-emerald-500/15",border: "border-emerald-500/30" },
  GRAPHICS:      { label: "Graphics",      color: "text-cyan-300",   bg: "bg-cyan-500/15",   border: "border-cyan-500/30" },
  THUMBNAILS:    { label: "Thumbnail",     color: "text-pink-300",   bg: "bg-pink-500/15",   border: "border-pink-500/30" },
  EXPORTS:       { label: "Export",        color: "text-teal-300",   bg: "bg-teal-500/15",   border: "border-teal-500/30" },
  PROJECT_FILES: { label: "Project File",  color: "text-amber-300",  bg: "bg-amber-500/15",  border: "border-amber-500/30" },
  ARCHIVE:       { label: "Archive",       color: "text-slate-300",  bg: "bg-slate-500/15",  border: "border-slate-500/30" },
};

const CATEGORY_OPTIONS = [
  { value: "A_ROLL",        label: "A-Roll (Interview/Talking Head)" },
  { value: "B_ROLL",        label: "B-Roll (Footage)" },
  { value: "VOICEOVER",     label: "Voiceover (VO/Narration)" },
  { value: "SFX",           label: "SFX (Sound Effects)" },
  { value: "AUDIO",         label: "Audio (General)" },
  { value: "MUSIC",         label: "Music (Background/Track)" },
  { value: "GRAPHICS",      label: "Graphics (Overlay/Logo)" },
  { value: "THUMBNAILS",    label: "Thumbnail (Cover/Poster)" },
  { value: "EXPORTS",       label: "Export (Rendered/Final)" },
  { value: "PROJECT_FILES", label: "Project File (Premiere/Resolve)" },
  { value: "ARCHIVE",       label: "Archive" },
];

// ── Inline rename ─────────────────────────────────────────────────────────
const InlineRename: React.FC<{ asset: Asset; onRefresh?: () => void }> = ({ asset, onRefresh }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(asset.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const { renameAssetsBatch } = useAssetStore();

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setValue(asset.name);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  const commit = async () => {
    setEditing(false);
    const trimmed = value.trim();
    if (!trimmed || trimmed === asset.name) return;
    await renameAssetsBatch({ [asset.id]: trimmed });
    onRefresh?.();
  };

  const cancel = () => {
    setEditing(false);
    setValue(asset.name);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") cancel();
          e.stopPropagation();
        }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        className="w-full text-[11px] font-medium text-white bg-white/[0.08] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-outfit leading-tight"
      />
    );
  }

  return (
    <p
      className="text-[11px] font-medium text-white/75 group-hover:text-white transition-colors truncate font-outfit leading-tight cursor-text"
      title={`${asset.name} — double-click to rename`}
      onDoubleClick={startEdit}
    >
      {asset.name}
    </p>
  );
};


interface ContextMenuProps {
  asset: Asset;
  onClose: () => void;
  onRefresh?: () => void;
  onQuickLook?: () => void;
  toggleFavorite: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ asset, onClose, onRefresh, onQuickLook, toggleFavorite }) => {
  const [showCategories, setShowCategories] = useState(false);
  const [recategorizing, setRecategorizing] = useState(false);

  const handleRecategorize = async (newCat: string) => {
    if (newCat === asset.category) { onClose(); return; }
    setRecategorizing(true);
    try {
      await apiUpdateAssetCategory(asset.id, newCat);
      onRefresh?.();
    } catch (e) {
      console.error(e);
    } finally {
      setRecategorizing(false);
      onClose();
    }
  };

  const handleDelete = async (deleteFile: boolean) => {
    const msg = deleteFile
      ? `Delete "${asset.name}" from disk permanently? This cannot be undone.`
      : `Remove "${asset.name}" from VizWall? The file on disk is kept.`;
    if (!window.confirm(msg)) return;
    try {
      await apiDeleteAsset(asset.id, deleteFile);
      onRefresh?.();
    } catch (e) {
      console.error(e);
    }
    onClose();
  };

  return (
    <div
      className="fixed z-[100] bg-[#0e0c15] rounded-xl overflow-hidden shadow-2xl border border-white/[0.08] w-52 py-1"
      onClick={e => e.stopPropagation()}
    >
      {showCategories ? (
        <>
          <div className="px-3 py-2 flex items-center gap-2 border-b border-white/[0.06]">
            <button onClick={() => setShowCategories(false)} className="text-white/40 hover:text-white transition-colors">
              ←
            </button>
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Move to folder</span>
          </div>
          {CATEGORY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleRecategorize(opt.value)}
              disabled={recategorizing}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                opt.value === asset.category
                  ? "text-violet-400 bg-violet-500/10"
                  : "text-white/60 hover:text-white hover:bg-white/[0.06]"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", CATEGORY_META[opt.value]?.bg.replace("/15", "/60") ?? "bg-white/20")} />
              {opt.label}
              {opt.value === asset.category && <span className="ml-auto text-[9px] text-violet-400/60">current</span>}
            </button>
          ))}
        </>
      ) : (
        <>
          {onQuickLook && (
            <button onClick={() => { onQuickLook(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors">
              <Play size={11} /> Preview
            </button>
          )}
          <button onClick={() => { apiRevealInExplorer(asset.path); onClose(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">
            <FolderSearch size={11} /> Reveal in Explorer
          </button>

          <div className="my-1 h-px bg-white/[0.06]" />

          <button onClick={() => setShowCategories(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">
            <FolderInput size={11} />
            <span>Move to folder…</span>
            <span className="ml-auto text-[9px] text-white/25">{CATEGORY_META[asset.category]?.label}</span>
          </button>

          <button onClick={() => setShowCategories(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">
            <Tag size={11} /> Re-tag category
          </button>

          <button onClick={() => { toggleFavorite(); onClose(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">
            <Heart size={11} className={asset.favorite ? "fill-violet-400 text-violet-400" : ""} />
            {asset.favorite ? "Remove Favorite" : "Add to Favorites"}
          </button>

          <div className="my-1 h-px bg-white/[0.06]" />

          <button onClick={() => handleDelete(false)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/50 hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
            <Trash2 size={11} /> Remove from VizWall
          </button>
          <button onClick={() => handleDelete(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={11} /> Delete file from disk
          </button>
        </>
      )}
    </div>
  );
};

// ── Main AssetCard ────────────────────────────────────────────────────────
export const AssetCard: React.FC<AssetCardProps> = React.memo(({
  asset, onSelect, isSelected, viewMode = "grid", onQuickLook, onRefresh, onLibFavoriteToggle,
}) => {
  const { toggleFavoriteAsset: _toggleFavoriteAsset } = useAssetStore();
  const isLibraryAsset = asset.project_id === "GLOBAL_LIBRARY";
  const handleFavorite = () => {
    if (isLibraryAsset && onLibFavoriteToggle) onLibFavoriteToggle();
    else _toggleFavoriteAsset(asset.id);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const thumbAreaRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [thumbSrc, setThumbSrc] = useState("");
  const [thumbLoading, setThumbLoading] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [scrubMode, setScrubMode] = useState(false);   // click-to-scrub active
  const [scrubPct, setScrubPct] = useState(0);          // 0-100 scrub position
  const [videoDuration, setVideoDuration] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | "square" | null>(null);
  const [isInViewport, setIsInViewport] = useState(false);

  const isVideo = asset.category === "A_ROLL" || asset.category === "B_ROLL";
  const isAudio = asset.category === "AUDIO" || asset.category === "MUSIC"
    || asset.category === "SFX" || asset.category === "VOICEOVER";
  const isImage = asset.category === "THUMBNAILS" || asset.category === "GRAPHICS";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isTauri()) return;
      if (asset.thumbnail_path) { setThumbSrc(convertFileSrc(asset.thumbnail_path)); return; }
      if (isImage && asset.path) { setThumbSrc(convertFileSrc(asset.path)); return; }
      if (isVideo && asset.path) {
        setThumbLoading(true);
        try {
          const cacheDir = await appDataDir();
          const tp = await apiGenerateThumbnail(asset.id, asset.path, cacheDir + "thumbnails");
          if (!cancelled && tp) setThumbSrc(convertFileSrc(tp));
        } catch { /* no ffmpeg */ }
        finally { if (!cancelled) setThumbLoading(false); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [asset.id, asset.path, asset.thumbnail_path, isImage, isVideo]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  // Gate expensive media work to visible cards.
  useEffect(() => {
    const el = thumbAreaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setIsInViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]) setIsInViewport(entries[0].isIntersecting);
      },
      { root: null, rootMargin: "300px 0px 300px 0px", threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onEnter = useCallback(() => {
    setIsHovering(true);
    if (isVideo && asset.path && !scrubMode) {
      hoverTimer.current = setTimeout(() => {
        setVideoPlaying(true);
        videoRef.current?.play().catch(() => {});
      }, 350);
    }
  }, [isVideo, asset.path, scrubMode]);

  const onLeave = useCallback(() => {
    setIsHovering(false);
    setScrubMode(false);
    setScrubPct(0);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
    setVideoPlaying(false);
  }, []);

  // Click on thumbnail → enter scrub mode
  const handleThumbClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isVideo || !asset.path || !isTauri()) {
      onSelect(asset);
      return;
    }
    if (!scrubMode) {
      // Enter scrub mode — pause auto-play, enable jog
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setScrubMode(true);
      setVideoPlaying(false);
      videoRef.current?.pause();
      // Immediately scrub to click position
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setScrubPct(pct * 100);
      if (videoRef.current && videoDuration > 0) {
        videoRef.current.currentTime = pct * videoDuration;
      }
    }
  }, [isVideo, asset, scrubMode, videoDuration, onSelect]);

  // Mouse move over thumbnail in scrub mode → jog playhead
  const handleThumbMouseMove = useCallback((e: React.MouseEvent) => {
    if (!scrubMode || !videoRef.current || !videoDuration) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setScrubPct(pct * 100);
    videoRef.current.currentTime = pct * videoDuration;
  }, [scrubMode, videoDuration]);

  // Native file drag — triggers OS-level drag so files can be dropped into
  // Premiere Pro, DaVinci Resolve, After Effects, Explorer, etc.
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragTriggered = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragTriggered.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartPos.current || dragTriggered.current || !asset.path || !isTauri()) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    // Start drag after 8px movement
    if (Math.hypot(dx, dy) > 8) {
      dragTriggered.current = true;
      dragStartPos.current = null;
      apiDragFile(asset.path).catch(() => {});
    }
  }, [asset.path]);

  const handlePointerUp = useCallback(() => {
    dragStartPos.current = null;
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const fmtBytes = (b: number) => {
    if (!b) return "0 B";
    const k = 1024; const s = ["B","KB","MB","GB"];
    const i = Math.floor(Math.log(b)/Math.log(k));
    return parseFloat((b/Math.pow(k,i)).toFixed(1))+" "+s[i];
  };
  const fmtDur = (s: number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;

  const meta = CATEGORY_META[asset.category] ?? CATEGORY_META.ARCHIVE;

  // ── List view ──
  if (viewMode === "list") {
    return (
      <>
        <div
          onClick={() => { onSelect(asset); onQuickLook?.(asset); }}
          onDoubleClick={() => { /* single click already opens QuickLook */ }}
          onContextMenu={handleContextMenu}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 cursor-pointer group transition-colors border-b border-white/[0.03]",
            isSelected ? "bg-violet-500/8 border-l-2 border-l-violet-500" : "hover:bg-white/[0.03]"
          )}
        >
          <div className="w-14 h-9 rounded bg-black/40 relative overflow-hidden shrink-0">
            {thumbSrc && <img src={thumbSrc} alt="" className="w-full h-full object-cover" onError={() => setThumbSrc("")} />}
            {isVideo && !thumbSrc && <Video size={14} className="absolute inset-0 m-auto text-violet-500/30" />}
            {isAudio && !thumbSrc && <Music size={14} className="absolute inset-0 m-auto text-blue-500/30" />}
            {isImage && !thumbSrc && <ImageIcon size={14} className="absolute inset-0 m-auto text-cyan-500/30" />}
            {asset.duration != null && asset.duration > 0 && (
              <span className="absolute bottom-0.5 right-0.5 text-[7px] font-mono bg-black/70 px-0.5 rounded text-white/80">{fmtDur(asset.duration)}</span>
            )}
          </div>
          <p className="flex-1 text-xs text-white/70 group-hover:text-white truncate font-outfit" title={asset.name}>{asset.name}</p>
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0", meta.color, meta.bg, meta.border)}>{meta.label}</span>
          {/* Extra tags in list view */}
          {getDisplayTags(asset).slice(0, 2).map((t, i) => (
            <span key={i} className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 hidden md:inline", t.color, t.bg)}>
              {t.label}
            </span>
          ))}
          <span className="text-[10px] text-white/30 font-mono w-16 text-right shrink-0">{fmtBytes(asset.size)}</span>
          <span className="text-[10px] text-white/25 font-mono w-24 text-right shrink-0 hidden lg:block">{asset.created_at.split(" ")[0]}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={e => { e.stopPropagation(); handleFavorite(); }} className={cn("p-1 rounded hover:bg-white/10 transition-colors", asset.favorite ? "text-violet-400" : "text-white/30")}>
              <Star size={11} className={asset.favorite ? "fill-violet-400" : ""} />
            </button>
            <button onClick={e => { e.stopPropagation(); apiRevealInExplorer(asset.path); }} className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white transition-colors">
              <FolderSearch size={11} />
            </button>
          </div>
        </div>
        {contextMenu && (
          <div ref={menuRef} style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y }}>
            <ContextMenu
              asset={asset}
              onClose={() => setContextMenu(null)}
              onRefresh={onRefresh}
              onQuickLook={onQuickLook ? () => onQuickLook(asset) : undefined}
              toggleFavorite={() => handleFavorite()}
            />
          </div>
        )}
      </>
    );
  }

  // ── Grid view ──
  return (
    <>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={() => { if (!scrubMode && !dragTriggered.current) { onSelect(asset); onQuickLook?.(asset); } }}
        onDoubleClick={() => { /* single click already opens QuickLook */ }}
        onContextMenu={handleContextMenu}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className={cn(
          "bg-[#0e0c1a]/80 rounded-xl border overflow-hidden select-none group transition-all duration-200",
          scrubMode ? "cursor-col-resize" : "cursor-grab",
          isSelected ? "border-violet-500/60 ring-1 ring-violet-500/20" : "border-white/5 hover:border-white/15"
        )}
      >
        {/* Thumbnail — fixed 16:9 container, video/image contained inside */}
        <div
          ref={thumbAreaRef}
          className={cn(
            "aspect-video w-full bg-black relative overflow-hidden",
            scrubMode ? "cursor-col-resize" : isVideo ? "cursor-pointer" : ""
          )}
          onClick={handleThumbClick}
          onMouseMove={handleThumbMouseMove}
        >
          {thumbSrc && !videoPlaying && !scrubMode && (
            <>
              {/* Blurred background fill for letterboxed content */}
              <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 blur-md scale-110 pointer-events-none" onError={() => {}} />
              {/* Sharp foreground */}
              <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-contain" onError={() => setThumbSrc("")} />
            </>
          )}
          {/* Show thumb as background while scrubbing */}
          {thumbSrc && scrubMode && (
            <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-contain opacity-20" onError={() => {}} />
          )}
          {isVideo && asset.path && isTauri() && (
            <video
              ref={videoRef}
              src={(isHovering || scrubMode) ? toSrc(asset.path) : undefined}
              className={cn(
                "absolute inset-0 w-full h-full object-contain transition-opacity duration-200",
                (videoPlaying || scrubMode) ? "opacity-100" : "opacity-0"
              )}
              muted playsInline preload={scrubMode ? "auto" : "none"}
              loop={!scrubMode}
              onLoadedMetadata={() => {
                const v = videoRef.current;
                if (!v) return;
                setVideoDuration(v.duration);
                const w = v.videoWidth; const h = v.videoHeight;
                if (w > h) setOrientation("landscape");
                else if (h > w) setOrientation("portrait");
                else setOrientation("square");
              }}
            />
          )}
          {!thumbSrc && !videoPlaying && !scrubMode && (
            <div className="absolute inset-0 flex items-center justify-center">
              {isVideo && <><div className="absolute inset-0 bg-gradient-to-tr from-violet-900/20 to-blue-900/10" />{thumbLoading ? <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" /> : <Video size={26} className="text-violet-500/25" />}</>}
              {isAudio && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/20 to-emerald-900/10" />
                  <WaveformPreview
                    src={isTauri() ? toSrc(asset.path) : ""}
                    isHovering={isHovering}
                    shouldDecode={isInViewport}
                    accentColor={
                      asset.category === "MUSIC" ? "#10b981"
                      : asset.category === "SFX" ? "#f97316"
                      : asset.category === "VOICEOVER" ? "#38bdf8"
                      : "#3b82f6"
                    }
                  />
                  {/* Play indicator overlay */}
                  {isHovering && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] z-10"
                      style={{ color: asset.category === "MUSIC" ? "#6ee7b7" : "#93c5fd" }}>
                      <Volume2 size={9} /> Playing
                    </div>
                  )}
                </>
              )}
              {isImage && <><div className="absolute inset-0 bg-gradient-to-tr from-pink-900/15 to-cyan-900/10" /><ImageIcon size={26} className="text-cyan-500/25" /></>}
              {!isVideo && !isAudio && !isImage && <FileText size={26} className="text-white/15" />}
            </div>
          )}

          {/* Hover play overlay */}
          {isVideo && !scrubMode && (
            <div className={cn("absolute inset-0 flex items-center justify-center transition-opacity duration-200", isHovering && !videoPlaying ? "opacity-100" : "opacity-0")}>
              <div className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <Play size={13} className="text-white fill-white ml-0.5" />
              </div>
            </div>
          )}

          {/* Scrub mode UI — Premiere-style jog bar */}
          {scrubMode && isVideo && (
            <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
              {/* Scrub hint */}
              <div className="absolute top-1.5 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded text-[8px] text-white/70 font-mono whitespace-nowrap">
                {videoDuration > 0
                  ? `${Math.floor((scrubPct / 100) * videoDuration / 60)}:${String(Math.floor((scrubPct / 100) * videoDuration % 60)).padStart(2, "0")} / ${Math.floor(videoDuration / 60)}:${String(Math.floor(videoDuration % 60)).padStart(2, "0")}`
                  : "Scrubbing…"
                }
              </div>
              {/* Scrub track */}
              <div className="w-full h-1 bg-white/20">
                <div
                  className="h-full bg-violet-500 relative"
                  style={{ width: `${scrubPct}%` }}
                >
                  {/* Playhead */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-lg -translate-x-1/2" />
                </div>
              </div>
            </div>
          )}

          {/* Click-to-scrub hint on hover (before scrub mode) */}
          {isVideo && isHovering && videoPlaying && !scrubMode && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[8px] text-white/50 font-mono whitespace-nowrap pointer-events-none">
              Click to scrub
            </div>
          )}

          {isAudio && isHovering && !thumbSrc && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] text-blue-300 z-10">
              <Volume2 size={9} /> Preview
            </div>
          )}

          {/* Favorite */}
          <button
            onClick={e => { e.stopPropagation(); handleFavorite(); }}
            className={cn("absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md border transition-all z-20",
              asset.favorite ? "bg-violet-600/30 text-violet-400 border-violet-500/40 opacity-100" : "bg-black/50 text-white/40 hover:text-white border-white/10 opacity-0 group-hover:opacity-100"
            )}
          >
            <Star size={11} className={asset.favorite ? "fill-violet-400" : ""} />
          </button>

          {/* Duration */}
          {asset.duration != null && asset.duration > 0 && !scrubMode && (
            <span className="absolute bottom-2 right-2 bg-black/75 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-mono text-white/90">{fmtDur(asset.duration)}</span>
          )}

          {/* Orientation badge */}
          {orientation && isVideo && !scrubMode && (
            <span className={cn(
              "absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider backdrop-blur-md border",
              orientation === "portrait" ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                : orientation === "landscape" ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                : "bg-white/10 text-white/50 border-white/20"
            )}>
              {orientation === "portrait" ? "9:16" : orientation === "landscape" ? "16:9" : "1:1"}
            </span>
          )}

          {/* Category badge */}
          {!scrubMode && (
            <span className={cn("absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border backdrop-blur-md", meta.color, meta.bg, meta.border)}>
              {meta.label}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="px-3 py-2.5">
          <InlineRename asset={asset} onRefresh={onRefresh} />
          {/* Tag strip */}
          {(() => {
            const tags = getDisplayTags(asset);
            return tags.length > 0 ? (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {tags.map((t, i) => (
                  <span key={i} className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide", t.color, t.bg)}>
                    {t.label}
                  </span>
                ))}
              </div>
            ) : null;
          })()}
          <div className="flex items-center justify-between mt-1.5 text-[9px] text-white/25 font-mono">
            <span>{fmtBytes(asset.size)}</span>
            {asset.duration != null && asset.duration > 0
              ? <span className="text-white/35">{fmtDur(asset.duration)}</span>
              : <span>{asset.created_at.split(" ")[0]}</span>
            }
          </div>
        </div>
      </div>

      {/* Context menu portal */}
      {contextMenu && (
        <div ref={menuRef} style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 9999 }}>
          <ContextMenu
            asset={asset}
            onClose={() => setContextMenu(null)}
            onRefresh={onRefresh}
            onQuickLook={onQuickLook ? () => onQuickLook(asset) : undefined}
            toggleFavorite={() => handleFavorite()}
          />
        </div>
      )}
    </>
  );
});

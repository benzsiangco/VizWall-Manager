import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  X, Play, Pause, Volume2, VolumeX,
  ChevronLeft, ChevronRight, Maximize2,
  RotateCcw, FolderSearch,
} from "lucide-react";
import { Asset, apiRevealInExplorer, isTauri } from "../lib/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

interface QuickLookProps {
  asset: Asset;
  allAssets: Asset[];
  onClose: () => void;
  onNavigate: (asset: Asset) => void;
}

function toSrc(p: string) {
  return isTauri() ? convertFileSrc(p) : p;
}

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtBytes(b: number) {
  if (!b) return "0 B";
  const k = 1024; const s = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
}

export const QuickLook: React.FC<QuickLookProps> = ({ asset, allAssets, onClose, onNavigate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const [orientation, setOrientation] = useState<"landscape" | "portrait" | "square" | null>(null);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isVideo = asset.category === "A_ROLL" || asset.category === "B_ROLL"
    || asset.mime_type?.startsWith("video/");
  const isAudio = asset.category === "AUDIO" || asset.category === "MUSIC"
    || asset.mime_type?.startsWith("audio/");
  const isImage = asset.category === "THUMBNAILS" || asset.category === "GRAPHICS"
    || asset.mime_type?.startsWith("image/");

  const currentIndex = allAssets.findIndex(a => a.id === asset.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allAssets.length - 1;

  // Auto-play on open
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    setVideoSize(null);
    setOrientation(null);
    if (isVideo && videoRef.current) {
      videoRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
    return () => { videoRef.current?.pause(); };
  }, [asset.id, isVideo]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play().catch(() => {}); setPlaying(true); }
  }, [playing]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  }, [muted]);

  const toggleFullscreen = useCallback(() => {
    const el = document.getElementById("ql-container");
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => {});
  }, []);

  // Keyboard — only when QuickLook is open and focus is NOT in a text input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;
      if (isEditable) return;

      switch (e.key) {
        case "Escape": onClose(); break;
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey && videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
          } else if (hasPrev) onNavigate(allAssets[currentIndex - 1]);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey && videoRef.current) {
            videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
          } else if (hasNext) onNavigate(allAssets[currentIndex + 1]);
          break;
        case "m": case "M": toggleMute(); break;
        case "f": case "F": toggleFullscreen(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasPrev, hasNext, currentIndex, allAssets, duration, playing, togglePlay, toggleMute, toggleFullscreen, onClose, onNavigate]);

  // Scrubber
  const getScrubTime = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!scrubRef.current || !duration) return null;
    const rect = scrubRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  }, [duration]);

  const handleScrubStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setScrubbing(true);
    const t = getScrubTime(e);
    if (t !== null && videoRef.current) { videoRef.current.currentTime = t; setCurrentTime(t); }
  }, [getScrubTime]);

  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: MouseEvent) => {
      const t = getScrubTime(e);
      if (t !== null && videoRef.current) { videoRef.current.currentTime = t; setCurrentTime(t); }
    };
    const up = () => setScrubbing(false);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  }, [scrubbing, getScrubTime]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (playing) controlsTimer.current = setTimeout(() => setShowControls(false), 2500);
  }, [playing]);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [playing, resetControlsTimer]);

  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <div
      id="ql-container"
      className="fixed inset-x-0 bottom-0 z-[200] bg-black flex flex-col"
      style={{ top: "36px" }}
      onMouseMove={resetControlsTimer}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Top bar — overlaid on video ── */}
      <div className={cn(
        "absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 transition-opacity duration-300",
        "bg-gradient-to-b from-black/70 via-black/30 to-transparent",
        showControls ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {/* Left: close + file info */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors shrink-0"
          >
            <X size={14} />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{asset.name}</p>
            <div className="flex items-center gap-1.5 text-[10px] text-white/50 font-mono mt-0.5">
              <span>{fmtBytes(asset.size)}</span>
              {videoSize && <><span>·</span><span>{videoSize.w}×{videoSize.h}</span></>}
              {orientation && (
                <span className={cn(
                  "font-bold",
                  orientation === "portrait" ? "text-blue-400" : orientation === "landscape" ? "text-violet-400" : "text-white/40"
                )}>
                  · {orientation === "portrait" ? "9:16" : orientation === "landscape" ? "16:9" : "1:1"}
                </span>
              )}
              {duration > 0 && <><span>·</span><span>{fmtTime(duration)}</span></>}
            </div>
          </div>
        </div>

        {/* Right: nav + actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => hasPrev && onNavigate(allAssets[currentIndex - 1])}
            disabled={!hasPrev}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white disabled:opacity-20 transition-colors"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-[10px] text-white/40 font-mono px-1 tabular-nums">
            {currentIndex + 1}/{allAssets.length}
          </span>
          <button
            onClick={() => hasNext && onNavigate(allAssets[currentIndex + 1])}
            disabled={!hasNext}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white disabled:opacity-20 transition-colors"
          >
            <ChevronRight size={15} />
          </button>
          <div className="w-px h-4 bg-white/15 mx-1" />
          <button
            onClick={() => apiRevealInExplorer(asset.path).catch(() => {})}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
            title="Reveal in Explorer"
          >
            <FolderSearch size={13} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
            title="Fullscreen (F)"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Video / Image / Audio — fills the entire screen ── */}
      <div className="flex-1 flex items-center justify-center min-h-0 relative">
        {isVideo && (
          <video
            ref={videoRef}
            src={toSrc(asset.path)}
            // object-contain so the full frame is always visible, no cropping
            className="w-full h-full object-contain"
            style={{ maxHeight: "calc(100vh - 36px)" }}
            muted={muted}
            playsInline
            onClick={togglePlay}
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
            onDurationChange={() => setDuration(videoRef.current?.duration ?? 0)}
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (!v) return;
              setDuration(v.duration);
              const w = v.videoWidth; const h = v.videoHeight;
              setVideoSize({ w, h });
              setOrientation(w > h ? "landscape" : h > w ? "portrait" : "square");
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}

        {isImage && (
          <img
            src={toSrc(asset.path)}
            alt={asset.name}
            className="w-full h-full object-contain"
            style={{ maxHeight: "calc(100vh - 36px)" }}
            onLoad={e => {
              const img = e.currentTarget;
              const w = img.naturalWidth; const h = img.naturalHeight;
              setVideoSize({ w, h });
              setOrientation(w > h ? "landscape" : h > w ? "portrait" : "square");
            }}
          />
        )}

        {isAudio && (
          <div className="flex flex-col items-center gap-8">
            <div className="w-40 h-40 rounded-3xl bg-gradient-to-br from-blue-900/50 to-emerald-900/30 flex items-center justify-center shadow-2xl">
              <Volume2 size={56} className="text-blue-400/70" />
            </div>
            <div className="text-center">
              <p className="text-white text-base font-semibold font-outfit">{asset.name}</p>
              <p className="text-white/40 text-sm mt-1">{fmtBytes(asset.size)}</p>
            </div>
            <audio
              ref={videoRef as any}
              src={toSrc(asset.path)}
              onTimeUpdate={() => setCurrentTime((videoRef.current as any)?.currentTime ?? 0)}
              onDurationChange={() => setDuration((videoRef.current as any)?.duration ?? 0)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          </div>
        )}

        {!isVideo && !isImage && !isAudio && (
          <div className="flex flex-col items-center gap-4 text-white/30">
            <div className="w-28 h-28 rounded-2xl bg-white/[0.04] flex items-center justify-center">
              <span className="text-4xl font-mono font-bold">{asset.name.split(".").pop()?.toUpperCase()}</span>
            </div>
            <p className="text-white/60 text-sm">{asset.name}</p>
            <p className="text-white/30 text-xs font-mono">{fmtBytes(asset.size)}</p>
          </div>
        )}

        {/* Center play/pause overlay for video */}
        {isVideo && !playing && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            onClick={togglePlay}
          >
            <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <Play size={24} className="text-white fill-white ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom controls — overlaid ── */}
      {(isVideo || isAudio) && (
        <div className={cn(
          "absolute bottom-0 left-0 right-0 z-10 px-5 pb-6 pt-12 transition-opacity duration-300",
          "bg-gradient-to-t from-black/80 via-black/40 to-transparent",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          {/* Scrubber */}
          <div
            ref={scrubRef}
            className="w-full h-6 flex items-center cursor-pointer group mb-3"
            onMouseDown={handleScrubStart}
          >
            <div className="w-full h-[3px] group-hover:h-1 bg-white/20 rounded-full relative transition-all duration-100">
              <div className="absolute inset-y-0 left-0 bg-white/25 rounded-full" style={{ width: `${Math.min(progress + 8, 100)}%` }} />
              <div className="absolute inset-y-0 left-0 bg-violet-500 rounded-full" style={{ width: `${progress}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${progress}% - 7px)` }}
              />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
            >
              {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
            </button>

            <button
              onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; }}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
            >
              <RotateCcw size={13} />
            </button>

            <span className="text-xs text-white/60 font-mono tabular-nums">
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <input
                type="range" min={0} max={1} step={0.05}
                value={muted ? 0 : volume}
                onChange={e => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  if (videoRef.current) videoRef.current.volume = v;
                  setMuted(v === 0);
                }}
                className="w-20 accent-violet-500 cursor-pointer"
              />
            </div>

            <div className="hidden lg:flex items-center gap-1.5 text-[9px] text-white/25 font-mono">
              <span>Space</span><span className="text-white/15">·</span>
              <span>←→ nav</span><span className="text-white/15">·</span>
              <span>Shift+←→ seek</span><span className="text-white/15">·</span>
              <span>Esc</span>
            </div>
          </div>
        </div>
      )}

      {isImage && (
        <div className={cn(
          "absolute bottom-4 left-0 right-0 text-center text-[10px] text-white/25 font-mono transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}>
          ← → navigate · Esc close
        </div>
      )}
    </div>
  );
};

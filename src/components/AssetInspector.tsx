import React, { useState, useEffect } from "react";
import {
  Video, Music,
  FolderSearch, Tag as TagIcon, Plus, X,
  Star,
} from "lucide-react";
import { useAssetStore } from "../stores/useAssetStore";
import { apiGenerateThumbnail, isTauri } from "../lib/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { cn } from "../lib/utils";
import { CATEGORY_META } from "./AssetCard";

export const AssetInspector: React.FC = () => {
  const { assets, selectedAssetId, toggleFavoriteAsset } = useAssetStore();
  const asset = assets.find(a => a.id === selectedAssetId);

  const [thumbSrc, setThumbSrc] = useState("");
  const [newTag, setNewTag] = useState("");
  const [localTags, setLocalTags] = useState<string[]>([]);

  useEffect(() => {
    if (!asset) return;
    setLocalTags(asset.tags || []);
    setThumbSrc("");

    const load = async () => {
      if (!isTauri()) return;
      if (asset.thumbnail_path) { setThumbSrc(convertFileSrc(asset.thumbnail_path)); return; }
      const isImage = asset.category === "THUMBNAILS" || asset.category === "GRAPHICS";
      const isVideo = asset.category === "A_ROLL" || asset.category === "B_ROLL";
      if (isImage && asset.path) { setThumbSrc(convertFileSrc(asset.path)); return; }
      if (isVideo && asset.path) {
        try {
          const cacheDir = await appDataDir();
          const tp = await apiGenerateThumbnail(asset.id, asset.path, cacheDir + "thumbnails");
          if (tp) setThumbSrc(convertFileSrc(tp));
        } catch {}
      }
    };
    load();
  }, [asset?.id]);

  const fmtBytes = (b: number) => {
    if (!b) return "0 B"; const k = 1024; const s = ["B","KB","MB","GB"];
    const i = Math.floor(Math.log(b)/Math.log(k));
    return parseFloat((b/Math.pow(k,i)).toFixed(2))+" "+s[i];
  };
  const fmtDur = (s: number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;

  const addTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTag.trim() && !localTags.includes(newTag.trim())) {
      const updated = [...localTags, newTag.trim()];
      setLocalTags(updated);
      if (asset) asset.tags = updated;
      setNewTag("");
    }
  };
  const removeTag = (t: string) => {
    const updated = localTags.filter(x => x !== t);
    setLocalTags(updated);
    if (asset) asset.tags = updated;
  };

  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-white/[0.03] flex items-center justify-center mb-3">
          <FolderSearch size={20} className="text-white/20" />
        </div>
        <p className="text-xs font-semibold text-white/30 mb-1">No Asset Selected</p>
        <p className="text-[10px] text-white/20 leading-relaxed max-w-[180px]">
          Click any file to inspect its properties and tags.
        </p>
      </div>
    );
  }

  const meta = CATEGORY_META[asset.category] ?? CATEGORY_META.ARCHIVE;
  const isVideo = asset.category === "A_ROLL" || asset.category === "B_ROLL";
  const isAudio = asset.category === "AUDIO" || asset.category === "MUSIC";

  return (
    <div className="flex flex-col h-full overflow-y-auto select-none">
      {/* Preview */}
      <div className="relative aspect-video bg-black/50 overflow-hidden shrink-0">
        {thumbSrc && (
          <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setThumbSrc("")} />
        )}
        {isVideo && !thumbSrc && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-tr from-violet-900/20 to-blue-900/10">
            <Video size={32} className="text-violet-500/20" />
          </div>
        )}
        {isAudio && !thumbSrc && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-tr from-blue-900/20 to-emerald-900/10">
            <Music size={32} className="text-blue-500/20" />
          </div>
        )}
        {/* Overlay bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 flex items-center justify-between">
          <span className="text-[10px] font-mono text-white/70 truncate max-w-[160px]">{asset.name}</span>
          <div className="flex items-center gap-2">
            {asset.duration != null && asset.duration > 0 && (
              <span className="text-[9px] font-mono text-violet-400">{fmtDur(asset.duration)}</span>
            )}
            <button onClick={() => toggleFavoriteAsset(asset.id)}
              className={cn("p-1 rounded transition-colors", asset.favorite ? "text-violet-400" : "text-white/30 hover:text-white")}>
              <Star size={12} className={asset.favorite ? "fill-violet-400" : ""} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* File Properties */}
        <div className="space-y-2">
          <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest font-outfit">File Properties</p>
          <div className="bg-white/[0.02] rounded-xl p-3 space-y-2">
            {[
              { label: "Type", value: asset.mime_type?.split("/")[1]?.toUpperCase() ?? "Unknown" },
              { label: "Category", value: <span className={cn("font-bold", meta.color)}>{meta.label}</span> },
              { label: "Size", value: fmtBytes(asset.size) },
              ...(asset.duration != null && asset.duration > 0 ? [{ label: "Duration", value: fmtDur(asset.duration) }] : []),
              { label: "Date Added", value: asset.created_at.split(" ")[0] },
              { label: "Folder", value: <span className={cn("font-mono text-[9px]", meta.color)}>{asset.category}</span> },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-start gap-2 text-[10px]">
                <span className="text-white/30 shrink-0">{row.label}</span>
                <span className="text-white/70 text-right font-mono truncate max-w-[140px]">{row.value}</span>
              </div>
            ))}
            <div className="pt-1.5 mt-1">
              <p className="text-[9px] text-white/25 mb-1">Path</p>
              <p className="text-[9px] text-white/45 font-mono break-all leading-relaxed cursor-pointer hover:text-violet-400 transition-colors select-all" title={asset.path}>
                {asset.path}
              </p>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <TagIcon size={12} className="text-violet-400" />
            <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest font-outfit">Tags</p>
          </div>
          {localTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {localTags.map(tag => (
                <div key={tag} className="bg-violet-950/30 text-violet-300 border border-violet-800/20 text-[9px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span>{tag}</span>
                  <button onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors"><X size={9} /></button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={addTag} className="flex gap-1">
            <input type="text" placeholder="Add tag..." value={newTag} onChange={e => setNewTag(e.target.value)}
              className="flex-1 bg-white/[0.03] rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:bg-white/[0.05] transition-colors placeholder-white/20" />
            <button type="submit" className="p-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors">
              <Plus size={12} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

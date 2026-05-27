import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, FolderSync, HardDriveUpload, Wand2,
  LayoutGrid, List, ChevronRight, ChevronDown,
  X, FolderOpen, FolderClosed,
  Video, Music, Image as ImageIcon, FileText, Archive,
  Columns2, HardDrive, Check, ArrowRight, RefreshCw,
  ExternalLink, Star, Tag,
} from "lucide-react";
import { AssetCard } from "../components/AssetCard";
import { AssetInspector } from "../components/AssetInspector";
import { QuickLook } from "../components/QuickLook";
import { useAssetStore } from "../stores/useAssetStore";
import { useProjectStore } from "../stores/useProjectStore";
import { useUiStore } from "../stores/useUiStore";
import { Asset, apiGetNamingTemplate, apiRevealInExplorer } from "../lib/tauri";
import { cn } from "../lib/utils";

// ── Folder tree node ──────────────────────────────────────────────────────
interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  assetCount: number;
  dominantCategory?: string;  // most common category of assets inside
  overrideCategory?: string;  // user-set type override
}

// No virtual category groups — the folder tree shows real filesystem folders only.

function buildFolderTree(assets: Asset[], projectPath: string, libraryMode = false): FolderNode {
  const root: FolderNode = { name: "All Files", path: "", children: [], assetCount: assets.length };
  const nodeMap = new Map<string, FolderNode>();
  const categoryCounts = new Map<string, Record<string, number>>();
  nodeMap.set("", root);

  const normRoot = projectPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const folderTypes = libraryMode ? getFolderTypes() : {};

  for (const asset of assets) {
    const normAsset = asset.path.replace(/\\/g, "/");
    const normAssetLower = normAsset.toLowerCase();

    let rel: string;
    if (normRoot && normAssetLower.startsWith(normRoot)) {
      rel = normAsset.slice(normRoot.length).replace(/^[/\\]+/, "");
    } else {
      rel = normAsset.split("/").pop() ?? normAsset;
    }

    const parts = rel.replace(/\\/g, "/").split("/");
    parts.pop();

    let currentPath = "";
    const folderPaths: string[] = [];
    for (const part of parts) {
      if (!part) continue;
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      folderPaths.push(currentPath);

      if (!nodeMap.has(currentPath)) {
        const override = folderTypes[currentPath] || folderTypes[currentPath.toLowerCase()];
        const node: FolderNode = {
          name: part,
          path: currentPath,
          children: [],
          assetCount: 0,
          overrideCategory: override,
        };
        nodeMap.set(currentPath, node);
        const parent = nodeMap.get(parentPath) ?? root;
        parent.children.push(node);
      }
    }

    // Increment counts and category stats for this folder and all ancestors.
    for (let i = folderPaths.length - 1; i >= 0; i--) {
      const p = folderPaths[i];
      const node = nodeMap.get(p);
      if (!node) continue;
      node.assetCount++;
      const counts = categoryCounts.get(p) ?? {};
      counts[asset.category] = (counts[asset.category] ?? 0) + 1;
      categoryCounts.set(p, counts);
    }
  }

  // Compute dominant category from pre-aggregated counts.
  for (const [path, node] of nodeMap) {
    if (!path) continue;
    const counts = categoryCounts.get(path);
    if (counts) {
      node.dominantCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    }
  }

  const sortNode = (n: FolderNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name));
    n.children.forEach(sortNode);
  };
  sortNode(root);

  return root;
}

function getAssetsInFolder(assets: Asset[], folderPath: string, projectPath: string): Asset[] {
  if (!folderPath) return assets;

  const normRoot = projectPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

  return assets.filter(a => {
    const normA = a.path.replace(/\\/g, "/");
    const normALower = normA.toLowerCase();
    let rel = normA;
    if (normRoot && normALower.startsWith(normRoot)) {
      rel = normA.slice(normRoot.length).replace(/^[/\\]+/, "");
    }
    const parts = rel.replace(/\\/g, "/").split("/");
    parts.pop();
    const assetFolder = parts.join("/");
    return assetFolder === folderPath || assetFolder.startsWith(folderPath + "/");
  });
}

// ── Folder type overrides — stored in localStorage ────────────────────────
const FOLDER_TYPE_KEY = "vizwall_folder_types";

function getFolderTypes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(FOLDER_TYPE_KEY) ?? "{}"); }
  catch { return {}; }
}

function setFolderType(folderPath: string, category: string) {
  const types = getFolderTypes();
  if (category === "") delete types[folderPath];
  else types[folderPath] = category;
  localStorage.setItem(FOLDER_TYPE_KEY, JSON.stringify(types));
}

// Category → icon config
const CATEGORY_ICON_MAP: Record<string, { icon: (size: number) => React.ReactNode; color: string }> = {
  SFX:           { icon: s => <Music size={s} />,     color: "text-orange-400" },
  MUSIC:         { icon: s => <Music size={s} />,     color: "text-emerald-400" },
  AUDIO:         { icon: s => <Music size={s} />,     color: "text-blue-400" },
  VOICEOVER:     { icon: s => <Music size={s} />,     color: "text-sky-400" },
  A_ROLL:        { icon: s => <Video size={s} />,     color: "text-red-400" },
  B_ROLL:        { icon: s => <Video size={s} />,     color: "text-violet-400" },
  EXPORTS:       { icon: s => <HardDrive size={s} />, color: "text-teal-400" },
  GRAPHICS:      { icon: s => <ImageIcon size={s} />, color: "text-cyan-400" },
  THUMBNAILS:    { icon: s => <ImageIcon size={s} />, color: "text-pink-400" },
  PROJECT_FILES: { icon: s => <FileText size={s} />,  color: "text-amber-400" },
  ARCHIVE:       { icon: s => <Archive size={s} />,   color: "text-slate-400" },
};

const FOLDER_TYPE_OPTIONS = [
  { value: "SFX",           label: "SFX",           color: "text-orange-400" },
  { value: "MUSIC",         label: "Music",         color: "text-emerald-400" },
  { value: "GRAPHICS",      label: "Graphics",      color: "text-cyan-400" },
  { value: "THUMBNAILS",    label: "Thumbnails",    color: "text-pink-400" },
  { value: "B_ROLL",        label: "B-Roll",        color: "text-violet-400" },
  { value: "A_ROLL",        label: "A-Roll",        color: "text-red-400" },
  { value: "EXPORTS",       label: "Exports",       color: "text-teal-400" },
  { value: "PROJECT_FILES", label: "Project Files", color: "text-amber-400" },
  { value: "",              label: "Auto-detect",   color: "text-white/40" },
];

// ── Folder icon — derived from override, dominant category, or name ────────
function folderIcon(
  name: string,
  open: boolean,
  dominantCategory?: string,
  overrideCategory?: string,
): React.ReactNode {
  const cls = "shrink-0";
  const n = name.toUpperCase();

  // Use override category first, then dominant category from assets inside
  const effectiveCat = overrideCategory || dominantCategory;
  if (effectiveCat) {
    const cfg = CATEGORY_ICON_MAP[effectiveCat];
    if (cfg) return <span className={cn(cls, cfg.color)}>{cfg.icon(13)}</span>;
  }

  // Fallback: name-based detection
  if (n.includes("SFX") || n.includes("SOUND") || n.includes("FOLEY") || n.includes("RISER")
    || n.includes("STINGER") || n.includes("WHOOSH") || n.includes("IMPACT"))
    return <Music size={13} className={cn(cls, "text-orange-400")} />;
  if (n.includes("MUSIC") || n.includes("BEAT") || n.includes("TRACK") || n.includes("AUDIO")
    || n.includes("AMBIENCE") || n.includes("AMBIENT"))
    return <Music size={13} className={cn(cls, "text-emerald-400")} />;
  if (n.includes("A_ROLL") || n.includes("AROLL") || n.includes("INTERVIEW"))
    return <Video size={13} className={cn(cls, "text-red-400")} />;
  if (n.includes("B_ROLL") || n.includes("BROLL") || n.includes("MEDIA") || n.includes("FOOTAGE")
    || n.includes("VIDEO") || n.includes("STOCK") || n.includes("DRONE"))
    return <Video size={13} className={cn(cls, "text-violet-400")} />;
  if (n.includes("GRAPHIC") || n.includes("THUMB") || n.includes("PNG") || n.includes("LOGO")
    || n.includes("OVERLAY") || n.includes("MOTION") || n.includes("TEMPLATE") || n.includes("GFX")
    || n.includes("FONT") || n.includes("LUT") || n.includes("MOGRT"))
    return <ImageIcon size={13} className={cn(cls, "text-cyan-400")} />;
  if (n.includes("EXPORT") || n.includes("DELIVER") || n.includes("FINAL") || n.includes("RENDER"))
    return <HardDrive size={13} className={cn(cls, "text-emerald-400")} />;
  if (n.includes("REVISION"))
    return <FileText size={13} className={cn(cls, "text-amber-400")} />;
  if (n.includes("ARCHIVE"))
    return <Archive size={13} className={cn(cls, "text-slate-400")} />;
  if (n.includes("PROJECT") || n.includes("PREMIERE") || n.includes("RESOLVE"))
    return <FileText size={13} className={cn(cls, "text-amber-400")} />;
  return open
    ? <FolderOpen size={13} className={cn(cls, "text-white/50")} />
    : <FolderClosed size={13} className={cn(cls, "text-white/40")} />;
}

// ── Recursive folder tree item ────────────────────────────────────────────
const FolderTreeItem: React.FC<{
  node: FolderNode;
  depth: number;
  selectedPath: string;
  projectPath: string;
  libraryMode?: boolean;
  onSelect: (path: string) => void;
  onFolderTypeChange?: (folderPath: string, category: string) => void;
}> = ({ node, depth, selectedPath, projectPath, libraryMode, onSelect, onFolderTypeChange }) => {
  const isSelected = selectedPath === node.path;
  const isAncestor = selectedPath.startsWith(node.path + "/") && node.path !== "";
  const [open, setOpen] = useState(depth === 0 || isAncestor || depth <= 1);
  const [hovered, setHovered] = useState(false);
  const [typeMenuPos, setTypeMenuPos] = useState<{ x: number; y: number } | null>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const hasChildren = node.children.length > 0;
  // Close type menu on outside click or Escape
  useEffect(() => {
    if (!typeMenuPos) return;
    const handler = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) setTypeMenuPos(null);
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") setTypeMenuPos(null); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [typeMenuPos]);

  const openTypeMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Position menu at cursor, flip left if near right edge
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 280);
    setTypeMenuPos({ x, y });
  };

  const handleReveal = (e: React.MouseEvent) => {
    e.stopPropagation();
    const sep = projectPath.includes("\\") ? "\\" : "/";
    const fullPath = node.path
      ? projectPath.replace(/[\\/]+$/, "") + sep + node.path.replace(/\//g, sep)
      : projectPath;
    apiRevealInExplorer(fullPath).catch(() => {});
  };

  return (
    <div>
      <div
        className="relative group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          onClick={() => { onSelect(node.path); if (hasChildren) setOpen(o => !o); }}
          onContextMenu={openTypeMenu}
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left transition-colors text-xs",
            hovered ? "pr-14" : "pr-7",
            isSelected
              ? "bg-violet-600/20 text-violet-300"
              : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
          )}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          {hasChildren ? (
            <span className="shrink-0 text-white/25">
              {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </span>
          ) : (
            <span className="w-[10px] shrink-0" />
          )}
          {folderIcon(node.name, open, node.dominantCategory, node.overrideCategory)}
          <span className="truncate flex-1 font-medium text-[11px]">
            {node.name === "" ? "All Files" : node.name.replace(/_/g, " ")}
          </span>
          {node.overrideCategory && (
            <span className="text-[7px] font-bold text-violet-400/60 font-mono shrink-0 mr-1">
              {node.overrideCategory.replace("_", " ")}
            </span>
          )}
          {node.assetCount > 0 && (
            <span className="text-[9px] text-white/25 font-mono shrink-0">{node.assetCount}</span>
          )}
        </button>

        {/* Action buttons — shown on hover */}
        {hovered && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <button
              onClick={openTypeMenu}
              className="p-1 rounded hover:bg-violet-500/15 text-white/20 hover:text-violet-400 transition-colors"
              title="Set folder type"
            >
              <Tag size={9} />
            </button>
            <button
              onClick={handleReveal}
              className="p-1 rounded hover:bg-white/[0.08] text-white/20 hover:text-white/60 transition-colors"
              title="Open in Explorer"
            >
              <ExternalLink size={9} />
            </button>
          </div>
        )}

        {/* Folder type context menu — fixed position at cursor */}
        {typeMenuPos && (
          <div
            ref={typeMenuRef}
            style={{ position: "fixed", left: typeMenuPos.x, top: typeMenuPos.y, zIndex: 9999 }}
            className="w-48 bg-[#0e0c15] border border-white/[0.08] rounded-xl shadow-2xl py-1 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <p className="px-3 py-1.5 text-[9px] font-bold text-white/30 uppercase tracking-widest border-b border-white/[0.05] flex items-center gap-1.5">
              <Tag size={9} /> Set folder type
            </p>
            <p className="px-3 py-1 text-[9px] text-white/20 italic border-b border-white/[0.04]">
              All files inside will be tagged
            </p>
            {FOLDER_TYPE_OPTIONS.map(opt => {
              const isCurrent = node.overrideCategory === opt.value || (!node.overrideCategory && opt.value === "");
              return (
                <button key={opt.value}
                  onClick={() => {
                    setFolderType(node.path, opt.value);
                    onFolderTypeChange?.(node.path, opt.value);
                    setTypeMenuPos(null);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-white/[0.05]",
                    isCurrent ? "text-violet-400 bg-violet-950/20" : "text-white/60"
                  )}>
                  <span className={cn("w-2 h-2 rounded-full shrink-0",
                    opt.value === "SFX" ? "bg-orange-400" :
                    opt.value === "MUSIC" ? "bg-emerald-400" :
                    opt.value === "GRAPHICS" ? "bg-cyan-400" :
                    opt.value === "THUMBNAILS" ? "bg-pink-400" :
                    opt.value === "B_ROLL" ? "bg-violet-400" :
                    opt.value === "A_ROLL" ? "bg-red-400" :
                    opt.value === "EXPORTS" ? "bg-teal-400" :
                    opt.value === "PROJECT_FILES" ? "bg-amber-400" :
                    "bg-white/20"
                  )} />
                  <span className="flex-1 text-left">{opt.label}</span>
                  {isCurrent && <Check size={9} className="text-violet-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {open && hasChildren && (
        <div>
          {node.children.map(child => (
            <FolderTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              projectPath={projectPath}
              libraryMode={libraryMode}
              onSelect={onSelect}
              onFolderTypeChange={onFolderTypeChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SORT_OPTIONS = [
  { value: "created_at", label: "Date Added" },
  { value: "name",       label: "Name A-Z" },
  { value: "size",       label: "File Size" },
];

// ── Organize Modal ────────────────────────────────────────────────────────
const NAMING_PRESETS = [
  { label: "Standard",       value: "{client}_{project}_{category}_{original}_{index}.{ext}" },
  { label: "Category first", value: "{category}_{client}_{project}_{index}.{ext}" },
  { label: "Simple",         value: "{project}_{category}_{index}.{ext}" },
  { label: "Original + idx", value: "{original}_{index}.{ext}" },
];

const CATEGORIES = [
  { value: "A_ROLL",        label: "A-Roll",        dest: "MEDIA/A_ROLL",         color: "text-red-400" },
  { value: "B_ROLL",        label: "B-Roll",        dest: "MEDIA/B_ROLL",         color: "text-violet-400" },
  { value: "VOICEOVER",     label: "Voiceover",     dest: "AUDIO/Voiceovers",     color: "text-blue-400" },
  { value: "SFX",           label: "SFX",           dest: "AUDIO/SFX",            color: "text-cyan-400" },
  { value: "MUSIC",         label: "Music",         dest: "AUDIO/Music",          color: "text-emerald-400" },
  { value: "GRAPHICS",      label: "Graphics",      dest: "GRAPHICS/PNGs",        color: "text-pink-400" },
  { value: "THUMBNAILS",    label: "Thumbnails",    dest: "GRAPHICS/Thumbnails",  color: "text-pink-300" },
  { value: "EXPORTS",       label: "Exports",       dest: "EXPORTS/Final",        color: "text-amber-400" },
  { value: "PROJECT_FILES", label: "Project Files", dest: "PROJECT_FILES",        color: "text-orange-400" },
  { value: "ARCHIVE",       label: "Archive",       dest: "IMPORTS/Client_Files", color: "text-slate-400" },
];

const getCategoryMeta = (cat: string) =>
  CATEGORIES.find(c => c.value === cat) ?? { value: cat, label: cat, dest: "IMPORTS/Client_Files", color: "text-white/40" };

interface OrganizeRow {
  asset: Asset;
  include: boolean;
  category: string;
  proposed: string;
  renameEnabled: boolean;
}

const OrganizeModal: React.FC<{
  assets: Asset[];
  activeClient: { name: string } | undefined;
  activeProject: { name: string } | undefined;
  onClose: () => void;
  onApply: (renames: Record<string, string>, categoryOverrides: Record<string, string>) => Promise<void>;
}> = ({ assets, activeClient, activeProject, onClose, onApply }) => {
  const [template, setTemplate] = useState("{client}_{project}_{category}_{original}_{index}.{ext}");
  const [rows, setRows] = useState<OrganizeRow[]>([]);
  const [running, setRunning] = useState(false);
  const [applied, setApplied] = useState(false);
  const [step, setStep] = useState<"config" | "preview">("config");
  const [catDropdownId, setCatDropdownId] = useState<string | null>(null);

  useEffect(() => {
    apiGetNamingTemplate().then(t => { if (t) setTemplate(t); }).catch(() => {});
  }, []);

  const buildName = (asset: Asset, category: string, index: number) => {
    const ext  = asset.name.includes(".") ? asset.name.split(".").pop() ?? "" : "";
    const stem = asset.original_name.includes(".")
      ? asset.original_name.split(".").slice(0, -1).join(".")
      : asset.original_name;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return template
      .replace("{client}",   (activeClient?.name  ?? "Client").replace(/\s+/g, "_"))
      .replace("{project}",  (activeProject?.name ?? "Project").replace(/\s+/g, "_"))
      .replace("{category}", category)
      .replace("{original}", stem.replace(/\s+/g, "_"))
      .replace("{index}",    String(index + 1).padStart(3, "0"))
      .replace("{date}",     today)
      .replace("{ext}",      ext);
  };

  const isAudio = (asset: Asset) =>
    ["AUDIO", "MUSIC", "SFX", "VOICEOVER"].includes(asset.category) ||
    /\.(mp3|wav|aac|flac|ogg|m4a|aiff|aif|wma)$/i.test(asset.name);

  const isMediaFile = (asset: Asset) => {
    const ext = asset.name.split(".").pop()?.toLowerCase() ?? "";
    const mediaExts = new Set([
      // Video
      "mp4","mov","mkv","avi","mxf","m4v","wmv","webm","ts","mp2t",
      // Audio
      "mp3","wav","aac","flac","ogg","m4a","aiff","aif","wma",
      // Image
      "jpg","jpeg","png","gif","webp","bmp","tiff","tif","heic","heif",
      // Motion graphics / templates
      "mogrt","mogrts","aet","aepx","ffx","prfpset","jsx","jsxbin",
      // Fonts
      "ttf","otf","woff","woff2","eot",
    ]);
    // Skip project files, docs, and anything not in the media list
    return mediaExts.has(ext) && asset.category !== "PROJECT_FILES";
  };

  const handlePreview = () => {
    const mediaAssets = assets.filter(isMediaFile);
    setRows(mediaAssets.map((a, i) => {
      const audio = isAudio(a);
      return {
        asset: a,
        include: true,
        category: a.category,
        proposed: audio ? a.name : buildName(a, a.category, i),
        renameEnabled: !audio,
      };
    }));
    setApplied(false);
    setStep("preview");
  };

  const handleApply = async () => {
    const renames: Record<string, string> = {};
    const categoryOverrides: Record<string, string> = {};
    rows.forEach(r => {
      if (!r.include) return;
      renames[r.asset.id] = r.proposed;
      if (r.category !== r.asset.category) categoryOverrides[r.asset.id] = r.category;
    });
    if (!Object.keys(renames).length) { onClose(); return; }
    setRunning(true);
    try {
      await onApply(renames, categoryOverrides);
      setApplied(true);
      setTimeout(onClose, 1000);
    } finally { setRunning(false); }
  };

  const setRowField = <K extends keyof OrganizeRow>(id: string, field: K, value: OrganizeRow[K]) =>
    setRows(prev => prev.map(r => r.asset.id === id ? { ...r, [field]: value } : r));

  const setRowCategory = (id: string, category: string) => {
    setRows(prev => prev.map((r, i) => {
      if (r.asset.id !== id) return r;
      const newProposed = r.renameEnabled ? buildName(r.asset, category, i) : r.proposed;
      return { ...r, category, proposed: newProposed };
    }));
    setCatDropdownId(null);
  };

  const toggleAll = () => {
    const allOn = rows.every(r => r.include);
    setRows(prev => prev.map(r => ({ ...r, include: !allOn })));
  };

  const includedCount = rows.filter(r => r.include).length;

  const livePreview = activeProject
    ? template
        .replace("{client}",   (activeClient?.name  ?? "Client").replace(/\s+/g, "_"))
        .replace("{project}",  activeProject.name.replace(/\s+/g, "_"))
        .replace("{category}", "B_ROLL")
        .replace("{original}", "clip001")
        .replace("{index}",    "001")
        .replace("{date}",     new Date().toISOString().slice(0, 10).replace(/-/g, ""))
        .replace("{ext}",      "mp4")
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => setCatDropdownId(null)}>
      <div className="w-full max-w-4xl max-h-[88vh] bg-[#0c0a14] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-blue-500 flex items-center justify-center">
              <Wand2 size={13} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold font-outfit text-white">Organize & Rename</h2>
              <p className="text-[10px] text-white/35">
                {step === "config"
                  ? "Set naming template, then control each file individually"
                  : `${includedCount} of ${rows.length} files will be moved — uncheck to skip, change category to redirect`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step === "preview" && (
              <button onClick={() => setStep("config")} className="text-[10px] text-white/40 hover:text-white/75 transition-colors">← Back</button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {step === "config" ? (
            <div className="p-5 space-y-5">
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest font-outfit">Naming Template</p>
                <input type="text" value={template} onChange={e => setTemplate(e.target.value)}
                  className="w-full bg-white/[0.03] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:bg-white/[0.05] transition-colors" />
                <div className="flex flex-wrap gap-1">
                  {["{client}", "{project}", "{category}", "{original}", "{index}", "{date}", "{ext}"].map(t => (
                    <button key={t} onClick={() => setTemplate(prev => prev + t)}
                      className="text-[9px] font-mono bg-violet-950/30 text-violet-400 px-1.5 py-0.5 rounded hover:bg-violet-950/50 transition-colors">{t}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {NAMING_PRESETS.map(p => (
                    <button key={p.value} onClick={() => setTemplate(p.value)}
                      className={cn("text-[9px] px-2 py-1 rounded-lg border transition-colors",
                        template === p.value ? "border-violet-500/40 bg-violet-950/20 text-violet-400" : "border-white/[0.06] text-white/35 hover:text-white/60 hover:border-white/10"
                      )}>{p.label}</button>
                  ))}
                </div>
                {livePreview && (
                  <div className="bg-white/[0.02] rounded-lg px-3 py-2">
                    <p className="text-[9px] text-white/25 mb-1">Preview</p>
                    <p className="text-[10px] text-white/60 font-mono break-all">{livePreview}</p>
                  </div>
                )}
              </div>
              <div className="bg-white/[0.02] rounded-xl p-3 space-y-1.5 text-[10px] text-white/40 leading-relaxed">
                <p className="font-semibold text-white/55 mb-2">In the next step you can:</p>
                <div className="space-y-1.5">
                  {[
                    ["Uncheck", "any file to skip it — it stays exactly where it is"],
                    ["Change the category", "to redirect a file to a different folder (e.g. force a file into PROJECT_FILES)"],
                    ["Edit the filename", "directly in the new name field"],
                    ["Audio files", "keep their original name by default, but you can enable rename per file"],
                  ].map(([bold, rest]) => (
                    <p key={bold} className="flex items-start gap-1.5">
                      <span className="text-violet-400 shrink-0 mt-0.5">•</span>
                      <span><span className="text-white/60 font-medium">{bold}</span> {rest}</span>
                    </p>
                  ))}
                </div>
                <p className="pt-1.5 border-t border-white/[0.04] text-white/25">
                  Project files (.prproj, .drp, .aep, .xml, .json, .txt, etc.) are automatically excluded.
                </p>
              </div>
            </div>
          ) : (
            /* Preview table */
            <div className="flex flex-col min-h-0">
              {/* Table header */}
              <div className="flex items-center gap-3 px-5 py-2.5 bg-white/[0.02] shrink-0">
                <button onClick={toggleAll}
                  className={cn("w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0",
                    rows.every(r => r.include) ? "bg-violet-600 text-white" : "bg-white/[0.06] hover:bg-white/[0.1]"
                  )}>
                  {rows.every(r => r.include) && <Check size={9} />}
                </button>
                <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider font-outfit">
                  {includedCount} / {rows.length} files selected
                </span>
                <span className="ml-auto text-[9px] text-white/25 hidden sm:block">
                  Uncheck = skip · Change category = redirect to different folder
                </span>
              </div>
              {/* Column labels */}
              <div className="grid px-5 py-1.5 bg-white/[0.01] text-[9px] font-bold text-white/20 uppercase tracking-widest shrink-0"
                style={{ gridTemplateColumns: "28px 1fr 140px 1fr" }}>
                <div />
                <div className="pl-1">Original File</div>
                <div>Destination</div>
                <div className="pl-2">New Filename</div>
              </div>
              {/* Rows */}
              <div className="overflow-y-auto divide-y divide-white/[0.03]">
                {rows.map(row => {
                  const meta = getCategoryMeta(row.category);
                  const audio = isAudio(row.asset);
                  const isOpen = catDropdownId === row.asset.id;
                  return (
                    <div key={row.asset.id}
                      className={cn("grid px-5 py-2 items-center gap-3 transition-colors",
                        row.include ? "hover:bg-white/[0.02]" : "opacity-40")}
                      style={{ gridTemplateColumns: "28px 1fr 140px 1fr" }}>
                      {/* Checkbox */}
                      <button onClick={() => setRowField(row.asset.id, "include", !row.include)}
                        className={cn("w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0",
                          row.include ? "bg-violet-600 text-white" : "bg-white/[0.06] hover:bg-white/[0.12]"
                        )}>
                        {row.include && <Check size={9} />}
                      </button>
                      {/* Original filename */}
                      <div className="min-w-0">
                        <p className="font-mono text-white/65 truncate text-[10px]" title={row.asset.original_name}>
                          {row.asset.original_name}
                        </p>
                        <p className="text-[9px] text-white/25 font-mono mt-0.5">
                          {(row.asset.size / 1048576).toFixed(1)} MB
                        </p>
                      </div>
                      {/* Category / destination dropdown */}
                      <div className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); setCatDropdownId(isOpen ? null : row.asset.id); }}
                          className={cn("w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-mono transition-colors text-left",
                            "bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05]", meta.color)}>
                          <span className="truncate flex-1">{meta.dest.split("/").pop()}</span>
                          <ChevronDown size={9} className={cn("shrink-0 text-white/30 transition-transform", isOpen && "rotate-180")} />
                        </button>
                        {isOpen && (
                          <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-[#0e0c15] border border-white/[0.08] rounded-xl shadow-2xl py-1 overflow-hidden">
                            {CATEGORIES.map(cat => (
                              <button key={cat.value} onClick={() => setRowCategory(row.asset.id, cat.value)}
                                className={cn("w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]",
                                  row.category === cat.value ? "bg-violet-950/20" : "")}>
                                <span className={cn("text-[9px] font-bold font-mono w-20 shrink-0", cat.color)}>{cat.label}</span>
                                <span className="text-[9px] text-white/30 truncate flex-1">{cat.dest}</span>
                                {row.category === cat.value && <Check size={9} className="text-violet-400 shrink-0" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* New filename */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ArrowRight size={10} className="text-white/15 shrink-0" />
                        {audio && !row.renameEnabled ? (
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="flex-1 text-[10px] text-white/30 font-mono italic truncate px-2 py-1">
                              {row.asset.name}
                            </span>
                            <button onClick={() => setRowField(row.asset.id, "renameEnabled", true)}
                              className="shrink-0 text-[9px] text-white/25 hover:text-violet-400 transition-colors px-1.5 py-0.5 rounded border border-white/[0.06] hover:border-violet-500/30">
                              rename
                            </button>
                          </div>
                        ) : (
                          <input type="text" value={row.proposed}
                            onChange={e => setRowField(row.asset.id, "proposed", e.target.value)}
                            className="flex-1 bg-white/[0.03] rounded px-2 py-1 text-[10px] text-white/80 font-mono focus:outline-none focus:bg-white/[0.05] transition-colors min-w-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-white/[0.01] flex items-center justify-between shrink-0 border-t border-white/[0.04]">
          <div>
            {applied && (
              <div className="flex items-center gap-2 text-emerald-400 text-xs">
                <Check size={12} /> Applied successfully!
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs text-white/50 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors">
              Cancel
            </button>
            {step === "config" ? (
              <button onClick={handlePreview} disabled={!assets.filter(isMediaFile).length}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
                <Wand2 size={12} /> Preview {assets.filter(isMediaFile).length} Media Files
              </button>
            ) : (
              <button onClick={handleApply} disabled={running || includedCount === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
                {running ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                Apply to {includedCount} File{includedCount !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Workspace ────────────────────────────────────────────────────────
export const Workspace: React.FC = () => {
  const { clients, activeProjectId } = useProjectStore();
  const {
    assets, libraryAssets, selectedAssetId, setSelectedAssetId,
    searchQuery, setSearchQuery,
    sortField, sortOrder, setSort,
    getFilteredAssets, loading, fetchAssets, fetchLibraryAssets,
    renameAssetsBatch,
  } = useAssetStore();
  const { setImportModalOpen, activeLibraryPath, activeLibraryLabel, closeLibrary } = useUiStore();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [gridSize, setGridSize] = useState(4);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [quickLookAsset, setQuickLookAsset] = useState<Asset | null>(null);
  const [visibleCount, setVisibleCount] = useState(80);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [treeWidth, setTreeWidth] = useState(208); // default 52 * 4 = 208px
  const treeResizing = useRef(false);
  const treeResizeStart = useRef(0);
  const treeWidthStart = useRef(208);
  // Folder type overrides — triggers re-render of tree when changed
  const [folderTypeVersion, setFolderTypeVersion] = useState(0);
  const handleFolderTypeChange = (_path: string, _cat: string) => {
    setFolderTypeVersion(v => v + 1);
  };
  // Library favorites — stored in localStorage since library assets aren't in the DB
  const [libFavorites, setLibFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("vizwall_lib_favorites") ?? "[]")); }
    catch { return new Set(); }
  });

  const toggleLibFavorite = (assetId: string) => {
    setLibFavorites(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
      localStorage.setItem("vizwall_lib_favorites", JSON.stringify([...next]));
      return next;
    });
  };

  // Library mode: driven by activeLibraryPath instead of activeProjectId
  const isLibraryMode = !!activeLibraryPath;

  const activeProject = clients.flatMap(c => c.projects).find(p => p.id === activeProjectId);
  const activeClient  = clients.find(c => c.projects.some(p => p.id === activeProjectId));

  // Root path and display assets depend on mode
  const projectPath = isLibraryMode ? (activeLibraryPath ?? "") : (activeProject?.path ?? "");
  // In library mode, merge favorites state AND folder type overrides into assets
  const displayAssets = useMemo(() => {
    if (!isLibraryMode) return assets;
    const folderTypes = getFolderTypes();
    const normRoot = projectPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    return libraryAssets.map(a => {
      const normA = a.path.replace(/\\/g, "/");
      const normALower = normA.toLowerCase();
      let rel = normA;
      if (normRoot && normALower.startsWith(normRoot)) {
        rel = normA.slice(normRoot.length).replace(/^[/\\]+/, "");
      }
      const parts = rel.replace(/\\/g, "/").split("/");
      parts.pop();
      // Check each ancestor folder for a type override (most specific wins)
      let overrideCat: string | undefined;
      for (let i = parts.length; i >= 1; i--) {
        const folderPath = parts.slice(0, i).join("/");
        const override = folderTypes[folderPath] || folderTypes[folderPath.toLowerCase()];
        if (override) { overrideCat = override; break; }
      }
      return {
        ...a,
        favorite: libFavorites.has(a.id),
        category: overrideCat || a.category,
        tags: overrideCat ? [overrideCat, ...a.tags.filter(t => t !== a.category)] : a.tags,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLibraryMode, libraryAssets, libFavorites, projectPath, folderTypeVersion]);

  // Load library assets when library mode activates — uses disk cache if available
  useEffect(() => {
    if (isLibraryMode && activeLibraryPath) {
      const { cachedLibraryPath } = useAssetStore.getState();
      if (cachedLibraryPath !== activeLibraryPath) {
        setSelectedFolder("");
      }
      fetchLibraryAssets(activeLibraryPath); // Rust handles disk cache
    }
  }, [activeLibraryPath, isLibraryMode]);

  // Reset folder selection when switching projects
  useEffect(() => {
    if (!isLibraryMode) setSelectedFolder("");
  }, [activeProjectId, isLibraryMode]);

  // Tree panel resize handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!treeResizing.current) return;
      const delta = e.clientX - treeResizeStart.current;
      const newW = Math.max(160, Math.min(480, treeWidthStart.current + delta));
      setTreeWidth(newW);
    };
    const onUp = () => { treeResizing.current = false; document.body.style.cursor = ""; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, []);

  const allAssets = isLibraryMode
    ? displayAssets.filter(a => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return a.name.toLowerCase().includes(q);
      })
    : getFilteredAssets();

  // Build folder tree from all display assets
  const folderTree = useMemo(
    () => buildFolderTree(displayAssets, projectPath, isLibraryMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayAssets, projectPath, isLibraryMode, folderTypeVersion]
  );

  // Assets in the selected folder, then apply search filter
  const folderAssets = useMemo(() => {
    // Special: favorites virtual folder
    if (selectedFolder === "__favorites__") {
      const favs = displayAssets.filter(a => a.favorite);
      if (!searchQuery) return favs;
      const q = searchQuery.toLowerCase();
      return favs.filter(a => a.name.toLowerCase().includes(q));
    }
    const inFolder = getAssetsInFolder(allAssets, selectedFolder, projectPath);
    if (!searchQuery) return inFolder;
    const q = searchQuery.toLowerCase();
    return inFolder.filter(a => a.name.toLowerCase().includes(q));
  }, [allAssets, selectedFolder, projectPath, searchQuery, displayAssets]);

  useEffect(() => {
    setVisibleCount(80);
    listContainerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedFolder, searchQuery, viewMode, gridSize, isLibraryMode]);

  const renderedAssets = useMemo(
    () => folderAssets.slice(0, visibleCount),
    [folderAssets, visibleCount]
  );

  const loadMoreAssets = () => {
    if (visibleCount >= folderAssets.length) return;
    setVisibleCount(v => Math.min(v + 60, folderAssets.length));
  };

  const handleRefresh = () => {
    if (isLibraryMode && activeLibraryPath) fetchLibraryAssets(activeLibraryPath, true); // force re-scan
    else if (activeProjectId) fetchAssets(activeProjectId);
  };

  // Spacebar → QuickLook
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;
      if (isEditable) return;
      if (e.key === " " && selectedAssetId && !quickLookAsset) {
        e.preventDefault();
        const asset = folderAssets.find(a => a.id === selectedAssetId);
        if (asset) setQuickLookAsset(asset);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedAssetId, quickLookAsset, folderAssets]);

  const handleSortChange = (field: "name" | "size" | "created_at") => {
    const newOrder = sortField === field && sortOrder === "desc" ? "asc" : "desc";
    setSort(field, newOrder);
    setSortOpen(false);
  };

  const currentSortLabel = SORT_OPTIONS.find(s => s.value === sortField)?.label ?? "Date Added";

  // Current folder display name
  const currentFolderName = selectedFolder
    ? selectedFolder.split("/").pop()?.replace(/_/g, " ") ?? selectedFolder
    : "All Files";

  if (!activeProject && !isLibraryMode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
          <FolderOpen size={28} className="text-white/20" />
        </div>
        <h3 className="text-sm font-bold text-white/40 mb-2">No Project Selected</h3>
        <p className="text-xs text-white/25 max-w-[260px]">
          Select a project from the sidebar, or click a Global Library folder to browse shared assets.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden">

      {/* ── Left: Folder tree panel — resizable ── */}
      <div
        className="shrink-0 bg-[#09080e]/60 flex flex-col border-r border-white/[0.04] overflow-hidden relative"
        style={{ width: treeWidth }}
      >
        {/* Panel header */}
        <div className="px-3 py-2.5 shrink-0 border-b border-white/[0.04]">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest font-outfit">
                {isLibraryMode ? "Library" : "Folders"}
              </p>
              {/* Only show subtitle if it's different from the header label */}
              {!isLibraryMode && (
                <p className="text-[10px] text-white/40 mt-0.5 truncate">{activeProject?.name}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isLibraryMode && (
                <button onClick={() => { closeLibrary(); }}
                  className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/20 hover:text-white/60 transition-colors"
                  title="Back to projects">
                  <X size={11} />
                </button>
              )}
              <button onClick={() => apiRevealInExplorer(projectPath).catch(() => {})}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/20 hover:text-white/60 transition-colors"
                title="Open in Explorer">
                <ExternalLink size={11} />
              </button>
            </div>
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <FolderSync size={18} className="text-violet-500/40 animate-spin" />
            </div>
          ) : displayAssets.length === 0 ? (
            <p className="text-[10px] text-white/20 italic px-2 py-4 text-center">No assets yet</p>
          ) : (
            <>
              {/* Favorites virtual node — shown in both library and project mode */}
              {(() => {
                const favCount = isLibraryMode
                  ? displayAssets.filter(a => a.favorite).length
                  : assets.filter(a => a.favorite).length;
                if (favCount === 0) return null;
                return (
                  <button
                    onClick={() => setSelectedFolder("__favorites__")}
                    className={cn(
                      "w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left transition-colors text-xs",
                      selectedFolder === "__favorites__"
                        ? "bg-violet-600/20 text-violet-300"
                        : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                    )}
                  >
                    <span className="w-[10px] shrink-0" />
                    <Star size={12} className={cn("shrink-0", selectedFolder === "__favorites__" ? "text-violet-400 fill-violet-400" : "text-amber-400/70 fill-amber-400/40")} />
                    <span className="truncate flex-1 font-medium text-[11px]">Favorites</span>
                    <span className="text-[9px] text-white/25 font-mono shrink-0">{favCount}</span>
                  </button>
                );
              })()}
              <FolderTreeItem
                node={folderTree}
                depth={0}
                selectedPath={selectedFolder}
                projectPath={projectPath}
                libraryMode={isLibraryMode}
                onSelect={setSelectedFolder}
                onFolderTypeChange={handleFolderTypeChange}
              />
            </>
          )}
        </div>

        {/* Import button at bottom — only for project mode */}
        {!isLibraryMode && (
          <div className="p-2 shrink-0 border-t border-white/[0.04]">
            <button
              onClick={() => setImportModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-violet-600/15 hover:bg-violet-600/25 text-violet-400 text-[10px] font-semibold rounded-lg transition-colors"
            >
              <HardDriveUpload size={11} /> Import Folder
            </button>
          </div>
        )}
        {isLibraryMode && (
          <div className="p-2 shrink-0 border-t border-white/[0.04]">
            <button
              onClick={handleRefresh}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/70 text-[10px] font-semibold rounded-lg transition-colors"
            >
              <FolderSync size={11} /> Re-scan Folder
            </button>
          </div>
        )}
        {/* Resize handle — inside the panel so absolute positioning works */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-violet-500/30 transition-colors z-10"
          onMouseDown={e => {
            e.preventDefault();
            treeResizing.current = true;
            treeResizeStart.current = e.clientX;
            treeWidthStart.current = treeWidth;
            document.body.style.cursor = "col-resize";
          }}
        />
      </div>

      {/* ── Center: Asset grid ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="px-4 py-2.5 bg-[#09080e]/40 shrink-0 border-b border-white/[0.04]">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-[10px] text-white/30 mb-2 flex-wrap">
            {isLibraryMode ? (
              <>
                <span className="text-violet-400/70">Global Library</span>
                <ChevronRight size={10} />
                <span className="text-white/65 font-medium">{activeLibraryLabel}</span>
              </>
            ) : (
              <>
                <span>{activeClient?.name}</span>
                <ChevronRight size={10} />
                <span>{activeProject?.name}</span>
              </>
            )}
            {selectedFolder && selectedFolder.split("/").map((part, i, arr) => (
              <React.Fragment key={i}>
                <ChevronRight size={10} />
                <button
                  onClick={() => setSelectedFolder(arr.slice(0, i + 1).join("/"))}
                  className={cn("hover:text-white/70 transition-colors", i === arr.length - 1 ? "text-white/65 font-medium" : "")}
                >
                  {part.replace(/_/g, " ")}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" size={12} />
              <input
                type="text"
                placeholder={`Search in ${currentFolderName}…`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white/[0.03] rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:bg-white/[0.05] transition-colors"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="relative">
              <button
                onClick={() => setSortOpen(!sortOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/5 bg-white/[0.03] text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all"
              >
                <span className="text-white/70">{currentSortLabel}</span>
                <ChevronDown size={10} className={cn("transition-transform", sortOpen && "rotate-180")} />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-[#0e0c15] rounded-xl overflow-hidden shadow-xl w-36">
                  {SORT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleSortChange(opt.value as any)}
                      className={cn("w-full text-left px-3 py-2 text-xs transition-colors hover:bg-violet-950/30",
                        sortField === opt.value ? "text-violet-400 bg-violet-950/20" : "text-white/60"
                      )}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* View mode */}
            <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5">
              <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded transition-all", viewMode === "grid" ? "bg-violet-600/20 text-violet-400" : "text-white/30 hover:text-white")}>
                <LayoutGrid size={12} />
              </button>
              <button onClick={() => setViewMode("list")} className={cn("p-1.5 rounded transition-all", viewMode === "list" ? "bg-violet-600/20 text-violet-400" : "text-white/30 hover:text-white")}>
                <List size={12} />
              </button>
            </div>

            {/* Grid size slider */}
            {viewMode === "grid" && (
              <div className="flex items-center gap-1.5 bg-white/[0.03] rounded-lg px-2 py-1">
                <Columns2 size={10} className="text-white/30 shrink-0" />
                <input
                  type="range" min={2} max={8} step={1} value={gridSize}
                  onChange={e => setGridSize(Number(e.target.value))}
                  className="w-14 accent-violet-500 cursor-pointer"
                  title={`${gridSize} columns`}
                />
                <span className="text-[9px] text-white/30 font-mono w-3 text-center">{gridSize}</span>
              </div>
            )}

            <div className="flex-1" />

            {/* Organize — only for project mode */}
            {!isLibraryMode && (
              <button
                onClick={() => setOrganizeOpen(true)}
                className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-violet-950/30 text-white/60 hover:text-violet-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              >
                <Wand2 size={12} /> Organize
              </button>
            )}
          </div>
        </div>

        {/* Count bar */}
        <div className="px-4 py-1 border-b border-white/[0.03] bg-[#09080e]/20 flex items-center gap-3 shrink-0">
          <span className="text-[9px] text-white/25 font-mono">
            {folderAssets.length} file{folderAssets.length !== 1 ? "s" : ""}
            {selectedFolder && <span className="text-white/15"> in {currentFolderName}</span>}
          </span>
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="flex items-center gap-1 text-[9px] text-violet-400 hover:text-violet-300">
              <X size={8} /> Clear search
            </button>
          )}
        </div>

        {/* Asset grid / list */}
        <div
          ref={listContainerRef}
          className="flex-1 overflow-y-auto p-4"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) loadMoreAssets();
          }}
        >
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center">
              <FolderSync size={24} className="text-violet-500 animate-spin mb-3" />
              <span className="text-xs text-white/40">Indexing files…</span>
            </div>
          ) : folderAssets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/[0.05] rounded-2xl">
              <FolderOpen size={36} className="text-white/10 mb-4" />
              <h3 className="text-sm font-bold text-white/35 mb-1">
                {searchQuery ? "No matching files" : "This folder is empty"}
              </h3>
              <p className="text-xs text-white/20 max-w-[240px] mb-4">
                {searchQuery
                  ? "Try a different search term."
                  : "Import files or select a different folder."}
              </p>
              {!searchQuery && (
                <button onClick={() => setImportModalOpen(true)}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5">
                  <HardDriveUpload size={12} /> Import Folder
                </button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
            >
              {renderedAssets.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onSelect={a => setSelectedAssetId(a.id)}
                  onQuickLook={setQuickLookAsset}
                  onRefresh={handleRefresh}
                  isSelected={selectedAssetId === asset.id}
                  viewMode="grid"
                  onLibFavoriteToggle={isLibraryMode ? () => toggleLibFavorite(asset.id) : undefined}
                />
              ))}
              {renderedAssets.length < folderAssets.length && (
                <div className="col-span-full py-2 text-center text-[10px] text-white/35">
                  Loading {renderedAssets.length}/{folderAssets.length}...
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/[0.02] rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-3 px-4 py-2 bg-white/[0.02] text-[9px] font-bold text-white/25 uppercase tracking-widest">
                <div className="col-span-1" />
                <div className="col-span-5">Name</div>
                <div className="col-span-2">Category</div>
                <div className="col-span-2">Size</div>
                <div className="col-span-2">Date</div>
              </div>
              {renderedAssets.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onSelect={a => setSelectedAssetId(a.id)}
                  onQuickLook={setQuickLookAsset}
                  onRefresh={handleRefresh}
                  isSelected={selectedAssetId === asset.id}
                  viewMode="list"
                  onLibFavoriteToggle={isLibraryMode ? () => toggleLibFavorite(asset.id) : undefined}
                />
              ))}
              {renderedAssets.length < folderAssets.length && (
                <div className="px-4 py-2 text-center text-[10px] text-white/35">
                  Loading {renderedAssets.length}/{folderAssets.length}...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Inspector — hidden in library mode ── */}
      {!isLibraryMode && (
      <div className="w-64 shrink-0 bg-[#0a0910] flex flex-col overflow-hidden border-l border-white/[0.04]">
        <div className="px-4 py-2.5 shrink-0 flex items-center justify-between border-b border-white/[0.04]">
          <span className="text-[9px] font-bold text-white/25 uppercase tracking-wider font-outfit">Inspector</span>
          {selectedAssetId && (
            <button onClick={() => setSelectedAssetId(null)} className="text-white/20 hover:text-white/50 transition-colors">
              <X size={11} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <AssetInspector />
        </div>
      </div>
      )}

      {/* Organize Modal */}
      {organizeOpen && !isLibraryMode && (
        <OrganizeModal
          assets={folderAssets.length > 0 ? folderAssets : displayAssets}
          activeClient={activeClient}
          activeProject={activeProject}
          onClose={() => setOrganizeOpen(false)}
          onApply={async (renames, categoryOverrides) => {
            // Apply category overrides first (moves file to new folder)
            for (const [assetId, newCategory] of Object.entries(categoryOverrides)) {
              try {
                const { apiUpdateAssetCategory } = await import("../lib/tauri");
                await apiUpdateAssetCategory(assetId, newCategory);
              } catch (e) { console.error(e); }
            }
            // Then apply renames
            await renameAssetsBatch(renames);
            if (activeProjectId) await fetchAssets(activeProjectId);
          }}
        />
      )}

      {/* QuickLook */}
      {quickLookAsset && (
        <QuickLook
          asset={quickLookAsset}
          allAssets={folderAssets}
          onClose={() => setQuickLookAsset(null)}
          onNavigate={a => { setQuickLookAsset(a); setSelectedAssetId(a.id); }}
        />
      )}
    </div>
  );
};

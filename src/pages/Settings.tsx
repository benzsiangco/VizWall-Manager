import React, { useEffect, useState } from "react";
import {
  FolderSearch, Save, RefreshCw, CheckCircle, AlertCircle,
  Settings as SettingsIcon, FolderOpen, Library,
} from "lucide-react";
import { apiGetWorkspacePath, apiSaveWorkspacePath, apiPickFolder, apiGetGlobalLibrary, apiSaveGlobalLibrary } from "../lib/tauri";

const DEFAULT_NAMING = "{client}_{project}_{category}_{original}_{index}.{ext}";

export const Settings: React.FC = () => {
  const [workspacePath, setWorkspacePath] = useState("");
  const [namingTemplate, setNamingTemplate] = useState(DEFAULT_NAMING);
  const [libraryPath, setLibraryPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGetWorkspacePath().then((p) => { if (p) setWorkspacePath(p); }).catch((e) => setError(String(e)));
    apiGetGlobalLibrary().then((p) => { if (p) setLibraryPath(p); }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiSaveWorkspacePath(workspacePath, namingTemplate);
      await apiSaveGlobalLibrary(libraryPath);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePickWorkspace = async () => {
    const path = await apiPickFolder();
    if (path) setWorkspacePath(path);
  };

  const handlePickLibrary = async () => {
    const path = await apiPickFolder();
    if (path) setLibraryPath(path);
  };

  const templatePreview = namingTemplate
    .replace("{client}", "Nike")
    .replace("{project}", "SummerCampaign")
    .replace("{category}", "B_ROLL")
    .replace("{original}", "clip001")
    .replace("{index}", "001")
    .replace("{ext}", "mp4");

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-blue-500 flex items-center justify-center">
          <SettingsIcon size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold font-outfit text-white">Settings</h1>
          <p className="text-xs text-white/40">Workspace, library, and file naming</p>
        </div>
      </div>

      {/* Workspace Path */}
      <div className="bg-[#0b0a13]/60 border border-white/5 rounded-2xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest font-outfit flex items-center gap-2">
          <FolderOpen size={14} className="text-violet-400" />
          Workspace Root Path
        </h3>
        <p className="text-[11px] text-white/40 leading-relaxed">
          The base folder where all new client projects are created. Each project gets its own subfolder here.
        </p>
        <div className="flex gap-2">
          <input type="text" value={workspacePath} onChange={(e) => setWorkspacePath(e.target.value)}
            placeholder="e.g. D:/Projects  or  E:/ClientWork"
            className="flex-1 bg-[#12101c]/60 border border-white/5 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
          <button onClick={handlePickWorkspace}
            className="px-3 py-2 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-[10px] font-bold rounded-lg transition-colors font-outfit uppercase flex items-center gap-1.5">
            <FolderSearch size={12} /> Browse
          </button>
        </div>
        {workspacePath && (
          <p className="text-[10px] text-emerald-400 flex items-center gap-1">
            <CheckCircle size={10} />
            New projects: <span className="font-mono ml-1">{workspacePath}/[Client]/[Project]</span>
          </p>
        )}
      </div>

      {/* Global Library */}
      <div className="bg-[#0b0a13]/60 border border-white/5 rounded-2xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest font-outfit flex items-center gap-2">
          <Library size={14} className="text-violet-400" />
          Global Library Path
        </h3>
        <p className="text-[11px] text-white/40 leading-relaxed">
          Your shared asset library — SFX, music, graphics, LUTs, fonts, stock footage. Organize it however you like with subfolders. VizWall shows the full folder tree and auto-tags everything inside.
        </p>
        <div className="flex gap-2">
          <input type="text" value={libraryPath} onChange={(e) => setLibraryPath(e.target.value)}
            placeholder="e.g. D:/Library  or  E:/SharedAssets"
            className="flex-1 bg-[#12101c]/60 border border-white/5 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
          <button onClick={handlePickLibrary}
            className="px-3 py-2 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-[10px] font-bold rounded-lg transition-colors font-outfit uppercase flex items-center gap-1.5">
            <FolderSearch size={12} /> Browse
          </button>
          {libraryPath && (
            <button onClick={() => setLibraryPath("")}
              className="px-2.5 py-2 bg-white/[0.03] hover:bg-red-500/10 border border-white/5 text-white/25 hover:text-red-400 rounded-lg transition-colors text-xs">
              ✕
            </button>
          )}
        </div>
        {libraryPath && (
          <p className="text-[10px] text-emerald-400 flex items-center gap-1">
            <CheckCircle size={10} />
            Library: <span className="font-mono ml-1 truncate">{libraryPath}</span>
          </p>
        )}
      </div>

      {/* File Naming Template */}
      <div className="bg-[#0b0a13]/60 border border-white/5 rounded-2xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest font-outfit">
          File Naming Template
        </h3>
        <p className="text-[11px] text-white/40 leading-relaxed">
          Used when organizing project folders. Tokens:{" "}
          {["{client}", "{project}", "{category}", "{original}", "{index}", "{ext}"].map((t) => (
            <code key={t} className="text-violet-400 bg-violet-950/30 px-1 rounded mx-0.5">{t}</code>
          ))}
        </p>
        <input type="text" value={namingTemplate} onChange={(e) => setNamingTemplate(e.target.value)}
          className="w-full bg-[#12101c]/60 border border-white/5 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
        <p className="text-[10px] text-white/30">
          Preview: <span className="text-white/60 font-mono">{templatePreview}</span>
        </p>
      </div>

      {/* Save */}
      <div className="flex items-center justify-between pb-4">
        <div>
          {error && <div className="flex items-center gap-2 text-red-400 text-xs"><AlertCircle size={14} /><span>{error}</span></div>}
          {saved && <div className="flex items-center gap-2 text-emerald-400 text-xs"><CheckCircle size={14} /><span>Settings saved</span></div>}
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold tracking-wider uppercase rounded-xl transition-all font-outfit">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Save Settings
        </button>
      </div>
    </div>
  );
};

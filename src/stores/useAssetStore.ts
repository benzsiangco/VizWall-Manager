import { create } from "zustand";
import { 
  apiGetProjectAssets, 
  apiImportFolder, 
  apiRenameAssetsBatch, 
  apiToggleFavoriteAsset,
  apiGetStorageStats,
  apiScanFolderAssets,
  apiClearLibraryCache,
  Asset,
  StorageStats
} from "../lib/tauri";

interface AssetState {
  assets: Asset[];
  libraryAssets: Asset[];
  cachedLibraryPath: string | null;
  selectedAssetId: string | null;
  loading: boolean;
  searchQuery: string;
  categoryFilter: string | null;
  tagFilter: string | null;
  sortField: "name" | "size" | "created_at";
  sortOrder: "asc" | "desc";
  storageStats: StorageStats | null;
  
  fetchAssets: (projectId: string) => Promise<void>;
  fetchLibraryAssets: (folderPath: string, forceRefresh?: boolean) => Promise<void>;
  invalidateLibraryCache: (folderPath?: string) => Promise<void>;
  importFolder: (projectId: string, folderPath: string, excludedSubfolders?: string[]) => Promise<Asset[]>;
  renameAssetsBatch: (renames: Record<string, string>) => Promise<void>;
  toggleFavoriteAsset: (assetId: string) => Promise<void>;
  fetchStorageStats: () => Promise<void>;
  
  setSelectedAssetId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setCategoryFilter: (category: string | null) => void;
  setTagFilter: (tag: string | null) => void;
  setSort: (field: "name" | "size" | "created_at", order: "asc" | "desc") => void;
  getFilteredAssets: () => Asset[];
  getAllTags: () => string[];
}

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: [],
  libraryAssets: [],
  cachedLibraryPath: null,
  selectedAssetId: null,
  loading: false,
  searchQuery: "",
  categoryFilter: null,
  tagFilter: null,
  sortField: "created_at",
  sortOrder: "desc",
  storageStats: null,

  fetchAssets: async (projectId: string) => {
    set({ loading: true });
    try {
      const data = await apiGetProjectAssets(projectId);
      set({ assets: data, loading: false });
      const currentSelected = get().selectedAssetId;
      if (currentSelected && !data.some(a => a.id === currentSelected)) {
        set({ selectedAssetId: null });
      }
    } catch (e) {
      console.error(e);
      set({ assets: [], loading: false });
    }
  },

  fetchLibraryAssets: async (folderPath: string, forceRefresh = false) => {
    const { cachedLibraryPath, libraryAssets } = get();

    // If same path and already loaded and not forcing refresh, skip entirely
    if (!forceRefresh && cachedLibraryPath === folderPath && libraryAssets.length > 0) {
      return;
    }

    // Show loading only on first load or force refresh
    const isFirstLoad = cachedLibraryPath !== folderPath || libraryAssets.length === 0;
    if (isFirstLoad) set({ loading: true });

    try {
      // Disk cache handled by Rust — returns instantly if cache is valid
      const data = await apiScanFolderAssets(folderPath, forceRefresh);
      set({
        libraryAssets: data,
        cachedLibraryPath: folderPath,
        loading: false,
        selectedAssetId: null,
      });
    } catch (e) {
      console.error(e);
      set({ libraryAssets: [], loading: false });
    }
  },

  invalidateLibraryCache: async (folderPath?: string) => {
    await apiClearLibraryCache(folderPath ?? "");
    set({ cachedLibraryPath: null, libraryAssets: [] });
  },

  importFolder: async (projectId: string, folderPath: string, excludedSubfolders: string[] = []) => {
    const { useUiStore } = await import("./useUiStore");
    const taskId = `import-${Date.now()}`;
    useUiStore.getState().startProgress(taskId, "Importing folder", 1);
    useUiStore.getState().updateProgress(taskId, 0, folderPath);

    set({ loading: true });
    try {
      const newAssets = await apiImportFolder(projectId, folderPath, excludedSubfolders);
      // Refresh assets & storage stats
      await get().fetchAssets(projectId);
      await get().fetchStorageStats();
      useUiStore.getState().updateProgress(taskId, 1, `Imported ${newAssets.length} file${newAssets.length === 1 ? "" : "s"}`);
      useUiStore.getState().finishProgress(taskId, "done");
      set({ loading: false });
      return newAssets;
    } catch (e) {
      console.error(e);
      useUiStore.getState().finishProgress(taskId, "error");
      set({ loading: false });
      return [];
    }
  },

  renameAssetsBatch: async (renames: Record<string, string>) => {
    const total = Object.keys(renames).length;
    if (total === 0) return;

    // Lazy-import the UI store to avoid a circular static import
    const { useUiStore } = await import("./useUiStore");
    const taskId = `rename-${Date.now()}`;
    useUiStore.getState().startProgress(taskId, `Renaming ${total} file${total === 1 ? "" : "s"}`, total);

    set({ loading: true });
    try {
      // Show incremental progress — call the API in chunks of ~10
      const entries = Object.entries(renames);
      const chunkSize = 10;
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = Object.fromEntries(entries.slice(i, i + chunkSize));
        await apiRenameAssetsBatch(chunk);
        const done = Math.min(i + chunkSize, total);
        useUiStore.getState().updateProgress(taskId, done, `${done}/${total} renamed`);
      }

      // Refresh current list (requires an active project ID)
      const firstAsset = get().assets[0];
      if (firstAsset) {
        await get().fetchAssets(firstAsset.project_id);
      }
      useUiStore.getState().finishProgress(taskId, "done");
      set({ loading: false });
    } catch (e) {
      console.error(e);
      useUiStore.getState().finishProgress(taskId, "error");
      set({ loading: false });
    }
  },

  toggleFavoriteAsset: async (assetId: string) => {
    // Optimistic toggle
    const previousAssets = get().assets;
    const updatedAssets = previousAssets.map(a => 
      a.id === assetId ? { ...a, favorite: !a.favorite } : a
    );
    set({ assets: updatedAssets });

    try {
      await apiToggleFavoriteAsset(assetId);
    } catch (e) {
      // Revert
      set({ assets: previousAssets });
      console.error(e);
    }
  },

  fetchStorageStats: async () => {
    try {
      const stats = await apiGetStorageStats();
      set({ storageStats: stats });
    } catch (e) {
      console.error(e);
    }
  },

  setSelectedAssetId: (id: string | null) => {
    set({ selectedAssetId: id });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setCategoryFilter: (category: string | null) => {
    set({ categoryFilter: category });
  },

  setTagFilter: (tag: string | null) => {
    set({ tagFilter: tag });
  },

  setSort: (field: "name" | "size" | "created_at", order: "asc" | "desc") => {
    set({ sortField: field, sortOrder: order });
  },

  getFilteredAssets: () => {
    const { assets, searchQuery, categoryFilter, tagFilter, sortField, sortOrder } = get();
    
    let filtered = [...assets];

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        a => a.name.toLowerCase().includes(q) || 
             (a.ai_description && a.ai_description.toLowerCase().includes(q)) ||
             a.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Filter by category
    if (categoryFilter) {
      filtered = filtered.filter(a => a.category === categoryFilter);
    }

    // Filter by tag
    if (tagFilter) {
      filtered = filtered.filter(a => a.tags.includes(tagFilter));
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === "size") {
        comparison = a.size - b.size;
      } else if (sortField === "created_at") {
        comparison = a.created_at.localeCompare(b.created_at);
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  },

  getAllTags: () => {
    const { assets } = get();
    const tagsSet = new Set<string>();
    assets.forEach(a => a.tags.forEach(t => tagsSet.add(t)));
    return Array.from(tagsSet);
  }
}));

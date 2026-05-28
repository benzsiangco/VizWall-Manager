import { create } from "zustand";
import { apiGetRecentActivity, ActivityLog } from "../lib/tauri";

export interface ProgressTask {
  id: string;
  label: string;
  current: number;
  total: number;
  status: "running" | "done" | "error";
  detail?: string;
}

export type ActiveTab = "dashboard" | "workspace" | "pipeline" | "revisions" | "exports" | "archive" | "settings" | "clean";

interface UiState {
  activeTab: ActiveTab;
  newClientModalOpen: boolean;
  newProjectModalOpen: boolean;
  importModalOpen: boolean;
  aboutModalOpen: boolean;
  updateModalOpen: boolean;
  updateInfo: any;

  // Library mode — when set, Workspace shows a standalone folder instead of a project
  activeLibraryPath: string | null;
  activeLibraryLabel: string | null;

  recentActivity: ActivityLog[];
  progressTasks: ProgressTask[];

  setActiveTab: (tab: ActiveTab) => void;
  setNewClientModalOpen: (open: boolean) => void;
  setNewProjectModalOpen: (open: boolean) => void;
  setImportModalOpen: (open: boolean) => void;
  setAboutModalOpen: (open: boolean) => void;
  setUpdateModalOpen: (open: boolean) => void;
  setUpdateInfo: (info: any) => void;
  openLibrary: (path: string, label: string) => void;
  closeLibrary: () => void;
  fetchRecentActivity: () => Promise<void>;

  startProgress: (id: string, label: string, total: number) => void;
  updateProgress: (id: string, current: number, detail?: string) => void;
  finishProgress: (id: string, status?: "done" | "error") => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "dashboard",
  newClientModalOpen: false,
  newProjectModalOpen: false,
  importModalOpen: false,
  aboutModalOpen: false,
  updateModalOpen: false,
  updateInfo: null,
  activeLibraryPath: null,
  activeLibraryLabel: null,

  recentActivity: [],
  progressTasks: [],

  setActiveTab: (tab) => set({ activeTab: tab }),
  setNewClientModalOpen: (open) => set({ newClientModalOpen: open }),
  setNewProjectModalOpen: (open) => set({ newProjectModalOpen: open }),
  setImportModalOpen: (open) => set({ importModalOpen: open }),
  setAboutModalOpen: (open) => set({ aboutModalOpen: open }),
  setUpdateModalOpen: (open) => set({ updateModalOpen: open }),
  setUpdateInfo: (info) => set({ updateInfo: info }),

  openLibrary: (path, label) => set({
    activeLibraryPath: path,
    activeLibraryLabel: label,
    activeTab: "workspace",
  }),

  closeLibrary: () => set({
    activeLibraryPath: null,
    activeLibraryLabel: null,
  }),

  fetchRecentActivity: async () => {
    try {
      const logs = await apiGetRecentActivity();
      set({ recentActivity: logs });
    } catch (e) {
      console.error(e);
    }
  },

  startProgress: (id, label, total) =>
    set((state) => ({
      progressTasks: [
        ...state.progressTasks.filter((t) => t.id !== id),
        { id, label, current: 0, total, status: "running" },
      ],
    })),

  updateProgress: (id, current, detail) =>
    set((state) => ({
      progressTasks: state.progressTasks.map((t) =>
        t.id === id ? { ...t, current, detail: detail ?? t.detail } : t
      ),
    })),

  finishProgress: (id, status = "done") =>
    set((state) => {
      setTimeout(() => {
        useUiStore.setState({
          progressTasks: useUiStore.getState().progressTasks.filter((t) => t.id !== id),
        });
      }, 1500);
      return {
        progressTasks: state.progressTasks.map((t) =>
          t.id === id ? { ...t, status, current: t.total } : t
        ),
      };
    }),
}));

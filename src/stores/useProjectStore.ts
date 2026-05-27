import { create } from "zustand";
import {
  apiGetClientsAndProjects,
  apiCreateClient,
  apiDeleteClient,
  apiCreateProject,
  apiDeleteProject,
  apiUpdateProjectStatus,
  apiUpdateProjectDeadline,
  apiArchiveProject,
  apiUnarchiveProject,
  apiSetArchivePolicy,
  apiGetArchivedProjects,
  apiRenameClient,
  apiRenameProject,
  apiUpdateProjectNotes,
  ClientWithProjects,
  Project
} from "../lib/tauri";

interface ArchivedProject extends Project {
  client_name: string;
}

interface ProjectState {
  clients: ClientWithProjects[];
  archivedProjects: ArchivedProject[];
  activeProjectId: string | null;
  loading: boolean;
  error: string | null;

  fetchClientsAndProjects: () => Promise<void>;
  fetchArchivedProjects: () => Promise<void>;
  createClient: (name: string) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  renameClient: (clientId: string, newName: string) => Promise<void>;
  createProject: (clientId: string, name: string, path: string, deadline?: string) => Promise<Project | null>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, newName: string) => Promise<void>;
  updateProjectStatus: (projectId: string, status: string) => Promise<void>;
  updateProjectDeadline: (projectId: string, deadline: string | null) => Promise<void>;
  updateProjectNotes: (projectId: string, notes: string) => Promise<void>;
  archiveProject: (projectId: string) => Promise<void>;
  unarchiveProject: (projectId: string) => Promise<void>;
  setArchivePolicy: (projectId: string, days: number) => Promise<void>;
  setActiveProjectId: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  clients: [],
  archivedProjects: [],
  activeProjectId: null,
  loading: false,
  error: null,

  fetchClientsAndProjects: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiGetClientsAndProjects();
      set({ clients: data, loading: false });

      const currentActive = get().activeProjectId;
      if (!currentActive && data.length > 0) {
        for (const client of data) {
          if (client.projects && client.projects.length > 0) {
            set({ activeProjectId: client.projects[0].id });
            break;
          }
        }
      }
    } catch (e: any) {
      set({ error: e.message || "Failed to load clients and projects", loading: false });
    }
  },

  fetchArchivedProjects: async () => {
    try {
      const data = await apiGetArchivedProjects();
      set({ archivedProjects: data as ArchivedProject[] });
    } catch (e: any) {
      console.error("Failed to load archived projects", e);
    }
  },

  createClient: async (name: string) => {
    set({ loading: true, error: null });
    try {
      await apiCreateClient(name);
      const data = await apiGetClientsAndProjects();
      set({ clients: data, loading: false });
    } catch (e: any) {
      set({ error: e.message || "Failed to create client", loading: false });
    }
  },

  deleteClient: async (clientId: string) => {
    set({ loading: true, error: null });
    try {
      await apiDeleteClient(clientId);
      const data = await apiGetClientsAndProjects();
      const activeId = get().activeProjectId;
      const stillExists = data.flatMap(c => c.projects).some(p => p.id === activeId);
      set({ clients: data, loading: false, activeProjectId: stillExists ? activeId : null });
    } catch (e: any) {
      set({ error: e.message || "Failed to delete client", loading: false });
    }
  },

  renameClient: async (clientId: string, newName: string) => {
    // Optimistic update
    set(state => ({
      clients: state.clients.map(c =>
        c.id === clientId ? { ...c, name: newName } : c
      )
    }));
    try {
      await apiRenameClient(clientId, newName);
    } catch (e: any) {
      // Revert on failure
      const data = await apiGetClientsAndProjects();
      set({ clients: data, error: e.message || "Failed to rename client" });
    }
  },

  createProject: async (clientId: string, name: string, path: string, deadline?: string) => {
    set({ loading: true, error: null });
    try {
      const newProject = await apiCreateProject(clientId, name, path, deadline);
      const data = await apiGetClientsAndProjects();
      set({ clients: data, activeProjectId: newProject.id, loading: false });
      return newProject;
    } catch (e: any) {
      set({ error: e.message || "Failed to create project", loading: false });
      return null;
    }
  },

  deleteProject: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      await apiDeleteProject(projectId);
      const data = await apiGetClientsAndProjects();
      const activeId = get().activeProjectId;
      set({
        clients: data,
        loading: false,
        activeProjectId: activeId === projectId ? null : activeId
      });
    } catch (e: any) {
      set({ error: e.message || "Failed to delete project", loading: false });
    }
  },

  renameProject: async (projectId: string, newName: string) => {
    // Optimistic update
    set(state => ({
      clients: state.clients.map(client => ({
        ...client,
        projects: client.projects.map(p =>
          p.id === projectId ? { ...p, name: newName } : p
        )
      }))
    }));
    try {
      await apiRenameProject(projectId, newName);
    } catch (e: any) {
      const data = await apiGetClientsAndProjects();
      set({ clients: data, error: e.message || "Failed to rename project" });
    }
  },

  updateProjectStatus: async (projectId: string, status: string) => {
    const previousClients = get().clients;
    const updatedClients = previousClients.map(client => ({
      ...client,
      projects: client.projects.map(p => p.id === projectId ? { ...p, status } : p)
    }));
    set({ clients: updatedClients });

    try {
      await apiUpdateProjectStatus(projectId, status);
    } catch (e: any) {
      set({ clients: previousClients, error: e.message || "Failed to update project status" });
    }
  },

  updateProjectDeadline: async (projectId: string, deadline: string | null) => {
    // Optimistic update
    set(state => ({
      clients: state.clients.map(client => ({
        ...client,
        projects: client.projects.map(p =>
          p.id === projectId ? { ...p, deadline: deadline ?? undefined } : p
        )
      }))
    }));
    try {
      await apiUpdateProjectDeadline(projectId, deadline);
    } catch (e: any) {
      set({ error: e.message || "Failed to update deadline" });
    }
  },

  updateProjectNotes: async (projectId: string, notes: string) => {
    // Optimistic update
    set(state => ({
      clients: state.clients.map(client => ({
        ...client,
        projects: client.projects.map(p =>
          p.id === projectId ? { ...p, notes } : p
        )
      }))
    }));
    try {
      await apiUpdateProjectNotes(projectId, notes);
    } catch (e: any) {
      set({ error: e.message || "Failed to update notes" });
    }
  },

  archiveProject: async (projectId: string) => {
    try {
      await apiArchiveProject(projectId);
      // Remove from active clients list
      const data = await apiGetClientsAndProjects();
      const activeId = get().activeProjectId;
      set({
        clients: data,
        activeProjectId: activeId === projectId ? null : activeId
      });
      // Refresh archived list
      const archived = await apiGetArchivedProjects();
      set({ archivedProjects: archived as any });
    } catch (e: any) {
      set({ error: e.message || "Failed to archive project" });
    }
  },

  unarchiveProject: async (projectId: string) => {
    try {
      await apiUnarchiveProject(projectId);
      const data = await apiGetClientsAndProjects();
      set({ clients: data });
      const archived = await apiGetArchivedProjects();
      set({ archivedProjects: archived as any });
    } catch (e: any) {
      set({ error: e.message || "Failed to unarchive project" });
    }
  },

  setArchivePolicy: async (projectId: string, days: number) => {
    try {
      await apiSetArchivePolicy(projectId, days);
      // Update local archived list
      set(state => ({
        archivedProjects: state.archivedProjects.map(p =>
          p.id === projectId ? { ...p, auto_delete_days: days } : p
        )
      }));
    } catch (e: any) {
      set({ error: e.message || "Failed to set archive policy" });
    }
  },

  setActiveProjectId: (id: string | null) => {
    set({ activeProjectId: id });
  }
}));

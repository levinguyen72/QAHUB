import { create } from 'zustand';
import { getAccessToken, http, refreshAccessToken, setAccessToken } from '../../api/http';
import { atLeast } from '../../lib/permissions';
import type { ProjectRole } from '@ospm/shared';

export interface MeProject { projectId: number; projectKey: string; projectName: string; role: ProjectRole }
export interface MeUser { id: number; email: string; displayName: string; avatarUrl: string | null; systemRole: 'admin' | 'member' }

interface AuthState {
  user: MeUser | null;
  projects: MeProject[];
  ready: boolean;
  /** Thử khôi phục phiên bằng refresh token (cookie). */
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  roleIn: (projectKey?: string) => ProjectRole | null;
  can: (projectKey: string | undefined, min: ProjectRole) => boolean;
  isSystemAdmin: () => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  projects: [],
  ready: false,
  async init() {
    if (!getAccessToken()) await refreshAccessToken();
    if (getAccessToken()) await get().reload();
    set({ ready: true });
  },
  async reload() {
    const { data } = await http.get('/api/v1/auth/me');
    set({ user: data.user, projects: data.projects });
  },
  async login(email, password) {
    const { data } = await http.post('/api/v1/auth/login', { email, password });
    setAccessToken(data.accessToken);
    await get().reload();
  },
  async logout() {
    await http.post('/api/v1/auth/logout').catch(() => undefined);
    setAccessToken(null);
    set({ user: null, projects: [] });
  },
  roleIn(projectKey) {
    if (!projectKey) return null;
    if (get().user?.systemRole === 'admin') return 'admin';
    return get().projects.find((p) => p.projectKey === projectKey)?.role ?? null;
  },
  can(projectKey, min) {
    return atLeast(get().roleIn(projectKey), min);
  },
  isSystemAdmin: () => get().user?.systemRole === 'admin',
}));

/** Hook tiện dụng: vai trò hiệu lực trong một dự án */
export const useProjectRole = (projectKey?: string) => {
  const roleIn = useAuth((s) => s.roleIn);
  useAuth((s) => s.projects); // re-render khi danh sách dự án đổi
  useAuth((s) => s.user);
  return roleIn(projectKey);
};
export const useCan = (projectKey: string | undefined, min: ProjectRole) => atLeast(useProjectRole(projectKey), min);

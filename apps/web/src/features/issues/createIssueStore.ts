import { create } from 'zustand';

interface S { open: boolean; projectKey?: string; show: (projectKey?: string) => void; hide: () => void }
export const useCreateIssueModal = create<S>((set) => ({ open: false, show: (projectKey) => set({ open: true, projectKey }), hide: () => set({ open: false }) }));

import { PROJECT_ROLE_RANK, ProjectRole } from '@ospm/shared';

export const atLeast = (role: string | null | undefined, min: ProjectRole): boolean =>
  !!role && (PROJECT_ROLE_RANK as Record<string, number>)[role] >= PROJECT_ROLE_RANK[min];

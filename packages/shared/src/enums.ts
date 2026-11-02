export const ISSUE_TYPES = ['epic', 'story', 'task', 'bug', 'subtask'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const PRIORITIES = ['highest', 'high', 'medium', 'low', 'lowest'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ISSUE_SOURCES = ['manual', 'auto'] as const;
export type IssueSource = (typeof ISSUE_SOURCES)[number];

export const STATUS_CATEGORIES = ['triage', 'todo', 'in_progress', 'done'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const RESOLUTIONS = ['done', 'rejected', 'duplicate', 'wont_fix'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const SYSTEM_ROLES = ['admin', 'member'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const PROJECT_ROLES = ['admin', 'developer', 'tester', 'viewer'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];
/** Thứ bậc quyền: số lớn hơn = quyền cao hơn */
export const PROJECT_ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, developer: 2, tester: 3, admin: 4 };

export const SPRINT_STATES = ['future', 'active', 'closed'] as const;
export type SprintState = (typeof SPRINT_STATES)[number];

export const LINK_TYPES = ['relates', 'blocks', 'duplicates', 'regression_of'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const TRIAGE_ACTIONS = ['accept', 'reject', 'duplicate'] as const;
export type TriageAction = (typeof TRIAGE_ACTIONS)[number];

export const API_KEY_SCOPES = ['runs:write', 'issues:write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const RUN_STATUSES = ['receiving', 'processing', 'completed', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RESULT_STATUSES = ['passed', 'failed', 'timedOut', 'skipped', 'interrupted', 'flaky'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const ISSUE_ACTIONS = ['created', 'updated', 'skipped_flaky', 'none'] as const;
export type IssueAction = (typeof ISSUE_ACTIONS)[number];

export const ATTACHMENT_KINDS = ['file', 'screenshot', 'video', 'trace'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_ENTITIES = ['issue', 'comment', 'automation_result'] as const;
export type AttachmentEntity = (typeof ATTACHMENT_ENTITIES)[number];

export const TEST_CASE_STATUSES = ['not_started', 'passed', 'failed', 'blocked', 'na'] as const;
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number];

export const TEST_CASE_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type TestCasePriority = (typeof TEST_CASE_PRIORITIES)[number];

export const REQUIREMENT_KINDS = ['epic', 'function'] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const DEFAULT_TEST_CATEGORIES = [
  'UI/UX',
  'Functional',
  'Validation',
  'Business Rule',
  'Authorization',
  'Integration',
] as const;

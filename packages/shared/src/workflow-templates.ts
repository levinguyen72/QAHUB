import type { StatusCategory } from './enums';

export interface WorkflowTemplateDefinition {
  statuses: { key: string; name: string; category: StatusCategory; color: string; showOnBoard?: boolean }[];
  transitions: { from: string | null; to: string; name?: string }[];
  initialManual: string;
  initialAuto: string;
  accept: string;
  reject: string;
}

const REJECTED = { key: 'rejected', name: 'Rejected', category: 'done' as const, color: '#8c8c8c', showOnBoard: false };
const PENDING = { key: 'pending_review', name: 'Pending Review', category: 'triage' as const, color: '#722ed1' };

/** Chuỗi trạng thái nối tiếp nhau + cho phép lùi lại một bước, Rejected chỉ đến từ Pending Review. */
function linear(keys: string[], pendingTo: string): WorkflowTemplateDefinition['transitions'] {
  const t: WorkflowTemplateDefinition['transitions'] = [
    { from: 'pending_review', to: pendingTo, name: 'Accept' },
    { from: 'pending_review', to: 'rejected', name: 'Reject' },
  ];
  for (let i = 0; i < keys.length - 1; i++) {
    t.push({ from: keys[i], to: keys[i + 1], name: undefined });
    t.push({ from: keys[i + 1], to: keys[i], name: undefined });
  }
  return t;
}

const defaultKeys = ['todo', 'in_progress', 'done'];
const qaKeys = ['todo', 'in_progress', 'pr_in_review', 'ready_for_qa', 'deployed_qa', 'done'];
const minimalKeys = ['in_progress', 'in_qa', 'done'];

export const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplateDefinition> = {
  'Mặc định': {
    statuses: [
      PENDING,
      { key: 'todo', name: 'To Do', category: 'todo', color: '#8c8c8c' },
      { key: 'in_progress', name: 'In Progress', category: 'in_progress', color: '#1677ff' },
      { key: 'done', name: 'Done', category: 'done', color: '#52c41a' },
      REJECTED,
    ],
    transitions: linear(defaultKeys, 'todo'),
    initialManual: 'todo',
    initialAuto: 'pending_review',
    accept: 'todo',
    reject: 'rejected',
  },
  'Có QA': {
    statuses: [
      PENDING,
      { key: 'todo', name: 'To Do', category: 'todo', color: '#8c8c8c' },
      { key: 'in_progress', name: 'In Progress', category: 'in_progress', color: '#d4380d' },
      { key: 'pr_in_review', name: 'PR In Review', category: 'in_progress', color: '#fa8c16' },
      { key: 'ready_for_qa', name: 'Ready for QA', category: 'in_progress', color: '#13c2c2' },
      { key: 'deployed_qa', name: 'Deployed QA', category: 'in_progress', color: '#1677ff' },
      { key: 'done', name: 'Done', category: 'done', color: '#52c41a' },
      REJECTED,
    ],
    transitions: linear(qaKeys, 'todo'),
    initialManual: 'todo',
    initialAuto: 'pending_review',
    accept: 'todo',
    reject: 'rejected',
  },
  'Tối giản': {
    statuses: [
      PENDING,
      { key: 'in_progress', name: 'In Progress', category: 'in_progress', color: '#1677ff' },
      { key: 'in_qa', name: 'In QA', category: 'in_progress', color: '#13c2c2' },
      { key: 'done', name: 'Done', category: 'done', color: '#52c41a' },
      REJECTED,
    ],
    transitions: linear(minimalKeys, 'in_progress'),
    initialManual: 'in_progress',
    initialAuto: 'pending_review',
    accept: 'in_progress',
    reject: 'rejected',
  },
};

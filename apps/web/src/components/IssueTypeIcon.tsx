import { ApartmentOutlined, BookFilled, BugFilled, CheckSquareFilled, ThunderboltFilled } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { IssueType } from '@ospm/shared';

const META: Record<IssueType, { icon: JSX.Element; label: string }> = {
  epic: { icon: <ThunderboltFilled style={{ color: '#904ee2' }} />, label: 'Epic' },
  story: { icon: <BookFilled style={{ color: '#52c41a' }} />, label: 'Story' },
  task: { icon: <CheckSquareFilled style={{ color: '#1677ff' }} />, label: 'Task' },
  bug: { icon: <BugFilled style={{ color: '#f5222d' }} />, label: 'Bug' },
  subtask: { icon: <ApartmentOutlined style={{ color: '#1677ff' }} />, label: 'Subtask' },
};

export const ISSUE_TYPE_LABEL: Record<IssueType, string> = Object.fromEntries(Object.entries(META).map(([k, v]) => [k, v.label])) as Record<IssueType, string>;

export function IssueTypeIcon({ type }: { type: IssueType }) {
  const m = META[type] ?? META.task;
  return <Tooltip title={m.label}><span aria-label={m.label}>{m.icon}</span></Tooltip>;
}

import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { Priority } from '@ospm/shared';

const LABEL: Record<string, string> = { highest: 'Highest', high: 'High', medium: 'Medium', low: 'Low', lowest: 'Lowest', critical: 'Critical' };

/** Highest/High mũi tên đỏ lên, Medium hai gạch cam, Low/Lowest mũi tên xanh xuống (mục 9). */
export function PriorityIcon({ priority, withLabel }: { priority: Priority | 'critical' | string; withLabel?: boolean }) {
  let icon: JSX.Element;
  if (priority === 'highest' || priority === 'high' || priority === 'critical') icon = <ArrowUpOutlined style={{ color: '#f5222d' }} />;
  else if (priority === 'low' || priority === 'lowest') icon = <ArrowDownOutlined style={{ color: '#1677ff' }} />;
  else icon = <span style={{ color: '#fa8c16', fontWeight: 700, lineHeight: 1 }}>=</span>;
  return (
    <Tooltip title={LABEL[priority] ?? priority}>
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>{icon}{withLabel && <span>{LABEL[priority] ?? priority}</span>}</span>
    </Tooltip>
  );
}

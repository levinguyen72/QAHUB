import { Typography } from 'antd';
import type { ActivityItem } from '../../api/models';
import { UserAvatar } from '../../components/UserAvatar';
import { fromNow } from '../../lib/date';
import { useSelectedIssue } from '../issues/useSelectedIssue';

export function ActivityList({ items }: { items: ActivityItem[] }) {
  const { select } = useSelectedIssue();
  if (!items.length) return <Typography.Text type="secondary">Chưa có hoạt động</Typography.Text>;
  return (
    <div style={{ maxHeight: 360, overflow: 'auto' }}>
      {items.map((a) => {
        const st = (a.changes as any)?.status as [string, string] | undefined;
        return (
          <div key={a.id} style={{ display: 'flex', gap: 8, padding: '4px 0', alignItems: 'center' }}>
            <UserAvatar user={a.actor ? { id: a.actor.id ?? 0, displayName: a.actor.displayName } : null} size={22} />
            <span style={{ flex: 1 }}><b>{a.actor?.displayName ?? 'Hệ thống'}</b> · {a.action.replace('_', ' ')} <a onClick={() => select(a.issueKey)}>{a.issueKey}</a> {a.issueTitle}{st && <span className="muted"> · {st[0]} → {st[1]}</span>}</span>
            <span className="muted">{fromNow(a.createdAt)}</span>
          </div>
        );
      })}
    </div>
  );
}

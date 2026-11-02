import { Avatar, Tooltip } from 'antd';
import type { UserBrief } from '../api/models';

const COLORS = ['#f56a00', '#7265e6', '#00a2ae', '#ffbf00', '#1677ff', '#52c41a', '#eb2f96'];
const colorOf = (id: number) => COLORS[Math.abs(id) % COLORS.length];
// bỏ phần trong ngoặc, ví dụ "Hoà (Developer)" -> "Hoà"
const initials = (name: string) => name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean).slice(-2).map((p) => p[0]?.toUpperCase()).join('') || '?';

export function UserAvatar({ user, size = 24, showName }: { user?: Pick<UserBrief, 'id' | 'displayName' | 'avatarUrl'> | null; size?: number; showName?: boolean }) {
  if (!user) return <Tooltip title="Chưa gán"><Avatar size={size} style={{ background: '#d9d9d9' }}>?</Avatar></Tooltip>;
  const av = (
    <Tooltip title={user.displayName}>
      <Avatar size={size} src={user.avatarUrl ?? undefined} style={{ background: colorOf(user.id ?? 0), fontSize: size * 0.45 }}>{initials(user.displayName)}</Avatar>
    </Tooltip>
  );
  return showName ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{av}{user.displayName}</span> : av;
}

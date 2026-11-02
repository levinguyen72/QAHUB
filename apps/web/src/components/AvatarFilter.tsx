import { Avatar, Tooltip } from 'antd';
import type { UserBrief } from '../api/models';
import { UserAvatar } from './UserAvatar';

/** Hàng avatar thành viên, bấm để lọc theo assignee; hiện tối đa 6 avatar rồi "+n" (mục 9). */
export function AvatarFilter({ users, value, onChange, max = 6 }: { users: UserBrief[]; value: number[]; onChange: (ids: number[]) => void; max?: number }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }} data-testid="avatar-filter">
      {shown.map((u) => (
        <span key={u.id} onClick={() => toggle(u.id)} role="button" aria-pressed={value.includes(u.id)}
          style={{ cursor: 'pointer', marginRight: -6, borderRadius: '50%', outline: value.includes(u.id) ? '2px solid #f51d53' : '2px solid #fff', background: '#fff' }}>
          <UserAvatar user={u} size={30} />
        </span>
      ))}
      {rest > 0 && <Tooltip title={users.slice(max).map((u) => u.displayName).join(', ')}><Avatar size={30} style={{ marginLeft: 8, background: '#f0f0f0', color: '#595959' }}>+{rest}</Avatar></Tooltip>}
    </span>
  );
}

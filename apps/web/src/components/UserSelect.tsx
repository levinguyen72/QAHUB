import { Select } from 'antd';
import { useMembers } from '../api/hooks';

export function UserSelect({ projectKey, value, onChange, allowClear = true, placeholder = 'Chưa gán', style }: {
  projectKey: string; value?: number | null; onChange: (id: number | null) => void; allowClear?: boolean; placeholder?: string; style?: React.CSSProperties;
}) {
  const { data = [] } = useMembers(projectKey);
  return (
    <Select
      showSearch allowClear={allowClear} placeholder={placeholder} style={{ minWidth: 160, ...style }} value={value ?? undefined}
      optionFilterProp="label" onChange={(v) => onChange(v ?? null)}
      options={data.filter((m) => m.user.isActive).map((m) => ({ value: m.userId, label: m.user.displayName }))}
    />
  );
}

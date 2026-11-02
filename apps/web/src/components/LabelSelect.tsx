import { Select, Tag } from 'antd';
import { useLabels } from '../api/hooks';

export function LabelSelect({ projectKey, value, onChange, style, placeholder = 'Label' }: {
  projectKey: string; value?: number[]; onChange: (ids: number[]) => void; style?: React.CSSProperties; placeholder?: string;
}) {
  const { data = [] } = useLabels(projectKey);
  return (
    <Select
      mode="multiple" allowClear showSearch optionFilterProp="label" placeholder={placeholder} style={{ minWidth: 140, ...style }} value={value}
      onChange={onChange} maxTagCount="responsive"
      options={data.map((l) => ({ value: l.id, label: l.name }))}
      tagRender={({ label, value: v, closable, onClose }) => {
        const l = data.find((x) => x.id === v);
        return <Tag color={l?.color} closable={closable && !l?.isSystem} onClose={onClose} style={{ marginInlineEnd: 4 }}>{label}</Tag>;
      }}
    />
  );
}

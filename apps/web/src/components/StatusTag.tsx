import { DownOutlined } from '@ant-design/icons';
import { Dropdown, Tag } from 'antd';
import type { StatusBrief, Transition } from '../api/models';

interface Props {
  status: Pick<StatusBrief, 'name' | 'color'>;
  /** Chỉ các bước chuyển hợp lệ (availableTransitions); bỏ trống thì chỉ hiển thị */
  transitions?: Transition[];
  onTransition?: (toStatusId: number) => void;
  loading?: boolean;
}

/** Màu theo `color` của trạng thái; bấm vào là dropdown liệt kê availableTransitions (mục 9). */
export function StatusTag({ status, transitions, onTransition, loading }: Props) {
  const tag = (
    <Tag color={status.color} style={{ margin: 0, cursor: onTransition ? 'pointer' : 'default', opacity: loading ? 0.6 : 1 }}>
      {status.name}
      {onTransition && <DownOutlined style={{ fontSize: 9, marginLeft: 4 }} />}
    </Tag>
  );
  if (!onTransition) return tag;
  const items = (transitions ?? []).map((t) => ({ key: String(t.statusId), label: t.label ? `${t.label} → ${t.name}` : t.name }));
  return (
    <Dropdown
      trigger={['click']}
      disabled={!items.length}
      menu={{ items: items.length ? items : [{ key: 'none', label: 'Không có bước chuyển', disabled: true }], onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); onTransition(Number(key)); } }}
    >
      <span onClick={(e) => e.stopPropagation()}>{tag}</span>
    </Dropdown>
  );
}

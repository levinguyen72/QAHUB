import { RobotOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import type { IssueSource } from '@ospm/shared';

/** manual: xám; auto: tím kèm biểu tượng robot. Luôn hiện trên bug auto (mục 9). */
export function SourceTag({ source }: { source: IssueSource }) {
  return source === 'auto' ? (
    <Tag color="purple" icon={<RobotOutlined />} style={{ margin: 0 }}>auto</Tag>
  ) : (
    <Tag style={{ margin: 0 }}>manual</Tag>
  );
}

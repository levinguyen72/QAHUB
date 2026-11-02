import { InboxOutlined, PaperClipOutlined } from '@ant-design/icons';
import { Image, Spin, Typography, Upload, message } from 'antd';
import { useAttachmentUrl } from '../api/hooks';
import { uploadAttachment } from '../api/upload';
import type { AttachmentEntity } from '@ospm/shared';

export interface AttachmentItemData { id: string; kind: string; fileName: string; mimeType: string; sizeBytes?: number | null }

function Item({ a }: { a: AttachmentItemData }) {
  const isImage = a.mimeType.startsWith('image/');
  const isVideo = a.mimeType.startsWith('video/');
  const { data, isLoading } = useAttachmentUrl(a.id, isImage || isVideo);
  if (isImage) return <div style={{ width: 160 }}>{isLoading ? <Spin /> : <Image src={data?.url} width={160} alt={a.fileName} />}<div className="muted" style={{ fontSize: 12 }}>{a.fileName}</div></div>;
  if (isVideo) return <div style={{ width: 280 }}>{isLoading ? <Spin /> : <video src={data?.url} controls width={280} />}<div className="muted" style={{ fontSize: 12 }}>{a.fileName}</div></div>;
  return <a onClick={async () => { const { getAttachmentUrl } = await import('../api/generated/api'); const r = await getAttachmentUrl(a.id); window.open(r.url, '_blank'); }}><PaperClipOutlined /> {a.fileName}{a.kind === 'trace' ? ' (trace)' : ''}</a>;
}

/** Danh sách file đính kèm: xem ảnh, phát video, tải file khác; kéo thả để upload (nếu có entity). */
export function AttachmentList({ items, entity, entityId, onUploaded, readOnly }: {
  items: AttachmentItemData[]; entity?: AttachmentEntity; entityId?: number; onUploaded?: () => void; readOnly?: boolean;
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        {items.length === 0 && <Typography.Text type="secondary">Chưa có file đính kèm</Typography.Text>}
        {items.map((a) => <Item key={a.id} a={a} />)}
      </div>
      {!readOnly && entity && entityId && (
        <Upload.Dragger multiple showUploadList={false}
          customRequest={async ({ file, onSuccess, onError }) => {
            try { await uploadAttachment(entity, entityId, file as File); onSuccess?.({}); onUploaded?.(); } catch (e) { message.error((e as Error).message); onError?.(e as Error); }
          }}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p>Kéo thả file vào đây hoặc bấm để chọn</p>
        </Upload.Dragger>
      )}
    </div>
  );
}

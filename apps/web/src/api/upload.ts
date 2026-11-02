import type { AttachmentEntity } from '@ospm/shared';
import { completeAttachment, presignAttachment } from './generated/api';

/** Luồng upload thẳng lên MinIO: xin presigned URL → PUT file → báo hoàn tất (mục 2). */
export async function uploadAttachment(entity: AttachmentEntity, entityId: number, file: File): Promise<string> {
  const { id, uploadUrl } = await presignAttachment({ entity, entityId, fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size });
  const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
  if (!res.ok) throw new Error(`Upload thất bại (${res.status})`);
  await completeAttachment(id);
  return id;
}

import { ATTACHMENT_ENTITIES, AttachmentEntity } from '@ospm/shared';
import { IsIn, IsInt, IsString, Min } from 'class-validator';

export class PresignDto {
  @IsIn(ATTACHMENT_ENTITIES as unknown as string[]) entity: AttachmentEntity;
  @IsInt() entityId: number;
  @IsString() fileName: string;
  @IsString() mimeType: string;
  @IsInt() @Min(0) size: number;
}

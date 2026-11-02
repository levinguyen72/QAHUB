import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@ospm/shared';
import { AppException, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { LabelDto, UpdateLabelDto } from './issues.dto';

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  list(projectId: bigint) {
    return this.prisma.label.findMany({ where: { projectId }, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
  }

  async create(projectId: bigint, dto: LabelDto) {
    const name = dto.name.trim();
    if (await this.prisma.label.findUnique({ where: { projectId_name: { projectId, name } } })) {
      throw new AppException(409, ERROR_CODES.LABEL_EXISTS, 'Label đã tồn tại');
    }
    return this.prisma.label.create({ data: { projectId, name, color: dto.color ?? '#1677ff' } });
  }

  private async mutable(projectId: bigint, id: bigint) {
    const label = await this.prisma.label.findFirst({ where: { id, projectId } });
    if (!label) throw notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy label');
    if (label.isSystem) throw new AppException(403, ERROR_CODES.SYSTEM_LABEL_LOCKED, 'Không thể sửa hoặc xóa label hệ thống');
    return label;
  }

  async update(projectId: bigint, id: bigint, dto: UpdateLabelDto) {
    await this.mutable(projectId, id);
    if (dto.name) {
      const dup = await this.prisma.label.findFirst({ where: { projectId, name: dto.name.trim(), id: { not: id } } });
      if (dup) throw new AppException(409, ERROR_CODES.LABEL_EXISTS, 'Label đã tồn tại');
    }
    return this.prisma.label.update({ where: { id }, data: { name: dto.name?.trim(), color: dto.color } });
  }

  async remove(projectId: bigint, id: bigint) {
    await this.mutable(projectId, id);
    await this.prisma.label.delete({ where: { id } });
  }
}

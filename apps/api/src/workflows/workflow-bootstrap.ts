import { WORKFLOW_TEMPLATES, WorkflowTemplateDefinition } from '@ospm/shared';
import type { Tx } from '../common/prisma.service';

/** Sao chép trạng thái, bước chuyển và cấu hình từ definition của template vào một dự án (quy tắc 7, mục 6). */
export async function applyTemplateDefinition(tx: Tx, projectId: bigint, def: WorkflowTemplateDefinition) {
  const idByKey = new Map<string, bigint>();
  let position = 0;
  for (const s of def.statuses) {
    const row = await tx.workflowStatus.create({
      data: { projectId, name: s.name, category: s.category, color: s.color, position: position++, showOnBoard: s.category !== 'triage' && s.showOnBoard !== false },
    });
    idByKey.set(s.key, row.id);
  }
  const need = (k: string) => {
    const id = idByKey.get(k);
    if (!id) throw new Error(`Template tham chiếu trạng thái không tồn tại: ${k}`);
    return id;
  };
  for (const t of def.transitions) {
    await tx.workflowTransition.create({
      data: { projectId, fromStatusId: t.from ? need(t.from) : null, toStatusId: need(t.to), name: t.name ?? null },
    });
  }
  await tx.workflowSettings.create({
    data: {
      projectId,
      initialManualStatusId: need(def.initialManual),
      initialAutoStatusId: need(def.initialAuto),
      acceptStatusId: need(def.accept),
      rejectStatusId: need(def.reject),
    },
  });
}

/** Xóa toàn bộ workflow của dự án (dùng khi "Áp dụng template" trên dự án chưa có item). */
export async function clearWorkflow(tx: Tx, projectId: bigint) {
  await tx.workflowSettings.deleteMany({ where: { projectId } });
  await tx.workflowTransition.deleteMany({ where: { projectId } });
  await tx.workflowStatus.deleteMany({ where: { projectId } });
}

export const BUILTIN_TEMPLATES = WORKFLOW_TEMPLATES;

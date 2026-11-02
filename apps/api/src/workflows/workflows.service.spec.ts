import { WorkflowsService } from './workflows.service';

/** Kiểm tra quy tắc 3 mục 6: bước chuyển hợp lệ khi có dòng khớp (from = trạng thái hiện tại hoặc NULL) hoặc allow_any_transition. */
describe('WorkflowsService.isTransitionAllowed', () => {
  const make = (opts: { allowAny?: boolean; toExists?: boolean; transitions?: { fromStatusId: bigint | null; toStatusId: bigint }[] }) => {
    const db: any = {
      workflowSettings: { findUnique: async () => ({ allowAnyTransition: !!opts.allowAny }) },
      workflowStatus: { findFirst: async () => (opts.toExists === false ? null : { id: 2n }) },
      workflowTransition: {
        findFirst: async ({ where }: any) =>
          (opts.transitions ?? []).find((t) => t.toStatusId === where.toStatusId && where.OR.some((c: any) => c.fromStatusId === t.fromStatusId)) ?? null,
      },
    };
    return { svc: new WorkflowsService(db, {} as any), db };
  };

  it('cho phép khi có dòng khớp from -> to', async () => {
    const { svc, db } = make({ transitions: [{ fromStatusId: 1n, toStatusId: 2n }] });
    expect(await svc.isTransitionAllowed(db, 1n, 1n, 2n)).toBe(true);
  });
  it('từ chối khi không có dòng khớp', async () => {
    const { svc, db } = make({ transitions: [{ fromStatusId: 3n, toStatusId: 2n }] });
    expect(await svc.isTransitionAllowed(db, 1n, 1n, 2n)).toBe(false);
  });
  it('from NULL nghĩa là từ mọi trạng thái', async () => {
    const { svc, db } = make({ transitions: [{ fromStatusId: null, toStatusId: 2n }] });
    expect(await svc.isTransitionAllowed(db, 1n, 7n, 2n)).toBe(true);
  });
  it('allow_any_transition cho phép mọi bước (trừ về chính nó hoặc trạng thái lưu trữ)', async () => {
    const { svc, db } = make({ allowAny: true });
    expect(await svc.isTransitionAllowed(db, 1n, 1n, 2n)).toBe(true);
    expect(await svc.isTransitionAllowed(db, 1n, 2n, 2n)).toBe(false);
    const archived = make({ allowAny: true, toExists: false });
    expect(await archived.svc.isTransitionAllowed(archived.db, 1n, 1n, 2n)).toBe(false);
  });
});

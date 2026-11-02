import { getJob } from '../../api/generated/api';

export interface JobInfo { id: string; state: string; error: string | null; result: any; downloadUrl: string | null }

/** Hỏi lại trạng thái job nền cho tới khi xong (import/export/bulk lớn). */
export async function waitForJob(jobId: string, timeoutMs = 5 * 60_000): Promise<JobInfo> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const j: JobInfo = await getJob(jobId);
    if (j.state === 'completed' || j.state === 'failed') {
      if (j.state === 'failed') throw new Error(j.error ?? 'Tác vụ nền thất bại');
      return j;
    }
    if (Date.now() - start > timeoutMs) throw new Error('Tác vụ nền quá thời gian chờ');
    await new Promise((r) => setTimeout(r, 800));
  }
}

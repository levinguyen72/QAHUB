import { createHash } from 'node:crypto';

/** Chuẩn hóa dòng đầu thông báo lỗi để cùng một lỗi cho ra cùng fingerprint (mục 8). */
export function normalizeError(message: string): string {
  return (message.split('\n')[0] ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, '') // mã màu ANSI
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<uuid>')
    .replace(/\b\d+(\.\d+)?(ms|s)?\b/g, '<n>') // số, thời gian chờ
    .replace(/"[^"]{40,}"/g, '"<long>"')
    .trim()
    .slice(0, 300);
}

/** Không đưa `browser` vào fingerprint: cùng lỗi trên Chromium và Firefox chỉ ra một bug. */
export function computeFingerprint(projectId: bigint | number | string, file: string, titlePath: string[], errorMessage: string | null | undefined): string {
  return createHash('sha256')
    .update([String(projectId), file, titlePath.join(' > '), normalizeError(errorMessage ?? '')].join('|'))
    .digest('hex');
}

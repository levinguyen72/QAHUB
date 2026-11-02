/**
 * LexoRank đơn giản: chuỗi base-36 (0-9a-z) coi như phân số, so sánh theo thứ tự từ điển.
 * `rankBetween(a, b)` trả về chuỗi nằm giữa a và b (a < result < b). Không bao giờ kết thúc bằng '0'.
 */
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

const val = (c: string) => DIGITS.indexOf(c);

export function rankBetween(prev?: string | null, next?: string | null): string {
  const a = prev ?? '';
  let b: string | null = next ? next : null;
  if (b !== null && a >= b) throw new Error(`rankBetween: prev (${a}) must be < next (${b})`);
  let result = '';
  for (let i = 0; ; i++) {
    const da = i < a.length ? val(a[i]) : 0;
    const db = b === null ? BASE : i < b.length ? val(b[i]) : 0;
    if (da === db) {
      result += DIGITS[da];
      continue;
    }
    if (db - da > 1) return result + DIGITS[Math.floor((da + db) / 2)];
    // db = da + 1: giữ chữ số của a, phía trên không còn bị chặn bởi b
    result += DIGITS[da];
    b = null;
  }
}

export const initialRank = (): string => 'i';

/** Sinh n rank liên tiếp tăng dần, dùng khi seed hoặc chuẩn hóa lại */
export function generateRanks(n: number, start?: string | null, end?: string | null): string[] {
  const out: string[] = [];
  let prev = start ?? null;
  for (let i = 0; i < n; i++) {
    const r = rankBetween(prev, end ?? null);
    out.push(r);
    prev = r;
  }
  return out;
}

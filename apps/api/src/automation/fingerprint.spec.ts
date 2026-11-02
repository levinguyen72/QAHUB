import { computeFingerprint, normalizeError } from './fingerprint';

describe('normalizeError', () => {
  it('chỉ lấy dòng đầu và bỏ mã màu ANSI', () => {
    expect(normalizeError('\u001b[31mexpect(locator).toHaveText\u001b[39m failed\nsecond line')).toBe('expect(locator).toHaveText failed');
  });
  it('thay số và thời gian chờ bằng <n>', () => {
    expect(normalizeError('Timeout 30000ms exceeded after 3 retries')).toBe('Timeout <n> exceeded after <n> retries');
    expect(normalizeError('took 1.5s')).toBe('took <n>');
  });
  it('thay uuid', () => {
    expect(normalizeError('user 123e4567-e89b-12d3-a456-426614174000 not found')).toBe('user <uuid> not found');
  });
  it('rút gọn chuỗi dài trong ngoặc kép', () => {
    expect(normalizeError(`got "${'x'.repeat(50)}"`)).toBe('got "<long>"');
  });
  it('cắt còn 300 ký tự', () => {
    expect(normalizeError('a'.repeat(500)).length).toBe(300);
  });
});

describe('computeFingerprint', () => {
  const base = [1n, 'tests/a.spec.ts', ['A', 'B'], 'Timeout 30000ms exceeded'] as const;
  it('ổn định với cùng đầu vào', () => {
    expect(computeFingerprint(...base)).toBe(computeFingerprint(...base));
    expect(computeFingerprint(...base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('không đổi khi chỉ khác con số trong thông báo', () => {
    expect(computeFingerprint(1n, 'f', ['A'], 'Timeout 30000ms exceeded')).toBe(computeFingerprint(1n, 'f', ['A'], 'Timeout 5000ms exceeded'));
  });
  it('đổi khi khác dự án, file, tên test hoặc nội dung lỗi', () => {
    const f = computeFingerprint(...base);
    expect(computeFingerprint(2n, base[1], [...base[2]], base[3])).not.toBe(f);
    expect(computeFingerprint(1n, 'other.ts', [...base[2]], base[3])).not.toBe(f);
    expect(computeFingerprint(1n, base[1], ['A', 'C'], base[3])).not.toBe(f);
    expect(computeFingerprint(1n, base[1], [...base[2]], 'different error')).not.toBe(f);
  });
});

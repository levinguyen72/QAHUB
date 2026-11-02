import { describe, expect, it } from 'vitest';
import { dayLabel, fmtDateTime, fmtEstimate } from './date';
import { rankBetween } from './lexorank';
import { atLeast } from './permissions';

describe('permissions.atLeast', () => {
  it('thứ bậc viewer < developer < tester < admin', () => {
    expect(atLeast('viewer', 'developer')).toBe(false);
    expect(atLeast('developer', 'developer')).toBe(true);
    expect(atLeast('tester', 'developer')).toBe(true);
    expect(atLeast('developer', 'tester')).toBe(false);
    expect(atLeast('admin', 'admin')).toBe(true);
    expect(atLeast(null, 'viewer')).toBe(false);
  });
});

describe('date (Asia/Ho_Chi_Minh)', () => {
  it('hiển thị UTC+7', () => {
    expect(fmtDateTime('2026-11-01T17:00:00Z')).toBe('02/11/2026 00:00');
  });
  it('nhãn ngày và estimate', () => {
    expect(dayLabel(new Date().toISOString())).toBe('Hôm nay');
    expect(fmtEstimate(90)).toBe('1h30m');
    expect(fmtEstimate(null)).toBe('');
  });
});

describe('lexorank dùng chung với backend', () => {
  it('rankBetween nằm giữa hai rank', () => {
    const r = rankBetween('a', 'c');
    expect(r > 'a' && r < 'c').toBe(true);
  });
});

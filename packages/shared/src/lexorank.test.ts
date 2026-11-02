import { describe, expect, it } from 'vitest';
import { generateRanks, initialRank, rankBetween } from './lexorank';

describe('lexorank', () => {
  it('initial rank is stable', () => {
    expect(initialRank()).toBe('i');
  });
  it('between two ranks', () => {
    const r = rankBetween('a', 'c');
    expect(r > 'a' && r < 'c').toBe(true);
  });
  it('adjacent ranks go deeper', () => {
    const r = rankBetween('a', 'b');
    expect(r > 'a' && r < 'b').toBe(true);
  });
  it('before first / after last', () => {
    expect(rankBetween(null, 'i') < 'i').toBe(true);
    expect(rankBetween('i', null) > 'i').toBe(true);
  });
  it('repeated insert at the same spot keeps order', () => {
    let lo = 'a';
    const hi = 'b';
    for (let i = 0; i < 50; i++) {
      const r = rankBetween(lo, hi);
      expect(r > lo && r < hi).toBe(true);
      lo = r;
    }
  });
  it('repeated insert at the head keeps order', () => {
    let hi = 'i';
    for (let i = 0; i < 50; i++) {
      const r = rankBetween(null, hi);
      expect(r < hi).toBe(true);
      hi = r;
    }
  });
  it('generateRanks is strictly increasing', () => {
    const rs = generateRanks(200);
    const sorted = [...rs].sort();
    expect(rs).toEqual(sorted);
    expect(new Set(rs).size).toBe(200);
  });
});

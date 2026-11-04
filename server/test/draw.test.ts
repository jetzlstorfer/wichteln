import { describe, expect, it } from 'vitest';
import { draw, pairKey } from '../src/draw';

/** Small deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function couples(pairs: [string, string][]) {
  const forbidden = new Set<string>();
  for (const [a, b] of pairs) {
    forbidden.add(pairKey(a, b));
    forbidden.add(pairKey(b, a));
  }
  return forbidden;
}

describe('draw', () => {
  it('needs at least three people', () => {
    expect(draw({ ids: ids(2), forbidden: new Set() })).toEqual({ ok: false, reason: 'too-few' });
  });

  it('produces a valid permutation honouring partners and exclusions', () => {
    const people = ids(10);
    const forbidden = couples([
      ['p0', 'p1'],
      ['p2', 'p3'],
      ['p4', 'p5'],
      ['p6', 'p7'],
    ]);
    forbidden.add(pairKey('p8', 'p9'));
    const random = mulberry32(42);
    for (let run = 0; run < 500; run++) {
      const result = draw({ ids: people, forbidden, random });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const receivers = new Set(result.pairs.values());
      expect(receivers.size).toBe(people.length);
      expect(result.pairs.size).toBe(people.length);
      for (const [giver, receiver] of result.pairs) {
        expect(giver).not.toBe(receiver);
        expect(forbidden.has(pairKey(giver, receiver))).toBe(false);
      }
    }
  });

  it('avoids mutual pairs (A↔B) when possible', () => {
    const random = mulberry32(7);
    for (let run = 0; run < 200; run++) {
      const result = draw({ ids: ids(6), forbidden: new Set(), random });
      expect(result.ok && result.mutualPairs).toBe(0);
    }
  });

  it('detects impossible constraints and names who is stuck', () => {
    // Two couples + one single: the single would have to receive from everyone.
    const forbidden = couples([['p0', 'p1']]);
    const result = draw({ ids: ['p0', 'p1', 'p2'], forbidden });
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'impossible') throw new Error('expected impossible');
    expect(result.stuck.length).toBeGreaterThan(0);
  });

  it('detects a person who may not give to anyone', () => {
    const forbidden = new Set([pairKey('p0', 'p1'), pairKey('p0', 'p2'), pairKey('p0', 'p3')]);
    const result = draw({ ids: ids(4), forbidden });
    expect(result).toMatchObject({ ok: false, reason: 'impossible', stuck: ['p0'] });
  });

  it('solves tightly constrained but feasible groups', () => {
    // 3 couples + last year's pairs forbid a lot, but a solution exists.
    const people = ids(6);
    const forbidden = couples([
      ['p0', 'p1'],
      ['p2', 'p3'],
      ['p4', 'p5'],
    ]);
    for (const [g, r] of [
      ['p0', 'p2'],
      ['p2', 'p4'],
      ['p4', 'p0'],
      ['p1', 'p3'],
      ['p3', 'p5'],
      ['p5', 'p1'],
    ]) forbidden.add(pairKey(g, r));
    const random = mulberry32(1);
    for (let run = 0; run < 100; run++) {
      const result = draw({ ids: people, forbidden, random });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const [g, r] of result.pairs) expect(forbidden.has(pairKey(g, r))).toBe(false);
    }
  });

  it('is fair: every allowed receiver is drawn with similar frequency', () => {
    const people = ids(5);
    const random = mulberry32(2024);
    const counts = new Map<string, number>();
    const runs = 20000;
    for (let i = 0; i < runs; i++) {
      const result = draw({ ids: people, forbidden: new Set(), random });
      if (!result.ok) throw new Error('draw failed');
      const r = result.pairs.get('p0')!;
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    expect(counts.has('p0')).toBe(false);
    for (const receiver of ['p1', 'p2', 'p3', 'p4']) {
      const share = (counts.get(receiver) ?? 0) / runs;
      expect(share).toBeGreaterThan(0.22);
      expect(share).toBeLessThan(0.28);
    }
  });
});

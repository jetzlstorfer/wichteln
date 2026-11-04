/**
 * Wichtel draw: assigns every participant exactly one other participant to give a
 * present to, honouring exclusions (partners, custom rules, last year's pairs).
 *
 * Strategy
 * 1. Prove feasibility with a bipartite perfect matching (Kuhn's algorithm). This
 *    lets us tell the organizer *why* a draw is impossible instead of looping.
 * 2. Rejection-sample uniformly random permutations. This gives every valid
 *    assignment the same probability (fair!). Mutual pairs (A↔B) are avoided
 *    whenever possible, so the result feels more like a real chain.
 * 3. For heavily constrained groups where sampling is unlikely to hit, fall back to
 *    a randomised matching.
 */

export type Random = () => number;

export interface DrawInput {
  ids: string[];
  /** Directed pairs "giver>receiver" that are not allowed. */
  forbidden: Set<string>;
  random?: Random;
}

export type DrawResult =
  | { ok: true; pairs: Map<string, string>; mutualPairs: number }
  | { ok: false; reason: 'too-few' }
  | { ok: false; reason: 'impossible'; stuck: string[] };

export const pairKey = (giver: string, receiver: string) => `${giver}>${receiver}`;

function shuffle<T>(arr: T[], random: Random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function countMutual(pairs: Map<string, string>): number {
  let n = 0;
  for (const [g, r] of pairs) if (pairs.get(r) === g) n++;
  return n / 2;
}

/** Kuhn's augmenting-path matching. Returns giver→receiver or the givers left unmatched. */
function maxMatching(
  givers: string[],
  allowed: Map<string, string[]>,
): { matchOfReceiver: Map<string, string>; unmatched: string[] } {
  const matchOfReceiver = new Map<string, string>();
  const tryAssign = (g: string, seen: Set<string>): boolean => {
    for (const r of allowed.get(g)!) {
      if (seen.has(r)) continue;
      seen.add(r);
      const current = matchOfReceiver.get(r);
      if (current === undefined || tryAssign(current, seen)) {
        matchOfReceiver.set(r, g);
        return true;
      }
    }
    return false;
  };
  const unmatched: string[] = [];
  for (const g of givers) if (!tryAssign(g, new Set())) unmatched.push(g);
  return { matchOfReceiver, unmatched };
}

export function draw({ ids, forbidden, random = Math.random }: DrawInput): DrawResult {
  if (ids.length < 3) return { ok: false, reason: 'too-few' };

  const allowed = new Map<string, string[]>();
  for (const g of ids) {
    allowed.set(
      g,
      ids.filter((r) => r !== g && !forbidden.has(pairKey(g, r))),
    );
  }

  const noOptions = ids.filter((g) => allowed.get(g)!.length === 0);
  const noGiver = ids.filter((r) => !ids.some((g) => allowed.get(g)!.includes(r)));
  if (noOptions.length || noGiver.length) {
    return { ok: false, reason: 'impossible', stuck: [...new Set([...noOptions, ...noGiver])] };
  }

  const feasibility = maxMatching(ids, allowed);
  if (feasibility.unmatched.length) {
    return { ok: false, reason: 'impossible', stuck: feasibility.unmatched };
  }

  const isValid = (perm: string[]) => ids.every((g, i) => perm[i] !== g && !forbidden.has(pairKey(g, perm[i])));
  const toMap = (perm: string[]) => new Map(ids.map((g, i) => [g, perm[i]]));

  // 1) Uniform rejection sampling, preferring assignments without mutual pairs.
  const ATTEMPTS = 20000;
  let fallback: Map<string, string> | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const perm = shuffle(ids, random);
    if (!isValid(perm)) continue;
    const pairs = toMap(perm);
    const mutual = countMutual(pairs);
    if (mutual === 0) return { ok: true, pairs, mutualPairs: 0 };
    if (!fallback || mutual < countMutual(fallback)) fallback = pairs;
    if (attempt > ATTEMPTS / 2 && fallback) break;
  }

  // 2) Randomised matching for heavily constrained groups.
  let best = fallback;
  for (let i = 0; i < 200; i++) {
    const shuffledAllowed = new Map([...allowed].map(([g, rs]) => [g, shuffle(rs, random)]));
    const { matchOfReceiver, unmatched } = maxMatching(shuffle(ids, random), shuffledAllowed);
    if (unmatched.length) continue;
    const pairs = new Map<string, string>();
    for (const [r, g] of matchOfReceiver) pairs.set(g, r);
    const mutual = countMutual(pairs);
    if (!best || mutual < countMutual(best)) best = pairs;
    if (mutual === 0) break;
  }

  if (!best) {
    // Should be unreachable because feasibility was proven above.
    return { ok: false, reason: 'impossible', stuck: [] };
  }
  return { ok: true, pairs: best, mutualPairs: countMutual(best) };
}

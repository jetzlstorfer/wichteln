import type { RevealPair } from '../../../shared/types';

/** Turns giver→receiver pairs into closed chains: Anna → Bernd → Clara → Anna. */
export function revealChains(pairs: RevealPair[]): string[][] {
  const next = new Map(pairs.map((p) => [p.giver, p.receiver]));
  const seen = new Set<string>();
  const chains: string[][] = [];
  for (const { giver } of pairs) {
    if (seen.has(giver)) continue;
    const chain: string[] = [];
    let current: string | undefined = giver;
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      chain.push(current);
      current = next.get(current);
    }
    if (current !== undefined) chain.push(current);
    chains.push(chain);
  }
  return chains;
}

const FAMILY_TITLES = new Set([
  'oma', 'opa', 'omi', 'opi', 'tante', 'onkel', 'uroma', 'uropa', 'cousin', 'cousine', 'gote', 'göd', 'godi', 'dodl',
]);

/** "Anna" from "Anna Huber", but "Oma Gerti" stays "Oma Gerti" – friendlier in compact places. */
export function firstName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1 && FAMILY_TITLES.has(parts[0]!.toLowerCase())) return `${parts[0]} ${parts[1]}`;
  return parts[0] || name;
}

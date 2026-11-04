import { revealChains } from '../lib/reveal';
import type { RevealPair } from '../../../shared/types';

/** Renders giver→receiver pairs as wrapping chains; names never break mid-word. */
export function RevealChainList({ pairs, itemClassName = '' }: { pairs: RevealPair[]; itemClassName?: string }) {
  return (
    <ul className="space-y-2">
      {revealChains(pairs).map((chain) => (
        <li key={chain.join('>')} className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm leading-relaxed ${itemClassName}`}>
          {chain.map((name, i) => (
            <span key={`${name}-${i}`} className="whitespace-nowrap">
              {i > 0 ? (
                <>
                  <span className="mr-1.5 text-gold-600" aria-hidden="true">
                    →
                  </span>
                  <span className="sr-only">beschenkt </span>
                </>
              ) : null}
              <span className="font-bold">{name}</span>
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

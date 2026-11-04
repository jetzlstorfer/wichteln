import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, Sparkles } from 'lucide-react';

export function TopBar({ back, right }: { back?: { to: string; label: string }; right?: ReactNode }) {
  return (
    <header className="relative z-10 flex items-center justify-between gap-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
      {back ? (
        <Link to={back.to} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-bold text-cream-200 hover:text-gold-300">
          <ChevronLeft className="size-5" />
          {back.label}
        </Link>
      ) : (
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lg font-bold text-cream-100">
          <span className="grid size-8 place-items-center rounded-full bg-gold-400/15 text-gold-300 ring-1 ring-gold-300/30">
            <Sparkles className="size-4" />
          </span>
          Wichteln
        </Link>
      )}
      {right}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="relative z-10 mt-12 pb-4 text-center text-sm text-cream-200/70">
      <p className="divider-stars mb-3 text-xs">✦</p>
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>Mit Liebe gemacht für Familien in Österreich</span>
        <span aria-hidden="true">·</span>
        <Link to="/datenschutz" className="underline decoration-gold-400/50 underline-offset-4 hover:text-gold-300">
          Datenschutz
        </Link>
      </p>
    </footer>
  );
}

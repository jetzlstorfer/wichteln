import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { CalendarDays, Crown, Gift, MessageCircleHeart, ScrollText } from 'lucide-react';
import type { MeView } from '../../../../shared/types';
import { TopBar } from '../../components/Layout';
import { Button, ErrorState, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useDocumentTitle, useLoader } from '../../lib/hooks';
import { firstName } from '../../lib/reveal';
import { listRounds, rememberRound } from '../../lib/storage';
import { AdventTab } from './AdventTab';
import { ChatTab } from './ChatTab';
import { WichtelTab } from './WichtelTab';
import { WishTab } from './WishTab';

export interface TabProps {
  data: MeView;
  token: string;
  reload: () => Promise<unknown>;
  update: (fn: (data: MeView) => MeView) => void;
}

const TABS = [
  { slug: '', label: 'Wichtel', icon: Gift },
  { slug: 'wunschzettel', label: 'Wunschzettel', icon: ScrollText },
  { slug: 'nachrichten', label: 'Nachrichten', icon: MessageCircleHeart },
  { slug: 'advent', label: 'Advent', icon: CalendarDays },
] as const;

export function Participant() {
  const { token = '', tab = '' } = useParams();
  const { data, setData, error, loading, reload } = useLoader(() => api.me.get(token), [token], 30_000);
  useDocumentTitle(data ? data.group.name : 'Wichteln');

  useEffect(() => {
    if (data) rememberRound({ kind: 'w', token, groupName: data.group.name, personName: data.me.name });
  }, [data?.group.name, data?.me.name, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!TABS.some((t) => t.slug === tab)) return <Navigate to={`/w/${token}`} replace />;
  if (loading && !data) return <Spinner label="Das Christkind sucht deine Seite …" />;
  if (!data) {
    return (
      <main className="page">
        <TopBar />
        <ErrorState
          message={
            error?.status === 404
              ? 'Dieser Link ist nicht mehr gültig oder noch nicht bestätigt. Verwende deine gespeicherte Kopie. Bei älteren Runden frag die organisierende Person nach der neuen Bestätigung vor Ort.'
              : (error?.message ?? 'Da ist etwas schiefgegangen.')
          }
          action={
            error?.status === 404 ? (
              <Link to="/" className="btn btn-primary">
                Zur Startseite
              </Link>
            ) : (
              <Button onClick={() => reload(false)}>Nochmal probieren</Button>
            )
          }
        />
      </main>
    );
  }

  const update = (fn: (d: MeView) => MeView) => setData((d) => (d ? fn(d) : d));
  const props: TabProps = { data, token, reload, update };
  const orgaRound = listRounds().find((r) => r.kind === 'orga' && r.selfToken === token);
  const unread = data.unread.fromChristkind + data.unread.fromRecipient;

  let content: ReactNode;
  if (tab === 'wunschzettel') content = <WishTab {...props} />;
  else if (tab === 'nachrichten') content = <ChatTab {...props} />;
  else if (tab === 'advent') content = <AdventTab {...props} />;
  else content = <WichtelTab {...props} />;

  return (
    <>
      <main className="page pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
        <TopBar
          right={
            <span className="flex items-center gap-2">
              {orgaRound ? (
                <Link
                  to={`/orga/${orgaRound.token}`}
                  className="chip min-h-9 bg-gold-400/15 text-gold-300 ring-1 ring-gold-300/30 hover:bg-gold-400/25"
                >
                  <Crown className="size-3.5" /> Organisieren
                </Link>
              ) : null}
              <span className="chip min-h-9 bg-white/10 text-cream-100 ring-1 ring-white/15">{firstName(data.me.name)}</span>
            </span>
          }
        />
        {content}
      </main>
      <nav
        aria-label="Bereiche"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gold-300/20 bg-night-900/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <ul className="mx-auto grid max-w-[34rem] grid-cols-4">
          {TABS.map(({ slug, label, icon: Icon }) => {
            const active = tab === slug;
            const badge = slug === 'nachrichten' && unread > 0 && !active ? unread : 0;
            return (
              <li key={slug}>
                <Link
                  to={slug ? `/w/${token}/${slug}` : `/w/${token}`}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[0.72rem] font-bold transition-colors ${
                    active ? 'text-gold-300' : 'text-cream-200/70 hover:text-cream-100'
                  }`}
                >
                  <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${active ? 'bg-gold-400/15' : ''}`}>
                    <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {label}
                  {badge ? (
                    <span className="absolute top-1.5 left-1/2 ml-2 grid min-w-5 place-items-center rounded-full bg-berry-500 px-1 text-[0.68rem] leading-5 text-cream-50 ring-2 ring-night-900">
                      {badge > 9 ? '9+' : badge}
                      <span className="sr-only"> ungelesene Nachrichten</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

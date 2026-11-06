import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarHeart, ExternalLink, Eye, EyeOff, MessageCircleQuestion, PartyPopper, ScrollText, Sparkles, Wallet } from 'lucide-react';
import type { MeView, Wish } from '../../../../shared/types';
import { InstallHint, ReissuedLinkNotice, SaveLinkCard } from '../../components/LinkHints';
import { RevealChainList } from '../../components/RevealChainList';
import { Initials } from '../../components/ui';
import { api } from '../../lib/api';
import { daysBetween, formatDate, formatEuro, sleepsText } from '../../lib/format';
import { usePrefersReducedMotion } from '../../lib/hooks';
import { firstName } from '../../lib/reveal';
import { absoluteUrl } from '../../lib/share';
import type { TabProps } from './Participant';

export function WichtelTab({ data, token, update }: TabProps) {
  const { me, group } = data;
  const days = group.exchangeDate ? daysBetween(data.today, group.exchangeDate) : null;

  return (
    <div className="space-y-4">
      <header className="mt-2 animate-fade-up">
        <p className="font-hand text-2xl text-gold-300">Servus, {firstName(me.name)}!</p>
        <h1 className="text-3xl font-bold text-cream-50">{group.name}</h1>
      </header>

      <div className="card-dark grid grid-cols-2 gap-3 text-cream-100 animate-fade-up">
        <div className="flex items-start gap-2.5">
          <CalendarHeart className="mt-0.5 size-5 shrink-0 text-gold-300" />
          <div>
            <p className="text-xs font-bold tracking-wide text-cream-200/75 uppercase">Bescherung</p>
            <p className="font-bold">{group.exchangeDate ? formatDate(group.exchangeDate) : 'noch offen'}</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Wallet className="mt-0.5 size-5 shrink-0 text-gold-300" />
          <div>
            <p className="text-xs font-bold tracking-wide text-cream-200/75 uppercase">Budget</p>
            <p className="font-bold">{group.budget !== null ? `bis ${formatEuro(group.budget)}` : 'kein fixes'}</p>
          </div>
        </div>
        {days !== null ? <p className="col-span-2 text-center font-hand text-2xl text-gold-200">{sleepsText(days)}</p> : null}
      </div>

      {me.linkReissuedAt && !me.isOrganizer ? (
        <ReissuedLinkNotice token={token} reissuedAt={me.linkReissuedAt} organizerName={group.organizerName} />
      ) : null}

      <SaveLinkCard
        url={absoluteUrl(`/w/${token}`)}
        flagKey={`w-saved-${token.slice(0, 10)}`}
        title="Das ist dein persönlicher Link"
        text="Damit kommst du jederzeit zurück – auch auf einem anderen Handy. Schick ihn dir am besten selbst, aber gib ihn niemandem weiter."
        shareText={`Mein Wichtel-Link für „${group.name}“ (nur für mich):`}
      />

      {!group.drawn ? (
        <BeforeDraw data={data} token={token} />
      ) : data.recipient ? (
        <AfterDraw data={data} token={token} update={update} />
      ) : (
        <div className="card text-center">
          <p className="text-ink-700">
            Du warst bei der Auslosung noch nicht dabei. Sag {group.organizerName} Bescheid – vielleicht wird nochmal neu ausgelost.
          </p>
        </div>
      )}

      {data.reveal ? <RevealCard data={data} /> : null}
      <InstallHint />
    </div>
  );
}

function BeforeDraw({ data, token }: { data: MeView; token: string }) {
  const { me, group, participants } = data;
  return (
    <>
      <div className="card overflow-hidden text-center animate-fade-up">
        <img
          src="/img/christkind-320.webp"
          srcSet="/img/christkind-320.webp 190w, /img/christkind-640.webp 381w"
          sizes="140px"
          alt=""
          width={190}
          height={320}
          className="mx-auto h-44 w-auto animate-float drop-shadow-[0_8px_24px_rgb(232_176_75/0.45)]"
        />
        <h2 className="mt-3 text-2xl font-bold">Das Christkind wartet noch …</h2>
        <p className="mt-2 text-ink-700">
          Sobald {group.organizerName} auslost, erfährst du hier, wen du heuer beschenken darfst. Wir sagen nichts weiter – versprochen!
        </p>
        <Link to={`/w/${token}/wunschzettel`} className="btn btn-primary mt-5 w-full">
          <ScrollText className="size-5" />
          {me.wishes.length === 0 ? 'Schreib inzwischen deinen Wunschzettel' : `Wunschzettel (${me.wishes.length}) ansehen`}
        </Link>
      </div>
      <div className="card-dark text-cream-100">
        <h2 className="text-lg font-bold">Wer mitmacht ({participants.length})</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {participants.map((p) => (
            <li key={p.id} className="chip bg-white/10 py-1 pl-1 text-cream-50 ring-1 ring-white/10">
              <Initials name={p.name} className="!size-6 text-[0.65rem]" />
              {p.name}
              {p.isMe ? <span className="text-gold-300">(du)</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

const confettiColors = ['#f6d58a', '#e8b04b', '#b8323d', '#d0525c', '#4a8572', '#fffcf5'];

async function celebrate() {
  const { default: confetti } = await import('canvas-confetti');
  // The CSP does not allow blob workers, so render on the main thread.
  const fire = confetti.create(undefined, { resize: true, useWorker: false, disableForReducedMotion: true });
  const base = { colors: confettiColors, ticks: 220, scalar: 1.05, disableForReducedMotion: true };
  void fire({ ...base, particleCount: 90, spread: 75, startVelocity: 42, origin: { y: 0.55 } });
  window.setTimeout(() => void fire({ ...base, particleCount: 45, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } }), 220);
  window.setTimeout(() => void fire({ ...base, particleCount: 45, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } }), 380);
}

function AfterDraw({ data, token, update }: { data: MeView; token: string; update: TabProps['update'] }) {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<'closed' | 'shaking' | 'open'>(() => (data.me.revealSeen ? 'open' : 'closed'));
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const unwrap = () => {
    if (phase !== 'closed') return;
    setPhase('shaking');
    timer.current = window.setTimeout(
      () => {
        setPhase('open');
        void celebrate();
        api.me.revealSeen(token).catch(() => undefined);
        update((d) => ({ ...d, me: { ...d.me, revealSeen: true } }));
      },
      reducedMotion ? 50 : 1300,
    );
  };

  if (phase !== 'open') {
    return (
      <div className="card text-center animate-fade-up">
        <p className="chip mx-auto bg-berry-500 text-cream-50">
          <Sparkles className="size-3.5" /> Es ist ausgelost!
        </p>
        <h2 className="mt-3 text-2xl font-bold">Dein Packerl ist da</h2>
        <p className="mt-1 text-ink-700">Schau, dass dir niemand über die Schulter schaut 🤫 – dann tipp aufs Packerl.</p>
        <button
          type="button"
          onClick={unwrap}
          className="group mx-auto mt-4 block rounded-3xl p-2 focus-visible:outline-offset-4"
          aria-label="Packerl öffnen und sehen, wen du beschenkst"
        >
          <img
            src="/img/packerl-512.webp"
            alt=""
            width={251}
            height={256}
            className={`mx-auto h-56 w-auto drop-shadow-[0_14px_30px_rgb(184_50_61/0.35)] transition-transform group-active:scale-95 ${
              phase === 'shaking' ? 'animate-wiggle-loop' : 'animate-float'
            }`}
          />
        </button>
        <p className="mt-2 font-hand text-2xl text-berry-500">{phase === 'shaking' ? 'Gleich …' : 'Tipp mich an!'}</p>
      </div>
    );
  }

  return <RecipientCard data={data} token={token} />;
}

function RecipientCard({ data, token }: { data: MeView; token: string }) {
  const recipient = data.recipient!;
  const [hidden, setHidden] = useState(false);
  const name = firstName(recipient.name);

  return (
    <section className="card animate-pop" aria-labelledby="recipient-title">
      <div className="flex items-start justify-between gap-2">
        <p id="recipient-title" className="text-sm font-bold tracking-wide text-ink-500 uppercase">
          Du bist das Christkind für
        </p>
        <button
          type="button"
          className="icon-btn -mt-2 -mr-2"
          onClick={() => setHidden((h) => !h)}
          aria-label={hidden ? 'Name anzeigen' : 'Name verstecken'}
          aria-pressed={hidden}
        >
          {hidden ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
        </button>
      </div>
      <div className={`transition-[filter] duration-300 ${hidden ? 'pointer-events-none blur-md select-none' : ''}`} aria-hidden={hidden}>
        <p className="mt-1 flex items-center gap-3">
          <Initials name={recipient.name} className="!size-14 text-lg" />
          <span className="font-display text-4xl leading-tight font-bold text-berry-600">{recipient.name}</span>
        </p>

        {recipient.about ? (
          <div className="mt-4 rounded-2xl bg-cream-200/70 p-3">
            <p className="text-xs font-bold tracking-wide text-ink-500 uppercase">Über {name}</p>
            <p className="mt-1 whitespace-pre-line text-ink-900">{recipient.about}</p>
          </div>
        ) : null}

        <h3 className="mt-5 flex items-center gap-2 text-lg font-bold">
          <ScrollText className="size-5 text-gold-600" /> {name}s Wunschzettel
        </h3>
        {recipient.wishes.length ? (
          <ul className="mt-3 space-y-2">
            {recipient.wishes.map((w) => (
              <WishLine key={w.id} wish={w} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-2xl border-2 border-dashed border-cream-300 p-4 text-center text-ink-500">
            {name} hat noch nichts aufgeschrieben. Schau später nochmal vorbei – oder frag einfach anonym nach!
          </p>
        )}
      </div>
      <Link to={`/w/${token}/nachrichten`} className="btn btn-outline mt-4 w-full">
        <MessageCircleQuestion className="size-5" /> {name} anonym etwas fragen
      </Link>
    </section>
  );
}

export function WishLine({ wish, action }: { wish: Wish; action?: ReactNode }) {
  let host = '';
  if (wish.url) {
    try {
      host = new URL(wish.url).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
  }
  return (
    <li className="flex min-h-13 items-center gap-3 rounded-2xl border border-cream-300/80 bg-gradient-to-br from-white/95 to-cream-50 px-3 py-2 shadow-[0_2px_8px_rgb(12_23_48/0.05)]">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 ring-1 ring-gold-300/60" aria-hidden>
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-hand text-[1.4rem] leading-tight break-words text-ink-900">{wish.text}</p>
        {wish.url ? (
          <a
            href={wish.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-fir-500/10 px-2 py-1 text-xs font-bold text-fir-700 no-underline transition-colors hover:bg-fir-500/15"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{host || 'Link'}</span>
          </a>
        ) : null}
      </div>
      {action}
    </li>
  );
}

function RevealCard({ data }: { data: MeView }) {
  const pairs = data.reveal ?? [];
  const myChristkind = pairs.find((p) => p.receiver === data.me.name)?.giver;
  return (
    <section className="card animate-fade-up">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <PartyPopper className="size-5 text-berry-500" /> Die Auflösung
      </h2>
      {myChristkind ? (
        <p className="mt-3 rounded-2xl bg-gold-100 p-4 text-center">
          <span className="block text-sm font-bold text-ink-500">Dein Christkind war</span>
          <span className="font-display text-3xl font-bold text-berry-600">{myChristkind}</span>
        </p>
      ) : null}
      <p className="mt-4 text-sm font-bold text-ink-700">Wer wen beschenkt hat:</p>
      <div className="mt-2">
        <RevealChainList pairs={pairs} itemClassName="rounded-2xl bg-white/70 px-3 py-2 ring-1 ring-cream-300" />
      </div>
    </section>
  );
}

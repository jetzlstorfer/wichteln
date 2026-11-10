import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { CalendarHeart, Check, ChevronRight, Crown, Euro, Gift, Megaphone, Users } from 'lucide-react';
import type { AdminView } from '../../../../shared/types';
import { Footer, TopBar } from '../../components/Layout';
import { SaveLinkCard } from '../../components/LinkHints';
import { ShareButtons } from '../../components/ShareButtons';
import { Button, ErrorState, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { daysBetween, formatDate, formatEuro, pluralPeople, sleepsText } from '../../lib/format';
import { useDocumentTitle, useLoader } from '../../lib/hooks';
import { absoluteUrl } from '../../lib/share';
import { findRound, rememberRound } from '../../lib/storage';
import { DrawSection } from './DrawSection';
import { DangerSection, NextRoundSection, SettingsSection } from './MoreSections';
import { PeopleSection } from './PeopleSection';
import { RulesSection } from './RulesSection';
import { Section } from './shared';

export function Organizer() {
  const { token = '' } = useParams();
  const { data, error, loading, reload } = useLoader(() => api.admin.get(token), [token], 20_000);
  useDocumentTitle(data ? `${data.group.name} · Organisieren` : 'Organisieren');

  useEffect(() => {
    if (!data) return;
    rememberRound({ kind: 'orga', token, groupName: data.group.name, personName: data.group.organizerName, inviteCode: data.group.inviteCode });
    const selfToken = findRound('orga', token)?.selfToken;
    if (selfToken && findRound('w', selfToken)) {
      rememberRound({ kind: 'w', token: selfToken, groupName: data.group.name, inviteCode: data.group.inviteCode });
    }
  }, [data?.group.name, data?.group.inviteCode, data?.group.organizerName, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Spinner label="Die Runde wird geladen …" />;
  if (!data) {
    return (
      <main className="page">
        <TopBar />
        <ErrorState
          message={error?.message ?? 'Diese Wichtel-Runde gibt es nicht (mehr).'}
          action={
            error?.status === 0 ? (
              <Button onClick={() => reload(false)}>Nochmal probieren</Button>
            ) : (
              <Link to="/" className="btn btn-primary">
                Zur Startseite
              </Link>
            )
          }
        />
      </main>
    );
  }

  const { group } = data;
  const days = group.exchangeDate ? daysBetween(data.today, group.exchangeDate) : null;

  return (
    <main className="page">
      <TopBar
        right={
          <span className="chip bg-gold-400/15 text-gold-300 ring-1 ring-gold-300/30">
            <Crown className="size-3.5" /> Organisieren
          </span>
        }
      />
      <header className="mt-2 mb-5 animate-fade-up">
        <h1 className="text-3xl font-bold text-cream-50">{group.name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip bg-white/10 text-cream-100 ring-1 ring-white/15">
            <Users className="size-4 text-gold-300" /> {pluralPeople(data.participants.length)}
          </span>
          {group.budget !== null ? (
            <span className="chip bg-white/10 text-cream-100 ring-1 ring-white/15">
              <Euro className="size-4 text-gold-300" /> bis {formatEuro(group.budget)}
            </span>
          ) : null}
          {group.exchangeDate ? (
            <span className="chip bg-white/10 text-cream-100 ring-1 ring-white/15">
              <CalendarHeart className="size-4 text-gold-300" /> {formatDate(group.exchangeDate)}
            </span>
          ) : null}
        </div>
        {days !== null && days >= 0 ? <p className="mt-2 font-hand text-2xl text-gold-300">{sleepsText(days)}</p> : null}
      </header>

      <div className="space-y-4">
        <SaveLinkCard
          url={absoluteUrl(`/orga/${token}`)}
          flagKey={`orga-saved-${token.slice(0, 10)}`}
          title="Speichere dir diesen Link!"
          text="Das ist dein Organisator-Schlüssel. Schick ihn dir z. B. selbst per WhatsApp, damit du ihn wiederfindest. Nicht in die Familiengruppe posten!"
          shareText={`Mein Organisator-Link für „${group.name}“ (nicht weitergeben):`}
        />
        <StatusSteps view={data} />
        <SelfCard view={data} token={token} />
        {group.drawn && data.participants.some((p) => !p.claimed) ? (
          <div role="alert" className="card text-berry-700">
            <p className="font-bold">Noch nicht alle haben ihren Namen ausgewählt</p>
            <p className="mt-2 text-sm">
              Schick den noch fehlenden Personen den Einladungslink. Sie können ihren Namen auch jetzt auswählen
              und ihre bestehende Zuteilung ansehen. Du musst nicht neu auslosen.
            </p>
          </div>
        ) : null}
      </div>

      <InviteSection view={data} />
      <PeopleSection view={data} token={token} reload={reload} />
      <RulesSection view={data} token={token} reload={reload} />
      <DrawSection view={data} token={token} reload={reload} />
      {group.revealed ? <NextRoundSection view={data} token={token} /> : null}
      <SettingsSection view={data} token={token} reload={reload} />
      <DangerSection view={data} token={token} />
      <Footer />
    </main>
  );
}

function StatusSteps({ view }: { view: AdminView }) {
  const people = view.participants;
  const steps = [
    { label: 'Familie eintragen', done: people.length >= 3, href: '#familie' },
    { label: 'Auslosen', done: view.group.drawn, href: '#auslosen' },
    { label: 'Alle melden sich', done: people.length >= 3 && people.every((p) => p.claimed), href: '#einladen' },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <nav aria-label="Fortschritt" className="card-dark !p-3">
      <ol className="grid grid-cols-3 gap-1 text-center">
        {steps.map((s, i) => {
          const active = i === current;
          return (
            <li key={s.label}>
              <a href={s.href} className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-1.5 hover:bg-white/5">
                <span
                  className={`grid size-8 place-items-center rounded-full text-sm font-extrabold ${
                    s.done
                      ? 'bg-fir-400 text-cream-50'
                      : active
                        ? 'bg-gold-400 text-ink-900 animate-glow'
                        : 'bg-white/10 text-cream-200/70'
                  }`}
                >
                  {s.done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={`text-[0.72rem] leading-tight font-bold ${active ? 'text-gold-200' : 'text-cream-200/80'}`}>{s.label}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Organizers who take part need their own participant page – without peeking at anyone else's. */
function SelfCard({ view, token }: { view: AdminView; token: string }) {
  const me = view.participants.find((p) => p.isOrganizer);
  const selfToken = findRound('orga', token)?.selfToken;
  if (!me) return null;

  if (selfToken) {
    return (
      <Link
        to={`/w/${selfToken}`}
        className="card-dark flex items-center gap-3 text-cream-50 ring-1 ring-berry-400/40 transition hover:bg-night-700/80"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-berry-500/30 text-berry-400">
          <Gift className="size-5" />
        </span>
        <span className="flex-1">
          <span className="block font-bold">Meine eigene Wichtel-Seite</span>
          <span className="block text-sm text-cream-200/85">Wunschzettel, deine Zuteilung & Adventkalender</span>
        </span>
        <ChevronRight className="size-5 text-gold-300" />
      </Link>
    );
  }

  return (
    <div className="card-dark text-cream-100">
      <p className="font-bold">Deine eigene Wichtel-Seite</p>
      <p className="mt-1 text-sm text-cream-200/85">
        Auf diesem Handy ist dein persönlicher Link nicht gespeichert. Öffne deine gespeicherte Kopie
        oder übertrage ihn von deinem bisherigen Gerät. Ist er verloren, tipp unter „Wer macht mit?“ auf deinen Namen
        und stell dir einen neuen aus.
      </p>
    </div>
  );
}

function InviteSection({ view }: { view: AdminView }) {
  const { group, participants } = view;
  const waiting = participants.filter((p) => !p.claimed).length;
  if (group.drawn && waiting === 0) return null;
  const url = absoluteUrl(`/einladung/${group.inviteCode}`);
  const details = [
    group.exchangeDate ? `🎁 Bescherung: ${formatDate(group.exchangeDate)}` : null,
    group.budget !== null ? `💶 Budget: bis ${formatEuro(group.budget)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const text = `✨🎄 Heuer wichteln wir mit dem Christkind! 🎄✨\n\n${group.organizerName} hat die Runde „${group.name}“ gestartet.${
    details ? `\n${details}` : ''
  }\n\nWähl deinen eigenen Namen und du bekommst sofort deinen geheimen Wichtel-Link. Bitte speichere ihn nur für dich. Diesen Einladungslink bitte nur innerhalb unserer Familie teilen:`;

  return (
    <Section
      id="einladen"
      title="Familie einladen"
      icon={<Megaphone className="size-5 text-gold-600" />}
      intro={
        participants.length < 2
          ? 'Trag zuerst unten alle ein – oder schick den Link gleich, dann tragen sich alle selbst ein.'
          : waiting === 0
            ? 'Alle sind dabei. 🎉'
            : `Ein Link für alle – bitte nur in der Familie teilen. Jede Person wählt ihren eigenen Namen. ${waiting === 1 ? '1 Anmeldung fehlt' : `${waiting} Anmeldungen fehlen`} noch.`
      }
    >
      <ShareButtons url={url} text={text} title={`Wichteln: ${group.name}`} />
    </Section>
  );
}

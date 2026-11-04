import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CalendarHeart, Check, ChevronRight, Euro, UserPlus } from 'lucide-react';
import { LIMITS } from '../../../shared/types';
import { Footer, TopBar } from '../components/Layout';
import { Button, ConfirmSheet, ErrorState, Initials, Spinner, useToast } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { formatDate, formatEuro } from '../lib/format';
import { useDocumentTitle, useLoader } from '../lib/hooks';
import { findByInvite, rememberRound } from '../lib/storage';

export function Invite() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useLoader(() => api.invite.get(code), [code], 30_000);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [newName, setNewName] = useState('');
  const [joining, setJoining] = useState(false);
  const [existing] = useState(() => findByInvite(code));
  useDocumentTitle(data ? `Einladung: ${data.group.name}` : 'Einladung');

  if (loading && !data) return <Spinner label="Die Einladung wird ausgepackt …" />;
  if (!data) {
    return (
      <main className="page">
        <TopBar />
        <ErrorState
          message={error?.message ?? 'Diese Einladung ist nicht (mehr) gültig.'}
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

  const { group, participants } = data;
  const open = participants.filter((p) => !p.claimed);

  const enter = (token: string, personName: string) => {
    rememberRound({ kind: 'w', token, groupName: group.name, personName, inviteCode: code });
    navigate(`/w/${token}`, { replace: true });
  };

  const claim = async () => {
    if (!picked) return;
    setClaiming(true);
    try {
      const { token } = await api.invite.claim(code, picked.id);
      enter(token, picked.name);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setClaiming(false);
      setPicked(null);
      if (err instanceof ApiError && err.code === 'already-claimed') void reload();
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setJoining(true);
    try {
      const { token } = await api.invite.join(code, name);
      enter(token, name);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setJoining(false);
    }
  };

  return (
    <main className="page">
      <TopBar />

      <header className="mt-2 text-center animate-fade-up">
        <img
          src="/img/glocke-512.webp"
          alt=""
          width={318}
          height={512}
          className="mx-auto h-36 w-auto animate-float drop-shadow-[0_10px_30px_rgb(232_176_75/0.35)]"
        />
        <p className="mt-3 font-hand text-2xl text-gold-300">{group.organizerName} lädt dich ein</p>
        <h1 className="mt-1 text-3xl font-bold text-cream-50 sm:text-4xl">{group.name}</h1>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {group.exchangeDate ? (
            <span className="chip bg-white/10 text-cream-100 ring-1 ring-white/15">
              <CalendarHeart className="size-4 text-gold-300" /> {formatDate(group.exchangeDate)}
            </span>
          ) : null}
          {group.budget !== null ? (
            <span className="chip bg-white/10 text-cream-100 ring-1 ring-white/15">
              <Euro className="size-4 text-gold-300" /> bis {formatEuro(group.budget)}
            </span>
          ) : null}
        </div>
      </header>

      {group.message ? (
        <div className="card paper-lines mt-6 -rotate-1 animate-fade-up">
          <p className="font-hand text-2xl leading-8 whitespace-pre-line text-ink-900">{group.message}</p>
          <p className="mt-1 text-right font-hand text-xl text-berry-600">– {group.organizerName}</p>
        </div>
      ) : null}

      {existing ? (
        <Link
          to={`/w/${existing.token}`}
          className="card-dark mt-6 flex items-center gap-3 text-cream-50 ring-2 ring-gold-400/60 transition hover:bg-night-700/80"
        >
          <Initials name={existing.personName ?? '?'} />
          <span className="flex-1">
            <span className="block font-bold">Du bist schon dabei{existing.personName ? ` als ${existing.personName}` : ''}!</span>
            <span className="block text-sm text-cream-200/85">Weiter zu deiner Wichtel-Seite</span>
          </span>
          <ChevronRight className="size-5 text-gold-300" />
        </Link>
      ) : null}

      <section className="card mt-6 animate-fade-up" aria-labelledby="who">
        <h2 id="who" className="text-2xl font-bold">
          Wer bist du?
        </h2>
        <p className="mt-1 text-ink-700">
          {open.length > 0
            ? 'Tipp auf deinen Namen. Danach bekommst du deinen ganz persönlichen Wichtel-Link.'
            : 'Alle Namen sind schon vergeben.'}
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {participants.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={p.claimed}
                onClick={() => setPicked(p)}
                className={`flex min-h-14 w-full items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left font-bold transition ${
                  p.claimed
                    ? 'cursor-not-allowed border-transparent bg-cream-200/60 text-ink-300'
                    : 'border-cream-300 bg-white text-ink-900 shadow-sm hover:border-gold-500 active:scale-[0.98]'
                }`}
              >
                {p.claimed ? (
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cream-300 text-ink-500">
                    <Check className="size-4" />
                  </span>
                ) : (
                  <Initials name={p.name} className="!size-8 !text-xs" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.name}</span>
                  {p.claimed ? <span className="block text-xs font-semibold">schon dabei</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {group.allowSelfJoin ? (
          <form onSubmit={join} className="mt-6 border-t border-dashed border-cream-400 pt-5">
            <label htmlFor="join-name" className="field-label">
              Dein Name fehlt?
            </label>
            <div className="flex gap-2">
              <input
                id="join-name"
                className="input"
                maxLength={LIMITS.personName}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Vorname oder Spitzname"
                autoComplete="given-name"
              />
              <Button type="submit" variant="fir" loading={joining} disabled={!newName.trim()} aria-label="Mich eintragen">
                <UserPlus className="size-5" />
              </Button>
            </div>
          </form>
        ) : group.drawn ? (
          <p className="mt-5 text-sm text-ink-500">
            Es wurde schon ausgelost. Wenn dein Name fehlt, frag bitte {group.organizerName}.
          </p>
        ) : (
          <p className="mt-5 text-sm text-ink-500">Dein Name fehlt? Dann sag {group.organizerName} Bescheid.</p>
        )}
      </section>

      <Footer />

      <ConfirmSheet
        open={picked !== null}
        onClose={() => !claiming && setPicked(null)}
        onConfirm={claim}
        loading={claiming}
        title={`Bist du wirklich ${picked?.name}?`}
        confirmLabel={`Ja, ich bin ${picked?.name}`}
      >
        <p>
          Danach kann niemand anderer mehr diesen Namen auswählen – und du bekommst deinen eigenen geheimen Link. Hast du dich
          vertippt, kann {group.organizerName} den Namen wieder freigeben.
        </p>
      </ConfirmSheet>
    </main>
  );
}

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Gift, Heart, ShieldCheck, Plus, UserCheck, UserRound, Users } from 'lucide-react';
import { LIMITS, type AdminParticipant, type AdminView } from '../../../../shared/types';
import { Button, Initials, Sheet } from '../../components/ui';
import { api } from '../../lib/api';
import { pluralPeople, relativeTime } from '../../lib/format';
import { firstName } from '../../lib/reveal';
import { Section, TwoStepButton, useAction } from './shared';

export function PeopleSection({ view, token, reload }: { view: AdminView; token: string; reload: () => Promise<unknown> }) {
  const { busy, run } = useAction(reload);
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawn = view.group.drawn;
  const people = view.participants;
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const selected = people.find((p) => p.id === selectedId) ?? null;
  const claimedCount = people.filter((p) => p.claimed).length;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = await run('add', () => api.admin.addParticipant(token, trimmed));
    if (ok) {
      setName('');
      inputRef.current?.focus();
    }
  };

  return (
    <Section
      id="familie"
      title="Wer macht mit?"
      icon={<Users className="size-5 text-fir-500" />}
      intro={
        people.length === 0
          ? 'Trag alle ein, die mitwichteln – Vornamen oder Spitznamen reichen.'
          : `${pluralPeople(people.length)} · ${claimedCount} von ${people.length} bestätigt. Tipp auf einen Namen, um den Code vor Ort zu vergleichen.`
      }
    >
      {!drawn ? (
        <form onSubmit={add} className="mb-4 flex gap-2">
          <label htmlFor="new-person" className="sr-only">
            Name hinzufügen
          </label>
          <input
            id="new-person"
            ref={inputRef}
            className="input"
            maxLength={LIMITS.personName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Opa Sepp"
            autoComplete="off"
            enterKeyHint="done"
          />
          <Button type="submit" variant="fir" loading={busy === 'add'} disabled={!name.trim()} aria-label="Person hinzufügen">
            <Plus className="size-5" />
          </Button>
        </form>
      ) : null}

      {people.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-cream-300 p-4 text-center text-ink-500">Noch niemand eingetragen.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-cream-300/70">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-cream-200/60"
              >
                <Initials name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-bold">
                    <span className="truncate">{p.name}</span>
                    {p.isOrganizer ? <span className="chip bg-gold-200 !px-2 !py-0 text-[0.7rem] text-gold-700">du</span> : null}
                  </span>
                  <StatusLine p={p} drawn={drawn} />
                </span>
                <span className="flex shrink-0 items-center gap-2 text-ink-500">
                  {p.partnerId ? (
                    <span className="chip bg-berry-500/10 text-berry-600" title={`Paar mit ${nameOf.get(p.partnerId)}`}>
                      <Heart className="size-3.5 fill-current" />
                      <span className="max-w-24 truncate">{nameOf.get(p.partnerId)}</span>
                    </span>
                  ) : null}
                  {p.wishCount > 0 ? (
                    <span className="chip bg-fir-500/10 text-fir-600" title={`${p.wishCount} Wünsche`}>
                      <Gift className="size-3.5" />
                      {p.wishCount}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <PersonSheet
        person={selected}
        view={view}
        token={token}
        reload={reload}
        onClose={() => setSelectedId(null)}
      />
    </Section>
  );
}

function StatusLine({ p, drawn }: { p: AdminParticipant; drawn: boolean }) {
  if (!p.claimed) {
    return (
      <span className="flex min-w-0 items-center gap-1 text-sm text-ink-500">
        <UserRound className="size-3.5 shrink-0" /> noch nicht bestätigt
      </span>
    );
  }
  if (drawn) {
    return p.revealSeen ? (
      <span className="flex min-w-0 items-center gap-1 text-sm text-fir-600">
        <Eye className="size-3.5 shrink-0" /> hat schon nachgeschaut
      </span>
    ) : (
      <span className="flex min-w-0 items-center gap-1 text-sm text-gold-700">
        <EyeOff className="size-3.5 shrink-0" /> noch nicht nachgeschaut
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1 text-sm text-fir-600">
      <UserCheck className="size-3.5 shrink-0" />
      ist bestätigt
      {p.lastSeenAt ? <span className="text-ink-300"> · {relativeTime(p.lastSeenAt)}</span> : null}
    </span>
  );
}

function PersonSheet({
  person,
  view,
  token,
  reload,
  onClose,
}: {
  person: AdminParticipant | null;
  view: AdminView;
  token: string;
  reload: () => Promise<unknown>;
  onClose: () => void;
}) {
  const { busy, run } = useAction(reload);
  const [name, setName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [checkedInPerson, setCheckedInPerson] = useState(false);
  const personId = person?.id;

  useEffect(() => {
    setName(person?.name ?? '');
    setVerificationCode('');
    setCheckedInPerson(false);
    // Only reset when a different person is opened, not on background refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  if (!person) return null;
  const drawn = view.group.drawn;
  const partner = view.participants.find((p) => p.id === person.partnerId);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== person.name) {
      await run('rename', () => api.admin.updateParticipant(token, person.id, { name: name.trim() }), 'Name geändert');
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkedInPerson) return;
    if (await run('verify', () => api.admin.verifyParticipant(token, person.id, verificationCode), `${person.name} bestätigt`)) {
      setVerificationCode('');
      setCheckedInPerson(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={person.name} image={<Initials name={person.name} className="mb-3 !size-14 !text-lg" />}>
      <form onSubmit={rename} className="flex gap-2">
        <label htmlFor="rename" className="sr-only">
          Name ändern
        </label>
        <input
          id="rename"
          className="input"
          value={name}
          maxLength={LIMITS.personName}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="outline" loading={busy === 'rename'} disabled={!name.trim() || name.trim() === person.name}>
          Ändern
        </Button>
      </form>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-cream-200/70 p-3">
          <dt className="text-ink-500">Paar mit</dt>
          <dd className="font-bold">{partner ? partner.name : '–'}</dd>
        </div>
        <div className="rounded-2xl bg-cream-200/70 p-3">
          <dt className="text-ink-500">Wunschzettel</dt>
          <dd className="font-bold">
            {person.wishCount === 0 ? 'noch leer' : person.wishCount === 1 ? '1 Wunsch' : `${person.wishCount} Wünsche`}
          </dd>
        </div>
        <div className="col-span-2 rounded-2xl bg-cream-200/70 p-3">
          <dt className="text-ink-500">Zuletzt vorbeigeschaut</dt>
          <dd className="font-bold">{relativeTime(person.lastSeenAt)}</dd>
        </div>
      </dl>

      <div className="mt-5 rounded-2xl border border-cream-300 p-4">
        <h3 className="flex items-center gap-2 font-bold">
          <ShieldCheck className="size-4 text-gold-600" /> Persönlich bestätigen
        </h3>
        {person.claimed ? (
          <p className="mt-2 text-sm text-ink-700">
            {firstName(person.name)} ist bestätigt. Der persönliche Link gehört nur dieser Person.
            Du kannst ihn weder anzeigen noch ersetzen. Bei Verlust hilft nur eine gespeicherte Kopie;
            ohne Kopie braucht ihr eine neue Runde.
          </p>
        ) : drawn ? (
          <p className="mt-2 text-sm text-berry-600">
            Diese ältere Runde enthält noch unbestätigte Zugänge. Setze zuerst die Auslosung zurück,
            bestätige alle Personen vor Ort und lose neu aus. Alte Zuteilungen können bereits bekannt sein.
          </p>
        ) : (
          <form onSubmit={verify} className="mt-3 space-y-3">
            <p className="text-sm text-ink-700">
              {firstName(person.name)} öffnet die Einladung auf dem eigenen Handy und wählt den Namen.
              Vergleiche den dort angezeigten Code persönlich – keine fremden Screenshots oder weitergeleiteten Codes.
            </p>
            <label htmlFor="verification-code" className="field-label">Code vom Handy</label>
            <input id="verification-code" className="input font-mono uppercase" required
              value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="ABCDE-12345" maxLength={11} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
            <label className="flex items-start gap-2 text-sm text-ink-700">
              <input type="checkbox" className="mt-1 size-4 shrink-0" required checked={checkedInPerson}
                onChange={(e) => setCheckedInPerson(e.target.checked)} />
              Ich habe {person.name} und den Code auf dem eigenen Handy persönlich überprüft.
            </label>
            <Button type="submit" variant="fir" className="w-full" loading={busy === 'verify'}
              disabled={!checkedInPerson || !/^[A-Fa-f0-9]{10}$/.test(verificationCode.replace(/[\s-]/g, ''))}>
              Vor Ort bestätigen
            </Button>
          </form>
        )}
      </div>

      {!drawn ? (
        <div className="mt-5 flex justify-end">
          <TwoStepButton
            onConfirm={async () => {
              if (await run('remove', () => api.admin.removeParticipant(token, person.id), `${person.name} entfernt`)) onClose();
            }}
            loading={busy === 'remove'}
            confirmLabel={`Wirklich ${firstName(person.name)} entfernen?`}
          >
            Aus der Runde entfernen
          </TwoStepButton>
        </div>
      ) : null}
    </Sheet>
  );
}

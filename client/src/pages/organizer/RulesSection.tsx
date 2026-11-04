import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeftRight, ArrowRight, Ban, Heart, History, Plus, X } from 'lucide-react';
import type { AdminView } from '../../../../shared/types';
import { Button, Toggle } from '../../components/ui';
import { api } from '../../lib/api';
import { Section, TwoStepButton, useAction } from './shared';

interface RuleItem {
  ids: string[];
  giver: string;
  receiver: string;
  both: boolean;
}

export function RulesSection({ view, token, reload }: { view: AdminView; token: string; reload: () => Promise<unknown> }) {
  const { busy, run } = useAction(reload);
  const drawn = view.group.drawn;
  const people = view.participants;
  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  const couples = useMemo(() => {
    const list: { a: string; b: string; aId: string }[] = [];
    for (const p of people) {
      if (p.partnerId && p.id < p.partnerId && nameOf.has(p.partnerId)) {
        list.push({ a: p.name, b: nameOf.get(p.partnerId)!, aId: p.id });
      }
    }
    return list;
  }, [people, nameOf]);
  const single = people.filter((p) => !p.partnerId);

  const customRules = useMemo(() => {
    const custom = view.exclusions.filter((e) => e.reason === 'custom');
    const byKey = new Map(custom.map((e) => [`${e.giverId}|${e.receiverId}`, e]));
    const used = new Set<string>();
    const items: RuleItem[] = [];
    for (const e of custom) {
      if (used.has(e.id)) continue;
      used.add(e.id);
      const reverse = byKey.get(`${e.receiverId}|${e.giverId}`);
      if (reverse && !used.has(reverse.id)) used.add(reverse.id);
      items.push({
        ids: reverse ? [e.id, reverse.id] : [e.id],
        giver: nameOf.get(e.giverId) ?? '?',
        receiver: nameOf.get(e.receiverId) ?? '?',
        both: Boolean(reverse),
      });
    }
    return items;
  }, [view.exclusions, nameOf]);
  const lastYear = view.exclusions.filter((e) => e.reason === 'lastyear');

  const [coupleA, setCoupleA] = useState('');
  const [coupleB, setCoupleB] = useState('');
  const [giver, setGiver] = useState('');
  const [receiver, setReceiver] = useState('');
  const [both, setBoth] = useState(true);

  const addCouple = async (e: FormEvent) => {
    e.preventDefault();
    if (!coupleA || !coupleB || coupleA === coupleB) return;
    if (await run('couple', () => api.admin.updateParticipant(token, coupleA, { partnerId: coupleB }), 'Paar gespeichert ❤')) {
      setCoupleA('');
      setCoupleB('');
    }
  };

  const addRule = async (e: FormEvent) => {
    e.preventDefault();
    if (!giver || !receiver || giver === receiver) return;
    if (await run('rule', () => api.admin.addExclusion(token, { giverId: giver, receiverId: receiver, both }), 'Ausnahme gespeichert')) {
      setGiver('');
      setReceiver('');
    }
  };

  if (people.length < 2) return null;

  return (
    <Section
      id="regeln"
      title="Wer zieht wen nicht?"
      icon={<Ban className="size-5 text-berry-500" />}
      intro={
        drawn
          ? 'Nach der Auslosung sind die Regeln fix. Setz die Auslosung zurück, um etwas zu ändern.'
          : 'Paare ziehen sich nie gegenseitig. Zusätzlich kannst du eigene Ausnahmen festlegen.'
      }
    >
      <h3 className="flex items-center gap-1.5 font-bold text-ink-700">
        <Heart className="size-4 fill-berry-500 text-berry-500" /> Paare
      </h3>
      {couples.length === 0 ? (
        <p className="mt-1 text-sm text-ink-500">Noch keine Paare eingetragen.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {couples.map((c) => (
            <li key={c.aId} className="chip bg-berry-500/10 !py-1.5 text-sm text-berry-700">
              {c.a} <Heart className="size-3.5 fill-current" /> {c.b}
              {!drawn ? (
                <button
                  type="button"
                  className="-mr-1 ml-1 grid size-6 place-items-center rounded-full hover:bg-berry-500/20"
                  aria-label={`Paar ${c.a} und ${c.b} auflösen`}
                  onClick={() => run(`uncouple-${c.aId}`, () => api.admin.updateParticipant(token, c.aId, { partnerId: null }))}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!drawn && single.length >= 2 ? (
        <form onSubmit={addCouple} className="mt-3 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
          <PersonSelect label="Erste Person" placeholder="Person …" value={coupleA} onChange={setCoupleA} options={single.filter((p) => p.id !== coupleB)} />
          <Heart className="size-4 text-berry-400" aria-hidden />
          <PersonSelect label="Zweite Person" placeholder="Person …" value={coupleB} onChange={setCoupleB} options={single.filter((p) => p.id !== coupleA)} />
          <Button
            type="submit"
            variant="berry"
            className="!px-3"
            loading={busy === 'couple'}
            disabled={!coupleA || !coupleB}
            aria-label="Paar hinzufügen"
          >
            <Plus className="size-5" />
          </Button>
        </form>
      ) : null}

      <h3 className="mt-6 flex items-center gap-1.5 font-bold text-ink-700">
        <Ban className="size-4 text-ink-500" /> Eigene Ausnahmen
      </h3>
      {customRules.length === 0 ? (
        <p className="mt-1 text-sm text-ink-500">Zum Beispiel: Geschwister, die sich eh jedes Jahr beschenken.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {customRules.map((r) => (
            <li key={r.ids.join()} className="flex items-center gap-2 rounded-2xl bg-cream-200/70 py-1.5 pr-1.5 pl-3 text-sm font-bold">
              <span className="flex-1">
                {r.giver}{' '}
                {r.both ? (
                  <ArrowLeftRight className="inline size-4 text-ink-500" aria-label="und" />
                ) : (
                  <ArrowRight className="inline size-4 text-ink-500" aria-label="zieht nicht" />
                )}{' '}
                {r.receiver}
                <span className="block text-xs font-semibold text-ink-500">
                  {r.both ? 'ziehen sich nicht gegenseitig' : `${r.giver} zieht nicht ${r.receiver}`}
                </span>
              </span>
              {!drawn ? (
                <button
                  type="button"
                  className="icon-btn !size-9"
                  aria-label="Ausnahme entfernen"
                  onClick={() =>
                    run(`rule-${r.ids[0]}`, async () => {
                      for (const id of r.ids) await api.admin.removeExclusion(token, id);
                    })
                  }
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!drawn ? (
        <form onSubmit={addRule} className="mt-3 space-y-3 rounded-2xl border border-dashed border-cream-400 p-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <PersonSelect label="Wer" value={giver} onChange={setGiver} options={people.filter((p) => p.id !== receiver)} />
            <span className="text-xs font-bold text-ink-500">zieht nicht</span>
            <PersonSelect label="Wen" value={receiver} onChange={setReceiver} options={people.filter((p) => p.id !== giver)} />
          </div>
          <Toggle checked={both} onChange={setBoth} label="In beide Richtungen" />
          <Button type="submit" variant="outline" size="sm" className="w-full" loading={busy === 'rule'} disabled={!giver || !receiver}>
            <Plus className="size-4" /> Ausnahme hinzufügen
          </Button>
        </form>
      ) : null}

      {lastYear.length > 0 ? (
        <div className="mt-6 rounded-2xl bg-fir-500/10 p-4">
          <h3 className="flex items-center gap-1.5 font-bold text-fir-700">
            <History className="size-4" /> Wie im Vorjahr? Lieber nicht!
          </h3>
          <p className="mt-1 text-sm text-ink-700">
            Niemand zieht dieselbe Person wie letztes Jahr ({lastYear.length} {lastYear.length === 1 ? 'Regel' : 'Regeln'}). Wer
            wen hatte, bleibt natürlich geheim.
          </p>
          {!drawn ? (
            <TwoStepButton
              className="mt-3"
              loading={busy === 'lastyear'}
              confirmLabel="Ja, aufheben"
              onConfirm={() =>
                run('lastyear', async () => {
                  for (const e of lastYear) await api.admin.removeExclusion(token, e.id);
                }, 'Vorjahres-Regel aufgehoben')
              }
            >
              Diese Regel aufheben
            </TwoStepButton>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

function PersonSelect({
  label,
  placeholder = `${label} …`,
  value,
  onChange,
  options,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (id: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <select aria-label={label} className="input !min-h-11 !py-2 !pr-8 !pl-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

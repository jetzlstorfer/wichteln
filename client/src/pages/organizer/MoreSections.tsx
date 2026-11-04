import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { CalendarPlus, Settings, Trash2 } from 'lucide-react';
import { LIMITS, type AdminView } from '../../../../shared/types';
import { Button, ConfirmSheet, Field, Toggle, useToast } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { findRound, forgetRound, rememberRound } from '../../lib/storage';
import { Section } from './shared';

const parseBudget = (value: string): number | null | 'invalid' => {
  if (value.trim() === '') return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= LIMITS.maxBudget ? n : 'invalid';
};

export function SettingsSection({ view, token, reload }: { view: AdminView; token: string; reload: () => Promise<unknown> }) {
  const toast = useToast();
  const { group } = view;
  const initial = () => ({
    name: group.name,
    organizerName: group.organizerName,
    budget: group.budget === null ? '' : String(group.budget),
    exchangeDate: group.exchangeDate ?? '',
    message: group.message,
    allowSelfJoin: group.allowSelfJoin,
  });
  const [form, setForm] = useState(initial);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setForm(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group.name, group.organizerName, group.budget, group.exchangeDate, group.message, group.allowSelfJoin]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const budget = parseBudget(form.budget);
    if (budget === 'invalid') {
      toast('Bitte ein Budget zwischen 0 und 10.000 € angeben – oder leer lassen.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.admin.update(token, {
        name: form.name.trim(),
        organizerName: form.organizerName.trim(),
        budget,
        exchangeDate: form.exchangeDate || null,
        message: form.message.trim(),
        allowSelfJoin: form.allowSelfJoin,
      });
      toast('Gespeichert');
      setOpen(false);
      await reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Section
      id="einstellungen"
      title="Einstellungen"
      icon={<Settings className="size-5 text-ink-500" />}
      action={
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Schließen' : 'Bearbeiten'}
        </Button>
      }
    >
      {open ? (
        <form onSubmit={save} className="space-y-4">
          <Field label="Name der Runde" htmlFor="s-name">
            <input id="s-name" className="input" required maxLength={LIMITS.groupName} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Organisiert von" htmlFor="s-orga">
            <input
              id="s-orga"
              className="input"
              required
              maxLength={LIMITS.personName}
              value={form.organizerName}
              onChange={(e) => set('organizerName', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget (€)" htmlFor="s-budget">
              <input
                id="s-budget"
                className="input"
                inputMode="numeric"
                value={form.budget}
                onChange={(e) => set('budget', e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="kein fixes"
              />
            </Field>
            <Field label="Bescherung" htmlFor="s-date">
              <input id="s-date" type="date" className="input" value={form.exchangeDate} onChange={(e) => set('exchangeDate', e.target.value)} />
            </Field>
          </div>
          <Field label="Nachricht an alle" htmlFor="s-message">
            <textarea
              id="s-message"
              className="input"
              rows={3}
              maxLength={LIMITS.message}
              value={form.message}
              onChange={(e) => set('message', e.target.value)}
            />
          </Field>
          <Toggle
            checked={form.allowSelfJoin}
            onChange={(v) => set('allowSelfJoin', v)}
            label="Neue Namen dürfen sich selbst eintragen"
            description="Geht nur bis zur Auslosung."
          />
          <Button type="submit" className="w-full" loading={saving}>
            Speichern
          </Button>
        </form>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink-500">Budget</dt>
          <dd className="font-bold">{group.budget === null ? 'kein fixes' : `${group.budget} €`}</dd>
          <dt className="text-ink-500">Selbst eintragen</dt>
          <dd className="font-bold">{group.allowSelfJoin ? 'erlaubt' : 'nicht erlaubt'}</dd>
        </dl>
      )}
    </Section>
  );
}

const suggestNextName = (name: string, year: number) =>
  /\b20\d\d\b/.test(name) ? name.replace(/\b20\d\d\b/, String(year)) : `${name} ${year}`;

export function NextRoundSection({ view, token }: { view: AdminView; token: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const baseYear = Number((view.group.exchangeDate ?? view.today).slice(0, 4));
  const [name, setName] = useState(() => suggestNextName(view.group.name, baseYear + 1).slice(0, LIMITS.groupName));
  const [date, setDate] = useState(`${baseYear + 1}-12-24`);
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.admin.nextRound(token, { name: name.trim(), exchangeDate: date || null });
      const organizerName = view.group.organizerName;
      rememberRound({
        kind: 'orga',
        token: res.adminToken,
        groupName: name.trim(),
        personName: organizerName,
        selfToken: res.participantToken ?? undefined,
      });
      if (res.participantToken) rememberRound({ kind: 'w', token: res.participantToken, groupName: name.trim(), personName: organizerName });
      toast('Neue Runde angelegt – schick der Familie den neuen Einladungslink!');
      navigate(`/orga/${res.adminToken}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      id="naechstes-jahr"
      title="Nächstes Jahr wieder?"
      icon={<CalendarPlus className="size-5 text-fir-500" />}
      intro="Gleiche Familie, neue Runde: Personen, Paare und Ausnahmen werden übernommen – und niemand zieht dieselbe Person wie heuer."
    >
      <form onSubmit={create} className="space-y-3">
        <Field label="Name der neuen Runde" htmlFor="n-name">
          <input id="n-name" className="input" required maxLength={LIMITS.groupName} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Bescherung" htmlFor="n-date">
          <input id="n-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Button type="submit" variant="fir" className="w-full" loading={busy}>
          Neue Runde anlegen
        </Button>
      </form>
    </Section>
  );
}

export function DangerSection({ view, token }: { view: AdminView; token: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api.admin.remove(token);
      const saved = findRound('orga', token);
      if (saved?.selfToken) forgetRound('w', saved.selfToken);
      forgetRound('orga', token);
      toast('Die Runde wurde gelöscht.');
      navigate('/', { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 text-center">
      <Button variant="ghost-light" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Runde löschen
      </Button>
      <ConfirmSheet
        open={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={remove}
        loading={busy}
        title={`„${view.group.name}“ löschen?`}
        confirmLabel="Endgültig löschen"
        variant="berry"
      >
        <p>
          Alle Namen, Wunschzettel, Nachrichten und die Auslosung werden sofort und endgültig gelöscht. Alle Links funktionieren
          danach nicht mehr.
        </p>
      </ConfirmSheet>
    </div>
  );
}

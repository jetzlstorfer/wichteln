import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles } from 'lucide-react';
import { LIMITS } from '../../../shared/types';
import { Footer, TopBar } from '../components/Layout';
import { Button, Field, Toggle, useToast } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { defaultExchangeDate, todayLocalIso } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import { rememberRound } from '../lib/storage';

const BUDGET_PRESETS = [20, 30, 50];

export function CreateRound() {
  useDocumentTitle('Neue Runde');
  const navigate = useNavigate();
  const toast = useToast();
  const exchangeDefault = defaultExchangeDate();
  const [name, setName] = useState(`Familienwichteln ${exchangeDefault.slice(0, 4)}`);
  const [organizerName, setOrganizerName] = useState('');
  const [participates, setParticipates] = useState(true);
  const [budget, setBudget] = useState('30');
  const [exchangeDate, setExchangeDate] = useState(exchangeDefault);
  const [message, setMessage] = useState('');
  const [allowSelfJoin, setAllowSelfJoin] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const budgetValue = budget.trim() === '' ? null : Math.round(Number(budget));
    if (budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 0 || budgetValue > LIMITS.maxBudget)) {
      toast('Bitte ein Budget zwischen 0 und 10.000 € angeben – oder leer lassen.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.createGroup({
        name: name.trim(),
        organizerName: organizerName.trim(),
        participates,
        budget: budgetValue,
        exchangeDate: exchangeDate || null,
        message: message.trim(),
        allowSelfJoin,
      });
      rememberRound({
        kind: 'orga',
        token: res.adminToken,
        groupName: name.trim(),
        personName: organizerName.trim(),
        selfToken: res.participantToken ?? undefined,
      });
      if (res.participantToken) {
        rememberRound({ kind: 'w', token: res.participantToken, groupName: name.trim(), personName: organizerName.trim() });
      }
      navigate(`/orga/${res.adminToken}`, { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <TopBar back={{ to: '/', label: 'Zurück' }} />
      <div className="mt-2 mb-6 flex items-end gap-4 animate-fade-up">
        <img src="/img/brief-256.webp" alt="" width={256} height={234} className="h-20 w-auto -rotate-6 drop-shadow-xl" />
        <div>
          <p className="font-hand text-xl text-gold-300">Schritt 1</p>
          <h1 className="text-3xl font-bold text-cream-50">Neue Wichtel-Runde</h1>
        </div>
      </div>

      <form onSubmit={submit} className="card space-y-5 animate-fade-up">
        <Field label="Wie heißt eure Runde?" htmlFor="name">
          <input
            id="name"
            className="input"
            required
            maxLength={LIMITS.groupName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`z. B. Familie Huber ${exchangeDefault.slice(0, 4)}`}
            autoComplete="off"
          />
        </Field>

        <Field label="Dein Name" htmlFor="organizer" hint="So sehen dich die anderen in der Einladung.">
          <input
            id="organizer"
            className="input"
            required
            maxLength={LIMITS.personName}
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
            placeholder="z. B. Mama Andrea"
            autoComplete="given-name"
          />
        </Field>

        <Toggle
          checked={participates}
          onChange={setParticipates}
          label="Ich mache selbst mit"
          description="Auch als Organisator:in siehst du nur deine eigene Zuteilung. Die gemeinsame Auflösung braucht die Zustimmung aller."
        />

        <hr className="border-cream-300" />

        <Field label="Budget pro Packerl" htmlFor="budget" hint="Leer lassen, wenn es kein fixes Budget gibt.">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                id="budget"
                className="input pr-10"
                inputMode="numeric"
                pattern="[0-9]*"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="z. B. 30"
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-bold text-ink-500">€</span>
            </div>
            {BUDGET_PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setBudget(String(value))}
                className={`min-h-12 rounded-2xl px-3 font-bold transition ${
                  budget === String(value) ? 'bg-fir-500 text-cream-50' : 'bg-cream-200 text-ink-700 hover:bg-cream-300'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Wann ist Bescherung?" htmlFor="date">
          <input
            id="date"
            type="date"
            className="input"
            value={exchangeDate}
            min={todayLocalIso()}
            onChange={(e) => setExchangeDate(e.target.value)}
          />
        </Field>

        <Field label="Ein paar Worte an alle (optional)" htmlFor="message" hint="Steht in der Einladung – z. B. wo ihr feiert.">
          <textarea
            id="message"
            className="input"
            maxLength={LIMITS.message}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Liebe Familie! Heuer wichteln wir wieder. Bescherung ist bei Oma in Krems. 🎄"
            rows={3}
          />
        </Field>

        <Toggle
          checked={allowSelfJoin}
          onChange={setAllowSelfJoin}
          label="Neue Namen dürfen sich selbst eintragen"
          description="Neue Personen bekommen direkt ihren persönlichen Link. Geht nur bis zur Auslosung."
        />

        <Button type="submit" className="w-full text-lg" loading={busy}>
          <Sparkles className="size-5" /> Runde erstellen
        </Button>
      </form>
      <Footer />
    </main>
  );
}

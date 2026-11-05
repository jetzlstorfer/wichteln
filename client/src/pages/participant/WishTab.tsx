import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { LIMITS } from '../../../../shared/types';
import { Button, Field, useToast } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import type { TabProps } from './Participant';
import { WishLine } from './WichtelTab';

const IDEAS = ['Eine Überraschung 🎁', 'Etwas Selbstgemachtes', 'Ein gutes Buch', 'Zeit miteinander ☕', 'Etwas Süßes 🍫'];

export function WishTab({ data, token, update }: TabProps) {
  const toast = useToast();
  const { me } = data;
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const full = me.wishes.length >= LIMITS.wishes;

  const add = async (e?: FormEvent, preset?: string) => {
    e?.preventDefault();
    const wishText = (preset ?? text).trim();
    if (!wishText) return;
    setAdding(true);
    try {
      const wish = await api.me.addWish(token, { text: wishText, url: preset ? null : url.trim() || null });
      update((d) => ({ ...d, me: { ...d.me, wishes: [...d.me.wishes, wish] } }));
      if (!preset) {
        setText('');
        setUrl('');
        setShowUrl(false);
        textRef.current?.focus();
      }
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await api.me.removeWish(token, id);
      update((d) => ({ ...d, me: { ...d.me, wishes: d.me.wishes.filter((w) => w.id !== id) } }));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-4">
      <header className="mt-2 flex items-end gap-3 animate-fade-up">
        <img src="/img/brief-256.webp" alt="" width={256} height={234} className="h-24 w-auto -rotate-6 drop-shadow-xl" />
        <div className="pb-1">
          <h1 className="text-3xl font-bold text-cream-50">Mein Brief ans Christkind</h1>
        </div>
      </header>
      <p className="text-cream-200/90">
        Was wünschst du dir heuer? Dein Christkind sieht deinen Wunschzettel – du aber nicht, wer es ist. Alles ist freiwillig.
      </p>

      <section className="card" aria-labelledby="wishes-title">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="wishes-title" className="text-xl font-bold">
            Meine Wünsche
          </h2>
          <span className="text-sm font-bold text-ink-500">
            {me.wishes.length}/{LIMITS.wishes}
          </span>
        </div>

        {me.wishes.length ? (
          <ul className="mt-3 space-y-2">
            {me.wishes.map((w) => (
              <WishLine
                key={w.id}
                wish={w}
                action={
                  <button
                    type="button"
                    className="icon-btn -mr-2 shrink-0 text-ink-300 hover:text-berry-500"
                    aria-label={`„${w.text}“ streichen`}
                    disabled={removing === w.id}
                    onClick={() => remove(w.id)}
                  >
                    <Trash2 className="size-4.5" />
                  </button>
                }
              />
            ))}
          </ul>
        ) : (
          <div className="mt-3 rounded-2xl border-2 border-dashed border-cream-300 p-4 text-center">
            <p className="text-ink-500">Noch leer. Ein paar Ideen zum Antippen:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  disabled={adding}
                  onClick={() => add(undefined, idea)}
                  className="chip min-h-9 bg-gold-100 text-ink-700 ring-1 ring-gold-300 hover:bg-gold-200"
                >
                  <Plus className="size-3.5" /> {idea}
                </button>
              ))}
            </div>
          </div>
        )}

        {full ? (
          <p className="mt-4 rounded-xl bg-gold-100 p-3 text-sm text-ink-700">
            {LIMITS.wishes} Wünsche – mehr passen nicht auf den Zettel. Das Christkind hat ja nur zwei Hände!
          </p>
        ) : (
          <form onSubmit={add} className="mt-4 space-y-3">
            <Field label="Neuer Wunsch" htmlFor="wish-text">
              <input
                ref={textRef}
                id="wish-text"
                className="input"
                value={text}
                maxLength={LIMITS.wishText}
                onChange={(e) => setText(e.target.value)}
                placeholder="z. B. Kuschelsocken in Größe 39"
                autoComplete="off"
                enterKeyHint="done"
              />
            </Field>
            {showUrl ? (
              <Field label="Link (optional)" htmlFor="wish-url" hint="Zum Beispiel zu einem Online-Shop.">
                <input
                  id="wish-url"
                  className="input"
                  type="url"
                  inputMode="url"
                  value={url}
                  maxLength={LIMITS.wishUrl}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  autoComplete="off"
                  autoCapitalize="none"
                />
              </Field>
            ) : (
              <button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-fir-500" onClick={() => setShowUrl(true)}>
                <Link2 className="size-4" /> Link hinzufügen
              </button>
            )}
            <Button type="submit" className="w-full" loading={adding} disabled={!text.trim()}>
              <Plus className="size-5" /> Auf den Wunschzettel
            </Button>
          </form>
        )}
      </section>

      <AboutCard data={data} token={token} update={update} />
    </div>
  );
}

function AboutCard({ data, token, update }: Omit<TabProps, 'reload'>) {
  const toast = useToast();
  const saved = data.me.about;
  const [about, setAbout] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = about.trim() !== saved.trim();

  // Pick up changes from another device, unless the user is typing.
  const lastSaved = useRef(saved);
  useEffect(() => {
    if (saved !== lastSaved.current) {
      setAbout((current) => (current.trim() === lastSaved.current.trim() ? saved : current));
      lastSaved.current = saved;
    }
  }, [saved]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const value = about.trim();
      await api.me.update(token, { about: value });
      lastSaved.current = value;
      update((d) => ({ ...d, me: { ...d.me, about: value } }));
      setAbout(value);
      toast('Gespeichert – dein Christkind freut sich über jeden Tipp!');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <h2 className="text-xl font-bold">Kleine Tipps für dein Christkind</h2>
      <p className="mt-1 text-sm text-ink-500">Größen, Lieblingsfarbe, was du sammelst – oder was du gar nicht magst.</p>
      <form onSubmit={save} className="mt-3 space-y-3">
        <label htmlFor="about" className="sr-only">
          Tipps für dein Christkind
        </label>
        <textarea
          id="about"
          className="input"
          rows={4}
          maxLength={LIMITS.about}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder="z. B. Schuhgröße 39, mag Zimt & Orange, bitte keine Duftkerzen 🙂"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-300">
            {about.length}/{LIMITS.about}
          </span>
          <Button type="submit" size="sm" variant="fir" loading={saving} disabled={!dirty}>
            Speichern
          </Button>
        </div>
      </form>
    </section>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Crown, EyeOff, Gift, HeartHandshake, MessageCircleQuestion, Smartphone, Trash2 } from 'lucide-react';
import { Footer, TopBar } from '../components/Layout';
import { ConfirmSheet } from '../components/ui';
import { forgetRound, listRounds, type SavedRound } from '../lib/storage';
import { useDocumentTitle } from '../lib/hooks';

const STEPS = [
  {
    img: '/img/brief-256.webp',
    w: 256,
    h: 234,
    title: 'Runde anlegen',
    text: 'Gib der Runde einen Namen, trag die Familie ein und markier, wer ein Paar ist.',
  },
  {
    img: '/img/glocke-256.webp',
    w: 159,
    h: 256,
    title: 'Link in die Familiengruppe',
    text: 'Ein Link für alle. Jede:r wählt den Namen und zeigt den Code persönlich am eigenen Handy vor.',
  },
  {
    img: '/img/packerl-256.webp',
    w: 251,
    h: 256,
    title: 'Das Christkind lost aus',
    text: 'Geheim und fair: Paare ziehen sich nie, und auf Wunsch auch nicht dieselben wie letztes Jahr.',
  },
  {
    img: '/img/adventkranz-256.webp',
    w: 256,
    h: 225,
    title: 'Wünschen, fragen, freuen',
    text: 'Wunschzettel schreiben, anonym Fragen stellen und jeden Tag ein Adventkalender-Türchen öffnen.',
  },
];

const FEATURES = [
  { icon: Smartphone, title: 'Ohne Passwort', text: 'Einmal vor Ort bestätigen, danach dein privater Link.' },
  { icon: HeartHandshake, title: 'Paare ziehen sich nie', text: 'Und eigene Ausnahmen gehen auch.' },
  { icon: EyeOff, title: 'Deine Zuteilung', text: 'Kein Organisator-Zugriff auf fremde persönliche Links.' },
  { icon: MessageCircleQuestion, title: 'Anonyme Fragen', text: '„Welche Größe hast du?“ – ohne sich zu verraten.' },
];

export function Home() {
  useDocumentTitle(null);
  const [rounds, setRounds] = useState(listRounds);
  const [forgetting, setForgetting] = useState<SavedRound | null>(null);

  return (
    <>
      <div className="relative z-[1]">
        <div className="relative mx-auto max-w-5xl overflow-hidden">
          <img
            src="/img/hero-768.webp"
            srcSet="/img/hero-768.webp 768w, /img/hero-1280.webp 1280w, /img/hero-1536.webp 1536w"
            sizes="(min-width: 1024px) 1024px, 100vw"
            width={1536}
            height={1024}
            alt="Das Christkind fliegt mit einer Sternlaterne über ein verschneites Alpendorf"
            fetchPriority="high"
            className="h-[min(62vh,34rem)] w-full object-cover object-[50%_35%] sm:rounded-b-[2.5rem]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-night-900/40 via-transparent to-night-900" />
          <div className="absolute inset-x-0 top-0">
            <div className="page !pb-0">
              <TopBar />
            </div>
          </div>
        </div>
        <main className="page -mt-28 sm:-mt-32">
          <div className="text-center animate-fade-up">
            <p className="font-hand text-2xl text-gold-300">Heuer wird gewichtelt!</p>
            <h1 className="mt-1 text-4xl leading-tight font-bold text-cream-50 drop-shadow-[0_2px_12px_rgb(7_15_36/0.8)] sm:text-5xl">
              Wichteln mit dem <span className="gold-text">Christkind</span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-lg text-cream-200">
              Geheim auslosen, Wunschzettel schreiben und Packerl schenken – das Familien-Wichteln fürs Handy.
            </p>
            <Link to="/neu" className="btn btn-primary mt-6 w-full max-w-sm text-lg">
              <Gift className="size-5" /> Neue Wichtel-Runde starten
            </Link>
            <p className="mt-3 text-sm text-cream-200/80">Kostenlos · ohne Passwort · persönlich bestätigt</p>
          </div>

          {rounds.length > 0 ? (
            <section className="mt-10 animate-fade-up" aria-labelledby="my-rounds">
              <h2 id="my-rounds" className="mb-3 text-xl font-bold text-cream-50">
                Deine Runden auf diesem Handy
              </h2>
              <ul className="space-y-2">
                {rounds.map((r) => (
                  <li key={`${r.kind}-${r.token}`} className="flex items-stretch gap-1">
                    <Link
                      to={r.kind === 'orga' ? `/orga/${r.token}` : `/w/${r.token}`}
                      className="card-dark flex flex-1 items-center gap-3 !py-3 transition hover:bg-night-700/80"
                    >
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-full ${
                          r.kind === 'orga' ? 'bg-gold-400/20 text-gold-300' : 'bg-berry-500/25 text-berry-400'
                        }`}
                      >
                        {r.kind === 'orga' ? <Crown className="size-5" /> : <Gift className="size-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-cream-50">{r.groupName}</span>
                        <span className="block truncate text-sm text-cream-200/80">
                          {r.kind === 'orga' ? 'Organisieren' : `Mein Wichtel-Packerl${r.personName ? ` · ${r.personName}` : ''}`}
                        </span>
                      </span>
                      <ChevronRight className="size-5 text-cream-200/60" />
                    </Link>
                    <button
                      type="button"
                      className="icon-btn self-center text-cream-200/60 hover:bg-white/10 hover:text-cream-100"
                      aria-label={`${r.groupName} von diesem Handy entfernen`}
                      onClick={() => setForgetting(r)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-12" aria-labelledby="how">
            <h2 id="how" className="text-center text-2xl font-bold text-cream-50">
              So funktioniert’s
            </h2>
            <ol className="mt-5 space-y-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="card flex items-center gap-4 !p-4">
                  <img src={step.img} alt="" width={step.w} height={step.h} loading="lazy" className="h-16 w-16 shrink-0 object-contain" />
                  <div>
                    <h3 className="font-bold">
                      <span className="mr-1.5 text-gold-600">{i + 1}.</span>
                      {step.title}
                    </h3>
                    <p className="text-sm text-ink-700">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-10 grid grid-cols-2 gap-3" aria-label="Was die App kann">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card-dark !p-4">
                <Icon className="size-6 text-gold-300" aria-hidden />
                <h3 className="mt-2 font-sans text-base font-extrabold text-cream-50">{title}</h3>
                <p className="mt-0.5 text-sm text-cream-200/85">{text}</p>
              </div>
            ))}
          </section>

          <section className="card mt-10 text-center">
            <p className="font-hand text-3xl leading-tight text-berry-600">„Das Christkind bringt die Packerl – du hilfst ihm dabei.“</p>
            <p className="mt-2 text-sm text-ink-500">
              Bei uns in Österreich kommt am Heiligen Abend nicht der Weihnachtsmann, sondern das Christkind. Beim Wichteln
              darf jede:r einmal Christkind sein.
            </p>
          </section>

          <Footer />
        </main>
      </div>

      <ConfirmSheet
        open={forgetting !== null}
        onClose={() => setForgetting(null)}
        title="Von diesem Handy entfernen?"
        confirmLabel="Entfernen"
        variant="berry"
        onConfirm={() => {
          if (forgetting) forgetRound(forgetting.kind, forgetting.token);
          setRounds(listRounds());
          setForgetting(null);
        }}
      >
        <p>
          „{forgetting?.groupName}“ verschwindet nur aus dieser Liste. Die Runde selbst bleibt bestehen – mit dem Link kommst du
          jederzeit wieder hinein.
        </p>
      </ConfirmSheet>
    </>
  );
}

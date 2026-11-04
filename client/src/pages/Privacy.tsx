import { Footer, TopBar } from '../components/Layout';
import { useDocumentTitle } from '../lib/hooks';

export function Privacy() {
  useDocumentTitle('Datenschutz');
  return (
    <main className="page">
      <TopBar back={{ to: '/', label: 'Zurück' }} />
      <article className="card mt-2 space-y-4 leading-relaxed animate-fade-up [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold">
        <h1 className="text-3xl font-bold">Datenschutz</h1>
        <p>
          Diese Wichtel-App ist für Familien und Freundeskreise gedacht. Sie kommt ohne Konto, E-Mail-Adresse oder Passwort aus
          und speichert nur, was fürs Wichteln nötig ist.
        </p>

        <h2>Was gespeichert wird</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Name der Runde, Budget, Datum der Bescherung und die Nachricht der Organisator:in</li>
          <li>die eingetragenen Vornamen bzw. Spitznamen sowie Paare und Ausnahmen</li>
          <li>wer wen gezogen hat – das sieht niemand, bis die Organisator:in die Auflösung freigibt</li>
          <li>freiwillig: Wunschzettel, ein paar Worte über dich und die anonymen Nachrichten</li>
          <li>wann jemand zuletzt vorbeigeschaut hat und ob die eigene Zuteilung schon angesehen wurde</li>
        </ul>

        <h2>Was nicht gespeichert wird</h2>
        <p>
          Keine Cookies, kein Tracking, keine Werbung, keine Analyse-Tools und keine Weitergabe an Dritte. Auf deinem Handy merkt
          sich die App nur deine Links (im lokalen Speicher des Browsers), damit du deine Runden wiederfindest.
        </p>

        <h2>Deine Links sind deine Schlüssel</h2>
        <p>
          Wer einen persönlichen Link kennt, kann die zugehörige Seite öffnen. Gib ihn deshalb nicht weiter. Wenn ein Link in
          falsche Hände geraten ist, kann die Organisator:in ihn sperren und einen neuen erstellen.
        </p>

        <h2>Automatisches Löschen</h2>
        <p>
          Wunschzettel, Nachrichten und persönliche Notizen werden 60 Tage nach der Bescherung automatisch gelöscht. Die ganze
          Runde verschwindet spätestens etwas mehr als ein Jahr nach der Bescherung – genug Zeit, um sie fürs nächste Jahr zu
          übernehmen. Die Organisator:in kann die Runde jederzeit sofort löschen.
        </p>

        <h2>Fragen?</h2>
        <p>Wende dich bitte an die Person, die diese App für eure Familie betreibt.</p>
      </article>
      <Footer />
    </main>
  );
}

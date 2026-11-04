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
          <li>wer wen gezogen hat – jede Person sieht nur die eigene Zuteilung; eine gemeinsame Auflösung braucht die Zustimmung aller</li>
          <li>vorübergehende Bestätigungscodes (30 Minuten gültig) und der Zeitpunkt der persönlichen Prüfung</li>
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
          Wer einen persönlichen Link kennt, kann die zugehörige Seite öffnen. Gib ihn deshalb nicht weiter und sichere eine
          Kopie für dich. Die Organisator:in kann ihn weder abrufen noch ersetzen. Ohne gespeicherte Kopie ist keine
          Wiederherstellung möglich. Bei einem weitergegebenen Link müsst ihr die betroffene Runde löschen und neu starten.
        </p>

        <h2>Persönliche Bestätigung statt Namensraten</h2>
        <p>
          Der gemeinsame Einladungslink gibt allein keinen persönlichen Zugang. Zeig deinen Code direkt auf deinem eigenen
          Handy vor. Die Organisator:in prüft vor Ort, dass du die richtige Person bist, und bestätigt den Code.
          Nur dein Browser erhält danach den Zugang. Wir vertrauen dabei auf eine ehrliche persönliche Prüfung;
          die App kann die Identität nicht selbst erkennen. Screenshots und weitergeleitete Codes reichen dafür nicht.
        </p>
        <p>
          Das schützt vor Zugriffen über den Organisator-Link, ist aber keine Ende-zu-Ende-Verschlüsselung.
          Wer den Server oder die Datenbank betreibt, kann technisch auf die gespeicherten Zuteilungen zugreifen.
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

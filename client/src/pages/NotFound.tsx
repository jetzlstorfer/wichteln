import { Link } from 'react-router';
import { Footer, TopBar } from '../components/Layout';
import { ErrorState } from '../components/ui';
import { useDocumentTitle } from '../lib/hooks';

export function NotFound() {
  useDocumentTitle('Nicht gefunden');
  return (
    <main className="page">
      <TopBar />
      <ErrorState
        title="Hier ist nix unterm Christbaum"
        message="Diese Seite gibt es nicht. Vielleicht hat sich beim Link ein Tippfehler eingeschlichen?"
        action={
          <Link to="/" className="btn btn-primary">
            Zur Startseite
          </Link>
        }
      />
      <Footer />
    </main>
  );
}

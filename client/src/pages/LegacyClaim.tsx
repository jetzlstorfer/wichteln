import { Link, Navigate, useParams } from 'react-router';
import { Footer, TopBar } from '../components/Layout';
import { Button, ErrorState, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useDocumentTitle, useLoader } from '../lib/hooks';

export function LegacyClaim() {
  const { token = '' } = useParams();
  const { data, error, loading, reload } = useLoader(() => api.me.get(token), [token]);
  useDocumentTitle('Wichteln ohne Codes');
  if (loading) return <Spinner />;
  if (data) return <Navigate to={`/w/${token}`} replace />;
  const retryable = error && error.status !== 404;

  return (
    <main className="page">
      <TopBar />
      <ErrorState
        title={retryable ? 'Hoppala!' : 'Es geht jetzt ohne Codes!'}
        message={retryable ? error.message : 'Öffne den ursprünglichen Einladungslink aus eurer Familiengruppe und wähle deinen eigenen Namen. Du bekommst sofort deinen persönlichen Link.'}
        action={retryable
          ? <Button onClick={() => reload(false)}>Nochmal probieren</Button>
          : <Link className="btn btn-primary" to="/">Zur Startseite</Link>}
      />
      <Footer />
    </main>
  );
}

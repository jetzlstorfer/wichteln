import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { Footer, TopBar } from '../components/Layout';
import { Button, ErrorState, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useDocumentTitle, useLoader } from '../lib/hooks';
import { rememberRound } from '../lib/storage';

export function VerifyClaim() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useLoader(() => api.invite.claimStatus(token), [token], 10_000);
  useDocumentTitle('Persönlich bestätigen');

  useEffect(() => {
    if (data?.status !== 'verified' || error) return;
    rememberRound({ kind: 'w', token, groupName: data.groupName, personName: data.name, inviteCode: data.inviteCode });
    navigate(`/w/${token}`, { replace: true });
  }, [data, error, token, navigate]);

  if (loading && !data) return <Spinner label="Dein Bestätigungscode wird geladen …" />;

  return (
    <main className="page">
      <TopBar />
      {error || !data ? (
        <ErrorState
          message={error?.message ?? 'Diese Anfrage ist nicht mehr gültig.'}
          action={
            error?.status === 0 || error?.status === 429 || (error?.status ?? 0) >= 500 ? (
              <Button onClick={() => reload(false)}>Nochmal probieren</Button>
            ) : (
              <Link className="btn btn-primary" to={data ? `/einladung/${data.inviteCode}` : '/'}>
                {data ? 'Zurück zur Einladung' : 'Zur Startseite'}
              </Link>
            )
          }
        />
      ) : data.status === 'pending' ? (
        <section className="card mt-4 text-center animate-fade-up">
          <img src="/img/brief-256.webp" alt="" width={256} height={234} className="mx-auto h-28 w-auto" />
          <p className="mt-4 font-hand text-2xl text-berry-600">{data.groupName}</p>
          <h1 className="mt-2 text-3xl font-bold">Bist du {data.name}?</h1>
          <p className="mt-3 text-ink-700">
            Zeig der organisierenden Person diesen Code persönlich auf deinem eigenen Handy.
            Sie vergleicht deinen Namen und trägt den Code auf ihrer Seite ein.
          </p>
          <p className="mt-5 text-sm font-bold text-ink-500">Dein Bestätigungscode</p>
          <p className="mt-2 rounded-2xl bg-gold-100 px-2 py-4 font-mono text-3xl font-bold tracking-wider" aria-label="Bestätigungscode">
            {data.verificationCode.slice(0, 5)}-{data.verificationCode.slice(5)}
          </p>
          <p className="mt-2 text-sm text-ink-500">
            Gültig bis {new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' }).format(new Date(data.expiresAt))} Uhr.
          </p>
          <p role="status" className="mt-5 flex items-center justify-center gap-2 font-bold text-fir-600">
            <ShieldCheck className="size-5 shrink-0" /> Wartet auf persönliche Bestätigung
          </p>
          <p className="mt-2 text-sm text-ink-700">
            Lass diese Seite offen. Danach öffnet sich deine Wichtel-Seite automatisch.
            Zeig nur den Code, nicht die Adresse dieser Seite: Sie wird dein geheimer Link.
          </p>
          <Button className="mt-5 w-full" onClick={() => reload(false)} loading={loading}>Bestätigung prüfen</Button>
          <Link className="mt-4 inline-block text-sm font-bold text-fir-600 underline" to={`/einladung/${data.inviteCode}`}>
            Falscher Name? Zurück zur Einladung
          </Link>
        </section>
      ) : <Spinner label="Bestätigt! Deine Wichtel-Seite wird geöffnet …" />}
      <Footer />
    </main>
  );
}

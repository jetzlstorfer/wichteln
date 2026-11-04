import { Component, useEffect, type ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { Snow } from './components/Snow';
import { ErrorState, ToastProvider } from './components/ui';
import { Home } from './pages/Home';
import { CreateRound } from './pages/CreateRound';
import { Invite } from './pages/Invite';
import { VerifyClaim } from './pages/VerifyClaim';
import { Organizer } from './pages/organizer/Organizer';
import { Participant } from './pages/participant/Participant';
import { Privacy } from './pages/Privacy';
import { NotFound } from './pages/NotFound';

const TOKEN_ROUTE = /^\/(w|orga|einladung)\/([A-Za-z0-9_-]{8,64})/;

/** Scroll to top on navigation and let "Add to home screen" open the current round. */
function RouteEffects() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  useEffect(() => {
    const link = document.getElementById('manifest-link') as HTMLLinkElement | null;
    if (!link) return;
    const match = TOKEN_ROUTE.exec(pathname);
    link.href = match
      ? `/manifest.webmanifest?start=${encodeURIComponent(`/${match[1]}/${match[2]}`)}`
      : '/manifest.webmanifest';
  }, [pathname]);

  return null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page pt-10">
        <ErrorState
          message="Da ist dem Christkind etwas aus der Hand gefallen. Lade die Seite bitte neu."
          action={
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Neu laden
            </button>
          }
        />
      </main>
    );
  }
}

export function App() {
  return (
    <ToastProvider>
      <Snow />
      <RouteEffects />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/neu" element={<CreateRound />} />
          <Route path="/einladung/:code" element={<Invite />} />
          <Route path="/bestaetigen/:token" element={<VerifyClaim />} />
          <Route path="/orga/:token" element={<Organizer />} />
          <Route path="/w/:token/:tab?" element={<Participant />} />
          <Route path="/datenschutz" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </ToastProvider>
  );
}

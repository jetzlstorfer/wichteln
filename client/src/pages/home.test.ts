import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { SavedRound } from '../lib/storage';

vi.mock('../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/ui')>();
  return { ...actual, ToastProvider: ({ children }: { children: ReactNode }) => children };
});

function renderPage(path: string, rounds: SavedRound[] = []) {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => key === 'wichteln.rounds.v1' ? JSON.stringify(rounds) : null,
  });
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)));
}

afterEach(() => vi.unstubAllGlobals());

describe('the website', () => {
  it('keeps the round entry point and instructions without product or legal copy', () => {
    const html = renderPage('/');

    expect(html).toContain('href="/neu"');
    expect(html).toContain('Neue Wichtel-Runde starten');
    expect(html).toContain('So funktioniert’s');
    expect(html).toContain('Link in die Familiengruppe');
    expect(html).toContain('/img/hero-sky-768.webp');
    expect(html).toContain('/img/hero-flying-768.webp');
    expect(html).toContain('Hauptplatz von Freistadt');
    expect(html).toContain('hero-flight pointer-events-none absolute inset-0');
    expect(html).not.toMatch(/Kostenlos|ohne Passwort|persönlich bestätigt|Was die App kann|Datenschutz|Impressum|Mit Liebe gemacht/i);
  });

  it('keeps links to saved organizer and participant rounds', () => {
    const html = renderPage('/', [
      { kind: 'orga', token: 'organizer-token', groupName: 'Familie', savedAt: '2026-11-01T00:00:00.000Z' },
      { kind: 'w', token: 'participant-token', groupName: 'Freunde', personName: 'Alex', savedAt: '2026-11-02T00:00:00.000Z' },
    ]);

    expect(html).toContain('Deine Runden auf diesem Handy');
    expect(html).toContain('href="/orga/organizer-token"');
    expect(html).toContain('href="/w/participant-token"');
    expect(html).toContain('Mein Wichtel-Packerl');
    expect(html).toContain('Alex');
  });

  it('does not expose the removed legal pages or footer links', () => {
    for (const path of ['/datenschutz', '/impressum']) {
      const html = renderPage(path);
      expect(html).toContain('Hier ist nix unterm Christbaum');
      expect(html).not.toMatch(/Datenschutz|Impressum|Mit Liebe gemacht/i);
    }

    expect(renderPage('/neu')).not.toMatch(/Datenschutz|Impressum|Mit Liebe gemacht/i);
  });
});

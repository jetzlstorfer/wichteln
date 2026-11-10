import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminView, MeView } from '../../../shared/types';
import { DrawSection } from './organizer/DrawSection';
import { WichtelTab } from './participant/WichtelTab';

const participant: MeView = {
  me: {
    id: 'alex', name: 'Alex', about: '', giftStatus: 3, openedDoors: [], wishes: [],
    isOrganizer: true, revealSeen: true, revealConsent: false, linkReissuedAt: null,
  },
  group: {
    name: 'Familienrunde', organizerName: 'Alex', budget: 30, exchangeDate: '2026-12-24',
    message: '', drawn: true, revealed: false, participantCount: 3,
  },
  participants: [
    { id: 'alex', name: 'Alex', giftStatus: 3, isMe: true },
    { id: 'bea', name: 'Bea', giftStatus: 1, isMe: false },
    { id: 'chris', name: 'Chris', giftStatus: 0, isMe: false },
  ],
  recipient: { name: 'Bea', about: 'Liest gern', wishes: [{ id: 'wish', text: 'Ein gutes Buch', url: null }] },
  unread: { fromRecipient: 0, fromChristkind: 0 },
  today: '2026-11-05',
};

const organizer: AdminView = {
  group: {
    ...participant.group,
    id: 'round', inviteCode: 'family-invite', allowSelfJoin: false,
    drawnAt: '2026-11-05T12:00:00.000Z', createdAt: '2026-11-01T12:00:00.000Z', hasPreviousRound: false,
  },
  participants: participant.participants.map((p) => ({
    id: p.id, name: p.name, claimed: true, lastSeenAt: null, revealSeen: true,
    partnerId: null, wishCount: 0, hasAbout: false, giftStatus: p.giftStatus, isOrganizer: p.isMe, linkReissuedAt: null,
  })),
  exclusions: [],
  revealConsentCount: 0,
  today: participant.today,
};

const publishedPairs = [
  { giver: 'Alex', receiver: 'Bea' },
  { giver: 'Bea', receiver: 'Chris' },
  { giver: 'Chris', receiver: 'Alex' },
];

beforeEach(() => {
  vi.stubGlobal('window', {
    location: { origin: 'https://wichteln.test' },
    matchMedia: () => ({ matches: false }),
  });
  vi.stubGlobal('navigator', { userAgent: 'test', maxTouchPoints: 0 });
  vi.stubGlobal('localStorage', { getItem: () => null });
});

afterEach(() => vi.unstubAllGlobals());

function render(content: ReactNode) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, content));
}

function renderParticipant(data: MeView) {
  return render(createElement(WichtelTab, {
    data, token: 'participant-token', update: vi.fn(), reload: async () => undefined,
  }));
}

function renderDraw(view: AdminView) {
  return render(createElement(DrawSection, {
    view, token: 'organizer-token', reload: async () => undefined,
  }));
}

describe('simplified participant page', () => {
  it('keeps the waiting state, family list and wishlist link before drawing', () => {
    const html = renderParticipant({
      ...participant,
      group: { ...participant.group, drawn: false },
      recipient: null,
    });

    expect(html).toContain('Das Christkind wartet noch');
    expect(html).toContain('Wer mitmacht (3)');
    expect(html).toContain('href="/w/participant-token/wunschzettel"');
    expect(html).not.toMatch(/Wie weit ist dein Packerl|Nach der Bescherung|Zustimmung/);
  });

  it.each([
    { revealSeen: false, revealConsent: false },
    { revealSeen: true, revealConsent: false },
    { revealSeen: true, revealConsent: true },
  ])('removes progress and consent sections with revealSeen=$revealSeen and revealConsent=$revealConsent', (state) => {
    const html = renderParticipant({ ...participant, me: { ...participant.me, ...state } });

    expect(html).not.toMatch(/Wie weit ist dein Packerl|Packerln eingepackt|Nach der Bescherung|Zustimmung/);
    expect(html).toContain('Das ist dein persönlicher Link');
    if (state.revealSeen) {
      expect(html).toContain('Du bist das Christkind für');
      expect(html).toContain('Ein gutes Buch');
      expect(html).toContain('href="/w/participant-token/nachrichten"');
    } else {
      expect(html).toContain('Packerl öffnen und sehen, wen du beschenkst');
      expect(html).not.toContain('Ein gutes Buch');
    }
  });

  it('keeps already published results readable without bringing back the removed sections', () => {
    const html = renderParticipant({
      ...participant,
      group: { ...participant.group, revealed: true },
      reveal: publishedPairs,
    });

    expect(html).toContain('Die Auflösung');
    expect(html).toContain('Dein Christkind war');
    expect(html).toContain('Chris');
    expect(html).not.toMatch(/Wie weit ist dein Packerl|Nach der Bescherung|Zustimmung/);
  });
});

describe('simplified organizer draw section', () => {
  it('keeps the draw action before drawing', () => {
    const html = renderDraw({ ...organizer, group: { ...organizer.group, drawn: false, drawnAt: null } });

    expect(html).toContain('Jetzt auslosen');
    expect(html).not.toMatch(/So weit sind die Packerl|Auflösung|Zustimmung/);
  });

  it('enables drawing with unclaimed people and warns that they will still be included', () => {
    const html = renderDraw({
      ...organizer,
      group: { ...organizer.group, drawn: false, drawnAt: null },
      participants: organizer.participants.map((p) => ({ ...p, claimed: false })),
    });

    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>[\s\S]*?Jetzt auslosen/);
    expect(html).toContain('3 Personen haben');
    expect(html).toContain('Sie werden trotzdem einbezogen');
    expect(html).toContain('können ihren Namen auch danach auswählen');
  });

  it('still disables drawing with fewer than three people', () => {
    const html = renderDraw({
      ...organizer,
      group: { ...organizer.group, drawn: false, drawnAt: null },
      participants: organizer.participants.slice(0, 2),
    });

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Jetzt auslosen/);
    expect(html).toContain('mindestens 3 Personen');
  });

  it.each([0, 3])('removes progress counters and publication controls with %i prior consents', (revealConsentCount) => {
    const html = renderDraw({ ...organizer, revealConsentCount });

    expect(html).toContain('haben schon nachgeschaut');
    expect(html).toContain('Neu auslosen');
    expect(html).not.toMatch(/So weit sind die Packerl|Auflösung|Nach der Bescherung|zugestimmt/);
  });

  it('keeps already published results read-only', () => {
    const html = renderDraw({
      ...organizer,
      group: { ...organizer.group, revealed: true },
      revealConsentCount: 3,
      reveal: publishedPairs,
    });

    expect(html).toContain('Auflösung');
    expect(html).toContain('wer wessen Christkind war');
    expect(html).toContain('Chris');
    expect(html).not.toMatch(/So weit sind die Packerl|Auflösung zeigen|Nach der Bescherung/);
  });
});

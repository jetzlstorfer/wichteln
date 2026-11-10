import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InviteView } from '../../../shared/types';
import { useLoader } from '../lib/hooks';
import { Invite } from './Invite';

vi.mock('../lib/hooks', () => ({
  useLoader: vi.fn(),
  useDocumentTitle: vi.fn(),
}));

afterEach(() => vi.unstubAllGlobals());

describe('invitation after drawing', () => {
  it('keeps free names claimable and claimed names locked without allowing self-join', () => {
    const data: InviteView = {
      group: {
        name: 'Familie', organizerName: 'Alex', budget: null, exchangeDate: null,
        message: '', drawn: true, revealed: false, participantCount: 3, allowSelfJoin: false,
      },
      participants: [
        { id: 'alex', name: 'Alex', claimed: true },
        { id: 'bea', name: 'Bea', claimed: false },
        { id: 'chris', name: 'Chris', claimed: false },
      ],
    };
    vi.mocked(useLoader).mockReturnValue({
      data, error: null, loading: false, reload: vi.fn(), setData: vi.fn(),
    });
    vi.stubGlobal('localStorage', { getItem: () => null });
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Invite)));
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)!;

    expect(buttons.find((button) => button.includes('Bea'))).not.toContain('disabled');
    expect(buttons.find((button) => button.includes('Chris'))).not.toContain('disabled');
    expect(buttons.find((button) => button.includes('Alex'))).toContain('disabled');
    expect(html).toContain('Deine Zuteilung steht bereits fest');
    expect(html).not.toContain('id="join-name"');
  });
});

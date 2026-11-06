import type {
  AdminView,
  ChatMessage,
  ClaimResponse,
  CreateGroupResponse,
  InviteView,
  MeView,
  MessagesView,
  Wish,
} from '../../../shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'offline', 'Keine Verbindung – bist du gerade online?');
  }
  if (!res.ok) {
    let data: { error?: string; message?: string; details?: unknown } | null = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? 'Da ist etwas schiefgegangen. Bitte nochmal probieren.', data?.details);
  }
  return (await res.json()) as T;
}

const e = encodeURIComponent;

export interface GroupSettings {
  name?: string;
  organizerName?: string;
  budget?: number | null;
  exchangeDate?: string | null;
  message?: string;
  allowSelfJoin?: boolean;
}

export const api = {
  createGroup: (body: Required<Pick<GroupSettings, 'name' | 'organizerName'>> & GroupSettings & { participates: boolean }) =>
    request<CreateGroupResponse>('POST', '/groups', body),

  admin: {
    get: (t: string) => request<AdminView>('GET', `/admin/${e(t)}`),
    update: (t: string, body: GroupSettings) => request<{ ok: true }>('PATCH', `/admin/${e(t)}`, body),
    remove: (t: string) => request<{ ok: true }>('DELETE', `/admin/${e(t)}`),
    addParticipant: (t: string, name: string) => request<{ id: string }>('POST', `/admin/${e(t)}/participants`, { name }),
    updateParticipant: (t: string, id: string, body: { name?: string; partnerId?: string | null }) =>
      request<{ ok: true }>('PATCH', `/admin/${e(t)}/participants/${e(id)}`, body),
    removeParticipant: (t: string, id: string) => request<{ ok: true }>('DELETE', `/admin/${e(t)}/participants/${e(id)}`),
    reissueLink: (t: string, id: string) => request<ClaimResponse>('POST', `/admin/${e(t)}/participants/${e(id)}/reissue-link`),
    addExclusion: (t: string, body: { giverId: string; receiverId: string; both: boolean }) =>
      request<{ ok: true }>('POST', `/admin/${e(t)}/exclusions`, body),
    removeExclusion: (t: string, id: string) => request<{ ok: true }>('DELETE', `/admin/${e(t)}/exclusions/${e(id)}`),
    draw: (t: string) => request<{ ok: true; mutualPairs: number }>('POST', `/admin/${e(t)}/draw`),
    resetDraw: (t: string) => request<{ ok: true }>('POST', `/admin/${e(t)}/draw/reset`),
    nextRound: (t: string, body: { name: string; exchangeDate?: string | null; budget?: number | null }) =>
      request<CreateGroupResponse>('POST', `/admin/${e(t)}/next-round`, body),
  },

  invite: {
    get: (code: string) => request<InviteView>('GET', `/invite/${e(code)}`),
    claim: (code: string, participantId: string) => request<ClaimResponse>('POST', `/invite/${e(code)}/claim`, { participantId }),
    join: (code: string, name: string) => request<ClaimResponse>('POST', `/invite/${e(code)}/join`, { name }),
  },

  me: {
    get: (t: string) => request<MeView>('GET', `/me/${e(t)}`),
    update: (t: string, body: { about?: string }) => request<{ ok: true }>('PATCH', `/me/${e(t)}`, body),
    addWish: (t: string, body: { text: string; url?: string | null }) => request<Wish>('POST', `/me/${e(t)}/wishes`, body),
    removeWish: (t: string, id: string) => request<{ ok: true }>('DELETE', `/me/${e(t)}/wishes/${e(id)}`),
    revealSeen: (t: string) => request<{ ok: true }>('POST', `/me/${e(t)}/reveal-seen`),
    openDoor: (t: string, day: number) => request<{ openedDoors: number[] }>('POST', `/me/${e(t)}/doors`, { day }),
    messages: (t: string) => request<MessagesView>('GET', `/me/${e(t)}/messages`),
    send: (t: string, to: 'recipient' | 'christkind', body: string) =>
      request<ChatMessage>('POST', `/me/${e(t)}/messages`, { to, body }),
  },
};

export const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Da ist etwas schiefgegangen. Bitte nochmal probieren.';

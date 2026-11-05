// Types shared between the API server and the web client.

/** 0 = noch nichts, 1 = Idee gefunden, 2 = besorgt, 3 = eingepackt */
export type GiftStatus = 0 | 1 | 2 | 3;

export type ExclusionReason = 'custom' | 'lastyear';

export interface Wish {
  id: string;
  text: string;
  url: string | null;
}

export interface GroupInfo {
  name: string;
  organizerName: string;
  budget: number | null;
  /** ISO date YYYY-MM-DD (Europe/Vienna) */
  exchangeDate: string | null;
  message: string;
  drawn: boolean;
  revealed: boolean;
  participantCount: number;
}

export interface RevealPair {
  giver: string;
  receiver: string;
}

export interface AdminParticipant {
  id: string;
  name: string;
  claimed: boolean;
  lastSeenAt: string | null;
  revealSeen: boolean;
  partnerId: string | null;
  wishCount: number;
  hasAbout: boolean;
  giftStatus: GiftStatus;
  isOrganizer: boolean;
}

export interface AdminExclusion {
  id: string;
  giverId: string;
  receiverId: string;
  reason: ExclusionReason;
}

export interface AdminView {
  group: GroupInfo & {
    id: string;
    inviteCode: string;
    allowSelfJoin: boolean;
    drawnAt: string | null;
    createdAt: string;
    hasPreviousRound: boolean;
  };
  participants: AdminParticipant[];
  exclusions: AdminExclusion[];
  revealConsentCount: number;
  /** Only present after the organizer published the Auflösung. */
  reveal?: RevealPair[];
  today: string;
}

export interface InviteView {
  group: GroupInfo & { allowSelfJoin: boolean };
  participants: { id: string; name: string; claimed: boolean }[];
}

export interface MeView {
  me: {
    id: string;
    name: string;
    about: string;
    giftStatus: GiftStatus;
    openedDoors: number[];
    wishes: Wish[];
    isOrganizer: boolean;
    revealSeen: boolean;
    revealConsent: boolean;
  };
  group: GroupInfo;
  participants: { id: string; name: string; giftStatus: GiftStatus; isMe: boolean }[];
  recipient: null | { name: string; about: string; wishes: Wish[] };
  unread: { fromRecipient: number; fromChristkind: number };
  reveal?: RevealPair[];
  /** Today's date in Europe/Vienna, YYYY-MM-DD */
  today: string;
}

export interface ChatMessage {
  id: string;
  mine: boolean;
  body: string;
  createdAt: string;
}

export interface MessagesView {
  /** Conversation with the person I give a present to (I am anonymous). */
  recipient: { name: string; messages: ChatMessage[] } | null;
  /** Conversation with my anonymous Christkind (the person giving to me). */
  christkind: { messages: ChatMessage[] } | null;
}

export interface CreateGroupResponse {
  adminToken: string;
  participantToken: string | null;
}

export interface ClaimResponse {
  token: string;
}

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

export const LIMITS = {
  groupName: 80,
  personName: 40,
  message: 500,
  about: 1000,
  wishText: 200,
  wishUrl: 500,
  wishes: 20,
  chat: 1000,
  participants: 60,
  maxBudget: 10000,
} as const;

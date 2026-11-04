import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MessageCircleHeart, SendHorizontal, Sparkles } from 'lucide-react';
import { LIMITS, type ChatMessage } from '../../../../shared/types';
import { Spinner, useToast } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { messageTime } from '../../lib/format';
import { useLoader } from '../../lib/hooks';
import { firstName } from '../../lib/reveal';
import type { TabProps } from './Participant';

type Thread = 'recipient' | 'christkind';

const SUGGESTIONS: Record<Thread, string[]> = {
  recipient: [
    'Welche Größe trägst du?',
    'Was ist deine Lieblingsfarbe?',
    'Liest du lieber Krimis oder Romane?',
    'Gibt’s etwas, das du gar nicht magst?',
    'Hast du ein Hobby, für das du etwas brauchst?',
  ],
  christkind: ['Danke, liebes Christkind! ✨', 'Ich hab meinen Wunschzettel ergänzt 📝', 'Kleiner Tipp: Ich mag alles mit Schokolade 🍫'],
};

export function ChatTab({ data, token, reload }: TabProps) {
  const [thread, setThread] = useState<Thread>(() =>
    data.unread.fromChristkind > 0 && data.unread.fromRecipient === 0 ? 'christkind' : 'recipient',
  );

  if (!data.group.drawn || !data.recipient) {
    return (
      <div className="space-y-4">
        <Header />
        <div className="card text-center">
          <img src="/img/glocke-256.webp" alt="" width={159} height={256} className="mx-auto h-28 w-auto animate-float" />
          <h2 className="mt-3 text-xl font-bold">Noch ist es still hier …</h2>
          <p className="mt-2 text-ink-700">
            Sobald ausgelost ist, kannst du hier deinem Wichtel anonym Fragen stellen – und dein eigenes Christkind kann dir schreiben.
          </p>
        </div>
      </div>
    );
  }

  return <Chat data={data} token={token} reload={reload} thread={thread} setThread={setThread} />;
}

function Header() {
  return (
    <header className="mt-2 animate-fade-up">
      <h1 className="text-3xl font-bold text-cream-50">Christkind-Post</h1>
      <p className="mt-1 text-cream-200/90">Anonym fragen, ohne das Geheimnis zu verraten.</p>
    </header>
  );
}

function Chat({
  data,
  token,
  reload,
  thread,
  setThread,
}: Pick<TabProps, 'data' | 'token' | 'reload'> & { thread: Thread; setThread: (t: Thread) => void }) {
  const toast = useToast();
  const messages = useLoader(() => api.me.messages(token), [token], 8_000);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recipientName = firstName(data.recipient!.name);

  // Unread counts are captured when the tab opens; loading the messages marks them as read.
  const [unread] = useState(data.unread);
  const unreadTotal = data.unread.fromChristkind + data.unread.fromRecipient;
  useEffect(() => {
    if (messages.data && unreadTotal > 0) void reload();
  }, [messages.data, unreadTotal, reload]);

  const list: ChatMessage[] = (thread === 'recipient' ? messages.data?.recipient?.messages : messages.data?.christkind?.messages) ?? [];

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length, thread]);

  const send = async (e?: FormEvent, preset?: string) => {
    e?.preventDefault();
    const body = (preset ?? draft).trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const msg = await api.me.send(token, thread, body);
      messages.setData((d) => {
        if (!d) return d;
        if (thread === 'recipient' && d.recipient) return { ...d, recipient: { ...d.recipient, messages: [...d.recipient.messages, msg] } };
        if (thread === 'christkind' && d.christkind) return { ...d, christkind: { messages: [...d.christkind.messages, msg] } };
        return d;
      });
      if (!preset) setDraft('');
      inputRef.current?.focus();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
  };

  const tabs: { id: Thread; label: string; badge: number }[] = [
    { id: 'recipient', label: `An ${recipientName}`, badge: unread.fromRecipient },
    { id: 'christkind', label: 'Mein Christkind', badge: unread.fromChristkind },
  ];

  return (
    <div className="space-y-4">
      <Header />
      <div role="tablist" aria-label="Gespräche" className="grid grid-cols-2 gap-1 rounded-full bg-white/10 p-1 ring-1 ring-white/10">
        {tabs.map((t) => {
          const active = thread === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setThread(t.id)}
              className={`relative min-h-11 truncate rounded-full px-3 text-sm font-extrabold transition ${
                active ? 'bg-gold-400 text-ink-900 shadow' : 'text-cream-100 hover:bg-white/10'
              }`}
            >
              {t.label}
              {t.badge > 0 && !active ? (
                <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-berry-500 px-1 text-[0.68rem] leading-5 text-cream-50">
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <section className="card !p-0" aria-live="polite">
        <p className="flex items-start gap-2 border-b border-cream-300/70 px-4 py-3 text-sm text-ink-700">
          {thread === 'recipient' ? (
            <>
              <Sparkles className="mt-0.5 size-4 shrink-0 text-gold-600" />
              <span>
                Du schreibst <strong>{recipientName}</strong> als „Christkind“ – {recipientName} sieht nicht, dass du es bist.
              </span>
            </>
          ) : (
            <>
              <MessageCircleHeart className="mt-0.5 size-4 shrink-0 text-berry-500" />
              <span>Hier schreibt dir die Person, die dich beschenkt. Wer das ist, bleibt bis zur Bescherung geheim.</span>
            </>
          )}
        </p>
        <div ref={listRef} className="max-h-[52dvh] min-h-48 overflow-y-auto overscroll-contain px-3 py-4">
          {messages.loading && !messages.data ? (
            <Spinner label="Post wird geholt …" />
          ) : list.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-ink-500">
                {thread === 'recipient' ? `Noch keine Nachrichten. Frag ${recipientName} doch etwas:` : 'Dein Christkind hat noch nichts geschrieben.'}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS[thread].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={sending}
                    onClick={() => send(undefined, s)}
                    className="chip min-h-9 bg-gold-100 text-left whitespace-normal text-ink-700 ring-1 ring-gold-300 hover:bg-gold-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="space-y-2.5">
              {list.map((m) => (
                <Bubble key={m.id} message={m} today={data.today} theirName={thread === 'recipient' ? recipientName : 'Dein Christkind ✨'} />
              ))}
            </ol>
          )}
        </div>
        <form onSubmit={send} className="flex items-end gap-2 border-t border-cream-300/70 p-3">
          <label htmlFor="chat-input" className="sr-only">
            Nachricht
          </label>
          <textarea
            ref={inputRef}
            id="chat-input"
            rows={1}
            className="input max-h-32 !min-h-12 flex-1 resize-none !rounded-3xl py-3"
            value={draft}
            maxLength={LIMITS.chat}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={onKeyDown}
            placeholder={thread === 'recipient' ? `Anonym an ${recipientName} …` : 'Antwort an dein Christkind …'}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="btn btn-primary !size-12 shrink-0 !p-0"
            aria-label="Senden"
          >
            <SendHorizontal className="size-5" />
          </button>
        </form>
      </section>
    </div>
  );
}

function Bubble({ message, today, theirName }: { message: ChatMessage; today: string; theirName: string }) {
  const mine = message.mine;
  return (
    <li className={`flex animate-fade-in ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] rounded-3xl px-4 py-2.5 shadow-sm ${
          mine ? 'rounded-br-md bg-gradient-to-b from-gold-300 to-gold-400 text-ink-900' : 'rounded-bl-md bg-white text-ink-900 ring-1 ring-cream-300'
        }`}
      >
        {!mine ? <p className="text-xs font-extrabold text-berry-500">{theirName}</p> : null}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p className={`mt-0.5 text-right text-[0.7rem] ${mine ? 'text-ink-700/70' : 'text-ink-300'}`}>
          {messageTime(message.createdAt, today)}
        </p>
      </div>
    </li>
  );
}

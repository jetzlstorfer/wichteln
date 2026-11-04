import { Copy, MessageCircle, Share2 } from 'lucide-react';
import { Button, useToast } from './ui';
import { copyText, shareOrCopy, whatsappUrl } from '../lib/share';

/** WhatsApp / native share / copy buttons for a link plus a prefilled message. */
export function ShareButtons({ url, text, title }: { url: string; text: string; title: string }) {
  const toast = useToast();
  const full = `${text}\n\n${url}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="space-y-2">
      <a href={whatsappUrl(full)} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp w-full">
        <MessageCircle className="size-5" /> Per WhatsApp schicken
      </a>
      <div className={`grid gap-2 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {canShare ? (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const result = await shareOrCopy({ title, text, url });
              if (result === 'copied') toast('Nachricht samt Link kopiert!');
              if (result === 'failed') toast('Teilen hat nicht geklappt.', 'error');
            }}
          >
            <Share2 className="size-4" /> Signal & Co.
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            if (await copyText(full)) toast('Nachricht samt Link kopiert – jetzt einfach einfügen.');
            else toast('Kopieren hat nicht geklappt.', 'error');
          }}
        >
          <Copy className="size-4" /> Kopieren
        </Button>
      </div>
      <p className="break-all rounded-xl bg-cream-200/70 px-3 py-2 font-mono text-xs text-ink-700 select-all">{url}</p>
    </div>
  );
}

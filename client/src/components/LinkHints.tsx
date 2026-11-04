import { useEffect, useState } from 'react';
import { Copy, Download, KeyRound, Share, Share2, X } from 'lucide-react';
import { Button, useToast } from './ui';
import { copyText, shareOrCopy } from '../lib/share';
import { flag, setFlag } from '../lib/storage';
import { canPromptInstall, isIos, isStandalone, onInstallAvailabilityChange, promptInstall } from '../lib/install';

/**
 * Reminds people that their personal link is their key – there are no passwords.
 */
export function SaveLinkCard({
  url,
  flagKey,
  title,
  text,
  shareText,
}: {
  url: string;
  flagKey: string;
  title: string;
  text: string;
  shareText: string;
}) {
  const toast = useToast();
  const [hidden, setHidden] = useState(() => flag(flagKey));
  if (hidden) return null;

  const share = async () => {
    const result = await shareOrCopy({ title, text: shareText, url });
    if (result === 'copied') toast('Link kopiert – füg ihn z. B. in einen Chat mit dir selbst ein.');
    if (result === 'failed') toast('Kopieren hat nicht geklappt – bitte den Link aus der Adresszeile kopieren.', 'error');
  };

  const copy = async () => {
    if (await copyText(url)) toast('Link kopiert!');
    else toast('Kopieren hat nicht geklappt – bitte aus der Adresszeile kopieren.', 'error');
  };

  return (
    <div className="card animate-fade-up border-gold-400 bg-gold-100">
      <button
        type="button"
        className="icon-btn absolute top-2 right-2"
        aria-label="Hinweis ausblenden"
        onClick={() => {
          setFlag(flagKey);
          setHidden(true);
        }}
      >
        <X className="size-5" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-300 text-ink-900">
          <KeyRound className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-ink-700">{text}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={share}>
          <Share2 className="size-4" /> Link sichern
        </Button>
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy className="size-4" /> Kopieren
        </Button>
      </div>
    </div>
  );
}

/** "Add to home screen" hint – real install prompt on Android, instructions on iPhone. */
export function InstallHint() {
  const [, force] = useState(0);
  const [dismissed, setDismissed] = useState(() => flag('install-hint'));
  useEffect(() => onInstallAvailabilityChange(() => force((n) => n + 1)), []);

  if (dismissed || isStandalone()) return null;
  const ios = isIos();
  const canInstall = canPromptInstall();
  if (!ios && !canInstall) return null;

  const dismiss = () => {
    setFlag('install-hint');
    setDismissed(true);
  };

  return (
    <div className="card-dark relative flex items-center gap-3 text-sm text-cream-100 animate-fade-up">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} className="size-11 rounded-xl" />
      <div className="flex-1">
        <p className="font-bold">Als App am Handy</p>
        {ios ? (
          <p className="text-cream-200/90">
            Tipp unten auf <Share className="inline size-4 align-text-bottom" aria-label="Teilen" /> und dann auf
            „Zum Home-Bildschirm“.
          </p>
        ) : (
          <p className="text-cream-200/90">Leg dir das Wichteln auf den Home-Bildschirm.</p>
        )}
      </div>
      {canInstall ? (
        <Button
          size="sm"
          onClick={async () => {
            if (await promptInstall()) dismiss();
          }}
        >
          <Download className="size-4" /> Installieren
        </Button>
      ) : null}
      <button type="button" className="icon-btn !size-9 text-cream-200 hover:bg-white/10" aria-label="Hinweis ausblenden" onClick={dismiss}>
        <X className="size-4" />
      </button>
    </div>
  );
}

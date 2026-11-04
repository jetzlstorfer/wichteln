export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy approach */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Native share sheet (WhatsApp, Signal, …) with clipboard fallback. */
export async function shareOrCopy(data: { title?: string; text: string; url: string }): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: data.title, text: data.text, url: data.url });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(`${data.text}\n${data.url}`)) ? 'copied' : 'failed';
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export const absoluteUrl = (path: string) => new URL(path, window.location.origin).toString();

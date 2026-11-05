import fs from 'node:fs';
import path from 'node:path';
import type { Context, Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Storage } from './storage';
import { TOKEN_PATTERN } from './util';

export interface StaticOptions {
  clientDir: string;
  /** Public base URL (e.g. https://wichteln.example.at) for absolute link-preview URLs. */
  publicUrl?: string;
  trustProxy?: boolean;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function setMeta(html: string, attr: 'property' | 'name', key: string, value: string) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  return html.replace(re, (_m, a: string, b: string) => `${a}${escapeHtml(value)}${b}`);
}

/** Serves the built client with sensible caching and personalised link previews for invites. */
export function attachStatic(app: Hono, storage: Storage, options: StaticOptions) {
  const indexFile = path.join(options.clientDir, 'index.html');
  let template: string | null = null;
  const loadTemplate = () => (template ??= fs.readFileSync(indexFile, 'utf8'));

  const originOf = (c: Context) => {
    if (options.publicUrl) return options.publicUrl.replace(/\/+$/, '');
    const url = new URL(c.req.url);
    if (options.trustProxy) {
      const proto = c.req.header('x-forwarded-proto')?.split(',')[0].trim();
      const host = c.req.header('x-forwarded-host')?.split(',')[0].trim();
      if (proto) url.protocol = `${proto}:`;
      if (host) url.host = host;
    }
    return url.origin;
  };

  const renderIndex = async (c: Context) => {
    let html = loadTemplate();
    const origin = originOf(c);
    html = setMeta(html, 'property', 'og:image', `${origin}/img/og-image.jpg`);
    html = setMeta(html, 'property', 'og:url', `${origin}${c.req.path}`);

    const invite = c.req.path.match(/^\/einladung\/([^/]+)\/?$/);
    if (invite && TOKEN_PATTERN.test(invite[1])) {
      const id = await storage.resolve('invite', invite[1]);
      const round = id ? await storage.read(id) : undefined;
      const group = round?.group.invite_code === invite[1] ? round.group : undefined;
      if (group) {
        const title = `Einladung zum Wichteln: ${group.name}`;
        const description = `${group.organizer_name} lädt dich ein – wähle deinen eigenen Namen und erhalte deinen persönlichen Wichtel-Link. ✨`;
        html = setMeta(html, 'property', 'og:title', title);
        html = setMeta(html, 'property', 'og:description', description);
        html = setMeta(html, 'name', 'description', description);
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
      }
    }

    if (/^\/(w|orga|einladung|bestaetigen)\//.test(c.req.path)) {
      c.header('X-Robots-Tag', 'noindex, nofollow');
      c.header('Cache-Control', 'no-store');
    } else {
      c.header('Cache-Control', 'no-cache');
    }
    return c.html(html);
  };

  app.get('/', renderIndex);
  app.get('/index.html', renderIndex);

  app.use(
    '*',
    serveStatic({
      root: options.clientDir,
      onFound: (filePath, c) => {
        const rel = path.relative(options.clientDir, filePath).replace(/\\/g, '/');
        if (rel.startsWith('assets/')) c.header('Cache-Control', 'public, max-age=31536000, immutable');
        else if (rel.startsWith('img/') || rel.startsWith('icons/') || rel.startsWith('fonts/'))
          c.header('Cache-Control', 'public, max-age=604800');
        else c.header('Cache-Control', 'public, max-age=3600');
      },
    }),
  );

  // Missing build files should 404 instead of returning the app shell.
  app.get('/assets/*', (c) => c.text('Not found', 404));
  app.get('/img/*', (c) => c.text('Not found', 404));
  app.get('/icons/*', (c) => c.text('Not found', 404));

  // Client-side routes
  app.get('*', renderIndex);
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { compress } from 'hono/compress';
import { createApp } from './app';
import { openStorage } from './storage';
import { runMaintenance } from './maintenance';
import { attachStatic } from './static';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const clientDir = path.resolve(process.env.CLIENT_DIR ?? path.join(here, '../client'));
const trustProxy = ['1', 'true', 'yes'].includes((process.env.TRUST_PROXY ?? '').toLowerCase());

async function main() {
  const storage = await openStorage();
  await storage.check();

  if (process.argv.includes('--maintenance')) {
    const { purged, deleted } = await runMaintenance(storage);
    console.log(`[wichteln] maintenance: ${purged} purged, ${deleted} deleted`);
    return;
  }

  const app = createApp(storage, { trustProxy });
  const publicUrl = process.env.PUBLIC_URL ||
    (process.env.CONTAINER_APP_HOSTNAME ? `https://${process.env.CONTAINER_APP_HOSTNAME}` : undefined);

  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use('*', compress());
    attachStatic(app, storage, { clientDir, publicUrl, trustProxy });
  } else {
    console.warn(`[wichteln] No client build in ${clientDir} – serving the API only (use "npm run dev" for the UI).`);
  }

  const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    console.log(`[wichteln] 🎄 läuft auf http://localhost:${info.port}`);
  });

  const shutdown = () => {
    server.close(() => { process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('[wichteln] startup/maintenance failed; check storage configuration, table availability and identity permissions',
    error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { compress } from 'hono/compress';
import { createApp } from './app';
import { openDatabase } from './db';
import { runMaintenance } from './maintenance';
import { attachStatic } from './static';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');
const dbFile = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(dataDir, 'wichteln.db');
const clientDir = path.resolve(process.env.CLIENT_DIR ?? path.join(here, '../client'));
const trustProxy = ['1', 'true', 'yes'].includes((process.env.TRUST_PROXY ?? '').toLowerCase());

const db = openDatabase(dbFile);
const app = createApp(db, { trustProxy });

if (fs.existsSync(path.join(clientDir, 'index.html'))) {
  app.use('*', compress());
  attachStatic(app, db, { clientDir, publicUrl: process.env.PUBLIC_URL, trustProxy });
} else {
  console.warn(`[wichteln] No client build in ${clientDir} – serving the API only (use "npm run dev" for the UI).`);
}

const maintain = () => {
  try {
    const { purged, deleted } = runMaintenance(db);
    if (purged || deleted) console.log(`[wichteln] Aufräumen: ${purged} Runde(n) bereinigt, ${deleted} gelöscht.`);
  } catch (err) {
    console.error('[wichteln] maintenance failed', err);
  }
};
maintain();
const timer = setInterval(maintain, 6 * 60 * 60 * 1000);
timer.unref();

const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`[wichteln] 🎄 läuft auf http://localhost:${info.port} (DB: ${dbFile})`);
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TableServiceClient } from '@azure/data-tables';

async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Cannot allocate local emulator port');
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}
const port = await freePort();
const directory = await mkdtemp(path.join(tmpdir(), 'wichteln-table-tests-'));
const key = randomBytes(64).toString('base64');
const connection = `DefaultEndpointsProtocol=http;AccountName=wichtelntest;AccountKey=${key};TableEndpoint=http://127.0.0.1:${port}/wichtelntest`;
const emulator = spawn(process.execPath, [
  path.resolve('node_modules', 'azurite', 'dist', 'src', 'table', 'main.js'),
  '--tableHost', '127.0.0.1', '--tablePort', String(port), '--location', directory, '--silent', '--disableTelemetry',
], { env: { ...process.env, AZURITE_ACCOUNTS: `wichtelntest:${key}` }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
emulator.stdout.on('data', (chunk) => { output += chunk; });
emulator.stderr.on('data', (chunk) => { output += chunk; });
const stopped = once(emulator, 'exit');

try {
  const deadline = Date.now() + 20_000;
  const service = TableServiceClient.fromConnectionString(connection, { allowInsecureConnection: true, retryOptions: { maxRetries: 0 } });
  let ready = false;
  while (Date.now() < deadline) {
    if (emulator.exitCode !== null) throw new Error(`Emulator exited before readiness: ${output}`);
    try {
      await service.listTables().next();
      ready = true;
      break;
    } catch (error) {
      if (error.code !== 'ECONNREFUSED') throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!ready) throw new Error(`Emulator did not become ready: ${output}`);
  console.log('Isolated Azurite Table emulator ready; no Azure resources are used.');
  const tests = spawn(process.execPath, [
    path.resolve('node_modules', 'vitest', 'vitest.mjs'), 'run',
    '--testTimeout=60000', '--hookTimeout=30000',
  ], {
    env: { ...process.env, STORAGE_BACKEND: 'azurite', TEST_TABLE_STORAGE: 'true', AZURITE_CONNECTION_STRING: connection },
    stdio: 'inherit',
  });
  const [code] = await once(tests, 'exit');
  process.exitCode = code ?? 1;
  if (code === 0 && process.argv.includes('--smoke')) {
    const appPort = await freePort();
    const origin = `http://127.0.0.1:${appPort}`;
    const env = {
      ...process.env, NODE_ENV: 'test', STORAGE_BACKEND: 'azurite', AZURITE_CONNECTION_STRING: connection,
      PORT: String(appPort), HOST: '127.0.0.1', PUBLIC_URL: origin,
      TABLE_ROUNDS: 'SmokeRounds', TABLE_LINKS: 'SmokeLinks', TABLE_RATES: 'SmokeRates',
    };
    const server = spawn(process.execPath, [path.resolve('dist', 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let serverOutput = '';
    server.stdout.on('data', (chunk) => { serverOutput += chunk; });
    server.stderr.on('data', (chunk) => { serverOutput += chunk; });
    const serverStopped = once(server, 'exit');
    try {
      let healthy = false;
      for (let i = 0; i < 100; i++) {
        if (server.exitCode !== null) throw new Error(`Bundled server exited: ${serverOutput}`);
        try {
          healthy = (await fetch(`${origin}/api/health`)).ok;
          if (healthy) break;
        } catch (error) {
          if (error.cause?.code !== 'ECONNREFUSED') throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!healthy) throw new Error(`Bundled server did not become healthy: ${serverOutput}`);
      const created = await fetch(`${origin}/api/groups`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bundled smoke family', organizerName: 'A', exchangeDate: '2020-12-24' }),
      });
      if (created.status !== 201) throw new Error('Bundled server cannot create a round');
      const group = await created.json();
      const admin = await (await fetch(`${origin}/api/admin/${group.adminToken}`)).json();
      const invite = await fetch(`${origin}/einladung/${admin.group.inviteCode}`);
      if (!invite.ok || !(await invite.text()).includes('Einladung zum Wichteln: Bundled smoke family')) {
        throw new Error('Bundled server does not render the stored invitation preview');
      }
      const personal = await fetch(`${origin}/w/${group.participantToken}`);
      if (personal.headers.get('cache-control') !== 'no-store' || personal.headers.get('x-robots-tag') !== 'noindex, nofollow') {
        throw new Error('Bundled server does not protect private page caching/indexing');
      }
      const cleanup = spawn(process.execPath, [path.resolve('dist', 'server', 'index.js'), '--maintenance'], { env, stdio: 'inherit' });
      const [cleanupCode] = await once(cleanup, 'exit');
      if (cleanupCode !== 0) throw new Error('Bundled maintenance command failed');
      if ((await fetch(`${origin}/api/admin/${group.adminToken}`)).status !== 404) throw new Error('Maintenance did not delete expired smoke round');
      console.log('Bundled HTTP server, invitation preview, private-page headers and maintenance job verified.');
    } finally {
      if (server.exitCode === null) server.kill();
      await serverStopped;
    }
  }
} finally {
  if (emulator.exitCode === null) emulator.kill();
  await stopped;
  await rm(directory, { recursive: true, force: true });
}

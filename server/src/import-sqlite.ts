import path from 'node:path';
import { importSqlite } from './sqlite-import';
import { openStorage } from './storage';

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
if (!file || args.some((arg) => arg.startsWith('--') && arg !== '--apply')) {
  throw new Error('Usage: npm run import:sqlite -- <source.db> [--apply]. Without --apply, only preflight reads are performed.');
}
try {
  const result = await importSqlite(path.resolve(file), await openStorage(), args.includes('--apply'));
  console.log(`[wichteln] SQLite import: ${result.rounds} rounds, ${result.participants} participants; ${result.applied ? 'applied' : 'dry run (no data imported)'}`);
} catch (error) {
  console.error('[wichteln] import failed', error instanceof Error && error.name === 'Error' ? error.message :
    error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
}

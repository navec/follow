import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const migrationsDir = path.resolve('src/infrastructure/persistence/postgres/migrations');

function timestampUtcCompact(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}`;
}

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function ensureDoesNotExist(filePath) {
  try {
    await access(filePath);
    throw new Error(`File already exists: ${filePath}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function main() {
  const rawName = process.argv.slice(2).join(' ');
  if (!rawName) {
    console.error('Usage: npm run db:migrate:new -- <migration_name>');
    process.exit(1);
  }

  const name = slugify(rawName);
  if (!name) {
    console.error('Invalid migration name. Use letters/numbers/words.');
    process.exit(1);
  }

  const stamp = timestampUtcCompact();
  const base = `${stamp}_${name}`;
  const upPath = path.join(migrationsDir, `${base}.up.sql`);
  const downPath = path.join(migrationsDir, `${base}.down.sql`);

  await mkdir(migrationsDir, { recursive: true });
  await ensureDoesNotExist(upPath);
  await ensureDoesNotExist(downPath);

  const upTemplate = `-- Up migration: ${name}\n-- Write SQL here\n`;
  const downTemplate = `-- Down migration: ${name}\n-- Revert SQL here\n`;

  await writeFile(upPath, upTemplate, 'utf8');
  await writeFile(downPath, downTemplate, 'utf8');

  console.log(`Created:\n- ${upPath}\n- ${downPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

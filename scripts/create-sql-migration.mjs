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
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}000`;
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
  const upSqlPath = path.join(migrationsDir, `${base}.up.sql`);
  const downSqlPath = path.join(migrationsDir, `${base}.down.sql`);
  const upJsPath = path.join(migrationsDir, `${base}.up.js`);

  await mkdir(migrationsDir, { recursive: true });
  await ensureDoesNotExist(upSqlPath);
  await ensureDoesNotExist(downSqlPath);
  await ensureDoesNotExist(upJsPath);

  const upSqlTemplate = `-- Up migration: ${name}\n-- Write SQL here\n`;
  const downSqlTemplate = `-- Down migration: ${name}\n-- Revert SQL here\n`;
  const upJsTemplate = `import { readFile } from 'node:fs/promises';\nimport path from 'node:path';\nimport { fileURLToPath } from 'node:url';\n\nconst dirname = path.dirname(fileURLToPath(import.meta.url));\nconst upPath = path.join(dirname, '${base}.up.sql');\nconst downPath = path.join(dirname, '${base}.down.sql');\n\nexport const up = async (pgm) => {\n  pgm.sql(await readFile(upPath, 'utf8'));\n};\n\nexport const down = async (pgm) => {\n  pgm.sql(await readFile(downPath, 'utf8'));\n};\n`;

  await writeFile(upSqlPath, upSqlTemplate, 'utf8');
  await writeFile(downSqlPath, downSqlTemplate, 'utf8');
  await writeFile(upJsPath, upJsTemplate, 'utf8');

  console.log(`Created:\n- ${upSqlPath}\n- ${downSqlPath}\n- ${upJsPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const upPath = path.join(dirname, '20260821T010000_enrich_tmdb_movies.up.sql');
const downPath = path.join(dirname, '20260821T010000_enrich_tmdb_movies.down.sql');

export const up = async (pgm) => {
  pgm.sql(await readFile(upPath, 'utf8'));
};

export const down = async (pgm) => {
  pgm.sql(await readFile(downPath, 'utf8'));
};

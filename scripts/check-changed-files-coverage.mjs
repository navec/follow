import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);
const MIN_COVERAGE = Number(process.env.MIN_NEW_CODE_COVERAGE ?? '90');
const BASE_SHA = process.env.GITHUB_BASE_SHA;
const HEAD_SHA = process.env.GITHUB_HEAD_SHA || 'HEAD';
const summaryPath = path.resolve('coverage/coverage-summary.json');

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}

async function gitDiffChangedFiles() {
  if (!BASE_SHA) {
    throw new Error('GITHUB_BASE_SHA is required');
  }

  const { stdout } = await execFile('git', ['diff', '--name-only', `${BASE_SHA}...${HEAD_SHA}`], {
    cwd: process.cwd()
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePath);
}

function selectCoveredFiles(changedFiles) {
  return changedFiles.filter((file) => {
    if (!file.endsWith('.ts')) return false;
    if (file.endsWith('.spec.ts')) return false;
    return file.startsWith('src/domain/') || file.startsWith('src/application/');
  });
}

function findCoverageEntry(summary, relativePath) {
  const normalized = normalizePath(relativePath);
  const candidates = Object.keys(summary).filter((key) => key !== 'total');

  return candidates.find((key) => {
    const normalizedKey = normalizePath(key);
    return normalizedKey === normalized || normalizedKey.endsWith(`/${normalized}`);
  });
}

function pct(metric) {
  return typeof metric?.pct === 'number' ? metric.pct : 0;
}

async function main() {
  const changedFiles = await gitDiffChangedFiles();
  const targetFiles = selectCoveredFiles(changedFiles);

  if (targetFiles.length === 0) {
    console.log('No changed files in src/domain or src/application. Skipping coverage gate.');
    return;
  }

  const summary = JSON.parse(await readFile(summaryPath, 'utf8'));

  const results = targetFiles.map((file) => {
    const key = findCoverageEntry(summary, file);
    if (!key) {
      return { file, coverage: 0, found: false };
    }
    return { file, coverage: pct(summary[key].lines), found: true };
  });

  const failed = results.filter((item) => item.coverage < MIN_COVERAGE);

  console.log(`Coverage gate on changed files (threshold: ${MIN_COVERAGE}%)`);
  for (const item of results) {
    console.log(`- ${item.file}: ${item.coverage}%${item.found ? '' : ' (missing in coverage report)'}`);
  }

  if (failed.length > 0) {
    console.error('\nCoverage gate failed for changed files:');
    for (const item of failed) {
      console.error(`- ${item.file}: ${item.coverage}% < ${MIN_COVERAGE}%`);
    }
    process.exit(1);
  }

  console.log('\nCoverage gate passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

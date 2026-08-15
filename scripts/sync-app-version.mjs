#!/usr/bin/env node
/**
 * Single source of truth for the app version is `client/package.json` — that is the
 * only file release-please edits. This script propagates it to `client/app.json`,
 * which needs two things release-please cannot produce:
 *
 *   expo.version              the semver string (same value, different file)
 *   expo.android.versionCode  a monotonically increasing INTEGER
 *
 * Android refuses to install an APK whose versionCode is not greater than the
 * installed one, so this number can never go backwards. We derive it from semver as
 * major*10000 + minor*100 + patch, which keeps it reconstructible from any git tag —
 * no counter living outside the repo.
 *
 *   1.0.0 ->  10000        1.1.0 ->  10100        2.0.3 ->  20003
 *
 * That encoding caps minor and patch at 99; we fail loudly rather than silently
 * producing a colliding number.
 *
 * `app.json` is edited by targeted text replacement, not JSON.stringify, so the file's
 * existing formatting survives untouched and Prettier's `format:check` stays happy.
 *
 * Usage:
 *   node scripts/sync-app-version.mjs           write app.json
 *   node scripts/sync-app-version.mjs --check   exit 1 if app.json is out of sync
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(repoRoot, 'client/package.json');
const appPath = resolve(repoRoot, 'client/app.json');

const checkOnly = process.argv.includes('--check');

function fail(message) {
  console.error(`sync-app-version: ${message}`);
  process.exit(1);
}

/** @returns {{version: string, versionCode: number}} */
function derive() {
  const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  if (!match) {
    fail(`client/package.json version "${version}" is not a plain X.Y.Z semver.`);
  }
  const [, major, minor, patch] = match.map(Number);
  if (minor > 99 || patch > 99) {
    fail(
      `version ${version} overflows the versionCode encoding (minor and patch must be <= 99). ` +
        `Widen the formula in this script and in the docs before releasing.`,
    );
  }
  return { version, versionCode: major * 10000 + minor * 100 + patch };
}

/**
 * Replace a single JSON scalar in place. Refuses to guess: if the key does not appear
 * exactly once, something about app.json's shape changed and a silent no-op would ship
 * a wrong version to users.
 */
function replaceScalar(text, key, rendered) {
  const pattern = new RegExp(`("${key}"\\s*:\\s*)("[^"]*"|\\d+)`, 'g');
  const hits = text.match(pattern) ?? [];
  if (hits.length !== 1) {
    fail(`expected exactly one "${key}" key in client/app.json, found ${hits.length}.`);
  }
  return text.replace(pattern, `$1${rendered}`);
}

const { version, versionCode } = derive();
const original = readFileSync(appPath, 'utf8');
const app = JSON.parse(original);

if (checkOnly) {
  const problems = [];
  if (app.expo?.version !== version) {
    problems.push(`expo.version is "${app.expo?.version}", expected "${version}"`);
  }
  if (app.expo?.android?.versionCode !== versionCode) {
    problems.push(
      `expo.android.versionCode is ${app.expo?.android?.versionCode}, expected ${versionCode}`,
    );
  }
  if (problems.length > 0) {
    console.error('sync-app-version: client/app.json is out of sync with client/package.json:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nRun `npm run sync-version` at the repo root to fix.');
    process.exit(1);
  }
  console.log(`sync-app-version: in sync (version ${version}, versionCode ${versionCode})`);
  process.exit(0);
}

let updated = replaceScalar(original, 'version', JSON.stringify(version));
updated = replaceScalar(updated, 'versionCode', String(versionCode));

// Re-parse rather than trusting the regexes — a bad edit here ships a broken build.
const reparsed = JSON.parse(updated);
if (reparsed.expo?.version !== version || reparsed.expo?.android?.versionCode !== versionCode) {
  fail('post-edit verification failed; client/app.json was not written.');
}

if (updated === original) {
  console.log(`sync-app-version: already in sync (version ${version}, versionCode ${versionCode})`);
} else {
  writeFileSync(appPath, updated);
  console.log(`sync-app-version: wrote version ${version}, versionCode ${versionCode}`);
}

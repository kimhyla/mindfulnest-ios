#!/usr/bin/env node
// Walks the FULL package-lock.json (not just top-level) and exits non-zero if
// any banned package is present at any depth. Ref spec v2 §C7-T1, LD-220
// (COPPA_NO_BEHAVIORAL_ADVERTISING), LD-157 (DEV_TELEMETRY_AUTOLINKING).
//
// Extracted from .github/workflows/dependency-audit.yml on 2026-04-18 because
// the inline `$(node <<'NODE_SCRIPT' ... NODE_SCRIPT)` heredoc nested inside
// command substitution doesn't parse reliably in GitHub Actions' bash shell.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const banned = /@sentry\/|bugsnag|rollbar|^phaser$|react-native-spine|@capacitor\//;

const lock = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package-lock.json'), 'utf-8'));
const packages = lock.packages || {};
const hits = [];

for (const [path, info] of Object.entries(packages)) {
  if (path === '') continue;
  const parts = path.split('node_modules/');
  const name = parts[parts.length - 1];
  if (banned.test(name)) {
    hits.push(`${name}@${info.version} (at ${path})`);
  }
}

if (hits.length > 0) {
  console.error('BANNED PACKAGES FOUND:');
  for (const h of hits) console.error('  - ' + h);
  process.exit(1);
}
console.log('No banned packages in dependency tree.');

#!/usr/bin/env node
// COPPA forbidden-vendor SDK scan.
// Closes LD 560 WATCH_LIST_MECHANICAL_ENFORCEMENT_V1's CI half.
// Master tech spec v6 §8.4: ads/tracking/analytics SDKs forbidden in child app.
//
// Mirrors scripts/check-banned-packages.mjs walk pattern (LD-220/LD-157
// precedent). Walks lock.packages keys to extract package names from the
// rightmost node_modules/<pkg> segment — necessary because lockfileVersion 3
// stores package names as path keys, not "name": fields.
//
// Override path: register SHORTCUT_VENDOR_SCAN_BYPASS_<reason>_V1 LD with
// Kim explicit approval per Rule 19.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// §8.4 token patterns — matched against package-name segment using
// word boundaries (start/end of name, or separator chars: '-', '_', '/', '.',
// '@'). This avoids false positives like "threads" containing "ads".
const PATTERNS = [
  'ads',
  'track',
  'mixpanel',
  'amplitude',
  'facebook',
  'fb-sdk',
  'admob',
  'firebase-ads',
];

// Build a word-boundary regex per pattern. JS \b doesn't treat '-' or '/' as
// boundaries, so we define our own boundary class explicitly.
const BOUNDARY = '(^|[-_/.@])';
const BOUNDARY_END = '($|[-_/.@])';
const PATTERN_REGEXES = PATTERNS.map((p) => ({
  pattern: p,
  re: new RegExp(BOUNDARY + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + BOUNDARY_END, 'i'),
}));

// §8.4 specific named SDKs — exact match against the rightmost
// node_modules/<pkg> segment (or scoped pkg). Allows a sub-path
// (e.g. "@rneui/base/foo") to also flag.
const SPECIFIC = [
  'logrocket',
  'fullstory',
  'sentry-replay',
  'uxcam',
  'instabug',
  'mixpanel',
  'amplitude',
  'posthog',
  'datadog-rum',
  'newrelic-mobile',
  'appsflyer',
  'adjust',
  'branch-io',
  'kidoz',
  'imgix',
  'react-native-elements',
  '@rneui/base',
  '@rneui/themed',
  '@rneui/icons',
  'native-base',
];

// Allow override via env (used for DS-13 Layer 6 smoke testing).
const LOCKFILES = process.env.COPPA_SCAN_LOCKFILES
  ? process.env.COPPA_SCAN_LOCKFILES.split(',').map((p) => p.trim()).filter(Boolean)
  : ['package-lock.json', 'functions/package-lock.json'];

let foundAny = false;

for (const lockfileRel of LOCKFILES) {
  const lockfilePath = resolve(REPO_ROOT, lockfileRel);
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockfilePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log(`::notice::${lockfileRel} not present, skipping`);
      continue;
    }
    throw e;
  }

  if (!lock.packages) {
    console.error(
      `::error file=${lockfileRel}::has no 'packages' key — unsupported lockfileVersion?`,
    );
    process.exit(1);
  }

  for (const key of Object.keys(lock.packages)) {
    if (key === '') continue; // root package
    const segments = key.split('node_modules/');
    const pkgName = segments[segments.length - 1];
    if (!pkgName) continue;

    let flaggedSpecific = false;

    // Specific exact-match check (also matches sub-paths under the package).
    for (const name of SPECIFIC) {
      if (pkgName === name || pkgName.startsWith(name + '/')) {
        console.error(
          `::error file=${lockfileRel}::§8.4 SPECIFIC match — forbidden SDK "${pkgName}" (matches "${name}")`,
        );
        console.error(`    path: ${key}`);
        foundAny = true;
        flaggedSpecific = true;
      }
    }

    // Pattern token check — skip if specific already flagged this pkg.
    if (!flaggedSpecific) {
      for (const { pattern, re } of PATTERN_REGEXES) {
        if (re.test(pkgName)) {
          console.error(
            `::error file=${lockfileRel}::§8.4 PATTERN match — "${pattern}" detected in package "${pkgName}"`,
          );
          console.error(`    path: ${key}`);
          foundAny = true;
        }
      }
    }
  }
}

if (foundAny) {
  console.error('');
  console.error(
    '::error::Master tech spec v6 §8.4 forbids these SDKs in the child app for COPPA + privacy.',
  );
  console.error('::error::See LD 560 WATCH_LIST_MECHANICAL_ENFORCEMENT_V1.');
  console.error(
    '::error::Override (only with Kim explicit approval): register SHORTCUT_VENDOR_SCAN_BYPASS_<reason>_V1 LD.',
  );
  process.exit(1);
}

console.log('::notice::No forbidden vendor SDKs detected. ✓');
process.exit(0);

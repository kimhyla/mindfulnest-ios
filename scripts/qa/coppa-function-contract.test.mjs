#!/usr/bin/env node
// CI assertion: spec §7.2 — every Cloud Function that imports firebase-admin
// AND references a /children/* path MUST import withCoppaGuard.
//
// Static file scan — no runtime, no Firebase emulator required.
// Exit 0 = all contracts satisfied. Exit 1 = violation(s) found.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TRIGGERS_DIR = join(__dirname, '../../functions/src/triggers');

// Patterns that indicate firebase-admin usage (server-side child data risk).
const ADMIN_IMPORT_RE = /from\s+['"]firebase-admin(?:\/[^'"]+)?['"]/;

// Patterns that indicate /children/* access — strip line comments first.
const CHILDREN_ACCESS_PATTERNS = [
  /collection\s*\(\s*['"]children['"]\s*\)/,
  /['"]\/children\//,
  /`\/children\//,
];

// Guard import — either variant satisfies the contract.
const GUARD_IMPORT_RE = /from\s+['"][^'"]*withCoppaGuard['"]/;

function stripLineComments(src) {
  return src
    .split('\n')
    .map((line) => {
      const commentIdx = line.indexOf('//');
      return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    })
    .join('\n');
}

function walkTs(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

const files = walkTs(TRIGGERS_DIR);
const violations = [];

for (const filePath of files) {
  const src = readFileSync(filePath, 'utf8');
  const stripped = stripLineComments(src);

  const hasAdminImport = ADMIN_IMPORT_RE.test(stripped);
  if (!hasAdminImport) continue;

  const hasChildrenAccess = CHILDREN_ACCESS_PATTERNS.some((re) => re.test(stripped));
  if (!hasChildrenAccess) continue;

  const hasGuard = GUARD_IMPORT_RE.test(stripped);
  if (!hasGuard) {
    violations.push(relative(process.cwd(), filePath));
  }
}

if (violations.length === 0) {
  console.log('✓ COPPA function contract: all /children/* functions import withCoppaGuard');
  process.exit(0);
} else {
  console.error('✗ COPPA function contract VIOLATIONS:');
  for (const v of violations) {
    console.error(`  FAIL: ${v} imports firebase-admin and references /children/* but does not import withCoppaGuard`);
  }
  process.exit(1);
}

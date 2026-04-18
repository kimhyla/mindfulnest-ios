#!/usr/bin/env node
// Reads content-lockfiles/firestore_schema.json and emits a TS module with
// per-collection allowlist/forbidden/required arrays. This keeps the sanitize
// CF bundle self-contained (no runtime file I/O on cold start, no missing
// file risk, byte-deterministic output).
//
// This generator is owned by functions/ (separate from the root-level
// scripts/generate-firestore-types.mjs, which is S3-DASH-schema's artifact
// per LD-230). Both read the same firestore_schema.json source-of-truth but
// emit independent outputs. Per counter-agent #3's CRITICAL-3 synthesis.
//
// Usage: node functions/scripts/gen-schema-lists.mjs
// Determinism: byte-identical on same input; sorted alphabetically; LF
// line endings; source SHA256 in header.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCHEMA_PATH = resolve(REPO_ROOT, 'content-lockfiles/firestore_schema.json');
const OUT_PATH = resolve(REPO_ROOT, 'functions/src/schema/firestore-allowlists.generated.ts');

const rawSchema = readFileSync(SCHEMA_PATH);
const schema = JSON.parse(rawSchema.toString('utf-8'));
const sha = createHash('sha256').update(rawSchema).digest('hex');

if (!schema.collections || typeof schema.collections !== 'object') {
  console.error('Schema missing top-level "collections" object');
  process.exit(1);
}

const emit = [];
emit.push('// GENERATED — DO NOT EDIT.');
emit.push(`// source: content-lockfiles/firestore_schema.json sha256=${sha}`);
emit.push('// Regenerate via: node functions/scripts/gen-schema-lists.mjs');
emit.push('');
emit.push('export interface CollectionFieldLists {');
emit.push('  readonly allowlist: readonly string[];');
emit.push('  readonly forbidden: readonly string[];');
emit.push('  readonly required: readonly string[];');
emit.push('}');
emit.push('');
emit.push('export type CollectionName =');

const keys = Object.keys(schema.collections).sort();
keys.forEach((k, i) => {
  const sep = i === keys.length - 1 ? ';' : '';
  emit.push(`  | ${JSON.stringify(k)}${sep}`);
});
emit.push('');

emit.push('export const FIRESTORE_FIELD_LISTS: Readonly<Record<CollectionName, CollectionFieldLists>> = {');
for (const name of keys) {
  const c = schema.collections[name];
  const allow = (c.allowlist_fields ?? Object.keys(c.field_types ?? {})).slice().sort();
  const forb = (c.forbidden_fields ?? []).slice().sort();
  const req = (c.required_fields ?? []).slice().sort();
  emit.push(`  ${JSON.stringify(name)}: {`);
  emit.push(`    allowlist: [${allow.map((f) => JSON.stringify(f)).join(', ')}],`);
  emit.push(`    forbidden: [${forb.map((f) => JSON.stringify(f)).join(', ')}],`);
  emit.push(`    required: [${req.map((f) => JSON.stringify(f)).join(', ')}],`);
  emit.push('  },');
}
emit.push('};');
emit.push('');

const output = emit.join('\n').replace(/\r\n/g, '\n').replace(/\n+$/, '') + '\n';
writeFileSync(OUT_PATH, output, { encoding: 'utf-8' });
process.stdout.write(`Wrote ${OUT_PATH} (${output.length} bytes, ${keys.length} collections, sha=${sha.slice(0, 16)}...)\n`);

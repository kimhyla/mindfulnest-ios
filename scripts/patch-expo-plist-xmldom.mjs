import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const nodeModulesDir = join(process.cwd(), 'node_modules');
const targetRelativePath = join('@expo', 'plist', 'build', 'parse.js');
const before = '.parseFromString(xml);';
const after = ".parseFromString(xml, 'application/xml');";

function findExpoPlistParsers(dir, results = []) {
  if (!existsSync(dir)) return results;

  const target = join(dir, targetRelativePath);
  if (existsSync(target)) {
    results.push(target);
  }

  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') && entry !== '.pnpm') continue;

    const child = join(dir, entry);
    if (!statSync(child).isDirectory()) continue;

    // Package trees can contain nested node_modules, including scoped packages
    // such as @expo/config-plugins/node_modules/@expo/plist.
    findExpoPlistParsers(child, results);
  }

  return results;
}

const parserFiles = findExpoPlistParsers(nodeModulesDir);

if (parserFiles.length === 0) {
  console.log('[patch-expo-plist-xmldom] No @expo/plist parser files found; skipping.');
  process.exit(0);
}

for (const parserFile of parserFiles) {
  const source = readFileSync(parserFile, 'utf8');

  if (source.includes(after)) {
    console.log(`[patch-expo-plist-xmldom] Already patched: ${parserFile}`);
    continue;
  }

  if (!source.includes(before)) {
    throw new Error(`[patch-expo-plist-xmldom] Unexpected @expo/plist parser shape: ${parserFile}`);
  }

  writeFileSync(parserFile, source.replace(before, after));
  console.log(`[patch-expo-plist-xmldom] Patched: ${parserFile}`);
}

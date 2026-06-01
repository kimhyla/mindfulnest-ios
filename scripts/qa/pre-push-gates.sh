#!/usr/bin/env bash
# MindfulNest pre-push QA — durable substitute for Cursor Review "Find Issues".
# Runs the same fast gates as .github/workflows/app-ci.yml (minus slow native/Maestro).
# Invoked automatically by .husky/pre-push on every git push.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "▶ MindfulNest pre-push QA (lint, test, typecheck, COPPA, banned packages)"

npm run lint
npm test
npx tsc --noEmit
npm run test:coppa-contracts
node scripts/check-banned-packages.mjs

echo "✔ Pre-push QA passed — safe to push. Full CI runs on the PR."

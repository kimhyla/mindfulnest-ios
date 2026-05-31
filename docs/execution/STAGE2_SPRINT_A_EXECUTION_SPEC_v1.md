# STAGE2 Sprint A — Execution Spec v1

**Status:** EXECUTED 2026-05-29 — Kim approved; sprint exit gates green  
**Date:** 2026-05-29  
**Agent model:** GPT 5.5 (Agent mode, autonomous with gates)  
**Sprint goal:** CI honest, map navigation works, agent rules in repo — **no auth, catalog, or progression work in this sprint**

---

## 1. Authority chain

| Document | Role |
|----------|------|
| `APP_ARCHITECTURE_MASTER_v1.md` (Dropbox) | Canonical *what* — LD-280 single MP4, arc-at-a-time, etc. |
| Audit report (2026-05-29 chat) | Canonical *gaps* — prioritized backlog |
| **This spec** | Canonical *how* for Sprint A only |

**Out of scope for Sprint A:** LD-278 auth persistence, `markPlayed`, `isModuleUnlocked`, Maestro auth, onboarding, per-creature map links (item 1.4 deferred to Sprint B unless Kim approves stretch).

---

## 2. Classification legend

| Tag | Meaning |
|-----|---------|
| `P0-blocker` | Broken for users or CI today |
| `P1-regression` | Wrong behavior with workaround |
| `P2-hygiene` | Docs, CI gaps, comments |
| `P3-deferred` | Not in this sprint |

| Gate | Command / action |
|------|------------------|
| `GATE:unit` | `npm test` |
| `GATE:lint` | `npm run lint` |
| `GATE:coppa` | `npm run test:coppa-contracts` |
| `GATE:banned` | `node scripts/check-banned-packages.mjs` |
| `GATE:rules` | `npm run test:rules` (run once at sprint end — no rules changes expected) |
| `GATE:legacy` | `.github/workflows/legacy-file-gate.yml` logic — no banned files exist |
| `GATE:browser` | Web export smoke (see §4) |
| `GATE:grep` | Ripgrep assertions listed per item |

---

## 3. Multipass protocol (mandatory per item)

Every item **SA-xxx** runs four passes. Agent **must not** start SA-(n+1) until SA-n gates are green.

1. **Pass 1 — Ground truth:** Read files; run grep; record evidence (paths + line numbers). No implementation.
2. **Pass 2 — Implement:** Minimal diff per acceptance criteria only.
3. **Pass 3 — Verify:** Run all gates for that item; paste exit codes.
4. **Pass 4 — Claim audit:** Re-read diff vs acceptance criteria; list anything still unverified.

**Sprint exit gate (after all items):** Run full suite in §5.

---

## 4. Browser smoke protocol (Sprint A scope)

Browser QA is **limited** to what Expo web can prove. Native-only behavior is explicitly **NOT CLAIMED**.

### 4.1 When to run browser smoke

Run after **SA-105** (routing fixes) and again at **sprint exit**.

### 4.2 Procedure

```bash
cd /Users/kimberlysmith/Projects/MindfulNest
rm -rf dist
NODE_ENV=production npx expo export --platform web --output-dir dist
```

**Assertions (GATE:browser):**

| # | Check | Pass criterion |
|---|-------|----------------|
| B1 | No dev telemetry in bundle | `grep -rFl '__MINDFULNEST_DEV__\|initDevTelemetry' dist/` → empty |
| B2 | No `/intro` href in source | `grep -r 'href="/intro"' app/` → empty (after SA-105) |
| B3 | Web bundle builds | `dist/` exists, exit 0 |
| B4 | Map route string present | `grep -r 'map_screen' app/index.tsx` → match (sanity) |

**NOT verified by browser (do not claim):**

- Module MP4 playback (`expo-video` native)
- Firebase callable / App Check / auth gate redirect
- iOS Maestro flows

---

## 5. Sprint exit gate (all must pass)

```bash
npm run lint
npm test
npm run test:coppa-contracts
node scripts/check-banned-packages.mjs
npm run test:rules   # requires Java 21 + firebase emulators
```

Expected: all exit 0.

---

## 6. Work items (dependency order)

### SA-001 — Sentry CI alignment (LD-801)

| Field | Value |
|-------|-------|
| **ID** | SA-001 |
| **Classification** | `P0-blocker` |
| **Depends on** | — |
| **Blocks** | SA-002 (CI honesty), all future PRs touching `package-lock.json` |

**Problem (ground truth 2026-05-29):**

- `scripts/check-banned-packages.mjs` line 17 bans `@sentry/` entirely.
- `package.json` depends on `@sentry/react-native` (~7.2.0) per LD-801.
- `eslint.config.js` permits Sentry **only** in `src/services/sentryService.ts`.
- Running `node scripts/check-banned-packages.mjs` today **fails** with 15+ `@sentry/*` hits.

**Required change:**

1. Update `scripts/check-banned-packages.mjs`:
   - Ban `@sentry/*` **except** `@sentry/react-native` (the single permitted top-level dep).
   - Continue banning: `bugsnag`, `rollbar`, `phaser`, `react-native-spine`, `@capacitor/`.
   - Mirror ESLint intent: transitive `@sentry/*` packages are OK **only** as dependencies of `@sentry/react-native`.
2. Update header comment: cite LD-801 narrowing LD-220.
3. Update `.github/workflows/dependency-audit.yml` header comment (lines 4–6) — Sentry permitted via LD-801 wrapper pattern, not blanket banned.

**Acceptance criteria:**

- [ ] `node scripts/check-banned-packages.mjs` → exit 0
- [ ] `grep '@sentry/react-native' package.json` → present
- [ ] `grep -v 'LD-801' scripts/check-banned-packages.mjs` → file mentions LD-801
- [ ] Adding `@sentry/browser` as direct dep would still fail (manual sanity — optional)

**Gates:** `GATE:banned`, `GATE:grep`

**Out of scope:** Changing Sentry init behavior; `SENTRY_DSN` EAS env (Sprint E).

---

### SA-002 — Root app CI workflow

| Field | Value |
|-------|-------|
| **ID** | SA-002 |
| **Classification** | `P0-blocker` |
| **Depends on** | SA-001 |
| **Blocks** | Confident merges on `app/**`, `src/**` |

**Problem:**

- No workflow runs root `npm test`, `npm run lint`, or `npm run test:coppa-contracts`.
- Functions CI and Firestore rules CI exist; app layer is ungated.

**Required change:**

Create `.github/workflows/app-ci.yml`:

```yaml
name: App CI
on:
  pull_request:
    branches: [main]
    paths:
      - 'app/**'
      - 'src/**'
      - 'scripts/**'
      - 'package.json'
      - 'package-lock.json'
      - 'eslint.config.js'
      - 'jest.config.js'
      - 'tsconfig.json'
      - '.github/workflows/app-ci.yml'
  push:
    branches: [main]
    paths: [same as above]

jobs:
  app-ci:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.11.0'
          cache: npm
      - run: npm ci --no-audit --no-fund
      - run: npm run lint
      - run: npm test
      - run: npm run test:coppa-contracts
      - run: node scripts/check-banned-packages.mjs
```

**Acceptance criteria:**

- [ ] File exists at `.github/workflows/app-ci.yml`
- [ ] Triggers on `app/**` and `src/**` changes
- [ ] All five steps present
- [ ] Local dry-run: same five commands exit 0

**Gates:** `GATE:lint`, `GATE:unit`, `GATE:coppa`, `GATE:banned`

**Out of scope:** Firestore rules (separate workflow); Maestro; EAS builds.

---

### SA-003 — Cursor project rules

| Field | Value |
|-------|-------|
| **ID** | SA-003 |
| **Classification** | `P2-hygiene` |
| **Depends on** | — (parallel with SA-001) |
| **Blocks** | Safer autonomous agents in Sprint B+ |

**Required change:**

Create `.cursor/rules/` with three `.mdc` files:

#### `mindfulnest-architecture.mdc` (`alwaysApply: true`)

Must include verbatim constraints:

- LD-280: one atomic MP4 per module; one `expo-video`; no multi-screen module flow.
- Banned routes/files: `app/intro.tsx`, `phase_a.tsx`, `phase_b.tsx`, `resolution.tsx`, `win.tsx`, `decoration.tsx` (enforced by `legacy-file-gate.yml`).
- Map → module via `/module/[moduleId]`, never `/intro`.
- LD-801: import Sentry only via `src/services/sentryService.ts`.

#### `mindfulnest-firebase.mdc` (`globs: firestore/**,functions/**`)

- COPPA: functions touching `/children/*` must import `withCoppaGuard`.
- Run `npm run test:rules` after rules changes.
- `us-central1` region for functions.

#### `mindfulnest-app.mdc` (`globs: app/**,src/**`)

- Import auth from `src/services/auth.ts`, not `firebase/auth`.
- No `@sentry/*` except in `sentryService.ts`.
- Test commands before claiming done.

**Acceptance criteria:**

- [ ] Three files exist under `.cursor/rules/`
- [ ] Each has valid YAML frontmatter (`description`, `globs` or `alwaysApply`)
- [ ] `grep -l 'LD-280' .cursor/rules/*.mdc` → at least one match
- [ ] `grep -l 'LD-801' .cursor/rules/*.mdc` → at least one match

**Gates:** `GATE:grep`

**Out of scope:** Personal Cursor user rules; Notion sync.

---

### SA-004 — Stale App Check comment (optional hygiene)

| Field | Value |
|-------|-------|
| **ID** | SA-004 |
| **Classification** | `P2-hygiene` |
| **Depends on** | — |
| **Blocks** | — |

**Problem:**

- `src/services/appCheckService.ts` header says CFs have `enforceAppCheck: false`.
- `functions/src/triggers/https/generateModuleDownloadUrl.ts` line 50: `enforceAppCheck: true`.
- `claimTherapistInvite.ts` also enforces App Check.

**Required change:**

Update `appCheckService.ts` header to reflect LD-802 gate closed 2026-05-25: client init required; CFs enforce App Check on callables.

**Acceptance criteria:**

- [ ] Comment no longer claims `enforceAppCheck: false` on CFs
- [ ] No code behavior change

**Gates:** `GATE:lint`

**Kim option:** Include in Sprint A (low risk) or defer. **Default: include.**

---

### SA-005 — Map navigation fix (LD-280)

| Field | Value |
|-------|-------|
| **ID** | SA-005 |
| **Classification** | `P0-blocker` |
| **Depends on** | SA-003 (rules prevent reintroducing `/intro`) |
| **Blocks** | User tap-to-play; browser smoke B2 |

**Problem (ground truth):**

- `app/index.tsx` line 49: `<Link href="/intro">` — route does not exist.
- `legacy-file-gate.yml` bans `app/intro.tsx`.
- LD-280: module playback is `/module/[moduleId]` only.

**Required change:**

1. Change map start button href from `/intro` to `/module/m1`.
2. Update button label to reflect Tessa / M1 (optional but recommended): e.g. `"Start M1 — Tessa"`.
3. Do **not** create `app/intro.tsx` or any legacy screen files.

**Acceptance criteria:**

- [ ] `grep 'href="/intro"' app/` → no matches
- [ ] `grep 'href="/module/m1"' app/index.tsx` → match
- [ ] `testID="map_start_module_button"` preserved (Maestro Tier 1 / home_screen.yaml)
- [ ] `legacy-file-gate` banned files still absent

**Gates:** `GATE:grep`, `GATE:legacy`, `GATE:lint`, `GATE:browser` (after SA-006)

**Out of scope:** Per-creature links (SA-105 stretch / Sprint B); progression unlock gate.

---

### SA-006 — Remove stale Stack.Screen registrations

| Field | Value |
|-------|-------|
| **ID** | SA-006 |
| **Classification** | `P1-regression` |
| **Depends on** | SA-005 |
| **Blocks** | Clean expo-router config |

**Problem (ground truth):**

`app/_layout.tsx` lines 86–91 register screens that have no files:

- `intro`, `phase_a`, `phase_b`, `resolution`, `win`, `decoration`

Files that **must remain**:

- `(auth)`, `index`, `module/[moduleId]`
- `dev/video-test` exists but is not in Stack — OK (expo-router file-based)

**Required change:**

Remove the six stale `<Stack.Screen name="..." />` entries. Keep `(auth)`, `index`, `module/[moduleId]`.

**Acceptance criteria:**

- [ ] `grep 'name="intro"' app/_layout.tsx` → no match
- [ ] `grep 'module/\[moduleId\]' app/_layout.tsx` → match
- [ ] `grep 'name="index"' app/_layout.tsx` → match
- [ ] No new screen files created

**Gates:** `GATE:lint`, `GATE:grep`, `GATE:legacy`

**Out of scope:** Adding reward/decoration routes (future stock-RN screens per master spec §3.2).

---

### SA-007 — M5 creature name alignment

| Field | Value |
|-------|-------|
| **ID** | SA-007 |
| **Classification** | `P1-regression` |
| **Depends on** | — |
| **Blocks** | Content consistency |

**Problem (ground truth):**

| Location | M5 name |
|----------|---------|
| `app/index.tsx` line 46 | **Mo** |
| `app/module/[moduleId].tsx` line 38 | **Bork** |
| `src/types/enums.ts` line 27 | **`mo`** (Firestore id); comment: was "Bork" in narrative |
| `functions/src/config/moduleRewards.ts` line 10 | comment says **Bork** |

**Kim locked decision for Sprint A (pending confirmation):**

- **Child-facing display name: `Mo`** — aligns with map, Firestore `CreatureId`, CDM.
- **Change:** `MODULE_TITLES.m5` in `app/module/[moduleId].tsx` → `'Mo — Grounding Stone'`.
- **Optional P2:** Update comment in `moduleRewards.ts` to `M5 Mo` (no runtime change).

**Acceptance criteria:**

- [ ] `grep 'Bork' app/` → no matches
- [ ] `grep 'Mo — Grounding Stone' app/` → matches in index + module screen
- [ ] `grep 'map_creature_mo' app/index.tsx` → match (Maestro home_screen.yaml)

**Gates:** `GATE:grep`, `GATE:lint`, `GATE:unit`

**If Kim rejects:** Stop and re-spec before implementing.

---

## 7. Execution order summary

```
SA-001 (Sentry CI)
    ↓
SA-002 (app-ci.yml)
SA-003 (cursor rules) ── parallel with 001
SA-004 (App Check comment) ── optional parallel
    ↓
SA-005 (intro → /module/m1)
    ↓
SA-006 (stale Stack screens)
    ↓
SA-007 (Mo name)
    ↓
Sprint exit gate (§5) + browser smoke (§4)
```

---

## 8. Stretch goal (Kim opt-in only)

### SA-105 — Per-creature map links

| Field | Value |
|-------|-------|
| **Classification** | `P1-regression` |
| **Depends on** | SA-005, SA-007 |
| **Default** | **Deferred to Sprint B** |

Replace single start button with six pressables:

| testID | href | Creature |
|--------|------|----------|
| `map_creature_tessa` (tappable) | `/module/m1` | Tessa |
| `map_creature_luna` | `/module/m2` | Luna |
| … | … | … |

**Why deferred:** Maestro `home_screen.yaml` expects creature rows as text, not buttons; changing testIDs/tap targets needs coordinated Maestro update (Sprint B).

---

## 9. Risk register

| Risk | Mitigation |
|------|------------|
| Auth gate redirects unsigned users away from `/module/m1` | Expected; Sprint B (LD-278 + Maestro auth). Sprint A only fixes href target. |
| Web export ≠ iOS behavior | §4 documents limits; do not claim native QA |
| `npm run test:rules` slow / needs Java | Run at sprint exit; not per-item |
| Kim rejects Mo vs Bork | §SA-007 blocked until decision |

---

## 10. Deliverables checklist

- [x] All SA-001..007 complete with 4-pass logs
- [x] Sprint exit gate §5 green
- [x] Browser smoke §4 green (B1–B3; web export only)
- [x] No commits until Kim requests (agent stops at "ready to commit")
- [x] Short completion report: item → gates → evidence (see §13)

---

## 13. Execution report (2026-05-29)

| Item | Status | Evidence |
|------|--------|----------|
| SA-001 | DONE | `node scripts/check-banned-packages.mjs` → exit 0 |
| SA-002 | DONE | `.github/workflows/app-ci.yml` created |
| SA-003 | DONE | `.cursor/rules/*.mdc` × 3 |
| SA-004 | DONE | `appCheckService.ts` header updated |
| SA-005 | DONE | `/intro` removed; `__DEV__` dev button → `/module/m1` |
| SA-006 | DONE | 6 stale Stack.Screen entries removed |
| SA-007 | DONE | Map **Bork**; testID `map_creature_bork`; Maestro updated |

**Kim decisions applied:** Bork canon; App Check comment yes; scaffold button hidden outside `__DEV__`; real sprite map deferred to later sprint.

**Sprint exit:** lint ✓ | test 55/55 ✓ | coppa ✓ | banned ✓ | rules 142/142 ✓ | web export ✓

**Known follow-ups (not Sprint A):** `maestro/flows/full_module_flow.yaml` still Tier-3 legacy 7-screen flow; Everdale sprite map sprint; `isModuleUnlocked` wiring.

---

## 11. Questions for Kim (approve before implementation)

1. **M5 name:** Confirm **Mo** as child-facing display name? (Recommended: yes, per `enums.ts`)
2. **SA-004:** Include App Check comment fix in Sprint A? (Recommended: yes)
3. **SA-105 stretch:** Per-creature map links in Sprint A or defer to Sprint B? (Recommended: defer)
4. **Button label:** Keep generic "Tap Creature" or rename to "Start M1 — Tessa"? (Recommended: rename)

---

## 12. Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-05-29 | v1.0 | Initial draft from repo ground truth + audit backlog |

# STAGE2 Sprint B — Execution Spec v1

**Status:** EXECUTED 2026-05-31 — executable gates green; LD-278 remains blocked by design  
**Date:** 2026-05-31  
**Agent model:** GPT 5.5 (Agent mode, autonomous with gates)  
**Sprint goal:** Close low-risk auth/callable/cache correctness gaps after Sprint A, while explicitly blocking LD-278 auth persistence until its Firebase migration choice is specified.

---

## 1. Authority Chain

| Document | Role |
|----------|------|
| `APP_ARCHITECTURE_MASTER_v1.md` (Dropbox) | Canonical app architecture |
| `docs/execution/STAGE2_SPRINT_A_EXECUTION_SPEC_v1.md` | Prior completed sprint checkpoint |
| This spec | Sprint B execution scope, gates, and blocker classifications |

---

## 2. Classification Legend

| Tag | Meaning |
|-----|---------|
| `P0-blocker` | Unsafe or unshippable without explicit decision |
| `P1-regression` | Incorrect runtime behavior with local fix available |
| `P2-hygiene` | Cleanup or comments, low runtime impact |
| `P3-deferred` | Valid requirement, not in this sprint |

| Gate | Command / action |
|------|------------------|
| `GATE:lint` | `npm run lint` |
| `GATE:unit` | `npm test` |
| `GATE:coppa` | `npm run test:coppa-contracts` |
| `GATE:rules` | `npm run test:rules` |
| `GATE:functions` | `cd functions && npm test` |
| `GATE:typecheck` | `npx tsc --noEmit` |
| `GATE:browser` | `NODE_ENV=production npx expo export --platform web --output-dir dist` plus grep smoke |

---

## 3. Mandatory Multipass Protocol

Every executable item runs:

1. Ground truth: read code and grep current state.
2. Implement: minimal scoped diff.
3. Verify: run item gates.
4. Claim audit: re-read diff against acceptance criteria.

Do not commit until all Sprint B executable items are complete and Kim asks for the commit.

---

## 4. Work Items

### SB-001 — LD-278 Auth Persistence Decision Blocker

| Field | Value |
|-------|-------|
| Classification | `P0-blocker` |
| Executable in Sprint B | No |

Ground truth:

- `src/services/firebase.ts` documents LD-278: Firebase JS Auth currently uses in-memory persistence.
- `firebase/auth` in installed Firebase v12 does not expose `getReactNativePersistence`.
- `@react-native-firebase/auth` is not installed in `package.json`.

Decision required before implementation:

- Option A: migrate auth wrapper from Firebase JS Auth to `@react-native-firebase/auth`.
- Option B: build/own a custom Firebase JS persistence adapter if a stable supported API exists.
- Option C: defer LD-278 and keep auth persistence listed as a release blocker.

Sprint B action:

- Document as blocked; do not implement via internal Firebase APIs or unsupported shims.

Acceptance:

- This blocker is present in the final report with exact evidence.

---

### SB-002 — Sign-up Claims Retry

| Field | Value |
|-------|-------|
| Classification | `P1-regression` |
| Depends on | none |

Problem:

- `functions/src/triggers/auth/onParentSignup.ts` says client must retry token refresh until `claims.role` appears.
- `app/(auth)/sign-up.tsx` currently calls `refreshClaims()` once and ignores failures.

Required change:

- Add `refreshClaimsUntilRole()` to `src/services/auth.ts`.
- Use it in sign-up after `signUp()`.
- Keep timeout bounded at 5s and interval modest (250ms).

Acceptance:

- Sign-up imports and calls `refreshClaimsUntilRole`.
- `refreshClaims()` remains available for other flows.
- Lint, typecheck, and unit tests pass.

---

### SB-003 — Module Auth Gate Before Callable

| Field | Value |
|-------|-------|
| Classification | `P1-regression` |
| Depends on | SB-002 optional |

Problem:

- `app/module/[moduleId].tsx` starts `resolveModule()` as soon as it renders.
- Root `AuthGate` redirects after auth is signed out, but during loading a deep link can reach module code before auth is known.

Required change:

- Use `useAuth()` in `ModuleScreen`.
- Do not call `resolveModule()` unless `status === 'signedIn'`.
- Show loading while auth status is `loading`.
- Redirect to `/sign-in` when `signedOut`.

Acceptance:

- `resolveModule()` effect is gated by signed-in status.
- Module screen still renders existing download/play/error states for signed-in users.

---

### SB-004 — App Check Readiness Before Module Callable

| Field | Value |
|-------|-------|
| Classification | `P1-regression` |
| Depends on | SB-003 |

Problem:

- `initializeAppCheck()` is fire-and-forget in root layout.
- `generateModuleDownloadUrl` has `enforceAppCheck: true`.
- A module callable can race App Check initialization.

Required change:

- Make `initializeAppCheck()` idempotent and share its promise.
- Export `ensureAppCheckReady()`.
- Await it in `catalogService.resolveModule()` before each `getModuleDownloadUrl()` call.

Acceptance:

- Repeated initialization is safe.
- `catalogService` awaits readiness before module download URL calls.

---

### SB-005 — Cache `markPlayed()` Wiring

| Field | Value |
|-------|-------|
| Classification | `P1-regression` |
| Depends on | none |

Problem:

- `cacheIndex.markPlayed()` exists and is tested.
- Production code never calls it, so LRU is based on download time rather than play recency.

Required change:

- Call `markPlayed(`${moduleId}_module_v1`)` when playback mounts/starts in `useModulePlayback`.

Acceptance:

- `rg "markPlayed" src/hooks src/services` shows production call.
- Unit/lint/typecheck pass.

---

### SB-006 — Low Storage Policy Before Download

| Field | Value |
|-------|-------|
| Classification | `P1-regression` |
| Depends on | none |

Problem:

- `storageCheck.ts` is built and tested but never used.
- Master spec requires blocking new downloads below 500 MB and force-evicting all but active arc below 200 MB.

Required change:

- Add cache-index helper to evict all entries outside the active arc, ignoring 24h floor.
- In `catalogService.resolveModule()` cache-miss path:
  - if `<200 MB`: evict all non-active-arc cached assets, persist/delete files, then throw low-storage error.
  - if `<500 MB`: throw low-storage error without starting download.
  - if ok: continue existing LRU/download path.
- Surface low-storage error message in module screen.

Acceptance:

- Unit tests cover force-evict helper.
- `catalogService` imports and calls `checkDeviceFreeSpace`.
- Module screen distinguishes low storage from generic connectivity.

---

## 5. Browser Smoke

Browser smoke can verify bundle/build/routing only. It does not prove native Firebase Auth persistence, App Check token attachment, or `expo-video` playback.

Run at sprint exit:

```bash
rm -rf dist
NODE_ENV=production npx expo export --platform web --output-dir dist
test -d dist
```

Grep smoke:

```bash
rg "Developer: test module|__MINDFULNEST_DEV__|initDevTelemetry" dist || true
rg "href=\"/intro\"|map_start_module_button" app maestro || true
```

Expected:

- No dev telemetry markers in `dist`.
- No `/intro` or legacy map button regressions.

---

## 6. Sprint Exit Gate

```bash
npm run lint
npm test
npm run test:coppa-contracts
npx tsc --noEmit
npm run test:rules
cd functions && npm test
```

---

## 7. Out of Scope

- Final Everdale sprite map UI.
- Maestro auth seeding.
- `@react-native-firebase/auth` migration.
- Progression unlock gate (`isModuleUnlocked`) unless explicitly moved into Sprint C.

---

## 8. Execution Report

| Item | Status | Evidence |
|------|--------|----------|
| SB-001 LD-278 | BLOCKED | `firebase/auth` exposes no `getReactNativePersistence`; `@react-native-firebase/auth` not installed. No unsupported shim added. |
| SB-002 claims retry | DONE | `refreshClaimsUntilRole()` added and used by sign-up. |
| SB-003 module auth gate | DONE | `ModuleScreen` skips `resolveModule()` unless `status === 'signedIn'`; signed-out redirects to `/sign-in`. |
| SB-004 App Check readiness | DONE | `ensureAppCheckReady()` exported and awaited before module download URL calls. |
| SB-005 cache recency | DONE | `useModulePlayback` calls `markPlayed(`${moduleId}_module_v1`)`. |
| SB-006 low-storage policy | DONE | `catalogService` calls `checkDeviceFreeSpace`; emergency eviction helper added; low-storage UI message added. |
| Tier-3 Maestro legacy flow | DONE | `full_module_flow.yaml` no longer references the removed seven-screen LD-280-banned flow. |

Verification:

- `npm run lint` — pass
- `npm test` — 56/56 pass
- `npx tsc --noEmit` — pass
- `npm run test:coppa-contracts` — pass
- `npm run test:rules` — 142/142 pass
- `npm --prefix functions test` — 99/99 pass
- `NODE_ENV=production npx expo export --platform web --output-dir dist` — pass
- Browser/build smoke: no dev telemetry markers in `dist`; no legacy route/button markers in `app` or `maestro`

Residual blockers:

- LD-278 auth persistence still needs a migration spec choosing between `@react-native-firebase/auth` and a supported Firebase JS persistence adapter.
- Native App Check token attachment and module playback still require iOS simulator/device smoke; web export cannot prove those native paths.


# STAGE2 Sprint C — Execution Spec v1

**Status:** EXECUTED 2026-05-31 — gates green; committed after QA  
**Date:** 2026-05-31  
**Agent model:** GPT 5.5 (Agent mode, autonomous with gates)  
**Sprint goal:** Wire the existing LD-316 Layer 1 progression gate into the module route so deep links cannot skip earlier Arc 1 modules.

---

## 1. Authority Chain

| Document | Role |
|----------|------|
| `APP_ARCHITECTURE_MASTER_v1.md` | Canonical app architecture |
| `src/services/progressionState.ts` | Existing Layer 1 progression storage + pure unlock gate |
| `src/data/arcManifest.ts` | Static module-to-arc manifest |
| `app/module/[moduleId].tsx` | Runtime module route to protect |

---

## 2. Classification Legend

| Tag | Meaning |
|-----|---------|
| `P0-blocker` | Unsafe or unshippable without explicit decision |
| `P1-regression` | Incorrect runtime behavior with local fix available |
| `P2-hygiene` | Cleanup or docs |
| `P3-deferred` | Valid requirement, not in this sprint |

---

## 3. Work Items

### SC-001 — Canonical Arc Module Order

| Field | Value |
|-------|-------|
| Classification | `P1-regression` |
| Depends on | none |

Ground truth:

- `progressionState.isModuleUnlocked()` requires the caller to pass canonical module order.
- `arcManifest.ts` currently exposes module-to-arc only, not order.

Required change:

- Add `ARC_MODULE_ORDER` and `moduleOrderForArc()` to `src/data/arcManifest.ts`.
- Cover Arc 1 order: `m1` → `m6`.
- Add unit tests.

Acceptance:

- Unknown arcs return `undefined`.
- Arc 1 order is stable and lowercase.

---

### SC-002 — Module Route Unlock Gate

| Field | Value |
|-------|-------|
| Classification | `P1-regression` |
| Depends on | SC-001 |

Ground truth:

- `useModulePlayback` writes progression on `playToEnd`.
- `/module/[moduleId]` does not read progression before resolving/downloading a module.
- A signed-in deep link to `/module/m3` can currently attempt download/play without `m1` and `m2` completed.

Required change:

- In `app/module/[moduleId].tsx`, before `resolveModule()`:
  - derive `arcId` via `arcIdForModule(moduleId)`
  - derive order via `moduleOrderForArc(arcId)`
  - load local progression via `loadProgression(arcId)`
  - call `isModuleUnlocked(progression, moduleId, order)`
- If locked, render a locked state with Back to map only; no retry.
- If unknown module/order, render existing error state.

Acceptance:

- `resolveModule()` is not called for locked modules.
- First module remains available with no progression.
- Non-first module is locked unless all prior modules complete.

---

### SC-003 — LD-278 Persistence Remains Blocked

| Field | Value |
|-------|-------|
| Classification | `P0-blocker` |
| Depends on | none |

This sprint must not implement auth persistence. Sprint B ground truth showed the current Firebase JS SDK does not expose `getReactNativePersistence`, and migrating to React Native Firebase auth likely also requires reviewing callable auth attachment (`firebase/functions` currently uses Firebase JS Auth).

Acceptance:

- No auth dependency changes.
- Final report lists LD-278 as a separate migration spec.

---

## 4. Verification Gates

Run:

```bash
npm run lint
npm test
npx tsc --noEmit
npm run test:coppa-contracts
npm run test:rules
npm --prefix functions test
```

Browser/build smoke:

```bash
rm -rf dist
NODE_ENV=production npx expo export --platform web --output-dir dist
```

Smoke assertions:

- no dev telemetry markers in `dist`
- no legacy `/intro` route or old scaffold button markers in `app` or `maestro`
- module locked UI testID appears in source

---

## 5. Out of Scope

- Final Everdale sprite map.
- Cross-device Firestore progression mirror.
- Auth persistence migration.
- Maestro authenticated native seeding.

---

## 6. Execution Report

| Item | Status | Evidence |
|------|--------|----------|
| SC-001 canonical Arc 1 order | DONE | `ARC_MODULE_ORDER` and `moduleOrderForArc()` added; manifest tests added. |
| SC-002 module route unlock gate | DONE | `/module/[moduleId]` loads progression and calls `isModuleUnlocked()` before `resolveModule()`; locked modules render `module_screen_locked`. |
| SC-003 LD-278 persistence | BLOCKED | No auth dependency/API changes; requires separate migration spec. |

Verification:

- Targeted manifest/progression tests — 23/23 pass
- `npm run lint` — pass
- `npm test` — 60/60 pass
- `npx tsc --noEmit` — pass
- `npm run test:coppa-contracts` — pass
- `npm run test:rules` — 142/142 pass (first emulator startup attempt hit local Firebase Tools config-store access, standalone rerun passed)
- `npm --prefix functions test` — 99/99 pass
- `NODE_ENV=production npx expo export --platform web --output-dir dist` — pass
- Browser/build smoke: no dev telemetry markers in `dist`; no legacy route/button markers in `app` or `maestro`; locked module UI testID present in source

Residual:

- Native iOS proof still needed for actual `expo-video`, App Check token attachment, and authenticated module playback.


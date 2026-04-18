# MindfulNest Maestro — Reliability Tiers

**Locked:** 2026-04-17 via Phase 0 4+4 (preflight #28, Path A approved by Kim).
**Authority:** Directus locked decisions LD-117, LD-118, LD-120 (Maestro working flows + testID strategy + iOS workaround protocol).

---

## The 3 Tiers

| Tier | Definition | CI lane | Examples |
|---|---|---|---|
| **1** | Deterministic. No UI hierarchy assertions, no fragile timing. Proven reliable on iOS sim. | **Every PR** to main (`.github/workflows/maestro-tier1.yml`) | `smoke_launch.yaml` |
| **2** | Timing-sensitive OR uses `assertVisible`. Hits the iOS accessibility bug intermittently per LD-118/LD-120. | Nightly (not yet wired — separate blocker) | `home_screen.yaml` |
| **3** | Full integration. Multi-screen end-to-end flow. Depends on screens not yet built. | Pre-release tag only (not yet wired — separate blocker) | `full_module_flow.yaml` |

---

## Why this split

**LD-117 `MAESTRO_WORKING_FLOWS` (verbatim):** "Smoke flow launches MindfulNest on iPhone 17 simulator and captures screenshot successfully. Known issue: assertions involving UI hierarchy queries (assertVisible after first assertion) fail intermittently on iOS."

**LD-118 `MAESTRO_TESTID_STRATEGY` (verbatim summary):** assertVisible with text selectors fails on iOS due to React Native accessibility tree issue (GitHub #3056). Stage 1 uses `takeScreenshot` only. Stage 2 flows switched to `id:` selectors.

**LD-120 `MAESTRO_IOS_WORKAROUND_PROTOCOL` (verbatim summary):** Maestro `assertVisible` fails after first assertion on iOS (kAXErrorInvalidUIElement — React Native accessibility tree not re-registering). Smoke flows MUST use `takeScreenshot` only.

Tier 1 = anything that respects LD-120's "no assertVisible after first one" constraint. Tier 2 = anything that uses `assertVisible` (will be flaky on iOS per LD-118/120 until the underlying RN bug is fixed). Tier 3 = anything that depends on app code that doesn't exist yet.

---

## How to assign a tier (decision rule)

A flow is **Tier 1** if and only if ALL three are true:
1. No `assertVisible` after `launchApp` + `waitForAnimationToEnd` (or only ONE total `assertVisible`).
2. All app screens it touches actually exist in the current app build (no stub screens).
3. Has been run successfully on iOS simulator at least once and the result was reproducible.

If any condition fails: Tier 2. If the flow hits ≥3 different app screens end-to-end: Tier 3.

---

## How to mark a flow's tier

Add a single comment line at the top of the flow YAML, BEFORE `appId:`, using this **exact** anchored format (the CI workflow greps for it):

```yaml
# Reliability-tier: 1
appId: com.mindfulnest.app
---
# ... rest of flow
```

Allowed values: `1`, `2`, `3`. The CI workflow `maestro-tier1.yml` will fail the build if any flow in `maestro/flows/**.yaml` lacks this marker — preventing silent CI drop on refactors (per Phase 0 finding C3-F5).

---

## Adding new flows

When the flow library exceeds ~8 flows, this doc will need a richer assignment-rule section. Today, with 3 flows, the decision rule above is sufficient.

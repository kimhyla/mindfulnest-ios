# STAGE2 Sprint D — Everdale Map UX Execution Spec v1

**Status:** DRAFT — awaiting Kim approval before implementation  
**Date:** 2026-06-01  
**Sprint goal:** Replace the Stage 1 text scaffold with kid-facing Everdale map navigation — scrollable map, creature sprite taps, progression-aware locks — per master spec §3.2 and `.cursor/rules/mindfulnest-architecture.mdc`.

---

## 1. Authority chain

| Document | Role |
|----------|------|
| `APP_ARCHITECTURE_MASTER_v1.md` (Dropbox) §3.2 | Shipping UX: scrollable Everdale WebP map; creature taps start modules |
| `.cursor/rules/mindfulnest-architecture.mdc` | No generic start button in production; dev scaffold `__DEV__` only |
| `docs/execution/STAGE2_SPRINT_A_EXECUTION_SPEC_v1.md` SA-105 | Per-creature links deferred from Sprint A |
| `src/services/progressionState.ts` + `src/data/arcManifest.ts` | Unlock gate already wired on `/module/[moduleId]` (Sprint C) |
| **This spec** | Sprint D scope, phases, gates |

---

## 2. Ground truth (repo audit 2026-06-01)

| Finding | Implication |
|---------|-------------|
| `app/index.tsx` is a **text list** + `__DEV__` test button | Not shipping UX |
| **No** `everdale*.webp` or map sprites under `assets/` | Full visual map blocked until art lands in repo |
| `isModuleUnlocked()` works on module route | Map should **prevent or soften** locked taps; module route remains backstop |
| `map_creature_*` testIDs exist on `<Text>` rows | Must move to **Pressable** sprites without breaking Maestro tier strategy |
| Maestro `home_screen.yaml` expects text rows + dev button | Tier 2 — update when map ships; Tier 1 `smoke_launch.yaml` stays screenshot-only |
| LD-280 / single MP4 | Map only **navigates** to `/module/mX`; no new module screens |

---

## 3. Classification legend

| Tag | Meaning |
|-----|---------|
| `P0-blocker` | Cannot ship kid-facing map without Kim decision or asset |
| `P1-regression` | Wrong navigation / unlock UX |
| `P2-hygiene` | Maestro, docs, dev scaffold cleanup |
| `P3-deferred` | Valid, not Sprint D |

---

## 4. Creature ↔ module canon (Arc 1)

| Module | Creature (child-facing) | Firestore `CreatureId` | testID (keep stable) |
|--------|-------------------------|------------------------|----------------------|
| m1 | Tessa | `tessa` | `map_creature_tessa` |
| m2 | Luna | `luna` | `map_creature_luna` |
| m3 | Benson | `benson` | `map_creature_benson` |
| m4 | Ember | `ember` | `map_creature_ember` |
| m5 | Bork | `mo` | `map_creature_bork` |
| m6 | Bramble | `bramble` | `map_creature_bramble` |

Display order on map follows **narrative geography**, not m1–m6 sort order (same as current scaffold list).

---

## 5. Phased delivery (recommended)

Sprint D splits so engineering can proceed **before** final art is in git.

### Phase D1 — Map shell + taps + locks (no final WebP required)

**Kid-visible in production/preview builds.**

| ID | Work | Classification |
|----|------|----------------|
| SD-001 | Add `src/data/mapManifest.ts`: creature → `moduleId`, hit region metadata (percent-based x/y/width/height for now) | P1 |
| SD-002 | Add `src/components/EverdaleMap.tsx`: `ScrollView` (horizontal or vertical per art aspect), absolute-positioned `Pressable` sprites | P1 |
| SD-003 | Replace `app/index.tsx` body with `<EverdaleMap />`; keep `testID="map_screen"` on root | P1 |
| SD-004 | Load `loadProgression('arc1')` on mount; `isModuleUnlocked` per creature; **locked** = non-navigating press + accessible label ("locked") | P1 |
| SD-005 | **Unlocked** tap → `router.push('/module/' + moduleId)` (same as deep link) | P1 |
| SD-006 | Interim visuals: solid-color map placeholder OR low-res placeholder PNG per creature in `assets/map/placeholders/` until WebP ships | P0 if no placeholder approved |
| SD-007 | Remove text-only creature rows; retain `map_creature_*` testIDs on Pressables | P2 |
| SD-008 | Keep `map_dev_test_module_button` **`__DEV__` only** (unchanged policy) | P2 |

**D1 exit:** Parent/child in preview build sees scrollable map, taps Tessa → m1; locked creatures do not enter module route (or show inline locked hint — pick one in §8).

### Phase D2 — Production Everdale WebP + sprite art

**Blocked on Kim delivering assets into repo.**

| ID | Work | Classification |
|----|------|----------------|
| SD-010 | Add `assets/map/everdale-arc1.webp` (and `@2x/@3x` if needed) | P0-blocker |
| SD-011 | Replace placeholder background with `Image` / `expo-image` inside scroll content | P1 |
| SD-012 | Swap placeholder sprites for final creature PNG/WebP; bind hit regions to design coordinates | P1 |
| SD-013 | Optional: `CreatureMapState` visuals (`distressed` / `idle` / `happy`) from progression — **defer to D3** unless art pack includes all states | P3 |

### Phase D3 — Polish (post-D2, optional same sprint if time)

| ID | Work | Classification |
|----|------|----------------|
| SD-020 | Haptic + brief locked animation (no modal stack) | P3 |
| SD-021 | Maestro Tier 2 `home_screen.yaml` → tap `map_creature_tessa`, assert module route screenshot | P2 |
| SD-022 | Reduce motion / accessibility: `accessibilityRole="button"`, locked state announced | P2 |

---

## 6. Explicit out of scope (Sprint D)

- Firestore progression mirror (LD-316 Layer 2)
- New module playback / LD-280 route changes
- Store / decoration / carousel
- Therapist portal map
- Replacing Tier-1 Maestro with map tap flows (stay Tier 2/3)

---

## 7. File plan (D1)

| File | Action |
|------|--------|
| `src/data/mapManifest.ts` | **New** — creatures, moduleIds, layout rects |
| `src/components/EverdaleMap.tsx` | **New** — scroll + sprites |
| `app/index.tsx` | **Refactor** — thin wrapper |
| `src/data/__tests__/mapManifest.test.ts` | **New** — canon + rect sanity |
| `assets/map/placeholders/` | **New** — interim art (if Kim approves placeholders) |
| `maestro/flows/home_screen.yaml` | **Update** in D2/D3 when tap targets change |

---

## 8. Decisions needed from Kim (approve before D1 code)

1. **Map scroll axis:** horizontal (wide Everdale panorama) or vertical? *(Master spec implies scrollable; confirm with art.)*
2. **Locked creature UX:** (A) tap does nothing + subtle shake, (B) tap shows one-line toast, (C) tap still opens module locked screen. **Recommend A** — module route stays backstop for deep links only.
3. **D1 without final WebP:** OK to ship **colored placeholder map + simple creature circles** until Dropbox art is exported to `assets/map/`? **Recommend yes** — unblocks navigation QA.
4. **Asset delivery:** Dropbox path + export format for `everdale-arc1.webp` and six creature sprites (PNG vs WebP, pixel dimensions).
5. **Hit regions:** Design provides %/px coordinates JSON, or engineering measures from Figma export?

---

## 9. Verification gates

### Per-item (agent)

```bash
npm run qa:pre-push
```

### Sprint exit

```bash
npm run qa:pre-push
npm run test:rules          # if firestore touched
npm test -- --testPathPattern=mapManifest
```

### Manual smoke (Kim or agent on simulator)

1. Signed-in parent → map visible (not text scaffold).
2. Tap Tessa → `/module/m1` loading/playback.
3. Without completing m1, tap Luna → **does not** play m2 (D1 locked UX).
4. `__DEV__` only: dev test button still present; **production/preview build** has no generic start button.

### CI

- PR to `main` — all existing required checks green (no new workflow required for D1).

---

## 10. Implementation order (D1)

```
SD-001 mapManifest + tests
    ↓
SD-002 EverdaleMap component (placeholder art)
    ↓
SD-003..005 wire index + progression + router
    ↓
SD-007 testIDs + remove text rows
    ↓
SD-008 confirm __DEV__ dev button
    ↓
Exit gate §9
    ↓
(D2 when assets land: SD-010..012)
```

---

## 11. Risk register

| Risk | Mitigation |
|------|------------|
| No map art in repo | D1 placeholders; D2 gated on Kim asset drop |
| Maestro LD-118/120 accessibility on iOS 26 | Tier 1 unchanged; map tap flows Tier 2+ with screenshots |
| Hit targets too small for children | Min 44×44 pt touch targets; design review |
| Deep link bypass | Module route lock unchanged (Sprint C) |

---

## 12. Success criteria (kid-facing)

- Child opens app → sees **Everdale map**, not a text list.
- Child taps a creature → starts that module (if unlocked).
- No generic "Start module" in production/preview.
- Progression respected on map and on module route.

---

## 13. Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-06-01 | v1 | Initial Sprint D spec from post–PR-32 ground truth |

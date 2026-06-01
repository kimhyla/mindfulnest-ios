# STAGE2 Sprint D — Everdale Map UX Execution Spec v2

**Status:** DRAFT — awaiting Kim approval before implementation  
**Date:** 2026-06-01 (v2 revision — art pipeline + Magic Tap + per-arc scroll)  
**Sprint goal:** Replace the Stage 1 text scaffold with kid-facing Everdale map navigation — scrollable map, creature sprite taps, progression-aware locks — per master spec §3.2 and `.cursor/rules/mindfulnest-architecture.mdc`.

**v2 change summary:** Splits work into **D0 (layout + art pipeline lock)** before any app code. Adds **per-arc scroll axis**, **Magic Tap as a separate interaction mode** (post–Event 3), and a **manifest-first** workflow so final art is an asset swap, not a code rewrite.

---

## 1. Authority chain

| Document | Role |
|----------|------|
| `APP_ARCHITECTURE_MASTER_v1.md` (Dropbox) §3.2 | Shipping UX: scrollable WebP map; creature taps start modules |
| `GAMEPLAY_SCOPE_v3.md` + LD-338 | Magic Tap on map (wand particles, creature reactions, coin/rare drops) |
| `MINDFULNEST_MASTER_TECHNICAL_SPEC_v6.md` §6.1, §6.9 | Full V1 map vision (parallax, arc zones, time-of-day) — **phased below** |
| `CLAUDE.md` Rules 6.1–6.2 + `resize_to_delivery.py` | Image pipeline: 2048 PNG masters → WebP q80/q75 delivery @ 1280 px long edge |
| `.cursor/rules/mindfulnest-architecture.mdc` | No generic start button in production; dev scaffold `__DEV__` only |
| `src/services/progressionState.ts` + `src/data/arcManifest.ts` | Unlock gate already wired on `/module/[moduleId]` (Sprint C) |
| **This spec** | Sprint D scope, phases, gates |

---

## 2. Ground truth (repo audit 2026-06-01)

| Finding | Implication |
|---------|-------------|
| `app/index.tsx` is a **text list** + `__DEV__` test button | Not shipping UX |
| **No** map WebP or creature sprites under `assets/` | Full visual map blocked until D0 layout lock + asset drop |
| `isModuleUnlocked()` works on module route | Map should **prevent or soften** locked taps; module route remains backstop |
| `map_creature_*` testIDs exist on `<Text>` rows | Must move to **Pressable** sprites without breaking Maestro tier strategy |
| `magicTapTier` (1–5) exists on `Child` in CDM | Magic Tap **UI + gating** not built; tier/skins deferred to D2 |
| `CreatureMapState` = `distressed` \| `idle` \| `happy` in schema | Visual states deferred until art pack includes all three per creature |
| Maestro `auth_persistence_smoke.yaml` asserts `"Everdale Map"` text | Title can stay; creature rows become sprites |
| LD-280 / single MP4 | Map only **navigates** to `/module/mX`; no new module screens |
| `Production/tools/storyboard-v2/ProductionMapTab.tsx` | **Module production status** — not app map art tooling |

---

## 3. Kim decisions captured (2026-06-01)

| # | Decision | Spec treatment |
|---|----------|----------------|
| K1 | **Per-arc scroll axis** — e.g. Arc 1 horizontal, some homeworlds vertical | `scrollAxis` per arc in map manifest |
| K2 | **Magic Tap** unlocks after **Event 3** (Oliver / wand narrative) | Separate **wand mode**; does not replace module-start taps |
| K3 | Magic Tap: tap creatures → giggle/oof; tap plants → magic burst; later wins change effect skins/colors via `magicTapTier` | D2 scope; D1 builds hook points only |
| K4 | **Art pipeline discussion before code** | D0 must complete before D1 |
| K5 | Hit regions / coordinates | Defined in D0 layout lock — not guessed during D1 coding |

---

## 4. Classification legend

| Tag | Meaning |
|-----|---------|
| `P0-blocker` | Cannot proceed without Kim decision or asset |
| `P1-regression` | Wrong navigation / unlock UX |
| `P2-hygiene` | Maestro, docs, dev scaffold cleanup |
| `P3-deferred` | Valid, not this sprint phase |

---

## 5. Creature ↔ module canon (Arc 1)

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

## 6. The low-iteration strategy (read this first)

The biggest source of rework is **painting art first, then measuring tap targets in code**. We invert that:

```mermaid
flowchart LR
  A[D0 Layout lock] --> B[D1 Engine + placeholders]
  B --> C[D2 Magic Tap mode]
  C --> D[D3 Final art swap]
  D --> E[D4 Polish + parallax]
```

### 6.1 One manifest drives everything

Each arc gets a **single JSON manifest** checked into the repo (e.g. `src/data/maps/arc1.map.json`). It is the contract between art and engineering:

- Canvas size (design pixels) — e.g. Arc 1: `3840 × 1080` horizontal
- `scrollAxis`: `"horizontal"` \| `"vertical"`
- Background asset id(s)
- Hotspots: creatures, plants, decor — each with **normalized rect** `(x, y, w, h)` in 0–1 space relative to canvas
- `interaction`: `"startModule"` \| `"magicTap"` \| `"locked"` \| `"none"`
- Optional: `creatureMapState` asset suffix when art supports distressed/idle/happy

**Rule:** Engineering never hardcodes pixel positions. Art never ships without updating the manifest (or confirming positions unchanged).

### 6.2 Layout lock before painting (D0 exit gate)

Before final illustration:

1. Kim picks **one composition** at the target aspect ratio (rough sketch, AI draft, or collage — quality irrelevant).
2. Creature + plant **anchor points** are marked on that composition.
3. Manifest JSON is written and Kim signs off: *"creatures live here."*
4. Final art is painted **to that composition** — not freehand then retrofitted.

This one step eliminates most coordinate iteration.

### 6.3 Existing production image pipeline (already built)

Per Dropbox `CLAUDE.md` + `Production/scripts/resize_to_delivery.py`:

| Stage | Location | Ships? |
|-------|----------|--------|
| Master | `masters/` — 2048 px PNG | **Never** |
| Delivery | `delivery/` — WebP q80 (hero/sprites), q75 (backgrounds), long-edge ≤ 1280 px | **Yes — bundled or downloaded** |
| Registry | Directus `prod_assets` with `parent_asset_id`, `role='delivery'` | Source of truth for production |

**App repo path (Sprint D):** `assets/map/arc1/` — committed delivery WebPs for Arc 1 (small enough to bundle; larger arcs may follow arc-at-a-time download pattern later).

**Automation Kim already has:** run `resize_to_delivery.py` after master PNG lands → delivery WebP + Directus row. No new tooling required for Sprint D.

### 6.4 Placeholders that don't get thrown away

D1 uses the **same manifest** with:

- Solid-color or low-res background matching canvas aspect ratio
- Simple circle/emoji sprites at manifest rects

When D3 final art arrives: swap image files + run delivery script. **Zero layout code changes** if manifest rects unchanged.

### 6.5 Two tap modes (avoids Magic Tap / module-start confusion)

| Mode | When | Creature tap | Plant tap |
|------|------|----------------|-----------|
| **Navigate** (default) | Always | Unlocked → `/module/mX`; locked → soft feedback | No-op or subtle rustle |
| **Wand** | After Event 3 + child toggles wand ON | Reaction animation + sound (giggle/oof); **does not** start module | Magic burst particle + optional coin roll (LD-338) |

**UX invariant:** Module start requires **Navigate mode**. Wand mode shows visible wand icon (lit). Toggling wand OFF returns to Navigate instantly.

This matches Kim's intent: Magic Tap is **play**, not navigation.

### 6.6 What we deliberately defer (fewer iterations now)

Full V1 map vision includes 3 parallax layers, 10 arc zones, time-of-day tint (master spec §6.1). **Not in D1–D3.** Ship flat background + sprites first; add parallax in D4 only after Arc 1 navigation + Magic Tap feel correct.

---

## 7. Phased delivery

### Phase D0 — Layout lock + art pipeline (NO app code)

**Exit before any D1 coding.**

| ID | Work | Owner | Classification |
|----|------|-------|----------------|
| SD-000 | Kim: Arc 1 composition sketch at horizontal aspect (~3.5:1 or similar) with creature positions marked | Kim | P0-blocker |
| SD-001 | Write `src/data/maps/arc1.map.json` from approved layout (canvas px, scrollAxis, hotspots) | Agent + Kim review | P0-blocker |
| SD-002 | Add `scripts/qa/validate-map-manifest.mjs` — schema check, min touch target (44 pt equivalent at reference width), no duplicate moduleIds | Agent | P1 |
| SD-003 | Kim: confirm locked UX for **Navigate + locked creature** — recommend (A) tap does nothing + subtle shake, no toast | Kim | P0-blocker |
| SD-004 | Document asset naming convention: `arc1_bg.webp`, `arc1_creature_tessa_idle.webp`, etc. | Agent | P2 |
| SD-005 | Kim: first master PNGs OR approve D1 placeholder-only until masters ready | Kim | P0-blocker |

**D0 exit:** Signed-off `arc1.map.json` + validation script green + locked-creature UX chosen.

### Phase D1 — Map navigation engine (manifest-driven, placeholder art OK)

**Kid-visible in production/preview builds.**

| ID | Work | Classification |
|----|------|----------------|
| SD-010 | `src/data/mapManifest.ts` — loader/types for per-arc JSON; re-export Arc 1 | P1 |
| SD-011 | `src/components/EverdaleMap.tsx` — `ScrollView` horizontal/vertical from manifest; `expo-image` background; absolute `Pressable` hotspots | P1 |
| SD-012 | Replace `app/index.tsx` body with `<EverdaleMap arcId="arc1" />`; keep `testID="map_screen"` | P1 |
| SD-013 | Load `loadProgression('arc1')`; `isModuleUnlocked` per creature; locked = non-navigating press + shake (per D0 decision) | P1 |
| SD-014 | Unlocked tap (Navigate mode) → `router.push('/module/' + moduleId)` | P1 |
| SD-015 | Placeholder visuals from manifest rects (colored bg + simple sprites) | P1 |
| SD-016 | Preserve `map_creature_*` testIDs on Pressables; remove text rows | P2 |
| SD-017 | Keep `map_dev_test_module_button` **`__DEV__` only** | P2 |

**D1 exit:** Child taps Tessa → m1; locked Luna does not enter m2; no generic start button in preview.

### Phase D2 — Magic Tap layer (post–Event 3)

**Depends on narrative unlock signal** (local flag until Firestore child doc wired in app).

| ID | Work | Classification |
|----|------|----------------|
| SD-020 | Wand toggle UI (visible only when `magicTapUnlocked`) | P1 |
| SD-021 | Wand mode: creature `magicTap` reactions (Reanimated + optional bundled sound stub) | P1 |
| SD-022 | Wand mode: plant `magicTap` burst effect | P1 |
| SD-023 | Hook `magicTapTier` for effect variant selection (tier 1 default; skins when art exists) | P2 |
| SD-024 | LD-338 coin/rare drop roll — **stub or defer** if Cloud Function not ready; UI must not block | P3 |

**Unlock gate:** `magicTapUnlocked === true` after Event 3 narrative completion (exact signal TBD with narrative team — may start as dev flag for QA).

### Phase D3 — Final Arc 1 art swap

**Blocked on Kim delivering masters through delivery pipeline.**

| ID | Work | Classification |
|----|------|----------------|
| SD-030 | Add `assets/map/arc1/*.webp` delivery assets | P0-blocker |
| SD-031 | Swap placeholder images; verify manifest rects still align (visual QA on iPad 9) | P1 |
| SD-032 | Optional: `CreatureMapState` sprite variants if art pack includes distressed/idle/happy | P3 |

### Phase D4 — Polish + full V1 map features (optional / follow-on)

| ID | Work | Classification |
|----|------|----------------|
| SD-040 | Parallax layers (up to 3) | P3 |
| SD-041 | Time-of-day tint | P3 |
| SD-042 | Multi-arc zone switching (Arc 2+ vertical scroll homeworlds) | P3 |
| SD-043 | Maestro Tier 2: tap `map_creature_tessa` → module route screenshot | P2 |
| SD-044 | Haptic + accessibility announcements for locked state | P2 |

---

## 8. Map manifest schema (draft)

```json
{
  "schemaVersion": 1,
  "arcId": "arc1",
  "displayName": "Everdale",
  "scrollAxis": "horizontal",
  "designCanvas": { "width": 3840, "height": 1080 },
  "background": {
    "asset": "arc1_bg.webp",
    "role": "background"
  },
  "hotspots": [
    {
      "id": "creature_tessa",
      "type": "creature",
      "creatureId": "tessa",
      "moduleId": "m1",
      "testID": "map_creature_tessa",
      "rect": { "x": 0.12, "y": 0.55, "w": 0.08, "h": 0.25 },
      "interactions": {
        "navigate": "startModule",
        "wand": "magicTapReaction"
      },
      "assets": {
        "idle": "arc1_creature_tessa_idle.webp"
      }
    }
  ]
}
```

Rects are **normalized 0–1** relative to `designCanvas`. App scales to scroll content size. Validation enforces minimum `w`/`h` for 44 pt touch targets at iPhone SE width.

---

## 9. Art workflow for Kim (step-by-step)

This is the feasible, mostly-automated path without sacrificing quality:

| Step | What Kim does | What automation does |
|------|---------------|----------------------|
| 1. Compose | Pick Arc 1 wide layout; mark where each creature sits (Figma, Procreate, or printed overlay) | — |
| 2. Lock | Approve manifest JSON (agent writes from your marks) | `validate-map-manifest.mjs` |
| 3. Master | Paint final map + creature cutouts at 2048 px long edge → save to Dropbox `masters/map/arc1/` | Directus `prod_assets` row (optional registry) |
| 4. Deliver | Run `resize_to_delivery.py --ext png` | WebP q80/q75 @ 1280 → `delivery/` |
| 5. Ship | Copy delivery files to repo `assets/map/arc1/` OR future: bundle in arc download | App hot-swaps via manifest `asset` paths |
| 6. QA | 10-min iPad pass: tap each creature, scroll edges, locked states | Maestro Tier 2 when stable |

**What NOT to do:** Paint six separate creature positions without a locked background composition — guarantees rework.

**Quality guardrails already in repo ecosystem:** `zero-error-qa` skill checks image integrity; size budget caps prevent bloated bundles.

---

## 10. Explicit out of scope (Sprint D)

- Firestore progression mirror (LD-316 Layer 2)
- New module playback / LD-280 route changes
- Store / decoration / carousel UI
- Therapist portal map
- Full parallax + time-of-day (D4)
- Replacing Tier-1 Maestro with map tap flows

---

## 11. File plan

| File | Phase | Action |
|------|-------|--------|
| `src/data/maps/arc1.map.json` | D0 | **New** — layout contract |
| `scripts/qa/validate-map-manifest.mjs` | D0 | **New** |
| `src/data/mapManifest.ts` | D1 | **New** — loader + types |
| `src/components/EverdaleMap.tsx` | D1 | **New** |
| `src/components/MagicTapLayer.tsx` | D2 | **New** |
| `app/index.tsx` | D1 | **Refactor** |
| `assets/map/arc1/` | D1 placeholders / D3 final | **New** |
| `src/data/__tests__/mapManifest.test.ts` | D1 | **New** |
| `maestro/flows/home_screen.yaml` | D4 | **Update** |

---

## 12. Decisions needed from Kim (before D0 closes)

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Arc 1 canvas aspect ratio? | **3840×1080** (3.55:1 horizontal panorama) — adjust if your mental composition differs |
| 2 | Locked creature UX? | **(A) shake only** — module route stays backstop for deep links |
| 3 | D1 with placeholders until masters? | **Yes** — unblocks navigation QA while you paint |
| 4 | Magic Tap unlock signal at D2? | Dev flag first → wire to Event 3 completion when narrative hook exists in app |
| 5 | Arc 2 scroll axis? | Decide at Arc 2 D0 — vertical homeworld is fine per K1 |

**Deferred (not blocking D0):** parallax layer count, time-of-day palette, exact Magic Tap coin CF wiring.

---

## 13. Verification gates

### Per-item (agent)

```bash
node scripts/qa/validate-map-manifest.mjs
npm run qa:pre-push
```

### Sprint exit (D1)

```bash
npm run qa:pre-push
npm test -- --testPathPattern=mapManifest
```

### Manual smoke

1. Signed-in parent → scrollable map (not text list).
2. Navigate mode: tap Tessa → `/module/m1`.
3. Without completing m1, tap Luna → does not play m2.
4. Wand mode (when unlocked): tap creature → reaction, not module start.
5. Preview build: no generic start button; `__DEV__` dev button still works locally.

---

## 14. Implementation order

```
D0: layout sketch → arc1.map.json → validate script → Kim sign-off
         ↓
D1: mapManifest loader → EverdaleMap → index wire → progression locks
         ↓
D2: MagicTapLayer + wand toggle (post–Event 3 gate)
         ↓
D3: final WebP swap (same manifest)
         ↓
D4: parallax / Maestro / polish
```

**Do not start D1 until D0 exit gate passes.**

---

## 15. Risk register

| Risk | Mitigation |
|------|------------|
| Art painted before layout lock | D0 gate; manifest-first workflow §6 |
| Magic Tap confused with module start | Separate wand mode §6.5 |
| Hit targets too small | Manifest validator + 44 pt minimum |
| Deep link bypass | Module route lock unchanged (Sprint C) |
| Scope creep (parallax, 10 arcs) | D4 explicit deferral |
| No map art in repo yet | Placeholders use same manifest as final art |

---

## 16. Success criteria (kid-facing)

- Child opens app → sees **Everdale map**, not a text list.
- Child taps a creature in Navigate mode → starts that module (if unlocked).
- After Event 3, child can toggle wand and **play** with creatures/plants without starting modules.
- No generic "Start module" in production/preview.
- Progression respected on map and on module route.

---

## 17. Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-06-01 | v1 | Initial Sprint D spec from post–PR-32 ground truth |
| 2026-06-01 | v2 | Manifest-first art pipeline; per-arc scroll; Magic Tap mode split; D0 gate before code; Kim decisions K1–K5 |

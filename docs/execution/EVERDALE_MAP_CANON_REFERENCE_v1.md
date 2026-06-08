# Everdale Map — Canon Reference v1

**Status:** Living index — update when canon docs change  
**Date:** 2026-06-01  
**Purpose:** Single repo-local place for everything the Everdale map must do. You should not have to remember Magic Tap rules, creature order, or which Bible version is current — this doc points to authoritative sources and lists every shipping requirement.

**Sprint D execution spec:** `STAGE2_SPRINT_D_EXECUTION_SPEC_v1.md` (implementation phases)  
**Session record (locked Kim decisions):** `SESSION_DURABILITY_RECORD_20260601.md`  
**Doc index:** `EXECUTION_INDEX_v1.md`  
**This doc:** *what* the map is (excavated from canon)

---

## 1. Which documents are authoritative (newest wins)

When docs disagree, use this order:

| Priority | Document | Location | Role |
|----------|----------|----------|------|
| 1 | **Everdale World Design Bible v13.13** | Dropbox `Canon/CLAUDE_Everdale_World_Design_Bible_v13_13.md` | Kid-facing world UX, map layout, Magic Tap, zone features, decoration |
| 2 | **Narrative Decisions Unified v2.9** | Dropbox `Canon/NARRATIVE_DECISIONS_UNIFIED_v2_9.md` | Locked UX decisions (ambient Magic Tap, decoration model, Zaps) |
| 3 | **Arc 1 Skeleton FINAL** | Dropbox `Arc Skeletons/ARC_01_SKELETON_FINAL.md` | Event-by-event map state, trigger sprites, play order |
| 4 | **Visual Production Guide v4.6** | Dropbox `Canon/CLAUDE_Everdale_Visual_Production_Guide_v4_6.md` | Art pipeline, panorama aspect, tiles, parallax, sprite counts |
| 5 | **APP_ARCHITECTURE_MASTER_v1.md** §3.2 | Dropbox | App engineering: ScrollView + expo-image + Reanimated |
| 6 | **GAMEPLAY_SCOPE_v3.md** + LD-338 | Dropbox | V1 scope lock, Magic Tap economy |
| 7 | **MINDFULNEST_MASTER_TECHNICAL_SPEC_v6.md** §6.1, §6.9 | Dropbox | Engineering roll-up |

**Not map art:** `Production/tools/storyboard-v2/ProductionMapTab.tsx` = module production status in the storyboard tool.

**Superseded:** Anything in `archive/` or older Bible versions (v13.10 and below in `Old Versions/` unless copied to `Canon/`).

---

## 2. Scroll orientation — plain-language examples

**What “aspect ratio” means:** The shape of the full map painting before it goes in the app.

The phone is a **small window** on a **big painting**. The child **drags** to see the rest.

### Arc 1 Everdale — horizontal (wide painting)

Canon: ~**2:1** panorama (~4096×2048 px working master per Visual Production Guide §4.2). Child pans **left ↔ right**.

```
     FULL MAP (wider than the phone)
┌──────────────────────────────────────────────────────────┐
│ Path │ Tessa/My House │ Heartwood │ Oak │ Meadow │ ...  │
└──────────────────────────────────────────────────────────┘
              ┌─────────┐
              │ PHONE   │  ← child sees this slice; swipe to pan
              │ window  │
              └─────────┘
```

### Homeworld example — vertical (tall painting)

Some later arcs can use a **tall** map. Child pans **up ↕ down**.

```
     FULL MAP (taller than the phone)
        ┌───────┐
        │ peak  │
        │ cliff │
        ├───────┤
        │ village│  ← phone window here
        ├───────┤
        │ valley│
        └───────┘
```

**Kim decision (2026-06-01):** Arc 1 = horizontal; per-arc axis can differ later.  
**Kim decision (2026-06-01 review):** **One single continuous Everdale world** — My House, Heartwood, and every creature home / fidget entry spot are **regions on the same persistent map**, not separate screens or separate background paintings. The child **pans a short distance** between neighborhoods (Ori-style: zoomed-in viewport, cannot see the whole valley at once). This **simplifies art**: one master illustration, additive overlays for awakening — not one background per module.

**Canon alignment:** This is **not new** — Bible v13.13 §2 (“persistent illustrated map… viewport pans”), VPG §4.2 (one stitched panorama + tile grid), ND v2.9 §3.5 (zone fidgets = popup **on top of** the same map, tap back returns to map). Engineering manifest still places **hotspots** on one `arc1.map.json` canvas.

**Kim decision (2026-06-01 review):** **Exclude Mountain Kingdom** from Arc 1 map art (no misty peaks in background). Bible/VPG mention distant peaks for lore foreshadow — **deferred / cut for Arc 1 art scope.**

**D0 action:** Lock scroll **extent** on first sketch — Kim prefers **moderate pan** (“scroll a little”) over an ultra-wide poster; exact pixel width TBD from ChatGPT layout iteration (may be shorter than VPG’s 4096×2048 default).

---

## 3. Complete map feature inventory (full V1 vision)

Every row is something canon describes. **Sprint D phase** shows when we build it in the app repo.

| # | Feature | What the child experiences | Primary source | Sprint D phase |
|---|---------|---------------------------|----------------|----------------|
| M1 | **Scrollable Everdale panorama** | Drag to explore; wider than screen | Bible §2, VPG §4.2 | D1 (flat bg) → D4 (parallax) |
| M2 | **3 parallax layers** | Sky/mountains slow; ground normal; branches fast (Ori-style depth) | Bible §2, VPG §4.2 | D4 |
| M3 | **Tile grid delivery** | Large map sliced 1024×1024; only visible tiles loaded | VPG §4.2 | D3–D4 |
| M4 | **Time-of-day tint** | Morning / afternoon / evening / night color mood on same art | Bible §2, World Map table | D4 |
| M5 | **Fog / mist on locked areas** | Unrevealed zones covered until creature claims dwelling | Bible §2 | D4 |
| M6 | **Awakening overlays** | Flowers, lanterns, water clear — additive sprites on base map | Bible §2, VPG §4.2 | D4 |
| M7 | **Creature sprites on map** | Portrait sprites at narrative locations; 3 states: distressed / idle / happy | Bible, VPG §4.3, CDM | D1 placeholders → D3 art |
| M8 | **Trigger sprites** | Pulsing indicator on next story creature (e.g. Tessa after map landing) | Arc 1 skeleton EVENT 0c | D1 |
| M9 | **Tap creature → start module** | Unlocked rescue/bond modules launch `/module/mX` | Bible, master spec §3.2 | D1 |
| M10 | **Tap creature → dialogue** | Personality lines when not starting module | Bible § Zone Features | Post-D1 |
| M11 | **Progression locks** | Locked creatures: soft feedback, no module start | Sprint C + skeleton | D1 (shake) |
| M12 | **MindfulNest tap** | Magic reaction animation on central tree | Bible (Kim note v13.13) | D4 |
| M13 | **Runestone glow states** | 0–6 stones lit; map brightens over Arc 1 | Arc 1 skeleton return-to-map blocks | D4 |
| M14 | **First Flower (post-M1)** | Permanent bloom sprite near Tessa's pond | Bible post-M1, VPG §4.7c | D4 |
| M15 | **Map intro MP4** | First time entering map (~10 MB streamed) | APP_ARCHITECTURE §3.1 | Narrative layer (not Sprint D) |
| M16 | **Nav bar** | Store, Spellbook, World Map, Backpack, Pip, coins | Arc 1 skeleton EVENT 0c | Post-D1 (Bolt/scaffold) |
| M17 | **World Map screen** | Macro map: all kingdoms; Everdale lit, rest dark | Arc 1 skeleton EVENT 0c | Post-D1 |
| M18 | **My House** | Decorable pond cottage from M1 | Bible § Three-Space Decoration | Post-D1 |
| M19 | **Zone features (6)** | Tap landmark → full-screen fidget popup (Koi Pond, Star Window, Bubble Hop, Glow Charge, Sound Painting, Dig & Find) | Bible § Zone Features, ND v2.9 §3.5 | Post-D1 (Arc 1–2 only) |
| M20 | **Magic Tap (ambient)** | After Oliver Meet: empty ground → sparkle/bloom; creatures → dialogue + giggle/sparkle; no mode button | ND v2.9 §3.4, Bible § Wand | D2 |
| M21 | **Magic Tap tiers 1–5** | Bigger effects after ceremonies (`magicTapTier`) | ND v2.9 §3.4, LD-338 | D2 stub → later |
| M22 | **Magic Tap rewards** | ~5–10% coin, ~0.5% rare item on tap (retention) | LD-338, GAMEPLAY_SCOPE | Post-D2 + CF wiring |
| M23 | **Wand on avatar** | Permanent cosmetic layer after Oliver; not in backpack | ND v2.9 §4.3 | D2 |
| M24 | **Wand store cosmetics** | Vine Wrap, Crystal Tip, etc. | Bible § Wand decorations | Post-D2 |
| M25 | **Creature wandering** | Waypoints within home area every 20–30s | Bible § Creature Wandering | D4 |
| M26 | **Party sprites on map** | Oliver + creatures visible after join | Arc 1 skeleton | D4 |
| M27 | **Emergency Meeting overlay** | Arc 2: three chalkboard checkboxes | Master spec §6.13 | Arc 2 sprint |
| M28 | **Cinematic flyover** | Creature runs across map, camera pans | Bible engagement | D4 |
| M29 | **Vignettes on map return** | Short pre-produced cute clips | Bible | Narrative assets |
| M30 | **Tomorrow hooks** | Pip popup nudging next event | Arc 1 skeleton | Post-D1 |
| M31 | **Map-visit streak** | Retention (not module streak) | LD-339 | Post-D2 |
| M32 | **Discovery sparkles** | Hidden item/coin finds on map | ND v2.9 §4.14 | Post-D2 |
| M33 | **Homeworld maps (Arc 2+)** | Separate scrollable maps per arc; axis per arc | Kim decision + Bible | Future arcs |
| M34 | **10 arc zones on world map** | Macro progression across game | Master spec §6.1 | Post-Arc 1 |

---

## 4. Arc 1 geography (left → right on horizontal map)

From **Visual Production Guide §4.2** + **Bible World Map table**:

| Order | Area | Unlocks | Notes |
|-------|------|---------|-------|
| 1 | Entrance Path | Day 1 | Signpost, Guide Bird |
| 2 | Tessa's Pond & My House | Day 1 | Child's decorable home; Koi Pond zone |
| 3 | Heartwood & MindfulNest | Day 1 (dormant → awakens) | Center; six runestone sockets |
| 4 | Great Oak (upper) | After M2 | Luna's treehouse; Star Window |
| 5 | Benson's Meadow | After M3 | Bubble Hop zone |
| 6 | Ember's Hillside | After M4 | Glow Charge zone |
| 7 | Bramble's Garden | After M6 | Dig & Find zone |
| 8 | Twilight Grove | After M5 | Bork's Sound Painting zone |
| 9 | ~~Mountain Kingdom (background)~~ | **Excluded from Arc 1 art** (Kim 2026-06-01) | Was lore foreshadow in Bible/VPG — not painted in Arc 1 map |

**Play order ≠ M-number order** (Arc 1 skeleton):

| Play # | Event | Module | Creature |
|--------|-------|--------|----------|
| 1 | M1 Tessa | m1 | Tessa |
| 2 | M2 Luna | m2 | Luna |
| 3 | Event 3 Ember | m4 | Ember |
| 4 | **Event 3b Oliver Meet** | — | **Magic Tap unlocked** |
| 5 | Event 4 Bramble | m6 | Bramble |
| 6 | Event 5 Benson | m3 | Benson |
| 7 | Event 6 Bork | m5 | Bork |

---

## 5. Magic Tap — locked behavior (matches what you described)

**Unlock:** Oliver Meet (Event 3b), after M4 / Heart-Sending — **not** after Benson M3 despite older Bible wording "post-M3" (skeleton play order is authoritative for *when* it happens in Arc 1).

**No wand button. No mode toggle.** After Oliver, the world simply responds to magic everywhere.

| Child taps… | What happens |
|-------------|--------------|
| Empty grass / path / sky | Sparkle, flower bloom, mushroom pop, moss glow |
| Creature sprite | Dialogue line **+** happy reaction (giggle, spin, jump) **+** sparkle accent |
| Zone feature hotspot | Zone opens **+** extra sparkle |
| Nav bar / My House door | Normal navigation — **no** sparkle |

**Tiers (`magicTapTier` 1–5):** Effect size grows after ceremonies (tiny sparkle → full cascade by Arc 9). Later wins can change particle **skins/colors** (LD-338 rare finds).

**Economy (LD-338):** Optional ~5–10% coin drop, ~0.5% rare item — variable reward on daily map visits.

This is **ambient Magic Tap** per Narrative Decisions v2.9 §3.4 — your “giggle or magic burst” request is already canon; we do **not** need a separate wand mode.

---

## 6. Map state changes — Arc 1 event checklist

Use **Arc 1 Skeleton FINAL** return-to-map blocks as the acceptance checklist for map overlays/sprites:

| After… | Map changes (summary) |
|--------|----------------------|
| Map landing (0c) | Dormant Everdale; controls visible; Tessa trigger appears |
| M1 | Body Stone orange; First Flower; Tessa sprite; My House open |
| M2 | Watching Stone yellow; map brighter; Luna at Great Oak |
| M4 | Heart Stone red; Sweetrose wreath; Ember sprite |
| Oliver Meet | Wand + Magic Tap; Oliver party sprite |
| M6 | Calm Stone blue; Bramble sprite; Heartwood tuning beat |
| M3 | Courage Stone green; Benson meadow active |
| M5 | Grounding Stone purple; Twilight Grove; Bork |

Full verbatim blocks: Dropbox `Arc Skeletons/ARC_01_SKELETON_FINAL.md` (search `MAP STATE CHANGES`).

---

## 7. Art pipeline (automated path you already built)

| Step | Tool / location | Output |
|------|-----------------|--------|
| 1. Composition lock | Sketch / Figma / Photopea | Approved layout → `arc1.map.json` in repo |
| 2. Zone close-ups | Midjourney + style lock (`STYLE_LOCK_EVERDALE_DORMANT.png`) | 5–7 refs for video pipeline too |
| 3. Stitch panorama | Photopea | ~4096×2048 master |
| 4. Slice tiles | ImageMagick | 1024×1024 grid for GPU |
| 5. Parallax layers | 3 PNGs | Background / ground / foreground |
| 6. Creature sprites | Transparent PNG | 3 states × 6 creatures (+ Guide Bird, Pip, avatars) |
| 7. Delivery | `Production/scripts/resize_to_delivery.py` | WebP q80/q75 @ 1280 px → `delivery/` |
| 8. App bundle | Copy to `assets/map/arc1/` | Referenced by manifest |

**Masters never ship.** Delivery WebPs only (CLAUDE.md Rule 6.2).

---

## 8. Organized review — how we avoid forgotten requirements

### 8.1 Before D0 closes (Kim + agent, ~30 min)

- [x] Walk Arc 1 skeleton **MAP STATE CHANGES** — all 8 return-to-map blocks read (`ARC_01_SKELETON_FINAL.md`); §6 table matches skeleton; First Flower added from Bible post-M1 (not verbatim in skeleton MAP STATE block)
- [x] **Single persistent Everdale map** — all areas are regions on one scrollable world (Kim 2026-06-01)
- [x] **Mountain Kingdom excluded** from Arc 1 map art (Kim 2026-06-01)
- [x] Horizontal pan, moderate scroll / zoomed viewport (Kim 2026-06-01)
- [x] Play order M1→M2→M4→Oliver→M6→M3→M5 (Kim 2026-06-01)
- [x] Ambient Magic Tap (§5) — no wand toggle (Kim 2026-06-01)
- [x] Locked creature = shake only (Kim 2026-06-01)
- [x] Placeholders OK for D1 (Kim 2026-06-01)
- [x] Sprint D phasing OK — nav/zone features post-D1 (Kim 2026-06-01)
- [ ] **`arc1.map.json` signed off** — pending layout sketch iteration (ChatGPT prompt below)

### 8.2 Before D1 code starts

- [ ] `arc1.map.json` signed off (creature positions on sketch)
- [ ] `validate-map-manifest.mjs` passes

### 8.3 Before D3 art swap

- [ ] iPad visual QA: each trigger sprite, each runestone state, scroll edges
- [ ] Delivery WebPs under size budget (hero ≤1.2 MB, bg ≤800 KB)

### 8.4 Before calling Arc 1 map “V1 complete”

- [ ] All rows in §3 marked at least D2/D4 or explicitly deferred with LD
- [ ] Maestro Tier 2 map tap flow (optional)

**When canon changes:** Update this doc + Sprint D spec in same PR.

---

## 9. Known doc conflicts (resolved for implementation)

| Topic | Conflict | Resolution |
|-------|----------|------------|
| Magic Tap UX | Sprint D v2 draft had “wand mode toggle” | **Ambient model** (ND v2.9) — interactive targets win; empty space sparkles |
| Magic Tap unlock timing | Bible says “post-M3” | **Oliver Meet after M4** per Arc 1 skeleton play order |
| Wishing Garden | Bible describes Hopegrove garden | **Deferred V1** — Sweetrose in Arc 3 per LD-336 |
| Dragon Magic Tap | Bible fire from mouth | **CUT V1** per LD-337 |
| Measuring bar on map | Old designs | **Not rendered** — backend only (ND) |
| Daily micro-shifts | Bible v10 | **Cut** — not worth art cost (Bible v13 strike list) |

---

## 10. Open items (need Kim or art, not blocking D0 sketch)

| # | Item | Notes |
|---|------|-------|
| O1 | Final Arc 1 composition sketch | ChatGPT iteration from prompt in §12; Kim approves layout |
| O2 | STYLE_LOCK reference PNG | First art pipeline output |
| O3 | Exact trigger-sprite pulse art | Engineering can use Reanimated placeholder |
| O4 | Magic Tap particle tier assets | 5 tiers; tier 1 enough for D2 |
| O5 | Nav bar layout (bottom tabs vs top) | Master spec says TBD |

---

## 12. ChatGPT layout prompt (D0 sketch iteration)

Copy-paste into ChatGPT (DALL·E / image generation) or similar. Iterate: “move Heartwood more central”, “add labels”, etc.

**Prompt v1 — full Arc 1 composition (dormant Everdale):**

```
Game map concept art for a children's mindfulness iPad app. ONE single continuous illustrated world — not separate panels.

Style: warm watercolor storybook, soft Pixar/Ori and the Blind Forest mood, painterly, inviting, ages 6–8. Horizontal wide composition (~2:1 aspect) meant to be panned slowly on a phone — the viewer sees only part of the valley at a time, like a zoomed-in camera on a large background.

Scene: "Everdale" after a long magical sleep — gentle ruin, overgrown but peaceful, NOT scary. Dormant grey Heartwood tree stump at the CENTER of the valley with six empty dark sockets where runestones will glow later. Winding entrance path from the LEFT with a wooden sign "Everdale". To the left of center: peaceful pond with lily pads and a small cozy cottage (My House) among trees. UPPER area: massive ancient Great Oak with a tiny treehouse in branches. RIGHT side regions on the SAME continuous hillside: open sunny meadow with wildflowers and a rabbit burrow entrance; fox hillside with round hobbit-like door in hill; forest-edge garden with cave entrance framed by logs; twilight grove with bioluminescent mushrooms and a lantern-shaped home.

All areas must feel like ONE connected forest valley — shared paths, consistent lighting, same art style, no borders between zones. Empty of characters. No mountains or distant kingdoms in the background — only forest, hills, and sky that belong to Everdale.

No text UI, no characters, no buttons. Landscape only. High detail, production-quality children's game map reference.
```

**Prompt v2 — if v1 is too wide:** add `“Moderate width only — roughly 1.5:1 aspect, all key landmarks visible within two screen-widths of panning.”`

**Prompt v3 — labeled layout for engineering:** after you like a composition, `“Same image but add subtle numbered circles 1–8 at: 1 Entrance path, 2 Pond/My House, 3 Heartwood, 4 Great Oak, 5 Benson meadow, 6 Ember den, 7 Bramble garden, 8 Twilight grove — no other changes.”`

When one image feels right, send it to the agent → we derive `arc1.map.json` hotspot positions.

---

## 11. Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-06-01 | v1 | Initial excavation: Bible v13.13, ND v2.9, Arc 1 skeleton, VPG v4.6, gameplay scope |
| 2026-06-01 | v1.1 | Kim review: single persistent map, moderate Ori pan, Mountain Kingdom cut from Arc 1 art; §12 ChatGPT prompt |

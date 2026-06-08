# Session durability record — 2026-06-01 (Everdale map + operator safety)

**Purpose:** Permanent record of decisions and work from the map-planning Cursor session. **Does not depend on chat memory.** Agents: read this + linked docs before Sprint D implementation.

**Repos involved:**
| Repo | Path | Role |
|------|------|------|
| MindfulNest (app) | `~/Projects/MindfulNest` | Kid-facing app; map specs live here |
| mindfulnest-tooling | `~/Projects/mindfulnest-tooling` | Storyboard / Beat Gen / `production_server.py` |

---

## 1. Kim decisions (locked)

| ID | Decision | Status |
|----|----------|--------|
| K-01 | Arc 1 map = **one single persistent Everdale world** (My House, Heartwood, creature/fidget spots = regions on same scrollable art) | LOCKED |
| K-02 | Arc 1 scroll = **horizontal**, **moderate pan** (Ori-style zoomed viewport; not ultra-wide poster) | LOCKED |
| K-03 | **No Mountain Kingdom** in Arc 1 map background art | LOCKED |
| K-04 | Arc 1 play order: M1 → M2 → M4 → Oliver Meet → M6 → M3 → M5 | LOCKED |
| K-05 | **Ambient Magic Tap** after Oliver Meet — no wand button, no mode toggle | LOCKED |
| K-06 | Locked creature tap = **shake only** (no toast, no module open) | LOCKED |
| K-07 | D1 may use **placeholders** on manifest until final WebP | LOCKED |
| K-08 | Sprint D builds navigation first; nav bar, zone popups, parallax = **post-D1** | LOCKED |
| K-09 | Per-arc scroll axis may differ on homeworlds (e.g. vertical later) | LOCKED |
| K-10 | D0 blocks D1 code until **`arc1.map.json` layout signed off** | LOCKED |

---

## 2. Canonical doc pointers (authoritative sources)

Dropbox paths (agent must read files on disk — not chat):

| Priority | Document |
|----------|----------|
| 1 | `Canon/CLAUDE_Everdale_World_Design_Bible_v13_13.md` |
| 2 | `Canon/NARRATIVE_DECISIONS_UNIFIED_v2_9.md` |
| 3 | `Arc Skeletons/ARC_01_SKELETON_FINAL.md` |
| 4 | `Canon/CLAUDE_Everdale_Visual_Production_Guide_v4_6.md` |

**Repo-local index (always in git):** `EVERDALE_MAP_CANON_REFERENCE_v1.md`  
**Implementation phases:** `STAGE2_SPRINT_D_EXECUTION_SPEC_v1.md`

---

## 3. Engineering model (locked)

- **One manifest per arc:** `src/data/maps/arc1.map.json` (not written until D0 sketch approved)
- **Tap priority:** nav → trigger sprite (module) → creature dialogue+sparkle → zone → empty ground Magic Tap
- **Magic Tap unlock:** Oliver Meet (Event 3b), not Benson M3
- **Art pipeline:** masters in Dropbox → `resize_to_delivery.py` → `assets/map/arc1/` WebP
- **ChatGPT layout prompts:** canon reference §12

---

## 4. Git safety — tooling stash (2026-06-01)

Kim requested safety stash before Cursor restart. **Work is NOT lost if Cursor quits.**

### mindfulnest-tooling (sibling repo)

```bash
cd ~/Projects/mindfulnest-tooling
git stash list
# Restore main safety stash:
git stash pop stash@{1}
# If stash indices shifted, find message:
#   safety-before-cursor-restart-20260601-kim-request
git stash list | grep safety-before-cursor-restart
```

**Verified 2026-06-01:** stashes `safety-before-cursor-restart-20260601-kim-request` + `safety-kling-preset-voices-20260601` created; working tree clean after stash.

### MindfulNest

Map docs committed on branch `docs/sprint-d-everdale-map-spec` → merged to `main` (see §6).  
Temporary stash `safety-cursor-rules-20260601-kim-request` was **popped** and rules committed to git.

---

## 5. Gap classification and remediation

| Gap | Risk | Remediation | Owner |
|-----|------|-------------|-------|
| Decisions only in chat | High | `EVERDALE_MAP_CANON_REFERENCE_v1.md` + this record | Done |
| Sprint D spec not on `main` | High | Merge PR #34 | Agent |
| Cursor rules in stash only | Medium | Pop stash + commit `.cursor/rules/*.mdc` | Done |
| No execution doc index | Medium | `EXECUTION_INDEX_v1.md` | Done |
| Architecture rule missing map pointer | Medium | Update `mindfulnest-architecture.mdc` | Done |
| Tooling stash recovery only in chat | Medium | §4 above in this file | Done |
| `arc1.map.json` not created | Expected | Blocked on D0 sketch — not a gap | Kim + agent |
| `validate-map-manifest.mjs` not written | Expected | Sprint D0 task | Future PR |
| Map code (EverdaleMap.tsx) | Expected | Sprint D1 after D0 | Future PR |

---

## 6. Deployment verification (multipass)

Run after merge; record results below.

| Pass | Check | Command / URL | Expected |
|------|-------|---------------|----------|
| 1 | Branch pushed | `git log origin/docs/sprint-d-everdale-map-spec -1` | Latest commit |
| 2 | PR CI green | `gh pr checks 34` | All pass |
| 3 | Merge to main | `gh pr merge 34` | success |
| 4 | File on main | `git show main:docs/execution/EVERDALE_MAP_CANON_REFERENCE_v1.md` | exists |
| 5 | Local QA | `npm run qa:pre-push` on main | pass |

| 1 | Branch pushed | `f33767d` on `docs/sprint-d-everdale-map-spec` | OK |
| 2 | PR CI green | `gh pr checks 34` | OK (after package.json trigger commit) |
| 3 | Merge to main | `gh pr merge 34` | pending |
| 4 | File on main | `git show main:docs/execution/EVERDALE_MAP_CANON_REFERENCE_v1.md` | pending |
| 5 | Local QA | `npm run qa:pre-push` | OK 2026-06-07 |

---

## 7. Changelog

| Date | Change |
|------|--------|
| 2026-06-01 | Initial durability record after map review + operator stash session |

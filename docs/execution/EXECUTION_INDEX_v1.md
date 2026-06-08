# MindfulNest — execution docs index

**Purpose:** Single entry point for agents. All paths relative to repo root.

## Map / home (Sprint D — current)

| Doc | Role |
|-----|------|
| `docs/execution/EVERDALE_MAP_CANON_REFERENCE_v1.md` | **What** the map must do (features, Kim decisions, canon pointers, ChatGPT prompts) |
| `docs/execution/STAGE2_SPRINT_D_EXECUTION_SPEC_v1.md` | **How** to implement (D0–D4 phases, gates, files) |
| `docs/execution/SESSION_DURABILITY_RECORD_20260601.md` | Locked decisions + stash recovery + deployment audit |

**Before any Sprint D code:** read canon reference §8.1 — D0 must be signed off.

## Prior sprints (completed)

| Doc | Sprint |
|-----|--------|
| `STAGE2_SPRINT_A_EXECUTION_SPEC_v1.md` | A — CI, scaffold, rules |
| `STAGE2_SPRINT_B_EXECUTION_SPEC_v1.md` | B |
| `STAGE2_SPRINT_C_EXECUTION_SPEC_v1.md` | C — progression locks |
| `LD278_AUTH_PERSISTENCE_MIGRATION_SPEC_v1.md` | LD-278 auth |

## Cursor rules (always applied)

| Rule | Topic |
|------|-------|
| `.cursor/rules/mindfulnest-architecture.mdc` | LD-280, map UX summary |
| `.cursor/rules/mindfulnest-qa-workflow.mdc` | Pre-push + PR CI; no Find Issues |
| `.cursor/rules/mindfulnest-operator-workflow.mdc` | Kim does not run terminal |
| `.cursor/rules/tooling-workspace-reminder.mdc` | Tooling = separate repo/window |

## External canon (Dropbox — not in this git repo)

Everdale Bible v13.13, Narrative Decisions v2.9, Arc 1 Skeleton FINAL, VPG v4.6 — paths in canon reference §1.

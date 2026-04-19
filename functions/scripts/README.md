# functions/scripts/

Operational scripts for Cloud Functions deployment + maintenance.

## `deploy_parent_coach.sh`

Production deploy script for `parent_coach_cf`, gated on LD-291 PARENT_COACH_MIN_INSTANCES_V1 (id=301).

**Why this script exists:** `parent_coach_cf` MUST run with `minInstances >= 1` to avoid the 2–4s Cloud Run cold-start latency that breaks the AI Parent Coach UX SLA. Direct `firebase deploy` does NOT enforce this — the option must either be in the function definition itself (`onRequest({ minInstances: 1, ... })`) OR set post-deploy via `gcloud run services update`. This script does both, then verifies.

**LD-91 cost carve-out:** running `minInstances >= 1` costs ~$15-40/mo per region in always-on idle billing. This is a knowing exception to the near-zero-cost rule (LD-91), scoped to ONLY `parent_coach_cf`. Quantified ceiling: $40/mo per region. Revisit gate: 1000 paid families.

**Usage:**

```bash
# Dry-run (prints commands, no execution)
./functions/scripts/deploy_parent_coach.sh --dry-run

# Verify-only (no deploy, just check current minInstances)
./functions/scripts/deploy_parent_coach.sh --verify-only

# Full deploy
./functions/scripts/deploy_parent_coach.sh
```

**Required env vars (or defaults shown):**

```
FIREBASE_PROJECT_ID=mindfulnest-prod
PARENT_COACH_REGION=us-central1
PARENT_COACH_MIN_INSTANCES=1
PARENT_COACH_MAX_INSTANCES=10
```

**When to run:**
- After every `parent_coach_cf` code change (CI dry-run; human runs prod).
- On a fresh project bring-up.
- Whenever `gcloud` shows `minInstances=0` on the deployed service (regression).

**Refs:** `prod_locked_decisions` LD-291 (id=301), LD-91 (id=91, PATCHed 2026-04-19 with named carve-out), `prod_preflight_reviews` id=116.

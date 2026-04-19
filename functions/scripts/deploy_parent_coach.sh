#!/usr/bin/env bash
#
# deploy_parent_coach.sh — production deploy script for parent_coach_cf.
#
# Per LD-291 PARENT_COACH_MIN_INSTANCES_V1 (id=301): the parent_coach_cf
# Cloud Run service MUST have minInstances >= 1 in production. Cold start
# >2s breaks the coaching UX SLA (parent at 2am asking about a meltdown will
# not tolerate the spinner).
#
# Per LD-91 business_near_zero_cost (id=91, PATCHed 2026-04-19 with named
# carve-out): this is a knowing $40/mo trade-off scoped to ONLY parent_coach_cf.
# Every other service in MindfulNest stays under near-zero-cost discipline.
# Revisit gate: 1000 paid families.
#
# This script is the SINGLE allowed way to deploy parent_coach_cf — running
# `firebase deploy --only functions:parent_coach_cf` directly will produce
# a function WITHOUT minInstances baked in (the option must be set on the
# function definition itself OR via gcloud post-deploy override).
#
# Two enforcement paths:
#   (1) Function-definition path (preferred): when parent_coach_cf is
#       implemented, declare it with `onRequest({ minInstances: 1, ... })`
#       per Firebase Functions v2 API. The deploy then bakes the option in
#       and `firebase deploy` is sufficient.
#   (2) Post-deploy path (fallback): if the function is already deployed
#       without minInstances, run `gcloud run services update` to set it
#       independently of the function code.
#
# This script implements path (2) as a safety net + path (1) verification.
#
# Usage:
#   ./deploy_parent_coach.sh                    # deploys + sets minInstances=1
#   ./deploy_parent_coach.sh --dry-run          # prints commands without executing
#   ./deploy_parent_coach.sh --verify-only      # checks current minInstances, no deploy

set -euo pipefail

PROJECT_ID="${FIREBASE_PROJECT_ID:-mindfulnest-prod}"
REGION="${PARENT_COACH_REGION:-us-central1}"
SERVICE_NAME="parent_coach_cf"
MIN_INSTANCES="${PARENT_COACH_MIN_INSTANCES:-1}"
MAX_INSTANCES="${PARENT_COACH_MAX_INSTANCES:-10}"
COST_CEILING_MONTHLY_USD=40   # LD-291 quantified ceiling per region

DRY_RUN=0
VERIFY_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --verify-only) VERIFY_ONLY=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

run() {
  echo "+ $*"
  if [ "$DRY_RUN" -eq 0 ]; then
    "$@"
  fi
}

echo "=== LD-291 PARENT_COACH_MIN_INSTANCES_V1 deploy ==="
echo "project: $PROJECT_ID"
echo "region:  $REGION"
echo "service: $SERVICE_NAME"
echo "minInstances: $MIN_INSTANCES (LD-291 requires >= 1)"
echo "maxInstances: $MAX_INSTANCES"
echo "cost ceiling: \$${COST_CEILING_MONTHLY_USD}/mo per region (LD-91 carve-out)"
echo

if [ "$VERIFY_ONLY" -eq 0 ]; then
  echo "--- Step 1: firebase deploy (function-definition path, preferred) ---"
  run firebase deploy --only "functions:$SERVICE_NAME" --project "$PROJECT_ID"
  echo

  echo "--- Step 2: gcloud minInstances enforcement (safety net) ---"
  run gcloud run services update "$SERVICE_NAME" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --min-instances="$MIN_INSTANCES" \
    --max-instances="$MAX_INSTANCES"
  echo
fi

echo "--- Verify: gcloud run services describe ---"
if [ "$DRY_RUN" -eq 1 ] || [ "$VERIFY_ONLY" -eq 1 ]; then
  echo "+ gcloud run services describe $SERVICE_NAME --project=$PROJECT_ID --region=$REGION --format='value(spec.template.metadata.annotations.\"autoscaling.knative.dev/minScale\")'"
fi
if [ "$DRY_RUN" -eq 0 ]; then
  ACTUAL_MIN=$(gcloud run services describe "$SERVICE_NAME" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format='value(spec.template.metadata.annotations."autoscaling.knative.dev/minScale")' 2>/dev/null || echo "NOT_DEPLOYED")
  echo "Deployed minInstances: $ACTUAL_MIN"
  if [ "$ACTUAL_MIN" != "$MIN_INSTANCES" ]; then
    echo "FAIL: deployed minInstances ($ACTUAL_MIN) does not equal expected ($MIN_INSTANCES)" >&2
    echo "      This violates LD-291. Investigate and re-run." >&2
    exit 1
  fi
  echo "OK: minInstances=$MIN_INSTANCES enforced per LD-291."
fi

echo
echo "=== Done ==="
echo
echo "Reminder: monthly billing review against \$${COST_CEILING_MONTHLY_USD}/mo ceiling per LD-91 carve-out."
echo "If exceeded, file an app_blockers row referencing LD-291 + LD-91 and triage."

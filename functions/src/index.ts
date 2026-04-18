/**
 * MindfulNest Cloud Functions v2 entry point.
 *
 * Intentionally empty at S3-CF-init. No triggers exported — keeping zero
 * auth surface until downstream S3-CF-* rows (sanitize / coin / audit /
 * retention / rtd / therapist-summary) each run their own preflight.
 *
 * setGlobalOptions MUST be called before any function definition (region is
 * part of function identity — changing it later requires delete+redeploy).
 * us-central1 chosen for COPPA US data residency (LD-222 transit encryption).
 */

import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({ region: 'us-central1' });

export {};

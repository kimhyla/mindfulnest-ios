/**
 * MindfulNest Cloud Functions v2 entry point.
 *
 * setGlobalOptions MUST be called before any function definition — region
 * is part of function identity, changing it later requires delete+redeploy.
 * us-central1 chosen for COPPA US data residency (LD-222).
 */

import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({ region: 'us-central1' });

// S3-CF-sanitize (preflight 61, LD-171, Pattern C staging-relay):
export { sanitizeZapStaging } from './triggers/firestore/sanitizeZapStaging';
export { sanitizeWishingGardenStaging } from './triggers/firestore/sanitizeWishingGardenStaging';

// S3-AUTH-firebase (preflight 66, server-side piece):
export { onParentSignup } from './triggers/auth/onParentSignup';
export { claimTherapistInvite } from './triggers/https/claimTherapistInvite';

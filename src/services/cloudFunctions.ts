// Typed wrappers for Firebase callable Cloud Functions used in the app.
// LD-406: app never calls Firebase Storage directly — all CDN URLs are
// obtained via this CF, which validates auth + entitlement and issues a
// short-lived signed URL.
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase';

const functions = getFunctions(firebaseApp, 'us-central1');

export interface ModuleDownloadUrlRequest {
  moduleId: string;
}

export interface PhaseBoundary {
  name: string;
  start_s: number;
  end_s: number;
}

export interface ModuleDownloadUrlResponse {
  url: string;
  contentHash: string;
  sizeBytes: number;
  phaseBoundaries: PhaseBoundary[];
  arcId: string;
  moduleId: string;
}

export const getModuleDownloadUrl = httpsCallable<
  ModuleDownloadUrlRequest,
  ModuleDownloadUrlResponse
>(functions, 'generateModuleDownloadUrl');

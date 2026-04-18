// Firebase JS SDK client init. Preflight 78. Single source of truth for the
// app's Firebase app + auth instances.
//
// PERSISTENCE NOTE (LD-278 SHORTCUT): Firebase v10+ removed the public
// `getReactNativePersistence` export. Without it, `getAuth()` yields
// in-memory persistence — users sign out on every app reload in RN.
// This is a known v1 limitation with closure plan: either migrate to
// @react-native-firebase/auth (contradicts preflight 66) or implement
// custom AsyncStorage persistence adapter. Tracked as LD-278.
//
// The config below is PUBLIC — apiKey/appId/projectId are not secrets.
// Rules v7/v8 enforce authorization; the SDK config is just routing info.

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
// eslint-disable-next-line no-restricted-imports -- services/ IS the wrapper
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCBIirq_eW3gGMjXxUownlkq5c0CVta8jA',
  authDomain: 'mindfulnestkids.firebaseapp.com',
  projectId: 'mindfulnestkids',
  storageBucket: 'mindfulnestkids.firebasestorage.app',
  messagingSenderId: '121941575373',
  appId: '1:121941575373:web:80d4d8159824a9bdac0b84',
};

function ensureApp(): FirebaseApp {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

export const firebaseApp: FirebaseApp = ensureApp();
export const firebaseAuth: Auth = getAuth(firebaseApp);

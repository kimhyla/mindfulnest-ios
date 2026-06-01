# LD-278 Auth Persistence Migration Spec v1

**Status:** EXECUTING  
**Date:** 2026-05-31  
**Agent model:** GPT 5.5 (Agent mode, autonomous with gates)  
**Decision:** migrate app auth and callable functions from Firebase JS client SDK to React Native Firebase native modules.

---

## 1. Problem

`src/services/firebase.ts` currently initializes Firebase JS Auth with `getAuth(firebaseApp)`. In React Native, the installed Firebase JS v12 package does not expose the former React Native AsyncStorage persistence helper, so auth state is in-memory only. Parents can be signed out after app reload.

This blocks polished app behavior, authenticated Maestro/native smoke tests, and reliable module entitlement/callable flows.

---

## 2. Ground Truth Evidence

| Evidence | Result |
|----------|--------|
| `rg "getReactNativePersistence" node_modules/firebase node_modules/@firebase/auth` | no matches |
| `require('firebase/auth')` export inspection | `initializeAuth`, browser persistence, and `inMemoryPersistence` exist; no React Native persistence helper |
| `package.json` | `@react-native-firebase/app`, `app-check`, `crashlytics` already installed at `^24.0.0`; auth/functions absent |
| `npm view @react-native-firebase/auth version peerDependencies` | `24.0.0`, peers exactly `@react-native-firebase/app: 24.0.0` |
| `npm view @react-native-firebase/functions version peerDependencies` | `24.0.0`, peers exactly `@react-native-firebase/app: 24.0.0` |

---

## 3. Classification

| Tag | Meaning |
|-----|---------|
| `P0-blocker` | Auth persistence missing in current app |
| `P0-regression-risk` | Callable auth context can break if auth and functions use different SDK stacks |
| `P1-native-risk` | Requires native module install/autolinking, pod install/build proof |

---

## 4. Chosen Path

Use React Native Firebase for both:

- Auth: `@react-native-firebase/auth`
- Callable functions: `@react-native-firebase/functions`

Why both:

- Native auth persistence is owned by RNFirebase Auth.
- Callable auth context must come from the same native Firebase app/auth state, so functions should migrate too.

Do **not** use unsupported Firebase JS internals or custom persistence shims.

---

## 5. Work Items

### LD278-001 — Add Native Firebase Packages

- Install `@react-native-firebase/auth@24.0.0`
- Install `@react-native-firebase/functions@24.0.0`
- Add config plugins if package plugin files exist.

Acceptance:

- `package.json` and `package-lock.json` updated.
- `npm ls @react-native-firebase/auth @react-native-firebase/functions` passes.

### LD278-002 — Migrate Auth Wrapper

- Replace Firebase JS Auth imports in `src/services/auth.ts` with RNFirebase Auth.
- Keep wrapper API stable:
  - `signIn`
  - `signUp`
  - `signOut`
  - `subscribeAuth`
  - `refreshClaims`
  - `refreshClaimsUntilRole`
- Update `AuthUser` and unsubscribe types to RNFirebase types.

Acceptance:

- No app/screen imports from `firebase/auth`.
- Typecheck passes.

### LD278-003 — Migrate Callable Wrapper

- Replace `firebase/functions` in `src/services/cloudFunctions.ts` with RNFirebase Functions.
- Keep `getModuleDownloadUrl({ moduleId })` call shape stable for `catalogService`.
- Preserve `us-central1`.

Acceptance:

- `catalogService` needs no call-shape change or only minimal typed wrapper adjustment.
- No app import from `firebase/functions`.

### LD278-004 — Native QA Feasibility

Run local gates plus native-feasible checks:

- `npm install` / package resolution
- `npm run lint`
- `npm test`
- `npx tsc --noEmit`
- `npm run test:coppa-contracts`
- `npm run test:rules`
- `npm --prefix functions test`
- `NODE_ENV=production npx expo export --platform web --output-dir dist`
- `npx expo prebuild --platform ios --no-install` or config/plugin inspection if prebuild would destructively rewrite native state
- If feasible in local environment: `npx pod-install ios` or `cd ios && pod install`

Native proof limits:

- Browser/web export cannot prove persisted native auth.
- True completion still requires iOS simulator/device manual smoke:
  1. sign in
  2. kill/relaunch
  3. confirm user remains signed in
  4. open `/module/m1`
  5. callable receives auth + App Check
  6. sign out
  7. kill/relaunch
  8. confirm signed out

---

## 6. Out of Scope

- UI redesign for sign-in/sign-up
- Firestore progression mirror
- Real Everdale sprite map
- Changing Firebase project/config files


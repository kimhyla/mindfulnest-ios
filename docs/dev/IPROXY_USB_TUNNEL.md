# MindfulNest Dev Telemetry — iproxy USB Tunnel (Mac → iPad)

**Per LD-157 `DEV_TELEMETRY_AUTOLINKING_EXCLUSION_PATTERN` 4b-hardened (i): iproxy USB tunnel is the ONLY supported transport for Mac→iPad dev telemetry. No WiFi.**

Why: Even with all five autolinking gates working correctly, an HTTP server on a children's app over plaintext WiFi is an unacceptable attack surface during dev sessions (clinic networks, school WiFi, conference WiFi). USB-only binding eliminates the WiFi attack vector entirely.

## Prerequisites

- Mac connected to iPad via Lightning/USB-C cable
- `libimobiledevice` installed: `brew install libimobiledevice`
- Xcode + iPad provisioned for dev (one-time)
- MindfulNest dev build running on iPad (not Expo Go — needs `expo-dev-client`)

## Flow

```bash
# 1. On Mac: start the USB tunnel (Mac:8082 → iPad:8082)
iproxy 8082 8082

# 2. On iPad: launch MindfulNest in dev mode. Watch Metro logs / Xcode console
#    for the per-launch auth token:
#       [DevTelemetryServer] auth token (this launch only): <UUID>
#       [DevTelemetryServer] listening on port 8082. Mac: iproxy 8082 8082 → http://127.0.0.1:8082

# 3. Set the token in your shell:
export MN_DEV_TOKEN='<paste UUID from Metro logs>'

# 4. Hit the endpoints (now reachable on Mac at 127.0.0.1:8082 via the tunnel):
curl http://127.0.0.1:8082/health                                      # unauthenticated, returns service info
curl "http://127.0.0.1:8082/state?token=$MN_DEV_TOKEN"                 # live telemetry JSON
curl "http://127.0.0.1:8082/screenshot?token=$MN_DEV_TOKEN" \
  --output /tmp/mn-screenshot.png                                       # base64-encoded PNG
base64 -d /tmp/mn-screenshot.png > /tmp/mn-screenshot.decoded.png      # if base64 wrapper is in body
open /tmp/mn-screenshot.decoded.png
```

## Authentication

- Token is generated **per-launch** via `expo-crypto`'s `randomUUID()` (RFC 4122 v4).
- Token lives **in-memory only** plus printed to Metro/Xcode logs once at startup.
- Token is **never** in `.env`, **never** bundled, **never** persisted across launches.
- Tunnel restart or app restart → new token; previous token rejected.
- All routes except `/health` require token via `?token=<UUID>` query param. (Authorization header support is a Phase 6 follow-up — `react-native-http-bridge-refurbished` does not currently expose request headers.)

## Endpoints

| Path | Auth | Returns |
|---|---|---|
| `GET /health` | No | `{status, service, transport}` static info, no PII |
| `GET /state?token=...` | Yes | `DevTelemetryData` JSON (current screen, audio state, breathing circle, etc.) |
| `GET /screenshot?token=...` | Yes | Base64-encoded PNG of current screen via ViewShot |

## Five-layer safety architecture (per LD-157)

This server cannot start in production because:

1. **L1 (JS DCE)** — `app/_layout.tsx` requires `DevTelemetryServer` only inside `if (__DEV__)`. Metro DCE strips the entire module from production bundles.
2. **L2 (build env)** — Server's `safetyGatesPass()` checks `process.env.NODE_ENV !== 'production'`. EAS preview/production profiles set `NODE_ENV=production`.
3. **L3a (config plugin)** — `app.config.ts` only includes `./plugins/withDevTelemetryServer` in dev profiles. The plugin sets `extra.devTelemetryEnabled` which the runtime gate verifies.
4. **L3b (autolinking)** — `react-native.config.js` excludes `react-native-http-bridge-refurbished` and `react-native-view-shot` from production autolinking, so the native libraries (GCDWebServer etc.) are not linked into the iOS binary.
5. **L4 (CI)** — `.github/workflows/telemetry-native-scan.yml` greps the production .ipa for native symbols (RCTHttpServer/GCDWebServer/etc.) and fails the merge if any are found.
6. **L5 (runtime)** — `safetyGatesPass()` asserts all of `__DEV__ === true` AND `NODE_ENV !== 'production'` AND `Constants.expoConfig?.extra?.devTelemetryEnabled === true` AND `Platform.OS !== 'web'` before `.listen()`.

If any single layer regresses, the others catch it. CI Layer 4 is the end-to-end gate.

## Future iPad runtime test (DEFERRED to Kim — requires hardware)

Phase 7 acceptance for Blocker #2:

1. ✅ tsc clean (run in code session)
2. ✅ `npx expo config` parses (run in code session)
3. ✅ Web telemetry-scan still passes (run in code session)
4. ⏸ `npx expo prebuild --clean --platform ios` succeeds (deferred — would clobber existing ios/)
5. ⏸ EAS development build → install on iPad → server starts → `iproxy 8082 8082` from Mac → `curl /health` returns 200 → `curl /state?token=...` returns telemetry → `curl /screenshot?token=...` returns PNG (deferred — Kim's hardware)
6. ⏸ EAS production build (`eas build --profile production --local --platform ios`) → run telemetry-native-scan.yml's grep manually → ZERO matches (deferred — local EAS build takes ~10-20 min)

## Phase 6 blind spots logged for follow-up

- **BS-LIB-1:** `react-native-http-bridge-refurbished` does not expose request headers in the request object. Auth currently uses `?token=` query param. If the lib's API changes, switch to `Authorization: Bearer <token>` header.
- **BS-LIB-2:** `react-native-http-bridge-refurbished` iOS module uses `RCTBridgeModule` (legacy architecture). RN 0.81 New Arch interop should handle this, but unverified until EAS dev build runs on iPad.
- **BS-HOST-1:** GCDWebServer (the native impl) binds to `0.0.0.0` (all interfaces) by default; `react-native-http-bridge-refurbished` does not currently expose host-binding configuration. iOS App Transport Security mitigates plaintext non-localhost access from third-party apps, but for full safety we rely on Layers 1-5 ensuring the server never runs in production.
- **BS-PERSIST-1:** Token persistence to `/tmp/mn-devtelemetry-token` (per Kim's spec) is currently console.log-only. Disk write would require installing `expo-file-system` (not in current dep set). Add as follow-up if Mac harness needs file-based scrape.

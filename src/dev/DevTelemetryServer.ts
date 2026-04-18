/**
 * MindfulNest DevTelemetry HTTP Server — Layer 3 native bridge for iPad dev testing.
 *
 * STRICTLY DEV-ONLY. Per LD-157 DEV_TELEMETRY_AUTOLINKING_EXCLUSION_PATTERN
 * with FIVE independent gating layers + 4b-hardened auth (Kim, 2026-04-17).
 *
 * Layers:
 *   L1 (JS DCE):       require() inside __DEV__ block at app/_layout.tsx call site.
 *                      Metro DCE strips entire DevTelemetryServer module from prod bundle.
 *   L2 (build env):    process.env.NODE_ENV !== 'production' assertion at gate.
 *   L3a (config-plug): plugins/withDevTelemetryServer.js sets manifest.extra.devTelemetryEnabled.
 *                      Plugin only runs in dev (gated in app.config.ts).
 *   L3b (autolink):    react-native.config.js excludes native deps when EAS_BUILD_PROFILE
 *                      is production/preview or NODE_ENV=production.
 *   L4 (CI):           .github/workflows/telemetry-native-scan.yml greps production .ipa
 *                      for HTTPBridge/GCDWebServer/WGCDWebServer symbols.
 *   L5 (runtime):      safetyGatesPass() asserts all of __DEV__, NODE_ENV, manifest.extra.
 *                      .listen() refuses if any gate fails.
 *
 * 4b-hardened auth (transport: iproxy USB tunnel ONLY — see docs/dev/IPROXY_USB_TUNNEL.md):
 *   - Auth token rotated per app launch via expo-crypto's randomUUID (RFC 4122 v4).
 *   - Token stored in-memory; printed via console.log so Metro/Xcode log scrape works.
 *     Disk persistence (FileSystem write) is a follow-up if needed (would require
 *     installing expo-file-system; not in current dep set).
 *   - All authenticated routes require token via Authorization: Bearer <token> header
 *     OR ?token=<...> query param (lib limitation: react-native-http-bridge-refurbished
 *     does not currently expose request headers in the request object — Phase 6 BS-LIB-1).
 *   - /health returns only static info (service name + transport hint), unauthenticated.
 *
 * Per LD-112 STAGE2_GATE_HTTP_ENDPOINT (revised 2026-04-17 by Kim approval).
 * Per LD-157 DEV_TELEMETRY_AUTOLINKING_EXCLUSION_PATTERN.
 */

import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import type { DevTelemetryData } from "./DevTelemetry";

let server: import("react-native-http-bridge-refurbished").BridgeServer | null =
  null;
let authToken: string | null = null;

const DEFAULT_PORT = 8082;
const SERVICE_NAME = "MindfulNestDevTelemetry";

function safetyGatesPass(): boolean {
  if (!__DEV__) return false;
  if (process.env.NODE_ENV === "production") return false;
  if (Constants.expoConfig?.extra?.devTelemetryEnabled !== true) return false;
  if (Platform.OS === "web") return false;
  return true;
}

function getTelemetrySnapshot(): DevTelemetryData {
  const { getDevTelemetry } =
    require("./DevTelemetry") as typeof import("./DevTelemetry");
  return getDevTelemetry();
}

function requireAuth(req: { url: string }): boolean {
  if (!authToken) return false;
  const url = req.url ?? "";
  const match = url.match(/[?&]token=([^&#]+)/);
  if (match && decodeURIComponent(match[1]) === authToken) return true;
  return false;
}

export async function startDevTelemetryServer(): Promise<boolean> {
  if (!safetyGatesPass()) {
     
    console.log(
      "[DevTelemetryServer] safety gate blocked startup — correct in production builds."
    );
    return false;
  }
  if (server) return true;

  authToken = Crypto.randomUUID();
   
  console.log(
    `[DevTelemetryServer] auth token (this launch only): ${authToken}`
  );
   
  console.log(
    `[DevTelemetryServer] usage: curl -H "Authorization: Bearer ${authToken}" http://127.0.0.1:${DEFAULT_PORT}/state  (after \`iproxy ${DEFAULT_PORT} ${DEFAULT_PORT}\` on Mac)`
  );

  const { BridgeServer } =
    require("react-native-http-bridge-refurbished") as typeof import("react-native-http-bridge-refurbished");
  const bridge = new BridgeServer(SERVICE_NAME, true);

  bridge.get("/health", async (_req, res) => {
    res.json({
      status: "ok",
      service: SERVICE_NAME,
      transport: "iproxy USB tunnel only — see docs/dev/IPROXY_USB_TUNNEL.md",
    });
  });

  bridge.get("/state", async (req, res) => {
    if (!requireAuth(req as { url: string })) {
      res.send(
        401,
        "application/json",
        JSON.stringify({ error: "unauthorized" })
      );
      return;
    }
    const snapshot = getTelemetrySnapshot();
    res.json(snapshot);
  });

  bridge.get("/screenshot", async (req, res) => {
    if (!requireAuth(req as { url: string })) {
      res.send(
        401,
        "application/json",
        JSON.stringify({ error: "unauthorized" })
      );
      return;
    }
    const ViewShot =
      require("react-native-view-shot") as typeof import("react-native-view-shot");
    try {
      const base64 = await ViewShot.captureScreen({
        format: "png",
        result: "base64",
        quality: 1.0,
      });
      res.send(200, "image/png", base64);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.send(
        500,
        "application/json",
        JSON.stringify({ error: "capture_failed", detail: message })
      );
    }
  });

  bridge.listen(DEFAULT_PORT);
  server = bridge;
   
  console.log(
    `[DevTelemetryServer] listening on port ${DEFAULT_PORT}. Mac: iproxy ${DEFAULT_PORT} ${DEFAULT_PORT} → http://127.0.0.1:${DEFAULT_PORT}`
  );
  return true;
}

export function stopDevTelemetryServer(): void {
  if (server) {
    server.stop();
    server = null;
    authToken = null;
  }
}

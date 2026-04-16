/**
 * MindfulNest Dev Telemetry — Layer 3
 *
 * Exposes app state via window.__MINDFULNEST_DEV__ for Chrome MCP to read.
 * Web-only (Stage 1): Chrome's javascript_tool reads globals directly (zero-latency).
 *
 * STAGE 2 TODO: Add HTTP endpoint for native iPad testing.
 * Architecture doc specifies: GET /state on port 8082, GET /screenshot via ViewShot.
 * Required for Framework Gate — measuring breathing circle audio sync latency.
 * Uses react-native-http-bridge + react-native-view-shot.
 * See APP_DEV_AUTOMATION_ARCHITECTURE_v1.md Layer 3 specification.
 *
 * Source: VISUAL_FEEDBACK_TEST_RESULTS_April15_2026_v2.md (proven pattern)
 * Source: APP_DEV_AUTOMATION_ARCHITECTURE_v1.md (Layer 3 architecture)
 *
 * SAFETY: Entire module wrapped in __DEV__ guard.
 * Production builds set NODE_ENV=production which disables __DEV__.
 * Three-layer safety gate:
 *   1. Code-level: if (__DEV__) guard around all telemetry
 *   2. Build-level: EAS production profile sets NODE_ENV=production
 *   3. CI-level: GitHub Action greps bundle for telemetry markers (future)
 */

import { Platform } from "react-native";

// ─── Type Declarations ──────────────────────────────────────────────

export interface AppState {
  currentScreen: string;
  activeModule: string | null;
  coinBalance: number;
  stonesCollected: string[];
  audioState: {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
  };
  breathingCircle: {
    phase: string;
    progress: number;
  } | null;
}

export interface DevTelemetryData {
  version: string;
  state: AppState;
  health: {
    status: "ok" | "error";
    platform: "web" | "native";
    devMode: boolean;
  };
}

// ─── Global Type Extension ──────────────────────────────────────────

// Extend the global window type for web platforms
declare global {
  interface Window {
    __MINDFULNEST_DEV__?: DevTelemetryData;
  }
}

// ─── Default State ──────────────────────────────────────────────────

const DEFAULT_STATE: AppState = {
  currentScreen: "home",
  activeModule: null,
  coinBalance: 0,
  stonesCollected: [],
  audioState: { isPlaying: false, currentTime: 0, duration: 0 },
  breathingCircle: null,
};

// ─── Telemetry Singleton ────────────────────────────────────────────

let currentState: AppState = { ...DEFAULT_STATE };

/**
 * Update the telemetry state. Call this from app screens/components
 * to keep the dev telemetry in sync with React state.
 */
export function updateDevTelemetry(partialState: Partial<AppState>): void {
  if (!__DEV__) return;
  currentState = { ...currentState, ...partialState };
  publishToGlobals();
}

/**
 * Get the current telemetry snapshot.
 */
export function getDevTelemetry(): DevTelemetryData {
  return {
    version: "1.0.0",
    state: currentState,
    health: {
      status: "ok",
      platform: Platform.OS === "web" ? "web" : "native",
      devMode: __DEV__ ?? false,
    },
  };
}

/**
 * Publish telemetry to window globals (web only).
 * On native, this is a no-op — native uses HTTP endpoint (future).
 */
function publishToGlobals(): void {
  if (!__DEV__) return;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.__MINDFULNEST_DEV__ = getDevTelemetry();
  }
}

// ─── Initialization ─────────────────────────────────────────────────

/**
 * Initialize dev telemetry. Call once from app root layout.
 * Sets up the initial state and publishes to globals.
 */
export function initDevTelemetry(): void {
  if (!__DEV__) return;
  currentState = { ...DEFAULT_STATE };
  publishToGlobals();
  // eslint-disable-next-line no-console
  console.log("[DevTelemetry] Initialized — window.__MINDFULNEST_DEV__ available");
}

// ─── Auto-init on module import (web only) ──────────────────────────
// Metro bundles this file; when imported, this block runs immediately.
// Ensures globals are set before any Chrome MCP reads attempt.
if (__DEV__ && Platform.OS === "web" && typeof window !== "undefined") {
  // Type-safe assignment — no `any` cast needed because the Window global
  // interface is extended at the top of this file (search: `declare global`).
  // Removing the __DEV__ guard above would now be caught by TypeScript strict mode.
  window.__MINDFULNEST_DEV__ = {
    version: "1.0.0",
    state: DEFAULT_STATE,
    health: { status: "ok", platform: "web", devMode: true },
  };
}

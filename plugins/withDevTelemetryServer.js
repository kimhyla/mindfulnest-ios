// Custom Expo config plugin — Dev Telemetry Server gating.
//
// Per LD-157 DEV_TELEMETRY_AUTOLINKING_EXCLUSION_PATTERN this is the
// CONFIG-PLUGIN gate (Layer 3a) running alongside the AUTOLINKING gate
// (Layer 3b) in react-native.config.js. The plugin's entry in
// app.config.ts is itself conditionally included based on EAS_BUILD_PROFILE
// + NODE_ENV — so when this plugin runs at prebuild time, we know we're in
// a dev/development profile.
//
// The plugin's job:
//   1. Set Constants.expoConfig.extra.devTelemetryEnabled = true so the
//      runtime code (DevTelemetryServer.ts Layer 5b assertion) can verify
//      the manifest agrees with __DEV__ + NODE_ENV gates.
//   2. Provide a single audit point for any future native-build-time mods
//      (e.g., Info.plist keys for telemetry endpoint discovery, Podfile
//      post_install verification of dev pods, etc.).
//
// runOnce wrapper: prevents double-application if Expo re-runs plugin chain.

const { createRunOncePlugin } = require("@expo/config-plugins");

const PLUGIN_NAME = "with-dev-telemetry-server";
const PLUGIN_VERSION = "1.0.0";

const withDevTelemetryServer = (config) => {
  config.extra = {
    ...(config.extra ?? {}),
    devTelemetryEnabled: true,
    devTelemetryPort: 8082,
    devTelemetryServiceName: "MindfulNestDevTelemetry",
  };
  return config;
};

module.exports = createRunOncePlugin(
  withDevTelemetryServer,
  PLUGIN_NAME,
  PLUGIN_VERSION
);

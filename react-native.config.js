// React Native autolinking config.
//
// Per LD-157 DEV_TELEMETRY_AUTOLINKING_EXCLUSION_PATTERN Layer 3 (mandatory
// for native modules): dev-only native deps must NOT be autolinked into
// production EAS builds. This file is evaluated at `npx expo prebuild` and
// `pod install` time, and Expo's autolinking layer respects per-platform
// `null` overrides to skip linking.
//
// Gate: EAS_BUILD_PROFILE === 'production' or 'preview', or NODE_ENV === 'production'
// → disables linking of all dev telemetry native deps. Otherwise (development
// profile, local dev) links normally so DevTelemetryServer can run on iPad.
//
// Belt + suspenders: this is the AUTOLINKING gate. The CONFIG-PLUGIN gate is
// in app.config.ts (the './plugins/withDevTelemetryServer' entry is itself
// conditionally added based on the same env vars). Either gate alone would
// be sufficient; both together prevent any single-layer regression.
//
// This file MUST stay in sync with the DEV_ONLY_NATIVE_MODULES list when
// adding new dev-only native modules per LD-157.

const isProduction =
  process.env.EAS_BUILD_PROFILE === "production" ||
  process.env.EAS_BUILD_PROFILE === "preview" ||
  process.env.NODE_ENV === "production";

const DEV_ONLY_NATIVE_MODULES = [
  "react-native-http-bridge-refurbished",
  "react-native-view-shot",
];

module.exports = {
  dependencies: isProduction
    ? Object.fromEntries(
        DEV_ONLY_NATIVE_MODULES.map((name) => [
          name,
          { platforms: { ios: null, android: null } },
        ])
      )
    : {},
};

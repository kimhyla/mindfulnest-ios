// metro.config.js — Bundle-size optimization per SIZE_BUDGET_V1 + BUNDLE_SIZE_CI_ENFORCEMENT_V1
// Source: SIZE_BUDGET_AUDIT_20260418.md §9 R-6
// Locked decisions: SIZE_BUDGET_V1 (id=295), BUNDLE_SIZE_CI_ENFORCEMENT_V1 (id=299)

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// inlineRequires: scoped to NATIVE platforms only.
//
// Why scoped: applying inlineRequires on the web bundle conflicts with
// expo-router/entry.js (it triggers a Babel error: "Please only specify
// either output or format option" because expo-router's web entry uses a
// module-format option that inlineRequires re-wraps incorrectly). Native
// platforms (ios/android) don't use the same entry shape, so they get the
// 5-15% startup-parse savings safely. Web still benefits from Metro's
// default Terser minifier (the actual size win for SIZE_BUDGET_V1's 200 MB
// ceiling); inlineRequires is primarily a cold-start win, less relevant
// for web.
//
// `metro-minify-terser` is the Metro default; no `minifierPath` override
// needed (the previous explicit config tried to set a custom-shaped
// minifierConfig which Metro 0.81 + Expo 54 already provides).
config.transformer = {
  ...config.transformer,
  getTransformOptions: async (_entryPoints, options) => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: options.platform !== 'web',
    },
  }),
};

module.exports = config;

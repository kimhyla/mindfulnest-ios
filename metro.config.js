// metro.config.js — Bundle-size optimization per SIZE_BUDGET_V1 + BUNDLE_SIZE_CI_ENFORCEMENT_V1
// Source: SIZE_BUDGET_AUDIT_20260418.md §9 R-6
// Locked decisions: SIZE_BUDGET_V1 (id=295), BUNDLE_SIZE_CI_ENFORCEMENT_V1 (id=299)

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// inlineRequires: true — defer requires until first use, smaller startup parse cost
// Targets ~5-15% JS bundle reduction per audit §9 R-6.
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
  // Terser minifier on web export with mangling + dead-code elimination.
  minifierPath: 'metro-minify-terser',
  minifierConfig: {
    keep_classnames: false,
    keep_fnames: false,
    mangle: { toplevel: true },
    compress: {
      drop_console: false, // keep console.error / warn for crash reporting; Sentry strip happens at build
      passes: 2,
    },
    format: {
      ascii_only: true,
      comments: false,
    },
  },
};

module.exports = config;

import type { ExpoConfig, ConfigContext } from "expo/config";

// Per LD-157 DEV_TELEMETRY_AUTOLINKING_EXCLUSION_PATTERN, dev-only native
// modules are gated on EAS_BUILD_PROFILE (set by EAS during build) AND
// NODE_ENV (set by eas.json env per profile). Either being 'production'
// disables dev telemetry. The custom plugin further excludes native deps.
const isProduction =
  process.env.EAS_BUILD_PROFILE === "production" ||
  process.env.EAS_BUILD_PROFILE === "preview" ||
  process.env.NODE_ENV === "production";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  name: "MindfulNest",
  slug: "MindfulNest",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.mindfulnest.app",
    googleServicesFile: "./GoogleService-Info.plist",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    googleServicesFile: "./google-services.json",
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  scheme: "mindfulnest",
  plugins: [
    "expo-router",
    "expo-video",
    "expo-audio",
    "expo-asset",
    // React Native Firebase v24 requires static frameworks on iOS. Modular
    // headers break FirebaseAuth's generated Swift header imports.
    ["expo-build-properties", { "ios": { "useFrameworks": "static" } }],
    "@react-native-firebase/app",
    "@react-native-firebase/crashlytics",
    ...(isProduction ? [] : ["./plugins/withDevTelemetryServer"]),
  ],
  extra: {
    devTelemetryEnabled: !isProduction,
    eas: {
      projectId: "d9b5e6fc-0474-44f4-89db-383437542bc4",
    },
  },
  owner: "kimhyla11",
});

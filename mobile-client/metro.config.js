const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = withNativewind(getDefaultConfig(__dirname));

// NativeWind's className polyfill redirects every `react-native` import to
// `react-native-css/components`. That shim (react-native-css 3.1.0-rc.1) is
// missing `AssetRegistry`, which React Native 0.88 added and expo-asset (SDK 58)
// uses to load fonts and images. Let expo-asset import react-native directly.
// TODO: remove once react-native-css re-exports AssetRegistry.
const nativewindResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "react-native" &&
    /[\\/]node_modules[\\/]expo-asset[\\/]/.test(context.originModulePath)
  ) {
    return context.resolveRequest(context, moduleName, platform);
  }
  return nativewindResolveRequest(context, moduleName, platform);
};

module.exports = config;

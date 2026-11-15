// components/ui/GlassSurface.tsx
// A floating "glass" container for controls that sit above content
// (map toggle, map preview card). Picks the best effect the device supports:
//
//   iOS 26+ ............ Apple's native Liquid Glass (expo-glass-effect)
//   older iOS .......... frosted blur (expo-blur) with a dark tint
//   Android ............ solid dark surface (expo-blur on Android needs extra setup)
//   Reduce Transparency  solid dark surface, on any platform
//
// Layout (padding, flexDirection, borderRadius...) goes in `style`;
// className isn't mapped onto these third-party views.

import React, {useEffect, useState} from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {BlurView} from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";

const HAS_LIQUID_GLASS =
  Platform.OS === "ios" &&
  isLiquidGlassAvailable() &&
  // Some iOS 26 betas report Liquid Glass but lack the API, which crashes
  isGlassEffectAPIAvailable();

// Tuning knobs
const GLASS_TINT = "rgba(9, 9, 11, 0.35)"; // darkens native glass so white text reads
const BLUR_TINT = "rgba(24, 24, 27, 0.55)"; // layered over the iOS blur fallback
const SOLID_FILL = "rgba(24, 24, 27, 0.97)"; // Android / Reduce Transparency
const EDGE = "rgba(255, 255, 255, 0.14)"; // hairline edge for the fallbacks

export function useReduceTransparency() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => mounted && setEnabled(value))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setEnabled,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

export default function GlassSurface({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const reduceTransparency = useReduceTransparency();

  if (HAS_LIQUID_GLASS && !reduceTransparency) {
    return (
      <GlassView
        style={style}
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor={GLASS_TINT}
      >
        {children}
      </GlassView>
    );
  }

  const useBlur = Platform.OS === "ios" && !reduceTransparency;
  const radius = StyleSheet.flatten(style)?.borderRadius;

  return (
    // Outer view carries the shadow; the inner one clips the blur to the shape
    <View style={[styles.shadow, {borderRadius: radius}]}>
      <View
        style={[
          style,
          styles.edge,
          {overflow: "hidden"},
          !useBlur && {backgroundColor: SOLID_FILL},
        ]}
      >
        {useBlur && (
          <>
            <BlurView
              intensity={50}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[StyleSheet.absoluteFill, {backgroundColor: BLUR_TINT}]}
            />
          </>
        )}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: "#000",
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  edge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EDGE,
  },
});

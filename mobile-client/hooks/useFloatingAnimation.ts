import {useEffect} from "react";
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

export function useFloatingAnimation(distance = -5, duration = 1500) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withTiming(distance, {
        duration,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, []);

  return useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}],
  }));
}

// components/places/MapPin.tsx
// The pin for placing a new place on the map (#78): clean and flat, our
// own shape. A white rounded-square head with a small orange dot (Venture's
// accent), on a thin needle whose tip is the exact spot. White, to stand
// out on the dark map. While
// the map moves (`lift`, 0..1) the pin rises a little and a soft shadow
// on the ground shows where it will land.

import React from "react";
import {View} from "react-native";
import Reanimated, {type SharedValue, useAnimatedStyle} from "react-native-reanimated";

/** The app's place accent (search rows, icons) */
export const PIN_COLOR = "#FF9D0A";
/** The pin itself: white, with an orange dot */
const PIN_FILL = "#ffffff";
const PIN_MARK = PIN_COLOR;
/** Everything below is drawn at this size (tune the pin's size here) */
const SCALE = 1.35;
const s = (n: number) => n * SCALE;
const HEAD = s(21);
/** The needle, from the head down to the spot */
const STEM = s(18);
const NEEDLE_WIDTH = s(2);
/** How high it rises while you move the map */
const LIFT = s(8);

/** Where the spot is, from the top (the needle's tip) */
export const PIN_TIP_Y = HEAD + STEM;
export const PIN_WIDTH = HEAD;
/** (a little room below the tip for the shadow) */
export const PIN_HEIGHT = PIN_TIP_Y + s(3);

export default function MapPin({lift}: {lift?: SharedValue<number>}) {
  // (inline styles: NativeWind doesn't reliably style Animated views)
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{translateY: -(lift?.get() ?? 0) * LIFT}],
  }));
  // Only while it's lifted (at rest the tip is on the spot)
  const shadowStyle = useAnimatedStyle(() => ({opacity: (lift?.get() ?? 0) * 0.25}));
  // Where the tip goes into the map: a small dark mark, only while it's set
  // down (it lifts out of it)
  const contactStyle = useAnimatedStyle(() => ({opacity: 1 - (lift?.get() ?? 0)}));

  return (
    <View style={{width: PIN_WIDTH, height: PIN_HEIGHT, alignItems: "center"}} pointerEvents="none">
      <Reanimated.View
        style={[
          {
            position: "absolute",
            top: PIN_TIP_Y - s(2),
            width: s(10),
            height: s(4),
            alignItems: "center",
            justifyContent: "center",
          },
          contactStyle,
        ]}
      >
        {/* A faint wide ring, and a darker small centre: soft without a blur */}
        <View
          style={{position: "absolute", width: s(10), height: s(4), borderRadius: s(5), backgroundColor: "rgba(0,0,0,0.22)"}}
        />
        <View style={{width: s(5), height: s(2), borderRadius: s(1.5), backgroundColor: "rgba(0,0,0,0.55)"}} />
      </Reanimated.View>
      <Reanimated.View
        style={[
          {
            position: "absolute",
            top: PIN_TIP_Y - s(1.5),
            width: s(8),
            height: s(3),
            borderRadius: s(4),
            backgroundColor: "black",
          },
          shadowStyle,
        ]}
      />
      <Reanimated.View style={[{alignItems: "center"}, pinStyle]}>
        <View
          style={{
            width: HEAD,
            height: HEAD,
            // A soft rounded square, not a circle
            borderRadius: HEAD * 0.32,
            backgroundColor: PIN_FILL,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.3,
            shadowRadius: s(3),
            shadowOffset: {width: 0, height: s(1.5)},
            elevation: 6,
          }}
        >
          <View style={{width: s(7), height: s(7), borderRadius: s(3.5), backgroundColor: PIN_MARK}} />
        </View>
        {/* The needle: its tip is the spot */}
        <View
          style={{
            width: NEEDLE_WIDTH,
            height: STEM,
            backgroundColor: PIN_FILL,
            borderBottomLeftRadius: NEEDLE_WIDTH / 2,
            borderBottomRightRadius: NEEDLE_WIDTH / 2,
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 1,
            shadowOffset: {width: 0, height: 0},
          }}
        />
      </Reanimated.View>
    </View>
  );
}

// components/places/PlaceMarker.tsx
// A place on a map: our own pin (the one you drop when adding or moving a
// place), its tip exactly on the spot.
//
// Why not the map's plain coloured marker (<Marker pinColor>)? On iOS,
// react-native-maps sets Apple's balloon marker's offset to zero, which
// undoes Apple's own offset: the balloon's middle lands on the spot and its
// point shows a little south of it. Our pin's tip position is known, so it's
// placed exactly: Apple Maps centres a marker view on the spot (centerOffset
// moves it up), Google Maps uses `anchor`.
//
// `scale` draws it smaller or bigger (1: the size you drop it at). It shrinks
// around its middle, so the tip's distance from the middle scales with it.

import React from "react";
import {View} from "react-native";
import {Marker, type LatLng} from "react-native-maps";

import MapPin, {PIN_HEIGHT, PIN_TIP_Y, PIN_WIDTH} from "./MapPin";

export default function PlaceMarker({
  coordinate,
  title,
  scale = 1,
}: {
  coordinate: LatLng;
  title?: string;
  scale?: number;
}) {
  // How far below the pin's middle its tip is, at this size
  const tipBelowMiddle = (PIN_TIP_Y - PIN_HEIGHT / 2) * scale;
  return (
    <Marker
      coordinate={coordinate}
      title={title}
      // The tip on the spot
      centerOffset={{x: 0, y: -tipBelowMiddle}}
      anchor={{x: 0.5, y: (PIN_HEIGHT / 2 + tipBelowMiddle) / PIN_HEIGHT}}
    >
      <View style={{width: PIN_WIDTH, height: PIN_HEIGHT, transform: [{scale}]}}>
        <MapPin />
      </View>
    </Marker>
  );
}

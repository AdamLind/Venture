// components/places/MovePinSheet.tsx
// Move a place's pin (admins editing the app's own places): a full-screen map
// with the pin in the middle, its tip on the spot. Move the map under it,
// then "Use this spot". The same pin, and the same lining-up, as adding a
// place (PlacePicker's pin step), so the spot doesn't creep.

import React, { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { type Region } from "react-native-maps";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Easing, useSharedValue, withTiming } from "react-native-reanimated";

import GlassSurface from "@/components/ui/GlassSurface";
import MapPin, { PIN_TIP_Y, PIN_WIDTH } from "./MapPin";
import { showCoordinateAt } from "./PlacePicker";
import type { LatLng } from "@/utils/timeline";

const ZOOM = { latitudeDelta: 0.004, longitudeDelta: 0.004 };
const BUTTON_HEIGHT = 54;
const GLASS_ROUND = {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: "center",
  justifyContent: "center",
} as const;

export default function MovePinSheet({
  pin,
  onClose,
  onMoved,
}: {
  /** Where the pin is now (null: closed) */
  pin: LatLng | null;
  onClose: () => void;
  onMoved: (spot: LatLng) => void;
}) {
  return (
    <Modal
      visible={!!pin}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {pin ? <PinMap start={pin} onClose={onClose} onMoved={onMoved} /> : null}
    </Modal>
  );
}

function PinMap({
  start,
  onClose,
  onMoved,
}: {
  start: LatLng;
  onClose: () => void;
  onMoved: (spot: LatLng) => void;
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [spot, setSpot] = useState<LatLng>(start);
  // Satellite (a trailhead or a pullout is easier to see)
  const [satellite, setSatellite] = useState(false);
  // Apple's "Legal" link and logo must show: above the button
  const aboveButton = insets.bottom + 16 + BUTTON_HEIGHT + 8;
  const appleInsets = { top: 0, left: 0, right: 0, bottom: aboveButton };

  // The pin rises while the map moves under it
  const lift = useSharedValue(0);
  const moving = useRef(false);
  // The pin's tip is drawn at the map's middle; the spot is whatever the map
  // says is under it. Until the map is lined up with the pin, where the map
  // says it is doesn't move the spot
  const size = useRef<{ width: number; height: number } | null>(null);
  const aligningUntil = useRef(0);
  const aligned = useRef(false);
  const tip = () =>
    size.current
      ? { x: size.current.width / 2, y: size.current.height / 2 }
      : null;

  const align = async () => {
    const map = mapRef.current;
    const at = tip();
    if (!map || !at) return;
    aligningUntil.current = Date.now() + 400;
    try {
      await showCoordinateAt(map, start, at);
    } catch {}
    aligned.current = true;
  };

  const moved =
    spot.latitude !== start.latitude || spot.longitude !== start.longitude;

  return (
    <View
      className="flex-1 bg-black"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        size.current = { width, height };
      }}
    >
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...start, ...ZOOM }}
        mapType={satellite ? "hybrid" : "standard"}
        legalLabelInsets={appleInsets}
        appleLogoInsets={appleInsets}
        onMapReady={align}
        onRegionChange={() => {
          if (moving.current || Date.now() < aligningUntil.current) return;
          moving.current = true;
          lift.set(
            withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
          );
        }}
        onRegionChangeComplete={async (r: Region) => {
          moving.current = false;
          lift.set(
            withTiming(0, { duration: 110, easing: Easing.in(Easing.quad) }),
          );
          if (!aligned.current) return;
          const at = tip();
          try {
            const under = at
              ? await mapRef.current?.coordinateForPoint(at)
              : null;
            setSpot(under ?? { latitude: r.latitude, longitude: r.longitude });
          } catch {
            setSpot({ latitude: r.latitude, longitude: r.longitude });
          }
        }}
        userInterfaceStyle="dark"
      />

      {/* The pin stays in the middle, its tip on the spot */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          marginLeft: -PIN_WIDTH / 2,
          marginTop: -PIN_TIP_Y,
        }}
      >
        <MapPin lift={lift} />
      </View>

      {/* Top: cancel, and what to do */}
      <View
        className="absolute left-0 right-0 flex-row items-center px-4 gap-3"
        style={{ top: insets.top + 8 }}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          className="active:opacity-70"
        >
          <GlassSurface style={GLASS_ROUND}>
            <Ionicons name="close" size={22} color="white" />
          </GlassSurface>
        </Pressable>
        <View className="flex-1" pointerEvents="none">
          <GlassSurface
            style={{
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text className="text-white font-bold text-sm">Move the pin</Text>
            <Text className="text-zinc-300 text-xs">
              Move the map so the pin is where people go in, or park
            </Text>
          </GlassSurface>
        </View>
        <Pressable
          onPress={() => setSatellite((on) => !on)}
          accessibilityRole="button"
          accessibilityLabel={satellite ? "Show the map" : "Show satellite"}
          className="active:opacity-70"
        >
          <GlassSurface style={GLASS_ROUND}>
            <Ionicons
              name={satellite ? "map-outline" : "earth"}
              size={20}
              color="white"
            />
          </GlassSurface>
        </Pressable>
      </View>

      {/* Bottom: use it */}
      <View
        className="absolute left-0 right-0 px-5"
        style={{ bottom: insets.bottom + 16 }}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => onMoved(spot)}
          disabled={!moved}
          accessibilityRole="button"
          className="bg-white rounded-full items-center justify-center active:opacity-80"
          style={{ height: BUTTON_HEIGHT, opacity: moved ? 1 : 0.5 }}
        >
          <Text className="text-black font-extrabold text-base">
            {moved ? "Use this spot" : "Move the map first"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

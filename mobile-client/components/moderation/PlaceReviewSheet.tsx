// components/moderation/PlaceReviewSheet.tsx
// Checking a new place (#88), opened from its small card in the staff review
// panel: the pin on satellite (a trailhead, a lake and a house look
// different), what the poster entered, a warning if it's near their home,
// and what to check. "Looks right" marks it checked, which lets the idea be
// approved (and the place go public with it). Staff only.
//
// The app's own places (no one added them: the launch import's) can be fixed
// right here by an admin: Edit place (name, address, pin, how to get there,
// hours; components/places/EditPlaceSheet.tsx).

import React, {useState} from "react";
import {Modal, Pressable, ScrollView, Text, View} from "react-native";
import MapView from "react-native-maps";
import {Ionicons} from "@expo/vector-icons";
import {useSafeAreaInsets} from "react-native-safe-area-context";

import {parseCoordinates} from "@/utils/itineraryEngine";
import EditPlaceSheet, {type EditablePlace} from "@/components/places/EditPlaceSheet";
import PlaceMarker from "@/components/places/PlaceMarker";
import {weekLines} from "@/utils/openingHours";

export type ReviewPlace = {
  venue_id?: string | null;
  name?: string | null;
  address?: string | null;
  coordinates?: string | null;
  opening_hours?: string | null;
  access_note?: string | null;
  pinned_by?: {username: string | null} | null;
};

const CHECKS = [
  "The pin is where people start: the trailhead, pullout or entrance",
  "Anyone can go there: not private property or someone's yard",
  "The name is its real name, not an ad",
  "The hours and how to get there look right",
];

export default function PlaceReviewSheet({
  visible,
  place,
  nearHome,
  checked,
  onClose,
  onChecked,
  editable = false,
  onEdited,
}: {
  visible: boolean;
  place: ReviewPlace | null | undefined;
  /** Pinned near the poster's saved home (yes or no only) */
  nearHome: boolean;
  checked: boolean;
  onClose: () => void;
  /** "Looks right" (true) or undone (false) */
  onChecked: (checked: boolean) => void;
  /** An admin, and one of the app's own places: Edit place */
  editable?: boolean;
  /** Saved an edit (the idea page reads the place again) */
  onEdited?: (venueId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [satellite, setSatellite] = useState(true);
  const [now] = useState(() => Date.now());
  const pin = parseCoordinates(place?.coordinates ?? null);
  const [editing, setEditing] = useState<EditablePlace | null>(null);
  const edit = () => {
    if (!place?.venue_id || !pin) return;
    setEditing({
      venueId: place.venue_id,
      name: place.name ?? "",
      accessNote: place.access_note ?? null,
      openingHours: place.opening_hours ?? null,
      listed: {address: place.address ?? null, latitude: pin.latitude, longitude: pin.longitude},
    });
  };
  const hours = weekLines(place?.opening_hours ?? null, now);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-zinc-950">
        <View className="flex-row items-center px-6 pt-7 pb-3 border-b border-zinc-900">
          <View className="flex-1">
            <Text className="text-orange-200 text-xs font-bold uppercase tracking-widest">New place</Text>
            <Text className="text-white font-extrabold text-xl" numberOfLines={1}>
              {place?.name ?? "This place"}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" className="active:opacity-60">
            <Text className="text-zinc-400 font-semibold text-base">Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerClassName="px-6 pt-5 gap-4" contentContainerStyle={{paddingBottom: insets.bottom + 24}}>
          <Text className="text-zinc-400 text-sm leading-5">
            {editable
              ? "It goes public when this idea is approved. It's one of the app's own places, so if anything is off, fix it here."
              : "It goes public when this idea is approved. Check it here; if the pin or name is off, send the idea back with Changes (there are quick picks for places)."}
          </Text>

          {editable && pin ? (
            <Pressable
              onPress={edit}
              accessibilityRole="button"
              className="self-start flex-row items-center gap-1.5 px-3.5 py-2 rounded-full bg-zinc-900 border border-zinc-800 active:opacity-70"
            >
              <Ionicons name="pencil-outline" size={14} color="#60a5fa" />
              <Text className="text-blue-400 text-sm font-semibold">Edit place</Text>
            </Pressable>
          ) : null}

          {nearHome && (
            <View className="flex-row gap-2 rounded-2xl px-3.5 py-3 bg-red-500/15 border border-red-400/40">
              <Ionicons name="home" size={15} color="#fca5a5" style={{marginTop: 2}} />
              <Text className="text-red-100 text-sm leading-5 flex-1">
                Pinned near the poster&apos;s home. Make sure it isn&apos;t their yard or a private spot.
              </Text>
            </View>
          )}

          {/* The pin, on satellite by default */}
          {pin ? (
            <View className="h-72 rounded-2xl overflow-hidden">
              <MapView
                // (keyed: a pin moved with Edit place re-centres it)
                key={`${pin.latitude},${pin.longitude}`}
                style={{flex: 1}}
                mapType={satellite ? "satellite" : "standard"}
                userInterfaceStyle="dark"
                initialRegion={{...pin, latitudeDelta: 0.004, longitudeDelta: 0.004}}
                pitchEnabled={false}
                rotateEnabled={false}
              >
                <PlaceMarker coordinate={pin} scale={0.8} />
              </MapView>
              <Pressable
                onPress={() => setSatellite((s) => !s)}
                accessibilityRole="button"
                accessibilityLabel={satellite ? "Show the map" : "Show satellite"}
                className="absolute top-2.5 right-2.5 px-3 py-1.5 rounded-full bg-black/70 active:opacity-70"
              >
                <Text className="text-white text-xs font-bold">{satellite ? "Map" : "Satellite"}</Text>
              </Pressable>
            </View>
          ) : (
            <Text className="text-red-300 text-sm">No pin on this place.</Text>
          )}

          {/* What the poster entered */}
          <View className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
            {[
              {label: "Address", text: place?.address || "—"},
              {label: "Pinned by", text: place?.pinned_by?.username ? `@${place.pinned_by.username}` : "—"},
              {label: "How to get there", text: place?.access_note || "No note"},
              {
                label: "Hours",
                text: !hours
                  ? "Not given"
                  : hours.every((h) => h.text === hours[0].text)
                    ? `Every day, ${hours[0].text}`
                    : hours.map((h) => `${h.day} ${h.text}`).join("\n"),
              },
            ].map((row, i) => (
              <View key={row.label} className={`flex-row gap-3 px-4 py-3 ${i > 0 ? "border-t border-zinc-800" : ""}`}>
                <Text className="w-28 text-zinc-400 text-sm">{row.label}</Text>
                <Text className="flex-1 text-white text-sm leading-5">{row.text}</Text>
              </View>
            ))}
          </View>

          {/* What to check */}
          <View className="gap-2">
            {CHECKS.map((line) => (
              <View key={line} className="flex-row gap-2.5">
                <Ionicons name="checkmark-circle-outline" size={17} color="#fdba74" style={{marginTop: 1}} />
                <Text className="text-zinc-200 text-sm leading-5 flex-1">{line}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => {
              onChecked(!checked);
              if (!checked) onClose();
            }}
            accessibilityRole="button"
            className={`h-13 py-3.5 rounded-2xl items-center justify-center active:opacity-80 ${
              checked ? "bg-zinc-800" : "bg-orange-300"
            }`}
          >
            <Text className={`font-extrabold text-base ${checked ? "text-zinc-300" : "text-black"}`}>
              {checked ? "Checked · undo" : "Looks right"}
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* (over this sheet: a modal opened from inside it) */}
      <EditPlaceSheet
        place={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          onEdited?.(saved.venueId);
        }}
      />
    </Modal>
  );
}

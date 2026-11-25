// components/places/EditPlaceSheet.tsx
// Edit a place you added (#6): its name, how to get there, and its hours.
// Only while it's private: no published idea there, yours included (the
// database checks: update_my_place). Once it's public, changes go through
// suggestions, its owner or a moderator (#10, #73).
//
// Admins also edit the app's own places here (`listed`: places nobody added,
// like the launch import's): their address and pin too, logged
// (admin_update_place).

import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRevealAboveKeyboard } from "@/hooks/useRevealAboveKeyboard";

import MapView from "react-native-maps";
import Ionicons from "@expo/vector-icons/Ionicons";

import { adminUpdatePlace, updateMyPlace } from "@/src/lib/places";
import MovePinSheet from "./MovePinSheet";
import PlaceMarker from "./PlaceMarker";
import type { LatLng } from "@/utils/timeline";
import HoursEditor, {
  type HoursChoice,
  choiceFromHours,
  hoursFromChoice,
} from "./HoursEditor";
import { showError } from "@/src/lib/notify";
import Overlays from "@/components/sheets/Overlays";

const NOTE_MAX = 300;
/** Font size only (a line height pushes one-line text off centre on iOS) */
const INPUT_TEXT = { fontSize: 16 };

export type EditablePlace = {
  venueId: string;
  name: string;
  accessNote: string | null;
  openingHours: string | null;
  /** One of the app's own places, edited by an admin: its address and pin too */
  listed?: { address: string | null; latitude: number; longitude: number };
};

export default function EditPlaceSheet({
  place,
  onClose,
  onSaved,
}: {
  /** The place to edit (null: closed) */
  place: EditablePlace | null;
  onClose: () => void;
  onSaved: (place: EditablePlace & { hoursCheckedAt: string | null }) => void;
}) {
  return (
    <Modal
      visible={!!place}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {/* (keyed, so it starts from the place's saved values each time) */}
      {place && (
        <EditPlaceForm
          key={place.venueId}
          place={place}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}

      {/* Pop-ups and toasts over this sheet (#86) */}
      <Overlays />
    </Modal>
  );
}

function EditPlaceForm({
  place,
  onClose,
  onSaved,
}: {
  place: EditablePlace;
  onClose: () => void;
  onSaved: (place: EditablePlace & { hoursCheckedAt: string | null }) => void;
}) {
  const insets = useSafeAreaInsets();
  // Inputs low on the page scroll up above the keyboard (and a growing
  // "How to get there" keeps its last line above it)
  const { scrollRef, onScroll, reveal } = useRevealAboveKeyboard();
  const addressRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const noteRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const noteFocused = useRef(false);
  const [name, setName] = useState(place.name);
  const [note, setNote] = useState(place.accessNote ?? "");
  const [hours, setHours] = useState<HoursChoice>(() =>
    choiceFromHours(place.openingHours),
  );
  const [saving, setSaving] = useState(false);
  // (admins, the app's own places)
  const listed = place.listed;
  const [address, setAddress] = useState(listed?.address ?? "");
  const [spot, setSpot] = useState<LatLng | null>(
    listed ? { latitude: listed.latitude, longitude: listed.longitude } : null,
  );
  const [movingPin, setMovingPin] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      showError("Name the place", "What do people call it?");
      return;
    }
    setSaving(true);
    try {
      const openingHours = hoursFromChoice(hours);
      if (listed && spot) {
        await adminUpdatePlace(place.venueId, {
          name,
          address,
          accessNote: note,
          openingHours,
          ...spot,
        });
      } else {
        await updateMyPlace(place.venueId, {
          name,
          accessNote: note,
          openingHours,
        });
      }
      if (process.env.EXPO_OS === "ios")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved({
        venueId: place.venueId,
        name: name.trim(),
        accessNote: note.trim() || null,
        openingHours,
        hoursCheckedAt: openingHours ? new Date().toISOString() : null,
        ...(listed && spot
          ? { listed: { address: address.trim() || null, ...spot } }
          : {}),
      });
    } catch (e) {
      setSaving(false);
      showError("Couldn't save the place", e);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-black"
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
    >
      {/* Cancel · Edit place · Save */}
      <View
        className="flex-row items-center justify-between px-5 pb-3 border-b border-zinc-900"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Pressable
          onPress={onClose}
          hitSlop={10}
          disabled={saving}
          accessibilityRole="button"
          className="w-16"
        >
          <Text className="text-zinc-400 font-semibold text-base">Cancel</Text>
        </Pressable>
        <Text className="text-white font-bold text-base">Edit place</Text>
        <Pressable
          onPress={save}
          hitSlop={10}
          disabled={saving}
          accessibilityRole="button"
          className="w-16 items-end"
        >
          {saving ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-blue-400 font-bold text-base">Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerClassName="px-5 pt-5 gap-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        <Text className="text-zinc-500 text-sm">
          {listed
            ? "One of the app's own places. Changes show for everyone right away, and each one is logged."
            : "You added this place and it's still private, so you can change it. Once an idea here is published, the place is public, and changes are suggested and checked first."}
        </Text>

        <View className="gap-2">
          <Text className="text-zinc-400 text-sm font-bold ml-1">NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={80}
            placeholder="e.g. Hidden Falls trailhead"
            placeholderTextColor="#71717a"
            className="h-14 px-4 text-white bg-zinc-900 border border-zinc-800 rounded-2xl"
            style={{ fontSize: 17 }}
          />
        </View>

        {listed && spot ? (
          <>
            <View className="gap-2">
              <Text className="text-zinc-400 text-sm font-bold ml-1">
                ADDRESS
              </Text>
              <TextInput
                ref={addressRef}
                onFocus={() => reveal(addressRef.current)}
                value={address}
                onChangeText={setAddress}
                maxLength={200}
                placeholder="Street address (a trailhead: the road and town)"
                placeholderTextColor="#71717a"
                className="h-14 px-4 text-white bg-zinc-900 border border-zinc-800 rounded-2xl"
                style={INPUT_TEXT}
              />
            </View>

            <View className="gap-2">
              <Text className="text-zinc-400 text-sm font-bold ml-1">PIN</Text>
              <View className="h-40 rounded-2xl overflow-hidden border border-zinc-800">
                {/* (keyed: a moved pin re-centres it) */}
                <MapView
                  key={`${spot.latitude},${spot.longitude}`}
                  style={{ flex: 1 }}
                  initialRegion={{
                    ...spot,
                    latitudeDelta: 0.004,
                    longitudeDelta: 0.004,
                  }}
                  userInterfaceStyle="dark"
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  pointerEvents="none"
                >
                  <PlaceMarker coordinate={spot} />
                </MapView>
              </View>
              <Pressable
                onPress={() => setMovingPin(true)}
                accessibilityRole="button"
                className="self-start flex-row items-center gap-1.5 px-3.5 py-2 rounded-full bg-zinc-900 border border-zinc-800 active:opacity-70"
              >
                <Ionicons name="move-outline" size={15} color="#d4d4d8" />
                <Text className="text-zinc-200 text-sm font-semibold">
                  Move pin
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}

        <View className="gap-2">
          <View className="flex-row items-baseline justify-between mx-1">
            <Text className="text-zinc-400 text-sm font-bold">
              HOW TO GET THERE
            </Text>
            <Text className="text-zinc-600 text-xs">
              Optional · {NOTE_MAX - note.length} left
            </Text>
          </View>
          <TextInput
            ref={noteRef}
            onFocus={() => {
              noteFocused.current = true;
              reveal(noteRef.current);
            }}
            onBlur={() => (noteFocused.current = false)}
            onContentSizeChange={() =>
              noteFocused.current && reveal(noteRef.current)
            }
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={NOTE_MAX}
            textAlignVertical="top"
            placeholder="e.g. Park at the dirt pullout. The trail starts behind the green gate."
            placeholderTextColor="#71717a"
            className="min-h-28 px-4 pt-3.5 pb-3.5 text-white bg-zinc-900 border border-zinc-800 rounded-2xl"
            style={INPUT_TEXT}
          />
        </View>

        <View className="gap-2">
          <View className="flex-row items-baseline justify-between mx-1">
            <Text className="text-zinc-400 text-sm font-bold">HOURS</Text>
            <Text className="text-zinc-600 text-xs">Optional</Text>
          </View>
          <HoursEditor value={hours} onChange={setHours} />
        </View>
      </ScrollView>

      <MovePinSheet
        pin={movingPin ? spot : null}
        onClose={() => setMovingPin(false)}
        onMoved={(next) => {
          setSpot(next);
          setMovingPin(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

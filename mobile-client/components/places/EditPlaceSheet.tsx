// components/places/EditPlaceSheet.tsx
// Edit a place you added (#6): its name, how to get there, and its hours.
// Only while it's private: no published idea there, yours included (the
// database checks: update_my_place). Once it's public, changes go through
// suggestions, its owner or a moderator (#10, #73).

import React, {useState} from "react";
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
import {useSafeAreaInsets} from "react-native-safe-area-context";

import {updateMyPlace} from "@/src/lib/places";
import HoursEditor, {type HoursChoice, choiceFromHours, hoursFromChoice} from "./HoursEditor";
import {showError} from "@/src/lib/notify";
import Overlays from "@/components/sheets/Overlays";

const NOTE_MAX = 300;
/** Font size only (a line height pushes one-line text off centre on iOS) */
const INPUT_TEXT = {fontSize: 16};

export type EditablePlace = {
  venueId: string;
  name: string;
  accessNote: string | null;
  openingHours: string | null;
};

export default function EditPlaceSheet({
  place,
  onClose,
  onSaved,
}: {
  /** The place to edit (null: closed) */
  place: EditablePlace | null;
  onClose: () => void;
  onSaved: (place: EditablePlace & {hoursCheckedAt: string | null}) => void;
}) {
  return (
    <Modal visible={!!place} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {/* (keyed, so it starts from the place's saved values each time) */}
      {place && <EditPlaceForm key={place.venueId} place={place} onClose={onClose} onSaved={onSaved} />}

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
  onSaved: (place: EditablePlace & {hoursCheckedAt: string | null}) => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(place.name);
  const [note, setNote] = useState(place.accessNote ?? "");
  const [hours, setHours] = useState<HoursChoice>(() => choiceFromHours(place.openingHours));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      showError("Name the place", "What do people call it?");
      return;
    }
    setSaving(true);
    try {
      const openingHours = hoursFromChoice(hours);
      await updateMyPlace(place.venueId, {name, accessNote: note, openingHours});
      if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved({
        venueId: place.venueId,
        name: name.trim(),
        accessNote: note.trim() || null,
        openingHours,
        hoursCheckedAt: openingHours ? new Date().toISOString() : null,
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
        style={{paddingTop: insets.top + 10}}
      >
        <Pressable onPress={onClose} hitSlop={10} disabled={saving} accessibilityRole="button" className="w-16">
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerClassName="px-5 pt-5 gap-6"
        contentContainerStyle={{paddingBottom: insets.bottom + 32}}
      >
        <Text className="text-zinc-500 text-sm">
          You added this place and it&apos;s still private, so you can change it. Once an idea here is published,
          the place is public, and changes are suggested and checked first.
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
            style={{fontSize: 17}}
          />
        </View>

        <View className="gap-2">
          <View className="flex-row items-baseline justify-between mx-1">
            <Text className="text-zinc-400 text-sm font-bold">HOW TO GET THERE</Text>
            <Text className="text-zinc-600 text-xs">Optional · {NOTE_MAX - note.length} left</Text>
          </View>
          <TextInput
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
    </KeyboardAvoidingView>
  );
}

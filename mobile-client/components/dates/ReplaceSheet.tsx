// components/dates/ReplaceSheet.tsx
// Replace a stop on a saved date (#36): alternatives found and ranked the
// builder's way with the date's own prefs (src/lib/editDate.ts). What fits
// the time and budget comes first; the rest say why they don't.

import React, {useEffect, useState} from "react";
import {ActivityIndicator, Modal, Pressable, ScrollView, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";

import {fetchReplacements} from "@/src/lib/editDate";
import {ideaImage, ideaDuration, ideaPrice} from "@/src/lib/ideas";
import type {Itinerary} from "@/types/dates";
import type {Replacement} from "@/utils/editDate";

const FIT_NOTE: Record<Exclude<Replacement["fit"], "FITS">, string> = {
  TOO_LONG: "Too long for the time you have",
  OVER_BUDGET: "Over your budget",
  CLOSED: "Closed then",
};

export default function ReplaceSheet({
  itinerary,
  index,
  onClose,
  onPick,
}: {
  itinerary: Itinerary;
  /** The stop being replaced (null: closed) */
  index: number | null;
  onClose: () => void;
  onPick: (replacement: Replacement) => void;
}) {
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<Replacement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  // Fetch for the stop that opened it (once per open)
  useEffect(() => {
    if (index == null) return;
    let active = true;
    fetchReplacements(itinerary, index)
      .then((list) => {
        if (!active) return;
        setOptions(list);
        setError(null);
        setLoadedFor(index);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't find alternatives.");
      });
    return () => {
      active = false;
    };
  }, [itinerary, index]);

  const current = index != null ? itinerary.stops.filter((s) => s.activity)[index]?.activity : null;
  const ready = options !== null && loadedFor === index;
  const fits = ready ? options!.filter((o) => o.fit === "FITS") : [];
  const others = ready ? options!.filter((o) => o.fit !== "FITS").slice(0, 15) : [];

  return (
    <Modal visible={index != null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-zinc-950">
        <View className="flex-row items-center px-5 pt-5 pb-3 border-b border-zinc-900">
          <View className="flex-1 items-start">
            <Pressable onPress={onClose} hitSlop={10}>
              <Text className="text-zinc-400 font-semibold text-base">Cancel</Text>
            </Pressable>
          </View>
          <Text className="text-white font-bold text-base" numberOfLines={1}>
            Replace
          </Text>
          <View className="flex-1" />
        </View>

        <ScrollView contentContainerClassName="px-5 pt-5 gap-6" contentContainerStyle={{paddingBottom: insets.bottom + 32}}>
          {current && (
            <Text className="text-zinc-400 text-sm">
              Instead of <Text className="text-white font-semibold">{current.title}</Text>, using your plan&apos;s
              budget, time and vibes.
            </Text>
          )}

          {error ? (
            <Text className="text-zinc-400 text-center py-10">{error}</Text>
          ) : !ready ? (
            <ActivityIndicator color="white" style={{marginTop: 40}} />
          ) : options!.length === 0 ? (
            <Text className="text-zinc-400 text-center py-10">
              Nothing else fits this spot right now. Try removing it instead.
            </Text>
          ) : (
            <>
              {fits.length > 0 && (
                <Group title="Fits your plan">
                  {fits.map((o) => (
                    <Option key={o.idea_id} option={o} onPress={() => onPick(o)} />
                  ))}
                </Group>
              )}
              {others.length > 0 && (
                <Group title={fits.length ? "Other options" : "Nothing fits perfectly"}>
                  {others.map((o) => (
                    <Option key={o.idea_id} option={o} onPress={() => onPick(o)} />
                  ))}
                </Group>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Group({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View className="gap-2">
      <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-1">{title}</Text>
      <View className="gap-2">{children}</View>
    </View>
  );
}

function Option({option, onPress}: {option: Replacement; onPress: () => void}) {
  const note = option.fit !== "FITS" ? FIT_NOTE[option.fit] : option.problem?.message ?? null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 active:opacity-80"
      style={{opacity: option.fit === "FITS" ? 1 : 0.75}}
    >
      <Image source={{uri: ideaImage(option as any)}} style={{width: 52, height: 52, borderRadius: 12}} contentFit="cover" />
      <View className="flex-1 gap-0.5">
        <Text className="text-white font-bold text-base" numberOfLines={1}>
          {option.title}
        </Text>
        <Text className="text-zinc-400 text-sm" numberOfLines={1}>
          {ideaPrice(option as any)} · {ideaDuration(option as any)}
          {(option as any).venues?.name ? ` · ${(option as any).venues.name}` : ""}
        </Text>
        {note && (
          <View className="flex-row items-center gap-1">
            <Ionicons name="alert-circle-outline" size={12} color="#fbbf24" />
            <Text className="text-amber-300 text-xs flex-1" numberOfLines={1}>
              {note}
            </Text>
          </View>
        )}
      </View>
      <Ionicons name="swap-horizontal" size={18} color="#71717a" />
    </Pressable>
  );
}

// app/itinerary/[id].tsx
// A saved date: its stops, plus start / end / rename / delete.

import React, {useState} from "react";
import {IMAGE_SIZE, sizedImage} from "@/src/lib/images";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useLocalSearchParams, router} from "expo-router";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";

import ScreenHeader from "@/components/ui/ScreenHeader";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {
  coverImage,
  formatTimeOfDay,
  formatWhen,
  stopCountLabel,
} from "@/src/lib/dates";
import type {ItineraryStatus} from "@/types/dates";

type Busy = null | "start" | "end" | "delete" | "rename";

const STATUS_BADGE: Record<
  ItineraryStatus,
  {label: string; className: string; text: string}
> = {
  PLANNED: {
    label: "Planned",
    className: "bg-blue-500/15 border-blue-500/40",
    text: "text-blue-300",
  },
  ACTIVE: {
    label: "Happening now",
    className: "bg-[#FF9D0A]/15 border-[#FF9D0A]/40",
    text: "text-[#FF9D0A]",
  },
  COMPLETED: {
    label: "Finished",
    className: "bg-zinc-800 border-zinc-700",
    text: "text-zinc-300",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-zinc-800 border-zinc-700",
    text: "text-zinc-400",
  },
};

const screenStyle = {flex: 1, backgroundColor: "#000"} as const;

export default function ItineraryDetailScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  const itineraryId = Number(id);

  const itinerary = useItineraryStore((s) =>
    s.itineraries.find((i) => i.itinerary_id === itineraryId),
  );
  const loadStatus = useItineraryStore((s) => s.status);
  const startDate = useItineraryStore((s) => s.startDate);
  const completeDate = useItineraryStore((s) => s.completeDate);
  const rename = useItineraryStore((s) => s.rename);
  const remove = useItineraryStore((s) => s.remove);

  const [busy, setBusy] = useState<Busy>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  if (!itinerary) {
    return (
      <SafeAreaView edges={["top"]} style={screenStyle}>
        <ScreenHeader title="Date" />
        <View className="flex-1 items-center justify-center px-8">
          {loadStatus === "loading" ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-zinc-400 text-center">
              {"This date isn't available anymore."}
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const run = async (kind: Busy, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (e) {
      Alert.alert(
        "Something went wrong",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const onStart = () =>
    run("start", async () => {
      await startDate(itineraryId);
      router.push("/active-date");
    });

  const onEnd = () =>
    Alert.alert("End this date?", "It moves to your Past Dates.", [
      {text: "Cancel", style: "cancel"},
      {
        text: "End date",
        style: "destructive",
        onPress: () => run("end", () => completeDate(itineraryId)),
      },
    ]);

  const onDelete = () =>
    Alert.alert(
      "Delete this date?",
      "It will be removed from your dates. This can't be undone.",
      [
        {text: "Cancel", style: "cancel"},
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            run("delete", async () => {
              await remove(itineraryId);
              router.back();
            }),
        },
      ],
    );

  const saveTitle = () =>
    run("rename", async () => {
      await rename(itineraryId, titleDraft);
      setEditingTitle(false);
    });

  const badge = STATUS_BADGE[itinerary.status];

  return (
    <SafeAreaView edges={["top"]} style={screenStyle}>
      <ScreenHeader title="Date" />
      <ScrollView
        contentContainerClassName="px-5 pt-2 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        {/* --- HERO --- */}
        <View className="h-44 rounded-3xl overflow-hidden border border-zinc-800 mb-5">
          <Image
            source={{uri: coverImage(itinerary)}}
            style={{width: "100%", height: "100%"}}
            contentFit="cover"
          />
          <View className="absolute inset-0 bg-black/30" />
          <View
            className={`absolute top-4 left-4 px-3 py-1.5 rounded-full border ${badge.className}`}
          >
            <Text className={`font-bold text-xs ${badge.text}`}>
              {badge.label}
            </Text>
          </View>
        </View>

        {/* --- TITLE --- */}
        {editingTitle ? (
          <View className="flex-row items-center gap-2 mb-1">
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              autoFocus
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={saveTitle}
              className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-2xl border border-zinc-700 font-bold"
              // fontSize in style: Tailwind text sizes clip iOS TextInput text
              style={{fontSize: 20}}
            />
            <Pressable
              onPress={saveTitle}
              disabled={busy === "rename"}
              className="bg-white rounded-xl px-4 py-3 active:opacity-80"
            >
              {busy === "rename" ? (
                <ActivityIndicator color="black" />
              ) : (
                <Text className="text-black font-bold">Save</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setTitleDraft(itinerary.title);
              setEditingTitle(true);
            }}
            accessibilityLabel="Rename date"
            className="flex-row items-center gap-2 mb-1"
          >
            <Text className="text-white font-extrabold text-2xl tracking-tight flex-shrink">
              {itinerary.title}
            </Text>
            <Ionicons name="pencil" size={16} color="#71717a" />
          </Pressable>
        )}
        <Text className="text-zinc-400 text-base">
          {formatWhen(itinerary.starts_at)} • {stopCountLabel(itinerary)}
        </Text>

        {/* --- STOPS --- */}
        <View className="mt-6 gap-3">
          {itinerary.stops.map((stop, index) => (
            <View
              key={stop.stop_id}
              className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-3"
            >
              <View className="w-8 h-8 rounded-full bg-zinc-800 items-center justify-center mr-3">
                <Text className="text-white font-bold">{index + 1}</Text>
              </View>
              {stop.activity?.image_urls?.[0] ? (
                <Image
                  source={{uri: sizedImage(stop.activity.image_urls[0], 52)}}
                  style={{width: 52, height: 52, borderRadius: 12, marginRight: 12}}
                  contentFit="cover"
                />
              ) : null}
              <View className="flex-1">
                {stop.activity ? (
                  <>
                    <Text className="text-white font-bold text-base" numberOfLines={1}>
                      {stop.activity.title}
                    </Text>
                    <Text className="text-zinc-400 text-sm" numberOfLines={1}>
                      {[
                        stop.starts_at && stop.ends_at
                          ? `${formatTimeOfDay(stop.starts_at)} – ${formatTimeOfDay(stop.ends_at)}`
                          : null,
                        stop.activity.venues?.name,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </Text>
                  </>
                ) : (
                  <Text className="text-zinc-500 italic">
                    This stop is no longer available
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* --- ACTIONS --- */}
        <View className="mt-8 gap-3">
          {itinerary.status === "PLANNED" && (
            <Pressable
              onPress={onStart}
              disabled={busy !== null}
              className="bg-white rounded-2xl h-14 items-center justify-center active:opacity-80"
            >
              {busy === "start" ? (
                <ActivityIndicator color="black" />
              ) : (
                <Text className="text-black font-extrabold text-base">
                  Start now
                </Text>
              )}
            </Pressable>
          )}

          {itinerary.status === "ACTIVE" && (
            <>
              <Pressable
                onPress={() => router.push("/active-date")}
                className="bg-white rounded-2xl h-14 items-center justify-center active:opacity-80"
              >
                <Text className="text-black font-extrabold text-base">
                  Open live view
                </Text>
              </Pressable>
              <Pressable
                onPress={onEnd}
                disabled={busy !== null}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl h-14 items-center justify-center active:bg-zinc-800"
              >
                {busy === "end" ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base">
                    End date
                  </Text>
                )}
              </Pressable>
            </>
          )}

          <Pressable
            onPress={onDelete}
            disabled={busy !== null}
            className="h-12 items-center justify-center"
          >
            {busy === "delete" ? (
              <ActivityIndicator color="#f87171" />
            ) : (
              <Text className="text-red-400 font-semibold">Delete date</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

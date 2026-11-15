// app/active-date/index.tsx
// The live date: a full-screen map with a sheet on top (like Apple Maps).
//
//   Now card ... the stop that matters right now, with one main button that
//                follows the moment: Get directions -> I'm here -> Done
//   Timeline ... every stop and travel leg; finished stops get a check
//   Wrap up .... a short recap, then the date moves to Past Dates
//
// The clock moves the date along on its own (a stop is "done" once its time
// is up), and "I'm here" / "Done" let you run ahead of the schedule.
// Stay-in dates (no places to map) show the current stop's photo instead.

import React, {useEffect, useRef, useState} from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  Platform,
  Alert,
  Animated,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import MapView, {Marker, Polyline} from "react-native-maps";
import {Image} from "expo-image";
import {LinearGradient} from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import {router} from "expo-router";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {GestureDetector, usePanGesture} from "react-native-gesture-handler";

import type {TimeSlot} from "@/types/itinerary";
import {useActiveDateStore} from "@/src/store/activeDateStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import GlassSurface from "@/components/ui/GlassSurface";
import {
  Connector,
  MarkerLabel,
  MarkerNode,
  StopNode,
  TimelineRow,
  activityImage,
  formatMinutes,
} from "@/components/builder/BuilderParts";

const BLUE = "#3b82f6";
const GREEN = "#22c55e";

const clockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});

/** "1h 23m", or "12:04" in the last hour (it ticks every second then). */
function countdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Re-renders on an interval, so "now" stays current while you look at it. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function openDirections(lat: number, lng: number) {
  const url = Platform.select({
    ios: `maps://app?daddr=${lat},${lng}&dirflg=d`,
    android: `google.navigation:q=${lat},${lng}`,
  });
  if (url) Linking.openURL(url).catch((err) => console.error("Failed to open maps:", err));
}

const hasCoords = (a: any): a is {latitude: number; longitude: number} =>
  !!a && typeof a.latitude === "number" && typeof a.longitude === "number";

export default function ActiveDateScreen() {
  const insets = useSafeAreaInsets();
  const {height: screenHeight} = useWindowDimensions();

  const timeline = useActiveDateStore((s) => s.timeline);
  const userPrefs = useActiveDateStore((s) => s.userPrefs);
  const itineraryId = useActiveDateStore((s) => s.itineraryId);
  const arrivedIds = useActiveDateStore((s) => s.arrivedIds);
  const doneIds = useActiveDateStore((s) => s.doneIds);
  const markArrived = useActiveDateStore((s) => s.markArrived);
  const markDone = useActiveDateStore((s) => s.markDone);
  const endActiveDate = useActiveDateStore((s) => s.endActiveDate);
  const completeDate = useItineraryStore((s) => s.completeDate);

  const [wrapping, setWrapping] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // ─── Where the date stands ───────────────────────────────────────────────
  const slots: TimeSlot[] = (timeline ?? []).filter((s: TimeSlot) => s.type !== "AVAILABLE");
  const stops = slots.filter((s) => s.activity);
  const dateStart = slots[0]?.startTime ?? 0;

  // Tick every second in the last hour before the start (the countdown
  // shows seconds then), otherwise every 15 seconds
  const [tickMs, setTickMs] = useState(15_000);
  const now = useNow(tickMs);
  const wantTick = dateStart - now > 0 && dateStart - now < 3_600_000 ? 1000 : 15_000;
  if (wantTick !== tickMs) setTickMs(wantTick);

  const idOf = (s: TimeSlot) => s.activity?.idea_id as number;
  const isDone = (s: TimeSlot) => doneIds.includes(idOf(s)) || now >= s.endTime;
  const isArrived = (s: TimeSlot) => arrivedIds.includes(idOf(s)) || now >= s.startTime;

  const focusIndex = stops.findIndex((s) => !isDone(s));
  const focus = focusIndex === -1 ? null : stops[focusIndex];
  const allDone = stops.length > 0 && !focus;
  const arrived = focus ? isArrived(focus) : false;
  const notStarted = !!focus && focusIndex === 0 && !arrived && now < dateStart;

  const goingOut = userPrefs?.modality === "GO_OUT";
  const headCount = Number(userPrefs?.headCount) || 1;
  const locations = stops.map((s) => s.activity as any).filter(hasCoords);
  const showMap = goingOut && locations.length > 0;

  // ─── Map ─────────────────────────────────────────────────────────────────
  const mapRef = useRef<MapView>(null);
  const sheetTop = insets.top + 56; // the sheet's highest point
  const collapsedTop = Math.round(screenHeight * 0.5);
  const focusId = focus ? idOf(focus) : null;

  useEffect(() => {
    const target = stops.find((s) => idOf(s) === focusId)?.activity;
    if (!hasCoords(target) || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: target.latitude,
        longitude: target.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      800,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const recenter = () =>
    mapRef.current?.fitToCoordinates(locations, {
      edgePadding: {top: 80, right: 60, bottom: 60, left: 60},
      animated: true,
    });

  // ─── The sheet: drag the top part between half and full height ──────────
  const range = collapsedTop - sheetTop;
  const [sheetY] = useState(() => new Animated.Value(range));
  const sheetPos = useRef(range);
  const dragStart = useRef(0);
  const [expanded, setExpanded] = useState(false);

  const snapSheet = (toExpanded: boolean) => {
    const to = toExpanded ? 0 : range;
    sheetPos.current = to;
    setExpanded(toExpanded);
    Animated.spring(sheetY, {toValue: to, useNativeDriver: true, bounciness: 2}).start();
  };

  const sheetPan = usePanGesture({
    runOnJS: true,
    activeOffsetY: [-8, 8],
    onActivate: () => {
      dragStart.current = sheetPos.current;
    },
    onUpdate: (e) => {
      const y = Math.max(0, Math.min(range, dragStart.current + e.translationY));
      sheetPos.current = y;
      sheetY.setValue(y);
    },
    onDeactivate: (e) => {
      const flungUp = e.velocityY < -500;
      const flungDown = e.velocityY > 500;
      snapSheet(flungUp || (!flungDown && sheetPos.current < range / 2));
    },
  });

  // ─── Leaving ─────────────────────────────────────────────────────────────
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const finishDate = async () => {
    setFinishing(true);
    try {
      if (itineraryId != null) {
        // Marks it COMPLETED (Past Dates) and clears this live view
        await completeDate(itineraryId);
      } else {
        endActiveDate();
      }
      router.replace("/");
    } catch (e) {
      setFinishing(false);
      Alert.alert(
        "Couldn't finish your date",
        e instanceof Error ? e.message : "Please try again.",
      );
    }
  };

  const tap = () => {
    if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!timeline || !userPrefs || stops.length === 0) {
    return (
      <View style={[styles.fill, {alignItems: "center", justifyContent: "center", gap: 16}]}>
        <Text className="text-zinc-400">No date in progress.</Text>
        <Pressable onPress={close} className="bg-zinc-800 px-5 py-2.5 rounded-full">
          <Text className="text-white font-bold">Close</Text>
        </Pressable>
      </View>
    );
  }

  // ─── Now card ────────────────────────────────────────────────────────────
  const shown = focus ?? stops[stops.length - 1];
  const shownActivity = shown.activity!;
  const stopLabel = `${(focus ? focusIndex : stops.length - 1) + 1} of ${stops.length}`;
  const spent = stops
    .filter((s) => isArrived(s))
    .reduce((sum, s) => sum + (Number(s.activity?.est_price_per_person) || 0) * headCount, 0);
  const isLast = focusIndex === stops.length - 1;

  let eyebrow: string;
  let eyebrowColor = "#a1a1aa";
  let detail: string;
  let progress: number | null = null;
  if (allDone) {
    eyebrow = "That's a wrap";
    eyebrowColor = GREEN;
    detail = `${stops.length} ${stops.length === 1 ? "stop" : "stops"} · $${spent}`;
  } else if (notStarted) {
    eyebrow = `Starts in ${countdown(dateStart - now)}`;
    eyebrowColor = BLUE;
    detail = `First stop at ${clockTime(focus!.startTime)}`;
  } else if (!arrived) {
    eyebrow = `Up next · ${stopLabel}`;
    detail =
      focus!.startTime > now
        ? `Starts at ${clockTime(focus!.startTime)} · in ${formatMinutes((focus!.startTime - now) / 60_000)}`
        : `Was due at ${clockTime(focus!.startTime)}`;
  } else {
    eyebrow = `Now · ${stopLabel}`;
    eyebrowColor = BLUE;
    const left = focus!.endTime - now;
    detail =
      left > 0
        ? `Ends in ${formatMinutes(left / 60_000)} · ${clockTime(focus!.endTime)}`
        : `Running ${formatMinutes(-left / 60_000)} over`;
    const length = focus!.endTime - focus!.startTime;
    progress = length > 0 ? Math.min(1, Math.max(0, (now - focus!.startTime) / length)) : null;
  }

  // One main button that follows the moment
  let primary: {label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void};
  let secondary: {label: string; onPress: () => void} | null = null;
  if (allDone) {
    primary = {label: "Wrap up", icon: "sparkles", onPress: () => setWrapping(true)};
  } else if (!arrived) {
    const here = () => {
      tap();
      markArrived(idOf(focus!));
    };
    if (goingOut && hasCoords(focus!.activity)) {
      const a = focus!.activity;
      primary = {
        label: "Get directions",
        icon: "navigate",
        onPress: () => openDirections(a.latitude, a.longitude),
      };
      secondary = {label: "I'm here", onPress: here};
    } else {
      primary = {label: notStarted ? "Start early" : "Start", icon: "play", onPress: here};
    }
  } else {
    primary = isLast
      ? {
          label: "Finish date",
          icon: "flag",
          onPress: () => {
            tap();
            markDone(idOf(focus!));
            setWrapping(true);
          },
        }
      : {
          label: "Done · next stop",
          icon: "checkmark",
          onPress: () => {
            tap();
            markDone(idOf(focus!));
          },
        };
  }

  const nowCard = (
    <View className="px-5 pt-1 pb-4 gap-4">
      <Pressable
        onPress={() => router.push({pathname: "/idea/[id]", params: {id: String(shownActivity.idea_id)}})}
        accessibilityRole="button"
        accessibilityHint="Opens the idea's details"
        className="flex-row items-center gap-3.5 active:opacity-80"
      >
        <Image
          source={{uri: activityImage(shownActivity)}}
          style={{width: 76, height: 76, borderRadius: 18}}
          contentFit="cover"
        />
        <View className="flex-1">
          <Text
            className="text-[11px] font-extrabold uppercase tracking-widest mb-1"
            style={{color: eyebrowColor}}
          >
            {eyebrow}
          </Text>
          <Text className="text-white font-extrabold text-xl" numberOfLines={2}>
            {allDone ? "Nice date!" : shownActivity.title}
          </Text>
          <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </Pressable>

      {progress !== null && (
        <View className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <View
            style={{width: `${Math.round(progress * 100)}%`, height: "100%", backgroundColor: BLUE}}
          />
        </View>
      )}

      <View className="flex-row gap-2.5">
        <Pressable
          onPress={primary.onPress}
          accessibilityRole="button"
          className="flex-1 h-14 bg-white rounded-full flex-row items-center justify-center gap-2 active:opacity-80"
        >
          <Ionicons name={primary.icon} size={18} color="black" />
          <Text className="text-black font-extrabold text-base">{primary.label}</Text>
        </Pressable>
        {secondary && (
          <Pressable
            onPress={secondary.onPress}
            accessibilityRole="button"
            className="h-14 px-5 bg-zinc-800 rounded-full items-center justify-center active:opacity-80"
          >
            <Text className="text-white font-bold text-base">{secondary.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  // ─── Timeline ────────────────────────────────────────────────────────────
  const homeCoords = userPrefs.currentLocation;
  const timelineView = (
    <View className="px-4 pt-2">
      <TimelineRow isFirst node={<MarkerNode icon={goingOut ? "home" : "play"} />}>
        <MarkerLabel label={goingOut ? "Leave" : "Start"} time={clockTime(dateStart)} />
      </TimelineRow>

      {slots.map((slot, idx) => {
        if (!slot.activity) {
          // Travel leg (or the trip home), with directions while it's ahead
          const destination =
            slot.id === "return-journey" ? homeCoords : slots[idx + 1]?.activity;
          const upcoming = slot.endTime > now;
          return (
            <TimelineRow
              key={slot.id ?? idx}
              node={
                <View style={{paddingVertical: 4}}>
                  <View className="w-2.5 h-2.5 rounded-full bg-zinc-700 border-2 border-black" />
                </View>
              }
            >
              <View className="flex-row items-center justify-between">
                <Connector slot={slot} />
                {goingOut && upcoming && hasCoords(destination) && (
                  <Pressable
                    onPress={() => openDirections(destination.latitude, destination.longitude)}
                    hitSlop={8}
                    accessibilityLabel="Directions"
                    className="flex-row items-center gap-1 active:opacity-70"
                  >
                    <Ionicons name="navigate" size={13} color="#60a5fa" />
                    <Text className="text-blue-400 text-sm font-semibold">Directions</Text>
                  </Pressable>
                )}
              </View>
            </TimelineRow>
          );
        }

        const done = isDone(slot);
        const current = focus === slot && arrived;
        const number = stops.indexOf(slot) + 1;
        return (
          <TimelineRow
            key={`stop-${idOf(slot)}`}
            node={
              done ? (
                <View
                  className="w-6 h-6 rounded-full border-2 border-black items-center justify-center"
                  style={{backgroundColor: GREEN}}
                >
                  <Ionicons name="checkmark" size={13} color="black" />
                </View>
              ) : (
                <StopNode index={number} />
              )
            }
          >
            <Pressable
              onPress={() =>
                router.push({pathname: "/idea/[id]", params: {id: String(idOf(slot))}})
              }
              className={`flex-row items-center rounded-2xl p-2.5 border active:opacity-80 ${
                current ? "bg-blue-950/60 border-blue-500/60" : "bg-zinc-900 border-zinc-800"
              }`}
              style={{opacity: done ? 0.55 : 1}}
            >
              <Image
                source={{uri: activityImage(slot.activity)}}
                style={{width: 52, height: 52, borderRadius: 12}}
                contentFit="cover"
              />
              <View className="flex-1 ml-3">
                <Text className="text-white font-bold text-base" numberOfLines={1}>
                  {slot.activity.title}
                </Text>
                <Text className="text-zinc-400 text-sm" numberOfLines={1}>
                  {clockTime(slot.startTime)} – {clockTime(slot.endTime)}
                  {(slot.activity as any).venues?.name ? ` · ${(slot.activity as any).venues.name}` : ""}
                </Text>
              </View>
              {current && (
                <View className="bg-blue-500 px-2 py-0.5 rounded-full ml-2">
                  <Text className="text-white text-[11px] font-extrabold">NOW</Text>
                </View>
              )}
            </Pressable>
          </TimelineRow>
        );
      })}

      <TimelineRow isLast node={<MarkerNode icon="flag" />}>
        <MarkerLabel label="Ends" time={clockTime(slots[slots.length - 1].endTime)} />
      </TimelineRow>

      {!allDone && (
        <Pressable
          onPress={() => setWrapping(true)}
          className="self-center mt-4 px-5 py-2.5 rounded-full active:bg-zinc-900"
        >
          <Text className="text-zinc-400 font-semibold">End date early</Text>
        </Pressable>
      )}
    </View>
  );

  // ─── Wrap up ─────────────────────────────────────────────────────────────
  if (wrapping) {
    const visited = stops.filter((s) => isArrived(s));
    const minutesOut = Math.max(0, (now - dateStart) / 60_000);
    return (
      <View style={styles.fill}>
        <Image
          source={{uri: activityImage((visited[visited.length - 1] ?? stops[0]).activity)}}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={30}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.85)", "#000"]}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 48,
            paddingBottom: insets.bottom + 32,
            paddingHorizontal: 24,
            gap: 24,
          }}
        >
          <View className="items-center gap-2">
            <View className="w-16 h-16 rounded-full bg-white/10 items-center justify-center mb-2">
              <Ionicons name="sparkles" size={30} color="white" />
            </View>
            <Text className="text-white font-extrabold text-3xl">Nice date!</Text>
            <Text className="text-zinc-400 text-base text-center">
              Here&apos;s how it went.
            </Text>
          </View>

          <View className="flex-row bg-zinc-900/80 border border-zinc-800 rounded-3xl">
            {[
              {label: "Stops", value: `${visited.length}/${stops.length}`},
              {label: "Time out", value: formatMinutes(minutesOut)},
              {label: "Spent", value: `$${spent}`},
            ].map((stat, i) => (
              <View
                key={stat.label}
                className={`flex-1 py-4 items-center ${i > 0 ? "border-l border-zinc-800" : ""}`}
              >
                <Text className="text-white font-extrabold text-xl">{stat.value}</Text>
                <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider mt-0.5">
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>

          <View className="gap-2.5">
            {stops.map((s) => {
              const went = isArrived(s);
              return (
                <View
                  key={idOf(s)}
                  className="flex-row items-center gap-3 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-2.5"
                  style={{opacity: went ? 1 : 0.5}}
                >
                  <Image
                    source={{uri: activityImage(s.activity)}}
                    style={{width: 44, height: 44, borderRadius: 10}}
                    contentFit="cover"
                  />
                  <Text className="flex-1 text-white font-semibold" numberOfLines={1}>
                    {s.activity!.title}
                  </Text>
                  <Ionicons
                    name={went ? "checkmark-circle" : "remove-circle-outline"}
                    size={20}
                    color={went ? GREEN : "#71717a"}
                  />
                </View>
              );
            })}
          </View>

          <View className="gap-3">
            <Pressable
              onPress={finishDate}
              disabled={finishing}
              className="h-14 bg-white rounded-full items-center justify-center active:opacity-80"
            >
              <Text className="text-black font-extrabold text-base">
                {finishing ? "Saving…" : "Finish & save to Past Dates"}
              </Text>
            </Pressable>
            {!allDone && (
              <Pressable
                onPress={() => setWrapping(false)}
                className="h-12 items-center justify-center active:opacity-70"
              >
                <Text className="text-zinc-400 font-semibold">Back to the date</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.fill}>
      {/* BACKGROUND: the map, or the current stop's photo for stay-in dates */}
      {showMap ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          userInterfaceStyle="dark"
          showsUserLocation
          mapPadding={{top: insets.top + 56, bottom: screenHeight - collapsedTop, left: 0, right: 0}}
          initialRegion={{
            latitude: locations[0].latitude,
            longitude: locations[0].longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {stops.map((s, i) => {
            const a: any = s.activity;
            if (!hasCoords(a)) return null;
            const done = isDone(s);
            const isFocus = s === focus;
            return (
              <Marker
                key={`pin-${idOf(s)}-${done}-${isFocus}`}
                coordinate={{latitude: a.latitude, longitude: a.longitude}}
                tracksViewChanges={false}
              >
                <View
                  className="rounded-full items-center justify-center border-2 border-white"
                  style={{
                    width: isFocus ? 34 : 26,
                    height: isFocus ? 34 : 26,
                    backgroundColor: done ? "#3f3f46" : isFocus ? BLUE : "#27272a",
                  }}
                >
                  {done ? (
                    <Ionicons name="checkmark" size={13} color="white" />
                  ) : (
                    <Text className="text-white font-extrabold text-xs">{i + 1}</Text>
                  )}
                </View>
              </Marker>
            );
          })}
          <Polyline
            coordinates={locations.map((a) => ({latitude: a.latitude, longitude: a.longitude}))}
            strokeColor={BLUE}
            strokeWidth={3}
            lineDashPattern={[6, 6]}
          />
        </MapView>
      ) : (
        <View style={[StyleSheet.absoluteFill, {height: collapsedTop + 40}]}>
          <Image
            source={{uri: activityImage(shownActivity)}}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={300}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.5)", "transparent", "rgba(0,0,0,0.9)"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      {/* TOP BUTTONS */}
      <View
        pointerEvents="box-none"
        style={{position: "absolute", top: insets.top + 4, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between"}}
      >
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="active:opacity-70">
          <GlassSurface style={styles.glassButton}>
            <Ionicons name="chevron-down" size={24} color="white" />
          </GlassSurface>
        </Pressable>
        {showMap && locations.length > 1 && (
          <Pressable
            onPress={recenter}
            accessibilityRole="button"
            accessibilityLabel="Show all stops"
            className="active:opacity-70"
          >
            <GlassSurface style={styles.glassButton}>
              <Ionicons name="scan-outline" size={20} color="white" />
            </GlassSurface>
          </Pressable>
        )}
      </View>

      {/* THE SHEET */}
      <Animated.View
        style={[
          styles.sheet,
          {top: sheetTop, height: screenHeight - sheetTop, transform: [{translateY: sheetY}]},
        ]}
      >
        <GestureDetector gesture={sheetPan}>
          <View>
            <Pressable
              onPress={() => snapSheet(!expanded)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Show less" : "Show the whole plan"}
              className="items-center pt-2.5 pb-3"
            >
              <View className="w-10 h-1.5 rounded-full bg-zinc-700" />
            </Pressable>
            {nowCard}
          </View>
        </GestureDetector>

        <View className="h-px bg-zinc-800 mx-5" />

        <ScrollView
          scrollEnabled={expanded}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{paddingTop: 12, paddingBottom: insets.bottom + 32}}
        >
          {!expanded && (
            <Pressable onPress={() => snapSheet(true)} className="self-center mb-1 active:opacity-70">
              <Text className="text-zinc-500 text-sm font-semibold">Swipe up for the whole plan</Text>
            </Pressable>
          )}
          {timelineView}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1, backgroundColor: "#000"},
  glassButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#09090b",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: -6},
    elevation: 16,
  },
});

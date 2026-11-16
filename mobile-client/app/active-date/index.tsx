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
import {IMAGE_SIZE, sizedImage} from "@/src/lib/images";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  Platform,
  Alert,
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
import {GestureDetector, useNativeGesture, usePanGesture} from "react-native-gesture-handler";
import Reanimated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {scheduleOnRN} from "react-native-worklets";

import type {TimeSlot} from "@/types/itinerary";
import {useActiveDateStore} from "@/src/store/activeDateStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import GlassSurface from "@/components/ui/GlassSurface";
import {homeOf} from "@/utils/timeline";
import RestEditor from "@/components/live/RestEditor";
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
// Settles quickly without bouncing past the snap point
const SHEET_SPRING = {damping: 30, stiffness: 300, mass: 0.9, overshootClamping: true};
const GREEN = "#22c55e";
/** "The list hasn't reached its top yet" (a pull there scrolls, not the sheet) */
const NOT_AT_TOP = -1e9;

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
  // Stops still ahead (not started): two or more can be reordered (#63)
  const aheadCount = stops.filter((s) => !isDone(s) && !isArrived(s)).length;
  const canReorder = itineraryId != null && aheadCount >= 2;

  const goingOut = userPrefs?.modality === "GO_OUT";
  const headCount = Number(userPrefs?.headCount) || 1;
  const locations = stops.map((s) => s.activity as any).filter(hasCoords);
  // Stay-in stops in a go-out date happen at home
  const homeCoords = userPrefs ? homeOf(userPrefs) : null; // same "home" as the builder
  const placeOf = (activity: any) =>
    activity?.modality === "STAY_IN" ? homeCoords : activity;
  const showMap = goingOut && locations.length > 0;

  const tap = () => {
    if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

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

  // ─── The sheet: half or full height ───────────────────────────────────────
  // Drag it anywhere: the top part (grabber + Now card) always moves it; the
  // plan below moves it too when it's half open (the plan doesn't scroll
  // then), and when it's open and scrolled to the top, pulling down lowers
  // it (like iOS sheets). Runs on the UI thread, so it stays smooth while
  // the screen re-renders.
  const range = collapsedTop - sheetTop;
  const sheetY = useSharedValue(range); // 0 = open
  const dragStart = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const topAt = useSharedValue(NOT_AT_TOP);
  // This drag on the plan has moved the sheet (not just scrolled the plan)
  const movedSheet = useSharedValue(false);
  const [expanded, setExpanded] = useState(false);
  const listRef = useAnimatedRef<Reanimated.ScrollView>();

  // Reorder the rest of the date, right here (#63): when you tapped it
  const [editingSince, setEditingSince] = useState<number | null>(null);
  const editing = editingSince != null;

  // Where each row sits in the plan ("stop-12", and "leg-12" for the travel
  // into stop 12), to keep what matters now at the top: on the way to a
  // stop, its travel; once you're there, the stop
  const [rowYs] = useState(() => new Map<string, number>());
  const [planY, setPlanY] = useState(0);
  // For the space at the end of the plan (see the list's paddingBottom)
  const [listHeight, setListHeight] = useState(0);
  const [planHeight, setPlanHeight] = useState(0);
  const [lastStopY, setLastStopY] = useState(0);
  const lastStopKey = stops.length ? `stop-${idOf(stops[stops.length - 1])}` : null;
  const focusHasLeg =
    focusId != null &&
    slots.some((slot, i) => !slot.activity && slots[i + 1]?.activity?.idea_id === focusId);
  const focusKey =
    focusId == null ? null : arrived || !focusHasLeg ? `stop-${focusId}` : `leg-${focusId}`;
  const scrollToRow = (key: string | null, animated: boolean) => {
    const y = key == null ? undefined : rowYs.get(key);
    if (y == null) return;
    listRef.current?.scrollTo({y: Math.max(0, planY + y - 8), animated});
  };

  const onSnapped = (toExpanded: boolean) => {
    setExpanded(toExpanded);
    if (!toExpanded) {
      // Lowering the sheet while reordering cancels it
      if (editingSince != null) stopEditing();
      // Half open shows what matters now
      else scrollToRow(focusKey, false);
    } else if (!expanded && editingSince == null) {
      // Opening it shows the whole plan, from the top
      listRef.current?.scrollTo({y: 0, animated: true});
    }
  };

  const snapSheet = (toExpanded: boolean) => {
    sheetY.set(withSpring(toExpanded ? 0 : range, SHEET_SPRING));
    onSnapped(toExpanded);
  };

  // Let go: snap open or half, by where it is and how fast it was moving
  const settle = (velocityY: number) => {
    "worklet";
    const flungUp = velocityY < -500;
    const flungDown = velocityY > 500;
    const toExpanded = flungUp || (!flungDown && sheetY.get() < range / 2);
    sheetY.set(withSpring(toExpanded ? 0 : range, SHEET_SPRING));
    scheduleOnRN(onSnapped, toExpanded);
  };

  // The top part: a plain drag
  const headerPan = usePanGesture({
    activeOffsetY: [-8, 8],
    onActivate: () => {
      "worklet";
      dragStart.set(sheetY.get());
    },
    onUpdate: (e) => {
      "worklet";
      sheetY.set(Math.max(0, Math.min(range, dragStart.get() + e.translationY)));
    },
    onDeactivate: (e) => {
      "worklet";
      settle(e.velocityY);
    },
  });

  // The plan: moves the sheet when it's half open, or once it's scrolled to
  // the top; otherwise it's just scrolling
  const listScroll = useNativeGesture({});
  const listPan = usePanGesture({
    activeOffsetY: [-8, 8],
    simultaneousWith: listScroll,
    onActivate: (e) => {
      "worklet";
      dragStart.set(sheetY.get());
      movedSheet.set(false);
      const halfOpen = sheetY.get() > 0.5;
      topAt.set(halfOpen || scrollY.get() <= 0.5 ? e.translationY : NOT_AT_TOP);
    },
    onUpdate: (e) => {
      "worklet";
      const open = dragStart.get() <= 0.5;
      // Open and scrolled into the plan: it's just scrolling (the sheet waits
      // for the plan to come back to its top, even mid-swipe)
      if (open && !movedSheet.get() && scrollY.get() > 0.5) {
        topAt.set(NOT_AT_TOP);
        return;
      }
      if (topAt.get() === NOT_AT_TOP) topAt.set(e.translationY);
      const y = Math.max(0, Math.min(range, dragStart.get() + e.translationY - topAt.get()));
      if (Math.abs(y - dragStart.get()) > 0.5) movedSheet.set(true);
      sheetY.set(y);
      // Pulled down from open: the plan holds still at its top meanwhile
      if (open && y > 0) scrollTo(listRef, 0, 0, false);
    },
    onDeactivate: (e) => {
      "worklet";
      topAt.set(NOT_AT_TOP);
      // Only if it moved the sheet (a plain scroll leaves it be)
      if (movedSheet.get()) settle(e.velocityY);
      movedSheet.set(false);
    },
  });
  const onListScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  // Keep the stop that matters now at the top of the plan as the date goes
  // on ("Done · next stop" moves it along)
  const scrolledFor = useRef<string | null>(null);
  // Keeps following that row while the plan re-measures (rows can shift
  // just after a tap), until you scroll the plan yourself
  const following = useRef(true);
  useEffect(() => {
    if (editing) return; // (the editor shows only the rest; no rows to chase)
    following.current = true;
    if (focusKey != null && rowYs.has(focusKey)) {
      scrolledFor.current = focusKey;
      scrollToRow(focusKey, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  // Just enough room at the end of the plan for the last stop to scroll up
  // to the top (8 points below it, like the others)
  const endSpace = Math.max(insets.bottom + 32, Math.ceil(listHeight - (planHeight - lastStopY) - 8));
  // When that room grows, a scroll that fell short can finish
  useEffect(() => {
    if (following.current && !editing) scrollToRow(focusKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endSpace]);

  const onRowLayout = (key: string, y: number) => {
    const moved = rowYs.get(key) !== y;
    rowYs.set(key, y);
    if (key === lastStopKey) setLastStopY(y);
    if (key !== focusKey) return;
    if (scrolledFor.current !== focusKey) {
      // The first time, once its row has been laid out
      scrolledFor.current = focusKey;
      scrollToRow(focusKey, false);
    } else if (moved && following.current) {
      scrollToRow(focusKey, true);
    }
  };

  const startEditing = () => {
    tap();
    // The screen's clock (ticks every few seconds; the rest of the date
    // starts on the next 5 minutes anyway)
    setEditingSince(now);
    // The editor stays at its top: don't chase the current stop meanwhile
    following.current = false;
    snapSheet(true);
    // The editor starts at the top (Fix order first)
    listRef.current?.scrollTo({y: 0, animated: false});
  };
  // Cancelled, saved, or the sheet lowered: back to the plan, at the stop
  // that matters now (its row lays out again and scrolls there)
  const stopEditing = () => {
    scrolledFor.current = null;
    following.current = true;
    setEditingSince(null);
  };

  const sheetStyle = useAnimatedStyle(() => ({transform: [{translateY: sheetY.get()}]}));

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
    if (goingOut && hasCoords(placeOf(focus!.activity))) {
      const a = placeOf(focus!.activity);
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
          {/* One line, so the card (and the plan under it) never changes height */}
          <Text className="text-white font-extrabold text-xl" numberOfLines={1}>
            {allDone ? "Nice date!" : shownActivity.title}
          </Text>
          <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </Pressable>

      {/* Its space is always kept (empty until you're at a stop), so tapping
          "I'm here" doesn't push the plan down */}
      <View
        className={`h-1.5 rounded-full overflow-hidden ${progress !== null ? "bg-zinc-800" : ""}`}
        importantForAccessibility="no-hide-descendants"
      >
        {progress !== null && (
          <View
            style={{width: `${Math.round(progress * 100)}%`, height: "100%", backgroundColor: BLUE}}
          />
        )}
      </View>

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
  // While reordering, the plan shows only the editor (the stops still ahead)

  const timelineView = (
    <View className="px-4 pt-2">
      {/* Always here (the button comes and goes), so the rows below never shift */}
      {!editing && (
        <View className="flex-row items-center justify-between px-1 mb-3 min-h-6">
          <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Your plan</Text>
          {canReorder && (
          <Pressable
            onPress={startEditing}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Reorder the rest of your date"
            className="flex-row items-center gap-1.5 active:opacity-70"
          >
            <Ionicons name="swap-vertical" size={14} color="#60a5fa" />
            <Text className="text-blue-400 text-sm font-semibold">Reorder the rest</Text>
          </Pressable>
          )}
        </View>
      )}
      {!editing && (
        <TimelineRow isFirst node={<MarkerNode icon={goingOut ? "home" : "play"} />}>
          <MarkerLabel label={goingOut ? "Leave" : "Start"} time={clockTime(dateStart)} />
        </TimelineRow>
      )}

      {(editing ? [] : slots).map((slot, idx) => {
        if (!slot.activity) {
          // Travel leg (or the trip home), with directions while it's ahead
          const destination =
            slot.id === "return-journey" ? homeCoords : placeOf(slots[idx + 1]?.activity);
          const upcoming = slot.endTime > now;
          const leadsTo = slots[idx + 1]?.activity?.idea_id;
          return (
            <View
              key={slot.id ?? idx}
              onLayout={(e) => leadsTo != null && onRowLayout(`leg-${leadsTo}`, e.nativeEvent.layout.y)}
            >
            <TimelineRow
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
            </View>
          );
        }

        const done = isDone(slot);
        const current = focus === slot && arrived;
        const number = stops.indexOf(slot) + 1;
        return (
          <View key={`stop-${idOf(slot)}`} onLayout={(e) => onRowLayout(`stop-${idOf(slot)}`, e.nativeEvent.layout.y)}>
          <TimelineRow
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
          </View>
        );
      })}

      {editing ? (
        // The rest, as draggable stop cards (Cancel / Save inside)
        <RestEditor openedAt={editingSince!} onClose={stopEditing} />
      ) : (
        <TimelineRow isLast node={<MarkerNode icon="flag" />}>
          <MarkerLabel label={goingOut ? "Ends at home" : "Ends"} time={clockTime(slots[slots.length - 1].endTime)} />
        </TimelineRow>
      )}

      {!allDone && !editing && (
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
          source={{uri: activityImage((visited[visited.length - 1] ?? stops[0]).activity, IMAGE_SIZE.card)}}
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
          mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
          showsPointsOfInterests={false}
          showsCompass={false}
          pitchEnabled={false}
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
                  className="rounded-full items-center justify-center"
                  style={{
                    width: isFocus ? 38 : done ? 22 : 28,
                    height: isFocus ? 38 : done ? 22 : 28,
                    borderWidth: isFocus ? 3 : 2,
                    borderColor: "white",
                    backgroundColor: done ? "#52525b" : isFocus ? BLUE : "#18181b",
                    shadowColor: "#000",
                    shadowOpacity: 0.45,
                    shadowRadius: 6,
                    shadowOffset: {width: 0, height: 3},
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
            strokeColor="rgba(96,165,250,0.85)"
            strokeWidth={4}
            lineCap="round"
            lineDashPattern={[1, 10]}
          />
        </MapView>
      ) : (
        <View style={[StyleSheet.absoluteFill, {height: collapsedTop + 40}]}>
          <Image
            source={{uri: activityImage(shownActivity, IMAGE_SIZE.full)}}
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
      <Reanimated.View
        style={[styles.sheet, {top: sheetTop, height: screenHeight - sheetTop}, sheetStyle]}
      >
        <GestureDetector gesture={headerPan}>
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

        {/* The plan: scrolls when the sheet's open (pull down at its top to
            lower it); half open, dragging it raises the sheet */}
        <GestureDetector gesture={listPan}>
          <View style={{flex: 1}}>
            <GestureDetector gesture={listScroll}>
              <Reanimated.ScrollView
                ref={listRef}
                onScroll={onListScroll}
                scrollEventThrottle={16}
                // You took over: stop keeping the current stop at the top
                // (until it changes)
                onScrollBeginDrag={() => {
                  following.current = false;
                }}
                scrollEnabled={expanded}
                // No rubber band at the top: pulling there lowers the sheet
                bounces={false}
                overScrollMode="never"
                showsVerticalScrollIndicator={false}
                onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
                // Just enough room at the end for the last stop to scroll up
                // to the top (8 points below it, like the others); without
                // it, the later stops could never reach the top
                contentContainerStyle={{
                  paddingTop: 12,
                  paddingBottom: endSpace,
                }}
              >
                <View
                  onLayout={(e) => {
                    setPlanY(e.nativeEvent.layout.y);
                    setPlanHeight(e.nativeEvent.layout.height);
                  }}
                >
                  {timelineView}
                </View>
              </Reanimated.ScrollView>
            </GestureDetector>
          </View>
        </GestureDetector>
      </Reanimated.View>
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

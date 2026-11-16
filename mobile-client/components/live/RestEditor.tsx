// components/live/RestEditor.tsx
// Reorder the rest of a live date, right in the live date's sheet (#63).
// Stops you've finished, and the one you're at, stay put (the live screen
// keeps drawing those); this draws the rest as the builder's draggable stop
// cards, laid out from now and from where you are (utils/replan.ts), with
// Fix order, the stop warnings and the new end time. Save updates the date
// for everyone on it.

import React, {useEffect, useMemo, useRef, useState} from "react";
import {ActivityIndicator, Alert, LayoutAnimation, Pressable, Text, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import Toast from "react-native-toast-message";
import Reanimated from "react-native-reanimated";
import {GestureDetector} from "react-native-gesture-handler";

import {useActiveDateStore} from "@/src/store/activeDateStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {placedStops} from "@/src/lib/dates";
import {
  Connector,
  MarkerLabel,
  MarkerNode,
  SmallNode,
  StopCard,
  StopNode,
  TimelineRow,
} from "@/components/builder/BuilderParts";
import DraggableStop from "@/components/builder/DraggableStop";
import SmartOrderCard from "@/components/builder/SmartOrderCard";
import {useReorderDrag} from "@/components/builder/useReorderDrag";
import {evaluatePlan, warningsByStop} from "@/utils/planEvaluator";
import {smartOrder} from "@/utils/smartOrder";
import {type DatePrefs, replanPoint, restPrefs} from "@/utils/replan";
import {type LatLng, type PlacedActivity, deriveSequentialTimeline} from "@/utils/timeline";
import type {TimeSlot} from "@/types/itinerary";

const clockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});

const sameOrder = (a: PlacedActivity[], b: PlacedActivity[]) =>
  a.length === b.length && a.every((p, i) => p === b[i]);

/** Where you are now (fresh, not the location cached at sign-in), if allowed. */
function useHere(): LatLng | null {
  const [here, setHere] = useState<LatLng | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {status} = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const position =
          (await Location.getLastKnownPositionAsync({maxAge: 2 * 60_000})) ??
          (await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.Balanced}));
        if (!cancelled && position) {
          setHere({latitude: position.coords.latitude, longitude: position.coords.longitude});
        }
      } catch (e) {
        console.warn("Couldn't get your location:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return here;
}

export default function RestEditor({
  openedAt,
  onClose,
}: {
  /** When you tapped "Reorder the rest" (the plan holds still from then) */
  openedAt: number;
  /** Cancelled, or saved */
  onClose: () => void;
}) {
  const itineraryId = useActiveDateStore((s) => s.itineraryId);
  const timeline = useActiveDateStore((s) => s.timeline);
  const livePrefs = useActiveDateStore((s) => s.userPrefs) as DatePrefs | null;
  const doneIds = useActiveDateStore((s) => s.doneIds);
  const arrivedIds = useActiveDateStore((s) => s.arrivedIds);
  const itinerary = useItineraryStore((s) =>
    s.itineraries.find((i) => i.itinerary_id === itineraryId),
  );
  const replanDate = useItineraryStore((s) => s.replanDate);
  const here = useHere();

  const all = useMemo(
    () => (itinerary ? placedStops(itinerary).map((s) => s.placed) : []),
    [itinerary],
  );
  const liveStops = useMemo(
    () => (timeline ?? []).filter((slot: TimeSlot) => slot.activity) as TimeSlot[],
    [timeline],
  );
  const point = useMemo(
    () =>
      livePrefs
        ? replanPoint({stops: liveStops, prefs: livePrefs, now: openedAt, doneIds, arrivedIds, here})
        : null,
    [liveStops, livePrefs, openedAt, doneIds, arrivedIds, here],
  );
  const kept = point?.kept ?? 0;

  const [initial] = useState(() => all.slice(kept));
  const [rest, setRest] = useState<PlacedActivity[]>(initial);
  const restRef = useRef(rest);
  useEffect(() => {
    restRef.current = rest;
  });
  const [saving, setSaving] = useState(false);

  const prefs = useMemo(
    () => (point && livePrefs ? restPrefs(livePrefs, point) : null),
    [point, livePrefs],
  );
  const restTimeline = useMemo(
    () => (prefs ? deriveSequentialTimeline(rest, prefs) : []),
    [rest, prefs],
  );
  const evaluation = useMemo(
    () => (prefs ? evaluatePlan(rest, prefs, restTimeline) : null),
    [rest, prefs, restTimeline],
  );
  const warnings = useMemo(
    () => (evaluation ? warningsByStop(evaluation) : new Map()),
    [evaluation],
  );

  // ─── Drag to reorder (the builder's) ──────────────────────────────────────
  const moveStop = (ideaId: number, toIndex: number) =>
    setRest((prev) => {
      const from = prev.findIndex((p) => p.activity.idea_id === ideaId);
      const to = Math.max(0, Math.min(prev.length - 1, toIndex));
      if (from === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  const [lifted, setLifted] = useState(false);
  const {pan, drag, layouts, ghostStyle} = useReorderDrag({
    order: () => restRef.current.map((p) => p.activity.idea_id as number),
    enabled: rest.length > 1 && !saving,
    onMove: moveStop,
    onLift: () => setLifted(true),
    onDrop: () => setLifted(false),
  });

  // ─── Smart reorder, and notes (held still while a stop is lifted) ─────────
  const smart = useMemo(
    () => (prefs && !lifted ? smartOrder(rest, prefs) : null),
    [rest, prefs, lifted],
  );
  const notes = (evaluation?.issues ?? []).filter((issue) => issue.stopId == null);
  const [frozenNotes, setFrozenNotes] = useState<typeof notes | null>(null);
  if (lifted && !frozenNotes) setFrozenNotes(notes);
  if (!lifted && frozenNotes) setFrozenNotes(null);
  const shownNotes = frozenNotes ?? notes;

  const applySmart = () => {
    if (!smart?.improved) return;
    if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRest(smart.order);
  };

  const changed = !sameOrder(rest, initial);

  const save = async () => {
    if (!point || itineraryId == null || !changed) return;
    setSaving(true);
    try {
      await replanDate(itineraryId, point, rest);
      if (process.env.EXPO_OS === "ios")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({type: "success", text1: "Updated the rest of your date", position: "bottom"});
      onClose();
    } catch (e) {
      setSaving(false);
      Alert.alert("Couldn't save the new order", e instanceof Error ? e.message : "Please try again.");
    }
  };

  if (!point || !prefs) return null;

  const goingOut = prefs.modality === "GO_OUT";
  const headCount = Number(prefs.headCount) || 1;
  const lastKept = kept > 0 ? all[kept - 1]?.activity.title : null;
  const fromLabel = point.atStop
    ? `After ${lastKept}`
    : kept === 0 && point.location == null
      ? "From the start"
      : "From where you are";
  const busyEnd = restTimeline
    .filter((slot) => slot.type === "OCCUPIED")
    .reduce((end, slot) => Math.max(end, slot.endTime), 0);
  const plannedEnd = new Date(prefs.endDate).getTime();
  const late = busyEnd > plannedEnd;

  const slots = restTimeline.filter((slot) => slot.type !== "AVAILABLE");
  const numberOf = (ideaId: number) =>
    kept + rest.findIndex((p) => p.activity.idea_id === ideaId) + 1;
  const titleOf = (id: number | null) =>
    id == null ? null : (rest.find((p) => p.activity.idea_id === id)?.activity.title ?? null);
  const dragSlot = drag ? slots.find((slot) => slot.activity?.idea_id === drag.id) : undefined;

  return (
    <View>
      {/* Cancel · what to do · Save */}
      <View className="flex-row items-center justify-between px-1 mt-2 mb-3">
        <Pressable onPress={onClose} hitSlop={10} disabled={saving} accessibilityRole="button">
          <Text className="text-zinc-400 font-semibold text-base">Cancel</Text>
        </Pressable>
        <Text className="text-zinc-500 text-sm">Hold and drag to reorder</Text>
        <Pressable
          onPress={save}
          hitSlop={10}
          disabled={!changed || saving}
          accessibilityRole="button"
          accessibilityState={{disabled: !changed || saving}}
          className={`rounded-full px-4 py-1.5 ${changed ? "bg-blue-500" : "bg-zinc-800"}`}
        >
          {saving ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className={`font-bold text-sm ${changed ? "text-white" : "text-zinc-500"}`}>Save</Text>
          )}
        </Pressable>
      </View>

      {/* (the smart card and notes have their own side margins) */}
      <View className="-mx-4">
        <SmartOrderCard result={smart} onApply={applySmart} titleOf={titleOf} />
        {shownNotes.map((note) => (
          <View
            key={note.kind}
            className="mx-5 mb-3 flex-row items-center gap-2.5 bg-orange-500/10 border border-orange-500/30 rounded-2xl px-4 py-3"
          >
            <Ionicons
              name={note.kind === "BACKTRACK" ? "git-compare-outline" : "alert-circle-outline"}
              size={18}
              color="#fb923c"
            />
            <Text className="flex-1 text-orange-200 text-sm">
              {note.message}.
              {note.kind === "PAST_END" ? " Saving moves your date's end later." : ""}
            </Text>
          </View>
        ))}
      </View>

      <GestureDetector gesture={pan}>
        <View>
          <TimelineRow node={<MarkerNode icon={point.atStop ? "flag" : "navigate"} />}>
            <MarkerLabel label={fromLabel} time={clockTime(point.startMs)} />
          </TimelineRow>

          {slots.map((slot) => {
            if (!slot.activity) {
              return (
                <TimelineRow key={slot.id} node={<SmallNode />}>
                  <Connector slot={slot} />
                </TimelineRow>
              );
            }
            const ideaId = slot.activity.idea_id as number;
            const index = rest.findIndex((p) => p.activity.idea_id === ideaId);
            return (
              <DraggableStop
                key={`stop-${ideaId}`}
                id={ideaId}
                dragging={drag?.id === ideaId}
                layouts={layouts}
              >
                <TimelineRow node={<StopNode index={numberOf(ideaId)} />}>
                  <StopCard
                    slot={slot}
                    headCount={headCount}
                    warning={warnings.get(ideaId)}
                    onMoveEarlier={index > 0 ? () => moveStop(ideaId, index - 1) : undefined}
                    onMoveLater={
                      index < rest.length - 1 ? () => moveStop(ideaId, index + 1) : undefined
                    }
                  />
                </TimelineRow>
              </DraggableStop>
            );
          })}

          <TimelineRow isLast node={<MarkerNode icon="flag" />}>
            <MarkerLabel
              label={goingOut ? "Ends at home" : "Ends"}
              time={clockTime(busyEnd)}
              late={late}
              note={late ? `planned ${clockTime(plannedEnd)}` : undefined}
            />
          </TimelineRow>

          {/* The floating copy of the stop being dragged */}
          {drag && dragSlot && (
            <Reanimated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  left: drag.x,
                  top: drag.y,
                  width: drag.width,
                  zIndex: 20,
                  shadowColor: "#000",
                  shadowOpacity: 0.55,
                  shadowRadius: 18,
                  shadowOffset: {width: 0, height: 10},
                  elevation: 14,
                },
                ghostStyle,
              ]}
            >
              <TimelineRow node={<StopNode index={numberOf(drag.id)} />}>
                <StopCard slot={dragSlot} headCount={headCount} warning={warnings.get(drag.id)} />
              </TimelineRow>
            </Reanimated.View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

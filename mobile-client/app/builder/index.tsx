import * as Haptics from "expo-haptics";
import {BuilderActivity, TimeSlot, PlanningStep} from "@/types/itinerary";
import {
  PlacedActivity,
  deriveTimeline,
  getOptimalAnchorTime,
  queryAnchors,
  queryFillers,
  analyzeTriggers,
  formatTime,
  snapTo15,
} from "@/utils/itineraryEngine";
import {useLocalSearchParams, router} from "expo-router";
import {useState, useEffect, useMemo} from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  LayoutAnimation,
  Alert,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {useActiveDateStore} from "@/store/activeDateStore";
import {Ionicons} from "@expo/vector-icons";
import {usePrefsStore} from "@/store/usePrefsStore";

export default function BuilderScreen() {
  const userPrefs = usePrefsStore((state) => state.prefs);
  const headCount = userPrefs.headCount;
  const prefsStartDate = new Date(userPrefs.startDate);
  const prefsEndDate = new Date(userPrefs.endDate);
  const simpleStartTime = prefsStartDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const simpleEndTime = prefsEndDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  // ─── Source of Truth ──────────────────────────────────────────────────────────
  //
  // `placed` is the ONLY mutable state that describes the itinerary.
  // Every other timeline value is derived from it.
  //
  // Layout rules enforced by deriveTimeline():
  //   • Anchor sits at its optimal time (anchoredAt).
  //   • Pre-fillers pack right-to-left  → one gap at the FRONT of the day.
  //   • Post-fillers pack left-to-right → one gap at the END  of the day.
  //   → At most TWO "Add Activity" buttons are visible at any time.
  //
  const [placed, setPlaced] = useState<PlacedActivity[]>([]);

  // ─── UI State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<PlanningStep>("ANCHOR");
  const [retry, setRetry] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);

  // Index in `placed` where the next filler will be spliced.
  // null  → drawer is closed
  // 0     → inserting before the anchor (pre-filler)
  // n > 0 → inserting after the nth placed activity (post-filler)
  const [activeInsertIndex, setActiveInsertIndex] = useState<number | null>(
    null,
  );

  // Duration of the gap the user tapped — used for fit-status filtering
  const [activeGapDuration, setActiveGapDuration] = useState(0);

  const [isFetchingFillers, setIsFetchingFillers] = useState(false);
  const [showDinnerModal, setShowDinnerModal] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<number | null>(
    null,
  );
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempSelectedDate, setTempSelectedDate] = useState<Date>(new Date());
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
  const [reviewingItinerary, setReviewingItinerary] = useState<Boolean>(false);

  // ─── Derived Timeline ─────────────────────────────────────────────────────────
  const timeline = useMemo(
    () => deriveTimeline(placed, userPrefs),
    [placed, userPrefs],
  );

  // ─── Derived Budget & Time ────────────────────────────────────────────────────
  const availableBudget: number = userPrefs.budget;

  const spentBudget = useMemo(
    () =>
      timeline.reduce((total, slot) => {
        if (slot.activity)
          return total + Number(slot.activity.est_price_per_person) * headCount;
        return total;
      }, 0),
    [timeline, headCount],
  );

  const remainingBudget = availableBudget - spentBudget;

  const remainingTime = useMemo(
    () =>
      timeline
        .filter((slot) => slot.type === "AVAILABLE")
        .reduce(
          (total, slot) => total + (slot.endTime - slot.startTime) / 60_000,
          0,
        ),
    [timeline],
  );

  const flexTime = useMemo(
    () =>
      timeline
        .filter((slot) => slot.type === "AVAILABLE" || slot.type === "BUFFER")
        .reduce(
          (total, slot) => total + (slot.endTime - slot.startTime) / 60_000,
          0,
        ),
    [timeline],
  );

  // ─── Activity Feed ────────────────────────────────────────────────────────────
  // Strip activities already on the timeline
  const availableActivities = useMemo(
    () =>
      activities.filter(
        (a) => !placed.some((p) => p.activity.idea_id === a.idea_id),
      ),
    [activities, placed],
  );

  // Tag each activity with whether it fits in the currently-open gap
  const sortedActivities = useMemo(() => {
    return availableActivities
      .map((activity) => {
        // 1. Get the base duration
        const activityDuration = Number(activity.est_duration_minutes) || 0;

        // 2. Calculate the specific "Travel Tax" for this exact item
        // (queryFillers already attached the exact distance from the origin!)
        let travelMins = 0;
        if (userPrefs.modality === "GO_OUT" && activity.distance > 0) {
          travelMins = snapTo15(Math.round(activity.distance * 3 + 5));
        }

        // 3. The True Cost
        const totalRequiredTime = activityDuration + travelMins;

        // 4. The Strict Gatekeeper
        const fitStatus =
          step === "ANCHOR" || totalRequiredTime <= activeGapDuration
            ? "FITS_NOW"
            : "NO_FIT";

        // We attach travelMins just in case you want to show it on the card UI later!
        return {...activity, fitStatus, travelMins};
      })
      .sort((a, b) => {
        if (a.fitStatus === b.fitStatus) return 0;
        return a.fitStatus === "FITS_NOW" ? -1 : 1;
      });
  }, [availableActivities, activeGapDuration, step, userPrefs.modality]);

  // ─── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAnchors();
  }, []);

  // Fire meal-time triggers whenever the placed list changes
  // TODO: Finish implementing triggers after finalizing itinerary builder flow
  // useEffect(() => {
  //   if (placed.length === 0) return;
  //   const lastPlaced = placed[placed.length - 1];
  //   const trigger = analyzeTriggers(
  //     timeline,
  //     String(lastPlaced.activity.idea_id),
  //   );
  //   if (trigger === "PROMPT_DINNER") setShowDinnerModal(true);
  // }, [placed]);

  // ─── Data Fetching ────────────────────────────────────────────────────────────
  const loadAnchors = async () => {
    try {
      setLoading(true);
      const result = await queryAnchors(userPrefs);
      if (result.success) {
        setActivities(result.data || []);
        setRetry(result.retried ?? false);
      } else {
        setActivities([]);
        console.error("Failed to load anchors:", result.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  /**
   * Called when the user taps an "Add Activity" button on the timeline.
   *
   * `insertAt`  — position in `placed[]` where the new activity will be spliced.
   * `gapSlot`   — the AVAILABLE TimeSlot that was tapped (for duration + origin).
   */
  const handleOpenGap = async (insertAt: number, gapSlot: TimeSlot) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveInsertIndex(insertAt);

    const gapDurationMins = Math.round(
      (gapSlot.endTime - gapSlot.startTime) / 60_000,
    );
    setActiveGapDuration(gapDurationMins);

    // Origin: the placed activity just before this gap, or home if none
    const origin = insertAt > 0 ? placed[insertAt - 1].activity : userPrefs;

    try {
      setIsFetchingFillers(true);
      const result = await queryFillers(
        userPrefs,
        gapDurationMins,
        remainingBudget,
        origin,
      );
      setActivities(result.data || []);
    } catch (error) {
      console.error("handleOpenGap fetch error:", error);
      setActivities([]);
    } finally {
      setIsFetchingFillers(false);
    }
  };

  /**
   * Places an activity into the itinerary.
   *
   * ANCHOR step → calculate optimal time and make it the anchor.
   * FILLER step → splice into `placed` at the active insert index.
   */
  const handlePlaceActivity = (
    activity: BuilderActivity & {fitStatus?: string},
  ) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    if (step === "ANCHOR") {
      const anchoredAt = getOptimalAnchorTime(activity, userPrefs);
      setPlaced([{activity, anchoredAt}]);
      setStep("FILLER");
      return;
    }

    if (activity.fitStatus === "NO_FIT" || activeInsertIndex === null) return;

    setPlaced((prev) => {
      const next = [...prev];
      next.splice(activeInsertIndex, 0, {activity});
      return next;
    });

    setActiveInsertIndex(null);
  };

  /**
   * Removes an activity by its idea_id.
   * Removing the anchor resets the entire itinerary and returns to ANCHOR step.
   */
  const handleRemoveActivity = (ideaId: number | string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const isAnchor = placed.some(
      (p) => p.anchoredAt != null && p.activity.idea_id === ideaId,
    );

    if (isAnchor) {
      setPlaced([]);
      setStep("ANCHOR");
      setActiveInsertIndex(null);
      loadAnchors();
      return;
    }

    setPlaced((prev) => prev.filter((p) => p.activity.idea_id !== ideaId));
  };

  /**
   * Called when the user selects a new time from the native picker.
   * We shift the 'anchoredAt' property to the newly edited activity,
   * which forces deriveTimeline to automatically rebuild the day around it
   */
  /**
   * Tracks the wheel spinning without closing the modal
   */
  const handleWheelSpin = (event: any, selectedDate?: Date) => {
    if (selectedDate) {
      setTempSelectedDate(selectedDate);
    }
  };

  const toggleSlotOptions = (id: string) => {
    // Tells React Native: "Whatever layout changes happen next, animate them smoothly!"
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    // If it's already open, close it. Otherwise, open this specific one.
    setExpandedSlotId((prev) => (prev === id ? null : id));
  };

  const closeDrawer = () => {
    if (expandedSlotId) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedSlotId(null);
    }
  };

  /**
   * Runs the math only when the user clicks "Confirm"
   */
  const confirmTimeChange = () => {
    if (!editingActivityId) return;

    // 1. Find the activity they are trying to edit
    const targetActivity = placed.find(
      (p) => p.activity.idea_id === editingActivityId,
    )?.activity;
    if (!targetActivity) return;

    // 2. Calculate the Travel Tax boundaries (same math as the engine!)
    const dayStart = new Date(userPrefs.startDate).getTime(); // Assuming these are already cleaned
    const dayEnd = new Date(userPrefs.endDate).getTime();

    const durationMs =
      snapTo15(Number(targetActivity.est_duration_minutes) || 60) * 60_000;

    // Estimate inbound/outbound travel tax based on the user's home origin to be safe
    let travelMs = 0;
    if (userPrefs.modality === "GO_OUT" && targetActivity.distance! > 0) {
      travelMs =
        snapTo15(Math.round(targetActivity.distance! * 3 + 5)) * 60_000;
    }

    const earliestStart = dayStart + travelMs;
    const latestStart = dayEnd - durationMs - travelMs;

    // 3. Snap their picked time to the grid
    const newTimeMs =
      snapTo15(Math.round(tempSelectedDate.getTime() / 60_000)) * 60_000;

    // 4. THE GATEKEEPER: Does it fit?
    if (newTimeMs < earliestStart || newTimeMs > latestStart) {
      Alert.alert(
        "Doesn't quite fit!",
        `To leave enough room for travel, this activity must start between ${formatTime(earliestStart)} and ${formatTime(latestStart)}.`,
      );
      return; // Stop them from placing it
    }

    // 5. It passed! Apply the changes.
    setShowTimePicker(false);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    setPlaced((prev) =>
      prev.map((p) => {
        if (p.activity.idea_id === editingActivityId) {
          return {...p, anchoredAt: newTimeMs};
        }
        return {...p, anchoredAt: undefined};
      }),
    );
    setEditingActivityId(null);
  };

  const startActiveDate = useActiveDateStore((state) => state.startActiveDate);

  // ─── Loading Screen ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View className="flex-1 bg-zinc-950 justify-center items-center">
        <ActivityIndicator size="large" color="#ffffff" />
        <Text className="text-white mt-4 font-mono">
          Consulting the algorithm...
        </Text>
      </View>
    );
  }

  // ─── Main Render ──────────────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-zinc-950">
      <ScrollView
        className="pb-10 bg-zinc-950"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={closeDrawer}
        scrollEnabled={!expandedSlotId}
      >
        {!reviewingItinerary ? (
          // ── PLANNING VIEW ──────────────────────────────────────────────────────
          <View className="flex-1 p-6 relative">
            {/* TIMELINE — only shown once an anchor exists */}
            {timeline.length > 0 && step !== "ANCHOR" && (
              <View className="mb-8 p-5 bg-zinc-900/50 border border-zinc-800 rounded-[24px]">
                {/* Header */}
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest">
                    Timeline
                  </Text>
                  <View className="flex-row gap-x-4">
                    <Text className="text-blue-400 font-mono text-xs">
                      ${remainingBudget} left
                    </Text>
                    <Text className="text-zinc-400 font-mono text-xs">
                      {Math.round(remainingTime)} min left
                    </Text>
                  </View>
                </View>
                <View className="flex-row justify-center items-center my-2">
                  {/* Faint, solid hairline */}
                  <View className="flex-1 h-[1px] bg-violet-500/20" />

                  {/* The Time Pill */}
                  <View className="mx-3 px-4 py-1.5 bg-violet-500/10 rounded-full border border-violet-500/20">
                    <Text className="text-violet-400 font-mono text-xs font-bold tracking-widest">
                      Start: {simpleStartTime}
                    </Text>
                  </View>

                  {/* Faint, solid hairline */}
                  <View className="flex-1 h-[1px] bg-violet-500/20" />
                </View>

                {/*
                Render loop.
                We track `placedSeen` to map each gap slot to the correct
                insert index in `placed[]`.

                placedSeen = -1  → no activity seen yet → insertAt = 0 (pre-anchor)
                placedSeen =  0  → after anchor         → insertAt = 1 (first post)
                etc.

                Travel slots (OCCUPIED, activity: null) don't count toward
                placedSeen because they aren't in placed[].
              */}
                {(() => {
                  let placedSeen = -1;

                  return timeline.map((slot, idx) => {
                    if (slot.type === "OCCUPIED" && slot.activity) {
                      placedSeen++;
                    }
                    // The insert index for any gap at this position in the timeline
                    const insertAt = placedSeen + 1;
                    const isActiveGap = activeInsertIndex === insertAt;
                    const isTravel = !slot.activity && slot.type === "OCCUPIED";
                    const isExpanded = expandedSlotId === slot.id;

                    const isAnchor = placed.some(
                      (p) =>
                        p.anchoredAt != null &&
                        slot.id == `act-${p.activity.idea_id}`,
                    );

                    return (
                      <View
                        key={slot.id ?? idx}
                        className="flex-row items-start my-4"
                      >
                        {/* Vertical timeline track */}
                        <View className="items-center w-4 mr-4 mt-2">
                          <View
                            className={`w-2 h-2 rounded-full z-10 top-2 ${
                              isAnchor
                                ? "bg-yellow-500"
                                : slot.type === "BUFFER"
                                  ? "border border-blue-500/50"
                                  : slot.type === "AVAILABLE"
                                    ? "bg-zinc-700"
                                    : isTravel
                                      ? "bg-green-500"
                                      : "bg-blue-500"
                            }`}
                          />
                          {idx < timeline.length - 1 && (
                            <View
                              className={`absolute w-0 flex-1 border-l-[2px] border-zinc-800 -my-1 top-6 bottom-[-54px] ${
                                idx === timeline.length - 1
                                  ? "border-dotted"
                                  : ""
                              }`}
                            />
                          )}
                        </View>

                        {/* Slot content */}
                        <View className="flex-1 flex-row justify-between pr-2">
                          {slot.type === "AVAILABLE" && (
                            // Gap → tappable "Add Activity" button
                            <Pressable
                              onPress={() => handleOpenGap(insertAt, slot)}
                              className={`flex-1 p-4 rounded-2xl border border-dashed flex-row items-center justify-center ${
                                isActiveGap
                                  ? "bg-blue-600/20 border-blue-500 shadow-sm shadow-blue-900"
                                  : "bg-zinc-900/50 border-blue-700 active:bg-zinc-800"
                              }`}
                            >
                              <Text
                                className={`font-bold ${
                                  isActiveGap
                                    ? "text-blue-400"
                                    : "text-blue-500"
                                }`}
                              >
                                {isActiveGap
                                  ? "Select an activity below..."
                                  : `+ Add Activity  ${Math.round(
                                      (slot.endTime - slot.startTime) / 60_000,
                                    )} min`}
                              </Text>
                            </Pressable>
                          )}
                          {slot.type === "BUFFER" && (
                            <View className="w-full h-10 bg-blue-500/20 border border-blue-500/20 rounded-xl flex items-center justify-center opacity-70">
                              <Text className="text-blue-500 font-medium text-sm">
                                {slot.title} (
                                {Math.round(
                                  (slot.endTime - slot.startTime) / 60_000,
                                )}{" "}
                                min)
                              </Text>
                            </View>
                          )}
                          {slot.type === "OCCUPIED" && (
                            // Occupied slot (activity or travel)
                            <View className="flex-1 flex-row justify-between">
                              <View>
                                <Text className="text-white font-semibold">
                                  {slot.title}
                                </Text>
                                <View className="flex-row items-center mt-1">
                                  <Text className="text-blue-400 text-xs font-mono font-bold mr-2">
                                    {formatTime(slot.startTime)} –{" "}
                                    {formatTime(slot.endTime)}
                                  </Text>
                                  <Text className="text-zinc-500 text-xs">
                                    (
                                    {Math.round(
                                      (slot.endTime - slot.startTime) / 60_000,
                                    )}{" "}
                                    min)
                                  </Text>
                                </View>
                              </View>
                              {isTravel && (
                                <View className="items-center justify-center">
                                  <Ionicons
                                    name="car-outline"
                                    size={25}
                                    color="white"
                                  />
                                </View>
                              )}
                            </View>
                          )}

                          {slot.type === "OCCUPIED" && slot.activity && (
                            <Pressable
                              onPress={() => toggleSlotOptions(slot.id)}
                              className="p-2 -mr-2 rounded-full active:bg-zinc-700/50 z-10 ml-2"
                            >
                              <Ionicons
                                name={
                                  isExpanded ? "close" : "ellipsis-vertical"
                                }
                                size={20}
                                color="#a1a1aa"
                              />
                            </Pressable>
                          )}
                        </View>
                        {isExpanded && (
                          <>
                            <Pressable
                              className="absolute inset-0 top-[-2000] bottom-[-2000] left-[-2000] right-[-2000]"
                              onPress={closeDrawer}
                            />
                            <View className="absolute right-0 top-10 mt-4 border rounded-xl border-zinc-700/50 z-20 overflow-hidden">
                              <Pressable
                                className="bg-zinc-900 px-4 py-4 active:bg-zinc-700 border-b border-zinc-700/50 flex-row justify-start gap-3 items-center"
                                onPress={() => {
                                  setExpandedSlotId(null);
                                  setEditingActivityId(slot.activity!.idea_id);
                                  setTempSelectedDate(new Date(slot.startTime));
                                  setShowTimePicker(true);
                                }}
                              >
                                <Ionicons
                                  name={"time-outline"}
                                  size={20}
                                  color="white"
                                />
                                <Text className="text-white font-medium">
                                  Edit Time
                                </Text>
                              </Pressable>

                              <Pressable
                                className="bg-zinc-900 px-4 py-4 active:bg-zinc-700 border-b border-zinc-700/50 flex-row justify-start gap-3 items-center"
                                onPress={() => {
                                  setExpandedSlotId(null);
                                  handleRemoveActivity(slot.activity!.idea_id);
                                }}
                              >
                                <Ionicons
                                  name={"trash-outline"}
                                  size={20}
                                  color="white"
                                />
                                <Text className="text-white font-medium">
                                  Remove
                                </Text>
                              </Pressable>
                            </View>
                          </>
                        )}
                      </View>
                    );
                  });
                })()}
                <View className="flex-row justify-center items-center my-2">
                  {/* Faint, solid hairline */}
                  <View className="flex-1 h-[1px] bg-violet-500/20" />

                  {/* The Time Pill */}
                  <View className="mx-3 px-4 py-1.5 bg-violet-500/10 rounded-full border border-violet-500/20">
                    <Text className="text-violet-400 font-mono text-xs font-bold tracking-widest">
                      End: {simpleEndTime}
                    </Text>
                  </View>

                  {/* Faint, solid hairline */}
                  <View className="flex-1 h-[1px] bg-violet-500/20" />
                </View>

                {/* Button to move on for any reason */}
                <Pressable
                  onTouchStart={() => {
                    if (process.env.EXPO_OS === "ios") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                  onTouchEnd={() => {
                    if (process.env.EXPO_OS === "ios") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                  onPress={() => setReviewingItinerary(true)}
                  className="w-full h-[50px] justify-center items-center rounded-[10px] mt-4 bg-blue-500 active:bg-blue-400"
                >
                  <Text className="text-white font-semibold text-[16px]">
                    Finish & Review
                  </Text>
                </Pressable>
              </View>
            )}

            {/* ACTIVITY SELECTION DRAWER
              Shown on initial ANCHOR step OR when the user has tapped a gap */}
            {(step === "ANCHOR" || activeInsertIndex !== null) && (
              <View className="mt-4">
                {/* Drawer header */}
                <View className="flex-row justify-between items-end mb-6">
                  <View>
                    <Text className="text-white text-3xl font-bold mb-1">
                      {step === "ANCHOR" ? "The Anchor" : "Up Next"}
                    </Text>
                    <Text className="text-zinc-500 text-base">
                      {step === "ANCHOR"
                        ? `Every great ${userPrefs.socialType.toLowerCase().replace("-", " ")} needs a main event.`
                        : "Pick something to fill this gap."}
                    </Text>
                  </View>
                  {/* Cancel closes the drawer without placing anything */}
                  {activeInsertIndex !== null && (
                    <Pressable onPress={() => setActiveInsertIndex(null)}>
                      <Text className="text-zinc-500 font-bold uppercase text-xs">
                        Cancel
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/* Activity feed */}
                {isFetchingFillers ? (
                  <View className="py-12 items-center justify-center">
                    <ActivityIndicator size="large" color="#3b82f6" />
                    <Text className="text-blue-400 mt-4 font-mono text-xs uppercase tracking-widest">
                      Curating local ideas...
                    </Text>
                  </View>
                ) : sortedActivities.length > 0 ? (
                  sortedActivities.map((item: any) => {
                    const disabled =
                      item.fitStatus === "NO_FIT" && step !== "ANCHOR";

                    return (
                      <Pressable
                        key={item.idea_id}
                        disabled={disabled}
                        onPress={() => handlePlaceActivity(item)}
                        className={`p-5 rounded-2xl mb-4 border ${
                          disabled
                            ? "bg-zinc-950 border-zinc-900 opacity-40"
                            : "bg-zinc-900 border-zinc-800 active:border-white"
                        }`}
                      >
                        <View className="flex-row justify-between">
                          <Text className="text-white text-xl font-bold">
                            {item.title}
                          </Text>
                          <Text className="text-zinc-500">
                            {userPrefs.modality === "GO_OUT"
                              ? `${(item.distance || 0).toFixed(1)} mi`
                              : "Anywhere!"}
                          </Text>
                        </View>

                        <Text className="text-zinc-400 mt-2" numberOfLines={2}>
                          {item.description}
                        </Text>

                        <View className="flex-row mt-4 justify-between">
                          <Text className="text-blue-400 font-mono">
                            ${item.est_price_per_person * headCount} for{" "}
                            {headCount} people
                          </Text>
                          <Text className="text-zinc-500">
                            {Math.floor(item.est_duration_minutes / 60)}hr{" "}
                            {item.est_duration_minutes % 60}min
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text className="text-zinc-500 text-center mt-10">
                    No activities found that fit this gap. Try tweaking your
                    search!
                  </Text>
                )}
              </View>
            )}
          </View>
        ) : (
          // ── COMPLETION VIEW (Full-Screen Native Style) ─────────────────────────
          <View className="flex-1 pt-4 pb-8 bg-zinc-950 px-6">
            {/* ── HEADER (Left-aligned feels more like a native app) ── */}
            <View className="mb-10 mt-2 flex-row items-center">
              <View className="bg-blue-500/10 w-12 h-12 rounded-full items-center justify-center mr-4">
                <Text className="text-2xl">✨</Text>
              </View>
              <View>
                <Text className="text-white text-3xl font-bold tracking-tight">
                  Perfect Night.
                </Text>
                <Text className="text-zinc-500 mt-1 font-medium">
                  Your plans are ready to go.
                </Text>
              </View>
            </View>

            {/* ── CONTINUOUS CALENDAR TIMELINE ── */}
            <View className="flex-1">
              {timeline.map((slot, idx) => {
                const isAvailable =
                  slot.type === "AVAILABLE" || slot.type === "BUFFER";
                const isActivity = slot.type === "OCCUPIED" && !!slot.activity;
                const isTravel = slot.type === "OCCUPIED" && !slot.activity;

                return (
                  <View key={slot.id ?? idx} className="flex-row">
                    {/* 1. Time Column (Left) */}
                    <View className="w-16 items-end mr-3 pt-0.5">
                      {isActivity && (
                        <Text className="text-zinc-400 font-mono text-xs font-bold tracking-tight">
                          {formatTime(slot.startTime)}
                        </Text>
                      )}
                    </View>

                    {/* 2. Vertical Track (Middle) */}
                    <View className="items-center w-4 mr-4 relative">
                      {/* The Node Dot */}
                      <View
                        className={`rounded-full mt-1.5 z-10 ${
                          isActivity
                            ? "w-2.5 h-2.5 bg-blue-500 shadow-sm"
                            : isAvailable
                              ? "w-1.5 h-1.5 bg-transparent border border-zinc-500/50"
                              : "w-1.5 h-1.5 bg-green-700"
                        }`}
                      />

                      {/* The Connecting Line */}
                      {idx < timeline.length - 1 && (
                        <View
                          className={`absolute top-4 bottom-0 w-0 border-l-[2px] ${
                            isAvailable
                              ? "border-zinc-500/50"
                              : isTravel
                                ? "border-green-700/60"
                                : "border-blue-800"
                          }`}
                        />
                      )}
                    </View>

                    {/* 3. Content Column (Right) */}
                    <View className={`flex-1 pb-5`}>
                      {isActivity ? (
                        <View>
                          <Text className="text-white text-lg font-bold leading-tight">
                            {slot.title}
                          </Text>
                          <Text className="text-zinc-500 text-xs mt-1 font-medium">
                            {Math.round(
                              (slot.endTime - slot.startTime) / 60_000,
                            )}{" "}
                            min
                          </Text>
                        </View>
                      ) : isTravel ? (
                        <View className="flex-row items-center mt-0.5">
                          <Ionicons
                            name="car-outline"
                            size={14}
                            color="#71717a"
                          />
                          <Text className="text-zinc-500 text-xs ml-2 font-medium">
                            {Math.round(
                              (slot.endTime - slot.startTime) / 60_000,
                            )}{" "}
                            min travel
                            {idx === timeline.length - 1 ? " home" : ""}
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row items-center mt-0.5">
                          <Ionicons
                            name="hourglass-outline"
                            size={14}
                            color="#71717a"
                          />
                          <Text className="text-zinc-600 text-xs ml-2 font-medium italic">
                            {Math.round(
                              (slot.endTime - slot.startTime) / 60_000,
                            )}{" "}
                            min free time
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* ── FOOTER & ACTIONS (Pushed to bottom) ── */}
            <View className="mt-auto pt-6">
              {/* Summary Footer */}
              <View className="flex-row justify-between pt-6 border-t border-zinc-800/80 mb-6 px-2">
                <View>
                  <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1">
                    Total Spent
                  </Text>
                  <Text className="text-white text-xl font-mono">
                    ${spentBudget}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1">
                    Flex Time
                  </Text>
                  <Text className="text-white text-xl font-mono">
                    {Math.round(flexTime)}m
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <Pressable
                className="bg-blue-600 py-5 rounded-2xl items-center mb-3 active:bg-blue-700 border border-blue-500"
                onPress={() => {
                  startActiveDate(timeline, userPrefs);
                  router.push("/active-date");
                }}
              >
                <Text className="text-white font-bold text-lg">
                  Finalize Itinerary
                </Text>
              </Pressable>

              <Pressable
                className="py-4 rounded-2xl items-center active:bg-zinc-800/50"
                onPress={() => {
                  setPlaced([]);
                  setStep("ANCHOR");
                  setActiveInsertIndex(null);
                  setReviewingItinerary(false);
                  loadAnchors();
                }}
              >
                <Text className="text-zinc-500 font-semibold">Start Over</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
      {/* NATIVE TIME PICKER MODAL */}
      {showTimePicker && (
        <View className="absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 p-6 pb-10 z-50 rounded-t-3xl shadow-2xl">
          {/* Header & Action Buttons */}
          <View className="flex-row justify-between items-center mb-6">
            <Pressable onPress={() => setShowTimePicker(false)}>
              <Text className="text-zinc-400 font-semibold text-base">
                Cancel
              </Text>
            </Pressable>
            <Text className="text-white font-bold text-lg">Set Start Time</Text>
            <Pressable onPress={confirmTimeChange}>
              <Text className="text-blue-500 font-bold text-base">Confirm</Text>
            </Pressable>
          </View>

          {/* THE FIX: A fixed-height container that reserves the exact space the picker needs */}
          <View className="h-[220px] w-full justify-center">
            <DateTimePicker
              value={tempSelectedDate}
              mode="time"
              display="spinner"
              minimumDate={prefsStartDate}
              maximumDate={prefsEndDate}
              minuteInterval={15}
              onChange={handleWheelSpin}
              textColor="white"
            />
          </View>
        </View>
      )}
    </View>
  );
}

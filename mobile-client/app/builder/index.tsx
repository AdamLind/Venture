import {TimeSlot, PlanningStep, Activity} from "@/types/itinerary";
import {
  createInitialTimeline,
  queryAnchors,
  scheduleFillers,
  updateTimeline,
  canActivityFit,
  analyzeTriggers,
  getAvailableGaps,
  packTimeline,
  formatTime,
} from "@/utils/itineraryEngine";
import {useLocalSearchParams} from "expo-router";
import {useState, useEffect} from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";

export default function BuilderScreen() {
  const {prefs} = useLocalSearchParams();
  const userPrefs = JSON.parse(prefs as string);

  const dateStart = new Date(userPrefs.startDate);
  const dateEnd = new Date(userPrefs.endDate);
  dateStart.setSeconds(0, 0);
  dateEnd.setSeconds(0, 0);

  const availableTime = (dateEnd.getTime() - dateStart.getTime()) / 60000;
  const availableBudget = userPrefs.budget;
  const headCount = userPrefs.headCount;

  const [timeline, setTimeline] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<PlanningStep>("ANCHOR");
  const [retry, setRetry] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  useState<number>(availableBudget);
  const [showDinnerModal, setShowDinnerModal] = useState(false);
  const [activityNeedingPacking, setActivityNeedingPacking] = useState<
    (Activity & {fitStatus?: string}) | null
  >(null);

  // Dynamically calculate what is spent based strictly on the current tape
  const spentBudget = timeline.reduce((total, slot) => {
    if (slot.activity)
      return total + Number(slot.activity.est_price_per_person) * headCount;
    return total;
  }, 0);

  const remainingBudget = availableBudget - spentBudget;

  // Dynamically calculate remaining time by checking AVAILABLE slots
  const remainingTime = timeline
    .filter((slot) => slot.type === "AVAILABLE")
    .reduce(
      (total, slot) => total + (slot.endTime - slot.startTime) / 60000,
      0,
    );

  const availableActivities = activities.filter((activity) => {
    return !timeline.some(
      (slot) => slot.activity?.idea_id === activity.idea_id,
    );
  });

  // Find the single largest gap currently on the timeline
  const currentGaps = getAvailableGaps(timeline);
  const largestGap = currentGaps.reduce(
    (max, g) => Math.max(max, g.duration),
    0,
  );

  const sortedActivities = availableActivities
    .map((activity) => {
      const duration = Number(activity.est_duration_minutes) || 0;

      let fitStatus = "NO_FIT";
      if (duration <= largestGap) {
        fitStatus = "FITS_NOW";
      } else if (duration <= remainingTime) {
        fitStatus = "REQUIRES_PACKING"; // The magic tier!
      }

      return {...activity, fitStatus};
    })
    .sort((a, b) => {
      // Sort priority: FITS_NOW -> REQUIRES_PACKING -> NO_FIT
      const rank = {FITS_NOW: 1, REQUIRES_PACKING: 2, NO_FIT: 3};
      return (
        rank[a.fitStatus as keyof typeof rank] -
        rank[b.fitStatus as keyof typeof rank]
      );
    });

  const initialTimeline = createInitialTimeline(
    userPrefs.startDate,
    userPrefs.endDate,
  );

  useEffect(() => {
    setTimeline(initialTimeline);
    loadAnchors();
  }, []);

  const loadAnchors = async () => {
    try {
      setLoading(true);
      const result = await queryAnchors(userPrefs);

      // FIX: We only drop into the 'else' block if success is explicitly false (a real network error)
      if (result.success) {
        // Fallback to empty array if data is missing, ensuring setActivities never gets null
        setActivities(result.data || []);
        setRetry(result.retried);
      } else {
        setActivities([]);
        console.error("Failed to load anchors: ", result.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Use an intersection type (&) to temporarily extend the Activity interface
  const handleSelectActivity = (
    activity: Activity & {
      fitStatus?: "FITS_NOW" | "REQUIRES_PACKING" | "NO_FIT";
    },
  ) => {
    // INTERCEPT: If it requires packing, don't add it yet. Show the prompt!
    if (activity.fitStatus === "REQUIRES_PACKING") {
      setActivityNeedingPacking(activity);
      return;
    }

    // ... The rest of your function
    const gaps = getAvailableGaps(timeline);
    const targetGap = gaps.find(
      (g) => g.duration >= (Number(activity.est_duration_minutes) || 0),
    );
    if (!targetGap) return;

    const newTimeline = updateTimeline(
      timeline,
      {
        type: "ADD",
        payload: {
          targetId: targetGap.slotId,
          activity: activity,
          startTime: targetGap.startTime,
          prefs: userPrefs,
        },
      },
      userPrefs,
    );

    setTimeline(newTimeline);

    const trigger = analyzeTriggers(newTimeline, targetGap.slotId);
    if (trigger === "PROMPT_DINNER") {
      setShowDinnerModal(true);
    }
  };

  const handleRemoveActivity = (slotId: string) => {
    const newTimeline = updateTimeline(
      timeline,
      {
        type: "REMOVE",
        payload: {slotId},
      },
      userPrefs,
    );

    setTimeline(newTimeline);
  };

  const handlePackSchedule = () => {
    const compacted = packTimeline(timeline, userPrefs);
    setTimeline(compacted);
  };

  const handleConfirmPackAndAdd = () => {
    if (!activityNeedingPacking) return;

    // 1. Pack the timeline (pushes all gaps to the end)
    const compacted = packTimeline(timeline, userPrefs);

    // 2. Find the new massive gap at the end
    const finalGaps = getAvailableGaps(compacted);
    const targetGap = finalGaps[0];

    // 3. Add the activity into that newly created space
    const newTimeline = updateTimeline(
      compacted,
      {
        type: "ADD",
        payload: {
          targetId: targetGap.slotId,
          activity: activityNeedingPacking,
          startTime: targetGap.startTime,
          prefs: userPrefs,
        },
      },
      userPrefs,
    );

    setTimeline(newTimeline);
    setActivityNeedingPacking(null); // Clear the prompt
  };

  if (loading)
    return (
      <View className="flex-1 bg-zinc-950 justify-center items-center">
        <ActivityIndicator size="large" color="#ffffff" />
        <Text className="text-white mt-4 font-mono">
          Consulting the algorithm...
        </Text>
      </View>
    );

  return (
    <ScrollView
      className="mb-10 bg-zinc-950"
      showsVerticalScrollIndicator={false}
    >
      {Math.round(remainingTime) >= 30 ? (
        <View className="flex-1 p-6">
          {/* 1. PROGRESS TRACKER */}
          {timeline.length > 0 && (
            <View className="mb-8 p-5 bg-zinc-900/50 border border-zinc-800 rounded-[24px]">
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

              {timeline.map((slot, idx) => (
                <View key={idx} className="flex-row items-start mb-4">
                  <View className="items-center w-4 mr-4">
                    <View
                      className={`w-2 h-2 rounded-full z-10 top-2 ${
                        slot.type == "AVAILABLE" ? "bg-zinc-700" : "bg-blue-500"
                      }`}
                    />
                    {idx < timeline.length && (
                      <View
                        className={`w-0 flex-1 border-l-[2px] border-zinc-800 -my-1 top-2 ${
                          idx == timeline.length - 1 ? "border-dotted" : ""
                        }`}
                      />
                    )}
                  </View>

                  <View className="flex-1 flex-row justify-between pr-2">
                    <View>
                      <Text className="text-white font-semibold">
                        {slot.title}
                      </Text>
                      <View className="flex-row items-center mt-1">
                        <Text className="text-blue-400 text-xs font-mono font-bold mr-2">
                          {formatTime(slot.startTime)} -{" "}
                          {formatTime(slot.endTime)}
                        </Text>
                        <Text className="text-zinc-500 text-xs">
                          (
                          {Math.round(
                            (slot.endTime - slot.startTime) / 1000 / 60,
                          )}{" "}
                          min)
                        </Text>
                      </View>
                    </View>

                    {/* ONLY show the remove button if it's an actual activity */}
                    {slot.type === "OCCUPIED" && slot.activity && (
                      <Pressable
                        onPress={() => handleRemoveActivity(slot.id)}
                        className="bg-red-500/10 px-3 py-1 rounded-full border border-red-500/30 self-start"
                      >
                        <Text className="text-red-400 text-[10px] font-bold uppercase">
                          Remove
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}

              {/* The "Next Step" Placeholder */}
              <View className="flex-row">
                <View className="items-center w-4 mr-4">
                  <View className="w-2 h-2 rounded-full bg-zinc-700 top-2" />
                </View>
                <View className="flex-1">
                  <Text className="text-zinc-600 italic text-sm">
                    Next activity...
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* 2. HEADER */}
          <Text className="text-white text-4xl font-bold mb-2">
            {step == "ANCHOR" ? "The Anchor" : "The Filler"}
          </Text>
          <Text className="text-zinc-500 text-lg mb-8">
            {step == "ANCHOR"
              ? "Every great date needs a main event."
              : "Something to round out the night."}
          </Text>
          {retry ? (
            <Text className="text-purple-500 text-lg mb-8">
              Unfortunately nothing matched your search. Here are some ideas
              from different categories.
            </Text>
          ) : null}

          {activityNeedingPacking && (
            <View className="bg-indigo-900/40 border border-indigo-500/50 p-5 rounded-2xl mb-6">
              <Text className="text-white font-bold text-lg mb-2">
                Schedule Fragmentation
              </Text>
              <Text className="text-indigo-200 text-sm mb-4">
                You have enough total time for{" "}
                <Text className="font-bold text-white">
                  {activityNeedingPacking.title}
                </Text>
                , but your schedule is too broken up. Want me to optimize your
                timeline to fit it in?
              </Text>
              <View className="flex-row gap-3">
                <Pressable
                  className="bg-indigo-500 px-4 py-2 rounded-xl flex-1 items-center"
                  onPress={handleConfirmPackAndAdd}
                >
                  <Text className="text-white font-bold">Pack & Add</Text>
                </Pressable>
                <Pressable
                  className="bg-zinc-800 px-4 py-2 rounded-xl flex-1 items-center"
                  onPress={() => setActivityNeedingPacking(null)}
                >
                  <Text className="text-zinc-300 font-bold">Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          {sortedActivities && Array.isArray(sortedActivities) ? (
            sortedActivities.map((item: any) => {
              const disabled = item.fitStatus === "NO_FIT";
              const needsPacking = item.fitStatus === "REQUIRES_PACKING";

              return (
                <Pressable
                  key={item.idea_id}
                  disabled={disabled}
                  className={`p-5 rounded-2xl mb-4 border ${
                    disabled
                      ? "bg-zinc-950 border-zinc-900 opacity-40"
                      : needsPacking
                        ? "bg-zinc-900 border-indigo-500/30" // Give it a slight tint to show it's special
                        : "bg-zinc-900 border-zinc-800 active:border-white"
                  }`}
                  onPress={() => handleSelectActivity(item)}
                >
                  {/* If it needs packing, show a tiny badge inside the card! */}
                  {needsPacking && (
                    <Text className="text-indigo-400 text-[10px] font-bold uppercase mb-1 tracking-widest">
                      Requires Packing
                    </Text>
                  )}
                  <View className="flex-row justify-between">
                    <Text className="text-white text-xl font-bold">
                      {item.title}
                    </Text>
                    <Text className="text-zinc-500">
                      {userPrefs.modality == "GO_OUT"
                        ? item.distance.toFixed(1) + " mi"
                        : "Anywhere!"}
                    </Text>
                  </View>
                  <Text className="text-zinc-400 mt-2" numberOfLines={2}>
                    {item.description}
                  </Text>
                  <View className="flex-row mt-4 justify-between">
                    <Text className="text-blue-400 font-mono">
                      ${item.est_price_per_person * headCount} for {headCount}{" "}
                      people
                    </Text>
                    <Text className="text-zinc-500">
                      {Math.floor(item.est_duration_minutes / 60)} hr
                      {item.est_duration_minutes >= 120 ? "s " : " "}
                      {item.est_duration_minutes % 60}{" "}
                      {item.est_duration_minutes % 60 > 1 ? "mins " : "min "}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <Text className="text-zinc-500 text-center mt-10">
              No anchors found for this selection.
            </Text>
          )}
        </View>
      ) : (
        // SHOW THE COMPLETION CARD
        <View className="flex-1 justify-center p-6 bg-zinc-950">
          <View
            key="final-itinerary-card"
            className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 shadow-2xl"
          >
            <View className="items-center mb-8">
              <View className="bg-blue-500/10 w-16 h-16 rounded-full items-center justify-center mb-4">
                <Text className="text-3xl">✨</Text>
              </View>
              <Text className="text-white text-3xl font-bold">
                Perfect Night.
              </Text>
              <Text className="text-zinc-500">
                Your itinerary is ready to go.
              </Text>
            </View>

            <View className="gap-y-4 mb-8">
              {timeline.map((slot, idx) => (
                <View
                  key={idx}
                  className="flex-row items-center bg-zinc-800/30 p-4 rounded-2xl"
                >
                  <View className="w-8 h-8 rounded-lg bg-zinc-800 items-center justify-center mr-4 border border-zinc-700">
                    <Text className="text-zinc-400 font-bold">{idx + 1}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-bold">{slot.title}</Text>
                    <View className="flex-row items-center mt-1">
                      <Text className="text-blue-400 text-xs font-mono font-bold mr-2">
                        {formatTime(slot.startTime)} -{" "}
                        {formatTime(slot.endTime)}
                      </Text>
                      <Text className="text-zinc-500 text-xs">
                        (
                        {Math.round(
                          (slot.endTime - slot.startTime) / 1000 / 60,
                        )}{" "}
                        min)
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <View className="flex-row justify-between mb-8 px-2">
              <View>
                <Text className="text-zinc-500 text-[10px] uppercase font-bold">
                  Total Spent
                </Text>
                <Text className="text-white text-xl font-mono">
                  ${availableBudget - remainingBudget}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-zinc-500 text-[10px] uppercase font-bold">
                  Flex Time
                </Text>
                <Text className="text-white text-xl font-mono">
                  {remainingTime}m
                </Text>
              </View>
            </View>

            <Pressable
              className="bg-blue-600 py-5 rounded-2xl items-center mb-3 shadow-lg shadow-blue-500/20"
              onPress={() => alert("Calendar Syncing...")}
            >
              <Text className="text-white font-bold text-lg">
                Finalize Itinerary
              </Text>
            </Pressable>

            <Pressable
              className="py-4 rounded-2xl items-center"
              onPress={() => {
                setStep("ANCHOR");
                setTimeline(initialTimeline);
                queryAnchors(userPrefs);
              }}
            >
              <Text className="text-zinc-500 font-semibold">Start Over</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

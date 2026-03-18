import {TimeSlot, PlanningStep} from "@/types/itinerary";
import {
  createInitialTimeline,
  queryAnchors,
  scheduleFillers,
  getGapAnalysis,
  updateTimeline,
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
  const [remainingTime, setRemainingTime] = useState<number>(availableTime);
  const [remainingBudget, setRemainingBudget] =
    useState<number>(availableBudget);

  const availableActivities = activities.filter((activity) => {
    return !timeline.some(
      (slot) => slot.activity?.idea_id === activity.idea_id,
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

      if (result.success && result.data) {
        // Use the fullList if you want to show all options in a list
        setActivities(result.data);
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

  const handleSelectActivity = async (activity: any) => {
    // 1. Find the first available gap that fits this activity
    const gapAnalysis = getGapAnalysis(timeline);
    const bestGap = gapAnalysis.find(
      (g) => g.duration >= activity.est_duration_minutes,
    );

    if (!bestGap) {
      alert("This doesn't fit in your schedule!");
      return;
    }

    // 2. Use your Dispatch Engine to "fragment" the timeline
    const newTimeline = updateTimeline(timeline, {
      type: "ADD",
      payload: {
        targetId: bestGap.slotId,
        activity: activity,
        startTime: bestGap.startTime, // Auto-slots to the start of the gap
        prefs: userPrefs
      },
    });

    setTimeline(newTimeline);

    // 3. Update the UI state
    setRemainingTime((prev) => prev - activity.est_duration_minutes);
    setRemainingBudget(
      (prev) => prev - activity.est_price_per_person * headCount,
    );

    // 4. Determine the next step
    if (step === "ANCHOR") {
      setStep("SUB_ANCHOR");
      // Fetch new options based on the NEW gaps
      const analysis = getGapAnalysis(newTimeline);
      // Trigger your loadFillers logic here...
    }
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
                <View key={idx} className="flex-row">
                  <View className="items-center w-4 mr-4">
                    <View
                      className={`w-2 h-2 rounded-full z-10 top-2 ${slot.type == "AVAILABLE" ? "bg-zinc-700" : "bg-blue-500"}`}
                    />
                    {idx < timeline.length && (
                      <View
                        className={`w-0 flex-1 border-l-[2px] border-zinc-800 -my-1 top-2 ${idx == timeline.length - 1 ? "border-dotted" : ""} will-change-variable`}
                      />
                    )}
                  </View>
                  <View className="flex-1 pb-4">
                    <Text className="text-white font-semibold">
                      {slot.title}
                    </Text>
                    <Text className="text-zinc-500 text-xs">
                      {Math.round((slot.endTime - slot.startTime) / 1000 / 60)}{" "}
                      min
                    </Text>
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

          {availableActivities && Array.isArray(availableActivities) ? (
            availableActivities.map((item: any) => (
              <Pressable
                key={item.idea_id}
                className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl mb-4 active:border-white"
                onPress={() => handleSelectActivity(item)}
              >
                <View className="flex-row justify-between">
                  <Text className="text-white text-xl font-bold">
                    {item.title}
                  </Text>
                  <Text className="text-zinc-500">
                    {userPrefs.locationType == "GO_OUT"
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
            ))
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
                    <Text className="text-zinc-500 text-xs">
                      {Math.round((slot.endTime - slot.startTime) / 1000 / 60)}{" "}
                      mins
                    </Text>
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
                setTimeline(initialTimeline);
                setRemainingTime(availableTime);
                setRemainingBudget(availableBudget);
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

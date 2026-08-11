import ActivityTagsSelector from "@/components/home/ActivityTagsSelector";
import * as Haptics from "expo-haptics";
import BudgetInput from "@/components/home/BudgetInput";
import InOrOutSelector from "@/components/home/InOrOutSelector";
import LocationSelector from "@/components/home/LocationSelector";
import {useEffect, useRef, useState} from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  Alert,
  TextInput,
  Modal,
  Platform,
} from "react-native";
import Greeting from "../../components/home/Greeting";
import SocialSelector from "../../components/home/SocialSelector";
import {ActivityLocation, SimpleLocation} from "../../types/itinerary";
import {useRouter} from "expo-router";
import {usePrefsStore} from "../../store/usePrefsStore";
import {useActiveDateStore} from "@/store/activeDateStore";
import DateTimePicker from "@react-native-community/datetimepicker";

export default function HomeScreen() {
  const TAG_TAXONOMY: Record<string, string[]> = {
    Food: ["casual", "fancy", "sweets", "soda", "cafes"],
    Active: ["nature", "stroll", "games", "sweat", "seasonal"],
    Shows: ["film", "music", "comedy", "stage", "arts"],
    Close: ["intimate", "quiet", "create", "views", "spa"],
  };

  const router = useRouter();
  const setPrefs = usePrefsStore((state) => state.setPrefs);
  const timeline = useActiveDateStore((state) => state.timeline);

  const getRoundedDate = (date = new Date()) => {
    const minutes = 15;
    const ms = 1000 * 60 * minutes;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  };

  // --- STREAMLINED STATE ---
  const [socialType, setSocialType] = useState("Date");
  const [modality, setModality] = useState<ActivityLocation>(
    ActivityLocation.GoOut,
  );
  const [location, setLocation] = useState<SimpleLocation | null>(null);

  // Time Planning State
  const [startDate, setStartDate] = useState(getRoundedDate());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(getRoundedDate());
  const [durationHours, setDurationHours] = useState<number | null>(4);

  // Budget State Handling
  const [budgetTier, setBudgetTier] = useState<number>(50); // Default $$
  const [isCustomBudget, setIsCustomBudget] = useState<boolean>(false);
  const [customBudget, setCustomBudget] = useState<number | null>(null);
  const budgetRef = useRef<TextInput | null>(null);

  const [selectedTagClasses, setSelectedTagClasses] = useState<number[]>([1]);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    TAG_TAXONOMY["Food"] || [],
  );
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null);

  const lastActivityElement =
    socialType === "Date"
      ? {
          id: 4,
          name: "Close",
          icon: "heart-outline",
          bg: "bg-pink-500",
          border: "border-pink-500",
          text: "text-pink-500",
          rawColor: "#EC4899",
        }
      : {
          id: 4,
          name: "Cozy",
          icon: "cafe-outline",
          bg: "bg-green-600",
          border: "border-green-600",
          text: "text-green-600",
          rawColor: "#16A34A",
        };

  const activityClasses = [
    {
      id: 1,
      name: "Food",
      icon: "pizza-outline",
      bg: "bg-red-500",
      border: "border-red-500",
      text: "text-red-500",
      rawColor: "#EF4444",
    },
    {
      id: 2,
      name: "Active",
      icon: "basketball-outline",
      bg: "bg-amber-500",
      border: "border-amber-500",
      text: "text-amber-500",
      rawColor: "#F59E0B",
    },
    {
      id: 3,
      name: "Shows",
      icon: "ticket-outline",
      bg: "bg-blue-500",
      border: "border-blue-500",
      text: "text-blue-500",
      rawColor: "#3B82F6",
    },
    lastActivityElement,
  ];

  const expandedCategory = activityClasses.find(
    (a) => a.id === expandedClassId,
  );
  const lookupKey =
    expandedCategory?.name === "Cozy" ? "Close" : expandedCategory?.name;
  const tagsToRender = lookupKey ? TAG_TAXONOMY[lookupKey] : [];

  // --- HELPER: Format Date for UI ---
  const formatStartDisplay = (date: Date) => {
    const today = new Date();
    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
    const timeStr = date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    if (isToday) return `Today, ${timeStr}`;

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      date.getDate() === tomorrow.getDate() &&
      date.getMonth() === tomorrow.getMonth() &&
      date.getFullYear() === tomorrow.getFullYear();

    if (isTomorrow) return `Tomorrow, ${timeStr}`;
    return `${date.toLocaleDateString([], {month: "short", day: "numeric"})}, ${timeStr}`;
  };

  // --- EVENT HANDLERS ---
  const handleKingClassChange = (newClassId: number) => {
    const clickedCategory = activityClasses.find((a) => a.id === newClassId);
    if (!clickedCategory) return;
    const key =
      clickedCategory.name === "Cozy" ? "Close" : clickedCategory.name;
    const categoryTags = TAG_TAXONOMY[key] || [];

    if (selectedTagClasses.includes(newClassId)) {
      if (selectedTagClasses.length === 1) return;
      if (expandedClassId) {
        setExpandedClassId(newClassId);
        return;
      }
      setSelectedTagClasses((prev) => prev.filter((id) => id !== newClassId));
      setSelectedTags((prev) =>
        prev.filter((tag) => !categoryTags.includes(tag)),
      );
    } else {
      setSelectedTagClasses((prev) => [...prev, newClassId]);
      setSelectedTags((prev) =>
        Array.from(new Set([...prev, ...categoryTags])),
      );
      expandedClassId && setExpandedClassId(newClassId);
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      if (selectedTags.length === 1) return;
      const nextTags = selectedTags.filter((t) => t !== tag);
      setSelectedTags(nextTags);
      setSelectedTagClasses((prevClasses) =>
        prevClasses.filter((classId) => {
          const category = activityClasses.find((a) => a.id === classId);
          const key = category?.name === "Cozy" ? "Close" : category?.name;
          const categoryTags = key ? TAG_TAXONOMY[key] : [];
          return categoryTags.some((catTag) => nextTags.includes(catTag));
        }),
      );
    } else {
      setSelectedTags((prev) => [...prev, tag]);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (selectedDate) {
      if (Platform.OS === "android") {
        setShowStartPicker(false);
        setStartDate(selectedDate);
      } else {
        setTempStartDate(selectedDate);
      }
    }
  };

  const handleGenerate = () => {
    if (modality === ActivityLocation.GoOut && !location) {
      Alert.alert(
        "Location Required",
        "Please select a starting location so we can find activities near you.",
      );
      return;
    }
    if (
      isCustomBudget &&
      customBudget !== 0 &&
      !customBudget &&
      budgetRef.current
    ) {
      budgetRef.current.focus();
      return;
    }

    const hoursToPlan = durationHours === null ? 12 : durationHours;
    const computedEndDate = new Date(
      startDate.getTime() + hoursToPlan * 60 * 60 * 1000,
    );
    const computedHeadCount =
      socialType === "Date" ? 2 : socialType === "Solo" ? 1 : 4;
    const finalBudget = isCustomBudget ? customBudget || 0 : budgetTier;

    setPrefs({
      socialType,
      modality: modality === ActivityLocation.GoOut ? "GO_OUT" : "STAY_IN",
      startDate,
      endDate: computedEndDate,
      currentLocation: location,
      travelDistance: 15,
      budget: finalBudget,
      vibes: selectedTags,
      headCount: computedHeadCount,
    });

    router.push("../builder");
  };

  return (
    <View className="flex-1 bg-zinc-800">
      <ScrollView
        className="flex-1"
        contentContainerClassName="justify-start items-center pb-20"
      >
        <View className="w-full bg-zinc-800 rounded-b-4xl p-[25px] pt-15">
          <Greeting />

          <View className="mt-[30px] flex-col gap-[25px]">
            <SocialSelector type={socialType} setType={setSocialType} />
            <InOrOutSelector
              inOrOut={modality}
              setInOrOut={setModality}
              setLocation={setLocation}
            />

            {modality == ActivityLocation.GoOut && (
              <LocationSelector location={location} setLocation={setLocation} />
            )}

            {/* Time & Duration Row */}
            <View className="flex-row gap-4">
              {/* Start Time Button */}
              <Pressable
                onPress={() => {
                  setTempStartDate(startDate);
                  setShowStartPicker(true);
                }}
                className="flex-1 bg-zinc-900 rounded-2xl p-4 border border-zinc-700 active:bg-zinc-800"
              >
                <Text className="text-zinc-500 text-xs uppercase font-bold mb-1">
                  Plan For
                </Text>
                <Text className="text-white font-semibold">
                  {formatStartDisplay(startDate)}
                </Text>
              </Pressable>

              {/* UPGRADED DURATION SELECTOR */}
              <View className="flex-1 flex-row bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-700">
                {[2, 4, 6, null].map((val) => (
                  <Pressable
                    key={val === null ? "inf" : val}
                    onPress={() => setDurationHours(val)}
                    className={`flex-1 justify-center items-center ${durationHours === val ? "bg-blue-600" : "bg-transparent"}`}
                  >
                    <Text
                      className={`font-semibold text-lg ${durationHours === val ? "text-white" : "text-zinc-400"}`}
                    >
                      {val === null ? "∞" : `${val}h`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Budget Row with Custom Option */}
            <View className="flex-col gap-3">
              <View className="flex-row bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-700 p-1">
                {[
                  {label: "$", val: 20},
                  {label: "$$", val: 50},
                  {label: "$$$", val: 150},
                ].map((tier) => (
                  <Pressable
                    key={tier.label}
                    onPress={() => {
                      setIsCustomBudget(false);
                      setBudgetTier(tier.val);
                    }}
                    className={`flex-1 py-3 rounded-xl items-center ${!isCustomBudget && budgetTier === tier.val ? "bg-zinc-700" : "bg-transparent"}`}
                  >
                    <Text
                      className={`font-semibold ${!isCustomBudget && budgetTier === tier.val ? "text-white" : "text-zinc-500"}`}
                    >
                      {tier.label}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    setIsCustomBudget(true);
                    setTimeout(() => budgetRef.current?.focus(), 50);
                  }}
                  className={`flex-1 py-3 rounded-xl items-center ${isCustomBudget ? "bg-zinc-700" : "bg-transparent"}`}
                >
                  <Text
                    className={`font-semibold ${isCustomBudget ? "text-white" : "text-zinc-500"}`}
                  >
                    Exact
                  </Text>
                </Pressable>
              </View>

              {isCustomBudget && (
                <View className="flex-row items-center justify-center animate-pulse">
                  <BudgetInput
                    budget={customBudget}
                    setBudget={setCustomBudget}
                    ref={budgetRef}
                  />
                </View>
              )}
            </View>

            {/* Tag Selector */}
            <ActivityTagsSelector
              taxonomy={TAG_TAXONOMY}
              classes={activityClasses}
              selectedTagClasses={selectedTagClasses}
              setSelectedClass={handleKingClassChange}
              activeTags={selectedTags}
              onLongPressClass={(id) =>
                setExpandedClassId((prevId) => (prevId === id ? null : id))
              }
            />

            {expandedClassId && (
              <View className="w-full flex-row flex-wrap justify-center gap-3 mt-2 bg-zinc-900/80 p-5 rounded-2xl border border-zinc-700">
                {tagsToRender.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  const categoryTheme = activityClasses.find(
                    (a) => a.id === expandedClassId,
                  );

                  return (
                    <Pressable
                      key={tag}
                      onPress={() => {
                        if (process.env.EXPO_OS === "ios")
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                        toggleTag(tag);
                      }}
                      className={`px-4 py-2 rounded-full border ${
                        isSelected
                          ? `${categoryTheme?.bg} border-transparent`
                          : `bg-transparent ${categoryTheme?.border}`
                      }`}
                    >
                      <Text
                        className={`text-[14px] font-medium ${isSelected ? "text-white" : categoryTheme?.text}`}
                      >
                        {tag.charAt(0).toUpperCase() + tag.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Pressable
              onPress={
                timeline ? () => router.push("/active-date") : handleGenerate
              }
              className={`w-full h-[50px] justify-center rounded-[10px] mt-4 bg-blue-600`}
            >
              <Text className="text-center text-white font-semibold text-[18px]">
                {timeline ? "Activity in Progress" : "Start Planning"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* iOS Modal for Date/Time Selection */}
      {Platform.OS === "ios" && showStartPicker && (
        <View className="absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 p-6 pb-10 z-50 rounded-t-3xl shadow-2xl">
          <View className="flex-row justify-between items-center mb-6">
            <Pressable onPress={() => setShowStartPicker(false)}>
              <Text className="text-zinc-400 font-semibold text-base">
                Cancel
              </Text>
            </Pressable>
            <Text className="text-white font-bold text-lg">Plan Ahead</Text>
            <Pressable
              onPress={() => {
                setStartDate(tempStartDate);
                setShowStartPicker(false);
              }}
            >
              <Text className="text-blue-500 font-bold text-base">Done</Text>
            </Pressable>
          </View>
          <View className="h-[220px] w-full justify-center">
            <DateTimePicker
              value={tempStartDate}
              mode="datetime"
              display="spinner"
              minimumDate={new Date()}
              minuteInterval={15}
              onChange={handleDateChange}
              textColor="white"
            />
          </View>
        </View>
      )}

      {/* Android relies on the system default popup so it renders inline when activated */}
      {Platform.OS === "android" && showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="datetime"
          minimumDate={new Date()}
          minuteInterval={15}
          onChange={handleDateChange}
        />
      )}
    </View>
  );
}

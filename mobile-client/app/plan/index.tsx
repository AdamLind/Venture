// app/plan.tsx
import ActivityTagsSelector from "@/components/home/ActivityTagsSelector";
import BudgetInput from "@/components/home/BudgetInput";
import InOrOutSelector from "@/components/home/InOrOutSelector";
import {useEffect, useRef, useState} from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  Alert,
  TextInput,
  Platform,
} from "react-native";
import SocialSelector from "@/components/home/SocialSelector";
import {ActivityLocation} from "@/types/itinerary";
import {SimpleLocation} from "@/types/activities";
import {useRouter} from "expo-router";
import {usePrefsStore} from "@/src/store/usePrefsStore";
import {useActiveDateStore} from "@/src/store/activeDateStore";
import DateTimePicker from "@react-native-community/datetimepicker";
import {Ionicons} from "@expo/vector-icons";

// IMPORT SHARED CONSTANTS
import {
  TAG_TAXONOMY,
  BASE_ACTIVITY_CLASSES,
  DATE_ACTIVITY_CLASS,
} from "@/src/constants/tags";

export default function PlanModal() {
  const router = useRouter();
  const setPrefs = usePrefsStore((state) => state.setPrefs);
  const timeline = useActiveDateStore((state) => state.timeline);

  const getRoundedDate = (date = new Date()) => {
    const minutes = 15;
    const ms = 1000 * 60 * minutes;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  };

  // State
  const [socialType, setSocialType] = useState("Date");
  const [modality, setModality] = useState<ActivityLocation>(
    ActivityLocation.StayIn,
  );
  const [location, setLocation] = useState<SimpleLocation | null>(null);
  const [startDate, setStartDate] = useState(getRoundedDate());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(getRoundedDate());
  const [durationHours, setDurationHours] = useState<number | null>(4);
  const [budgetTier, setBudgetTier] = useState<number>(50);
  const [isCustomBudget, setIsCustomBudget] = useState<boolean>(false);
  const [customBudget, setCustomBudget] = useState<number | null>(null);
  const budgetRef = useRef<TextInput | null>(null);

  // Tag State - Drastically simplified!
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Safely grab the first 3 base classes, and swap the 4th based on socialType
  const activityClasses = [
    ...BASE_ACTIVITY_CLASSES.slice(0, 3),
    socialType === "Date" ? DATE_ACTIVITY_CLASS : BASE_ACTIVITY_CLASSES[3],
  ];

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
        "Please allow location access to find nearby activities.",
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
      vibes: selectedTags, // Saves the tags passed up from our component
      headCount: computedHeadCount,
    });

    router.replace("/builder");
  };

  return (
    <View className="flex-1 bg-zinc-950">
      <View className="w-full items-center pt-4 pb-2">
        <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="justify-start items-center pb-12"
      >
        <View className="w-full px-6 pt-2">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-white text-2xl font-bold">New Plan</Text>
            <Pressable
              onPress={() => router.back()}
              className="bg-zinc-700 w-8 h-8 rounded-full items-center justify-center"
            >
              <Ionicons name="close" size={20} color="#a1a1aa" />
            </Pressable>
          </View>

          <View className="flex-col gap-5">
            <SocialSelector type={socialType} setType={setSocialType} />
            <InOrOutSelector
              inOrOut={modality}
              setInOrOut={setModality}
              setLocation={setLocation}
            />

            <View className="flex-row gap-4">
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

            {/* Micro-copy guiding the user */}
            <View className="items-center mt-2 mb-1">
              <Text className="text-zinc-500 text-[11px] uppercase font-bold tracking-widest">
                Tap to select • Press & Hold to refine
              </Text>
            </View>

            {/* THE NEW, SELF-MANAGING TAG COMPONENT */}
            <ActivityTagsSelector
              mode="plan"
              taxonomy={TAG_TAXONOMY}
              classes={activityClasses}
              onTagsChange={(newTags) => setSelectedTags(newTags)}
            />

            <Pressable
              onPress={
                timeline ? () => router.push("/active-date") : handleGenerate
              }
              className={`w-full h-[50px] justify-center rounded-[10px] mt-6 bg-blue-600`}
            >
              <Text className="text-center text-white font-semibold text-[18px]">
                {timeline ? "Activity in Progress" : "Start Planning"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

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

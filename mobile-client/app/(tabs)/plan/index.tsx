import ActivityTagsSelector from "@/components/home/ActivityTagsSelector";
import BudgetInput from "@/components/home/BudgetInput";
import InOrOutSelector from "@/components/home/InOrOutSelector";
import SocialSelector from "@/components/home/SocialSelector";
import React, {useEffect, useRef, useState, useCallback} from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  Alert,
  TextInput,
  Platform,
  StatusBar,
  Modal,
  ActivityIndicator,
} from "react-native";
import {useFocusEffect, useRouter} from "expo-router";
import {SafeAreaView} from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import {Ionicons} from "@expo/vector-icons";
import * as Location from "expo-location";

import {ActivityLocation} from "@/types/itinerary";
import {SimpleLocation} from "@/types/activities";
import {usePrefsStore} from "@/src/store/usePrefsStore";
import {useActiveDateStore} from "@/src/store/activeDateStore";
import {useBuilderStore} from "@/src/store/useBuilderStore";

// IMPORT SHARED CONSTANTS
import {
  TAG_TAXONOMY,
  BASE_ACTIVITY_CLASSES,
  DATE_ACTIVITY_CLASS,
} from "@/src/constants/tags";

export default function PlanScreen() {
  const router = useRouter();
  const {prefs, setPrefs, resetPrefs, draftUpdatedAt} = usePrefsStore();
  const timeline = useActiveDateStore((state) => state.timeline);
  const clearBuilder = useBuilderStore((state) => state.clearBuilder);

  // If there is a timestamp, they have an active draft!
  const hasActiveDraft = !!draftUpdatedAt;

  const getRoundedDate = (date = new Date()) => {
    const minutes = 15;
    const ms = 1000 * 60 * minutes;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  };

  // --- STALE DATA CHECK ---
  useFocusEffect(
    useCallback(() => {
      const storedEndDate = new Date(prefs.endDate);
      if (storedEndDate < new Date()) {
        resetPrefs();
      }
    }, [prefs.endDate, resetPrefs]),
  );

  // --- LOCAL FORM STATE ---
  const [socialType, setSocialType] = useState("Date");
  const [modality, setModality] = useState<ActivityLocation>(
    ActivityLocation.StayIn,
  );
  const [location, setLocation] = useState<SimpleLocation | null>(null);

  const [startDate, setStartDate] = useState(getRoundedDate(new Date()));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(
    getRoundedDate(new Date()),
  );

  const [durationHours, setDurationHours] = useState<number | null>(4);

  const [budgetTier, setBudgetTier] = useState<number>(50);
  const [isCustomBudget, setIsCustomBudget] = useState<boolean>(false);
  const [customBudget, setCustomBudget] = useState<number | null>(null);
  const budgetRef = useRef<TextInput | null>(null);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState<number>(0);

  const resetLocalForm = () => {
    const roundedNow = getRoundedDate(new Date());
    setSocialType("Date");
    setModality(ActivityLocation.StayIn);
    setLocation(null);
    setStartDate(roundedNow);
    setTempStartDate(roundedNow);
    setDurationHours(4);
    setBudgetTier(50);
    setIsCustomBudget(false);
    setCustomBudget(null);
    setSelectedTags([]);
    setResetKey((prev) => prev + 1); // <-- Add this to force child remount
  };

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
    const dateToUse =
      selectedDate instanceof Date
        ? selectedDate
        : event instanceof Date
          ? event
          : undefined;

    if (dateToUse) {
      if (Platform.OS === "android") {
        setShowStartPicker(false);
        setStartDate(dateToUse);
      } else {
        setTempStartDate(dateToUse);
      }
    }
  };

  const handleDismiss = () => {
    if (Platform.OS === "android") {
      setShowStartPicker(false);
    }
  };

  const handleDiscard = () => {
    resetPrefs(); // Clears dates/budget/banner
    clearBuilder(); // Clears the half-built itinerary
  };

  const handleGenerate = async () => {
    if (
      isCustomBudget &&
      customBudget !== 0 &&
      !customBudget &&
      budgetRef.current
    ) {
      budgetRef.current.focus();
      return;
    }

    handleDiscard();

    let activeLocation = location;

    // Just-in-Time Location Fetching if modality is GO_OUT and location is missing
    if (modality === ActivityLocation.GoOut && !activeLocation) {
      setIsLocating(true);
      try {
        const {status} = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Location Required",
            "Please allow location access to find nearby activities.",
          );
          setIsLocating(false);
          return;
        }

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        activeLocation = {
          latitude: currentPosition.coords.latitude,
          longitude: currentPosition.coords.longitude,
        };

        setLocation(activeLocation);
      } catch (error) {
        console.error("Location fetch error:", error);
        Alert.alert(
          "Location Error",
          "Could not determine your location. Please check your settings.",
        );
        setIsLocating(false);
        return;
      } finally {
        setIsLocating(false);
      }
    }

    const hoursToPlan = durationHours === null ? 12 : durationHours;
    const computedEndDate = new Date(
      startDate.getTime() + hoursToPlan * 60 * 60 * 1000,
    );
    const computedHeadCount =
      socialType === "Date" ? 2 : socialType === "Solo" ? 1 : 4;
    const finalBudget = isCustomBudget ? customBudget || 0 : budgetTier;

    // Save configuration to Zustand
    setPrefs({
      socialType,
      modality: modality === ActivityLocation.GoOut ? "GO_OUT" : "STAY_IN",
      startDate: startDate.toISOString(),
      endDate: computedEndDate.toISOString(),
      currentLocation: activeLocation,
      budget: finalBudget,
      vibes: selectedTags,
      headCount: computedHeadCount,
    });

    resetLocalForm();

    // PUSH to builder
    router.push("/builder");
  };

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" />

      <SafeAreaView edges={["top"]} className="bg-zinc-950/90 z-10">
        <View className="px-6 pb-4 pt-2">
          <View className="flex-row justify-between items-end">
            <Text className="text-white text-3xl font-bold tracking-tight">
              Plan
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1 bg-black"
        contentContainerClassName="px-6 pt-6 pb-32"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-col gap-8">
          {/* 🚀 THE MISSING BANNER */}
          {hasActiveDraft && (
            <View className="bg-zinc-900 border border-zinc-700 rounded-3xl p-4 shadow-lg">
              <View className="flex-row justify-between items-center mb-4">
                <View>
                  <Text className="text-white font-bold text-lg">
                    Continue Planning
                  </Text>
                  <Text className="text-zinc-400 text-sm mt-0.5">
                    {prefs.socialType} •{" "}
                    {prefs.modality === "GO_OUT" ? "Going Out" : "Staying In"}
                  </Text>
                </View>
                <Pressable
                  onPress={handleDiscard}
                  className="bg-zinc-800 px-3 py-1.5 rounded-full"
                >
                  <Text className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                    Discard
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => router.push("/builder")}
                className="bg-white rounded-2xl py-3.5 items-center active:opacity-80"
              >
                <Text className="text-black font-extrabold text-base">
                  Resume Draft
                </Text>
              </Pressable>
            </View>
          )}

          {/* Top Selectors (Social & In/Out) */}
          <View className="flex-col gap-6">
            <SocialSelector type={socialType} setType={setSocialType} />
            <InOrOutSelector
              inOrOut={modality}
              setInOrOut={setModality}
              setLocation={setLocation}
            />
          </View>

          {/* Time & Duration row */}
          <View className="flex-row gap-4">
            <Pressable
              onPress={() => {
                setTempStartDate(startDate);
                setShowStartPicker(true);
              }}
              className="flex-1 bg-zinc-900 rounded-3xl p-4 border border-zinc-800 active:bg-zinc-800 justify-center"
            >
              <View className="flex-row items-center gap-1.5 mb-1">
                <Ionicons name="calendar-outline" size={14} color="#a1a1aa" />
                <Text className="text-zinc-400 text-[11px] uppercase font-bold tracking-wider">
                  Plan For
                </Text>
              </View>
              <Text
                className="text-white font-bold text-[15px]"
                numberOfLines={1}
              >
                {formatStartDisplay(startDate)}
              </Text>
            </Pressable>

            <View className="flex-1 flex-row bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800">
              {[2, 4, 6, null].map((val) => (
                <Pressable
                  key={val === null ? "inf" : val}
                  onPress={() => setDurationHours(val)}
                  className={`flex-1 justify-center items-center ${
                    durationHours === val ? "bg-zinc-700" : "bg-transparent"
                  }`}
                >
                  <Text
                    className={`font-bold ${
                      durationHours === val
                        ? "text-white text-lg"
                        : "text-zinc-500 text-base"
                    }`}
                  >
                    {val === null ? "∞" : `${val}h`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Budget Section */}
          <View className="flex-col gap-3">
            <Text className="text-white font-bold text-lg px-1">Budget</Text>
            <View className="flex-row bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 p-1.5">
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
                  className={`flex-1 py-3 rounded-2xl items-center ${
                    !isCustomBudget && budgetTier === tier.val
                      ? "bg-zinc-700 shadow-sm shadow-black"
                      : "bg-transparent"
                  }`}
                >
                  <Text
                    className={`font-bold ${
                      !isCustomBudget && budgetTier === tier.val
                        ? "text-white"
                        : "text-zinc-500"
                    }`}
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
                className={`flex-1 py-3 rounded-2xl items-center ${
                  isCustomBudget
                    ? "bg-zinc-700 shadow-sm shadow-black"
                    : "bg-transparent"
                }`}
              >
                <Text
                  className={`font-bold ${
                    isCustomBudget ? "text-white" : "text-zinc-500"
                  }`}
                >
                  Exact
                </Text>
              </Pressable>
            </View>
            {isCustomBudget && (
              <View className="flex-row items-center justify-center animate-pulse mt-2">
                <BudgetInput
                  budget={customBudget}
                  setBudget={setCustomBudget}
                  ref={budgetRef}
                />
              </View>
            )}
          </View>

          {/* Vibes / Tags */}
          <View className="flex-col gap-3">
            <View className="flex-row justify-between items-end px-1">
              <Text className="text-white font-bold text-lg">Vibes</Text>
              <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                Tap • Hold to refine
              </Text>
            </View>
            <ActivityTagsSelector
              key={resetKey}
              mode="plan"
              taxonomy={TAG_TAXONOMY}
              classes={activityClasses}
              initialActiveTags={selectedTags}
              onTagsChange={(newTags) => setSelectedTags(newTags)}
            />
          </View>

          {/* Primary Call to Action */}
          <Pressable
            onPress={handleGenerate}
            className="w-full h-[56px] justify-center items-center rounded-2xl mt-4 bg-white shadow-xl shadow-white/10 active:opacity-80"
          >
            <Text className="text-center text-black font-extrabold text-[18px]">
              Start Planning
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* iOS Date Picker Modal (Prevents hiding under Bottom Tabs) */}
      {Platform.OS === "ios" && (
        <Modal visible={showStartPicker} transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/60">
            <Pressable
              className="absolute inset-0"
              onPress={() => setShowStartPicker(false)}
            />
            <View className="bg-zinc-950 border-t border-zinc-800 p-6 pb-12 rounded-t-3xl shadow-2xl">
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
                  <Text className="text-white font-bold text-base">Done</Text>
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
          </View>
        </Modal>
      )}

      {/* Android Date Picker */}
      {Platform.OS === "android" && showStartPicker && (
        <DateTimePicker
          value={tempStartDate}
          mode="datetime"
          display="spinner"
          minimumDate={new Date()}
          minuteInterval={15}
          onValueChange={handleDateChange} // <-- Changed from onChange
          onDismiss={handleDismiss} // <-- Added this
          textColor="white"
        />
      )}
    </View>
  );
}

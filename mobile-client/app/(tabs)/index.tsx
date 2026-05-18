import ActivityTagsSelector from "@/components/home/ActivityTagsSelector";
import * as Haptics from "expo-haptics";
import BudgetInput from "@/components/home/BudgetInput";
import InOrOutSelector from "@/components/home/InOrOutSelector";
import LocationSelector from "@/components/home/LocationSelector";
import HeadCountInput from "@/components/home/NumberInput";
import {useEffect, useRef, useState} from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Alert,
} from "react-native";
import Greeting from "../../components/home/Greeting";
import SocialSelector from "../../components/home/SocialSelector";
import StartEndDateTime from "../../components/home/StartEndDateTime";
import {ActivityLocation} from "../../types/itinerary";
import {useRouter} from "expo-router";
import {SimpleLocation} from "../../types/itinerary";
import {usePrefsStore} from "../../store/usePrefsStore";
import {useActiveDateStore} from "@/store/activeDateStore";

export default function HomeScreen() {
  const TAG_TAXONOMY: Record<string, string[]> = {
    Food: ["casual", "fancy", "sweets", "soda", "cafes"], // 1: Food
    Active: ["nature", "stroll", "games", "sweat", "seasonal"], // 2: Active
    Shows: ["film", "music", "comedy", "stage", "arts"], // 3: Shows
    Close: ["intimate", "quiet", "create", "views", "spa"], // 4: Close / Cozy
  };

  const router = useRouter();

  // 2. Grab the setter function from Zustand
  const setPrefs = usePrefsStore((state) => state.setPrefs);

  const getRoundedDate = (date = new Date()) => {
    const minutes = 15;
    const ms = 1000 * 60 * minutes;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  };

  // --- STATE VARIABLES (Staging Area) ---

  // Is there a date currently underway?
  const timeline = useActiveDateStore((state) => state.timeline);
  // ------------------------------------

  const [socialType, setSocialType] = useState("Date");
  const [modality, setModality] = useState<ActivityLocation>(
    ActivityLocation.StayIn,
  );
  const [startDate, setStartDate] = useState(getRoundedDate());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [location, setLocation] = useState<SimpleLocation | null>(null);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [budget, setBudget] = useState<number | null>(null);
  const [headCount, setHeadCount] = useState<number>(2);
  const [selectedTagClasses, setSelectedTagClasses] = useState<number[]>([1]);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    TAG_TAXONOMY["Food"] || [],
  );
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null);

  // For testing to ensure tag selection is working
  useEffect(() => {
    console.log("FRESH TAGS:", selectedTags);
  }, [selectedTags]);
  // ----

  const budgetRef = useRef<TextInput | null>(null);
  const headCountRef = useRef<TextInput | null>(null);

  const lastActivityElement =
    socialType === "Date"
      ? {
          id: 4,
          name: "Close",
          icon: "heart-outline",
          bg: "bg-pink-500",
          border: "border-pink-500",
          text: "text-pink-500",
          rawColor: "#EC4899", // Tailwind pink-500
        }
      : {
          id: 4,
          name: "Cozy",
          icon: "cafe-outline",
          bg: "bg-green-600",
          border: "border-green-600",
          text: "text-green-600",
          rawColor: "#16A34A", // Tailwind green-600
        };

  const activityClasses = [
    {
      id: 1,
      name: "Food",
      icon: "pizza-outline",
      bg: "bg-red-500",
      border: "border-red-500",
      text: "text-red-500",
      rawColor: "#EF4444", // Tailwind red-500
    },
    {
      id: 2,
      name: "Active",
      icon: "basketball-outline",
      bg: "bg-amber-500",
      border: "border-amber-500",
      text: "text-amber-500",
      rawColor: "#F59E0B", // Tailwind amber-500
    },
    {
      id: 3,
      name: "Shows",
      icon: "ticket-outline",
      bg: "bg-blue-500",
      border: "border-blue-500",
      text: "text-blue-500",
      rawColor: "#3B82F6", // Tailwind blue-500
    },
    lastActivityElement,
  ];

  const currentActivityType = activityClasses.find((activity) =>
    selectedTagClasses.includes(activity.id),
  );

  const expandedCategory = activityClasses.find(
    (a) => a.id === expandedClassId,
  );
  const lookupKey =
    expandedCategory?.name === "Cozy" ? "Close" : expandedCategory?.name;
  const tagsToRender = lookupKey ? TAG_TAXONOMY[lookupKey] : [];

  // --- THE NEW EVENT HANDLERS ---

  // Master handler for when a King Class button is clicked
  // Master handler for toggling King Classes on and off
  const handleKingClassChange = (newClassId: number) => {
    const clickedCategory = activityClasses.find((a) => a.id === newClassId);
    if (!clickedCategory) return;

    const lookupKey =
      clickedCategory.name === "Cozy" ? "Close" : clickedCategory.name;
    const categoryTags = TAG_TAXONOMY[lookupKey] || [];

    if (selectedTagClasses.includes(newClassId)) {
      // 1. REMOVE CLASS: Prevent them from deselecting the very last class
      if (selectedTagClasses.length === 1) return;
      if (expandedClassId) {
        setExpandedClassId(newClassId);
        return;
      }

      setSelectedTagClasses((prev) => prev.filter((id) => id !== newClassId));

      // Remove this specific class's tags from the selectedTags array
      setSelectedTags((prev) =>
        prev.filter((tag) => !categoryTags.includes(tag)),
      );
    } else {
      // 2. ADD CLASS: Add the new class ID
      setSelectedTagClasses((prev) => [...prev, newClassId]);

      // Instantly add all of its default child tags
      // Using Set prevents any weird duplicate tags if taxonomies ever overlap
      setSelectedTags((prev) =>
        Array.from(new Set([...prev, ...categoryTags])),
      );

      expandedClassId && setExpandedClassId(newClassId);
    }
  };

  // Handler for turning individual sub-tags on and off
  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      // Prevent them from deselecting the very last tag
      if (selectedTags.length === 1) return;

      const nextTags = selectedTags.filter((t) => t !== tag);
      setSelectedTags(nextTags);

      setSelectedTagClasses((prevClasses) =>
        prevClasses.filter((classId) => {
          const category = activityClasses.find((a) => a.id === classId);
          const lookupKey =
            category?.name === "Cozy" ? "Close" : category?.name;
          const categoryTags = lookupKey ? TAG_TAXONOMY[lookupKey] : [];

          return categoryTags.some((catTag) => nextTags.includes(catTag));
        }),
      );
    } else {
      setSelectedTags((prev) => [...prev, tag]);
    }
  };

  // --- THE GENERATE LOGIC ---
  const handleGenerate = () => {
    if (!endDate || endDate < startDate) {
      setShowEndPicker(true);
      return;
    }
    if (budget != 0 && !budget && budgetRef.current) {
      budgetRef.current.focus();
      return;
    }
    if (socialType != "Date" && !headCount && headCountRef.current) {
      headCountRef.current.focus();
      return;
    }

    // THE LOCATION GATEKEEPER
    if (modality === ActivityLocation.GoOut && !location) {
      Alert.alert(
        "Location Required",
        "Please select a starting location so we can find activities near you.",
      );
      return;
    }

    // Save everything directly to Zustand
    setPrefs({
      socialType,
      modality: modality === ActivityLocation.GoOut ? "GO_OUT" : "STAY_IN",
      startDate,
      endDate,
      currentLocation: location,
      travelDistance: 10,
      budget: budget || 0,
      vibes: selectedTags, // Sends their curated list of tags to the engine!
      headCount: socialType === "Date" ? 2 : headCount,
    });

    // Navigate cleanly
    router.push("../builder");
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="justify-start items-center h-full"
    >
      <View className="absolute top-[-1000px] left-0 right-0 h-[1000px] bg-zinc-800" />
      <View className="w-full bg-zinc-800 rounded-b-4xl p-[25px] pt-15">
        <Greeting />
        <View className="mt-[30px]">
          <View className="flex-col gap-[25px]">
            <SocialSelector type={socialType} setType={setSocialType} />
            <View className="w-full flex flex-col gap-[15px]">
              <InOrOutSelector
                inOrOut={modality}
                setInOrOut={setModality}
                setLocation={setLocation}
              />
              <StartEndDateTime
                showEndPicker={showEndPicker}
                setShowEndPicker={setShowEndPicker}
                setStart={setStartDate}
                setEnd={setEndDate}
                start={startDate}
                end={endDate}
              />
              {modality == ActivityLocation.GoOut && (
                <LocationSelector
                  location={location}
                  setLocation={setLocation}
                />
              )}
              <View className="flex flex-row gap-5">
                <BudgetInput
                  budget={budget}
                  setBudget={setBudget}
                  ref={budgetRef}
                />
                {socialType != "Date" && (
                  <HeadCountInput
                    placeholder="Head Count"
                    headCount={headCount}
                    setHeadCount={setHeadCount}
                    ref={headCountRef}
                  />
                )}
              </View>

              {/* Main King Class Selector */}
              <ActivityTagsSelector
                taxonomy={TAG_TAXONOMY}
                classes={activityClasses}
                selectedTagClasses={selectedTagClasses}
                setSelectedClass={handleKingClassChange}
                activeTags={selectedTags}
                // Pass the new long-press handler
                onLongPressClass={(id) => {
                  // If they hold the one that's already open, close it. Otherwise, open it.
                  setExpandedClassId((prevId) => (prevId === id ? null : id));
                }}
              />
              {expandedClassId && (
                <View className="w-full flex-row flex-wrap justify-center gap-3 mt-2 bg-zinc-900/80 p-5 rounded-2xl border border-zinc-700">
                  {tagsToRender.map((tag) => {
                    const isSelected = selectedTags.includes(tag);

                    // Grab the full class object
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
                            ? `${categoryTheme?.bg} border-transparent` // Solid background if selected
                            : `bg-transparent ${categoryTheme?.border}` // Colored border if not selected
                        }`}
                      >
                        <Text
                          className={`text-[14px] font-medium ${
                            isSelected ? "text-white" : categoryTheme?.text // Colored text if not selected
                          }`}
                        >
                          {tag.charAt(0).toUpperCase() + tag.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Generate Button */}
            <Pressable
              onPress={
                timeline ? () => router.push("/active-date") : handleGenerate
              }
              className={`w-full h-[50px] justify-center rounded-[10px] mt-4 ${currentActivityType?.bg}`}
            >
              <Text className="text-center text-white font-semibold text-[18px]">
                {timeline ? "Activity in Progress" : "Schedule"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

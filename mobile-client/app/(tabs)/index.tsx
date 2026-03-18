import ActivityTypeSelector from "@/components/home/ActivityTypeSelector";
import BudgetInput from "@/components/home/BudgetInput";
import InOrOutSelector from "@/components/home/InOrOutSelector";
import LocationSelector from "@/components/home/LocationSelector";
import HeadCountInput from "@/components/home/NumberInput";
import {useEffect, useRef, useState} from "react";
import {Pressable, ScrollView, Text, TextInput, View} from "react-native";
import Greeting from "../../components/home/Greeting";
import SocialSelector from "../../components/home/SocialSelector";
import StartEndDateTime from "../../components/home/StartEndDateTime";
import {ActivityLocation} from "../../types/itinerary";
import {useRouter} from "expo-router";
import {SimpleLocation} from "../../types/itinerary";

export default function HomeScreen() {
  const router = useRouter();

  const getRoundedDate = (date = new Date()) => {
    const minutes = 15;
    const ms = 1000 * 60 * minutes; // 15 minutes in milliseconds
    // Math.ceil rounds UP to the next 15-minute block
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  };

  // --- STATE VARIABLES ---
  const [socialType, setSocialType] = useState("Date");
  const [locationType, setLocationType] = useState<ActivityLocation>(
    ActivityLocation.StayIn,
  );
  const [startDate, setStartDate] = useState(getRoundedDate());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [location, setLocation] = useState<SimpleLocation | null>(null);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [budget, setBudget] = useState<number | null>(null);
  const [headCount, setHeadCount] = useState<number>(2);
  const [selectedActivityType, setSelectedActivityType] = useState(1);
  const budgetRef = useRef<TextInput | null>(null);
  const headCountRef = useRef<TextInput | null>(null);

  const lastActivityElement =
    socialType === "Date"
      ? {id: 4, name: "Close", icon: "heart-outline", color: "bg-pink-500"}
      : {id: 4, name: "Cozy", icon: "cafe-outline", color: "bg-green-600"};

  const activityType = [
    {id: 1, name: "Food", icon: "pizza-outline", color: "bg-red-500"},
    {id: 2, name: "Active", icon: "basketball-outline", color: "bg-amber-500"},
    {id: 3, name: "Relax", icon: "film-outline", color: "bg-blue-500"},
    lastActivityElement,
  ];

  const currentActivityType = activityType.find(
    (activity) => activity.id == selectedActivityType,
  );

  // This is what happens when the generate button is pressed.
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

    // 1. Pack the preferences into a single object
    const userPrefs = {
      socialType,
      locationType, // Now using our clean Enum!
      startDate,
      endDate,
      currentLocation: location,
      travelDistance: 5,
      budget,
      vibe: currentActivityType?.name,
      headCount: socialType === "Date" ? 2 : headCount,
    };

    // 2. Navigate to the Builder
    router.push({
      pathname: "../builder",
      params: {prefs: JSON.stringify(userPrefs)},
    });
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="justify-start items-center h-full"
    >
      <View className="w-full bg-gray-700 rounded-b-4xl p-[25px] pt-15">
        <Greeting />
        <View className="mt-[30px]">
          <View className="flex-col gap-[25px]">
            <SocialSelector type={socialType} setType={setSocialType} />
            <View className="w-full flex flex-col gap-[15px]">
              <InOrOutSelector
                inOrOut={locationType}
                setInOrOut={setLocationType}
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
              {locationType == ActivityLocation.GoOut && (
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
              <ActivityTypeSelector
                activities={activityType}
                selectedType={selectedActivityType}
                setSelectedType={setSelectedActivityType}
              />
            </View>
            {/* Generate Button */}
            <Pressable
              onPress={handleGenerate}
              className={`w-full h-[50px] justify-center rounded-[10px] ${currentActivityType?.color}`}
            >
              <Text className="text-center text-white font-semibold text-[18px]">
                Generate
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

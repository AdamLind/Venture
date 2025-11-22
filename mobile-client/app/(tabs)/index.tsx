import ActivityTypeSelector from "@/components/home/ActivityTypeSelector";
import BudgetInput from "@/components/home/BudgetInput";
import InOrOutSelector from "@/components/home/InOrOutSelector";
import LocationSelector from "@/components/home/LocationSelector";
import HeadCountInput from "@/components/home/NumberInput";
import {useRef, useState} from "react";
import {Pressable, ScrollView, Text, TextInput, View} from "react-native";
import Greeting from "../../components/home/Greeting";
import SocialSelector from "../../components/home/SocialSelector";
import StartEndDateTime from "../../components/home/StartEndDateTime";

export default function HomeScreen() {
  const [socialType, setSocialType] = useState("Date");
  const [locationType, setLocationType] = useState("Stay In");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [budget, setBudget] = useState<number | null>(null);
  const [headCount, setHeadCount] = useState<number | null>(null);
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
    (activity) => activity.id == selectedActivityType
  );

  // This is what happens when the generate button is pressed. For now it just sends an alert with all the input info.
  const handleGenerate = () => {
    if (!endDate || endDate < startDate) {
      setShowEndPicker(true);
      return;
    }
    if (!budget && budgetRef.current) {
      budgetRef.current.focus();
      return;
    }
    if (socialType != "Date" && !headCount && headCountRef.current) {
      headCountRef.current.focus();
      return;
    }
    alert(
      `
This button will do something really awesome soon!

Date Details:

Relation Type: ${socialType}
In or Out: ${locationType}
Start Date: ${startDate.toLocaleString()}
End Date: ${endDate?.toLocaleString()}
Budget: ${budget}
Activity Type: ${currentActivityType?.name}
      `
    );
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
              />
              <StartEndDateTime
                showEndPicker={showEndPicker}
                setShowEndPicker={setShowEndPicker}
                setStart={setStartDate}
                setEnd={setEndDate}
                start={startDate}
                end={endDate}
              />
              {locationType == "Go Out" && <LocationSelector />}
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

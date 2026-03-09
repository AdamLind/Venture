import * as Haptics from "expo-haptics";
import {Dispatch, SetStateAction} from "react";
import {Pressable, Text, View} from "react-native";
import {ActivityLocation} from "../../types/itinerary";

export default function InOrOutSelector({
  inOrOut,
  setInOrOut,
}: {
  inOrOut: ActivityLocation;
  // This is the official type for a React State Setter
  setInOrOut: Dispatch<SetStateAction<ActivityLocation>>;
}) {
  // Map the DB value to a display label
  const locations: {label: string; value: ActivityLocation}[] = [
    {label: "Stay In", value: ActivityLocation.StayIn},
    {label: "Go Out", value: ActivityLocation.GoOut},
  ];

  const handlePress = (value: ActivityLocation) => {
    if (value != inOrOut) {
      if (process.env.EXPO_OS === "ios") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setInOrOut(value);
    }
  };

  return (
    <View className="flex flex-row items-center justify-center gap-[34px] w-full">
      {locations.map((loc) => {
        const isActive = inOrOut === loc.value;

        return (
          <Pressable
            key={loc.value}
            onPress={() => handlePress(loc.value)}
            className={`flex-grow p-[13px] m-auto border rounded-[10px] bg-gray-800 ${
              isActive ? "border-white" : "border-gray-500"
            }`}
          >
            <Text
              className={`h-6 text-[18px] text-center ${
                isActive ? "text-white font-semibold" : "text-gray-400"
              }`}
            >
              {loc.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

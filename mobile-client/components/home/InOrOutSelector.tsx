import * as Haptics from "expo-haptics";
import {Dispatch, SetStateAction} from "react";
import {Pressable, Text, View} from "react-native";

export default function InOrOutSelector({
  inOrOut,
  setInOrOut,
}: {
  inOrOut: string;
  setInOrOut: Dispatch<SetStateAction<string>>;
}) {
  const locations = ["Stay In", "Go Out"];

  return (
    <View className="flex flex-row items-center justify-center gap-[34px] w-full">
      {locations.map((location) => (
        <Pressable
          className={`flex-grow p-[13px] m-auto border border-gray rounded-[10px] bg-gray-800 ${
            inOrOut === location ? "border-white" : ""
          }`}
          key={location}
          onPress={(ev) => {
            if (process.env.EXPO_OS === "ios") {
              // Add a soft haptic feedback when pressing down on the tabs.
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            setInOrOut(location);
          }}
        >
          <Text
            className={`h-6 text-[18px] text-gray-300 text-center ${
              inOrOut === location ? "text-white" : ""
            }`}
          >
            {location}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

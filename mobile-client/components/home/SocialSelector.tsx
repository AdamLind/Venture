import * as Haptics from "expo-haptics";
import {Dispatch, SetStateAction} from "react";
import {Pressable, Text, View} from "react-native";

export default function SocialSelector({
  type,
  setType,
}: {
  type: string;
  setType: Dispatch<SetStateAction<string>>;
}) {
  const socialLevel = ["Date", "Group-Date", "Activity"];

  return (
    <View className="flex flex-row items-center justify-around ">
      {socialLevel.map((level) => (
        <Pressable
          key={level}
          onPress={(ev) => {
            if (process.env.EXPO_OS === "ios") {
              // Add a soft haptic feedback when pressing down on the tabs.
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            setType(level);
          }}
        >
          <Text
            className={`w-32 text-[18px] text-gray-300 text-center ${
              type === level ? "font-semibold text-white" : ""
            }`}
          >
            {level}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

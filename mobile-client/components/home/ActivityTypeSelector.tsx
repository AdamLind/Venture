import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Dispatch, SetStateAction } from "react";
import {Pressable, Text, View} from "react-native";

export default function ActivityTypeSelector({
  activities,
  selectedType,
  setSelectedType
}: {
  activities: Array<{id: number; name: string; icon: string; color: string}>,
  selectedType: number,
  setSelectedType: Dispatch<SetStateAction<number>>
}) {
  return (
    <View className="flex flex-row gap-[37px] justify-center">
      {activities.map((activity) => (
        <Pressable
          className="flex flex-col justify-center items-center gap-[5px]"
          key={activity.name}
          onPress={(ev) => {
            if (process.env.EXPO_OS === "ios") {
              // Add a soft haptic feedback when pressing down on the tabs.
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            setSelectedType(activity.id);
          }}
        >
          <View
            className={`h-[55px] w-[55px] rounded-[10px] flex justify-center items-center ${
              selectedType == activity.id
                ? `${activity.color}`
                : "bg-gray-800"
            }`}
          >
            <Ionicons name={activity.icon as any} color="white" size={35} />
          </View>
          <Text className={`text-white`}>{activity.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

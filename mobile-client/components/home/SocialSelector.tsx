import * as Haptics from "expo-haptics";
import {Dispatch, SetStateAction} from "react";
import {Pressable, Text, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// `value` is what the planner stores; `label` is what people see
const OPTIONS: {value: string; label: string; icon: IconName}[] = [
  {value: "Date", label: "Date", icon: "heart"},
  {value: "Group-Date", label: "Group", icon: "people"},
  {value: "Activity", label: "Activity", icon: "sparkles"},
];

export default function SocialSelector({
  type,
  setType,
}: {
  type: string;
  setType: Dispatch<SetStateAction<string>>;
}) {
  return (
    <View className="flex-row bg-zinc-900 rounded-2xl border border-zinc-800 p-1.5">
      {OPTIONS.map((option) => {
        const active = type === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (process.env.EXPO_OS === "ios") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              setType(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{selected: active}}
            className={`flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl ${
              active ? "bg-zinc-700" : ""
            }`}
          >
            <Ionicons
              name={active ? option.icon : (`${option.icon}-outline` as IconName)}
              size={16}
              color={active ? "white" : "#71717a"}
            />
            <Text
              className={`font-bold ${active ? "text-white" : "text-zinc-500"}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

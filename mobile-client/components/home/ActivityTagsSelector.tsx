import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {Pressable, Text, View} from "react-native";

export default function ActivityTypeSelector({
  taxonomy,
  classes,
  selectedTagClasses,
  activeTags, // 1. Bring in the new prop
  setSelectedClass,
  onLongPressClass,
}: {
  taxonomy: Record<string, string[]>;
  classes: Array<{
    id: number;
    name: string;
    icon: string;
    bg: string;
    border: string;
    text: string;
    rawColor: string;
  }>;
  selectedTagClasses: number[];
  activeTags: string[]; // 1. Type the new prop
  setSelectedClass: (newClassId: number) => void;
  onLongPressClass: (id: number) => void;
}) {
  return (
    <View className="flex flex-row gap-[37px] justify-center">
      {classes.map((tagClass) => {
        // --- MATH: Calculate the Badge Number ---
        const lookupKey = tagClass.name === "Cozy" ? "Close" : tagClass.name;
        const categoryTags = taxonomy[lookupKey] || [];

        // Count how many tags from this specific category are currently active
        const activeCount = categoryTags.filter((tag) =>
          activeTags.includes(tag),
        ).length;
        const totalTags = categoryTags.length;

        // Only show the badge if they have selected at least 1, but NOT all of them
        const showBadge = activeCount > 0 && activeCount < totalTags;
        const isSelected = selectedTagClasses.includes(tagClass.id);

        return (
          <Pressable
            className="flex flex-col justify-center items-center gap-[5px]"
            key={tagClass.name}
            onPress={() => {
              if (process.env.EXPO_OS === "ios") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              setSelectedClass(tagClass.id);
            }}
            onLongPress={() => {
              if (process.env.EXPO_OS === "ios") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
              }
              onLongPressClass(tagClass.id);
            }}
            delayLongPress={500}
          >
            {/* The Icon Box */}
            <View
              className={`h-[55px] w-[55px] rounded-[10px] flex justify-center items-center relative ${
                showBadge
                  ? `border-2 ${tagClass.border} bg-zinc-900`
                  : isSelected
                    ? tagClass.bg
                    : "bg-zinc-900"
              }`}
            >
              {/* --- NEW: The Notification Pin --- */}
              {showBadge && (
                <View
                  className={`absolute -top-2 -right-2 bg-zinc-950 border-2 ${tagClass.border} w-6 h-6 rounded-full flex items-center justify-center z-10`}
                >
                  {/* Using the tagClass.text dynamically colors the number to match the button! */}
                  <Text className={`text-[11px] font-bold ${tagClass.text}`}>
                    {activeCount}
                  </Text>
                </View>
              )}

              <Ionicons
                name={tagClass.icon as any}
                color={`${showBadge ? tagClass.rawColor : "white"}`}
                size={35}
              />
            </View>

            {/* --- UI UPGRADE: Color the text if the class is selected! --- */}
            <Text
              className={`font-medium ${isSelected ? tagClass.text : "text-zinc-400"}`}
            >
              {tagClass.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

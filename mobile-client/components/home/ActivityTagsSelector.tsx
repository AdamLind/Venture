import React, {useState} from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {Pressable, Text, View} from "react-native";

export default function ActivityTagsSelector({
  mode = "plan",
  taxonomy,
  classes,
  initialActiveTags = [],
  onTagsChange,
}: {
  mode?: "plan" | "publish";
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
  initialActiveTags?: string[];
  onTagsChange: (tags: string[]) => void;
}) {
  const [activeTags, setActiveTags] = useState<string[]>(initialActiveTags);

  const [expandedClassId, setExpandedClassId] = useState<number | null>(
    mode === "publish" ? classes[0]?.id : null,
  );

  // 🔥 THE MAGIC: We calculate this dynamically instead of tracking it in state.
  // If activeTags has EVERY tag from a category, that category ID goes in here automatically!
  const selectedTagClasses = classes
    .filter((tagClass) => {
      const categoryTags = taxonomy[tagClass.name] || [];
      return (
        categoryTags.length > 0 &&
        categoryTags.every((tag) => activeTags.includes(tag))
      );
    })
    .map((c) => c.id);

  const handleKingClassChange = (newClassId: number) => {
    const clickedCategory = classes.find((a) => a.id === newClassId);
    if (!clickedCategory) return;

    const categoryTags = taxonomy[clickedCategory.name] || [];
    const isCurrentlyExpanded = expandedClassId === newClassId;
    const isActive = selectedTagClasses.includes(newClassId);

    // --- SCENARIO 1: BROWSING / TAB SWITCHING ---
    // If a drawer is open and they tap a DIFFERENT category, just switch the drawer.
    // Do NOT select or deselect any tags.
    if (expandedClassId !== null && !isCurrentlyExpanded) {
      setExpandedClassId(newClassId);
      return;
    }

    // --- SCENARIO 2: TOGGLING ---
    // If we reach here, they either tapped a closed category, OR tapped the currently open one.
    if (isActive) {
      // TURN OFF (It's already fully selected, so empty it)
      const nextTags = activeTags.filter((tag) => !categoryTags.includes(tag));
      setActiveTags(nextTags);
      onTagsChange(nextTags);
    } else {
      // TURN ON (Select everything in this category)
      const nextTags = Array.from(new Set([...activeTags, ...categoryTags]));
      setActiveTags(nextTags);
      onTagsChange(nextTags);
    }
  };

  const toggleTag = (tag: string) => {
    let nextTags;
    if (activeTags.includes(tag)) {
      nextTags = activeTags.filter((t) => t !== tag);
    } else {
      nextTags = [...activeTags, tag];
    }
    setActiveTags(nextTags);
    onTagsChange(nextTags);
  };

  const expandedCategory = classes.find((a) => a.id === expandedClassId);
  const tagsToRender = expandedCategory
    ? taxonomy[expandedCategory.name] || []
    : [];

  return (
    <View className="flex flex-col items-center w-full">
      {/* TOP ROW: THE BIG ICONS */}
      <View className="flex flex-row gap-[37px] justify-center w-full">
        {classes.map((tagClass) => {
          const categoryTags = taxonomy[tagClass.name] || [];
          const activeCount = categoryTags.filter((tag) =>
            activeTags.includes(tag),
          ).length;

          const isIconFilled =
            mode === "plan"
              ? selectedTagClasses.includes(tagClass.id)
              : expandedClassId === tagClass.id;

          const totalTags = categoryTags.length;
          const showBadge =
            mode === "plan"
              ? activeCount > 0 && activeCount < totalTags
              : activeCount > 0 && !isIconFilled;

          // I loved your logic here for showing the outline when a drawer is open!
          const borderOnly = expandedClassId === tagClass.id;

          return (
            <Pressable
              className="flex flex-col justify-center items-center gap-[5px]"
              key={tagClass.name}
              onPress={() => {
                if (process.env.EXPO_OS === "ios")
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

                if (mode === "plan") {
                  handleKingClassChange(tagClass.id);
                } else {
                  setExpandedClassId(tagClass.id);
                }
              }}
              onLongPress={
                mode === "plan"
                  ? () => {
                      if (process.env.EXPO_OS === "ios")
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
                      setExpandedClassId((prev) =>
                        prev === tagClass.id ? null : tagClass.id,
                      );
                    }
                  : undefined
              }
              delayLongPress={500}
            >
              <View
                className={`h-[55px] w-[55px] rounded-[10px] flex justify-center items-center relative ${
                  showBadge || (borderOnly && !isIconFilled)
                    ? `border-2 ${tagClass.border} bg-zinc-900`
                    : isIconFilled
                      ? tagClass.bg
                      : "bg-zinc-900"
                }`}
              >
                {showBadge && (
                  <View
                    className={`absolute -top-2 -right-2 bg-zinc-950 border-2 ${tagClass.border} w-6 h-6 rounded-full flex items-center justify-center z-10`}
                  >
                    <Text className={`text-[11px] font-bold ${tagClass.text}`}>
                      {activeCount}
                    </Text>
                  </View>
                )}
                <Ionicons
                  name={tagClass.icon as any}
                  color={`${showBadge || (borderOnly && !isIconFilled) ? tagClass.rawColor : "white"}`}
                  size={35}
                />
              </View>

              <View className="flex-row items-center gap-1 mt-1">
                <Text
                  className={`font-medium ${isIconFilled ? tagClass.text : "text-zinc-400"}`}
                >
                  {tagClass.name}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* BOTTOM ROW: THE EXPANDED PILLS */}
      {expandedClassId && expandedCategory && tagsToRender.length > 0 && (
        <View className="w-full flex-row flex-wrap justify-center gap-3 mt-6 bg-zinc-900/80 p-5 rounded-2xl border border-zinc-700">
          {tagsToRender.map((tag) => {
            const isSelected = activeTags.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => {
                  if (process.env.EXPO_OS === "ios")
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleTag(tag);
                }}
                className={`px-4 py-2 rounded-full border ${
                  isSelected
                    ? `${expandedCategory.bg} border-transparent`
                    : `bg-transparent ${expandedCategory.border}`
                }`}
              >
                <Text
                  className={`text-[14px] font-medium ${isSelected ? "text-white" : expandedCategory.text}`}
                >
                  {tag.charAt(0).toUpperCase() + tag.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

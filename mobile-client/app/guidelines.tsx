// app/guidelines.tsx
// What makes a good idea (#85). Opened from the post form, from a sent-back
// idea's note (with the rules it cited highlighted), and by staff from the
// review panel; staff also see how to decide. A sheet, so it opens over the
// post form. The text lives in src/lib/ideaGuidelines.ts.

import React, {useRef} from "react";
import {Pressable, ScrollView, Text, View} from "react-native";
import {useLocalSearchParams, useRouter} from "expo-router";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Ionicons} from "@expo/vector-icons";

import {
  GREAT_TIPS,
  GUIDELINES_SHORT,
  MOD_DECISIONS,
  MOD_PRINCIPLES,
  PRIVATE_NOTE,
  RULES,
  isRuleId,
} from "@/src/lib/ideaGuidelines";
import {useStaffStore} from "@/src/store/useStaffStore";

const ACCENT = "#FF9D0A";
/** The review's color for cited rules */
const CITED = "#fb923c";
const STAFF_COLOR = "#a78bfa";

export default function GuidelinesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isStaff = useStaffStore((s) => !!s.role);
  // ?rules=honest,doable: the rules a review cited
  const {rules: rulesParam} = useLocalSearchParams<{rules?: string}>();
  const cited = new Set((rulesParam ?? "").split(",").filter(isRuleId));

  // Scroll to the first cited rule once it's laid out
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const listY = useRef(0);
  const scrolled = useRef(false);
  const firstCited = RULES.find((r) => cited.has(r.id))?.id;

  return (
    <View className="flex-1 bg-zinc-950">
      <View className="flex-row items-center px-5 pt-5 pb-3 border-b border-zinc-900">
        <View className="flex-1" />
        <Text className="text-white font-bold text-base" numberOfLines={1}>
          Idea guidelines
        </Text>
        <View className="flex-1 items-end">
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
            <Text className="font-bold text-base" style={{color: ACCENT}}>
              Done
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerClassName="px-5 pt-6 gap-8"
        contentContainerStyle={{paddingBottom: insets.bottom + 40}}
      >
        {/* THE SHORT VERSION */}
        <View className="gap-3">
          <Text className="text-white font-black text-3xl tracking-tight">What makes a good idea</Text>
          <View className="flex-row gap-3">
            <View className="w-1 rounded-full" style={{backgroundColor: ACCENT}} />
            <Text className="text-zinc-100 text-lg leading-7 flex-1">{GUIDELINES_SHORT}</Text>
          </View>
          <View className="flex-row items-center gap-2 mt-1">
            <Ionicons name="lock-closed" size={13} color="#71717a" />
            <Text className="text-zinc-500 text-sm flex-1">{PRIVATE_NOTE}</Text>
          </View>
        </View>

        {/* THE RULES */}
        <View
          className="gap-3"
          onLayout={(e) => {
            listY.current = e.nativeEvent.layout.y;
          }}
        >
          <Text className="text-zinc-400 text-sm font-bold ml-1">EVERY PUBLISHED IDEA</Text>
          {RULES.map((rule, i) => {
            const isCited = cited.has(rule.id);
            return (
              <View
                key={rule.id}
                onLayout={(e) => {
                  if (rule.id !== firstCited || scrolled.current) return;
                  scrolled.current = true;
                  const ruleY = e.nativeEvent.layout.y;
                  // Next frame: the list's own layout (its offset) is in by then
                  requestAnimationFrame(() =>
                    scrollRef.current?.scrollTo({y: listY.current + ruleY - 16, animated: true}),
                  );
                }}
                className="rounded-3xl p-4 border gap-2"
                style={{
                  backgroundColor: isCited ? `${CITED}14` : "#18181b",
                  borderColor: isCited ? `${CITED}88` : "#27272a",
                }}
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-9 h-9 rounded-full items-center justify-center"
                    style={{backgroundColor: `${isCited ? CITED : ACCENT}22`}}
                  >
                    <Ionicons name={rule.icon} size={18} color={isCited ? CITED : ACCENT} />
                  </View>
                  <Text className="text-white font-bold text-base flex-1">
                    {i + 1}. {rule.title}
                  </Text>
                  {isCited && (
                    <Text className="text-xs font-bold" style={{color: CITED}}>
                      FROM YOUR REVIEW
                    </Text>
                  )}
                </View>
                <Text className="text-zinc-300 text-[15px] leading-6">{rule.body}</Text>
                {rule.points?.map((point) => (
                  <View key={point} className="flex-row gap-2 pl-1">
                    <Text className="text-zinc-500 text-sm">•</Text>
                    <Text className="text-zinc-400 text-sm leading-5 flex-1">{point}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        {/* NICE TO HAVE */}
        <View className="gap-3">
          <Text className="text-zinc-400 text-sm font-bold ml-1">WHAT MAKES ONE GREAT</Text>
          <View className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 gap-3">
            {GREAT_TIPS.map((tip) => (
              <View key={tip} className="flex-row gap-3">
                <Ionicons name="star" size={15} color={ACCENT} style={{marginTop: 2}} />
                <Text className="text-zinc-300 text-[15px] leading-6 flex-1">{tip}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* STAFF: HOW TO DECIDE */}
        {isStaff && (
          <View className="gap-3">
            <View className="flex-row items-center gap-2 ml-1">
              <Ionicons name="shield-checkmark" size={14} color={STAFF_COLOR} />
              <Text className="text-sm font-bold" style={{color: STAFF_COLOR}}>
                FOR MODERATORS
              </Text>
            </View>
            <View
              className="rounded-3xl p-4 border gap-4"
              style={{backgroundColor: `${STAFF_COLOR}10`, borderColor: `${STAFF_COLOR}55`}}
            >
              {MOD_DECISIONS.map((d) => (
                <View key={d.label} className="gap-1">
                  <View className="flex-row items-center gap-2">
                    <View className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: d.color}} />
                    <Text className="font-bold text-base" style={{color: d.color}}>
                      {d.label}
                    </Text>
                  </View>
                  <Text className="text-zinc-300 text-sm leading-5">{d.when}</Text>
                </View>
              ))}
              <View className="gap-2 pt-3 border-t border-zinc-800">
                {MOD_PRINCIPLES.map((p) => (
                  <View key={p} className="flex-row gap-2">
                    <Text className="text-zinc-500 text-sm">•</Text>
                    <Text className="text-zinc-300 text-sm leading-5 flex-1">{p}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// components/builder/SmartOrderCard.tsx
// "A better order fixes 2 problems": the smart reorder card (utils/smartOrder.ts),
// in the builder and on the rest of a live date. Tap the text to see what
// the new order fixes, anything new it costs, miles saved and the order.

import React, {useState} from "react";
import {LayoutAnimation, Pressable, Text, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";

import {PROBLEM_ICON, formatMinutes} from "@/components/builder/BuilderParts";
import {smartOrderSummary, type SmartOrderResult} from "@/utils/smartOrder";

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});

export default function SmartOrderCard({
  result,
  onApply,
  titleOf,
}: {
  /** Shown only when it found a clearly better order */
  result: SmartOrderResult | null;
  onApply: () => void;
  /** A stop's title, for "Gelato: Right before a meal" */
  titleOf: (ideaId: number | null) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const summary = result ? smartOrderSummary(result) : null;
  if (!result || !summary) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };
  const apply = () => {
    setOpen(false);
    onApply();
  };

  return (
    <View className="mx-5 mb-3 bg-blue-600/10 border border-blue-500/30 rounded-2xl">
      <View className="flex-row items-center gap-3 pl-4 pr-2 py-2">
        {/* Tap the text to see what changes */}
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityState={{expanded: open}}
          accessibilityHint="Shows what the new order fixes"
          className="flex-1 flex-row items-center gap-3 active:opacity-70"
        >
          <Ionicons name="sparkles" size={18} color="#60a5fa" />
          <Text className="flex-1 text-zinc-200 text-sm">{summary}</Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color="#a1a1aa"
          />
        </Pressable>
        <Pressable
          onPress={apply}
          accessibilityRole="button"
          accessibilityLabel="Use the better order"
          className="bg-blue-500 rounded-full px-4 py-2 active:opacity-80"
        >
          <Text className="text-white font-bold text-sm">
            {result.fixed.length > 0 ? "Fix order" : "Reorder"}
          </Text>
        </Pressable>
      </View>

      {/* What changes: the fixes, anything new it costs, the order */}
      {open && (
        <View className="border-t border-blue-500/30 px-4 pt-3 pb-3.5 gap-2">
          {result.fixed.map((issue) => {
            const title = titleOf(issue.stopId);
            return (
              <View key={`fixed-${issue.kind}-${issue.stopId ?? ""}`} className="flex-row items-center gap-2">
                <Ionicons name="checkmark-circle" size={16} color="#4ade80" />
                <Ionicons
                  name={PROBLEM_ICON[issue.kind] ?? "alert-circle-outline"}
                  size={14}
                  color="#a1a1aa"
                />
                <Text className="flex-1 text-zinc-300 text-sm">
                  {title ? <Text className="text-white font-semibold">{title}: </Text> : null}
                  {issue.message}
                </Text>
              </View>
            );
          })}
          {result.milesSaved >= 0.5 && (
            <View className="flex-row items-center gap-2">
              <Ionicons name="checkmark-circle" size={16} color="#4ade80" />
              <Ionicons name="car-outline" size={14} color="#a1a1aa" />
              <Text className="flex-1 text-zinc-300 text-sm">
                {result.milesSaved.toFixed(1)} mi less driving
              </Text>
            </View>
          )}
          {/* When the day ends: sooner is a plus, later is a cost to weigh */}
          {result.endShiftMinutes <= -5 && (
            <View className="flex-row items-center gap-2">
              <Ionicons name="checkmark-circle" size={16} color="#4ade80" />
              <Ionicons name="time-outline" size={14} color="#a1a1aa" />
              <Text className="flex-1 text-zinc-300 text-sm">
                Ends {formatMinutes(-result.endShiftMinutes)} sooner · {clock(result.endsAt)}
              </Text>
            </View>
          )}
          {result.endShiftMinutes >= 5 && (
            <View className="flex-row items-center gap-2">
              <Ionicons name="alert-circle-outline" size={16} color="#fb923c" />
              <Ionicons name="time-outline" size={14} color="#a1a1aa" />
              <Text className="flex-1 text-orange-200 text-sm">
                Ends {formatMinutes(result.endShiftMinutes)} later · {clock(result.endsAt)}
              </Text>
            </View>
          )}
          {result.introduced.map((issue) => {
            const title = titleOf(issue.stopId);
            return (
              <View key={`new-${issue.kind}-${issue.stopId ?? ""}`} className="flex-row items-center gap-2">
                <Ionicons name="alert-circle-outline" size={16} color="#fb923c" />
                <Ionicons
                  name={PROBLEM_ICON[issue.kind] ?? "alert-circle-outline"}
                  size={14}
                  color="#a1a1aa"
                />
                <Text className="flex-1 text-orange-200 text-sm">
                  New: {title ? `${title}: ` : ""}
                  {issue.message}
                </Text>
              </View>
            );
          })}
          <Text className="text-zinc-500 text-xs mt-1">
            New order: {result.order.map((p) => p.activity.title).join(" → ")}
          </Text>
        </View>
      )}
    </View>
  );
}

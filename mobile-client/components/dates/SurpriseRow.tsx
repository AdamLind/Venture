// components/dates/SurpriseRow.tsx
// "Surprise for @sam" while planning (#35): the date is saved hidden from
// your partner until you invite them or it's over. In Plan and in the
// builder's review; only with a partner.

import React from "react";
import {Switch, Text, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";

export const SURPRISE_COLOR = "#f472b6";

export default function SurpriseRow({
  partnerName,
  value,
  onChange,
}: {
  partnerName: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3 px-1">
      <Ionicons name={value ? "gift" : "gift-outline"} size={18} color={value ? SURPRISE_COLOR : "#a1a1aa"} />
      <View className="flex-1">
        <Text className="text-white font-semibold">Surprise for @{partnerName}</Text>
        <Text className="text-zinc-500 text-xs">
          {value ? "Hidden from them until you invite them or it's over" : "They'll see this date"}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{true: SURPRISE_COLOR}}
        accessibilityLabel={`Surprise for ${partnerName}`}
      />
    </View>
  );
}

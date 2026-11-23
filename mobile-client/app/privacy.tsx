// app/privacy.tsx
// The privacy policy (#76), from Settings › Help and the terms. The text is
// in src/lib/privacy.ts (a draft until a lawyer has reviewed it).

import React from "react";
import {ScrollView, Text, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {Ionicons} from "@expo/vector-icons";

import ScreenHeader from "@/components/ui/ScreenHeader";
import {PRIVACY_IS_DRAFT, PRIVACY_SECTIONS, PRIVACY_UPDATED} from "@/src/lib/privacy";
import {SUPPORT_EMAIL} from "@/src/lib/terms";

export default function PrivacyScreen() {
  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader title="Privacy policy" />
      <ScrollView contentContainerClassName="px-5 pt-4 pb-16 gap-6">
        {PRIVACY_IS_DRAFT && (
          <View className="flex-row gap-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3">
            <Ionicons name="construct-outline" size={16} color="#fbbf24" style={{marginTop: 1}} />
            <Text className="text-amber-100/80 text-sm flex-1">
              Draft policy for testing. The final version will be reviewed by a lawyer before release.
            </Text>
          </View>
        )}

        {PRIVACY_SECTIONS.map((section) => (
          <View key={section.title} className="gap-1.5">
            <Text className="text-white font-bold text-base">{section.title}</Text>
            <Text className="text-zinc-300 text-[15px] leading-6">{section.body}</Text>
          </View>
        ))}

        <View className="gap-1">
          <Text className="text-zinc-500 text-sm">
            {SUPPORT_EMAIL
              ? `Questions, or want a copy of your information? Email ${SUPPORT_EMAIL}.`
              : "Questions? A contact address is coming soon."}
          </Text>
          <Text className="text-zinc-600 text-xs">Last updated {PRIVACY_UPDATED}.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

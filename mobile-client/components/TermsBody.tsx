// components/TermsBody.tsx
// The terms of use text (src/lib/terms.ts), for the Terms screen and the
// accept gate after sign-up. The gate covers the app, so it can't open other
// pages: it says where to find them instead.

import React from "react";
import {Pressable, Text, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import {router} from "expo-router";

import {SUPPORT_EMAIL, TERMS_IS_DRAFT, TERMS_SECTIONS} from "@/src/lib/terms";

export default function TermsBody({showGuidelinesLink = true}: {showGuidelinesLink?: boolean}) {
  return (
    <View className="gap-6">
      {TERMS_IS_DRAFT && (
        <View className="flex-row gap-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3">
          <Ionicons name="construct-outline" size={16} color="#fbbf24" style={{marginTop: 1}} />
          <Text className="text-amber-100/80 text-sm flex-1">
            Draft terms for testing. The final version will be reviewed by a lawyer before release.
          </Text>
        </View>
      )}

      {TERMS_SECTIONS.map((section, i) => (
        <View key={section.title} className="gap-1.5">
          <Text className="text-white font-bold text-base">
            {i + 1}. {section.title}
          </Text>
          <Text className="text-zinc-300 text-[15px] leading-6">{section.body}</Text>
        </View>
      ))}

      {showGuidelinesLink ? (
        <View className="gap-3">
          <DocLink label="Read the privacy policy" onPress={() => router.push("/privacy")} />
          <DocLink label="Read the idea guidelines" onPress={() => router.push("/guidelines")} />
        </View>
      ) : (
        <Text className="text-zinc-400 text-sm">The privacy policy and idea guidelines are in Settings › Help.</Text>
      )}

      <Text className="text-zinc-500 text-sm">
        {SUPPORT_EMAIL ? `Questions? Email ${SUPPORT_EMAIL}.` : "Questions? A contact address is coming soon."}
      </Text>
    </View>
  );
}

function DocLink({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      className="self-start flex-row items-center gap-1 active:opacity-70"
    >
      <Text className="text-sm font-semibold" style={{color: "#FF9D0A"}}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={14} color="#FF9D0A" />
    </Pressable>
  );
}

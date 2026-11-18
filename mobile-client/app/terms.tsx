// app/terms.tsx
// Terms of use (#76), from Settings › Help. Accepting them happens in the
// gate after sign-up (components/TermsGate.tsx).

import React from "react";
import {ScrollView, Text} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";

import ScreenHeader from "@/components/ui/ScreenHeader";
import TermsBody from "@/components/TermsBody";
import {useProfileStore} from "@/src/store/useProfileStore";

export default function TermsScreen() {
  const acceptedAt = useProfileStore((s) => s.preferences?.terms_accepted_at ?? null);
  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader title="Terms of use" />
      <ScrollView contentContainerClassName="px-5 pt-4 pb-16">
        <TermsBody />
        {acceptedAt && (
          <Text className="text-zinc-600 text-xs mt-6">
            You accepted these on {new Date(acceptedAt).toLocaleDateString()}.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

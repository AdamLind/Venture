// components/TermsGate.tsx
// Covers the app until you accept the current terms of use (#76): after
// sign-up and onboarding, and again whenever TERMS_VERSION changes. The
// server records when you accepted (accept_terms()).

import React, {useState} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";

import TermsBody from "@/components/TermsBody";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {signOut} from "@/src/lib/signOut";
import {TERMS_VERSION} from "@/src/lib/terms";
import {useProfileStore} from "@/src/store/useProfileStore";
import {showError} from "@/src/lib/notify";

export default function TermsGate({updated}: {updated: boolean}) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    setSaving(true);
    const {error} = await supabase.rpc("accept_terms", {p_version: TERMS_VERSION});
    if (error) {
      setSaving(false);
      showError("Couldn't save that", friendlyError(error));
      return;
    }
    const prefs = useProfileStore.getState().preferences;
    if (prefs) {
      useProfileStore.setState({
        preferences: {...prefs, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString()},
      });
    }
  };

  return (
    <View className="absolute inset-0 bg-black" style={{paddingTop: insets.top}}>
      <ScrollView contentContainerClassName="px-6 pt-8 pb-8">
        <Text className="text-white font-black text-3xl tracking-tight mb-2">
          {updated ? "We've updated our terms" : "Before you start"}
        </Text>
        <Text className="text-zinc-400 text-base mb-8">
          {updated
            ? "Please read and accept them to keep using Venture."
            : "Venture is built on ideas people share, so here's how it works."}
        </Text>
        <TermsBody showGuidelinesLink={false} />
      </ScrollView>

      <View
        className="px-6 pt-4 border-t border-zinc-900 gap-3"
        style={{paddingBottom: insets.bottom + 12}}
      >
        <Pressable
          onPress={accept}
          disabled={saving}
          accessibilityRole="button"
          className="bg-white rounded-full py-4 items-center active:opacity-80"
        >
          {saving ? (
            <ActivityIndicator color="black" />
          ) : (
            <Text className="text-black font-extrabold text-base">I agree</Text>
          )}
        </Pressable>
        <Pressable onPress={signOut} disabled={saving} className="items-center py-1 active:opacity-70">
          <Text className="text-zinc-400 font-semibold">Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

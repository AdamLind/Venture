// app/settings/planning.tsx
import React, {useState} from "react";
import {Text, Pressable, ScrollView, ActivityIndicator} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useRouter} from "expo-router";

import ScreenHeader from "@/components/ui/ScreenHeader";
import PlanningDefaultsFields from "@/components/profile/PlanningDefaultsFields";
import {useProfileStore} from "@/src/store/useProfileStore";
import {toPlanningDefaults} from "@/src/lib/profile";
import type {PlanningDefaults} from "@/types/profile";

export default function PlanningDefaultsScreen() {
  const router = useRouter();
  const preferences = useProfileStore((s) => s.preferences);
  const updatePreferences = useProfileStore((s) => s.updatePreferences);

  const initial = toPlanningDefaults(preferences);
  const [values, setValues] = useState<PlanningDefaults>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = (Object.keys(initial) as (keyof PlanningDefaults)[]).some(
    (key) => values[key] !== initial[key],
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updatePreferences(values);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader
        title="Planning defaults"
        right={
          <Pressable onPress={save} disabled={!dirty || saving} hitSlop={8}>
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                className={`font-bold text-base ${dirty ? "text-white" : "text-zinc-600"}`}
              >
                Save
              </Text>
            )}
          </Pressable>
        }
      />
      <ScrollView
        contentContainerClassName="px-5 pt-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-zinc-400 text-base mb-8 leading-6">
          The Plan tab starts from these. You can still change anything each
          time you plan.
        </Text>
        <PlanningDefaultsFields values={values} onChange={setValues} />
        {error && <Text className="text-red-400 text-sm mt-6 px-1">{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

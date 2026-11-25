// app/onboarding/index.tsx
// Shown once after signup (until user_preferences.onboarded_at is set).
// Steps: name + username -> birthday (18+ gate) -> planning defaults.
// Each step saves as it goes, so quitting midway resumes where they left off.

import React, {useMemo, useRef, useState} from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import {Ionicons} from "@expo/vector-icons";

import IdentityFields, {
  IdentityValues,
} from "@/components/profile/IdentityFields";
import PlanningDefaultsFields from "@/components/profile/PlanningDefaultsFields";
import {useProfileStore} from "@/src/store/useProfileStore";
import {signOut} from "@/src/lib/signOut";
import {
  MIN_AGE,
  ageFrom,
  formatBirthdate,
  isPlaceholderUsername,
  toLocalDateString,
  toPlanningDefaults,
  validateUsername,
} from "@/src/lib/profile";
import type {PlanningDefaults} from "@/types/profile";
import {useRevealAboveKeyboard, type Measurable} from "@/hooks/useRevealAboveKeyboard";

type Step = "identity" | "birthday" | "defaults" | "ineligible";
const STEPS: Step[] = ["identity", "birthday", "defaults"];

// A neutral starting point for the picker that doesn't hint at the age limit
const PICKER_START = new Date(2000, 0, 1);

export default function OnboardingScreen() {
  const profile = useProfileStore((s) => s.profile);
  const preferences = useProfileStore((s) => s.preferences);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const updatePreferences = useProfileStore((s) => s.updatePreferences);

  // Resume at the first unfinished step
  const initialStep: Step = useMemo(() => {
    if (!profile?.first_name || isPlaceholderUsername(profile.username)) {
      return "identity";
    }
    if (!preferences?.birthdate) return "birthday";
    return "defaults";
    // Only computed on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useState<Step>(initialStep);
  // Inputs stay above the keyboard, and above Continue (which rides on it)
  const {scrollRef, onScroll, reveal} = useRevealAboveKeyboard();
  const footerHeight = useRef(0);
  const revealInput = (input: Measurable | null) => reveal(input, footerHeight.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [identity, setIdentity] = useState<IdentityValues>({
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    username: isPlaceholderUsername(profile?.username)
      ? ""
      : (profile?.username ?? ""),
  });
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [birthdate, setBirthdate] = useState<Date>(PICKER_START);
  const [birthdateTouched, setBirthdateTouched] = useState(false);
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  const [defaults, setDefaults] = useState<PlanningDefaults>(
    toPlanningDefaults(preferences),
  );

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  // --- STEP ACTIONS ---

  const submitIdentity = () => {
    const firstName = identity.firstName.trim();
    if (!firstName) {
      setError("Add your first name to continue.");
      return;
    }
    const usernameProblem = validateUsername(identity.username);
    setUsernameError(usernameProblem);
    if (usernameProblem) return;

    run(async () => {
      try {
        await updateProfile({
          first_name: firstName,
          last_name: identity.lastName.trim() || null,
          username: identity.username,
        });
      } catch (e) {
        // Show username problems next to the field instead of at the bottom
        const message = e instanceof Error ? e.message : "";
        if (message.toLowerCase().includes("username")) {
          setUsernameError(message);
          return;
        }
        throw e;
      }
      setStep(preferences?.birthdate ? "defaults" : "birthday");
    });
  };

  const submitBirthday = () => {
    if (!birthdateTouched) {
      setError("Pick your birthday to continue.");
      return;
    }
    if (ageFrom(birthdate) < MIN_AGE) {
      setStep("ineligible");
      return;
    }
    run(async () => {
      await updatePreferences({birthdate: toLocalDateString(birthdate)});
      setStep("defaults");
    });
  };

  // Setting onboarded_at makes the root layout send them into the app
  const finish = (saveDefaults: boolean) =>
    run(async () => {
      await updatePreferences({
        ...(saveDefaults ? defaults : {}),
        onboarded_at: new Date().toISOString(),
      });
    });

  const onPickBirthdate = (_event: unknown, date?: Date) => {
    if (Platform.OS === "android") setShowAndroidPicker(false);
    if (date) {
      setBirthdate(date);
      setBirthdateTouched(true);
      setError(null);
    }
  };

  // --- RENDER ---

  if (step === "ineligible") {
    return (
      // NativeWind doesn't map className on SafeAreaView, so layout goes in style
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#000",
          paddingHorizontal: 24,
          justifyContent: "center",
        }}
      >
        <View className="items-center gap-4">
          <View className="w-16 h-16 rounded-full bg-zinc-900 items-center justify-center">
            <Ionicons name="hourglass-outline" size={28} color="white" />
          </View>
          <Text className="text-white font-extrabold text-2xl text-center">
            {"Venture isn't available yet"}
          </Text>
          <Text className="text-zinc-400 text-base text-center leading-6">
            {`You need to be at least ${MIN_AGE} to use Venture. We haven't saved your birthday.`}
          </Text>
        </View>
        <Pressable
          onPress={signOut}
          className="bg-white rounded-2xl py-4 items-center mt-10 active:opacity-80"
        >
          <Text className="text-black font-extrabold text-base">Sign out</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const stepIndex = STEPS.indexOf(step);

  const header = {
    identity: {
      title: "What should we call you?",
      subtitle:
        "Your name is only shown to people you plan with. Your username appears on ideas you share.",
    },
    birthday: {
      title: "When's your birthday?",
      subtitle:
        "We use your age to show activities that fit you. You can't change this later, so make sure it's right.",
    },
    defaults: {
      title: "How do you like to plan?",
      subtitle:
        "These are starting points for the Plan tab. You can change them anytime in Settings.",
    },
  }[step];

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: "#000"}}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Progress + sign out */}
        <View className="flex-row items-center justify-between px-6 pt-2 pb-4">
          <View className="flex-row gap-1.5">
            {STEPS.map((s, i) => (
              <View
                key={s}
                className={`h-1.5 rounded-full ${
                  i <= stepIndex ? "bg-white w-8" : "bg-zinc-800 w-4"
                }`}
              />
            ))}
          </View>
          <Pressable onPress={signOut} hitSlop={8}>
            <Text className="text-zinc-500 font-semibold">Sign out</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          className="flex-1"
          contentContainerClassName="px-6 pb-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-white font-extrabold text-3xl tracking-tight">
            {header.title}
          </Text>
          <Text className="text-zinc-400 text-base mt-2 mb-8 leading-6">
            {header.subtitle}
          </Text>

          {step === "identity" && (
            <IdentityFields
              onInputFocus={revealInput}
              values={identity}
              onChange={(values) => {
                setIdentity(values);
                setUsernameError(null);
                setError(null);
              }}
              usernameError={usernameError}
            />
          )}

          {step === "birthday" && (
            <View className="gap-4">
              {Platform.OS === "ios" ? (
                <View className="bg-zinc-900 rounded-3xl border border-zinc-800 py-2">
                  <DateTimePicker
                    value={birthdate}
                    mode="date"
                    display="spinner"
                    maximumDate={new Date()}
                    minimumDate={new Date(1900, 0, 1)}
                    onValueChange={onPickBirthdate}
                    textColor="white"
                  />
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowAndroidPicker(true)}
                  className="bg-zinc-900 rounded-2xl border border-zinc-800 px-4 py-4 flex-row items-center justify-between"
                >
                  <Text
                    className={`text-base ${birthdateTouched ? "text-white" : "text-zinc-500"}`}
                  >
                    {birthdateTouched
                      ? formatBirthdate(toLocalDateString(birthdate))
                      : "Choose a date"}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color="#a1a1aa" />
                </Pressable>
              )}
              {Platform.OS === "android" && showAndroidPicker && (
                <DateTimePicker
                  value={birthdate}
                  mode="date"
                  maximumDate={new Date()}
                  minimumDate={new Date(1900, 0, 1)}
                  onValueChange={onPickBirthdate}
                  onDismiss={() => setShowAndroidPicker(false)}
                />
              )}
            </View>
          )}

          {step === "defaults" && (
            <PlanningDefaultsFields values={defaults} onChange={setDefaults} onInputFocus={revealInput} />
          )}

          {error && (
            <Text className="text-red-400 text-sm mt-6 px-1">{error}</Text>
          )}
        </ScrollView>

        {/* Footer actions */}
        <View
          className="px-6 pb-4 pt-2 gap-3"
          onLayout={(e) => (footerHeight.current = e.nativeEvent.layout.height)}
        >
          <Pressable
            disabled={saving}
            onPress={
              step === "identity"
                ? submitIdentity
                : step === "birthday"
                  ? submitBirthday
                  : () => finish(true)
            }
            className={`rounded-2xl h-14 items-center justify-center ${
              saving ? "bg-zinc-300" : "bg-white active:opacity-80"
            }`}
          >
            {saving ? (
              <ActivityIndicator color="black" />
            ) : (
              <Text className="text-black font-extrabold text-base">
                {step === "defaults" ? "Start exploring" : "Continue"}
              </Text>
            )}
          </Pressable>
          {step === "defaults" && (
            <Pressable
              disabled={saving}
              onPress={() => finish(false)}
              className="py-2 items-center"
            >
              <Text className="text-zinc-400 font-semibold">
                Skip for now
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

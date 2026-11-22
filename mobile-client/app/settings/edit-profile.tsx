// app/settings/edit-profile.tsx
import React, {useState} from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useRouter} from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import Toast from "react-native-toast-message";

import ScreenHeader from "@/components/ui/ScreenHeader";
import Avatar from "@/components/profile/Avatar";
import IdentityFields, {
  IdentityValues,
} from "@/components/profile/IdentityFields";
import {useProfileStore} from "@/src/store/useProfileStore";
import {formatBirthdate, validateUsername} from "@/src/lib/profile";
import {AVATAR_FULL_PX, AVATAR_THUMB_PX} from "@/src/lib/images";

export default function EditProfileScreen() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const preferences = useProfileStore((s) => s.preferences);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const uploadAvatar = useProfileStore((s) => s.uploadAvatar);

  const [values, setValues] = useState<IdentityValues>({
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    username: profile?.username ?? "",
  });
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const dirty =
    values.firstName.trim() !== (profile?.first_name ?? "") ||
    values.lastName.trim() !== (profile?.last_name ?? "") ||
    values.username !== profile?.username;

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      // Sharp full screen, light in lists (src/lib/images.ts)
      const picked = result.assets[0].uri;
      const [full, thumb] = await Promise.all([
        ImageManipulator.manipulateAsync(picked, [{resize: {width: AVATAR_FULL_PX, height: AVATAR_FULL_PX}}], {
          compress: 0.82,
          format: ImageManipulator.SaveFormat.JPEG,
        }),
        ImageManipulator.manipulateAsync(picked, [{resize: {width: AVATAR_THUMB_PX, height: AVATAR_THUMB_PX}}], {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        }),
      ]);
      await uploadAvatar(full.uri, thumb.uri);
      Toast.show({type: "success", text1: "Photo updated", position: "bottom"});
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Couldn't update your photo",
        text2: e instanceof Error ? e.message : undefined,
        position: "bottom",
      });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const firstName = values.firstName.trim();
    if (!firstName) {
      setError("First name can't be empty.");
      return;
    }
    const usernameProblem = validateUsername(values.username);
    setUsernameError(usernameProblem);
    if (usernameProblem) return;

    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        first_name: firstName,
        last_name: values.lastName.trim() || null,
        username: values.username,
      });
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      if (message.toLowerCase().includes("username")) setUsernameError(message);
      else setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader
        title="Edit profile"
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
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="px-5 pt-4 pb-16"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center mb-8">
            <Pressable
              onPress={pickAvatar}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              <Avatar profile={profile} size={112} />
              {uploading && (
                <View className="absolute inset-0 rounded-full bg-black/60 items-center justify-center">
                  <ActivityIndicator color="white" />
                </View>
              )}
            </Pressable>
            <Pressable onPress={pickAvatar} disabled={uploading} className="mt-3">
              <Text className="text-white font-semibold">
                {profile?.profile_image_url ? "Change photo" : "Add photo"}
              </Text>
            </Pressable>
          </View>

          <IdentityFields
            values={values}
            onChange={(next) => {
              setValues(next);
              setUsernameError(null);
              setError(null);
            }}
            usernameError={usernameError}
          />

          {preferences?.birthdate && (
            <View className="mt-5 gap-2">
              <Text className="text-zinc-400 text-xs font-bold uppercase tracking-wider px-1">
                Birthday
              </Text>
              <View className="bg-zinc-900/50 px-4 py-4 rounded-2xl border border-zinc-800">
                <Text className="text-zinc-400 text-base">
                  {formatBirthdate(preferences.birthdate)}
                </Text>
              </View>
              <Text className="text-zinc-500 text-sm px-1">
                {"Your birthday can't be changed. Only you can see it."}
              </Text>
            </View>
          )}

          {error && <Text className="text-red-400 text-sm mt-6 px-1">{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// app/settings/index.tsx
import React, {useState} from "react";
import {View, Text, Pressable, ScrollView, Alert, ActivityIndicator} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useRouter} from "expo-router";
import {Ionicons} from "@expo/vector-icons";

import ScreenHeader from "@/components/ui/ScreenHeader";
import {useAuth} from "@/src/providers/AuthProvider";
import {signOut} from "@/src/lib/signOut";
import {useHiddenStore} from "@/src/store/useHiddenStore";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function Row({
  icon,
  label,
  value,
  onPress,
  destructive,
  loading,
}: {
  icon: IconName;
  label: string;
  value?: string | null;
  onPress?: () => void;
  destructive?: boolean;
  loading?: boolean;
}) {
  const color = destructive ? "#f87171" : "white";
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || loading}
      className="flex-row items-center gap-3 px-4 py-4 active:bg-zinc-800"
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text
        className={`flex-1 text-base font-semibold ${destructive ? "text-red-400" : "text-white"}`}
      >
        {label}
      </Text>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {value ? (
            <Text className="text-zinc-500 text-sm max-w-[55%]" numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {onPress && !destructive && (
            <Ionicons name="chevron-forward" size={18} color="#52525b" />
          )}
        </>
      )}
    </Pressable>
  );
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View className="gap-2">
      <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-2">
        {title}
      </Text>
      <View className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
        {children}
      </View>
    </View>
  );
}

const Divider = () => <View className="h-px bg-zinc-800 ml-12" />;

export default function SettingsScreen() {
  const router = useRouter();
  const {session} = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const hiddenCount = useHiddenStore((s) => s.ids.size);

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "You can sign back in anytime.", [
      {text: "Cancel", style: "cancel"},
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerClassName="px-5 pt-4 pb-16 gap-8">
        <Section title="Profile">
          <Row
            icon="person-outline"
            label="Edit profile"
            onPress={() => router.push("/settings/edit-profile")}
          />
          <Divider />
          <Row
            icon="options-outline"
            label="Planning defaults"
            onPress={() => router.push("/settings/planning")}
          />
          <Divider />
          <Row
            icon="eye-off-outline"
            label="Hidden ideas"
            value={hiddenCount ? String(hiddenCount) : null}
            onPress={() => router.push("/settings/hidden-ideas")}
          />
        </Section>

        <Section title="Account">
          <Row icon="mail-outline" label="Email" value={session?.user.email} />
          <Divider />
          <Row
            icon="log-out-outline"
            label="Sign out"
            destructive
            loading={signingOut}
            onPress={confirmSignOut}
          />
        </Section>

        <Section title="Danger zone">
          <Row
            icon="trash-outline"
            label="Delete account"
            destructive
            onPress={() => router.push("/settings/delete-account")}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

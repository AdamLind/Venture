// app/settings/index.tsx
import React, {useEffect, useState} from "react";
import {View, Text, Pressable, ScrollView, Alert, ActivityIndicator, Switch, Linking} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useRouter} from "expo-router";
import {Ionicons} from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import ScreenHeader from "@/components/ui/ScreenHeader";
import {useAuth} from "@/src/providers/AuthProvider";
import {addAnotherAccount, signOut, switchAccount} from "@/src/lib/signOut";
import {useHiddenStore} from "@/src/store/useHiddenStore";
import {useBlockStore} from "@/src/store/useBlockStore";
import {useAccountStore} from "@/src/store/useAccountStore";
import SuspensionNotice from "@/components/settings/SuspensionNotice";
import {SUPPORT_EMAIL} from "@/src/lib/terms";
import {sortedAccounts, useDeviceAccounts} from "@/src/store/useDeviceAccounts";
import {useProfileStore} from "@/src/store/useProfileStore";
import {useStaffStore} from "@/src/store/useStaffStore";

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

/** Staff only (#26): the queue, and the switch for inline staff tools. */
function StaffSection() {
  const router = useRouter();
  const role = useStaffStore((s) => s.role);
  const toolsOn = useStaffStore((s) => s.toolsOn);
  const setToolsOn = useStaffStore((s) => s.setToolsOn);
  const waiting = useStaffStore((s) => s.counts.toReview + s.counts.reported);
  if (!role) return null;

  return (
    <View className="gap-2">
      <Section title={role === "ADMIN" ? "Staff · Admin" : "Staff · Moderator"}>
        <Row
          icon="shield-checkmark-outline"
          label="Moderation"
          value={waiting ? `${waiting} waiting` : null}
          onPress={() => router.push("/moderation")}
        />
        <Divider />
        <View className="flex-row items-center gap-3 px-4 py-3">
          <Ionicons name="construct-outline" size={20} color="white" />
          <Text className="flex-1 text-base font-semibold text-white">Staff tools</Text>
          <Switch
            value={toolsOn}
            onValueChange={setToolsOn}
            trackColor={{true: "#8b5cf6"}}
            accessibilityLabel="Staff tools"
          />
        </View>
      </Section>
      <Text className="text-zinc-500 text-xs px-2">
        Off, the app looks the way it does for everyone. On, reports and review
        options show on Explore and idea pages, with a badge on Profile.
      </Text>
    </View>
  );
}

/**
 * Accounts on this device (#31): switch to a test account and back without
 * signing out, to try reporting, blocking and moderation from both sides.
 * Shown in dev builds and to admins; once it's in use, to every account on
 * this device (so a test account can switch back).
 */
function DeviceAccountsSection() {
  const isAdmin = useStaffStore((s) => s.role === "ADMIN");
  const enabled = useDeviceAccounts((s) => s.enabled);
  const accounts = sortedAccounts(useDeviceAccounts((s) => s.accounts));
  const myUserId = useProfileStore((s) => s.userId);
  const myUsername = useProfileStore((s) => s.profile?.username ?? null);
  const [busy, setBusy] = useState<string | null>(null);

  // Label this account with its username in the list
  useEffect(() => {
    if (myUserId && myUsername) useDeviceAccounts.getState().setUsername(myUserId, myUsername);
  }, [myUserId, myUsername]);

  if (!__DEV__ && !isAdmin && !enabled) return null;

  const onSwitch = async (userId: string, name: string) => {
    setBusy(userId);
    try {
      await switchAccount(userId);
      Toast.show({type: "success", text1: `Switched to ${name}`, position: "bottom"});
    } catch (e) {
      Alert.alert("Couldn't switch", e instanceof Error ? e.message : "Please try again.");
    } finally {
      // Either way: the list is ready for the next switch
      setBusy(null);
    }
  };

  const onRemove = (userId: string, name: string) =>
    Alert.alert(`Remove ${name} from this device?`, "You can sign in to it again anytime.", [
      {text: "Cancel", style: "cancel"},
      {text: "Remove", style: "destructive", onPress: () => useDeviceAccounts.getState().forget(userId)},
    ]);

  const onAdd = () =>
    Alert.alert(
      "Add another account?",
      "You'll go to sign in. This account stays on this device, so you can switch back from Settings or the sign-in screen.",
      [
        {text: "Cancel", style: "cancel"},
        {text: "Continue", onPress: () => addAnotherAccount()},
      ],
    );

  const others = accounts.filter((a) => a.userId !== myUserId);

  return (
    <View className="gap-2">
      <Section title="Accounts on this device">
        {others.map((account, i) => {
          const name = account.username ? `@${account.username}` : (account.email ?? "Account");
          return (
            <View key={account.userId}>
              {i > 0 && <Divider />}
              <Pressable
                onPress={() => onSwitch(account.userId, name)}
                onLongPress={() => onRemove(account.userId, name)}
                disabled={!!busy}
                accessibilityRole="button"
                accessibilityHint="Switches to this account. Long press to remove it."
                className="flex-row items-center gap-3 px-4 py-4 active:bg-zinc-800"
              >
                <Ionicons name="person-circle-outline" size={20} color="white" />
                <View className="flex-1">
                  <Text className="text-base font-semibold text-white" numberOfLines={1}>
                    {name}
                  </Text>
                  {account.username && account.email ? (
                    <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                      {account.email}
                    </Text>
                  ) : null}
                </View>
                {busy === account.userId ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-zinc-400 text-sm font-semibold">Switch</Text>
                )}
              </Pressable>
            </View>
          );
        })}
        {others.length > 0 && <Divider />}
        <Row icon="person-add-outline" label="Add an account" onPress={onAdd} />
      </Section>
      <Text className="text-zinc-500 text-xs px-2">
        For testing: switch accounts without signing out. Long press one to remove it. Signing out removes
        that account from this list.
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const {session} = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const hiddenCount = useHiddenStore((s) => s.ids.size) + useBlockStore((s) => s.ids.size);
  const suspension = useAccountStore((s) => s.suspension);

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
        {/* Suspended (#76): say so, and why */}
        {suspension && session?.user.id && (
          <SuspensionNotice userId={session.user.id} suspension={suspension} />
        )}

        <StaffSection />


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

        <Section title="Help">
          <Row
            icon="book-outline"
            label="Idea guidelines"
            onPress={() => router.push("/guidelines")}
          />
          <Divider />
          <Row
            icon="document-text-outline"
            label="Terms of use"
            onPress={() => router.push("/terms")}
          />
          <Divider />
          <Row
            icon="chatbubble-outline"
            label="Contact us"
            value={SUPPORT_EMAIL ?? "Coming soon"}
            onPress={SUPPORT_EMAIL ? () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`) : undefined}
          />
        </Section>

        <DeviceAccountsSection />

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

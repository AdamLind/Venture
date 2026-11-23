// app/settings/delete-account.tsx
// Explains exactly what deleting the account removes (and what stays),
// then deletes it after one more confirmation.

import React, {useEffect, useState} from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {Ionicons} from "@expo/vector-icons";
import Toast from "@/src/lib/toast";

import ScreenHeader from "@/components/ui/ScreenHeader";
import {supabase} from "@/src/supabase";
import {deleteAccount} from "@/src/lib/signOut";
import {useProfileStore} from "@/src/store/useProfileStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {showError} from "@/src/lib/notify";
import {confirm} from "@/src/lib/sheets";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function Item({icon, text}: {icon: IconName; text: string}) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      <Ionicons name={icon} size={18} color="#a1a1aa" />
      <Text className="text-zinc-200 text-base flex-1">{text}</Text>
    </View>
  );
}

export default function DeleteAccountScreen() {
  const userId = useProfileStore((s) => s.userId);
  const dateCount = useItineraryStore((s) => s.itineraries.length);
  const [ideas, setIdeas] = useState<{published: number; other: number} | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    const count = (published: boolean) => {
      const query = supabase
        .from("activities")
        .select("idea_id", {count: "exact", head: true})
        .eq("user_id", userId);
      return published
        ? query.eq("visibility", "PUBLISHED")
        : query.neq("visibility", "PUBLISHED");
    };
    Promise.all([count(true), count(false)]).then(([pub, other]) => {
      if (mounted) setIdeas({published: pub.count ?? 0, other: other.count ?? 0});
    });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const runDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      // The root layout sends us to the login screen once the session is gone
      Toast.show({
        type: "success",
        text1: "Account deleted",
        text2: "Thanks for trying Venture.",
      });
    } catch (e) {
      setDeleting(false);
      showError("Couldn't delete your account", e);
    }
  };

  const askDelete = async () => {
    const ok = await confirm({
      title: "Delete your account?",
      message: "This is permanent. Your account and everything listed here will be gone, and it can't be undone.",
      confirmLabel: "Delete account",
      destructive: true,
      icon: "trash-outline",
    });
    if (ok) runDelete();
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader title="Delete account" />
      <ScrollView contentContainerClassName="px-5 pt-4 pb-10 gap-6">
        <View className="items-center px-4">
          <View className="w-16 h-16 rounded-full bg-red-500/15 items-center justify-center mb-4">
            <Ionicons name="trash-outline" size={28} color="#f87171" />
          </View>
          <Text className="text-white text-2xl font-extrabold tracking-tight text-center">
            Delete your account?
          </Text>
          <Text className="text-zinc-400 text-base text-center mt-2">
            {"This can't be undone. Here's exactly what happens."}
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-2">
            Deleted for good
          </Text>
          <View className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
            <Item icon="person-outline" text="Your profile, photo, and birthday" />
            <Item icon="options-outline" text="Your planning defaults and home area" />
            <Item
              icon="calendar-outline"
              text={
                dateCount > 0
                  ? `${plural(dateCount, "date")} you've planned, with their photos`
                  : "Any dates you've planned"
              }
            />
            <Item icon="bookmark-outline" text="Your saved ideas" />
            <Item
              icon="bulb-outline"
              text={
                ideas && ideas.other > 0
                  ? `${plural(ideas.other, "idea")} you haven't published`
                  : "Ideas you haven't published"
              }
            />
          </View>
        </View>

        {ideas && ideas.published > 0 && (
          <View className="gap-2">
            <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-2">
              Stays in Venture
            </Text>
            <View className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
              <Item
                icon="globe-outline"
                text={`${plural(ideas.published, "published idea")} stay in Explore, with your name removed`}
              />
            </View>
          </View>
        )}

        <View className="gap-3 mt-2">
          <Pressable
            onPress={askDelete}
            disabled={deleting}
            accessibilityRole="button"
            className={`h-14 rounded-2xl items-center justify-center ${
              deleting ? "bg-red-900" : "bg-red-600 active:opacity-80"
            }`}
          >
            {deleting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-extrabold text-base">
                Delete my account
              </Text>
            )}
          </Pressable>
          <Text className="text-zinc-500 text-sm text-center px-4">
            {"You'll be signed out on every device. You can make a new account later with the same email."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

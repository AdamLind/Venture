// app/notifications.tsx
// The bell's panel. Anything unseen shows under "New"; opening the panel marks
// it seen, so next time it's under "Earlier". Anything that arrives while the
// panel is open also counts as new, and is marked seen when you leave.

import React, {useEffect, useState} from "react";
import {router} from "expo-router";
import {View, Text, ScrollView, Pressable, RefreshControl} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";

import ScreenHeader from "@/components/ui/ScreenHeader";
import {openIdea} from "@/components/ideas/IdeaRows";
import Avatar from "@/components/profile/Avatar";
import {ideaImage} from "@/src/lib/ideas";
import {
  isDateKind,
  isPersonKind,
  showsActor,
  useNotificationStore,
  useVisibleNotifications,
  type AppNotification,
  type NotificationKind,
} from "@/src/store/useNotificationStore";
import {useStaffStore} from "@/src/store/useStaffStore";
import {useProfileStore} from "@/src/store/useProfileStore";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const KIND: Record<
  NotificationKind,
  {icon: IconName; color: string; title: string; body: (n: AppNotification) => string}
> = {
  IDEA_PUBLISHED: {
    icon: "checkmark-circle",
    color: "#34d399",
    title: "Your idea is live",
    body: (n) => `"${n.idea_title ?? "Your idea"}" is now in Discover.`,
  },
  IDEA_NEEDS_REVISION: {
    icon: "create",
    color: "#fb923c",
    title: "A reviewer asked for changes",
    body: (n) => `"${n.idea_title ?? "Your idea"}": ${n.note ?? "Edit it and resubmit to go live."}`,
  },
  IDEA_REJECTED: {
    icon: "close-circle",
    color: "#f87171",
    title: "Your idea wasn't approved",
    body: (n) => `"${n.idea_title ?? "Your idea"}"${n.note ? `: ${n.note}` : " won't be published."}`,
  },
  IDEA_HELD: {
    icon: "eye-off",
    color: "#fbbf24",
    title: "Your idea is hidden for now",
    body: (n) =>
      `"${n.idea_title ?? "Your idea"}" was reported a few times, so it's out of Discover until a moderator takes a look. People who saved it can still see it.`,
  },
  IDEA_REPORTED: {
    icon: "flag",
    color: "#f87171",
    title: "An idea was reported",
    body: (n) => `"${n.idea_title ?? "An idea"}"${n.note ? `: ${n.note}` : ""}`,
  },
  REPORT_ACTIONED: {
    icon: "shield-checkmark",
    color: "#34d399",
    title: "Thanks for your report",
    body: (n) => `We took "${n.idea_title ?? "that idea"}" out of Discover.`,
  },
  CONNECTION_REQUEST: {
    icon: "person-add",
    color: "#60a5fa",
    title: "Connection request",
    body: (n) => `${who(n)} wants to connect.`,
  },
  CONNECTION_ACCEPTED: {
    icon: "people",
    color: "#34d399",
    title: "You're connected",
    body: (n) => `You and ${who(n)} are connected.`,
  },
  PARTNER_REQUEST: {
    icon: "heart",
    color: "#f472b6",
    title: "Wants to be your person",
    body: (n) => `${who(n)} asked to be your person.`,
  },
  PARTNER_ACCEPTED: {
    icon: "heart",
    color: "#f472b6",
    title: "You're linked",
    body: (n) => `You and ${who(n)} are linked now.`,
  },
  DATE_INVITE: {
    icon: "calendar",
    color: "#60a5fa",
    title: "You're invited",
    body: (n) => `${who(n)} invited you to "${n.idea_title ?? "a date"}".`,
  },
  DATE_INVITE_ACCEPTED: {
    icon: "checkmark-circle",
    color: "#34d399",
    title: "They're in",
    body: (n) => `${who(n)} is in for "${n.idea_title ?? "your date"}".`,
  },
  DATE_COMMENT: {
    icon: "chatbubbles",
    color: "#60a5fa",
    title: "New comments",
    body: (n) => `"${n.idea_title ?? "Your date"}" · ${who(n)}: ${n.note ?? ""}`,
  },
  REPORT_DISMISSED: {
    icon: "shield-checkmark",
    color: "#a1a1aa",
    title: "We looked at your report",
    body: (n) =>
      `"${n.idea_title ?? "That idea"}" is within our guidelines, so it's staying up. It's still hidden for you.`,
  },
  PERSON_REPORTED: {
    icon: "flag",
    color: "#f87171",
    title: "Someone was reported",
    body: (n) => `${who(n)}${n.note ? `: ${n.note}` : ""}`,
  },
  // Never what happened to them: that's between them and us
  PERSON_REPORT_ACTIONED: {
    icon: "shield-checkmark",
    color: "#34d399",
    title: "Thanks for your report",
    body: (n) => `We looked into your report about ${who(n, "them")} and took action.`,
  },
  PERSON_REPORT_DISMISSED: {
    icon: "shield-checkmark",
    color: "#a1a1aa",
    title: "We looked at your report",
    body: (n) =>
      `We didn't find anything against our guidelines from ${who(n, "them")}. You can still forget or block them.`,
  },
  PHOTO_REMOVED: {
    icon: "image",
    color: "#fb923c",
    title: "Your photo was removed",
    body: (n) => `A moderator took it down${n.note ? `: ${n.note}` : "."} You can add a new one in Edit profile.`,
  },
  NAME_REMOVED: {
    icon: "person",
    color: "#fb923c",
    title: "Your name was removed",
    body: (n) => `A moderator removed it${n.note ? `: ${n.note}` : "."} You can add a new one in Edit profile.`,
  },
  USERNAME_RESET: {
    icon: "text",
    color: "#fb923c",
    title: "Pick a new username",
    body: (n) => `A moderator reset yours${n.note ? `: ${n.note}` : "."} Choose a new one in Edit profile.`,
  },
};

/** "@sam", or "Someone" once you can't see them (a declined request) */
const who = (n: AppNotification, fallback = "Someone") => (n.actor?.username ? `@${n.actor.username}` : fallback);

/** Where a notification goes (null: nowhere). People go to Connections,
 *  staff alerts open the review, a change to your profile opens Edit
 *  profile; a report that was acted on goes nowhere (the idea's gone) */
function destination(n: AppNotification): (() => void) | null {
  if (isPersonKind(n.kind)) return () => router.push("/connections");
  if (isDateKind(n.kind)) {
    const id = n.itinerary_id;
    return id ? () => router.push({pathname: "/itinerary/[id]", params: {id: String(id)}}) : null;
  }
  if (n.kind === "PERSON_REPORTED") {
    const id = n.actor_id;
    return id ? () => router.push({pathname: "/reported-person/[id]", params: {id}}) : null;
  }
  if (n.kind === "PHOTO_REMOVED" || n.kind === "NAME_REMOVED" || n.kind === "USERNAME_RESET") {
    return () => router.push("/settings/edit-profile");
  }
  if (n.kind === "PERSON_REPORT_ACTIONED" || n.kind === "PERSON_REPORT_DISMISSED") return null;
  const ideaId = n.idea_id;
  if (!ideaId || n.kind === "REPORT_ACTIONED") return null;
  if (n.kind === "IDEA_REPORTED") {
    return () => router.push({pathname: "/idea/[id]", params: {id: String(ideaId), review: "1"}});
  }
  return () => openIdea(ideaId);
}

/** "now", "5m", "3h", "2d", "Nov 3" */
function timeAgo(iso: string) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d`;
  return new Date(iso).toLocaleDateString([], {month: "short", day: "numeric"});
}

function NotificationRow({item, isNew}: {item: AppNotification; isNew: boolean}) {
  const myProfile = useProfileStore((s) => s.profile);
  const kind = KIND[item.kind];
  // A kind this version doesn't know (a newer server): skip it
  if (!kind) return null;
  const open = destination(item);
  // About your own profile: your photo (as it is now)
  const aboutMe = item.kind === "PHOTO_REMOVED" || item.kind === "NAME_REMOVED" || item.kind === "USERNAME_RESET";
  return (
    <Pressable
      onPress={open ?? undefined}
      disabled={!open}
      className={`flex-row items-start gap-3 p-3 rounded-3xl active:opacity-80 ${
        isNew ? "bg-zinc-900 border border-zinc-800" : ""
      }`}
    >
      <View>
        {aboutMe ? (
          <Avatar
            profile={myProfile ? {username: myProfile.username, profile_image_url: myProfile.profile_image_url} : null}
            size={52}
            small
          />
        ) : showsActor(item.kind) ? (
          <Avatar
            profile={
              item.actor?.username
                ? {username: item.actor.username, profile_image_url: item.actor.profile_image_url}
                : null
            }
            size={52}
            small
          />
        ) : (
          <Image
            source={ideaImage({image_urls: item.activities?.image_urls ?? null})}
            style={{width: 52, height: 52, borderRadius: 14}}
            contentFit="cover"
          />
        )}
        <View className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-black items-center justify-center">
          <Ionicons name={kind.icon} size={18} color={kind.color} />
        </View>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-white font-bold text-[15px] flex-1" numberOfLines={1}>
            {kind.title}
          </Text>
          <Text className="text-zinc-500 text-xs">{timeAgo(item.created_at)}</Text>
        </View>
        <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={3}>
          {kind.body(item)}
        </Text>
      </View>
      {isNew && <View className="w-2 h-2 rounded-full bg-blue-500 mt-2" />}
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const {items} = useVisibleNotifications();
  const reload = useNotificationStore((s) => s.reload);
  const markAllSeen = useNotificationStore((s) => s.markAllSeen);
  const [refreshing, setRefreshing] = useState(false);

  // What was new when you opened the panel stays under "New" for this visit
  const [newAtOpen] = useState(
    () =>
      new Set(
        useNotificationStore
          .getState()
          .items.filter((n) => !n.seen_at)
          .map((n) => n.notification_id),
      ),
  );

  useEffect(() => {
    // Staff alerts count as seen only when they're shown (Staff tools on),
    // read at the time so a switch flipped meanwhile counts
    const staffShown = () => {
      const s = useStaffStore.getState();
      return !!s.role && s.toolsOn;
    };
    markAllSeen(staffShown());
    // Anything that arrived while you were here: seen once you leave
    return () => {
      markAllSeen(staffShown());
    };
  }, [markAllSeen]);

  const isNew = (n: AppNotification) => newAtOpen.has(n.notification_id) || !n.seen_at;
  const fresh = items.filter(isNew);
  const earlier = items.filter((n) => !isNew(n));

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader title="Notifications" />
      <ScrollView
        contentContainerStyle={{paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" />}
      >
        {items.length === 0 ? (
          <View className="items-center py-20 px-8">
            <View className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center mb-4">
              <Ionicons name="notifications-outline" size={24} color="#a1a1aa" />
            </View>
            <Text className="text-white font-bold text-base">{"You're all caught up"}</Text>
            <Text className="text-zinc-500 text-sm text-center mt-1">
              {"When a reviewer decides on one of your ideas, you'll hear about it here."}
            </Text>
          </View>
        ) : (
          <View className="gap-6">
            {fresh.length > 0 && (
              <View className="gap-2">
                <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-2">New</Text>
                {fresh.map((n) => (
                  <NotificationRow key={n.notification_id} item={n} isNew />
                ))}
              </View>
            )}
            {earlier.length > 0 && (
              <View className="gap-1">
                <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-2 mb-1">Earlier</Text>
                {earlier.map((n) => (
                  <NotificationRow key={n.notification_id} item={n} isNew={false} />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

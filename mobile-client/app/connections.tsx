// app/connections.tsx
// Your connections (#35): your partner, requests waiting on you (or that you
// sent), and everyone you're connected with. Opened from Profile; Add someone
// shows your QR code. No search, no browsing: people connect by code.

import React, {useCallback, useState} from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  View,
} from "react-native";
import {useFocusEffect, useRouter} from "expo-router";
import {Ionicons} from "@expo/vector-icons";
import Toast from "@/src/lib/toast";

import TabHeader, {HeaderIconButton, useTabHeader, useTabRefresh} from "@/components/ui/TabHeader";
import Avatar from "@/components/profile/Avatar";
import ConnectionSheet, {type SheetAction} from "@/components/connections/ConnectionSheet";
import {
  type Connection,
  type ConnectionRequest,
  cancelRequest,
  connectionName,
  endPartner,
  forgetConnection,
  requestPartner,
  respondToRequest,
} from "@/src/lib/connections";
import {useConnectionsStore} from "@/src/store/useConnectionsStore";
import {usePartnerDatesStore} from "@/src/store/usePartnerDatesStore";
import {useBlockStore} from "@/src/store/useBlockStore";
import {choose, confirm} from "@/src/lib/sheets";
import {showError} from "@/src/lib/notify";

const PARTNER_COLOR = "#f472b6";

const toast = (text1: string, type: "success" | "error" = "success", text2?: string) =>
  Toast.show({type, text1, text2});

export default function ConnectionsScreen() {
  const router = useRouter();
  const connections = useConnectionsStore((s) => s.connections);
  const incoming = useConnectionsStore((s) => s.incoming);
  const outgoing = useConnectionsStore((s) => s.outgoing);
  const status = useConnectionsStore((s) => s.status);
  const error = useConnectionsStore((s) => s.error);
  const reloadConnections = useConnectionsStore((s) => s.reload);
  // The lists, then your partner's dates (their birthday shows up as soon
  // as they share it: on coming back here, or pulling to refresh)
  const reload = useCallback(async () => {
    await reloadConnections();
    const partnerNow = useConnectionsStore.getState().connections.find((c) => c.is_partner);
    await usePartnerDatesStore.getState().load(partnerNow?.user_id ?? null);
  }, [reloadConnections]);
  const [busy, setBusy] = useState<string | null>(null);
  // The tabs' header: large title, glass buttons, blur as it collapses
  const header = useTabHeader({back: true, subtitle: true});
  const refresh = useTabRefresh(reload);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const partner = connections.find((c) => c.is_partner) ?? null;
  // The person whose sheet is open (components/connections/ConnectionSheet.tsx)
  const [sheetFor, setSheetFor] = useState<Connection | null>(null);
  const others = connections.filter((c) => !c.is_partner);
  const outgoingPartner = outgoing.find((r) => r.kind === "PARTNER");

  // Runs an action, then refreshes the lists
  const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await action();
      if (done) toast(done);
      await reload();
    } catch (e) {
      showError("Couldn't do that", e);
    } finally {
      setBusy(null);
    }
  };

  /** Asks over their sheet; true once it's decided (the sheet can close) */
  const confirmForget = async (c: Connection) => {
    const who = `@${c.username}`;
    const how = await choose({
      title: `Forget ${who}?`,
      message: `You'll be removed from each other's connections${
        c.is_partner ? " and you're no longer each other's person" : ""
      }. They can't send you requests again unless you scan their code. Past dates stay. They aren't told.`,
      options: [
        {label: "Forget", icon: "person-remove-outline", value: "FORGET" as const},
        {
          label: "Forget and block",
          hint: "Their ideas are hidden from you too",
          icon: "ban-outline",
          destructive: true,
          value: "BLOCK" as const,
        },
      ],
    });
    if (!how) return false;
    if (how === "FORGET") {
      run(c.user_id, () => forgetConnection(c.user_id, false), `Forgot ${who}`);
    } else {
      run(
        c.user_id,
        async () => {
          await forgetConnection(c.user_id, true);
          // Their ideas leave Discover now, not on the next load
          const blocks = useBlockStore.getState();
          if (blocks.userId) await blocks.load(blocks.userId);
        },
        `Forgot and blocked ${who}`,
      );
    }
    return true;
  };

  const confirmEndPartner = async (c: Connection) => {
    const ok = await confirm({
      title: `Unlink @${c.username} as your person?`,
      message: "You stay connected, and you each keep the dates you've been on.",
      confirmLabel: "End it",
      destructive: true,
      icon: "heart-dislike-outline",
    });
    if (ok) run(c.user_id, endPartner, "Unlinked");
    return ok;
  };

  const askPartner = (c: Connection) =>
    run(
      c.user_id,
      async () => {
        const result = await requestPartner(c.user_id);
        toast(result === "LINKED" ? `You and @${c.username} are linked` : `Asked @${c.username}`);
      },
    );

  // What you can do with a connection (in their sheet). A confirmation
  // shows over the sheet (#86); it closes once you've decided
  const actionsFor = (c: Connection): SheetAction[] => {
    const then = (fn: () => unknown) => async () => {
      const decided = await fn();
      if (decided !== false) setSheetFor(null);
    };
    return [
      ...(c.is_partner
        ? []
        : !partner && !outgoingPartner
          ? [{label: `Make @${c.username} your person`, icon: "heart-outline" as const, run: then(() => askPartner(c))}]
          : []),
      ...(c.is_partner
        ? [{label: "Unlink as your person", icon: "heart-dislike-outline" as const, destructive: true, run: then(() => confirmEndPartner(c))}]
        : []),
      {label: `Forget @${c.username}`, icon: "person-remove-outline" as const, destructive: true, run: then(() => confirmForget(c))},
    ];
  };
  const openMenu = (c: Connection) => setSheetFor(c);

  const firstLoad = status === "loading" && connections.length === 0 && incoming.length === 0;
  const nothing = connections.length === 0 && incoming.length === 0 && outgoing.length === 0;
  const subtitle = connections.length
    ? `${connections.length} connection${connections.length === 1 ? "" : "s"}${
        incoming.length ? ` · ${incoming.length} waiting` : ""
      }`
    : incoming.length
      ? `${incoming.length} waiting`
      : "The people you plan dates with";

  return (
    // The scroll view is the screen's root, like the tabs (see TabHeader.tsx)
    <Animated.ScrollView
      {...header.scrollProps}
      style={{flex: 1, backgroundColor: "#000"}}
      contentContainerStyle={{paddingBottom: 40}}
      showsVerticalScrollIndicator={false}
      refreshControl={refresh.control}
    >
      <TabHeader
        header={header}
        title="Connections"
        subtitle={subtitle}
        refreshing={refresh.headerSpinner}
        right={
          <HeaderIconButton
            icon="person-add-outline"
            label="Add someone"
            onPress={() => router.push("/connections/add")}
          />
        }
      />
      <View className="px-5 pt-2 gap-7">
        {firstLoad ? (
          <ActivityIndicator color="white" style={{marginTop: 40}} />
        ) : status === "error" && nothing ? (
          <View className="items-center py-10 gap-3">
            <Text className="text-zinc-400 text-center">{error}</Text>
            <Pressable onPress={reload} className="bg-zinc-800 px-5 py-2.5 rounded-full">
              <Text className="text-white font-bold">Try again</Text>
            </Pressable>
          </View>
        ) : nothing ? (
          <View className="items-center py-14 px-6 gap-2">
            <View className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center mb-2">
              <Ionicons name="people-outline" size={28} color="#a1a1aa" />
            </View>
            <Text className="text-white font-bold text-lg">No connections yet</Text>
            <Text className="text-zinc-500 text-center">
              Connect with the people you go on dates with. They scan your code, or you scan theirs.
            </Text>
            <Pressable
              onPress={() => router.push("/connections/add")}
              className="bg-white rounded-full px-6 py-3 mt-4 active:opacity-80"
            >
              <Text className="text-black font-bold">Add someone</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* PARTNER */}
            {partner && (
              <View className="gap-2">
                <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-1">Your person</Text>
                <Pressable
                  onPress={() => openMenu(partner)}
                  accessibilityRole="button"
                  className="flex-row items-center gap-3 rounded-3xl p-4 border active:opacity-80"
                  style={{backgroundColor: `${PARTNER_COLOR}12`, borderColor: `${PARTNER_COLOR}55`}}
                >
                  <Avatar profile={partner} size={52} small />
                  <View className="flex-1">
                    <Text className="text-white font-bold text-base" numberOfLines={1}>
                      {connectionName(partner)}
                    </Text>
                    <Text className="text-zinc-400 text-sm" numberOfLines={1}>
                      @{partner.username}
                    </Text>
                  </View>
                  <Ionicons name="heart" size={20} color={PARTNER_COLOR} />
                </Pressable>
              </View>
            )}

            {/* REQUESTS */}
            {(incoming.length > 0 || outgoing.length > 0) && (
              <View className="gap-2">
                <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-1">Requests</Text>
                <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
                  {incoming.map((r, i) => (
                    <RequestRow
                      key={r.request_id}
                      request={r}
                      first={i === 0}
                      busy={busy === `req-${r.request_id}`}
                      onAccept={() =>
                        run(
                          `req-${r.request_id}`,
                          () => respondToRequest(r.request_id, true),
                          r.kind === "PARTNER" ? "You're linked" : "Connected",
                        )
                      }
                      onDecline={() => run(`req-${r.request_id}`, () => respondToRequest(r.request_id, false))}
                    />
                  ))}
                  {outgoing.map((r, i) => (
                    <OutgoingRow
                      key={r.request_id}
                      request={r}
                      first={incoming.length === 0 && i === 0}
                      busy={busy === `req-${r.request_id}`}
                      onCancel={() => run(`req-${r.request_id}`, () => cancelRequest(r.request_id), "Request cancelled")}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* EVERYONE */}
            {others.length > 0 && (
              <View className="gap-2">
                <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-1">
                  {partner ? "Connections" : `${connections.length} connection${connections.length === 1 ? "" : "s"}`}
                </Text>
                <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
                  {others.map((c, i) => (
                    <Pressable
                      key={c.user_id}
                      onPress={() => openMenu(c)}
                      disabled={busy === c.user_id}
                      accessibilityRole="button"
                      accessibilityHint="Shows them, and what you can do"
                      className={`flex-row items-center gap-3 px-4 py-3 active:bg-zinc-800 ${
                        i > 0 ? "border-t border-zinc-800" : ""
                      }`}
                    >
                      <Avatar profile={c} size={40} small />
                      <View className="flex-1">
                        <Text className="text-white font-semibold text-base" numberOfLines={1}>
                          {connectionName(c)}
                        </Text>
                        {c.first_name ? <Text className="text-zinc-500 text-sm">@{c.username}</Text> : null}
                      </View>
                      {busy === c.user_id ? (
                        <ActivityIndicator color="#a1a1aa" />
                      ) : (
                        <Ionicons name="ellipsis-horizontal" size={18} color="#71717a" />
                      )}
                    </Pressable>
                  ))}
                </View>
                {/* Only until there's a partner: after that it's just for forgetting */}
                {!partner && !outgoingPartner && (
                  <Text className="text-zinc-500 text-xs px-2">Tap someone to see options.</Text>
                )}
              </View>
            )}
          </>
        )}
      </View>
      <ConnectionSheet
        connection={sheetFor}
        actions={sheetFor ? actionsFor(sheetFor) : []}
        onClose={() => setSheetFor(null)}
      />
    </Animated.ScrollView>
  );
}

function RequestRow({
  request,
  first,
  busy,
  onAccept,
  onDecline,
}: {
  request: ConnectionRequest;
  first: boolean;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const name = request.other.username ? `@${request.other.username}` : "Someone";
  const partner = request.kind === "PARTNER";
  return (
    <View className={`flex-row items-center gap-3 px-4 py-3 ${first ? "" : "border-t border-zinc-800"}`}>
      <Avatar profile={{username: request.other.username ?? "?", profile_image_url: request.other.profile_image_url}} size={40} small />
      <View className="flex-1">
        <Text className="text-white font-semibold" numberOfLines={1}>
          {name}
        </Text>
        <Text className="text-zinc-400 text-sm" numberOfLines={1}>
          {partner ? "Wants to be your person" : "Wants to connect"}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color="white" />
      ) : (
        <View className="flex-row gap-2">
          <Pressable
            onPress={onDecline}
            accessibilityRole="button"
            accessibilityLabel={`Decline ${name}`}
            className="bg-zinc-800 rounded-full px-3.5 py-2 active:opacity-70"
          >
            <Text className="text-zinc-300 font-bold text-sm">Decline</Text>
          </Pressable>
          <Pressable
            onPress={onAccept}
            accessibilityRole="button"
            accessibilityLabel={`Accept ${name}`}
            className="rounded-full px-3.5 py-2 active:opacity-70"
            style={{backgroundColor: partner ? PARTNER_COLOR : "white"}}
          >
            <Text className="text-black font-bold text-sm">Accept</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function OutgoingRow({
  request,
  first,
  busy,
  onCancel,
}: {
  request: ConnectionRequest;
  first: boolean;
  busy: boolean;
  onCancel: () => void;
}) {
  const name = request.other.username ? `@${request.other.username}` : "Someone";
  return (
    <View className={`flex-row items-center gap-3 px-4 py-3 ${first ? "" : "border-t border-zinc-800"}`}>
      <Avatar profile={{username: request.other.username ?? "?", profile_image_url: request.other.profile_image_url}} size={40} small />
      <View className="flex-1">
        <Text className="text-white font-semibold" numberOfLines={1}>
          {name}
        </Text>
        <Text className="text-zinc-500 text-sm" numberOfLines={1}>
          {request.kind === "PARTNER" ? "You asked to be their person" : "Request sent"}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color="white" />
      ) : (
        <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" className="px-2 py-2 active:opacity-60">
          <Text className="text-zinc-400 font-semibold text-sm">Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}

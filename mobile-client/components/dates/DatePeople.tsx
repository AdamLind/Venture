// components/dates/DatePeople.tsx
// Who's on a date (#36), with their roles. The owner invites connections
// and changes or removes people; everyone else can leave. Anyone can report
// someone else on it (#76).

import React, {useState} from "react";
import {ActivityIndicator, Modal, Pressable, ScrollView, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {router} from "expo-router";
import {Ionicons} from "@expo/vector-icons";
import Toast from "@/src/lib/toast";

import Avatar from "@/components/profile/Avatar";
import {connectionName} from "@/src/lib/connections";
import {
  INVITE_ROLES,
  ROLE_HINT,
  ROLE_LABEL,
  type DateMember,
  inviteToDate,
  memberName,
  removeFromDate,
  setDateRole,
} from "@/src/lib/sharedDates";
import {useConnectionsStore} from "@/src/store/useConnectionsStore";
import type {DateRole} from "@/types/dates";
import {showDone, showError} from "@/src/lib/notify";
import {type SheetIcon, afterSheetCloses, choose, confirm} from "@/src/lib/sheets";
import Overlays from "@/components/sheets/Overlays";
import {reportPerson} from "@/src/lib/reportPerson";

const STATUS_NOTE: Record<string, string> = {PENDING: "Invited", DECLINED: "Declined"};

export default function DatePeople({
  itineraryId,
  isOwner,
  myUserId,
  members,
  onChanged,
}: {
  itineraryId: number;
  isOwner: boolean;
  myUserId: string | null;
  members: DateMember[] | null;
  /** Reload members (and the date list) after a change */
  onChanged: () => void;
}) {
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const connections = useConnectionsStore((s) => s.connections);

  const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await action();
      if (done) Toast.show({type: "success", text1: done});
      onChanged();
    } catch (e) {
      showError("Couldn't do that", e);
    } finally {
      setBusy(null);
    }
  };

  // The owner's "Remove from date"
  const removeItem = (m: DateMember, name: string) => ({
    label: "Remove from date",
    icon: "person-remove-outline" as SheetIcon,
    destructive: true,
    run: async () => {
      const ok = await confirm({
        title: `Remove ${name}?`,
        message: "They won't see this date anymore.",
        confirmLabel: "Remove",
        destructive: true,
      });
      if (ok) run(m.user_id, () => removeFromDate(itineraryId, m.user_id), `Removed ${name}`);
    },
  });

  // What you can do about someone else on it: the owner changes their role
  // or removes them; anyone can report them
  const openMenu = async (m: DateMember) => {
    const name = memberName(m);
    const manage = isOwner && m.role !== "OWNER";
    const report = async () => {
      const outcome = await reportPerson(
        {id: m.user_id, username: m.username},
        {context: "DATE", itineraryId},
        {connected: connections.some((c) => c.user_id === m.user_id)},
      );
      if (outcome === "FORGOT") onChanged();
    };
    const items: {label: string; icon: SheetIcon; destructive?: boolean; run: () => void}[] = [
      ...(manage ? INVITE_ROLES : [])
        .filter((r) => r !== m.role)
        .map((r) => ({
          label: ROLE_LABEL[r],
          icon: (r === "EDITOR"
            ? "create-outline"
            : r === "COMMENTER"
              ? "chatbubble-outline"
              : "eye-outline") as SheetIcon,
          run: () =>
            run(m.user_id, () => setDateRole(itineraryId, m.user_id, r), `${name}: ${ROLE_LABEL[r].toLowerCase()}`),
        })),
      ...(manage ? [removeItem(m, name)] : []),
      {
        label: m.username ? `Report @${m.username}` : "Report",
        icon: "flag-outline",
        destructive: true,
        run: report,
      },
    ];
    const picked = await choose({
      title: name,
      message: manage ? `${ROLE_LABEL[m.role]} now` : ROLE_LABEL[m.role],
      options: items.map((item, i) => ({label: item.label, icon: item.icon, destructive: item.destructive, value: i})),
    });
    if (picked != null) items[picked].run();
  };

  const shown = (members ?? []).filter((m) => m.invite_status !== "DECLINED");

  return (
    <View className="mt-8 gap-2">
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider">People</Text>
        {isOwner && (
          <Pressable
            onPress={() => setInviting(true)}
            hitSlop={8}
            accessibilityRole="button"
            className="flex-row items-center gap-1 active:opacity-60"
          >
            <Ionicons name="person-add-outline" size={15} color="#60a5fa" />
            <Text className="text-blue-400 font-semibold text-sm">Invite</Text>
          </Pressable>
        )}
      </View>

      <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
        {members === null ? (
          <ActivityIndicator color="#a1a1aa" style={{margin: 16}} />
        ) : (
          shown.map((m, i) => {
            const me = m.user_id === myUserId;
            // Anyone else you can see (not someone you've forgotten): the
            // owner manages them, everyone can report them
            const canOpen = !me && !m.masked;
            return (
              <Pressable
                key={m.user_id}
                onPress={canOpen ? () => openMenu(m) : undefined}
                disabled={!canOpen || busy === m.user_id}
                accessibilityRole={canOpen ? "button" : undefined}
                className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-zinc-800" : ""} ${
                  canOpen ? "active:bg-zinc-800" : ""
                }`}
              >
                <Avatar
                  profile={m.masked ? null : {username: m.username ?? "?", profile_image_url: m.profile_image_url}}
                  size={36}
                  small
                />
                <View className="flex-1">
                  <Text className="text-white font-semibold" numberOfLines={1}>
                    {me ? "You" : memberName(m)}
                  </Text>
                  <Text className="text-zinc-500 text-xs">
                    {ROLE_LABEL[m.role]}
                    {STATUS_NOTE[m.invite_status] ? ` · ${STATUS_NOTE[m.invite_status]}` : ""}
                  </Text>
                </View>
                {busy === m.user_id ? (
                  <ActivityIndicator color="#a1a1aa" />
                ) : canOpen ? (
                  <Ionicons name="ellipsis-horizontal" size={18} color="#71717a" />
                ) : null}
              </Pressable>
            );
          })
        )}
        {members !== null && shown.length <= 1 && isOwner && (
          <Pressable
            onPress={() => setInviting(true)}
            className="flex-row items-center gap-3 px-4 py-3 border-t border-zinc-800 active:bg-zinc-800"
          >
            <View className="w-9 h-9 rounded-full bg-zinc-800 items-center justify-center">
              <Ionicons name="add" size={20} color="#a1a1aa" />
            </View>
            <Text className="text-zinc-300 font-semibold">Invite someone to this date</Text>
          </Pressable>
        )}
      </View>

      <InviteSheet
        visible={inviting}
        itineraryId={itineraryId}
        alreadyOn={new Set(shown.map((m) => m.user_id))}
        onClose={() => setInviting(false)}
        onInvited={() => {
          setInviting(false);
          onChanged();
        }}
      />
    </View>
  );
}

/** Pick connections and a role, then invite them */
function InviteSheet({
  visible,
  itineraryId,
  alreadyOn,
  onClose,
  onInvited,
}: {
  visible: boolean;
  itineraryId: number;
  alreadyOn: Set<string>;
  onClose: () => void;
  onInvited: () => void;
}) {
  const insets = useSafeAreaInsets();
  const connections = useConnectionsStore((s) => s.connections);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<Exclude<DateRole, "OWNER">>("COMMENTER");
  const [sending, setSending] = useState(false);

  const available = connections.filter((c) => !alreadyOn.has(c.user_id));

  // Not connected yet: connect first (they show up here once they accept)
  const addSomeone = () => {
    onClose();
    router.push("/connections/add");
  };

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    if (!picked.size) return;
    setSending(true);
    try {
      const count = await inviteToDate(itineraryId, [...picked], role);
      setPicked(new Set());
      onInvited();
      // From the screen below, once this sheet has slid away
      afterSheetCloses().then(() =>
        showDone(count === 1 ? "Invite sent" : `${count} invites sent`, "They'll see it in their Dates."),
      );
    } catch (e) {
      showError("Couldn't invite them", e);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-zinc-950">
        <View className="flex-row items-center px-5 pt-5 pb-3 border-b border-zinc-900">
          <View className="flex-1 items-start">
            <Pressable onPress={onClose} hitSlop={10} disabled={sending}>
              <Text className="text-zinc-400 font-semibold text-base">Cancel</Text>
            </Pressable>
          </View>
          <Text className="text-white font-bold text-base">Invite</Text>
          <View className="flex-1 items-end">
            <Pressable onPress={send} hitSlop={10} disabled={!picked.size || sending}>
              {sending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className={`font-bold text-base ${picked.size ? "text-blue-400" : "text-zinc-600"}`}>
                  Send{picked.size > 1 ? ` (${picked.size})` : ""}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerClassName="px-5 pt-5 gap-6"
          contentContainerStyle={{paddingBottom: insets.bottom + 32}}
        >
          {/* ROLE */}
          <View className="gap-2">
            <Text className="text-zinc-400 text-sm font-bold ml-1">THEY CAN</Text>
            <View className="flex-row bg-zinc-900 rounded-2xl p-1 border border-zinc-800">
              {INVITE_ROLES.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  accessibilityRole="button"
                  accessibilityState={{selected: role === r}}
                  className={`flex-1 h-9 rounded-xl items-center justify-center ${role === r ? "bg-zinc-700" : ""}`}
                >
                  <Text className={`text-sm font-bold ${role === r ? "text-white" : "text-zinc-400"}`}>
                    {ROLE_LABEL[r].replace("Can ", "")}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text className="text-zinc-500 text-xs ml-1">{ROLE_HINT[role]}. You can change it later.</Text>
          </View>

          {/* WHO */}
          <View className="gap-2">
            <Text className="text-zinc-400 text-sm font-bold ml-1">YOUR CONNECTIONS</Text>
            {available.length === 0 ? (
              <View className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 items-center gap-3">
                <Text className="text-zinc-400 text-center">
                  {connections.length
                    ? "Everyone you're connected with is already on this date."
                    : "Connect with someone first, then invite them to your dates."}
                </Text>
                <Pressable onPress={addSomeone} className="bg-white rounded-full px-5 py-2.5 active:opacity-80">
                  <Text className="text-black font-bold">Add someone</Text>
                </Pressable>
              </View>
            ) : (
              <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
                {available.map((c, i) => {
                  const on = picked.has(c.user_id);
                  return (
                    <Pressable
                      key={c.user_id}
                      onPress={() => toggle(c.user_id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{checked: on}}
                      className={`flex-row items-center gap-3 px-4 py-3 active:bg-zinc-800 ${
                        i > 0 ? "border-t border-zinc-800" : ""
                      }`}
                    >
                      <Avatar profile={c} size={36} small />
                      <View className="flex-1">
                        <Text className="text-white font-semibold" numberOfLines={1}>
                          {connectionName(c)}
                        </Text>
                        {c.is_partner && <Text className="text-pink-300 text-xs">Your person</Text>}
                      </View>
                      <View
                        className={`w-6 h-6 rounded-full border items-center justify-center ${
                          on ? "bg-blue-500 border-blue-500" : "border-zinc-600"
                        }`}
                      >
                        {on && <Ionicons name="checkmark" size={15} color="white" />}
                      </View>
                    </Pressable>
                  );
                })}
                {/* Someone you're not connected with yet: connect first */}
                <Pressable
                  onPress={addSomeone}
                  accessibilityRole="button"
                  className="flex-row items-center gap-3 px-4 py-3 border-t border-zinc-800 active:bg-zinc-800"
                >
                  <View className="w-9 h-9 rounded-full bg-zinc-800 items-center justify-center">
                    <Ionicons name="person-add-outline" size={17} color="#a1a1aa" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-semibold">Add someone new</Text>
                    <Text className="text-zinc-500 text-xs">Connect by QR code, link or code, then invite them</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#71717a" />
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Pop-ups and toasts over this sheet (#86) */}
      <Overlays />
    </Modal>
  );
}

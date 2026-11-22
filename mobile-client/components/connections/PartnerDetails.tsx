// components/connections/PartnerDetails.tsx
// The dates that matter, in your partner's sheet (#87): their birthday (if
// they share it), your anniversary (shared by you both; set here), and
// sharing your own birthday with them. The Plan tab offers a one-tap chip
// around each (utils/occasions.ts). The anniversary picker opens in place,
// not as a second sheet.

import React, {useEffect, useRef, useState} from "react";
import {Platform, Pressable, Switch, Text, View} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {Ionicons} from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import {usePartnerDatesStore} from "@/src/store/usePartnerDatesStore";
import {useProfileStore} from "@/src/store/useProfileStore";

export const PARTNER_COLOR = "#f472b6";

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const longDate = (d: Date) => d.toLocaleDateString([], {month: "long", day: "numeric", year: "numeric"});

/** Whole years since a date */
const yearsSince = (from: Date, today: Date) => {
  let years = today.getFullYear() - from.getFullYear();
  if (today.getMonth() < from.getMonth() || (today.getMonth() === from.getMonth() && today.getDate() < from.getDate())) {
    years -= 1;
  }
  return years;
};

function Row({
  emoji,
  title,
  detail,
  right,
  onPress,
  label,
}: {
  emoji: string;
  title: string;
  detail: string;
  right?: React.ReactNode;
  onPress?: () => void;
  label?: string;
}) {
  const body = (
    <>
      <Text className="text-lg" style={{width: 26, textAlign: "center"}}>
        {emoji}
      </Text>
      <View className="flex-1">
        <Text className="text-white font-semibold">{title}</Text>
        <Text className="text-zinc-400 text-sm">{detail}</Text>
      </View>
      {right}
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-zinc-800"
    >
      {body}
    </Pressable>
  ) : (
    <View className="flex-row items-center gap-3 px-4 py-3.5">{body}</View>
  );
}

const Divider = () => <View className="h-px bg-zinc-800 ml-14" />;

export default function PartnerDetails({partnerId, partnerName}: {partnerId: string; partnerName: string}) {
  const {anniversary, partnerBirthday, load, setAnniversary} = usePartnerDatesStore();
  const hasBirthday = useProfileStore((s) => !!s.preferences?.birthdate);
  const savedShare = useProfileStore((s) => !!s.preferences?.share_birthday);
  const updatePreferences = useProfileStore((s) => s.updatePreferences);
  const [today] = useState(() => new Date());

  // Fresh whenever the sheet opens (they may have just shared their birthday)
  useEffect(() => {
    load(partnerId);
  }, [partnerId, load]);

  // The switch moves the moment it's touched; the save catches up (and it
  // moves back if the save fails). Only the latest save hands it back
  const [shareDraft, setShareDraft] = useState<boolean | null>(null);
  const shareBirthday = shareDraft ?? savedShare;
  const shareSave = useRef(0);
  const toggleShare = async (next: boolean) => {
    const save = ++shareSave.current;
    setShareDraft(next);
    try {
      await updatePreferences({share_birthday: next});
    } catch (e) {
      Toast.show({type: "error", text1: "Couldn't change that", text2: e instanceof Error ? e.message : undefined, position: "bottom"});
    } finally {
      if (save === shareSave.current) setShareDraft(null);
    }
  };

  // The anniversary picker, in place of the rows
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Date>(today);
  const [busy, setBusy] = useState(false);
  const [androidPicker, setAndroidPicker] = useState(false);
  const openEditor = () => {
    setDraft(anniversary ? fromIso(anniversary) : today);
    setEditing(true);
  };
  const save = async (value: string | null) => {
    setBusy(true);
    try {
      await setAnniversary(value);
      setEditing(false);
      Toast.show({type: "success", text1: value ? "Anniversary saved" : "Anniversary removed", position: "bottom"});
    } catch (e) {
      Toast.show({type: "error", text1: "Couldn't save that", text2: e instanceof Error ? e.message : undefined, position: "bottom"});
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <View className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-white font-bold text-base">💍 Your anniversary</Text>
          <Pressable onPress={() => setEditing(false)} disabled={busy} hitSlop={8} accessibilityRole="button">
            <Text className="text-zinc-400 font-semibold">Cancel</Text>
          </Pressable>
        </View>
        {Platform.OS === "ios" ? (
          <DateTimePicker
            value={draft}
            mode="date"
            display="spinner"
            maximumDate={today}
            minimumDate={new Date(1940, 0, 1)}
            onValueChange={(_, date) => date && setDraft(date)}
            textColor="white"
          />
        ) : (
          <>
            <Pressable
              onPress={() => setAndroidPicker(true)}
              className="bg-zinc-950 rounded-2xl border border-zinc-800 px-4 py-4 flex-row items-center justify-between"
            >
              <Text className="text-white text-base">{longDate(draft)}</Text>
              <Ionicons name="calendar-outline" size={18} color="#a1a1aa" />
            </Pressable>
            {androidPicker && (
              <DateTimePicker
                value={draft}
                mode="date"
                maximumDate={today}
                minimumDate={new Date(1940, 0, 1)}
                onValueChange={(_, date) => {
                  setAndroidPicker(false);
                  if (date) setDraft(date);
                }}
                onDismiss={() => setAndroidPicker(false)}
              />
            )}
          </>
        )}
        <Text className="text-zinc-500 text-xs">Shared with @{partnerName}. Either of you can change it.</Text>
        <Pressable
          onPress={() => save(toIso(draft))}
          disabled={busy}
          className="bg-white rounded-full py-3.5 items-center active:opacity-80"
        >
          <Text className="text-black font-bold">{busy ? "Saving…" : "Save"}</Text>
        </Pressable>
        {anniversary && (
          <Pressable onPress={() => save(null)} disabled={busy} className="py-1.5 items-center active:opacity-60">
            <Text className="text-zinc-400 font-semibold">Remove anniversary</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // "July 21, 1996"
  const birthday = partnerBirthday
    ? longDate(new Date(partnerBirthday.year, partnerBirthday.month - 1, partnerBirthday.day))
    : null;
  const anniversaryDate = anniversary ? fromIso(anniversary) : null;
  const together = anniversaryDate ? yearsSince(anniversaryDate, today) : 0;

  return (
    <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
      <Row
        emoji="🎂"
        title="Birthday"
        detail={birthday ?? `Shows here once @${partnerName} shares it`}
      />
      <Divider />
      <Row
        emoji="💍"
        title="Anniversary"
        detail={
          anniversaryDate
            ? `${longDate(anniversaryDate)}${together > 0 ? ` · ${together} year${together === 1 ? "" : "s"}` : ""}`
            : "Add it to plan something special"
        }
        onPress={openEditor}
        label={anniversaryDate ? `Anniversary, ${longDate(anniversaryDate)}. Change` : "Add your anniversary"}
        right={<Text className="text-blue-400 text-sm font-semibold">{anniversaryDate ? "Change" : "Add"}</Text>}
      />
      <Divider />
      <Row
        emoji="🤫"
        title="Share your birthday"
        detail={hasBirthday ? `Only @${partnerName} sees it` : "Add your birthday in Settings first"}
        right={
          <Switch
            value={shareBirthday}
            onValueChange={toggleShare}
            disabled={!hasBirthday}
            trackColor={{true: PARTNER_COLOR}}
            accessibilityLabel={`Share your birthday with @${partnerName}`}
          />
        }
      />
    </View>
  );
}

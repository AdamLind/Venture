// app/titles.tsx
// Every title you can earn from your dates (#84), from Profile (tap your
// titles). Three sections:
//
//   On your profile .. the (up to) three that show, the first big in the
//                      middle. Tap one to make it the main title, × to take
//                      it off. Until you pick, they're your hardest three
//   Earned ........... your other titles: tap one to show it
//   Still to earn .... the rest, with how to earn each
//   Mysteries ........ at the bottom, on their own: titles that only show
//                      their name until you have them
//
// Your pick is saved as you go (user_preferences.featured_titles).

import React, {useMemo} from "react";
import {Pressable, ScrollView, Text, View} from "react-native";
import {useRouter} from "expo-router";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Ionicons} from "@expo/vector-icons";

import {useEarnedTitles} from "@/hooks/useEarnedTitles";
import {useProfileStore} from "@/src/store/useProfileStore";
import {DATES_FOR_TITLES, type EarnedTitle, TITLES, type TitleId, type TitleIcon} from "@/utils/titles";
import {showError, showInfo} from "@/src/lib/notify";

const TITLE_COLOR = "#fbbf24";
const MAX_SHOWN = 3;
/** The date-count steps: having one means you've passed the ones below it */
const MILESTONES: TitleId[] = ["date-night-regular", "date-night-legend", "hall-of-fame"];

const RARITY = ["", "Easy", "Easy", "Takes a while", "Rare", "Very rare"];

export default function TitlesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const updatePreferences = useProfileStore((s) => s.updatePreferences);
  const {earned, shown, picked, finished} = useEarnedTitles();

  const shownIds = shown.map((t) => t.id);
  const others = earned.filter((t) => !shownIds.includes(t.id));

  // Not earned yet (a milestone you've passed counts as done), mysteries apart
  const notYet = useMemo(() => {
    const have = new Set(earned.map((t) => t.id));
    const topStep = Math.max(...MILESTONES.map((m, i) => (have.has(m) ? i : -1)));
    MILESTONES.slice(0, Math.max(0, topStep)).forEach((m) => have.add(m));
    return (Object.keys(TITLES) as TitleId[])
      .filter((id) => !have.has(id))
      .sort((a, b) => TITLES[a].difficulty - TITLES[b].difficulty);
  }, [earned]);
  const isSecret = (id: TitleId) => !!(TITLES[id] as {secret?: boolean}).secret;
  const toEarn = notYet.filter((id) => !isSecret(id));
  const mysteries = notYet.filter(isSecret);

  const save = async (ids: string[]) => {
    try {
      await updatePreferences({featured_titles: ids});
    } catch (e) {
      showError("Couldn't save that", e);
    }
  };
  const makeMain = (id: string) => save([id, ...shownIds.filter((x) => x !== id)]);
  const takeOff = (id: string) => {
    const rest = shownIds.filter((x) => x !== id);
    // (taking off the last one: back to the hardest three)
    save(rest);
  };
  const putOn = (id: string) => {
    if (shownIds.length >= MAX_SHOWN) {
      showInfo("Up to three", "Take one off your profile first (the × above).");
      return;
    }
    save([...shownIds, id]);
  };

  return (
    <View className="flex-1 bg-zinc-950">
      {/* HEADER */}
      <View className="items-center pt-2.5">
        <View className="w-10 h-1.5 rounded-full bg-zinc-700" />
      </View>
      <View className="flex-row items-start justify-between px-5 pt-4 pb-2">
        <View className="flex-1 pr-4">
          <Text className="text-white text-2xl font-extrabold tracking-tight">Titles</Text>
          <Text className="text-zinc-400 mt-1">
            {earned.length
              ? `You've earned ${earned.length} of ${Object.keys(TITLES).length}. Pick up to three to show.`
              : finished < DATES_FOR_TITLES
                ? `Earned from your dates. Finish ${DATES_FOR_TITLES - finished} more to start.`
                : "Earned from what your dates have in common."}
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Done"
          className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 active:opacity-70"
        >
          <Text className="text-white font-semibold text-sm">Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 32}}>
        {/* ON YOUR PROFILE */}
        {shown.length > 0 && (
          <Section
            title="On your profile"
            note={
              picked
                ? "Your first shows big in the middle. Tap one to make it the main title."
                : "Your hardest titles, picked for you. Tap one to make it the main title."
            }
          >
            {shown.map((t, i) => (
              <EarnedRow
                key={t.id}
                title={t}
                main={i === 0}
                onPress={i === 0 ? undefined : () => makeMain(t.id)}
                onRemove={() => takeOff(t.id)}
              />
            ))}
            {picked && (
              <Pressable
                onPress={() => save([])}
                hitSlop={6}
                accessibilityRole="button"
                className="self-start mt-1 ml-1 active:opacity-60"
              >
                <Text className="text-zinc-400 text-sm font-semibold underline">Go back to my hardest three</Text>
              </Pressable>
            )}
          </Section>
        )}

        {/* EARNED, NOT SHOWING */}
        {others.length > 0 && (
          <Section title="Earned" note="Tap one to show it on your profile.">
            {others.map((t) => (
              <EarnedRow key={t.id} title={t} onPress={() => putOn(t.id)} />
            ))}
          </Section>
        )}

        {/* STILL TO EARN */}
        {toEarn.length > 0 && (
          <Section title={`Still to earn · ${toEarn.length}`}>
            {toEarn.map((id) => (
              <LockedRow key={id} id={id} />
            ))}
          </Section>
        )}

        {/* MYSTERIES: at the bottom, on their own */}
        {mysteries.length > 0 && (
          <Section title={`Mysteries · ${mysteries.length}`} note="Keep going on dates to find out how to earn these.">
            {mysteries.map((id) => (
              <LockedRow key={id} id={id} />
            ))}
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

function Section({title, note, children}: {title: string; note?: string; children: React.ReactNode}) {
  return (
    <View className="mb-7 gap-2">
      <View className="ml-1 mb-0.5">
        <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{title}</Text>
        {note ? <Text className="text-zinc-500 text-xs mt-1">{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Icon({name, earned, main}: {name: TitleIcon | "help"; earned: boolean; main?: boolean}) {
  return (
    <View
      className="w-11 h-11 rounded-2xl items-center justify-center"
      style={{
        backgroundColor: earned ? (main ? "rgba(251,191,36,0.18)" : "rgba(251,191,36,0.08)") : "#18181b",
        borderWidth: main ? 1 : 0,
        borderColor: "rgba(251,191,36,0.45)",
      }}
    >
      <Ionicons name={name} size={20} color={earned ? TITLE_COLOR : "#52525b"} />
    </View>
  );
}

/** A title you have: why, and (on your profile) main or take it off */
function EarnedRow({
  title,
  main = false,
  onPress,
  onRemove,
}: {
  title: EarnedTitle;
  main?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}) {
  return (
    <View
      className={`flex-row items-center gap-3 rounded-2xl border p-3 ${
        main ? "bg-amber-500/5 border-amber-500/30" : "bg-zinc-900 border-zinc-800"
      }`}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title.label}. ${title.because}`}
        accessibilityHint={onPress ? (onRemove ? "Makes it your main title" : "Shows it on your profile") : undefined}
        className="flex-1 flex-row items-center gap-3 active:opacity-70"
      >
        <Icon name={title.icon} earned main={main} />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-white font-bold text-base shrink" numberOfLines={1}>
              {title.label}
            </Text>
            {main && (
              <View className="px-1.5 py-0.5 rounded-md bg-amber-500/20">
                <Text className="text-amber-300 text-[11px] font-extrabold">MAIN</Text>
              </View>
            )}
          </View>
          <Text className="text-zinc-400 text-sm" numberOfLines={2}>
            {title.because}
          </Text>
        </View>
        {onPress && !onRemove && <Ionicons name="add-circle-outline" size={22} color="#71717a" />}
      </Pressable>
      {onRemove && (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Take ${title.label} off your profile`}
          className="w-8 h-8 rounded-full bg-zinc-800 items-center justify-center active:opacity-70"
        >
          <Ionicons name="close" size={16} color="#a1a1aa" />
        </Pressable>
      )}
    </View>
  );
}

/** A title you don't have yet: how to earn it, or a mystery */
function LockedRow({id}: {id: TitleId}) {
  const info = TITLES[id] as (typeof TITLES)[TitleId] & {secret?: boolean};
  const secret = !!info.secret;
  return (
    <View
      className="flex-row items-center gap-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-3"
      accessible
      accessibilityLabel={`${info.label}, not earned yet. ${secret ? "A mystery title." : info.how}`}
    >
      <Icon name={secret ? "help" : info.icon} earned={false} />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-zinc-300 font-bold text-base shrink" numberOfLines={1}>
            {info.label}
          </Text>
          <Text className="text-zinc-600 text-xs font-semibold">{RARITY[info.difficulty]}</Text>
        </View>
        <Text className={`text-sm ${secret ? "text-zinc-500 italic" : "text-zinc-500"}`} numberOfLines={3}>
          {secret ? "How to earn it is a mystery." : info.how}
        </Text>
      </View>
    </View>
  );
}

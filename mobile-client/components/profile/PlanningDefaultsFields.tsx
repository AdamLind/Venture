import React, {useState} from "react";
import {View, Text, Pressable, TextInput, ActivityIndicator} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import * as Location from "expo-location";
import Toast from "react-native-toast-message";
import type {Modality, PlanningDefaults} from "@/types/profile";
import {BUDGET_TIERS, TRAVEL_DISTANCES} from "@/src/lib/profile";

function SectionLabel({children}: {children: React.ReactNode}) {
  return (
    <Text className="text-white font-bold text-lg px-1">{children}</Text>
  );
}

function Segment<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: {label: string; value: T}[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row bg-zinc-900 rounded-3xl border border-zinc-800 p-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{selected: active}}
            className={`flex-1 py-3 rounded-2xl items-center ${
              active ? "bg-zinc-700" : ""
            }`}
          >
            <Text
              className={`font-bold ${active ? "text-white" : "text-zinc-500"}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const MODALITY_OPTIONS: {label: string; value: Modality}[] = [
  {label: "Stay In", value: "STAY_IN"},
  {label: "Go Out", value: "GO_OUT"},
];

// Rounded to ~1 km so we never store someone's exact home location
const roundCoord = (value: number) => Math.round(value * 100) / 100;

/**
 * The defaults the Plan tab starts from. Used in onboarding and in Settings.
 * Controlled: the parent owns the values.
 */
export default function PlanningDefaultsFields({
  values,
  onChange,
}: {
  values: PlanningDefaults;
  onChange: (values: PlanningDefaults) => void;
}) {
  const isTier = BUDGET_TIERS.some((t) => t.value === values.default_budget);
  const [exactBudget, setExactBudget] = useState(!isTier);
  const [budgetText, setBudgetText] = useState(
    isTier ? "" : String(values.default_budget),
  );
  const [locating, setLocating] = useState(false);

  const useCurrentArea = async () => {
    setLocating(true);
    try {
      const {status} = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Toast.show({
          type: "error",
          text1: "Location is off",
          text2: "Allow location access to set your home area.",
          position: "bottom",
        });
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const {latitude, longitude} = position.coords;

      let label = "Current area";
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        const parts = [place?.city ?? place?.subregion, place?.region].filter(
          Boolean,
        );
        if (parts.length) label = parts.join(", ");
      } catch {
        // Keep the generic label if reverse geocoding isn't available
      }

      onChange({
        ...values,
        home_label: label,
        home_lat: roundCoord(latitude),
        home_lng: roundCoord(longitude),
      });
    } catch (error) {
      console.error("Home area lookup failed:", error);
      Toast.show({
        type: "error",
        text1: "Couldn't find your area",
        text2: "Please try again in a moment.",
        position: "bottom",
      });
    } finally {
      setLocating(false);
    }
  };

  const hasHome = values.home_lat != null && values.home_lng != null;

  return (
    <View className="gap-8">
      <View className="gap-3">
        <SectionLabel>{"Usually you'd rather"}</SectionLabel>
        <Segment
          options={MODALITY_OPTIONS}
          value={values.default_modality}
          onChange={(default_modality) =>
            onChange({...values, default_modality})
          }
        />
      </View>

      <View className="gap-3">
        <SectionLabel>Typical budget</SectionLabel>
        <Segment<number>
          options={[
            ...BUDGET_TIERS.map((t) => ({label: t.label, value: t.value})),
            {label: "Exact", value: -1},
          ]}
          value={exactBudget ? -1 : values.default_budget}
          onChange={(value) => {
            if (value === -1) {
              setExactBudget(true);
              setBudgetText(String(values.default_budget));
              return;
            }
            setExactBudget(false);
            onChange({...values, default_budget: value});
          }}
        />
        {exactBudget && (
          <View className="flex-row items-center justify-center gap-1 mt-1">
            <Text className="text-zinc-400 text-2xl font-bold">$</Text>
            <TextInput
              // fontSize in style: text-3xl's lineHeight clips iOS TextInput text
              className="text-white font-bold min-w-[80px] text-center"
              style={{fontSize: 30}}
              value={budgetText}
              onChangeText={(text) => {
                const digits = text.replace(/[^0-9]/g, "").slice(0, 5);
                setBudgetText(digits);
                onChange({...values, default_budget: Number(digits || 0)});
              }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#52525b"
              autoFocus
            />
          </View>
        )}
        <Text className="text-zinc-500 text-sm px-1">
          The total for the whole outing. You can change it every time you plan.
        </Text>
      </View>

      <View className="gap-3">
        <SectionLabel>{"How far you'll travel"}</SectionLabel>
        <Segment<number>
          options={TRAVEL_DISTANCES.map((miles) => ({
            label: `${miles} mi`,
            value: miles,
          }))}
          value={values.default_travel_miles}
          onChange={(default_travel_miles) =>
            onChange({...values, default_travel_miles})
          }
        />
      </View>

      <View className="gap-3">
        <SectionLabel>Home area</SectionLabel>
        <View className="bg-zinc-900 rounded-3xl border border-zinc-800 p-4 gap-3">
          <View className="flex-row items-center gap-3">
            <Ionicons
              name={hasHome ? "location" : "location-outline"}
              size={20}
              color={hasHome ? "white" : "#71717a"}
            />
            <Text
              className={`flex-1 text-base ${hasHome ? "text-white font-semibold" : "text-zinc-500"}`}
              numberOfLines={1}
            >
              {hasHome ? values.home_label : "Not set"}
            </Text>
            {hasHome && (
              <Pressable
                onPress={() =>
                  onChange({
                    ...values,
                    home_label: null,
                    home_lat: null,
                    home_lng: null,
                  })
                }
                hitSlop={8}
                accessibilityLabel="Clear home area"
              >
                <Text className="text-zinc-400 font-semibold">Clear</Text>
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={useCurrentArea}
            disabled={locating}
            className="bg-zinc-800 rounded-2xl py-3 items-center flex-row justify-center gap-2 active:bg-zinc-700"
          >
            {locating ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="navigate" size={16} color="white" />
                <Text className="text-white font-bold">
                  {hasHome ? "Update to my current area" : "Use my current area"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
        <Text className="text-zinc-500 text-sm px-1">
          Optional. Used when location is off. Only the general area is saved,
          and only you can see it.
        </Text>
      </View>
    </View>
  );
}

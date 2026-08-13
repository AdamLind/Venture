import React, {useState} from "react";
import {View, Text, ScrollView, Pressable} from "react-native";
import {Image} from "expo-image";
import {SafeAreaView} from "react-native-safe-area-context";
import {Ionicons} from "@expo/vector-icons";

export default function ProfileScreen() {
  const [activeTab, setActiveTab] = useState<"itineraries" | "bucket_list">(
    "itineraries",
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-black">
      {/* --- MINIMAL HEADER --- */}
      <View className="flex-row justify-between items-center px-6 py-2">
        <Text className="text-white font-extrabold text-2xl tracking-tight">
          Profile
        </Text>
        <Pressable className="bg-zinc-900 w-10 h-10 rounded-full items-center justify-center border border-zinc-800 active:bg-zinc-800">
          <Ionicons name="settings-outline" size={20} color="white" />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        // Bumped to pb-48 to guarantee it clears the absolute tab bar on a Pro Max
        contentContainerClassName="pb-22 px-5 pt-4"
      >
        {/* --- CENTERED IDENTITY & VIBE --- */}
        <View className="items-center mb-6">
          {/* Stripped the relative wrapper and the off-center badge for perfect symmetry */}
          <Image
            source={{
              uri: "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=250&auto=format&fit=crop",
            }}
            className="w-28 h-28 rounded-full bg-zinc-900 border-4 border-zinc-900"
          />

          <Text className="text-white font-bold text-2xl mt-4 tracking-tight">
            Sarah & John
          </Text>
          <Text className="text-zinc-400 font-medium text-sm mt-1">
            @sarah_and_john
          </Text>

          <Text className="text-zinc-300 text-center mt-3 leading-5 px-4">
            Finding the best late-night tacos and live acoustic shows. We never
            do the same thing twice.
          </Text>

          {/* User Preferences / Vibe Tags */}
          <View className="flex-row flex-wrap justify-center gap-2 mt-4">
            <View className="bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
              <Text className="text-zinc-300 text-xs font-semibold">
                $$ Average
              </Text>
            </View>
            <View className="bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
              <Text className="text-zinc-300 text-xs font-semibold">
                🌙 Night Owls
              </Text>
            </View>
            <View className="bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
              <Text className="text-zinc-300 text-xs font-semibold">
                🌮 Foodies
              </Text>
            </View>
          </View>
        </View>

        {/* --- SOCIAL PROOF & EDIT --- */}
        <View className="flex-row gap-3 mb-8">
          <Pressable className="flex-1 bg-white py-3 rounded-2xl items-center active:opacity-80">
            <Text className="text-black font-bold text-sm">Edit Profile</Text>
          </Pressable>
          <Pressable className="flex-1 bg-zinc-900 py-3 rounded-2xl border border-zinc-800 items-center flex-row justify-center gap-2 active:bg-zinc-800">
            <Ionicons name="people" size={16} color="white" />
            <Text className="text-white font-bold text-sm">148 Friends</Text>
          </Pressable>
        </View>

        {/* --- DASHBOARD WIDGET: UPCOMING --- */}
        <Text className="text-white font-bold text-lg mb-3 tracking-tight">
          Up Next
        </Text>
        <Pressable className="bg-blue-600/10 border border-blue-500/30 rounded-3xl p-5 mb-8 active:opacity-70">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <Ionicons name="calendar" size={16} color="#60A5FA" />
              <Text className="text-blue-400 font-bold text-sm uppercase tracking-wider">
                This Friday • 7:00 PM
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#60A5FA" />
          </View>
          <Text className="text-white font-bold text-xl mb-1">
            Stargazing & Hot Cocoa
          </Text>
          <Text className="text-blue-100/70 text-sm font-medium">
            Sundance Mountain Resort
          </Text>
        </Pressable>

        {/* --- PILL-STYLE TAB NAVIGATOR --- */}
        <View className="flex-row bg-zinc-900 p-1 rounded-2xl border border-zinc-800 mb-6">
          <Pressable
            onPress={() => setActiveTab("itineraries")}
            className={`flex-1 py-2.5 rounded-xl items-center ${activeTab === "itineraries" ? "bg-zinc-800 shadow-sm" : ""}`}
          >
            <Text
              className={`font-semibold text-sm ${activeTab === "itineraries" ? "text-white" : "text-zinc-500"}`}
            >
              Past Dates (12)
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("bucket_list")}
            className={`flex-1 py-2.5 rounded-xl items-center ${activeTab === "bucket_list" ? "bg-zinc-800 shadow-sm" : ""}`}
          >
            <Text
              className={`font-semibold text-sm ${activeTab === "bucket_list" ? "text-white" : "text-zinc-500"}`}
            >
              Bucket List (5)
            </Text>
          </Pressable>
        </View>

        {/* --- WIDE CARD FEED (Anti-Grid) --- */}
        <View className="gap-4">
          {/* Card 1 */}
          <Pressable className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 active:opacity-80">
            <View className="h-32 w-full relative">
              <Image
                source={{
                  uri: "https://images.unsplash.com/photo-1564767655658-4e6f3659039d?q=80&w=800&auto=format&fit=crop",
                }}
                className="w-full h-full"
                contentFit="cover"
              />
              <View className="absolute inset-0 bg-black/30" />
              <View className="absolute top-3 right-3 bg-black/60 px-2 py-1 rounded-md backdrop-blur-md">
                <Text className="text-white font-bold text-xs">$$$</Text>
              </View>
            </View>
            <View className="p-4">
              <Text className="text-white font-bold text-xl mb-1">
                Tacos & Comedy
              </Text>
              <Text className="text-zinc-400 text-sm">
                Los Hermanos + Wiseguys
              </Text>
            </View>
          </Pressable>

          {/* Card 2 */}
          <Pressable className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 active:opacity-80">
            <View className="h-32 w-full relative">
              <Image
                source={{
                  uri: "https://images.unsplash.com/photo-1551632811-561732d1e306?q=80&w=800&auto=format&fit=crop",
                }}
                className="w-full h-full"
                contentFit="cover"
              />
              <View className="absolute inset-0 bg-black/30" />
            </View>
            <View className="p-4">
              <Text className="text-white font-bold text-xl mb-1">
                Sunset Hike
              </Text>
              <Text className="text-zinc-400 text-sm">
                Provo Canyon • 2 Stops
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

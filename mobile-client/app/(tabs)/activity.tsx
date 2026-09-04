import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

// --- MOCK DATA ---
const ACTIVE_DATE = {
  id: "live-1",
  title: "Tacos & Comedy",
  currentStop: "Wiseguys Comedy Club",
  time: "8:30 PM",
  image: "https://images.unsplash.com/photo-1564767655658-4e6f3659039d?q=80&w=800&auto=format&fit=crop",
};

const UPCOMING_DATES = [
  {
    id: "up-1",
    title: "Sundance Film Festival",
    date: "OCT 14",
    day: "Saturday",
    time: "6:00 PM",
    countdown: "In 9 days",
    weather: "42° 🌙",
    image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop",
    partner: "Sarah",
  },
  {
    id: "up-2",
    title: "Anniversary Dinner",
    date: "NOV 2",
    day: "Thursday",
    time: "7:30 PM",
    countdown: "In 3 weeks",
    weather: "50° ☁️",
    image: "https://images.unsplash.com/photo-1551632811-561732d1e306?q=80&w=800&auto=format&fit=crop",
    partner: "Sarah",
  }
];

export default function Activity() {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-black">
      {/* --- HEADER --- */}
      <View className="flex-row justify-between items-center px-5 py-2 mb-2">
        <Text className="text-white font-extrabold text-3xl tracking-tight">Upcoming</Text>
        <Pressable className="bg-zinc-900 w-10 h-10 rounded-full items-center justify-center border border-zinc-800 active:bg-zinc-800">
          <Ionicons name="calendar-outline" size={20} color="white" />
        </Pressable>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-22 px-5 pt-2"
      >
        {/* --- 🔴 LIVE MODE CARD (Only shows during an active date) --- */}
        <View className="mb-8">
          <View className="flex-row items-center gap-2 mb-3 px-1">
            <View className="w-2.5 h-2.5 bg-[#FF9D0A] rounded-full shadow-[0_0_8px_rgba(255,157,10,0.8)]" />
            <Text className="text-[#FF9D0A] font-bold text-sm uppercase tracking-widest">Live Now</Text>
          </View>
          
          <Pressable className="bg-zinc-900 rounded-3xl overflow-hidden border border-[#FF9D0A]/30 active:opacity-90">
            {/* Live Map / Image Area */}
            <View className="h-40 w-full relative">
              <Image 
                source={{ uri: ACTIVE_DATE.image }} 
                className="w-full h-full opacity-60"
                contentFit="cover"
              />
              <View className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" />
              
              {/* Floating Route Badge */}
              <View className="absolute top-4 left-4 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-zinc-700 flex-row items-center gap-1.5">
                <Ionicons name="navigate" size={14} color="#FF9D0A" />
                <Text className="text-white font-bold text-xs">Stop 2 of 3</Text>
              </View>
            </View>

            {/* Live Logistics */}
            <View className="p-5 pt-2">
              <Text className="text-white font-bold text-2xl mb-1">{ACTIVE_DATE.title}</Text>
              
              <View className="flex-row items-center justify-between mt-3 bg-black/50 p-4 rounded-2xl border border-zinc-800">
                <View>
                  <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1">Up Next</Text>
                  <Text className="text-white font-bold text-base">{ACTIVE_DATE.currentStop}</Text>
                  <Text className="text-zinc-500 text-sm mt-0.5">Reservation at {ACTIVE_DATE.time}</Text>
                </View>
                <Pressable className="bg-[#FF9D0A] w-12 h-12 rounded-full items-center justify-center active:scale-95 transition-transform">
                  <Ionicons name="map" size={20} color="black" />
                </Pressable>
              </View>
            </View>
          </Pressable>
        </View>

        {/* --- 🎫 UPCOMING TICKETS --- */}
        <Text className="text-white font-bold text-xl mb-4 tracking-tight px-1">Later This Month</Text>
        
        <View className="gap-5">
          {UPCOMING_DATES.map((date) => (
            <Pressable key={date.id} className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 active:opacity-90">
              
              {/* The "Ticket Stub" Header */}
              <View className="flex-row items-center justify-between bg-zinc-800/50 p-4 border-b border-zinc-800">
                <View className="flex-row items-center gap-3">
                  {/* Calendar Date Block */}
                  <View className="bg-black py-1 px-3 rounded-xl border border-zinc-700 items-center">
                    <Text className="text-red-400 font-bold text-[10px] uppercase">{date.date.split(' ')[0]}</Text>
                    <Text className="text-white font-bold text-lg leading-6">{date.date.split(' ')[1]}</Text>
                  </View>
                  <View>
                    <Text className="text-white font-bold text-base">{date.day}</Text>
                    <Text className="text-zinc-400 text-sm">{date.time}</Text>
                  </View>
                </View>

                {/* Countdown & Weather Badge */}
                <View className="items-end gap-1">
                  <Text className="text-zinc-300 font-bold text-sm bg-zinc-700/50 px-2 py-1 rounded-md overflow-hidden">
                    {date.countdown}
                  </Text>
                  <Text className="text-zinc-500 text-xs font-semibold">{date.weather}</Text>
                </View>
              </View>

              {/* The Event Image & Details */}
              <View className="h-32 w-full relative">
                <Image 
                  source={{ uri: date.image }} 
                  className="w-full h-full"
                  contentFit="cover"
                />
                <View className="absolute inset-0 bg-black/40" />
                
                <View className="absolute bottom-4 left-4 right-4 flex-row justify-between items-end">
                  <View>
                    <Text className="text-white font-bold text-xl drop-shadow-md">{date.title}</Text>
                    <Text className="text-zinc-200 text-sm drop-shadow-md font-medium mt-1">With {date.partner}</Text>
                  </View>
                  
                  {/* Avatar stack for shared dates */}
                  <View className="flex-row">
                    <Image 
                      source={{ uri: "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=100&auto=format&fit=crop" }} 
                      className="w-8 h-8 rounded-full border-2 border-zinc-900 z-10"
                    />
                    <View className="w-8 h-8 rounded-full border-2 border-zinc-900 bg-blue-600 -ml-3 items-center justify-center">
                      <Text className="text-white text-[10px] font-bold">You</Text>
                    </View>
                  </View>
                </View>
              </View>

            </Pressable>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
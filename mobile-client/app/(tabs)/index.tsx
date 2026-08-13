import {View, Text, ScrollView, Pressable} from "react-native";
import {useRouter} from "expo-router";
import {Ionicons} from "@expo/vector-icons";
import {SafeAreaView} from "react-native-safe-area-context";
import Greeting from "@/components/home/Greeting";
import Animated from "react-native-reanimated";
import {useFloatingAnimation} from "@/hooks/useFloatingAnimation";
import {BlurView} from "expo-blur";
import {useActiveDateStore} from "@/store/activeDateStore";

export default function FeedScreen() {
  const router = useRouter();
  const floatingStyle = useFloatingAnimation();
  const timeline = useActiveDateStore((state) => state.timeline);

  return (
    <View className="flex-1 bg-zinc-950">
      {/* --- CUSTOM HEADER --- */}
      <SafeAreaView edges={["top"]} className="bg-zinc-950/90 z-10">
        <View className="px-6 pb-4 flex-row justify-between items-end">
          <View>
            <Greeting />
            <Text className="text-white text-3xl font-bold tracking-tight">
              Discover
            </Text>
          </View>
          <Pressable className="bg-zinc-900 w-12 h-12 rounded-full items-center justify-center border border-zinc-800 active:bg-zinc-800">
            <Ionicons name="notifications-outline" size={22} color="white" />
            <View className="absolute top-3 right-3 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-zinc-900" />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* --- THE FEED --- */}
      <ScrollView
        className="flex-1 px-5 bg-black"
        contentContainerClassName="pb-10 pt-3" // Increased padding to clear the higher FAB
        showsVerticalScrollIndicator={false}
      >
        {/* POST CARD 1 */}
        <View className="bg-zinc-900 rounded-3xl p-5 mb-6 border border-zinc-800 shadow-xl shadow-black/50">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <View className="w-12 h-12 bg-blue-600 rounded-full items-center justify-center mr-3 border-2 border-zinc-800">
                <Text className="text-white font-bold text-lg">S</Text>
              </View>
              <View>
                <Text className="text-white font-bold text-base">
                  Sarah & John
                </Text>
                <Text className="text-zinc-400 text-xs font-medium">
                  Friday night • Orem, UT
                </Text>
              </View>
            </View>
            <Pressable className="p-2">
              <Ionicons name="ellipsis-horizontal" size={20} color="#71717a" />
            </Pressable>
          </View>

          <Text className="text-white font-bold text-2xl mb-2 tracking-tight">
            Tacos & Comedy
          </Text>
          <Text className="text-zinc-400 text-sm mb-5 leading-6">
            Started at Los Hermanos, then caught a late show at Wiseguys. The
            perfect low-key night out!
          </Text>

          <View className="flex-row gap-2 mb-6">
            <View className="bg-zinc-950 px-4 py-2 rounded-xl border border-zinc-800">
              <Text className="text-zinc-300 text-xs font-bold tracking-widest">
                $$
              </Text>
            </View>
            <View className="bg-zinc-950 px-4 py-2 rounded-xl border border-zinc-800 flex-row items-center gap-1">
              <Ionicons name="pizza-outline" size={12} color="#EF4444" />
              <Text className="text-zinc-300 text-xs font-bold">Food</Text>
            </View>
            <View className="bg-zinc-950 px-4 py-2 rounded-xl border border-zinc-800 flex-row items-center gap-1">
              <Ionicons name="ticket-outline" size={12} color="#3B82F6" />
              <Text className="text-zinc-300 text-xs font-bold">Shows</Text>
            </View>
          </View>

          <View className="flex-row justify-between border-t border-zinc-800/80 pt-4 px-2">
            <Pressable className="flex-row items-center active:opacity-70">
              <Ionicons name="heart-outline" size={24} color="#a1a1aa" />
              <Text className="text-zinc-400 font-semibold ml-2">24</Text>
            </Pressable>
            <View className="flex-row gap-6">
              <Pressable className="flex-row items-center active:opacity-70">
                <Ionicons name="bookmark-outline" size={22} color="#a1a1aa" />
              </Pressable>
              <Pressable className="flex-row items-center active:opacity-70">
                <Ionicons
                  name="share-social-outline"
                  size={22}
                  color="#a1a1aa"
                />
              </Pressable>
            </View>
          </View>
        </View>

        {/* POST CARD 2 */}
        <View className="bg-zinc-900 rounded-3xl p-5 mb-6 border border-zinc-800 shadow-xl shadow-black/50">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <View className="w-12 h-12 bg-pink-600 rounded-full items-center justify-center mr-3 border-2 border-zinc-800">
                <Text className="text-white font-bold text-lg">A</Text>
              </View>
              <View>
                <Text className="text-white font-bold text-base">Alex</Text>
                <Text className="text-zinc-400 text-xs font-medium">
                  Saved a Bucket List • 2d ago
                </Text>
              </View>
            </View>
          </View>
          <Text className="text-white font-bold text-2xl mb-2 tracking-tight">
            Cozy Rainy Day ☕️
          </Text>
          <Text className="text-zinc-400 text-sm mb-5 leading-6">
            A collection of the absolute best cafes and bookstores to hide out
            in when the weather turns bad.
          </Text>
          <View className="flex-row gap-2 mb-6">
            <View className="bg-zinc-950 px-4 py-2 rounded-xl border border-zinc-800 flex-row items-center gap-1">
              <Ionicons name="cafe-outline" size={12} color="#16A34A" />
              <Text className="text-zinc-300 text-xs font-bold">Cozy</Text>
            </View>
          </View>
          <View className="flex-row justify-between border-t border-zinc-800/80 pt-4 px-2">
            <Pressable className="flex-row items-center active:opacity-70">
              <Ionicons name="heart-outline" size={24} color="#a1a1aa" />
              <Text className="text-zinc-400 font-semibold ml-2">8</Text>
            </Pressable>
            <View className="flex-row gap-6">
              <Pressable className="flex-row items-center active:opacity-70">
                <Ionicons name="bookmark-outline" size={22} color="#a1a1aa" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* POST CARD 3 */}
        <View className="bg-zinc-900 rounded-3xl p-5 mb-6 border border-zinc-800 shadow-xl shadow-black/50">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <View className="w-12 h-12 bg-pink-600 rounded-full items-center justify-center mr-3 border-2 border-zinc-800">
                <Text className="text-white font-bold text-lg">A</Text>
              </View>
              <View>
                <Text className="text-white font-bold text-base">Alex</Text>
                <Text className="text-zinc-400 text-xs font-medium">
                  Saved a Bucket List • 2d ago
                </Text>
              </View>
            </View>
          </View>
          <Text className="text-white font-bold text-2xl mb-2 tracking-tight">
            Cozy Rainy Day ☕️
          </Text>
          <Text className="text-zinc-400 text-sm mb-5 leading-6">
            A collection of the absolute best cafes and bookstores to hide out
            in when the weather turns bad.
          </Text>
          <View className="flex-row gap-2 mb-6">
            <View className="bg-zinc-950 px-4 py-2 rounded-xl border border-zinc-800 flex-row items-center gap-1">
              <Ionicons name="cafe-outline" size={12} color="#16A34A" />
              <Text className="text-zinc-300 text-xs font-bold">Cozy</Text>
            </View>
          </View>
          <View className="flex-row justify-between border-t border-zinc-800/80 pt-4 px-2">
            <Pressable className="flex-row items-center active:opacity-70">
              <Ionicons name="heart-outline" size={24} color="#a1a1aa" />
              <Text className="text-zinc-400 font-semibold ml-2">8</Text>
            </Pressable>
            <View className="flex-row gap-6">
              <Pressable className="flex-row items-center active:opacity-70">
                <Ionicons name="bookmark-outline" size={22} color="#a1a1aa" />
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

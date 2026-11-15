import { View, Text, Pressable, Animated as RNAnimated } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import TabHeader, {
  HeaderIconButton,
  useTabHeader,
} from "@/components/ui/TabHeader";
import Animated from "react-native-reanimated";
import { useFloatingAnimation } from "@/hooks/useFloatingAnimation";
import { BlurView } from "expo-blur";
import { useActiveDateStore } from "@/src/store/activeDateStore";

export default function FeedScreen() {
  const router = useRouter();
  const header = useTabHeader();
  const floatingStyle = useFloatingAnimation();
  const timeline = useActiveDateStore((state) => state.timeline);

  return (
    // The scroll view is the screen's root view; the header is its first,
    // sticky child (stickyHeaderIndices in header.scrollProps)
    <RNAnimated.ScrollView
      {...header.scrollProps}
      style={{ flex: 1, backgroundColor: "#000" }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <TabHeader
        header={header}
        title="Social"
        right={
          <HeaderIconButton
            icon="heart-outline"
            label="Likes"
            badgeColor="#ec4899"
          />
        }
      />
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
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
      </View>
    </RNAnimated.ScrollView>
  );
}

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useActiveDateStore } from '@/store/activeDateStore';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ActiveDateBanner() {
  const timeline = useActiveDateStore((state) => state.timeline);
  const userPrefs = useActiveDateStore((state) => state.userPrefs)

  // If there is no active date, hide the banner completely!
  if (!timeline) return null;

  return (
    <Pressable
      onPress={() => router.push('/active-date')}
      className="absolute bottom-[90px] left-4 right-4 bg-blue-600 rounded-2xl p-4 flex-row items-center justify-between shadow-lg shadow-blue-900/50 z-50"
    >
      <View className="flex-row items-center flex-1">
        <View className="bg-white/20 w-10 h-10 rounded-full items-center justify-center mr-3">
          <Ionicons name="map" size={20} color="white" />
        </View>
        <View>
          <Text className="text-white font-bold text-base">{userPrefs.socialType} in Progress</Text>
          <Text className="text-blue-200 text-xs">Tap to return to your itinerary</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="white" />
    </Pressable>
  );
}
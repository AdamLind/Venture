import React from "react";
import {View, Text} from "react-native";
import {Image} from "expo-image";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import type {PublicProfile} from "@/types/profile";
import {initials} from "@/src/lib/profile";

/**
 * Round avatar: the profile photo, or initials when there isn't one
 * (a person icon when there's no profile at all, e.g. an idea whose
 * creator deleted their account).
 */
export default function Avatar({
  profile,
  size = 112,
  uri,
  small = false,
}: {
  profile: PublicProfile | null;
  size?: number;
  /** Overrides the profile's photo (e.g. a just-picked image). */
  uri?: string | null;
  /** Thin ring for inline use (cards, rows) instead of the thick profile border. */
  small?: boolean;
}) {
  const source = uri ?? profile?.profile_image_url;

  return (
    <View
      className={
        small
          ? "rounded-full bg-zinc-800 border border-zinc-500 overflow-hidden items-center justify-center"
          : "rounded-full bg-zinc-800 border-4 border-zinc-900 overflow-hidden items-center justify-center"
      }
      style={{width: size, height: size}}
    >
      {source ? (
        <Image
          source={{uri: source}}
          style={{width: "100%", height: "100%"}}
          contentFit="cover"
          transition={150}
        />
      ) : profile ? (
        <Text
          className="text-zinc-300 font-bold"
          style={{fontSize: size * 0.36}}
        >
          {initials(profile)}
        </Text>
      ) : (
        <Ionicons name="person" size={size * 0.55} color="#a1a1aa" />
      )}
    </View>
  );
}

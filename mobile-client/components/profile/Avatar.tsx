import React from "react";
import {View, Text} from "react-native";
import {Image} from "expo-image";
import type {UserProfile} from "@/types/profile";
import {initials} from "@/src/lib/profile";

/** Round avatar: the profile photo, or initials when there isn't one. */
export default function Avatar({
  profile,
  size = 112,
  uri,
}: {
  profile: UserProfile | null;
  size?: number;
  /** Overrides the profile's photo (e.g. a just-picked image). */
  uri?: string | null;
}) {
  const source = uri ?? profile?.profile_image_url;

  return (
    <View
      className="rounded-full bg-zinc-800 border-4 border-zinc-900 overflow-hidden items-center justify-center"
      style={{width: size, height: size}}
    >
      {source ? (
        <Image
          source={{uri: source}}
          style={{width: "100%", height: "100%"}}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <Text
          className="text-zinc-300 font-bold"
          style={{fontSize: size * 0.36}}
        >
          {initials(profile)}
        </Text>
      )}
    </View>
  );
}

// components/ideas/PhotoCredit.tsx
// Its photo's credit, under "Curated by" on an idea's page. Nothing for a
// photo without one (your own).
//   Unsplash:  "Photo by <name> on Unsplash": the name opens their Unsplash
//              profile, "Unsplash" opens Unsplash (their API rules ask for both)
//   Commons:   "Photo by <name>, CC BY-SA 2.0": the name opens the photo's page
//              on Commons, the licence opens the licence (what CC licences ask)

import React from "react";
import { Linking, Text } from "react-native";

import {
  commonsPage,
  photoCredit,
  UNSPLASH_HOME,
  unsplashProfile,
} from "@/src/lib/images";

const open = (url: string) => Linking.openURL(url).catch(() => {});

function Link({
  label,
  hint,
  url,
}: {
  label: string;
  hint: string;
  url: string | null;
}) {
  if (!url) return <Text className="text-zinc-400 font-semibold">{label}</Text>;
  return (
    <Text
      onPress={() => open(url)}
      accessibilityRole="link"
      accessibilityLabel={`${label}. ${hint}`}
      className="text-zinc-400 font-semibold"
    >
      {label}
    </Text>
  );
}

export default function PhotoCredit({
  credits,
  className = "",
}: {
  credits: unknown;
  className?: string;
}) {
  const credit = photoCredit(credits);
  if (!credit) return null;

  if (credit.source === "unsplash") {
    return (
      <Text className={`text-zinc-500 text-xs ${className}`}>
        Photo by{" "}
        <Link
          label={credit.name}
          hint="Opens their Unsplash profile"
          url={unsplashProfile(credit)}
        />{" "}
        on{" "}
        <Link label="Unsplash" hint="Opens unsplash.com" url={UNSPLASH_HOME} />
      </Text>
    );
  }

  // Wikimedia Commons
  const page = commonsPage(credit);
  const publicDomain = /^(public domain|pd\b|pd-|cc0|cc[- ]zero)/i.test(
    credit.license,
  );
  const license = publicDomain ? "public domain" : credit.license;
  return (
    <Text className={`text-zinc-500 text-xs ${className}`}>
      {credit.name ? (
        <>
          Photo by{" "}
          <Link
            label={credit.name}
            hint="Opens the photo on Wikimedia Commons"
            url={page}
          />
        </>
      ) : (
        <>
          Photo from{" "}
          <Link
            label="Wikimedia Commons"
            hint="Opens the photo there"
            url={page}
          />
        </>
      )}
      ,{" "}
      <Link label={license} hint="Opens the licence" url={credit.license_url} />
    </Text>
  );
}

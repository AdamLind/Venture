// app/(tabs)/_layout.tsx
// Native tabs: the system tab bar. On iOS 26+ that's Liquid Glass, with the
// sliding glass highlight between tabs; older iOS gets the standard blurred
// bar and Android gets Material's bottom navigation.
//
// Four tabs: Discover (the pictures bring the app alive), Plan (plan a whole
// date in under a minute), Dates (live, upcoming and past) and Profile.
// No feed: Venture isn't a social network.

import React from "react";
import {Platform} from "react-native";
import {NativeTabs} from "expo-router/native-tabs";
import {isLiquidGlassAvailable} from "expo-glass-effect";

import ActiveDateBanner, {ActiveDateAccessory} from "@/components/ActiveDateBanner";
import {useActiveDateStore} from "@/src/store/activeDateStore";
import {useStaffStore, useStaffTools} from "@/src/store/useStaffStore";
import {badgeCount} from "@/src/lib/text";

// iOS 26's tab bar has a slot above it for things like a mini player
const HAS_ACCESSORY = Platform.OS === "ios" && isLiquidGlassAvailable();

// Each tab's TabHeader sets its own scroll insets on iOS (see TabHeader.tsx),
// so turn off the automatic ones or the top spacing doubles. Android keeps
// them: there they just keep content above the tab bar.
const MANUAL_INSETS = Platform.OS === "ios";

export default function TabLayout() {
  const hasActiveDate = useActiveDateStore((state) => !!state.timeline);
  // Staff tools on (#26): a badge on Profile, so it's clear the app isn't
  // the default view. It counts what's waiting in the queue (a dot if none)
  const staffTools = useStaffTools();
  const staffWaiting = useStaffStore((s) => s.counts.toReview + s.counts.reported);

  return (
    <>
      <NativeTabs
        tintColor="#ffffff"
        iconColor={{default: "#71717a", selected: "#ffffff"}}
        // Pre-iOS 26 and Android draw their own background; keep it dark
        backgroundColor="#000000"
        blurEffect="systemChromeMaterialDark"
        badgeBackgroundColor="#f59e0b"
        indicatorColor="#27272a"
        labelVisibilityMode="unlabeled"
        // iOS 26+: shrinks to a small pill while scrolling down, back on scroll up
        minimizeBehavior="onScrollDown"
      >
        <NativeTabs.Trigger name="explore" disableAutomaticContentInsets={MANUAL_INSETS}>
          <NativeTabs.Trigger.Icon
            sf={{default: "house", selected: "house.fill"}}
            md="home"
          />
          <NativeTabs.Trigger.Label hidden>Discover</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="plan" disableAutomaticContentInsets={MANUAL_INSETS}>
          <NativeTabs.Trigger.Icon
            sf={{default: "plus.circle", selected: "plus.circle.fill"}}
            md="add_circle"
          />
          <NativeTabs.Trigger.Label hidden>Plan</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="dates" disableAutomaticContentInsets={MANUAL_INSETS}>
          <NativeTabs.Trigger.Icon
            sf={{default: "calendar", selected: "calendar"}}
            md="calendar_today"
          />
          <NativeTabs.Trigger.Label hidden>Dates</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile" disableAutomaticContentInsets={MANUAL_INSETS}>
          <NativeTabs.Trigger.Icon
            sf={{default: "person.crop.circle", selected: "person.crop.circle.fill"}}
            md="account_circle"
          />
          <NativeTabs.Trigger.Label hidden>Profile</NativeTabs.Trigger.Label>
          {staffTools && (
            <NativeTabs.Trigger.Badge>{staffWaiting ? badgeCount(staffWaiting) : undefined}</NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>

        {HAS_ACCESSORY && hasActiveDate && (
          <NativeTabs.BottomAccessory>
            <ActiveDateAccessory />
          </NativeTabs.BottomAccessory>
        )}
      </NativeTabs>

      {/* Everywhere else, the floating banner above the tab bar */}
      {!HAS_ACCESSORY && <ActiveDateBanner />}
    </>
  );
}

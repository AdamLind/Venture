import React, {useRef} from "react";
import type {Measurable} from "@/hooks/useRevealAboveKeyboard";
import {View, Text, TextInput} from "react-native";
import {normalizeUsername} from "@/src/lib/profile";

export interface IdentityValues {
  firstName: string;
  lastName: string;
  username: string;
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text className="text-zinc-400 text-xs font-bold uppercase tracking-wider px-1">
        {label}
      </Text>
      {children}
      {error ? (
        <Text className="text-red-400 text-sm px-1">{error}</Text>
      ) : hint ? (
        <Text className="text-zinc-500 text-sm px-1">{hint}</Text>
      ) : null}
    </View>
  );
}

// Font size goes in `style`, not `text-base`: Tailwind's text-base also sets a
// lineHeight, and a lineHeight on an iOS TextInput clips descenders (g, j, p, y).
const inputClass =
  "bg-zinc-900 text-white px-4 py-4 rounded-2xl border border-zinc-800";
const inputStyle = {fontSize: 16};

/** First name, last name and username inputs (onboarding + edit profile). */
export default function IdentityFields({
  values,
  onChange,
  usernameError,
  onInputFocus,
}: {
  values: IdentityValues;
  onChange: (values: IdentityValues) => void;
  usernameError?: string | null;
  /** An input was focused (the screen keeps it above the keyboard) */
  onInputFocus?: (input: Measurable | null) => void;
}) {
  const first = useRef<React.ComponentRef<typeof TextInput>>(null);
  const last = useRef<React.ComponentRef<typeof TextInput>>(null);
  const user = useRef<React.ComponentRef<typeof TextInput>>(null);
  return (
    <View className="gap-5">
      <Field label="First name">
        <TextInput
          ref={first}
          onFocus={() => onInputFocus?.(first.current)}
          className={inputClass}
          style={inputStyle}
          value={values.firstName}
          onChangeText={(firstName) => onChange({...values, firstName})}
          placeholder="First name"
          placeholderTextColor="#71717a"
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          maxLength={40}
        />
      </Field>

      <Field label="Last name (optional)">
        <TextInput
          ref={last}
          onFocus={() => onInputFocus?.(last.current)}
          className={inputClass}
          style={inputStyle}
          value={values.lastName}
          onChangeText={(lastName) => onChange({...values, lastName})}
          placeholder="Last name"
          placeholderTextColor="#71717a"
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          maxLength={40}
        />
      </Field>

      <Field
        label="Username"
        hint="Shown on ideas you share. People can't search for it."
        error={usernameError}
      >
        <View className="flex-row items-center bg-zinc-900 rounded-2xl border border-zinc-800 px-4">
          <Text className="text-zinc-500 text-base">@</Text>
          <TextInput
            ref={user}
            onFocus={() => onInputFocus?.(user.current)}
            className="flex-1 text-white py-4 pl-1"
            style={inputStyle}
            value={values.username}
            onChangeText={(text) =>
              onChange({...values, username: normalizeUsername(text)})
            }
            placeholder="username"
            placeholderTextColor="#71717a"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            maxLength={30}
          />
        </View>
      </Field>
    </View>
  );
}

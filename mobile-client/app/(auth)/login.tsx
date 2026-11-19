import React, {useState} from "react";
import {
  Alert,
  View,
  TextInput,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import {supabase} from "@/src/supabase";
import {switchAccount} from "@/src/lib/signOut";
import {sortedAccounts, useDeviceAccounts, type DeviceAccount} from "@/src/store/useDeviceAccounts";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  // Accounts on this device (#31): back to one without its password
  const saved = sortedAccounts(useDeviceAccounts((s) => s.accounts));
  const [switching, setSwitching] = useState<string | null>(null);

  async function continueAs(account: DeviceAccount) {
    setSwitching(account.userId);
    try {
      await switchAccount(account.userId);
    } catch (e) {
      Alert.alert("Couldn't switch", e instanceof Error ? e.message : "Please sign in.");
    } finally {
      setSwitching(null);
    }
  }

  async function handleAuth() {
    setLoading(true);

    if (isLogin) {
      // LOG IN FLOW
      const {error} = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });
      if (error) Alert.alert("Login Failed", error.message);
    } else {
      // SIGN UP FLOW
      const {error} = await supabase.auth.signUp({
        email: email,
        password: password,
      });
      if (error) {
        Alert.alert("Sign Up Failed", error.message);
      } else {
        Alert.alert("Success!", "Your account has been created.");
        // The Postgres Trigger just fired in the background!
      }
    }

    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#121212] justify-center p-6"
    >
      <View className="mb-10">
        <Text className="text-3xl font-bold text-white mb-2">
          {isLogin ? "Welcome Back" : "Create Account"}
        </Text>
        <Text className="text-base text-gray-400">
          {isLogin
            ? "Sign in to plan your next great activity."
            : "Join to discover and save date ideas."}
        </Text>
      </View>

      <View className="flex flex-col gap-4 mb-8">
        {/* fontSize in style: text-base's lineHeight clips iOS TextInput text */}
        <TextInput
          className="bg-[#1e1e1e] text-white p-4 rounded-xl border border-[#333]"
          style={{fontSize: 16}}
          placeholder="Email address"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          className="bg-[#1e1e1e] text-white p-4 rounded-xl border border-[#333]"
          style={{fontSize: 16}}
          placeholder="Password"
          placeholderTextColor="#888"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
      </View>

      <View className="flex flex-col gap-4">
        <TouchableOpacity
          className="bg-[#ff4d4d] p-4 rounded-xl items-center justify-center h-14"
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-base font-bold">
              {isLogin ? "Sign In" : "Sign Up"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="p-4 items-center"
          onPress={() => setIsLogin(!isLogin)}
          disabled={loading}
        >
          <Text className="text-gray-400 text-sm">
            {isLogin
              ? "Don't have an account? Sign Up"
              : "Already have an account? Sign In"}
          </Text>
        </TouchableOpacity>
      </View>

      {saved.length > 0 && (
        <View className="mt-6 gap-2">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider ml-1">
            On this device
          </Text>
          {saved.map((account) => (
            <TouchableOpacity
              key={account.userId}
              onPress={() => continueAs(account)}
              disabled={!!switching || loading}
              accessibilityRole="button"
              className="flex-row items-center gap-3 bg-[#1e1e1e] border border-[#333] rounded-xl px-4 py-3"
            >
              <Ionicons name="person-circle-outline" size={24} color="#a1a1aa" />
              <View className="flex-1">
                <Text className="text-white font-bold" numberOfLines={1}>
                  {account.username ? `@${account.username}` : (account.email ?? "Account")}
                </Text>
                {account.username && account.email ? (
                  <Text className="text-gray-500 text-xs" numberOfLines={1}>
                    {account.email}
                  </Text>
                ) : null}
              </View>
              {switching === account.userId ? (
                <ActivityIndicator color="#a1a1aa" size="small" />
              ) : (
                <Text className="text-gray-400 text-sm font-semibold">Continue</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

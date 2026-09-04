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
import {supabase} from "@/src/supabase";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

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
        <TextInput
          className="bg-[#1e1e1e] text-white p-4 rounded-xl text-base border border-[#333]"
          placeholder="Email address"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          className="bg-[#1e1e1e] text-white p-4 rounded-xl text-base border border-[#333]"
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
    </KeyboardAvoidingView>
  );
}

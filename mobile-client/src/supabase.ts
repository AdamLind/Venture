import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {createClient} from "@supabase/supabase-js";

// You get these from your Supabase Dashboard -> Project Settings -> API
const supabaseUrl = "https://rdmeforzhutlanfbasxe.supabase.co";
const supabaseAnonKey = "sb_publishable_c8_Iy7JMZzXMUZIIHaV80A_Vx5_WrQ0";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, // This is critical for Expo apps!
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

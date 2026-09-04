import React, {createContext, useContext, useEffect, useState} from "react";
import {supabase} from "../supabase";
import {Session} from "@supabase/supabase-js";

const AuthContext = createContext<{
  session: Session | null;
  initialized: boolean;
}>({
  session: null,
  initialized: false,
});

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // 1. Check for an existing session on app load
    supabase.auth.getSession().then(({data: {session}}) => {
      setSession(session);
      setInitialized(true);
    });

    // 2. Listen for any login/logout events
    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{session, initialized}}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

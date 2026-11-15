
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Session } from "@supabase/supabase-js";

type AuthContextType = {
  session: Session | null;
  initialized: boolean;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  initialized: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;

        if (mounted) {
          setSession(data.session);
          setInitialized(true);
        }
      })
      .catch((error) => {
        console.error("Supabase session initialization failed:", error);

        if (mounted) {
          setInitialized(true);
        }
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, initialized }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AppRole = "admin" | "super_admin";
export type Profile = Tables<"profiles">;

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAuthData = useCallback(() => {
    setSession(null);
    setProfile(null);
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        `
        id,
        full_name,
        role,
        is_active,
        avatar_url,
        created_at,
        updated_at
        `,
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[Auth] Gagal mengambil profil pengguna:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      setProfile(null);
      return null;
    }

    if (!data) {
      console.error(
        "[Auth] Profil pengguna tidak ditemukan untuk user:",
        userId,
      );

      setProfile(null);
      return null;
    }

    const userProfile = data as Profile;

    if (!userProfile.is_active) {
      console.warn("[Auth] Akun pengguna tidak aktif.");

      setProfile(null);

      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        console.error(
          "[Auth] Gagal logout dari akun yang tidak aktif:",
          signOutError,
        );
      }

      return null;
    }

    setProfile(userProfile);
    return userProfile;
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentUser = session?.user;

    if (!currentUser) {
      setProfile(null);
      return;
    }

    await loadProfile(currentUser.id);
  }, [loadProfile, session?.user]);

  const signOut = useCallback(async () => {
    setLoading(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      clearAuthData();
    } catch (error) {
      console.error("[Auth] Gagal logout:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [clearAuthData]);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!isMounted) return;

        setSession(initialSession);

        if (initialSession?.user) {
          await loadProfile(initialSession.user.id);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("[Auth] Gagal menginisialisasi autentikasi:", error);

        if (isMounted) {
          clearAuthData();
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;

      setSession(nextSession);

      if (!nextSession?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      // Ditunda agar query database tidak berjalan di dalam callback auth.
      window.setTimeout(() => {
        if (!isMounted) return;

        void loadProfile(nextSession.user.id).finally(() => {
          if (isMounted) {
            setLoading(false);
          }
        });
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [clearAuthData, loadProfile]);

  const role: AppRole | null = profile?.role ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role,
      loading,
      isSuperAdmin: role === "super_admin",
      isAdmin: role === "admin" || role === "super_admin",
      signOut,
      refreshProfile,
    }),
    [
      session,
      profile,
      role,
      loading,
      signOut,
      refreshProfile,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
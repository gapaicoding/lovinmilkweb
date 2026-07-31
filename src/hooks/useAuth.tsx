import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Session,
  User,
} from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  getRolePermissions,
  type AppPermissions,
  type AppRole,
} from "@/lib/permissions";

export type { AppRole } from "@/lib/permissions";

export type Profile =
  Tables<"profiles">;

interface AuthContextValue
  extends AppPermissions {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;

  /**
   * loading hanya dipakai untuk auth transition yang memang
   * membutuhkan aplikasi menunggu:
   *
   * - initial session check;
   * - login user baru;
   * - logout.
   *
   * Background token refresh TIDAK mengubah loading menjadi true.
   */
  loading: boolean;

  signOut: () => Promise<void>;

  refreshProfile: () => Promise<void>;
}

const AuthContext =
  createContext<
    AuthContextValue | undefined
  >(undefined);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [
    session,
    setSession,
  ] = useState<Session | null>(
    null,
  );

  const [
    profile,
    setProfile,
  ] = useState<Profile | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  /**
   * Menyimpan user aktif terakhir tanpa menyebabkan render.
   *
   * Ini penting agar SIGNED_IN untuk user yang sama tidak
   * dianggap sebagai login baru.
   */
  const activeUserIdRef =
    useRef<string | null>(
      null,
    );

  const clearAuthData =
    useCallback(() => {
      activeUserIdRef.current =
        null;

      setSession(null);
      setProfile(null);
    }, []);

  // ==========================================================
  // LOAD PROFILE
  // ==========================================================

  const loadProfile =
    useCallback(
      async (
        userId: string,
      ) => {
        const {
          data,
          error,
        } = await supabase
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
          .eq(
            "id",
            userId,
          )
          .maybeSingle();

        if (error) {
          console.error(
            "[Auth] Gagal mengambil profil pengguna:",
            {
              message:
                error.message,

              code:
                error.code,

              details:
                error.details,

              hint:
                error.hint,
            },
          );

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

        const userProfile =
          data as Profile;

        if (
          !userProfile.is_active
        ) {
          console.warn(
            "[Auth] Akun pengguna tidak aktif.",
          );

          setProfile(null);

          const {
            error:
              signOutError,
          } =
            await supabase.auth.signOut();

          if (
            signOutError
          ) {
            console.error(
              "[Auth] Gagal logout dari akun yang tidak aktif:",
              signOutError,
            );
          }

          return null;
        }

        /**
         * Jangan menerima hasil profile lama jika user berubah
         * selama request masih berjalan.
         */
        if (
          activeUserIdRef.current !==
          userId
        ) {
          return null;
        }

        setProfile(
          userProfile,
        );

        return userProfile;
      },
      [],
    );

  // ==========================================================
  // REFRESH PROFILE MANUAL
  //
  // Tidak memakai global loading.
  //
  // Refresh profile manual/background tidak boleh membongkar
  // seluruh authenticated layout.
  // ==========================================================

  const refreshProfile =
    useCallback(async () => {
      const currentUser =
        session?.user;

      if (!currentUser) {
        setProfile(null);

        return;
      }

      activeUserIdRef.current =
        currentUser.id;

      await loadProfile(
        currentUser.id,
      );
    }, [
      loadProfile,
      session?.user,
    ]);

  // ==========================================================
  // SIGN OUT
  // ==========================================================

  const signOut =
    useCallback(async () => {
      /**
       * Logout memang merupakan auth transition.
       *
       * Pada kondisi ini PageLoader masih boleh ditampilkan
       * sampai session benar-benar dibersihkan.
       */
      setLoading(true);

      try {
        const {
          error,
        } =
          await supabase.auth.signOut();

        if (error) {
          throw error;
        }

        clearAuthData();
      } catch (error) {
        console.error(
          "[Auth] Gagal logout:",
          error,
        );

        throw error;
      } finally {
        setLoading(false);
      }
    }, [
      clearAuthData,
    ]);

  // ==========================================================
  // AUTH INITIALIZATION + EVENT LISTENER
  // ==========================================================

  useEffect(() => {
    let isMounted =
      true;

    let profileLoadTimer:
      | ReturnType<
          typeof setTimeout
        >
      | null = null;

    const clearProfileLoadTimer =
      () => {
        if (
          profileLoadTimer !==
          null
        ) {
          clearTimeout(
            profileLoadTimer,
          );

          profileLoadTimer =
            null;
        }
      };

    // --------------------------------------------------------
    // INITIAL SESSION
    //
    // Ini satu-satunya pengecekan awal aplikasi yang memang
    // membutuhkan full auth loading.
    // --------------------------------------------------------

    const initializeAuth =
      async () => {
        try {
          const {
            data: {
              session:
                initialSession,
            },

            error,
          } =
            await supabase.auth.getSession();

          if (error) {
            throw error;
          }

          if (!isMounted) {
            return;
          }

          setSession(
            initialSession,
          );

          const initialUser =
            initialSession?.user;

          if (
            initialUser
          ) {
            activeUserIdRef.current =
              initialUser.id;

            await loadProfile(
              initialUser.id,
            );
          } else {
            activeUserIdRef.current =
              null;

            setProfile(
              null,
            );
          }
        } catch (error) {
          console.error(
            "[Auth] Gagal menginisialisasi autentikasi:",
            error,
          );

          if (
            isMounted
          ) {
            clearAuthData();
          }
        } finally {
          if (
            isMounted
          ) {
            setLoading(
              false,
            );
          }
        }
      };

    void initializeAuth();

    // --------------------------------------------------------
    // AUTH STATE EVENTS
    // --------------------------------------------------------

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
          nextSession,
        ) => {
          if (!isMounted) {
            return;
          }

          const previousUserId =
            activeUserIdRef.current;

          const nextUserId =
            nextSession
              ?.user
              ?.id ??
            null;

          setSession(
            nextSession,
          );

          // ==================================================
          // SIGNED OUT / SESSION HILANG
          // ==================================================

          if (
            event ===
              "SIGNED_OUT" ||
            !nextUserId
          ) {
            clearProfileLoadTimer();

            activeUserIdRef.current =
              null;

            setProfile(
              null,
            );

            setLoading(
              false,
            );

            return;
          }

          activeUserIdRef.current =
            nextUserId;

          // ==================================================
          // TOKEN REFRESH
          //
          // Session token memang berubah, tetapi identitas dan
          // profile bisnis user tidak berubah.
          //
          // JANGAN:
          // - setLoading(true)
          // - reload profile
          //
          // Ini mencegah seluruh app berubah ke PageLoader saat
          // token Supabase diperbarui.
          // ==================================================

          if (
            event ===
            "TOKEN_REFRESHED"
          ) {
            return;
          }

          // ==================================================
          // INITIAL_SESSION
          //
          // Initial profile sudah ditangani oleh getSession()
          // pada initializeAuth.
          //
          // Listener hanya menyinkronkan session object.
          // ==================================================

          if (
            event ===
            "INITIAL_SESSION"
          ) {
            return;
          }

          // ==================================================
          // SIGNED_IN
          //
          // SIGNED_IN untuk USER YANG SAMA tidak perlu
          // menyebabkan global loading/profile reload.
          //
          // Login sebenarnya dari keadaan tanpa user akan punya:
          //
          // previousUserId !== nextUserId
          // ==================================================

          if (
            event ===
            "SIGNED_IN"
          ) {
            if (
              previousUserId ===
              nextUserId
            ) {
              return;
            }

            clearProfileLoadTimer();

            setLoading(
              true,
            );

            profileLoadTimer =
              setTimeout(
                () => {
                  profileLoadTimer =
                    null;

                  if (
                    !isMounted
                  ) {
                    return;
                  }

                  void loadProfile(
                    nextUserId,
                  ).finally(
                    () => {
                      if (
                        isMounted
                      ) {
                        setLoading(
                          false,
                        );
                      }
                    },
                  );
                },
                0,
              );

            return;
          }

          // ==================================================
          // USER UPDATED
          //
          // Refresh profile di background.
          //
          // Tidak menggunakan global PageLoader.
          // ==================================================

          if (
            event ===
            "USER_UPDATED"
          ) {
            clearProfileLoadTimer();

            profileLoadTimer =
              setTimeout(
                () => {
                  profileLoadTimer =
                    null;

                  if (
                    !isMounted
                  ) {
                    return;
                  }

                  void loadProfile(
                    nextUserId,
                  );
                },
                0,
              );

            return;
          }

          // ==================================================
          // PASSWORD RECOVERY / AUTH EVENT LAIN
          //
          // Bila event menghasilkan user BARU dibanding state
          // sebelumnya, load profile seperti login.
          //
          // Untuk user yang sama, cukup pertahankan session.
          // ==================================================

          if (
            previousUserId ===
            nextUserId
          ) {
            return;
          }

          clearProfileLoadTimer();

          setLoading(
            true,
          );

          profileLoadTimer =
            setTimeout(
              () => {
                profileLoadTimer =
                  null;

                if (
                  !isMounted
                ) {
                  return;
                }

                void loadProfile(
                  nextUserId,
                ).finally(
                  () => {
                    if (
                      isMounted
                    ) {
                      setLoading(
                        false,
                      );
                    }
                  },
                );
              },
              0,
            );
        },
      );

    return () => {
      isMounted =
        false;

      clearProfileLoadTimer();

      subscription.unsubscribe();
    };
  }, [
    clearAuthData,
    loadProfile,
  ]);

  // ==========================================================
  // PERMISSIONS
  // ==========================================================

  const role:
    AppRole | null =
    profile?.role ??
    null;

  const permissions =
    useMemo(
      () =>
        getRolePermissions(
          role,
        ),
      [role],
    );

  // ==========================================================
  // CONTEXT VALUE
  // ==========================================================

  const value =
    useMemo<AuthContextValue>(
      () => ({
        session,

        user:
          session?.user ??
          null,

        profile,

        role,

        loading,

        ...permissions,

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
        permissions,
      ],
    );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context =
    useContext(
      AuthContext,
    );

  if (!context) {
    throw new Error(
      "useAuth must be used within AuthProvider",
    );
  }

  return context;
}
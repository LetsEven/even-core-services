"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import type {
  AuthResponse,
  AuthService,
  ProfileData,
  TermsStatus,
} from "../service";

export interface User {
  id: string;
  phone?: string;
  email?: string;
  accountType: string;
}

export interface Profile {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: string;
  photoUrl?: string;
  userContext?: string;
  accountType: string;
  createdAt?: string;
  updatedAt?: string;
  termsStatus?: TermsStatus | null;
}

export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sendOTP: (phone: string) => Promise<AuthResponse>;
  verifyOTP: (phone: string, token: string) => Promise<AuthResponse>;
  createOrUpdateProfile: (profileData: ProfileData) => Promise<AuthResponse>;
  updateProfile: (updates: Partial<ProfileData>) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  acknowledgeTermsUpdate: () => Promise<AuthResponse>;
}

/**
 * Variantes de la sesión entre apps (comportamiento original de cada una):
 * - `fetchProfileOnVerify` (PG, TOP): tras verificar el código pide el perfil completo ANTES de tocar el estado,
 *   para que `user` y `profile` cambien en un solo render. RS y FB usan el perfil que trae la respuesta.
 * - `adaptiveRefresh` (PG): el primer refresh periódico va al 80 % del tiempo restante del token
 *   (mín. 30 s, máx. 50 min) en vez de a los 50 min fijos.
 * - `syncTabs` (PG): copia a este tab los tokens que otro tab refrescó (evento `storage`).
 */
export interface AuthOptions {
  fetchProfileOnVerify: boolean;
  adaptiveRefresh: boolean;
  syncTabs: boolean;
}

/** Crea `AuthProvider` y `useAuth` sobre el `authService` de la app. */
export function createAuth(authService: AuthService, options: AuthOptions) {
  const { fetchProfileOnVerify, adaptiveRefresh, syncTabs } = options;
  const AuthContext = createContext<AuthContextType | undefined>(undefined);

  function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Ref para leer el perfil actual dentro de event handlers sin stale closures
    const profileRef = useRef(profile);
    useEffect(() => {
      profileRef.current = profile;
    }, [profile]);

    // Cargar usuario del localStorage al montar
    useEffect(() => {
      const loadUser = async () => {
        const currentUser = authService.getCurrentUser();
        if (currentUser) {
          // Set auth token in AuthService first
          if (currentUser.token) {
            authService.setAuthToken(currentUser.token);
          }

          // Verificar si el token está por expirar o ya expiró
          const expiresAt = localStorage.getItem("even_expires_at");
          if (expiresAt) {
            const now = Math.floor(Date.now() / 1000);
            const expiration = parseInt(expiresAt);
            const timeUntilExpiry = expiration - now;

            // Si ya expiró o expira en menos de 5 minutos, refrescar ahora
            if (timeUntilExpiry < 300) {
              const refreshResponse = await authService.refreshToken();
              if (refreshResponse.success && refreshResponse.data?.session) {
                authService.setAuthToken(
                  refreshResponse.data.session.access_token,
                );
              } else if (refreshResponse.status === 401) {
                // El servidor rechazó el refresh token — sesión inválida
                await performLogout();
                setIsLoading(false);
                return;
              }
              // Refresh exitoso, o error de red/5xx (sesión se conserva y se
              // reintenta vía visibility/online/retry de getMyProfile)
              const profileOk = await loadProfileWithValidation();
              if (profileOk) {
                setUser(currentUser);
              } else {
                await performLogout();
              }
              setIsLoading(false);
              return;
            }
          }

          // Token válido - cargar perfil primero, luego establecer usuario
          const profileLoaded = await loadProfileWithValidation();
          if (profileLoaded) {
            setUser(currentUser);
          } else {
            await performLogout();
          }
        }
        setIsLoading(false);
      };

      loadUser();
    }, []);

    // Refresh token periódicamente mientras el usuario está autenticado
    useEffect(() => {
      if (!user) return;

      // Refrescar cada 50 minutos (el token expira en 1 hora por defecto)
      const REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutos en ms

      const refreshTokenPeriodically = async () => {
        try {
          const refreshResponse = await authService.refreshToken();
          if (refreshResponse.success && refreshResponse.data?.session) {
            const newToken = refreshResponse.data.session.access_token;
            authService.setAuthToken(newToken);
          } else {
            console.warn("⚠️ Periodic refresh failed:", refreshResponse.error);
          }
        } catch (error) {
          console.error("❌ Error in periodic refresh:", error);
        }
      };

      let intervalId: ReturnType<typeof setInterval> | undefined;
      let firstRefreshTimeout: ReturnType<typeof setTimeout> | undefined;
      if (adaptiveRefresh) {
        // Primer refresh: al 80% del tiempo restante del token (min 30s, max 50min)
        const expiresAt = parseInt(
          localStorage.getItem("even_expires_at") || "0",
        );
        const now = Math.floor(Date.now() / 1000);
        const msUntilExpiry = Math.max((expiresAt - now) * 1000, 0);
        const firstRefreshDelay = Math.min(
          Math.max(msUntilExpiry * 0.8, 30_000),
          REFRESH_INTERVAL,
        );
        firstRefreshTimeout = setTimeout(async () => {
          await refreshTokenPeriodically();
          intervalId = setInterval(refreshTokenPeriodically, REFRESH_INTERVAL);
        }, firstRefreshDelay);
      } else {
        intervalId = setInterval(refreshTokenPeriodically, REFRESH_INTERVAL);
      }

      // También refrescar cuando la app vuelve a estar visible
      const handleVisibilityChange = async () => {
        if (document.visibilityState === "visible") {
          const expiresAt = localStorage.getItem("even_expires_at");
          if (expiresAt) {
            const now = Math.floor(Date.now() / 1000);
            const expiration = parseInt(expiresAt);
            const timeUntilExpiry = expiration - now;

            // Si ya expiró o expira en menos de 10 minutos, refrescar
            if (timeUntilExpiry < 600) {
              const refreshResponse = await authService.refreshToken();
              if (refreshResponse.success && refreshResponse.data?.session) {
                authService.setAuthToken(
                  refreshResponse.data.session.access_token,
                );
              } else if (refreshResponse.status === 401) {
                // El servidor rechazó el refresh token — sesión inválida
                console.error("❌ Refresh token rejected, logging out user");
                await performLogout();
              } else {
                // Error de red o del servidor — conservar la sesión; se
                // reintentará en el próximo visibility/online/timer
                console.warn(
                  "⚠️ Transient refresh failure on visibility change, keeping session",
                );
              }
            }
          }

          // Si el perfil no está cargado, intentarlo ahora que la app es visible
          if (!profileRef.current) {
            await loadProfile();
          }
        }
      };

      // Cargar perfil cuando la red vuelve (móvil despertando con red inestable)
      const handleNetworkOnline = async () => {
        if (!profileRef.current) {
          await loadProfile();
        }
      };

      // Sincronizar token entre tabs: si otro tab refrescó, tomar su token
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === "even_access_token" && e.newValue) {
          authService.setAuthToken(e.newValue);
        }
        if (e.key === "even_refresh_token" && e.newValue) {
          localStorage.setItem("even_refresh_token", e.newValue);
        }
        if (e.key === "even_expires_at" && e.newValue) {
          localStorage.setItem("even_expires_at", e.newValue);
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("online", handleNetworkOnline);
      if (syncTabs) window.addEventListener("storage", handleStorageChange);

      return () => {
        clearTimeout(firstRefreshTimeout);
        clearInterval(intervalId);
        if (syncTabs)
          window.removeEventListener("storage", handleStorageChange);
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
        window.removeEventListener("online", handleNetworkOnline);
      };
    }, [user]);

    // Función interna para hacer logout sin async issues
    const performLogout = async () => {
      await authService.logout();
      authService.clearAuthToken();
      authService.clearAllSessionData();
      setUser(null);
      setProfile(null);
    };

    // El backend puede devolver data.data.profile o data.profile
    const extractProfileFromResponse = (
      response: AuthResponse,
    ): Profile | undefined => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseData = (response as any).data;
      return responseData?.data?.profile || responseData?.profile;
    };

    const loadProfile = async () => {
      try {
        const response = await authService.getMyProfile();

        if (response.success && response.data) {
          const profileData = extractProfileFromResponse(response);

          if (profileData) {
            setProfile(profileData);
          } else {
            console.warn("⚠️ No profile data found in response");
          }
        } else if (response.error?.includes("Sesión expirada")) {
          setUser(null);
          setProfile(null);
        } else {
          console.warn("⚠️ Error loading profile:", response.error);
        }
      } catch (error) {
        console.error("❌ Error loading profile:", error);
      }
    };

    // Versión que retorna si fue exitoso (para validación en carga inicial)
    const loadProfileWithValidation = async (): Promise<boolean> => {
      try {
        const response = await authService.getMyProfile();

        if (response.success && response.data) {
          const profileData = extractProfileFromResponse(response);

          if (profileData) {
            setProfile(profileData);
            return true;
          } else {
            console.warn("⚠️ No profile data found in response");
            // No hay perfil pero la request fue exitosa - usuario nuevo
            return true;
          }
        }

        // Cerrar sesión si no hay token o si el servidor rechazó el refresh
        // (la sesión murió de verdad). Otros errores son fallas de red
        // transitorias y conservan la sesión para reintentar luego.
        if (
          response.error === "No estás autenticado" ||
          response.error === "Sesión expirada"
        ) {
          return false;
        }

        console.warn(
          "⚠️ Could not load profile on startup, keeping session:",
          response.error,
        );
        return true;
      } catch (error) {
        // Error de red — mantener sesión, no desloguear
        console.error(
          "❌ Network error loading profile, keeping session:",
          error,
        );
        return true;
      }
    };

    const sendOTP = async (phone: string): Promise<AuthResponse> => {
      const response = await authService.sendPhoneOTP(phone);
      return response;
    };

    const verifyOTP = async (
      phone: string,
      token: string,
    ): Promise<AuthResponse> => {
      const response = await authService.verifyPhoneOTP(phone, token);

      if (response.success && response.data) {
        const userWithToken = {
          ...response.data.user,
          token: response.data.session.access_token,
        };

        // Con `fetchProfileOnVerify`, el perfil que viene en la respuesta del
        // verify puede llegar incompleto o ausente: se pide el perfil completo
        // ANTES de tocar el estado para que `user` y `profile` se actualicen
        // juntos en un solo render (ningún efecto que dependa de ambos, p.ej. el
        // que decide a qué step ir en auth-selection, ve un perfil incompleto).
        let resolvedProfile = response.data.profile;
        if (fetchProfileOnVerify) {
          const profileResponse = await authService.getMyProfile();
          resolvedProfile = profileResponse.success
            ? (extractProfileFromResponse(profileResponse) ??
              response.data.profile)
            : response.data.profile;
        }

        setUser(userWithToken);
        if (resolvedProfile) {
          setProfile(resolvedProfile);
        }

        authService.setAuthToken(response.data.session.access_token);
      }

      return response;
    };

    const createOrUpdateProfile = async (
      profileData: ProfileData,
    ): Promise<AuthResponse> => {
      const response = await authService.createOrUpdateProfile(profileData);

      if (response.success && response.data?.profile) {
        setProfile(response.data.profile);
      }

      return response;
    };

    const updateProfile = async (
      updates: Partial<ProfileData>,
    ): Promise<AuthResponse> => {
      const response = await authService.updateMyProfile(updates);

      if (response.success && response.data?.profile) {
        setProfile(response.data.profile);
      }

      return response;
    };

    const logout = async () => {
      await authService.logout();
      // Clear auth token from AuthService
      authService.clearAuthToken();
      // Clear all session data including the service context
      authService.clearAllSessionData();
      setUser(null);
      setProfile(null);
    };

    const refreshProfile = async () => {
      await loadProfile();
    };

    const acknowledgeTermsUpdate = async (): Promise<AuthResponse> => {
      const response = await authService.acknowledgeTermsUpdate();
      if (response.success) await loadProfile();
      return response;
    };

    const value = {
      user,
      profile,
      isAuthenticated: !!user,
      isLoading,
      sendOTP,
      verifyOTP,
      createOrUpdateProfile,
      updateProfile,
      logout,
      refreshProfile,
      acknowledgeTermsUpdate,
    };

    return (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
  }

  function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
      throw new Error("useAuth must be used within a AuthProvider");
    }
    return context;
  }

  return { AuthProvider, useAuth };
}

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "../types";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prevent duplicate operations
  const isInitializingRef = useRef(false);
  const sessionRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("🔐 Auth state changed:", _event, session?.user?.id);

      if (_event === "SIGNED_OUT") {
        console.log("👋 User signed out");
        setUser(null);
        setLoading(false);
        stopSessionRefresh();
      } else if (_event === "TOKEN_REFRESHED") {
        console.log("🔄 Token refreshed");
      } else if (session?.user) {
        await fetchUser(session.user.id);
        startSessionRefresh();
      } else {
        setUser(null);
        setLoading(false);
        stopSessionRefresh();
      }
    });

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
      stopSessionRefresh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initAuth = async () => {
    if (isInitializingRef.current) {
      console.log("⏭️ Already initializing, skipping...");
      return;
    }

    isInitializingRef.current = true;
    console.log("🔐 Initializing auth...");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (session?.user) {
        console.log("✅ Existing session found:", session.user.id);
        await checkAndRefreshSession(session);
        await fetchUser(session.user.id);
        startSessionRefresh();
      } else {
        console.log("👤 No session, creating anonymous user...");
        await signInAnonymously();
      }
    } catch (err: any) {
      console.error("❌ Init auth error:", err);
      if (isMountedRef.current) {
        setError(err?.message ?? "Failed to initialize authentication");
        setLoading(false);
      }
    } finally {
      isInitializingRef.current = false;
    }
  };

  const checkAndRefreshSession = async (session: any) => {
    if (!session?.expires_at) return;

    const expiresAt = new Date(session.expires_at * 1000);
    const timeUntilExpiry = expiresAt.getTime() - Date.now();

    if (timeUntilExpiry < 5 * 60 * 1000) {
      console.log("🔄 Session expiring soon, refreshing...");
      try {
        const { error } = await supabase.auth.refreshSession();
        if (error) throw error;
        console.log("✅ Session refreshed successfully");
      } catch (err) {
        console.error("❌ Error refreshing session:", err);
      }
    }
  };

  const startSessionRefresh = () => {
    stopSessionRefresh();
    console.log("⏰ Starting session refresh timer (15 min)");

    sessionRefreshIntervalRef.current = setInterval(async () => {
      try {
        console.log("🔄 Auto-refreshing session...");
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          console.error("❌ Auto-refresh error:", error);
          await initAuth();
        } else {
          console.log("✅ Session auto-refreshed");
        }
      } catch (err) {
        console.error("❌ Error in auto-refresh:", err);
      }
    }, 15 * 60 * 1000);
  };

  const stopSessionRefresh = () => {
    if (sessionRefreshIntervalRef.current) {
      console.log("⏹️ Stopping session refresh timer");
      clearInterval(sessionRefreshIntervalRef.current);
      sessionRefreshIntervalRef.current = null;
    }
  };

  const fetchUser = async (userId: string) => {
    try {
      console.log("📥 Fetching user:", userId);

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("❌ Fetch user error:", error);
        if (error.code === "PGRST116") {
          await createUserRecord(userId);
        } else {
          throw error;
        }
        return;
      }

      if (data) {
        console.log("✅ User found:", data.id);
        setUser(data);
        setError(null);
      } else {
        console.log("👤 User not in DB, creating...");
        await createUserRecord(userId);
      }
    } catch (err: any) {
      console.error("❌ Error in fetchUser:", err);
      setError("Failed to fetch user data");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const createUserRecord = async (userId: string) => {
    try {
      console.log("➕ Creating user record:", userId);

      const { data, error } = await supabase
        .from("users")
        .upsert(
          {
            id: userId,
            is_anonymous: true,
            status: "online",
            last_active: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select()
        .single();

      if (error) throw error;

      console.log("✅ User created/updated:", data.id);
      setUser(data);
      setError(null);
    } catch (err: any) {
      console.error("❌ Error creating user record:", err);
      setError("Failed to create user account");
      throw err;
    }
  };

  const signInAnonymously = async () => {
    try {
      console.log("🔑 Signing in anonymously...");
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;

      if (data.user) {
        console.log("✅ Anonymous sign in success:", data.user.id);
        await createUserRecord(data.user.id);
        startSessionRefresh();
      }
    } catch (err: any) {
      console.error("❌ Error signing in anonymously:", err);
      setError("Authentication failed");
      setLoading(false);
    }
  };

  const updatePresence = async (screen: string) => {
    if (!user) return console.log("⏭️ No user, skipping presence update");

    try {
      const { error } = await supabase
        .from("users")
        .update({
          last_active: new Date().toISOString(),
          status:
            screen === "call"
              ? "in_call"
              : screen === "waiting"
              ? "in_queue"
              : "online",
        })
        .eq("id", user.id);

      if (error) console.error("❌ Error updating presence:", error);
      else console.log("✅ Presence updated:", screen);
    } catch (err) {
      console.error("❌ Error updating presence:", err);
    }
  };

  const refreshUser = async () => {
    if (user?.id) {
      console.log("🔄 Manually refreshing user data...");
      await fetchUser(user.id);
    }
  };

  const signOut = async () => {
    try {
      console.log("👋 Signing out...");
      if (user?.id) {
        await supabase.from("users").update({ status: "offline" }).eq("id", user.id);
      }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      console.log("✅ Signed out successfully");
      setUser(null);
      stopSessionRefresh();
    } catch (err) {
      console.error("❌ Error signing out:", err);
    }
  };

  return {
    user,
    loading,
    error,
    updatePresence,
    refreshUser,
    signOut,
  };
};

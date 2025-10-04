import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isInitializingRef = useRef(false);
  const sessionRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);


  const createUserRecord = useCallback(async (userId: string) => {
    try {
      console.log('➕ Creating user record:', userId);
      
      // Add timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Create user timeout')), 5000)
      );
      
      const createPromise = supabase
        .from('users')
        .upsert(
          {
            id: userId,
            is_anonymous: true,
            status: 'online',
            last_active: new Date().toISOString(),
            karma_score: 0,
            total_calls: 0,
            total_minutes: 0,
            preferred_language: 'en',
            preferred_duration: 10,
            is_banned: false,
            report_count: 0,
          },
          { onConflict: 'id' }
        )
        .select()
        .single();
  
      const { data, error } = await Promise.race([createPromise, timeoutPromise]) as any;
  
      if (error) {
        throw error;
      }
  
      console.log('✅ User created/updated:', data.id);
      if (isMountedRef.current) {
        setUser(data);
        setError(null);
        setLoading(false);
      }
    } catch (err: any) {
      console.error('❌ Error creating user record:', err);
      
      // CREATE FALLBACK USER WHEN DB FAILS
      if (isMountedRef.current) {
        const fallbackUser = {
          id: userId,
          is_anonymous: true,
          status: 'online' as const,
          created_at: new Date().toISOString(),
          last_active: new Date().toISOString(),
          karma_score: 0,
          total_calls: 0,
          total_minutes: 0,
          preferred_language: 'en',
          preferred_duration: 10,
          current_call_id: null,
          is_banned: false,
          report_count: 0,
          email: null,
          city: null,
          country: null,
          country_code: null,
          latitude: null,
          longitude: null,
        };
        console.log('⚠️ Using fallback user (DB timeout)');
        setUser(fallbackUser);
        setError('Database connection slow - app may have limited functionality');
        setLoading(false);
      }
    }
  }, []);

const fetchUser = useCallback(
  async (userId: string) => {
    try {
      console.log('📥 Fetching user:', userId);
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 5000)
      );
      
      const queryPromise = supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

      console.log('📊 Fetch result:', { data, error });

      if (error) {
        console.error('❌ Fetch user error:', error);
        if (error.code === 'PGRST116') {
          await createUserRecord(userId);
        } else {
          throw error;
        }
        return;
      }

      if (data) {
        console.log('✅ User found:', data.id);
        if (isMountedRef.current) {
          setUser(data);
          setError(null);
          setLoading(false);
        }
      } else {
        console.log('👤 User not in DB, creating...');
        await createUserRecord(userId);
      }
    } catch (err: any) {
      console.error('❌ Error in fetchUser:', err);
      
      // If timeout or network error, try creating user anyway
      if (err.message === 'Query timeout' || err.message?.includes('network')) {
        console.log('⚠️ Query failed, attempting to create user...');
        try {
          await createUserRecord(userId);
        } catch (createErr) {
          if (isMountedRef.current) {
            setError('Failed to fetch user data. Please refresh the page.');
            setLoading(false);
          }
        }
      } else {
        if (isMountedRef.current) {
          setError('Failed to fetch user data. Please refresh the page.');
          setLoading(false);
        }
      }
    }
  },
  [createUserRecord]
);

  const stopSessionRefresh = useCallback(() => {
    if (sessionRefreshIntervalRef.current) {
      console.log('⏹️ Stopping session refresh timer');
      clearInterval(sessionRefreshIntervalRef.current);
      sessionRefreshIntervalRef.current = null;
    }
  }, []);

  const startSessionRefresh = useCallback(() => {
    stopSessionRefresh();
    console.log('⏰ Starting session refresh timer (15 min)');

    sessionRefreshIntervalRef.current = setInterval(async () => {
      try {
        console.log('🔄 Auto-refreshing session...');
        const { error } = await supabase.auth.refreshSession();
        if (error) throw error;
        console.log('✅ Session auto-refreshed');
      } catch (err) {
        console.error('❌ Error in auto-refresh:', err);
      }
    }, 15 * 60 * 1000);
  }, [stopSessionRefresh]);

  const signInAnonymously = useCallback(async () => {
    try {
      console.log('🔑 Signing in anonymously...');
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;

      if (data.user) {
        console.log('✅ Anonymous sign-in success:', data.user.id);
        await createUserRecord(data.user.id);
        startSessionRefresh();
      }
    } catch (err: any) {
      console.error('❌ Error signing in anonymously:', err);
      if (isMountedRef.current) {
        setError('Authentication failed. Please check your connection and try again.');
        setLoading(false);
      }
    }
  }, [createUserRecord, startSessionRefresh]);

  const checkAndRefreshSession = useCallback(async (session: any) => {
    if (!session?.expires_at) return;

    const expiresAt = new Date(session.expires_at * 1000);
    const timeUntilExpiry = expiresAt.getTime() - Date.now();

    if (timeUntilExpiry < 5 * 60 * 1000) {
      console.log('🔄 Session expiring soon, refreshing...');
      try {
        const { error } = await supabase.auth.refreshSession();
        if (error) throw error;
        console.log('✅ Session refreshed successfully');
      } catch (err) {
        console.error('❌ Error refreshing session:', err);
      }
    }
  }, []);

  const initAuth = useCallback(async () => {
    if (isInitializingRef.current) {
      console.log('⏭️ Already initializing, skipping...');
      return;
    }

    isInitializingRef.current = true;
    console.log('🔐 Initializing auth...');

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (session?.user) {
        console.log('✅ Existing session found:', session.user.id);
        await checkAndRefreshSession(session);
        await fetchUser(session.user.id);
        startSessionRefresh();
      } else {
        console.log('👤 No session, creating anonymous user...');
        await signInAnonymously();
      }
    } catch (err: any) {
      console.error('❌ Init auth error:', err);
      if (isMountedRef.current) {
        setError('Failed to initialize authentication. Please check your connection and try again.');
        setLoading(false);
      }
    } finally {
      isInitializingRef.current = false;
    }
  }, [checkAndRefreshSession, fetchUser, signInAnonymously, startSessionRefresh]);

  useEffect(() => {
    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔐 Auth state changed:', event, session?.user?.id);

      if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        if (isMountedRef.current) {
          setUser(null);
          setLoading(false);
        }
        stopSessionRefresh();
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token refreshed');
      } else if (session?.user) {
        await fetchUser(session.user.id);
        startSessionRefresh();
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
      stopSessionRefresh();
    };
  }, [initAuth, fetchUser, startSessionRefresh, stopSessionRefresh]);

  const updatePresence = useCallback(
    async (screen: string) => {
      if (!user) {
        console.log('⏭️ No user, skipping presence update');
        return;
      }

      try {
        const { error } = await supabase
          .from('users')
          .update({
            last_active: new Date().toISOString(),
            status: screen === 'call' ? 'in_call' : screen === 'waiting' ? 'in_queue' : 'online',
          })
          .eq('id', user.id);

        if (error) throw error;
        console.log('✅ Presence updated:', screen);
      } catch (err) {
        console.error('❌ Error updating presence:', err);
      }
    },
    [user]
  );

  const refreshUser = useCallback(async () => {
    if (user?.id) {
      console.log('🔄 Manually refreshing user data...');
      await fetchUser(user.id);
    }
  }, [user?.id, fetchUser]);

  const signOut = useCallback(async () => {
    try {
      console.log('👋 Signing out...');
      if (user?.id) {
        await supabase.from('users').update({ status: 'offline' }).eq('id', user.id);
      }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      console.log('✅ Signed out successfully');
      setUser(null);
      stopSessionRefresh();
    } catch (err) {
      console.error('❌ Error signing out:', err);
    }
  }, [user?.id, stopSessionRefresh]);

  return {
    user,
    loading,
    error,
    updatePresence,
    refreshUser,
    signOut,
  };
};
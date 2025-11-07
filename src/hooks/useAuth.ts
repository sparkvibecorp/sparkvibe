import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* --------------------------------------------------------------
     Helper: upsert user profile (idempotent)
  -------------------------------------------------------------- */
  const upsertProfile = async (u: User) => {
    const { error } = await supabase
      .from('users')
      .upsert(
        {
          id: u.id,
          email: u.email!,
          full_name: u.user_metadata.full_name ?? null,
          avatar_url: u.user_metadata.avatar_url ?? null,
          status: 'online',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' } // <-- crucial
      );

    if (error) {
      console.error('upsertProfile error:', error);
    } else {
      console.log('Profile synced for', u.id);
    }
  };

  /* --------------------------------------------------------------
     Initial session + auth listener
  -------------------------------------------------------------- */
  useEffect(() => {
    // 1. Get current session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) console.error('getSession error:', error);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // If we already have a session, make sure profile exists
      if (session?.user) upsertProfile(session.user);
    });

    // 2. Listen for any auth change
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, sess) => {
        setSession(sess);
        setUser(sess?.user ?? null);
        setLoading(false);
        setError(null);

        // Create profile on first sign-in (or any sign-in)
        if (event === 'SIGNED_IN' && sess?.user) {
          await upsertProfile(sess.user);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  /* --------------------------------------------------------------
     Sign-in / Sign-out
  -------------------------------------------------------------- */
  const signIn = async () => {
    try {
      setLoading(true);
      setError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/onboarding` },
      });
      if (error) throw error;
    } catch (e: any) {
      console.error('signIn error:', e);
      setError(e.message ?? 'Sign-in failed');
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      setError(null);

      // Mark offline
      if (user?.id) {
        await supabase
          .from('users')
          .update({ status: 'offline', current_call_id: null })
          .eq('id', user.id);
      }

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);
      setSession(null);
    } catch (e: any) {
      console.error('signOut error:', e);
      setError(e.message ?? 'Sign-out failed');
    } finally {
      setLoading(false);
    }
  };

  return { user, session, loading, error, signIn, signOut };
}
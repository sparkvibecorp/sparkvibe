import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Generate unique storage key per browser session/tab
// This ensures each window gets its own anonymous user
const sessionId = sessionStorage.getItem('sparkvibe_session_id') || 
  `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

if (!sessionStorage.getItem('sparkvibe_session_id')) {
  sessionStorage.setItem('sparkvibe_session_id', sessionId)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.sessionStorage, // Use sessionStorage instead of localStorage
    storageKey: `sparkvibe-auth-${sessionId}`, // Unique key per session
    flowType: 'implicit'
  }
})
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          created_at: string
          last_active: string
          is_anonymous: boolean
          email: string | null
          karma_score: number
          total_calls: number
          total_minutes: number
          preferred_language: string
          preferred_duration: number
          status: 'offline' | 'online' | 'in_call' | 'in_queue'
          current_call_id: string | null
          is_banned: boolean
          report_count: number
          city: string | null
          country: string | null
          country_code: string | null
          latitude: number | null
          longitude: number | null
        }
        Insert: {
          id?: string
          created_at?: string
          last_active?: string
          is_anonymous?: boolean
          email?: string | null
          karma_score?: number
          total_calls?: number
          total_minutes?: number
          preferred_language?: string
          preferred_duration?: number
          status?: 'offline' | 'online' | 'in_call' | 'in_queue'
          current_call_id?: string | null
          is_banned?: boolean
          report_count?: number
          city?: string | null
          country?: string | null
          country_code?: string | null
          latitude?: number | null
          longitude?: number | null
        }
        Update: {
          id?: string
          created_at?: string
          last_active?: string
          is_anonymous?: boolean
          email?: string | null
          karma_score?: number
          total_calls?: number
          total_minutes?: number
          preferred_language?: string
          preferred_duration?: number
          status?: 'offline' | 'online' | 'in_call' | 'in_queue'
          current_call_id?: string | null
          is_banned?: boolean
          report_count?: number
          city?: string | null
          country?: string | null
          country_code?: string | null
          latitude?: number | null
          longitude?: number | null
        }
      }
      calls: {
        Row: {
          id: string
          created_at: string
          user1_id: string
          user2_id: string
          started_at: string | null
          ended_at: string | null
          duration_seconds: number | null
          planned_duration: number
          connection_quality: string | null
          rating_user1: number | null
          rating_user2: number | null
          vulnerability_spins: number
          emotional_syncs: number
          distance_km: number | null
          status: 'connecting' | 'active' | 'ended' | 'failed'
        }
        Insert: {
          id?: string
          created_at?: string
          user1_id: string
          user2_id: string
          started_at?: string | null
          ended_at?: string | null
          duration_seconds?: number | null
          planned_duration: number
          connection_quality?: string | null
          rating_user1?: number | null
          rating_user2?: number | null
          vulnerability_spins?: number
          emotional_syncs?: number
          distance_km?: number | null
          status?: 'connecting' | 'active' | 'ended' | 'failed'
        }
        Update: {
          id?: string
          created_at?: string
          user1_id?: string
          user2_id?: string
          started_at?: string | null
          ended_at?: string | null
          duration_seconds?: number | null
          planned_duration?: number
          connection_quality?: string | null
          rating_user1?: number | null
          rating_user2?: number | null
          vulnerability_spins?: number
          emotional_syncs?: number
          distance_km?: number | null
          status?: 'connecting' | 'active' | 'ended' | 'failed'
        }
      }
      call_queue: {
        Row: {
          id: string
          user_id: string
          created_at: string
          duration: number
          language: string
          status: 'waiting' | 'matched' | 'cancelled' | 'expired'
          matched_with: string | null
          matched_at: string | null
          expires_at: string
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          duration: number
          language?: string
          status?: 'waiting' | 'matched' | 'cancelled' | 'expired'
          matched_with?: string | null
          matched_at?: string | null
          expires_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          duration?: number
          language?: string
          status?: 'waiting' | 'matched' | 'cancelled' | 'expired'
          matched_with?: string | null
          matched_at?: string | null
          expires_at?: string
        }
      }
      vulnerability_questions: {
        Row: {
          id: string
          created_at: string
          question: string
          difficulty: 'light' | 'medium' | 'deep'
          category: string | null
          times_used: number
          average_rating: number | null
          is_active: boolean
        }
        Insert: {
          id?: string
          created_at?: string
          question: string
          difficulty: 'light' | 'medium' | 'deep'
          category?: string | null
          times_used?: number
          average_rating?: number | null
          is_active?: boolean
        }
        Update: {
          id?: string
          created_at?: string
          question?: string
          difficulty?: 'light' | 'medium' | 'deep'
          category?: string | null
          times_used?: number
          average_rating?: number | null
          is_active?: boolean
        }
      }
      webrtc_signals: {
        Row: {
          id: string
          created_at: string
          call_id: string
          sender_id: string
          receiver_id: string
          signal_type: 'offer' | 'answer' | 'ice-candidate'
          signal_data: Json
          is_read: boolean
        }
        Insert: {
          id?: string
          created_at?: string
          call_id: string
          sender_id: string
          receiver_id: string
          signal_type: 'offer' | 'answer' | 'ice-candidate'
          signal_data: Json
          is_read?: boolean
        }
        Update: {
          id?: string
          created_at?: string
          call_id?: string
          sender_id?: string
          receiver_id?: string
          signal_type?: 'offer' | 'answer' | 'ice-candidate'
          signal_data?: Json
          is_read?: boolean
        }
      }
    }
    Functions: {
      get_live_stats: {
        Args: Record<string, never>
        Returns: {
          active_users: number
          users_in_queue: number
          ongoing_calls: number
        }[]
      }
      can_join_queue: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      update_presence: {
        Args: { p_user_id: string; p_screen?: string }
        Returns: void
      }
      track_question_used: {
        Args: { p_question_id: string; p_call_id: string; p_user_id: string }
        Returns: void
      }
      track_emotional_sync: {
        Args: {
          p_call_id: string
          p_user1_emotion: string
          p_user2_emotion: string
          p_sync_strength: number
          p_seconds_into_call: number
        }
        Returns: void
      }
    }
  }
}

export type User = Database['public']['Tables']['users']['Row']
export type Call = Database['public']['Tables']['calls']['Row']
export type CallQueue = Database['public']['Tables']['call_queue']['Row']
export type VulnerabilityQuestion = Database['public']['Tables']['vulnerability_questions']['Row']
export type WebRTCSignal = Database['public']['Tables']['webrtc_signals']['Row']

export type EmotionType = 'excited' | 'calm' | 'happy' | 'contemplative'

export interface LiveStats {
  active_users: number
  users_in_queue: number
  ongoing_calls: number
}
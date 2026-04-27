export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      access_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          label: string | null
          max_uses: number | null
          movie_id: string | null
          token: string
          uses: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          label?: string | null
          max_uses?: number | null
          movie_id?: string | null
          token?: string
          uses?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          label?: string | null
          max_uses?: number | null
          movie_id?: string | null
          token?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "access_tokens_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_devices: {
        Row: {
          created_at: string
          device_id: string
          device_label: string | null
          id: string
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_label?: string | null
          id?: string
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_label?: string | null
          id?: string
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      live_channels: {
        Row: {
          category: string | null
          created_at: string
          fallback_url: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          sort_order: number
          stream_url: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          fallback_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          sort_order?: number
          stream_url: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          fallback_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          sort_order?: number
          stream_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      login_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          device_id: string
          device_label: string | null
          expires_at: string
          id: string
          ip_address: string | null
          status: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          device_id: string
          device_label?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          status?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          device_id?: string
          device_label?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      movies: {
        Row: {
          audio: string | null
          created_at: string
          description: string | null
          duration: string | null
          genre: string | null
          id: string
          rating: string | null
          status: string | null
          telegram_url: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
          year: number | null
        }
        Insert: {
          audio?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          genre?: string | null
          id?: string
          rating?: string | null
          status?: string | null
          telegram_url?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
          year?: number | null
        }
        Update: {
          audio?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          genre?: string | null
          id?: string
          rating?: string | null
          status?: string | null
          telegram_url?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
          year?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plan_movies: {
        Row: {
          created_at: string
          id: string
          movie_id: string
          plan_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          movie_id: string
          plan_id: string
        }
        Update: {
          created_at?: string
          id?: string
          movie_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_movies_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_movies_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          duration_days: number
          features: Json | null
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_days?: number
          features?: Json | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_days?: number
          features?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          plan: string | null
          status: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          plan?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          plan?: string | null
          status?: string | null
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount: number
          created_at: string
          id: string
          metadata: Json | null
          method: string
          mp_payment_id: string | null
          mp_qr_code: string | null
          mp_qr_code_base64: string | null
          mp_ticket_url: string | null
          paid_at: string | null
          plan: string
          status: string
          updated_at: string
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          metadata?: Json | null
          method?: string
          mp_payment_id?: string | null
          mp_qr_code?: string | null
          mp_qr_code_base64?: string | null
          mp_ticket_url?: string | null
          paid_at?: string | null
          plan: string
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          method?: string
          mp_payment_id?: string | null
          mp_qr_code?: string | null
          mp_qr_code_base64?: string | null
          mp_ticket_url?: string | null
          paid_at?: string | null
          plan?: string
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      sponsors: {
        Row: {
          clicks: number
          created_at: string
          expires_at: string | null
          id: string
          impressions: number
          is_active: boolean
          logo_url: string | null
          monthly_amount: number
          name: string
          placement: string
          sort_order: number
          starts_at: string
          target_url: string
          updated_at: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          impressions?: number
          is_active?: boolean
          logo_url?: string | null
          monthly_amount?: number
          name: string
          placement?: string
          sort_order?: number
          starts_at?: string
          target_url: string
          updated_at?: string
        }
        Update: {
          clicks?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          impressions?: number
          is_active?: boolean
          logo_url?: string | null
          monthly_amount?: number
          name?: string
          placement?: string
          sort_order?: number
          starts_at?: string
          target_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_payment_id: string | null
          plan: string
          plan_id: string | null
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_payment_id?: string | null
          plan?: string
          plan_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_payment_id?: string | null
          plan?: string
          plan_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          caption: string | null
          chat_id: number
          created_at: string
          duration: number | null
          file_id: string | null
          file_size: number | null
          file_unique_id: string | null
          message_id: number | null
          mime_type: string | null
          movie_id: string | null
          processed_at: string | null
          processing_error: string | null
          processing_status: string
          raw_update: Json
          text: string | null
          thumb_file_id: string | null
          update_id: number
        }
        Insert: {
          caption?: string | null
          chat_id: number
          created_at?: string
          duration?: number | null
          file_id?: string | null
          file_size?: number | null
          file_unique_id?: string | null
          message_id?: number | null
          mime_type?: string | null
          movie_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          raw_update: Json
          text?: string | null
          thumb_file_id?: string | null
          update_id: number
        }
        Update: {
          caption?: string | null
          chat_id?: number
          created_at?: string
          duration?: number | null
          file_id?: string | null
          file_size?: number | null
          file_unique_id?: string | null
          message_id?: number | null
          mime_type?: string | null
          movie_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          raw_update?: Json
          text?: string | null
          thumb_file_id?: string | null
          update_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "telegram_messages_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string | null
          plan: string
          status: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string | null
          plan: string
          status?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string | null
          plan?: string
          status?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      upload_jobs: {
        Row: {
          created_at: string
          description: string | null
          device_label: string | null
          error_msg: string | null
          eta_sec: number
          file_name: string
          file_size: number
          genre: string | null
          id: string
          progress: number
          speed_mbs: number
          started_at: string | null
          status: string
          title: string
          updated_at: string
          upload_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          device_label?: string | null
          error_msg?: string | null
          eta_sec?: number
          file_name: string
          file_size?: number
          genre?: string | null
          id: string
          progress?: number
          speed_mbs?: number
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
          upload_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          device_label?: string | null
          error_msg?: string | null
          eta_sec?: number
          file_name?: string
          file_size?: number
          genre?: string | null
          id?: string
          progress?: number
          speed_mbs?: number
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          upload_path?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_movie_access: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          movie_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          movie_id: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          movie_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_movie_access_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_views: {
        Row: {
          created_at: string
          id: string
          movie_id: string
          user_id: string | null
          watched_seconds: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          movie_id: string
          user_id?: string | null
          watched_seconds?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          movie_id?: string
          user_id?: string | null
          watched_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_views_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_set_user_status: {
        Args: { _status: string; _target: string }
        Returns: boolean
      }
      check_admin_login_status: { Args: { _request_id: string }; Returns: Json }
      consume_access_token: { Args: { _token: string }; Returns: undefined }
      decide_admin_login: {
        Args: { _decision: string; _request_id: string }
        Returns: Json
      }
      has_active_access: { Args: { _user_id: string }; Returns: boolean }
      has_movie_access: {
        Args: { _movie_id: string; _user_id: string }
        Returns: boolean
      }
      has_plan_access: {
        Args: { _movie_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_device_authorized: { Args: { _device_id: string }; Returns: boolean }
      redeem_access_token: {
        Args: { _movie_id: string; _token: string }
        Returns: Json
      }
      register_admin_device: {
        Args: { _device_id: string; _label: string; _ua: string }
        Returns: Json
      }
      request_admin_login: {
        Args: { _device_id: string; _device_label: string; _user_agent: string }
        Returns: Json
      }
      track_sponsor_event: {
        Args: { _event: string; _sponsor_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const

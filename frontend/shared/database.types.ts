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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      aggregates_state: {
        Row: {
          id: boolean
          last_run_at: string
        }
        Insert: {
          id?: boolean
          last_run_at: string
        }
        Update: {
          id?: boolean
          last_run_at?: string
        }
        Relationships: []
      }
      daily_messages: {
        Row: {
          body: string
          day: string
          sent_at: string
          title: string
        }
        Insert: {
          body: string
          day: string
          sent_at?: string
          title: string
        }
        Update: {
          body?: string
          day?: string
          sent_at?: string
          title?: string
        }
        Relationships: []
      }
      device_events: {
        Row: {
          device_id: string
          id: number
          inserted_at: string
          kind: string
          message: string
          ts: string
        }
        Insert: {
          device_id: string
          id?: never
          inserted_at?: string
          kind: string
          message: string
          ts: string
        }
        Update: {
          device_id?: string
          id?: never
          inserted_at?: string
          kind?: string
          message?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["device_id"]
          },
        ]
      }
      devices: {
        Row: {
          active: boolean
          created_at: string
          device_id: string
          display_name: string | null
          key_sha256: string
          listed: boolean
          name: string
          target_fw: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          device_id: string
          display_name?: string | null
          key_sha256: string
          listed?: boolean
          name: string
          target_fw?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          device_id?: string
          display_name?: string | null
          key_sha256?: string
          listed?: boolean
          name?: string
          target_fw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_target_fw_fkey"
            columns: ["target_fw"]
            isOneToOne: false
            referencedRelation: "firmware_releases"
            referencedColumns: ["version"]
          },
        ]
      }
      firmware_releases: {
        Row: {
          created_at: string
          notes: string | null
          path: string
          sha256: string
          size_bytes: number
          version: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          path: string
          sha256: string
          size_bytes: number
          version: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          path?: string
          sha256?: string
          size_bytes?: number
          version?: string
        }
        Relationships: []
      }
      push_daily_runs: {
        Row: {
          body: string | null
          created_at: string
          day: string
          failed: number | null
          removed: number | null
          sent: number | null
          title: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          day: string
          failed?: number | null
          removed?: number | null
          sent?: number | null
          title?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          day?: string
          failed?: number | null
          removed?: number | null
          sent?: number | null
          title?: string | null
        }
        Relationships: []
      }
      push_requests: {
        Row: {
          at: string
          ip_hash: string
        }
        Insert: {
          at?: string
          ip_hash: string
        }
        Update: {
          at?: string
          ip_hash?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: number
          last_sent_at: string | null
          p256dh: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: never
          last_sent_at?: string | null
          p256dh: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: never
          last_sent_at?: string | null
          p256dh?: string
        }
        Relationships: []
      }
      readings: {
        Row: {
          device_id: string
          free_heap: number | null
          fw: string | null
          humidity_pct: number | null
          id: number
          inserted_at: string
          pressure_hpa: number | null
          rain_mm: number
          rssi: number | null
          temp_c: number | null
          ts: string
          uptime_s: number | null
          wifi_disconnects: number | null
          wind_avg_ms: number | null
          wind_dir_deg: number | null
          wind_gust_ms: number | null
        }
        Insert: {
          device_id: string
          free_heap?: number | null
          fw?: string | null
          humidity_pct?: number | null
          id?: never
          inserted_at?: string
          pressure_hpa?: number | null
          rain_mm?: number
          rssi?: number | null
          temp_c?: number | null
          ts: string
          uptime_s?: number | null
          wifi_disconnects?: number | null
          wind_avg_ms?: number | null
          wind_dir_deg?: number | null
          wind_gust_ms?: number | null
        }
        Update: {
          device_id?: string
          free_heap?: number | null
          fw?: string | null
          humidity_pct?: number | null
          id?: never
          inserted_at?: string
          pressure_hpa?: number | null
          rain_mm?: number
          rssi?: number | null
          temp_c?: number | null
          ts?: string
          uptime_s?: number | null
          wifi_disconnects?: number | null
          wind_avg_ms?: number | null
          wind_dir_deg?: number | null
          wind_gust_ms?: number | null
        }
        Relationships: []
      }
      readings_daily: {
        Row: {
          day: string
          device_id: string
          humidity_avg: number | null
          humidity_max: number | null
          humidity_min: number | null
          pressure_avg: number | null
          pressure_max: number | null
          pressure_min: number | null
          rain_mm: number | null
          samples: number
          temp_avg: number | null
          temp_max: number | null
          temp_max_at: string | null
          temp_min: number | null
          temp_min_at: string | null
          wind_avg_ms: number | null
          wind_dir_deg: number | null
          wind_gust_max: number | null
          wind_gust_max_at: string | null
        }
        Insert: {
          day: string
          device_id: string
          humidity_avg?: number | null
          humidity_max?: number | null
          humidity_min?: number | null
          pressure_avg?: number | null
          pressure_max?: number | null
          pressure_min?: number | null
          rain_mm?: number | null
          samples: number
          temp_avg?: number | null
          temp_max?: number | null
          temp_max_at?: string | null
          temp_min?: number | null
          temp_min_at?: string | null
          wind_avg_ms?: number | null
          wind_dir_deg?: number | null
          wind_gust_max?: number | null
          wind_gust_max_at?: string | null
        }
        Update: {
          day?: string
          device_id?: string
          humidity_avg?: number | null
          humidity_max?: number | null
          humidity_min?: number | null
          pressure_avg?: number | null
          pressure_max?: number | null
          pressure_min?: number | null
          rain_mm?: number | null
          samples?: number
          temp_avg?: number | null
          temp_max?: number | null
          temp_max_at?: string | null
          temp_min?: number | null
          temp_min_at?: string | null
          wind_avg_ms?: number | null
          wind_dir_deg?: number | null
          wind_gust_max?: number | null
          wind_gust_max_at?: string | null
        }
        Relationships: []
      }
      readings_hourly: {
        Row: {
          device_id: string
          hour: string
          humidity_avg: number | null
          humidity_max: number | null
          humidity_min: number | null
          pressure_avg: number | null
          pressure_max: number | null
          pressure_min: number | null
          rain_mm: number | null
          samples: number
          temp_avg: number | null
          temp_max: number | null
          temp_max_at: string | null
          temp_min: number | null
          temp_min_at: string | null
          wind_avg_ms: number | null
          wind_dir_deg: number | null
          wind_gust_max: number | null
          wind_gust_max_at: string | null
        }
        Insert: {
          device_id: string
          hour: string
          humidity_avg?: number | null
          humidity_max?: number | null
          humidity_min?: number | null
          pressure_avg?: number | null
          pressure_max?: number | null
          pressure_min?: number | null
          rain_mm?: number | null
          samples: number
          temp_avg?: number | null
          temp_max?: number | null
          temp_max_at?: string | null
          temp_min?: number | null
          temp_min_at?: string | null
          wind_avg_ms?: number | null
          wind_dir_deg?: number | null
          wind_gust_max?: number | null
          wind_gust_max_at?: string | null
        }
        Update: {
          device_id?: string
          hour?: string
          humidity_avg?: number | null
          humidity_max?: number | null
          humidity_min?: number | null
          pressure_avg?: number | null
          pressure_max?: number | null
          pressure_min?: number | null
          rain_mm?: number | null
          samples?: number
          temp_avg?: number | null
          temp_max?: number | null
          temp_max_at?: string | null
          temp_min?: number | null
          temp_min_at?: string | null
          wind_avg_ms?: number | null
          wind_dir_deg?: number | null
          wind_gust_max?: number | null
          wind_gust_max_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hourly_stats: {
        Args: { p_device_id: string; p_from: string; p_to: string }
        Returns: {
          device_id: string
          hour: string
          humidity_avg: number | null
          humidity_max: number | null
          humidity_min: number | null
          pressure_avg: number | null
          pressure_max: number | null
          pressure_min: number | null
          rain_mm: number | null
          samples: number
          temp_avg: number | null
          temp_max: number | null
          temp_max_at: string | null
          temp_min: number | null
          temp_min_at: string | null
          wind_avg_ms: number | null
          wind_dir_deg: number | null
          wind_gust_max: number | null
          wind_gust_max_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "readings_hourly"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      refresh_aggregates_incremental: { Args: never; Returns: undefined }
      refresh_aggregates_since: {
        Args: { p_inserted_since: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

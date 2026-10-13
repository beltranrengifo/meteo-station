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
      readings: {
        Row: {
          device_id: string
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
          wind_avg_ms: number | null
          wind_dir_deg: number | null
          wind_gust_ms: number | null
        }
        Insert: {
          device_id: string
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
          wind_avg_ms?: number | null
          wind_dir_deg?: number | null
          wind_gust_ms?: number | null
        }
        Update: {
          device_id?: string
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

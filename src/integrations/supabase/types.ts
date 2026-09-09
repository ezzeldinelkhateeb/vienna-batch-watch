export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          callmebot_apikey: string | null;
          id: boolean;
          notify_channel: string;
          telegram_bot_token: string | null;
          telegram_chat_id: string | null;
          threshold_critical: number;
          threshold_early: number;
          threshold_medium: number;
          updated_at: string;
          whatsapp_phone: string | null;
        };
        Insert: {
          callmebot_apikey?: string | null;
          id?: boolean;
          notify_channel?: string;
          telegram_bot_token?: string | null;
          telegram_chat_id?: string | null;
          threshold_critical?: number;
          threshold_early?: number;
          threshold_medium?: number;
          updated_at?: string;
          whatsapp_phone?: string | null;
        };
        Update: {
          callmebot_apikey?: string | null;
          id?: boolean;
          notify_channel?: string;
          telegram_bot_token?: string | null;
          telegram_chat_id?: string | null;
          threshold_critical?: number;
          threshold_early?: number;
          threshold_medium?: number;
          updated_at?: string;
          whatsapp_phone?: string | null;
        };
        Relationships: [];
      };
      items: {
        Row: {
          batch_number: string | null;
          coa_number: string | null;
          created_at: string;
          created_by: string | null;
          expiry_date: string;
          id: string;
          item_code: string | null;
          last_notified_status: string | null;
          name: string;
          notes: string | null;
          photo_path: string | null;
          production_date: string | null;
          qc_inspected_at: string | null;
          qc_inspected_by: string | null;
          qc_notes: string | null;
          qc_status: Database["public"]["Enums"]["qc_status"];
          quantity: number | null;
          storage_location: string | null;
          supplier: string | null;
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          batch_number?: string | null;
          coa_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          expiry_date: string;
          id?: string;
          item_code?: string | null;
          last_notified_status?: string | null;
          name: string;
          notes?: string | null;
          photo_path?: string | null;
          production_date?: string | null;
          qc_inspected_at?: string | null;
          qc_inspected_by?: string | null;
          qc_notes?: string | null;
          qc_status?: Database["public"]["Enums"]["qc_status"];
          quantity?: number | null;
          storage_location?: string | null;
          supplier?: string | null;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          batch_number?: string | null;
          coa_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          expiry_date?: string;
          id?: string;
          item_code?: string | null;
          last_notified_status?: string | null;
          name?: string;
          notes?: string | null;
          photo_path?: string | null;
          production_date?: string | null;
          qc_inspected_at?: string | null;
          qc_inspected_by?: string | null;
          qc_notes?: string | null;
          qc_status?: Database["public"]["Enums"]["qc_status"];
          quantity?: number | null;
          storage_location?: string | null;
          supplier?: string | null;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_log: {
        Row: {
          channel: string;
          created_at: string;
          error: string | null;
          id: string;
          item_id: string | null;
          item_name: string;
          message: string | null;
          phone: string | null;
          status: string;
          success: boolean;
        };
        Insert: {
          channel?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          item_id?: string | null;
          item_name: string;
          message?: string | null;
          phone?: string | null;
          status: string;
          success?: boolean;
        };
        Update: {
          channel?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          item_id?: string | null;
          item_name?: string;
          message?: string | null;
          phone?: string | null;
          status?: string;
          success?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "notification_log_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "member";
      qc_status: "quarantine" | "approved" | "rejected" | "conditional";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
      qc_status: ["quarantine", "approved", "rejected", "conditional"],
    },
  },
} as const;

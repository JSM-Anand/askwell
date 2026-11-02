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
      accounts: {
        Row: {
          clerk_user_id: string
          created_at: string
          plan: string
        }
        Insert: {
          clerk_user_id: string
          created_at?: string
          plan?: string
        }
        Update: {
          clerk_user_id?: string
          created_at?: string
          plan?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          project_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          embedding: string
          id: string
          project_id: string
          source_id: string
        }
        Insert: {
          content: string
          embedding: string
          id?: string
          project_id: string
          source_id: string
        }
        Update: {
          content?: string
          embedding?: string
          id?: string
          project_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_source_id_project_id_fkey"
            columns: ["source_id", "project_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          created_at: string
          id: string
          project_id: string
          status: string
          storage_key: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          status?: string
          storage_key?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          status?: string
          storage_key?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          messages_used: number
          name: string
          owner_id: string
          period_start: string
          public_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages_used?: number
          name: string
          owner_id: string
          period_start?: string
          public_key: string
        }
        Update: {
          created_at?: string
          id?: string
          messages_used?: number
          name?: string
          owner_id?: string
          period_start?: string
          public_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["clerk_user_id"]
          },
        ]
      }
      widget_configs: {
        Row: {
          animation: string
          button_color: string
          header_text: string
          label: string
          position: string
          project_id: string
          show_badge: boolean
        }
        Insert: {
          animation?: string
          button_color?: string
          header_text?: string
          label?: string
          position?: string
          project_id: string
          show_badge?: boolean
        }
        Update: {
          animation?: string
          button_color?: string
          header_text?: string
          label?: string
          position?: string
          project_id?: string
          show_badge?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "widget_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_message: {
        Args: { p_limit: number; p_project_id: string }
        Returns: boolean
      }
      create_project: {
        Args: {
          p_max_projects: number
          p_name: string
          p_owner_id: string
          p_public_key: string
        }
        Returns: {
          created_at: string
          id: string
          messages_used: number
          name: string
          owner_id: string
          period_start: string
          public_key: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_chunks: {
        Args: { p_count: number; p_embedding: string; p_project_id: string }
        Returns: {
          content: string
          id: string
          similarity: number
          source_id: string
        }[]
      }
      owned_conversation_ids: { Args: never; Returns: string[] }
      owned_project_ids: { Args: never; Returns: string[] }
      owner_activity: {
        Args: { p_limit?: number; p_project_id: string }
        Returns: {
          created_at: string
          first_message_preview: string
          id: string
          message_count: number
          visitor_id: string
        }[]
      }
      reserve_knowledge_source: {
        Args: {
          p_max_sources: number
          p_project_id: string
          p_title: string
          p_type: string
        }
        Returns: {
          created_at: string
          id: string
          project_id: string
          status: string
          storage_key: string | null
          title: string
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_sources"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_chat_turn: {
        Args: {
          p_bot_reply: string
          p_conversation_id: string
          p_project_id: string
          p_visitor_id: string
          p_visitor_message: string
        }
        Returns: string
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

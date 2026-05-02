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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_bookmarks: {
        Row: {
          content: string
          created_at: string
          id: string
          note: string | null
          sid: string
          source: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          note?: string | null
          sid: string
          source?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          note?: string | null
          sid?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_bookmarks_sid_fkey"
            columns: ["sid"]
            isOneToOne: false
            referencedRelation: "basecamp_sessions"
            referencedColumns: ["sid"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: Json
          created_at: string
          id: number
          role: string
          sid: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: number
          role: string
          sid: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: number
          role?: string
          sid?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_sid_fkey"
            columns: ["sid"]
            isOneToOne: false
            referencedRelation: "basecamp_sessions"
            referencedColumns: ["sid"]
          },
        ]
      }
      answers: {
        Row: {
          created_at: string
          id: string
          model: string
          question_id: string
          text_ar: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model: string
          question_id: string
          text_ar: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model?: string
          question_id?: string
          text_ar?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          chat_model: string
          embed_model: string
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          chat_model?: string
          embed_model?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          chat_model?: string
          embed_model?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_users: {
        Row: {
          created_at: string | null
          department_id: string | null
          display_name: string
          email: string | null
          id: string
          level: number
          password: string
          password_hash: string | null
          role: string
          username: string
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          display_name: string
          email?: string | null
          id?: string
          level?: number
          password: string
          password_hash?: string | null
          role?: string
          username: string
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          display_name?: string
          email?: string | null
          id?: string
          level?: number
          password?: string
          password_hash?: string | null
          role?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          actor: string | null
          created_at: string
          id: number
          kind: string
          meta: Json
          ok: boolean
          sid: string | null
        }
        Insert: {
          actor?: string | null
          created_at?: string
          id?: number
          kind: string
          meta?: Json
          ok?: boolean
          sid?: string | null
        }
        Update: {
          actor?: string | null
          created_at?: string
          id?: number
          kind?: string
          meta?: Json
          ok?: boolean
          sid?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          tool_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          tool_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          tool_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      basecamp_sessions: {
        Row: {
          access_token_enc: string
          account_href: string | null
          account_id: number
          account_name: string | null
          created_at: string
          expires_at: string
          refresh_token_enc: string
          sid: string
          updated_at: string
          user_email_address: string | null
          user_id: number | null
          user_name: string | null
        }
        Insert: {
          access_token_enc: string
          account_href?: string | null
          account_id: number
          account_name?: string | null
          created_at?: string
          expires_at: string
          refresh_token_enc: string
          sid: string
          updated_at?: string
          user_email_address?: string | null
          user_id?: number | null
          user_name?: string | null
        }
        Update: {
          access_token_enc?: string
          account_href?: string | null
          account_id?: number
          account_name?: string | null
          created_at?: string
          expires_at?: string
          refresh_token_enc?: string
          sid?: string
          updated_at?: string
          user_email_address?: string | null
          user_id?: number | null
          user_name?: string | null
        }
        Relationships: []
      }
      chunks: {
        Row: {
          chunk_index: number
          content_ar: string
          created_at: string
          embedding: string
          end_sec: number
          episode_id: string
          id: string
          speaker_ar: string | null
          start_sec: number
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content_ar: string
          created_at?: string
          embedding: string
          end_sec: number
          episode_id: string
          id?: string
          speaker_ar?: string | null
          start_sec: number
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content_ar?: string
          created_at?: string
          embedding?: string
          end_sec?: number
          episode_id?: string
          id?: string
          speaker_ar?: string | null
          start_sec?: number
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chunks_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      citations: {
        Row: {
          answer_id: string
          chunk_id: string
          id: string
          rank: number
        }
        Insert: {
          answer_id: string
          chunk_id: string
          id?: string
          rank: number
        }
        Update: {
          answer_id?: string
          chunk_id?: string
          id?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "citations_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          access_tier: string
          created_at: string
          id: string
          title: string | null
        }
        Insert: {
          access_tier?: string
          created_at?: string
          id?: string
          title?: string | null
        }
        Update: {
          access_tier?: string
          created_at?: string
          id?: string
          title?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          color: string
          created_at: string
          description: string | null
          icon: string
          id: string
          name_ar: string
          name_en: string
          slug: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name_ar: string
          name_en: string
          slug: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name_ar?: string
          name_en?: string
          slug?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          id: string
          metadata: Json | null
          section_title: string | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          id?: string
          metadata?: Json | null
          section_title?: string | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          metadata?: Json | null
          section_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_vectors: {
        Row: {
          access_tier: string
          audience_level: string
          char_count: number | null
          chunk_id: string
          chunk_index: number
          created_at: string
          department_id: string | null
          document_id: string
          document_title: string
          embedding: string
          embedding_dimensions: number
          embedding_model: string
          id: string
          min_level: number
          section_title: string | null
          source_type: string
          token_count: number | null
        }
        Insert: {
          access_tier?: string
          audience_level?: string
          char_count?: number | null
          chunk_id: string
          chunk_index: number
          created_at?: string
          department_id?: string | null
          document_id: string
          document_title: string
          embedding: string
          embedding_dimensions?: number
          embedding_model?: string
          id?: string
          min_level?: number
          section_title?: string | null
          source_type?: string
          token_count?: number | null
        }
        Update: {
          access_tier?: string
          audience_level?: string
          char_count?: number | null
          chunk_id?: string
          chunk_index?: number
          created_at?: string
          department_id?: string | null
          document_id?: string
          document_title?: string
          embedding?: string
          embedding_dimensions?: number
          embedding_model?: string
          id?: string
          min_level?: number
          section_title?: string | null
          source_type?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_vectors_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: true
            referencedRelation: "department_knowledge_nodes"
            referencedColumns: ["chunk_id"]
          },
          {
            foreignKeyName: "document_vectors_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: true
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_vectors_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          access_tier: string
          audience_level: string
          created_at: string
          department_id: string | null
          file_name: string
          file_path: string
          id: string
          metadata: Json | null
          min_level: number
          sections: Json | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          access_tier?: string
          audience_level?: string
          created_at?: string
          department_id?: string | null
          file_name: string
          file_path: string
          id?: string
          metadata?: Json | null
          min_level?: number
          sections?: Json | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          access_tier?: string
          audience_level?: string
          created_at?: string
          department_id?: string | null
          file_name?: string
          file_path?: string
          id?: string
          metadata?: Json | null
          min_level?: number
          sections?: Json | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          created_at: string
          duration_sec: number | null
          guest_name_ar: string
          guest_photo_url: string | null
          guest_role_ar: string | null
          id: string
          num: number
          published_at: string | null
          summary_ar: string | null
          title_ar: string
          topics_ar: string[] | null
          uploaded_by: string | null
          youtube_id: string
          youtube_url: string
        }
        Insert: {
          created_at?: string
          duration_sec?: number | null
          guest_name_ar: string
          guest_photo_url?: string | null
          guest_role_ar?: string | null
          id?: string
          num: number
          published_at?: string | null
          summary_ar?: string | null
          title_ar: string
          topics_ar?: string[] | null
          uploaded_by?: string | null
          youtube_id: string
          youtube_url: string
        }
        Update: {
          created_at?: string
          duration_sec?: number | null
          guest_name_ar?: string
          guest_photo_url?: string | null
          guest_role_ar?: string | null
          id?: string
          num?: number
          published_at?: string | null
          summary_ar?: string | null
          title_ar?: string
          topics_ar?: string[] | null
          uploaded_by?: string | null
          youtube_id?: string
          youtube_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_approval_steps: {
        Row: {
          approver_email: string
          approver_name: string
          comment: string | null
          decided_at: string | null
          id: string
          internal_comment: string | null
          reminder_sent_at: string | null
          request_id: string
          role: string
          sla_hours: number
          status: string
          step_order: number
        }
        Insert: {
          approver_email?: string
          approver_name?: string
          comment?: string | null
          decided_at?: string | null
          id?: string
          internal_comment?: string | null
          reminder_sent_at?: string | null
          request_id: string
          role: string
          sla_hours?: number
          status?: string
          step_order: number
        }
        Update: {
          approver_email?: string
          approver_name?: string
          comment?: string | null
          decided_at?: string | null
          id?: string
          internal_comment?: string | null
          reminder_sent_at?: string | null
          request_id?: string
          role?: string
          sla_hours?: number
          status?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_approval_steps_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "hr_vacancy_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email: string
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_settings: {
        Row: {
          data: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      hr_vacancy_requests: {
        Row: {
          ai_automation_potential: string
          ai_replacement_assessment: string
          ai_role_integration: string
          alternatives_description: string | null
          budget_owner: string
          country: string
          created_at: string
          created_by: string | null
          current_approval_step: number
          department: string
          departure_date: string | null
          departure_reason: string | null
          departure_type: string | null
          hiring_bar_commitment: string
          id: string
          is_in_approved_structure: boolean | null
          job_description: string
          job_level: string
          job_title: string
          job_title_en: string
          nationality: string
          non_arab_justification: string | null
          positions_count: number
          preferred_country: string | null
          previous_employee_name: string | null
          project: string
          rejection_reason: string | null
          requester_email: string
          requester_name: string
          risks_if_not_hired: string
          role_nature: string
          section: string
          status: string
          structure_justification: string | null
          team: string
          tried_alternatives: boolean
          updated_at: string
          vacancy_type: string
          work_location: string | null
        }
        Insert: {
          ai_automation_potential?: string
          ai_replacement_assessment?: string
          ai_role_integration?: string
          alternatives_description?: string | null
          budget_owner?: string
          country: string
          created_at?: string
          created_by?: string | null
          current_approval_step?: number
          department: string
          departure_date?: string | null
          departure_reason?: string | null
          departure_type?: string | null
          hiring_bar_commitment?: string
          id?: string
          is_in_approved_structure?: boolean | null
          job_description: string
          job_level: string
          job_title: string
          job_title_en?: string
          nationality: string
          non_arab_justification?: string | null
          positions_count?: number
          preferred_country?: string | null
          previous_employee_name?: string | null
          project?: string
          rejection_reason?: string | null
          requester_email: string
          requester_name: string
          risks_if_not_hired?: string
          role_nature: string
          section?: string
          status?: string
          structure_justification?: string | null
          team?: string
          tried_alternatives?: boolean
          updated_at?: string
          vacancy_type: string
          work_location?: string | null
        }
        Update: {
          ai_automation_potential?: string
          ai_replacement_assessment?: string
          ai_role_integration?: string
          alternatives_description?: string | null
          budget_owner?: string
          country?: string
          created_at?: string
          created_by?: string | null
          current_approval_step?: number
          department?: string
          departure_date?: string | null
          departure_reason?: string | null
          departure_type?: string | null
          hiring_bar_commitment?: string
          id?: string
          is_in_approved_structure?: boolean | null
          job_description?: string
          job_level?: string
          job_title?: string
          job_title_en?: string
          nationality?: string
          non_arab_justification?: string | null
          positions_count?: number
          preferred_country?: string | null
          previous_employee_name?: string | null
          project?: string
          rejection_reason?: string | null
          requester_email?: string
          requester_name?: string
          risks_if_not_hired?: string
          role_nature?: string
          section?: string
          status?: string
          structure_justification?: string | null
          team?: string
          tried_alternatives?: boolean
          updated_at?: string
          vacancy_type?: string
          work_location?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          citations: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          citations?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          citations?: Json | null
          content?: string
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
      profiles: {
        Row: {
          captured_at: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          name: string | null
          questions_asked: number
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          name?: string | null
          questions_asked?: number
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          name?: string | null
          questions_asked?: number
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      query_logs: {
        Row: {
          access_tier: string
          answer: string
          created_at: string
          document_source: string | null
          id: string
          question: string
        }
        Insert: {
          access_tier?: string
          answer: string
          created_at?: string
          document_source?: string | null
          id?: string
          question: string
        }
        Update: {
          access_tier?: string
          answer?: string
          created_at?: string
          document_source?: string | null
          id?: string
          question?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          created_at: string
          episode_filter: string[]
          id: string
          text_ar: string
          user_id: string
        }
        Insert: {
          created_at?: string
          episode_filter?: string[]
          id?: string
          text_ar: string
          user_id: string
        }
        Update: {
          created_at?: string
          episode_filter?: string[]
          id?: string
          text_ar?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_buckets: {
        Row: {
          count: number
          id: string
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          id?: string
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          id?: string
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          created_at: string
          key: string
          reset_at: string
        }
        Insert: {
          count?: number
          created_at?: string
          key: string
          reset_at: string
        }
        Update: {
          count?: number
          created_at?: string
          key?: string
          reset_at?: string
        }
        Relationships: []
      }
      recruitment_config: {
        Row: {
          api_token: string
          company_id: string
          company_name: string | null
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          api_token: string
          company_id: string
          company_name?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          api_token?: string
          company_id?: string
          company_name?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      scraper_access_rules: {
        Row: {
          base_id: string
          base_name: string
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          field_restrictions: string[]
          filter_formula: string | null
          id: string
          table_id: string
          table_name: string
          updated_at: string
          user_id: string
          user_name: string
        }
        Insert: {
          base_id: string
          base_name?: string
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          field_restrictions?: string[]
          filter_formula?: string | null
          id?: string
          table_id: string
          table_name?: string
          updated_at?: string
          user_id: string
          user_name?: string
        }
        Update: {
          base_id?: string
          base_name?: string
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          field_restrictions?: string[]
          filter_formula?: string | null
          id?: string
          table_id?: string
          table_name?: string
          updated_at?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      scraper_agent_runs: {
        Row: {
          agent_id: string | null
          agent_name: string
          duration_ms: number | null
          error: string | null
          executed_at: string
          executed_by: string | null
          id: string
          input: string
          model_used: string
          output: string
          status: Database["public"]["Enums"]["scraper_agent_run_status"]
        }
        Insert: {
          agent_id?: string | null
          agent_name: string
          duration_ms?: number | null
          error?: string | null
          executed_at?: string
          executed_by?: string | null
          id?: string
          input: string
          model_used: string
          output?: string
          status?: Database["public"]["Enums"]["scraper_agent_run_status"]
        }
        Update: {
          agent_id?: string | null
          agent_name?: string
          duration_ms?: number | null
          error?: string | null
          executed_at?: string
          executed_by?: string | null
          id?: string
          input?: string
          model_used?: string
          output?: string
          status?: Database["public"]["Enums"]["scraper_agent_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "scraper_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "scraper_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_agents: {
        Row: {
          agent_type: Database["public"]["Enums"]["scraper_agent_type"]
          created_at: string
          created_by: string | null
          description: string
          example_posts: Json
          id: string
          is_active: boolean
          max_tokens: number
          model_name: string
          name: string
          system_prompt: string
          temperature: number
          updated_at: string
        }
        Insert: {
          agent_type: Database["public"]["Enums"]["scraper_agent_type"]
          created_at?: string
          created_by?: string | null
          description?: string
          example_posts?: Json
          id?: string
          is_active?: boolean
          max_tokens?: number
          model_name: string
          name: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Update: {
          agent_type?: Database["public"]["Enums"]["scraper_agent_type"]
          created_at?: string
          created_by?: string | null
          description?: string
          example_posts?: Json
          id?: string
          is_active?: boolean
          max_tokens?: number
          model_name?: string
          name?: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Relationships: []
      }
      scraper_articles: {
        Row: {
          airtable_record_id: string | null
          author: string | null
          brand_id: string | null
          created_at: string
          description: string | null
          external_id: string | null
          fetched_at: string
          id: string
          is_investment_related: boolean | null
          published_at: string | null
          raw: Json
          run_id: string | null
          saved_to_airtable: boolean
          source_id: string
          title: string | null
          url: string
        }
        Insert: {
          airtable_record_id?: string | null
          author?: string | null
          brand_id?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          fetched_at?: string
          id?: string
          is_investment_related?: boolean | null
          published_at?: string | null
          raw?: Json
          run_id?: string | null
          saved_to_airtable?: boolean
          source_id: string
          title?: string | null
          url: string
        }
        Update: {
          airtable_record_id?: string | null
          author?: string | null
          brand_id?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          fetched_at?: string
          id?: string
          is_investment_related?: boolean | null
          published_at?: string | null
          raw?: Json
          run_id?: string | null
          saved_to_airtable?: boolean
          source_id?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_articles_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "scraper_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraper_articles_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scraper_fetch_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraper_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scraper_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_brands: {
        Row: {
          airtable_base_id: string | null
          airtable_table_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          airtable_base_id?: string | null
          airtable_table_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          airtable_base_id?: string | null
          airtable_table_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      scraper_fetch_runs: {
        Row: {
          brand_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          items_fetched: number
          items_passed: number
          items_saved: number
          metadata: Json
          source_id: string
          started_at: string
          status: Database["public"]["Enums"]["scraper_run_status"]
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_fetched?: number
          items_passed?: number
          items_saved?: number
          metadata?: Json
          source_id: string
          started_at?: string
          status: Database["public"]["Enums"]["scraper_run_status"]
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_fetched?: number
          items_passed?: number
          items_saved?: number
          metadata?: Json
          source_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["scraper_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "scraper_fetch_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "scraper_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraper_fetch_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scraper_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_filter_runs: {
        Row: {
          articles: Json
          created_at: string
          id: string
          model: string
          passed_articles: number
          raw_response: string | null
          rejected_articles: number
          source_id: string | null
          source_name: string
          total_articles: number
        }
        Insert: {
          articles?: Json
          created_at?: string
          id?: string
          model?: string
          passed_articles?: number
          raw_response?: string | null
          rejected_articles?: number
          source_id?: string | null
          source_name?: string
          total_articles?: number
        }
        Update: {
          articles?: Json
          created_at?: string
          id?: string
          model?: string
          passed_articles?: number
          raw_response?: string | null
          rejected_articles?: number
          source_id?: string | null
          source_name?: string
          total_articles?: number
        }
        Relationships: [
          {
            foreignKeyName: "scraper_filter_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scraper_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_logs: {
        Row: {
          context: string | null
          created_at: string
          details: Json
          id: number
          level: Database["public"]["Enums"]["scraper_log_level"]
          message: string
          user_id: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string
          details?: Json
          id?: number
          level?: Database["public"]["Enums"]["scraper_log_level"]
          message: string
          user_id?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string
          details?: Json
          id?: number
          level?: Database["public"]["Enums"]["scraper_log_level"]
          message?: string
          user_id?: string | null
        }
        Relationships: []
      }
      scraper_sources: {
        Row: {
          brand_id: string | null
          category: string
          config: Json
          consecutive_errors: number
          created_at: string
          created_by: string | null
          fetch_interval_minutes: number
          id: string
          is_active: boolean
          last_error: string | null
          last_fetched_at: string | null
          last_success_at: string | null
          name: string
          topic: Database["public"]["Enums"]["scraper_source_topic"]
          type: Database["public"]["Enums"]["scraper_source_type"]
          updated_at: string
          url: string
        }
        Insert: {
          brand_id?: string | null
          category?: string
          config?: Json
          consecutive_errors?: number
          created_at?: string
          created_by?: string | null
          fetch_interval_minutes?: number
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_fetched_at?: string | null
          last_success_at?: string | null
          name: string
          topic?: Database["public"]["Enums"]["scraper_source_topic"]
          type: Database["public"]["Enums"]["scraper_source_type"]
          updated_at?: string
          url: string
        }
        Update: {
          brand_id?: string | null
          category?: string
          config?: Json
          consecutive_errors?: number
          created_at?: string
          created_by?: string | null
          fetch_interval_minutes?: number
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_fetched_at?: string | null
          last_success_at?: string | null
          name?: string
          topic?: Database["public"]["Enums"]["scraper_source_topic"]
          type?: Database["public"]["Enums"]["scraper_source_type"]
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_sources_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "scraper_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      structured_datasets: {
        Row: {
          columns: Json
          created_at: string
          description: string
          document_id: string | null
          id: string
        }
        Insert: {
          columns?: Json
          created_at?: string
          description: string
          document_id?: string | null
          id?: string
        }
        Update: {
          columns?: Json
          created_at?: string
          description?: string
          document_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "structured_datasets_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      structured_rows: {
        Row: {
          created_at: string
          dataset_id: string
          id: string
          row_data: Json
          search_text: string
        }
        Insert: {
          created_at?: string
          dataset_id: string
          id?: string
          row_data?: Json
          search_text?: string
        }
        Update: {
          created_at?: string
          dataset_id?: string
          id?: string
          row_data?: Json
          search_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "structured_rows_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "structured_datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_favorites: {
        Row: {
          created_at: string
          tool_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tool_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_favorites_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          category: string
          created_at: string
          description_ar: string | null
          description_en: string | null
          enabled: boolean
          icon: string
          id: string
          name_ar: string
          name_en: string
          position: number
          slug: string
          updated_at: string
          url: string
        }
        Insert: {
          category?: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          enabled?: boolean
          icon?: string
          id?: string
          name_ar: string
          name_en: string
          position?: number
          slug: string
          updated_at?: string
          url: string
        }
        Update: {
          category?: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          enabled?: boolean
          icon?: string
          id?: string
          name_ar?: string
          name_en?: string
          position?: number
          slug?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      department_knowledge_nodes: {
        Row: {
          chunk_id: string | null
          department_id: string | null
          document_id: string | null
          document_title: string | null
          entities: string[] | null
          keywords: string[] | null
          language: string | null
          section_title: string | null
          summary: string | null
          topic: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_leaderboard: {
        Row: {
          citations: number | null
          episodes: number | null
          guest_name_ar: string | null
          guest_photo_url: string | null
          guest_role_ar: string | null
          last_cited_at: string | null
        }
        Relationships: []
      }
      scraper_run_daily_stats: {
        Row: {
          avg_duration_ms: number | null
          brand_id: string | null
          day: string | null
          items_fetched: number | null
          items_saved: number | null
          runs: number | null
          runs_empty: number | null
          runs_error: number | null
          runs_success: number | null
          source_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraper_fetch_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "scraper_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraper_fetch_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scraper_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_ask: { Args: { ep_filter?: string[]; q: string }; Returns: string }
      fn_identify: {
        Args: { p_email: string; p_name: string }
        Returns: undefined
      }
      fn_refresh_leaderboard: { Args: never; Returns: undefined }
      fn_save_answer: {
        Args: {
          p_chunk_ids: string[]
          p_model: string
          p_question_id: string
          p_text: string
        }
        Returns: string
      }
      fn_vector_search: {
        Args: { ep_filter?: string[]; k?: number; qvec: string }
        Returns: {
          chunk_index: number
          content_ar: string
          distance: number
          end_sec: number
          episode_id: string
          episode_num: number
          episode_title: string
          guest_name: string
          id: string
          speaker_ar: string
          start_sec: number
          youtube_id: string
        }[]
      }
      fuzzy_search_structured: {
        Args: { max_results?: number; search_query: string }
        Returns: {
          columns: Json
          dataset_id: string
          description: string
          id: string
          row_data: Json
          search_text: string
          similarity: number
        }[]
      }
      hr_approve_step: {
        Args: {
          p_comment?: string
          p_internal_comment?: string
          p_request_id: string
          p_step_index: number
        }
        Returns: Json
      }
      hr_can_approve: { Args: { uid: string }; Returns: boolean }
      hr_create_vacancy_request: {
        Args: { p_request: Json; p_steps: Json }
        Returns: Json
      }
      hr_is_admin: { Args: { uid: string }; Returns: boolean }
      hr_reject_step: {
        Args: {
          p_internal_comment?: string
          p_reason: string
          p_request_id: string
          p_step_index: number
        }
        Returns: Json
      }
      is_admin: { Args: { uid?: string }; Returns: boolean }
      match_vectors: {
        Args: {
          allowed_tiers?: string[]
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_document_id?: string
        }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          document_title: string
          embedding_model: string
          id: string
          section_title: string
          similarity: number
          source_type: string
        }[]
      }
      match_vectors_v2: {
        Args: {
          allowed_tiers: string[]
          match_count: number
          match_threshold: number
          query_embedding: string
          target_document_id?: string
          user_department_id?: string
          user_level?: number
        }
        Returns: {
          audience_level: string
          chunk_id: string
          content: string
          department_id: string
          document_id: string
          document_title: string
          id: string
          section_title: string
          similarity: number
        }[]
      }
      rl_incr: {
        Args: { p_key: string; p_limit: number; p_reset: string }
        Returns: number
      }
      scraper_is_admin: { Args: never; Returns: boolean }
      verify_user_password: {
        Args: { p_password: string; p_username: string }
        Returns: {
          department_id: string
          display_name: string
          id: string
          level: number
          role: string
          username: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "member"
      scraper_agent_run_status: "pending" | "running" | "completed" | "error"
      scraper_agent_type: "writing" | "filtering" | "editing" | "summarizing"
      scraper_log_level: "debug" | "info" | "warn" | "error"
      scraper_run_status: "success" | "partial" | "error" | "empty" | "skipped"
      scraper_source_topic: "news" | "insights" | "real_estate"
      scraper_source_type: "rss" | "twitter" | "linkedin" | "apify" | "custom"
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
      app_role: ["admin", "member"],
      scraper_agent_run_status: ["pending", "running", "completed", "error"],
      scraper_agent_type: ["writing", "filtering", "editing", "summarizing"],
      scraper_log_level: ["debug", "info", "warn", "error"],
      scraper_run_status: ["success", "partial", "error", "empty", "skipped"],
      scraper_source_topic: ["news", "insights", "real_estate"],
      scraper_source_type: ["rss", "twitter", "linkedin", "apify", "custom"],
    },
  },
} as const

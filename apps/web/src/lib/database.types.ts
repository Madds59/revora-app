export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_safety_flags: {
        Row: {
          business_id: string | null
          created_at: string
          diagnostic_result_id: string | null
          id: string
          matched_terms: string[]
          reason: string
          risk_level: string
          stop_driving_warning: boolean
          symptom_report_id: string | null
          triggered_by: string
          vehicle_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          diagnostic_result_id?: string | null
          id?: string
          matched_terms?: string[]
          reason: string
          risk_level: string
          stop_driving_warning?: boolean
          symptom_report_id?: string | null
          triggered_by: string
          vehicle_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string
          diagnostic_result_id?: string | null
          id?: string
          matched_terms?: string[]
          reason?: string
          risk_level?: string
          stop_driving_warning?: boolean
          symptom_report_id?: string | null
          triggered_by?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_safety_flags_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_safety_flags_diagnostic_result_id_fkey"
            columns: ["diagnostic_result_id"]
            isOneToOne: false
            referencedRelation: "vehicle_diagnostic_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_safety_flags_symptom_report_id_fkey"
            columns: ["symptom_report_id"]
            isOneToOne: false
            referencedRelation: "vehicle_symptom_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_safety_flags_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tool_calls: {
        Row: {
          business_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input_json: Json
          model: string | null
          output_json: Json | null
          safety_flagged: boolean
          status: string
          tool_name: string
          user_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_json: Json
          model?: string | null
          output_json?: Json | null
          safety_flagged?: boolean
          status: string
          tool_name: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_json?: Json
          model?: string | null
          output_json?: Json | null
          safety_flagged?: boolean
          status?: string
          tool_name?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_calls_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tool_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tool_calls_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_events: {
        Row: {
          approval_id: string
          business_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
        }
        Insert: {
          approval_id: string
          business_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          approval_id?: string
          business_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "approval_events_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          acknowledgement_text: string
          approved_at: string
          business_id: string
          created_at: string
          customer_id: string
          device_data: Json
          id: string
          ip_address: unknown
          language: string
          quotation_id: string
          quotation_version: number
          signature_asset_id: string | null
          terms_version_id: string | null
          user_agent: string | null
        }
        Insert: {
          acknowledgement_text: string
          approved_at?: string
          business_id: string
          created_at?: string
          customer_id: string
          device_data?: Json
          id?: string
          ip_address?: unknown
          language: string
          quotation_id: string
          quotation_version: number
          signature_asset_id?: string | null
          terms_version_id?: string | null
          user_agent?: string | null
        }
        Update: {
          acknowledgement_text?: string
          approved_at?: string
          business_id?: string
          created_at?: string
          customer_id?: string
          device_data?: Json
          id?: string
          ip_address?: unknown
          language?: string
          quotation_id?: string
          quotation_version?: number
          signature_asset_id?: string | null
          terms_version_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approvals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_signature_asset_id_fkey"
            columns: ["signature_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_terms_version_id_fkey"
            columns: ["terms_version_id"]
            isOneToOne: false
            referencedRelation: "terms_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          business_id: string | null
          created_at: string
          id: number
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          id?: number
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          id?: number
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoice_items: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          currency: string
          description: string
          id: string
          invoice_id: string
          metadata: Json
          period_end: string | null
          period_start: string | null
          quantity: number
          stripe_invoice_line_item_id: string | null
          unit_amount: number
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          currency?: string
          description: string
          id?: string
          invoice_id: string
          metadata?: Json
          period_end?: string | null
          period_start?: string | null
          quantity?: number
          stripe_invoice_line_item_id?: string | null
          unit_amount?: number
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          invoice_id?: string
          metadata?: Json
          period_end?: string | null
          period_start?: string | null
          quantity?: number
          stripe_invoice_line_item_id?: string | null
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoice_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          business_id: string
          created_at: string
          currency: string
          due_date: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_number: string | null
          invoice_pdf_url: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: string
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_subscription_id: string | null
          subscription_id: string | null
          subtotal_amount: number
          tax_amount: number
          total_amount: number
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          business_id: string
          created_at?: string
          currency?: string
          due_date?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_number?: string | null
          invoice_pdf_url?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
          subscription_id?: string | null
          subtotal_amount?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          business_id?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_number?: string | null
          invoice_pdf_url?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
          subscription_id?: string | null
          subtotal_amount?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_payment_events: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          currency: string
          event_type: string
          id: string
          invoice_id: string | null
          occurred_at: string
          provider: string
          provider_event_id: string | null
          raw_payload: Json
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          subscription_id: string | null
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          currency?: string
          event_type: string
          id?: string
          invoice_id?: string | null
          occurred_at?: string
          provider?: string
          provider_event_id?: string | null
          raw_payload?: Json
          status: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          currency?: string
          event_type?: string
          id?: string
          invoice_id?: string | null
          occurred_at?: string
          provider?: string
          provider_event_id?: string | null
          raw_payload?: Json
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_payment_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payment_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payment_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plan_features: {
        Row: {
          created_at: string
          description: string | null
          feature_key: string
          feature_name: string
          id: string
          included: boolean
          limit_unit: string | null
          limit_value: number | null
          plan_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          feature_key: string
          feature_name: string
          id?: string
          included?: boolean
          limit_unit?: string | null
          limit_value?: number | null
          plan_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          feature_key?: string
          feature_name?: string
          id?: string
          included?: boolean
          limit_unit?: string | null
          limit_value?: number | null
          plan_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          metadata: Json
          monthly_amount: number | null
          name: string
          slug: string
          sort_order: number
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          updated_at: string
          yearly_amount: number | null
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          monthly_amount?: number | null
          name: string
          slug: string
          sort_order?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          updated_at?: string
          yearly_amount?: number | null
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          monthly_amount?: number | null
          name?: string
          slug?: string
          sort_order?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          updated_at?: string
          yearly_amount?: number | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: Json
          business_id: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
          working_hours: Json
        }
        Insert: {
          address?: Json
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
          working_hours?: Json
        }
        Update: {
          address?: Json
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          business_id: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["member_role"]
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_id: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["member_role"]
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          branch_ids: string[]
          business_id: string
          created_at: string
          id: string
          invited_by: string | null
          is_active: boolean
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_ids?: string[]
          business_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          role: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_ids?: string[]
          business_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          branding: Json
          communication_preferences: Json
          country: string
          created_at: string
          created_by: string | null
          default_language: string
          deleted_at: string | null
          id: string
          legal_name: string | null
          name: string
          stripe_customer_id: string | null
          supported_languages: string[]
          tagline: string | null
          updated_at: string
        }
        Insert: {
          branding?: Json
          communication_preferences?: Json
          country?: string
          created_at?: string
          created_by?: string | null
          default_language?: string
          deleted_at?: string | null
          id?: string
          legal_name?: string | null
          name: string
          stripe_customer_id?: string | null
          supported_languages?: string[]
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          branding?: Json
          communication_preferences?: Json
          country?: string
          created_at?: string
          created_by?: string | null
          default_language?: string
          deleted_at?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          stripe_customer_id?: string | null
          supported_languages?: string[]
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_evidence: {
        Row: {
          business_id: string
          complaint_id: string
          created_at: string
          description: string | null
          id: string
          media_asset_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          business_id: string
          complaint_id: string
          created_at?: string
          description?: string | null
          id?: string
          media_asset_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          business_id?: string
          complaint_id?: string
          created_at?: string
          description?: string | null
          id?: string
          media_asset_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_evidence_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_evidence_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_evidence_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_messages: {
        Row: {
          body: string
          business_id: string
          complaint_id: string
          created_at: string
          id: string
          internal_only: boolean
          parent_message_id: string | null
          sender_id: string | null
          sender_role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          body: string
          business_id: string
          complaint_id: string
          created_at?: string
          id?: string
          internal_only?: boolean
          parent_message_id?: string | null
          sender_id?: string | null
          sender_role: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          body?: string
          business_id?: string
          complaint_id?: string
          created_at?: string
          id?: string
          internal_only?: boolean
          parent_message_id?: string | null
          sender_id?: string | null
          sender_role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "complaint_messages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_messages_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "complaint_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          assigned_to: string | null
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          description: string
          escalated_at: string | null
          id: string
          job_id: string | null
          quotation_id: string | null
          resolution_summary: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["complaint_severity"]
          status: Database["public"]["Enums"]["complaint_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          description: string
          escalated_at?: string | null
          id?: string
          job_id?: string | null
          quotation_id?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["complaint_severity"]
          status?: Database["public"]["Enums"]["complaint_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string
          escalated_at?: string | null
          id?: string
          job_id?: string | null
          quotation_id?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["complaint_severity"]
          status?: Database["public"]["Enums"]["complaint_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: Json
          app_user_id: string | null
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          marketing_consent: boolean
          metadata: Json
          phone: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          address?: Json
          app_user_id?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          marketing_consent?: boolean
          metadata?: Json
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          address?: Json
          app_user_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          marketing_consent?: boolean
          metadata?: Json
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          business_id: string
          complaint_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          document_type: string
          id: string
          job_id: string | null
          media_asset_id: string
          quotation_id: string | null
          title: string
        }
        Insert: {
          business_id: string
          complaint_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          document_type: string
          id?: string
          job_id?: string | null
          media_asset_id: string
          quotation_id?: string | null
          title: string
        }
        Update: {
          business_id?: string
          complaint_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          document_type?: string
          id?: string
          job_id?: string | null
          media_asset_id?: string
          quotation_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_tasks: {
        Row: {
          assigned_to: string | null
          business_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          is_completed: boolean
          job_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          business_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          is_completed?: boolean
          job_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          business_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          is_completed?: boolean
          job_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_tasks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_updates: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          message: string
          status: Database["public"]["Enums"]["job_status"] | null
          visible_to_customer: boolean
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          message: string
          status?: Database["public"]["Enums"]["job_status"] | null
          visible_to_customer?: boolean
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          message?: string
          status?: Database["public"]["Enums"]["job_status"] | null
          visible_to_customer?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "job_updates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_updates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          assigned_to: string | null
          branch_id: string | null
          business_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          expected_completion_at: string | null
          id: string
          quotation_id: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          branch_id?: string | null
          business_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          expected_completion_at?: string | null
          id?: string
          quotation_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          branch_id?: string | null
          business_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          expected_completion_at?: string | null
          id?: string
          quotation_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          bucket: string
          business_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string
          object_path: string
          purpose: string
          size_bytes: number
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          bucket: string
          business_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          object_path: string
          purpose: string
          size_bytes: number
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          bucket?: string
          business_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          object_path?: string
          purpose?: string
          size_bytes?: number
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_bundles: {
        Row: {
          billing_cycle: string
          business_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          features: Json
          id: string
          included_labor_hours: number
          included_visits: number
          is_published: boolean
          name: string
          price: number
          scenario_id: string | null
          sla_level: string
          sort_order: number
          tier: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          business_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          included_labor_hours?: number
          included_visits?: number
          is_published?: boolean
          name: string
          price?: number
          scenario_id?: string | null
          sla_level?: string
          sort_order?: number
          tier?: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          included_labor_hours?: number
          included_visits?: number
          is_published?: boolean
          name?: string
          price?: number
          scenario_id?: string | null
          sla_level?: string
          sort_order?: number
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_bundles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_bundles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_bundles_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "retainer_pricing_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          business_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          customer_id: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          payload: Json
          provider_message_id: string | null
          read_at: string | null
          read_by: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          template_key: string
        }
        Insert: {
          business_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          customer_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          payload?: Json
          provider_message_id?: string | null
          read_at?: string | null
          read_by?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          template_key: string
        }
        Update: {
          business_id?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          customer_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          payload?: Json
          provider_message_id?: string | null
          read_at?: string | null
          read_by?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          availability: string | null
          brand: string | null
          business_id: string
          category: Database["public"]["Enums"]["product_category"]
          created_at: string
          documentation: Json
          expected_lifespan: string | null
          id: string
          name: string
          origin: string | null
          part_number: string | null
          price: number | null
          supplier: string | null
          updated_at: string
          warranty_terms: string | null
        }
        Insert: {
          availability?: string | null
          brand?: string | null
          business_id: string
          category: Database["public"]["Enums"]["product_category"]
          created_at?: string
          documentation?: Json
          expected_lifespan?: string | null
          id?: string
          name: string
          origin?: string | null
          part_number?: string | null
          price?: number | null
          supplier?: string | null
          updated_at?: string
          warranty_terms?: string | null
        }
        Update: {
          availability?: string | null
          brand?: string | null
          business_id?: string
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          documentation?: Json
          expected_lifespan?: string | null
          id?: string
          name?: string
          origin?: string | null
          part_number?: string | null
          price?: number | null
          supplier?: string | null
          updated_at?: string
          warranty_terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_intent: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          onboarding_completed_at: string | null
          phone: string | null
          preferred_language: string
          timezone: string
          updated_at: string
        }
        Insert: {
          account_intent?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          onboarding_completed_at?: string | null
          phone?: string | null
          preferred_language?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          account_intent?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          onboarding_completed_at?: string | null
          phone?: string | null
          preferred_language?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string
          description: string | null
          id: string
          metadata: Json
          name: string
          project_type: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          project_type?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          project_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          business_id: string
          created_at: string
          description: string | null
          discount_amount: number
          id: string
          kind: Database["public"]["Enums"]["item_kind"]
          name: string
          position: number
          product_category:
            | Database["public"]["Enums"]["product_category"]
            | null
          product_id: string | null
          quantity: number
          quotation_id: string
          tax_rate: number
          time_estimate_minutes: number | null
          total: number
          transparency: Json
          unit_price: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          description?: string | null
          discount_amount?: number
          id?: string
          kind: Database["public"]["Enums"]["item_kind"]
          name: string
          position?: number
          product_category?:
            | Database["public"]["Enums"]["product_category"]
            | null
          product_id?: string | null
          quantity?: number
          quotation_id: string
          tax_rate?: number
          time_estimate_minutes?: number | null
          total?: number
          transparency?: Json
          unit_price?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string | null
          discount_amount?: number
          id?: string
          kind?: Database["public"]["Enums"]["item_kind"]
          name?: string
          position?: number
          product_category?:
            | Database["public"]["Enums"]["product_category"]
            | null
          product_id?: string | null
          quantity?: number
          quotation_id?: string
          tax_rate?: number
          time_estimate_minutes?: number | null
          total?: number
          transparency?: Json
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_revisions: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          quotation_id: string
          reason: string | null
          snapshot: Json
          version: number
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          quotation_id: string
          reason?: string | null
          snapshot: Json
          version: number
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          quotation_id?: string
          reason?: string | null
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_revisions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_revisions_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          branch_id: string | null
          business_id: string
          created_at: string
          created_by: string | null
          currency: string
          current_version: number
          customer_id: string
          customer_notes: string | null
          customer_rejected_at: string | null
          customer_rejection_note: string | null
          discount_total: number
          expected_completion_date: string | null
          expires_at: string | null
          id: string
          internal_notes: string | null
          language: string
          project_id: string | null
          quote_number: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_total: number
          terms_version_id: string | null
          total: number
          updated_at: string
          vehicle_id: string | null
          warranty_terms: string | null
        }
        Insert: {
          branch_id?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          current_version?: number
          customer_id: string
          customer_notes?: string | null
          customer_rejected_at?: string | null
          customer_rejection_note?: string | null
          discount_total?: number
          expected_completion_date?: string | null
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          language?: string
          project_id?: string | null
          quote_number: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_total?: number
          terms_version_id?: string | null
          total?: number
          updated_at?: string
          vehicle_id?: string | null
          warranty_terms?: string | null
        }
        Update: {
          branch_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          current_version?: number
          customer_id?: string
          customer_notes?: string | null
          customer_rejected_at?: string | null
          customer_rejection_note?: string | null
          discount_total?: number
          expected_completion_date?: string | null
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          language?: string
          project_id?: string | null
          quote_number?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_total?: number
          terms_version_id?: string | null
          total?: number
          updated_at?: string
          vehicle_id?: string | null
          warranty_terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_terms_version_id_fkey"
            columns: ["terms_version_id"]
            isOneToOne: false
            referencedRelation: "terms_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      retainer_pricing_scenarios: {
        Row: {
          billing_cycle: string
          business_id: string
          calculated_results: Json
          contract_length_months: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          customer_type: string
          description: string | null
          expected_monthly_visits: number
          id: string
          labor_items: Json
          number_of_vehicles: number
          overhead_items: Json
          parts_items: Json
          pricing_settings: Json
          quote_id: string | null
          risk_settings: Json
          service_category: string
          sla_level: string
          status: string
          title: string
          tool_items: Json
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          business_id: string
          calculated_results?: Json
          contract_length_months?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          customer_type: string
          description?: string | null
          expected_monthly_visits?: number
          id?: string
          labor_items?: Json
          number_of_vehicles?: number
          overhead_items?: Json
          parts_items?: Json
          pricing_settings?: Json
          quote_id?: string | null
          risk_settings?: Json
          service_category: string
          sla_level?: string
          status?: string
          title: string
          tool_items?: Json
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          business_id?: string
          calculated_results?: Json
          contract_length_months?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          customer_type?: string
          description?: string | null
          expected_monthly_visits?: number
          id?: string
          labor_items?: Json
          number_of_vehicles?: number
          overhead_items?: Json
          parts_items?: Json
          pricing_settings?: Json
          quote_id?: string | null
          risk_settings?: Json
          service_category?: string
          sla_level?: string
          status?: string
          title?: string
          tool_items?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retainer_pricing_scenarios_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainer_pricing_scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainer_pricing_scenarios_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainer_pricing_scenarios_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          business_id: string
          created_at: string
          default_price: number | null
          default_tax_rate: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          default_price?: number | null
          default_tax_rate?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          default_price?: number | null
          default_tax_rate?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_items: {
        Row: {
          created_at: string
          id: string
          product_key: string
          quantity: number
          stripe_price_id: string
          stripe_subscription_item_id: string | null
          subscription_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_key: string
          quantity?: number
          stripe_price_id: string
          stripe_subscription_item_id?: string | null
          subscription_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_key?: string
          quantity?: number
          stripe_price_id?: string
          stripe_subscription_item_id?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_items_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          business_id: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          entitlements: Json
          id: string
          plan_key: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          entitlements?: Json
          id?: string
          plan_key: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          entitlements?: Json
          id?: string
          plan_key?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_versions: {
        Row: {
          body: string
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          language: string
          title: string
          version: number
        }
        Insert: {
          body: string
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          language?: string
          title: string
          version: number
        }
        Update: {
          body?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          language?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "terms_versions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_diagnostic_results: {
        Row: {
          advisor_summary: string | null
          business_id: string
          created_at: string
          customer_explanation: string | null
          diagnosis_json: Json
          generated_by: string | null
          id: string
          model: string | null
          quote_draft_eligible: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          stop_driving_warning: boolean
          symptom_report_id: string | null
          updated_at: string
          vehicle_id: string
          workshop_required: boolean
        }
        Insert: {
          advisor_summary?: string | null
          business_id: string
          created_at?: string
          customer_explanation?: string | null
          diagnosis_json: Json
          generated_by?: string | null
          id?: string
          model?: string | null
          quote_draft_eligible?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity: string
          stop_driving_warning?: boolean
          symptom_report_id?: string | null
          updated_at?: string
          vehicle_id: string
          workshop_required?: boolean
        }
        Update: {
          advisor_summary?: string | null
          business_id?: string
          created_at?: string
          customer_explanation?: string | null
          diagnosis_json?: Json
          generated_by?: string | null
          id?: string
          model?: string | null
          quote_draft_eligible?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          stop_driving_warning?: boolean
          symptom_report_id?: string | null
          updated_at?: string
          vehicle_id?: string
          workshop_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_diagnostic_results_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_diagnostic_results_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_diagnostic_results_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_diagnostic_results_symptom_report_id_fkey"
            columns: ["symptom_report_id"]
            isOneToOne: false
            referencedRelation: "vehicle_symptom_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_diagnostic_results_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_dtc_codes: {
        Row: {
          business_id: string
          code: string
          created_at: string
          description: string | null
          diagnostic_result_id: string | null
          id: string
          severity: string | null
          source: string
          system: string | null
          title: string | null
          vehicle_id: string
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          description?: string | null
          diagnostic_result_id?: string | null
          id?: string
          severity?: string | null
          source: string
          system?: string | null
          title?: string | null
          vehicle_id: string
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          description?: string | null
          diagnostic_result_id?: string | null
          id?: string
          severity?: string | null
          source?: string
          system?: string | null
          title?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_dtc_codes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_dtc_codes_diagnostic_result_id_fkey"
            columns: ["diagnostic_result_id"]
            isOneToOne: false
            referencedRelation: "vehicle_diagnostic_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_dtc_codes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance_plans: {
        Row: {
          business_id: string
          created_at: string
          generated_by: string | null
          id: string
          next_service_date: string | null
          next_service_mileage: number | null
          plan_json: Json
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          generated_by?: string | null
          id?: string
          next_service_date?: string | null
          next_service_mileage?: number | null
          plan_json: Json
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          generated_by?: string | null
          id?: string
          next_service_date?: string | null
          next_service_mileage?: number | null
          plan_json?: Json
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_plans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_plans_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_media_uploads: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string | null
          description: string | null
          id: string
          media_type: string
          storage_bucket: string
          storage_path: string
          uploaded_by: string
          vehicle_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id?: string | null
          description?: string | null
          id?: string
          media_type: string
          storage_bucket: string
          storage_path: string
          uploaded_by: string
          vehicle_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string | null
          description?: string | null
          id?: string
          media_type?: string
          storage_bucket?: string
          storage_path?: string
          uploaded_by?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_media_uploads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_media_uploads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_media_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_media_uploads_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_symptom_reports: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string | null
          driving_condition: string | null
          id: string
          mileage: number | null
          severity_input: string | null
          source: string
          status: string
          submitted_by: string
          submitted_by_type: string
          symptom_tags: string[]
          symptoms: string
          updated_at: string
          vehicle_id: string
          warning_lights: string[]
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id?: string | null
          driving_condition?: string | null
          id?: string
          mileage?: number | null
          severity_input?: string | null
          source: string
          status?: string
          submitted_by: string
          submitted_by_type: string
          symptom_tags?: string[]
          symptoms: string
          updated_at?: string
          vehicle_id: string
          warning_lights?: string[]
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string | null
          driving_condition?: string | null
          id?: string
          mileage?: number | null
          severity_input?: string | null
          source?: string
          status?: string
          submitted_by?: string
          submitted_by_type?: string
          symptom_tags?: string[]
          symptoms?: string
          updated_at?: string
          vehicle_id?: string
          warning_lights?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_symptom_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_symptom_reports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_symptom_reports_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_symptom_reports_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          business_id: string
          color: string | null
          created_at: string
          customer_id: string
          id: string
          make: string | null
          metadata: Json
          model: string | null
          plate_number: string | null
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          business_id: string
          color?: string | null
          created_at?: string
          customer_id: string
          id?: string
          make?: string | null
          metadata?: Json
          model?: string | null
          plate_number?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          business_id?: string
          color?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          make?: string | null
          metadata?: Json
          model?: string | null
          plate_number?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_audit_logs: { Args: never; Returns: Json }
      admin_list_audit_logs_filtered: {
        Args: {
          p_action?: string
          p_entity?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_list_businesses: { Args: never; Returns: Json }
      admin_list_businesses_filtered: {
        Args: {
          p_from?: string
          p_industry?: string
          p_limit?: number
          p_offset?: number
          p_plan?: string
          p_search?: string
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_list_notifications: { Args: never; Returns: Json }
      admin_list_notifications_filtered: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_read_state?: string
          p_search?: string
          p_to?: string
          p_type?: string
        }
        Returns: Json
      }
      admin_list_subscriptions: { Args: never; Returns: Json }
      admin_list_subscriptions_filtered: {
        Args: {
          p_from?: string
          p_interval?: string
          p_limit?: number
          p_offset?: number
          p_plan?: string
          p_search?: string
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_list_super_admins: { Args: never; Returns: Json }
      admin_list_users: { Args: never; Returns: Json }
      admin_list_users_filtered: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_role?: string
          p_search?: string
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_mark_notification_read: {
        Args: { notification_id: string }
        Returns: undefined
      }
      admin_platform_metrics: { Args: never; Returns: Json }
      admin_set_super_admin: {
        Args: { make_admin: boolean; target_email: string }
        Returns: undefined
      }
      claim_business_invitations: { Args: never; Returns: number }
      claim_customer_records: { Args: never; Returns: number }
      create_business: {
        Args: { business_name: string; owner_full_name?: string }
        Returns: string
      }
      create_quotation_draft: {
        Args: {
          target_business_id: string
          target_created_by?: string
          target_currency?: string
          target_customer_id: string
          target_vehicle_id?: string
        }
        Returns: string
      }
      customer_reject_quote: {
        Args: {
          rejection_note?: string
          target_customer_id: string
          target_quotation_id: string
        }
        Returns: undefined
      }
      get_business_revenue_summary: {
        Args: { p_business_id: string; p_period?: string }
        Returns: Json
      }
      get_business_revenue_trend: {
        Args: { p_business_id: string; p_period?: string }
        Returns: Json
      }
      get_vehicle_portal_snapshot: {
        Args: { target_vehicle_id: string }
        Returns: {
          business_id: string
          business_name: string
          color: string
          customer_explanation: string
          customer_id: string
          customer_name: string
          latest_diagnostic_id: string
          latest_diagnostic_severity: string
          latest_plan_id: string
          latest_report_created_at: string
          latest_report_id: string
          latest_report_severity_input: string
          latest_report_status: string
          latest_report_symptoms: string
          media_count: number
          next_service_date: string
          next_service_mileage: number
          plate_number: string
          stop_driving_warning: boolean
          vehicle_id: string
          vehicle_make: string
          vehicle_model: string
          vehicle_year: number
          vin: string
          workshop_required: boolean
        }[]
      }
      has_business_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["member_role"][]
          target_business_id: string
        }
        Returns: boolean
      }
      is_business_member: {
        Args: { target_business_id: string }
        Returns: boolean
      }
      is_customer_for_business: {
        Args: { target_business_id: string; target_customer_id: string }
        Returns: boolean
      }
      is_customer_for_vehicle: {
        Args: { target_vehicle_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_vehicle_business_member: {
        Args: { target_vehicle_id: string }
        Returns: boolean
      }
      list_active_billing_plans: { Args: never; Returns: Json }
      list_business_billing_invoices: {
        Args: { p_business_id: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      mark_business_notification_read: {
        Args: { target_notification_id: string }
        Returns: undefined
      }
      mark_business_notifications_read: {
        Args: { target_business_id: string }
        Returns: number
      }
      record_complaint_evidence: {
        Args: {
          p_complaint_id: string
          p_description?: string
          p_file_name: string
          p_mime_type: string
          p_object_path: string
          p_size_bytes: number
        }
        Returns: string
      }
      submit_quote_approval: {
        Args: {
          p_acknowledgement_text: string
          p_customer_note?: string
          p_language: string
          p_quotation_id: string
          p_quotation_version: number
          p_signature_mime?: string
          p_signature_object_path?: string
          p_signature_size?: number
          p_signed_name: string
          p_user_agent?: string
        }
        Returns: string
      }
    }
    Enums: {
      complaint_severity: "low" | "medium" | "high" | "critical"
      complaint_status:
        | "open"
        | "assigned"
        | "awaiting_customer"
        | "investigating"
        | "escalated"
        | "resolved"
        | "closed"
      item_kind: "service" | "labor" | "product" | "part"
      job_status:
        | "pending"
        | "approved"
        | "in_progress"
        | "waiting_parts"
        | "delayed"
        | "completed"
        | "cancelled"
      member_role:
        | "super_admin"
        | "business_owner"
        | "manager"
        | "employee"
        | "customer"
      notification_channel:
        | "whatsapp"
        | "facebook"
        | "instagram"
        | "tiktok"
        | "email"
        | "sms"
        | "push"
      product_category:
        | "oem"
        | "genuine"
        | "aftermarket"
        | "refurbished"
        | "used"
        | "custom"
      quote_status:
        | "draft"
        | "sent"
        | "revised"
        | "approved"
        | "declined"
        | "expired"
        | "cancelled"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      complaint_severity: ["low", "medium", "high", "critical"],
      complaint_status: [
        "open",
        "assigned",
        "awaiting_customer",
        "investigating",
        "escalated",
        "resolved",
        "closed",
      ],
      item_kind: ["service", "labor", "product", "part"],
      job_status: [
        "pending",
        "approved",
        "in_progress",
        "waiting_parts",
        "delayed",
        "completed",
        "cancelled",
      ],
      member_role: [
        "super_admin",
        "business_owner",
        "manager",
        "employee",
        "customer",
      ],
      notification_channel: [
        "whatsapp",
        "facebook",
        "instagram",
        "tiktok",
        "email",
        "sms",
        "push",
      ],
      product_category: [
        "oem",
        "genuine",
        "aftermarket",
        "refurbished",
        "used",
        "custom",
      ],
      quote_status: [
        "draft",
        "sent",
        "revised",
        "approved",
        "declined",
        "expired",
        "cancelled",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
      ],
    },
  },
} as const

// App-owned compatibility aliases.
// The generated `Database` type above remains the source of truth; this layer
// preserves the convenience exports the app already imports.
type PublicSchema = Database["public"];
type AppTables = PublicSchema["Tables"];
type AppEnums = PublicSchema["Enums"];

export type Approval = AppTables["approvals"]["Row"];
export type ApprovalInsert = AppTables["approvals"]["Insert"];
export type ApprovalUpdate = AppTables["approvals"]["Update"];

export type BillingInvoice = AppTables["billing_invoices"]["Row"];
export type BillingInvoiceInsert = AppTables["billing_invoices"]["Insert"];
export type BillingInvoiceUpdate = AppTables["billing_invoices"]["Update"];

export type BillingPlan = AppTables["billing_plans"]["Row"];
export type BillingPlanInsert = AppTables["billing_plans"]["Insert"];
export type BillingPlanUpdate = AppTables["billing_plans"]["Update"];

export type BillingPlanFeature = AppTables["billing_plan_features"]["Row"];
export type BillingPlanFeatureInsert = AppTables["billing_plan_features"]["Insert"];
export type BillingPlanFeatureUpdate = AppTables["billing_plan_features"]["Update"];

export type Branch = AppTables["branches"]["Row"];
export type BranchInsert = AppTables["branches"]["Insert"];
export type BranchUpdate = AppTables["branches"]["Update"];

export type Business = AppTables["businesses"]["Row"];
export type BusinessInsert = AppTables["businesses"]["Insert"];
export type BusinessUpdate = AppTables["businesses"]["Update"];

export type BusinessInvitation = AppTables["business_invitations"]["Row"];
export type BusinessInvitationInsert = AppTables["business_invitations"]["Insert"];
export type BusinessInvitationUpdate = AppTables["business_invitations"]["Update"];

export type BusinessMember = AppTables["business_members"]["Row"];
export type BusinessMemberInsert = AppTables["business_members"]["Insert"];
export type BusinessMemberUpdate = AppTables["business_members"]["Update"];

export type Complaint = AppTables["complaints"]["Row"];
export type ComplaintInsert = AppTables["complaints"]["Insert"];
export type ComplaintUpdate = AppTables["complaints"]["Update"];

export type ComplaintMessage = AppTables["complaint_messages"]["Row"];
export type ComplaintMessageInsert = AppTables["complaint_messages"]["Insert"];
export type ComplaintMessageUpdate = AppTables["complaint_messages"]["Update"];

export type ComplaintSeverity = AppEnums["complaint_severity"];
export type ComplaintStatus = AppEnums["complaint_status"];

export type Customer = AppTables["customers"]["Row"];
export type CustomerInsert = AppTables["customers"]["Insert"];
export type CustomerUpdate = AppTables["customers"]["Update"];

export type Document = AppTables["documents"]["Row"];
export type DocumentInsert = AppTables["documents"]["Insert"];
export type DocumentUpdate = AppTables["documents"]["Update"];

export type Job = AppTables["jobs"]["Row"];
export type JobInsert = AppTables["jobs"]["Insert"];

export type JobStatus = AppEnums["job_status"];

export type JobTask = AppTables["job_tasks"]["Row"];
export type JobTaskInsert = AppTables["job_tasks"]["Insert"];
export type JobTaskUpdate = AppTables["job_tasks"]["Update"];

export type JobUpdate = AppTables["job_updates"]["Row"];
export type JobUpdateInsert = AppTables["job_updates"]["Insert"];
export type JobUpdateUpdate = AppTables["job_updates"]["Update"];

export type ItemKind = AppEnums["item_kind"];

export type MemberRole = AppEnums["member_role"];

export type MembershipBundle = AppTables["membership_bundles"]["Row"];
export type MembershipBundleInsert = AppTables["membership_bundles"]["Insert"];
export type MembershipBundleUpdate = AppTables["membership_bundles"]["Update"];

export type NotificationEvent = AppTables["notification_events"]["Row"];
export type NotificationEventInsert = AppTables["notification_events"]["Insert"];
export type NotificationEventUpdate = AppTables["notification_events"]["Update"];

export type Profile = AppTables["profiles"]["Row"];
export type ProfileInsert = AppTables["profiles"]["Insert"];
export type ProfileUpdate = AppTables["profiles"]["Update"];

export type ProductCategory = AppEnums["product_category"];

export type Quotation = AppTables["quotations"]["Row"];
export type QuotationInsert = AppTables["quotations"]["Insert"];
export type QuotationUpdate = AppTables["quotations"]["Update"];

export type QuotationItem = AppTables["quotation_items"]["Row"];
export type QuotationItemInsert = AppTables["quotation_items"]["Insert"];
export type QuotationItemUpdate = AppTables["quotation_items"]["Update"];

export type QuoteStatus = AppEnums["quote_status"];

export type Service = AppTables["services"]["Row"];
export type ServiceInsert = AppTables["services"]["Insert"];
export type ServiceUpdate = AppTables["services"]["Update"];

export type Subscription = AppTables["subscriptions"]["Row"];
export type SubscriptionInsert = AppTables["subscriptions"]["Insert"];
export type SubscriptionUpdate = AppTables["subscriptions"]["Update"];

export type SubscriptionItem = AppTables["subscription_items"]["Row"];
export type SubscriptionItemInsert = AppTables["subscription_items"]["Insert"];
export type SubscriptionItemUpdate = AppTables["subscription_items"]["Update"];

export type SubscriptionStatus = AppEnums["subscription_status"];

export type Vehicle = AppTables["vehicles"]["Row"];
export type VehicleInsert = AppTables["vehicles"]["Insert"];
export type VehicleUpdate = AppTables["vehicles"]["Update"];

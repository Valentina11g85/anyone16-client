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
      audit_logs: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          is_demo: boolean
          metadata: Json
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          is_demo?: boolean
          metadata?: Json
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          is_demo?: boolean
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_policies: {
        Row: {
          active: boolean
          actor: string
          country_code: string | null
          created_at: string
          id: string
          is_demo: boolean
          label: string
          penalty_percentage: number
          priority: number
          refund_percentage: number
          release_delay_hours: number
          trigger: string
          updated_at: string
          worker_percentage: number
        }
        Insert: {
          active?: boolean
          actor: string
          country_code?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          label: string
          penalty_percentage?: number
          priority?: number
          refund_percentage?: number
          release_delay_hours?: number
          trigger: string
          updated_at?: string
          worker_percentage?: number
        }
        Update: {
          active?: boolean
          actor?: string
          country_code?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          label?: string
          penalty_percentage?: number
          priority?: number
          refund_percentage?: number
          release_delay_hours?: number
          trigger?: string
          updated_at?: string
          worker_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_policies_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      categories: {
        Row: {
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string
          default_currency_code: string
          default_language_code: string
          is_active: boolean
          name: string
          timezone: string
        }
        Insert: {
          code: string
          default_currency_code: string
          default_language_code: string
          is_active?: boolean
          name: string
          timezone: string
        }
        Update: {
          code?: string
          default_currency_code?: string
          default_language_code?: string
          is_active?: boolean
          name?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "countries_default_currency_code_fkey"
            columns: ["default_currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "countries_default_language_code_fkey"
            columns: ["default_language_code"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          decimal_places: number
          is_active: boolean
          name: string
          symbol: string
        }
        Insert: {
          code: string
          decimal_places?: number
          is_active?: boolean
          name: string
          symbol: string
        }
        Update: {
          code?: string
          decimal_places?: number
          is_active?: boolean
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      customer_profiles: {
        Row: {
          approximate_latitude: number | null
          approximate_longitude: number | null
          cancellations: number
          city: string | null
          completed_favors: number
          country_code: string | null
          created_at: string
          display_name: string | null
          id: string
          is_demo: boolean
          preferences: Json
          profile_id: string
          published_favors: number
          rating: number
          region: string | null
          updated_at: string
          zone: string | null
        }
        Insert: {
          approximate_latitude?: number | null
          approximate_longitude?: number | null
          cancellations?: number
          city?: string | null
          completed_favors?: number
          country_code?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_demo?: boolean
          preferences?: Json
          profile_id: string
          published_favors?: number
          rating?: number
          region?: string | null
          updated_at?: string
          zone?: string | null
        }
        Update: {
          approximate_latitude?: number | null
          approximate_longitude?: number | null
          cancellations?: number
          city?: string | null
          completed_favors?: number
          country_code?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_demo?: boolean
          preferences?: Json
          profile_id?: string
          published_favors?: number
          rating?: number
          region?: string | null
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_context: {
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
      disputes: {
        Row: {
          appeal_status: string | null
          assigned_admin_profile_id: string | null
          category: string
          closed_at: string | null
          created_at: string
          decision: string | null
          description: string | null
          evidence: Json
          evidence_bundle: Json
          favor_id: string
          id: string
          is_demo: boolean
          opened_by_profile_id: string | null
          opened_by_role: string
          payment_id: string | null
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by_profile_id: string | null
          status: Database["public"]["Enums"]["dispute_state"]
          updated_at: string
        }
        Insert: {
          appeal_status?: string | null
          assigned_admin_profile_id?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          decision?: string | null
          description?: string | null
          evidence?: Json
          evidence_bundle?: Json
          favor_id: string
          id?: string
          is_demo?: boolean
          opened_by_profile_id?: string | null
          opened_by_role?: string
          payment_id?: string | null
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["dispute_state"]
          updated_at?: string
        }
        Update: {
          appeal_status?: string | null
          assigned_admin_profile_id?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          decision?: string | null
          description?: string | null
          evidence?: Json
          evidence_bundle?: Json
          favor_id?: string
          id?: string
          is_demo?: boolean
          opened_by_profile_id?: string | null
          opened_by_role?: string
          payment_id?: string | null
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["dispute_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_assigned_admin_profile_id_fkey"
            columns: ["assigned_admin_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_profile_id_fkey"
            columns: ["opened_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_profile_id_fkey"
            columns: ["resolved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favor_code_attempts: {
        Row: {
          actor_user_id: string | null
          created_at: string
          favor_id: string
          id: string
          is_demo: boolean
          latitude: number | null
          longitude: number | null
          session_metadata: Json
          succeeded: boolean
          worker_profile_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          favor_id: string
          id?: string
          is_demo?: boolean
          latitude?: number | null
          longitude?: number | null
          session_metadata?: Json
          succeeded?: boolean
          worker_profile_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          favor_id?: string
          id?: string
          is_demo?: boolean
          latitude?: number | null
          longitude?: number | null
          session_metadata?: Json
          succeeded?: boolean
          worker_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favor_code_attempts_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favor_code_attempts_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favor_completion_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          failed_attempts: number
          favor_id: string
          id: string
          is_demo: boolean
          max_attempts: number
          status: Database["public"]["Enums"]["completion_code_state"]
          updated_at: string
          used_at: string | null
          used_by_worker_profile_id: string | null
          used_latitude: number | null
          used_longitude: number | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          failed_attempts?: number
          favor_id: string
          id?: string
          is_demo?: boolean
          max_attempts?: number
          status?: Database["public"]["Enums"]["completion_code_state"]
          updated_at?: string
          used_at?: string | null
          used_by_worker_profile_id?: string | null
          used_latitude?: number | null
          used_longitude?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          failed_attempts?: number
          favor_id?: string
          id?: string
          is_demo?: boolean
          max_attempts?: number
          status?: Database["public"]["Enums"]["completion_code_state"]
          updated_at?: string
          used_at?: string | null
          used_by_worker_profile_id?: string | null
          used_latitude?: number | null
          used_longitude?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "favor_completion_codes_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favor_completion_codes_used_by_worker_profile_id_fkey"
            columns: ["used_by_worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favor_evidence: {
        Row: {
          amount: number | null
          captured_at: string
          created_at: string
          currency_code: string | null
          customer_profile_id: string | null
          description: string | null
          favor_id: string
          id: string
          is_demo: boolean
          kind: string
          latitude: number | null
          longitude: number | null
          metadata: Json
          photo_url: string | null
          receipt_url: string | null
          worker_profile_id: string | null
        }
        Insert: {
          amount?: number | null
          captured_at?: string
          created_at?: string
          currency_code?: string | null
          customer_profile_id?: string | null
          description?: string | null
          favor_id: string
          id?: string
          is_demo?: boolean
          kind: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json
          photo_url?: string | null
          receipt_url?: string | null
          worker_profile_id?: string | null
        }
        Update: {
          amount?: number | null
          captured_at?: string
          created_at?: string
          currency_code?: string | null
          customer_profile_id?: string | null
          description?: string | null
          favor_id?: string
          id?: string
          is_demo?: boolean
          kind?: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json
          photo_url?: string | null
          receipt_url?: string | null
          worker_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favor_evidence_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "favor_evidence_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favor_evidence_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favor_evidence_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favor_locations: {
        Row: {
          created_at: string
          favor_id: string
          id: string
          instructions: string | null
          is_demo: boolean
          kind: string
          location_id: string
          position: number
          wait_minutes: number | null
        }
        Insert: {
          created_at?: string
          favor_id: string
          id?: string
          instructions?: string | null
          is_demo?: boolean
          kind?: string
          location_id: string
          position?: number
          wait_minutes?: number | null
        }
        Update: {
          created_at?: string
          favor_id?: string
          id?: string
          instructions?: string | null
          is_demo?: boolean
          kind?: string
          location_id?: string
          position?: number
          wait_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "favor_locations_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favor_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      favors: {
        Row: {
          additional_stops: Json
          ai_interpretation: Json | null
          cancelled_at: string | null
          category_slug: string | null
          city: string | null
          completed_at: string | null
          country_code: string
          created_at: string
          currency_code: string
          customer_budget_amount: number | null
          customer_budget_currency: string
          customer_profile_id: string | null
          description: string
          destination_location_id: string | null
          estimated_duration_minutes: number | null
          estimated_total_minutes: number | null
          estimated_travel_minutes: number | null
          estimated_wait_minutes: number | null
          id: string
          is_demo: boolean
          item_count: number | null
          language_code: string
          origin_latitude: number | null
          origin_longitude: number | null
          owner_user_id: string | null
          pickup_location_id: string | null
          published_at: string | null
          recommended_max: number | null
          recommended_min: number | null
          region: string | null
          route_distance_km: number | null
          scheduled_date: string | null
          scheduled_preset: string | null
          scheduled_time: string | null
          selected_offer_id: string | null
          selected_worker_profile_id: string | null
          special_instructions: string | null
          status: Database["public"]["Enums"]["favor_status"]
          stop_count: number
          time_window: string | null
          title: string | null
          updated_at: string
          urgency: string
          waiting_duration: string | null
          waiting_required: boolean
          zone_label: string | null
        }
        Insert: {
          additional_stops?: Json
          ai_interpretation?: Json | null
          cancelled_at?: string | null
          category_slug?: string | null
          city?: string | null
          completed_at?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          customer_budget_amount?: number | null
          customer_budget_currency?: string
          customer_profile_id?: string | null
          description: string
          destination_location_id?: string | null
          estimated_duration_minutes?: number | null
          estimated_total_minutes?: number | null
          estimated_travel_minutes?: number | null
          estimated_wait_minutes?: number | null
          id?: string
          is_demo?: boolean
          item_count?: number | null
          language_code?: string
          origin_latitude?: number | null
          origin_longitude?: number | null
          owner_user_id?: string | null
          pickup_location_id?: string | null
          published_at?: string | null
          recommended_max?: number | null
          recommended_min?: number | null
          region?: string | null
          route_distance_km?: number | null
          scheduled_date?: string | null
          scheduled_preset?: string | null
          scheduled_time?: string | null
          selected_offer_id?: string | null
          selected_worker_profile_id?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["favor_status"]
          stop_count?: number
          time_window?: string | null
          title?: string | null
          updated_at?: string
          urgency?: string
          waiting_duration?: string | null
          waiting_required?: boolean
          zone_label?: string | null
        }
        Update: {
          additional_stops?: Json
          ai_interpretation?: Json | null
          cancelled_at?: string | null
          category_slug?: string | null
          city?: string | null
          completed_at?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          customer_budget_amount?: number | null
          customer_budget_currency?: string
          customer_profile_id?: string | null
          description?: string
          destination_location_id?: string | null
          estimated_duration_minutes?: number | null
          estimated_total_minutes?: number | null
          estimated_travel_minutes?: number | null
          estimated_wait_minutes?: number | null
          id?: string
          is_demo?: boolean
          item_count?: number | null
          language_code?: string
          origin_latitude?: number | null
          origin_longitude?: number | null
          owner_user_id?: string | null
          pickup_location_id?: string | null
          published_at?: string | null
          recommended_max?: number | null
          recommended_min?: number | null
          region?: string | null
          route_distance_km?: number | null
          scheduled_date?: string | null
          scheduled_preset?: string | null
          scheduled_time?: string | null
          selected_offer_id?: string | null
          selected_worker_profile_id?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["favor_status"]
          stop_count?: number
          time_window?: string | null
          title?: string | null
          updated_at?: string
          urgency?: string
          waiting_duration?: string | null
          waiting_required?: boolean
          zone_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favors_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "favors_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "favors_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "favors_customer_budget_currency_fkey"
            columns: ["customer_budget_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "favors_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favors_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favors_language_code_fkey"
            columns: ["language_code"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "favors_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favors_selected_offer_fkey"
            columns: ["selected_offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favors_selected_worker_profile_id_fkey"
            columns: ["selected_worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          code: string
          is_active: boolean
          name: string
          native_name: string
        }
        Insert: {
          code: string
          is_active?: boolean
          name: string
          native_name: string
        }
        Update: {
          code?: string
          is_active?: boolean
          name?: string
          native_name?: string
        }
        Relationships: []
      }
      location_updates: {
        Row: {
          accuracy_meters: number | null
          favor_id: string | null
          heading: number | null
          id: string
          is_demo: boolean
          latitude: number
          longitude: number
          recorded_at: string
          source: string
          speed_kmh: number | null
          worker_profile_id: string | null
        }
        Insert: {
          accuracy_meters?: number | null
          favor_id?: string | null
          heading?: number | null
          id?: string
          is_demo?: boolean
          latitude: number
          longitude: number
          recorded_at?: string
          source?: string
          speed_kmh?: number | null
          worker_profile_id?: string | null
        }
        Update: {
          accuracy_meters?: number | null
          favor_id?: string | null
          heading?: number | null
          id?: string
          is_demo?: boolean
          latitude?: number
          longitude?: number
          recorded_at?: string
          source?: string
          speed_kmh?: number | null
          worker_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_updates_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_updates_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          country_code: string | null
          created_at: string
          created_by_user_id: string | null
          details: string | null
          id: string
          instructions: string | null
          is_demo: boolean
          kind: string
          label: string
          latitude: number | null
          longitude: number | null
          place_name: string | null
          postal_code: string | null
          precision: string
          region: string | null
          source: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by_user_id?: string | null
          details?: string | null
          id?: string
          instructions?: string | null
          is_demo?: boolean
          kind?: string
          label: string
          latitude?: number | null
          longitude?: number | null
          place_name?: string | null
          postal_code?: string | null
          precision?: string
          region?: string | null
          source?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by_user_id?: string | null
          details?: string | null
          id?: string
          instructions?: string | null
          is_demo?: boolean
          kind?: string
          label?: string
          latitude?: number | null
          longitude?: number | null
          place_name?: string | null
          postal_code?: string | null
          precision?: string
          region?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          author_role: string
          body: string
          created_at: string
          favor_id: string
          id: string
          is_demo: boolean
          message_type: Database["public"]["Enums"]["message_type"]
          read_at: string | null
          receiver_profile_id: string | null
          sender_profile_id: string | null
        }
        Insert: {
          attachment_url?: string | null
          author_role?: string
          body: string
          created_at?: string
          favor_id: string
          id?: string
          is_demo?: boolean
          message_type?: Database["public"]["Enums"]["message_type"]
          read_at?: string | null
          receiver_profile_id?: string | null
          sender_profile_id?: string | null
        }
        Update: {
          attachment_url?: string | null
          author_role?: string
          body?: string
          created_at?: string
          favor_id?: string
          id?: string
          is_demo?: boolean
          message_type?: Database["public"]["Enums"]["message_type"]
          read_at?: string | null
          receiver_profile_id?: string | null
          sender_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_profile_id_fkey"
            columns: ["receiver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_demo: boolean
          is_read: boolean
          profile_id: string | null
          related_favor_id: string | null
          related_offer_id: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          is_read?: boolean
          profile_id?: string | null
          related_favor_id?: string | null
          related_offer_id?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          is_read?: boolean
          profile_id?: string | null
          related_favor_id?: string | null
          related_offer_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_favor_id_fkey"
            columns: ["related_favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_offer_id_fkey"
            columns: ["related_offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          created_at: string
          currency_code: string
          distance_km: number | null
          estimated_arrival_minutes: number | null
          favor_id: string
          id: string
          is_demo: boolean
          kind: string
          message: string | null
          offered_amount: number
          status: Database["public"]["Enums"]["offer_status"]
          updated_at: string
          worker_profile_id: string
          worker_user_id: string | null
        }
        Insert: {
          created_at?: string
          currency_code: string
          distance_km?: number | null
          estimated_arrival_minutes?: number | null
          favor_id: string
          id?: string
          is_demo?: boolean
          kind?: string
          message?: string | null
          offered_amount: number
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
          worker_profile_id: string
          worker_user_id?: string | null
        }
        Update: {
          created_at?: string
          currency_code?: string
          distance_km?: number | null
          estimated_arrival_minutes?: number | null
          favor_id?: string
          id?: string
          is_demo?: boolean
          kind?: string
          message?: string | null
          offered_amount?: number
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
          worker_profile_id?: string
          worker_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "offers_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          actor_profile_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event: string
          favor_id: string | null
          id: string
          is_demo: boolean
          metadata: Json
          new_status: string | null
          payment_id: string | null
          previous_status: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event: string
          favor_id?: string | null
          id?: string
          is_demo?: boolean
          metadata?: Json
          new_status?: string | null
          payment_id?: string | null
          previous_status?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event?: string
          favor_id?: string | null
          id?: string
          is_demo?: boolean
          metadata?: Json
          new_status?: string | null
          payment_id?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          customer_profile_id: string | null
          favor_id: string
          fee_rule_id: string | null
          id: string
          idempotency_key: string
          is_demo: boolean
          method: string | null
          offer_id: string | null
          platform_fee: number
          processing_fee: number
          provider: string | null
          provider_reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          taxes: number
          total_amount: number
          updated_at: string
          worker_amount: number
          worker_profile_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code: string
          customer_profile_id?: string | null
          favor_id: string
          fee_rule_id?: string | null
          id?: string
          idempotency_key: string
          is_demo?: boolean
          method?: string | null
          offer_id?: string | null
          platform_fee?: number
          processing_fee?: number
          provider?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          taxes?: number
          total_amount: number
          updated_at?: string
          worker_amount?: number
          worker_profile_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          customer_profile_id?: string | null
          favor_id?: string
          fee_rule_id?: string | null
          id?: string
          idempotency_key?: string
          is_demo?: boolean
          method?: string | null
          offer_id?: string | null
          platform_fee?: number
          processing_fee?: number
          provider?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          taxes?: number
          total_amount?: number
          updated_at?: string
          worker_amount?: number
          worker_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payments_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_fee_rule_id_fkey"
            columns: ["fee_rule_id"]
            isOneToOne: false
            referencedRelation: "platform_fee_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_fee_rules: {
        Row: {
          active: boolean
          category_slug: string | null
          city: string | null
          country_code: string | null
          created_at: string
          currency_code: string | null
          effective_from: string
          effective_to: string | null
          fee_type: Database["public"]["Enums"]["fee_type"]
          fixed_amount: number
          id: string
          is_demo: boolean
          label: string
          max_amount: number | null
          min_amount: number | null
          percentage: number
          priority: number
          promo_code: string | null
          updated_at: string
          user_tier: string | null
          worker_tier: string | null
        }
        Insert: {
          active?: boolean
          category_slug?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          effective_from?: string
          effective_to?: string | null
          fee_type?: Database["public"]["Enums"]["fee_type"]
          fixed_amount?: number
          id?: string
          is_demo?: boolean
          label: string
          max_amount?: number | null
          min_amount?: number | null
          percentage?: number
          priority?: number
          promo_code?: string | null
          updated_at?: string
          user_tier?: string | null
          worker_tier?: string | null
        }
        Update: {
          active?: boolean
          category_slug?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          effective_from?: string
          effective_to?: string | null
          fee_type?: Database["public"]["Enums"]["fee_type"]
          fixed_amount?: number
          id?: string
          is_demo?: boolean
          label?: string
          max_amount?: number | null
          min_amount?: number | null
          percentage?: number
          priority?: number
          promo_code?: string | null
          updated_at?: string
          user_tier?: string | null
          worker_tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_fee_rules_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "platform_fee_rules_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "platform_fee_rules_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country_code: string
          created_at: string
          currency_code: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          language_code: string
          last_seen_at: string | null
          phone: string | null
          timezone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          language_code?: string
          last_seen_at?: string | null
          phone?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          language_code?: string
          last_seen_at?: string | null
          phone?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "profiles_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "profiles_language_code_fkey"
            columns: ["language_code"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          operation: string
          subject_key: string | null
          succeeded: boolean
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation: string
          subject_key?: string | null
          succeeded?: boolean
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          operation?: string
          subject_key?: string | null
          succeeded?: boolean
        }
        Relationships: []
      }
      rate_limit_rules: {
        Row: {
          active: boolean
          cooldown_seconds: number
          description: string | null
          max_attempts: number
          operation: string
          updated_at: string
          window_seconds: number
        }
        Insert: {
          active?: boolean
          cooldown_seconds?: number
          description?: string | null
          max_attempts: number
          operation: string
          updated_at?: string
          window_seconds: number
        }
        Update: {
          active?: boolean
          cooldown_seconds?: number
          description?: string | null
          max_attempts?: number
          operation?: string
          updated_at?: string
          window_seconds?: number
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          favor_id: string
          id: string
          idempotency_key: string
          is_demo: boolean
          kind: string
          payment_id: string
          reason: string
          requested_by_profile_id: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code: string
          favor_id: string
          id?: string
          idempotency_key: string
          is_demo?: boolean
          kind?: string
          payment_id: string
          reason: string
          requested_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          favor_id?: string
          id?: string
          idempotency_key?: string
          is_demo?: boolean
          kind?: string
          payment_id?: string
          reason?: string
          requested_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "refunds_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_requested_by_profile_id_fkey"
            columns: ["requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_name: string | null
          created_at: string
          favor_id: string | null
          id: string
          is_demo: boolean
          rating: number
          review: string | null
          reviewed_profile_id: string | null
          reviewer_profile_id: string | null
          reviewer_role: string
        }
        Insert: {
          author_name?: string | null
          created_at?: string
          favor_id?: string | null
          id?: string
          is_demo?: boolean
          rating: number
          review?: string | null
          reviewed_profile_id?: string | null
          reviewer_profile_id?: string | null
          reviewer_role?: string
        }
        Update: {
          author_name?: string | null
          created_at?: string
          favor_id?: string | null
          id?: string
          is_demo?: boolean
          rating?: number
          review?: string | null
          reviewed_profile_id?: string | null
          reviewer_profile_id?: string | null
          reviewer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewed_profile_id_fkey"
            columns: ["reviewed_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_profile_id_fkey"
            columns: ["reviewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_signals: {
        Row: {
          created_at: string
          favor_id: string | null
          id: string
          is_demo: boolean
          level: Database["public"]["Enums"]["risk_level"]
          metadata: Json
          signal: string
          subject_id: string | null
          subject_type: string
          weight: number
        }
        Insert: {
          created_at?: string
          favor_id?: string | null
          id?: string
          is_demo?: boolean
          level?: Database["public"]["Enums"]["risk_level"]
          metadata?: Json
          signal: string
          subject_id?: string | null
          subject_type: string
          weight?: number
        }
        Update: {
          created_at?: string
          favor_id?: string | null
          id?: string
          is_demo?: boolean
          level?: Database["public"]["Enums"]["risk_level"]
          metadata?: Json
          signal?: string
          subject_id?: string | null
          subject_type?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_signals_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          created_at: string
          currency_code: string
          favor_id: string
          gross_amount: number
          id: string
          is_demo: boolean
          payment_id: string
          platform_fee: number
          processing_fee: number
          released_at: string | null
          status: Database["public"]["Enums"]["settlement_status"]
          taxes: number
          updated_at: string
          worker_amount: number
          worker_profile_id: string | null
        }
        Insert: {
          created_at?: string
          currency_code: string
          favor_id: string
          gross_amount: number
          id?: string
          is_demo?: boolean
          payment_id: string
          platform_fee?: number
          processing_fee?: number
          released_at?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          taxes?: number
          updated_at?: string
          worker_amount: number
          worker_profile_id?: string | null
        }
        Update: {
          created_at?: string
          currency_code?: string
          favor_id?: string
          gross_amount?: number
          id?: string
          is_demo?: boolean
          payment_id?: string
          platform_fee?: number
          processing_fee?: number
          released_at?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          taxes?: number
          updated_at?: string
          worker_amount?: number
          worker_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "settlements_favor_id_fkey"
            columns: ["favor_id"]
            isOneToOne: false
            referencedRelation: "favors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_eligibility_rules: {
        Row: {
          active: boolean
          category_slug: string | null
          city: string | null
          country_code: string | null
          created_at: string
          currency_code: string | null
          high_risk: boolean
          id: string
          is_demo: boolean
          label: string
          max_amount: number | null
          min_amount: number | null
          min_trust_level: number
          priority: number
          requires_background_check: boolean
          requires_residence: boolean
          requires_vehicle: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_slug?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          high_risk?: boolean
          id?: string
          is_demo?: boolean
          label: string
          max_amount?: number | null
          min_amount?: number | null
          min_trust_level?: number
          priority?: number
          requires_background_check?: boolean
          requires_residence?: boolean
          requires_vehicle?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_slug?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          high_risk?: boolean
          id?: string
          is_demo?: boolean
          label?: string
          max_amount?: number | null
          min_amount?: number | null
          min_trust_level?: number
          priority?: number
          requires_background_check?: boolean
          requires_residence?: boolean
          requires_vehicle?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_eligibility_rules_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "trust_eligibility_rules_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "trust_eligibility_rules_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      trust_settings: {
        Row: {
          country_code: string | null
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          country_code?: string | null
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          country_code?: string | null
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "trust_settings_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_providers: {
        Row: {
          active: boolean
          connected: boolean
          display_name: string | null
          kind: string
          notes: string | null
          provider_key: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          connected?: boolean
          display_name?: string | null
          kind: string
          notes?: string | null
          provider_key?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          connected?: boolean
          display_name?: string | null
          kind?: string
          notes?: string | null
          provider_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      verifications: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_demo: boolean
          profile_id: string
          status: Database["public"]["Enums"]["verification_status"]
          verification_type: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_demo?: boolean
          profile_id: string
          status?: Database["public"]["Enums"]["verification_status"]
          verification_type: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_demo?: boolean
          profile_id?: string
          status?: Database["public"]["Enums"]["verification_status"]
          verification_type?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_address_verifications: {
        Row: {
          city: string | null
          country_code: string | null
          created_at: string
          declared_address: string | null
          expires_at: string | null
          failure_reason: string | null
          id: string
          is_demo: boolean
          postal_code: string | null
          proof_type: string | null
          provider: string | null
          provider_reference: string | null
          region: string | null
          status: Database["public"]["Enums"]["trust_verification_state"]
          updated_at: string
          verified_at: string | null
          worker_profile_id: string
        }
        Insert: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          declared_address?: string | null
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          is_demo?: boolean
          postal_code?: string | null
          proof_type?: string | null
          provider?: string | null
          provider_reference?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["trust_verification_state"]
          updated_at?: string
          verified_at?: string | null
          worker_profile_id: string
        }
        Update: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          declared_address?: string | null
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          is_demo?: boolean
          postal_code?: string | null
          proof_type?: string | null
          provider?: string | null
          provider_reference?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["trust_verification_state"]
          updated_at?: string
          verified_at?: string | null
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_address_verifications_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "worker_address_verifications_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_background_checks: {
        Row: {
          check_type: string
          checked_at: string | null
          consent_given_at: string | null
          country_code: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_demo: boolean
          provider: string | null
          provider_reference: string | null
          result_category: string | null
          status: Database["public"]["Enums"]["trust_verification_state"]
          updated_at: string
          worker_profile_id: string
        }
        Insert: {
          check_type?: string
          checked_at?: string | null
          consent_given_at?: string | null
          country_code?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_demo?: boolean
          provider?: string | null
          provider_reference?: string | null
          result_category?: string | null
          status?: Database["public"]["Enums"]["trust_verification_state"]
          updated_at?: string
          worker_profile_id: string
        }
        Update: {
          check_type?: string
          checked_at?: string | null
          consent_given_at?: string | null
          country_code?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_demo?: boolean
          provider?: string | null
          provider_reference?: string | null
          result_category?: string | null
          status?: Database["public"]["Enums"]["trust_verification_state"]
          updated_at?: string
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_background_checks_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "worker_background_checks_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_identity_verifications: {
        Row: {
          completed_at: string | null
          consent_given_at: string | null
          created_at: string
          date_of_birth: string | null
          document_check: Database["public"]["Enums"]["trust_verification_state"]
          document_country: string | null
          document_reference: string | null
          document_type: string | null
          expires_at: string | null
          failure_reason: string | null
          id: string
          is_demo: boolean
          last_verified_at: string | null
          legal_name: string | null
          liveness_check: Database["public"]["Enums"]["trust_verification_state"]
          provider: string | null
          provider_reference: string | null
          selfie_check: Database["public"]["Enums"]["trust_verification_state"]
          started_at: string | null
          status: Database["public"]["Enums"]["trust_verification_state"]
          updated_at: string
          worker_profile_id: string
        }
        Insert: {
          completed_at?: string | null
          consent_given_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          document_check?: Database["public"]["Enums"]["trust_verification_state"]
          document_country?: string | null
          document_reference?: string | null
          document_type?: string | null
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          is_demo?: boolean
          last_verified_at?: string | null
          legal_name?: string | null
          liveness_check?: Database["public"]["Enums"]["trust_verification_state"]
          provider?: string | null
          provider_reference?: string | null
          selfie_check?: Database["public"]["Enums"]["trust_verification_state"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["trust_verification_state"]
          updated_at?: string
          worker_profile_id: string
        }
        Update: {
          completed_at?: string | null
          consent_given_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          document_check?: Database["public"]["Enums"]["trust_verification_state"]
          document_country?: string | null
          document_reference?: string | null
          document_type?: string | null
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          is_demo?: boolean
          last_verified_at?: string | null
          legal_name?: string | null
          liveness_check?: Database["public"]["Enums"]["trust_verification_state"]
          provider?: string | null
          provider_reference?: string | null
          selfie_check?: Database["public"]["Enums"]["trust_verification_state"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["trust_verification_state"]
          updated_at?: string
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_identity_verifications_document_country_fkey"
            columns: ["document_country"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "worker_identity_verifications_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_profiles: {
        Row: {
          availability_status: Database["public"]["Enums"]["availability_status"]
          available_categories: string[]
          avatar_url: string | null
          background_checked: boolean
          bio: string | null
          cancellation_rate: number
          city: string | null
          completed_favors: number
          completion_rate: number
          country_code: string | null
          created_at: string
          display_name: string
          dispute_count: number
          headline: string | null
          id: string
          identity_verified: boolean
          is_demo: boolean
          joined_at: string
          languages: string[]
          latitude: number | null
          longitude: number | null
          phone_verified: boolean
          profile_id: string
          rating: number
          rating_count: number
          region: string | null
          residence_verified: boolean
          restriction_status: Database["public"]["Enums"]["worker_restriction_kind"]
          risk_level: Database["public"]["Enums"]["risk_level"]
          risk_score: number
          service_radius_km: number
          service_zone: string | null
          specialties: string[]
          trust_level: number
          updated_at: string
          vehicle_verified: boolean
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          availability_status?: Database["public"]["Enums"]["availability_status"]
          available_categories?: string[]
          avatar_url?: string | null
          background_checked?: boolean
          bio?: string | null
          cancellation_rate?: number
          city?: string | null
          completed_favors?: number
          completion_rate?: number
          country_code?: string | null
          created_at?: string
          display_name: string
          dispute_count?: number
          headline?: string | null
          id?: string
          identity_verified?: boolean
          is_demo?: boolean
          joined_at?: string
          languages?: string[]
          latitude?: number | null
          longitude?: number | null
          phone_verified?: boolean
          profile_id: string
          rating?: number
          rating_count?: number
          region?: string | null
          residence_verified?: boolean
          restriction_status?: Database["public"]["Enums"]["worker_restriction_kind"]
          risk_level?: Database["public"]["Enums"]["risk_level"]
          risk_score?: number
          service_radius_km?: number
          service_zone?: string | null
          specialties?: string[]
          trust_level?: number
          updated_at?: string
          vehicle_verified?: boolean
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          availability_status?: Database["public"]["Enums"]["availability_status"]
          available_categories?: string[]
          avatar_url?: string | null
          background_checked?: boolean
          bio?: string | null
          cancellation_rate?: number
          city?: string | null
          completed_favors?: number
          completion_rate?: number
          country_code?: string | null
          created_at?: string
          display_name?: string
          dispute_count?: number
          headline?: string | null
          id?: string
          identity_verified?: boolean
          is_demo?: boolean
          joined_at?: string
          languages?: string[]
          latitude?: number | null
          longitude?: number | null
          phone_verified?: boolean
          profile_id?: string
          rating?: number
          rating_count?: number
          region?: string | null
          residence_verified?: boolean
          restriction_status?: Database["public"]["Enums"]["worker_restriction_kind"]
          risk_level?: Database["public"]["Enums"]["risk_level"]
          risk_score?: number
          service_radius_km?: number
          service_zone?: string | null
          specialties?: string[]
          trust_level?: number
          updated_at?: string
          vehicle_verified?: boolean
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_restrictions: {
        Row: {
          active: boolean
          created_at: string
          created_by_profile_id: string | null
          ends_at: string | null
          id: string
          is_demo: boolean
          kind: Database["public"]["Enums"]["worker_restriction_kind"]
          lifted_at: string | null
          lifted_by_profile_id: string | null
          reason: string
          required_trust_level: number | null
          restricted_categories: string[]
          starts_at: string
          updated_at: string
          worker_profile_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by_profile_id?: string | null
          ends_at?: string | null
          id?: string
          is_demo?: boolean
          kind: Database["public"]["Enums"]["worker_restriction_kind"]
          lifted_at?: string | null
          lifted_by_profile_id?: string | null
          reason: string
          required_trust_level?: number | null
          restricted_categories?: string[]
          starts_at?: string
          updated_at?: string
          worker_profile_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by_profile_id?: string | null
          ends_at?: string | null
          id?: string
          is_demo?: boolean
          kind?: Database["public"]["Enums"]["worker_restriction_kind"]
          lifted_at?: string | null
          lifted_by_profile_id?: string | null
          reason?: string
          required_trust_level?: number | null
          restricted_categories?: string[]
          starts_at?: string
          updated_at?: string
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_restrictions_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_restrictions_lifted_by_profile_id_fkey"
            columns: ["lifted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_restrictions_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_service_areas: {
        Row: {
          city: string | null
          country_code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_demo: boolean
          label: string | null
          latitude: number | null
          longitude: number | null
          radius_km: number
          region: string | null
          updated_at: string
          worker_profile_id: string
        }
        Insert: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          radius_km?: number
          region?: string | null
          updated_at?: string
          worker_profile_id: string
        }
        Update: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          radius_km?: number
          region?: string | null
          updated_at?: string
          worker_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_service_areas_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_vehicles: {
        Row: {
          country_code: string | null
          created_at: string
          document_reference: string | null
          expires_at: string | null
          failure_reason: string | null
          id: string
          insurance_status: Database["public"]["Enums"]["trust_verification_state"]
          is_active: boolean
          is_demo: boolean
          make: string | null
          model: string | null
          ownership: string
          photos: Json
          plate: string | null
          provider: string | null
          provider_reference: string | null
          status: Database["public"]["Enums"]["trust_verification_state"]
          updated_at: string
          vehicle_type: string
          verified_at: string | null
          worker_profile_id: string
          year: number | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          document_reference?: string | null
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          insurance_status?: Database["public"]["Enums"]["trust_verification_state"]
          is_active?: boolean
          is_demo?: boolean
          make?: string | null
          model?: string | null
          ownership?: string
          photos?: Json
          plate?: string | null
          provider?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["trust_verification_state"]
          updated_at?: string
          vehicle_type: string
          verified_at?: string | null
          worker_profile_id: string
          year?: number | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          document_reference?: string | null
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          insurance_status?: Database["public"]["Enums"]["trust_verification_state"]
          is_active?: boolean
          is_demo?: boolean
          make?: string | null
          model?: string | null
          ownership?: string
          photos?: Json
          plate?: string | null
          provider?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["trust_verification_state"]
          updated_at?: string
          vehicle_type?: string
          verified_at?: string | null
          worker_profile_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_vehicles_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "worker_vehicles_worker_profile_id_fkey"
            columns: ["worker_profile_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_resolve_refund: {
        Args: { _refund_id: string; _status: string }
        Returns: {
          amount: number
          created_at: string
          currency_code: string
          favor_id: string
          id: string
          idempotency_key: string
          is_demo: boolean
          kind: string
          payment_id: string
          reason: string
          requested_by_profile_id: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_worker_restriction: {
        Args: { _kind: string; _reason: string; _worker_profile_id: string }
        Returns: undefined
      }
      admin_upsert_fee_rule: {
        Args: {
          _active: boolean
          _category_slug: string
          _country_code: string
          _currency_code: string
          _effective_from: string
          _effective_to: string
          _fee_type: string
          _fixed_amount: number
          _id: string
          _label: string
          _max_amount: number
          _min_amount: number
          _percentage: number
          _priority: number
          _promo_code: string
        }
        Returns: {
          active: boolean
          category_slug: string | null
          city: string | null
          country_code: string | null
          created_at: string
          currency_code: string | null
          effective_from: string
          effective_to: string | null
          fee_type: Database["public"]["Enums"]["fee_type"]
          fixed_amount: number
          id: string
          is_demo: boolean
          label: string
          max_amount: number | null
          min_amount: number | null
          percentage: number
          priority: number
          promo_code: string | null
          updated_at: string
          user_tier: string | null
          worker_tier: string | null
        }
        SetofOptions: {
          from: "*"
          to: "platform_fee_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_worker_safety: {
        Args: never
        Returns: {
          display_name: string
          dispute_count: number
          id: string
          latitude: number
          longitude: number
          restriction_status: string
          risk_level: string
          risk_score: number
        }[]
      }
      advance_favor_payment: {
        Args: { _next: string; _payment_id: string }
        Returns: {
          amount: number
          created_at: string
          currency_code: string
          customer_profile_id: string | null
          favor_id: string
          fee_rule_id: string | null
          id: string
          idempotency_key: string
          is_demo: boolean
          method: string | null
          offer_id: string | null
          platform_fee: number
          processing_fee: number
          provider: string | null
          provider_reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          taxes: number
          total_amount: number
          updated_at: string
          worker_amount: number
          worker_profile_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_read_demo: { Args: never; Returns: boolean }
      can_read_location: { Args: { _location_id: string }; Returns: boolean }
      compute_platform_fee: {
        Args: {
          _amount: number
          _category: string
          _country: string
          _currency: string
        }
        Returns: Record<string, unknown>
      }
      create_favor_payment: {
        Args: { _favor_id: string; _method?: string }
        Returns: {
          amount: number
          created_at: string
          currency_code: string
          customer_profile_id: string | null
          favor_id: string
          fee_rule_id: string | null
          id: string
          idempotency_key: string
          is_demo: boolean
          method: string | null
          offer_id: string | null
          platform_fee: number
          processing_fee: number
          provider: string | null
          provider_reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          taxes: number
          total_amount: number
          updated_at: string
          worker_amount: number
          worker_profile_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_profile_id: { Args: never; Returns: string }
      enforce_rate_limit: {
        Args: {
          _operation: string
          _record?: boolean
          _subject?: string
          _succeeded?: boolean
        }
        Returns: undefined
      }
      ensure_favor_completion_code: {
        Args: { _favor_id: string }
        Returns: boolean
      }
      enter_demo_context: { Args: never; Returns: boolean }
      guard_auth_action: {
        Args: { _kind: string; _subject: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_favor_owner: { Args: { _favor_id: string }; Returns: boolean }
      is_favor_participant: { Args: { _favor_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_verification_service_writer: { Args: never; Returns: boolean }
      log_app_event: {
        Args: {
          _action: string
          _entity_id: string
          _entity_type: string
          _metadata?: Json
        }
        Returns: undefined
      }
      log_verification_event: {
        Args: {
          _action: string
          _entity_id: string
          _entity_type: string
          _is_demo: boolean
          _metadata: Json
        }
        Returns: undefined
      }
      notify_favor_participant: {
        Args: {
          _body?: string
          _favor_id: string
          _offer_id?: string
          _profile_id: string
          _title: string
          _type: string
        }
        Returns: undefined
      }
      owns_worker_profile: {
        Args: { _worker_profile_id: string }
        Returns: boolean
      }
      recompute_worker_trust_level: {
        Args: { _worker_profile_id: string }
        Returns: number
      }
      release_favor_settlement: {
        Args: { _settlement_id: string }
        Returns: {
          created_at: string
          currency_code: string
          favor_id: string
          gross_amount: number
          id: string
          is_demo: boolean
          payment_id: string
          platform_fee: number
          processing_fee: number
          released_at: string | null
          status: Database["public"]["Enums"]["settlement_status"]
          taxes: number
          updated_at: string
          worker_amount: number
          worker_profile_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "settlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_favor_refund: {
        Args: { _amount: number; _payment_id: string; _reason: string }
        Returns: {
          amount: number
          created_at: string
          currency_code: string
          favor_id: string
          id: string
          idempotency_key: string
          is_demo: boolean
          kind: string
          payment_id: string
          reason: string
          requested_by_profile_id: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      trust_setting_int: {
        Args: { _fallback: number; _key: string }
        Returns: number
      }
      validate_favor_completion_code: {
        Args: {
          _code: string
          _favor_id: string
          _latitude?: number
          _longitude?: number
          _session?: Json
        }
        Returns: Json
      }
      verification_provider_connected: {
        Args: { _kind: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "customer" | "worker" | "admin"
      availability_status: "available" | "unavailable"
      completion_code_state: "active" | "used" | "expired" | "revoked"
      dispute_state:
        | "open"
        | "evidence_collection"
        | "under_review"
        | "additional_info_required"
        | "resolved"
        | "appealed"
        | "closed"
        | "rejected"
        | "refunded"
        | "partially_refunded"
      favor_status:
        | "draft"
        | "ai_processing"
        | "ready_for_review"
        | "ready_to_publish"
        | "published"
        | "receiving_offers"
        | "offer_received"
        | "worker_selected"
        | "on_the_way"
        | "arrived"
        | "in_progress"
        | "near_destination"
        | "ready_for_confirmation"
        | "code_entered"
        | "completed"
        | "cancelled"
        | "disputed"
      fee_type: "percentage" | "fixed" | "hybrid"
      message_type: "text" | "image" | "location" | "system"
      offer_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "withdrawn"
        | "expired"
      payment_status:
        | "unpaid"
        | "payment_pending"
        | "authorized"
        | "paid"
        | "held"
        | "released"
        | "refunded"
        | "partially_refunded"
        | "failed"
        | "cancelled"
        | "disputed"
      refund_status:
        | "requested"
        | "approved"
        | "rejected"
        | "processed"
        | "failed"
      risk_level: "low" | "medium" | "high" | "critical"
      settlement_status: "pending" | "released" | "cancelled"
      trust_verification_state:
        | "not_started"
        | "provider_not_connected"
        | "pending"
        | "in_review"
        | "verified"
        | "rejected"
        | "expired"
        | "failed"
        | "flagged"
        | "requires_review"
      verification_status: "pending" | "verified" | "rejected" | "expired"
      worker_restriction_kind:
        | "none"
        | "additional_verification_required"
        | "category_restricted"
        | "temporarily_suspended"
        | "permanently_suspended"
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
    Enums: {
      app_role: ["customer", "worker", "admin"],
      availability_status: ["available", "unavailable"],
      completion_code_state: ["active", "used", "expired", "revoked"],
      dispute_state: [
        "open",
        "evidence_collection",
        "under_review",
        "additional_info_required",
        "resolved",
        "appealed",
        "closed",
        "rejected",
        "refunded",
        "partially_refunded",
      ],
      favor_status: [
        "draft",
        "ai_processing",
        "ready_for_review",
        "ready_to_publish",
        "published",
        "receiving_offers",
        "offer_received",
        "worker_selected",
        "on_the_way",
        "arrived",
        "in_progress",
        "near_destination",
        "ready_for_confirmation",
        "code_entered",
        "completed",
        "cancelled",
        "disputed",
      ],
      fee_type: ["percentage", "fixed", "hybrid"],
      message_type: ["text", "image", "location", "system"],
      offer_status: ["pending", "accepted", "rejected", "withdrawn", "expired"],
      payment_status: [
        "unpaid",
        "payment_pending",
        "authorized",
        "paid",
        "held",
        "released",
        "refunded",
        "partially_refunded",
        "failed",
        "cancelled",
        "disputed",
      ],
      refund_status: [
        "requested",
        "approved",
        "rejected",
        "processed",
        "failed",
      ],
      risk_level: ["low", "medium", "high", "critical"],
      settlement_status: ["pending", "released", "cancelled"],
      trust_verification_state: [
        "not_started",
        "provider_not_connected",
        "pending",
        "in_review",
        "verified",
        "rejected",
        "expired",
        "failed",
        "flagged",
        "requires_review",
      ],
      verification_status: ["pending", "verified", "rejected", "expired"],
      worker_restriction_kind: [
        "none",
        "additional_verification_required",
        "category_restricted",
        "temporarily_suspended",
        "permanently_suspended",
      ],
    },
  },
} as const

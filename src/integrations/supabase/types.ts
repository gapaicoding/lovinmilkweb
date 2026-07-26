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
      asset_accounting_policies: {
        Row: {
          capitalization_threshold: number
          created_at: string
          created_by: string | null
          default_depreciation_method: string
          deleted_at: string | null
          deleted_by: string | null
          effective_from: string
          id: string
          is_active: boolean
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capitalization_threshold: number
          created_at?: string
          created_by?: string | null
          default_depreciation_method?: string
          deleted_at?: string | null
          deleted_by?: string | null
          effective_from: string
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capitalization_threshold?: number
          created_at?: string
          created_by?: string | null
          default_depreciation_method?: string
          deleted_at?: string | null
          deleted_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_accounting_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_accounting_policies_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_accounting_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_categories: {
        Row: {
          created_at: string
          created_by: string | null
          default_useful_life_months: number | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_useful_life_months?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_useful_life_months?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_categories_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_depreciation_entries: {
        Row: {
          accumulated_depreciation: number
          asset_id: string
          created_at: string
          created_by: string | null
          depreciation_amount: number
          ending_book_value: number
          id: string
          notes: string | null
          period_month: string
          posted_at: string | null
          status: string
        }
        Insert: {
          accumulated_depreciation: number
          asset_id: string
          created_at?: string
          created_by?: string | null
          depreciation_amount: number
          ending_book_value: number
          id?: string
          notes?: string | null
          period_month: string
          posted_at?: string | null
          status?: string
        }
        Update: {
          accumulated_depreciation?: number
          asset_id?: string
          created_at?: string
          created_by?: string | null
          depreciation_amount?: number
          ending_book_value?: number
          id?: string
          notes?: string | null
          period_month?: string
          posted_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_depreciation_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_depreciation_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_book_values"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "asset_depreciation_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          accounting_policy_id: string | null
          acquisition_cost: number
          acquisition_date: string
          adjustment_note: string | null
          asset_category_id: string
          asset_code: string
          asset_name: string
          asset_name_normalized: string
          asset_source_key: string | null
          asset_status: string
          brand: string | null
          capitalization_status: string
          capitalization_threshold: number
          correction_reason: string | null
          created_at: string
          created_by: string | null
          data_origin: string
          deleted_at: string | null
          deleted_by: string | null
          depreciation_method: string
          depreciation_start_date: string | null
          id: string
          import_batch_id: string | null
          location: string | null
          monthly_depreciation: number | null
          notes: string | null
          original_source_cost: string | null
          record_source: string
          reference_source_id: string | null
          residual_value: number
          size: string | null
          source_file: string | null
          source_row: number | null
          source_sheet: string | null
          supplier_name_raw: string | null
          updated_at: string
          updated_by: string | null
          useful_life_months: number
        }
        Insert: {
          accounting_policy_id?: string | null
          acquisition_cost: number
          acquisition_date: string
          adjustment_note?: string | null
          asset_category_id: string
          asset_code: string
          asset_name: string
          asset_name_normalized: string
          asset_source_key?: string | null
          asset_status?: string
          brand?: string | null
          capitalization_status: string
          capitalization_threshold?: number
          correction_reason?: string | null
          created_at?: string
          created_by?: string | null
          data_origin?: string
          deleted_at?: string | null
          deleted_by?: string | null
          depreciation_method?: string
          depreciation_start_date?: string | null
          id?: string
          import_batch_id?: string | null
          location?: string | null
          monthly_depreciation?: number | null
          notes?: string | null
          original_source_cost?: string | null
          record_source?: string
          reference_source_id?: string | null
          residual_value?: number
          size?: string | null
          source_file?: string | null
          source_row?: number | null
          source_sheet?: string | null
          supplier_name_raw?: string | null
          updated_at?: string
          updated_by?: string | null
          useful_life_months: number
        }
        Update: {
          accounting_policy_id?: string | null
          acquisition_cost?: number
          acquisition_date?: string
          adjustment_note?: string | null
          asset_category_id?: string
          asset_code?: string
          asset_name?: string
          asset_name_normalized?: string
          asset_source_key?: string | null
          asset_status?: string
          brand?: string | null
          capitalization_status?: string
          capitalization_threshold?: number
          correction_reason?: string | null
          created_at?: string
          created_by?: string | null
          data_origin?: string
          deleted_at?: string | null
          deleted_by?: string | null
          depreciation_method?: string
          depreciation_start_date?: string | null
          id?: string
          import_batch_id?: string | null
          location?: string | null
          monthly_depreciation?: number | null
          notes?: string | null
          original_source_cost?: string | null
          record_source?: string
          reference_source_id?: string | null
          residual_value?: number
          size?: string | null
          source_file?: string | null
          source_row?: number | null
          source_sheet?: string | null
          supplier_name_raw?: string | null
          updated_at?: string
          updated_by?: string | null
          useful_life_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_accounting_policy_id_fkey"
            columns: ["accounting_policy_id"]
            isOneToOne: false
            referencedRelation: "asset_accounting_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_asset_category_id_fkey"
            columns: ["asset_category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_reference_source_id_fkey"
            columns: ["reference_source_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_reference_source_id_fkey"
            columns: ["reference_source_id"]
            isOneToOne: false
            referencedRelation: "v_asset_book_values"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "assets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_audit_log: {
        Row: {
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          entity_id: string
          entity_type: string
          id: string
          occurred_at: string
          operation: string
          reason: string | null
        }
        Insert: {
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          occurred_at?: string
          operation: string
          reason?: string | null
        }
        Update: {
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          occurred_at?: string
          operation?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_traffic_daily: {
        Row: {
          adult_visitors: number
          bill_count: number | null
          child_visitors: number
          created_at: string
          created_by: string | null
          data_origin: string
          id: string
          import_batch_id: string
          source_file: string
          source_key: string
          source_row: number | null
          source_sheet: string
          total_visitors: number
          traffic_date: string
        }
        Insert: {
          adult_visitors: number
          bill_count?: number | null
          child_visitors: number
          created_at?: string
          created_by?: string | null
          data_origin?: string
          id?: string
          import_batch_id: string
          source_file: string
          source_key: string
          source_row?: number | null
          source_sheet: string
          total_visitors: number
          traffic_date: string
        }
        Update: {
          adult_visitors?: number
          bill_count?: number | null
          child_visitors?: number
          created_at?: string
          created_by?: string | null
          data_origin?: string
          id?: string
          import_batch_id?: string
          source_file?: string
          source_key?: string
          source_row?: number | null
          source_sheet?: string
          total_visitors?: number
          traffic_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_traffic_daily_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_traffic_daily_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sales_summaries: {
        Row: {
          adult_visitors: number | null
          bill_count: number | null
          cash: number | null
          cashier: string | null
          child_visitors: number | null
          closing_cash: number | null
          coupon_count: number | null
          created_at: string
          created_by: string | null
          data_entry_status: string | null
          data_origin: string
          date_raw: string | null
          day_name_raw: string | null
          debit_edc_bca: number | null
          deposit_method: string | null
          deposited_cash: number | null
          dine_in: number | null
          id: string
          import_batch_id: string
          membership_count: number | null
          opening_cash: number | null
          payment_sum: number | null
          qris_dretail: number | null
          qris_dynamic_bca: number | null
          qris_static_bca: number | null
          qris_static_bri: number | null
          reservation: number | null
          sale_date: string
          source_file: string
          source_key: string
          source_row: number | null
          source_sheet: string
          takeaway: number | null
          total_sales: number
          total_sales_arayya: number | null
          total_sales_difference: number | null
          total_sales_lovin: number | null
          visitor_total: number | null
        }
        Insert: {
          adult_visitors?: number | null
          bill_count?: number | null
          cash?: number | null
          cashier?: string | null
          child_visitors?: number | null
          closing_cash?: number | null
          coupon_count?: number | null
          created_at?: string
          created_by?: string | null
          data_entry_status?: string | null
          data_origin?: string
          date_raw?: string | null
          day_name_raw?: string | null
          debit_edc_bca?: number | null
          deposit_method?: string | null
          deposited_cash?: number | null
          dine_in?: number | null
          id?: string
          import_batch_id: string
          membership_count?: number | null
          opening_cash?: number | null
          payment_sum?: number | null
          qris_dretail?: number | null
          qris_dynamic_bca?: number | null
          qris_static_bca?: number | null
          qris_static_bri?: number | null
          reservation?: number | null
          sale_date: string
          source_file: string
          source_key: string
          source_row?: number | null
          source_sheet: string
          takeaway?: number | null
          total_sales: number
          total_sales_arayya?: number | null
          total_sales_difference?: number | null
          total_sales_lovin?: number | null
          visitor_total?: number | null
        }
        Update: {
          adult_visitors?: number | null
          bill_count?: number | null
          cash?: number | null
          cashier?: string | null
          child_visitors?: number | null
          closing_cash?: number | null
          coupon_count?: number | null
          created_at?: string
          created_by?: string | null
          data_entry_status?: string | null
          data_origin?: string
          date_raw?: string | null
          day_name_raw?: string | null
          debit_edc_bca?: number | null
          deposit_method?: string | null
          deposited_cash?: number | null
          dine_in?: number | null
          id?: string
          import_batch_id?: string
          membership_count?: number | null
          opening_cash?: number | null
          payment_sum?: number | null
          qris_dretail?: number | null
          qris_dynamic_bca?: number | null
          qris_static_bca?: number | null
          qris_static_bri?: number | null
          reservation?: number | null
          sale_date?: string
          source_file?: string
          source_key?: string
          source_row?: number | null
          source_sheet?: string
          takeaway?: number | null
          total_sales?: number
          total_sales_arayya?: number | null
          total_sales_difference?: number | null
          total_sales_lovin?: number | null
          visitor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_sales_summaries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_sales_summaries_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      data_coverage_periods: {
        Row: {
          availability_status: string
          created_at: string
          created_by: string | null
          domain: string
          id: string
          import_batch_id: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          row_count: number
        }
        Insert: {
          availability_status: string
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          import_batch_id: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          row_count?: number
        }
        Update: {
          availability_status?: string
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          import_batch_id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "data_coverage_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_coverage_periods_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      data_import_batches: {
        Row: {
          assets_full: boolean
          batch_key: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string
          expected_metrics: Json
          facts_period_end: string | null
          facts_period_start: string | null
          id: string
          source_manifest: Json
          started_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assets_full?: boolean
          batch_key: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          expected_metrics?: Json
          facts_period_end?: string | null
          facts_period_start?: string | null
          id?: string
          source_manifest?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assets_full?: boolean
          batch_key?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          expected_metrics?: Json
          facts_period_end?: string | null
          facts_period_start?: string | null
          id?: string
          source_manifest?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_import_batches_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_import_reconciliation_results: {
        Row: {
          actual_value: string | null
          checked_at: string
          details: Json
          expected_value: string | null
          id: string
          import_batch_id: string
          metric_key: string
          passed: boolean
          phase: string
        }
        Insert: {
          actual_value?: string | null
          checked_at?: string
          details?: Json
          expected_value?: string | null
          id?: string
          import_batch_id: string
          metric_key: string
          passed: boolean
          phase: string
        }
        Update: {
          actual_value?: string | null
          checked_at?: string
          details?: Json
          expected_value?: string | null
          id?: string
          import_batch_id?: string
          metric_key?: string
          passed?: boolean
          phase?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_import_reconciliation_results_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_items: {
        Row: {
          created_at: string
          created_by: string
          default_price: number
          deleted_at: string | null
          deleted_by: string | null
          expense_category_id: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          sku: string | null
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          default_price?: number
          deleted_at?: string | null
          deleted_by?: string | null
          expense_category_id: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          sku?: string | null
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          default_price?: number
          deleted_at?: string | null
          deleted_by?: string | null
          expense_category_id?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          sku?: string | null
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_items_expense_category_id_fkey"
            columns: ["expense_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          expense_category_id: string
          expense_item_id: string
          id: string
          notes: string | null
          quantity: number
          record_source: string
          transaction_date: string
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expense_category_id: string
          expense_item_id: string
          id?: string
          notes?: string | null
          quantity?: number
          record_source?: string
          transaction_date: string
          unit_price: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expense_category_id?: string
          expense_item_id?: string
          id?: string
          notes?: string | null
          quantity?: number
          record_source?: string
          transaction_date?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_expense_category_id_fkey"
            columns: ["expense_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_expense_item_id_fkey"
            columns: ["expense_item_id"]
            isOneToOne: false
            referencedRelation: "expense_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_product_aliases: {
        Row: {
          alias_key: string
          alias_name: string
          created_at: string
          created_by: string | null
          historical_product_id: string
          id: string
          import_batch_id: string
          mapping_status: string
          normalized_alias: string
          occurrence_count: number
          similarity_to_latest_menu: number | null
          spelling_normalized_alias: string | null
        }
        Insert: {
          alias_key: string
          alias_name: string
          created_at?: string
          created_by?: string | null
          historical_product_id: string
          id?: string
          import_batch_id: string
          mapping_status: string
          normalized_alias: string
          occurrence_count?: number
          similarity_to_latest_menu?: number | null
          spelling_normalized_alias?: string | null
        }
        Update: {
          alias_key?: string
          alias_name?: string
          created_at?: string
          created_by?: string | null
          historical_product_id?: string
          id?: string
          import_batch_id?: string
          mapping_status?: string
          normalized_alias?: string
          occurrence_count?: number
          similarity_to_latest_menu?: number | null
          spelling_normalized_alias?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_product_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_product_aliases_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_product_aliases_product_batch_fkey"
            columns: ["import_batch_id", "historical_product_id"]
            isOneToOne: false
            referencedRelation: "historical_products"
            referencedColumns: ["import_batch_id", "id"]
          },
        ]
      }
      historical_product_daily_quantities: {
        Row: {
          canonical_product_name: string
          category_name: string | null
          category_raw_variants: string | null
          created_at: string
          created_by: string | null
          data_origin: string
          historical_product_id: string
          id: string
          import_batch_id: string
          is_free_menu: boolean
          quantity: number
          raw_variants: string | null
          sale_date: string
          source_file: string
          source_key: string
          source_references: string | null
        }
        Insert: {
          canonical_product_name: string
          category_name?: string | null
          category_raw_variants?: string | null
          created_at?: string
          created_by?: string | null
          data_origin?: string
          historical_product_id: string
          id?: string
          import_batch_id: string
          is_free_menu?: boolean
          quantity: number
          raw_variants?: string | null
          sale_date: string
          source_file: string
          source_key: string
          source_references?: string | null
        }
        Update: {
          canonical_product_name?: string
          category_name?: string | null
          category_raw_variants?: string | null
          created_at?: string
          created_by?: string | null
          data_origin?: string
          historical_product_id?: string
          id?: string
          import_batch_id?: string
          is_free_menu?: boolean
          quantity?: number
          raw_variants?: string | null
          sale_date?: string
          source_file?: string
          source_key?: string
          source_references?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_product_daily_qty_product_batch_fkey"
            columns: ["import_batch_id", "historical_product_id"]
            isOneToOne: false
            referencedRelation: "historical_products"
            referencedColumns: ["import_batch_id", "id"]
          },
          {
            foreignKeyName: "historical_product_daily_quantities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_product_daily_quantities_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_products: {
        Row: {
          canonical_name: string
          category_name: string | null
          created_at: string
          created_by: string | null
          current_product_id: string | null
          current_product_match_strategy: string | null
          historical_product_key: string
          id: string
          import_batch_id: string
          mapping_status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          canonical_name: string
          category_name?: string | null
          created_at?: string
          created_by?: string | null
          current_product_id?: string | null
          current_product_match_strategy?: string | null
          historical_product_key: string
          id?: string
          import_batch_id: string
          mapping_status: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          canonical_name?: string
          category_name?: string | null
          created_at?: string
          created_by?: string | null
          current_product_id?: string | null
          current_product_match_strategy?: string | null
          historical_product_key?: string
          id?: string
          import_batch_id?: string
          mapping_status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_products_current_product_id_fkey"
            columns: ["current_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_products_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_distributions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          distribution_date: string
          distribution_type: string
          id: string
          import_batch_id: string | null
          notes: string | null
          recipient: string | null
          record_source: string
          source_reference: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          distribution_date: string
          distribution_type?: string
          id?: string
          import_batch_id?: string | null
          notes?: string | null
          recipient?: string | null
          record_source?: string
          source_reference?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          distribution_date?: string
          distribution_type?: string
          id?: string
          import_batch_id?: string | null
          notes?: string | null
          recipient?: string | null
          record_source?: string
          source_reference?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_distributions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_distributions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_distributions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_distributions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          sales_category_id: string
          selling_price: number
          sku: string | null
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          sales_category_id: string
          selling_price?: number
          sku?: string | null
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          sales_category_id?: string
          selling_price?: number
          sku?: string | null
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_sales_category_id_fkey"
            columns: ["sales_category_id"]
            isOneToOne: false
            referencedRelation: "sales_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      purchase_invoices: {
        Row: {
          correction_reason: string | null
          created_at: string
          created_by: string | null
          data_origin: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          import_batch_id: string | null
          invoice_source_key: string
          notes: string | null
          purchase_date: string
          receipt_reference: string | null
          record_source: string
          reference_source_id: string | null
          source_file: string
          source_sheet: string
          status: string
          supplier_id: string | null
          supplier_name_raw: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          correction_reason?: string | null
          created_at?: string
          created_by?: string | null
          data_origin?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_source_key: string
          notes?: string | null
          purchase_date: string
          receipt_reference?: string | null
          record_source?: string
          reference_source_id?: string | null
          source_file: string
          source_sheet: string
          status?: string
          supplier_id?: string | null
          supplier_name_raw?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          correction_reason?: string | null
          created_at?: string
          created_by?: string | null
          data_origin?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_source_key?: string
          notes?: string | null
          purchase_date?: string
          receipt_reference?: string | null
          record_source?: string
          reference_source_id?: string | null
          source_file?: string
          source_sheet?: string
          status?: string
          supplier_id?: string | null
          supplier_name_raw?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_reference_source_id_fkey"
            columns: ["reference_source_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_reference_source_id_fkey"
            columns: ["reference_source_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_invoice_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          amount: number
          amount_difference: number | null
          asset_tracking: boolean
          calculated_total: number | null
          classification_policy: string | null
          correction_reason: string | null
          created_at: string
          created_by: string | null
          data_origin: string
          deleted_at: string | null
          deleted_by: string | null
          financial_class: string
          id: string
          import_batch_id: string | null
          item_name_normalized: string
          item_name_raw: string
          line_source_key: string
          purchase_invoice_id: string
          quantity: number
          record_source: string
          reference_source_id: string | null
          source_category: string | null
          source_file: string
          source_row: number | null
          source_sheet: string
          unit: string | null
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          amount_difference?: number | null
          asset_tracking?: boolean
          calculated_total?: number | null
          classification_policy?: string | null
          correction_reason?: string | null
          created_at?: string
          created_by?: string | null
          data_origin?: string
          deleted_at?: string | null
          deleted_by?: string | null
          financial_class: string
          id?: string
          import_batch_id?: string | null
          item_name_normalized: string
          item_name_raw: string
          line_source_key: string
          purchase_invoice_id: string
          quantity: number
          record_source?: string
          reference_source_id?: string | null
          source_category?: string | null
          source_file: string
          source_row?: number | null
          source_sheet: string
          unit?: string | null
          unit_price: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          amount_difference?: number | null
          asset_tracking?: boolean
          calculated_total?: number | null
          classification_policy?: string | null
          correction_reason?: string | null
          created_at?: string
          created_by?: string | null
          data_origin?: string
          deleted_at?: string | null
          deleted_by?: string | null
          financial_class?: string
          id?: string
          import_batch_id?: string | null
          item_name_normalized?: string
          item_name_raw?: string
          line_source_key?: string
          purchase_invoice_id?: string
          quantity?: number
          record_source?: string
          reference_source_id?: string | null
          source_category?: string | null
          source_file?: string
          source_row?: number | null
          source_sheet?: string
          unit?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_invoice_batch_fkey"
            columns: ["import_batch_id", "purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["import_batch_id", "id"]
          },
          {
            foreignKeyName: "purchase_items_invoice_batch_fkey"
            columns: ["import_batch_id", "purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_invoice_index"
            referencedColumns: ["import_batch_id", "id"]
          },
          {
            foreignKeyName: "purchase_items_reference_source_id_fkey"
            columns: ["reference_source_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          entry_source: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          record_source: string
          sales_category_id: string
          transaction_date: string
          unit_price: number
          updated_at: string
          updated_by: string | null
          visitor_visit_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entry_source?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          record_source?: string
          sales_category_id: string
          transaction_date: string
          unit_price: number
          updated_at?: string
          updated_by?: string | null
          visitor_visit_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entry_source?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          record_source?: string
          sales_category_id?: string
          transaction_date?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          visitor_visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sales_category_id_fkey"
            columns: ["sales_category_id"]
            isOneToOne: false
            referencedRelation: "sales_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_visitor_visit_id_fkey"
            columns: ["visitor_visit_id"]
            isOneToOne: false
            referencedRelation: "visitor_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_items: {
        Row: {
          brand_raw: string | null
          catalog_no: string | null
          classification_policy: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          financial_class: string | null
          id: string
          import_batch_id: string | null
          is_active: boolean
          item_name_normalized: string
          item_name_raw: string
          price_parse_status: string | null
          price_raw: string | null
          reference_price: number | null
          size_raw: string | null
          source_file: string | null
          source_row: number | null
          source_sheet: string | null
          supplier_id: string | null
          supplier_item_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_raw?: string | null
          catalog_no?: string | null
          classification_policy?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          financial_class?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          item_name_normalized: string
          item_name_raw: string
          price_parse_status?: string | null
          price_raw?: string | null
          reference_price?: number | null
          size_raw?: string | null
          source_file?: string | null
          source_row?: number | null
          source_sheet?: string | null
          supplier_id?: string | null
          supplier_item_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_raw?: string | null
          catalog_no?: string | null
          classification_policy?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          financial_class?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          item_name_normalized?: string
          item_name_raw?: string
          price_parse_status?: string | null
          price_raw?: string | null
          reference_price?: number | null
          size_raw?: string | null
          source_file?: string | null
          source_row?: number | null
          source_sheet?: string | null
          supplier_id?: string | null
          supplier_item_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_items_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          import_batch_id: string | null
          is_active: boolean
          link: string | null
          normalized_name: string
          phone: string | null
          source_references: string | null
          source_type: string | null
          supplier_key: string
          supplier_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          link?: string | null
          normalized_name: string
          phone?: string | null
          source_references?: string | null
          source_type?: string | null
          supplier_key: string
          supplier_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          link?: string | null
          normalized_name?: string
          phone?: string | null
          source_references?: string | null
          source_type?: string | null
          supplier_key?: string
          supplier_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          import_batch_id: string | null
          notes: string | null
          payment_date: string | null
          period_end: string
          period_start: string
          record_source: string
          source_reference: string | null
          status: string
          tax_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          notes?: string | null
          payment_date?: string | null
          period_end: string
          period_start: string
          record_source?: string
          source_reference?: string | null
          status?: string
          tax_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          import_batch_id?: string | null
          notes?: string | null
          payment_date?: string | null
          period_end?: string
          period_start?: string
          record_source?: string
          source_reference?: string | null
          status?: string
          tax_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_entries_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_entries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_visits: {
        Row: {
          check_in_at: string
          check_out_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          notes: string | null
          updated_at: string
          updated_by: string
          visitor_id: string
        }
        Insert: {
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          updated_by: string
          visitor_id: string
        }
        Update: {
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_visits_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      visitors: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
          updated_by: string
          visitor_code: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          updated_by: string
          visitor_code: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string
          visitor_code?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_asset_book_values: {
        Row: {
          accumulated_depreciation: number | null
          acquisition_cost: number | null
          acquisition_date: string | null
          asset_category: string | null
          asset_code: string | null
          asset_id: string | null
          asset_name: string | null
          asset_status: string | null
          capitalization_status: string | null
          current_book_value: number | null
          import_batch_id: string | null
          monthly_depreciation: number | null
          useful_life_months: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      v_financial_statement_monthly: {
        Row: {
          batch_key: string | null
          depreciation: number | null
          dividend_amount: number | null
          dividend_recorded: boolean | null
          ebit_operating_profit: number | null
          ebitda: number | null
          gross_profit: number | null
          hpp: number | null
          import_batch_id: string | null
          month_start: string | null
          net_income_final: number | null
          net_income_provisional_before_tax: number | null
          operating_expense: number | null
          retained_earnings_final: number | null
          revenue: number | null
          statement_status: string | null
          tax_amount: number | null
          tax_recorded: boolean | null
        }
        Relationships: []
      }
      v_purchase_invoice_index: {
        Row: {
          created_at: string | null
          data_origin: string | null
          deleted_at: string | null
          has_asset: boolean | null
          has_hpp: boolean | null
          has_operating_expense: boolean | null
          has_other: boolean | null
          id: string | null
          import_batch: Json | null
          import_batch_id: string | null
          invoice_source_key: string | null
          invoice_total: number | null
          item_count: number | null
          notes: string | null
          purchase_date: string | null
          purchase_items: Json | null
          receipt_reference: string | null
          record_source: string | null
          record_state: string | null
          search_text: string | null
          status: string | null
          supplier: Json | null
          supplier_id: string | null
          supplier_name_raw: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_visitor_purchase: {
        Args: { p_items: Json; p_visit_id: string }
        Returns: Json
      }
      admin_run_batch_reconciliation: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      admin_update_profile_authorization: {
        Args: {
          p_is_active?: boolean
          p_profile_id: string
          p_role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      admin_write_purchase_invoice_atomic: {
        Args: {
          p_import_batch_id: string
          p_invoice_id?: string
          p_items: Json
          p_notes?: string
          p_purchase_date: string
          p_receipt_reference?: string
          p_supplier_id?: string
          p_supplier_name_raw?: string
        }
        Returns: string
      }
      check_out_visitor: { Args: { p_visit_id: string }; Returns: Json }
      current_user_has_any_role: {
        Args: { p_roles: string[] }
        Returns: boolean
      }
      current_user_is_active: { Args: never; Returns: boolean }
      current_user_is_product_manager: { Args: never; Returns: boolean }
      current_user_is_super_admin: { Args: never; Returns: boolean }
      get_financial_statement_range: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          depreciation: number
          dividend_amount: number
          dividend_recorded: boolean
          ebit_operating_profit: number
          ebitda: number
          gross_profit: number
          historical_batch_ids: string[]
          hpp: number
          net_income_final: number
          net_income_provisional_before_tax: number
          operating_expense: number
          period_end: string
          period_start: string
          retained_earnings_final: number
          revenue: number
          source_record_count: number
          statement_status: string
          tax_amount: number
          tax_recorded: boolean
        }[]
      }
      get_operational_dashboard_month: {
        Args: { p_batch_key: string; p_month_start: string }
        Returns: {
          bill_count: number
          product_quantity: number
          revenue: number
          source_days: number
          visitors: number
        }[]
      }
      get_purchase_breakdown_range: {
        Args: {
          p_end_date: string
          p_financial_classes?: string[]
          p_start_date: string
        }
        Returns: {
          amount: number
          financial_class: string
          item_name: string
          line_count: number
        }[]
      }
      hard_delete_visitor: {
        Args: { p_visitor_id: string }
        Returns: undefined
      }
      hard_delete_visitor_visit: {
        Args: { p_visit_id: string }
        Returns: undefined
      }
      insert_visitor_sales: {
        Args: {
          p_items: Json
          p_transaction_at?: string
          p_user_id: string
          p_visit_id: string
        }
        Returns: Json
      }
      is_admin_or_super_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      list_visitor_visits: {
        Args: {
          p_from?: string
          p_page?: number
          p_page_size?: number
          p_query?: string
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      list_visitors_admin: {
        Args: {
          p_deleted?: boolean
          p_page?: number
          p_page_size?: number
          p_query?: string
        }
        Returns: Json
      }
      lm_is_active_admin: { Args: never; Returns: boolean }
      lm_is_active_staff_or_above: { Args: never; Returns: boolean }
      lm_is_active_super_admin: { Args: never; Returns: boolean }
      lm_mark_reconciled_batches_stale: {
        Args: {
          p_batch_ids: string[]
          p_operation: string
          p_source_relation: string
        }
        Returns: undefined
      }
      lm_reconcile_import_batch_internal: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      record_report_export: {
        Args: {
          p_end_date: string
          p_filters?: Json
          p_report_type: string
          p_start_date: string
        }
        Returns: undefined
      }
      record_visitor_purchase: {
        Args: {
          p_full_name?: string
          p_items: Json
          p_phone?: string
          p_visit_notes?: string
          p_visitor_id?: string
        }
        Returns: Json
      }
      require_visitor_role: { Args: { p_roles: string[] }; Returns: string }
      restore_visitor: { Args: { p_visitor_id: string }; Returns: undefined }
      restore_visitor_visit: {
        Args: { p_visit_id: string }
        Returns: undefined
      }
      save_operational_purchase_invoice: {
        Args: {
          p_invoice_id?: string
          p_items: Json
          p_notes?: string
          p_purchase_date: string
          p_receipt_reference?: string
          p_supplier_id?: string
          p_supplier_name_raw?: string
        }
        Returns: string
      }
      search_operational_visitors: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          active_visit_id: string
          full_name: string
          has_active_visit: boolean
          id: string
          phone: string
          visitor_code: string
        }[]
      }
      soft_delete_expense: { Args: { p_id: string }; Returns: boolean }
      soft_delete_sale: { Args: { p_id: string }; Returns: boolean }
      soft_delete_visitor: {
        Args: { p_visitor_id: string }
        Returns: undefined
      }
      soft_delete_visitor_visit: {
        Args: { p_visit_id: string }
        Returns: undefined
      }
      update_visitor_identity: {
        Args: {
          p_full_name: string
          p_notes?: string
          p_phone?: string
          p_visitor_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
          updated_by: string
          visitor_code: string
        }
        SetofOptions: {
          from: "*"
          to: "visitors"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "super_admin" | "staff"
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
      app_role: ["admin", "super_admin", "staff"],
    },
  },
} as const

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
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          computer_name: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          ip_address: unknown
          office_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          computer_name?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          ip_address?: unknown
          office_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          computer_name?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          ip_address?: unknown
          office_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      barcode_scans: {
        Row: {
          action: Database["public"]["Enums"]["scan_action"]
          barcode_id: string
          batch_id: string | null
          client_txn_id: string
          device_source: Database["public"]["Enums"]["scan_source"]
          id: string
          ledger_id: string | null
          office_id: string
          product_id: string
          scanned_at: string
          scanned_by: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["scan_action"]
          barcode_id: string
          batch_id?: string | null
          client_txn_id: string
          device_source?: Database["public"]["Enums"]["scan_source"]
          id?: string
          ledger_id?: string | null
          office_id: string
          product_id: string
          scanned_at?: string
          scanned_by?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["scan_action"]
          barcode_id?: string
          batch_id?: string | null
          client_txn_id?: string
          device_source?: Database["public"]["Enums"]["scan_source"]
          id?: string
          ledger_id?: string | null
          office_id?: string
          product_id?: string
          scanned_at?: string
          scanned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barcode_scans_barcode_id_fkey"
            columns: ["barcode_id"]
            isOneToOne: false
            referencedRelation: "product_barcodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barcode_scans_barcode_id_fkey"
            columns: ["barcode_id"]
            isOneToOne: false
            referencedRelation: "v_batch_barcodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barcode_scans_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barcode_scans_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_activity"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "barcode_scans_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_registry"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "barcode_scans_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barcode_scans_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "v_product_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barcode_scans_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barcode_scans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barcode_scans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "barcode_scans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "barcode_scans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          name: string
          office_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          office_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brands_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          name: string
          office_id: string
          parent_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          office_id?: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          gst_no: string | null
          id: string
          is_active: boolean
          mobile: string | null
          name: string
          office_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          gst_no?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name: string
          office_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          gst_no?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          office_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      inward_items: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          inward_id: string
          office_id: string
          product_id: string
          product_unit_id: string | null
          quantity: number
          remarks: string | null
          unit_cost: number | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inward_id: string
          office_id?: string
          product_id: string
          product_unit_id?: string | null
          quantity: number
          remarks?: string | null
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inward_id?: string
          office_id?: string
          product_id?: string
          product_unit_id?: string | null
          quantity?: number
          remarks?: string | null
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inward_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inward_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_activity"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "inward_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_registry"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "inward_items_inward_id_fkey"
            columns: ["inward_id"]
            isOneToOne: false
            referencedRelation: "inwards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inward_items_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inward_items_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
        ]
      }
      inwards: {
        Row: {
          brought_by: string | null
          client_txn_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          invoice_date: string | null
          invoice_file_path: string | null
          invoice_no: string | null
          inward_no: string
          notes: string | null
          office_id: string
          purchase_order_no: string | null
          received_at: string
          status: Database["public"]["Enums"]["inward_status"]
          supplier_id: string | null
          total_quantity: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          brought_by?: string | null
          client_txn_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invoice_date?: string | null
          invoice_file_path?: string | null
          invoice_no?: string | null
          inward_no: string
          notes?: string | null
          office_id: string
          purchase_order_no?: string | null
          received_at?: string
          status?: Database["public"]["Enums"]["inward_status"]
          supplier_id?: string | null
          total_quantity?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          brought_by?: string | null
          client_txn_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invoice_date?: string | null
          invoice_file_path?: string | null
          invoice_no?: string | null
          inward_no?: string
          notes?: string | null
          office_id?: string
          purchase_order_no?: string | null
          received_at?: string
          status?: Database["public"]["Enums"]["inward_status"]
          supplier_id?: string | null
          total_quantity?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inwards_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inwards_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_components: {
        Row: {
          component_product_id: string
          created_at: string
          created_by: string | null
          id: string
          kit_product_id: string
          office_id: string
          quantity: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          component_product_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kit_product_id: string
          office_id?: string
          quantity: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          component_product_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kit_product_id?: string
          office_id?: string
          quantity?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "kit_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "kit_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "kit_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "kit_components_kit_product_id_fkey"
            columns: ["kit_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_components_kit_product_id_fkey"
            columns: ["kit_product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "kit_components_kit_product_id_fkey"
            columns: ["kit_product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "kit_components_kit_product_id_fkey"
            columns: ["kit_product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "kit_components_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          gst_no: string | null
          id: string
          is_active: boolean
          name: string
          state: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          gst_no?: string | null
          id?: string
          is_active?: boolean
          name: string
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          gst_no?: string | null
          id?: string
          is_active?: boolean
          name?: string
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      outward_items: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          office_id: string
          outward_id: string
          product_id: string
          product_unit_id: string | null
          quantity: number
          unit_price: number | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string
          outward_id: string
          product_id: string
          product_unit_id?: string | null
          quantity: number
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string
          outward_id?: string
          product_id?: string
          product_unit_id?: string | null
          quantity?: number
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "outward_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outward_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_activity"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "outward_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_registry"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "outward_items_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outward_items_outward_id_fkey"
            columns: ["outward_id"]
            isOneToOne: false
            referencedRelation: "outwards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "outward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "outward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "outward_items_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
        ]
      }
      outwards: {
        Row: {
          client_txn_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_method: string | null
          handed_over_by: string | null
          id: string
          invoice_no: string | null
          issued_at: string
          notes: string | null
          office_id: string
          outward_no: string
          outward_type: Database["public"]["Enums"]["outward_type"]
          received_by: string | null
          sales_order_no: string | null
          signature_path: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          client_txn_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_method?: string | null
          handed_over_by?: string | null
          id?: string
          invoice_no?: string | null
          issued_at?: string
          notes?: string | null
          office_id: string
          outward_no: string
          outward_type: Database["public"]["Enums"]["outward_type"]
          received_by?: string | null
          sales_order_no?: string | null
          signature_path?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          client_txn_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_method?: string | null
          handed_over_by?: string | null
          id?: string
          invoice_no?: string | null
          issued_at?: string
          notes?: string | null
          office_id?: string
          outward_no?: string
          outward_type?: Database["public"]["Enums"]["outward_type"]
          received_by?: string | null
          sales_order_no?: string | null
          signature_path?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "outwards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outwards_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          batch_id: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          office_id: string
          product_id: string
          sequence_number: number | null
          status: Database["public"]["Enums"]["barcode_status"]
          symbology: Database["public"]["Enums"]["barcode_symbology"]
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          batch_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          office_id?: string
          product_id: string
          sequence_number?: number | null
          status?: Database["public"]["Enums"]["barcode_status"]
          symbology?: Database["public"]["Enums"]["barcode_symbology"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          batch_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          office_id?: string
          product_id?: string
          sequence_number?: number | null
          status?: Database["public"]["Enums"]["barcode_status"]
          symbology?: Database["public"]["Enums"]["barcode_symbology"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_activity"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "product_barcodes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_registry"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "product_barcodes_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_batches: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          generated_quantity: number
          id: string
          office_id: string
          product_id: string
          remaining_quantity: number
          status: Database["public"]["Enums"]["batch_status"]
          total_quantity: number
          updated_at: string
          updated_by: string | null
          used_quantity: number
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          generated_quantity?: number
          id?: string
          office_id?: string
          product_id: string
          remaining_quantity?: number
          status?: Database["public"]["Enums"]["batch_status"]
          total_quantity?: number
          updated_at?: string
          updated_by?: string | null
          used_quantity?: number
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          generated_quantity?: number
          id?: string
          office_id?: string
          product_id?: string
          remaining_quantity?: number
          status?: Database["public"]["Enums"]["batch_status"]
          total_quantity?: number
          updated_at?: string
          updated_by?: string | null
          used_quantity?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note_text: string
          office_id: string
          product_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note_text: string
          office_id?: string
          product_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note_text?: string
          office_id?: string
          product_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_notes_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_units: {
        Row: {
          created_at: string
          created_by: string | null
          current_office_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          office_id: string
          product_id: string
          serial_no: string | null
          status: Database["public"]["Enums"]["unit_status"]
          unit_barcode: string
          updated_at: string
          updated_by: string | null
          version: number
          warranty_expires_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_office_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          office_id?: string
          product_id: string
          serial_no?: string | null
          status?: Database["public"]["Enums"]["unit_status"]
          unit_barcode?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          warranty_expires_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_office_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          office_id?: string
          product_id?: string
          serial_no?: string | null
          status?: Database["public"]["Enums"]["unit_status"]
          unit_barcode?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          warranty_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_units_current_office_id_fkey"
            columns: ["current_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          barcode_type: Database["public"]["Enums"]["barcode_symbology"] | null
          brand_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          gst_percent: number | null
          hsn_code: string | null
          id: string
          is_active: boolean
          is_kit: boolean
          min_stock: number
          model_number: string | null
          name: string
          office_id: string
          product_code: string
          tracking_mode: Database["public"]["Enums"]["tracking_mode"]
          uom_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          barcode_type?: Database["public"]["Enums"]["barcode_symbology"] | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          gst_percent?: number | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          is_kit?: boolean
          min_stock?: number
          model_number?: string | null
          name: string
          office_id?: string
          product_code?: string
          tracking_mode?: Database["public"]["Enums"]["tracking_mode"]
          uom_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          barcode_type?: Database["public"]["Enums"]["barcode_symbology"] | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          gst_percent?: number | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          is_kit?: boolean
          min_stock?: number
          model_number?: string | null
          name?: string
          office_id?: string
          product_code?: string
          tracking_mode?: Database["public"]["Enums"]["tracking_mode"]
          uom_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          full_name: string
          id: string
          is_active: boolean
          is_office_login: boolean
          mobile: string | null
          office_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          full_name: string
          id: string
          is_active?: boolean
          is_office_login?: boolean
          mobile?: string | null
          office_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_office_login?: boolean
          mobile?: string | null
          office_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_balances: {
        Row: {
          batch_id: string | null
          damaged_quantity: number
          id: string
          office_id: string
          product_id: string
          qty_available: number | null
          qty_on_hand: number
          qty_reserved: number
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          damaged_quantity?: number
          id?: string
          office_id: string
          product_id: string
          qty_available?: number | null
          qty_on_hand?: number
          qty_reserved?: number
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          damaged_quantity?: number
          id?: string
          office_id?: string
          product_id?: string
          qty_available?: number | null
          qty_on_hand?: number
          qty_reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_balances_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_activity"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_balances_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_registry"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_balances_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
        ]
      }
      stock_ledger: {
        Row: {
          balance_after: number
          batch_id: string | null
          client_txn_id: string
          computer_name: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          occurred_at: string
          office_id: string
          product_id: string
          product_unit_id: string | null
          qty_delta: number
          ref_id: string | null
          ref_type: Database["public"]["Enums"]["doc_ref_type"] | null
          txn_type: Database["public"]["Enums"]["stock_txn_type"]
        }
        Insert: {
          balance_after: number
          batch_id?: string | null
          client_txn_id: string
          computer_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          office_id: string
          product_id: string
          product_unit_id?: string | null
          qty_delta: number
          ref_id?: string | null
          ref_type?: Database["public"]["Enums"]["doc_ref_type"] | null
          txn_type: Database["public"]["Enums"]["stock_txn_type"]
        }
        Update: {
          balance_after?: number
          batch_id?: string | null
          client_txn_id?: string
          computer_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          office_id?: string
          product_id?: string
          product_unit_id?: string | null
          qty_delta?: number
          ref_id?: string | null
          ref_type?: Database["public"]["Enums"]["doc_ref_type"] | null
          txn_type?: Database["public"]["Enums"]["stock_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_activity"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_ledger_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_registry"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_ledger_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_ledger_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          gst_no: string | null
          id: string
          is_active: boolean
          mobile: string | null
          name: string
          office_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          gst_no?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name: string
          office_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          gst_no?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          office_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          office_id: string
          product_id: string
          product_unit_id: string | null
          quantity: number
          transfer_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string
          product_id: string
          product_unit_id?: string | null
          quantity: number
          transfer_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          office_id?: string
          product_id?: string
          product_unit_id?: string | null
          quantity?: number
          transfer_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transfer_items_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "transfer_items_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          courier_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          dispatched_at: string | null
          dispatched_by: string | null
          docket_no: string | null
          from_office_id: string
          id: string
          notes: string | null
          received_at: string | null
          received_by: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          to_office_id: string
          transfer_no: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          courier_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          docket_no?: string | null
          from_office_id: string
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_office_id: string
          transfer_no: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          courier_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          docket_no?: string | null
          from_office_id?: string
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_office_id?: string
          transfer_no?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_office_id_fkey"
            columns: ["from_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_office_id_fkey"
            columns: ["to_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      uoms: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          office_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          office_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "uoms_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_barcode_status_summary: {
        Row: {
          qty_generated: number | null
          qty_in_stock: number | null
          qty_outward: number | null
          qty_void: number | null
          total_units: number | null
        }
        Relationships: []
      }
      v_batch_activity: {
        Row: {
          batch_code: string | null
          batch_created_at: string | null
          batch_created_by: string | null
          batch_id: string | null
          brand_name: string | null
          category_id: string | null
          category_name: string | null
          first_barcode_code: string | null
          last_activity_at: string | null
          product_id: string | null
          product_name: string | null
          qty_generated: number | null
          qty_in_stock: number | null
          qty_outward: number | null
          qty_void: number | null
          sku_barcode: string | null
          total_barcodes: number | null
          total_qty_on_hand: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_batch_barcodes: {
        Row: {
          batch_id: string | null
          code: string | null
          created_at: string | null
          device_source: Database["public"]["Enums"]["scan_source"] | null
          generated_at: string | null
          generated_by_name: string | null
          id: string | null
          inwarded_at: string | null
          outwarded_at: string | null
          product_id: string | null
          scanned_at: string | null
          scanned_by_name: string | null
          scanned_office_name: string | null
          status: Database["public"]["Enums"]["barcode_status"] | null
          symbology: Database["public"]["Enums"]["barcode_symbology"] | null
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_activity"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "product_barcodes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_registry"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
        ]
      }
      v_batch_registry: {
        Row: {
          batch_code: string | null
          batch_created_at: string | null
          batch_created_by: string | null
          batch_id: string | null
          brand_name: string | null
          category_id: string | null
          category_name: string | null
          first_barcode_code: string | null
          product_id: string | null
          product_name: string | null
          qty_generated: number | null
          qty_in_stock: number | null
          qty_outward: number | null
          qty_void: number | null
          sku_barcode: string | null
          total_barcodes: number | null
          total_qty_on_hand: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_current_stock: {
        Row: {
          brand_name: string | null
          category_name: string | null
          damaged_quantity: number | null
          is_low_stock: boolean | null
          min_stock: number | null
          office_id: string | null
          office_name: string | null
          product_id: string | null
          product_name: string | null
          qty_available: number | null
          qty_on_hand: number | null
          qty_reserved: number | null
          sku_barcode: string | null
          uom_code: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inward_history: {
        Row: {
          batch_code: string | null
          batch_id: string | null
          brought_by: string | null
          created_at: string | null
          id: string | null
          invoice_date: string | null
          invoice_file_path: string | null
          invoice_no: string | null
          inward_no: string | null
          inward_qty: number | null
          notes: string | null
          office_id: string | null
          product_id: string | null
          product_name: string | null
          purchase_order_no: string | null
          qty_generated: number | null
          qty_in_stock: number | null
          qty_outward: number | null
          qty_void: number | null
          received_at: string | null
          remaining_qty: number | null
          supplier_address: string | null
          supplier_gst: string | null
          supplier_mobile: string | null
          supplier_name: string | null
          total_barcodes: number | null
          total_qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inward_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inward_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_activity"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "inward_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_registry"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "inward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inwards_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      v_outward_history: {
        Row: {
          batch_code: string | null
          contact_person: string | null
          created_at: string | null
          delivery_method: string | null
          handed_over_by: string | null
          id: string | null
          invoice_no: string | null
          issued_at: string | null
          notes: string | null
          office_id: string | null
          outward_no: string | null
          outward_qty: number | null
          outward_type: Database["public"]["Enums"]["outward_type"] | null
          party_address: string | null
          party_gst: string | null
          party_mobile: string | null
          party_name: string | null
          product_id: string | null
          product_name: string | null
          received_by: string | null
          remaining_qty: number | null
          sales_order_no: string | null
          total_qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "outward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "outward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "outward_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "outwards_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      v_product_ledger: {
        Row: {
          balance_after: number | null
          created_by_name: string | null
          id: string | null
          notes: string | null
          occurred_at: string | null
          office_id: string | null
          office_name: string | null
          party_name: string | null
          product_id: string | null
          product_name: string | null
          qty_delta: number | null
          ref_id: string | null
          ref_type: Database["public"]["Enums"]["doc_ref_type"] | null
          sku_barcode: string | null
          txn_type: Database["public"]["Enums"]["stock_txn_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_current_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_dashboard"
            referencedColumns: ["product_id"]
          },
        ]
      }
      v_product_stock_status: {
        Row: {
          generated_units: number | null
          in_stock_units: number | null
          min_stock: number | null
          outward_units: number | null
          product_id: string | null
          product_name: string | null
          total_units: number | null
        }
        Relationships: []
      }
      v_stock_balances_by_batch: {
        Row: {
          batch_id: string | null
          office_id: string | null
          product_id: string | null
          qty_on_hand: number | null
        }
        Relationships: []
      }
      v_stock_dashboard: {
        Row: {
          brand_name: string | null
          category_name: string | null
          inward_qty: number | null
          is_low_stock: boolean | null
          min_stock: number | null
          office_id: string | null
          office_name: string | null
          opening_qty: number | null
          outward_qty: number | null
          product_code: string | null
          product_id: string | null
          product_name: string | null
          qty_available: number | null
          qty_on_hand: number | null
          qty_reserved: number | null
          sku_barcode: string | null
          uom_code: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      delete_all_inventory_data: {
        Args: { p_confirm_code: string }
        Returns: undefined
      }
      delete_inward: { Args: { p_inward_id: string }; Returns: undefined }
      delete_ledger_entry: { Args: { p_ledger_id: string }; Returns: undefined }
      delete_outward: { Args: { p_outward_id: string }; Returns: undefined }
      save_inward: {
        Args: {
          p_barcodes?: string[]
          p_batch_code?: string
          p_batch_id?: string
          p_brought_by?: string
          p_client_txn_id: string
          p_invoice_date?: string
          p_invoice_file_path?: string
          p_invoice_no?: string
          p_notes?: string
          p_product_id: string
          p_purchase_order?: string
          p_qty: number
          p_supplier_gst?: string
          p_supplier_mobile?: string
          p_supplier_name: string
        }
        Returns: Json
      }
      save_outward:
        | {
            Args: {
              p_batch_id?: string
              p_client_txn_id: string
              p_computer_name?: string
              p_contact_person?: string
              p_delivery_method?: string
              p_handed_over_by?: string
              p_invoice_no?: string
              p_mobile?: string
              p_notes?: string
              p_outward_type: Database["public"]["Enums"]["outward_type"]
              p_party_address?: string
              p_party_gst?: string
              p_party_name?: string
              p_product_id: string
              p_qty: number
              p_received_by?: string
              p_sales_order_no?: string
              p_signature_path?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_batch_id?: string
              p_batches?: Json
              p_client_txn_id: string
              p_contact_person?: string
              p_delivery_method?: string
              p_handed_over_by?: string
              p_invoice_no?: string
              p_mobile?: string
              p_notes?: string
              p_outward_type: Database["public"]["Enums"]["outward_type"]
              p_party_address?: string
              p_party_gst?: string
              p_party_name?: string
              p_product_id: string
              p_qty: number
              p_received_by?: string
              p_sales_order_no?: string
            }
            Returns: Json
          }
      scan_lookup: { Args: { p_code: string }; Returns: Json }
      scan_receive: {
        Args: {
          p_client_txn_id: string
          p_code: string
          p_device_source?: Database["public"]["Enums"]["scan_source"]
          p_document_id?: string
          p_scan_context?: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      stock_adjust: {
        Args: {
          p_client_txn_id: string
          p_product_id: string
          p_qty_delta: number
          p_reason: string
        }
        Returns: Json
      }
      transfer_dispatch: {
        Args: {
          p_client_txn_id: string
          p_courier_name?: string
          p_docket_no?: string
          p_notes?: string
          p_product_id: string
          p_qty: number
          p_to_office_id: string
        }
        Returns: Json
      }
      transfer_receive: {
        Args: {
          p_client_txn_id: string
          p_notes?: string
          p_transfer_id: string
        }
        Returns: Json
      }
      uuid_generate_v5_compat: {
        Args: { p_name: string; p_namespace: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "ADMIN" | "STORE_MANAGER" | "SALES_EXECUTIVE"
      barcode_status:
        | "GENERATED"
        | "IN_STOCK"
        | "OUTWARD"
        | "VOID"
        | "AVAILABLE"
        | "ALLOCATED"
        | "INWARDED"
        | "OUTWARDED"
        | "DAMAGED"
        | "CANCELLED"
      barcode_symbology: "CODE128" | "EAN13" | "UPCA" | "QR" | "OTHER"
      batch_status:
        | "CREATED"
        | "ACTIVE"
        | "PARTIALLY_USED"
        | "FULLY_USED"
        | "CLOSED"
        | "CANCELLED"
      doc_ref_type: "INWARD" | "OUTWARD" | "TRANSFER" | "ADJUSTMENT"
      inward_status: "DRAFT" | "COMPLETED" | "CANCELLED"
      outward_type:
        | "SALE"
        | "DEMO"
        | "REPLACEMENT"
        | "INTERNAL_USE"
        | "SERVICE"
        | "SAMPLE"
      scan_action: "RECEIVE" | "ISSUE" | "VOID"
      scan_source: "USB" | "BLUETOOTH" | "CAMERA" | "MANUAL"
      stock_txn_type:
        | "OPENING"
        | "INWARD"
        | "OUTWARD"
        | "TRANSFER_OUT"
        | "TRANSFER_IN"
        | "ADJUSTMENT"
      tracking_mode: "QUANTITY" | "SERIAL"
      transfer_status: "DRAFT" | "DISPATCHED" | "RECEIVED" | "CANCELLED"
      unit_status: "IN_STOCK" | "ISSUED" | "IN_TRANSIT" | "RMA" | "SCRAPPED"
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
      app_role: ["ADMIN", "STORE_MANAGER", "SALES_EXECUTIVE"],
      barcode_status: [
        "GENERATED",
        "IN_STOCK",
        "OUTWARD",
        "VOID",
        "AVAILABLE",
        "ALLOCATED",
        "INWARDED",
        "OUTWARDED",
        "DAMAGED",
        "CANCELLED",
      ],
      barcode_symbology: ["CODE128", "EAN13", "UPCA", "QR", "OTHER"],
      batch_status: [
        "CREATED",
        "ACTIVE",
        "PARTIALLY_USED",
        "FULLY_USED",
        "CLOSED",
        "CANCELLED",
      ],
      doc_ref_type: ["INWARD", "OUTWARD", "TRANSFER", "ADJUSTMENT"],
      inward_status: ["DRAFT", "COMPLETED", "CANCELLED"],
      outward_type: [
        "SALE",
        "DEMO",
        "REPLACEMENT",
        "INTERNAL_USE",
        "SERVICE",
        "SAMPLE",
      ],
      scan_action: ["RECEIVE", "ISSUE", "VOID"],
      scan_source: ["USB", "BLUETOOTH", "CAMERA", "MANUAL"],
      stock_txn_type: [
        "OPENING",
        "INWARD",
        "OUTWARD",
        "TRANSFER_OUT",
        "TRANSFER_IN",
        "ADJUSTMENT",
      ],
      tracking_mode: ["QUANTITY", "SERIAL"],
      transfer_status: ["DRAFT", "DISPATCHED", "RECEIVED", "CANCELLED"],
      unit_status: ["IN_STOCK", "ISSUED", "IN_TRANSIT", "RMA", "SCRAPPED"],
    },
  },
} as const

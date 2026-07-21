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
      brands: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          name: string
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
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
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
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
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
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      inward_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inward_id: string
          product_id: string
          product_unit_id: string | null
          quantity: number
          unit_cost: number | null
          batch_no: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inward_id: string
          product_id: string
          product_unit_id?: string | null
          quantity: number
          unit_cost?: number | null
          batch_no?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inward_id?: string
          product_id?: string
          product_unit_id?: string | null
          quantity?: number
          unit_cost?: number | null
          batch_no?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inward_items_inward_id_fkey"
            columns: ["inward_id"]
            isOneToOne: false
            referencedRelation: "inwards"
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
          supplier_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          brought_by?: string | null
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
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          brought_by?: string | null
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
          supplier_id?: string | null
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
            foreignKeyName: "kit_components_kit_product_id_fkey"
            columns: ["kit_product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
          created_at: string
          created_by: string | null
          id: string
          outward_id: string
          product_id: string
          product_unit_id: string | null
          quantity: number
          unit_price: number | null
          batch_no: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          outward_id: string
          product_id: string
          product_unit_id?: string | null
          quantity: number
          unit_price?: number | null
          batch_no?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          outward_id?: string
          product_id?: string
          product_unit_id?: string | null
          quantity?: number
          unit_price?: number | null
          batch_no?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
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
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
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
          delivery_method: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          delivery_method?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          delivery_method?: string | null
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
      pendrive_details: {
        Row: {
          capacity_gb: number
          content_loaded_at: string | null
          content_version: string | null
          created_at: string
          created_by: string | null
          is_write_protected: boolean
          loaded_by: string | null
          product_unit_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          capacity_gb: number
          content_loaded_at?: string | null
          content_version?: string | null
          created_at?: string
          created_by?: string | null
          is_write_protected?: boolean
          loaded_by?: string | null
          product_unit_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          capacity_gb?: number
          content_loaded_at?: string | null
          content_version?: string | null
          created_at?: string
          created_by?: string | null
          is_write_protected?: boolean
          loaded_by?: string | null
          product_unit_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pendrive_details_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: true
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          product_id: string
          symbology: Database["public"]["Enums"]["barcode_symbology"]
          batch_no: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          product_id: string
          symbology?: Database["public"]["Enums"]["barcode_symbology"]
          batch_no?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          product_id?: string
          symbology?: Database["public"]["Enums"]["barcode_symbology"]
          batch_no?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
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
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
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
          sku_barcode: string
          tracking_mode: Database["public"]["Enums"]["tracking_mode"]
          uom_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
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
          sku_barcode?: string
          tracking_mode?: Database["public"]["Enums"]["tracking_mode"]
          uom_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
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
          sku_barcode?: string
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
          office_id: string
          product_id: string
          qty_available: number | null
          qty_on_hand: number
          qty_reserved: number
          updated_at: string
        }
        Insert: {
          office_id: string
          product_id: string
          qty_available?: number | null
          qty_on_hand?: number
          qty_reserved?: number
          updated_at?: string
        }
        Update: {
          office_id?: string
          product_id?: string
          qty_available?: number | null
          qty_on_hand?: number
          qty_reserved?: number
          updated_at?: string
        }
        Relationships: [
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
        ]
      }
      stock_ledger: {
        Row: {
          balance_after: number
          batch_no: string | null
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
          batch_no?: string | null
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
          batch_no?: string | null
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
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      transfer_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
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
            foreignKeyName: "transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
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
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      v_stock_balances_by_batch: {
        Row: {
          office_id: string | null
          product_id: string | null
          batch_no: string | null
          qty_on_hand: number | null
        }
        Relationships: []
      }
      v_current_stock: {
        Row: {
          brand_name: string | null
          category_name: string | null
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
        ]
      }
    }
    Functions: {
      save_inward: {
        Args: {
          p_brought_by?: string
          p_client_txn_id: string
          p_computer_name?: string
          p_invoice_date?: string
          p_invoice_no?: string
          p_notes?: string
          p_product_id: string
          p_purchase_order?: string
          p_qty: number
          p_supplier_gst?: string
          p_supplier_mobile?: string
          p_supplier_name: string
          p_invoice_file_path?: string
          p_batch_id?: string
          p_batch_code?: string
          p_barcodes?: string[]
        }
        Returns: Json
      }
      save_outward: {
        Args: {
          p_client_txn_id: string
          p_computer_name?: string
          p_contact_person?: string
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
          p_delivery_method?: string
          p_batch_id?: string
        }
        Returns: Json
      }
      scan_lookup: { Args: { p_code: string }; Returns: Json }
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
      barcode_symbology: "CODE128" | "EAN13" | "UPCA" | "QR" | "OTHER"
      doc_ref_type: "INWARD" | "OUTWARD" | "TRANSFER" | "ADJUSTMENT"
      outward_type:
        | "SALE"
        | "DEMO"
        | "REPLACEMENT"
        | "INTERNAL_USE"
        | "SERVICE"
        | "SAMPLE"
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
      barcode_symbology: ["CODE128", "EAN13", "UPCA", "QR", "OTHER"],
      doc_ref_type: ["INWARD", "OUTWARD", "TRANSFER", "ADJUSTMENT"],
      outward_type: [
        "SALE",
        "DEMO",
        "REPLACEMENT",
        "INTERNAL_USE",
        "SERVICE",
        "SAMPLE",
      ],
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

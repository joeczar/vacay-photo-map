// Database types for Supabase
// These types match the schema defined in supabase-schema.sql

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// Type helpers for better type inference
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          display_name: string | null
          is_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          is_admin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          is_admin?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      trips: {
        Row: {
          id: string
          title: string
          description: string | null
          cover_photo_url: string | null
          created_at: string
          updated_at: string
          is_public: boolean
          slug: string
          access_token_hash: string | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          cover_photo_url?: string | null
          created_at?: string
          updated_at?: string
          is_public?: boolean
          slug: string
          access_token_hash?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          cover_photo_url?: string | null
          created_at?: string
          updated_at?: string
          is_public?: boolean
          slug?: string
          access_token_hash?: string | null
        }
      }
      photos: {
        Row: {
          id: string
          trip_id: string
          cloudinary_public_id: string
          url: string
          thumbnail_url: string
          latitude: number | null
          longitude: number | null
          taken_at: string
          caption: string | null
          album: string | null
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          cloudinary_public_id: string
          url: string
          thumbnail_url: string
          latitude?: number | null
          longitude?: number | null
          taken_at: string
          caption?: string | null
          album?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          cloudinary_public_id?: string
          url?: string
          thumbnail_url?: string
          latitude?: number | null
          longitude?: number | null
          taken_at?: string
          caption?: string | null
          album?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

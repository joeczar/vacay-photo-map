// Database types for Supabase
// These will be generated from the database schema in Milestone 2
// For now, we'll create placeholder types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
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
      trip_passwords: {
        Row: {
          trip_id: string
          password_hash: string
          created_at: string
        }
        Insert: {
          trip_id: string
          password_hash: string
          created_at?: string
        }
        Update: {
          trip_id?: string
          password_hash?: string
          created_at?: string
        }
      }
      admin_credentials: {
        Row: {
          id: string
          credential_id: string
          public_key: string
          counter: number
          created_at: string
        }
        Insert: {
          id?: string
          credential_id: string
          public_key: string
          counter?: number
          created_at?: string
        }
        Update: {
          id?: string
          credential_id?: string
          public_key?: string
          counter?: number
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

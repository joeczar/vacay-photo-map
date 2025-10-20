import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Helper function to test the connection
export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('trips').select('count', { count: 'exact', head: true })
    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "relation does not exist" which is fine for now
      console.error('Supabase connection error:', error)
      return false
    }
    return true
  } catch (error) {
    console.error('Supabase connection test failed:', error)
    return false
  }
}

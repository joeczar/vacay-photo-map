// Setup type definitions for built-in Supabase Runtime APIs
import '@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';

// CORS headers for frontend access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Helper function to create JSON responses with CORS headers
const createJsonResponse = (body: unknown, status: number): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
};

interface Trip {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  is_public: boolean;
  access_token_hash: string | null;
  cover_photo_url: string | null;
  created_at: string;
  updated_at: string;
}

interface Photo {
  id: string;
  trip_id: string;
  cloudinary_public_id: string;
  url: string;
  thumbnail_url: string;
  latitude: number | null;
  longitude: number | null;
  taken_at: string;
  caption: string | null;
  created_at: string;
}

interface TripWithPhotos extends Trip {
  photos: Photo[];
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    const token = url.searchParams.get('token');

    // Validate slug parameter
    if (!slug) {
      return createJsonResponse({ error: 'Missing slug parameter' }, 400);
    }

    // Initialize Supabase client with service role key for database access
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Missing Supabase environment variables');
      return createJsonResponse({ error: 'Server configuration error' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // TODO: Future enhancement - Check for authenticated admin user
    // const authHeader = req.headers.get('Authorization')
    // If admin is authenticated, bypass all access control checks

    // Fetch trip by slug with all photos
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select(
        `
        *,
        photos (*)
      `
      )
      .eq('slug', slug)
      .single();

    // Handle errors - use generic "Unauthorized" for security
    // This prevents information leakage about trip existence
    if (tripError || !trip) {
      return createJsonResponse({ error: 'Unauthorized' }, 401);
    }

    // If trip is public, return immediately without token validation
    if (trip.is_public) {
      return createJsonResponse(trip, 200);
    }

    // For private trips, validate token
    // Missing token -> Unauthorized
    if (!token) {
      return createJsonResponse({ error: 'Unauthorized' }, 401);
    }

    // No hash stored -> Unauthorized (shouldn't happen but handle gracefully)
    if (!trip.access_token_hash) {
      console.error(`Private trip ${slug} has no access_token_hash`);
      return createJsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Compare provided token with stored hash using bcrypt
    const isValid = await bcrypt.compare(token, trip.access_token_hash);

    // Invalid token -> Unauthorized
    if (!isValid) {
      return createJsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Valid token - return trip data
    return createJsonResponse(trip, 200);
  } catch (error) {
    console.error('Edge function error:', error);
    return createJsonResponse({ error: 'Internal server error' }, 500);
  }
});

/* To invoke locally:

  1. Run `supabase start`
  2. Make HTTP requests:

  # Test public trip (no token needed)
  curl 'http://127.0.0.1:54321/functions/v1/get-trip?slug=california-roadtrip'

  # Test private trip (token required)
  curl 'http://127.0.0.1:54321/functions/v1/get-trip?slug=private-trip&token=abc123xyz'

  # Test missing slug (400 Bad Request)
  curl 'http://127.0.0.1:54321/functions/v1/get-trip'

  # Test invalid token (401 Unauthorized)
  curl 'http://127.0.0.1:54321/functions/v1/get-trip?slug=private-trip&token=wrong'

*/

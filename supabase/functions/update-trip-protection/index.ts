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

interface UpdateProtectionRequest {
  tripId: string;
  isPublic: boolean;
  token?: string; // Plaintext token to hash (only for private trips)
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return createJsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    // Initialize Supabase client with service role key for database access
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Missing Supabase environment variables');
      return createJsonResponse({ error: 'Server configuration error' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createJsonResponse({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return createJsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin (exists in user_profiles)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return createJsonResponse({ error: 'Forbidden: Admin access required' }, 403);
    }

    // Parse request body
    const body: UpdateProtectionRequest = await req.json();
    const { tripId, isPublic, token: plaintextToken } = body;

    // Validate required fields
    if (!tripId) {
      return createJsonResponse({ error: 'Missing tripId' }, 400);
    }

    if (typeof isPublic !== 'boolean') {
      return createJsonResponse({ error: 'isPublic must be a boolean' }, 400);
    }

    // Verify trip exists
    const { data: existingTrip, error: tripError } = await supabase
      .from('trips')
      .select('id')
      .eq('id', tripId)
      .single();

    if (tripError || !existingTrip) {
      return createJsonResponse({ error: 'Trip not found' }, 404);
    }

    // Build update object
    const updateData: { is_public: boolean; access_token_hash: string | null } = {
      is_public: isPublic,
      access_token_hash: null, // Clear hash when making public
    };

    // If making private and token provided, hash it
    if (!isPublic && plaintextToken) {
      const hash = await bcrypt.hash(plaintextToken, 10);
      updateData.access_token_hash = hash;
    }

    // Update the trip
    const { error: updateError } = await supabase
      .from('trips')
      .update(updateData)
      .eq('id', tripId);

    if (updateError) {
      console.error('Failed to update trip:', updateError);
      return createJsonResponse({ error: 'Failed to update trip protection' }, 500);
    }

    return createJsonResponse({ success: true }, 200);
  } catch (error) {
    console.error('Edge function error:', error);
    return createJsonResponse({ error: 'Internal server error' }, 500);
  }
});

/* To invoke locally:

  1. Run `supabase start`
  2. Make HTTP requests:

  # Update trip to public
  curl -X POST 'http://127.0.0.1:54321/functions/v1/update-trip-protection' \
    -H 'Authorization: Bearer <user-jwt>' \
    -H 'Content-Type: application/json' \
    -d '{"tripId": "uuid-here", "isPublic": true}'

  # Update trip to private with token
  curl -X POST 'http://127.0.0.1:54321/functions/v1/update-trip-protection' \
    -H 'Authorization: Bearer <user-jwt>' \
    -H 'Content-Type: application/json' \
    -d '{"tripId": "uuid-here", "isPublic": false, "token": "abc123xyz..."}'

*/

# Supabase Authentication Setup Guide

This guide walks you through enabling and configuring Supabase Authentication for the Vacay Photo Map application.

## Overview

This application uses Supabase Auth with email/password authentication. Future milestones will add additional features like user profiles, role-based access control, and more.

## Prerequisites

- A Supabase project (you should already have this from initial setup)
- Access to your Supabase Dashboard
- Your project URL and anon key in `app/.env`

## Step 1: Enable Email Authentication Provider

1. **Navigate to Authentication Settings**
   - Go to https://supabase.com/dashboard/project/YOUR_PROJECT_ID
   - Click "Authentication" in the left sidebar
   - Click "Providers" tab

2. **Enable Email Provider**
   - Find "Email" in the provider list
   - Toggle it to **Enabled** (should be enabled by default)
   - Scroll down and click "Save"

3. **Configure Email Settings**
   - Still in the "Providers" section, scroll to "Email" settings
   - **Confirm email**: Toggle ON (recommended for production, can disable for local testing)
   - **Secure email change**: Toggle ON (recommended)
   - **Double confirm email change**: Toggle ON (recommended for production)

## Step 2: Configure Email Templates

1. **Navigate to Email Templates**
   - Click "Authentication" in the left sidebar
   - Click "Email Templates" tab

2. **Customize Templates (Optional but Recommended)**

   You can customize these templates later, but here are the key ones:

   - **Confirm signup**: Sent when a user signs up
   - **Magic Link**: Sent for passwordless login (if you enable this later)
   - **Change Email Address**: Sent when user changes their email
   - **Reset Password**: Sent when user requests password reset

   Each template supports these variables:
   - `{{ .ConfirmationURL }}` - The confirmation/action URL
   - `{{ .Token }}` - The verification token
   - `{{ .TokenHash }}` - Hashed token
   - `{{ .SiteURL }}` - Your application URL

## Step 3: Configure URL Settings

1. **Navigate to URL Configuration**
   - Click "Authentication" in the left sidebar
   - Click "URL Configuration" tab

2. **Set Site URL**
   - **For Local Development**: `http://localhost:5173`
   - **For Production**: Your production URL (e.g., `https://vacay-photo-map.netlify.app`)

   > **Note**: You can add multiple redirect URLs for different environments

3. **Set Redirect URLs**

   Add these redirect URLs (one per line):
   ```
   http://localhost:5173/**
   http://localhost:5173/auth/callback
   ```

   For production, also add:
   ```
   https://your-production-domain.com/**
   https://your-production-domain.com/auth/callback
   ```

4. **Rate Limiting (Optional)**
   - In the "Rate Limits" section, you can adjust rate limits for auth endpoints
   - Default settings are usually fine for most applications

## Step 4: Configure Auth Settings

1. **Navigate to General Settings**
   - Click "Authentication" in the left sidebar
   - Click "Settings" tab

2. **Important Settings**

   - **JWT Expiry**: Default is 3600 seconds (1 hour) - adjust as needed
   - **Refresh Token Rotation**: Enable this for better security
   - **Minimum Password Length**: Default is 6 - consider 8 or more for production
   - **Password Strength**: Can require uppercase, lowercase, numbers, special chars

3. **Auto Confirm Users (Local Development Only)**

   For easier local development, you can disable email confirmation:
   - **Scroll to "Email Auth"** section
   - **Enable Email Confirmations**: Toggle OFF for local dev

   > ⚠️ **Warning**: Always re-enable this before deploying to production!

## Step 5: Test Authentication Setup

You can test that auth is working by creating a test user in the Supabase Dashboard:

1. **Navigate to Authentication Users**
   - Click "Authentication" in the left sidebar
   - Click "Users" tab

2. **Add User**
   - Click "Add user" button
   - Choose "Create new user"
   - Enter email and password
   - Click "Create user"

3. **Verify User Was Created**
   - You should see the user in the users table
   - Note the User UID - you'll use this for testing

## Step 6: Verify Environment Variables

Make sure your `app/.env` file has the correct Supabase credentials:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Application Configuration
VITE_APP_URL=http://localhost:5173
```

You can find these values in:
- Supabase Dashboard → Settings → API
- **URL**: Project URL
- **anon/public key**: `anon` key under "Project API keys"

## Common Issues & Troubleshooting

### Email Not Sending

**Problem**: Confirmation emails aren't being sent

**Solutions**:
1. Check that "Enable Email Confirmations" is ON in Auth Settings
2. Verify your email templates are configured
3. Check your spam folder
4. For local dev, disable email confirmations temporarily

### Invalid Redirect URL

**Problem**: "Invalid redirect url" error

**Solutions**:
1. Make sure your Site URL is correct in URL Configuration
2. Add your redirect URL to the allowed list (with `/**` wildcard)
3. Check that you're using the exact URL (including http/https)

### CORS Errors

**Problem**: CORS errors when trying to authenticate

**Solutions**:
1. Verify your Site URL matches your actual application URL
2. Check that your `VITE_APP_URL` environment variable is correct
3. Make sure you're using the anon key, not the service role key

## Next Steps

Once Supabase Auth is enabled and configured, you can proceed with:

1. **Issue #7**: Create auth database schema (user_profiles table, RLS policies)
2. **Issue #10**: Create auth store and composables for state management
3. **Issue #8**: Build the Login view UI
4. **Issue #11**: Add auth button to header with user menu

## Production Checklist

Before deploying to production, verify:

- [ ] Email confirmations are ENABLED
- [ ] Strong password requirements are set (min 8 chars, complexity rules)
- [ ] Refresh token rotation is ENABLED
- [ ] Production URLs are added to redirect allowlist
- [ ] Site URL is set to production domain
- [ ] Email templates are customized with your branding
- [ ] Rate limits are configured appropriately
- [ ] Test user accounts are removed

## Reference Links

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase Auth with Vue](https://supabase.com/docs/guides/auth/quickstarts/vue)
- [Email Templates Documentation](https://supabase.com/docs/guides/auth/auth-email-templates)

---

**Setup completed?** Move on to Issue #7 to create the auth database schema!

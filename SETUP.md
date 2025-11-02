# Quick Setup Guide

## Step 1: Set Up Supabase Database

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `supabase-schema.sql` into the editor
4. Click "Run" to create the database tables

## Step 2: Configure Environment Variables

1. Copy the environment template:
   ```bash
   cp app/.env.example app/.env
   ```

2. Fill in your credentials in `app/.env`:
   ```env
   # Get these from Supabase Dashboard > Settings > API
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key

   # Get these from Cloudinary Dashboard
   VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
   VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-preset

   # Local development
   VITE_APP_URL=http://localhost:5173
   ```

### Cloudinary Setup:
1. Sign up at https://cloudinary.com (free tier works fine)
2. Go to Settings > Upload
3. Scroll to "Upload presets"
4. Click "Add upload preset"
5. Set signing mode to "Unsigned"
6. Enable the preset
7. Copy the preset name to your `.env`

## Step 3: Install Dependencies

```bash
pnpm install
```

## Step 4: Run Development Server

```bash
pnpm dev
```

The app will be available at http://localhost:5173

## Step 5: Upload Your First Trip

1. Navigate to http://localhost:5173/admin
2. Fill in trip details:
   - **Title**: e.g., "Summer Vacation 2024"
   - **Description**: Optional description of your trip
3. Select multiple photos from your trip
4. Click "Start Upload"
5. Wait for upload to complete
6. Click "View Trip" to see your photos on the map!

## How It Works

### Upload Flow:
1. Select photos → Extracts GPS & timestamp from EXIF data
2. Uploads to Cloudinary → Gets image URLs
3. Saves to Supabase → Creates trip and photo records
4. Generates unique URL → Share your trip!

### Map View:
- Photos with GPS data appear as markers on the map
- Click markers to see photos
- Photos are connected chronologically with a route line
- Click any photo to view in full-screen lightbox
- Photos without GPS data still appear in the photo grid

## Deployment to Netlify

1. Push your code to GitHub
2. Connect repository to Netlify
3. Set environment variables in Netlify dashboard (same as `.env`)
4. Deploy!

Netlify will automatically:
- Build your app on each push to main
- Serve from CDN
- Handle redirects for Vue Router

---

**You're all set!** Start uploading vacation photos and sharing your trips.

# Vacay Photo Map

An interactive web application for viewing vacation photos on a map with timeline visualization. Share trips via password-protected links with WebAuthn-secured admin upload capabilities.

## Features

- **Interactive Map View**: View photos plotted on an interactive Leaflet map
- **Timeline Visualization**: Chronological photo timeline with playback mode
- **EXIF Extraction**: Automatic GPS and timestamp extraction from photos
- **Trip Protection**: Share trips with token-protected links
- **User Authentication**: Secure email/password authentication via Supabase Auth
- **Cloud Storage**: Images hosted on Cloudinary CDN
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Dark Mode**: Full dark mode support with smooth transitions

## Tech Stack

- **Frontend**: Vue 3 (Composition API), TypeScript, Vite
- **UI Components**: shadcn-vue (New York style)
- **Styling**: TailwindCSS with CSS variables
- **State Management**: Pinia
- **Map**: Leaflet + vue3-leaflet
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Storage**: Cloudinary
- **Hosting**: Netlify
- **Authentication**: Supabase Auth (Email/Password)

## Project Structure

```
vacay-photo-map/
├── app/                          # Vue application
│   ├── src/
│   │   ├── components/          # Vue components
│   │   ├── views/               # Page views
│   │   ├── stores/              # Pinia stores
│   │   ├── composables/         # Composition API composables
│   │   ├── utils/               # Utility functions
│   │   ├── router/              # Vue Router configuration
│   │   ├── lib/                 # External service clients
│   │   └── assets/              # Static assets & styles
│   ├── public/                  # Public static files
│   └── package.json
├── netlify/
│   └── functions/               # Netlify serverless functions
├── .github/
│   └── workflows/               # GitHub Actions
└── package.json                 # Root package.json
```

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0 (Install with `npm install -g pnpm` or use Corepack)
- A Supabase account and project
- A Cloudinary account
- A Netlify account (for deployment)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/vacay-photo-map.git
cd vacay-photo-map
```

### 2. Install Dependencies

```bash
pnpm install
```

This will install dependencies for both the root workspace and the app.

### 3. Set Up Environment Variables

Copy the example environment file:

```bash
cp app/.env.example app/.env
```

Edit `app/.env` and fill in your credentials:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Cloudinary Configuration
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-preset

# Application Configuration
VITE_APP_URL=http://localhost:5173

# WebAuthn Configuration
VITE_WEBAUTHN_RP_NAME="Vacay Photo Map"
VITE_WEBAUTHN_RP_ID=localhost
```

### 4. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key to `.env`
3. Run the database migrations:
   - In Supabase Dashboard → SQL Editor
   - Run the contents of `supabase-schema.sql`
4. **Configure Authentication** (required for Milestone 2):
   - Follow the detailed guide: [docs/SUPABASE_AUTH_SETUP.md](./docs/SUPABASE_AUTH_SETUP.md)
   - Enable email provider, configure templates, set redirect URLs

### 5. Set Up Cloudinary

1. Create a free account at [cloudinary.com](https://cloudinary.com)
2. In your Cloudinary dashboard:
   - Go to Settings > Upload
   - Create an unsigned upload preset
   - Enable the preset and note its name
3. Copy your cloud name and preset to `.env`

### 6. Run the Development Server

```bash
pnpm dev
```

The app will be available at `http://localhost:5173`

## Available Scripts

From the root directory:

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm lint` - Lint code with ESLint
- `pnpm format` - Format code with Prettier
- `pnpm type-check` - Run TypeScript type checking
- `pnpm test` - Run tests with Vitest

## Development Workflow

This project follows the milestone-based development plan outlined in `SPEC.md`:

1. **Milestone 1**: Project Setup & Infrastructure ✅
2. **Milestone 2**: Database Schema & Authentication
3. **Milestone 3**: Photo Upload System
4. **Milestone 4**: Map View & Photo Display
5. **Milestone 5**: Timeline Feature
6. **Milestone 6**: Polish & Deployment

See [SPEC.md](./SPEC.md) for detailed requirements and acceptance criteria.

## Deployment

### Netlify Deployment

1. Install Netlify CLI (optional):
   ```bash
   npm install -g netlify-cli
   ```

2. Connect your repository to Netlify:
   - Push your code to GitHub
   - Connect the repository in Netlify dashboard
   - Netlify will automatically detect `netlify.toml` configuration

3. Set environment variables in Netlify dashboard:
   - Go to Site settings > Environment variables
   - Add all variables from `.env.example`

4. Deploy:
   - Pushes to `main` branch will automatically deploy via GitHub Actions
   - Or manually: `netlify deploy --prod`

### Environment Variables for Production

Make sure to set these in your Netlify dashboard:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CLOUDINARY_CLOUD_NAME`
- `VITE_CLOUDINARY_UPLOAD_PRESET`
- `VITE_APP_URL` (your production URL)
- `VITE_WEBAUTHN_RP_NAME`
- `VITE_WEBAUTHN_RP_ID` (your domain without protocol)

## Database Schema

Current schema (see `supabase-schema.sql` and `supabase/migrations/`):

- `trips` - Trip metadata with optional access token protection
- `photos` - Photo data with GPS coordinates and EXIF metadata

Upcoming (Milestone 2+):

- `user_profiles` - Extended user profile data
- `photo_comments` - Comments on photos
- `invites` - Admin invite system

## Security

- **Supabase Auth**: User authentication via Supabase Auth with email/password
- **Token Hashing**: Trip access tokens are bcrypt-hashed before storage
- **RLS Policies**: Row-level security in Supabase prevents unauthorized data access
- **Edge Functions**: Backend validation logic runs in Supabase Edge Functions
- **Environment Variables**: Sensitive credentials stored in environment variables
- **HTTPS**: All production traffic encrypted via Netlify

## Testing

Run tests with:

```bash
npm test
```

Tests will be added throughout development for:
- Utility functions (EXIF extraction, slugification, etc.)
- Upload flow
- Authentication
- Critical user paths

## Contributing

This is a personal project, but suggestions and bug reports are welcome via GitHub issues.

## License

MIT

## Support

For issues and questions, please open a GitHub issue.

---

Built with Vue 3, Supabase, and Cloudinary

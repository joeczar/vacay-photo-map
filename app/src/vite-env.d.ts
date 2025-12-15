/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_CLOUDINARY_CLOUD_NAME: string
  readonly VITE_CLOUDINARY_UPLOAD_PRESET: string
  readonly VITE_APP_URL: string
  readonly VITE_WEBAUTHN_RP_NAME: string
  readonly VITE_WEBAUTHN_RP_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Common response types for API tests
// Import these instead of duplicating interfaces in every test file

import type {
  TripResponse,
  TripWithPhotosResponse,
  PhotoResponse,
  SectionResponse,
} from "./routes/trips";

// Re-export route types
export type {
  TripResponse,
  TripWithPhotosResponse,
  PhotoResponse,
  SectionResponse,
};

// Error responses
export interface ErrorResponse {
  error: string;
  message: string;
}

// List responses
export interface TripListResponse {
  trips: TripResponse[];
}

export interface PhotoListResponse {
  photos: PhotoResponse[];
}

// Success responses
export interface SuccessResponse {
  success: boolean;
  message?: string;
}

// Auth responses (based on auth.ts routes)
export interface AuthResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    isAdmin: boolean;
  };
  token: string;
}

export interface UserProfileResponse {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Passkey responses (based on auth.ts)
export interface PasskeyListResponse {
  passkeys: Array<{
    id: string;
    createdAt: Date;
    lastUsedAt: Date | null;
  }>;
}

// Registration status response (based on auth.ts)
export interface RegistrationStatusResponse {
  registrationOpen: boolean;
  reason: string;
  email?: string;
}

// Invite responses (based on invites.ts)
export interface InviteResponse {
  id: string;
  code: string;
  email: string | null;
  role: "editor" | "viewer";
  expiresAt: Date;
  usedAt: Date | null;
  usedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InviteListItem extends InviteResponse {
  tripCount: number;
  status: "pending" | "used" | "expired";
}

export interface InviteListResponse {
  invites: InviteListItem[];
}

export interface CreateInviteResponse {
  invite: InviteResponse;
  tripIds: string[];
}

export interface ValidateInviteResponse {
  valid: boolean;
  message?: string;
  invite?: {
    email: string | null;
    role: "editor" | "viewer";
    expiresAt: Date;
  };
  trips?: Array<{
    id: string;
    slug: string;
    title: string;
  }>;
}

// Recovery responses (based on auth.ts recovery endpoints)
export interface RecoveryRequestResponse {
  success: boolean;
  message: string;
}

export interface RecoveryVerifyResponse {
  success: boolean;
  message: string;
  redirectTo?: string;
}

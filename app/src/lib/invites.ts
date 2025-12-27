import { api } from './api'
import { useAuth } from '@/composables/useAuth'

export type Role = 'editor' | 'viewer'

export type InviteStatus = 'pending' | 'used' | 'expired'

export interface InviteListItem {
  id: string
  code: string
  email: string | null
  role: Role
  expiresAt: string // ISO date
  usedAt: string | null // ISO date
  usedByUserId: string | null
  createdAt: string // ISO date
  updatedAt: string // ISO date
  tripCount: number
  status: InviteStatus
}

export interface CreateInviteRequest {
  email: string
  role: Role
  tripIds: string[]
}

export interface CreateInviteResponse {
  invite: {
    id: string
    code: string
    email: string
    role: Role
    expiresAt: string
    usedAt: string | null
    createdAt: string
  }
  tripIds: string[]
}

/**
 * Helper to get auth token and set on API client
 * Throws if not authenticated
 */
function requireAuth(): void {
  const { getToken } = useAuth()
  const token = getToken()
  if (!token) throw new Error('Authentication required')
  api.setToken(token)
}

/**
 * Create a new invite with trip assignments
 */
export async function createInvite(
  email: string,
  role: Role,
  tripIds: string[]
): Promise<CreateInviteResponse> {
  requireAuth()

  // Normalize email to match backend behavior
  const normalizedEmail = email.toLowerCase().trim()

  return await api.post<CreateInviteResponse>('/api/invites', {
    email: normalizedEmail,
    role,
    tripIds
  })
}

/**
 * Get all invites (admin only)
 * Returns invites with computed status
 */
export async function getAllInvites(): Promise<InviteListItem[]> {
  requireAuth()

  const response = await api.get<{ invites: InviteListItem[] }>('/api/invites')
  return response.invites
}

/**
 * Revoke a pending invite
 * Marks it as used to prevent acceptance while maintaining audit trail
 */
export async function revokeInvite(id: string): Promise<void> {
  requireAuth()

  await api.delete(`/api/invites/${id}`)
}

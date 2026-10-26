import { api, requireAuth } from './api'
import { useAuth } from '@/composables/useAuth'
import type { ApiSectionResponse } from '@/utils/database'

export type Section = ApiSectionResponse

/**
 * List sections for a trip, ordered by orderIndex (admin-only)
 */
export async function getSections(tripId: string): Promise<Section[]> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  const { sections } = await api.get<{ sections: Section[] }>(`/api/trips/${tripId}/sections`)
  return sections
}

/**
 * Create a section at the given position (orderIndex is unique per trip)
 */
export async function createSection(
  tripId: string,
  title: string,
  orderIndex: number
): Promise<Section> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  return api.post<Section>(`/api/trips/${tripId}/sections`, { title, orderIndex })
}

/**
 * Update a section's title and/or orderIndex
 */
export async function updateSection(
  sectionId: string,
  updates: { title?: string; orderIndex?: number }
): Promise<Section> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  return api.patch<Section>(`/api/sections/${sectionId}`, updates)
}

/**
 * Delete a section. Photos in it are kept (section_id set to null).
 */
export async function deleteSection(sectionId: string): Promise<void> {
  const { getToken } = useAuth()
  requireAuth(getToken)

  await api.delete(`/api/sections/${sectionId}`)
}

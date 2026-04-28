import { api } from './client'
import type { AdminUser, UserDevice } from './types'

export async function listUsers(): Promise<AdminUser[]> {
  const { data } = await api.get<{ users: AdminUser[] }>('/admin/users')
  return data.users ?? []
}

export async function getUserDevices(userId: number): Promise<UserDevice[]> {
  const { data } = await api.get<UserDevice[]>('/provisions', { params: { user_id: userId } })
  return Array.isArray(data) ? data : []
}

export async function adminUnclaimDevice(userId: number, deviceId: number): Promise<void> {
  await api.delete(`/admin/users/${userId}/devices/${deviceId}`)
}

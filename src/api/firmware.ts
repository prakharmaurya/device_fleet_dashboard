import { api } from './client'
import type { FirmwareRelease } from './types'

export async function listReleases(deviceType = 'tank'): Promise<FirmwareRelease[]> {
  const { data } = await api.get<{ releases: FirmwareRelease[] }>('/firmware/releases', {
    params: { device_type: deviceType },
  })
  return data.releases ?? []
}

export async function createRelease(payload: {
  device_type: string
  version: string
  url: string
  release_notes: string
}): Promise<FirmwareRelease> {
  const { data } = await api.post<FirmwareRelease>('/firmware/releases', payload)
  return data
}

export async function getUploadUrl(filename: string): Promise<{ presigned_url: string; public_url: string; version: string }> {
  const { data } = await api.post('/firmware/upload-url', { filename })
  return data
}

export async function updateRelease(id: number, payload: {
  version: string
  url: string
  release_notes: string
}): Promise<FirmwareRelease> {
  const { data } = await api.put<FirmwareRelease>(`/firmware/releases/${id}`, payload)
  return data
}

export async function deleteRelease(id: number): Promise<void> {
  await api.delete(`/firmware/releases/${id}`)
}

export async function pushOTA(deviceId: number, url: string): Promise<void> {
  await api.post('/firmware/push', { device_id: deviceId, url })
}

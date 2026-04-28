import { api } from './client'
import type { AdminDeviceDetail, Device, DeviceEvent, Telemetry } from './types'

export async function listDevices(): Promise<Device[]> {
  const { data } = await api.get<Device[]>('/devices')
  return data
}

export async function getAdminDevice(id: number): Promise<AdminDeviceDetail> {
  const { data } = await api.get<AdminDeviceDetail>(`/admin/devices/${id}`)
  return data
}

export async function getAdminDeviceHistory(id: number, hours = 24): Promise<Telemetry[]> {
  const { data } = await api.get<{ rows: Telemetry[] }>(`/admin/devices/${id}/history`, {
    params: { hours },
  })
  return data.rows ?? []
}

export async function getAdminDeviceEvents(id: number, limit = 100): Promise<DeviceEvent[]> {
  const { data } = await api.get<{ events: DeviceEvent[] }>(`/admin/devices/${id}/events`, {
    params: { limit },
  })
  return data.events ?? []
}

export async function sendCommand(deviceId: number, command: string): Promise<unknown> {
  const { data } = await api.post('/request/command', { device_id: deviceId, command })
  return data
}

export async function revokeMqttCache(serialId: string): Promise<void> {
  await api.delete(`/devices/${serialId}/mqtt-cache`)
}

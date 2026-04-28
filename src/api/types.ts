// pgx v5 serializes nullable types as plain string | null (not {String,Valid} objects)

export interface LoginResponse {
  id: number
  token: string
  name: string
  email: string
  role: string
  provider: string
  profile_photo_url: string
  token_expires_at: string
}

export interface Device {
  id: number
  serial_id: string
  model_name: string
  device_type: string
  is_online: boolean
  current_fw: string | null
  last_seen_at: string | null
  fw?: string
  mac?: string | null
  claimed_at?: string | null
  manufactured_at?: string | null
}

export interface Telemetry {
  id: number
  serial_id: string
  ts: string | null
  pump_state: number       // 0=OFF 1=TRANSITION 2=ON 3=FORCE_ON
  pump_runtime: number     // seconds
  tank_level: number       // %
  voltage: number
  current: number
  active_power: number
  frequency: number
  wifi_rssi: number
  fw_version: string
}

export interface AdminDeviceDetail extends Device {
  telemetry?: Telemetry
}

export interface DeviceEvent {
  id: number
  serial_id: string
  event_type: string
  data: unknown
  ts: string | null
}

export interface FirmwareRelease {
  id: number
  device_type: string
  version: string
  url: string
  release_notes: string
  created_at: string | null
}

export interface AdminUser {
  id: number
  name: string
  email: string
  role: string
  provider: string
  profile_photo_url: string | null
  created_at: string | null
  is_active: boolean
  device_count: number
}

export interface UserDevice {
  device_id: number
  serial_id: string
  device_type: string
  device_firmware: string
  device_manufactured_at: string | null
  device_mac: string | null
  user_id: number
  building: string | null
  room: string | null
  device_role: string
}

export const PUMP_STATE_LABEL: Record<number, string> = {
  0: 'OFF',
  1: 'TRANSITION',
  2: 'ON',
  3: 'FORCE ON',
}

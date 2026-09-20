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

// Per-component firmware health snapshot. Each field is "ok" or a
// component-specific fault string ("fault" / "degraded"). null until the
// device has sent its first telemetry since the hw_status rollout.
export interface HwStatus {
  lora: string
  power_meter: string
  lcd: string
  nvs: string
}

export function hwStatusHasFault(hw: HwStatus | null | undefined): boolean {
  if (!hw) return false
  return hw.lora !== 'ok' || hw.power_meter !== 'ok' || hw.lcd !== 'ok' || hw.nvs !== 'ok'
}

export interface Device {
  id: number
  serial_id: string
  model_name: string
  device_type: string
  is_online: boolean
  current_fw: string | null
  last_seen_at: string | null
  hw_status?: HwStatus | null
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
  hw_status?: HwStatus | null
  reset_reason: string
  free_heap: number
  min_free_heap: number
  lora_reset_count: number
}

export interface AdminDeviceDetail extends Device {
  telemetry?: Telemetry
}

export interface FaultEventData {
  code: string
  name: string
  lcd_line1: string
  lcd_line2: string
  buzzer: string
  description: string
  action_taken: string
  readings?: {
    voltage?: number
    current?: number
    active_power?: number
    frequency?: number
    tank_level?: number
    runtime_s?: number
  }
}

export interface FaultClearedEventData {
  cleared_fault: string
  voltage?: number
  current?: number
  tank_level?: number
  pump_state?: number
}

export interface CommandEventData {
  command: string
  sender_user_id?: number
  sender_email?: string
  sender_role?: string
  status: string
  execution_ms?: number
  response?: unknown
}

export interface ConfigChangeEventData {
  config_name: string
  value: number
  sender_user_id?: number
  sender_email?: string
  sender_role?: string
  status: string
  execution_ms?: number
  response?: unknown
}

export interface PumpStateEventData {
  from_state: number
  to_state: number
  state_label: string
  runtime_s: number
  trigger_source: string
  stop_reason?: string
  voltage?: number
  current?: number
  active_power?: number
  tank_level?: number
}

export interface PowerEventData {
  reset_reason: string
  explanation: string
  fw_version?: string
  ip_address?: string
  network_ssid?: string
  uptime_s?: number
  free_heap?: number
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

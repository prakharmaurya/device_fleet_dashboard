import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, RefreshCw, Zap, Terminal, Trash2,
  CheckCircle2, Play, Square, Settings, Wifi, ShieldAlert,
  Monitor, Volume2, Search, Power, Clock, Radio, AlertTriangle,
  Sliders, Save, Check, AlertCircle, Gauge, Waves
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  getAdminDevice, getAdminDeviceHistory, getAdminDeviceEvents,
  sendCommand, revokeMqttCache, getDeviceConfig, sendDeviceConfig,
} from '../api/devices'
import { listReleases, pushOTA } from '../api/firmware'
import { pgStr, pgTime } from '../api/client'
import {
  PUMP_STATE_LABEL, type SensorTelemetry, type FaultEventData,
  type FaultClearedEventData, type CommandEventData,
  type ConfigChangeEventData, type PumpStateEventData,
  type PowerEventData, type AdminDeviceDetail
} from '../api/types'
import StatusBadge from '../components/StatusBadge'
import Layout from '../components/Layout'
import ErrorBoundary from '../components/ErrorBoundary'

type Tab = 'overview' | 'history' | 'events' | 'controls' | 'settings'

const HISTORY_PRESETS = [
  { hours: 6, label: '6h' },
  { hours: 24, label: '24h' },
  { hours: 72, label: '3d' },
  { hours: 168, label: '7d' },
  { hours: 336, label: '14d' },
  { hours: 720, label: '30d' },
] as const

function formatHistoryTime(ts: string | null | undefined, hoursSpan: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  if (hoursSpan <= 24) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function parseEventData(raw: unknown): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === 'object' && raw !== null) return raw as Record<string, any>
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return {}
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === 'object' && parsed !== null) return parsed
      return { raw: parsed }
    } catch {
      try {
        const decoded = atob(trimmed)
        const parsed = JSON.parse(decoded)
        if (typeof parsed === 'object' && parsed !== null) return parsed
        return { raw: parsed }
      } catch {
        return { raw: trimmed }
      }
    }
  }
  return { raw }
}

const COMMANDS = ['on', 'off', 'f_on', 'status', 'reboot'] as const

function SensorDiagnosticsBox({ title, st }: { title: string; st: SensorTelemetry | null | undefined }) {
  const rawAngle = typeof st?.raw_angle === 'number' ? st.raw_angle : 0
  const agc = typeof st?.agc === 'number' ? st.agc : 0
  const lossPct = typeof st?.packet_loss_rate_pct === 'number' ? st.packet_loss_rate_pct : 0
  const rfSig = typeof st?.rf_signal_pct === 'number' ? st.rf_signal_pct : 0
  const rfSnr = typeof st?.rf_snr_db === 'number' ? st.rf_snr_db : 0
  const as5600 = typeof st?.as5600_status === 'number' ? st.as5600_status : 0

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Radio className="text-cyan-400" size={18} />
          <h3 className="text-xs font-medium text-slate-300 uppercase tracking-wide">
            {title}
          </h3>
          {st && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase bg-cyan-900/60 text-cyan-300 border border-cyan-700/60">
              v{st.protocol_version || 2} Sensor Protocol
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {st ? (
            <>
              <span className={`text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1.5 ${
                st.online ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50' : 'bg-slate-700 text-slate-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.online ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                {st.online ? 'RF Active' : 'RF Offline'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                st.magnet_status === 'OK'
                  ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50'
                  : st.magnet_status === 'MISSING'
                  ? 'bg-red-900/60 text-red-200 border border-red-700/60 font-bold'
                  : 'bg-amber-900/50 text-amber-300 border border-amber-700/50'
              }`}>
                Magnet: {String(st.magnet_status ?? 'OFFLINE')}
              </span>
            </>
          ) : (
            <span className="text-xs text-slate-500">No sensor data received</span>
          )}
        </div>
      </div>

      {st ? (
        <>
          {st.sensor_fault && (
            <div className="mb-4 p-3 bg-red-950/70 border border-red-600 rounded-lg flex items-center gap-3 text-red-200 text-xs">
              <AlertTriangle className="text-red-400 shrink-0" size={18} />
              <div>
                <strong className="font-semibold text-white">AS5600 Angle Sensor Communication Fault!</strong>{' '}
                Sensor cannot read magnetic encoder (detached or I2C bus error). Pump automation is safely gated.
              </div>
            </div>
          )}
          {st.magnet_degraded && !st.sensor_fault && (
            <div className="mb-4 p-3 bg-amber-950/60 border border-amber-600 rounded-lg flex items-center gap-3 text-amber-200 text-xs">
              <AlertTriangle className="text-amber-400 shrink-0" size={18} />
              <div>
                <strong className="font-semibold text-white">Magnet Alignment Degraded ({String(st.magnet_status)}):</strong>{' '}
                Magnetic field strength is outside ideal range. Check mechanical sensor clearance on top of water tank.
              </div>
            </div>
          )}
          {!st.calibrated && (
            <div className="mb-4 p-2.5 bg-yellow-950/40 border border-yellow-700/60 rounded-lg flex items-center gap-2 text-yellow-300 text-xs">
              <AlertTriangle className="text-yellow-400 shrink-0" size={16} />
              <span>Uncalibrated sensor: Full/Empty angles not calibrated in EEPROM. Fallback percent used.</span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-900/80 rounded-lg border border-slate-700/70 p-3">
              <p className="text-xs text-slate-400 mb-1">12-bit Angle</p>
              <p className="text-lg font-semibold font-mono text-cyan-300">{rawAngle} <span className="text-xs text-slate-400 font-sans">/ 4095</span></p>
              <p className="text-[11px] text-slate-400 mt-1">{((rawAngle / 4095) * 360).toFixed(1)}° rotation</p>
            </div>
            <div className="bg-slate-900/80 rounded-lg border border-slate-700/70 p-3">
              <p className="text-xs text-slate-400 mb-1">AGC & Field Gain</p>
              <p className="text-lg font-semibold font-mono text-white">{agc} <span className="text-xs text-slate-400 font-sans">/ 255</span></p>
              <p className="text-[11px] text-slate-400 mt-1">
                {agc < 50 ? 'Strong field' : agc > 200 ? 'Weak field' : 'Nominal gain'}
              </p>
            </div>
            <div className="bg-slate-900/80 rounded-lg border border-slate-700/70 p-3">
              <p className="text-xs text-slate-400 mb-1">Packet Loss Rate</p>
              <p className={`text-lg font-semibold font-mono ${
                lossPct > 20 ? 'text-red-400' : lossPct > 5 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {lossPct.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-400 mt-1">{st.packet_loss_count ?? 0} dropped · Seq #{st.packet_seq ?? 0}</p>
            </div>
            <div className="bg-slate-900/80 rounded-lg border border-slate-700/70 p-3">
              <p className="text-xs text-slate-400 mb-1">LoRa RF Link</p>
              <p className={`text-lg font-semibold font-mono ${
                rfSig >= 50 ? 'text-emerald-400' : rfSig >= 25 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {rfSig}%
              </p>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">{st.rf_rssi_dbm ?? 0} dBm · SNR {rfSnr.toFixed(1)} dB</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs pt-1 border-t border-slate-700/60">
            <div>
              <dt className="text-slate-400">Calibration</dt>
              <dd className={`font-medium ${st.calibrated ? 'text-emerald-400' : 'text-yellow-400'}`}>
                {st.calibrated ? 'Calibrated (EEPROM)' : 'Uncalibrated'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">End-Stop Sensor</dt>
              <dd className="font-medium text-slate-200">
                {st.hall_full ? 'HIGH (Tank Full Activated)' : 'LOW (Inactive)'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">AS5600 Status Reg</dt>
              <dd className="font-mono text-slate-200">
                0x{as5600.toString(16).toUpperCase().padStart(2, '0')}
                <span className="text-[10px] text-slate-400 font-sans ml-1">
                  (MD: {as5600 & 0x20 ? '1' : '0'} ML: {as5600 & 0x10 ? '1' : '0'} MH: {as5600 & 0x08 ? '1' : '0'})
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Telemetry Age</dt>
              <dd className="text-slate-200">
                {st.online ? 'Live (< 30s)' : 'Stale (> 30s)'}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-slate-500 text-xs">No sensor telemetry available for this device yet.</p>
      )}
    </div>
  )
}

export default function Device() {
  const { id } = useParams<{ id: string }>()
  const deviceKey = id?.trim() || ''
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [hours, setHours] = useState(24)
  const [otaUrl, setOtaUrl] = useState('')
  const [cmdResult, setCmdResult] = useState<string | null>(null)
  const [eventCategory, setEventCategory] = useState<string>('all')
  const [eventSearch, setEventSearch] = useState<string>('')

  const { data: device, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-device', deviceKey],
    queryFn: () => getAdminDevice(deviceKey),
    enabled: Boolean(deviceKey),
    refetchInterval: 30_000,
  })

  const resolvedDeviceId = device?.id ?? (!isNaN(Number(deviceKey)) ? Number(deviceKey) : 0)

  const { data: history } = useQuery({
    queryKey: ['admin-device-history', resolvedDeviceId, hours],
    queryFn: () => getAdminDeviceHistory(resolvedDeviceId, hours),
    enabled: tab === 'history' && resolvedDeviceId > 0,
  })

  const { data: events } = useQuery({
    queryKey: ['admin-device-events', resolvedDeviceId],
    queryFn: () => getAdminDeviceEvents(resolvedDeviceId),
    enabled: resolvedDeviceId > 0,
    refetchInterval: 15_000,
  })

  const { data: releases } = useQuery({
    queryKey: ['firmware-releases'],
    queryFn: () => listReleases(),
    enabled: tab === 'controls',
  })

  const cmdMutation = useMutation({
    mutationFn: (command: string) => sendCommand(resolvedDeviceId, command),
    onSuccess: (data) => {
      setCmdResult(JSON.stringify(data, null, 2))
      void qc.invalidateQueries({ queryKey: ['admin-device', deviceKey] })
    },
    onError: () => setCmdResult('Command failed'),
  })

  const otaMutation = useMutation({
    mutationFn: (url: string) => pushOTA(resolvedDeviceId, url),
    onSuccess: () => setCmdResult('OTA pushed successfully'),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })
        ?.response?.data?.message ??
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'OTA push failed'
      setCmdResult(`Error: ${msg}`)
    },
  })

  const revokeMutation = useMutation({
    mutationFn: () => revokeMqttCache(device!.serial_id),
    onSuccess: () => setCmdResult('MQTT cache revoked'),
    onError: () => setCmdResult('Revoke failed'),
  })

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/fleet')} className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white font-mono">Loading device…</h1>
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <RefreshCw size={16} className="animate-spin text-blue-400" />
          <span>Fetching device telemetry and status…</span>
        </div>
      </Layout>
    )
  }

  if (isError || !device) {
    return (
      <Layout>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/fleet')} className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white font-mono">Device Not Found</h1>
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-red-900/40 p-6 text-center space-y-3">
          <p className="text-red-400 text-sm">Device #{deviceKey} could not be found or loaded.</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-xs font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </Layout>
    )
  }

  const t = device.telemetry
  const st = (() => {
    const raw = t?.sensor_telemetry || device?.sensor_telemetry
    if (!raw) return null
    if (typeof raw === 'object') return raw as SensorTelemetry
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return null }
    }
    return null
  })()

  const sumpSt = (() => {
    const raw = t?.sump_telemetry || device?.sump_telemetry
    if (!raw) return null
    if (typeof raw === 'object') return raw as SensorTelemetry
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return null }
    }
    return null
  })()

  const caps = (() => {
    const raw = device?.capabilities
    if (!raw) return null
    if (typeof raw === 'object') return raw
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return null }
    }
    return null
  })()

  const parsedHw = (() => {
    const raw = t?.hw_status || device?.hw_status
    if (!raw) return null
    if (typeof raw === 'object') return raw as Record<string, any>
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return null }
    }
    return null
  })()

  const isFaultActive = (() => {
    if (!events || events.length === 0) return false
    const faultIdx = events.findIndex((e) => e.event_type === 'fault')
    if (faultIdx === -1) return false
    const clearIdx = events.findIndex((e) => e.event_type === 'fault_cleared')
    if (clearIdx !== -1 && clearIdx < faultIdx) return false
    const recoveryIdx = events.findIndex((e) => e.event_type === 'online' || e.event_type === 'power_restored' || e.event_type === 'device_reboot')
    if (recoveryIdx !== -1 && recoveryIdx < faultIdx) return false
    return true
  })()

  const activeFault = (() => {
    if (!isFaultActive || !events) return null
    const ev = events.find((e) => e.event_type === 'fault')
    return ev ? (parseEventData(ev.data) as FaultEventData) : null
  })()

  const chartHistory = useMemo(() => {
    if (!history || history.length === 0) return []
    // Backend returns ts DESC (newest first). Reverse for chronological left-to-right display:
    const chronological = [...history].reverse()
    const maxPoints = 600
    const step = Math.ceil(chronological.length / maxPoints)
    const sampled = step > 1 ? chronological.filter((_, idx) => idx % step === 0 || idx === chronological.length - 1) : chronological

    return sampled.map((r) => ({
      t: formatHistoryTime(r.ts, hours),
      pump_state: r.pump_state,
      tank_level: r.tank_level,
      current: r.current,
      active_power: r.active_power,
      voltage: r.voltage,
    }))
  }, [history, hours])

  const hasSump = (typeof t?.sump_level === 'number' && t.sump_level >= 0) ||
    Boolean(sumpSt) ||
    (Array.isArray(caps?.monitored_tanks) && caps.monitored_tanks.includes('sump'))

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'history', label: 'History' },
    { id: 'events', label: 'Events' },
    { id: 'controls', label: 'Controls' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/fleet')} className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-white font-mono">{device.serial_id}</h1>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 font-mono">
              {device.model_id || 'TM-SUB-01'} ({device.hw_rev || 'HW-1.0'})
            </span>
            <StatusBadge online={device.is_online} />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-sm text-slate-400">
              {device.model_name} · {device.device_type} · fw {pgStr(device.current_fw)}
            </p>
            {caps && (
              <div className="flex flex-wrap gap-1.5 ml-2">
                {caps.pump_actuator && (
                  <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                    Actuator: {String(caps.pump_actuator)}
                  </span>
                )}
                {Array.isArray(caps.monitored_tanks) && caps.monitored_tanks.length > 0 && (
                  <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                    Tanks: {caps.monitored_tanks.join(', ')}
                  </span>
                )}
                {caps.has_cyclic_timer && (
                  <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                    Cyclic Timer
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <button onClick={() => refetch()} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-800 p-1 rounded-lg w-fit">
        {TABS.map(({ id: tid, label }) => (
          <button
            key={tid}
            onClick={() => setTab(tid)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === tid ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <ErrorBoundary fallbackTitle="Error loading device overview">
          <div className="space-y-4">
            {/* Active Fault Alert Banner */}
            {activeFault && (
              <div className="bg-red-950/80 border-2 border-red-600 rounded-xl p-4 shadow-lg text-white">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-red-600 text-white font-bold rounded text-xs animate-pulse flex items-center gap-1">
                        <ShieldAlert size={13} /> ACTIVE FAULT: {typeof activeFault.code === 'string' ? activeFault.code : 'ALERT'}
                      </span>
                      <span className="font-semibold text-red-200 text-base">{typeof activeFault.name === 'string' ? activeFault.name : 'Safety Protection Trip'}</span>
                    </div>
                    <p className="text-sm text-red-300">{typeof activeFault.description === 'string' ? activeFault.description : 'Safety protection active.'}</p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-red-300/90 pt-1">
                      {activeFault.buzzer && (
                        <span className="flex items-center gap-1 text-red-400 font-medium">
                          <Volume2 size={13} /> Alarm Pattern: <strong className="text-red-200">{String(activeFault.buzzer)}</strong>
                        </span>
                      )}
                      {activeFault.action_taken && (
                        <span>
                          <strong className="text-red-200">Action Taken:</strong> {String(activeFault.action_taken)}
                        </span>
                      )}
                    </div>
                    {activeFault.readings && typeof activeFault.readings === 'object' && (
                      <div className="flex flex-wrap gap-3 text-xs font-mono bg-black/40 px-3 py-1.5 rounded-md border border-red-800/40 w-fit mt-1">
                        {typeof activeFault.readings.voltage === 'number' && <span>V: {activeFault.readings.voltage.toFixed(1)}V</span>}
                        {typeof activeFault.readings.current === 'number' && <span>I: {activeFault.readings.current.toFixed(2)}A</span>}
                        {typeof activeFault.readings.active_power === 'number' && <span>P: {activeFault.readings.active_power.toFixed(1)}W</span>}
                        {typeof activeFault.readings.tank_level === 'number' && <span>Level: {activeFault.readings.tank_level.toFixed(1)}%</span>}
                      </div>
                    )}
                  </div>
                  <SimulatedLCD line1={typeof activeFault.lcd_line1 === 'string' ? activeFault.lcd_line1 : undefined} line2={typeof activeFault.lcd_line2 === 'string' ? activeFault.lcd_line2 : undefined} />
                </div>
              </div>
            )}

            {/* Telemetry cards */}
            {t ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <TCard label="Pump" value={PUMP_STATE_LABEL[t.pump_state] ?? String(t.pump_state ?? '—')}
                  accent={t.pump_state === 2 || t.pump_state === 3 ? 'green' : 'default'} />
                <TCard label={hasSump ? 'Overhead Tank' : 'Tank Level'} value={typeof t.tank_level === 'number' && t.tank_level >= 0 ? `${t.tank_level.toFixed(1)}%` : 'No data'} />
                {hasSump && (
                  <TCard label="Sump Tank" value={typeof t.sump_level === 'number' && t.sump_level >= 0 ? `${t.sump_level.toFixed(1)}%` : 'No data'} />
                )}
                <TCard label="Voltage" value={typeof t.voltage === 'number' ? `${t.voltage.toFixed(1)} V` : '—'} />
                <TCard label="Current" value={typeof t.current === 'number' ? `${t.current.toFixed(2)} A` : '—'} />
                <TCard label="Power" value={typeof t.active_power === 'number' ? `${t.active_power.toFixed(1)} W` : '—'} />
                <TCard label="Frequency" value={typeof t.frequency === 'number' ? `${t.frequency.toFixed(1)} Hz` : '—'} />
                <TCard label="WiFi RSSI" value={typeof t.wifi_rssi === 'number' ? `${t.wifi_rssi} dBm` : '—'} />
                <TCard label="Runtime" value={typeof t.pump_runtime === 'number' ? `${Math.floor(t.pump_runtime / 60)}m ${t.pump_runtime % 60}s` : '—'} />
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No telemetry yet.</p>
            )}

            {/* Overhead Tank Sensor Telemetry & Diagnostics */}
            <SensorDiagnosticsBox title={hasSump ? 'Overhead Tank Sensor & LoRa Telemetry' : 'Tank Sensor & LoRa Telemetry'} st={st} />

            {/* Sump Tank Sensor Telemetry & Diagnostics */}
            {hasSump && (
              <SensorDiagnosticsBox title="Sump Tank Sensor & LoRa Telemetry" st={sumpSt} />
            )}

            {/* Hardware health */}
            {t && (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Hardware Health</h3>
                {parsedHw ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <HwCard label="LoRa" status={parsedHw.lora} />
                      <HwCard label="Power Meter" status={parsedHw.power_meter} />
                      <HwCard label="LCD" status={parsedHw.lcd} />
                      <HwCard label="NVS" status={parsedHw.nvs} />
                    </div>
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                      <InfoRow label="Last Reset Reason" value={t.reset_reason || '—'} mono />
                      <InfoRow label="LoRa Reset Count" value={String(t.lora_reset_count ?? '0')} />
                      <InfoRow label="Free Heap" value={typeof t.free_heap === 'number' ? `${(t.free_heap / 1024).toFixed(1)} KB` : '—'} />
                      <InfoRow label="Min Free Heap" value={typeof t.min_free_heap === 'number' ? `${(t.min_free_heap / 1024).toFixed(1)} KB` : '—'} />
                    </dl>
                  </>
                ) : (
                  <p className="text-slate-500 text-xs">No hw_status yet — needs firmware with 2026-07-23 telemetry update.</p>
                )}
              </div>
            )}

            {/* Device info */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Device Info</h3>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <InfoRow label="Serial ID" value={device.serial_id} mono />
                <InfoRow label="Model" value={device.model_name} />
                <InfoRow label="Claimed" value={pgTime(device.claimed_at)} />
                <InfoRow label="Manufactured" value={pgTime(device.manufactured_at)} />
                <InfoRow label="MAC" value={pgStr(device.mac)} mono />
                <InfoRow label="Last Seen" value={pgTime(device.last_seen_at)} />
              </dl>
            </div>
          </div>
        </ErrorBoundary>
      )}

      {/* History */}
      {tab === 'history' && (
        <ErrorBoundary fallbackTitle="Error displaying device history charts">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {HISTORY_PRESETS.map(({ hours: h, label }) => (
                  <button
                    key={h}
                    onClick={() => setHours(h)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      hours === h ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {history && history.length > 0 && (
                <span className="text-xs text-slate-400">
                  {history.length.toLocaleString()} records loaded ({hours < 24 ? `${hours}h` : `${hours / 24}d`})
                </span>
              )}
            </div>

            {chartHistory && chartHistory.length > 0 ? (
              <div className="space-y-4">
                <ChartCard
                  title="Pump State (0=OFF 2=ON 3=FORCE)"
                  data={chartHistory}
                  dataKey="pump_state"
                  color="#a78bfa"
                  stepLine
                  yDomain={[0, 3]}
                />
                <ChartCard
                  title="Tank Level (%)"
                  data={chartHistory}
                  dataKey="tank_level"
                  color="#60a5fa"
                />
                <ChartCard
                  title="Current (A)"
                  data={chartHistory}
                  dataKey="current"
                  color="#f472b6"
                />
                <ChartCard
                  title="Power (W)"
                  data={chartHistory}
                  dataKey="active_power"
                  color="#34d399"
                />
                <ChartCard
                  title="Voltage (V)"
                  data={chartHistory}
                  dataKey="voltage"
                  color="#fbbf24"
                />
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No history for this period.</p>
            )}
          </div>
        </ErrorBoundary>
      )}

      {/* Events */}
      {tab === 'events' && (
        <ErrorBoundary fallbackTitle="Error loading device events">
          <div className="space-y-4">
            {/* Category Filter Pills and Search */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5 bg-slate-900/60 p-1.5 rounded-lg border border-slate-700/60">
                {[
                  { id: 'all', label: 'All Events' },
                  { id: 'fault', label: '🚨 Faults' },
                  { id: 'command', label: '⚡ Commands' },
                  { id: 'config', label: '⚙️ Config' },
                  { id: 'pump', label: '🔄 Pump' },
                  { id: 'power', label: '🔌 Power & Boot' },
                  { id: 'network', label: '🌐 Connectivity' },
                ].map(({ id: cid, label }) => (
                  <button
                    key={cid}
                    onClick={() => setEventCategory(cid)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      eventCategory === cid
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  placeholder="Search events, commands, users..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Online/offline timeline chart */}
            {(events ?? []).length > 0 && (() => {
              const sorted = [...(events ?? [])].reverse()
              const rawStepData = sorted
                .filter((ev) => (ev.event_type === 'online' || ev.event_type === 'offline') && ev.ts)
                .map((ev) => {
                  const dt = new Date(ev.ts!)
                  return {
                    t: isNaN(dt.getTime()) ? '—' : dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                    v: ev.event_type === 'online' ? 1 : 0,
                  }
                })
              const step = Math.ceil(rawStepData.length / 200)
              const stepData = step > 1 ? rawStepData.filter((_, idx) => idx % step === 0 || idx === rawStepData.length - 1) : rawStepData
              return stepData.length > 0 ? (
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 min-w-0">
                  <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Online / Offline Timeline</h4>
                  <div className="h-28 w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <LineChart data={stepData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#94a3b8' }} interval="preserveStartEnd" />
                        <YAxis
                          domain={[0, 1]} ticks={[0, 1]}
                          tickFormatter={(v: number) => v === 1 ? 'ON' : 'OFF'}
                          tick={{ fontSize: 10, fill: '#94a3b8' }} width={36}
                        />
                        <Tooltip
                          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                          formatter={(v) => [Number(v) === 1 ? 'Online' : 'Offline', 'Status']}
                        />
                        <Line type="stepAfter" dataKey="v" stroke="#60a5fa" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null
            })()}

            {/* Structured Audit Events Feed */}
            <div className="space-y-3">
              {(() => {
                const filtered = (events ?? []).filter((ev) => {
                  if (eventCategory === 'fault' && ev.event_type !== 'fault' && ev.event_type !== 'fault_cleared' && ev.event_type !== 'sensor_fault' && ev.event_type !== 'sensor_fault_cleared' && ev.event_type !== 'magnet_degraded') return false
                  if (eventCategory === 'command' && ev.event_type !== 'command') return false
                  if (eventCategory === 'config' && ev.event_type !== 'config_change' && ev.event_type !== 'config_sync') return false
                  if (eventCategory === 'pump' && ev.event_type !== 'pump_state') return false
                  if (eventCategory === 'power' && ev.event_type !== 'power_restored' && ev.event_type !== 'device_reboot') return false
                  if (eventCategory === 'network' && ev.event_type !== 'online' && ev.event_type !== 'offline') return false

                  if (eventSearch.trim() !== '') {
                    const q = eventSearch.toLowerCase()
                    const parsedData = parseEventData(ev.data)
                    const str = `${ev.event_type} ${JSON.stringify(parsedData)} ${ev.ts ?? ''}`.toLowerCase()
                    return str.includes(q)
                  }
                  return true
                })

                if (filtered.length === 0) {
                  return (
                    <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center text-slate-500 text-sm">
                      No matching events found.
                    </div>
                  )
                }

                return filtered.map((ev, idx) => (
                  <ErrorBoundary key={ev.id ?? `${ev.event_type}-${ev.ts}-${idx}`} fallbackTitle={`Error rendering event #${ev.id ?? idx}`}>
                    <EventCard ev={ev} />
                  </ErrorBoundary>
                ))
              })()}
            </div>
          </div>
        </ErrorBoundary>
      )}

      {/* Controls */}
      {tab === 'controls' && (
        <ErrorBoundary fallbackTitle="Error loading device controls">
          <div className="space-y-4">
            {/* Commands */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Terminal size={14} /> Send Command
              </h3>
              <div className="flex flex-wrap gap-2">
                {COMMANDS.map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => cmdMutation.mutate(cmd)}
                    disabled={cmdMutation.isPending}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-sm font-mono rounded-md transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>

            {/* OTA Push */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Zap size={14} /> Push OTA
              </h3>
              {releases && releases.length > 0 && (
                <div className="mb-3">
                  <label className="block text-xs text-slate-400 mb-1">Select Release</label>
                  <select
                    onChange={(e) => setOtaUrl(e.target.value)}
                    className="bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-blue-500"
                  >
                    <option value="">— pick a release —</option>
                    {releases.map((r) => (
                      <option key={r.id} value={r.url}>
                        {r.version} — {r.release_notes || 'no notes'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="url"
                  value={otaUrl}
                  onChange={(e) => setOtaUrl(e.target.value)}
                  placeholder="https://fw.iot.inflection.org.in/tank/v0.2.0/..."
                  className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => otaUrl && otaMutation.mutate(otaUrl)}
                  disabled={!otaUrl || otaMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium rounded-md transition-colors"
                >
                  Push
                </button>
              </div>
            </div>

            {/* Danger */}
            <div className="bg-slate-800 rounded-xl border border-red-900/50 p-4">
              <h3 className="text-xs font-medium text-red-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Trash2 size={14} /> Danger Zone
              </h3>
              <button
                onClick={() => revokeMutation.mutate()}
                disabled={revokeMutation.isPending}
                className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 disabled:opacity-50 text-red-400 text-sm rounded-md transition-colors border border-red-800"
              >
                Revoke MQTT Cache
              </button>
            </div>

            {/* Result output */}
            {cmdResult && (
              <div className="bg-slate-950 border border-slate-700 rounded-xl p-4">
                <pre className="text-xs text-green-400 overflow-auto whitespace-pre-wrap">{cmdResult}</pre>
              </div>
            )}
          </div>
        </ErrorBoundary>
      )}

      {/* Settings */}
      {tab === 'settings' && (
        <ErrorBoundary fallbackTitle="Error loading device settings">
          <SettingsTab device={device} deviceId={resolvedDeviceId} />
        </ErrorBoundary>
      )}
    </Layout>
  )
}

function TCard({ label, value, accent = 'default' }: {
  label: string
  value: unknown
  accent?: 'green' | 'default'
}) {
  const displayVal = typeof value === 'string' ? value : String(value ?? '—')
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${accent === 'green' ? 'text-green-400' : 'text-white'}`}>
        {displayVal}
      </p>
    </div>
  )
}

function HwCard({ label, status }: { label: string; status: unknown }) {
  const statusStr = typeof status === 'string' ? status : String(status ?? 'unknown')
  const ok = statusStr.toLowerCase() === 'ok'
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-sm font-semibold flex items-center gap-1.5 ${ok ? 'text-green-400' : 'text-red-400'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`} />
        {statusStr}
      </p>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: unknown; mono?: boolean }) {
  const displayVal = typeof value === 'string' ? value : String(value ?? '—')
  return (
    <>
      <dt className="text-slate-400">{label}</dt>
      <dd className={`text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{displayVal}</dd>
    </>
  )
}

function ChartCard({ title, data, dataKey, color, stepLine = false, yDomain }: {
  title: string
  data: Record<string, unknown>[]
  dataKey: string
  color: string
  stepLine?: boolean
  yDomain?: [number, number]
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 min-w-0">
      <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">{title}</h4>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={yDomain} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              itemStyle={{ color: color }}
            />
            <Line type={stepLine ? 'stepAfter' : 'monotone'} dataKey={dataKey} stroke={color} dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SimulatedLCD({ line1, line2 }: { line1?: unknown; line2?: unknown }) {
  const l1 = typeof line1 === 'string' ? line1 : String(line1 ?? '                ')
  const l2 = typeof line2 === 'string' ? line2 : String(line2 ?? '                ')
  return (
    <div className="bg-emerald-950/90 border-2 border-emerald-600/80 rounded-lg p-2.5 shadow-inner font-mono text-emerald-300 select-none tracking-widest text-xs w-full max-w-[260px]">
      <div className="flex items-center justify-between text-[10px] text-emerald-500/80 border-b border-emerald-800/60 pb-1 mb-1 uppercase font-sans">
        <span className="flex items-center gap-1"><Monitor size={11} /> 16x2 LCD Display</span>
        <span className="text-[9px] bg-emerald-900/80 px-1 py-0.2 rounded text-emerald-300">USER SCREEN</span>
      </div>
      <div className="bg-black/60 rounded p-1.5 border border-emerald-800/40 space-y-0.5">
        <div className="whitespace-pre overflow-hidden text-[11px] leading-tight text-emerald-400">{l1}</div>
        <div className="whitespace-pre overflow-hidden text-[11px] font-bold text-emerald-200 leading-tight">{l2}</div>
      </div>
    </div>
  )
}

function EventCard({ ev }: { ev: any }) {
  if (!ev) return null
  const t = pgTime(ev.ts)
  const d = parseEventData(ev.data)

  switch (ev.event_type) {
    case 'fault': {
      const fault = d as FaultEventData
      const readings = fault.readings && typeof fault.readings === 'object' ? fault.readings : null
      return (
        <div className="bg-slate-800 rounded-xl border border-red-900/50 border-l-4 border-l-red-500 p-4 shadow-sm transition-all hover:border-red-700/60">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 bg-red-600/90 text-white font-bold rounded text-xs flex items-center gap-1">
                  <ShieldAlert size={12} /> FAULT {fault.code || 'ALERT'}
                </span>
                <span className="text-base font-semibold text-red-200">{fault.name || 'Safety Protection Trip'}</span>
                <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto">
                  <Clock size={12} /> {t}
                </span>
              </div>
              <p className="text-sm text-slate-300">{fault.description || 'Safety protection activated.'}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                {fault.buzzer && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <Volume2 size={12} /> {fault.buzzer}
                  </span>
                )}
                {fault.action_taken && (
                  <span>
                    <strong className="text-slate-300">Action:</strong> {fault.action_taken}
                  </span>
                )}
              </div>
              {readings && (
                <div className="flex flex-wrap gap-2 text-xs font-mono bg-slate-900/80 px-2.5 py-1 rounded border border-slate-700/60 w-fit mt-1">
                  {typeof readings.voltage === 'number' && <span className="text-amber-300">{readings.voltage.toFixed(1)}V</span>}
                  {typeof readings.current === 'number' && <span className="text-pink-300">{readings.current.toFixed(2)}A</span>}
                  {typeof readings.active_power === 'number' && <span className="text-emerald-300">{readings.active_power.toFixed(0)}W</span>}
                  {typeof readings.tank_level === 'number' && <span className="text-blue-300">Tank: {readings.tank_level.toFixed(1)}%</span>}
                  {typeof readings.runtime_s === 'number' && <span className="text-purple-300">{readings.runtime_s}s</span>}
                </div>
              )}
            </div>
            {(fault.lcd_line1 || fault.lcd_line2) && (
              <SimulatedLCD line1={fault.lcd_line1} line2={fault.lcd_line2} />
            )}
          </div>
        </div>
      )
    }

    case 'fault_cleared': {
      const clear = d as FaultClearedEventData
      return (
        <div className="bg-slate-800 rounded-xl border border-emerald-900/40 border-l-4 border-l-emerald-500 p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-700 text-white font-semibold rounded text-xs flex items-center gap-1">
                <CheckCircle2 size={12} /> CLEARED
              </span>
              <span className="text-sm font-medium text-emerald-200">
                Fault {clear.cleared_fault || 'Resolved'} cleared — system restored to normal
              </span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
        </div>
      )
    }

    case 'sensor_fault': {
      return (
        <div className="bg-slate-800 rounded-xl border border-red-900/60 border-l-4 border-l-red-500 p-4 shadow-sm transition-all">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 bg-red-600 text-white font-bold rounded text-xs flex items-center gap-1">
                  <AlertTriangle size={12} /> SENSOR FAULT
                </span>
                <span className="text-base font-semibold text-red-200">AS5600 Detached / Comm Error</span>
                <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto">
                  <Clock size={12} /> {t}
                </span>
              </div>
              <p className="text-sm text-slate-300">
                {d.description || 'Tank-top magnetic rotary sensor detached or communication failure. Pump automation safely gated.'}
              </p>
              <div className="flex flex-wrap gap-2 text-xs font-mono bg-slate-900/80 px-2.5 py-1 rounded border border-slate-700/60 w-fit mt-1">
                {d.magnet_status && <span className="text-red-300">Magnet: {d.magnet_status}</span>}
                {typeof d.packet_loss_count === 'number' && <span className="text-amber-300">Drops: {d.packet_loss_count}</span>}
                {typeof d.raw_angle === 'number' && <span className="text-cyan-300">RawAngle: {d.raw_angle}</span>}
                {typeof d.agc === 'number' && <span className="text-purple-300">AGC: {d.agc}</span>}
                {typeof d.protocol_version === 'number' && <span className="text-slate-400">Proto: v{d.protocol_version}</span>}
              </div>
            </div>
          </div>
        </div>
      )
    }

    case 'sensor_fault_cleared': {
      return (
        <div className="bg-slate-800 rounded-xl border border-emerald-900/40 border-l-4 border-l-emerald-500 p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-700 text-white font-semibold rounded text-xs flex items-center gap-1">
                <CheckCircle2 size={12} /> SENSOR RESTORED
              </span>
              <span className="text-sm font-medium text-emerald-200">
                {d.description || 'Tank-top sensor fault cleared — normal telemetry restored'}
              </span>
              {d.magnet_status && (
                <span className="text-xs text-emerald-300 font-mono">({d.magnet_status})</span>
              )}
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
        </div>
      )
    }

    case 'magnet_degraded': {
      return (
        <div className="bg-slate-800 rounded-xl border border-amber-900/50 border-l-4 border-l-amber-500 p-3.5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-amber-600 text-white font-bold rounded text-xs flex items-center gap-1">
                <AlertTriangle size={12} /> MAGNET DEGRADED
              </span>
              <span className="text-sm font-medium text-amber-200">
                {d.description || `Magnet status degraded: ${d.magnet_status || 'UNKNOWN'}`}
              </span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
          {(typeof d.agc === 'number' || typeof d.raw_angle === 'number' || d.magnet_status) && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-mono text-slate-400">
              {typeof d.agc === 'number' && <span>AGC: {d.agc} / 255</span>}
              {typeof d.raw_angle === 'number' && <span>Angle: {d.raw_angle} / 4095</span>}
              {d.magnet_status && <span>Status: {d.magnet_status}</span>}
            </div>
          )}
        </div>
      )
    }

    case 'command': {
      const cmd = d as CommandEventData
      const statusRaw = String(cmd.status ?? 'unknown')
      const isSuccess = statusRaw.toLowerCase() === 'success'
      const cmdName = String(cmd.command ?? 'UNKNOWN').toUpperCase()
      const senderText = cmd.sender_email || (cmd.sender_user_id ? `User #${cmd.sender_user_id}` : 'System')
      return (
        <div className="bg-slate-800 rounded-xl border border-purple-900/40 border-l-4 border-l-purple-500 p-3.5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 bg-purple-700 text-white font-mono font-bold rounded text-xs flex items-center gap-1">
                <Terminal size={12} /> {cmdName}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isSuccess ? 'bg-green-950 text-green-400 border border-green-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>
                {statusRaw.toUpperCase()}
              </span>
              {typeof cmd.execution_ms === 'number' && (
                <span className="text-xs text-slate-400 font-mono">{cmd.execution_ms}ms</span>
              )}
              <span className="text-xs text-slate-400">
                by <strong className="text-slate-200">{senderText}</strong>
                {cmd.sender_role && <span className="text-slate-500 ml-1">({cmd.sender_role})</span>}
              </span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
          {cmd.response !== undefined && cmd.response !== null && (
            <div className="mt-2 text-xs text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-700/60 font-mono overflow-auto max-h-24">
              {typeof cmd.response === 'string' ? cmd.response : JSON.stringify(cmd.response, null, 2)}
            </div>
          )}
        </div>
      )
    }

    case 'config_change': {
      const cfg = d as ConfigChangeEventData
      const statusRaw = String(cfg.status ?? 'unknown')
      const isSuccess = statusRaw.toLowerCase() === 'success'
      const cfgName = String(cfg.config_name ?? 'unknown')
      const senderText = cfg.sender_email || (cfg.sender_user_id ? `User #${cfg.sender_user_id}` : 'System')
      return (
        <div className="bg-slate-800 rounded-xl border border-amber-900/40 border-l-4 border-l-amber-500 p-3.5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 bg-amber-700 text-white font-mono font-bold rounded text-xs flex items-center gap-1">
                <Settings size={12} /> {cfgName}
              </span>
              <span className="text-xs text-amber-200 font-semibold">
                Set to: <span className="font-mono">{cfg.value ?? '—'}</span>
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isSuccess ? 'bg-green-950 text-green-400 border border-green-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>
                {statusRaw.toUpperCase()}
              </span>
              <span className="text-xs text-slate-400">
                by <strong className="text-slate-200">{senderText}</strong>
              </span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
        </div>
      )
    }

    case 'pump_state': {
      const p = d as PumpStateEventData
      const isRunning = p.to_state === 2 || p.to_state === 3
      const stateLabel = p.state_label || (isRunning ? 'PUMP STARTED' : 'PUMP STOPPED')
      const trigger = p.trigger_source || 'unknown'
      return (
        <div className={`bg-slate-800 rounded-xl border p-3.5 shadow-sm ${
          isRunning
            ? 'border-emerald-900/40 border-l-4 border-l-emerald-500'
            : 'border-slate-700 border-l-4 border-l-slate-500'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 text-white font-bold rounded text-xs flex items-center gap-1 ${
                isRunning ? 'bg-emerald-600' : 'bg-slate-600'
              }`}>
                {isRunning ? <Play size={11} /> : <Square size={11} />}
                {stateLabel}
              </span>
              <span className="text-xs text-slate-300">
                Trigger: <strong className="text-white font-mono">{trigger}</strong>
              </span>
              {!isRunning && typeof p.runtime_s === 'number' && (
                <span className="text-xs text-slate-400">
                  Ran for: <strong className="text-slate-200">{Math.floor(p.runtime_s / 60)}m {p.runtime_s % 60}s</strong>
                </span>
              )}
              {p.stop_reason && (
                <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-slate-300 font-medium">
                  Reason: {p.stop_reason}
                </span>
              )}
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
          {(typeof p.voltage === 'number' || typeof p.current === 'number' || typeof p.tank_level === 'number' || typeof p.active_power === 'number') && (
            <div className="flex flex-wrap gap-3 text-xs font-mono text-slate-400 mt-2 bg-slate-900/60 px-2.5 py-1 rounded w-fit">
              {typeof p.voltage === 'number' && <span>{p.voltage.toFixed(1)}V</span>}
              {typeof p.current === 'number' && <span>{p.current.toFixed(2)}A</span>}
              {typeof p.active_power === 'number' && <span>{p.active_power.toFixed(0)}W</span>}
              {typeof p.tank_level === 'number' && <span>Tank: {p.tank_level.toFixed(1)}%</span>}
            </div>
          )}
        </div>
      )
    }

    case 'power_restored':
    case 'device_reboot': {
      const pow = d as PowerEventData
      const isPowerRestored = ev.event_type === 'power_restored'
      return (
        <div className="bg-slate-800 rounded-xl border border-yellow-900/40 border-l-4 border-l-yellow-500 p-3.5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 bg-yellow-600 text-black font-bold rounded text-xs flex items-center gap-1">
                <Power size={11} /> {isPowerRestored ? 'POWER RESTORED' : 'DEVICE REBOOT'}
              </span>
              <span className="text-sm font-semibold text-yellow-200 font-mono">
                {pow.reset_reason || 'RESET'}
              </span>
              {pow.explanation && <span className="text-xs text-slate-300">{pow.explanation}</span>}
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
          {(pow.fw_version || pow.ip_address || pow.network_ssid || typeof pow.free_heap === 'number') && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-400 font-mono mt-1.5">
              {pow.fw_version && <span>FW: {pow.fw_version}</span>}
              {pow.ip_address && <span>IP: {pow.ip_address}</span>}
              {pow.network_ssid && <span>SSID: {pow.network_ssid}</span>}
              {typeof pow.free_heap === 'number' && <span>Heap: {Math.round(pow.free_heap / 1024)}KB</span>}
            </div>
          )}
        </div>
      )
    }

    case 'online':
    case 'offline': {
      const isOnline = ev.event_type === 'online'
      return (
        <div className={`bg-slate-800 rounded-xl border p-3 shadow-sm ${
          isOnline
            ? 'border-green-900/30 border-l-4 border-l-green-500'
            : 'border-red-900/30 border-l-4 border-l-red-500'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-white font-bold rounded text-xs flex items-center gap-1 ${
                isOnline ? 'bg-green-600' : 'bg-red-600'
              }`}>
                <Wifi size={11} /> {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
              <span className="text-xs text-slate-300">
                {isOnline ? 'Device connected to cloud MQTT broker' : 'Device disconnected from network (LWT triggered)'}
              </span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
        </div>
      )
    }

    case 'config_sync': {
      return (
        <div className="bg-slate-800 rounded-xl border border-blue-900/40 border-l-4 border-l-blue-500 p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-600 text-white font-mono font-bold rounded text-xs flex items-center gap-1">
                <Settings size={11} /> CONFIG SYNC
              </span>
              <span className="text-xs text-slate-300">Device synchronized operational configuration with cloud</span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
          {Object.keys(d).length > 0 && (
            <pre className="mt-2 text-xs text-slate-400 font-mono overflow-auto max-h-24 bg-slate-900/80 p-2 rounded border border-slate-700/60">
              {JSON.stringify(d, null, 2)}
            </pre>
          )}
        </div>
      )
    }

    case 'ota_progress': {
      return (
        <div className="bg-slate-800 rounded-xl border border-indigo-900/40 border-l-4 border-l-indigo-500 p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-600 text-white font-mono font-bold rounded text-xs flex items-center gap-1">
                <RefreshCw size={11} /> OTA PROGRESS
              </span>
              <span className="text-xs text-slate-300 font-mono">
                {typeof d === 'string' ? d : JSON.stringify(d)}
              </span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
        </div>
      )
    }

    default: {
      return (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300 font-bold">{ev.event_type}</span>
            <span className="text-xs text-slate-400">{t}</span>
          </div>
          {Object.keys(d).length > 0 && (
            <pre className="mt-1 text-xs text-slate-400 font-mono overflow-auto max-h-24 bg-slate-900 p-2 rounded">
              {JSON.stringify(d, null, 2)}
            </pre>
          )}
        </div>
      )
    }
  }
}

function SettingsTab({ device, deviceId }: { device: AdminDeviceDetail; deviceId: number }) {
  const qc = useQueryClient()
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const {
    data: config,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ['admin-device-config', deviceId],
    queryFn: () => getDeviceConfig(deviceId),
    staleTime: 60_000,
    retry: 1,
    enabled: Boolean(deviceId && deviceId > 0),
  })

  const [form, setForm] = useState<Record<string, number | undefined>>({})

  // Sync form when config loads
  useEffect(() => {
    if (config) {
      setForm({
        auto_mode: config.auto_mode,
        tank_height_cm: config.tank_height_cm,
        tank_low_level_percent: config.tank_low_level_percent,
        pump_auto_off_time: config.pump_auto_off_time != null ? Math.round(config.pump_auto_off_time / 60) : undefined,
        sump_height_cm: config.sump_height_cm,
        sump_low_level_percent: config.sump_low_level_percent,
        sump_recovery_level_percent: config.sump_recovery_level_percent,
        cyclic_run_time_min: config.cyclic_run_time_min,
        cyclic_rest_time_min: config.cyclic_rest_time_min,
        min_voltage: config.min_voltage,
        max_voltage: config.max_voltage,
        min_current: config.min_current,
        max_current: config.max_current,
        max_transient_current: config.max_transient_current,
        transient_blanking_time_s: config.transient_blanking_time_s,
        voltage_calib: config.voltage_calib,
        current_calib: config.current_calib,
        power_calib: config.power_calib,
      })
    }
  }, [config])

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: number }) => {
      setSavingKey(key)
      setErrorMsg(null)
      setSuccessMsg(null)
      return sendDeviceConfig(deviceId, key, value)
    },
    onSuccess: (data, variables) => {
      qc.setQueryData(['admin-device-config', deviceId], data)
      setSuccessMsg(`Successfully saved ${variables.key}`)
      setTimeout(() => setSuccessMsg(null), 4000)
    },
    onError: (err: unknown, variables) => {
      const respErr = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      const msg = respErr?.message || respErr?.error || (err as Error)?.message || 'Failed to update'
      setErrorMsg(`Failed to save ${variables.key}: ${msg}`)
    },
    onSettled: () => {
      setSavingKey(null)
    },
  })

  const handleSave = (key: string, value: number) => {
    // For pump_auto_off_time, the user inputs minutes, firmware expects seconds
    const sendVal = key === 'pump_auto_off_time' ? value * 60 : value
    saveMutation.mutate({ key, value: sendVal })
  }

  const caps = (() => {
    const raw = device?.capabilities
    if (!raw) return null
    if (typeof raw === 'object') return raw
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return null }
    }
    return null
  })()

  const hasPowerMeter = caps?.has_power_meter !== false
  const hasSump = (config?.sump_height_cm !== undefined && config.sump_height_cm > 0) ||
    Boolean(device.sensor_telemetry || device.telemetry?.sump_telemetry) ||
    (Array.isArray(caps?.monitored_tanks) && caps.monitored_tanks.includes('sump'))
  const hasCyclic = Boolean(caps?.has_cyclic_timer) ||
    config?.cyclic_run_time_min !== undefined

  return (
    <div className="space-y-6">
      {/* Top Banner & Refresh Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800 p-4 rounded-xl border border-slate-700">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Sliders size={18} className="text-blue-400" />
            Device Configuration & Tunables
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational thresholds stored in device NVS flash. Changes sync instantly over MQTT.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            {isFetching ? 'Fetching from Device…' : 'Fetch from Device'}
          </button>
        </div>
      </div>

      {!device.is_online && (
        <div className="p-3 bg-amber-950/60 border border-amber-700/60 rounded-xl text-amber-200 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-400 shrink-0" />
          <span>
            <strong>Device Offline:</strong> Device must be connected to MQTT broker to fetch or update operational configuration in real-time.
          </span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-600 rounded-xl text-emerald-200 text-xs flex items-center gap-2 animate-fade-in">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-950/80 border border-red-600 rounded-xl text-red-200 text-xs flex items-center gap-2 animate-fade-in">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-sm">
          <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-400" />
          Querying configuration over MQTT…
        </div>
      ) : error ? (
        <div className="p-6 bg-slate-800 rounded-xl border border-slate-700 text-center">
          <AlertTriangle size={24} className="mx-auto mb-2 text-amber-400" />
          <p className="text-sm text-slate-200 font-medium">Failed to retrieve config from device</p>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            The device may be offline, rebooting, or did not respond within the 15-second timeout.
          </p>
          <button
            onClick={() => void refetch()}
            className="mt-4 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md"
          >
            Retry Fetch
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Automation & Overhead Tank */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-700 pb-3">
              <Waves size={18} className="text-cyan-400" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                Automation & Overhead Tank Settings
              </h3>
            </div>

            {/* Auto Mode Switch */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-900/60 rounded-lg border border-slate-700/60">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">Pump Automation Mode</span>
                  <code className="text-[11px] text-slate-400 font-mono">(auto_mode)</code>
                </div>
                <p className="text-xs text-slate-400">
                  Enable automatic pump start when overhead tank drops below threshold, and auto-stop at full.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSave('auto_mode', form.auto_mode === 1 ? 0 : 1)}
                  disabled={saveMutation.isPending || !device.is_online}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all flex items-center gap-1.5 ${
                    form.auto_mode === 1
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                >
                  {savingKey === 'auto_mode' ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Power size={12} />
                  )}
                  {form.auto_mode === 1 ? 'Auto Enabled' : 'Manual Only'}
                </button>
              </div>
            </div>

            <ConfigRow
              label="Total Overhead Tank Height"
              description="Calibrated distance in cm between top sensor and tank floor."
              configKey="tank_height_cm"
              value={form.tank_height_cm}
              unit="cm"
              min={10}
              max={2000}
              step={1}
              onChange={(v) => setForm((prev) => ({ ...prev, tank_height_cm: v }))}
              onSave={() => handleSave('tank_height_cm', form.tank_height_cm!)}
              isSaving={savingKey === 'tank_height_cm'}
              disabled={!device.is_online}
            />

            <ConfigRow
              label="Tank Low Level Trigger"
              description="Water level percentage below which auto-mode starts the pump."
              configKey="tank_low_level_percent"
              value={form.tank_low_level_percent}
              unit="%"
              min={5}
              max={95}
              step={1}
              onChange={(v) => setForm((prev) => ({ ...prev, tank_low_level_percent: v }))}
              onSave={() => handleSave('tank_low_level_percent', form.tank_low_level_percent!)}
              isSaving={savingKey === 'tank_low_level_percent'}
              disabled={!device.is_online}
            />

            <ConfigRow
              label="Pump Safety Auto-Off Timer"
              description="Maximum allowable continuous pump runtime before safety shutoff (minimum 1 min)."
              configKey="pump_auto_off_time"
              value={form.pump_auto_off_time}
              unit="min"
              min={1}
              max={1000}
              step={1}
              onChange={(v) => setForm((prev) => ({ ...prev, pump_auto_off_time: v }))}
              onSave={() => handleSave('pump_auto_off_time', form.pump_auto_off_time!)}
              isSaving={savingKey === 'pump_auto_off_time'}
              disabled={!device.is_online}
            />
          </div>

          {/* Section 2: Sump Tank Settings */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-emerald-400" />
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Sump Tank Settings
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                {hasSump ? 'Active Sump Sensor' : 'Optional / Standby'}
              </span>
            </div>

            <ConfigRow
              label="Total Sump Depth"
              description="Physical depth of underground sump tank (set 0 to disable sump monitoring)."
              configKey="sump_height_cm"
              value={form.sump_height_cm}
              unit="cm"
              min={0}
              max={2000}
              step={1}
              onChange={(v) => setForm((prev) => ({ ...prev, sump_height_cm: v }))}
              onSave={() => handleSave('sump_height_cm', form.sump_height_cm!)}
              isSaving={savingKey === 'sump_height_cm'}
              disabled={!device.is_online}
            />

            <ConfigRow
              label="Sump Low Cutoff Level"
              description="Sump percentage below which pump immediately trips E9 (Sump Empty)."
              configKey="sump_low_level_percent"
              value={form.sump_low_level_percent}
              unit="%"
              min={0}
              max={90}
              step={1}
              onChange={(v) => setForm((prev) => ({ ...prev, sump_low_level_percent: v }))}
              onSave={() => handleSave('sump_low_level_percent', form.sump_low_level_percent!)}
              isSaving={savingKey === 'sump_low_level_percent'}
              disabled={!device.is_online}
            />

            <ConfigRow
              label="Sump Recovery Threshold"
              description="Water level needed to clear E9 fault and resume pumping (must be ≥ Low + 5%)."
              configKey="sump_recovery_level_percent"
              value={form.sump_recovery_level_percent}
              unit="%"
              min={5}
              max={100}
              step={1}
              onChange={(v) => setForm((prev) => ({ ...prev, sump_recovery_level_percent: v }))}
              onSave={() => handleSave('sump_recovery_level_percent', form.sump_recovery_level_percent!)}
              isSaving={savingKey === 'sump_recovery_level_percent'}
              disabled={!device.is_online}
            />
          </div>

          {/* Section 3: Cyclic / Intermittent Pumping */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-purple-400" />
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Intermittent Pumping (Cyclic Timer)
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                {hasCyclic ? 'Feature Supported' : 'Optional'}
              </span>
            </div>

            <ConfigRow
              label="Max Continuous Run Time"
              description="Maximum minutes pump runs before entering intermittent rest cycle (0 = disabled)."
              configKey="cyclic_run_time_min"
              value={form.cyclic_run_time_min}
              unit="min"
              min={0}
              max={300}
              step={1}
              onChange={(v) => setForm((prev) => ({ ...prev, cyclic_run_time_min: v }))}
              onSave={() => handleSave('cyclic_run_time_min', form.cyclic_run_time_min!)}
              isSaving={savingKey === 'cyclic_run_time_min'}
              disabled={!device.is_online}
            />

            <ConfigRow
              label="Recharging Rest Time"
              description="Duration in minutes pump stays off to let borewell recharge before auto-resuming."
              configKey="cyclic_rest_time_min"
              value={form.cyclic_rest_time_min}
              unit="min"
              min={1}
              max={300}
              step={1}
              onChange={(v) => setForm((prev) => ({ ...prev, cyclic_rest_time_min: v }))}
              onSave={() => handleSave('cyclic_rest_time_min', form.cyclic_rest_time_min!)}
              isSaving={savingKey === 'cyclic_rest_time_min'}
              disabled={!device.is_online}
            />
          </div>

          {/* Section 4: Electrical Safety Limits */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Zap size={18} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Electrical Safety Limits (BL0942)
                </h3>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                hasPowerMeter ? 'bg-emerald-900/60 text-emerald-300' : 'bg-amber-900/60 text-amber-300'
              }`}>
                {hasPowerMeter ? 'Power Meter Present' : 'Meterless (TM-MONO-01)'}
              </span>
            </div>

            {!hasPowerMeter ? (
              <div className="p-3 bg-slate-900/80 border border-slate-700 rounded-lg text-slate-400 text-xs">
                This device model does not have an on-board electrical sensing IC. Electrical protection cutoffs (E1, E2, E6, E8) are safely bypassed in firmware.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ConfigRow
                    label="Min Mains Voltage"
                    description="Trips E1 (Under-Voltage) below this limit."
                    configKey="min_voltage"
                    value={form.min_voltage}
                    unit="V"
                    min={100}
                    max={240}
                    step={1}
                    onChange={(v) => setForm((prev) => ({ ...prev, min_voltage: v }))}
                    onSave={() => handleSave('min_voltage', form.min_voltage!)}
                    isSaving={savingKey === 'min_voltage'}
                    disabled={!device.is_online}
                  />

                  <ConfigRow
                    label="Max Mains Voltage"
                    description="Trips E2 (Over-Voltage) above this limit."
                    configKey="max_voltage"
                    value={form.max_voltage}
                    unit="V"
                    min={220}
                    max={320}
                    step={1}
                    onChange={(v) => setForm((prev) => ({ ...prev, max_voltage: v }))}
                    onSave={() => handleSave('max_voltage', form.max_voltage!)}
                    isSaving={savingKey === 'max_voltage'}
                    disabled={!device.is_online}
                  />

                  <ConfigRow
                    label="Dry-Run Current (Min)"
                    description="Trips E8 (Dry Run) if current drops below this threshold."
                    configKey="min_current"
                    value={form.min_current}
                    unit="A"
                    min={0.1}
                    max={50.0}
                    step={0.1}
                    onChange={(v) => setForm((prev) => ({ ...prev, min_current: v }))}
                    onSave={() => handleSave('min_current', form.min_current!)}
                    isSaving={savingKey === 'min_current'}
                    disabled={!device.is_online}
                  />

                  <ConfigRow
                    label="Overload Current (Max)"
                    description="Trips E6 (Overload) if current exceeds this limit."
                    configKey="max_current"
                    value={form.max_current}
                    unit="A"
                    min={1.0}
                    max={80.0}
                    step={0.1}
                    onChange={(v) => setForm((prev) => ({ ...prev, max_current: v }))}
                    onSave={() => handleSave('max_current', form.max_current!)}
                    isSaving={savingKey === 'max_current'}
                    disabled={!device.is_online}
                  />

                  <ConfigRow
                    label="Max Inrush Current"
                    description="Maximum transient surge permitted during starter engagement."
                    configKey="max_transient_current"
                    value={form.max_transient_current}
                    unit="A"
                    min={5.0}
                    max={150.0}
                    step={0.5}
                    onChange={(v) => setForm((prev) => ({ ...prev, max_transient_current: v }))}
                    onSave={() => handleSave('max_transient_current', form.max_transient_current!)}
                    isSaving={savingKey === 'max_transient_current'}
                    disabled={!device.is_online}
                  />

                  <ConfigRow
                    label="Inrush Blanking Window"
                    description="Grace period in seconds after start before overload trip activates."
                    configKey="transient_blanking_time_s"
                    value={form.transient_blanking_time_s}
                    unit="s"
                    min={1}
                    max={10}
                    step={1}
                    onChange={(v) => setForm((prev) => ({ ...prev, transient_blanking_time_s: v }))}
                    onSave={() => handleSave('transient_blanking_time_s', form.transient_blanking_time_s!)}
                    isSaving={savingKey === 'transient_blanking_time_s'}
                    disabled={!device.is_online}
                  />
                </div>
              </>
            )}
          </div>

          {/* Section 5: Hardware & Power Calibration */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-700 pb-3">
              <Gauge size={18} className="text-yellow-400" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                Sensor & Power Calibration
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ConfigRow
                label="Voltage Calibration"
                description="AC voltage multiplier."
                configKey="voltage_calib"
                value={form.voltage_calib}
                unit="×"
                min={0.5}
                max={2.0}
                step={0.01}
                onChange={(v) => setForm((prev) => ({ ...prev, voltage_calib: v }))}
                onSave={() => handleSave('voltage_calib', form.voltage_calib!)}
                isSaving={savingKey === 'voltage_calib'}
                disabled={!device.is_online}
              />

              <ConfigRow
                label="Current Calibration"
                description="AC current multiplier."
                configKey="current_calib"
                value={form.current_calib}
                unit="×"
                min={0.5}
                max={2.0}
                step={0.01}
                onChange={(v) => setForm((prev) => ({ ...prev, current_calib: v }))}
                onSave={() => handleSave('current_calib', form.current_calib!)}
                isSaving={savingKey === 'current_calib'}
                disabled={!device.is_online}
              />

              <ConfigRow
                label="Power Calibration"
                description="Active power multiplier."
                configKey="power_calib"
                value={form.power_calib}
                unit="×"
                min={0.5}
                max={2.0}
                step={0.01}
                onChange={(v) => setForm((prev) => ({ ...prev, power_calib: v }))}
                onSave={() => handleSave('power_calib', form.power_calib!)}
                isSaving={savingKey === 'power_calib'}
                disabled={!device.is_online}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConfigRow({
  label,
  description,
  configKey,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
  onSave,
  isSaving,
  disabled = false,
}: {
  label: string
  description?: string
  configKey: string
  value: number | undefined
  unit?: string
  min?: number
  max?: number
  step?: number
  onChange: (val: number) => void
  onSave: () => void
  isSaving: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-900/60 rounded-lg border border-slate-700/60">
      <div className="space-y-0.5 flex-1 pr-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{label}</span>
          <code className="text-[11px] text-slate-400 font-mono">({configKey})</code>
        </div>
        {description && <p className="text-xs text-slate-400">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex items-center">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value !== undefined && !isNaN(value) ? value : ''}
            disabled={disabled}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              onChange(isNaN(v) ? (undefined as unknown as number) : v)
            }}
            className="w-28 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-md text-white text-sm font-mono focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
          {unit && (
            <span className="ml-2 text-xs text-slate-400 font-medium w-8">{unit}</span>
          )}
        </div>
        <button
          onClick={onSave}
          disabled={disabled || isSaving || value === undefined || isNaN(value)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
        >
          {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
          Save
        </button>
      </div>
    </div>
  )
}


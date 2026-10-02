import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, RefreshCw, Zap, Terminal, Trash2,
  CheckCircle2, Play, Square, Settings, Wifi, ShieldAlert,
  Monitor, Volume2, Search, Power, Clock, Radio, AlertTriangle
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  getAdminDevice, getAdminDeviceHistory, getAdminDeviceEvents,
  sendCommand, revokeMqttCache,
} from '../api/devices'
import { listReleases, pushOTA } from '../api/firmware'
import { pgStr, pgTime } from '../api/client'
import {
  PUMP_STATE_LABEL, type HwStatus, type FaultEventData,
  type FaultClearedEventData, type CommandEventData,
  type ConfigChangeEventData, type PumpStateEventData,
  type PowerEventData
} from '../api/types'
import StatusBadge from '../components/StatusBadge'
import Layout from '../components/Layout'

type Tab = 'overview' | 'history' | 'events' | 'controls'

const COMMANDS = ['on', 'off', 'f_on', 'status', 'reboot'] as const

export default function Device() {
  const { id } = useParams<{ id: string }>()
  const deviceId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [hours, setHours] = useState(24)
  const [otaUrl, setOtaUrl] = useState('')
  const [cmdResult, setCmdResult] = useState<string | null>(null)
  const [eventCategory, setEventCategory] = useState<string>('all')
  const [eventSearch, setEventSearch] = useState<string>('')

  const { data: device, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-device', deviceId],
    queryFn: () => getAdminDevice(deviceId),
    refetchInterval: 30_000,
  })

  const { data: history } = useQuery({
    queryKey: ['admin-device-history', deviceId, hours],
    queryFn: () => getAdminDeviceHistory(deviceId, hours),
    enabled: tab === 'history',
  })

  const { data: events } = useQuery({
    queryKey: ['admin-device-events', deviceId],
    queryFn: () => getAdminDeviceEvents(deviceId),
    refetchInterval: 15_000,
  })

  const { data: releases } = useQuery({
    queryKey: ['firmware-releases'],
    queryFn: () => listReleases(),
    enabled: tab === 'controls',
  })

  const cmdMutation = useMutation({
    mutationFn: (command: string) => sendCommand(deviceId, command),
    onSuccess: (data) => {
      setCmdResult(JSON.stringify(data, null, 2))
      void qc.invalidateQueries({ queryKey: ['admin-device', deviceId] })
    },
    onError: () => setCmdResult('Command failed'),
  })

  const otaMutation = useMutation({
    mutationFn: (url: string) => pushOTA(deviceId, url),
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

  if (isLoading) return <Layout><div className="text-slate-400 text-sm">Loading…</div></Layout>
  if (isError || !device) return <Layout><div className="text-red-400 text-sm">Device not found.</div></Layout>

  const t = device.telemetry
  const st = t?.sensor_telemetry || device?.sensor_telemetry
  const latestFaultEvent = (events ?? []).find(
    (e) => e.event_type === 'fault' || e.event_type === 'fault_cleared'
  )
  const isFaultActive = latestFaultEvent?.event_type === 'fault'
  const activeFault = isFaultActive ? (latestFaultEvent?.data as FaultEventData) : null

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'history', label: 'History' },
    { id: 'events', label: 'Events' },
    { id: 'controls', label: 'Controls' },
  ]

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/fleet')} className="text-slate-400 hover:text-white">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-white font-mono">{device.serial_id}</h1>
            <StatusBadge online={device.is_online} />
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
            {device.model_name} · {device.device_type} · fw {pgStr(device.current_fw)}
          </p>
        </div>
        <button onClick={() => refetch()} className="text-slate-400 hover:text-white">
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
        <div className="space-y-4">
          {/* Active Fault Alert Banner */}
          {activeFault && (
            <div className="bg-red-950/80 border-2 border-red-600 rounded-xl p-4 shadow-lg text-white">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-red-600 text-white font-bold rounded text-xs animate-pulse flex items-center gap-1">
                      <ShieldAlert size={13} /> ACTIVE FAULT: {activeFault.code}
                    </span>
                    <span className="font-semibold text-red-200 text-base">{activeFault.name}</span>
                  </div>
                  <p className="text-sm text-red-300">{activeFault.description}</p>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-red-300/90 pt-1">
                    <span className="flex items-center gap-1 text-red-400 font-medium">
                      <Volume2 size={13} /> Alarm Pattern: <strong className="text-red-200">{activeFault.buzzer}</strong>
                    </span>
                    <span>
                      <strong className="text-red-200">Action Taken:</strong> {activeFault.action_taken}
                    </span>
                  </div>
                  {activeFault.readings && (
                    <div className="flex flex-wrap gap-3 text-xs font-mono bg-black/40 px-3 py-1.5 rounded-md border border-red-800/40 w-fit mt-1">
                      {activeFault.readings.voltage !== undefined && <span>V: {activeFault.readings.voltage.toFixed(1)}V</span>}
                      {activeFault.readings.current !== undefined && <span>I: {activeFault.readings.current.toFixed(2)}A</span>}
                      {activeFault.readings.active_power !== undefined && <span>P: {activeFault.readings.active_power.toFixed(1)}W</span>}
                      {activeFault.readings.tank_level !== undefined && <span>Level: {activeFault.readings.tank_level.toFixed(1)}%</span>}
                    </div>
                  )}
                </div>
                <SimulatedLCD line1={activeFault.lcd_line1} line2={activeFault.lcd_line2} />
              </div>
            </div>
          )}

          {/* Telemetry cards */}
          {t ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <TCard label="Pump" value={PUMP_STATE_LABEL[t.pump_state] ?? String(t.pump_state)}
                accent={t.pump_state === 2 || t.pump_state === 3 ? 'green' : 'default'} />
              <TCard label="Tank Level" value={t.tank_level >= 0 ? `${t.tank_level.toFixed(1)}%` : 'No data'} />
              <TCard label="Voltage" value={`${t.voltage.toFixed(1)} V`} />
              <TCard label="Current" value={`${t.current.toFixed(2)} A`} />
              <TCard label="Power" value={`${t.active_power.toFixed(1)} W`} />
              <TCard label="Frequency" value={`${t.frequency.toFixed(1)} Hz`} />
              <TCard label="WiFi RSSI" value={`${t.wifi_rssi} dBm`} />
              <TCard label="Runtime" value={`${Math.floor(t.pump_runtime / 60)}m ${t.pump_runtime % 60}s`} />
            </div>
          ) : (
            <p className="text-slate-400 text-sm">No telemetry yet.</p>
          )}

          {/* Tank-Top Sensor Telemetry & Diagnostics */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Radio className="text-cyan-400" size={18} />
                <h3 className="text-xs font-medium text-slate-300 uppercase tracking-wide">
                  Tank-Top Sensor & LoRa Telemetry
                </h3>
                {st && (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                    st.is_v2 ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/60' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {st.is_v2 ? 'v2 Fleet Diagnostic (14B)' : 'v1 Legacy (8B)'}
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
                      Magnet: {st.magnet_status}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-500">No sensor data received</span>
                )}
              </div>
            </div>

            {st ? (
              <>
                {/* Fault or Degraded Alert Banner */}
                {st.sensor_fault && (
                  <div className="mb-4 p-3 bg-red-950/70 border border-red-600 rounded-lg flex items-center gap-3 text-red-200 text-xs">
                    <AlertTriangle className="text-red-400 shrink-0" size={18} />
                    <div>
                      <strong className="font-semibold text-white">AS5600 Angle Sensor Communication Fault!</strong>{' '}
                      Top sensor cannot read magnetic encoder (detached or I2C bus error). Pump automation is safely gated.
                    </div>
                  </div>
                )}
                {st.magnet_degraded && !st.sensor_fault && (
                  <div className="mb-4 p-3 bg-amber-950/60 border border-amber-600 rounded-lg flex items-center gap-3 text-amber-200 text-xs">
                    <AlertTriangle className="text-amber-400 shrink-0" size={18} />
                    <div>
                      <strong className="font-semibold text-white">Magnet Alignment Degraded ({st.magnet_status}):</strong>{' '}
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

                {/* Metric Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-slate-900/80 rounded-lg border border-slate-700/70 p-3">
                    <p className="text-xs text-slate-400 mb-1">12-bit Angle</p>
                    <p className="text-lg font-semibold font-mono text-cyan-300">{st.raw_angle ?? 0} <span className="text-xs text-slate-400 font-sans">/ 4095</span></p>
                    <p className="text-[11px] text-slate-400 mt-1">{(((st.raw_angle ?? 0) / 4095) * 360).toFixed(1)}° rotation</p>
                  </div>
                  <div className="bg-slate-900/80 rounded-lg border border-slate-700/70 p-3">
                    <p className="text-xs text-slate-400 mb-1">AGC & Field Gain</p>
                    <p className="text-lg font-semibold font-mono text-white">{st.agc ?? 0} <span className="text-xs text-slate-400 font-sans">/ 255</span></p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {(st.agc ?? 0) < 50 ? 'Strong field' : (st.agc ?? 0) > 200 ? 'Weak field' : 'Nominal gain'}
                    </p>
                  </div>
                  <div className="bg-slate-900/80 rounded-lg border border-slate-700/70 p-3">
                    <p className="text-xs text-slate-400 mb-1">Packet Loss Rate</p>
                    <p className={`text-lg font-semibold font-mono ${
                      (st.packet_loss_rate_pct ?? 0) > 20 ? 'text-red-400' : (st.packet_loss_rate_pct ?? 0) > 5 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {(st.packet_loss_rate_pct ?? 0).toFixed(1)}%
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">{st.packet_loss_count ?? 0} dropped · Seq #{st.packet_seq ?? 0}</p>
                  </div>
                  <div className="bg-slate-900/80 rounded-lg border border-slate-700/70 p-3">
                    <p className="text-xs text-slate-400 mb-1">LoRa RF Link</p>
                    <p className={`text-lg font-semibold font-mono ${
                      (st.rf_signal_pct ?? 0) >= 50 ? 'text-emerald-400' : (st.rf_signal_pct ?? 0) >= 25 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {st.rf_signal_pct ?? 0}%
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 font-mono">{st.rf_rssi_dbm ?? 0} dBm · SNR {(st.rf_snr_db ?? 0).toFixed(1)} dB</p>
                  </div>
                </div>

                {/* Additional Diagnostic Attributes */}
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
                      0x{(st.as5600_status ?? 0).toString(16).toUpperCase().padStart(2, '0')}
                      <span className="text-[10px] text-slate-400 font-sans ml-1">
                        (MD: {(st.as5600_status ?? 0) & 0x08 ? '1' : '0'} ML: {(st.as5600_status ?? 0) & 0x10 ? '1' : '0'} MH: {(st.as5600_status ?? 0) & 0x20 ? '1' : '0'})
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

          {/* Hardware health */}
          {t && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Hardware Health</h3>
              {t.hw_status ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <HwCard label="LoRa" status={t.hw_status.lora} />
                    <HwCard label="Power Meter" status={t.hw_status.power_meter} />
                    <HwCard label="LCD" status={t.hw_status.lcd} />
                    <HwCard label="NVS" status={t.hw_status.nvs} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <InfoRow label="Last Reset Reason" value={t.reset_reason || '—'} mono />
                    <InfoRow label="LoRa Reset Count" value={String(t.lora_reset_count)} />
                    <InfoRow label="Free Heap" value={`${(t.free_heap / 1024).toFixed(1)} KB`} />
                    <InfoRow label="Min Free Heap" value={`${(t.min_free_heap / 1024).toFixed(1)} KB`} />
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
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {[6, 24, 48, 168].map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  hours === h ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </div>

          {history && history.length > 0 ? (
            <div className="space-y-4">
              <ChartCard
                title="Pump State (0=OFF 2=ON 3=FORCE)"
                data={history.map((r) => ({ t: new Date(r.ts ?? '').toLocaleTimeString(), v: r.pump_state }))}
                dataKey="v"
                color="#a78bfa"
                stepLine
                yDomain={[0, 3]}
              />
              <ChartCard
                title="Tank Level (%)"
                data={history.map((r) => ({ t: new Date(r.ts ?? '').toLocaleTimeString(), v: r.tank_level }))}
                dataKey="v"
                color="#60a5fa"
              />
              <ChartCard
                title="Current (A)"
                data={history.map((r) => ({ t: new Date(r.ts ?? '').toLocaleTimeString(), v: r.current }))}
                dataKey="v"
                color="#f472b6"
              />
              <ChartCard
                title="Power (W)"
                data={history.map((r) => ({ t: new Date(r.ts ?? '').toLocaleTimeString(), v: r.active_power }))}
                dataKey="v"
                color="#34d399"
              />
              <ChartCard
                title="Voltage (V)"
                data={history.map((r) => ({ t: new Date(r.ts ?? '').toLocaleTimeString(), v: r.voltage }))}
                dataKey="v"
                color="#fbbf24"
              />
            </div>
          ) : (
            <p className="text-slate-400 text-sm">No history for this period.</p>
          )}
        </div>
      )}

      {/* Events */}
      {tab === 'events' && (
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
            const stepData = sorted
              .filter((ev) => ev.event_type === 'online' || ev.event_type === 'offline')
              .map((ev) => ({
                t: new Date(ev.ts ?? '').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                v: ev.event_type === 'online' ? 1 : 0,
              }))
            return stepData.length > 0 ? (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Online / Offline Timeline</h4>
                <ResponsiveContainer width="100%" height={100}>
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
            ) : null
          })()}

          {/* Structured Audit Events Feed */}
          <div className="space-y-3">
            {(() => {
              const filtered = (events ?? []).filter((ev) => {
                if (eventCategory === 'fault' && ev.event_type !== 'fault' && ev.event_type !== 'fault_cleared' && ev.event_type !== 'sensor_fault' && ev.event_type !== 'sensor_fault_cleared' && ev.event_type !== 'magnet_degraded') return false
                if (eventCategory === 'command' && ev.event_type !== 'command') return false
                if (eventCategory === 'config' && ev.event_type !== 'config_change') return false
                if (eventCategory === 'pump' && ev.event_type !== 'pump_state') return false
                if (eventCategory === 'power' && ev.event_type !== 'power_restored' && ev.event_type !== 'device_reboot') return false
                if (eventCategory === 'network' && ev.event_type !== 'online' && ev.event_type !== 'offline') return false

                if (eventSearch.trim() !== '') {
                  const q = eventSearch.toLowerCase()
                  const str = `${ev.event_type} ${JSON.stringify(ev.data ?? '')} ${ev.ts ?? ''}`.toLowerCase()
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

              return filtered.map((ev) => (
                <EventCard key={ev.id} ev={ev} />
              ))
            })()}
          </div>
        </div>
      )}

      {/* Controls */}
      {tab === 'controls' && (
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
      )}
    </Layout>
  )
}

function TCard({ label, value, accent = 'default' }: {
  label: string
  value: string
  accent?: 'green' | 'default'
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${accent === 'green' ? 'text-green-400' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

function HwCard({ label, status }: { label: string; status: HwStatus[keyof HwStatus] }) {
  const ok = status === 'ok'
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-sm font-semibold flex items-center gap-1.5 ${ok ? 'text-green-400' : 'text-red-400'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`} />
        {status}
      </p>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-slate-400">{label}</dt>
      <dd className={`text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
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
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">{title}</h4>
      <ResponsiveContainer width="100%" height={180}>
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
  )
}

function SimulatedLCD({ line1, line2 }: { line1?: string; line2?: string }) {
  return (
    <div className="bg-emerald-950/90 border-2 border-emerald-600/80 rounded-lg p-2.5 shadow-inner font-mono text-emerald-300 select-none tracking-widest text-xs w-full max-w-[260px]">
      <div className="flex items-center justify-between text-[10px] text-emerald-500/80 border-b border-emerald-800/60 pb-1 mb-1 uppercase font-sans">
        <span className="flex items-center gap-1"><Monitor size={11} /> 16x2 LCD Display</span>
        <span className="text-[9px] bg-emerald-900/80 px-1 py-0.2 rounded text-emerald-300">USER SCREEN</span>
      </div>
      <div className="bg-black/60 rounded p-1.5 border border-emerald-800/40 space-y-0.5">
        <div className="whitespace-pre overflow-hidden text-[11px] leading-tight text-emerald-400">{line1 || '                '}</div>
        <div className="whitespace-pre overflow-hidden text-[11px] font-bold text-emerald-200 leading-tight">{line2 || '                '}</div>
      </div>
    </div>
  )
}

function EventCard({ ev }: { ev: any }) {
  const t = pgTime(ev.ts)
  const d = (ev.data || {}) as Record<string, any>

  switch (ev.event_type) {
    case 'fault': {
      const fault = d as FaultEventData
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
              <p className="text-sm text-slate-300">{fault.description}</p>
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
              {fault.readings && (
                <div className="flex flex-wrap gap-2 text-xs font-mono bg-slate-900/80 px-2.5 py-1 rounded border border-slate-700/60 w-fit mt-1">
                  {fault.readings.voltage !== undefined && <span className="text-amber-300">{fault.readings.voltage.toFixed(1)}V</span>}
                  {fault.readings.current !== undefined && <span className="text-pink-300">{fault.readings.current.toFixed(2)}A</span>}
                  {fault.readings.active_power !== undefined && <span className="text-emerald-300">{fault.readings.active_power.toFixed(0)}W</span>}
                  {fault.readings.tank_level !== undefined && <span className="text-blue-300">Tank: {fault.readings.tank_level.toFixed(1)}%</span>}
                  {fault.readings.runtime_s !== undefined && <span className="text-purple-300">{fault.readings.runtime_s}s</span>}
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
                {d.packet_loss_count !== undefined && <span className="text-amber-300">Drops: {d.packet_loss_count}</span>}
                {d.raw_angle !== undefined && <span className="text-cyan-300">RawAngle: {d.raw_angle}</span>}
                {d.agc !== undefined && <span className="text-purple-300">AGC: {d.agc}</span>}
                {d.protocol_version !== undefined && <span className="text-slate-400">Proto: v{d.protocol_version}</span>}
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
                {d.description || `Magnet status degraded: ${d.magnet_status}`}
              </span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
          {(d.agc !== undefined || d.raw_angle !== undefined) && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-mono text-slate-400">
              {d.agc !== undefined && <span>AGC: {d.agc} / 255</span>}
              {d.raw_angle !== undefined && <span>Angle: {d.raw_angle} / 4095</span>}
              {d.magnet_status && <span>Status: {d.magnet_status}</span>}
            </div>
          )}
        </div>
      )
    }

    case 'command': {
      const cmd = d as CommandEventData
      const isSuccess = cmd.status === 'success'
      return (
        <div className="bg-slate-800 rounded-xl border border-purple-900/40 border-l-4 border-l-purple-500 p-3.5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 bg-purple-700 text-white font-mono font-bold rounded text-xs flex items-center gap-1">
                <Terminal size={12} /> {String(cmd.command).toUpperCase()}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isSuccess ? 'bg-green-950 text-green-400 border border-green-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>
                {cmd.status.toUpperCase()}
              </span>
              {cmd.execution_ms !== undefined && (
                <span className="text-xs text-slate-400 font-mono">{cmd.execution_ms}ms</span>
              )}
              <span className="text-xs text-slate-400">
                by <strong className="text-slate-200">{cmd.sender_email || 'User #' + cmd.sender_user_id}</strong>
                {cmd.sender_role && <span className="text-slate-500 ml-1">({cmd.sender_role})</span>}
              </span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
          {cmd.response !== undefined && cmd.response !== null && (
            <div className="mt-2 text-xs text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-700/60 font-mono overflow-auto max-h-24">
              {typeof cmd.response === 'string' ? String(cmd.response) : JSON.stringify(cmd.response)}
            </div>
          )}
        </div>
      )
    }

    case 'config_change': {
      const cfg = d as ConfigChangeEventData
      const isSuccess = cfg.status === 'success'
      return (
        <div className="bg-slate-800 rounded-xl border border-amber-900/40 border-l-4 border-l-amber-500 p-3.5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 bg-amber-700 text-white font-mono font-bold rounded text-xs flex items-center gap-1">
                <Settings size={12} /> {cfg.config_name}
              </span>
              <span className="text-xs text-amber-200 font-semibold">
                Set to: <span className="font-mono">{cfg.value}</span>
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isSuccess ? 'bg-green-950 text-green-400 border border-green-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>
                {cfg.status.toUpperCase()}
              </span>
              <span className="text-xs text-slate-400">
                by <strong className="text-slate-200">{cfg.sender_email || 'User #' + cfg.sender_user_id}</strong>
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
                {p.state_label || (isRunning ? 'PUMP STARTED' : 'PUMP STOPPED')}
              </span>
              <span className="text-xs text-slate-300">
                Trigger: <strong className="text-white font-mono">{p.trigger_source}</strong>
              </span>
              {!isRunning && p.runtime_s !== undefined && (
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
          {(p.voltage !== undefined || p.current !== undefined || p.tank_level !== undefined) && (
            <div className="flex flex-wrap gap-3 text-xs font-mono text-slate-400 mt-2 bg-slate-900/60 px-2.5 py-1 rounded w-fit">
              {p.voltage !== undefined && <span>{p.voltage.toFixed(1)}V</span>}
              {p.current !== undefined && <span>{p.current.toFixed(2)}A</span>}
              {p.tank_level !== undefined && <span>Tank: {p.tank_level.toFixed(1)}%</span>}
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
              <span className="text-xs text-slate-300">{pow.explanation}</span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> {t}
            </span>
          </div>
          {(pow.fw_version || pow.ip_address || pow.network_ssid) && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-400 font-mono mt-1.5">
              {pow.fw_version && <span>FW: {pow.fw_version}</span>}
              {pow.ip_address && <span>IP: {pow.ip_address}</span>}
              {pow.network_ssid && <span>SSID: {pow.network_ssid}</span>}
              {pow.free_heap && <span>Heap: {Math.round(pow.free_heap / 1024)}KB</span>}
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

    default: {
      return (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300 font-bold">{ev.event_type}</span>
            <span className="text-xs text-slate-400">{t}</span>
          </div>
          {ev.data && (
            <pre className="mt-1 text-xs text-slate-400 font-mono overflow-auto max-h-20 bg-slate-900 p-2 rounded">
              {JSON.stringify(ev.data, null, 2)}
            </pre>
          )}
        </div>
      )
    }
  }
}


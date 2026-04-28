import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw, Zap, Terminal, Trash2 } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  getAdminDevice, getAdminDeviceHistory, getAdminDeviceEvents,
  sendCommand, revokeMqttCache,
} from '../api/devices'
import { listReleases, pushOTA } from '../api/firmware'
import { pgStr, pgTime } from '../api/client'
import { PUMP_STATE_LABEL } from '../api/types'
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
    enabled: tab === 'events',
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
          {/* Online/offline timeline chart */}
          {(events ?? []).length > 0 && (() => {
            // Build step series: online=1, offline=0, sorted oldest→newest
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
                <ResponsiveContainer width="100%" height={120}>
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
                      formatter={(v: number) => [v === 1 ? 'Online' : 'Offline', 'Status']}
                    />
                    <Line type="stepAfter" dataKey="v" stroke="#60a5fa" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null
          })()}

          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">Event</th>
                  <th className="px-4 py-3 text-left">Data</th>
                </tr>
              </thead>
              <tbody>
                {(events ?? []).map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-700/50">
                    <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{pgTime(ev.ts)}</td>
                    <td className="px-4 py-2">
                      <span className={`font-medium ${ev.event_type === 'online' ? 'text-green-400' : ev.event_type === 'offline' ? 'text-red-400' : 'text-slate-200'}`}>
                        {ev.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-400 font-mono text-xs">
                      {ev.data ? JSON.stringify(ev.data) : '—'}
                    </td>
                  </tr>
                ))}
                {(events ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">No events.</td>
                  </tr>
                )}
              </tbody>
            </table>
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

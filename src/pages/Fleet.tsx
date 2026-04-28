import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { listDevices } from '../api/devices'
import { pgStr, pgTime } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import Layout from '../components/Layout'

export default function Fleet() {
  const navigate = useNavigate()
  const { data: devices, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
    refetchInterval: 30_000,
  })

  const online = devices?.filter((d) => d.is_online).length ?? 0
  const total = devices?.length ?? 0

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Fleet</h1>
          {!isLoading && (
            <p className="text-sm text-slate-400 mt-0.5">
              {online}/{total} online
            </p>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="text-slate-400 text-sm">Loading…</div>
      )}

      {isError && (
        <div className="text-red-400 text-sm">Failed to load devices.</div>
      )}

      {devices && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Serial ID</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Firmware</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/devices/${d.id}`)}
                  className="border-b border-slate-700/50 hover:bg-slate-700/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-blue-400">{d.serial_id}</td>
                  <td className="px-4 py-3">
                    <StatusBadge online={d.is_online} />
                  </td>
                  <td className="px-4 py-3 text-slate-300">{pgStr(d.current_fw)}</td>
                  <td className="px-4 py-3 text-slate-400">{d.device_type}</td>
                  <td className="px-4 py-3 text-slate-400">{pgTime(d.last_seen_at)}</td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No devices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}

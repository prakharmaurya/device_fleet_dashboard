import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Unlink } from 'lucide-react'
import { listUsers, getUserDevices, adminUnclaimDevice } from '../api/users'
import { pgTime } from '../api/client'
import Layout from '../components/Layout'
import type { AdminUser } from '../api/types'

function DeviceRow({ userId, deviceId, serial, type, fw, role, onUnclaim }: {
  userId: number
  deviceId: number
  serial: string
  type: string
  fw: string
  role: string
  onUnclaim: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: () => adminUnclaimDevice(userId, deviceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['user-devices', userId] })
      onUnclaim()
    },
  })

  return (
    <tr className="border-t border-slate-700">
      <td className="px-4 py-2 text-slate-300 font-mono text-xs">{serial}</td>
      <td className="px-4 py-2 text-slate-400 text-xs">{type}</td>
      <td className="px-4 py-2 text-slate-400 text-xs">{fw}</td>
      <td className="px-4 py-2 text-slate-400 text-xs capitalize">{role}</td>
      <td className="px-4 py-2 text-right">
        {confirming ? (
          <span className="text-xs">
            <button
              onClick={() => mutate()}
              disabled={isPending}
              className="text-red-400 hover:text-red-300 mr-2"
            >
              {isPending ? 'Removing…' : 'Confirm'}
            </button>
            <button onClick={() => setConfirming(false)} className="text-slate-400 hover:text-white">
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors ml-auto"
          >
            <Unlink size={12} /> Unclaim
          </button>
        )}
      </td>
    </tr>
  )
}

function UserRow({ user }: { user: AdminUser }) {
  const [expanded, setExpanded] = useState(false)
  const { data: devices, isLoading } = useQuery({
    queryKey: ['user-devices', user.id],
    queryFn: () => getUserDevices(user.id),
    enabled: expanded,
  })

  return (
    <>
      <tr
        className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
        </td>
        <td className="px-4 py-3">
          <p className="text-sm text-white">{user.name}</p>
          <p className="text-xs text-slate-500">{user.email}</p>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-purple-900 text-purple-300' : 'bg-slate-700 text-slate-300'}`}>
            {user.role}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-400 capitalize">{user.provider}</td>
        <td className="px-4 py-3 text-sm text-slate-300 text-center">{user.device_count}</td>
        <td className="px-4 py-3 text-xs text-slate-500">{pgTime(user.created_at)}</td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${user.is_active ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
            {user.is_active ? 'active' : 'inactive'}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-slate-900 px-8 py-0">
            {isLoading ? (
              <p className="text-xs text-slate-500 py-3">Loading devices…</p>
            ) : !devices?.length ? (
              <p className="text-xs text-slate-500 py-3">No devices claimed.</p>
            ) : (
              <table className="w-full mb-2">
                <thead>
                  <tr>
                    {['Serial', 'Type', 'Firmware', 'Role', ''].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <DeviceRow
                      key={d.device_id}
                      userId={user.id}
                      deviceId={d.device_id}
                      serial={d.serial_id}
                      type={d.device_type}
                      fw={d.device_firmware}
                      role={d.device_role}
                      onUnclaim={() => {}}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export default function Users() {
  const { data: users, isLoading, isError } = useQuery({
    queryKey: ['admin-users'],
    queryFn: listUsers,
  })

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Users</h1>
        {!isLoading && (
          <p className="text-sm text-slate-400 mt-0.5">{users?.length ?? 0} total</p>
        )}
      </div>

      {isLoading && <p className="text-slate-400">Loading…</p>}
      {isError && <p className="text-red-400">Failed to load users.</p>}

      {users && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="w-8" />
                {['User', 'Role', 'Provider', 'Devices', 'Joined', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}

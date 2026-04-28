import { useState, useRef, type FormEvent, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Pencil, Trash2, Upload, X, Check } from 'lucide-react'
import { listReleases, createRelease, updateRelease, deleteRelease, getUploadUrl } from '../api/firmware'
import type { FirmwareRelease } from '../api/types'
import { pgTime } from '../api/client'
import Layout from '../components/Layout'

const OTA_PREFIX = 'https://fw.iot.inflection.org.in/'

// ── R2 Upload — presigned URL from backend ──────────────────────────────────

function R2Upload({ onUploaded }: { onUploaded: (url: string, version: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    setProgress('Getting upload URL…')
    try {
      const { presigned_url, public_url, version } = await getUploadUrl(file.name)
      setProgress(`Uploading ${file.name}…`)
      const res = await fetch(presigned_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      })
      if (!res.ok) throw new Error(`R2 upload failed: ${res.status} ${res.statusText}`)
      setProgress(`Uploaded → ${public_url}`)
      onUploaded(public_url, version)
    } catch (err: unknown) {
      setError(String(err instanceof Error ? err.message : err))
      setProgress('')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-2">
      <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-2">
        <Upload size={14} /> Upload to R2
      </h3>
      <p className="text-xs text-slate-500">
        Filename must be <code className="text-blue-400">aquasave-tank-vX.Y.Z.bin</code>.
        Version extracted automatically; URL pre-filled in register form.
      </p>
      <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors ${uploading ? 'opacity-50 pointer-events-none' : 'bg-slate-700 hover:bg-slate-600'}`}>
        <Upload size={14} />
        {uploading ? 'Uploading…' : 'Choose .bin file'}
        <input ref={fileRef} type="file" accept=".bin" className="hidden" onChange={upload} />
      </label>
      {progress && <p className="text-xs text-green-400 font-mono break-all">{progress}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── Edit row inline ─────────────────────────────────────────────────────────

function EditRow({
  release,
  onSave,
  onCancel,
}: {
  release: FirmwareRelease
  onSave: (payload: { version: string; url: string; release_notes: string }) => void
  onCancel: () => void
}) {
  const [version, setVersion] = useState(release.version)
  const [url, setUrl] = useState(release.url)
  const [notes, setNotes] = useState(release.release_notes)
  const [err, setErr] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!url.startsWith(OTA_PREFIX)) { setErr(`URL must start with ${OTA_PREFIX}`); return }
    onSave({ version, url, release_notes: notes })
  }

  return (
    <tr className="bg-slate-700/40 border-b border-slate-700">
      <td className="px-4 py-2" colSpan={6}>
        <form onSubmit={submit} className="flex flex-wrap gap-2 items-end">
          {err && <p className="w-full text-xs text-red-400">{err}</p>}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Version</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} required
              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white w-24 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-48">
            <span className="text-xs text-slate-400">URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} required
              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white font-mono w-full focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-32">
            <span className="text-xs text-slate-400">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white w-full focus:outline-none focus:border-blue-500" />
          </div>
          <button type="submit" className="p-1.5 bg-green-700 hover:bg-green-600 rounded text-white"><Check size={14} /></button>
          <button type="button" onClick={onCancel} className="p-1.5 bg-slate-600 hover:bg-slate-500 rounded text-white"><X size={14} /></button>
        </form>
      </td>
    </tr>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function Firmware() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [version, setVersion] = useState('')
  const [url, setUrl] = useState(OTA_PREFIX)
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const { data: releases, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['firmware-releases'],
    queryFn: () => listReleases(),
  })

  const createMutation = useMutation({
    mutationFn: () => createRelease({ device_type: 'tank', version, url, release_notes: notes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['firmware-releases'] })
      setShowForm(false); setVersion(''); setUrl(OTA_PREFIX); setNotes(''); setFormError('')
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create release'
      setFormError(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { version: string; url: string; release_notes: string } }) =>
      updateRelease(id, payload),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['firmware-releases'] }); setEditId(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRelease(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['firmware-releases'] }),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError('')
    if (!url.startsWith(OTA_PREFIX)) { setFormError(`URL must start with ${OTA_PREFIX}`); return }
    createMutation.mutate()
  }

  function confirmDelete(r: FirmwareRelease) {
    if (window.confirm(`Delete release v${r.version}? Only removes DB record — file stays in R2.`))
      deleteMutation.mutate(r.id)
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Firmware Releases</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            OTA host: <span className="font-mono text-blue-400">{OTA_PREFIX}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="text-slate-400 hover:text-white disabled:opacity-50">
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-sm font-medium rounded-md transition-colors"
          >
            <Plus size={14} /> New Release
          </button>
        </div>
      </div>

      {/* R2 upload — presigned URL via backend */}
      <div className="mb-6">
        <R2Upload onUploaded={(uploadedUrl, ver) => {
          setUrl(uploadedUrl)
          setVersion(ver)
          setShowForm(true)
        }} />
      </div>

      {/* New Release Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-6 space-y-3">
          <h3 className="text-sm font-medium text-slate-200">Register New Release</h3>
          {formError && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">{formError}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Version (semver)</label>
              <input required value={version} onChange={(e) => setVersion(e.target.value)} placeholder="0.3.0"
                className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Release Notes</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bug fixes, improvements…"
                className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Firmware URL <span className="text-slate-500">(must start with {OTA_PREFIX})</span></label>
            <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder={`${OTA_PREFIX}tank/v0.3.0/aquasave-tank-v0.3.0.bin`}
              className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={createMutation.isPending}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium rounded-md">
              {createMutation.isPending ? 'Registering…' : 'Register'}
            </button>
          </div>
        </form>
      )}

      {isLoading && <div className="text-slate-400 text-sm">Loading…</div>}

      {releases && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Version</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Notes</th>
                <th className="px-4 py-3 text-left">URL</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left w-16"></th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => editId === r.id ? (
                <EditRow
                  key={r.id}
                  release={r}
                  onSave={(payload) => updateMutation.mutate({ id: r.id, payload })}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <tr key={r.id} className="border-b border-slate-700/50">
                  <td className="px-4 py-3 font-mono text-blue-400">{r.version}</td>
                  <td className="px-4 py-3 text-slate-400">{r.device_type}</td>
                  <td className="px-4 py-3 text-slate-300">{r.release_notes || '—'}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <a href={r.url} target="_blank" rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 font-mono text-xs truncate block">
                      {r.url.replace(OTA_PREFIX, '…/')}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{pgTime(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditId(r.id)} title="Edit"
                        className="p-1 text-slate-400 hover:text-white transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => confirmDelete(r)} title="Delete"
                        disabled={deleteMutation.isPending}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {releases.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No releases yet. Upload a .bin above then register it here.
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

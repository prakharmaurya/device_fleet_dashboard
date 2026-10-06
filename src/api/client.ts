import axios from 'axios'
import { triggerLogout } from '../lib/AuthContext'

const BASE = import.meta.env.DEV ? '/api' : 'https://v2api.iot.inflection.org.in'

export const api = axios.create({ baseURL: BASE })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const isLoginRequest = err.config?.url?.includes('/users/login')
    if (err.response?.status === 401 && !isLoginRequest) {
      triggerLogout()
    }
    return Promise.reject(err)
  },
)

export function pgStr(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v.trim() || '—'
  if (typeof v === 'object' && v !== null && 'String' in v) {
    const s = String((v as { String?: unknown }).String ?? '')
    return s.trim() || '—'
  }
  return String(v)
}

export function pgTime(v: unknown): string {
  if (!v) return '—'
  if (typeof v === 'object' && v !== null && 'Time' in v) {
    const d = new Date(String((v as { Time?: unknown }).Time ?? ''))
    return isNaN(d.getTime()) ? '—' : d.toLocaleString()
  }
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

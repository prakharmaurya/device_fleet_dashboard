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

export function pgStr(v: string | null | undefined): string {
  return v ?? '—'
}

export function pgTime(v: string | null | undefined): string {
  if (!v) return '—'
  return new Date(v).toLocaleString()
}

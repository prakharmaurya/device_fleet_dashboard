import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Fleet from './pages/Fleet'
import Device from './pages/Device'
import Firmware from './pages/Firmware'
import Users from './pages/Users'
import type { ReactNode } from 'react'

function Guard({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/fleet" element={<Guard><Fleet /></Guard>} />
          <Route path="/devices/:id" element={<Guard><Device /></Guard>} />
          <Route path="/firmware" element={<Guard><Firmware /></Guard>} />
          <Route path="/users" element={<Guard><Users /></Guard>} />
          <Route path="*" element={<Navigate to="/fleet" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

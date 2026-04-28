import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Cpu, Zap, Users, LogOut } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import type { ReactNode } from 'react'

const NAV = [
  { to: '/fleet', label: 'Fleet', icon: LayoutDashboard },
  { to: '/firmware', label: 'Firmware / OTA', icon: Zap },
  { to: '/users', label: 'Users', icon: Users },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-900">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-800 flex items-center gap-2">
          <Cpu size={20} className="text-blue-400" />
          <span className="font-semibold text-white tracking-tight">AquaSave Fleet</span>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <p className="text-xs text-slate-500 mb-2 truncate">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}

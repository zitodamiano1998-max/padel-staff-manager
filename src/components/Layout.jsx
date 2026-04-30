import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  LogOut, Users, LayoutDashboard, Calendar, Moon,
  Clock as ClockIcon, ListChecks, Palmtree, ArrowLeftRight,
} from 'lucide-react'
import NotificationBell from './NotificationBell'
import InstallPrompt from './InstallPrompt'

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const isActive = (path) => location.pathname === path

  return (
    <div className="min-h-screen bg-cream-100">
      <InstallPrompt />

      <header className="bg-white border-b border-cream-300 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">

          <Link to="/dashboard" className="flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-terracotta-400 flex items-center justify-center text-white font-serif text-lg font-semibold">
              P
            </div>
            <div className="hidden sm:block">
              <div className="font-serif text-lg text-warm-dark leading-none">Padel Staff</div>
              <div className="font-sans text-xs text-warm-brown mt-0.5">San Miniato</div>
            </div>
          </Link>

          <nav className="flex items-center gap-1 flex-1 justify-center flex-wrap">
            <NavLink to="/dashboard" icon={<LayoutDashboard size={16} />} active={isActive('/dashboard')}>
              Dashboard
            </NavLink>
            <NavLink to="/clock" icon={<ClockIcon size={16} />} active={isActive('/clock')}>
              Timbra
            </NavLink>
            <NavLink to="/planning" icon={<Calendar size={16} />} active={isActive('/planning')}>
              Planning
            </NavLink>
            <NavLink to="/availability" icon={<Moon size={16} />} active={isActive('/availability')}>
              Disponibilità
            </NavLink>
            <NavLink to="/leaves" icon={<Palmtree size={16} />} active={isActive('/leaves')}>
              Ferie
            </NavLink>
            <NavLink to="/swaps" icon={<ArrowLeftRight size={16} />} active={isActive('/swaps')}>
              Scambi
            </NavLink>
            {profile?.is_manager && (
              <>
                <NavLink to="/timesheets" icon={<ListChecks size={16} />} active={isActive('/timesheets')}>
                  Timbrature
                </NavLink>
                <NavLink to="/staff" icon={<Users size={16} />} active={isActive('/staff')}>
                  Anagrafica
                </NavLink>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right hidden md:block">
              <div className="font-sans text-sm font-semibold text-warm-dark leading-tight">
                {profile?.first_name} {profile?.last_name}
              </div>
              <div className="font-sans text-xs text-warm-brown leading-tight mt-0.5">
                {profile?.role_name}{profile?.is_manager && ' · Manager'}
              </div>
            </div>
            <NotificationBell />
            <button onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-cream-200 text-warm-brown hover:text-warm-dark transition"
              title="Esci">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}

function NavLink({ to, icon, active, children }) {
  return (
    <Link to={to}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg font-sans text-sm transition ${
        active
          ? 'bg-cream-200 text-warm-dark font-semibold'
          : 'text-warm-brown hover:bg-cream-200 hover:text-warm-dark'
      }`}>
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  )
}

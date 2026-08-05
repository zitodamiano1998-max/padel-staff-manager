import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import {
  LogOut, Users, LayoutDashboard, Calendar, CalendarOff,
  Clock as ClockIcon, ListChecks, Palmtree, ArrowLeftRight,
  Settings as SettingsIcon, CalendarPlus, FolderOpen, BarChart3, User, Boxes,
} from 'lucide-react'
import NotificationBell from './NotificationBell'
import OnboardingWizard from './OnboardingWizard'

// Staff id di Damiano Zito: unico che vede la voce Magazzino.
const MAGAZZINO_ADMIN_STAFF_ID = '3101cefd-6ea5-4675-875f-655f667e2d91'

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [onboardingDone, setOnboardingDone] = useState(null) // null = loading, true/false = checked

  // Verifico stato onboarding al primo render (solo per dipendenti non-manager)
  useEffect(() => {
    if (!profile?.id) return
    if (profile.is_manager) {
      // Manager non vede mai l'onboarding (Dario, ecc.)
      setOnboardingDone(true)
      return
    }
    checkOnboarding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const checkOnboarding = async () => {
    const { data, error } = await supabase
      .from('staff_members')
      .select('onboarding_completed_at')
      .eq('id', profile.id)
      .single()
    if (error || !data) {
      setOnboardingDone(true) // fallback per non bloccare l'app
      return
    }
    setOnboardingDone(!!data.onboarding_completed_at)
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const isActive = (path) => location.pathname === path

  // Se onboarding non ancora fatto, mostra il wizard a tutto schermo
  if (onboardingDone === false) {
    return <OnboardingWizard onComplete={() => setOnboardingDone(true)} />
  }

  const isMagazzinoAdmin = profile?.id === MAGAZZINO_ADMIN_STAFF_ID
  // "Gestore" = direzione oppure responsabile d'area: entrambi vedono le voci
  // operative (Timbrature, Statistiche). Anagrafica e Impostazioni restano
  // alla sola direzione.
  const isGestore = profile?.is_manager === true || profile?.is_area_manager === true

  return (
    <div className="min-h-screen bg-cream-100">
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
            {!profile?.timbratura_esente && (
              <NavLink to="/clock" icon={<ClockIcon size={16} />} active={isActive('/clock')}>
                Timbra
              </NavLink>
            )}
            <NavLink to="/planning" icon={<Calendar size={16} />} active={isActive('/planning')}>
              Planning
            </NavLink>
            <NavLink to="/availability" icon={<CalendarOff size={16} />} active={isActive('/availability')}>
              Indisponibilità
            </NavLink>
            <NavLink to="/leaves" icon={<Palmtree size={16} />} active={isActive('/leaves')}>
              Ferie
            </NavLink>
            <NavLink to="/swaps" icon={<ArrowLeftRight size={16} />} active={isActive('/swaps')}>
              Scambi
            </NavLink>
            <NavLink to="/timesheets" icon={<ListChecks size={16} />} active={isActive('/timesheets')}>
              {isGestore ? 'Timbrature' : 'Mie ore'}
            </NavLink>
            {!isGestore && (
              <NavLink to="/my-calendar" icon={<CalendarPlus size={16} />} active={isActive('/my-calendar')}>
                Calendario
              </NavLink>
            )}
            <NavLink to="/documents" icon={<FolderOpen size={16} />} active={isActive('/documents')}>
              Documenti
            </NavLink>
            {isGestore && (
              <NavLink to="/stats" icon={<BarChart3 size={16} />} active={isActive('/stats')}>
                Statistiche
              </NavLink>
            )}
            {profile?.is_manager && (
              <>
                <NavLink to="/staff" icon={<Users size={16} />} active={isActive('/staff')}>
                  Anagrafica
                </NavLink>
                <NavLink to="/settings" icon={<SettingsIcon size={16} />} active={isActive('/settings')}>
                  Impostazioni
                </NavLink>
              </>
            )}
            {isMagazzinoAdmin && (
              <NavLink to="/magazzino" icon={<Boxes size={16} />} active={isActive('/magazzino')}>
                Magazzino
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Link to="/profilo" className="text-right hidden md:block group" title="Il tuo profilo">
              <div className="font-sans text-sm font-semibold text-warm-dark leading-tight group-hover:text-terracotta-600 transition">
                {profile?.first_name} {profile?.last_name}
              </div>
              <div className="font-sans text-xs text-warm-brown leading-tight mt-0.5">
                {profile?.role_name}{profile?.is_manager ? ' · Manager' : profile?.is_area_manager ? ' · Responsabile' : null}
              </div>
            </Link>
            <Link to="/profilo"
              className="md:hidden p-2 rounded-lg hover:bg-cream-200 text-warm-brown hover:text-warm-dark transition"
              title="Il tuo profilo">
              <User size={18} />
            </Link>
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

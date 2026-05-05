import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import {
  LogOut, Users, LayoutDashboard, Calendar, Moon,
  Clock as ClockIcon, ListChecks, Palmtree, ArrowLeftRight,
  Settings as SettingsIcon, CalendarPlus, FolderOpen, BarChart3,
  X, MoreHorizontal,
} from 'lucide-react'
import NotificationBell from './NotificationBell'
import OnboardingWizard from './OnboardingWizard'

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [onboardingDone, setOnboardingDone] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    if (profile.is_manager) {
      setOnboardingDone(true)
      return
    }
    checkOnboarding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Chiudi drawer su cambio route
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const checkOnboarding = async () => {
    const { data, error } = await supabase
      .from('staff_members')
      .select('onboarding_completed_at')
      .eq('id', profile.id)
      .single()
    if (error || !data) {
      setOnboardingDone(true)
      return
    }
    setOnboardingDone(!!data.onboarding_completed_at)
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const isActive = (path) => location.pathname === path

  if (onboardingDone === false) {
    return <OnboardingWizard onComplete={() => setOnboardingDone(true)} />
  }

  const isManager = profile?.is_manager

  // Voci bottom nav (4 + drawer su 5° tasto)
  const bottomNavItems = isManager
    ? [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
        { to: '/planning', icon: Calendar, label: 'Planning' },
        { to: '/clock', icon: ClockIcon, label: 'Timbra' },
        { to: '/stats', icon: BarChart3, label: 'Stats' },
      ]
    : [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
        { to: '/planning', icon: Calendar, label: 'Planning' },
        { to: '/clock', icon: ClockIcon, label: 'Timbra' },
        { to: '/swaps', icon: ArrowLeftRight, label: 'Scambi' },
      ]

  // Voci drawer "Più"
  const drawerItems = [
    { to: '/availability', icon: Moon, label: 'Disponibilità' },
    { to: '/leaves', icon: Palmtree, label: 'Ferie' },
    !isManager && { to: '/swaps', icon: ArrowLeftRight, label: 'Scambi' },
    { to: '/timesheets', icon: ListChecks, label: isManager ? 'Timbrature' : 'Mie ore' },
    !isManager && { to: '/my-calendar', icon: CalendarPlus, label: 'Calendario sync' },
    { to: '/documents', icon: FolderOpen, label: 'Documenti' },
    isManager && { to: '/staff', icon: Users, label: 'Anagrafica' },
    isManager && { to: '/stats', icon: BarChart3, label: 'Statistiche' },
    isManager && { to: '/settings', icon: SettingsIcon, label: 'Impostazioni' },
  ].filter(Boolean)

  return (
    <div className="min-h-screen bg-cream-100">

      {/* DESKTOP HEADER (>= md) */}
      <header className="hidden md:block bg-white border-b border-cream-300 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/dashboard" className="flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-terracotta-400 flex items-center justify-center text-white font-serif text-lg font-semibold">
              P
            </div>
            <div>
              <div className="font-serif text-lg text-warm-dark leading-none">Padel Staff</div>
              <div className="font-sans text-xs text-warm-brown mt-0.5">San Miniato</div>
            </div>
          </Link>

          <nav className="flex items-center gap-1 flex-1 justify-center flex-wrap">
            <DesktopNavLink to="/dashboard" icon={<LayoutDashboard size={16} />} active={isActive('/dashboard')}>
              Dashboard
            </DesktopNavLink>
            <DesktopNavLink to="/clock" icon={<ClockIcon size={16} />} active={isActive('/clock')}>
              Timbra
            </DesktopNavLink>
            <DesktopNavLink to="/planning" icon={<Calendar size={16} />} active={isActive('/planning')}>
              Planning
            </DesktopNavLink>
            <DesktopNavLink to="/availability" icon={<Moon size={16} />} active={isActive('/availability')}>
              Disponibilità
            </DesktopNavLink>
            <DesktopNavLink to="/leaves" icon={<Palmtree size={16} />} active={isActive('/leaves')}>
              Ferie
            </DesktopNavLink>
            <DesktopNavLink to="/swaps" icon={<ArrowLeftRight size={16} />} active={isActive('/swaps')}>
              Scambi
            </DesktopNavLink>
            <DesktopNavLink to="/timesheets" icon={<ListChecks size={16} />} active={isActive('/timesheets')}>
              {isManager ? 'Timbrature' : 'Mie ore'}
            </DesktopNavLink>
            {!isManager && (
              <DesktopNavLink to="/my-calendar" icon={<CalendarPlus size={16} />} active={isActive('/my-calendar')}>
                Calendario
              </DesktopNavLink>
            )}
            <DesktopNavLink to="/documents" icon={<FolderOpen size={16} />} active={isActive('/documents')}>
              Documenti
            </DesktopNavLink>
            {isManager && (
              <>
                <DesktopNavLink to="/staff" icon={<Users size={16} />} active={isActive('/staff')}>
                  Anagrafica
                </DesktopNavLink>
                <DesktopNavLink to="/stats" icon={<BarChart3 size={16} />} active={isActive('/stats')}>
                  Statistiche
                </DesktopNavLink>
                <DesktopNavLink to="/settings" icon={<SettingsIcon size={16} />} active={isActive('/settings')}>
                  Impostazioni
                </DesktopNavLink>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right hidden md:block">
              <div className="font-sans text-sm font-semibold text-warm-dark leading-tight">
                {profile?.first_name} {profile?.last_name}
              </div>
              <div className="font-sans text-xs text-warm-brown leading-tight mt-0.5">
                {profile?.role_name}{isManager && ' · Manager'}
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

      {/* MOBILE HEADER (< md) */}
      <header className="md:hidden bg-white border-b border-cream-300 sticky top-0 z-10
        pt-[env(safe-area-inset-top)]">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-terracotta-400 flex items-center justify-center text-white font-serif text-base font-semibold">
              P
            </div>
            <div>
              <div className="font-serif text-base text-warm-dark leading-tight">Padel Staff</div>
              <div className="font-sans text-[10px] text-warm-brown leading-none">
                {profile?.first_name}{isManager && ' · Manager'}
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8 pb-24 md:pb-8">
        {children}
      </main>

      {/* MOBILE BOTTOM NAV (< md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20
        bg-white border-t border-cream-300
        pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {bottomNavItems.map((item) => (
            <BottomNavLink key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              active={isActive(item.to)} />
          ))}
          <button onClick={() => setDrawerOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition ${
              drawerOpen ? 'text-terracotta-600' : 'text-warm-brown'
            }`}>
            <MoreHorizontal size={22} />
            <span className="font-sans text-[10px] font-semibold">Più</span>
          </button>
        </div>
      </nav>

      {/* MOBILE DRAWER */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setDrawerOpen(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl
            pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
            flex flex-col"
            onClick={(e) => e.stopPropagation()}>

            <div className="flex items-center justify-between px-5 py-4 border-b border-cream-200">
              <div>
                <div className="font-serif text-lg text-warm-dark leading-tight">
                  {profile?.first_name} {profile?.last_name}
                </div>
                <div className="font-sans text-xs text-warm-brown">
                  {profile?.role_name}{isManager && ' · Manager'}
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              {drawerItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.to}
                    to={item.to}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3 px-5 py-3 transition ${
                      isActive(item.to)
                        ? 'bg-cream-100 text-warm-dark font-semibold border-r-4 border-terracotta-400'
                        : 'text-warm-brown hover:bg-cream-50'
                    }`}>
                    <Icon size={20} />
                    <span className="font-sans text-base">{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            <div className="px-5 py-3 border-t border-cream-200">
              <button onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-warm-brown hover:bg-cream-100 transition">
                <LogOut size={20} />
                <span className="font-sans text-base font-semibold">Esci</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DesktopNavLink({ to, icon, active, children }) {
  return (
    <Link to={to}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg font-sans text-sm transition ${
        active
          ? 'bg-cream-200 text-warm-dark font-semibold'
          : 'text-warm-brown hover:bg-cream-200 hover:text-warm-dark'
      }`}>
      {icon}
      <span>{children}</span>
    </Link>
  )
}

function BottomNavLink({ to, icon: Icon, label, active }) {
  return (
    <Link to={to}
      className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition ${
        active ? 'text-terracotta-600' : 'text-warm-brown'
      }`}>
      <Icon size={22} className={active ? 'fill-terracotta-100' : ''} />
      <span className={`font-sans text-[10px] ${active ? 'font-semibold' : ''}`}>{label}</span>
    </Link>
  )
}

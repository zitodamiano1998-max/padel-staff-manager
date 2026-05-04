import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { startOfMonth, addMonths, addDays, isToday, isTomorrow, isYesterday } from 'date-fns'
import { startOfWeek, formatDateISO } from '../lib/dateUtils'
import {
  Calendar, Clock as ClockIcon, Palmtree, ArrowRight, AlertCircle,
  ArrowLeftRight, MapPin, Sparkles, CheckCircle2,
} from 'lucide-react'

export default function Dashboard() {
  const { profile } = useAuth()
  const isManager = profile?.is_manager

  if (isManager) return <ManagerDashboard profile={profile} />
  return <EmployeeDashboard profile={profile} />
}

// ============================================================================
// EMPLOYEE DASHBOARD
// ============================================================================
function EmployeeDashboard({ profile }) {
  const [data, setData] = useState({
    upcomingShifts: [],
    weekShifts: [],
    monthHours: 0,
    pendingLeaves: 0,
    approvedUpcomingLeaves: [],
    activeSwaps: 0,
    recentApprovedLeave: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const fetch = async () => {
    setLoading(true)
    const now = new Date()
    const weekStart = startOfWeek(now)
    const weekEnd = addDays(weekStart, 7)
    const monthStart = startOfMonth(now)
    const monthEnd = startOfMonth(addMonths(now, 1))
    const todayISO = formatDateISO(now)
    const next7Days = addDays(now, 7)

    const [shiftsRes, weekShiftsRes, entriesRes, pendingLeavesRes,
           approvedLeavesRes, activeSwapsRes, recentLeaveRes] = await Promise.all([
      // Prossimi 5 turni
      supabase
        .from('shifts')
        .select('id, start_at, end_at, status, roles(name, color)')
        .eq('staff_id', profile.id)
        .gte('start_at', now.toISOString())
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true })
        .limit(5),

      // Turni della settimana corrente
      supabase
        .from('shifts')
        .select('id, start_at, end_at, status, roles(name, color)')
        .eq('staff_id', profile.id)
        .gte('start_at', weekStart.toISOString())
        .lt('start_at', weekEnd.toISOString())
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true }),

      // Time entries del mese (per calcolo ore)
      supabase
        .from('time_entries')
        .select('event_time, event_type')
        .eq('staff_id', profile.id)
        .gte('event_time', monthStart.toISOString())
        .lt('event_time', monthEnd.toISOString())
        .order('event_time', { ascending: true }),

      // Ferie pending
      supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('staff_id', profile.id)
        .eq('status', 'pending'),

      // Ferie approvate nei prossimi 7 giorni
      supabase
        .from('leave_requests')
        .select('id, leave_type, start_date, end_date')
        .eq('staff_id', profile.id)
        .eq('status', 'approved')
        .gte('start_date', todayISO)
        .lte('start_date', formatDateISO(next7Days))
        .order('start_date'),

      // Scambi a cui ho partecipato e ancora aperti
      supabase
        .from('shift_swaps')
        .select('id', { count: 'exact', head: true })
        .or(`requester_id.eq.${profile.id},target_id.eq.${profile.id}`)
        .in('status', ['open', 'proposed']),

      // Ultima ferie approvata negli ultimi 3 giorni (per banner positivo)
      supabase
        .from('leave_requests')
        .select('id, leave_type, start_date, end_date, reviewed_at')
        .eq('staff_id', profile.id)
        .eq('status', 'approved')
        .gte('reviewed_at', addDays(now, -3).toISOString())
        .order('reviewed_at', { ascending: false })
        .limit(1),
    ])

    const monthHours = entriesRes.data ? computeWorkedMs(entriesRes.data, now) / 3600000 : 0

    setData({
      upcomingShifts: shiftsRes.data || [],
      weekShifts: weekShiftsRes.data || [],
      monthHours,
      pendingLeaves: pendingLeavesRes.count ?? 0,
      approvedUpcomingLeaves: approvedLeavesRes.data || [],
      activeSwaps: activeSwapsRes.count ?? 0,
      recentApprovedLeave: recentLeaveRes.data?.[0] || null,
    })
    setLoading(false)
  }

  const greeting = getGreeting()
  const nextShift = data.upcomingShifts[0]

  return (
    <div className="space-y-6">
      {/* Saluto */}
      <div>
        <p className="font-sans text-sm text-warm-brown">{greeting},</p>
        <h1 className="text-4xl text-warm-dark">{profile?.first_name}</h1>
      </div>

      {/* Banner positivo: ferie approvata recente */}
      {data.recentApprovedLeave && (
        <PositiveBanner leave={data.recentApprovedLeave} />
      )}

      {/* Card prossimo turno (gigante) */}
      <NextShiftCard shift={nextShift} loading={loading} />

      {/* Riga compatta KPI personali */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat to="/planning"
          label="Turni settimana"
          value={loading ? '—' : data.weekShifts.length} />
        <MiniStat to="/timesheets"
          label="Ore mese"
          value={loading ? '—' : `${data.monthHours.toFixed(1)}h`} />
        <MiniStat to="/leaves"
          label="Ferie in attesa"
          value={loading ? '—' : data.pendingLeaves}
          accent={data.pendingLeaves > 0 ? 'amber' : null} />
        <MiniStat to="/swaps"
          label="Scambi attivi"
          value={loading ? '—' : data.activeSwaps}
          accent={data.activeSwaps > 0 ? 'sage' : null} />
      </div>

      {/* Settimana visiva */}
      {!loading && (
        <WeekStrip weekStart={startOfWeek(new Date())} shifts={data.weekShifts} />
      )}

      {/* Ferie approvate nei prossimi 7 giorni */}
      {data.approvedUpcomingLeaves.length > 0 && (
        <UpcomingLeavesSection leaves={data.approvedUpcomingLeaves} />
      )}

      {/* Prossimi turni (lista) */}
      {data.upcomingShifts.length > 1 && (
        <UpcomingShiftsList shifts={data.upcomingShifts.slice(1)} />
      )}
    </div>
  )
}

// ============================================================================
// MANAGER DASHBOARD (mantengo struttura precedente, leggermente arricchita)
// ============================================================================
function ManagerDashboard({ profile }) {
  const [stats, setStats] = useState({
    shiftsThisWeek: null,
    hoursThisMonth: null,
    pendingLeaves: null,
    pendingSwaps: null,
    activeStaff: null,
    publishedShiftsWeek: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const fetchStats = async () => {
    setLoading(true)
    const now = new Date()
    const weekStart = startOfWeek(now)
    const weekEnd = addDays(weekStart, 7)
    const monthStart = startOfMonth(now)
    const monthEnd = startOfMonth(addMonths(now, 1))

    const [shiftsRes, weekTeamShiftsRes, entriesRes, leavesRes, swapsRes, staffRes] = await Promise.all([
      supabase.from('shifts')
        .select('id', { count: 'exact', head: true })
        .eq('staff_id', profile.id)
        .gte('start_at', weekStart.toISOString())
        .lt('start_at', weekEnd.toISOString())
        .neq('status', 'cancelled'),
      supabase.from('shifts')
        .select('id', { count: 'exact', head: true })
        .gte('start_at', weekStart.toISOString())
        .lt('start_at', weekEnd.toISOString())
        .eq('status', 'published'),
      supabase.from('time_entries')
        .select('event_time, event_type')
        .eq('staff_id', profile.id)
        .gte('event_time', monthStart.toISOString())
        .lt('event_time', monthEnd.toISOString())
        .order('event_time', { ascending: true }),
      supabase.from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase.from('shift_swaps')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'proposed'),
      supabase.from('staff_members')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
    ])

    const hoursThisMonth = entriesRes.data
      ? computeWorkedMs(entriesRes.data, now) / 3600000
      : 0

    setStats({
      shiftsThisWeek: shiftsRes.count ?? 0,
      hoursThisMonth,
      pendingLeaves: leavesRes.count ?? 0,
      pendingSwaps: swapsRes.count ?? 0,
      activeStaff: staffRes.count ?? 0,
      publishedShiftsWeek: weekTeamShiftsRes.count ?? 0,
    })
    setLoading(false)
  }

  const greeting = getGreeting()
  const totalPending = (stats.pendingLeaves || 0) + (stats.pendingSwaps || 0)

  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans text-sm text-warm-brown">{greeting},</p>
        <h1 className="text-4xl text-warm-dark">{profile?.first_name}</h1>
      </div>

      {/* Banner riassuntivo richieste pending */}
      {totalPending > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          {stats.pendingLeaves > 0 && (
            <Link to="/leaves"
              className="flex-1 flex items-center gap-3 bg-amber-50 border border-amber-300 hover:border-amber-400 rounded-xl px-5 py-3 transition group">
              <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
              <div className="font-sans text-sm text-amber-900 flex-1">
                <strong>{stats.pendingLeaves}</strong> {stats.pendingLeaves === 1 ? 'richiesta ferie' : 'richieste ferie'} da approvare
              </div>
              <ArrowRight size={16} className="text-amber-700 group-hover:translate-x-0.5 transition" />
            </Link>
          )}
          {stats.pendingSwaps > 0 && (
            <Link to="/swaps"
              className="flex-1 flex items-center gap-3 bg-amber-50 border border-amber-300 hover:border-amber-400 rounded-xl px-5 py-3 transition group">
              <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
              <div className="font-sans text-sm text-amber-900 flex-1">
                <strong>{stats.pendingSwaps}</strong> {stats.pendingSwaps === 1 ? 'scambio' : 'scambi'} da approvare
              </div>
              <ArrowRight size={16} className="text-amber-700 group-hover:translate-x-0.5 transition" />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard to="/planning" icon={<Calendar size={18} />}
          label="Turni team questa settimana"
          value={loading ? '—' : stats.publishedShiftsWeek}
          ctaLabel="Vai al planning" />
        <KpiCard to="/staff" icon={<ClockIcon size={18} />}
          label="Dipendenti attivi"
          value={loading ? '—' : stats.activeStaff}
          ctaLabel="Anagrafica" />
        <KpiCard to="/timesheets" icon={<ClockIcon size={18} />}
          label="Tue ore (mese)"
          value={loading ? '—' : `${stats.hoursThisMonth.toFixed(1)}h`}
          ctaLabel="Riepilogo" />
      </div>

      {/* Profilo */}
      <div className="bg-white rounded-2xl border border-cream-300 p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-serif text-lg font-semibold"
            style={{ backgroundColor: profile?.role_color || '#C97D60' }}>
            {profile?.first_name?.[0]}{profile?.last_name?.[0]}
          </div>
          <div>
            <div className="font-sans font-semibold text-warm-dark">
              {profile?.first_name} {profile?.last_name}
            </div>
            <div className="font-sans text-sm text-warm-brown">
              {profile?.role_name} · Manager
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function NextShiftCard({ shift, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-cream-300 p-8 text-center">
        <p className="font-sans text-warm-brown">Caricamento…</p>
      </div>
    )
  }

  if (!shift) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-cream-300 p-8 text-center">
        <Calendar size={28} className="mx-auto mb-3 text-warm-brown/40" />
        <p className="font-sans text-warm-dark font-semibold mb-1">
          Nessun turno in programma
        </p>
        <p className="font-sans text-sm text-warm-brown">
          Quando il manager assegnerà nuovi turni, li vedrai qui.
        </p>
      </div>
    )
  }

  const start = new Date(shift.start_at)
  const end = new Date(shift.end_at)
  const now = new Date()
  const color = shift.roles?.color || '#C97D60'
  const isOngoing = now >= start && now < end

  // Etichetta relativa
  let relativeLabel
  if (isOngoing) relativeLabel = 'Stai lavorando ora'
  else if (isToday(start)) relativeLabel = 'Oggi'
  else if (isTomorrow(start)) relativeLabel = 'Domani'
  else {
    const diffDays = Math.round((start - now) / (1000 * 60 * 60 * 24))
    if (diffDays <= 7) relativeLabel = `Tra ${diffDays} giorni`
    else relativeLabel = start.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })
  }

  // Countdown ore se è oggi
  let countdown = null
  if (isToday(start) && !isOngoing) {
    const hoursTo = (start - now) / (1000 * 60 * 60)
    if (hoursTo < 24) {
      const h = Math.floor(hoursTo)
      const m = Math.round((hoursTo - h) * 60)
      if (h === 0) countdown = `tra ${m} minuti`
      else countdown = `tra ${h}h ${m}m`
    }
  }

  const dateLabel = start.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const timeLabel = `${pad2(start.getHours())}:${pad2(start.getMinutes())} – ${pad2(end.getHours())}:${pad2(end.getMinutes())}`
  const durationMs = end - start
  const durationHours = (durationMs / 3600000).toFixed(1)

  return (
    <Link to="/planning"
      className="block bg-white rounded-2xl border border-cream-300 hover:border-terracotta-300 transition overflow-hidden group">
      <div className="flex">
        <div className="w-2 flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-block px-2.5 py-0.5 rounded-md font-sans text-[11px] uppercase tracking-wider font-semibold ${
              isOngoing
                ? 'bg-sage-100 text-sage-700'
                : isToday(start)
                ? 'bg-terracotta-100 text-terracotta-700'
                : 'bg-cream-200 text-warm-brown'
            }`}>
              {relativeLabel}
            </span>
            {countdown && (
              <span className="font-sans text-xs text-warm-brown">{countdown}</span>
            )}
          </div>
          <div className="flex items-baseline gap-3 mb-1">
            <h2 className="font-serif text-3xl text-warm-dark capitalize">{dateLabel}</h2>
          </div>
          <div className="flex items-center gap-3 font-sans text-warm-dark">
            <span className="text-xl tabular-nums">{timeLabel}</span>
            <span className="text-sm text-warm-brown">·</span>
            <span className="text-sm text-warm-brown">{durationHours}h</span>
            {shift.roles?.name && (
              <>
                <span className="text-sm text-warm-brown">·</span>
                <span className="font-sans text-sm font-semibold" style={{ color }}>
                  {shift.roles.name}
                </span>
              </>
            )}
          </div>
          {isOngoing && (
            <div className="mt-3 inline-flex items-center gap-1.5 font-sans text-xs text-sage-700">
              <span className="w-2 h-2 rounded-full bg-sage-500 animate-pulse" />
              Vai a Timbra per registrare l'uscita
            </div>
          )}
        </div>
        <div className="flex items-center pr-5">
          <ArrowRight size={18} className="text-warm-brown group-hover:translate-x-0.5 group-hover:text-terracotta-500 transition" />
        </div>
      </div>
    </Link>
  )
}

function MiniStat({ to, label, value, accent }) {
  let bg = 'bg-white border-cream-300'
  let valueColor = 'text-warm-dark'
  if (accent === 'amber') {
    bg = 'bg-amber-50 border-amber-200'
    valueColor = 'text-amber-700'
  } else if (accent === 'sage') {
    bg = 'bg-sage-50 border-sage-200'
    valueColor = 'text-sage-700'
  }
  return (
    <Link to={to}
      className={`block ${bg} border rounded-xl p-3 hover:shadow-sm transition`}>
      <div className="font-sans text-[11px] uppercase tracking-wider text-warm-brown mb-0.5">
        {label}
      </div>
      <div className={`font-serif text-2xl tabular-nums ${valueColor}`}>{value}</div>
    </Link>
  )
}

function WeekStrip({ weekStart, shifts }) {
  const days = []
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i))

  // Aggrega turni per giorno
  const shiftsByDay = new Map()
  for (const s of shifts) {
    const day = formatDateISO(new Date(s.start_at))
    if (!shiftsByDay.has(day)) shiftsByDay.set(day, [])
    shiftsByDay.get(day).push(s)
  }

  const today = new Date()

  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-xl text-warm-dark">La tua settimana</h3>
        <Link to="/planning" className="font-sans text-sm text-terracotta-600 hover:text-terracotta-700 transition">
          Apri planning →
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const iso = formatDateISO(day)
          const dayShifts = shiftsByDay.get(iso) || []
          const isCurrent = isToday(day)
          const isPast = day < today && !isCurrent
          return (
            <div key={iso}
              className={`relative rounded-xl p-2 min-h-[88px] border ${
                isCurrent
                  ? 'border-terracotta-300 bg-terracotta-50/40'
                  : isPast
                  ? 'border-cream-200 bg-cream-50/40 opacity-60'
                  : 'border-cream-200 bg-cream-50/30'
              }`}>
              <div className={`font-sans text-[10px] uppercase tracking-wider ${
                isCurrent ? 'text-terracotta-700 font-bold' : 'text-warm-brown'
              }`}>
                {day.toLocaleDateString('it-IT', { weekday: 'short' })}
              </div>
              <div className={`font-serif text-lg tabular-nums ${
                isCurrent ? 'text-terracotta-700 font-bold' : 'text-warm-dark'
              }`}>
                {day.getDate()}
              </div>
              <div className="space-y-1 mt-1">
                {dayShifts.slice(0, 2).map((s) => {
                  const start = new Date(s.start_at)
                  const end = new Date(s.end_at)
                  const color = s.roles?.color || '#C97D60'
                  return (
                    <div key={s.id}
                      className="rounded px-1 py-0.5 font-sans text-[9px] tabular-nums truncate"
                      style={{ backgroundColor: color + '22', color: color, borderLeft: `2px solid ${color}` }}>
                      {pad2(start.getHours())}:{pad2(start.getMinutes())}
                    </div>
                  )
                })}
                {dayShifts.length > 2 && (
                  <div className="font-sans text-[9px] text-warm-brown">+{dayShifts.length - 2}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UpcomingLeavesSection({ leaves }) {
  return (
    <div className="bg-sage-50 border border-sage-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Palmtree size={16} className="text-sage-700" />
        <h3 className="font-serif text-lg text-sage-900">Ferie in arrivo</h3>
      </div>
      <div className="space-y-2">
        {leaves.map((l) => {
          const start = new Date(l.start_date + 'T00:00:00')
          const end = new Date(l.end_date + 'T00:00:00')
          const dateLabel = l.start_date === l.end_date
            ? start.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
            : `${start.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} → ${end.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`
          const typeLabel = l.leave_type === 'vacation' ? 'Ferie' : l.leave_type === 'permission' ? 'Permesso' : l.leave_type === 'sick' ? 'Malattia' : l.leave_type
          return (
            <div key={l.id} className="flex items-center gap-3">
              <CheckCircle2 size={14} className="text-sage-600 flex-shrink-0" />
              <div className="font-sans text-sm text-sage-900 capitalize">
                <strong>{typeLabel}</strong> · {dateLabel}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UpcomingShiftsList({ shifts }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-lg text-warm-dark">Prossimi turni</h3>
        <Link to="/planning" className="font-sans text-sm text-terracotta-600 hover:text-terracotta-700 transition">
          Apri planning →
        </Link>
      </div>
      <div className="space-y-2">
        {shifts.map((s) => {
          const start = new Date(s.start_at)
          const end = new Date(s.end_at)
          const color = s.roles?.color || '#C97D60'
          let dateLabel
          if (isToday(start)) dateLabel = 'Oggi'
          else if (isTomorrow(start)) dateLabel = 'Domani'
          else dateLabel = start.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })
          return (
            <div key={s.id} className="flex items-center gap-3 py-2 border-b border-cream-100 last:border-0">
              <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: color }} />
              <div className="flex-1 min-w-0">
                <div className="font-sans text-sm font-semibold text-warm-dark capitalize">
                  {dateLabel}
                </div>
                <div className="font-sans text-xs text-warm-brown tabular-nums">
                  {pad2(start.getHours())}:{pad2(start.getMinutes())}–{pad2(end.getHours())}:{pad2(end.getMinutes())}
                  {s.roles?.name && ` · ${s.roles.name}`}
                </div>
              </div>
              {s.status === 'draft' && (
                <span className="font-sans text-[10px] uppercase tracking-wider text-warm-brown bg-cream-100 px-2 py-0.5 rounded">
                  Bozza
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PositiveBanner({ leave }) {
  const start = new Date(leave.start_date + 'T00:00:00')
  const dateLabel = start.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  const typeLabel = leave.leave_type === 'vacation' ? 'ferie' : leave.leave_type === 'permission' ? 'permesso' : leave.leave_type
  return (
    <div className="flex items-center gap-3 bg-sage-50 border border-sage-200 rounded-xl px-5 py-3">
      <Sparkles size={18} className="text-sage-600 flex-shrink-0" />
      <div className="font-sans text-sm text-sage-900 flex-1">
        Le tue <strong>{typeLabel}</strong> del {dateLabel} sono state approvate
      </div>
    </div>
  )
}

function KpiCard({ to, icon, label, value, ctaLabel, accent }) {
  const accentBorder = accent === 'amber' ? 'border-amber-300' : 'border-cream-300 hover:border-cream-400'
  return (
    <Link to={to}
      className={`block bg-white rounded-2xl border ${accentBorder} p-6 hover:shadow-sm transition group`}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-cream-100 flex items-center justify-center text-warm-brown">
          {icon}
        </div>
        <ArrowRight size={16} className="text-warm-brown group-hover:translate-x-0.5 transition" />
      </div>
      <div className="font-sans text-sm text-warm-brown mb-1">{label}</div>
      <div className="font-serif text-3xl text-warm-dark mb-1 tabular-nums">{value}</div>
      <div className="font-sans text-xs text-terracotta-600">{ctaLabel}</div>
    </Link>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function computeWorkedMs(entries, nowDate) {
  let total = 0
  let workStart = null
  const sorted = [...entries].sort((a, b) => a.event_time.localeCompare(b.event_time))
  for (const e of sorted) {
    let t = new Date(e.event_time)
    if (e.event_type === 'clock_in' || e.event_type === 'clock_out') {
      // Arrotondamento mezzo-ora
      const minutes = t.getMinutes()
      let rounded
      if (minutes < 15) rounded = 0
      else if (minutes < 45) rounded = 30
      else rounded = 60
      const r = new Date(t)
      r.setMinutes(rounded, 0, 0)
      t = r
    }
    if (e.event_type === 'clock_in') {
      if (workStart === null) workStart = t
    } else if (e.event_type === 'break_end') {
      if (workStart === null) workStart = t
    } else if (e.event_type === 'break_start' || e.event_type === 'clock_out') {
      if (workStart !== null) {
        if (t > workStart) total += t - workStart
        workStart = null
      }
    }
  }
  if (workStart) total += Math.max(0, nowDate - workStart)
  return Math.max(0, total)
}

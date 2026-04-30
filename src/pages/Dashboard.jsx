import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { startOfMonth, addMonths } from 'date-fns'
import { startOfWeek } from '../lib/dateUtils'
import { Calendar, Clock as ClockIcon, Palmtree, ArrowRight, AlertCircle } from 'lucide-react'

export default function Dashboard() {
  const { profile } = useAuth()
  const isManager = profile?.is_manager

  const [stats, setStats] = useState({
    shiftsThisWeek: null,
    hoursThisMonth: null,
    pendingLeaves: null,
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
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const monthStart = startOfMonth(now)
    const monthEnd = startOfMonth(addMonths(now, 1))

    const [shiftsRes, entriesRes, leavesRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('id', { count: 'exact', head: true })
        .eq('staff_id', profile.id)
        .gte('start_at', weekStart.toISOString())
        .lt('start_at', weekEnd.toISOString())
        .neq('status', 'cancelled'),

      supabase
        .from('time_entries')
        .select('event_time, event_type')
        .eq('staff_id', profile.id)
        .gte('event_time', monthStart.toISOString())
        .lt('event_time', monthEnd.toISOString())
        .order('event_time', { ascending: true }),

      isManager
        ? supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        : supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('staff_id', profile.id).eq('status', 'pending'),
    ])

    const hoursThisMonth = entriesRes.data
      ? computeWorkedMs(entriesRes.data, now) / 3600000
      : 0

    setStats({
      shiftsThisWeek: shiftsRes.count ?? 0,
      hoursThisMonth,
      pendingLeaves: leavesRes.count ?? 0,
    })
    setLoading(false)
  }

  return (
    <div>
      {/* Header benvenuto */}
      <div className="mb-8">
        <h1 className="text-4xl text-warm-dark mb-2">
          Ciao, {profile?.first_name} 👋
        </h1>
        <p className="text-warm-brown font-sans">
          Benvenuto nel pannello di gestione del Centro Padel San Miniato
        </p>
      </div>

      {/* Banner pending manager */}
      {isManager && stats.pendingLeaves > 0 && (
        <Link to="/leaves"
          className="flex items-center gap-3 bg-amber-50 border border-amber-300 hover:border-amber-400 rounded-xl px-5 py-3 mb-6 transition group">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
          <div className="font-sans text-sm text-amber-900 flex-1">
            <strong>{stats.pendingLeaves}</strong> {stats.pendingLeaves === 1 ? 'richiesta ferie' : 'richieste ferie'} in attesa di approvazione
          </div>
          <ArrowRight size={16} className="text-amber-700 group-hover:translate-x-0.5 transition" />
        </Link>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard
          to="/planning"
          icon={<Calendar size={18} />}
          label="I tuoi turni questa settimana"
          value={loading ? '—' : stats.shiftsThisWeek}
          ctaLabel="Vai al planning"
        />
        <KpiCard
          to="/clock"
          icon={<ClockIcon size={18} />}
          label="Ore lavorate (mese)"
          value={loading ? '—' : `${stats.hoursThisMonth.toFixed(1)}h`}
          ctaLabel="Vai a Timbra"
        />
        <KpiCard
          to="/leaves"
          icon={<Palmtree size={18} />}
          label={isManager ? 'Richieste da approvare' : 'Tue richieste in attesa'}
          value={loading ? '—' : stats.pendingLeaves}
          ctaLabel={isManager ? 'Gestisci richieste' : 'Vai alle ferie'}
          accent={stats.pendingLeaves > 0 ? 'amber' : null}
        />
      </div>

      {/* Profilo */}
      <div className="bg-white rounded-2xl border border-cream-300 p-6">
        <h2 className="text-xl text-warm-dark mb-4">Il tuo profilo</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 font-sans">
          <ProfileItem label="Nome" value={`${profile?.first_name || ''} ${profile?.last_name || ''}`} />
          <ProfileItem label="Email" value={profile?.email} className="break-all" />
          <ProfileItem label="Ruolo" value={
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full ring-2 ring-white"
                style={{ backgroundColor: profile?.role_color }} />
              <span className="text-warm-dark text-sm font-semibold">
                {profile?.role_name || '—'}
              </span>
            </div>
          } />
          <ProfileItem label="Tipo account" value={profile?.is_manager ? 'Manager' : 'Dipendente'} />
        </div>
      </div>
    </div>
  )
}

// ---- Sub components ----

function KpiCard({ to, icon, label, value, ctaLabel, accent }) {
  return (
    <Link to={to}
      className={`block bg-white rounded-2xl border p-6 hover:shadow-md transition group ${
        accent === 'amber' ? 'border-amber-300 bg-amber-50/30' : 'border-cream-300'
      }`}>
      <div className="flex items-center gap-2 text-warm-brown font-sans text-sm mb-2">
        <span className={accent === 'amber' ? 'text-amber-600' : 'text-warm-brown'}>{icon}</span>
        {label}
      </div>
      <div className={`text-4xl font-serif font-semibold mb-3 tabular-nums ${
        accent === 'amber' ? 'text-amber-700' : 'text-warm-dark'
      }`}>
        {value}
      </div>
      <div className="text-xs text-warm-brown/80 font-sans flex items-center gap-1 group-hover:text-warm-dark transition">
        {ctaLabel}
        <ArrowRight size={12} className="group-hover:translate-x-0.5 transition" />
      </div>
    </Link>
  )
}

function ProfileItem({ label, value, className = '' }) {
  return (
    <div>
      <div className="text-warm-brown text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-warm-dark text-sm font-semibold ${className}`}>{value || '—'}</div>
    </div>
  )
}

// ---- Helpers ----

function computeWorkedMs(entries, nowDate) {
  let total = 0
  let workStart = null
  for (const e of entries) {
    const t = new Date(e.event_time)
    if (e.event_type === 'clock_in' || e.event_type === 'break_end') {
      workStart = t
    } else if (e.event_type === 'break_start' || e.event_type === 'clock_out') {
      if (workStart) {
        total += t - workStart
        workStart = null
      }
    }
  }
  if (workStart) total += nowDate - workStart
  return Math.max(0, total)
}

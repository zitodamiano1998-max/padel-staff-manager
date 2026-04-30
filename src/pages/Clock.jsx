import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Play, Pause, Square, Coffee, MapPin, AlertTriangle, CheckCircle2, Clock as ClockIcon, Loader2,
} from 'lucide-react'

export default function Clock() {
  const { profile } = useAuth()

  const [settings, setSettings] = useState(null)
  const [todayEntries, setTodayEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [now, setNow] = useState(new Date())
  const [lastDistance, setLastDistance] = useState(null) // metri dal centro dopo l'ultima timbra

  // Tick orologio ogni secondo
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (profile?.id) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const fetchData = async () => {
    setLoading(true)
    const todayStart = startOfToday().toISOString()
    const [setRes, entRes] = await Promise.all([
      supabase.from('settings').select('*').limit(1).maybeSingle(),
      supabase
        .from('time_entries')
        .select('*')
        .eq('staff_id', profile.id)
        .gte('event_time', todayStart)
        .order('event_time', { ascending: true }),
    ])
    if (!setRes.error) setSettings(setRes.data)
    if (!entRes.error) setTodayEntries(entRes.data || [])
    setLoading(false)
  }

  // Stato corrente del dipendente oggi
  const state = useMemo(() => {
    if (todayEntries.length === 0) return 'not_started'
    const last = todayEntries[todayEntries.length - 1]
    if (last.event_type === 'clock_out') return 'between_shifts'
    if (last.event_type === 'break_start') return 'on_break'
    return 'working' // clock_in o break_end
  }, [todayEntries])

  const stateInfo = STATE_INFO[state]

  // Numero di turni iniziati oggi
  const shiftsCount = todayEntries.filter((e) => e.event_type === 'clock_in').length

  // Ore lavorate finora oggi (esclude pause)
  const workedMs = useMemo(() => computeWorkedMs(todayEntries, now), [todayEntries, now])
  const workedH = Math.floor(workedMs / 3600000)
  const workedM = Math.floor((workedMs % 3600000) / 60000)

  const handleClock = async (eventType) => {
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      // 1. Geolocalizzazione
      const pos = await getCurrentPosition()

      // 2. Calcola distanza in locale per anteprima
      let distance = null
      const lat = settings && settings.center_latitude !== null ? parseFloat(settings.center_latitude) : null
      const lng = settings && settings.center_longitude !== null ? parseFloat(settings.center_longitude) : null
      if (lat !== null && lng !== null) {
        distance = haversineMeters(pos.latitude, pos.longitude, lat, lng)
      }
      setLastDistance(distance)

      // 3. Geofence check (lato client; il trigger DB calcola di nuovo lato server)
      const radius = settings?.geofence_radius_meters || 150
      if (distance !== null && distance > radius) {
        throw new Error(
          `Sei a ${Math.round(distance)}m dal centro (raggio massimo ${radius}m). Avvicinati al centro per timbrare.`
        )
      }

      // 4. Insert
      const { error: insError } = await supabase.from('time_entries').insert({
        staff_id: profile.id,
        event_type: eventType,
        latitude: pos.latitude,
        longitude: pos.longitude,
        gps_accuracy: pos.accuracy,
        device_info: navigator.userAgent.substring(0, 200),
      })
      if (insError) throw insError

      setSuccess(SUCCESS_MSGS[eventType] || 'Timbrato')
      setTimeout(() => setSuccess(null), 3500)
      await fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-3xl text-warm-dark mb-1">Ciao, {profile?.first_name}</h1>
        <p className="font-sans text-sm text-warm-brown capitalize">
          {now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Card principale */}
      <div className="bg-white rounded-3xl border border-cream-300 shadow-sm p-8">
        {/* Orologio */}
        <div className="text-center mb-6">
          <div className="font-serif text-6xl text-warm-dark tracking-tight tabular-nums">
            {now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="font-sans text-sm text-warm-brown/60 tabular-nums mt-1">
            {String(now.getSeconds()).padStart(2, '0')} sec
          </div>
        </div>

        {/* Stato corrente */}
        <div className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl mb-6 ${stateInfo.bgClass}`}>
          <stateInfo.Icon size={18} className={stateInfo.iconClass} />
          <span className={`font-sans font-semibold text-sm ${stateInfo.textClass}`}>
            {stateInfo.label}
          </span>
        </div>

        {/* Statistiche */}
        {state !== 'not_started' && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-cream-50 rounded-xl px-3 py-3 text-center">
              <div className="font-sans text-[10px] text-warm-brown uppercase tracking-wider">Ore oggi</div>
              <div className="font-serif text-xl text-warm-dark tabular-nums mt-0.5">
                {workedH}h {String(workedM).padStart(2, '0')}m
              </div>
            </div>
            <div className="bg-cream-50 rounded-xl px-3 py-3 text-center">
              <div className="font-sans text-[10px] text-warm-brown uppercase tracking-wider">Turni</div>
              <div className="font-serif text-xl text-warm-dark tabular-nums mt-0.5">
                {shiftsCount}
              </div>
            </div>
            <div className="bg-cream-50 rounded-xl px-3 py-3 text-center">
              <div className="font-sans text-[10px] text-warm-brown uppercase tracking-wider">Inizio</div>
              <div className="font-serif text-xl text-warm-dark tabular-nums mt-0.5">
                {firstClockInTime(todayEntries) || '—'}
              </div>
            </div>
          </div>
        )}

        {/* Bottoni azione */}
        {loading ? (
          <div className="text-center py-6 text-warm-brown font-sans">Caricamento...</div>
        ) : (
          <div className="space-y-3">
            {ACTIONS_BY_STATE[state].map((a) => (
              <button key={a.event}
                onClick={() => handleClock(a.event)}
                disabled={submitting}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-sans font-semibold text-base transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                  a.variant === 'primary'
                    ? 'bg-terracotta-400 hover:bg-terracotta-500 text-white'
                    : a.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-cream-100 hover:bg-cream-200 text-warm-dark border border-cream-300'
                }`}>
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <a.Icon size={18} />}
                {submitting ? 'Verifica posizione...' : a.label}
              </button>
            ))}
          </div>
        )}

        {/* Feedback */}
        {error && (
          <div className="mt-5 bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="font-sans text-sm text-red-800">{error}</div>
            </div>
          </div>
        )}
        {success && (
          <div className="mt-5 bg-sage-50 border-2 border-sage-300 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-sage-500" />
              <div className="font-sans text-sm font-semibold text-sage-700">{success}</div>
            </div>
            {lastDistance !== null && (
              <div className="font-sans text-xs text-sage-700/80 mt-1 ml-6">
                Posizione verificata · {Math.round(lastDistance)}m dal centro
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timeline eventi di oggi */}
      {todayEntries.length > 0 && (
        <div className="bg-white rounded-2xl border border-cream-300 mt-4 p-5">
          <div className="font-serif text-lg text-warm-dark mb-3">Eventi di oggi</div>
          <div className="space-y-2">
            {todayEntries.map((e) => (
              <EventRow key={e.id} entry={e} />
            ))}
          </div>
        </div>
      )}

      {/* Info geofence */}
      {settings?.center_name && (
        <div className="text-center mt-4 font-sans text-xs text-warm-brown/60">
          <MapPin size={11} className="inline mr-0.5" />
          {settings.center_name} · raggio {settings.geofence_radius_meters || 150}m
        </div>
      )}
    </div>
  )
}

// ---- Sub components ----

function EventRow({ entry }) {
  const t = new Date(entry.event_time)
  const cfg = EVENT_CONFIG[entry.event_type] || EVENT_CONFIG.clock_in
  const distance = entry.distance_from_center !== null ? Math.round(parseFloat(entry.distance_from_center)) : null
  return (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
        <cfg.Icon size={14} className={cfg.fg} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-sans text-sm font-semibold text-warm-dark">{cfg.label}</div>
        <div className="font-sans text-xs text-warm-brown">
          {t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          {distance !== null && ` · ${distance}m dal centro`}
          {entry.is_within_geofence === false && (
            <span className="ml-1 text-red-600 font-semibold">⚠ fuori area</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Helpers ----

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalizzazione non supportata da questo browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy: p.coords.accuracy,
      }),
      (err) => {
        const msgs = {
          1: 'Permesso posizione negato. Attivalo dalle impostazioni del browser e riprova.',
          2: 'Posizione non disponibile (GPS spento?).',
          3: 'Timeout: GPS non ottenuto in tempo. Riprova all\'aperto.',
        }
        reject(new Error(msgs[err.code] || `Errore GPS: ${err.message}`))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  })
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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

function firstClockInTime(entries) {
  const first = entries.find((e) => e.event_type === 'clock_in')
  if (!first) return null
  return new Date(first.event_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

// ---- Config tabelle ----

const STATE_INFO = {
  not_started: {
    label: 'Pronto a iniziare',
    Icon: ClockIcon,
    bgClass: 'bg-cream-100',
    iconClass: 'text-warm-brown',
    textClass: 'text-warm-dark',
  },
  working: {
    label: 'In servizio',
    Icon: Play,
    bgClass: 'bg-sage-50 border border-sage-200',
    iconClass: 'text-sage-600',
    textClass: 'text-sage-700',
  },
  on_break: {
    label: 'In pausa',
    Icon: Coffee,
    bgClass: 'bg-amber-50 border border-amber-200',
    iconClass: 'text-amber-600',
    textClass: 'text-amber-700',
  },
  between_shifts: {
    label: 'Ultimo turno chiuso · pronto per il prossimo',
    Icon: CheckCircle2,
    bgClass: 'bg-cream-100 border border-cream-300',
    iconClass: 'text-warm-brown',
    textClass: 'text-warm-dark',
  },
}

const ACTIONS_BY_STATE = {
  not_started: [
    { event: 'clock_in', label: 'Inizia turno', Icon: Play, variant: 'primary' },
  ],
  working: [
    { event: 'clock_out', label: 'Termina turno', Icon: Square, variant: 'danger' },
    { event: 'break_start', label: 'Inizia pausa', Icon: Coffee, variant: 'secondary' },
  ],
  on_break: [
    { event: 'break_end', label: 'Riprendi servizio', Icon: Play, variant: 'primary' },
  ],
  between_shifts: [
    { event: 'clock_in', label: 'Inizia nuovo turno', Icon: Play, variant: 'primary' },
  ],
}

const SUCCESS_MSGS = {
  clock_in: 'Turno iniziato',
  clock_out: 'Turno terminato',
  break_start: 'Pausa iniziata',
  break_end: 'Pausa terminata',
}

const EVENT_CONFIG = {
  clock_in: { label: 'Inizio turno', Icon: Play, bg: 'bg-sage-100', fg: 'text-sage-700' },
  clock_out: { label: 'Fine turno', Icon: Square, bg: 'bg-red-100', fg: 'text-red-700' },
  break_start: { label: 'Inizio pausa', Icon: Coffee, bg: 'bg-amber-100', fg: 'text-amber-700' },
  break_end: { label: 'Fine pausa', Icon: Play, bg: 'bg-sage-100', fg: 'text-sage-700' },
}

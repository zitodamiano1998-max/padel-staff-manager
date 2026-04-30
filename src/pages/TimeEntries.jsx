import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { startOfWeek, weekDays, formatDateISO } from '../lib/dateUtils'
import { addDays, subDays, format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import TimeEntryFormModal from '../components/TimeEntryFormModal'
import {
  ChevronLeft, ChevronRight, Plus, ChevronDown, ChevronUp,
  Play, Square, Coffee, AlertTriangle, MapPin, Pencil, Trash2, Hand,
} from 'lucide-react'

export default function TimeEntries() {
  const { profile } = useAuth()
  const isManager = profile?.is_manager

  // Range
  const [rangeMode, setRangeMode] = useState('week') // 'week' | 'month'
  const [rangeStart, setRangeStart] = useState(() => startOfWeek(new Date()))
  const [filterStaffId, setFilterStaffId] = useState('')

  // Data
  const [staff, setStaff] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())
  const [error, setError] = useState(null)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [presetStaffId, setPresetStaffId] = useState('')

  // Range computato
  const range = useMemo(() => {
    if (rangeMode === 'week') {
      return { start: rangeStart, end: addDays(rangeStart, 7) }
    }
    // month: dal 1° del mese al 1° del mese successivo
    const d = new Date(rangeStart)
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    return { start, end }
  }, [rangeMode, rangeStart])

  useEffect(() => {
    if (isManager) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, isManager])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    const startISO = range.start.toISOString()
    const endISO = range.end.toISOString()
    const [staffRes, entRes] = await Promise.all([
      supabase
        .from('staff_members')
        .select('id, first_name, last_name, role_id, is_manager, roles(id, name, color)')
        .eq('is_active', true)
        .order('first_name'),
      supabase
        .from('time_entries')
        .select('*')
        .gte('event_time', startISO)
        .lt('event_time', endISO)
        .order('event_time'),
    ])
    if (staffRes.error) setError(staffRes.error.message)
    else setStaff(staffRes.data || [])
    if (entRes.error) setError(entRes.error.message)
    else setEntries(entRes.data || [])
    setLoading(false)
  }

  // Aggregazione per staff: { staffId -> { workMs, days: Map<dateISO, {workMs, hasOpenShift, events[]}>, totalEvents, outOfArea } }
  const aggregateByStaff = useMemo(() => {
    const result = new Map()

    // Raggruppa entries per staff
    const byStaff = new Map()
    for (const e of entries) {
      if (!byStaff.has(e.staff_id)) byStaff.set(e.staff_id, [])
      byStaff.get(e.staff_id).push(e)
    }

    for (const [staffId, events] of byStaff) {
      // Già ordinati dalla query
      const days = new Map() // dateISO -> { workMs, hasOpenShift, events }
      let workStart = null
      let cycleDateISO = null
      let segments = []

      const ensureDay = (dateISO) => {
        if (!days.has(dateISO)) days.set(dateISO, { workMs: 0, hasOpenShift: false, events: [] })
        return days.get(dateISO)
      }

      for (const e of events) {
        const t = new Date(e.event_time)
        const eDateISO = formatDateISO(t)
        ensureDay(eDateISO).events.push(e)

        if (e.event_type === 'clock_in') {
          workStart = t
          cycleDateISO = eDateISO
          segments = []
        } else if (e.event_type === 'break_start') {
          if (workStart) {
            segments.push({ start: workStart, end: t })
            workStart = null
          }
        } else if (e.event_type === 'break_end') {
          workStart = t
        } else if (e.event_type === 'clock_out') {
          if (workStart) {
            segments.push({ start: workStart, end: t })
            workStart = null
          }
          // Somma il ciclo al giorno del clock_in
          if (cycleDateISO) {
            let cycleMs = 0
            for (const s of segments) cycleMs += s.end - s.start
            ensureDay(cycleDateISO).workMs += cycleMs
            cycleDateISO = null
            segments = []
          }
        }
      }

      // Ciclo aperto a fine intervallo
      if (workStart && cycleDateISO) {
        ensureDay(cycleDateISO).hasOpenShift = true
      }

      // Totali per staff
      let totalMs = 0
      let outOfArea = 0
      let openShifts = 0
      for (const day of days.values()) {
        totalMs += day.workMs
        if (day.hasOpenShift) openShifts++
      }
      for (const e of events) {
        if (e.is_within_geofence === false) outOfArea++
      }

      result.set(staffId, {
        workMs: totalMs,
        days,
        totalEvents: events.length,
        outOfArea,
        openShifts,
        daysCount: days.size,
      })
    }
    return result
  }, [entries])

  // Filtra staff visibili
  const visibleStaff = useMemo(() => {
    return staff.filter((s) => {
      if (filterStaffId && s.id !== filterStaffId) return false
      return true
    })
  }, [staff, filterStaffId])

  // Stats globali
  const globalStats = useMemo(() => {
    let totalMs = 0
    let totalEvents = 0
    let outOfArea = 0
    let openShifts = 0
    for (const [, agg] of aggregateByStaff) {
      totalMs += agg.workMs
      totalEvents += agg.totalEvents
      outOfArea += agg.outOfArea
      openShifts += agg.openShifts
    }
    return { totalMs, totalEvents, outOfArea, openShifts }
  }, [aggregateByStaff])

  const toggleExpanded = (staffId) => {
    const next = new Set(expanded)
    if (next.has(staffId)) next.delete(staffId)
    else next.add(staffId)
    setExpanded(next)
  }

  const goPrev = () => {
    if (rangeMode === 'week') setRangeStart(subDays(rangeStart, 7))
    else {
      const d = new Date(rangeStart)
      setRangeStart(new Date(d.getFullYear(), d.getMonth() - 1, 1))
    }
  }
  const goNext = () => {
    if (rangeMode === 'week') setRangeStart(addDays(rangeStart, 7))
    else {
      const d = new Date(rangeStart)
      setRangeStart(new Date(d.getFullYear(), d.getMonth() + 1, 1))
    }
  }
  const goToday = () => {
    if (rangeMode === 'week') setRangeStart(startOfWeek(new Date()))
    else {
      const t = new Date()
      setRangeStart(new Date(t.getFullYear(), t.getMonth(), 1))
    }
  }

  const handleAdd = () => {
    setEditingEntry(null)
    setPresetStaffId(filterStaffId || '')
    setModalOpen(true)
  }

  const handleEdit = (entry) => {
    setEditingEntry(entry)
    setPresetStaffId('')
    setModalOpen(true)
  }

  const handleDelete = async (entry) => {
    if (!confirm('Eliminare questa timbratura? L\'azione è irreversibile.')) return
    const { error } = await supabase.from('time_entries').delete().eq('id', entry.id)
    if (error) setError(error.message)
    else fetchData()
  }

  if (!isManager) {
    return (
      <div className="bg-white rounded-2xl border border-cream-300 p-8 text-center">
        <p className="font-sans text-warm-brown">Pagina riservata ai manager.</p>
      </div>
    )
  }

  // Range label
  const rangeLabel = rangeMode === 'week'
    ? `${format(range.start, 'd MMM', { locale: it })} → ${format(addDays(range.end, -1), 'd MMM yyyy', { locale: it })}`
    : format(range.start, 'MMMM yyyy', { locale: it })

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl text-warm-dark mb-1">Timbrature</h1>
          <p className="text-warm-brown font-sans text-sm capitalize">{rangeLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Range toggle */}
          <div className="flex bg-cream-200 rounded-xl p-1">
            <button onClick={() => setRangeMode('week')}
              className={`px-3 py-1.5 rounded-lg font-sans text-sm font-semibold transition ${
                rangeMode === 'week' ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown hover:text-warm-dark'
              }`}>Settimana</button>
            <button onClick={() => setRangeMode('month')}
              className={`px-3 py-1.5 rounded-lg font-sans text-sm font-semibold transition ${
                rangeMode === 'month' ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown hover:text-warm-dark'
              }`}>Mese</button>
          </div>

          {/* Nav */}
          <button onClick={goPrev} className="p-2 rounded-xl border border-cream-300 hover:bg-cream-100 text-warm-dark transition">
            <ChevronLeft size={18} />
          </button>
          <button onClick={goToday} className="px-3 py-2 rounded-xl border border-cream-300 hover:bg-cream-100 text-warm-dark font-sans text-sm font-semibold transition">
            Oggi
          </button>
          <button onClick={goNext} className="p-2 rounded-xl border border-cream-300 hover:bg-cream-100 text-warm-dark transition">
            <ChevronRight size={18} />
          </button>

          <div className="w-px h-6 bg-cream-300 mx-1" />

          <button onClick={handleAdd}
            className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm">
            <Plus size={16} /> Aggiungi
          </button>
        </div>
      </div>

      {/* Filtro dipendente */}
      <div className="mb-4 flex items-center gap-3">
        <select value={filterStaffId} onChange={(e) => setFilterStaffId(e.target.value)}
          className="px-4 py-2 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 transition">
          <option value="">Tutti i dipendenti</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
          ))}
        </select>
      </div>

      {/* Stats globali */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatBox label="Ore totali" value={fmtHours(globalStats.totalMs)} />
        <StatBox label="Eventi" value={globalStats.totalEvents} />
        <StatBox label="Fuori area" value={globalStats.outOfArea} accent={globalStats.outOfArea > 0 ? 'amber' : null} />
        <StatBox label="Turni aperti" value={globalStats.openShifts} accent={globalStats.openShifts > 0 ? 'red' : null} />
      </div>

      {error && (
        <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm mb-4">
          {error}
        </div>
      )}

      {/* Cards dipendenti */}
      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
      ) : visibleStaff.length === 0 ? (
        <div className="bg-white rounded-2xl border border-cream-300 p-8 text-center font-sans text-warm-brown">
          Nessun dipendente attivo.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleStaff.map((s) => {
            const agg = aggregateByStaff.get(s.id) || { workMs: 0, days: new Map(), totalEvents: 0, outOfArea: 0, openShifts: 0, daysCount: 0 }
            const isExpanded = expanded.has(s.id)
            return (
              <StaffCard key={s.id}
                staff={s}
                agg={agg}
                isExpanded={isExpanded}
                onToggle={() => toggleExpanded(s.id)}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )
          })}
        </div>
      )}

      {modalOpen && (
        <TimeEntryFormModal
          entry={editingEntry}
          presetStaffId={presetStaffId}
          staff={staff}
          onClose={() => { setModalOpen(false); setEditingEntry(null) }}
          onSaved={() => { setModalOpen(false); setEditingEntry(null); fetchData() }}
        />
      )}
    </div>
  )
}

// ---- Sub components ----

function StatBox({ label, value, accent }) {
  const accentClass = accent === 'amber'
    ? 'border-amber-300 bg-amber-50/30'
    : accent === 'red'
    ? 'border-red-300 bg-red-50/30'
    : 'border-cream-300'
  return (
    <div className={`bg-white rounded-2xl border p-5 ${accentClass}`}>
      <div className="text-warm-brown font-sans text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl text-warm-dark font-serif font-semibold">{value}</div>
    </div>
  )
}

function StaffCard({ staff, agg, isExpanded, onToggle, onEdit, onDelete }) {
  const color = staff.roles?.color || '#C97D60'
  const dayKeys = Array.from(agg.days.keys()).sort().reverse()

  return (
    <div className="bg-white rounded-2xl border border-cream-300 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 hover:bg-cream-50 transition text-left">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-serif font-semibold flex-shrink-0"
          style={{ backgroundColor: color }}>
          {staff.first_name?.[0]}{staff.last_name?.[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-sans font-semibold text-warm-dark truncate">
            {staff.first_name} {staff.last_name}
          </div>
          <div className="font-sans text-xs text-warm-brown truncate">
            {staff.roles?.name || '—'}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <div className="font-serif text-2xl text-warm-dark tabular-nums">
              {fmtHours(agg.workMs)}
            </div>
            <div className="font-sans text-xs text-warm-brown">
              {agg.daysCount} {agg.daysCount === 1 ? 'giorno' : 'giorni'}
            </div>
          </div>
          {agg.outOfArea > 0 && (
            <div className="bg-amber-100 text-amber-700 rounded-lg px-2 py-1 flex items-center gap-1 font-sans text-xs font-semibold"
              title="Eventi fuori area">
              <AlertTriangle size={12} /> {agg.outOfArea}
            </div>
          )}
          {agg.openShifts > 0 && (
            <div className="bg-red-100 text-red-700 rounded-lg px-2 py-1 font-sans text-xs font-semibold"
              title="Turni non chiusi (manca clock_out)">
              {agg.openShifts} {agg.openShifts === 1 ? 'aperto' : 'aperti'}
            </div>
          )}
          {isExpanded ? <ChevronUp size={18} className="text-warm-brown" /> : <ChevronDown size={18} className="text-warm-brown" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-cream-200 bg-cream-50/50">
          {dayKeys.length === 0 ? (
            <div className="p-6 text-center font-sans text-sm text-warm-brown">
              Nessuna timbratura nel periodo.
            </div>
          ) : (
            <div className="divide-y divide-cream-200">
              {dayKeys.map((dateISO) => {
                const day = agg.days.get(dateISO)
                return (
                  <DayBlock key={dateISO}
                    dateISO={dateISO}
                    day={day}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DayBlock({ dateISO, day, onEdit, onDelete }) {
  const date = parseISO(dateISO)
  const sorted = [...day.events].sort((a, b) => a.event_time.localeCompare(b.event_time))
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-sans text-sm font-semibold text-warm-dark capitalize">
          {format(date, 'EEEE d MMMM', { locale: it })}
        </div>
        <div className="flex items-center gap-2">
          {day.hasOpenShift && (
            <span className="bg-red-100 text-red-700 rounded-lg px-2 py-0.5 font-sans text-xs font-semibold">
              Turno aperto
            </span>
          )}
          <span className="font-sans text-sm text-warm-brown tabular-nums">{fmtHours(day.workMs)}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {sorted.map((e) => (
          <EventRow key={e.id} entry={e} onEdit={() => onEdit(e)} onDelete={() => onDelete(e)} />
        ))}
      </div>
    </div>
  )
}

function EventRow({ entry, onEdit, onDelete }) {
  const cfg = EVENT_CONFIG[entry.event_type] || EVENT_CONFIG.clock_in
  const t = new Date(entry.event_time)
  const isManual = entry.latitude === null || entry.latitude === undefined
  const distance = entry.distance_from_center !== null && entry.distance_from_center !== undefined
    ? Math.round(parseFloat(entry.distance_from_center))
    : null

  return (
    <div className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-cream-200">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
        <cfg.Icon size={13} className={cfg.fg} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-sans text-sm font-semibold text-warm-dark">
          {cfg.label}{' '}
          <span className="font-normal text-warm-brown tabular-nums">
            {t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="font-sans text-xs text-warm-brown flex items-center gap-2 flex-wrap">
          {isManual ? (
            <span className="inline-flex items-center gap-1 bg-cream-200 text-warm-dark px-1.5 py-0.5 rounded text-[10px] font-semibold">
              <Hand size={9} /> MANUALE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} /> {distance !== null ? `${distance}m` : '—'}
              {entry.is_within_geofence === false && (
                <span className="text-red-600 font-semibold">⚠ fuori area</span>
              )}
            </span>
          )}
          {entry.notes && <span className="italic">"{entry.notes}"</span>}
        </div>
      </div>
      <button onClick={onEdit}
        className="p-1.5 rounded-lg hover:bg-cream-200 text-warm-brown hover:text-warm-dark transition"
        title="Modifica">
        <Pencil size={13} />
      </button>
      <button onClick={onDelete}
        className="p-1.5 rounded-lg hover:bg-terracotta-50 text-terracotta-700 transition"
        title="Elimina">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ---- Helpers ----

function fmtHours(ms) {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

const EVENT_CONFIG = {
  clock_in: { label: 'Inizio turno', Icon: Play, bg: 'bg-sage-100', fg: 'text-sage-700' },
  clock_out: { label: 'Fine turno', Icon: Square, bg: 'bg-red-100', fg: 'text-red-700' },
  break_start: { label: 'Inizio pausa', Icon: Coffee, bg: 'bg-amber-100', fg: 'text-amber-700' },
  break_end: { label: 'Fine pausa', Icon: Play, bg: 'bg-sage-100', fg: 'text-sage-700' },
}

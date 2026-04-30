import { useState, useEffect, useMemo } from 'react'
import { startOfMonth, endOfMonth, addDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import {
  startOfWeek, weekDays, formatDateISO, formatDayLong,
} from '../lib/dateUtils'
import TimeEntryFormModal from '../components/TimeEntryFormModal'
import {
  Calendar, ChevronDown, ChevronUp, Edit, Trash2, Plus, AlertTriangle,
  Play, Square, Coffee, Clock as ClockIcon, MapPin,
} from 'lucide-react'

export default function Timesheets() {
  const [rangeMode, setRangeMode] = useState('week') // 'week' | 'month' | 'custom'
  const [customStart, setCustomStart] = useState(formatDateISO(new Date()))
  const [customEnd, setCustomEnd] = useState(formatDateISO(new Date()))
  const [filterStaffId, setFilterStaffId] = useState('') // '' = tutti

  const [staff, setStaff] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())

  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [toast, setToast] = useState(null)

  // Range calcolato in base al mode
  const range = useMemo(() => {
    if (rangeMode === 'week') {
      const ws = startOfWeek(new Date())
      return { start: ws, end: addDays(ws, 7) }
    }
    if (rangeMode === 'month') {
      const ms = startOfMonth(new Date())
      const me = addDays(endOfMonth(new Date()), 1)
      me.setHours(0, 0, 0, 0)
      return { start: ms, end: me }
    }
    // custom: dal customStart 00:00 al customEnd+1 00:00 (inclusivo del giorno end)
    const cs = new Date(customStart + 'T00:00:00')
    const ce = new Date(customEnd + 'T00:00:00')
    ce.setDate(ce.getDate() + 1)
    return { start: cs, end: ce }
  }, [rangeMode, customStart, customEnd])

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.toISOString(), range.end.toISOString()])

  const fetchData = async () => {
    setLoading(true)
    const [staffRes, entRes] = await Promise.all([
      supabase
        .from('staff_members')
        .select('id, first_name, last_name, roles(id, name, color)')
        .eq('is_active', true)
        .order('first_name'),
      supabase
        .from('time_entries')
        .select('*, staff_members!time_entries_staff_id_fkey(id, first_name, last_name, roles(name, color))')
        .gte('event_time', range.start.toISOString())
        .lt('event_time', range.end.toISOString())
        .order('event_time', { ascending: true }),
    ])
    if (!staffRes.error) setStaff(staffRes.data || [])
    if (!entRes.error) setEntries(entRes.data || [])
    setLoading(false)
  }

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  // Filtraggio per dipendente
  const filteredEntries = useMemo(() => {
    if (!filterStaffId) return entries
    return entries.filter((e) => e.staff_id === filterStaffId)
  }, [entries, filterStaffId])

  // Raggruppa per staff_id
  const entriesByStaff = useMemo(() => {
    const map = new Map()
    filteredEntries.forEach((e) => {
      if (!map.has(e.staff_id)) map.set(e.staff_id, [])
      map.get(e.staff_id).push(e)
    })
    return map
  }, [filteredEntries])

  // Stats globali
  const globalStats = useMemo(() => {
    let totalMs = 0
    let outsideCount = 0
    const activeStaff = new Set()
    for (const [sid, list] of entriesByStaff) {
      activeStaff.add(sid)
      totalMs += computeWorkedMs(list, new Date())
      list.forEach((e) => {
        if (e.is_within_geofence === false) outsideCount++
      })
    }
    return {
      totalHours: totalMs / 3600000,
      activeStaff: activeStaff.size,
      outsideCount,
    }
  }, [entriesByStaff])

  // Calcola riepilogo per dipendente
  const staffSummaries = useMemo(() => {
    const list = []
    for (const s of staff) {
      const sEntries = entriesByStaff.get(s.id) || []
      if (sEntries.length === 0 && filterStaffId !== s.id) continue
      const totalMs = computeWorkedMs(sEntries, new Date())
      const days = new Set(sEntries.map((e) => formatDateISO(new Date(e.event_time))))
      const outside = sEntries.filter((e) => e.is_within_geofence === false).length
      list.push({
        staff: s,
        entries: sEntries,
        totalHours: totalMs / 3600000,
        daysWorked: days.size,
        outsideCount: outside,
      })
    }
    // Ordina: chi ha più ore in cima, poi i restanti
    list.sort((a, b) => b.totalHours - a.totalHours)
    return list
  }, [staff, entriesByStaff, filterStaffId])

  const toggleExpand = (staffId) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(staffId)) next.delete(staffId)
      else next.add(staffId)
      return next
    })
  }

  const handleEdit = (entry) => {
    setEditingEntry(entry)
    setModalOpen(true)
  }

  const handleNew = () => {
    setEditingEntry(null)
    setModalOpen(true)
  }

  const handleDelete = async (entry) => {
    if (!confirm('Eliminare questa timbratura?')) return
    const { error } = await supabase.from('time_entries').delete().eq('id', entry.id)
    if (error) showToast('Errore: ' + error.message, 'error')
    else {
      showToast('Timbratura eliminata')
      fetchData()
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl text-warm-dark mb-1">Timbrature</h1>
          <p className="font-sans text-sm text-warm-brown">
            Riepilogo ore lavorate dal team. Solo per manager.
          </p>
        </div>
        <button onClick={handleNew}
          className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm flex-shrink-0">
          <Plus size={16} /> Aggiungi timbratura
        </button>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex bg-cream-200 rounded-xl p-1">
          {[
            { v: 'week', label: 'Settimana' },
            { v: 'month', label: 'Mese' },
            { v: 'custom', label: 'Custom' },
          ].map((opt) => (
            <button key={opt.v} onClick={() => setRangeMode(opt.v)}
              className={`px-3 py-1.5 rounded-lg font-sans text-sm font-semibold transition ${
                rangeMode === opt.v ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown hover:text-warm-dark'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {rangeMode === 'custom' && (
          <>
            <input type="date" value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-2 rounded-xl border border-cream-300 bg-white font-sans text-sm focus:outline-none focus:border-terracotta-400 transition" />
            <span className="font-sans text-sm text-warm-brown">→</span>
            <input type="date" value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-2 rounded-xl border border-cream-300 bg-white font-sans text-sm focus:outline-none focus:border-terracotta-400 transition" />
          </>
        )}

        <select value={filterStaffId} onChange={(e) => setFilterStaffId(e.target.value)}
          className="px-3 py-2 rounded-xl border border-cream-300 bg-white font-sans text-sm focus:outline-none focus:border-terracotta-400 transition">
          <option value="">Tutti i dipendenti</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatBox label="Ore totali" value={globalStats.totalHours.toFixed(1)} />
        <StatBox label="Dipendenti attivi" value={globalStats.activeStaff} />
        <StatBox label="Eventi fuori area"
          value={globalStats.outsideCount}
          accent={globalStats.outsideCount > 0 ? 'red' : null} />
      </div>

      {/* Lista dipendenti */}
      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
      ) : staffSummaries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-cream-300 p-12 text-center">
          <ClockIcon size={32} className="mx-auto mb-3 text-warm-brown/40" />
          <p className="font-sans text-warm-brown text-sm">
            Nessuna timbratura nel periodo selezionato.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {staffSummaries.map((sum) => (
            <StaffCard key={sum.staff.id}
              summary={sum}
              expanded={expanded.has(sum.staff.id)}
              onToggle={() => toggleExpand(sum.staff.id)}
              onEdit={handleEdit}
              onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <TimeEntryFormModal
          entry={editingEntry}
          staff={staff}
          onClose={() => { setModalOpen(false); setEditingEntry(null) }}
          onSaved={(msg) => {
            setModalOpen(false)
            setEditingEntry(null)
            fetchData()
            showToast(msg || 'Timbratura salvata')
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg font-sans text-sm z-50 ${
          toast.kind === 'error' ? 'bg-terracotta-600 text-white' : 'bg-sage-500 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ---- Sub components ----

function StatBox({ label, value, accent }) {
  return (
    <div className={`bg-white rounded-2xl border p-5 ${
      accent === 'red' ? 'border-red-300 bg-red-50/30' : 'border-cream-300'
    }`}>
      <div className="text-warm-brown font-sans text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-3xl font-serif font-semibold ${accent === 'red' ? 'text-red-700' : 'text-warm-dark'}`}>
        {value}
      </div>
    </div>
  )
}

function StaffCard({ summary, expanded, onToggle, onEdit, onDelete }) {
  const { staff, entries, totalHours, daysWorked, outsideCount } = summary
  const color = staff.roles?.color || '#C97D60'
  const h = Math.floor(totalHours)
  const m = Math.round((totalHours - h) * 60)

  // Raggruppa per giorno
  const byDay = useMemo(() => {
    const map = new Map()
    entries.forEach((e) => {
      const day = formatDateISO(new Date(e.event_time))
      if (!map.has(day)) map.set(day, [])
      map.get(day).push(e)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [entries])

  return (
    <div className="bg-white rounded-2xl border border-cream-300 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 hover:bg-cream-50 transition text-left">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-serif font-semibold text-base flex-shrink-0"
          style={{ backgroundColor: color }}>
          {staff.first_name?.[0]}{staff.last_name?.[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-sans font-semibold text-warm-dark">
            {staff.first_name} {staff.last_name}
          </div>
          <div className="font-sans text-xs text-warm-brown">{staff.roles?.name || '—'}</div>
        </div>
        <div className="hidden sm:flex items-center gap-6 mr-2">
          <div className="text-right">
            <div className="font-serif text-2xl text-warm-dark tabular-nums">
              {h}h {String(m).padStart(2, '0')}m
            </div>
            <div className="font-sans text-xs text-warm-brown">ore lavorate</div>
          </div>
          <div className="text-right">
            <div className="font-serif text-2xl text-warm-dark">{daysWorked}</div>
            <div className="font-sans text-xs text-warm-brown">{daysWorked === 1 ? 'giorno' : 'giorni'}</div>
          </div>
          {outsideCount > 0 && (
            <div className="flex items-center gap-1 text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
              <AlertTriangle size={14} />
              <span className="font-sans text-xs font-semibold">{outsideCount} fuori area</span>
            </div>
          )}
        </div>
        {expanded ? <ChevronUp size={18} className="text-warm-brown flex-shrink-0" /> : <ChevronDown size={18} className="text-warm-brown flex-shrink-0" />}
      </button>

      {/* Riassunto mobile */}
      <div className="sm:hidden px-4 pb-3 -mt-1 flex items-center gap-4 font-sans text-xs text-warm-brown">
        <span><strong className="text-warm-dark">{h}h {String(m).padStart(2, '0')}m</strong> · {daysWorked}g</span>
        {outsideCount > 0 && (
          <span className="text-red-700 font-semibold">⚠ {outsideCount} fuori area</span>
        )}
      </div>

      {expanded && (
        <div className="border-t border-cream-200 bg-cream-50/50">
          {byDay.length === 0 ? (
            <div className="p-6 text-center font-sans text-sm text-warm-brown">
              Nessuna timbratura registrata.
            </div>
          ) : (
            byDay.map(([day, dayEntries]) => (
              <DayBlock key={day} day={day} entries={dayEntries}
                onEdit={onEdit} onDelete={onDelete} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function DayBlock({ day, entries, onEdit, onDelete }) {
  const date = new Date(day + 'T12:00:00')
  const dayHours = computeWorkedMs(entries, new Date()) / 3600000
  const h = Math.floor(dayHours)
  const m = Math.round((dayHours - h) * 60)
  return (
    <div className="border-b border-cream-200 last:border-b-0">
      <div className="px-4 py-2 flex items-center justify-between bg-white/50">
        <div className="font-sans text-sm font-semibold text-warm-dark capitalize">
          {formatDayLong(date)}
        </div>
        <div className="font-sans text-xs text-warm-brown tabular-nums">
          Totale: <strong className="text-warm-dark">{h}h {String(m).padStart(2, '0')}m</strong>
        </div>
      </div>
      <div className="divide-y divide-cream-100">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

function EntryRow({ entry, onEdit, onDelete }) {
  const t = new Date(entry.event_time)
  const cfg = EVENT_CONFIG[entry.event_type] || EVENT_CONFIG.clock_in
  const distance = entry.distance_from_center !== null
    ? Math.round(parseFloat(entry.distance_from_center))
    : null
  const isOutside = entry.is_within_geofence === false
  const isManual = entry.latitude === null

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/70 transition">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
        <cfg.Icon size={14} className={cfg.fg} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-sans text-sm text-warm-dark">
          <span className="font-semibold">{cfg.label}</span>
          <span className="text-warm-brown ml-2 tabular-nums">
            {t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="font-sans text-xs text-warm-brown">
          {isManual ? (
            <span className="italic">Inserita manualmente dal manager</span>
          ) : distance !== null ? (
            <>
              <MapPin size={10} className="inline mr-0.5" />
              {distance}m dal centro
            </>
          ) : (
            <span>—</span>
          )}
          {isOutside && (
            <span className="ml-2 text-red-700 font-semibold">⚠ fuori area</span>
          )}
          {entry.notes && <span className="ml-2 italic">"{entry.notes}"</span>}
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onEdit(entry) }}
        className="p-2 rounded-lg hover:bg-cream-200 text-warm-brown hover:text-warm-dark transition"
        title="Modifica">
        <Edit size={14} />
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(entry) }}
        className="p-2 rounded-lg hover:bg-terracotta-50 text-terracotta-700 transition"
        title="Elimina">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ---- Helpers ----

function computeWorkedMs(entries, nowDate) {
  let total = 0
  let workStart = null
  const sorted = [...entries].sort((a, b) => a.event_time.localeCompare(b.event_time))
  for (const e of sorted) {
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

const EVENT_CONFIG = {
  clock_in: { label: 'Inizio turno', Icon: Play, bg: 'bg-sage-100', fg: 'text-sage-700' },
  clock_out: { label: 'Fine turno', Icon: Square, bg: 'bg-red-100', fg: 'text-red-700' },
  break_start: { label: 'Inizio pausa', Icon: Coffee, bg: 'bg-amber-100', fg: 'text-amber-700' },
  break_end: { label: 'Fine pausa', Icon: Play, bg: 'bg-sage-100', fg: 'text-sage-700' },
}

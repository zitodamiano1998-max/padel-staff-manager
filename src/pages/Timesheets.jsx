import { useState, useEffect, useMemo } from 'react'
import { startOfMonth, endOfMonth, addDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  startOfWeek, weekDays, formatDateISO, formatDayLong,
} from '../lib/dateUtils'
import TimeEntryFormModal from '../components/TimeEntryFormModal'
import {
  Calendar, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Edit, Trash2, Plus, AlertTriangle,
  Play, Square, Coffee, Clock as ClockIcon, MapPin, Download,
} from 'lucide-react'

export default function Timesheets() {
  const { profile } = useAuth()
  const isManager = profile?.is_manager
  const myId = profile?.id

  const [rangeMode, setRangeMode] = useState('week')
  const [customStart, setCustomStart] = useState(formatDateISO(new Date()))
  const [customEnd, setCustomEnd] = useState(formatDateISO(new Date()))
  const [filterStaffId, setFilterStaffId] = useState('')
  const [view, setView] = useState('detail') // 'detail' | 'monthly' (solo manager)

  const [staff, setStaff] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(isManager ? new Set() : new Set([myId])) // dipendente: già espanso

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

  // Mese del riepilogo mensile (Date al primo del mese 00:00)
  const today = new Date()
  const [monthlyDate, setMonthlyDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const monthlyRange = useMemo(() => {
    const start = new Date(monthlyDate.getFullYear(), monthlyDate.getMonth(), 1)
    const end = new Date(monthlyDate.getFullYear(), monthlyDate.getMonth() + 1, 1)
    return { start, end }
  }, [monthlyDate])
  const [monthlyEntries, setMonthlyEntries] = useState([])
  const [monthlyLoading, setMonthlyLoading] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.toISOString(), range.end.toISOString()])

  const fetchData = async () => {
    setLoading(true)
    let entriesQuery = supabase
      .from('time_entries')
      .select('*, staff_members!time_entries_staff_id_fkey(id, first_name, last_name, roles(name, color))')
      .gte('event_time', range.start.toISOString())
      .lt('event_time', range.end.toISOString())
      .order('event_time', { ascending: true })

    // Dipendente: solo le proprie timbrature
    if (!isManager && myId) {
      entriesQuery = entriesQuery.eq('staff_id', myId)
    }

    const promises = [entriesQuery]
    if (isManager) {
      promises.push(
        supabase
          .from('staff_members')
          .select('id, first_name, last_name, roles(id, name, color)')
          .eq('is_active', true)
          .order('first_name')
      )
    }

    const [entRes, staffRes] = await Promise.all(promises)
    if (!entRes.error) setEntries(entRes.data || [])
    if (staffRes && !staffRes.error) setStaff(staffRes.data || [])
    // Dipendente: setto staff con solo se stesso (per il rendering della card)
    if (!isManager && profile) {
      setStaff([{
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        roles: { name: profile.role_name, color: profile.role_color },
      }])
    }
    setLoading(false)
  }

  // Fetch separata per il riepilogo mensile (manager only)
  useEffect(() => {
    if (!isManager || view !== 'monthly') return
    fetchMonthlyData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, view, monthlyRange.start.toISOString(), monthlyRange.end.toISOString()])

  const fetchMonthlyData = async () => {
    setMonthlyLoading(true)
    const { data, error } = await supabase
      .from('time_entries')
      .select('*, staff_members!time_entries_staff_id_fkey(id, first_name, last_name, roles(name, color))')
      .gte('event_time', monthlyRange.start.toISOString())
      .lt('event_time', monthlyRange.end.toISOString())
      .order('event_time', { ascending: true })
    if (!error) setMonthlyEntries(data || [])
    setMonthlyLoading(false)
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
          <h1 className="text-4xl text-warm-dark mb-1">
            {isManager ? 'Timbrature' : 'Le mie timbrature'}
          </h1>
          <p className="font-sans text-sm text-warm-brown">
            {isManager
              ? 'Riepilogo ore lavorate dal team.'
              : 'Le tue ore lavorate. Per timbrare vai su Timbra.'}
          </p>
        </div>
        {isManager && (
          <button onClick={handleNew}
            className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm flex-shrink-0">
            <Plus size={16} /> Aggiungi timbratura
          </button>
        )}
      </div>

      {/* Tab Dettaglio / Riepilogo mensile (solo manager) */}
      {isManager && (
        <div className="flex gap-1 bg-cream-200 rounded-xl p-1 mb-6 max-w-fit">
          {[
            { v: 'detail', label: 'Dettaglio' },
            { v: 'monthly', label: 'Riepilogo mensile' },
          ].map((opt) => (
            <button key={opt.v} onClick={() => setView(opt.v)}
              className={`px-4 py-2 rounded-lg font-sans text-sm font-semibold transition ${
                view === opt.v ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown hover:text-warm-dark'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {view === 'detail' && (
        <>
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

            {isManager && (
              <select value={filterStaffId} onChange={(e) => setFilterStaffId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-cream-300 bg-white font-sans text-sm focus:outline-none focus:border-terracotta-400 transition">
                <option value="">Tutti i dipendenti</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Stats */}
          {isManager ? (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <StatBox label="Ore totali" value={globalStats.totalHours.toFixed(1)} />
              <StatBox label="Dipendenti attivi" value={globalStats.activeStaff} />
              <StatBox label="Eventi fuori area"
                value={globalStats.outsideCount}
                accent={globalStats.outsideCount > 0 ? 'red' : null} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <StatBox label="Ore lavorate" value={globalStats.totalHours.toFixed(1)} />
              <StatBox label="Eventi fuori area"
                value={globalStats.outsideCount}
                accent={globalStats.outsideCount > 0 ? 'red' : null} />
            </div>
          )}

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
                  canEdit={isManager}
                  hideHeader={!isManager}
                  onEdit={handleEdit}
                  onDelete={handleDelete} />
              ))}
            </div>
          )}
        </>
      )}

      {view === 'monthly' && isManager && (
        <MonthlyOverview
          staff={staff}
          entries={monthlyEntries}
          loading={monthlyLoading}
          monthDate={monthlyDate}
          onPrevMonth={() => setMonthlyDate(new Date(monthlyDate.getFullYear(), monthlyDate.getMonth() - 1, 1))}
          onNextMonth={() => setMonthlyDate(new Date(monthlyDate.getFullYear(), monthlyDate.getMonth() + 1, 1))}
          onCurrentMonth={() => setMonthlyDate(new Date(today.getFullYear(), today.getMonth(), 1))} />
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

function StaffCard({ summary, expanded, onToggle, onEdit, onDelete, canEdit = true, hideHeader = false }) {
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

  // Se hideHeader (dipendente), mostra direttamente la lista giorni
  if (hideHeader) {
    return (
      <div className="bg-white rounded-2xl border border-cream-300 overflow-hidden">
        {byDay.length === 0 ? (
          <div className="p-10 text-center">
            <ClockIcon size={28} className="mx-auto mb-2 text-warm-brown/40" />
            <p className="font-sans text-sm text-warm-brown">
              Nessuna timbratura nel periodo selezionato.
            </p>
          </div>
        ) : (
          <div className="bg-cream-50/30">
            {byDay.map(([day, dayEntries]) => (
              <DayBlock key={day} day={day} entries={dayEntries}
                onEdit={onEdit} onDelete={onDelete} canEdit={canEdit} />
            ))}
          </div>
        )}
      </div>
    )
  }

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
                onEdit={onEdit} onDelete={onDelete} canEdit={canEdit} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function DayBlock({ day, entries, onEdit, onDelete, canEdit = true }) {
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
          <EntryRow key={e.id} entry={e} onEdit={onEdit} onDelete={onDelete} canEdit={canEdit} />
        ))}
      </div>
    </div>
  )
}

function EntryRow({ entry, onEdit, onDelete, canEdit = true }) {
  const t = new Date(entry.event_time)
  const cfg = EVENT_CONFIG[entry.event_type] || EVENT_CONFIG.clock_in
  const distance = entry.distance_from_center !== null
    ? Math.round(parseFloat(entry.distance_from_center))
    : null
  const isOutside = entry.is_within_geofence === false
  const isManual = entry.latitude === null

  const realTime = t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const roundedTime = cfg.rounds ? formatTimeRounded(t) : null
  const showRounding = cfg.rounds && roundedTime !== realTime

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/70 transition">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
        <cfg.Icon size={14} className={cfg.fg} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-sans text-sm text-warm-dark">
          <span className="font-semibold">{cfg.label}</span>
          <span className="text-warm-brown ml-2 tabular-nums">{realTime}</span>
          {showRounding && (
            <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-cream-100 border border-cream-200 font-sans text-[10px] tabular-nums text-warm-brown"
              title="Orario arrotondato per il calcolo ore">
              → <strong className="text-warm-dark">{roundedTime}</strong>
            </span>
          )}
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
      {canEdit && (
        <>
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
        </>
      )}
    </div>
  )
}

// ---- Helpers ----

// ============================================================================
// MONTHLY OVERVIEW (manager only)
// ============================================================================
function MonthlyOverview({ staff, entries, loading, monthDate, onPrevMonth, onNextMonth, onCurrentMonth }) {
  // Numero di giorni nel mese
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const monthLabel = monthDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  // Aggrega per staff_id e per giorno
  const summary = useMemo(() => {
    // map: staff_id -> { dayMs: { day -> ms }, totalMs, daysWorked, outsideCount }
    const byStaff = new Map()
    // group entries per staff per giorno
    const grouped = new Map() // key: `${staff_id}|${dayISO}` -> entries[]
    for (const e of entries) {
      const day = formatDateISO(new Date(e.event_time))
      const key = `${e.staff_id}|${day}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(e)
    }
    for (const [key, arr] of grouped.entries()) {
      const [staffId, day] = key.split('|')
      const ms = computeWorkedMs(arr, new Date())
      if (!byStaff.has(staffId)) {
        byStaff.set(staffId, { dayMs: {}, totalMs: 0, daysWorked: new Set(), outsideCount: 0 })
      }
      const rec = byStaff.get(staffId)
      rec.dayMs[day] = (rec.dayMs[day] || 0) + ms
      rec.totalMs += ms
      if (ms > 0) rec.daysWorked.add(day)
      for (const e of arr) {
        if (e.is_within_geofence === false) rec.outsideCount++
      }
    }

    // Lista riga per staff (anche quelli senza entries)
    return staff.map((s) => {
      const rec = byStaff.get(s.id) || { dayMs: {}, totalMs: 0, daysWorked: new Set(), outsideCount: 0 }
      return {
        staff: s,
        dayMs: rec.dayMs,
        totalHours: rec.totalMs / 3600000,
        daysWorked: rec.daysWorked.size,
        outsideCount: rec.outsideCount,
      }
    }).sort((a, b) => b.totalHours - a.totalHours)
  }, [entries, staff])

  // Totale mensile complessivo
  const grandTotal = useMemo(() => summary.reduce((acc, r) => acc + r.totalHours, 0), [summary])

  // Genera array dei giorni del mese (1..N) con info "weekend"
  const days = useMemo(() => {
    const arr = []
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), d)
      const dow = date.getDay() // 0 = dom, 6 = sab
      const iso = formatDateISO(date)
      arr.push({ d, iso, isWeekend: dow === 0 || dow === 6 })
    }
    return arr
  }, [monthDate, daysInMonth])

  // Export CSV
  const handleExportCsv = () => {
    const head = ['Dipendente', 'Ruolo', ...days.map((x) => x.d.toString()), 'Giorni', 'Totale ore']
    const rows = summary.map((row) => {
      const cells = [
        `${row.staff.first_name} ${row.staff.last_name}`,
        row.staff.roles?.name || '',
        ...days.map((x) => {
          const ms = row.dayMs[x.iso] || 0
          if (ms === 0) return ''
          return (ms / 3600000).toFixed(2).replace('.', ',')
        }),
        row.daysWorked.toString(),
        row.totalHours.toFixed(2).replace('.', ','),
      ]
      return cells
    })
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timbrature_${monthDate.getFullYear()}_${String(monthDate.getMonth() + 1).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Toolbar mese */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={onPrevMonth}
            className="p-2 rounded-lg border border-cream-300 bg-white hover:bg-cream-100 text-warm-dark transition">
            <ChevronLeft size={16} />
          </button>
          <button onClick={onCurrentMonth}
            className="px-3 py-2 rounded-lg border border-cream-300 bg-white hover:bg-cream-100 font-sans text-sm font-semibold text-warm-dark transition">
            Oggi
          </button>
          <button onClick={onNextMonth}
            className="p-2 rounded-lg border border-cream-300 bg-white hover:bg-cream-100 text-warm-dark transition">
            <ChevronRight size={16} />
          </button>
          <h2 className="ml-2 font-serif text-2xl text-warm-dark capitalize">{monthLabel}</h2>
        </div>
        <button onClick={handleExportCsv}
          className="flex items-center gap-2 bg-white hover:bg-cream-100 border border-cream-300 text-warm-dark font-sans font-semibold px-4 py-2 rounded-xl transition">
          <Download size={14} /> Esporta CSV
        </button>
      </div>

      {/* Stats riepilogo */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatBox label="Ore totali team" value={grandTotal.toFixed(1)} />
        <StatBox label="Dipendenti" value={summary.filter((r) => r.totalHours > 0).length} />
        <StatBox label="Giorni nel mese" value={daysInMonth} />
      </div>

      {/* Tabella mensile */}
      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-cream-300 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="border-collapse w-full min-w-max">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-300">
                  <th className="sticky left-0 z-10 bg-cream-50 border-r border-cream-300 px-4 py-3 text-left font-sans text-xs uppercase tracking-wider text-warm-brown min-w-[180px]">
                    Dipendente
                  </th>
                  {days.map((x) => (
                    <th key={x.d}
                      className={`border-r border-cream-200 px-1.5 py-3 text-center font-sans text-[11px] tabular-nums ${
                        x.isWeekend ? 'bg-cream-100 text-warm-brown' : 'text-warm-dark'
                      }`}
                      style={{ minWidth: '34px' }}>
                      {x.d}
                    </th>
                  ))}
                  <th className="bg-cream-50 px-3 py-3 text-right font-sans text-xs uppercase tracking-wider text-warm-brown min-w-[80px]">
                    Tot.
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 ? (
                  <tr>
                    <td colSpan={daysInMonth + 2} className="px-4 py-12 text-center font-sans text-warm-brown">
                      Nessun dipendente attivo.
                    </td>
                  </tr>
                ) : (
                  summary.map((row) => (
                    <MonthlyRow key={row.staff.id} row={row} days={days} />
                  ))
                )}
              </tbody>
              {summary.length > 0 && (
                <tfoot>
                  <tr className="bg-cream-50 border-t-2 border-cream-300">
                    <td className="sticky left-0 z-10 bg-cream-50 border-r border-cream-300 px-4 py-3 font-sans font-semibold text-warm-dark">
                      Totale giorno
                    </td>
                    {days.map((x) => {
                      const dayTotal = summary.reduce((acc, r) => acc + (r.dayMs[x.iso] || 0), 0) / 3600000
                      return (
                        <td key={x.d}
                          className={`border-r border-cream-200 px-1.5 py-3 text-center font-sans text-[11px] tabular-nums font-semibold ${
                            x.isWeekend ? 'bg-cream-100' : ''
                          } ${dayTotal === 0 ? 'text-warm-brown/40' : 'text-warm-dark'}`}>
                          {dayTotal === 0 ? '—' : dayTotal.toFixed(1)}
                        </td>
                      )
                    })}
                    <td className="px-3 py-3 text-right font-sans font-semibold text-warm-dark tabular-nums">
                      {grandTotal.toFixed(1)}h
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <p className="font-sans text-xs text-warm-brown/70 mt-3">
        💡 Le ore di ogni giornata sono calcolate arrotondando inizio e fine turno al mezzo-ora più vicino.
        Le pause usano l'orario esatto.
      </p>
    </div>
  )
}

function MonthlyRow({ row, days }) {
  const color = row.staff.roles?.color || '#C97D60'
  return (
    <tr className="border-b border-cream-200 hover:bg-cream-50/50 transition">
      <td className="sticky left-0 z-10 bg-white border-r border-cream-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-serif font-semibold text-xs flex-shrink-0"
            style={{ backgroundColor: color }}>
            {row.staff.first_name?.[0]}{row.staff.last_name?.[0]}
          </div>
          <div className="min-w-0">
            <div className="font-sans text-sm font-semibold text-warm-dark truncate">
              {row.staff.first_name} {row.staff.last_name}
            </div>
            <div className="font-sans text-xs text-warm-brown truncate">
              {row.staff.roles?.name || '—'} · {row.daysWorked}g
              {row.outsideCount > 0 && (
                <span className="text-red-700 ml-1">⚠ {row.outsideCount}</span>
              )}
            </div>
          </div>
        </div>
      </td>
      {days.map((x) => {
        const ms = row.dayMs[x.iso] || 0
        const hours = ms / 3600000
        return (
          <td key={x.d}
            className={`border-r border-cream-200 px-1.5 py-3 text-center font-sans text-[11px] tabular-nums ${
              x.isWeekend ? 'bg-cream-50' : ''
            } ${hours === 0 ? 'text-warm-brown/30' : 'text-warm-dark font-semibold'}`}>
            {hours === 0 ? '—' : hours.toFixed(1)}
          </td>
        )
      })}
      <td className="px-3 py-3 text-right font-sans font-bold text-warm-dark tabular-nums">
        {row.totalHours.toFixed(1)}h
      </td>
    </tr>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Arrotonda un orario al mezzo-ora più vicino.
 * - 19:00..19:14 -> 19:00
 * - 19:15..19:29 -> 19:30
 * - 19:30..19:44 -> 19:30
 * - 19:45..19:59 -> 20:00
 * Riceve e ritorna un Date.
 */
function roundDateToHalfHour(d) {
  const r = new Date(d)
  const minutes = r.getMinutes()
  let rounded
  if (minutes < 15) rounded = 0
  else if (minutes < 45) rounded = 30
  else rounded = 60
  r.setMinutes(rounded, 0, 0)
  return r
}

/**
 * Versione che restituisce HH:MM in locale Italia per visualizzazione.
 */
function formatTimeRounded(date) {
  const d = roundDateToHalfHour(date)
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function computeWorkedMs(entries, nowDate) {
  let total = 0
  let workStart = null // Date arrotondato per clock_in, esatto per break_end
  const sorted = [...entries].sort((a, b) => a.event_time.localeCompare(b.event_time))
  for (const e of sorted) {
    let t = new Date(e.event_time)
    // Solo clock_in e clock_out vengono arrotondati al mezzo-ora.
    // Le pause (break_start/break_end) usano l'orario esatto.
    if (e.event_type === 'clock_in' || e.event_type === 'clock_out') {
      t = roundDateToHalfHour(t)
    }
    if (e.event_type === 'clock_in') {
      // Se c'è già un turno aperto, ignora questo IN (probabile duplicato/manuale)
      if (workStart === null) workStart = t
    } else if (e.event_type === 'break_end') {
      // Stessa logica: se non c'è un workStart aperto, riapre il conteggio
      if (workStart === null) workStart = t
    } else if (e.event_type === 'break_start' || e.event_type === 'clock_out') {
      if (workStart !== null) {
        // Calcola solo se l'OUT è dopo l'IN; ignora coppie invertite/duplicate (Δ ≤ 0)
        if (t > workStart) total += t - workStart
        workStart = null
      }
      // Se workStart è null, OUT senza IN: ignora (probabile duplicato)
    }
  }
  if (workStart) total += Math.max(0, nowDate - workStart)
  return Math.max(0, total)
}

const EVENT_CONFIG = {
  clock_in: { label: 'Inizio turno', Icon: Play, bg: 'bg-sage-100', fg: 'text-sage-700', rounds: true },
  clock_out: { label: 'Fine turno', Icon: Square, bg: 'bg-red-100', fg: 'text-red-700', rounds: true },
  break_start: { label: 'Inizio pausa', Icon: Coffee, bg: 'bg-amber-100', fg: 'text-amber-700', rounds: false },
  break_end: { label: 'Fine pausa', Icon: Play, bg: 'bg-sage-100', fg: 'text-sage-700', rounds: false },
}

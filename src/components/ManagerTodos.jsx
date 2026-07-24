import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Palmtree, ArrowLeftRight, Search, FileEdit, AlertTriangle,
  CheckCircle2, ChevronRight, Loader2, Clock as ClockAlert,
  Check, LogOut, LogIn,
} from 'lucide-react'
import TimeEntryFormModal from './TimeEntryFormModal'

export default function ManagerTodos() {
  const navigate = useNavigate()
  const [todos, setTodos] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [earlyList, setEarlyList] = useState([])
  const [earlyInList, setEarlyInList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modal timbratura manuale
  const [missingModalOpen, setMissingModalOpen] = useState(false)
  const [missingPreset, setMissingPreset] = useState(null)

  // Decisione in corso: { [entry_id]: 'confirm' | 'grant' | 'real' | 'scheduled' | 'custom' }
  const [deciding, setDeciding] = useState({})
  const [decideError, setDecideError] = useState(null)

  const fetchTodos = async () => {
    setLoading(true)
    setError(null)
    // Le uscite anticipate arrivano da una query diretta (non da
    // get_manager_todos): niente RPC da estendere colonna per colonna.
    const [todosRes, staffRes, earlyRes, earlyInRes] = await Promise.all([
      supabase.rpc('get_manager_todos'),
      supabase.from('staff_members')
        .select('id, first_name, last_name')
        .eq('is_active', true)
        .order('first_name'),
      supabase.from('time_entries')
        .select('id, staff_id, event_time, scheduled_end, early_exit_reason, staff_members(first_name, last_name)')
        .eq('early_exit_pending', true)
        .order('event_time', { ascending: false }),
      supabase.from('time_entries')
        .select('id, staff_id, event_time, scheduled_start, early_clockin_reason, staff_members(first_name, last_name)')
        .eq('early_clockin_pending', true)
        .order('event_time', { ascending: false }),
    ])
    setLoading(false)
    if (todosRes.error) {
      setError(todosRes.error.message)
      return
    }
    setTodos(todosRes.data)
    if (staffRes.data) setStaffList(staffRes.data)
    setEarlyList(earlyRes.data || [])
    setEarlyInList(earlyInRes.data || [])
  }

  useEffect(() => {
    fetchTodos()
  }, [])

  if (loading && !todos) {
    return (
      <div className="bg-white rounded-2xl border border-cream-300 p-5 flex items-center gap-3">
        <Loader2 size={16} className="animate-spin text-warm-brown" />
        <span className="font-sans text-sm text-warm-brown">Verifica cose da fare…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 font-sans text-sm">
        Errore: {error}
      </div>
    )
  }

  if (!todos) return null

  const overtimeList = todos.overtime_decisions?.list || []
  const overtimeCount = todos.overtime_decisions?.count || 0
  const earlyCount = earlyList.length
  const earlyInCount = earlyInList.length

  // Stato vuoto: tutto a posto. Gli straordinari sono già in total_actions;
  // le uscite/entrate anticipate arrivano dalle query dirette, vanno sommate.
  if (todos.total_actions === 0 && earlyCount === 0 && earlyInCount === 0) {
    return (
      <div className="bg-sage-50 border border-sage-200 rounded-2xl p-5 flex items-center gap-3">
        <CheckCircle2 size={22} className="text-sage-700 flex-shrink-0" />
        <div>
          <h3 className="font-serif text-lg text-warm-dark leading-tight">Tutto a posto oggi 🌿</h3>
          <p className="font-sans text-xs text-warm-brown mt-0.5">
            Nessuna richiesta in sospeso. Goditi la giornata.
          </p>
        </div>
      </div>
    )
  }

  const totalActions = (todos.total_actions || 0) + earlyCount + earlyInCount

  // Click handler per "Timbrature mancanti" → apre modal precompilato per il primo
  const openMissingClockModal = () => {
    const list = todos.missing_clocks?.list || []
    if (list.length === 0) {
      navigate('/timesheets')
      return
    }
    const first = list[0]
    // Precompila modal timbratura: clock_in se manca, altrimenti clock_out
    const eventType = !first.has_clock_in ? 'clock_in' : 'clock_out'
    const eventTime = !first.has_clock_in
      ? first.start_at
      : first.end_at
    setMissingPreset({
      staff_id: first.staff_id,
      shift_id: first.shift_id,
      event_type: eventType,
      event_time: eventTime,
    })
    setMissingModalOpen(true)
  }

  const handleMissingSaved = async () => {
    setMissingModalOpen(false)
    setMissingPreset(null)
    // Ricarica todos: il turno appena risolto sparisce
    await fetchTodos()
  }

  // Decisione manager su straordinario uscita (oltre +14, chiudente incluso)
  // action: 'confirm' (fine turno E) | 'grant' (E+30) | 'custom' (orario scelto)
  const handleOvertimeDecision = async (entryId, action, customTime = null) => {
    setDecideError(null)
    setDeciding((d) => ({ ...d, [entryId]: action }))
    const { error } = await supabase.rpc('decide_overtime', {
      p_entry_id: entryId,
      p_action: action,
      p_custom_time: customTime,
    })
    if (error) {
      setDecideError(error.message || 'Errore nella decisione')
      setDeciding((d) => {
        const next = { ...d }
        delete next[entryId]
        return next
      })
      return
    }
    // Successo: ricarica: la card sparisce (overtime_pending ora false)
    await fetchTodos()
    setDeciding((d) => {
      const next = { ...d }
      delete next[entryId]
      return next
    })
  }

  // Decisione manager su uscita anticipata (prima di F-15)
  // mode: 'real' (orario reale) | 'scheduled' (fine turno) | 'custom' (orario scelto)
  const handleEarlyDecision = async (entryId, mode, customTime = null) => {
    setDecideError(null)
    setDeciding((d) => ({ ...d, [entryId]: mode }))
    const { error } = await supabase.rpc('decide_early_exit', {
      p_entry_id: entryId,
      p_mode: mode,
      p_custom_time: customTime,
    })
    if (error) {
      setDecideError(error.message || 'Errore nella decisione')
      setDeciding((d) => {
        const next = { ...d }
        delete next[entryId]
        return next
      })
      return
    }
    // Successo: ricarica: la card sparisce (early_exit_pending ora false)
    await fetchTodos()
    setDeciding((d) => {
      const next = { ...d }
      delete next[entryId]
      return next
    })
  }

  // Decisione manager su entrata anticipata (prima di S-5)
  // mode: 'scheduled' (conta da S) | 'real' (dall'orario reale) | 'custom' (orario scelto)
  const handleEarlyClockinDecision = async (entryId, mode, customTime = null) => {
    setDecideError(null)
    setDeciding((d) => ({ ...d, [entryId]: mode }))
    const { error } = await supabase.rpc('decide_early_clockin', {
      p_entry_id: entryId,
      p_mode: mode,
      p_custom_time: customTime,
    })
    if (error) {
      setDecideError(error.message || 'Errore nella decisione')
      setDeciding((d) => {
        const next = { ...d }
        delete next[entryId]
        return next
      })
      return
    }
    await fetchTodos()
    setDeciding((d) => {
      const next = { ...d }
      delete next[entryId]
      return next
    })
  }

  const tiles = [
    {
      key: 'leaves',
      icon: Palmtree,
      count: todos.leaves_pending,
      label: 'Ferie da approvare',
      sub: 'Richieste in attesa',
      onClick: () => navigate('/leaves'),
      tone: 'red',
    },
    {
      key: 'swaps',
      icon: ArrowLeftRight,
      count: todos.swaps_pending,
      label: 'Scambi da rivedere',
      sub: 'Da approvare',
      onClick: () => navigate('/swaps'),
      tone: 'amber',
    },
    {
      key: 'missing',
      icon: ClockAlert,
      count: todos.missing_clocks?.count || 0,
      label: 'Timbrature mancanti',
      sub: 'Ultime 48h',
      onClick: openMissingClockModal,
      tone: 'orange',
    },
    {
      key: 'coverage',
      icon: Search,
      count: todos.coverage_to_select || 0,
      label: 'Coperture da chiudere',
      sub: 'Candidati pronti',
      onClick: () => navigate('/swaps'),
      tone: 'blue',
    },
    {
      key: 'drafts',
      icon: FileEdit,
      count: todos.drafts || 0,
      label: 'Bozze da pubblicare',
      sub: 'Turni in bozza',
      onClick: () => navigate('/planning'),
      tone: 'gray',
    },
    {
      key: 'conflicts',
      icon: AlertTriangle,
      count: todos.conflicts?.count || 0,
      label: 'Conflitti rilevati',
      sub: 'Sovrapposizioni',
      onClick: () => navigate('/planning'),
      tone: 'purple',
    },
  ]

  // Filtra: mostro solo le card con count > 0
  const activeTiles = tiles.filter((t) => t.count > 0)

  return (
    <>
      <div className="bg-white rounded-2xl border border-cream-300 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-serif text-xl text-warm-dark leading-tight">Cose da fare</h3>
            <p className="font-sans text-xs text-warm-brown mt-0.5">
              {totalActions} {totalActions === 1 ? 'azione' : 'azioni'} in sospeso
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeTiles.map((tile) => (
            <TodoTile key={tile.key} {...tile} />
          ))}
        </div>

        {/* Errore decisioni (condiviso tra straordinari e uscite anticipate) */}
        {decideError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 font-sans text-xs">
            {decideError}
          </div>
        )}

        {/* Straordinari uscita (oltre +14 min): decisione manager sul posto */}
        {overtimeCount > 0 && (
          <div className={activeTiles.length > 0 ? 'mt-5 pt-5 border-t border-cream-200' : ''}>
            <div className="flex items-center gap-2 mb-3">
              <ClockAlert size={16} className="text-amber-600" />
              <h4 className="font-sans text-sm font-semibold text-warm-dark">
                Straordinari da approvare
              </h4>
              <span className="font-sans text-xs text-warm-brown">
                ({overtimeCount})
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {overtimeList.map((item) => (
                <OvertimeDecisionCard
                  key={item.entry_id}
                  item={item}
                  deciding={deciding[item.entry_id]}
                  onDecide={handleOvertimeDecision}
                />
              ))}
            </div>
          </div>
        )}

        {/* Uscite anticipate (prima di F-15): il manager decide l'orario da contare */}
        {earlyCount > 0 && (
          <div className={(activeTiles.length > 0 || overtimeCount > 0) ? 'mt-5 pt-5 border-t border-cream-200' : ''}>
            <div className="flex items-center gap-2 mb-3">
              <LogOut size={16} className="text-terracotta-500" />
              <h4 className="font-sans text-sm font-semibold text-warm-dark">
                Uscite anticipate da decidere
              </h4>
              <span className="font-sans text-xs text-warm-brown">
                ({earlyCount})
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {earlyList.map((item) => (
                <EarlyExitDecisionCard
                  key={item.id}
                  item={item}
                  deciding={deciding[item.id]}
                  onDecide={handleEarlyDecision}
                />
              ))}
            </div>
          </div>
        )}

        {/* Entrate anticipate (prima di S-5): il manager decide da che ora contare */}
        {earlyInCount > 0 && (
          <div className={(activeTiles.length > 0 || overtimeCount > 0 || earlyCount > 0) ? 'mt-5 pt-5 border-t border-cream-200' : ''}>
            <div className="flex items-center gap-2 mb-3">
              <LogIn size={16} className="text-sage-600" />
              <h4 className="font-sans text-sm font-semibold text-warm-dark">
                Entrate anticipate da decidere
              </h4>
              <span className="font-sans text-xs text-warm-brown">
                ({earlyInCount})
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {earlyInList.map((item) => (
                <EarlyClockinDecisionCard
                  key={item.id}
                  item={item}
                  deciding={deciding[item.id]}
                  onDecide={handleEarlyClockinDecision}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal timbratura manuale */}
      {missingModalOpen && missingPreset && (
        <TimeEntryFormModal
          preset={missingPreset}
          staff={staffList}
          onClose={() => { setMissingModalOpen(false); setMissingPreset(null) }}
          onSaved={handleMissingSaved}
        />
      )}
    </>
  )
}

// ============================================================================
function TodoTile({ count, label, sub, onClick, tone, icon }) {
  // Toni colore (sfondo, badge, accento)
  const tones = {
    red: { bg: 'bg-red-50 hover:bg-red-100 border-red-200', badge: 'bg-red-500', text: 'text-red-700' },
    amber: { bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200', badge: 'bg-amber-500', text: 'text-amber-700' },
    orange: { bg: 'bg-orange-50 hover:bg-orange-100 border-orange-200', badge: 'bg-orange-500', text: 'text-orange-700' },
    blue: { bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200', badge: 'bg-blue-500', text: 'text-blue-700' },
    gray: { bg: 'bg-cream-100 hover:bg-cream-200 border-cream-300', badge: 'bg-warm-brown', text: 'text-warm-dark' },
    purple: { bg: 'bg-purple-50 hover:bg-purple-100 border-purple-200', badge: 'bg-purple-500', text: 'text-purple-700' },
  }
  const t = tones[tone] || tones.gray

  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition text-left w-full ${t.bg}`}>
      <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.badge} text-white font-serif text-base font-bold flex-shrink-0`}>
        {count}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-sans text-sm font-semibold ${t.text} truncate`}>{label}</div>
        <div className="font-sans text-xs text-warm-brown truncate">{sub}</div>
      </div>
      <ChevronRight size={16} className={t.text + ' flex-shrink-0'} />
    </button>
  )
}

// ============================================================================
// Card decisione straordinario uscita (oltre +14 min, chiudente incluso)
// item: entry_id, staff_name, scheduled_end, event_time, extra_min, overtime_reason
// Tre esiti: conferma fine turno / concedi +30 / orario scelto dal manager.
function OvertimeDecisionCard({ item, deciding, onDecide }) {
  const [customTime, setCustomTime] = useState('')
  const busy = !!deciding
  const fmt = (iso) =>
    new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const end = new Date(item.scheduled_end)
  const endLbl = fmt(item.scheduled_end)
  const grantLbl = fmt(new Date(end.getTime() + 30 * 60 * 1000))
  const outLbl = fmt(item.event_time)

  // ISO dell'orario scelto sullo stesso giorno (locale) della fine turno.
  const applyCustom = () => {
    if (!customTime) return
    const [h, m] = customTime.split(':').map(Number)
    const d = new Date(item.scheduled_end)
    d.setHours(h, m, 0, 0)
    onDecide(item.entry_id, 'custom', d.toISOString())
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-sans text-sm font-semibold text-warm-dark truncate">
            {item.staff_name}
          </div>
          <div className="font-sans text-xs text-warm-brown mt-0.5">
            Fine turno {endLbl} · uscita {outLbl} (+{item.extra_min} min)
          </div>
          {item.overtime_reason && (
            <div className="font-sans text-xs text-warm-brown italic mt-1">
              “{item.overtime_reason}”
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDecide(item.entry_id, 'confirm')}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sage-100 hover:bg-sage-200 border border-sage-300 text-sage-800 font-sans text-xs font-semibold transition disabled:opacity-50">
              {deciding === 'confirm'
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={14} />}
              Conferma {endLbl}
            </button>
            <button
              onClick={() => onDecide(item.entry_id, 'grant')}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-800 font-sans text-xs font-semibold transition disabled:opacity-50">
              {deciding === 'grant'
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={14} />}
              Concedi +30 {grantLbl}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-sans text-xs text-warm-brown">Altro orario:</span>
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              disabled={busy}
              className="rounded-lg border border-cream-300 px-2 py-1 font-sans text-xs text-warm-dark focus:outline-none focus:ring-2 focus:ring-terracotta-300 disabled:opacity-50"
            />
            <button
              onClick={applyCustom}
              disabled={busy || !customTime}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cream-100 hover:bg-cream-200 border border-cream-300 text-warm-dark font-sans text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">
              {deciding === 'custom'
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={14} />}
              Applica
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Card decisione uscita anticipata (prima di F-15)
// item: id, event_time, scheduled_end, early_exit_reason, staff_members{first_name,last_name}
// Tre esiti: orario reale / fine turno / orario scelto dal manager.
function EarlyExitDecisionCard({ item, deciding, onDecide }) {
  const [customTime, setCustomTime] = useState('')
  const busy = !!deciding
  const fmt = (iso) =>
    new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const outLbl = fmt(item.event_time)
  const endLbl = fmt(item.scheduled_end)
  const anticipoMin = Math.round(
    (new Date(item.scheduled_end).getTime() - new Date(item.event_time).getTime()) / 60000
  )
  const staffName = item.staff_members
    ? `${item.staff_members.first_name} ${item.staff_members.last_name}`
    : '—'

  // Costruisce l'ISO dell'orario scelto sullo stesso giorno (locale) della
  // fine turno, così il manager digita solo HH:MM.
  const applyCustom = () => {
    if (!customTime) return
    const [h, m] = customTime.split(':').map(Number)
    const d = new Date(item.scheduled_end)
    d.setHours(h, m, 0, 0)
    onDecide(item.id, 'custom', d.toISOString())
  }

  return (
    <div className="bg-terracotta-50 border border-terracotta-200 rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-sans text-sm font-semibold text-warm-dark truncate">
            {staffName}
          </div>
          <div className="font-sans text-xs text-warm-brown mt-0.5">
            Fine turno {endLbl} · uscito {outLbl} (−{anticipoMin} min)
          </div>
          {item.early_exit_reason && (
            <div className="font-sans text-xs text-warm-brown italic mt-1">
              “{item.early_exit_reason}”
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDecide(item.id, 'real')}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sage-100 hover:bg-sage-200 border border-sage-300 text-sage-800 font-sans text-xs font-semibold transition disabled:opacity-50">
              {deciding === 'real'
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={14} />}
              Conta {outLbl}
            </button>
            <button
              onClick={() => onDecide(item.id, 'scheduled')}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-800 font-sans text-xs font-semibold transition disabled:opacity-50">
              {deciding === 'scheduled'
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={14} />}
              Conta fine turno {endLbl}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-sans text-xs text-warm-brown">Altro orario:</span>
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              disabled={busy}
              className="rounded-lg border border-cream-300 px-2 py-1 font-sans text-xs text-warm-dark focus:outline-none focus:ring-2 focus:ring-terracotta-300 disabled:opacity-50"
            />
            <button
              onClick={applyCustom}
              disabled={busy || !customTime}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cream-100 hover:bg-cream-200 border border-cream-300 text-warm-dark font-sans text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">
              {deciding === 'custom'
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={14} />}
              Applica
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Card decisione entrata anticipata (prima di S-5)
// item: id, event_time, scheduled_start, early_clockin_reason, staff_members{...}
// Tre esiti: conta da S (default provvisorio) / dall'orario reale / orario scelto.
function EarlyClockinDecisionCard({ item, deciding, onDecide }) {
  const [customTime, setCustomTime] = useState('')
  const busy = !!deciding
  const fmt = (iso) =>
    new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const inLbl = fmt(item.event_time)
  const startLbl = fmt(item.scheduled_start)
  const anticipoMin = Math.round(
    (new Date(item.scheduled_start).getTime() - new Date(item.event_time).getTime()) / 60000
  )
  const staffName = item.staff_members
    ? `${item.staff_members.first_name} ${item.staff_members.last_name}`
    : '—'

  // Costruisce l'ISO dell'orario scelto sullo stesso giorno (locale)
  // dell'inizio turno: il manager digita solo HH:MM.
  const applyCustom = () => {
    if (!customTime) return
    const [h, m] = customTime.split(':').map(Number)
    const d = new Date(item.scheduled_start)
    d.setHours(h, m, 0, 0)
    onDecide(item.id, 'custom', d.toISOString())
  }

  return (
    <div className="bg-sage-50 border border-sage-200 rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-sans text-sm font-semibold text-warm-dark truncate">
            {staffName}
          </div>
          <div className="font-sans text-xs text-warm-brown mt-0.5">
            Inizio turno {startLbl} · entrato {inLbl} (−{anticipoMin} min)
          </div>
          {item.early_clockin_reason && (
            <div className="font-sans text-xs text-warm-brown italic mt-1">
              “{item.early_clockin_reason}”
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDecide(item.id, 'scheduled')}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cream-100 hover:bg-cream-200 border border-cream-300 text-warm-dark font-sans text-xs font-semibold transition disabled:opacity-50">
              {deciding === 'scheduled'
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={14} />}
              Conta da {startLbl}
            </button>
            <button
              onClick={() => onDecide(item.id, 'real')}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sage-100 hover:bg-sage-200 border border-sage-300 text-sage-800 font-sans text-xs font-semibold transition disabled:opacity-50">
              {deciding === 'real'
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={14} />}
              Riconosci da {inLbl}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-sans text-xs text-warm-brown">Altro orario:</span>
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              disabled={busy}
              className="rounded-lg border border-cream-300 px-2 py-1 font-sans text-xs text-warm-dark focus:outline-none focus:ring-2 focus:ring-terracotta-300 disabled:opacity-50"
            />
            <button
              onClick={applyCustom}
              disabled={busy || !customTime}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cream-100 hover:bg-cream-200 border border-cream-300 text-warm-dark font-sans text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">
              {deciding === 'custom'
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={14} />}
              Applica
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

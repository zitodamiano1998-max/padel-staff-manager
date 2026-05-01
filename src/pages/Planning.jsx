import { useEffect, useState, useMemo } from 'react'
import { addDays, subDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  startOfWeek, weekDays, formatDayHeader, formatDayLong, formatDayShort,
  formatDateISO, formatTimeFromISO, isToday, calcHoursFromTimestamps,
  startDateOfShift, shiftCrossesMidnight, combineDateTime,
} from '../lib/dateUtils'
import ShiftFormModal from '../components/ShiftFormModal'
import TemplatesModal from '../components/TemplatesModal'
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Grid3x3, BookCopy, AlertTriangle,
} from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter,
} from '@dnd-kit/core'
import { findShiftConflicts, hasBlockingConflicts } from '../lib/conflictUtils'

export default function Planning() {
  const { profile } = useAuth()
  const isManager = profile?.is_manager

  const [viewMode, setViewMode] = useState('week') // 'week' | 'day'
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => new Date())

  const [staff, setStaff] = useState([])
  const [shifts, setShifts] = useState([])
  const [roles, setRoles] = useState([])
  const [templates, setTemplates] = useState([])
  const [availability, setAvailability] = useState([])
  const [approvedLeaves, setApprovedLeaves] = useState([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingShift, setEditingShift] = useState(null)
  const [presetCell, setPresetCell] = useState(null)
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false)
  const [toast, setToast] = useState(null)

  // Drag & drop
  const [activeShift, setActiveShift] = useState(null) // shift attualmente trascinato
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const days = useMemo(() => weekDays(weekStart), [weekStart])

  useEffect(() => {
    fetchData()
  }, [weekStart])

  const fetchData = async () => {
    setLoading(true)

    // Range della settimana in timestamptz: [lun 00:00, lun+7d 00:00)
    const weekStartISO = combineDateTime(formatDateISO(weekStart), '00:00').toISOString()
    const weekEndISO = combineDateTime(formatDateISO(addDays(weekStart, 7)), '00:00').toISOString()

    // Per le ferie usiamo solo le date (YYYY-MM-DD)
    const weekStartDate = formatDateISO(weekStart)
    const weekEndDate = formatDateISO(addDays(weekStart, 7))

    const [staffRes, rolesRes, shiftsRes, templatesRes, availRes, leavesRes] = await Promise.all([
      supabase
        .from('staff_members')
        .select('id, first_name, last_name, role_id, is_manager, roles(id, name, color)')
        .eq('is_active', true)
        .order('first_name'),
      supabase
        .from('roles')
        .select('id, name, color, display_order')
        .order('display_order'),
      supabase
        .from('shifts')
        .select('*, roles(id, name, color), staff_members!shifts_staff_id_fkey(id, first_name, last_name)')
        .gte('start_at', weekStartISO)
        .lt('start_at', weekEndISO)
        .neq('status', 'cancelled')
        .order('start_at'),
      supabase
        .from('shift_templates')
        .select('*, roles(id, name, color)')
        .order('start_time'),
      supabase
        .from('availability')
        .select('id, staff_id, start_at, end_at, reason')
        .lt('start_at', weekEndISO)
        .gte('end_at', weekStartISO),
      supabase
        .from('leave_requests')
        .select('id, staff_id, leave_type, start_date, end_date, is_half_day, half_day_period, status')
        .eq('status', 'approved')
        .lt('start_date', weekEndDate)
        .gte('end_date', weekStartDate),
    ])
    if (!staffRes.error) setStaff(staffRes.data || [])
    if (!rolesRes.error) setRoles(rolesRes.data || [])
    if (!shiftsRes.error) setShifts(shiftsRes.data || [])
    if (!templatesRes.error) setTemplates(templatesRes.data || [])
    if (!availRes.error) setAvailability(availRes.data || [])
    if (!leavesRes.error) setApprovedLeaves(leavesRes.data || [])
    setLoading(false)
  }

  // Mappa per (staff_id|start_date_iso): bucketing per la griglia settimanale
  const shiftsByStaffDay = useMemo(() => {
    const map = new Map()
    shifts.forEach((s) => {
      const dateKey = startDateOfShift(s.start_at)
      const key = `${s.staff_id}|${dateKey}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(s)
    })
    return map
  }, [shifts])

  // Conflitti per ogni turno: id -> array di conflicts (vuoto se nessuno)
  const conflictsByShift = useMemo(() => {
    const map = new Map()
    shifts.forEach((s) => {
      const conf = findShiftConflicts(s, shifts, availability, approvedLeaves)
      if (conf.length > 0) map.set(s.id, conf)
    })
    return map
  }, [shifts, availability, approvedLeaves])

  const handleCellClick = (staffMember, day) => {
    if (!isManager) return
    setPresetCell({
      staff_id: staffMember?.id || '',
      role_id: staffMember?.role_id || '',
      date: formatDateISO(day),
    })
    setEditingShift(null)
    setModalOpen(true)
  }

  const handleShiftClick = (e, shift) => {
    e.stopPropagation()
    if (!isManager) return
    setEditingShift(shift)
    setPresetCell(null)
    setModalOpen(true)
  }

  const handleNewClick = () => {
    setPresetCell({
      date: formatDateISO(viewMode === 'day' ? selectedDay : days[0]),
    })
    setEditingShift(null)
    setModalOpen(true)
  }

  // ---- Drag & drop handlers ----

  const handleDragStart = (event) => {
    const shift = event.active.data.current?.shift
    if (shift) setActiveShift(shift)
  }

  const handleDragEnd = async (event) => {
    setActiveShift(null)
    const { active, over } = event
    if (!over) return

    const shift = active.data.current?.shift
    const newStaffId = over.data.current?.staffId
    const newDateISO = over.data.current?.dateISO
    if (!shift || !newStaffId || !newDateISO) return

    const oldDateISO = startDateOfShift(shift.start_at)
    if (shift.staff_id === newStaffId && oldDateISO === newDateISO) return

    // Calcola nuovi timestamp preservando ora del giorno e flag "termina giorno seguente"
    const oldStart = new Date(shift.start_at)
    const oldEnd = new Date(shift.end_at)
    const startTime = `${pad2(oldStart.getHours())}:${pad2(oldStart.getMinutes())}`
    const endTime = `${pad2(oldEnd.getHours())}:${pad2(oldEnd.getMinutes())}`
    const endsNextDay = shiftCrossesMidnight(shift.start_at, shift.end_at)

    const newStartAt = combineDateTime(newDateISO, startTime, false)
    const newEndAt = combineDateTime(newDateISO, endTime, endsNextDay)

    // Update ottimistico (UI immediata)
    const oldShifts = shifts
    const newStaffMember = staff.find((s) => s.id === newStaffId)
    setShifts((prev) =>
      prev.map((s) =>
        s.id === shift.id
          ? {
              ...s,
              staff_id: newStaffId,
              start_at: newStartAt.toISOString(),
              end_at: newEndAt.toISOString(),
              staff_members: newStaffMember
                ? { id: newStaffMember.id, first_name: newStaffMember.first_name, last_name: newStaffMember.last_name }
                : s.staff_members,
            }
          : s
      )
    )

    const { error } = await supabase
      .from('shifts')
      .update({
        staff_id: newStaffId,
        start_at: newStartAt.toISOString(),
        end_at: newEndAt.toISOString(),
      })
      .eq('id', shift.id)

    if (error) {
      // Rollback in caso di errore
      setShifts(oldShifts)
      showToast('Errore: ' + error.message, 'error')
    } else {
      showToast('Turno spostato')
    }
  }

  const handleSaved = (msg) => {
    setModalOpen(false)
    setEditingShift(null)
    setPresetCell(null)
    fetchData()
    showToast(msg || 'Turno salvato')
  }

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const goToday = () => {
    const today = new Date()
    setWeekStart(startOfWeek(today))
    setSelectedDay(today)
  }
  const goPrev = () => {
    if (viewMode === 'week') setWeekStart(subDays(weekStart, 7))
    else {
      const prev = subDays(selectedDay, 1)
      setSelectedDay(prev)
      const prevWeek = startOfWeek(prev)
      if (formatDateISO(prevWeek) !== formatDateISO(weekStart)) setWeekStart(prevWeek)
    }
  }
  const goNext = () => {
    if (viewMode === 'week') setWeekStart(addDays(weekStart, 7))
    else {
      const next = addDays(selectedDay, 1)
      setSelectedDay(next)
      const nextWeek = startOfWeek(next)
      if (formatDateISO(nextWeek) !== formatDateISO(weekStart)) setWeekStart(nextWeek)
    }
  }

  const stats = useMemo(() => {
    const target = viewMode === 'day' ? formatDateISO(selectedDay) : null
    const list = target
      ? shifts.filter((s) => startDateOfShift(s.start_at) === target)
      : shifts
    const totalHours = list.reduce(
      (acc, s) => acc + calcHoursFromTimestamps(s.start_at, s.end_at, s.break_minutes), 0
    )
    return {
      totalShifts: list.length,
      totalHours,
      draft: list.filter((s) => s.status === 'draft').length,
    }
  }, [shifts, viewMode, selectedDay])

  if (!isManager) {
    return (
      <EmployeePlanningView
        days={days}
        weekStart={weekStart}
        myShifts={shifts.filter((s) => s.staff_id === profile?.id && s.status !== 'cancelled')}
        approvedLeaves={approvedLeaves.filter((l) => l.staff_id === profile?.id)}
        loading={loading}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl text-warm-dark mb-1">Planning</h1>
          <p className="text-warm-brown font-sans text-sm capitalize">
            {viewMode === 'week'
              ? `${formatDayShort(days[0])} → ${formatDayShort(days[6])}`
              : formatDayLong(selectedDay)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-cream-200 rounded-xl p-1">
            <button onClick={() => setViewMode('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-sm font-semibold transition ${
                viewMode === 'week' ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown hover:text-warm-dark'
              }`}>
              <Grid3x3 size={14} /> Settimana
            </button>
            <button onClick={() => setViewMode('day')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-sm font-semibold transition ${
                viewMode === 'day' ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown hover:text-warm-dark'
              }`}>
              <CalendarIcon size={14} /> Giorno
            </button>
          </div>

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

          <button onClick={() => setTemplatesModalOpen(true)}
            className="flex items-center gap-2 border border-cream-300 hover:bg-cream-100 text-warm-dark font-sans font-semibold px-4 py-2 rounded-xl transition"
            title="Gestisci template turni">
            <BookCopy size={16} /> Template
          </button>

          <button onClick={handleNewClick}
            className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm">
            <Plus size={16} /> Nuovo turno
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatBox label={viewMode === 'day' ? 'Turni del giorno' : 'Turni della settimana'} value={stats.totalShifts} />
        <StatBox label="Ore totali" value={stats.totalHours.toFixed(1)} />
        <StatBox label="In bozza" value={stats.draft} accent={stats.draft > 0 ? 'amber' : null} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
      ) : staff.length === 0 ? (
        <div className="bg-white rounded-2xl border border-cream-300 p-8 text-center">
          <p className="font-sans text-warm-brown">
            Nessun dipendente attivo. Aggiungi dipendenti dall'<strong>Anagrafica</strong>.
          </p>
        </div>
      ) : viewMode === 'week' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveShift(null)}
        >
          <PlanningGrid
            days={days}
            staff={staff}
            shiftsByStaffDay={shiftsByStaffDay}
            conflictsByShift={conflictsByShift}
            onCellClick={handleCellClick}
            onShiftClick={handleShiftClick}
            isManager={isManager}
          />
          <DragOverlay dropAnimation={null}>
            {activeShift ? <ShiftBlockGhost shift={activeShift} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <DailyAgenda
          day={selectedDay}
          shifts={shifts.filter((s) => startDateOfShift(s.start_at) === formatDateISO(selectedDay))}
          onShiftClick={handleShiftClick}
          onAddClick={() => handleCellClick(null, selectedDay)}
        />
      )}

      {modalOpen && (
        <ShiftFormModal
          shift={editingShift}
          preset={presetCell}
          staff={staff}
          roles={roles}
          templates={templates}
          allShifts={shifts}
          availability={availability}
          approvedLeaves={approvedLeaves}
          onClose={() => { setModalOpen(false); setEditingShift(null); setPresetCell(null) }}
          onSaved={handleSaved}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {templatesModalOpen && (
        <TemplatesModal
          roles={roles}
          onClose={() => setTemplatesModalOpen(false)}
          onUpdate={fetchData}
        />
      )}

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

function pad2(n) { return String(n).padStart(2, '0') }

function StatBox({ label, value, accent }) {
  return (
    <div className={`bg-white rounded-2xl border p-5 ${
      accent === 'amber' ? 'border-amber-300 bg-amber-50/30' : 'border-cream-300'
    }`}>
      <div className="text-warm-brown font-sans text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className="text-3xl text-warm-dark font-serif font-semibold">{value}</div>
    </div>
  )
}

function PlanningGrid({ days, staff, shiftsByStaffDay, conflictsByShift, onCellClick, onShiftClick, isManager }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-300 overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[900px] grid"
          style={{ gridTemplateColumns: '220px repeat(7, 1fr)' }}>

          <div className="bg-cream-50 border-b border-r border-cream-300 px-4 py-3 sticky left-0 z-10">
            <span className="font-sans text-xs uppercase tracking-wider text-warm-brown">
              Dipendente
            </span>
          </div>
          {days.map((day) => (
            <div key={day.toISOString()}
              className={`border-b border-cream-300 px-3 py-3 ${
                isToday(day) ? 'bg-terracotta-50' : 'bg-cream-50'
              }`}>
              <div className={`font-sans text-xs uppercase tracking-wider capitalize ${
                isToday(day) ? 'text-terracotta-700 font-bold' : 'text-warm-brown'
              }`}>
                {formatDayHeader(day)}
              </div>
            </div>
          ))}

          {staff.map((s) => (
            <div key={s.id} className="contents">
              <div className="border-b border-r border-cream-200 sticky left-0 bg-white z-10 px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-serif font-semibold text-xs flex-shrink-0"
                  style={{ backgroundColor: s.roles?.color || '#C97D60' }}>
                  {s.first_name?.[0]}{s.last_name?.[0]}
                </div>
                <div className="min-w-0">
                  <div className="font-sans text-sm font-semibold text-warm-dark truncate">
                    {s.first_name} {s.last_name}
                  </div>
                  <div className="font-sans text-xs text-warm-brown truncate">
                    {s.roles?.name || '—'}
                  </div>
                </div>
              </div>

              {days.map((day) => {
                const dateISO = formatDateISO(day)
                const key = `${s.id}|${dateISO}`
                const dayShifts = shiftsByStaffDay.get(key) || []
                return (
                  <DroppableCell key={day.toISOString()}
                    staffId={s.id}
                    dateISO={dateISO}
                    isManager={isManager}
                    isToday={isToday(day)}
                    onClick={() => onCellClick(s, day)}>
                    {dayShifts.map((shift) => (
                      <ShiftBlock key={shift.id}
                        shift={shift}
                        onClick={(e) => onShiftClick(e, shift)}
                        isDraggable={isManager}
                        conflicts={conflictsByShift?.get(shift.id) || []} />
                    ))}
                  </DroppableCell>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DroppableCell({ staffId, dateISO, isManager, isToday, onClick, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${staffId}-${dateISO}`,
    data: { staffId, dateISO },
    disabled: !isManager,
  })

  return (
    <div ref={setNodeRef}
      onClick={onClick}
      className={`border-b border-r border-cream-200 p-1.5 min-h-[72px] cursor-pointer transition ${
        isToday ? 'bg-terracotta-50/30' : ''
      } ${isOver ? 'bg-terracotta-100 ring-2 ring-inset ring-terracotta-400' : 'hover:bg-cream-50'}`}>
      {children}
    </div>
  )
}

function ShiftBlock({ shift, onClick, isDraggable = false, conflicts = [] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: shift.id,
    data: { shift },
    disabled: !isDraggable,
  })

  const color = shift.roles?.color || '#C97D60'
  const isDraft = shift.status === 'draft'
  const startTime = formatTimeFromISO(shift.start_at)
  const endTime = formatTimeFromISO(shift.end_at)
  const overnight = shiftCrossesMidnight(shift.start_at, shift.end_at)

  const hasError = conflicts.some((c) => c.severity === 'error')
  const hasWarning = !hasError && conflicts.some((c) => c.severity === 'warning')

  // Stili distinti per bozza vs pubblicato
  const blockStyle = isDraft
    ? {
        backgroundColor: color + '0F',
        border: `1.5px dashed ${color}`,
        opacity: 0.85,
      }
    : {
        backgroundColor: color + '33',
        borderLeft: `4px solid ${color}`,
      }

  // Override stile se c'è errore (bordo rosso)
  if (hasError) {
    blockStyle.boxShadow = '0 0 0 2px #DC2626 inset'
  } else if (hasWarning) {
    blockStyle.boxShadow = '0 0 0 2px #D97706 inset'
  }

  const dragStyle = isDragging
    ? { opacity: 0.3, transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }
    : {}

  const handleClick = (e) => {
    if (isDragging) return
    e.stopPropagation()
    onClick?.(e)
  }

  // Tooltip con i messaggi di conflitto
  const conflictMessages = conflicts.map((c) => `• ${c.message}`).join('\n')

  return (
    <div ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      title={conflictMessages || undefined}
      className={`mb-1 px-2 py-1 rounded-lg transition select-none ${
        isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } hover:brightness-95`}
      style={{ ...blockStyle, ...dragStyle, touchAction: 'none' }}>
      <div className="font-sans text-xs font-semibold text-warm-dark flex items-center gap-1">
        {(hasError || hasWarning) && (
          <AlertTriangle size={11} className={hasError ? 'text-red-600' : 'text-amber-600'} />
        )}
        {startTime}–{endTime}
        {overnight && (
          <span className="text-[9px] font-normal text-warm-brown" title="Termina il giorno seguente">
            +1
          </span>
        )}
        {isDraft && (
          <span className="ml-auto text-[8px] uppercase tracking-wider font-bold text-amber-600">
            bozza
          </span>
        )}
      </div>
      <div className="font-sans text-[10px] text-warm-brown truncate">
        {shift.roles?.name}
      </div>
    </div>
  )
}

// Versione "ghost" mostrata nel DragOverlay mentre trascini (no listeners, solo aspetto)
function ShiftBlockGhost({ shift }) {
  const color = shift.roles?.color || '#C97D60'
  const isDraft = shift.status === 'draft'
  const startTime = formatTimeFromISO(shift.start_at)
  const endTime = formatTimeFromISO(shift.end_at)
  const overnight = shiftCrossesMidnight(shift.start_at, shift.end_at)

  const blockStyle = isDraft
    ? { backgroundColor: color + '0F', border: `1.5px dashed ${color}` }
    : { backgroundColor: color + '33', borderLeft: `4px solid ${color}` }

  return (
    <div className="px-2 py-1 rounded-lg shadow-2xl ring-2 ring-terracotta-400 bg-white"
      style={{ ...blockStyle, minWidth: 110, cursor: 'grabbing' }}>
      <div className="font-sans text-xs font-semibold text-warm-dark flex items-center gap-1">
        {startTime}–{endTime}
        {overnight && <span className="text-[9px] text-warm-brown">+1</span>}
      </div>
      <div className="font-sans text-[10px] text-warm-brown truncate">
        {shift.roles?.name}
      </div>
    </div>
  )
}

function DailyAgenda({ day, shifts, onShiftClick, onAddClick }) {
  const sorted = [...shifts].sort((a, b) => a.start_at.localeCompare(b.start_at))
  const totalHours = sorted.reduce(
    (acc, s) => acc + calcHoursFromTimestamps(s.start_at, s.end_at, s.break_minutes), 0
  )

  return (
    <div className="bg-white rounded-2xl border border-cream-300 overflow-hidden">
      <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between">
        <div>
          <div className="font-serif text-xl text-warm-dark capitalize">
            {formatDayLong(day)}
          </div>
          <div className="font-sans text-sm text-warm-brown mt-0.5">
            {sorted.length} turni · {totalHours.toFixed(1)}h totali
          </div>
        </div>
        <button onClick={onAddClick}
          className="text-terracotta-500 font-sans text-sm font-semibold hover:text-terracotta-600 flex items-center gap-1">
          <Plus size={14} /> Aggiungi turno
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="p-12 text-center font-sans text-warm-brown">
          Nessun turno programmato per questo giorno.
        </div>
      ) : (
        <div className="divide-y divide-cream-200">
          {sorted.map((shift) => (
            <DailyShiftRow key={shift.id} shift={shift} onClick={(e) => onShiftClick(e, shift)} />
          ))}
        </div>
      )}
    </div>
  )
}

function DailyShiftRow({ shift, onClick }) {
  const color = shift.roles?.color || '#C97D60'
  const isDraft = shift.status === 'draft'
  const hours = calcHoursFromTimestamps(shift.start_at, shift.end_at, shift.break_minutes)
  const startTime = formatTimeFromISO(shift.start_at)
  const endTime = formatTimeFromISO(shift.end_at)
  const overnight = shiftCrossesMidnight(shift.start_at, shift.end_at)
  const sm = shift.staff_members
  return (
    <div onClick={onClick}
      className="flex items-center gap-4 px-6 py-4 hover:bg-cream-50 cursor-pointer transition">
      <div className="text-right flex-shrink-0 w-20">
        <div className="font-sans font-semibold text-warm-dark">
          {startTime}
        </div>
        <div className="font-sans text-xs text-warm-brown">
          → {endTime}{overnight && <span className="ml-0.5">+1</span>}
        </div>
      </div>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-serif font-semibold flex-shrink-0"
        style={{ backgroundColor: color }}>
        {sm?.first_name?.[0]}{sm?.last_name?.[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-sans font-semibold text-warm-dark truncate">
          {sm?.first_name} {sm?.last_name}
        </div>
        <div className="font-sans text-xs text-warm-brown">
          {shift.roles?.name} · {hours.toFixed(1)}h
          {shift.break_minutes > 0 ? ` (pausa ${shift.break_minutes}min)` : ''}
        </div>
      </div>
      {isDraft && (
        <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 flex-shrink-0">
          Bozza
        </span>
      )}
    </div>
  )
}

// ============================================================================
// VISTA DIPENDENTE — calendario settimanale personale read-only
// ============================================================================
function EmployeePlanningView({ days, weekStart, myShifts, approvedLeaves, loading, onPrev, onNext, onToday }) {
  const [selectedShift, setSelectedShift] = useState(null)

  // Statistiche settimana
  const weekStats = useMemo(() => {
    let totalHours = 0
    let count = 0
    myShifts.forEach((s) => {
      const start = new Date(s.start_at)
      const end = new Date(s.end_at)
      // Filtra solo turni della settimana visualizzata
      if (start >= days[0] && start < new Date(days[6].getTime() + 24 * 60 * 60 * 1000)) {
        const hours = (end - start) / 3600000 - (s.break_minutes || 0) / 60
        totalHours += hours
        count += 1
      }
    })
    return { totalHours, count }
  }, [myShifts, days])

  // Trova prossimo turno futuro (anche fuori dalla settimana visualizzata)
  const nextShift = useMemo(() => {
    const now = new Date()
    return myShifts
      .filter((s) => new Date(s.start_at) > now && s.status !== 'cancelled')
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0]
  }, [myShifts])

  // Raggruppa turni per giorno (key: YYYY-MM-DD)
  const shiftsByDay = useMemo(() => {
    const map = new Map()
    myShifts.forEach((s) => {
      const key = startDateOfShift(s.start_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(s)
    })
    return map
  }, [myShifts])

  // Mappa ferie approvate per giorno
  const leavesByDay = useMemo(() => {
    const map = new Map()
    approvedLeaves.forEach((l) => {
      const start = new Date(l.start_date + 'T00:00:00')
      const end = new Date(l.end_date + 'T00:00:00')
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        map.set(formatDateISO(d), l)
      }
    })
    return map
  }, [approvedLeaves])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl text-warm-dark mb-1">Planning</h1>
          <p className="text-warm-brown font-sans text-sm capitalize">
            {formatDayShort(days[0])} → {formatDayShort(days[6])}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onPrev}
            className="p-2 rounded-xl border border-cream-300 hover:bg-cream-100 text-warm-dark transition">
            <ChevronLeft size={18} />
          </button>
          <button onClick={onToday}
            className="px-3 py-2 rounded-xl border border-cream-300 hover:bg-cream-100 text-warm-dark font-sans text-sm font-semibold transition">
            Oggi
          </button>
          <button onClick={onNext}
            className="p-2 rounded-xl border border-cream-300 hover:bg-cream-100 text-warm-dark transition">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Card "Prossimo turno" */}
      {nextShift && (
        <NextShiftCard shift={nextShift} />
      )}

      {/* Stats settimana */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatBox label="Turni questa settimana" value={weekStats.count} />
        <StatBox label="Ore totali" value={weekStats.totalHours.toFixed(1)} />
      </div>

      {/* Calendario settimanale */}
      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">Caricamento…</div>
      ) : (
        <div className="space-y-2">
          {days.map((day) => {
            const dayKey = formatDateISO(day)
            const dayShifts = shiftsByDay.get(dayKey) || []
            const dayLeave = leavesByDay.get(dayKey)
            return (
              <DayRow
                key={dayKey}
                day={day}
                shifts={dayShifts}
                leave={dayLeave}
                onShiftClick={setSelectedShift}
              />
            )
          })}
        </div>
      )}

      {/* Modal dettaglio turno */}
      {selectedShift && (
        <ShiftDetailModal
          shift={selectedShift}
          onClose={() => setSelectedShift(null)}
        />
      )}
    </div>
  )
}

function NextShiftCard({ shift }) {
  const start = new Date(shift.start_at)
  const end = new Date(shift.end_at)
  const now = new Date()
  const ms = start - now
  const hours = ms / 3600000
  const days = Math.floor(hours / 24)
  const color = shift.roles?.color || '#C97D60'

  let countdown = ''
  if (hours < 1) {
    const mins = Math.floor(ms / 60000)
    countdown = mins <= 0 ? 'Sta iniziando ora!' : `tra ${mins} minuti`
  } else if (hours < 24) {
    countdown = `tra ${Math.floor(hours)}h`
  } else if (days === 1) {
    countdown = 'domani'
  } else if (days < 7) {
    countdown = `tra ${days} giorni`
  } else {
    countdown = formatDayShort(start)
  }

  const totalHours = ((end - start) / 3600000 - (shift.break_minutes || 0) / 60).toFixed(1)

  return (
    <div className="bg-white rounded-2xl border-2 border-cream-300 p-5 mb-4 relative overflow-hidden"
      style={{ borderLeftWidth: 6, borderLeftColor: color }}>
      <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-1">
        Prossimo turno · {countdown}
      </div>
      <div className="font-serif text-2xl text-warm-dark mb-2 capitalize">
        {formatDayLong(start)}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="font-sans text-base font-semibold text-warm-dark tabular-nums">
          {formatTimeFromISO(shift.start_at)} – {formatTimeFromISO(shift.end_at)}
        </div>
        <span className="font-sans text-sm text-warm-brown">·</span>
        <div className="font-sans text-sm text-warm-brown">
          {totalHours}h
          {shift.break_minutes > 0 && ` (pausa ${shift.break_minutes}m)`}
        </div>
        {shift.roles?.name && (
          <>
            <span className="font-sans text-sm text-warm-brown">·</span>
            <div className="font-sans text-sm text-warm-dark font-semibold">
              {shift.roles.name}
            </div>
          </>
        )}
        {shift.status === 'draft' && (
          <span className="ml-auto font-sans text-xs italic text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
            Bozza
          </span>
        )}
      </div>
    </div>
  )
}

function DayRow({ day, shifts, leave, onShiftClick }) {
  const today = isToday(day)
  const isPast = !today && day < new Date(new Date().setHours(0, 0, 0, 0))
  // formatDayHeader ritorna "Lun 27", quindi splitto per separare nome e numero
  const headerText = formatDayHeader(day)
  const [dayLabel, dayNumberStr] = headerText.split(' ')
  const dayNumber = dayNumberStr || day.getDate()

  return (
    <div className={`bg-white rounded-2xl border ${
      today ? 'border-terracotta-300 shadow-sm' : 'border-cream-300'
    } overflow-hidden ${isPast ? 'opacity-60' : ''}`}>
      <div className="flex">
        {/* Sidebar giorno */}
        <div className={`flex-shrink-0 w-20 py-4 px-3 text-center border-r ${
          today ? 'bg-terracotta-50 border-terracotta-200' : 'bg-cream-50 border-cream-200'
        }`}>
          <div className={`font-sans text-xs uppercase tracking-wider font-semibold ${
            today ? 'text-terracotta-700' : 'text-warm-brown'
          }`}>
            {dayLabel}
          </div>
          <div className={`font-serif text-2xl font-semibold mt-0.5 tabular-nums ${
            today ? 'text-terracotta-700' : 'text-warm-dark'
          }`}>
            {dayNumber}
          </div>
        </div>

        {/* Contenuto */}
        <div className="flex-1 p-3 min-w-0">
          {leave ? (
            <LeaveBadge leave={leave} />
          ) : shifts.length === 0 ? (
            <div className="font-sans text-sm text-warm-brown/60 italic py-2">
              Riposo
            </div>
          ) : (
            <div className="space-y-2">
              {shifts.map((s) => (
                <ShiftBar key={s.id} shift={s} onClick={() => onShiftClick(s)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ShiftBar({ shift, onClick }) {
  const color = shift.roles?.color || '#C97D60'
  const start = new Date(shift.start_at)
  const end = new Date(shift.end_at)
  const hours = ((end - start) / 3600000 - (shift.break_minutes || 0) / 60).toFixed(1)
  const isDraft = shift.status === 'draft'

  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-xl px-3 py-2.5 transition hover:shadow-sm flex items-center gap-3 ${
        isDraft ? 'border-2 border-dashed' : 'border'
      }`}
      style={{
        backgroundColor: isDraft ? 'transparent' : color + '15',
        borderColor: color + (isDraft ? '99' : '40'),
      }}>
      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <div className="font-sans text-sm font-semibold text-warm-dark tabular-nums">
          {formatTimeFromISO(shift.start_at)} – {formatTimeFromISO(shift.end_at)}
        </div>
        <div className="font-sans text-xs text-warm-brown">
          {hours}h
          {shift.roles?.name && ` · ${shift.roles.name}`}
          {shift.break_minutes > 0 && ` · pausa ${shift.break_minutes}m`}
        </div>
      </div>
      {isDraft && (
        <span className="font-sans text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md flex-shrink-0">
          Bozza
        </span>
      )}
    </button>
  )
}

function LeaveBadge({ leave }) {
  const labels = {
    vacation: 'Ferie',
    personal: 'Permesso',
    sick: 'Malattia',
    unpaid: 'Non retribuita',
    other: 'Assenza',
  }
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="font-sans text-sm font-semibold text-sage-700 bg-sage-50 border border-sage-200 px-3 py-1 rounded-lg">
        🌴 {labels[leave.leave_type] || 'Assenza'}
        {leave.is_half_day && ` (mezza giornata, ${leave.half_day_period === 'morning' ? 'mattina' : 'pomeriggio'})`}
      </span>
    </div>
  )
}

function ShiftDetailModal({ shift, onClose }) {
  const start = new Date(shift.start_at)
  const end = new Date(shift.end_at)
  const hours = ((end - start) / 3600000 - (shift.break_minutes || 0) / 60).toFixed(1)
  const color = shift.roles?.color || '#C97D60'

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        style={{ borderTopWidth: 6, borderTopColor: color }}>
        <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between">
          <h2 className="text-2xl text-warm-dark capitalize">
            {formatDayLong(start)}
          </h2>
          <button onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            ✕
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <DetailRow label="Orario">
            <span className="font-sans text-base font-semibold text-warm-dark tabular-nums">
              {formatTimeFromISO(shift.start_at)} – {formatTimeFromISO(shift.end_at)}
            </span>
          </DetailRow>
          <DetailRow label="Durata">
            <span className="font-sans text-sm text-warm-dark">
              {hours} ore
              {shift.break_minutes > 0 && (
                <span className="text-warm-brown"> (pausa {shift.break_minutes} min)</span>
              )}
            </span>
          </DetailRow>
          {shift.roles?.name && (
            <DetailRow label="Ruolo">
              <span className="font-sans text-sm text-warm-dark font-semibold flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                {shift.roles.name}
              </span>
            </DetailRow>
          )}
          <DetailRow label="Stato">
            <span className={`font-sans text-xs font-semibold px-2 py-0.5 rounded-md border inline-block ${
              shift.status === 'draft'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-sage-50 text-sage-700 border-sage-200'
            }`}>
              {shift.status === 'draft' ? 'Bozza' : 'Pubblicato'}
            </span>
          </DetailRow>
          {shift.notes && (
            <DetailRow label="Note">
              <span className="font-sans text-sm text-warm-dark italic">"{shift.notes}"</span>
            </DetailRow>
          )}
        </div>
        <div className="px-6 py-4 border-t border-cream-200 flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold text-sm transition shadow-sm">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, children }) {
  return (
    <div>
      <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-1">{label}</div>
      <div>{children}</div>
    </div>
  )
}

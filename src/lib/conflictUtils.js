import { addDays } from 'date-fns'
import { startOfWeek as myStartOfWeek } from './dateUtils'

const HOUR_MS = 3600000

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

function calcHoursWithBreak(start, end, breakMin) {
  const hours = (end - start) / HOUR_MS
  return Math.max(0, hours - (breakMin || 0) / 60)
}

function fmtRange(start, end) {
  const opts = { hour: '2-digit', minute: '2-digit' }
  const dateLabel = start.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  return `${dateLabel} ${start.toLocaleTimeString('it-IT', opts)}–${end.toLocaleTimeString('it-IT', opts)}`
}

/**
 * Calcola tutti i conflitti per un turno (proposto o esistente).
 *
 * shift: { id?, staff_id, start_at, end_at, status?, break_minutes? }
 * allShifts: tutti i turni in memoria (settimana visualizzata)
 * availability: tutte le indisponibilità note in memoria (almeno della settimana)
 * approvedLeaves: ferie/permessi APPROVATI in memoria (almeno della settimana)
 *
 * Restituisce array di { type, severity, message, ... }
 *   - severity 'error': blocca il salvataggio
 *   - severity 'warning': mostra avviso, salvataggio possibile
 */
export function findShiftConflicts(shift, allShifts = [], availability = [], approvedLeaves = []) {
  const conflicts = []
  if (!shift?.start_at || !shift?.end_at || !shift?.staff_id) return conflicts

  const start = new Date(shift.start_at)
  const end = new Date(shift.end_at)
  if (!(start < end)) return conflicts

  const sameStaffOthers = allShifts.filter(
    (o) =>
      o.staff_id === shift.staff_id &&
      o.id !== shift.id &&
      o.status !== 'cancelled'
  )

  // 1) Sovrapposizione con altro turno dello stesso dipendente
  for (const o of sameStaffOthers) {
    const oStart = new Date(o.start_at)
    const oEnd = new Date(o.end_at)
    if (intervalsOverlap(start, end, oStart, oEnd)) {
      conflicts.push({
        type: 'overlap',
        severity: 'error',
        message: `Sovrapposizione con un altro turno (${fmtRange(oStart, oEnd)})`,
      })
    }
  }

  // 2) Riposo < 11h tra turni consecutivi (solo se non c'è overlap)
  for (const o of sameStaffOthers) {
    const oStart = new Date(o.start_at)
    const oEnd = new Date(o.end_at)
    if (intervalsOverlap(start, end, oStart, oEnd)) continue
    if (oEnd <= start) {
      const restH = (start - oEnd) / HOUR_MS
      if (restH < 11) {
        conflicts.push({
          type: 'rest_lt_11h',
          severity: 'warning',
          message: `Riposo di solo ${restH.toFixed(1)}h dal turno precedente (consigliato ≥11h)`,
        })
      }
    } else if (oStart >= end) {
      const restH = (oStart - end) / HOUR_MS
      if (restH < 11) {
        conflicts.push({
          type: 'rest_lt_11h',
          severity: 'warning',
          message: `Riposo di solo ${restH.toFixed(1)}h fino al turno successivo (consigliato ≥11h)`,
        })
      }
    }
  }

  // 3) Settimana > 48h
  const weekStart = myStartOfWeek(start)
  const weekEnd = addDays(weekStart, 7)
  let weekHours = calcHoursWithBreak(start, end, shift.break_minutes || 0)
  for (const o of sameStaffOthers) {
    const oStart = new Date(o.start_at)
    if (oStart >= weekStart && oStart < weekEnd) {
      weekHours += calcHoursWithBreak(oStart, new Date(o.end_at), o.break_minutes || 0)
    }
  }
  if (weekHours > 48) {
    conflicts.push({
      type: 'week_gt_48h',
      severity: 'warning',
      message: `Settimana totale: ${weekHours.toFixed(1)}h (limite consigliato 48h)`,
    })
  }

  // 4) Indisponibilità del dipendente
  for (const a of availability) {
    if (a.staff_id !== shift.staff_id) continue
    const aStart = new Date(a.start_at)
    const aEnd = new Date(a.end_at)
    if (intervalsOverlap(start, end, aStart, aEnd)) {
      conflicts.push({
        type: 'unavailable',
        severity: 'error',
        message: a.reason
          ? `Dipendente non disponibile: "${a.reason}"`
          : 'Dipendente segnato come non disponibile in questo orario',
      })
    }
  }

  // 5) Ferie / permessi APPROVATI
  for (const l of approvedLeaves) {
    if (l.staff_id !== shift.staff_id) continue
    const { startDt, endDt } = leaveToInterval(l)
    if (intervalsOverlap(start, end, startDt, endDt)) {
      const label = LEAVE_LABELS[l.leave_type] || 'Assenza'
      const range = l.start_date === l.end_date
        ? formatItalianDate(l.start_date)
        : `dal ${formatItalianDate(l.start_date)} al ${formatItalianDate(l.end_date)}`
      const halfNote = l.is_half_day
        ? ` (mezza giornata, ${l.half_day_period === 'morning' ? 'mattina' : 'pomeriggio'})`
        : ''
      conflicts.push({
        type: 'leave_approved',
        severity: 'error',
        message: `${label} approvata ${range}${halfNote}`,
      })
    }
  }

  return conflicts
}

const LEAVE_LABELS = {
  vacation: 'Ferie',
  personal: 'Permesso',
  sick: 'Malattia',
  unpaid: 'Assenza non retribuita',
  other: 'Assenza',
}

function leaveToInterval(l) {
  // start_date e end_date sono YYYY-MM-DD
  if (l.is_half_day) {
    const day = l.start_date
    if (l.half_day_period === 'morning') {
      return {
        startDt: new Date(day + 'T00:00:00'),
        endDt: new Date(day + 'T13:00:00'),
      }
    }
    // afternoon: dalle 13:00 a fine giornata
    const next = new Date(day + 'T00:00:00')
    next.setDate(next.getDate() + 1)
    return {
      startDt: new Date(day + 'T13:00:00'),
      endDt: next,
    }
  }
  // Range pieno: [start_date 00:00, end_date+1 00:00)
  const startDt = new Date(l.start_date + 'T00:00:00')
  const endDt = new Date(l.end_date + 'T00:00:00')
  endDt.setDate(endDt.getDate() + 1)
  return { startDt, endDt }
}

function formatItalianDate(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

/** Ritorna true se c'è almeno un conflitto bloccante (severity 'error') */
export function hasBlockingConflicts(conflicts) {
  return conflicts.some((c) => c.severity === 'error')
}

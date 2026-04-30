import {
  startOfWeek as _startOfWeek,
  addDays,
  format as _format,
  isSameDay,
  differenceInMinutes,
} from 'date-fns'
import { it } from 'date-fns/locale'

// ============================================================================
// Settimana e date
// ============================================================================

export const startOfWeek = (date) => _startOfWeek(date, { weekStartsOn: 1 })

export const weekDays = (weekStart) =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

export const formatDayHeader = (date) =>
  _format(date, 'EEE d', { locale: it })

export const formatDayLong = (date) =>
  _format(date, 'EEEE d MMMM', { locale: it })

export const formatDayShort = (date) =>
  _format(date, 'd MMM', { locale: it })

export const formatDateISO = (date) =>
  _format(date, 'yyyy-MM-dd')

export const isToday = (date) => isSameDay(date, new Date())

// ============================================================================
// Conversioni timestamptz <-> form fields
// ============================================================================

// "14:30" da timestamptz ISO ("2026-04-30T12:30:00Z" → "14:30" in TZ locale)
export const formatTimeFromISO = (isoStr) =>
  isoStr ? _format(new Date(isoStr), 'HH:mm') : ''

// La data calendario di start del turno (yyyy-mm-dd) in timezone locale.
// Usata per il "bucketing" del turno nella griglia settimanale.
export const startDateOfShift = (isoStr) =>
  isoStr ? _format(new Date(isoStr), 'yyyy-MM-dd') : ''

// Combina date (yyyy-mm-dd) + time (HH:mm) in un Date locale.
// Se addOneDay=true, aggiunge 24h (per turni che sforano la mezzanotte).
export const combineDateTime = (dateStr, timeStr, addOneDay = false) => {
  if (!dateStr || !timeStr) return null
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const d = new Date(year, month - 1, day, hh, mm, 0, 0)
  if (addOneDay) d.setDate(d.getDate() + 1)
  return d
}

// ============================================================================
// Calcoli durata
// ============================================================================

// Ore lavorate netto pause tra due timestamp (Date o ISO string)
export const calcHoursFromTimestamps = (startAt, endAt, breakMinutes = 0) => {
  if (!startAt || !endAt) return 0
  const s = typeof startAt === 'string' ? new Date(startAt) : startAt
  const e = typeof endAt === 'string' ? new Date(endAt) : endAt
  const minutes = differenceInMinutes(e, s) - (breakMinutes || 0)
  return Math.max(0, minutes / 60)
}

// True se il turno termina in un giorno calendario diverso da quello di inizio
export const shiftCrossesMidnight = (startAt, endAt) => {
  if (!startAt || !endAt) return false
  return startDateOfShift(startAt) !== startDateOfShift(endAt)
}

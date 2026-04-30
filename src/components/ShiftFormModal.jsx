import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  formatDateISO, formatTimeFromISO, combineDateTime,
  calcHoursFromTimestamps, formatDayLong,
} from '../lib/dateUtils'
import { findShiftConflicts, hasBlockingConflicts } from '../lib/conflictUtils'
import { addDays } from 'date-fns'
import { X, Trash2, Moon, BookCopy, AlertTriangle } from 'lucide-react'

export default function ShiftFormModal({ shift, preset, staff, roles, templates = [], allShifts = [], availability = [], approvedLeaves = [], onClose, onSaved, onError }) {
  const { profile } = useAuth()
  const isEdit = !!shift

  const [form, setForm] = useState({
    staff_id: '',
    role_id: '',
    date: '',
    start_time: '09:00',
    end_time: '13:00',
    ends_next_day: false,
    break_minutes: 0,
    notes: '',
    status: 'draft',
  })
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  // Init form da shift (edit) o preset (new)
  useEffect(() => {
    if (shift) {
      const startDate = formatDateISO(new Date(shift.start_at))
      const endDate = formatDateISO(new Date(shift.end_at))
      setForm({
        staff_id: shift.staff_id,
        role_id: shift.role_id || '',
        date: startDate,
        start_time: formatTimeFromISO(shift.start_at),
        end_time: formatTimeFromISO(shift.end_at),
        ends_next_day: startDate !== endDate,
        break_minutes: shift.break_minutes || 0,
        notes: shift.notes || '',
        status: shift.status || 'draft',
      })
    } else if (preset) {
      setForm((f) => ({
        ...f,
        staff_id: preset.staff_id || '',
        role_id: preset.role_id || '',
        date: preset.date || '',
      }))
    }
  }, [shift, preset])

  // Auto-fill role_id quando si seleziona uno staff (solo se vuoto)
  useEffect(() => {
    if (form.staff_id && !form.role_id) {
      const s = staff.find((x) => x.id === form.staff_id)
      if (s?.role_id) setForm((f) => ({ ...f, role_id: s.role_id }))
    }
  }, [form.staff_id])

  // Auto-suggest ends_next_day quando l'ora di fine è ≤ ora di inizio
  useEffect(() => {
    if (!form.start_time || !form.end_time) return
    const startMin = timeToMinutes(form.start_time)
    const endMin = timeToMinutes(form.end_time)
    if (endMin <= startMin && !form.ends_next_day) {
      setForm((f) => ({ ...f, ends_next_day: true }))
    }
  }, [form.start_time, form.end_time])

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // Computa start_at e end_at correnti
  const computedStart = form.date && form.start_time
    ? combineDateTime(form.date, form.start_time, false) : null
  const computedEnd = form.date && form.end_time
    ? combineDateTime(form.date, form.end_time, form.ends_next_day) : null

  const totalHours = computedStart && computedEnd
    ? calcHoursFromTimestamps(computedStart, computedEnd, form.break_minutes)
    : 0

  const validationError = (() => {
    if (!computedStart || !computedEnd) return null
    if (computedEnd <= computedStart) {
      return 'L\'orario di fine deve essere successivo all\'inizio. Spunta "Termina il giorno seguente" se necessario.'
    }
    return null
  })()

  // Calcola conflitti in tempo reale (ogni volta che il form cambia)
  const conflicts = useMemo(() => {
    if (!form.staff_id || !computedStart || !computedEnd || validationError) return []
    const proposedShift = {
      id: shift?.id,
      staff_id: form.staff_id,
      start_at: computedStart.toISOString(),
      end_at: computedEnd.toISOString(),
      status: form.status,
      break_minutes: parseInt(form.break_minutes) || 0,
    }
    return findShiftConflicts(proposedShift, allShifts, availability, approvedLeaves)
  }, [form.staff_id, computedStart, computedEnd, form.break_minutes, form.status, shift?.id, allShifts, availability, approvedLeaves, validationError])

  const blockingConflicts = hasBlockingConflicts(conflicts)
  const errorConflicts = conflicts.filter((c) => c.severity === 'error')
  const warnConflicts = conflicts.filter((c) => c.severity === 'warning')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (validationError) {
      setError(validationError)
      return
    }

    if (blockingConflicts) {
      setError('Impossibile salvare: il turno è in conflitto. Risolvi gli errori e riprova.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        staff_id: form.staff_id,
        role_id: form.role_id || null,
        start_at: computedStart.toISOString(),
        end_at: computedEnd.toISOString(),
        break_minutes: parseInt(form.break_minutes) || 0,
        notes: form.notes?.trim() || null,
        status: form.status,
      }
      if (isEdit) {
        const { error } = await supabase.from('shifts').update(payload).eq('id', shift.id)
        if (error) throw error
        onSaved('Turno aggiornato')
      } else {
        payload.created_by = profile?.id
        if (form.status === 'published') payload.published_at = new Date().toISOString()
        const { error } = await supabase.from('shifts').insert(payload)
        if (error) throw error
        onSaved('Turno creato')
      }
    } catch (err) {
      setError(err.message)
      if (onError) onError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Eliminare questo turno? L\'azione non è reversibile.')) return
    setDeleting(true)
    const { error } = await supabase.from('shifts').delete().eq('id', shift.id)
    setDeleting(false)
    if (error) {
      setError(error.message)
    } else {
      onSaved('Turno eliminato')
    }
  }

  // Etichetta giorno successivo (per hint quando ends_next_day=true)
  const nextDayLabel = form.date && form.ends_next_day
    ? formatDayLong(addDays(new Date(form.date + 'T00:00'), 1))
    : null

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-lg w-full max-h-[90vh] flex flex-col">

        {/* Header (sempre visibile in alto) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <h2 className="text-2xl text-warm-dark">{isEdit ? 'Modifica turno' : 'Nuovo turno'}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        {/* Body scrollabile */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Applica template (solo in modalità nuovo turno e se ci sono template) */}
          {!isEdit && templates.length > 0 && (
            <div className="bg-cream-50 border border-cream-300 rounded-xl p-3">
              <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5 flex items-center gap-1.5">
                <BookCopy size={14} /> Applica template
              </label>
              <select
                onChange={(e) => {
                  const id = e.target.value
                  if (!id) return
                  const t = templates.find((x) => x.id === id)
                  if (!t) return
                  setForm((f) => ({
                    ...f,
                    role_id: t.role_id || f.role_id,
                    start_time: t.start_time?.slice(0, 5) || f.start_time,
                    end_time: t.end_time?.slice(0, 5) || f.end_time,
                    ends_next_day: !!t.ends_next_day,
                    break_minutes: t.break_minutes || 0,
                  }))
                  // Reset select
                  e.target.value = ''
                }}
                defaultValue=""
                className={inputCls}>
                <option value="">— Scegli un template per pre-compilare —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
                    {t.ends_next_day ? ' +1' : ''}
                    {t.roles?.name ? ` · ${t.roles.name}` : ''}
                  </option>
                ))}
              </select>
              <p className="font-sans text-xs text-warm-brown/70 mt-1.5">
                Pre-compila orari, ruolo e pausa. Scegli poi dipendente e data.
              </p>
            </div>
          )}

          <Field label="Dipendente" required>
            <select required value={form.staff_id} onChange={update('staff_id')} className={inputCls}>
              <option value="">— Seleziona —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                  {s.roles?.name ? ` · ${s.roles.name}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Ruolo del turno">
            <select value={form.role_id} onChange={update('role_id')} className={inputCls}>
              <option value="">— Default del dipendente —</option>
              {roles.filter((r) => r.name !== 'Manager').map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Data inizio" required>
            <input type="date" required value={form.date}
              onChange={update('date')} className={inputCls} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Inizio" required>
              <input type="time" required value={form.start_time}
                onChange={update('start_time')} className={inputCls} />
            </Field>
            <Field label="Fine" required>
              <input type="time" required value={form.end_time}
                onChange={update('end_time')} className={inputCls} />
            </Field>
            <Field label="Pausa (min)">
              <input type="number" min="0" max="240" step="15" value={form.break_minutes}
                onChange={update('break_minutes')} className={inputCls} />
            </Field>
          </div>

          {/* Checkbox turno notturno */}
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
            form.ends_next_day
              ? 'border-terracotta-300 bg-terracotta-50'
              : 'border-cream-300 bg-cream-50 hover:border-terracotta-200'
          }`}>
            <input type="checkbox" checked={form.ends_next_day}
              onChange={(e) => setForm({ ...form, ends_next_day: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-terracotta-400" />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 font-sans text-sm font-semibold text-warm-dark">
                <Moon size={14} /> Termina il giorno seguente
              </div>
              <div className="font-sans text-xs text-warm-brown mt-0.5">
                {form.ends_next_day && nextDayLabel
                  ? <>Il turno si chiude alle <strong>{form.end_time}</strong> di <span className="capitalize">{nextDayLabel}</span>.</>
                  : 'Spunta se il turno sfora la mezzanotte (es. 22:00 → 01:00).'}
              </div>
            </div>
          </label>

          {/* Ore lavorate */}
          <div className="bg-cream-100 border border-cream-300 rounded-xl px-4 py-3 font-sans text-sm">
            <span className="text-warm-brown">Ore lavorate: </span>
            <strong className="text-warm-dark">{totalHours.toFixed(2)}h</strong>
            {form.break_minutes > 0 && (
              <span className="text-warm-brown text-xs ml-2">
                (al netto di {form.break_minutes}min di pausa)
              </span>
            )}
          </div>

          <Field label="Stato">
            <div className="flex gap-2">
              <label className={`flex-1 cursor-pointer px-3 py-2.5 rounded-xl border font-sans text-sm text-center transition ${
                form.status === 'draft'
                  ? 'border-amber-400 bg-amber-50 text-amber-700 font-semibold'
                  : 'border-cream-300 bg-cream-50 text-warm-brown hover:border-amber-300'
              }`}>
                <input type="radio" name="status" value="draft"
                  checked={form.status === 'draft'} onChange={update('status')} className="hidden" />
                Bozza
              </label>
              <label className={`flex-1 cursor-pointer px-3 py-2.5 rounded-xl border font-sans text-sm text-center transition ${
                form.status === 'published'
                  ? 'border-sage-400 bg-sage-400/10 text-sage-500 font-semibold'
                  : 'border-cream-300 bg-cream-50 text-warm-brown hover:border-sage-400'
              }`}>
                <input type="radio" name="status" value="published"
                  checked={form.status === 'published'} onChange={update('status')} className="hidden" />
                Pubblicato
              </label>
            </div>
          </Field>

          <Field label="Note">
            <textarea rows="2" value={form.notes} onChange={update('notes')}
              className={`${inputCls} resize-none`}
              placeholder="Note sul turno (opzionale)" />
          </Field>

          {/* Pannello conflitti */}
          {conflicts.length > 0 && (
            <div className="space-y-2">
              {errorConflicts.length > 0 && (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 font-sans font-semibold text-red-800 text-sm mb-1">
                    <AlertTriangle size={16} /> Salvataggio bloccato
                  </div>
                  <ul className="space-y-0.5 font-sans text-sm text-red-800">
                    {errorConflicts.map((c, i) => (
                      <li key={i}>• {c.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {warnConflicts.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 font-sans font-semibold text-amber-800 text-sm mb-1">
                    <AlertTriangle size={16} /> Attenzione
                  </div>
                  <ul className="space-y-0.5 font-sans text-sm text-amber-800">
                    {warnConflicts.map((c, i) => (
                      <li key={i}>• {c.message}</li>
                    ))}
                  </ul>
                  <div className="font-sans text-xs text-amber-700/80 mt-1.5">
                    Puoi salvare comunque, ma considera le indicazioni sopra.
                  </div>
                </div>
              )}
            </div>
          )}

          {(error || validationError) && (
            <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm">
              {error || validationError}
            </div>
          )}

        </div>

        {/* Footer (sempre visibile in basso) */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-cream-200 flex-shrink-0 bg-white rounded-b-2xl">
          {isEdit ? (
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-terracotta-700 hover:bg-terracotta-50 font-sans font-semibold text-sm transition">
              <Trash2 size={16} />
              {deleting ? 'Elimino...' : 'Elimina'}
            </button>
          ) : <span />}
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-sans font-semibold text-sm text-warm-dark hover:bg-cream-100 transition">
              Annulla
            </button>
            <button type="submit" disabled={submitting || !!validationError || blockingConflicts}
              className="px-5 py-2.5 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 disabled:cursor-not-allowed text-white font-sans font-semibold text-sm transition shadow-sm">
              {submitting ? 'Salvataggio...' : (isEdit ? 'Salva' : 'Crea turno')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-cream-50 font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 focus:bg-white focus:ring-2 focus:ring-terracotta-100 transition'

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
        {label} {required && <span className="text-terracotta-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

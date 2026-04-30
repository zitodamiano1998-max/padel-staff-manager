import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X, Trash2 } from 'lucide-react'

export default function TimeEntryFormModal({ entry, presetStaffId, staff, onClose, onSaved }) {
  const isEdit = !!entry

  const [form, setForm] = useState(() => initialForm(entry, presetStaffId))
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setForm(initialForm(entry, presetStaffId))
  }, [entry, presetStaffId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // Combina date + time in ISO timestamp (locale)
      const dt = new Date(`${form.date}T${form.time}:00`)
      if (isNaN(dt.getTime())) throw new Error('Data/ora non valida')

      const payload = {
        staff_id: form.staff_id,
        event_type: form.event_type,
        event_time: dt.toISOString(),
        notes: form.notes.trim() || null,
      }

      if (isEdit) {
        const { error } = await supabase.from('time_entries').update(payload).eq('id', entry.id)
        if (error) throw error
      } else {
        // Insert manuale: NON passiamo lat/lng, così il trigger lascia tutto NULL
        // → la riga risulta "manuale" (latitude IS NULL)
        const { error } = await supabase.from('time_entries').insert(payload)
        if (error) throw error
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Eliminare questa timbratura? L\'azione è irreversibile.')) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('time_entries').delete().eq('id', entry.id)
      if (error) throw error
      onSaved()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-lg w-full max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <h2 className="text-2xl text-warm-dark">
            {isEdit ? 'Modifica timbratura' : 'Nuova timbratura'}
          </h2>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {!isEdit && (
            <div className="bg-cream-50 border border-cream-300 rounded-xl px-4 py-3 font-sans text-xs text-warm-brown">
              Le timbrature inserite manualmente non hanno coordinate GPS e vengono marchiate come <strong>MANUALE</strong>.
            </div>
          )}

          <Field label="Dipendente" required>
            <select required value={form.staff_id}
              onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
              disabled={isEdit}
              className={`${inputCls} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}>
              <option value="">— Seleziona —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </select>
          </Field>

          <Field label="Tipo evento" required>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.map((t) => (
                <button key={t.value} type="button"
                  onClick={() => setForm({ ...form, event_type: t.value })}
                  className={`px-3 py-2.5 rounded-xl border font-sans text-sm font-semibold transition ${
                    form.event_type === t.value
                      ? 'border-terracotta-400 bg-terracotta-50 text-warm-dark'
                      : 'border-cream-300 bg-white text-warm-brown hover:bg-cream-50'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data" required>
              <input type="date" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputCls} />
            </Field>
            <Field label="Ora" required>
              <input type="time" required step="60" value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className={inputCls} />
            </Field>
          </div>

          <Field label="Note (opzionale)">
            <input type="text" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="es. ha dimenticato di timbrare uscita"
              className={inputCls} />
          </Field>

          {error && (
            <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm">
              {error}
            </div>
          )}
        </div>

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
            <button type="submit" disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold text-sm transition shadow-sm">
              {submitting ? 'Salvataggio...' : (isEdit ? 'Salva' : 'Crea')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ---- Helpers ----

function initialForm(entry, presetStaffId) {
  if (entry) {
    const t = new Date(entry.event_time)
    return {
      staff_id: entry.staff_id,
      event_type: entry.event_type,
      date: formatLocalDate(t),
      time: formatLocalTime(t),
      notes: entry.notes || '',
    }
  }
  const now = new Date()
  return {
    staff_id: presetStaffId || '',
    event_type: 'clock_in',
    date: formatLocalDate(now),
    time: formatLocalTime(now),
    notes: '',
  }
}

function formatLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function formatLocalTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const EVENT_TYPES = [
  { value: 'clock_in', label: 'Inizio turno' },
  { value: 'clock_out', label: 'Fine turno' },
  { value: 'break_start', label: 'Inizio pausa' },
  { value: 'break_end', label: 'Fine pausa' },
]

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 transition'

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

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Trash2, Play, Square, Coffee } from 'lucide-react'

const EVENT_TYPES = [
  { value: 'clock_in', label: 'Inizio turno', Icon: Play },
  { value: 'clock_out', label: 'Fine turno', Icon: Square },
  { value: 'break_start', label: 'Inizio pausa', Icon: Coffee },
  { value: 'break_end', label: 'Fine pausa', Icon: Play },
]

export default function TimeEntryFormModal({ entry, staff, preset, onClose, onSaved }) {
  const isEdit = !!entry

  const [form, setForm] = useState(() => {
    if (entry) {
      const t = new Date(entry.event_time)
      return {
        staff_id: entry.staff_id,
        event_type: entry.event_type,
        date: toDateInputValue(t),
        time: `${pad2(t.getHours())}:${pad2(t.getMinutes())}`,
        notes: entry.notes || '',
      }
    }
    if (preset) {
      const t = new Date(preset.event_time || new Date())
      return {
        staff_id: preset.staff_id || '',
        event_type: preset.event_type || 'clock_in',
        date: toDateInputValue(t),
        time: `${pad2(t.getHours())}:${pad2(t.getMinutes())}`,
        notes: preset.notes || '',
      }
    }
    const now = new Date()
    return {
      staff_id: '',
      event_type: 'clock_in',
      date: toDateInputValue(now),
      time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
      notes: '',
    }
  })
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const eventTime = new Date(form.date + 'T' + form.time + ':00')
      if (isNaN(eventTime.getTime())) throw new Error('Data o ora non valide')

      const payload = {
        staff_id: form.staff_id,
        event_type: form.event_type,
        event_time: eventTime.toISOString(),
        notes: form.notes.trim() || null,
        // Niente coordinate per timbratura manuale → trigger DB lascia distance/geofence a NULL
      }

      // Se il modal è stato aperto da un flusso che conosce il turno (es. il
      // todo "Timbrature mancanti" passa preset.shift_id), l'inserimento
      // manuale DEVE portarlo: senza aggancio la timbratura non attraversa
      // nessuna regola (niente scheduled_start/end, niente effective_time) e
      // il turno resta con entrata/uscita orfana.
      if (!isEdit && preset?.shift_id) {
        payload.shift_id = preset.shift_id
      }

      if (isEdit) {
        const { error } = await supabase
          .from('time_entries')
          .update(payload)
          .eq('id', entry.id)
        if (error) throw error
        onSaved('Timbratura modificata')
      } else {
        const { error } = await supabase.from('time_entries').insert(payload)
        if (error) throw error
        onSaved('Timbratura aggiunta')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Eliminare questa timbratura? Operazione irreversibile.')) return
    setDeleting(true)
    const { error } = await supabase.from('time_entries').delete().eq('id', entry.id)
    setDeleting(false)
    if (error) setError(error.message)
    else onSaved('Timbratura eliminata')
  }

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-lg w-full max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <h2 className="text-2xl text-warm-dark">
            {isEdit ? 'Modifica timbratura' : 'Aggiungi timbratura'}
          </h2>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {!isEdit && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 font-sans text-xs text-amber-800">
              ℹ️ Le timbrature inserite manualmente non hanno coordinate GPS. Verranno marcate come "manuali" nella timeline.
            </div>
          )}

          <Field label="Dipendente" required>
            <select required value={form.staff_id}
              onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
              disabled={isEdit}
              className={inputCls + (isEdit ? ' opacity-60 cursor-not-allowed' : '')}>
              <option value="">— Seleziona —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </select>
            {isEdit && (
              <p className="font-sans text-xs text-warm-brown/70 mt-1">
                Il dipendente non si può cambiare. Per spostare la timbratura, elimina e ricrea.
              </p>
            )}
          </Field>

          <Field label="Tipo evento" required>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.map((t) => {
                const isSelected = form.event_type === t.value
                return (
                  <button key={t.value} type="button"
                    onClick={() => setForm({ ...form, event_type: t.value })}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl font-sans text-sm font-semibold border transition ${
                      isSelected
                        ? 'border-terracotta-400 bg-terracotta-50 text-warm-dark'
                        : 'border-cream-300 bg-white text-warm-brown hover:border-terracotta-200'
                    }`}>
                    <t.Icon size={16} />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data" required>
              <input type="date" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputCls} />
            </Field>
            <Field label="Ora" required>
              <input type="time" required value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className={inputCls} />
            </Field>
          </div>

          <Field label="Note (opzionale)">
            <input type="text" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="es. dimenticata timbra uscita, correzione manuale..."
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

function pad2(n) { return String(n).padStart(2, '0') }

// Restituisce YYYY-MM-DD nel timezone locale (NON in UTC)
function toDateInputValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

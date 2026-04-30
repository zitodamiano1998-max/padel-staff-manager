import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { combineDateTime, calcHoursFromTimestamps } from '../lib/dateUtils'
import { X, Plus, Pencil, Trash2, Moon } from 'lucide-react'

export default function TemplatesModal({ roles, onClose, onUpdate }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null) // null=lista, 'new'=nuovo, '<uuid>'=edit
  const [form, setForm] = useState(initialForm())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchTemplates() }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('shift_templates')
      .select('*, roles(id, name, color)')
      .order('start_time')
    if (!error) setTemplates(data || [])
    setLoading(false)
  }

  // Auto-suggest ends_next_day quando l'end <= start
  useEffect(() => {
    if (!form.start_time || !form.end_time) return
    const startMin = timeToMinutes(form.start_time)
    const endMin = timeToMinutes(form.end_time)
    if (endMin <= startMin && !form.ends_next_day) {
      setForm((f) => ({ ...f, ends_next_day: true }))
    }
  }, [form.start_time, form.end_time])

  const startNew = () => {
    setForm(initialForm())
    setEditingId('new')
    setError(null)
  }

  const startEdit = (t) => {
    setForm({
      name: t.name,
      role_id: t.role_id || '',
      start_time: t.start_time?.slice(0, 5) || '09:00',
      end_time: t.end_time?.slice(0, 5) || '13:00',
      ends_next_day: t.ends_next_day || false,
      break_minutes: t.break_minutes || 0,
    })
    setEditingId(t.id)
    setError(null)
  }

  const cancel = () => { setEditingId(null); setError(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        role_id: form.role_id || null,
        start_time: form.start_time + ':00',
        end_time: form.end_time + ':00',
        ends_next_day: form.ends_next_day,
        break_minutes: parseInt(form.break_minutes) || 0,
      }
      if (editingId === 'new') {
        const { error } = await supabase.from('shift_templates').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from('shift_templates').update(payload).eq('id', editingId)
        if (error) throw error
      }
      await fetchTemplates()
      if (onUpdate) onUpdate()
      cancel()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo template? I turni già creati non verranno toccati.')) return
    const { error } = await supabase.from('shift_templates').delete().eq('id', id)
    if (!error) {
      await fetchTemplates()
      if (onUpdate) onUpdate()
    }
  }

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-2xl w-full my-8 max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200">
          <div>
            <h2 className="text-2xl text-warm-dark">Template turni</h2>
            <p className="font-sans text-sm text-warm-brown mt-0.5">
              Configurazioni rapide per turni ricorrenti
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">

          {/* Form (quando aperto) */}
          {editingId !== null && (
            <form onSubmit={handleSubmit}
              className="bg-cream-50 border border-cream-300 rounded-xl p-5 mb-6 space-y-4">

              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg text-warm-dark">
                  {editingId === 'new' ? 'Nuovo template' : 'Modifica template'}
                </h3>
                <button type="button" onClick={cancel}
                  className="p-1 rounded-lg hover:bg-cream-200 text-warm-brown">
                  <X size={16} />
                </button>
              </div>

              <Field label="Nome template" required>
                <input type="text" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="es. Mattino bar, Chiusura serale..."
                  className={inputCls} />
              </Field>

              <Field label="Ruolo">
                <select value={form.role_id}
                  onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                  className={inputCls}>
                  <option value="">— Nessun ruolo specifico —</option>
                  {roles.filter((r) => r.name !== 'Manager').map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Inizio" required>
                  <input type="time" required value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className={inputCls} />
                </Field>
                <Field label="Fine" required>
                  <input type="time" required value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    className={inputCls} />
                </Field>
                <Field label="Pausa (min)">
                  <input type="number" min="0" max="240" step="15" value={form.break_minutes}
                    onChange={(e) => setForm({ ...form, break_minutes: e.target.value })}
                    className={inputCls} />
                </Field>
              </div>

              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                form.ends_next_day
                  ? 'border-terracotta-300 bg-terracotta-50'
                  : 'border-cream-300 bg-white hover:border-terracotta-200'
              }`}>
                <input type="checkbox" checked={form.ends_next_day}
                  onChange={(e) => setForm({ ...form, ends_next_day: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-terracotta-400" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-sans text-sm font-semibold text-warm-dark">
                    <Moon size={14} /> Termina il giorno seguente
                  </div>
                  <div className="font-sans text-xs text-warm-brown mt-0.5">
                    Spunta se il template sfora la mezzanotte (es. 22:00 → 01:00).
                  </div>
                </div>
              </label>

              {error && (
                <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={cancel}
                  className="px-4 py-2 rounded-xl font-sans font-semibold text-sm text-warm-dark hover:bg-cream-200 transition">
                  Annulla
                </button>
                <button type="submit" disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold text-sm transition shadow-sm">
                  {submitting ? 'Salvataggio...' : (editingId === 'new' ? 'Crea template' : 'Salva')}
                </button>
              </div>
            </form>
          )}

          {/* Bottone "Nuovo" e lista */}
          {editingId === null && (
            <button onClick={startNew}
              className="w-full mb-4 flex items-center justify-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold py-3 rounded-xl transition shadow-sm">
              <Plus size={16} /> Nuovo template
            </button>
          )}

          {loading ? (
            <div className="text-center py-8 text-warm-brown font-sans">Caricamento...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 px-6 border border-dashed border-cream-300 rounded-xl">
              <p className="font-sans text-warm-brown text-sm">
                Nessun template ancora.<br />
                Creane uno per applicarlo rapidamente ai turni.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <TemplateRow key={t.id}
                  template={t}
                  isEditing={editingId === t.id}
                  onEdit={() => startEdit(t)}
                  onDelete={() => handleDelete(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TemplateRow({ template, isEditing, onEdit, onDelete }) {
  const color = template.roles?.color || '#C97D60'
  const startStr = template.start_time?.slice(0, 5)
  const endStr = template.end_time?.slice(0, 5)
  const hours = calcTemplateHours(
    template.start_time, template.end_time,
    template.ends_next_day, template.break_minutes
  )

  return (
    <div className={`flex items-center gap-4 p-3 rounded-xl border transition ${
      isEditing
        ? 'border-terracotta-400 bg-terracotta-50'
        : 'border-cream-300 bg-white hover:bg-cream-50'
    }`}>
      <div className="w-10 h-10 rounded-lg flex-shrink-0"
        style={{ backgroundColor: color + '22', borderLeft: `4px solid ${color}` }} />
      <div className="flex-1 min-w-0">
        <div className="font-sans font-semibold text-warm-dark truncate">
          {template.name}
        </div>
        <div className="font-sans text-xs text-warm-brown">
          {startStr} – {endStr}{template.ends_next_day ? ' +1' : ''}
          {' · '}{hours.toFixed(1)}h
          {template.break_minutes > 0 ? ` (pausa ${template.break_minutes}min)` : ''}
          {template.roles?.name ? ` · ${template.roles.name}` : ''}
        </div>
      </div>
      <button onClick={onEdit}
        className="p-2 rounded-lg hover:bg-cream-200 text-warm-brown hover:text-warm-dark transition"
        title="Modifica">
        <Pencil size={14} />
      </button>
      <button onClick={onDelete}
        className="p-2 rounded-lg hover:bg-terracotta-50 text-terracotta-700 transition"
        title="Elimina">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ---- Helpers ----

function initialForm() {
  return {
    name: '',
    role_id: '',
    start_time: '09:00',
    end_time: '13:00',
    ends_next_day: false,
    break_minutes: 0,
  }
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function calcTemplateHours(start, end, endsNextDay, breakMin) {
  const dummy = '2000-01-01'
  const s = combineDateTime(dummy, start.slice(0, 5), false)
  const e = combineDateTime(dummy, end.slice(0, 5), endsNextDay)
  return calcHoursFromTimestamps(s, e, breakMin)
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

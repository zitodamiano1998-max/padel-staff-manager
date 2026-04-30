import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { combineDateTime } from '../lib/dateUtils'
import { Plus, Trash2, Calendar, X, Moon } from 'lucide-react'

export default function Availability() {
  const { profile } = useAuth()
  const isManager = profile?.is_manager

  const [staff, setStaff] = useState([])
  const [items, setItems] = useState([])
  const [filterStaffId, setFilterStaffId] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    const promises = [
      supabase
        .from('availability')
        .select('*, staff_members(id, first_name, last_name)')
        .order('start_at'),
    ]
    if (isManager) {
      promises.push(
        supabase
          .from('staff_members')
          .select('id, first_name, last_name')
          .eq('is_active', true)
          .order('first_name')
      )
    }
    const [aRes, sRes] = await Promise.all(promises)
    if (aRes.error) setError(aRes.error.message)
    else setItems(aRes.data || [])
    if (sRes && !sRes.error) setStaff(sRes.data || [])
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questa indisponibilità?')) return
    const { error } = await supabase.from('availability').delete().eq('id', id)
    if (error) setError(error.message)
    else fetchData()
  }

  // Filtro + solo future (end_at >= ora)
  const now = new Date()
  const upcoming = items.filter((a) => {
    if (filterStaffId && a.staff_id !== filterStaffId) return false
    return new Date(a.end_at) >= now
  })

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl text-warm-dark mb-1">Disponibilità</h1>
          <p className="font-sans text-sm text-warm-brown max-w-2xl">
            {isManager
              ? 'Indisponibilità dichiarate dallo staff. Quando crei un turno in uno di questi slot, l\'app blocca il salvataggio.'
              : 'Inserisci i giorni e gli orari nei quali NON puoi lavorare. Il manager non potrà programmarti turni in questi slot.'}
          </p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm flex-shrink-0">
          <Plus size={16} /> Nuova indisponibilità
        </button>
      </div>

      {/* Filtro manager */}
      {isManager && (
        <div className="mb-4">
          <select value={filterStaffId} onChange={(e) => setFilterStaffId(e.target.value)}
            className="px-4 py-2 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 transition">
            <option value="">Tutti i dipendenti</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
      ) : upcoming.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-cream-300 p-12 text-center">
          <Calendar size={32} className="mx-auto mb-3 text-warm-brown/40" />
          <p className="font-sans text-warm-brown text-sm">
            Nessuna indisponibilità futura registrata.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map((a) => (
            <AvailabilityRow key={a.id}
              item={a}
              showName={isManager}
              canDelete={isManager || a.staff_id === profile?.id}
              onDelete={() => handleDelete(a.id)} />
          ))}
        </div>
      )}

      {modalOpen && (
        <AvailabilityFormModal
          isManager={isManager}
          staff={staff}
          currentStaffId={profile?.id}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchData() }}
        />
      )}
    </div>
  )
}

function AvailabilityRow({ item, showName, canDelete, onDelete }) {
  const start = new Date(item.start_at)
  const end = new Date(item.end_at)
  // Considero "all day" se start = 00:00 e end = 00:00 del giorno dopo (o successivo)
  const isAllDay =
    start.getHours() === 0 && start.getMinutes() === 0 &&
    end.getHours() === 0 && end.getMinutes() === 0
  const lastDay = new Date(end.getTime() - 1) // l'ultimo giorno coperto
  const sameDay = start.toDateString() === lastDay.toDateString()

  let timeLabel
  if (isAllDay && sameDay) {
    timeLabel = (
      <>
        {start.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
        <span className="ml-2 text-terracotta-700 font-semibold">· tutto il giorno</span>
      </>
    )
  } else if (isAllDay) {
    timeLabel = (
      <>
        Dal{' '}
        <strong>{start.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</strong>
        {' '}al{' '}
        <strong>{lastDay.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</strong>
        <span className="ml-2 text-terracotta-700 font-semibold">· tutto il giorno</span>
      </>
    )
  } else {
    const h = (s) => s.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const d = (s) => s.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
    timeLabel = sameDay
      ? <>{d(start)} · {h(start)} – {h(end)}</>
      : <>{d(start)} {h(start)} → {d(end)} {h(end)}</>
  }

  return (
    <div className="flex items-start gap-4 bg-white rounded-xl border border-cream-300 p-4">
      <div className="w-10 h-10 rounded-lg bg-terracotta-100 text-terracotta-700 flex items-center justify-center flex-shrink-0">
        <Moon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        {showName && (
          <div className="font-sans font-semibold text-warm-dark truncate">
            {item.staff_members?.first_name} {item.staff_members?.last_name}
          </div>
        )}
        <div className={`font-sans text-sm text-warm-brown ${showName ? 'mt-0.5' : ''}`}>
          {timeLabel}
        </div>
        {item.reason && (
          <div className="font-sans text-sm text-warm-dark/80 mt-1 italic">
            "{item.reason}"
          </div>
        )}
      </div>
      {canDelete && (
        <button onClick={onDelete}
          className="p-2 rounded-lg hover:bg-terracotta-50 text-terracotta-700 transition flex-shrink-0"
          title="Elimina">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}

function AvailabilityFormModal({ isManager, staff, currentStaffId, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    staff_id: isManager ? '' : currentStaffId || '',
    start_date: today,
    start_time: '09:00',
    end_date: today,
    end_time: '18:00',
    reason: '',
    all_day: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      let startAt, endAt
      if (form.all_day) {
        startAt = combineDateTime(form.start_date, '00:00', false)
        // Fine = inizio del giorno SUCCESSIVO a end_date
        const ed = new Date(form.end_date + 'T00:00:00')
        ed.setDate(ed.getDate() + 1)
        endAt = ed
      } else {
        startAt = combineDateTime(form.start_date, form.start_time, false)
        endAt = combineDateTime(form.end_date, form.end_time, false)
      }
      if (endAt <= startAt) {
        throw new Error("La fine deve essere successiva all'inizio.")
      }
      const payload = {
        staff_id: form.staff_id,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        reason: form.reason.trim() || null,
      }
      const { error } = await supabase.from('availability').insert(payload)
      if (error) throw error
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-lg w-full max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <h2 className="text-2xl text-warm-dark">Nuova indisponibilità</h2>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {isManager && (
            <Field label="Dipendente" required>
              <select required value={form.staff_id}
                onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
                className={inputCls}>
                <option value="">— Seleziona —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
            </Field>
          )}

          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
            form.all_day ? 'border-terracotta-300 bg-terracotta-50' : 'border-cream-300 bg-white hover:border-terracotta-200'
          }`}>
            <input type="checkbox" checked={form.all_day}
              onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-terracotta-400" />
            <div>
              <div className="font-sans text-sm font-semibold text-warm-dark">Tutto il giorno</div>
              <div className="font-sans text-xs text-warm-brown mt-0.5">
                Spunta se l'indisponibilità copre uno o più giorni interi (senza orari specifici).
              </div>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data inizio" required>
              <input type="date" required value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className={inputCls} />
            </Field>
            {!form.all_day && (
              <Field label="Ora inizio" required>
                <input type="time" required value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  className={inputCls} />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data fine" required>
              <input type="date" required value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className={inputCls} />
            </Field>
            {!form.all_day && (
              <Field label="Ora fine" required>
                <input type="time" required value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  className={inputCls} />
              </Field>
            )}
          </div>

          <Field label="Motivo (opzionale)">
            <input type="text" value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="es. visita medica, esame, impegno familiare..."
              className={inputCls} />
          </Field>

          {error && (
            <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cream-200 flex-shrink-0 bg-white rounded-b-2xl">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-sans font-semibold text-sm text-warm-dark hover:bg-cream-100 transition">
            Annulla
          </button>
          <button type="submit" disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold text-sm transition shadow-sm">
            {submitting ? 'Salvataggio...' : 'Salva'}
          </button>
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

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { X, Calendar } from 'lucide-react'
import { formatDayLong, formatTimeFromISO } from '../lib/dateUtils'

export default function SwapCreateModal({ currentStaffId, isManager, onClose, onSaved }) {
  const [staffList, setStaffList] = useState([])
  const [selectedStaffId, setSelectedStaffId] = useState(currentStaffId || '')
  const [shifts, setShifts] = useState([])
  const [shiftsLoading, setShiftsLoading] = useState(false)
  const [busyShiftIds, setBusyShiftIds] = useState(new Set())

  const [form, setForm] = useState({
    requester_shift_id: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Manager carica la lista staff per scegliere chi cede
  useEffect(() => {
    if (!isManager) return
    supabase
      .from('staff_members')
      .select('id, first_name, last_name')
      .eq('is_active', true)
      .order('first_name')
      .then(({ data }) => setStaffList(data || []))
  }, [isManager])

  // Quando cambia lo staff selezionato → carica i suoi turni futuri
  useEffect(() => {
    if (!selectedStaffId) { setShifts([]); return }
    fetchShifts(selectedStaffId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaffId])

  const fetchShifts = async (staffId) => {
    setShiftsLoading(true)
    setForm((f) => ({ ...f, requester_shift_id: '' }))
    const nowIso = new Date().toISOString()
    const [shiftsRes, swapsRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('id, start_at, end_at, break_minutes, status, roles(id, name, color)')
        .eq('staff_id', staffId)
        .gte('start_at', nowIso)
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true })
        .limit(50),
      supabase
        .from('shift_swaps')
        .select('requester_shift_id')
        .in('status', ['open', 'proposed', 'approved']),
    ])
    if (!shiftsRes.error) setShifts(shiftsRes.data || [])
    if (!swapsRes.error) {
      setBusyShiftIds(new Set((swapsRes.data || []).map((s) => s.requester_shift_id)))
    }
    setShiftsLoading(false)
  }

  const availableShifts = useMemo(
    () => shifts.filter((s) => !busyShiftIds.has(s.id)),
    [shifts, busyShiftIds]
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.requester_shift_id) {
      setError('Seleziona un turno da cedere')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('shift_swaps').insert({
      swap_type: 'give_away',
      requester_id: selectedStaffId,
      requester_shift_id: form.requester_shift_id,
      notes: form.notes.trim() || null,
      status: 'open',
    })
    setSubmitting(false)
    if (error) setError(error.message)
    else onSaved('Richiesta inviata. Disponibile in bacheca.')
  }

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-lg w-full max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <h2 className="text-2xl text-warm-dark">Cedi un turno</h2>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          <div className="bg-cream-50 border border-cream-200 rounded-xl px-4 py-3 font-sans text-xs text-warm-brown">
            ℹ️ Pubblichi una richiesta in bacheca. Un collega potrà candidarsi e il manager approverà il passaggio.
          </div>

          {/* Manager: selezione dipendente */}
          {isManager && (
            <Field label="Dipendente che cede" required>
              <select required value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className={inputCls}>
                <option value="">— Seleziona —</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Selezione turno */}
          <Field label="Turno da cedere" required>
            {shiftsLoading ? (
              <div className="px-3 py-2.5 rounded-xl bg-cream-50 border border-cream-300 font-sans text-sm text-warm-brown">
                Caricamento turni…
              </div>
            ) : availableShifts.length === 0 ? (
              <div className="px-3 py-3 rounded-xl bg-cream-50 border border-dashed border-cream-300 font-sans text-sm text-warm-brown text-center">
                <Calendar size={20} className="mx-auto mb-1 text-warm-brown/40" />
                {selectedStaffId ? 'Nessun turno futuro disponibile' : 'Seleziona prima il dipendente'}
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {availableShifts.map((s) => {
                  const sel = form.requester_shift_id === s.id
                  const start = new Date(s.start_at)
                  const isDraft = s.status === 'draft'
                  const color = s.roles?.color || '#C97D60'
                  const hours = ((new Date(s.end_at) - start) / 3600000 - (s.break_minutes || 0) / 60).toFixed(1)
                  return (
                    <button key={s.id} type="button"
                      onClick={() => setForm({ ...form, requester_shift_id: s.id })}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition flex items-center gap-3 ${
                        sel
                          ? 'border-terracotta-400 bg-terracotta-50'
                          : 'border-cream-300 bg-white hover:border-terracotta-200'
                      }`}>
                      <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-sans font-semibold text-warm-dark text-sm capitalize">
                          {formatDayLong(start)}
                          {isDraft && <span className="ml-2 text-xs font-normal text-amber-700 italic">· bozza</span>}
                        </div>
                        <div className="font-sans text-xs text-warm-brown">
                          {formatTimeFromISO(s.start_at)} – {formatTimeFromISO(s.end_at)} · {hours}h · {s.roles?.name || '—'}
                        </div>
                      </div>
                      <input type="radio" checked={sel} readOnly
                        className="w-4 h-4 accent-terracotta-400" />
                    </button>
                  )
                })}
              </div>
            )}
          </Field>

          {/* Note */}
          <Field label="Motivo (opzionale)">
            <textarea value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="es. visita medica, esame universitario, viaggio…"
              rows={3}
              className={inputCls + ' resize-none'} />
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
          <button type="submit" disabled={submitting || !form.requester_shift_id}
            className="px-5 py-2.5 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-cream-300 disabled:text-warm-brown disabled:cursor-not-allowed text-white font-sans font-semibold text-sm transition shadow-sm">
            {submitting ? 'Invio…' : 'Pubblica in bacheca'}
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

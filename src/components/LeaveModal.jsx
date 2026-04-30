import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Check, XCircle, Palmtree, Calendar, Stethoscope, FileText } from 'lucide-react'

const TYPES = [
  { value: 'vacation', label: 'Ferie', Icon: Palmtree },
  { value: 'personal', label: 'Permesso', Icon: Calendar },
  { value: 'sick', label: 'Malattia', Icon: Stethoscope },
  { value: 'unpaid', label: 'Non retribuita', Icon: FileText },
  { value: 'other', label: 'Altro', Icon: FileText },
]

export default function LeaveModal({ mode, leave, isManager, staff, currentStaffId, onClose, onSaved }) {
  const isReview = mode === 'review'
  const isEdit = mode === 'edit'
  const isCreate = mode === 'create'

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState(() => {
    if (leave) {
      return {
        staff_id: leave.staff_id,
        leave_type: leave.leave_type,
        start_date: leave.start_date,
        end_date: leave.end_date,
        is_half_day: leave.is_half_day,
        half_day_period: leave.half_day_period || 'morning',
        reason: leave.reason || '',
      }
    }
    return {
      staff_id: isManager ? '' : currentStaffId || '',
      leave_type: 'vacation',
      start_date: today,
      end_date: today,
      is_half_day: false,
      half_day_period: 'morning',
      reason: '',
    }
  })
  const [reviewNotes, setReviewNotes] = useState(leave?.review_notes || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Auto-disabilita half_day se le date sono diverse
  const sameDay = form.start_date === form.end_date

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (new Date(form.end_date) < new Date(form.start_date)) {
        throw new Error('La data fine deve essere uguale o successiva alla data inizio.')
      }
      const isHalf = sameDay ? form.is_half_day : false
      const payload = {
        staff_id: form.staff_id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        is_half_day: isHalf,
        half_day_period: isHalf ? form.half_day_period : null,
        reason: form.reason.trim() || null,
      }
      if (isCreate) {
        const { error } = await supabase.from('leave_requests').insert(payload)
        if (error) throw error
        onSaved('Richiesta inviata')
      } else {
        const { error } = await supabase
          .from('leave_requests')
          .update(payload)
          .eq('id', leave.id)
        if (error) throw error
        onSaved('Richiesta aggiornata')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReview = async (newStatus) => {
    setError(null)
    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: newStatus,
          review_notes: reviewNotes.trim() || null,
          reviewed_by: currentStaffId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', leave.id)
      if (error) throw error
      onSaved(newStatus === 'approved' ? 'Richiesta approvata' : 'Richiesta rifiutata')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const title = isReview ? 'Valuta richiesta' : isEdit ? 'Modifica richiesta' : 'Nuova richiesta'

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={isReview ? (e) => e.preventDefault() : handleSubmit}
        className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-lg w-full max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <h2 className="text-2xl text-warm-dark">{title}</h2>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* In review mostro dipendente come info */}
          {isReview && leave?.staff_members && (
            <div className="bg-cream-50 border border-cream-300 rounded-xl px-4 py-3">
              <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-0.5">Dipendente</div>
              <div className="font-sans font-semibold text-warm-dark">
                {leave.staff_members.first_name} {leave.staff_members.last_name}
              </div>
            </div>
          )}

          {/* Dipendente (manager) - solo create/edit */}
          {!isReview && isManager && (
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
            </Field>
          )}

          {/* Tipo richiesta */}
          <Field label="Tipo">
            {isReview ? (
              <div className="px-3 py-2.5 rounded-xl bg-cream-50 border border-cream-300 font-sans text-sm font-semibold text-warm-dark">
                {TYPES.find((t) => t.value === form.leave_type)?.label}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {TYPES.map((t) => {
                  const sel = form.leave_type === t.value
                  return (
                    <button key={t.value} type="button"
                      onClick={() => setForm({ ...form, leave_type: t.value })}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl font-sans text-sm font-semibold border transition ${
                        sel
                          ? 'border-terracotta-400 bg-terracotta-50 text-warm-dark'
                          : 'border-cream-300 bg-white text-warm-brown hover:border-terracotta-200'
                      }`}>
                      <t.Icon size={16} />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>

          {/* Date */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data inizio" required>
              <input type="date" required value={form.start_date}
                disabled={isReview}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className={inputCls + (isReview ? ' opacity-60 cursor-not-allowed' : '')} />
            </Field>
            <Field label="Data fine" required>
              <input type="date" required value={form.end_date}
                disabled={isReview}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className={inputCls + (isReview ? ' opacity-60 cursor-not-allowed' : '')} />
            </Field>
          </div>

          {/* Mezza giornata (solo se sameDay) */}
          {!isReview && sameDay && (
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
              form.is_half_day ? 'border-terracotta-300 bg-terracotta-50' : 'border-cream-300 bg-white hover:border-terracotta-200'
            }`}>
              <input type="checkbox" checked={form.is_half_day}
                onChange={(e) => setForm({ ...form, is_half_day: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-terracotta-400" />
              <div className="flex-1">
                <div className="font-sans text-sm font-semibold text-warm-dark">Mezza giornata</div>
                {form.is_half_day && (
                  <div className="flex gap-2 mt-2">
                    <button type="button"
                      onClick={() => setForm({ ...form, half_day_period: 'morning' })}
                      className={`flex-1 px-3 py-1.5 rounded-lg font-sans text-sm font-semibold border transition ${
                        form.half_day_period === 'morning'
                          ? 'border-terracotta-400 bg-terracotta-100 text-warm-dark'
                          : 'border-cream-300 bg-white text-warm-brown'
                      }`}>
                      Mattina
                    </button>
                    <button type="button"
                      onClick={() => setForm({ ...form, half_day_period: 'afternoon' })}
                      className={`flex-1 px-3 py-1.5 rounded-lg font-sans text-sm font-semibold border transition ${
                        form.half_day_period === 'afternoon'
                          ? 'border-terracotta-400 bg-terracotta-100 text-warm-dark'
                          : 'border-cream-300 bg-white text-warm-brown'
                      }`}>
                      Pomeriggio
                    </button>
                  </div>
                )}
              </div>
            </label>
          )}

          {/* Motivo */}
          <Field label={isReview ? 'Motivo del dipendente' : 'Motivo (opzionale)'}>
            {isReview ? (
              <div className="px-3 py-2.5 rounded-xl bg-cream-50 border border-cream-300 font-sans text-sm text-warm-dark min-h-[2.5rem]">
                {form.reason || <span className="italic text-warm-brown">Nessun motivo specificato</span>}
              </div>
            ) : (
              <textarea value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="es. matrimonio, viaggio già pianificato, visita medica..."
                rows={3}
                className={inputCls + ' resize-none'} />
            )}
          </Field>

          {/* Note review (solo manager in mode review) */}
          {isReview && (
            <Field label="Note (opzionale)">
              <textarea value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Aggiungi una nota alla decisione..."
                rows={2}
                className={inputCls + ' resize-none'} />
            </Field>
          )}

          {error && (
            <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cream-200 flex-shrink-0 bg-white rounded-b-2xl">
          {isReview ? (
            <>
              <button type="button" onClick={onClose}
                className="px-5 py-2.5 rounded-xl font-sans font-semibold text-sm text-warm-dark hover:bg-cream-100 transition">
                Annulla
              </button>
              <button type="button" onClick={() => handleReview('rejected')} disabled={submitting}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-sans font-semibold text-sm transition shadow-sm">
                <XCircle size={16} /> Rifiuta
              </button>
              <button type="button" onClick={() => handleReview('approved')} disabled={submitting}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sage-500 hover:bg-sage-600 disabled:bg-sage-300 text-white font-sans font-semibold text-sm transition shadow-sm">
                <Check size={16} /> Approva
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose}
                className="px-5 py-2.5 rounded-xl font-sans font-semibold text-sm text-warm-dark hover:bg-cream-100 transition">
                Annulla
              </button>
              <button type="submit" disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold text-sm transition shadow-sm">
                {submitting ? 'Invio...' : (isCreate ? 'Invia richiesta' : 'Salva')}
              </button>
            </>
          )}
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

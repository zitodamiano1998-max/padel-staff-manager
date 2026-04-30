import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Check, XCircle, ArrowRight } from 'lucide-react'
import { formatDayLong, formatTimeFromISO } from '../lib/dateUtils'

export default function SwapReviewModal({ swap, onClose, onSaved }) {
  const [notes, setNotes] = useState(swap.review_notes || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const requester = swap.requester
  const target = swap.target
  const shift = swap.shift

  const start = new Date(shift.start_at)
  const end = new Date(shift.end_at)
  const hours = ((end - start) / 3600000 - (shift.break_minutes || 0) / 60).toFixed(1)
  const color = shift.roles?.color || '#C97D60'

  const doAction = async (rpcName) => {
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.rpc(rpcName, {
      p_swap_id: swap.id,
      p_notes: notes.trim() || null,
    })
    setSubmitting(false)
    if (error) setError(error.message)
    else onSaved(rpcName === 'approve_swap' ? 'Scambio approvato. Turno trasferito.' : 'Scambio rifiutato')
  }

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-lg w-full max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <h2 className="text-2xl text-warm-dark">Valuta scambio</h2>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Riepilogo cambio ownership */}
          <div className="bg-cream-50 border border-cream-200 rounded-xl p-4">
            <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-3">
              Cosa stai approvando
            </div>
            <div className="flex items-center gap-3">
              <Person person={requester} sublabel="cede" />
              <ArrowRight size={20} className="text-warm-brown flex-shrink-0" />
              <Person person={target} sublabel="riceve" />
            </div>
          </div>

          {/* Turno coinvolto */}
          <div className="rounded-xl border border-cream-200 p-4 bg-white"
            style={{ borderLeftWidth: 4, borderLeftColor: color }}>
            <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-1">Turno</div>
            <div className="font-sans font-semibold text-warm-dark capitalize">{formatDayLong(start)}</div>
            <div className="font-sans text-sm text-warm-brown mt-0.5">
              {formatTimeFromISO(shift.start_at)} – {formatTimeFromISO(shift.end_at)} · {hours}h · {shift.roles?.name || '—'}
            </div>
          </div>

          {/* Motivo richiedente */}
          {swap.notes && (
            <div>
              <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-1">
                Motivo del richiedente
              </div>
              <div className="font-sans text-sm text-warm-dark italic bg-cream-50 rounded-lg px-3 py-2">
                "{swap.notes}"
              </div>
            </div>
          )}

          {/* Note manager */}
          <div>
            <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
              Note (opzionale)
            </label>
            <textarea value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Aggiungi una nota alla decisione..."
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 transition resize-none" />
          </div>

          {error && (
            <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm">
              {error}
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 font-sans text-xs text-amber-800">
            ⚠️ Approvando, il turno passerà definitivamente da{' '}
            <strong>{requester?.first_name}</strong> a <strong>{target?.first_name}</strong>. L'operazione è atomica e immediata.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cream-200 flex-shrink-0 bg-white rounded-b-2xl">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-sans font-semibold text-sm text-warm-dark hover:bg-cream-100 transition">
            Annulla
          </button>
          <button type="button" onClick={() => doAction('reject_swap')} disabled={submitting}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-sans font-semibold text-sm transition shadow-sm">
            <XCircle size={16} /> Rifiuta
          </button>
          <button type="button" onClick={() => doAction('approve_swap')} disabled={submitting}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sage-500 hover:bg-sage-600 disabled:bg-sage-300 text-white font-sans font-semibold text-sm transition shadow-sm">
            <Check size={16} /> Approva
          </button>
        </div>
      </div>
    </div>
  )
}

function Person({ person, sublabel }) {
  if (!person) return <div className="font-sans text-sm text-warm-brown">—</div>
  const color = person.roles?.color || '#C97D60'
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-serif font-semibold text-sm flex-shrink-0"
        style={{ backgroundColor: color }}>
        {person.first_name?.[0]}{person.last_name?.[0]}
      </div>
      <div className="min-w-0">
        <div className="font-sans text-[10px] uppercase tracking-wider text-warm-brown leading-none">{sublabel}</div>
        <div className="font-sans text-sm font-semibold text-warm-dark truncate">
          {person.first_name} {person.last_name}
        </div>
      </div>
    </div>
  )
}

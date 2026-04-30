import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import SwapCreateModal from '../components/SwapCreateModal'
import SwapReviewModal from '../components/SwapReviewModal'
import {
  Plus, ArrowLeftRight, AlertCircle, Hand, X, Check, Clock as ClockIcon,
} from 'lucide-react'
import { formatDayLong, formatTimeFromISO } from '../lib/dateUtils'

const STATUS_INFO = {
  open: { label: 'Aperta', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  proposed: { label: 'In attesa di approvazione', bg: 'bg-terracotta-50', text: 'text-terracotta-700', border: 'border-terracotta-200' },
  approved: { label: 'Approvata', bg: 'bg-sage-50', text: 'text-sage-700', border: 'border-sage-200' },
  rejected: { label: 'Rifiutata', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  cancelled: { label: 'Annullata', bg: 'bg-cream-100', text: 'text-warm-brown', border: 'border-cream-300' },
}

export default function Swaps() {
  const { profile } = useAuth()
  const isManager = profile?.is_manager
  const myId = profile?.id

  const [swaps, setSwaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('active') // active | all | open | proposed | approved | rejected
  const [createOpen, setCreateOpen] = useState(false)
  const [reviewSwap, setReviewSwap] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('shift_swaps')
      .select(`
        *,
        requester:staff_members!shift_swaps_requester_id_fkey(id, first_name, last_name, roles(name, color)),
        target:staff_members!shift_swaps_target_id_fkey(id, first_name, last_name, roles(name, color)),
        shift:shifts!shift_swaps_requester_shift_id_fkey(
          id, start_at, end_at, break_minutes,
          roles(id, name, color)
        )
      `)
      .order('created_at', { ascending: false })
    if (!error) setSwaps(data || [])
    setLoading(false)
  }

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const filteredSwaps = useMemo(() => {
    if (filterStatus === 'active') {
      return swaps.filter((s) => s.status === 'open' || s.status === 'proposed')
    }
    if (filterStatus === 'all') return swaps
    return swaps.filter((s) => s.status === filterStatus)
  }, [swaps, filterStatus])

  const pendingForManager = useMemo(
    () => swaps.filter((s) => s.status === 'proposed').length,
    [swaps]
  )

  const openForOthers = useMemo(
    () => swaps.filter((s) => s.status === 'open' && s.requester_id !== myId).length,
    [swaps, myId]
  )

  // Action handlers
  const handleClaim = async (swap) => {
    if (!confirm(`Confermi di prenderti questo turno (${formatDayLong(new Date(swap.shift.start_at))} ${formatTimeFromISO(swap.shift.start_at)}–${formatTimeFromISO(swap.shift.end_at)})?`)) return
    const { error } = await supabase.rpc('claim_swap', { p_swap_id: swap.id })
    if (error) showToast('Errore: ' + error.message, 'error')
    else { showToast('Candidatura inviata. Resta in attesa di approvazione manager.'); fetchData() }
  }

  const handleUnclaim = async (swap) => {
    if (!confirm('Ritirare la tua candidatura?')) return
    const { error } = await supabase.rpc('unclaim_swap', { p_swap_id: swap.id })
    if (error) showToast('Errore: ' + error.message, 'error')
    else { showToast('Candidatura ritirata'); fetchData() }
  }

  const handleCancel = async (swap) => {
    if (!confirm('Annullare questa richiesta di scambio?')) return
    const { error } = await supabase
      .from('shift_swaps')
      .update({ status: 'cancelled' })
      .eq('id', swap.id)
    if (error) showToast('Errore: ' + error.message, 'error')
    else { showToast('Richiesta annullata'); fetchData() }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl text-warm-dark mb-1">Scambi turno</h1>
          <p className="font-sans text-sm text-warm-brown">
            Cedi un turno alla squadra. Un collega può candidarsi e il manager approva il passaggio.
          </p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm flex-shrink-0">
          <Plus size={16} /> Cedi un turno
        </button>
      </div>

      {/* Banner manager pending */}
      {isManager && pendingForManager > 0 && (
        <div className="bg-terracotta-50 border border-terracotta-300 rounded-xl px-5 py-3 mb-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-terracotta-600 flex-shrink-0" />
          <div className="font-sans text-sm text-terracotta-900 flex-1">
            <strong>{pendingForManager}</strong> {pendingForManager === 1 ? 'scambio da approvare' : 'scambi da approvare'}
          </div>
          <button onClick={() => setFilterStatus('proposed')}
            className="font-sans text-xs font-semibold text-terracotta-700 hover:text-terracotta-900 underline">
            Vedi →
          </button>
        </div>
      )}

      {/* Banner candidature aperte per dipendenti */}
      {!isManager && openForOthers > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-3 mb-4 flex items-center gap-3">
          <Hand size={18} className="text-amber-600 flex-shrink-0" />
          <div className="font-sans text-sm text-amber-900 flex-1">
            <strong>{openForOthers}</strong> {openForOthers === 1 ? 'turno disponibile' : 'turni disponibili'} dai colleghi
          </div>
          <button onClick={() => setFilterStatus('open')}
            className="font-sans text-xs font-semibold text-amber-700 hover:text-amber-900 underline">
            Vedi →
          </button>
        </div>
      )}

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex bg-cream-200 rounded-xl p-1">
          {[
            { v: 'active', label: 'Attivi' },
            { v: 'open', label: 'Aperti' },
            { v: 'proposed', label: 'In attesa' },
            { v: 'approved', label: 'Approvati' },
            { v: 'rejected', label: 'Rifiutati' },
            { v: 'all', label: 'Tutti' },
          ].map((opt) => (
            <button key={opt.v} onClick={() => setFilterStatus(opt.v)}
              className={`px-3 py-1.5 rounded-lg font-sans text-sm font-semibold transition ${
                filterStatus === opt.v ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown hover:text-warm-dark'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
      ) : filteredSwaps.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-cream-300 p-12 text-center">
          <ArrowLeftRight size={32} className="mx-auto mb-3 text-warm-brown/40" />
          <p className="font-sans text-warm-brown text-sm">
            Nessuno scambio in questa categoria.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSwaps.map((s) => (
            <SwapCard key={s.id}
              swap={s}
              myId={myId}
              isManager={isManager}
              onClaim={() => handleClaim(s)}
              onUnclaim={() => handleUnclaim(s)}
              onCancel={() => handleCancel(s)}
              onReview={() => setReviewSwap(s)} />
          ))}
        </div>
      )}

      {/* Modali */}
      {createOpen && (
        <SwapCreateModal
          currentStaffId={myId}
          isManager={isManager}
          onClose={() => setCreateOpen(false)}
          onSaved={(msg) => { setCreateOpen(false); fetchData(); showToast(msg) }} />
      )}

      {reviewSwap && (
        <SwapReviewModal
          swap={reviewSwap}
          onClose={() => setReviewSwap(null)}
          onSaved={(msg) => { setReviewSwap(null); fetchData(); showToast(msg) }} />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg font-sans text-sm z-50 ${
          toast.kind === 'error' ? 'bg-terracotta-600 text-white' : 'bg-sage-500 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ---- SwapCard ----

function SwapCard({ swap, myId, isManager, onClaim, onUnclaim, onCancel, onReview }) {
  const statusCfg = STATUS_INFO[swap.status]
  const requester = swap.requester
  const target = swap.target
  const shift = swap.shift

  const isMine = swap.requester_id === myId
  const isMyClaim = swap.target_id === myId

  // Date/orari del turno
  const start = shift ? new Date(shift.start_at) : null
  const end = shift ? new Date(shift.end_at) : null
  const dayLabel = start ? formatDayLong(start) : '—'
  const timeLabel = start && end ? `${formatTimeFromISO(shift.start_at)} – ${formatTimeFromISO(shift.end_at)}` : '—'
  const roleColor = shift?.roles?.color || '#C97D60'
  const roleName = shift?.roles?.name || '—'

  // Calcolo ore
  const hours = start && end
    ? ((end - start) / 3600000 - (shift.break_minutes || 0) / 60).toFixed(1)
    : '0'

  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-5">
      <div className="flex flex-col sm:flex-row gap-4">

        {/* Colonna sinistra: turno */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`font-sans text-xs font-semibold px-2 py-0.5 rounded-md border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
              {statusCfg.label}
            </span>
            <span className="font-sans text-xs text-warm-brown">
              {timeAgo(swap.created_at)}
            </span>
          </div>

          {/* Turno */}
          <div className="bg-cream-50 border border-cream-200 rounded-xl p-3 mb-3"
            style={{ borderLeftWidth: 4, borderLeftColor: roleColor }}>
            <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-0.5">Turno ceduto</div>
            <div className="font-sans font-semibold text-warm-dark capitalize">{dayLabel}</div>
            <div className="font-sans text-sm text-warm-brown mt-0.5">
              {timeLabel} · {hours}h · {roleName}
            </div>
          </div>

          {/* Persone */}
          <div className="flex flex-wrap items-center gap-3 font-sans text-sm">
            <PersonChip person={requester} label="Cede" />
            {target && (
              <>
                <ArrowLeftRight size={14} className="text-warm-brown flex-shrink-0" />
                <PersonChip person={target} label="Si candida" />
              </>
            )}
          </div>

          {/* Note */}
          {swap.notes && (
            <div className="font-sans text-sm text-warm-dark/80 italic mt-3 bg-cream-50 rounded-lg px-3 py-2">
              "{swap.notes}"
            </div>
          )}

          {/* Note review */}
          {swap.review_notes && (swap.status === 'approved' || swap.status === 'rejected') && (
            <div className={`font-sans text-sm mt-2 rounded-lg px-3 py-2 ${
              swap.status === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-sage-50 text-sage-700'
            }`}>
              <span className="font-semibold">Manager: </span>{swap.review_notes}
            </div>
          )}
        </div>

        {/* Colonna destra: azioni */}
        <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0 sm:w-auto">
          {/* Manager + proposed → Approva/Rifiuta */}
          {isManager && swap.status === 'proposed' && (
            <button onClick={onReview}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold text-sm transition shadow-sm">
              <ClockIcon size={14} /> Valuta
            </button>
          )}

          {/* Collega + open + non sono io → Mi candido */}
          {!isMine && swap.status === 'open' && (
            <button onClick={onClaim}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-sage-500 hover:bg-sage-600 text-white font-sans font-semibold text-sm transition shadow-sm">
              <Hand size={14} /> Lo prendo io
            </button>
          )}

          {/* Sono il candidato + proposed → Ritira candidatura */}
          {isMyClaim && swap.status === 'proposed' && (
            <button onClick={onUnclaim}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-cream-200 hover:bg-cream-300 text-warm-dark font-sans font-semibold text-sm transition">
              <X size={14} /> Ritira candidatura
            </button>
          )}

          {/* Sono il requester + non finalizzato → Annulla */}
          {isMine && (swap.status === 'open' || swap.status === 'proposed') && (
            <button onClick={onCancel}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-terracotta-700 hover:bg-terracotta-50 font-sans font-semibold text-sm transition">
              <X size={14} /> Annulla
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PersonChip({ person, label }) {
  if (!person) return null
  const color = person.roles?.color || '#C97D60'
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-serif font-semibold text-xs flex-shrink-0"
        style={{ backgroundColor: color }}>
        {person.first_name?.[0]}{person.last_name?.[0]}
      </div>
      <div>
        <div className="font-sans text-[10px] uppercase tracking-wider text-warm-brown leading-none">{label}</div>
        <div className="font-sans text-sm font-semibold text-warm-dark">
          {person.first_name} {person.last_name}
        </div>
      </div>
    </div>
  )
}

function timeAgo(isoString) {
  const ms = Date.now() - new Date(isoString).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'ora'
  if (m < 60) return `${m}m fa`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h fa`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}g fa`
  return new Date(isoString).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import LeaveModal from '../components/LeaveModal'
import {
  Plus, Calendar, Palmtree, Stethoscope, FileText, AlertCircle, Check, X,
  Pencil, Trash2, Clock as ClockIcon,
} from 'lucide-react'

const LEAVE_TYPES = {
  vacation: { label: 'Ferie', Icon: Palmtree, color: 'sage' },
  personal: { label: 'Permesso', Icon: Calendar, color: 'amber' },
  sick: { label: 'Malattia', Icon: Stethoscope, color: 'red' },
  unpaid: { label: 'Non retribuita', Icon: FileText, color: 'cream' },
  other: { label: 'Altro', Icon: FileText, color: 'cream' },
}

const STATUS_INFO = {
  pending: { label: 'In attesa', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  approved: { label: 'Approvata', bg: 'bg-sage-50', text: 'text-sage-700', border: 'border-sage-200' },
  rejected: { label: 'Rifiutata', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  cancelled: { label: 'Cancellata', bg: 'bg-cream-100', text: 'text-warm-brown', border: 'border-cream-300' },
}

export default function Leaves() {
  const { profile } = useAuth()
  const isManager = profile?.is_manager

  const [staff, setStaff] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)

  const [filterStatus, setFilterStatus] = useState('all') // all, pending, approved, rejected
  const [filterStaffId, setFilterStaffId] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create') // create | edit | review
  const [editingLeave, setEditingLeave] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const promises = [
      supabase
        .from('leave_requests')
        .select('*, staff_members!leave_requests_staff_id_fkey(id, first_name, last_name, roles(name, color))')
        .order('start_date', { ascending: false }),
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
    const [lRes, sRes] = await Promise.all(promises)
    if (!lRes.error) setLeaves(lRes.data || [])
    if (sRes && !sRes.error) setStaff(sRes.data || [])
    setLoading(false)
  }

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const filteredLeaves = useMemo(() => {
    return leaves.filter((l) => {
      if (filterStatus !== 'all' && l.status !== filterStatus) return false
      if (filterStaffId && l.staff_id !== filterStaffId) return false
      return true
    })
  }, [leaves, filterStatus, filterStaffId])

  // Counter pending (manager-only badge)
  const pendingCount = useMemo(
    () => leaves.filter((l) => l.status === 'pending').length,
    [leaves]
  )

  const openCreate = () => {
    setEditingLeave(null)
    setModalMode('create')
    setModalOpen(true)
  }

  const openEdit = (leave) => {
    setEditingLeave(leave)
    setModalMode('edit')
    setModalOpen(true)
  }

  const openReview = (leave) => {
    setEditingLeave(leave)
    setModalMode('review')
    setModalOpen(true)
  }

  const handleCancel = async (leave) => {
    if (!confirm('Annullare questa richiesta?')) return
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: 'cancelled' })
      .eq('id', leave.id)
    if (error) showToast('Errore: ' + error.message, 'error')
    else { showToast('Richiesta annullata'); fetchData() }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl text-warm-dark mb-1">Ferie e permessi</h1>
          <p className="font-sans text-sm text-warm-brown">
            {isManager
              ? 'Approva o rifiuta le richieste del team. Le ferie approvate bloccano la creazione di turni in quei giorni.'
              : 'Richiedi ferie, permessi e altre assenze. Saranno valutate dal manager.'}
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm flex-shrink-0">
          <Plus size={16} /> Nuova richiesta
        </button>
      </div>

      {/* Banner pending per manager */}
      {isManager && pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-3 mb-6 flex items-center gap-3">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
          <div className="font-sans text-sm text-amber-900">
            <strong>{pendingCount}</strong> {pendingCount === 1 ? 'richiesta in attesa' : 'richieste in attesa'} di approvazione
          </div>
          <button onClick={() => setFilterStatus('pending')}
            className="ml-auto font-sans text-xs font-semibold text-amber-700 hover:text-amber-900 underline">
            Vai alle pending →
          </button>
        </div>
      )}

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex bg-cream-200 rounded-xl p-1">
          {[
            { v: 'all', label: 'Tutte' },
            { v: 'pending', label: 'In attesa' },
            { v: 'approved', label: 'Approvate' },
            { v: 'rejected', label: 'Rifiutate' },
          ].map((opt) => (
            <button key={opt.v} onClick={() => setFilterStatus(opt.v)}
              className={`px-3 py-1.5 rounded-lg font-sans text-sm font-semibold transition ${
                filterStatus === opt.v ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown hover:text-warm-dark'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {isManager && (
          <select value={filterStaffId} onChange={(e) => setFilterStaffId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-cream-300 bg-white font-sans text-sm focus:outline-none focus:border-terracotta-400 transition">
            <option value="">Tutti i dipendenti</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
      ) : filteredLeaves.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-cream-300 p-12 text-center">
          <Calendar size={32} className="mx-auto mb-3 text-warm-brown/40" />
          <p className="font-sans text-warm-brown text-sm">
            Nessuna richiesta nel filtro selezionato.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLeaves.map((l) => (
            <LeaveCard key={l.id} leave={l}
              showName={isManager}
              currentStaffId={profile?.id}
              isManager={isManager}
              onEdit={() => openEdit(l)}
              onCancel={() => handleCancel(l)}
              onReview={() => openReview(l)} />
          ))}
        </div>
      )}

      {modalOpen && (
        <LeaveModal
          mode={modalMode}
          leave={editingLeave}
          isManager={isManager}
          staff={staff}
          currentStaffId={profile?.id}
          onClose={() => { setModalOpen(false); setEditingLeave(null) }}
          onSaved={(msg) => {
            setModalOpen(false)
            setEditingLeave(null)
            fetchData()
            showToast(msg)
          }}
        />
      )}

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

// ---- LeaveCard ----

function LeaveCard({ leave, showName, currentStaffId, isManager, onEdit, onCancel, onReview }) {
  const typeCfg = LEAVE_TYPES[leave.leave_type] || LEAVE_TYPES.other
  const statusCfg = STATUS_INFO[leave.status]
  const sm = leave.staff_members
  const color = sm?.roles?.color || '#C97D60'

  const isOwn = leave.staff_id === currentStaffId
  const canEdit = leave.status === 'pending' && (isOwn || isManager)
  const canCancel = leave.status === 'pending' && isOwn
  const canReview = isManager && leave.status === 'pending'

  // Calcolo durata in giorni
  const days = (() => {
    if (leave.is_half_day) return 0.5
    const s = new Date(leave.start_date + 'T00:00:00')
    const e = new Date(leave.end_date + 'T00:00:00')
    return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1
  })()

  const sameDay = leave.start_date === leave.end_date
  const dateRange = sameDay
    ? formatItDate(leave.start_date)
    : `${formatItDate(leave.start_date)} → ${formatItDate(leave.end_date)}`

  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-5">
      <div className="flex items-start gap-4">
        {/* Icona tipo */}
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${typeBgClass(typeCfg.color)}`}>
          <typeCfg.Icon size={20} className={typeFgClass(typeCfg.color)} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header riga */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
            <span className="font-sans font-semibold text-warm-dark">{typeCfg.label}</span>
            <span className={`font-sans text-xs font-semibold px-2 py-0.5 rounded-md border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
              {statusCfg.label}
            </span>
            {showName && sm && (
              <span className="flex items-center gap-1.5 font-sans text-xs text-warm-brown">
                <span className="w-4 h-4 rounded flex items-center justify-center text-white font-serif font-semibold text-[8px]"
                  style={{ backgroundColor: color }}>
                  {sm.first_name?.[0]}{sm.last_name?.[0]}
                </span>
                {sm.first_name} {sm.last_name}
              </span>
            )}
          </div>

          {/* Date e durata */}
          <div className="font-sans text-sm text-warm-dark capitalize">
            {dateRange}
            {leave.is_half_day && (
              <span className="ml-1 text-warm-brown">
                · mezza giornata ({leave.half_day_period === 'morning' ? 'mattina' : 'pomeriggio'})
              </span>
            )}
          </div>
          <div className="font-sans text-xs text-warm-brown mt-0.5">
            {days === 0.5 ? 'Mezza giornata' : `${days} ${days === 1 ? 'giorno' : 'giorni'}`}
          </div>

          {/* Motivo */}
          {leave.reason && (
            <div className="font-sans text-sm text-warm-dark/80 italic mt-2 bg-cream-50 rounded-lg px-3 py-2">
              "{leave.reason}"
            </div>
          )}

          {/* Note di review */}
          {leave.review_notes && (
            <div className={`font-sans text-sm mt-2 rounded-lg px-3 py-2 ${
              leave.status === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-sage-50 text-sage-700'
            }`}>
              <span className="font-semibold">Note manager: </span>
              {leave.review_notes}
            </div>
          )}
        </div>

        {/* Azioni */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          {canReview && (
            <button onClick={onReview}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold text-xs transition">
              <ClockIcon size={12} /> Valuta
            </button>
          )}
          {canEdit && !canReview && (
            <button onClick={onEdit}
              className="p-2 rounded-lg hover:bg-cream-200 text-warm-brown hover:text-warm-dark transition"
              title="Modifica">
              <Pencil size={14} />
            </button>
          )}
          {canCancel && (
            <button onClick={onCancel}
              className="p-2 rounded-lg hover:bg-terracotta-50 text-terracotta-700 transition"
              title="Annulla richiesta">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Helpers ----

function formatItDate(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })
}

function typeBgClass(color) {
  return {
    sage: 'bg-sage-100',
    amber: 'bg-amber-100',
    red: 'bg-red-100',
    cream: 'bg-cream-100',
  }[color] || 'bg-cream-100'
}

function typeFgClass(color) {
  return {
    sage: 'text-sage-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
    cream: 'text-warm-brown',
  }[color] || 'text-warm-brown'
}

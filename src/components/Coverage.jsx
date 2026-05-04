import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Plus, Check, X, AlertCircle, Search, Users, Calendar, Clock as ClockIcon,
  ChevronRight, Loader2,
} from 'lucide-react'
import { formatDayLong, formatTimeFromISO } from '../lib/dateUtils'

// ============================================================================
// COVERAGE TAB CONTENT
// Punto di ingresso usato da Swaps.jsx come tab "Coperture"
// ============================================================================
export default function CoverageTab({ onToast }) {
  const { profile } = useAuth()
  const isManager = profile?.is_manager
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [myInvitations, setMyInvitations] = useState([])
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const fetchData = async () => {
    setLoading(true)
    if (isManager) {
      // Manager: tutte le richieste
      const { data, error } = await supabase
        .from('coverage_requests')
        .select(`
          id, status, notes, created_at, resolved_at,
          shift:shifts!coverage_requests_shift_id_fkey(
            id, start_at, end_at,
            roles(id, name, color),
            staff:staff_members!shifts_staff_id_fkey(id, first_name, last_name)
          ),
          invitations:coverage_invitations(
            id, status, responded_at,
            invitee:staff_members!coverage_invitations_invitee_id_fkey(id, first_name, last_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) onToast?.('Errore: ' + error.message, 'error')
      else setRequests(data || [])
    } else {
      // Dipendente: solo le proprie invitations (in coverage_requests open)
      const { data, error } = await supabase
        .from('coverage_invitations')
        .select(`
          id, status, responded_at, created_at,
          request:coverage_requests!coverage_invitations_request_id_fkey(
            id, status, notes, created_at,
            shift:shifts!coverage_requests_shift_id_fkey(
              id, start_at, end_at,
              roles(id, name, color)
            )
          )
        `)
        .eq('invitee_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) onToast?.('Errore: ' + error.message, 'error')
      else setMyInvitations(data || [])
    }
    setLoading(false)
  }

  const handleRespond = async (invitationId, accept) => {
    const { error } = await supabase.rpc('respond_to_coverage_invitation', {
      p_invitation_id: invitationId,
      p_accept: accept,
    })
    if (error) onToast?.('Errore: ' + error.message, 'error')
    else {
      onToast?.(accept ? 'Hai accettato. Il manager deciderà.' : 'Hai declinato.')
      fetchData()
    }
  }

  const handleSelect = async (invitationId) => {
    if (!confirm('Confermi l\'assegnazione del turno a questo dipendente? Il turno sarà riassegnato e gli altri invitati riceveranno una notifica di chiusura.')) return
    const { error } = await supabase.rpc('select_coverage_candidate', {
      p_invitation_id: invitationId,
    })
    if (error) onToast?.('Errore: ' + error.message, 'error')
    else {
      onToast?.('Copertura assegnata!')
      fetchData()
    }
  }

  const handleCancel = async (requestId) => {
    if (!confirm('Annullare questa richiesta di copertura?')) return
    const { error } = await supabase.rpc('cancel_coverage_request', {
      p_request_id: requestId,
    })
    if (error) onToast?.('Errore: ' + error.message, 'error')
    else {
      onToast?.('Richiesta annullata')
      fetchData()
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VISTA MANAGER
  // ─────────────────────────────────────────────────────────────────────────
  if (isManager) {
    const open = requests.filter((r) => r.status === 'open')
    const closed = requests.filter((r) => r.status !== 'open')

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-serif text-2xl text-warm-dark">Richieste di copertura</h2>
            <p className="font-sans text-sm text-warm-brown">
              Invita dipendenti a coprire un turno scoperto
            </p>
          </div>
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm">
            <Plus size={16} /> Nuova richiesta
          </button>
        </div>

        {open.length === 0 && closed.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-cream-300 p-12 text-center">
            <Search size={32} className="mx-auto mb-3 text-warm-brown/40" />
            <p className="font-sans text-warm-brown text-sm">
              Nessuna richiesta di copertura. Click su "Nuova richiesta" per crearne una.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {open.length > 0 && (
              <div>
                <h3 className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-2">
                  Aperte ({open.length})
                </h3>
                <div className="space-y-3">
                  {open.map((req) => (
                    <ManagerRequestCard key={req.id} request={req}
                      onSelect={handleSelect} onCancel={handleCancel} />
                  ))}
                </div>
              </div>
            )}
            {closed.length > 0 && (
              <div>
                <h3 className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-2">
                  Chiuse ({closed.length})
                </h3>
                <div className="space-y-3 opacity-70">
                  {closed.map((req) => (
                    <ManagerRequestCard key={req.id} request={req}
                      onSelect={handleSelect} onCancel={handleCancel} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {createOpen && (
          <CoverageRequestModal
            onClose={() => setCreateOpen(false)}
            onCreated={() => { setCreateOpen(false); fetchData(); onToast?.('Richiesta inviata!') }}
            onError={(e) => onToast?.(e, 'error')} />
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VISTA DIPENDENTE
  // ─────────────────────────────────────────────────────────────────────────
  const pending = myInvitations.filter((i) => i.status === 'pending' && i.request?.status === 'open')
  const responded = myInvitations.filter((i) => !(i.status === 'pending' && i.request?.status === 'open'))

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-warm-dark">Richieste di copertura</h2>
        <p className="font-sans text-sm text-warm-brown">
          Quando il manager cerca qualcuno per un turno scoperto, qui puoi accettare o declinare
        </p>
      </div>

      {pending.length === 0 && responded.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-cream-300 p-12 text-center">
          <Search size={32} className="mx-auto mb-3 text-warm-brown/40" />
          <p className="font-sans text-warm-brown text-sm">
            Nessuna richiesta di copertura al momento.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <h3 className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-2">
                Da rispondere ({pending.length})
              </h3>
              <div className="space-y-3">
                {pending.map((inv) => (
                  <EmployeeInvitationCard key={inv.id} invitation={inv}
                    onRespond={handleRespond} />
                ))}
              </div>
            </div>
          )}
          {responded.length > 0 && (
            <div>
              <h3 className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-2">
                Storico
              </h3>
              <div className="space-y-3 opacity-70">
                {responded.map((inv) => (
                  <EmployeeInvitationCard key={inv.id} invitation={inv}
                    onRespond={handleRespond} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MANAGER REQUEST CARD
// ============================================================================
function ManagerRequestCard({ request, onSelect, onCancel }) {
  const shift = request.shift
  if (!shift) return null
  const role = shift.roles
  const accepted = (request.invitations || []).filter((i) => i.status === 'accepted')
  const pendingInv = (request.invitations || []).filter((i) => i.status === 'pending')
  const declined = (request.invitations || []).filter((i) => i.status === 'declined')

  const statusBadge = {
    open: { label: 'Aperta', cls: 'bg-amber-100 text-amber-800' },
    fulfilled: { label: 'Risolta', cls: 'bg-sage-100 text-sage-800' },
    cancelled: { label: 'Annullata', cls: 'bg-warm-100 text-warm-700' },
  }[request.status] || { label: request.status, cls: 'bg-cream-200 text-warm-700' }

  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`font-sans text-xs font-semibold px-2 py-0.5 rounded-md ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
            {role && (
              <span className="font-sans text-xs px-2 py-0.5 rounded-md text-white"
                style={{ backgroundColor: role.color || '#C97D60' }}>
                {role.name}
              </span>
            )}
          </div>
          <div className="font-sans text-sm font-semibold text-warm-dark">
            {formatDayLong(shift.start_at)}
          </div>
          <div className="font-sans text-sm text-warm-brown">
            {formatTimeFromISO(shift.start_at)}–{formatTimeFromISO(shift.end_at)}
            {shift.staff && (
              <> · originariamente di {shift.staff.first_name} {shift.staff.last_name}</>
            )}
          </div>
          {request.notes && (
            <div className="font-sans text-xs text-warm-brown italic mt-1.5">
              "{request.notes}"
            </div>
          )}
        </div>
      </div>

      {/* Lista invitati con loro status */}
      <div className="border-t border-cream-200 pt-3 space-y-1.5">
        <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-1">
          Invitati ({(request.invitations || []).length})
        </div>
        {accepted.length > 0 && accepted.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between gap-2 bg-sage-50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Check size={14} className="text-sage-700 flex-shrink-0" />
              <span className="font-sans text-sm font-semibold text-warm-dark truncate">
                {inv.invitee?.first_name} {inv.invitee?.last_name}
              </span>
              <span className="font-sans text-xs text-sage-700 flex-shrink-0">ha accettato</span>
            </div>
            {request.status === 'open' && (
              <button onClick={() => onSelect(inv.id)}
                className="bg-sage-500 hover:bg-sage-600 text-white font-sans text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0">
                Assegna →
              </button>
            )}
            {inv.status === 'selected' && (
              <span className="font-sans text-xs font-semibold text-sage-800">SELEZIONATO</span>
            )}
          </div>
        ))}
        {pendingInv.length > 0 && pendingInv.map((inv) => (
          <div key={inv.id} className="flex items-center gap-2 px-3 py-1.5">
            <Loader2 size={14} className="text-warm-brown/60 flex-shrink-0" />
            <span className="font-sans text-sm text-warm-dark truncate">
              {inv.invitee?.first_name} {inv.invitee?.last_name}
            </span>
            <span className="font-sans text-xs text-warm-brown">in attesa</span>
          </div>
        ))}
        {declined.length > 0 && declined.map((inv) => (
          <div key={inv.id} className="flex items-center gap-2 px-3 py-1.5 opacity-60">
            <X size={14} className="text-warm-brown flex-shrink-0" />
            <span className="font-sans text-sm text-warm-dark truncate line-through">
              {inv.invitee?.first_name} {inv.invitee?.last_name}
            </span>
            <span className="font-sans text-xs text-warm-brown">declinato</span>
          </div>
        ))}
      </div>

      {request.status === 'open' && (
        <div className="border-t border-cream-200 pt-3 mt-3 flex justify-end">
          <button onClick={() => onCancel(request.id)}
            className="font-sans text-xs font-semibold text-warm-brown hover:text-red-600 transition">
            Annulla richiesta
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// EMPLOYEE INVITATION CARD
// ============================================================================
function EmployeeInvitationCard({ invitation, onRespond }) {
  const req = invitation.request
  const shift = req?.shift
  if (!shift) return null
  const role = shift.roles
  const isPending = invitation.status === 'pending' && req?.status === 'open'

  const statusLabel = {
    pending: req?.status === 'open' ? 'Da rispondere' : 'In attesa di chiusura',
    accepted: 'Hai accettato',
    declined: 'Hai declinato',
    selected: 'Sei stato selezionato',
    not_selected: 'Assegnato ad altri',
  }[invitation.status]

  const statusCls = {
    pending: 'bg-amber-100 text-amber-800',
    accepted: 'bg-sage-100 text-sage-800',
    declined: 'bg-warm-100 text-warm-700',
    selected: 'bg-sage-200 text-sage-900',
    not_selected: 'bg-cream-200 text-warm-700',
  }[invitation.status] || 'bg-cream-200 text-warm-700'

  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`font-sans text-xs font-semibold px-2 py-0.5 rounded-md ${statusCls}`}>
              {statusLabel}
            </span>
            {role && (
              <span className="font-sans text-xs px-2 py-0.5 rounded-md text-white"
                style={{ backgroundColor: role.color || '#C97D60' }}>
                {role.name}
              </span>
            )}
          </div>
          <div className="font-sans text-sm font-semibold text-warm-dark">
            {formatDayLong(shift.start_at)}
          </div>
          <div className="font-sans text-sm text-warm-brown">
            {formatTimeFromISO(shift.start_at)}–{formatTimeFromISO(shift.end_at)}
          </div>
          {req?.notes && (
            <div className="font-sans text-xs text-warm-brown italic mt-1.5">
              Manager: "{req.notes}"
            </div>
          )}
        </div>
      </div>

      {isPending && (
        <div className="border-t border-cream-200 pt-3 flex gap-2">
          <button onClick={() => onRespond(invitation.id, true)}
            className="flex-1 flex items-center justify-center gap-2 bg-sage-500 hover:bg-sage-600 text-white font-sans font-semibold py-2.5 rounded-xl transition">
            <Check size={16} /> Accetto
          </button>
          <button onClick={() => onRespond(invitation.id, false)}
            className="flex-1 flex items-center justify-center gap-2 bg-cream-200 hover:bg-cream-300 text-warm-dark font-sans font-semibold py-2.5 rounded-xl transition">
            <X size={16} /> Declino
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// COVERAGE REQUEST MODAL (manager crea nuova richiesta)
// ============================================================================
function CoverageRequestModal({ onClose, onCreated, onError }) {
  const [shifts, setShifts] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState('')
  const [selectedInvitees, setSelectedInvitees] = useState([])
  const [filterMode, setFilterMode] = useState('smart') // smart | all
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    // Turni futuri pubblicati
    const { data: shiftsData } = await supabase
      .from('shifts')
      .select(`
        id, start_at, end_at, role_id,
        roles(id, name, color),
        staff:staff_members!shifts_staff_id_fkey(id, first_name, last_name)
      `)
      .eq('status', 'published')
      .gt('start_at', new Date().toISOString())
      .order('start_at')
      .limit(50)

    // Filtra solo turni che NON hanno già una coverage_request open
    const { data: openCovs } = await supabase
      .from('coverage_requests')
      .select('shift_id')
      .eq('status', 'open')
    const openShiftIds = new Set((openCovs || []).map((c) => c.shift_id))

    const availableShifts = (shiftsData || []).filter((s) => !openShiftIds.has(s.id))
    setShifts(availableShifts)

    // Tutti i dipendenti attivi (escluso il manager stesso non importa, comunque vediamo tutti)
    const { data: staffData } = await supabase
      .from('staff_members')
      .select('id, first_name, last_name, role_id, is_manager')
      .eq('is_active', true)
      .order('first_name')
    setStaff(staffData || [])

    setLoading(false)
  }

  const selectedShift = shifts.find((s) => s.id === selectedShiftId)

  // Filtro smart: stesso ruolo del turno + senza turni sovrapposti (verifica fatta lato server in futuro)
  const visibleStaff = (() => {
    if (!selectedShift) return staff
    if (filterMode === 'all') return staff.filter((s) => !s.is_manager)
    // smart: stesso ruolo, escluso il dipendente attualmente assegnato, escluso manager
    return staff.filter((s) =>
      s.role_id === selectedShift.role_id &&
      s.id !== selectedShift.staff?.id &&
      !s.is_manager
    )
  })()

  const toggleInvitee = (id) => {
    setSelectedInvitees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async () => {
    if (!selectedShiftId) { onError?.('Seleziona un turno'); return }
    if (selectedInvitees.length === 0) { onError?.('Seleziona almeno un dipendente'); return }
    setSubmitting(true)
    const { error } = await supabase.rpc('create_coverage_request', {
      p_shift_id: selectedShiftId,
      p_invitee_ids: selectedInvitees,
      p_notes: notes || null,
    })
    setSubmitting(false)
    if (error) onError?.('Errore: ' + error.message)
    else onCreated?.()
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <div>
            <h2 className="font-serif text-2xl text-warm-dark">Richiedi copertura</h2>
            <p className="font-sans text-xs text-warm-brown">
              Scegli un turno e invita dipendenti
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-cream-100 rounded-lg">
            <X size={20} className="text-warm-brown" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
          ) : (
            <>
              {/* Step 1: scegli turno */}
              <div>
                <label className="block font-sans text-sm font-semibold text-warm-dark mb-2">
                  1. Quale turno?
                </label>
                {shifts.length === 0 ? (
                  <div className="bg-cream-100 rounded-xl p-4 text-center">
                    <p className="font-sans text-sm text-warm-brown">
                      Non ci sono turni futuri pubblicati senza richieste già aperte.
                    </p>
                  </div>
                ) : (
                  <select value={selectedShiftId}
                    onChange={(e) => { setSelectedShiftId(e.target.value); setSelectedInvitees([]) }}
                    className="w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400">
                    <option value="">Seleziona un turno...</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatDayLong(s.start_at)} · {formatTimeFromISO(s.start_at)}–{formatTimeFromISO(s.end_at)}
                        {s.roles ? ` · ${s.roles.name}` : ''}
                        {s.staff ? ` · ${s.staff.first_name} ${s.staff.last_name}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Step 2: scegli dipendenti */}
              {selectedShift && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block font-sans text-sm font-semibold text-warm-dark">
                      2. Chi invitare?
                    </label>
                    <div className="flex bg-cream-200 rounded-lg p-0.5">
                      <button onClick={() => setFilterMode('smart')}
                        className={`px-2.5 py-1 rounded-md font-sans text-xs font-semibold transition ${
                          filterMode === 'smart' ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown'
                        }`}>
                        Stesso ruolo
                      </button>
                      <button onClick={() => setFilterMode('all')}
                        className={`px-2.5 py-1 rounded-md font-sans text-xs font-semibold transition ${
                          filterMode === 'all' ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown'
                        }`}>
                        Tutti
                      </button>
                    </div>
                  </div>

                  {visibleStaff.length === 0 ? (
                    <div className="bg-cream-100 rounded-xl p-4 text-center">
                      <p className="font-sans text-sm text-warm-brown">
                        Nessun dipendente disponibile con questi filtri.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-cream-300 rounded-xl divide-y divide-cream-200 max-h-64 overflow-y-auto">
                      {visibleStaff.map((s) => {
                        const checked = selectedInvitees.includes(s.id)
                        return (
                          <label key={s.id}
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-cream-50 transition ${checked ? 'bg-terracotta-50' : ''}`}>
                            <input type="checkbox" checked={checked}
                              onChange={() => toggleInvitee(s.id)}
                              className="w-4 h-4 accent-terracotta-500" />
                            <span className="font-sans text-sm text-warm-dark flex-1">
                              {s.first_name} {s.last_name}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  <p className="font-sans text-xs text-warm-brown mt-1.5">
                    {selectedInvitees.length} {selectedInvitees.length === 1 ? 'selezionato' : 'selezionati'}
                  </p>
                </div>
              )}

              {/* Step 3: note */}
              {selectedShift && (
                <div>
                  <label className="block font-sans text-sm font-semibold text-warm-dark mb-2">
                    3. Note <span className="font-normal text-warm-brown">(opzionale)</span>
                  </label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                    rows={2} placeholder="es. urgente, lo paghiamo doppio…"
                    className="w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 resize-none" />
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-cream-200 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl font-sans font-semibold text-warm-brown hover:bg-cream-100 transition">
            Annulla
          </button>
          <button onClick={handleSubmit}
            disabled={submitting || !selectedShiftId || selectedInvitees.length === 0}
            className="px-5 py-2 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-200 text-white font-sans font-semibold transition shadow-sm">
            {submitting ? 'Invio…' : `Invia richiesta (${selectedInvitees.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

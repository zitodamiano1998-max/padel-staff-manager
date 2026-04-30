import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import StaffFormModal from '../components/StaffFormModal'
import {
  Plus, Search, Mail, Phone, MailCheck, MailWarning, Power, PowerOff,
} from 'lucide-react'

export default function Staff() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | active | inactive | pending
  const [roleFilter, setRoleFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [toast, setToast] = useState(null)

  const isManager = profile?.is_manager

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    const [staffRes, rolesRes] = await Promise.all([
      supabase
        .from('staff_members')
        .select('*, roles(id, name, color, category)')
        .order('first_name'),
      supabase
        .from('roles')
        .select('id, name, color, display_order')
        .order('display_order'),
    ])
    if (!staffRes.error) setStaff(staffRes.data || [])
    if (!rolesRes.error) setRoles(rolesRes.data || [])
    setLoading(false)
  }

  // Filtra
  const filtered = useMemo(() => {
    return staff.filter((s) => {
      // Search
      if (search) {
        const q = search.toLowerCase()
        const match =
          s.first_name?.toLowerCase().includes(q) ||
          s.last_name?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q)
        if (!match) return false
      }
      // Status
      if (statusFilter === 'active' && !s.is_active) return false
      if (statusFilter === 'inactive' && s.is_active) return false
      if (statusFilter === 'pending' && (s.user_id || !s.is_active)) return false
      // Role
      if (roleFilter !== 'all' && s.role_id !== roleFilter) return false
      return true
    })
  }, [staff, search, statusFilter, roleFilter])

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 4000)
  }

  const handleStaffSaved = () => {
    setModalOpen(false)
    setEditingStaff(null)
    fetchData()
    showToast('Dipendente salvato e invito inviato via email ✉️')
  }

  const handleEdit = (s) => {
    setEditingStaff(s)
    setModalOpen(true)
  }

  const handleNew = () => {
    setEditingStaff(null)
    setModalOpen(true)
  }

  const handleToggleActive = async (s) => {
    const action = s.is_active ? 'disattivare' : 'riattivare'
    if (!confirm(`Vuoi ${action} ${s.first_name} ${s.last_name}?`)) return

    const { error } = await supabase
      .from('staff_members')
      .update({ is_active: !s.is_active })
      .eq('id', s.id)

    if (error) {
      showToast('Errore: ' + error.message, 'error')
    } else {
      fetchData()
      showToast(`Dipendente ${s.is_active ? 'disattivato' : 'riattivato'}`)
    }
  }

  if (!isManager) {
    return (
      <div className="bg-white rounded-2xl border border-cream-300 p-8 text-center">
        <h2 className="text-xl text-warm-dark mb-2">Accesso negato</h2>
        <p className="font-sans text-sm text-warm-brown">
          Questa pagina è riservata ai manager.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl text-warm-dark mb-1">Anagrafica</h1>
          <p className="text-warm-brown font-sans text-sm">
            {staff.length} dipendenti totali · {staff.filter((s) => s.is_active).length} attivi
          </p>
        </div>
        <button onClick={handleNew}
          className="flex items-center justify-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-5 py-3 rounded-xl transition shadow-sm">
          <Plus size={18} />
          Aggiungi dipendente
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-cream-300 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative md:col-span-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-brown" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca nome, email..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-cream-300 bg-cream-50 font-sans text-sm focus:outline-none focus:border-terracotta-400 focus:bg-white transition"
            />
          </div>
          {/* Status */}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-cream-300 bg-cream-50 font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 focus:bg-white transition">
            <option value="all">Tutti gli stati</option>
            <option value="active">Solo attivi</option>
            <option value="inactive">Solo disattivati</option>
            <option value="pending">In attesa di registrazione</option>
          </select>
          {/* Role */}
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-cream-300 bg-cream-50 font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 focus:bg-white transition">
            <option value="all">Tutti i ruoli</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">
          Caricamento...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-cream-300 p-12 text-center">
          <p className="font-sans text-warm-brown">
            {staff.length === 0
              ? 'Nessun dipendente. Click su "Aggiungi dipendente" per iniziare.'
              : 'Nessun dipendente trovato con questi filtri.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <StaffCard
              key={s.id}
              staff={s}
              onEdit={() => handleEdit(s)}
              onToggleActive={() => handleToggleActive(s)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <StaffFormModal
          staff={editingStaff}
          roles={roles}
          onClose={() => { setModalOpen(false); setEditingStaff(null) }}
          onSaved={handleStaffSaved}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg font-sans text-sm z-50 ${
          toast.kind === 'error'
            ? 'bg-terracotta-600 text-white'
            : 'bg-sage-500 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ---- StaffCard ----
function StaffCard({ staff, onEdit, onToggleActive }) {
  const initials = `${staff.first_name?.[0] || ''}${staff.last_name?.[0] || ''}`.toUpperCase()
  const role = staff.roles
  const isPending = !staff.user_id

  return (
    <div className={`bg-white rounded-2xl border p-5 transition hover:shadow-md ${
      staff.is_active ? 'border-cream-300' : 'border-cream-300 opacity-60'
    }`}>
      <div className="flex items-start gap-4 mb-4">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-serif font-semibold text-lg flex-shrink-0"
          style={{ backgroundColor: role?.color || '#C97D60' }}>
          {initials}
        </div>
        {/* Nome + ruolo */}
        <div className="flex-1 min-w-0">
          <h3 className="font-sans font-semibold text-warm-dark truncate">
            {staff.first_name} {staff.last_name}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: role?.color || '#C97D60' }} />
            <span className="font-sans text-xs text-warm-brown">
              {role?.name || 'Nessun ruolo'}
            </span>
          </div>
        </div>
      </div>

      {/* Contatti */}
      <div className="space-y-1.5 mb-4 font-sans text-xs text-warm-brown">
        <div className="flex items-center gap-2">
          <Mail size={12} className="flex-shrink-0" />
          <span className="truncate">{staff.email}</span>
        </div>
        {staff.phone && (
          <div className="flex items-center gap-2">
            <Phone size={12} className="flex-shrink-0" />
            <span>{staff.phone}</span>
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {!staff.is_active && (
          <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-cream-300 text-warm-brown">
            Disattivato
          </span>
        )}
        {staff.is_manager && (
          <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-terracotta-100 text-terracotta-700">
            Manager
          </span>
        )}
        {isPending && staff.is_active ? (
          <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1">
            <MailWarning size={11} /> Invito in attesa
          </span>
        ) : !isPending ? (
          <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-sage-400/10 text-sage-500 flex items-center gap-1">
            <MailCheck size={11} /> Account attivo
          </span>
        ) : null}
        <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-cream-200 text-warm-brown">
          {staff.contract_type?.replace('_', ' ') || '—'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-cream-200">
        <button onClick={onEdit}
          className="flex-1 font-sans text-sm font-semibold text-warm-dark hover:bg-cream-100 px-3 py-2 rounded-lg transition">
          Modifica
        </button>
        <button onClick={onToggleActive}
          className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown hover:text-warm-dark transition"
          title={staff.is_active ? 'Disattiva' : 'Riattiva'}>
          {staff.is_active ? <PowerOff size={16} /> : <Power size={16} />}
        </button>
      </div>
    </div>
  )
}

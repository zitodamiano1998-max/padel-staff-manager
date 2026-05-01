import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Building2, Clock as ClockIcon, Users as UsersIcon,
  MapPin, Save, Plus, Trash2, GripVertical, AlertCircle, Check,
} from 'lucide-react'

export default function Settings() {
  const [tab, setTab] = useState('center') // center | rules | roles
  const [toast, setToast] = useState(null)

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl text-warm-dark mb-1">Impostazioni</h1>
        <p className="font-sans text-sm text-warm-brown">
          Configurazione del centro, regole turni, gestione ruoli.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <TabButton active={tab === 'center'} onClick={() => setTab('center')} icon={<Building2 size={16} />}>
          Centro
        </TabButton>
        <TabButton active={tab === 'rules'} onClick={() => setTab('rules')} icon={<ClockIcon size={16} />}>
          Regole turni
        </TabButton>
        <TabButton active={tab === 'roles'} onClick={() => setTab('roles')} icon={<UsersIcon size={16} />}>
          Ruoli
        </TabButton>
      </div>

      {/* Tab content */}
      {tab === 'center' && <CenterSettings showToast={showToast} />}
      {tab === 'rules' && <RulesSettings showToast={showToast} />}
      {tab === 'roles' && <RolesSettings showToast={showToast} />}

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

function TabButton({ active, onClick, icon, children }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-sans font-semibold text-sm transition border ${
        active
          ? 'bg-terracotta-400 text-white border-terracotta-400 shadow-sm'
          : 'bg-white text-warm-brown border-cream-300 hover:border-terracotta-300'
      }`}>
      {icon}
      {children}
    </button>
  )
}

// ============================================================================
// TAB 1 — CENTRO (nome, coordinate, geofence)
// ============================================================================
function CenterSettings({ showToast }) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    center_name: '',
    center_latitude: '',
    center_longitude: '',
    geofence_radius_meters: 150,
    timezone: 'Europe/Rome',
  })

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('settings').select('*').limit(1).single()
    if (!error && data) {
      setSettings(data)
      setForm({
        center_name: data.center_name || '',
        center_latitude: data.center_latitude || '',
        center_longitude: data.center_longitude || '',
        geofence_radius_meters: data.geofence_radius_meters || 150,
        timezone: data.timezone || 'Europe/Rome',
      })
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    const { error } = await supabase
      .from('settings')
      .update({
        center_name: form.center_name.trim() || null,
        center_latitude: parseFloat(form.center_latitude) || null,
        center_longitude: parseFloat(form.center_longitude) || null,
        geofence_radius_meters: parseInt(form.geofence_radius_meters) || 150,
        timezone: form.timezone || 'Europe/Rome',
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id)
    setSaving(false)
    if (error) showToast('Errore: ' + error.message, 'error')
    else showToast('Impostazioni centro salvate')
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocalizzazione non supportata', 'error')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm({
          ...form,
          center_latitude: pos.coords.latitude.toFixed(7),
          center_longitude: pos.coords.longitude.toFixed(7),
        })
        showToast(`Posizione acquisita (precisione ${Math.round(pos.coords.accuracy)}m)`)
      },
      (err) => showToast('Errore GPS: ' + err.message, 'error'),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  if (loading) {
    return <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
  }

  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-6 max-w-2xl">
      <div className="space-y-4">
        <Field label="Nome del centro">
          <input type="text" value={form.center_name}
            onChange={(e) => setForm({ ...form, center_name: e.target.value })}
            placeholder="es. Centro Padel San Miniato"
            className={inputCls} />
        </Field>

        <div className="border-t border-cream-200 pt-4">
          <div className="font-sans text-sm font-semibold text-warm-dark mb-2 flex items-center gap-2">
            <MapPin size={14} className="text-terracotta-500" />
            Posizione GPS del centro
          </div>
          <p className="font-sans text-xs text-warm-brown mb-3">
            Le coordinate vengono usate per validare le timbrature dei dipendenti.
            Solo chi è entro il raggio impostato può timbrare.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitudine">
              <input type="number" step="0.0000001" value={form.center_latitude}
                onChange={(e) => setForm({ ...form, center_latitude: e.target.value })}
                placeholder="43.6881172"
                className={inputCls + ' tabular-nums'} />
            </Field>
            <Field label="Longitudine">
              <input type="number" step="0.0000001" value={form.center_longitude}
                onChange={(e) => setForm({ ...form, center_longitude: e.target.value })}
                placeholder="10.8549639"
                className={inputCls + ' tabular-nums'} />
            </Field>
          </div>

          <button type="button" onClick={useCurrentLocation}
            className="mt-2 flex items-center gap-2 text-terracotta-600 hover:text-terracotta-700 font-sans font-semibold text-sm">
            <MapPin size={14} /> Usa la mia posizione attuale
          </button>
        </div>

        <Field label="Raggio geofence (metri)" hint="Distanza massima dal centro entro cui i dipendenti possono timbrare. Consigliato: 100-200m.">
          <div className="flex items-center gap-3">
            <input type="number" min="50" max="500" step="10" value={form.geofence_radius_meters}
              onChange={(e) => setForm({ ...form, geofence_radius_meters: e.target.value })}
              className={inputCls + ' max-w-[140px] tabular-nums'} />
            <span className="font-sans text-sm text-warm-brown">metri</span>
          </div>
        </Field>

        <Field label="Fuso orario" hint="Usato per visualizzare correttamente date e orari.">
          <select value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className={inputCls}>
            <option value="Europe/Rome">Europe/Rome (Italia)</option>
            <option value="Europe/London">Europe/London (UK)</option>
            <option value="Europe/Paris">Europe/Paris (Francia)</option>
            <option value="Europe/Madrid">Europe/Madrid (Spagna)</option>
            <option value="Europe/Berlin">Europe/Berlin (Germania)</option>
          </select>
        </Field>
      </div>

      <div className="border-t border-cream-200 mt-6 pt-4 flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold px-5 py-2.5 rounded-xl transition shadow-sm">
          <Save size={16} /> {saving ? 'Salvataggio...' : 'Salva impostazioni'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// TAB 2 — REGOLE TURNI
// ============================================================================
function RulesSettings({ showToast }) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    weekly_hours_warning: 48,
    daily_rest_hours: 11,
    overtime_threshold_weekly: 40,
  })

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('settings').select('*').limit(1).single()
    if (!error && data) {
      setSettings(data)
      setForm({
        weekly_hours_warning: data.weekly_hours_warning || 48,
        daily_rest_hours: data.daily_rest_hours || 11,
        overtime_threshold_weekly: data.overtime_threshold_weekly || 40,
      })
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    const { error } = await supabase
      .from('settings')
      .update({
        weekly_hours_warning: parseInt(form.weekly_hours_warning) || 48,
        daily_rest_hours: parseInt(form.daily_rest_hours) || 11,
        overtime_threshold_weekly: parseFloat(form.overtime_threshold_weekly) || 40,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id)
    setSaving(false)
    if (error) showToast('Errore: ' + error.message, 'error')
    else showToast('Regole turni salvate')
  }

  if (loading) {
    return <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
  }

  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-6 max-w-2xl">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex items-start gap-2">
        <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="font-sans text-xs text-amber-800">
          Queste regole determinano gli alert nel Planning quando crei turni che superano le soglie.
          Non bloccano la creazione, ma aiutano a rispettare normative e benessere dei dipendenti.
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Soglia ore settimanali"
          hint="Se la somma settimanale supera queste ore, viene mostrato un avviso. Standard italiano: 48h.">
          <div className="flex items-center gap-3">
            <input type="number" min="20" max="80" step="1" value={form.weekly_hours_warning}
              onChange={(e) => setForm({ ...form, weekly_hours_warning: e.target.value })}
              className={inputCls + ' max-w-[140px] tabular-nums'} />
            <span className="font-sans text-sm text-warm-brown">ore/settimana</span>
          </div>
        </Field>

        <Field label="Riposo giornaliero minimo"
          hint="Ore di riposo richieste tra la fine di un turno e l'inizio del successivo. D.lgs. 66/2003: 11h.">
          <div className="flex items-center gap-3">
            <input type="number" min="6" max="24" step="1" value={form.daily_rest_hours}
              onChange={(e) => setForm({ ...form, daily_rest_hours: e.target.value })}
              className={inputCls + ' max-w-[140px] tabular-nums'} />
            <span className="font-sans text-sm text-warm-brown">ore</span>
          </div>
        </Field>

        <Field label="Soglia straordinari"
          hint="Ore settimanali oltre cui le ore lavorate diventano straordinari (per calcolo costi futuri).">
          <div className="flex items-center gap-3">
            <input type="number" min="20" max="60" step="0.5" value={form.overtime_threshold_weekly}
              onChange={(e) => setForm({ ...form, overtime_threshold_weekly: e.target.value })}
              className={inputCls + ' max-w-[140px] tabular-nums'} />
            <span className="font-sans text-sm text-warm-brown">ore/settimana</span>
          </div>
        </Field>
      </div>

      <div className="border-t border-cream-200 mt-6 pt-4 flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold px-5 py-2.5 rounded-xl transition shadow-sm">
          <Save size={16} /> {saving ? 'Salvataggio...' : 'Salva regole'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// TAB 3 — RUOLI
// ============================================================================
const ROLE_CATEGORIES = [
  { value: 'reception', label: 'Reception' },
  { value: 'instructor', label: 'Istruttore' },
  { value: 'bar', label: 'Bar' },
  { value: 'maintenance', label: 'Manutenzione' },
  { value: 'manager', label: 'Manager' },
  { value: 'other', label: 'Altro' },
]

const PRESET_COLORS = [
  '#C97D60', '#5C8D7E', '#D4A574', '#8B7355', '#3D2914',
  '#E76F51', '#2A9D8F', '#E9C46A', '#264653', '#B5651D',
  '#9C6644', '#7B9E89', '#D08C60', '#5D737E', '#4A4E69',
]

function RolesSettings({ showToast }) {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => { fetchRoles() }, [])

  const fetchRoles = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('display_order', { ascending: true })
    if (!error) setRoles(data || [])
    setLoading(false)
  }

  const handleSave = async (id, patch) => {
    const { error } = await supabase.from('roles').update(patch).eq('id', id)
    if (error) showToast('Errore: ' + error.message, 'error')
    else { showToast('Ruolo aggiornato'); fetchRoles() }
    setEditingId(null)
  }

  const handleDelete = async (role) => {
    if (!confirm(`Eliminare il ruolo "${role.name}"? I dipendenti con questo ruolo perderanno l'assegnazione.`)) return
    const { error } = await supabase.from('roles').delete().eq('id', role.id)
    if (error) showToast('Errore: ' + (error.message || 'impossibile eliminare'), 'error')
    else { showToast('Ruolo eliminato'); fetchRoles() }
  }

  const handleAdd = async (data) => {
    const maxOrder = Math.max(0, ...roles.map((r) => r.display_order || 0))
    const { error } = await supabase.from('roles').insert({
      ...data,
      display_order: maxOrder + 1,
    })
    if (error) showToast('Errore: ' + error.message, 'error')
    else { showToast('Ruolo aggiunto'); fetchRoles() }
    setAdding(false)
  }

  if (loading) {
    return <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
  }

  return (
    <div className="max-w-3xl">
      <div className="bg-white rounded-2xl border border-cream-300 overflow-hidden mb-4">
        {roles.length === 0 ? (
          <div className="p-8 text-center font-sans text-sm text-warm-brown">
            Nessun ruolo configurato.
          </div>
        ) : (
          roles.map((role) => (
            <RoleRow key={role.id} role={role}
              isEditing={editingId === role.id}
              onEdit={() => setEditingId(role.id)}
              onCancel={() => setEditingId(null)}
              onSave={(patch) => handleSave(role.id, patch)}
              onDelete={() => handleDelete(role)} />
          ))
        )}
      </div>

      {adding ? (
        <RoleForm onSave={handleAdd} onCancel={() => setAdding(false)} />
      ) : (
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm">
          <Plus size={16} /> Aggiungi ruolo
        </button>
      )}
    </div>
  )
}

function RoleRow({ role, isEditing, onEdit, onCancel, onSave, onDelete }) {
  if (isEditing) {
    return <RoleForm role={role} onSave={onSave} onCancel={onCancel} inline />
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-cream-200 last:border-b-0 hover:bg-cream-50/50 transition">
      <GripVertical size={16} className="text-warm-brown/30 flex-shrink-0" />
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: role.color }}>
        <span className="text-white font-serif font-semibold text-sm">{role.name?.[0]?.toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-sans font-semibold text-warm-dark text-sm">{role.name}</div>
        <div className="font-sans text-xs text-warm-brown">
          {ROLE_CATEGORIES.find((c) => c.value === role.category)?.label || role.category}
          {role.hourly_rate_default && ` · €${role.hourly_rate_default}/h base`}
        </div>
      </div>
      <button onClick={onEdit}
        className="px-3 py-1.5 rounded-lg font-sans text-xs font-semibold text-warm-dark hover:bg-cream-200 transition">
        Modifica
      </button>
      <button onClick={onDelete}
        className="p-2 rounded-lg hover:bg-terracotta-50 text-terracotta-700 transition"
        title="Elimina ruolo">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function RoleForm({ role, onSave, onCancel, inline = false }) {
  const [form, setForm] = useState({
    name: role?.name || '',
    category: role?.category || 'other',
    color: role?.color || PRESET_COLORS[0],
    hourly_rate_default: role?.hourly_rate_default || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onSave({
      name: form.name.trim(),
      category: form.category,
      color: form.color,
      hourly_rate_default: form.hourly_rate_default ? parseFloat(form.hourly_rate_default) : null,
    })
    setSaving(false)
  }

  return (
    <div className={`bg-cream-50 ${inline ? 'border-b border-cream-200' : 'rounded-2xl border border-cream-300'} p-4`}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Nome">
          <input type="text" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="es. Reception"
            className={inputCls} autoFocus />
        </Field>
        <Field label="Categoria">
          <select value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={inputCls}>
            {ROLE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Colore">
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button key={c} type="button"
              onClick={() => setForm({ ...form, color: c })}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
                form.color === c ? 'ring-2 ring-warm-dark ring-offset-2' : ''
              }`}
              style={{ backgroundColor: c }}
              title={c}>
              {form.color === c && <Check size={14} className="text-white" />}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Tariffa oraria base (opzionale, €/h)" hint="Usata in futuro per calcolo costi.">
        <input type="number" step="0.01" min="0" value={form.hourly_rate_default}
          onChange={(e) => setForm({ ...form, hourly_rate_default: e.target.value })}
          placeholder="es. 12.50"
          className={inputCls + ' max-w-[180px] tabular-nums'} />
      </Field>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel}
          className="px-4 py-2 rounded-xl font-sans font-semibold text-sm text-warm-dark hover:bg-cream-200 transition">
          Annulla
        </button>
        <button onClick={handleSubmit} disabled={!form.name.trim() || saving}
          className="px-4 py-2 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold text-sm transition shadow-sm">
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// SHARED
// ============================================================================
const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 transition'

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
        {label}
      </label>
      {children}
      {hint && (
        <p className="font-sans text-xs text-warm-brown/80 mt-1.5">{hint}</p>
      )}
    </div>
  )
}

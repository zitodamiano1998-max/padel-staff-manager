import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Settings as SettingsIcon, MapPin, Clock as ClockIcon, Users,
  Save, Plus, Trash2, Edit, X,
} from 'lucide-react'

const ROLE_CATEGORIES = [
  { value: 'reception', label: 'Reception' },
  { value: 'instructor', label: 'Istruttore' },
  { value: 'bar', label: 'Bar' },
  { value: 'maintenance', label: 'Manutenzione' },
  { value: 'manager', label: 'Manager' },
]

export default function Settings() {
  const [tab, setTab] = useState('center')
  const [toast, setToast] = useState(null)

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-4xl text-warm-dark mb-1">Impostazioni</h1>
        <p className="font-sans text-sm text-warm-brown">
          Configurazione del centro, regole di lavoro e ruoli del team.
        </p>
      </div>

      <div className="flex gap-1 bg-cream-200 rounded-xl p-1 mb-6 max-w-fit">
        {[
          { v: 'center', label: 'Centro', Icon: MapPin },
          { v: 'hours', label: 'Orari & turni', Icon: ClockIcon },
          { v: 'roles', label: 'Ruoli', Icon: Users },
        ].map((opt) => (
          <button key={opt.v} onClick={() => setTab(opt.v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-sans text-sm font-semibold transition ${
              tab === opt.v ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown hover:text-warm-dark'
            }`}>
            <opt.Icon size={14} />
            {opt.label}
          </button>
        ))}
      </div>

      {tab === 'center' && <CenterSection onToast={showToast} />}
      {tab === 'hours' && <HoursSection onToast={showToast} />}
      {tab === 'roles' && <RolesSection onToast={showToast} />}

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

// ============================================================================
// SEZIONE CENTRO
// ============================================================================
function CenterSection({ onToast }) {
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({
    center_name: '',
    center_latitude: '',
    center_longitude: '',
    geofence_radius_meters: 150,
    timezone: 'Europe/Rome',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('settings').select('*').limit(1).single()
    if (!error && data) {
      setSettings(data)
      setForm({
        center_name: data.center_name || '',
        center_latitude: data.center_latitude ?? '',
        center_longitude: data.center_longitude ?? '',
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
        center_name: form.center_name.trim(),
        center_latitude: parseFloat(form.center_latitude),
        center_longitude: parseFloat(form.center_longitude),
        geofence_radius_meters: parseInt(form.geofence_radius_meters),
        timezone: form.timezone.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id)
    setSaving(false)
    if (error) onToast('Errore: ' + error.message, 'error')
    else { onToast('Impostazioni salvate'); fetchSettings() }
  }

  if (loading) return <div className="text-center py-12 text-warm-brown font-sans">Caricamento…</div>

  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-6 space-y-5">
      <SectionHeader Icon={MapPin} title="Dati del centro"
        subtitle="Posizione e configurazione del geofence per le timbrature" />

      <Field label="Nome centro" required>
        <input type="text" value={form.center_name}
          onChange={(e) => setForm({ ...form, center_name: e.target.value })}
          className={inputCls} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Latitudine" required hint="es. 43.6881172">
          <input type="number" step="0.0000001" value={form.center_latitude}
            onChange={(e) => setForm({ ...form, center_latitude: e.target.value })}
            className={inputCls + ' tabular-nums'} />
        </Field>
        <Field label="Longitudine" required hint="es. 10.8549639">
          <input type="number" step="0.0000001" value={form.center_longitude}
            onChange={(e) => setForm({ ...form, center_longitude: e.target.value })}
            className={inputCls + ' tabular-nums'} />
        </Field>
      </div>

      <div className="bg-cream-50 border border-cream-200 rounded-xl p-3 font-sans text-xs text-warm-brown">
        💡 Per ottenere coordinate esatte: vai su Google Maps, click destro sul centro, click sulle coordinate per copiarle.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Raggio geofence (metri)" required hint="Distanza massima dal centro per timbrare">
          <input type="number" min="10" max="10000" value={form.geofence_radius_meters}
            onChange={(e) => setForm({ ...form, geofence_radius_meters: e.target.value })}
            className={inputCls + ' tabular-nums'} />
        </Field>
        <Field label="Timezone" hint="es. Europe/Rome">
          <input type="text" value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className={inputCls} />
        </Field>
      </div>

      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold px-5 py-2.5 rounded-xl transition shadow-sm">
          <Save size={16} />
          {saving ? 'Salvataggio…' : 'Salva modifiche'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// SEZIONE ORARI
// ============================================================================
function HoursSection({ onToast }) {
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({
    weekly_hours_warning: 48,
    daily_rest_hours: 11,
    overtime_threshold_weekly: 40,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('settings').select('*').limit(1).single()
    if (!error && data) {
      setSettings(data)
      setForm({
        weekly_hours_warning: data.weekly_hours_warning ?? 48,
        daily_rest_hours: data.daily_rest_hours ?? 11,
        overtime_threshold_weekly: data.overtime_threshold_weekly ?? 40,
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
        weekly_hours_warning: parseInt(form.weekly_hours_warning),
        daily_rest_hours: parseInt(form.daily_rest_hours),
        overtime_threshold_weekly: parseFloat(form.overtime_threshold_weekly),
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id)
    setSaving(false)
    if (error) onToast('Errore: ' + error.message, 'error')
    else { onToast('Impostazioni salvate'); fetchSettings() }
  }

  if (loading) return <div className="text-center py-12 text-warm-brown font-sans">Caricamento…</div>

  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-6 space-y-5">
      <SectionHeader Icon={ClockIcon} title="Regole di lavoro"
        subtitle="Soglie usate per gli alert sui turni e calcolo straordinari" />

      <Field label="Ore settimanali massime" required
        hint="Sopra questa soglia il sistema mostra alert nei conflitti del planning">
        <div className="flex items-center gap-2">
          <input type="number" min="1" max="168" value={form.weekly_hours_warning}
            onChange={(e) => setForm({ ...form, weekly_hours_warning: e.target.value })}
            className={inputCls + ' tabular-nums max-w-32'} />
          <span className="font-sans text-sm text-warm-brown">ore/settimana</span>
        </div>
      </Field>

      <Field label="Riposo giornaliero minimo" required
        hint="Tempo minimo tra fine turno e inizio turno successivo">
        <div className="flex items-center gap-2">
          <input type="number" min="0" max="24" value={form.daily_rest_hours}
            onChange={(e) => setForm({ ...form, daily_rest_hours: e.target.value })}
            className={inputCls + ' tabular-nums max-w-32'} />
          <span className="font-sans text-sm text-warm-brown">ore</span>
        </div>
      </Field>

      <Field label="Soglia straordinari settimanali"
        hint="Le ore oltre questa soglia sono considerate straordinario">
        <div className="flex items-center gap-2">
          <input type="number" step="0.5" min="0" max="168" value={form.overtime_threshold_weekly}
            onChange={(e) => setForm({ ...form, overtime_threshold_weekly: e.target.value })}
            className={inputCls + ' tabular-nums max-w-32'} />
          <span className="font-sans text-sm text-warm-brown">ore/settimana</span>
        </div>
      </Field>

      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold px-5 py-2.5 rounded-xl transition shadow-sm">
          <Save size={16} />
          {saving ? 'Salvataggio…' : 'Salva modifiche'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// SEZIONE RUOLI
// ============================================================================
function RolesSection({ onToast }) {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  useEffect(() => { fetchRoles() }, [])

  const fetchRoles = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, category, color, hourly_rate_default, display_order')
      .order('display_order')
    if (!error) setRoles(data || [])
    setLoading(false)
  }

  const handleDelete = async (role) => {
    if (!confirm(`Eliminare il ruolo "${role.name}"? I dipendenti con questo ruolo dovranno essere riassegnati prima.`)) return
    const { error } = await supabase.from('roles').delete().eq('id', role.id)
    if (error) onToast('Errore: ' + error.message, 'error')
    else { onToast('Ruolo eliminato'); fetchRoles() }
  }

  if (loading) return <div className="text-center py-12 text-warm-brown font-sans">Caricamento…</div>

  return (
    <>
      <div className="bg-white rounded-2xl border border-cream-300 p-6">
        <div className="flex items-start justify-between mb-5 gap-3">
          <SectionHeader Icon={Users} title="Ruoli del team"
            subtitle="Categorie usate per assegnare i dipendenti e colorare i turni nel planning" />
          <button onClick={() => setEditing('new')}
            className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm flex-shrink-0">
            <Plus size={14} /> Nuovo
          </button>
        </div>

        <div className="space-y-2">
          {roles.map((r) => (
            <RoleRow key={r.id} role={r}
              onEdit={() => setEditing(r)}
              onDelete={() => handleDelete(r)} />
          ))}
        </div>
      </div>

      {editing && (
        <RoleEditModal
          role={editing === 'new' ? null : editing}
          existingOrders={roles.map((r) => r.display_order)}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); fetchRoles(); onToast(msg) }} />
      )}
    </>
  )
}

function RoleRow({ role, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-cream-200 hover:border-cream-300 transition">
      <div className="w-1.5 self-stretch rounded-full" style={{ backgroundColor: role.color }} />
      <div className="flex-1 min-w-0">
        <div className="font-sans font-semibold text-warm-dark">{role.name}</div>
        <div className="font-sans text-xs text-warm-brown flex flex-wrap items-center gap-x-2 mt-0.5">
          <span>{ROLE_CATEGORIES.find((c) => c.value === role.category)?.label || role.category}</span>
          <span>·</span>
          <span className="tabular-nums">{role.color}</span>
          {role.hourly_rate_default && (
            <>
              <span>·</span>
              <span>€{role.hourly_rate_default}/h</span>
            </>
          )}
        </div>
      </div>
      <button onClick={onEdit}
        className="p-2 rounded-lg hover:bg-cream-200 text-warm-brown hover:text-warm-dark transition"
        title="Modifica">
        <Edit size={14} />
      </button>
      <button onClick={onDelete}
        className="p-2 rounded-lg hover:bg-terracotta-50 text-terracotta-700 transition"
        title="Elimina">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function RoleEditModal({ role, existingOrders, onClose, onSaved }) {
  const isEdit = !!role
  const [form, setForm] = useState(() => {
    if (role) {
      return {
        name: role.name || '',
        category: role.category || 'reception',
        color: role.color || '#C97D60',
        hourly_rate_default: role.hourly_rate_default || '',
        display_order: role.display_order || 0,
      }
    }
    const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : 0
    return {
      name: '',
      category: 'reception',
      color: '#C97D60',
      hourly_rate_default: '',
      display_order: maxOrder + 1,
    }
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const payload = {
      name: form.name.trim(),
      category: form.category,
      color: form.color,
      hourly_rate_default: form.hourly_rate_default ? parseFloat(form.hourly_rate_default) : null,
      display_order: parseInt(form.display_order),
    }
    const { error } = isEdit
      ? await supabase.from('roles').update(payload).eq('id', role.id)
      : await supabase.from('roles').insert(payload)
    setSubmitting(false)
    if (error) setError(error.message)
    else onSaved(isEdit ? 'Ruolo modificato' : 'Ruolo creato')
  }

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-md w-full max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <h2 className="text-2xl text-warm-dark">
            {isEdit ? 'Modifica ruolo' : 'Nuovo ruolo'}
          </h2>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <Field label="Nome" required>
            <input type="text" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls} />
          </Field>

          <Field label="Categoria" required>
            <select required value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={inputCls}>
              {ROLE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Colore" required hint="Usato per identificare il ruolo nel planning">
            <div className="flex items-center gap-3">
              <input type="color" value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-14 h-12 rounded-lg border border-cream-300 cursor-pointer" />
              <input type="text" value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className={inputCls + ' flex-1 tabular-nums uppercase'} />
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Ordine" hint="Posizione in lista">
              <input type="number" min="0" value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: e.target.value })}
                className={inputCls + ' tabular-nums'} />
            </Field>
            <Field label="Tariffa oraria (€)" hint="Opzionale">
              <input type="number" step="0.01" min="0" value={form.hourly_rate_default}
                onChange={(e) => setForm({ ...form, hourly_rate_default: e.target.value })}
                placeholder="es. 12.50"
                className={inputCls + ' tabular-nums'} />
            </Field>
          </div>

          {error && (
            <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cream-200 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-sans font-semibold text-sm text-warm-dark hover:bg-cream-100 transition">
            Annulla
          </button>
          <button type="submit" disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold text-sm transition shadow-sm">
            {submitting ? 'Salvataggio…' : (isEdit ? 'Salva' : 'Crea')}
          </button>
        </div>
      </form>
    </div>
  )
}

// ============================================================================
// SHARED
// ============================================================================
const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 transition'

function SectionHeader({ Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-terracotta-50 flex items-center justify-center flex-shrink-0">
        <Icon size={18} className="text-terracotta-600" />
      </div>
      <div>
        <h2 className="text-xl text-warm-dark font-serif">{title}</h2>
        <p className="font-sans text-xs text-warm-brown">{subtitle}</p>
      </div>
    </div>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
        {label} {required && <span className="text-terracotta-500">*</span>}
      </label>
      {children}
      {hint && (
        <p className="font-sans text-xs text-warm-brown/70 mt-1">{hint}</p>
      )}
    </div>
  )
}

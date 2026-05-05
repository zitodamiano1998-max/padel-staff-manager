import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X } from 'lucide-react'

export default function StaffFormModal({ staff, roles, onClose, onSaved, onError }) {
  const isEdit = !!staff

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role_id: '',
    contract_type: 'part_time',
    weekly_hours: 40,
    compensation_type: 'none',
    hourly_rate: '',
    monthly_salary: '',
    hire_date: '',
    fiscal_code: '',
    iban: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (staff) {
      setForm({
        first_name: staff.first_name || '',
        last_name: staff.last_name || '',
        email: staff.email || '',
        phone: staff.phone || '',
        role_id: staff.role_id || '',
        contract_type: staff.contract_type || 'part_time',
        weekly_hours: staff.weekly_hours ?? 40,
        compensation_type: staff.compensation_type || 'none',
        hourly_rate: staff.hourly_rate ?? '',
        monthly_salary: staff.monthly_salary ?? '',
        hire_date: staff.hire_date || '',
        fiscal_code: staff.fiscal_code || '',
        iban: staff.iban || '',
        notes: staff.notes || '',
      })
    }
  }, [staff])

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      if (isEdit) {
        // EDIT: update diretto
        const payload = {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone?.trim() || null,
          role_id: form.role_id || null,
          contract_type: form.contract_type,
          weekly_hours: parseFloat(form.weekly_hours) || 40,
          compensation_type: form.compensation_type || 'none',
          hourly_rate: form.compensation_type === 'hourly' && form.hourly_rate
            ? parseFloat(form.hourly_rate) : null,
          monthly_salary: form.compensation_type === 'monthly' && form.monthly_salary
            ? parseFloat(form.monthly_salary) : null,
          hire_date: form.hire_date || null,
          fiscal_code: form.fiscal_code?.trim() || null,
          iban: form.iban?.trim() || null,
          notes: form.notes?.trim() || null,
        }
        const { error } = await supabase
          .from('staff_members')
          .update(payload)
          .eq('id', staff.id)
        if (error) throw error
        onSaved()
      } else {
        // CREATE: chiama edge function (crea record + manda invito)
        const { data, error } = await supabase.functions.invoke('invite-staff', {
          body: {
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            email: form.email.trim().toLowerCase(),
            phone: form.phone?.trim() || null,
            role_id: form.role_id || null,
            contract_type: form.contract_type,
            weekly_hours: parseFloat(form.weekly_hours) || 40,
            compensation_type: form.compensation_type || 'none',
            hourly_rate: form.compensation_type === 'hourly' && form.hourly_rate
              ? parseFloat(form.hourly_rate) : null,
            monthly_salary: form.compensation_type === 'monthly' && form.monthly_salary
              ? parseFloat(form.monthly_salary) : null,
            hire_date: form.hire_date || null,
            fiscal_code: form.fiscal_code?.trim() || null,
            iban: form.iban?.trim() || null,
            notes: form.notes?.trim() || null,
            redirect_url: `${window.location.origin}/accept-invite`,
          },
        })

        if (error) throw error
        if (data?.error) throw new Error(data.error)

        onSaved()
      }
    } catch (err) {
      setError(err.message || 'Errore generico')
      if (onError) onError(err.message || 'Errore')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-warm-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-cream-300 max-w-2xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-2xl text-warm-dark">
            {isEdit ? 'Modifica dipendente' : 'Nuovo dipendente'}
          </h2>
          <button onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Nome + Cognome */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nome" required>
              <input type="text" required value={form.first_name}
                onChange={update('first_name')} className={inputCls} />
            </Field>
            <Field label="Cognome" required>
              <input type="text" required value={form.last_name}
                onChange={update('last_name')} className={inputCls} />
            </Field>
          </div>

          {/* Email + Telefono */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email" required hint={isEdit ? 'Non modificabile' : 'Riceverà l\'invito qui'}>
              <input type="email" required value={form.email}
                onChange={update('email')} disabled={isEdit}
                className={`${inputCls} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </Field>
            <Field label="Telefono">
              <input type="tel" value={form.phone}
                onChange={update('phone')} className={inputCls} />
            </Field>
          </div>

          {/* Ruolo + Contratto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Ruolo">
              <select value={form.role_id} onChange={update('role_id')}
                className={inputCls}>
                <option value="">— Seleziona —</option>
                {roles.filter((r) => r.name !== 'Manager').map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo contratto">
              <select value={form.contract_type} onChange={update('contract_type')}
                className={inputCls}>
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="collaboration">Collaborazione</option>
                <option value="intern">Tirocinio</option>
                <option value="seasonal">Stagionale</option>
              </select>
            </Field>
          </div>

          {/* Ore settimanali */}
          <Field label="Ore settimanali">
            <input type="number" step="0.5" min="0" max="60" value={form.weekly_hours}
              onChange={update('weekly_hours')} className={inputCls} />
          </Field>

          {/* Tipo retribuzione */}
          <Field label="Tipo retribuzione">
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'hourly', label: 'Oraria', sub: '€/ora' },
                { value: 'monthly', label: 'Mensile', sub: '€/mese' },
                { value: 'none', label: 'Non tracciata', sub: 'paga esterna' },
              ].map((opt) => (
                <label key={opt.value}
                  className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition text-center ${
                    form.compensation_type === opt.value
                      ? 'border-terracotta-400 bg-terracotta-50'
                      : 'border-cream-300 bg-white hover:border-cream-400'
                  }`}>
                  <input type="radio" name="compensation_type" value={opt.value}
                    checked={form.compensation_type === opt.value}
                    onChange={update('compensation_type')}
                    className="hidden" />
                  <span className={`font-sans text-sm font-semibold ${
                    form.compensation_type === opt.value ? 'text-terracotta-700' : 'text-warm-dark'
                  }`}>{opt.label}</span>
                  <span className="font-sans text-xs text-warm-brown">{opt.sub}</span>
                </label>
              ))}
            </div>
          </Field>

          {/* Importo - condizionale */}
          {form.compensation_type === 'hourly' && (
            <Field label="Tariffa oraria (€)">
              <input type="number" step="0.01" min="0" value={form.hourly_rate}
                onChange={update('hourly_rate')} className={inputCls}
                placeholder="es. 12.50" />
              <p className="font-sans text-xs text-warm-brown mt-1">
                Costo calcolato: ore effettive timbrate × tariffa
              </p>
            </Field>
          )}
          {form.compensation_type === 'monthly' && (
            <Field label="Stipendio mensile lordo (€)">
              <input type="number" step="0.01" min="0" value={form.monthly_salary}
                onChange={update('monthly_salary')} className={inputCls}
                placeholder="es. 1500" />
              <p className="font-sans text-xs text-warm-brown mt-1">
                Costo calcolato: stipendio × (giorni periodo / 30)
              </p>
            </Field>
          )}

          {/* Hire date */}
          <Field label="Data assunzione">
            <input type="date" value={form.hire_date}
              onChange={update('hire_date')} className={inputCls} />
          </Field>

          {/* Codice fiscale + IBAN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Codice fiscale">
              <input type="text" value={form.fiscal_code}
                onChange={update('fiscal_code')} className={inputCls}
                style={{ textTransform: 'uppercase' }} />
            </Field>
            <Field label="IBAN">
              <input type="text" value={form.iban}
                onChange={update('iban')} className={inputCls}
                style={{ textTransform: 'uppercase' }} />
            </Field>
          </div>

          {/* Note */}
          <Field label="Note">
            <textarea rows="3" value={form.notes}
              onChange={update('notes')}
              className={`${inputCls} resize-none`}
              placeholder="Note interne (visibili solo al manager)" />
          </Field>

          {/* Errore */}
          {error && (
            <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-cream-200">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-sans font-semibold text-sm text-warm-dark hover:bg-cream-100 transition">
              Annulla
            </button>
            <button type="submit" disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold text-sm transition shadow-sm">
              {submitting
                ? (isEdit ? 'Salvataggio...' : 'Invio invito...')
                : (isEdit ? 'Salva modifiche' : 'Crea e invia invito')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-cream-50 font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 focus:bg-white focus:ring-2 focus:ring-terracotta-100 transition disabled:bg-cream-100'

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
        {label} {required && <span className="text-terracotta-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-warm-brown/70 font-sans mt-1">{hint}</p>}
    </div>
  )
}

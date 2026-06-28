import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Lock, Check, AlertCircle } from 'lucide-react'

export default function Profile() {
  const { profile } = useAuth()
  const [email, setEmail] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Email dell'account (fonte affidabile: l'utente auth, non il profilo)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!cancelled) setEmail(data?.user?.email || '')
    })()
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async () => {
    setError(null)
    setSuccess(false)

    // Validazioni lato client
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Compila tutti i campi.')
      return
    }
    if (newPassword.length < 8) {
      setError('La nuova password deve avere almeno 8 caratteri.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('La nuova password e la conferma non coincidono.')
      return
    }
    if (newPassword === currentPassword) {
      setError('La nuova password deve essere diversa da quella attuale.')
      return
    }

    setSaving(true)

    // Recupero l'email dell'utente loggato
    const { data: userData } = await supabase.auth.getUser()
    const userEmail = userData?.user?.email
    if (!userEmail) {
      setSaving(false)
      setError('Impossibile leggere il tuo account. Ricarica la pagina e riprova.')
      return
    }

    // 1. Verifico la password attuale ri-autenticando l'utente.
    //    Se è sbagliata, signInWithPassword restituisce errore e la sessione
    //    corrente resta comunque valida (non viene fatto logout).
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    })
    if (signInError) {
      setSaving(false)
      setError('La password attuale non è corretta.')
      return
    }

    // 2. Imposto la nuova password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })
    setSaving(false)
    if (updateError) {
      setError(updateError.message || 'Errore durante il cambio password. Riprova.')
      return
    }

    setSuccess(true)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const initials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-4xl text-warm-dark mb-1">Il tuo profilo</h1>
        <p className="font-sans text-sm text-warm-brown">
          I tuoi dati e la sicurezza del tuo account.
        </p>
      </div>

      {/* Dati utente (sola lettura) */}
      <div className="bg-white rounded-2xl border border-cream-300 p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-serif text-lg font-semibold flex-shrink-0"
            style={{ backgroundColor: profile?.role_color || '#C97D60' }}>
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-sans font-semibold text-warm-dark">
              {profile?.first_name} {profile?.last_name}
            </div>
            <div className="font-sans text-sm text-warm-brown truncate">
              {email}
            </div>
            <div className="font-sans text-sm text-warm-brown">
              {profile?.role_name}{profile?.is_manager && ' · Manager'}
            </div>
          </div>
        </div>
      </div>

      {/* Cambia password */}
      <div className="bg-white rounded-2xl border border-cream-300 p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-terracotta-50 flex items-center justify-center flex-shrink-0">
            <Lock size={20} className="text-terracotta-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-serif text-xl text-warm-dark mb-1">Cambia password</h2>
            <p className="font-sans text-sm text-warm-brown">
              Per sicurezza ti chiediamo prima la password attuale.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <PasswordField
            label="Password attuale"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showPw}
            autoComplete="current-password"
          />
          <PasswordField
            label="Nuova password"
            value={newPassword}
            onChange={setNewPassword}
            show={showPw}
            autoComplete="new-password"
            hint="Almeno 8 caratteri."
          />
          <PasswordField
            label="Conferma nuova password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showPw}
            autoComplete="new-password"
          />

          <label className="flex items-center gap-2 font-sans text-sm text-warm-brown cursor-pointer select-none">
            <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)}
              className="rounded border-cream-300" />
            Mostra le password
          </label>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 font-sans text-sm">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 bg-sage-50 border border-sage-200 text-sage-800 rounded-xl px-3 py-2 font-sans text-sm">
              <Check size={16} className="flex-shrink-0 mt-0.5" />
              <span>Password aggiornata. La prossima volta accedi con la nuova password.</span>
            </div>
          )}

          <button onClick={handleSubmit} disabled={saving}
            className="bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-5 py-3 rounded-xl transition shadow-sm disabled:opacity-50">
            {saving ? 'Salvataggio…' : 'Aggiorna password'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PasswordField({ label, value, onChange, show, autoComplete, hint }) {
  return (
    <div>
      <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">{label}</label>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full bg-white border border-cream-300 rounded-xl px-4 py-2.5 font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 transition"
      />
      {hint && <p className="font-sans text-xs text-warm-brown mt-1">{hint}</p>}
    </div>
  )
}

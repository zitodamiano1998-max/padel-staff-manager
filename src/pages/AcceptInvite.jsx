import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AcceptInvite() {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Quando l'utente atterra dal link email, Supabase ha già impostato la sessione
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La password deve essere almeno 8 caratteri')
      return
    }
    if (password !== confirmPassword) {
      setError('Le password non coincidono')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 2000)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100">
        <div className="text-warm-brown font-sans">Verifica invito...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-cream-300 p-8 max-w-md text-center shadow-sm">
          <h1 className="text-2xl text-warm-dark mb-3">Link non valido</h1>
          <p className="font-sans text-sm text-warm-brown leading-relaxed mb-6">
            Il link di invito è scaduto o non è più valido.<br />
            Chiedi al manager di rinviarti l'invito.
          </p>
          <button onClick={() => navigate('/login')}
            className="text-terracotta-500 hover:text-terracotta-600 font-sans text-sm font-semibold">
            ← Torna al login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-terracotta-400 mx-auto mb-4 flex items-center justify-center text-white font-serif text-3xl font-semibold">
            P
          </div>
          <h1 className="text-3xl text-warm-dark mb-1">Benvenuto!</h1>
          <p className="text-warm-brown font-sans text-sm">
            Imposta la tua password per accedere
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-cream-300 p-8">

          {success ? (
            <div className="text-center py-4">
              <div className="bg-sage-400/10 border border-sage-400/30 text-sage-500 rounded-xl p-4 font-sans text-sm mb-4">
                ✅ Password impostata!
              </div>
              <p className="font-sans text-sm text-warm-brown">
                Ti reindirizzo alla dashboard...
              </p>
            </div>
          ) : (
            <>
              <p className="font-sans text-sm text-warm-brown mb-6">
                Sei loggato come{' '}
                <strong className="text-warm-dark">{session.user?.email}</strong>.
                Scegli una password per il tuo account.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
                    Nuova password
                  </label>
                  <input type="password" required minLength={8} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 font-sans text-sm focus:outline-none focus:border-terracotta-400 focus:bg-white focus:ring-2 focus:ring-terracotta-100 transition"
                    placeholder="Almeno 8 caratteri"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
                    Conferma password
                  </label>
                  <input type="password" required minLength={8} value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 font-sans text-sm focus:outline-none focus:border-terracotta-400 focus:bg-white focus:ring-2 focus:ring-terracotta-100 transition"
                    placeholder="Ripeti la password"
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={submitting}
                  className="w-full bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold py-3 rounded-xl transition shadow-sm">
                  {submitting ? 'Salvataggio...' : 'Imposta password e accedi'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

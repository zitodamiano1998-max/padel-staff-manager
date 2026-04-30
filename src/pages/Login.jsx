import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const { signIn, resetPassword } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (resetMode) {
      const { error } = await resetPassword(email)
      setLoading(false)
      if (error) setError(error.message)
      else setResetSent(true)
      return
    }

    const { error } = await signIn(email, password)
    setLoading(false)

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email o password non corrette'
          : error.message
      )
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">

        {/* Logo + brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-terracotta-400 mx-auto mb-4 flex items-center justify-center text-white font-serif text-3xl font-semibold">
            P
          </div>
          <h1 className="text-3xl text-warm-dark mb-1">Padel Staff Manager</h1>
          <p className="text-warm-brown font-sans text-sm">Centro Padel San Miniato</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-cream-300 p-8">
          <h2 className="text-2xl text-warm-dark mb-6">
            {resetMode ? 'Reset password' : 'Accedi'}
          </h2>

          {resetSent ? (
            <div className="text-center py-2">
              <div className="bg-sage-400/10 border border-sage-400/30 text-sage-500 rounded-xl p-4 font-sans text-sm mb-4">
                ✅ Email di reset inviata
              </div>
              <p className="font-sans text-sm text-warm-brown mb-6 leading-relaxed">
                Controlla la casella di posta di <strong>{email}</strong> e clicca il link
                per impostare una nuova password.
              </p>
              <button onClick={() => { setResetMode(false); setResetSent(false); setEmail('') }}
                className="text-terracotta-500 font-sans text-sm hover:text-terracotta-600 font-semibold">
                ← Torna al login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email */}
              <div>
                <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
                  Email
                </label>
                <input type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 font-sans text-sm text-warm-dark placeholder-warm-brown/50 focus:outline-none focus:border-terracotta-400 focus:bg-white focus:ring-2 focus:ring-terracotta-100 transition"
                  placeholder="esempio@email.com"
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              {!resetMode && (
                <div>
                  <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
                    Password
                  </label>
                  <input type="password" required value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 font-sans text-sm text-warm-dark placeholder-warm-brown/50 focus:outline-none focus:border-terracotta-400 focus:bg-white focus:ring-2 focus:ring-terracotta-100 transition"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
              )}

              {/* Errore */}
              {error && (
                <div className="bg-terracotta-50 border border-terracotta-200 text-terracotta-700 rounded-xl px-4 py-3 font-sans text-sm">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading}
                className="w-full bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 disabled:cursor-not-allowed text-white font-sans font-semibold py-3 rounded-xl transition shadow-sm">
                {loading ? 'Attendi...' : resetMode ? 'Invia email reset' : 'Accedi'}
              </button>

              {/* Toggle reset/login */}
              <div className="text-center pt-2">
                <button type="button"
                  onClick={() => { setResetMode(!resetMode); setError(null) }}
                  className="text-terracotta-500 hover:text-terracotta-600 font-sans text-sm font-medium">
                  {resetMode ? '← Torna al login' : 'Hai dimenticato la password?'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-warm-brown/60 font-sans text-xs mt-6 leading-relaxed">
          Solo personale autorizzato.<br />
          Se non hai un account, contatta il manager.
        </p>
      </div>
    </div>
  )
}

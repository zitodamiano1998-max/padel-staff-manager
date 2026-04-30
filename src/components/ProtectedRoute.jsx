import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function ProtectedRoute({ children, requireManager = false }) {
  const { session, profile, loading } = useAuth()

  // Stato caricamento iniziale
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100">
        <div className="text-warm-brown font-sans">Caricamento...</div>
      </div>
    )
  }

  // Non loggato → vai al login
  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Loggato ma senza profilo staff_member collegato
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100 px-6">
        <div className="bg-white rounded-2xl border border-cream-300 p-8 max-w-md text-center shadow-sm">
          <h1 className="text-2xl text-warm-dark mb-3">Account non collegato</h1>
          <p className="font-sans text-warm-brown text-sm leading-relaxed">
            Il tuo account non è ancora associato a un dipendente in anagrafica.
            Contatta il manager per richiedere l'attivazione.
          </p>
        </div>
      </div>
    )
  }

  // Pagina riservata manager
  if (requireManager && !profile.is_manager) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

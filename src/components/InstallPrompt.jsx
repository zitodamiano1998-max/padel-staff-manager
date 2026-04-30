import { useState, useEffect } from 'react'
import { Download, X, Share } from 'lucide-react'

const STORAGE_KEY = 'padel-staff-install-dismissed'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1'
  )

  // Listener Android/Desktop
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Detect iOS Safari (no beforeinstallprompt support)
  useEffect(() => {
    if (dismissed) return
    const ua = window.navigator.userAgent
    const isIOS = /iPhone|iPad|iPod/i.test(ua)
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (isIOS && isSafari && !isStandalone) {
      setShowIosHint(true)
    }
  }, [dismissed])

  // Se già installata (display-mode standalone), nasconde tutto
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (standalone) {
      setDismissed(true)
    }
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem(STORAGE_KEY, '1')
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (outcome === 'accepted') {
      handleDismiss()
    }
  }

  if (dismissed) return null

  // Banner Android/Desktop
  if (deferredPrompt) {
    return (
      <div className="bg-terracotta-50 border-b border-terracotta-200 px-4 py-3 flex items-center gap-3">
        <Download size={18} className="text-terracotta-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-sans text-sm font-semibold text-warm-dark">
            Installa l'app sul dispositivo
          </div>
          <div className="font-sans text-xs text-warm-brown hidden sm:block">
            Accesso rapido dalla home, schermo intero, notifiche
          </div>
        </div>
        <button onClick={handleInstall}
          className="bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold text-sm px-4 py-2 rounded-xl transition flex-shrink-0">
          Installa
        </button>
        <button onClick={handleDismiss}
          className="p-1.5 rounded-lg hover:bg-terracotta-100 text-warm-brown flex-shrink-0"
          title="Più tardi">
          <X size={16} />
        </button>
      </div>
    )
  }

  // Banner iOS (con istruzioni manuali)
  if (showIosHint) {
    return (
      <div className="bg-terracotta-50 border-b border-terracotta-200 px-4 py-3 flex items-center gap-3">
        <Share size={18} className="text-terracotta-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-sans text-sm font-semibold text-warm-dark">
            Installa l'app
          </div>
          <div className="font-sans text-xs text-warm-brown">
            Tocca <Share size={10} className="inline mx-0.5" /> Condividi → "Aggiungi a Home"
          </div>
        </div>
        <button onClick={handleDismiss}
          className="p-1.5 rounded-lg hover:bg-terracotta-100 text-warm-brown flex-shrink-0"
          title="Chiudi">
          <X size={16} />
        </button>
      </div>
    )
  }

  return null
}

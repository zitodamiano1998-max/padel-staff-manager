import { useState, useEffect } from 'react'
import { Download, Share, X, Smartphone } from 'lucide-react'

const STORAGE_KEY = 'pwa_install_dismissed_until'
const DISMISS_DAYS = 14

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [iosShow, setIosShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Già installata? Non mostro nulla
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
    if (isStandalone) return

    // Controllo dismiss precedente
    const dismissedUntil = parseInt(localStorage.getItem(STORAGE_KEY) || '0')
    if (dismissedUntil > Date.now()) return

    // iOS Safari: niente beforeinstallprompt, mostro istruzioni manuali
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    const isIOSSafari = isIOS && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)
    if (isIOSSafari) {
      // Aspetto qualche secondo prima di mostrarlo (UX meno aggressiva)
      const t = setTimeout(() => setIosShow(true), 8000)
      return () => clearTimeout(t)
    }

    // Android/Chrome: ascolto evento beforeinstallprompt
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // Aspetto qualche secondo
      setTimeout(() => setShow(true), 5000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000
    localStorage.setItem(STORAGE_KEY, String(until))
    setShow(false)
    setIosShow(false)
  }

  const install = async () => {
    if (!deferredPrompt) return
    setInstalling(true)
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setInstalling(false)
    if (outcome === 'accepted') {
      setShow(false)
    } else {
      dismiss()
    }
    setDeferredPrompt(null)
  }

  // Banner Android/Chrome
  if (show) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50
        bg-white border border-cream-300 rounded-2xl shadow-lg overflow-hidden
        animate-slide-up">
        <div className="p-4 flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-terracotta-100 flex items-center justify-center flex-shrink-0">
            <Smartphone size={22} className="text-terracotta-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-lg text-warm-dark leading-tight">Installa l'app</h3>
            <p className="font-sans text-xs text-warm-brown mt-1">
              Aggiungi Padel Staff alla home screen per accesso rapido e notifiche.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={install} disabled={installing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans text-sm font-semibold rounded-lg transition">
                <Download size={14} />
                {installing ? 'Installazione...' : 'Installa'}
              </button>
              <button onClick={dismiss}
                className="px-3 py-1.5 text-warm-brown hover:bg-cream-100 font-sans text-sm rounded-lg transition">
                Più tardi
              </button>
            </div>
          </div>
          <button onClick={dismiss}
            className="p-1 text-warm-brown hover:bg-cream-100 rounded-lg flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  // Banner iOS Safari
  if (iosShow) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50
        bg-white border border-cream-300 rounded-2xl shadow-lg overflow-hidden
        animate-slide-up">
        <div className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-terracotta-100 flex items-center justify-center flex-shrink-0">
              <Smartphone size={22} className="text-terracotta-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-serif text-lg text-warm-dark leading-tight">Installa Padel Staff</h3>
              <p className="font-sans text-xs text-warm-brown mt-1">
                Aggiungila alla home schermata per ricevere notifiche e accesso veloce.
              </p>
            </div>
            <button onClick={dismiss}
              className="p-1 text-warm-brown hover:bg-cream-100 rounded-lg flex-shrink-0">
              <X size={16} />
            </button>
          </div>
          <div className="bg-cream-50 rounded-xl p-3 font-sans text-xs text-warm-dark space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold">1.</span>
              <span>Tocca</span>
              <Share size={14} className="text-blue-600" />
              <span>in basso</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">2.</span>
              <span>Scegli "Aggiungi a Home"</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">3.</span>
              <span>Conferma "Aggiungi"</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

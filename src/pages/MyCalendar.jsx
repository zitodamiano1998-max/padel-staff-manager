import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Calendar, Copy, RefreshCw, Check, ExternalLink,
  Smartphone, Monitor, AlertCircle,
} from 'lucide-react'

const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/ical-feed'

export default function MyCalendar() {
  const { profile } = useAuth()
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (profile?.id) fetchToken()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const fetchToken = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('staff_members')
      .select('ical_token')
      .eq('id', profile.id)
      .single()
    if (!error && data) setToken(data.ical_token)
    setLoading(false)
  }

  const handleRegenerate = async () => {
    if (!confirm('Rigenerando il token, il vecchio link smetterà di funzionare. I tuoi calendar sottoscritti dovranno essere ricollegati. Procedere?')) return
    setRegenerating(true)
    setError(null)
    const { data, error } = await supabase.rpc('regenerate_ical_token', { p_staff_id: profile.id })
    setRegenerating(false)
    if (error) setError(error.message)
    else setToken(data)
  }

  const httpsUrl = token ? `${SUPABASE_FUNCTIONS_URL}?token=${token}` : null
  const webcalUrl = httpsUrl ? httpsUrl.replace(/^https?:\/\//, 'webcal://') : null

  const handleCopy = (url) => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Google Calendar URL helper
  const googleAddUrl = httpsUrl
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(httpsUrl)}`
    : null

  if (loading) return <div className="text-center py-12 text-warm-brown font-sans">Caricamento…</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl text-warm-dark mb-1">Il tuo calendario</h1>
        <p className="font-sans text-sm text-warm-brown">
          Aggiungi i tuoi turni a Google Calendar, Apple Calendar, Outlook o qualsiasi altra app.
          Quando i turni vengono modificati o cancellati, il tuo calendario si aggiorna automaticamente.
        </p>
      </div>

      {/* Hero card */}
      <div className="bg-white rounded-2xl border border-cream-300 p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-terracotta-50 flex items-center justify-center flex-shrink-0">
            <Calendar size={20} className="text-terracotta-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-serif text-xl text-warm-dark mb-1">Sottoscrivi il calendario</h2>
            <p className="font-sans text-sm text-warm-brown">
              Una volta aggiunto, riceverai automaticamente ogni nuovo turno nel tuo calendario personale.
              Non puoi modificare i turni dal calendario: è in sola lettura.
            </p>
          </div>
        </div>

        {/* Google Calendar quick add */}
        <div className="space-y-3">
          <a href={googleAddUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-5 py-3 rounded-xl transition shadow-sm">
            <Calendar size={18} />
            <span className="flex-1 text-left">Aggiungi a Google Calendar</span>
            <ExternalLink size={14} />
          </a>

          <a href={webcalUrl}
            className="flex items-center gap-3 w-full bg-white hover:bg-cream-100 border border-cream-300 text-warm-dark font-sans font-semibold px-5 py-3 rounded-xl transition">
            <Smartphone size={18} />
            <span className="flex-1 text-left">Aggiungi a Apple Calendar (iPhone/Mac)</span>
            <ExternalLink size={14} />
          </a>

          <button onClick={() => handleCopy(httpsUrl)}
            className="flex items-center gap-3 w-full bg-white hover:bg-cream-100 border border-cream-300 text-warm-dark font-sans font-semibold px-5 py-3 rounded-xl transition">
            {copied ? <Check size={18} className="text-sage-600" /> : <Copy size={18} />}
            <span className="flex-1 text-left">{copied ? 'Link copiato!' : 'Copia link per altre app (Outlook, Notion, …)'}</span>
          </button>
        </div>
      </div>

      {/* Istruzioni manuali */}
      <details className="bg-white rounded-2xl border border-cream-300 p-5 group">
        <summary className="cursor-pointer font-sans font-semibold text-warm-dark hover:text-terracotta-600 transition">
          Istruzioni passo-passo per ciascun calendario
        </summary>
        <div className="mt-5 space-y-5 font-sans text-sm text-warm-brown">

          <div>
            <div className="font-semibold text-warm-dark mb-1.5 flex items-center gap-2">
              <Monitor size={14} /> Google Calendar (browser)
            </div>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Apri Google Calendar nel browser</li>
              <li>Nella sidebar sinistra, trova "Altri calendari" e clicca il <strong>+</strong></li>
              <li>Scegli "Da URL"</li>
              <li>Incolla il link copiato (HTTPS) e clicca "Aggiungi calendario"</li>
            </ol>
          </div>

          <div>
            <div className="font-semibold text-warm-dark mb-1.5 flex items-center gap-2">
              <Smartphone size={14} /> Apple Calendar (iPhone)
            </div>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Tap "Aggiungi a Apple Calendar" qui sopra</li>
              <li>Conferma "Sottoscrivi"</li>
              <li>Lascia la frequenza di aggiornamento "Automatica"</li>
            </ol>
          </div>

          <div>
            <div className="font-semibold text-warm-dark mb-1.5 flex items-center gap-2">
              <Monitor size={14} /> Outlook
            </div>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Outlook → Calendario → "Aggiungi calendario"</li>
              <li>Scegli "Sottoscrivi dal Web"</li>
              <li>Incolla il link HTTPS copiato</li>
            </ol>
          </div>
        </div>
      </details>

      {/* Link tecnico + rigenera */}
      <div className="bg-cream-50 border border-cream-200 rounded-2xl p-5">
        <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-2">
          Il tuo link personale
        </div>
        <div className="bg-white border border-cream-300 rounded-lg px-3 py-2 font-mono text-xs text-warm-dark break-all mb-3">
          {httpsUrl}
        </div>
        <div className="flex items-start gap-2 font-sans text-xs text-warm-brown mb-4">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Questo link è personale. Non condividerlo con nessuno: chiunque lo abbia può vedere i tuoi turni.
            Se pensi che qualcun altro lo abbia visto, rigeneralo qui sotto.
          </span>
        </div>
        <button onClick={handleRegenerate} disabled={regenerating}
          className="flex items-center gap-2 bg-white hover:bg-cream-100 border border-cream-300 text-warm-dark font-sans font-semibold px-4 py-2 rounded-xl transition text-sm disabled:opacity-50">
          <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} />
          {regenerating ? 'Rigenerazione…' : 'Rigenera link'}
        </button>
        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 font-sans text-xs">
            {error}
          </div>
        )}
      </div>

      {/* FAQ */}
      <div className="bg-white rounded-2xl border border-cream-300 p-5">
        <h3 className="font-serif text-lg text-warm-dark mb-3">Domande frequenti</h3>
        <div className="space-y-3 font-sans text-sm">
          <div>
            <div className="font-semibold text-warm-dark">Quanto ci mette il calendario ad aggiornarsi?</div>
            <div className="text-warm-brown">Apple Calendar: 15-60 minuti. Google Calendar: 12-24 ore. Outlook: 1-3 ore. Per modifiche urgenti, l'app rimane sempre aggiornata in tempo reale.</div>
          </div>
          <div>
            <div className="font-semibold text-warm-dark">Posso modificare un turno dal calendario?</div>
            <div className="text-warm-brown">No, il calendario è in sola lettura. Per modifiche contatta il manager.</div>
          </div>
          <div>
            <div className="font-semibold text-warm-dark">Vedo solo turni confermati?</div>
            <div className="text-warm-brown">Sì. I turni in bozza non vengono pubblicati nel calendario fino a quando il manager non li conferma.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

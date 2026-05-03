import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  isPushSupported, getPushPermissionStatus, subscribeToPush,
} from '../lib/pushClient'
import {
  ChevronRight, ChevronLeft, Check, Bell, Calendar, Clock as ClockIcon,
  Palmtree, ArrowLeftRight, Sparkles, X,
} from 'lucide-react'

const TOTAL_STEPS = 5

export default function OnboardingWizard({ onComplete }) {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // Form profilo (Step 2)
  const [phone, setPhone] = useState(profile?.phone || '')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')

  // Stato push (Step 4)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushError, setPushError] = useState(null)

  const handleNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const handleBack = () => setStep((s) => Math.max(s - 1, 1))

  const handleSaveProfile = async () => {
    setSubmitting(true)
    const { error } = await supabase
      .from('staff_members')
      .update({
        phone: phone || null,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: emergencyPhone || null,
      })
      .eq('id', profile.id)
    setSubmitting(false)
    if (error) {
      alert('Errore: ' + error.message)
      return
    }
    handleNext()
  }

  const handleEnablePush = async () => {
    setPushBusy(true)
    setPushError(null)
    try {
      await subscribeToPush(profile.id)
      setPushSubscribed(true)
    } catch (err) {
      setPushError(err.message)
    } finally {
      setPushBusy(false)
    }
  }

  const handleFinish = async () => {
    setSubmitting(true)
    await supabase
      .from('staff_members')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', profile.id)
    setSubmitting(false)
    if (refreshProfile) await refreshProfile()
    if (onComplete) onComplete()
  }

  const handleSkip = async () => {
    if (!confirm('Saltare la configurazione iniziale? Potrai sempre completare il profilo da Anagrafica.')) return
    await handleFinish()
  }

  return (
    <div className="fixed inset-0 z-50 bg-cream-100 overflow-y-auto">
      {/* Skip in alto a destra */}
      {step < TOTAL_STEPS && (
        <button onClick={handleSkip}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10 flex items-center gap-1 font-sans text-sm text-warm-brown hover:text-warm-dark transition px-3 py-1.5 rounded-lg hover:bg-cream-200">
          Salta
          <X size={14} />
        </button>
      )}

      <div className="min-h-screen flex flex-col">
        {/* Progress bar */}
        <div className="px-6 pt-6 sm:pt-8">
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="font-sans text-xs uppercase tracking-wider text-warm-brown">
                Passo {step} di {TOTAL_STEPS}
              </span>
            </div>
            <div className="h-1 bg-cream-200 rounded-full overflow-hidden">
              <div className="h-full bg-terracotta-400 transition-all duration-500"
                style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Contenuto */}
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="max-w-xl w-full">
            {step === 1 && <Step1Welcome firstName={profile?.first_name} />}
            {step === 2 && (
              <Step2Profile
                profile={profile}
                phone={phone} setPhone={setPhone}
                emergencyName={emergencyName} setEmergencyName={setEmergencyName}
                emergencyPhone={emergencyPhone} setEmergencyPhone={setEmergencyPhone} />
            )}
            {step === 3 && <Step3Tour />}
            {step === 4 && (
              <Step4Push
                onEnablePush={handleEnablePush}
                pushBusy={pushBusy}
                pushSubscribed={pushSubscribed}
                pushError={pushError} />
            )}
            {step === 5 && <Step5Done firstName={profile?.first_name} />}
          </div>
        </div>

        {/* Footer navigation */}
        <div className="px-6 pb-6 sm:pb-10">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            {step > 1 && step < TOTAL_STEPS ? (
              <button onClick={handleBack}
                className="flex items-center gap-1 font-sans font-semibold text-sm text-warm-brown hover:text-warm-dark transition px-4 py-2.5 rounded-xl hover:bg-cream-200">
                <ChevronLeft size={16} />
                Indietro
              </button>
            ) : <div />}

            {step === 1 && (
              <button onClick={handleNext}
                className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-6 py-3 rounded-xl transition shadow-sm">
                Iniziamo
                <ChevronRight size={16} />
              </button>
            )}
            {step === 2 && (
              <button onClick={handleSaveProfile} disabled={submitting}
                className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold px-6 py-3 rounded-xl transition shadow-sm">
                {submitting ? 'Salvataggio…' : 'Continua'}
                <ChevronRight size={16} />
              </button>
            )}
            {step === 3 && (
              <button onClick={handleNext}
                className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-6 py-3 rounded-xl transition shadow-sm">
                Continua
                <ChevronRight size={16} />
              </button>
            )}
            {step === 4 && (
              <button onClick={handleNext}
                className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-6 py-3 rounded-xl transition shadow-sm">
                {pushSubscribed ? 'Continua' : 'Più tardi'}
                <ChevronRight size={16} />
              </button>
            )}
            {step === 5 && (
              <button onClick={handleFinish} disabled={submitting}
                className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-300 text-white font-sans font-semibold px-6 py-3 rounded-xl transition shadow-sm w-full justify-center">
                {submitting ? 'Caricamento…' : 'Vai alla dashboard'}
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STEP 1 — Benvenuto
// ============================================================================
function Step1Welcome({ firstName }) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-terracotta-400 flex items-center justify-center text-white font-serif text-4xl font-semibold shadow-lg">
        P
      </div>
      <h1 className="font-serif text-4xl sm:text-5xl text-warm-dark mb-3">
        Benvenuto, {firstName}
      </h1>
      <p className="font-sans text-warm-brown text-base sm:text-lg leading-relaxed max-w-md mx-auto">
        Configuriamo insieme il tuo profilo in meno di un minuto.
        Sarà la base per gestire turni, timbrature e ferie al Centro Padel San Miniato.
      </p>
      <div className="mt-8 inline-flex items-center gap-2 bg-cream-200 rounded-full px-4 py-2">
        <Sparkles size={14} className="text-terracotta-600" />
        <span className="font-sans text-sm text-warm-dark">5 passaggi rapidi</span>
      </div>
    </div>
  )
}

// ============================================================================
// STEP 2 — Profilo
// ============================================================================
function Step2Profile({ profile, phone, setPhone, emergencyName, setEmergencyName, emergencyPhone, setEmergencyPhone }) {
  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="font-serif text-3xl text-warm-dark mb-2">I tuoi dati</h2>
        <p className="font-sans text-warm-brown">
          Conferma i tuoi recapiti. Sono visibili solo a te e al manager.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-cream-300 p-6 space-y-5">
        {/* Dati già presenti (read-only) */}
        <div>
          <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-2">
            Profilo
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-sans text-sm">
              <span className="text-warm-brown w-20">Nome:</span>
              <span className="text-warm-dark font-semibold">{profile?.first_name} {profile?.last_name}</span>
            </div>
            <div className="flex items-center gap-2 font-sans text-sm">
              <span className="text-warm-brown w-20">Email:</span>
              <span className="text-warm-dark">{profile?.email}</span>
            </div>
            <div className="flex items-center gap-2 font-sans text-sm">
              <span className="text-warm-brown w-20">Ruolo:</span>
              <span className="text-warm-dark">{profile?.role_name}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-cream-200 pt-5">
          <Field label="Telefono">
            <input type="tel" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="es. 333 1234567"
              className={inputCls} />
          </Field>
        </div>

        <div className="border-t border-cream-200 pt-5">
          <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-2">
            Contatto di emergenza <span className="normal-case font-normal opacity-70">(opzionale)</span>
          </div>
          <div className="space-y-3">
            <Field label="Nome">
              <input type="text" value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                placeholder="es. Maria Rossi"
                className={inputCls} />
            </Field>
            <Field label="Telefono">
              <input type="tel" value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                placeholder="es. 333 7654321"
                className={inputCls} />
            </Field>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STEP 3 — Tour
// ============================================================================
function Step3Tour() {
  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="font-serif text-3xl text-warm-dark mb-2">Cosa puoi fare</h2>
        <p className="font-sans text-warm-brown">
          Una breve panoramica delle funzioni principali.
        </p>
      </div>

      <div className="space-y-3">
        <FeatureCard Icon={Calendar} color="#C97D60" title="Vedi i tuoi turni"
          description="Apri il Planning per vedere settimana per settimana cosa hai in programma." />
        <FeatureCard Icon={ClockIcon} color="#5C8D7E" title="Timbra entrata e uscita"
          description="Registra l'inizio e la fine del tuo turno con un tap. Funziona solo se sei al centro." />
        <FeatureCard Icon={Palmtree} color="#D4A574" title="Richiedi ferie e permessi"
          description="Manda una richiesta al manager. Riceverai una notifica quando viene approvata." />
        <FeatureCard Icon={ArrowLeftRight} color="#8B7355" title="Cedi un turno"
          description="Se non puoi venire, pubblica il tuo turno: i colleghi possono prenderlo." />
      </div>
    </div>
  )
}

function FeatureCard({ Icon, color, title, description }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-4 flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
        style={{ backgroundColor: color }}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-sans font-semibold text-warm-dark mb-0.5">{title}</div>
        <div className="font-sans text-sm text-warm-brown leading-relaxed">{description}</div>
      </div>
    </div>
  )
}

// ============================================================================
// STEP 4 — Push notifications
// ============================================================================
function Step4Push({ onEnablePush, pushBusy, pushSubscribed, pushError }) {
  const supported = isPushSupported()

  return (
    <div className="text-center">
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-sage-100 flex items-center justify-center">
        <Bell size={28} className="text-sage-700" />
      </div>
      <h2 className="font-serif text-3xl text-warm-dark mb-2">Notifiche</h2>
      <p className="font-sans text-warm-brown mb-8 max-w-md mx-auto leading-relaxed">
        Vuoi ricevere una notifica sul telefono quando ti viene assegnato un nuovo turno,
        o quando il manager approva una tua richiesta?
      </p>

      {!supported ? (
        <div className="bg-cream-200 border border-cream-300 rounded-2xl p-5 text-left">
          <div className="font-sans text-sm text-warm-brown leading-relaxed">
            Le notifiche push non sono disponibili su questo browser.
            Per attivarle, installa l'app sulla schermata Home (Safari su iPhone:
            tasto Condividi → Aggiungi alla Home), poi riapri da lì.
          </div>
        </div>
      ) : pushSubscribed ? (
        <div className="bg-sage-50 border border-sage-200 rounded-2xl p-5 inline-flex items-center gap-3">
          <Check size={18} className="text-sage-700" />
          <span className="font-sans font-semibold text-sage-900">Notifiche attivate</span>
        </div>
      ) : (
        <>
          <button onClick={onEnablePush} disabled={pushBusy}
            className="inline-flex items-center gap-2 bg-sage-500 hover:bg-sage-600 disabled:bg-sage-400 text-white font-sans font-semibold px-6 py-3 rounded-xl transition shadow-sm">
            <Bell size={16} />
            {pushBusy ? 'Attivazione…' : 'Attiva notifiche'}
          </button>
          {pushError && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 font-sans text-sm max-w-sm mx-auto">
              {pushError}
            </div>
          )}
          <p className="font-sans text-xs text-warm-brown mt-4">
            Puoi attivarle anche più tardi dalla campanella in alto a destra.
          </p>
        </>
      )}
    </div>
  )
}

// ============================================================================
// STEP 5 — Done
// ============================================================================
function Step5Done({ firstName }) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-sage-100 flex items-center justify-center">
        <Check size={36} className="text-sage-700" strokeWidth={3} />
      </div>
      <h2 className="font-serif text-4xl sm:text-5xl text-warm-dark mb-3">
        Tutto pronto, {firstName}
      </h2>
      <p className="font-sans text-warm-brown text-base sm:text-lg leading-relaxed max-w-md mx-auto">
        Sei pronto per iniziare. Se hai dubbi, chiedi al manager o esplora l'app:
        ogni sezione ha tutto ciò che ti serve.
      </p>
    </div>
  )
}

// ============================================================================
// SHARED
// ============================================================================
const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100 transition'

function Field({ label, children }) {
  return (
    <div>
      <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

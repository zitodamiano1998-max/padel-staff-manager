import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Copy, X, Calendar, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

// Helpers date
function startOfWeekISO(date) {
  const d = new Date(date)
  const day = d.getDay() || 7  // Mon=1..Sun=7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}
function toISO(d) {
  // YYYY-MM-DD in local time (evita timezone shift di toISOString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function parseISO(iso) {
  // Parse YYYY-MM-DD in local time (NO timezone shift)
  if (!iso) return new Date()
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function fmtItRange(monday) {
  const sunday = addDays(monday, 6)
  const sM = monday.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  const sS = sunday.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${sM} – ${sS}`
}

export default function CopyWeekModal({ initialMonday, onClose, onDone }) {
  // Sorgente
  const [sourceISO, setSourceISO] = useState(() => toISO(startOfWeekISO(initialMonday || new Date())))
  // Target: 'single' | 'multi'
  const [targetMode, setTargetMode] = useState('single')
  const [targetSingleISO, setTargetSingleISO] = useState(() => toISO(addDays(startOfWeekISO(initialMonday || new Date()), 7)))
  const [targetMultiStartISO, setTargetMultiStartISO] = useState(() => toISO(addDays(startOfWeekISO(initialMonday || new Date()), 7)))
  const [targetMultiCount, setTargetMultiCount] = useState(4)

  // Opzioni
  const [conflictMode, setConflictMode] = useState('add')  // add | replace_drafts | replace_all
  const [skipOnLeave, setSkipOnLeave] = useState(true)
  const [publishImmediately, setPublishImmediately] = useState(false)

  // Preview sorgente
  const [sourcePreview, setSourcePreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Helper: snap a lunedì la data ISO
  const snapToMonday = (iso) => {
    if (!iso) return iso
    // Parse ISO senza timezone shift (uso parts manualmente)
    const [y, m, d] = iso.split('-').map(Number)
    const date = new Date(y, m - 1, d)  // local time, no timezone shift
    const day = date.getDay() || 7  // Mon=1..Sun=7
    date.setDate(date.getDate() - day + 1)
    return toISO(date)
  }

  const handleSourceChange = (iso) => setSourceISO(snapToMonday(iso))
  const handleTargetSingleChange = (iso) => setTargetSingleISO(snapToMonday(iso))
  const handleTargetMultiStartChange = (iso) => setTargetMultiStartISO(snapToMonday(iso))

  // Preview sorgente ad ogni cambio
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingPreview(true)
      const { data, error } = await supabase.rpc('count_shifts_in_week', { p_monday: sourceISO })
      if (cancelled) return
      setLoadingPreview(false)
      if (error) setSourcePreview(null)
      else setSourcePreview(data)
    }
    load()
    return () => { cancelled = true }
  }, [sourceISO])

  // Targets array
  const targets = useMemo(() => {
    if (targetMode === 'single') return [targetSingleISO]
    const start = parseISO(targetMultiStartISO)
    return Array.from({ length: Math.max(1, parseInt(targetMultiCount) || 1) }, (_, i) => toISO(addDays(start, i * 7)))
  }, [targetMode, targetSingleISO, targetMultiStartISO, targetMultiCount])

  // Validazione: target non può sovrapporsi alla sorgente
  const sourceInTargets = targets.includes(sourceISO)

  const expectedShifts = (sourcePreview?.count || 0) * targets.length

  const handleSubmit = async () => {
    if (sourceInTargets) {
      setError('Una settimana target coincide con la sorgente.')
      return
    }
    setSubmitting(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('copy_shifts_week', {
      p_source_monday: sourceISO,
      p_target_mondays: targets,
      p_conflict_mode: conflictMode,
      p_skip_on_leave: skipOnLeave,
      p_publish_immediately: publishImmediately,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
    } else {
      onDone({
        inserted: data?.inserted_total || 0,
        replaced: data?.replaced_total || 0,
        skipped: data?.skipped_leave_total || 0,
        targets: targets.length,
      })
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden my-8">
        <div className="px-6 py-4 border-b border-cream-200 flex items-center gap-3">
          <Copy size={20} className="text-warm-brown" />
          <div className="flex-1">
            <h2 className="font-serif text-2xl text-warm-dark">Copia turni</h2>
            <p className="font-sans text-xs text-warm-brown">
              Replica i turni di una settimana sorgente in una o più settimane target
            </p>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* SORGENTE */}
          <div>
            <label className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-1.5 block">
              Settimana sorgente
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input type="date" value={sourceISO}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="px-3 py-2 rounded-lg border border-cream-300 font-sans text-sm" />
              <span className="font-sans text-sm text-warm-brown">
                {fmtItRange(parseISO(sourceISO))}
              </span>
            </div>
            <div className="mt-2 bg-cream-50 border border-cream-200 rounded-lg px-3 py-2">
              {loadingPreview ? (
                <span className="font-sans text-sm text-warm-brown flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Caricamento…
                </span>
              ) : sourcePreview && sourcePreview.count > 0 ? (
                <div className="font-sans text-sm text-warm-dark">
                  <strong>{sourcePreview.count}</strong> turni · <strong>{sourcePreview.hours}</strong> ore
                  <span className="text-warm-brown ml-2">
                    ({sourcePreview.draft_count} bozze, {sourcePreview.published_count} pubblicati)
                  </span>
                </div>
              ) : (
                <div className="font-sans text-sm text-amber-700 flex items-center gap-2">
                  <AlertTriangle size={14} /> Nessun turno in questa settimana
                </div>
              )}
            </div>
          </div>

          {/* TARGET */}
          <div>
            <label className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-1.5 block">
              Destinazione
            </label>
            <div className="flex bg-cream-100 rounded-lg p-0.5 mb-3 w-fit">
              {[['single', 'Una settimana'], ['multi', 'Più settimane']].map(([v, lbl]) => (
                <button key={v} type="button" onClick={() => setTargetMode(v)}
                  className={`px-3 py-1.5 rounded-md font-sans text-sm font-semibold transition ${
                    targetMode === v ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown'
                  }`}>
                  {lbl}
                </button>
              ))}
            </div>

            {targetMode === 'single' ? (
              <div className="flex flex-wrap items-center gap-3">
                <input type="date" value={targetSingleISO}
                  onChange={(e) => handleTargetSingleChange(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-cream-300 font-sans text-sm" />
                <span className="font-sans text-sm text-warm-brown">
                  {fmtItRange(parseISO(targetSingleISO))}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-sans text-sm text-warm-brown">A partire da:</span>
                  <input type="date" value={targetMultiStartISO}
                    onChange={(e) => handleTargetMultiStartChange(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-cream-300 font-sans text-sm" />
                  <span className="font-sans text-sm text-warm-brown">per</span>
                  <input type="number" min="1" max="12" value={targetMultiCount}
                    onChange={(e) => setTargetMultiCount(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                    className="px-3 py-2 rounded-lg border border-cream-300 font-sans text-sm w-20" />
                  <span className="font-sans text-sm text-warm-brown">settimane consecutive</span>
                </div>
                <div className="font-sans text-xs text-warm-brown bg-cream-50 rounded-lg px-3 py-2">
                  Verranno popolate {targets.length} settimane: dal {fmtItRange(parseISO(targets[0]))}
                  {' '}al {fmtItRange(parseISO(targets[targets.length - 1]))}
                </div>
              </div>
            )}

            {sourceInTargets && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-sans text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle size={14} /> Una settimana target coincide con la sorgente
              </div>
            )}
          </div>

          {/* CONFLITTI */}
          <div>
            <label className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-2 block">
              Se nelle settimane target ci sono già turni
            </label>
            <div className="space-y-2">
              {[
                { value: 'add', title: 'Aggiungi', sub: 'Mantieni i turni esistenti, aggiungi quelli copiati (può creare conflitti orari)' },
                { value: 'replace_drafts', title: 'Sostituisci solo bozze', sub: 'Cancella le bozze esistenti, mantieni i turni già pubblicati' },
                { value: 'replace_all', title: 'Sostituisci tutto', sub: 'Cancella tutti i turni esistenti (anche pubblicati) e copia da zero' },
              ].map((opt) => (
                <label key={opt.value}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition ${
                    conflictMode === opt.value
                      ? 'border-terracotta-400 bg-terracotta-50'
                      : 'border-cream-200 hover:border-cream-300'
                  }`}>
                  <input type="radio" name="conflictMode" value={opt.value}
                    checked={conflictMode === opt.value}
                    onChange={(e) => setConflictMode(e.target.value)}
                    className="mt-0.5" />
                  <div>
                    <div className="font-sans text-sm font-semibold text-warm-dark">{opt.title}</div>
                    <div className="font-sans text-xs text-warm-brown">{opt.sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* OPZIONI ALTRE */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={skipOnLeave}
                onChange={(e) => setSkipOnLeave(e.target.checked)} />
              <span className="font-sans text-sm text-warm-dark">
                Salta turni a dipendenti in ferie/permessi <strong>approvati</strong> nel target
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={publishImmediately}
                onChange={(e) => setPublishImmediately(e.target.checked)} />
              <span className="font-sans text-sm text-warm-dark">
                Pubblica subito (default: bozze, da pubblicare poi col batch)
              </span>
            </label>
          </div>

          {/* RIEPILOGO */}
          <div className="bg-sage-50 border border-sage-200 rounded-xl px-4 py-3">
            <div className="font-sans text-xs uppercase tracking-wider text-sage-700 mb-1">Riepilogo</div>
            <div className="font-sans text-sm text-warm-dark">
              Verranno creati ~<strong>{expectedShifts}</strong> turni in <strong>{targets.length}</strong>{' '}
              {targets.length === 1 ? 'settimana' : 'settimane'}
              {publishImmediately && ' (pubblicati immediatamente, con notifica)'}
              {!publishImmediately && ' (come bozze, da pubblicare poi)'}.
            </div>
            {publishImmediately && (
              <div className="font-sans text-xs text-amber-700 mt-1 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Attenzione: i dipendenti riceveranno notifiche push.
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-sans text-sm text-red-700">
              Errore: {error}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 border-t border-cream-200 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={submitting}
            className="px-4 py-2 rounded-xl font-sans font-semibold text-warm-brown hover:bg-cream-100 transition">
            Annulla
          </button>
          <button onClick={handleSubmit} disabled={submitting || sourceInTargets || !sourcePreview?.count}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-cream-300 disabled:text-warm-brown text-white font-sans font-semibold transition shadow-sm">
            {submitting ? <><Loader2 size={14} className="animate-spin" /> Copiando…</>
              : <><Copy size={14} /> Copia turni</>}
          </button>
        </div>
      </div>
    </div>
  )
}

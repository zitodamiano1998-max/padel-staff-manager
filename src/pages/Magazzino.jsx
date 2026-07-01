import { useState, useEffect, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Package, Plus, ArrowDownCircle, ArrowUpCircle, ClipboardCheck,
  AlertTriangle, Loader2, X, Boxes, CheckCircle2, History, ScrollText,
} from 'lucide-react'

// Staff id di Damiano Zito: unico autorizzato al magazzino (allineato a is_magazzino_admin nel DB).
const MAGAZZINO_ADMIN_STAFF_ID = '3101cefd-6ea5-4675-875f-655f667e2d91'

export default function Magazzino() {
  const { profile } = useAuth()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Modali: { kind: 'new' | 'movimento' | 'conteggio', prodotto?: row }
  const [modal, setModal] = useState(null)

  useEffect(() => {
    if (profile?.id) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('magazzino_giacenze')
      .select('*')
      .order('nome', { ascending: true })
    if (err) setError('Impossibile caricare le giacenze. Riprova.')
    else setRows(data || [])
    setLoading(false)
  }

  const flashSuccess = (msg) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  const sottoSoglia = useMemo(() => rows.filter((r) => r.sotto_soglia && r.attivo), [rows])

  // Guard: solo Damiano. La RLS blocca comunque i dati, questo è il redirect UX.
  if (profile && profile.id !== MAGAZZINO_ADMIN_STAFF_ID) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl text-warm-dark mb-1 flex items-center gap-2">
            <Boxes size={26} className="text-terracotta-500" />
            Magazzino
          </h1>
          <p className="font-sans text-sm text-warm-brown">
            Consumabili sportivi · giacenze e movimenti
          </p>
        </div>
        <button
          onClick={() => setModal({ kind: 'new' })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-sans font-semibold text-sm bg-terracotta-400 hover:bg-terracotta-500 text-white transition shadow-sm flex-shrink-0">
          <Plus size={16} />
          <span className="hidden sm:inline">Nuovo articolo</span>
        </button>
      </div>

      {/* Banner sotto-soglia */}
      {sottoSoglia.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
            <div className="font-sans text-sm text-amber-800">
              <span className="font-semibold">{sottoSoglia.length}</span>{' '}
              {sottoSoglia.length === 1 ? 'articolo sotto soglia' : 'articoli sotto soglia'} da riordinare
            </div>
          </div>
        </div>
      )}

      {/* Feedback */}
      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 mb-5 flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="font-sans text-sm text-red-800">{error}</div>
        </div>
      )}
      {success && (
        <div className="bg-sage-50 border-2 border-sage-300 rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-sage-500" />
          <div className="font-sans text-sm font-semibold text-sage-700">{success}</div>
        </div>
      )}

      {/* Lista giacenze */}
      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">
          <Loader2 size={20} className="animate-spin inline mr-2" />
          Caricamento...
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-3xl border border-cream-300 shadow-sm p-10 text-center">
          <Package size={32} className="text-warm-brown/40 mx-auto mb-3" />
          <div className="font-serif text-xl text-warm-dark mb-1">Magazzino vuoto</div>
          <p className="font-sans text-sm text-warm-brown mb-4">
            Aggiungi il primo articolo per iniziare a tracciare le giacenze.
          </p>
          <button
            onClick={() => setModal({ kind: 'new' })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-sans font-semibold text-sm bg-terracotta-400 hover:bg-terracotta-500 text-white transition">
            <Plus size={16} /> Nuovo articolo
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <ProdottoCard
              key={r.id}
              row={r}
              onMovimento={() => setModal({ kind: 'movimento', prodotto: r })}
              onConteggio={() => setModal({ kind: 'conteggio', prodotto: r })}
              onStorico={() => setModal({ kind: 'storico', prodotto: r })}
            />
          ))}
        </div>
      )}

      {/* Modali */}
      {modal?.kind === 'new' && (
        <NuovoProdottoModal
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); flashSuccess('Articolo aggiunto'); fetchData() }}
          onError={(m) => setError(m)}
        />
      )}
      {modal?.kind === 'movimento' && (
        <MovimentoModal
          prodotto={modal.prodotto}
          onClose={() => setModal(null)}
          onSaved={(label) => { setModal(null); flashSuccess(label); fetchData() }}
          onError={(m) => setError(m)}
        />
      )}
      {modal?.kind === 'conteggio' && (
        <ConteggioModal
          prodotto={modal.prodotto}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); flashSuccess('Giacenza aggiornata'); fetchData() }}
          onError={(m) => setError(m)}
        />
      )}
      {modal?.kind === 'storico' && (
        <StoricoModal
          prodotto={modal.prodotto}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ---- Card articolo ----

function ProdottoCard({ row, onMovimento, onConteggio, onStorico }) {
  const under = row.sotto_soglia && row.attivo
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 ${
      under ? 'border-amber-300' : 'border-cream-300'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif text-lg text-warm-dark">{row.nome}</span>
            {!row.attivo && (
              <span className="font-sans text-xs px-2 py-0.5 rounded-full bg-cream-200 text-warm-brown">
                disattivato
              </span>
            )}
            {under && (
              <span className="font-sans text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                sotto soglia
              </span>
            )}
          </div>
          {row.categoria && (
            <div className="font-sans text-xs text-warm-brown mt-0.5">{row.categoria}</div>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <div className={`font-serif text-3xl tabular-nums leading-none ${
            under ? 'text-amber-600' : 'text-warm-dark'
          }`}>
            {formatQty(row.giacenza)}
          </div>
          <div className="font-sans text-xs text-warm-brown mt-1">
            {row.unita_misura || 'pz'} · soglia {formatQty(row.soglia_minima)}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={onMovimento}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-sans font-semibold text-sm bg-cream-100 hover:bg-cream-200 text-warm-dark border border-cream-300 transition">
          <ArrowUpCircle size={15} /> Carico / scarico
        </button>
        <button
          onClick={onConteggio}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-sans font-semibold text-sm bg-cream-100 hover:bg-cream-200 text-warm-dark border border-cream-300 transition">
          <ClipboardCheck size={15} /> Conteggio
        </button>
      </div>
      <button
        onClick={onStorico}
        className="w-full flex items-center justify-center gap-1.5 py-2 mt-2 rounded-xl font-sans text-sm text-warm-brown hover:bg-cream-100 transition">
        <History size={14} /> Storico movimenti
      </button>
    </div>
  )
}

// ---- Modale: nuovo prodotto (insert diretto via RLS) ----

function NuovoProdottoModal({ onClose, onSaved, onError }) {
  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState('')
  const [unita, setUnita] = useState('')
  const [soglia, setSoglia] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave = nome.trim().length > 0 && !saving

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('magazzino_prodotti').insert({
      nome: nome.trim(),
      categoria: categoria.trim() || null,
      unita_misura: unita.trim() || null,
      soglia_minima: soglia === '' ? 0 : Number(soglia),
    })
    setSaving(false)
    if (error) { onError('Impossibile salvare l\'articolo. Riprova.'); return }
    onSaved()
  }

  return (
    <ModalShell title="Nuovo articolo" onClose={onClose}>
      <Field label="Nome (obbligatorio)">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
          placeholder="Es. Tubi palle Head Pro"
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria">
          <input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="palle, grip..."
            className={inputClass}
          />
        </Field>
        <Field label="Unità di misura">
          <input
            value={unita}
            onChange={(e) => setUnita(e.target.value)}
            placeholder="tubo, pezzo..."
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Soglia minima (avviso sotto questo valore)">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={soglia}
          onChange={(e) => setSoglia(e.target.value)}
          placeholder="0"
          className={inputClass}
        />
      </Field>

      <ModalActions
        onCancel={onClose}
        onConfirm={save}
        confirmLabel="Aggiungi articolo"
        confirmDisabled={!canSave}
        saving={saving}
      />
    </ModalShell>
  )
}

// ---- Modale: movimento carico/scarico (RPC magazzino_movimento) ----

function MovimentoModal({ prodotto, onClose, onSaved, onError }) {
  const [tipo, setTipo] = useState('carico') // 'carico' | 'scarico'
  const [causale, setCausale] = useState('vendita') // 'vendita' | 'consumo' | 'generico'
  const [quantita, setQuantita] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const qNum = Number(quantita)
  const canSave = quantita !== '' && qNum > 0 && !saving

  const save = async () => {
    setSaving(true)
    // 'generico' = scarico senza causale specifica (p_causale null)
    const p_causale = tipo === 'scarico' && causale !== 'generico' ? causale : null
    const { error } = await supabase.rpc('magazzino_movimento', {
      p_prodotto: prodotto.id,
      p_tipo: tipo,
      p_quantita: qNum,
      p_note: note.trim() || null,
      p_causale,
    })
    setSaving(false)
    if (error) { onError('Movimento non registrato. Riprova.'); return }
    let label = 'Carico registrato'
    if (tipo === 'scarico') {
      label = causale === 'vendita' ? 'Vendita registrata'
        : causale === 'consumo' ? 'Consumo registrato'
        : 'Scarico registrato'
    }
    onSaved(label)
  }

  return (
    <ModalShell title={prodotto.nome} subtitle="Registra carico o scarico" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setTipo('carico')}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl font-sans font-semibold text-sm border transition ${
            tipo === 'carico'
              ? 'bg-sage-50 border-sage-300 text-sage-700'
              : 'bg-cream-50 border-cream-300 text-warm-brown hover:bg-cream-100'
          }`}>
          <ArrowUpCircle size={16} /> Carico
        </button>
        <button
          onClick={() => setTipo('scarico')}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl font-sans font-semibold text-sm border transition ${
            tipo === 'scarico'
              ? 'bg-red-50 border-red-300 text-red-700'
              : 'bg-cream-50 border-cream-300 text-warm-brown hover:bg-cream-100'
          }`}>
          <ArrowDownCircle size={16} /> Scarico
        </button>
      </div>

      {/* Causale scarico: distingue vendita da consumo per il calcolo ammanco */}
      {tipo === 'scarico' && (
        <div className="mb-4">
          <label className="block font-sans text-xs font-semibold text-warm-brown uppercase tracking-wider mb-1.5">
            Causale scarico
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'vendita', label: 'Vendita' },
              { key: 'consumo', label: 'Consumo' },
              { key: 'generico', label: 'Altro' },
            ].map((c) => (
              <button
                key={c.key}
                onClick={() => setCausale(c.key)}
                className={`py-2 rounded-lg font-sans text-sm border transition ${
                  causale === c.key
                    ? 'bg-terracotta-50 border-terracotta-300 text-terracotta-700 font-semibold'
                    : 'bg-cream-50 border-cream-300 text-warm-brown hover:bg-cream-100'
                }`}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="font-sans text-xs text-warm-brown/70 mt-1.5">
            {causale === 'vendita'
              ? 'Uscita venduta al desk, tracciata per la riconciliazione.'
              : causale === 'consumo'
              ? 'Uscita per uso interno (torneo, prova, omaggio).'
              : 'Altra uscita senza causale specifica.'}
          </p>
        </div>
      )}

      <div className="bg-cream-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <span className="font-sans text-sm text-warm-brown">Giacenza attuale</span>
        <span className="font-serif text-xl text-warm-dark tabular-nums">
          {formatQty(prodotto.giacenza)} {prodotto.unita_misura || 'pz'}
        </span>
      </div>

      <Field label={`Quantità da ${tipo === 'carico' ? 'aggiungere' : 'togliere'}`}>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={quantita}
          onChange={(e) => setQuantita(e.target.value)}
          autoFocus
          placeholder="0"
          className={inputClass}
        />
      </Field>
      <Field label="Note (facoltativo)">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Es. consegna fornitore, uso torneo..."
          className={inputClass}
        />
      </Field>

      <ModalActions
        onCancel={onClose}
        onConfirm={save}
        confirmLabel={
          tipo === 'carico' ? 'Registra carico'
            : causale === 'vendita' ? 'Registra vendita'
            : causale === 'consumo' ? 'Registra consumo'
            : 'Registra scarico'
        }
        confirmDisabled={!canSave}
        saving={saving}
      />
    </ModalShell>
  )
}

// ---- Modale: conteggio settimanale (RPC magazzino_conteggio) ----

function ConteggioModal({ prodotto, onClose, onSaved, onError }) {
  const [reale, setReale] = useState('')
  const [saving, setSaving] = useState(false)
  const [dett, setDett] = useState(null)
  const [loadingDett, setLoadingDett] = useState(true)

  const unita = prodotto.unita_misura || 'pz'

  // Carico il dettaglio dal DB: teorico fresco + vendite/consumi dall'ultimo conteggio.
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase.rpc('magazzino_dettaglio_conteggio', {
        p_prodotto: prodotto.id,
      })
      if (!active) return
      if (!error && data) setDett(data)
      setLoadingDett(false)
    })()
    return () => { active = false }
  }, [prodotto.id])

  // Teorico dal DB se disponibile, altrimenti fallback alla giacenza già in lista.
  const teorico = dett ? Number(dett.giacenza_teorica) : Number(prodotto.giacenza)
  const rNum = Number(reale)
  const canSave = reale !== '' && rNum >= 0 && !saving && !loadingDett
  const ammanco = reale === '' ? null : teorico - rNum // >0 = manca roba non spiegata

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.rpc('magazzino_conteggio', {
      p_prodotto: prodotto.id,
      p_quantita_reale: rNum,
      p_note: 'Conteggio settimanale',
    })
    setSaving(false)
    if (error) { onError('Conteggio non salvato. Riprova.'); return }
    onSaved()
  }

  return (
    <ModalShell title={prodotto.nome} subtitle="Conteggio: allinea la giacenza al reale" onClose={onClose}>
      {loadingDett ? (
        <div className="text-center py-6 text-warm-brown font-sans">
          <Loader2 size={18} className="animate-spin inline mr-2" /> Caricamento dati...
        </div>
      ) : (
        <>
          {/* Riepilogo periodo: contesto, non termini da sottrarre */}
          <div className="bg-cream-50 rounded-xl px-4 py-3 mb-4 space-y-1.5">
            <Riga label="Giacenza teorica" value={`${formatQty(teorico)} ${unita}`} strong />
            {dett && Number(dett.venduti_periodo) > 0 && (
              <Riga label="Venduti dall'ultimo conteggio" value={`${formatQty(dett.venduti_periodo)} ${unita}`} muted />
            )}
            {dett && Number(dett.consumati_periodo) > 0 && (
              <Riga label="Consumi interni nel periodo" value={`${formatQty(dett.consumati_periodo)} ${unita}`} muted />
            )}
            {dett && Number(dett.scarichi_generici) > 0 && (
              <Riga label="Altri scarichi nel periodo" value={`${formatQty(dett.scarichi_generici)} ${unita}`} muted />
            )}
          </div>

          <Field label="Quantità reale contata">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={reale}
              onChange={(e) => setReale(e.target.value)}
              autoFocus
              placeholder="0"
              className={inputClass}
            />
          </Field>

          {/* Ammanco in evidenza: il punto del sistema */}
          {ammanco !== null && (
            <div className={`rounded-xl px-4 py-3 mb-2 border ${
              ammanco > 0
                ? 'bg-red-50 border-red-200'
                : ammanco < 0
                ? 'bg-amber-50 border-amber-200'
                : 'bg-sage-50 border-sage-200'
            }`}>
              {ammanco > 0 ? (
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-sans text-sm font-semibold text-red-800">
                      Ammanco: {formatQty(ammanco)} {unita}
                    </div>
                    <div className="font-sans text-xs text-red-700/80 mt-0.5">
                      Uscito ma non registrato come vendita o consumo. Verifica di aver segnato tutte le vendite.
                    </div>
                  </div>
                </div>
              ) : ammanco < 0 ? (
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-sans text-sm font-semibold text-amber-800">
                      Eccedenza: {formatQty(-ammanco)} {unita}
                    </div>
                    <div className="font-sans text-xs text-amber-700/80 mt-0.5">
                      Contati più pezzi del teorico. Forse un carico non registrato.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-sage-500" />
                  <div className="font-sans text-sm font-semibold text-sage-700">
                    Tutto quadra: nessun ammanco.
                  </div>
                </div>
              )}
            </div>
          )}

          <ModalActions
            onCancel={onClose}
            onConfirm={save}
            confirmLabel="Conferma conteggio"
            confirmDisabled={!canSave}
            saving={saving}
          />
        </>
      )}
    </ModalShell>
  )
}

function Riga({ label, value, strong, muted }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`font-sans text-sm ${muted ? 'text-warm-brown/70' : 'text-warm-brown'}`}>
        {label}
      </span>
      <span className={`tabular-nums ${
        strong ? 'font-serif text-lg text-warm-dark' : 'font-sans text-sm text-warm-dark'
      }`}>
        {value}
      </span>
    </div>
  )
}

// ---- Modale: storico movimenti (legge magazzino_movimenti) ----

function StoricoModal({ prodotto, onClose }) {
  const [movimenti, setMovimenti] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error: err } = await supabase
        .from('magazzino_movimenti')
        .select('*')
        .eq('prodotto_id', prodotto.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!active) return
      if (err) setError(true)
      else setMovimenti(data || [])
      setLoading(false)
    })()
    return () => { active = false }
  }, [prodotto.id])

  const unita = prodotto.unita_misura || 'pz'

  return (
    <ModalShell title={prodotto.nome} subtitle="Storico movimenti" onClose={onClose}>
      {loading ? (
        <div className="text-center py-8 text-warm-brown font-sans">
          <Loader2 size={18} className="animate-spin inline mr-2" /> Caricamento...
        </div>
      ) : error ? (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="font-sans text-sm text-red-800">Impossibile caricare lo storico. Riprova.</div>
        </div>
      ) : movimenti.length === 0 ? (
        <div className="text-center py-8">
          <ScrollText size={26} className="text-warm-brown/40 mx-auto mb-2" />
          <div className="font-sans text-sm text-warm-brown">Nessun movimento registrato.</div>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {movimenti.map((m) => (
            <MovimentoRow key={m.id} mov={m} unita={unita} />
          ))}
        </div>
      )}
    </ModalShell>
  )
}

function MovimentoRow({ mov, unita }) {
  // Per gli scarichi, la causale raffina l'etichetta (vendita/consumo).
  const cfg = movConfig(mov)
  const q = Number(mov.quantita)
  const segno = q > 0 ? '+' : '' // scarichi hanno già il segno meno
  return (
    <div className="flex items-start gap-3 py-2 border-b border-cream-200 last:border-b-0">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
        <cfg.Icon size={14} className={cfg.fg} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-sans text-sm font-semibold text-warm-dark">{cfg.label}</span>
          <span className={`font-sans text-sm font-semibold tabular-nums ${cfg.fg}`}>
            {segno}{formatQty(q)} {unita}
          </span>
        </div>
        <div className="font-sans text-xs text-warm-brown mt-0.5">
          {formatDateTime(mov.created_at)}
          {mov.note && <> · {mov.note}</>}
        </div>
      </div>
    </div>
  )
}

function movConfig(mov) {
  if (mov.tipo === 'scarico') {
    if (mov.causale === 'vendita') return { label: 'Vendita', Icon: ArrowDownCircle, bg: 'bg-terracotta-50', fg: 'text-terracotta-600' }
    if (mov.causale === 'consumo') return { label: 'Consumo', Icon: ArrowDownCircle, bg: 'bg-amber-100', fg: 'text-amber-700' }
    return MOV_CONFIG.scarico
  }
  return MOV_CONFIG[mov.tipo] || MOV_CONFIG.rettifica
}

// ---- Shell / helper UI ----

const inputClass =
  'w-full rounded-xl border border-cream-300 px-3 py-2 font-sans text-sm text-warm-dark focus:outline-none focus:ring-2 focus:ring-terracotta-300'

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block font-sans text-xs font-semibold text-warm-brown uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-3xl border border-cream-300 shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-serif text-xl text-warm-dark">{title}</h3>
            {subtitle && <p className="font-sans text-sm text-warm-brown mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-cream-200 text-warm-brown transition flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ onCancel, onConfirm, confirmLabel, confirmDisabled, saving }) {
  return (
    <div className="flex gap-3 mt-5">
      <button
        onClick={onCancel}
        className="flex-1 py-3 rounded-2xl font-sans font-semibold text-sm bg-cream-100 hover:bg-cream-200 text-warm-dark border border-cream-300 transition">
        Annulla
      </button>
      <button
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-sans font-semibold text-sm bg-terracotta-400 hover:bg-terracotta-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed">
        {saving && <Loader2 size={16} className="animate-spin" />}
        {confirmLabel}
      </button>
    </div>
  )
}

// ---- Helpers ----

const MOV_CONFIG = {
  carico:    { label: 'Carico',    Icon: ArrowUpCircle,   bg: 'bg-sage-100', fg: 'text-sage-700' },
  scarico:   { label: 'Scarico',   Icon: ArrowDownCircle, bg: 'bg-red-100',  fg: 'text-red-700' },
  rettifica: { label: 'Conteggio', Icon: ClipboardCheck,  bg: 'bg-cream-200', fg: 'text-warm-brown' },
}

function formatDateTime(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
    + ' · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function formatQty(n) {
  const num = Number(n)
  if (Number.isInteger(num)) return String(num)
  return num.toFixed(2).replace(/\.?0+$/, '')
}

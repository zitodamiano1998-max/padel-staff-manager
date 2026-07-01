import { useState, useEffect, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Package, Plus, ArrowDownCircle, ArrowUpCircle, ClipboardCheck,
  AlertTriangle, Loader2, X, Boxes, CheckCircle2,
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
    </div>
  )
}

// ---- Card articolo ----

function ProdottoCard({ row, onMovimento, onConteggio }) {
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
  const [quantita, setQuantita] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const qNum = Number(quantita)
  const canSave = quantita !== '' && qNum > 0 && !saving

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.rpc('magazzino_movimento', {
      p_prodotto: prodotto.id,
      p_tipo: tipo,
      p_quantita: qNum,
      p_note: note.trim() || null,
    })
    setSaving(false)
    if (error) { onError('Movimento non registrato. Riprova.'); return }
    onSaved(tipo === 'carico' ? 'Carico registrato' : 'Scarico registrato')
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
        confirmLabel={tipo === 'carico' ? 'Registra carico' : 'Registra scarico'}
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

  const rNum = Number(reale)
  const canSave = reale !== '' && rNum >= 0 && !saving
  const delta = reale === '' ? null : rNum - Number(prodotto.giacenza)

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
      <div className="bg-cream-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <span className="font-sans text-sm text-warm-brown">Giacenza calcolata</span>
        <span className="font-serif text-xl text-warm-dark tabular-nums">
          {formatQty(prodotto.giacenza)} {prodotto.unita_misura || 'pz'}
        </span>
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

      {delta !== null && delta !== 0 && (
        <div className="font-sans text-sm text-warm-brown mb-2">
          Rettifica: <span className={`font-semibold ${delta > 0 ? 'text-sage-700' : 'text-red-700'}`}>
            {delta > 0 ? '+' : ''}{formatQty(delta)} {prodotto.unita_misura || 'pz'}
          </span>
        </div>
      )}

      <ModalActions
        onCancel={onClose}
        onConfirm={save}
        confirmLabel="Aggiorna giacenza"
        confirmDisabled={!canSave}
        saving={saving}
      />
    </ModalShell>
  )
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

function formatQty(n) {
  const num = Number(n)
  if (Number.isInteger(num)) return String(num)
  return num.toFixed(2).replace(/\.?0+$/, '')
}

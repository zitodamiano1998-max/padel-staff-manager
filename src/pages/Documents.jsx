import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Upload, Download, Trash2, FileText, Receipt, HeartPulse, FileSignature,
  CreditCard, X, Filter, FolderOpen, AlertCircle, Eye, ChevronDown,
  Users as UsersIcon, FileIcon, Calendar as CalendarIcon, Loader2,
} from 'lucide-react'

const ICON_MAP = {
  Receipt, FileText, HeartPulse, FileSignature, CreditCard, FileIcon,
}

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024 // 10MB

export default function Documents() {
  const { profile } = useAuth()
  const isManager = profile?.is_manager
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState([])
  const [types, setTypes] = useState([])
  const [staff, setStaff] = useState([])

  // Filtri
  const [filterStaffId, setFilterStaffId] = useState('all') // solo manager
  const [filterTypeId, setFilterTypeId] = useState('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())

  // UI
  const [uploadOpen, setUploadOpen] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, kind = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const fetchData = async () => {
    setLoading(true)
    // Tipologie
    const { data: typesData } = await supabase
      .from('document_types')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
    setTypes(typesData || [])

    // Documenti (RLS si occupa di filtrare)
    const { data: docsData, error } = await supabase
      .from('documents')
      .select(`
        id, period_year, period_month, document_date,
        storage_path, filename, mime_type, size_bytes, notes, created_at,
        document_type:document_types(id, code, name, direction, period_type, icon, color),
        staff:staff_members!documents_staff_id_fkey(id, first_name, last_name),
        uploader:staff_members!documents_uploaded_by_fkey(id, first_name, last_name)
      `)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) showToast('Errore: ' + error.message, 'error')
    else setDocs(docsData || [])

    // Staff (solo manager per il filtro)
    if (isManager) {
      const { data: staffData } = await supabase
        .from('staff_members')
        .select('id, first_name, last_name')
        .eq('is_active', true)
        .order('first_name')
      setStaff(staffData || [])
    }

    setLoading(false)
  }

  // Filtri lato client
  const filteredDocs = useMemo(() => {
    return docs.filter((d) => {
      if (filterStaffId !== 'all' && d.staff?.id !== filterStaffId) return false
      if (filterTypeId !== 'all' && d.document_type?.id !== filterTypeId) return false
      if (filterYear !== 'all' && d.period_year !== filterYear) return false
      return true
    })
  }, [docs, filterStaffId, filterTypeId, filterYear])

  // Anni disponibili
  const availableYears = useMemo(() => {
    const set = new Set(docs.map((d) => d.period_year))
    const arr = Array.from(set).sort((a, b) => b - a)
    if (!arr.includes(new Date().getFullYear())) arr.unshift(new Date().getFullYear())
    return arr
  }, [docs])

  // Raggruppo per anno → mese (o anno solo, per docs annuali)
  const groupedDocs = useMemo(() => {
    const groups = {}
    for (const d of filteredDocs) {
      const year = d.period_year
      const month = d.period_month
      const periodType = d.document_type?.period_type
      let key
      if (periodType === 'monthly' && month) {
        key = `${year}-${String(month).padStart(2, '0')}`
      } else if (periodType === 'yearly') {
        key = `${year}-yr`
      } else {
        key = `${year}-other`
      }
      if (!groups[key]) groups[key] = { year, month, periodType, docs: [] }
      groups[key].docs.push(d)
    }
    // Ordino per anno desc, mese desc
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, g]) => ({ key, ...g }))
  }, [filteredDocs])

  // Download
  const handleDownload = async (doc) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 60) // 60 secondi
    if (error) {
      showToast('Errore: ' + error.message, 'error')
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  const handleDelete = async (doc) => {
    if (!confirm(`Eliminare "${doc.filename}"? Operazione irreversibile.`)) return
    // Cancellando dal DB, il trigger cancella anche da Storage
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    if (error) showToast('Errore: ' + error.message, 'error')
    else { showToast('Documento eliminato'); fetchData() }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl text-warm-dark mb-1">Documenti</h1>
          <p className="font-sans text-sm text-warm-brown">
            {isManager
              ? 'Carica CUD, contratti per i dipendenti e visualizza i fogli compensi che ti hanno mandato.'
              : 'Carica i tuoi fogli compensi e scarica CUD e contratti.'}
          </p>
        </div>
        <button onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 bg-terracotta-400 hover:bg-terracotta-500 text-white font-sans font-semibold px-4 py-2 rounded-xl transition shadow-sm flex-shrink-0">
          <Upload size={16} /> Carica documento
        </button>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {isManager && (
          <FilterSelect
            label="Dipendente"
            value={filterStaffId}
            onChange={setFilterStaffId}
            options={[
              { value: 'all', label: 'Tutti' },
              ...staff.map((s) => ({ value: s.id, label: `${s.first_name} ${s.last_name}` })),
            ]} />
        )}
        <FilterSelect
          label="Tipologia"
          value={filterTypeId}
          onChange={setFilterTypeId}
          options={[
            { value: 'all', label: 'Tutte' },
            ...types.map((t) => ({ value: t.id, label: t.name })),
          ]} />
        <FilterSelect
          label="Anno"
          value={filterYear}
          onChange={(v) => setFilterYear(v === 'all' ? 'all' : Number(v))}
          options={[
            { value: 'all', label: 'Tutti gli anni' },
            ...availableYears.map((y) => ({ value: y, label: y.toString() })),
          ]} />
      </div>

      {/* Lista raggruppata */}
      {loading ? (
        <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
      ) : groupedDocs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-cream-300 p-12 text-center">
          <FolderOpen size={32} className="mx-auto mb-3 text-warm-brown/40" />
          <p className="font-sans text-warm-brown text-sm">
            Nessun documento trovato.
            {!isManager && ' Click su "Carica documento" per caricare il primo.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedDocs.map((group) => (
            <DocumentGroup
              key={group.key}
              group={group}
              isManager={isManager}
              onDownload={handleDownload}
              onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Modal upload */}
      {uploadOpen && (
        <UploadModal
          types={types}
          staff={staff}
          isManager={isManager}
          currentStaffId={profile?.id}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { setUploadOpen(false); fetchData(); showToast('Documento caricato!') }}
          onError={(msg) => showToast(msg, 'error')} />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg font-sans text-sm z-50 ${
          toast.kind === 'error' ? 'bg-terracotta-600 text-white' : 'bg-sage-500 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// FILTER SELECT
// ============================================================================
function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-sans text-xs uppercase tracking-wider text-warm-brown">{label}:</span>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="appearance-none pl-3 pr-9 py-1.5 rounded-lg border border-cream-300 bg-white font-sans text-sm font-semibold text-warm-dark focus:outline-none focus:border-terracotta-400 cursor-pointer">
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-brown pointer-events-none" />
      </div>
    </div>
  )
}

// ============================================================================
// DOCUMENT GROUP (header + lista documenti)
// ============================================================================
function DocumentGroup({ group, isManager, onDownload, onDelete }) {
  let title
  if (group.periodType === 'monthly' && group.month) {
    title = `${MONTHS[group.month - 1]} ${group.year}`
  } else if (group.periodType === 'yearly') {
    title = `Anno ${group.year}`
  } else {
    title = `${group.year}`
  }

  return (
    <div>
      <h3 className="font-serif text-xl text-warm-dark mb-2">{title}</h3>
      <div className="space-y-2">
        {group.docs.map((doc) => (
          <DocumentRow
            key={doc.id}
            doc={doc}
            isManager={isManager}
            onDownload={onDownload}
            onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// DOCUMENT ROW
// ============================================================================
function DocumentRow({ doc, isManager, onDownload, onDelete }) {
  const dt = doc.document_type
  const Icon = ICON_MAP[dt?.icon] || FileIcon
  const sizeKB = doc.size_bytes ? Math.round(doc.size_bytes / 1024) : null

  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-4 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
        style={{ backgroundColor: dt?.color || '#C97D60' }}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-sans font-semibold text-warm-dark truncate">{dt?.name || 'Documento'}</div>
        <div className="font-sans text-xs text-warm-brown truncate">
          {doc.filename}
          {sizeKB !== null && <> · {sizeKB} KB</>}
        </div>
        {isManager && doc.staff && (
          <div className="font-sans text-xs text-warm-brown mt-0.5">
            <UsersIcon size={11} className="inline -mt-0.5 mr-1" />
            {doc.staff.first_name} {doc.staff.last_name}
            {doc.uploader && doc.uploader.id !== doc.staff.id && (
              <> · caricato da {doc.uploader.first_name}</>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onDownload(doc)}
          title="Scarica / apri"
          className="p-2 rounded-lg text-warm-brown hover:text-warm-dark hover:bg-cream-100 transition">
          <Download size={16} />
        </button>
        <button onClick={() => onDelete(doc)}
          title="Elimina"
          className="p-2 rounded-lg text-warm-brown hover:text-red-600 hover:bg-red-50 transition">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// UPLOAD MODAL
// ============================================================================
function UploadModal({ types, staff, isManager, currentStaffId, onClose, onUploaded, onError }) {
  const [submitting, setSubmitting] = useState(false)
  const [typeId, setTypeId] = useState('')
  const [staffId, setStaffId] = useState(isManager ? '' : currentStaffId)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [docDate, setDocDate] = useState(new Date().toISOString().substring(0, 10))
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)

  // Tipologie ammesse: dipendente vede solo employee_to_manager
  const visibleTypes = isManager
    ? types
    : types.filter((t) => t.direction === 'employee_to_manager')

  const selectedType = types.find((t) => t.id === typeId)

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!ALLOWED_MIME.includes(f.type)) {
      onError?.('Tipo di file non supportato. Usa PDF, JPG, PNG, HEIC o WebP.')
      return
    }
    if (f.size > MAX_BYTES) {
      onError?.('File troppo grande. Massimo 10 MB.')
      return
    }
    setFile(f)
  }

  const handleSubmit = async () => {
    if (!typeId) { onError?.('Seleziona la tipologia'); return }
    if (!staffId) { onError?.('Seleziona il dipendente'); return }
    if (!file) { onError?.('Seleziona un file'); return }
    if (!selectedType) { onError?.('Tipologia non valida'); return }

    setSubmitting(true)
    try {
      // Upload su Storage
      const docId = crypto.randomUUID()
      // Sanifico filename: tolgo caratteri pericolosi/spazi anomali
      const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
      const storagePath = `${staffId}/${docId}/${safeFilename}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        })
      if (uploadError) throw uploadError

      // Inserisci record nel DB
      const payload = {
        id: docId,
        document_type_id: typeId,
        uploaded_by: currentStaffId,
        staff_id: staffId,
        period_year: Number(year),
        period_month: selectedType.period_type === 'monthly' ? Number(month) : null,
        document_date: selectedType.period_type === 'date' ? docDate : null,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        notes: notes || null,
      }
      const { error: insertError } = await supabase.from('documents').insert(payload)
      if (insertError) {
        // Rollback: cancello il file caricato
        await supabase.storage.from('documents').remove([storagePath])
        throw insertError
      }

      onUploaded?.()
    } catch (err) {
      onError?.('Errore: ' + (err.message || 'imprevisto'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <div>
            <h2 className="font-serif text-2xl text-warm-dark">Carica documento</h2>
            <p className="font-sans text-xs text-warm-brown">PDF, JPG, PNG · max 10 MB</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-cream-100 rounded-lg">
            <X size={20} className="text-warm-brown" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Tipologia */}
          <div>
            <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
              1. Tipologia
            </label>
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400">
              <option value="">Seleziona...</option>
              {visibleTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.direction === 'manager_to_employee' ? ' (per dipendente)' : ''}
                </option>
              ))}
            </select>
            {selectedType?.description && (
              <p className="font-sans text-xs text-warm-brown mt-1.5 italic">
                {selectedType.description}
              </p>
            )}
          </div>

          {/* Dipendente target — solo se manager */}
          {isManager && selectedType && (
            <div>
              <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
                2. {selectedType.direction === 'manager_to_employee' ? 'Per chi è il documento' : 'A chi appartiene'}
              </label>
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400">
                <option value="">Seleziona dipendente...</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Periodo */}
          {selectedType && (
            <div>
              <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
                {isManager ? '3.' : '2.'} Periodo
              </label>
              {selectedType.period_type === 'monthly' && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
                    className="px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400">
                    {MONTHS.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
                    className="px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400" />
                </div>
              )}
              {selectedType.period_type === 'yearly' && (
                <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
                  placeholder="es. 2025"
                  className="w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400" />
              )}
              {selectedType.period_type === 'date' && (
                <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400" />
              )}
            </div>
          )}

          {/* File */}
          {selectedType && (
            <div>
              <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
                {isManager ? '4.' : '3.'} File
              </label>
              <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-cream-300 hover:border-terracotta-400 cursor-pointer transition">
                <Upload size={16} className="text-warm-brown" />
                <span className="font-sans text-sm text-warm-brown">
                  {file ? file.name : 'Seleziona file dal dispositivo'}
                </span>
                <input type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
                  onChange={handleFileChange}
                  className="hidden" />
              </label>
              {file && (
                <p className="font-sans text-xs text-warm-brown mt-1.5">
                  {Math.round(file.size / 1024)} KB · {file.type}
                </p>
              )}
            </div>
          )}

          {/* Note */}
          {selectedType && (
            <div>
              <label className="block font-sans text-sm font-semibold text-warm-dark mb-1.5">
                {isManager ? '5.' : '4.'} Note <span className="font-normal text-warm-brown">(opzionale)</span>
              </label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={2} placeholder="es. firmato il giorno X..."
                className="w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white font-sans text-sm text-warm-dark focus:outline-none focus:border-terracotta-400 resize-none" />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-cream-200 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl font-sans font-semibold text-warm-brown hover:bg-cream-100 transition">
            Annulla
          </button>
          <button onClick={handleSubmit}
            disabled={submitting || !typeId || !staffId || !file}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-terracotta-400 hover:bg-terracotta-500 disabled:bg-terracotta-200 text-white font-sans font-semibold transition shadow-sm">
            {submitting ? <><Loader2 size={14} className="animate-spin" /> Caricamento…</> : <><Upload size={14} /> Carica</>}
          </button>
        </div>
      </div>
    </div>
  )
}

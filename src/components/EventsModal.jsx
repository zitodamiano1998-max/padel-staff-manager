import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { X, Plus, Calendar, Trash2, Edit3, Loader2, AlertTriangle } from 'lucide-react'

const COLOR_PALETTE = [
  { value: '#C97D60', label: 'Terracotta' },
  { value: '#5C8D7E', label: 'Salvia' },
  { value: '#D4A574', label: 'Sabbia' },
  { value: '#A86B5C', label: 'Mattone' },
  { value: '#7B6F60', label: 'Caffè' },
  { value: '#8B7355', label: 'Cuoio' },
  { value: '#6B7B8C', label: 'Notte' },
  { value: '#9C5C5C', label: 'Vino' },
]

function fmtItDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function EventsModal({ onClose, onUpdate }) {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)  // null o {id?, name, start_date, end_date, color, notes}
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchEvents = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('start_date', { ascending: false })
    setLoading(false)
    if (error) setError(error.message)
    else setEvents(data || [])
  }

  useEffect(() => { fetchEvents() }, [])

  const handleNew = () => {
    const today = new Date().toISOString().substring(0, 10)
    setEditing({
      name: '',
      start_date: today,
      end_date: today,
      color: COLOR_PALETTE[0].value,
      notes: '',
    })
  }

  const handleSave = async () => {
    if (!editing.name?.trim() || !editing.start_date || !editing.end_date) {
      setError('Nome, data inizio e data fine sono obbligatori')
      return
    }
    if (editing.end_date < editing.start_date) {
      setError('La data fine non può essere precedente alla data inizio')
      return
    }
    setError(null)
    const payload = {
      name: editing.name.trim(),
      start_date: editing.start_date,
      end_date: editing.end_date,
      color: editing.color,
      notes: editing.notes?.trim() || null,
    }
    let result
    if (editing.id) {
      result = await supabase.from('events').update(payload).eq('id', editing.id)
    } else {
      payload.created_by = profile?.id
      result = await supabase.from('events').insert(payload)
    }
    if (result.error) setError(result.error.message)
    else {
      setEditing(null)
      await fetchEvents()
      onUpdate?.()
    }
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) {
      setError(error.message)
    } else {
      setDeleteConfirm(null)
      await fetchEvents()
      onUpdate?.()
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}>

        <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-warm-dark">Eventi e tornei</h2>
            <p className="font-sans text-xs text-warm-brown mt-0.5">
              Visualizza eventi nel planning per dare contesto ai turni
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-sans text-sm text-red-700 mb-3">
              {error}
            </div>
          )}

          {/* Form crea/modifica */}
          {editing && (
            <div className="bg-cream-50 border border-cream-300 rounded-xl p-4 mb-4 space-y-3">
              <div className="font-sans text-xs uppercase tracking-wider text-warm-brown font-semibold">
                {editing.id ? 'Modifica evento' : 'Nuovo evento'}
              </div>

              <div>
                <label className="font-sans text-xs text-warm-brown mb-1 block">Nome</label>
                <input type="text" value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="es. Summer Cup 2026 - Settimana 3"
                  className="w-full px-3 py-2 rounded-lg border border-cream-300 font-sans text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-sans text-xs text-warm-brown mb-1 block">Data inizio</label>
                  <input type="date" value={editing.start_date}
                    onChange={(e) => setEditing({ ...editing, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-cream-300 font-sans text-sm" />
                </div>
                <div>
                  <label className="font-sans text-xs text-warm-brown mb-1 block">Data fine</label>
                  <input type="date" value={editing.end_date}
                    onChange={(e) => setEditing({ ...editing, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-cream-300 font-sans text-sm" />
                </div>
              </div>

              <div>
                <label className="font-sans text-xs text-warm-brown mb-1 block">Colore</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PALETTE.map((c) => (
                    <button key={c.value} type="button"
                      onClick={() => setEditing({ ...editing, color: c.value })}
                      title={c.label}
                      className={`w-9 h-9 rounded-lg border-2 transition ${
                        editing.color === c.value ? 'border-warm-dark scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="font-sans text-xs text-warm-brown mb-1 block">Note (opzionale)</label>
                <textarea value={editing.notes || ''}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="es. Finali Golden League, sponsor Banca Cambiano..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-cream-300 font-sans text-sm resize-none" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg font-sans text-sm font-semibold text-warm-brown hover:bg-cream-100">
                  Annulla
                </button>
                <button onClick={handleSave}
                  className="px-4 py-2 rounded-lg font-sans text-sm font-semibold bg-terracotta-400 hover:bg-terracotta-500 text-white">
                  {editing.id ? 'Salva' : 'Crea evento'}
                </button>
              </div>
            </div>
          )}

          {/* Bottone "Nuovo evento" */}
          {!editing && (
            <button onClick={handleNew}
              className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-cream-300 hover:border-terracotta-400 hover:bg-terracotta-50 transition font-sans text-sm font-semibold text-warm-brown hover:text-terracotta-700">
              <Plus size={16} /> Nuovo evento
            </button>
          )}

          {/* Lista eventi */}
          {loading ? (
            <div className="text-center py-8 text-warm-brown font-sans text-sm flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Caricamento…
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-warm-brown font-sans text-sm">
              Nessun evento creato. Crea il primo con il bottone sopra.
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <div key={ev.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-cream-200 hover:border-cream-300 transition">
                  <div className="w-3 h-12 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ev.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-sans text-sm font-semibold text-warm-dark truncate">
                      {ev.name}
                    </div>
                    <div className="font-sans text-xs text-warm-brown">
                      {fmtItDate(ev.start_date)} → {fmtItDate(ev.end_date)}
                    </div>
                    {ev.notes && (
                      <div className="font-sans text-xs text-warm-brown italic mt-0.5 truncate">
                        {ev.notes}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setEditing(ev)}
                    className="p-2 rounded-lg hover:bg-cream-100 text-warm-brown"
                    title="Modifica">
                    <Edit3 size={16} />
                  </button>
                  <button onClick={() => setDeleteConfirm(ev)}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-600"
                    title="Elimina">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Conferma eliminazione */}
          {deleteConfirm && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
              onClick={() => setDeleteConfirm(null)}>
              <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-3">
                  <AlertTriangle size={20} className="text-red-600 flex-shrink-0" />
                  <h3 className="font-serif text-lg text-warm-dark">Eliminare evento?</h3>
                </div>
                <p className="font-sans text-sm text-warm-brown mb-4">
                  L'evento <strong>"{deleteConfirm.name}"</strong> verrà eliminato definitivamente.
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDeleteConfirm(null)}
                    className="px-4 py-2 rounded-lg font-sans text-sm font-semibold text-warm-brown hover:bg-cream-100">
                    Annulla
                  </button>
                  <button onClick={() => handleDelete(deleteConfirm.id)}
                    className="px-4 py-2 rounded-lg font-sans text-sm font-semibold bg-red-600 hover:bg-red-700 text-white">
                    Elimina
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

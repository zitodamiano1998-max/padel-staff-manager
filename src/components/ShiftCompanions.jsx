import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Users, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'

// Helpers tempo
function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}
function initials(name) {
  return name.split(' ').slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('')
}

export default function ShiftCompanions({ shiftId, compact = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!shiftId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    console.log('[ShiftCompanions] fetching companions for shift:', shiftId)
    supabase.rpc('get_shift_companions', { p_shift_id: shiftId })
      .then(({ data, error }) => {
        if (cancelled) return
        console.log('[ShiftCompanions] response:', { data, error })
        if (error) setError(error.message)
        else setData(data)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [shiftId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-warm-brown font-sans text-sm">
        <Loader2 size={14} className="animate-spin" /> Caricamento squadra…
      </div>
    )
  }
  if (error) {
    return <div className="text-red-700 font-sans text-sm py-2">Errore: {error}</div>
  }
  if (!data) return null

  const overlap = data.overlap || []
  const before = data.before || []
  const after = data.after || []
  const hasNothing = overlap.length === 0 && before.length === 0 && after.length === 0

  if (hasNothing) {
    return (
      <div className="bg-cream-50 border border-cream-200 rounded-xl px-4 py-3 font-sans text-sm text-warm-brown">
        <div className="flex items-center gap-2">
          <Users size={14} />
          Nessun collega in questo turno (sei da solo)
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* OVERLAP - chi lavora insieme */}
      {overlap.length > 0 && (
        <CompanionGroup
          title="Insieme a te"
          icon={<Users size={14} className="text-sage-700" />}
          tone="sage"
          companions={overlap}
          renderTime={(c) => `${fmtTime(c.overlap_start)} – ${fmtTime(c.overlap_end)}`}
          compact={compact}
        />
      )}

      {/* BEFORE - chi stacca quando arrivi */}
      {before.length > 0 && (
        <CompanionGroup
          title="Stacca quando arrivi tu"
          icon={<ArrowLeft size={14} className="text-warm-brown" />}
          tone="cream"
          companions={before}
          renderTime={(c) => `Fino alle ${fmtTime(c.shift_end)}`}
          compact={compact}
        />
      )}

      {/* AFTER - chi inizia quando stacchi */}
      {after.length > 0 && (
        <CompanionGroup
          title="Subentra quando stacchi"
          icon={<ArrowRight size={14} className="text-warm-brown" />}
          tone="cream"
          companions={after}
          renderTime={(c) => `Dalle ${fmtTime(c.shift_start)}`}
          compact={compact}
        />
      )}
    </div>
  )
}

function CompanionGroup({ title, icon, tone, companions, renderTime, compact }) {
  const cls = tone === 'sage'
    ? 'bg-sage-50 border-sage-200'
    : 'bg-cream-50 border-cream-200'
  return (
    <div className={`border rounded-xl px-4 py-3 ${cls}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="font-sans text-xs uppercase tracking-wider text-warm-brown font-semibold">
          {title}
        </span>
      </div>
      <div className={`flex flex-col gap-1.5`}>
        {companions.map((c) => (
          <CompanionRow key={c.staff_id + (c.shift_start || '')}
            companion={c}
            timeLabel={renderTime(c)}
            compact={compact} />
        ))}
      </div>
    </div>
  )
}

function CompanionRow({ companion, timeLabel, compact }) {
  const color = companion.role_color || '#C97D60'
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-sans text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: color }}>
        {initials(companion.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-sans text-sm font-semibold text-warm-dark truncate">
          {compact ? companion.first_name : companion.name}
          {companion.role_name && (
            <span className="ml-1.5 font-normal text-warm-brown text-xs">
              · {companion.role_name}
            </span>
          )}
        </div>
        <div className="font-sans text-xs text-warm-brown leading-tight">
          {timeLabel}
        </div>
      </div>
    </div>
  )
}

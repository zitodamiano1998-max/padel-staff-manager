import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  BarChart3, Calendar, Clock as ClockIcon, AlertCircle, CheckCircle2,
  Users, Moon, Sun, ArrowLeftRight, Palmtree, Search, Download,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Euro,
  AlertTriangle, Loader2, Check, RotateCcw,
} from 'lucide-react'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

export default function Stats() {
  const { profile } = useAuth()
  const isManager = profile?.is_manager
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  // Range temporale
  const [preset, setPreset] = useState('month') // week | month | year | custom
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Sezioni espanse
  const [expanded, setExpanded] = useState({
    volume: true,
    punctuality: true,
    late_manage: true,
    reliability: true,
    team_health: true,
    costs: true,
  })

  const { startDate, endDate, label } = useMemo(() => computeRange(preset, customStart, customEnd), [preset, customStart, customEnd])

  useEffect(() => {
    if (isManager && startDate && endDate) fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, isManager])

  const fetchStats = async () => {
    setLoading(true)
    setError(null)
    const { data: stats, error: err } = await supabase.rpc('get_manager_stats', {
      p_start_date: startDate,
      p_end_date: endDate,
    })
    if (err) setError(err.message)
    else setData(stats)
    setLoading(false)
  }

  const toggle = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }))

  if (!isManager) {
    return <div className="text-center py-12 text-warm-brown font-sans">Solo i manager hanno accesso a questa pagina.</div>
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl text-warm-dark mb-1">Statistiche</h1>
        <p className="font-sans text-sm text-warm-brown">
          Panoramica del team nel periodo selezionato
        </p>
      </div>

      {/* Range picker */}
      <div className="bg-white rounded-2xl border border-cream-300 p-4 mb-6 flex flex-wrap items-center gap-3">
        <span className="font-sans text-xs uppercase tracking-wider text-warm-brown">Periodo:</span>
        <div className="flex bg-cream-200 rounded-lg p-0.5">
          {[
            ['week', 'Settimana'],
            ['month', 'Mese'],
            ['year', 'Anno'],
            ['custom', 'Personalizzato'],
          ].map(([value, lbl]) => (
            <button key={value} onClick={() => setPreset(value)}
              className={`px-3 py-1.5 rounded-md font-sans text-sm font-semibold transition ${
                preset === value ? 'bg-white text-warm-dark shadow-sm' : 'text-warm-brown'
              }`}>
              {lbl}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-cream-300 font-sans text-sm" />
            <span className="font-sans text-warm-brown">→</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-cream-300 font-sans text-sm" />
          </>
        )}

        <span className="font-sans text-sm text-warm-brown ml-auto">{label}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 font-sans text-sm mb-4">
          Errore: {error}
        </div>
      )}

      {loading && !data ? (
        <div className="text-center py-12 text-warm-brown font-sans">Caricamento...</div>
      ) : !data ? (
        <div className="text-center py-12 text-warm-brown font-sans">Seleziona un periodo per iniziare</div>
      ) : (
        <>
          {/* Totals overview */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <KpiCard label="Turni" value={data.totals?.shifts_total ?? 0} icon={Calendar} color="#C97D60" />
            <KpiCard label="Ore" value={data.totals?.hours_total ?? 0} icon={ClockIcon} color="#5C8D7E" />
            <KpiCard label="Costo team" value={fmtEuro(data.totals?.cost_total)} icon={Euro} color="#7B6F60" />
            <KpiCard label="Ferie" value={data.totals?.leaves_total ?? 0} icon={Palmtree} color="#D4A574" />
            <KpiCard label="Scambi" value={data.totals?.swaps_total ?? 0} icon={ArrowLeftRight} color="#8B7355" />
            <KpiCard label="Dipendenti" value={data.totals?.staff_active ?? 0} icon={Users} color="#A86B5C" />
          </div>

          {/* VOLUME */}
          <Section title="Volume di lavoro" subtitle="Ore e turni per dipendente"
            icon={BarChart3}
            expanded={expanded.volume} onToggle={() => toggle('volume')}>
            <VolumeSection data={data.volume || []} />
          </Section>

          {/* PUNCTUALITY */}
          <Section title="Puntualità" subtitle="% on-time, ritardi medi, dimenticati timbrare"
            icon={CheckCircle2}
            expanded={expanded.punctuality} onToggle={() => toggle('punctuality')}>
            <PunctualitySection data={data.punctuality || []} />
          </Section>

          {/* GESTIONE RITARDI (azionabile) */}
          <Section title="Gestione ritardi" subtitle="Penalizza sul comportamento: chi arriva spesso in ritardo"
            icon={AlertTriangle}
            expanded={expanded.late_manage} onToggle={() => toggle('late_manage')}>
            <LateManageSection startDate={startDate} endDate={endDate} />
          </Section>

          {/* RELIABILITY */}
          <Section title="Affidabilità" subtitle="Scambi, ferie, comportamenti"
            icon={ArrowLeftRight}
            expanded={expanded.reliability} onToggle={() => toggle('reliability')}>
            <ReliabilitySection data={data.reliability || []} />
          </Section>

          {/* COSTS */}
          <Section title="Costi" subtitle="Costo per dipendente nel periodo (basato su tariffa oraria o stipendio mensile)"
            icon={Euro}
            expanded={expanded.costs} onToggle={() => toggle('costs')}>
            <CostsSection data={data.costs || []} totalCost={data.totals?.cost_total} />
          </Section>

          {/* TEAM HEALTH */}
          <Section title="Salute team" subtitle="Distribuzione weekend/sera, heatmap presenze"
            icon={Users}
            expanded={expanded.team_health} onToggle={() => toggle('team_health')}>
            <TeamHealthSection data={data.team_health || {}} />
          </Section>
        </>
      )}
    </div>
  )
}

// ============================================================================
// HELPERS
// ============================================================================
function LateManageSection({ startDate, endDate }) {
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(() => new Set()) // entry_id selezionati
  const [openStaff, setOpenStaff] = useState(() => new Set()) // staff espansi
  const [acting, setActing] = useState(false)

  const fetchSummary = async () => {
    if (!startDate || !endDate) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('late_behavior_summary', {
      p_from: startDate,
      p_to: endDate,
    })
    if (err) setError(err.message)
    else setSummary(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => {
    fetchSummary()
    setSelected(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate])

  const toggleSel = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleStaff = (id) => {
    setOpenStaff((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const runAction = async (rpc) => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setActing(true)
    setError(null)
    const { error: err } = await supabase.rpc(rpc, { p_entry_ids: ids })
    setActing(false)
    if (err) { setError(err.message); return }
    setSelected(new Set())
    await fetchSummary()
  }

  if (loading) return <div className="text-center py-8 text-warm-brown font-sans">Caricamento...</div>
  if (error) return <div className="text-center py-6 text-red-700 font-sans text-sm">Errore: {error}</div>
  if (!summary || summary.length === 0) {
    return <div className="text-center py-8 text-warm-brown font-sans text-sm">Nessun ritardo nel periodo selezionato.</div>
  }

  const selCount = selected.size

  return (
    <div>
      <p className="font-sans text-xs text-warm-brown mb-3">
        I ritardi sono conteggiati dall’inizio turno (nessuna penalità automatica fino a +15 min).
        Seleziona i ritardi di un dipendente e applica la penalità (+30 min) in base al comportamento.
        I ritardi oltre +15 min sono già penalizzati automaticamente e non sono modificabili.
      </p>

      {/* Barra azioni */}
      {selCount > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-xl bg-cream-50 border border-cream-200">
          <span className="font-sans text-sm text-warm-dark font-semibold ml-1">{selCount} selezionati</span>
          <div className="flex-1" />
          <button onClick={() => runAction('penalize_late')} disabled={acting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-sans text-sm font-semibold transition disabled:opacity-50">
            {acting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Penalizza (+30)
          </button>
          <button onClick={() => runAction('restore_late')} disabled={acting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cream-300 hover:bg-cream-100 text-warm-dark font-sans text-sm font-semibold transition disabled:opacity-50">
            {acting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Ripristina (S)
          </button>
        </div>
      )}

      <div className="space-y-2">
        {summary.map((s) => {
          const isOpen = openStaff.has(s.staff_id)
          return (
            <div key={s.staff_id} className="rounded-xl border border-cream-200 overflow-hidden">
              <button onClick={() => toggleStaff(s.staff_id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cream-50 transition text-left">
                <div className="flex-1 min-w-0">
                  <div className="font-sans font-semibold text-warm-dark">{s.staff_name}</div>
                  <div className="font-sans text-xs text-warm-brown">
                    {s.ritardi_totali} ritardi · media +{s.ritardo_medio_min} min
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {s.penalizzabili > 0 && (
                    <span className="font-sans text-[10px] px-2 py-0.5 rounded-md bg-cream-100 border border-cream-300 text-warm-brown">
                      {s.penalizzabili} da valutare
                    </span>
                  )}
                  {s.penalizzati_manuale > 0 && (
                    <span className="font-sans text-[10px] px-2 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-800">
                      {s.penalizzati_manuale} penalizzati
                    </span>
                  )}
                  {s.penalizzati_auto > 0 && (
                    <span className="font-sans text-[10px] px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-700">
                      {s.penalizzati_auto} auto
                    </span>
                  )}
                </div>
                {isOpen ? <ChevronUp size={16} className="text-warm-brown flex-shrink-0" /> : <ChevronDown size={16} className="text-warm-brown flex-shrink-0" />}
              </button>

              {isOpen && (
                <div className="border-t border-cream-200 divide-y divide-cream-100">
                  {(s.dettaglio || []).map((d) => {
                    const selectable = d.stato === 'tollerato' || d.stato === 'penalizzato_manuale'
                    const dt = new Date(d.event_time)
                    return (
                      <div key={d.entry_id}
                        className={`flex items-center gap-3 px-4 py-2.5 ${selectable ? 'cursor-pointer hover:bg-cream-50' : 'opacity-60'}`}
                        onClick={selectable ? () => toggleSel(d.entry_id) : undefined}>
                        <input type="checkbox" readOnly
                          checked={selected.has(d.entry_id)}
                          disabled={!selectable}
                          className="w-4 h-4 rounded accent-amber-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-sans text-sm text-warm-dark">
                            {dt.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                            {' · '}
                            <span className="font-semibold">+{d.ritardo_min} min</span>
                          </div>
                          {d.late_reason && (
                            <div className="font-sans text-xs text-warm-brown italic truncate">“{d.late_reason}”</div>
                          )}
                        </div>
                        <LateStateBadge stato={d.stato} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LateStateBadge({ stato }) {
  const map = {
    tollerato: { t: 'da valutare', c: 'bg-cream-100 border-cream-300 text-warm-brown' },
    penalizzato_manuale: { t: 'penalizzato', c: 'bg-amber-100 border-amber-300 text-amber-800' },
    penalizzato_auto: { t: 'auto +30', c: 'bg-red-50 border-red-200 text-red-700' },
  }
  const s = map[stato] || map.tollerato
  return (
    <span className={`font-sans text-[10px] px-2 py-0.5 rounded-md border flex-shrink-0 ${s.c}`}>{s.t}</span>
  )
}

function computeRange(preset, customStart, customEnd) {
  const today = new Date()
  let start, end, label
  if (preset === 'week') {
    const day = today.getDay() || 7
    start = new Date(today)
    start.setDate(today.getDate() - day + 1)
    end = new Date(start)
    end.setDate(start.getDate() + 6)
    label = `Settimana corrente: ${formatIt(start)} - ${formatIt(end)}`
  } else if (preset === 'month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1)
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    label = `${capitalize(start.toLocaleDateString('it-IT', { month: 'long' }))} ${start.getFullYear()}`
  } else if (preset === 'year') {
    start = new Date(today.getFullYear(), 0, 1)
    end = new Date(today.getFullYear(), 11, 31)
    label = `Anno ${today.getFullYear()}`
  } else {
    if (!customStart || !customEnd) return { startDate: null, endDate: null, label: 'Seleziona date' }
    start = new Date(customStart)
    end = new Date(customEnd)
    label = `${formatIt(start)} - ${formatIt(end)}`
  }
  return {
    startDate: start.toISOString().substring(0, 10),
    endDate: end.toISOString().substring(0, 10),
    label,
  }
}
function formatIt(d) { return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

function fmtEuro(n) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  if (isNaN(num)) return '—'
  return num.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

// ============================================================================
// KPI CARD
// ============================================================================
function KpiCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
          style={{ backgroundColor: color }}>
          <Icon size={14} />
        </div>
        <span className="font-sans text-xs uppercase tracking-wider text-warm-brown">{label}</span>
      </div>
      <div className="font-serif text-3xl text-warm-dark font-semibold">{value}</div>
    </div>
  )
}

// ============================================================================
// SECTION (expandable)
// ============================================================================
function Section({ title, subtitle, icon: Icon, expanded, onToggle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-300 mb-4 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-cream-50 transition text-left">
        <Icon size={18} className="text-warm-brown flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-xl text-warm-dark">{title}</h2>
          <p className="font-sans text-xs text-warm-brown">{subtitle}</p>
        </div>
        {expanded ? <ChevronUp size={18} className="text-warm-brown" /> : <ChevronDown size={18} className="text-warm-brown" />}
      </button>
      {expanded && <div className="px-5 pb-5 border-t border-cream-200 pt-4">{children}</div>}
    </div>
  )
}

// ============================================================================
// VOLUME
// ============================================================================
function VolumeSection({ data }) {
  if (!data || data.length === 0) return <Empty />
  const maxHours = Math.max(...data.map((d) => d.hours_total || 0), 1)
  return (
    <div>
      <ExportCSV data={data} filename="volume" columns={[
        { key: 'name', label: 'Dipendente' },
        { key: 'role_name', label: 'Ruolo' },
        { key: 'shift_count', label: 'Turni' },
        { key: 'hours_total', label: 'Ore totali' },
      ]} />
      <div className="space-y-2 mt-3">
        {data.map((row) => (
          <div key={row.staff_id} className="flex items-center gap-3">
            <div className="w-32 sm:w-40 flex-shrink-0">
              <div className="font-sans text-sm font-semibold text-warm-dark truncate">{row.name}</div>
              {row.role_name && (
                <div className="font-sans text-xs text-warm-brown truncate">{row.role_name}</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="h-7 bg-cream-100 rounded-lg overflow-hidden relative">
                <div className="h-full transition-all"
                  style={{
                    width: `${Math.max(2, (row.hours_total / maxHours) * 100)}%`,
                    backgroundColor: row.role_color || '#C97D60',
                  }} />
                <div className="absolute inset-0 flex items-center px-3 font-sans text-xs font-semibold text-warm-dark">
                  {row.hours_total} ore · {row.shift_count} turni
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// PUNCTUALITY
// ============================================================================
function PunctualitySection({ data }) {
  if (!data || data.length === 0) return <Empty />
  return (
    <div>
      <ExportCSV data={data} filename="puntualita" columns={[
        { key: 'name', label: 'Dipendente' },
        { key: 'shifts_done', label: 'Turni completati' },
        { key: 'on_time_pct', label: '% Puntuale' },
        { key: 'avg_delay_min', label: 'Ritardo medio (min)' },
        { key: 'forgotten_clock_in', label: 'Mancato clock-in' },
        { key: 'forgotten_clock_out', label: 'Mancato clock-out' },
      ]} />
      <div className="overflow-x-auto -mx-2 mt-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-sans text-xs uppercase tracking-wider text-warm-brown border-b border-cream-200">
              <th className="px-3 py-2">Dipendente</th>
              <th className="px-3 py-2 text-right">Turni</th>
              <th className="px-3 py-2 text-right">Puntuale</th>
              <th className="px-3 py-2 text-right">Ritardo medio</th>
              <th className="px-3 py-2 text-right">Mancati IN</th>
              <th className="px-3 py-2 text-right">Mancati OUT</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.staff_id} className="border-b border-cream-100 last:border-0">
                <td className="px-3 py-2 font-sans font-semibold text-warm-dark">{row.name}</td>
                <td className="px-3 py-2 text-right font-sans text-warm-dark">{row.shifts_done}</td>
                <td className="px-3 py-2 text-right">
                  <PuntPct value={row.on_time_pct} />
                </td>
                <td className="px-3 py-2 text-right font-sans text-warm-dark">
                  {row.avg_delay_min !== null && row.avg_delay_min !== undefined
                    ? `${row.avg_delay_min > 0 ? '+' : ''}${row.avg_delay_min} min`
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.forgotten_clock_in > 0
                    ? <span className="font-sans text-amber-700 font-semibold">{row.forgotten_clock_in}</span>
                    : <span className="font-sans text-warm-brown">0</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.forgotten_clock_out > 0
                    ? <span className="font-sans text-amber-700 font-semibold">{row.forgotten_clock_out}</span>
                    : <span className="font-sans text-warm-brown">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PuntPct({ value }) {
  if (value === null || value === undefined) return <span className="font-sans text-warm-brown">—</span>
  const cls = value >= 90 ? 'text-sage-700 bg-sage-100'
    : value >= 70 ? 'text-amber-700 bg-amber-100'
    : 'text-red-700 bg-red-100'
  return (
    <span className={`inline-block px-2 py-0.5 rounded font-sans text-xs font-semibold ${cls}`}>
      {value}%
    </span>
  )
}

// ============================================================================
// RELIABILITY
// ============================================================================
function ReliabilitySection({ data }) {
  if (!data || data.length === 0) return <Empty />
  return (
    <div>
      <ExportCSV data={data} filename="affidabilita" columns={[
        { key: 'name', label: 'Dipendente' },
        { key: 'swaps_proposed', label: 'Scambi proposti' },
        { key: 'swaps_accepted', label: 'Scambi accettati' },
        { key: 'leave_requests', label: 'Richieste ferie' },
      ]} />
      <div className="overflow-x-auto -mx-2 mt-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-sans text-xs uppercase tracking-wider text-warm-brown border-b border-cream-200">
              <th className="px-3 py-2">Dipendente</th>
              <th className="px-3 py-2 text-right">Scambi proposti</th>
              <th className="px-3 py-2 text-right">Scambi accettati</th>
              <th className="px-3 py-2 text-right">Richieste ferie</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.staff_id} className="border-b border-cream-100 last:border-0">
                <td className="px-3 py-2 font-sans font-semibold text-warm-dark">{row.name}</td>
                <td className="px-3 py-2 text-right font-sans text-warm-dark">{row.swaps_proposed}</td>
                <td className="px-3 py-2 text-right font-sans text-warm-dark">{row.swaps_accepted}</td>
                <td className="px-3 py-2 text-right font-sans text-warm-dark">{row.leave_requests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// TEAM HEALTH
// ============================================================================
function TeamHealthSection({ data }) {
  const perStaff = data?.per_staff || []
  const heatmap = data?.heatmap || []

  if (perStaff.length === 0) return <Empty />

  // Build heatmap matrix [dow 0-6][hour 0-23]
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0))
  let maxCnt = 0
  for (const cell of heatmap) {
    grid[cell.dow][cell.hour] = cell.count
    if (cell.count > maxCnt) maxCnt = cell.count
  }

  // Hours visibili: solo quelle con almeno 1 turno
  const usedHours = new Set()
  for (const cell of heatmap) usedHours.add(cell.hour)
  const hoursList = Array.from(usedHours).sort((a, b) => a - b)
  if (hoursList.length === 0) hoursList.push(8, 12, 18) // fallback

  return (
    <div className="space-y-6">
      {/* Per staff */}
      <div>
        <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-2">
          Distribuzione turni "scomodi" per dipendente
        </div>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-sans text-xs uppercase tracking-wider text-warm-brown border-b border-cream-200">
                <th className="px-3 py-2">Dipendente</th>
                <th className="px-3 py-2 text-right">Turni weekend</th>
                <th className="px-3 py-2 text-right">Turni serali (≥18)</th>
                <th className="px-3 py-2 text-right">Totale turni</th>
              </tr>
            </thead>
            <tbody>
              {perStaff.map((row) => (
                <tr key={row.staff_id} className="border-b border-cream-100 last:border-0">
                  <td className="px-3 py-2 font-sans font-semibold text-warm-dark">{row.name}</td>
                  <td className="px-3 py-2 text-right font-sans text-warm-dark">{row.weekend_shifts}</td>
                  <td className="px-3 py-2 text-right font-sans text-warm-dark">{row.evening_shifts}</td>
                  <td className="px-3 py-2 text-right font-sans text-warm-brown">{row.total_shifts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Heatmap */}
      <div>
        <div className="font-sans text-xs uppercase tracking-wider text-warm-brown mb-2">
          Heatmap presenze (giorno × ora di inizio turno)
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="w-12"></th>
                {hoursList.map((h) => (
                  <th key={h} className="font-sans text-xs text-warm-brown px-1.5 py-1 font-normal">
                    {String(h).padStart(2, '0')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                <tr key={dow}>
                  <td className="font-sans text-xs text-warm-brown pr-2 py-1">{DAY_NAMES[dow]}</td>
                  {hoursList.map((h) => {
                    const v = grid[dow][h]
                    const opacity = maxCnt > 0 ? (v / maxCnt) : 0
                    return (
                      <td key={h} className="p-0.5">
                        <div className="w-7 h-7 rounded font-sans text-xs flex items-center justify-center transition"
                          style={{
                            backgroundColor: v > 0
                              ? `rgba(201, 125, 96, ${0.15 + opacity * 0.85})`
                              : '#F5F0E8',
                            color: opacity > 0.6 ? 'white' : '#7B6F60',
                          }}
                          title={`${DAY_NAMES[dow]} ${h}:00 → ${v} turni`}>
                          {v > 0 ? v : ''}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// COSTS
// ============================================================================
function CostsSection({ data, totalCost }) {
  if (!data || data.length === 0) return <Empty />

  const compTypeLabel = (t) => ({
    hourly: 'Oraria',
    monthly: 'Mensile',
    none: 'Non tracciato',
  }[t] || t)

  return (
    <div>
      <ExportCSV data={data.map((r) => ({
        ...r,
        compensation_type_label: compTypeLabel(r.compensation_type),
      }))} filename="costi" columns={[
        { key: 'name', label: 'Dipendente' },
        { key: 'compensation_type_label', label: 'Tipo retribuzione' },
        { key: 'hourly_rate', label: 'Tariffa oraria (€)' },
        { key: 'monthly_salary', label: 'Stipendio mensile (€)' },
        { key: 'hours_actual', label: 'Ore effettive' },
        { key: 'cost_total', label: 'Costo totale (€)' },
      ]} />

      <div className="bg-cream-100 rounded-xl p-3 my-3 flex items-center justify-between">
        <span className="font-sans text-sm text-warm-brown">Costo totale team nel periodo</span>
        <span className="font-serif text-2xl font-semibold text-warm-dark">{fmtEuro(totalCost)}</span>
      </div>

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-sans text-xs uppercase tracking-wider text-warm-brown border-b border-cream-200">
              <th className="px-3 py-2">Dipendente</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2 text-right">Tariffa</th>
              <th className="px-3 py-2 text-right">Ore effettive</th>
              <th className="px-3 py-2 text-right">Costo periodo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.staff_id} className="border-b border-cream-100 last:border-0">
                <td className="px-3 py-2 font-sans font-semibold text-warm-dark">{row.name}</td>
                <td className="px-3 py-2">
                  <CompTypeBadge type={row.compensation_type} />
                </td>
                <td className="px-3 py-2 text-right font-sans text-warm-dark">
                  {row.compensation_type === 'hourly' && row.hourly_rate
                    ? `${fmtEuro(row.hourly_rate)}/h`
                    : row.compensation_type === 'monthly' && row.monthly_salary
                    ? `${fmtEuro(row.monthly_salary)}/mese`
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right font-sans text-warm-dark">
                  {row.hours_actual} h
                </td>
                <td className="px-3 py-2 text-right font-sans font-semibold text-warm-dark">
                  {row.cost_total !== null && row.cost_total !== undefined
                    ? fmtEuro(row.cost_total)
                    : <span className="font-normal text-warm-brown text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-sans text-xs text-warm-brown mt-3 leading-relaxed">
        Le ore effettive sono calcolate dalle timbrature (clock in/out). Per i dipendenti a stipendio mensile,
        il costo del periodo è proporzionale ai giorni selezionati (×giorni/30). I dipendenti con tipo
        retribuzione "Non tracciato" mostrano solo le ore senza calcolo costo: imposta una tariffa oraria
        o uno stipendio mensile dall'Anagrafica.
      </p>
    </div>
  )
}

function CompTypeBadge({ type }) {
  const map = {
    hourly: { label: 'Oraria', cls: 'bg-terracotta-100 text-terracotta-700' },
    monthly: { label: 'Mensile', cls: 'bg-sage-100 text-sage-700' },
    none: { label: 'Non tracciato', cls: 'bg-cream-200 text-warm-brown' },
  }
  const c = map[type] || map.none
  return (
    <span className={`inline-block px-2 py-0.5 rounded font-sans text-xs font-semibold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ============================================================================
// EMPTY
// ============================================================================
function Empty() {
  return (
    <div className="text-center py-8 text-warm-brown font-sans text-sm">
      Nessun dato per questo periodo.
    </div>
  )
}

// ============================================================================
// EXPORT CSV
// ============================================================================
function ExportCSV({ data, filename, columns }) {
  const handleExport = () => {
    if (!data || data.length === 0) return
    const header = columns.map((c) => c.label).join(';')
    const rows = data.map((row) => columns.map((c) => {
      const v = row[c.key]
      if (v === null || v === undefined) return ''
      const s = String(v).replace(/;/g, ',').replace(/\n/g, ' ')
      return s
    }).join(';'))
    // BOM UTF-8 for Excel compatibility
    const csv = '\uFEFF' + header + '\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}-${new Date().toISOString().substring(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button onClick={handleExport}
      className="flex items-center gap-1.5 font-sans text-xs font-semibold text-warm-brown hover:text-warm-dark transition">
      <Download size={12} /> Esporta CSV
    </button>
  )
}

// supabase/functions/ical-feed/index.ts
//
// Restituisce il feed iCalendar dei turni di un dipendente, identificato dal
// suo `ical_token`. Endpoint pubblico (no auth Supabase) per essere
// sottoscrivibile da Google Calendar, Apple Calendar, Outlook, ecc.
//
// URL: https://<project>.supabase.co/functions/v1/ical-feed?token=<uuid>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ----- iCal helpers -----

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

// Formatta Date in formato iCal UTC: 20260501T093000Z
function toIcalUtc(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad2(date.getUTCMonth() + 1) +
    pad2(date.getUTCDate()) +
    'T' +
    pad2(date.getUTCHours()) +
    pad2(date.getUTCMinutes()) +
    pad2(date.getUTCSeconds()) +
    'Z'
  )
}

// Escape per testo iCal: \, ; , \n
function icalEscape(text: string): string {
  if (!text) return ''
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// Fold lines a 75 caratteri (RFC 5545)
function icalFold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let pos = 0
  while (pos < line.length) {
    if (pos === 0) {
      parts.push(line.slice(pos, 75))
      pos += 75
    } else {
      parts.push(' ' + line.slice(pos, pos + 74))
      pos += 74
    }
  }
  return parts.join('\r\n')
}

function buildIcal(staff: any, shifts: any[], settings: any): string {
  const lines: string[] = []
  const now = toIcalUtc(new Date())
  const calName = `Turni ${staff.first_name} ${staff.last_name} · Padel`

  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push('PRODID:-//Padel Staff Manager//IT')
  lines.push('CALSCALE:GREGORIAN')
  lines.push('METHOD:PUBLISH')
  lines.push(`X-WR-CALNAME:${icalEscape(calName)}`)
  lines.push(`X-WR-CALDESC:${icalEscape('Calendario turni lavorativi - aggiornato automaticamente')}`)
  lines.push('X-WR-TIMEZONE:Europe/Rome')
  // Refresh interval suggerito 1 ora
  lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT1H')
  lines.push('X-PUBLISHED-TTL:PT1H')

  for (const shift of shifts) {
    const start = new Date(shift.start_at)
    const end = new Date(shift.end_at)
    const roleName = shift.roles?.name || 'Turno'
    const summary = `${roleName} · Padel`

    const descLines: string[] = []
    descLines.push(`Turno: ${roleName}`)
    descLines.push(`Orario: ${pad2(new Date(start).getHours())}:${pad2(new Date(start).getMinutes())} - ${pad2(new Date(end).getHours())}:${pad2(new Date(end).getMinutes())}`)
    if (shift.notes) descLines.push(`Note: ${shift.notes}`)
    descLines.push('')
    descLines.push('Generato automaticamente da Padel Staff Manager')
    const description = descLines.join('\n')

    const status = shift.status === 'cancelled' ? 'CANCELLED'
                 : shift.status === 'draft' ? 'TENTATIVE'
                 : 'CONFIRMED'

    lines.push('BEGIN:VEVENT')
    lines.push(icalFold(`UID:shift-${shift.id}@padel-staff-manager`))
    lines.push(`DTSTAMP:${now}`)
    lines.push(`DTSTART:${toIcalUtc(start)}`)
    lines.push(`DTEND:${toIcalUtc(end)}`)
    lines.push(icalFold(`SUMMARY:${icalEscape(summary)}`))
    lines.push(icalFold(`DESCRIPTION:${icalEscape(description)}`))
    if (settings?.center_name) {
      lines.push(icalFold(`LOCATION:${icalEscape(settings.center_name)}`))
    }
    lines.push(`STATUS:${status}`)
    lines.push('TRANSP:OPAQUE')
    // SEQUENCE incrementa quando turno modificato. Senza updated_at uso un
    // hash di start_at + end_at + status: se uno di questi cambia, sequence cambia.
    const seqInput = `${shift.start_at}|${shift.end_at}|${shift.status}`
    let seqHash = 0
    for (let i = 0; i < seqInput.length; i++) {
      seqHash = ((seqHash << 5) - seqHash + seqInput.charCodeAt(i)) | 0
    }
    lines.push(`SEQUENCE:${Math.abs(seqHash)}`)
    lines.push(`LAST-MODIFIED:${toIcalUtc(new Date(shift.created_at))}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  // RFC 5545 line ending: CRLF
  return lines.join('\r\n') + '\r\n'
}

// ----- Handler -----

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return new Response('Token mancante', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  // Validazione UUID base
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(token)) {
    return new Response('Token non valido', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  // Cerca staff con quel token
  const { data: staff, error: staffErr } = await supabase
    .from('staff_members')
    .select('id, first_name, last_name, is_active')
    .eq('ical_token', token)
    .maybeSingle()

  if (staffErr || !staff) {
    return new Response('Token non riconosciuto', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  // Range turni: ultimi 30gg + prossimi 365gg
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 30)
  const to = new Date(now)
  to.setDate(to.getDate() + 365)

  const { data: shifts, error: shiftsErr } = await supabase
    .from('shifts')
    .select('id, start_at, end_at, status, notes, created_at, roles(name)')
    .eq('staff_id', staff.id)
    .gte('start_at', from.toISOString())
    .lt('start_at', to.toISOString())
    .neq('status', 'draft') // bozze non vanno in calendar
    .order('start_at', { ascending: true })

  if (shiftsErr) {
    return new Response('Errore lettura turni', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  // Settings (per location)
  const { data: settings } = await supabase
    .from('settings')
    .select('center_name')
    .limit(1)
    .maybeSingle()

  const ical = buildIcal(staff, shifts || [], settings)

  return new Response(ical, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="padel-${staff.first_name.toLowerCase()}.ics"`,
      'Cache-Control': 'public, max-age=600', // cache 10 min
      'Access-Control-Allow-Origin': '*',
    },
  })
})

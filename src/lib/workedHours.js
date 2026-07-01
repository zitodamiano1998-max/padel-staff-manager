// ============================================================================
// workedHours.js — UNICA fonte di verità per il calcolo delle ore lavorate.
// Usato da Clock, Timesheets e Dashboard. NON duplicare questa logica altrove:
// se serve modificarla, si modifica QUI e cambia ovunque.
// ============================================================================

// Arrotonda un orario alla mezz'ora più vicina (soglia 15/45):
//   19:44 -> 19:30   |   19:45 -> 20:00   |   11:12 -> 11:00
export function roundDateToHalfHour(d) {
  const r = new Date(d)
  const minutes = r.getMinutes()
  let rounded
  if (minutes < 15) rounded = 0
  else if (minutes < 45) rounded = 30
  else rounded = 60
  r.setMinutes(rounded, 0, 0)
  return r
}

// Calcola i millisecondi lavorati da una lista di timbrature (di UN dipendente).
// Accoppia clock_in->clock_out (e break_end->break_start) in sequenza, a
// prescindere dal giorno di calendario: gestisce quindi i turni a cavallo
// della mezzanotte. Un turno ancora aperto viene contato fino a nowDate.
//
// Orario d'inizio (clock_in):
//   - se la riga ha effective_time (calcolato dal trigger in base al turno:
//     entro 5' vale da S, 6-10' provvisorio da S, oltre 10' da S+30),
//     si usa QUELLO — è già l'ora ufficiale, niente arrotondamento.
//   - altrimenti (timbratura senza turno associato) si arrotonda l'orario reale.
// clock_out: sempre arrotondato alla mezz'ora. Le pause usano l'orario esatto.
export function computeWorkedMs(entries, nowDate) {
  let total = 0
  let workStart = null
  const sorted = [...entries].sort((a, b) => a.event_time.localeCompare(b.event_time))
  for (const e of sorted) {
    let t = new Date(e.event_time)

    if (e.event_type === 'clock_in') {
      // effective_time ha priorità: è l'ora d'inizio ufficiale decisa dal
      // trigger (e/o dalla decisione manager sul ritardo).
      if (e.effective_time) {
        t = new Date(e.effective_time)
      } else {
        t = roundDateToHalfHour(t)
      }
      // Se c'è già un turno aperto, ignora questo IN (probabile duplicato/manuale)
      if (workStart === null) workStart = t
    } else if (e.event_type === 'break_end') {
      // Le pause usano l'orario esatto (nessun arrotondamento)
      if (workStart === null) workStart = t
    } else if (e.event_type === 'break_start' || e.event_type === 'clock_out') {
      // clock_out arrotondato; break_start esatto
      if (e.event_type === 'clock_out') t = roundDateToHalfHour(t)
      if (workStart !== null) {
        // Calcola solo se l'OUT è dopo l'IN; ignora coppie invertite/duplicate (Δ ≤ 0)
        if (t > workStart) total += t - workStart
        workStart = null
      }
      // Se workStart è null, OUT senza IN: ignora (probabile duplicato)
    }
  }
  if (workStart) total += Math.max(0, nowDate - workStart)
  return Math.max(0, total)
}

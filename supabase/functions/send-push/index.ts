// Edge function: send-push
// Riceve notification_id, fetcha la notifica + subscriptions del recipient,
// invia push browser via web-push (VAPID).
//
// Variabili d'ambiente richieste (settale in Supabase Dashboard → Edge Functions):
//   VAPID_PUBLIC_KEY  - chiave pubblica VAPID
//   VAPID_PRIVATE_KEY - chiave privata VAPID (segreta!)
//   VAPID_SUBJECT     - "mailto:tuaemail@example.com" (email contatto)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:info.centropadelsanminiato@gmail.com'

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

    const { notification_id } = await req.json()
    if (!notification_id) {
      return new Response(
        JSON.stringify({ error: 'notification_id mancante' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Client con service role per bypassare RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Fetch della notifica
    const { data: notif, error: notifErr } = await supabase
      .from('notifications')
      .select('id, recipient_id, type, title, body, link, metadata')
      .eq('id', notification_id)
      .single()

    if (notifErr || !notif) {
      return new Response(
        JSON.stringify({ error: 'Notifica non trovata', details: notifErr?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Fetch subscriptions del recipient
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('staff_id', notif.recipient_id)

    if (subsErr) {
      return new Response(
        JSON.stringify({ error: 'Errore fetch subscriptions', details: subsErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, message: 'Nessun device sottoscritto' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Costruisci payload
    const payload = JSON.stringify({
      title: notif.title,
      body: notif.body || '',
      type: notif.type,
      link: notif.link || '/dashboard',
      notification_id: notif.id,
    })

    // 4. Invia push a tutte le subscriptions in parallelo
    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          )
          await supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id)
          return { id: sub.id, ok: true }
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
            return { id: sub.id, ok: false, reason: 'expired_cleaned' }
          }
          return { id: sub.id, ok: false, reason: err.message, statusCode: err.statusCode }
        }
      })
    )

    const sent = results.filter((r) => r.status === 'fulfilled' && (r.value as any).ok).length

    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        total: subs.length,
        results: results.map((r) => r.status === 'fulfilled' ? r.value : { error: (r.reason as any)?.message }),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

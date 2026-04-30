// supabase/functions/invite-staff/index.ts
//
// POST /invite-staff
// Body: { first_name, last_name, email, phone?, role_id?, contract_type?,
//         weekly_hours?, hourly_rate?, hire_date?, fiscal_code?, iban?,
//         notes?, redirect_url? }
//
// Auth: richiede JWT di un manager.
// Effetto: crea il record staff_members + invia email di invito Supabase.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Client che usa il JWT del caller (per validare ruolo manager)
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Chi sta chiamando?
    const { data: userData, error: userError } =
      await supabaseUser.auth.getUser()
    if (userError || !userData?.user) {
      return json({ error: 'Invalid session' }, 401)
    }
    const user = userData.user

    // È un manager?
    const { data: profile, error: profileErr } = await supabaseUser
      .from('staff_members')
      .select('is_manager')
      .eq('user_id', user.id)
      .single()

    if (profileErr || !profile?.is_manager) {
      return json({ error: 'Forbidden: managers only' }, 403)
    }

    // Body
    const body = await req.json()
    const {
      first_name,
      last_name,
      email,
      phone,
      role_id,
      contract_type,
      weekly_hours,
      hourly_rate,
      hire_date,
      fiscal_code,
      iban,
      notes,
      redirect_url,
    } = body

    if (!first_name || !last_name || !email) {
      return json({ error: 'first_name, last_name, email sono obbligatori' }, 400)
    }

    const normalizedEmail = String(email).trim().toLowerCase()

    // Client admin (service role) per bypass RLS e per auth.admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Email già usata?
    const { data: existing } = await supabaseAdmin
      .from('staff_members')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existing) {
      return json(
        { error: 'Un dipendente con questa email è già presente in anagrafica' },
        409
      )
    }

    // Crea record staff_members
    const { data: newStaff, error: insertError } = await supabaseAdmin
      .from('staff_members')
      .insert({
        first_name: String(first_name).trim(),
        last_name: String(last_name).trim(),
        email: normalizedEmail,
        phone: phone ? String(phone).trim() : null,
        role_id: role_id || null,
        contract_type: contract_type || 'part_time',
        weekly_hours: weekly_hours ?? 40,
        hourly_rate: hourly_rate ?? null,
        hire_date: hire_date || null,
        fiscal_code: fiscal_code ? String(fiscal_code).trim() : null,
        iban: iban ? String(iban).trim() : null,
        notes: notes ? String(notes).trim() : null,
        is_active: true,
        is_manager: false,
      })
      .select()
      .single()

    if (insertError) {
      return json(
        { error: 'Errore creazione: ' + insertError.message },
        500
      )
    }

    // Invia invito email via Supabase Auth
    const redirectTo =
      redirect_url || `${req.headers.get('origin') || ''}/accept-invite`

    const { error: inviteError } = await supabaseAdmin.auth.admin
      .inviteUserByEmail(normalizedEmail, {
        redirectTo,
        data: {
          first_name: String(first_name).trim(),
          last_name: String(last_name).trim(),
        },
      })

    if (inviteError) {
      // Rollback se l'invito fallisce
      await supabaseAdmin.from('staff_members').delete().eq('id', newStaff.id)
      return json(
        { error: 'Errore invio invito: ' + inviteError.message },
        500
      )
    }

    return json({
      success: true,
      staff: newStaff,
      message: 'Dipendente creato e invito inviato via email',
    })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
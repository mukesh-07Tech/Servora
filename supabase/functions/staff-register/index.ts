import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { full_name, email, phone, password, requested_role } = await req.json();

    const digits = String(phone || '').replace(/\D/g, '');
    const normalizedPhone = digits.length === 10 ? `+91${digits}` : digits.startsWith('91') && digits.length === 12 ? `+${digits}` : digits;

    if (
      String(full_name || '').trim().length < 2 ||
      digits.length < 10 ||
      String(password || '').length < 8 ||
      !['kitchen', 'employee'].includes(requested_role)
    ) {
      return json(
        {
          error:
            'Please enter your full name (2+ chars), valid 10-digit mobile number, password (8+ chars), and select a valid role.'
        },
        400
      );
    }

    const cleanEmail = email ? String(email).trim().toLowerCase() : `${digits}@servora.com`;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceRoleKey);

    // Resolve restaurant ID: from env or first restaurant in database
    let restaurantId = Deno.env.get('RESTAURANT_ID');
    if (!restaurantId) {
      const { data: rest } = await db.from('restaurants').select('id').limit(1).maybeSingle();
      restaurantId = rest?.id;
    }

    // Rate limiting check
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from('staff_applications')
      .select('*', { count: 'exact', head: true })
      .or(`phone.eq.${normalizedPhone},phone.eq.${digits}`)
      .gte('created_at', since);

    if ((count || 0) > 3) {
      return json({ error: 'Too many registration attempts. Please try again later.' }, 429);
    }

    // Create auth user with metadata
    const { data, error } = await db.auth.admin.createUser({
      email: cleanEmail,
      phone: normalizedPhone,
      password: String(password),
      email_confirm: true,
      phone_confirm: true,
      user_metadata: {
        full_name: String(full_name).trim().slice(0, 100),
        requested_role,
        restaurant_id: restaurantId,
        phone: normalizedPhone
      }
    });

    if (error) {
      if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
        return json({ error: 'An account with this phone number or email is already registered.' }, 409);
      }
      throw error;
    }

    return json({
      success: true,
      message: 'Registration submitted successfully! Your account will be activated after administrator approval.',
      user_id: data.user.id
    });
  } catch (e: any) {
    return json({ error: e.message || 'Registration failed.' }, 400);
  }
});

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

const hash = async (v: string) => {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const {
      data: { user }
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Sign in required.' }, 401);

    const { data: p } = await userClient
      .from('profiles')
      .select('role,approval_status,restaurant_id')
      .eq('id', user.id)
      .single();
    if (!p || p.role !== 'admin' || p.approval_status !== 'approved')
      return json({ error: 'Administrator access required.' }, 403);

    const body = await req.json().catch(() => ({}));
    const { table_id, origin: clientOrigin } = body;

    const admin = createClient(url, service);
    const { data: table, error: te } = await admin
      .from('dining_tables')
      .select('id,table_number,restaurant_id')
      .eq('id', table_id)
      .eq('restaurant_id', p.restaurant_id)
      .single();
    if (te || !table) return json({ error: 'Table not found.' }, 404);

    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');

    await admin
      .from('table_qr_codes')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('table_id', table.id)
      .eq('is_active', true);

    const { error } = await admin.from('table_qr_codes').insert({
      restaurant_id: p.restaurant_id,
      table_id: table.id,
      token_hash: await hash(token),
      is_active: true
    });
    if (error) throw error;

    const appUrl = (
      Deno.env.get('PUBLIC_APP_URL') ||
      clientOrigin ||
      req.headers.get('origin') ||
      req.headers.get('referer') ||
      ''
    ).replace(/\/$/, '');

    return json({
      table_number: table.table_number,
      token,
      url: `${appUrl}/order?table=${token}`
    });
  } catch (e: any) {
    return json({ error: e.message || 'Unable to generate table QR.' }, 400);
  }
});

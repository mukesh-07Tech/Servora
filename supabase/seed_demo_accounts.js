import pg from 'pg';
const { Client } = pg;

async function seedDirectAuth() {
  const client = new Client({
    host: 'db.mhizmkyupcefuxuxuusx.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'Dhoni@#1710',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const rest = await client.query(`select id from public.restaurants limit 1;`);
  const restaurantId = rest.rows[0].id;

  const st = await client.query(`select id from public.kitchen_stations where name like 'Dosa%' limit 1;`);
  const stationId = st.rows[0]?.id;

  // Clean old entries
  await client.query(`
    delete from auth.identities where user_id in ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003');
    delete from public.profiles where id in ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003');
    delete from auth.users where id in ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003');
  `);

  const accounts = [
    {
      id: 'd0000000-0000-0000-0000-000000000001',
      email: 'admin@servora.com',
      name: 'Admin Manager',
      role: 'admin',
      phone: '+919876543210',
      station: null
    },
    {
      id: 'd0000000-0000-0000-0000-000000000002',
      email: 'kitchen@servora.com',
      name: 'Executive Chef',
      role: 'kitchen',
      phone: '+919876543211',
      station: stationId
    },
    {
      id: 'd0000000-0000-0000-0000-000000000003',
      email: 'waiter@servora.com',
      name: 'Floor Waiter',
      role: 'employee',
      phone: '+919876543212',
      station: null
    }
  ];

  for (const u of accounts) {
    // 1. Insert into auth.users
    await client.query(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone, phone_confirmed_at, phone_change, phone_change_token, reauthentication_token,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at
      ) values (
        $1::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        $2::varchar,
        crypt('Password123!', gen_salt('bf', 10)),
        now(),
        '',
        '',
        '',
        '',
        $3::text,
        now(),
        '',
        '',
        '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        json_build_object('sub', $1::text, 'email', $2::text, 'full_name', $4::text, 'email_verified', true)::jsonb,
        false,
        false,
        now(),
        now()
      )
      on conflict (id) do update set
        encrypted_password = crypt('Password123!', gen_salt('bf', 10)),
        email_confirmed_at = now();
    `, [u.id, u.email, u.phone, u.name]);

    // 2. Insert into auth.identities
    await client.query(`
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, created_at, updated_at
      ) values (
        gen_random_uuid(),
        $1::uuid,
        json_build_object('sub', $1::text, 'email', $2::text, 'full_name', $3::text, 'email_verified', true)::jsonb,
        'email',
        $1::text,
        now(),
        now()
      )
      on conflict do nothing;
    `, [u.id, u.email, u.name]);

    // 3. Update public.profiles
    await client.query(`
      insert into public.profiles (
        id, restaurant_id, full_name, phone, email, role, approval_status, station_id, created_at, updated_at
      ) values (
        $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, 'approved', $7::uuid, now(), now()
      )
      on conflict (id) do update set
        restaurant_id = excluded.restaurant_id,
        full_name = excluded.full_name,
        phone = excluded.phone,
        email = excluded.email,
        role = excluded.role,
        approval_status = 'approved',
        station_id = excluded.station_id,
        updated_at = now();
    `, [u.id, restaurantId, u.name, u.phone, u.email, u.role, u.station]);
  }

  console.log('✓ Demo accounts seeded directly in auth.users, auth.identities, and public.profiles!');
  await client.end();
}

seedDirectAuth().catch(console.error);

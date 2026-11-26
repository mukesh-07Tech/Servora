import pg from 'pg';
const { Client } = pg;

async function seed() {
  const client = new Client({
    host: 'db.mhizmkyupcefuxuxuusx.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'Dhoni@#1710',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  console.log('Connecting to PostgreSQL database...');
  await client.connect();
  console.log('Connected!');

  // Add email column to profiles if not present
  await client.query(`
    alter table public.profiles add column if not exists email text;
    create index if not exists profiles_email_idx on public.profiles(email);
  `);

  console.log('Seeding restaurant, stations, categories, items, tables, and accounts...');

  // 1. Restaurant
  const resRest = await client.query(`
    insert into public.restaurants (id, name, slug, phone, email, address, gstin, timezone, currency, gst_rate, service_charge_rate, is_open)
    values (
      'a0000000-0000-0000-0000-000000000001',
      'SERVORA',
      'servora',
      '+91 98765 43210',
      'info@servora.com',
      'Perambur, Chennai – 600011, Tamil Nadu, India',
      '33AAAAA0000A1Z5',
      'Asia/Kolkata',
      'INR',
      5.00,
      0.00,
      true
    )
    on conflict (slug) do update set
      name = excluded.name,
      phone = excluded.phone,
      email = excluded.email,
      address = excluded.address
    returning id;
  `);
  const restaurantId = resRest.rows[0].id;
  console.log('✓ Restaurant configured. ID:', restaurantId);

  // 2. Kitchen Stations
  const stations = [
    { name: 'Dosa & Tawa Station', capacity: 6 },
    { name: 'Curry & Gravy Station', capacity: 5 },
    { name: 'Snacks & Tiffin Station', capacity: 5 },
    { name: 'Beverages & Coffee Station', capacity: 8 }
  ];
  const stationMap = {};
  for (const st of stations) {
    const res = await client.query(`
      insert into public.kitchen_stations (restaurant_id, name, capacity, is_active)
      values ($1, $2, $3, true)
      on conflict (restaurant_id, name) do update set capacity = excluded.capacity
      returning id, name;
    `, [restaurantId, st.name, st.capacity]);
    stationMap[st.name] = res.rows[0].id;
  }
  console.log('✓ Kitchen stations:', Object.keys(stationMap));

  // 3. Menu Categories
  const categories = [
    { name: 'Breakfast Specials', name_ta: 'காலை உணவு', sort: 1 },
    { name: 'Dosa Varieties', name_ta: 'தோசை வகைகள்', sort: 2 },
    { name: 'Meals & Biryani', name_ta: 'மதிய உணவு', sort: 3 },
    { name: 'Evening Tiffin & Snacks', name_ta: 'மாலை சிற்றுண்டி', sort: 4 },
    { name: 'Beverages & Sweets', name_ta: 'பானங்கள் மற்றும் இனிப்புகள்', sort: 5 }
  ];
  const categoryMap = {};
  for (const cat of categories) {
    const res = await client.query(`
      insert into public.menu_categories (restaurant_id, name, name_ta, sort_order, is_active)
      values ($1, $2, $3, $4, true)
      on conflict (restaurant_id, name) do update set name_ta = excluded.name_ta, sort_order = excluded.sort_order
      returning id, name;
    `, [restaurantId, cat.name, cat.name_ta, cat.sort]);
    categoryMap[cat.name] = res.rows[0].id;
  }
  console.log('✓ Menu categories:', Object.keys(categoryMap));

  // 4. Menu Items
  const menuItems = [
    {
      name: 'Ghee Roast Dosa',
      name_ta: 'நெய் ரோஸ்ட் தோசை',
      desc: 'Crisp golden dosa roasted with pure country ghee, served with 3 coconut chutneys and hot sambar.',
      price: 95.00,
      prep: 8,
      veg: true,
      cat: 'Dosa Varieties',
      station: 'Dosa & Tawa Station',
      img: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Special Masala Dosa',
      name_ta: 'ஸ்பெஷல் மசாலா தோசை',
      desc: 'Traditional crisp crepe folded with spiced mashed potato bhaji, served with fresh coconut and tomato chutney.',
      price: 85.00,
      prep: 9,
      veg: true,
      cat: 'Dosa Varieties',
      station: 'Dosa & Tawa Station',
      img: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Podi Onion Uttapam',
      name_ta: 'பொடி வெங்காய ஊத்தப்பம்',
      desc: 'Thick soft rice pancake topped with fresh diced shallots and aromatic roasted gunpowder spice.',
      price: 90.00,
      prep: 10,
      veg: true,
      cat: 'Dosa Varieties',
      station: 'Dosa & Tawa Station',
      img: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Steamed Idli (2 Pcs) & Vada Combo',
      name_ta: 'இட்லி வடை காம்போ',
      desc: 'Melt-in-mouth steamed rice cakes and a crispy golden urad dal medu vada served with piping hot sambar.',
      price: 65.00,
      prep: 4,
      veg: true,
      cat: 'Breakfast Specials',
      station: 'Snacks & Tiffin Station',
      img: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Ghee Ven Pongal',
      name_ta: 'நெய் வெண் பொங்கல்',
      desc: 'Comforting porridge of rice and yellow moong dal tempered with black pepper, cumin, ginger, and fried cashews in pure ghee.',
      price: 75.00,
      prep: 5,
      veg: true,
      cat: 'Breakfast Specials',
      station: 'Snacks & Tiffin Station',
      img: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'South Indian Special Meals',
      name_ta: 'தென்னிந்திய ஸ்பெஷல் சாப்பாடு',
      desc: 'Complete banana leaf thali with Ponni rice, drumstick sambar, rasam, kootu, poriyal, appalam, curd, and sweet payasam.',
      price: 150.00,
      prep: 12,
      veg: true,
      cat: 'Meals & Biryani',
      station: 'Curry & Gravy Station',
      img: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Seeraga Samba Veg Biryani',
      name_ta: 'சீரக சம்பா வெஜ் பிரியாணி',
      desc: 'Fragrant aromatic Seeraga Samba rice dum-cooked with tender garden vegetables and traditional spices, served with onion raita.',
      price: 140.00,
      prep: 10,
      veg: true,
      cat: 'Meals & Biryani',
      station: 'Curry & Gravy Station',
      img: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Crispy Medu Vada (2 Pcs)',
      name_ta: 'மெது வடை (2)',
      desc: 'Deep-fried golden savoury doughnuts made from fluffy urad dal batter infused with crushed pepper and curry leaves.',
      price: 50.00,
      prep: 5,
      veg: true,
      cat: 'Evening Tiffin & Snacks',
      station: 'Snacks & Tiffin Station',
      img: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Degree Filter Coffee',
      name_ta: 'டிகிரி ஃபில்டர் காபி',
      desc: 'Authentic South Indian chicory blend coffee brewed in traditional brass filter and frothed with thick steaming milk.',
      price: 35.00,
      prep: 3,
      veg: true,
      cat: 'Beverages & Sweets',
      station: 'Beverages & Coffee Station',
      img: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Traditional Rava Kesari',
      name_ta: 'ரவா கேசரி',
      desc: 'Velvety semolina dessert simmered with saffron, ghee, cardamom, and crunchy roasted cashew nuts.',
      price: 55.00,
      prep: 4,
      veg: true,
      cat: 'Beverages & Sweets',
      station: 'Beverages & Coffee Station',
      img: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80'
    }
  ];

  for (let idx = 0; idx < menuItems.length; idx++) {
    const mi = menuItems[idx];
    await client.query(`
      insert into public.menu_items (
        restaurant_id, category_id, station_id, name, name_ta, description, price, prep_minutes, is_vegetarian, is_available, image_url, sort_order
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11)
      on conflict do nothing;
    `, [
      restaurantId,
      categoryMap[mi.cat],
      stationMap[mi.station],
      mi.name,
      mi.name_ta,
      mi.desc,
      mi.price,
      mi.prep,
      mi.veg,
      mi.img,
      idx + 1
    ]);
  }
  console.log('✓ Menu items seeded successfully!');

  // 5. Dining Tables & QR code tokens
  const tables = [
    { num: 'T01', cap: 2 },
    { num: 'T02', cap: 4 },
    { num: 'T03', cap: 4 },
    { num: 'T04', cap: 6 },
    { num: 'T05', cap: 4 },
    { num: 'T06', cap: 2 },
    { num: 'T07', cap: 6 },
    { num: 'T08', cap: 8 },
    { num: 'T09', cap: 4 },
    { num: 'T10', cap: 4 }
  ];

  for (const t of tables) {
    const resT = await client.query(`
      insert into public.dining_tables (restaurant_id, table_number, capacity, status, is_active)
      values ($1, $2, $3, 'available', true)
      on conflict (restaurant_id, table_number) do update set capacity = excluded.capacity
      returning id;
    `, [restaurantId, t.num, t.cap]);
    const tableId = resT.rows[0].id;

    // Create active table QR record
    await client.query(`
      insert into public.table_qr_codes (restaurant_id, table_id, token_hash, is_active)
      values ($1, $2, encode(digest('SERVORA-' || $3 || '-SECRET-TOKEN', 'sha256'), 'hex'), true)
      on conflict (token_hash) do nothing;
    `, [restaurantId, tableId, t.num]);
  }
  console.log('✓ Tables T01 through T10 & QR tokens seeded!');

  // 6. Demo staff accounts in auth.users and public.profiles with password "Password123!"
  const demoUsers = [
    {
      id: 'd0000000-0000-0000-0000-000000000001',
      email: 'admin@servora.com',
      phone: '+919876543210',
      fullName: 'Admin Manager',
      role: 'admin',
      station: null
    },
    {
      id: 'd0000000-0000-0000-0000-000000000002',
      email: 'kitchen@servora.com',
      phone: '+919876543211',
      fullName: 'Executive Chef',
      role: 'kitchen',
      station: stationMap['Dosa & Tawa Station']
    },
    {
      id: 'd0000000-0000-0000-0000-000000000003',
      email: 'waiter@servora.com',
      phone: '+919876543212',
      fullName: 'Floor Waiter',
      role: 'employee',
      station: null
    }
  ];

  for (const u of demoUsers) {
    // Insert into auth.users with encrypted password "Password123!"
    await client.query(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, phone, phone_confirmed_at
      ) values (
        $1,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        $2,
        crypt('Password123!', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        json_build_object('full_name', $3::text)::jsonb,
        now(),
        now(),
        $4,
        now()
      )
      on conflict (id) do update set
        email = excluded.email,
        encrypted_password = crypt('Password123!', gen_salt('bf')),
        email_confirmed_at = now(),
        updated_at = now(),
        phone = excluded.phone,
        phone_confirmed_at = now();
    `, [u.id, u.email, u.fullName, u.phone]);

    // Insert into public.profiles
    await client.query(`
      insert into public.profiles (
        id, restaurant_id, full_name, phone, email, role, approval_status, station_id, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, 'approved', $7, now(), now()
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
    `, [u.id, restaurantId, u.fullName, u.phone, u.email, u.role, u.station]);
  }

  console.log('✓ Demo accounts seeded for all roles with Password123!:');
  console.log('  - Admin:   admin@servora.com   / Password123!');
  console.log('  - Kitchen: kitchen@servora.com / Password123!');
  console.log('  - Waiter:  waiter@servora.com  / Password123!');

  await client.end();
  console.log('\n>>> SUPABASE DATABASE & DATA FULLY CONFIGURED! <<<');
}

seed().catch(e => {
  console.error('Seed error:', e);
  process.exit(1);
});

import { supabase } from './supabase';

// ==========================================
// 1. In-Memory & LocalStorage Caching Layer
// ==========================================
const MEM_CACHE = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds fresh TTL
const BG_STALE_MS = 15 * 1000;  // 15 seconds stale threshold for background revalidation

// Purge any stale dummy mock orders from localStorage and cache
export function sanitizeOrdersList(list: any[]): any[] {
  if (!Array.isArray(list)) return [];
  return list.filter((o: any) => {
    if (!o) return false;
    const id = String(o.id || '');
    const num = Number(o.order_number);
    const name = String(o.customer_name || '').toLowerCase();
    // Exclude mock orders ord-1049..ord-1042 or mock names
    if (id.startsWith('ord-104') || id.startsWith('ord-10') || id.startsWith('mock-')) return false;
    if (num >= 1042 && num <= 1049 && (name.includes('karthik') || name.includes('meenakshi') || name.includes('rajesh') || name.includes('priya'))) return false;
    if (name === 'karthik ramanathan' || name === 'meenakshi iyer' || name === 'rajesh ananth' || name === 'priya sundaram') return false;
    return true;
  });
}

// Auto-purge any stale dummy order cache from localStorage on app boot / reload
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    ['orders', 'orders_all', 'orders_active'].forEach(k => {
      const raw = localStorage.getItem('servora_cache_' + k);
      if (raw && (raw.includes('ord-104') || raw.includes('Karthik') || raw.includes('Meenakshi') || raw.includes('Rajesh'))) {
        localStorage.removeItem('servora_cache_' + k);
      }
    });
  }
} catch {}

export function getCached<T>(key: string, maxAgeMs = CACHE_TTL_MS): T | null {
  const mem = MEM_CACHE.get(key);
  if (mem && (Date.now() - mem.timestamp < maxAgeMs)) {
    if (key.startsWith('orders')) {
      return sanitizeOrdersList(mem.data as any[]) as T;
    }
    return mem.data as T;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem('servora_cache_' + key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data !== undefined) {
          let data = parsed.data;
          if (key.startsWith('orders')) {
            data = sanitizeOrdersList(data);
          }
          MEM_CACHE.set(key, { data, timestamp: parsed.timestamp || Date.now() });
          return data as T;
        }
      }
    }
  } catch {
    // ignore quota/disabled storage
  }
  if (mem && key.startsWith('orders')) {
    return sanitizeOrdersList(mem.data as any[]) as T;
  }
  return mem ? (mem.data as T) : null;
}

export function setCached<T>(key: string, data: T): void {
  if (data === undefined) return;
  const now = Date.now();
  MEM_CACHE.set(key, { data, timestamp: now });
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('servora_cache_' + key, JSON.stringify({ data, timestamp: now }));
    }
  } catch {
    // ignore
  }
}

export function invalidateCache(key?: string): void {
  if (key) {
    MEM_CACHE.delete(key);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('servora_cache_' + key);
        // Also remove variant keys like orders_active
        if (key === 'orders') {
          localStorage.removeItem('servora_cache_orders_active');
          localStorage.removeItem('servora_cache_orders_all');
          MEM_CACHE.delete('orders_active');
          MEM_CACHE.delete('orders_all');
        }
      }
    } catch {}
  } else {
    MEM_CACHE.clear();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('servora_cache_')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch {}
  }
}

export function matchTableLabels(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (cleanA === cleanB) return true;
  const numA = cleanA.replace(/\D/g, '');
  const numB = cleanB.replace(/\D/g, '');
  if (numA && numB && Number(numA) === Number(numB)) return true;
  return false;
}

export function lookupMenuItemPrice(
  itemIdOrName?: string | null,
  cachedList?: any[]
): number {
  if (!itemIdOrName) return 0;
  const list = (cachedList && cachedList.length > 0) ? cachedList : (getCached<any[]>('menu_all') || getCached<any[]>('menu_available') || DEFAULT_MENU);
  const target = String(itemIdOrName).trim().toLowerCase();
  const found = list.find((m: any) =>
    (m.id && String(m.id).toLowerCase() === target) ||
    (m.name && m.name.trim().toLowerCase() === target)
  );
  return found ? (Number(found.price) || 0) : 0;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs = 4500, fallbackVal?: T): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallbackVal as T);
    }, timeoutMs);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }).catch((err) => {
      clearTimeout(timer);
      console.warn('Network query error caught in withTimeout:', err);
      return fallbackVal as T;
    }),
    timeoutPromise
  ]);
}

// ==========================================
// 2. High-Quality Authentic Fallback Data
// ==========================================
export const DEFAULT_TABLES = [
  { id: 't1', table_number: 'T01', capacity: 4, status: 'occupied', is_active: true },
  { id: 't2', table_number: 'T02', capacity: 2, status: 'available', is_active: true },
  { id: 't3', table_number: 'T03', capacity: 4, status: 'available', is_active: true },
  { id: 't4', table_number: 'T04', capacity: 6, status: 'occupied', is_active: true },
  { id: 't5', table_number: 'T05', capacity: 2, status: 'available', is_active: true },
  { id: 't6', table_number: 'T06', capacity: 4, status: 'cleaning', is_active: true },
  { id: 't7', table_number: 'T07', capacity: 4, status: 'occupied', is_active: true },
  { id: 't8', table_number: 'T08', capacity: 2, status: 'available', is_active: true },
  { id: 't9', table_number: 'T09', capacity: 6, status: 'available', is_active: true },
  { id: 't10', table_number: 'T10', capacity: 4, status: 'occupied', is_active: true },
  { id: 't11', table_number: 'T11', capacity: 4, status: 'available', is_active: true },
  { id: 't12', table_number: 'T12', capacity: 2, status: 'available', is_active: true },
  { id: 't13', table_number: 'T13', capacity: 4, status: 'available', is_active: true },
  { id: 't14', table_number: 'T14', capacity: 6, status: 'cleaning', is_active: true },
  { id: 't15', table_number: 'T15', capacity: 2, status: 'available', is_active: true },
  { id: 't16', table_number: 'T16', capacity: 4, status: 'available', is_active: true },
  { id: 't17', table_number: 'T17', capacity: 4, status: 'occupied', is_active: true },
  { id: 't18', table_number: 'T18', capacity: 2, status: 'available', is_active: true },
  { id: 't19', table_number: 'T19', capacity: 6, status: 'available', is_active: true },
  { id: 't20', table_number: 'T20', capacity: 4, status: 'available', is_active: true }
];

export const DEFAULT_CUSTOMERS: any[] = [];

export const DEFAULT_MENU = [
  { id: 'm1', name: 'Ghee Roast Dosa', name_ta: 'நெய் ரோஸ்ட் தோசை', description: 'Crisp golden brown crepe drizzled with pure aromatic desi ghee.', price: 120, category_name: 'Tiffin', is_available: true, is_vegetarian: true, prep_minutes: 8, image_url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=240&auto=format&fit=crop&q=80' },
  { id: 'm2', name: 'Special Masala Dosa', name_ta: 'மசாலா தோசை', description: 'Crispy dosa folded with spiced potato masala stuffing and chutney trio.', price: 130, category_name: 'Tiffin', is_available: true, is_vegetarian: true, prep_minutes: 10, image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=240&auto=format&fit=crop&q=80' },
  { id: 'm3', name: 'Idli (2 Pcs)', name_ta: 'இட்லி', description: 'Steamed fluffy rice cakes served with sambar and traditional chutneys.', price: 60, category_name: 'Tiffin', is_available: true, is_vegetarian: true, prep_minutes: 5, image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=240&auto=format&fit=crop&q=80' },
  { id: 'm4', name: 'Medu Vada (1 Pc)', name_ta: 'மெது வடை', description: 'Crispy lentil fritter freshly fried with curry leaves and peppercorns.', price: 40, category_name: 'Tiffin', is_available: true, is_vegetarian: true, prep_minutes: 5, image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=240&auto=format&fit=crop&q=80' },
  { id: 'm5', name: 'Ven Pongal', name_ta: 'வெண் பொங்கல்', description: 'Creamy rice and moong dal tempered with ghee, cashews, and black pepper.', price: 90, category_name: 'Tiffin', is_available: true, is_vegetarian: true, prep_minutes: 6, image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=240&auto=format&fit=crop&q=80' },
  { id: 'm6', name: 'Poori Masala (2 Pcs)', name_ta: 'பூரி மசாலா', description: 'Puffed golden pooris served with flavourful south style potato sagu.', price: 110, category_name: 'Tiffin', is_available: true, is_vegetarian: true, prep_minutes: 8, image_url: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=240&auto=format&fit=crop&q=80' },
  { id: 'm7', name: 'Mini Tiffin Combo', name_ta: 'மினி டிபன்', description: '1 Idli, 1 Vada, Mini Masala Dosa, Mini Pongal, Kesari, Sambar & 3 Chutneys.', price: 180, category_name: 'Tiffin', is_available: true, is_vegetarian: true, prep_minutes: 12, image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=240&auto=format&fit=crop&q=80' },
  { id: 'm8', name: 'Madras Filter Coffee', name_ta: 'பில்டர் காபி', description: 'Traditional South Indian chicory-blend coffee frothed to perfection in a davara.', price: 45, category_name: 'Beverages', is_available: true, is_vegetarian: true, prep_minutes: 4, image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=240&auto=format&fit=crop&q=80' },
  { id: 'm9', name: 'South Indian Thali Meals', name_ta: 'சாப்பாடு', description: 'Unlimited rice, sambar, rasam, kootu, poriyal, appalam, curd, and payasam.', price: 210, category_name: 'Meals', is_available: true, is_vegetarian: true, prep_minutes: 10, image_url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=240&auto=format&fit=crop&q=80' },
  { id: 'm10', name: 'Seeraga Samba Veg Biryani', name_ta: 'சீரக சம்பா பிரியாணி', description: 'Fragrant Seeraga Samba rice dum cooked with vegetables and special spices.', price: 195, category_name: 'Meals', is_available: true, is_vegetarian: true, prep_minutes: 12, image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=240&auto=format&fit=crop&q=80' }
];

export const DEFAULT_ORDERS: any[] = [];

// ==========================================
// 3. Stale-While-Revalidate Data Fetchers
// ==========================================

export async function getMenu(includeUnavailable = false, forceRefresh = false) {
  const cacheKey = includeUnavailable ? 'menu_all' : 'menu_available';
  const cached = getCached<any[]>(cacheKey) || getCached<any[]>('menu_all');

  if (cached && cached.length > 0 && !forceRefresh) {
    // Check if background refresh is needed
    const mem = MEM_CACHE.get(cacheKey);
    if (!mem || Date.now() - mem.timestamp > BG_STALE_MS) {
      fetchMenuFromDb(includeUnavailable).then(fresh => {
        if (fresh && fresh.length > 0) setCached(cacheKey, fresh);
      }).catch(() => {});
    }
    return cached;
  }

  if (!supabase) return cached || DEFAULT_MENU;

  const result = await withTimeout(fetchMenuFromDb(includeUnavailable), 4500, cached || DEFAULT_MENU);
  if (result && result.length > 0) {
    setCached(cacheKey, result);
    return result;
  }
  return cached || DEFAULT_MENU;
}

async function fetchMenuFromDb(includeUnavailable: boolean) {
  if (!supabase) return [];
  let query = supabase
    .from('menu_items')
    .select('id,name,name_ta,description,price,category_id,station_id,prep_minutes,is_vegetarian,is_available,image_url,menu_categories(name),kitchen_stations(name)')
    .is('deleted_at', null)
    .order('sort_order');
  if (!includeUnavailable) query = query.eq('is_available', true);
  const { data, error } = await query;
  if (error) throw error;
  const mapped = (data || []).map((x: any) => ({
    ...x,
    category_name: x.menu_categories?.name,
    station_name: x.kitchen_stations?.name
  })) as any[];
  const seenNames = new Set<string>();
  return mapped.filter(item => {
    const key = (item.name || '').trim().toLowerCase();
    if (!key) return true;
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
}

export async function getOrders(opts: { activeOnly?: boolean } = {}, forceRefresh = false) {
  const cacheKey = opts.activeOnly ? 'orders_active' : 'orders_all';
  const cached = getCached<any[]>(cacheKey);

  if (cached && !forceRefresh) {
    const mem = MEM_CACHE.get(cacheKey);
    if (!mem || Date.now() - mem.timestamp > BG_STALE_MS) {
      fetchOrdersFromDb(opts).then(fresh => {
        if (fresh !== null && fresh !== undefined) {
          setCached(cacheKey, fresh);
          if (!opts.activeOnly) setCached('orders_all', fresh);
        }
      }).catch(() => {});
    }
    return cached;
  }

  if (!supabase) return cached || [];

  try {
    const fresh = await fetchOrdersFromDb(opts);
    if (fresh !== null && fresh !== undefined) {
      setCached(cacheKey, fresh);
      if (!opts.activeOnly) setCached('orders_all', fresh);
      return fresh;
    }
  } catch (err) {
    console.error('Error fetching orders from DB:', err);
  }
  return cached || [];
}

async function fetchOrdersFromDb(opts: { activeOnly?: boolean } = {}) {
  if (!supabase) return [];
  let query = supabase
    .from('orders')
    .select('id,order_number,table_label,customer_name,customer_phone,status,payment_status,subtotal,tax,discount,service_charge,total,created_at,estimated_minutes,dining_session_id,dining_sessions(persons),order_items(id,item_name,quantity,unit_price,line_total,note,status,station_id,menu_item_id)');
  if (opts.activeOnly) query = query.not('status', 'in', '(completed,cancelled,served)');
  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error) throw error;

  // Rapidly associate image_url and fallback price from cached menu items
  const cachedMenu = getCached<any[]>('menu_all') || getCached<any[]>('menu_available') || DEFAULT_MENU;
  const imageMap = new Map<string, string>();
  const priceMap = new Map<string, number>();
  for (const m of cachedMenu) {
    if (m.id) {
      if (m.image_url) imageMap.set(m.id, m.image_url);
      if (Number(m.price) > 0) priceMap.set(m.id, Number(m.price));
    }
    if (m.name) {
      const lowerName = m.name.trim().toLowerCase();
      if (m.image_url) imageMap.set(lowerName, m.image_url);
      if (Number(m.price) > 0) priceMap.set(lowerName, Number(m.price));
    }
  }

  const cleaned = (data || []).map((o: any) => {
    const rawItems = o.order_items || [];
    const items = rawItems.map((it: any) => {
      const qty = it.quantity || 1;
      let unit = Number(it.unit_price) || 0;
      if (unit <= 0) {
        unit = (it.menu_item_id && priceMap.get(it.menu_item_id)) ||
               (it.item_name && priceMap.get(it.item_name.trim().toLowerCase())) ||
               lookupMenuItemPrice(it.menu_item_id, cachedMenu) ||
               lookupMenuItemPrice(it.item_name, cachedMenu) ||
               0;
      }
      let line = Number(it.line_total) || 0;
      if (line <= 0) {
        line = qty * unit;
      }
      return {
        ...it,
        quantity: qty,
        unit_price: unit,
        line_total: line,
        image_url:
          (it.menu_item_id && imageMap.get(it.menu_item_id)) ||
          (it.item_name && imageMap.get(it.item_name.trim().toLowerCase())) ||
          it.image_url ||
          null
      };
    });

    const itemsSum = items.reduce((s: number, x: any) => s + (Number(x.line_total) || 0), 0);
    const subtotal = Number(o.subtotal) > 0 ? Number(o.subtotal) : itemsSum;
    const tax = Number(o.tax) > 0 ? Number(o.tax) : Number((subtotal * 0.05).toFixed(2));
    const totalAmount = Number(o.total) > 0 ? Number(o.total) : Number((subtotal + tax).toFixed(2));

    return {
      ...o,
      subtotal,
      tax,
      total: totalAmount,
      total_amount: totalAmount,
      guests: o.dining_sessions?.persons || o.guests || 2,
      order_items: items
    };
  });
  return sanitizeOrdersList(cleaned);
}

export async function getTables(forceRefresh = false) {
  const cached = getCached<any[]>('tables');
  if (cached && cached.length > 0 && !forceRefresh) {
    const mem = MEM_CACHE.get('tables');
    if (!mem || Date.now() - mem.timestamp > BG_STALE_MS) {
      fetchTablesFromDb().then(fresh => {
        if (fresh && fresh.length > 0) setCached('tables', fresh);
      }).catch(() => {});
    }
    return cached;
  }

  if (!supabase) return cached || DEFAULT_TABLES;

  const result = await withTimeout(fetchTablesFromDb(), 4500, cached || DEFAULT_TABLES);
  if (result && result.length > 0) {
    setCached('tables', result);
    return result;
  }
  return cached || DEFAULT_TABLES;
}

async function fetchTablesFromDb() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('dining_tables')
    .select('id, table_number, capacity, status, is_active, table_qr_codes(id, token_hash, is_active)')
    .eq('is_active', true)
    .order('table_number');
  if (error) return [];
  return data || [];
}

export async function getCustomers(forceRefresh = false) {
  const cached = getCached<any[]>('customers');
  if (cached && !forceRefresh) {
    const mem = MEM_CACHE.get('customers');
    if (!mem || Date.now() - mem.timestamp > BG_STALE_MS) {
      fetchCustomersFromDb().then(fresh => {
        if (fresh !== null && fresh !== undefined) setCached('customers', fresh);
      }).catch(() => {});
    }
    return cached;
  }

  if (!supabase) return cached || [];

  try {
    const fresh = await fetchCustomersFromDb();
    if (fresh !== null && fresh !== undefined) {
      setCached('customers', fresh);
      return fresh;
    }
  } catch (err) {
    console.error('Error fetching customers from DB:', err);
  }
  return cached || [];
}

async function fetchCustomersFromDb() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('customer_profiles').select('*').order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

export async function getStaffList(forceRefresh = false) {
  const cached = getCached<any[]>('staff');
  if (cached && cached.length > 0 && !forceRefresh) {
    return cached;
  }
  if (!supabase) return cached || [];
  const result = await withTimeout(
    (async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, phone, role, approval_status, station_id, kitchen_stations(name)').order('full_name');
      if (error) return [];
      return data || [];
    })(),
    4500,
    cached || []
  );
  if (result && result.length > 0) setCached('staff', result);
  return result;
}

export async function getStations(forceRefresh = false) {
  const cached = getCached<any[]>('stations');
  if (cached && cached.length > 0 && !forceRefresh) return cached;
  if (!supabase) return cached || [];
  const result = await withTimeout(
    (async () => {
      const { data, error } = await supabase.from('kitchen_stations').select('id,name,is_active').eq('is_active', true).order('name');
      if (error) return [];
      return data || [];
    })(),
    4500,
    cached || []
  );
  if (result && result.length > 0) setCached('stations', result);
  return result;
}

export async function getCategories(forceRefresh = false) {
  const cached = getCached<any[]>('categories');
  if (cached && cached.length > 0 && !forceRefresh) return cached;
  if (!supabase) return cached || [];
  const result = await withTimeout(
    (async () => {
      const { data, error } = await supabase.from('menu_categories').select('*').eq('is_active', true).order('sort_order');
      if (error) return [];
      return data || [];
    })(),
    4500,
    cached || []
  );
  if (result && result.length > 0) setCached('categories', result);
  return result;
}

export async function getAttendanceRecords(forceRefresh = false) {
  const cached = getCached<any[]>('attendance');
  if (cached && cached.length > 0 && !forceRefresh) return cached;
  if (!supabase) return cached || [];
  const result = await withTimeout(
    (async () => {
      const { data, error } = await supabase.from('attendance_records').select('*, profiles(full_name, role, email)').order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    })(),
    4500,
    cached || []
  );
  if (result && result.length > 0) setCached('attendance', result);
  return result;
}

export async function getLeaveRequests(forceRefresh = false) {
  const cached = getCached<any[]>('leaves');
  if (cached && cached.length > 0 && !forceRefresh) return cached;
  if (!supabase) return cached || [];
  const result = await withTimeout(
    (async () => {
      const { data, error } = await supabase.from('leave_requests').select('*').order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    })(),
    4500,
    cached || []
  );
  if (result && result.length > 0) setCached('leaves', result);
  return result;
}

// ==========================================
// 4. Mutations & Automatic Cache Busting
// ==========================================

export async function updateOrderPaymentStatus(
  orderId: string,
  paymentStatus: 'paid' | 'unpaid' | 'pending' = 'paid',
  paymentMethod: string = 'cash',
  markCompleted = true
) {
  if (!supabase) throw new Error('Supabase not configured');

  // Try RPC first for guaranteed security definer update
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('mark_order_payment', {
      p_order_id: orderId,
      p_payment_status: paymentStatus,
      p_payment_method: paymentMethod,
      p_mark_completed: markCompleted
    });
    if (!rpcErr && rpcRes?.success) {
      invalidateCache('orders');
      invalidateCache('orders_all');
      invalidateCache('orders_active');
      return rpcRes;
    }
  } catch (e) {
    console.warn('mark_order_payment RPC fallback to direct update:', e);
  }

  const payload: any = {
    payment_status: paymentStatus,
    updated_at: new Date().toISOString()
  };
  if (markCompleted && paymentStatus === 'paid') {
    payload.status = 'completed';
  }

  // Attempt direct update; if payment_method column exists, include it gracefully
  let { data, error } = await supabase.from('orders').update({ ...payload, payment_method: paymentMethod }).eq('id', orderId).select();
  if (error) {
    const res = await supabase.from('orders').update(payload).eq('id', orderId).select();
    data = res.data;
    error = res.error;
  }
  if (error) throw error;

  invalidateCache('orders');
  invalidateCache('orders_all');
  invalidateCache('orders_active');
  return data;
}

export async function updateOrderStatus(orderId: string, status: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId).select();
  if (error) throw error;

  // Also sync order_items status for this order in Supabase
  try {
    const itemStatus = ['ready', 'ready_for_serving', 'ready_for_collection'].includes(status)
      ? 'ready'
      : ['served', 'completed'].includes(status)
        ? 'served'
        : ['preparing', 'in_kitchen', 'accepted'].includes(status)
          ? 'preparing'
          : status;
    await supabase.from('order_items').update({ status: itemStatus }).eq('order_id', orderId);
  } catch (e) {
    console.warn('Could not sync order_items status in DB:', e);
  }

  invalidateCache('orders');
  invalidateCache('orders_all');
  invalidateCache('orders_active');
  return data;
}

export async function updateTicketItem(itemId: string, status: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('update_kitchen_item_status', { p_item_id: itemId, p_status: status });
  if (error || data?.error) throw error || new Error(data?.error);
  invalidateCache('orders');
}

export async function saveMenuItem(input: any) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('menu_items').insert(input);
  if (error) throw error;
  invalidateCache('menu_all');
  invalidateCache('menu_available');
}

export async function deleteMenuItem(id: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('menu_items').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  invalidateCache('menu_all');
  invalidateCache('menu_available');
}

export async function resolveTableToken(token: string): Promise<{ valid: boolean; table_number?: string; is_open?: boolean; restaurant?: string }> {
  if (!supabase) return { valid: false };
  const { data, error } = await supabase.rpc('resolve_table_token', { p_token: token });
  if (error) throw error;
  return (data || { valid: false }) as any;
}

export async function updateLeaveRequestStatus(id: string, status: string, rejectionReason?: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const payload: any = { status, updated_at: new Date().toISOString() };
  if (rejectionReason !== undefined) {
    payload.rejection_reason = rejectionReason;
  }
  const { data, error } = await supabase.from('leave_requests').update(payload).eq('id', id).select();
  if (error) throw error;
  invalidateCache('leaves');
  return data;
}

export async function submitLeaveRequest(payload: any) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('leave_requests').insert(payload).select();
  if (error) throw error;
  invalidateCache('leaves');
  return data;
}

export async function checkInStaff(employeeId: string, _code: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const now = new Date();
  const workDate = now.toISOString().split('T')[0];

  const { data: existing } = await supabase
    .from('attendance_records')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();

  invalidateCache('attendance');

  if (existing) {
    const { data, error } = await supabase
      .from('attendance_records')
      .update({ check_in: now.toISOString(), status: 'present', verification_method: 'qr' })
      .eq('id', existing.id)
      .select();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert({
      employee_id: employeeId,
      work_date: workDate,
      check_in: now.toISOString(),
      status: 'present',
      verification_method: 'qr'
    })
    .select();
  if (error) throw error;
  return data;
}

export async function checkOutStaff(employeeId: string, _code: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const now = new Date();
  const workDate = now.toISOString().split('T')[0];

  invalidateCache('attendance');

  const { data: existing } = await supabase
    .from('attendance_records')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('attendance_records')
      .update({ check_out: now.toISOString() })
      .eq('id', existing.id)
      .select();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert({
      employee_id: employeeId,
      work_date: workDate,
      check_out: now.toISOString(),
      status: 'present',
      verification_method: 'qr'
    })
    .select();
  if (error) throw error;
  return data;
}

export async function saveManualAttendance({
  employeeId,
  workDate,
  checkIn,
  checkOut,
  status
}: {
  employeeId: string;
  workDate: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: 'present' | 'late' | 'absent';
}) {
  if (!supabase) throw new Error('Supabase not configured');
  invalidateCache('attendance');
  const { data: existing } = await supabase
    .from('attendance_records')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();

  const payload: any = {
    employee_id: employeeId,
    work_date: workDate,
    status,
    verification_method: 'admin_adjustment',
    updated_at: new Date().toISOString()
  };
  if (checkIn !== undefined) payload.check_in = checkIn;
  if (checkOut !== undefined) payload.check_out = checkOut;

  if (existing) {
    const { data, error } = await supabase
      .from('attendance_records')
      .update(payload)
      .eq('id', existing.id)
      .select();
    if (error) throw error;
    return data;
  } else {
    payload.created_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('attendance_records')
      .insert(payload)
      .select();
    if (error) throw error;
    return data;
  }
}

// ==========================================
// 5. Order Cancellation Request & Approval System
// ==========================================

export interface CancellationRequestInfo {
  id: string;
  orderId: string;
  orderNumber: string | number;
  tableLabel: string;
  customerName: string;
  reason: string;
  status: string;
  createdAt: string;
}

export type CancellationStatus = 'none' | 'pending' | 'approved' | 'rejected';

function friendlyDbError(err: any, fallback: string): Error {
  const msg = String(err?.message || '').replace(/^.*?(ERROR:\s*)/i, '').trim();
  return new Error(msg || fallback);
}

/** Customer asks to cancel their own order. Validated server-side with the order access token. */
export async function submitOrderCancellationRequest(params: {
  orderId: string;
  accessToken: string;
  reason: string;
}) {
  if (!supabase) throw new Error('Supabase client is not initialized.');
  if (!params.accessToken) throw new Error('Your order session has expired. Please ask a staff member to cancel the order.');
  const { data, error } = await supabase.rpc('request_order_cancellation', {
    p_order_id: params.orderId,
    p_access_token: params.accessToken,
    p_reason: params.reason || 'Customer requested cancellation'
  });
  if (error) throw friendlyDbError(error, 'Could not send the cancellation request.');
  invalidateCache('order_cancel_requests');
  return data;
}

/** Customer: outcome of the latest cancellation request for their order. */
export async function getOrderCancellationStatus(orderId: string, accessToken: string): Promise<{ status: CancellationStatus; reason?: string; decisionNote?: string }> {
  if (!supabase || !orderId || !accessToken) return { status: 'none' };
  const { data, error } = await supabase.rpc('get_order_cancel_status', { p_order_id: orderId, p_access_token: accessToken });
  if (error || !data) return { status: 'none' };
  return { status: (data.status || 'none') as CancellationStatus, reason: data.reason, decisionNote: data.decision_note };
}

/** Staff (kitchen, billing counter, admin): requests waiting for a decision. */
export async function getPendingCancellationRequests(): Promise<CancellationRequestInfo[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('order_cancel_requests')
    .select('id, order_id, order_number, table_label, customer_name, reason, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    orderId: r.order_id,
    orderNumber: r.order_number ?? '',
    tableLabel: r.table_label || '-',
    customerName: r.customer_name || 'Guest',
    reason: r.reason || 'Customer requested cancellation',
    status: r.status,
    createdAt: r.created_at
  }));
}

async function decideCancellation(requestId: string, approve: boolean, note?: string) {
  if (!supabase) throw new Error('Supabase client is not initialized.');
  if (!requestId) throw new Error('Missing cancellation request.');
  const { error } = await supabase.rpc('decide_order_cancellation', { p_request_id: requestId, p_approve: approve, p_note: note || null });
  if (error) throw friendlyDbError(error, 'Could not update the cancellation request.');
  invalidateCache('order_cancel_requests');
  invalidateCache('orders');
  invalidateCache('orders_all');
  invalidateCache('orders_active');
  invalidateCache('dining_tables');
}

/** Approve: the server cancels the order and its items and frees the table if nothing else is active. */
export async function approveOrderCancellation(_orderId: string, requestId: string, _tableLabel?: string) {
  await decideCancellation(requestId, true);
}

export async function rejectOrderCancellation(requestId: string, reason?: string) {
  await decideCancellation(requestId, false, reason || 'Preparation already finished or food served');
}


/** Billing counter: settle one or more orders. Totals are calculated by the server. */
export async function settleTableBill(orderIds: string[], paymentMode: string, discount = 0) {
  if (!supabase) throw new Error('Supabase client is not initialized.');
  const { data, error } = await supabase.rpc('settle_table_bill', {
    p_order_ids: orderIds,
    p_payment_method: paymentMode,
    p_discount: discount
  });
  if (error) throw friendlyDbError(error, 'Could not settle the bill.');
  invalidateCache('orders');
  invalidateCache('orders_all');
  invalidateCache('orders_active');
  invalidateCache('dining_tables');
  return data as { success: boolean; bill_number: number; subtotal: number; tax: number; discount: number; total: number };
}

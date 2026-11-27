import { createClient } from '@supabase/supabase-js';

// Credentials come only from environment variables (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// Set them in .env locally and in the Vercel project settings for deployment.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR_PROJECT'));
export const supabase = url && anonKey && supabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export type AppRole = 'admin' | 'kitchen' | 'employee' | 'customer';
export type StaffProfile = {
  id: string;
  full_name: string;
  phone: string;
  role: AppRole;
  approval_status: string;
  restaurant_id: string;
  station_id?: string | null;
  email?: string;
  created_at?: string;
};
export type MenuItem = { id: string; name: string; name_ta?: string | null; description?: string | null; price: number; category_id?: string | null; category_name?: string; station_id?: string | null; station_name?: string; prep_minutes: number; is_vegetarian: boolean; is_available: boolean; image_url?: string | null };
export type CartLine = { item: MenuItem; quantity: number; note: string };
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);
